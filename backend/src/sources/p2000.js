// P2000 — het publieke pagernetwerk van de Nederlandse hulpdiensten
// (brandweer/politie/ambulance). Geen officiële overheids-API; deze feed komt
// van een vrijwilligersproject (Erwin Kooij, Brandweer Berkel-Enschot) dat al
// jaren draait en ook de basis vormt voor de bekende Home Assistant
// "p2000"-custom-component (cyberjunky). https://p2000.brandweer-berkel-enschot.nl/
//
// Op verzoek van Lex ("categorie lokaal: Brandweer, politie, ambulance,
// lifeliner"). Voor Lifeliner (traumahelikopters) zie sources/lifeliner.js —
// dat is losse vluchtdata, geen P2000-tekstbericht.
//
// EERLIJKE WAARSCHUWING (zelfde soort voorbehoud als bij Blitzortung/
// Meteoalarm): de sandbox hier heeft geen uitgaande internettoegang, dus de
// exacte XML-tagnamen van déze specifieke feed zijn nooit tegen een echte
// live response getest. Op basis van (a) hoe de Home Assistant-component het
// uitleest (entry.message/entry.code/entry.lat/entry.lon/entry.regname/
// entry.dienst — feedparser plat-slaat custom tags naar deze veldnamen) en
// (b) standaard RSS 2.0-structuur is dit best-effort geschreven met meerdere
// fallback-regexen per veld, plus een try/catch per <item> zodat één
// afwijkend bericht niet de hele poll laat mislukken. Bij opstarten loggen we
// de eerste paar ruwe items naar de console ("[weer] p2000: voorbeelditem") —
// check die op je eigen PC. Zie je daar wél lat/lon en een duidelijke
// dienst-vermelding? Dan werkt de filtering. Zie je alleen "geen coördinaten"
// of rare tekst? Dan moet de regex hieronder bijgesteld worden op basis van
// wat je daadwerkelijk ziet.
import { makeSignal, afstandKm } from '../normalize.js';

const FEED_URL = 'http://p2000.brandweer-berkel-enschot.nl/homeassistant/rss.asp';

// "Alleen bij mij in de buurt" (Lex' eigen keuze) — bewust een stuk kleiner
// dan Blitzortung's 2000km: dit is per definitie lokale hulp, een melding
// aan de andere kant van het land is niet relevant. Net als bij Blitzortung
// een eerste inschatting, niet live tegen Lex' eigen regio geverifieerd —
// makkelijk bij te stellen als het te krap/ruim blijkt.
const STRAAL_KM = 25;

// Alleen deze disciplines tonen (Lex vroeg specifiek naar brandweer/politie/
// ambulance) — filtert P2000-verkeer van bijv. de KNRM/reddingsbrigade of
// gemeentelijke diensten die ook wel eens op dit netwerk voorbijkomen, en ook
// de dagelijkse teststatusberichten ("TESTOPROEP").
const DISCIPLINE_PATRONEN = [
  { key: 'brandweer', re: /brandweer/i },
  { key: 'politie', re: /politie/i },
  { key: 'ambulance', re: /ambulance/i },
];

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function tag(xml, naam) {
  const match = xml.match(new RegExp(`<${naam}[^>]*>([\\s\\S]*?)</${naam}>`, 'i'));
  if (!match) return null;
  // CDATA-blokken (veel RSS-feeds stoppen de tekst hierin) eerst uitpakken.
  const cdata = match[1].match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return decodeEntities(cdata ? cdata[1] : match[1]);
}

function splitsItems(xml) {
  const blokken = [];
  const re = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = re.exec(xml))) blokken.push(m[1]);
  return blokken;
}

// Meerdere pogingen voor coördinaten — welke vorm de feed daadwerkelijk
// gebruikt is niet vooraf zeker (zie voorbehoud bovenaan dit bestand).
function haalCoordinaten(blok) {
  const georss = blok.match(/<georss:point>\s*([-\d.]+)[,\s]+([-\d.]+)\s*<\/georss:point>/i);
  if (georss) return { lat: Number(georss[1]), lon: Number(georss[2]) };

  const geoLat = tag(blok, 'geo:lat');
  const geoLon = tag(blok, 'geo:long') ?? tag(blok, 'geo:lon');
  if (geoLat && geoLon) return { lat: Number(geoLat), lon: Number(geoLon) };

  const lat = tag(blok, 'lat');
  const lon = tag(blok, 'lon');
  if (lat && lon) return { lat: Number(lat), lon: Number(lon) };

  return null;
}

function haalDiscipline(tekst) {
  return DISCIPLINE_PATRONEN.find((d) => d.re.test(tekst)) ?? null;
}

