// Blitzortung.org — bliksem/onweer, via de live-kaart-WebSocket. GEEN
// officiële REST-API, geen documentatie, geen SLA — reverse-engineered
// community-kennis (o.a. terug te vinden in verschillende doe-het-zelf
// write-ups en de Home Assistant "blitzortung"-custom-component van mrk-its).
//
// EERLIJKE WAARSCHUWING: de exacte byte-voor-byte decodering hieronder is
// nooit live getest door degene die dit geschreven heeft — de omgeving waarin
// dit gebouwd is heeft geen uitgaande WebSocket-toegang. Bij het opstarten
// loggen we de eerste paar ruwe/gedecodeerde berichten naar de console
// (zoek naar "[weer] blitzortung: voorbeeldrecord") — check die eventjes op
// je eigen PC. Zien ze eruit als {lat, lon, time, ...}? Dan werkt het. Zie je
// alleen troep of helemaal niets? Dan is het protocol veranderd en moet
// decompress()/SUBSCRIBE_BERICHT bijgesteld worden — de rest van dit bestand
// (clustering, naderend/actief-bepaling) is onafhankelijk daarvan en blijft
// gewoon werken zodra de decodering weer klopt.
//
// Architectuur wijkt bewust af van de andere bronnen: dit is een permanente
// streaming-verbinding i.p.v. periodiek pollen (vandaar pollIntervalMs: null
// in config.js) — server.js start 'm één keer bij opstarten via
// startBlitzortungStream(), niet via de gewone poll-lus.
import { makeSignal, afstandKm } from '../normalize.js';
// 2026-08-22: community-media hier uitgezet, zie de toelichting verderop bij
// communityMediaVoor() — import staat in commentaar i.p.v. verwijderd, zelfde
// terugzet-gemak als de rest van die code.
// import { fetchCommunityMedia } from './media.js';

const WS_HOSTS = ['ws1.blitzortung.org', 'ws7.blitzortung.org', 'ws8.blitzortung.org'];
const SUBSCRIBE_BERICHT = '{"a":111}'; // magic subscribe-bericht na het openen van de verbinding

// Bewust ruim gezet: bij 300km bleef de kaart vaak helemaal leeg (geen
// onweer zo dicht bij huis), terwijl onweer ergens over Frankrijk/Duitsland/
// Centraal-Europa ook prima het bekijken waard is. Eerst op 900km gezet,
// maar bleek in de praktijk (2026-08-17, via HA-vergelijking) nog te krap:
// gewoon onweer boven Slovenië/Italië (~970-1270km) viel er al buiten,
// waardoor de kaart vaker leeg was dan zinvol. Op verzoek van Lex ("zet die
// straal lekker ruim 2000 km of zo wat geeft het") verruimd naar 2000km —
// dekt daarmee ook Zuid-Europa/Noord-Afrika/Turkije/West-Rusland.
const STRAAL_KM = 2000; // flitsen verder weg dan dit negeren we meteen (geheugen + relevantie)
const VENSTER_MS = 30 * 60 * 1000; // hoeveel geschiedenis we bewaren voor clustering
const HERBEREKEN_MS = 60 * 1000; // hoe vaak we complexen herberekenen en publiceren
const CLUSTER_AFSTAND_KM = 40; // flitsen binnen deze afstand van elkaar horen bij hetzelfde complex
const MIN_FLITSEN_VOOR_COMPLEX = 3; // ruis (losse verdwaalde flitsen) wegfilteren
const ACTIEF_AFSTAND_KM = 25; // binnen deze afstand van thuis geldt een complex als "actief"
const NADEREND_DREMPEL_KM = 3; // moet minstens dit dichterbij zijn gekomen om als "naderend" te tellen

