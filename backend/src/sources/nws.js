// NWS — api.weather.gov actieve tornado-waarschuwingen én -watches. Officieel,
// gratis, geen sleutel nodig — wel verplicht een herkenbare User-Agent header
// mee te sturen (staat in NWS' API-etiquette). Documentatie:
// https://www.weather.gov/documentation/services-web-api
//
// Let op: dekt uitsluitend de Verenigde Staten (NWS heeft geen mandaat
// elders) — dit is dus de VS-tegenhanger van "tornado", niet wereldwijd.
// Geometrie in de API is een polygon (of soms null), geen los punt; we
// berekenen zelf het zwaartepunt van de polygon voor de kaartpin, én sturen
// de volledige polygon mee (detail.gebiedPolygon) zodat de frontend 'm als
// omtrek kan tekenen zodra iemand de melding aantikt.
//
// Tornado Warning (imminent, klein gebied, van het lokale NWS-kantoor) en
// Tornado Watch (preventief, groot gebied — vaak een hele "watch box" van
// meerdere staten, uitgegeven door het Storm Prediction Center) zijn bewust
// twee aparte categorieën: heel ander karakter (nu vs. "houd dit gebied in
// de gaten"), dus ook een andere ernst-inschatting en een andere manier van
// tonen op de kaart (warning: gewone hazard-pin; watch: pin + polygon-omtrek).
import { makeSignal } from '../normalize.js';
import { stuurAlarm, kaartTekst } from './pushover.js';
import { stuurMailAlarm } from './email.js';
import { stuurWebPushAlarm } from './webpush.js';
import { metHistorie } from '../historie.js';
import { verversMedia } from '../mediaHistorie.js';
import { telefoonAlarmAan, pushAlarmAan, mailAlarmAan } from '../alarmSchakelaars.js';
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// 2026-08-19: Lex vroeg "hebben we al tsunami warnings?" — nog niet, terwijl
// dit dezelfde api.weather.gov/alerts-infrastructuur is als tornado hierboven
// (zelfde endpoint-vorm, zelfde polygon/severity-velden), dus tegen
// verwaarloosbare extra complexiteit toe te voegen. Zelfde VS-only-beperking
// als tornado (NWS heeft geen mandaat elders) — een wereldwijde tsunami-bron
// (bijv. PTWC voor de hele Stille Oceaan) zou een aparte, nog niet uitgezochte
// bron vergen.
// 2026-08-20: Severe Thunderstorm Warning erbij op verzoek van Lex ("met
// polygonen is ook handig om te hebben") — zelfde NWS-alerts-infrastructuur,
// dus ook hier weer verwaarloosbare extra complexiteit. Triggerde bewust GEEN
// Pushover/mail-alarm (zie de for-lus onderaan fetchNws) — Lex vroeg daar
// niet om, en severe thunderstorms komen te vaak voor om als telefoonalarm
// te willen (i.t.t. tornado warning/watch, die dat wel al deden).
// 2026-08-20, weer uitgezet, óók op verzoek van Lex ("veeeeeels te veel") —
// severe thunderstorms zijn in de VS gewoon te talrijk om als losse rubriek
// prettig te blijven, anders dan tornado/tsunami. Simpelweg de regel
// hieronder terugzetten (en frontend/app.js's EMOJI_PER_CATEGORIE/
// NAAM_PER_CATEGORIE/DOPPLER_CATEGORIEEN weer aanvullen met
// 'severe-thunderstorm', zie de git-historie van dit bestand) is genoeg om
// 'm weer aan te zetten, mocht dat ooit weer gewenst zijn.
const EVENT_TYPES = [
  { event: 'Tornado Warning', categorie: 'tornado' },
  { event: 'Tornado Watch', categorie: 'tornado-watch' },
  { event: 'Tsunami Warning', categorie: 'tsunami' },
  { event: 'Tsunami Watch', categorie: 'tsunami-watch' },
];

