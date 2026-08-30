// isobaren.js — isobaren en H/L-drukcentra zelf getekend uit een modeldrukveld,
// als vervanging van de rafelige, uit de DWD-bitmap geknipte isobaren en de
// (te grote) H/T- en druk-labels van dwdFronten.js. 2026-08-30, op verzoek
// van Lex ("kan dan ook de grote waarde 1000 en T kleiner gemaakt worden";
// randvoorwaarde: "het moet goed blijven voelen en betrouwbaar worden").
// Dit is route 2 uit de OPENSTAAND-aantekening in dwdFronten.js.
//
// BRON: Open-Meteo forecast-API (gratis, geen sleutel; dezelfde bron als
// openmeteo.js voor het thuisweer), variabele pressure_msl (luchtdruk
// herleid tot zeeniveau) per uur, model "best_match" (in dit gebied
// ICON/ECMWF). Open-Meteo levert geen raster, dus we vragen een RASTER VAN
// PUNTEN op: het kaartgebied van de fronten-laag (dwdFronten.BBOX,
// -30..35E / 40..75N) om de RASTER_STAP graden, in batches van
// BATCH_GROOTTE locaties per HTTP-request (meerdere komma-gescheiden
// coördinaten per call).
//
// BUDGET (fair use Open-Meteo: 10.000 calls/dag; ga er voorzichtigheids-
// halve van uit dat elke LOCATIE in een multi-locatie-request als één call
// telt): bij 1,5 graad is het raster 44 x 24 = 1056 punten; elke
// VERVERS_INTERVAL_MS (4 uur) opnieuw = ~6300 calls/dag, ruim onder de
// limiet en met marge voor het thuisweer en een herhaalde poging na een
// fout. Omdat we per punt de komende FORECAST_UREN uren meevragen, kan de
// kaart tussen twee ophaalrondes toch elk uur het bij dat uur horende
// drukveld tonen (zie huidigeIsobaren): een ophaalronde van 14:00 heeft de
// velden voor 14:00 t/m 22:00 al in huis.
//
// VERWERKING (puur JS, geen dependencies):
// 1. drukveld (hPa) op het grove raster; kwaliteitscontrole: geen gaten,
//    alle waarden 900..1090 hPa — anders wordt de ronde als mislukt
//    beschouwd en blijft het vorige resultaat staan;
// 2. bicubisch (Catmull-Rom) opschalen naar FIJN_STAP graden zodat de
//    contouren vloeiend lopen en niet hoekig langs de rasterpunten;
// 3. marching squares per isobaar-niveau (elke ISOBAAR_STAP hPa), segmenten
//    aaneenrijgen tot polylijnen, licht vereenvoudigen (Douglas-Peucker);
// 4. H/L: lokale maxima/minima op het grove raster met een minimale
//    prominentie t.o.v. de omringende ring, zodat een vlak drukveld niet
//    vol komt te staan met betekenisloze letters.
// Het resultaat per uur wordt gecachet; de frontend haalt /api/isobaren op
// en tekent de lijnen als Leaflet-polylines met eigen (kleine) labels.

import { BBOX } from './dwdFronten.js';

export const RASTER_STAP = 1.5;
const FIJN_STAP = 0.25;
export const ISOBAAR_STAP = 5;
const HOOFD_ISOBAAR_STAP = 10; // krijgt een label en een iets dikkere lijn
const FORECAST_UREN = 9;
// 2026-08-30 (eerste run op lexdev-nw): 150 locaties per request gaf
// meteen "HTTP 429" op batch 1 — Open-Meteo weegt/burst-limiteert een
// multi-locatie-request kennelijk strenger dan de documentatie doet
// vermoeden. Daarom: kleine batches, een adempauze ertussen, en bij een
// 429 wachten (Retry-After als ze die meegeven, anders BACKOFF_MS) en die
// batch één keer opnieuw proberen. Lukt het dan nog niet, dan is de hele
// ronde mislukt en probeert server.js het bij de volgende 30-min-tik weer.
const BATCH_GROOTTE = 40;
// 2026-08-30 (tweede run): de 429 kwam telkens rond batch 16-22, dus na
// ~650-900 locaties binnen een minuut — Open-Meteo's 600 calls/minuut
// telt dus elke locatie. Met 40 per 5 s blijven we op 480/min, met marge
// voor het thuisweer-pollen; een ronde duurt dan ~2,5 min, zonder 429-dans.
const BATCH_PAUZE_MS = 5000;
const BACKOFF_MS = 65 * 1000;
export const VERVERS_INTERVAL_MS = 4 * 60 * 60 * 1000;
const EXTREMUM_PROMINENTIE_HPA = 1.5; // t.o.v. de ring op EXTREMUM_RING rasterpunten afstand
const EXTREMUM_RING = 3; // 4,5 graad: een hogedrukgebied is breed en vlak, bij 2 werd 'ie gemist

