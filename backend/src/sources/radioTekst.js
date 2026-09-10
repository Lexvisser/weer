// radioTekst.js — 2026-09-09, op verzoek van Lex ("als je het radiostation
// hoort met 78, dan een ballon met de omrekening naar Celsius" → uitgegroeid
// tot: NOAA Weather Radio verstaan en op de kaart zetten).
//
// Bron: ~/radio_tekst.txt op lexdev-nw, geschreven door de dienst
// radio-whisper (tools/radio-whisper: ffmpeg haalt de stream op, whisper.cpp
// zet elk blok van 30 s om in tekst). Regelformaat:
//   [20260909-112627] It's going crazy here at Petco Park! ...
//   [20260909-112600] #station KIH24        (kopregel bij het starten)
// Zelfde bestand-ertussen-patroon als NAVTEX: de dienst weet niets van de
// app, de app leest alleen het bestand.
//
// Wat we eruit halen (NOAA Weather Radio heeft een vaste opbouw, dus regels
// volstaan; alles wordt naar °C/km/h/Bft/m omgerekend):
//  - waarnemingen: "at Panama City it was clear, the temperature was 75
//    degrees, the wind was north at 5 miles an hour" → pin per plaats
//  - boeien: "at the buoy south of Panama City winds were southeast at 16
//    knots" → pin op zee
//  - verwachting per tijdvak: "today ... tonight ... Thursday ... Thursday
//    night ..." met lucht, neerslag(kans), highs/lows, wind, kans op regen,
//    heat index
// Plaatsen per zender staan in data/nwr-plaatsen.json (naam, aliassen,
// lat/lon); Whisper hoort namen soms verkeerd ("doton" = Dothan), daarom
// wordt bij een onbekende naam de dichtstbijzijnde bekende gekozen als het
// verschil klein is (bewerkingsafstand), net als bij de NAVTEX-kustrapporten.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { opzoeken as geocodeOpzoeken } from './nwrGeocode.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const PLAATSEN_BESTAND = path.join(HIER, '..', 'data', 'nwr-plaatsen.json');
const STATIONS_BESTAND = path.join(HIER, '..', '..', '..', 'frontend', 'data', 'nwr-stations.json');

const MAX_LEEFTIJD_MS = 3 * 60 * 60 * 1000; // waarnemingen/verwachting ouder dan dit niet meer tonen
const BUFFER_MS = 45 * 60 * 1000; // zoveel tekst kijken we terug (één NWR-cyclus is ~10 min)

const caches = new Map(); // pad -> { sleutel, resultaat }
let plaatsenCache = null;
let stationsCache = null;
const gemeldOnbekend = new Set();
let geoStation = null; // zender waarvoor nu geparsed wordt (voor de geocoder)

// Map met de tekstbestanden: zelfde map als het NAVTEX-bestand (de app draait
// als root, de radio-dienst als lex). Per zender één bestand:
// radio_tekst_<ID>.txt; radio_tekst.txt is het (oude) bestand van de
// systemd-dienst radio-whisper, met een #station-kopregel erin.
function radioMap() {
  if (process.env.RADIO_TEKST_MAP) return process.env.RADIO_TEKST_MAP;
  const navtex = process.env.NAVTEX_LOKAAL_BESTAND;
  return navtex ? path.dirname(navtex) : homedir();
}

export function radioBestand(stationId) {
  return path.join(radioMap(), `radio_tekst_${stationId}.txt`);
}

function alleBestanden() {
  const map = radioMap();
  let namen = [];
  try { namen = readdirSync(map); } catch (_) { return []; }
  const uit = [];
  for (const n of namen) {
    let m = /^radio_tekst_([A-Za-z0-9-]+)\.txt$/.exec(n);
    if (m) { uit.push({ pad: path.join(map, n), stationId: m[1] }); continue; }
    if (n === 'radio_tekst.txt' || n === path.basename(process.env.RADIO_TEKST_BESTAND ?? '')) uit.push({ pad: path.join(map, n), stationId: null });
  }
  if (process.env.RADIO_TEKST_BESTAND && !uit.some((u) => u.pad === process.env.RADIO_TEKST_BESTAND)) uit.push({ pad: process.env.RADIO_TEKST_BESTAND, stationId: null });
  return uit;
}

function laadJson(pad, fallback) {
  try {
    return JSON.parse(readFileSync(pad, 'utf-8'));
  } catch (err) {
    console.warn(`[weer] radioTekst: ${pad} niet leesbaar (${err.message})`);
    return fallback;
  }
}

function plaatsenVoor(stationId) {
  if (!plaatsenCache) plaatsenCache = laadJson(PLAATSEN_BESTAND, {});
  const lijst = plaatsenCache[stationId] ?? [];
  // per plaats alle namen (naam + aliassen) genormaliseerd
  return lijst.map((p) => ({ ...p, namen: [p.naam, ...(p.aliassen ?? [])].map(normaliseer) }));
}

export function stationInfo(stationId) {
  if (!stationsCache) stationsCache = laadJson(STATIONS_BESTAND, { stations: [] }).stations ?? [];
  return stationsCache.find((s) => s.id === stationId) ?? null;
}

function normaliseer(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

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

// Zoekt een plaats op naam; exact, anders fuzzy (max 2 fouten, of 30% van de lengte).
function zoekPlaats(plaatsen, naamRuw, stil = false) {
  const naam = normaliseer(naamRuw);
  if (!naam) return null;
  for (const p of plaatsen) if (p.namen.includes(naam)) return p;
  let beste = null;
  let besteAfstand = Infinity;
  for (const p of plaatsen) {
    for (const n of p.namen) {
      const d = levenshtein(naam, n);
      if (d < besteAfstand) { besteAfstand = d; beste = p; }
    }
  }
  const grens = naam.length < 5 ? 0 : 2; // was 30% van de lengte: "a m dfw airport" werd dan DFW Airport
  if (beste && besteAfstand <= grens) return beste;
  // 2026-09-09: niet in de tabel → OpenStreetMap (Nominatim) via de cache;
  // bij een misser gaat de naam in de wachtrij en is hij er de volgende parse.
  if (geoStation) {
    const g = geocodeOpzoeken(radioMap(), geoStation, naam);
    if (g) return { naam: g.naam, lat: g.lat, lon: g.lon, aliassen: [], namen: [naam], bron: 'osm' };
  }
  if (!stil && !gemeldOnbekend.has(naam)) {
    gemeldOnbekend.add(naam);
    console.log(`[weer] radioTekst: plaats "${naamRuw}" onbekend — overgeslagen (aanvullen in data/nwr-plaatsen.json)`);
  }
  return null;
}

// Whisper schrijft kleine getallen soms in woorden ("north at five miles an
// hour", "five to ten knots"); eerst naar cijfers.
const WOORDGETAL = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100 };
function woordenNaarCijfers(t) {
  return t
    .replace(/\b(sixties|seventies|eighties|nineties|ninties|netties)\b/gi, (m) => ({ sixties: '60s', seventies: '70s', eighties: '80s', nineties: '90s', ninties: '90s', netties: '90s' })[m.toLowerCase()])
    .replace(/\bthe the\b/g, 'the')
    .replace(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[ -](one|two|three|four|five|six|seven|eight|nine)\b/gi, (m, a, b) => String(WOORDGETAL[a.toLowerCase()] + WOORDGETAL[b.toLowerCase()]))
    .replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b(?=\s+(?:to\s+\w+\s+)?(?:miles|mph|knots|feet|foot|degrees|percent|seconds))/gi, (m) => String(WOORDGETAL[m.toLowerCase()]))
    // "south at six", "wind north at ten" (windsnelheid als woord, zonder eenheid)
    .replace(/\b((?:north|south|east|west|northeast|northwest|southeast|southwest)\s+at\s+)(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/gi, (m, a, b) => a + String(WOORDGETAL[b.toLowerCase()]));
}

// ---- eenheden -----------------------------------------------------------
const fNaarC = (f) => Math.round(((f - 32) * 5) / 9);
const mphNaarKmh = (v) => Math.round(v * 1.609344);
const knNaarKmh = (v) => Math.round(v * 1.852);
const ftNaarM = (v) => Math.round(v * 0.3048 * 10) / 10;
function msNaarBft(ms) {
  const grenzen = [0.3, 1.6, 3.4, 5.5, 8.0, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7];
  let bft = 0;
  for (const g of grenzen) if (ms >= g) bft += 1;
  return bft;
}
const kmhNaarBft = (kmh) => msNaarBft(kmh / 3.6);

const RICHTINGEN = {
  north: 0, 'north northeast': 22.5, northeast: 45, 'east northeast': 67.5, east: 90, 'east southeast': 112.5,
  southeast: 135, 'south southeast': 157.5, south: 180, 'south southwest': 202.5, southwest: 225,
  'west southwest': 247.5, west: 270, 'west northwest': 292.5, northwest: 315, 'north northwest': 337.5,
};
const RICHTING_NL = {
  north: 'N', northeast: 'NO', east: 'O', southeast: 'ZO', south: 'Z', southwest: 'ZW', west: 'W', northwest: 'NW',
  'north northeast': 'NNO', 'east northeast': 'ONO', 'east southeast': 'OZO', 'south southeast': 'ZZO',
  'south southwest': 'ZZW', 'west southwest': 'WZW', 'west northwest': 'WNW', 'north northwest': 'NNW',
};
const RICHTING_RE = '(north\\s*northeast|east\\s*northeast|east\\s*southeast|south\\s*southeast|south\\s*southwest|west\\s*southwest|west\\s*northwest|north\\s*northwest|north\\s*east|north\\s*west|south\\s*east|south\\s*west|north|south|east|west)';
function richting(txt) {
  const k = normaliseer(txt).replace(/^(north|south)\s+(east|west)$/, '$1$2'); // "south west" (Whisper) = southwest
  return { graden: RICHTINGEN[k] ?? null, kort: RICHTING_NL[k] ?? txt };
}

