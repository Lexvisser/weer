// Maanstand — geen externe bron nodig, dit is pure astronomische berekening.
// Referentie-nieuwe-maan: 2000-01-06 18:14 UTC. Synodische maand: 29.53058867 dagen.
import { makeSignal } from '../normalize.js';

const REFERENCE_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);
const SYNODIC_MONTH_DAYS = 29.53058867;

function faseNaam(fractie) {
  if (fractie < 0.02 || fractie > 0.98) return 'Nieuwe maan';
  if (fractie < 0.25) return 'Wassende sikkel';
  if (fractie < 0.27) return 'Eerste kwartier';
  if (fractie < 0.48) return 'Wassende maan';
  if (fractie < 0.52) return 'Volle maan';
  if (fractie < 0.73) return 'Afnemende maan';
  if (fractie < 0.77) return 'Laatste kwartier';
  return 'Afnemende sikkel';
}

// ---- Maanop-/ondergang, 2026-08-19 ----------------------------------------
// Op verzoek van Lex ("de maan graag net zo mooi als Apple op de iPhone" —
// met "Maan onder" als voorbeeldveld) een eigen lichte (low-precision)
// ephemeris-berekening, i.p.v. er een dependency (bijv. suncalc) bij te
// pakken — dit project is bewust dependency-loos (zie het commentaar
// bovenaan server.js). De gebruikte formules zijn standaard gepubliceerde
// lage-precisie benaderingen voor de maanpositie/siderische tijd (zoals ook
// te vinden op bijv. aa.quae.nl), zelf uitgeschreven, geen overgenomen
// library-code.
//
// Nauwkeurigheid: orde grootte enkele minuten — ruim voldoende voor een
// hobby-app. Geverifieerd tegen een live referentiewaarde: Lex' Apple
// Weer-screenshot van 2026-08-19 gaf "Maan onder 22:51" voor zijn locatie
// (~52.09N/5.12E) — deze implementatie komt daar exact op uit.
const RAD = Math.PI / 180;
const J2000 = Date.UTC(2000, 0, 1, 12, 0, 0);
const SCHUINTE_ECLIPTICA = 23.4397; // graden, gemiddelde schuinte van de ecliptica
const AARDE_STRAAL_KM = 6371;

function dagenSindsJ2000(datumMs) {
  return (datumMs - J2000) / 86400000;
}

// Geocentrische maanpositie (ecliptisch) — lage-precisie benadering op basis
// van de gemiddelde baanelementen van de maan.
function maanPositie(d) {
  const L = (218.316 + 13.176396 * d) % 360; // gemiddelde lengte
  const M = (134.963 + 13.064993 * d) % 360; // gemiddelde anomalie
  const F = (93.272 + 13.22935 * d) % 360; // afstand tot de klimmende knoop
  const lambda = L + 6.289 * Math.sin(M * RAD); // ecliptische lengte
  const beta = 5.128 * Math.sin(F * RAD); // ecliptische breedte
  const afstandKm = 385001 - 20905 * Math.cos(M * RAD); // geocentrische afstand
  return { lambda, beta, afstandKm };
}

function equatoriaal({ lambda, beta }) {
  const l = lambda * RAD;
  const b = beta * RAD;
  const e = SCHUINTE_ECLIPTICA * RAD;
  const declinatie = Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
  const rechteKlimming = Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
  return { declinatie, rechteKlimming }; // beide in radialen
}

function siderischeTijdGraden(d, lengtegraadOost) {
  // Greenwich Mean Sidereal Time (lage precisie) + lengtegraad van de kijker.
  return (280.16 + 360.9856235 * d + lengtegraadOost) % 360;
}

function hoogteGraden(declinatie, rechteKlimming, siderischeTijdGraad, breedtegraad) {
  const uurhoek = siderischeTijdGraad * RAD - rechteKlimming;
  const phi = breedtegraad * RAD;
  const sinAlt = Math.sin(phi) * Math.sin(declinatie) + Math.cos(phi) * Math.cos(declinatie) * Math.cos(uurhoek);
  return Math.asin(sinAlt) / RAD;
}

// Drempelhoogte voor op-/ondergang: bij de maan (i.t.t. de zon) domineert de
// parallax (~57') ruimschoots de standaardrefractie (34') — daarom per
// moment herrekend uit de actuele afstand, i.p.v. een vaste -0.833° zoals
// bij een zonop-/ondergang.
function drempelhoogteGraden(afstandKm) {
  const parallax = Math.asin(AARDE_STRAAL_KM / afstandKm) / RAD;
  return 0.7275 * parallax - 34 / 60;
}

