// getij.js — hoog-/laagwater (astronomisch getij) dichtbij, op verzoek van
// Lex ("hoog en laag water Oud Beijerland en HvH en hoelang daar naartoe...
// of beter nog afhankelijk van een radius van de actieve GPS", 2026-08-20).
//
// 2026-08-20-fix: eerste versie gebruikte het OUDE waterwebservices-domein
// (waterwebservices.rijkswaterstaat.nl/METADATASERVICES_DBO/...) — dat bleek
// bij Lex een HTML-foutpagina terug te geven i.p.v. JSON ("Unexpected token
// '<', <!DOCTYPE..."). Uitgezocht: RWS is per 2026 overgeschakeld naar een
// nieuw systeem, "WADAR" (WaterData Rijkswaterstaat) — het oude endpoint
// wordt eind april 2026 uitgefaseerd. Zie
// https://rijkswaterstaatdata.nl/projecten/waterwebservices-overschakeling/.
// Nieuwe base-URL + endpoints hieronder. Bijkomend voordeel: WADAR is wél
// een officieel gedocumenteerde/ondersteunde dienst (Swagger + actieve
// GitHub Discussions-pagina), dus dit bestand hoeft niet langer te leunen op
// het eerder gebruikte, NIET-gedocumenteerde waterinfo.rws.nl/api/chart/get.
//
// Twee WADAR-diensten gecombineerd:
//
// 1. METADATASERVICES/OphalenCatalogus — de officiële metadata-dienst: geeft
//    de volledige lijst RWS-meetlocaties terug (naam + interne code, die bij
//    de WADAR-overstap trouwens ook is "opgeschoond": bv. "hoekvanholland"
//    i.p.v. de oude HOEK/HVH25/HOEKVHLD-varianten). Hier ALLEEN gebruikt om,
//    live (met een cache van 24u — die lijst verandert vrijwel nooit), de
//    juiste locatie-CODE bij een bekende plaatsnaam op te zoeken — zie
//    KANDIDATEN hieronder. Zo hoeven we RWS' interne stationscodes NIET te
//    gokken/hardcoden in de broncode: een naam die niet (meer) matcht valt
//    gewoon stilzwijgend weg (met een waarschuwing in de log) i.p.v. de hele
//    bron te breken.
//
// 2. ONLINEWAARNEMINGENSERVICES/OphalenWaarnemingen — de "verwachte
//    waterstand" (voorspelde/astronomische waterhoogte-curve), opgevraagd
//    met Grootheid.Code "WATHTE" + ProcesType "verwachting". Dit exacte
//    request-patroon is bevestigd via een opgelost supportgesprek op RWS'
//    eigen GitHub Discussions-pagina (discussion #51, "Verwachte
//    waterstanden ophalen") — dus niet zelf gegokt. Daaruit worden hieronder
//    ZELF de hoogwater/laagwater-momenten (lokale maxima/minima) berekend.
//    RWS heeft blijkens diezelfde Discussions-pagina (#34) óók een
//    kant-en-klare grootheid voor getij-extremen zelf, genaamd
//    "GETETBRKD2" — die wordt hieronder als EERSTE (nauwkeuriger, officieel
//    "extremen")-poging geprobeerd, met de WATHTE-curve-berekening als
//    beproefde terugval zodra die leeg/onbruikbaar blijkt. De exacte
//    respons-vorm van GETETBRKD2 zelf kon niet live bevestigd worden (geen
//    voorbeeld-respons gevonden, alleen de naam) — vandaar de terugval.
import { makeSignal, afstandKm } from '../normalize.js';