// ---- lucht / neerslag → icoon --------------------------------------------
const LUCHT = [
  [/mostly sunny|partly cloudy|partly sunny/, { nl: 'half bewolkt', icoon: '⛅' }],
  [/mostly cloudy/, { nl: 'overwegend bewolkt', icoon: '🌥️' }],
  [/\bsunny\b/, { nl: 'zonnig', icoon: '☀️' }],
  [/mostly clear|\bclear\b/, { nl: 'helder', icoon: '🌙' }],
  [/\bcloudy\b|overcast/, { nl: 'bewolkt', icoon: '☁️' }],
  [/patchy fog|\bfog(gy)?\b|\bmist\b/, { nl: 'mist', icoon: '🌫️' }],
  [/\bhaz(e|y)\b/, { nl: 'heiig', icoon: '🌫️' }],
];
// dag: true/false/null — "clear" is overdag ☀️ en 's nachts 🌙
function lucht(txt, dag = null) {
  const t = txt.toLowerCase();
  for (const [re, v] of LUCHT) {
    if (!re.test(t)) continue;
    if (v.nl === 'helder' && dag === true) return { nl: 'helder', icoon: '☀️' };
    return v;
  }
  return null;
}

// Grof dag/nacht op basis van lengtegraad (zonnetijd ≈ UTC + lon/15 uur).
function isDag(tijdIso, lon) {
  if (!tijdIso || !Number.isFinite(lon)) return null;
  const d = new Date(tijdIso);
  const uur = ((d.getUTCHours() + d.getUTCMinutes() / 60 + lon / 15) % 24 + 24) % 24;
  return uur >= 6.5 && uur < 19.5;
}

const KANS = { 'slight chance': 'kleine kans op', chance: 'kans op', likely: 'waarschijnlijk', definite: '', '': '' };
const NEERSLAG = [
  [/showers and thunderstorms|thunderstorms and showers/, { nl: 'buien en onweer', icoon: '⛈️' }],
  [/thunderstorms?|t-storms?/, { nl: 'onweer', icoon: '⛈️' }],
  [/showers?/, { nl: 'buien', icoon: '🌦️' }],
  [/\brain(?:ing|y)?\b|light rain|heavy rain/, { nl: 'regen', icoon: '🌧️' }],
  [/drizzle/, { nl: 'motregen', icoon: '🌧️' }],
  [/\bsnow(?:ing)?\b/, { nl: 'sneeuw', icoon: '🌨️' }],
];
function neerslag(txt) {
  const t = txt.toLowerCase().replace(/chance of (?:rain|precipitation)\s+(?:is\s+)?\d{1,3}\s*(?:%|percent)/g, ' ');
  const uit = [];
  const re = /(slight chance|chance|likely|definite)?\s*(?:of\s+)?(showers and thunderstorms|thunderstorms and showers|thunderstorms?|t-storms?|showers?|light rain|heavy rain|\brain(?:ing|y)?\b|drizzle|\bsnow(?:ing)?\b)(\s+likely)?/g;
  let m;
  while ((m = re.exec(t)) !== null) {
    const soort = NEERSLAG.find(([r]) => r.test(m[2]))?.[1];
    if (!soort) continue;
    const kans = m[3] ? 'likely' : (m[1] ?? '');
    const sleutel = `${kans}|${soort.nl}`;
    if (uit.some((u) => u.sleutel === sleutel)) continue;
    uit.push({ sleutel, icoon: soort.icoon, tekst: `${KANS[kans] ?? ''} ${soort.nl}`.trim(), kans });
  }
  return uit.map(({ sleutel, ...rest }) => rest);
}

// "in the lower 90s" / "around 90" / "near 90" / "90 to 95" / "in the 70s"
function tempBereik(txt) {
  const t = txt.toLowerCase().replace(/-/g, ' ');
  let m = /(?:in the\s+)?(upper|mid|middle|lower|low)?\s*(\d)0s\b/.exec(t);
  if (m) {
    const tien = Number(m[2]) * 10;
    const deel = m[1] ?? '';
    let lo = tien; let hi = tien + 9; let naam = `${tien}s`;
    if (deel.startsWith('up')) { lo = tien + 6; hi = tien + 9; naam = `upper ${tien}s`; }
    else if (deel.startsWith('mid')) { lo = tien + 4; hi = tien + 6; naam = `mid ${tien}s`; }
    else if (deel.startsWith('low')) { lo = tien; hi = tien + 3; naam = `lower ${tien}s`; }
    return { fLo: lo, fHi: hi, cLo: fNaarC(lo), cHi: fNaarC(hi), tekstF: naam };
  }
  m = /(\d{1,3})\s+to\s+(\d{1,3})\b/.exec(t);
  if (m) return { fLo: Number(m[1]), fHi: Number(m[2]), cLo: fNaarC(Number(m[1])), cHi: fNaarC(Number(m[2])), tekstF: `${m[1]}–${m[2]}` };
  m = /(?:around|near|about|of)\s+(\d{1,3})\b/.exec(t);
  if (m) { const f = Number(m[1]); return { fLo: f, fHi: f, cLo: fNaarC(f), cHi: fNaarC(f), tekstF: `${f}` }; }
  m = /\b(\d{1,3})\b/.exec(t);
  if (m) { const f = Number(m[1]); if (f > 0 && f < 130) return { fLo: f, fHi: f, cLo: fNaarC(f), cHi: fNaarC(f), tekstF: `${f}` }; }
  return null;
}
function tempTekstC(b) {
  if (!b) return null;
  return b.cLo === b.cHi ? `${b.cLo} °C` : `${b.cLo}–${b.cHi} °C`;
}

// "north winds 5 to 10 miles per hour", "east winds around 5 mph", "winds light and variable"
function windUitVerwachting(txt) {
  const t = txt.toLowerCase();
  const re = new RegExp(`${RICHTING_RE}\\s+winds?\\s+(?:(\\d{1,3})\\s+to\\s+(\\d{1,3})|(?:around|near|about)\\s+(\\d{1,3}))\\s*(miles per hour|miles an hour|mph|knots)`);
  const m = re.exec(t);
  if (m) {
    const r = richting(m[1]);
    const knots = /knots/.test(m[5]);
    const lo = Number(m[2] ?? m[4]);
    const hi = Number(m[3] ?? m[4]);
    const kmhLo = knots ? knNaarKmh(lo) : mphNaarKmh(lo);
    const kmhHi = knots ? knNaarKmh(hi) : mphNaarKmh(hi);
    return { richting: r.kort, graden: r.graden, kmhLo, kmhHi, bftLo: kmhNaarBft(kmhLo), bftHi: kmhNaarBft(kmhHi), tekst: `${r.kort} ${kmhLo === kmhHi ? kmhLo : `${kmhLo}–${kmhHi}`} km/h (${kmhNaarBft(kmhLo) === kmhNaarBft(kmhHi) ? kmhNaarBft(kmhHi) : `${kmhNaarBft(kmhLo)}–${kmhNaarBft(kmhHi)}`} Bft)` };
  }
  if (/light and variable|winds? light|calm/.test(t)) return { richting: null, graden: null, kmhLo: 0, kmhHi: 5, bftLo: 0, bftHi: 1, tekst: 'zwak, veranderlijk' };
  return null;
}

// ---- tijdvakken ---------------------------------------------------------
const DAGEN = { monday: 'maandag', tuesday: 'dinsdag', wednesday: 'woensdag', thursday: 'donderdag', friday: 'vrijdag', saturday: 'zaterdag', sunday: 'zondag' };
const DAG_RE = '(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)';
const TIJDVAK_RE = new RegExp(`\\b(today|tonight|rest of today|${DAG_RE}(?:\\s+night)?(?:\\s+through\\s+${DAG_RE}(?:\\s+night)?)?)\\b[,.:]?\\s`, 'gi');

function tijdvakNl(label) {
  const l = label.toLowerCase().replace(/\s+/g, ' ');
  if (l === 'today' || l === 'rest of today') return 'vandaag';
  if (l === 'tonight' || l === 'overnight') return 'vannacht';
  if (l === 'this afternoon') return 'vanmiddag';
  if (l === 'this evening') return 'vanavond';
  return l.replace(new RegExp(DAG_RE, 'g'), (d) => DAGEN[d]).replace(/\s+night/g, 'nacht').replace(/\s+through\s+/, ' t/m ');
}

// Hoeveel dagen ligt een tijdvak-label vooruit? Halve dag erbij voor een nacht,
// zodat "vandaag" vóór "vannacht" komt en "vrijdag" vóór "vrijdagnacht".
// NWR zegt "today"/"tonight" voor vandaag; een losse dagnaam is dus altijd een
// van de volgende dagen (een genoemde "thursday" op donderdag = over een week).
const DAG_NR = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
function tijdvakOffset(label, nu = new Date()) {
  const l = String(label).toLowerCase().replace(/\s+/g, ' ').trim();
  if (/^(today|rest of today|this afternoon)$/.test(l)) return 0;
  if (/^(tonight|overnight|this evening)$/.test(l)) return 0.5;
  const m = new RegExp(`^(${DAG_RE})( night)?`).exec(l);
  if (!m) return 99;
  const doel = DAG_NR[m[1]];
  if (doel == null) return 99;
  const dagen = ((doel - nu.getDay() + 7) % 7) || 7;
  return dagen + (m[2] ? 0.5 : 0);
}