export const BRON_URL = 'https://api.open-meteo.com/v1/forecast';

// Rasterpunten: rij voor rij van noord naar zuid, per rij van west naar oost.
function rasterCoordinaten() {
  const lats = [], lons = [];
  for (let lat = BBOX.latN; lat >= BBOX.latS - 1e-9; lat -= RASTER_STAP) lats.push(Number(lat.toFixed(4)));
  for (let lon = BBOX.lonW; lon <= BBOX.lonE + 1e-9; lon += RASTER_STAP) lons.push(Number(lon.toFixed(4)));
  return { lats, lons };
}

let laatsteVeld = null; // { lats, lons, tijden: [ISO], velden: [Float32Array], model, bijgewerkt }
let laatsteFout = null;
const contourCache = new Map(); // tijdISO -> resultaat

export function huidigeIsobarenStatus() {
  return { beschikbaar: !!laatsteVeld, bijgewerkt: laatsteVeld?.bijgewerkt ?? null, fout: laatsteFout };
}

export async function fetchIsobaren() {
  const t0 = Date.now();
  const { lats, lons } = rasterCoordinaten();
  const punten = [];
  for (const lat of lats) for (const lon of lons) punten.push({ lat, lon });
  const perPunt = new Array(punten.length).fill(null);
  let tijden = null;
  for (let start = 0; start < punten.length; start += BATCH_GROOTTE) {
    const batch = punten.slice(start, start + BATCH_GROOTTE);
    const params = new URLSearchParams({
      latitude: batch.map((p) => p.lat).join(','),
      longitude: batch.map((p) => p.lon).join(','),
      hourly: 'pressure_msl',
      forecast_hours: String(FORECAST_UREN),
      timezone: 'UTC',
      cell_selection: 'nearest',
    });
    if (start > 0) await new Promise((r) => setTimeout(r, BATCH_PAUZE_MS));
    const batchNr = start / BATCH_GROOTTE + 1;
    let res = await haalBatch(params);
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after'));
      const wacht = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : BACKOFF_MS;
      console.warn(`[weer] isobaren: HTTP 429 op batch ${batchNr}, ${Math.round(wacht / 1000)} s wachten en opnieuw`);
      await new Promise((r) => setTimeout(r, wacht));
      res = await haalBatch(params);
    }
    if (!res.ok) throw new Error(`Open-Meteo gaf HTTP ${res.status} (batch ${batchNr} van ${Math.ceil(punten.length / BATCH_GROOTTE)})`);
    const body = await res.json();
    // Eén locatie -> object, meerdere -> array; beide netjes afhandelen.
    const lijst = Array.isArray(body) ? body : [body];
    if (lijst.length !== batch.length) throw new Error(`Open-Meteo gaf ${lijst.length} locaties terug, ${batch.length} verwacht`);
    for (let k = 0; k < lijst.length; k++) {
      const h = lijst[k]?.hourly;
      if (!h?.time?.length || !Array.isArray(h.pressure_msl)) throw new Error('Open-Meteo-antwoord zonder hourly.pressure_msl');
      if (!tijden) tijden = h.time.map((t) => (t.endsWith('Z') ? t : `${t}:00Z`).replace(/:00:00Z$/, ':00Z'));
      if (h.time.length !== tijden.length) throw new Error('Open-Meteo: ongelijk aantal tijdstappen tussen locaties');
      perPunt[start + k] = h.pressure_msl;
    }
  }
  // Kwaliteitscontrole: geen gaten, plausibele waarden.
  const velden = tijden.map(() => new Float32Array(punten.length));
  for (let p = 0; p < punten.length; p++) {
    const reeks = perPunt[p];
    for (let t = 0; t < tijden.length; t++) {
      const v = reeks?.[t];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 900 || v > 1090) {
        throw new Error(`drukveld onbruikbaar: punt ${punten[p].lat},${punten[p].lon} uur ${tijden[t]} = ${v}`);
      }
      velden[t][p] = v;
    }
  }
  laatsteVeld = { lats, lons, tijden, velden, model: 'best_match', bijgewerkt: new Date().toISOString() };
  laatsteFout = null;
  contourCache.clear();
  console.log(`[weer] isobaren: drukveld opgehaald in ${Date.now() - t0} ms (${lats.length}x${lons.length} punten, ${tijden.length} uren vanaf ${tijden[0]})`);
  return laatsteVeld;
}

