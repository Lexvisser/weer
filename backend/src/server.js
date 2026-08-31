// Bewust zonder externe dependencies (express etc.) — dit hele project draait
// puur op Node zelf. Dat betekent: geen "npm install" nodig om te starten,
// gewoon "node src/index.js". Scheelt gedoe voor een klein persoonlijk project.
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
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
import { fetchNavtexLokaal, STATIONS as NAVTEX_STATIONS, leesRuweOntvangst, ruweOntvangstStatus } from './sources/navtexLokaal.js';
import { fetchZeeForecast } from './sources/knmiZeeForecast.js';
import { fetchZeeWaarschuwingen } from './sources/sealagomZeeWaarschuwingen.js';
import { fetchMetOfficeZeeForecast } from './sources/metOfficeZeeForecast.js';
import { fetchDwdFronten, huidigeFronten } from './sources/dwdFronten.js';
import { fetchIsobaren, huidigeIsobaren, huidigeIsobarenStatus, noteerIsobarenFout, laadVeldVanSchijf as laadIsobarenVanSchijf, VERVERS_INTERVAL_MS as ISOBAREN_INTERVAL_MS } from './sources/isobaren.js';
import { fetchVliegradar } from './sources/vliegradar.js';
import { fetchIssLive } from './sources/issLive.js';
import { controleerIssAlarm } from './sources/celestrak.js';
import { startVaarradarFeed, vaarradarBinnenStraal } from './sources/vaarradar.js';
import { startVaarradarLokaalFeed } from './sources/vaarradarLokaal.js';
import { voegAbonnementToe, verwijderAbonnementViaEndpoint } from './sources/webpush.js';
import { fetchStormvloedkering } from './sources/stormvloedkering.js';
import { fetchPtwc } from './sources/ptwc.js';
import { alleSchakelaars, zetTelefoonAlarm, GELDIGE_SLEUTELS } from './alarmSchakelaars.js';

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
  stormvloedkering: () => fetchStormvloedkering(),
  // 2026-08-27: wereldwijde tsunami's — PTWC (Stille Oceaan, officieel);
  // het GDACS TS-vangnet loopt gewoon mee in de bestaande gdacs-fetcher.
  ptwc: () => fetchPtwc(),
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

// 2026-08-27, trage-kaart-analyse: alles (tegels, /api/signals, statische
// bestanden) loopt over deze ene kale HTTP/1.1-host, waar de browser maar ~6
// gelijktijdige verbindingen naartoe opent — hoe minder bytes en round-trips
// per verzoek, hoe sneller de kaart-opbouw. Twee generieke maatregelen die
// hieronder in sendJson() én serveStatic() terugkomen:
// (1) gzip: JSON en tekst-bestanden comprimeren prima (app.js ~350KB → een
//     fractie daarvan), zlib zit gewoon in Node, geen dependency nodig.
// (2) ETag + Cache-Control: no-cache: "no-cache" betekent NIET "niet cachen"
//     maar "eerst even bij de server checken" — de browser stuurt dan
//     If-None-Match mee, en bij ongewijzigde inhoud is het antwoord een leeg
//     304'je i.p.v. de hele payload. Altijd vers (belangrijk tijdens actieve
//     ontwikkeling, zie de sw.js-historie), maar zonder telkens alles
//     opnieuw te versturen. Zie ook de bijbehorende sw.js-aanpassing
//     (cache: 'no-store' → 'no-cache') — no-store omzeilde de browsercache
//     volledig en maakte conditionele verzoeken dus onmogelijk.
const COMPRESSIE_MIN_BYTES = 1024; // onder ~1KB wint gzip niets (soms zelfs groter)

function accepteertGzip(req) {
  return /\bgzip\b/.test(req?.headers?.['accept-encoding'] ?? '');
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  // res.req is de bijbehorende IncomingMessage (standaard node:http) — zo
  // hoeven de ~20 bestaande sendJson(res, ...)-aanroepen niet allemaal een
  // extra req-parameter te krijgen.
  const req = res.req;
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*', // gemakkelijk binnen je eigen tailnet, geen publieke blootstelling
    'Vary': 'Accept-Encoding',
  };
  if (status === 200) {
    const etag = `"${createHash('sha1').update(body).digest('base64url')}"`;
    headers['ETag'] = etag;
    headers['Cache-Control'] = 'no-cache';
    if (req?.headers?.['if-none-match'] === etag) {
      res.writeHead(304, headers);
      return res.end();
    }
    if (Buffer.byteLength(body) >= COMPRESSIE_MIN_BYTES && accepteertGzip(req)) {
      const gz = gzipSync(Buffer.from(body));
      headers['Content-Encoding'] = 'gzip';
      headers['Content-Length'] = gz.length;
      res.writeHead(status, headers);
      return res.end(gz);
    }
  }
  headers['Content-Length'] = Buffer.byteLength(body);
  res.writeHead(status, headers);
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
// 2026-08-28, op verzoek van Lex ("waarom gebruiken we eigenlijk niet de
// echte zeekaart?"): de ontbrekende middelste laag van de OpenSeaMap-
// sandwich is de DIEPTELAAG — OpenSeaMap's eigen dieptetegels worden niet
// meer betrouwbaar geserveerd, maar EMODnet Bathymetry (het Europese
// zeebodemprogramma, vrij te gebruiken) serveert prima web-mercator-tegels.
// Zelfde proxy-vangnetten (schijfcache, in-flight-dedup, foutcache) als de
// OSM-tegels hierboven, eigen pad /api/tegel-diepte/. Max zoom 12: hogere
// zooms bestaan upstream niet — de frontend rekt met maxNativeZoom op.
const TEGEL_DIEPTE_BASIS_URL = 'https://tiles.emodnet-bathymetry.eu/2020/baselayer/web_mercator';
const TEGEL_DIEPTE_MAX_Z = 12;
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

