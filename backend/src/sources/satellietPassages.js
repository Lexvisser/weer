// Gedeelde logica voor "wanneer is satelliet X hier zichtbaar"-verwerking.
// Zat oorspronkelijk allemaal in celestrak.js (alleen voor de ISS), op
// 2026-08-22 losgetrokken zodat starlinkTrain.js (Starlink-trein, op verzoek
// van Lex: "Er is een Starlinktrain te zien om'... misschien zelfde kaartje
// en werkwijze als ISS") de duur-benadering/datum/sterrenwaardering-logica
// kan hergebruiken i.p.v. te dupliceren. Zie celestrak.js voor de herkomst/
// geschiedenis van elk stuk hieronder (11-minuten-bug-fix, sterrenwaardering,
// datum) — die comments zijn hier bewust niet herhaald.
import * as Astronomy from 'astronomy-engine';
import { makeSignal } from '../normalize.js';
import { stuurAlarm } from './pushover.js';
import { stuurMailAlarm } from './email.js';
import { stuurWebPushAlarm } from './webpush.js';
// 2026-09-15: eigen doorrekening van het traject (waar verdwijnt hij in de
// aardschaduw, 16-delige windroos, begeleidende tekst, baan voor de
// grafische weergave) — zie passageTraject.js. Optioneel: zonder TLE valt
// alles hieronder gewoon terug op de kale g7vrd-gegevens.
import { berekenTraject, beschrijfPassage, windrichting16 } from './passageTraject.js';

const WINDRICHTINGEN = ['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW'];

export function windrichting(graden) {
  if (graden == null) return '—';
  return WINDRICHTINGEN[Math.round(graden / 45) % 8];
}

function lokaalUur(iso) {
  return Number(
    new Intl.DateTimeFormat('nl-NL', { hour: 'numeric', hour12: false, timeZone: 'Europe/Amsterdam' }).format(
      new Date(iso)
    )
  );
}

export function hoogteScore(maxElevatieGraden, minElevatieGraden) {
  return Math.max(1, Math.min(5, Math.floor((maxElevatieGraden - minElevatieGraden) / 12) + 1));
}

export function donkerScore(zonHoogteGraden) {
  return Math.max(1, Math.min(5, Math.round(1 + Math.max(0, -zonHoogteGraden) / 6)));
}

// Zonshoogte op het aangegeven moment vanaf lat/lon — zelfde astronomy-engine
// Observer/Equator/Horizon-aanpak als planeten.js (daar al geverifieerd).
export function zonHoogteOpMoment(lat, lon, datum) {
  const observer = new Astronomy.Observer(lat, lon, 0);
  const equator = Astronomy.Equator(Astronomy.Body.Sun, datum, observer, true, true);
  const horizon = Astronomy.Horizon(datum, observer, equator.ra, equator.dec, 'normal');
  return horizon.altitude;
}

