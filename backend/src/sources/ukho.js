// ukho.js — Radio Navigational Warnings van de UKHO/Admiralty MSI-portal
// (msi.admiralty.co.uk), de officiële NAVAREA I-coördinator + UK Coastal
// Warnings-bron. Op verzoek van Lex, 2026-08-20 ("UKHO graag") — navtex.js
// (zie dat bestand) scraped navtex.lv, een NIET-officiële bron, omdat de
// UKHO-pagina eerder vanuit deze omgeving niet in te zien was. Lex heeft
// zelf de opgeslagen pagina + een live WebFetch-test aangeleverd: de site
// blijkt gewoon met een kale HTTPS GET te werken (geen login/token/AJAX-only
// data), met een veel rijkere, betrouwbaardere structuur dan navtex.lv:
// - Elke waarschuwing staat als los <section>-blok binnen
//   .warning-detail (in de "uitklap"-rij van de tabel), met VIER losse
//   classes die alles bevatten wat nodig is — geen gepuzzel met bij elkaar
//   horende rijen zoals bij navtex.lv:
//     .warning-type          "NAVAREA 1" of "UK Coastal"
//     .warning-reference     bv. "NAVAREA I 173/26" of "WZ 484/26"
//     .warning-date-time     DTG, bv. "170440 UTC Aug 26"
//     .warning-description   volledige berichttekst (in een <pre>)
// - Coördinaten in de tekst staan als "53-50.1N 001-52.4E" (graden-minuten,
//   liggend streepje als scheidingsteken) — dezelfde regex als navtex.js
//   (COORD_REGEX) vangt dit toevallig al goed op, want '-' zit al in de
//   scheidingsteken-klasse.
// - DTG gebruikt, net als navtex.js al ontdekte, een TWEE-cijferig jaar.
//
// Bewust NIET samengevoegd met navtex.js zelf (aparte fetch/parse-logica,
// heel andere brondata), maar wél dezelfde 'navtex'-categorie/kaartlaag
// (Zee-modus) — voor Lex is dit gewoon "hetzelfde soort maritiem bericht",
// geen aparte toggle nodig. Kleine, geaccepteerde beperking: er is geen
// betrouwbare manier om een UKHO-warning te matchen met een overlappend
// navtex.lv-bericht (verschillende referentienummering) — dus in het
// (zeldzame) geval dat eenzelfde waarschuwing via beide bronnen verschijnt,
// zie je 'm mogelijk dubbel. Niet opgelost, wel hier genoteerd.
//
// Alleen 'NAVAREA 1' en 'UK Coastal' als warning-type meegenomen (de enige
// twee die op deze pagina voorkomen) — berichten van andere NAVAREA's
// (bv. "NAVAREA XIX", enkel als losse tekst-vermelding binnen een bericht,
// geen apart warning-type-blok) worden niet apart opgehaald.
import * as cheerio from 'cheerio';
import { makeSignal, afstandKm } from '../normalize.js';

const UKHO_URL = 'https://msi.admiralty.co.uk/RadioNavigationalWarnings';
const TOEGESTANE_TYPES = new Set(['navarea 1', 'uk coastal']);

// Zelfde COORD_REGEX als navtex.js (zie dat bestand voor de toelichting
// waarom '-' als scheidingsteken al werkt) — hier los gehouden i.p.v. samen
// te delen via normalize.js, want dat bestand is gedeeld door alle bronnen
// en dit is puur bronspecifieke parseerlogica, net zoals elke andere bron
// zijn eigen regexes ook los houdt.
const COORD_REGEX = /(\d{1,2})[°\-., ]?(\d{1,2}(?:\.\d+)?)?\s*([NS])\s*(\d{1,3})[°\-., ]?(\d{1,2}(?:\.\d+)?)?\s*([EW])/gi;
const DATUM_REGEX = /(\d{2})(\d{2})(\d{2})\s*UTC\s*([A-Z]{3})\s*(\d{4}|\d{2})/i;
const MAANDEN = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };

