// Windvaan-parsers (frontend/app.js) — regressietests op ECHTE teksten uit
// Lex' eigen NAVTEX-ontvangst en de Met Office/KNMI-synopsis van 2026-08-28.
// De functies worden rechtstreeks uit app.js geknipt (zelfde truc als de
// andere extractie-tests): geen DOM/Leaflet nodig, laatsteMeldingenSignalen
// en Date worden per geval geïnjecteerd.
//
// Draaien: node test/frontend/windvaan-test.mjs   (exit 1 bij falen)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const hier = path.dirname(fileURLToPath(import.meta.url));
const appPad = ['../../frontend/app.js', '../../app.js']
  .map((p) => path.join(hier, p))
  .find((p) => fs.existsSync(p));
const app = fs.readFileSync(appPad, 'utf-8');
const code = app.slice(app.indexOf('const GALE_NIVEAUS'), app.indexOf('function galeInfoVoorGebied'));
const maak = new Function(
  'laatsteMeldingenSignalen',
  'Date',
  `${code}\nreturn { galeInfoUitTekst, parseNavtexGaleWarning, navtexGaleInfoPerGebied, eersteWindrichting };`,
);

let fouten = 0;
function check(naam, werkelijk, verwacht) {
  const w = JSON.stringify(werkelijk);
  const v = JSON.stringify(verwacht);
  if (w === v) {
    console.log(`OK   ${naam}`);
  } else {
    fouten++;
    console.log(`FOUT ${naam}\n     kreeg:    ${w}\n     verwacht: ${v}`);
  }
}
const kort = (info) => (info === null ? null : {
  kracht: info.kracht, trend: info.trend, richting: info.richting?.nl ?? null,
  huidigeKracht: info.huidigeKracht, naKracht: info.naKracht,
});
const kortLijst = (lijst) => lijst.map((u) => `${u.gebied}:${u.kracht}${u.trend}${u.richting ? u.richting.nl : ''}`);

const fns = maak([], Date);

// ---- galeInfoUitTekst: eerdere live-gevallen van Lex (2026-08-27) ------
check('gale later -> huidige kracht + pijl omhoog (Forties-kop met windstreek)',
  kort(fns.galeInfoUitTekst('Northeast Forties: Southeasterly 5 to 7, perhaps gale 8 later')),
  { kracht: 8, trend: '↗', richting: 'ZO', huidigeKracht: 7, naKracht: null });

check('gale AT FIRST -> nu gale, zakt af (echte Fisher-tekst)',
  kort(fns.galeInfoUitTekst('Easterly or southeasterly veering southerly or southwesterly, 4 to 6, but 7 or gale 8 at first in north Fisher.', 'Fisher')),
  { kracht: 8, trend: '↘', richting: 'O', huidigeKracht: null, naKracht: 6 });

// ---- 2026-08-28: gale die expliciet bij een ANDER gebied hoort ---------
// Zelfde gedeelde Met Office-tekst, maar dan gelezen voor German Bight:
// "gale 8 ... in north Fisher" is niet van ons -> geen vaan.
check('gedeelde tekst, gale hoort bij Fisher -> German Bight geen vaan',
  fns.galeInfoUitTekst('Easterly or southeasterly veering southerly or southwesterly, 4 to 6, but 7 or gale 8 at first in north Fisher.', 'German Bight'),
  null);

check('"occasionally gale 8 in South Utsire" -> Forties geen vaan',
  fns.galeInfoUitTekst('Northeast Forties: Easterly 6 or 7, occasionally gale 8 in South Utsire, becoming cyclonic 4 to 6.', 'Forties'),
  null);

// "IN PRECIPITATION" (KNMI-stijl) is geen gebiedsnaam en wist dus niets.
check('IN PRECIPITATION perkt een echte gale niet in',
  kort(fns.galeInfoUitTekst('Southwest 5 to 7, gale 8 expected, in precipitation moderate visibility.', 'Dogger'))?.kracht,
  8);

// "risk of a thunderstorm" (echte KNMI-tekst) mag nooit als STORM tellen.
check('THUNDERSTORM is geen STORM',
  fns.galeInfoUitTekst('Southerly 2-4, increasing southwest 4-5, later possibly 6, occasional showers, risk of a thunderstorm and hail, visibility good.', 'Dogger'),
  null);

// ---- parseNavtexGaleWarning: echte eigen-ontvangst-berichten -----------
check('PB04 (echte ontvangst 28-08 07:02): Dover+Thames 7, rest expliciet schoon',
  kortLijst(fns.parseNavtexGaleWarning('GALEWARNING, DTG 28 AUG 0702 UTC.\nDOVER. THAMES.\nSOUTHWEST 7.\nHUMBER. GERMAN BIGHT. DOGGER.\nNO WARNING.\nNNNN')),
  ['Dover:7ZW', 'Thames:7ZW', 'Humber:null', 'German Bight:null', 'Dogger:null']);

