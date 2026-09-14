// wsVaarradar.js — 14 sept 2026, stap 1 van het samenbrengen van Baken (het
// losse proefproject, zie baken-status.md) met de weer-app: hetzelfde
// snapshot+delta-WebSocket-protocol dat in Baken bewezen is tot 250.000+
// schepen tegelijk, hier overgezet naar de levende weer-app-code.
//
// BEWUST NAAST de bestaande /api/vaarradar-pollingroute gezet, niet erin/
// erover heen: die route (en de frontend die 'm nu gebruikt) blijft intact en
// werkend zolang stap 2 (de frontend omzetten naar dit WS-kanaal) nog niet
// gebouwd is. Dit bestand op zich verandert dus nog NIETS aan wat je nu op
// je scherm ziet -- het is puur een nieuw, nog ongebruikt kanaal.
//
// 1-op-1 hetzelfde ontwerp als Baken's backend/src/wsServer.js, met twee
// verschillen (weer-app heeft geen testvloot/GFW-bron, dus die vervallen
// hier):
//   - geen testFeed/gfwFeed-regels in de merge (dat blijft aan de aanroeper,
//     zie getMerged hieronder -- vergelijkbaar met de merge die /api/
//     vaarradar zelf al doet in server.js);
//   - geen ws-metingen.csv-instrumentatie (die 0-meting was Baken-specifiek
//     onderzoek, hier niet nodig).
import { WebSocketServer, WebSocket } from 'ws';

const PING_INTERVAL_MS = 30 * 1000;

// Zelfde twee-drempel-hysterese als Baken (zie wsServer.js daar voor de
// volledige uitleg): voorkomt dat op-en-neer zoomen rond één grens telkens
// een volledige herzending triggert.
const ZOOM_DETAIL_OMHOOG = 9;
const ZOOM_DETAIL_OMLAAG = 7;

// Basisvelden voor een simpel stipje; de rest (snelheid/bestemming/diepgang/
// reisvoortgang/etc.) komt er pas bij vanaf ZOOM_DETAIL_OMHOOG. Zelfde velden
// als Baken's beknoptSchip() -- de onderliggende schepen-objecten hebben hier
// dezelfde vorm, want vaarradarLokaal.js/vaarradarAishub.js zijn 1-op-1
// dezelfde bestanden.
function beknoptSchip(s) {
  const { mmsi, naam, lat, lon, koersGraden, scheepscategorie, bron, tijdMs } = s;
  return { mmsi, naam, lat, lon, koersGraden, scheepscategorie, bron, tijdMs };
}
function velden(s, gedetailleerd) {
  return gedetailleerd ? s : beknoptSchip(s);
}

function afstandKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function binnenStraal(merged, lat, lon, straalKm) {
  const resultaat = new Map();
  for (const p of merged.values()) {
    if (afstandKm(lat, lon, p.lat, p.lon) <= straalKm) resultaat.set(p.mmsi, p);
  }
  return resultaat;
}

// Zelfde principe als Baken: tijdMs buiten de wijzigingsvergelijking houden,
// anders telt elke AISHub-poll (die altijd een vers tijdMs meegeeft) als een
// "wijziging" ook als er verder niets veranderd is.
function ongewijzigd(a, b) {
  if (!a || !b) return false;
  const { tijdMs: _tijdA, ...restA } = a;
  const { tijdMs: _tijdB, ...restB } = b;
  return JSON.stringify(restA) === JSON.stringify(restB);
}

function stuur(ws, bericht) {
  const json = JSON.stringify(bericht);
  if (ws.readyState === WebSocket.OPEN) ws.send(json);
  return Buffer.byteLength(json);
}