function haalBatch(params) {
  return fetch(`${BRON_URL}?${params}`, {
    headers: { 'User-Agent': 'weer-app (lexvisser@gmail.com)' },
    signal: AbortSignal.timeout(30000),
  });
}

export function noteerIsobarenFout(err) {
  laatsteFout = { tijd: new Date().toISOString(), melding: String(err?.message ?? err) };
}

// Kies het uur dat het dichtst bij "nu" ligt (of het laatste als we
// voorbij het venster zijn — dan is de ophaalronde kennelijk achterop
// geraakt; de frontend toont de geldigheidstijd, dus dat blijft zichtbaar).
export function huidigeIsobaren(nu = Date.now()) {
  if (!laatsteVeld) return null;
  const { tijden } = laatsteVeld;
  let beste = 0, besteAfstand = Infinity;
  for (let t = 0; t < tijden.length; t++) {
    const afstand = Math.abs(new Date(tijden[t]).getTime() - nu);
    if (afstand < besteAfstand) { besteAfstand = afstand; beste = t; }
  }
  const tijd = tijden[beste];
  if (!contourCache.has(tijd)) contourCache.set(tijd, berekenIsobaren(laatsteVeld, beste));
  return contourCache.get(tijd);
}

export function berekenIsobaren(veld, tijdIndex) {
  const t0 = Date.now();
  const { lats, lons, velden, tijden } = veld;
  const grof = velden[tijdIndex];
  const nLat = lats.length, nLon = lons.length;
  // Opschalen (bicubisch) naar het fijne raster.
  const fijn = opschalen(grof, nLon, nLat, RASTER_STAP / FIJN_STAP);
  const fLat = (i) => lats[0] - i * FIJN_STAP;
  const fLon = (j) => lons[0] + j * FIJN_STAP;
  let min = Infinity, max = -Infinity;
  for (const v of grof) { if (v < min) min = v; if (v > max) max = v; }
  const lijnen = [];
  const eersteNiveau = Math.ceil(min / ISOBAAR_STAP) * ISOBAAR_STAP;
  for (let niveau = eersteNiveau; niveau <= max; niveau += ISOBAAR_STAP) {
    for (const pad of contouren(fijn.data, fijn.breedte, fijn.hoogte, niveau)) {
      const punten = vereenvoudig(pad.map(([x, y]) => [fLat(y), fLon(x)]), 0.04);
      if (punten.length < 3) continue;
      lijnen.push({ hpa: niveau, hoofd: niveau % HOOFD_ISOBAAR_STAP === 0, punten: punten.map(([la, lo]) => [Number(la.toFixed(3)), Number(lo.toFixed(3))]) });
    }
  }
  const extrema = zoekExtrema(grof, nLon, nLat, lats, lons).map((e) => verfijnExtremum(e, fijn, fLat, fLon));
  const resultaat = { geldig: tijden[tijdIndex], bijgewerkt: veld.bijgewerkt, model: veld.model, bbox: BBOX, stapHpa: ISOBAAR_STAP, lijnen, extrema };
  console.log(`[weer] isobaren: ${lijnen.length} lijnen en ${extrema.length} drukcentra berekend voor ${tijden[tijdIndex]} in ${Date.now() - t0} ms`);
  return resultaat;
}

