// USGS Earthquake Feed — gratis, geen sleutel nodig.
// Documentatie: https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php
import { makeSignal, afstandKm } from '../normalize.js';
import { verversMedia } from '../mediaHistorie.js';

// 2026-08-19: op verzoek van Lex ("hoe lang blijft zo'n quake staan... 2
// dagen?") — tot nu toe bepaalde USGS' eigen "_day"-feed impliciet de
// zichtbaarheidsduur (een rollend venster van ~24u, buiten onze controle).
// Overgestapt naar de "_week"-feed (ruimer venster) met een eigen, expliciete
// leeftijdsfilter hieronder — zo bepalen we zelf hoe lang een beving
// zichtbaar blijft (2 dagen), los van welke feed-granulariteit USGS toevallig
// aanbiedt.
const FEED_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson';
const BEWAAR_MS = 2 * 24 * 60 * 60 * 1000;

function ernstVoorMagnitude(mag) {
  if (mag >= 7) return 'kritiek';
  if (mag >= 5.5) return 'waarschuwing';
  if (mag >= 4.5) return 'let-op';
  return 'info';
}

// 2026-08-20, voor het per-locatie sublevel in de Meldingen-lijst (op
// verzoek van Lex): USGS' properties.place is bv. "10 km ESE of Springfield,
// Illinois" — het "Nkm RICHTING of "-voorvoegsel verschilt per beving, ook
// voor exact dezelfde plek, en zou dus per beving een eigen groep opleveren
// i.p.v. samen te groeperen. Hieronder gestript zodat "Springfield, Illinois"
// overblijft als stabiele groepeersleutel. Valt terug op de ruwe place-string
// als het patroon niet matcht (bv. "South Sandwich Islands region", die heeft
// geen "of X"-vorm).
function plaatsVoor(place) {
  if (!place) return null;
  return place.replace(/^\d+\s*km\s+[A-Z]{1,3}\s+of\s+/i, '').trim() || place;
}