// 2026-08-27, op melding van Lex — een tornado warning (New Orleans, LA,
// 27 aug 06:01-06:30 CDT, dus een heel normale/gewone melding) stond in de
// app al "verlopen" terwijl 'ie volgens NWS zelf nog geldig was, en Lex kreeg
// kort na elkaar meerdere warning-mails binnen. Vermoeden: NWS geeft bij een
// update/correctie van een lopende warning soms een NIEUW alert-id uit
// (zie p.id hieronder) i.p.v. het bestaande bij te werken -- voor deze app
// ziet dat eruit als "oude id verdwijnt (dus verlopen) + gloednieuwe id
// verschijnt", terwijl het feitelijk dezelfde dreiging blijft. Destijds
// bewust NOG GEEN gedragswijziging, puur loggen (zie git-historie) -- zonder
// live bevestiging van het patroon was een blinde aanname te riskant.
//
// 2026-09-02, op verzoek van Lex (4 losse mails voor wat 1 doorlopende
// Tornado Warning bleek, 8:57-9:15 EDT) -- nu WEL doorgezet naar echte
// onderdrukking, via "ketens" hieronder. Een keten volgt de laatst bekende
// id + het laatst bekende gebied van één doorlopende dreiging: een nieuw id
// dat verschijnt terwijl een oud id (zelfde categorie) verdwijnt, met een
// overlappend gebied t.o.v. het LAATST bekende gebied van die keten (niet
// per se het allereerste), telt als heruitgave van dezelfde dreiging. Dat
// "laatst bekende" is bewust gekozen omdat het gebied vaak meebeweegt met de
// storm (Lex' observatie: "wat je nu vaak ziet gebeuren") -- na meerdere
// heruitgaves kan het huidige gebied heel anders zijn dan waar de keten
// begon, zolang elke stap overlapt met de vorige blijft het dezelfde keten.
//
// Veiligheidsklep: als een heruitgave het dreigingsniveau verhoogt (bv. een
// gewone warning wordt alsnog PDS/Emergency), wordt het alarm NIET
// onderdrukt -- dat is precies het soort escalatie waar je wél opnieuw voor
// gewaarschuwd wil worden, ongeacht dat het "dezelfde" keten is. Zie
// dreigingsNiveauRang/vindEnSchuifKeten hieronder.
//
// 2026-09-03, op melding van Lex -- de 2026-09-02-versie hierboven bleek
// toch nog 4 losse mails door te laten (Buffalo NY 6:28PM/6:47PM EDT en
// Detroit/Pontiac MI 7:19PM/7:35PM EDT, allebei paren met hetzelfde/
// overlappend gebied). Root cause: de gebied-heuristiek koppelde alleen als
// het OUDE id al uit de live-feed verdwenen was ("if (huidigeIds.has(oudId))
// continue") -- maar NWS laat het oude product bij een heruitgave kennelijk
// gewoon vanzelf aflopen i.p.v. het meteen te annuleren, dus oud én nieuw
// stonden een tijd naast elkaar in de live-feed. Daardoor werd de heruitgave
// nooit als zodanig herkend.
// Fix: NWS' eigen CAP `references`-veld gebruiken als PRIMAIR, autoritatief
// signaal (zie referentieIdsUit/vindEnSchuifKeten hieronder) -- dat veld
// zegt letterlijk welk vorig alert-id deze update vervangt, dus geen gok
// nodig, en werkt ook als het oude id nog live is. De gebied-heuristiek van
// 2026-09-02 blijft staan als fallback voor als references een keer
// ontbreekt, met de bestaande "oud id moet verdwenen zijn"-eis (die is voor
// de heuristiek WEL nodig, anders koppelt-ie te makkelijk twee toevallig-
// overlappende maar echt verschillende tornado's aan elkaar).
const KETEN_TTL_MS = 3 * 60 * 60 * 1000; // 3 uur -- ruim boven duur+heruitgave-marge van een warning, voorkomt kruisbesmetting met een latere, ongerelateerde waarschuwing in hetzelfde gebied
const actieveKetens = new Map(); // huidige id -> { categorie, gebiedTokens, gebiedPolygons, niveau, laatstGezien }

// 2026-09-04, op verzoek van Lex ("we hebben al twee keer eerder een
// failsafe gebouwd voor syncweer, dus waarom nu niet?"): ketens op schijf,
// zodat een syncweer-herstart de lopende ketens (en hun spoor) niet wist --
// dat gaf gisteravond (Saginaw, 19:58 + 20:06) een dubbele mail zonder
// spoor. Zelfde patroon als gemeldOpSchijf.js; gebiedTokens is een Set,
// vandaar de array-omzetting bij laden/bewaren.
const KETENS_PAD = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'nws-ketens.json');
function bewaarKetens() {
  try {
    mkdirSync(dirname(KETENS_PAD), { recursive: true });
    const tmp = `${KETENS_PAD}.tmp`;
    writeFileSync(tmp, JSON.stringify([...actieveKetens].map(([id, k]) => [id, { ...k, gebiedTokens: [...(k.gebiedTokens ?? [])] }])));
    renameSync(tmp, KETENS_PAD);
  } catch (err) {
    console.error('[weer] nws: ketens bewaren mislukt —', err.message ?? err);
  }
}
try {
  if (existsSync(KETENS_PAD)) {
    for (const [id, k] of JSON.parse(readFileSync(KETENS_PAD, 'utf-8'))) {
      if (typeof id === 'string' && k && Number.isFinite(k.laatstGezien)) actieveKetens.set(id, { ...k, gebiedTokens: new Set(k.gebiedTokens ?? []), gebiedPolygons: k.gebiedPolygons ?? [] });
    }
    console.log(`[weer] nws: ${actieveKetens.size} keten(s) geladen van schijf (overleeft herstarts).`);
  }
} catch (err) {
  console.error('[weer] nws: ketens laden mislukt, begin leeg —', err.message ?? err);
}

function ruimVerlopenKetensOp() {
  const nu = Date.now();
  let gewijzigd = false;
  for (const [id, keten] of actieveKetens) {
    if (nu - keten.laatstGezien > KETEN_TTL_MS) { actieveKetens.delete(id); gewijzigd = true; }
  }
  if (gewijzigd) bewaarKetens();
}

// 2026-09-04, Lex: "mijn doel is dat ik de evolutie zie in de mails, dus
// daar wil ik de gebieden ook over elkaar heen zien net als in de app" --
// bij een gekoppelde (en verder onderdrukte) heruitgave waarvan het gebied
// écht veranderd is, gaat één spoor-MAIL uit met alle omtrekken van de
// keten over elkaar (kaartUrlVoor() in email.js). Alleen mail: Pushover/
// webpush blijven stil, dat kanaal is voor "nieuw" en "escalatie".
function stuurSpoorMail(signaal, keten) {
  if (!mailAlarmAan(signaal.categorie)) return;
  const spoor = keten.gebiedPolygons ?? [];
  if (spoor.length < 2) return;
  if (JSON.stringify(spoor[spoor.length - 1]) === JSON.stringify(spoor[spoor.length - 2])) return; // gebied ongewijzigd: niks nieuws te zien
  const label = signaal.categorie === 'tornado' ? '🌪️ Tornado Warning' : signaal.categorie === 'tornado-watch' ? 'Tornado Watch' : signaal.categorie;
  stuurMailAlarm({
    id: `${signaal.id}-spoor`,
    titel: `${label} – heruitgave ${spoor.length} (gebied aangepast)`,
    bericht: kaartTekst(signaal),
    lat: signaal.lat,
    lon: signaal.lon,
    gebiedPolygon: signaal.detail?.gebiedPolygon,
    gebiedPolygonTrail: spoor,
  });
}

