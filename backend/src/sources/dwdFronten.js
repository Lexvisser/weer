// dwdFronten.js — fronten/druklabels uit DWD's handgetekende Bodenwetterkarte
// als georefereerde kaartlaag voor de Zeekaart. 2026-08-30, op verzoek van
// Lex ("doe maar proberen"), na de teruggedraaide WPC-fronten-laag van
// 2026-08-29 (zie de aantekening in server.js bij de vaarradar-sectie en
// commit fa2966e): die NOAA-bron hield praktisch op bij de Britse eilanden.
//
// BRON: opendata.dwd.de/weather/charts/analysis/, bestand
// "..._tka01,ana_bwkman_dwdc_..._LATEST_WV12.png" — DWD's manuele
// Bodenanalyse ("bwkman" = Bodenwetterkarte manuell, "dwdc" = het
// Midden-Europa-blad, 4379x3269 px, elke 6 uur: 00/06/12/18 UTC, ca. 1-3
// uur na analysetijd online). Dekt van Florida tot ver in Rusland, dus de
// hele Noordzee/Noorse Zee/Oostzee zit erop, met fronten (rood = warm,
// blauw = koud, paars = occlusie), isobaren, H/T-labels en stationsplots.
// Vrij te gebruiken (DWD open data, bronvermelding — staat in de popup).
//
// GEOREFERENTIE: de kaart is een polaire stereografische projectie. De vier
// parameters hieronder (pool-pixel x0/y0, schaal k in px per eenheid rho,
// centrale meridiaan lon0) zijn op 2026-08-30 NIET uit DWD-documentatie
// gehaald (die bestaat niet publiek) maar geFIT: 200.000 kustpixels van
// een echte dwdc-kaart (zeekleur exact rgb(133,146,163) vs. grijstinten
// land) vergeleken met een wereld-landmasker (global_land_mask, 1 km),
// Nelder-Mead over de vier parameters — 98% van de kustpixels klopt, wat
// op deze schaal subpixel-nauwkeurigheid betekent. Bolvorm, geen
// ellipsoide: het residu is verwaarloosbaar t.o.v. de lijndikte van een
// front. ALS DWD OOIT DE KAARTOPMAAK WIJZIGT klopt dit niet meer; de
// zelfcontrole hieronder (controleerKalibratie) vangt dat: hij checkt bij
// elke nieuwe kaart of een paar bekende zee- en landpunten nog de
// verwachte kleur hebben en weigert de laag anders (liever geen fronten
// dan fronten op de verkeerde plek).
//
// VERWERKING (puur JS, pngjs — geen GDAL/sharp nodig op lexdev-nw):
// 1. decode PNG;
// 2. masker: gekleurde pixels (verzadiging > 60) = fronten, altijd
//    zichtbaar; zwarte pixels alleen als ze een 5x5-opening overleven
//    (= dikke, vette tekst: H/T en de isobaar-getallen) MINUS kleine
//    compacte blobs (de gevulde stationsbolletjes). Dunne zwarte lijnen
//    (isobaren én stationsplots — even dik, niet uit elkaar te houden)
//    vallen weg: bewust, de druk-info komt al uit de NAVTEX-synopsis en de
//    stationsplots zouden alleen maar ruis zijn op de zeekaart;
// 3. warp naar Web Mercator (EPSG:3857) voor de bbox hieronder, bilineair
//    — per doelpixel lat/lon -> chartpixel via de forward-projectie;
// 4. encode als RGBA-PNG, in geheugen, geserveerd via /api/fronten.png.
import { PNG } from 'pngjs';

export const BRON_URL = 'https://opendata.dwd.de/weather/charts/analysis/Z__C_EDZW_LATEST_tka01,ana_bwkman_dwdc_O_000000_000000_LATEST_WV12.png';

// Zie de GEOREFERENTIE-toelichting bovenaan.
const PROJ = { x0: 2961.16, y0: 339.49, k: 2312.65, lon0: 9.9905 };
// Doelgebied (WGS84): ruim om de tien ZEE_GEBIEDEN uit app.js heen, incl.
// de Noorse kust en de Golf van Biskaje zodat een naderend front al te
// zien is voor het de Noordzee bereikt.
export const BBOX = { lonW: -15, lonE: 30, latS: 42, latN: 70 };
const DOEL_BREEDTE = 1400;

const SEA = [133, 146, 163];

function forward(lat, lon) {
  const rho = 2 * Math.tan(Math.PI / 4 - (lat * Math.PI) / 360);
  const ang = ((lon - PROJ.lon0) * Math.PI) / 180;
  return { x: PROJ.x0 + PROJ.k * rho * Math.sin(ang), y: PROJ.y0 + PROJ.k * rho * Math.cos(ang) };
}