// Kandidaat-getijstations: naam (voor live opzoeken van de RWS-locatiecode)
// + bij benadering lat/lon (algemene geografische kennis — ALLEEN gebruikt
// om te bepalen welke kandidaten binnen de straal van huis vallen, niet de
// coördinaat die naar RWS gaat). Bewust een spreiding over de hele NL-kust +
// Rijn-Maasmonding, niet alleen Oud-Beijerland/Hoek van Holland — op
// verzoek van Lex ("beter nog afhankelijk van een radius") werkt zo
// "dichtstbijzijnde getijstations" ook ergens anders in het land, niet
// alleen rond die twee genoemde plekken. Voor Oud-Beijerland zelf (aan de
// Oude Maas, geen kuststation) staan er een paar kandidaat-namen in de
// buurt bij (Goidschalxoord/Puttershoek/Spijkenisse) — welke daarvan
// daadwerkelijk een RWS-getijstation blijkt te zijn, wordt pas live bepaald
// via de catalogus hieronder; de rest valt vanzelf stil weg.
const KANDIDATEN = [
  { naam: 'Hoek van Holland', lat: 51.9744, lon: 4.1206 },
  { naam: 'Maassluis', lat: 51.9236, lon: 4.2506 },
  { naam: 'Vlaardingen', lat: 51.9128, lon: 4.3417 },
  { naam: 'Rotterdam', lat: 51.908, lon: 4.46 },
  { naam: 'Spijkenisse', lat: 51.845, lon: 4.33 },
  { naam: 'Goidschalxoord', lat: 51.8214, lon: 4.4102 },
  { naam: 'Puttershoek', lat: 51.8072, lon: 4.5636 },
  { naam: 'Heinenoord', lat: 51.8244, lon: 4.5311 },
  { naam: 'Dordrecht', lat: 51.8133, lon: 4.6901 },
  { naam: 'Willemstad', lat: 51.6864, lon: 4.4419 },
  { naam: 'Stellendam', lat: 51.8228, lon: 4.0303 },
  { naam: 'Scheveningen', lat: 52.106, lon: 4.273 },
  { naam: 'Katwijk', lat: 52.201, lon: 4.399 },
  { naam: 'IJmuiden', lat: 52.4603, lon: 4.5553 },
  { naam: 'Den Helder', lat: 52.96, lon: 4.76 },
  { naam: 'Harlingen', lat: 53.1745, lon: 5.42 },
  { naam: 'Delfzijl', lat: 53.33, lon: 6.93 },
  { naam: 'Vlissingen', lat: 51.4426, lon: 3.5735 },
  { naam: 'Terneuzen', lat: 51.335, lon: 3.83 },
];

// 2026-08-20: straal rond HOME_LAT/HOME_LON — zie de bredere kanttekening
// hierboven bij "afhankelijk van GPS": dit gebruikt vooralsnog de vaste
// HOME_LAT/HOME_LON uit .env (zelfde als moon.js/swpc.js e.a.), NIET de
// live GPS-positie van de telefoon/browser op het moment zelf — dat laatste
// zou een apart, los van de gedeelde poll-cyclus opvraagbaar eindpunt
// vergen (de signalen hier worden immers voor iedere kijker gelijk
// berekend). Bewust als eerste stap: eerst de RWS-integratie zelf aan de
// praat krijgen met een simpele, stabiele locatie, dan pas de
// live-GPS-laag erbovenop.
//
// 2026-08-20-fix: was eerst 35km — bij Lex bleek dat op 0 kandidaat-stations
// binnen bereik uit te komen (voordat de eigenlijke domein-fout aan het
// licht kwam), en dat leverde toen GEEN enkele logregel op. Twee dingen
// gefixt: (1) straal omhoog naar 60km, en (2) hieronder ALTIJD een
// samenvattende logregel, ook bij 0 treffers — inclusief de afstand tot het
// dichtstbijzijnde kandidaat-station. Evt. verder aan te passen via
// GETIJ_STRAAL_KM in .env zonder code-wijziging.
const STRAAL_KM = Number(process.env.GETIJ_STRAAL_KM) || 60;

