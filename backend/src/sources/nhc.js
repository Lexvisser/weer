// NOAA National Hurricane Center — orkaan-tracking.
// Gebruikt het simpele JSON-overzicht i.p.v. de losse RSS/GIS-lagen:
// https://www.nhc.noaa.gov/CurrentStorms.json
// Gratis, geen sleutel. Geen officiële uptime-garantie (NOAA-disclaimer).
import { makeSignal, afstandKm } from '../normalize.js';
import { verversMedia } from '../mediaHistorie.js';

const FEED_URL = 'https://www.nhc.noaa.gov/CurrentStorms.json';

// 2026-08-19: Lex miste een datum/tijd bij Orkaan, zelfde "X geleden is niet
// zinvol"-probleem als bij de andere bronnen — zelfde formatDatum-conventie
// als usgs.js/emsc.js/gdacs.js.
function formatDatum(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// ---- Voorspelde koers (forecast track + cone of uncertainty), 2026-08-17 --
// Op verzoek van Lex ("kan je ook predicted path opgeven grafisch voor
// cyclones?"). CurrentStorms.json zelf bevat dit niet — NHC publiceert het
// als aparte ArcGIS-lagen, één "Forecast Cone"/"Forecast Track"-laag per
// momenteel actieve storm-*slot* (AT1..AT5 Atlantische Oceaan, EP1..EP5/
// CP1..CP5 Oost-/Centraal-Pacific). Welk slot bij welke storm hoort
// verandert continu (storms komen en gaan), en welk eigenschap-veld de
// stormnaam bevat kon niet live geverifieerd worden vanuit deze omgeving
// (zelfde beperking als bij andere nieuwe bronnen — de sandbox/webfetch-
// tooling kreeg alleen de interactieve HTML-queryinterface van deze ArcGIS-
// service terug, geen ruwe JSON). Daarom koppelen we NIET op naam, maar op
// geometrie: het eerste punt van een forecast-cone/track ligt per definitie
// vlak bij de huidige positie van de storm waar 'm bij hoort (een cone
// begint letterlijk bij het stormcentrum), dus we zoeken de dichtstbijzijnde
// actieve storm uit CurrentStorms.json — met een ruime veiligheidsmarge.
const MAPSERVER =
  'https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather/MapServer';
// Moet vrijwel altijd <50km zijn (cone begint bij het stormcentrum) — 300km
// als ruime marge tegen kleine afrondingsverschillen tussen de twee bronnen.
const KOPPEL_MARGE_KM = 300;

// GeoJSON is [lon, lat] — Leaflet/de rest van deze app wil [lat, lon].
function alsLatLon([lon, lat]) {
  return [lat, lon];
}

// 2026-08-19: gevonden bij Lala (Central Pacific-bekken, dicht bij de 180e
// meridiaan/internationale datumgrens) — na de MultiPolygon-fix hierboven
// kwam de pluim wél terug, maar de kaart zoomde helemaal uit. Oorzaak: een
// cone/track die de datumgrens kruist bevat punten aan beide kanten ervan
// (bijv. lon=-179.9 én lon=+179.6) — geografisch vlak bij elkaar, maar
// numeriek bijna 360° uit elkaar. Leaflet's fitBounds() kent geen
// datumgrens-logica en pakt gewoon de rauwe min/max van de lon-waarden, wat
// dan een bounding box van bijna de hele aardbol oplevert. Fix: elk punt met
// veelvouden van 360° "ontvouwen" tot het numeriek dicht (<180°) bij de
// actuele positie van de storm zelf ligt. Zo blijft de hele vorm (marker +
// cone + track) aan elkaar hangen als één doorlopend, klein gebied — ook al
// ligt die fysiek over de datumgrens heen. storm.longitudeNumeric zelf blijft
// ongewijzigd (dat is de bron van waarheid voor de rest van de app, bijv.
// afstand-tot-huis-berekeningen).
function ontvouwLongitude(lon, referentieLon) {
  let resultaat = lon;
  while (resultaat - referentieLon > 180) resultaat -= 360;
  while (resultaat - referentieLon < -180) resultaat += 360;
  return resultaat;
}

// 2026-08-19: root cause van "mis de pluim bij Lala" — bevestigd via een
// tijdelijke diagnose-log (`cone-diagnose`) die liet zien dat NHC de
// forecast-cone soms als MultiPolygon teruggeeft i.p.v. een gewone Polygon
// (bij Lala: geometryType=MultiPolygon). Bij een MultiPolygon is
// coordinates[0] NIET een platte ring van punten — het is de HELE eerste
// polygon (een array van ringen, elk zelf weer een array van punten). De
// oude code (`f.geometry?.coordinates?.[0]`) behandelde dat abusievelijk
// als één platte ring, waardoor elke afstandsberekening op de verkeerde
// vorm rekende en altijd NaN opleverde — dus nooit een match, ook niet na
// de eerdere "check elke vertex"-fix (die vertices waren zelf al fout).
// Dezelfde Polygon/MultiPolygon-aware ring-extractie als in nws.js
// (ringen()) lost dit op: voor een MultiPolygon pakken we de buitenste ring
// van élke deelpolygon apart.
function conRingenVanGeometry(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') {
    return geometry.coordinates?.[0] ? [geometry.coordinates[0]] : [];
  }
  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates ?? []).map((polygon) => polygon?.[0]).filter((ring) => Array.isArray(ring) && ring.length);
  }
  return [];
}

