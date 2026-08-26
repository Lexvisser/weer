// Bewust zonder externe dependencies (express etc.) — dit hele project draait
// puur op Node zelf. Dat betekent: geen "npm install" nodig om te starten,
// gewoon "node src/index.js". Scheelt gedoe voor een klein persoonlijk project.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { SOURCES } from './config.js';
import { SourceState } from './normalize.js';

import { fetchUsgs } from './sources/usgs.js';
import { fetchMoon } from './sources/moon.js';
import { fetchPlaneten } from './sources/planeten.js';
import { fetchNhc } from './sources/nhc.js';
import { fetchEmsc } from './sources/emsc.js';
import { fetchNws } from './sources/nws.js';
import { fetchOpenMeteo } from './sources/openmeteo.js';
import { fetchKnmi } from './sources/knmi.js';
import { fetchMeteoalarm } from './sources/meteoalarm.js';
import { fetchGdacs } from './sources/gdacs.js';
import { startBlitzortungStream } from './sources/blitzortung.js';
import { fetchCelestrak } from './sources/celestrak.js';
import { fetchStarlinkTrein, controleerStarlinkAlarm } from './sources/starlinkTrain.js';
import { fetchStarlinkLive } from './sources/starlinkLive.js';
import { fetchSwpc } from './sources/swpc.js';
import { fetchDonki } from './sources/donki.js';
import { fetchMeteors } from './sources/meteors.js';
import { fetchSpcOutlook } from './sources/spcOutlook.js';
import { fetchIemLsr } from './sources/iemLsr.js';
import { fetchNexradStations } from './sources/nexradStations.js';
import { fetchP2000, msSindsLaatsteMMTMelding } from './sources/p2000.js';
import { fetchLifeliner, lifelinerRapportTekst } from './sources/lifeliner.js';
import { fetchGetij } from './sources/getij.js';
import { fetchNavtex } from './sources/navtex.js';
import { fetchUkho } from './sources/ukho.js';
import { fetchNavtexLokaal, STATIONS as NAVTEX_STATIONS } from './sources/navtexLokaal.js';
import { fetchZeeForecast } from './sources/knmiZeeForecast.js';
import { fetchZeeWaarschuwingen } from './sources/sealagomZeeWaarschuwingen.js';
import { fetchMetOfficeZeeForecast } from './sources/metOfficeZeeForecast.js';
import { fetchVliegradar } from './sources/vliegradar.js';
import { fetchIssLive } from './sources/issLive.js';
import { controleerIssAlarm } from './sources/celestrak.js';
import { startVaarradarFeed, vaarradarBinnenStraal } from './sources/vaarradar.js';
import { voegAbonnementToe, verwijderAbonnementViaEndpoint } from './sources/webpush.js';

// Elke bron-id (uit config.js) gekoppeld aan de functie die 'm ophaalt.
// Nieuwe bron toevoegen? Zet 'm hier neer, voeg een rij toe in config.js,
// en klaar — de rest (polling, caching, /api/signals, /api/status) werkt vanzelf.
// Uitzondering: 'blitzortung' staat hier bewust NIET in — dat is een
// permanente streaming-verbinding (zie startPolling hieronder), geen
// periodieke fetch-functie zoals de rest.
const FETCHERS = {
  usgs: (env) => fetchUsgs(env),
  moon: (env) => fetchMoon(env),
  planeten: (env) => fetchPlaneten(env),
  nhc: () => fetchNhc(),
  emsc: (env) => fetchEmsc(env),
  nws: () => fetchNws(),
  openmeteo: (env) => fetchOpenMeteo(env),
  knmi: (env) => fetchKnmi(env),
  meteoalarm: (env) => fetchMeteoalarm(env),
  gdacs: () => fetchGdacs(),
  celestrak: (env) => fetchCelestrak(env),
  starlinkTrein: (env) => fetchStarlinkTrein(env),
  swpc: (env) => fetchSwpc(env),
  donki: (env) => fetchDonki(env),
  meteors: () => fetchMeteors(),
  spcOutlook: () => fetchSpcOutlook(),
  iemLsr: () => fetchIemLsr(),
  p2000: (env) => fetchP2000(env),
  lifeliner: (env) => fetchLifeliner(env),
  getij: (env) => fetchGetij(env),
  navtex: (env) => fetchNavtex(env),
  ukho: (env) => fetchUkho(env),
  navtexLokaal: (env) => fetchNavtexLokaal(env),
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  // 2026-08-19: voor een optionele echte maanfoto (frontend/icons/maan-foto.jpg,
  // zie MAAN_FOTO_URL in app.js) — welk formaat Lex ook opslaat.
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*', // gemakkelijk binnen je eigen tailnet, geen publieke blootstelling
  });
  res.end(body);
}

