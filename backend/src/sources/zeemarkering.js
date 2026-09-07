// 2026-09-07, op verzoek van Lex (na de vraag wat "Fl(4)W.20s32m28M · Horn(U)30s
// · Racon(T)" bij LP Goeree betekent): lichtkarakter, misthoorn, racon en
// AIS-baken van zeemarkeringen (lichttorens, lichtplatforms, boeien) bij een
// meetpunt, in zeekaartnotatie, voor de popup van de Stations-laag.
//
// Opzet (Lex, 2026-09-07: "die platform-info is zo statisch als wat" en
// "ververs wel 1x per maand"):
// - Eén STATISCH bestand met alle zeemarkeringen met licht/misthoorn/racon/
//   AIS in het Nederlandse zeegebied: src/data/zeemarkeringen-nl.json
//   (gecommit, gemaakt met tools/haal-zeemarkeringen.mjs -- dat script
//   roept exporteerZeemarkeringen() hieronder aan).
// - De server leest dat bestand bij opstarten en zoekt er LOKAAL in: geen
//   Overpass per klik, geen cache, geen voorverwarmen.
// - Eén keer per VERVERS_MS (30 dagen) haalt de server zelf een verse export
//   op (één bounding-box-vraag aan Overpass, ~1 verzoek/maand) en schrijft
//   die naar data/zeemarkeringen-nl.json (runtime-map, niet in git). Bij
//   opstarten wint dat runtime-bestand als het nieuwer is dan het statische.
// (De eerste versie deed dit live per klik met een 30-dagen-cache; dat was
// traag, gevoelig voor Overpass-504's en onnodig voor data die vrijwel nooit
// verandert.)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const STATISCH_BESTAND = join(__dirname, '..', 'data', 'zeemarkeringen-nl.json');
const RUNTIME_BESTAND = join(__dirname, '..', '..', 'data', 'zeemarkeringen-nl.json');
const STRAAL_M = 1000;
const STRAAL_MAX_M = 5000;
export const VERVERS_MS = 30 * 24 * 60 * 60 * 1000;

// Bounding box: NL-kust, Wadden, Zeeuwse/Zuid-Hollandse wateren en het
// Nederlandse deel van de Noordzee t/m de noordelijke platforms (D15/F3).
const BBOX = '51.0,2.0,55.0,7.3'; // zuid,west,noord,oost
const OVERPASS_URLS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];

let markeringen = null; // [{ naam, type, lichten, mist, racon, ais, lat, lon }]
let bestandInfo = null; // { opgehaald, aantal, pad }

// ---- inlezen ---------------------------------------------------------------
function leesBestand(pad) {
  const ruw = JSON.parse(readFileSync(pad, 'utf-8'));
  return { markeringen: ruw.markeringen ?? [], opgehaald: ruw.opgehaald ?? null, pad };
}

export function laadZeemarkeringen() {
  const kandidaten = [];
  for (const pad of [RUNTIME_BESTAND, STATISCH_BESTAND]) {
    try { kandidaten.push(leesBestand(pad)); } catch { /* ontbreekt of kapot -- volgende */ }
  }
  if (!kandidaten.length) {
    markeringen = [];
    bestandInfo = { opgehaald: null, aantal: 0, pad: null };
    console.warn('[weer] zeemarkeringen: geen bestand gevonden -- draai tools/haal-zeemarkeringen.mjs');
    return;
  }
  // Nieuwste wint (runtime-export vs gecommit bestand).
  kandidaten.sort((a, b) => new Date(b.opgehaald ?? 0) - new Date(a.opgehaald ?? 0));
  const gekozen = kandidaten[0];
  markeringen = gekozen.markeringen;
  bestandInfo = { opgehaald: gekozen.opgehaald, aantal: markeringen.length, pad: gekozen.pad };
  console.log(`[weer] zeemarkeringen: ${markeringen.length} markeringen geladen (opgehaald ${gekozen.opgehaald ?? '?'}, ${gekozen.pad === RUNTIME_BESTAND ? 'runtime-export' : 'statisch bestand'})`);
}

// Hoe oud is de geladen set? Voor de maandelijkse verversing in server.js.
export function zeemarkeringenLeeftijdMs() {
  if (!bestandInfo) laadZeemarkeringen();
  return bestandInfo?.opgehaald ? Date.now() - new Date(bestandInfo.opgehaald).getTime() : Infinity;
}

