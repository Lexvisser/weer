// Meteoalarm — via MeteoGate (devportal.meteogate.eu), het EUMETNET-brede
// dataportaal dat de officiële MeteoAlarm OGC-API EDR onder haar eigen
// gateway doorzet (api.meteogate.eu/warnings). Dit IS de officiële bron voor
// NL-waarschuwingen (KNMI levert hieraan) — vervangt de eerdere legacy
// Atom+CAP-feed. Onderliggende spec: https://api.meteoalarm.org/edr/v1/docs
//
// 2026-08-19: overgestapt van de legacy Atom-feed naar deze officiële API,
// om twee dingen die Lex opmerkte tegelijk op te lossen:
// 1) de gebiedsnaam kwam in het Engels binnen ("Flushing" i.p.v.
//    "Vlissingen") — deze API accepteert een `language`-parameter (hier
//    hardcoded op nl-NL) die de content in het Nederlands teruggeeft
//    (live bevestigd: een testfeature kwam terug met hubLanguage "nl-NL").
// 2) er was geen polygon/omtrek beschikbaar, alleen een EMMA-regiocode
//    (het oude detail.emmaId) — deze API geeft per waarschuwing een
//    `featureType` mee: "geocode" (kleine regio/stad — puntmarkering,
//    Lex' "gevarendriehoek") of "polygon" (grotere regio — een echte
//    omtrek), plus de geometrie zelf.
//
// Vereist een gratis API-sleutel via het zelfbedienings-Developer Portal op
// devportal.meteogate.eu ("Get API Key" na inloggen met GitHub/Google) — zet
// 'm in .env als METEOGATE_API_KEY.
//
// Twee-staps-ophaal: de locations/NL-lijst geeft per waarschuwing alleen
// metadata + (bbox-)geometrie + een link naar het eigenlijke detailbestand
// (event/severity/gebiedsnaam/geldigheidsperiode). Meerdere features kunnen
// naar dezelfde onderliggende waarschuwing (alertId) wijzen — bijv. één
// landelijke waarschuwing die per provincie een eigen area/feature krijgt —
// dus het detailbestand wordt maar één keer per uniek alertId opgehaald.
//
// LET OP — nog niet live bevestigd (kon vanuit deze omgeving niet bij de API
// door een netwerkbeperking, en de browserconsole blokkeerde de signed
// download-links): de exacte veldnamen in dat detailbestand. Aanname:
// het is de CAP-alert vrijwel 1-op-1 als JSON (identifier, sent, info[]
// met event/severity/onset/expires/area[].areaDesc/parameter[]) — de
// gangbare aanpak wanneer een API "json" naast "xml"/"canonical" als
// zusterformaat aanbiedt, wat hier het geval is. Check bij opstarten de
// console-log "[weer] meteoalarm: voorbeelddetail" en pas
// haalWaarschuwingDetail()/de veldnamen hieronder aan als de structuur
// toch afwijkt.
//
// 2026-08-23: precieze polygon-omtrek bij featureType "polygon" aangesloten
// (zie haalPreciezeOmtrek() hieronder) — voorheen werd daar altijd de
// meegeleverde bbox gebruikt (een grove rechthoek). Ook DEZE vorm is nog
// niet live bevestigd (zelfde netwerkbeperking als hierboven) — check de
// console-log "[weer] meteoalarm: voorbeeld precieze geometrie" bij
// opstarten. Bewust zo gebouwd dat een afwijkende/kapotte respons nooit de
// hele melding laat mislukken: bij twijfel valt het gewoon terug op de bbox
// (zie ook detail.omtrekBron hieronder, "precies" vs "bbox", om in de app
// zelf te kunnen zien welke van de twee het geworden is zonder de
// console-log te hoeven checken).
import { makeSignal } from '../normalize.js';
import { stuurAlarm, kaartTekst } from './pushover.js';
import { stuurMailAlarm } from './email.js';
import { stuurWebPushAlarm } from './webpush.js';
import { telefoonAlarmAan, pushAlarmAan, mailAlarmAan } from '../alarmSchakelaars.js'; // 2026-09-03
import { verversMedia } from '../mediaHistorie.js';
import { metHistorie } from '../historie.js';

const LIJST_URL = 'https://api.meteogate.eu/warnings/collections/warnings/locations/NL';
const TAAL = 'nl-NL';

