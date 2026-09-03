// 2026-09-03, op verzoek van Lex ("maak die navtex nood"): telefoonalarm voor
// NAVTEX-noodberichten (berichttype D: SAR/opsporing-redding, piraterij,
// tsunami/natuurrampen), zelfde drie kanalen en dedup als de andere alarmen
// (Pushover/mail/webpush, id = signaal-id, dus één keer per bericht, ook
// over herstarts heen) en de serverbrede schakelaar 'navtex-nood'
// (alarmSchakelaars.js). Aangeroepen vanuit beide NAVTEX-bronnen
// (navtexLokaal.js = eigen ontvangst, navtex.js = online lijst) op de
// signalen die ze teruggeven; alle andere berichttypes (boeien, platforms,
// weer) blijven stil -- die zijn routine. Prioriteit 2 (emergency) binnen
// NOOD_EMERGENCY_KM, anders 1.
import { stuurAlarm, kaartTekst } from './sources/pushover.js';
import { stuurMailAlarm } from './sources/email.js';
import { stuurWebPushAlarm } from './sources/webpush.js';
import { telefoonAlarmAan, pushAlarmAan, mailAlarmAan } from './alarmSchakelaars.js';

const NOOD_EMERGENCY_KM = 100;
// Geen alarm voor een oud bericht dat bij (her)start voor het eerst langskomt
// (de NAVTEX-lijsten bevatten berichten van dagen oud) -- alleen berichten
// jonger dan dit venster tellen; de dedup houdt daarna herhaling tegen.
const MAX_LEEFTIJD_MS = 24 * 3600 * 1000;

export function meldNavtexNood(signalen) {
  if (!Array.isArray(signalen) || !telefoonAlarmAan('navtex-nood')) return signalen;
  for (const s of signalen) {
    if (s?.categorie !== 'navtex' || !s.detail?.noodbericht) continue;
    const tijdMs = Date.parse(s.tijd ?? '');
    if (Number.isFinite(tijdMs) && Date.now() - tijdMs > MAX_LEEFTIJD_MS) continue;
    const titel = `🆘 NAVTEX noodbericht (${s.detail.station ?? 'NAVTEX'})`;
    const bericht = kaartTekst(s);
    const afstand = s.detail.afstandTotJouKm;
    const prioriteit = typeof afstand === 'number' && afstand <= NOOD_EMERGENCY_KM ? 2 : 1;
    if (pushAlarmAan('navtex-nood')) stuurAlarm({ id: s.id, titel, bericht, prioriteit });
    if (mailAlarmAan('navtex-nood')) stuurMailAlarm({ id: s.id, titel, bericht, lat: s.lat, lon: s.lon });
    if (pushAlarmAan('navtex-nood')) stuurWebPushAlarm({ id: s.id, titel, bericht, url: `/?signaal=${encodeURIComponent(s.id)}`, lat: s.lat, lon: s.lon });
  }
  return signalen;
}
