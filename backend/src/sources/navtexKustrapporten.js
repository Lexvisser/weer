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
  // Schotland / Oost-Engeland — Cullercoats-tabel op 490 kHz (2026-09-09)
  'SULE SKERRY': { lat: 59.08, lon: -4.41, omschrijving: 'Sule Skerry' },
  'LERWICK': { lat: 60.14, lon: -1.18, omschrijving: 'Lerwick (Shetland)' },
  'KIRKWALL': { lat: 58.95, lon: -2.90, omschrijving: 'Kirkwall (Orkney)' },
  'FOULA': { lat: 60.13, lon: -2.07, omschrijving: 'Foula' },
  'WICK': { lat: 58.45, lon: -3.09, omschrijving: 'Wick Airport' },
  'WICK A/P': { lat: 58.45, lon: -3.09, omschrijving: 'Wick Airport' },
  'WICK AIRPORT': { lat: 58.45, lon: -3.09, omschrijving: 'Wick Airport' },
  'LOSSIEMOUTH': { lat: 57.71, lon: -3.32, omschrijving: 'RAF Lossiemouth' },
  'DYCE': { lat: 57.20, lon: -2.20, omschrijving: 'Aberdeen Airport (Dyce)' },
  'ABERDEEN': { lat: 57.20, lon: -2.20, omschrijving: 'Aberdeen Airport (Dyce)' },
  'LEUCHARS': { lat: 56.38, lon: -2.86, omschrijving: 'Leuchars' },
  'BOULMER': { lat: 55.42, lon: -1.60, omschrijving: 'Boulmer' },
  'DONNA NOOK': { lat: 53.47, lon: 0.15, omschrijving: 'Donna Nook' },
  'WEYBOURNE': { lat: 52.95, lon: 1.12, omschrijving: 'Weybourne' },
  'SHOEBURYNESS': { lat: 51.55, lon: 0.83, omschrijving: 'Shoeburyness' },
  'MANSTON': { lat: 51.34, lon: 1.35, omschrijving: 'Manston' },
  'TIREE': { lat: 56.50, lon: -6.88, omschrijving: 'Tiree' },
  'STORNOWAY': { lat: 58.21, lon: -6.32, omschrijving: 'Stornoway' },
  'MACHRIHANISH': { lat: 55.44, lon: -5.70, omschrijving: 'Machrihanish' },
  'BRIDLINGTON': { lat: 54.09, lon: -0.17, omschrijving: 'Bridlington' },
  'SPURN': { lat: 53.58, lon: 0.11, omschrijving: 'Spurn Head' },
  'SPURN HEAD': { lat: 53.58, lon: 0.11, omschrijving: 'Spurn Head' },
  // Belgisch/Nederlands (voor als Oostende-490 in hetzelfde formaat rapporteert)
  'WANDELAAR': { lat: 51.39, lon: 3.05, omschrijving: 'Wandelaar meetpaal' },
  'WESTHINDER': { lat: 51.38, lon: 2.44, omschrijving: 'Westhinder meetpaal' },
  'ZEEBRUGGE': { lat: 51.35, lon: 3.20, omschrijving: 'Zeebrugge' },
  'OOSTENDE': { lat: 51.23, lon: 2.92, omschrijving: 'Oostende' },
  'NIEUWPOORT': { lat: 51.15, lon: 2.73, omschrijving: 'Nieuwpoort' },
  'VLISSINGEN': { lat: 51.44, lon: 3.60, omschrijving: 'Vlissingen' },
};