// Bicubische (Catmull-Rom) interpolatie van een grof raster naar een fijn
// raster met `factor` cellen per grove cel; randen worden geklemd.
function opschalen(grof, breedte, hoogte, factor) {
  const B = (breedte - 1) * factor + 1, H = (hoogte - 1) * factor + 1;
  const data = new Float32Array(B * H);
  const g = (x, y) => grof[Math.min(hoogte - 1, Math.max(0, y)) * breedte + Math.min(breedte - 1, Math.max(0, x))];
  const cr = (p0, p1, p2, p3, t) => 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  for (let y = 0; y < H; y++) {
    const gy = y / factor, y0 = Math.floor(gy), ty = gy - y0;
    for (let x = 0; x < B; x++) {
      const gx = x / factor, x0 = Math.floor(gx), tx = gx - x0;
      const rijen = [];
      for (let dy = -1; dy <= 2; dy++) rijen.push(cr(g(x0 - 1, y0 + dy), g(x0, y0 + dy), g(x0 + 1, y0 + dy), g(x0 + 2, y0 + dy), tx));
      data[y * B + x] = cr(rijen[0], rijen[1], rijen[2], rijen[3], ty);
    }
  }
  return { data, breedte: B, hoogte: H };
}

// Marching squares: levert een lijst paden (arrays van [x, y] in fijne
// rastercoördinaten, met lineaire interpolatie langs de celranden).
// Segmenten worden per cel bepaald en daarna aaneengeregen via een index
// op hun eindpunten (afgerond op 1e-4, dus exact deelbaar met de buurcel).
function contouren(data, B, H, niveau) {
  const segmenten = [];
  const interp = (xa, ya, va, xb, yb, vb) => {
    const t = (niveau - va) / (vb - va);
    return [xa + (xb - xa) * t, ya + (yb - ya) * t];
  };
  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < B - 1; x++) {
      const v0 = data[y * B + x], v1 = data[y * B + x + 1], v2 = data[(y + 1) * B + x + 1], v3 = data[(y + 1) * B + x];
      const code = (v0 >= niveau ? 8 : 0) | (v1 >= niveau ? 4 : 0) | (v2 >= niveau ? 2 : 0) | (v3 >= niveau ? 1 : 0);
      if (code === 0 || code === 15) continue;
      const boven = () => interp(x, y, v0, x + 1, y, v1);
      const rechts = () => interp(x + 1, y, v1, x + 1, y + 1, v2);
      const onder = () => interp(x, y + 1, v3, x + 1, y + 1, v2);
      const links = () => interp(x, y, v0, x, y + 1, v3);
      switch (code) {
        case 1: case 14: segmenten.push([links(), onder()]); break;
        case 2: case 13: segmenten.push([onder(), rechts()]); break;
        case 3: case 12: segmenten.push([links(), rechts()]); break;
        case 4: case 11: segmenten.push([boven(), rechts()]); break;
        case 6: case 9: segmenten.push([boven(), onder()]); break;
        case 7: case 8: segmenten.push([links(), boven()]); break;
        case 5: case 10: {
          // Zadelpunt: beslissen op het celgemiddelde.
          const midden = (v0 + v1 + v2 + v3) / 4;
          if ((code === 5) === (midden >= niveau)) { segmenten.push([links(), boven()]); segmenten.push([onder(), rechts()]); }
          else { segmenten.push([links(), onder()]); segmenten.push([boven(), rechts()]); }
          break;
        }
        default: break;
      }
    }
  }
  return rijgSegmenten(segmenten);
}

function rijgSegmenten(segmenten) {
  const sleutel = ([x, y]) => `${Math.round(x * 1e4)},${Math.round(y * 1e4)}`;
  const index = new Map(); // sleutel -> [segmentIndex...]
  segmenten.forEach((s, i) => {
    for (const p of s) {
      const k = sleutel(p);
      if (!index.has(k)) index.set(k, []);
      index.get(k).push(i);
    }
  });
  const gebruikt = new Uint8Array(segmenten.length);
  const paden = [];
  const volg = (startPunt, pad, vooraan) => {
    let punt = startPunt;
    for (;;) {
      const kandidaten = index.get(sleutel(punt)) ?? [];
      let volgende = -1;
      for (const i of kandidaten) if (!gebruikt[i]) { volgende = i; break; }
      if (volgende < 0) break;
      gebruikt[volgende] = 1;
      const [a, b] = segmenten[volgende];
      const ander = sleutel(a) === sleutel(punt) ? b : a;
      if (vooraan) pad.unshift(ander); else pad.push(ander);
      punt = ander;
    }
  };
  for (let i = 0; i < segmenten.length; i++) {
    if (gebruikt[i]) continue;
    gebruikt[i] = 1;
    const [a, b] = segmenten[i];
    const pad = [a, b];
    volg(b, pad, false);
    volg(a, pad, true);
    paden.push(pad);
  }
  return paden;
}