function coordinatenIn(tekst) {
  const coords = [];
  let match;
  COORD_REGEX.lastIndex = 0;
  while ((match = COORD_REGEX.exec(tekst)) !== null) {
    const lat = (Number(match[1]) + Number(match[2] || 0) / 60) * (match[3].toUpperCase() === 'S' ? -1 : 1);
    const lon = (Number(match[4]) + Number(match[5] || 0) / 60) * (match[6].toUpperCase() === 'W' ? -1 : 1);
    if (Number.isFinite(lat) && Number.isFinite(lon)) coords.push({ lat: +lat.toFixed(6), lon: +lon.toFixed(6) });
  }
  return coords;
}

// Zelfde uitschieter-filter als navtexLokaal.js (zie dat bestand voor de
// volledige toelichting: een enkel corrupt coördinaat-fragment in verder
// leesbare brontekst kan een individueel geldig-ogend maar wild verkeerd punt
// opleveren, bv. "73N" losgetrokken uit een garbled restje tekst).
//
// 2026-08-24, herzien: de eerste versie (afstand tot een "mediaanpunt" met
// ONAFHANKELIJK bepaalde lat/lon) bleek een valse-positieve te geven op UKHO
// — NAVAREA I/UK Coastal-gebieden bestrijken vaak een veel groter zeegebied
// dan een lokale AVURNAV-melding, en bij een langgerekte/rechthoekige vorm
// kan zo'n samengesteld mediaanpunt een fictieve locatie zijn die bij geen
// van de echte hoekpunten in de buurt ligt, met als gevolg dat legitieme
// punten er ten onrechte uitgefilterd werden. Nu i.p.v. daarvan: per punt de
// afstand tot z'n dichtstbijzijnde ANDERE punt in dezelfde melding, want dat
// werkt voor elke vorm (klomp, lijn, rechthoek) — zie navtexLokaal.js voor de
// volledige toelichting. Drempel 350km, zelfde als navtexLokaal.js. Bewust
// NIET toegepast op riglijst-achtige losse platformposities (komt bij UKHO-
// berichten in de praktijk niet voor, maar voor de zekerheid net zo scherp
// afgebakend als in navtexLokaal.js: alleen hier, vlak na coordinatenIn(),
// nooit op een andere puntenverzameling).
const UITSCHIETER_DREMPEL_KM = 350;
function verwijderUitschieters(coords) {
  if (coords.length < 3) return coords;
  return coords.filter((c) => {
    const afstandTotDichtstbijzijnde = Math.min(
      ...coords.filter((o) => o !== c).map((o) => afstandKm(c.lat, c.lon, o.lat, o.lon))
    );
    return afstandTotDichtstbijzijnde <= UITSCHIETER_DREMPEL_KM;
  });
}

function datumIn(tekst) {
  const m = DATUM_REGEX.exec(tekst);
  if (!m) return null;
  const [, dag, uur, min, maandTekst, jaarTekst] = m;
  const maand = MAANDEN[maandTekst.toUpperCase()];
  if (maand == null) return null;
  const jaar = jaarTekst.length === 2 ? 2000 + Number(jaarTekst) : Number(jaarTekst);
  const datum = new Date(Date.UTC(jaar, maand, Number(dag), Number(uur), Number(min), 0));
  return Number.isNaN(datum.getTime()) ? null : datum;
}