// ---- Testfixture: nepflitsen om de clustering/plaatsnaam-pijplijn te kunnen
// testen zonder te wachten op een echt, dicht-geclusterd complex (2026-08-19:
// nodig gebleken toen er op een gegeven moment geen enkel echt complex actief
// was om de nieuwe plaatsnaam-feature tegenaan te testen). Alleen actief met
// WEER_TEST_ONWEERCOMPLEX=1 in backend/.env — zet 'm daarna weer terug naar 0
// (of verwijder de regel) en herstart, anders blijft er permanent een
// nep-complex tussen de echte data staan. Vijf punten rond Utrecht, ruim
// binnen CLUSTER_AFSTAND_KM (40km) van elkaar, dus ze clusteren gegarandeerd
// tot één test-"complex" (MIN_FLITSEN_VOOR_COMPLEX = 3).
const TEST_FLITSEN = [
  { lat: 52.0907, lon: 5.1214 },
  { lat: 52.095, lon: 5.13 },
  { lat: 52.085, lon: 5.11 },
  { lat: 52.1, lon: 5.14 },
  { lat: 52.08, lon: 5.1 },
];

// ---- Decompressie van de geobfusceerde websocket-payload ------------------
// Homebrew LZW-achig schema: elk binnenkomend teken is óf een letterlijk
// teken (code < 256) óf een terugverwijzing naar een eerder opgebouwd
// "woord" uit een groeiend woordenboek. Zie het protocol-voorbehoud hierboven.
function decompress(data) {
  const woordenboek = {};
  let vorig = data[0];
  let resultaat = vorig;
  let volgendeCode = 256;
  for (let i = 1; i < data.length; i++) {
    const teken = data[i];
    const code = teken.charCodeAt(0);
    const woord = code < 256 ? teken : (woordenboek[code] ?? vorig + vorig[0]);
    resultaat += woord;
    woordenboek[volgendeCode] = vorig + woord[0];
    volgendeCode++;
    vorig = woord;
  }
  return resultaat;
}

function decodeBericht(ruw) {
  return JSON.parse(decompress(ruw));
}

// ---- Eén WebSocket-verbinding opzetten -------------------------------------
function verbind(host, { onOpen, onRecord, onClose, onDecodeerfout }) {
  const ws = new WebSocket(`wss://${host}/`);
  ws.addEventListener('open', () => {
    onOpen();
    ws.send(SUBSCRIBE_BERICHT);
  });
  ws.addEventListener('message', (ev) => {
    try {
      onRecord(decodeBericht(String(ev.data)));
    } catch (err) {
      onDecodeerfout(err);
    }
  });
  ws.addEventListener('close', onClose);
  ws.addEventListener('error', () => {}); // 'close' volgt hier altijd op, daar herstellen we
  return ws;
}

// ---- Clustering: losse flitsen groeperen tot "complexen" ------------------
// Bewust simpel/greedy (geen echte spatiale clustering zoals DBSCAN) — een
// nieuwe flits sluit aan bij het dichtstbijzijnde bestaande cluster (op basis
// van de laatst toegevoegde flits daarin) als die binnen CLUSTER_AFSTAND_KM
// ligt, anders begint een nieuw cluster. Elke hereken-cyclus (elke minuut)
// wordt dit vers opnieuw berekend over het hele venster, dus fouten stapelen
// niet op — voor typische onweerscellen (tientallen km groot) werkt dit
// prima als eerste versie; kan later verfijnd worden als het te grof blijkt.
function clusterFlitsen(flitsen) {
  const clusters = [];
  for (const f of flitsen) {
    const doel = clusters.find((c) => afstandKm(c.laatsteLat, c.laatsteLon, f.lat, f.lon) <= CLUSTER_AFSTAND_KM);
    if (doel) {
      doel.flitsen.push(f);
      doel.laatsteLat = f.lat;
      doel.laatsteLon = f.lon;
    } else {
      clusters.push({ laatsteLat: f.lat, laatsteLon: f.lon, flitsen: [f] });
    }
  }
  return clusters.filter((c) => c.flitsen.length >= MIN_FLITSEN_VOOR_COMPLEX);
}

function centroid(flitsen) {
  return {
    lat: flitsen.reduce((s, f) => s + f.lat, 0) / flitsen.length,
    lon: flitsen.reduce((s, f) => s + f.lon, 0) / flitsen.length,
  };
}

