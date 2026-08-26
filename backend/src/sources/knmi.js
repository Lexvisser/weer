// KNMI EDR API — 10-minuten-in-situ-waarnemingen van een echt weerstation,
// als NL-specifieke precisie-aanvulling naast Open-Meteo (zie openmeteo.js).
// Beide leveren categorie 'algemeen-weer' en staan gewoon naast elkaar.
//
// 2026-08-22: de aanloop hiernaartoe ging via twee KNMI-API's op het
// Developer Portal (developer.dataplatform.knmi.nl):
// - "Open Data API" leek eerst de voor de hand liggende keuze, maar bleek
//   puur een bestandsbrowser (lijst bestanden op / haal een downloadlink) —
//   je moet zelf een dataset kennen en het resultaat is grib2/netcdf, geen
//   kant-en-klare JSON-waarde. Veel te omslachtig voor "geef me nu de
//   temperatuur op een locatie".
// - "EDR API" (api.dataplatform.knmi.nl/edr/v1, EIGEN sleutel nodig, apart
//   van de Open Data API-sleutel — header heet hier "Authorization", LET OP:
//   dat is een andere headernaam dan MeteoGate's "apikey" in meteoalarm.js)
//   is wél gebouwd om een locatie te bevragen en er specifieke waarden uit
//   terug te krijgen.
//
// Live doorgetest in de Swagger-docs van de EDR API (niet vanuit deze
// omgeving zelf — geen netwerktoegang hiervandaan naar
// api.dataplatform.knmi.nl, dus alles hieronder is bevestigd door Lex zelf
// in de browser):
// - De collection "10-minute-in-situ-meteorological-observations" heeft GEEN
//   "binnen X km"-zoekfunctie (geen `within`-parameter op /position) — een
//   coördinaat moet exact op een station liggen, dus /position is voor ons
//   doel onbruikbaar (gaf steeds "The query returned no stations"). Wel
//   bruikbaar: /locations geeft de volledige stationslijst + coördinaten +
//   een `location_id` terug, en /locations/{location_id} geeft de
//   waarnemingen voor dat specifieke station — dat is de route die dit
//   bestand gebruikt.
// - Live geprobeerd bij HOME_LAT/HOME_LON: dichtstbijzijnd was "Rotterdam
//   Geulhaven" (~6km, maar type "Wind station" — vermoedelijk alleen
//   windmetingen). Bewust niet gekozen; in plaats daarvan het dichtstbijzijnde
//   station met een volwaardige sensorset (type "Meteo site" of "Aerodrome",
//   zie VOLWAARDIGE_TYPES) — dat bleek "Rotterdam Airport" (location_id
//   0-20000-0-06344, ~7,5km, nauwelijks verder), en die live-test kwam ook
//   daadwerkelijk terug met een volledige set (temperatuur, druk, wind,
//   bewolking, zicht, neerslag, etc.).
// - Live respons-velden bevestigd (uit het `parameters`-object dat de EDR API
//   zelf meestuurt): ta = temperatuur op 1,5m (°C), td = dauwpunt (°C),
//   rh = relatieve vochtigheid (%), dd = windrichting (graden), ff =
//   windsnelheid 10m, 10-min-gemiddelde (m/s), fx = windstoot-maximum (m/s),
//   pp = luchtdruk herleid naar zeeniveau, 1-min-gemiddelde (hPa — qnh is
//   vrijwel hetzelfde, zelfde standard_name, pp gekozen als primair), vv =
//   zicht (meter), n = totale bewolking (okta, 0-9), R1H = neerslagsom
//   laatste uur (mm), ww = present-weather-code. LET OP: `ww` is een WMO
//   SYNOP-codetabel die NIET dezelfde is als Open-Meteo's `weather_code` in
//   openmeteo.js (andere schaal/betekenis) — dus bewust NIET hergebruikt of
//   door CONDITIE daar gehaald, dat zou een verkeerde tekst opleveren. Deze
//   ruwe code wordt onvertaald meegegeven; een eigen vertaaltabel is nog niet
//   gebouwd (grote tabel, lage prioriteit — zie note in config.js).
//
// `ernst` staat hier altijd op 'info': dit is een informatiebron (precisie
// bovenop Open-Meteo), geen alarmbron — weerwaarschuwingen lopen via
// meteoalarm.js.
import { makeSignal, afstandKm } from '../normalize.js';

