// knmiZeeForecast.js — synopsis-tekst per zeegebied (Dogger, Humber, German
// Bight, Thames) voor de Zeekaart, 2026-08-20 op verzoek van Lex ("de gebieden
// krijgen ook altijd nog een synopsis mee in het oude navtex... als ik op de
// naam klik dat ik ze dan zie of zo?"). Geen eigen research/gok — dit is
// vrijwel letterlijk overgenomen van de `/api/forecast`-route in Lex' eigen,
// al werkende `~/navtex/server.js` (door hem zelf gecat't), inclusief de
// bron-URL en de parseerlogica. Alleen de variabelenamen/comments zijn naar
// de Nederlandse conventie van dit project omgezet — de parseer-aanpak zelf
// (tekst tussen twee gebiedsnamen/keywoorden knippen) is bewust ongewijzigd
// gelaten, want die is al tegen echte data getest.
//
// BELANGRIJKE BEPERKING (anders dan de losse NAVTEX/UKHO-berichten): deze
// KNMI-pagina ("Dutch Continental Shelf") publiceert van oudsher maar voor
// VIER van de tien gebieden op de Zeekaart (zie ZEE_GEBIEDEN in app.js) een
// synopsis: Dogger, Humber, German Bight, Thames — de gebieden rond het
// Nederlands continentaal plat. Fisher/Tyne/Forth/Forties/Viking/Dover
// (verder naar het noorden/de UK-kust) staan er niet in; dat is geen bug,
// KNMI dekt simpelweg alleen "hun" plat. Voor die zes gebieden toont de
// frontend straks gewoon geen synopsis-blok in de popup.
import * as cheerio from 'cheerio';

const BRON_URL = 'https://www.knmi.nl/nederland-nu/maritiem/dutch-continental-shelf';
const GEBIEDSNAMEN = ['Dogger', 'German Bight', 'Humber', 'Thames'];

async function haalKnmiHtml() {
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
    if (!res.ok) throw new Error(`KNMI gaf HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

// Zelfde knip-strategie als Lex' server.js: de hele pagina wordt tot platte
// tekst herleid, en per gebiedsnaam wordt de tekst geknipt tussen het einde
// van die naam en het dichtstbijzijnde vervolgpunt — óf de volgende
// gebiedsnaam, óf "Forecast valid from"/"Next forecast will be" (de vaste
// afsluitzinnen van deze pagina).
function knipGebiedTeksten(platteTekst) {
  const gebieden = {};

  // 2026-08-26-fix, op melding van Lex ("Thames is ook niet ok" — live
  // popup toonde alleen "early in the night."): de algemene "Synopsis:"-
  // alinea bovenaan de pagina noemt zelf ook gebiedsnamen in lopende tekst
  // (bv. "Associated trough moves over Thames and Humber on Thursday
  // morning."). indexOf(naam) hieronder pakte tot nu toe die EERSTE
  // (verkeerde) vermelding uit de synopsis-alinea, en knipte een kort
  // zinsfragment daaruit i.p.v. de echte gebiedstekst verderop onder
  // "Forecast valid from ...". Vanaf hier pas zoeken na de EERSTE
  // "Forecast valid from"-kop, waar de echte per-gebied koppen beginnen —
  // als die kop niet gevonden wordt (paginastructuur gewijzigd) valt dit
  // terug op de hele tekst zoals voorheen.
  const structuurStart = platteTekst.indexOf('Forecast valid from');
  const zoekVanaf = structuurStart === -1 ? 0 : structuurStart;

  for (const naam of GEBIEDSNAMEN) {
    const start = platteTekst.indexOf(naam, zoekVanaf);
    if (start === -1) continue;

    const mogelijkeEinden = GEBIEDSNAMEN.filter((andere) => andere !== naam)
      .map((andere) => platteTekst.indexOf(andere, start + naam.length))
      .filter((positie) => positie > start);

    const periodeEinde = platteTekst.indexOf('Forecast valid from', start + naam.length);
    if (periodeEinde > start) mogelijkeEinden.push(periodeEinde);

    const volgende = platteTekst.indexOf('Next forecast will be', start + naam.length);
    if (volgende > start) mogelijkeEinden.push(volgende);

    const einde = mogelijkeEinden.length > 0 ? Math.min(...mogelijkeEinden) : platteTekst.length;
    const tekst = platteTekst.slice(start + naam.length, einde).trim();

    // 2026-08-26-vangnet, op verzoek van Lex ("ja vangnet ok"): een echte
    // forecasttekst bevat altijd een cijfer (windkracht/golfhoogte) en is
    // nooit maar een paar woorden — een te kort en/of cijferloos fragment is
    // vrijwel zeker een knip-fout zoals hierboven, en dat serveren we liever
    // niet 3 uur lang door als "de" synopsis van dit gebied.
    if (tekst.length < 15 || !/\d/.test(tekst)) continue;

    // Ruwe windkracht-gok uit de tekst zelf, puur als kort label — zelfde
    // regex als Lex' server.js, geen garantie dat 'ie altijd raak schiet.
    const windMatch = tekst.match(
      /\b(?:variable|north|northeast|east|southeast|south|southwest|west|northwest|southerly|westerly|easterly|northerly)?[^,.]{0,40}\b(\d(?:-\d)?)\b/i
    );
    const wind = windMatch ? windMatch[1] : null;

    gebieden[naam] = { label: wind ? `${naam} (${wind})` : naam, tekst, wind };
  }
  return gebieden;
}

export async function fetchZeeForecast() {
  const html = await haalKnmiHtml();
  const $ = cheerio.load(html);
  const platteTekst = $('main').text().replace(/\s+/g, ' ').trim();
  if (!platteTekst) throw new Error('geen forecasttekst gevonden op de KNMI-pagina');

  const gebieden = knipGebiedTeksten(platteTekst);
  console.log(`[weer] knmi-zeeforecast: synopsis gevonden voor ${Object.keys(gebieden).length}/${GEBIEDSNAMEN.length} gebieden.`);

  return { bron: BRON_URL, bijgewerkt: new Date().toISOString(), gebieden };
}
