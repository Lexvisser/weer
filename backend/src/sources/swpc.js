// NOAA SWPC — OVATION aurora-model: geeft per lengte-/breedtegraad een
// activiteitswaarde (0-11) i.p.v. één wereldwijd Kp-getal, dus we kunnen de
// kans specifiek voor HOME_LAT/HOME_LON aflezen in plaats van een algemeen
// "ergens op aarde"-cijfer. https://services.swpc.noaa.gov/json/ovation_aurora_latest.json
// Gratis, geen sleutel. Rasterresolutie ca. 1°, lengtegraad loopt 0–359 (oost).
//
// Onder waarde 5 blijft dit bewust stil: op ~52°N (Nederland) is dat ruis,
// geen "altijd zichtbare" tegel met een oninteressant getal.
import { makeSignal } from '../normalize.js';

const FEED_URL = 'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json';

function ernstVoorWaarde(v) {
  if (v >= 9) return 'kritiek';
  if (v >= 7) return 'waarschuwing';
  return 'let-op'; // 5-6
}

function dichtstbijzijndPunt(coordinates, lat, lon) {
  const lonNorm = ((lon % 360) + 360) % 360; // 0-360, oost-positief, zoals het OVATION-raster
  let beste = null;
  let besteAfstand = Infinity;
  for (const punt of coordinates) {
    const [pLon, pLat, waarde] = punt;
    const d = (pLon - lonNorm) ** 2 + (pLat - lat) ** 2;
    if (d < besteAfstand) {
      besteAfstand = d;
      beste = { lat: pLat, lon: pLon, waarde };
    }
  }
  return beste;
}

export async function fetchSwpc({ homeLat, homeLon }) {
  const res = await fetch(FEED_URL);
  if (!res.ok) throw new Error(`SWPC OVATION-feed gaf status ${res.status}`);
  const body = await res.json();
  if (!Array.isArray(body.coordinates)) return [];

  const punt = dichtstbijzijndPunt(body.coordinates, homeLat ?? 52.09, homeLon ?? 5.12);
  if (!punt || punt.waarde < 5) return [];

  return [
    makeSignal({
      id: 'swpc-aurora-thuis',
      categorie: 'hemel',
      titel: `Kans op noorderlicht boven je locatie (${punt.waarde}/11)`,
      ernst: ernstVoorWaarde(punt.waarde),
      tijd: body['Forecast Time'] ?? new Date().toISOString(),
      detail: {
        waarde: punt.waarde,
        schaal: '0-11 (NOAA OVATION)',
        toelichting:
          punt.waarde >= 9
            ? 'Sterke activiteit - kans op zichtbaarheid, ook met blote oog'
            : punt.waarde >= 7
              ? 'Verhoogde activiteit - probeer een camera met lange sluitertijd'
              : 'Lichte activiteit, alleen bij heldere, donkere hemel richting het noorden',
        bronUrl: 'https://www.swpc.noaa.gov/products/aurora-forecast',
      },
    }),
  ];
}
