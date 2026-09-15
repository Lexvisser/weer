// 14 sept 2026: 1-op-1 overgenomen uit Baken (C:\Projects\Baken\backend\src\sources\vaarradarGfw.js),
// als onderdeel van het samenvoegen van Baken in de weer-app (zie baken-status.md
// in het Cowork-project). Alleen deze kopregel is toegevoegd.
// vaarradarGfw.js — AANVULLENDE, VERTRAAGDE scheepsposities via Global Fishing
// Watch (GFW) se publieke v4wings-API, op verzoek van Lex 13 sept 2026 ("die
// lege oceanen zijn wel een sore"). Anders dan vaarradarAishub.js is dit GEEN
// (bijna-)live bron: GFW's eigen "presence"-dataset loopt ~3-4 dagen achter
// en heeft dagresolutie (soms per gridcel per dag), niet een continue track.
// Doel is dus niet "recentere/betere data dan AISHub", maar puur de stukken
// open oceaan vullen die AISHub/de eigen antenne sowieso nooit zien.
//
// Voorlopig BEWUST beperkt tot de Atlantische Oceaan (op verzoek van Lex,
// 13 sept 2026, "beperken we het voorlopig tot de atlantische oceaan?") --
// zie GFW_REGIO_ID/GFW_REGIO_DATASET hieronder. Uitbreiden naar andere
// oceanen is later een kwestie van dezelfde aanroep herhalen met een andere
// region-id (bijv. WCPFC/IATTC voor de Stille Oceaan, IOTC voor de Indische
// Oceaan) -- zie de sessienotitie in het project voor de precieze methode.
//
// HARDE LES uit het uitzoekwerk (13 sept 2026, zie project-status-notitie
// voor de volledige toedracht): een ZELFGETEKEND gebied ("geojson" in de
// POST-body) wordt door GFW's API geaccepteerd zonder foutmelding, maar
// levert ALTIJD null op -- ook getest tegen een gebied dat een bewezen-drukke
// kuststrook overlapte. Werkt NIET als ruimtelijk filter, ondanks dat de API
// geen fout teruggeeft. De enige aanpak die WEL werkt: een bestaand, door GFW
// zelf benoemd gebied opvragen met een GET-request en region-id/region-
// dataset als query-parameters (ontdekt via de netwerk-tab op GFW's eigen
// kaart-UI, NIET via hun documentatie, die dit nergens correct beschrijft).
//
// API: GET https://gateway.api.globalfishingwatch.org/v3/4wings/report, met
// Authorization: Bearer <GFW_API_TOKEN>. Responsvorm (empirisch bevestigd,
// niet slechts uit documentatie): { entries: [ { "<dataset>:<versie>": [
//   { mmsi, lat, lon, shipName, vesselType, date, entryTimestamp,
//     exitTimestamp, flag, imo, callsign, lastTransmissionDate, ... }, ... ]
// } ] }. "date" is de dag binnen de opgevraagde periode; eenzelfde mmsi kan
// meerdere keren voorkomen (één entry per dag, soms zelfs meerdere per dag
// bij een schip dat van gridcel wisselt) -- per mmsi wordt hieronder alleen
// de entry met de laatste "date" bewaard.

import { VersieMap } from '../versieMap.js';
const GFW_REGIO_ID = 'ICCAT'; // Atlantische Oceaan (en aangrenzende zeeën) -- zie toelichting hierboven
const GFW_REGIO_DATASET = 'public-rfmo';
const GFW_DATASET = 'public-global-presence:latest';

const POLL_UUR_STANDAARD = 6; // GFW's eigen data ververst hooguit 1x/dag, dus vaker pollen heeft geen zin
const BACKOFF_START_MS = 5 * 60 * 1000;
const BACKOFF_MAX_MS = 60 * 60 * 1000;
const TERUGKIJK_DAGEN = 4; // vangt de ~3-4 dagen verwerkingsvertraging van GFW zelf op

