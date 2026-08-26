// Starlink-"trein": een net gelanceerde batch Starlink-satellieten die nog
// dicht op elkaar in dezelfde baan vliegen (de bekende "lijn van lichtjes"
// aan de avondhemel), voordat ze in de weken erna ieder naar hun eigen
// operationele hoogte (~550km) klimmen en uit elkaar waaieren. Op verzoek
// van Lex ("Er is een Starlinktrain te zien om'... misschien zelfde kaartje
// en werkwijze als ISS. Dan uiteraard ook een melding. Deze meldingen mogen
// wel 5 minuten van tevoren in plaats van 2"), en later ("Ja [live
// kaarttracking], als daarvoor wordt gekozen dan moeten alle andere icons
// verborgen zijn en een baan voor en achter die wordt gevolgd" — zie
// starlinkLive.js).
//
// Twee stappen, waar ISS (celestrak.js) er maar één nodig had: de ISS is
// altijd hetzelfde ene, bekende object (NORAD 25544). Een "trein" is elke
// paar dagen een ANDER object — welke satellieten nu nog als trein vliegen
// verandert met elke nieuwe lancering. Dat moet dus eerst bepaald worden:
//
// 1) identificeerTrein() hieronder: haalt CelesTrak's publieke, sleutelloze
//    TLE-data (3LE: naam + de klassieke twee-regelige baanelementen) op voor
//    de hele actieve Starlink-constellatie, groepeert alle satellieten op
//    hun internationale aanduiding (regel 1, kolom 10-17, vorm "JJNNN..." —
//    gedeeld door alle satellieten van dezelfde lancering) en kiest de MEEST
//    RECENTE lancering die nog als "trein" herkenbaar is:
//    - een geloofwaardig aantal satellieten (een normale Falcon 9-lading),
//    - hun mean motion (omlopen/dag, regel 2 kolom 53-63) nog dicht bij
//      elkaar — nog niet uitgewaaierd,
//    - en duidelijk hoger dan de operationele ~15,05/dag — dus nog laag/net
//      ingeschoten, niet al opgeklommen naar de definitieve schil.
//    Geen van de recentste lanceringen voldoet? Dan is er nu gewoon geen
//    trein — komt voor, SpaceX lanceert niet elke dag én een trein dooft na
//    een dag of 10-14 vanzelf uit (satellieten dan te ver uit elkaar).
//
//    Bewust TLE-tekst i.p.v. de JSON-variant van dezelfde CelesTrak-data:
//    de live kaarttracking hieronder (starlinkLive.js) doet zelf SGP4-
//    baanpropagatie (via satellite.js) en heeft daar de originele
//    twee-regelige elementenset voor nodig — met de TLE-tekst als bron
//    hoeft dat niet nog een keer apart opgehaald te worden.
//
//    ONGEVERIFIEERD, in tegenstelling tot de rest van deze app: het
//    CelesTrak-endpoint kon niet live getest worden vanuit de omgeving
//    waarin dit geschreven is (de fetch werd daar geblokkeerd). Het TLE-
//    formaat zelf is al decennia een vaste, gestandaardiseerde kolom-
//    indeling (ongewijzigd sinds NORAD het invoerde) en dit exacte
//    CelesTrak-endpoint is het alom bekende, al jaren stabiele adres dat
//    satellietvolg-software/tutorials overal gebruiken — maar controleer na
//    de eerste herstart de console-log hieronder om te zien of 'ie
//    daadwerkelijk (geen) trein vindt en meld het terug, zoals bij de
//    11-minuten-bug — dan worden de TREIN_*-drempels hieronder bijgesteld
//    op wat CelesTrak in de praktijk teruggeeft.
//
// 2) Zodra er een representatief NORAD-id + TLE bekend is: exact dezelfde
//    g7vrd-passagevoorspelling + verwerkingslogica als de ISS, zie
//    satellietPassages.js, voor de passagelijst + melding. De trein vliegt
//    op dit punt (nog maar een paar dagen oud) zo dicht opeen dat één
//    satelliet als representant voor de hele groep een prima benadering is
//    — de rest passeert typisch enkele seconden tot een paar minuten later,
//    niet interessant genoeg om apart te voorspellen.
import { haalPassagesOp, controleerPassageAlarm } from './satellietPassages.js';
import { makeSignal } from '../normalize.js';

const CELESTRAK_STARLINK_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=3le';

// Zelfde "nuttig"-drempels als de ISS (celestrak.js) — geen reden om voor
// een trein andere eisen te stellen, kan later bijgesteld worden.
const MIN_ELEVATIE_GRADEN = 30;
const LOOKAHEAD_UREN = 72;
const MIN_DUUR_MINUTEN = 3;
const NUTTIG_VENSTER_START_UUR = 19;
const NUTTIG_VENSTER_EIND_UUR = 23;