// Tolerant: Cullercoats komt door als "STATION PRES DIRWSP VS TEMP" (bitfouten/spaties weg)
const KOP_RE = /STATION\s*PRES\s*DIR\s*WSP\s*VS\s*TEMP/;
// naam (letters, spaties, : / ' -), dan 5 velden: druk, richting, wind, zicht, temp — '-' = geen
const RIJ_RE = /^\s*([A-Z][A-Z0-9 .:\/'\-]*?)\s{2,}(\d{3,4}|-)\s+(\d{3}|-)\s+(\d{1,3}|-)\s+(\d{1,3}|-)\s+(-?\d{1,2}|-)\s*$/;
const TIJD_RE = /(?:AT\s+)?(\d{2})(\d{2})\s*UTC/g;

const gemeldOnbekend = new Set();
let cache = null; // { sleutel, resultaat }

function normaliseerNaam(naam) {
  return naam.toUpperCase().replace(/\s+/g, ' ').replace(/\s*:\s*/g, ': ').trim();
}

// Bitfout-tolerant opzoeken (2026-09-09, "MANSVON" = MANSTON): eerst exact,
// anders de bekende naam met de kleinste bewerkingsafstand, mits die ≤ 2 is
// en de naam lang genoeg is om niet per ongeluk te matchen.
function levenshtein(a, b) {
  const rij = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    let vorige = rij[0];
    rij[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const tmp = rij[j];
      rij[j] = Math.min(rij[j] + 1, rij[j - 1] + 1, vorige + (a[i - 1] === b[j - 1] ? 0 : 1));
      vorige = tmp;
    }
  }
  return rij[b.length];
}

const gemeldGecorrigeerd = new Set();

function zoekPositie(naam) {
  const exact = STATION_POSITIES[naam] ?? STATION_POSITIES[naam.replace(/:/g, '')];
  if (exact) return exact;
  if (naam.length < 5) return null;
  let beste = null;
  let besteAfstand = Infinity;
  for (const sleutel of Object.keys(STATION_POSITIES)) {
    const d = levenshtein(naam, sleutel);
    if (d < besteAfstand) { besteAfstand = d; beste = sleutel; }
  }
  if (besteAfstand > 2) return null;
  if (!gemeldGecorrigeerd.has(naam)) {
    gemeldGecorrigeerd.add(naam);
    console.log(`[weer] navtexKustrapporten: "${naam}" gelezen als "${beste}" (${besteAfstand} teken(s) verschil)`);
  }
  return STATION_POSITIES[beste];
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

// Zoekt ALLE tabellen in `tekst` (de staart van het bestand) en geeft ze in
// bestandsvolgorde terug, elk als { rapporten, tijd, khz }. Sinds 2026-09-09:
// Niton en Cullercoats zenden op 490 elk hun eigen tabel (Kanaal resp.
// Schotland/Oost-Engeland); alleen de laatste tonen liet de andere helft van
// de kaart leeg. De waarnemingstijd per tabel komt uit de bulletinkop
// ("... AT 1200 UTC"); de datum wordt van achteren naar voren afgeleid: de
// laatste tabel t.o.v. de bestands-mtime, elke eerdere t.o.v. de volgende.
function parseTabellen(tekst, khz, mtime) {
  const koppen = [];
  let m;
  const re = new RegExp(KOP_RE.source, 'g');
  while ((m = re.exec(tekst)) !== null) koppen.push(m.index);
  if (!koppen.length) return [];
  const tabellen = [];
  for (const kopIndex of koppen) {
    const regels = tekst.slice(kopIndex).split('\n');
    const rapporten = [];
    let begonnen = false;
    let lege = 0;
    for (const regel of regels.slice(1)) {
      if (/NNNN|ZCZC/.test(regel)) break; // einde bericht
      if (/^\s*(MB|MB\s+DEG)/.test(regel)) continue; // eenheden-regel
      const r = RIJ_RE.exec(regel);
      if (!r) {
        // verminkte rij ("36:", ";13") overslaan i.p.v. de tabel afkeuren;
        // na een paar regels zonder rij is de tabel voorbij
        if (begonnen && ++lege > 3) break;
        continue;
      }
      begonnen = true;
      lege = 0;
      const naam = normaliseerNaam(r[1]);
      const pos = zoekPositie(naam);
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
    // Waarnemingstijd: laatste "HHMM UTC" in de 600 tekens vóór de kop
    let laatste = null;
    let t;
    const voor = tekst.slice(Math.max(0, kopIndex - 600), kopIndex);
    while ((t = TIJD_RE.exec(voor)) !== null) laatste = t;
    TIJD_RE.lastIndex = 0;
    tabellen.push({ rapporten, khz, uur: laatste ? Number(laatste[1]) : null, minuut: laatste ? Number(laatste[2]) : null, tijd: null });
  }
  // Datums van achteren naar voren
  let anker = new Date(mtime);
  for (let i = tabellen.length - 1; i >= 0; i -= 1) {
    const tab = tabellen[i];
    if (tab.uur == null) {
      tab.tijd = anker.toISOString();
      continue;
    }
    const d = new Date(anker);
    d.setUTCHours(tab.uur, tab.minuut, 0, 0);
    if (d.getTime() > anker.getTime() + 60 * 60 * 1000) d.setUTCDate(d.getUTCDate() - 1); // gisteren
    tab.tijd = d.toISOString();
    anker = d;
  }
  return tabellen.filter((tab) => tab.rapporten.length);
}

function bestanden() {
  const b518 = process.env.NAVTEX_LOKAAL_BESTAND || path.join(homedir(), 'navtex_berichten.txt');
  const b490 = process.env.NAVTEX_LOKAAL_BESTAND_490 || b518.replace(/(\.[^.\/]*)?$/, (ext) => `_490${ext}`);
  return [{ khz: 490, pad: b490 }, { khz: 518, pad: b518 }];
}

const MAX_LEEFTIJD_MS = 12 * 60 * 60 * 1000;

export function fetchNavtexKustrapporten({ homeLat, homeLon } = {}) {
  const lijst = bestanden().filter((b) => existsSync(b.pad));
  const sleutel = lijst.map((b) => `${b.pad}:${statSync(b.pad).mtimeMs}`).join('|');
  if (cache && cache.sleutel === sleutel) return cache.resultaat;
  // Per station de nieuwste waarneming, uit alle tabellen van beide banden
  const perStation = new Map(); // naam → { ...rapport, tijd, khz }
  let nieuwste = null;
  const banden = new Set();
  for (const b of lijst) {
    const st = statSync(b.pad);
    // alleen de staart lezen: een tabel is < 2 kB, een halve dag zit ruim binnen 200 kB
    const tekst = readFileSync(b.pad, 'utf-8').slice(-200 * 1024).replace(/\r\n/g, '\n');
    for (const tab of parseTabellen(tekst, b.khz, st.mtime)) {
      const tijdMs = new Date(tab.tijd).getTime();
      if (Date.now() - tijdMs > MAX_LEEFTIJD_MS) continue;
      for (const r of tab.rapporten) {
        const bestaand = perStation.get(r.naam);
        if (bestaand && new Date(bestaand.tijd).getTime() >= tijdMs) continue;
        perStation.set(r.naam, { ...r, tijd: tab.tijd, khz: tab.khz });
      }
      if (!nieuwste || tijdMs > new Date(nieuwste.tijd).getTime()) nieuwste = tab;
      banden.add(tab.khz);
    }
  }
  const rapporten = [...perStation.values()].map((r) => ({
    naam: r.naam,
    naamUitgezonden: r.naamUitgezonden,
    lat: r.lat,
    lon: r.lon,
    frequentieKhz: r.khz,
    afstandKm: Number.isFinite(homeLat) && Number.isFinite(homeLon) ? Math.round(afstandKm(homeLat, homeLon, r.lat, r.lon)) : null,
    meting: { ...r.meting, tijd: r.tijd },
  }));
  const bandTekst = [...banden].sort().join('+');
  const resultaat = nieuwste
    ? {
        bijgewerkt: nieuwste.tijd,
        frequentieKhz: nieuwste.khz,
        bron: `NAVTEX ${bandTekst} kHz (eigen ontvangst)`,
        rapporten,
      }
    : { bijgewerkt: null, frequentieKhz: null, bron: null, rapporten: [] };
  if (nieuwste) console.log(`[weer] navtexKustrapporten: ${rapporten.length} stations (nieuwste tabel ${nieuwste.khz} kHz van ${nieuwste.tijd})`);
  cache = { sleutel, resultaat };
  return resultaat;
}
