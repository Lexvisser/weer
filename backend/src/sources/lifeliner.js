// Lifeliner — de Nederlandse traumahelikopters (MMT, Mobiel Medisch Team).
// Dit zijn GEEN P2000-tekstberichten (zie sources/p2000.js voor brandweer/
// politie/ambulance) maar live vluchtdata: we volgen de bekende registraties
// via OpenSky Network, een gratis/geen-sleutel ADS-B-vluchtdatabase
// (opensky-network.org, non-profit/community-onderhouden sensor-netwerk).
//
// Bekende registraties (bron: traumaradar.nl, 2026-08-19 — NIET onafhankelijk
// live geverifieerd tegen een echte vlucht, dus kan achterhaald/onvolledig
// zijn als een helikopter van tail-nummer wisselt):
//   Lifeliner 1 — Amsterdam Heliport     — PH-TTR
//   Lifeliner 2 — Rotterdam The Hague    — PH-MAA
//   Lifeliner 3 — Vliegbasis Volkel      — PH-UMC
//   Lifeliner 4 — Groningen Airport Eelde— PH-HVB
//   Ambulancehelikopter Leeuwarden       — PH-OOP (niet officieel "Lifeliner"
//     genummerd, maar zelfde soort inzet — wel meegenomen op Lex' verzoek
//     ("brandweer, politie, ambulance, lifeliner" — dit valt onder ambulance-
//     lucht).
//
// OpenSky's `callsign`-veld is bij kleine toestellen vaak leeg of bevat de
// registratie zelf (spaties opgevuld tot 8 tekens) i.p.v. een nette
// vluchtnaam als "LIFELN1" — we matchen daarom op BEIDE: een eventuele
// LIFELN-callsign EN de bekende registratie (spaties/streepjes genegeerd).
//
// EERLIJKE WAARSCHUWING: nooit live getest (geen internettoegang in de
// sandbox waar dit gebouwd is) — het matchen op registratie in het
// callsign-veld is een aanname over hoe OpenSky dit specifieke type toestel
// rapporteert. Bij opstarten loggen we de eerste poll met hoeveel toestellen
// er in de bounding box zaten en hoeveel daarvan matchten, zodat op je eigen
// PC meteen te zien is of de match iets oplevert.
import { makeSignal, afstandKm } from '../normalize.js';
import { stuurMailAlarm } from './email.js';
import { msSindsLaatsteMMTMelding } from './p2000.js';
import { readFileSync, mkdirSync, existsSync, writeFile } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const STATES_URL = 'https://opensky-network.org/api/states/all';

// 2026-08-23, op verzoek van Lex ("maak maar en dan gewoon het rapport laten
// doorlopen") — aanleiding: op een dag met meerdere syncweer-herstarts (zoals
// vandaag, voor heel andere fixes) bleek dit hele blok — dagbudget, poll-log,
// "al een rapport gestuurd vandaag" — puur in het geheugen te leven, dus elke
// herstart zette alles weer op nul. Twee gevolgen, allebei ongewenst: (1) de
// dagbudget-teller "vergat" dat OpenSky's eigen server-side teller voor ons
// IP gewoon doortelt, dus na een herstart dacht de app "0/300 verbruikt"
// terwijl OpenSky alsnog meteen weer 429 gaf — onze eigen bescherming werkte
// dan niet meer. (2) het rapport werd na elke herstart met een vers/leeg
// venster verstuurd, en de dag-dedup (zie stuurRapportBijNood) werd ook mee
// gereset — vandaar drie bijna-identieke mails in één ochtend. Zelfde aanpak
// als src/historie.js (bestaande, vergelijkbare "overleef een herstart"-
// behoefte): één klein JSON-bestand in data/ (staat al in .gitignore),
// synchroon ingeladen bij opstarten, fire-and-forget weggeschreven na elke
// wijziging. Een mislukte/ontbrekende/corrupte lees- of schrijfactie mag dit
// nooit laten crashen — dan gewoon verder alsof het een koude start is,
// exact zoals vóór deze toevoeging.
const __dirname = dirname(fileURLToPath(import.meta.url));
const STAAT_BESTAND = join(__dirname, '..', '..', 'data', 'lifeliner-staat.json');

// ---- Poll-rapport, 2026-08-23 ----------------------------------------------
// Lex: "Het lifeliner pollenprobleem. Ik wil een rapport wanneer en hoeveel
// er wordt gepolled. Dat moet ingaan op een moment dat we geen achterstand
// hebben (24u?). Zodra 429 optreedt dan kan het rapport via mail binnenkomen
// zodat we er naar kunnen kijken en het verbeteren."
//
// Een rollend 24-uurs logboek van elke ECHTE aanroep van deze module — dus
// ná de idle-gate in server.js (die hier sowieso niet zichtbaar is: een
// idle-overgeslagen tik bereikt fetchLifeliner() nooit, alleen een tik die
// wél tot hier doordringt telt als "gepolld", zie pollOnce() in server.js).
// "Geen achterstand" (Lex' eigen woorden) is hiermee automatisch geregeld:
// een ROLLEND venster (elke regel ouder dan 24u valt vanzelf uit `pollLog`)
// draagt nooit een oude backlog mee — het rapport laat altijd precies de
// afgelopen 24 uur zien, nooit "sinds ooit" opgestapeld.
const RAPPORT_VENSTER_MS = 24 * 60 * 60 * 1000;
let pollLog = []; // [{ tijdMs, uitkomst }] — uitkomst: 'poll' | 'budget-vol' | '429' | 'fout'
// "Al een rapport-mail gestuurd op deze UTC-datum?" — zie stuurRapportBijNood
// hieronder. Los van email.js' eigen in-memory dedup (die dekt alleen binnen
// hetzelfde proces): dit veld wordt naar schijf geschreven, dus overleeft een
// herstart wél.
let rapportVerstuurdOpUtcDatum = null;

