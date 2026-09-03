// 2026-09-03, op verzoek van Lex ("MarineTraffic gebruikt de pijl om te tonen
// hoeveel van de reis is afgelegd... ok"): geschatte reisvoortgang per schip
// voor de reislijn in de scheepspopup (zie scheepsKaartHtml() in app.js).
//
// EERLIJKE BEPERKING: AIS zendt géén vertrekhaven of vertrektijd uit, alleen
// de bestemming (+ ETA). MarineTraffic haalt ATD/vertrekhaven uit z'n eigen
// havenhistorie. Wij benaderen het zo:
//   1. bestemming -> coördinaten via de UN/LOCODE-haventabel
//      (unlocodeHavens.json, afgeleid van de publieke UNECE-lijst, alleen
//      locaties met functie 1 = haven en met coördinaten; ~11.8k havens).
//      Alleen bestemmingen in LOCODE-vorm ("NLRTM", "NL RTM") zijn herleidbaar;
//      vrije tekst ("ROTTERDAM 7E PETROH") levert null op.
//   2. startpunt = de afstand tot die haven op het moment dat WIJ het schip
//      voor het eerst met deze bestemming zien (of het verste punt sindsdien,
//      als het eerst nog van de haven af vaart). Voortgang = 1 - nu/start.
//   3. afgemeerd/voor anker binnen AANGEKOMEN_KM van de haven = 100%.
// Het is dus een schatting vanaf ons eerste gezicht, niet vanaf de echte
// vertrekhaven -- een schip dat al onderweg was, begint bij ons op 0%.
// Startpunten leven in het geheugen van het proces (herstart = opnieuw
// beginnen); bewust geen schijfstate, dit is cosmetische informatie.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afstandKm } from './normalize.js';

import { AANVULLINGEN, ALIASSEN } from './havenNamen.js';

const HAVENS = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'unlocodeHavens.json'), 'utf8'));
for (const [code, rec] of Object.entries(AANVULLINGEN)) HAVENS[code] ??= rec; // zie havenNamen.js
const PSEUDO_CODE = /^(NLRT\d|NLAM\d|BEAN\d)$/; // interne bekken-codes, niet als LOCODE tonen

// 2026-09-03: naam-index voor vrije-tekstbestemmingen (85% van de schepen,
// zie havenNamen.js). Alleen landen rond ons vaargebied, en bij een dubbele
// naam wint NL > BE > DE > rest ("Kampen" is hier de IJssel, niet Sylt).
const NAAM_LANDEN = ['NL', 'BE', 'DE', 'FR', 'GB', 'DK', 'LU', 'CH', 'NO', 'SE', 'PL'];
const NAMEN = new Map(); // genormaliseerde naam -> code
for (const [code, rec] of Object.entries(HAVENS)) {
  const landIdx = NAAM_LANDEN.indexOf(code.slice(0, 2));
  if (landIdx < 0) continue;
  for (const deel of String(rec[2] ?? '').split('/')) {
    const naam = normaliseerNaam(deel.replace(/\(.*?\)/g, ''));
    if (naam.length < 3) continue; // 3-letternamen (Urk) alleen via exacte hele-tekst-match, zie zoekHavenOpNaam()
    const bestaand = NAMEN.get(naam);
    if (!bestaand || NAAM_LANDEN.indexOf(bestaand.slice(0, 2)) > landIdx) NAMEN.set(naam, code);
  }
}
for (const [naam, code] of Object.entries(ALIASSEN)) NAMEN.set(normaliseerNaam(naam), code);
const NAAM_SLEUTELS = [...NAMEN.keys()];

function toonNaam(naam) {
  return String(naam ?? '').replace(/\s*\(.*?\)/g, '').trim(); // "Brugge (Bruges)" -> "Brugge"
}