const ERNST_PER_SEVERITY = { Extreme: 'kritiek', Severe: 'waarschuwing', Moderate: 'let-op', Minor: 'info' };
// Puur voor leesbare weergave (los van de interne ernst-indeling hierboven,
// die de kleur/opacity in de app stuurt) — CAP-severity is Engelstalig.
const SEVERITY_NL = { Extreme: 'Extreem', Severe: 'Ernstig', Moderate: 'Matig', Minor: 'Licht' };
const KLEUR_NL = { Yellow: 'Geel', Orange: 'Oranje', Red: 'Rood', Green: 'Groen' };
const hoogsteKleurPerSleutel = new Map(); // 2026-09-04: fenomeen|gebied -> hoogste kleur ooit gezien (voor detail.afgeschaaldVan)

const FENOMEEN_NL = {
  wind: 'wind',
  rain: 'regen',
  'rain-flood': 'regen en overstroming',
  'snow-ice': 'sneeuw/ijzel',
  snow: 'sneeuw',
  ice: 'ijzel',
  thunderstorm: 'onweer',
  fog: 'mist',
  'high-temperature': 'hitte',
  'low-temperature': 'kou',
  'coastal-event': 'kustweer',
  'forest-fire': 'bosbrand',
  avalanches: 'lawinegevaar',
  flooding: 'overstroming',
  flood: 'overstroming',
};
// 2026-08-26-fix, op melding van Lex ("Het is matig onweer ipv matige" --
// een weeralarm-popup toonde "Matige onweer"): het ernst-woord kreeg tot nu
// toe ALTIJD een -e (matige/lichte/ernstige/extreme), maar dat is voor een
// "het"-woord als "onweer" (het onweer) grammaticaal fout zonder lidwoord
// ervoor -- vergelijk "zwaar onweer"/"goed nieuws"/"warm water", niet "zware
// onweer". Voor een "de"-woord (de wind, de regen, ...) hoort de -e er wel
// gewoon bij ("matige wind"). Twee vormen per ernst-niveau, en een setje met
// de FENOMEEN_NL-sleutels die "het"-woorden zijn (onweer, kustweer/weer,
// lawinegevaar/gevaar) om de juiste vorm te kiezen.
const ERNSTWOORD_NL = { Extreme: 'extreme', Severe: 'ernstige', Moderate: 'matige', Minor: 'lichte' };
const ERNSTWOORD_NL_HET = { Extreme: 'extreem', Severe: 'ernstig', Moderate: 'matig', Minor: 'licht' };
const HET_WOORD_FENOMENEN = new Set(['thunderstorm', 'coastal-event', 'avalanches']);