// 2026-08-20-fix: nieuwe WADAR base-URL, zie voorbehoud bovenaan dit bestand.
const BASE_URL = 'https://ddapi20-waterwebservices.rijkswaterstaat.nl';
const CATALOGUS_URL = `${BASE_URL}/METADATASERVICES/OphalenCatalogus`;
const WAARNEMINGEN_URL = `${BASE_URL}/ONLINEWAARNEMINGENSERVICES/OphalenWaarnemingen`;

const CATALOGUS_CACHE_MS = 24 * 60 * 60 * 1000; // stationslijst verandert vrijwel nooit
let catalogusCache = null; // { opgehaaldOp, codePerNaam }

async function haalCodePerNaam() {
  if (catalogusCache && Date.now() - catalogusCache.opgehaaldOp < CATALOGUS_CACHE_MS) {
    return catalogusCache.codePerNaam;
  }
  const res = await fetch(CATALOGUS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ CatalogusFilter: { Locaties: true } }),
  });
  if (!res.ok) throw new Error(`RWS-catalogus gaf status ${res.status}`);
  const body = await res.json();
  const codePerNaam = new Map();
  (body.LocatieLijst ?? []).forEach((l) => {
    if (l.Naam && l.Code) codePerNaam.set(String(l.Naam).trim().toLowerCase(), l.Code);
  });
  catalogusCache = { opgehaaldOp: Date.now(), codePerNaam };
  return codePerNaam;
}

async function kandidatenMetCode() {
  const codePerNaam = await haalCodePerNaam();
  return KANDIDATEN.map((k) => ({ ...k, code: codePerNaam.get(k.naam.trim().toLowerCase()) ?? null })).filter(
    (k) => k.code
  );
}

// 2026-08-20-fix: dit request-patroon (Locatie.Code + AquoPlusWaarnemingMetadata.
// AquoMetadata.{Grootheid,ProcesType} + Periode) is bevestigd via RWS' eigen
// GitHub Discussions #51 ("Verwachte waterstanden ophalen") — niet zelf
// gegokt. grootheidCode is parametriseerbaar zodat zowel de directe
// extremen-grootheid (GETETBRKD2) als de gewone waterhoogte-curve (WATHTE)
// via dezelfde functie kunnen, zie getijVoorStation hieronder.
async function haalWaarnemingen(code, grootheidCode, vanaf, tot) {
  const res = await fetch(WAARNEMINGEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      Locatie: { Code: code },
      AquoPlusWaarnemingMetadata: {
        AquoMetadata: {
          Grootheid: { Code: grootheidCode },
          ProcesType: 'verwachting',
        },
      },
      Periode: {
        Begindatumtijd: vanaf.toISOString(),
        Einddatumtijd: tot.toISOString(),
      },
    }),
  });
  // 204 No Content is een geldig "geen data voor deze periode/grootheid"-
  // antwoord bij deze dienst (zie diezelfde discussion #51) — geen fout.
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`RWS-waarnemingen (${grootheidCode}) gaf status ${res.status}`);
  return res.json();
}

// Standaard Aquo/DDL-responsvorm: WaarnemingenLijst[].MetingenLijst[], elk
// met Tijdstip + Meetwaarde.Waarde_Numeriek. Defensief geschreven (met een
// paar alternatieve veldnamen) omdat dit — i.t.t. het request-patroon
// hierboven — niet met een letterlijk voorbeeld uit de Discussions-pagina
// bevestigd kon worden, puur op de bekende/gedocumenteerde Aquo-vorm.
function puntenUitWaarnemingen(body) {
  const reeks = body?.WaarnemingenLijst?.[0]?.MetingenLijst ?? body?.WaarnemingenLijst?.[0]?.metingenLijst ?? [];
  if (!Array.isArray(reeks)) return [];
  return reeks
    .map((m) => {
      const tijdMs = m?.Tijdstip ? new Date(m.Tijdstip).getTime() : null;
      const ruw = m?.Meetwaarde?.Waarde_Numeriek ?? m?.Meetwaarde?.waarde_Numeriek ?? m?.waarde;
      return { tijdMs, hoogteCm: ruw != null ? Number(ruw) : null };
    })
    .filter((p) => Number.isFinite(p.tijdMs) && Number.isFinite(p.hoogteCm));
}