// GFW's eigen vesselType-codering (geen ITU-R M.1371-getal zoals AISHub/de
// lokale ontvangst, maar een losse tekstwaarde) -- vandaar een eigen, kleine
// vertaaltabel i.p.v. hergebruik van bepaalScheepscategorie() uit
// vaarradarLokaal.js. Onbekende/nieuwe waarden vallen terug op 'overig'.
const CATEGORIE_PER_GFW_TYPE = {
  FISHING: 'vissersboot',
  CARGO: 'vracht',
  CARRIER: 'vracht',
  TANKER: 'tanker',
  PASSENGER: 'passagiersschip',
};

function categorieVanGfwType(vesselType) {
  return CATEGORIE_PER_GFW_TYPE[vesselType] ?? 'overig';
}

function datumReeks(dagenTerug) {
  // GFW's date-range is INCLUSIEF de startdag en EXCLUSIEF de einddag (zelfde
  // conventie als hun eigen voorbeelden) -- dus "vandaag" als einddatum
  // meegeven vangt ook nog net gisteren mee.
  const nu = new Date();
  const eind = new Date(Date.UTC(nu.getUTCFullYear(), nu.getUTCMonth(), nu.getUTCDate()));
  const start = new Date(eind.getTime() - dagenTerug * 24 * 60 * 60 * 1000);
  const iso = (d) => d.toISOString().slice(0, 10);
  return `${iso(start)},${iso(eind)}`;
}

function vertaalVaartuig(v) {
  const mmsi = v?.mmsi;
  const lat = v?.lat;
  const lon = v?.lon;
  if (mmsi == null || typeof lat !== 'number' || typeof lon !== 'number') return null;

  // Positie is een dagbenadering, geen live meting -- tijdMs op het einde van
  // die dagperiode zetten (exitTimestamp) zodat de bestaande vervagingslogica
  // in de frontend (vaarVervaging() in app.js) er zinnig mee omgaat: een
  // GFW-punt van 4 dagen terug hoort er merkbaar "ouder" uit te zien.
  const geparsed = typeof v.exitTimestamp === 'string' ? Date.parse(v.exitTimestamp) : NaN;
  const tijdMs = Number.isFinite(geparsed) ? geparsed : Date.now();

  return {
    mmsi: String(mmsi),
    naam: String(v.shipName ?? '').trim() || null,
    lat,
    lon,
    koersGraden: null, // GFW's presence-dataset geeft geen koers/heading -- puur een dagpositie
    scheepscategorie: categorieVanGfwType(v.vesselType),
    callsign: String(v.callsign ?? '').trim() || null,
    imo: typeof v.imo === 'number' && v.imo > 0 ? v.imo : null,
    tijdMs,
    // 13 sept 2026: los bewaard (i.p.v. alleen tijdMs) zodat de frontend
    // straks expliciet "laatst gezien op {gfwDatum}" kan tonen i.p.v. te doen
    // alsof dit een AIS-tijdstip is zoals bij de andere twee bronnen.
    gfwDatum: typeof v.date === 'string' ? v.date : null,
  };
}