// 2026-09-04: `modus` erbij ('missie' | 'trigger' | 'hartslag') zodat het
// rapport kan laten zien waar de credits heen gaan (zie huidigeModus()).
function loggeer(uitkomst, modus = huidigeModus()) {
  const nu = Date.now();
  pollLog.push({ tijdMs: nu, uitkomst, modus });
  pollLog = pollLog.filter((p) => nu - p.tijdMs <= RAPPORT_VENSTER_MS);
  schrijfStaatNaarSchijf();
}

// Tekstrapport over het rollende venster — leesbaar in een mail, geen HTML
// nodig. Export zodat server.js 'm ook los kan tonen via /api/lifeliner-
// rapport, voor tussentijds meekijken zonder op een 429 te hoeven wachten.
export function lifelinerRapportTekst() {
  const nu = Date.now();
  const regels = pollLog.filter((p) => nu - p.tijdMs <= RAPPORT_VENSTER_MS);
  const polls = regels.filter((p) => p.uitkomst === 'poll');
  const budgetVol = regels.filter((p) => p.uitkomst === 'budget-vol');
  const fouten = regels.filter((p) => p.uitkomst === '429' || p.uitkomst === 'fout');

  const perUur = new Map(); // "2026-08-23T14" -> aantal echte polls
  polls.forEach((p) => {
    const uurKey = new Date(p.tijdMs).toISOString().slice(0, 13);
    perUur.set(uurKey, (perUur.get(uurKey) ?? 0) + 1);
  });
  const histogram =
    [...perUur.entries()]
      .sort()
      .map(([uur, n]) => `  ${uur}:00 UTC - ${n} poll(s)`)
      .join('\n') || '  (geen polls in dit venster)';

  // 2026-08-28, na Lex' vraag over het 401-getal: het rollende venster kan
  // TWEE UTC-dagen overspannen, waardoor de venstersom boven het dagbudget
  // uit kan komen zonder dat één dag eroverheen ging. Daarom nu ook de som
  // per UTC-dag — dat is het getal dat echt naast het dagbudget hoort.
  const perDag = new Map(); // "2026-08-23" -> aantal credits
  polls.forEach((p) => {
    const dagKey = new Date(p.tijdMs).toISOString().slice(0, 10);
    perDag.set(dagKey, (perDag.get(dagKey) ?? 0) + 1);
  });
  const perDagTekst = [...perDag.entries()]
    .sort()
    .map(([dag, n]) => `  ${dag}: ${n} credit(s)`)
    .join('\n') || '  (geen)';

  // 2026-09-04: credits per poll-modus, zodat er beleid op te maken valt
  // ("wat kost een missie eigenlijk, en wat kost de hartslag?").
  const perModus = { missie: 0, trigger: 0, hartslag: 0, onbekend: 0 };
  polls.forEach((p) => { perModus[p.modus ?? 'onbekend'] = (perModus[p.modus ?? 'onbekend'] ?? 0) + 1; });
  const modusTekst = `  missie (toestel in de lucht, elke ${Math.round(MISSIE_POLL_MS / 1000)}s): ${perModus.missie}\n`
    + `  trigger (MMT-P2000 gezien, elke ${Math.round(TRIGGER_POLL_MS / 1000)}s): ${perModus.trigger}\n`
    + `  hartslag (rust, elke ${Math.round(LIFELINER_HEARTBEAT_MS / 1000)}s): ${perModus.hartslag}`
    + (perModus.onbekend ? `\n  (van vóór deze indeling: ${perModus.onbekend})` : '');

  return [
    `Lifeliner-poll-rapport - rollend venster van de laatste 24 uur.`,
    ``,
    `${polls.length} credit(s) verbruikt in dit venster (let op: het venster kan twee UTC-dagen overspannen).`,
    `Waarvan per poll-modus:`,
    modusTekst,
    `Per UTC-dag (dagbudget ${openskyDagBudget()}/dag, reset 00:00 UTC):`,
    perDagTekst,
    `${budgetVol.length} tik(ken) overgeslagen omdat het dagbudget al op was.`,
    `${spaarstandOvergeslagen} tik(ken) in spaarstand overgeslagen sinds de laatste herstart (geen credit gekost).`,
    openskyRestCredits
      ? `OpenSky meldt zelf: ${openskyRestCredits.waarde} credit(s) over (X-Rate-Limit-Remaining, gezien ${new Date(openskyRestCredits.tijdMs).toISOString()}).`
      : `OpenSky's eigen X-Rate-Limit-Remaining nog niet gezien sinds de laatste herstart.`,
    `Modus: ${openskyCredsAanwezig() ? 'geauthenticeerd (API-client, 4000/dag)' : 'anoniem (~400/dag)'}.`,
    `${fouten.length} mislukte aanvraag/aanvragen (${regels.filter((p) => p.uitkomst === '429').length} × 429).`,
    regels.length ? `Eerste regel in dit venster: ${new Date(regels[0].tijdMs).toISOString()}` : null,
    regels.length ? `Laatste regel in dit venster: ${new Date(regels[regels.length - 1].tijdMs).toISOString()}` : null,
    ``,
    `Echte polls per uur (UTC):`,
    histogram,
    ``,
    vluchtlogboekTekst(),
  ]
    .filter((regel) => regel != null)
    .join('\n');
}

