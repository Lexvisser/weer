// testAlarmKeten.js — Eenmalig, handmatig te draaien testscript om de hele
// onweeralarm-keten (Pushover + mail + webpush) te simuleren, zonder op een
// echt onweercomplex te hoeven wachten (2026-09-16, op verzoek van Lex, na
// een gemiste piep bij een echt onweeralarm).
//
// Draai met (vanuit de projectroot op de server):
//   node backend/scripts/testAlarmKeten.js
//
// Stuurt een duidelijk gemarkeerd TEST-alarm (titel begint met 🧪 TEST) naar
// alle drie de kanalen die aan staan, via dezelfde verstuurfuncties als het
// echte onweeralarm (backend/src/onweerAlarm.js) — verandert verder niets
// aan de app of aan live data. Een kanaal dat uit staat of niet is
// geconfigureerd, logt dat gewoon en slaat zichzelf over (zelfde gedrag als
// bij een echt alarm).
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { stuurAlarm } from '../src/sources/pushover.js';
import { stuurMailAlarm } from '../src/sources/email.js';
import { stuurWebPushAlarm } from '../src/sources/webpush.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Zelfde kleine .env-loader als backend/src/index.js — nodig omdat dit
// script los van de normale serverstart draait.
function loadEnvFile(pad) {
  if (!existsSync(pad)) return;
  const inhoud = readFileSync(pad, 'utf-8');
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

const nu = Date.now();
const titel = '🧪 TEST — Onweeralarm-keten';
const bericht = 'Handmatige test van Pushover/mail/webpush — geen echt onweer.';
const homeLat = process.env.HOME_LAT ? Number(process.env.HOME_LAT) : 52.0907;
const homeLon = process.env.HOME_LON ? Number(process.env.HOME_LON) : 5.1214;

console.log('[test] versturen naar alle drie de kanalen...');
await stuurAlarm({ id: `test-keten-${nu}-pushover`, titel, bericht, prioriteit: 1 });
await stuurMailAlarm({ id: `test-keten-${nu}-mail`, titel, bericht, lat: homeLat, lon: homeLon });
await stuurWebPushAlarm({ id: `test-keten-${nu}-webpush`, titel, bericht, url: '/', lat: homeLat, lon: homeLon });
console.log('[test] klaar — check Pushover-app, Mail en een systeemmelding van de PWA op je telefoon.');
