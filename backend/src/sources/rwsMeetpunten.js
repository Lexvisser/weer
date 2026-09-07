// 2026-09-07, op verzoek van Lex (vervolg op de KNMI-weerstations-laag):
// RWS-meetpunten op het water binnen een straal rond huis -- actuele
// WATERSTAND, WIND en GOLFHOOGTE per meetpunt, als aanvulling op de
// KNMI-stations (die geen golven en geen waterstanden kennen). Zelfde
// WADAR-dienst als sources/getij.js (zie het voorbehoud daar over de
// overstap van het oude waterwebservices-domein), maar dan met
// ProcesType 'meting' (echte waarnemingen) i.p.v. 'verwachting'.
//
// Werkwijze:
// 1. Catalogus (24u-cache) met Locaties + Grootheden: levert alle RWS-
//    locaties MET Lat/Lon (live bevestigd door Lex, 2026-09-07: velden
//    "Lat"/"Lon", stelsel ETRS89) en via AquoMetadataLocatieLijst welke
//    grootheden per locatie bestaan. Alleen locaties die minstens één van
//    GROOTHEDEN kennen en binnen de straal liggen doen mee (anders zitten er
//    honderden chemie-bemonsteringspunten tussen), op afstand gesorteerd en
//    afgekapt op MAX_LOCATIES.
// 2. Per locatie per bekende grootheid één OphalenWaarnemingen-verzoek over
//    het laatste uur; de nieuwste meting wint. 204 = "nu geen data" (geen
//    fout, grootheid valt weg). Beperkte gelijktijdigheid (MAX_TEGELIJK).
// Cache 10 min (RWS-meetfrequentie is 10 min); zelfde losse-live-route-
// opzet als knmiStations.js, geen SourceState/SOURCES-integratie.
//
// Grootheid-codes komen uit de Aquo-standaard zoals de DDL/WADAR ze
// gebruikt: WATHTE = waterhoogte t.o.v. NAP (cm), WINDSHD = windsnelheid
// (m/s), WINDRTG = windrichting (graden), Hm0 = significante golfhoogte
// (cm), Tm02 = gemiddelde golfperiode (s). De veldnamen in de respons zijn
// defensief uitgelezen (zelfde reden als in getij.js).
import { afstandKm } from '../normalize.js';

const BASE_URL = 'https://ddapi20-waterwebservices.rijkswaterstaat.nl';
const CATALOGUS_URL = `${BASE_URL}/METADATASERVICES/OphalenCatalogus`;
const WAARNEMINGEN_URL = `${BASE_URL}/ONLINEWAARNEMINGENSERVICES/OphalenWaarnemingen`;

const GROOTHEDEN = {
  WATHTE: 'waterstandCm',
  WINDSHD: 'windMs',
  WINDRTG: 'windRichtingGraden',
  Hm0: 'golfhoogteCm',
  Tm02: 'golfperiodeS',
};
const CATALOGUS_CACHE_MS = 24 * 60 * 60 * 1000;
const METINGEN_CACHE_MS = 10 * 60 * 1000;
const MAX_TEGELIJK = 4;
const MAX_LOCATIES = 120; // 2026-09-07: heel NL, maar afgekapt op de 120 dichtstbijzijnde (anders honderden rivierpeilschalen)
const STRAAL_STANDAARD_KM = 60;
const STRAAL_MAX_KM = 400;

let catalogusCache = null; // { tijdMs, locaties: [{ code, naam, lat, lon, grootheden: Set }] }
let metingenCache = null; // { tijdMs, straalKm, meetpunten }
let metingenInFlight = null;
// 2026-09-07-fix (na Lex' eerste live-test: 29 van de 120 dichtstbijzijnde
// locaties leverden iets -- de catalogus bevat ook honderden locaties die
// ooit een waterstand hadden maar nu niets meer meten, en die verdrongen de
// kustpunten met wind/golven). Locaties die een ronde lang niets leveren
// worden DOOD_MS overgeslagen, zodat de lijst elke ronde opschuift naar
// locaties die wel live zijn; en locaties met wind of golven (de kust) doen
// altijd mee, los van de MAX_LOCATIES-afkap voor de peilschalen.
const DOOD_MS = 6 * 60 * 60 * 1000;
const doodTot = new Map(); // code -> tijdMs tot wanneer overslaan