// ---- Plaatsnaam via reverse-geocoding (Nominatim/OpenStreetMap) -----------
// 2026-08-19: Lex vroeg om een locatie bij onweercomplexen i.p.v. alleen
// "nog 45 km". Nominatim is gratis en sleutelloos, past bij de rest van dit
// project (geen accounts/API-keys ergens anders ook). Nominatim's eigen
// gebruiksbeleid (operations.osmfoundation.org/policies/nominatim) eist
// max. 1 request/seconde én een herkenbare User-Agent — vandaar de kleine
// wachtrij en dezelfde User-Agent-string als de andere bronnen.
//
// bouwSignalen() hieronder blijft bewust synchroon: plaatsnaamVoor() geeft
// meteen de gecachete naam terug (of null zolang die nog onbekend is) en
// ververst op de achtergrond, zodat de minuutlijkse publiceer-cyclus nooit
// hoeft te wachten op een externe HTTP-call. Bij een gloednieuw complex
// duurt het dus tot de eerstvolgende cyclus (~1 min) voor de naam verschijnt
// — geen probleem voor iets dat toch al een half uur aan flitsen nodig heeft
// om als complex te tellen.
//
// Cache-grid is bewust hetzelfde ~0,5°-grid (ruim 50km) als de complex-id
// verderop, en blijft 6 uur geldig — een complex verschuift weinig genoeg
// binnen zijn eigen 40km-clusterstraal dat een preciezere/versere naam geen
// meerwaarde heeft, en zo blijven de daadwerkelijke Nominatim-requests
// verwaarloosbaar (hooguit een paar per uur i.p.v. elke minuut per complex).
const PLAATS_CACHE_MS = 6 * 60 * 60 * 1000;
const PLAATS_MISLUKT_CACHE_MS = 10 * 60 * 1000; // bij een mislukte lookup wel sneller opnieuw proberen
const plaatsCache = new Map(); // gridKey -> { naam: string|null, tijdMs, bezig }
let laatsteNominatimVerzoekMs = 0;

function plaatsGridKey(lat, lon) {
  const gLat = Math.round(lat / 0.5) * 0.5;
  const gLon = Math.round(lon / 0.5) * 0.5;
  return `${gLat}-${gLon}`;
}

