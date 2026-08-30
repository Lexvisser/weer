// metOfficeZeeForecast.js — ECHTE weersynopsis (wind/zeegang/weer/zicht,
// zelfde soort tekst als knmiZeeForecast.js, GEEN scheepvaartwaarschuwingen
// zoals sealagomZeeWaarschuwingen.js) voor de zes zeegebieden die KNMI niet
// dekt (Fisher/Tyne/Forth/Forties/Viking/Dover), 2026-08-24 op verzoek van
// Lex ("Mooi hoor, waar komt de synopsis vandaan voor die gebieden die we
// missen?" → "ja graag" op het voorstel om de UK Met Office Shipping
// Forecast te scrapen).
//
// Bron: de "print"-variant van de Met Office Shipping Forecast
// (.../print/shipping-forecast) — bevat, anders dan de gewone interactieve
// pagina met "kaarten" per gebied, de volledige forecasttekst gewoon plat in
// de HTML (bevestigd via WebFetch: geen JS-rendering nodig). Dekt alle 31
// officiële UK Shipping Forecast-zeegebieden, 4x per dag bijgewerkt
// (2300/0500/1100/1700 UTC) — dus ALLE 10 ZEE_GEBIEDEN uit app.js krijgen
// hiermee in principe een synopsis, niet alleen de zes die KNMI mist. De
// frontend geeft desondanks voorrang aan de KNMI-tekst waar die bestaat (zie
// zeeSynopsisPopupHtml() in app.js) — dat blijft de "eigen" bron dichter bij
// huis, dit is de aanvulling voor de rest.
//
// PARSE-AANPAK: de pagina groepeert soms meerdere gebieden onder één kop
// (bv. "Dover, Wight, Portland, Plymouth" deelt één forecasttekst) — en
// gebiedsnamen komen ook gewoon MIDDEN IN forecasttekst van andere gebieden
// voor (bv. "...Smooth or slight at first in Dover and Wight..." staat in de
// tekst van het Dover-blok zelf). Een simpele "knip tussen twee
// gebiedsnamen"-aanpak zoals knmiZeeForecast.js (dat maar 4 vaste namen kent
// en daar nooit last van heeft) zou hierdoor fout knippen. Daarom hier een
// structuur-gebaseerde aanpak: elk zeegebied staat als eigen kop-element
// (h1-h6) in de HTML, gevolgd door de forecasttekst als sibling-inhoud tot
// de eerstvolgende kop — dat is onafhankelijk van of gebiedsnamen ook elders
// in lopende tekst voorkomen. Kopteksten die (na splitsen op ", "/" and ")
// volledig uit bekende gebiedsnamen bestaan worden als "gebiedskop"
// herkend; andere koppen ("General synopsis", "Gale warnings", ...) worden
// overgeslagen (tellen niet mee als gebied, maar sluiten wel de
// sibling-tekst van het voorgaande gebied af omdat het ook een kop is).
import * as cheerio from 'cheerio';

const BRON_URL = 'https://weather.metoffice.gov.uk/specialist-forecasts/coast-and-sea/print/shipping-forecast';

// De 31 officiële Shipping Forecast-zeegebieden, in de vaste (altijd
// gelijke) uitzendvolgorde — hier alleen gebruikt om kop-teksten te
// herkennen, niet om op te knippen.
const GEBIEDSNAMEN = [
  'Viking', 'North Utsire', 'South Utsire', 'Forties', 'Cromarty', 'Forth',
  'Tyne', 'Dogger', 'Fisher', 'German Bight', 'Humber', 'Thames', 'Dover',
  'Wight', 'Portland', 'Plymouth', 'Biscay', 'Trafalgar', 'FitzRoy', 'Sole',
  'Lundy', 'Fastnet', 'Irish Sea', 'Shannon', 'Rockall', 'Malin', 'Hebrides',
  'Bailey', 'Fair Isle', 'Faeroes', 'Southeast Iceland',
];
const GEBIEDSNAMEN_SET = new Set(GEBIEDSNAMEN.map((n) => n.toUpperCase()));