// 2026-08-27, op melding van Lex: de gebieden (county's) van opeenvolgende
// tornado-warning-uitgaven schuiven vaak subtiel op naarmate de storm
// beweegt (bv. "Lafourche, LA; St. Charles, LA; St. John The Baptist, LA" ->
// "St. Charles, LA; St. John The Baptist, LA; Jefferson, LA") -- exact-
// gelijke tekst vergelijken (hierboven, eerste versie) miste dat dus
// helemaal. p.areaDesc/detail.gebied is een met ";" gescheiden lijst van
// county's; hier ontleed tot losse, genormaliseerde namen zodat een
// overlappende county (i.p.v. een woordelijk identieke lijst) ook telt.
function gebiedTokens(gebied) {
  if (!gebied) return new Set();
  return new Set(
    gebied
      .split(';')
      .map((deel) => deel.trim().toLowerCase())
      .filter(Boolean),
  );
}

function heeftOverlap(a, b) {
  for (const token of a) if (b.has(token)) return true;
  return false;
}

// Haalt de id's van vorige alerts die dit signaal (volgens NWS zelf)
// vervangt uit het CAP `references`-veld -- defensief tegen twee vormen die
// api.weather.gov kan teruggeven: een array van objecten ({identifier: ...})
// in de GeoJSON-vorm, of de rauwe CAP-tekstvorm ("sender,identifier,sent",
// evt. meerdere door een spatie gescheiden). Geeft altijd een array terug
// (leeg als references ontbreekt/onherkenbaar is) -- nooit fataal, dit is
// een extra signaal bovenop de bestaande gebied-heuristiek, geen vereiste.
function referentieIdsUit(p) {
  const ref = p.references;
  if (!ref) return [];
  const lijst = Array.isArray(ref) ? ref : typeof ref === 'string' ? ref.split(' ').filter(Boolean) : [];
  return lijst
    .map((r) => {
      if (typeof r === 'string') {
        const delen = r.split(',');
        return delen.length >= 2 ? delen[1] : null;
      }
      if (r && typeof r === 'object') return r.identifier ?? null;
      return null;
    })
    .filter(Boolean)
    .map((identifier) => `nws-${identifier}`);
}

// Dreigingsniveau als rangnummer, voor de escalatie-veiligheidsklep hierboven
// (hoger = ernstiger). Niet-tornado-categorieën (tsunami) hebben geen van
// deze velden, dus altijd 0 -- daar wordt elke heruitgave onderdrukt, net als
// voorheen.
function dreigingsNiveauRang(signaal) {
  if (signaal.detail?.tornadoEmergency) return 3;
  if (signaal.detail?.pds) return 2;
  if (signaal.detail?.tornadoWaargenomen) return 1;
  return 0;
}

// Zoekt of `signaal` de voortzetting is van een bestaande keten, in twee
// stappen (zie de 2026-09-03-toelichting hierboven):
//
// 1. Autoritatief: NWS' eigen CAP `references`-veld (referentieIdsUit)
//    vertelt letterlijk welk vorig alert-id dit signaal vervangt -- geen
//    gok, en werkt ook als dat oude id nog gewoon live in de feed staat.
// 2. Fallback: dezelfde gebied-heuristiek als voorheen (zelfde categorie,
//    overlappend gebied met het LAATST bekende gebied van de keten, MAAR
//    alleen als het oude id inmiddels uit de huidige pollcyclus verdween --
//    die eis is hier wel nodig, anders koppelt de heuristiek te makkelijk
//    twee toevallig-overlappende maar echt verschillende tornado's).
//
// Bij een match schuift de keten door naar het nieuwe id/gebied/niveau.
// Return-waarde: `true` = onderdrukken (geen alarm), `false` = keten
// gevonden maar niveau is hoger dan eerder gealarmeerd -- alarm gaat WEL
// door (keten is al bijgewerkt), `null` = geen bestaande keten gevonden.
function vindEnSchuifKeten(signaal, huidigeIds) {
  const tokens = gebiedTokens(signaal.detail?.gebied);
  const niveau = dreigingsNiveauRang(signaal);

  const schuifDoor = (oudId, keten, bron) => {
    actieveKetens.delete(oudId);
    const onderdrukken = niveau <= keten.niveau;
    // 2026-09-03, op verzoek van Lex ("die overlappende veranderende area's
    // zoals in de app") -- de polygon-geschiedenis van de keten meenemen,
    // niet alleen het huidige gebied, zodat de ene mail die uiteindelijk wél
    // verstuurd wordt (zie fetchNws() hieronder) het hele spoor kan tonen.
    // Begrensd op TRAIL_MAX (zie email.js) -- hier ruim gehouden, de
    // uiteindelijke begrenzing gebeurt daar vlak vóór de kaart-URL.
    const gebiedPolygons = [...(keten.gebiedPolygons ?? []), signaal.detail?.gebiedPolygon].filter(Boolean).slice(-12);
    const nieuweKeten = { categorie: signaal.categorie, gebiedTokens: tokens, gebiedPolygons, niveau: Math.max(niveau, keten.niveau), laatstGezien: Date.now() };
    actieveKetens.set(signaal.id, nieuweKeten);
    bewaarKetens();
    if (onderdrukken) stuurSpoorMail(signaal, nieuweKeten); // 2026-09-04: evolutie in de mail, zie stuurSpoorMail()
    console.log(
      onderdrukken
        ? `[weer] nws: heruitgave gekoppeld (${bron}) -- "${oudId}" -> "${signaal.id}" (${signaal.categorie}, gebied nu: ${signaal.detail?.gebied ?? '?'}), alarm onderdrukt (al eerder gealarmeerd voor deze doorlopende dreiging).`
        : `[weer] nws: heruitgave gekoppeld (${bron}) -- "${oudId}" -> "${signaal.id}" (${signaal.categorie}, gebied nu: ${signaal.detail?.gebied ?? '?'}), alarm gaat WEL door -- dreigingsniveau steeg (${keten.niveau} -> ${niveau}).`,
    );
    return onderdrukken;
  };

  for (const refId of signaal.detail?.nwsReferenties ?? []) {
    const keten = actieveKetens.get(refId);
    if (keten) return schuifDoor(refId, keten, 'NWS-references');
  }

  if (!tokens.size) return null;
  for (const [oudId, keten] of actieveKetens) {
    if (oudId === signaal.id) continue;
    if (huidigeIds.has(oudId)) continue; // oud id zelf nog steeds actief -- alleen voor de gebied-fallback een reden om niet te koppelen
    if (keten.categorie !== signaal.categorie) continue;
    if (!heeftOverlap(keten.gebiedTokens, tokens)) continue;
    return schuifDoor(oudId, keten, 'gebied-heuristiek');
  }
  return null;
}