// ---- Klok-fix, 2026-08-21 ---------------------------------------------------
// Op verzoek van Lex ("de klok bij hulpdiensten loopt een uur voor"). Root
// cause gevonden via een live curl tegen de feed zelf (deze sandbox heeft
// geen internettoegang, dus Lex heeft dit zelf op de Minisforum gedraaid):
// elk bericht draagt een <pubDate> met een VASTE "+0100"-tijdzone, bijv.
// "Fri, 21 Aug 2026 19:52:40 +0100" — maar de klokcijfers zelf ("19:52:40")
// zijn al gewoon de actuele Nederlandse tijd (op dat moment 19:52 CEST). De
// feed vergeet dus simpelweg zomertijd/DST toe te passen op het label, het
// blijft altijd op wintertijd (+0100) staan. `new Date(pubDate)` gelooft dat
// label kritiekloos en berekent daardoor een UTC-moment dat exact 1 uur te
// laat is (want +0100 i.p.v. het eigenlijk bedoelde +0200) — en dat komt er
// na onze eigen (wél correcte) omzetting terug als "1 uur te laat/voor" op
// het scherm. Bevestigd exact 1 uur, niet incidenteel: dit is dus een
// structurele fout in de feed zelf, geen eenmalige glitch.
//
// Fix: het tijdzone-label van de feed volledig negeren. In plaats daarvan de
// kale klokcijfers (jaar/maand/dag/uur/minuut/seconde) eruit plukken en die
// zelf als Europe/Amsterdam-wandklokstijd interpreteren — DST-bewust, via
// Node's eigen ingebouwde tijdzonedatabase (Intl), dus geen aparte library
// nodig en werkt vanzelf correct in zowel winter- als zomertijd.
const MAAND_NAAR_NUMMER = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// Interpreteert de gegeven kalenderdatum/tijd ALS Europe/Amsterdam-lokale
// tijd (dus zoals een klok aan de muur daar zou aangeven) en geeft het
// bijbehorende, correcte UTC-tijdstip terug — automatisch met de juiste
// zomer-/wintertijd-verschuiving voor die specifieke datum.
function amsterdamseWandklokNaarUtc(jaar, maand, dag, uur, minuut, seconde) {
  // Canonieke truc zonder library: eerst een "gok" nemen alsof de cijfers al
  // UTC waren, dan via Intl opvragen hoe laat het op dát UTC-moment in
  // Amsterdam zou zijn, en het verschil met de bedoelde tijd terugtrekken.
  // Werkt omdat het Amsterdamse offset (+1 of +2) rond deze datum vrijwel
  // nooit binnen dezelfde dag omslaat.
  const gokUtcMs = Date.UTC(jaar, maand - 1, dag, uur, minuut, seconde);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Amsterdam',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const delen = Object.fromEntries(formatter.formatToParts(gokUtcMs).map((d) => [d.type, d.value]));
  const amsterdamAlsUtcMs = Date.UTC(
    Number(delen.year),
    Number(delen.month) - 1,
    Number(delen.day),
    Number(delen.hour) === 24 ? 0 : Number(delen.hour), // Intl geeft soms "24" i.p.v. "00" bij middernacht
    Number(delen.minute),
    Number(delen.second)
  );
  const verschilMs = amsterdamAlsUtcMs - gokUtcMs; // hoeveel de gok "te vroeg" was t.o.v. wat Amsterdam op dat moment toont
  return new Date(gokUtcMs - verschilMs);
}

