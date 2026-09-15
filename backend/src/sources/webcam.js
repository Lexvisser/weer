// 2026-09-15, op verzoek van Lex: de webcam "Waterweg-ingang" van
// webcam-hoekvanholland.nl in de app, zonder de site eromheen ("alleen de
// feed"). Eerder in Home Assistant geprobeerd, maar dat liep stuk op een
// verlopend token -- en dat is precies het probleem dat deze module oplost.
//
// Hoe de site het doet (uitgezocht in de browser, 15 sept 2026): de feed is
// een HLS-stream van een Wowza-server (…streamlock.net/hls/hvh3.stream/
// playlist.m3u8), beveiligd met Wowza SecureToken: bij elke paginalaad zet de
// PHP-pagina een gesigneerde playlist-URL in de HTML met
// wowzatokenstarttime/wowzatokenendtime/wowzatokenhash. Zo'n token is ~30
// minuten geldig en de hash is niet zelf te maken (geheime sleutel bij hen).
// Een vaste URL in HA hield het dus een half uur vol.
//
// Aanpak hier:
// 1. Deze module haalt de webcam-PAGINA op, plukt de gesigneerde playlist-URL
//    eruit en onthoudt die. Dat gebeurt bij het opstarten van de server en
//    daarna elke VERVERS_MS op de achtergrond (één kleine pagina-aanvraag,
//    los van of er iemand kijkt) -- zodat de URL altijd al klaarstaat als
//    Lex de webcam opent, zonder wachttijd. Bewust GEEN doorlopende
//    videostream op de achtergrond: dat zou permanent bandbreedte trekken
//    terwijl er maar af en toe kort gekeken wordt.
// 2. Alle stream-aanvragen van de speler (playlist, chunklist, .ts-segmenten)
//    lopen via /api/webcam/<id>/… door deze proxy naar Wowza. Het token
//    blijft zo in de backend, en CORS speelt niet (zelfde origin als de app).
//    Wowza's playlist verwijst RELATIEF naar de chunklist en de chunklist
//    relatief naar de segmenten, en die bestandsnamen bevatten het token al
//    (chunklist_w…_tk<base64>.m3u8 / media_w…_tk<base64>_<n>.ts) -- alleen
//    de eerste aanvraag (playlist.m3u8) heeft de query-string nodig.
// 3. Verloopt het token TIJDENS het kijken (zeldzaam, want kort kijken),
//    dan weigert Wowza de chunklist; hls.js in de frontend herstart dan de
//    speler, die opnieuw playlist.m3u8 ophaalt -- en die is hier inmiddels
//    al vernieuwd.
import { Readable } from 'node:stream';

const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) WeerApp/1.0 (persoonlijk zelfgehost hobbyproject)';
const PAGINA_TIMEOUT_MS = 15_000;
const STREAM_TIMEOUT_MS = 20_000;
export const VERVERS_MS = 20 * 60 * 1000; // token is ~31 min geldig; 20 min houdt ruime marge
const HERPROBEER_MS = 60 * 1000; // na een mislukte pagina-fetch
const MARGE_VOOR_VERLOPEN_MS = 3 * 60 * 1000; // korter dan dit geldig bij een aanvraag -> eerst vernieuwen