function registreerNieuweKeten(signaal) {
  actieveKetens.set(signaal.id, {
    categorie: signaal.categorie,
    gebiedTokens: gebiedTokens(signaal.detail?.gebied),
    gebiedPolygons: signaal.detail?.gebiedPolygon ? [signaal.detail.gebiedPolygon] : [],
    niveau: dreigingsNiveauRang(signaal),
    laatstGezien: Date.now(),
  });
  bewaarKetens();
}

// Centrale poort vóór elke stuurAlarm/stuurMailAlarm/stuurWebPushAlarm-
// aanroep in fetchNws() hieronder: true = stuur het alarm, false = een
// heruitgave van een al-gealarmeerde keten, dus onderdrukken.
function magDoorAlarmeren(signaal, huidigeIds) {
  // 2026-09-04, bugfix na Lex' mails van vannacht (Grant/Otter Tail MN,
  // 03:04 én 03:23): de heruitgave werd om 03:24 keurig gekoppeld en
  // onderdrukt, maar bij de VOLGENDE poll was het nieuwe id zelf de kop van
  // de keten -- vindEnSchuifKeten() vond dan niets (references wijzen naar
  // het al verwijderde oude id, de gebied-fallback slaat het eigen id over),
  // registreerNieuweKeten() overschreef de keten (spoor weg) en het alarm
  // ging alsnog de deur uit. Nu: een signaal dat al de kop van een keten is,
  // is al afgehandeld -- alleen bij een escalatie mag het alarm nog door.
  const kop = actieveKetens.get(signaal.id);
  if (kop) {
    kop.laatstGezien = Date.now();
    const niveau = dreigingsNiveauRang(signaal);
    if (niveau > kop.niveau) {
      console.log(`[weer] nws: keten-kop "${signaal.id}" escaleert (${kop.niveau} -> ${niveau}), alarm gaat door.`);
      kop.niveau = niveau;
      bewaarKetens();
      return true;
    }
    return false;
  }
  const onderdrukken = vindEnSchuifKeten(signaal, huidigeIds);
  if (onderdrukken === null) {
    registreerNieuweKeten(signaal);
    return true;
  }
  return !onderdrukken;
}

// 2026-08-22: voor de media-zoekterm (zie verversMedia hieronder) — alleen
// p.areaDesc gebruiken (bv. kaal "Putnam, IL") bleek bij een live test met
// Lex te generiek: "Putnam" bestaat als county-naam in meerdere staten, dus
// zonder een woord als "tornado" erbij kregen we net zo makkelijk een oude
// Putnam County-tornado uit Tennessee of Ohio terug i.p.v. de bedoelde. Deze
// lookup zet een categorie terug om naar hetzelfde event-label dat
// EVENT_TYPES hierboven al gebruikt, zodat ook de verlopen-nabewerking in
// fetchNws() (die alleen de categorie van het bevroren signaal heeft, geen
// event-string) dezelfde specifiekere zoekterm kan opbouwen.
const EVENT_PER_CATEGORIE = Object.fromEntries(EVENT_TYPES.map(({ event, categorie }) => [categorie, event]));

const ERNST_PER_SEVERITY = { Extreme: 'kritiek', Severe: 'waarschuwing', Moderate: 'let-op', Minor: 'info' };

// 2026-08-20, op verzoek van Lex — de volledige tornado-ernstladder in
// beeld: naast de gewone Tornado Watch/Warning ook de twee "verzwaarde"
// niveaus PDS (Particularly Dangerous Situation, kan bij zowel watch als
// warning) en Tornado Emergency (het hoogste niveau, alleen bij warnings).
// NWS heeft hier GEEN los event-type of CAP-severity-waarde voor — dit
// wordt uitsluitend aangegeven via de letterlijke frase in de
// waarschuwingstekst zelf. Zelfde aanpak als de Iowa Environmental Mesonet
// hanteert voor hun PDS-detectie ("this phrasing is the only key used to
// identify such events", zie mesonet.agron.iastate.edu/vtec/pds.php).
// Tornado Emergency heeft sinds 2017 daarnaast ook een gestructureerd
// IBW-veld op warning-niveau (parameters.tornadoDamageThreat=CATASTROPHIC)
// — die controleren we als extra, betrouwbaardere check naast de tekst,
// voor het geval de letterlijke frase een keer ontbreekt.
const TORNADO_CATEGORIEEN = new Set(['tornado', 'tornado-watch']);

function bevatFrase(tekst, frase) {
  return typeof tekst === 'string' && tekst.toUpperCase().includes(frase);
}

