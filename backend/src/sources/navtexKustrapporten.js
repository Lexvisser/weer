// navtexKustrapporten.js — 2026-09-08, op verzoek van Lex ("dit zijn
// weerstations?" → "zeker doe maar!"): de "coastal station reports" die
// Niton op 490 kHz uitzendt (en die Oostende/andere stations in hetzelfde
// tabelformaat kunnen sturen) als meetpunten op de Stations-laag van de
// kaart. Elke vier uur verse waarnemingen langs het Kanaal, via de eigen
// antenne — geen internetbron.
//
// Bron: de ruwe ontvangstbestanden van navtexLokaal.js (518 én 490). We
// zoeken de LAATSTE tabel met de kopregel "STATION PRES DIR WSP VS TEMP" en
// lezen de regels eronder:
//   SANDETTIE       1007 200  13   5   16
//   naam            mb   deg  kn   nm  °C     ('-' = niet gemeten)
// Stations zonder bekende positie (zie STATION_POSITIES) worden overgeslagen
// en één keer gelogd, zodat de tabel hieronder aangevuld kan worden.
//
// Zelfde losse-live-route-opzet als knmiStations.js/rwsMeetpunten.js:
// eigen kleine cache op bestands-mtime, geen SourceState. Uitvoer heeft
// dezelfde veldnamen als de RWS/KNMI-metingen (windRichtingGraden, windKn,
// windMs, windBft, luchtdrukHpa, temperatuurC) zodat de frontend dezelfde
// pil/pijl/popup-code kan hergebruiken.
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import { afstandKm } from '../normalize.js';

// Posities (benaderd, ±1 km) van de stations in Niton's rapport. Lichtschepen
// (L/V) liggen op zee; A/P = vliegveld. Sleutel = naam zoals uitgezonden,
// genormaliseerd (spaties/leestekens samengevouwen).
const STATION_POSITIES = {
  'SANDETTIE': { lat: 51.15, lon: 1.78, omschrijving: 'Sandettie lichtschip' },
  'SANDETTIE L/V': { lat: 51.15, lon: 1.78, omschrijving: 'Sandettie lichtschip' },
  'GREENICH L/V': { lat: 50.40, lon: 0.00, omschrijving: 'Greenwich lichtschip' }, // zo (met tikfout) uitgezonden
  'GREENWICH L/V': { lat: 50.40, lon: 0.00, omschrijving: 'Greenwich lichtschip' },
  'GREENWICH': { lat: 50.40, lon: 0.00, omschrijving: 'Greenwich lichtschip' },
  'HURN': { lat: 50.78, lon: -1.84, omschrijving: 'Bournemouth Airport' },
  'GUERNSEY: A/P': { lat: 49.43, lon: -2.60, omschrijving: 'Guernsey Airport' },
  'GUERNSEY A/P': { lat: 49.43, lon: -2.60, omschrijving: 'Guernsey Airport' },
  'GUERNSEY': { lat: 49.43, lon: -2.60, omschrijving: 'Guernsey Airport' },
  'JERSEY: A/P': { lat: 49.21, lon: -2.20, omschrijving: 'Jersey Airport' },
  'JERSEY A/P': { lat: 49.21, lon: -2.20, omschrijving: 'Jersey Airport' },
  'JERSEY': { lat: 49.21, lon: -2.20, omschrijving: 'Jersey Airport' },
  'PORTLAND': { lat: 50.52, lon: -2.45, omschrijving: 'Portland Bill' },
  'CHANNEL L/V': { lat: 49.90, lon: -2.90, omschrijving: 'Channel lichtschip' },
  'CHANNEL': { lat: 49.90, lon: -2.90, omschrijving: 'Channel lichtschip' },
  'PLYMOUTH': { lat: 50.35, lon: -4.12, omschrijving: 'Plymouth (Mount Batten)' },
  'CULDROSE': { lat: 50.09, lon: -5.26, omschrijving: 'RNAS Culdrose' },
  'SEVEN STONES': { lat: 50.05, lon: -6.10, omschrijving: 'Seven Stones lichtschip' },
  'SEVEN STONES L/V': { lat: 50.05, lon: -6.10, omschrijving: 'Seven Stones lichtschip' },
  'ROCHES POINT': { lat: 51.79, lon: -8.25, omschrijving: 'Roches Point (Cork)' },
  'SCILLY': { lat: 49.91, lon: -6.30, omschrijving: 'St Mary\'s, Scilly' },
  'ST MARYS': { lat: 49.91, lon: -6.30, omschrijving: 'St Mary\'s, Scilly' },
  'LANGDON BAY': { lat: 51.13, lon: 1.35, omschrijving: 'Langdon Bay (Dover)' },
  'SHOREHAM': { lat: 50.83, lon: -0.30, omschrijving: 'Shoreham' },
  'SOLENT': { lat: 50.81, lon: -1.21, omschrijving: 'Lee-on-Solent' },
  'LEE ON SOLENT': { lat: 50.81, lon: -1.21, omschrijving: 'Lee-on-Solent' },
  'ST CATHERINES PT': { lat: 50.58, lon: -1.30, omschrijving: 'St Catherine\'s Point' },
  'ST CATHERINES': { lat: 50.58, lon: -1.30, omschrijving: 'St Catherine\'s Point' },
  'BERRY HEAD': { lat: 50.40, lon: -3.48, omschrijving: 'Berry Head' },
  'BRIXHAM': { lat: 50.39, lon: -3.51, omschrijving: 'Brixham' },
  'VALENTIA': { lat: 51.94, lon: -10.24, omschrijving: 'Valentia' },
  'SHANNON': { lat: 52.70, lon: -8.92, omschrijving: 'Shannon Airport' },
  'ROSSLARE': { lat: 52.25, lon: -6.34, omschrijving: 'Rosslare' },
  'DUBLIN': { lat: 53.43, lon: -6.25, omschrijving: 'Dublin Airport' },
  'MALIN HEAD': { lat: 55.37, lon: -7.34, omschrijving: 'Malin Head' },
  // Belgisch/Nederlands (voor als Oostende-490 in hetzelfde formaat rapporteert)
  'WANDELAAR': { lat: 51.39, lon: 3.05, omschrijving: 'Wandelaar meetpaal' },
  'WESTHINDER': { lat: 51.38, lon: 2.44, omschrijving: 'Westhinder meetpaal' },
  'ZEEBRUGGE': { lat: 51.35, lon: 3.20, omschrijving: 'Zeebrugge' },
  'OOSTENDE': { lat: 51.23, lon: 2.92, omschrijving: 'Oostende' },
  'NIEUWPOORT': { lat: 51.15, lon: 2.73, omschrijving: 'Nieuwpoort' },
  'VLISSINGEN': { lat: 51.44, lon: 3.60, omschrijving: 'Vlissingen' },
};