// Wordt aangeroepen zodra OpenSky een 429 teruggeeft (zie fetchLifeliner
// hieronder). `stuurMailAlarm` (email.js) dedupliceert zelf op `id`, maar
// alleen totdat het proces herstart — op een dag met meerdere syncweer-
// herstarts (zoals 2026-08-23, zie de STAAT_BESTAND-comment bovenaan dit
// bestand) gaf dat alsnog een mailbox vol bijna-identieke rapporten. Vandaar
// hier een EIGEN, naar schijf geschreven dag-check: één rapport-mail per
// UTC-kalenderdag, ongeacht hoe vaak de backend die dag herstart.
// 2026-08-23, op verzoek van Lex ("kan dat naar lexvisser@gmail.com ipv het
// apple adres?") — dit rapport specifiek naar zijn Gmail-adres i.p.v. het
// algemene EMAIL_ONTVANGER (dat blijft ongewijzigd voor de andere
// alarmen, tornado/meteoalarm — alleen dít rapport wijkt af).
function stuurRapportBijNood(statusCode) {
  const vandaag = huidigeUtcDatum();
  if (rapportVerstuurdOpUtcDatum === vandaag) return;
  rapportVerstuurdOpUtcDatum = vandaag;
  schrijfStaatNaarSchijf();
  stuurMailAlarm({
    id: `lifeliner-rapport-${vandaag}`,
    titel: `Lifeliner: OpenSky gaf ${statusCode} - poll-rapport bijgevoegd`,
    bericht: lifelinerRapportTekst(),
    to: 'lexvisser@gmail.com',
  });
}

// ---- Daags credit-budget bewaken, 2026-08-21 -------------------------------
// Aanleiding: Lex — "dat pollen moet verminderen want ik heb elke dag 429
// daar" (zie ook config.js). De bestaande gates in server.js
// (overslaanAlsIdle, de 15-min MMT-trigger-uitzondering) verminderen het
// aantal polls, maar garanderen geen dagbudget: bij een paar uur actief
// kijken loopt zelfs 30s-pollen (2/min × een paar uur) OpenSky's eigen
// anonieme limiet (~400 credits/dag, zie de note bij deze bron in config.js)
// alsnog vast — precies wat er telkens weer gebeurde, ook na 10s→30s
// (2026-08-19). Nog een keer aan het interval draaien lost het dus niet
// gegarandeerd op (hangt af van hoe lang de app open staat, niet alleen van
// de snelheid) — dit is de harde stop die het wél garandeert: zodra het
// dagbudget op is, wordt er vandaag simpelweg niet meer bij OpenSky
// opgevraagd. `pollOnce()` in server.js blijft gewoon elke 60s aanroepen
// (telt niet als fout), maar deze functie slaat de HTTP-call dan over en
// geeft de laatst bekende signalen terug — de kaart klapt niet leeg,
// ververst alleen niet meer tot de volgende UTC-dag (OpenSky's budget reset
// op UTC-middernacht).
// OPENSKY_DAG_BUDGET blijft met opzet ruim onder de ~400-limiet: marge voor
// de credits die de MMT-trigger-polls (server.js) ook uit dezelfde pot
// betalen, en voor het feit dat de exacte limiet nooit officieel door
// OpenSky gedocumenteerd is (uit eerdere 429-ervaringen afgeleid, niet uit
// hun docs). Aanpasbaar via `OPENSKY_DAG_BUDGET` in .env zonder codewijziging.
// 2026-08-28: standaard-budget hangt nu af van de modus — met de OpenSky
// API-client is het dagbudget 4.000, waarvan we er 3.500 nemen als eigen
// marge; anoniem blijft de oude voorzichtige 300 onder de ~400 staan.
// OPENSKY_DAG_BUDGET in .env overschrijft beide.
// LIVE-BUG-FIX (gezien op het echte rapport, direct na de eerste deploy):
// dit was eerst een const op moduleniveau — maar ES-imports worden
// geëvalueerd VÓÓRDAT index.js loadEnvFile() draait, dus op dat moment zijn
// OPENSKY_CLIENT_ID/SECRET nog leeg en bleef het budget op 300 staan
// terwijl de authenticatie zelf (die de env pas bij gebruik leest) wél
// werkte. Daarom nu een functie: elke check leest de env vers.
function openskyDagBudget() {
  return Number(process.env.OPENSKY_DAG_BUDGET ?? (openskyCredsAanwezig() ? 3500 : 300));
}
let budgetDatumUtc = null; // "2026-08-21" — resetpunt
let creditsVandaag = 0;
let laatsteSignalen = [];
let budgetOpGelogd = false;

function huidigeUtcDatum() {
  return new Date().toISOString().slice(0, 10);
}

// Zie de STAAT_BESTAND-comment bovenaan dit bestand — hierna pas staan
// pollLog/rapportVerstuurdOpUtcDatum/budgetDatumUtc/creditsVandaag allemaal
// als `let`-bindingen klaar om overschreven te worden met wat er (eventueel)
// van een vorige run op schijf staat. Wat buiten het rapport-venster valt
// (bv. na een lange downtime) wordt meteen weggefilterd i.p.v. pas bij de
// eerstvolgende loggeer()-call.
try {
  mkdirSync(dirname(STAAT_BESTAND), { recursive: true });
  if (existsSync(STAAT_BESTAND)) {
    const ruw = JSON.parse(readFileSync(STAAT_BESTAND, 'utf-8'));
    const nu = Date.now();
    if (Array.isArray(ruw.pollLog)) {
      pollLog = ruw.pollLog.filter((p) => nu - p.tijdMs <= RAPPORT_VENSTER_MS);
    }
    if (typeof ruw.budgetDatumUtc === 'string') budgetDatumUtc = ruw.budgetDatumUtc;
    if (typeof ruw.creditsVandaag === 'number') creditsVandaag = ruw.creditsVandaag;
    if (typeof ruw.rapportVerstuurdOpUtcDatum === 'string') rapportVerstuurdOpUtcDatum = ruw.rapportVerstuurdOpUtcDatum;
    if (Array.isArray(ruw.vluchtLog)) vluchtLog = ruw.vluchtLog.slice(-VLUCHTLOG_MAX);
    if (ruw.openVluchten && typeof ruw.openVluchten === 'object') {
      for (const [k, v] of Object.entries(ruw.openVluchten)) openVluchten.set(k, v);
    }
    console.log(
      `[weer] lifeliner: staat teruggeladen van schijf (${pollLog.length} poll-log-regel(s), ${creditsVandaag}/${openskyDagBudget()} credits vandaag al verbruikt) — overleeft nu een herstart/deploy.`
    );
  }
} catch (err) {
  console.error('[weer] lifeliner: eerdere staat inladen mislukt, start koud —', err.message ?? err);
}