// Haalt g7vrd's passes op voor één NORAD-id en zet ze om in signalen + de
// "aanbevolen" (eerstkomende, nuttige) passage. idVoorvoegsel/titelVoorvoegsel/
// bronUrl en de drempels verschillen per aanroeper; de rekenlogica zelf
// (duur-benadering, datum, sterren, "nuttig"-selectie) is identiek voor elke
// satelliet(-groep).
export async function haalPassagesOp({
  noradId,
  lat,
  lon,
  idVoorvoegsel,
  titelVoorvoegsel,
  bronUrl,
  minElevatieGraden = 30,
  lookaheadUren = 72,
  minDuurMinuten = 3,
  nuttigVensterStartUur = 19,
  nuttigVensterEindUur = 23,
  // { line1, line2 } van de satelliet zelf — maakt traject/beschrijving
  // mogelijk (zie passageTraject.js). null = alleen g7vrd-gegevens.
  tle = null,
  // Helderheidswoord alleen zinnig voor de ISS (Starlink is veel zwakker).
  metHelderheid = false,
}) {
  const res = await fetch(
    `https://api.g7vrd.co.uk/v1/satellite-passes/${noradId}/${lat}/${lon}.json?minelevation=${minElevatieGraden}&hours=${lookaheadUren}`
  );
  if (!res.ok) throw new Error(`g7vrd ${idVoorvoegsel}-passages gaf status ${res.status}`);
  const body = await res.json();

  function isNuttigeTijd(iso) {
    const uur = lokaalUur(iso);
    return uur >= nuttigVensterStartUur && uur < nuttigVensterEindUur;
  }

  let aanbevolenGevonden = false;
  let aanbevolenPassage = null;

  const signalen = (body.passes ?? []).slice(0, 8).map((p) => {
    const start = new Date(p.start);
    const tca = new Date(p.tca);
    const eind = new Date(p.end);
    const maxElevatie = Math.round(p.max_elevation);

    // Benaderde tijd BOVEN minElevatieGraden i.p.v. de volle AOS→LOS-boog
    // (zie celestrak.js voor waarom dat laatste altijd rond de 10-11 minuten
    // uitkomt en dus weinig zegt). Parabolisch model: 0° op start/eind,
    // max_elevation op tca — apart voor de opgaande (start→tca) en
    // neergaande (tca→eind) helft, want die zijn in de praktijk niet precies
    // even lang.
    const drempelFactor = maxElevatie > minElevatieGraden ? Math.sqrt(1 - minElevatieGraden / maxElevatie) : 0;
    const duurMinuten = Math.max(1, Math.round((((tca - start) + (eind - tca)) * drempelFactor) / 60000));

    const tijdTekst = new Intl.DateTimeFormat('nl-NL', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Amsterdam',
    }).format(start);
    const datumTekst = new Intl.DateTimeFormat('nl-NL', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'Europe/Amsterdam',
    }).format(start);
    const richtingOp = windrichting(p.aos_azimuth);

    // Eigen traject-doorrekening (2026-09-15). Faalt stil: zonder TLE of bij
    // een SGP4-probleem blijft 'traject' null en toont de frontend alleen de
    // g7vrd-regel zoals voorheen.
    let traject = null;
    if (tle?.line1 && tle?.line2) {
      try {
        // Iets ruimer dan g7vrd's AOS/LOS (die zijn op 0° elevatie; een halve
        // minuut marge vangt kleine verschillen tussen beide berekeningen op).
        const punten = berekenTraject({
          line1: tle.line1,
          line2: tle.line2,
          lat,
          lon,
          start: start.getTime() - 30 * 1000,
          eind: eind.getTime() + 30 * 1000,
        });
        traject = beschrijfPassage(punten, { metHelderheid });
      } catch (err) {
        console.error(`[weer] ${idVoorvoegsel}-traject mislukt:`, err.message ?? err);
      }
    }

    const zonHoogteGraden = zonHoogteOpMoment(lat, lon, tca);
    const sterren = Math.min(hoogteScore(maxElevatie, minElevatieGraden), donkerScore(zonHoogteGraden));

    // Eerste (dus eerstkomende) passage die aan alle "nuttig"-eisen voldoet
    // wint — de rest van de lijst blijft gewoon zichtbaar als
    // achtergrondinfo, alleen deze ene krijgt de live-behandeling/melding.
    const isAanbevolen =
      !aanbevolenGevonden && maxElevatie >= minElevatieGraden && duurMinuten >= minDuurMinuten && isNuttigeTijd(p.start);
    if (isAanbevolen) aanbevolenGevonden = true;

    const id = `${idVoorvoegsel}-${p.start}`;

    if (isAanbevolen) {
      aanbevolenPassage = {
        id,
        titel: `${titelVoorvoegsel} ${datumTekst} om ${tijdTekst}`,
        starttijd: p.start,
        richtingOp,
        maxElevatieGraden: maxElevatie,
        duurMinuten,
        eindtijd: p.end,
        traject,
      };
    }

    return makeSignal({
      id,
      categorie: 'hemel',
      titel: `${titelVoorvoegsel} ${datumTekst} om ${tijdTekst} - max. ${maxElevatie}° (${duurMinuten} min)`,
      ernst: maxElevatie >= 50 ? 'let-op' : 'info',
      tijd: p.start,
      detail: {
        starttijd: p.start,
        eindtijd: p.end,
        datumTekst,
        maxElevatieGraden: maxElevatie,
        richtingOp,
        richtingOnder: windrichting(p.los_azimuth),
        // 16-delige varianten (2026-09-15): WZW i.p.v. ZW — nauwkeuriger om
        // de juiste kant op te kijken. De 8-delige velden hierboven blijven
        // voor bestaande tekst/alarmen.
        richtingOp16: windrichting16(p.aos_azimuth),
        richtingOnder16: windrichting16(p.los_azimuth),
        duurMinuten,
        sterren,
        aanbevolen: isAanbevolen,
        bronUrl,
        // null als er geen TLE was of de doorrekening faalde — zie hierboven.
        beschrijving: traject?.beschrijving ?? null,
        traject,
      },
    });
  });

  return { signalen, aanbevolenPassage };
}

