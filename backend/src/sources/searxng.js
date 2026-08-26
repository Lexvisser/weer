// SearXNG — zelfgehoste metazoekmachine (bevraagt zelf Bing/DuckDuckGo/etc.
// en legt er één JSON-API overheen), voor community-media (zie media.js).
// Op verzoek van Lex, 2026-08-22, na de tornado in Putnam County, IL: de
// bestaande bronnen (Reddit/Wikimedia/Bluesky) misten precies het soort
// content (lokaal nieuws, storm-chaser-video's) dat een gewone brede
// zoekopdracht wél meteen vond. Eerst Tavily geprobeerd, maar die bleek bij
// het daadwerkelijke aanmeldscherm toch een creditcard te vragen ondanks
// "geen creditcard nodig" in hun eigen documentatie/marketing — teruggedraaid.
// SearXNG past beter bij hoe deze hele app al gebouwd is (eigen backend-
// proxy's i.p.v. externe sleutels, zie /api/tegel en /api/regenradar): geen
// account, geen sleutel, geen creditcard, draait gewoon lokaal op de
// Minisforum (Docker, zie ~/searxng op die machine).
//
// Responsformaat hieronder is NIET gegokt — live geverifieerd door Lex zelf
// op 2026-08-22 met een echte curl tegen zijn eigen instance (net als het
// vaste live-meekijk-patroon bij de satelliet-/EUMETSAT-lagen destijds, zie
// architectuurdocument): elk item in `results` heeft (in elk geval)
// url/title/content/thumbnail/img_src/source/engine — thumbnail zat bij news-
// resultaten gevuld, img_src stond leeg (die vult zich waarschijnlijk wel bij
// category=images, vandaar dat we hieronder beide categorieën opvragen).
//
// Optioneel, net als de andere community-media-bronnen: als de SearXNG-
// instance niet bereikbaar is (nog niet opgezet, container gestopt/aan het
// herstarten), blijft deze bron gewoon stil leeg — de rest van de app werkt
// door. SEARXNG_URL default op http://localhost:8090 omdat de backend en de
// SearXNG-container op dezelfde Minisforum draaien.
const SEARXNG_URL = process.env.SEARXNG_URL || 'http://localhost:8090';

// Zelfde patroonherkenning als eerder bij de (teruggedraaide) Tavily-bron:
// een link naar een Facebook/YouTube/TikTok/Vimeo-pagina is geen direct
// afspeelbaar bestand zoals bij Reddit, maar de frontend (popupFotostripHtml
// in app.js) heeft toch alleen een thumbnail + link-out nodig (opent in een
// nieuw tabblad), dus een paginalink i.p.v. een directe videobron is prima.
const VIDEO_URL_PATROON = /(youtube\.com|youtu\.be|facebook\.com\/.*\/videos?|facebook\.com\/watch|tiktok\.com|vimeo\.com)/i;

// 2026-08-22, live gezien door Lex: de `images`-categorie hieronder (zie de
// query-opbouw) haalde generieke stockfoto's binnen (bv. pexels.com) die
// alleen toevallig op de losse zoekwoorden matchen ("tornado", een
// plaatsnaam) — geen enkele relatie met de echte gebeurtenis. Blokkade als
// extra vangnet, mocht een stockfotosite ooit via de news-categorie
// meekomen (bv. als een nieuwsartikel een stockfoto hergebruikt).
const STOCKFOTO_DOMEIN_PATROON =
  /(pexels\.com|unsplash\.com|shutterstock\.com|istockphoto\.com|gettyimages\.|alamy\.com|dreamstime\.com|freepik\.com|123rf\.com|pixabay\.com|adobe\.com\/stock|stock\.adobe\.com|depositphotos\.com)/i;