// 2026-08-24, op verzoek van Lex ("dezelfde aanpak ook op ukho.js"): zelfde
// event-classificatie + punt/lijn/polygoon-geometrie + riglijst-splitsing als
// net gebouwd voor navtexLokaal.js — zie de uitgebreide toelichting daar.
// Bewust hier LOS gehouden (gedupliceerd) i.p.v. gedeeld via een module: dat
// is al het bestaande patroon in dit bestand (COORD_REGEX/DATUM_REGEX staan
// hierboven ook al los van navtex.js/navtexLokaal.js, met dezelfde
// "eigen bronspecifieke logica, geen gedeelde afhankelijkheid"-redenering).
//
// Eén verschil t.o.v. navtexLokaal.js: GEEN dedup/"beste versie"-geheugen
// nodig — dit wordt elke pollcyclus vers van de officiële, al-schone
// UKHO-pagina gescraped (geen over-the-air bitfouten, geen retransmissies
// die per ontvangst anders gecorrumpeerd binnenkomen), dus er is niks te
// verbeteren tussen twee lezingen van dezelfde referentie.
const EVENT_REGELS = [
  { type: 'riglijst', label: 'Boorplatform(s)', re: /\bRIG\s*(LIST|MOVE)\b|MOBILE OFFSHORE DRILLING UNIT|\bMODU\b/i },
  { type: 'boei-vermist', label: 'Boei vermist/beschadigd', re: /BUOY[^.]{0,20}\bMISSING\b|BUOY[^.]{0,25}\b(TOPMARK|DAMAGED?)\b/i },
  // 2026-08-24, zelfde verbreding als navtexLokaal.js op verzoek van Lex.
  // 2026-08-24, zelfde verbreding als navtexLokaal.js op verzoek van Lex
  // ("Navaids inoperative kom ik ook nog tegen").
  // 2026-08-24, zelfde verbreding als navtexLokaal.js op verzoek van Lex
  // ("BOUY + UNLIT").
  { type: 'licht-onbetrouwbaar', label: 'Licht onbetrouwbaar/uit', re: /(LIGHT|NAVAIDS?|BUOY)[^.]{0,60}\b(UNRELIABLE|EXTINGUISHED|UNLIT|INOPERATIVE|OUT\s+OF\s+ORDER|NOT\s+WORKING|DEFECTIVE)\b/i },
  { type: 'boei-nieuw', label: 'Boei geplaatst/gewijzigd', re: /(LIGHT)?BUOY[^.]{0,25}\bESTABLISHED\b|BUOY\s+DEPLOYED|WAVERIDER BUOY/i },
  { type: 'safety-zone', label: 'Veiligheidszone', re: /SAFETY ZONE|AREA PROHIBITED/i },
  { type: 'kabel', label: 'Kabelwerkzaamheden', re: /\bCABLE\b/i },
  // 2026-08-24, zelfde verbreding als navtexLokaal.js op verzoek van Lex.
  { type: 'survey', label: 'Survey/onderzoeksvaartuig', re: /SURVEY\s+(OPERATIONS?|VESSEL|BY|WORK|CONDUCTED)\b/i },
  { type: 'wetenschappelijk', label: 'Wetenschappelijke instrumenten', re: /SCIENTIFIC (INSTRUMENT|EQUIPMENT)/i },
  { type: 'wrak', label: 'Wrak', re: /\bWRECK\b/i },
  // 2026-08-26, op melding van Lex (Oostende MSI 130/26: "OBSTACLES ON
  // THE SEABED IN FOLLOWING POSITIONS...") -- "OBSTACLE(S)" is een
  // net zo gangbare bewoording als "OBSTRUCTION" voor hetzelfde soort
  // gevaar (iets op de bodem waar niet geankerd/gevist mag worden), dus
  // dat viel voorheen nog in 'overig' i.p.v. als obstructie herkend.
  { type: 'obstructie', label: 'Obstructie', re: /\bOBSTRUCTIONS?\b|\bOBSTACLES?\b/i },
  // 2026-08-24, zelfde uitbreiding als navtexLokaal.js, op verzoek van Lex
  // (MSI 293/26 Oostende: "ANCHOR AND CHAIN LOST IN POS ..."). Bewust NIET op
  // DRAGG(ED/ING) laten matchen, dat is een ander soort melding.
  { type: 'anker-verloren', label: 'Anker/ketting verloren', re: /\bANCHOR\b[^.]{0,30}\bLOST\b|\bLOST\b[^.]{0,20}\bANCHOR\b/i },
  // 2026-08-24, zelfde uitbreiding als navtexLokaal.js, op verzoek van Lex.
  { type: 'munitie', label: 'Munitie/explosieven', re: /\b(ORDNANCE|MUNITIONS?|AMMUNITION|EXPLOSIVES?|UNEXPLODED|UXO|EOD)\b/i },
  { type: 'oefening', label: 'Militaire oefening', re: /FIRING EXERCISE|GUNNERY|NAVAL EXERCISE/i },
];
function classificeerEvent(body) {
  for (const regel of EVENT_REGELS) {
    if (regel.re.test(body)) return regel;
  }
  return { type: 'overig', label: 'Overige navigatiewaarschuwing' };
}