async function fetchLaagFeatures(mapserver, laagId) {
  const url = `${mapserver}/${laagId}/query?f=geojson&where=1%3D1&outFields=*&returnGeometry=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`laag ${laagId} gaf status ${res.status}`);
  const body = await res.json();
  return body.features ?? [];
}

function dichtstbijzijndeStormFactory(storms, margeKm) {
  return function dichtstbijzijndeStorm(lat, lon) {
    let beste = null;
    let besteAfstand = Infinity;
    for (const storm of storms) {
      if (storm.latitudeNumeric == null || storm.longitudeNumeric == null) continue;
      const d = afstandKm(lat, lon, storm.latitudeNumeric, storm.longitudeNumeric);
      if (d < besteAfstand) {
        besteAfstand = d;
        beste = storm;
      }
    }
    return beste && besteAfstand <= margeKm ? beste : null;
  };
}

// 2026-08-19: gevonden na Lex' melding "ik mis de pluim bij Lala" — de
// koerslijn (track) matchte nog wel, de cone niet meer. Root cause: de
// koppeling hierboven (dichtstbijzijndeStormFactory) gebruikte voor de cone
// alleen ring[0] (het eerste vertex van de polygon) als ankerpunt — dat
// klopt voor de koerslijn (lijn[0] is per definitie de actuele positie,
// het beginpunt van het pad), maar is te fragiel voor een gesloten
// polygon-ring: welk vertex GeoJSON als "eerste" serialiseert is niet
// gegarandeerd de kant die bij de actuele stormpositie ligt, zeker niet bij
// een cone die tot 5 dagen vooruit kan uitwaaieren (dus honderden km breed
// kan zijn tegen de tijd dat je bij een willekeurig vertex uitkomt). Fix:
// voor een cone-ring de KORTSTE afstand over alle vertices tot een storm
// gebruiken i.p.v. alleen het eerste punt — de "punt" van de cone ligt
// altijd vlak bij de actuele positie, dus zolang er ergens in de ring een
// vertex dicht genoeg bij een storm ligt, wordt 'm gevonden.
function dichtstbijzijndeStormVoorRing(storms, ring, margeKm) {
  let beste = null;
  let besteAfstand = Infinity;
  for (const storm of storms) {
    if (storm.latitudeNumeric == null || storm.longitudeNumeric == null) continue;
    for (const [lon, lat] of ring) {
      const d = afstandKm(storm.latitudeNumeric, storm.longitudeNumeric, lat, lon);
      if (d < besteAfstand) {
        besteAfstand = d;
        beste = storm;
      }
    }
  }
  return beste && besteAfstand <= margeKm ? beste : null;
}

// Best effort: als dit om wat voor reden dan ook mislukt (NHC-laagstructuur
// gewijzigd, netwerkhapering, veldnamen anders dan verwacht), gaan de
// orkaan-signalen gewoon door zonder voorspelde koers i.p.v. dat de hele
// bron faalt — een orkaan-signaal zonder koers-extra is nog altijd veel
// waardevoller dan helemaal geen orkaan-signaal.
async function fetchVoorspeldeKoersen(storms) {
  const koersenPerStorm = new Map(); // storm.id -> { gebiedPolygon, koerslijn }
  if (!storms.length) return koersenPerStorm;
  try {
    const res = await fetch(`${MAPSERVER}/layers?f=json`);
    if (!res.ok) throw new Error(`lagenlijst gaf status ${res.status}`);
    const body = await res.json();
    const lagen = body.layers ?? [];
    const coneLagen = lagen.filter((l) => /forecast cone$/i.test(l.name ?? ''));
    const trackLagen = lagen.filter((l) => /forecast track$/i.test(l.name ?? ''));
    const dichtstbijzijndeStorm = dichtstbijzijndeStormFactory(storms, KOPPEL_MARGE_KM);

    await Promise.allSettled([
      ...coneLagen.map(async (laag) => {
        const features = await fetchLaagFeatures(MAPSERVER, laag.id);
        for (const f of features) {
          // Zie conRingenVanGeometry() hierboven — dit haalt de buitenste
          // ring(en) op ongeacht of NHC een Polygon of MultiPolygon
          // teruggeeft (bevestigde oorzaak van "mis de pluim bij Lala").
          const ringen = conRingenVanGeometry(f.geometry);
          if (!ringen.length) continue;
          // Matchen op de kortste afstand over ALLE vertices van ALLE ringen
          // samen tot een storm (zie dichtstbijzijndeStormVoorRing) — de
          // "punt" van de cone (dicht bij de actuele positie) zit altijd
          // ergens in die verzameling.
          const storm = dichtstbijzijndeStormVoorRing(storms, ringen.flat(), KOPPEL_MARGE_KM);
          if (!storm) continue;
          const entry = koersenPerStorm.get(storm.id) ?? {};
          // Meerdere ringen (bij een MultiPolygon) worden allemaal
          // meegegeven — toonGebiedVoor() in app.js tekent al elke ring in
          // gebiedPolygon los als eigen L.polygon. Zie ontvouwLongitude()
          // hierboven voor waarom lon hier niet gewoon 1-op-1 overgenomen
          // wordt (datumgrens-fix).
          entry.gebiedPolygon = ringen.map((ring) =>
            ring.map(([lon, lat]) => [lat, ontvouwLongitude(lon, storm.longitudeNumeric)])
          );
          koersenPerStorm.set(storm.id, entry);
        }
      }),
      ...trackLagen.map(async (laag) => {
        const features = await fetchLaagFeatures(MAPSERVER, laag.id);
        for (const f of features) {
          const lijn = f.geometry?.coordinates;
          if (!Array.isArray(lijn) || !lijn.length) continue;
          const [lon, lat] = lijn[0];
          const storm = dichtstbijzijndeStorm(lat, lon);
          if (!storm) continue;
          const entry = koersenPerStorm.get(storm.id) ?? {};
          entry.koerslijn = lijn.map(([lon2, lat2]) => [lat2, ontvouwLongitude(lon2, storm.longitudeNumeric)]);
          koersenPerStorm.set(storm.id, entry);
        }
      }),
    ]);

    if (koersenPerStorm.size) {
      // 2026-08-19: de oude regel hier ("gekoppeld voor N storm(en)") zei
      // niet OF dat een cone, een koerslijn, of allebei was — precies het
      // onderscheid dat nodig was om de "mis de pluim"-bug hierboven te
      // vinden. Nu expliciet per storm welke van de twee daadwerkelijk
      // gevonden is, zodat een volgende keer niet meer blind geraden hoeft
      // te worden.
      const detailPerStorm = [...koersenPerStorm.entries()]
        .map(([id, entry]) => `${id}: cone=${entry.gebiedPolygon ? 'ja' : 'nee'}, koerslijn=${entry.koerslijn ? 'ja' : 'nee'}`)
        .join(' · ');
      console.log(
        `[weer] nhc-forecast: voorspelde koers gekoppeld voor ${koersenPerStorm.size} storm(en) (${coneLagen.length} cone-laag/lagen, ${trackLagen.length} track-laag/lagen gevonden) — ${detailPerStorm}`
      );
    } else if (coneLagen.length || trackLagen.length) {
      console.log(
        `[weer] nhc-forecast: ${coneLagen.length} cone-laag/lagen en ${trackLagen.length} track-laag/lagen ` +
          `gevonden, maar geen kon aan een actieve storm gekoppeld worden (>${KOPPEL_MARGE_KM}km weg, of storm ` +
          `zonder positie) — check de koppel-logica hierboven als dit blijft gebeuren zodra er echt een actieve ` +
          `storm is.`
      );
    }
  } catch (err) {
    console.error(
      '[weer] nhc-forecast poll mislukt (orkaan-signalen gaan gewoon door zonder voorspelde koers):',
      err.message ?? err
    );
  }
  return koersenPerStorm;
}

// ---- Live satellietbeeld (GOES GeoColor) — weggehaald, 2026-08-18 ----------
// Stond hier eerst als los, statisch STAR CDN-plaatje per storm-popup (naast
// SATELLIET_PER_BASIN + satellietUrlVoor()). Op verzoek van Lex weggehaald
// nadat de interactieve GIBS-kaartlaag (🛰️ Satelliet-knop, zie app.js) eenmaal
// goed werkte: "valt uit beeld, meer last dan gemak, overkill" — dat vaste
// plaatje toonde in essentie hetzelfde als de kaartlaag, maar dan niet te
// verschuiven/inzoomen. De sectornaam-uitzoekklus (`hi` voor Centraal-Pacific,
// bevestigd bij Lala; `eep` voor Oost-Pacific, ongeteste gok; `taw` voor het
// Atlantische bekken, bevestigd) is destijds nuttig gebleken voor de mapindex-
// kennis, maar de feature zelf is dus niet meer in gebruik.

// ---- Volledige advisory-tekst, 2026-08-18 -----------------------------------
// Haalt de tekst van storm.publicAdvisory.url op (een .shtml-pagina met de
// ruwe NWS-bulletintekst in een <pre>-blok) en toont die direct in de app
// i.p.v. alleen een link erheen. Paginastructuur niet live geverifieerd
// vanuit deze omgeving — best-effort <pre>-extractie; lukt het niet, dan
// blijft gewoon alleen de link over (die stond er toch al).
async function fetchAdviesTekst(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'weer-app-persoonlijk (contact: lokaal project)' } });
    if (!res.ok) throw new Error(`advisory-pagina gaf status ${res.status}`);
    const html = await res.text();
    const match = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
    if (!match) return null;
    const tekst = match[1]
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .trim();
    return tekst.slice(0, 4000) || null;
  } catch (err) {
    console.error('[weer] nhc-advies-tekst ophalen mislukt:', err.message ?? err);
    return null;
  }
}

// ---- Storm surge watch/warning, 2026-08-18 ----------------------------------
// Aparte, FEMA-gehoste ArcGIS-service (niet dezelfde MAPSERVER als hierboven)
// — gevonden via een live zoekopdracht, maar laagstructuur/veldnamen niet
// geverifieerd. Best-effort en bewust beperkt tot een korte statustekst (geen
// polygon-tekening) — dat houdt het risico van een derde, onzekere geometrie
// naast gebiedPolygon/koerslijn buiten de deur. Gekoppeld op dezelfde
// dichtstbijzijnde-storm-truc als de voorspelde koers hierboven, met een
// ruimere marge (surge-zones liggen aan de kust, niet bij het stormcentrum).
const SURGE_MAPSERVER = 'https://gis.fema.gov/arcgis/rest/services/Partner/NHC_Hur_Adv_Surge/MapServer';
const SURGE_KOPPEL_MARGE_KM = 1000;

async function fetchStormSurgeTeksten(storms) {
  const resultaat = new Map(); // storm.id -> tekst
  if (!storms.length) return resultaat;
  try {
    const res = await fetch(`${SURGE_MAPSERVER}/layers?f=json`);
    if (!res.ok) throw new Error(`surge-lagenlijst gaf status ${res.status}`);
    const body = await res.json();
    const lagen = (body.layers ?? []).filter((l) => /watch|warning/i.test(l.name ?? ''));
    if (!lagen.length) return resultaat;
    const dichtstbijzijndeStorm = dichtstbijzijndeStormFactory(storms, SURGE_KOPPEL_MARGE_KM);

    await Promise.allSettled(
      lagen.map(async (laag) => {
        const features = await fetchLaagFeatures(SURGE_MAPSERVER, laag.id);
        const isWarning = /warning/i.test(laag.name ?? '');
        for (const f of features) {
          const ring = f.geometry?.coordinates?.[0];
          if (!Array.isArray(ring) || !ring.length) continue;
          const [lon, lat] = ring[0];
          const storm = dichtstbijzijndeStorm(lat, lon);
          if (!storm) continue;
          const huidigIsWarning = resultaat.get(storm.id)?.includes('WARNING');
          if (!huidigIsWarning) {
            resultaat.set(
              storm.id,
              isWarning
                ? 'Storm surge WARNING actief langs (delen van) de kust'
                : 'Storm surge watch actief langs (delen van) de kust'
            );
          }
        }
      })
    );
  } catch (err) {
    console.error(
      '[weer] nhc storm-surge-check mislukt (orkaan-signaal gaat gewoon door zonder surge-info):',
      err.message ?? err
    );
  }
  return resultaat;
}

// ---- Tropical Weather Outlook (vormingsgebieden), 2026-08-18 ---------------
// Op verzoek van Lex: vroege waarschuwing vóórdat een systeem een naam heeft.
// NHC's "Graphical Tropical Weather Outlook" (zie nhc.noaa.gov/gis/) toont
// gebieden met een ontwikkelingskans (2-daags/7-daags). Eigen, losse signalen
// (geen koppeling aan een bestaande storm nodig — deze gebieden bestaan vaak
// zonder dat er al een storm is), categorie 'cycloonvorming'.
//
// FIX 2026-08-19: Lex zag een live 80%-Pacific-disturbance op nhc.gov die
// nooit als signaal in de app verscheen — geen basin-probleem (deze bron
// dekt sowieso alle NHC-bekkens, geen filter), maar een echte bug, live
// bevestigd door de NHC-laagstructuur zelf op te vragen:
// 1. De oorspronkelijke regex-match op "outlook" in de laagnaam matchte
//    alleen twee lege GROEP-lagen ("Graphical Tropical Weather Outlook" en
//    "Seven-Day Outlook") — containers zonder eigen features, een query
//    daarop levert altijd niks op. De laag met de daadwerkelijke gearceerde
//    vormingsgebieden heet "Seven-Day: Potential Development Region" — geen
//    "outlook" in de naam, dus werd nooit gevonden.
// 2. De gegokte veldnamen (PERCENTAGE/PROB7DAY in hoofdletters) klopten ook
//    niet — de echte velden zijn kleine letters: prob2day/prob7day (percentage)
//    en risk2day/risk7day (NHC's eigen tekstomschrijving, bijv. "High...80
//    percent"). Beide bugs samen zorgden dus dat dit stilzwijgend nooit iets
//    opleverde, ook al klopte de basin-dekking (Atlantic+Pacific) prima.
// Nu direct op de juiste laagnaam gematcht, met de live geverifieerde
// veldnamen als primaire keuze (oude hoofdletter-gok als vangnet erachteraan
// voor het geval NOAA het schema ooit weer wijzigt).
//
// 2026-08-19: Lex miste een datum bij cycloonvorming — signal.tijd stond op
// new Date() (het pollmoment zelf, niet de echte NHC-afgiftedatum) en er zat
// ook geen datumveld in de subtitel. Bevestigd via een tijdelijke
// properties-diagnose welk veld de echte afgiftedatum bevat — zie
// afgifteDatumMs hieronder (idp_filedate).
async function fetchOutlookGebieden() {
  try {
    const res = await fetch(`${MAPSERVER}/layers?f=json`);
    if (!res.ok) throw new Error(`lagenlijst gaf status ${res.status}`);
    const body = await res.json();
    const lagen = (body.layers ?? []).filter((l) => /potential development region/i.test(l.name ?? ''));
    if (!lagen.length) return [];

    const featuresPerLaag = await Promise.allSettled(lagen.map((l) => fetchLaagFeatures(MAPSERVER, l.id)));
    const signalen = [];
    featuresPerLaag.forEach((r, i) => {
      if (r.status !== 'fulfilled') return;
      r.value.forEach((f, j) => {
        const ring = f.geometry?.coordinates?.[0];
        if (!Array.isArray(ring) || ring.length < 3) return;
        const props = f.properties ?? {};
        const kansPct = Number(
          props.prob7day ?? props.prob2day ?? props.PERCENTAGE ?? props.PROB7DAY ?? props.PROB2DAY ?? props.OUTLOOKPROB ?? props.PROB ?? NaN,
        );
        const kansTekst = Number.isFinite(kansPct) ? `${kansPct}% kans op ontwikkeling (7 dagen)` : null;
        const som = ring.reduce((acc, [lon, lat]) => [acc[0] + lat, acc[1] + lon], [0, 0]);
        const zwaartepunt = [som[0] / ring.length, som[1] / ring.length];
        // 2026-08-19: Lex miste een datum — bevestigd via de
        // voorbeeldproperties-diagnose (zie boven): idp_filedate is een
        // epoch-ms-timestamp van het moment dat NHC deze outlook-graphic
        // genereerde (bevestigd door idp_source, bijv.
        // "gtwo_areas_202608191142" — zelfde datum/tijd ingebakken in de
        // bestandsnaam). Dat is de echte afgiftedatum, in tegenstelling tot
        // het pollmoment dat hier eerder gebruikt werd.
        const afgifteDatumMs = Number.isFinite(props.idp_filedate) ? props.idp_filedate : null;
        // 2026-08-19: kansTekst zit al in de titel als 'ie er is, dus die niet
        // herhalen — subtitel geeft in plaats daarvan de afgiftedatum en
        // NHC's eigen risico-omschrijving (props.risk2day/risk7day, bijv.
        // "High...80 percent"), zodat de meldingenlijst iets zinvols toont
        // i.p.v. "NOAA National Hurricane Center · X geleden".
        const subtitel = [
          afgifteDatumMs != null ? formatDatum(afgifteDatumMs) : null,
          props.basin ? `Bekken ${props.basin}` : null,
          props.risk2day ?? props.risk7day ?? null,
        ]
          .filter(Boolean)
          .join(' · ') || null;
        signalen.push(
          makeSignal({
            id: `nhc-outlook-${lagen[i].id}-${j}`,
            categorie: 'cycloonvorming',
            titel: kansTekst ? `Cycloonvorming - ${kansTekst}` : 'Cycloonvorming - mogelijke tropische ontwikkeling',
            ernst: Number.isFinite(kansPct) && kansPct >= 60 ? 'let-op' : 'info',
            lat: zwaartepunt[0],
            lon: zwaartepunt[1],
            tijd: afgifteDatumMs != null ? new Date(afgifteDatumMs).toISOString() : new Date().toISOString(),
            detail: {
              kansTekst,
              basin: props.basin ?? null,
              risicoTekst2Dagen: props.risk2day ?? null,
              risicoTekst7Dagen: props.risk7day ?? null,
              gebiedPolygon: [ring.map(alsLatLon)],
              subtitel,
            },
          })
        );
      });
    });
    if (signalen.length) console.log(`[weer] nhc-outlook: ${signalen.length} vormingsgebied(en) gevonden`);
    return signalen;
  } catch (err) {
    console.error('[weer] nhc-outlook poll mislukt (vormingsgebieden overgeslagen):', err.message ?? err);
    return [];
  }
}

const CLASSIFICATIE_NAAM = {
  TD: 'Tropische depressie',
  TS: 'Tropische storm',
  HU: 'Orkaan',
  PTC: 'Potentiële tropische cycloon',
};

// 2026-08-19: op verzoek van Lex ("meekijken welke foto's er bij Lala
// gezocht zijn") — bleek dat een kale naam als zoekterm ("Lala") op
// Wikimedia Commons soms een gelijknamige plaats treft i.p.v. de storm zelf
// (bij Lala: de gemeente Lala, Lanao del Norte op de Filipijnen — locatorkaart,
// gemeentewapen, straatfoto's, geen orkaanbeeld in zicht). Een Engelse
// classificatie ervoor ("Hurricane Lala") disambigueert dat, en Commons is
// toch overwegend Engelstalig geïndexeerd. Zie ook de noise-filter in
// wikimedia.js voor dezelfde soort ruis vanuit een andere hoek (elke
// plaatsnaam-zoekterm, ook bij aardbevingen etc., loopt tegen dit
// locator-kaart/wapen-probleem aan).
const CLASSIFICATIE_NAAM_EN = {
  TD: 'Tropical Depression',
  TS: 'Tropical Storm',
  HU: 'Hurricane',
  PTC: 'Potential Tropical Cyclone',
};

// Saffir-Simpson-categorie op basis van windsnelheid in knopen (alleen relevant bij HU).
function orkaanCategorie(intensiteitKt) {
  if (intensiteitKt >= 137) return 5;
  if (intensiteitKt >= 113) return 4;
  if (intensiteitKt >= 96) return 3;
  if (intensiteitKt >= 83) return 2;
  if (intensiteitKt >= 64) return 1;
  return null;
}

function ernstVoor(classificatie, intensiteitKt) {
  if (classificatie === 'HU') {
    const cat = orkaanCategorie(intensiteitKt);
    return cat >= 3 ? 'kritiek' : 'waarschuwing';
  }
  if (classificatie === 'TS' || classificatie === 'PTC') return 'let-op';
  return 'info'; // TD en overig
}

export async function fetchNhc() {
  const res = await fetch(FEED_URL, {
    headers: { 'User-Agent': 'weer-app-persoonlijk (contact: lokaal project)' },
  });
  if (!res.ok) throw new Error(`NHC feed gaf status ${res.status}`);
  const body = await res.json();
  const storms = body.activeStorms ?? [];

  const [koersenPerStorm, surgeTekstenPerStorm, verrijkingenPerStorm, outlookSignalen] = await Promise.all([
    fetchVoorspeldeKoersen(storms),
    fetchStormSurgeTeksten(storms),
    Promise.all(
      storms.map(async (storm) => {
        // Zoekterm met Engelse classificatie ervoor ("Hurricane Lala") i.p.v.
        // kaal "Lala" — zie CLASSIFICATIE_NAAM_EN hierboven voor waarom.
        const mediaZoekterm = `${CLASSIFICATIE_NAAM_EN[storm.classification] ?? ''} ${storm.name}`.trim();
        // 2026-08-22: was hier fetchCommunityMedia(mediaZoekterm) — dat zocht
        // ELKE pollcyclus opnieuw voor elke actieve storm, zonder enige cache
        // (nog rechtstreekser dan de one-shot caches die nws.js/usgs.js tot
        // dan toe hadden). Vervangen door mediaHistorie.js se verversMedia():
        // zoekt nu nog maar om de 3 uur, en blijft na afloop van de storm nog
        // 48 uur doorzoekbaar voor later verschenen materiaal. storm.
        // lastUpdate (i.p.v. een vast "ontstaan"-moment) als tijdreferentie —
        // schuift elke nieuwe NHC-advisory automatisch mee vooruit, zodat een
        // storm die dagenlang actief blijft niet na 48 uur ineens stopt met
        // verversen (zie de toelichting in mediaHistorie.js zelf).
        const [advies, media] = await Promise.all([
          storm.publicAdvisory?.url ? fetchAdviesTekst(storm.publicAdvisory.url) : Promise.resolve(null),
          verversMedia({ id: `nhc-${storm.id}`, zoekterm: mediaZoekterm, ontstaanIso: storm.lastUpdate }),
        ]);
        return [storm.id, { adviesTekst: advies, communityMedia: media }];
      })
    ).then((paren) => new Map(paren)),
    fetchOutlookGebieden(),
  ]);

  const stormSignalen = storms.map((storm) => {
    const intensiteitKt = Number(storm.intensity);
    const classificatie = storm.classification;
    const cat = classificatie === 'HU' ? orkaanCategorie(intensiteitKt) : null;
    const naam = CLASSIFICATIE_NAAM[classificatie] ?? classificatie;
    const titel = cat ? `${naam} ${storm.name} - Cat. ${cat}` : `${naam} ${storm.name}`;
    const koers = koersenPerStorm.get(storm.id);
    const verrijking = verrijkingenPerStorm.get(storm.id) ?? {};
    // 2026-08-19: subtitel voor de meldingenlijst — windkracht/druk/beweging
    // stonden al in detail (voor de popup), maar de lijst zelf toonde tot nu
    // toe alleen "NOAA National Hurricane Center · X geleden".
    const bewegingTekst =
      storm.movementDir != null && storm.movementSpeed != null ? `beweegt ${storm.movementDir} ${storm.movementSpeed} kt` : null;
    const subtitel =
      [
        formatDatum(storm.lastUpdate),
        Number.isFinite(intensiteitKt) ? `${intensiteitKt} kt wind` : null,
        storm.pressure ? `${storm.pressure} hPa` : null,
        bewegingTekst,
      ]
        .filter(Boolean)
        .join(' · ') || null;

    return makeSignal({
      id: `nhc-${storm.id}`,
      categorie: 'orkaan',
      titel,
      ernst: ernstVoor(classificatie, intensiteitKt),
      lat: storm.latitudeNumeric,
      lon: storm.longitudeNumeric,
      tijd: storm.lastUpdate,
      detail: {
        classificatie,
        categorieOrkaan: cat,
        windKt: intensiteitKt,
        drukHpa: storm.pressure ? Number(storm.pressure) : null,
        bewegingRichtingGraden: storm.movementDir ?? null,
        bewegingSnelheidKt: storm.movementSpeed ?? null,
        publicAdvisoryUrl: storm.publicAdvisory?.url ?? null,
        // Voorspelde koers (cone of uncertainty + track-lijn) — alleen voor
        // NHC-orkanen (Atlantische/Oost-/Centraal-Pacifische bekkens), zie
        // fetchVoorspeldeKoersen() hierboven. null zolang niet gekoppeld kon
        // worden; hergebruikt dezelfde toonGebiedVoor()-tekenlogica in de
        // frontend als tornado-watch/severe-outlook (gebiedPolygon) plus een
        // polylijn-tekening (koerslijn).
        gebiedPolygon: koers?.gebiedPolygon ?? null,
        koerslijn: koers?.koerslijn ?? null,
        // Nieuw sinds 2026-08-18 (zie fetch*-functies hierboven voor de
        // achtergrond/onzekerheden per veld):
        adviesTekst: verrijking.adviesTekst ?? null,
        communityMedia: verrijking.communityMedia ?? [],
        stormSurgeTekst: surgeTekstenPerStorm.get(storm.id) ?? null,
        subtitel,
      },
    });
  });

  // outlookSignalen (categorie 'cycloonvorming') zijn losse signalen, niet
  // gekoppeld aan een storm — vandaar los toegevoegd i.p.v. in detail van een
  // storm-signaal.
  return [...stormSignalen, ...outlookSignalen];
}
