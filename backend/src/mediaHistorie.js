// mediaHistorie.js — persistente, periodiek ververste community-media per
// signaal-id (zie sources/media.js voor de bronnen zelf, sources/nws.js voor
// het eerste gebruik). Vervangt de oude one-shot mediaCache die nws.js tot
// 2026-08-22 gebruikte: die zocht precies één keer, op het moment dat een
// alert voor het eerst gezien werd. Op verzoek van Lex, 2026-08-22 (na de
// tornado in Putnam County, IL, waar hij zelf via een gewone Google-
// zoekopdracht meteen relevant nieuws/video vond terwijl de app niets liet
// zien): het beste materiaal verschijnt vaak pas uren tot dagen later — en
// een signaal dat inmiddels "verlopen" is (zie historie.js) kreeg via die
// oude cache sowieso nooit meer een nieuwe zoekopdracht, want de aanroepende
// bronbestanden verwerken alleen nog-actieve alerts.
//
// Beleid (met Lex afgesproken via een AskUserQuestion-keuze, 2026-08-22:
// "Elke 3 uur, tot 48 uur"): elke SEARCH_INTERVAL_MS opnieuw zoeken, tot
// VENSTER_MS ná het ONTSTAAN van het signaal — niet ná het verlopen, want
// een Tornado Warning kan al na 45 minuten aflopen, ruim vóórdat 48 uur om
// is. VENSTER_MS is bewust hetzelfde als historie.js se venster, zodat een
// signaal tot en met de laatste keer dat het nog op de kaart verschijnt
// nieuw materiaal kan krijgen. Voorbij dat venster: niet meer zoeken, maar
// het laatst gevonden resultaat gewoon bewaren (verversMedia geeft dan
// simpelweg de cache terug).
// 2026-08-22, direct ná het eerste live gebruik bijgesteld: een poging die
// niks opleverde (leeg resultaat, of een onderliggende timeout zoals bij de
// SearXNG-wachtrij, zie sources/searxng.js) wacht NIET de volle 3 uur op een
// herhaling — dat zou een toevallig mislukte poging voor onnodig lange tijd
// op slot zetten. Zie LEGE_RESULTAAT_INTERVAL_MS hieronder.
//
// Gebruik: aanroepende bronbestanden roepen verversMedia() aan voor zowel
// nog-actieve signalen (elke pollcyclus) als voor verlopen signalen die
// historie.js teruggeeft (via een losse nabewerking, zie nws.js). Dit
// bestand weet zelf niets van NWS/tornado's specifiek — puur databeheer +
// het aanroepen van fetchCommunityMedia — dezelfde scheiding als
// historie.js hanteert, zodat dit later ook door andere bronnen (nhc.js,
// usgs.js) hergebruikt kan worden.
//
// Persistent naar schijf (data/mediaHistorie.json), zelfde fire-and-forget
// try/catch-aanpak als historie.js: een mislukte schrijf/lees mag deze
// puur-verrijkende laag nooit laten crashen — dan gewoon (opnieuw) zoeken.
import { readFileSync, mkdirSync, existsSync, writeFile } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fetchCommunityMedia } from './sources/media.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MEDIA_HISTORIE_BESTAND = join(__dirname, '..', 'data', 'mediaHistorie.json');

const SEARCH_INTERVAL_MS = 3 * 60 * 60 * 1000; // 3 uur — gebruikt zodra er al media gevonden is
// 2026-08-22: apart, kort interval voor het geval er nog NIKS gevonden is (of
// de vorige poging simpelweg mislukte, bv. een SearXNG-timeout tijdens een
// herstart-piek, zie de wachtrij in sources/searxng.js) — zonder dit zou een
// mislukte/lege poging zichzelf voor de volle 3 uur op slot zetten, precies
// wat Lex live meemaakte bij het testen van de Putnam-fixture (die kwam
// toevallig in zo'n stormvloed terecht en bleef daardoor 3 uur stil).
const LEGE_RESULTAAT_INTERVAL_MS = 15 * 60 * 1000; // 15 minuten
const VENSTER_MS = 48 * 60 * 60 * 1000; // 48 uur — zelfde venster als historie.js

// Ruim boven VENSTER_MS: puur om ooit oude entries op te ruimen als een
// signaal-id nooit meer wordt aangevraagd (bv. omdat historie.js 'm allang
// niet meer teruggeeft). 7 dagen is ruim voldoende marge, dit is geen harde
// grens die ergens anders van afhangt.
const OPRUIM_MS = 7 * 24 * 60 * 60 * 1000;