async function haalCatalogus() {
  const nu = Date.now();
  if (catalogusCache && nu - catalogusCache.tijdMs < CATALOGUS_CACHE_MS) return catalogusCache.locaties;
  const res = await fetch(CATALOGUS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ CatalogusFilter: { Locaties: true, Grootheden: true } }),
  });
  if (!res.ok) throw new Error(`RWS-catalogus gaf status ${res.status}`);
  const body = await res.json();
  // Metadata-id -> grootheidcode (alleen de codes die we willen).
  const grootheidPerMeta = new Map();
  (body.AquoMetadataLijst ?? []).forEach((m) => {
    const code = m?.Grootheid?.Code ?? m?.Grootheid_Code ?? null;
    if (code && GROOTHEDEN[code]) grootheidPerMeta.set(m.AquoMetadata_MessageID, code);
  });
  // Locatie-id -> set grootheidcodes.
  const groothedenPerLocatie = new Map();
  (body.AquoMetadataLocatieLijst ?? []).forEach((k) => {
    const code = grootheidPerMeta.get(k.AquoMetaData_MessageID);
    if (!code) return;
    if (!groothedenPerLocatie.has(k.Locatie_MessageID)) groothedenPerLocatie.set(k.Locatie_MessageID, new Set());
    groothedenPerLocatie.get(k.Locatie_MessageID).add(code);
  });
  const locaties = (body.LocatieLijst ?? [])
    .filter((l) => l.Code && Number.isFinite(l.Lat) && Number.isFinite(l.Lon))
    .map((l) => ({ code: l.Code, naam: l.Naam ?? l.Code, lat: l.Lat, lon: l.Lon, grootheden: groothedenPerLocatie.get(l.Locatie_MessageID) ?? new Set() }))
    .filter((l) => l.grootheden.size > 0);
  console.log(`[weer] rws-meetpunten: catalogus geladen, ${locaties.length} locaties met waterstand/wind/golven (van ${(body.LocatieLijst ?? []).length}); ${grootheidPerMeta.size} metadata-regels gematcht`);
  catalogusCache = { tijdMs: nu, locaties };
  return locaties;
}

async function haalLaatsteWaarde(code, grootheidCode) {
  const tot = new Date();
  const vanaf = new Date(tot.getTime() - 60 * 60 * 1000);
  const res = await fetch(WAARNEMINGEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      Locatie: { Code: code },
      AquoPlusWaarnemingMetadata: { AquoMetadata: { Grootheid: { Code: grootheidCode }, ProcesType: 'meting' } },
      Periode: { Begindatumtijd: vanaf.toISOString(), Einddatumtijd: tot.toISOString() },
    }),
  });
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`status ${res.status}`);
  const body = await res.json();
  const reeks = body?.WaarnemingenLijst?.[0]?.MetingenLijst ?? body?.WaarnemingenLijst?.[0]?.metingenLijst ?? [];
  let beste = null;
  for (const m of reeks) {
    const tijdMs = m?.Tijdstip ? new Date(m.Tijdstip).getTime() : NaN;
    const ruw = m?.Meetwaarde?.Waarde_Numeriek ?? m?.Meetwaarde?.waarde_Numeriek ?? m?.waarde;
    const waarde = ruw != null ? Number(ruw) : NaN;
    // RWS gebruikt grote sentinel-waarden (bv. 999999999) voor "ontbreekt".
    if (!Number.isFinite(tijdMs) || !Number.isFinite(waarde) || Math.abs(waarde) > 100000) continue;
    if (!beste || tijdMs > beste.tijdMs) beste = { tijdMs, waarde };
  }
  return beste;
}