// 2026-08-27, trage/onbetrouwbare-kaart-analyse — vier vangnetten die beide
// tegel-proxy's (OSM hieronder én RainViewer verderop) misten:
//
// (1) TIMEOUT op de upstream-fetch. Zonder timeout houdt één hangende
//     OSM/RainViewer-request niet alleen deze proxy-aanroep eindeloos vast,
//     maar ook een van de ~6 verbindingen die de browser maximaal naar deze
//     host opent (HTTP/1.1) — alle andere tegels wachten daar dan achter.
//     Dat verklaarde het "kaart hangt/blijft half leeg"-gevoel goed.
// (2) IN-FLIGHT-DEDUP. Bij een koude cache vraagt Leaflet dezelfde tegel
//     soms bijna gelijktijdig meermaals aan (en de radar-lagen a/b sowieso
//     in paren) — voorheen ging elk van die verzoeken apart naar upstream.
//     Nu delen gelijktijdige aanvragen voor dezelfde tegel één fetch.
// (3) NEGATIEVE CACHE (kort). Een upstream-fout (404/500/timeout) werd
//     voorheen nergens onthouden, dus elke herpoging ging meteen weer de
//     volle (trage) weg naar upstream. Nu wordt zo'n fout 30s onthouden en
//     direct beantwoord; na 30s mag het gewoon opnieuw geprobeerd worden.
//     Fout-responses krijgen 'Cache-Control: no-store' mee zodat de browser
//     ze nooit vasthoudt (het eerdere Esri→OSM-cache-debacle indachtig).
// (4) SCHIJF-PERSISTENTIE (alleen OSM, zie TEGEL_SCHIJF_DIR hieronder). De
//     geheugencache verdween bij elke service-herstart — en syncweer
//     herstart de service, dus juist ná elke deploy was de eerste
//     kaart-opbouw altijd volledig koud. OSM-tegels wijzigen zelden; ze
//     staan nu ook in backend/data/tegels/ (30 dagen houdbaar) zodat een
//     herstart de cache niet meer leegt. RainViewer-frames zijn te
//     kortstondig om schijfruimte aan te besteden — die houden alleen de
//     geheugencache.
const TEGEL_FETCH_TIMEOUT_MS = 10 * 1000;
const TEGEL_FOUT_CACHE_MS = 30 * 1000;
const __dirname = dirname(fileURLToPath(import.meta.url));
const TEGEL_SCHIJF_DIR = join(__dirname, '..', 'data', 'tegels');
const TEGEL_SCHIJF_MAX_LEEFTIJD_MS = 30 * 24 * 60 * 60 * 1000;

const tegelFoutCache = new Map(); // sleutel -> { status, tijdMs }
const tegelInFlight = new Map(); // sleutel -> Promise<{ status, buffer?, contentType?, bron? }>

// 2026-08-27, diagnose-hulp voor Lex' iPad-melding ("consequent 15-16s
// voordat de hele kaart er staat"): een klein ringbuffertje met de laatste
// tegel-verzoeken — wanneer ze op de server AANKWAMEN, hoe lang het
// beantwoorden duurde en waar het antwoord vandaan kwam. Opvraagbaar via
// /api/tegel-stats (zie route hieronder). Daarmee is het onderscheid te
// maken dat we vanaf de iPad zelf (geen DevTools) niet kunnen zien:
// - komen de verzoeken pas ná ~15s binnen -> het probleem zit vóór de
//   server (verbindingsopbouw iPad->server, wifi/Tailscale), of
// - komen ze meteen binnen maar duurt het antwoord lang -> het zit in de
//   server/upstream (dan staat het hier per tegel zwart-op-wit).
const TEGEL_STATS_MAX = 400;
const tegelStats = [];

