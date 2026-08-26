// sealagomZeeWaarschuwingen.js — actieve scheepvaartwaarschuwingen per
// zeegebied voor de Zeekaart, 2026-08-24 op verzoek van Lex ("we zouden het
// kunnen gebruiken voor de dode area's waar geen synopsis voor is
// wellicht?" — Fisher/Tyne/Forth/Forties/Viking/Dover, de zes gebieden die
// knmiZeeForecast.js niet dekt).
//
// BELANGRIJK ONDERSCHEID met knmiZeeForecast.js: dit is GEEN weersynopsis
// (luchtdruk/wind/verwachting) — SeaLagom levert scheepvaart-waarschuwingen
// (MSI), dezelfde categorie content als NAVTEX/UKHO (wrakken, boeien,
// oefeningen, verloren ankers, etc.). Vult het "geen synopsis"-gat dus niet
// letterlijk op, maar toont in de popup iets nuttigs i.p.v. niets, mits er
// toevallig een actieve waarschuwing voor dat gebied is — net als bij NAVTEX
// zelf is dat opportunistisch/schaars, geen gegarandeerde dekking.
//
// Bewust NIET de betaalde/token-API (/api/v1/coastal/.../messages/)
// gebruikt: het gratis quotum is volgens SeaLagom's eigen chatbot een
// EENMALIG potje van 100 tokens ("every account gets 100 free request
// tokens"), niet een maandelijks terugkerend budget — niet houdbaar voor een
// continu pollende achtergronddienst. Ook NIET de "Full region - TXT"-
// exportknop op de site: die bleek te linken naar een tussenpagina met een
// "Security check" en advertenties/quiz ("PLAY WHILE YOUR DOWNLOAD
// PREPARES") — een bewuste anti-scraping-drempel, dus geen betrouwbare bron
// voor automatisch pollen.
//
// Wél gewoon de normale, vrij toegankelijke berichtenpagina van de UK
// COASTAL-regio (regio-ID 24 op sealagom.com) — exact hetzelfde principe als
// ukho.js, dat nu ook al UKHO's website scraped zonder account/API-key.
// Bevestigd vrij van enige gate/check (in tegenstelling tot de exportknop)
// door de pagina zelf op te halen en te vergelijken met de TXT-export die
// Lex handmatig downloadde — zelfde 21 berichten, zelfde tekst.
import * as cheerio from 'cheerio';

const BRON_URL = 'https://www.sealagom.com/coastal/24/messages/';