function merc(lat) {
  return Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
}

// Zelfcontrole: bekende open-zee- en binnenland-punten moeten in de kaart
// de zeekleur resp. een grijstint hebben. Faalt dit, dan is de kaartopmaak
// of projectie veranderd en is de kalibratie niet meer te vertrouwen.
const CONTROLEPUNTEN = [
  { lat: 56.0, lon: 3.0, zee: true }, // centrale Noordzee
  { lat: 47.0, lon: -12.0, zee: true }, // Golf van Biskaje/Atlantiek
  { lat: 62.0, lon: 0.0, zee: true }, // Noorse Zee
  { lat: 52.5, lon: 13.4, zee: false }, // Berlijn
  { lat: 48.0, lon: 2.5, zee: false }, // Frankrijk binnenland
  { lat: 60.5, lon: 9.0, zee: false }, // Zuid-Noorwegen binnenland
];
function controleerKalibratie(png) {
  const { width, height, data } = png;
  let goed = 0;
  for (const p of CONTROLEPUNTEN) {
    const { x, y } = forward(p.lat, p.lon);
    // 9x9-omgeving: het punt zelf kan net op een isobaar/tekst vallen.
    let zeeTel = 0, landTel = 0;
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const px = Math.round(x) + dx, py = Math.round(y) + dy;
        if (px < 0 || py < 0 || px >= width || py >= height) continue;
        const i = (py * width + px) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (r === SEA[0] && g === SEA[1] && b === SEA[2]) zeeTel++;
        else if (r === g && g === b && r > 150 && r < 235) landTel++;
      }
    }
    if ((p.zee && zeeTel > landTel && zeeTel > 20) || (!p.zee && landTel > zeeTel && landTel > 20)) goed++;
  }
  return { goed, totaal: CONTROLEPUNTEN.length };
}

function bouwMasker(png) {
  const { width, height, data } = png;
  const n = width * height;
  const gekleurd = new Uint8Array(n);
  const donker = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx - mn;
    const isZee = r === SEA[0] && g === SEA[1] && b === SEA[2];
    if (sat > 60 && !isZee) gekleurd[i] = 1;
    else if (mx < 110 && sat < 40) donker[i] = 1;
  }
  // 5x5-opening op `donker`: erosie dan dilatie.
  const erosie = new Uint8Array(n);
  for (let y = 2; y < height - 2; y++) {
    for (let x = 2; x < width - 2; x++) {
      let ok = 1;
      for (let dy = -2; dy <= 2 && ok; dy++) {
        const rij = (y + dy) * width + x;
        for (let dx = -2; dx <= 2; dx++) if (!donker[rij + dx]) { ok = 0; break; }
      }
      erosie[y * width + x] = ok;
    }
  }
  const dik = new Uint8Array(n);
  for (let y = 2; y < height - 2; y++) {
    for (let x = 2; x < width - 2; x++) {
      if (!erosie[y * width + x]) continue;
      for (let dy = -2; dy <= 2; dy++) {
        const rij = (y + dy) * width + x;
        for (let dx = -2; dx <= 2; dx++) dik[rij + dx] = 1;
      }
    }
  }
  // Kleine compacte blobs (stationsbolletjes) uit `dik` halen: samenhangende
  // componenten met bounding box <= 22 px en vulgraad > 0.55 (een rond
  // bolletje vult z'n box voor ~78%, een cijfer/letter veel minder).
  const gezien = new Uint8Array(n);
  const stapel = new Int32Array(n);
  for (let s = 0; s < n; s++) {
    if (!dik[s] || gezien[s]) continue;
    let top = 0; stapel[top++] = s; gezien[s] = 1;
    const leden = [];
    let minX = width, maxX = 0, minY = height, maxY = 0;
    while (top > 0) {
      const i = stapel[--top];
      leden.push(i);
      const x = i % width, y = (i - x) / width;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      const buren = [i - 1, i + 1, i - width, i + width];
      for (const j of buren) {
        if (j < 0 || j >= n || gezien[j] || !dik[j]) continue;
        gezien[j] = 1; stapel[top++] = j;
      }
    }
    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    if (bw <= 22 && bh <= 22 && leden.length / (bw * bh) > 0.55) for (const i of leden) dik[i] = 0;
  }
  // alpha-masker: 255 fronten, 230 vette tekst, 0 rest
  const alpha = new Uint8Array(n);
  for (let i = 0; i < n; i++) alpha[i] = gekleurd[i] ? 255 : dik[i] ? 230 : 0;
  return alpha;
}

