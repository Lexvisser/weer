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
