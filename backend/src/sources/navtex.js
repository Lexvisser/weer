// navtex.js — actuele NAVTEX-berichten (maritieme veiligheidswaarschuwingen:
// navigatie, weer, ijs, SAR/piraterij, etc.) binnen bereik van huis. Op
// verzoek van Lex, 2026-08-20 ("laten we dat wel gelijk in de app trekken")
// — hij had hiervoor al een los prototype staan (C:\Projects\navtex,
// server.js + stations.json) dat navtex.lv scraapte; de scrape- en
// stations-logica hieronder is daarvan overgenomen (bewezen werkend), maar
// op een paar punten gehard — zie de kanttekeningen hieronder.
//
// Bewuste keuze: nog steeds navtex.lv als bron (i.p.v. de officiële UKHO/
// Admiralty-portal msi.admiralty.co.uk, die als NAVAREA I-coördinator eigen-
// lijk de mooiere bron zou zijn). Die UKHO-pagina bleek bij onderzoek een
// losse, JS-gerenderde tabel zonder duidelijke JSON-achterliggende dienst —
// zonder de ruwe HTML zelf te kunnen inzien (niet bereikbaar vanuit deze
// omgeving) was een scraper daarvoor puur giswerk. navtex.lv's structuur is
// wél bevestigd (Lex' eigen werkende prototype), dus die vormt een veiliger
// startpunt. Als Lex de ruwe HTML van de UKHO-pagina kan aanleveren (bv. via
// "pagina opslaan als" of view-source), is dat een prima vervolgstap.
//
// Gehard t.o.v. het prototype:
// 1. NODE_TLS_REJECT_UNAUTHORIZED="0" globaal uitzetten (zoals het prototype
//    deed) schakelt certificaatcontrole voor ALLE HTTPS-verzoeken van de
//    hele Node-app uit, dus ook NWS/RWS/KNMI/etc. — een reëel beveiligings-
//    risico voor de rest van de app, voor het gemak van deze ene bron. Hier
//    alleen voor NAVTEX_URL zelf uitgeschakeld, via een eigen https.Agent
//    (zie haalNavtexHtml) i.p.v. de globale env-var.
// 2. Filtering was een hardcoded lijst losse stations-letters
//    (["P","V","C","R","E","G","A","D","B","T"]) — hier vervangen door
//    dezelfde afstand-tot-huis-aanpak als getij.js: elk station heeft een
//    lat/lon (zie STATIONS hieronder, overgenomen uit stations.json), en een
//    bericht telt mee zodra het dichtstbijzijnde bekende punt (de
//    coördinaten IN het bericht zelf, of anders de zendstation-locatie)
//    binnen NAVTEX_STRAAL_KM van HOME_LAT/HOME_LON valt. Werkt zo ook als je
//    ooit verhuist, zonder de stationslijst te hoeven aanpassen.
import * as cheerio from 'cheerio';
import https from 'node:https';
import { makeSignal, afstandKm } from '../normalize.js';
import { meldNavtexNood } from '../navtexNoodAlarm.js'; // 2026-09-03

const NAVTEX_URL = 'https://navtex.lv/';

