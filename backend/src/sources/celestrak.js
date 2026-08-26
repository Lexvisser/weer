// ISS-passages. In plaats van zelf TLE's ophalen en SGP4-baanpropagatie
// bouwen (niet-triviaal, en botst met het zero-dependency-uitgangspunt) een
// kant-en-klare gratis "wanneer is de ISS hier zichtbaar"-API: g7vrd.co.uk.
// Geen sleutel nodig, live geverifieerd op 2026-08-17 tegen HOME_LAT/HOME_LON.
// https://api.g7vrd.co.uk/v1/satellite-passes/{norad-id}/{lat}/{lon}.json
//
// Aanname (zoals vergelijkbare "spot the station"-diensten): dit voorspelt
// écht zichtbare passages — dus ISS in zonlicht én waarnemer in het donker —
// niet alleen een kale geometrische "boven de horizon"-berekening. Nog te
// bevestigen door 'm een keer live te vergelijken met een echte waarneming.
//
// 2026-08-22, op verzoek van Lex ("wil je nadenken over ISS. Daar zou ik
// kaarttracking voor willen hebben. Na kiezen voor een zichtbare maar ook
// nuttige passage (TBD)... Kijk in W richting op 30 graden") — drie
// toevoegingen, na overleg en akkoord ("laat ik allemaal aan jou over"):
// 1) "aanbevolen"-selectie hieronder (zichtbaar ÉN nuttig: hoog genoeg,
//    op een fatsoenlijk tijdstip, lang genoeg).
// 2) Live tracking tijdens zo'n aanbevolen passage — zie sources/issLive.js
//    (losse, snel-pollbare live-positie-laag, zelfde soort opzet als
//    vliegradar.js) en issKaartVoorHemel()/issKompasSvg() in frontend/app.js
//    (hergebruikt de Planeten-kompas-stijl).
// 3) Een pushmelding vlak vóór zo'n aanbevolen passage begint, zie
//    controleerIssAlarm() onderaan — wordt vanuit server.js op een eigen,
//    snelle 30s-timer aangeroepen (los van de 6-uurs pollIntervalMs
//    hierboven, die is prima voor de voorspelling zelf maar veel te traag om
//    een "over 2 minuten begint 'ie"-moment te kunnen raken).
//
// 2026-08-22, vervolg: drie kleinere fixes/toevoegingen op verzoek van Lex.
// 1) De "opvallend dat ze allemaal 11 minuten zouden duren"-bug is
//    opgelost. Root cause (bevestigd door de echte g7vrd-respons een keer
//    live op te vragen): p.start/p.end zijn wél de juiste velden, maar het
//    zijn AOS/LOS op 0° elevatie (horizon-tot-horizon) — dat getal ligt voor
//    de meeste ≥30°-passages toevallig dicht bij elkaar (~10-11 min), dus
//    geen bug in de veldnamen, maar een oninteressant getal: "hoe lang staat
//    'ie ÍN BEELD boven het dak" is wat je wil weten, niet "hoe lang duurt
//    de hele boog van horizon tot horizon". duurMinuten is nu de (benaderde)
//    tijd BOVEN MIN_ELEVATIE_GRADEN — zie satellietPassages.js.
// 2) Datum bij elke passage (Lex: "een aantal passages onder elkaar zonder
//    datum, die datum wil ik er bij") — LOOKAHEAD_UREN=72 spant al gauw
//    meerdere avonden, dus alleen een kloktijd was dubbelzinnig.
// 3) Sterrenwaardering (Lex: "net als ISS spotter").
//
// 2026-08-22, vervolg #2: de duur-benadering/datum/sterrenwaardering/
// alarm-logica hierboven is losgetrokken naar satellietPassages.js, zodat
// starlinkTrain.js (Starlink-trein, zelfde verzoek: "misschien zelfde
// kaartje en werkwijze als ISS") 'm kan hergebruiken i.p.v. dupliceren.
// Gedrag hieronder is ongewijzigd, alleen de implementatie verplaatst.
import { haalPassagesOp, controleerPassageAlarm } from './satellietPassages.js';

const NORAD_ID_ISS = 25544;

// "Zichtbaar" regelt g7vrd zelf al (zie module-comment hierboven). "Nuttig"
// (Lex' eigen woord, TBD gelaten) is hieronder ingevuld met drie simpele
// drempels — makkelijk bij te stellen als een van deze in de praktijk te
// streng/soepel blijkt:
// - minelevation=30: g7vrd's EIGEN default (dus expliciet meegegeven i.p.v.
//   stilzwijgend vertrouwd) — onder de 30° zit een passage al snel achter
//   daken/bomen, precies het "moeilijk te vinden"-scenario dat we willen
//   vermijden.
// - hours=72 (g7vrd's maximum): een ruimer venster dan de 4 die vroeger
//   getoond werden, nodig om over meerdere avonden heen een passage te
//   kunnen vinden die ook in het tijdvenster hieronder valt — niet elke
//   avond heeft er één.
const MIN_ELEVATIE_GRADEN = 30;
const LOOKAHEAD_UREN = 72;
const MIN_DUUR_MINUTEN = 3;
// Tijdvenster waarbinnen een passage "nuttig" is (niet 3 uur 's nachts) —
// eigen inschatting van een redelijk avonduur, makkelijk aan te passen.
const NUTTIG_VENSTER_START_UUR = 19;
const NUTTIG_VENSTER_EIND_UUR = 23; // exclusief: tot 22:59

// Bewaart de laatst berekende aanbevolen passage voor controleerIssAlarm()
// hieronder — dat draait op zijn eigen, veel snellere timer (zie server.js)
// en hoeft niet zelf opnieuw bij g7vrd te bevragen, dit hergebruikt gewoon
// het resultaat van de gewone (6-uurs) poll.
let laatsteAanbevolenPassage = null;

export async function fetchCelestrak({ homeLat, homeLon }) {
  const lat = homeLat ?? 52.09;
  const lon = homeLon ?? 5.12;

  const { signalen, aanbevolenPassage } = await haalPassagesOp({
    noradId: NORAD_ID_ISS,
    lat,
    lon,
    idVoorvoegsel: 'iss',
    titelVoorvoegsel: 'ISS-passage',
    bronUrl: 'https://spotthestation.nasa.gov/',
    minElevatieGraden: MIN_ELEVATIE_GRADEN,
    lookaheadUren: LOOKAHEAD_UREN,
    minDuurMinuten: MIN_DUUR_MINUTEN,
    nuttigVensterStartUur: NUTTIG_VENSTER_START_UUR,
    nuttigVensterEindUur: NUTTIG_VENSTER_EIND_UUR,
  });
  laatsteAanbevolenPassage = aanbevolenPassage;
  return signalen;
}

// Draait op een eigen 30s-timer vanuit server.js (zie de module-comment
// hierboven voor waarom dat een aparte timer moet zijn i.p.v. de trage
// 6-uurs pollIntervalMs). Vuurt 2 minuten vóór een aanbevolen passage begint.
export function controleerIssAlarm() {
  controleerPassageAlarm(laatsteAanbevolenPassage, {
    vooraankondigingSeconden: 2 * 60,
    alarmIdVoorvoegsel: 'iss-alarm',
    titelVoorvoegsel: 'ISS-passage',
  });
}
