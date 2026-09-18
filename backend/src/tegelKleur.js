// 2026-09-17, op verzoek van Lex: de blauwgrijze "MarineTraffic"-kleuring van
// de donkere Stadia-kaart, maar dan op de SERVER i.p.v. als CSS-filter in de
// browser.
//
// Waarom: in de app staat die kleuring als
//   filter: sepia(0.5) hue-rotate(175deg) saturate(2) contrast(1.2) brightness(1.08)
// op elke Leaflet-tegel (zie #map.zee-modus-actief.vaar-modus-actief in
// styles.css). Dat kan alleen in een DOM-laag. De Cesium-bol tekent de kaart
// als WebGL-textuur; Cesium heeft per laag wel helderheid/contrast/
// verzadiging/kleurdraai, maar geen sepia -- en zonder die sepia-stap valt er
// op een vrijwel kleurloos grijs niets te draaien. Vandaar hier, één keer per
// tegel, met exact dezelfde formules. Het resultaat gaat gewoon de bestaande
// tegel-schijfcache in, dus het rekenwerk gebeurt per tegel maar één keer.
//
// De formules komen uit de Filter Effects-standaard (dezelfde die de browser
// gebruikt), toegepast in de volgorde waarin ze in de CSS staan, op
// niet-voorvermenigvuldigde sRGB-waarden; alpha blijft ongemoeid.
// Gecontroleerd tegen Lex' eigen canvas-metingen van 3 september: Stadia-water
// (grijs 34) werd daar ~12,21,31 en land (grijs 51) ~34,47,61; deze code geeft
// 14,22,33 en 35,47,63.
import { PNG } from 'pngjs';

const SEPIA = 0.5;
const HUE_GRADEN = 175;
const VERZADIGING = 2;
const CONTRAST = 1.2;
const HELDERHEID = 1.08;

function maal(A, B) {
  const C = [];
  for (let i = 0; i < 3; i++) {
    C[i] = [];
    for (let j = 0; j < 3; j++) {
      let som = 0;
      for (let k = 0; k < 3; k++) som += A[i][k] * B[k][j];
      C[i][j] = som;
    }
  }
  return C;
}

function sepiaMatrix(hoeveelheid) {
  const I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const S = [[0.393, 0.769, 0.189], [0.349, 0.686, 0.168], [0.272, 0.534, 0.131]];
  return I.map((rij, i) => rij.map((v, j) => v * (1 - hoeveelheid) + S[i][j] * hoeveelheid));
}

function hueMatrix(graden) {
  const r = (graden * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [
    [0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928],
    [0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283],
    [0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072],
  ];
}

function verzadigingMatrix(a) {
  return [
    [0.213 + a * 0.787, 0.715 - a * 0.715, 0.072 - a * 0.072],
    [0.213 - a * 0.213, 0.715 + a * 0.285, 0.072 - a * 0.072],
    [0.213 - a * 0.213, 0.715 - a * 0.715, 0.072 + a * 0.928],
  ];
}

// sepia -> kleurdraai -> verzadiging zijn alle drie 3x3-matrices en worden
// vooraf tot één matrix samengevoegd. contrast en helderheid werken per kanaal
// en samen zijn ze y = SCHAAL * x + VERSCHUIVING.
const M = maal(verzadigingMatrix(VERZADIGING), maal(hueMatrix(HUE_GRADEN), sepiaMatrix(SEPIA)));
const SCHAAL = HELDERHEID * CONTRAST;
const VERSCHUIVING = HELDERHEID * (0.5 - 0.5 * CONTRAST);

// Opzoektabel per kanaalcombinatie kan niet (de uitvoer hangt van alle drie de
// invoerkanalen af), maar de kaarttegels zijn klein (256x256) en het gebeurt
// maar één keer per tegel, vóór het cachen.
export function kleurTegelMarine(buffer) {
  const png = PNG.sync.read(buffer);
  const d = png.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue; // volledig doorzichtig: niets te kleuren
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    for (let k = 0; k < 3; k++) {
      const v = M[k][0] * r + M[k][1] * g + M[k][2] * b;
      const uit = v * SCHAAL + VERSCHUIVING;
      d[i + k] = uit <= 0 ? 0 : uit >= 1 ? 255 : Math.round(uit * 255);
    }
  }
  return PNG.sync.write(png);
}