// Gedeelde alarm-check. Beide callers (celestrak.js voor de ISS,
// starlinkTrain.js voor de trein) roepen dit aan vanaf hun eigen snelle 30s-
// timer (zie server.js) met hun eigen laatst-berekende aanbevolen passage en
// eigen aankondigingstermijn — ISS: 2 minuten, Starlink-trein: 5 minuten
// (Lex: "Deze meldingen mogen wel 5 minuten van tevoren"). stuurAlarm/
// stuurMailAlarm/stuurWebPushAlarm hebben zelf al een gemeld-Set per id, dus
// dit hoeft niet zelf bij te houden of het al verstuurd is — gewoon elke
// tick aanroepen zolang het venster loopt, de callees dedupliceren vanzelf.
export function controleerPassageAlarm(aanbevolenPassage, { vooraankondigingSeconden, alarmIdVoorvoegsel, titelVoorvoegsel }) {
  if (!aanbevolenPassage) return;
  const secondenTotStart = (new Date(aanbevolenPassage.starttijd).getTime() - Date.now()) / 1000;
  // +30s marge (dezelfde 30s als de tick-frequentie) zodat een tick het
  // venster altijd raakt, ook bij wat drift.
  if (secondenTotStart <= 0 || secondenTotStart > vooraankondigingSeconden + 30) return;

  const { richtingOp, maxElevatieGraden, duurMinuten, starttijd, eindtijd, traject } = aanbevolenPassage;
  const minutenTekst = Math.round(vooraankondigingSeconden / 60);
  const titel = `${titelVoorvoegsel} begint zo`;
  // 2026-09-15, op verzoek van Lex ("Deze info moet ook in de mail... de
  // tijden moeten ook duidelijk zijn"): niet alleen "over 2 minuten", maar
  // de kloktijden en de begeleidende tekst uit passageTraject.js erbij.
  // Zonder traject (geen TLE) blijft de oude ene regel over.
  const klok = (iso) =>
    new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' }).format(new Date(iso));
  const regels = [`Kijk over ${minutenTekst} minuten laag boven de horizon in het ${richtingOp} - loopt op tot ${maxElevatieGraden}° (${duurMinuten} min).`];
  if (traject) {
    regels.push('');
    regels.push(`Zichtbaar van ${klok(traject.zichtbaarVan)} tot ${klok(traject.zichtbaarTot)} (${traject.zichtbaarMinuten} min).`);
    regels.push(`Opkomst ${klok(traject.opkomst.tijd)} in het ${traject.opkomst.richting} · hoogste punt ${klok(traject.max.tijd)} op ${traject.max.el}° (${traject.max.richting}) · ${traject.dooftUit ? `dooft uit ${klok(traject.eindeZicht.tijd)} op ${traject.eindeZicht.el}° (${traject.eindeZicht.richting})` : `ondergang ${klok(traject.ondergang.tijd)} (${traject.ondergang.richting})`}.`);
    regels.push('');
    regels.push(traject.beschrijving);
  } else if (starttijd && eindtijd) {
    regels.push(`Van ${klok(starttijd)} tot ${klok(eindtijd)}.`);
  }
  const bericht = regels.join('\n');
  const alarmId = `${alarmIdVoorvoegsel}-${aanbevolenPassage.starttijd}`;

  stuurAlarm({ id: alarmId, titel, bericht });
  stuurMailAlarm({ id: alarmId, titel, bericht });
  stuurWebPushAlarm({ id: alarmId, titel, bericht });
}
