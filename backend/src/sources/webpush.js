// webpush.js — stuurt native browser/PWA-pushmeldingen (Web Push, RFC
// 8291/8292) naar Lex' geïnstalleerde PWA op zijn iPhone, als derde
// alarmkanaal naast Pushover (pushover.js) en e-mail (email.js).
//
// Aanleiding, 2026-08-22: Lex vindt Pushover's prioriteit-2 ("emergency")
// meldingen storend — die blijven net zo lang herhalen (retry/expire, zie
// pushover.js) tot ze bevestigd worden, en dat is geen Pushover-app-
// instelling maar puur een keuze van de VERSTURENDE kant (deze backend).
// Hij wilde de "breekt door niet-storen heen"-garantie niet zomaar kwijt
// (vandaar Pushover blijft gewoon bestaan/aan), maar wel een rustiger,
// gewone (niet-herhalende) melding als alternatief — vandaar deze eigen,
// losstaande PWA-melding.
//
// Vereist: (1) een eenmalig gegenereerd VAPID-sleutelpaar (zie
// .env.example voor het genereercommando), en (2) minstens één abonnement
// — de PWA meldt zichzelf aan via POST /api/push/abonneren (zie server.js)
// zodra Lex in de app op "Meldingen aanzetten" tikt en browsertoestemming
// geeft. Werkt op iPhone ALLEEN als de PWA via Safari's "Zet op
// beginscherm" geïnstalleerd is (iOS 16.4+) — in een gewone Safari-tab
// (niet als PWA) ondersteunt iOS geen Web Push, ongeacht toestemming; de
// frontend (app.js) legt dat uit i.p.v. gewoon stil te falen.
//
// Zelfde aan/uit- en dedup-patroon als pushover.js: standaard AAN zodra er
// VAPID-sleutels + minstens één abonnement zijn, expliciet uit te zetten
// via WEBPUSH_INGESCHAKELD=0, en een in-memory Set voorkomt dat hetzelfde
// alarm elke pollcyclus opnieuw verstuurd wordt.
import webpush from 'web-push';
import { readFileSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
// 2026-08-22, op verzoek van Lex ("kunnen we nog wat aan de melding zelf
// sleutelen") — hergebruikt dezelfde kaartafbeelding-logica als het
// mailalarm, i.p.v. het polygon-tekenen te dupliceren.
import { kaartUrlVoor } from './email.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// sources/webpush.js -> twee niveaus omhoog naar backend/, dan data/ (zelfde
// map als historie.js/mediaHistorie.js gebruiken).
const ABONNEMENTEN_BESTAND = join(__dirname, '..', '..', 'data', 'pushAbonnementen.json');

let abonnementen = [];

try {
  mkdirSync(dirname(ABONNEMENTEN_BESTAND), { recursive: true });
  if (existsSync(ABONNEMENTEN_BESTAND)) {
    abonnementen = JSON.parse(readFileSync(ABONNEMENTEN_BESTAND, 'utf-8'));
    console.log(`[weer] webpush: ${abonnementen.length} abonnement(en) geladen van schijf.`);
  }
} catch (err) {
  console.error('[weer] webpush: abonnementen inladen mislukt, start leeg —', err.message ?? err);
  abonnementen = [];
}

// Sync + zeldzaam (alleen bij aan-/afmelden, niet per pollcyclus zoals
// historie.js/mediaHistorie.js) — geen race-conditie-risico zoals daar,
// dus geen wachtrij-constructie nodig.
function schrijfAbonnementenNaarSchijf() {
  try {
    writeFileSync(ABONNEMENTEN_BESTAND, JSON.stringify(abonnementen));
  } catch (err) {
    console.error('[weer] webpush: abonnementen wegschrijven mislukt, blijft wel in het geheugen werken —', err.message ?? err);
  }
}

function vapidGeconfigureerd() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

// 2026-08-22-debug: dit was eerst losse code hierboven, die maar één keer
// draaide — op het moment dat deze module voor het eerst geïmporteerd wordt.
// Door hoe ES-module-imports werken (import-graf wordt volledig geëvalueerd
// vóórdat het IMPORTERENDE bestand, index.js, zijn eigen top-level code
// draait) gebeurde dat VÓÓR loadEnvFile() in index.js de .env kon inlezen —
// dus stonden VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY op dat moment nog niet in
// process.env, en werd setVapidDetails() domweg nooit aangeroepen. Gevolg:
// elke poging tot versturen faalde met een 403 "BadAuthorizationHeader",
// ongeacht wat er in .env stond — de sleutels leken correct maar werden
// nooit echt gebruikt. Pushover/mail hebben dit probleem niet, want die
// lezen hun sleutels bij elke verstuurpoging opnieuw uit process.env i.p.v.
// één keer bij het opstarten. Zelfde live-lees-patroon hier: vóór elke
// verstuurpoging opnieuw configureren (goedkoop/idempotent, geen reden om
// dit te cachen) i.p.v. eenmalig bij het laden van de module.
function configureerVapidIndienNodig() {
  if (!vapidGeconfigureerd()) return;
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_CONTACT_EMAIL || 'geen-contact@voorbeeld.invalid'}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

// 2026-08-22: zelfde aan/uit-schakelaar-idioom als PUSHOVER_INGESCHAKELD in
// pushover.js — standaard AAN (zodra sleutels+abonnement er zijn), tenzij
// hier expliciet op '0' gezet.
function ingeschakeld() {
  return process.env.WEBPUSH_INGESCHAKELD !== '0';
}

function beschikbaar() {
  return ingeschakeld() && vapidGeconfigureerd() && abonnementen.length > 0;
}

export function vapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY ?? '';
}

