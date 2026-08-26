// Planeten — azimuth/elevatie/rise-set voor de vijf met blote oog zichtbare
// planeten (Mercurius, Venus, Mars, Jupiter, Saturnus) vanaf HOME_LAT/HOME_LON.
// Op verzoek van Lex, 2026-08-22: "Wanneer is welke planeet waar te zien.
// Elevatie azimuth op onder etc. Liefst in een planetarium-achtige setting.
// In Hemel onder eigen kopje." — SKY_RUBRIEKEN in app.js had al een
// commentaarregel die precies dit voorzag ("een nieuwe rubriek (bv. straks
// 'Planeten')"), dus dat kopje was al de bedoeling.
//
// AFWIJKING van het dependency-loze uitgangspunt (zie het commentaar bovenaan
// server.js): moon.js rekent de maanstand zelf uit (een relatief simpele,
// bijna-cirkelvormige baan — lage-precisie-formules volstaan ruim) en
// celestrak.js koos bewust een kant-en-klare externe API i.p.v. zelf SGP4 te
// bouwen ("niet-triviaal, en botst met het zero-dependency-uitgangspunt").
// Planeetposities zitten er qua complexiteit tussenin, maar dichter bij
// celestrak.js se kant: er bestaat geen bruikbare gratis "planeetposities per
// locatie"-API zoals g7vrd voor de ISS, en zelf een planeetbaan-berekening
// met bruikbare nauwkeurigheid schrijven (VSOP87-niveau-perturbaties, per
// planeet weer anders) is een veel grotere en foutgevoeligere klus dan de
// maan-formules. Vandaar hier WEL een npm-dependency: astronomy-engine
// (github.com/cosinekitty/astronomy) — MIT-licentie, geen eigen
// dependencies, ±120KB geminificeerd, actief onderhouden, en precies
// gebouwd voor dit soort berekeningen. Zelfde soort afweging als eerder bij
// cheerio/nodemailer/web-push (zie package.json): een smalle, specifieke
// behoefte die een aparte dependency waard is, i.p.v. het principiële
// "geen dependencies" star volgen. `npm install` in backend/ is dus nodig
// (was al zo vanwege die drie) — geen nieuwe stap in de praktijk.
//
// Kon in deze projectomgeving niet live tegen een draaiende server getest
// worden (geen toegang tot de npm-registry vanuit deze sandbox) — de
// functienamen/-vormen hieronder komen rechtstreeks uit de officiële
// API-documentatie (github.com/cosinekitty/astronomy, source/js/README.md),
// niet gegokt. Check bij Lex' eerste `npm install && npm start` de
// console-log "[weer] planeten: ..." hieronder als sanity-check (bijv. Venus'
// magnitude hoort altijd tussen -4.9 en -3.8 te liggen, nooit positief).
import * as Astronomy from 'astronomy-engine';
import { makeSignal } from '../normalize.js';

// Alleen de klassieke, met blote oog waarneembare planeten — Uranus/Neptunus
// (magnitude ~5.7/~7.8, alleen met verrekijker/telescoop haalbaar) bewust
// weggelaten: past niet bij "wanneer kan ik dit ZIEN vanaf mijn balkon", en
// zou de compas-visual vullen met stipjes die vrijwel nooit iets opleveren.
// 2026-08-22-fix, op verzoek van Lex ("je hebt 3x een soort geel, maar dat
// wat duidelijker verschillend") — de eerste kleurkeuze leunde te zwaar op
// realistische, maar onderling erg vergelijkbare zand-/crème-tinten
// (Mercurius/Jupiter/Saturnus liepen op de kompas/raster bijna in elkaar
// over). Hieronder een palet dat op elk van de vijf duidelijk een andere
// kleurfamilie gebruikt (grijs/geel/rood/oranje/lavendel) — realisme is hier
// bewust ondergeschikt aan "in één oogopslag te onderscheiden op een klein
// stipje", Saturnus' lavendeltint is dus artistieke vrijheid, geen
// astronomisch feit.
const PLANETEN = [
  { id: 'mercurius', naam: 'Mercurius', body: Astronomy.Body.Mercury, kleur: '#a9afc0' },
  { id: 'venus', naam: 'Venus', body: Astronomy.Body.Venus, kleur: '#ffd94d' },
  { id: 'mars', naam: 'Mars', body: Astronomy.Body.Mars, kleur: '#ff5a45' },
  { id: 'jupiter', naam: 'Jupiter', body: Astronomy.Body.Jupiter, kleur: '#e8a24f' },
  { id: 'saturnus', naam: 'Saturnus', body: Astronomy.Body.Saturn, kleur: '#c9a8e0' },
];