// id -> { pagina, streamPatroon }. streamPatroon: de gesigneerde playlist-URL
// zoals die letterlijk in de pagina-HTML staat (met query-string).
// 15 sept 2026, tweede ronde ("ja allebei"): Berghaven en Waterweg-draaibaar
// erbij -- zelfde Wowza-server, streams hvh1 en hvh3a. De vierde camera van de
// site (Strand) gebruikt geen HLS-stream en is daarom niet opgenomen.
export const WEBCAMS = {
  hvh: {
    naam: 'Hoek van Holland – Waterweg-ingang',
    pagina: 'https://webcam-hoekvanholland.nl/pages/cameras/waterweg-ingang.php',
    streamPatroon: /https:\/\/[^"'\s<>]+\/hvh3\.stream\/playlist\.m3u8\?[^"'\s<>]+/,
  },
  berghaven: {
    naam: 'Hoek van Holland – Berghaven',
    pagina: 'https://webcam-hoekvanholland.nl/pages/cameras/berghaven.php',
    streamPatroon: /https:\/\/[^"'\s<>]+\/hvh1\.stream\/playlist\.m3u8\?[^"'\s<>]+/,
  },
  draaibaar: {
    naam: 'Hoek van Holland – Waterweg-draaibaar',
    pagina: 'https://webcam-hoekvanholland.nl/pages/cameras/waterweg-hvh.php',
    streamPatroon: /https:\/\/[^"'\s<>]+\/hvh3a\.stream\/playlist\.m3u8\?[^"'\s<>]+/,
  },
};

// id -> { playlistUrl, basisUrl, eindtijdMs, opgehaaldMs, fout }
const toestand = new Map();
const bezig = new Map(); // id -> Promise (dedupe van gelijktijdige verversingen)
let timer = null;

function ontcijferHtml(s) {
  return s.replace(/&amp;/g, '&').replace(/&#38;/g, '&');
}

async function ververs(id) {
  const lopend = bezig.get(id);
  if (lopend) return lopend;
  const cam = WEBCAMS[id];
  const p = (async () => {
    try {
      const res = await fetch(cam.pagina, {
        headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html' },
        signal: AbortSignal.timeout(PAGINA_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`pagina gaf HTTP ${res.status}`);
      const html = await res.text();
      const m = html.match(cam.streamPatroon);
      if (!m) throw new Error('geen gesigneerde playlist-URL in de pagina gevonden (site gewijzigd?)');
      const playlistUrl = ontcijferHtml(m[0]);
      const u = new URL(playlistUrl);
      const eind = Number(u.searchParams.get('wowzatokenendtime'));
      const eindtijdMs = Number.isFinite(eind) && eind > 0 ? eind * 1000 : Date.now() + VERVERS_MS;
      const basisUrl = u.origin + u.pathname.replace(/playlist\.m3u8$/, '');
      toestand.set(id, { playlistUrl, basisUrl, eindtijdMs, opgehaaldMs: Date.now(), fout: null });
      console.log(`[weer] webcam ${id}: nieuw token, geldig tot ${new Date(eindtijdMs).toISOString()}`);
    } catch (err) {
      const oud = toestand.get(id);
      toestand.set(id, { ...(oud ?? {}), fout: err.message ?? String(err), foutMs: Date.now() });
      console.error(`[weer] webcam ${id}: token ophalen mislukt: ${err.message ?? err}`);
      setTimeout(() => ververs(id).catch(() => {}), HERPROBEER_MS).unref?.();
    }
  })().finally(() => bezig.delete(id));
  bezig.set(id, p);
  return p;
}

export function startWebcams() {
  for (const id of Object.keys(WEBCAMS)) ververs(id).catch(() => {});
  timer = setInterval(() => {
    for (const id of Object.keys(WEBCAMS)) ververs(id).catch(() => {});
  }, VERVERS_MS);
  timer.unref?.();
}

export function stopWebcams() {
  if (timer) clearInterval(timer);
  timer = null;
}

export function webcamStatus() {
  const nu = Date.now();
  return Object.fromEntries(Object.keys(WEBCAMS).map((id) => {
    const t = toestand.get(id);
    return [id, {
      naam: WEBCAMS[id].naam,
      klaar: Boolean(t?.playlistUrl),
      geldigNogSec: t?.eindtijdMs ? Math.max(0, Math.round((t.eindtijdMs - nu) / 1000)) : null,
      opgehaald: t?.opgehaaldMs ? new Date(t.opgehaaldMs).toISOString() : null,
      fout: t?.fout ?? null,
    }];
  }));
}

// Proxy voor GET /api/webcam/<id>/<pad>. pad: 'playlist.m3u8', of een
// chunklist/segment-bestandsnaam uit Wowza's eigen playlists.
export async function serveWebcam(req, res, id, pad) {
  const cam = WEBCAMS[id];
  if (!cam) {
    res.writeHead(404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ fout: `onbekende webcam: ${id}` }));
    return;
  }
  // Alleen kale bestandsnamen zoals Wowza ze uitgeeft -- geen paden, geen query.
  if (!/^[A-Za-z0-9_\-=.]+$/.test(pad) || pad.includes('..')) {
    res.writeHead(400, { 'Cache-Control': 'no-store' }).end();
    return;
  }

  let t = toestand.get(id);
  if (!t?.playlistUrl || t.eindtijdMs - Date.now() < MARGE_VOOR_VERLOPEN_MS) {
    await ververs(id);
    t = toestand.get(id);
  }
  if (!t?.playlistUrl) {
    res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      .end(JSON.stringify({ fout: t?.fout ?? 'webcam-token nog niet beschikbaar' }));
    return;
  }

  const upstreamUrl = pad === 'playlist.m3u8' ? t.playlistUrl : t.basisUrl + pad;
  try {
    const upstream = await fetch(upstreamUrl, {
      headers: { 'User-Agent': USER_AGENT, 'Referer': cam.pagina, 'Origin': new URL(cam.pagina).origin },
      signal: AbortSignal.timeout(STREAM_TIMEOUT_MS),
    });
    if (!upstream.ok || !upstream.body) {
      // 403/404 op de chunklist = token verlopen bij Wowza; meteen een verse
      // halen zodat de herstart van de speler direct slaagt.
      if (upstream.status === 403 || upstream.status === 404) ververs(id).catch(() => {});
      res.writeHead(upstream.status === 200 ? 502 : upstream.status, { 'Cache-Control': 'no-store' }).end();
      return;
    }
    const isPlaylist = pad.endsWith('.m3u8');
    const headers = {
      'Content-Type': upstream.headers.get('content-type') ?? (isPlaylist ? 'application/vnd.apple.mpegurl' : 'video/mp2t'),
      'Cache-Control': 'no-store',
    };
    // Bewust GEEN Content-Length doorgeven: Wowza stuurt de playlists gzip'd en
    // Node's fetch pakt die transparant uit, dus upstream's Content-Length is
    // de GECOMPRIMEERDE lengte -- doorgeven knipte de playlist af (live
    // gezien op 15 sept 2026: chunklist-regel zonder '.m3u8'). Chunked is prima.
    res.writeHead(200, headers);
    const body = Readable.fromWeb(upstream.body);
    body.on('error', () => { if (!res.writableEnded) res.destroy(); });
    res.on('close', () => body.destroy());
    body.pipe(res);
  } catch (err) {
    if (err.name !== 'AbortError') console.error(`[weer] webcam ${id}: proxy mislukt (${pad}): ${err.message ?? err}`);
    if (!res.headersSent) res.writeHead(502, { 'Cache-Control': 'no-store' }).end();
    else res.destroy();
  }
}
