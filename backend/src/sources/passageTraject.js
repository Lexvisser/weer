// passageTraject.js — eigen doorrekening van één satellietpassage (ISS of
// Starlink-trein) bovenop de kant-en-klare g7vrd-voorspelling.
//
// 2026-09-15, op verzoek van Lex: g7vrd geeft alleen begin/hoogste punt/
// eind plus de opkomst- en ondergangsrichting. Wat ontbreekt — en wat je
// buiten het meest merkt — is WAAR de satelliet in de aardschaduw verdwijnt:
// "onder in O" klopt vaak niet, want hij dooft halverwege de hemel al uit.
// Daarom hier per passage het traject zelf narekenen met satellite.js (SGP4,
// zit al in de app voor starlinkLive.js) en astronomy-engine (zonstand):
// elke stapSeconden hoogte, azimut, afstand, "hangt hij in zonlicht" en
// "hoe donker is het bij de waarnemer". Daaruit volgen:
// - het zichtbare deel (satelliet in zonlicht, waarnemer in schemer/donker,
//   boven de horizon), incl. waar/wanneer hij uit de schaduw verschijnt of
//   erin verdwijnt;
// - een begeleidende tekst in gewone taal (beschrijfPassage);
// - een compacte puntenlijst voor de grafische baan-weergave in de frontend
//   (passageBaanSvg() in app.js).
//
// De 16-delige windroos (WZW i.p.v. ZW) zit ook hier, omdat "op in het ZW"
// bij een opkomst op 249° net te grof is om de juiste kant op te kijken.
import * as satellite from 'satellite.js';
import * as Astronomy from 'astronomy-engine';

const AARDSTRAAL_KM = 6371;
// Burgerlijke schemering: zon lager dan -6° is donker genoeg om de ISS te
// zien (dezelfde grens die Heavens-Above/ISS Spotter in de praktijk hanteren).
const ZON_DONKER_GRADEN = -6;

const WINDROOS_16 = ['N', 'NNO', 'NO', 'ONO', 'O', 'OZO', 'ZO', 'ZZO', 'Z', 'ZZW', 'ZW', 'WZW', 'W', 'WNW', 'NW', 'NNW'];
const WINDROOS_16_WOORD = [
  'noorden', 'noord-noordoosten', 'noordoosten', 'oost-noordoosten',
  'oosten', 'oost-zuidoosten', 'zuidoosten', 'zuid-zuidoosten',
  'zuiden', 'zuid-zuidwesten', 'zuidwesten', 'west-zuidwesten',
  'westen', 'west-noordwesten', 'noordwesten', 'noord-noordwesten',
];

export function windrichting16(graden) {
  if (graden == null || !Number.isFinite(graden)) return '—';
  return WINDROOS_16[Math.round(graden / 22.5) % 16];
}
export function windrichtingWoord(graden) {
  if (graden == null || !Number.isFinite(graden)) return 'onbekende richting';
  return WINDROOS_16_WOORD[Math.round(graden / 22.5) % 16];
}

function zonHoogte(observer, datum) {
  const equator = Astronomy.Equator(Astronomy.Body.Sun, datum, observer, true, true);
  return Astronomy.Horizon(datum, observer, equator.ra, equator.dec, 'normal').altitude;
}

// Cilindrisch aardschaduw-model: de satelliet zit in de schaduw als hij aan
// de nachtkant van de aarde zit (projectie op de zonrichting negatief) én
// binnen één aardstraal van de as aarde→zon. Goed genoeg op ~1 seconde
// nauwkeurig; de kegelvorm van de echte schaduw scheelt op ISS-hoogte een
// paar seconden.
function inZonlicht(posEciKm, zonEenheid) {
  const d = posEciKm.x * zonEenheid.x + posEciKm.y * zonEenheid.y + posEciKm.z * zonEenheid.z;
  if (d >= 0) return true;
  const r2 = posEciKm.x ** 2 + posEciKm.y ** 2 + posEciKm.z ** 2;
  return Math.sqrt(Math.max(0, r2 - d * d)) > AARDSTRAAL_KM;
}