export function maakVaarradarWs(httpServer, { pad = '/ws/vaarradar', getMerged, tickMs = 1000, log = () => {} }) {
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });
  const clients = new Set(); // { ws, lat, lon, straal, zoom, gedetailleerd, verzonden: Map<mmsi, schip>, alive }

  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== pad) return; // niet voor ons -- andere upgrade-listeners (nu nog geen) mogen het proberen
    const latRuw = url.searchParams.get('lat');
    const lonRuw = url.searchParams.get('lon');
    const lat = latRuw === null ? NaN : Number(latRuw);
    const lon = lonRuw === null ? NaN : Number(lonRuw);
    const straal = Math.min(20000, Math.max(1, Number(url.searchParams.get('straal')) || 250));
    const zoomRuw = url.searchParams.get('zoom');
    const zoom = zoomRuw === null || !Number.isFinite(Number(zoomRuw)) ? ZOOM_DETAIL_OMHOOG : Number(zoomRuw);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, { lat, lon, straal, zoom }));
  });

  wss.on('connection', (ws, { lat, lon, straal, zoom }) => {
    const client = { ws, lat, lon, straal, zoom, gedetailleerd: zoom >= ZOOM_DETAIL_OMHOOG, verzonden: new Map(), alive: true };
    clients.add(client);
    log(`client verbonden (lat=${lat}, lon=${lon}, straal=${straal}km, zoom=${zoom}) -- ${clients.size} actief.`);

    const zichtbaar = binnenStraal(getMerged(), lat, lon, straal);
    client.verzonden = zichtbaar;
    const schepen = [...zichtbaar.values()].map((s) => velden(s, client.gedetailleerd));
    stuur(ws, { type: 'snapshot', tijd: new Date().toISOString(), aantal: zichtbaar.size, schepen });

    ws.on('message', (data) => {
      let bericht;
      try {
        bericht = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (bericht?.type === 'zoom' && Number.isFinite(bericht.zoom)) {
        client.zoom = bericht.zoom;
        let nieuwGedetailleerd = client.gedetailleerd;
        if (client.zoom >= ZOOM_DETAIL_OMHOOG) nieuwGedetailleerd = true;
        else if (client.zoom <= ZOOM_DETAIL_OMLAAG) nieuwGedetailleerd = false;
        if (nieuwGedetailleerd !== client.gedetailleerd) {
          client.gedetailleerd = nieuwGedetailleerd;
          client.verzonden = new Map();
        }
      }
    });

    ws.on('pong', () => { client.alive = true; });
    ws.on('close', (code, reden) => {
      clients.delete(client);
      log(`client verbroken (code ${code}${reden?.length ? ', reden: ' + reden : ''}) -- ${clients.size} actief.`);
    });
    ws.on('error', (err) => log(`client-fout: ${err.stack ?? err.message}`));
  });

  function tick() {
    if (clients.size === 0) return;
    const merged = getMerged();
    for (const client of clients) {
      const zichtbaar = binnenStraal(merged, client.lat, client.lon, client.straal);
      const toegevoegd = [];
      const gewijzigd = [];
      const verwijderd = [];
      for (const [mmsi, s] of zichtbaar) {
        const vorige = client.verzonden.get(mmsi);
        if (!vorige) toegevoegd.push(velden(s, client.gedetailleerd));
        else if (!ongewijzigd(vorige, s)) gewijzigd.push(velden(s, client.gedetailleerd));
      }
      for (const mmsi of client.verzonden.keys()) {
        if (!zichtbaar.has(mmsi)) verwijderd.push(mmsi);
      }
      client.verzonden = zichtbaar;
      if (toegevoegd.length || gewijzigd.length || verwijderd.length) {
        stuur(client.ws, { type: 'delta', tijd: new Date().toISOString(), toegevoegd, gewijzigd, verwijderd });
      }
    }
  }

  const tickTimer = setInterval(tick, tickMs);

  // Zelfde keepalive-principe als Baken: een dode verbinding (dichtgeklapte
  // telefoon, geen nette close) ruimt zichzelf op i.p.v. voor altijd
  // "verbonden" te tellen.
  const pingTimer = setInterval(() => {
    for (const client of clients) {
      if (!client.alive) {
        client.ws.terminate();
        continue;
      }
      client.alive = false;
      client.ws.ping();
    }
  }, PING_INTERVAL_MS);

  return {
    aantalClients: () => clients.size,
    stop: () => {
      clearInterval(tickTimer);
      clearInterval(pingTimer);
      for (const client of clients) client.ws.terminate();
      wss.close();
    },
  };
}