// 2026-08-22, voor POST /api/push/abonneren (zie hieronder) — dit hele
// project draait bewust op de kale node:http-server, zonder express/
// bodyparser (zie de opmerking bovenaan dit bestand). Dit is de enige route
// die tot nu toe een verzoek-body nodig heeft, dus een kleine eigen
// helper i.p.v. er meteen een dependency bij te halen. Begrensd op 16KB —
// een PushSubscription-object is in de praktijk een paar honderd bytes, dus
// dat is al ruim voldoende marge tegen een misvormd/te groot verzoek.
function readJsonBody(req, maxBytes = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    let teGroot = false;
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > maxBytes) {
        teGroot = true;
        req.destroy();
      }
    });
    req.on('end', () => {
      if (teGroot) return reject(new Error('body te groot'));
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

// ---- Kaarttegel-proxy, 2026-08-19 ------------------------------------------
// Waarom: Lex zag op zijn eigen scherm herhaaldelijk een ingebakken
// "Zoom Level Not Supported"-plaatje (HTTP 200, dus geen netwerkfout) — eerst
// bij CARTO's dark_all, daarna bij Esri's World_Dark_Gray_Base, daarna ook bij
// Esri's World_Dark_Gray_Reference, en zelfs toen de backend zelf (server-side,
// dus los van Lex' browser/netwerk/service-worker) de tegel ophaalde bleef de
// storing exact hetzelfde. Dat sluit een client-side oorzaak vrijwel volledig
// uit — twee onafhankelijke "gratis" commerciële tegel-CDN's die allebei
// dezelfde soort blokkade tonen voor Europa/bepaalde zoomniveaus wijst eerder
// op ingeperkte gratis-tiers dan op toeval. Overgestapt op OpenStreetMap's
// eigen standaardtegels (tile.openstreetmap.org) — het meest gangbare
// universeel-gratis alternatief, met van oudsher sterke Europese dekking op
// alle zoomniveaus. Blijft via de backend lopen (i.p.v. rechtstreeks vanuit de
// browser) omdat OSM's gebruiksbeleid een herkenbare User-Agent verwacht i.p.v.
// een generieke browser-UA — die zetten we hier zelf.
//
// 2026-08-23-poging, TERUGGEDRAAID: op verzoek van Lex ("Ik zie de native
// taaltekens op de leaflet kaart. Kan dat allemaal NL of Engels") kort
// overgestapt op Wikimedia's "osm-intl"-tegels (zelfde OSM-data, maar de
// "internationale" variant met voorkeur voor een Latijnse/Engelse naam).
// Live bleek dat: "niet alle tiles zichtbaar en trage opbouw" — zowel op de
// hoofdkaart als het kleine ISS-wereldkaartje (beide lopen via deze ene
// proxy). Vermoedelijke oorzaak: maps.wikimedia.org is bedoeld voor gebruik
// vanaf Wikimedia's eigen sites en kan (net als de eerdere CARTO/Esri-
// tegelbronnen in dit project, zie de module-comment hierboven) alsnog
// gebruiksbeperkingen hebben voor extern hotlinken — niet live te bevestigen
// vanuit deze internetloze sandbox. Teruggezet naar OSM's eigen standaard-
// tegels (weer native-taal-labels, dat euvel staat dus nog open) i.p.v. op
// een niet-geverifieerde bron door te bouwen. Zie ook de `?v=`-cache-buster
// bij de tegellaag zelf in app.js (initMap/issWereldkaart) — die is bewust
// weer terug naar `osm1`, dezelfde als vóór deze poging.
const TEGEL_BASIS_URL = 'https://tile.openstreetmap.org';
const TEGEL_MAX_Z = 19; // OSM's eigen standaardgrens
const TEGEL_USER_AGENT = 'WeerApp/1.0 (persoonlijk zelfgehost hobbyproject, geen commercieel gebruik)';

// 2026-08-25, op melding van Lex ("scherm bleef vrij lang wit voordat de
// kaart getoond werd, iPad") — deze proxy had, in tegenstelling tot de
// regenradar-tegel-proxy hieronder, HELEMAAL GEEN server-eigen cache: elke
// tegel ging altijd live naar OSM, met alleen een browser-Cache-Control-
// header (max-age=86400). Prima zolang Lex' eigen browsercache warm blijft,
// maar iOS/Safari gooit die van een PWA na een tijdje inactiviteit vrij
// makkelijk leeg — dan moet 's ochtends INEENS elke zichtbare tegel weer de
// volle weg iPad -> backend -> OSM -> backend -> iPad, en zolang die tegels
// er niet zijn blijft de kaart wit. Zelfde soort geheugen-cache als
// REGENRADAR_CACHE hierboven, maar met een veel langere houdbaarheid (OSM-
// tegels voor een gegeven z/x/y wijzigen zelden — geen weerdata die elke
// paar minuten verandert) zodat een tweede toestel (of dezelfde iPad na een
// leeggegooide browsercache) 'm meteen uit het servergeheugen krijgt i.p.v.
// opnieuw bij OSM te moeten ophalen. 4000 tegels is ruim genoeg voor het
// gebied dat Lex regelmatig bekijkt (thuiszone + wat rondkijken) zonder het
// geheugen van de Minisforum ongelimiteerd te laten groeien.
const TEGEL_CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const TEGEL_CACHE_MAX = 4000;
const tegelCache = new Map(); // "z/x/y" -> { buffer, contentType, tijdMs }

async function serveTegel(req, res, z, x, y) {
  const zNum = Number(z);
  const xNum = Number(x);
  const yNum = Number(y);
  if (!Number.isInteger(zNum) || !Number.isInteger(xNum) || !Number.isInteger(yNum) || zNum < 0 || zNum > TEGEL_MAX_Z) {
    res.writeHead(400).end('Ongeldige tegel-coördinaten');
    return;
  }
  const sleutel = `${zNum}/${xNum}/${yNum}`;
  const nu = Date.now();
  const bestaand = tegelCache.get(sleutel);
  if (bestaand && nu - bestaand.tijdMs < TEGEL_CACHE_MS) {
    res.writeHead(200, {
      'Content-Type': bestaand.contentType,
      'Content-Length': bestaand.buffer.length,
      'Cache-Control': 'public, max-age=86400',
    });
    res.end(bestaand.buffer);
    return;
  }
  try {
    // OSM gebruikt de gebruikelijke XYZ-volgorde (z/x/y), geen herordening nodig.
    const upstream = await fetch(`${TEGEL_BASIS_URL}/${zNum}/${xNum}/${yNum}.png`, {
      headers: { 'User-Agent': TEGEL_USER_AGENT },
    });
    if (!upstream.ok) {
      res.writeHead(upstream.status).end();
      return;
    }
    const buffer = Buffer.from(await upstream.arrayBuffer());
    const contentType = upstream.headers.get('content-type') ?? 'image/png';

    if (tegelCache.size >= TEGEL_CACHE_MAX) {
      const oudsteSleutel = tegelCache.keys().next().value; // Map bewaart invoegvolgorde — oudste eerst
      tegelCache.delete(oudsteSleutel);
    }
    tegelCache.set(sleutel, { buffer, contentType, tijdMs: nu });

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': buffer.length,
      // 2026-08-19: was 'immutable, max-age=604800' (een week) — bleek een
      // valkuil tijdens het zoeken naar de juiste tegelbron: toen de upstream
      // hier wisselde van Esri naar OSM (zelfde /api/tegel/{z}/{x}/{y}.png-pad)
      // bleef Lex' browser de oude, kapotte respons uit de eigen schijfcache
      // hergebruiken zonder de server ooit opnieuw te vragen. Nu een dag i.p.v.
      // een week, en zonder 'immutable' — nog steeds ruim genoeg om herhaalde
      // round-trips te schelen, maar een volgende wijziging hangt niet meer
      // een week lang vast in Lex' eigen browsercache. (De nieuwe server-
      // eigen tegelCache hierboven mag wél veel langer bewaren — die is niet
      // gevoelig voor hetzelfde "oude kapotte respons blijft hangen"-risico,
      // want een herstart van de service (bv. na syncweer) leegt 'm toch al.)
      'Cache-Control': 'public, max-age=86400',
    });
    res.end(buffer);
  } catch (err) {
    console.error('[weer] kaarttegel-proxy mislukt:', err.message ?? err);
    res.writeHead(502).end();
  }
}

