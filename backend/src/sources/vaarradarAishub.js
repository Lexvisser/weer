// vaarradarAishub.js — AANVULLENDE scheepsposities via AISHub's aggregatie-
// netwerk, op verzoek van Lex 2026-09-01 ("we konden toch lid worden en dan
// zodoende veel gaan pollen ergens, doordat we nu zelf ontvangen"). Anders
// dan vaarradar.js (aisstream.io) is dit GEEN fallback voor als de lokale
// ontvangst leeg is, maar een MERGE naast vaarradarLokaal.js — het doel is
// niet "sneller dan onze eigen ontvangst" (dat kan niet, zie de 60s-
// ratelimit hieronder) maar "schepen zien die onze antenne mist" (hard
// aangetoond 2026-09-01: schepen binnen bereik kregen soms maar een fractie
// van hun berichten gedecodeerd, zie de sessie-notitie van die dag).
//
// Lex is toegelaten als contributor (aanvraag 2026-09-01, station-ID 4152,
// eigen ontvangst gedeeld via UDP naar data.aishub.net:4152, zie de
// bijgewerkte ExecStart in /etc/systemd/system/ais-catcher.service op
// lexdev-nw) en kreeg DIRECT een API-key/username (AH_4152_E3319140) mee in
// de bevestigingsmail — dus zonder de aangekondigde 7-dagen-kwaliteitstoets
// af te wachten. Die sleutel hoort ALLEEN in het echte .env-bestand op
// lexdev-nw, nooit in git (zie AISHUB_USERNAME in .env.example).
//
// API: https://www.aishub.net/api — GET https://data.aishub.net/ws.php met
// query-params username/format/output/latmin/latmax/lonmin/lonmax/interval.
// format=1 (mensleesbare velden i.p.v. rauwe AIS-encoding), output=json.
// BELANGRIJKE REGEL van AISHub zelf: "Don't access the webservice more
// frequently than once per minute! The web service will return nothing if
// executed more frequently!" — vandaar POLL_MS hieronder ruim boven 60s.
//
// Responsvorm (bevestigd via AISHub's eigen documentatie-voorbeeld, NIET
// live getest vanuit deze sessie — geen curl-toegang tot lexdev-nw hiervoor
// nodig gehad, maar wel expliciet nagekeken i.p.v. geraden na eerdere fouten
// met aannames over externe formaten in dit project):
//   [ { "ERROR": false, "USERNAME": "...", "FORMAT": "HUMAN", "RECORDS": 5 },
//     [ { "MMSI": 244750034, "TIME": "2021-07-09 08:06:53 GMT",
//         "LONGITUDE": 5.03806, "LATITUDE": 52.46015, "COG": 360, "SOG": 0,
//         "HEADING": 511, "ROT": 128, "NAVSTAT": 8, "IMO": 0,
//         "NAME": "CHATEAUROUX", "CALLSIGN": "PH7002", "TYPE": 69,
//         "A": 24, "B": 6, "C": 0, "D": 6, "DRAUGHT": 1.2, "DEST": "",
//         "ETA": "00-00 24:60" }, ... ] ]
// Dus een array van TWEE elementen: eerst een statusobject (ERROR moet
// false zijn), dan pas de array met schepen — GEEN kale schepenlijst zoals
// bij vaarradarLokaal.js's GeoJSON. HEADING=511 is dezelfde AIS-sentinel
// voor "onbekend" als bij de lokale bron, TYPE is dezelfde ITU-R
// M.1371-scheepstypecode als AIS-catcher's shiptype-veld — vandaar hergebruik
// van categoriseerScheepstype() uit vaarradarLokaal.js i.p.v. een eigen kopie.

import { categoriseerScheepstype } from './vaarradarLokaal.js';

const POLL_MS = 65 * 1000; // ruim boven AISHub's "niet vaker dan 1x/minuut"
const VENSTER_MS = 15 * 60 * 1000; // iets ruimer dan vaarradarLokaal.js's 10 min -- AISHub's eigen
// vertraging (andere stations, netwerklatency) betekent dat "vers" hier sowieso wat rekkelijker is
const BACKOFF_START_MS = 30 * 1000;
const BACKOFF_MAX_MS = 5 * 60 * 1000;
const BOX_KM = 100; // zelfde straal als het bestaande /api/vaarradar-maximum (straal wordt daar al gekapt op 100)

function bounding(homeLat, homeLon) {
  const latMargin = BOX_KM / 111; // 1 breedtegraad ~ 111km, overal op aarde
  const lonMargin = BOX_KM / (111 * Math.max(0.1, Math.cos((homeLat * Math.PI) / 180))); // lengtegraad krimpt met cos(breedtegraad)
  return {
    latmin: homeLat - latMargin,
    latmax: homeLat + latMargin,
    lonmin: homeLon - lonMargin,
    lonmax: homeLon + lonMargin,
  };
}