const KOP_RE = /STATION\s+PRES\s+DIR\s+WSP\s+VS\s+TEMP/;
// naam (letters, spaties, : / ' -), dan 5 velden: druk, richting, wind, zicht, temp — '-' = geen
const RIJ_RE = /^\s*([A-Z][A-Z0-9 .:\/'\-]*?)\s{2,}(\d{3,4}|-)\s+(\d{3}|-)\s+(\d{1,3}|-)\s+(\d{1,3}|-)\s+(-?\d{1,2}|-)\s*$/;
const TIJD_RE = /(?:AT\s+)?(\d{2})(\d{2})\s*UTC/g;

const gemeldOnbekend = new Set();
let cache = null; // { sleutel, resultaat }

function normaliseerNaam(naam) {
  return naam.toUpperCase().replace(/\s+/g, ' ').replace(/\s*:\s*/g, ': ').trim();
}

function msNaarBft(ms) {
  const grenzen = [0.3, 1.6, 3.4, 5.5, 8.0, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7];
  let bft = 0;
  for (const g of grenzen) if (ms >= g) bft += 1;
  return bft;
}

function getal(v) {
  return v === '-' ? null : Number(v);
}

// Zoekt de laatste tabel in `tekst`; geeft { rapporten, tijd, khz } of null.
function parseLaatsteTabel(tekst, khz, mtime) {
  let kopIndex = -1;
  let m;
  const re = new RegExp(KOP_RE.source, 'g');
  while ((m = re.exec(tekst)) !== null) kopIndex = m.index;
  if (kopIndex < 0) return null;
  const regels = tekst.slice(kopIndex).split('\n');
  const rapporten = [];
  let begonnen = false;
  for (const regel of regels.slice(1)) {
    if (/^\s*(MB|MB\s+DEG)/.test(regel)) continue; // eenheden-regel
    const r = RIJ_RE.exec(regel);
    if (!r) {
      if (begonnen) break; // tabel is voorbij
      if (/NNNN|ZCZC/.test(regel)) break;
      continue;
    }
    begonnen = true;
    const naam = normaliseerNaam(r[1]);
    const pos = STATION_POSITIES[naam] ?? STATION_POSITIES[naam.replace(/:/g, '')];
    if (!pos) {
      if (!gemeldOnbekend.has(naam)) {
        gemeldOnbekend.add(naam);
        console.log(`[weer] navtexKustrapporten: station "${naam}" zonder bekende positie — overgeslagen (aanvullen in STATION_POSITIES)`);
      }
      continue;
    }
    const windKn = getal(r[4]);
    const windMs = windKn != null ? windKn * 0.514444 : null;
    rapporten.push({
      naam: pos.omschrijving ?? naam,
      naamUitgezonden: naam,
      lat: pos.lat,
      lon: pos.lon,
      meting: {
        luchtdrukHpa: getal(r[2]),
        windRichtingGraden: getal(r[3]),
        windKn,
        windMs: windMs != null ? Math.round(windMs * 10) / 10 : null,
        windBft: windMs != null ? msNaarBft(windMs) : null,
        zichtNm: getal(r[5]),
        temperatuurC: getal(r[6]),
      },
    });
  }
  if (!rapporten.length) return null;
  // Waarnemingstijd: laatste "HHMM UTC" in de 600 tekens vóór de kop (de
  // bulletin-kop "... REPORTS AT 1200 UTC"); anders het schrijfmoment.
  let tijd = null;
  const voor = tekst.slice(Math.max(0, kopIndex - 600), kopIndex);
  let t;
  let laatste = null;
  while ((t = TIJD_RE.exec(voor)) !== null) laatste = t;
  TIJD_RE.lastIndex = 0;
  if (laatste) {
    const d = new Date(mtime);
    d.setUTCHours(Number(laatste[1]), Number(laatste[2]), 0, 0);
    if (d.getTime() > mtime.getTime() + 60 * 60 * 1000) d.setUTCDate(d.getUTCDate() - 1); // gisteren
    tijd = d.toISOString();
  } else {
    tijd = mtime.toISOString();
  }
  return { rapporten, tijd, khz };
}

function bestanden() {
  const b518 = process.env.NAVTEX_LOKAAL_BESTAND || path.join(homedir(), 'navtex_berichten.txt');
  const b490 = process.env.NAVTEX_LOKAAL_BESTAND_490 || b518.replace(/(\.[^.\/]*)?$/, (ext) => `_490${ext}`);
  return [{ khz: 490, pad: b490 }, { khz: 518, pad: b518 }];
}

export function fetchNavtexKustrapporten({ homeLat, homeLon } = {}) {
  const lijst = bestanden().filter((b) => existsSync(b.pad));
  const sleutel = lijst.map((b) => `${b.pad}:${statSync(b.pad).mtimeMs}`).join('|');
  if (cache && cache.sleutel === sleutel) return cache.resultaat;
  let beste = null;
  for (const b of lijst) {
    const st = statSync(b.pad);
    // alleen de staart lezen: een tabel is < 2 kB, de laatste zit binnen 200 kB
    const tekst = readFileSync(b.pad, 'utf-8').slice(-200 * 1024).replace(/\r\n/g, '\n');
    const p = parseLaatsteTabel(tekst, b.khz, st.mtime);
    if (p && (!beste || new Date(p.tijd) > new Date(beste.tijd))) beste = p;
  }
  const resultaat = beste
    ? {
        bijgewerkt: beste.tijd,
        frequentieKhz: beste.khz,
        bron: `NAVTEX ${beste.khz} kHz (eigen ontvangst)`,
        rapporten: beste.rapporten.map((r) => ({
          ...r,
          afstandKm: Number.isFinite(homeLat) && Number.isFinite(homeLon) ? Math.round(afstandKm(homeLat, homeLon, r.lat, r.lon)) : null,
          meting: { ...r.meting, tijd: beste.tijd },
        })),
      }
    : { bijgewerkt: null, frequentieKhz: null, bron: null, rapporten: [] };
  if (beste) console.log(`[weer] navtexKustrapporten: ${resultaat.rapporten.length} stations uit de ${beste.khz} kHz-tabel van ${beste.tijd}`);
  cache = { sleutel, resultaat };
  return resultaat;
}
