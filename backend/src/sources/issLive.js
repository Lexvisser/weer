// issLive.js — live ISS-positie tijdens een actieve, aanbevolen passage (zie
// sources/celestrak.js voor de "aanbevolen"-selectie). Zelfde soort opzet
// als vliegradar.js: GEEN hazard-signaal via SOURCES/SourceState/makeSignal
// (dus niet in config.js/FETCHERS), maar een losse, snel-pollbare live-laag
// met een eigen kleine server-side cache en een eigen HTTP-route
// (/api/iss-live, zie server.js) — de frontend polt dit alleen zolang een
// aanbevolen passage daadwerkelijk actief is (start ≤ nu ≤ eind), niet de
// hele dag door.
//
// Bron: api.wheretheiss.at — gratis, geen sleutel, geeft de actuele
// lat/lon/hoogte(/snelheid) van de ISS terug. Rate-limit is ~1 verzoek/s
// (zie developer-pagina); CACHE_MS hieronder houdt daar ruim afstand van,
// ook als er per ongeluk meerdere tabbladen tegelijk pollen.
// https://wheretheiss.at/w/developer
//
// Omrekening naar azimuth/elevatie vanaf HOME_LAT/HOME_LON: een standaard
// ENU-"look angle"-formule (topocentrische horizoncoördinaten vanuit een
// geocentrische satellietpositie), met een sferische aardbenadering (straal
// 6371km) — zelfde precisie-niveau/aanpak als moon.js (zelf uitgerekend,
// geen aparte dependency voor zoiets kleins). Vóór dit live ging apart
// geverifieerd (los testscript, niet in dit bestand) tegen vier bekende
// meetkundige gevallen — recht boven de waarnemer (moet el=90 geven), exact
// op de theoretische geometrische horizon (el=0 bij de bijbehorende
// hoekafstand R/(R+hoogte)), ruim erboven en ruim eronder — alle vier
// klopten tot op 0,1°.
const NORAD_ID_ISS = 25544;
const AARDSTRAAL_KM = 6371;
const CACHE_MS = 4000;

let cache = { data: null, tijdMs: 0 };

// 2026-08-23, op verzoek van Lex ("De zich verplaatsende ISS kan geen spoor
// nalaten?") — een grondspoor achter de ISS-marker, zoals Starlink dat al
// heeft (zie starlinkLive.js). Daar wordt het spoor zelf uitgerekend via
// SGP4-propagatie (satellite.js + een TLE), maar dat is hier bewust NIET
// overgenomen: dit bestand bestaat juist om die complexiteit te vermijden
// (zie de module-comment hierboven, "GEEN eigen baanmechanica uitgevonden").
// In plaats daarvan wordt elke ECHTE fetch (dus met CACHE_MS ertussen, niet
// elke cache-hit) bewaard in een kleine ringbuffer — de frontend polt toch al
// elke 6s zolang iemand kijkt (zie KAART_VOLG_POLL_MS/ISS_LIVE_POLL_MS in
// app.js), dus dat geeft vanzelf een groeiend spoor.
// 2026-08-23, vervolg (Lex: "ik zie wel een stukje van de baan, maar die moet
// tot de rand lopen") — puur live opbouwen betekende: bij een koude start
// (server net herstart, of niemand keek de laatste SPOOR_VENSTER_MINUTEN)
// begint het spoor leeg en duurt het minutenlang voor er een lange lijn
// staat. Fix: vulSpoorMetHistorie() hieronder haalt bij zo'n koude start in
// één keer een stuk historie op bij wheretheiss.at zelf (hun `/positions`-
// endpoint, tot 10 tijdstippen in één verzoek) — nog steeds geen eigen
// baanmechanica, wheretheiss.at doet de propagatie net zo goed voor een
// tijdstip in het verleden als voor "nu". Geen baanVoor blijft ongewijzigd:
// dat zou een voorspelling zijn, en dat doet dit bestand bewust niet.
const SPOOR_VENSTER_MINUTEN = 20; // was 6 — ruim boven BACKFILL_VENSTER_MINUTEN, anders valt de backfill meteen weer weg
// 2026-08-23: "staartje" van het spoor dat de frontend feller/verzadigder
// tekent bovenop de rest — zie baanAchterRecent hieronder. 60s ≈ de laatste
// 10 polls (bij het gebruikelijke 6s-ritme), lang genoeg om als duidelijk
// stuk lijn te zien, kort genoeg om echt als "net getekend" te ogen i.p.v.
// het hele spoor.
const SPOOR_RECENT_MS = 60 * 1000;
// Eenmalige historie-backfill bij een koude start (spoor.length === 0), zie
// vulSpoorMetHistorie() verderop. 18 min ruim onder SPOOR_VENSTER_MINUTEN
// (20) zodat niks meteen weer wegvalt; 9 punten (wheretheiss.at staat max 10
// timestamps per verzoek toe) om over dat venster te spreiden = 1 punt per 2
// minuten, ruim genoeg voor een vloeiend ogende lijn op dit soort zoomniveau.
const BACKFILL_VENSTER_MINUTEN = 18;
const BACKFILL_PUNTEN = 9;
let spoor = []; // [{ tijdMs, lat, lon }], oudste eerst