// ---- Regenradar-tegel-proxy (RainViewer), 2026-08-19 -----------------------
// Waarom: Lex zag de neerslagradar flink flikkeren — tussen goede tegels en
// een "niet beschikbaar"-plaatje. RainViewer's eigen respons-headers lieten
// X-Ratelimit-Limit/-Used/-Window zien: die bestaan écht bij RainViewer, dus
// vermoedelijk liep dit tijdens dit hele debug-sessie (veel herladen, elke
// framewissel vraagt opnieuw alle zichtbare tegels op) tegen een zacht
// snelheidslimiet aan. Twee maatregelen: (1) de afspeelsnelheid in app.js
// omlaag, en (2) hier een kleine servergeheugen-cache zodat dezelfde tegel
// (zelfde frame + z/x/y) binnen een uur niet nogmaals bij RainViewer wordt
// opgehaald, ook niet als meerdere lagen ('a'/'b') 'm bijna gelijktijdig
// aanvragen. Radartegels voor een reeds gepubliceerd frame veranderen nooit
// meer, dus stevig cachen kan geen kwaad.
const REGENRADAR_HOST = 'https://tilecache.rainviewer.com';
const REGENRADAR_CACHE_MS = 60 * 60 * 1000;
const REGENRADAR_CACHE_MAX = 500; // ruim genoeg voor een paar frames × zichtbare tegels, voorkomt ongelimiteerde groei
const regenradarCache = new Map(); // pad -> { buffer, contentType, tijdMs }

// 2026-08-19, vervolg: los van de rate-limit-flikkering bleek er ook een
// structureel geval — boven de Andes (Peru) liet Lex nog steeds hetzelfde
// "Zoom Level Not Supported"-plaatje zien, óók na de cache-fix. RainViewer is
// een mozaïek van GROND-radars (zie de uitleg bij frameUrl in app.js) — daar
// staat simpelweg geen radarstation, dus dit is vermoedelijk geen storing
// maar RainViewer's (ongelukkig geformuleerde) eigen "geen dekking hier"-
// plaatje. Niet op te lossen (er ís geen data), wel op te lossen hoe lelijk
// het oogt: zo'n plaatje is klein (Lex' voorbeeld was 1370 bytes — een echte
// radartegel, zelfs een lege/regenvrije, is doorgaans groter). Onder een
// drempel vervangen we 'm door een volledig transparant tegeltje, zodat je
// gewoon niets ziet i.p.v. een alarmerende tekstbox.
//
// BUG gevonden 2026-08-19: de eerste drempel (3000) bleek veel te ruim —
// Lex zag lichte regen vlak bij huis niet verschijnen, terwijl de radarlaag
// verderop (waar het harder regende, dus meer gekleurde pixels = grotere
// tegel) wél gewoon werkte. Een tegel met lichte/verspreide neerslag
// comprimeert goed (weinig gekleurde pixels) en viel dus zomaar onder de
// oude 3000-bytes-marge — en werd dan tén onrechte wég-transparant gemaakt,
// exact het "kleine kans op fout-positief"-risico dat de vorige comment
// hierboven noemde, maar dan dus wél een merkbaar verschil (precies de
// regen die je zocht, verdween). Drempel nu veel dichter tegen het echte,
// bevestigde placeholder-formaat (1370 bytes) aan, zodat alleen dát exacte
// soort plaatje er nog uitgefilterd wordt.
const REGENRADAR_PLACEHOLDER_MAX_BYTES = 1450;
const TRANSPARANTE_TEGEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

