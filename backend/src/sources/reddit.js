// Reddit — publieke, sleutelloze search-API (search.json), voor community-
// foto's/video's bij een actief hazard-signaal. Op verzoek van Lex: "foto's
// van de community mogen erbij". Reddit is het enige grote platform met een
// authenticatie-vrije publieke listing-endpoint; X/Twitter en Instagram
// vereisen tegenwoordig een (vaak betaald) developer-account, dus die vielen
// af.
//
// 2026-08-19: subreddit-lijst was hardcoded op orkaan-gerichte subs
// (TropicalWeather/weather/hurricane) omdat dit oorspronkelijk alleen voor
// orkanen gebouwd was. Nu onderdeel van media.js — die roept dit generiek
// aan voor élke categorie, dus de subreddit-keuze hieronder is verbreed.
// Bekend, structureel probleem: Reddit's publieke .json-endpoints geven
// vanaf serverside/datacenter-IP's (zoals de Minisforum) steeds vaker een
// 403 — zie media.js voor de andere bronnen die dit opvangen als Reddit
// faalt.
//
// Let op: dit is ONGEMODEREERDE community-content — af en toe irrelevante of
// rommelige resultaten. De frontend toont daarom altijd een expliciet
// "community, ongecontroleerd"-label erbij (zie popupFotostripHtml in
// app.js) i.p.v. het te laten doorgaan voor officiële beeldmateriaal. Posts
// met over_18=true worden weggefilterd, maar verder is er geen inhoudelijke
// moderatie — bewuste keuze, net als bij de andere "best effort, nooit de
// hele bron laten falen"-bronnen in dit project. Video-posts mochten eerst
// niet mee (2026-08-19: op Lex' verzoek nu wél toegestaan).
const SUBREDDITS = 'TropicalWeather+weather+hurricane+NatureIsFuckingLit+CatastrophicFailure+disasters+earthquake+Volcanoes+wildfires+flooding+tornado';

export async function fetchRedditMedia(zoekterm, limiet = 4) {
  if (!zoekterm) return [];
  try {
    const url = `https://www.reddit.com/r/${SUBREDDITS}/search.json?q=${encodeURIComponent(zoekterm)}&restrict_sr=1&sort=new&limit=15`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'weer-app-persoonlijk/1.0 (contact: lokaal project)' },
    });
    if (!res.ok) throw new Error(`Reddit search gaf status ${res.status}`);
    const body = await res.json();
    const posts = body.data?.children ?? [];
    return posts
      .map((p) => p.data)
      .filter((p) => p && !p.over_18)
      .filter((p) => p.is_video || p.post_hint === 'image' || /\.(jpg|jpeg|png|gif)$/i.test(p.url ?? ''))
      .slice(0, limiet)
      .map((p) => ({
        type: p.is_video ? 'video' : 'foto',
        // Reddit-hosted video zit achter secure_media.reddit_video.fallback_url
        // (geen audio, maar wel direct afspeelbaar); bij alles anders is p.url
        // gewoon de directe afbeeldings-URL.
        url: p.is_video ? (p.secure_media?.reddit_video?.fallback_url ?? p.url) : p.url,
        thumbUrl: p.thumbnail && p.thumbnail.startsWith('http') ? p.thumbnail : p.url,
        titel: p.title,
        link: `https://reddit.com${p.permalink}`,
        bron: 'Reddit',
      }));
  } catch (err) {
    console.error(`[weer] reddit media ophalen mislukt voor "${zoekterm}":`, err.message ?? err);
    return [];
  }
}