// Overgenomen uit Lex' C:\Projects\navtex\stations.json — welk zendstation
// bij welke code-letter (het eerste teken van elk NAVTEX-bericht, bv. "P" in
// "PA01") hoort, incl. bij-benadering locatie. Alleen NAVAREA I/II-stations
// (Noordwest-Europa) — dat dekt ruim de hele Noordzee/Kanaal-regio.
const STATIONS = [
  { id: 'V', naam: 'Oostende Radio', land: 'BE', lat: 51.1823, lon: 2.8065, navarea: 'I' },
  { id: 'P', naam: 'Scheveningen Radio', land: 'NL', lat: 52.0951, lon: 4.258, navarea: 'I' },
  { id: 'E', naam: 'Niton Radio', land: 'UK', lat: 50.6, lon: -1.3, navarea: 'I' },
  { id: 'G', naam: 'Cullercoats Radio', land: 'UK', lat: 55.0, lon: -1.4, navarea: 'I' },
  { id: 'A', naam: 'Portpatrick Radio', land: 'UK', lat: 54.85, lon: -5.12, navarea: 'I' },
  { id: 'B', naam: 'Bodo Radio', land: 'NO', lat: 67.283, lon: 14.383, navarea: 'I' },
  { id: 'N', naam: 'Torshavn Radio', land: 'FO', lat: 62.02, lon: -6.77, navarea: 'I' },
  { id: 'D', naam: 'Egersund Radio', land: 'NO', lat: 58.45, lon: 6.0, navarea: 'I' },
  { id: 'O', naam: 'Stockholm Radio', land: 'SE', lat: 59.33, lon: 18.05, navarea: 'I' },
  { id: 'C', naam: 'Copenhagen Radio', land: 'DK', lat: 55.68, lon: 12.57, navarea: 'I' },
  { id: 'H', naam: 'Den Helder Kust', land: 'NL', lat: 52.96, lon: 4.76, navarea: 'I' },
  { id: 'M', naam: 'Grindavik Radio', land: 'IS', lat: 63.84, lon: -22.43, navarea: 'I' },
  { id: 'F', naam: 'Brest Radio', land: 'FR', lat: 48.39, lon: -4.49, navarea: 'II' },
  { id: 'L', naam: 'La Coruna Radio', land: 'ES', lat: 43.37, lon: -8.41, navarea: 'II' },
  { id: 'Q', naam: 'Grindavik Radio (reserve)', land: 'IS', lat: 63.83, lon: -22.4, navarea: 'I' },
  { id: 'R', naam: 'Lyngby Radio', land: 'DK', lat: 55.77, lon: 12.52, navarea: 'I' },
];
const STATION_PER_ID = new Map(STATIONS.map((s) => [s.id, s]));

// Het tweede teken van een NAVTEX-code (bv. de "A" in "PA01") is het
// berichttype — standaard IMO/ITU-indeling, niet Lex-specifiek. Puur voor
// een leesbaarder titel; onbekende/zeldzame letters vallen terug op de kale
// code, geen harde afhankelijkheid.
const TYPE_OMSCHRIJVING = {
  A: 'Navigatiewaarschuwing',
  B: 'Weerwaarschuwing',
  C: 'IJsbericht',
  D: 'SAR / piraterij',
  E: 'Weersverwachting',
  F: 'Loodsdienst',
  J: 'SATNAV-waarschuwing',
  L: 'Aanvullende navigatiewaarschuwing',
  V: 'Kennisgeving aan vissers',
};

// 2026-08-20-fix: alleen voor NAVTEX_URL zelf uitgeschakeld (zie voorbehoud
// bovenaan) i.p.v. de globale NODE_TLS_REJECT_UNAUTHORIZED-env-var uit het
// prototype. Eigen kleine https.get-wrapper i.p.v. de ingebouwde fetch, want
// fetch (undici) heeft geen simpele manier om per-request certificaat-
// controle uit te zetten zonder een extra dependency (undici.Agent) erbij
// te halen.
function haalNavtexHtml() {
  return new Promise((resolve, reject) => {
    const agent = new https.Agent({ rejectUnauthorized: false });
    const req = https.get(
      NAVTEX_URL,
      {
        agent,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
        },
        timeout: 15000,
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`navtex.lv gaf status ${res.statusCode}`));
          return;
        }
        let data = '';
        res.setEncoding('utf-8');
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve(data));
      }
    );
    req.on('timeout', () => req.destroy(new Error('navtex.lv: timeout na 15s')));
    req.on('error', reject);
  });
}

