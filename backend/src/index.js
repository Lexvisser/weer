import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { networkInterfaces } from 'node:os';
import { createApp } from './server.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Kleine handmatige .env-loader — geen extra dependency nodig voor zoiets simpels.
function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const inhoud = readFileSync(path, 'utf-8');
  for (const regel of inhoud.split('\n')) {
    const trimmed = regel.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(join(__dirname, '..', '.env'));

const env = {
  port: Number(process.env.PORT ?? 4780),
  homeLat: process.env.HOME_LAT ? Number(process.env.HOME_LAT) : 52.0907,
  homeLon: process.env.HOME_LON ? Number(process.env.HOME_LON) : 5.1214,
  homeLabel: process.env.HOME_LABEL ?? 'Thuis',
  knmiApiKey: process.env.KNMI_API_KEY ?? '',
  nasaApiKey: process.env.NASA_API_KEY ?? 'DEMO_KEY',
  meteogateApiKey: process.env.METEOGATE_API_KEY ?? '',
  // 2026-08-21, op verzoek van Lex — "vaarradar"-kaartlaag (live scheeps-
  // posities via AIS, zie sources/vaarradar.js). Zonder sleutel blijft die
  // laag gewoon leeg, de rest van de app werkt door.
  // .trim() erbij (2026-08-21, tijdens vaarradar-livedebug): een
  // .env-regel die per ongeluk een spatie/tab/CRLF-restant achter de
  // sleutel heeft staan zou anders een ongeldige sleutel opleveren zonder
  // dat dat ergens zichtbaar is — aisstream.io antwoordt daar niet met een
  // duidelijke foutmelding op, de verbinding blijft gewoon "stil" open.
  aisstreamApiKey: (process.env.AISSTREAM_API_KEY ?? '').trim(),
  // 2026-08-22, op verzoek van Lex — Web Push (zie sources/webpush.js) als
  // eigen, niet-storend PWA-alarmkanaal naast Pushover. De publieke sleutel
  // is (per ontwerp van VAPID) niet geheim — mag gewoon naar de frontend via
  // /api/config, zie server.js.
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? '',
  frontendDir: join(__dirname, '..', '..', 'frontend'),
};

// Handig lijstje van dit apparaat z'n eigen LAN-IP's — zodat je vanaf een
// ander toestel (bijv. iPhone op hetzelfde wifi-netwerk) meteen weet welk
// adres je in Safari moet intikken i.p.v. "localhost" (dat werkt alleen op
// dit apparaat zelf).
function lanAdressen() {
  const adressen = [];
  for (const interfaces of Object.values(networkInterfaces())) {
    for (const iface of interfaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) adressen.push(iface.address);
    }
  }
  return adressen;
}

const { server, startPolling } = createApp(env);

// Expliciet op alle netwerkinterfaces binden (niet alleen localhost) — nodig
// om vanaf je iPhone/iPad bij deze service te kunnen, of dat nu via hetzelfde
// wifi-netwerk is of straks via Tailscale.
server.listen(env.port, '0.0.0.0', () => {
  console.log(`[weer] aggregator-service draait op http://localhost:${env.port} (alleen dit apparaat)`);
  for (const ip of lanAdressen()) {
    console.log(`[weer] vanaf een ander toestel op hetzelfde netwerk: http://${ip}:${env.port}`);
  }
  console.log(`[weer] frontend wordt meegeserveerd vanaf ${env.frontendDir}`);
  console.log('[weer] eenmaal in je tailnet: bereikbaar op je Tailscale-hostnaam op dezelfde poort.');
  startPolling();
});
