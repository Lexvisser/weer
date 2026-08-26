// Open-Meteo — actuele weerscondities. Gratis, geen sleutel nodig (niet-commercieel
// gebruik), tot 10.000 requests/dag. https://open-meteo.com/en/docs
import { makeSignal } from '../normalize.js';

// WMO weather_code-tabel, verkort naar wat wij nodig hebben.
const CONDITIE = {
  0: 'Helder',
  1: 'Overwegend helder',
  2: 'Half bewolkt',
  3: 'Bewolkt',
  45: 'Mist',
  48: 'Rijp-mist',
  51: 'Lichte motregen',
  53: 'Motregen',
  55: 'Dichte motregen',
  56: 'Lichte ijzel (motregen)',
  57: 'IJzel (motregen)',
  61: 'Lichte regen',
  63: 'Regen',
  65: 'Zware regen',
  66: 'Lichte ijzel (regen)',
  67: 'IJzel (regen)',
  71: 'Lichte sneeuw',
  73: 'Sneeuw',
  75: 'Zware sneeuw',
  77: 'Sneeuwkorrels',
  80: 'Lichte buien',
  81: 'Buien',
  82: 'Zware buien',
  85: 'Lichte sneeuwbuien',
  86: 'Sneeuwbuien',
  95: 'Onweer',
  96: 'Onweer met hagel',
  99: 'Zwaar onweer met hagel',
};

function ernstVoorCode(code) {
  if (code >= 95) return 'waarschuwing'; // onweer
  if (code >= 65 && code <= 82) return 'let-op'; // stevige regen/buien
  return 'info';
}

export async function fetchOpenMeteo(env) {
  const params = new URLSearchParams({
    latitude: env.homeLat,
    longitude: env.homeLon,
    current: [
      'temperature_2m',
      'apparent_temperature',
      'weather_code',
      'wind_speed_10m',
      'wind_direction_10m',
      'wind_gusts_10m',
      'relative_humidity_2m',
      'precipitation',
      'pressure_msl',
      'cloud_cover',
      'is_day',
    ].join(','),
    // 2026-08-19: op verzoek van Lex (zon/maan-strip + de dubbele temperatuur
    // in de weerkaart vervangen door iets nuttigers) — zonsopkomst/-ondergang
    // en dag-min/max erbij. `timezone: 'auto'` (al aanwezig hierboven) zorgt
    // dat Open-Meteo deze als lokale wandklok-tijd teruggeeft (bijv.
    // "2026-08-19T06:14", zonder offset) — de frontend knipt daar simpelweg
    // het HH:MM-deel uit i.p.v. dit als UTC te herinterpreteren.
    daily: ['sunrise', 'sunset', 'temperature_2m_max', 'temperature_2m_min'].join(','),
    timezone: 'auto',
  });

  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error(`Open-Meteo gaf status ${res.status}`);
  const body = await res.json();
  const c = body.current;
  const d = body.daily;

  return [
    makeSignal({
      id: 'openmeteo-nu',
      categorie: 'algemeen-weer',
      titel: CONDITIE[c.weather_code] ?? `Weercode ${c.weather_code}`,
      ernst: ernstVoorCode(c.weather_code),
      lat: env.homeLat,
      lon: env.homeLon,
      tijd: new Date(c.time).toISOString(),
      detail: {
        temperatuurC: c.temperature_2m,
        gevoelstemperatuurC: c.apparent_temperature,
        windKmh: c.wind_speed_10m,
        windRichtingGraden: c.wind_direction_10m,
        windstotenKmh: c.wind_gusts_10m,
        luchtvochtigheidPct: c.relative_humidity_2m,
        neerslagMm: c.precipitation,
        luchtdrukHpa: c.pressure_msl,
        bewolkingPct: c.cloud_cover,
        isDag: c.is_day === 1,
        weatherCode: c.weather_code,
        zonsopkomst: d?.sunrise?.[0] ?? null,
        zonsondergang: d?.sunset?.[0] ?? null,
        temperatuurMaxC: d?.temperature_2m_max?.[0] ?? null,
        temperatuurMinC: d?.temperature_2m_min?.[0] ?? null,
      },
    }),
  ];
}