// "Is dit nog een trein"-drempels — zie module-comment hierboven. Een
// Falcon 9 Starlink-lancering draagt doorgaans 20-28 satellieten;
// TREIN_SATELLIETEN_MIN/MAX geeft daar ruim de marge omheen (bijv. als er
// een paar (nog) ontbreken in CelesTrak's data of een kleinere variant-
// lancering was).
const TREIN_SATELLIETEN_MIN = 8;
const TREIN_SATELLIETEN_MAX = 34;
// Omlopen/dag: hoe dicht de groep nog bij elkaar zit (nog niet uitgewaaierd).
const TREIN_MEAN_MOTION_SPREIDING_MAX = 0.08;
// Omlopen/dag: nog laag genoeg (niet al opgeklommen naar de ~15,05/dag
// operationele schil — insertie gebeurt rond de ~350-380km, ~15,9/dag).
const TREIN_MEAN_MOTION_MIN = 15.5;
// Hoeveel recentste lanceringen proberen voor "geen trein" geconcludeerd
// wordt — 10 lanceringen bestrijkt ruimschoots de laatste paar weken.
const TREIN_LANCERINGEN_TERUGKIJKEN = 10;

let laatsteAanbevolenPassage = null;
// { noradId, naam, lancering, aantalSatellieten, line1, line2 } | null —
// line1/line2 zijn de ruwe TLE-regels van de representant, nodig voor de
// SGP4-propagatie in starlinkLive.js (zie huidigeTreinTle() onderaan).
let laatsteTrein = null;

// Vaste kolomposities uit de TLE-standaard (ongewijzigd sinds NORAD 'm
// invoerde, zie bijv. https://celestrak.org/NORAD/documentation/tle-fmt.php).
function parseerNoradId(line1) {
  return Number(line1.slice(2, 7).trim());
}
function parseerInternationaalId(line1) {
  return line1.slice(9, 17).trim(); // bijv. "24149A" — jaar(2)+lanceringsnr(3)+stuk
}
function parseerMeanMotion(line2) {
  return Number(line2.slice(52, 63).trim());
}

// Zet CelesTrak's 3LE-tekst (naam, regel 1, regel 2, herhaald per
// satelliet) om in objecten. Onherkenbare/onvolledige regel-triplets worden
// overgeslagen i.p.v. de hele fetch te laten stuklopen — bij >7000
// satellieten is een enkel rariteitje in de data geen reden om niks te
// tonen.
function parseerDrieregeligeTle(tekst) {
  const regels = tekst
    .split('\n')
    .map((r) => r.replace(/\r$/, ''))
    .filter((r) => r.trim().length > 0);

  const objecten = [];
  for (let i = 0; i + 2 < regels.length; i += 3) {
    const naam = regels[i].trim();
    const line1 = regels[i + 1];
    const line2 = regels[i + 2];
    if (!line1.startsWith('1 ') || !line2.startsWith('2 ')) continue;
    const noradId = parseerNoradId(line1);
    const internationaalId = parseerInternationaalId(line1);
    const meanMotion = parseerMeanMotion(line2);
    if (!Number.isFinite(noradId) || !Number.isFinite(meanMotion) || !internationaalId) continue;
    objecten.push({ naam, line1, line2, noradId, meanMotion, lancering: internationaalId.slice(0, 5) }); // "JJNNN"
  }
  return objecten;
}

async function identificeerTrein() {
  const res = await fetch(CELESTRAK_STARLINK_URL);
  if (!res.ok) throw new Error(`CelesTrak Starlink-groep gaf status ${res.status}`);
  const tekst = await res.text();
  const objecten = parseerDrieregeligeTle(tekst);

  const perLancering = new Map();
  for (const o of objecten) {
    if (!perLancering.has(o.lancering)) perLancering.set(o.lancering, []);
    perLancering.get(o.lancering).push(o);
  }

  // "JJNNN" sorteert als tekst niet correct over een eeuwgrens heen (bijv.
  // "99364" > "00001"), maar dat is hier niet aan de orde: het gaat altijd
  // om lanceringen uit de laatste jaren, geen eeuwgrens in zicht.
  const lanceringen = [...perLancering.keys()].sort().reverse().slice(0, TREIN_LANCERINGEN_TERUGKIJKEN);

  for (const lancering of lanceringen) {
    const groep = perLancering.get(lancering);
    if (groep.length < TREIN_SATELLIETEN_MIN || groep.length > TREIN_SATELLIETEN_MAX) continue;

    const meanMotions = groep.map((o) => o.meanMotion);
    const spreiding = Math.max(...meanMotions) - Math.min(...meanMotions);
    const gemiddelde = meanMotions.reduce((a, b) => a + b, 0) / meanMotions.length;
    if (spreiding > TREIN_MEAN_MOTION_SPREIDING_MAX || gemiddelde < TREIN_MEAN_MOTION_MIN) continue;

    // Representant: de satelliet met de mediane mean motion van de groep —
    // iets robuuster dan gewoon de eerste in de lijst, mocht daar toevallig
    // net een uitschieter tussen zitten die al begonnen is met klimmen.
    const gesorteerd = [...groep].sort((a, b) => a.meanMotion - b.meanMotion);
    const representant = gesorteerd[Math.floor(gesorteerd.length / 2)];

    return {
      noradId: representant.noradId,
      naam: representant.naam,
      line1: representant.line1,
      line2: representant.line2,
      lancering,
      aantalSatellieten: groep.length,
    };
  }

  return null; // geen van de recentste lanceringen is nu nog een herkenbare trein
}