async function haalMessagesHtml() {
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
    if (!res.ok) throw new Error(`SeaLagom gaf HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

// Vaste lijst UK Met Office Shipping Forecast-gebieden (32 stuks, plus
// SeaLagom's eigen samengestelde "Hebrides and Malin" die in echte data
// voorkwam) — langste namen eerst, zodat "Hebrides and Malin" vóór het
// kortere "Hebrides" gematcht wordt.
//
// EERSTE opzet ging uit van echte regeleinden tussen de gebiedsnaam-regel en
// de berichttekst (".message-content" heeft whitespace-pre-wrap, en Lex'
// "View Page Source"-export leek \n's te laten zien) — bleek bij het testen
// tegen die échte export NIET te kloppen: of de pagina gebruikt toch geen
// harde newlines, of Chrome's source-viewer had de boel herformatteerd (niet
// met zekerheid vast te stellen vanuit een opgeslagen view-source-bestand).
// Resultaat was in elk geval fout: "FIELD.PLATFORM BUZZARD 57-48.80N..."
// werd op ELK punt geknipt, ook de punten in decimale coördinaten. Daarom nu
// whitespace-ONAFHANKELIJK: de hele berichttekst plat maken (alle
// witruimte naar één spatie) en vanaf het begin herhaald een bekende
// gebiedsnaam + punt wegstrippen — dat werkt ongeacht of er nu wel of geen
// echte newlines in zitten. Geverifieerd tegen alle 21 berichten uit Lex'
// eigen export: alle gebiedsnamen, ID's en coördinaten kwamen er correct uit.
const GEBIEDEN = [
  'North Utsire', 'South Utsire', 'Southeast Iceland', 'Hebrides and Malin',
  'German Bight', 'Fair Isle', 'Irish Sea', 'Viking', 'Forties', 'Cromarty',
  'Forth', 'Tyne', 'Dogger', 'Fisher', 'Humber', 'Thames', 'Dover', 'Wight',
  'Portland', 'Plymouth', 'Biscay', 'Trafalgar', 'FitzRoy', 'Sole', 'Lundy',
  'Fastnet', 'Shannon', 'Rockall', 'Malin', 'Hebrides', 'Bailey', 'Faeroes',
].sort((a, b) => b.length - a.length);

// Strip herhaald "GEBIEDSNAAM." van het begin van de (platgemaakte) tekst,
// tot er geen match meer is — de rest is de berichttekst.
function knipGebiedsnamen(platteTekst) {
  const gebiedsnamen = [];
  let rest = platteTekst;
  for (;;) {
    const gevonden = GEBIEDEN.find((naam) => rest.toUpperCase().startsWith(`${naam.toUpperCase()}.`));
    if (!gevonden) break;
    gebiedsnamen.push(gevonden.toUpperCase());
    rest = rest.slice(gevonden.length + 1).trim();
  }
  return { gebiedsnamen, tekst: rest };
}

// Elk bericht staat in een eigen <div class="message-content"
// data-message-id="...">. Coördinaten staan er al apart in getagd
// (<span class="message-coord-link" data-coord="...">) — geen eigen
// COORD_REGEX nodig zoals bij navtexLokaal.js/ukho.js, SeaLagom heeft dat al
// voorgeparsed.
function parseMessages(html) {
  const $ = cheerio.load(html);
  const berichten = [];

  $('.message-content[data-message-id]').each((_, el) => {
    const $el = $(el);
    const platteTekst = $el.text().replace(/\s+/g, ' ').trim();
    const { gebiedsnamen, tekst: ruweTekst } = knipGebiedsnamen(platteTekst);
    if (gebiedsnamen.length === 0) return;
    // Cosmetisch: een punt direct gevolgd door een hoofdletter (bv.
    // "FIELD.PLATFORM") krijgt er een spatie bij — decimale coördinaten
    // ("48.80N") blijven ongemoeid, want daar volgt een cijfer, geen
    // hoofdletter.
    const tekst = ruweTekst.replace(/\.(?=[A-Z])/g, '. ');

    const coords = [];
    $el.find('.message-coord-link').each((__, coordEl) => {
      const coord = $(coordEl).attr('data-coord');
      if (coord) coords.push(coord);
    });

    // Het bericht-ID (bv. "516/26") en de tijd staan niet in .message-content
    // zelf, maar iets hogerop in dezelfde lijstitem (<li>) — het
    // dichtstbijzijnde <a> met "/message/" in de href is het ID-linkje.
    const $li = $el.closest('li');
    const id = $li.find('a[href*="/message/"]').first().text().trim() || null;
    const tijdTekst = $li.find('time').first().text().trim() || null;

    berichten.push({ id, gebiedsnamen, tekst, coords, tijdTekst });
  });

  return berichten;
}

// Eén bericht kan bij meerdere gebieden horen (bv. "FORTIES. CROMARTY."),
// dus gegroepeerd per gebiedsnaam i.p.v. één-op-één. Gebiedsnamen blijven
// hoofdletters zoals de bron ze geeft — de frontend vergelijkt zelf
// hoofdletter-ongevoelig tegen ZEE_GEBIEDEN. Bewust GEEN filter hier op onze
// eigen 10 zeegebieden of op de 4 al-door-KNMI-gedekte gebieden: SeaLagom
// dekt ook een paar UK-gebieden die niet op onze kaart staan (Cromarty,
// Hebrides, Irish Sea, Plymouth, ...) — die blijven gewoon ongebruikt in de
// response staan, geen kwaad kunnen. En mocht knmiZeeForecast.js een keer
// falen voor Dogger/Humber/German Bight/Thames, dan kan de frontend zo
// automatisch op deze bron terugvallen voor die ronde, i.p.v. dat we dat
// hier al hard uitsluiten.
function groepeerPerGebied(berichten) {
  const gebieden = {};
  for (const bericht of berichten) {
    for (const naam of bericht.gebiedsnamen) {
      const key = naam.toUpperCase();
      if (!gebieden[key]) gebieden[key] = [];
      gebieden[key].push(bericht);
    }
  }
  return gebieden;
}

export async function fetchZeeWaarschuwingen() {
  const html = await haalMessagesHtml();
  const berichten = parseMessages(html);
  const gebieden = groepeerPerGebied(berichten);
  console.log(`[weer] sealagom-zeewaarschuwingen: ${berichten.length} berichten opgehaald, verdeeld over ${Object.keys(gebieden).length} gebieden.`);
  return { bron: BRON_URL, bijgewerkt: new Date().toISOString(), gebieden };
}