function warp(png, alpha) {
  const { width: W, height: H, data } = png;
  const OW = DOEL_BREEDTE;
  const mN = merc(BBOX.latN), mS = merc(BBOX.latS);
  const OH = Math.round((OW * (mN - mS)) / (((BBOX.lonE - BBOX.lonW) * Math.PI) / 180));
  const uit = new PNG({ width: OW, height: OH });
  const o = uit.data;
  for (let oy = 0; oy < OH; oy++) {
    const m = mN - ((oy + 0.5) / OH) * (mN - mS);
    const lat = ((2 * Math.atan(Math.exp(m)) - Math.PI / 2) * 180) / Math.PI;
    for (let ox = 0; ox < OW; ox++) {
      const lon = BBOX.lonW + ((ox + 0.5) / OW) * (BBOX.lonE - BBOX.lonW);
      const { x, y } = forward(lat, lon);
      const oi = (oy * OW + ox) * 4;
      if (x < 1 || y < 1 || x >= W - 2 || y >= H - 2) continue; // buiten de kaart: transparant
      const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
      const i00 = y0 * W + x0, i10 = i00 + 1, i01 = i00 + W, i11 = i01 + 1;
      const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
      const a = alpha[i00] * w00 + alpha[i10] * w10 + alpha[i01] * w01 + alpha[i11] * w11;
      if (a < 8) continue;
      for (let c = 0; c < 3; c++) {
        o[oi + c] = data[i00 * 4 + c] * w00 + data[i10 * 4 + c] * w10 + data[i01 * 4 + c] * w01 + data[i11 * 4 + c] * w11;
      }
      o[oi + 3] = a;
    }
  }
  return uit;
}

// Conditioneel ophalen: DWD zet 'LATEST' elke 6 uur opnieuw neer; met
// If-Modified-Since kost een ongewijzigde kaart geen 5 MB download.
let laatsteModified = null;
let laatsteResultaat = null; // { png: Buffer, analyseTijd, bijgewerkt, breedte, hoogte, kalibratie }

export function huidigeFronten() {
  return laatsteResultaat;
}

export async function fetchDwdFronten() {
  const headers = { 'User-Agent': 'weer-app (lexvisser@gmail.com)' };
  if (laatsteModified) headers['If-Modified-Since'] = laatsteModified;
  const res = await fetch(BRON_URL, { headers, signal: AbortSignal.timeout(60000) });
  if (res.status === 304) return laatsteResultaat;
  if (!res.ok) throw new Error(`DWD gaf HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const lastModified = res.headers.get('last-modified');
  const resultaat = verwerkKaart(buffer, lastModified);
  laatsteModified = lastModified;
  laatsteResultaat = resultaat;
  return resultaat;
}

export function verwerkKaart(buffer, lastModified) {
  const t0 = Date.now();
  const png = PNG.sync.read(buffer);
  const kalibratie = controleerKalibratie(png);
  if (kalibratie.goed < kalibratie.totaal - 1) {
    throw new Error(`kalibratie-zelfcontrole mislukt (${kalibratie.goed}/${kalibratie.totaal} controlepunten) — kaartopmaak gewijzigd?`);
  }
  const alpha = bouwMasker(png);
  const uit = warp(png, alpha);
  const out = PNG.sync.write(uit);
  // Analysetijd: de LATEST-bestandsnaam bevat 'm niet; Last-Modified is het
  // publicatiemoment, doorgaans 1-3 uur na de 00/06/12/18 UTC-analyse. De
  // analysetijd zelf = laatste 6-uursgrens vóór publicatie.
  let analyseTijd = null;
  if (lastModified) {
    const d = new Date(lastModified);
    if (!Number.isNaN(d.getTime())) {
      d.setUTCMinutes(0, 0, 0);
      d.setUTCHours(Math.floor(d.getUTCHours() / 6) * 6);
      analyseTijd = d.toISOString();
    }
  }
  console.log(`[weer] dwd-fronten: kaart verwerkt in ${Date.now() - t0} ms (${png.width}x${png.height} -> ${uit.width}x${uit.height}, ${Math.round(out.length / 1024)} kB, kalibratie ${kalibratie.goed}/${kalibratie.totaal})`);
  return { png: out, analyseTijd, gepubliceerd: lastModified ? new Date(lastModified).toISOString() : null, bijgewerkt: new Date().toISOString(), breedte: uit.width, hoogte: uit.height, bbox: BBOX, kalibratie };
}