check('PB01 (kustwacht): gebiedsnaam en windzin in EEN zin',
  kortLijst(fns.parseNavtexGaleWarning('GALEWARNING NETHERLANDS COAST GUARD DTG 271251 UTC AUG\nGERMAN BIGHT EAST TO SOUTHEAST 7.\nOTHER DISTRICTS NO WARNING.\nNNNN')),
  ['German Bight:7O']);

check('PB03 (all-clear): alle vijf gebieden expliciet schoon',
  kortLijst(fns.parseNavtexGaleWarning('GALEWARNING, 28 AUG 02:11 UTC.\nDOVER. THAMES. HUMBER. GERMAN BIGHT. DOGGER.\nNO WARNING.\n\nEND OF GALEWARNING\nNNNN')),
  ['Dover:null', 'Thames:null', 'Humber:null', 'German Bight:null', 'Dogger:null']);

// PE-forecast (echte PE24): de verwachtingssecties na SYNOPSIS noemen
// dezelfde gebieden opnieuw met gewone cijfers — die gaven spookvanen.
check('PE-forecast: alleen de warning-sectie telt, verwachting geeft geen spookvanen',
  kortLijst(fns.parseNavtexGaleWarning(
    'FORECAST DUTCH EEZ ISSUED AT 23:38 UTC 270826.\n\nGALE WARNINGS.\nTHAMES. HUMBER. GERMAN BIGHT. DOGGER.\nNO WARNING.\n\nSYNOPSIS.\nLOW, 1003, OVER THE DOGGER IS MOVING NORTH TOWARDS FORTIES.\n\nFORECAST VALID FRIDAY 03:00 TILL FRIDAY 15:00 UTC.\n\nTHAMES.\nSOUTHWEST 5 TO 6, VEERING WEST 4 TO 5.\n\nDOGGER.\nSOUTH 6, LATER DECREASING 4.\nNNNN')),
  ['Thames:null', 'Humber:null', 'German Bight:null', 'Dogger:null']);

check('corrupt maar leesbaar (echte PB05, ",5DTG") parseert gewoon',
  kortLijst(fns.parseNavtexGaleWarning('GALEWARNING,5DTG 28 AUG 0702 UTC.\nDOVER. THAMES.\nSOUTHWEST 7.\nHUMBER. GERMAN BIGHT. DOGGER.\nNO WARNING.\nNNNN')),
  ['Dover:7ZW', 'Thames:7ZW', 'Humber:null', 'German Bight:null', 'Dogger:null']);

// ---- navtexGaleInfoPerGebied: aflossing + venster -----------------------
const warning23 = { categorie: 'navtex', tijd: '2026-08-27T23:00:00Z', detail: { bericht: 'GALEWARNING, DTG 27 AUG 2300 UTC.\nDOVER. THAMES.\nSOUTHWEST 8.\nNNNN', verlopen: false } };
const allClear0211 = { categorie: 'navtex', tijd: '2026-08-28T02:11:00Z', detail: { bericht: 'GALEWARNING, 28 AUG 02:11 UTC.\nDOVER. THAMES. HUMBER. GERMAN BIGHT. DOGGER.\nNO WARNING.\nNNNN', verlopen: false } };
const warning0702 = { categorie: 'navtex', tijd: '2026-08-28T07:02:00Z', detail: { bericht: 'GALEWARNING, DTG 28 AUG 0702 UTC.\nDOVER. THAMES.\nSOUTHWEST 7.\nHUMBER. GERMAN BIGHT. DOGGER.\nNO WARNING.\nNNNN', verlopen: false } };

function perGebiedOm(moment, sigs) {
  class NepDate extends Date { static now() { return new Date(moment).getTime(); } }
  const m = maak(sigs, NepDate).navtexGaleInfoPerGebied();
  return [...m.entries()].map(([g, i]) => `${g}=${i.kracht}`).sort();
}
check('01:00 — alleen de 23:00-warning actief', perGebiedOm('2026-08-28T01:00:00Z', [warning23]), ['Dover=8', 'Thames=8']);
check('03:00 — nieuwere NO WARNING lost oudere warning af', perGebiedOm('2026-08-28T03:00:00Z', [warning23, allClear0211]), []);
check('07:30 — verse warning wint weer van de all-clear', perGebiedOm('2026-08-28T07:30:00Z', [warning23, allClear0211, warning0702]), ['Dover=7', 'Thames=7']);
check('13:30 — 6-uursvenster verlopen', perGebiedOm('2026-08-28T13:30:00Z', [warning23, allClear0211, warning0702]), []);