// Kleine, niet-cryptografische hash — puur om twee berichten zonder
// herkenbare datum (zie datumRegex hieronder) toch een stabiel, van elkaar
// te onderscheiden signaal-id te geven tussen pollcycli, zodat zo'n bericht
// niet elke 10 minuten als "nieuw" signaal verschijnt.
function hashTekst(tekst) {
  let h = 0;
  for (let i = 0; i < tekst.length; i++) {
    h = (h * 31 + tekst.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

const COORD_REGEX = /(\d{1,2})[°\-., ]?(\d{1,2}(?:\.\d+)?)?\s*([NS])\s*(\d{1,3})[°\-., ]?(\d{1,2}(?:\.\d+)?)?\s*([EW])/gi;
// 2026-08-20-fix: navtex-DTG's blijken (bevestigd via een echt voorbeeld op
// msi.admiralty.co.uk, "191525 UTC Aug 26") een TWEE-cijferig jaar te
// gebruiken, niet vier — Lex' prototype ging (ongetest, want het jaar bleek
// bij navtex.lv kennelijk nooit gevuld te raken) nog uit van \d{4}. Alternatie
// hieronder bewust \d{4} VOOR \d{2} (regex probeert alternatieven van links
// naar rechts en stopt bij de eerste match — \d{2}|\d{4} zou bij een
// vier-cijferig jaar per ongeluk alleen de eerste twee cijfers pakken).
const DATUM_REGEX = /(\d{2})(\d{2})(\d{2})\s*UTC\s*([A-Z]{3})\s*(\d{4}|\d{2})/i;
const MAANDEN = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };

function coordinatenIn(tekst) {
  const coords = [];
  let match;
  COORD_REGEX.lastIndex = 0;
  while ((match = COORD_REGEX.exec(tekst)) !== null) {
    const lat = (Number(match[1]) + Number(match[2] || 0) / 60) * (match[3].toUpperCase() === 'S' ? -1 : 1);
    const lon = (Number(match[4]) + Number(match[5] || 0) / 60) * (match[6].toUpperCase() === 'W' ? -1 : 1);
    if (Number.isFinite(lat) && Number.isFinite(lon)) coords.push({ lat: +lat.toFixed(6), lon: +lon.toFixed(6) });
  }
  return coords;
}

function datumIn(tekst) {
  const m = DATUM_REGEX.exec(tekst);
  if (!m) return null;
  const [, dag, uur, min, maandTekst, jaarTekst] = m;
  const maand = MAANDEN[maandTekst.toUpperCase()];
  if (maand == null) return null;
  const jaar = jaarTekst.length === 2 ? 2000 + Number(jaarTekst) : Number(jaarTekst);
  const datum = new Date(Date.UTC(jaar, maand, Number(dag), Number(uur), Number(min), 0));
  return Number.isNaN(datum.getTime()) ? null : datum;
}

// Eén <pre>-blok (het ruwe NAVTEX-telexbericht) omzetten naar een los
//, nog-niet-gefilterd bericht-object. Overgenomen structuur uit het
// prototype (ZCZC/NNNN-omlijsting wegknippen, niet-ASCII opschonen, eerste
// regel = code, tweede regel = datum/tijd, rest = body).
function parseBericht($, el) {
  const raw = $(el).text().trim();
  let area = null;
  const headerText = $(el).prev().text();
  if (headerText) {
    const m = headerText.match(/AREA:\s*([A-Z])/i);
    if (m) area = m[1].toUpperCase();
  }

  const cleaned = raw
    .replace(/^ZCZC\s*/i, '')
    .replace(/NNNN$/i, '')
    .replace(/[_*]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/[^\x20-\x7E\n]/g, '')
    .trim();

  const lines = cleaned.split('\n').map((l) => l.trim()).filter(Boolean);
  const code = lines[0] || '';
  const datumregel = lines[1] || '';
  const body = lines.slice(2).join(' ');
  if (!code || !body) return null;

  const stationId = code[0];
  const typeLetter = code[1] ?? null;
  const station = STATION_PER_ID.get(stationId) ?? null;
  const datum = datumIn(datumregel);
  const coords = coordinatenIn(body);

  return { code, area, station, typeLetter, datum, body, coords };
}

export async function fetchNavtex(env = {}) {
  const homeLat = env.homeLat ?? 52.0907;
  const homeLon = env.homeLon ?? 5.1214;
  const straalKm = Number(process.env.NAVTEX_STRAAL_KM) || 450;

  let html;
  try {
    html = await haalNavtexHtml();
  } catch (err) {
    console.error('[weer] navtex: ophalen van navtex.lv mislukt,', err.message ?? err);
    return [];
  }

  const $ = cheerio.load(html);
  const berichten = $('pre')
    .map((i, el) => parseBericht($, el))
    .get()
    .filter(Boolean);

  // Elk bericht een plek + afstand geven: liefst de eerste coördinaat DIE IN
  // het bericht zelf staat (dat is de daadwerkelijke locatie van de
  // waarschuwing), anders de bekende locatie van het zendstation als beste
  // benadering — nooit helemaal zonder positie laten vallen zolang er íets
  // bekend is, zelfde filosofie als de rest van de app.
  const metPositie = berichten.map((b) => {
    const positie = b.coords[0] ?? (b.station ? { lat: b.station.lat, lon: b.station.lon } : null);
    const afstandTotJouKm = positie ? afstandKm(homeLat, homeLon, positie.lat, positie.lon) : null;
    return { ...b, positie, afstandTotJouKm };
  });

  const binnenBereik = metPositie.filter((b) => b.afstandTotJouKm != null && b.afstandTotJouKm <= straalKm);

  // 2026-08-20: zelfde discipline als getij.js — altijd loggen, ook bij 0
  // treffers, inclusief de afstand van het dichtstbijzijnde afgevallen
  // bericht. De stille-lege-uitkomst-bug die getij.js eerder had (STRAAL_KM
  // te krap, geen enkele logregel) hoeft zich hier niet te herhalen.
  if (!binnenBereik.length) {
    const gesorteerd = [...metPositie].filter((b) => b.afstandTotJouKm != null).sort((a, b) => a.afstandTotJouKm - b.afstandTotJouKm);
    const dichtstbij = gesorteerd[0];
    console.log(
      `[weer] navtex: 0 van de ${berichten.length} berichten binnen ${straalKm}km van HOME_LAT/HOME_LON (${homeLat}, ${homeLon})` +
        (dichtstbij ? ` — dichtstbijzijnde is ${dichtstbij.code} op ${dichtstbij.afstandTotJouKm}km.` : ' (geen enkel bericht had een bruikbare positie).')
    );
    return [];
  }
  console.log(`[weer] navtex: ${binnenBereik.length} van de ${berichten.length} berichten binnen ${straalKm}km.`);

  return meldNavtexNood(binnenBereik.map((b) => {
    const typeOmschrijving = b.typeLetter ? TYPE_OMSCHRIJVING[b.typeLetter] ?? null : null;
    const stationNaam = b.station?.naam ?? `station ${b.code[0] ?? '?'}`;
    const id = `navtex-${b.code}-${b.datum ? b.datum.getTime() : hashTekst(b.body)}`;
    return makeSignal({
      id,
      categorie: 'navtex',
      titel: `NAVTEX${typeOmschrijving ? ` - ${typeOmschrijving}` : ''} (${stationNaam})`,
      ernst: 'waarschuwing',
      lat: b.positie.lat,
      lon: b.positie.lon,
      tijd: b.datum ? b.datum.toISOString() : new Date().toISOString(),
      detail: {
        code: b.code,
        station: stationNaam,
        land: b.station?.land ?? null,
        navarea: b.station?.navarea ?? null,
        bericht: b.body,
        afstandTotJouKm: b.afstandTotJouKm,
        positieUitBericht: b.coords.length > 0,
        bronUrl: NAVTEX_URL,
        noodbericht: b.typeLetter === 'D', // 2026-09-03: zelfde vlag als navtexLokaal.js (scherm- en telefoonalarm)
      },
    });
  }));
}
