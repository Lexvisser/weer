// 2026-09-07, op verzoek van Lex ("kan ik de app nog verder optuigen? Ik
// denk aan weerstations in de buurt"): ALLE KNMI-waarneemstations binnen een
// straal rond huis als losse kaartlaag ("Stations"-knop), met windpijl +
// temperatuur per station en een popup met de volledige meting.
//
// Bouwt voort op sources/knmi.js (dat blijft gewoon het ene dichtstbijzijnde
// volwaardige station leveren voor het weerkaartje): zelfde EDR API, zelfde
// KNMI_API_KEY, zelfde /locations + /locations/{id}-route en dezelfde
// veldnamen (ta/dd/ff/fx/pp/vv/R1H, zie de module-comment daar). Verschil:
// hier worden óók de "Wind station"/"Platform"-types meegenomen (Geulhaven,
// Lichteiland Goeree, Europlatform...) -- voor de zeekaart is een puur
// windstation juist interessant; ontbrekende velden worden gewoon null.
//
// Geen SourceState/SOURCES-integratie (zelfde regel als /api/vliegradar en
// /api/iss-live in server.js): eigen kleine cache hier, de frontend pollt
// /api/weerstations alleen zolang de laag aanstaat.
//
// Belasting: de stationslijst (/locations) wordt hooguit één keer per
// STATIONS_LIJST_MS opgehaald; per station één klein verzoek per
// STATIONS_CACHE_MS (10 min = het meetinterval van KNMI zelf, vaker pollen
// heeft geen zin). Bij ~12-15 stations binnen 60 km is dat < 100
// verzoeken/uur naar KNMI en verwaarloosbaar voor de Minisforum. Verzoeken
// lopen met beperkte gelijktijdigheid (MAX_TEGELIJK) zodat we de EDR API niet
// in één klap bestoken.
import { afstandKm } from '../normalize.js';

const EDR_BASIS = 'https://api.dataplatform.knmi.nl/edr/v1/collections/10-minute-in-situ-meteorological-observations';
const STATIONS_LIJST_MS = 24 * 60 * 60 * 1000;
const STATIONS_CACHE_MS = 10 * 60 * 1000;
const MAX_TEGELIJK = 4;
const STRAAL_STANDAARD_KM = 60;
const STRAAL_MAX_KM = 150;

let stationsLijst = null; // { tijdMs, stations: [{ locationId, naam, type, lat, lon }] }
let metingenCache = null; // { tijdMs, straalKm, stations: [...] }
let metingenInFlight = null; // Promise -- gelijktijdige verzoeken delen één ophaalronde

async function haalStationsLijst(apiKey) {
  const nu = Date.now();
  if (stationsLijst && nu - stationsLijst.tijdMs < STATIONS_LIJST_MS) return stationsLijst.stations;
  const res = await fetch(`${EDR_BASIS}/locations`, {
    headers: { Authorization: apiKey, accept: 'application/geo+json' },
  });
  if (!res.ok) throw new Error(`KNMI EDR /locations gaf status ${res.status}`);
  const body = await res.json();
  const stations = (body.features ?? [])
    .filter((f) => f.geometry?.type === 'Point')
    .map((f) => {
      const [lon, lat] = f.geometry.coordinates;
      return { locationId: f.id, naam: f.properties?.name ?? f.id, type: f.properties?.type ?? null, lat, lon };
    });
  stationsLijst = { tijdMs: nu, stations };
  return stations;
}