// Lokale maxima/minima in de waterhoogte-curve = hoogwater/laagwater.
// Simpele buursman-vergelijking volstaat (10-minuten-resolutie is fijn
// genoeg voor een vloeiende getijcurve, geen gladstrijk-stap nodig).
function extremenUitCurve(punten) {
  const extremen = [];
  for (let i = 1; i < punten.length - 1; i++) {
    const vorig = punten[i - 1].hoogteCm;
    const huidig = punten[i].hoogteCm;
    const volgend = punten[i + 1].hoogteCm;
    if (huidig >= vorig && huidig >= volgend && huidig > vorig) {
      extremen.push({ type: 'hoog', tijdMs: punten[i].tijdMs, hoogteCm: huidig });
    } else if (huidig <= vorig && huidig <= volgend && huidig < vorig) {
      extremen.push({ type: 'laag', tijdMs: punten[i].tijdMs, hoogteCm: huidig });
    }
  }
  return extremen;
}

// Als GETETBRKD2 wél data teruggeeft, zijn dat per definitie AL de
// extremen zelf (geen curve om zelf pieken/dalen in te zoeken) — alternerend
// hoog/laag. Zonder bevestigd hoog/laag-label per punt (zie voorbehoud
// bovenaan) leiden we dat af uit de eerste twee punten (hoger dan de
// volgende = hoogwater) en alterneren daarna gewoon door.
function extremenUitPuntenlijst(punten) {
  if (punten.length < 2) return [];
  const eersteIsHoog = punten[0].hoogteCm >= punten[1].hoogteCm;
  return punten.map((p, i) => ({
    type: (i % 2 === 0) === eersteIsHoog ? 'hoog' : 'laag',
    tijdMs: p.tijdMs,
    hoogteCm: p.hoogteCm,
  }));
}

async function getijVoorStation(kandidaat) {
  const nu = Date.now();
  const vanaf = new Date(nu - 3 * 60 * 60 * 1000); // iets terug, voor het geval je net na een omslagpunt zit
  const tot = new Date(nu + 30 * 60 * 60 * 1000); // ruim genoeg voor het eerstvolgende hoog- én laagwater

  // Poging 1: RWS' eigen extremen-grootheid (GETETBRKD2, zie voorbehoud
  // bovenaan) — als dat werkt, geen zelf-berekende afleiding nodig.
  let extremen = [];
  try {
    const extremenBody = await haalWaarnemingen(kandidaat.code, 'GETETBRKD2', vanaf, tot);
    const extremenPunten = extremenBody ? puntenUitWaarnemingen(extremenBody) : [];
    if (extremenPunten.length) extremen = extremenUitPuntenlijst(extremenPunten);
  } catch (err) {
    console.error(`[weer] getij: GETETBRKD2-poging voor ${kandidaat.naam} mislukt (val terug op WATHTE-curve),`, err.message ?? err);
  }

  // Terugval: gewone (bevestigde) waterhoogte-curve, zelf pieken/dalen in
  // zoeken — zie extremenUitCurve hierboven.
  if (!extremen.length) {
    const curveBody = await haalWaarnemingen(kandidaat.code, 'WATHTE', vanaf, tot);
    const punten = curveBody ? puntenUitWaarnemingen(curveBody) : [];
    if (!punten.length) {
      console.error(
        `[weer] getij: kon voor ${kandidaat.naam} (${kandidaat.code}) geen bruikbare waterhoogte-data ophalen (204/leeg/onbekende vorm)` +
          (curveBody ? ` — top-level sleutels: ${Object.keys(curveBody).join(', ') || '(geen)'}` : '.')
      );
      return null;
    }
    extremen = extremenUitCurve(punten);
  }

  extremen = extremen.filter((e) => e.tijdMs >= nu).sort((a, b) => a.tijdMs - b.tijdMs);
  const eerstvolgendHoog = extremen.find((e) => e.type === 'hoog') ?? null;
  const eerstvolgendLaag = extremen.find((e) => e.type === 'laag') ?? null;
  if (!eerstvolgendHoog && !eerstvolgendLaag) return null;
  return { eerstvolgendHoog, eerstvolgendLaag };
}

