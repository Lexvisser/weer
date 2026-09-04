// 2026-09-04, op verzoek van Lex ("een extra alarm voor als een onweer bij
// mij in de buurt komt"): telefoonalarm zodra een Blitzortung-onweercomplex
// (zie sources/blitzortung.js, bouwSignalen()) NADEREND is en binnen
// ONWEER_ALARM_KM van huis zit, of al 'actief' is (binnen ACTIEF_AFSTAND_KM
// daar). Zelfde drie kanalen als de andere alarmen (Pushover/mail/webpush)
// en de serverbrede schakelaar 'onweer' (alarmSchakelaars.js).
//
// Dedup wijkt af van navtexNoodAlarm.js: de complex-id is grofmazig
// (positie afgerond op 0,5°) en verspringt dus terwijl het complex naar je
// toe trekt -- puur op id dedupliceren zou bij elke stap opnieuw alarmeren,
// en andersom zou hetzelfde complex dat een uur later WEER nadert nooit
// meer mogen. Daarom: één alarm per HERHAAL_MS voor de hele buurt (in
// geheugen, niet op schijf -- na een herstart mag het gewoon opnieuw), en
// een unieke id per verzending zodat de schijf-dedup van pushover/mail/
// webpush niet in de weg zit.
import { stuurAlarm } from './sources/pushover.js';
import { stuurMailAlarm } from './sources/email.js';
import { stuurWebPushAlarm } from './sources/webpush.js';
import { telefoonAlarmAan, pushAlarmAan, mailAlarmAan } from './alarmSchakelaars.js';

export const ONWEER_ALARM_KM = 50;
const HERHAAL_MS = 45 * 60 * 1000;

let laatsteAlarmMs = 0;

// Zelfde regel voor backend (telefoon) en frontend (scherm, zie
// magAlarmeren() in app.js): detail.alarm wordt hier op het signaal gezet
// zodat de frontend niet zelf hoeft te weten wat de drempel is.
export function onweerVerdientAlarm(s) {
  if (s?.categorie !== 'onweercomplex') return false;
  const { status, afstandKm } = s.detail ?? {};
  if (status === 'actief') return true;
  return status === 'naderend' && typeof afstandKm === 'number' && afstandKm <= ONWEER_ALARM_KM;
}

export function meldOnweerNaderend(signalen) {
  if (!Array.isArray(signalen)) return signalen;
  for (const s of signalen) {
    if (!onweerVerdientAlarm(s)) continue;
    s.detail.alarm = true;
  }
  if (!telefoonAlarmAan('onweer')) return signalen;
  const nu = Date.now();
  if (nu - laatsteAlarmMs < HERHAAL_MS) return signalen;
  // Dichtstbijzijnde complex dat het alarm verdient bepaalt de tekst.
  const kandidaten = signalen.filter(onweerVerdientAlarm).sort((a, b) => a.detail.afstandKm - b.detail.afstandKm);
  const s = kandidaten[0];
  if (!s) return signalen;
  laatsteAlarmMs = nu;
  const id = `onweer-nadert-${s.id}-${nu}`;
  const plaats = s.detail.plaats ? ` bij ${s.detail.plaats}` : '';
  const titel = s.detail.status === 'actief' ? `⚡ Onweer boven je (${s.detail.afstandKm} km)` : `⚡ Onweer nadert - nog ${s.detail.afstandKm} km`;
  const bericht = `Onweercomplex${plaats}, ${s.detail.aantalFlitsenLaatsteHalfUur ?? '?'} flitsen in het laatste half uur, ${s.detail.afstandKm} km van huis (${s.detail.status}).`;
  console.log(`[weer] onweeralarm: ${titel}`);
  if (pushAlarmAan('onweer')) stuurAlarm({ id, titel, bericht, prioriteit: 1 });
  if (mailAlarmAan('onweer')) stuurMailAlarm({ id, titel, bericht, lat: s.lat, lon: s.lon });
  if (pushAlarmAan('onweer')) stuurWebPushAlarm({ id, titel, bericht, url: `/?signaal=${encodeURIComponent(s.id)}`, lat: s.lat, lon: s.lon });
  return signalen;
}