async function haalMeting(station, apiKey) {
  const nu = new Date();
  // Open interval "40 minuten geleden tot laatste" -- zie knmi.js voor
  // waarom een exact tijdstip hier niet werkt (404 op elke niet-10-min-tijd).
  const vanIso = new Date(nu.getTime() - 40 * 60 * 1000).toISOString();
  const url = `${EDR_BASIS}/locations/${station.locationId}?datetime=${encodeURIComponent(`${vanIso}/..`)}`;
  const res = await fetch(url, { headers: { Authorization: apiKey, accept: 'application/prs.coverage+json' } });
  if (!res.ok) throw new Error(`status ${res.status}`);
  const body = await res.json();
  const coverage = (body.coverages ?? []).reduce((meestRecent, c) => {
    const t = c.domain?.axes?.t?.values?.[0];
    const tHuidig = meestRecent?.domain?.axes?.t?.values?.[0];
    if (!meestRecent) return c;
    return t && (!tHuidig || new Date(t) > new Date(tHuidig)) ? c : meestRecent;
  }, null);
  if (!coverage) throw new Error('geen coverages');
  const waarde = (sleutel) => coverage.ranges?.[sleutel]?.values?.[0] ?? null;
  const windMs = waarde('ff');
  const windstootMs = waarde('fx');
  return {
    tijd: coverage.domain?.axes?.t?.values?.[0] ?? nu.toISOString(),
    temperatuurC: waarde('ta'),
    dauwpuntC: waarde('td'),
    luchtvochtigheidPct: waarde('rh'),
    windMs,
    windKn: windMs != null ? Math.round(windMs * 1.94384 * 10) / 10 : null,
    windBft: windMs != null ? msNaarBft(windMs) : null,
    windRichtingGraden: waarde('dd'),
    windstotenMs: windstootMs,
    windstotenKn: windstootMs != null ? Math.round(windstootMs * 1.94384 * 10) / 10 : null,
    luchtdrukHpa: waarde('pp') ?? waarde('qnh'),
    zichtMeter: waarde('vv'),
    bewolkingOkta: waarde('n'),
    neerslagLaatsteUurMm: waarde('R1H'),
  };
}

function msNaarBft(ms) {
  const grenzen = [0.3, 1.6, 3.4, 5.5, 8.0, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7];
  let bft = 0;
  for (const g of grenzen) if (ms >= g) bft += 1;
  return bft;
}

// Beperkte gelijktijdigheid: MAX_TEGELIJK "werkers" die samen de lijst
// leegtrekken. Een mislukt station (buiten dienst, 404) wordt niet
// weggelaten maar zonder meting teruggegeven, zodat de kaart 'm wel toont.
async function haalAlleMetingen(stations, apiKey) {
  const resultaat = new Array(stations.length);
  let volgende = 0;
  const werker = async () => {
    while (volgende < stations.length) {
      const i = volgende++;
      const s = stations[i];
      try {
        resultaat[i] = { ...s, meting: await haalMeting(s, apiKey), fout: null };
      } catch (err) {
        resultaat[i] = { ...s, meting: null, fout: err.message ?? String(err) };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(MAX_TEGELIJK, stations.length) }, werker));
  return resultaat;
}

export async function fetchKnmiStations({ homeLat, homeLon, apiKey, straalKm }) {
  if (!apiKey) throw new Error('KNMI_API_KEY ontbreekt in .env');
  const straal = Math.min(STRAAL_MAX_KM, Math.max(5, Number(straalKm) || STRAAL_STANDAARD_KM));
  const nu = Date.now();
  if (metingenCache && metingenCache.straalKm === straal && nu - metingenCache.tijdMs < STATIONS_CACHE_MS) {
    return { straalKm: straal, bijgewerkt: new Date(metingenCache.tijdMs).toISOString(), stations: metingenCache.stations };
  }
  if (metingenInFlight) return metingenInFlight;
  metingenInFlight = (async () => {
    try {
      const alle = await haalStationsLijst(apiKey);
      const binnen = alle
        .map((s) => ({ ...s, afstandKm: afstandKm(homeLat, homeLon, s.lat, s.lon) }))
        .filter((s) => s.afstandKm <= straal)
        .sort((a, b) => a.afstandKm - b.afstandKm);
      const stations = await haalAlleMetingen(binnen, apiKey);
      const gelukt = stations.filter((s) => s.meting).length;
      console.log(`[weer] weerstations: ${gelukt}/${stations.length} stations binnen ${straal} km met meting`);
      metingenCache = { tijdMs: Date.now(), straalKm: straal, stations };
      return { straalKm: straal, bijgewerkt: new Date(metingenCache.tijdMs).toISOString(), stations };
    } finally {
      metingenInFlight = null;
    }
  })();
  return metingenInFlight;
}