// 2026-08-20, op verzoek van Lex ("Tornado on the Ground vs Tornado
// confirmed") — het officiële, gestructureerde NWS-veld
// parameters.tornadoDetection, exact twee mogelijke waarden volgens NWS' eigen
// CAP-documentatie (CAP_v12_guide): "RADAR INDICATED" (rotatie gezien op
// radar, geen visuele/schade-bevestiging) of "OBSERVED" (visueel bevestigd
// door getrainde spotter/hulpdiensten, óf een debris-signature op radar) —
// dit vertegenwoordigt NWS' eigen "hoe zeker weten we dit"-niveau, los van
// PDS/Emergency (die gaan over verwachte SCHADE, niet detectie-zekerheid) én
// los van de categorie tornado-bevestigd hieronder (dat zijn achteraf
// ingediende IEM Local Storm Reports, een heel andere bron/timing — dáár
// bestaat vooralsnog maar 1 niveau, EF-schaal komt pas dagen later na een
// schade-onderzoek). Alleen relevant bij een Warning (categorie 'tornado'):
// een Watch heeft geen tornadoDetection-veld, er is nog niets waargenomen.
function tornadoWaargenomen(p, categorie) {
  if (categorie !== 'tornado') return false;
  return (p.parameters?.tornadoDetection ?? []).includes('OBSERVED');
}

function tornadoDreigingsniveau(p, categorie) {
  if (!TORNADO_CATEGORIEEN.has(categorie)) return { pds: false, emergency: false };
  const volledigeTekst = `${p.headline ?? ''} ${p.description ?? ''}`;
  const pds = bevatFrase(volledigeTekst, 'PARTICULARLY DANGEROUS SITUATION');
  const catastrofaal = (p.parameters?.tornadoDamageThreat ?? []).includes('CATASTROPHIC');
  // Tornado Emergency bestaat per definitie alleen op warning-niveau (nooit
  // bij een watch) — ook al zou een watch-tekst toevallig "tornado
  // emergency" noemen (bv. als verwijzing naar een eerdere gebeurtenis),
  // dan telt dat hier bewust niet mee.
  const emergency = categorie === 'tornado' && (catastrofaal || bevatFrase(volledigeTekst, 'TORNADO EMERGENCY'));
  return { pds, emergency };
}

function ernstVoor(categorie, severity) {
  const isWatch = categorie.endsWith('-watch');
  const basis = ERNST_PER_SEVERITY[severity] ?? (isWatch ? 'let-op' : 'waarschuwing');
  // Een "watch" is preventief — nooit zo dringend als een actieve warning,
  // ook niet als NWS 'm zelf als "Extreme" classificeert. Gegeneraliseerd van
  // alleen tornado-watch naar elke *-watch-categorie (nu ook tsunami-watch).
  if (isWatch && basis === 'kritiek') return 'waarschuwing';
  return basis;
}

function ringen(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates[0]];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.map((polygon) => polygon[0]);
  return [];
}

function zwaartepunt(geometry) {
  const punten = ringen(geometry).flat();
  if (!punten.length) return [null, null];
  const lon = punten.reduce((som, p) => som + p[0], 0) / punten.length;
  const lat = punten.reduce((som, p) => som + p[1], 0) / punten.length;
  return [lat, lon];
}

// GeoJSON-ringen zijn [lon, lat] — Leaflet wil [lat, lon].
function ringenAlsLatLon(geometry) {
  return ringen(geometry).map((ring) => ring.map(([lon, lat]) => [lat, lon]));
}

// 2026-08-19: community-media (zie sources/media.js), op verzoek van Lex
// ("voor elke categorie akkoord"). NWS-alerts hebben geen eigen naam zoals
// een orkaan — areaDesc (getroffen county's/staten) is de beste beschikbare
// zoekterm.
// 2026-08-22: was hier een simpele one-shot cache per alert-id (zoekt precies
// één keer, bij het eerst zien van een alert) — vervangen door
// mediaHistorie.js se verversMedia(), die periodiek (elke 3 uur, tot 48 uur
// na ontstaan) opnieuw zoekt én naar schijf persisteert. Aanleiding: de
// tornado in Putnam County, IL bleek pas uren later goed gedocumenteerd met
// nieuws/video, ruim na het moment waarop de oude cache al voorgoed had
// besloten "niks gevonden". Zie ook de nabewerking onderaan fetchNws() die
// hetzelfde doet voor inmiddels-verlopen signalen (die hier niet meer
// binnenkomen, want ze zitten niet meer in de live NWS-feed).
async function fetchEventType({ event, categorie }) {
  const res = await fetch(`https://api.weather.gov/alerts/active?event=${encodeURIComponent(event)}`, {
    headers: {
      'User-Agent': 'weer-app-persoonlijk (contact: lokaal project)',
      Accept: 'application/geo+json',
    },
  });
  if (!res.ok) throw new Error(`NWS feed (${event}) gaf status ${res.status}`);
  const body = await res.json();

  return Promise.all(
    (body.features ?? []).map(async (f) => {
      const p = f.properties;
      const [lat, lon] = zwaartepunt(f.geometry);
      const gebiedPolygon = ringenAlsLatLon(f.geometry);
      const id = `nws-${p.id}`;

      const { pds, emergency } = tornadoDreigingsniveau(p, categorie);
      // 2026-08-20: waargenomen ("op de grond") toegevoegd als vierde
      // titel-niveau — ná Emergency/PDS (die gaan over verwachte schade, dus
      // zwaarder) maar vóór de kale titelBasis (radar-indicated, het
      // stille/impliciete default-niveau, geen prefix nodig — dat zijn
      // verreweg de meeste warnings).
      const waargenomen = tornadoWaargenomen(p, categorie);
      const titelBasis = p.headline ?? p.event ?? event;
      const titel = emergency
        ? `🚨 TORNADO EMERGENCY - ${titelBasis}`
        : pds
        ? `⚠️ PDS - ${titelBasis}`
        : waargenomen
        ? `🎯 TORNADO OP DE GROND - ${titelBasis}`
        : titelBasis;
      // Tornado Emergency is per definitie het hoogste niveau — ongeacht wat
      // NWS' eigen severity-veld toevallig zegt, forceren we hier 'kritiek'
      // (in de praktijk zal severity vrijwel altijd al Extreme zijn, maar dit
      // maakt het geen toeval).
      const ernst = emergency ? 'kritiek' : ernstVoor(categorie, p.severity);

      return makeSignal({
        id,
        categorie,
        titel,
        ernst,
        lat,
        lon,
        tijd: p.effective ?? p.sent,
        detail: {
          gebied: p.areaDesc ?? null,
          geldigTot: p.expires ?? null,
          instructie: p.instruction ?? null,
          bronUrl: 'https://alerts.weather.gov/',
          gebiedPolygon: gebiedPolygon.length ? gebiedPolygon : null,
          communityMedia: await verversMedia({
            id,
            zoekterm: p.areaDesc ? `${event} ${p.areaDesc}` : null,
            ontstaanIso: p.effective ?? p.sent,
          }),
          pds,
          tornadoEmergency: emergency,
          tornadoWaargenomen: waargenomen,
          nwsReferenties: referentieIdsUit(p),
        },
      });
    })
  );
}