// ---- opzoeken --------------------------------------------------------------
export function fetchZeemarkering({ lat, lon, straalM }) {
  if (!markeringen) laadZeemarkeringen();
  const maxM = Math.min(STRAAL_MAX_M, Math.max(100, Number(straalM) || STRAAL_M));
  const binnen = markeringen
    .map((m) => ({ ...m, afstandM: Math.round(afstandM(lat, lon, m.lat, m.lon)) }))
    .filter((m) => m.afstandM <= maxM)
    .sort((a, b) => a.afstandM - b.afstandM);
  return { markeringen: binnen, bestand: bestandInfo };
}

function afstandM(lat1, lon1, lat2, lon2) {
  const r = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

// ---- exporteren (Overpass, één bbox-vraag) ---------------------------------
const KLEUR = { white: 'W', red: 'R', green: 'G', yellow: 'Y', blue: 'Bu', orange: 'Or', amber: 'Am', violet: 'Vi' };
const KARAKTER = { fixed: 'F', flashing: 'Fl', long_flashing: 'LFl', quick: 'Q', very_quick: 'VQ', ultra_quick: 'UQ', isophase: 'Iso', occulting: 'Oc', interrupted_quick: 'IQ', interrupted_very_quick: 'IVQ', morse: 'Mo', fixed_flashing: 'FFl', alternating: 'Al' };
const MIST = { horn: 'Horn', siren: 'Siren', diaphone: 'Dia', bell: 'Bell', whistle: 'Whis', gong: 'Gong', explosive: 'Explos', reed: 'Reed', tyfon: 'Tyfon' };

function lichtTekst(tags, prefix) {
  const t = (k) => tags[`${prefix}${k}`];
  const kar = KARAKTER[t('character')] ?? t('character');
  if (!kar) return null;
  const groep = t('group') ? `(${t('group')})` : '';
  const kleur = (t('colour') ?? '').split(';').map((k) => KLEUR[k] ?? k).join('');
  const periode = t('period') ? `.${t('period')}s` : '';
  const hoogte = t('height') ? `${t('height')}m` : '';
  const dracht = t('range') ? `${t('range')}M` : '';
  return `${kar}${groep}${kleur}${periode}${hoogte}${dracht}`;
}

function markeringUitTags(tags, lat, lon) {
  const lichten = [];
  const l0 = lichtTekst(tags, 'seamark:light:');
  if (l0) lichten.push(l0);
  for (let i = 1; i <= 8; i++) {
    const li = lichtTekst(tags, `seamark:light:${i}:`);
    if (li) lichten.push(li);
  }
  let mist = null;
  const mistCat = tags['seamark:fog_signal:category'];
  if (mistCat) {
    const groep = tags['seamark:fog_signal:group'] ? `(${tags['seamark:fog_signal:group']})` : '';
    const periode = tags['seamark:fog_signal:period'] ? `${tags['seamark:fog_signal:period']}s` : '';
    mist = `${MIST[mistCat] ?? mistCat}${groep}${periode}`;
  }
  let racon = null;
  const rtCat = tags['seamark:radar_transponder:category'];
  if (rtCat) {
    const groep = tags['seamark:radar_transponder:group'] ? `(${tags['seamark:radar_transponder:group']})` : '';
    racon = `${rtCat === 'racon' ? 'Racon' : rtCat}${groep}`;
  }
  const radioCat = tags['seamark:radio_station:category'] ?? '';
  const virtueel = tags['seamark:type'] === 'virtual_aton' || !!tags['seamark:virtual_aton:category'];
  const ais = virtueel ? 'AIS (virtueel)' : /ais/.test(radioCat) ? 'AIS' : null;
  if (!lichten.length && !mist && !racon && !ais) return null;
  return {
    naam: tags['seamark:name'] ?? tags.name ?? null,
    type: tags['seamark:type'] ?? null,
    lichten, mist, racon, ais,
    lat: Math.round(lat * 1e5) / 1e5,
    lon: Math.round(lon * 1e5) / 1e5,
  };
}

async function vraagOverpass(q, log, timeoutMs = 240000) {
  let laatsteFout = null;
  for (const url of OVERPASS_URLS) {
    try {
      log(`Overpass: ${new URL(url).host} ...`);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'weer-app (persoonlijk, github.com/Lexvisser)' },
        body: `data=${encodeURIComponent(q)}`,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`${new URL(url).host} gaf status ${res.status}`);
      return await res.json();
    } catch (err) {
      log(`  mislukt: ${err.message ?? err}`);
      laatsteFout = err;
    }
  }
  throw laatsteFout ?? new Error('Overpass onbereikbaar');
}

