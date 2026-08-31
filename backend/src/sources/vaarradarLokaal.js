// vaarradarLokaal.js — live scheepsposities (AIS) uit Lex' EIGEN ontvangst:
// een RTL-SDR Blog V4 + AIS-catcher, draaiend als systemd-service op
// lexdev-nw. Vervangt (voor zover bereikbaar) de externe vaarradar.js
// hiernaast, die structureel geen data krijgt van aisstream.io (zie de
// EERLIJKE WAARSCHUWING in dat bestand — bekend, open, onopgelost probleem
// bij aisstream.io zelf). Zelfde soort niet-hazard kaartlaag-databron als
// vaarradar.js/vliegradar.js — geen SOURCES/SourceState/makeSignal.
//
// Architectuur (zie weer-navtex-en-eigen-radio-ontvangst.md): AIS-catcher
// draait lokaal op lexdev-nw met de ingebouwde webviewer/webserver aan
// (opstartoptie "-N <poort>"), die zelf JSON serveert op /ships.json — dus
// GEEN bestand-tussenpatroon nodig zoals bij NAVTEX (dat was wél nodig omdat
// de daar gebruikte decoder geen eigen HTTP-server heeft). Deze bron pollt
// dat lokale endpoint gewoon periodiek, net als vliegradar.js voor adsb.lol
// doet, alleen zonder de multi-bron-fallback/cache van dat bestand — dit is
// tenslotte één lokale, eigen ontvanger, geen gedeelde community-dienst om
// te ontzien.
//
// EERLIJKE WAARSCHUWING (zelfde patroon als bij vaarradar.js/vliegradar.js):
// deze ontwikkelomgeving heeft geen netwerktoegang tot lexdev-nw, dus dit
// bestand is nooit live tegen een echte AIS-catcher-instantie getest. Het
// veldformaat in vertaalRecord() hieronder komt uit AIS-catcher's officiële
// documentatie (docs.aiscatcher.org — /ships.json van de ingebouwde
// webviewer). Bij het eerste binnenkomende record loggen we 'm ruw naar de
// console ("[weer] vaarradarLokaal: voorbeeldrecord") zodat je op lexdev-nw
// zelf kunt checken of het klopt. Andere veldnamen dan verwacht? Dan moet
// vertaalRecord() hieronder bijgesteld worden — zelfde aanpak als destijds
// bij vliegradar.js/vaarradar.js.

const POLL_MS = 10 * 1000; // AIS-berichten komen vaak binnen; 10s geeft een vlotte kaart zonder de lokale AIS-catcher onnodig te bestoken
const VENSTER_MS = 10 * 60 * 1000; // zelfde uitfaseervenster als vaarradar.js — een laatst-bekende positie zonder nieuw bericht verdwijnt na 10 min
const BACKOFF_START_MS = 5000;
const BACKOFF_MAX_MS = 60000;

function vertaalRecord(ruw) {
  const lat = typeof ruw?.lat === 'number' ? ruw.lat : typeof ruw?.Latitude === 'number' ? ruw.Latitude : null;
  const lon = typeof ruw?.lon === 'number' ? ruw.lon : typeof ruw?.Longitude === 'number' ? ruw.Longitude : null;
  if (lat === null || lon === null) return null;

  const mmsi = ruw?.mmsi ?? ruw?.MMSI;
  if (mmsi == null) return null;

  // "heading" (true heading) is 511 als "niet beschikbaar" (AIS-conventie,
  // zelfde als bij vaarradar.js) — val dan terug op "course" (course over
  // ground), dat is er vrijwel altijd wel.
  const koersGraden =
    typeof ruw.heading === 'number' && ruw.heading < 511 ? ruw.heading : typeof ruw.course === 'number' ? ruw.course : null;

  return {
    mmsi,
    naam: String(ruw.shipname ?? ruw.name ?? '').trim() || null,
    lat,
    lon,
    koersGraden,
    snelheidKn: typeof ruw.speed === 'number' ? ruw.speed : null,
    tijdMs: Date.now(),
  };
}

export function startVaarradarLokaalFeed(env) {
  const posities = new Map(); // mmsi -> { mmsi, naam, lat, lon, koersGraden, snelheidKn, tijdMs }

  if (!env.vaarradarLokaalUrl) {
    console.log('[weer] vaarradarLokaal: geen VAARRADAR_LOKAAL_URL ingesteld, laag blijft leeg (zie backend/.env.example).');
    return { posities, stop: () => {} };
  }
  if (typeof fetch === 'undefined') {
    console.log('[weer] vaarradarLokaal: deze Node-versie heeft geen ingebouwde fetch (nodig: Node 18+), laag blijft leeg.');
    return { posities, stop: () => {} };
  }

  let gestopt = false;
  let backoffMs = 0;
  let voorbeeldenGelogd = 0;
  let pollTimer = null;

  function log(bericht) {
    console.log(`[weer] vaarradarLokaal: ${bericht}`);
  }

  function opschonen() {
    const nu = Date.now();
    for (const [mmsi, p] of posities) {
      if (nu - p.tijdMs > VENSTER_MS) posities.delete(mmsi);
    }
  }

  async function pollEenmaal() {
    try {
      const res = await fetch(env.vaarradarLokaalUrl, { headers: { Connection: 'close' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      // AIS-catcher's /ships.json is (volgens documentatie) een platte
      // array; sommige varianten/wrappers zetten 'm onder een "ships"-sleutel
      // — allebei geaccepteerd, net zoals vliegradar.js met ac/aircraft doet.
      const lijst = Array.isArray(body) ? body : Array.isArray(body?.ships) ? body.ships : null;
      if (lijst === null) throw new Error('onherkenbaar antwoord (geen array en geen "ships"-lijst)');

      if (voorbeeldenGelogd < 3 && lijst.length) {
        voorbeeldenGelogd++;
        log(`voorbeeldrecord ${voorbeeldenGelogd}: ${JSON.stringify(lijst[0]).slice(0, 400)}`);
      }

      for (const ruw of lijst) {
        const p = vertaalRecord(ruw);
        if (p) posities.set(p.mmsi, p);
      }
      opschonen();
      if (backoffMs) log('lokale AIS-catcher weer bereikbaar.');
      backoffMs = 0;
    } catch (err) {
      backoffMs = backoffMs ? Math.min(backoffMs * 2, BACKOFF_MAX_MS) : BACKOFF_START_MS;
      log(`poll van ${env.vaarradarLokaalUrl} mislukt (${err.message ?? err}), volgende poging over ${Math.round((POLL_MS + backoffMs) / 1000)}s`);
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
