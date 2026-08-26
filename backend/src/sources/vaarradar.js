// vaarradar.js — live scheepsposities (AIS) voor de "vaarradar"-kaartlaag.
// Op verzoek van Lex (2026-08-21): "kunnen we een laag flight- en vaarradar
// toevoegen?" Zelfde soort niet-hazard, pure kaartverkeerslaag als
// vliegradar.js hiernaast — geen SOURCES/SourceState/makeSignal.
//
// Bron: aisstream.io — gratis (beta), met een gratis account/API-sleutel
// (geen eigen AIS-ontvanger nodig, in tegenstelling tot AISHub dat wél een
// eigen ontvanger eist voor leestoegang, zie AISHUB_NIET_GEBRUIKT hieronder).
// Levert via een PERMANENTE WebSocket met een bounding-box-abonnement, geen
// periodieke REST-call zoals vliegradar.js — zelfde architectuur-afwijking
// als blitzortung.js (streaming i.p.v. pollen), en om dezelfde reden.
//
// Bewust ÉÉN permanent, ruim Nederland-dekkend abonnement, i.p.v. per
// opgevraagde locatie (telefoon-GPS) opnieuw te verbinden/abonneren — dat
// zou trager en omslachtiger zijn voor een simpel hobbyproject. De
// straal-filtering per opgevraagd punt gebeurt hierna gewoon server-side
// (vaarradarBinnenStraal) over de al binnengekomen posities.
//
// GRENS (bewust, geen bug): het abonnement hieronder (BBOX) dekt Nederland +
// de kustwateren/zuidelijke Noordzee ruim — een vaarradar-verzoek voor een
// punt ver buiten dat gebied (bijv. op vakantie) geeft dus geen resultaten,
// niet omdat er geen schepen zijn maar omdat we daar simpelweg niet op
// geabonneerd zijn. Kan later verruimd worden als dat nodig blijkt.
//
// AISHUB_NIET_GEBRUIKT: AISHub (het andere gratis AIS-alternatief) vereist
// dat je zelf een AIS-ontvanger meedeelt om lid te worden — puur lezen zonder
// eigen ontvanger kan daar niet, vandaar de keuze voor aisstream.io.
//
// EERLIJKE WAARSCHUWING (zelfde als bij blitzortung.js/vliegradar.js): deze
// ontwikkelomgeving heeft geen uitgaande WebSocket-toegang, dus dit is nooit
// live getest. Het berichtformaat hieronder komt uit aisstream.io's eigen
// documentatie (aisstream.io/documentation) — bij het eerste binnenkomende
// PositionReport loggen we 'm ruw naar de console ("[weer] vaarradar:
// voorbeeldrecord") zodat je op je eigen PC kunt checken of het klopt. Zie
// je andere veldnamen? Dan moet verwerkBericht() hieronder bijgesteld
// worden.
//
// 2026-08-21-status: live getest met Lex — de WebSocket verbindt en het
// abonnement wordt zonder fout verzonden (bevestigd: correcte sleutel,
// correct format, readyState OPEN), maar er komt structureel geen enkel
// bericht binnen. Onafhankelijk bevestigd met een los Python-testscript
// (buiten deze app om) — zelfde resultaat. Dit is een bekend, open,
// onopgelost probleem bij aisstream.io zelf (zie
// https://github.com/aisstream/aisstream/issues/15 en de tientallen
// vergelijkbare open issues in https://github.com/aisstream/issues/issues,
// o.a. recente cert-/verbindingsproblemen in mei 2026) — geen bug in dit
// bestand. De ⛴️-knop staat daarom sinds vandaag verborgen in
// frontend/index.html (zie de comment daar) totdat aisstream.io dit zelf
// oplost. Zodra dat gebeurt, meldt onderstaande code het automatisch via
// Pushover/mail (zelfde kanalen als de weeralarmen) — zie de
// eersteDataMelden()-aanroep in verwerkBericht(). Bij die melding: haal het
// display:none van de knop in index.html weg, klaar.
import { afstandKm } from '../normalize.js';
import { stuurAlarm } from './pushover.js';
import { stuurMailAlarm } from './email.js';

const WS_URL = 'wss://stream.aisstream.io/v0/stream';
// Ruim rond Nederland: kustwateren, Waddenzee, grote rivieren, zuidelijke
// Noordzee tot ongeveer de Engelse/Belgische/Duitse "dichtbij"-grens.
const BBOX = [
  [50.5, 2.0],
  [54.0, 7.6],
];
const VENSTER_MS = 10 * 60 * 1000; // hoe lang een laatst-bekende positie nog getoond wordt zonder nieuw bericht
const MAX_SCHEPEN = 2000; // ruim genoeg voor heel het BBOX-gebied, voorkomt ongelimiteerde geheugengroei bij een hang-verbinding

