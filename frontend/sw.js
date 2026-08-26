// Minimale service worker — vooral om de PWA installeerbaar te maken
// (icoon op het homescreen zetten op iPhone/iPad). Geen agressieve caching
// van /api/* data, want die moet altijd vers zijn.
//
// Strategie voor de schil (html/css/js): network-first met cache als fallback.
// Tijdens actieve ontwikkeling wil je namelijk altijd de nieuwste versie zien
// zodra je online bent — de cache is puur een vangnet voor als de
// aggregator-service even niet bereikbaar is. Verhoog CACHE_NAAM telkens als
// je wilt garanderen dat oude installaties de nieuwe versie ophalen.

const CACHE_NAAM = 'weer-shell-v20';
const SHELL_BESTANDEN = ['/', '/index.html', '/styles.css', '/app.js', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAAM).then((cache) => cache.addAll(SHELL_BESTANDEN)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((namen) => Promise.all(namen.filter((n) => n !== CACHE_NAAM).map((n) => caches.delete(n)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) return; // nooit cachen, altijd live data

  // 2026-08-26-fix, op verzoek van Lex (verlopen-weeralarm-icoontjes
  // vervaagden niet, ook niet na een harde herlaad) -- fetch(event.request)
  // zonder cache-optie volgt gewoon de normale HTTP-cacheregels van de
  // browser. Een harde herlaad (Ctrl+Shift+R) omzeilt dat alleen voor de
  // request die de pagina zelf doet, niet voor een fetch() die van
  // BINNENUIT een service worker wordt gedaan -- en omdat serveStatic() in
  // server.js geen Cache-Control/ETag/Last-Modified meestuurt, kon Chrome
  // hier toch een oude styles.css/app.js uit eigen cache aan de pagina
  // blijven geven, zelfs na syncen naar de server. cache: 'no-store' dwingt
  // hier altijd een echte netwerk-fetch af, precies zoals de strategie
  // hierboven al bedoeld was ("altijd de nieuwste versie zien").
  event.respondWith(
    fetch(event.request, { cache: 'no-store' })
      .then((netwerkResponse) => {
        const kopie = netwerkResponse.clone();
        caches.open(CACHE_NAAM).then((cache) => cache.put(event.request, kopie));
        return netwerkResponse;
      })
      .catch(() => caches.match(event.request)), // alleen terugvallen op cache als het netwerk faalt
  );
});

// 2026-08-22: Web Push (zie backend/src/sources/webpush.js) — derde,
// rustige (niet-herhalende) alarmkanaal naast Pushover/e-mail, op verzoek
// van Lex. De backend stuurt hier een JSON-payload
// {id, titel, bericht, url, afbeelding} naartoe; deze listener toont 'm als
// systeemmelding.
//
// 2026-08-22, tweede ronde, op verzoek van Lex ("kunnen we nog wat aan de
// melding zelf sleutelen, implementeer alles maar") — vier toevoegingen:
// - tag/renotify: eenzelfde alarm (zelfde `id`) vervangt de vorige melding
//   i.p.v. dat ze zich opstapelen op je lockscreen.
// - image: het kaartje met de gebied-omtrek (zelfde bron als de e-mail, zie
//   kaartUrlVoor() in email.js) — alleen aanwezig als GEOAPIFY_API_KEY is
//   ingesteld, anders blijft dit veld gewoon leeg.
// - requireInteraction: blijft zichtbaar tot je 'm wegveegt/aantikt i.p.v.
//   na een paar seconden vanzelf te verdwijnen. Dit is GEEN Pushover-achtig
//   herhalend "moet bevestigd worden" — hij stuurt maar één keer, blijft
//   alleen langer zichtbaar staan. Ondersteuning op iOS is wisselend, geen
//   garantie; op Android/desktop werkt dit wel.
// - actions: een sneltoets-knop op de melding zelf. iOS Safari's
//   ondersteuning hiervoor is beperkt/onbetrouwbaar — een gewone tik op de
//   melding (buiten de knop) doet altijd hetzelfde (zie notificationclick
//   hieronder), dus dit kan nooit de enige manier zijn om 'm te openen.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (err) {
    data = { titel: 'Weer-alarm', bericht: event.data ? event.data.text() : '' };
  }
  const titel = data.titel || 'Weer-alarm';
  const opties = {
    body: data.bericht || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url || '/' },
    requireInteraction: true,
    vibrate: [200, 100, 200], // alleen relevant op Android, iOS negeert dit toch
  };
  if (data.id) {
    opties.tag = data.id;
    opties.renotify = true;
  }
  if (data.afbeelding) opties.image = data.afbeelding;
  if (data.url) opties.actions = [{ action: 'bekijk', title: 'Bekijk op kaart' }];
  event.waitUntil(self.registration.showNotification(titel, opties));
});

// Tikken op de melding (of op de "Bekijk op kaart"-sneltoets erin, mocht die
// op dit toestel ondersteund worden — beide leiden naar dezelfde url):
// bestaand app-venster naar voren halen als dat er is, anders een nieuw
// venster openen — i.p.v. gewoon niets doen (standaardgedrag).
//
// 2026-08-22-fix, op verzoek van Lex ("klikken op de melding opent wel de
// app, maar niet de melding zelf, ik zie het startscherm") — hier stond
// voorheen alléén venster.focus(), zonder ooit naar de specifieke melding te
// navigeren als er al een venster open was (wat bij een geïnstalleerde PWA
// op je beginscherm bijna altijd het geval is: die blijft vaak op de
// achtergrond draaien i.p.v. helemaal afgesloten te worden).
//
// 2026-08-22-fix, tweede poging — WindowClient.navigate() bleek op iOS
// Safari niet betrouwbaar te werken (of niet ondersteund, dat is voor een
// service worker op de telefoon zelf niet na te gaan zonder 'm via een Mac
// aan te sluiten). Een postMessage naar het al-open venster is een veel
// standaarder/breder-ondersteunde API en vereist geen paginaherlaad: app.js
// vangt 'm op (zie de 'message'-listener daar) en centreert de kaart
// meteen, zonder de rest van de app-status kwijt te raken. Alleen als er nog
// HELEMAAL geen venster open is, valt dit terug op clients.openWindow() met
// de /?signaal=<id>-url (die pakt app.js bij het laden vanzelf op).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const doelUrl = event.notification.data?.url || '/';
  const signaalId = event.notification.tag || null;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((vensters) => {
      for (const venster of vensters) {
        if (signaalId && 'postMessage' in venster) {
          venster.postMessage({ type: 'open-signaal', id: signaalId });
        }
        if ('focus' in venster) return venster.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(doelUrl);
    }),
  );
});