export async function fetchGetij(env = {}) {
  const homeLat = env.homeLat ?? 52.0907;
  const homeLon = env.homeLon ?? 5.1214;

  let kandidaten;
  try {
    kandidaten = await kandidatenMetCode();
  } catch (err) {
    console.error('[weer] getij: RWS-locatiecatalogus ophalen mislukt,', err.message ?? err);
    return [];
  }

  const metAfstand = kandidaten
    .map((k) => ({ ...k, afstandTotJouKm: afstandKm(homeLat, homeLon, k.lat, k.lon) }))
    .sort((a, b) => a.afstandTotJouKm - b.afstandTotJouKm);
  const binnenBereik = metAfstand.filter((k) => k.afstandTotJouKm <= STRAAL_KM);

  // 2026-08-20-fix: altijd loggen, ook (juist) als er 0 treffers zijn — zie
  // de comment bij STRAAL_KM hierboven. Vermeldt ook expliciet HOME_LAT/
  // HOME_LON zelf, want een verkeerd/vergeten ingestelde .env-waarde (bv.
  // nog de Utrecht-default) is precies wat dit bij Lex bleek te zijn.
  if (!binnenBereik.length) {
    const dichtstbij = metAfstand[0];
    console.log(
      `[weer] getij: 0 van de ${metAfstand.length} kandidaat-stations binnen ${STRAAL_KM}km van HOME_LAT/HOME_LON (${homeLat}, ${homeLon})` +
        (dichtstbij ? ` — dichtstbijzijnde is ${dichtstbij.naam} op ${dichtstbij.afstandTotJouKm}km. Klopt HOME_LAT/HOME_LON in .env?` : '.')
    );
    return [];
  }
  console.log(
    `[weer] getij: ${binnenBereik.length} station(s) binnen ${STRAAL_KM}km: ${binnenBereik
      .map((k) => `${k.naam} (${k.afstandTotJouKm}km)`)
      .join(', ')}`
  );

  const resultaten = await Promise.allSettled(binnenBereik.map((k) => getijVoorStation(k)));

  const signalen = [];
  resultaten.forEach((r, i) => {
    const kandidaat = binnenBereik[i];
    if (r.status === 'rejected') {
      console.error(`[weer] getij: ophalen voor ${kandidaat.naam} mislukt,`, r.reason?.message ?? r.reason);
      return;
    }
    if (!r.value) return;
    const { eerstvolgendHoog, eerstvolgendLaag } = r.value;
    signalen.push(
      makeSignal({
        id: `getij-${kandidaat.code}`,
        categorie: 'hemel',
        titel: `Getij — ${kandidaat.naam}`,
        ernst: 'info',
        tijd: new Date().toISOString(),
        detail: {
          station: kandidaat.naam,
          afstandTotJouKm: kandidaat.afstandTotJouKm,
          hoogwaterIso: eerstvolgendHoog ? new Date(eerstvolgendHoog.tijdMs).toISOString() : null,
          hoogwaterCm: eerstvolgendHoog ? Math.round(eerstvolgendHoog.hoogteCm) : null,
          laagwaterIso: eerstvolgendLaag ? new Date(eerstvolgendLaag.tijdMs).toISOString() : null,
          laagwaterCm: eerstvolgendLaag ? Math.round(eerstvolgendLaag.hoogteCm) : null,
        },
      })
    );
  });
  return signalen;
}
