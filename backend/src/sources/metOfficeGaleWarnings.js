// metOfficeGaleWarnings.js — de "Gale warnings"-sectie van de UK Met Office
// Shipping Forecast als échte meldingen (categorie 'weerwaarschuwing'),
// 2026-09-06 op verzoek van Lex. Aanleiding: op de Zeekaart stond bij Forties
// "4→8" (dat is de synopsis uit metOfficeZeeForecast.js, een verwachting),
// maar in Meldingen stond geen enkele gale warning voor de UK-zeegebieden.
// Die komen officieel via NAVTEX van Cullercoats ('G'), ~600 km weg en dus
// niet betrouwbaar te ontvangen -- terwijl dezelfde printpagina die we al
// 4x per dag ophalen de gale warnings gewoon plat in tekst heeft staan
// ("Fisher, issued: 21:56 (UTC+1) on Sat 5 Sep 2026 / Northwesterly gale
// force 8 continuing"). metOfficeZeeForecast.js slaat die kop bewust over
// (geen zeegebied); hier lezen we 'm juist wél.
//
// Parse-aanpak: NIET op HTML-structuur (die van de gale-sectie is niet
// geverifieerd), maar op de platte tekst tot de volgende kop, met een regex
// op het vaste patroon "<Gebied>, issued: HH:MM (UTC±N) on Ddd D Mmm YYYY
// <tekst>" -- het volgende "<Gebied>, issued:" sluit de tekst af. Geen enkele
// gale warning ("There are no gale warnings in force") geeft gewoon 0
// signalen, geen fout.
//
// Ernst/kleur volgt de Beaufort-schaal van de Met Office zelf: gale 8 en
// severe gale 9 = Oranje/waarschuwing, storm 10 en hoger (storm, violent
// storm, hurricane force) = Rood/kritiek. Zelfde kleurenpil als het
// KNMI-weeralarm (detail.kleur, zie maakMeldingItem() in app.js).
import * as cheerio from 'cheerio';
import { makeSignal } from '../normalize.js';
import { haalHtml, tekstTotVolgendeKop, GEBIEDSNAMEN, uitgifteTijdIn } from './metOfficeZeeForecast.js';

const BRON_URL = 'https://weather.metoffice.gov.uk/specialist-forecasts/coast-and-sea/print/shipping-forecast';

// Grove middelpunten van de 31 zeegebieden (lat, lon) voor de kaartmarker --
// de tien gebieden dicht bij huis hebben in app.js (ZEE_GEBIEDEN) al een echte
// omtrek, de rest is alleen een punt. Geschat, niet officieel.
const MIDDELPUNT = {
  'Viking': [59.8, 2.0], 'North Utsire': [60.5, 4.0], 'South Utsire': [58.5, 5.0],
  'Forties': [57.2, 1.5], 'Cromarty': [57.7, -2.5], 'Forth': [56.5, -1.8],
  'Tyne': [55.1, -0.5], 'Dogger': [55.1, 2.5], 'Fisher': [56.9, 6.0],
  'German Bight': [54.5, 6.5], 'Humber': [53.5, 1.8], 'Thames': [52.0, 2.5],
  'Dover': [50.9, 1.2], 'Wight': [50.3, -1.0], 'Portland': [50.0, -2.8],
  'Plymouth': [49.5, -4.5], 'Biscay': [46.0, -5.5], 'Trafalgar': [38.5, -9.5],
  'FitzRoy': [44.5, -10.0], 'Sole': [48.5, -8.5], 'Lundy': [51.2, -5.3],
  'Fastnet': [50.5, -8.5], 'Irish Sea': [53.5, -5.0], 'Shannon': [52.5, -12.0],
  'Rockall': [56.0, -15.0], 'Malin': [55.6, -8.5], 'Hebrides': [57.5, -9.5],
  'Bailey': [59.0, -12.5], 'Fair Isle': [59.7, -1.5], 'Faeroes': [62.0, -7.0],
  'Southeast Iceland': [63.0, -14.0],
};

const MAANDEN_KORT = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };

