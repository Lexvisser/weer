// scheepsfoto.js — scheepsfoto opzoeken bij een MMSI, voor de vaartlaag.
// 2026-09-01, op verzoek van Lex ("ik zag wel eens dat de schepen met AIS
// ook een fotootje hadden in zo'n app, hoe werkt dat?" -> "ja leuk!") na
// uitleg dat zulke foto's NIET uit het AIS-signaal zelf komen (dat bevat
// geen beeld) maar uit een losse, crowd-sourced fotodatabase die apps als
// MarineTraffic/VesselFinder zelf raadplegen op MMSI/IMO.
//
// EXPLICIETE KEUZE MET LEX: de "ongeautoriseerde publieke foto-URL"-route
// i.p.v. een officiele (betaalde) API -- gratis, maar NIET ondersteund: kan
// zonder waarschuwing stoppen, en is tegen de voorwaarden van de site. Prima
// voor een hobbyproject (zelfde afweging als eerder bij dit project), niet
// iets om op te bouwen alsof het een gegarandeerde dienst is. Faalt dit ooit
// structureel, dan toont de kaart gewoon geen foto (zie fallback hieronder)
// -- geen harde afhankelijkheid.
//
// MECHANISME (uitgezocht via de browser, 2026-09-01):
// VesselFinder's scheepspagina is direct opvraagbaar op MMSI:
//   https://www.vesselfinder.com/vessels/details/<mmsi>
// Die pagina bevat (in de server-gerenderde HTML, dus GEEN headless browser
// nodig) een <img> met een directe, stabiele fotolink:
//   https://static.vesselfinder.net/ship-photo/<imo>-<mmsi>-<hash>/1?v1
// Die laatste URL is zelf gewoon hotlinkbaar (geen referer-check, live
// getest) -- dus we hoeven 'm alleen te scrapen uit de scheepspagina, niet
// zelf te downloaden/door te sturen. Schepen zonder foto in die database
// hebben simpelweg geen match voor dit patroon -> null, geen fout.
//
// BEWUST ON-DEMAND, NIET MEEGEPOLLED MET vaarradarLokaal.js: die ververst
// elke 3s en kan tientallen schepen tegelijk tonen (zie VENSTER_MS daar) --
// een foto-lookup per schip per pollronde zou VesselFinder binnen no time
// platbombarderen en gegarandeerd een blokkade opleveren. In plaats daarvan
// een eigen /api/scheepsfoto-route (zie server.js) die de FRONTEND pas
// aanroept zodra Lex een scheepspopup daadwerkelijk OPENT -- dus hooguit een
// opzoeking per klik, niet een per schip per 3 seconden.
//
// Cache: simpele in-memory Map, geen bestand (zelfde soort keuze als de
// posities in vaarradarLokaal.js) -- foto's veranderen zelden, en een lege
// cache na een herstart is geen probleem (gewoon opnieuw opzoeken bij de
// eerstvolgende klik). Negatieve resultaten (geen foto gevonden) worden
// KORTER gecached dan gevonden foto's, voor het geval een schip later alsnog
// een foto krijgt in de bron-database.

const FOTO_CACHE_MS = 7 * 24 * 60 * 60 * 1000; // gevonden foto: 7 dagen
const GEEN_FOTO_CACHE_MS = 6 * 60 * 60 * 1000; // geen foto gevonden: 6 uur, dan nog eens proberen
const FETCH_TIMEOUT_MS = 6000;

const cache = new Map(); // mmsi -> { url: string|null, tijdMs: number }
const inVlucht = new Map(); // mmsi -> Promise<string|null>, dedupliceert gelijktijdige klikken op hetzelfde schip

function nogGeldig(entry) {
  if (!entry) return false;
  const maxLeeftijdMs = entry.url ? FOTO_CACHE_MS : GEEN_FOTO_CACHE_MS;
  return Date.now() - entry.tijdMs < maxLeeftijdMs;
}

async function zoekFotoOp(mmsi) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`https://www.vesselfinder.com/vessels/details/${mmsi}`, {
      headers: {
        // Zonder een browser-achtige User-Agent gaf een losse test soms een
        // afwijkende (lichtere/blokkerende) pagina terug -- dit is puur om
        // een gewone paginabezoeker na te bootsen, geen poging om iets te
        // omzeilen wat de site niet al publiek toont aan elke bezoeker.
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(/https:\/\/static\.vesselfinder\.net\/ship-photo\/[^"'\s\\]+/);
    return match ? match[0] : null;
  } catch {
    return null; // netwerkfout, timeout, site onbereikbaar -- gewoon "geen foto", geen crash
  } finally {
    clearTimeout(timeout);
  }
}

// Geeft de fotoURL terug (of null als er geen bekend is), met cache/dedupe.
export async function haalScheepsfotoOp(mmsiRuw) {
  const mmsi = String(mmsiRuw ?? '').trim();
  if (!/^\d{5,9}$/.test(mmsi)) return null; // geen geldig MMSI-patroon, niet eens proberen

  const bestaand = cache.get(mmsi);
  if (nogGeldig(bestaand)) return bestaand.url;

  if (inVlucht.has(mmsi)) return inVlucht.get(mmsi);

  const belofte = zoekFotoOp(mmsi).then((url) => {
    cache.set(mmsi, { url, tijdMs: Date.now() });
    inVlucht.delete(mmsi);
    return url;
  });
  inVlucht.set(mmsi, belofte);
  return belofte;
}
