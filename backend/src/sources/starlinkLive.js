// Live Starlink-treinpositie + grondspoor (baan voor/achter), op verzoek
// van Lex: "als daarvoor wordt gekozen dan moeten alle andere icons
// verborgen zijn en een baan voor en achter die wordt gevolgd."
//
// In tegenstelling tot issLive.js (die de kant-en-klare live ISS-positie
// van wheretheiss.at ophaalt — een ISS-SPECIFIEKE dienst) bestaat er geen
// "wheretheiss.at voor elke willekeurige satelliet"-API. Hier wordt daarom
// zelf een SGP4-baanpropagatie gedaan met de laatst opgehaalde TLE van de
// trein (zie starlinkTrain.js/huidigeTreinTle()), via de npm-package
// satellite.js — een gevestigde, zuiver-JS SGP4-implementatie. Geen eigen
// baanmechanica uitgevonden (dat was precies de complexiteit die celestrak.js
// voor de ISS bewust vermeed door g7vrd te gebruiken), wél een concrete
// nieuwe dependency — zie package.json.
//
// Geen server-side cache nodig zoals bij issLive.js (die bestond specifiek
// om wheretheiss.at's rate limit te ontzien): SGP4-propagatie is pure
// berekening, geen netwerkverzoek, dus elke aanvraag mag gewoon vers
// doorgerekend worden.
import * as satellite from 'satellite.js';
import { huidigeTreinTle } from './starlinkTrain.js';

const AARDSTRAAL_KM = 6371;
// Grondspoor voor/achter (Lex: "een baan voor en achter die wordt
// gevolgd") — 6 minuten aan elke kant in stappen van 20s: ruim genoeg om als
// duidelijke lijn te zien, niet zo lang dat 'ie een onleesbaar stuk van de
// wereld beslaat.
const SPOOR_VENSTER_MINUTEN = 6;
const SPOOR_STAP_SECONDEN = 20;

const WINDRICHTINGEN = ['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW'];
function windrichting(graden) {
  return WINDRICHTINGEN[Math.round((((graden % 360) + 360) % 360) / 45) % 8];
}

function naarRad(graden) {
  return (graden * Math.PI) / 180;
}
function naarGraden(rad) {
  return (rad * 180) / Math.PI;
}

// Zelfde ENU-"look angle"-formule als issLive.js (daar al geverifieerd) —
// topocentrische azimuth/elevatie vanuit een geocentrische satellietpositie,
// sferische aardbenadering. Hier bewust letterlijk gekopieerd i.p.v. vanuit
// issLive.js geïmporteerd: dat bestand is ISS-specifiek gebleven, dit is een
// kleine, in zijn geheel te overziene formule — geen gedeelde-module-
// overhead waard voor twee gebruiksplekken.
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

// satellite.js' standaard propagatie-/coördinaten-omzetstappen (satrec →
// ECI-positie op tijdstip X → geodetisch lat/lon/hoogte via GMST) — de
// gebruikelijke, in satellite.js' eigen documentatie/voorbeelden zo
// getoonde volgorde.
function positieOpMoment(satrec, datum) {
  const pv = satellite.propagate(satrec, datum);
  if (!pv || !pv.position || typeof pv.position === 'boolean') return null; // SGP4-fout (bijv. gedecayde/te oude elementenset)
  const gmst = satellite.gstime(datum);
  const geo = satellite.eciToGeodetic(pv.position, gmst);
  return {
    lat: satellite.degreesLat(geo.latitude),
    lon: satellite.degreesLong(geo.longitude),
    hoogteKm: geo.height,
  };
}

// Geeft null als er nu geen trein bekend is (zie huidigeTreinTle()) of als
// de propagatie mislukt — de aanroeper (server.js) zet dat om in een
// duidelijke 404, geen harde fout.
export function fetchStarlinkLive({ homeLat, homeLon } = {}) {
  const trein = huidigeTreinTle();
  if (!trein) return null;

  const lat = homeLat ?? 52.09;
  const lon = homeLon ?? 5.12;
  const satrec = satellite.twoline2satrec(trein.line1, trein.line2);
  const nu = new Date();

  const huidige = positieOpMoment(satrec, nu);
  if (!huidige) return null;

  const { azimuthGraden, elevatieGraden, afstandKm } = berekenAzEl(lat, lon, huidige.lat, huidige.lon, huidige.hoogteKm);

  const stappenPerKant = Math.round((SPOOR_VENSTER_MINUTEN * 60) / SPOOR_STAP_SECONDEN);
  const baanAchter = [];
  for (let i = stappenPerKant; i >= 1; i--) {
    const p = positieOpMoment(satrec, new Date(nu.getTime() - i * SPOOR_STAP_SECONDEN * 1000));
    if (p) baanAchter.push([p.lat, p.lon]);
  }
  const baanVoor = [];
  for (let i = 1; i <= stappenPerKant; i++) {
    const p = positieOpMoment(satrec, new Date(nu.getTime() + i * SPOOR_STAP_SECONDEN * 1000));
    if (p) baanVoor.push([p.lat, p.lon]);
  }

  return {
    tijd: nu.toISOString(),
    naam: trein.naam,
    latitude: huidige.lat,
    longitude: huidige.lon,
    hoogteKm: Math.round(huidige.hoogteKm),
    azimuthGraden: Math.round(azimuthGraden * 10) / 10,
    elevatieGraden: Math.round(elevatieGraden * 10) / 10,
    richting: windrichting(azimuthGraden),
    zichtbaarNu: elevatieGraden >= 0,
    afstandTotJouKm: Math.round(afstandKm),
    // Grondspoor, oplopend in tijd (oudste eerst): baanAchter eindigt bij
    // het huidige punt, baanVoor begint erna — de frontend plakt het
    // huidige punt er zelf tussenin voor een doorlopende lijn.
    baanAchter,
    baanVoor,
  };
}