const cache = new Map(); // signaal-id -> { zoekterm, ontstaan, laatsteZoek, laatstGevraagd, media }
const lopend = new Map(); // signaal-id -> Promise, voorkomt dubbele gelijktijdige zoekopdrachten voor hetzelfde id

// 2026-08-22, na een live-observatie met Lex (tweede ronde, ná de wachtrij
// die al in sources/searxng.js zat): bij een herstart met 160+ signalen in de
// historie riep fetchEventType()/usgs.js/nhc.js in de eerste seconden
// honderden keren verversMedia() aan. De SearXNG-wachtrij loste de timeouts
// dáár op, maar fetchCommunityMedia() bevraagt ALTIJD alle vier de bronnen
// tegelijk (zie sources/media.js) — dus Wikimedia/Reddit/Bluesky (geen van
// drieën met een eigen wachtrij) liepen bij diezelfde piek alsnog allemaal
// tegen hun eigen rate limits aan (429/403 in de server-log). Een wachtrij
// hier, vóór fetchCommunityMedia() zelf, remt af hoeveel SIGNALEN
// tegelijk media zoeken — dat beschermt alle vier de bronnen ineens, in
// plaats van er per bron een losse wachtrij bij te moeten bouwen.
const MAX_GELIJKTIJDIGE_ZOEKOPDRACHTEN = 3;
let actieveZoekopdrachten = 0;
const zoekWachtrij = [];

function verkrijgZoekSlot() {
  if (actieveZoekopdrachten < MAX_GELIJKTIJDIGE_ZOEKOPDRACHTEN) {
    actieveZoekopdrachten += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => zoekWachtrij.push(resolve));
}

function geefZoekSlotVrij() {
  const volgende = zoekWachtrij.shift();
  if (volgende) volgende(); // slot direct doorgegeven — 'actief' blijft gelijk
  else actieveZoekopdrachten -= 1;
}

try {
  mkdirSync(dirname(MEDIA_HISTORIE_BESTAND), { recursive: true });
  if (existsSync(MEDIA_HISTORIE_BESTAND)) {
    const ruw = JSON.parse(readFileSync(MEDIA_HISTORIE_BESTAND, 'utf-8'));
    const nu = Date.now();
    let aantalIngeladen = 0;
    for (const [id, entry] of Object.entries(ruw)) {
      if (nu - (entry.laatstGevraagd ?? entry.ontstaan ?? 0) > OPRUIM_MS) continue;
      cache.set(id, entry);
      aantalIngeladen += 1;
    }
    console.log(`[weer] mediaHistorie: ${aantalIngeladen} signa(a)l(en) teruggeladen van schijf (overleeft nu een herstart/deploy).`);
  }
} catch (err) {
  console.error('[weer] mediaHistorie: eerdere data inladen mislukt, start leeg —', err.message ?? err);
}

// 2026-08-22, live gevonden door Lex: bij een stormvloed van tientallen
// gelijktijdige verversMedia()-calls riep elke call z'n EIGEN schrijfNaarSchijf()
// aan, allemaal naar hetzelfde bestand — zonder volgorde-garantie tussen
// afzonderlijke fs.writeFile-callbacks kon een oudere (minder complete)
// snapshot een nieuwere overschrijven. Concreet gezien: een testsignaal kreeg
// in het geheugen gewoon media (de mail-alarm-log bewees dat), maar stond
// even later niet in het bestand op schijf. Onderstaande houdt maar één
// schrijfactie tegelijk toe; komt er tijdens het schrijven een nieuwe aanvraag
// bij, dan wordt na afloop nog ÉÉN keer opnieuw geschreven (met de dan-actuele
// cache) i.p.v. dat elke aanvraag zijn eigen write-race start.
let schrijfBezig = false;
let schrijfOpnieuwNodig = false;

function schrijfNaarSchijf() {
  if (schrijfBezig) {
    schrijfOpnieuwNodig = true;
    return;
  }
  schrijfBezig = true;
  const data = Object.fromEntries(cache);
  writeFile(MEDIA_HISTORIE_BESTAND, JSON.stringify(data), (err) => {
    schrijfBezig = false;
    if (err) console.error('[weer] mediaHistorie: wegschrijven naar schijf mislukt, blijft wel gewoon in het geheugen werken —', err.message ?? err);
    if (schrijfOpnieuwNodig) {
      schrijfOpnieuwNodig = false;
      schrijfNaarSchijf(); // cache kan tijdens het schrijven veranderd zijn — die actuele staat alsnog wegschrijven
    }
  });
}