async function haalMeetpunt(loc) {
  const meting = { tijd: null };
  let iets = false;
  for (const grootheid of loc.grootheden) {
    try {
      const w = await haalLaatsteWaarde(loc.code, grootheid);
      if (!w) continue;
      meting[GROOTHEDEN[grootheid]] = w.waarde;
      if (!meting.tijd || w.tijdMs > new Date(meting.tijd).getTime()) meting.tijd = new Date(w.tijdMs).toISOString();
      iets = true;
    } catch (err) {
      console.warn(`[weer] rws-meetpunten: ${loc.naam}/${grootheid} mislukt: ${err.message ?? err}`);
    }
  }
  if (meting.windMs != null) {
    meting.windKn = Math.round(meting.windMs * 1.94384 * 10) / 10;
    meting.windBft = msNaarBft(meting.windMs);
  }
  return iets ? meting : null;
}

function msNaarBft(ms) {
  const grenzen = [0.3, 1.6, 3.4, 5.5, 8.0, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7];
  let bft = 0;
  for (const g of grenzen) if (ms >= g) bft += 1;
  return bft;
}

async function haalAlle(locaties) {
  const resultaat = new Array(locaties.length);
  let volgende = 0;
  const werker = async () => {
    while (volgende < locaties.length) {
      const i = volgende++;
      const loc = locaties[i];
      const meting = await haalMeetpunt(loc);
      resultaat[i] = { code: loc.code, naam: loc.naam, lat: loc.lat, lon: loc.lon, afstandKm: loc.afstandKm, grootheden: [...loc.grootheden], meting };
    }
  };
  await Promise.all(Array.from({ length: Math.min(MAX_TEGELIJK, locaties.length) }, werker));
  return resultaat;
}

export async function fetchRwsMeetpunten({ homeLat, homeLon, straalKm }) {
  const straal = Math.min(STRAAL_MAX_KM, Math.max(5, Number(straalKm) || STRAAL_STANDAARD_KM));
  const nu = Date.now();
  if (metingenCache && metingenCache.straalKm === straal && nu - metingenCache.tijdMs < METINGEN_CACHE_MS) {
    return { straalKm: straal, bijgewerkt: new Date(metingenCache.tijdMs).toISOString(), meetpunten: metingenCache.meetpunten };
  }
  if (metingenInFlight) return metingenInFlight;
  metingenInFlight = (async () => {
    try {
      const alle = await haalCatalogus();
      const nuMs = Date.now();
      const kandidaten = alle
        .map((l) => ({ ...l, afstandKm: afstandKm(homeLat, homeLon, l.lat, l.lon) }))
        .filter((l) => l.afstandKm <= straal && !(doodTot.get(l.code) > nuMs))
        .sort((a, b) => a.afstandKm - b.afstandKm);
      const metWindOfGolven = kandidaten.filter((l) => l.grootheden.has('WINDSHD') || l.grootheden.has('Hm0'));
      const alleenPeil = kandidaten.filter((l) => !metWindOfGolven.includes(l)).slice(0, MAX_LOCATIES);
      const binnen = [...metWindOfGolven, ...alleenPeil];
      const resultaten = await haalAlle(binnen);
      resultaten.filter((p) => !p.meting).forEach((p) => doodTot.set(p.code, nuMs + DOOD_MS));
      const meetpunten = resultaten.filter((p) => p.meting); // alleen punten die NU iets meten
      console.log(`[weer] rws-meetpunten: ${meetpunten.length}/${binnen.length} meetpunten binnen ${straal} km met actuele meting (${metWindOfGolven.length} kandidaten met wind/golven; ${doodTot.size} locaties tijdelijk overgeslagen)`);
      metingenCache = { tijdMs: Date.now(), straalKm: straal, meetpunten };
      return { straalKm: straal, bijgewerkt: new Date(metingenCache.tijdMs).toISOString(), meetpunten };
    } finally {
      metingenInFlight = null;
    }
  })();
  return metingenInFlight;
}