// Zie de module-comment bij SPOOR_VENSTER_MINUTEN hierboven. Wordt alleen
// aangeroepen als spoor leeg is (koude start) — dus hoogstens één extra
// verzoek per "koude sessie", geen doorlopende extra belasting. Mislukken mag
// nooit de live-poll zelf breken: bij een fout bouwt het spoor gewoon vanaf
// nu live op, zoals vóór deze toevoeging.
async function vulSpoorMetHistorie(nu) {
  const stapMs = (BACKFILL_VENSTER_MINUTEN * 60 * 1000) / BACKFILL_PUNTEN;
  const tijdstippen = Array.from({ length: BACKFILL_PUNTEN }, (_, i) =>
    Math.round((nu - BACKFILL_VENSTER_MINUTEN * 60 * 1000 + i * stapMs) / 1000),
  );
  try {
    const res = await fetch(
      `https://api.wheretheiss.at/v1/satellites/${NORAD_ID_ISS}/positions?timestamps=${tijdstippen.join(',')}`,
      { headers: { 'User-Agent': 'weer-app-persoonlijk (contact: lokaal project)' } },
    );
    if (!res.ok) throw new Error(`status ${res.status}`);
    const body = await res.json();
    if (!Array.isArray(body)) return;
    body
      .filter((p) => typeof p.latitude === 'number' && typeof p.longitude === 'number' && typeof p.timestamp === 'number')
      .sort((a, b) => a.timestamp - b.timestamp)
      .forEach((p) => spoor.push({ tijdMs: p.timestamp * 1000, lat: p.latitude, lon: p.longitude }));
    console.log(`[weer] iss-live: spoor gevuld met ${spoor.length} historische punt(en) (koude start)`);
  } catch (err) {
    console.error('[weer] iss-live: spoor-backfill mislukt, bouwt nu gewoon live op —', err.message ?? err);
  }
}

function naarRad(graden) {
  return (graden * Math.PI) / 180;
}
function naarGraden(rad) {
  return (rad * 180) / Math.PI;
}

// Zie module-comment hierboven voor de herkomst/verificatie van deze
// formule. E/N/U = local East/North/Up-vector van waarnemer naar satelliet.
function berekenAzEl(latO, lonO, latS, lonS, altSKm) {
  const latOr = naarRad(latO);
  const lonOr = naarRad(lonO);
  const latSr = naarRad(latS);
  const lonSr = naarRad(lonS);
  const r = AARDSTRAAL_KM + altSKm;

  const Xo = AARDSTRAAL_KM * Math.cos(latOr) * Math.cos(lonOr);
  const Yo = AARDSTRAAL_KM * Math.cos(latOr) * Math.sin(lonOr);
  const Zo = AARDSTRAAL_KM * Math.sin(latOr);
  const Xs = r * Math.cos(latSr) * Math.cos(lonSr);
  const Ys = r * Math.cos(latSr) * Math.sin(lonSr);
  const Zs = r * Math.sin(latSr);
  const dx = Xs - Xo;
  const dy = Ys - Yo;
  const dz = Zs - Zo;

  const E = -Math.sin(lonOr) * dx + Math.cos(lonOr) * dy;
  const N = -Math.sin(latOr) * Math.cos(lonOr) * dx - Math.sin(latOr) * Math.sin(lonOr) * dy + Math.cos(latOr) * dz;
  const U = Math.cos(latOr) * Math.cos(lonOr) * dx + Math.cos(latOr) * Math.sin(lonOr) * dy + Math.sin(latOr) * dz;

  const azimuthGraden = (naarGraden(Math.atan2(E, N)) + 360) % 360;
  const elevatieGraden = naarGraden(Math.atan2(U, Math.hypot(E, N)));
  const afstandKm = Math.sqrt(dx * dx + dy * dy + dz * dz);
  return { azimuthGraden, elevatieGraden, afstandKm };
}