// Knipt de verwachtingstekst in tijdvakken; per tijdvak de kenmerken.
function parseVerwachting(tekst) {
  const t = woordenNaarCijfers(tekst.toLowerCase());
  // begint bij "the forecast for ..." (of "the extended forecast"), eindigt bij de kustwater-verwachting
  const startRe = /(?:the\s+)?(?:zone\s+|local\s+|extended\s+|area\s+)?forecast for [\s\S]{0,80}?(?=\btoday|\btonight|\bthis|\bovernight|\brest of|\bmonday|\btuesday|\bwednesday|\bthursday|\bfriday|\bsaturday|\bsunday)/g;
  const cycli = [];
  let s;
  while ((s = startRe.exec(t)) !== null) cycli.push(s.index + s[0].length);
  if (!cycli.length) return [];
  const perLabel = new Map(); // label → vak (laatste wint)
  const volgorde = [];
  for (let c = 0; c < cycli.length; c += 1) {
    const begin = cycli[c];
    let eind = c + 1 < cycli.length ? cycli[c + 1] : t.length;
    const kust = t.indexOf('coastal waters forecast', begin);
    if (kust > begin && kust < eind) eind = kust;
    const stuk = t.slice(begin, eind);
    const koppen = [];
    let m;
    TIJDVAK_RE.lastIndex = 0;
    while ((m = TIJDVAK_RE.exec(stuk)) !== null) koppen.push({ label: m[1].replace(/\s+/g, ' '), index: m.index, na: m.index + m[0].length });
    for (let i = 0; i < koppen.length; i += 1) {
      const k = koppen[i];
      const inhoud = stuk.slice(k.na, i + 1 < koppen.length ? koppen[i + 1].index : stuk.length).trim();
      if (inhoud.length < 12) continue;
      const nacht = /night|tonight|overnight|evening/.test(k.label);
      const highs = /highs?\b([^.]{0,40})/.exec(inhoud);
      const lows = /lows?\b([^.]{0,40})/.exec(inhoud);
      const kans = /chance of (?:rain|precipitation)\s+(?:is\s+)?(\d{1,3})\s*(?:%|percent)/.exec(inhoud);
      const heat = /\b\w+ index (?:values?\s+|readings?\s+)?(?:up to|around|near|of|to)\s+(\d{2,3})/.exec(inhoud);
      const vak = {
        label: k.label,
        labelNl: tijdvakNl(k.label),
        nacht,
        lucht: lucht(inhoud),
        neerslag: neerslag(inhoud),
        hoog: highs ? tempBereik(highs[1]) : null,
        laag: lows ? tempBereik(lows[1]) : null,
        wind: windUitVerwachting(inhoud),
        kansRegen: kans ? Number(kans[1]) : null,
        heatIndexC: heat ? fNaarC(Number(heat[1])) : null,
        vochtig: /\bhumid\b/.test(inhoud),
        tekst: inhoud.slice(0, 400),
      };
      if (!perLabel.has(k.label)) volgorde.push(k.label);
      perLabel.set(k.label, vak);
    }
  }
  // 2026-09-10, Lex: "hoe komen we sws aan zaterdagnacht prognose, dat is 2 dagen
  // verderop!" — de volgorde was de volgorde in de TEKST, niet in de tijd. De
  // startRe matcht ook "the EXTENDED forecast for", dus als de buffer net na het
  // gewone rondje (today/tonight) begint, is het eerste gevonden tijdvak dat van
  // de extended forecast: zaterdag. Nu chronologisch sorteren, zodat het eerste
  // tijdvak (het blauwe regeltje bij de pin) echt het eerstvolgende is.
  return volgorde
    .map((l) => perLabel.get(l))
    .sort((a, b) => tijdvakOffset(a.label) - tijdvakOffset(b.label))
    .map((v) => ({ ...v, hoogTekst: tempTekstC(v.hoog), laagTekst: tempTekstC(v.laag) }));
}

// ---- waarnemingen -------------------------------------------------------
// Aanpak: elke "it was" is een waarneming; de plaats staat in de (max vier)
// woorden ervóór ("at panama city northwest it was" → probeer alle
// aaneengesloten woordgroepen, langste eerst, tegen de plaatsenlijst), en
// temperatuur/wind staan in het stuk tót de volgende "it was".
function zoekPlaatsInWoorden(plaatsen, woorden) {
  // eerst exact (langste woordgroep wint), dan pas fuzzy/geocoder — anders
  // plakt er rommel aan de naam ("a m dfw airport", "rising dallas love field")
  const kandidaten = [];
  for (let len = Math.min(4, woorden.length); len >= 1; len -= 1) {
    for (let start = woorden.length - len; start >= 0; start -= 1) {
      const kandidaat = woorden.slice(start, start + len).join(' ');
      if (/^(at|in|if|and|the|it|was|hour|degrees)$/.test(kandidaat)) continue;
      kandidaten.push(kandidaat);
    }
  }
  for (const kandidaat of kandidaten) {
    const n = normaliseer(kandidaat);
    const p = plaatsen.find((x) => x.namen.includes(n));
    if (p) return { plaats: p, gehoord: kandidaat };
  }
  for (const kandidaat of kandidaten) {
    const p = zoekPlaats(plaatsen, kandidaat, true);
    if (p) return { plaats: p, gehoord: kandidaat };
  }
  return null;
}

