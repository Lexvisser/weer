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

function loggeer(uitkomst) {
  const nu = Date.now();
  pollLog.push({ tijdMs: nu, uitkomst });
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
      .map(([uur, n]) => `  ${uur}:00 UTC — ${n} poll(s)`)
      .join('\n') || '  (geen polls in dit venster)';

  return [
    `Lifeliner-poll-rapport — rollend venster van de laatste 24 uur.`,
    ``,
    `${polls.length} credit(s) verbruikt bij OpenSky (dagbudget: ${OPENSKY_DAG_BUDGET}/dag, reset 00:00 UTC).`,
    `${budgetVol.length} tik(ken) overgeslagen omdat het dagbudget al op was.`,
    `${fouten.length} mislukte aanvraag/aanvragen (${regels.filter((p) => p.uitkomst === '429').length} × 429).`,
    regels.length ? `Eerste regel in dit venster: ${new Date(regels[0].tijdMs).toISOString()}` : null,
    regels.length ? `Laatste regel in dit venster: ${new Date(regels[regels.length - 1].tijdMs).toISOString()}` : null,
    ``,
    `Echte polls per uur (UTC):`,
    histogram,
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
    titel: `Lifeliner: OpenSky gaf ${statusCode} — poll-rapport bijgevoegd`,
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
const OPENSKY_DAG_BUDGET = Number(process.env.OPENSKY_DAG_BUDGET ?? 300);
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
    console.log(
      `[weer] lifeliner: staat teruggeladen van schijf (${pollLog.length} poll-log-regel(s), ${creditsVandaag}/${OPENSKY_DAG_BUDGET} credits vandaag al verbruikt) — overleeft nu een herstart/deploy.`
    );
  }
} catch (err) {
  console.error('[weer] lifeliner: eerdere staat inladen mislukt, start koud —', err.message ?? err);
}

// Fire-and-forget, zelfde aanpak als historie.js: een mislukte schrijf mag
// het pollen/rapporteren zelf nooit blokkeren, dan blijft het gewoon (net als
// vóór deze toevoeging) puur in het geheugen werken tot de volgende herstart.
function schrijfStaatNaarSchijf() {
  const data = { pollLog, budgetDatumUtc, creditsVandaag, rapportVerstuurdOpUtcDatum };
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
  if (creditsVandaag >= OPENSKY_DAG_BUDGET) {
    if (!budgetOpGelogd) {
      budgetOpGelogd = true;
      console.warn(
        `[weer] lifeliner: dagbudget (${OPENSKY_DAG_BUDGET} credits) bereikt — pollen gepauzeerd tot 00:00 UTC, laatst bekende data blijft staan`
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

export async function fetchLifeliner({ homeLat, homeLon }) {
  if (homeLat == null || homeLon == null) return [];
  if (!magPollenEnTeltMee()) return laatsteSignalen; // dagbudget op — laatst bekende data laten staan
  const { lamin, lamax, lomin, lomax } = boundingBox(homeLat, homeLon, STRAAL_KM);

  const url = `${STATES_URL}?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`;
  const res = await fetch(url);
  if (!res.ok) {
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
          subtitel: `${afstand} km van huis${kompas ? ` · koers ${kompas}` : ''}${baroAltM != null ? ` · ${Math.round(baroAltM)} m hoogte` : ''}`,
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