// Fire-and-forget, zelfde aanpak als historie.js: een mislukte schrijf mag
// het pollen/rapporteren zelf nooit blokkeren, dan blijft het gewoon (net als
// vóór deze toevoeging) puur in het geheugen werken tot de volgende herstart.
function schrijfStaatNaarSchijf() {
  const data = { pollLog, budgetDatumUtc, creditsVandaag, rapportVerstuurdOpUtcDatum, vluchtLog, openVluchten: Object.fromEntries(openVluchten) };
  writeFile(STAAT_BESTAND, JSON.stringify(data), (err) => {
    if (err) console.error('[weer] lifeliner: staat wegschrijven naar schijf mislukt —', err.message ?? err);
  });
}

// true = mag pollen (en telt 'm meteen mee), false = dagbudget op, sla over.
function magPollenEnTeltMee() {
  const vandaag = huidigeUtcDatum();
  if (vandaag !== budgetDatumUtc) {
    budgetDatumUtc = vandaag;
    creditsVandaag = 0;
    budgetOpGelogd = false;
  }
  if (creditsVandaag >= openskyDagBudget()) {
    if (!budgetOpGelogd) {
      budgetOpGelogd = true;
      console.warn(
        `[weer] lifeliner: dagbudget (${openskyDagBudget()} credits) bereikt — pollen gepauzeerd tot 00:00 UTC, laatst bekende data blijft staan`
      );
    }
    loggeer('budget-vol');
    return false;
  }
  creditsVandaag++;
  loggeer('poll');
  return true;
}

// ---- Gevlogen route bijhouden, 2026-08-19 ----------------------------------
// OpenSky's states/all geeft alleen een momentopname, geen geschiedenis — de
// "echte" trackgeschiedenis-endpoint (/tracks) bestaat wel bij OpenSky, maar
// vereist een OAuth2-account (geen anonieme toegang), dus bewust niet
// gebruikt om dit sleutelloos te houden zoals de rest van het project. In
// plaats daarvan bouwen we zelf een spoor op: elke poll die een toestel nog
// in de lucht ziet, plakken we het huidige punt achter een lijst met eerdere
// punten voor datzelfde icao24 (module-brede Map, overleeft dus pollcycli).
// Wordt vanzelf ruwer/grover naarmate het poll-interval groter is — vandaar
// dat lifeliner (i.t.t. de meeste andere bronnen) een kort interval heeft
// (zie config.js), specifiek om een bruikbaar spoor te krijgen.
const TRAIL_VENSTER_MS = 90 * 60 * 1000; // hoe lang geleden een punt nog meetelt (dekt een enkele vlucht heen+terug)
const TRAIL_STALE_MS = 20 * 60 * 1000; // zo lang niet meer gezien = spoor wissen (nieuwe vlucht begint vers)
const TRAIL_MAX_PUNTEN = 60; // extra vangnet naast het tijdvenster
const trails = new Map(); // icao24 -> { punten: [{lat,lon,tijdMs}], laatstGezienMs }

// 2026-08-19: Lex zag een vliegend toestel (spoor werd opgebouwd) zonder
// kompaskoers erbij — vermoeden: OpenSky's true_track-veld staat vaker null
// bij helikopters dan bij vliegtuigen (trager/onregelmatiger vliegprofiel),
// maar niet live te bevestigen zonder de ruwe waarde te zien. Log daarom de
// eerste paar matches met hun ruwe velden, zelfde aanpak als de
// "voorbeeldrecord"-logs bij de andere bronnen.
let matchVoorbeeldenGelogd = 0;

// "Alleen bij mij in de buurt" — ruimer dan de P2000-straal (25km) omdat een
// helikopter die net over de horizon vliegt ook nog relevant/zichtbaar is,
// en omdat je toch al alleen toestellen ziet die daadwerkelijk static hierin
// vliegen (geen ruis zoals bij tekst-gebaseerde bronnen).
const STRAAL_KM = 75;

const BEKENDE_REGISTRATIES = new Map([
  ['PHTTR', 'Lifeliner 1'],
  ['PHMAA', 'Lifeliner 2'],
  ['PHUMC', 'Lifeliner 3'],
  ['PHHVB', 'Lifeliner 4'],
  ['PHOOP', 'Ambulancehelikopter Leeuwarden'],
]);

function normaliseer(str) {
  return String(str ?? '').replace(/[\s-]/g, '').toUpperCase();
}

function naamVoor(icao24, callsign) {
  const kaleCallsign = normaliseer(callsign);
  if (kaleCallsign.startsWith('LIFELN')) return `Lifeliner ${kaleCallsign.replace('LIFELN', '') || '?'}`;
  for (const [reg, naam] of BEKENDE_REGISTRATIES) {
    if (kaleCallsign === reg) return naam;
  }
  return null;
}

// ---- Kompasrichting i.p.v. een echte bestemming, 2026-08-19 ----------------
// Lex vroeg waar de Lifeliner "naar toe gaat" — net als P2000 nu de echte
// straat/plaats laat zien i.p.v. een kaal bonnummer. Bij Lifeliner ligt dat
// anders: OpenSky (gratis/sleutelloos ADS-B) geeft alléén live positie +
// koers, GEEN vluchtplan/bestemming — dat bestaat simpelweg niet in deze
// databron (een vluchtplan zit bij de luchtverkeersleiding, niet bij ADS-B-
// ontvangststations). Een "bestemming" verzinnen zou dus gokwerk zijn.
// Eerlijker alternatief: de vliegrichting zelf, afgeleid uit het al
// opgehaalde `koersGraden`-veld, omgezet naar een herkenbare kompas-
// afkorting (16-punts, zoals op een scheepskompas/windroos). Geen bestemming,
// wel een bruikbare aanwijzing van "waar naartoe" — en, i.t.t. een gegokte
// bestemming, 100% traceerbaar naar de ruwe data.
const KOMPASPUNTEN = ['N', 'NNO', 'NO', 'ONO', 'O', 'OZO', 'ZO', 'ZZO', 'Z', 'ZZW', 'ZW', 'WZW', 'W', 'WNW', 'NW', 'NNW'];