// Zelfde correctie als in navtexLokaal.js (2026-08-24, Lex: "ik zie een
// verticale lijn ten westen van Londen?") — eerst op trefwoord in de tekst
// kijken ("LINE JOINING"/"ALONG A LINE" -> lijn, ongeacht aantal punten),
// pas daarna op aantal terugvallen.
const LIJN_TRIGGER = /LINE JOINING|ALONG A LINE/i;
// 2026-08-24-uitbreiding, zelfde als navtexLokaal.js — op melding van Lex
// ("die verticale lijn ten westen van Londen") bleek TA59 (kabelwerk, 13
// punten, "BETWEEN FOLLOWING COORDINATES"/"ENTIRE CORRIDOR" i.p.v. "LINE
// JOINING") door LIJN_TRIGGER heen te glippen en als polygoon te sluiten.
// I.p.v. steeds nieuwe frases achterna te jagen: een kabeltracé is per
// definitie geen gesloten gebied, dus eventType 'kabel' met 2+ coördinaten
// wordt altijd als lijn getekend, ongeacht bewoording. Geaccepteerd risico
// (akkoord met Lex): een kabelmelding die ooit een omsloten werkgebied
// beschrijft i.p.v. een tracé zou hierdoor ten onrechte ook als lijn
// getekend worden — nog niet gezien, wel genoteerd.
function classificeerGeometrie(body, coords, eventType) {
  if (coords.length === 0) return { type: 'geen', gebiedPolygon: null, koerslijn: null };
  if (coords.length === 1) return { type: 'punt', gebiedPolygon: null, koerslijn: null };
  const latLon = coords.map((c) => [c.lat, c.lon]);
  if (eventType === 'kabel') return { type: 'lijn', gebiedPolygon: null, koerslijn: latLon };
  if (LIJN_TRIGGER.test(body)) return { type: 'lijn', gebiedPolygon: null, koerslijn: latLon };
  if (coords.length === 2) return { type: 'lijn', gebiedPolygon: null, koerslijn: latLon };
  return { type: 'polygoon', gebiedPolygon: [latLon], koerslijn: null };
}

// 2026-08-24, herzien na de EERSTE écht ontvangen riglijst ooit (NAVAREA I
// 176/26, via Lex) — twee fouten aan het licht gekomen t.o.v. de oude versie
// hierboven (die aannam dat de naam VOOR de coördinaat stond):
//
// 1. Off-by-one: de "tekst tussen twee coördinaten" hoort bij het VORIGE
//    platform (staat er in het echt zo: "52-59.1N 002-18.2E HAEVA" — de naam
//    volgt NA de eigen coördinaat, niet ervoor), maar werd toegekend aan het
//    VOLGENDE match — dus elk platform kreeg de naam van zijn voorganger.
// 2. Sectiekoppen ("NORTH SEA: 55N TO 60N, EAST OF 5W") staan tussen twee
//    coördinaten in, op hun eigen regel — de oude split-op-leestekens-en-pak-
//    het-laatste-stuk-logica ving daardoor soms zo'n kop i.p.v. de echte
//    naam (vandaar "EAST OF 5W" i.p.v. een platformnaam bij Lex' screenshot).
//
// Nieuwe aanpak, aan de hand van dat echte bericht: de naam staat op DEZELFDE
// REGEL als de coördinaat, meteen erna, tot het regeleinde — een sectiekop
// staat altijd op een eigen regel en wordt zo automatisch buiten de naam
// gehouden, geen aparte kop-woordenlijst nodig. Werkt hier omdat UKHO's
// brontekst (cheerio .text() op de <pre>-tag) de originele regeleindes
// bewaart — zie parseWaarschuwing() hierboven.
function splitsRiglijst(body) {
  const entries = [];
  const regex = new RegExp(COORD_REGEX.source, 'gi');
  const matches = [...body.matchAll(regex)];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const vanaf = match.index + match[0].length;
    const tot = i + 1 < matches.length ? matches[i + 1].index : body.length;
    const naamKandidaat = body.slice(vanaf, tot).split('\n')[0].trim(); // alleen de rest van DEZE regel, nooit doorlopen naar een volgende (sectiekop-)regel
    const naam = naamKandidaat ? naamKandidaat.slice(0, 60) : null;
    const lat = (Number(match[1]) + Number(match[2] || 0) / 60) * (match[3].toUpperCase() === 'S' ? -1 : 1);
    const lon = (Number(match[4]) + Number(match[5] || 0) / 60) * (match[6].toUpperCase() === 'W' ? -1 : 1);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      entries.push({ naam: naam || null, lat: +lat.toFixed(6), lon: +lon.toFixed(6) });
    }
  }
  return entries;
}