// blokken: [{ tijd, tekst }] — elke waarneming krijgt de tijd van het blok
// waarin hij gehoord is, plus het Engelse fragment (voor de "vertaalslag").
function parseWaarnemingen(blokken, plaatsen) {
  const delen = [];
  let offset = 0;
  const grensTijden = [];
  for (const b of blokken) {
    const stuk = woordenNaarCijfers(b.tekst.toLowerCase().replace(/[,;:!?]|\.(?!\d)/g, ' ').replace(/\s+/g, ' ')) + ' '; // punten weg, behalve decimalen (30.11)
    grensTijden.push({ van: offset, tijd: b.tijd instanceof Date ? b.tijd.toISOString() : b.tijd });
    delen.push(stuk);
    offset += stuk.length;
  }
  const t = delen.join('');
  const tijdBij = (index) => { let tijd = grensTijden[0]?.tijd ?? null; for (const g of grensTijden) { if (g.van <= index) tijd = g.tijd; else break; } return tijd; };
  const uit = new Map();
  // later in de tekst = nieuwer: alleen overschrijven als deze waarneming verder in de tekst staat
  const zet = (naam, index, obj) => { const oud = uit.get(naam); if (!oud || index >= oud._index) uit.set(naam, { ...obj, _index: index }); };
  const grenzen = [];
  const re = /\bit was\b/g;
  let m;
  while ((m = re.exec(t)) !== null) grenzen.push(m.index);
  for (let i = 0; i < grenzen.length; i += 1) {
    const voor = t.slice(Math.max(0, grenzen[i] - 60), grenzen[i]).trim().split(' ').filter(Boolean).slice(-5);
    const gevonden = zoekPlaatsInWoorden(plaatsen, voor);
    if (!gevonden) continue;
    const segment = t.slice(grenzen[i] + 6, i + 1 < grenzen.length ? grenzen[i + 1] : Math.min(t.length, grenzen[i] + 260));
    const temp = /(?:the\s+)?temperature\s+(?:was\s+|is\s+)?(\d{1,3})\s*degrees?/.exec(segment) ?? /^\s*(\d{1,3})\s*degrees?\b/.exec(segment);
    if (!temp) continue;
    const f = Number(temp[1]);
    if (f < -40 || f > 130) continue;
    let wind = null;
    const w = new RegExp(`the winds? (?:was|were)\\s+(?:(calm|light and variable)|${RICHTING_RE}\\s+at\\s+(\\d{1,3})\\s*(miles an hour|miles per hour|mph|knots))`).exec(segment);
    if (w) {
      if (w[1]) wind = { richting: null, graden: null, kmh: 0, bft: 0, tekst: 'windstil' };
      else {
        const r = richting(w[2]);
        const kmh = /knots/.test(w[4]) ? knNaarKmh(Number(w[3])) : mphNaarKmh(Number(w[3]));
        wind = { richting: r.kort, graden: r.graden, kmh, bft: kmhNaarBft(kmh), tekst: `${r.kort} ${kmh} km/h (${kmhNaarBft(kmh)} Bft)` };
      }
    }
    const vocht = /humidity\s+(?:was\s+|is\s+)?(\d{1,3})/.exec(segment);
    const druk = /(?:pressure|barometer)\s+(?:was\s+|is\s+)?(\d{2}\.\d{2})/.exec(segment);
    const { plaats } = gevonden;
    const eind = w ? w.index + w[0].length : temp.index + temp[0].length;
    zet(plaats.naam, grenzen[i], {
      naam: plaats.naam,
      naamGehoord: gevonden.gehoord,
      lat: plaats.lat,
      lon: plaats.lon,
      soort: 'plaats',
      tijd: tijdBij(grenzen[i]),
      bron: `${gevonden.gehoord} it was ${segment.slice(0, Math.min(eind, 160)).trim()}`,
      lucht: lucht(segment.slice(0, temp.index), isDag(tijdBij(grenzen[i]), plaats.lon)),
      tempF: f,
      tempC: fNaarC(f),
      wind,
      vochtPct: vocht ? Number(vocht[1]) : null,
      drukHpa: druk ? Math.round(Number(druk[1]) * 33.8639) : null,
    });
  }
  // Tampa-stijl: "at tampa international light rain was falling the temperature was 86 degrees
  // the humidity was 79 percent the wind was southeast at 8 miles an hour the pressure was 29.98 ..."
  // 2026-09-10, na KHB32 (Tampa Bay) nul waarnemingen gaf: Tampa laat het
  // werkwoord weg -- "at tampa international the temperature 88 degrees, the
  // dew point 74, the barometer 29.77 and the relative humidity 100%". Overal
  // waar de parser op "was" stond is dat nu optioneel; het getal + de eenheid
  // blijven het anker, dus vals-positieven worden er niet waarschijnlijker op.
  const tre = /\b(?:the\s+)?temperature\s+(?:was\s+|is\s+)?(\d{1,3})\s*degrees?/g;
  while ((m = tre.exec(t)) !== null) {
    const f = Number(m[1]);
    if (f < -40 || f > 130) continue;
    const voorTekst = t.slice(Math.max(0, m.index - 140), m.index);
    // laatste "at <plaats>" vóór de temperatuur, zonder "it was" ertussen (dat deed de eerste lus al)
    const atRe = /\bat\s+((?:[a-z']+\s+){1,4}?)(?=(?:(?:light|heavy|moderate|mostly|partly)\s+)?(?:rain|drizzle|snow|fog|showers|thunderstorms?|clear|sunny|cloudy|overcast|fair|foggy|hazy|haze|smoke|skies|sky|(?:the\s+)?temperature|the wind|the sky|it was|visibility))/g;
    let at = null; let am;
    while ((am = atRe.exec(voorTekst + t.slice(m.index, m.index + 24))) !== null) { if (am.index < voorTekst.length) at = am; } // lookahead mag tot in 'temperature' kijken
    if (!at) continue;
    const woorden = at[1].trim().split(' ').filter(Boolean);
    const gevonden = zoekPlaatsInWoorden(plaatsen, woorden);
    if (!gevonden) continue;
    const segment = t.slice(m.index + m[0].length, Math.min(t.length, m.index + m[0].length + 220));
    const luchtTekst = voorTekst.slice(at.index + at[0].length);
    let wind = null;
    const w = new RegExp(`(?:the\\s+)?winds? (?:(?:was|were|is|are)\\s+)?(?:(calm|light and variable)|${RICHTING_RE}\\s+at\\s+(\\d{1,3})\\s*(miles an hour|miles per hour|mph|knots)?)`).exec(segment);
    if (w) {
      if (w[1]) wind = { richting: null, graden: null, kmh: 0, bft: 0, tekst: 'windstil' };
      else {
        const r = richting(w[2]);
        const kmh = /knots/.test(w[4] ?? '') ? knNaarKmh(Number(w[3])) : mphNaarKmh(Number(w[3]));
        wind = { richting: r.kort, graden: r.graden, kmh, bft: kmhNaarBft(kmh), tekst: `${r.kort} ${kmh} km/h (${kmhNaarBft(kmh)} Bft)` };
      }
    }
    const vocht = /humidity\s+(?:was\s+|is\s+)?(\d{1,3})/.exec(segment);
    const druk = /(?:pressure|barometer)\s+(?:was\s+|is\s+)?(\d{2}\.\d{2})/.exec(segment);
    const dauw = /dew ?point\s+(?:was\s+|is\s+)?(\d{1,3})/.exec(segment);
    const tijdW = tijdBij(m.index);
    const { plaats } = gevonden;
    const eind = w ? w.index + w[0].length : 0;
    zet(plaats.naam, m.index, {
      naam: plaats.naam,
      naamGehoord: gevonden.gehoord,
      lat: plaats.lat,
      lon: plaats.lon,
      soort: 'plaats',
      tijd: tijdW,
      bron: `at ${gevonden.gehoord} ${luchtTekst}${m[0]}${segment.slice(0, Math.min(eind, 120))}`.replace(/\s+/g, ' ').trim(),
      lucht: lucht(luchtTekst, isDag(tijdW, plaats.lon)) ?? neerslag(luchtTekst)[0] ?? null,
      tempF: f,
      tempC: fNaarC(f),
      dauwC: dauw ? fNaarC(Number(dauw[1])) : null,
      wind,
      vochtPct: vocht ? Number(vocht[1]) : null,
      drukHpa: druk ? Math.round(Number(druk[1]) * 33.8639) : null,
    });
  }
  // Dallas-stijl opsomming: "dfw airport sunny 86 dew point 72 relative humidity 62% wind south at 9 pressure 30.11 ...
  // dallas love field sunny 84 south at 7 fort worth region sunny 86 south at 8" (komma's zijn hierboven al spaties)
  const dre = /\b((?:mostly |partly |light |heavy )?(?:sunny|clear|cloudy|overcast|fair|foggy|fog|hazy|haze|rain(?:ing)?|drizzle|thunderstorms?|showers|smoke))\s*,?\s+(?:(?:and|at)\s+)?(\d{2,3})\b(?:\s*degrees?)?(?!\s*(?:percent|%|miles|mph|knots|inches|feet|a\.?m|p\.?m))/g;
  const posities = [];
  while ((m = dre.exec(t)) !== null) posities.push({ index: m.index, eind: m.index + m[0].length, lucht: m[1], f: Number(m[2]) });
  for (let i = 0; i < posities.length; i += 1) {
    const p = posities[i];
    if (p.f < -30 || p.f > 125) continue;
    // plaatsnaam: de (max 4) woorden vóór het weerwoord
    const voor = t.slice(Math.max(0, p.index - 50), p.index).trim().split(' ').filter(Boolean).slice(-4);
    const gevonden = zoekPlaatsInWoorden(plaatsen, voor);
    if (!gevonden) continue;
    const segment = t.slice(p.eind, Math.min(i + 1 < posities.length ? posities[i + 1].index : t.length, p.eind + 70));
    let wind = null;
    const w = new RegExp(`(?:winds?\\s+)?(?:(calm)|(?:variable\\s+at\\s+(\\d{1,3}))|${RICHTING_RE}\\s+at\\s+(\\d{1,3}))`).exec(segment);
    if (w && w[2]) { const kmh = mphNaarKmh(Number(w[2])); wind = { richting: null, graden: null, kmh, bft: kmhNaarBft(kmh), tekst: `variabel ${kmh} km/h (${kmhNaarBft(kmh)} Bft)` }; }
    else if (w) {
      if (w[1]) wind = { richting: null, graden: null, kmh: 0, bft: 0, tekst: 'windstil' };
      else { const r = richting(w[3]); const kmh = mphNaarKmh(Number(w[4])); wind = { richting: r.kort, graden: r.graden, kmh, bft: kmhNaarBft(kmh), tekst: `${r.kort} ${kmh} km/h (${kmhNaarBft(kmh)} Bft)` }; }
    }
    const dauw = /dew ?point\s+(\d{1,3})/.exec(segment);
    const vocht = /humidity\s+(\d{1,3})/.exec(segment);
    const druk = /pressure\s+(\d{2}\.\d{2})/.exec(segment);
    const tijdW = tijdBij(p.index);
    const { plaats } = gevonden;
    zet(plaats.naam, p.index, {
      naam: plaats.naam,
      naamGehoord: gevonden.gehoord,
      lat: plaats.lat,
      lon: plaats.lon,
      soort: 'plaats',
      tijd: tijdW,
      bron: `${gevonden.gehoord} ${p.lucht} ${p.f}${segment.slice(0, Math.min(segment.length, 80)).trimEnd()}`.trim(),
      lucht: lucht(p.lucht, isDag(tijdW, plaats.lon)) ?? neerslag(p.lucht)[0] ?? null,
      tempF: p.f,
      tempC: fNaarC(p.f),
      dauwC: dauw ? fNaarC(Number(dauw[1])) : null,
      wind,
      vochtPct: vocht ? Number(vocht[1]) : null,
      drukHpa: druk ? Math.round(Number(druk[1]) * 33.8639) : null,
    });
  }
  // boeien: "at the buoy south of panama city winds were southeast at 16 knots" (+ evt. "seas were 2 feet")
  const bre = new RegExp(`\\bthe\\s+buoy\\s+([a-z' ]{3,50}?)\\s+winds?\\s+(?:were|was|are|is)?\\s*${RICHTING_RE}\\s+at\\s+(\\d{1,3})\\s*knots(.{0,80}?)(?=\\bthe buoy|\\bthe forecast|\\bthe coastal|$)`, 'g');
  while ((m = bre.exec(t)) !== null) {
    const plaats = zoekPlaats(plaatsen, `buoy ${m[1]}`);
    if (!plaats) continue;
    const r = richting(m[2]);
    const kn = Number(m[3]);
    const kmh = knNaarKmh(kn);
    const zee = /seas?\s+(?:were|was|are|is)?\s*(\d{1,2})\s+feet/.exec(m[4]);
    zet(plaats.naam, m.index, {
      naam: plaats.naam,
      naamGehoord: `buoy ${m[1].trim()}`,
      lat: plaats.lat,
      lon: plaats.lon,
      soort: 'boei',
      tijd: tijdBij(m.index),
      bron: m[0].slice(0, 160).trim(),
      lucht: null,
      tempF: null,
      tempC: null,
      wind: { richting: r.kort, graden: r.graden, kmh, kn, bft: kmhNaarBft(kmh), tekst: `${r.kort} ${kn} kn · ${kmhNaarBft(kmh)} Bft` },
      golfM: zee ? ftNaarM(Number(zee[1])) : null,
    });
  }
  // 2026-09-10, na KHB32 (Tampa Bay): daar zit het interessante deel niet in
  // de steden (Tampa leest er maar één voor -- downtown St. Petersburg) maar in
  // de kust- en zeerapporten erna: "at the c-man site at cedar key winds
  // southeast 8 knots, air temperature 82 degrees ... 100 miles west of
  // bayport winds were from the south at 6 knots, sea temperature 86 degrees,
  // air temperature 84, wave heights 1 foot". Whisper hoort "c-man" als "sea
  // man"/"seaman"; dat vangen we hier op (de mishoorde PLAATSnamen staan als
  // alias in data/nwr-plaatsen.json). Twee vormen:
  //   - "(the) c-man site at <plaats>"  -> op de plaats zelf
  //   - "<N> miles <richting> of <plaats>" -> N mijl uit de kust verschoven,
  //     zodat zo'n boei ook echt op zee komt te liggen en niet in het dorp.
  const MARINE_RE = new RegExp(`\\b(?:(?:the\\s+)?(?:c[\\s-]?man|sea\\s?man|seaman|see\\s?man)\\s+site\\s+at\\s+([a-z' ]{3,40}?)|(\\d{1,3})\\s+miles\\s+${RICHTING_RE}\\s+of\\s+([a-z' ]{3,40}?))\\s+(?=winds?\\b|air\\s+temperature|sea\\s+temperature|wave\\s+heights?|seas?\\b)`, 'g');
  while ((m = MARINE_RE.exec(t)) !== null) {
    const naamRuw = (m[1] ?? m[4] ?? '').trim();
    if (!naamRuw) continue;
    const plaats = zoekPlaats(plaatsen, naamRuw, true);
    if (!plaats) continue;
    const segment = t.slice(m.index + m[0].length, Math.min(t.length, m.index + m[0].length + 200));
    // niet doorlopen in het volgende rapport
    const knip = segment.search(new RegExp(`(?:c[\\s-]?man|sea\\s?man|seaman)\\s+site|\\d{1,3}\\s+miles\\s+${RICHTING_RE}\\s+of\\b|\\bthe forecast\\b|\\bcoastal waters\\b`));
    const seg = knip > 0 ? segment.slice(0, knip) : segment;
    const luchtT = /air\s+temperature\s+(?:was\s+|is\s+|of\s+)?(\d{1,3})/.exec(seg);
    const zeeT = /sea\s+temperature\s+(?:was\s+|is\s+|of\s+)?(\d{1,3})/.exec(seg);
    const golf = /(?:wave\s+heights?|seas?)\s+(?:were\s+|was\s+|of\s+|around\s+)?(\d{1,2})\s*(?:foot|feet)/.exec(seg);
    const w = new RegExp(`winds?\\s+(?:(?:were|was|are|is)\\s+)?(?:from\\s+the\\s+|for\\s+|at\\s+)?${RICHTING_RE}\\s*(?:at\\s+)?(\\d{1,3})\\s*(?:knots?|kts?)`).exec(seg);
    if (!luchtT && !zeeT && !golf && !w) continue;
    let { lat, lon } = plaats;
    if (m[2]) { // "<N> miles <richting> of <plaats>": verschuiven vanaf de plaats
      const km = Number(m[2]) * 1.609344;
      const graden = richting(m[3]).graden;
      if (graden != null) {
        lat = plaats.lat + (km * Math.cos((graden * Math.PI) / 180)) / 111;
        lon = plaats.lon + (km * Math.sin((graden * Math.PI) / 180)) / (111 * Math.cos((plaats.lat * Math.PI) / 180));
      }
    }
    let wind = null;
    if (w) {
      const r = richting(w[1]);
      const kn = Number(w[2]);
      const kmh = knNaarKmh(kn);
      wind = { richting: r.kort, graden: r.graden, kmh, kn, bft: kmhNaarBft(kmh), tekst: `${r.kort} ${kn} kn · ${kmhNaarBft(kmh)} Bft` };
    }
    const fLucht = luchtT ? Number(luchtT[1]) : null;
    const naam = m[2] ? `${m[2]} mijl ${richting(m[3]).kort} van ${plaats.naam}` : plaats.naam;
    zet(naam, m.index, {
      naam,
      naamGehoord: m[0].trim(),
      lat,
      lon,
      soort: 'boei',
      tijd: tijdBij(m.index),
      bron: `${m[0].trim()} ${seg.slice(0, 120).trim()}`,
      lucht: null,
      tempF: fLucht,
      tempC: fLucht != null && fLucht >= -40 && fLucht <= 130 ? fNaarC(fLucht) : null,
      zeeTempC: zeeT ? fNaarC(Number(zeeT[1])) : null,
      wind,
      golfM: golf ? ftNaarM(Number(golf[1])) : null,
    });
  }
  const lijst = [...uit.values()].map(({ _index, ...w }) => w);
  const uniek = [];
  for (const w of lijst) {
    const km = (a, b) => 111 * Math.hypot(a.lat - b.lat, (a.lon - b.lon) * Math.cos((a.lat * Math.PI) / 180));
    const i = uniek.findIndex((u) => km(u, w) < 5);
    if (i >= 0) { if ((w.tijd ?? '') >= (uniek[i].tijd ?? '')) uniek[i] = w; } else uniek.push(w);
  }
  return uniek;
}


// ---- losse vertalingen ---------------------------------------------------
// 2026-09-09 (avond), Lex: "anders is het live luisteren zinloos" — elke zin
// met een getal-met-eenheid krijgt een omrekening voor de gele ballon, ook
// zonder plaats of pin: "highs in the lower 90s", "heat index up to 105",
// "winds 5 to 10 knots", "seas 2 feet", "visibility 5 miles", "29.98 inches".
const VERTAAL_RE = [
  // temperatuur-bereiken ("in the lower 90s", "highs around 90", "lows near 74")
  [/\b(?:highs?|lows?|temperatures?|temps?)\s+(?:will be\s+)?(?:in the\s+)?(?:(upper|mid|middle|lower|low)[\s-]*)?(\d)0s\b/g, (m) => {
    const b = tempBereik(m[0]); return b ? `🌡️ ${tempTekstC(b)}` : null; }],
  [/\b(?:highs?|lows?|temperatures?|temps?)\s+(?:will be\s+)?(?:around|near|about|of)\s+(\d{1,3})\b/g, (m) => `🌡️ ${fNaarC(Number(m[1]))} °C`],
  [/\b(?:highs?|lows?|temperatures?|temps?)\s+(?:will be\s+|from\s+)?(\d{1,3})\s+to\s+(\d{1,3})\b/g, (m) => `🌡️ ${fNaarC(Number(m[1]))}–${fNaarC(Number(m[2]))} °C`],
  [/\b(?:in the\s+)(?:(upper|mid|middle|lower|low)[\s-]*)?(\d)0s\b/g, (m) => { const b = tempBereik(m[0]); return b ? `🌡️ ${tempTekstC(b)}` : null; }],
  // Whisper hoort "heat index" ook als "Pete index" e.d.: elk woord vóór "index values/readings up to N" telt, mits N ≥ 80 (UV-index is nooit zo hoog)
  [/\b\w+ index(?: values?| readings?)?\s+(?:(?:up to|around|near|of|to|will be|was|is|were|are)\s+)?(?:around |near |the )?(\d{2,3})(?:\s+to\s+(\d{2,3}))?\b/g, (m) => { const f = Number(m[1]); const g = m[2] ? Number(m[2]) : null; if (f < 80) return null; return `🥵 gevoel ${g && g !== f ? `${fNaarC(f)}–${fNaarC(g)}` : fNaarC(f)} °C`; }],
  // klimaatsamenvatting: "the normal high is 91", "record low of 49" (zonder 'degrees')
  [/\b(?:normal|record|average)\s+(?:high|low)(?:\s+temperature)?\s+(?:is|was|of|for today is)\s+(-?\d{1,3})\b(?!\s*degrees)/g, (m) => { const f = Number(m[1]); return f > -50 && f < 135 ? `🌡️ ${fNaarC(f)} °C` : null; }],
  [/\bwind ?chill(?: values?)?\s+(?:down to|around|near|of|to)\s+(-?\d{1,3})\b/g, (m) => `🥶 gevoel ${fNaarC(Number(m[1]))} °C`],
  // "mostly sunny and 79", "cloudy and 68", "light rain and 83 degrees" → lucht-icoon + temperatuur (actueel)
  [/\b((?:mostly |partly |light |heavy )?(?:clear|sunny|cloudy|overcast|fair|foggy|hazy|rain(?:y|ing)?|drizzl(?:e|ing)|snow(?:y|ing)?|thunderstorms?|showers|fog|haze|smoke))\s*,?\s+(?:(?:and|at)\s+)?(-?\d{1,3})\b(?:\s*degrees?)?(?!\s*(?:percent|%|miles|mph|knots|inches|feet|a\.?m|p\.?m))/g, (m) => { const f = Number(m[2]); if (!(f > -30 && f < 125)) return null; const l = lucht(m[1], vertaalDag) ?? neerslag(m[1])[0]; return `${l?.icoon ?? '🌡️'} ${fNaarC(f)} °C`; }],
  // luchtvochtigheid is al een percentage — Whisper zegt soms "humidity 57 degrees": niets omrekenen, wel het stuk bezet houden
  [/\b(?:relative\s+)?humidity\s+(?:was|is|of|at|around|near)?\s*(\d{1,3})\s*(?:degrees?|percent|%)?/g, () => ({ negeer: true })],
  // verschil, geen absolute waarde: "4 degrees below normal", "10 degrees above average" → Δ°C
  [/\b(\d{1,2})\s*degrees?\s+(above|below)\s+(?:normal|average|the normal|the average)\b/g, (m) => `🌡️ ${Math.round((Number(m[1]) * 5) / 9 * 10) / 10} °C ${m[2] === 'above' ? 'boven' : 'onder'} normaal`],
  // "between 86 and 88 degrees", "86 to 88 degrees"
  [/\b(?:between\s+)?(-?\d{1,3})\s+(?:and|to)\s+(-?\d{1,3})\s*degrees?\b(?!\s*(?:true|magnetic))/g, (m) => { const a = Number(m[1]); const b = Number(m[2]); return a > -50 && b < 135 && b >= a ? `🌡️ ${fNaarC(a)}–${fNaarC(b)} °C` : null; }],
  [/\b(-?\d{1,3})\s*degrees?\b(?!\s*(?:true|magnetic))/g, (m) => { const f = Number(m[1]); return f > -50 && f < 135 ? `🌡️ ${fNaarC(f)} °C` : null; }],
  // actuele lucht/neerslag zonder getal: "it was mostly cloudy", "skies were clear", "currently raining"
  [/\b(?:it was|it is|it's|skies? (?:were|are|is)|currently|sky condition(?:s)? (?:were|are|is)?)\s+((?:mostly |partly )?(?:clear|sunny|cloudy|overcast|fair|foggy|hazy|rain(?:y|ing)?|drizzl(?:e|ing)|snow(?:y|ing)?|thunderstorms?|showers|fog|haze|smoke|light rain|heavy rain))\b/g, (m) => { const l = lucht(m[1], vertaalDag) ?? neerslag(m[1])[0]; return l ? { woord: true, tekst: `${l.icoon} ${l.nl ?? l.tekst}` } : null; }],
  [/\b(-?\d{1,3})\s+with\s+(?:mostly |partly )?(?:clear|sunny|cloudy|overcast|fair|foggy|hazy|rainy)\s+skies\b/g, (m) => { const f = Number(m[1]); return f > -30 && f < 125 ? `🌡️ ${fNaarC(f)} °C` : null; }],
  // verwachting: neerslag ("a chance of showers and thunderstorms", "isolated storms", "showers likely")
  [/\b(slight chance of|chance of|scattered|isolated|numerous|widespread|periods of|occasional)?\s*((?:showers and thunderstorms|thunderstorms and showers|thunderstorms|t-storms|storms|showers|rain showers|rain|light rain|heavy rain|drizzle|snow|sleet|freezing rain|fog|patchy fog|dense fog))(\s+(?:likely|possible))?\b/g, (m) => {
    const soort = m[2].replace(/^storms$/, 'thunderstorms').replace(/^rain showers$/, 'showers');
    const l = neerslag(soort)[0] ?? lucht(soort);
    if (!l) return null;
    const kans = { 'slight chance of': 'kleine kans op', 'chance of': 'kans op', scattered: 'verspreid', isolated: 'plaatselijk', numerous: 'veel', widespread: 'wijdverbreid', 'periods of': 'perioden met', occasional: 'af en toe' }[(m[1] ?? '').trim()] ?? '';
    const na = /likely/.test(m[3] ?? '') ? ' (waarschijnlijk)' : (/possible/.test(m[3] ?? '') ? ' (mogelijk)' : '');
    return { woord: true, tekst: `${l.icoon} ${kans ? kans + ' ' : ''}${l.nl ?? l.tekst}${na}` }; }],
  // verwachting: lucht direct na een tijdvak of "then/becoming" ("Tonight, clear", "then becoming partly cloudy")
  [/\b(today|tonight|overnight|this afternoon|this evening|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|then|becoming|night)[,.]?\s+(?:becoming\s+)?((?:mostly |partly )?(?:sunny|clear|cloudy|overcast|fair)|(?:mostly |partly )?(?:sunny|cloudy) (?:in the (?:morning|afternoon|evening)))\b/g, (m) => {
    const nacht = /^(tonight|overnight|night|this evening)$/.test(m[1]);
    const l = lucht(m[2], nacht ? false : (/^(today|this afternoon|tomorrow)$/.test(m[1]) ? true : vertaalDag)); return l ? { woord: true, tekst: `${l.icoon} ${l.nl}` } : null; }],
  // "the temperature was 70" (zonder "degrees"), "dew point 65"
  [/\b(?:temperature|temp|dew ?point)\s+(?:was|is|of|around|near|at)?\s*(-?\d{1,3})\b(?!\s*(?:percent|%|degrees|miles|mph|knots))/g, (m) => { const f = Number(m[1]); return f > -50 && f < 135 ? `🌡️ ${fNaarC(f)} °C` : null; }],
  // wind
  // waarneming: "the wind was southeast at 8 miles an hour", "winds were calm" staat verderop
  [new RegExp(`\\bwinds?\\s+(?:was|were|is|are)\\s+${RICHTING_RE}\\s+at\\s+(?:around\\s+|near\\s+|about\\s+)?(\\d{1,3})\\s*(miles per hour|miles an hour|mph|knots)?`, 'g'), (m) => {
    const r = richting(m[1]); const v = /knots/.test(m[3] ?? '') ? knNaarKmh(Number(m[2])) : mphNaarKmh(Number(m[2])); return `💨 ${r.kort} ${v} km/h (${kmhNaarBft(v)} Bft)`; }],
  [new RegExp(`\\b${RICHTING_RE}\\s+winds?\\s+(?:(\\d{1,3})\\s+to\\s+(\\d{1,3})|(?:around|near|about|at)\\s+(?:the\\s+)?(\\d{1,3}))\\s*(miles per hour|miles an hour|mph|knots)`, 'g'), (m) => {
    const w = windUitVerwachting(m[0].replace(/\bthe\s+/, '')); return w ? `💨 ${w.tekst}` : null; }],
  [new RegExp(`\\bwinds?\\s+(?:${RICHTING_RE}\\s+)?(?:(\\d{1,3})\\s+to\\s+(\\d{1,3})|(?:around|near|about|at)\\s+(?:the\\s+)?(\\d{1,3}))\\s*(miles per hour|miles an hour|mph|knots)`, 'g'), (m) => {
    const r = m[1] ? richting(m[1]) : null; m = [m[0], m[2], m[3], m[4], m[5]];
    const kn = /knots/.test(m[4]); const lo = Number(m[1] ?? m[3]); const hi = Number(m[2] ?? m[3]);
    const a = kn ? knNaarKmh(lo) : mphNaarKmh(lo); const b = kn ? knNaarKmh(hi) : mphNaarKmh(hi);
    return `💨 ${r ? r.kort + ' ' : ''}${a === b ? a : `${a}–${b}`} km/h (${kmhNaarBft(a) === kmhNaarBft(b) ? kmhNaarBft(b) : `${kmhNaarBft(a)}–${kmhNaarBft(b)}`} Bft)`; }],
  // kale snelheid: "wind gust observed was 23 miles per hour", "16 miles an hour" (na de specifiekere windpatronen)
  [/\b(\d{1,3})\s*(miles per hour|miles an hour|mph|knots)\b/g, (m) => {
    const v = /knots/.test(m[2]) ? knNaarKmh(Number(m[1])) : mphNaarKmh(Number(m[1])); return `💨 ${v} km/h (${kmhNaarBft(v)} Bft)`; }],
  // "wind south at 8", "southeast at 3" (geen eenheid: NWS bedoelt mph)
  [new RegExp(`\\b(?:winds?\\s+)?${RICHTING_RE}\\s+at\\s+(\\d{1,2})\\b(?!\\s*(?:miles|mph|knots|percent|%|a\\.?m|p\\.?m|degrees))`, 'g'), (m) => {
    const r = richting(m[1]); const v = mphNaarKmh(Number(m[2])); return `💨 ${r.kort} ${v} km/h (${kmhNaarBft(v)} Bft)`; }],
  [/\bwinds?\s+(?:were\s+|was\s+)?calm\b/g, () => '💨 windstil'],
  [/\bgusts?\s+(?:up to|to|around|near)\s+(\d{1,3})\s*(miles per hour|miles an hour|mph|knots)/g, (m) => {
    const v = /knots/.test(m[2]) ? knNaarKmh(Number(m[1])) : mphNaarKmh(Number(m[1])); return `💨 stoten ${v} km/h (${kmhNaarBft(v)} Bft)`; }],
  // zee
  [/\b(?:seas?|waves?|swells?)\s+(?:were|was|are|is|will be|of|around|near)?\s*(\d{1,2}(?:\.\d)?)(?:\s+to\s+(\d{1,2}(?:\.\d)?))?\s+(?:feet|foot|ft)\b/g, (m) => {
    const a = ftNaarM(Number(m[1])); const b = m[2] ? ftNaarM(Number(m[2])) : null; return `🌊 ${b != null && b !== a ? `${a}–${b}` : a} m`; }],
  [/\b(\d{1,2}(?:\.\d)?)(?:\s+to\s+(\d{1,2}(?:\.\d)?))?\s+(?:feet|foot|ft)\b(?:\s+at\s+(\d{1,2})\s+seconds?)?/g, (m) => {
    const a = ftNaarM(Number(m[1])); const b = m[2] ? ftNaarM(Number(m[2])) : null; const p = m[3] ? ` · ${m[3]} s` : '';
    return `🌊 ${b != null && b !== a ? `${a}–${b}` : a} m${p}`; }],
  // zicht, afstand, druk, neerslag
  [/\bvisibility\s+(?:was|is|of|around|near)?\s*(?:less than\s+|under\s+)?(\d{1,2}(?:\.\d)?|one quarter|one half|a quarter|a half)\s*(?:miles?|mi)\b/g, (m) => {
    const v = { 'one quarter': 0.25, 'a quarter': 0.25, 'one half': 0.5, 'a half': 0.5 }[m[1]] ?? Number(m[1]); return `👁️ zicht ${Math.round(v * 1.609 * 10) / 10} km`; }],
  [/\b(\d{1,3})\s+nautical miles?\b/g, (m) => `📏 ${Math.round(Number(m[1]) * 1.852)} km`],
  [/\b(\d{1,3})\s+miles?\s+(?:offshore|out|from)\b/g, (m) => `📏 ${Math.round(Number(m[1]) * 1.609)} km`],
  [/\b(?:pressure|barometer)\s+(?:was|is|of)?\s*(\d{2}\.\d{2})\b/g, (m) => `🔵 ${Math.round(Number(m[1]) * 33.8639)} hPa`],
  [/\b(\d{1,2}(?:\.\d{1,2})?)\s+inch(?:es)?\s+of\s+(?:rain|precipitation|snow)\b/g, (m) => `🌧️ ${Math.round(Number(m[1]) * 25.4)} mm`],
  [/\b(\d{1,2}(?:\.\d{1,2})?)\s+inch(?:es)?\b/g, (m) => (/^(?:2[89]|3[01])\.\d\d$/.test(m[1]) ? `🔵 ${Math.round(Number(m[1]) * 33.8639)} hPa` : `📐 ${Math.round(Number(m[1]) * 25.4)} mm`)],
];

// Zelfde tekst, maar met hoofdletters behouden en getalwoorden → cijfers, zodat
// een fragment uit vertalingenUitBlok() er positioneel in terug te vinden is.
function normaliseerMetHoofdletters(tekstRuw) {
  return woordenNaarCijfers(tekstRuw.replace(/[;:!?]/g, ' ').replace(/\s+/g, ' '));
}

// Regel opknippen in stukken tekst en stukken met een vertaling erachter.
export function regelMetVertalingen(tekstRuw, tijd, lon = null, staat = null) {
  const items = vertalingenUitBlok(tekstRuw, tijd, lon, staat);
  const t = normaliseerMetHoofdletters(tekstRuw);
  const lower = t.toLowerCase();
  const delen = [];
  let pos = 0;
  let zoekVanaf = 0;
  for (const it of items) {
    const i = lower.indexOf(it.fragment, zoekVanaf);
    if (i < 0) continue;
    if (i > pos) delen.push({ tekst: t.slice(pos, i) });
    delen.push({ tekst: t.slice(i, i + it.fragment.length), vertaling: it.vertaling, nu: !!it.nu, soort: it.soort, woord: !!it.woord });
    pos = i + it.fragment.length;
    zoekVanaf = pos;
  }
  if (pos < t.length) delen.push({ tekst: t.slice(pos) });
  return delen;
}

let vertaalDag = null; // dag/nacht-hint (☀️ of 🌙 bij 'clear') voor de patronen hieronder

// Tijdvak-woorden in de verwachting; het laatst genoemde geldt tot het volgende
// (ook over blokgrenzen heen, via `staat.tijdvak`). 2026-09-09, Lex: "de
// forecast van de dag nemen we wel mee (ander kleurtje dan actueel)".
const TIJDVAK_WOORD_RE = /\b(today|this afternoon|this evening|tonight|overnight|rest of today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/g;
function tijdvakSoort(w) {
  if (!w) return 'later';
  return /^(today|this afternoon|this evening|tonight|overnight|rest of today)$/.test(w) ? 'vandaag' : 'later';
}

// Delen zonder vertaling opknippen rond de gehoorde plaatsnamen → { tekst, plaats, lat, lon }
function markeerPlaatsen(delen, plaatsen) {
  const uit = [];
  for (const d of delen) {
    if (d.vertaling) { uit.push(d); continue; }
    let rest = d.tekst;
    let bewaker = 0;
    while (rest && bewaker++ < 20) {
      let beste = null;
      for (const w of plaatsen) {
        const i = rest.toLowerCase().indexOf(w.naamGehoord.toLowerCase());
        if (i >= 0 && (!beste || i < beste.i)) beste = { i, w };
      }
      if (!beste) break;
      const { i, w } = beste;
      if (i > 0) uit.push({ tekst: rest.slice(0, i) });
      uit.push({ tekst: rest.slice(i, i + w.naamGehoord.length), plaats: w.naam, lat: w.lat, lon: w.lon });
      rest = rest.slice(i + w.naamGehoord.length);
    }
    if (rest) uit.push({ tekst: rest });
  }
  return uit;
}

// treffer in `tekst` die tot in de laatste `fragmentLengte` tekens reikt (dus het fragment zelf raakt)
function raaktFragment(re, tekst, fragmentLengte) {
  const m = re.exec(tekst);
  return !!m && m.index + m[0].length > tekst.length - fragmentLengte;
}

function vertalingenUitBlok(tekstRuw, tijd, lon = null, staat = null) {
  vertaalDag = isDag(tijd, lon);
  const t = woordenNaarCijfers(tekstRuw.toLowerCase().replace(/[;:!?]/g, ' ').replace(/\s+/g, ' '));
  // voor het tijdvak-zoeken: een dagnaam met datum erachter ("wednesday september 9th", "monday the 8th")
  // is een datumaanduiding (klimaatsamenvatting), geen verwachtingstijdvak — onleesbaar maken, zelfde lengte
  const tTijdvak = t.replace(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?=,?\s+(?:the\s+)?(?:january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}(?:st|nd|rd|th)?\b))/g, (m) => '#'.repeat(m.length));
  const uit = [];
  const bezet = []; // [van, tot] al gebruikte stukken tekst
  for (const [re, maak] of VERTAAL_RE) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(t)) !== null) {
      const van = m.index; const tot = van + m[0].length;
      if (bezet.some(([a, b]) => van < b && tot > a)) continue; // overlapt met een eerdere (specifiekere) treffer
      let vertaling = null;
      let woord = false;
      try { vertaling = maak(m); } catch (_) { vertaling = null; }
      if (vertaling && typeof vertaling === 'object' && vertaling.negeer) { bezet.push([van, tot]); continue; }
      if (vertaling && typeof vertaling === 'object') { woord = !!vertaling.woord; vertaling = vertaling.tekst; }
      if (!vertaling) continue;
      bezet.push([van, tot]);
      // wat context erbij: tot 40 tekens vóór het fragment, afgekapt op woordgrens
      const voor = t.slice(Math.max(0, van - 40), van).replace(/^\S*\s/, '');
      // context = de lopende zin (vanaf de vorige punt), hooguit 60 tekens terug — anders lekt "highs"
      // of "normal" uit de vorige zin door naar een waarneming
      const zinStart = Math.max(0, van - 60, t.lastIndexOf('. ', Math.max(0, van - 1)) + 1);
      const context = `${t.slice(zinStart, van)} ${m[0]}`;
      // 2026-09-09 (Lex): alleen actuele waarden op de kaart flitsen, niet de
      // verwachting. Verwachting = highs/lows/tijdvakken/kansen; actueel =
      // verleden tijd of "currently/now/at <uur>".
      const verwachting = /\b(highs?|lows?|tonight|today|tomorrow|overnight|this (?:afternoon|evening|morning)|monday|tuesday|wednesday|thursday|friday|saturday|sunday|expected|forecast|chance|likely|will be|becoming|wind ?chill|record|normal)\b/.test(context);
      // laatst genoemde tijdvak vóór dit fragment (in dit blok, anders uit het vorige blok)
      let tijdvak = staat?.tijdvak ?? null;
      TIJDVAK_WOORD_RE.lastIndex = 0;
      let tv;
      while ((tv = TIJDVAK_WOORD_RE.exec(tTijdvak)) !== null) { if (tv.index <= van) tijdvak = tv[1]; else break; } // een tijdvak-woord aan het begin van het fragment telt mee
      const record = /\b(record|normal|yesterday|climate summary)\b/.test(context);
      const actueel = /\b(was|were|currently|right now|now|at this (?:hour|time)|at \d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?|am|pm)|observed|reported|reporting)\b/.test(context) || /\b(?:clear|sunny|cloudy|overcast|fair|foggy|hazy|rain|raining|rainy|drizzle|snow|snowing|thunderstorms?|showers)\s*,?\s+(?:(?:and|at)\s+)?\d/.test(m[0]) || /\b(?:north|south|east|west|northeast|northwest|southeast|southwest)\s+at\s+\d/.test(m[0]) || /\b(?:dew ?point|humidity|pressure)\b/.test(context);
      // een echte waarnemingsvorm ("sunny 82", "south at 6", "temperature was 70") is altijd actueel,
      // ook als er vlak ervoor nog verwachtingstaal stond
      // vlakVoor = de paar woorden direct vóór het fragment: "the heat index was 98", "the wind was southeast at 5", "light rain was falling"
      const vlakVoor = `${t.slice(Math.max(0, van - 28), van)} ${m[0]}`;
      const waarnemingsvorm = /\b(?:clear|sunny|cloudy|overcast|fair|foggy|hazy|rain|raining|rainy|drizzle|snow|snowing|thunderstorms?|showers)\s*,?\s+(?:(?:and|at)\s+)?\d/.test(m[0]) || /\b(?:north|south|east|west|northeast|northwest|southeast|southwest)\s+at\s+\d/.test(m[0]) || /\b(?:temperature|dew ?point|pressure|humidity)\s+(?:was|is)?\s*\d/.test(m[0])
        || raaktFragment(/\b(?:winds?\s+)?(?:variable|calm|light and variable)\s+at\s+\d/, vlakVoor, m[0].length)
        || raaktFragment(/\bwinds?\s+(?:is|was|were|are)\s+(?:at\s+)?\d/, vlakVoor, m[0].length)
        || raaktFragment(/\b(?:visibility\s+(?:was\s+|is\s+)?|gusting to\s+)\d/, vlakVoor, m[0].length)
        || raaktFragment(/\b(?:heat index|wind ?chill|temperature|winds?|gusts?|visibility|pressure|humidity|dew ?point|seas?|waves?)\s+(?:was|were|is|are)\s+(?:around\s+|near\s+|about\s+|the\s+)?(?:\w+\s+at\s+)?\d/, vlakVoor, m[0].length)
        || /\b(?:light |heavy |moderate )?(?:rain|drizzle|snow|fog|showers|thunderstorms?)\s+(?:was|were|is|are)\s+(?:falling|reported|occurring|in progress)\b/.test(`${m[0]}${t.slice(tot, tot + 24)}`);
      const nu = !record && (waarnemingsvorm || (actueel && !verwachting));
      const soort = nu ? 'nu' : (record ? 'overig' : (verwachting || tijdvak ? tijdvakSoort(tijdvak) : 'overig'));
      uit.push({ tijd, index: van, bron: `${voor}${m[0]}`.trim(), fragment: m[0].trim(), vertaling, nu, soort, woord });
    }
  }
  if (staat) {
    TIJDVAK_WOORD_RE.lastIndex = 0;
    let laatste = null; let tv;
    while ((tv = TIJDVAK_WOORD_RE.exec(tTijdvak)) !== null) laatste = tv[1];
    if (laatste) staat.tijdvak = laatste;
    // een waarnemingsrondje ("it was", "sunny, 83") sluit de verwachting af
    if (/\b(it was|skies were|climate summary|following reports|conditions as of)\b/.test(t)) staat.tijdvak = null;
  }
  return uit.sort((a, b) => a.index - b.index).map(({ index, ...rest }) => rest);
}

