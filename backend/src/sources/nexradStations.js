// Volledige NEXRAD-stationslijst (~159 sites), voor de per-station-lookup
// achter de Doppler-"Rotatie"-optie in de frontend (zie NEXRAD_STATIONS in
// app.js). Eerder bewust beperkt tot een handmatig samengestelde lijst van
// ~40 stations rond Tornado Alley/Dixie Alley/zuidoost-VS, omdat een
// betrouwbare volledige lijst tijdens het bouwen niet op te halen was
// (herhaalde ROBOTS_DISALLOWED-fouten bij twee eerder geprobeerde bronnen).
//
// Nu wél gevonden: NOAA's eigen "Weather Radar Stations" ArcGIS FeatureServer
// (coast.noaa.gov) — gratis, geen sleutel, bevat zowel NEXRAD (WSR-88D) als
// TDWR-radars in één laag, vandaar de filter op `radartype`.
//
// EERLIJKE WAARSCHUWING (zelfde soort voorbehoud als bij Blitzortung): het
// exacte veldschema hieronder (`siteidentifier`/`sitename`/`radartype`) komt
// uit documentatie-onderzoek, niet uit een eigen live test-fetch — de
// omgeving waarin dit gebouwd is heeft geen bruikbare toegang tot deze
// specifieke ArcGIS-laag (gaf steeds de interactieve HTML-queryinterface
// terug i.p.v. de JSON-data). Check bij het opstarten de
// "[weer] nexradStations: voorbeeld"-logregel — ziet die eruit als een
// station-ID met geloofwaardige coördinaten? Dan klopt het schema. Blijft de
// lijst leeg of geeft de poll een fout? Dan is een veldnaam anders dan
// verwacht — de bestaande curated ~40-stations-lijst in app.js blijft dan
// gewoon als fallback werken (frontend valt terug zodra deze endpoint niets
// bruikbaars teruggeeft), dus niets breekt in de tussentijd.
const FEED_URL =
  'https://coast.noaa.gov/arcgis/rest/services/Hosted/WeatherRadarStations/FeatureServer/0/query?f=geojson&where=1%3D1&outFields=*&returnGeometry=true';

export async function fetchNexradStations() {
  const res = await fetch(FEED_URL);
  if (!res.ok) throw new Error(`NEXRAD-stationslijst gaf status ${res.status}`);
  const body = await res.json();
  const features = body.features ?? [];

  const stations = features
    .filter((f) => String(f.properties?.radartype ?? '').toUpperCase().includes('NEXRAD'))
    .map((f) => ({
      id: f.properties?.siteidentifier,
      naam: f.properties?.sitename ?? f.properties?.siteidentifier ?? '?',
      lat: f.geometry?.coordinates?.[1],
      lon: f.geometry?.coordinates?.[0],
    }))
    .filter((s) => s.id && typeof s.lat === 'number' && typeof s.lon === 'number');

  if (stations.length) {
    console.log(
      `[weer] nexradStations: voorbeeld: ${JSON.stringify(stations[0])} (totaal ${stations.length} stations, van ${features.length} ruwe features)`
    );
  } else {
    console.log(
      `[weer] nexradStations: 0 bruikbare stations uit ${features.length} ruwe features — check of 'radartype'/'siteidentifier' nog de juiste veldnamen zijn.`
    );
  }
  return stations;
}