// 2026-09-18, op verzoek van Lex: dezelfde truc nog een keer, nu voor de
// STANDAARDKAART van de app -- de "Storm Noir"-look. Dat is de gewone
// OSM-tegel met
//   filter: invert(1) hue-rotate(200deg) brightness(0.95) contrast(0.9) saturate(1.4)
// erover (zie #map .leaflet-tile-pane .leaflet-tile in styles.css). Cesium
// heeft per laag wel helderheid/contrast/verzadiging/kleurdraai, maar geen
// invert -- en juist die invert maakt deze kaart. Dus ook hier: één keer per
// tegel op de server, vóór het cachen.
//
// Anders dan bij marine hierboven worden de stappen NIET tot één matrix
// samengevouwen. De browser zet het tussenresultaat na elke filterstap terug
// in een 8-bits buffer en klemt daarbij op [0,1]; bij saturate(1.4) over felle
// kleuren (de rode wegen van OSM) scheelt dat zichtbaar. Volgorde hier is dus
// letterlijk die van de CSS: invert, kleurdraai (klemmen), helderheid+contrast,
// verzadiging (klemmen).
//
// Gecontroleerd tegen Chromium zelf (canvas met ctx.filter = dezelfde keten)
// op tien typische OSM-kleuren -- papier, bos, weiland, water, snelweg-rood,
// hoofdweg-oranje, wit, zwart, grens-paars en tekstgrijs: hoogstens 3 van 255
// verschil per kanaal. Dat zit in hoe de browser tussenresultaten afrondt en
// is met het blote oog niet te zien.
const NOIR_HUE_GRADEN = 200;
const NOIR_VERZADIGING = 1.4;
const NOIR_HELDERHEID = 0.95;
const NOIR_CONTRAST = 0.9;
const NOIR_HUE = hueMatrix(NOIR_HUE_GRADEN);
const NOIR_SAT = verzadigingMatrix(NOIR_VERZADIGING);
// brightness(0.95) en daarna contrast(0.9) werken per kanaal en zijn samen
// y = SCHAAL * x + VERSCHUIVING. Let op de volgorde: hier staat brightness
// vóór contrast in de CSS (bij marine andersom), dus de verschuiving komt
// alleen van het contrast. Het bereik blijft [0,05 .. 0,905] -- daartussen
// hoeft dus niet geklemd.
const NOIR_SCHAAL = NOIR_HELDERHEID * NOIR_CONTRAST;
const NOIR_VERSCHUIVING = 0.5 - 0.5 * NOIR_CONTRAST;

function klem(v) {
  return v <= 0 ? 0 : v >= 1 ? 1 : v;
}

export function kleurTegelNoir(buffer) {
  const png = PNG.sync.read(buffer);
  const d = png.data;
  const a = [0, 0, 0];
  const b = [0, 0, 0];
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue; // volledig doorzichtig: niets te kleuren
    for (let k = 0; k < 3; k++) a[k] = 1 - d[i + k] / 255; // invert(1)
    for (let k = 0; k < 3; k++) b[k] = klem(NOIR_HUE[k][0] * a[0] + NOIR_HUE[k][1] * a[1] + NOIR_HUE[k][2] * a[2]);
    for (let k = 0; k < 3; k++) a[k] = b[k] * NOIR_SCHAAL + NOIR_VERSCHUIVING;
    for (let k = 0; k < 3; k++) {
      const v = klem(NOIR_SAT[k][0] * a[0] + NOIR_SAT[k][1] * a[1] + NOIR_SAT[k][2] * a[2]);
      d[i + k] = Math.round(v * 255);
    }
  }
  return PNG.sync.write(png);
}