function formatDatum(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// info.event is bij de "geen waarschuwingen"-placeholders (en vermoedelijk
// bij minder courante talen) "{severity-woord} {fenomeen} warning" in het
// Engels (bijv. "Minor wind warning") — maar bleek 2026-08-19 live tegen een
// écht actieve waarschuwing juist al kant-en-klaar Nederlands te zijn (bijv.
// "Matige wind waarschuwing"), dankzij de language=nl-NL-parameter. Onze
// eigen vertaalslag toepassen op tekst die al Nederlands is, gaf een
// dubbel ernst-woord ("Matige Matige wind"). Daarom: alleen zelf vertalen
// als het herkenbare Engelse "{severity} ... warning"-patroon matcht (de
// FENOMEEN_NL-lookup slaagt) — matcht het niet, dan is de tekst
// vermoedelijk al Nederlands (of onbekend formaat) en tonen we 'm ongewijzigd
// i.p.v. er zelf nog een ernst-woord voor te plakken.
function vertaalEvent(event, severity) {
  if (!event) return null;
  let rest = event.trim();
  for (const sw of ['extreme', 'severe', 'moderate', 'minor']) {
    const re = new RegExp(`^${sw}\\s+`, 'i');
    if (re.test(rest)) {
      rest = rest.replace(re, '');
      break;
    }
  }
  rest = rest.replace(/\s+(warning|watch|alert)$/i, '');
  const sleutel = rest.toLowerCase().trim().replace(/\s*\/\s*/g, '-').replace(/\s+/g, '-');
  const fenomeenNl = FENOMEEN_NL[sleutel];

  if (fenomeenNl) {
    const ernstWoord = (HET_WOORD_FENOMENEN.has(sleutel) ? ERNSTWOORD_NL_HET : ERNSTWOORD_NL)[severity];
    const tekst = ernstWoord ? `${ernstWoord} ${fenomeenNl}` : fenomeenNl;
    return tekst.charAt(0).toUpperCase() + tekst.slice(1);
  }

  // Niet herkend als het Engelse format — vermoedelijk al Nederlands, dus
  // geen eigen ernst-woord ervoor plakken (dat zou dubbelop worden).
  const eigenTekst = event.trim();
  return eigenTekst.charAt(0).toUpperCase() + eigenTekst.slice(1);
}

// 2026-08-19: live tegen echte data ontdekt — KNMI verstuurt via deze API
// blijkbaar per provincie een routinematig "niets te melden"-bericht (12x
// per keer, altijd severity Minor, geldigheid dagen vooruit), herkenbaar
// aan headline/description die letterlijk "Geen waarschuwingen" zegt (bijv.
// "Windstoten - Geen waarschuwingen voor Limburg - Nederland"). Dat is geen
// waarschuwing maar een "feed leeft, niets gevonden"-bevestiging — precies
// het soort ruis dat de app elders ook al wegfiltert (GDACS Green, USGS
// <4.5). Content-check i.p.v. op severity filteren, want "Minor" op zich is
// ook een geldige ernst voor een echte kleine waarschuwing elders in Europa.
function isPlaceholderZonderWaarschuwing(info) {
  return /geen\s+waarschuwing/i.test(info.headline ?? '') || /geen\s+waarschuwing/i.test(info.description ?? '');
}

// Het KNMI-achtige geel/oranje/rood-niveau staat in CAP niet als los veld,
// maar als een cap:parameter met valueName "awareness_level" en een waarde
// als "2; Yellow; Moderate" (MeteoAlarm's eigen CAP-profiel). We zoeken hier
// bewust met een regex over alle parameters heen i.p.v. op een vaste
// key/positie te vertrouwen — robuuster tegen kleine structuurverschillen.
function haalKleur(parameters) {
  if (!Array.isArray(parameters)) return null;
  const tekst = parameters.map((p) => `${p.valueName ?? p.name ?? ''} ${p.value ?? ''}`).join(' ');
  const m = tekst.match(/\b(Yellow|Orange|Red|Green)\b/i);
  if (!m) return null;
  const woord = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
  return KLEUR_NL[woord] ?? null;
}

function ringenAlsLatLon(geometry) {
  if (!geometry) return [];
  const ringen =
    geometry.type === 'Polygon'
      ? [geometry.coordinates[0]]
      : geometry.type === 'MultiPolygon'
        ? geometry.coordinates.map((polygon) => polygon[0])
        : [];
  return ringen.map((ring) => ring.map(([lon, lat]) => [lat, lon]));
}

// Haalt uit een respons-body (vorm nog niet live bevestigd, zie
// haalPreciezeOmtrek() hieronder) één GeoJSON-geometry-object, ongeacht of
// de API een kale geometry, een Feature, of een FeatureCollection teruggeeft
// — de drie gangbare varianten voor zo'n "geometry"-downloadlink. Bij een
// FeatureCollection met meerdere features (bijv. een gebied met een gat, of
// meerdere losse delen) worden alle Polygon/MultiPolygon-geometrieën
// samengevoegd tot één MultiPolygon, zodat ringenAlsLatLon() ze allemaal
// tekent i.p.v. alleen de eerste.
function geometrieUitAntwoord(body) {
  if (!body) return null;
  if (body.type === 'Polygon' || body.type === 'MultiPolygon') return body;
  if (body.type === 'Feature') return body.geometry ?? null;
  if (body.type === 'FeatureCollection') {
    const geometrieen = (body.features ?? []).map((f) => f.geometry).filter(Boolean);
    if (!geometrieen.length) return null;
    if (geometrieen.length === 1) return geometrieen[0];
    const coords = geometrieen.flatMap((g) =>
      g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [],
    );
    return coords.length ? { type: 'MultiPolygon', coordinates: coords } : null;
  }
  // Onbekende vorm — laatste redmiddel: misschien staat de geometry gewoon
  // los op de body (net als bij een Feature), anders geven we op.
  return body.geometry ?? null;
}

let preciezeOmtrekVoorbeeldenGelogd = 0;

// Haalt de precieze polygon-omtrek op via de signed "geometry"-link die de
// API per polygon-type feature meestuurt (feature.links, rel: "geometry") —
// feature.geometry zelf is bij featureType "polygon" alleen een grove
// bounding box, deze link geeft (naar verwachting) de echte omtrek terug.
// Bewust met een eigen try/catch die nooit gooit: bij elke hobbel (link
// ontbreekt, verlopen, onverwachte vorm, netwerkfout) geeft deze functie
// gewoon null terug — de aanroeper valt dan terug op de bbox. Een grove
// omtrek tonen is beter dan een hele melding laten mislukken op een
// kapotte extra download.
async function haalPreciezeOmtrek(feature) {
  const link = feature.links?.find((l) => l.rel === 'geometry');
  if (!link?.href) return null;
  try {
    const res = await fetch(link.href);
    if (!res.ok) {
      console.warn(`[weer] meteoalarm: precieze-geometrielink gaf status ${res.status}, val terug op bbox`);
      return null;
    }
    const body = await res.json();

    if (preciezeOmtrekVoorbeeldenGelogd < 3) {
      preciezeOmtrekVoorbeeldenGelogd++;
      console.log(
        `[weer] meteoalarm: voorbeeld precieze geometrie ${preciezeOmtrekVoorbeeldenGelogd}: ${JSON.stringify(body).slice(0, 500)}`,
      );
    }

    const geometry = geometrieUitAntwoord(body);
    const ringen = ringenAlsLatLon(geometry);
    return ringen.length ? ringen : null;
  } catch (err) {
    console.error('[weer] meteoalarm: kon precieze geometrie niet ophalen, val terug op bbox:', err.message ?? err);
    return null;
  }
}

function centroid(ringenLatLon) {
  const punten = ringenLatLon.flat();
  if (!punten.length) return [null, null];
  const lat = punten.reduce((som, p) => som + p[0], 0) / punten.length;
  const lon = punten.reduce((som, p) => som + p[1], 0) / punten.length;
  return [lat, lon];
}

// 2026-08-22, op verzoek van Lex (na de community-media-audit van de andere
// bronnen — "hoe zit het daar met de media, daar heb ik je niet over
// gehoord"): meteoalarm.js had nog helemaal geen community-media, in
// tegenstelling tot aardbeving/orkaan/tornado/overstroming/vulkaan. Twee
// dingen op zijn verzoek:
// 1) Drempel op Oranje/Rood — zelfde grens als de Pushover/mail/webpush-
//    alarmen verderop in dit bestand (kleur === 'Rood' || kleur ===
//    'Oranje'): bij Geel is een zoekopdracht vrijwel altijd te licht/lokaal
//    voor nieuwsdekking, en zou het de drie gratis publieke API's onnodig
//    belasten voor elke gele windwaarschuwing.
// 2) Zoekterm MET gebied ("weeralarm zal ook op regio een zoekterm moeten
//    hebben denk ik. Boom gevallen in Emmen na zomerstorm wil je bijv.
//    vangen") — combineert het vertaalde fenomeen (bijv. "ernstige wind")
//    met de gebiedsnaam (areaDesc). MeteoGate geeft alleen provincieniveau
//    terug (geen gemeente "Emmen" zelf), maar "ernstige wind Drenthe" als
//    zoekterm laat de volletekst-zoekmachine (searxng.js) een gemeente-
//    specifiek bericht als "boom gevallen in Emmen" daar prima nog binnen
//    vinden.
function mediaZoekterm(fenomeenTekst, gebied) {
  if (!gebied || !fenomeenTekst) return null;
  return `${fenomeenTekst} ${gebied}`.trim();
}

async function communityMediaVoor(id, fenomeenTekst, gebied, kleur, ontstaanIso) {
  if (kleur !== 'Rood' && kleur !== 'Oranje') return [];
  const zoekterm = mediaZoekterm(fenomeenTekst, gebied);
  if (!zoekterm) return [];
  return verversMedia({ id, zoekterm, ontstaanIso });
}

let voorbeeldenGelogd = 0;

async function haalWaarschuwingDetail(feature) {
  const link = feature.links?.find((l) => l.rel === 'json');
  if (!link) return null;
  const res = await fetch(link.href);
  if (!res.ok) return null;
  const body = await res.json();

  if (voorbeeldenGelogd < 3) {
    voorbeeldenGelogd++;
    console.log(`[weer] meteoalarm: voorbeelddetail ${voorbeeldenGelogd}: ${JSON.stringify(body).slice(0, 500)}`);
  }

  const infos = Array.isArray(body.info) ? body.info : body.info ? [body.info] : [];
  const info = infos.find((i) => (i.language ?? '').toLowerCase().startsWith('nl')) ?? infos[0] ?? null;
  return { body, info };
}

async function haalLijstOp(vanIso, totIso, apiKey) {
  const url = `${LIJST_URL}?language=${TAAL}&datetime=${encodeURIComponent(`${vanIso}/${totIso}`)}`;
  const res = await fetch(url, { headers: { apikey: apiKey } });
  if (res.status === 204) return []; // geldige query, gewoon niets verstuurd in dit venster
  if (!res.ok) throw new Error(`Meteoalarm (MeteoGate) lijst gaf status ${res.status}`);
  const body = await res.json();
  return body.features ?? [];
}

export async function fetchMeteoalarm({ meteogateApiKey } = {}) {
  if (!meteogateApiKey) {
    // Bewust een duidelijke fout i.p.v. stil niets doen — laat deze bron in
    // Instellingen als "haperend" zien met een uitlegbare reden, i.p.v. een
    // silent lege lijst die op "geen actieve waarschuwingen" lijkt.
    throw new Error('METEOGATE_API_KEY ontbreekt in .env — vraag een gratis sleutel aan via devportal.meteogate.eu');
  }

  const nu = new Date();
  const eenDagMs = 24 * 60 * 60 * 1000;
  // De API filtert op verzendmoment ("sent") en staat maximaal net-onder-24u
  // per venster toe. Twee opeenvolgende vensters (~48u) dekken ook een
  // waarschuwing die gisteren is verstuurd maar nog loopt — al verlopen
  // waarschuwingen worden hierna alsnog weggefilterd op de echte
  // expires-tijd uit het detailbestand, dus een breder venster dan strikt
  // "vandaag" is hier geen probleem, alleen een kleine marge.
  const vensters = [
    [new Date(nu.getTime() - eenDagMs), nu],
    [new Date(nu.getTime() - 2 * eenDagMs), new Date(nu.getTime() - eenDagMs)],
  ];

  const featuresPerVenster = await Promise.all(
    vensters.map(([van, tot]) => haalLijstOp(van.toISOString(), tot.toISOString(), meteogateApiKey)),
  );
  const features = featuresPerVenster.flat();

  const detailPerAlertId = new Map();
  const signalen = [];
  // 2026-08-19: Lex zag exact dubbele meldingen (zelfde titel/subtitel/tijd)
  // — bleek te komen doordat de signaal-id per GeoJSON-feature werd opgebouwd
  // (feature.id/OBJECTID), terwijl hetzelfde alertId soms via meerdere
  // features tegelijk binnenkomt (bijv. via de twee overlappende tijdvensters
  // hierboven, of een los geocode- én polygon-feature voor dezelfde
  // waarschuwing). detailPerAlertId dedupte het ophalen van het detailbestand
  // al wel per alertId, maar niet het uiteindelijke signaal — dat gebeurt nu
  // hier alsnog, zodat elk alertId maximaal één keer in de lijst verschijnt.
  const alertIdsGetoond = new Set();

  for (const feature of features) {
    try {
      const alertId = feature.properties?.alertId;
      if (!alertId) continue;
      if (alertIdsGetoond.has(alertId)) continue;
      alertIdsGetoond.add(alertId);

      if (!detailPerAlertId.has(alertId)) {
        detailPerAlertId.set(alertId, await haalWaarschuwingDetail(feature));
      }
      const detail = detailPerAlertId.get(alertId);
      if (!detail?.info) continue;

      const { info, body } = detail;
      if (isPlaceholderZonderWaarschuwing(info)) continue; // "geen waarschuwingen"-bevestiging, geen echte melding
      const expires = info.expires;
      if (!expires || new Date(expires).getTime() <= nu.getTime()) continue; // al verlopen, overslaan

      const areaDesc = info.area?.[0]?.areaDesc ?? 'Nederland';
      const event = info.event ?? 'Weerwaarschuwing';
      const severity = info.severity;
      const onset = info.onset ?? info.effective;
      const kleur = haalKleur(info.parameter);
      // 2026-08-22: één keer berekend en hergebruikt in zowel de titel als
      // detail.fenomeenTekst hieronder — dat laatste heeft de re-search-pas
      // ná metHistorie() straks nodig om de zoekterm van een inmiddels
      // "verlopen" (uit de live-lijst verdwenen) waarschuwing opnieuw op te
      // kunnen bouwen, zonder de titel-string te moeten terugparsen.
      const fenomeenTekst = vertaalEvent(event, severity) ?? event;
      const geldigVan = formatDatum(onset);
      const geldigTotTekst = formatDatum(expires);
      // 2026-08-19: het niveau ("Geel niveau") stond hier én, sinds Lex' wens,
      // ook al als [GEEL] in de titel — op zijn verzoek hier weggehaald zodat
      // het niet meer dubbelop is. Alleen als er geen kleur bekend is (kleur
      // === null) valt dit terug op de generieke severity-tekst, zodat er nog
      // altijd iets van een niveau-indicatie staat.
      const subtitelDelen = [
        !kleur ? (SEVERITY_NL[severity] ?? null) : null,
        geldigVan && geldigTotTekst ? `geldig ${geldigVan} – ${geldigTotTekst}` : geldigTotTekst ? `geldig tot ${geldigTotTekst}` : null,
      ].filter(Boolean);

      // "geocode" = kleine regio/stad, puntmarkering (Lex' gevarendriehoek) —
      // bewust geen polygon meesturen. "polygon" = grotere regio: eerst de
      // precieze omtrek proberen (haalPreciezeOmtrek, 2026-08-23), en alleen
      // bij het uitblijven daarvan terugvallen op de meegeleverde bbox.
      // 2026-08-30, op verzoek van Lex ("als het wordt meegestuurd wordt het
      // getoond"): ook geocode-features krijgen nu een omtrek als de API er
      // een meelevert — eerst de precieze geometrielink proberen (als die er
      // is), anders de meegeleverde geometry/bbox. Alleen zonder enige
      // geometrie blijft het een kale pin. featureType wordt nog wel
      // meegegeven in detail (voor het onderscheid in de app).
      const bboxRingen = ringenAlsLatLon(feature.geometry);
      const preciezeRingen = await haalPreciezeOmtrek(feature);
      const gebiedPolygon = preciezeRingen ?? bboxRingen;
      const omtrekBron = preciezeRingen ? 'precies' : bboxRingen.length ? 'bbox' : null;
      const [bboxLat, bboxLon] = centroid(bboxRingen);

      const signaalId = `meteoalarm-${feature.id ?? feature.properties?.OBJECTID ?? alertId}`;

      const signaal = makeSignal({
        id: signaalId,
        categorie: 'weerwaarschuwing',
        // 2026-08-19: de [GEEL]/[ORANJE]/[ROOD]-tag stond hier eerst letterlijk
        // in de titel, maar op Lex' verzoek ("de pil!") vervangen door een
        // los gekleurd pilletje in de frontend (zie maakMeldingItem() in
        // app.js) — kleur staat gewoon in detail.kleur hieronder, titel blijft
        // nu kort.
        titel: `Weeralarm - ${fenomeenTekst} - ${areaDesc}`,
        ernst: ERNST_PER_SEVERITY[severity] ?? 'let-op',
        lat: bboxLat,
        lon: bboxLon,
        tijd: body.sent ?? onset ?? new Date().toISOString(),
        detail: {
          gebied: areaDesc,
          fenomeenTekst,
          severity: severity ?? null,
          kleur,
          certainty: info.certainty ?? null,
          urgency: info.urgency ?? null,
          geldigVan: onset,
          geldigTot: expires,
          featureType: feature.properties?.featureType ?? null,
          // 2026-08-30: CAP-identiteit + wat dit bericht vervangt (zie de
          // ontdubbeling ná de loop) — alertId is de API-sleutel, identifier
          // de CAP-eigen; references verwijst naar één van beide.
          alertId: alertId ?? null,
          capIdentifier: body.identifier ?? null,
          capMsgType: body.msgType ?? null,
          capReferences: body.references ?? null,
          gebiedPolygon: gebiedPolygon.length ? gebiedPolygon : null,
          // 2026-08-23: 'precies' (signed geometrielink gelukt), 'bbox'
          // (teruggevallen op de grove rechthoek) of null (geocode-type,
          // geen polygon van toepassing) — zie haalPreciezeOmtrek().
          omtrekBron,
          subtitel: subtitelDelen.length ? subtitelDelen.join(' · ') : null,
          bronUrl: 'https://meteoalarm.org/',
          communityMedia: await communityMediaVoor(signaalId, fenomeenTekst, areaDesc, kleur, body.sent ?? onset),
        },
      });

      // 2026-08-19: op verzoek van Lex — bij code oranje/rood ook een
      // Pushover-alarm (zie pushover.js), ook als de app niet openstaat.
      // Rood is acuut (emergency-prioriteit, blijft herhalen), oranje is
      // minder acuut (high-prioriteit, geen herhaling). Geel/onbekende kleur
      // stuurt bewust geen alarm — dat zou al snel te vaak afgaan.
      //
      // 2026-08-20: bericht is nu kaartTekst(signaal) i.p.v. een eigen losse
      // samenstelling — op Lex' verzoek ("kaart is leidend") komt de tekst nu
      // overeen met de kaart-popup (titel + detail.subtitel), in plaats van
      // een net ietsje andere eigen tekst hier.
      if ((kleur === 'Rood' || kleur === 'Oranje') && telefoonAlarmAan('weerwaarschuwing')) { // 2026-09-03: schakelbaar
        const titel = `Code ${kleur}`;
        const bericht = kaartTekst(signaal);
        if (pushAlarmAan('weerwaarschuwing')) stuurAlarm({ id: signaalId, titel, bericht, prioriteit: kleur === 'Rood' ? 2 : 1 });
        // 2026-08-20: mail-alarm (zie email.js) ernaast, zelfde tekst/trigger,
        // los aan/uit-schakelbaar en met een eigen dedup — zie nws.js voor
        // dezelfde toevoeging bij tornado warning/watch. lat/lon/
        // gebiedPolygon erbij op verzoek van Lex ("kaartje met de boundary
        // in de mail") — zie kaartUrlVoor() in email.js.
        if (mailAlarmAan('weerwaarschuwing')) stuurMailAlarm({
          id: signaalId,
          titel,
          bericht,
          lat: signaal.lat,
          lon: signaal.lon,
          gebiedPolygon: signaal.detail?.gebiedPolygon,
        });
        // 2026-08-22: derde, rustige (niet-herhalende) alarmkanaal naast
        // Pushover/mail hierboven — zie webpush.js voor de aanleiding.
        // lat/lon/gebiedPolygon erbij (2026-08-22, tweede toevoeging) zodat
        // de melding zelf ook het kaartje kan tonen, zelfde bron als de mail.
        // url erbij (2026-08-22, derde toevoeging, na Lex' "klikken opent wel
        // de app maar niet de melding zelf") — /?signaal=<id> laat app.js bij
        // het laden de kaart op precies dit signaal centreren, zie verversen().
        if (pushAlarmAan('weerwaarschuwing')) stuurWebPushAlarm({
          id: signaalId,
          titel,
          bericht,
          url: `/?signaal=${encodeURIComponent(signaalId)}`,
          lat: signaal.lat,
          lon: signaal.lon,
          gebiedPolygon: signaal.detail?.gebiedPolygon,
        });
      }

      signalen.push(signaal);
    } catch (err) {
      console.error('[weer] kon een Meteoalarm(MeteoGate)-feature niet verwerken:', err.message ?? err);
    }
  }

  // 2026-08-22: historie (zie historie.js), zelfde reden/patroon als bij
  // nws.js/iemLsr.js. Zonder dit verdwijnt een weeralarm bij het passeren
  // van `expires` in één klap uit de lijst (zie het filter bovenaan de
  // loop) — maar schade-berichten ("boom gevallen in Emmen") verschijnen
  // vaak juist pas ná afloop van de officiële waarschuwing. NA de alarm-lus
  // hierboven, om dezelfde reden als bij nws.js: Pushover/mail/webpush
  // mogen nooit op een teruggehaald "verlopen"-signaal reageren.
  // 2026-08-30, tweede ronde (Lex: "ik heb nog steeds 2 meldingen
  // Zierikzee en Rottum"): de eerste aanname (oude versie zit in de
  // historie als 'verlopen') klopte niet — de API filtert op `sent` binnen
  // ~48u en geeft het OUDE bericht gewoon nog als feature terug zolang zijn
  // eigen `expires` niet verstreken is. Oud én update zijn dus allebei
  // ACTIEF, met een verschillend alertId, en glippen zo langs de
  // alertId-dedupe. Twee vangnetten: (1) CAP-`references` — een Update/
  // Cancel-bericht noemt de identifier(s) die het vervangt ("zender,
  // identifier,sent" gescheiden door spaties): die voorgangers vervallen;
  // (2) blijft er daarna nog meer dan één actief signaal over voor hetzelfde
  // fenomeen in hetzelfde gebied, dan wint de laatst verstuurde.
  const vervangen = new Set();
  signalen.forEach((s) => {
    const refs = s.detail?.capReferences;
    if (typeof refs !== 'string') return;
    refs.split(/\s+/).forEach((ref) => {
      const delen = ref.split(',');
      if (delen.length >= 2 && delen[1]) vervangen.add(delen[1]);
    });
  });
  const zonderVoorgangers = signalen.filter((s) => !vervangen.has(s.detail?.capIdentifier) && !vervangen.has(s.detail?.alertId));
  const nieuwstePerSleutel = new Map();
  zonderVoorgangers.forEach((s) => {
    const sleutel = `${s.detail?.fenomeenTekst}|${s.detail?.gebied}`;
    const bestaand = nieuwstePerSleutel.get(sleutel);
    if (!bestaand || new Date(s.tijd ?? 0) > new Date(bestaand.tijd ?? 0)) nieuwstePerSleutel.set(sleutel, s);
  });
  const ontdubbeld = zonderVoorgangers.filter((s) => nieuwstePerSleutel.get(`${s.detail?.fenomeenTekst}|${s.detail?.gebied}`) === s);
  // 2026-09-04, op melding van Lex ("hoe kan het dat ik die zware wind
  // ineens niet meer zie"): KNMI schaalde een code oranje via een Update af
  // naar geel, en de oranje versie verdween hier stilletjes als "vervangen".
  // Lex wil dat zien ("is wel leuk"): de winnende versie krijgt
  // detail.afgeschaaldVan = de hoogste kleur die een weggelaten voorganger
  // voor hetzelfde fenomeen+gebied had, als die hoger is dan de huidige.
  // Voorgangers blijven ~48u in de feed (sent-venster), daarna houdt de
  // in-memory hoogsteKleurPerSleutel het nog vast tot een herstart.
  const KLEUR_RANG = { Groen: 0, Geel: 1, Oranje: 2, Rood: 3 };
  signalen.forEach((s) => {
    const sleutel = `${s.detail?.fenomeenTekst}|${s.detail?.gebied}`;
    const rang = KLEUR_RANG[s.detail?.kleur] ?? -1;
    if (rang > (KLEUR_RANG[hoogsteKleurPerSleutel.get(sleutel)] ?? -1)) hoogsteKleurPerSleutel.set(sleutel, s.detail.kleur);
  });
  ontdubbeld.forEach((s) => {
    const hoogste = hoogsteKleurPerSleutel.get(`${s.detail?.fenomeenTekst}|${s.detail?.gebied}`);
    if (hoogste && (KLEUR_RANG[hoogste] ?? -1) > (KLEUR_RANG[s.detail?.kleur] ?? -1)) s.detail.afgeschaaldVan = hoogste;
  });
  if (ontdubbeld.length !== signalen.length) {
    console.log(`[weer] meteoalarm: ${signalen.length - ontdubbeld.length} vervangen/oudere versie(s) van een bijgewerkt alarm weggelaten`);
  }

  const metVerlopen = metHistorie('meteoalarm', ontdubbeld);

  // 2026-08-30, op melding van Lex ("we hebben soms updated meldingen, de
  // oudere staat er nog bij"): een bijgewerkt weeralarm komt van KNMI/
  // Meteoalarm als NIEUW CAP-bericht (nieuw alertId, msgType "Update"), en
  // het oude verdwijnt uit de API — waarna de historie dat oude netjes 48
  // uur als "verlopen" (grijs) liet staan, pal onder de nieuwe. Dat was geen
  // bewuste keuze, puur een bijwerking van de historie-laag. Nu: een
  // verlopen signaal vervalt zodra er een ACTIEF signaal is voor hetzelfde
  // fenomeen in hetzelfde gebied (de update vervangt de oude versie); een
  // echt afgelopen alarm (geen opvolger) blijft gewoon in de historie.
  const actieveSleutels = new Set(
    metVerlopen.filter((s) => !s.detail?.verlopen).map((s) => `${s.detail?.fenomeenTekst}|${s.detail?.gebied}`),
  );
  const totaal = metVerlopen.filter((s) => !s.detail?.verlopen || !actieveSleutels.has(`${s.detail?.fenomeenTekst}|${s.detail?.gebied}`));

  // 2026-08-22: verlopen signalen hierboven kregen geen nieuwe
  // communityMediaVoor()-aanroep (die liep alleen over de live `features`) —
  // zonder deze aparte pas zou een inmiddels verlopen weeralarm nooit meer
  // nieuw materiaal krijgen. Zelfde opbouw als in de hoofd-loop: fenomeenTekst
  // + gebied uit het bevroren signaal (zie detail.fenomeenTekst hierboven),
  // en dezelfde Oranje/Rood-drempel.
  await Promise.all(
    totaal
      .filter((s) => s.detail?.verlopen && (s.detail?.kleur === 'Rood' || s.detail?.kleur === 'Oranje'))
      .map(async (s) => {
        const zoekterm = mediaZoekterm(s.detail?.fenomeenTekst, s.detail?.gebied);
        if (!zoekterm) return;
        s.detail.communityMedia = await verversMedia({ id: s.id, zoekterm, ontstaanIso: s.tijd });
      })
  );

  return totaal;
}