const EDR_BASIS = 'https://api.dataplatform.knmi.nl/edr/v1/collections/10-minute-in-situ-meteorological-observations';

// Stationstypes die live bevestigd een volledige sensorset lijken te hebben
// (temperatuur/druk/etc., niet alleen wind) — zie module-comment hierboven.
// "Wind station"/"Platform"/"Fog station" bewust uitgesloten van de
// dichtstbijzijnd-zoektocht, want die leveren vermoedelijk een beperktere set.
const VOLWAARDIGE_TYPES = new Set(['Meteo site', 'Aerodrome']);

// Eén keer per proceslevensduur het dichtstbijzijnde station opzoeken i.p.v.
// hardcoded — zelfde aanpak als sources/getij.js voor het RWS-station. Blijft
// null bij een mislukte lookup, zodat de eerstvolgende poll het gewoon
// opnieuw probeert i.p.v. voorgoed vast te lopen.
let dichtstbijzijndStation = null; // { locationId, naam, lat, lon, afstandKm }

async function zoekDichtstbijzijndStation(homeLat, homeLon, apiKey) {
  const res = await fetch(`${EDR_BASIS}/locations`, {
    headers: { Authorization: apiKey, accept: 'application/geo+json' },
  });
  if (!res.ok) throw new Error(`KNMI EDR /locations gaf status ${res.status}`);
  const body = await res.json();
  const alleStations = (body.features ?? []).filter((f) => f.geometry?.type === 'Point');
  const volwaardig = alleStations.filter((f) => VOLWAARDIGE_TYPES.has(f.properties?.type));
  // Val terug op de volledige lijst als er onverwacht geen "volwaardig"
  // station bestaat (zou niet moeten gebeuren binnen NL) — beter een station
  // met een beperktere set dan helemaal niets.
  const kandidaten = volwaardig.length ? volwaardig : alleStations;

  let beste = null;
  for (const station of kandidaten) {
    const [lon, lat] = station.geometry.coordinates;
    const afstand = afstandKm(homeLat, homeLon, lat, lon);
    if (!beste || afstand < beste.afstandKm) {
      beste = { locationId: station.id, naam: station.properties?.name ?? station.id, lat, lon, afstandKm: afstand };
    }
  }
  return beste;
}

