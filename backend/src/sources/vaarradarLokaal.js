// vaarradarLokaal.js — live scheepsposities (AIS) uit Lex' EIGEN ontvangst:
// een RTL-SDR Blog V4 + AIS-catcher, draaiend en al bevestigd WERKEND als
// service op lexdev-nw (2026-08-31, live curl-test door Lex tegen
// http://127.0.0.1:8100/geojson). Vervangt (voor zover bereikbaar) de
// externe vaarradar.js hiernaast, die structureel geen data krijgt van
// aisstream.io (zie de EERLIJKE WAARSCHUWING in dat bestand — bekend, open,
// onopgelost probleem bij aisstream.io zelf). Zelfde soort niet-hazard
// kaartlaag-databron als vaarradar.js/vliegradar.js — geen
// SOURCES/SourceState/makeSignal.
//
// Bron: AIS-catcher's ingebouwde webviewer (opstartoptie "-N 8100" op
// lexdev-nw) serveert zelf een GeoJSON FeatureCollection op /geojson — dus
// GEEN bestand-tussenpatroon nodig zoals bij NAVTEX (dat was wél nodig omdat
// de daar gebruikte decoder geen eigen HTTP-server heeft). Simpele
// periodieke poll, geen multi-bron-fallback/cache zoals vliegradar.js nodig
// heeft — dit is een lokale, eigen ontvanger, geen gedeelde community-dienst
// om te ontzien.
//
// GeoJSON-vorm (bevestigd met een echte curl door Lex, 2026-08-31):
//   { "type": "FeatureCollection", "time_span": 1800, "features": [
//     { "type": "Feature",
//       "properties": { "mmsi": 244210570, "heading": null, "cog": 0,
//         "speed": 0, "shipname": "", "callsign": "", "country": "NL",
//         "last_signal": 1788199913, ... },
//       "geometry": { "type": "Point", "coordinates": [4.424457, 51.843967] } },
//     ... ] }
// LET OP de GeoJSON-coördinatenvolgorde: [lon, lat], NIET [lat, lon] — een
// klassieke valkuil, hieronder expliciet zo uitgelezen. "heading" is al door
// AIS-catcher zelf naar null vertaald als het niet beschikbaar is (geen
// rauwe AIS-511-sentinel meer, maar voor de zekerheid ook die waarde nog
// als "onbeschikbaar" behandeld). "last_signal" is een epoch-tijdstip in
// SECONDEN — gebruikt als tijdMs i.p.v. het pollmoment zelf, dat is
// nauwkeuriger (AIS-catcher's eigen "time_span" van 1800s bepaalt toch al
// welke schepen meekomen; onze eigen VENSTER_MS hieronder is een striktere,
// client-side aanvulling, zelfde opzet als vaarradar.js).
// "shipname"/"callsign" komen als lege string binnen i.p.v. afwezig zodra ze
// (nog) niet bekend zijn — hieronder naar null omgezet zoals de rest van de
// app dat gewend is (zie vaarradar.js).

const POLL_MS = 3 * 1000; // 2026-09-01, op verzoek van Lex ("dan zou de boot wat meer bewegen") verlaagd van 10s
// naar 3s, gelijk aan de frontend-poll (RADAR_POLL_MS in app.js) — voorheen stapelden beide
// vertragingen op (tot 10s backend + tot 3s frontend = tot 13s voor een verse positie op de
// kaart verscheen), nu is de backend niet meer de tragere schakel. AIS-catcher's /geojson is
// een lokaal in-memory endpoint (zelfde machine), dus 3s pollen kost niets noemenswaardigs.
const VENSTER_MS = 10 * 60 * 1000; // zelfde uitfaseervenster als vaarradar.js — een laatst-bekende positie zonder nieuw bericht verdwijnt na 10 min
const BACKOFF_START_MS = 5000;
const BACKOFF_MAX_MS = 60000;