// Aangeroepen door POST /api/push/abonneren (zie server.js) met de
// PushSubscription die de browser teruggeeft na pushManager.subscribe().
export function voegAbonnementToe(subscription) {
  if (!subscription?.endpoint) return false;
  // Vervang een eventueel al bestaand abonnement met hetzelfde endpoint
  // (de browser kan af en toe een vernieuwd abonnement voor hetzelfde
  // toestel sturen) i.p.v. dubbel op te slaan.
  abonnementen = abonnementen.filter((a) => a.endpoint !== subscription.endpoint);
  abonnementen.push(subscription);
  schrijfAbonnementenNaarSchijf();
  console.log(`[weer] webpush: nieuw abonnement opgeslagen (totaal nu ${abonnementen.length}).`);
  return true;
}

function verwijderAbonnement(endpoint) {
  const voor = abonnementen.length;
  abonnementen = abonnementen.filter((a) => a.endpoint !== endpoint);
  if (abonnementen.length !== voor) schrijfAbonnementenNaarSchijf();
}

// Aangeroepen door POST /api/push/afmelden (zie server.js) — de "uit"-kant
// van de aan/uit-knop in Instellingen, op verzoek van Lex 2026-08-22 ("per
// device kunnen uitzetten"). Zelfde opruimfunctie als hierboven al gebruikt
// voor verlopen (404/410) abonnementen, nu ook bereikbaar voor een bewuste,
// door de gebruiker zelf geïnitieerde afmelding.
export function verwijderAbonnementViaEndpoint(endpoint) {
  verwijderAbonnement(endpoint);
}

// Zelfde in-memory dedup-aanpak als pushover.js (gemeld-Set): voorkomt dat
// hetzelfde nog actieve alarm bij elke pollcyclus opnieuw een melding stuurt.
const gemeld = new Set();
let waarschuwingGelogd = false;