export function startVaarradarFeed(env) {
  const posities = new Map(); // mmsi -> { mmsi, naam, lat, lon, koersGraden, snelheidKn, tijdMs }

  if (!env.aisstreamApiKey) {
    console.log('[weer] vaarradar: geen AISSTREAM_API_KEY ingesteld, laag blijft leeg (zie backend/.env.example).');
    return { posities, stop: () => {} };
  }
  if (typeof WebSocket === 'undefined') {
    console.log('[weer] vaarradar: deze Node-versie heeft geen ingebouwde WebSocket (nodig: Node 22+), laag blijft leeg.');
    return { posities, stop: () => {} };
  }

  let backoffMs = 5000;
  let gestopt = false;
  let ws = null;
  let herverbindTimer = null;
  let voorbeeldenGelogd = 0;
  let ongefilterdeVoorbeeldenGelogd = 0;
  let eersteDataGemeld = false;

  function log(bericht) {
    console.log(`[weer] vaarradar: ${bericht}`);
  }

  // 2026-08-21, op verzoek van Lex ("zorg dat de app het meldt als er iets
  // verandert") — vaarradar staat verborgen sinds vandaag omdat aisstream.io
  // structureel geen data stuurt (zie EERLIJKE WAARSCHUWING bovenaan dit
  // bestand). Zodra er ooit weer een écht bruikbaar PositionReport
  // binnenkomt, is dat het teken dat aisstream.io het weer doet — dit stuurt
  // dan één keer (per herstart, dankzij de dedup in pushover.js/email.js) een
  // gewone, duidelijke melding via dezelfde kanalen als de weeralarmen. Geen
  // "emergency"-prioriteit: dit is geen hazard, gewoon een statusmelding.
  function eersteDataMelden() {
    if (eersteDataGemeld) return;
    eersteDataGemeld = true;
    log('eerste bruikbare scheepspositie ontvangen sinds herstart — aisstream.io lijkt weer te werken, melding wordt verstuurd.');
    const titel = '⛴️ Vaarradar werkt weer';
    const bericht =
      'aisstream.io stuurt weer scheepsposities door (stond stil sinds 21-08-2026). De Vaart-knop staat nog verborgen in frontend/index.html — haal daar het display:none weg om hem weer te tonen.';
    stuurAlarm({ id: 'vaarradar-eerste-data', titel, bericht, prioriteit: 0 }).catch(() => {});
    stuurMailAlarm({ id: 'vaarradar-eerste-data', titel, bericht }).catch(() => {});
  }

  function opschonen() {
    const nu = Date.now();
    for (const [mmsi, p] of posities) {
      if (nu - p.tijdMs > VENSTER_MS) posities.delete(mmsi);
    }
  }

  function verwerkBericht(ruw) {
    let bericht;
    try {
      bericht = JSON.parse(ruw);
    } catch {
      return;
    }
    // 2026-08-21-fix: dit logde eerst ALLEEN bij MessageType==='PositionReport'
    // — dus als aisstream.io iets anders terugstuurt (bijv. een foutmelding
    // over de sleutel/het abonnement zelf), zagen we dat nergens. Nu wordt
    // het eerste handjevol berichten van ELK type gelogd, ongeacht wat erin
    // zit — cruciaal gebleken bij Lex' eerste live-test: de verbinding lukte
    // wel, maar er kwam nooit een PositionReport binnen, en zonder deze fix
    // was totaal onzichtbaar waarom.
    if (ongefilterdeVoorbeeldenGelogd < 5) {
      ongefilterdeVoorbeeldenGelogd++;
      log(`ruw bericht ${ongefilterdeVoorbeeldenGelogd} (type: ${bericht?.MessageType ?? 'onbekend'}): ${JSON.stringify(bericht).slice(0, 400)}`);
    }
    if (bericht?.MessageType !== 'PositionReport') return;
    const pr = bericht.Message?.PositionReport;
    const meta = bericht.MetaData;
    if (!pr || typeof pr.Latitude !== 'number' || typeof pr.Longitude !== 'number') return;

    eersteDataMelden();

    if (voorbeeldenGelogd < 3) {
      voorbeeldenGelogd++;
      log(`voorbeeldrecord ${voorbeeldenGelogd}: ${JSON.stringify(bericht).slice(0, 300)}`);
    }

    const mmsi = meta?.MMSI ?? pr.UserID;
    if (mmsi == null) return;

    if (posities.size >= MAX_SCHEPEN && !posities.has(mmsi)) {
      const oudste = posities.keys().next().value; // Map bewaart invoegvolgorde — oudste eerst
      posities.delete(oudste);
    }

    // TrueHeading is 511 als "niet beschikbaar" (AIS-conventie) — val dan
    // terug op Cog (course over ground), dat is er vrijwel altijd wel.
    const koersGraden =
      typeof pr.TrueHeading === 'number' && pr.TrueHeading < 511 ? pr.TrueHeading : typeof pr.Cog === 'number' ? pr.Cog : null;

    posities.set(mmsi, {
      mmsi,
      naam: (meta?.ShipName ?? '').trim() || null,
      lat: pr.Latitude,
      lon: pr.Longitude,
      koersGraden,
      snelheidKn: typeof pr.Sog === 'number' ? pr.Sog : null,
      tijdMs: Date.now(),
    });
  }

  function verbind() {
    if (gestopt) return;
    try {
      ws = new WebSocket(WS_URL);
      ws.addEventListener('open', () => {
        backoffMs = 5000;
        log('verbonden, abonneren op bounding box rond Nederland...');
        const abonnementBericht = JSON.stringify({
          APIKey: env.aisstreamApiKey,
          BoundingBoxes: [BBOX],
          FilterMessageTypes: ['PositionReport'],
        });
        // 2026-08-21-toevoeging: 8+ minuten live getest zonder ook maar één
        // bericht, geen 'close', geen 'error' — dus voor zover zichtbaar
        // "gewoon stil". Om uit te sluiten dat het verzenden zelf al misgaat
        // (bijv. ws.send() die om een niet-vanzelfsprekende reden faalt of
        // een afgekapte/lege sleutel meestuurt) loggen we nu expliciet vlak
        // vóór het verzenden de ws.readyState en een gemaskeerde sleutel
        // (alleen de eerste 6 tekens), en vangen we een eventuele throw uit
        // ws.send() zelf op — die zou anders onopgemerkt blijven.
        const gemaskeerdeSleutel = env.aisstreamApiKey ? `${env.aisstreamApiKey.slice(0, 6)}... (${env.aisstreamApiKey.length} tekens)` : '(leeg!)';
        log(`abonnementsbericht klaar (readyState ${ws.readyState}, sleutel: ${gemaskeerdeSleutel}): ${abonnementBericht.replace(env.aisstreamApiKey, gemaskeerdeSleutel)}`);
        try {
          ws.send(abonnementBericht);
          log('abonnementsbericht verzonden.');
        } catch (err) {
          log(`versturen van abonnementsbericht mislukt: ${err.message}`);
        }
        // 2026-08-21-toevoeging: bij Lex' eerste twee live-tests bleef de
        // verbinding gewoon openstaan (geen 'close'/'error') maar kwam er
        // ook na minuten geen enkel bericht binnen — onderscheid tussen "nog
        // niks ontvangen, gewoon geduld" en "verbinding is stil doodgelopen"
        // was zonder dit niet te maken. Deze eenmalige timer meldt het
        // expliciet als er 20s na het abonneren nog niets is binnengekomen.
        const stilTimer = setTimeout(() => {
          if (ongefilterdeVoorbeeldenGelogd === 0) {
            log('waarschuwing: 20s na abonneren nog geen enkel bericht ontvangen (ook geen ander type) — verbinding staat nog open maar lijkt stil te liggen.');
          }
        }, 20000);
        ws.addEventListener('close', () => clearTimeout(stilTimer), { once: true });
      });
      ws.addEventListener('message', (ev) => verwerkBericht(String(ev.data)));
      ws.addEventListener('close', (ev) => {
        // 2026-08-21-fix: eerst loggen we hier geen code/reden — als
        // aisstream.io de verbinding om een inhoudelijke reden weigert (bijv.
        // een foute/verlopen API-sleutel, code 1008 policy violation) was dat
        // dus onzichtbaar. Nu wel, cruciaal om te zien of dit uberhaupt een
        // verbindingsprobleem is i.p.v. "verbonden maar geen data".
        log(`verbinding gesloten (code ${ev.code ?? '?'}${ev.reason ? `, reden: ${ev.reason}` : ''}), nieuwe poging over ${Math.round(backoffMs / 1000)}s`);
        if (!gestopt) {
          herverbindTimer = setTimeout(verbind, backoffMs);
          backoffMs = Math.min(backoffMs * 2, 2 * 60 * 1000);
        }
      });
      // 2026-08-21-fix: zelfde reden als bij 'close' hierboven — dit negeerde
      // eerst alles, terwijl een 'error'-event vaak juist de enige plek is
      // waar iets over de oorzaak (bijv. TLS/netwerkfout) terechtkomt.
      ws.addEventListener('error', (ev) => log(`verbindingsfout: ${ev?.message ?? ev?.error?.message ?? 'onbekende fout'}`));
    } catch (err) {
      log(`kon niet verbinden: ${err.message}`);
      herverbindTimer = setTimeout(verbind, backoffMs);
      backoffMs = Math.min(backoffMs * 2, 2 * 60 * 1000);
    }
  }

  verbind();
  const opschoonTimer = setInterval(opschonen, 60 * 1000);

  return {
    posities,
    stop: () => {
      gestopt = true;
      clearInterval(opschoonTimer);
      clearTimeout(herverbindTimer);
      if (ws) ws.close();
    },
  };
}

export function vaarradarBinnenStraal(posities, lat, lon, straalKm) {
  const resultaat = [];
  for (const p of posities.values()) {
    const afstand = afstandKm(lat, lon, p.lat, p.lon);
    if (afstand <= straalKm) resultaat.push({ ...p, afstandKm: Math.round(afstand * 10) / 10 });
  }
  return resultaat;
}