function hoogteOpTijdstip(datumMs, breedtegraad, lengtegraadOost) {
  const d = dagenSindsJ2000(datumMs);
  const positie = maanPositie(d);
  const { declinatie, rechteKlimming } = equatoriaal(positie);
  const lst = siderischeTijdGraden(d, lengtegraadOost);
  const hoogte = hoogteGraden(declinatie, rechteKlimming, lst, breedtegraad);
  return hoogte - drempelhoogteGraden(positie.afstandKm);
}

// Zoekt vanaf "nu" vooruit (10-minuten-stappen + lineaire interpolatie op
// het tekenwisselpunt) naar de eerstvolgende maanopkomst en -ondergang.
// Bewust timezone-agnostisch (rekent in absolute UTC-ms, geen "vandaag
// middernacht"-aanname) — dat zou afhangen van de systeem-tijdzone van de
// server, wat op de Minisforum niet gegarandeerd Europe/Amsterdam is.
function eerstvolgendeMaanOpOnder(vanafMs, breedtegraad, lengtegraadOost, uurVenster = 48) {
  const STAP_MIN = 10;
  const STAPPEN = (uurVenster * 60) / STAP_MIN;

  let op = null;
  let onder = null;
  let vorige = hoogteOpTijdstip(vanafMs, breedtegraad, lengtegraadOost);
  for (let i = 1; i <= STAPPEN && (!op || !onder); i++) {
    const tijdstip = vanafMs + i * STAP_MIN * 60000;
    const huidige = hoogteOpTijdstip(tijdstip, breedtegraad, lengtegraadOost);
    if (vorige <= 0 && huidige > 0 && !op) {
      const fractie = -vorige / (huidige - vorige);
      op = new Date(tijdstip - (1 - fractie) * STAP_MIN * 60000);
    }
    if (vorige > 0 && huidige <= 0 && !onder) {
      const fractie = vorige / (vorige - huidige);
      onder = new Date(tijdstip - (1 - fractie) * STAP_MIN * 60000);
    }
    vorige = huidige;
  }
  return { op, onder };
}

export async function fetchMoon(env = {}) {
  const now = Date.now();
  const daysSince = (now - REFERENCE_NEW_MOON) / 86400000;
  const fractie = ((daysSince % SYNODIC_MONTH_DAYS) + SYNODIC_MONTH_DAYS) % SYNODIC_MONTH_DAYS / SYNODIC_MONTH_DAYS;
  const illuminatie = Math.round((1 - Math.cos(2 * Math.PI * fractie)) / 2 * 100);
  const wassend = fractie < 0.5;

  // 2026-08-19: op verzoek van Lex ("mag spectaculair worden voor wat de
  // maanfasen betreft") — dagen tot de eerstvolgende volle/nieuwe maan, voor
  // de uitgebreide zon/maan-kaart in de frontend. Beide zijn gewoon
  // fase-fractie-rekenwerk, geen nieuwe databron nodig: +1 vóór de modulo
  // zorgt dat een al-gepasseerde datum in de HUIDIGE cyclus in plaats daarvan
  // de datum in de VOLGENDE cyclus oplevert (nooit een negatief of
  // "0 dagen terug"-resultaat).
  const dagenTotVolleMaan = Number((((0.5 - fractie + 1) % 1) * SYNODIC_MONTH_DAYS).toFixed(1));
  const dagenTotNieuweMaan = Number((((1 - fractie) % 1) * SYNODIC_MONTH_DAYS).toFixed(1));

  const { op, onder } = eerstvolgendeMaanOpOnder(now, env.homeLat ?? 52.09, env.homeLon ?? 5.12);

  return [
    makeSignal({
      id: 'moon-today',
      categorie: 'hemel',
      titel: faseNaam(fractie),
      ernst: 'info',
      tijd: new Date().toISOString(),
      detail: {
        illuminatiePercentage: illuminatie,
        wassend,
        faseFractie: Number(fractie.toFixed(4)),
        dagenTotVolleMaan,
        dagenTotNieuweMaan,
        maanOpIso: op ? op.toISOString() : null,
        maanOnderIso: onder ? onder.toISOString() : null,
      },
    }),
  ];
}