export async function stuurWebPushAlarm({ id, titel, bericht, url, lat, lon, gebiedPolygon }) {
  if (!id) return;
  if (gemeld.has(id)) {
    console.log(`[weer] webpush: "${id}" al eerder gemeld sinds laatste herstart, overgeslagen (titel: ${titel}).`);
    return;
  }
  if (!beschikbaar()) {
    if (!waarschuwingGelogd) {
      waarschuwingGelogd = true;
      console.log(
        !ingeschakeld()
          ? '[weer] webpush: WEBPUSH_INGESCHAKELD=0 in .env — deze meldingen staan bewust uit.'
          : !vapidGeconfigureerd()
          ? '[weer] webpush: VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY niet ingesteld in .env — zie .env.example.'
          : '[weer] webpush: nog geen abonnementen — open de app en zet in Instellingen "Meldingen aanzetten" aan.'
      );
    }
    return;
  }
  gemeld.add(id);
  configureerVapidIndienNodig();

  // 2026-08-22, op verzoek van Lex ("kunnen we nog wat aan de melding zelf
  // sleutelen") — `id` en `afbeelding` gaan nu ook mee in de payload, zodat
  // sw.js (de service worker, die deze JSON ontvangt in de push-listener)
  // de melding kan groeperen/bijwerken (tag) en een kaartje kan tonen.
  // GEOAPIFY_API_KEY ontbreekt vaak niet expres uitgezet, dus kaartUrlVoor()
  // geeft dan gewoon null terug — net zoals bij het mailalarm blijft de rest
  // van de melding dan gewoon werken, alleen zonder kaartje.
  const afbeelding = kaartUrlVoor({ lat, lon, gebiedPolygon });
  // 2026-08-22-debug: even expliciet loggen of er wel/geen kaartje meegaat —
  // zo kunnen we onderscheiden "server bouwt geen URL" (GEOAPIFY_API_KEY/
  // coördinaten-probleem, hier te zien) van "server stuurt 'm wel maar iOS
  // toont 'm niet" (een mogelijke platformbeperking, hier NIET te zien).
  console.log(`[weer] webpush: kaartje bij deze melding: ${afbeelding ? 'ja' : 'nee'}`);
  const payload = JSON.stringify({ id, titel, bericht, url: url ?? '/', afbeelding });
  // Kopie van de huidige lijst vóór het versturen: sendNotification is async
  // en kan tussentijds (bij een 404/410 hieronder) abonnementen verwijderen —
  // de index-koppeling met `resultaten` moet dan wel bij de ORIGINELE lijst
  // blijven horen, niet bij de intussen ingekorte `abonnementen`.
  const doelen = [...abonnementen];

  const resultaten = await Promise.allSettled(doelen.map((sub) => webpush.sendNotification(sub, payload)));

  let gelukt = 0;
  resultaten.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      gelukt += 1;
      return;
    }
    const status = r.reason?.statusCode;
    // 404/410 = dit abonnement bestaat aan browserkant niet meer (uitgezet,
    // app verwijderd, endpoint verlopen) — dan zonder discussie opruimen,
    // anders komt dezelfde foutmelding elke keer terug.
    if (status === 404 || status === 410) {
      verwijderAbonnement(doelen[i].endpoint);
      console.log('[weer] webpush: verlopen abonnement opgeruimd.');
    } else {
      // 2026-08-22-debug: de generieke library-tekst ("Received unexpected
      // response code") verklapt zelf niets — de statuscode + het eventuele
      // antwoordbody van de pushdienst (bijv. Apple's web.push.apple.com)
      // wél, vandaar die er expliciet bij.
      console.error(
        `[weer] webpush: melding versturen mislukt (status ${status ?? 'onbekend'}) —`,
        r.reason?.body || r.reason?.message || r.reason,
      );
    }
  });

  if (gelukt > 0) {
    console.log(`[weer] webpush: alarm verstuurd naar ${gelukt}/${doelen.length} abonnement(en) — ${titel}`);
  } else {
    gemeld.delete(id); // niks gelukt: volgende pollcyclus opnieuw proberen, zelfde aanpak als pushover.js
  }
}