export function startVaarradarGfwFeed(env) {
  const posities = new VersieMap(); // mmsi -> { mmsi, naam, lat, lon, scheepscategorie, tijdMs, gfwDatum, ... } // 2026-09-15: VersieMap i.p.v. Map, zie versieMap.js (server.js bouwt de samengevoegde set alleen opnieuw als .versie wijzigt)

  if (!env.gfwApiToken) {
    console.log('[weer] vaarradarGfw: geen GFW_API_TOKEN ingesteld, laag blijft leeg (zie backend/.env.example).');
    return { posities, stop: () => {} };
  }
  if (typeof fetch === 'undefined') {
    console.log('[weer] vaarradarGfw: deze Node-versie heeft geen ingebouwde fetch (nodig: Node 18+), laag blijft leeg.');
    return { posities, stop: () => {} };
  }

  const pollUur = Number.isFinite(env.gfwPollUur) && env.gfwPollUur > 0 ? env.gfwPollUur : POLL_UUR_STANDAARD;
  const pollMs = pollUur * 60 * 60 * 1000;

  let gestopt = false;
  let backoffMs = 0;
  let pollTimer = null;
  let voorbeeldenGelogd = 0;

  function log(bericht) {
    console.log(`[weer] vaarradarGfw: ${bericht}`);
  }

  async function pollEenmaal() {
    // 13 sept 2026: HIGH i.p.v. LOW -- gemeten (zie project-status-notitie):
    // zelfde aantal schepen (~62.000 in ICCAT), maar rooster van ~0,01°
    // (~1km) i.p.v. het duidelijk zichtbare grovere rooster bij LOW, voor
    // maar ~30% meer data (189MB vs 145MB voor deze regio/periode) -- geen
    // verrassende exponentiële toename zoals eerst leek tijdens een nog
    // lopende download.
    const url =
      `https://gateway.api.globalfishingwatch.org/v3/4wings/report` +
      `?spatial-resolution=HIGH&temporal-resolution=DAILY&group-by=VESSEL_ID` +
      `&datasets[0]=${encodeURIComponent(GFW_DATASET)}` +
      `&date-range=${datumReeks(TERUGKIJK_DAGEN)}` +
      `&format=JSON&region-id=${GFW_REGIO_ID}&region-dataset=${GFW_REGIO_DATASET}`;
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${env.gfwApiToken}` } });
      const tekst = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${tekst.slice(0, 300)}`);
      let body;
      try {
        body = JSON.parse(tekst);
      } catch {
        throw new Error(`antwoord is geen geldige JSON: ${tekst.slice(0, 300)}`);
      }
      const eersteEntry = body?.entries?.[0];
      const vaartuigen = eersteEntry ? Object.values(eersteEntry)[0] : null;
      if (!Array.isArray(vaartuigen)) {
        throw new Error(`onherkenbaar antwoord (verwacht entries[0].<dataset> als lijst): ${tekst.slice(0, 300)}`);
      }

      if (voorbeeldenGelogd < 2 && vaartuigen.length) {
        voorbeeldenGelogd++;
        log(`voorbeeldrecord ${voorbeeldenGelogd}: ${JSON.stringify(vaartuigen[0]).slice(0, 400)}`);
      }

      // Per mmsi alleen de meest recente dag bewaren -- binnen TERUGKIJK_DAGEN
      // kan hetzelfde schip meerdere keren voorkomen (zie bestandskop hierboven).
      const nieuw = new Map();
      for (const v of vaartuigen) {
        const p = vertaalVaartuig(v);
        if (!p) continue;
        const bestaand = nieuw.get(p.mmsi);
        if (!bestaand || p.tijdMs > bestaand.tijdMs) nieuw.set(p.mmsi, p);
      }

      posities.clear();
      for (const [mmsi, p] of nieuw) posities.set(mmsi, p);

      log(`${vaartuigen.length} dag-records opgehaald, ${posities.size} schepen bewaard (regio ${GFW_REGIO_ID}, ${datumReeks(TERUGKIJK_DAGEN)}).`);
      if (backoffMs) log('GFW weer bereikbaar.');
      backoffMs = 0;
    } catch (err) {
      backoffMs = backoffMs ? Math.min(backoffMs * 2, BACKOFF_MAX_MS) : BACKOFF_START_MS;
      log(`poll mislukt (${err.message ?? err}), volgende poging over ${Math.round((pollMs + backoffMs) / 60000)}min`);
    }
  }

  function planVolgende() {
    if (gestopt) return;
    pollTimer = setTimeout(async () => {
      await pollEenmaal();
      planVolgende();
    }, pollMs + backoffMs);
  }

  log(`start, elke ${pollUur}u een dagbeeld ophalen voor regio ${GFW_REGIO_ID} (Atlantische Oceaan).`);
  pollEenmaal().then(planVolgende);

  return {
    posities,
    stop: () => {
      gestopt = true;
      clearTimeout(pollTimer);
    },
  };
}
