// nwrGeocode.js — 2026-09-09, Lex: "kunnen we niet gebruikmaken van de
// Leaflet-benamingen?" De kaarttegels zijn plaatjes, maar dezelfde bron
// (OpenStreetMap) heeft een zoekdienst: Nominatim. Een plaatsnaam die de
// NWR-zender noemt en die niet in data/nwr-plaatsen.json staat, zoeken we
// hier op — begrensd tot een blok van ±3° rond de zender, en alleen
// geaccepteerd binnen MAX_KM. De uitkomst (ook "niet gevonden") gaat in een
// cachebestand naast de radio-tekstbestanden, zodat elke naam hooguit één
// keer per week naar buiten gaat. Nominatim-regels: max 1 verzoek/s en een
// herkenbare User-Agent — vandaar de wachtrij.
//
// Synchroon gebruik: `opzoeken()` kijkt alleen in de cache (de parser is
// synchroon); bij een misser wordt het verzoek in de wachtrij gezet en is het
// resultaat er bij de volgende parse (de app parset elke 10 s opnieuw).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const MAX_KM = 300;
const HERPROBEER_MS = 7 * 24 * 60 * 60 * 1000;
const UA = 'weer-app/1.0 (persoonlijke weer-app, lexvisser@gmail.com)';

let cachePad = null;
let cache = null; // sleutel "stationId|naam" -> { lat, lon, naam, t } | { t, geen: true }
const wachtrij = [];
const inWachtrij = new Set();
let bezig = false;
let laatsteVerzoek = 0;

function laad(map) {
  const pad = path.join(map, 'nwr_plaatsen_cache.json');
  if (cache && cachePad === pad) return;
  cachePad = pad;
  try { cache = existsSync(pad) ? JSON.parse(readFileSync(pad, 'utf-8')) : {}; } catch (_) { cache = {}; }
}

function bewaar() {
  try { writeFileSync(cachePad, JSON.stringify(cache, null, 1)); } catch (err) { console.warn('[weer] nwrGeocode: cache niet weggeschreven:', err.message); }
}

