// Meteorenzwermen — geen live API, dit zijn jaarlijks vrijwel vaste
// kalenderdata (IMO-jaaroverzicht, 1x per jaar handmatig te controleren).
// Puur lokale berekening, zelfde aanpak als moon.js.
//
// 2026-08-21, op verzoek van Lex ("Er zijn meerdere zwermen. Maak er iets van
// als 'Nog zoveel dagen tot:' en dan de zwermnaam"): tot nu toe liet deze bron
// alléén iets zien zolang we ín het actieve venster van een zwerm zaten, en
// zweeg de rest van het jaar. Gevolg: negen dagen ná de Perseïden-piek stond
// er nog steeds "Perseïden actief" zonder dat zichtbaar was dat het feest
// voorbij was, en drie weken later stond er niets meer. Nu is het een
// doorlopende aftelling: eerst wat er nu daadwerkelijk aan de gang is, daarna
// de eerstvolgende zwermen als "Nog N dagen tot: <naam>".
import { makeSignal } from '../normalize.js';

// [maand, dag], 1-geïndexeerd. "van"/"tot" mag het jaar doorkruisen
// (bijv. Quadrantiden: eind december t/m half januari).
const ZWERMEN = [
  { naam: 'Quadrantiden', van: [12, 28], piek: [1, 3], tot: [1, 12], zhr: 120 },
  { naam: 'Lyriden', van: [4, 16], piek: [4, 22], tot: [4, 25], zhr: 18 },
  { naam: 'Eta Aquariden', van: [4, 19], piek: [5, 5], tot: [5, 28], zhr: 50 },
  { naam: 'Perseïden', van: [7, 17], piek: [8, 12], tot: [8, 24], zhr: 100 },
  { naam: 'Orioniden', van: [10, 2], piek: [10, 21], tot: [11, 7], zhr: 20 },
  { naam: 'Leoniden', van: [11, 6], piek: [11, 17], tot: [11, 30], zhr: 15 },
  { naam: 'Geminiden', van: [12, 4], piek: [12, 14], tot: [12, 17], zhr: 150 },
  { naam: 'Ursiden', van: [12, 17], piek: [12, 22], tot: [12, 26], zhr: 10 },
];

// Hoeveel nog-niet-begonnen zwermen we vooruit tonen. Alle acht zou de
// Ruimte-rubriek in één klap een jaarkalender maken (en de ISS-/aurora-
// kaartjes wegdrukken); drie is genoeg om altijd "wat komt er nu aan" te
// beantwoorden zonder dat het een lijst wordt.
const AANKOMEND_MAX = 3;

const DAG_MS = 24 * 60 * 60 * 1000;

function ordinaal(maand, dag, jaar) {
  return Date.UTC(jaar, maand - 1, dag);
}

function dagenTussen(vanTs, totTs) {
  return Math.round((totTs - vanTs) / DAG_MS);
}

// Het concrete venster (start/eind als tijdstempel) waar `nuTs` in valt, of
// null als de zwerm nu niet loopt. Kijkt bewust naar drie mogelijke startjaren
// zodat een venster dat de jaarwisseling doorkruist (Quadrantiden) ook klopt
// als we er in januari middenin zitten.
function actiefVenster(nuTs, jaar, zwerm) {
  for (const j of [jaar - 1, jaar, jaar + 1]) {
    const start = ordinaal(zwerm.van[0], zwerm.van[1], j);
    let eind = ordinaal(zwerm.tot[0], zwerm.tot[1], j);
    if (eind < start) eind = ordinaal(zwerm.tot[0], zwerm.tot[1], j + 1);
    if (nuTs >= start && nuTs <= eind) return { start, eind };
  }
  return null;
}

// De piek die bij dít venster hoort (kan in het volgende kalenderjaar liggen,
// zie Quadrantiden: venster start 28 dec, piek 3 jan).
function piekInVenster(venster, piek) {
  const startJaar = new Date(venster.start).getUTCFullYear();
  for (const j of [startJaar, startJaar + 1]) {
    const p = ordinaal(piek[0], piek[1], j);
    if (p >= venster.start && p <= venster.eind) return p;
  }
  return null;
}

// Eerstvolgende piek vanaf vandaag (voor zwermen die nog moeten beginnen).
function volgendePiek(nuTs, jaar, piek) {
  for (const j of [jaar, jaar + 1]) {
    const p = ordinaal(piek[0], piek[1], j);
    if (p >= nuTs) return p;
  }
  return ordinaal(piek[0], piek[1], jaar + 1);
}