function graadNaarKompas(graden) {
  if (graden == null || Number.isNaN(graden)) return null;
  const index = Math.round(((graden % 360) + 360) % 360 / 22.5) % 16;
  return KOMPASPUNTEN[index];
}

// Grove bounding box rond thuis — 1° breedtegraad ≈ 111km overal, 1°
// lengtegraad ≈ 111km × cos(breedtegraad), dus gecorrigeerd voor NL's
// breedtegraad zodat de box ongeveer vierkant blijft i.p.v. te breed te zijn.
function boundingBox(lat, lon, straalKm) {
  const dLat = straalKm / 111;
  const dLon = straalKm / (111 * Math.cos((lat * Math.PI) / 180));
  return { lamin: lat - dLat, lamax: lat + dLat, lomin: lon - dLon, lomax: lon + dLon };
}

// ---- Spaarstand (2026-08-28) -----------------------------------------------
// Aanleiding: Lex' poll-rapport van 23-24 aug — met de iPad-PWA de hele dag
// open is de app nooit "idle" (het 20s-/api/signals-ritme houdt
// laatsteClientMs vers in server.js), dus liep Lifeliner de klok rond op
// missietempo (pieken tot 56 polls/uur) en stevende het dagbudget al vóór de
// middag op de 300 af — precies op om leeg te zijn wanneer er WEL een inzet
// komt. De idle-gate spaart dus alleen als er niemand kijkt; dit spaart ook
// mét een kijkende client.
//
// Regel: op missietempo (het 30s-interval uit config.js) wordt alleen echt
// gepolld zolang er iets aan de hand is — een toestel dat recent in de lucht
// is gezien, of een MMT-dispatch (P2000) korter dan 15 min geleden (zelfde
// venster als LIFELINER_TRIGGER_VENSTER_MS in server.js). Anders geldt de
// hartslag: één echte poll per LIFELINER_HEARTBEAT_MS (standaard 10 min,
// via .env aanpasbaar) om een opstijging alsnog binnen minuten te zien —
// waarna de vlucht zelf de snelle modus weer aanzet. Overgeslagen tikken
// kosten niets (geen API-call, geen credit) en geven de laatst bekende data
// terug, zodat de kaart gewoon gevuld blijft.
//
// Rekensom: app 24/7 open zonder vluchten = ~144 credits/dag; één missie
// van ~45 min kost er ~90 extra — twee missies op een dag passen dan nog
// steeds ruim binnen het 300-budget, waar het oude gedrag al vóór de middag
// droog stond.
// ---- OpenSky OAuth2 (2026-08-28) -------------------------------------------
// Op initiatief van Lex (gratis OpenSky-account 'lexvis' aangemaakt): een
// geregistreerde API-client heeft 4.000 credits/dag i.p.v. de ~400 anoniem —
// en als hij later gaat feeden wordt dat vanzelf 8.000, zonder codewijziging
// hier (zelfde credentials, OpenSky hoogt server-side op). Zet in .env:
//   OPENSKY_CLIENT_ID=...        (uit "Create & Download Credential" op de
//   OPENSKY_CLIENT_SECRET=...     accountpagina — het bestandje credentials.json)
// Zonder deze twee draait alles gewoon anoniem door zoals voorheen — geen
// harde afhankelijkheid, zelfde sleutelloos-terugval-patroon als de rest.
// Token via client_credentials op OpenSky's Keycloak; ~30 min geldig, wordt
// 60s vóór het verlopen ververst. Een 401 (ingetrokken/verlopen token)
// gooit de cache weg zodat de eerstvolgende poll een verse haalt.
const OPENSKY_TOKEN_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
let openskyToken = null; // { token, verlooptMs }

function openskyCredsAanwezig() {
  return Boolean(process.env.OPENSKY_CLIENT_ID && process.env.OPENSKY_CLIENT_SECRET);
}

async function openskyAuthHeaders() {
  if (!openskyCredsAanwezig()) return {};
  const nu = Date.now();
  if (openskyToken && nu < openskyToken.verlooptMs - 60 * 1000) {
    return { Authorization: `Bearer ${openskyToken.token}` };
  }
  try {
    const res = await fetch(OPENSKY_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.OPENSKY_CLIENT_ID,
        client_secret: process.env.OPENSKY_CLIENT_SECRET,
      }).toString(),
    });
    if (!res.ok) throw new Error(`token-endpoint gaf status ${res.status}`);
    const body = await res.json();
    if (!body.access_token) throw new Error('token-endpoint gaf geen access_token');
    openskyToken = { token: body.access_token, verlooptMs: nu + (Number(body.expires_in) || 1800) * 1000 };
    console.log(`[weer] lifeliner: OpenSky OAuth2-token opgehaald (geldig ~${Math.round(((Number(body.expires_in) || 1800)) / 60)} min)`);
    return { Authorization: `Bearer ${openskyToken.token}` };
  } catch (err) {
    // Token-probleem mag een poll nooit blokkeren — anoniem verder (minder
    // budget, maar werkend), en de volgende poll probeert het gewoon opnieuw.
    console.error('[weer] lifeliner: OpenSky-token ophalen mislukt, deze poll anoniem:', err.message ?? err);
    return {};
  }
}

