// nwrData.js — 2026-09-10, op verzoek van Lex ("deze info kunnen we vast wel
// ergens tekstbased vandaan halen"): dezelfde gegevens die een NOAA Weather
// Radio-zender voorleest, maar dan rechtstreeks uit de tekstproducten van de
// NWS. Geen spraakherkenning, geen buffer, geen gokwerk over "the temperature
// 88 degrees" — de zender blíjft er voor het luisteren, dit is de harde data.
//
// Per zender (lat/lon uit frontend/data/nwr-stations.json):
//   /points/<lat>,<lon>          → forecast-URL en de lijst waarneemstations
//   /gridpoints/<wfo>/<x>,<y>/forecast → de verwachting per tijdvak, al geparsed
//   /stations/<ICAO>/observations/latest → de actuele meting per plaats
//   ndbc.noaa.gov latest_obs.txt → alle boeien in één bestand, incl. golfhoogte
//
// De uitvoer heeft exact dezelfde vorm als fetchRadioTekst() (waarnemingen[] en
// verwachting[]), zodat de kaart er niets van hoeft te weten: de app zet in de
// NWR-balk een schakelaar om en tekent verder met dezelfde functies.
//
// Lex 10/09: geen straal en geen maximum — alle stations die /points voor deze
// zender teruggeeft. Wél strikt één zender per keer: alleen die waar je op klikt.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  stationInfo, lucht, neerslag, isDag, fNaarC, kmhNaarBft, tijdvakNl, tempTekstC, tijdvakOffset,
} from './radioTekst.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const CACHE_BESTAND = path.join(HIER, '..', 'data', 'nwr-punten.json'); // /points + stationslijst per zender; verandert nooit

const UA = 'weer-app-persoonlijk (contact: lokaal project)';
const OBS_MS = 10 * 60 * 1000; // METAR's komen elk uur, soms elk half uur
const VERWACHTING_MS = 30 * 60 * 1000;
const BOEIEN_MS = 10 * 60 * 1000;
// Geen straal (Lex 10/09: "je hoeft die straal dus niet te beperken tot 80,
// blijf daar vanaf"): alle waarneemstations die /points voor deze zender
// teruggeeft komen op de kaart. Wat de kaart rustig houdt is dat er maar één
// zender tegelijk wordt opgehaald — de zender waar je op klikt. Inperken kan
// desgewenst met NWR_DATA_MAX_KM in .env.
const MAX_KM = Number(process.env.NWR_DATA_MAX_KM) || 0; // 0 = geen grens
const MAX_STATIONS = Number(process.env.NWR_DATA_MAX_STATIONS) || 0; // 0 = geen grens

const geheugen = new Map(); // url -> { tot, waarde }
let puntenCache = null;

// 2026-09-10 (eind), na Lex' "ik krijg voortdurend dit": elke aanroep krijgt een
// tijdslimiet en twee herkansingen. Zonder dat sloopte één hikkende aanroep de
// hele zender — en juist /points en de stationslijst werden nergens opgevangen,
// dus dan werd er ook niets gecachet en ging het de keer erna wéér mis.
const AANROEP_MS = 8000;
const POGINGEN = 3;

async function haalEens(url) {
  const stop = new AbortController();
  const klok = setTimeout(() => stop.abort(), AANROEP_MS);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/geo+json' }, signal: stop.signal });
    if (!res.ok) {
      const err = new Error(`${res.status} ${res.statusText}`);
      err.status = res.status;
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(klok);
  }
}

// 2026-09-10, uit Lex' serverlog: veel waarneemstations uit de NWS-lijst hebben
// helemaal geen metingen-endpoint en geven 404. Zo'n antwoord verandert niet
// door het nog eens te vragen — herkansen kostte alleen maar seconden (drie
// pogingen per dood station) en maakte het juist trager. Alleen opnieuw
// proberen bij iets dat wél kan overwaaien: time-out, netwerkfout, 429, 5xx.
function magOpnieuw(err) {
  const st = err?.status;
  if (st == null) return true; // time-out of netwerkfout
  return st === 429 || st >= 500;
}

