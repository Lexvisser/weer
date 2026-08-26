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
    return { canoniek: GEBIEDSNAAM_ALIAS[origineel] ?? origineel, origineel };
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
  // 2026-08-25, op verzoek van Lex: bijhouden welke canonieke namen al
  // minstens één GEBIEDSNAAM_ALIAS-variant (bv. "NORTH GERMAN BIGHT")
  // ontvangen hebben, zodat de TWEEDE variant wordt SAMENGEVOEGD i.p.v. de
  // eerste te overschrijven — zie de toelichting bij alsGebiedsnamen()
  // hierboven.
  const samengesteldeCanonieken = new Set();
  const koppen = $('h1,h2,h3,h4,h5,h6').toArray();

  for (const kopEl of koppen) {
    const kopTekst = $(kopEl).text().replace(/\s+/g, ' ').trim();
    const paren = alsGebiedsnamen(kopTekst);
    if (!paren) continue;

    const tekst = tekstTotVolgendeKop($, kopEl);
    if (!tekst) continue;

    for (const { canoniek, origineel } of paren) {
      if (origineel === canoniek) {
        // Normaal geval, geen alias-variant: gewoon zetten (bestaand gedrag).
        gebieden[canoniek] = { label: canoniek, tekst };
        continue;
      }
      // Alias-variant (bv. "NORTH GERMAN BIGHT" -> "GERMAN BIGHT"): niet
      // overschrijven maar samenvoegen, zodat beide helften ("North German
      // Bight: ... | South German Bight: ...") bewaard blijven i.p.v. dat de
      // laatst-verwerkte de andere wegdrukt.
      const label = titelCase(origineel);
      if (samengesteldeCanonieken.has(canoniek)) {
        gebieden[canoniek].tekst += ` | ${label}: ${tekst}`;
      } else {
        gebieden[canoniek] = { label: canoniek, tekst: `${label}: ${tekst}` };
        samengesteldeCanonieken.add(canoniek);
      }
    }
  }

  return gebieden;
}

export async function fetchMetOfficeZeeForecast() {
  const html = await haalHtml();
  const gebieden = parseGebieden(html);
  console.log(`[weer] metoffice-zeeforecast: synopsis gevonden voor ${Object.keys(gebieden).length} gebieden.`);
  if (Object.keys(gebieden).length === 0) {
    throw new Error('geen enkel gebied gevonden op de Met Office-pagina — structuur mogelijk gewijzigd');
  }
  return { bron: BRON_URL, bijgewerkt: new Date().toISOString(), gebieden };
}