function afstandKm(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r; const dLon = (lon2 - lon1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

// Alleen namen die op een plaats kunnen slaan: 4+ tekens, letters, geen
// weerwoorden of getallen.
const NIET = new Set(('sunny clear cloudy overcast fair fog foggy haze hazy rain showers thunderstorms thunderstorm wind winds calm gusting gusts gust '
  + 'south north east west northeast northwest southeast southwest degrees temperature humidity pressure dew point airport reports report weather '
  + 'following region area station radio service forecast today tonight morning afternoon evening the and at in of on was were is are it its hour '
  + 'miles knots percent inches feet rising falling steady could would should talk with only we have has had you your our a an am pm this that '
  + 'these those here there now then also again once still just very more most some any all each other such into out up down over under '
  + 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty '
  + 'air to from for by as be been being not no yes so if or but than too about after before during between around near across along '
  + 'reporting observed current currently conditions condition visibility sky skies partly mostly light heavy variable').split(' '));
export function geschikt(naam) {
  const n = String(naam).toLowerCase().trim();
  if (n.length < 4 || /\d/.test(n)) return false;
  if (!/^[a-z][a-z .'-]+$/.test(n)) return false;
  const woorden = n.split(/\s+/);
  if (woorden.length > 3) return false;
  // elk woord moet een plausibel naamwoord zijn: geen stopwoord, minstens 3 letters (behalve st/ft/mt)
  return woorden.every((w) => !NIET.has(w) && (w.length >= 3 || /^(st|ft|mt)\.?$/.test(w)));
}

// Synchroon: cache-antwoord of null (en dan op de wachtrij als 'geschikt').
export function opzoeken(map, station, naam) {
  if (!station?.id || !Number.isFinite(station.lat)) return null;
  laad(map);
  const sleutel = `${station.id}|${String(naam).toLowerCase().trim()}`;
  const c = cache[sleutel];
  if (c && !c.geen) return { naam: c.naam, lat: c.lat, lon: c.lon, bron: 'osm' };
  if (c && c.geen && Date.now() - c.t < HERPROBEER_MS) return null;
  if (!geschikt(naam) || inWachtrij.has(sleutel)) return null;
  inWachtrij.add(sleutel);
  wachtrij.push({ sleutel, naam: String(naam).trim(), station });
  setImmediate(volgende);
  return null;
}

async function volgende() {
  if (bezig) return;
  const taak = wachtrij.shift();
  if (!taak) return;
  bezig = true;
  const wacht = Math.max(0, 1100 - (Date.now() - laatsteVerzoek)); // Nominatim: max 1/s
  await new Promise((r) => setTimeout(r, wacht));
  laatsteVerzoek = Date.now();
  const { station } = taak;
  const vb = `${station.lon - 3},${station.lat + 3},${station.lon + 3},${station.lat - 3}`;
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=us&bounded=1&viewbox=${vb}&q=${encodeURIComponent(taak.naam)}`;
  let uitkomst = { t: Date.now(), geen: true };
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    {
      const lijst = await res.json();
      const ok = (Array.isArray(lijst) ? lijst : [])
        .map((x) => ({ lat: Number(x.lat), lon: Number(x.lon), naam: (x.name || x.display_name || taak.naam).split(',')[0], soort: `${x.category ?? x.class}/${x.type}`, adres: x.addresstype ?? '', belang: Number(x.importance ?? 0) }))
        // geen staten/county's/landen: "oklahoma" (uit "oklahoma city", te ver) landde anders op de staat Oklahoma
        .filter((x) => !/^(state|county|country|region|province)$/.test(x.adres) && !/^(state|county|country|region|province)$/.test(x.soort.split('/')[1]))
        .filter((x) => Number.isFinite(x.lat) && afstandKm(station.lat, station.lon, x.lat, x.lon) <= MAX_KM)
        // plaatsen, vliegvelden, waterlichamen; geen straten/winkels
        .filter((x) => /^(place|aeroway|boundary\/administrative|natural\/(bay|cape|beach|water)|landuse\/military)/.test(x.soort))
        .sort((a, b) => b.belang - a.belang);
      if (ok.length) uitkomst = { t: Date.now(), lat: ok[0].lat, lon: ok[0].lon, naam: ok[0].naam, soort: ok[0].soort };
    }
  } catch (err) {
    console.warn(`[weer] nwrGeocode: "${taak.naam}" mislukt: ${err.message}`);
    uitkomst = { t: Date.now() - HERPROBEER_MS + 60 * 60 * 1000, geen: true }; // over een uur opnieuw
  }
  cache[taak.sleutel] = uitkomst;
  bewaar();
  console.log(`[weer] nwrGeocode ${station.id}: "${taak.naam}" → ${uitkomst.geen ? 'niet gevonden' : `${uitkomst.naam} (${uitkomst.lat.toFixed(2)}, ${uitkomst.lon.toFixed(2)}, ${uitkomst.soort})`}`);
  inWachtrij.delete(taak.sleutel);
  bezig = false;
  if (wachtrij.length) setImmediate(volgende);
}

// Vrij zoeken (zoekveld in de app, 2026-09-09): geen zender-begrenzing, één
// verzoek per aanroep, zelfde nettigheid (1/s, User-Agent). Geeft de beste
// treffer terug of null.
let laatsteVrij = 0;
export async function zoekVrij(q) {
  const wacht = Math.max(0, 1100 - (Date.now() - laatsteVrij));
  await new Promise((r) => setTimeout(r, wacht));
  laatsteVrij = Date.now();
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'nl,en' }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const lijst = await res.json();
  const x = Array.isArray(lijst) ? lijst[0] : null;
  if (!x) return null;
  return { naam: x.display_name, lat: Number(x.lat), lon: Number(x.lon), soort: `${x.category ?? x.class}/${x.type}` };
}
