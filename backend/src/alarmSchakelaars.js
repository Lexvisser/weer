// alarmSchakelaars.js — serverbrede aan/uit-schakelaars voor telefoonalarmen
// (Pushover/mail/webpush). Aanleiding (2026-08-27): Lex wilde bij de nieuwe
// wereldwijde tsunami-dekking (ptwc.js + gdacs TS + nws tsunami) ook een
// telefoonalarm, "ook bij de instellingen aan en uit te zetten".
//
// Waarom een SERVER-instelling en niet de bestaande client-side
// alarmInstellingen (localStorage, zie app.js): die localStorage-toggles
// bepalen alleen of het rode alarmscherm op DAT toestel verschijnt. Een
// telefoonalarm wordt door de backend verstuurd, ook als er nergens een app
// open staat — de schakelaar moet dus op de server leven, en geldt daarmee
// vanzelf voor alle toestellen tegelijk.
//
// Zelfde persistentie-patroon als historie.js: JSON-bestandje in data/
// (overleeft syncweer-herstarts), fire-and-forget schrijven, overal
// try/catch — een kapot/ontbrekend bestand betekent gewoon "alles op
// standaard (AAN)", nooit een crash.
//
// Generiek opgezet (sleutel -> boolean) zodat toekomstige telefoonalarm-
// schakelaars hier gratis bij kunnen; GELDIGE_SLEUTELS is de whitelist die
// de API-route gebruikt zodat de frontend geen willekeurige sleutels kan
// aanmaken. Ontbrekende sleutel = AAN (zelfde "default aan"-conventie als de
// client-side alarmInstellingen).
import { readFileSync, mkdirSync, existsSync, writeFile } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BESTAND = join(__dirname, '..', 'data', 'alarmSchakelaars.json');

// 2026-09-03, op verzoek van Lex ("gelijktrekken"): één telefoonalarm-
// schakelaar per categorie, met dezelfde sleutels als de categorie-ids die
// het scherm-alarm in app.js gebruikt (ALARM_RIJEN daar). Ontbrekend = AAN.
export const GELDIGE_SLEUTELS = new Set([
  'tornado', 'tornado-watch', 'tsunami', 'tsunami-watch', 'weerwaarschuwing',
  'stormvloedkering-waarschuwing', 'stormvloedkering-gesloten', 'ais-nood', 'navtex-nood',
]);

let schakelaars = {};
try {
  if (existsSync(BESTAND)) {
    const ruw = JSON.parse(readFileSync(BESTAND, 'utf-8'));
    if (ruw && typeof ruw === 'object') schakelaars = ruw;
  }
} catch (err) {
  console.error('[weer] alarmSchakelaars: bestand niet leesbaar, standaardwaarden (alles AAN):', err.message ?? err);
}

function bewaar() {
  try {
    mkdirSync(dirname(BESTAND), { recursive: true });
    writeFile(BESTAND, JSON.stringify(schakelaars), (err) => {
      if (err) console.error('[weer] alarmSchakelaars: opslaan mislukt:', err.message ?? err);
    });
  } catch (err) {
    console.error('[weer] alarmSchakelaars: opslaan mislukt:', err.message ?? err);
  }
}

// 2026-09-03, Lex: "mail apart is wel beter te onthouden" -- per categorie
// twee losse schakelaars: '<cat>' = browsermelding (webpush; Pushover lift
// mee maar staat via .env uit), '<cat>/mail' = mail. Ontbrekend = AAN.
// telefoonAlarmAan() = "minstens één kanaal aan" -- de bronnen gebruiken 'm
// als buitenste guard en kiezen daarbinnen per kanaal met pushAlarmAan()/
// mailAlarmAan().
export function pushAlarmAan(sleutel) {
  return schakelaars[sleutel] !== false;
}
export function mailAlarmAan(sleutel) {
  return schakelaars[`${sleutel}/mail`] !== false;
}
export function telefoonAlarmAan(sleutel) {
  return pushAlarmAan(sleutel) || mailAlarmAan(sleutel);
}

export function zetTelefoonAlarm(sleutel, aan) {
  if (!GELDIGE_SLEUTELS.has(String(sleutel).replace(/\/mail$/, ''))) return false;
  schakelaars = { ...schakelaars, [sleutel]: Boolean(aan) };
  bewaar();
  return true;
}

// Voor GET /api/alarm-schakelaars: altijd alle bekende sleutels teruggeven
// (met hun effectieve waarde), ook als het bestand nog leeg is — dan hoeft
// de frontend geen eigen defaults te kennen.
export function alleSchakelaars() {
  const uit = {};
  for (const sleutel of GELDIGE_SLEUTELS) uit[sleutel] = telefoonAlarmAan(sleutel);
  return uit;
}