function normaliseerNaam(t) {
  return String(t ?? '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Zoekt een haven bij vrije tekst: hele tekst, dan eerste twee woorden, dan
// eerste woord; en omdat AIS-bestemmingen op 20 tekens afgekapt worden
// ("AMSTERDAM AMERIKAHAV") ook als prefix van een bekende naam (min. 8 tekens).
function zoekHavenOpNaam(tekst) {
  const t = normaliseerNaam(tekst);
  if (!t) return null;
  const woorden = t.split(' ');
  if (NAMEN.has(t)) return NAMEN.get(t); // hele tekst exact ("URK" mag hier wel 3 tekens zijn)
  const tweeWoorden = woorden.slice(0, 2).join(' ');
  if (woorden.length >= 2 && NAMEN.has(tweeWoorden)) return NAMEN.get(tweeWoorden);
  if (t.length >= 8) {
    // afgekapte naam ("AMSTERDAM AMERIKAHAV") -- vóór de eerste-woord-poging,
    // anders wint "Amsterdam" altijd van "Amsterdam Amerikahaven"
    const prefix = NAAM_SLEUTELS.find((naam) => naam.startsWith(t));
    if (prefix) return NAMEN.get(prefix);
  }
  if (woorden[0].length >= 4 && NAMEN.has(woorden[0])) return NAMEN.get(woorden[0]);
  return null;
}
const AANGEKOMEN_KM = 8; // afgemeerd/voor anker binnen deze afstand van de haven-coördinaat telt als aangekomen
const MIN_START_KM = 2; // korter dan dit is geen "reis", geen voortgang tonen
const VERGEET_NA_MS = 6 * 3600 * 1000; // startpunt van een schip dat we lang niet zagen opruimen

// mmsi -> { bestemming, startKm, gezienMs }
const starts = new Map();

// "NLRTM" / "NL RTM" / "nl rtm" -> { code, naam, lat, lon } of null
// Resultaat: { code, naam, lat, lon }; code is null bij een naam-match
// (vrije tekst) of een interne bekken-code -- de frontend toont dan de tekst
// zoals het schip 'm uitzendt, met de herkende havennaam eronder.
export function havenVoorBestemming(bestemming) {
  const t = String(bestemming ?? '').trim().toUpperCase();
  if (!t) return null;
  const m = t.match(/^([A-Z]{2})\s?([A-Z2-9]{3})$/);
  if (m && HAVENS[m[1] + m[2]]) {
    const rec = HAVENS[m[1] + m[2]];
    return { code: `${m[1]} ${m[2]}`, lat: rec[0], lon: rec[1], naam: toonNaam(rec[2]) };
  }
  const code = zoekHavenOpNaam(t);
  const rec = code ? HAVENS[code] : null;
  if (!rec) return null;
  return { code: null, naam: toonNaam(rec[2]), lat: rec[0], lon: rec[1], viaNaam: code };
}

// Verrijkt één schip (in place): bestemmingHaven, bestemmingAfstandKm, reisVoortgang (0..1 of null).
export function verrijkMetReisvoortgang(s, nu = Date.now()) {
  const haven = havenVoorBestemming(s.bestemming);
  if (!haven) {
    starts.delete(s.mmsi);
    s.reisVoortgang = null;
    return s;
  }
  const afstand = afstandKm(s.lat, s.lon, haven.lat, haven.lon);
  s.bestemmingHaven = { code: haven.code, naam: haven.naam };
  s.bestemmingAfstandKm = Math.round(afstand);

  let start = starts.get(s.mmsi);
  const reisSleutel = haven.code ?? haven.viaNaam;
  if (!start || start.bestemming !== reisSleutel) {
    start = { bestemming: reisSleutel, startKm: afstand, gezienMs: nu };
    starts.set(s.mmsi, start);
  }
  start.gezienMs = nu;
  if (afstand > start.startKm) start.startKm = afstand; // eerst nog van de haven af: verste punt wordt het startpunt

  const aangekomen = (s.status === 5 || s.status === 1) && afstand <= AANGEKOMEN_KM;
  if (aangekomen) s.reisVoortgang = 1;
  else if (start.startKm < MIN_START_KM) s.reisVoortgang = null;
  else s.reisVoortgang = Math.max(0, Math.min(1, 1 - afstand / start.startKm));
  return s;
}

// Af en toe aanroepen (bijv. per /api/vaarradar-aanvraag) -- houdt de Map klein.
export function ruimReisvoortgangOp(nu = Date.now()) {
  for (const [mmsi, start] of starts) if (nu - start.gezienMs > VERGEET_NA_MS) starts.delete(mmsi);
}