// ---- Testfixture: gesimuleerde watch om de gebied-omtrek-weergave te
// bekijken zonder te wachten op een echte actieve VS-tornado-watch. Alleen
// actief met WEER_TEST_TORNADO_WATCH=1 in backend/.env — zet 'm daarna weer
// terug naar 0 (of verwijder de regel) en herstart, anders blijft er
// permanent een nep-melding tussen de echte data staan. Titel is expres
// onmiskenbaar als "TEST" gemarkeerd, precies omdat het hele punt van deze
// app eerlijke, vertrouwde signalering is — een nep-alarm mag nooit op een
// echte lijken.
function testTornadoWatchSignaal() {
  const nu = Date.now();
  // Ruwe, plausibele "watch box"-vorm over Kansas/Oklahoma (klassiek Tornado
  // Alley-gebied) — geen echte NWS-coördinaten, puur om de polygon-tekening
  // en fitBounds-gedrag te kunnen bekijken.
  const gebiedPolygon = [
    [
      [37.6, -99.4],
      [37.9, -96.0],
      [34.1, -95.2],
      [33.8, -98.6],
      [37.6, -99.4],
    ],
  ];
  const [lat, lon] = [35.85, -97.3];
  return makeSignal({
    id: 'nws-test-tornado-watch',
    categorie: 'tornado-watch',
    titel: 'TEST - Tornado Watch (gesimuleerd, geen echt alarm)',
    ernst: 'waarschuwing',
    lat,
    lon,
    tijd: new Date(nu).toISOString(),
    detail: {
      gebied: 'TEST-gebied - Kansas/Oklahoma (gesimuleerd)',
      geldigTot: new Date(nu + 3 * 60 * 60 * 1000).toISOString(),
      instructie: null,
      bronUrl: 'https://alerts.weather.gov/',
      gebiedPolygon,
    },
  });
}

// ---- Testfixture: gesimuleerde tornado-melding op de ECHTE locatie van de
// tornado in Putnam County, IL (nacht van 21 op 22 augustus 2026) — om de
// nieuwe media-historie-laag hierboven (mediaHistorie.js) end-to-end te
// kunnen controleren zonder op een nieuwe, actieve VS-tornado te hoeven
// wachten. Anders dan de watch-testfixture hierboven is dit GEEN nep-locatie:
// zoekterm/gebied is een echte NWS-areaDesc-vorm ("Putnam, IL"), dus
// verversMedia() doet hier een ECHTE SearXNG-zoekopdracht en zou (zolang er
// nog nieuwsartikelen/video's over die tornado vindbaar zijn) gewoon
// relevante resultaten moeten teruggeven — dat is precies wat dit test.
// Alleen actief met WEER_TEST_PUTNAM_TORNADO=1, zelfde "duidelijk als TEST"-
// aanpak als WEER_TEST_TORNADO_WATCH hieronder, om dezelfde reden (een nep-
// alarm mag nooit op een echte lijken). Async omdat 'm meteen een media-
// zoekopdracht uitvoert i.p.v. pas bij de eerstvolgende pollcyclus.
async function testPutnamTornadoSignaal() {
  const nu = Date.now();
  const id = 'nws-test-putnam-tornado';
  // Hennepin, IL — de county seat van Putnam County, ongeveer het midden van
  // het echte getroffen gebied.
  const [lat, lon] = [41.19, -89.09];
  // 2026-08-22: gebied in dezelfde vorm als een echte NWS areaDesc ("Putnam,
  // IL"), en de zoekterm opgebouwd via dezelfde EVENT_PER_CATEGORIE-aanpak
  // als fetchEventType/de verlopen-nabewerking hierboven — bewust NIET meer
  // het bredere "Putnam County Illinois tornado" van de eerste versie: die
  // bleek bij een live test met Lex resultaten op te leveren over een
  // gelijknamige Putnam County-tornado in Tennessee/Ohio, precies het
  // probleem dat de event-prefix + time_range=week (zie sources/searxng.js)
  // hierboven moeten verhelpen — dus dit testsignaal moet dat ook echt testen
  // i.p.v. het per ongeluk omzeilen met een handmatig verrijkte zoekterm.
  const gebied = 'Putnam, IL';
  const zoekterm = `${EVENT_PER_CATEGORIE.tornado} ${gebied}`;
  return makeSignal({
    id,
    categorie: 'tornado',
    titel: 'TEST - Tornado Warning Putnam County, IL (gesimuleerd, geen echt alarm)',
    ernst: 'kritiek',
    lat,
    lon,
    tijd: new Date(nu).toISOString(),
    detail: {
      gebied,
      geldigTot: new Date(nu + 60 * 60 * 1000).toISOString(),
      instructie: null,
      bronUrl: 'https://alerts.weather.gov/',
      gebiedPolygon: null,
      communityMedia: await verversMedia({ id, zoekterm, ontstaanIso: nu }),
    },
  });
}