function noteerTegelStat(pad, aankomstMs, bron, status) {
  tegelStats.push({
    pad,
    aankomst: new Date(aankomstMs).toISOString(),
    duurMs: Date.now() - aankomstMs,
    bron,
    status,
  });
  if (tegelStats.length > TEGEL_STATS_MAX) tegelStats.splice(0, tegelStats.length - TEGEL_STATS_MAX);
}

function tegelFoutStatus(foutCache, sleutel) {
  const fout = foutCache.get(sleutel);
  if (!fout) return null;
  if (Date.now() - fout.tijdMs > TEGEL_FOUT_CACHE_MS) {
    foutCache.delete(sleutel);
    return null;
  }
  return fout.status;
}

// Haalt één OSM-tegel op als data-object, met de volledige cache-keten:
// geheugen → schijf → upstream. Gedeeld door gelijktijdige aanvragen via
// tegelInFlight (zie punt 2 hierboven). Gooit zelf nooit — een fout komt
// terug als { status } zonder buffer.
function haalTegelData(sleutel, zNum, xNum, yNum, bron = 'osm') {
  const lopend = tegelInFlight.get(sleutel);
  if (lopend) return lopend;

  const promise = (async () => {
    // Schijfcache — overleeft de service-herstart die elke syncweer doet.
    // 2026-08-28: de dieptetegels krijgen een eigen submap; het osm-pad
    // blijft ongewijzigd zodat de bestaande schijfcache gewoon geldig blijft.
    const schijfPad = bron === 'osm'
      ? join(TEGEL_SCHIJF_DIR, String(zNum), String(xNum), `${yNum}.png`)
      : join(TEGEL_SCHIJF_DIR, bron, String(zNum), String(xNum), `${yNum}.png`);
    try {
      const s = await stat(schijfPad);
      if (Date.now() - s.mtimeMs < TEGEL_SCHIJF_MAX_LEEFTIJD_MS) {
        const buffer = await readFile(schijfPad);
        return { status: 200, buffer, contentType: 'image/png', bron: 'schijf' };
      }
    } catch {
      // niet op schijf (of niet leesbaar) — gewoon door naar upstream
    }

    try {
      // Beide bronnen gebruiken de gebruikelijke XYZ-volgorde (z/x/y).
      const basisUrl = bron === 'diepte' ? TEGEL_DIEPTE_BASIS_URL : TEGEL_BASIS_URL;
      const upstream = await fetch(`${basisUrl}/${zNum}/${xNum}/${yNum}.png`, {
        headers: { 'User-Agent': TEGEL_USER_AGENT },
        signal: AbortSignal.timeout(TEGEL_FETCH_TIMEOUT_MS),
      });
      if (!upstream.ok) {
        tegelFoutCache.set(sleutel, { status: upstream.status, tijdMs: Date.now() });
        return { status: upstream.status, bron: 'upstream-fout' };
      }
      const buffer = Buffer.from(await upstream.arrayBuffer());
      const contentType = upstream.headers.get('content-type') ?? 'image/png';

      // Fire-and-forget naar schijf — een schrijffout (schijf vol, rechten)
      // mag het serveren zelf nooit ophouden of laten falen.
      mkdir(dirname(schijfPad), { recursive: true })
        .then(() => writeFile(schijfPad, buffer))
        .catch((err) => console.error('[weer] tegel-schijfcache schrijven mislukt:', err.message ?? err));

      return { status: 200, buffer, contentType, bron: 'upstream' };
    } catch (err) {
      console.error('[weer] kaarttegel-proxy mislukt:', err.message ?? err);
      tegelFoutCache.set(sleutel, { status: 502, tijdMs: Date.now() });
      return { status: 502, bron: 'fout' };
    }
  })().finally(() => tegelInFlight.delete(sleutel));

  tegelInFlight.set(sleutel, promise);
  return promise;
}

