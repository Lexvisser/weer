// Bluesky — publieke, sleutelloze zoek-API (AT Protocol), voor spontane
// community-posts met foto/video bij een hazard-signaal. Op verzoek van Lex
// ("vrije hand" op fotobronnen, 2026-08-19) toegevoegd naast Reddit en
// Wikimedia Commons: qua karakter het dichtst bij wat Reddit ooit was (live,
// ongemodereerde posts van gewone mensen), en groeiend nu X/Twitter en Reddit
// allebei steeds moeilijker sleutelloos te doorzoeken zijn.
//
// app.bsky.feed.searchPosts is Bluesky's publieke zoek-endpoint — werkt
// zonder account/token voor openbare content (bevestigd via Bluesky's eigen
// API-documentatie, niet live getest vanuit deze sandbox, dus check bij
// opstarten de console-log "voorbeeldpost").
//
// Zelfde "ongemodereerde community-content"-voorbehoud als bij Reddit: geen
// inhoudelijke moderatie hier, de frontend toont daarom altijd het
// "community, ongecontroleerd"-label (zie popupFotostripHtml in app.js).
const API_URL = 'https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts';

let voorbeeldenGelogd = 0;

// Bluesky's embed-vorm verschilt per type: 'app.bsky.embed.images#view' heeft
// een 'images'-array (elk met thumb/fullsize), 'app.bsky.embed.video#view'
// heeft een los 'thumbnail'/'playlist'-veld. We nemen alleen posts met zo'n
// embed mee — tekst-only posts zijn niet relevant voor een fotostrip.
function mediaUitPost(post) {
  const embed = post.embed;
  if (!embed) return [];
  if (embed.$type === 'app.bsky.embed.images#view' && Array.isArray(embed.images)) {
    return embed.images.map((img) => ({
      type: 'foto',
      url: img.fullsize,
      thumbUrl: img.thumb ?? img.fullsize,
      titel: img.alt || post.record?.text || 'Bluesky-post',
      link: `https://bsky.app/profile/${post.author?.handle}/post/${post.uri?.split('/').pop()}`,
      bron: 'Bluesky',
    }));
  }
  if (embed.$type === 'app.bsky.embed.video#view') {
    return [
      {
        type: 'video',
        url: embed.playlist ?? embed.thumbnail,
        thumbUrl: embed.thumbnail,
        titel: post.record?.text || 'Bluesky-video',
        link: `https://bsky.app/profile/${post.author?.handle}/post/${post.uri?.split('/').pop()}`,
        bron: 'Bluesky',
      },
    ];
  }
  return [];
}

export async function fetchBlueskyMedia(zoekterm, limiet = 3) {
  if (!zoekterm) return [];
  try {
    const params = new URLSearchParams({ q: zoekterm, limit: '15', sort: 'latest' });
    const res = await fetch(`${API_URL}?${params}`, {
      headers: { 'User-Agent': 'weer-app-persoonlijk/1.0 (contact: lokaal project)' },
    });
    if (!res.ok) throw new Error(`Bluesky search gaf status ${res.status}`);
    const body = await res.json();
    const posts = body.posts ?? [];

    if (voorbeeldenGelogd < 3 && posts.length) {
      voorbeeldenGelogd++;
      console.log(`[weer] bluesky: voorbeeldpost ${voorbeeldenGelogd}: ${JSON.stringify(posts[0]).slice(0, 300)}`);
    }

    return posts.flatMap(mediaUitPost).slice(0, limiet);
  } catch (err) {
    console.error(`[weer] bluesky media ophalen mislukt voor "${zoekterm}":`, err.message ?? err);
    return [];
  }
}