export async function fetchNws() {
  // Beide event-types los ophalen i.p.v. één gecombineerde query — als één
  // van de twee hapert, valt de hele bron niet meteen stil (bv. alleen
  // warnings tonen als watches tijdelijk mislukken is beter dan niets).
  const resultaten = await Promise.allSettled(EVENT_TYPES.map(fetchEventType));
  const gelukt = resultaten.filter((r) => r.status === 'fulfilled');
  if (!gelukt.length) throw resultaten[0].reason;
  resultaten
    .filter((r) => r.status === 'rejected')
    .forEach((r) => console.error('[weer] nws: één event-type mislukte,', r.reason?.message ?? r.reason));
  const signalen = gelukt.flatMap((r) => r.value);
  if (process.env.WEER_TEST_TORNADO_WATCH === '1') {
    console.log('[weer] nws: WEER_TEST_TORNADO_WATCH=1 — gesimuleerde tornado-watch toegevoegd (niet echt!)');
    signalen.push(testTornadoWatchSignaal());
  }
  if (process.env.WEER_TEST_PUTNAM_TORNADO === '1') {
    console.log(
      '[weer] nws: WEER_TEST_PUTNAM_TORNADO=1 — gesimuleerde Putnam County-tornado toegevoegd (test mediaHistorie/SearXNG met een echte zoekopdracht, niet echt!)'
    );
    signalen.push(await testPutnamTornadoSignaal());
  }

  // 2026-08-19: op verzoek van Lex — bij tornado warning én -watch een
  // Pushover-alarm (zie pushover.js), ook als de app niet openstaat. Bewust
  // hier centraal ná het samenvoegen (i.p.v. binnen fetchEventType) zodat
  // ook de testfixture hierboven 'm meekrijgt — die bleek er eerst buiten te
  // vallen, waardoor WEER_TEST_TORNADO_WATCH=1 wél een testsignaal op de
  // kaart gaf maar géén Pushover-melding stuurde. Warning is acuut
  // (emergency-prioriteit, blijft herhalen), watch is preventief
  // (high-prioriteit, geen herhaling). Bewust niet awaiten: mag de
  // signalen-opbouw nooit vertragen, stuurAlarm vangt eigen fouten al af.
  //
  // 2026-08-20: bericht is nu kaartTekst(s) i.p.v. alleen s.titel — Lex zag
  // bij een echte tornado warning dat de kaart-popup wél de county's
  // ("Delaware, IN") toonde maar de Pushover-melding niet duidelijk (die zat
  // verstopt in de titel, die op het lockscreen werd afgekapt). Op zijn
  // verzoek ("kaart is leidend") komt de titel nu overeen met wat de kaart
  // laat zien, mét de county's gegarandeerd zichtbaar in de hoofdtekst.
  // 2026-08-20: mail-alarm (zie email.js) ernaast, op verzoek van Lex — zelfde
  // trigger/tekst als Pushover hierboven (kaartTekst(s), "kaart is leidend"),
  // los aan/uit-schakelbaar (EMAIL_INGESCHAKELD) en met een eigen dedup, dus
  // onafhankelijk van of Pushover aan- of uitstaat.
  // 2026-09-02: keten-opruiming + de verzameling "nog live" ids éénmalig per
  // cyclus vóór de lus, zodat magDoorAlarmeren() hieronder voor elk signaal
  // dezelfde snapshot gebruikt (zie vindEnSchuifKeten hierboven).
  ruimVerlopenKetensOp();
  const liveIds = new Set(signalen.map((s) => s.id));
  for (const s of signalen) {
    if (s.categorie === 'tornado' || s.categorie === 'tornado-watch') {
      // 2026-09-03: telefoonalarm per categorie schakelbaar (alarmSchakelaars.js)
      if (magDoorAlarmeren(s, liveIds) && telefoonAlarmAan(s.categorie)) {
        // 2026-08-20: de alarm-titel (het vetgedrukte deel op het lockscreen)
        // volgt nu ook het dreigingsniveau (zie tornadoDreigingsniveau
        // hierboven) — bij Tornado Emergency, het hoogste niveau, moet dát
        // meteen bovenaan staan i.p.v. de generieke "Tornado Warning"-titel.
        const titel = s.detail?.tornadoEmergency
          ? '🚨 TORNADO EMERGENCY'
          : s.detail?.pds
          ? `⚠️ PDS ${s.categorie === 'tornado' ? 'Tornado Warning' : 'Tornado Watch'}`
          : s.detail?.tornadoWaargenomen
          ? '🎯 Tornado op de grond'
          : s.categorie === 'tornado'
          ? '🌪️ Tornado Warning'
          : 'Tornado Watch';
        const bericht = kaartTekst(s);
        if (pushAlarmAan(s.categorie)) stuurAlarm({ id: s.id, titel, bericht, prioriteit: s.categorie === 'tornado' ? 2 : 1 });
        // 2026-08-20: lat/lon/gebiedPolygon erbij op verzoek van Lex ("kaartje
        // met de boundary in de mail") — zie kaartUrlVoor() in email.js.
        // 2026-09-03: gebiedPolygonTrail erbij -- de volledige keten-
        // geschiedenis (zie schuifDoor/registreerNieuweKeten hierboven),
        // zodat de mail bij een keten van meerdere heruitgaves het hele
        // opgeschoven/gegroeide gebied laat zien, niet alleen het huidige.
        if (mailAlarmAan(s.categorie)) stuurMailAlarm({
          id: s.id,
          titel,
          bericht,
          lat: s.lat,
          lon: s.lon,
          gebiedPolygon: s.detail?.gebiedPolygon,
          gebiedPolygonTrail: actieveKetens.get(s.id)?.gebiedPolygons,
        });
        // 2026-08-22: derde, rustige (niet-herhalende) alarmkanaal naast
        // Pushover/mail hierboven — zie webpush.js voor de aanleiding.
        // lat/lon/gebiedPolygon erbij (2026-08-22, tweede toevoeging) zodat
        // de melding zelf ook het kaartje kan tonen, zelfde bron als de mail.
        // url erbij (2026-08-22, derde toevoeging, na Lex' "klikken opent wel
        // de app maar niet de melding zelf") — /?signaal=<id> laat app.js bij
        // het laden de kaart op precies dit signaal centreren, zie verversen().
        if (pushAlarmAan(s.categorie)) stuurWebPushAlarm({
          id: s.id,
          titel,
          bericht,
          url: `/?signaal=${encodeURIComponent(s.id)}`,
          lat: s.lat,
          lon: s.lon,
          gebiedPolygon: s.detail?.gebiedPolygon,
        });
      }
    }
    // 2026-08-27, op verzoek van Lex ("telefoonalarm graag") — de
    // VS-tsunami's uit deze bron stuurden tot nu toe GEEN telefoonalarm
    // (alleen tornado's deden dat); nu wel, tegelijk met de nieuwe
    // wereldwijde tsunami-bronnen (ptwc.js + gdacs TS-events) en met
    // dezelfde serverbrede aan/uit-schakelaar (zie alarmSchakelaars.js,
    // in te stellen via Instellingen -> Alarmen). Warning = emergency-
    // prioriteit 2 (zelfde afweging als tornado warning), watch = 1.
    if ((s.categorie === 'tsunami' || s.categorie === 'tsunami-watch') && telefoonAlarmAan(s.categorie)) { // 2026-09-03: per categorie (tsunami / tsunami-watch)
      if (magDoorAlarmeren(s, liveIds)) {
        const titel = s.categorie === 'tsunami' ? '🌊 Tsunami Warning' : 'Tsunami Watch';
        const bericht = kaartTekst(s);
        if (pushAlarmAan(s.categorie)) stuurAlarm({ id: s.id, titel, bericht, prioriteit: s.categorie === 'tsunami' ? 2 : 1 });
        if (mailAlarmAan(s.categorie)) stuurMailAlarm({
          id: s.id,
          titel,
          bericht,
          lat: s.lat,
          lon: s.lon,
          gebiedPolygon: s.detail?.gebiedPolygon,
          gebiedPolygonTrail: actieveKetens.get(s.id)?.gebiedPolygons,
        });
        if (pushAlarmAan(s.categorie)) stuurWebPushAlarm({
          id: s.id,
          titel,
          bericht,
          url: `/?signaal=${encodeURIComponent(s.id)}`,
          lat: s.lat,
          lon: s.lon,
          gebiedPolygon: s.detail?.gebiedPolygon,
        });
      }
    }
  }

  // 2026-08-20: historie (zie historie.js) NA de alarm-lus hierboven —
  // Pushover/mail moeten alleen ooit op echt-live signalen reageren, nooit op
  // een teruggehaald "verlopen"-signaal van hieronder (die zouden toch al
  // gededupliceerd worden via de gemeld-Set in pushover.js/email.js, maar dit
  // voorkomt sowieso elke twijfel daarover).
  const totaal = metHistorie('nws', signalen);

  // 2026-08-22: verlopen signalen zitten niet meer in `signalen` hierboven
  // (ze staan niet meer in de live NWS-feed), dus fetchEventType() heeft er
  // dit keer geen verversMedia() voor aangeroepen. Zonder deze aparte pas zou
  // een tornado die inmiddels "verlopen" is nooit meer nieuw materiaal
  // krijgen — precies het gat dat Lex signaleerde na de Putnam County-tornado
  // (het beste materiaal, nieuws/storm-chaser-video, verschijnt vaak pas
  // uren tot dagen ná afloop van de waarschuwing zelf). Bewust ná
  // metHistorie() (die geeft zowel live als verlopen signalen terug) i.p.v.
  // hier zelf een aparte cache bij te houden — mediaHistorie.js is de enige
  // plek die weet wát/wanneer er laatst gezocht is. Muteert detail.
  // communityMedia rechtstreeks op de door metHistorie() teruggegeven
  // (verse, elke cyclus opnieuw opgebouwde) signaal-kopieën, dus geen risico
  // op state die tussen cycli blijft hangen.
  await Promise.all(
    totaal
      .filter((s) => s.detail?.verlopen)
      .map(async (s) => {
        // Zelfde opbouw als in fetchEventType hierboven (event + areaDesc) —
        // het bevroren signaal heeft geen eigen "event"-string meer, dus via
        // EVENT_PER_CATEGORIE terugvertaald vanuit s.categorie.
        const gebied = s.detail?.gebied;
        const zoekterm = gebied ? `${EVENT_PER_CATEGORIE[s.categorie] ?? ''} ${gebied}`.trim() : null;
        s.detail.communityMedia = await verversMedia({ id: s.id, zoekterm, ontstaanIso: s.tijd });
      })
  );

  return totaal;
}