async function serveRegenradar(req, res, pad) {
  const nu = Date.now();
  const bestaand = regenradarCache.get(pad);
  if (bestaand && nu - bestaand.tijdMs < REGENRADAR_CACHE_MS) {
    res.writeHead(200, {
      'Content-Type': bestaand.contentType,
      'Content-Length': bestaand.buffer.length,
      'Cache-Control': 'public, max-age=3600',
    });
    res.end(bestaand.buffer);
    return;
  }
  try {
    const upstream = await fetch(`${REGENRADAR_HOST}/${pad}`, { headers: { 'User-Agent': TEGEL_USER_AGENT } });
    if (!upstream.ok) {
      res.writeHead(upstream.status).end();
      return;
    }
    let buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.length < REGENRADAR_PLACEHOLDER_MAX_BYTES) buffer = TRANSPARANTE_TEGEL;
    const contentType = upstream.headers.get('content-type') ?? 'image/png';

    if (regenradarCache.size >= REGENRADAR_CACHE_MAX) {
      const oudsteSleutel = regenradarCache.keys().next().value; // Map bewaart invoegvolgorde — oudste eerst
      regenradarCache.delete(oudsteSleutel);
    }
    regenradarCache.set(pad, { buffer, contentType, tijdMs: nu });

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': buffer.length,
      'Cache-Control': 'public, max-age=3600',
    });
    res.end(buffer);
  } catch (err) {
    console.error('[weer] regenradar-tegel-proxy mislukt:', err.message ?? err);
    res.writeHead(502).end();
  }
}

// ---- Idle-detectie voor credit-gelimiteerde bronnen, 2026-08-19 ------------
// Aanleiding: Lex' terechte vraag "of staat de server dat straks op default
// te doen?" — ja, elke bron met een pollIntervalMs draait via setInterval
// altijd door zolang het proces leeft, los van of iemand de app open heeft.
// Voor de meeste bronnen (officiële overheids-API's) maakt dat weinig uit,
// maar Lifeliner (OpenSky, anoniem) heeft een harde 400-credits/dag-limiet —
// 24/7 doorpollen op een snel tempo zou dat budget alsnog opsouperen, ook al
// wil Lex juist een kort interval (1 min of sneller) voor minder lag. Lex'
// eigen gebruikspatroon lost dat op: 1 gebruiker, een paar keer per dag een
// kwartier — dus alleen ECHT pollen zolang er ook een client kijkt, i.p.v. op
// tijd-budget te bezuinigen. Bronnen met `overslaanAlsIdle: true` in
// config.js (nu alleen lifeliner) worden overgeslagen zodra er langer dan
// IDLE_DREMPEL_MS geen /api/signals-verzoek is binnengekomen; zodra er weer
// een client verschijnt, wordt zo'n bron met voorrang meteen ververst i.p.v.
// te wachten tot het eerstvolgende interval-tikje.
const IDLE_DREMPEL_MS = 90 * 1000; // iets ruimer dan de frontend-ververscyclus (20s), tegen valse idle-flapping

// Extra laag boven de idle-gate, specifiek voor lifeliner (2026-08-19, op
// verzoek van Lex): ook tíjdens een sessie heeft OpenSky-pollen weinig zin
// als er simpelweg niks vliegt. p2000.js signaleert een mogelijke MMT-
// ("Mobiel Medisch Team", de meldkamer-oproep bij een traumaheli-inzet)
// dispatch — zolang die minder dan dit venster geleden is, polt lifeliner
// door, ook zonder actieve client, zodat de data (incl. het zelf opgebouwde
// vluchtspoor) al warm staat tegen de tijd dat iemand de app opent.
// 2026-08-19: was eerst 45 minuten (een ruime inschatting van een hele MMT-
// missieduur) — op Lex' vraag ("is 45 min niet wat lang?") teruggebracht
// naar 15. Het venster hoeft namelijk niet de hele missie te dekken: zodra
// Lex de app opent, telt hij niet meer als idle en blijft lifeliner gewoon
// normaal (elke 30s) doorpollen zolang hij kijkt — dit venster dient alleen
// om de eerste minuten (en dus het begin van het vluchtspoor) warm te
// houden tot hij de melding opmerkt en de app opent. 15 min × 2 polls/min =
// 30 credits per trigger i.p.v. 90 — bij meerdere dispatches op één dag
// scheelt dat flink in het 400-credits/dag-budget (zie ook config.js).
const LIFELINER_TRIGGER_VENSTER_MS = 15 * 60 * 1000;