function issuedNaarIso(uur, minuut, utcOffset, dag, maandKort, jaar) {
  const maand = MAANDEN_KORT[maandKort.toUpperCase()];
  if (maand == null) return null;
  const d = new Date(Date.UTC(Number(jaar), maand, Number(dag), Number(uur) - Number(utcOffset), Number(minuut)));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Zwaarste windkracht in de waarschuwingstekst: "gale force 8", "severe gale
// force 9", "storm force 10", "violent storm force 11", "hurricane force 12".
function windkrachtIn(tekst) {
  let max = 0;
  for (const m of tekst.matchAll(/\bforce\s+(\d{1,2})\b/gi)) max = Math.max(max, Number(m[1]));
  if (max === 0) {
    const t = tekst.toLowerCase();
    if (/hurricane/.test(t)) max = 12;
    else if (/violent storm/.test(t)) max = 11;
    else if (/\bstorm\b/.test(t)) max = 10;
    else if (/severe gale/.test(t)) max = 9;
    else if (/\bgale\b/.test(t)) max = 8;
  }
  return max;
}

const GEBIED_ALTERNATIEF = GEBIEDSNAMEN.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
const ENTRY_RE = new RegExp(
  `\\b(${GEBIED_ALTERNATIEF}),?\\s*issued:\\s*(\\d{1,2}):(\\d{2})\\s*\\(UTC([+-]\\d{1,2})\\)\\s*on\\s+[A-Za-z]{3}\\s+(\\d{1,2})\\s+([A-Za-z]{3})\\s+(\\d{4})\\s*`,
  'gi',
);

export function parseGaleWarnings(html) {
  const $ = cheerio.load(html);
  const kop = $('h1,h2,h3,h4,h5,h6').toArray().find((k) => /^\s*gale warnings?\s*$/i.test($(k).text()));
  let tekst = kop ? tekstTotVolgendeKop($, kop) : '';
  if (!tekst.trim()) {
    // Terugval als de kop geen sibling-tekst heeft (bv. in een eigen wrapper):
    // de platte paginatekst tussen "Sea area gale warnings" en de synopsis-kop.
    const plat = $('body').text().replace(/\s+/g, ' ');
    const start = plat.search(/Sea area gale warnings/i);
    if (start < 0) return null; // structuur gewijzigd, laat de aanroeper beslissen
    const rest = plat.slice(start);
    const eind = rest.search(/general synopsis/i);
    tekst = eind > 0 ? rest.slice(0, eind) : rest;
  }
  const treffers = [...tekst.matchAll(ENTRY_RE)];
  const resultaat = [];
  treffers.forEach((m, i) => {
    const einde = i + 1 < treffers.length ? treffers[i + 1].index : tekst.length;
    const waarschuwing = tekst.slice(m.index + m[0].length, einde).trim().replace(/\s+$/, '');
    const gebiedCanoniek = GEBIEDSNAMEN.find((n) => n.toLowerCase() === m[1].toLowerCase()) ?? m[1];
    resultaat.push({
      gebied: gebiedCanoniek,
      uitgegeven: issuedNaarIso(m[2], m[3], m[4], m[5], m[6], m[7]),
      tekst: waarschuwing,
    });
  });
  return { tekst, warnings: resultaat };
}

export async function fetchMetOfficeGaleWarnings() {
  const html = await haalHtml();
  const geparsed = parseGaleWarnings(html);
  if (!geparsed) throw new Error('kop "Gale warnings" niet gevonden op de Met Office-pagina — structuur mogelijk gewijzigd');
  const paginaUitgegeven = uitgifteTijdIn(html);
  const signalen = geparsed.warnings.flatMap((w) => {
    const punt = MIDDELPUNT[w.gebied];
    if (!punt) return [];
    const kracht = windkrachtIn(w.tekst);
    const rood = kracht >= 10;
    const slug = w.gebied.toLowerCase().replace(/[^a-z]+/g, '-');
    return [makeSignal({
      id: `metoffice-gale-${slug}`,
      categorie: 'weerwaarschuwing',
      titel: `Gale warning - ${w.gebied}`,
      ernst: rood ? 'kritiek' : 'waarschuwing',
      lat: punt[0],
      lon: punt[1],
      tijd: w.uitgegeven ?? paginaUitgegeven ?? new Date().toISOString(),
      detail: {
        gebied: w.gebied,
        fenomeenTekst: 'wind',
        headline: `Gale warning ${w.gebied}`,
        omschrijving: w.tekst,
        kleur: rood ? 'Rood' : 'Oranje',
        windkracht: kracht || null,
        geldigVan: w.uitgegeven,
        subtitel: `Met Office Shipping Forecast · zeegebied ${w.gebied}${kracht ? ` · windkracht ${kracht}` : ''}`,
        bronUrl: BRON_URL,
      },
    })];
  });
  const zonderPunt = geparsed.warnings.length - signalen.length;
  console.log(`[weer] metoffice-gale: ${geparsed.warnings.length} gale warning(s) op de pagina${zonderPunt ? ` (${zonderPunt} zonder bekend gebied overgeslagen)` : ''}${geparsed.warnings.length ? ': ' + geparsed.warnings.map((w) => w.gebied).join(', ') : ''}.`);
  return signalen;
}