// Douglas-Peucker in graden (lat/lon), iteratief.
function vereenvoudig(punten, tolerantie) {
  if (punten.length <= 2) return punten;
  const houd = new Uint8Array(punten.length);
  houd[0] = 1; houd[punten.length - 1] = 1;
  const stapel = [[0, punten.length - 1]];
  while (stapel.length) {
    const [s, e] = stapel.pop();
    let maxD = 0, idx = -1;
    const [ax, ay] = punten[s], [bx, by] = punten[e];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    for (let i = s + 1; i < e; i++) {
      const [px, py] = punten[i];
      let d;
      if (len2 === 0) d = Math.hypot(px - ax, py - ay);
      else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
        d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      }
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tolerantie && idx > 0) { houd[idx] = 1; stapel.push([s, idx], [idx, e]); }
  }
  return punten.filter((_, i) => houd[i]);
}

// H/L op het grove raster: een punt is een centrum als het strikt het
// hoogste/laagste is binnen EXTREMUM_RING rasterpunten én minstens
// EXTREMUM_PROMINENTIE_HPA verschilt van de laagste/hoogste waarde op de
// buitenrand van dat venster, zodat een vlak drukveld niet vol komt te
// staan met betekenisloze letters. Aan de rand van het raster wordt het
// venster afgekapt (de buitenste rij/kolom zelf doet niet mee).
function zoekExtrema(grof, breedte, hoogte, lats, lons) {
  const uit = [];
  const R = EXTREMUM_RING;
  for (let y = 1; y < hoogte - 1; y++) {
    for (let x = 1; x < breedte - 1; x++) {
      const v = grof[y * breedte + x];
      let isMax = true, isMin = true, ringMin = Infinity, ringMax = -Infinity;
      const y0 = Math.max(0, y - R), y1 = Math.min(hoogte - 1, y + R), x0 = Math.max(0, x - R), x1 = Math.min(breedte - 1, x + R);
      for (let yy = y0; yy <= y1; yy++) {
        for (let xx = x0; xx <= x1; xx++) {
          if (xx === x && yy === y) continue;
          const w = grof[yy * breedte + xx];
          if (w >= v) isMax = false;
          if (w <= v) isMin = false;
          if (yy === y0 || yy === y1 || xx === x0 || xx === x1) { if (w < ringMin) ringMin = w; if (w > ringMax) ringMax = w; }
        }
      }
      if (isMax && v - ringMax >= EXTREMUM_PROMINENTIE_HPA) uit.push({ type: 'H', hpa: Math.round(v), lat: lats[y], lon: lons[x] });
      else if (isMin && ringMin - v >= EXTREMUM_PROMINENTIE_HPA) uit.push({ type: 'L', hpa: Math.round(v), lat: lats[y], lon: lons[x] });
    }
  }
  return uit;
}

// Het grove rasterpunt ligt tot een halve rasterstap naast het echte
// centrum; binnen één grove cel rondom op het fijne raster het echte
// minimum/maximum opzoeken zodat de letter midden in de binnenste isobaar
// valt.
function verfijnExtremum(e, fijn, fLat, fLon) {
  const factor = RASTER_STAP / FIJN_STAP;
  const cx = Math.round((e.lon - fLon(0)) / FIJN_STAP), cy = Math.round((fLat(0) - e.lat) / FIJN_STAP);
  let bx = cx, by = cy, bv = fijn.data[cy * fijn.breedte + cx];
  for (let y = Math.max(0, cy - factor); y <= Math.min(fijn.hoogte - 1, cy + factor); y++) {
    for (let x = Math.max(0, cx - factor); x <= Math.min(fijn.breedte - 1, cx + factor); x++) {
      const v = fijn.data[y * fijn.breedte + x];
      if ((e.type === 'H' && v > bv) || (e.type === 'L' && v < bv)) { bv = v; bx = x; by = y; }
    }
  }
  return { ...e, hpa: Math.round(bv), lat: Number(fLat(by).toFixed(2)), lon: Number(fLon(bx).toFixed(2)) };
}