const WINDRICHTINGEN = ['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW'];
function windrichting(graden) {
  return WINDRICHTINGEN[Math.round((((graden % 360) + 360) % 360) / 45) % 8];
}

// Boven deze hoogte telt een planeet als "praktisch de moeite van het zoeken
// waard" — niet letterlijk 0°: vlak boven de horizon zit je toch al in
// atmosferische demping/lichtvervuiling/bomen-en-gebouwen. 5° is de
// gangbare vuistregel bij amateur-astronomie-apps hiervoor.
const MIN_ZICHTBARE_HOOGTE_GRADEN = 5;

// richting: +1 = opkomst, -1 = ondergang (Astronomy.SearchRiseSet-conventie).
// Zoekvenster van 2 dagen is ruim genoeg — geen van deze vijf planeten blijft
// vanaf een gematigde breedtegraad als Nederland langer dan ~1 dag onder of
// boven de horizon (i.t.t. bijv. poolstreken, hier niet relevant).
function eerstvolgendeOpOnder(body, observer, vanaf) {
  const op = Astronomy.SearchRiseSet(body, observer, 1, vanaf, 2);
  const onder = Astronomy.SearchRiseSet(body, observer, -1, vanaf, 2);
  return {
    opIso: op ? op.date.toISOString() : null,
    onderIso: onder ? onder.date.toISOString() : null,
  };
}

let planetenSanityCheckGelogd = false;

export async function fetchPlaneten(env = {}) {
  const lat = env.homeLat ?? 52.09;
  const lon = env.homeLon ?? 5.12;
  const observer = new Astronomy.Observer(lat, lon, 0);
  const nu = new Date();

  const planeten = PLANETEN.map((p) => {
    // ofdate=true, aberration=true: equatoriale coördinaten "van dit moment"
    // (i.p.t. J2000-referentiekader) — dat hoort bij Horizon() nodig te zijn
    // om samen met de actuele sterrentijd op deze locatie een kloppende
    // azimuth/elevatie te geven.
    const equator = Astronomy.Equator(p.body, nu, observer, true, true);
    const horizon = Astronomy.Horizon(nu, observer, equator.ra, equator.dec, 'normal');
    const illuminatie = Astronomy.Illumination(p.body, nu);
    const zichtbaarNu = horizon.altitude >= MIN_ZICHTBARE_HOOGTE_GRADEN;
    const { opIso, onderIso } = eerstvolgendeOpOnder(p.body, observer, nu);

    return {
      id: p.id,
      naam: p.naam,
      kleur: p.kleur,
      azimuthGraden: Math.round(horizon.azimuth * 10) / 10,
      elevatieGraden: Math.round(horizon.altitude * 10) / 10,
      richting: windrichting(horizon.azimuth),
      magnitude: Math.round(illuminatie.mag * 10) / 10,
      zichtbaarNu,
      opIso,
      onderIso,
    };
  });

  if (!planetenSanityCheckGelogd) {
    planetenSanityCheckGelogd = true;
    console.log(
      `[weer] planeten: ${planeten
        .map((p) => `${p.naam} az=${p.azimuthGraden}° el=${p.elevatieGraden}° mag=${p.magnitude}`)
        .join(', ')}`
    );
  }

  const zichtbareTellen = planeten.filter((p) => p.zichtbaarNu).length;

  return [
    makeSignal({
      id: 'planeten-nu',
      categorie: 'hemel',
      titel:
        zichtbareTellen > 0
          ? `${zichtbareTellen} planeet${zichtbareTellen === 1 ? '' : 'en'} nu zichtbaar`
          : 'Geen planeten nu boven de horizon',
      ernst: 'info',
      tijd: nu.toISOString(),
      detail: { planeten },
    }),
  ];
}