function vertaalVaartuig(v) {
  const mmsi = v?.MMSI;
  const lat = v?.LATITUDE;
  const lon = v?.LONGITUDE;
  if (mmsi == null || typeof lat !== 'number' || typeof lon !== 'number') return null;

  const koersGraden =
    typeof v.HEADING === 'number' && v.HEADING < 511 ? v.HEADING : typeof v.COG === 'number' ? v.COG : null;

  // TIME komt als "YYYY-MM-DD HH:MM:SS GMT" -- Node/V8 parsen dat formaat
  // prima (niet-standaard maar breed ondersteunde uitbreiding), maar val bij
  // een onverwachte afwijking terug op "nu" i.p.v. een NaN-tijdstip.
  const geparsed = typeof v.TIME === 'string' ? Date.parse(v.TIME) : NaN;
  const tijdMs = Number.isFinite(geparsed) ? geparsed : Date.now();

  return {
    mmsi,
    naam: String(v.NAME ?? '').trim() || null,
    lat,
    lon,
    koersGraden,
    snelheidKn: typeof v.SOG === 'number' ? v.SOG : null,
    scheepscategorie: categoriseerScheepstype(typeof v.TYPE === 'number' ? v.TYPE : null),
    tijdMs,
  };
}

export function startVaarradarAishubFeed(env) {
  const posities = new Map(); // mmsi -> { mmsi, naam, lat, lon, koersGraden, snelheidKn, scheepscategorie, tijdMs }

  if (!env.aishubUsername) {
    console.log('[weer] vaarradarAishub: geen AISHUB_USERNAME ingesteld, laag blijft leeg (zie backend/.env.example).');
    return { posities, stop: () => {} };
  }
  if (typeof fetch === 'undefined') {
    console.log('[weer] vaarradarAishub: deze Node-versie heeft geen ingebouwde fetch (nodig: Node 18+), laag blijft leeg.');
    return { posities, stop: () => {} };
  }

  const { latmin, latmax, lonmin, lonmax } = bounding(env.homeLat, env.homeLon);
  const url =
    `https://data.aishub.net/ws.php?username=${encodeURIComponent(env.aishubUsername)}` +
    `&format=1&output=json&compress=0&interval=30` +
    `&latmin=${latmin.toFixed(4)}&latmax=${latmax.toFixed(4)}&lonmin=${lonmin.toFixed(4)}&lonmax=${lonmax.toFixed(4)}`;

  let gestopt = false;
  let backoffMs = 0;
  let voorbeeldenGelogd = 0;
  let pollTimer = null;

  function log(bericht) {
    console.log(`[weer] vaarradarAishub: ${bericht}`);
  }

  function opschonen() {
    const nu = Date.now();
    for (const [mmsi, p] of posities) {
      if (nu - p.tijdMs > VENSTER_MS) posities.delete(mmsi);
    }
  }

  async function pollEenmaal() {
    try {
      const res = await fetch(url, { headers: { Connection: 'close' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (!Array.isArray(body) || body.length < 2) throw new Error('onherkenbaar antwoord (verwacht [status, schepen])');
      const [status, vaartuigen] = body;
      if (status?.ERROR) throw new Error(`AISHub meldt ERROR (${JSON.stringify(status).slice(0, 200)})`);
      if (!Array.isArray(vaartuigen)) throw new Error('tweede element is geen schepenlijst');

      if (voorbeeldenGelogd < 3 && vaartuigen.length) {
        voorbeeldenGelogd++;
        log(`voorbeeldrecord ${voorbeeldenGelogd}: ${JSON.stringify(vaartuigen[0]).slice(0, 400)}`);
      }

      for (const v of vaartuigen) {
        const p = vertaalVaartuig(v);
        if (p) posities.set(p.mmsi, p);
      }
      opschonen();
      if (backoffMs) log('AISHub weer bereikbaar.');
      backoffMs = 0;
    } catch (err) {
      backoffMs = backoffMs ? Math.min(backoffMs * 2, BACKOFF_MAX_MS) : BACKOFF_START_MS;
      log(`poll mislukt (${err.message ?? err}), volgende poging over ${Math.round((POLL_MS + backoffMs) / 1000)}s`);
    }
  }

  function planVolgende() {
    if (gestopt) return;
    pollTimer = setTimeout(async () => {
      await pollEenmaal();
      planVolgende();
    }, POLL_MS + backoffMs);
  }

  pollEenmaal().then(planVolgende);
  const opschoonTimer = setInterval(opschonen, 60 * 1000);

  return {
    posities,
    stop: () => {
      gestopt = true;
      clearInterval(opschoonTimer);
      clearTimeout(pollTimer);
    },
  };
}
