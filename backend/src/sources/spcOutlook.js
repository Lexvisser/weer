// NOAA Storm Prediction Center — Day 1 Categorical Convective Outlook. Het
// officiële "vandaag is het serieus link op zwaar onweer/tornado's"-overzicht
// voor de VS, in 5 risiconiveaus: Marginal / Slight / Enhanced / Moderate /
// High. Gratis, geen sleutel, ArcGIS FeatureServer:
// https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer
//
// Bewust alleen Enhanced/Moderate/High doorgelaten (zelfde filosofie als
// GDACS: alleen Orange/Red) — Marginal/Slight/gewoon-onweer komen zo vaak
// voor ergens in de enorme VS dat het anders een dagelijkse ruisbron zou
// worden i.p.v. een signaal dat ergens serieus mis dreigt te gaan.
//
// Net als bij tornado-watch sturen we de volledige polygon mee
// (detail.gebiedPolygon) zodat de frontend 'm als omtrek kan tekenen —
// zelfde `toonGebiedVoor()`-rendering in app.js, geen aparte frontendcode nodig.
import { makeSignal } from '../normalize.js';

const FEED_URL =
  'https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer/1/query?f=geojson&where=1%3D1&outFields=*&returnGeometry=true';

const ERNST_PER_LABEL = { ENH: 'let-op', MDT: 'waarschuwing', HIGH: 'kritiek' };
const NAAM_PER_LABEL = { ENH: 'Enhanced Risk', MDT: 'Moderate Risk', HIGH: 'High Risk' };

// SPC-tijdformaat: "YYYYMMDDHHmm" (UTC, geen scheidingstekens).
function parseSpcTijd(ruw) {
  if (!ruw || ruw.length !== 12) return null;
  return `${ruw.slice(0, 4)}-${ruw.slice(4, 6)}-${ruw.slice(6, 8)}T${ruw.slice(8, 10)}:${ruw.slice(10, 12)}:00Z`;
}

function ringenAlsLatLon(geometry) {
  if (!geometry) return [];
  const ringen =
    geometry.type === 'Polygon'
      ? [geometry.coordinates[0]]
      : geometry.type === 'MultiPolygon'
        ? geometry.coordinates.map((polygon) => polygon[0])
        : [];
  return ringen.map((ring) => ring.map(([lon, lat]) => [lat, lon]));
}

function centroid(ringenLatLon) {
  const punten = ringenLatLon.flat();
  if (!punten.length) return [null, null];
  const lat = punten.reduce((som, p) => som + p[0], 0) / punten.length;
  const lon = punten.reduce((som, p) => som + p[1], 0) / punten.length;
  return [lat, lon];
}

export async function fetchSpcOutlook() {
  const res = await fetch(FEED_URL);
  if (!res.ok) throw new Error(`SPC outlook gaf status ${res.status}`);
  const body = await res.json();

  return (body.features ?? [])
    .filter((f) => ERNST_PER_LABEL[f.properties?.label])
    .map((f) => {
      const p = f.properties;
      const gebiedPolygon = ringenAlsLatLon(f.geometry);
      const [lat, lon] = centroid(gebiedPolygon);
      return makeSignal({
        id: `spc-outlook-${p.label}-${p.issue ?? p.valid}`,
        categorie: 'severe-outlook',
        titel: `Severe Outlook - VS: ${NAAM_PER_LABEL[p.label]}${p.label2 ? ` - ${p.label2}` : ''}`,
        ernst: ERNST_PER_LABEL[p.label],
        lat,
        lon,
        tijd: parseSpcTijd(p.issue) ?? new Date().toISOString(),
        detail: {
          subtitel: 'Storm Prediction Center - dag 1 categorical outlook',
          geldigTot: parseSpcTijd(p.expire),
          bronUrl: 'https://www.spc.noaa.gov/products/outlook/day1otlk.html',
          gebiedPolygon: gebiedPolygon.length ? gebiedPolygon : null,
        },
      });
    });
}