// ---- 2026-08-28 (2e ronde): voorspelde wind, zicht en drukgebieden ------
// Extractie mét ZEE_GEBIEDEN en de nieuwe functies; L en de synopsis-bron
// worden gestubd (polygoonZwaartepunt gebruikt L.latLng).
const deelGebieden = app.slice(app.indexOf('const ZEE_GEBIEDEN'), app.indexOf('let zeeLaag = null;'));
const deelAllesParsers = app.slice(app.indexOf('const GALE_NIVEAUS'), app.indexOf('function bouwZeeGebiedenLaag()'));
const Lstub = {
  latLng: (lat, lng) => ({ lat, lng }),
  latLngBounds: () => ({ getCenter: () => ({ lat: 0, lng: 0 }) }),
};
const maak2 = new Function(
  'laatsteMeldingenSignalen', 'Date', 'L', 'synopsisBronVoorGebied', 'zeeWaarschuwingenPerGebied',
  `${deelGebieden}${deelAllesParsers}\nreturn { windInfoUitTekst, zichtVoorGebied, parseDrukgebieden, drukgebiedenUitNavtex };`,
);
const stubSynopsis = (teksten) => (naam) => (teksten[naam] ? { bron: 'test', synopsis: { tekst: teksten[naam] } } : null);
const fns2 = maak2([], Date, Lstub, stubSynopsis({}), {});

// windInfoUitTekst — echte teksten van 2026-08-28
check('voorspelde wind: KNMI-vorm ("Southerly 2-4, increasing...")',
  (({ richting, bereik }) => ({ nl: richting.nl, bereik }))(fns2.windInfoUitTekst('Southerly 2-4, increasing southwest 4-5, later possibly 6, occasional showers.')),
  { nl: 'Z', bereik: '2–4' });
check('voorspelde wind: dubbele richting + veering duwt cijfer ver weg',
  (({ richting, bereik }) => ({ nl: richting.nl, bereik }))(fns2.windInfoUitTekst('Easterly or southeasterly veering southerly or southwesterly, 4 to 6, but 7 at first.')),
  { nl: 'O', bereik: '4–6' });
check('voorspelde wind: puur cyclonisch zonder richting -> geen vaan',
  fns2.windInfoUitTekst('Cyclonic 4 to 6, becoming variable.'),
  null);

// zichtVoorGebied — badge alleen bij structureel slecht zicht
const zichtFns = maak2([], Date, Lstub, stubSynopsis({
  Dogger: 'Thundery showers, fog patches. Moderate or good, occasionally poor.',
  Thames: 'Southwest 4 to 6. Moderate or good, occasionally poor.',
  Humber: 'Southwest 5. Visibility poor.',
  Fisher: 'At times thunderstorms with poor visibility.',
}), {});
check('zicht: fog patches -> mist', zichtFns.zichtVoorGebied('Dogger'), 'mist');
check('zicht: "occasionally poor" alleen -> geen badge', zichtFns.zichtVoorGebied('Thames'), null);
check('zicht: kale "visibility poor" -> slecht zicht', zichtFns.zichtVoorGebied('Humber'), 'slecht zicht');
check('zicht: poor door onweersbuien -> geen badge (neerslag-bijzin)', zichtFns.zichtVoorGebied('Fisher'), null);

// parseDrukgebieden — de echte synopsis-vormen uit het ontvangstbestand
const drukKort = (lijst) => lijst.map((u) => ({
  s: u.soort, d: u.druk, pos: u.positie.map((x) => +x.toFixed(1)),
  stat: u.stationair, gr: u.bewegingGraden, doel: u.doel ? u.doel.map((x) => +x.toFixed(1)) : null,
}));
check('druk: KNMI-vorm met gebied + beweging + doel (echte PE24-zin)',
  drukKort(fns2.parseDrukgebieden('LOW, 1003, OVER THE DOGGER IS MOVING NORTH TOWARDS FORTIES.')),
  [{ s: 'LOW', d: 1003, pos: [55.2, 1.9], stat: false, gr: 0, doel: [57.3, 1.5] }]);
check('druk: "WEST OF BRITTANY" -> gazetteer + offset, stationair',
  drukKort(fns2.parseDrukgebieden('LOW, 1007, WEST OF BRITTANY REMAINS FAIRLY STATIONARY.')),
  [{ s: 'LOW', d: 1007, pos: [48, -7.5], stat: true, gr: null, doel: null }]);