// Haalt de kale kalendercijfers uit de feed's pubDate-string (RFC822-vorm,
// bijv. "Fri, 21 Aug 2026 19:52:40 +0100") en negeert daarbij bewust het
// tijdzone-label aan het eind — zie toelichting hierboven. Geeft `null`
// terug als het patroon niet herkend wordt (val dan terug op de servertijd).
function parseFeedPubDateAlsAmsterdamseTijd(pubDate) {
  if (!pubDate) return null;
  const m = pubDate.match(/(\d{1,2})\s+([A-Za-z]{3})\w*\s+(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, dagStr, maandStr, jaarStr, uurStr, minStr, secStr] = m;
  const maand = MAAND_NAAR_NUMMER[maandStr.slice(0, 3).toLowerCase()];
  if (!maand) return null;
  return amsterdamseWandklokNaarUtc(
    Number(jaarStr), maand, Number(dagStr), Number(uurStr), Number(minStr), Number(secStr)
  );
}

// ---- Dedupliceren op incidentnummer, 2026-08-19 ----------------------------
// Op verzoek van Lex ("Dubbelen?") na live meekijken: bij één incident wordt
// vaak niet één, maar meerdere P2000-berichten uitgestuurd — één per
// gealarmeerde eenheid/capcode, met identieke locatie/omschrijving maar een
// ander capcode-nummer. Bevestigd in Lex' eigen screenshots: "AMBU 17165
// Ringstraat ... bon 127957" kwam 2x voorbij met verschillende capcodes
// (1420999/1420065), en "BRT-04 ... Oudedijk Rotterdam 170931" ook 2x
// (1400999/1400311) — zelfde bon-/incidentnummer aan het eind van de titel.
// Dat incidentnummer (na "bon " als dat er staat, anders het laatste losse
// getal in de titel) is dus de juiste dedupliceer-sleutel, niet het
// capcode/guid. Items zonder herkenbaar incidentnummer worden niet
// samengevoegd (val terug op hun eigen guid) — beter een enkele keer
// per ongeluk dubbel dan onterecht twee losse incidenten samenvoegen.
function incidentSleutel(titel) {
  const bon = titel.match(/\bbon\s+(\d{4,8})\b/i);
  if (bon) return bon[1];
  const laatsteGetal = titel.match(/(\d{4,8})\s*$/);
  return laatsteGetal ? laatsteGetal[1] : null;
}

// ---- Straat + plaats uit de ruwe tekst halen, 2026-08-19 -------------------
// Lex wees erop dat het kaartje in de Meldingen-lijst met alleen het
// bonnummer ("Hulpdiensten - 128054") niets zei over wát/waar het incident
// was — in tegenstelling tot andere categorieën, waar de titel zelf al
// beschrijvend is ("Droogte - Uganda"). De volledige tekst stond wél al in
// detail.subtitel, zichtbaar in de kaart-popup, maar niet in de lijst zelf.
// Beste-poging-extractie (geen gegarandeerd formaat): een postcode
// (1234AB, met/zonder spatie) is het scharnierpunt — de straatnaam staat
// ervoor, de plaatsnaam erna. Straat = de aaneengesloten woorden vóór de
// postcode tot het eerste woord met een cijfer/haakje (capcode, AMBU-nummer,
// prioriteitscode). Plaats = de woorden ná de postcode tot de eerstvolgende
// ALLE-HOOFDLETTERS plaatscode (bijv. "BLEISW") of "bon"/":". Getest tegen 5
// echte voorbeelden uit Lex' eigen consolelog — 4 van de 5 gaven een correcte
// "straat, plaats" (Bleiswijk/Vlaardingen/Oudenhoorn/Rotterdam), de 5e (geen
// postcode in de tekst) gaf netjes `null` i.p.v. een verkeerd resultaat. Bij
// `null` valt de titel terug op het bonnummer (zie hieronder) — nooit crashen
// of rommelige tekst tonen.
function haalStraatPlaats(titel) {
  const postcode = titel.match(/(\d{4}\s?[A-Z]{2})/);
  if (!postcode) return null;

  const voor = titel.slice(0, postcode.index).trim();
  const na = titel.slice(postcode.index + postcode[0].length).trim();

  const straatWoorden = [];
  const voorWoorden = voor.split(/\s+/);
  for (let i = voorWoorden.length - 1; i >= 0; i--) {
    const w = voorWoorden[i];
    if (/\d/.test(w) || /[()]/.test(w) || w.endsWith(':')) break;
    straatWoorden.unshift(w);
  }
  const straat = straatWoorden.join(' ').trim();

  const plaatsWoorden = [];
  for (const w of na.split(/\s+/)) {
    if (/^bon$/i.test(w) || w === ':' || /^\d+$/.test(w)) break;
    if (/^[A-Z]{3,8}$/.test(w) && plaatsWoorden.length > 0) break; // plaatscode ná de echte plaatsnaam
    plaatsWoorden.push(w);
  }
  const plaats = plaatsWoorden.join(' ').trim();

  if (!straat || !plaats) return null;
  return `${straat}, ${plaats}`;
}

// Tweede laag, voor berichten zonder postcode in de tekst (bijv. "Dorpsstraat
// KRIMLK : 16151" — geen postcode, alleen een afgekorte plaatscode). Anker nu
// op die ALLE-HOOFDLETTERS plaatscode vlak vóór ':' of 'bon', straat is de
// titelcase-woordenreeks ervoor. Levert een afkorting i.p.v. de volledige
// plaatsnaam (minder mooi), maar nog altijd 100% consistent met de tekst die
// ook in de kaart-popup staat — precies waar Lex om vroeg.
function haalStraatPlaatscode(titel) {
  const m = titel.match(
    /([A-Z][a-zà-ÿ'-]*(?:\s+(?:van|de|der|den|het|ter|ten)\s+[A-Za-zÀ-ÿ'-]+|\s+[A-Z][a-zà-ÿ'-]+)*)\s+([A-Z]{3,8})\s*(?::|bon\b)/,
  );
  if (!m) return null;
  const straat = m[1].trim();
  const plaatscode = m[2];
  if (!straat || !plaatscode) return null;
  return `${straat}, ${plaatscode}`;
}

// ---- MMT/Lifeliner-dispatch-detectie, 2026-08-19 ----------------------------
// Op verzoek van Lex: i.p.v. Lifeliner (OpenSky) de hele dag door te pollen
// (zelfs met de idle-gate in server.js kost dat tijdens een sessie nog steeds
// credits zonder dat er per se iets vliegt), wil hij dat de OpenSky-polling
// vooral aanslaat rond een dáádwerkelijke uitruk. Bij een traumahelikopter-
// inzet stuurt de meldkamer ook een MMT ("Mobiel Medisch Team")-oproep over
// hetzelfde P2000-netwerk uit — die kunnen we hier al zien, vóórdat het
// toestel zelf via OpenSky zichtbaar wordt. EERLIJKE WAARSCHUWING (zelfde
// soort voorbehoud als de rest van dit bestand): dit exacte tekstpatroon is
// nooit live bevestigd tegen een echte MMT-pagermelding — best-effort regex
// op bekende termen. Check bij een echte Lifeliner-vlucht de console-log
// hieronder om te zien of dit ook daadwerkelijk raak schiet; zo niet, dan
// blijft de idle-gate in server.js (op basis van of de app open is) alsnog
// als vangnet werken.
const MMT_PATROON = /\bMMT\b|mobiel medisch team|traumaheli|trauma-heli|lifeliner/i;
let laatsteMMTMeldingMs = 0;

// Aangeroepen vanuit server.js om te bepalen of Lifeliner ondanks de idle-gate
// toch versneld gepolld moet worden (zie pollOnce() aldaar).
export function msSindsLaatsteMMTMelding() {
  return laatsteMMTMeldingMs ? Date.now() - laatsteMMTMeldingMs : Infinity;
}

// Grove inschatting van urgentie op basis van veelgebruikte NL-prioriteitscodes
// in P2000-berichten (A1/A2 voor ambulance = spoed, "PRIO 1" voor politie/
// brandweer). Niet uitputtend getest tegen echte berichten — vangt de
// bekendste conventies, valt anders terug op "info".
function schatErnst(tekst) {
  if (/\bA1\b|\bPRIO\s*1\b|\bGRIP\s*[1-4]\b/i.test(tekst)) return 'waarschuwing';
  if (/\bA2\b|\bPRIO\s*2\b/i.test(tekst)) return 'let-op';
  return 'info';
}

export async function fetchP2000({ homeLat, homeLon }) {
  const res = await fetch(FEED_URL);
  if (!res.ok) throw new Error(`P2000-feed gaf status ${res.status}`);
  const xml = await res.text();
  const items = splitsItems(xml);

  let voorbeeldenGelogd = 0;
  // incidentSleutel (of, bij ontbreken, het item-id zelf) -> { signal, aantalEenheden }
  const perIncident = new Map();

  for (const blok of items) {
    try {
      if (voorbeeldenGelogd < 3) {
        voorbeeldenGelogd++;
        console.log(`[weer] p2000: voorbeelditem ${voorbeeldenGelogd}: ${blok.slice(0, 300).replace(/\s+/g, ' ')}`);
      }

      const titelRuw = tag(blok, 'title') ?? '';
      const beschrijving = tag(blok, 'description') ?? '';
      const dienstVeld = tag(blok, 'dienst');
      const tekst = `${dienstVeld ?? ''} ${titelRuw} ${beschrijving}`;

      // Los van de discipline-/afstandsfilter hieronder (die bepaalt alleen
      // of dit item als eigen P2000-kaartje getoond wordt) — een MMT-oproep
      // ergens in het land is al reden genoeg om Lifeliner-tracking aan te
      // zetten, ook als dit specifieke bericht zelf buiten de 25km-straal valt.
      if (MMT_PATROON.test(tekst)) {
        laatsteMMTMeldingMs = Date.now();
        console.log(`[weer] p2000: mogelijke MMT-dispatch gezien in "${titelRuw}" — Lifeliner-polling versneld`);
      }

      const discipline = haalDiscipline(tekst);
      if (!discipline) continue; // niet brandweer/politie/ambulance — overslaan

      const coords = haalCoordinaten(blok);
      if (!coords || Number.isNaN(coords.lat) || Number.isNaN(coords.lon)) continue; // geen locatie = niet te filteren op afstand, dus overslaan
      if (homeLat == null || homeLon == null) continue;
      const afstand = afstandKm(homeLat, homeLon, coords.lat, coords.lon);
      if (afstand > STRAAL_KM) continue;

      // 2026-08-19: Lex zag meldingen met heel verschillende teksten
      // (verschillende straten/plaatsen) op de kaart bij elkaar clusteren —
      // mogelijk geeft de feed soms een vast zender-/regiopunt i.p.v. de
      // echte incidentlocatie. Dit is een live rollende feed (het item is
      // vaak alweer verdwenen tegen de tijd dat je 'm zelf opzoekt), dus
      // voortaan structureel loggen i.p.v. achteraf moeten reconstrueren:
      // titel + de exacte lat/lon die hieruit is gehaald, voor elk
      // geaccepteerd item (dus vóór de dedup hieronder).
      console.log(`[weer] p2000: geaccepteerd "${titelRuw}" (${discipline.key}) → lat=${coords.lat} lon=${coords.lon}`);

      const pubDate = tag(blok, 'pubDate');
      // 2026-08-21-fix: NIET meer new Date(pubDate) — zie de uitgebreide
      // toelichting bij amsterdamseWandklokNaarUtc()/
      // parseFeedPubDateAlsAmsterdamseTijd() hierboven. De feed's eigen
      // tijdzone-label klopt structureel niet (altijd +0100, ook in
      // zomertijd), dus we negeren dat label en interpreteren de kale
      // klokcijfers zelf als Amsterdamse tijd.
      const geparsedeTijd = parseFeedPubDateAlsAmsterdamseTijd(pubDate);
      const tijd = (geparsedeTijd ?? new Date()).toISOString();
      const guid = tag(blok, 'guid') ?? tag(blok, 'link') ?? `${titelRuw}-${pubDate}`;
      const code = tag(blok, 'code');

      const sleutel = incidentSleutel(titelRuw) ?? guid; // zonder herkenbaar incidentnummer: niet samenvoegen

      const bestaand = perIncident.get(sleutel);
      if (bestaand) {
        bestaand.aantalEenheden++;
        continue; // zelfde incident, al toegevoegd — alleen de teller ophogen
      }

      perIncident.set(sleutel, {
        aantalEenheden: 1,
        signal: makeSignal({
          id: `p2000-${sleutel}`,
          categorie: 'hulpdiensten',
          // Titel volgt hetzelfde "Categorie - kort"-patroon als de andere
          // bronnen (bijv. "Droogte - Uganda"). Eerst alleen het bonnummer
          // (2026-08-19) — bleek in de praktijk te kaal: de lijst zei dan
          // niets over wát/waar het incident was, terwijl de kaart-popup wél
          // de volledige tekst toonde. Lex expliciet: "dat moet 100%
          // overeenkomen met wat er op de kaart te zien is" — dus nu bij
          // voorkeur "straat, plaats" (haalStraatPlaats), anders "straat,
          // plaatscode" (haalStraatPlaatscode, voor teksten zonder postcode),
          // en pas als allerlaatste terugval het kale bonnummer. De volledige
          // rauwe tekst blijft sowieso bewaard in detail.subtitel.
          titel: `Hulpdiensten - ${haalStraatPlaats(titelRuw) ?? haalStraatPlaatscode(titelRuw) ?? sleutel}`,
          ernst: schatErnst(tekst),
          lat: coords.lat,
          lon: coords.lon,
          tijd,
          detail: {
            discipline: discipline.key,
            capcode: code ?? null,
            afstandTotJouKm: afstand,
            subtitel: titelRuw || beschrijving || `${discipline.key} uitruk`,
            bronUrl: 'https://p2000.brandweer-berkel-enschot.nl/',
          },
        }),
      });
    } catch (err) {
      console.error('[weer] kon een P2000-item niet parsen:', err.message ?? err);
    }
  }

  return [...perIncident.values()].map(({ signal, aantalEenheden }) => {
    if (aantalEenheden <= 1) return signal;
    // Meerdere capcodes voor hetzelfde incident: laten zien dat er meerdere
    // eenheden gealarmeerd zijn i.p.v. het gewoon stilzwijgend te verbergen.
    signal.detail.aantalEenheden = aantalEenheden;
    signal.detail.subtitel = `${signal.detail.subtitel} · ${aantalEenheden} eenheden gealarmeerd`;
    return signal;
  });
}