export async function fetchKnmi(env) {
  const apiKey = env.knmiApiKey;
  if (!apiKey) {
    // Bewust een duidelijke fout i.p.v. stil een lege lijst — zelfde patroon
    // als meteoalarm.js bij een ontbrekende METEOGATE_API_KEY.
    throw new Error('KNMI_API_KEY ontbreekt in .env — vraag een gratis EDR API-sleutel aan via het KNMI Data Platform Developer Portal');
  }

  if (!dichtstbijzijndStation) {
    dichtstbijzijndStation = await zoekDichtstbijzijndStation(env.homeLat, env.homeLon, apiKey);
    if (!dichtstbijzijndStation) throw new Error('KNMI EDR: geen stations gevonden in /locations');
    console.log(
      `[weer] knmi: dichtstbijzijnd volwaardig station "${dichtstbijzijndStation.naam}" (${dichtstbijzijndStation.locationId}), ${dichtstbijzijndStation.afstandKm}km van huis`,
    );
  }

  // 2026-08-22-fix, na een live 404 bij Lex ("station undefined" in de
  // foutmelding was ook een bug, zie hieronder): één exact tijdstip opvragen
  // via new Date().toISOString() geeft milliseconde-precisie (bv.
  // "09:47:23.456Z"), wat vrijwel nooit precies op een van de 10-minuten-
  // meetmomenten valt — de API gaf daardoor telkens "geen data op dit exacte
  // tijdstip" (404) terug, ook al bestond het station en de sleutel prima.
  // Fix: een OPEN interval bevragen (RFC3339 dubbele-punt-notatie, zie de
  // parameterbeschrijving van de EDR API zelf) — "vanaf 40 minuten geleden
  // tot nu/laatste beschikbare" — en daaruit zelf de meest recente coverage
  // pakken, i.p.v. te gokken op één exact tijdstip. 40 min i.p.v. 20: iets
  // extra marge tegen vertraagde waarnemingen (zie collection-beschrijving).
  const nu = new Date();
  const vanIso = new Date(nu.getTime() - 40 * 60 * 1000).toISOString();
  const datetime = `${vanIso}/..`;
  const url = `${EDR_BASIS}/locations/${dichtstbijzijndStation.locationId}?datetime=${encodeURIComponent(datetime)}`;

  const stationId = dichtstbijzijndStation.locationId; // vóór een eventuele reset hieronder vastleggen, anders logt de foutmelding "undefined"
  const res = await fetch(url, { headers: { Authorization: apiKey, accept: 'application/prs.coverage+json' } });
  if (!res.ok) {
    // Station kan (zelden) buiten dienst zijn — laat de volgende poll gewoon
    // opnieuw zoeken i.p.v. voorgoed op een dood station vast te blijven zitten.
    if (res.status === 404) dichtstbijzijndStation = null;
    throw new Error(`KNMI EDR /locations/{id} gaf status ${res.status} voor station ${stationId}`);
  }
  const body = await res.json();
  // Meerdere coverages mogelijk binnen het interval (elke 10 min één) — de
  // meest recente (hoogste t) pakken i.p.v. blind coverages[0], voor het
  // geval de API ze niet gegarandeerd chronologisch teruggeeft.
  const coverage = (body.coverages ?? []).reduce((meestRecent, c) => {
    const t = c.domain?.axes?.t?.values?.[0];
    const tHuidig = meestRecent?.domain?.axes?.t?.values?.[0];
    if (!meestRecent) return c;
    return t && (!tHuidig || new Date(t) > new Date(tHuidig)) ? c : meestRecent;
  }, null);
  if (!coverage) throw new Error('KNMI EDR: lege respons (geen coverages binnen het tijdsinterval)');

  const tijd = coverage.domain?.axes?.t?.values?.[0] ?? nu.toISOString();
  // Niet elk station levert elk veld (zie module-comment) — ontbrekende
  // waardes worden gewoon null, de frontend laat een null-veld al netjes weg.
  const waarde = (sleutel) => coverage.ranges?.[sleutel]?.values?.[0] ?? null;

  const temperatuurC = waarde('ta');
  const windMs = waarde('ff');
  const windstootMs = waarde('fx');

  return [
    makeSignal({
      id: 'knmi-nu',
      categorie: 'algemeen-weer',
      titel: `KNMI ${dichtstbijzijndStation.naam}${temperatuurC != null ? ` — ${temperatuurC}°C` : ''}`,
      ernst: 'info',
      lat: dichtstbijzijndStation.lat,
      lon: dichtstbijzijndStation.lon,
      tijd,
      detail: {
        station: dichtstbijzijndStation.naam,
        afstandKm: dichtstbijzijndStation.afstandKm,
        temperatuurC,
        dauwpuntC: waarde('td'),
        luchtvochtigheidPct: waarde('rh'),
        windMs,
        windKmh: windMs != null ? Math.round(windMs * 3.6 * 10) / 10 : null,
        windRichtingGraden: waarde('dd'),
        windstotenMs: windstootMs,
        windstotenKmh: windstootMs != null ? Math.round(windstootMs * 3.6 * 10) / 10 : null,
        luchtdrukHpa: waarde('pp') ?? waarde('qnh'),
        zichtMeter: waarde('vv'),
        bewolkingOkta: waarde('n'),
        neerslagLaatsteUurMm: waarde('R1H'),
        // Ruwe WMO present-weather-code, bewust onvertaald — zie module-comment.
        presentWeatherCode: waarde('ww'),
      },
    }),
  ];
}