async function haalPlaatsnaamOp(lat, lon) {
  const wachtMs = Math.max(0, laatsteNominatimVerzoekMs + 1100 - Date.now());
  if (wachtMs > 0) await new Promise((r) => setTimeout(r, wachtMs));
  laatsteNominatimVerzoekMs = Date.now();

  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=9&accept-language=nl`;
  const res = await fetch(url, { headers: { 'User-Agent': 'weer-app-persoonlijk (contact: lokaal project)' } });
  if (!res.ok) throw new Error(`Nominatim gaf status ${res.status}`);
  const body = await res.json();
  const a = body.address ?? {};
  return a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? a.state ?? null;
}

function plaatsnaamVoor(lat, lon) {
  const key = plaatsGridKey(lat, lon);
  const cached = plaatsCache.get(key);
  const nu = Date.now();
  const versHoudbaar = cached && !cached.bezig && nu - cached.tijdMs <= (cached.naam ? PLAATS_CACHE_MS : PLAATS_MISLUKT_CACHE_MS);
  if (versHoudbaar) return cached.naam;
  if (cached?.bezig) return cached.naam ?? null; // lookup loopt al — gebruik intussen de oude waarde (kan null zijn)

  plaatsCache.set(key, { naam: cached?.naam ?? null, tijdMs: cached?.tijdMs ?? 0, bezig: true });
  console.log(`[weer] blitzortung: plaatsnaam opzoeken voor grid ${key}...`);
  haalPlaatsnaamOp(lat, lon)
    .then((naam) => {
      console.log(`[weer] blitzortung: plaatsnaam voor grid ${key}: ${naam ?? '(geen adres gevonden op die locatie)'}`);
      plaatsCache.set(key, { naam, tijdMs: Date.now(), bezig: false });
    })
    .catch((err) => {
      console.error('[weer] blitzortung: plaatsnaam ophalen mislukt,', err.message);
      plaatsCache.set(key, { naam: null, tijdMs: Date.now(), bezig: false });
    });
  return cached?.naam ?? null;
}

// ---- Community-beeldmateriaal — UITGEZET, 2026-08-22 -----------------------
// Stond hier eerst (2026-08-19, op verzoek van Lex: "het is niet ondenkbaar
// dat mensen foto's nemen bij dat soort momenten"), maar Lex signaleerde
// later zelf terecht het gat: "de bui is al weg voordat er iets wordt gepost
// en we hebben geen historie van onweer". Bij nader onderzoek (na dezelfde
// vraag over álle community-media-bronnen, zie ook usgs.js/iemLsr.js/
// gdacs.js/emsc.js dezelfde dag): dit was hier bovendien nog de OUDE,
// eenmalige zoekopdracht (vóór de mediaHistorie.js-aanpak, zie nws.js) — en
// zelfs die aanpak zou hier weinig baat hebben, want een onweercomplex heeft
// geen historie zoals historie.js die voor nws.js bijhoudt: zodra de laatste
// 30 minuten geen flitsen meer laten zien verdwijnt het complex volledig uit
// bouwSignalen() hieronder, dus zelfs een herhaalde zoekopdracht zou nergens
// meer aan kunnen hangen. Bijkomend: anders dan bij een tornado-warning of
// M5.5+-beving heeft een gewoon onweercomplex ook geen enkele ernst-drempel
// hier — letterlijk elk gedetecteerd complex triggerde een zoekopdracht,
// terwijl gewoon onweer zelden aparte nieuwsdekking krijgt. Code bewust
// bewaard-in-commentaar i.p.v. verwijderd (zelfde patroon als de
// uitgeschakelde bronnen in media.js) — simpel terug te zetten als er ooit
// een op onweer toegesneden aanpak bedacht wordt (bv. alleen bij zeer grote/
// langdurige complexen, of gekoppeld aan een eigen historie-venster).
//
// const MEDIA_CACHE_MS = 20 * 60 * 1000;
// const mediaCache = new Map(); // complexId -> { media, tijdMs, bezig }
//
// function communityMediaVoor(complexId, plaats) {
//   if (!plaats) return [];
//   const cached = mediaCache.get(complexId);
//   const nu = Date.now();
//   if (cached && !cached.bezig && nu - cached.tijdMs <= MEDIA_CACHE_MS) return cached.media;
//   if (cached?.bezig) return cached.media ?? [];
//
//   mediaCache.set(complexId, { media: cached?.media ?? [], tijdMs: cached?.tijdMs ?? 0, bezig: true });
//   fetchCommunityMedia(`Thunderstorm ${plaats}`)
//     .then((media) => mediaCache.set(complexId, { media, tijdMs: Date.now(), bezig: false }))
//     .catch((err) => {
//       console.error('[weer] blitzortung: community-media ophalen mislukt,', err.message);
//       mediaCache.set(complexId, { media: [], tijdMs: Date.now(), bezig: false });
//     });
//   return cached?.media ?? [];
// }
function communityMediaVoor() {
  return [];
}

// ---- Per cluster: is het naderend, actief, of trekt het weg? --------------
function bouwSignalen(clusters, homeLat, homeLon, nu) {
  return clusters.map((c) => {
    const recent = c.flitsen.filter((f) => nu - f.tijdMs <= 5 * 60 * 1000);
    const ouder = c.flitsen.filter((f) => nu - f.tijdMs > 10 * 60 * 1000 && nu - f.tijdMs <= 25 * 60 * 1000);
    const puntNu = centroid(recent.length ? recent : c.flitsen);
    const afstandNu = afstandKm(homeLat, homeLon, puntNu.lat, puntNu.lon);
    const plaats = plaatsnaamVoor(puntNu.lat, puntNu.lon);

    let status = 'stabiel';
    if (afstandNu <= ACTIEF_AFSTAND_KM) {
      status = 'actief';
    } else if (ouder.length >= MIN_FLITSEN_VOOR_COMPLEX) {
      const afstandOuder = afstandKm(homeLat, homeLon, centroid(ouder).lat, centroid(ouder).lon);
      if (afstandOuder - afstandNu >= NADEREND_DREMPEL_KM) status = 'naderend';
      else if (afstandNu - afstandOuder >= NADEREND_DREMPEL_KM) status = 'verwijderend';
    } else {
      status = 'onbekend'; // te weinig historie om een richting te bepalen
    }

    const ernst =
      status === 'actief' ? 'kritiek' : status === 'naderend' && afstandNu < 100 ? 'waarschuwing' : status === 'naderend' ? 'let-op' : 'info';

    const plaatsSuffix = plaats ? ` (${plaats})` : '';
    const titel =
      status === 'actief'
        ? `Onweercomplex boven ${plaats ?? 'je'} (${c.flitsen.length} flitsen/30 min)`
        : status === 'naderend'
          ? `Onweercomplex nadert${plaatsSuffix} - nog ${afstandNu} km`
          : status === 'verwijderend'
            ? `Onweercomplex trekt weg${plaatsSuffix} - ${afstandNu} km`
            : plaats
              ? `Onweercomplex bij ${plaats} - ${afstandNu} km`
              : `Onweercomplex op ${afstandNu} km`;

    // Grofmazige maar stabiele id (afgerond op ~0,5°) zodat hetzelfde complex
    // niet elke minuut een compleet nieuwe id krijgt zolang het ~ter plekke blijft.
    const idLat = Math.round(puntNu.lat / 0.5) * 0.5;
    const idLon = Math.round(puntNu.lon / 0.5) * 0.5;
    const complexId = `blitzortung-complex-${idLat}-${idLon}`;

    return makeSignal({
      id: complexId,
      categorie: 'onweercomplex',
      titel,
      ernst,
      lat: puntNu.lat,
      lon: puntNu.lon,
      tijd: new Date(nu).toISOString(),
      detail: {
        status,
        afstandKm: afstandNu,
        plaats,
        aantalFlitsenLaatsteHalfUur: c.flitsen.length,
        communityMedia: communityMediaVoor(complexId, plaats),
        subtitel: [
          `${c.flitsen.length} flitsen laatste 30 min`,
          `${afstandNu} km van huis`,
          plaats ? `bij ${plaats}` : null,
        ]
          .filter(Boolean)
          .join(' · '),
        bronUrl: 'https://www.blitzortung.org/',
        // Individuele flitsen (afgerond, alleen lat/lon/leeftijd) zodat de
        // frontend ze kan tonen zodra iemand dit complex aantikt — puur
        // fijnmazige visualisatie, niet nodig voor de complex-marker zelf.
        flitsen: c.flitsen.map((f) => ({
          lat: Math.round(f.lat * 1000) / 1000,
          lon: Math.round(f.lon * 1000) / 1000,
          secondenGeleden: Math.round((nu - f.tijdMs) / 1000),
        })),
      },
    });
  });
}

export function startBlitzortungStream({ homeLat, homeLon, onUpdate, onError }) {
  if (typeof WebSocket === 'undefined') {
    onError(new Error('Deze Node-versie heeft geen ingebouwde WebSocket (nodig: Node 22+).'));
    return () => {};
  }

  let flitsen = []; // { lat, lon, tijdMs }
  if (process.env.WEER_TEST_ONWEERCOMPLEX === '1') {
    console.log(
      '[weer] blitzortung: WEER_TEST_ONWEERCOMPLEX=1 — nepflitsen bij Utrecht toegevoegd (niet echt!) om clustering/plaatsnaam te testen'
    );
    const nuStart = Date.now();
    flitsen = TEST_FLITSEN.map((f) => ({ ...f, tijdMs: nuStart }));
  }
  let hostIndex = 0;
  let backoffMs = 5000;
  let gestopt = false;
  let verbonden = false;
  let ws = null;
  let herverbindTimer = null;
  let voorbeeldenGelogd = 0;
  // Tellers puur voor zichtbaarheid in de console — zonder dit is er geen
  // manier om van buitenaf te zien of de WebSocket nog echt data ontvangt
  // (verwerkRecord zwijgt normaal na de eerste 3 voorbeeldregels), wat het
  // lastig maakt te onderscheiden tussen "verbinding is stil" en "er is
  // gewoon even geen onweer binnen bereik".
  let ontvangenSindsVorige = 0;
  let binnenBereikSindsVorige = 0;
  const herbereekTimer = setInterval(opschonenEnPublicerenLoop, HERBEREKEN_MS);

  function log(bericht) {
    console.log(`[weer] blitzortung: ${bericht}`);
  }

  function verwerkRecord(record) {
    if (voorbeeldenGelogd < 3) {
      voorbeeldenGelogd++;
      log(`voorbeeldrecord ${voorbeeldenGelogd}: ${JSON.stringify(record).slice(0, 200)}`);
    }
    ontvangenSindsVorige++;
    if (typeof record?.lat !== 'number' || typeof record?.lon !== 'number') return;
    const afstand = afstandKm(homeLat, homeLon, record.lat, record.lon);
    if (afstand > STRAAL_KM) return;
    binnenBereikSindsVorige++;
    // 'time' komt bij Blitzortung binnen als nanoseconden-sinds-epoch.
    const tijdMs = record.time ? Math.round(record.time / 1e6) : Date.now();
    flitsen.push({ lat: record.lat, lon: record.lon, tijdMs });
  }

  function opschonenEnPublicerenLoop() {
    const nu = Date.now();
    flitsen = flitsen.filter((f) => nu - f.tijdMs <= VENSTER_MS);
    // Elke minuut een statusregel — laat objectief zien of de stream nog
    // binnenkomt (ontvangen>0) en hoeveel daarvan binnen de 900km-straal valt,
    // los van of dat toevallig genoeg is voor een complex (min. 3 flitsen/40km).
    log(
      `status: ${ontvangenSindsVorige} bericht(en) ontvangen laatste minuut, ` +
        `${binnenBereikSindsVorige} daarvan binnen ${STRAAL_KM}km, ` +
        `${flitsen.length} flitsen totaal in het 30-min-venster`
    );
    ontvangenSindsVorige = 0;
    binnenBereikSindsVorige = 0;
    if (!verbonden) {
      onError(new Error('geen actieve Blitzortung-verbinding'));
      return;
    }
    const clusters = clusterFlitsen(flitsen);
    if (clusters.length) {
      log(`${clusters.length} complex(en) gevonden: ${clusters.map((c) => c.flitsen.length).join(', ')} flitsen elk`);
    }
    const signalen = bouwSignalen(clusters, homeLat, homeLon, nu);
    onUpdate(signalen);
  }

  function planHerverbinding() {
    verbonden = false;
    if (gestopt) return;
    herverbindTimer = setTimeout(() => {
      hostIndex = (hostIndex + 1) % WS_HOSTS.length;
      verbindOpnieuw();
    }, backoffMs);
    backoffMs = Math.min(backoffMs * 2, 2 * 60 * 1000);
  }

  function verbindOpnieuw() {
    if (gestopt) return;
    const host = WS_HOSTS[hostIndex];
    try {
      ws = verbind(host, {
        onOpen: () => {
          verbonden = true;
          backoffMs = 5000;
          log(`verbonden met ${host}`);
        },
        onRecord: verwerkRecord,
        onDecodeerfout: (err) => log(`kon bericht niet decoderen (${host}): ${err.message}`),
        onClose: () => {
          log(`verbinding met ${host} gesloten, nieuwe poging over ${Math.round(backoffMs / 1000)}s`);
          planHerverbinding();
        },
      });
    } catch (err) {
      log(`kon niet verbinden met ${host}: ${err.message}`);
      planHerverbinding();
    }
  }

  verbindOpnieuw();

  return function stop() {
    gestopt = true;
    clearInterval(herbereekTimer);
    clearTimeout(herverbindTimer);
    if (ws) ws.close();
  };
}