async function haal(url, ms) {
  const nu = Date.now();
  const c = geheugen.get(url);
  if (c && c.tot > nu) return c.waarde;
  let laatste = null;
  for (let poging = 1; poging <= POGINGEN; poging += 1) {
    try {
      const waarde = await haalEens(url);
      geheugen.set(url, { tot: Date.now() + ms, waarde });
      return waarde;
    } catch (err) {
      laatste = err;
      if (!magOpnieuw(err)) throw err; // 404 e.d.: definitief, niet nog eens vragen
      const reden = err?.name === 'AbortError' ? `geen antwoord binnen ${AANROEP_MS / 1000} s` : err.message;
      console.warn(`[weer] nwrData poging ${poging}/${POGINGEN} mislukt (${reden}): ${url}`);
      if (poging < POGINGEN) await new Promise((r) => setTimeout(r, 700 * poging));
    }
  }
  throw new Error(`${laatste?.name === 'AbortError' ? 'time-out' : laatste?.message} bij ${url}`);
}

function punten() {
  if (puntenCache) return puntenCache;
  try { puntenCache = JSON.parse(readFileSync(CACHE_BESTAND, 'utf-8')); } catch (_) { puntenCache = {}; }
  return puntenCache;
}

function puntenBewaar() {
  try {
    mkdirSync(path.dirname(CACHE_BESTAND), { recursive: true });
    writeFileSync(CACHE_BESTAND, JSON.stringify(puntenCache, null, 1));
  } catch (err) {
    console.warn('[weer] nwrData: punten-cache niet weggeschreven:', err.message);
  }
}

// /points en de stationslijst horen bij een vaste locatie en veranderen niet,
// dus die halen we één keer per zender op en zetten ze op schijf.
async function puntVoor(station) {
  const bestaand = punten()[station.id];
  if (bestaand) return bestaand;
  const p = (await haal(`https://api.weather.gov/points/${station.lat},${station.lon}`, 24 * 3600 * 1000)).properties;
  const lijst = await haal(p.observationStations, 24 * 3600 * 1000);
  const stations = (lijst.features ?? []).map((f) => ({
    id: f.properties.stationIdentifier,
    naam: plaatsnaam(f.properties.name),
    lat: f.geometry.coordinates[1],
    lon: f.geometry.coordinates[0],
  }));
  const punt = { forecast: p.forecast, zone: p.forecastZone, stations };
  punten()[station.id] = punt;
  puntenBewaar();
  console.log(`[weer] nwrData ${station.id}: ${stations.length} waarneemstations, zone ${String(p.forecastZone).split('/').pop()}`);
  return punt;
}

// "Tampa, Peter O Knight Airport" → "Tampa"; "Clearwater Air Park" → "Clearwater";
// "St. Petersburg/Clearwater Airport" → "St. Petersburg/Clearwater". De namen van
// de NWS zijn vliegveldnamen; op de kaart wil je de plaats zien.
function plaatsnaam(naam) {
  const s = String(naam ?? '').trim();
  const voorKomma = s.split(',')[0].trim();
  const kaal = voorKomma
    .replace(/\b(international|regional|municipal|county|executive|memorial|field|airpark|air park|airport|apt)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s-]+$/, '')
    .trim();
  return kaal.length >= 3 ? kaal : voorKomma;
}

const KOMPAS_NL = { N: 'N', NNE: 'NNO', NE: 'NO', ENE: 'ONO', E: 'O', ESE: 'OZO', SE: 'ZO', SSE: 'ZZO', S: 'Z', SSW: 'ZZW', SW: 'ZW', WSW: 'WZW', W: 'W', WNW: 'WNW', NW: 'NW', NNW: 'NNW' };
const KOMPAS_GRADEN = { N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5, S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5 };
const KOMPAS = Object.keys(KOMPAS_GRADEN);