// OpenSky stuurt bij elke respons zelf de resterende credits mee
// (X-Rate-Limit-Remaining, zie de accountpagina) — dat is de wáre stand,
// onze eigen teller is maar een schaduwboekhouding. We onthouden de laatst
// geziene waarde voor het rapport; zakt 'ie naar 0, dan loggen we dat
// expliciet (de eigen dagbudget-rem hieronder blijft de echte handrem).
let openskyRestCredits = null; // { waarde, tijdMs }

function noteerRestCredits(res) {
  const ruw = res.headers?.get?.('x-rate-limit-remaining');
  const waarde = Number(ruw);
  if (ruw != null && Number.isFinite(waarde)) {
    if (waarde <= 0 && (openskyRestCredits?.waarde ?? 1) > 0) {
      console.warn('[weer] lifeliner: OpenSky meldt 0 resterende credits voor vandaag');
    }
    openskyRestCredits = { waarde, tijdMs: Date.now() };
  }
}

// 2026-09-04, op verzoek van Lex ("zodra we beet hebben met pollen wil ik op
// dat moment heel vaak pollen zodat we een vlucht goed kunnen vastleggen"),
// nu het budget 4000/dag is i.p.v. ~400. Drie tempo's:
//   missie   — toestel in de lucht gezien (tot 10 min na de laatste
//              waarneming): elke MISSIE_POLL_MS (10s). Een vlucht van 45 min
//              kost dan ~270 credits.
//   trigger  — MMT-P2000-melding korter dan 15 min geleden, maar nog geen
//              toestel gezien: elke TRIGGER_POLL_MS (60s) om de opstijging te
//              vangen. Max ~15 credits per trigger.
//   hartslag — rust: elke LIFELINER_HEARTBEAT_MS (nu 2 min i.p.v. 10;
//              ~720/dag bij de app 24/7 open). Alles via .env aanpasbaar.
// De setInterval-tik in server.js (config.js pollIntervalMs) is de fijnste
// korrel: die staat nu op 10s; de tempo's hierboven zijn veelvouden daarvan.
const LIFELINER_HEARTBEAT_MS = Number(process.env.LIFELINER_HEARTBEAT_MS ?? 2 * 60 * 1000);
const MISSIE_POLL_MS = Number(process.env.LIFELINER_MISSIE_POLL_MS ?? 10 * 1000);
const TRIGGER_POLL_MS = Number(process.env.LIFELINER_TRIGGER_POLL_MS ?? 60 * 1000);

function huidigeModus() {
  const nuMs = Date.now();
  if (nuMs < actiefTotMs) return 'missie';
  if (msSindsLaatsteMMTMelding() < MMT_TRIGGER_VENSTER_MS) return 'trigger';
  return 'hartslag';
}
function pollTempoMs(modus) {
  return modus === 'missie' ? MISSIE_POLL_MS : modus === 'trigger' ? TRIGGER_POLL_MS : LIFELINER_HEARTBEAT_MS;
}

// ---- Vluchtlogboek, 2026-09-04 ---------------------------------------------
// Lex: "Ik heb geen zicht op waar ik in het proces zit en kan eigenlijk nooit
// een vlucht volgen." De losse waarnemingen (elke poll een momentopname)
// worden hier tot VLUCHTEN gebundeld: eerste waarneming in de lucht opent
// een vlucht, elke volgende waarneming werkt 'm bij, en TRAIL_STALE_MS (20
// min) zonder waarneming sluit 'm af. Afgesloten vluchten gaan naar
// vluchtLog (op schijf, laatste VLUCHTLOG_MAX), open vluchten overleven een
// herstart ook. Het rapport (lifelinerRapportTekst) toont ze onderaan,
// inclusief hoeveel credits de vlucht zelf gekost heeft.
const VLUCHTLOG_MAX = 50;
let vluchtLog = []; // afgesloten vluchten, oud -> nieuw
const openVluchten = new Map(); // icao24 -> vlucht

function vluchtBijwerken({ icao24, naam, lat, lon, baroAltM, afstand, nu }) {
  let v = openVluchten.get(icao24);
  if (v && nu - v.laatstMs > TRAIL_STALE_MS) { sluitVlucht(icao24, v); v = null; }
  if (!v) {
    v = {
      icao24, naam, startMs: nu, startLat: lat, startLon: lon, startAfstandKm: afstand,
      laatstMs: nu, laatstLat: lat, laatstLon: lon, laatstAfstandKm: afstand,
      minAfstandKm: afstand, maxAfstandKm: afstand, maxHoogteM: baroAltM ?? null, waarnemingen: 0,
      mmtTrigger: msSindsLaatsteMMTMelding() < 60 * 60 * 1000, // P2000-MMT in het uur ervoor = waarschijnlijke aanleiding
      gaten: 0, // aantal keer dat 'ie een poll niet in de data zat maar daarna terugkwam
    };
    openVluchten.set(icao24, v);
    console.log(`[weer] lifeliner: vlucht gestart — ${naam} op ${afstand} km van huis`);
  } else if (nu - v.laatstMs > 2 * MISSIE_POLL_MS + 5000) {
    v.gaten++;
  }
  v.laatstMs = nu; v.laatstLat = lat; v.laatstLon = lon; v.laatstAfstandKm = afstand;
  v.minAfstandKm = Math.min(v.minAfstandKm, afstand);
  v.maxAfstandKm = Math.max(v.maxAfstandKm, afstand);
  if (baroAltM != null) v.maxHoogteM = Math.max(v.maxHoogteM ?? 0, Math.round(baroAltM));
  v.waarnemingen++;
}

function sluitVlucht(icao24, v) {
  openVluchten.delete(icao24);
  v.eindMs = v.laatstMs;
  v.credits = pollLog.filter((p) => p.uitkomst === 'poll' && p.tijdMs >= v.startMs - MISSIE_POLL_MS && p.tijdMs <= v.eindMs + ACTIEF_NA_VLUCHT_MS).length;
  vluchtLog.push(v);
  vluchtLog = vluchtLog.slice(-VLUCHTLOG_MAX);
  console.log(`[weer] lifeliner: vlucht afgesloten — ${v.naam}, ${Math.round((v.eindMs - v.startMs) / 60000)} min, ${v.waarnemingen} waarnemingen, ~${v.credits} credits`);
  schrijfStaatNaarSchijf();
}