// 2026-08-24, op verzoek van Lex ("ja doe maar, zelfde navtex") — zelfde
// CANCEL/vervaldatum-logica als net gebouwd voor navtexLokaal.js (zie de
// uitgebreide toelichting daar: i.p.v. een blinde ouderdomsgrens de
// intrekking uit de berichten zelf lezen). Eén verschil: UKHO geeft het
// referentienummer al schoon mee via .warning-reference (w.reference) — geen
// eigen extractie uit de bodytekst nodig zoals bij navtexLokaal.js, wel
// dezelfde normalisatie (hoofdletters/spaties/geen leidende nullen) zodat
// een "CANCEL WZ 411/26" in de description van een ANDER bericht betrouwbaar
// matcht met w.reference "WZ 411/26".
function normaliseerReferentie(tekst) {
  const t = tekst.trim();
  const m = /^(MSI|WZ|NAVAREA\s+[IVXLC]+|AVURNAV\s+[A-Z]+)\s+(\d{1,4})\s*\/\s*(\d{1,4})$/i.exec(t);
  if (!m) return t.toUpperCase().replace(/\s+/g, ' ');
  return `${m[1].toUpperCase().replace(/\s+/g, ' ')} ${Number(m[2])}/${Number(m[3])}`;
}
const REFERENTIE_REGEX = /\b(MSI|WZ|NAVAREA\s+[IVXLC]+|AVURNAV\s+[A-Z]+)\s+(\d{1,4})\s*\/\s*(\d{1,4})\b/i;
function referentieUitTekst(tekst) {
  const m = REFERENTIE_REGEX.exec(tekst);
  if (!m) return null;
  return normaliseerReferentie(`${m[1]} ${m[2]}/${m[3]}`);
}
// "CANCEL THIS MSG/MESSAGE <DTG>" — het bericht geeft zichzelf een vervaldatum.
const ZELF_VERVAL_REGEX = /CANCEL\s+THIS\s+(?:MSG|MESSAGE)\s+([\s\S]{0,40})/i;
function zelfVervalDatumIn(tekst) {
  const m = ZELF_VERVAL_REGEX.exec(tekst);
  if (!m) return null;
  return datumIn(m[1]);
}
// Alle "CANCEL <referentienummer>"-vermeldingen, MET uitzondering van
// "CANCEL THIS MSG/MESSAGE ..." (dat is de zelf-vervaldatum hierboven).
const CANCEL_REGEX = /CANCEL\s+([\s\S]{0,40})/gi;
function geannuleerdeReferentiesIn(tekst) {
  const gevonden = [];
  CANCEL_REGEX.lastIndex = 0;
  let m;
  while ((m = CANCEL_REGEX.exec(tekst)) !== null) {
    if (/^THIS\s+(MSG|MESSAGE)\b/i.test(m[1])) continue;
    const ref = referentieUitTekst(m[1]);
    if (ref) gevonden.push(ref);
  }
  return gevonden;
}
// Module-scoped, overleeft pollcycli zolang de service draait — zelfde
// soort geheugen als BESTE_VERSIE_PER_SLEUTEL in navtexLokaal.js.
const GEANNULEERDE_REFERENTIES = new Set();
// Vangnet, geen primair mechanisme — zie navtexLokaal.js.
const VANGNET_MAX_OUDERDOM_MS = 60 * 24 * 60 * 60 * 1000;

// 2026-08-24-fix, zelfde bug/oplossing als navtexLokaal.js (zie de uitgebreide
// toelichting daar): bij een onherkenbare `w.datum` viel `tijd` hieronder
// terug op `new Date()` — elke pollronde opnieuw, dus zo'n waarschuwing zou
// voor altijd "net binnengekomen" lijken i.p.v. daadwerkelijk oud. Hier bij
// UKHO minder waarschijnlijk om te raken (dtgTekst komt uit een los HTML-veld
// op de bron-pagina, geen vrije-tekst-scan zoals bij de over-de-lucht-
// ontvangst in navtexLokaal.js), maar dezelfde klasse fout — dus zelfde,
// stabiele "voor het eerst gezien op"-terugval i.p.v. een steeds-verse tijd.
const EERSTE_ONTVANGST_PER_ID = new Map();
function eersteOntvangst(id) {
  const bestaand = EERSTE_ONTVANGST_PER_ID.get(id);
  if (bestaand) return bestaand;
  const nu = new Date().toISOString();
  EERSTE_ONTVANGST_PER_ID.set(id, nu);
  return nu;
}