export function createApp(env) {
  const states = new Map(SOURCES.map((s) => [s.id, new SourceState(s)]));
  const timers = [];
  let stopBlitzortung = null;
  // Startwaarde = nu, niet 0 — anders zou "nog nooit een client gezien"
  // (bijv. vlak na een herstart 's nachts) meteen als "actief" tellen i.p.v.
  // als idle, en zou deze hele bezuiniging pas ingaan ná de eerste bezoeker.
  let laatsteClientMs = Date.now();

  function isIdle() {
    return Date.now() - laatsteClientMs > IDLE_DREMPEL_MS;
  }

  // Aanroepen vanuit elk /api/signals*-verzoek: onthoudt "er is net iemand",
  // en als de app ná een idle-periode weer wordt geopend, meteen (niet pas na
  // het volgende interval-tikje) de idle-gepauzeerde bronnen verversen — dus
  // geen extra wachttijd bovenop de tijd dat de app al dicht was.
  function signaalVerzoekOntvangen() {
    const kwamUitIdle = isIdle();
    laatsteClientMs = Date.now();
    if (kwamUitIdle) {
      for (const source of SOURCES) {
        if (source.overslaanAlsIdle && source.implemented) pollOnce(source.id);
      }
    }
  }
  // Los van de SOURCES/signalen-machinerie hierboven: dit is geen hazard-
  // signaal maar statische referentiegeodata (NEXRAD-stationslocaties) voor
  // de Doppler-"Rotatie"-lookup in de frontend. Vandaar een eigen kleine
  // cache i.p.v. SourceState — die verwacht makeSignal()-achtige objecten
  // met categorie/ernst, wat hier niet van toepassing is.
  let nexradStations = [];
  let nexradStationsBijgewerkt = null;

  async function ververNexradStations() {
    try {
      nexradStations = await fetchNexradStations();
      nexradStationsBijgewerkt = new Date().toISOString();
    } catch (err) {
      // Vorige lijst (indien aanwezig) blijft gewoon staan — beter een iets
      // oudere lijst (radarlocaties veranderen sowieso vrijwel nooit) dan
      // een lege lijst voor de rotatie-lookup.
      console.error('[weer] nexradStations poll mislukt:', err.message ?? err);
    }
  }

  // 2026-08-20, op verzoek van Lex — synopsis-tekst per zeegebied (Dogger,
  // Humber, German Bight, Thames) voor de Zeekaart, zie
  // sources/knmiZeeForecast.js. Zelfde eigen-kleine-cache-aanpak als
  // nexradStations hierboven (geen hazard-signaal, dus niet via SOURCES/
  // SourceState): elke 3 uur verversen is ruim genoeg (KNMI geeft de
  // scheepvaartverwachting een paar keer per dag uit), en bij een mislukte
  // fetch blijft de vorige (nog altijd redelijk actuele) versie gewoon staan
  // i.p.v. de popup leeg te laten.
  let zeeForecast = { bron: null, bijgewerkt: null, gebieden: {} };

  async function ververZeeForecast() {
    try {
      zeeForecast = await fetchZeeForecast();
    } catch (err) {
      console.error('[weer] knmi-zeeforecast poll mislukt:', err.message ?? err);
    }
  }

  // 2026-08-24, op verzoek van Lex — actieve scheepvaartwaarschuwingen (geen
  // synopsis, zie sources/sealagomZeeWaarschuwingen.js) voor de zes
  // zeegebieden die knmiZeeForecast.js hierboven niet dekt. Zelfde
  // eigen-kleine-cache-aanpak, elk uur verversen: iets vaker dan de
  // 3-uurlijkse weersynopsis omdat dit scheepvaart-waarschuwingen zijn
  // (kunnen tussentijds bijkomen/vervallen), maar niet zo vaak als NAVTEX/
  // UKHO zelf — dit is bewust een rustige, best-effort aanvulling, geen
  // urgent hazard-signaal via SOURCES/SourceState.
  let zeeWaarschuwingen = { bron: null, bijgewerkt: null, gebieden: {} };

  async function ververZeeWaarschuwingen() {
    try {
      zeeWaarschuwingen = await fetchZeeWaarschuwingen();
    } catch (err) {
      console.error('[weer] sealagom-zeewaarschuwingen poll mislukt:', err.message ?? err);
    }
  }

  // 2026-08-24, op verzoek van Lex ("waar komt de synopsis vandaan voor die
  // gebieden die we missen?") — ECHTE weersynopsis (geen scheepvaart-
  // waarschuwingen zoals hierboven) voor alle 10 ZEE_GEBIEDEN, via de UK Met
  // Office Shipping Forecast (zie sources/metOfficeZeeForecast.js). Zelfde
  // eigen-kleine-cache-aanpak, elke 3 uur verversen zoals de KNMI-synopsis
  // hierboven (de bron zelf ververst 4x/dag).
  let metOfficeForecast = { bron: null, bijgewerkt: null, gebieden: {} };

  async function ververMetOfficeForecast() {
    try {
      metOfficeForecast = await fetchMetOfficeZeeForecast();
    } catch (err) {
      console.error('[weer] metoffice-zeeforecast poll mislukt:', err.message ?? err);
    }
  }

  // 2026-08-21, op verzoek van Lex ("kunnen we een laag flight- en vaarradar
  // toevoegen?") — vaarradar (AIS) is een permanente streaming-verbinding
  // (zie sources/vaarradar.js, zelfde soort opzet als Blitzortung hierboven),
  // dus die start/stopt hier net als Blitzortung, niet via de gewone
  // poll-lus. Geen SourceState/SOURCES-registratie: dit is geen hazard-
  // signaal maar een losse live-verkeerslaag, met eigen /api/vaarradar-route
  // hieronder i.p.v. via /api/signals te lopen.
  let vaarradarFeed = { posities: new Map(), stop: () => {} };

  // 2026-08-24, op verzoek van Lex ("Kan het zijn dat na elke sync ukho even
  // niet getoond wordt tot de volgende ronde?"): elke bron begint na een
  // herstart (bv. na syncweer) met state.signals = [] (zie SourceState in
  // normalize.js) totdat de EERSTE poll geslaagd is. startPolling() vuurt die
  // eerste poll weliswaar meteen af (niet pas na het interval), maar als die
  // ene poging faalt (bv. de eerder geziene 15s-timeout op msi.admiralty.
  // co.uk) was de eerstvolgende kans pas het volgende reguliere interval —
  // voor ukho tot 10 minuten. Bewust EENMALIG en ALLEEN vlak na een koude
  // start (state.lastSuccessAt nog nooit gezet): zodra een bron eenmaal
  // succesvol is opgehaald, valt een latere, incidentele fout gewoon terug op
  // het normale interval — dit is puur om het opstart-gat te dichten, geen
  // algemene retry-loop die structurele fouten zou verbergen.
  const SNELLE_RETRY_MS = 30 * 1000;
  const snelleRetryGedaan = new Set();

  async function pollOnce(sourceId) {
    const state = states.get(sourceId);
    const fetcher = FETCHERS[sourceId];
    if (!state || !fetcher) return;
    if (state.config.overslaanAlsIdle && isIdle()) {
      // Uitzondering voor lifeliner: een recente MMT-dispatch (zie p2000.js)
      // rechtvaardigt doorpollen, ook zonder kijkende client.
      const recenteMMTTrigger = sourceId === 'lifeliner' && msSindsLaatsteMMTMelding() < LIFELINER_TRIGGER_VENSTER_MS;
      if (!recenteMMTTrigger) return; // credit-budget sparen zolang niemand kijkt én er niets vliegt
    }
    try {
      const signals = await fetcher(env);
      state.markSuccess(signals);
    } catch (err) {
      state.markError(err);
      console.error(`[weer] ${sourceId} poll mislukt:`, err.message ?? err);
      if (!state.lastSuccessAt && !snelleRetryGedaan.has(sourceId)) {
        snelleRetryGedaan.add(sourceId);
        console.log(`[weer] ${sourceId}: eerste poll na opstarten mislukt, snelle herhaal-poging over ${SNELLE_RETRY_MS / 1000}s.`);
        setTimeout(() => pollOnce(sourceId), SNELLE_RETRY_MS);
      }
    }
  }

  function startPolling() {
    for (const source of SOURCES) {
      if (source.id === 'blitzortung') continue; // streaming, geen timer-polling — zie hieronder
      if (!source.implemented || source.pollIntervalMs == null) continue;
      pollOnce(source.id); // meteen bij opstarten, niet pas na het eerste interval
      const timer = setInterval(() => pollOnce(source.id), source.pollIntervalMs);
      timers.push(timer);
    }

    // Radarlocaties zijn vrijwel statisch — eenmaal bij opstarten ophalen is
    // genoeg, maar 1x/dag verversen kan geen kwaad (en vangt op als NOAA ooit
    // een station toevoegt/verwijdert) zonder dat het als een "bron" met
    // stale/haperend-status in Instellingen hoeft te verschijnen.
    ververNexradStations();
    timers.push(setInterval(ververNexradStations, 24 * 60 * 60 * 1000));

    ververZeeForecast();
    timers.push(setInterval(ververZeeForecast, 3 * 60 * 60 * 1000));

    ververZeeWaarschuwingen();
    timers.push(setInterval(ververZeeWaarschuwingen, 60 * 60 * 1000));
    ververMetOfficeForecast();
    timers.push(setInterval(ververMetOfficeForecast, 3 * 60 * 60 * 1000));

    // 2026-08-22, ISS-passagemelding (zie controleerIssAlarm() in
    // celestrak.js) — bewust een eigen, snelle 30s-timer los van celestrak's
    // eigen pollIntervalMs (6 uur, prima voor de voorspelling zelf maar veel
    // te traag om een "over 2 minuten begint 'ie"-moment te kunnen raken).
    // Geen state hier nodig — celestrak.js onthoudt zelf de laatst berekende
    // aanbevolen passage en dedupliceert zelf niet eens (dat doen pushover.js/
    // email.js/webpush.js's eigen gemeld-Sets al, zie de comment daar).
    controleerIssAlarm();
    timers.push(setInterval(controleerIssAlarm, 30 * 1000));

    // 2026-08-22, Starlink-trein-melding (zie controleerStarlinkAlarm() in
    // starlinkTrain.js) — zelfde soort eigen snelle 30s-timer als hierboven,
    // alleen de aankondigingstermijn wijkt af (5 minuten i.p.v. 2, op
    // verzoek van Lex).
    controleerStarlinkAlarm();
    timers.push(setInterval(controleerStarlinkAlarm, 30 * 1000));

    const blitzortungBron = SOURCES.find((s) => s.id === 'blitzortung');
    if (blitzortungBron?.implemented) {
      const state = states.get('blitzortung');
      stopBlitzortung = startBlitzortungStream({
        homeLat: env.homeLat,
        homeLon: env.homeLon,
        onUpdate: (signalen) => state.markSuccess(signalen),
        onError: (err) => {
          state.markError(err);
          console.error('[weer] blitzortung:', err.message ?? err);
        },
      });
    }

    vaarradarFeed = startVaarradarFeed(env);
  }

  function stopPolling() {
    timers.forEach(clearInterval);
    if (stopBlitzortung) stopBlitzortung();
    vaarradarFeed.stop();
  }

  function signalenMet(filterCategorie) {
    return [...states.values()].flatMap((state) =>
      state.signals
        .filter((s) => !filterCategorie || s.categorie === filterCategorie)
        .map((signal) => ({
          ...signal,
          bron: {
            id: state.config.id,
            naam: state.config.naam,
            tier: state.config.tier,
            bijgewerkt: state.lastSuccessAt,
            haperend: state.isStale(),
          },
        })),
    );
  }

  async function serveStatic(req, res) {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    const relPath = urlPath === '/' ? '/index.html' : urlPath;
    const filePath = join(env.frontendDir ?? 'frontend', relPath);
    // simpele traversal-check
    if (!filePath.startsWith(env.frontendDir ?? 'frontend')) {
      res.writeHead(403).end('Verboden');
      return;
    }
    try {
      const s = await stat(filePath);
      if (!s.isFile()) throw new Error('geen bestand');
      const data = await readFile(filePath);
      res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Niet gevonden');
    }
  }

  const server = createServer(async (req, res) => {
    const url = req.url.split('?')[0];

    if (url === '/api/config') {
      return sendJson(res, 200, {
        homeLat: env.homeLat,
        homeLon: env.homeLon,
        homeLabel: env.homeLabel ?? 'Thuis',
        // 2026-08-22: VAPID-publieke-sleutel voor Web Push (zie
        // sources/webpush.js) — per ontwerp van VAPID niet geheim, mag hier
        // gewoon mee (in tegenstelling tot VAPID_PRIVATE_KEY, die alleen in
        // .env/webpush.js blijft). Lege string als er nog geen sleutelpaar
        // is ingesteld — de frontend behandelt dat als "functie nog niet
        // beschikbaar", geen foutmelding.
        vapidPublicKey: env.vapidPublicKey ?? '',
      });
    }
    if (url === '/api/push/abonneren' && req.method === 'POST') {
      // 2026-08-22: enige POST-route in dit hele project — zie readJsonBody
      // hierboven voor waarom er geen bodyparser-dependency bij is gehaald.
      try {
        const subscription = await readJsonBody(req);
        const opgeslagen = voegAbonnementToe(subscription);
        if (!opgeslagen) return sendJson(res, 400, { fout: 'ongeldig abonnement (geen endpoint)' });
        return sendJson(res, 200, { ok: true });
      } catch (err) {
        console.error('[weer] /api/push/abonneren mislukt:', err.message ?? err);
        return sendJson(res, 400, { fout: 'ongeldig verzoek' });
      }
    }
    // 2026-08-22, op verzoek van Lex — de knop in Instellingen is nu een
    // echte aan/uit-toggle: dit is de "uit"-kant, meldt het abonnement
    // netjes af bij de server i.p.v. alleen lokaal (client-side) te
    // verbergen (anders zou de server een dood abonnement blijven proberen
    // en dat komt pas via een mislukte verstuurpoging aan het licht).
    if (url === '/api/push/afmelden' && req.method === 'POST') {
      try {
        const { endpoint } = await readJsonBody(req);
        if (!endpoint) return sendJson(res, 400, { fout: 'geen endpoint meegegeven' });
        verwijderAbonnementViaEndpoint(endpoint);
        return sendJson(res, 200, { ok: true });
      } catch (err) {
        console.error('[weer] /api/push/afmelden mislukt:', err.message ?? err);
        return sendJson(res, 400, { fout: 'ongeldig verzoek' });
      }
    }
    if (url === '/api/radarstations') {
      return sendJson(res, 200, { stations: nexradStations, bijgewerkt: nexradStationsBijgewerkt });
    }
    // 2026-08-26, op verzoek van Lex ("kan ik dit schema niet ergens handig
    // in de app beschikbaar hebben") -- statische naslag-data (geen eigen
    // ophaal-cyclus nodig, dit verandert nooit vanzelf): stationsnaam, land
    // en zendschema per NAVTEX-station, voor het uitklapbare overzicht in
    // Instellingen en de "eerstvolgende uitzending"-regel in de NAVTEX-
    // popup (zie STATIONS in sources/navtexLokaal.js voor de brondata en
    // eerstvolgendeUitzending()/renderNavtexUitlegSectie() in app.js voor
    // het gebruik). Alleen de velden die de frontend nodig heeft -- lat/lon/
    // navarea/kleur zijn hier niet relevant.
    if (url === '/api/navtex-stations') {
      return sendJson(res, 200, {
        stations: NAVTEX_STATIONS.map((s) => ({ id: s.id, naam: s.naam, land: s.land, zendschema: s.zendschema })),
      });
    }
    if (url === '/api/zee-synopsis') {
      return sendJson(res, 200, zeeForecast);
    }
    if (url === '/api/zee-waarschuwingen') {
      return sendJson(res, 200, zeeWaarschuwingen);
    }
    if (url === '/api/zee-synopsis-metoffice') {
      return sendJson(res, 200, metOfficeForecast);
    }
    // 2026-08-21: vliegradar/vaarradar — beide met dezelfde ?lat=&lon=&straal=
    // query-vorm (straal in km, rond de meegegeven positie — de frontend
    // stuurt hier de live GPS-positie van de telefoon, zie huidigePositie()
    // in app.js). Geen SourceState/SOURCES-integratie, zie de bron-bestanden
    // voor waarom.
    if (url === '/api/vliegradar') {
      const params = new URL(req.url, 'http://localhost').searchParams;
      const lat = Number(params.get('lat'));
      const lon = Number(params.get('lon'));
      const straal = Math.min(100, Math.max(1, Number(params.get('straal')) || 50));
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return sendJson(res, 400, { fout: 'lat en lon zijn verplicht', vliegtuigen: [] });
      }
      try {
        const data = await fetchVliegradar({ lat, lon, straalKm: straal });
        return sendJson(res, 200, data);
      } catch (err) {
        console.error('[weer] vliegradar-verzoek mislukt:', err.message ?? err);
        return sendJson(res, 502, { fout: 'vliegradar tijdelijk niet beschikbaar', vliegtuigen: [] });
      }
    }
    // 2026-08-22, op verzoek van Lex (ISS-kaarttracking, zie sources/
    // celestrak.js/issLive.js) — zelfde soort losse live-route als
    // vliegradar/vaarradar hierboven, alleen zonder ?lat=&lon= (ISS-tracking
    // is altijd relatief aan HOME_LAT/HOME_LON, niet aan een live
    // telefoonpositie zoals bij vliegradar).
    if (url === '/api/iss-live') {
      try {
        const data = await fetchIssLive({ homeLat: env.homeLat, homeLon: env.homeLon });
        return sendJson(res, 200, data);
      } catch (err) {
        console.error('[weer] iss-live-verzoek mislukt:', err.message ?? err);
        return sendJson(res, 502, { fout: 'ISS-live-positie tijdelijk niet beschikbaar' });
      }
    }
    // 2026-08-22, op verzoek van Lex (live Starlink-treinkaarttracking) —
    // zelfde soort losse live-route als /api/iss-live hierboven, maar
    // synchroon (SGP4-propagatie, geen netwerkverzoek) en met een 404 als er
    // nu geen trein bekend is (zie starlinkLive.js/starlinkTrain.js) i.p.v.
    // een 502 — dat is dan geen storing, gewoon "nu even niet".
    if (url === '/api/starlink-live') {
      try {
        const data = fetchStarlinkLive({ homeLat: env.homeLat, homeLon: env.homeLon });
        if (!data) return sendJson(res, 404, { fout: 'Geen actieve Starlink-trein op dit moment' });
        return sendJson(res, 200, data);
      } catch (err) {
        console.error('[weer] starlink-live-verzoek mislukt:', err.message ?? err);
        return sendJson(res, 502, { fout: 'Starlink-live-positie tijdelijk niet beschikbaar' });
      }
    }
    if (url === '/api/vaarradar') {
      const params = new URL(req.url, 'http://localhost').searchParams;
      const lat = Number(params.get('lat'));
      const lon = Number(params.get('lon'));
      const straal = Math.min(100, Math.max(1, Number(params.get('straal')) || 50));
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return sendJson(res, 400, { fout: 'lat en lon zijn verplicht', schepen: [] });
      }
      const schepen = vaarradarBinnenStraal(vaarradarFeed.posities, lat, lon, straal);
      return sendJson(res, 200, { bijgewerkt: new Date().toISOString(), schepen, bron: 'aisstream.io' });
    }
    if (url === '/api/status') {
      return sendJson(res, 200, { bronnen: SOURCES.map((s) => states.get(s.id).toStatus()) });
    }
    // 2026-08-23, op verzoek van Lex ("Het lifeliner pollenprobleem... Ik wil
    // een rapport wanneer en hoeveel er wordt gepolled") — hetzelfde rapport
    // dat automatisch gemaild wordt bij een 429 (zie lifeliner.js), hier ook
    // los opvraagbaar zodat je niet per se op een 429 hoeft te wachten om
    // mee te kunnen kijken. Platte tekst, geen JSON — bedoeld om zo in de
    // browser of curl te lezen.
    if (url === '/api/lifeliner-rapport') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end(lifelinerRapportTekst());
    }
    if (url === '/api/signals') {
      signaalVerzoekOntvangen();
      const signalen = signalenMet(null);
      return sendJson(res, 200, { signalen, aantal: signalen.length });
    }
    const catMatch = url.match(/^\/api\/signals\/([a-z-]+)$/);
    if (catMatch) {
      signaalVerzoekOntvangen();
      const signalen = signalenMet(catMatch[1]);
      return sendJson(res, 200, { signalen, aantal: signalen.length });
    }
    const tegelMatch = url.match(/^\/api\/tegel\/(\d+)\/(\d+)\/(\d+)\.png$/);
    if (tegelMatch) {
      return serveTegel(req, res, tegelMatch[1], tegelMatch[2], tegelMatch[3]);
    }
    const regenradarMatch = url.match(/^\/api\/regenradar\/(.+)$/);
    if (regenradarMatch) {
      return serveRegenradar(req, res, regenradarMatch[1]);
    }

    return serveStatic(req, res);
  });

  return { server, startPolling, stopPolling, states };
}