// Haalt alles op en schrijft naar `doel`; geeft { aantal, doel } terug.
// Gebruikt door tools/haal-zeemarkeringen.mjs (doel = statisch bestand) en
// door de maandelijkse verversing in server.js (doel = runtime-bestand).
// 2026-09-07: de hele bbox in één vraag gaf een 504 op alle servers; daarom
// in tegels van ~1 graad (4 x 6 = 24 tegels; zee-tegels zijn snel), één voor
// één met een korte pauze en per tegel een tweede kans.
const TEGEL_GRADEN = 1;
const TEGEL_PAUZE_MS = 3000;

export async function exporteerZeemarkeringen({ doel = RUNTIME_BESTAND, log = (t) => console.log(`[weer] zeemarkeringen: ${t}`) } = {}) {
  const [zuid, west, noord, oost] = BBOX.split(',').map(Number);
  const alle = [];
  const gezien = new Set();
  const mislukteTegels = []; // 2026-09-07, Lex: een mislukte tegel overslaan i.p.v. alles weggooien
  let tegels = 0;
  for (let lat = zuid; lat < noord; lat += TEGEL_GRADEN) {
    for (let lon = west; lon < oost; lon += TEGEL_GRADEN) {
      tegels += 1;
      const bbox = `${lat},${lon},${Math.min(noord, lat + TEGEL_GRADEN)},${Math.min(oost, lon + TEGEL_GRADEN)}`;
      const q = `[out:json][timeout:90][bbox:${bbox}];(node["seamark:type"];way["seamark:type"];);out center tags;`;
      let body = null;
      for (let poging = 1; poging <= 2 && !body; poging++) {
        try {
          body = await vraagOverpass(q, log, 60000);
        } catch (err) {
          log(`tegel ${bbox} poging ${poging} mislukt: ${err.message ?? err}`);
          await new Promise((k) => setTimeout(k, 15000));
        }
      }
      if (!body) {
        mislukteTegels.push(bbox);
        log(`tegel ${bbox} OVERGESLAGEN na herhaalde mislukking`);
        continue;
      }
      for (const e of body.elements ?? []) {
        const sleutel = `${e.type}/${e.id}`;
        if (gezien.has(sleutel)) continue; // objecten op een tegelgrens komen dubbel terug
        gezien.add(sleutel);
        alle.push(e);
      }
      log(`tegel ${tegels} (${bbox}): ${(body.elements ?? []).length} objecten`);
      await new Promise((k) => setTimeout(k, TEGEL_PAUZE_MS));
    }
  }
  const lijst = alle
    .map((e) => markeringUitTags(e.tags ?? {}, e.lat ?? e.center?.lat, e.lon ?? e.center?.lon))
    .filter((m) => m && Number.isFinite(m.lat) && Number.isFinite(m.lon));
  if (mislukteTegels.length === tegels) throw new Error('alle tegels mislukt -- niets geschreven');
  // Bij ontbrekende tegels: wél schrijven (de rest is bruikbaar), maar de
  // bestaande markeringen uit die tegels overnemen uit de vorige set, zodat
  // een tijdelijke Overpass-storing geen gaten in de kaart slaat.
  if (mislukteTegels.length && markeringen === null) laadZeemarkeringen();
  if (mislukteTegels.length && markeringen?.length) {
    const inMislukteTegel = (m) => mislukteTegels.some((b) => { const [z, w, n, o] = b.split(',').map(Number); return m.lat >= z && m.lat < n && m.lon >= w && m.lon < o; });
    const overgenomen = markeringen.filter(inMislukteTegel);
    lijst.push(...overgenomen);
    log(`${overgenomen.length} markeringen uit de vorige set overgenomen voor de overgeslagen tegel(s)`);
  }
  mkdirSync(dirname(doel), { recursive: true });
  writeFileSync(doel, JSON.stringify({ bron: 'OpenStreetMap/OpenSeaMap via Overpass (ODbL)', opgehaald: new Date().toISOString(), bbox: BBOX, aantal: lijst.length, mislukteTegels, markeringen: lijst }));
  log(`${alle.length} seamark-objecten opgehaald, ${lijst.length} met licht/misthoorn/racon/AIS -> ${doel}${mislukteTegels.length ? ` (LET OP: ${mislukteTegels.length} tegel(s) overgeslagen: ${mislukteTegels.join(' ; ')})` : ''}`);
  markeringen = null; // volgende fetchZeemarkering() laadt opnieuw (nieuwste bestand wint)
  return { aantal: lijst.length, doel, mislukteTegels };
}