// ---- bestand lezen ------------------------------------------------------
function parseStempel(s) {
  // [20260909-112627] = lokale tijd op de server
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
}

function leesBestand(pad, stationIdHint) {
  if (!existsSync(pad)) return { beschikbaar: false, station: null, bijgewerkt: null, regels: [], waarnemingen: [], verwachting: [] };
  const st = statSync(pad);
  const sleutel = `${pad}:${st.mtimeMs}`;
  const cache = caches.get(pad);
  if (cache && cache.sleutel === sleutel) return cache.resultaat;

  const tekst = readFileSync(pad, 'utf-8').slice(-300 * 1024);
  const nu = Date.now();
  const regels = [];
  let stationId = stationIdHint || process.env.RADIO_STATION || null;
  for (const regel of tekst.split('\n')) {
    const m = /^\[(\d{8}-\d{6})\]\s*(.*)$/.exec(regel);
    if (!m) continue;
    const tijd = parseStempel(m[1]);
    if (!tijd) continue;
    const inhoud = m[2].trim();
    // Kopregel van radioLuister.js. "#station KHB32" = nieuwe klik: alles wat
    // ervóór staat is van een vorige luistersessie en telt niet meer mee (2026-09-10).
    // "#station KHB32 verleng" = dezelfde sessie oprekken, dus niets weggooien.
    const kop = /^#station\s+(\S+)(?:\s+(\S+))?/.exec(inhoud);
    if (kop) { stationId = kop[1]; if (kop[2] !== 'verleng') regels.length = 0; continue; }
    if (!inhoud) continue;
    regels.push({ tijd, tekst: inhoud });
  }
  const recent = regels.filter((r) => nu - r.tijd.getTime() <= BUFFER_MS);
  const station = stationId ? stationInfo(stationId) : null;
  const plaatsen = stationId ? plaatsenVoor(stationId) : [];
  const buffer = recent.map((r) => r.tekst).join(' ');
  const laatsteTijd = recent.length ? recent[recent.length - 1].tijd : (regels.length ? regels[regels.length - 1].tijd : null);
  const oud = laatsteTijd ? nu - laatsteTijd.getTime() > MAX_LEEFTIJD_MS : true;

  geoStation = station;
  const waarnemingen = oud ? [] : parseWaarnemingen(recent, plaatsen);
  geoStation = null;
  const vertaalStaat = { tijdvak: null };
  const vertalingen = oud ? [] : recent
    .filter((r) => nu - r.tijd.getTime() <= 10 * 60 * 1000)
    .flatMap((r) => vertalingenUitBlok(r.tekst, r.tijd.toISOString(), station?.lon ?? null, vertaalStaat))
    .slice(-60);
  const verwachting = oud ? [] : parseVerwachting(buffer);

  const resultaat = {
    beschikbaar: true,
    station: station ? { id: station.id, roepletters: station.roepletters, plaats: station.plaats, staat: station.staat, lat: station.lat, lon: station.lon, mhz: station.mhz } : (stationId ? { id: stationId } : null),
    bijgewerkt: laatsteTijd ? laatsteTijd.toISOString() : null,
    live: laatsteTijd ? nu - laatsteTijd.getTime() < 3 * 60 * 1000 : false,
    regels: (() => {
      const st = { tijdvak: null };
      return regels.slice(-40).map((r) => {
        const tijdIso = r.tijd.toISOString();
        const delen = regelMetVertalingen(r.tekst, tijdIso, station?.lon ?? null, st);
        // herkende plaatsen in deze regel markeren (Lex 09/09: "kunnen die in het
        // tekstvenster erbij?") — de app maakt er aanklikbare namen van
        const plaatsen = waarnemingen.filter((w) => w.tijd === tijdIso && w.naamGehoord);
        return { tijd: tijdIso, tekst: r.tekst, delen: plaatsen.length ? markeerPlaatsen(delen, plaatsen) : delen };
      });
    })(),
    waarnemingen,
    verwachting,
    vertalingen,
  };
  caches.set(pad, { sleutel, resultaat });
  if (waarnemingen.length || verwachting.length) console.log(`[weer] radioTekst: ${station?.roepletters ?? stationId ?? '?'} — ${waarnemingen.length} waarnemingen, ${verwachting.length} tijdvakken`);
  return resultaat;
}

