// EMSC SeismicPortal (Europees-Mediterrane focus) — vult USGS aan met kleinere
// bevingen in en rond Europa die USGS' 4.5+-drempel niet haalt.
// Documentatie: https://www.seismicportal.eu/fdsn-wsevent.html
//
// Update t.o.v. de eerdere opzet: dit stond genoteerd als WebSocket-push
// (wss://www.seismicportal.eu/standing_order/websocket), maar de gewone
// FDSN REST-query werkt net zo goed voor pollen en past in het bestaande
// poll-model van de rest van de app — geen aparte WebSocket-laag nodig.
//
// Let op: overlapt deels met USGS voor grote, wereldwijd gevoelde bevingen
// (beide zijn immers officiële seismologische netwerken). Dat kan dus tot
// dubbele meldingen leiden voor hetzelfde fysieke event — bewuste keuze,
// vooralsnog geen cross-source deduplicatie.
import { makeSignal, afstandKm } from '../normalize.js';
import { verversMedia } from '../mediaHistorie.js';

// 2026-08-19: "limit=50" was de facto de enige begrenzing — geen tijdvenster,
// dus hoe lang een beving zichtbaar bleef hing af van hoe druk het toevallig
// was (bij een rustige periode maanden, bij een actieve reeks bevingen soms
// maar een paar uur). Op verzoek van Lex nu een expliciete, bewuste
// bewaartermijn (2 dagen, zelfde als USGS) i.p.v. een impliciete limit-cutoff
// — limit blijft als ruime marge staan (dekt makkelijk 2 dagen aan M3+
// bevingen), de échte begrenzing is nu het filter hieronder.
const FEED_URL = 'https://www.seismicportal.eu/fdsnws/event/1/query?format=json&limit=200&minmag=3&orderby=time';
const BEWAAR_MS = 2 * 24 * 60 * 60 * 1000;

function ernstVoorMagnitude(mag) {
  if (mag >= 7) return 'kritiek';
  if (mag >= 5.5) return 'waarschuwing';
  if (mag >= 4) return 'let-op';
  return 'info';
}

// 2026-08-19: Lex miste een datum/tijd in de meldingenlijst.
function formatDatum(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// 2026-08-19: community-media (zie media.js), op verzoek van Lex ("voor
// elke categorie akkoord"). Dit feed heeft een véél lagere drempel dan USGS
// (minmag=3, tot 200 events over 2 dagen) — media zoeken voor élke kleine
// M3.0-beving zou drie gratis publieke API's onnodig belasten voor bevingen
// die vrijwel nooit nieuws-/fotomateriaal opleveren. Bewuste keuze: alleen
// vanaf M4.5 (zelfde grens als USGS' eigen feed) een media-zoekopdracht
// starten.
const MEDIA_MIN_MAG = 4.5;

// 2026-08-22-fix, op verzoek van Lex (na de vraag "is media bij onweer wel
// zinvol?" — bij navraag bleek dat dezelfde onderliggende vraag ook voor de
// andere community-media-bronnen gold): dit was hier nog een simpele
// one-shot cache (media.js precies één keer bevragen, op het moment dat een
// beving voor het eerst gezien wordt) — vervangen door mediaHistorie.js se
// verversMedia(), zelfde reden als bij nws.js/usgs.js: het beste materiaal
// verschijnt vaak pas uren later, en BEWAAR_MS hierboven laat een beving
// sowieso al 2 volle dagen zichtbaar blijven — ruim genoeg venster om
// herhaald te kunnen verversen i.p.v. maar één kans te krijgen.
async function communityMediaVoor(unid, mag, zoekterm, ontstaanIso) {
  if (mag < MEDIA_MIN_MAG) return [];
  if (!zoekterm || AFGELEGEN_REGIO_PATROON.test(zoekterm)) return [];
  return verversMedia({ id: `emsc-${unid}`, zoekterm, ontstaanIso });
}

// 2026-08-22-fix, "bij bewoond gebied ook uiteraard" — zelfde soort filter
// als NABIJE_PLAATS_PATROON in usgs.js (die skipte USGS' "Scotia Sea"-achtige
// niemandsland-omschrijvingen), maar dan voor EMSC's flynn_region-veld. Dat
// heeft een ander format dan USGS' "Nkm RICHTING of Plaats" (geen vast
// voorzetsel om op te filteren), dus hier een omgekeerde aanpak: een kleine,
// bewust CONSERVATIEVE blocklist van namen die per definitie midden-oceanisch/
// onbewoond zijn (een rug, trog, plateau of breukzone ligt nooit vlakbij een
// kust) — "SEA"/"OCEAN"/"ISLANDS REGION" bewust NIET geblokkeerd, want een zee
// kan wel degelijk vlak bij bewoonde kust liggen (bv. "AEGEAN SEA" raakt
// Griekse eilanden) en dat zou dan onterecht wegvallen. Niet live getest of
// deze precies de goede grens raakt — bijstellen zodra een concreet voorbeeld
// (net als "Scotia Sea" bij USGS) een onzinnig/gemist geval laat zien.
const AFGELEGEN_REGIO_PATROON = /\b(RIDGE|TRENCH|RISE|BASIN|FRACTURE ZONE|SEAMOUNT)\b/i;

export async function fetchEmsc({ homeLat, homeLon }) {
  const res = await fetch(FEED_URL, {
    headers: { 'User-Agent': 'weer-app-persoonlijk (contact: lokaal project)' },
  });
  if (!res.ok) throw new Error(`EMSC feed gaf status ${res.status}`);
  const body = await res.json();
  const nu = Date.now();

  const recenteFeatures = (body.features ?? []).filter((f) => nu - new Date(f.properties.time).getTime() <= BEWAAR_MS);

  return Promise.all(
    recenteFeatures.map(async (f) => {
      const [lon, lat] = f.geometry.coordinates;
      const mag = f.properties.mag ?? 0;
      const unid = f.properties.unid ?? f.id;
      const diepteKm = f.properties.depth != null ? Math.round(f.properties.depth) : null;
      const afstandTotJouKm = homeLat != null && homeLon != null ? afstandKm(homeLat, homeLon, lat, lon) : null;
      const subtitel =
        [
          formatDatum(f.properties.time),
          diepteKm != null ? `${diepteKm} km diep` : null,
          afstandTotJouKm != null ? `${afstandTotJouKm} km van huis` : null,
        ]
          .filter(Boolean)
          .join(' · ') || null;
      return makeSignal({
        id: `emsc-${unid}`,
        categorie: 'aardbeving',
        titel: `Aardbeving - M${mag} - ${f.properties.flynn_region ?? 'onbekende regio'}`,
        ernst: ernstVoorMagnitude(mag),
        lat,
        lon,
        tijd: f.properties.time,
        detail: {
          magnitude: mag,
          diepteKm,
          afstandTotJouKm,
          bron: 'EMSC',
          bronUrl: `https://www.seismicportal.eu/eventdetails.html?unid=${unid}`,
          communityMedia: await communityMediaVoor(unid, mag, f.properties.flynn_region, f.properties.time),
          // 2026-08-20, voor het per-locatie sublevel in de Meldingen-lijst:
          // flynn_region is al een schone, stabiele regionaam (geen
          // "Nkm richting van"-voorvoegsel zoals bij USGS), dus direct
          // bruikbaar als groepeersleutel.
          gebied: f.properties.flynn_region ?? null,
          subtitel,
        },
      });
    })
  );
}
