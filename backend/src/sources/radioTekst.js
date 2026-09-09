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

const HIER = path.dirname(fileURLToPath(import.meta.url));
const PLAATSEN_BESTAND = path.join(HIER, '..', 'data', 'nwr-plaatsen.json');
const STATIONS_BESTAND = path.join(HIER, '..', '..', '..', 'frontend', 'data', 'nwr-stations.json');

const MAX_LEEFTIJD_MS = 3 * 60 * 60 * 1000; // waarnemingen/verwachting ouder dan dit niet meer tonen
const BUFFER_MS = 45 * 60 * 1000; // zoveel tekst kijken we terug (één NWR-cyclus is ~10 min)

const caches = new Map(); // pad -> { sleutel, resultaat }
let plaatsenCache = null;
let stationsCache = null;
const gemeldOnbekend = new Set();

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
  const grens = naam.length < 5 ? 0 : Math.max(2, Math.floor(naam.length * 0.3));
  if (beste && besteAfstand <= grens) return beste;
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
    .replace(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[ -](one|two|three|four|five|six|seven|eight|nine)\b/g, (m, a, b) => String(WOORDGETAL[a] + WOORDGETAL[b]))
    .replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b(?=\s+(?:to\s+\w+\s+)?(?:miles|mph|knots|feet|foot|degrees|percent|seconds))/g, (m) => String(WOORDGETAL[m]));
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
const RICHTING_RE = '(north\\s*northeast|east\\s*northeast|east\\s*southeast|south\\s*southeast|south\\s*southwest|west\\s*southwest|west\\s*northwest|north\\s*northwest|northeast|northwest|southeast|southwest|north|south|east|west)';
function richting(txt) {
  const k = normaliseer(txt);
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
function lucht(txt) {
  const t = txt.toLowerCase();
  for (const [re, v] of LUCHT) if (re.test(t)) return v;
  return null;
}

const KANS = { 'slight chance': 'kleine kans op', chance: 'kans op', likely: 'waarschijnlijk', definite: '', '': '' };
const NEERSLAG = [
  [/showers and thunderstorms|thunderstorms and showers/, { nl: 'buien en onweer', icoon: '⛈️' }],
  [/thunderstorms?|t-storms?/, { nl: 'onweer', icoon: '⛈️' }],
  [/showers?/, { nl: 'buien', icoon: '🌦️' }],
  [/\brain\b/, { nl: 'regen', icoon: '🌧️' }],
  [/drizzle/, { nl: 'motregen', icoon: '🌧️' }],
  [/\bsnow\b/, { nl: 'sneeuw', icoon: '🌨️' }],
];
function neerslag(txt) {
  const t = txt.toLowerCase().replace(/chance of (?:rain|precipitation)\s+(?:is\s+)?\d{1,3}\s*(?:%|percent)/g, ' ');
  const uit = [];
  const re = /(slight chance|chance|likely|definite)?\s*(?:of\s+)?(showers and thunderstorms|thunderstorms and showers|thunderstorms?|t-storms?|showers?|\brain\b|drizzle|\bsnow\b)(\s+likely)?/g;
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
      const heat = /heat index (?:values?\s+)?(?:up to|around|near|of|to)\s+(\d{2,3})/.exec(inhoud);
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
  return volgorde.map((l) => perLabel.get(l)).map((v) => ({ ...v, hoogTekst: tempTekstC(v.hoog), laagTekst: tempTekstC(v.laag) }));
}

// ---- waarnemingen -------------------------------------------------------
// Aanpak: elke "it was" is een waarneming; de plaats staat in de (max vier)
// woorden ervóór ("at panama city northwest it was" → probeer alle
// aaneengesloten woordgroepen, langste eerst, tegen de plaatsenlijst), en
// temperatuur/wind staan in het stuk tót de volgende "it was".
function zoekPlaatsInWoorden(plaatsen, woorden) {
  for (let len = Math.min(4, woorden.length); len >= 1; len -= 1) {
    for (let start = woorden.length - len; start >= 0; start -= 1) {
      const kandidaat = woorden.slice(start, start + len).join(' ');
      if (/^(at|in|if|and|the|it|was|hour|degrees)$/.test(kandidaat)) continue;
      const p = zoekPlaats(plaatsen, kandidaat, true);
      if (p) return { plaats: p, gehoord: kandidaat };
    }
  }
  return null;
}

function parseWaarnemingen(tekst, plaatsen, tijd) {
  const t = woordenNaarCijfers(tekst.toLowerCase().replace(/[,.;:!?]/g, ' ').replace(/\s+/g, ' '));
  const uit = new Map();
  const grenzen = [];
  const re = /\bit was\b/g;
  let m;
  while ((m = re.exec(t)) !== null) grenzen.push(m.index);
  for (let i = 0; i < grenzen.length; i += 1) {
    const voor = t.slice(Math.max(0, grenzen[i] - 60), grenzen[i]).trim().split(' ').filter(Boolean).slice(-5);
    const gevonden = zoekPlaatsInWoorden(plaatsen, voor);
    if (!gevonden) continue;
    const segment = t.slice(grenzen[i] + 6, i + 1 < grenzen.length ? grenzen[i + 1] : Math.min(t.length, grenzen[i] + 260));
    const temp = /the temperature was\s+(\d{1,3})\s*degrees?/.exec(segment);
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
    const vocht = /humidity was\s+(\d{1,3})/.exec(segment);
    const druk = /pressure was\s+(\d{2}\.\d{2})/.exec(segment);
    const { plaats } = gevonden;
    uit.set(plaats.naam, {
      naam: plaats.naam,
      naamGehoord: gevonden.gehoord,
      lat: plaats.lat,
      lon: plaats.lon,
      soort: 'plaats',
      tijd,
      lucht: lucht(segment.slice(0, temp.index)),
      tempF: f,
      tempC: fNaarC(f),
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
    uit.set(plaats.naam, {
      naam: plaats.naam,
      naamGehoord: `buoy ${m[1].trim()}`,
      lat: plaats.lat,
      lon: plaats.lon,
      soort: 'boei',
      tijd,
      lucht: null,
      tempF: null,
      tempC: null,
      wind: { richting: r.kort, graden: r.graden, kmh, kn, bft: kmhNaarBft(kmh), tekst: `${r.kort} ${kn} kn · ${kmhNaarBft(kmh)} Bft` },
      golfM: zee ? ftNaarM(Number(zee[1])) : null,
    });
  }
  return [...uit.values()];
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
    const kop = /^#station\s+(\S+)/.exec(inhoud);
    if (kop) { stationId = kop[1]; continue; }
    if (!inhoud) continue;
    regels.push({ tijd, tekst: inhoud });
  }
  const recent = regels.filter((r) => nu - r.tijd.getTime() <= BUFFER_MS);
  const station = stationId ? stationInfo(stationId) : null;
  const plaatsen = stationId ? plaatsenVoor(stationId) : [];
  const buffer = recent.map((r) => r.tekst).join(' ');
  const laatsteTijd = recent.length ? recent[recent.length - 1].tijd : (regels.length ? regels[regels.length - 1].tijd : null);
  const oud = laatsteTijd ? nu - laatsteTijd.getTime() > MAX_LEEFTIJD_MS : true;

  const waarnemingen = oud ? [] : parseWaarnemingen(buffer, plaatsen, laatsteTijd.toISOString());
  const verwachting = oud ? [] : parseVerwachting(buffer);

  const resultaat = {
    beschikbaar: true,
    station: station ? { id: station.id, roepletters: station.roepletters, plaats: station.plaats, staat: station.staat, lat: station.lat, lon: station.lon, mhz: station.mhz } : (stationId ? { id: stationId } : null),
    bijgewerkt: laatsteTijd ? laatsteTijd.toISOString() : null,
    live: laatsteTijd ? nu - laatsteTijd.getTime() < 3 * 60 * 1000 : false,
    regels: regels.slice(-40).map((r) => ({ tijd: r.tijd.toISOString(), tekst: r.tekst })),
    waarnemingen,
    verwachting,
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