export async function fetchStarlinkTrein({ homeLat, homeLon }) {
  const lat = homeLat ?? 52.09;
  const lon = homeLon ?? 5.12;

  const trein = await identificeerTrein();
  laatsteTrein = trein;
  if (!trein) {
    console.log('[weer] starlinkTrein: geen van de recentste lanceringen is nu nog een herkenbare trein');
    laatsteAanbevolenPassage = null;
    return [];
  }
  console.log(
    `[weer] starlinkTrein: trein gevonden — ${trein.naam}, lancering ${trein.lancering}, ${trein.aantalSatellieten} satellieten, representant NORAD ${trein.noradId}`
  );

  const { signalen, aanbevolenPassage } = await haalPassagesOp({
    noradId: trein.noradId,
    lat,
    lon,
    idVoorvoegsel: 'starlink',
    titelVoorvoegsel: 'Starlink-trein',
    bronUrl: `https://www.n2yo.com/satellite/?s=${trein.noradId}`,
    minElevatieGraden: MIN_ELEVATIE_GRADEN,
    lookaheadUren: LOOKAHEAD_UREN,
    minDuurMinuten: MIN_DUUR_MINUTEN,
    nuttigVensterStartUur: NUTTIG_VENSTER_START_UUR,
    nuttigVensterEindUur: NUTTIG_VENSTER_EIND_UUR,
  });
  laatsteAanbevolenPassage = aanbevolenPassage;

  // 2026-08-22, op verzoek van Lex ("starlink verschijnt pas als er een
  // treintje is?") — klopte, en dat was een net iets te strenge koppeling:
  // haalPassagesOp() hierboven geeft alleen passages ≥30° elevatie binnen
  // 72 uur terug (signalen), en de hele Starlink-subgroep op Hemel (dus ook
  // de "📍 Live op kaart"-knop, zie renderSky() in app.js) verschijnt alleen
  // als die lijst niet leeg is. Maar live-tracking zelf (starlinkLive.js)
  // heeft alleen huidigeTreinTle() nodig, geen aankomende hoge passage — dus
  // als er wél een trein gevonden is maar toevallig geen passage die hoog
  // genoeg komt, bleef de knop ten onrechte verborgen terwijl live volgen
  // prima had gekund. Vandaar dit informatieve kaartje als fallback: geen
  // "aanbevolen"-passage/sterren (die zijn er dan simpelweg niet), maar wel
  // genoeg om de subgroep + volgknop te tonen. Zie hemelSub() in app.js voor
  // hoe dit kaartje leest (detail.geenPassageBinnenkort onderscheidt 'm van
  // de normale passage-kaartjes hierboven, die dat veld niet hebben).
  if (signalen.length === 0) {
    console.log('[weer] starlinkTrein: trein gevonden maar geen passage ≥30° binnen 72 uur — toon toch een kaartje voor live-tracking');
    signalen.push(
      makeSignal({
        id: `starlink-trein-status-${trein.lancering}`,
        categorie: 'hemel',
        titel: `Starlink-trein (${trein.naam}) — geen hoge passage binnenkort`,
        ernst: 'info',
        tijd: new Date().toISOString(),
        detail: {
          lancering: trein.lancering,
          aantalSatellieten: trein.aantalSatellieten,
          geenPassageBinnenkort: true,
        },
      })
    );
  }

  return signalen;
}

// Zelfde soort eigen, snelle 30s-timer als controleerIssAlarm() (zie
// celestrak.js/server.js) — alleen de aankondigingstermijn wijkt af: Lex
// wilde voor de trein 5 minuten in plaats van 2.
export function controleerStarlinkAlarm() {
  controleerPassageAlarm(laatsteAanbevolenPassage, {
    vooraankondigingSeconden: 5 * 60,
    alarmIdVoorvoegsel: 'starlink-alarm',
    titelVoorvoegsel: 'Starlink-trein',
  });
}

// Voor starlinkLive.js — hergebruikt de TLE van de laatste (6-uurs) poll
// i.p.v. zelf nog een keer bij CelesTrak te bevragen; SGP4-propagatie zelf
// kost geen netwerk, alleen deze ene ruwe TLE die maar zelden verandert.
export function huidigeTreinTle() {
  return laatsteTrein;
}
