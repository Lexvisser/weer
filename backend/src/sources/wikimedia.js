// Wikimedia Commons — gratis, sleutelloze zoek-API, voor beeldmateriaal bij
// een hazard-signaal. Op verzoek van Lex ("vrije hand" op fotobronnen,
// 2026-08-19) toegevoegd naast Reddit, als aanvulling/vervanging nu Reddit's
// publieke .json-endpoints steeds vaker een 403 geven voor serverside
// requests (zie reddit.js).
//
// Karakter van deze bron is anders dan Reddit: Commons is een gecureerd,
// encyclopedisch archief (vaak persfoto's, satellietbeelden, kaarten die
// mensen achteraf hebben geüpload) — minder "live, spontane" community-foto's
// dan Reddit, maar wél stabieler en minder kans op rommel/irrelevantie. Werkt
// het beste bij een genoemde/bekende ramp (een orkaan met naam, een
// vulkaanuitbarsting) — bij een generieke zoekterm (alleen een plaatsnaam)
// kan de trefkans lager liggen.
//
// EERLIJKE WAARSCHUWING: niet live getest (geen internettoegang in de
// sandbox waar dit gebouwd is) — de MediaWiki Action API-vorm hieronder is
// wel de gedocumenteerde, stabiele manier (generator=search + prop=imageinfo
// in één call, geen aparte thumbnail-opvraging nodig), maar check bij
// opstarten de console-log "voorbeeldresultaat" om te bevestigen dat de
// veldnamen kloppen.
const API_URL = 'https://commons.wikimedia.org/w/api.php';

let voorbeeldenGelogd = 0;

// 2026-08-19: op verzoek van Lex ("meekijken welke foto's er bij Lala
// gezocht zijn") — een generieke zoekterm (een plaatsnaam, of hier een
// stormnaam die toevallig ook een plaatsnaam is) matcht op Commons vaak de
// standaard-encyclopedische plaatjes die zowat elk Wikipedia-artikel over
// een plaats/gemeente heeft: een locatorkaart, het gemeentewapen, de vlag,
// een logo — nooit foto's van de ramp zelf. Filenames voor dat soort platen
// volgen een herkenbaar patroon, dus die worden er hier standaard uitgezeefd
// (geldt voor ALLE aanroepers van deze bron, niet alleen orkanen).
const RUIS_PATROON = /locator|location map|coat of arms|blank map|flag of|seal of|emblem of|logo/i;

// 2026-08-22, op verzoek van Lex na een live test (de Putnam County, IL-
// testfixture in nws.js): naast het patroon hierboven bleek er nóg een soort
// ruis te bestaan — bij een net-gebeurde, nog weinig gedocumenteerde ramp
// geeft Commons' generator=search de "best beschikbare" hit terug ook als die
// alleen toevallig een los woord deelt met de zoekterm (bv. een landbouw-
// vereniging-archiefstuk dat toevallig "Illinois" noemt). Generieke woorden
// als "tornado"/"warning"/"county" zijn te breed om op te filteren (matchen
// bijna alles) — in plaats daarvan pakken we het langste, minst generieke
// woord uit de zoekterm (meestal de plaatsnaam zelf) en eisen we dat dát
// woord ook echt in de titel voorkomt. Geen match betekent dan gewoon
// eerlijk "niks gevonden" i.p.v. een willekeurige, irrelevante hit.
const GENERIEKE_ZOEKWOORDEN = new Set([
  'tornado', 'warning', 'watch', 'tsunami', 'hurricane', 'tropical', 'storm', 'depression',
  'earthquake', 'emergency', 'the', 'of', 'and', 'in', 'near', 'region',
]);

function kernwoordVan(zoekterm) {
  const woorden = (zoekterm ?? '')
    .split(/[\s,]+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((w) => w.length > 2 && !GENERIEKE_ZOEKWOORDEN.has(w.toLowerCase()));
  // Langste overgebleven woord = meestal de meest onderscheidende term (een
  // plaatsnaam of stormnaam) — simpeler en robuuster dan proberen daadwerkelijk
  // te parsen welk deel van de zoekterm "de locatie" is.
  return woorden.sort((a, b) => b.length - a.length)[0] ?? null;
}

export async function fetchWikimediaMedia(zoekterm, limiet = 3) {
  if (!zoekterm) return [];
  try {
    const params = new URLSearchParams({
      action: 'query',
      generator: 'search',
      gsrsearch: zoekterm,
      gsrnamespace: '6', // namespace 6 = File:
      gsrlimit: String(limiet),
      prop: 'imageinfo',
      iiprop: 'url|mime',
      iiurlwidth: '400',
      format: 'json',
    });
    const res = await fetch(`${API_URL}?${params}`, {
      headers: { 'User-Agent': 'weer-app-persoonlijk/1.0 (contact: lokaal project)' },
    });
    if (!res.ok) throw new Error(`Wikimedia Commons gaf status ${res.status}`);
    const body = await res.json();
    const paginas = Object.values(body.query?.pages ?? {});

    if (voorbeeldenGelogd < 3 && paginas.length) {
      voorbeeldenGelogd++;
      console.log(`[weer] wikimedia: voorbeeldresultaat ${voorbeeldenGelogd}: ${JSON.stringify(paginas[0]).slice(0, 300)}`);
    }

    const kernwoord = kernwoordVan(zoekterm);
    return paginas
      .filter(
        (p) =>
          p.imageinfo?.[0] &&
          !RUIS_PATROON.test(p.title ?? '') &&
          (!kernwoord || (p.title ?? '').toLowerCase().includes(kernwoord.toLowerCase()))
      )
      .map((p) => {
        const info = p.imageinfo[0];
        return {
          type: info.mime?.startsWith('video/') ? 'video' : 'foto',
          url: info.url,
          thumbUrl: info.thumburl ?? info.url,
          titel: p.title?.replace(/^File:/, '') ?? 'Wikimedia Commons',
          link: info.descriptionurl ?? info.url,
          bron: 'Wikimedia Commons',
        };
      })
      .slice(0, limiet);
  } catch (err) {
    console.error(`[weer] wikimedia media ophalen mislukt voor "${zoekterm}":`, err.message ?? err);
    return [];
  }
}