function kortUitGraden(g) {
  if (!Number.isFinite(g)) return null;
  return KOMPAS[Math.round((((g % 360) + 360) % 360) / 22.5) % 16];
}

// Een lijst afwerken met hooguit `grootte` verzoeken tegelijk.
async function inBlokjes(lijst, grootte, doe) {
  const uit = [];
  for (let i = 0; i < lijst.length; i += grootte) {
    uit.push(...await Promise.all(lijst.slice(i, i + grootte).map(doe)));
  }
  return uit;
}

function afstandKm(aLat, aLon, bLat, bLon) {
  const dLat = (aLat - bLat) * 111;
  const dLon = (aLon - bLon) * 111 * Math.cos((((aLat + bLat) / 2) * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

// waarde uit de API is al SI (unitCode zegt welke), maar niet elk veld is gevuld
function num(v) {
  const x = v?.value;
  return typeof x === 'number' && Number.isFinite(x) ? x : null;
}

function windUitMeting(p) {
  const graden = num(p.windDirection);
  let kmh = num(p.windSpeed);
  if (kmh != null && /m_s|m\/s/.test(p.windSpeed?.unitCode ?? '')) kmh *= 3.6;
  if (kmh == null) return null;
  kmh = Math.round(kmh);
  const kort = kortUitGraden(graden);
  const bft = kmhNaarBft(kmh);
  const nl = kort ? (KOMPAS_NL[kort] ?? kort) : null;
  return { richting: nl, graden, kmhLo: kmh, kmhHi: kmh, bft, bftLo: bft, bftHi: bft, tekst: `${nl ? `${nl} ` : ''}${kmh} km/h (${bft} Bft)` };
}

async function waarnemingVoor(obs, zenderLon) {
  const d = await haal(`https://api.weather.gov/stations/${obs.id}/observations/latest`, OBS_MS);
  const p = d?.properties;
  if (!p) return null;
  const tempC = num(p.temperature) != null ? Math.round(num(p.temperature)) : null;
  const druk = num(p.barometricPressure);
  const omschrijving = p.textDescription ?? '';
  return {
    naam: obs.naam,
    naamGehoord: obs.id, // in de popup: waar de meting vandaan komt
    lat: obs.lat,
    lon: obs.lon,
    soort: 'plaats',
    bron: 'api',
    tijd: p.timestamp ?? null,
    tempC,
    tempF: tempC != null ? Math.round((tempC * 9) / 5 + 32) : null,
    lucht: omschrijving ? lucht(omschrijving, isDag(p.timestamp, zenderLon)) : null,
    luchtTekst: omschrijving || null,
    wind: windUitMeting(p),
    vochtPct: num(p.relativeHumidity) != null ? Math.round(num(p.relativeHumidity)) : null,
    drukHpa: druk != null ? Math.round(druk / 100) : null,
    zichtKm: num(p.visibility) != null ? Math.round(num(p.visibility) / 100) / 10 : null,
    heatIndexC: num(p.heatIndex) != null ? Math.round(num(p.heatIndex)) : null,
    golfM: null,
  };
}

// "5 to 10 mph" / "10 mph" → km/h + Bft; richting komt apart als "NE"
function windUitVerwachting(snelheid, richtingKort) {
  const m = /(\d{1,3})(?:\s*to\s*(\d{1,3}))?\s*(mph|km\/h|kt)/i.exec(String(snelheid ?? ''));
  if (!m) return null;
  const factor = /mph/i.test(m[3]) ? 1.609344 : (/kt/i.test(m[3]) ? 1.852 : 1);
  const lo = Math.round(Number(m[1]) * factor);
  const hi = Math.round(Number(m[2] ?? m[1]) * factor);
  const nl = richtingKort ? (KOMPAS_NL[String(richtingKort).toUpperCase()] ?? richtingKort) : null;
  const bftLo = kmhNaarBft(lo); const bftHi = kmhNaarBft(hi);
  return {
    richting: nl,
    graden: KOMPAS_GRADEN[String(richtingKort ?? '').toUpperCase()] ?? null,
    kmhLo: lo,
    kmhHi: hi,
    bftLo,
    bftHi,
    tekst: `${nl ? `${nl} ` : ''}${lo === hi ? lo : `${lo}–${hi}`} km/h (${bftLo === bftHi ? bftHi : `${bftLo}–${bftHi}`} Bft)`,
  };
}

async function verwachtingVoor(punt) {
  const d = await haal(punt.forecast, VERWACHTING_MS);
  const periodes = d?.properties?.periods ?? [];
  return periodes.map((p) => {
    const label = String(p.name ?? '').toLowerCase();
    const tempC = p.temperatureUnit === 'F' ? fNaarC(p.temperature) : Math.round(p.temperature);
    const bereik = { fLo: p.temperature, fHi: p.temperature, cLo: tempC, cHi: tempC, tekstF: String(p.temperature) };
    const kort = p.shortForecast ?? '';
    return {
      label,
      labelNl: tijdvakNl(label),
      nacht: p.isDaytime === false,
      bron: 'api',
      lucht: lucht(kort, p.isDaytime === true),
      neerslag: neerslag(kort),
      hoog: p.isDaytime ? bereik : null,
      laag: p.isDaytime ? null : bereik,
      hoogTekst: p.isDaytime ? tempTekstC(bereik) : null,
      laagTekst: p.isDaytime ? null : tempTekstC(bereik),
      wind: windUitVerwachting(p.windSpeed, p.windDirection),
      kansRegen: p.probabilityOfPrecipitation?.value ?? null,
      heatIndexC: null,
      vochtig: false,
      tekst: (p.detailedForecast ?? kort).slice(0, 400),
    };
  }).sort((a, b) => tijdvakOffset(a.label) - tijdvakOffset(b.label));
}

// Alle boeien en C-MAN-palen staan in één bestand met de laatste meting; dat is
// één download voor alle 46 zenders samen. Kolommen: STN LAT LON YY MM DD hh mm
// WDIR WSPD GST WVHT DPD APD MWD PRES PTDY ATMP WTMP DEWP VIS ...
let boeienCache = { tot: 0, lijst: [] };
async function boeien() {
  if (boeienCache.tot > Date.now()) return boeienCache.lijst;
  const res = await fetch('https://www.ndbc.noaa.gov/data/latest_obs/latest_obs.txt', { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`NDBC ${res.status}`);
  const regels = (await res.text()).split('\n').slice(2); // twee kopregels
  const getal = (v) => (v && v !== 'MM' ? Number(v) : null);
  const lijst = [];
  for (const r of regels) {
    const k = r.trim().split(/\s+/);
    if (k.length < 20) continue;
    const lat = getal(k[1]); const lon = getal(k[2]);
    if (lat == null || lon == null) continue;
    const wdir = getal(k[8]); const wspd = getal(k[9]); // m/s
    const atmp = getal(k[17]);
    lijst.push({
      id: k[0],
      lat,
      lon,
      tijd: new Date(Date.UTC(getal(k[3]), getal(k[4]) - 1, getal(k[5]), getal(k[6]), getal(k[7]))).toISOString(),
      windGraden: wdir,
      windKmh: wspd != null ? Math.round(wspd * 3.6) : null,
      golfM: getal(k[11]),
      drukHpa: getal(k[15]),
      tempC: atmp != null ? Math.round(atmp) : null,
      waterC: getal(k[18]) != null ? Math.round(getal(k[18])) : null,
    });
  }
  boeienCache = { tot: Date.now() + BOEIEN_MS, lijst };
  console.log(`[weer] nwrData: ${lijst.length} NDBC-boeien opgehaald`);
  return lijst;
}

function boeiAlsWaarneming(b) {
  const kort = kortUitGraden(b.windGraden);
  const bft = b.windKmh != null ? kmhNaarBft(b.windKmh) : null;
  return {
    naam: `Boei ${b.id}`,
    naamGehoord: b.id,
    lat: b.lat,
    lon: b.lon,
    soort: 'boei',
    bron: 'api',
    tijd: b.tijd,
    tempC: b.tempC,
    tempF: b.tempC != null ? Math.round((b.tempC * 9) / 5 + 32) : null,
    lucht: null,
    wind: b.windKmh != null ? { richting: kort ? (KOMPAS_NL[kort] ?? kort) : null, graden: b.windGraden, kmhLo: b.windKmh, kmhHi: b.windKmh, bft, bftLo: bft, bftHi: bft, tekst: `${kort ? `${KOMPAS_NL[kort] ?? kort} ` : ''}${b.windKmh} km/h (${bft} Bft)` } : null,
    golfM: b.golfM,
    waterC: b.waterC,
    drukHpa: b.drukHpa,
    vochtPct: null,
  };
}

// Alles voor één zender, in de vorm die de kaart al kent.
export async function fetchNwrData(stationId) {
  const station = stationInfo(stationId);
  if (!station) return { beschikbaar: false, fout: 'onbekende zender' };
  const punt = await puntVoor(station);

  let lijst = punt.stations.map((s) => ({ ...s, km: afstandKm(station.lat, station.lon, s.lat, s.lon) }));
  if (MAX_KM > 0) lijst = lijst.filter((s) => s.km <= MAX_KM);
  lijst.sort((a, b) => a.km - b.km);
  if (MAX_STATIONS > 0) lijst = lijst.slice(0, MAX_STATIONS);

  // 2026-09-10 (eind), Lex: "het blijft erratic". Gereproduceerd: twee zenders
  // vlak achter elkaar opvragen liet ze allebéi mislukken. Oorzaak was dit:
  // alle metingen tegelijk (voor Philadelphia 92 verbindingen in één klap), en
  // bij twee overlappende zenders ruim 150 — dan breken er verbindingen af en
  // komt er van geen van beide iets terug. Nu in blokjes van acht: een paar
  // seconden trager, maar het houdt stand.
  const dood = new Set(); // stations zonder metingen-endpoint (404): één keer leren is genoeg
  const gemeten = await inBlokjes(lijst, 8, (s) => waarnemingVoor(s, station.lon).catch((err) => {
    if (err?.status === 404) dood.add(s.id); else console.warn(`[weer] nwrData ${stationId}/${s.id}: ${err.message}`);
    return null;
  }));
  if (dood.size) {
    punt.stations = punt.stations.filter((s) => !dood.has(s.id));
    puntenBewaar();
    console.log(`[weer] nwrData ${stationId}: ${dood.size} station(s) zonder metingen uit de lijst gehaald (${[...dood].join(', ')}), ${punt.stations.length} over`);
  }
  const waarnemingen = gemeten.filter(Boolean).filter((w) => w.tempC != null || w.wind);

  let watWater = [];
  try {
    const straal = MAX_KM > 0 ? MAX_KM : 150; // boeien altijd begrenzen: anders komt de halve Golf van Mexico mee
    watWater = (await boeien())
      .filter((b) => afstandKm(station.lat, station.lon, b.lat, b.lon) <= straal)
      .map(boeiAlsWaarneming);
  } catch (err) {
    console.warn(`[weer] nwrData ${stationId}: boeien mislukt: ${err.message}`);
  }

  const verwachting = await verwachtingVoor(punt).catch((err) => {
    console.warn(`[weer] nwrData ${stationId}: verwachting mislukt: ${err.message}`);
    return [];
  });

  return {
    beschikbaar: true,
    bron: 'api',
    station: { id: station.id, roepletters: station.roepletters, plaats: station.plaats, staat: station.staat, lat: station.lat, lon: station.lon, mhz: station.mhz },
    zone: String(punt.zone ?? '').split('/').pop() || null,
    bijgewerkt: new Date().toISOString(),
    live: true,
    regels: [],
    waarnemingen: [...waarnemingen, ...watWater],
    verwachting,
  };
}