// Eén zender (radio_tekst_<ID>.txt) of, zonder id, alle zenders waar tekst van is.
export function fetchRadioTekst(stationId) {
  if (stationId) return leesBestand(radioBestand(stationId), stationId);
  const perStation = new Map();
  for (const b of alleBestanden()) {
    const r = leesBestand(b.pad, b.stationId);
    if (!r.beschikbaar || !r.station?.id) continue;
    const bestaand = perStation.get(r.station.id);
    if (!bestaand || new Date(r.bijgewerkt ?? 0) > new Date(bestaand.bijgewerkt ?? 0)) perStation.set(r.station.id, r);
  }
  return { beschikbaar: true, stations: [...perStation.values()] };
}

// ---- luisterrapport -----------------------------------------------------
// 2026-09-09, Lex: "kunnen we daar geen luisterrapportage voor maken zodat je
// kan meedenken?" Platte tekst per zender: elke regel van de laatste sessie,
// wat vertaald is (nu/vandaag/later), herkende plaatsen, en apart de zinnen
// met getallen/eenheden waar níéts mee gebeurd is — de kandidaten voor nieuwe
// patronen. Ophalen: curl -s "localhost:4780/api/radio-rapport?station=KEC56"
export function radioRapport(stationId) {
  const d = fetchRadioTekst(stationId);
  if (!d.beschikbaar) return `Geen tekst voor ${stationId}.\n`;
  const uit = [];
  const st = d.station;
  uit.push(`LUISTERRAPPORT ${st?.roepletters ?? stationId} — ${st?.plaats ?? ''}${st?.staat ? `, ${st.staat}` : ''}`);
  uit.push(`bijgewerkt ${d.bijgewerkt ?? '?'} · ${d.regels.length} regels · ${d.waarnemingen.length} waarnemingen met plaats · ${d.vertalingen.length} omrekeningen`);
  uit.push('');
  uit.push('== TEKST (per blok; [fragment → omrekening | soort], {plaats}) ==');
  const verdacht = [];
  for (const r of d.regels) {
    const t = new Date(r.tijd).toLocaleTimeString('nl-NL', { hour12: false });
    const delen = (r.delen ?? [{ tekst: r.tekst }]).map((x) => {
      if (x.plaats) return `{${x.tekst} → ${x.plaats}}`;
      if (x.vertaling) return `[${x.tekst} → ${x.vertaling} | ${x.soort}${x.woord ? ', woord' : ''}]`;
      return x.tekst;
    }).join('');
    uit.push(`${t}  ${delen}`);
    // verdacht: zinnen met een getal of eenheid waar geen vertaling in zit
    const zinnen = r.tekst.split(/(?<=[.!?;])\s+/);
    const vertaald = (r.delen ?? []).filter((x) => x.vertaling).map((x) => x.tekst.toLowerCase());
    for (const zin of zinnen) {
      const l = woordenNaarCijfers(zin.toLowerCase()).replace(/\b(?:relative\s+)?humidity\s+(?:was|is)?\s*\d{1,3}\s*(?:%|percent|degrees)?/g, ' ');
      const zonderTijd = l.replace(/\b\d{1,4}\s*(?:a\.?m\.?|p\.?m\.?)\b/g, ' ').replace(/\b\d{1,2}:\d{2}\b/g, ' ').replace(/\b(?:september|october|november|december|january|february|march|april|may|june|july|august)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?/g, ' ');
      const heeftGetal = /\b\d{1,3}\b|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b/.test(zonderTijd);
      const heeftEenheid = /\b(?:degrees?|mph|miles?|knots?|inches?|feet|foot|percent|hpa|millibars?|fahrenheit)\b/.test(l);
      const heeftWeer = /\b(?:temperature|wind|winds|gust|humidity|pressure|dew|visibility|seas?|waves?|rain|snow|highs?|lows?|heat index|chance)\b/.test(l);
      if ((heeftGetal && (heeftEenheid || heeftWeer)) && !vertaald.some((v) => l.includes(v))) verdacht.push(`${t}  ${zin.trim()}`);
    }
  }
  uit.push('');
  uit.push('== WAARNEMINGEN MET PLAATS ==');
  for (const w of d.waarnemingen) uit.push(`${w.naam.padEnd(24)} ${w.lucht?.icoon ?? '  '} ${w.tempC != null ? `${w.tempC} °C` : '     '}  ${w.wind?.tekst ?? ''}${w.dauwC != null ? ` · dauw ${w.dauwC} °C` : ''}${w.drukHpa ? ` · ${w.drukHpa} hPa` : ''}${w.golfM != null ? ` · golf ${w.golfM} m` : ''}   ("${w.naamGehoord}")`);
  if (!d.waarnemingen.length) uit.push('(geen)');
  uit.push('');
  uit.push('== ONBEKENDE PLAATSNAMEN (deze app-run) ==');
  const onbekend = [...gemeldOnbekend].sort();
  uit.push(onbekend.length ? onbekend.join(', ') : '(geen)');
  uit.push('');
  uit.push('== VERDACHT: getal/eenheid zonder omrekening ==');
  uit.push(verdacht.length ? verdacht.join('\n') : '(niets)');
  uit.push('');
  return uit.join('\n') + '\n';
}