// 2026-09-01, op verzoek van Lex ("kunnen we nog wat leuks doen om tussen de
// boten te differentieren met de kleuren?") -- optie 2 van de drie besproken
// kleurmodi in app.js: kleur per scheepstype. AIS-catcher's eigen JSON-docu-
// mentatie (jvde-github.github.io/AIS-catcher-docs) noemt een numeriek
// 'shiptype'-veld (0-99, standaard ITU-R M.1371-codes) uit AIS-berichttype
// 5/19/24 -- STATISCHE data, dus een ander bericht dan de positieberichten
// hierboven en minder vaak uitgezonden dan die. OF de webviewer-geojson-feed
// dat veld per schip daadwerkelijk meegeeft kon vanuit deze sessie niet los
// bevestigd worden (geen shell-toegang tot lexdev-nw hiervandaan) -- daarom
// hieronder defensief op twee mogelijke veldnamen gecheckt. Blijkt het veld
// structureel te ontbreken, dan is scheepstypeRuw altijd null en daarmee
// categorie altijd null -- de frontend valt dan simpelweg terug op een
// neutrale "onbekend"-kleur, geen crash. Check zelf even met een curl tegen
// 127.0.0.1:8100/geojson of er 'shiptype' in de properties van een schip
// zit, en welke waarde, om te zien of dit ooit meer dan "onbekend" toont.
export function categoriseerScheepstype(typeCode) {
  if (typeof typeCode !== 'number' || typeCode <= 0) return null; // 0/ontbrekend: geen data, niet hetzelfde als "overig"
  if (typeCode === 30) return 'vissersboot';
  if (typeCode === 31 || typeCode === 32 || typeCode === 52) return 'sleepboot';
  if (typeCode === 36 || typeCode === 37) return 'plezierjacht'; // zeilboot + motorjacht op één hoop, zelfde "leuke" kleur
  if (typeCode === 50 || typeCode === 51 || typeCode === 55) return 'hulpdienst'; // loods/SAR/wetshandhaving
  if (typeCode >= 40 && typeCode <= 49) return 'hogesnelheid';
  if (typeCode >= 60 && typeCode <= 69) return 'passagiersschip';
  if (typeCode >= 70 && typeCode <= 79) return 'vracht';
  if (typeCode >= 80 && typeCode <= 89) return 'tanker';
  return 'overig'; // bekend type, maar geen van de bovenstaande (bagger/duik/militair/WIG/90-99 etc.)
}

function vertaalFeature(feature) {
  const coords = feature?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const [lon, lat] = coords; // GeoJSON: [lon, lat], niet [lat, lon]
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;

  const p = feature.properties ?? {};
  const mmsi = p.mmsi;
  if (mmsi == null) return null;

  // "heading" is bij AIS-catcher al null als het niet beschikbaar is; de
  // klassieke AIS-511-sentinel wordt hier voor de zekerheid ook nog als
  // "onbeschikbaar" behandeld, mocht een andere/oudere AIS-catcher-versie
  // die ooit toch rauw doorgeven. Val dan terug op cog (course over ground).
  const koersGraden =
    typeof p.heading === 'number' && p.heading < 511 ? p.heading : typeof p.cog === 'number' ? p.cog : null;

  const tijdMs = typeof p.last_signal === 'number' ? p.last_signal * 1000 : Date.now();

  const scheepstypeRuw =
    typeof p.shiptype === 'number' ? p.shiptype : typeof p.ship_type === 'number' ? p.ship_type : null;

  return {
    mmsi,
    naam: String(p.shipname ?? '').trim() || null,
    lat,
    lon,
    koersGraden,
    snelheidKn: typeof p.speed === 'number' ? p.speed : null,
    scheepscategorie: categoriseerScheepstype(scheepstypeRuw),
    tijdMs,
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
      const features = Array.isArray(body?.features) ? body.features : null;
      if (features === null) throw new Error('onherkenbaar antwoord (geen GeoJSON FeatureCollection met "features")');

      if (voorbeeldenGelogd < 3 && features.length) {
        voorbeeldenGelogd++;
        log(`voorbeeldrecord ${voorbeeldenGelogd}: ${JSON.stringify(features[0]).slice(0, 400)}`);
      }

      for (const feature of features) {
        const p = vertaalFeature(feature);
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