function sluitVerlopenVluchten(nu) {
  for (const [icao24, v] of openVluchten) {
    if (nu - v.laatstMs > TRAIL_STALE_MS) sluitVlucht(icao24, v);
  }
}

function vluchtSamenvatting(icao24) {
  const v = openVluchten.get(icao24);
  if (!v) return null;
  return { startMs: v.startMs, waarnemingen: v.waarnemingen, gaten: v.gaten, maxAfstandKm: v.maxAfstandKm, creditsVandaag };
}
// 2026-09-04 (Lex: "zet de credits op een eigen regel, maak de tekst iets
// leesbaarder"): twee losse regels onder de Lifeliner-melding.
function vluchtTellerRegels(icao24) {
  const v = openVluchten.get(icao24);
  if (!v) return [];
  const sinds = new Date(v.startMs).toLocaleTimeString('nl-NL', { timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit' });
  const minuten = Math.max(1, Math.round((Date.now() - v.startMs) / 60000));
  const gaten = v.gaten ? `, ${v.gaten} keer even kwijt` : '';
  return [
    `🚁 In beeld sinds ${sinds} (${minuten} min) — ${v.waarnemingen} posities ontvangen${gaten}`,
    `🎟️ OpenSky: ${creditsVandaag} van ${openskyDagBudget()} credits gebruikt${openskyRestCredits ? `, ${openskyRestCredits.waarde} over` : ''}`,
  ];
}

function nlTijd(ms) {
  return new Date(ms).toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function vluchtRegel(v, open) {
  const eind = open ? nu0() : v.eindMs;
  const duur = Math.round((eind - v.startMs) / 60000);
  const gem = v.waarnemingen > 1 ? Math.round((v.laatstMs - v.startMs) / 1000 / (v.waarnemingen - 1)) : null;
  return [
    `  ${v.naam} — ${nlTijd(v.startMs)} t/m ${open ? 'nu' : nlTijd(v.eindMs)} NL (${duur} min${open ? ', LOOPT NOG' : ''})`,
    `    ${v.waarnemingen} waarneming(en)${gem != null ? `, gem. elke ${gem}s` : ''}${v.gaten ? `, ${v.gaten} gat(en) in de data` : ''}${v.credits != null ? `, ~${v.credits} credits` : ''}`,
    `    afstand van huis: start ${v.startAfstandKm} km, laatst ${v.laatstAfstandKm} km (dichtstbij ${v.minAfstandKm} km, verst ${v.maxAfstandKm} km)${v.maxHoogteM != null ? `, max ${v.maxHoogteM} m hoogte` : ''}`,
    `    aanleiding: ${v.mmtTrigger ? 'MMT-P2000-melding in het uur ervoor' : 'geen MMT-P2000-melding gezien'}`,
  ].join('\n');
}
function nu0() { return Date.now(); }

export function vluchtlogboekTekst() {
  const nu = Date.now();
  const recent = vluchtLog.filter((v) => nu - v.eindMs <= 7 * 24 * 60 * 60 * 1000);
  const regels = [`Vluchtlogboek (open vluchten + afgesloten vluchten van de laatste 7 dagen, max ${VLUCHTLOG_MAX} bewaard):`];
  for (const v of openVluchten.values()) regels.push(vluchtRegel(v, true));
  for (const v of [...recent].reverse()) regels.push(vluchtRegel(v, false));
  if (regels.length === 1) regels.push('  (nog geen vluchten vastgelegd)');
  return regels.join('\n');
}

export function vluchtlogboekJson() {
  return {
    status: {
      modus: huidigeModus(),
      creditsVandaag,
      budget: openskyDagBudget(),
      restCredits: openskyRestCredits?.waarde ?? null,
      geauthenticeerd: openskyCredsAanwezig(),
    },
    open: [...openVluchten.values()],
    afgesloten: [...vluchtLog].reverse(),
  };
}
const MMT_TRIGGER_VENSTER_MS = 15 * 60 * 1000; // spiegel van LIFELINER_TRIGGER_VENSTER_MS in server.js
const ACTIEF_NA_VLUCHT_MS = 10 * 60 * 1000; // na de laatste in-de-lucht-waarneming nog even snel blijven volgen (landing/doorstart)
let laatsteEchtePollMs = 0;
let actiefTotMs = 0; // tot wanneer de snelle modus aanstaat (in de lucht gezien / net geland)
let spaarstandOvergeslagen = 0; // teller voor het rapport (sinds procesherstart; bewust niet in pollLog — 120/uur zou het venster vollopen)

export async function fetchLifeliner({ homeLat, homeLon }) {
  if (homeLat == null || homeLon == null) return [];
  const nuMs = Date.now();
  sluitVerlopenVluchten(nuMs);
  const modus = huidigeModus();
  // -1s speling: de setInterval-tik komt nooit exact op tijd.
  if (nuMs - laatsteEchtePollMs < pollTempoMs(modus) - 1000) {
    spaarstandOvergeslagen++;
    return laatsteSignalen; // tempo-gate: geen API-call, geen credit
  }
  if (!magPollenEnTeltMee()) return laatsteSignalen; // dagbudget op — laatst bekende data laten staan
  laatsteEchtePollMs = nuMs;
  const { lamin, lamax, lomin, lomax } = boundingBox(homeLat, homeLon, STRAAL_KM);

  const url = `${STATES_URL}?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`;
  const res = await fetch(url, { headers: await openskyAuthHeaders() });
  noteerRestCredits(res);
  if (!res.ok) {
    // 401 met credentials = token verlopen/ingetrokken — cache weggooien
    // zodat de eerstvolgende poll een verse haalt.
    if (res.status === 401 && openskyCredsAanwezig()) openskyToken = null;
    loggeer(res.status === 429 ? '429' : 'fout');
    // 2026-08-23, op verzoek van Lex: precies bij een 429 het poll-rapport
    // mailen — dat is het moment waarop er iets te verbeteren valt aan het
    // budget/interval, niet bij een incidentele andere HTTP-fout.
    if (res.status === 429) stuurRapportBijNood(res.status);
    throw new Error(`OpenSky states/all gaf status ${res.status}`);
  }
  const body = await res.json();
  const states = body.states ?? [];

  let matches = 0;
  const nu = Date.now();
  const gezienDezeRonde = new Set();
  const signalen = [];
  for (const s of states) {
    const [icao24, callsignRuw, , , , lon, lat, baroAltM, aanGrond, snelheidMs, koersGraden] = s;
    const naam = naamVoor(icao24, callsignRuw);
    if (!naam) continue;
    if (lat == null || lon == null) continue; // geen positie bekend (net geland/net vertrokken)

    matches++;
    gezienDezeRonde.add(icao24);

    // Spoor bijwerken — alleen punten toevoegen als 'ie echt vliegt (aan de
    // grond kan hij stilstaan/taxiën, dat hoort niet bij de vluchtroute).
    let trail = trails.get(icao24);
    if (!trail) {
      trail = { punten: [], laatstGezienMs: nu };
      trails.set(icao24, trail);
    }
    trail.laatstGezienMs = nu;
    if (!aanGrond) {
      // 2026-08-28: een toestel in de lucht houdt de snelle poll-modus aan
      // (zie de spaarstand-toelichting bij fetchLifeliner) — en nog even
      // erná, zodat een landing/doorstart niet gemist wordt.
      actiefTotMs = nu + ACTIEF_NA_VLUCHT_MS;
      vluchtBijwerken({ icao24, naam, lat, lon, baroAltM, afstand: afstandKm(homeLat, homeLon, lat, lon), nu });
      trail.punten.push({ lat, lon, tijdMs: nu });
      trail.punten = trail.punten
        .filter((p) => nu - p.tijdMs <= TRAIL_VENSTER_MS)
        .slice(-TRAIL_MAX_PUNTEN);
    }

    const afstand = afstandKm(homeLat, homeLon, lat, lon);
    // Kompasrichting alleen tonen als 'ie ook echt vliegt — aan de grond
    // (stilstaand/taxiend) is een "koers" niet zinvol en vaak ruis.
    const kompas = !aanGrond ? graadNaarKompas(koersGraden) : null;
    if (matchVoorbeeldenGelogd < 5) {
      matchVoorbeeldenGelogd++;
      console.log(
        `[weer] lifeliner: voorbeeldmatch ${matchVoorbeeldenGelogd}: ${naam} — aanGrond=${aanGrond} snelheidMs=${snelheidMs} koersGraden=${koersGraden} → kompas=${kompas}`
      );
    }
    signalen.push(
      makeSignal({
        id: `lifeliner-${icao24}`,
        categorie: 'hulpdiensten',
        // "Categorie - kort" patroon (2026-08-19), zelfde als bij p2000.js —
        // consistent met de rest van de Meldingenlijst. Kompasrichting erbij
        // (2026-08-19, op verzoek van Lex: "waar ie naar toe gaat") — géén
        // echte bestemming (OpenSky levert geen vluchtplan), wel een
        // eerlijke, uit de live koers afgeleide aanwijzing.
        titel: `Hulpdiensten - ${naam}${kompas ? ` (koers ${kompas})` : ''}`,
        ernst: 'waarschuwing', // een traumahelikopter in de lucht duidt vrijwel altijd op een actieve inzet
        lat,
        lon,
        tijd: new Date().toISOString(),
        detail: {
          discipline: 'lifeliner',
          naam,
          icao24,
          aanGrond: Boolean(aanGrond),
          hoogteM: baroAltM != null ? Math.round(baroAltM) : null,
          snelheidKmh: snelheidMs != null ? Math.round(snelheidMs * 3.6) : null,
          koersGraden: koersGraden != null ? Math.round(koersGraden) : null,
          kompas,
          afstandTotJouKm: afstand,
          // 2026-09-04 (Lex: "kan je de teller laten meelopen op de lifeliner
          // kaart?"): live vluchtteller erbij — sinds wanneer gevolgd, hoeveel
          // waarnemingen (elke 10s één), en de credits van vandaag.
          subtitel: `${afstand} km van huis${kompas ? ` · koers ${kompas}` : ''}${baroAltM != null ? ` · ${Math.round(baroAltM)} m hoogte` : ''}`,
          subregels: vluchtTellerRegels(icao24), // elk op een eigen regel in lijst + popup
          vlucht: vluchtSamenvatting(icao24),
          bronUrl: 'https://opensky-network.org/',
          // Route tot nu toe (sinds deze poll-loop 'm is gaan volgen — geen
          // historische data van vóór het opstarten van de backend), oud
          // naar nieuw, klaar voor Leaflet's L.polyline([[lat,lon], ...]).
          route: trail.punten.map((p) => [p.lat, p.lon]),
        },
      }),
    );
  }

  // Sporen van toestellen die deze ronde niet meer voorkwamen (geland/buiten
  // bereik) een tijdje bewaren i.p.v. meteen weggooien — pas na
  // TRAIL_STALE_MS opruimen, zodat een kort gat in de dekking niet meteen de
  // hele route laat verdwijnen. Wél nodig: anders groeit deze Map ongelimiteerd.
  for (const [icao24, trail] of trails) {
    if (!gezienDezeRonde.has(icao24) && nu - trail.laatstGezienMs > TRAIL_STALE_MS) {
      trails.delete(icao24);
    }
  }

  console.log(`[weer] lifeliner: ${states.length} toestel(len) in de bounding box, ${matches} match(en)`);
  laatsteSignalen = signalen;
  return signalen;
}