function dagenTekst(n) {
  return `${n} ${n === 1 ? 'dag' : 'dagen'}`;
}

export async function fetchMeteors() {
  const nu = new Date();
  const jaar = nu.getUTCFullYear();
  const nuTs = Date.UTC(jaar, nu.getUTCMonth(), nu.getUTCDate());

  const actief = [];
  const aankomend = [];

  for (const zwerm of ZWERMEN) {
    const id = `meteors-${zwerm.naam.toLowerCase().replace(/\s+/g, '-')}`;
    const venster = actiefVenster(nuTs, jaar, zwerm);

    if (venster) {
      const piekTs = piekInVenster(venster, zwerm.piek);
      const dagenTotPiek = piekTs == null ? null : dagenTussen(nuTs, piekTs);
      const dagenTotEind = dagenTussen(nuTs, venster.eind);

      // Drie standen binnen een lopend venster: de pieknacht zelf, de aanloop
      // ernaartoe (aftellen, wat Lex wilde zien) en de uitloop erna — die
      // laatste telt af naar het einde van het venster in plaats van naar de
      // piek, want een piek die al geweest is valt niet af te tellen.
      let status;
      let titel;
      let ernst = 'let-op';
      if (dagenTotPiek === 0) {
        status = 'piek';
        titel = `${zwerm.naam} - vannacht op zijn piek`;
      } else if (dagenTotPiek != null && dagenTotPiek > 0) {
        status = 'aanloop';
        titel = `Nog ${dagenTekst(dagenTotPiek)} tot: ${zwerm.naam}`;
        if (dagenTotPiek > 3) ernst = 'info';
      } else {
        status = 'uitloop';
        ernst = 'info';
        titel =
          dagenTotEind <= 0
            ? `${zwerm.naam} - vannacht de laatste kans`
            : `${zwerm.naam} - nog ${dagenTekst(dagenTotEind)} actief`;
      }

      actief.push({
        sorteer: status === 'uitloop' ? 10_000 + dagenTotEind : (dagenTotPiek ?? 0),
        signaal: makeSignal({
          id,
          categorie: 'hemel',
          titel,
          ernst,
          tijd: nu.toISOString(),
          detail: {
            zwerm: zwerm.naam,
            zhrPerUur: zwerm.zhr,
            status,
            actief: true,
            pieknacht: status === 'piek',
            dagenTotPiek: dagenTotPiek != null && dagenTotPiek >= 0 ? dagenTotPiek : null,
            dagenSindsPiek: dagenTotPiek != null && dagenTotPiek < 0 ? Math.abs(dagenTotPiek) : null,
            dagenTotEind,
            piekIso: piekTs == null ? null : new Date(piekTs).toISOString(),
            eindIso: new Date(venster.eind).toISOString(),
          },
        }),
      });
      continue;
    }

    const piekTs = volgendePiek(nuTs, jaar, zwerm.piek);
    const dagenTotPiek = dagenTussen(nuTs, piekTs);
    aankomend.push({
      sorteer: dagenTotPiek,
      signaal: makeSignal({
        id,
        categorie: 'hemel',
        titel: `Nog ${dagenTekst(dagenTotPiek)} tot: ${zwerm.naam}`,
        ernst: 'info',
        tijd: nu.toISOString(),
        detail: {
          zwerm: zwerm.naam,
          zhrPerUur: zwerm.zhr,
          status: 'aankomend',
          actief: false,
          pieknacht: false,
          dagenTotPiek,
          dagenSindsPiek: null,
          dagenTotEind: null,
          piekIso: new Date(piekTs).toISOString(),
          eindIso: null,
        },
      }),
    });
  }

  // Alle meteorensignalen dragen hetzelfde tijdstempel (`nu`), dus de
  // frontend-sortering (ernst, dan tijd) laat ze onderling in deze volgorde
  // staan: lopende zwermen eerst (pieknacht bovenaan, uitlopers onderaan),
  // daarna de aftelling naar wat er aankomt.
  actief.sort((a, b) => a.sorteer - b.sorteer);
  aankomend.sort((a, b) => a.sorteer - b.sorteer);

  return [...actief, ...aankomend.slice(0, AANKOMEND_MAX)].map((r) => r.signaal);
}
