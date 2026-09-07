// 2026-09-07, op verzoek van Lex (na de vraag wat "Fl(4)W.20s32m28M · Horn(U)30s
// · Racon(T)" bij LP Goeree betekent): lichtkarakter, misthoorn en racon van
// zeemarkeringen (lichttorens, lichtplatforms, boeien) bij een meetpunt, in
// de gangbare zeekaartnotatie, voor de popup van de Stations-laag.
//
// Bron: OpenStreetMap/OpenSeaMap via de Overpass API -- de seamark:*-tags
// (seamark:light:character/group/colour/period/height/range,
// seamark:fog_signal:category/group/period, seamark:radar_transponder:
// category/group). Per opgevraagde positie één Overpass-verzoek naar alle
// seamark-objecten binnen STRAAL_M; het resultaat wordt lang gecachet
// (lichtkarakters veranderen zelden) én op schijf bewaard, zodat een
// herstart niet opnieuw naar Overpass hoeft. Cache-sleutel is de positie
// afgerond op ~100 m, zodat KNMI- en RWS-punt op dezelfde paal één entry delen.
// Overpass is een gedeelde vrijwilligersdienst: bewust zuinig (lange cache,
// serieel, korte timeout) en met een nette User-Agent.
import { readFileSync, mkdirSync, writeFile } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Meerdere publieke Overpass-servers; bij een 5xx/timeout op de eerste wordt
// de volgende geprobeerd (2026-09-07, na een 504 bij K13-A).
const OVERPASS_URLS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const STRAAL_M = 1000; // standaard; de aanroeper mag tot STRAAL_MAX_M vragen (KNMI-platforms op open zee: 3 km, zie frontend)
const STRAAL_MAX_M = 5000;
const CACHE_MS = 30 * 24 * 60 * 60 * 1000; // 30 dagen
const FOUT_CACHE_MS = 5 * 60 * 1000; // na een mislukking 5 min niet opnieuw proberen (was een uur; Overpass-504's zijn meestal kort)
const __dirname = dirname(fileURLToPath(import.meta.url));
const STAAT_BESTAND = join(__dirname, '..', '..', 'data', 'zeemarkering-cache.json');

const cache = laadCache(); // sleutel -> { tijdMs, markeringen | null (fout) }
let inFlight = null; // serieel: één Overpass-verzoek tegelijk

function laadCache() {
  try {
    const ruw = JSON.parse(readFileSync(STAAT_BESTAND, 'utf-8'));
    return new Map(Object.entries(ruw));
  } catch {
    return new Map();
  }
}

function bewaarCache() {
  try {
    mkdirSync(dirname(STAAT_BESTAND), { recursive: true });
    writeFile(STAAT_BESTAND, JSON.stringify(Object.fromEntries(cache)), () => {});
  } catch { /* niet fataal */ }
}

const KLEUR = { white: 'W', red: 'R', green: 'G', yellow: 'Y', blue: 'Bu', orange: 'Or', amber: 'Am', violet: 'Vi' };
const KARAKTER = { fixed: 'F', flashing: 'Fl', long_flashing: 'LFl', quick: 'Q', very_quick: 'VQ', ultra_quick: 'UQ', isophase: 'Iso', occulting: 'Oc', interrupted_quick: 'IQ', interrupted_very_quick: 'IVQ', morse: 'Mo', fixed_flashing: 'FFl', alternating: 'Al' };
const MIST = { horn: 'Horn', siren: 'Siren', diaphone: 'Dia', bell: 'Bell', whistle: 'Whis', gong: 'Gong', explosive: 'Explos', reed: 'Reed', tyfon: 'Tyfon' };

// Eén licht (prefix 'seamark:light:' of 'seamark:light:1:' enz.) naar
// kaartnotatie: Fl(4)W.20s32m28M.
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
  // AIS-baken (fysiek of virtueel AtoN) -- de paarse "AIS"-cirkel op de zeekaart.
  const radioCat = tags['seamark:radio_station:category'] ?? '';
  const ais = /ais/.test(radioCat) ? (/virtual/.test(tags['seamark:radio_station:category'] ?? '') || tags['seamark:virtual_aton:category'] ? 'AIS (virtueel)' : 'AIS') : null;
  if (!lichten.length && !mist && !racon && !ais) return null;
  const naam = tags['seamark:name'] ?? tags.name ?? null;
  const type = tags['seamark:type'] ?? null;
  return { naam, type, lichten, mist, racon, ais, lat, lon };
}

async function vraagOverpass(lat, lon, straalM) {
  // Ook objecten zonder seamark:type maar mét lichtkarakter, misthoorn of
  // racon (komt voor bij platforms die alleen als man_made=offshore_platform
  // getagd zijn).
  const rond = `(around:${straalM},${lat},${lon})`;
  const q = `[out:json][timeout:15];(nwr${rond}["seamark:type"];nwr${rond}["seamark:light:character"];nwr${rond}["seamark:fog_signal:category"];nwr${rond}["seamark:radar_transponder:category"];nwr${rond}["seamark:radio_station:category"];);out center tags;`;
  let laatsteFout = null;
  let body = null;
  for (const url of OVERPASS_URLS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'weer-app (persoonlijk, github.com/Lexvisser)' },
        body: `data=${encodeURIComponent(q)}`,
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`${new URL(url).host} gaf status ${res.status}`);
      body = await res.json();
      break;
    } catch (err) {
      laatsteFout = err;
    }
  }
  if (!body) throw laatsteFout ?? new Error('Overpass onbereikbaar');
  return (body.elements ?? [])
    .map((e) => markeringUitTags(e.tags ?? {}, e.lat ?? e.center?.lat ?? null, e.lon ?? e.center?.lon ?? null))
    .filter(Boolean);
}

export async function fetchZeemarkering({ lat, lon, straalM }) {
  const straal = Math.min(STRAAL_MAX_M, Math.max(100, Number(straalM) || STRAAL_M));
  const sleutel = `${lat.toFixed(3)},${lon.toFixed(3)},${straal}`;
  const nu = Date.now();
  const bestaand = cache.get(sleutel);
  if (bestaand && nu - bestaand.tijdMs < (bestaand.markeringen ? CACHE_MS : FOUT_CACHE_MS)) {
    return { markeringen: bestaand.markeringen ?? [], uitCache: true };
  }
  while (inFlight) await inFlight.catch(() => {});
  inFlight = (async () => {
    try {
      const markeringen = await vraagOverpass(lat, lon, straal);
      cache.set(sleutel, { tijdMs: Date.now(), markeringen });
      bewaarCache();
      return { markeringen, uitCache: false };
    } catch (err) {
      console.warn(`[weer] zeemarkering ${sleutel} mislukt: ${err.message ?? err}`);
      cache.set(sleutel, { tijdMs: Date.now(), markeringen: null });
      bewaarCache();
      return { markeringen: [], fout: true };
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