const WINDRICHTINGEN = ['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW'];
function windrichting(graden) {
  return WINDRICHTINGEN[Math.round((((graden % 360) + 360) % 360) / 45) % 8];
}

export async function fetchIssLive({ homeLat, homeLon } = {}) {
  const nu = Date.now();
  if (cache.data && nu - cache.tijdMs < CACHE_MS) return cache.data;

  const res = await fetch(`https://api.wheretheiss.at/v1/satellites/${NORAD_ID_ISS}`, {
    headers: { 'User-Agent': 'weer-app-persoonlijk (contact: lokaal project)' },
  });
  if (!res.ok) throw new Error(`wheretheiss.at gaf status ${res.status}`);
  const body = await res.json();

  // Koude start (net herstart, of niemand keek de laatste SPOOR_VENSTER_
  // MINUTEN) — zie vulSpoorMetHistorie() hierboven. Ná deze aanroep staat
  // spoor meteen (grofmazig) gevuld, i.p.v. leeg te beginnen.
  if (spoor.length === 0) await vulSpoorMetHistorie(nu);

  const lat = homeLat ?? 52.09;
  const lon = homeLon ?? 5.12;
  const { azimuthGraden, elevatieGraden, afstandKm } = berekenAzEl(lat, lon, body.latitude, body.longitude, body.altitude);

  // baanAchter opbouwen UIT de tot-nu-toe opgeslagen samples, VÓÓR de huidige
  // sample wordt toegevoegd — zelfde contract als starlinkLive.js: baanAchter
  // bevat strikt-verleden punten, de aanroeper (app.js) plakt het huidige
  // punt er zelf achteraan voor een doorlopende lijn.
  spoor = spoor.filter((p) => nu - p.tijdMs <= SPOOR_VENSTER_MINUTEN * 60 * 1000);
  const baanAchter = spoor.map((p) => [p.lat, p.lon]);
  // 2026-08-23, op verzoek van Lex ("de baan die al was afgelegd... in
  // licht en wat ie nieuw opbouwt zelfde kleur feller") — een los kort
  // "staartje" van het spoor (laatste minuut) zodat de frontend dát stuk
  // fel/verzadigd kan tekenen bovenop de rest van het spoor in een lichtere
  // tint, een cometstaart-effect. Gewoon een suffix van dezelfde `spoor`-
  // data, geen aparte opslag nodig.
  const baanAchterRecent = spoor.filter((p) => nu - p.tijdMs <= SPOOR_RECENT_MS).map((p) => [p.lat, p.lon]);
  spoor.push({ tijdMs: nu, lat: body.latitude, lon: body.longitude });

  const data = {
    tijd: new Date(body.timestamp * 1000).toISOString(),
    latitude: body.latitude,
    longitude: body.longitude,
    hoogteKm: Math.round(body.altitude),
    snelheidKmu: typeof body.velocity === 'number' ? Math.round(body.velocity) : null,
    azimuthGraden: Math.round(azimuthGraden * 10) / 10,
    elevatieGraden: Math.round(elevatieGraden * 10) / 10,
    richting: windrichting(azimuthGraden),
    zichtbaarNu: elevatieGraden >= 0,
    afstandTotJouKm: Math.round(afstandKm),
    baanAchter,
    baanAchterRecent,
  };
  cache = { data, tijdMs: nu };
  return data;
}
