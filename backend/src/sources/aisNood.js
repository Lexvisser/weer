// 2026-09-03, op verzoek van Lex ("er is zoiets als een AIS-noodalarm, klopt
// dat? Dan zouden we dat met de standaard alarmen mee kunnen nemen"):
// AIS-noodsignalen uit de gemergde scheepsposities (eigen ontvanger + AISHub,
// zie server.js) als echte signalen in de alarmpijplijn.
//
// Wat telt als noodsignaal (ITU-R M.1371 / IEC 61097-14):
//   - navigatiestatus 14 = "AIS-SART actief" -- uitgezonden door AIS-SART-
//     reddingsbakens, MOB-zenders (man overboord) en EPIRB-AIS, én door een
//     gewoon schip waarvan de bemanning de status handmatig op 14 zet.
//     Een SART in TESTMODUS zendt bewust status 15 uit, dus 14 is echt.
//   - MMSI-prefix 970 (AIS-SART), 972 (MOB), 974 (EPIRB-AIS): zo'n zender
//     bestaat alleen om nood te melden. Zonder status 15 (test) nemen we 'm
//     mee, ook als de status ontbreekt (AISHub geeft NAVSTAT niet altijd).
// Berichttype 14 (tekst "SART ACTIVE"/"MOB ACTIVE") zit niet in de
// schepenlijst van AIS-catcher/AISHub en wordt hier bewust niet gebruikt.
//
// Alarm: Pushover (emergency-prioriteit 2 binnen NOOD_EMERGENCY_KM, anders
// high), mail en webpush -- zelfde drie kanalen en dezelfde dedup als
// ptwc.js/gdacs.js; serverbrede schakelaar 'ais-nood' (alarmSchakelaars.js).
// Het signaal-id bevat de dag van eerste waarneming, zodat dezelfde zender na
// een nieuwe activering (andere dag) opnieuw alarmeert.
import { makeSignal, afstandKm } from '../normalize.js';
import { stuurAlarm, kaartTekst } from './pushover.js';
import { stuurMailAlarm } from './email.js';
import { stuurWebPushAlarm } from './webpush.js';
import { telefoonAlarmAan } from '../alarmSchakelaars.js';

const NOOD_EMERGENCY_KM = 50;
const VERGEET_NA_MS = 60 * 60 * 1000; // zender een uur niet meer gezien -> signaal weg
const NOOD_STATUS = 14;
const TEST_STATUS = 15;
const ZENDER_TYPE = { 970: 'AIS-SART reddingsbaken', 972: 'MOB-zender (man overboord)', 974: 'EPIRB-AIS noodbaken' };

const eersteWaarneming = new Map(); // mmsi -> { tijdMs, laatstMs }

export function isAisNood(s) {
  if (s.status === NOOD_STATUS) return true;
  const prefix = Number(String(s.mmsi ?? '').slice(0, 3));
  return ZENDER_TYPE[prefix] != null && s.status !== TEST_STATUS;
}

function dagstempel(ms) {
  return new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');
}

export function fetchAisNood({ posities, homeLat, homeLon }) {
  const nu = Date.now();
  const signalen = [];
  for (const s of posities) {
    if (!isAisNood(s) || typeof s.lat !== 'number' || typeof s.lon !== 'number') continue;
    let w = eersteWaarneming.get(s.mmsi);
    if (!w || nu - w.laatstMs > VERGEET_NA_MS) {
      w = { tijdMs: s.tijdMs ?? nu, laatstMs: nu };
      eersteWaarneming.set(s.mmsi, w);
    }
    w.laatstMs = nu;

    const prefix = Number(String(s.mmsi).slice(0, 3));
    const zender = ZENDER_TYPE[prefix] ?? 'schip met noodstatus (AIS status 14)';
    const naam = s.naam || `MMSI ${s.mmsi}`;
    const afstand = afstandKm(homeLat, homeLon, s.lat, s.lon);
    const id = `ais-nood-${s.mmsi}-${dagstempel(w.tijdMs)}`;
    const regels = [
      zender,
      `${afstand} km van jou`,
      typeof s.snelheidKn === 'number' ? `${Math.round(s.snelheidKn * 10) / 10} kn` : null,
      s.bron === 'lokaal' ? 'eigen ontvanger' : s.bron === 'aishub' ? 'via AISHub' : null,
    ].filter(Boolean);
    const signaal = makeSignal({
      id,
      categorie: 'ais-nood',
      titel: `AIS-noodsignaal - ${naam}`,
      ernst: 'kritiek',
      lat: s.lat,
      lon: s.lon,
      tijd: new Date(w.tijdMs).toISOString(),
      detail: {
        subtitel: regels.join(' · '),
        mmsi: s.mmsi,
        zender,
        afstandKm: afstand,
        bron: s.bron ?? null,
        laatstGezien: new Date(s.tijdMs ?? nu).toISOString(),
      },
    });
    signalen.push(signaal);

    if (telefoonAlarmAan('ais-nood')) {
      const alarmTitel = `🆘 AIS-noodsignaal: ${naam}`;
      const bericht = kaartTekst(signaal);
      stuurAlarm({ id, titel: alarmTitel, bericht, prioriteit: afstand <= NOOD_EMERGENCY_KM ? 2 : 1 });
      stuurMailAlarm({ id, titel: alarmTitel, bericht, lat: signaal.lat, lon: signaal.lon });
      stuurWebPushAlarm({ id, titel: alarmTitel, bericht, url: `/?signaal=${encodeURIComponent(id)}`, lat: signaal.lat, lon: signaal.lon });
    }
  }
  for (const [mmsi, w] of eersteWaarneming) if (nu - w.laatstMs > VERGEET_NA_MS) eersteWaarneming.delete(mmsi);
  return signalen;
}