// Vaste kleur per warning-type (i.p.v. per zendstation zoals bij
// navtexLokaal.js — UKHO kent geen zendstation-concept, alleen NAVAREA 1 vs
// UK Coastal). Zelfde neutraal-grijs-onbekend-fallback als daar.
const TYPE_KLEUR = { 'navarea 1': '#4c9df0', 'uk coastal': '#4cf0c8' };
const TYPE_KLEUR_ONBEKEND = '#9aa0b4';

// Kale HTTPS GET met een browser-achtige User-Agent — geen TLS-uitzondering
// nodig zoals bij navtex.js (msi.admiralty.co.uk heeft een normaal geldig
// certificaat), dus hier volstaat de ingebouwde fetch() gewoon.
async function haalUkhoHtml() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(UKHO_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`msi.admiralty.co.uk gaf status ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

function parseWaarschuwing($, el) {
  const $el = $(el);
  const type = $el.find('.warning-type').first().text().trim();
  const reference = $el.find('.warning-reference').first().text().trim();
  const dtgTekst = $el.find('.warning-date-time').first().text().trim();
  const description = $el.find('.warning-description').first().text().trim();
  if (!type || !reference || !description) return null;
  return { type, reference, dtgTekst, description };
}

export async function fetchUkho(env = {}) {
  const homeLat = env.homeLat ?? 52.0907;
  const homeLon = env.homeLon ?? 5.1214;
  // Zelfde straal/instelling als navtex.js — voor Lex is dit "hetzelfde soort
  // maritiem bericht", geen aparte UKHO_STRAAL_KM nodig.
  const straalKm = Number(process.env.NAVTEX_STRAAL_KM) || 450;

  // 2026-08-24, op verzoek van Lex ("snelle ukho [retry]"): dit ving een
  // mislukte pagina-fetch (timeout/netwerkfout) voorheen af en gaf gewoon []
  // terug — vanuit pollOnce() in server.js zag dat er dan uit als een
  // GESLAAGDE poll met 0 signalen (markSuccess([])), dus (a) overschreef dat
  // de vorige, nog prima geldige signalenlijst met een lege lijst, (b) bleef
  // /api/status "geen fout" tonen terwijl de fetch wél mislukte, en (c) kon
  // de nieuwe snelle-herhaal-poging hieronder in server.js nooit afgaan, want
  // die reageert op een ECHTE throw. Nu: de pagina-fetch zelf laten
  // doorgooien naar pollOnce(), zodat state.markError() het (en niet
  // markSuccess([])) afhandelt — de vorige signalenlijst blijft dan gewoon
  // staan (zie ververNexradStations/ververZeeForecast hierboven voor
  // hetzelfde principe), de fout wordt zichtbaar in /api/status, én de
  // snelle herhaal-poging kan aanslaan. Bewust ALLEEN hier (de pagina-fetch
  // zelf) — een geslaagde fetch met 0 bruikbare/binnen-bereik-waarschuwingen
  // hieronder blijft gewoon een terechte lege lijst, geen fout.
  const html = await haalUkhoHtml();

  const $ = cheerio.load(html);
  const waarschuwingen = $('.warning-detail section')
    .map((i, el) => parseWaarschuwing($, el))
    .get()
    .filter(Boolean)
    .filter((w) => TOEGESTANE_TYPES.has(w.type.toLowerCase().trim()));

  // Alleen berichten MET een coördinaat in de tekst — anders (bv. een
  // algemene RIGLIST-correctie zonder eigen positie) is er niks zinnigs op
  // de kaart te tonen, en heeft UKHO (anders dan navtex.js) geen
  // zendstation-locatie als terugvaloptie.
  //
  // 2026-08-24: alle coordinaten meenemen (niet meer alleen coords[0]) +
  // event-classificatie, zelfde uitbreiding als navtexLokaal.js.
  const metPositie = waarschuwingen
    .map((w) => {
      const datum = datumIn(w.dtgTekst);
      const eventInfo = classificeerEvent(w.description);
      const referentie = normaliseerReferentie(w.reference);
      const zelfVervalDatum = zelfVervalDatumIn(w.description);

      // 2026-08-25-fix, op melding van Lex ("hoe komt het dat rigs allemaal
      // 48 km van mij vandaan zijn?" en later "NEE ALLE RIGS STAAN OP 48" —
      // zelfde bug als in navtexLokaal.js bleek te zitten, hier apart
      // gefixt want dit is een los bestand met zijn eigen kopie van deze
      // logica): een riglijst-bericht bevat meerdere platform-posities die
      // legitiem honderden km uit elkaar kunnen liggen -- dus 1 gedeelde
      // afstand-tot-jou voor het HELE bericht (zoals hieronder voor normale
      // berichten gebeurt) is hier zinloos. Voorheen kreeg elke uitgesplitste
      // rig (zie splitsRiglijst() verderop) gewoon de afstand tot het EERST
      // gevonden punt in de hele tekst mee, ongeacht zijn eigen positie. Nu:
      // alle rigs hier al splitsen en per rig een eigen afstand berekenen
      // (`rigs`, hergebruikt verderop bij het bouwen van de losse signalen
      // i.p.v. splitsRiglijst() nog een keer aan te roepen). Op verzoek van
      // Lex ("alle rigs meenemen ongeacht hoe ver... ik wil ze allemaal
      // zien") slaat een riglijst-bericht het bereik-filter hieronder
      // (binnenBereik) sowieso over -- zie daar.
      if (eventInfo.type === 'riglijst') {
        const rigs = splitsRiglijst(w.description).map((rig) => ({ ...rig, afstandTotJouKm: afstandKm(homeLat, homeLon, rig.lat, rig.lon) }));
        const afstandTotJouKm = rigs.length ? Math.min(...rigs.map((r) => r.afstandTotJouKm)) : null;
        return { ...w, coords: [], positie: rigs[0] ?? null, rigs, afstandTotJouKm, datum, eventInfo, referentie, zelfVervalDatum };
      }

      const coords = verwijderUitschieters(coordinatenIn(w.description));
      const positie = coords[0] ?? null;
      const afstandTotJouKm = positie ? afstandKm(homeLat, homeLon, positie.lat, positie.lon) : null;
      return { ...w, coords, positie, afstandTotJouKm, datum, eventInfo, referentie, zelfVervalDatum };
    })
    .filter((w) => w.positie);

  // Elk bericht (ongeacht bereik/positie) kan een ANDER bericht intrekken —
  // eerst alle CANCEL-verwijzingen uit alle waarschuwingen verzamelen en in
  // het module-scoped geheugen zetten, dan pas filteren. Zie navtexLokaal.js.
  for (const w of waarschuwingen) {
    for (const ref of geannuleerdeReferentiesIn(w.description)) GEANNULEERDE_REFERENTIES.add(ref);
  }

  const nu = Date.now();
  // 2026-08-25, op verzoek van Lex ("alle rigs meenemen ongeacht hoe ver...
  // ik wil ze allemaal zien") — riglijst-berichten slaan het afstandsfilter
  // hier helemaal over, zelfde als navtexLokaal.js.
  const binnenBereik = metPositie.filter((w) => w.eventInfo.type === 'riglijst' || (w.afstandTotJouKm != null && w.afstandTotJouKm <= straalKm));
  const nietVervallen = binnenBereik.filter((w) => {
    if (w.zelfVervalDatum && w.zelfVervalDatum.getTime() < nu) return false; // "CANCEL THIS MSG <datum>" al gepasseerd
    if (w.referentie && GEANNULEERDE_REFERENTIES.has(w.referentie)) return false; // door een later bericht ingetrokken
    if (!w.zelfVervalDatum && w.datum && nu - w.datum.getTime() > VANGNET_MAX_OUDERDOM_MS) return false; // vangnet, geen primair mechanisme
    return true;
  });

  // 2026-08-20: zelfde logdiscipline als navtex.js/getij.js — altijd loggen,
  // ook bij 0 treffers.
  if (!nietVervallen.length) {
    const gesorteerd = [...metPositie].sort((a, b) => a.afstandTotJouKm - b.afstandTotJouKm);
    const dichtstbij = gesorteerd[0];
    console.log(
      `[weer] ukho: 0 van de ${waarschuwingen.length} waarschuwingen (${metPositie.length} met bruikbare positie, ${binnenBereik.length} binnen bereik, ` +
        `${binnenBereik.length - nietVervallen.length} vervallen/ingetrokken) binnen ${straalKm}km van HOME_LAT/HOME_LON (${homeLat}, ${homeLon})` +
        (dichtstbij ? ` — dichtstbijzijnde is ${dichtstbij.reference} op ${dichtstbij.afstandTotJouKm}km.` : ' (geen enkele waarschuwing had een bruikbare positie).')
    );
    return [];
  }
  console.log(
    `[weer] ukho: ${binnenBereik.length} van de ${waarschuwingen.length} waarschuwingen binnen ${straalKm}km, ` +
      `${binnenBereik.length - nietVervallen.length} vervallen/ingetrokken, ${nietVervallen.length} blijft over.`
  );

  return nietVervallen.flatMap((w) => {
    const idVeilig = w.reference.replace(/[^a-zA-Z0-9]+/g, '-');
    const typeKleur = TYPE_KLEUR[w.type.toLowerCase().trim()] ?? TYPE_KLEUR_ONBEKEND;
    const gedeeldeDetail = {
      // Hergebruikt dezelfde velden als navtex.js's detail-object (zie
      // frontend/app.js popupHtml — categorie 'navtex' leest station/land/
      // afstandTotJouKm/bericht/positieUitBericht), station/land hier
      // ingevuld met UKHO's eigen referentie/type i.p.v. een zendstation.
      station: w.reference,
      referentie: w.referentie,
      land: w.type,
      stationKleur: typeKleur,
      eventType: w.eventInfo.type,
      eventLabel: w.eventInfo.label,
      afstandTotJouKm: w.afstandTotJouKm,
      bericht: w.description,
      positieUitBericht: true,
      vervaltOp: w.zelfVervalDatum ? w.zelfVervalDatum.toISOString() : null,
      // 2026-08-24, zelfde marker als navtexLokaal.js — zie de toelichting
      // daar. Hier minder waarschijnlijk (dtgTekst komt uit een los
      // HTML-veld), maar zelfde betekenis: `tijd` is dan het "eerst gezien
      // op"-moment, geen echte berichtdatum.
      datumOnbetrouwbaar: w.datum == null,
      bronUrl: UKHO_URL,
      bron: 'ukho',
    };

    // Riglijst: los puntsignaal per gevonden platformpositie i.p.v. één
    // gebiedssignaal (zie splitsRiglijst() hierboven, zelfde als
    // navtexLokaal.js). `w.rigs` (met eigen afstandTotJouKm per rig) komt al
    // uit de metPositie-stap hierboven -- geen eigen bereik-filter meer hier
    // (zie de toelichting daar), de afstand blijft alleen nog informatief in
    // de detail staan.
    if (w.eventInfo.type === 'riglijst') {
      const rigs = w.rigs ?? [];
      if (rigs.length === 0) return [];
      return rigs.map((rig, i) =>
        makeSignal({
          id: `ukho-${idVeilig}-rig${i}`,
          categorie: 'navtex',
          titel: `${w.type} — ${w.eventInfo.label}${rig.naam ? ` — ${rig.naam}` : ''} — ${w.reference}`,
          ernst: 'waarschuwing',
          lat: rig.lat,
          lon: rig.lon,
          tijd: w.datum ? w.datum.toISOString() : eersteOntvangst(`ukho-${idVeilig}-rig${i}`),
          detail: { ...gedeeldeDetail, afstandTotJouKm: rig.afstandTotJouKm, positie: rig, riglijstIndex: i, riglijstTotaal: rigs.length },
        })
      );
    }

    const geometrie = classificeerGeometrie(w.description, w.coords, w.eventInfo.type);
    return [
      makeSignal({
        id: `ukho-${idVeilig}`,
        categorie: 'navtex',
        titel: `${w.type} — ${w.reference}`,
        ernst: 'waarschuwing',
        lat: w.positie.lat,
        lon: w.positie.lon,
        tijd: w.datum ? w.datum.toISOString() : eersteOntvangst(`ukho-${idVeilig}`),
        detail: {
          ...gedeeldeDetail,
          geometrieType: geometrie.type,
          gebiedPolygon: geometrie.gebiedPolygon,
          koerslijn: geometrie.koerslijn,
        },
      }),
    ];
  });
}
