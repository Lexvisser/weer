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

const HAVENS = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'unlocodeHavens.json'), 'utf8'));
const AANGEKOMEN_KM = 8; // afgemeerd/voor anker binnen deze afstand van de haven-coördinaat telt als aangekomen
const MIN_START_KM = 2; // korter dan dit is geen "reis", geen voortgang tonen
const VERGEET_NA_MS = 6 * 3600 * 1000; // startpunt van een schip dat we lang niet zagen opruimen

// mmsi -> { bestemming, startKm, gezienMs }
const starts = new Map();

// "NLRTM" / "NL RTM" / "nl rtm" -> { code, naam, lat, lon } of null
export function havenVoorBestemming(bestemming) {
  const t = String(bestemming ?? '').trim().toUpperCase();
  const m = t.match(/^([A-Z]{2})\s?([A-Z2-9]{3})$/);
  if (!m) return null;
  const rec = HAVENS[m[1] + m[2]];
  if (!rec) return null;
  return { code: `${m[1]} ${m[2]}`, lat: rec[0], lon: rec[1], naam: rec[2] };
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
  if (!start || start.bestemming !== haven.code) {
    start = { bestemming: haven.code, startKm: afstand, gezienMs: nu };
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
