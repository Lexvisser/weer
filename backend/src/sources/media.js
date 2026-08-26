// media.js — orchestrator rond de community-mediabronnen, voor gebruik door
// alle categorie-bronbestanden (niet meer alleen nhc.js/orkaan). Op verzoek
// van Lex: "De bronnen voor foto's IK geef je de vrije hand en ik zou voor
// elke categorie akkoord zijn met beeldmateriaal, video mag ook" (2026-08-19).
//
// 2026-08-22: was hier een Promise.allSettled over vier bronnen (SearXNG,
// Wikimedia Commons, Reddit, Bluesky) met round-robin-interleaving om te
// voorkomen dat één bron de hele quota opeiste. Na een live testronde met Lex
// (de Putnam County, IL-testfixture in nws.js) bleek dat drie van de vier
// niet meer bijdroegen: Wikimedia gaf ook ná een kernwoord-relevantiefilter
// (zie wikimedia.js) nog steeds irrelevante fuzzy-matches, en Reddit/Bluesky
// gaven bij zo goed als elke zoekopdracht een 403/429 (blokkade, geen
// tijdelijke piek — zie sources/reddit.js/bluesky.js). SearXNG (ná de
// time_range- en zoekterm-verbeteringen, zie searxng.js/nws.js) leverde als
// enige bruikbare, relevante hits. Imports/aanroepen van de drie hieronder
// bewust in commentaar laten staan i.p.v. verwijderen — simpel terug te
// zetten (ontcommentariëren + weer meenemen in fetchCommunityMedia) als een
// van de drie ooit weer relevant blijkt, bv. als Reddit/Bluesky hun
// API-toegang voor onbevoegde requests wijzigen.
//
// Bewust NIET gebruikt voor 'hulpdiensten' (P2000/Lifeliner) — dat zijn
// live, herleidbare noodsituaties van echte mensen; community-foto's
// daarbij zoeken voelt als een privacyrisico dat niet bij "beeldmateriaal
// bij een natuurramp" past. Zie de aanroepende bronbestanden voor welke
// categorieën dit wel/niet gebruiken.
// import { fetchWikimediaMedia } from './wikimedia.js';
// import { fetchRedditMedia } from './reddit.js';
// import { fetchBlueskyMedia } from './bluesky.js';
import { fetchSearxngMedia } from './searxng.js';

// 2026-08-20, op verzoek van Lex ("wil je de community foto's afzetten
// voorlopig... te veel misses"): voorlopig helemaal uit, in afwachting van
// een betere aanpak (Lex noemde AI-filtering, of explicietere per-categorie
// zoektermen met datum — nog geen van beide uitgewerkt/besloten). Bewust
// hier centraal, niet per aanroepend bronbestand: één schakelaar voor alle
// categorieën tegelijk. Anders dan PUSHOVER_INGESCHAKELD/EMAIL_INGESCHAKELD
// (die zijn standaard AAN, tenzij expliciet op '0') staat deze standaard UIT
// — geen sleutels nodig om 'm te laten werken, dus zonder een default-uit
// zou 'm meteen weer aanstaan na de volgende deploy, precies waar Lex net
// vanaf wilde. Weer aanzetten: COMMUNITY_MEDIA_INGESCHAKELD=1 in .env.
let communityMediaWaarschuwingGelogd = false;

function communityMediaIngeschakeld() {
  return process.env.COMMUNITY_MEDIA_INGESCHAKELD === '1';
}

export async function fetchCommunityMedia(zoekterm, { limiet = 6 } = {}) {
  if (!zoekterm) return [];
  if (!communityMediaIngeschakeld()) {
    if (!communityMediaWaarschuwingGelogd) {
      communityMediaWaarschuwingGelogd = true;
      console.log(
        '[weer] community-media: uitgeschakeld (te veel misses, zie media.js) — zet COMMUNITY_MEDIA_INGESCHAKELD=1 in .env om weer aan te zetten.'
      );
    }
    return [];
  }

  // 2026-08-22: nog maar één bron (zie de toelichting hierboven) — de
  // round-robin-interleaving die hier stond (nodig zolang er meerdere
  // bronnen waren, om te voorkomen dat er één de hele quota opeiste) is met
  // één bron overbodig geworden. fetchSearxngMedia vangt zijn eigen fouten
  // al af (geeft [] terug), dus geen Promise.allSettled meer nodig.
  return fetchSearxngMedia(zoekterm, limiet);
}