// 2026-08-19: Lex miste een datum/tijd in de meldingenlijst — diepte/afstand
// alleen zei niks over wannéér het gebeurde.
function formatDatum(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// ---- ShakeMap-plaatje, 2026-08-18 ------------------------------------------
// Op verzoek van Lex: "actuele fototjes van de situatie". Niet elke beving
// heeft een ShakeMap (vereist voldoende seismometer-dichtheid rond het
// epicentrum) — de summary-feed geeft per beving alvast een "types"-lijst
// mee die dat verraadt, dus we proberen de per-beving detail-feed (met de
// daadwerkelijke plaatje-URL) alleen op te halen als "shakemap" daar ook in
// staat. Module-brede cache: eenmaal opgehaald (of bevestigd afwezig) hoeft
// dat niet elke poll-cyclus (90s) opnieuw voor dezelfde beving. Best-effort:
// lukt het niet, dan blijft de beving gewoon zonder plaatje bestaan.
const shakemapCache = new Map(); // usgs event-id -> url | null

// 2026-08-19: community-media (zie sources/media.js), op verzoek van Lex
// ("voor elke categorie akkoord").
// 2026-08-22, tweemaal bijgesteld na een live-test met Lex (zie git-historie
// van nws.js/mediaHistorie.js voor de aanleiding — de Putnam County-tornado):
// (1) was hier een simpele one-shot cache per beving-id — vervangen door
// mediaHistorie.js se verversMedia(), periodiek (elke 3 uur, tot 48 uur na de
// beving) opnieuw zoeken i.p.v. precies één keer.
// (2) MEDIA_MIN_MAGNITUDE toegevoegd: de week-feed hierboven bevat wereldwijd
// tientallen M4.5+ bevingen tegelijk (het gros daarvan nooit nieuws met foto/
// video) — bij Lex' eerste test met mediaHistorie.js overbelastten al die
// gelijktijdige zoekopdrachten zijn zelfgehoste SearXNG-instance volledig
// (zie de wachtrij in sources/searxng.js). Alleen vanaf deze grens nog
// zoeken scheelt fors in volume én levert relevantere resultaten op.
const MEDIA_MIN_MAGNITUDE = 5.5; // zelfde grens als de 'waarschuwing'-ernst, zie ernstVoorMagnitude hierboven

// 2026-08-22, op verzoek van Lex ("Scotia Sea toont namelijk onzin media")
// — twee losse problemen gefixt, zelfde soort aanpak als nws.js hanteert
// voor tornado's:
// 1) Zoekterm had geen enkele context ("Scotia Sea" alleen) — SearXNG matcht
//    dan op alles wat toevallig die naam noemt. "earthquake" ervoor (Engels,
//    niet "aardbeving": internationale rampenberichtgeving is overwegend
//    Engelstalig, zelfde overweging als EVENT_PER_CATEGORIE in nws.js dat
//    NWS' eigen Engelse event-namen als zoekterm gebruikt) geeft SearXNG
//    tenminste een duidelijk ramp-woord om op te matchen.
// 2) Afgelegen oceaangebieden (Scotia Sea, Mid-Atlantic Ridge, e.d.) hebben
//    per definitie geen "foto van de schade" — er woont daar niemand. USGS'
//    eigen place-veld verraadt dit al: bewoonde locaties krijgen het format
//    "10 km ESE of Springfield, Illinois" (zelfde regex als plaatsVoor()
//    hierboven strip), afgelegen zeegebieden krijgen alleen de kale
//    regionaam zonder dat "km X of"-voorvoegsel. Zonder die match: media-
//    zoektocht overslaan, niet elke hit is toch ruis.
const NABIJE_PLAATS_PATROON = /^\d+\s*km\s+[A-Z]{1,3}\s+of\s+/i;

async function communityMediaVoor(f) {
  const mag = f.properties?.mag ?? 0;
  if (mag < MEDIA_MIN_MAGNITUDE) return [];
  const place = f.properties?.place ?? null;
  if (!place || !NABIJE_PLAATS_PATROON.test(place)) return []; // afgelegen zeegebied o.i.d. — geen zinvolle zoekterm
  const zoekterm = `earthquake ${place}`;
  return verversMedia({ id: `usgs-${f.id}`, zoekterm, ontstaanIso: f.properties.time });
}

async function shakemapUrlVoor(f) {
  const id = f.id;
  if (shakemapCache.has(id)) return shakemapCache.get(id);
  const types = String(f.properties?.types ?? '');
  if (!types.includes('shakemap') || !f.properties?.detail) {
    shakemapCache.set(id, null);
    return null;
  }
  try {
    const res = await fetch(f.properties.detail, {
      headers: { 'User-Agent': 'weer-app-persoonlijk (contact: lokaal project)' },
    });
    if (!res.ok) throw new Error(`detail-feed gaf status ${res.status}`);
    const body = await res.json();
    const contents = body.properties?.products?.shakemap?.[0]?.contents ?? {};
    const url = contents['download/intensity.jpg']?.url ?? null;
    shakemapCache.set(id, url);
    return url;
  } catch (err) {
    console.error(`[weer] usgs shakemap ophalen mislukt voor ${id}:`, err.message ?? err);
    shakemapCache.set(id, null); // niet elke cyclus opnieuw proberen bij een structurele fout
    return null;
  }
}

export async function fetchUsgs({ homeLat, homeLon }) {
  const res = await fetch(FEED_URL, {
    headers: { 'User-Agent': 'weer-app-persoonlijk (contact: lokaal project)' },
  });
  if (!res.ok) throw new Error(`USGS feed gaf status ${res.status}`);
  const body = await res.json();
  const nu = Date.now();
  const recenteFeatures = body.features.filter((f) => nu - f.properties.time <= BEWAAR_MS);

  return Promise.all(
    recenteFeatures.map(async (f) => {
      const [lon, lat, diepteKmRuw] = f.geometry.coordinates;
      const mag = f.properties.mag ?? 0;
      const diepteKm = Math.round(diepteKmRuw);
      const afstandTotJouKm = homeLat != null && homeLon != null ? afstandKm(homeLat, homeLon, lat, lon) : null;
      // 2026-08-19: subtitel voor de meldingenlijst, zelfde behandeling als de
      // andere categorieën — anders bleef hier ook gewoon "USGS Earthquake
      // Feed · X geleden" staan.
      const subtitel =
        [
          formatDatum(f.properties.time),
          `${diepteKm} km diep`,
          afstandTotJouKm != null ? `${afstandTotJouKm} km van huis` : null,
          f.properties.felt ? `${f.properties.felt} voelbaar-meldingen` : null,
        ]
          .filter(Boolean)
          .join(' · ') || null;
      return makeSignal({
        id: `usgs-${f.id}`,
        categorie: 'aardbeving',
        titel: `Aardbeving - ${f.properties.title ?? `M${mag}`}`,
        ernst: ernstVoorMagnitude(mag),
        lat,
        lon,
        tijd: new Date(f.properties.time).toISOString(),
        detail: {
          magnitude: mag,
          diepteKm,
          afstandTotJouKm,
          voelbaarMeldingen: f.properties.felt ?? null,
          bronUrl: f.properties.url,
          shakemapUrl: await shakemapUrlVoor(f),
          communityMedia: await communityMediaVoor(f),
          gebied: plaatsVoor(f.properties.place),
          subtitel,
        },
      });
    })
  );
}