async function haalHtml() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(BRON_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36',
        'Accept-Language': 'en-GB,en;q=0.9',
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Met Office gaf HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

// 2026-08-25-fix, op melding van Lex ("klopt het dat we geen synopsis hebben
// voor Fisher?"): Met Office splitst German Bight soms op in "North German
// Bight"/"South German Bight" en Sole in "West Sole"/"East Sole" (live
// bevestigd op de site). `alsGebiedsnamen()` hieronder eist dat ELK deel van
// een gedeelde koptekst (bv. "Fisher, German Bight, Humber") een bekende
// naam is — dus zodra zo'n opsplitsing voorkomt, viel de HELE groep weg, niet
// alleen German Bight/Sole zelf. Concreet zo bevestigd via
// /api/zee-synopsis-metoffice: naast German Bight en Sole ontbraken ook
// Fisher, Humber (gedeelde koptekst met German Bight) en Trafalgar/Lundy/
// Fastnet (gedeelde koptekst met Sole) — 7 gebieden stuk door 2 varianten.
// Fix: deze bekende opsplitsingen normaliseren naar hun standaardnaam VOOR
// de "is dit een bekende naam"-check, zodat de groep intact blijft.
const GEBIEDSNAAM_ALIAS = {
  'NORTH GERMAN BIGHT': 'GERMAN BIGHT',
  'SOUTH GERMAN BIGHT': 'GERMAN BIGHT',
  'WEST SOLE': 'SOLE',
  'EAST SOLE': 'SOLE',
};

// 2026-08-26-fix, op melding van Lex ("wat is de reden dat er geen synopsis
// is bij Fisher?"): live bevestigd (via de browser-devtools op de site
// zelf) dat de koptekst op dat moment "East Dogger, Fisher, German Bight"
// was — een richtings-variant van Dogger die niet in GEBIEDSNAAM_ALIAS
// hierboven stond, waardoor de HELE koptekst afgekeurd werd (net als bij
// de eerdere North/South German Bight-fix) en Fisher + German Bight er
// samen mee verdwenen. Vaste alias-paren voor elke variant bijhouden is
// een kat-en-muisspel (elk gebied kan in principe met een windstreek
// gesplitst worden); daarom generiek: een leidende windstreek van een
// koptekst-deel afknippen en opnieuw tegen de bekende namen checken.
const RICHTING_PREFIX = /^(NORTHEAST|NORTHWEST|SOUTHEAST|SOUTHWEST|NORTH|SOUTH|EAST|WEST)\s+/;

// "NORTH GERMAN BIGHT" -> "North German Bight", puur voor leesbare labels in
// de samengevoegde tekst hieronder (parseGebieden) — de brontekst zelf komt
// altijd in hoofdletters uit de koptekst-vergelijking.
function titelCase(tekst) {
  return tekst.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// "Dover, Wight, Portland, Plymouth" -> [{canoniek:'DOVER',origineel:'DOVER'}, ...]
// als en alleen als ELK deel (na alias-normalisatie hierboven) een bekende
// gebiedsnaam is. Anders null (geen gebiedskop, bv. "General synopsis" of
// "Gale warnings"). `origineel` blijft apart bewaard (i.p.v. alleen de
// canonieke naam terug te geven) zodat parseGebieden hieronder bij een
// GEBIEDSNAAM_ALIAS-geval weet welke helft (bv. "NORTH GERMAN BIGHT") het was
// — nodig om 2026-08-25, op verzoek van Lex ("de gehele tekst voor de
// varianten van German Bight erin zetten"), beide helften te kunnen
// samenvoegen i.p.v. de een de ander te laten overschrijven.
function alsGebiedsnamen(kopTekst) {
  const schoon = kopTekst.replace(/:$/, '').trim();
  if (!schoon) return null;
  const delen = schoon.split(',').map((d) => d.trim().replace(/^and\s+/i, ''));
  const paren = delen.map((d) => {
    const origineel = d.toUpperCase();
    if (GEBIEDSNAMEN_SET.has(origineel)) return { canoniek: origineel, origineel };
    if (GEBIEDSNAAM_ALIAS[origineel]) return { canoniek: GEBIEDSNAAM_ALIAS[origineel], origineel };
    // Onbekende naam, geen expliciete alias: proberen als "<windstreek>
    // <bekende naam>" (bv. "EAST DOGGER") — zie RICHTING_PREFIX hierboven.
    const zonderRichting = origineel.replace(RICHTING_PREFIX, '');
    if (zonderRichting !== origineel && GEBIEDSNAMEN_SET.has(zonderRichting)) {
      return { canoniek: zonderRichting, origineel };
    }
    return { canoniek: origineel, origineel };
  });
  if (paren.every((p) => GEBIEDSNAMEN_SET.has(p.canoniek))) return paren;
  return null;
}

// Loopt de RUWE DOM-siblings (dus ook losse tekstnodes, niet alleen
// elementen zoals cheerio's .next() die zou overslaan) van een kop-element
// af tot de eerstvolgende h1-h6, en voegt alle tekst samen. Werkt zo
// ongeacht of de forecasttekst in een aparte <p> zit, los tussen de koppen
// staat, of ergens anders binnen dezelfde ouder — alleen "tot de volgende
// kop" is de aanname.
function tekstTotVolgendeKop($, kopNode) {
  let tekst = '';
  let node = kopNode.next;
  while (node) {
    if (node.type === 'tag' && /^h[1-6]$/i.test(node.name)) break;
    if (node.type === 'text') {
      tekst += ` ${node.data}`;
    } else if (node.type === 'tag' || node.type === 'script' || node.type === 'style') {
      if (node.type === 'tag') tekst += ` ${$(node).text()}`;
    }
    node = node.next;
  }
  return tekst.replace(/\s+/g, ' ').trim();
}

function parseGebieden(html) {
  const $ = cheerio.load(html);
  const gebieden = {};
  const koppen = $('h1,h2,h3,h4,h5,h6').toArray();

  for (const kopEl of koppen) {
    const kopTekst = $(kopEl).text().replace(/\s+/g, ' ').trim();
    const paren = alsGebiedsnamen(kopTekst);
    if (!paren) continue;

    const tekst = tekstTotVolgendeKop($, kopEl);
    if (!tekst) continue;

    // 2026-08-26-fix: eerder werd hier alleen "samengevoegd i.p.v.
    // overschreven" bijgehouden voor GEBIEDSNAAM_ALIAS-varianten
    // (bv. "NORTH GERMAN BIGHT") — maar als een gebied EERST via een platte
    // kop (bv. "... Dogger") en DAARNA via een variant-kop (bv. "East
    // Dogger, Fisher, German Bight") voorkomt, werd de eerste, platte tekst
    // alsnog stilletjes overschreven. Voortaan simpelweg: bestaat er al
    // tekst voor dit gebied (via welke kop dan ook), dan samenvoegen i.p.v.
    // overschrijven — ongeacht de volgorde/vorm van de koppen.
    for (const { canoniek, origineel } of paren) {
      const label = origineel === canoniek ? canoniek : titelCase(origineel);
      if (gebieden[canoniek]) {
        gebieden[canoniek].tekst += ` | ${label}: ${tekst}`;
      } else {
        gebieden[canoniek] = { label: canoniek, tekst: origineel === canoniek ? tekst : `${label}: ${tekst}` };
      }
    }
  }

  return gebieden;
}

// 2026-08-26-vangnet, op verzoek van Lex ("ja vangnet ok"): een echte
// forecasttekst bevat altijd een cijfer (windkracht/golfhoogte) en is nooit
// maar een paar woorden. Kort en/of cijferloos is vrijwel zeker een
// knip-fout (verkeerde/lege sibling-tekst) — dat serveren we liever niet
// urenlang door als "de" synopsis van dit gebied.
function isPlausibeleForecastTekst(tekst) {
  return tekst.length >= 15 && /\d/.test(tekst);
}

export async function fetchMetOfficeZeeForecast() {
  const html = await haalHtml();
  const ruweGebieden = parseGebieden(html);
  const uitgegeven = uitgifteTijdIn(html);
  const gebieden = {};
  for (const [naam, info] of Object.entries(ruweGebieden)) {
    if (isPlausibeleForecastTekst(info.tekst)) gebieden[naam] = info;
  }
  const afgekeurd = Object.keys(ruweGebieden).length - Object.keys(gebieden).length;
  console.log(`[weer] metoffice-zeeforecast: synopsis gevonden voor ${Object.keys(gebieden).length} gebieden${afgekeurd > 0 ? ` (${afgekeurd} afgekeurd door vangnet)` : ''}.`);
  if (Object.keys(gebieden).length === 0) {
    throw new Error('geen enkel gebied gevonden op de Met Office-pagina — structuur mogelijk gewijzigd');
  }
  return { bron: BRON_URL, bijgewerkt: new Date().toISOString(), uitgegeven, gebieden };
}

// 2026-08-30, zie knmiZeeForecast.js/uitgifteTijdIn(): de Met Office-
// printpagina meldt "Issued by the Met Office, on behalf of the Maritime and
// Coastguard Agency, at 10:30 (UTC+1) on Sat 29 Aug 2026". De UTC-offset
// staat er letterlijk bij, dus die wordt gewoon afgetrokken -- geen aanname
// over Britse zomertijd nodig. null bij een afwijkende opmaak.
const MAANDEN_KORT = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
function uitgifteTijdIn(html) {
  const platteTekst = cheerio.load(html)('body').text().replace(/\s+/g, ' ');
  const m = platteTekst.match(/Issued by the Met Office[^.]*?at\s+(\d{1,2}):(\d{2})\s*\(UTC([+-]\d{1,2})\)\s+on\s+[A-Za-z]{3}\s+(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
  if (!m) return null;
  const maand = MAANDEN_KORT[m[5].toUpperCase()];
  if (maand == null) return null;
  const d = new Date(Date.UTC(Number(m[6]), maand, Number(m[4]), Number(m[1]) - Number(m[3]), Number(m[2])));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