function zonEenheidsVector(datum) {
  // Geocentrische zonvector (J2000-equatoriaal, AU). satellite.js rekent in
  // TEME; het verschil met J2000 is hier verwaarloosbaar (<0,5°).
  const v = Astronomy.GeoVector(Astronomy.Body.Sun, datum, true);
  const n = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / n, y: v.y / n, z: v.z / n };
}

// Rekent de passage door tussen start en eind (Date of ISO). Geeft null als
// de TLE onbruikbaar is of SGP4 faalt (dan valt de aanroeper gewoon terug op
// de kale g7vrd-gegevens, zonder traject/tekst).
export function berekenTraject({ line1, line2, lat, lon, start, eind, stapSeconden = 10 }) {
  let satrec;
  try {
    satrec = satellite.twoline2satrec(line1, line2);
  } catch {
    return null;
  }
  const observer = new Astronomy.Observer(lat, lon, 0);
  const observerGd = { latitude: satellite.degreesToRadians(lat), longitude: satellite.degreesToRadians(lon), height: 0 };
  const t0 = new Date(start).getTime();
  const t1 = new Date(eind).getTime();
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) return null;

  const punten = [];
  for (let t = t0; t <= t1; t += stapSeconden * 1000) {
    const datum = new Date(t);
    const pv = satellite.propagate(satrec, datum);
    if (!pv || !pv.position || typeof pv.position === 'boolean') return null;
    const gmst = satellite.gstime(datum);
    const ecf = satellite.eciToEcf(pv.position, gmst);
    const kijk = satellite.ecfToLookAngles(observerGd, ecf);
    const el = satellite.radiansToDegrees(kijk.elevation);
    const az = (satellite.radiansToDegrees(kijk.azimuth) + 360) % 360;
    const zonH = zonHoogte(observer, datum);
    const zonlicht = inZonlicht(pv.position, zonEenheidsVector(datum));
    const zichtbaar = el > 0 && zonlicht && zonH < ZON_DONKER_GRADEN;
    punten.push({ t, el, az, afstandKm: kijk.rangeSat, zonlicht, zonHoogte: zonH, zichtbaar });
  }
  return punten;
}

function tijdTekst(ms) {
  return new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' }).format(new Date(ms));
}

function hoogteOmschrijving(el, az) {
  if (el >= 80) return 'vrijwel recht boven je';
  if (el >= 60) return `bijna recht boven, iets naar het ${windrichtingWoord(az)}`;
  if (el >= 40) return `hoog aan de hemel in het ${windrichtingWoord(az)}`;
  if (el >= 25) return `halverwege de hemel in het ${windrichtingWoord(az)}`;
  return `laag boven de horizon in het ${windrichtingWoord(az)}`;
}

// Grove helderheidsschatting voor de ISS: intrinsiek ongeveer -1,8 op
// 1000 km, 5·log10(afstand) erbij; fasehoek bewust weggelaten (dit is een
// woord, geen magnitude). Alleen voor de ISS zinnig — Starlink-satellieten
// zijn veel zwakker, daar geven we geen woord.
function helderheidWoord(afstandKm) {
  const mag = -1.8 + 5 * Math.log10(afstandKm / 1000);
  if (mag <= -3) return 'Zeer helder, ongeveer zo fel als Venus.';
  if (mag <= -2) return 'Helder, feller dan elke ster aan de hemel.';
  if (mag <= -1) return 'Goed zichtbaar, zo helder als een heldere ster.';
  return 'Vrij zwak, vergelijkbaar met een gewone ster.';
}