async function serveTegel(req, res, z, x, y, bron = 'osm') {
  const zNum = Number(z);
  const xNum = Number(x);
  const yNum = Number(y);
  const maxZ = bron === 'diepte' ? TEGEL_DIEPTE_MAX_Z : TEGEL_MAX_Z;
  if (!Number.isInteger(zNum) || !Number.isInteger(xNum) || !Number.isInteger(yNum) || zNum < 0 || zNum > maxZ) {
    res.writeHead(400).end('Ongeldige tegel-coördinaten');
    return;
  }
  // osm houdt de kale sleutel (bestaande geheugen-/schijfcache blijft geldig).
  const sleutel = bron === 'osm' ? `${zNum}/${xNum}/${yNum}` : `${bron}/${zNum}/${xNum}/${yNum}`;
  const nu = Date.now();
  const bestaand = tegelCache.get(sleutel);
  if (bestaand && nu - bestaand.tijdMs < TEGEL_CACHE_MS) {
    noteerTegelStat(sleutel, nu, 'geheugen', 200);
    res.writeHead(200, {
      'Content-Type': bestaand.contentType,
      'Content-Length': bestaand.buffer.length,
      'Cache-Control': 'public, max-age=86400',
    });
    res.end(bestaand.buffer);
    return;
  }
  const eerderFout = tegelFoutStatus(tegelFoutCache, sleutel);
  if (eerderFout != null) {
    // no-store: de browser mag een fout-respons nooit bewaren (zie het
    // Esri→OSM-schijfcache-debacle in de module-comment hierboven).
    noteerTegelStat(sleutel, nu, 'fout-cache', eerderFout);
    res.writeHead(eerderFout, { 'Cache-Control': 'no-store' }).end();
    return;
  }

  const resultaat = await haalTegelData(sleutel, zNum, xNum, yNum, bron);
  noteerTegelStat(sleutel, nu, resultaat.bron ?? 'onbekend', resultaat.status);
  if (resultaat.status !== 200 || !resultaat.buffer) {
    res.writeHead(resultaat.status, { 'Cache-Control': 'no-store' }).end();
    return;
  }

  if (tegelCache.size >= TEGEL_CACHE_MAX) {
    const oudsteSleutel = tegelCache.keys().next().value; // Map bewaart invoegvolgorde — oudste eerst
    tegelCache.delete(oudsteSleutel);
  }
  tegelCache.set(sleutel, { buffer: resultaat.buffer, contentType: resultaat.contentType, tijdMs: nu });

  res.writeHead(200, {
    'Content-Type': resultaat.contentType,
    'Content-Length': resultaat.buffer.length,
    // 2026-08-19: was 'immutable, max-age=604800' (een week) — bleek een
    // valkuil tijdens het zoeken naar de juiste tegelbron: toen de upstream
    // hier wisselde van Esri naar OSM (zelfde /api/tegel/{z}/{x}/{y}.png-pad)
    // bleef Lex' browser de oude, kapotte respons uit de eigen schijfcache
    // hergebruiken zonder de server ooit opnieuw te vragen. Nu een dag i.p.v.
    // een week, en zonder 'immutable' — nog steeds ruim genoeg om herhaalde
    // round-trips te schelen, maar een volgende wijziging hangt niet meer
    // een week lang vast in Lex' eigen browsercache. (De server-eigen caches
    // mogen wél veel langer bewaren — sinds 2026-08-27 overleven die zelfs
    // een herstart, via de schijfcache in backend/data/tegels/.)
    'Cache-Control': 'public, max-age=86400',
  });
  res.end(resultaat.buffer);
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

// 2026-08-27: zelfde vangnetten als de OSM-tegel-proxy hierboven (timeout,
// in-flight-dedup, korte negatieve cache) — zie de uitgebreide comment daar.
// Alleen de schijf-persistentie ontbreekt hier bewust: radarframes zijn na
// een uur toch verouderd, daar hoeft geen schijfruimte aan op te gaan.
const regenradarFoutCache = new Map(); // pad -> { status, tijdMs }
const regenradarInFlight = new Map(); // pad -> Promise<{ status, buffer?, contentType? }>

function haalRegenradarData(pad) {
  const lopend = regenradarInFlight.get(pad);
  if (lopend) return lopend;

  const promise = (async () => {
    try {
      const upstream = await fetch(`${REGENRADAR_HOST}/${pad}`, {
        headers: { 'User-Agent': TEGEL_USER_AGENT },
        signal: AbortSignal.timeout(TEGEL_FETCH_TIMEOUT_MS),
      });
      if (!upstream.ok) {
        regenradarFoutCache.set(pad, { status: upstream.status, tijdMs: Date.now() });
        return { status: upstream.status };
      }
      let buffer = Buffer.from(await upstream.arrayBuffer());
      if (buffer.length < REGENRADAR_PLACEHOLDER_MAX_BYTES) buffer = TRANSPARANTE_TEGEL;
      const contentType = upstream.headers.get('content-type') ?? 'image/png';
      return { status: 200, buffer, contentType };
    } catch (err) {
      console.error('[weer] regenradar-tegel-proxy mislukt:', err.message ?? err);
      regenradarFoutCache.set(pad, { status: 502, tijdMs: Date.now() });
      return { status: 502 };
    }
  })().finally(() => regenradarInFlight.delete(pad));

  regenradarInFlight.set(pad, promise);
  return promise;
}

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
  const eerderFout = tegelFoutStatus(regenradarFoutCache, pad);
  if (eerderFout != null) {
    res.writeHead(eerderFout, { 'Cache-Control': 'no-store' }).end();
    return;
  }

  const resultaat = await haalRegenradarData(pad);
  if (resultaat.status !== 200 || !resultaat.buffer) {
    res.writeHead(resultaat.status, { 'Cache-Control': 'no-store' }).end();
    return;
  }

  if (regenradarCache.size >= REGENRADAR_CACHE_MAX) {
    const oudsteSleutel = regenradarCache.keys().next().value; // Map bewaart invoegvolgorde — oudste eerst
    regenradarCache.delete(oudsteSleutel);
  }
  regenradarCache.set(pad, { buffer: resultaat.buffer, contentType: resultaat.contentType, tijdMs: nu });

  res.writeHead(200, {
    'Content-Type': resultaat.contentType,
    'Content-Length': resultaat.buffer.length,
    'Cache-Control': 'public, max-age=3600',
  });
  res.end(resultaat.buffer);
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

  // 2026-08-30, op verzoek van Lex ("doe maar proberen"): fronten-laag,
  // tweede poging — nu uit DWD's handgetekende Bodenanalyse (dwdc-blad,
  // dekt de hele Noordzee), georefereerd en naar Web Mercator gewarpt in
  // sources/dwdFronten.js. Zelfde eigen-kleine-cache-aanpak; elke 30 min
  // pollen is ruim (de kaart komt elke 6 uur), en dankzij If-Modified-Since
  // kost een ongewijzigde kaart geen download. Zie /api/fronten.png en
  // /api/fronten-info hieronder.
  async function ververDwdFronten() {
    try {
      await fetchDwdFronten();
    } catch (err) {
      console.error('[weer] dwd-fronten poll mislukt:', err.message ?? err);
    }
  }

  // 2026-08-30, op verzoek van Lex ("kan dan ook de grote waarde 1000 en T
  // kleiner"): isobaren en H/L-centra zelf getekend uit een Open-Meteo-
  // drukveld, zie sources/isobaren.js (daar staat ook het call-budget).
  // Zelfde 30-min-tik als de DWD-kaart, maar er wordt alleen écht opgehaald
  // als de vorige geslaagde ronde ouder is dan ISOBAREN_INTERVAL_MS (4 uur)
  // — een mislukte ronde wordt zo bij de volgende tik (30 min) opnieuw
  // geprobeerd zonder dat het budget aan retries opgaat. Tussendoor kiest
  // huidigeIsobaren() per uur het passende veld uit de meegevraagde uren.
  let isobarenLaatstGeslaagd = 0;
  let isobarenHerkansing = null; // 2026-08-30: snelle retry na een mislukte ronde
  async function ververIsobaren() {
    if (Date.now() - isobarenLaatstGeslaagd < ISOBAREN_INTERVAL_MS) return;
    clearTimeout(isobarenHerkansing);
    isobarenHerkansing = null;
    try {
      await fetchIsobaren();
      isobarenLaatstGeslaagd = Date.now();
    } catch (err) {
      noteerIsobarenFout(err);
      console.error('[weer] isobaren poll mislukt:', err.message ?? err);
      // Niet een half uur op de volgende tik wachten: net na een (her)start
      // kan het netwerk even haperen ("fetch failed" om 21:27 op lexdev-nw).
      // Eén herkansing over 2 min; mislukt die ook, dan plant de catch daar
      // weer een nieuwe — effectief elke 2 min tot het lukt, en de gewone
      // 30-min-tik blijft er onafhankelijk naast lopen.
      isobarenHerkansing = setTimeout(ververIsobaren, 2 * 60 * 1000);
    }
  }

  // 2026-08-29: hier heeft een front-/troglagen-feature gestaan (koufront/
  // warmtefront/occlusie, knop "Fronten" op de kaart, tekst geparset uit
  // NWS/WPC's coded surface bulletin ASUS02 KWBC) — gebouwd, getest, en
  // dezelfde dag weer teruggedraaid op verzoek van Lex ("wat er nu is is
  // volstrekt nutteloos"). Reden: die bulletin is volgens NOAA's eigen
  // TIN-document officieel gescoped op "North America and the adjacent
  // oceans" — in de praktijk toonde 'm zelden of nooit een front dat echt in
  // de Noordzee/Scandinavië zelf ligt, alleen af en toe iets bij de verre
  // Atlantische naderingsroute (Kanaal/Golf van Biskaje). De volledige
  // werkende implementatie (incl. twee tekenbugs die onderweg gevonden en
  // gefixt zijn: symbool-afwisseling die per bulletin-regel resette i.p.v.
  // per echt front, en een vaste in plaats van wisselende kleur bij het
  // stationaire front) staat bewaard in commit fa2966e, mocht dit ooit
  // alsnog nuttig blijken (bijvoorbeeld gecombineerd met een andere bron).
  //
  // Kansrijker, nog niet gebouwd alternatief: fronten met kleurherkenning
  // uit KNMI's eigen "AL"-weerkaart trekken (dataplatform.knmi.nl, dataset
  // "Weather maps", CC-BY-4.0 dus vrij te gebruiken). Een losse test op een
  // echte KNMI-kaart (zie de sessie-chat van 2026-08-29) liet zien dat
  // front-kleuren (blauw/rood/paars) zich heel schoon laten isoleren van de
  // isobaren (cyaan) — dat deel is dus aantoonbaar haalbaar. Nog open: (1)
  // de lijn zelf uit dat kleurmasker trekken (de driehoekje/bolletje-
  // symbolen op de lijn versmelten ermee, dus simpel uitdunnen geeft
  // vertakkingen op elk symbool), en (2) georefereren (een gewone
  // screenshot heeft geen zichtbare graad-labels, dus daarvoor is de
  // originele, ongebijgesneden bronafbeelding of bevestigde hoekpunten
  // nodig — zoals de NOAA-KML die destijds gratis gaf). Een apart project,
  // geen quick fix bovenop wat hier stond.

  // 2026-08-21, op verzoek van Lex ("kunnen we een laag flight- en vaarradar
  // toevoegen?") — vaarradar (AIS) is een permanente streaming-verbinding
  // (zie sources/vaarradar.js, zelfde soort opzet als Blitzortung hierboven),
  // dus die start/stopt hier net als Blitzortung, niet via de gewone
  // poll-lus. Geen SourceState/SOURCES-registratie: dit is geen hazard-
  // signaal maar een losse live-verkeerslaag, met eigen /api/vaarradar-route
  // hieronder i.p.v. via /api/signals te lopen.
  let vaarradarFeed = { posities: new Map(), stop: () => {} };
  let vaarradarLokaalFeed = { posities: new Map(), stop: () => {} };

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
    ververDwdFronten();
    timers.push(setInterval(ververDwdFronten, 30 * 60 * 1000));
    // Eerst de schijfcache (zie laadVeldVanSchijf in isobaren.js): een vers
    // veld telt als geslaagde ronde, dan haalt ververIsobaren() niets op.
    laadIsobarenVanSchijf().then((tijdMs) => { isobarenLaatstGeslaagd = tijdMs; return ververIsobaren(); });
    timers.push(setInterval(ververIsobaren, 30 * 60 * 1000));

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
    vaarradarLokaalFeed = startVaarradarLokaalFeed(env);
  }

  function stopPolling() {
    timers.forEach(clearInterval);
    if (stopBlitzortung) stopBlitzortung();
    vaarradarFeed.stop();
    vaarradarLokaalFeed.stop();
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

  // 2026-08-27, trage-kaart-analyse: serveStatic stuurde voorheen géén
  // Cache-Control/ETag en géén compressie — en de service worker (sw.js)
  // haalde de schil met cache: 'no-store' op, dus elke keer dat de app werd
  // geopend ging de volle ~460KB (app.js + styles.css + index.html)
  // ongecomprimeerd over de lijn, concurrerend met de eerste kaarttegels om
  // dezelfde ~6 browserverbindingen. Nu: ETag (uit mtime+grootte, geen
  // hashing van de inhoud nodig) + 'Cache-Control: no-cache' zodat de
  // browser conditioneel mag vragen (304 = leeg antwoord bij ongewijzigd
  // bestand — precies wat je tijdens actieve ontwikkeling wilt: altijd de
  // check, nooit onnodig de bytes), plus gzip voor tekst-bestanden. De
  // gecomprimeerde versie wordt per bestand+ETag in het geheugen bewaard
  // zodat app.js niet bij elke paginalading opnieuw gecomprimeerd wordt.
  // Zie ook de bijbehorende sw.js-wijziging ('no-store' → 'no-cache').
  const COMPRESSIBLE_EXT = new Set(['.html', '.css', '.js', '.json', '.webmanifest', '.svg']);
  const statischGzipCache = new Map(); // filePath -> { etag, gz }

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
      const ext = extname(filePath);
      const etag = `"${s.size.toString(16)}-${Math.round(s.mtimeMs).toString(16)}"`;
      const headers = {
        'Content-Type': MIME[ext] ?? 'application/octet-stream',
        'ETag': etag,
        'Cache-Control': 'no-cache',
        'Vary': 'Accept-Encoding',
      };
      if (req.headers['if-none-match'] === etag) {
        res.writeHead(304, headers);
        return res.end();
      }
      const data = await readFile(filePath);
      if (COMPRESSIBLE_EXT.has(ext) && data.length >= COMPRESSIE_MIN_BYTES && accepteertGzip(req)) {
        let gecached = statischGzipCache.get(filePath);
        if (!gecached || gecached.etag !== etag) {
          gecached = { etag, gz: gzipSync(data) };
          statischGzipCache.set(filePath, gecached);
        }
        headers['Content-Encoding'] = 'gzip';
        headers['Content-Length'] = gecached.gz.length;
        res.writeHead(200, headers);
        return res.end(gecached.gz);
      }
      headers['Content-Length'] = data.length;
      res.writeHead(200, headers);
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
    // 2026-08-27, op verzoek van Lex ("telefoonalarm graag, ook bij de
    // instellingen aan en uit te zetten") — serverbrede telefoonalarm-
    // schakelaars (zie alarmSchakelaars.js). GET voor de Instellingen-tab,
    // POST om er één om te zetten. Bewust een SERVER-instelling: de
    // telefoonalarmen worden door de backend verstuurd, ook zonder open
    // app, dus een localStorage-toggle (zoals het rode alarmscherm) zou
    // hier niets uithalen.
    if (url === '/api/alarm-schakelaars' && req.method !== 'POST') {
      return sendJson(res, 200, { schakelaars: alleSchakelaars() });
    }
    if (url === '/api/alarm-schakelaars' && req.method === 'POST') {
      try {
        const { sleutel, aan } = await readJsonBody(req);
        if (!GELDIGE_SLEUTELS.has(sleutel)) return sendJson(res, 400, { fout: `onbekende schakelaar: ${sleutel}` });
        zetTelefoonAlarm(sleutel, Boolean(aan));
        console.log(`[weer] telefoonalarm-schakelaar '${sleutel}' -> ${aan ? 'AAN' : 'UIT'}`);
        return sendJson(res, 200, { schakelaars: alleSchakelaars() });
      } catch (err) {
        console.error('[weer] /api/alarm-schakelaars mislukt:', err.message ?? err);
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
    // 2026-08-27, op verzoek van Lex ("kan ik de binnenkomende tekst ook
    // tonen in de app?") — de staart van het ruwe NAVTEX-ontvangstbestand
    // (~/navtex_berichten.txt, zie leesRuweOntvangst() in navtexLokaal.js)
    // voor de 📻-viewer. sendJson geeft dit gzip + ETag mee, dus de
    // 10s-autoverversing van de viewer kost bij een ongewijzigd bestand
    // alleen een 304'je.
    if (url === '/api/navtex-ruw') {
      try {
        return sendJson(res, 200, leesRuweOntvangst());
      } catch (err) {
        console.error('[weer] /api/navtex-ruw mislukt:', err.message ?? err);
        return sendJson(res, 500, { fout: 'ruwe ontvangst niet leesbaar' });
      }
    }
    // 2026-08-27 (vervolg): alleen de bestandsgrootte/mtime, voor de
    // AUTO-schakelmonitor ("openen zodra er tekst binnenrolt", keuze van
    // Lex i.v.m. noodberichten die buiten het zendschema om komen) — een
    // kale stat, geen inhoud. Zie ruweOntvangstStatus() in navtexLokaal.js.
    if (url === '/api/navtex-ruw-status') {
      try {
        return sendJson(res, 200, ruweOntvangstStatus());
      } catch (err) {
        console.error('[weer] /api/navtex-ruw-status mislukt:', err.message ?? err);
        return sendJson(res, 500, { fout: 'status niet leesbaar' });
      }
    }
    if (url === '/api/navtex-stations') {
      // 2026-08-28: lat/lon erbij voor de DX-lijst in de app (mastafstand
      // vanaf thuis bepaalt wat "bijzondere ontvangst" is) — zie dxLijst()
      // in app.js.
      return sendJson(res, 200, {
        stations: NAVTEX_STATIONS.map((s) => ({ id: s.id, naam: s.naam, land: s.land, lat: s.lat, lon: s.lon, zendschema: s.zendschema })),
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
    // 2026-08-30: DWD-frontenlaag, zie ververDwdFronten() hierboven. De PNG
    // krijgt de analysetijd als ETag zodat de browser 'm tussen twee
    // analyses uit z'n cache mag halen; -info levert bbox + tijden voor de
    // imageOverlay en het bijschrift in app.js.
    if (url === '/api/fronten-info') {
      const f = huidigeFronten();
      return sendJson(res, 200, f ? { beschikbaar: true, analyseTijd: f.analyseTijd, gepubliceerd: f.gepubliceerd, bijgewerkt: f.bijgewerkt, bbox: f.bbox, breedte: f.breedte, hoogte: f.hoogte } : { beschikbaar: false });
    }
    // 2026-08-30: eigen isobaren (zie ververIsobaren() hierboven). Lijnen als
    // [lat, lon]-polylijnen + H/L-centra, voor het uur dat nu het dichtst bij
    // ligt; de frontend tekent ze zelf (Leaflet-polylines, kleine labels).
    // Bij beschikbaar:false toont de frontend de oude DWD-isobaren als
    // terugval, zodat de laag nooit leeg is.
    if (url === '/api/isobaren') {
      const iso = huidigeIsobaren();
      const status = huidigeIsobarenStatus();
      return sendJson(res, 200, iso ? { beschikbaar: true, ...iso, fout: status.fout } : { beschikbaar: false, fout: status.fout });
    }
    if (url === '/api/fronten-alleen.png') {
      const f = huidigeFronten();
      if (!f?.pngAlleenFronten) { res.writeHead(404); return res.end(); }
      const etag = `"fronten-alleen-${f.bijgewerkt}"`;
      if (req.headers['if-none-match'] === etag) { res.writeHead(304); return res.end(); }
      res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': f.pngAlleenFronten.length, ETag: etag, 'Cache-Control': 'no-cache' });
      return res.end(f.pngAlleenFronten);
    }
    if (url === '/api/fronten-bron.png') {
      const f = huidigeFronten();
      if (!f?.bron) { res.writeHead(404); return res.end(); }
      const etag = `"fronten-bron-${f.bijgewerkt}"`;
      if (req.headers['if-none-match'] === etag) { res.writeHead(304); return res.end(); }
      res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': f.bron.length, ETag: etag, 'Cache-Control': 'no-cache' });
      return res.end(f.bron);
    }
    if (url === '/api/fronten.png') {
      const f = huidigeFronten();
      if (!f) { res.writeHead(404); return res.end(); }
      const etag = `"fronten-${f.bijgewerkt}"`;
      if (req.headers['if-none-match'] === etag) { res.writeHead(304); return res.end(); }
      res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': f.png.length, ETag: etag, 'Cache-Control': 'no-cache' });
      return res.end(f.png);
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
      // 2026-08-31, op verzoek van Lex — eigen ontvangst (RTL-SDR + AIS-catcher,
      // zie sources/vaarradarLokaal.js) krijgt voorrang zodra die posities heeft;
      // aisstream.io (vaarradar.js) blijft als fallback draaien voor het geval
      // lexdev-nw's eigen ontvangst een keer leeg/onbereikbaar is. Zie de
      // EERLIJKE WAARSCHUWING in vaarradar.js voor waarom die zelf structureel
      // leeg kan blijven.
      const lokaalHeeftData = vaarradarLokaalFeed.posities.size > 0;
      const bronPosities = lokaalHeeftData ? vaarradarLokaalFeed.posities : vaarradarFeed.posities;
      const schepen = vaarradarBinnenStraal(bronPosities, lat, lon, straal);
      return sendJson(res, 200, {
        bijgewerkt: new Date().toISOString(),
        schepen,
        bron: lokaalHeeftData ? 'lokaal (RTL-SDR + AIS-catcher)' : 'aisstream.io',
      });
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
    // 2026-08-27, diagnose-hulp (zie tegelStats hierboven): recente
    // tegel-verzoeken met aankomsttijd/duur/bron — op elk toestel te openen
    // als gewone URL, om vanaf de serverkant te zien of trage kaart-opbouw
    // vóór de server zit (verzoeken komen laat binnen) of erin/erachter
    // (verzoeken komen meteen binnen maar duren lang).
    if (url === '/api/tegel-stats') {
      return sendJson(res, 200, { serverNu: new Date().toISOString(), aantal: tegelStats.length, verzoeken: [...tegelStats].reverse() });
    }
    const tegelMatch = url.match(/^\/api\/tegel\/(\d+)\/(\d+)\/(\d+)\.png$/);
    if (tegelMatch) {
      return serveTegel(req, res, tegelMatch[1], tegelMatch[2], tegelMatch[3]);
    }
    // 2026-08-28: EMODnet-dieptetegels voor de zeekaart-look in Zee-modus —
    // zelfde proxy/caches, eigen bron. Zie TEGEL_DIEPTE_BASIS_URL hierboven.
    const tegelDiepteMatch = url.match(/^\/api\/tegel-diepte\/(\d+)\/(\d+)\/(\d+)\.png$/);
    if (tegelDiepteMatch) {
      return serveTegel(req, res, tegelDiepteMatch[1], tegelDiepteMatch[2], tegelDiepteMatch[3], 'diepte');
    }
    const regenradarMatch = url.match(/^\/api\/regenradar\/(.+)$/);
    if (regenradarMatch) {
      return serveRegenradar(req, res, regenradarMatch[1]);
    }

    return serveStatic(req, res);
  });

  // 2026-08-27, iPad-analyse: Node's standaard keepAliveTimeout is maar 5s —
  // elke stilte langer dan dat (en de frontend polt elke 20s) sloot alle
  // browserverbindingen, zodat een volgende klik op de kaart eerst wéér ~6
  // verse TCP-verbindingen moest opzetten vóór er ook maar één tegel kon
  // laden. Ruim boven het 20s-pollritme houdt de verbindingen warm tussen
  // de cycli door; headersTimeout moet daar per Node-documentatie boven
  // blijven liggen.
  server.keepAliveTimeout = 65 * 1000;
  server.headersTimeout = 70 * 1000;

  return { server, startPolling, stopPolling, states };
}