check('druk: coordinaten-vorm met EXP-positie (Noorse bulletin-stijl)',
  drukKort(fns2.parseDrukgebieden('LOW 1001 HPA, 49 N 12 W, MOV LITTLE, EXP 1000 HPA AT 49 N 11 W THU 18 UTC.')),
  [{ s: 'LOW', d: 1001, pos: [49, -12], stat: true, gr: null, doel: [49, -11] }]);
check('druk: corrupte druk ("100&") geeft geen symbool',
  fns2.parseDrukgebieden('LOW 100& EXP BY LATE ON THU OVER ENGLANO.'),
  []);

// Noorse NE35-vormen (letterlijk uit de echte, deels corrupte ontvangst)
check('druk: NE35-regel met corrupte huidige positie maar intacte EXP -> geen symbool (EXP nooit als huidig plotten)',
  fns2.parseDrukgebieden('LOW 1005 HPA 5" !, 06 W MOV NE, EXP 995 HPA 57 N 01 E FRI 18 UTC.'),
  []);
check('druk: NE35-regel schoon, EXP zonder "AT"',
  drukKort(fns2.parseDrukgebieden('LOW 1004 HPA 53 N 30 W MOV SE, EXP 1001 HPA 51 N 17 W FRI 18 UTC.')),
  [{ s: 'LOW', d: 1004, pos: [53, -30], stat: false, gr: 135, doel: [51, -17] }]);
check('druk: NE35-regel met corrupte EXP houdt wel zijn huidige positie',
  drukKort(fns2.parseDrukgebieden("HIGH 1028 HPA, 70 N 31 E, !.9; '3 3/0 1027 HPA 60 N 36 E FRI 18 UTC.")),
  [{ s: 'HIGH', d: 1028, pos: [70, 31], stat: false, gr: null, doel: null }]);
check('druk: onmogelijke lengtegraad ("687E") geeft geen symbool',
  fns2.parseDrukgebieden('LOW 988 HPA 72 N 687E MOV S.'),
  []);

// drukgebiedenUitNavtex — merge over KNMI- én Noorse synopsis binnen 15 uur
{
  const pe24 = { categorie: 'navtex', tijd: '2026-08-27T23:38:00Z', detail: { verlopen: false, code: 'PE24', bericht: 'FORECAST DUTCH EEZ ISSUED AT 23:38 UTC 270826.\nGALE WARNINGS.\nTHAMES. HUMBER.\nNO WARNING.\nSYNOPSIS.\nLOW, 1003, OVER THE DOGGER IS MOVING NORTH TOWARDS FORTIES.\nFORECAST VALID FRIDAY 03:00 TILL FRIDAY 15:00 UTC.\nTHAMES.\nSOUTHWEST 3 - 4.' } };
  const ne35 = { categorie: 'navtex', tijd: '2026-08-28T03:00:00Z', detail: { verlopen: false, code: 'NE35', bericht: 'WEATHER BULLETIN ISSUED BY NORWEGIAN METEOROLOGICAL INSTITUTE\nSYNOPTIC SITUATIO TODAY AT 18 UTC:\nLOW 1004 HPA 53 N 30 W MOV SE, EXP 1001 HPA 51 N 17 W FRI 18 UTC.\nFORECAST VALID NEXT 24 HOURS:\nEAST-TAMPEN\nVRB 4.' } };
  const ouderDubbel = { categorie: 'navtex', tijd: '2026-08-27T22:00:00Z', detail: { verlopen: false, code: 'PE23', bericht: 'SYNOPSIS.\nLOW, 1005, OVER THE DOGGER IS MOVING NORTH.\nFORECAST VALID.' } };
  class NepDate extends Date { static now() { return new Date('2026-08-28T10:40:00Z').getTime(); } }
  const bron = maak2([pe24, ne35, ouderDubbel], NepDate, Lstub, stubSynopsis({}), {}).drukgebiedenUitNavtex();
  check('druk uit navtex: KNMI + Noors gemergd, oudere dubbeling van hetzelfde systeem overgeslagen',
    bron?.stelsels.map((s) => `${s.code}:${s.soort}${s.druk}`).sort(),
    ['NE35:LOW1004', 'PE24:LOW1003']);
  class NepDateLaat extends Date { static now() { return new Date('2026-08-28T20:00:00Z').getTime(); } }
  check('druk uit navtex: buiten het 15-uursvenster niets meer',
    maak2([pe24, ne35, ouderDubbel], NepDateLaat, Lstub, stubSynopsis({}), {}).drukgebiedenUitNavtex(),
    null);
}

console.log(fouten ? `\n${fouten} test(s) FALEN` : '\nAlle windvaan-tests slagen');
process.exit(fouten ? 1 : 0);