// Maakt uit het traject de samenvatting + tekst. Geeft null als er geen
// zichtbaar deel is (bijv. hele passage in daglicht).
export function beschrijfPassage(punten, { metHelderheid = false } = {}) {
  if (!punten || punten.length === 0) return null;
  const zichtbare = punten.filter((p) => p.zichtbaar);
  if (zichtbare.length === 0) return null;

  const eerste = punten[0];
  const laatste = punten[punten.length - 1];
  const opkomstIdx = punten.findIndex((p) => p.el > 0);
  const opkomst = punten[Math.max(0, opkomstIdx)];
  const ondergang = laatste;
  const max = punten.reduce((a, b) => (b.el > a.el ? b : a));
  const zichtVan = zichtbare[0];
  const zichtTot = zichtbare[zichtbare.length - 1];
  const helderste = zichtbare.reduce((a, b) => (b.afstandKm < a.afstandKm ? b : a));

  // Verschijnt hij pas later uit de schaduw (of is het bij opkomst nog te
  // licht)? En dooft hij vóór de ondergang uit?
  const verschijntLater = zichtVan.t - opkomst.t > 30 * 1000;
  const dooftUit = ondergang.t - zichtTot.t > 30 * 1000;
  const verschijntUitSchaduw = verschijntLater && punten.some((p) => p.t < zichtVan.t && p.el > 0 && !p.zonlicht);
  const maxZichtbaar = max.zichtbaar;

  const zinnen = [];
  if (verschijntLater) {
    const reden = verschijntUitSchaduw ? 'nog onzichtbaar in de aardschaduw' : 'nog onzichtbaar omdat het te licht is';
    zinnen.push(
      `Komt om ${tijdTekst(opkomst.t)} op in het ${windrichtingWoord(opkomst.az)}, ${reden}; verschijnt om ${tijdTekst(zichtVan.t)} op ${Math.round(zichtVan.el)}° in het ${windrichtingWoord(zichtVan.az)}.`
    );
  } else {
    zinnen.push(`Komt om ${tijdTekst(opkomst.t)} laag op in het ${windrichtingWoord(opkomst.az)}.`);
  }

  if (maxZichtbaar) {
    zinnen.push(`Klimt tot ${Math.round(max.el)}° (${hoogteOmschrijving(max.el, max.az)}) om ${tijdTekst(max.t)}.`);
  } else if (max.t > zichtTot.t) {
    zinnen.push(`Zou om ${tijdTekst(max.t)} tot ${Math.round(max.el)}° klimmen, maar is dan al niet meer te zien.`);
  } else {
    zinnen.push(`Het hoogste punt (${Math.round(max.el)}° om ${tijdTekst(max.t)}) valt vóór het zichtbare deel.`);
  }

  if (dooftUit) {
    zinnen.push(
      `Verdwijnt om ${tijdTekst(zichtTot.t)} op ${Math.round(zichtTot.el)}° in het ${windrichtingWoord(zichtTot.az)} in de aardschaduw — hij dooft dus uit, gaat niet onder.`
    );
  } else {
    zinnen.push(`Gaat om ${tijdTekst(ondergang.t)} onder in het ${windrichtingWoord(ondergang.az)}.`);
  }

  const zichtbaarMinuten = Math.max(1, Math.round((zichtTot.t - zichtVan.t) / 60000));
  zinnen.push(`Zichtbaar ongeveer ${zichtbaarMinuten} ${zichtbaarMinuten === 1 ? 'minuut' : 'minuten'}.`);
  if (metHelderheid) zinnen.push(helderheidWoord(helderste.afstandKm));

  const moment = (p) => ({
    tijd: new Date(p.t).toISOString(),
    el: Math.round(p.el),
    az: Math.round(p.az),
    richting: windrichting16(p.az),
    afstandKm: Math.round(p.afstandKm),
  });

  return {
    beschrijving: zinnen.join(' '),
    // Tijdstip van baan[0] (seconden-nulpunt), zodat de frontend kloktijden
    // bij de punten kan zetten.
    start: new Date(eerste.t).toISOString(),
    zichtbaarVan: new Date(zichtVan.t).toISOString(),
    zichtbaarTot: new Date(zichtTot.t).toISOString(),
    zichtbaarMinuten,
    verschijntLater,
    dooftUit,
    // Per sleutelmoment: tijd, hoogte, azimut, 16-delige richting, afstand
    // (km) — de tabel in de frontend (passageTabelHtml) toont dit ISS-
    // Spotter-achtig: "Zichtbaar vanaf / Hoogste punt / In schaduw".
    opkomst: moment(opkomst),
    beginZicht: moment(zichtVan),
    max: { ...moment(max), zichtbaar: maxZichtbaar },
    eindeZicht: moment(zichtTot),
    ondergang: moment(ondergang),
    // Compacte baan voor de frontend: [seconden sinds start, elevatie, azimut, zichtbaar 0/1]
    baan: punten.map((p) => [Math.round((p.t - eerste.t) / 1000), Math.round(p.el * 10) / 10, Math.round(p.az * 10) / 10, p.zichtbaar ? 1 : 0]),
  };
}