/**
 * Geeft de (eventueel ververste) community-media voor één signaal terug.
 * Zoekt alleen daadwerkelijk opnieuw als dat volgens het beleid hierboven
 * nodig is — anders komt gewoon het laatst bekende resultaat terug, zonder
 * netwerkverkeer.
 *
 * @param {Object} params
 * @param {string} params.id                signaal-id, uniek per bron (bv. "nws-...")
 * @param {string|null|undefined} params.zoekterm       bv. p.areaDesc — ontbreekt 'm, dan net als fetchCommunityMedia zelf: gewoon leeg
 * @param {string|number|null|undefined} params.ontstaanIso  ISO-tijdstip (of ms sinds epoch) van het ONTSTAAN van het signaal — bepaalt het 48-uursvenster, niet "nu"
 * @returns {Promise<Array>} media-items, zie sources/media.js voor de vorm
 */
export async function verversMedia({ id, zoekterm, ontstaanIso }) {
  if (!id || !zoekterm) return [];
  const nu = Date.now();
  const ontstaanRuw = typeof ontstaanIso === 'number' ? ontstaanIso : new Date(ontstaanIso).getTime();
  const ontstaan = Number.isFinite(ontstaanRuw) ? ontstaanRuw : nu;

  let entry = cache.get(id);
  if (!entry) {
    entry = { zoekterm, ontstaan, laatsteZoek: null, laatstGevraagd: nu, media: [] };
    cache.set(id, entry);
  } else {
    // 2026-08-22: bij een signaal dat nog steeds "live" is en dus elke cyclus
    // opnieuw wordt aangeboden (bv. een orkaan die dagenlang actief blijft,
    // zie sources/nhc.js) schuift het venster gewoon mee vooruit — anders zou
    // een storm die langer dan 48 uur duurt na twee dagen ineens stoppen met
    // verversen, terwijl-ie nog springlevend is. Pas zodra een signaal niet
    // meer live aangeboden wordt (ontstaanIso verandert dan niet meer mee)
    // begint de 48-uursaftelling vanaf het laatst bekende moment — net als
    // historie.js se "verlopen sinds". Nooit terugzetten in de tijd.
    entry.ontstaan = Math.max(entry.ontstaan, ontstaan);
  }
  entry.zoekterm = zoekterm; // areaDesc/zoekterm kan in theorie licht wijzigen tussen pollcycli van hetzelfde signaal
  entry.laatstGevraagd = nu;

  const binnenVenster = nu - entry.ontstaan < VENSTER_MS;
  // Zolang er nog niks gevonden is, sneller opnieuw proberen (zie
  // LEGE_RESULTAAT_INTERVAL_MS hierboven) — pas na een geslaagde vondst
  // geldt de volle 3-uursinterval.
  const herhaalMs = entry.media.length ? SEARCH_INTERVAL_MS : LEGE_RESULTAAT_INTERVAL_MS;
  const moetZoeken = binnenVenster && (entry.laatsteZoek == null || nu - entry.laatsteZoek >= herhaalMs);

  if (!moetZoeken) return entry.media;

  // Voorkomt twee gelijktijdige zoekopdrachten voor hetzelfde id — kan in
  // theorie als een aanroep trager is dan de volgende pollcyclus.
  if (lopend.has(id)) return lopend.get(id);

  const taak = (async () => {
    await verkrijgZoekSlot();
    try {
      entry.media = await fetchCommunityMedia(zoekterm);
    } catch (err) {
      // fetchCommunityMedia vangt zijn eigen fouten al af (geeft [] terug) —
      // deze catch is puur een extra vangnet en mag hoe dan ook nooit de
      // aanroepende bron (bv. nws.js) laten crashen.
      console.error(`[weer] mediaHistorie: verversen mislukt voor "${id}" —`, err.message ?? err);
    } finally {
      entry.laatsteZoek = Date.now();
      schrijfNaarSchijf();
      lopend.delete(id);
      geefZoekSlotVrij();
    }
    return entry.media;
  })();
  lopend.set(id, taak);
  return taak;
}