// 2026-08-22: live gezien in de server-log (door Lex, bij de eerste herstart
// ná het inschakelen van COMMUNITY_MEDIA_INGESCHAKELD samen met deze bron) —
// bij een herstart proberen ALLE bronnen (nws.js se 48-uurshistorie, plus
// nhc.js/usgs.js se eigen caches, allemaal net leeg) in dezelfde seconde te
// zoeken. Een zelfgehoste single-instance SearXNG op een mini-pc kan geen
// tientallen gelijktijdige multi-engine zoekopdrachten aan — het gevolg was
// dat LETTERLIJK ELKE aanvraag binnen die seconde op de 8s-timeout liep,
// inclusief een verse testopdracht die toevallig in diezelfde stormvloed
// zat. Deze simpele wachtrij laat er maar een paar tegelijk door; de rest
// wacht gewoon netjes op een vrij slot i.p.v. dat iedereen faalt. Verlaag
// MAX_GELIJKTIJDIG als timeouts na een herstart alsnog vaak voorkomen.
const MAX_GELIJKTIJDIG = 3;
let actief = 0;
const wachtrij = [];

function verkrijgSlot() {
  if (actief < MAX_GELIJKTIJDIG) {
    actief += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => wachtrij.push(resolve));
}

function geefSlotVrij() {
  const volgende = wachtrij.shift();
  if (volgende) volgende(); // slot direct doorgegeven aan de wachtende — 'actief' blijft gelijk
  else actief -= 1;
}

export async function fetchSearxngMedia(zoekterm, limiet = 4) {
  if (!zoekterm) return [];
  await verkrijgSlot();
  try {
    // time_range=week: 2026-08-22 toegevoegd na een live test met Lex (de
    // Putnam County, IL-testfixture in nws.js) — zonder deze filter kwamen er
    // ook een Putnam County-tornado uit Tennessee (2020) en een uit Ohio
    // (2025) tussen, want "Putnam County" is geen unieke naam (meerdere
    // county's in de VS heten zo). Recente content is voor een net-gebeurde
    // ramp een veel betere/simpelere relevantiefilter dan proberen de
    // zoekterm zelf nog specifieker te maken. 'week' i.p.v. 'day' omdat
    // mediaHistorie.js dit signaal tot 48 uur na ontstaan blijft herhalen —
    // 'day' zou de latere herhalingen juist buiten de eigen filter zetten.
    // categories=news (geen "images" meer): die categorie bleek vooral
    // generieke stockfoto's op te leveren (zie STOCKFOTO_DOMEIN_PATROON
    // hierboven) — de news-categorie alleen had bij Lex' allereerste curl-
    // test al gewoon thumbnails, dus images was sowieso nooit strikt nodig.
    const url = `${SEARXNG_URL}/search?q=${encodeURIComponent(zoekterm)}&format=json&categories=news&time_range=week`;
    const res = await fetch(url, {
      // Lokale, zelfgehoste dienst die nog vers is opgezet (kan herstarten/
      // wegvallen) — een korte timeout voorkomt dat een hangende instance de
      // hele fetchCommunityMedia()-aanroep (Promise.allSettled, ziet deze
      // bron dan gewoon als "geen resultaat") langer laat wachten dan nodig.
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`SearXNG search gaf status ${res.status}`);
    const body = await res.json();

    return (body.results ?? [])
      .filter((r) => r.url && !STOCKFOTO_DOMEIN_PATROON.test(r.url))
      .map((r) => ({
        type: VIDEO_URL_PATROON.test(r.url) ? 'video' : 'foto',
        url: r.url,
        thumbUrl: r.thumbnail || r.img_src || null,
        titel: r.title || zoekterm,
        link: r.url,
        // r.source (bv. "KWQC") is de daadwerkelijke publicatie/uitzender
        // zoals SearXNG 'm doorgeeft — nuttiger voor Lex dan alleen "SearXNG"
        // als generieke bronvermelding, dus meenemen waar aanwezig.
        bron: r.source ? `SearXNG (${r.source})` : 'SearXNG',
      }))
      // Zonder thumbnail heeft de frontend niets om te tonen (het
      // <img>-element verwijdert zichzelf stil bij een ontbrekende bron, zie
      // popupFotostripHtml's onerror-handler, maar dan was de moeite voor
      // niets) — dus hier al wegfilteren i.p.v. lege plekken doorgeven.
      .filter((m) => m.thumbUrl)
      .slice(0, limiet);
  } catch (err) {
    console.error(`[weer] searxng media ophalen mislukt voor "${zoekterm}":`, err.message ?? err);
    return [];
  } finally {
    geefSlotVrij();
  }
}
