// Simpele, dependency-loze frontend: haalt /api/signals en /api/status op
// en rendert de Storm Noir-schil ermee. Geen framework — makkelijk uit te
// breiden zodra er meer bronnen echt geïmplementeerd zijn.
//
// UI-structuur: vaste bottom-nav met 4 tabbladen (Kaart / Meldingen / Hemel /
// Instellingen) i.p.v. een scrollende ticker + horizontale sleepbalk. Een
// melding aantikken in de Meldingen-lijst centreert de kaart erop en opent
// de popup van dat signaal.

const LOC_NAAM_EL = document.getElementById('locNaam');
const KLOK_EL = document.getElementById('klok');
const VERBINDING_EL = document.getElementById('verbinding');
const BIJGEWERKT_EL = document.getElementById('bijgewerkt');
const SKY_LIJST_EL = document.getElementById('skyLijst');
const HEMEL_LEEG_EL = document.getElementById('hemelLeeg');
const SKY_RUBRIEKEN_EL = document.getElementById('skyRubrieken');
const ERROR_EL = document.getElementById('errorBanner');
const HEADER_TEMP_EL = document.getElementById('headerTemp');
const WEATHER_CARD_EL = document.getElementById('weatherCard');
const WEER_CONDITIE_EL = document.getElementById('weerConditie');
const WEER_ICOON_EL = document.getElementById('weerIcoonWrap');
const STAT_ICOON_WIND_EL = document.getElementById('statIcoonWind');
const STAT_ICOON_STOTEN_EL = document.getElementById('statIcoonStoten');
const STAT_ICOON_VOCHT_EL = document.getElementById('statIcoonVocht');
const STAT_ICOON_DRUK_EL = document.getElementById('statIcoonDruk');
const STAT_ICOON_BEWOLKING_EL = document.getElementById('statIcoonBewolking');
const WEER_WIND_EL = document.getElementById('weerWind');
const WEER_STOTEN_EL = document.getElementById('weerStoten');
const WEER_VOCHT_EL = document.getElementById('weerVocht');
const WEER_DRUK_EL = document.getElementById('weerDruk');
const WEER_BEWOLKING_EL = document.getElementById('weerBewolking');
const STAT_KNMI_TEMP_EL = document.getElementById('statKnmiTemp');
const STAT_ICOON_KNMI_TEMP_EL = document.getElementById('statIcoonKnmiTemp');
const WEER_KNMI_TEMP_EL = document.getElementById('weerKnmiTemp');
const WEER_KNMI_STATION_EL = document.getElementById('weerKnmiStation');
const TOGGLE_DOPPLER_EL = document.getElementById('toggleDoppler');
const DOPPLER_PRODUCTEN_EL = document.getElementById('dopplerProducten');
const RADAR_SPEEL_EL = document.getElementById('radarSpeel');
const RADAR_TIJD_EL = document.getElementById('radarTijd');
const TOGGLE_SATELLIET_EL = document.getElementById('toggleSatelliet');
const TOGGLE_REGENRADAR_EL = document.getElementById('toggleRegenradar');
const TOGGLE_ZEE_EL = document.getElementById('toggleZee');
const TOGGLE_VLIEGRADAR_EL = document.getElementById('toggleVliegradar');
const TOGGLE_VAARRADAR_EL = document.getElementById('toggleVaarradar');
// 2026-08-22: vervangt TOGGLE_ISS_KAART_EL/TOGGLE_STARLINK_EL (die knoppen
// zijn weg, zie index.html) — één gedeelde Stop-knop voor kaartVolgType,
// zie startKaartVolgen()/stopKaartVolgen() verderop.
const KAART_VOLG_STOP_WRAP_EL = document.getElementById('kaartVolgStopWrap');
const KAART_VOLG_STOP_KNOP_EL = document.getElementById('kaartVolgStopKnop');
const KAART_VOLG_STOP_LABEL_EL = document.getElementById('kaartVolgStopLabel');
const LABEL_POPUP_OVERLAY_EL = document.getElementById('labelPopupOverlay');
const LABEL_POPUP_INHOUD_EL = document.getElementById('labelPopupInhoud');
const LABEL_POPUP_SLUITEN_EL = document.getElementById('labelPopupSluiten');
const LABEL_POPUP_KLEINER_EL = document.getElementById('labelPopupKleiner');
const LABEL_POPUP_GROTER_EL = document.getElementById('labelPopupGroter');
const MELDINGEN_LIJST_EL = document.getElementById('meldingenLijst');
const MELDINGEN_BADGE_EL = document.getElementById('meldingenBadge');
const INST_LOCATIE_EL = document.getElementById('instLocatie');
const ALARM_SECTIE_KNOP_EL = document.getElementById('alarmSectieKnop');
const ALARM_SECTIE_PIJL_EL = document.getElementById('alarmSectiePijl');
const ALARM_INSTELLINGEN_LIJST_EL = document.getElementById('alarmInstellingenLijst');
// 2026-08-22: Web Push-knop (zie backend/src/sources/webpush.js) — derde,
// rustige (niet-herhalende) alarmkanaal naast Pushover.
const MELDINGEN_KNOP_EL = document.getElementById('meldingenKnop');
const MELDINGEN_STATUS_EL = document.getElementById('meldingenStatus');
const BOTTOM_NAV_EL = document.getElementById('bottomNav');
const ZONMAAN_KAART_EL = document.getElementById('zonmaanKaart');
const ZM_OP_EL = document.getElementById('zmOp');
const ZM_ONDER_EL = document.getElementById('zmOnder');
const ZM_OP_ICOON_EL = document.getElementById('zmOpIcoon');
const ZM_ONDER_ICOON_EL = document.getElementById('zmOnderIcoon');
const ZM_STATUS_EL = document.getElementById('zmStatus');
const ZON_MARKER_EL = document.getElementById('zonMarker');
const ZON_MARKER_GLOED_EL = document.getElementById('zonMarkerGloed');
const ZM_MAAN_OP_EL = document.getElementById('zmMaanOp');
const ZM_MAAN_ONDER_EL = document.getElementById('zmMaanOnder');
const ZM_MAAN_OP_ICOON_EL = document.getElementById('zmMaanOpIcoon');
const ZM_MAAN_ONDER_ICOON_EL = document.getElementById('zmMaanOnderIcoon');
const ALARM_GLOED_EL = document.getElementById('alarmGloed');
const ALARM_POPUP_EL = document.getElementById('alarmPopup');
const ALARM_POPUP_ICOON_EL = document.getElementById('alarmPopupIcoon');
const ALARM_POPUP_TITEL_EL = document.getElementById('alarmPopupTitel');
const ALARM_POPUP_SUB_EL = document.getElementById('alarmPopupSub');
const ALARM_POPUP_BEKIJK_EL = document.getElementById('alarmPopupBekijk');
const ALARM_POPUP_SLUIT_EL = document.getElementById('alarmPopupSluit');

function updateKlok() {
  KLOK_EL.textContent = new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
}

function geledenTekst(ts) {
  if (!ts) return 'nog niet';
  const sec = Math.round((Date.now() - ts) / 1000);
  if (sec < 60) return `${sec}s geleden`;
  if (sec < 3600) return `${Math.round(sec / 60)} min geleden`;
  return `${Math.round(sec / 3600)} uur geleden`;
}

// 2026-08-20: Lex — "Bij Tornado bevestigd krijg ik dus geen enkel
// time/datestamp". Root cause: zowel popupHtml() als maakMeldingItem()
// (hieronder) toonden alleen een tijdsaanduiding als er GEEN detail.gebied/
// subtitel/land was (de "bron · X geleden"-terugval) — zodra die er wél was
// (zoals bij tornado-bevestigd, iemLsr.js: detail.gebied is altijd gezet)
// verscheen er dus nooit enige tijd. Bovendien was die terugval sowieso het
// verkeerde tijdstip: bron.bijgewerkt is het laatste poll-moment van de HELE
// bron, niet de eigen tijd van dít signaal. Elk signaal heeft z'n eigen
// event-tijd al (Signal.tijd, zie normalize.js) — deze helper toont die.
// Eerste versie gaf "2 uur geleden" (relatief, zelfde stijl als
// geledenTekst) — Lex wilde geen relatieve tekst maar een echte klok-/
// datumstamp ("ik zoek een stamp"): nu "14:23" als het vandaag is, anders
// "20 aug 14:23".
function tijdstempelTekst(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const tijd = d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  const vandaag = d.toDateString() === new Date().toDateString();
  if (vandaag) return tijd;
  const datum = d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
  return `${datum} ${tijd}`;
}

// 2026-08-25, op verzoek van Lex ("ik zie op de kaart een klok zonder datum
// ... ik hoef dan geen backend tijd te zien dat is verwarrend"): bij een
// NAVTEX-bericht zonder betrouwbare eigen datum (detail.datumOnbetrouwbaar,
// gezet in navtexLokaal.js/ukho.js) is s.tijd niet de echte berichttijd maar
// het eersteOntvangst()-fallback-moment -- het moment waarop de backend het
// bericht voor het eerst zag. tijdstempelTekst() daarop loslaten toont dan
// alsnog een keurig klokje ("vandaag" valt bijna altijd op het moment van
// eerste ontvangst), wat oogt als een betrouwbare berichttijd terwijl het dat
// niet is. Streepjes i.p.v. weglaten (Lex' eigen "of streepjes"-optie) -- zo
// blijft zichtbaar dat er een tijdveld hoort te zijn, alleen onbekend, net
// als de DATUM ONZEKER-pil elders al aangeeft.
function tijdregelVoorSignaal(s) {
  if (s.detail?.datumOnbetrouwbaar) return '—';
  return tijdstempelTekst(s.tijd);
}

// 2026-08-25, voor de NIEUW-pil (zie isNavtexNieuw()/maakMeldingItem
// hieronder): altijd datum + tijd tonen, in tegenstelling tot
// tijdstempelTekst() die de datum weglaat als het vandaag is — precies hier
// is dat niet gewenst, de pil moet zelf al zeggen WANNEER "nieuw" begon, ook
// al is dat vrijwel altijd vandaag (isNavtexNieuw() is toch al alleen waar
// voor tijdstippen van vandaag).
function nieuwSindsTekst(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const datum = d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
  const tijd = d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  return `${datum} ${tijd}`;
}

// 2026-08-26 -- deze badge stond hier sinds 25 aug te wachten op
// detail.versie/detail.aantalOntvangsten, die de backend nooit leverde (een
// half afgebouwd feature, geen bug die kapot ging -- zie
// ontvangstStatsVoorBericht() in navtexLokaal.js, waar die velden nu wel
// geleverd worden). Voor lokale ontvangst gaf deze functie daardoor altijd
// stilletjes `null` terug. Nu opgeknipt: dit stukje doet alleen nog de
// UKHO-bronvermelding (had de ontbrekende velden toch al niet nodig), de
// rest is verhuisd naar navtexNummerBadge() hieronder -- op Lex' eigen
// verzoek prominenter bovenaan het kaartje i.p.v. weggestopt in de
// sub-regel.
function navtexOntvangstBadge(s) {
  if (s.categorie !== 'navtex') return null;
  if (s.detail?.bron === 'ukho') return 'officiële bron (UKHO)';
  return null;
}

// 2026-08-26, op verzoek van Lex, na een gesprek over "hoe vaak is eenzelfde
// bericht al voorbij gekomen" en hoe zich dat verhoudt tot het eigen
// NAVTEX-volgnummer (de "45" in "PA45"). Kern van dat gesprek -- Lex zelf:
// "Ah joh, dus de PA## is de eigen iteratie!": het volgnummer in de code is
// al het STATION zijn eigen tel-mechanisme voor herhaalde uitzendingen van
// dezelfde waarschuwing, niet iets dat wij verzinnen. Onze eigen teller
// (detail.aantalOntvangsten, zie ontvangstStatsVoorBericht() in
// navtexLokaal.js) meet iets net anders: hoe vaak WIJ die uitzendingen
// daadwerkelijk hebben opgevangen (kan minder zijn dan het station zond, bij
// gemiste ontvangst). Lex' beslissing: geen aparte badges voor die twee,
// gewoon combineren op één regel: "PA45 · 8x".
//
// Bewust een eigen, prominente plek BOVENAAN het kaartje (zie
// maakMeldingItem hieronder) i.p.v. tussen de andere kleine pilletjes of in
// de sub-regel -- op Lex' verzoek: een ander kleurtje, iets groter, los van
// de ontvangen berichttekst zelf. Zie .navtex-nummerbadge in styles.css.
//
// Alleen bij lokale ontvangst (ATS Mini) -- UKHO-berichten hebben geen eigen
// PA##-achtig volgnummer en niets om te tellen, die tonen gewoon hun
// bestaande "officiële bron (UKHO)"-regel via navtexOntvangstBadge()
// hierboven, ongewijzigd.
function navtexNummerBadge(s) {
  if (s.categorie !== 'navtex' || s.detail?.bron === 'ukho') return null;
  const { code, aantalOntvangsten } = s.detail ?? {};
  if (!code || aantalOntvangsten == null) return null;
  return `${code} · ${aantalOntvangsten}x`;
}

// Alleen-datum-variant (geen klok) voor dingen die dagen tot maanden vooruit
// liggen, zoals de meteorenzwerm-aftelling op de Hemel-tab — "21 okt" zegt
// daar alles, "21 okt 02:00" suggereert een precisie die een zwermpiek
// (een hele nacht, en dan nog vaag) helemaal niet heeft. Het jaartal komt er
// alleen bij als de datum in een ánder kalenderjaar valt, anders wordt elke
// regel onnodig lang.
function datumKortTekst(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const anderJaar = d.getFullYear() !== new Date().getFullYear();
  return d.toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'short',
    ...(anderJaar ? { year: 'numeric' } : {}),
  });
}

// ---- Tabbladen (bottom-nav) -------------------------------------------
const VIEWS = ['kaart', 'meldingen', 'hemel', 'instellingen'];
let huidigeView = 'kaart';

function wisselView(naam) {
  huidigeView = naam;
  VIEWS.forEach((v) => {
    document.getElementById(`view${v[0].toUpperCase()}${v.slice(1)}`).classList.toggle('verborgen', v !== naam);
  });
  // 2026-08-24: body.kaart-actief stuurt de tablet-only fullscreen-kaart-CSS
  // aan (zie @media (min-width:768px) body.kaart-actief in styles.css) — de
  // HTML zelf begint al met deze class (Kaart is de standaard-tab), dus dit
  // hoeft alleen bij te blijven bij het wisselen van tab.
  document.body.classList.toggle('kaart-actief', naam === 'kaart');
  BOTTOM_NAV_EL.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.classList.toggle('actief', btn.dataset.view === naam);
  });
  // Leaflet tekent tegels verkeerd als de container display:none heeft gehad —
  // na terugschakelen naar de kaarttab de afmeting laten herberekenen.
  if (naam === 'kaart' && kaart) {
    setTimeout(() => kaart.invalidateSize(), 0);
  }
  // 2026-08-22: ISS-live-polling (zie zorgIssLivePolling() verderop) moet
  // stoppen zodra je van de Hemel-tab wegnavigeert — renderSky() zelf wordt
  // bij een tabwissel niet opnieuw aangeroepen (dit hele scherm blijft
  // gewoon, verborgen, in de DOM staan), dus zonder deze aanroep hier zou de
  // timer onnodig door blijven pollen terwijl niemand het kompas ziet.
  zorgIssLivePolling();
}

// 2026-08-19: Lex miste een snelle weg terug naar "zoals de app begint" — de
// Kaart-tab in de bottom-nav was er al, maar schakelde alleen van view en liet
// een verschoven/ingezoomde kaart en aanstaande extra's (Satelliet/Aarde nu)
// gewoon staan. Nu doet die tab, ook als je 'm indrukt terwijl je al op de
// kaart zit, ook meteen een volledige reset: kaart terug naar huis-locatie op
// startzoom, en de niet-standaard-aan lagen uit. Regenradar laten we bewust
// aan (die staat ook bij een verse app-start standaard aan).
function gaNaarStart() {
  wisselView('kaart');
  if (kaart) {
    kaart.setView([THUIS.homeLat, THUIS.homeLon], 6);
    dwingRegenradarZoomAf(); // zie definitie verderop in dit bestand — Home negeerde deze vloer tot nu toe
  }
  if (aardeActief) verbergAarde();
  if (satellietActief) toggleSatelliet();
  if (dopplerActief) toggleDoppler();
  // 2026-08-20, op verzoek van Lex ("Home moet altijd basiskaart tonen") —
  // Zee-modus (OpenSeaMap-laag + NAVTEX-gebiedsomtrekken, zie toggleZeeModus)
  // bleef tot nu toe gewoon aan staan als je vanuit die stand op Home tikte.
  // Die hoort net zo goed bij "niet de standaard basiskaart" als Aarde/
  // Satelliet/Doppler hierboven, dus zelfde behandeling. (De uitvergrote
  // kaartstand had hier vroeger ook een reset — die stand is op 2026-08-21
  // de permanente, enige weergave geworden, dus niks meer om te resetten.)
  if (zeeModusActief) toggleZeeModus();
  // 2026-08-21: Vliegradar/Vaarradar horen bij dezelfde "niet de standaard
  // basiskaart"-categorie. toggleZeeModus() hierboven zet vaarradarActief
  // zelf al uit als zeeModusActief actief was (zie toggleZeeModus), dus hier
  // alleen nog vliegModusActief nodig als vangnet voor het geval alleen dát
  // aanstond.
  if (vliegModusActief) toggleVliegradar();
  // 2026-08-22-bug, op verzoek van Lex ("de iss kaart komt soms weer zomaar
  // er tussendoor") — gaNaarStart() zette hierboven al Satelliet/Doppler/Zee/
  // Vlucht uit, maar wist niks van kaartVolgType: de kaart sprong wel terug
  // naar Home, maar de ISS/Starlink-tracking (incl. zijn eigen 6s-poll die de
  // kaart weer wegtrekt) bleef gewoon op de achtergrond doorlopen — vandaar
  // dat de ISS-marker een paar seconden later "vanzelf" weer terugkwam.
  // terugNaarHemel=false: gaNaarStart() navigeert zelf al naar Kaart, geen
  // dubbele/tegenstrijdige navigatie naar Hemel nodig.
  if (kaartVolgType) stopKaartVolgen(false);
  // 2026-08-20-bug: dopplerActief werd hierboven wel uitgezet (dus de laag zelf
  // verdween), maar de Doppler-knop bléék gewoon zichtbaar — die zichtbaarheid
  // wordt namelijk alleen bijgewerkt door toonDopplerKnopVoor(), wat alleen bij
  // het aantikken van een signaal gebeurt, niet bij "Home" (Lex: "Doppler
  // blijft staan nadat ik van tornado naar home ben gegaan"). Oud-Beijerland
  // heeft toch nooit een relevant Doppler-station (VS-only), dus hier gewoon
  // hetzelfde doen als toonDopplerKnopVoor() bij een niet-relevant signaal.
  TOGGLE_DOPPLER_EL.style.display = 'none';
  DOPPLER_PRODUCTEN_EL.style.display = 'none';
  dopplerSignaal = null;
  // 2026-08-20-bug: "Home" resette de kaart zelf wel, maar liet
  // geselecteerdGebiedId/geselecteerdComplexId staan — bij de eerstvolgende
  // 20-seconden-verversing (ververGeselecteerdGebied/-Flitsen) werd dan alsnog
  // teruggesprongen naar het laatst geopende signaal (Lex: "als ik naar Home
  // ben gegaan wordt er na een aantal seconden teruggesprongen naar de vorige
  // kaart"). Fix: bij het teruggaan naar start ook expliciet "ontvolgen".
  geselecteerdGebiedId = null;
  geselecteerdComplexId = null;
  // 2026-08-20: gebiedLaag hier niet meer clearen — sinds tekenAlleGebiedOmtrekken
  // (zie renderMap) toont de kaart toch altijd alle actieve gebied-omtrekken
  // tegelijk, ongeacht geselecteerdGebiedId (dat stuurt alleen nog het
  // automatisch meebewegen van de kaartweergave, zie ververGeselecteerdGebied).
  // Hier alsnog clearen zou de omtrekken alleen even laten verdwijnen tot de
  // eerstvolgende ververscyclus ze toch weer tekent — puur een flits, geen
  // functie meer, dus weg ermee (consistent met signaalLaag, die hier ook al
  // nooit werd gecleared).
  flitsenLaag?.clearLayers();
}

BOTTOM_NAV_EL.querySelectorAll('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.dataset.view === 'kaart') gaNaarStart();
    else wisselView(btn.dataset.view);
  });
});

// 2026-08-20: eerdere poging om de radar-controls-balk bij de grote kaart
// precies boven de bottom-nav te laten eindigen via een live DOM-meting van
// de nav-hoogte (--bottom-nav-hoogte) is losgelaten — die meting kwam bij
// Lex net te laag uit, waardoor de hele balk achter de bottom-nav wegzakte en
// niet meer klikbaar was ("ik ben de balk weer kwijt... kan dus ook niet meer
// terug naar klein"). Het probleem is nu bij de bron opgelost: .map-wrap
// reikt niet meer tot ónder de bottom-nav (zie #viewKaart in styles.css),
// dus .radar-controls heeft helemaal geen aparte hoogteberekening meer
// nodig.

// Wordt bij het opstarten één keer gevuld vanuit /api/config.
let THUIS = { homeLat: 52.0907, homeLon: 5.1214, homeLabel: '—' };

// Echte Leaflet-kaart met donkere CARTO-tegels (gratis, geen sleutel nodig) —
// vervangt de eerdere schematische plek-simulatie door een echte projectie.
let kaart = null;
let signaalLaag = null;
let flitsenLaag = null; // losse laag voor individuele bliksemflitsen van een aangetikt onweercomplex
let geselecteerdComplexId = null; // welk onweercomplex de flitsenlaag nu volgt, voor live meeverversen
let gebiedLaag = null; // losse laag voor de polygon-omtrek van een aangetikt gebied-signaal (tornado-watch, severe-outlook) én, sinds 2026-08-17, de NHC-voorspelde-koers (cone + lijn) van een orkaan
let geselecteerdGebiedId = null; // welk gebied-signaal de gebiedLaag nu volgt, voor live meeverversen
// 2026-08-20: zie de "zoomend dragend"-listener in initMap() — vlak vóór elke
// eigen (programmatische) fitBounds/setView/setZoom-aanroep op true gezet,
// zodat die listener het resulterende zoomend/dragend-event herkent als "dat
// waren wij zelf" i.p.v. een echte gebruikersactie.
let programmatischeKaartActie = false;

// Kleine wrapper i.p.v. de vlag overal los te zetten: voorkomt dat 'm per
// ongeluk "aan" blijft staan (en zo één latere, echte gebruikersactie ten
// onrechte negeert) als er toevallig géén zoomend/dragend-event volgt — bijv.
// omdat de kaart al precies op die plek/zoom stond. De setTimeout is een
// vangnet: ruim boven Leaflet's standaard-animatieduur (~250ms), dus zet 'm
// nooit te vroeg terug tijdens een animatie die nog bezig is.
function beweegKaartProgrammatisch(fn) {
  if (!kaart) return;
  programmatischeKaartActie = true;
  fn();
  setTimeout(() => {
    programmatischeKaartActie = false;
  }, 800);
}
let dopplerLaag = null; // optionele NEXRAD-Doppler-radarlaag (VS), alleen relevant bij tornado-gerelateerde meldingen
let dopplerActief = false;
let dopplerProduct = 'reflectiviteit'; // 'reflectiviteit' (landelijke mozaïek) | 'rotatie' (per-station Storm-Relative Velocity)
let dopplerSignaal = null; // huidig aangetikte signaal, nodig om het dichtstbijzijnde radarstation te bepalen bij 'rotatie'
let markersPerId = new Map(); // signal-id -> Leaflet marker, voor "centreer op melding"

const EMOJI_PER_CATEGORIE = {
  aardbeving: '🌋',
  orkaan: '🌀',
  // Vormingsgebied (nog geen naam/storm) — bewust een ander icoon dan 🌀,
  // zodat je op de kaart meteen ziet dat dit nog géén actieve orkaan is.
  cycloonvorming: '➰',
  onweer: '⚡',
  onweercomplex: '🌩️',
  tornado: '🌪',
  'tornado-watch': '🌪️',
  'tornado-bevestigd': '🌪',
  'severe-outlook': '⛈️',
  // 'severe-thunderstorm' hier weggehaald (2026-08-20, op verzoek van Lex,
  // "veeeeeels te veel") — de backend (nws.js) haalt dit event-type niet meer
  // op, dus zonder deze regel toont de "altijd alle categorieën"-lijst
  // hieronder ook geen eeuwig-lege rubriek meer voor iets dat nooit meer
  // binnenkomt. Zie backend/src/sources/nws.js om terug te zetten.
  overstroming: '🌊',
  natuurbrand: '🔥',
  vulkaan: '🗻',
  droogte: '🏜️',
  weerwaarschuwing: '⚠️',
  // Brandweer/politie/ambulance (P2000) + Lifeliner-traumahelikopters, 2026-08-19
  // — zie backend/src/sources/p2000.js en lifeliner.js.
  hulpdiensten: '🚨',
  // 2026-08-19: tsunami (VS-only via NWS, zie sources/nws.js) — geen apart
  // Unicode-symbool voor "tsunami" naast de gewone golf-emoji, dus zelfde
  // icoon als overstroming; onderscheid blijft duidelijk via titel/categorie-
  // label en de eigen randkleur.
  tsunami: '🌊',
  'tsunami-watch': '🌊',
  // 2026-08-20, op verzoek van Lex — maritieme NAVTEX-veiligheidsberichten
  // (zie backend/src/sources/navtex.js). Alleen op de kaart zichtbaar met
  // de "Zee"-modus aan (zie ZEE_MODUS_EL/toggleZeeModus hieronder).
  // 2026-08-20, vervolg: 📡 ("een schotel", aldus Lex) vervangen door 🛟
  // (reddingsboei) — past beter bij "maritiem veiligheidsbericht" dan een
  // schotelantenne.
  navtex: '🛟',
};

// 2026-08-19, op verzoek van Lex ("Moet toch Weeralarm gaan heten op de
// kaart?"): de rauwe categorie-sleutel ('weerwaarschuwing') verscheen
// letterlijk als titel op het gedimde "geen actieve meldingen"-kaartje
// (maakLegeMeldingItem hieronder) — geen nette weergavenaam. In één keer
// voor alle categorieën een leesbare Nederlandse naam toegevoegd i.p.v. een
// losse lap voor alleen dit ene geval. Let op: dit is de categorienaam, niet
// de bronnaam — Meteoalarm blijft gewoon "Meteoalarm" heten als bron.naam
// (zie config.js), precies zoals P2000 ook los staat van de categorienaam
// "Hulpdiensten".
const NAAM_PER_CATEGORIE = {
  aardbeving: 'Aardbeving',
  orkaan: 'Orkaan',
  cycloonvorming: 'Cycloonvorming',
  onweer: 'Onweer',
  onweercomplex: 'Onweercomplex',
  // 2026-08-19: 'Tornado' was even hernoemd naar 'Tornado gemeld' op Lex'
  // voorstel, om het te onderscheiden van 'Tornado (bevestigd)' hieronder.
  // 2026-08-20: op Lex' verzoek weer teruggezet naar de officiële NWS-
  // productnaam "Tornado Warning" (zelfde "laat officiële termen in het
  // Engels"-afspraak als Tornado Watch/Severe Outlook hieronder) — het
  // onderscheid met 'Tornado (bevestigd)' blijft ook zo duidelijk genoeg.
  tornado: 'Tornado Warning',
  // 2026-08-19: "Tornado Watch" en "Severe Outlook" zijn officiële NWS/SPC-
  // producttermen — Lex wil die als vaste vakterm in het Engels laten staan,
  // geen zelfverzonnen NL-vertaling (die had ik ongevraagd toegevoegd, is
  // teruggedraaid na feedback: "zo'n kut vertaling" / "ben Tornado Watch
  // kwijt"). tornado-bevestigd is geen officiële producttitel op zichzelf
  // (het is onze eigen categorie voor bevestigde IEM Local Storm Reports),
  // dus die hield ik wel vertaald — zeg het als dat ook terug moet.
  'tornado-watch': 'Tornado Watch',
  'tornado-bevestigd': 'Tornado (bevestigd)',
  'severe-outlook': 'Severe Outlook',
  // 'severe-thunderstorm' hier ook weggehaald, zie de toelichting bij
  // EMOJI_PER_CATEGORIE hierboven.
  overstroming: 'Overstroming',
  natuurbrand: 'Natuurbrand',
  vulkaan: 'Vulkaan',
  droogte: 'Droogte',
  weerwaarschuwing: 'Weeralarm',
  hulpdiensten: 'Hulpdiensten',
  // 2026-08-19: officiële NWS-producttermen, zelfde afspraak als Tornado
  // Watch/Severe Outlook hierboven — Engels laten staan, geen zelfverzonnen
  // NL-vertaling.
  tsunami: 'Tsunami Warning',
  'tsunami-watch': 'Tsunami Watch',
  navtex: 'NAVTEX',
};
// Categorieën met rijkere popup-inhoud (plaatjes/tekstblokken, zie
// popupExtraHtml) krijgen een bredere Leaflet-popup dan de standaard 240px.
const POPUP_BREED_CATEGORIEEN = new Set(['orkaan', 'aardbeving', 'cycloonvorming', 'navtex']);
// Categorieën waarbij de Doppler-radarknop (VS-specifiek, zie toggleDoppler)
// zinvolle context geeft — puur VS-tornado-gerelateerde signalen.
// ('severe-thunderstorm' stond hier ook even bij, weggehaald op 2026-08-20
// samen met de rest van die categorie, zie EMOJI_PER_CATEGORIE hierboven.)
const DOPPLER_CATEGORIEEN = new Set(['tornado', 'tornado-watch', 'tornado-bevestigd', 'severe-outlook']);
const ERNST_PRIORITEIT = { kritiek: 0, waarschuwing: 1, 'let-op': 2, info: 3 };

// Categorieën die al een eigen tab/kaart hebben (Hemel, het weerkaartje) en
// geen kaartlocatie hebben — die horen niet nogmaals in de Meldingen-lijst.
const MELDINGEN_CATEGORIEEN_UITGESLOTEN = new Set(['hemel', 'algemeen-weer']);

function initMap() {
  kaart = L.map('map', { attributionControl: true, zoomControl: true, maxZoom: 18 }).setView([THUIS.homeLat, THUIS.homeLon], 6);

  // Losse pane voor de wolkenfilm, boven de basiskaart-tiles maar onder de
  // markers — houdt de radarlaag ook onafhankelijk instelbaar (bijv. een
  // eigen CSS-filter) zonder de basiskaart te raken, mocht dat later nodig zijn.
  kaart.createPane('radarPane');
  kaart.getPane('radarPane').style.zIndex = 450;
  // Onder de neerslagradar (die moet er overheen blijven zichtbaar), maar
  // boven de kaarttegels zelf — zie satellietLaag hieronder.
  kaart.createPane('satellietPane');
  kaart.getPane('satellietPane').style.zIndex = 350;
  // 2026-08-20: eigen pane voor de OpenSeaMap-vaarwaterlaag (Zee-modus, zie
  // toggleZeeModus hieronder) — zonder eigen pane erft die de standaard
  // 'leaflet-tile-pane'-klasse en daarmee de donkere-modus-CSS-filter
  // hieronder (#map .leaflet-tile-pane), die de laag onherkenbaar/onzichtbaar
  // maakte. Zelfde aanpak als radarPane/satellietPane hierboven.
  kaart.createPane('zeePane');
  kaart.getPane('zeePane').style.zIndex = 340;

  // 2026-08-19: basiskaart-geschiedenis (kort) — CARTO's gratis dark_all gaf
  // in Europa een ingebakken "Zoom Level Not Supported"-plaatje (HTTP 200,
  // dus geen netwerkfout). Overgestapt op Esri's Dark Gray Canvas: zelfde
  // probleem, eerst op de Reference-laag (labels), daarna zelfs op de
  // Base-laag. Ook toen de backend zélf (server-side, dus los van Lex'
  // browser/netwerk/service-worker) de tegel ophaalde bleef het identiek —
  // dat sluit een client-side oorzaak zo goed als uit. Definitieve keuze:
  // OpenStreetMap's eigen standaardtegels, met van oudsher sterke Europese
  // dekking, opgehaald via de eigen backend-proxy (/api/tegel/{z}/{x}/{y}.png,
  // zie server.js — OSM's gebruiksbeleid wil een herkenbare User-Agent, die
  // zet de backend zelf). OSM-tegels zijn licht/kleurrijk i.p.v. donker, dus
  // de CSS-filter in styles.css (#map .leaflet-tile-pane) is meegewijzigd
  // naar een invert-gebaseerde donkere-modus-look.
  //
  // 2026-08-19, vervolg: `?v=osm1` is geen willekeurige toevoeging — zonder
  // cache-buster bleven tegels die Lex tijdens de CARTO/Esri-fases al had
  // bekeken (vooral Nederland, tientallen keren herladen tijdens het
  // debuggen) uit zijn browser-schijfcache komen i.p.v. vers bij de nieuwe
  // OSM-proxy opgehaald — zichtbaar als een harde naad op de kaart: één kant
  // vlak/grijzig (oude Esri Dark-Gray-Canvas-tegels, nog binnen de 1-dag
  // cache-tijd), de andere kant fris en kleurrijk (nooit eerder bekeken
  // gebied, dus een echte nieuwe OSM-fetch). De querystring maakt elke oude
  // gecachete tegel-URL ongeldig voor de browser, zodat alles nu gegarandeerd
  // vers wordt opgehaald — de backend zelf negeert querystrings toch al bij
  // het matchen van de route.
  // 2026-08-23: kort naar `?v=osmintl1` geweest voor een Wikimedia-tegelbron-
  // poging (NL/Engelse labels) — teruggedraaid na Lex' melding "niet alle
  // tiles zichtbaar en trage opbouw", zie de module-comment bij
  // TEGEL_BASIS_URL in server.js. Terug naar `osm1`, dezelfde cache-buster
  // als vóór die poging, zodat browsers de eerder al goed werkende OSM-tegels
  // gewoon weer uit cache mogen halen i.p.v. alles opnieuw vers te moeten
  // ophalen.
  L.tileLayer('/api/tegel/{z}/{x}/{y}.png?v=osm1', {
    attribution: '© OpenStreetMap-auteurs',
    maxZoom: 19,
  }).addTo(kaart);

  L.marker([THUIS.homeLat, THUIS.homeLon], {
    icon: L.divIcon({ className: '', html: '<div class="home-pin"></div>', iconSize: [14, 14], iconAnchor: [7, 7] }),
    interactive: false,
  }).addTo(kaart);

  signaalLaag = L.layerGroup().addTo(kaart);
  flitsenLaag = L.layerGroup().addTo(kaart);
  // featureGroup i.p.v. layerGroup: die heeft getBounds(), nodig om de kaart
  // op de hele omtrek te laten inzoomen i.p.v. op het (mogelijk misleidende)
  // zwaartepunt bij een groot gebied als een tornado-watch.
  gebiedLaag = L.featureGroup().addTo(kaart);

  // 2026-08-20, op verzoek van Lex ("los klikken op de kaart toggelt hele
  // gebied, iphone, tot de onderste rij knoppen zoiets" / "de navtexkaart mag
  // ook groter... over de icons en de zonbaan heen vallen") — tik op leeg
  // kaartgebied vergrootte de kaart tot de volle hoogte van dit tabblad.
  // 2026-08-20-fix, op verzoek van Lex ("het gaat te vaak fout met dat hele
  // kaart toggle") — dit ging te makkelijk per ongeluk af (pannen/tikken bij
  // een marker); vervangen door de losse driehoek-knop (#toggleUitvergroot,
  // zie initListeners()) als enige/expliciete manier om te vergroten of te
  // verkleinen.
  // 2026-08-21: ook die driehoekknop is inmiddels vervallen (Lex: "de kaart
  // standaard groot altijd groot... het wisselen tussen klein en groot mag
  // dus vervallen") — de kaart is nu altijd groot, geen toggle meer nodig.

  TOGGLE_DOPPLER_EL.addEventListener('click', toggleDoppler);
  DOPPLER_PRODUCTEN_EL.querySelectorAll('.doppler-product-btn').forEach((btn) => {
    btn.addEventListener('click', () => kiesDopplerProduct(btn.dataset.product));
  });
  RADAR_SPEEL_EL.addEventListener('click', () => (radarSpelend ? radarAfspelenStop() : radarAfspelenStart()));
  TOGGLE_SATELLIET_EL.addEventListener('click', toggleSatelliet);
  TOGGLE_REGENRADAR_EL.addEventListener('click', toggleRegenradar);
  TOGGLE_AARDE_EL.addEventListener('click', toggleAarde);
  AARDE_SLUITEN_EL.addEventListener('click', verbergAarde);
  TOGGLE_ZEE_EL.addEventListener('click', toggleZeeModus);
  TOGGLE_VLIEGRADAR_EL.addEventListener('click', toggleVliegradar);
  TOGGLE_VAARRADAR_EL.addEventListener('click', toggleVaarradar);
  // Lex: "...waarna er een knop Stop zichtbaar is. Waarmee ISS/Starlink
  // wordt verborgen, alle hazards weer terugkomen en er wordt
  // teruggenavigeerd naar Hemel." — vandaar terugNaarHemel=true hier.
  KAART_VOLG_STOP_KNOP_EL?.addEventListener('click', () => stopKaartVolgen(true));

  // 2026-08-20, op verzoek van Lex ("als ik op een label in de kaart klik...
  // hele venster gebruiken, knop om eruit te gaan"), daarna bijgesteld na
  // twee klachten: (1) "het venster lijkt af en toe vanzelf te willen
  // sluiten" en (2) "ik zou dat totaalvenster pas willen zien zodra ik op
  // het label KLIK (zoals dat label getoond werd voordat je deze aanpassing
  // deed), sluiten toont dan weer dat oude label".
  // Eerste versie koppelde de overlay 1-op-1 aan Leaflet's eigen
  // popupopen/popupclose-events — dat opende 'm daardoor OOK automatisch bij
  // marker.openPopup() (het "Kijk op Kaart"-pad) en sloot 'm vanzelf zodra
  // Leaflet een popup om een interne reden herbouwde (bijv. tijdens de
  // periodieke signalen-ververcyclus, die markers/popups opnieuw aanmaakt) —
  // dat verklaart beide klachten.
  // Nu ontkoppeld: Leaflet's eigen kleine popup blijft precies zoals
  // voorheen (opent gewoon op een klik, ook via Kijk-op-Kaart, geen
  // wijziging). Alleen een tik ÓP die al-geopende kleine popup (overal
  // behalve op een echte link/foto — .popup-link/.popup-fotostrip-item, die
  // moeten gewoon blijven werken zoals ze horen) opent de schermvullende
  // overlay, als losstaand momentopname-kopietje van de HTML. Sluiten verbergt
  // alleen die overlay — de kleine popup daaronder blijft gewoon openstaan,
  // dus je ziet daarna weer "dat oude label".
  kaart.on('popupopen', (e) => {
    const inhoudEl = e.popup.getElement()?.querySelector('.leaflet-popup-content');
    if (!inhoudEl || inhoudEl.dataset.volledigSchermGekoppeld) return;
    inhoudEl.dataset.volledigSchermGekoppeld = '1';
    inhoudEl.addEventListener('click', (klikEvent) => {
      if (klikEvent.target.closest('a')) return; // echte links/foto's ongemoeid laten
      toonVolledigSchermPopup(inhoudEl.innerHTML);
    });
  });
  LABEL_POPUP_SLUITEN_EL.addEventListener('click', () => LABEL_POPUP_OVERLAY_EL.classList.add('verborgen'));
  LABEL_POPUP_KLEINER_EL.addEventListener('click', () => wijzigPopupTekstgrootte(-1));
  LABEL_POPUP_GROTER_EL.addEventListener('click', () => wijzigPopupTekstgrootte(1));

  // regenradarAan staat standaard op false (zie sectie verderop) — dus bij
  // het opstarten blijft dit gewoon over, alleen relevant als dat ooit weer
  // verandert.
  if (regenradarAan) {
    TOGGLE_REGENRADAR_EL.classList.add('actief');
    initRadar();
  }
  // 2026-08-21, op verzoek van Lex ("ik kan op het play knopje drukken bij de
  // regenradar, maar dan moet eerst de knop regenradar gekozen zijn anders
  // doet ie niks — verbergen tot op regenradar geklikt") — zet de ▶-knop en
  // het tijd-label meteen in de juiste staat bij het opstarten, zodat ze niet
  // een fractie zichtbaar zijn voordat toggleRegenradar() ooit is aangeroepen.
  zorgRadarBedieningZichtbaar();

  // 2026-08-20-bug: Lex zag zijn handmatig ingestelde zoomniveau na een paar
  // seconden terugspringen. Oorzaak: zodra je een gebied-signaal (tornado-
  // watch, severe-outlook, orkaan) had aangetikt, bleef geselecteerdGebiedId
  // staan, en elke volgende 20-seconden-verversing (ververGeselecteerdGebied)
  // deed opnieuw fitBounds() — ook nadat je zelf allang had in-/uitgezoomd of
  // gepand. Eerste poging (e.originalEvent checken) loste het niet op — bleek
  // niet betrouwbaar te onderscheiden bij Leaflet's zoomend-event (zoomknoppen/
  // scrollwheel/pinch geven kennelijk niet altijd een originalEvent mee, dus
  // een echte gebruikers-zoom werd soms tóch als "eigen aanroep" gezien en
  // negeerd). Robuustere aanpak: wij zetten zelf programmatischeKaartActie
  // vlak vóór elke eigen fitBounds/setView/setZoom-aanroep (zie die aanroepen
  // verderop) en zetten 'm hier meteen weer uit — zo weten we 100% zeker of
  // een zoomend/dragend van onszelf kwam, zonder te hoeven gokken naar
  // Leaflet's interne event-velden.
  kaart.on('zoomend dragend', () => {
    if (programmatischeKaartActie) {
      programmatischeKaartActie = false;
      return;
    }
    if (geselecteerdGebiedId) geselecteerdGebiedId = null;
    // 2026-08-23-bug: zelfde redenering, maar voor ISS/Starlink-kaarttracking
    // — zie kaartVolgGebruikerHeeftGezoomd hierboven bij kaartVolgType.
    if (kaartVolgType) kaartVolgGebruikerHeeftGezoomd = true;
  });
}

// ---- NEXRAD-Doppler-radar (VS) — losse, optionele laag bovenop een
// tornado-gerelateerde melding. Bron: Iowa Environmental Mesonet, gratis,
// geen sleutel. https://mesonet.agron.iastate.edu/
// Los van RainViewer (die is wereldwijd maar lagere resolutie) — dit is
// specifiek de "echte" Amerikaanse Doppler-radar, alleen zinvol/zichtbaar
// gemaakt bij VS-tornado-signalen (zie DOPPLER_CATEGORIEEN), niet als
// permanente derde kaartstand naast Gevaren/Weer.
//
// Twee kiesbare producten (knopjes onder de Doppler-toggle):
//  - reflectiviteit: landelijke IEM-mozaïek (N0Q), overal in de VS zichtbaar.
//  - rotatie: Storm-Relative Velocity (N0S) van één specifiek radarstation —
//    dit is het product dat spotters/professionals gebruiken om rotatie/
//    tornado-signatuur te zien (ruwe velocity zonder storm-motion-correctie
//    is veel lastiger af te lezen). IEM biedt geen landelijke velocity-
//    mozaïek (velocity is inherent radar-relatief), dus dit MOET per station.
//
// Stationslijst hieronder is een handmatig samengestelde subset (~Tornado
// Alley, Dixie Alley en het zuidoosten van de VS — de gebieden met verreweg
// de meeste tornado's) i.p.v. het volledige landelijke NEXRAD-netwerk van
// ~160 stations. Reden: een betrouwbare, actuele volledige lijst kon niet
// worden opgehaald (herhaalde ROBOTS_DISALLOWED-fouten bij twee externe
// bronnen tijdens het bouwen hiervan) en deze coördinaten komen uit
// algemene kennis over deze (al decennia vaste, publieke) radarlocaties,
// niet uit een live-geverifieerde bron. Ruim voldoende nauwkeurig voor
// "dichtstbijzijnde station kiezen" (stations liggen doorgaans >150km uit
// elkaar), maar dus bewust geen landelijke dekking — bij een melding ver
// buiten deze regio's toont de rotatie-knop dan niets (zie
// dopplerTileUrlVoor hieronder), i.p.v. een station te ver weg te tonen.
// Fallback voor als /api/radarstations (nieuw, zie laadRadarstations hieronder)
// niet lukt — dan valt dichtstbijzijndeRadarstation() terug op deze
// handmatig samengestelde ~40-stations-lijst rond Tornado Alley/Dixie
// Alley/zuidoost-VS, i.p.v. de rotatie-optie helemaal te laten uitvallen.
const NEXRAD_STATIONS_FALLBACK = [
  { id: 'KTLX', naam: 'Twin Lakes, OK', lat: 35.333, lon: -97.278 },
  { id: 'KFDR', naam: 'Frederick, OK', lat: 34.362, lon: -98.976 },
  { id: 'KVNX', naam: 'Vance AFB, OK', lat: 36.741, lon: -98.128 },
  { id: 'KINX', naam: 'Tulsa, OK', lat: 36.175, lon: -95.564 },
  { id: 'KICT', naam: 'Wichita, KS', lat: 37.654, lon: -97.443 },
  { id: 'KDDC', naam: 'Dodge City, KS', lat: 37.761, lon: -99.969 },
  { id: 'KGLD', naam: 'Goodland, KS', lat: 39.367, lon: -101.700 },
  { id: 'KTWX', naam: 'Topeka, KS', lat: 38.997, lon: -96.232 },
  { id: 'KUEX', naam: 'Hastings, NE', lat: 40.321, lon: -98.442 },
  { id: 'KOAX', naam: 'Omaha, NE', lat: 41.320, lon: -96.367 },
  { id: 'KLNX', naam: 'North Platte, NE', lat: 41.958, lon: -100.576 },
  { id: 'KABR', naam: 'Aberdeen, SD', lat: 45.456, lon: -98.413 },
  { id: 'KFSD', naam: 'Sioux Falls, SD', lat: 43.588, lon: -96.729 },
  { id: 'KAMA', naam: 'Amarillo, TX', lat: 35.233, lon: -101.709 },
  { id: 'KLBB', naam: 'Lubbock, TX', lat: 33.654, lon: -101.814 },
  { id: 'KFWS', naam: 'Dallas/Fort Worth, TX', lat: 32.573, lon: -97.303 },
  { id: 'KEWX', naam: 'Austin/San Antonio, TX', lat: 29.704, lon: -98.028 },
  { id: 'KHGX', naam: 'Houston, TX', lat: 29.472, lon: -95.079 },
  { id: 'KGRK', naam: 'Fort Hood/Waco, TX', lat: 30.722, lon: -97.383 },
  { id: 'KDYX', naam: 'Abilene, TX', lat: 32.538, lon: -99.254 },
  { id: 'KSJT', naam: 'San Angelo, TX', lat: 31.371, lon: -100.492 },
  { id: 'KDFX', naam: 'Del Rio, TX', lat: 29.273, lon: -100.280 },
  { id: 'KSHV', naam: 'Shreveport, LA', lat: 32.451, lon: -93.841 },
  { id: 'KLCH', naam: 'Lake Charles, LA', lat: 30.125, lon: -93.216 },
  { id: 'KPOE', naam: 'Fort Polk, LA', lat: 31.155, lon: -92.976 },
  { id: 'KLIX', naam: 'New Orleans, LA', lat: 30.337, lon: -89.825 },
  { id: 'KLZK', naam: 'Little Rock, AR', lat: 34.836, lon: -92.262 },
  { id: 'KSRX', naam: 'Fort Smith, AR', lat: 35.290, lon: -94.362 },
  { id: 'KMEG', naam: 'Memphis, TN', lat: 35.345, lon: -90.081 },
  { id: 'KHTX', naam: 'Huntsville, AL', lat: 34.931, lon: -86.084 },
  { id: 'KBMX', naam: 'Birmingham, AL', lat: 33.172, lon: -86.770 },
  { id: 'KMXX', naam: 'Montgomery, AL', lat: 32.537, lon: -85.790 },
  { id: 'KMOB', naam: 'Mobile, AL', lat: 30.679, lon: -88.240 },
  { id: 'KDGX', naam: 'Jackson, MS', lat: 32.280, lon: -89.985 },
  { id: 'KGWX', naam: 'Columbus AFB, MS', lat: 33.897, lon: -88.329 },
  { id: 'KFFC', naam: 'Atlanta, GA', lat: 33.364, lon: -84.566 },
  { id: 'KVAX', naam: 'Valdosta/Moody AFB, GA', lat: 30.890, lon: -83.002 },
  { id: 'KJGX', naam: 'Robins AFB/Macon, GA', lat: 32.675, lon: -83.351 },
  { id: 'KCLX', naam: 'Charleston, SC', lat: 32.656, lon: -81.042 },
  { id: 'KGSP', naam: 'Greenville/Spartanburg, SC', lat: 34.883, lon: -82.220 },
  { id: 'KRAX', naam: 'Raleigh/Durham, NC', lat: 35.665, lon: -78.490 },
  { id: 'KMHX', naam: 'Newport/Morehead City, NC', lat: 34.776, lon: -76.876 },
];

// Wordt bij het opstarten gevuld vanuit /api/radarstations (volledige
// landelijke NEXRAD-lijst, ~159 stations, backend: nexradStations.js). Blijft
// `null` (en dus fallback naar de curated lijst hierboven) zolang die fetch
// nog niet is geweest of is mislukt.
let NEXRAD_STATIONS_VOLLEDIG = null;

function afstandKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function dichtstbijzijndeRadarstation(lat, lon) {
  if (lat == null || lon == null) return null;
  const lijst = NEXRAD_STATIONS_VOLLEDIG?.length ? NEXRAD_STATIONS_VOLLEDIG : NEXRAD_STATIONS_FALLBACK;
  let beste = null;
  let besteAfstand = Infinity;
  for (const station of lijst) {
    const d = afstandKm(lat, lon, station.lat, station.lon);
    if (d < besteAfstand) {
      besteAfstand = d;
      beste = station;
    }
  }
  // Bij de volledige landelijke lijst liggen stations doorgaans <230km uit
  // elkaar (dat is precies waarom NEXRAD zo'n dekkingsdichtheid heeft) — een
  // ruimere marge (400km) dan de oude 350km, om ook afgelegen eilanden/
  // Alaska (grotere onderlinge afstanden) nog een station te geven i.p.v.
  // een lege rotatie-knop. Bij de curated fallback-lijst (smaller gebied)
  // blijft dit verder hetzelfde principe: liever niets tonen dan een
  // misleidend ver-weg station.
  return beste && besteAfstand <= 400 ? beste : null;
}

async function laadRadarstations() {
  try {
    const body = await fetch('/api/radarstations').then((r) => r.json());
    if (Array.isArray(body?.stations) && body.stations.length) {
      NEXRAD_STATIONS_VOLLEDIG = body.stations;
    }
  } catch {
    // Stil falen — dichtstbijzijndeRadarstation() valt vanzelf terug op
    // NEXRAD_STATIONS_FALLBACK zolang NEXRAD_STATIONS_VOLLEDIG leeg blijft.
  }
}

function dopplerTileInfo(product, signal) {
  if (product === 'reflectiviteit') {
    return {
      url: 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/{z}/{x}/{y}.png',
      attributie: 'Radar: Iowa Environmental Mesonet (NEXRAD-mozaïek, reflectiviteit)',
    };
  }
  // rotatie (Storm-Relative Velocity) — vereist een dichtstbijzijnd station
  const station = dichtstbijzijndeRadarstation(signal?.lat, signal?.lon);
  if (!station) return null;
  return {
    url: `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::${station.id}-N0S-0/{z}/{x}/{y}.png`,
    attributie: `Radar: IEM — ${station.naam} (${station.id}), Storm-Relative Velocity`,
  };
}

// Laag opnieuw opbouwen i.p.v. hergebruiken: het gekozen product of het
// onderliggende station (bij 'rotatie', afhankelijk van het aangetikte
// signaal) kan wijzigen terwijl Doppler al aanstaat.
function herbouwDopplerLaag() {
  if (!kaart) return;
  if (dopplerLaag) {
    kaart.removeLayer(dopplerLaag);
    dopplerLaag = null;
  }
  if (!dopplerActief) return;
  const info = dopplerTileInfo(dopplerProduct, dopplerSignaal);
  if (!info) return; // bv. 'rotatie' gekozen maar geen station binnen bereik — stil niets tonen
  dopplerLaag = L.tileLayer(info.url, {
    attribution: info.attributie,
    opacity: 0.65,
    maxZoom: 12,
    pane: 'radarPane',
  }).addTo(kaart);
}

function toggleDoppler() {
  dopplerActief = !dopplerActief;
  TOGGLE_DOPPLER_EL.classList.toggle('actief', dopplerActief);
  // Productknoppen (Reflectiviteit/Rotatie) pas tonen zodra Doppler zelf
  // aanstaat — op verzoek van Lex, voorkomt twee knoppenrijen die niets doen
  // voordat je Doppler hebt aangezet.
  DOPPLER_PRODUCTEN_EL.style.display = dopplerActief ? '' : 'none';
  herbouwDopplerLaag();
}

function kiesDopplerProduct(product) {
  if (product === dopplerProduct) return;
  dopplerProduct = product;
  DOPPLER_PRODUCTEN_EL.querySelectorAll('.doppler-product-btn').forEach((btn) => {
    btn.classList.toggle('actief', btn.dataset.product === product);
  });
  if (dopplerActief) herbouwDopplerLaag();
}

// Knop(en) alleen tonen bij VS-tornado-gerelateerde meldingen — bij elke
// andere selectie verbergen én uitzetten, anders blijft de radar "aan"
// hangen terwijl de knop niet meer zichtbaar is om 'm uit te zetten.
function toonDopplerKnopVoor(signal) {
  const relevant = DOPPLER_CATEGORIEEN.has(signal.categorie);
  TOGGLE_DOPPLER_EL.style.display = relevant ? '' : 'none';
  // Productknoppen alleen zichtbaar zolang Doppler ook echt aanstaat — niet
  // al zodra de Doppler-toggle zelf maar zichtbaar is (zie toggleDoppler()).
  DOPPLER_PRODUCTEN_EL.style.display = relevant && dopplerActief ? '' : 'none';
  dopplerSignaal = relevant ? signal : null;
  if (!relevant) {
    dopplerActief = false;
    TOGGLE_DOPPLER_EL.classList.remove('actief');
    DOPPLER_PRODUCTEN_EL.style.display = 'none';
  }
  herbouwDopplerLaag(); // ook nodig als nog wél relevant: nieuw signaal kan een ander station betekenen bij 'rotatie'
}

// Tik op een melding: schakel naar de kaarttab, centreer erop en open de popup.
// 2026-08-19, op verzoek van Lex: bij hulpdiensten (P2000/Lifeliner) meteen
// vrij hoog inzoomen — dat zijn precieze adressen/locaties waar de straat/
// buurt er echt toe doet, anders dan bijv. een aardbeving of orkaan waar een
// regionaal overzicht (het standaard-minimum van 8 hieronder) al genoeg is.
const HULPDIENSTEN_ZOOM = 15;

// 2026-08-19, orkaan-centrering: fitBounds() op de hele omtrek (spoor tot nu
// toe + voorspelde koers-cone) centreert op het midden van díe hele vorm —
// bij een orkaan wordt dat spoor elke dag langer, dus dat midden schuift
// langzaam weg van waar de storm ECHT is (Lex zag Lala over de dagen naar de
// rand lopen). Puur op de actuele positie centreren loste dat op maar voelde
// niet goed ("geen gezicht") — je wil het hele spoor immers gewoon blijven
// zien. Beste van beide: bereken een NIEUWE, symmetrische bounds rond de
// actuele positie, groot genoeg om de hele oorspronkelijke vorm nog te
// bevatten. Zo staat de storm altijd in het midden, en blijft het volledige
// spoor + de cone gewoon in beeld (met iets meer lucht aan de kortere kant
// dan strikt nodig, maar dat is nooit vervelend).
function symmetrischeBoundsRondPunt(lat, lon, bounds) {
  const deltaLat = Math.max(Math.abs(bounds.getNorth() - lat), Math.abs(lat - bounds.getSouth()));
  const deltaLon = Math.max(Math.abs(bounds.getEast() - lon), Math.abs(lon - bounds.getWest()));
  return L.latLngBounds([lat - deltaLat, lon - deltaLon], [lat + deltaLat, lon + deltaLon]);
}

function centreerOpMelding(signal) {
  wisselView('kaart');
  // 2026-08-20, op verzoek van Lex: NAVTEX-pins zijn alleen zichtbaar met
  // Zee-modus aan, en juist andersom zijn alle andere categorieën (bijv.
  // Hulpdiensten) alleen zichtbaar met Zee-modus UIT (zie renderMap, die
  // strikt op zeeModusActief filtert). Eerst alleen de "aanzetten voor
  // NAVTEX"-kant hiervan gefixt, maar Lex wees terecht op de keerzijde: als
  // Zee-modus toevallig al aanstond (bijv. na een eerder NAVTEX-bericht) en
  // je tikt dan op bijv. een Hulpdiensten-melding, was die pin alsnog
  // onzichtbaar (en dus ook geen popup, zelfde onderliggende probleem).
  // Simpelweg de modus altijd naar de kant zetten die bij dít signaal hoort
  // dekt beide richtingen in één keer. toggleZeeModus() ververst de kaart
  // meteen zelf (zie renderMap-aanroep daarin), dus markersPerId bevat de
  // juiste marker daarna gewoon op tijd voor de lookup verderop.
  const moetZeeModus = signal.categorie === 'navtex';
  if (moetZeeModus !== zeeModusActief) toggleZeeModus();
  // 2026-08-21: Vliegradar verbergt alle hazard-pins (zie renderMap) — een
  // melding uit de lijst aantikken moet die pin natuurlijk weer zichtbaar
  // maken, dus Vliegradar hier altijd uit als 'ie nog aanstond.
  if (vliegModusActief) toggleVliegradar();
  // De wolkenfilm-lagen (RainViewer) ondersteunen maar tot zoom 12 — dat is
  // afgedwongen via de eigen `maxZoom: 12` van radarLagen zelf (zie
  // toonRadarFrame), dus Leaflet laat die lagen al netjes leeg boven dat
  // zoomniveau i.p.v. een "zoom level not supported"-tegel te tonen. Geen
  // aparte Gevaren/Weer-stand meer nodig om dat te voorkomen.
  // Onthouden welk complex nu bekeken wordt, zodat de flitsenlaag meelift met
  // elke volgende 20-seconden-verversing (zie ververGeselecteerdeFlitsen) i.p.v.
  // alleen een momentopname te blijven op het moment van aantikken.
  geselecteerdComplexId = signal.categorie === 'onweercomplex' ? signal.id : null;
  toonFlitsenVoor(signal);
  toonDopplerKnopVoor(signal);
  // 2026-08-20-fix, op verzoek van Lex ("2 gebieden in Raleigh maar maar 1
  // outline bij beide apart") — tekenen gebeurt niet meer hier (dat doet
  // tekenAlleGebiedOmtrekken() nu altijd voor ALLE actieve gebied-signalen
  // tegelijk, zie renderMap), hier alleen nog de bounds opvragen om de kaart
  // op dít specifieke signaal te fitten.
  const gebiedBounds = gebiedBoundsVoor(signal);
  // Zelfde live-meeverversen-principe als bij flitsen (zie
  // ververGeselecteerdGebied): onthouden welk gebied-signaal openstaat, zodat
  // de kaartweergave meelift op de bestaande 20-seconden-cyclus i.p.v. een
  // momentopname te blijven — belangrijk omdat NWS een watch kan aanpassen of
  // laten verlopen terwijl je 'm openhoudt.
  geselecteerdGebiedId = gebiedBounds ? signal.id : null;
  if (!kaart) return;
  if (gebiedBounds && signal.lat != null && signal.lon != null) {
    // Zowel een omtrek als een eigen actuele positie (orkaan) — symmetrisch
    // rond die positie, zie symmetrischeBoundsRondPunt() hierboven.
    beweegKaartProgrammatisch(() => {
      kaart.fitBounds(symmetrischeBoundsRondPunt(signal.lat, signal.lon, gebiedBounds), { padding: [24, 24] });
      dwingRegenradarZoomAf(); // fitBounds kan met gemak onder REGENRADAR_ZOOM uitkomen bij een groot gebied
    });
  } else if (gebiedBounds) {
    // Groot gebied zonder eigen "nu"-punt (bv. een NWS-watch-polygon) —
    // gewoon de hele omtrek in beeld.
    beweegKaartProgrammatisch(() => {
      kaart.fitBounds(gebiedBounds, { padding: [24, 24] });
      dwingRegenradarZoomAf();
    });
  } else if (signal.lat != null && signal.lon != null) {
    const minZoom = signal.categorie === 'hulpdiensten' ? HULPDIENSTEN_ZOOM : 8;
    beweegKaartProgrammatisch(() => kaart.setView([signal.lat, signal.lon], Math.max(kaart.getZoom(), minZoom)));
  } else {
    return;
  }
  const marker = markersPerId.get(signal.id);
  if (marker) setTimeout(() => marker.openPopup(), 250); // wacht tot de pan/zoom-animatie klaar is
}

// Bij een aangetikt gebied-signaal (nu: tornado-watch, severe-outlook) de
// polygon-omtrek van het gebied tekenen i.p.v. alleen het zwaartepunt-pin —
// een watch beslaat vaak een groot gebied (meerdere staten), dus een pin
// alleen geeft een misleidend beeld van waar/hoe groot het precies is. Elke
// andere/geen selectie ruimt de vorige omtrek gewoon op. Meerdere ringen
// (zelden: een MultiPolygon) worden als losse vormen getekend, niet als
// gaten in één vorm.
// Sinds 2026-08-17 tekent dezelfde functie ook de NHC-voorspelde-koers voor
// orkanen, indien aanwezig: `detail.gebiedPolygon` hergebruikt de bestaande
// "cone of uncertainty"-polygon-tekening hierboven (identiek mechanisme,
// andere databron), en `detail.koerslijn` (nieuw) is de voorspelde-koerslijn
// zelf — getekend als losse polylijn in dezelfde gebiedLaag, zodat 'm gewoon
// meetelt in fitBounds() zonder extra code daarvoor.
// 2026-08-20: op verzoek van Lex — Severe Thunderstorm Warning krijgt een
// gele omtrek i.p.v. de standaard rood/roze, zodat 'ie op de kaart meteen te
// onderscheiden is van tornado-watch/severe-outlook/orkaan (die de
// standaardkleur houden). Zelfde geel als de Lifeliner-helikopter elders in
// dit bestand — al een bekende "let op, maar geen tornado"-kleur in de app.
const GEBIED_OMTREK_KLEUR_PER_CATEGORIE = { 'severe-thunderstorm': '#ffd633' };
const GEBIED_OMTREK_KLEUR_STANDAARD = '#ff2e6d';

// 2026-08-20-fix, op verzoek van Lex ("als er meerdere severe thunderstorms
// zijn kan dat dan tegelijk getoond worden... ik heb nu 2 gebieden in Raleigh
// maar maar 1 outline bij beide apart") — toonGebiedVoor() cleared voorheen
// ALTIJD eerst de hele gebiedLaag, dus een tweede aangetikt gebied wiste de
// omtrek van de eerste. Opgesplitst in drie stukken: tekenGebiedOmtrek() (één
// signaal tekenen, niet clearen), tekenAlleGebiedOmtrekken() (elke
// renderMap-cyclus: clear + hertekent ALLE actieve gebied-signalen tegelijk —
// zelfde altijd-alles-tonen-principe als de hazard-pins), en
// gebiedBoundsVoor() (kale bounds-berekening, voor fitBounds bij een klik/
// bij het meebewegen van de geselecteerde omtrek — hoeft zelf niks te tekenen
// of te clearen, dat gebeurt nu al automatisch via renderMap).
function tekenGebiedOmtrek(signal) {
  if (!gebiedLaag) return false;
  const ringenLatLon = signal.detail?.gebiedPolygon;
  const koerslijnLatLon = signal.detail?.koerslijn;
  const omtrekKleur = GEBIED_OMTREK_KLEUR_PER_CATEGORIE[signal.categorie] ?? GEBIED_OMTREK_KLEUR_STANDAARD;
  let ietsGetekend = false;
  if (Array.isArray(ringenLatLon) && ringenLatLon.length) {
    ringenLatLon.forEach((ring) => {
      L.polygon(ring, {
        className: 'gebied-omtrek',
        color: omtrekKleur,
        weight: 1.5,
        opacity: 0.55,
        dashArray: '5 7',
        fillColor: omtrekKleur,
        fillOpacity: 0.05,
        interactive: false,
      }).addTo(gebiedLaag);
    });
    ietsGetekend = true;
  }
  if (Array.isArray(koerslijnLatLon) && koerslijnLatLon.length >= 2) {
    L.polyline(koerslijnLatLon, {
      className: 'koers-lijn',
      color: '#3ec6ff',
      weight: 2.5,
      opacity: 0.85,
      dashArray: '2 6',
      interactive: false,
    }).addTo(gebiedLaag);
    ietsGetekend = true;
  }
  return ietsGetekend;
}

// Wordt vanuit renderMap() elke cyclus aangeroepen — tekent de omtrek van
// ÉLK signaal met een gebiedPolygon/koerslijn tegelijk (niet alleen het
// laatst aangetikte), zodat bv. twee gelijktijdige Severe Thunderstorm
// Warnings allebei hun omtrek behouden.
function tekenAlleGebiedOmtrekken(signalen) {
  if (!gebiedLaag) return;
  gebiedLaag.clearLayers();
  signalen.forEach((s) => tekenGebiedOmtrek(s));
}

// Kale bounds-berekening voor een los signaal (geen tekenen/clearen — dat
// gebeurt al via tekenAlleGebiedOmtrekken hierboven) — voor fitBounds bij het
// aantikken van een melding (centreerOpMelding) en bij het meebewegen van de
// geselecteerde omtrek (ververGeselecteerdGebied hieronder).
function gebiedBoundsVoor(signal) {
  const punten = [];
  if (Array.isArray(signal.detail?.gebiedPolygon)) signal.detail.gebiedPolygon.forEach((ring) => punten.push(...ring));
  if (Array.isArray(signal.detail?.koerslijn) && signal.detail.koerslijn.length >= 2) punten.push(...signal.detail.koerslijn);
  return punten.length ? L.latLngBounds(punten) : null;
}

// Wordt bij elke reguliere 20-seconden-verversing aangeroepen (zie renderMap)
// zodat de kaartweergave een gebied-omtrek (watch aangepast/verlopen,
// orkaan-koers verplaatst) blijft volgen zolang je 'm openhoudt — het tekenen
// zelf gebeurt inmiddels altijd al via tekenAlleGebiedOmtrekken, dit gaat nu
// alleen nog over de kaartpositie. Zelfde symmetrische-bounds-aanpak als
// centreerOpMelding hierboven — zie symmetrischeBoundsRondPunt() voor de
// achtergrond (fitBounds op de hele, groeiende vorm liet een orkaan langzaam
// naar de rand lopen). Bij een ongewijzigde positie/vorm is dit een no-op
// (geen merkbare beweging), dus een stilstaand gebied zoals tornado-watch
// kost dit niks.
function ververGeselecteerdGebied(signalen) {
  if (!geselecteerdGebiedId) return;
  const actueel = signalen.find((s) => s.id === geselecteerdGebiedId);
  if (!actueel) {
    geselecteerdGebiedId = null;
    return;
  }
  const gebiedBounds = gebiedBoundsVoor(actueel);
  if (!kaart) return;
  if (gebiedBounds && actueel.lat != null && actueel.lon != null) {
    beweegKaartProgrammatisch(() => {
      kaart.fitBounds(symmetrischeBoundsRondPunt(actueel.lat, actueel.lon, gebiedBounds), { padding: [24, 24] });
      dwingRegenradarZoomAf(); // zelfde reden als bij centreerOpMelding() hierboven
    });
  } else if (gebiedBounds) {
    beweegKaartProgrammatisch(() => {
      kaart.fitBounds(gebiedBounds, { padding: [24, 24] });
      dwingRegenradarZoomAf();
    });
  } else if (actueel.lat != null && actueel.lon != null) {
    beweegKaartProgrammatisch(() => kaart.setView([actueel.lat, actueel.lon], kaart.getZoom()));
  }
}

// Bij een aangetikt onweercomplex: de losse flitsen erachter tonen (i.p.v.
// alleen de ene complex-marker) — geeft een gevoel van de vorm/omvang van de
// bui, niet alleen een punt. Elke andere/geen selectie ruimt de vorige set
// gewoon op. Verse flitsen (net binnen) worden feller getekend dan oude
// (tegen het einde van het 30-minuten-venster), via secondenGeleden.
function toonFlitsenVoor(signal) {
  if (!flitsenLaag) return;
  flitsenLaag.clearLayers();
  if (signal.categorie !== 'onweercomplex' || !Array.isArray(signal.detail?.flitsen)) return;
  const VENSTER_SEC = 30 * 60;
  signal.detail.flitsen.forEach((f) => {
    const frisFactor = Math.max(0, 1 - (f.secondenGeleden ?? VENSTER_SEC) / VENSTER_SEC);
    L.circleMarker([f.lat, f.lon], {
      className: 'flits-punt',
      radius: 3,
      color: '#ffd166',
      weight: 1,
      opacity: 0.35 + frisFactor * 0.5,
      fillColor: '#ffd166',
      fillOpacity: 0.2 + frisFactor * 0.55,
      interactive: false,
    }).addTo(flitsenLaag);
  });
}

// Wordt bij elke reguliere 20-seconden-verversing aangeroepen (zie renderMap)
// zodat nieuwe flitsen vanzelf bijkomen zolang je een onweercomplex openstaat
// — zonder dat je opnieuw hoeft te tikken. Verdwijnt het complex uit de
// signalenlijst (te weinig flitsen meer over binnen het venster), dan ruimt
// dit de laag netjes op i.p.v. verouderde stipjes te laten hangen.
function ververGeselecteerdeFlitsen(signalen) {
  if (!geselecteerdComplexId) return;
  const actueel = signalen.find((s) => s.id === geselecteerdComplexId);
  if (actueel) {
    toonFlitsenVoor(actueel);
  } else {
    flitsenLaag?.clearLayers();
    geselecteerdComplexId = null;
  }
}

// Regenradar via RainViewer — gratis, geen sleutel, bedoeld voor
// persoonlijk/educatief gebruik. https://www.rainviewer.com/api.html
// Let op: dit is neerslagradar (grondstations), GEEN wolkenfoto — boven open
// oceaan (waar geen radarstation staat) blijft dit dus leeg. Voor wolken
// overal ter wereld is de aparte Satelliet-laag (NASA GIBS/GOES) bedoeld.
// Een lus van de laatste ~2 uur (radar.past) plus de nowcast-voorspelling
// (radar.nowcast, indien beschikbaar), die je met ▶ kunt afspelen.
// Dubbel gebufferd (twee lagen, 'a' en 'b') i.p.v. één laag + setUrl(): met
// één laag gooit Leaflet bij setUrl() meteen alle tegels van die laag leeg en
// laadt ze opnieuw, wat tijdens Play elke ~1200ms een zichtbare lege flits
// gaf. Nu laden we het volgende frame onzichtbaar (opacity 0) in de andere
// laag, en pas als díe helemaal klaar is (Leaflet's 'load'-event) faden we
// over — de zichtbare laag verdwijnt precies op het moment dat de nieuwe er
// al staat, dus geen gat meer.
let radarLagen = null; // { a: L.TileLayer, b: L.TileLayer } zodra aangemaakt
let radarActief = 'a'; // welke van de twee momenteel zichtbaar is (opacity 0.6)
let radarLaadTeller = 0; // race-guard: negeer een 'load' die niet meer bij het laatst-aangevraagde frame hoort
let radarFrames = []; // [{time, path}], gesorteerd oud → nieuw (incl. voorspelling)
let radarNuIndex = 0; // grens tussen verleden en voorspelling, voor de tijd-label
let radarIndex = 0;
let radarSpelend = false;
let radarTimer = null;
let radarFramesOpgehaald = false;

// 2026-08-19: tegels lopen nu via de eigen backend (/api/regenradar/..., zie
// server.js) i.p.v. rechtstreeks naar tilecache.rainviewer.com — Lex zag flink
// geflikker (afwisselend goede tegels en een "niet beschikbaar"-plaatje), en
// RainViewer's eigen responsheaders lieten X-Ratelimit-* zien: een reëel
// snelheidslimiet, waarschijnlijk aangetikt door al het herladen/testen
// tijdens deze sessie. De backend cachet elke tegel nu een uur, dus dezelfde
// tegel wordt niet telkens opnieuw bij RainViewer opgehaald. radarHost (uit
// weather-maps.json) is hierdoor niet meer nodig — het pad zelf (frame.path)
// bevat alle info die de proxy nodig heeft.
function frameUrl(frame) {
  return `/api/regenradar${frame.path}/256/{z}/{x}/{y}/2/1_1.png`;
}

// Geeft een Promise terug die pas resolvet zodra de nieuwe tegels
// daadwerkelijk klaar zijn (of na RADAR_LAAD_TIMEOUT_MS, als vangnet tegen
// een kapotte/hangende tegel) — de afspeel-lus hieronder wacht hierop vóór
// hij aan het volgende frame begint, i.p.v. op een vaste klok door te tikken.
const RADAR_LAAD_TIMEOUT_MS = 4000;

function toonRadarFrame(index) {
  if (!radarFrames.length) return Promise.resolve();
  radarIndex = ((index % radarFrames.length) + radarFrames.length) % radarFrames.length;
  const frame = radarFrames[radarIndex];
  const label = new Date(frame.time * 1000).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  RADAR_TIJD_EL.textContent = radarIndex < radarNuIndex ? label : radarIndex === radarNuIndex ? `${label} · nu` : `${label} · verwacht`;

  if (!radarLagen) {
    // Eerste keer: nog niets op de kaart, dus geen crossfade nodig — 'b'
    // start met dezelfde tegels als 'a' (alleen onzichtbaar) zodat 'ie geen
    // lege URL hoeft te laden zodra initRadar() 'm aan de kaart toevoegt.
    // 2026-08-19: verkort van "Regenradar: RainViewer" — met meerdere lagen
    // tegelijk aan (bv. ook Satelliet) plakt Leaflet alle attributies achter
    // elkaar tot één te lange regel die over de knoppenbalk onder de kaart
    // heen leek te lopen. Zie ook de .leaflet-control-attribution-regel in
    // styles.css (nowrap+ellipsis als extra vangnet).
    const opties = { attribution: 'RainViewer', maxZoom: 12, pane: 'radarPane' };
    radarLagen = {
      a: L.tileLayer(frameUrl(frame), { ...opties, opacity: 0.6 }),
      b: L.tileLayer(frameUrl(frame), { ...opties, opacity: 0 }),
    };
    radarActief = 'a';
    return Promise.resolve();
  }

  const zichtbaar = radarLagen[radarActief];
  const onzichtbaar = radarLagen[radarActief === 'a' ? 'b' : 'a'];
  const dezeAanvraag = ++radarLaadTeller;
  return new Promise((resolve) => {
    let klaar = false;
    const afronden = () => {
      if (klaar) return;
      klaar = true;
      if (dezeAanvraag === radarLaadTeller) {
        // Alleen wisselen als er ondertussen niet alweer een nieuwer frame is
        // aangevraagd — anders zou een trage, inmiddels-overbodige lading
        // alsnog een stap terug in de tijd laten zien.
        onzichtbaar.setOpacity(0.6);
        zichtbaar.setOpacity(0);
        radarActief = radarActief === 'a' ? 'b' : 'a';
      }
      resolve();
    };
    onzichtbaar.once('load', afronden);
    setTimeout(afronden, RADAR_LAAD_TIMEOUT_MS); // vangnet: nooit voorgoed blijven hangen op één trage/kapotte tegel
    onzichtbaar.setUrl(frameUrl(frame));
  });
}

// ---- Afspelen: zelf-plannende lus i.p.v. een vaste setInterval, 2026-08-19 -
// Root cause van het "schokkerige" gevoel dat Lex meldde: de oude
// setInterval(…, 1200) tikte op de klok door, ook als de vorige tegels nog
// niet binnen waren. toonRadarFrame() negeerde die nog-lopende lading dan via
// de race-guard (dezeAanvraag !== radarLaadTeller) — het frame werd dus
// gewoon stilzwijgend NIET getoond i.p.v. vertraagd. Bij wisselende laadtijd
// (bijv. de eerste keer door alle frames heen, cache-miss richting
// RainViewer) gaf dat een onvoorspelbare, hortende afspeelsnelheid: sommige
// frames wel, andere niet zichtbaar, ondanks een keurig vast interval.
// Fix: elke stap wácht nu eerst op de Promise van toonRadarFrame() (dus
// daadwerkelijk klaar, of de timeout-vangnet hierboven) en plant pas dan de
// volgende stap na RADAR_STAP_MS — gegarandeerd elk frame in beeld, op de
// kosten van een iets minder metronomisch strak tempo bij een trage tegel
// (beter een moment iets langer stilstaan dan een frame overslaan).
const RADAR_STAP_MS = 1200;

function radarSpeelStap() {
  if (!radarSpelend) return;
  toonRadarFrame(radarIndex + 1).then(() => {
    if (!radarSpelend) return;
    radarTimer = setTimeout(radarSpeelStap, RADAR_STAP_MS);
  });
}

function radarAfspelenStart() {
  radarSpelend = true;
  RADAR_SPEEL_EL.textContent = '⏸';
  radarSpeelStap();
}

function radarAfspelenStop() {
  radarSpelend = false;
  RADAR_SPEEL_EL.textContent = '▶';
  clearTimeout(radarTimer);
}

// ---- Satellietbeeld (NASA GIBS, GOES GeoColor), 2026-08-18 -----------------
// Op verzoek van Lex: hij zag terecht geen bewolking op de wolkenfilm (Rain-
// Viewer) bij een storm midden op de oceaan — RainViewer is een mozaïek van
// GROND-radars (zie rainviewer.com/coverage.html), en die dekken de open
// oceaan simpelweg niet, hoe hevig de storm daar ook is. NASA GIBS levert
// near-real-time (10 min, ~40 min vertraging) GOES-GeoColor-tegels die WEL
// overal dekking geven (satellietbeeld i.p.v. grondradar) — gratis, geen
// sleutel.
//
// Twee bugs achter elkaar gevonden en gefixt (2026-08-18), beide dankzij Lex
// die zelf de Netwerk-tab/Worldview heeft uitgeplozen toen de laag leeg bleef:
// 1) bestandsformaat was .jpg gegokt, moest .png zijn (uit de capabilities-XML).
// 2) de "nette" RESTful tegel-URL uit diezelfde capabilities-XML bleek voor
//    deze specifieke laag ("v0 NRT", nog beta binnen GIBS) in de praktijk niet
//    te werken (consequent 404, ook na de .png-fix) — pas door een écht
//    werkende tegel-request van NASA's eigen Worldview-tool na te bootsen
//    (Netwerk-tab van worldview.earthdata.nasa.gov) bleek dat deze laag alleen
//    via het oudere KVP-endpoint (wmts.cgi met querystring-parameters)
//    bediend wordt, niet via het REST-pad-endpoint. Worldview gebruikt daar-
//    voor zelf epsg4326 (lengte/breedtegraad), maar epsg3857 (Web Mercator,
//    wat onze kaart al gebruikt) + KVP bleek ook gewoon te werken — dus geen
//    projectie-ombouw nodig, alleen een andere manier van URL's opbouwen.
let satellietLagen = null; // { oost, west } | null
let satellietActief = false;

// Basisbuffer: hoe ver "nu" standaard terug wordt gezet vóór het afronden op
// het laatste 10-minutenblok. Live bevestigd (2026-08-18, via Lex' eigen
// tests): het "best"-endpoint snapt GEEN te recent tijdstip terug naar het
// nieuwste beschikbare frame — een tijdstip van een paar minuten geleden gaf
// gewoon een 404 ("nog niet gepubliceerd"), terwijl exact dezelfde tegel met
// een tijdstip van ~45 minuten terug wél een plaatje gaf. Past bij de ~40 min
// verwerkingsvertraging van deze near-real-time data.
const SATELLIET_BASIS_BUFFER_MIN = 45;

function satellietTijdMetExtraBuffer(extraMinutenTerug) {
  const nu = new Date(Date.now() - (SATELLIET_BASIS_BUFFER_MIN + extraMinutenTerug) * 60 * 1000);
  nu.setUTCMinutes(Math.floor(nu.getUTCMinutes() / 10) * 10, 0, 0);
  return nu.toISOString().replace(/\.\d+Z$/, 'Z');
}

function satellietTijd() {
  return satellietTijdMetExtraBuffer(0);
}

// Losse, "kale" tegel-URL (geen {s}/{z}/{x}/{y}-templateplaatshouders zoals
// satellietUrl() hieronder) — gebruikt door de herpoging-logica in
// toggleSatelliet() om één specifieke mislukte tegel opnieuw op te vragen met
// een ander tijdstip, zonder de hele laag opnieuw te laten opbouwen.
function satellietTegelUrl(laagId, tijdIso, z, x, y) {
  const sub = SATELLIET_SUBDOMEINEN[(x + y) % SATELLIET_SUBDOMEINEN.length];
  return (
    `https://gibs-${sub}.earthdata.nasa.gov/wmts/epsg3857/best/wmts.cgi?` +
    `TIME=${tijdIso}&layer=${laagId}&style=default&tilematrixset=GoogleMapsCompatible_Level7` +
    `&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image%2Fpng&TileMatrix=${z}&TileCol=${x}&TileRow=${y}`
  );
}

const SATELLIET_SUBDOMEINEN = ['a', 'b', 'c'];

function satellietUrl(laagId) {
  // KVP-stijl (wmts.cgi?...), epsg3857 + GoogleMapsCompatible_Level7 — live
  // bevestigd werkend op 2026-08-18 (zie commentaar hierboven). {s} laat
  // Leaflet over de gibs-a/-b/-c subdomeinen verdelen (net als NASA Worldview
  // zelf doet), {z}/{x}/{y} vult Leaflet automatisch in per tegel.
  return (
    `https://gibs-{s}.earthdata.nasa.gov/wmts/epsg3857/best/wmts.cgi?` +
    `TIME=${satellietTijd()}&layer=${laagId}&style=default&tilematrixset=GoogleMapsCompatible_Level7` +
    `&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image%2Fpng&TileMatrix={z}&TileCol={x}&TileRow={y}`
  );
}

// ---- Herpoging per losse tegel, 2026-08-18 ----------------------------------
// Op verzoek van Lex: hij zag structureel grijze gaten/vlekken op de
// satellietlaag, terwijl referentietools (NASA Worldview) daar wél volledige
// dekking tonen. Root cause (bevestigd via zijn eigen Netwerk-tab): niet elke
// tegel is op exact hetzelfde moment "af" — bij het ene, vaste tijdstip dat
// de hele laag gebruikt, kan tegel A allang gepubliceerd zijn terwijl tegel B
// (net een ander stukje van de scan) nog niet klaar is. Vandaar: bij een
// mislukte tegel niet meteen opgeven, maar een paar keer opnieuw proberen met
// een steeds ouder tijdstip (dat IS zo goed als zeker al gepubliceerd). Het
// aantal en de stapgrootte zijn een redelijke inschatting, niet live per stap
// geverifieerd — in het slechtste geval blijft een tegel na alle pogingen
// alsnog leeg (zelfde nette fallback als voorheen), nooit een kapot plaatje.
const SATELLIET_MAX_HERPOGINGEN = 3;
const SATELLIET_HERPOGING_STAP_MIN = 15;

function satellietTegelHerpogen(laagId) {
  return function (event) {
    const tegel = event.tile;
    const poging = Number(tegel.dataset.satellietPoging || 0);
    if (poging >= SATELLIET_MAX_HERPOGINGEN) return; // definitief opgeven — tegel blijft leeg, geen crash
    const nieuwePoging = poging + 1;
    tegel.dataset.satellietPoging = String(nieuwePoging);
    const { x, y, z } = event.coords;
    // event.coords is de RAUWE, nog niet "om de wereld heen gewrapte" tegel-
    // coördinaat (Leaflet past die wrap normaal gesproken zelf toe vlak vóór
    // het opbouwen van de tegel-URL, iets wat we hier handmatig overdoen omdat
    // we niet Leaflet's eigen getTileUrl() gebruiken). Zonder deze correctie
    // kreeg een tegel voorbij de datumgrens (x negatief of ≥ 2^z) een
    // ongeldige TileCol mee — bleek uit een 400-foutmelding i.p.v. de
    // verwachte 404, gevonden dankzij Lex' eigen Netwerk-tab-check.
    const kolommenOpDitNiveau = 2 ** z;
    const xGewrapt = ((x % kolommenOpDitNiveau) + kolommenOpDitNiveau) % kolommenOpDitNiveau;
    const tijd = satellietTijdMetExtraBuffer(nieuwePoging * SATELLIET_HERPOGING_STAP_MIN);
    tegel.src = satellietTegelUrl(laagId, tijd, z, xGewrapt, y);
  };
}

// ---- EUMETSAT Meteosat (MTG), 0° lengtegraad — 2026-08-19 -------------------
// GOES-East houdt ergens rond Frankrijk op (rand van het zichtbare schijfje
// van die satelliet), dus Europa/Afrika/Midden-Oosten bleven zonder wolken-
// dekking. EUMETSAT publiceert zelf een gratis WMS voor hun nieuwe MTG-
// satelliet (Meteosat Third Generation, boven de evenaar op 0°) — dit is GEEN
// NASA GIBS/WMTS-laag zoals GOES, maar een heel andere dienst: een eigen
// GeoServer-WMS op view.eumetsat.int. Gevonden via Lex' eigen Netwerk-tab-
// check in NASA Worldview. Leaflet's L.tileLayer.wms bouwt zelf per tegel de
// juiste BBOX-URL op (geen handmatige {z}/{x}/{y}-template nodig zoals bij de
// GIBS-lagen), en tilet nog steeds gewoon 256x256 zoals een normale laag.
// Onbevestigd/nog niet live getest: (1) of deze server tegels in epsg3857
// (Web Mercator, wat onze kaart gebruikt) teruggeeft — Worldview zelf vroeg
// in epsg4326 op; (2) de publicatievertraging van dit product (20 minuten
// hieronder is een voorzichtige eerste inschatting op basis van de
// 10-minuten-cadans, geen bevestigde meting zoals bij GOES). Bijstellen zodra
// Lex een lege/foutieve laag ziet — zelfde aanpak als bij de GOES-bugs.
const EUMETSAT_WMS_URL = 'https://view.eumetsat.int/geoserver/wms';
const EUMETSAT_LAAG_ID = 'mtg_fd:rgb_geocolour';
const EUMETSAT_BUFFER_MIN = 20;

function eumetsatTijd() {
  const nu = new Date(Date.now() - EUMETSAT_BUFFER_MIN * 60 * 1000);
  nu.setUTCMinutes(Math.floor(nu.getUTCMinutes() / 10) * 10, 0, 0);
  return nu.toISOString().replace(/\.\d+Z$/, 'Z');
}

// 2026-08-21, op verzoek van Lex ("Satelliet crasht als ik te ver uitzoom")
// — root cause: GOES-East/West hierboven staan vast op minNativeZoom/
// maxNativeZoom 6 (deze GIBS-bètalaag heeft écht alleen tegels op dat ene
// niveau, zie de comment daar). Hoe verder je uitzoomt, hoe groter het
// zichtbare gebied dat met die kleine, vaste zoom-6-tegeltjes gevuld moet
// worden — bij zoom 0 betekent dat een raster van 64×64 = 4096 tegels per
// laag, keer twee lagen (Oost+West staan altijd samen aan), en de meeste
// daarvan vallen dan buiten het zichtbare schijfje van de satelliet en geven
// een 404 → satellietTegelHerpogen() probeert elke mislukte tegel nog tot 3x
// opnieuw. Duizenden gelijktijdige image-requests + DOM-tegeltjes is precies
// wat een telefoonbrowser een tabblad doet weggooien. EUMETSAT heeft deze
// vaste-zoom-beperking niet en droeg hier niet aan bij.
// Fix: zolang satelliet aan staat, kan de kaart simpelweg niet verder
// uitzoomen dan dit — Leaflet's eigen minZoom-optie blokkeert dat bij scroll/
// pinch/zoomknoppen net zo goed als bij een programmatische aanroep, dus de
// crash-veroorzakende zoomniveaus worden nooit meer bereikt. Bij het
// uitzetten van satelliet gaat de vloer weer terug naar 0 (de oorspronkelijke
// waarde — er stond nergens anders een minZoom ingesteld op de kaart).
const SATELLIET_MIN_ZOOM = 4;
const KAART_MIN_ZOOM_STANDAARD = 0;

function toggleSatelliet() {
  satellietActief = !satellietActief;
  TOGGLE_SATELLIET_EL.classList.toggle('actief', satellietActief);
  if (!satellietActief) {
    if (satellietLagen) {
      kaart.removeLayer(satellietLagen.oost);
      kaart.removeLayer(satellietLagen.west);
      kaart.removeLayer(satellietLagen.eumetsat);
    }
    kaart.setMinZoom(KAART_MIN_ZOOM_STANDAARD);
    return;
  }
  kaart.setMinZoom(SATELLIET_MIN_ZOOM);
  if (kaart.getZoom() < SATELLIET_MIN_ZOOM) beweegKaartProgrammatisch(() => kaart.setZoom(SATELLIET_MIN_ZOOM));
  if (!satellietLagen) {
    // minNativeZoom = maxNativeZoom = 6: deze "v0 NRT"-bètalaag blijkt in de
    // praktijk alleen tegels te hebben op het hoogste detailniveau (zoom 6) —
    // geen kant-en-klare lagere overzichtsniveaus zoals normale kaartlagen.
    // Bevestigd via Lex' eigen Netwerk-tab: op zoom 4 gaven ALLE tegels 404,
    // ook tegels die middenin beeld vielen (dus niet zomaar "buiten dekking").
    // Door minNativeZoom ook op 6 te zetten, vraagt Leaflet op élk zoomniveau
    // altijd de zoom-6-tegels op en vergroot die zelf (iets korreliger bij ver
    // uitzoomen, maar wél zichtbaar) in plaats van niet-bestaande lagere
    // niveaus op te vragen.
    const opties = {
      pane: 'satellietPane',
      opacity: 0.75,
      minNativeZoom: 6,
      maxNativeZoom: 6,
      subdomains: ['a', 'b', 'c'],
      // 2026-08-19: verkort, zelfde reden als bij Regenradar hierboven (te
      // lange gecombineerde attributieregel bij meerdere actieve lagen).
      attribution: 'NASA GIBS',
    };
    satellietLagen = {
      oost: L.tileLayer(satellietUrl('GOES-East_ABI_GeoColor'), opties),
      west: L.tileLayer(satellietUrl('GOES-West_ABI_GeoColor'), opties),
      eumetsat: L.tileLayer.wms(EUMETSAT_WMS_URL, {
        layers: EUMETSAT_LAAG_ID,
        format: 'image/png',
        transparent: true,
        version: '1.3.0',
        uppercase: true, // zodat de query-string TIME=/LAYERS=/FORMAT= gebruikt, zoals bevestigd in Lex' Netwerk-tab
        time: eumetsatTijd(),
        pane: 'satellietPane',
        opacity: 0.75,
        attribution: 'EUMETSAT',
      }),
    };
    satellietLagen.oost.on('tileerror', satellietTegelHerpogen('GOES-East_ABI_GeoColor'));
    satellietLagen.west.on('tileerror', satellietTegelHerpogen('GOES-West_ABI_GeoColor'));
    // Nog geen herpoging-per-tegel voor EUMETSAT: dat is een heel ander
    // (WMS/BBOX-)URL-schema dan de GIBS-tegel-URL's, dus satellietTegelHerpogen
    // hierboven is er niet direct op toepasbaar. Eerst even zien of dit
    // probleem hier überhaupt optreedt vóór we die complexiteit toevoegen.
  }
  satellietLagen.oost.addTo(kaart);
  satellietLagen.west.addTo(kaart);
  satellietLagen.eumetsat.addTo(kaart);
}

// ---- "Aarde nu" — EUMETSAT's eigen live YouTube-stream, 2026-08-19 ---------
// Op verzoek van Lex, n.a.v. het "draaiende bol"-idee: een zelf-gebouwde 3D-
// bol (Three.js/globe.gl) is een fors project; EUMETSAT biedt op
// eumetsat.int/real-time-imagery/earth-view zelf al continue YouTube-
// livestreams van Meteosat-beeld (Europa/Afrika/Atlantische Oceaan/etc.),
// inclusief een officiële embed-handleiding (kopieer het <iframe>-blok uit
// YouTube's eigen Share-menu). Bewust GEEN opstartscherm — dit is een
// alarmerings-app, dus geen vertraging vóór de kaart zichtbaar is (zie ook
// de afweging in het overleg met Lex). De iframe wordt pas aangemaakt bij het
// eerste keer aanzetten, niet bij het laden van de app, zodat wie 'm nooit
// gebruikt ook geen YouTube-verkeer/cookies binnenkrijgt.
//
// 2026-08-19, bevestigd via screenshot van Lex van EUMETSAT's eigen pagina:
// de tab "EARTH VIEW - MTG FCI ATLANTIC OCEAN GEOCOLOUR" toont wél de ronde
// bol (curvature + zwarte ruimte eromheen) — dat is wat Lex wilde ("ik wil de
// bol"), in tegenstelling tot de eerder gekozen "Europe"-stream. Video-ID
// overgenomen op dezelfde positie (3e van zes) als op EUMETSAT's pagina.
const AARDE_VIDEO_ID = '1RxnnypuvYQ';
const AARDE_OVERLAY_EL = document.getElementById('aardeOverlay');
const AARDE_VIDEO_EL = document.getElementById('aardeVideo');
const AARDE_LADEN_EL = document.getElementById('aardeLaden');
const TOGGLE_AARDE_EL = document.getElementById('toggleAarde');
const HEMEL_ACTIES_EL = document.getElementById('hemelActies');
const AARDE_SLUITEN_EL = document.getElementById('aardeSluiten');
let aardeActief = false;
let aardePlayer = null;

// 2026-08-19: eerdere pogingen om YouTube's eigen titel-overlay te lokaliseren
// (afdekken) of de datum eruit te lezen (via getVideoData().title) werkten
// geen van beide betrouwbaar zonder visuele feedback — dus andere aanpak op
// verzoek van Lex: laat de hele opstart (waarin die overlay/branding
// zichtbaar is) gewoon volledig ongezien gebeuren achter een zwart scherm,
// en onthul de video pas erna. Geen positie-giswerk meer nodig.
// 2026-08-20-fix, op verzoek van Lex ("de opstarttijd van Aarde nu laten
// vervallen, meteen de aardbol tonen") — de 5,5 seconden wachttijd hierboven
// (bedoeld om YouTube/EUMETSAT's eigen titel-overlay te verbergen) mag weg:
// het zwarte scherm verdwijnt nu meteen zodra de player klaar is, ook als dat
// betekent dat die overlay heel even meekomt.
function laadAardePlayer() {
  AARDE_LADEN_EL.style.display = 'block';
  // controls:0/fs:0 verbergt YouTube's eigen tijdbalk — die toont de hele
  // buffer van de 24/7-livestream (kan dagen beslaan) en gaf Lex het
  // verwarrende "ik zie niet wat wat is"-effect.
  aardePlayer = new YT.Player('aardeVideo', {
    videoId: AARDE_VIDEO_ID,
    playerVars: { autoplay: 1, mute: 1, controls: 0, disablekb: 1, fs: 0, modestbranding: 1, rel: 0, iv_load_policy: 3 },
    events: {
      onReady: () => { AARDE_LADEN_EL.style.display = 'none'; },
    },
  });
}

function toonAarde() {
  aardeActief = true;
  TOGGLE_AARDE_EL.classList.add('actief');
  AARDE_OVERLAY_EL.style.display = 'block';
  if (!aardePlayer) {
    if (window.YT && window.YT.Player) {
      laadAardePlayer();
    } else {
      const bestaandeCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        bestaandeCallback?.();
        laadAardePlayer();
      };
      if (!document.getElementById('youtubeIframeApiScript')) {
        const tag = document.createElement('script');
        tag.id = 'youtubeIframeApiScript';
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
    }
  }
}

function verbergAarde() {
  aardeActief = false;
  TOGGLE_AARDE_EL.classList.remove('actief');
  AARDE_OVERLAY_EL.style.display = 'none';
  // Player bewust niet vernietigen (blijft draaien, gewoon verborgen) — zo
  // hoeft de stream bij een volgende keer aanzetten niet opnieuw te laden, en
  // hoeft het zwarte opstartscherm dus ook maar één keer per sessie te tonen.
}

function toggleAarde() {
  if (aardeActief) verbergAarde();
  else toonAarde();
}

// Was voorheen alleen onderdeel van wisselWeergave(true) ("Weer"-stand) —
// die aparte stand is op 2026-08-18 weggehaald (deed toch niks anders dan
// deze balk tonen/verbergen), dus deze laadt nu meteen bij het opstarten van
// de kaart. Radar/Satelliet zijn sindsdien onafhankelijke, altijd-zichtbare
// bediening, los van welke gevaren-iconen je ziet.
async function initRadar() {
  if (!radarFramesOpgehaald) {
    radarFramesOpgehaald = true; // niet opnieuw proberen als het één keer faalt
    try {
      const data = await fetch('https://api.rainviewer.com/public/weather-maps.json').then((r) => r.json());
      const verleden = data.radar?.past ?? [];
      const voorspelling = data.radar?.nowcast ?? [];
      radarFrames = [...verleden, ...voorspelling];
      radarNuIndex = verleden.length - 1;
    } catch (err) {
      console.error('[weer] wolkenfilm kon niet geladen worden:', err);
    }
  }

  if (!radarFrames.length) return;
  toonRadarFrame(radarNuIndex); // start bij "nu", niet bij het oudste frame
  radarLagen.a.addTo(kaart);
  radarLagen.b.addTo(kaart);
  // Niet automatisch laten afspelen — dat voelde als een storend "flitsend"
  // beeld direct bij het openen van de app. Gewoon het huidige moment
  // statisch tonen; ▶ start de lus pas op eigen verzoek.
}

// 2026-08-19: stond een tijdje standaard AAN (zie oudere geschiedenis hier),
// maar op Lex' verzoek weer terug naar standaard UIT — de knop blijft gewoon
// als handmatige schakelaar beschikbaar, alleen niet meer automatisch actief
// bij het openen van de app.
let regenradarAan = false;

// Zoomniveau waarop de radar goed te zien is — bij het standaard startzoom
// (6, zie initMap()) oogt de regenradar vaak nietszeggend/te grof. Op Lex'
// verzoek ("meteen een zoomfactor die hem toont") zoomt de kaart bij het
// aanzetten automatisch naar dit niveau, gecentreerd op thuis.
// 2026-08-19: eerst op 8 gezet, maar op een smal telefoonscherm (portret)
// bleek dat de regen soms net buiten beeld viel (die zat wat westelijker,
// richting de kust) terwijl 'ie bij een fractie verder uitgezoomd wél
// zichtbaar was — bevestigd met Lex' eigen screenshots. Iets ruimer (7) geeft
// meer marge zonder terug te vallen op het te-grove startzoom (6).
const REGENRADAR_ZOOM = 7;

// 2026-08-21, op verzoek van Lex ("Regenradar heeft ook niet altijd het
// minimaal benodigde zoomniveau") — deze vloer werd tot nu toe alleen
// afgedwongen op het moment dat je de radar zelf aanzet (zie
// toggleRegenradar() hieronder). Andere programmatische kaartsprongen
// negeerden 'm gewoon: gaNaarStart() (Home) zet altijd hard zoom 6 (< 7),
// en centreerOpMelding()'s fitBounds-pad (een groot gebied als een
// tornado-watch-polygon in beeld draaien) kan met gemak op een lagere zoom
// uitkomen. Bewust GEEN doorlopende zoomend-listener die dit continu
// afdwingt — dat zou het "handmatig zoomniveau springt vanzelf terug"-
// probleem van 2026-08-20 opnieuw introduceren (zie kaart.on('zoomend
// dragend', ...) in initListeners()); een handmatige uitzoom-actie van Lex
// zelf moet met rust blijven. Deze helper wordt daarom alleen aangeroepen
// vanuit de bestaande programmatische sprongen zelf, nooit los.
function dwingRegenradarZoomAf() {
  if (regenradarAan && kaart && kaart.getZoom() < REGENRADAR_ZOOM) kaart.setZoom(REGENRADAR_ZOOM);
}

// 2026-08-21, op verzoek van Lex ("ik kan op het play knopje drukken bij de
// regenradar, maar dan moet eerst de knop regenradar gekozen zijn anders doet
// ie niks — verbergen tot op regenradar geklikt"). De ▶-knop en het
// tijd-label horen alleen bij de regenradar, dus die verschijnen nu pas zodra
// die laag daadwerkelijk aanstaat. Bewust display:none (en niet alleen
// `disabled`): een uitgegrijsde knop die niks doet is nog steeds ruimte in een
// balk waar het al krap is, en Lex vroeg letterlijk om verbergen. Scheelt in
// de standaardstand (regenradar uit) meteen twee items breedte in de balk.
function zorgRadarBedieningZichtbaar() {
  const zichtbaar = regenradarAan ? '' : 'none';
  RADAR_SPEEL_EL.style.display = zichtbaar;
  RADAR_TIJD_EL.style.display = zichtbaar;
}

function toggleRegenradar() {
  regenradarAan = !regenradarAan;
  TOGGLE_REGENRADAR_EL.classList.toggle('actief', regenradarAan);
  zorgRadarBedieningZichtbaar();
  if (regenradarAan) {
    initRadar();
    // 2026-08-19-bug: dit deed eerst kaart.setView([THUIS...]) — pakte je dus
    // terug naar huis, ook als je net ergens anders naar aan het kijken was
    // (Lex: had 'm aangezet bij orkaan Lala, werd teruggeflitst naar Home).
    // Fix: alleen de ZOOM aanpassen, de positie/pan blijft altijd met rust.
    // 2026-08-22, op verzoek van Lex ("als ik klik op de knop regenradar moet
    // altijd het juiste zoomniveau worden gekozen") — voorheen alleen een
    // VLOER (`< REGENRADAR_ZOOM`): als je al verder ingezoomd was dan 7 deed
    // de knop niets, dus "het juiste niveau" was dan niet gegarandeerd. Nu
    // altijd naar REGENRADAR_ZOOM, ongeacht het huidige zoomniveau — bewust
    // GEEN kaart.setMinZoom() erbij (dat zou, net als bij Satelliet, een
    // harde ondergrens worden die handmatig uitzoomen daarna blokkeert; dit
    // is puur een eenmalige sprong op het moment van aanzetten).
    if (kaart) beweegKaartProgrammatisch(() => kaart.setZoom(REGENRADAR_ZOOM));
  } else {
    radarAfspelenStop();
    if (radarLagen) {
      kaart.removeLayer(radarLagen.a);
      kaart.removeLayer(radarLagen.b);
    }
    RADAR_TIJD_EL.textContent = '—';
  }
}

// 2026-08-20, op verzoek van Lex ("als ik op een label in de kaart klik...
// hele venster daarvoor gebruiken, knop om eruit te gaan") — de schermvullende
// popup-overlay (#labelPopupOverlay, index.html) en zijn tekstgrootte-
// "trapje" (Lex' eigen woord). Geopend via een klik-listener op de al
// geopende kleine Leaflet-popup zelf (zie kaart.on('popupopen', ...) in
// initListeners()) — dus werkt automatisch voor elke categorie, zonder
// Leaflet's eigen popup-gedrag (ook bij het "Kijk op Kaart"-pad via
// marker.openPopup(), zie centreerOpMelding()) te veranderen.
const TEKSTGROOTTE_STAPPEN = ['klein', 'normaal', 'groot', 'extra-groot'];
// Bewust module-scoped (niet per-popup gereset) — als Lex 'm eenmaal groter
// zet, blijft die voorkeur staan voor de volgende labels die hij aantikt.
let tekstgrootteIndex = 1; // 'normaal'

function pasPopupTekstgrootteToe() {
  TEKSTGROOTTE_STAPPEN.forEach((stap) => LABEL_POPUP_INHOUD_EL.classList.remove(`tekst-${stap}`));
  LABEL_POPUP_INHOUD_EL.classList.add(`tekst-${TEKSTGROOTTE_STAPPEN[tekstgrootteIndex]}`);
  LABEL_POPUP_KLEINER_EL.disabled = tekstgrootteIndex === 0;
  LABEL_POPUP_GROTER_EL.disabled = tekstgrootteIndex === TEKSTGROOTTE_STAPPEN.length - 1;
}

function wijzigPopupTekstgrootte(richting) {
  tekstgrootteIndex = Math.min(TEKSTGROOTTE_STAPPEN.length - 1, Math.max(0, tekstgrootteIndex + richting));
  pasPopupTekstgrootteToe();
}

function toonVolledigSchermPopup(html) {
  LABEL_POPUP_INHOUD_EL.innerHTML = html;
  pasPopupTekstgrootteToe();
  LABEL_POPUP_OVERLAY_EL.classList.remove('verborgen');
}

// Aparte, kortere titel + een gedempte detailregel eronder — voorkomt dat
// bijv. een landenlijst bij een grote cycloon de hele titel dichtslibt (zie
// gdacs.js: de titel zelf blijft kort, de volledige lijst zit in detail.land).
// 2026-08-19: 'aardbeving' en 'orkaan' hebben allebei al een eigen
// popup-stats-blokje in popupExtraHtml() (magnitude/diepte/afstand resp.
// windkracht/druk) — sinds detail.subtitel breed is ingevoerd voor de
// meldingenlijst gaf dat hier dubbele info te zien (subtitel én het eigen
// blokje zeiden zowat hetzelfde). Voor die categorieën slaan we subtitel hier
// dus bewust over; andere categorieën (die geen eigen stats-blokje hebben)
// gebruiken 'm nog gewoon als subregel.
const CATEGORIEEN_MET_EIGEN_POPUP_STATS = new Set(['aardbeving', 'orkaan']);

function popupHtml(s) {
  const subtitelOfNull = CATEGORIEEN_MET_EIGEN_POPUP_STATS.has(s.categorie) ? null : s.detail?.subtitel;
  const detailregel = s.detail?.land ?? subtitelOfNull ?? s.detail?.gebied ?? null;
  // 2026-08-20: tijdregel (zie tijdstempelTekst hierboven) staat er nu altijd
  // bij, ook als er al een detailregel is — voorheen verdween elke tijds-
  // aanduiding zodra er een detailregel was (Lex: "geen enkel time/datestamp"
  // bij tornado bevestigd, die altijd een gebied heeft).
  // 2026-08-20-fix: klokje ervoor — zie dezelfde fix + toelichting in
  // maakMeldingItem() hieronder ("wat wordt hier aan tijden bedoeld... 12:13
  // zie ik ergens los staan?", bij een meteoalarm met een eigen "geldig
  // van–tot"-periode oogde de losse tijd anders als een derde, onverklaarde
  // datum/tijd).
  const tijdregel = tijdregelVoorSignaal(s);
  // 2026-08-25: ontvangst-badge (zie navtexOntvangstBadge hierboven) als
  // extra subregel-onderdeel, zelfde plek/stijl als detailregel/tijdregel —
  // puur informatieve tekst, geen pil, dus hier en niet bij pilHtml verderop.
  const ontvangstregel = navtexOntvangstBadge(s);
  const subDelen = [detailregel, tijdregel ? `<span class="tijd-icoon-mat">🕓</span> ${tijdregel}` : null, ontvangstregel].filter(Boolean);
  const subHtml = subDelen.length ? `<div class="popup-sub">${subDelen.join(' · ')}</div>` : '';
  // 2026-08-20: detail.verlopen (zie historie.js) — dit is geen actuele
  // melding meer, alleen een tot 48u terug bewaarde trail op de kaart. Dat
  // moet meteen duidelijk zijn in de popup, anders lijkt een verlopen
  // waarschuwing zomaar weer een actuele.
  const verlopenHtml = s.detail?.verlopen
    ? `<div class="popup-verlopen">🕓 Verlopen${tijdstempelTekst(s.detail.verlopenSinds) ? ` sinds ${tijdstempelTekst(s.detail.verlopenSinds)}` : ''}</div>`
    : '';
  // 2026-08-24, op verzoek van Lex ("als ik op het item klik dan navigeer ik
  // naar de kaart maar daar zie ik het normale icon, kan de pil daar ook") —
  // centreerOpMelding() opent na het pannen/zoomen altijd meteen de popup
  // (marker.openPopup(), zie hierboven), dus dít is waar hij 'm mist. Zelfde
  // BEVESTIGD-pil als in de meldingenlijst/verlopen-sectie. Bewust alleen
  // voor tornado-bevestigd — de bredere pil-logica (EMERGENCY/PDS/OP DE
  // GROND/weerwaarschuwing) heeft nooit in de popup gestaan en dat is hier
  // niet gevraagd, dus die laat ik met rust.
  const pilHtml = s.categorie === 'tornado-bevestigd' ? `<span class="pil grijs">BEVESTIGD</span>` : '';
  const titelHtml = riglijstTitelHtml(s) ?? s.titel;
  // 2026-08-24, op verzoek van Lex ("het icon waarop werd geklikt als grote
  // kopie bij de tekst... dan zie je ook eindelijk eens goed hoe mooi die
  // icons zijn") — zelfde hazardIconHtml(s) als de kaart-pin, alleen hier
  // uitvergroot via .popup-icoon-groot (zie styles.css) i.p.v. de kleine
  // pin-maat, links naast de titel/subtekst.
  const icoonGrootHtml = `<div class="popup-icoon-groot">${hazardIconHtml(s)}</div>`;
  const tekstHtml = `<div class="popup-titel">${pilHtml}${titelHtml}</div>${verlopenHtml}${subHtml}`;
  return `<div class="popup-kop"><div class="popup-kop-tekst">${tekstHtml}</div>${icoonGrootHtml}</div>${popupExtraHtml(s)}`;
}

// 2026-08-24, op verzoek van Lex: eerst een los amber blokje ONDER de titel
// toegevoegd voor het ID/naam van het specifieke rig-platform (zie
// splitsRiglijst() in navtexLokaal.js/ukho.js — een riglijst-bericht wordt
// uitgesplitst naar één los puntsignaal per platform, maar de titel op de
// backend bevat de platformnaam ook al gewoon, dus dat gaf de naam TWEE keer
// te zien). Op Lex' verzoek ("die in amber tonen? en de andere vervallen?")
// samengevoegd: de titel zelf krijgt nu een amber <span> om precies het
// platformnaam-onderdeel, de rest van de titel-tekst blijft ongemoeid.
// Bewust NIET gedaan door de backend een <span> in het titel-veld te laten
// zetten — s.titel wordt ook los (als platte tekst) gebruikt in de
// Meldingenlijst/maanfase/weer-conditie elders in dit bestand, en dat zou
// daar dan als letterlijke "<span..."-tekst verschijnen. Bouwt de titel hier
// dus opnieuw op uit s.detail (dezelfde velden als de backend gebruikte om
// s.titel te maken), puur voor déze popup-weergave.
function riglijstTitelHtml(s) {
  if (s.categorie !== 'navtex' || s.detail?.eventType !== 'riglijst') return null;
  const d = s.detail;
  // navtexLokaal.js zet titel altijd met het vaste woord "NAVTEX" vooraan;
  // ukho.js gebruikt daar w.type (bv. "NAVAREA 1") — zie detail.bron.
  const kop = d.bron === 'ukho' ? d.land : 'NAVTEX';
  const naamHtml = d.positie?.naam
    ? `<span class="popup-rig-naam">${escapeHtml(d.positie.naam)}</span>`
    : `<span class="popup-rig-naam popup-rig-naam-onbekend">Onbekend platform</span>`;
  const tellerHtml = d.riglijstTotaal > 1 ? ` <span class="popup-rig-teller">(${d.riglijstIndex + 1}/${d.riglijstTotaal})</span>` : '';
  return `${escapeHtml(kop ?? '')} — ${escapeHtml(d.eventLabel ?? '')} — ${naamHtml}${tellerHtml} — ${escapeHtml(d.station ?? '')}`;
}

// Simpele HTML-escape voor tekst die in een attribuut (title="...") belandt —
// voorkomt dat een aanhalingsteken in een Reddit-posttitel de markup breekt.
function escapeAttr(tekst) {
  return String(tekst ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

// 2026-08-20: volledige HTML-content-escape (i.t.t. escapeAttr hierboven,
// die alleen voor attributen is en < / > bewust ongemoeid laat) — nodig
// zodra ongecontroleerde, extern gescrapete tekst (bv. het ruwe NAVTEX-
// bericht, zie navtex.js — tier 'community', geen officiële bron) rechtstreeks
// als innerHTML-inhoud belandt i.p.v. in een attribuut. Zonder dit zou een
// toevallige "<" of ">" in zo'n bericht de popup-markup kunnen breken of, in
// het slechtste geval, ongewenste HTML injecteren.
function escapeHtml(tekst) {
  return String(tekst ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// 2026-08-20: de eerdere "tik op de tekst om te vergroten"-truc
// (tikVergrootTekst(), per-element) is hier weggehaald — sinds elke popup nu
// schermvullend opent (zie toonVolledigSchermPopup() verderop) is er altijd
// al ruim plek voor de volledige tekst, en regelt de tekstgrootte-stepper in
// die overlay het vergroten voor de hele popup ineens i.p.v. per tekstblok.

// Extra popup-inhoud per categorie — plaatjes, statregels, links. Bewust hier
// gecentraliseerd i.p.v. verspreid, zodat één blik op deze functie laat zien
// welke categorieën welke verrijking tonen. Elk blok is onafhankelijk: mist
// een veld (nog niet geladen/nooit geverifieerd/best-effort mislukt), dan
// verschijnt dat ene blokje simpelweg niet — de rest van de popup blijft
// intact. Een <img> die niet laadt (bijv. een verkeerd gegokte satelliet-
// sectorcode) verwijdert zichzelf via onerror i.p.v. een kapot-plaatje-icoon
// te tonen.
function popupExtraHtml(s) {
  const d = s.detail ?? {};
  const blokken = [];

  // 2026-08-19: community-media (foto's/video's — Wikimedia Commons, Reddit,
  // Bluesky, zie backend/src/sources/media.js) stond eerst hardcoded alleen
  // in het orkaan-blok hieronder. Op verzoek van Lex ("vrije hand... voor
  // elke categorie akkoord... video mag ook") nu generiek: elke categorie
  // waarvan de backend een communityMedia-array meestuurt, krijgt hier
  // vanzelf een fotostrip — geen aparte code per categorie meer nodig.
  if (d.communityMedia?.length) blokken.push(popupFotostripHtml(d.communityMedia));

  if (s.categorie === 'orkaan') {
    const stats = [];
    if (d.windKt != null) stats.push(`${Math.round(d.windKt)} kt wind`);
    if (d.drukHpa != null) stats.push(`${Math.round(d.drukHpa)} hPa`);
    if (stats.length) blokken.push(`<div class="popup-stats">${stats.join(' · ')}</div>`);
    // Los statisch STAR CDN-satellietplaatje hier is op 2026-08-18 weggehaald
    // op verzoek van Lex ("valt uit beeld, meer last dan gemak, overkill") —
    // nu de interactieve GIBS-kaartlaag (zie 🛰️ Satelliet-knop) gewoon goed
    // werkt, was dit vaste plaatje overbodig geworden.
    if (d.stormSurgeTekst) blokken.push(`<div class="popup-surge">🌊 ${d.stormSurgeTekst}</div>`);
    // 2026-08-20: niet meer afgekapt op 220 tekens (zie geschiedenis
    // hieronder) — de volledige tekst staat er nu altijd, en wordt sinds de
    // schermvullende-popup-fix (zie toonVolledigSchermPopup()) sowieso altijd
    // ruim en leesbaar getoond, dus geen losse tik-om-te-vergroten-truc meer
    // nodig.
    if (d.adviesTekst) {
      blokken.push(`<div class="popup-advies">${escapeHtml(d.adviesTekst)}</div>`);
    }
    if (d.publicAdvisoryUrl) {
      blokken.push(`<a class="popup-link" href="${d.publicAdvisoryUrl}" target="_blank" rel="noopener">Volledige advisory op nhc.gov →</a>`);
    }
  }

  if (s.categorie === 'aardbeving') {
    const stats = [];
    if (d.magnitude != null) stats.push(`M${d.magnitude}`);
    if (d.diepteKm != null) stats.push(`${d.diepteKm}km diep`);
    if (d.afstandTotJouKm != null) stats.push(`${d.afstandTotJouKm}km van jou`);
    if (stats.length) blokken.push(`<div class="popup-stats">${stats.join(' · ')}</div>`);
    if (d.shakemapUrl) {
      blokken.push(`<img class="popup-foto" src="${d.shakemapUrl}" alt="ShakeMap" loading="lazy" onerror="this.remove()">`);
    }
    if (d.bronUrl) blokken.push(`<a class="popup-link" href="${d.bronUrl}" target="_blank" rel="noopener">Meer info op usgs.gov →</a>`);
  }

  if (s.categorie === 'cycloonvorming' && d.kansTekst) {
    blokken.push(`<div class="popup-stats">${d.kansTekst}</div>`);
  }

  // 2026-08-20, op verzoek van Lex ("laten we dat wel gelijk in de app
  // trekken") — het volledige NAVTEX-bericht (ruwe telextekst) plus wat het
  // opzocht heeft: zendstation, land, of de positie uit het bericht zelf
  // kwam of een schatting via het station is (zie navtex.js). Geen
  // ernst-stats-blokje zoals aardbeving/orkaan — een NAVTEX-bericht is vooral
  // tekst, geen paar losse kerngetallen.
  if (s.categorie === 'navtex') {
    const stats = [];
    if (d.station) stats.push(d.station + (d.land ? ` (${d.land})` : ''));
    if (d.afstandTotJouKm != null) stats.push(`${d.afstandTotJouKm}km van jou`);
    if (stats.length) blokken.push(`<div class="popup-stats">${stats.join(' · ')}</div>`);
    // 2026-08-24: het ID/naam van een specifiek rig-platform staat sinds
    // vandaag al amber IN de titel zelf, zie popupHtml() — geen apart
    // blokje hier meer nodig (dat gaf dubbele info, zie de geschiedenis in
    // popupHtml() bij riglijstTitelHtml()).
    // 2026-08-20: niet meer afgekapt op 260 tekens — de schermvullende popup
    // (zie toonVolledigSchermPopup()) heeft ruim genoeg plek voor het
    // volledige bericht, geen losse tik-om-te-vergroten-truc meer nodig.
    // 2026-08-26, op verzoek van Lex, na de boei-lijst-splitsing hierboven
    // (zie splitsBoeiLijst() in navtexLokaal.js): bij een losse boei UIT zo'n
    // lijst niet het hele berichtblok tonen (dat geldt voor ALLE boeien in
    // de lijst samen, niet specifiek voor deze ene) -- alleen de eigen
    // naam/classificatie van DEZE boei, dezelfde tekst die ook al kort in de
    // titel staat (zie navtexLokaal.js), hier voluit.
    if (d.boeiNaam) {
      blokken.push(`<div class="popup-advies">${escapeHtml(d.boeiNaam)}</div>`);
    } else if (d.bericht) {
      blokken.push(`<div class="popup-advies">${escapeHtml(d.bericht)}</div>`);
    }
    if (d.positieUitBericht === false) {
      blokken.push('<div class="popup-sub">📍 positie geschat via zendstation — geen coördinaat in het bericht zelf gevonden</div>');
    }
  }

  return blokken.length ? `<div class="popup-extra">${blokken.join('')}</div>` : '';
}

// Kleine media-strip voor ongemodereerde community-foto's/video's (Wikimedia
// Commons, Reddit, Bluesky — zie backend/src/sources/media.js) — altijd met
// een expliciet "community, ongecontroleerd"-label, zodat dit nooit aanziet
// voor officieel beeldmateriaal (NOAA/USGS/etc.). Elk item linkt door naar de
// oorspronkelijke bronpagina i.p.v. alleen een los plaatje te tonen. We
// spelen video hier bewust niet inline af (thumbnail + ▶-badge i.p.v. een
// <video>-element): het zijn clips van willekeurige, niet-gemodereerde
// externe bronnen, en direct inline afspelen zou zonder enige controle
// content van derden laten draaien in de popup — een klik-door naar de
// bronpagina is hier de veiligere keuze.
function popupFotostripHtml(items) {
  const html = items
    .map((m) => {
      const badge = m.type === 'video' ? '<span class="popup-fotostrip-play">▶</span>' : '';
      return `<a href="${m.link}" target="_blank" rel="noopener" title="${escapeAttr(m.titel)}" class="popup-fotostrip-item"><img src="${m.thumbUrl ?? m.url}" alt="${m.type === 'video' ? 'Communityvideo' : 'Communityfoto'}" loading="lazy" onerror="this.closest('a').remove()">${badge}</a>`;
    })
    .join('');
  return `<div class="popup-fotostrip">${html}</div><div class="popup-fotostrip-label">📷 community, ongecontroleerd</div>`;
}

// Lifeliner (traumahelikopter) krijgt een eigen geel icoon i.p.v. de
// generieke 🚨/ernst-kleur van de rest van de hulpdiensten-categorie, op
// verzoek van Lex — een helikopter in de lucht is heel anders te herkennen
// dan een grondgebonden uitruk, dat mag ook zo ogen. `is-lifeliner` vervangt
// de ernst-klasse (i.p.v. ernaast) zodat de vaste gele kleur niet per ongeluk
// weer overschreven wordt door een ernst-kleurregel.
function isLifeliner(s) {
  return s.categorie === 'hulpdiensten' && s.detail?.discipline === 'lifeliner';
}

// Handgetekende silhouet-helikopter (rotor/mast/romp/staartboom/staartrotor/
// skids), allemaal in dezelfde gele kleur gevuld — het 🚁-emoji zelf kan geen
// eigen kleur krijgen (is een vast gekleurde glyph, geen monochrome/CSS-
// kleurbare vorm), vandaar een eigen SVG i.p.v. de emoji, puur voor Lifeliner.
const LIFELINER_HELI_SVG = `
  <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="5.2" width="20" height="1.4" rx="0.7" fill="#ffd633"/>
    <rect x="11.3" y="6.5" width="1.4" height="2.2" fill="#ffd633"/>
    <ellipse cx="11" cy="13" rx="5.5" ry="3.6" fill="#ffd633"/>
    <rect x="15.5" y="12.2" width="6" height="1.6" rx="0.6" fill="#ffd633"/>
    <rect x="20.4" y="9.5" width="1.3" height="5" fill="#ffd633"/>
    <line x1="8" y1="16.4" x2="8" y2="19.3" stroke="#ffd633" stroke-width="1.3" stroke-linecap="round"/>
    <line x1="14" y1="16.4" x2="14" y2="19.3" stroke="#ffd633" stroke-width="1.3" stroke-linecap="round"/>
    <line x1="5.5" y1="19.3" x2="16.5" y2="19.3" stroke="#ffd633" stroke-width="1.3" stroke-linecap="round"/>
  </svg>
`.trim();

// 2026-08-21, op verzoek van Lex ("de kaart standaard groot altijd groot...
// het wisselen tussen klein en groot mag dus vervallen") — de kaart is nu
// altijd in de grote weergave (zie #viewKaart in styles.css, geen
// .kaart-uitvergroot-klasse meer nodig), dus de hele toggle
// (kaartUitvergroot/toggleKaartUitvergroot(), de driehoekknop) is vervallen.

// 2026-08-20, op verzoek van Lex — eerst 🛟 (reddingsboei-emoji), toen een
// dunne-lijnen bakenicoon (beviel ook niet: "we moeten even zoeken wat goed
// werkt"), nu een derde poging op basis van een nieuwe referentie-afbeelding:
// een donkere bolboei met een oranje band en een oranje vlaggetje op een
// staaf — een klassiek gevaar-/markeringsboei-silhouet. Gevuld i.p.v.
// lijntekening (currentColor/stroke dus hier niet relevant, eigen kleuren).
// Nog steeds alleen voor de kaart-marker, zelfde aanpak als LIFELINER_HELI_SVG
// hierboven; 🛟 blijft de EMOJI_PER_CATEGORIE-fallback voor lijsten/legenda.
const NAVTEX_BOEI_SVG = `
  <svg viewBox="0 0 24 24" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
    <defs><clipPath id="navtexBoeiClip"><circle cx="12" cy="16" r="6"/></clipPath></defs>
    <line x1="12" y1="3" x2="12" y2="10.5" stroke="#3a3d47" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M12 3.2 L18.5 5.6 L12 8.2 Z" fill="#ff8a1f"/>
    <circle cx="12" cy="16" r="6" fill="#3a3d47"/>
    <rect x="5.5" y="14.7" width="13" height="2.6" fill="#ff8a1f" clip-path="url(#navtexBoeiClip)"/>
  </svg>
`.trim();

// 2026-08-26, op verzoek van Lex ("de boei moet er anders uit zien dan de
// generieke") -- tot nu toe viel 'boei-nieuw' (zie EVENT_REGELS in
// navtexLokaal.js/ukho.js: "LIGHTBUOY ... ESTABLISHED"/"BUOY DEPLOYED") niet
// op in NAVTEX_EVENT_ICOON hieronder en kreeg daardoor toevallig hetzelfde
// icoon als een compleet ongeclassificeerd bericht ('overig') -- NAVTEX_BOEI_SVG
// hierboven is namelijk de terugval voor ALLES zonder eigen icoon, dus geen
// bewust onderscheid, puur toeval dat het er goed uitzag. Dit is dezelfde
// boei-vorm (blijft herkenbaar als boei), maar in groen i.p.v. donker/oranje
// (zelfde groen als de NIEUW-pil elders in de app, zie .pil.groen in
// styles.css -- "net geplaatst" hergebruikt dezelfde kleurtaal als "nieuw").
// Extra plusje rechtsboven als tweede, vorm-gebaseerd onderscheid (zelfde
// aanpak als de rode kruisjes bij NAVTEX_LICHT_UIT_SVG hieronder) zodat het
// verschil ook zonder kleurwaarneming te zien is.
const NAVTEX_BOEI_NIEUW_SVG = `
  <svg viewBox="0 0 24 24" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
    <defs><clipPath id="navtexBoeiNieuwClip"><circle cx="12" cy="16" r="6"/></clipPath></defs>
    <line x1="12" y1="3" x2="12" y2="10.5" stroke="#1f4d33" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M12 3.2 L18.5 5.6 L12 8.2 Z" fill="#3dff8a"/>
    <circle cx="12" cy="16" r="6" fill="#1f4d33"/>
    <rect x="5.5" y="14.7" width="13" height="2.6" fill="#3dff8a" clip-path="url(#navtexBoeiNieuwClip)"/>
    <g stroke="#3dff8a" stroke-width="1.5" stroke-linecap="round">
      <line x1="19" y1="10" x2="19" y2="13.6"/>
      <line x1="17.2" y1="11.8" x2="20.8" y2="11.8"/>
    </g>
  </svg>
`.trim();

// 2026-08-24, op verzoek van Lex ("ipv de drum", met een boortoren-lijntekening
// als voorbeeld, daarna "of deze als we wit gaan zien" met een tweede
// vergelijkbare referentie) — eigen booreiland/derrick-icoon voor
// riglijst-signalen i.p.v. het 🛢️-vat-emoji. WIT (i.p.v. het donkere
// #3a3d47 van de boei hierboven) — de bestaande `.navtex-pin svg`-CSS geeft
// elk icoon hier al een donkere drop-shadow-rand voor leesbaarheid tegen
// lichte ondergrond (zie styles.css), dus dat werkt ook voor een wit
// icoon zonder aparte CSS. Kleine antenne/kroonblokje bovenaan, taps
// toelopende poten, twee kruisverband-vakken met een platform ertussen, en
// een basisbalk — vereenvoudigd voor iconformaat, geen foto-realistisch
// icoon (zelfde aanpak als NAVTEX_BOEI_SVG hierboven).
const NAVTEX_RIG_SVG = `
  <svg viewBox="0 0 24 24" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="#f4f6fb" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 1 V2.6"/>
      <circle cx="12" cy="0.9" r="0.6" fill="#f4f6fb" stroke="none"/>
      <rect x="10" y="3" width="4" height="1.6" rx="0.3"/>
      <path d="M9 5.4 L5 21 M15 5.4 L19 21"/>
      <path d="M9 5.4 L16 13 M15 5.4 L8 13"/>
      <path d="M8 13 L19 21 M16 13 L5 21"/>
      <rect x="7.5" y="12" width="9" height="1.8" rx="0.3"/>
      <path d="M4 21 H20"/>
    </g>
  </svg>
`.trim();

// 2026-08-24, meerdere iteraties op verzoek van Lex. Eerste versie volgde
// een referentie-afbeelding letterlijk (uitrafelende aders), bleek op het
// echte iconformaat (16px op de kaart) te fijn/onduidelijk. Tweede versie
// (kabel-naar-stekker, ruit met stip) las beter op klein formaat en werd
// vergroot + koper/oranje gekleurd na "ja kabel is te klein" / "en andere
// kleur" — maar Lex vond die stekker-vorm alsnog "nietszeggend" en stuurde
// een nieuwe referentie: een gebogen kabelmantel met losse gekleurde aders
// die eruit steken. Dat is deze versie — een dikke ronde mantel (curve,
// stroke-linecap:round als "buis") met 3 dunne aders in klassieke
// draadkleuren (rood/groen/blauw) die eruit waaieren, elk met een stipje als
// uiteinde. Leest op 22px (zie .navtex-pin svg in styles.css) duidelijk als
// kabel. De koper/oranje kleur is losgelaten nu de aders zelf al kleur geven;
// de mantel blijft in dezelfde lichte tint als de andere iconen. Kreeg ook
// dezelfde blauwe zweem als de UKHO-test-pins, zie is-kabel in styles.css.
const NAVTEX_KABEL_SVG = `
  <svg viewBox="0 0 24 24" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
    <path d="M2.5 21.5 Q7 21.5 9.5 17 T13 12" fill="none" stroke="#e7ebf5" stroke-width="5" stroke-linecap="round"/>
    <g stroke-width="1.5" stroke-linecap="round" fill="none">
      <path d="M13 12 L17 6.5" stroke="#ff5c5c"/>
      <path d="M13 12 L19.5 10" stroke="#5cd685"/>
      <path d="M13 12 L18 15" stroke="#5cb8ff"/>
    </g>
    <circle cx="17" cy="6.5" r="1" fill="#ff5c5c"/>
    <circle cx="19.5" cy="10" r="1" fill="#5cd685"/>
    <circle cx="18" cy="15" r="1" fill="#5cb8ff"/>
  </svg>
`.trim();

// 2026-08-24, op verzoek van Lex ("een telescoop doet me aan sterrenkunde
// denken") — de 🔭-emoji voor 'survey' (SURVEY OPERATIONS/VESSEL, zie
// classificeerEvent() in navtexLokaal.js/ukho.js: dit is een actief varend
// onderzoeksschip, niet vaste apparatuur zoals bij 'wetenschappelijk')
// vervangen door een eigen boot-met-sonargolven-icoon, geïnspireerd op een
// referentie die Lex aandroeg (een gangbaar "survey vessel"-icoonconcept,
// zelf opnieuw getekend, geen overname van de brontekening — zie het
// gesprek). Eerste poging (losse dunne rompomtrek + cabine) las op 16px als
// een vage blob ("lijkt niet echt op een boot zonder binnenlijnen") — nu een
// enkel gevuld rompsilhouet (romp+cabine als één vorm, voorkomt versplintering
// op klein formaat) MET één contrasterende rompnaad/waterlijn erdoorheen, dat
// scheelde het meest in herkenbaarheid. Twee blauwe sonarbogen eronder,
// zelfde "eigen kleuraccent i.p.v. currentColor"-aanpak als NAVTEX_KABEL_SVG.
const NAVTEX_SURVEY_SVG = `
  <svg viewBox="0 0 24 24" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
    <g fill="#f4f6fb">
      <circle cx="11.5" cy="1.1" r="0.7"/>
      <polygon points="9,4 14,4 16,8.5 22,11 16,13.5 2,13.5 2,8.5 7,8.5"/>
    </g>
    <path d="M11.5 1.6 V4" fill="none" stroke="#f4f6fb" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M2.5 11.1 H20.7" fill="none" stroke="#8890a0" stroke-width="1.1" stroke-linecap="round"/>
    <g fill="none" stroke="#4fb6ff" stroke-width="1.8" stroke-linecap="round">
      <path d="M7.5 16.5 Q12 19.5 16.5 16.5"/>
      <path d="M4.3 19.8 Q12 25 19.7 19.8"/>
    </g>
  </svg>
`.trim();

// 2026-08-24, op verzoek van Lex ("Op de iphone zoont de witte lamp veel
// witter dan op de PC... kan je ook proberen een klein zwart kruisje door de
// bulb te maken?") — de 💡-emoji verving eerder al de default boei-SVG voor
// 'licht-onbetrouwbaar' (UNRELIABLE/EXTINGUISHED/UNLIT/INOPERATIVE/etc., zie
// classificeerEvent() in navtexLokaal.js/ukho.js), maar 💡 is van zichzelf
// een AAN-lampje — verwarrend voor "dit licht is juist STUK". Eerste eigen
// SVG-poging: puur zwart gevuld peertje — bleek op een lichte ondergrond
// nauwelijks zichtbaar (anders dan alle andere iconen hier, die bewust licht
// zijn zodat ze overal opvallen). Tweede poging: gedimd grijs peertje (geen
// gloed-stralen, geen fel geel) — leesbaar op elke ondergrond, maar het
// "uit"-signaal zat 'm toen alleen nog in de subtiele grijstint, en die
// oogt op een iPhone-scherm (koeler wit) anders dan op een pc-scherm (warmer/
// geler) — kleurperceptie is dus geen betrouwbaar signaal tussen apparaten.
// Definitieve versie: hetzelfde gedimde peertje MET een klein zwart kruisje
// erdoorheen — dat "uit/kapot"-signaal is vorm-gebaseerd, niet kleur-
// gebaseerd, dus scherm-onafhankelijk ondubbelzinnig.
const NAVTEX_LICHT_UIT_SVG = `
  <svg viewBox="0 0 24 24" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
    <g fill="#9199b5">
      <circle cx="12" cy="9.5" r="6.3"/>
      <path d="M9.3 14.8 L9.3 18.3 Q9.3 19.1 10.1 19.1 L13.9 19.1 Q14.7 19.1 14.7 18.3 L14.7 14.8 Z"/>
    </g>
    <g fill="none" stroke="#5c6274" stroke-width="1.1">
      <line x1="9.6" y1="16.4" x2="14.4" y2="16.4"/>
      <line x1="9.6" y1="17.7" x2="14.4" y2="17.7"/>
    </g>
    <line x1="10.4" y1="21" x2="13.6" y2="21" stroke="#5c6274" stroke-width="1.3" stroke-linecap="round"/>
    <path d="M9.8 7.5 Q9.8 6 12 6 Q14.2 6 14.2 7.5 Q14.2 9.5 12.7 10.4 L12.7 12 L11.3 12 L11.3 10.4 Q9.8 9.5 9.8 7.5 Z" fill="none" stroke="#5c6274" stroke-width="0.9"/>
    <g stroke="#1a1c22" stroke-width="1.6" stroke-linecap="round">
      <line x1="8.4" y1="6.4" x2="15.6" y2="12.6"/>
      <line x1="15.6" y1="6.4" x2="8.4" y2="12.6"/>
    </g>
  </svg>
`.trim();

// 2026-08-21, op verzoek van Lex ("er waren PDS-meldingen en een tornado op
// de grond vannacht, ik zou die ook willen kunnen onderscheiden in de lijst,
// ze staan dan wel gewoon bij de Warnings maar met een icon en PDS of zo") —
// zelfde dreigingsniveaus als de kaart-popup-titel (zie nws.js: 🚨 Emergency
// > ⚠️ PDS > 🎯 waargenomen/"op de grond"), maar dan als eigen icoon in het
// lijst-item i.p.v. verstopt in de titel-tekst — zo valt het niveau meteen op
// bij het scannen van de lijst, zonder de hele titel te moeten lezen. Blijft
// bewust gewoon bij dezelfde categorie (tornado/tornado-watch) staan, geen
// aparte sub-categorie — zie ook de pil-badge in maakMeldingItem() hieronder.
// 2026-08-24, op verzoek van Lex ("werk maar aan de icons, want voor een
// platform hoef ik die boei niet te zien") — icoon per eventtype
// (navtexLokaal.js/ukho.js, zie detail.eventType daar) i.p.v. altijd
// dezelfde boei-SVG voor elk navtex-signaal. Boei-gerelateerde types en
// "overig" (nog niet herkend) houden bewust de boei — dat IS letterlijk een
// boei-melding, of we weten nog niet beter. De rest krijgt een eigen emoji,
// zelfde "iconen zelf nog TBD, emoji i.p.v. eigen SVG"-aanpak als elders in
// dit bestand — makkelijk later te vervangen door eigen SVG's als er een
// vaste set komt.
// 2026-08-24, op verzoek van Lex (MSI 293/26 Oostende: "ANCHOR AND CHAIN
// LOST IN POS ..."), met twee referentie-icoontjes van een anker met een
// knappende ketting als inspiratie — eigen anker-silhouet (ring, schacht,
// dwarsbalk, gebogen vloeken, zelfde stroke-stijl als NAVTEX_RIG_SVG
// hierboven) met een geknapte ketting erboven en rode knap-streepjes bij de
// breuk. Eerste poging: één losse ring, wit — Lex vroeg daarna om "de kleur
// zwart en een wat langere chain". Kleur zwart (#1a1c22, zelfde donkere tint
// als het kruisje in NAVTEX_LICHT_UIT_SVG) bleek in een losse test op een
// donkere kaartondergrond bijna onzichtbaar (zelfde probleem als de eerste
// zwarte lamppoging destijds) — de gedeelde .navtex-pin svg-schaduwfilter
// (zie styles.css) is daar kennelijk niet genoeg voor. Opgelost door elke
// vorm TWEE keer te tekenen: eerst een bredere lichte contourlaag (#f4f6fb,
// dikkere stroke-width), dan de zwarte hoofdlaag erbovenop — dat geeft een
// gegarandeerde lichte rand rond het zwart, ongeacht de kaartondergrond.
// "Langere chain": i.p.v. één losse ring nu twee schakels (een verticale en
// een horizontale, ineengeschoven als een echte ketting) tussen het anker en
// de rode knap-strepen. Krijgt net als NAVTEX_SURVEY_SVG een eigen grotere
// .navtex-pin.is-anker-formaat (zie styles.css) omdat het kettingdetail
// anders op de standaardmaat alsnog wegvalt.
const NAVTEX_ANKER_ANKER_PATHS = `
  <circle cx="12" cy="10.2" r="1.8"/>
  <path d="M12 12 V22"/>
  <path d="M8.3 15.5 H15.7"/>
  <path d="M5 18 Q5 23 10 23"/>
  <path d="M19 18 Q19 23 14 23"/>
`;
const NAVTEX_ANKER_KETTING_PATHS = `
  <rect x="-1.1" y="-2.6" width="2.2" height="5.2" rx="1.1" transform="translate(12 6.5)"/>
  <rect x="-2.6" y="-1.1" width="5.2" height="2.2" rx="1.1" transform="translate(12 3.1)"/>
`;
const NAVTEX_ANKER_SVG = `
  <svg viewBox="0 0 24 24" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="#f4f6fb" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round">
      ${NAVTEX_ANKER_ANKER_PATHS}
    </g>
    <g fill="none" stroke="#f4f6fb" stroke-width="3.2">
      ${NAVTEX_ANKER_KETTING_PATHS}
    </g>
    <g fill="none" stroke="#1a1c22" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      ${NAVTEX_ANKER_ANKER_PATHS}
    </g>
    <g fill="none" stroke="#1a1c22" stroke-width="1.7">
      ${NAVTEX_ANKER_KETTING_PATHS}
    </g>
    <g stroke="#ff5c5c" stroke-width="1.5" stroke-linecap="round">
      <path d="M15.6 0.4 L16.6 1.4"/>
      <path d="M17.4 2.4 L18.6 2.6"/>
      <path d="M15.8 4.2 L16.8 4.8"/>
    </g>
  </svg>
`.trim();

const NAVTEX_EVENT_ICOON = {
  riglijst: NAVTEX_RIG_SVG,
  'licht-onbetrouwbaar': NAVTEX_LICHT_UIT_SVG,
  'safety-zone': '🚧',
  kabel: NAVTEX_KABEL_SVG,
  survey: NAVTEX_SURVEY_SVG,
  wetenschappelijk: '🔬',
  wrak: '☠️',
  obstructie: '⚠️',
  // 2026-08-24, op verzoek van Lex ("neem gelijk een bom/granaat icon mee
  // als er bij een gebied over ordinance of munitions, explosives wordt
  // gemeld") — zie 'munitie' in navtexLokaal.js/ukho.js EVENT_REGELS.
  munitie: '💣',
  oefening: '🎯',
  'anker-verloren': NAVTEX_ANKER_SVG,
  'boei-nieuw': NAVTEX_BOEI_NIEUW_SVG,
};
function hazardIconHtml(s) {
  if (isLifeliner(s)) return LIFELINER_HELI_SVG;
  if (s.categorie === 'navtex') return NAVTEX_EVENT_ICOON[s.detail?.eventType] ?? NAVTEX_BOEI_SVG;
  if (s.categorie === 'tornado' || s.categorie === 'tornado-watch') {
    if (s.detail?.tornadoEmergency) return '🚨';
    if (s.detail?.pds) return '⚠️';
    if (s.detail?.tornadoWaargenomen) return '🎯';
  }
  return EMOJI_PER_CATEGORIE[s.categorie] ?? '•';
}

// ---- Zee-modus — 2026-08-20, op verzoek van Lex ("dat gaan we gelijk in de
// app trekken... elke icons uitzetten, of een heel andere zeekaart") -------
// Met tientallen NAVTEX-berichten binnen bereik (zie backend/src/sources/
// navtex.js) zou het gewoon meetonen tussen de landgebonden hazard-pins de
// kaart onleesbaar maken — vandaar een eigen, aan/uit-schakelbare modus i.p.v.
// NAVTEX gewoon altijd meenemen in renderMap(): schakelt de normale
// hazard-pins uit, legt een OpenSeaMap-vaarwaterlaag (boeien, vaargeulen,
// dieptelijnen — gratis, geen key nodig) over de bestaande kaart, en toont
// dan alleen de NAVTEX-signalen. Zelfde lazy-aanmaak/aan-uit-patroon als
// toggleSatelliet() hierboven.
// 2026-08-20, vervolg op verzoek van Lex ("de navtex kaart is een echte
// zeekaart met daarop de gebieden Dogger, Humber, German Bight etc") — DERDE
// (definitieve) versie. Eerst een zelf ingebakken GeoJSON-omtrekkenlaag op
// basis van een community-GitHub-repo (glynnbird/shippingforecastgeojson),
// toen even (verkeerd) gedacht dat de OpenSeaMap-seamark-laag deze
// gebiedsnamen/-lijnen zelf al tekent — bleek na testen niet zo ("de
// gebieden zijn er nog niet"). Uiteindelijk bleek de échte bron een bestand
// te zijn dat NIET in Lex' Windows-map C:\Projects\navtex stond, maar wél in
// de losstaande, verder ontwikkelde kopie die rechtstreeks op de Minisforum
// draait (~/navtex/public/data/uk_shipping_forecast_areas.geojson, door Lex
// zelf via SSH opgehaald en hier geüpload) — een officiële, hoge-precisie
// GIS-bron (33 gebieden, ArcGIS-afkomstig). Coördinaten hieronder zijn per
// gebied vereenvoudigd (Douglas-Peucker, offline in deze sessie, max ~70
// punten per polygon) om embedden behapbaar te houden — de kustlijn-precieze
// originelen liepen in de duizenden punten per gebied. Beperkt tot dezelfde
// 10 Noordzee/Kanaal-gebieden als NAVTEX_STRAAL_KM dekt (zie
// backend/.env.example). Stijl subtiel gehouden (dunne lichtgrijze lijnen,
// kleine labels) — dat "veel subtieler" van Lex was een terechte observatie,
// los van waar de vergelijkingskaart de lijnen vandaan bleek te halen.
const ZEE_GEBIEDEN = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'Dogger' }, geometry: { type: 'Polygon', coordinates: [[[-1.00000,56.00000],[4.00000,56.00000],[4.00000,54.25000],[0.75000,54.25000],[-1.00000,56.00000]]] } },
    { type: 'Feature', properties: { name: 'Humber' }, geometry: { type: 'Polygon', coordinates: [[[4.00000,54.25000],[4.67000,53.58000],[4.67000,52.79048],[4.64778,52.75000],[1.66642,52.74940],[1.43765,52.87901],[1.29842,52.93312],[0.97767,52.98079],[0.95886,52.97150],[1.03584,52.96788],[0.98799,52.95758],[0.86826,52.97896],[0.85240,52.95775],[0.84117,52.97590],[0.75116,52.96999],[0.68700,52.98867],[0.65766,52.98190],[0.70643,52.97777],[0.51747,52.96837],[0.44599,52.87505],[0.44854,52.84834],[0.35938,52.80631],[0.21635,52.82068],[0.17147,52.87529],[0.05433,52.90944],[0.03302,52.90144],[0.15242,53.00928],[0.28673,53.08093],[0.33465,53.08751],[0.34731,53.10823],[0.35551,53.19234],[0.33818,53.23949],[0.19512,53.43623],[0.15400,53.47550],[0.01746,53.52397],[-0.06159,53.58228],[-0.09404,53.58069],[-0.20197,53.63696],[-0.29040,53.71305],[-0.53795,53.67792],[-0.61284,53.71479],[-0.69152,53.70436],[-0.63138,53.72902],[-0.53813,53.70876],[-0.27426,53.74094],[-0.10499,53.63597],[0.03745,53.64876],[0.14471,53.61002],[0.10569,53.57196],[0.14597,53.59892],[0.11316,53.66551],[-0.14803,53.89155],[-0.21038,54.00104],[-0.19996,54.07520],[-0.16819,54.09838],[-0.07695,54.11715],[-0.24494,54.16651],[-0.28387,54.19684],[-0.27732,54.21756],[-0.25843,54.21591],[-0.33137,54.23656],[4.00000,54.25000]]] } },
    { type: 'Feature', properties: { name: 'German Bight' }, geometry: { type: 'Polygon', coordinates: [[[8.12128,56.00000],[8.17683,55.76863],[8.07237,55.55965],[8.29452,55.47713],[8.28924,55.59520],[8.62269,55.42663],[8.68991,55.16012],[8.58789,55.14910],[8.68575,55.14387],[8.58186,54.88538],[8.89101,54.59300],[8.80720,54.47069],[9.05051,54.47605],[8.64689,54.39256],[8.59628,54.30681],[8.95630,54.31622],[8.80742,54.17609],[9.00241,54.08680],[8.82665,54.02279],[9.10324,53.86333],[8.61135,53.87761],[8.48311,53.68725],[8.58770,53.49657],[8.27554,53.61068],[8.23113,53.52067],[8.31575,53.46316],[8.25080,53.39844],[8.07111,53.46854],[8.16883,53.54425],[8.02033,53.70981],[7.24349,53.66806],[7.04021,53.53570],[7.11068,53.50729],[7.03366,53.53363],[6.99873,53.37161],[7.24156,53.33178],[7.20557,53.23645],[6.92594,53.32842],[7.00302,53.31627],[6.81611,53.46253],[6.18117,53.40028],[6.31932,53.31783],[6.17214,53.34295],[6.18023,53.41463],[5.88648,53.38988],[5.58159,53.29741],[5.04130,52.93428],[4.87658,52.88802],[4.73138,52.96232],[4.67000,52.79048],[4.67000,53.58000],[4.00000,54.25000],[4.00000,56.00000],[8.12128,56.00000]]] } },
    { type: 'Feature', properties: { name: 'Fisher' }, geometry: { type: 'Polygon', coordinates: [[[7.50000,57.75000],[8.56225,57.09101],[8.51061,57.05115],[8.47325,57.04214],[8.36185,56.95776],[8.26913,56.85428],[8.22843,56.78071],[8.21893,56.72220],[8.23097,56.72020],[8.24157,56.69678],[8.25941,56.77689],[8.29801,56.75653],[8.31079,56.72502],[8.35703,56.67712],[8.41923,56.66646],[8.38952,56.57824],[8.31838,56.57513],[8.30733,56.57128],[8.30549,56.55024],[8.28248,56.58167],[8.30209,56.59447],[8.21432,56.60140],[8.23242,56.60565],[8.23156,56.62462],[8.18601,56.63229],[8.19498,56.65316],[8.21701,56.65537],[8.20487,56.66642],[8.22969,56.68239],[8.21376,56.70928],[8.16882,56.65942],[8.12317,56.55846],[8.11521,56.37274],[8.13610,56.38530],[8.12456,56.39008],[8.13549,56.38961],[8.12248,56.39962],[8.13441,56.42873],[8.12492,56.43378],[8.16243,56.43538],[8.16625,56.40478],[8.18685,56.37926],[8.24143,56.35564],[8.25676,56.33810],[8.24895,56.32957],[8.29065,56.31780],[8.27612,56.29657],[8.24768,56.28829],[8.23434,56.29779],[8.24464,56.30243],[8.23812,56.32147],[8.16959,56.32281],[8.16584,56.33660],[8.13118,56.32779],[8.13794,56.36473],[8.11728,56.37164],[8.13088,56.23111],[8.09773,56.05645],[8.11080,56.00000],[4.00000,56.00000],[4.00000,57.75000],[7.50000,57.75000]]] } },
    { type: 'Feature', properties: { name: 'Thames' }, geometry: { type: 'Polygon', coordinates: [[[4.57210,52.47711],[4.37456,52.18750],[3.98659,51.92221],[4.24913,51.76605],[4.64682,51.71282],[3.98548,51.58764],[4.21911,51.43610],[3.83942,51.60552],[3.54081,51.58358],[3.81151,51.38641],[3.97503,51.46273],[4.24810,51.35124],[3.51388,51.40757],[2.89951,51.22642],[1.40433,51.22694],[1.42561,51.39389],[0.90450,51.32238],[0.53022,51.41083],[0.70122,51.47234],[0.41074,51.45473],[0.86681,51.60037],[0.59725,51.64138],[0.93653,51.63543],[0.93011,51.74733],[0.68621,51.73451],[0.85011,51.74133],[0.96334,51.85280],[1.04567,51.76867],[1.24341,51.82409],[1.29114,51.87380],[1.17846,51.87179],[1.29116,51.94908],[1.05395,51.95247],[1.28008,51.95901],[1.15745,52.02892],[1.31836,51.93252],[1.39133,51.98885],[1.33794,52.04235],[1.39475,51.98696],[1.57961,52.08681],[1.76277,52.48158],[1.66642,52.74940],[4.64778,52.75000],[4.57210,52.47711]]] } },
    { type: 'Feature', properties: { name: 'Tyne' }, geometry: { type: 'Polygon', coordinates: [[[-1.00000,56.00000],[0.75000,54.25000],[-0.33142,54.23658],[-0.39220,54.27018],[-0.38460,54.28783],[-0.40669,54.29370],[-0.44933,54.37303],[-0.52456,54.41740],[-0.52067,54.44633],[-0.57419,54.48122],[-0.66894,54.50182],[-0.70465,54.53079],[-0.74386,54.52820],[-0.77576,54.55659],[-1.00373,54.59402],[-1.13778,54.64737],[-1.13644,54.62910],[-1.20084,54.62216],[-1.15953,54.63474],[-1.20639,54.69090],[-1.17526,54.69761],[-1.30068,54.76679],[-1.36035,54.89084],[-1.35708,54.96492],[-1.43135,55.01093],[-1.41897,55.02311],[-1.49476,55.10141],[-1.50033,55.12766],[-1.56418,55.13369],[-1.52214,55.14421],[-1.49511,55.12547],[-1.52813,55.16115],[-1.56335,55.16415],[-1.52532,55.16242],[-1.49952,55.18565],[-1.57202,55.27622],[-1.54940,55.32205],[-1.59220,55.33845],[-1.62315,55.38826],[-1.58030,55.40712],[-1.57648,55.43130],[-1.59350,55.44018],[-1.59127,55.49238],[-1.61385,55.49709],[-1.61100,55.52112],[-1.63999,55.53830],[-1.62152,55.55147],[-1.69374,55.60676],[-1.74263,55.61858],[-1.76952,55.60312],[-1.78462,55.61712],[-1.76404,55.62630],[-1.79003,55.65745],[-1.81108,55.63377],[-1.84619,55.65128],[-1.00000,56.00000]]] } },
    { type: 'Feature', properties: { name: 'Forth' }, geometry: { type: 'Polygon', coordinates: [[[-2.17158,57.00001],[-1.00000,57.00000],[-1.00000,56.00000],[-1.84619,55.65128],[-2.00588,55.76309],[-1.99962,55.78506],[-2.13855,55.91532],[-2.33073,55.93025],[-2.44487,55.98769],[-2.58394,56.00922],[-2.65391,56.05924],[-2.81581,56.06279],[-2.90073,55.98125],[-3.06735,55.94508],[-3.18173,55.99099],[-3.16257,55.98087],[-3.67345,56.01158],[-3.68297,56.03613],[-3.72856,56.03375],[-3.72236,56.06582],[-3.67308,56.04633],[-3.58937,56.05985],[-3.38900,56.00704],[-3.40002,56.02640],[-3.17494,56.06274],[-3.15194,56.11582],[-2.96515,56.20816],[-2.81103,56.18431],[-2.60152,56.26376],[-2.58483,56.27916],[-2.65990,56.31810],[-2.77816,56.33313],[-2.81895,56.36611],[-2.90462,56.35399],[-2.81596,56.38462],[-2.80628,56.44374],[-2.92070,56.45141],[-3.28502,56.35716],[-3.05398,56.45818],[-2.73339,56.46513],[-2.70954,56.49873],[-2.53936,56.56663],[-2.48083,56.62489],[-2.50479,56.63321],[-2.50078,56.66077],[-2.43670,56.70087],[-2.53984,56.71273],[-2.45207,56.70461],[-2.44182,56.75157],[-2.23382,56.86325],[-2.19794,56.90912],[-2.20662,56.96655],[-2.17158,57.00001]]] } },
    { type: 'Feature', properties: { name: 'Forties' }, geometry: { type: 'Polygon', coordinates: [[[-1.00000,58.50000],[4.00000,58.50000],[4.00000,56.00000],[-1.00000,56.00000],[-1.00000,58.50000]]] } },
    { type: 'Feature', properties: { name: 'Viking' }, geometry: { type: 'Polygon', coordinates: [[[-0.00167,61.00053],[4.00000,61.00000],[4.00000,58.50000],[-0.00167,58.50002],[-0.00167,61.00053]]] } },
    { type: 'Feature', properties: { name: 'Dover' }, geometry: { type: 'Polygon', coordinates: [[[2.64318,51.12583],[2.41046,51.05347],[2.18625,51.04035],[2.18107,51.00182],[2.14969,51.03448],[2.10839,51.00432],[1.78455,50.95646],[1.64289,50.87808],[1.58161,50.87177],[1.60681,50.76831],[1.59816,50.72248],[1.56296,50.72486],[1.56019,50.69841],[1.57664,50.56995],[1.61349,50.52926],[1.59105,50.54500],[1.58138,50.53453],[1.55511,50.40012],[1.58372,50.37524],[1.62937,50.36864],[1.55461,50.36300],[1.53822,50.27092],[1.59255,50.24928],[1.62294,50.21456],[1.66256,50.20924],[1.61488,50.20497],[1.67255,50.19392],[1.65174,50.18669],[1.66579,50.18146],[0.25099,50.73660],[0.36335,50.81582],[0.66472,50.87162],[0.77517,50.93257],[0.97848,50.91268],[0.96460,50.96873],[0.99686,51.02450],[1.07106,51.06260],[1.32401,51.11148],[1.30938,51.12029],[1.39766,51.16015],[1.40433,51.22694],[2.89951,51.22642],[2.64318,51.12583]]] } },
  ],
};

let zeeLaag = null;
let zeeGebiedenLaag = null;
let zeeModusActief = false;

// 2026-08-20, op verzoek van Lex ("de gebieden krijgen ook altijd nog een
// synopsis mee in het oude navtex... als ik op de naam klik dat ik ze dan
// zie") — synopsis-tekst per zeegebied, opgehaald bij backend/src/sources/
// knmiZeeForecast.js (KNMI Dutch Continental Shelf, zelfde bron als Lex'
// eigen oude prototype al gebruikte). Dekt maar 4 van de 10 gebieden op deze
// kaart (Dogger/Humber/German Bight/Thames) — geen bug, KNMI publiceert
// simpelweg niet meer dan dat, zie de toelichting in knmiZeeForecast.js.
let zeeSynopsisPerGebied = {};

async function laadZeeSynopsis() {
  try {
    const data = await fetch('/api/zee-synopsis').then((r) => r.json());
    zeeSynopsisPerGebied = data.gebieden ?? {};
  } catch (err) {
    // Best-effort: bij een mislukte fetch blijft de vorige (mogelijk lege)
    // stand gewoon staan, geen harde fout voor de rest van Zee-modus.
    console.error('zee-synopsis ophalen mislukt', err);
  }
}

// 2026-08-24, op verzoek van Lex ("we zouden het kunnen gebruiken voor de
// dode area's waar geen synopsis voor is wellicht?") — actieve scheepvaart-
// waarschuwingen (zie sources/sealagomZeeWaarschuwingen.js) als fallback
// voor de zes gebieden die knmiZeeForecast.js niet dekt (Fisher/Tyne/Forth/
// Forties/Viking/Dover). GEEN synopsis-vervanging (ander soort content, zie
// toelichting in sealagomZeeWaarschuwingen.js) — zie zeeSynopsisPopupHtml()
// hieronder voor hoe dat verschil in de popup zichtbaar blijft.
let zeeWaarschuwingenPerGebied = {};

async function laadZeeWaarschuwingen() {
  try {
    const data = await fetch('/api/zee-waarschuwingen').then((r) => r.json());
    zeeWaarschuwingenPerGebied = data.gebieden ?? {};
  } catch (err) {
    console.error('zee-waarschuwingen ophalen mislukt', err);
  }
}

// 2026-08-24, op verzoek van Lex ("waar komt de synopsis vandaan voor die
// gebieden die we missen?") — ECHTE weersynopsis (net als zeeSynopsisPerGebied
// hierboven, geen scheepvaartwaarschuwingen zoals zeeWaarschuwingenPerGebied)
// voor alle 10 ZEE_GEBIEDEN, via de UK Met Office Shipping Forecast (zie
// backend/src/sources/metOfficeZeeForecast.js). Sluit het gat dat KNMI laat
// vallen voor Fisher/Tyne/Forth/Forties/Viking/Dover — maar KNMI blijft
// voorrang houden waar die tekst wél bestaat, zie zeeSynopsisPopupHtml()
// hieronder. Net als bij SeaLagom zijn de gebiedsnamen in de response
// hoofdletters, vandaar naam.toUpperCase() bij de lookup.
let metOfficeSynopsisPerGebied = {};

async function laadMetOfficeSynopsis() {
  try {
    const data = await fetch('/api/zee-synopsis-metoffice').then((r) => r.json());
    metOfficeSynopsisPerGebied = data.gebieden ?? {};
  } catch (err) {
    console.error('zee-synopsis-metoffice ophalen mislukt', err);
  }
}

// Als los HTML-fragment i.p.v. inline in bindPopup() zelf, zodat zowel
// bouwZeeGebiedenLaag() hieronder als een eventuele latere hertekening
// dezelfde opmaak gebruiken. Hergebruikt .popup-advies (zie escapeHtml/
// popupExtraHtml hierboven), net als bij NAVTEX/UKHO-berichten en
// orkaan-advies — verschijnt sinds deze sessie sowieso altijd schermvullend
// (zie toonVolledigSchermPopup()), dus geen aparte vergroot-truc meer nodig.
// 2026-08-24: valt bij het ontbreken van een KNMI-synopsis nu eerst terug op
// metOfficeSynopsisPerGebied (echte synopsis, dekt alle 10 gebieden — zie
// laadMetOfficeSynopsis() hierboven) en pas daarna op
// zeeWaarschuwingenPerGebied (geen synopsis maar scheepvaartwaarschuwingen,
// zie laadZeeWaarschuwingen()) — volgorde: KNMI -> Met Office -> SeaLagom ->
// "niet beschikbaar". Beide fallback-bronnen gebruiken hoofdletter-
// gebiedsnamen, vandaar naam.toUpperCase() bij de lookup.
// 2026-08-25, op verzoek van Lex ("de tekst van UK voorrang geven voor
// German Bight, want gedetailleerder") — voor de meeste gebieden blijft KNMI
// eerst (dichter bij huis), maar voor German Bight is de Met Office-tekst
// vaak specifieker (bv. de noord/zuid-opsplitsing, zie metOfficeZeeForecast.js)
// dan KNMI's kortere samenvatting. Alleen hier de volgorde omdraaien i.p.v.
// overal, dus als losse set i.p.v. een globale vlag.
const GEBIEDEN_METOFFICE_VOORRANG = new Set(['German Bight']);

// Centrale bron-keuze (KNMI vs Met Office), zodat de popup hieronder en het
// golfje-label (zie golfHoogteVoorGebied) altijd naar dezelfde tekst kijken —
// eerder stond deze volgorde dubbel uitgeschreven op twee plekken.
function synopsisBronVoorGebied(naam) {
  const knmi = zeeSynopsisPerGebied[naam];
  const metOffice = metOfficeSynopsisPerGebied[naam.toUpperCase()];
  const eersteVoorkeur = GEBIEDEN_METOFFICE_VOORRANG.has(naam)
    ? [{ bron: 'metoffice', synopsis: metOffice }, { bron: 'knmi', synopsis: knmi }]
    : [{ bron: 'knmi', synopsis: knmi }, { bron: 'metoffice', synopsis: metOffice }];
  return eersteVoorkeur.find((optie) => optie.synopsis?.tekst) ?? null;
}

// 2026-08-25-fix, op verzoek van Lex ("de gloed vervormt de golf... andere
// icon denk ik" / "ja meer een open vorm denk ik") — de 🌊-emoji is een
// kleur-glyph met veel eigen detail (schuim, meerdere blauwtinten); een
// filter:drop-shadow-gloed daaroverheen vloeide samen tot een onherkenbare
// blauwe blob i.p.v. een golfvorm. Eigen SVG i.p.v. de emoji, en bewust een
// OPEN vorm (gestreepte golflijn, fill:none/stroke:currentColor) i.p.v. een
// gevulde vlak-vorm — een dunne lijn kan bij een gloed niet "vollopen" tot
// een blob zoals de emoji deed. Kleur volgt automatisch de omliggende
// .golf-label/.popup-golfhoogte-tekstkleur (zie .golf-emoji in styles.css).
// Gedeeld via deze functie i.p.v. de HTML dubbel uit te schrijven op de
// twee gebruiksplekken hieronder.
function golfIcoonHtml() {
  return '<svg class="golf-emoji" viewBox="0 0 22 14" aria-hidden="true"><path d="M1,7 C4,1 8,1 11,7 C14,13 18,13 21,7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

// 2026-08-25, op verzoek van Lex ("geen golfhoogte hoor" bij de Fisher-popup,
// "grote letters in een andere kleur... onder de titel met ruimte boven en
// onder 3 mm") — golfHoogteVoorGebied() bestond al voor het kaartlabel-golfje
// (zie zeeGebiedLabelHtml hierboven) maar werd nooit in de klik-popup zelf
// getoond. Eén keer berekend en vóór alle vier de content-varianten (knmi/
// metoffice/waarschuwingen/leeg) geplakt, zodat 'ie overal verschijnt zodra
// er een golfhoogte uit de synopsistekst te halen viel — en gewoon wegvalt
// (lege string) als dat niet lukt, i.p.v. een kale/foutieve regel.
function zeeSynopsisPopupHtml(naam) {
  const gekozen = synopsisBronVoorGebied(naam);
  const golfbereik = golfHoogteVoorGebied(naam);
  const titelHtml = `<div class="popup-titel">${escapeHtml(naam)}</div>${golfbereik ? `<div class="popup-golfhoogte">${golfIcoonHtml()} ~${golfbereik}</div>` : ''}`;
  if (gekozen?.bron === 'knmi') {
    return `${titelHtml}<div class="popup-advies">${escapeHtml(gekozen.synopsis.tekst)}</div>`;
  }
  if (gekozen?.bron === 'metoffice') {
    return `${titelHtml}<div class="popup-sub">Synopsis (bron: UK Met Office):</div><div class="popup-advies">${escapeHtml(gekozen.synopsis.tekst)}</div>`;
  }
  const waarschuwingen = zeeWaarschuwingenPerGebied[naam.toUpperCase()] ?? [];
  if (waarschuwingen.length > 0) {
    const meldingTekst = waarschuwingen.length === 1 ? '1 actieve scheepvaartwaarschuwing' : `${waarschuwingen.length} actieve scheepvaartwaarschuwingen`;
    const lijstHtml = waarschuwingen
      .map((w) => `<div class="popup-advies">${w.id ? `<strong>${escapeHtml(w.id)}</strong> — ` : ''}${escapeHtml(w.tekst)}</div>`)
      .join('');
    return `${titelHtml}<div class="popup-sub">Geen synopsis beschikbaar voor dit gebied — wel ${meldingTekst} (bron: SeaLagom):</div>${lijstHtml}`;
  }
  return `${titelHtml}<div class="popup-sub">Geen synopsis beschikbaar voor dit gebied.</div>`;
}

// 2026-08-25, op verzoek van Lex ("een golfje naast de gebiedsnamen met de
// golfhoogte") — geen nieuwe databron nodig: zowel KNMI als Met Office
// gebruiken in hun synopsistekst de internationale Douglas-zeegangschaal in
// woorden (smooth/slight/moderate/rough/very rough/high/...), de standaard
// terminologie in élk shipping-forecast-bericht, dus gewoon uit de al
// geladen tekst zelf halen. Volgorde specifiek-naar-algemeen (net als
// EVENT_REGELS in navtexLokaal.js) zodat "VERY ROUGH"/"VERY HIGH" niet per
// ongeluk al bij "ROUGH"/"HIGH" matchen. Bewust een RUW indicatief bereik
// (vandaar het "~"-teken in de weergave), geen exacte meting.
const DOUGLAS_ZEEGANG = [
  { re: /\bPHENOMENAL\b/, bereik: '>14m' },
  { re: /\bVERY HIGH\b/, bereik: '9–14m' },
  { re: /\bHIGH\b/, bereik: '6–9m' },
  { re: /\bVERY ROUGH\b/, bereik: '4–6m' },
  { re: /\bROUGH\b/, bereik: '2.5–4m' },
  { re: /\bMODERATE\b/, bereik: '1.25–2.5m' },
  { re: /\bSLIGHT\b/, bereik: '0.5–1.25m' },
  { re: /\bSMOOTH\b/, bereik: '0.1–0.5m' },
  { re: /\bCALM\b/, bereik: '0m' },
];
// 2026-08-25-fix, op melding van Lex ("ik zie ook geen golfjes"): KNMI's
// tekst (Dogger/German Bight/Humber/Thames, zie knmiZeeForecast.js) gebruikt
// GEEN Douglas-woorden zoals Met Office, maar noemt de golfhoogte gewoon met
// een getal, bv. "waveheight around 1.0 meter" — vandaar dat voor precies
// die vier gebieden nooit een DOUGLAS_ZEEGANG-match lukte. Deze regex pakt
// dat directe getal (of bereik, bv. "1-2 meter") eerst; alleen als die niet
// voorkomt (Met Office-tekst) valt hij terug op de Douglas-woorden hieronder.
const KNMI_GOLFHOOGTE_REGEX = /WAVE\s*HEIGHT[^0-9]{0,15}(\d+(?:[.,]\d+)?)(?:\s*(?:-|TO|–)\s*(\d+(?:[.,]\d+)?))?\s*M(?:ETER|ETRE)S?\b/;

function golfHoogteVoorGebied(naam) {
  const gekozen = synopsisBronVoorGebied(naam);
  const tekst = gekozen?.synopsis?.tekst;
  if (!tekst) return null;
  const boven = tekst.toUpperCase();
  const getalMatch = KNMI_GOLFHOOGTE_REGEX.exec(boven);
  if (getalMatch) {
    const laag = getalMatch[1].replace(',', '.');
    const hoog = getalMatch[2] ? getalMatch[2].replace(',', '.') : null;
    return hoog ? `${laag}–${hoog}m` : `${laag}m`;
  }
  const match = DOUGLAS_ZEEGANG.find((d) => d.re.test(boven));
  return match ? match.bereik : null;
}

// Kaartlabel-tekst voor een zeegebied: naam + golfje-badge met golfhoogte
// als die uit de synopsis te halen viel, anders gewoon de kale naam. Als
// FUNCTIE meegegeven aan bindTooltip (zie bouwZeeGebiedenLaag hieronder) —
// zelfde "pas ophalen bij het daadwerkelijk tonen"-aanpak als
// zeeSynopsisPopupHtml hierboven, zodat dit ook meteen goed is als de
// synopsis-fetch pas ná het bouwen van de kaartlaag klaar is, en ververst
// zodra Zee-modus opnieuw aangezet wordt (de laag wordt dan opnieuw aan de
// kaart toegevoegd, dus de tooltip opent en dus deze functie herevalueert).
function zeeGebiedLabelHtml(naam) {
  const golfbereik = golfHoogteVoorGebied(naam);
  return golfbereik
    ? `${escapeHtml(naam)} <span class="golf-label">${golfIcoonHtml()} ~${golfbereik}</span>`
    : escapeHtml(naam);
}

// 2026-08-25-fix, op melding van Lex ("ik zie ook geen golfjes"): de
// permanente kaartlabels (bindTooltip hieronder) evalueren hun content-
// functie maar ÉÉN keer, op het moment dat de tooltip opent — dat gebeurt
// bij kaart.addLayer(zeeGebiedenLaag) in toggleZeeModus(), VOORDAT de
// synopsis-fetches (laadZeeSynopsis/laadMetOfficeSynopsis, bewust fire-and-
// forget) klaar zijn. Anders dan de klik-popup (die bij elke klik opnieuw
// synopsisBronVoorGebied() aanroept, dus altijd de nieuwste stand pakt)
// bleef het golfje daardoor structureel leeg: op openingsmoment was er nog
// helemaal geen synopsis-tekst om uit te lezen. Fix: zodra de data binnen
// is, elk label expliciet laten herevalueren via Leaflet's Tooltip#update().
function verversZeeGebiedLabels() {
  zeeGebiedenLaag?.eachLayer((laag) => laag.getTooltip()?.update());
}

function bouwZeeGebiedenLaag() {
  return L.geoJSON(ZEE_GEBIEDEN, {
    pane: 'zeePane',
    // 2026-08-24, op verzoek van Lex ("het is nu zo dat overal waar ik klik
    // op 'Thames' dat label verschijnt... kan dat alleen daarop klikken die
    // synopsis geeft") — interactive:false op de polygon zelf, zodat de
    // onzichtbare fill (fillOpacity:0) niet meer over de hele oppervlakte
    // klikbaar is (dat was hier tot nu toe bewust wél zo, zie de oude
    // 2026-08-20-notitie die hiermee vervalt). Alleen de naam-tooltip
    // hieronder is nu nog het klikdoel.
    style: { color: 'rgba(120,120,120,0.65)', weight: 1, fillOpacity: 0, interactive: false },
    onEachFeature: (feature, laag) => {
      laag.bindTooltip(() => zeeGebiedLabelHtml(feature.properties.name), {
        permanent: true,
        direction: 'center',
        className: 'zee-gebied-label',
      });
      // De tooltip krijgt hier zelf een click-handler i.p.v. bindPopup op de
      // laag (dat maakte namelijk de hele polygon klikbaar, zie hierboven).
      // Bij permanent:true opent de tooltip vanzelf zodra de laag op de
      // kaart komt (kaart.addLayer in toggleZeeModus) — dat triggert
      // 'tooltipopen', waarna het DOM-element van het label beschikbaar is
      // om een click-listener op te zetten. Functie i.p.v. kant-en-klare
      // HTML in setContent: pas aangeroepen bij het daadwerkelijke klikken,
      // zodat dit altijd de meest recente zeeSynopsisPerGebied pakt — ook
      // als de synopsis-fetch pas ná het bouwen van deze laag klaar is.
      laag.on('tooltipopen', () => {
        const labelEl = laag.getTooltip()?.getElement();
        if (!labelEl || labelEl.dataset.zeeSynopsisKlikbaar) return;
        labelEl.dataset.zeeSynopsisKlikbaar = '1';
        labelEl.addEventListener('click', (ev) => {
          ev.stopPropagation();
          L.popup({ maxWidth: 280 })
            .setLatLng(laag.getBounds().getCenter())
            .setContent(zeeSynopsisPopupHtml(feature.properties.name))
            .openOn(kaart);
        });
      });
    },
  });
}

function toggleZeeModus() {
  zeeModusActief = !zeeModusActief;
  TOGGLE_ZEE_EL.classList.toggle('actief', zeeModusActief);
  kaart.getContainer().classList.toggle('zee-modus-actief', zeeModusActief);
  if (zeeModusActief) {
    if (!zeeLaag) {
      zeeLaag = L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', {
        attribution: 'OpenSeaMap',
        maxZoom: 18,
        pane: 'zeePane',
      });
    }
    if (!zeeGebiedenLaag) zeeGebiedenLaag = bouwZeeGebiedenLaag();
    kaart.addLayer(zeeLaag);
    kaart.addLayer(zeeGebiedenLaag);
    // 2026-08-21, op verzoek van Lex ("de knop zee moet altijd de focus
    // leggen op het noordzeegebied ongeacht waar ik sta") — voorheen deed
    // Zee-modus helemaal niks met de kaartpositie, dus je bleef gewoon staan
    // waar je toevallig al was (thuis, of ver weg via Vlucht/GPS) en zag geen
    // zeegebied. fitBounds op zeeGebiedenLaag i.p.v. een hardgecodeerde
    // lat/lon/zoom — pakt zo altijd exact de 10 gebieden uit ZEE_GEBIEDEN
    // hierboven, en blijft vanzelf kloppen als die polygonenset ooit wijzigt.
    // Geen dwingRegenradarZoomAf()-achtige zoomvloer nodig hier: dit is geen
    // regenradar-laag.
    beweegKaartProgrammatisch(() => kaart.fitBounds(zeeGebiedenLaag.getBounds()));
    // Fire-and-forget: hoeft de rest van het aanzetten niet te blokkeren, de
    // popup-functie in bouwZeeGebiedenLaag() pakt toch altijd de nieuwste
    // stand op het moment dat iemand een gebied aantikt. De permanente
    // labels (golfje-badge) doen dat niet vanzelf — zie verversZeeGebiedLabels
    // hierboven — dus die expliciet laten herevalueren zodra de synopsis-data
    // (waar het golfje uit komt) binnen is.
    Promise.all([laadZeeSynopsis(), laadMetOfficeSynopsis()]).then(verversZeeGebiedLabels);
    laadZeeWaarschuwingen();
    // 2026-08-21: Zee-modus en Vliegradar tonen allebei een heel andere
    // kaartweergave (Lex: "of boten of vliegtuigen") — wederzijds
    // uitsluitend. vliegModusActief is op dit punt nog de OUDE waarde (dit
    // if-blok draait pas ná de toggle hierboven), dus deze check is veilig.
    if (vliegModusActief) toggleVliegradar();
    if (kaartVolgType) stopKaartVolgen(false); // zie toggleVliegradar
  } else {
    if (zeeLaag) kaart.removeLayer(zeeLaag);
    if (zeeGebiedenLaag) kaart.removeLayer(zeeGebiedenLaag);
    // Vaarradar "leunt" op Zee-modus (zie toggleVaarradar hieronder) — als
    // Zee-modus om wat voor reden dan ook uitgaat (ook via deze knop direct,
    // niet alleen via toggleVaarradar zelf), moet Vaarradar netjes meegaan,
    // anders blijft die knop ten onrechte "actief" staan met een dode
    // scheepslaag. vaarradarActief is op dit punt nog niet aangepast, dus
    // deze check klopt.
    if (vaarradarActief) toggleVaarradar();
  }
  // Meteen herverven met de nieuwe modus i.p.v. te wachten tot de volgende
  // 20-seconden-pollcyclus — zelfde aanpak als de "+N meer"-toggles in
  // renderMeldingen() (laatsteMeldingenSignalen wordt daar elke cyclus al
  // bijgewerkt, dus die bevat hier ook gewoon de laatste stand).
  renderMap(laatsteMeldingenSignalen);
}

// ---- Vliegradar (live ADS-B) en Vaarradar (live AIS), 2026-08-21 ----------
// Op verzoek van Lex ("kunnen we een laag flight- en vaarradar toevoegen?
// Even overleg nadat je er over hebt nagedacht"). Belangrijk verschil met de
// normale hazard-signalen hierboven: dit komt NIET via /api/signals (geen
// SOURCES/makeSignal aan backend-kant, zie backend/src/sources/vliegradar.js
// en vaarradar.js) — de frontend haalt dit apart op, en ALLEEN zolang de
// bijbehorende modus actief staat (geen zin om continu te pollen als niemand
// kijkt, zelfde soort zuinigheid als de idle-gate voor Lifeliner).
//
// Straal is bewust rond de LIVE GPS-positie van de telefoon (Lex: "rond de
// GPS van de telefoon in een straal van 50 km"), niet rond het vaste
// HOME_LAT/HOME_LON — praktisch voor onderweg. Bij geen/geweigerde
// locatietoestemming valt dit terug op THUIS zodat de laag alsnog iets
// zinnigs toont i.p.v. leeg te blijven.
// 2026-08-21: 50 → 75 km op verzoek van Lex ("kunnen we de range wat
// vergroten ook?") — zelfde straal als Lifeliner al gebruikt (zie
// STRAAL_KM in sources/lifeliner.js: "ruimer dan de P2000-straal omdat een
// toestel dat net over de horizon vliegt ook nog relevant/zichtbaar is"),
// hier zeker zo van toepassing want gewone vliegtuigen vlieg je op grotere
// hoogte dan een traumaheli, dus zijn al van verder weg zichtbaar.
// 2026-08-21-terugdraai (tijdelijk): 75 → 50 km als voorzichtigheidsmaatregel
// tijdens het uitzoeken van de adsb.lol-429/blokkade-problemen — bleek
// achteraf niet de oorzaak (na een echte herlaad kwamen de fouten bij 50km
// gewoon weer terug; het is een tijd-/frequentie-gebaseerde limiet bij
// adsb.lol, niet gevoelig voor de straal/antwoordgrootte). Dus weer terug
// naar 75.
const VLIEGRADAR_STRAAL_KM = 75;
const VAARRADAR_STRAAL_KM = 50;
// 2026-08-21: eerst 15s -> 5s, en op Lex' vervolgverzoek ("kan het nog
// sneller") -> 3s. De servercache in backend/src/sources/vliegradar.js is
// om dezelfde reden mee omlaag (zie CACHE_MS daar) zodat pollen sneller dan
// de cache geen zin zou hebben — 3s client-poll + 3s servercache betekent nu
// dus ook daadwerkelijk elke ~3s verse data, i.p.v. alleen vaker dezelfde
// (8s-oude) data opnieuw op te halen.
const RADAR_POLL_MS = 3000;

let vliegModusActief = false;
let vaarradarActief = false;
let vliegLaag = null;
let vaarLaag = null;
let radarPollTimer = null;
// 2026-08-21, op verzoek van Lex ("zou kunnen [een zichtbare cirkel]") —
// laat de VLIEGRADAR_STRAAL_KM-zoekstraal rond je live positie zien, zodat
// je meteen ziet waar de data vandaan komt (en dus ook waarom een toestel
// er net wel/niet meer bij hoort). Bijgewerkt/verplaatst in
// ververVliegradar() zelf, samen met dezelfde huidigePositie()-aanroep die
// ook de data ophaalt — dus altijd exact consistent met wat er werkelijk is
// opgevraagd, geen losse tweede locatiebepaling.
let vliegScopeCirkel = null;

function huidigePositie() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ lat: THUIS.homeLat, lon: THUIS.homeLon });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve({ lat: THUIS.homeLat, lon: THUIS.homeLon }), // geweigerd/mislukt: val terug op thuislocatie
      { timeout: 8000, maximumAge: 60000 }
    );
  });
}

// 2026-08-21, op verzoek van Lex ("als ik speel met de knoppen regenradar
// satelliet etc. verdwijnen de vliegtuigen, zelfs na een herstart") —
// ververVliegradar() vroeg voorheen bij ELKE poll (elke RADAR_POLL_MS = 3s)
// een NIEUWE huidigePositie() op. Op een telefoon kan elke losse
// geolocation-aanvraag een licht andere fix teruggeven — zeker als het
// toestel ondertussen ook druk is met het laden van nieuwe Regenradar-/
// Satelliet-tegels — en bij een harde 75km-grens (zie het straalKm-filter
// in vliegradar.js) kan zo'n kleine schommeling toestellen net over de rand
// duwen en ze (tijdelijk, tot de volgende fix weer dichterbij zit) allemaal
// laten verdwijnen. Positie nu maar om de VLIEGRADAR_POSITIE_VERS_MS
// verversen i.p.v. bij elke losse poll — de vliegtuigdata zelf blijft wel
// gewoon elke 3s vers, alleen het dure/schommelige GPS-verzoek niet meer.
const VLIEGRADAR_POSITIE_VERS_MS = 20000;
let vliegPositieCache = null; // { lat, lon, tijdMs }

async function vliegPollPositie() {
  const nu = Date.now();
  if (vliegPositieCache && nu - vliegPositieCache.tijdMs < VLIEGRADAR_POSITIE_VERS_MS) {
    return { lat: vliegPositieCache.lat, lon: vliegPositieCache.lon };
  }
  const { lat, lon } = await huidigePositie();
  vliegPositieCache = { lat, lon, tijdMs: nu };
  return { lat, lon };
}

// Simpele emoji-badge i.p.v. een eigen SVG (zoals bijv. de Lifeliner-heli) —
// Lex noemde de iconen zelf nog "TBD", dus bewust niet meer moeite hierin
// gestoken dan nodig.
function bouwVerkeerIcon(emoji) {
  return L.divIcon({ className: '', html: `<div class="verkeer-pin">${emoji}</div>`, iconSize: [24, 24], iconAnchor: [12, 12] });
}

// 2026-08-21, op verzoek van Lex ("vliegtuigjes zonder cirkeltje maken en de
// juiste koers laten draaien") — losgetrokken van bouwVerkeerIcon()
// hierboven (die blijft voor ⛴️, ongewijzigd). Roteert de ✈️-emoji via een
// CSS-transform naar koersGraden (track, "course over ground" uit
// vliegradar.js).
//
// -45deg-correctie: de ✈️-glyph zelf wijst in vrijwel alle emoji-lettertypen
// (Apple/Twemoji/Noto, dus ook op Lex' iPhone) van nature naar
// rechtsboven — ongeveer 45° t.o.v. "recht omhoog" (noord). Een kompaskoers
// van 0° (recht naar het noorden) moet de neus dus 45° TERUGdraaien om weer
// recht omhoog te wijzen; bij koers 45° (NO) hoeft-ie dan niet te draaien,
// enzovoort. Dit is een bekende, veelgebruikte vuistregel voor deze emoji,
// geen exacte per-toestel-meting — bij twijfel gewoon zelf even vergelijken
// met een bekende vlucht op de kaart en zo nodig het getal "45" hieronder
// bijstellen.
function bouwVliegIcon(koersGraden) {
  const rotatie = typeof koersGraden === 'number' ? koersGraden - 45 : 0;
  return L.divIcon({
    className: '',
    html: `<div class="vlieg-pin" style="transform:rotate(${rotatie}deg)">✈️</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

// 2026-08-21, op verzoek van Lex ("ze verdwijnen nu periodiek of zo") — elke
// poll (om de 3s) vuurt een nieuw /api/vliegradar-verzoek af zonder het
// vorige te annuleren. Normaal komen die keurig op volgorde terug, maar
// zodra er netwerkdrukte is (bijv. Regenradar/Satelliet die tegelijk tegels
// laden) kan een oudere, tragere reactie NA een nieuwere, snellere
// binnenkomen — en die dan alsnog overschrijven met verouderde (soms lege)
// data. `vliegVerzoekTeller` is een simpel oplopend volgnummer: elke aanroep
// onthoudt zijn eigen nummer bij de start, en mag de kaart alleen bijwerken
// als dat nog steeds het NIEUWSTE gestarte verzoek is — een inmiddels
// ingehaalde, te laat binnenkomende reactie wordt dan gewoon genegeerd i.p.v.
// de kaart terug te zetten naar oude/lege data.
let vliegVerzoekTeller = 0;

async function ververVliegradar() {
  if (!vliegModusActief || !kaart) return;
  const verzoekId = ++vliegVerzoekTeller;
  try {
    const { lat, lon } = await vliegPollPositie();
    if (!vliegModusActief || verzoekId !== vliegVerzoekTeller) return; // uitgezet, of al ingehaald door een nieuwere poll
    const data = await fetch(`/api/vliegradar?lat=${lat}&lon=${lon}&straal=${VLIEGRADAR_STRAAL_KM}`).then((r) => r.json());
    if (!vliegModusActief || verzoekId !== vliegVerzoekTeller) return; // idem, na de fetch
    // Scope-cirkel meteen op dezelfde lat/lon/straal als de data hierboven —
    // setLatLng/setRadius i.p.v. opnieuw aanmaken, zodat 'm gewoon meebeweegt
    // i.p.v. elke poll te flitsen.
    if (!vliegScopeCirkel) {
      vliegScopeCirkel = L.circle([lat, lon], {
        radius: VLIEGRADAR_STRAAL_KM * 1000,
        color: '#3ec6ff',
        weight: 1,
        dashArray: '4 6',
        fillColor: '#3ec6ff',
        fillOpacity: 0.04,
        interactive: false,
      }).addTo(kaart);
    } else {
      vliegScopeCirkel.setLatLng([lat, lon]);
      vliegScopeCirkel.setRadius(VLIEGRADAR_STRAAL_KM * 1000);
    }
    if (!vliegLaag) vliegLaag = L.layerGroup().addTo(kaart);
    vliegLaag.clearLayers();
    (data.vliegtuigen ?? []).forEach((v) => {
      const marker = L.marker([v.lat, v.lon], { icon: bouwVliegIcon(v.koersGraden) });
      const naam = v.callsign || v.registratie || v.icao || 'onbekend vliegtuig';
      const details = [
        v.altitudeFt != null ? `${Math.round(v.altitudeFt)} ft` : v.grond ? 'op de grond' : null,
        v.snelheidKnts != null ? `${Math.round(v.snelheidKnts)} kn` : null,
        `${v.afstandKm} km van jou`,
      ]
        .filter(Boolean)
        .join(' · ');
      marker.bindPopup(`<div class="popup-titel">✈️ ${escapeHtml(naam)}</div><div class="popup-sub">${escapeHtml(details)}</div>`);
      // 2026-08-21: er stond hier voorheen GEEN eigen klik-gedrag — alleen de
      // popup, geen zoom. Wat Lex zag "inzoomen op de verkeerde plek" was dus
      // vermoedelijk de browser/telefoon die een toevallige dubbeltik als
      // eigen zoom-gebaar interpreteerde (het ✈️-icoontje is maar 24px, snel
      // misgetikt) i.p.v. een bewuste actie van de app. Nu een expliciete,
      // eigen handler die altijd de EXACTE data-coördinaat van dit toestel
      // gebruikt (v.lat/v.lon, niet een van de klik zelf afgeleide positie),
      // dus 'm gegarandeerd op de juiste locatie zet.
      marker.on('click', () => {
        beweegKaartProgrammatisch(() => kaart.setView([v.lat, v.lon], Math.max(kaart.getZoom(), VLIEGRADAR_KLIK_ZOOM)));
      });
      vliegLaag.addLayer(marker);
    });
  } catch (err) {
    console.error('vliegradar ophalen mislukt', err);
  }
}

async function ververVaarradar() {
  if (!vaarradarActief || !kaart) return;
  try {
    const { lat, lon } = await huidigePositie();
    if (!vaarradarActief) return;
    const data = await fetch(`/api/vaarradar?lat=${lat}&lon=${lon}&straal=${VAARRADAR_STRAAL_KM}`).then((r) => r.json());
    if (!vaarradarActief) return;
    if (!vaarLaag) vaarLaag = L.layerGroup().addTo(kaart);
    vaarLaag.clearLayers();
    (data.schepen ?? []).forEach((s) => {
      const marker = L.marker([s.lat, s.lon], { icon: bouwVerkeerIcon('⛴️') });
      const naam = s.naam || `schip (MMSI ${s.mmsi})`;
      const details = [s.snelheidKn != null ? `${Math.round(s.snelheidKn)} kn` : null, `${s.afstandKm} km van jou`].filter(Boolean).join(' · ');
      marker.bindPopup(`<div class="popup-titel">⛴️ ${escapeHtml(naam)}</div><div class="popup-sub">${escapeHtml(details)}</div>`);
      vaarLaag.addLayer(marker);
    });
  } catch (err) {
    console.error('vaarradar ophalen mislukt', err);
  }
}

function zorgRadarPolling() {
  if (radarPollTimer) {
    clearInterval(radarPollTimer);
    radarPollTimer = null;
  }
  if (!vliegModusActief && !vaarradarActief) return;
  const tick = () => {
    if (vliegModusActief) ververVliegradar();
    if (vaarradarActief) ververVaarradar();
  };
  tick();
  radarPollTimer = setInterval(tick, RADAR_POLL_MS);
}

// 2026-08-21, op verzoek van Lex ("wil je iets meer inzoomen bij Vlucht") —
// zelfde patroon als REGENRADAR_ZOOM hierboven: alleen INzoomen als je
// verder uitgezoomd staat dan dit niveau, nooit uitzoomen.
// 2026-08-21-fix, op verzoek van Lex ("de knop Vlucht... zoomde in op de
// range die was gekozen voor de data" — d.w.z. wél op dit zoomniveau, maar
// niet op de juiste locatie) — hierboven stond destijds nog "positie/pan
// blijft met rust", maar dat klopte hier niet: de vliegtuigdata komt van
// `huidigePositie()` (live GPS, zie ververVliegradar()), niet van waar de
// kaart toevallig al gecentreerd stond (bijv. nog op Home). Bij dit
// zoomniveau maar de VERKEERDE plek zie je dus geen/willekeurige
// vliegtuigen. Fix in toggleVliegradar() hieronder: nu ook pannen naar
// diezelfde live positie, niet alleen inzoomen.
// 2026-08-21-fix #2, op verzoek van Lex (straal 50 → 75 km hierboven, en
// daarna: "ik zie geen vliegtuigen meer verschijnen en kan je wat verder
// uitzoomen zodat ik die blauwe cirkel ook echt zie") — 9 stond hier nog uit
// de tijd van de 50km-straal en was met de nieuwe 75km-straal (150km
// doorsnede) te krap: op een telefoonscherm toont zoomniveau 9 maar zo'n
// 70km breed rond het middelpunt (Web Mercator: ~364px/graad lengtegraad op
// z9, een scherm van ~380px dus ~1,04° ≈ 71km bij 52°N) — dus maar de helft
// van de straal, en dus ook geen/weinig vliegtuigen in de buitenste helft
// van de scope. Terug naar 7 (zelfde als REGENRADAR_ZOOM, met dezelfde
// bedoeling: "genoeg overzicht om de hele laag te zien") — op z7 past de
// volle 150km-doorsnede ruim binnen een telefoonscherm (~286km breed).
// 2026-08-21-fix #3, op verzoek van Lex ("1 stapje verder inzoomen") — 7 was
// blijkbaar een tikje te ruim; 8 zit er tussenin.
const VLIEGRADAR_ZOOM = 8;
// 2026-08-21, op verzoek van Lex ("als er lukraak op het vliegtuigje wordt
// geklikt dat er wel wordt ingezoomd, maar dan wel op de juiste locatie")
// — dichter dan VLIEGRADAR_ZOOM hierboven (dat is de "genoeg om vliegtuigen
// te zien"-zoom bij het aanzetten van de modus zelf), specifiek voor het
// aantikken van één toestel.
const VLIEGRADAR_KLIK_ZOOM = 12;

function toggleVliegradar() {
  vliegModusActief = !vliegModusActief;
  TOGGLE_VLIEGRADAR_EL.classList.toggle('actief', vliegModusActief);
  if (vliegModusActief) {
    // Wederzijds uitsluitend met Zee-modus/Vaarradar (Lex: "of boten of
    // vliegtuigen") — toggleVaarradar() zet zeeModusActief zelf ook uit, dus
    // die ene aanroep dekt beide gevallen als vaarradarActief aanstond.
    if (vaarradarActief) toggleVaarradar();
    else if (zeeModusActief) toggleZeeModus();
    // 2026-08-22: ISS/Starlink-kaarttracking verbergt zelf ook alle andere
    // iconen (zie startKaartVolgen()) — dus ook hier wederzijds uitsluitend.
    if (kaartVolgType) stopKaartVolgen(false);
    // Pannen NAAR de live GPS-positie (dezelfde die ververVliegradar() voor
    // de data gebruikt), niet alleen inzoomen op waar de kaart toevallig al
    // stond — zie de comment bij VLIEGRADAR_ZOOM hierboven voor de reden.
    if (kaart) {
      huidigePositie().then(({ lat, lon }) => {
        if (!vliegModusActief || !kaart) return; // ondertussen alweer uitgezet terwijl we op de GPS-positie wachtten
        // Zelfde fix meteen doorgevoerd naar de eerste poll: deze fix telt nu
        // ook als de "verse" positie voor vliegPollPositie() hierboven, dus
        // ververVliegradar()'s eerste tick (via zorgRadarPolling's tick()
        // hieronder) vraagt niet nóg een keer apart de GPS op.
        vliegPositieCache = { lat, lon, tijdMs: Date.now() };
        beweegKaartProgrammatisch(() => kaart.setView([lat, lon], Math.max(kaart.getZoom(), VLIEGRADAR_ZOOM)));
      });
    }
  } else {
    if (vliegLaag) {
      kaart.removeLayer(vliegLaag);
      vliegLaag = null;
    }
    if (vliegScopeCirkel) {
      kaart.removeLayer(vliegScopeCirkel);
      vliegScopeCirkel = null;
    }
    // Cache leeggooien bij uitzetten — anders gebruikt een latere heraanzet
    // (binnen VLIEGRADAR_POSITIE_VERS_MS) nog een mogelijk allang verouderde
    // positie i.p.v. meteen een verse op te vragen.
    vliegPositieCache = null;
  }
  zorgRadarPolling();
  renderMap(laatsteMeldingenSignalen);
}

function toggleVaarradar() {
  vaarradarActief = !vaarradarActief;
  TOGGLE_VAARRADAR_EL.classList.toggle('actief', vaarradarActief);
  if (vaarradarActief) {
    if (vliegModusActief) toggleVliegradar(); // wederzijds uitsluitend, zie toggleVliegradar
    if (!zeeModusActief) toggleZeeModus(); // Lex: "als voor boten wordt gekozen dan uiteraard meteen de zeekaart"
    if (kaartVolgType) stopKaartVolgen(false); // zie toggleVliegradar
  } else {
    if (vaarLaag) {
      kaart.removeLayer(vaarLaag);
      vaarLaag = null;
    }
    if (zeeModusActief) toggleZeeModus(); // vaarradar "bezat" de zeemodus-activatie hierboven, dus ook weer uit
  }
  zorgRadarPolling();
}

// ---- Live kaarttracking ISS/Starlink, 2026-08-22 ---------------------
// Eerst gebouwd als twee losse kaartknoppen ("Zoek ISS" additief,
// "Starlink" een echte icoon-verbergende modus — zie de git-historie/oudere
// projectnotities), maar dat bleek niet wat Lex wilde: "De starlink knop
// wil ik niet op de kaart eigenlijk de ISS knop ook niet. Die zouden gewoon
// vanaf hemel naar de kaart moeten navigeren waarna er een knop Stop
// zichtbaar is. Waarmee ISS/Starlink wordt verborgen, alle hazards weer
// terugkomen en er wordt teruggenavigeerd naar Hemel." Dus: geen knoppen
// meer in .radar-controls (zie index.html), de trigger zit nu bij de
// ISS/Starlink-subgroepen op Hemel (de "📍 Live op kaart"-knop in
// renderSky() verderop), en er is nu precies ÉÉN gedeeld mechanisme i.p.v.
// twee losse — kaartVolgType hieronder is 'iss' | 'starlink' | null.
let kaartVolgType = null;
let kaartVolgLaag = null; // ISS: L.marker. Starlink: L.layerGroup (marker + de twee spoor-lijnen).
let kaartVolgPollTimer = null;
let kaartVolgEerstePan = false; // eerste tick na aanzetten: fitBounds (geen animatie), erna fly-varianten — zelfde reden als voorheen bij starlinkEerstePan
// 2026-08-23-bug (Lex: "ISS Live op kaart... zoomt vanzelf weer uit"): zelfde
// patroon als geselecteerdGebiedId/ververGeselecteerdGebied (zie de
// 2026-08-20-bug-comment in initMap()) maar dan voor deze 6s-poll — die deed
// tot nu toe ELKE tick onvoorwaardelijk flyToBounds(home+ISS), ook nadat Lex
// zelf handmatig had in-/uitgezoomd of gepand. Gezet door de 'zoomend
// dragend'-listener (alleen bij een echte, niet-programmatische actie) en
// weer gereset bij het (her)starten van het volgen. Zolang 'ie true is, blijft
// de marker gewoon meebewegen/updaten — alleen het automatisch camerabewegen
// stopt.
let kaartVolgGebruikerHeeftGezoomd = false;
const KAART_VOLG_POLL_MS = 6000; // zelfde cadans als voorheen bij Zoek ISS/Starlink
// 2026-08-23-bug (Lex: "Als ik kies voor ISS Live op kaart dan zie ik altijd
// meteen de hele wereldkaart"): de ISS-tak van ververKaartVolgLaag() deed tot
// nu toe fitBounds/flyToBounds tussen THUIS én de actuele ISS-positie — bij
// een baan van ~90 min rond de aarde staat de ISS het overgrote deel van de
// tijd een halve aardbol van huis vandaan, dus dat forceerde bijna altijd een
// bijna-wereldwijd zoomniveau. Gekozen fix (Lex: "alleen op ISS centreren"):
// negeer THUIS voor het bepalen van de camera, centreer gewoon op de ISS zelf
// met dit vaste zoomniveau. Starlink hieronder blijft ONGEWIJZIGD — dat volgt
// een baan-segment (achter+voor) i.p.v. een los punt, dus fitBounds op dat
// segment blijft daar wél zinnig.
const ISS_VOLG_ZOOM = 4;

// Een grondspoor dat de datumgrens (180°/-180° lengtegraad) kruist zou
// anders als kaartbrede streep over de hele kaart getekend worden i.p.v. een
// lokale lijn — knip het spoor op elke sprong >180° in aparte stukken.
// Alleen relevant voor Starlink (ISS toont geen spoor, alleen een marker).
function splitsOpAntimeridiaan(punten) {
  const stukken = [];
  let huidig = [];
  for (let i = 0; i < punten.length; i++) {
    if (i > 0 && Math.abs(punten[i][1] - punten[i - 1][1]) > 180) {
      if (huidig.length) stukken.push(huidig);
      huidig = [];
    }
    huidig.push(punten[i]);
  }
  if (huidig.length) stukken.push(huidig);
  return stukken;
}

// Eén gedeelde ververfunctie voor beide typen — branch op kaartVolgType voor
// de route (/api/iss-live resp. /api/starlink-live) en de laag-opbouw
// (simpele marker resp. marker+spoor), maar met dezelfde levenscyclus
// (polling, eerste-pan-vs-volg-pan, wegvallen → stopKaartVolgen).
function ververKaartVolgLaag() {
  const type = kaartVolgType;
  if (!type) return;
  const url = type === 'iss' ? '/api/iss-live' : '/api/starlink-live';
  fetch(url)
    .then((r) => {
      if (r.status === 404) return null; // Starlink: geen actieve trein — geen fout, zie server.js
      if (!r.ok) throw new Error(`status ${r.status}`);
      return r.json();
    })
    .then((live) => {
      if (kaartVolgType !== type || !kaart) return; // ondertussen alweer uitgezet of van type gewisseld
      if (!live) {
        console.log(`${type}-live: geen data (meer), tracking zelf gestopt`);
        stopKaartVolgen(false); // geen bewuste Stop-tik van Lex, dus niet terug naar Hemel
        return;
      }

      const huidigPunt = [live.latitude, live.longitude];

      if (type === 'iss') {
        // 2026-08-23, op verzoek van Lex ("De zich verplaatsende ISS kan geen
        // spoor nalaten?") — was tot nu toe een kale L.marker die zichzelf
        // verplaatste (setLatLng), nu net als Starlink hieronder een
        // L.layerGroup die elke tick opnieuw wordt opgebouwd, zodat er ook een
        // spoorlijn bij kan. Belangrijk verschil met Starlink: issLive.js doet
        // geen SGP4-baanpropagatie, dus er is geen voorspelde baanVoor — de
        // backend bouwt baanAchter op uit ECHT waargenomen posities (zie de
        // module-comment daar), dus alleen een spoor NAAR het huidige punt
        // toe, geen dashed lijn ervoorbij.
        if (!kaartVolgLaag) kaartVolgLaag = L.layerGroup().addTo(kaart);
        kaartVolgLaag.clearLayers();

        if (Array.isArray(live.baanAchter) && live.baanAchter.length >= 2) {
          // 2026-08-23, op verzoek van Lex ("ISS kan ik de afgelegde baan in
          // een andere kleur zien zodat het aspect duidelijker wordt", later
          // verduidelijkt: "de baan die al was afgelegd... in licht en wat ie
          // nieuw opbouwt zelfde kleur feller") — cometstaart-effect: het hele
          // spoor licht/bleek, met het laatste minuutje (zie
          // baanAchterRecent/SPOOR_RECENT_MS in issLive.js) er in de
          // originele, meer verzadigde tint (#5dffc5) bovenop getekend.
          // 2026-08-23-vervolg (Lex: "de afgelegde baan... is nu lastig te
          // zien", eerst geprobeerd met "nog witter/bleker mintgroen"
          // (#e8fff7) — bleek nog steeds onvoldoende, Lex koos daarna
          // expliciet voor "contrasterende kleur, geel of zo") — mintgroen/wit
          // ligt te dicht bij de (geïnverteerde) blauwgroene kaarttinten, geel
          // springt daar wél tegenaf. #ffe066 (lichtgeel) voor het hele spoor.
          // 2026-08-23-vervolg 2 (Lex: "dat contrast is te klein... opbouw
          // vanaf kijken andere kleur") — de eerdere opzet had het verse
          // staartje in een ANDERE TINT GEEL (#ffb703, amber), en dat bleek
          // zelf te weinig af te steken tegen het lichtgele hele spoor. Nu
          // bewust geen twee gele tinten meer (geen bleek/verzadigd-variant
          // binnen dezelfde kleurfamilie) maar een compleet andere, sterk
          // contrasterende kleur voor het staartje: helderblauw (#2979ff) —
          // geel/blauw is complementair, dus dat springt er los van elkaar
          // maximaal uit. Afgelegde baan blijft geel.
          splitsOpAntimeridiaan([...live.baanAchter, huidigPunt]).forEach((stuk) => {
            L.polyline(stuk, { color: '#ffe066', weight: 3, opacity: 0.9 }).addTo(kaartVolgLaag);
          });
        }
        if (Array.isArray(live.baanAchterRecent) && live.baanAchterRecent.length >= 2) {
          splitsOpAntimeridiaan([...live.baanAchterRecent, huidigPunt]).forEach((stuk) => {
            L.polyline(stuk, { color: '#2979ff', weight: 3.5, opacity: 0.95 }).addTo(kaartVolgLaag);
          });
        }

        // bindPopup opnieuw aanroepen vervangt gewoon de bestaande inhoud
        // (Leaflet-standaardgedrag) — geen aparte "bestaat de popup al"-check
        // nodig.
        L.marker(huidigPunt, {
          icon: L.divIcon({ className: '', html: '<div class="verkeer-pin">🛰️</div>', iconSize: [24, 24], iconAnchor: [12, 12] }),
        })
          .bindPopup(
            `<div class="popup-titel">🛰️ ISS</div><div class="popup-sub">${live.hoogteKm} km hoog · ${Math.round(live.snelheidKmu)} km/u · ${live.afstandTotJouKm} km van jou</div>`
          )
          .addTo(kaartVolgLaag);
        // Zie de 2026-08-23-bug-comment bij ISS_VOLG_ZOOM hierboven — bewust
        // GEEN bounds meer met THUIS erin, gewoon op de ISS zelf centreren.
        if (kaartVolgEerstePan) {
          beweegKaartProgrammatisch(() => kaart.setView(huidigPunt, ISS_VOLG_ZOOM));
          kaartVolgEerstePan = false;
        } else if (!kaartVolgGebruikerHeeftGezoomd) {
          beweegKaartProgrammatisch(() => kaart.flyTo(huidigPunt, ISS_VOLG_ZOOM, { duration: 1 }));
        }
      } else {
        if (!kaartVolgLaag) kaartVolgLaag = L.layerGroup().addTo(kaart);
        kaartVolgLaag.clearLayers();

        // Doorlopende lijn: baanAchter (verleden) + huidig punt + baanVoor
        // (toekomst) — apart getekend (twee stijlen, Lex: "een baan voor en
        // achter") maar wel aan elkaar geknoopt zodat er geen gat bij "nu" zit.
        const achterPunten = [...live.baanAchter, huidigPunt];
        const voorPunten = [huidigPunt, ...live.baanVoor];

        splitsOpAntimeridiaan(achterPunten).forEach((stuk) => {
          L.polyline(stuk, { color: '#8b5cf6', weight: 3, opacity: 0.85 }).addTo(kaartVolgLaag);
        });
        splitsOpAntimeridiaan(voorPunten).forEach((stuk) => {
          L.polyline(stuk, { color: '#8b5cf6', weight: 2.5, opacity: 0.5, dashArray: '2,8' }).addTo(kaartVolgLaag);
        });

        L.marker(huidigPunt, {
          icon: L.divIcon({ className: '', html: '<div class="verkeer-pin">🚀</div>', iconSize: [24, 24], iconAnchor: [12, 12] }),
        })
          .bindPopup(
            `<div class="popup-titel">🚀 ${escapeHtml(live.naam ?? 'Starlink-trein')}</div><div class="popup-sub">${live.hoogteKm} km hoog · ${live.afstandTotJouKm} km van jou${live.zichtbaarNu ? ` · ${live.elevatieGraden}° boven ${live.richting}` : ''}</div>`
          )
          .addTo(kaartVolgLaag);

        // "Die wordt gevolgd" (Lex) — elke tick opnieuw fitten op het
        // (schuivende) spoor + Home. fitBounds (geen animatie) bij de
        // allereerste tick na aanzetten, daarna flyToBounds (met animatie) —
        // voorkomt een rare spring-in-je-gezicht-zoom vanaf de vorige
        // kaartpositie bij het aanzetten zelf.
        const bounds = L.latLngBounds([...achterPunten, ...voorPunten, [THUIS.homeLat, THUIS.homeLon]]).pad(0.15);
        if (kaartVolgEerstePan) {
          beweegKaartProgrammatisch(() => kaart.fitBounds(bounds, { maxZoom: 8 }));
          kaartVolgEerstePan = false;
        } else if (!kaartVolgGebruikerHeeftGezoomd) {
          beweegKaartProgrammatisch(() => kaart.flyToBounds(bounds, { maxZoom: 8, duration: 1 }));
        }
      }
    })
    .catch((err) => console.error(`${type}-live ophalen mislukt`, err));
}

function zorgKaartVolgPolling() {
  if (kaartVolgPollTimer) {
    clearInterval(kaartVolgPollTimer);
    kaartVolgPollTimer = null;
  }
  if (!kaartVolgType) return;
  ververKaartVolgLaag();
  kaartVolgPollTimer = setInterval(ververKaartVolgLaag, KAART_VOLG_POLL_MS);
}

// Trigger vanuit Hemel (zie de "📍 Live op kaart"-knop in renderSky()
// verderop) — navigeert naar Kaart, verbergt alle hazard-iconen
// (renderMap()'s teTonenSignalen hieronder reageert op kaartVolgType) en
// toont de zwevende Stop-knop (#kaartVolgStopWrap). Wederzijds uitsluitend
// met Vlucht/Vaart/Zee, zelfde soort keten als die drie al onderling hadden.
function startKaartVolgen(type) {
  if (kaartVolgType === type) {
    wisselView('kaart'); // al actief: gewoon (terug) naar de kaart, geen re-toggle nodig
    return;
  }
  if (kaartVolgType) stopKaartVolgen(false); // van het andere type wisselen, niet terug naar Hemel
  if (vliegModusActief) toggleVliegradar();
  if (vaarradarActief) toggleVaarradar();
  if (zeeModusActief) toggleZeeModus();

  kaartVolgType = type;
  kaartVolgEerstePan = true;
  kaartVolgGebruikerHeeftGezoomd = false;
  if (KAART_VOLG_STOP_WRAP_EL) KAART_VOLG_STOP_WRAP_EL.style.display = 'flex';
  if (KAART_VOLG_STOP_LABEL_EL) KAART_VOLG_STOP_LABEL_EL.textContent = type === 'iss' ? 'ISS' : 'Starlink';
  wisselView('kaart');
  zorgKaartVolgPolling();
  renderMap(laatsteMeldingenSignalen);
}

// terugNaarHemel=false wanneer dit een automatische stop is (bijv. Vlucht/
// Vaart/Zee die het overneemt, of een Starlink-trein die verdwijnt) — dan
// blijf je gewoon staan waar je stond. true is de bewuste Stop-tik van Lex
// zelf: "Waarmee ISS/Starlink wordt verborgen, alle hazards weer terugkomen
// en er wordt teruggenavigeerd naar Hemel."
function stopKaartVolgen(terugNaarHemel) {
  if (!kaartVolgType) return;
  kaartVolgType = null;
  kaartVolgGebruikerHeeftGezoomd = false;
  if (kaartVolgPollTimer) {
    clearInterval(kaartVolgPollTimer);
    kaartVolgPollTimer = null;
  }
  if (kaartVolgLaag && kaart) {
    kaart.removeLayer(kaartVolgLaag);
    kaartVolgLaag = null;
  }
  if (KAART_VOLG_STOP_WRAP_EL) KAART_VOLG_STOP_WRAP_EL.style.display = 'none';
  // Lex (destijds over Starlink, hier voor beide types aangehouden): "Als de
  // knop wordt uitgezet dan automatisch Home."
  if (kaart) beweegKaartProgrammatisch(() => kaart.setView([THUIS.homeLat, THUIS.homeLon], 6));
  renderMap(laatsteMeldingenSignalen);
  if (terugNaarHemel) wisselView('hemel');
}

function renderMap(signalen) {
  if (!kaart) return; // wacht tot initMap() is geweest
  signaalLaag.clearLayers();
  markersPerId.clear();
  // 2026-08-20, bugfix: de else-tak liet voorheen gewoon `signalen`
  // ongefilterd staan, dus NAVTEX-pins bleven altijd zichtbaar, ook met Zee-
  // modus UIT ("de icons voor de zee ook pas NA de keuze voor de Zee knop
  // zichtbaar worden", aldus Lex). Nu ook hier expliciet uitsluiten.
  // 2026-08-21: Vliegradar toont ALLEEN vliegtuigmarkers (zie
  // ververVliegradar/vliegLaag), geen enkel ander kaart-icoon (Lex: "of
  // boten of vliegtuigen") — vandaar hier een lege lijst i.p.v. de
  // gebruikelijke zee-modus/hazard-splitsing.
  // 2026-08-22: ISS/Starlink-kaarttracking (kaartVolgType) hoort in
  // hetzelfde rijtje als Vliegradar hierboven (Lex: "alle andere icons
  // verborgen") — leeg lijstje, geen enkel ander kaart-icoon zolang er
  // getrackt wordt.
  const teTonenSignalen = vliegModusActief || kaartVolgType
    ? []
    : zeeModusActief
      ? signalen.filter((s) => s.categorie === 'navtex')
      : signalen.filter((s) => s.categorie !== 'navtex');
  teTonenSignalen
    .filter((s) => s.lat != null && s.lon != null)
    .forEach((s) => {
      // Gevlogen spoor eerst tekenen (onder de marker) — zelf opgebouwd door
      // de backend sinds die 'm is gaan volgen (geen historie van vóór het
      // opstarten), zie detail.route in sources/lifeliner.js. Dunne gele lijn,
      // zelfde kleur als het helikoptertje zelf.
      if (isLifeliner(s) && Array.isArray(s.detail?.route) && s.detail.route.length >= 2) {
        L.polyline(s.detail.route, {
          color: '#ffd633',
          weight: 2.5,
          opacity: 0.65,
          dashArray: '1,6',
          lineCap: 'round',
        }).addTo(signaalLaag);
      }

      const pinKlasse = isLifeliner(s) ? 'is-lifeliner' : `ernst-${s.ernst}`;
      // 2026-08-20: detail.verlopen (zie historie.js) — tot 48u terug bewaarde
      // waarschuwingen die niet meer actief zijn, puur als lichte trail op de
      // kaart ("waar was het") i.p.v. een volwaardige actieve melding (die
      // staan niet meer in de Meldingen-lijst, zie renderMeldingen).
      const verlopenKlasse = s.detail?.verlopen ? ' is-verlopen' : '';
      // 2026-08-24, op verzoek van Lex ("als het van ukho is maken we ze
      // blauw (test)") — puur een tijdelijk, visueel testmiddel om
      // navtexLokaal- en UKHO-signalen op de kaart uit elkaar te kunnen
      // houden (zie detail.bron in navtexLokaal.js/ukho.js). Bewust een losse
      // klasse i.p.v. iets permanents in het stationskleur-systeem — "(test)"
      // suggereert dit kan zo weer verdwijnen zodra Lex 'm gezien heeft.
      const ukhoTestKlasse = s.detail?.bron === 'ukho' ? ' is-ukho-test' : '';
      // 2026-08-24, op verzoek van Lex ("en dan diezelfde blauwe zweem er
      // achter als bij de rigs, dat vind ik wel mooi") — zelfde blauwe
      // drop-shadow-gloed als is-ukho-test hierboven, maar dan altijd voor
      // kabel-signalen (los van de bron), zie .navtex-pin.is-kabel in
      // styles.css.
      const kabelKlasse = s.detail?.eventType === 'kabel' ? ' is-kabel' : '';
      // 2026-08-24, op verzoek van Lex ("maatje groter pls") — het
      // boot-met-sonargolven-icoon vult zijn eigen 24x24-viewBox al vrijwel
      // helemaal (zie NAVTEX_SURVEY_SVG hierboven), dus verder inzoomen op
      // de viewBox zelf scheelde weinig; i.p.v. dat, of de gedeelde
      // .navtex-pin svg-maat (22px, geldt voor ALLE navtex-iconen) aan te
      // passen, een eigen klasse net als is-kabel/is-ukho-test, zodat alleen
      // survey groter wordt.
      const surveyKlasse = s.detail?.eventType === 'survey' ? ' is-survey' : '';
      // 2026-08-24: zelfde reden als is-survey hierboven — het losse
      // ketting-schakeltje boven het anker (zie NAVTEX_ANKER_SVG) is op de
      // standaard 22px-maat nauwelijks te onderscheiden.
      const ankerKlasse = s.detail?.eventType === 'anker-verloren' ? ' is-anker' : '';
      // 2026-08-20, op verzoek van Lex: NAVTEX is "een volledig separaat
      // gebeuren" t.o.v. de landgebonden hazard-pins — geen gedeelde ronde
      // achtergrond/ernst-kleur, een eigen (kleinere, vierkante, maritiem
      // getinte) marker i.p.v. .hazard-pin, zie .navtex-pin in styles.css.
      const icon = s.categorie === 'navtex'
        ? L.divIcon({
            className: '',
            html: `<div class="navtex-pin${verlopenKlasse}${ukhoTestKlasse}${kabelKlasse}${surveyKlasse}${ankerKlasse}">${hazardIconHtml(s)}</div>`,
            iconSize: [26, 26],
            iconAnchor: [13, 13],
          })
        : L.divIcon({
            className: '',
            html: `<div class="hazard-pin ${pinKlasse}${verlopenKlasse}">${hazardIconHtml(s)}</div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15],
          });
      const popupBreedte = POPUP_BREED_CATEGORIEEN.has(s.categorie) ? 300 : 240;
      const marker = L.marker([s.lat, s.lon], { icon })
        .addTo(signaalLaag)
        .bindPopup(popupHtml(s), { maxWidth: popupBreedte });
      markersPerId.set(s.id, marker);
    });
  // 2026-08-20, op verzoek van Lex ("2 gebieden in Raleigh maar maar 1
  // outline bij beide apart") — ALLE actieve gebied-omtrekken (tornado-
  // watch/severe-outlook/severe-thunderstorm-polygonen, orkaan-cone+koers)
  // tegelijk tekenen, elke cyclus, net als de hazard-pins hierboven i.p.v.
  // alleen de laatst-aangetikte. Zelfde teTonenSignalen als de pins (dus ook
  // hier uit tijdens Zee-modus, consistent met de rest van de kaart).
  tekenAlleGebiedOmtrekken(teTonenSignalen);
  // Geen eigen ververs-lus voor de flitsenstippen — die liften mee op
  // dezelfde 20-seconden-cyclus die renderMap() toch al elke keer met verse
  // data aanroept (zie verversen()). ververGeselecteerdGebied houdt alleen
  // nog de kaartpositie bij (tekenen gebeurt hierboven al voor iedereen).
  ververGeselecteerdeFlitsen(signalen);
  ververGeselecteerdGebied(signalen);
}

// ---- Meldingen-lijst (vervangt de horizontale sleepbalk) --------------
// Groepeert per categorie en toont daarbinnen alleen de meest urgente/recente
// melding + een "+N meer"-knop voor de rest — zodat bijv. 8 aardbevingen niet
// de hele lijst vullen. Ambient info die al elders staat (Hemel-tab,
// weerkaartje) wordt hier helemaal niet getoond.
// 2026-08-24, op verzoek van Lex ("ik kan niet makkelijk zien welke de
// nieuwe berichten zijn" — de NAVTEX-lijst groeit gestaag, nu 99 berichten)
// — "nieuw"-markering voor NAVTEX. Ontwerp na overleg met Lex (eerste opzet,
// "gezien" meteen bij openen van de categorie, werd expliciet afgewezen:
// "dan zijn in 1 keer de nieuwe berichten niet nieuw... verdwijnt de
// markering precies op het moment dat je 'm wil zien"). In plaats daarvan:
// een bericht blijft "nieuw" (afwijkende kleur + pil, zie maakMeldingItem)
// tot de categorie weer dichtklapt, of tot MAX 10 minuten na het openen —
// wat het eerst komt ("verval start vanaf openen categorie"). Ervoor blijft
// de markering onbeperkt staan (geen decay-klok loopt) zolang de categorie
// niet geopend is. Na verval geen aparte sectie/hersortering — de berichten
// vallen gewoon terug in de bestaande tijd-sortering, zoals Lex bevestigde
// ("dan komen die berichten in de normale volgorde").
// 2026-08-25-herzien, op verzoek van Lex ("blokkeer even dat mechanisme met
// dat openen en sluiten dat groene weghaalt"): de open/sluit-categorie- +
// 10-minuten-vervaltimer hierboven (localStorage-grens `navtexLaatstGezien`,
// bijgewerkt via vervalNavtexNieuw()) is helemaal weg. Nieuwe, simpelere
// regel: een NAVTEX-bericht is "nieuw" zolang het EIGEN tijdstip (s.tijd) op
// dezelfde kalenderdag valt als vandaag (lokale tijd van de browser) — geen
// timer, geen "gezien"-registratie, geen open/sluit-koppeling meer nodig. De
// dag erna is het vanzelf niet meer "vandaag", dus vervalt de markering
// vanzelf, zonder enige opgeslagen staat. Zie ook de tekst in de pil zelf
// (maakMeldingItem hieronder): "Nieuw op <datum tijd>" i.p.v. kaal "NIEUW",
// zodat meteen zichtbaar is WANNEER het binnenkwam, niet alleen DAT het
// nieuw is.
function isNavtexNieuw(s) {
  if (s.categorie !== 'navtex' || !s.tijd) return false;
  const d = new Date(s.tijd);
  if (Number.isNaN(d.getTime())) return false;
  return d.toDateString() === new Date().toDateString();
}

let laatsteMeldingenSignalen = [];
let uitgeklapteCategorieen = new Set();
// 2026-08-20, op verzoek van Lex: naast de gedimde pinnetjes op de kaart
// (die blijven gewoon bestaan) óók een eigen, uitklapbare "verlopen"-sectie
// per categorie in de Meldingen-lijst — reden: bij meerdere losse verlopen
// meldingen ver uit elkaar (bv. county's aan tegenovergestelde kanten van de
// VS) vallen die pinnetjes op de kaart makkelijk niet op, zeker als je net
// op een andere plek staat ingezoomd. Los bijgehouden van
// uitgeklapteCategorieen hierboven, want onafhankelijk uit/inklapbaar.
let uitgeklapteVerlopenCategorieen = new Set();

// 2026-08-20, op verzoek van Lex ("nog een sublevel voor aardbevingen — per
// locatie gegroepeerd, laatste bovenaan"): een niveau dieper dan de
// bestaande "+N meer"-knop hierboven — die knop klapt bij deze categorieën
// niet langer een platte lijst open, maar een lijst van locatiegroepen (bv.
// "Cobb, CA (3)"), die zelf ook weer aan/uit te klappen zijn. Sleutel in
// uitgeklapteLocaties is "categorie::locatie" i.p.v. alleen de locatienaam,
// zodat dit zonder aanpassing ook voor een andere categorie zou werken.
// Vereist detail.gebied (zie usgs.js/emsc.js) als groepeer-sleutel.
const uitgeklapteLocaties = new Set();
const LOCATIE_GROEPERING_CATEGORIEEN = new Set(['aardbeving']);

// Puur op tijd (nieuwste eerst) — bewust NIET dezelfde ernst-dan-tijd-
// vergelijker als sorteerOpErnstEnTijd hieronder: Lex vroeg expliciet om
// "op volgorde en laatste bovenaan", dus chronologisch, niet naar zwaarte.
// De bovenste/primaire melding van de hele categorie blijft wel gewoon
// ernst-gesorteerd (ongewijzigd) — dit geldt alleen voor de locatiegroepen
// en de bevingen daarbinnen, in het uitgeklapte "+N meer"-gedeelte.
function nieuwsteEerst(a, b) {
  return new Date(b.tijd ?? 0) - new Date(a.tijd ?? 0);
}

function groepeerPerLocatie(items) {
  const groepen = new Map(); // locatienaam -> items[]
  items.forEach((s) => {
    const locatie = s.detail?.gebied || 'Onbekende locatie';
    if (!groepen.has(locatie)) groepen.set(locatie, []);
    groepen.get(locatie).push(s);
  });
  return [...groepen.entries()]
    .map(([locatie, groepItems]) => ({ locatie, items: [...groepItems].sort(nieuwsteEerst) }))
    // Groepen zelf ook nieuwste-eerst, op basis van hun eigen meest recente
    // item (dat staat na de sort hierboven altijd vooraan).
    .sort((a, b) => nieuwsteEerst(a.items[0], b.items[0]));
}

function sorteerOpErnstEnTijd(a, b) {
  const p = (ERNST_PRIORITEIT[a.ernst] ?? 9) - (ERNST_PRIORITEIT[b.ernst] ?? 9);
  return p !== 0 ? p : new Date(b.tijd ?? 0) - new Date(a.tijd ?? 0);
}

// Items binnen een categorie sorteren — voor de meeste categorieën blijft dat
// ernst-dan-recentheid, maar onweercomplexen zijn juist het duidelijkst
// geordend op afstand (dichtbij eerst): de Blitzortung-connector levert die
// afstand al mee in detail.afstandKm.
function sorteerItemsInCategorie(cat, items) {
  if (cat === 'onweercomplex') {
    return [...items].sort((a, b) => (a.detail?.afstandKm ?? Infinity) - (b.detail?.afstandKm ?? Infinity));
  }
  return [...items].sort(sorteerOpErnstEnTijd);
}

function maakMeldingItem(s) {
  const opKaart = s.lat != null && s.lon != null;
  const btn = document.createElement('button');
  // ernst-klasse regelt nu alleen nog opacity (zie styles.css), cat-klasse de
  // randkleur — apart gezet op 2026-08-19 zodat elke categorie een eigen,
  // herkenbare kleur krijgt i.p.v. de vorige ernst-gebaseerde kleur (die was
  // vooral rood/oranje, weinig onderscheidend tussen categorieën).
  btn.className = `melding-item ernst-${s.ernst} cat-${s.categorie}${opKaart ? '' : ' niet-op-kaart'}${s.bron?.haperend ? ' haperend' : ''}${isNavtexNieuw(s) ? ' item-nieuw' : ''}${s.detail?.datumOnbetrouwbaar ? ' item-onbetrouwbaar' : ''}`;
  // Geen apart categorie-label meer boven de titel (2026-08-19, weer
  // weggehaald op Lex' verzoek: "Waarom herhaal je dan die titel in de regel
  // eronder") — de titel zelf noemt bij de meeste categorieën de categorie
  // al impliciet ("Vulkaanuitbarsting", "Droogte Uganda", "Onweercomplex"),
  // dus een los label eronder was vooral dubbelop. Categorie blijft wel
  // zichtbaar via het icoon, de randkleur (cat-*) en de "+N meer (cat)"-knop.
  // 2026-08-19: bleek bij het uitzoeken van de Meteoalarm-"X geleden"-klacht
  // een structureel ding te zijn, niet iets unieks voor weeralarm: bron.
  // bijgewerkt (zie normalize.js/server.js) is altijd het laatste succesvolle
  // poll-moment van de HELE bron, gedeeld door alle signalen ervan — dus nooit
  // de eigen tijd/leeftijd van een individuele melding. Meerdere bronnen
  // leveren daarom al een eigen, wél zinvolle detail.subtitel (Lifeliner:
  // afstand/koers/hoogte, P2000: het uitruktype, Blitzortung: flitsen+afstand,
  // SPC-outlook: vaste omschrijving) — die werd tot nu toe alleen gebruikt als
  // een categorie toevallig geen kaartpin had. Nu geldt overal dezelfde regel:
  // heeft de bron een subtitel, toon die (met een summiere herkomst-tag
  // ervoor) i.p.v. de "naam · X geleden"-regel. Geen subtitel? Dan blijft de
  // bron+tijd-regel gewoon de terugval.
  const kortNaam = (s.bron?.naam ?? '').replace(/\s*\([^)]*\)\s*$/, '');
  // 2026-08-20-bug: viel hier terug op "bron · X geleden" zodra detail.subtitel
  // ontbrak — voor bijv. tornado warning/watch (nws.js) is er geen subtitel,
  // wél detail.gebied (de county's), wat de kaart-popup (zie popupHtml) al
  // langer wél als tweede regel toont. Lex zag daardoor minder info in de
  // Meldingen-lijst dan op de kaart voor exact hetzelfde signaal ("kaart is
  // leidend"). Fix: zelfde volgorde als popupHtml() aanhouden vóór de
  // bron+tijd-terugval.
  const detailregel = s.detail?.land ?? s.detail?.subtitel ?? s.detail?.gebied ?? null;
  // 2026-08-20: Lex — "Bij Tornado bevestigd krijg ik dus geen enkel
  // time/datestamp". Was hier ALLEEN de "bron · X geleden"-terugval als er
  // geen detailregel was — dus nooit voor tornado-bevestigd (die altijd
  // detail.gebied heeft). Nu staat de eigen event-tijd van het signaal
  // (tijdstempelTekst(s.tijd), zie hierboven) er altijd bij, naast de
  // detailregel i.p.v. in plaats ervan. Alleen als zowel detailregel als
  // tijdregel ontbreken, valt dit terug op bron.bijgewerkt (poll-moment).
  // 2026-08-20-fix: klokje ervoor op Lex' verzoek — bij een signaal dat al
  // een eigen "geldig van–tot"-periode in de detailregel heeft (bv.
  // meteoalarm), stond deze los-tijdstip-erna (het moment waarop dít bericht
  // is uitgegeven, niet de geldigheidsperiode zelf) er verwarrend kaal bij:
  // "geldig 20 aug 12:00 – 26 aug 17:00 · 12:13" oogde als een derde,
  // onverklaarde datum/tijd. Met het klokje is meteen duidelijk dat dit een
  // apart "uitgegeven om"-tijdstip is, geen onderdeel van de periode ervoor.
  const tijdregel = tijdregelVoorSignaal(s);
  // 2026-08-26, op verzoek van Lex -- alleen tonen als het een ECHTE latere
  // waarde is dan de tijdregel hierboven, anders is het dubbele info naast
  // wat al zichtbaar is. Zie ontvangstStatsVoorBericht() in navtexLokaal.js
  // voor hoe laatstGezien wordt berekend, en waarom dit veld bij datumloze
  // berichten (de AVURNAV-relaisberichten) altijd leeg blijft -- op Lex'
  // eigen verzoek geen aparte boekhouding daarvoor gebouwd.
  const laatstGezienRegel = s.detail?.laatstGezien ? `laatst gezien ${tijdstempelTekst(s.detail.laatstGezien)}` : null;
  // 2026-08-25: zelfde ontvangst-badge als in popupHtml() hierboven — zie
  // navtexOntvangstBadge() en de toelichting daar.
  const ontvangstregel = navtexOntvangstBadge(s);
  const kernDelen = [detailregel, tijdregel ? `<span class="tijd-icoon-mat">🕓</span> ${tijdregel}` : null, laatstGezienRegel, ontvangstregel].filter(Boolean);
  const subRegel = kernDelen.length
    ? `<span class="tier-dot ${s.bron?.tier ?? 'community'}"></span>${kortNaam} · ${kernDelen.join(' · ')}`
    : `<span class="tier-dot ${s.bron?.tier ?? 'community'}"></span>${s.bron?.naam ?? ''} · ${geledenTekst(s.bron?.bijgewerkt)}`;
  // 2026-08-19: "de pil" — gekleurd GEEL/ORANJE/ROOD-labeltje vóór de titel
  // bij weeralarm (detail.kleur, zie meteoalarm.js). Vervangt de eerder
  // geprobeerde achtergrondwas over het hele kaartje, die Lex "niet geweldig"
  // vond. Alleen weerwaarschuwing (nog geen tornado, zie eerdere afspraak).
  const KLEUR_KLASSE = { Geel: 'geel', Oranje: 'oranje', Rood: 'rood' };
  let pilKlasse = null;
  let pilTekst = null;
  if (s.categorie === 'weerwaarschuwing') {
    pilKlasse = KLEUR_KLASSE[s.detail?.kleur];
    pilTekst = s.detail?.kleur?.toUpperCase();
  } else if (s.categorie === 'tornado' || s.categorie === 'tornado-watch') {
    // 2026-08-21, op verzoek van Lex ("PDS-meldingen en een tornado op de
    // grond... onderscheiden in de lijst, gewoon bij de Warnings maar met
    // een icon en PDS of zo") — zelfde pil-badge als hierboven bij
    // weeralarm, hergebruikt voor de tornado-dreigingsniveaus (zie
    // hazardIconHtml() hierboven voor het bijbehorende icoon). Rood/oranje
    // voor de twee schade-escalatieniveaus (Emergency zwaarder dan PDS,
    // zelfde kleuren als de weeralarm-ernst), een apart "blauw" voor
    // "OP DE GROND" — dat is geen schade-escalatie maar een
    // detectie-zekerheid (zie tornadoWaargenomen() in nws.js), dus bewust
    // een andere kleur om die twee assen niet door elkaar te laten lopen.
    if (s.detail?.tornadoEmergency) { pilKlasse = 'rood'; pilTekst = 'EMERGENCY'; }
    else if (s.detail?.pds) { pilKlasse = 'oranje'; pilTekst = 'PDS'; }
    else if (s.detail?.tornadoWaargenomen) { pilKlasse = 'blauw'; pilTekst = 'OP DE GROND'; }
  } else if (s.categorie === 'tornado-bevestigd') {
    // 2026-08-24, op verzoek van Lex — Tornado bevestigd komt uit IEM Local
    // Storm Reports (een achteraf-bevestigde puntwaarneming), niet uit de
    // reguliere NWS Warning-stroom hierboven. Zelfde pil-mechanisme, eigen
    // neutrale grijze kleur (zie .pil.grijs in styles.css) zodat meteen
    // duidelijk is: dit is geen lopende dreiging maar geschiedenis.
    pilKlasse = 'grijs';
    pilTekst = 'BEVESTIGD';
  } else if (isNavtexNieuw(s)) {
    // 2026-08-24, zie isNavtexNieuw() hierboven — losse pil-kleur (groen, nog
    // nergens anders gebruikt) zodat dit niet met een van de bestaande
    // ernst/dreigingsniveau-pillen door elkaar loopt.
    // 2026-08-25-herzien, op verzoek van Lex: i.p.v. kaal "NIEUW" nu het
    // moment van eerste ontvangst er zelf bij ("Nieuw op 25 aug 14:33") —
    // die tekst verdwijnt vanzelf zodra isNavtexNieuw() de volgende
    // kalenderdag `false` teruggeeft, geen aparte vervallogica meer nodig.
    pilKlasse = 'groen';
    const sindsTekst = nieuwSindsTekst(s.tijd);
    pilTekst = sindsTekst ? `NIEUW OP ${sindsTekst.toUpperCase()}` : 'NIEUW';
  }
  const pilHtml = pilKlasse ? `<span class="pil ${pilKlasse}">${pilTekst}</span>` : '';
  // 2026-08-24, op verzoek van Lex ("mag een marker meegeven... datum of
  // herkomst onbetrouwbaar, rode gloed of zo") — LOS van de pilKlasse-keten
  // hierboven (die geeft er maar één per melding), want dit kan tegelijk met
  // "NIEUW" voorkomen: een navtex-bericht zonder herkenbare verzenddatum
  // krijgt zijn "eerst gezien op"-moment als tijd (zie eersteOntvangst() in
  // navtexLokaal.js/ukho.js) en is dus vaak precies déze twee dingen
  // tegelijk. Bewust statisch (geen vervaltimer zoals bij "nieuw") — blijft
  // staan zolang de bron geen betrouwbare datum kan vinden.
  const datumOnbetrouwbaarHtml = s.detail?.datumOnbetrouwbaar
    ? `<span class="pil roodvaag" title="Datum/herkomst van dit bericht kon niet betrouwbaar uit de tekst gehaald worden — de tijd hierboven is het moment van eerste ontvangst, niet de echte verzenddatum.">DATUM ONZEKER</span>`
    : '';
  // 2026-08-26, zie navtexNummerBadge() hierboven.
  const navtexNummerHtml = navtexNummerBadge(s) ? `<div class="navtex-nummerbadge">${navtexNummerBadge(s)}</div>` : '';
  btn.innerHTML = `
    <span class="em">${hazardIconHtml(s)}</span>
    <span class="txt">
      ${navtexNummerHtml}
      <div class="titel">${pilHtml}${datumOnbetrouwbaarHtml}${s.titel}</div>
      <div class="sub">${subRegel}</div>
    </span>
    ${opKaart ? '<span class="chev">›</span>' : ''}
  `;
  if (opKaart) btn.addEventListener('click', () => centreerOpMelding(s));
  return btn;
}

// 2026-08-20, op verzoek van Lex ("sublevel voor aardbevingen, per locatie
// gegroepeerd") — kopje voor één locatiegroep (bv. "Cobb, CA · 3 bevingen"),
// zelf ook aan/uit te klappen naar de losse bevingen erbinnen. Geen eigen
// kaartcentrering (in tegenstelling tot maakMeldingItem hierboven) — een
// groep heeft geen eigen lat/lon, alleen de individuele bevingen erbinnen.
function maakLocatieGroepItem(cat, groep) {
  const meestRecent = groep.items[0];
  const btn = document.createElement('button');
  const sleutel = `${cat}::${groep.locatie}`;
  const uitgeklapt = uitgeklapteLocaties.has(sleutel);
  btn.className = `melding-item melding-locatie-groep ernst-${meestRecent.ernst} cat-${cat}`;
  const tijdregel = tijdstempelTekst(meestRecent.tijd);
  btn.innerHTML = `
    <span class="em">${hazardIconHtml(meestRecent)}</span>
    <span class="txt">
      <div class="titel">${groep.locatie}</div>
      <div class="sub">${groep.items.length} bevingen${tijdregel ? ` · laatste ${tijdregel}` : ''}</div>
    </span>
    <span class="chev">${uitgeklapt ? '⌄' : '›'}</span>
  `;
  btn.addEventListener('click', () => {
    if (uitgeklapt) uitgeklapteLocaties.delete(sleutel);
    else uitgeklapteLocaties.add(sleutel);
    renderMeldingen(laatsteMeldingenSignalen);
  });
  return { element: btn, uitgeklapt };
}

// 2026-08-19, op Lex' verzoek ("Alle categorieën zijn dus altijd in beeld, als
// er bij een cat niets is dan staat dat in de kaart"): een gedimd, niet-
// klikbaar kaartje voor categorieën zonder actieve melding — voorheen
// verdween zo'n categorie gewoon volledig uit de Meldingen-lijst, wat het
// onduidelijk maakte of een rustige categorie ook daadwerkelijk gecheckt was
// (geen data getoond) i.p.v. bewust "niets aan de hand".
// 2026-08-20: tweede parameter (laatsteVerlopen) op verzoek van Lex — puur
// informatief: als er voor deze categorie geen actieve melding is, maar wél
// nog een recent (binnen 48u, zie historie.js) verlopen signaal, komt er een
// hint-regel bij ("laatste verlopen ..."). Het kaartje zelf is bewust NIET
// klikbaar (dat leidde tot verwarring toen er meerdere, ver-uit-elkaar-
// liggende verlopen meldingen tegelijk waren — welke van de twee zou een
// enkele klik dan moeten pakken?) — de daadwerkelijke navigatie zit in de
// aparte, uitklapbare "🕓 verlopen"-sectie die renderMeldingen() er los
// achteraan plakt (zie verlopenPerCategorie/maakVerlopenMeldingItem), die
// elke individuele verlopen melding los toont en aanklikbaar maakt.
function maakLegeMeldingItem(cat, laatsteVerlopen) {
  const div = document.createElement('div');
  div.className = `melding-item leeg cat-${cat}`;
  const tijdregel = laatsteVerlopen ? tijdstempelTekst(laatsteVerlopen.detail?.verlopenSinds ?? laatsteVerlopen.tijd) : null;
  div.innerHTML = `
    <span class="em">${EMOJI_PER_CATEGORIE[cat] ?? '•'}</span>
    <span class="txt">
      <div class="titel">${NAAM_PER_CATEGORIE[cat] ?? cat}</div>
      <div class="sub">Geen actieve meldingen${tijdregel ? ` · laatste verlopen ${tijdregel}` : ''}</div>
    </span>
  `;
  return div;
}

// 2026-08-20: rij voor een individuele verlopen melding binnen de uitgeklapte
// "🕓 verlopen"-sectie (zie renderMeldingen) — toont bewust het gebied
// (county/staat) i.p.v. de volle NWS-headline als titel, want dát is precies
// wat je nodig hebt om meerdere ver-uit-elkaar-liggende verlopen meldingen
// van elkaar te onderscheiden. Klik navigeert naar de kaart (centreerOpMelding),
// inclusief gebied-omtrek als die er was, zelfde mechanisme als een gewone
// actieve melding.
function maakVerlopenMeldingItem(s) {
  const btn = document.createElement('button');
  btn.className = `melding-item verlopen-item ernst-${s.ernst} cat-${s.categorie}`;
  const tijdregel = s.detail?.verlopenSinds ? tijdstempelTekst(s.detail.verlopenSinds) : tijdregelVoorSignaal(s);
  // 2026-08-24: zelfde BEVESTIGD-pil als in maakMeldingItem() hierboven —
  // Lex zag 'm niet bij een al-verlopen tornado-bevestigd-melding, en dat
  // is precies waar deze categorie door z'n korte synthetische
  // verloopvenster vaak al meteen staat i.p.v. in de actieve lijst. Geen
  // conditie nodig zoals bij EMERGENCY/PDS/OP DE GROND: tornado-bevestigd
  // heeft maar één badge-toestand.
  const pilHtml = s.categorie === 'tornado-bevestigd'
    ? `<span class="pil grijs">BEVESTIGD</span>`
    : '';
  btn.innerHTML = `
    <span class="em">${hazardIconHtml(s)}</span>
    <span class="txt">
      <div class="titel">${pilHtml}${s.detail?.gebied ?? s.titel}</div>
      <div class="sub">🕓 Verlopen${tijdregel ? ` ${tijdregel}` : ''}</div>
    </span>
    <span class="chev">›</span>
  `;
  btn.addEventListener('click', () => centreerOpMelding(s));
  return btn;
}

function renderMeldingen(signalen) {
  laatsteMeldingenSignalen = signalen;
  // 2026-08-20: detail.verlopen (zie historie.js, backend) — tot 48u terug
  // bewaarde, inmiddels niet meer actieve waarschuwingen, puur bedoeld als
  // lichte trail op de KAART (zie renderMap) zodat je kunt zien waar een
  // waarschuwing was. Horen niet thuis in de Meldingen-lijst (die is voor
  // wat NU speelt) — vandaar hier apart uitgefilterd, los van de bestaande
  // categorie-uitsluiting hieronder.
  const relevant = signalen.filter((s) => !MELDINGEN_CATEGORIEEN_UITGESLOTEN.has(s.categorie) && !s.detail?.verlopen);

  MELDINGEN_BADGE_EL.style.display = relevant.length ? 'flex' : 'none';
  MELDINGEN_BADGE_EL.textContent = String(relevant.length);

  const perCategorie = {};
  relevant.forEach((s) => (perCategorie[s.categorie] ??= []).push(s));

  // 2026-08-20, op verzoek van Lex: elke categorie (actief of leeg) krijgt er
  // een losse, uitklapbare "🕓 verlopen"-sectie bij als er nog recent (binnen
  // 48u, zie historie.js) verlopen signalen voor die categorie zijn — naast
  // (niet i.p.v.) de gedimde pinnetjes die de kaart daar sowieso al voor
  // toont. Reden: bij meerdere losse verlopen meldingen die ver uit elkaar
  // liggen (bv. county's aan tegenovergestelde kanten van de VS) vallen die
  // pinnetjes op de kaart makkelijk niet op. Generiek per categorie, dus niet
  // alleen tornado-watch — geldt voor elke categorie die via historie.js
  // verlopen-signalen kan opleveren (nu: de vijf NWS-types).
  const tijdVanVerlopen = (sig) => new Date(sig.detail?.verlopenSinds ?? sig.tijd ?? 0).getTime();
  const verlopenPerCategorie = {};
  signalen
    .filter((s) => s.detail?.verlopen && !MELDINGEN_CATEGORIEEN_UITGESLOTEN.has(s.categorie))
    .forEach((s) => (verlopenPerCategorie[s.categorie] ??= []).push(s));
  Object.values(verlopenPerCategorie).forEach((lijst) => lijst.sort((a, b) => tijdVanVerlopen(b) - tijdVanVerlopen(a)));

  // Voor de hint-regel op het lege-categorie-kaartje: alleen de meest recente
  // nodig (de volledige lijst hoort bij de uitklapbare sectie hieronder).
  const laatsteVerlopenPerCategorie = {};
  Object.entries(verlopenPerCategorie).forEach(([cat, lijst]) => (laatsteVerlopenPerCategorie[cat] = lijst[0]));

  // Categorieën met de meest urgente melding bovenaan sorteren.
  const actieveCategorieen = Object.keys(perCategorie).sort((catA, catB) => {
    const meestUrgent = (cat) => [...perCategorie[cat]].sort(sorteerOpErnstEnTijd)[0];
    return sorteerOpErnstEnTijd(meestUrgent(catA), meestUrgent(catB));
  });
  // 2026-08-19, op Lex' verzoek: ALLE bekende categorieën staan altijd in de
  // lijst, ook zonder actieve melding — die kwamen voorheen gewoon niet voor
  // in `perCategorie` en verdwenen dus volledig uit beeld. Lege categorieën
  // komen ná de actieve (urgentie-gesorteerde) categorieën, in de vaste
  // EMOJI_PER_CATEGORIE-volgorde, als gedimd niet-klikbaar kaartje.
  const legeCategorieen = Object.keys(EMOJI_PER_CATEGORIE).filter((cat) => !perCategorie[cat]);
  const categorieen = [...actieveCategorieen, ...legeCategorieen];

  // Geen aparte categorie-kop meer boven elke groep (2026-08-19, op Lex'
  // verzoek: "die grijze namen er tussen lelijk en onnodig extra") — de
  // categorienaam staat weer terug zoals 'ie was, in de "+N meer"-knop zelf,
  // met de ruwe/oorspronkelijke categorie-id (geen "nettere" vertaling).
  MELDINGEN_LIJST_EL.innerHTML = '';
  categorieen.forEach((cat) => {
    if (perCategorie[cat]) {
      const items = sorteerItemsInCategorie(cat, perCategorie[cat]);
      const [primair, ...rest] = items;

      MELDINGEN_LIJST_EL.appendChild(maakMeldingItem(primair));

      if (rest.length) {
        const uitgeklapt = uitgeklapteCategorieen.has(cat);
        const toggle = document.createElement('button');
        toggle.className = 'melding-meer';
        // 2026-08-24: bij navtex het aantal "nieuwe" berichten in de "rest"
        // erbij tonen (zie isNavtexNieuw hierboven) — de zichtbare primair-
        // melding is bij navtex altijd de nieuwste (zie sorteerOpErnstEnTijd:
        // navtex heeft overal dezelfde ernst, dus puur tijd-gesorteerd), dus
        // als er meerdere nieuwe berichten zijn zitten de overige verstopt in
        // deze ingeklapte "rest" — vandaar hier expliciet benoemd i.p.v. pas
        // zichtbaar ná het uitklappen.
        const nieuwInRest = cat === 'navtex' ? rest.filter(isNavtexNieuw).length : 0;
        const nieuwSuffix = nieuwInRest > 0 ? ` · ${nieuwInRest} nieuw` : '';
        toggle.textContent = uitgeklapt ? '– minder tonen' : `+ ${rest.length} meer (${NAAM_PER_CATEGORIE[cat] ?? cat})${nieuwSuffix}`;
        toggle.addEventListener('click', () => {
          // 2026-08-25: open/sluiten heeft geen invloed meer op de
          // NIEUW-markering (zie isNavtexNieuw hierboven — die is nu puur
          // kalenderdag-gebaseerd), dus hier alleen nog het simpele
          // uitklap-gedrag zelf, zonder enige navtex-specifieke timer.
          if (uitgeklapt) uitgeklapteCategorieen.delete(cat);
          else uitgeklapteCategorieen.add(cat);
          renderMeldingen(laatsteMeldingenSignalen);
        });
        MELDINGEN_LIJST_EL.appendChild(toggle);

        if (uitgeklapt) {
          // 2026-08-20, op verzoek van Lex ("sublevel voor aardbevingen, per
          // locatie gegroepeerd, laatste bovenaan"): voor categorieën in
          // LOCATIE_GROEPERING_CATEGORIEEN (vooralsnog alleen 'aardbeving')
          // wordt de "rest" niet meer plat getoond, maar eerst per locatie
          // gegroepeerd (zie groepeerPerLocatie) met een eigen in/uitklap-
          // toggle per groep — pas bij het uitklappen van díe groep
          // verschijnen de losse bevingen, dan puur chronologisch
          // (nieuwsteEerst), niet op ernst.
          if (LOCATIE_GROEPERING_CATEGORIEEN.has(cat)) {
            groepeerPerLocatie(rest).forEach((groep) => {
              const { element, uitgeklapt: groepUitgeklapt } = maakLocatieGroepItem(cat, groep);
              MELDINGEN_LIJST_EL.appendChild(element);
              if (groepUitgeklapt) {
                groep.items.forEach((s) => {
                  const item = maakMeldingItem(s);
                  item.classList.add('melding-item-genest');
                  MELDINGEN_LIJST_EL.appendChild(item);
                });
              }
            });
          } else {
            rest.forEach((s) => MELDINGEN_LIJST_EL.appendChild(maakMeldingItem(s)));
          }
        }
      }
    } else {
      MELDINGEN_LIJST_EL.appendChild(maakLegeMeldingItem(cat, laatsteVerlopenPerCategorie[cat] ?? null));
    }

    // 2026-08-20, op verzoek van Lex: de "🕓 verlopen"-sectie hoort bij ELKE
    // categorie (actief of leeg) even hard — vandaar hier ná de if/else,
    // buiten beide takken, i.p.v. verstopt in een van de twee.
    const verlopenVoorCat = verlopenPerCategorie[cat];
    if (verlopenVoorCat?.length) {
      const verlopenUitgeklapt = uitgeklapteVerlopenCategorieen.has(cat);
      const verlopenToggle = document.createElement('button');
      verlopenToggle.className = 'melding-meer melding-meer-verlopen';
      verlopenToggle.textContent = verlopenUitgeklapt
        ? '– verlopen verbergen'
        : `🕓 + ${verlopenVoorCat.length} verlopen tonen`;
      verlopenToggle.addEventListener('click', () => {
        if (verlopenUitgeklapt) uitgeklapteVerlopenCategorieen.delete(cat);
        else uitgeklapteVerlopenCategorieen.add(cat);
        renderMeldingen(laatsteMeldingenSignalen);
      });
      MELDINGEN_LIJST_EL.appendChild(verlopenToggle);

      if (verlopenUitgeklapt) {
        verlopenVoorCat.forEach((s) => MELDINGEN_LIJST_EL.appendChild(maakVerlopenMeldingItem(s)));
      }
    }
  });
}

// Hemel-tab toont alle 'hemel'-signalen als losse kaartjes (maanstand,
// ISS-passages, meteorenzwermen, aurora-kans, ruimteweer-context) i.p.v.
// alleen de maanstand — dat was tot nu toe hardcoded op één kaartje en liet
// de andere bronnen dus onzichtbaar, ook al leverde de backend ze al.
const HEMEL_ICOON_PER_PREFIX = { moon: '🌙', iss: '🛰️', starlink: '🚀', meteors: '☄️', swpc: '🌌', donki: '☀️', getij: '🌊' };

function hemelIcoon(id) {
  return HEMEL_ICOON_PER_PREFIX[id.split('-')[0]] ?? '✨';
}

// Getekend maanicoon i.p.v. het platte 🌙-emoji — de vorm volgt de echte
// faseFractie (0 = nieuwe maan, 0.5 = volle maan, 1 = weer nieuwe maan) via de
// klassieke "twee bogen"-truc: één ellipsboog voor de terminator (de
// schaduwrand) en één cirkelboog voor de verlichte limb, samen omsluiten ze
// het verlichte deel.
//
// Belangrijk: de zwaairichting van beide bogen moet per kwart maancyclus
// wisselen (niet alleen bij nieuwe/volle maan) — anders komt bijv. bij 19%
// verlicht per ongeluk het omgekeerde (bijna volledig verlichte) oppervlak
// eruit. Numeriek geverifieerd tegen de exacte verlichtingsfractie
// (1-cos(2π·fase))/2 over de hele cyclus, en gecontroleerd dat de sikkel
// vloeiend van kant wisselt (geen sprongen) behalve bij nieuwe maan zelf,
// waar het sikkeltje sowieso onzichtbaar dun is.
function maanPad(faseFractie, r) {
  const rx = Math.abs(Math.cos(faseFractie * 2 * Math.PI)) * r;
  const sweepLimb = faseFractie < 0.5 ? 0 : 1;
  const kwartier = Math.floor(faseFractie * 4) % 4;
  const sweepTerminator = kwartier === 0 || kwartier === 2 ? 1 : 0;
  return `M ${r},0 A ${rx},${r} 0 0 ${sweepTerminator} ${r},${2 * r} A ${r},${r} 0 0 ${sweepLimb} ${r},0 Z`;
}

// 2026-08-19: size-parameter erbij (was hardcoded 34px) op verzoek van Lex
// ("mag spectaculair worden voor de maanfasen") — dezelfde tekenlogica,
// alleen nu ook bruikbaar voor de grote maan-illustratie in de zon/maan-kaart
// (zie renderZonMaan). De geometrie in maanPad() is relatief (0..2r), dus
// gewoon r meeschalen volstaat.
//
// Vaste kratertextuur (positie/grootte als fractie van r) — puur decoratief,
// geen echte maankaart. Alleen zichtbaar op het verlichte deel: getekend als
// een group met clip-path op dezelfde maanPad()-vorm.
const MAAN_KRATERS = [
  { fx: 0.62, fy: 0.42, frx: 0.2, fry: 0.15, op: 0.16 },
  { fx: 1.35, fy: 0.72, frx: 0.15, fry: 0.12, op: 0.13 },
  { fx: 0.95, fy: 1.35, frx: 0.12, fry: 0.1, op: 0.14 },
  { fx: 1.55, fy: 1.15, frx: 0.09, fry: 0.08, op: 0.11 },
  { fx: 0.55, fy: 1.55, frx: 0.11, fry: 0.09, op: 0.12 },
];
function maanKratersSvg(r, clipId) {
  const ellipsen = MAAN_KRATERS.map(
    (k) =>
      `<ellipse cx="${(k.fx * r).toFixed(2)}" cy="${(k.fy * r).toFixed(2)}" rx="${(k.frx * r).toFixed(2)}" ry="${(k.fry * r).toFixed(2)}" fill="rgba(20,22,38,${k.op})"></ellipse>`
  ).join('');
  return `<g clip-path="url(#${clipId})">${ellipsen}</g>`;
}

// 2026-08-19: op verzoek van Lex ("kan je hier niet iets van gebruiken voor
// je graph? [unsplash.com/s/photos/moon] vrij gebruik") — een optionele
// ECHTE maanfoto bovenop de getekende versie. Deze sandbox kan zelf geen
// bestanden van Unsplash downloaden (geen netwerktoegang tot willekeurige
// domeinen), dus dit verwacht dat Lex zelf een foto opslaat op precies dit
// pad: frontend/icons/maan-foto.jpg (vierkant, ruim belicht/volle maan
// tegen een donkere achtergrond werkt het best — de vorm wordt hieronder
// toch bijgesneden op de actuele maanfase). Zolang dat bestand niet bestaat
// faalt de <image> gewoon stil (geen "kapot plaatje"-icoon in SVG) en blijft
// de getekende gradient/kratertextuur-versie zichtbaar als vangnet.
const MAAN_FOTO_URL = '/icons/maan-foto.jpg';
// De meeste vrij-te-gebruiken maanfoto's (zoals van Unsplash) laten flink wat
// zwarte nachtlucht rond de maanschijf staan — Lex zag daardoor een zwarte
// rand rond de icoon-cirkel. Deze factor zoomt de foto in rond het midden
// (los van de crescent-uitknipvorm eronder, die blijft ongewijzigd) zodat de
// maanschijf zelf de hele cirkel vult. 1.85 is bewust ruim gekozen — iets te
// veel inzoomen (een fractie van de maanrand kwijtraken) valt op een
// getextureerde foto nauwelijks op, een randje zwarte lucht juist wel. Zie
// je na het syncen nog steeds een randje: verhoog dit getal; wordt de maan
// juist zichtbaar afgesneden: verlaag het.
const MAAN_FOTO_ZOOM = 1.85;

// 2026-08-19: op verzoek van Lex ("de maan graag net zo mooi als Apple op
// de iPhone") — de vlakke tweekleurige vorm (effen donker + effen licht)
// vervangen door een gradient-"belichting" (lichtbron linksboven, zoals
// Apple's illustratie) plus de kratertextuur hierboven, en optioneel de
// echte foto (zie MAAN_FOTO_URL). Alleen bij grotere afbeeldingen (size >=
// 60, dus de zon/maan-kaart resp. de Hemel-kaart): bij de kleine
// Hemel-tab-lijst-iconen (34px) zou dat detail alleen maar ruis worden.
function maanIconSvg(faseFractie, size = 34) {
  const r = size / 2 - 1;
  const pad = maanPad(faseFractie ?? 0, r);
  const detail = size >= 60;
  const lichtGradId = `maanLicht${size}`;
  const donkerGradId = `maanDonker${size}`;
  const clipId = `maanClip${size}`;
  const defs = detail
    ? `<defs>
        <radialGradient id="${lichtGradId}" cx="38%" cy="32%" r="75%">
          <stop offset="0%" stop-color="#ffffff"/>
          <stop offset="55%" stop-color="#e6e2d8"/>
          <stop offset="100%" stop-color="#aba497"/>
        </radialGradient>
        <radialGradient id="${donkerGradId}" cx="50%" cy="50%" r="65%">
          <stop offset="0%" stop-color="#242a46"/>
          <stop offset="100%" stop-color="#10121e"/>
        </radialGradient>
        <clipPath id="${clipId}"><path d="${pad}"/></clipPath>
      </defs>`
    : '';
  const lichtFill = detail ? `url(#${lichtGradId})` : '#eef1ff';
  const donkerFill = detail ? `url(#${donkerGradId})` : '#1b2036';
  const kraters = detail ? maanKratersSvg(r, clipId) : '';
  // Foto-laag bovenop de getekende versie, geknipt op exact dezelfde
  // faseFractie-vorm. Ontbreekt het bestand, dan rendert dit element gewoon
  // niets (SVG <image> geeft geen zichtbare foutmelding) en blijft de
  // gradient/kratertextuur eronder zichtbaar.
  const fotoGrootte = 2 * r * MAAN_FOTO_ZOOM;
  const fotoOffset = -(fotoGrootte - 2 * r) / 2;
  const foto = detail
    ? `<image href="${MAAN_FOTO_URL}" xlink:href="${MAAN_FOTO_URL}" x="${fotoOffset.toFixed(2)}" y="${fotoOffset.toFixed(2)}" width="${fotoGrootte.toFixed(2)}" height="${fotoGrootte.toFixed(2)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})"></image>`
    : '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="maan-icoon" aria-hidden="true">
    ${defs}
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="${donkerFill}" stroke="rgba(255,255,255,0.18)" stroke-width="1"></circle>
    <g transform="translate(1,1)">
      <path d="${pad}" fill="${lichtFill}"></path>
      ${kraters}
      ${foto}
    </g>
  </svg>`;
}

// ---- Kleine op-/ondergang-iconen voor de zon/maan-kaart, 2026-08-19 -------
// Op verzoek van Lex: "de start en eind iconen niet mooi bij de zonbaan" en
// "ik snap het icoon maan onder niet, dat toont laatste kwartier". De
// 🌅/🌇/🌙/🌘-emoji zijn vervangen door eigen getekende iconen — consistente
// lijnstijl i.p.v. emoji-rendering die per systeem/font verschilt, en voor
// de maan een VAST sikkeltje (geen echte huidige fase, dat doet alleen het
// grote icoon op de Hemel-tab) zodat het nooit meer als een fase-aanduiding
// gelezen kan worden.
function opOnderIconSvg(pijlOmhoog, kleur, vormSvg) {
  const pijl = pijlOmhoog
    ? `<path d="M4 4 L7.5 1 L11 4" fill="none" stroke="${kleur}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<path d="M4 1 L7.5 4 L11 1" fill="none" stroke="${kleur}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`;
  return `<svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
    ${pijl}
    ${vormSvg}
    <line x1="1" y1="11" x2="14" y2="11" stroke="rgba(255,255,255,0.3)" stroke-width="1"></line>
  </svg>`;
}
function zonRondgangIconSvg(rijzend) {
  const kleur = rijzend ? '#ffb35c' : '#ff6b9d'; // zelfde tinten als de dagboog-gradient
  const vorm = `<path d="M2.5 11 A5 5 0 0 1 12.5 11 Z" fill="${kleur}"/>`;
  return opOnderIconSvg(rijzend, kleur, vorm);
}
function maanRondgangIconSvg(rijzend) {
  const kleur = '#aab4d9';
  const r = 3.1;
  // Hergebruikt maanPad() voor een net sikkeltje, met een vaste fractie
  // (0.18) — dit is puur decoratief en stelt bewust geen echte fase voor.
  const vorm = `<g transform="translate(${7.5 - r},${7.6 - r})"><path d="${maanPad(0.18, r)}" fill="${kleur}"/></g>`;
  return opOnderIconSvg(rijzend, kleur, vorm);
}
ZM_OP_ICOON_EL.innerHTML = zonRondgangIconSvg(true);
ZM_ONDER_ICOON_EL.innerHTML = zonRondgangIconSvg(false);
ZM_MAAN_OP_ICOON_EL.innerHTML = maanRondgangIconSvg(true);
ZM_MAAN_ONDER_ICOON_EL.innerHTML = maanRondgangIconSvg(false);

// 2026-08-20: "over 1u12m"-stijl countdown voor het getij-kaartje hieronder
// — bewust een andere (fijnmaziger, uur+minuut) vorm dan de "over N dagen"
// van de maan-countdown hierboven, want hoog-/laagwater ligt per definitie
// altijd binnen ~12,5 uur, dagen zou daar geen zinnig detailniveau geven.
function overTijdTekst(iso) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms)) return null;
  if (ms <= 0) return 'nu';
  const minutenTotaal = Math.round(ms / 60000);
  const uren = Math.floor(minutenTotaal / 60);
  const minuten = minutenTotaal % 60;
  if (uren === 0) return `over ${minuten}m`;
  return `over ${uren}u${String(minuten).padStart(2, '0')}m`;
}

function hemelSub(s) {
  const d = s.detail ?? {};
  // 2026-08-22, op verzoek van Lex: de duur staat al in s.titel (zie
  // celestrak.js/starlinkTrain.js), dus hier i.p.v. dat te herhalen de
  // sterrenwaardering erbij — zelfde sterrenTekst()-helper als de
  // aanbevolen-ISS-kaart hieronder. Starlink-trein deelt dit lijntje met
  // ISS: zelfde detail-velden (sterren/richtingOp/richtingOnder), zie
  // satellietPassages.js.
  // 2026-08-22: fallback-kaartje van starlinkTrain.js (trein gevonden, maar
  // geen passage ≥30° binnen 72 uur) heeft geen sterren/richtingOp/
  // richtingOnder — zie de comment daar bij "geenPassageBinnenkort".
  if (d.geenPassageBinnenkort) {
    return `${d.aantalSatellieten} satellieten · vliegt nu, maar niet hoog genoeg zichtbaar binnenkort`;
  }
  if (s.id.startsWith('iss') || s.id.startsWith('starlink')) {
    return `<span class="iss-sterren">${sterrenTekst(d.sterren)}</span> · op in ${d.richtingOp}, onder in ${d.richtingOnder}`;
  }
  // 2026-08-21: de titel is nu een aftelling ("Nog 61 dagen tot: Orioniden",
  // zie backend/sources/meteors.js), dus de tweede regel vertelt waarnaar je
  // aftelt (de piekdatum) en wat het waard is. Bij een zwerm die zijn piek al
  // gehad heeft maar nog loopt is de piekdatum niet het interessante deel —
  // daar staat hoe lang geleden dat was.
  if (s.id.startsWith('meteors')) {
    const delen = [];
    if (d.status === 'uitloop' && d.dagenSindsPiek != null) {
      delen.push(`piek was ${d.dagenSindsPiek} ${d.dagenSindsPiek === 1 ? 'dag' : 'dagen'} geleden`);
    } else if (d.piekIso) {
      delen.push(`piek ${datumKortTekst(d.piekIso)}`);
    }
    if (d.zhrPerUur != null) delen.push(`ZHR ~${d.zhrPerUur}/uur`);
    return delen.join(' · ');
  }
  if (s.id.startsWith('swpc')) return d.toelichting ?? '';
  if (s.id.startsWith('donki')) return d.samenvatting ?? '';
  if (s.id.startsWith('getij')) {
    // 2026-08-20, op verzoek van Lex: op tijdsvolgorde i.p.v. altijd
    // hoog-dan-laag — laagwater kan best vóór het eerstvolgende hoogwater
    // vallen (en andersom), dat moet dan ook zo in de tekst staan.
    const momenten = [];
    if (d.hoogwaterIso) momenten.push({ tijdMs: new Date(d.hoogwaterIso).getTime(), symbool: '⬆', iso: d.hoogwaterIso });
    if (d.laagwaterIso) momenten.push({ tijdMs: new Date(d.laagwaterIso).getTime(), symbool: '⬇', iso: d.laagwaterIso });
    momenten.sort((a, b) => a.tijdMs - b.tijdMs);
    const delen = momenten.map((m) => {
      const over = overTijdTekst(m.iso);
      return `${m.symbool} ${tijdstempelTekst(m.iso)}${over ? ` (${over})` : ''}`;
    });
    if (d.afstandTotJouKm != null) delen.push(`${d.afstandTotJouKm} km van huis`);
    return delen.join(' · ');
  }
  return '';
}

// 2026-08-19: verplaatst vanaf de Kaart-tab (Lex: "de rest moet onder de
// knop hemel komen") — de uitvergrote, "spectaculaire" maanillustratie +
// fase/verlichting/aftelling als eigen kaart in de Hemel-lijst, i.p.v. het
// kleine generieke sky-card-rijtje dat de andere hemel-signalen krijgen.
// Maanop-/ondergangtijden blijven bewust alleen op de Kaart-tab staan (Lex:
// "kunnen hier blijven") — geen dubbeling hier.
function maanKaartVoorHemel(s) {
  const d = s.detail ?? {};
  const kaart = document.createElement('div');
  kaart.className = 'sky-card sky-card--maan';
  let countdown = '';
  const dagenVol = d.dagenTotVolleMaan;
  const dagenNieuw = d.dagenTotNieuweMaan;
  if (dagenVol != null && dagenNieuw != null) {
    const eerst = dagenVol < dagenNieuw ? Math.round(dagenVol) : Math.round(dagenNieuw);
    const label = dagenVol < dagenNieuw ? '🌕 Vol' : '🌑 Nieuw';
    countdown = eerst === 0 ? `${label} vandaag` : `${label} over ${eerst} ${eerst === 1 ? 'dag' : 'dagen'}`;
  }
  kaart.innerHTML = `
    <div class="maan-sterren" aria-hidden="true"></div>
    <div class="maan-icoon-groot">${maanIconSvg(d.faseFractie, 84)}</div>
    <div class="maan-info">
      <div class="maan-fase-naam">${s.titel}</div>
      <div class="maan-illuminatie">${d.illuminatiePercentage}% verlicht · ${d.wassend ? 'wassend' : 'afnemend'}</div>
      <div class="maan-countdown">${countdown}</div>
    </div>
  `;
  return kaart;
}

// 2026-08-22, op verzoek van Lex ("Wanneer is welke planeet waar te zien.
// Elevatie azimuth op onder etc. Liefst in een planetarium-achtige
// setting.") — één signaal ('planeten-nu', zie backend/sources/planeten.js)
// met alle vijf planeten in detail.planeten, gerenderd als één kompas-kaart
// i.p.v. vijf losse sky-cards (zelfde aanpak als maanKaartVoorHemel
// hierboven: een verzameling met een eigen visual verdient een eigen
// speciale kaart, geen generieke lijst-rij).
//
// De kompas zelf: azimuth rondom (Noord boven, met de klok mee — net als een
// echt kompas), elevatie als afstand tot het midden (zenit=midden,
// horizon=rand). Bewust GEEN volledige sterrenkaart/planetarium-library
// (d3-celestial e.d., zie het onderzoek in de sessie) — dit is de eigen,
// sobere SVG-stijl die de rest van de app al gebruikt (zon-boog hierboven,
// maanIconSvg), geen extra dependency in de frontend nodig.
const PLANETEN_KOMPAS_R = 84;
const PLANETEN_KOMPAS_C = 100;

function planetenKompasPositie(azimuthGraden, elevatieGraden) {
  const elGeklemd = Math.max(0, Math.min(90, elevatieGraden));
  const r = PLANETEN_KOMPAS_R * (1 - elGeklemd / 90);
  const rad = (azimuthGraden * Math.PI) / 180;
  return {
    x: PLANETEN_KOMPAS_C + r * Math.sin(rad),
    y: PLANETEN_KOMPAS_C - r * Math.cos(rad),
  };
}

// Helderdere (lager/negatiever magnitude-getal) planeten krijgen een iets
// grotere stip — geeft in één oogopslag door welke planeet je het makkelijkst
// terugvindt (Venus springt er bijvoorbeeld altijd uit).
function planetenStipRadius(magnitude) {
  return Math.max(4, Math.min(10, 7 - magnitude));
}

function planetenKompasSvg(planeten) {
  const stippen = planeten
    .filter((p) => p.zichtbaarNu)
    .map((p) => {
      const { x, y } = planetenKompasPositie(p.azimuthGraden, p.elevatieGraden);
      const r = planetenStipRadius(p.magnitude);
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${p.kleur}" stroke="rgba(10,12,22,0.55)" stroke-width="1.5"></circle>`;
    })
    .join('');
  return `<svg class="planeten-kompas" viewBox="0 0 200 200" aria-hidden="true">
    <circle cx="100" cy="100" r="${PLANETEN_KOMPAS_R}" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="1"></circle>
    <circle cx="100" cy="100" r="${(PLANETEN_KOMPAS_R * 2) / 3}" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="1" stroke-dasharray="2 4"></circle>
    <circle cx="100" cy="100" r="${PLANETEN_KOMPAS_R / 3}" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="1" stroke-dasharray="2 4"></circle>
    <line x1="100" y1="${100 - PLANETEN_KOMPAS_R}" x2="100" y2="${100 + PLANETEN_KOMPAS_R}" stroke="rgba(255,255,255,0.06)" stroke-width="1"></line>
    <line x1="${100 - PLANETEN_KOMPAS_R}" y1="100" x2="${100 + PLANETEN_KOMPAS_R}" y2="100" stroke="rgba(255,255,255,0.06)" stroke-width="1"></line>
    <text x="100" y="${100 - PLANETEN_KOMPAS_R - 6}" text-anchor="middle" class="planeten-kompas-label">N</text>
    <text x="${100 + PLANETEN_KOMPAS_R + 8}" y="104" text-anchor="middle" class="planeten-kompas-label">O</text>
    <text x="100" y="${100 + PLANETEN_KOMPAS_R + 14}" text-anchor="middle" class="planeten-kompas-label">Z</text>
    <text x="${100 - PLANETEN_KOMPAS_R - 8}" y="104" text-anchor="middle" class="planeten-kompas-label">W</text>
    ${stippen}
  </svg>`;
}

// ---- Azimuth/elevatie-raster, 2026-08-22-fix ------------------------------
// Op verzoek van Lex, ná de eerste versie hierboven (kompas + een uitklapbare
// horizontale strook per planeet): "er moet ook een y-as met gradenverdeling
// bij. Ik wil 1 raster dat voor elke planeet wordt gebruikt. De elevatie
// wordt dan ook echt weergegeven." — de vorige strook had alleen een
// azimuth-as (X) en toonde elevatie enkel als getal in tekst, geen echte
// Y-positie. Vervangen door precies dat: ÉÉN gedeeld assenstelsel (niet meer
// per planeet apart opgebouwd/uitgeklapt) met X=azimuth (N/O/Z/W) en
// Y=elevatie (echte gradenschaal, horizonlijn nadrukkelijk op 0°), waar alle
// vijf planeten tegelijk op staan. Geen klik meer nodig — dit staat nu
// permanent onder het kompas, de klik-uitklap-mechaniek (uitgeklaptePlaneten)
// is hiermee overbodig geworden en weggehaald.
const RASTER_X0 = 30;
const RASTER_X1 = 284;
const RASTER_Y0 = 8; // boven = elevatie RASTER_EL_MAX
const RASTER_Y1 = 150; // onder = elevatie RASTER_EL_MIN
const RASTER_EL_MIN = -20; // iets onder de horizon meenemen, zodat een net-ondergegane planeet niet plat tegen de rand plakt
const RASTER_EL_MAX = 90;

function rasterX(azimuthGraden) {
  const az = ((azimuthGraden % 360) + 360) % 360;
  return RASTER_X0 + (az / 360) * (RASTER_X1 - RASTER_X0);
}
function rasterY(elevatieGraden) {
  const elGeklemd = Math.max(RASTER_EL_MIN, Math.min(RASTER_EL_MAX, elevatieGraden));
  return RASTER_Y0 + ((RASTER_EL_MAX - elGeklemd) / (RASTER_EL_MAX - RASTER_EL_MIN)) * (RASTER_Y1 - RASTER_Y0);
}

function planetenRasterSvg(planeten) {
  // Y-as: elevatie-gradenlijnen, met de horizon (0°) nadrukkelijk anders
  // (helderder, doorgetrokken) dan de overige hulplijnen (dashed) — dat is
  // de belangrijkste referentielijn ("kan ik 'm nu zien").
  const elLijnen = [90, 60, 30, 0]
    .map((el) => {
      const y = rasterY(el);
      const isHorizon = el === 0;
      return `<line x1="${RASTER_X0}" y1="${y.toFixed(1)}" x2="${RASTER_X1}" y2="${y.toFixed(1)}" stroke="${isHorizon ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.08)'}" stroke-width="1"${isHorizon ? '' : ' stroke-dasharray="2 4"'}></line>
        <text x="${RASTER_X0 - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end" class="planeten-raster-label">${el}°</text>`;
    })
    .join('');
  // X-as: azimuth-gradenlijnen op de kompasrichtingen.
  const azLijnen = [
    { graden: 0, label: 'N' },
    { graden: 90, label: 'O' },
    { graden: 180, label: 'Z' },
    { graden: 270, label: 'W' },
    { graden: 360, label: 'N' },
  ]
    .map((m) => {
      const x = RASTER_X0 + (m.graden / 360) * (RASTER_X1 - RASTER_X0);
      return `<line x1="${x.toFixed(1)}" y1="${RASTER_Y0}" x2="${x.toFixed(1)}" y2="${RASTER_Y1}" stroke="rgba(255,255,255,0.08)" stroke-width="1"></line>
        <text x="${x.toFixed(1)}" y="${RASTER_Y1 + 14}" text-anchor="middle" class="planeten-raster-label">${m.label}</text>`;
    })
    .join('');
  // Zwak gearceerd vlak onder de horizon — visueel meteen duidelijk "hier
  // niet zichtbaar", ook zonder de gradenlabels te lezen.
  const horizonY = rasterY(0);
  const onderHorizonVlak = `<rect x="${RASTER_X0}" y="${horizonY.toFixed(1)}" width="${RASTER_X1 - RASTER_X0}" height="${(RASTER_Y1 - horizonY).toFixed(1)}" fill="rgba(0,0,0,0.22)"></rect>`;
  // 2026-08-22-fix, op verzoek van Lex ("Nee niet IN het raster. De lijst
  // eronder in 2 kolommen") — de eerdere poging zette naam+stand-tekst
  // rechtstreeks in de grafiek; dat bleek niet de bedoeling. Het raster
  // toont nu weer alleen de stippen (schoon, geen tekst-clutter/overlap bij
  // dicht bij elkaar staande planeten) — de tekst staat in de tweekoloms-
  // legenda eronder, zie planetenLegendaItem/planetenKaartVoorHemel.
  const stippen = planeten
    .map((p) => {
      const x = rasterX(p.azimuthGraden);
      const y = rasterY(p.elevatieGraden);
      const r = planetenStipRadius(p.magnitude);
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${p.kleur}" stroke="rgba(10,12,22,0.6)" stroke-width="1.5"></circle>`;
    })
    .join('');
  return `<svg class="planeten-raster" viewBox="0 0 300 168" aria-hidden="true">
    ${onderHorizonVlak}
    ${elLijnen}
    ${azLijnen}
    ${stippen}
  </svg>`;
}

// 2026-08-22-fix, op verzoek van Lex ("1e kolom de naam, 2e kolom de info")
// — was een 2-koloms grid van complete {stip+naam+stand}-blokken (dus
// Mercurius/Venus naast elkaar, Mars/Jupiter eronder, etc.); de bedoeling
// bleek een echte tabel: kolom 1 steeds de naam, kolom 2 steeds de info, elke
// planeet op zijn eigen rij. Vandaar nu twee losse grid-cellen per planeet
// i.p.v. één blok — .planeten-legenda (CSS) regelt de kolomindeling.
function planetenLegendaRijen(planeten, legenda) {
  planeten.forEach((p) => {
    // Niet zichtbaar (onder de 5°-drempel, zie planeten.js): toon simpelweg
    // de eerstvolgende opkomst (0°-horizoncrossing) — dat ligt hooguit een
    // paar minuten vóór het moment dat 'ie ook echt de 5°-drempel passeert,
    // ruim genoeg voor een "wanneer kan ik gaan kijken"-indicatie.
    const stand = p.zichtbaarNu
      ? `${p.elevatieGraden}° boven ${p.richting} · mag. ${p.magnitude}`
      : p.opIso
        ? `op om ${tijdstempelTekst(p.opIso)}`
        : 'onder de horizon';
    const onzichtbaarKlasse = p.zichtbaarNu ? '' : ' planeet-item--onzichtbaar';

    const naamCel = document.createElement('div');
    naamCel.className = `planeet-naam-cel${onzichtbaarKlasse}`;
    naamCel.innerHTML = `<span class="planeet-stip" style="background:${p.kleur}; color:${p.kleur};"></span><span class="planeet-naam">${p.naam}</span>`;

    const infoCel = document.createElement('div');
    infoCel.className = `planeet-stand${onzichtbaarKlasse}`;
    infoCel.textContent = stand;

    legenda.appendChild(naamCel);
    legenda.appendChild(infoCel);
  });
}

// Zelfde soort verzamelkaart als maanKaartVoorHemel hierboven, maar dan voor
// alle vijf planeten in één kompas + één azimuth/elevatie-raster + een
// naam/info-tabel i.p.v. één illustratie.
function planetenKaartVoorHemel(s) {
  const planeten = s.detail?.planeten ?? [];
  const kaart = document.createElement('div');
  kaart.className = 'sky-card sky-card--planeten';
  const kompasWrap = document.createElement('div');
  kompasWrap.className = 'planeten-kompas-wrap';
  kompasWrap.innerHTML = planetenKompasSvg(planeten);
  const rasterWrap = document.createElement('div');
  rasterWrap.className = 'planeten-raster-wrap';
  rasterWrap.innerHTML = planetenRasterSvg(planeten);
  const legenda = document.createElement('div');
  legenda.className = 'planeten-legenda';
  planetenLegendaRijen(planeten, legenda);
  kaart.appendChild(kompasWrap);
  kaart.appendChild(rasterWrap);
  kaart.appendChild(legenda);
  return kaart;
}

// 2026-08-20, op verzoek van Lex ("we willen niet alles onder elkaar in een
// lange lijst... er komt nog wel meer aan planeten etc."): de Hemel-tab
// groepeert zijn kaartjes voortaan in rubrieken met een rij filter-chips
// erboven, i.p.v. alles achter elkaar te tonen. Een nieuwe rubriek (bv.
// straks "Planeten") toevoegen is dan alleen een nieuwe regel hier — geen
// wijziging aan renderSky() zelf nodig.
// 2026-08-20-fix: de "Alles"-rubriek (eerste, standaard actief) mocht van Lex
// weer vervallen — met losse rubrieken die elk al hun eigen scope hebben is
// een ongefilterd "alles door elkaar"-overzicht overbodig geworden. Default
// staat nu op de eerste écht bestaande rubriek ('maan') i.p.v. 'alles'.
const SKY_RUBRIEKEN = [
  { key: 'maan', label: '🌙 Maan', match: (s) => s.id.startsWith('moon') },
  // 2026-08-22, op verzoek van Lex — precies de rubriek die het commentaar
  // hierboven al voorzag toen dit systeem gebouwd werd. Zie
  // backend/sources/planeten.js + planetenKaartVoorHemel() hierboven.
  { key: 'planeten', label: '🪐 Planeten', match: (s) => s.id === 'planeten-nu' },
  { key: 'getij', label: '🌊 Getij', match: (s) => s.id.startsWith('getij') },
  {
    key: 'ruimte',
    label: '🛰️ Ruimte',
    match: (s) => ['iss', 'swpc', 'donki', 'meteors'].some((p) => s.id.startsWith(p)),
  },
];
// 2026-08-21, op verzoek van Lex ("Ik wil een verdeling onder ruimte, dus
// subniveaus: Meteorieten / ISS ... daar moeten de items onder komen") —
// binnen de Ruimte-rubriek hierboven worden de kaartjes nu gegroepeerd onder
// subkopjes i.p.v. plat achter elkaar. SWPC (aurora) en DONKI (ruimteweer-
// context) delen bewust één subkopje ("Ruimteweer") i.p.v. elk een eigen —
// expliciet zo gekozen na navraag bij Lex, want dat zijn inhoudelijk allebei
// "wat doet de zon/magnetosfeer nu", geen twee losse onderwerpen zoals
// Meteorieten en ISS dat wel zijn. Alleen de Ruimte-rubriek krijgt subkopjes
// (Maan en Getij zijn al enkelvoudig genoeg om plat te tonen).
const RUIMTE_SUBGROEPEN = [
  { label: '☄️ Meteorieten', match: (s) => s.id.startsWith('meteors') },
  // volgType hier en bij Starlink hieronder: geeft deze subgroep een eigen
  // "📍 Live op kaart"-knop (zie de forEach hieronder) die startKaartVolgen()
  // aanroept — de vervanging van de oude losse kaartknoppen, altijd
  // beschikbaar (niet pas na openklappen), zie de module-comment bij
  // startKaartVolgen() verderop.
  { label: '🛰️ ISS', match: (s) => s.id.startsWith('iss'), volgType: 'iss' },
  // 2026-08-22, op verzoek van Lex ("Er is een Starlinktrain te zien om'...
  // misschien zelfde kaartje en werkwijze als ISS") — zelfde subgroep-
  // idioom, generieke sky-card (nog geen live kompas/wereldkaartje zoals
  // bij ISS, zie de module-comment in backend/sources/starlinkTrain.js voor
  // waarom dat niet 1-op-1 kon).
  { label: '🚀 Starlink', match: (s) => s.id.startsWith('starlink'), volgType: 'starlink' },
  // 2026-08-21: op verzoek van Lex ("Flares (of zoiets)") hernoemd van
  // "Ruimteweer" naar iets herkenbaars — dekt zowel DONKI (flares/CME's/
  // geomagnetische stormen) als SWPC (aurora), die inhoudelijk bij elkaar
  // horen (zie eerdere navraag: één subkopje voor allebei, niet twee).
  { label: '☀️ Flares', match: (s) => s.id.startsWith('swpc') || s.id.startsWith('donki') },
];
let actieveSkyRubriek = 'maan';
let laatsteSignalenPerCategorie = {};
// 2026-08-21, op verzoek van Lex ("Metteorieten wordt knop, ik klik erop,
// Bam! lijst verschijnt. Zo voor alle verzamelingen") — de subkopjes
// hierboven zijn nu echte knoppen: standaard dicht, pas de lijst eronder
// tonen na een tik. Zelfde uitklap-idioom als uitgeklapteVerlopenCategorieen
// bij de Meldingen-lijst (een Set met welke groepen open staan, persistent
// tussen renders — dus openen blijft open als de rest van de pagina
// ververst).
let uitgeklapteRuimteGroepen = new Set();

// ---- ISS-kaarttracking, 2026-08-22 -----------------------------------------
// Op verzoek van Lex: "Daar zou ik kaarttracking voor willen hebben. Na
// kiezen voor een zichtbare maar ook nuttige passage (TBD) een kaartje met
// waar is. Met meeveranderende meldingen: Kijk in W richting op 30 graden."
// — akkoord gegeven met "laat ik allemaal aan jou over". Zie backend/
// sources/celestrak.js voor de "aanbevolen"-selectie (zichtbaar+hoog
// genoeg+op een fatsoenlijk avonduur) en backend/sources/issLive.js voor de
// losse live-positie-laag (/api/iss-live) die dit hieronder pollt.
//
// Hergebruikt bewust dezelfde kompas-geometrie/-positieformule als de
// Planeten-kaart hierboven (planetenKompasPositie/PLANETEN_KOMPAS_R/C) —
// zelfde soort "waar aan de hemel"-vraag, dus zelfde beeldtaal, herkenbaar
// voor Lex. Eigen kleine functie i.p.v. planetenKompasSvg() zelf hergebruiken
// — die kaart staat al live en heeft een meermaals bijgestelde geschiedenis
// (zie de comments daar); dit voorkomt elk risico dat een ISS-wijziging de
// Planeten-kaart per ongeluk raakt.
function issKompasSvg(azimuthGraden, elevatieGraden) {
  const zichtbaar = elevatieGraden != null && elevatieGraden >= 0 && azimuthGraden != null;
  let stip = '';
  if (zichtbaar) {
    const { x, y } = planetenKompasPositie(azimuthGraden, elevatieGraden);
    stip = `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" fill="#5df7ff" stroke="rgba(10,12,22,0.6)" stroke-width="1.5"><animate attributeName="opacity" values="1;0.55;1" dur="2s" repeatCount="indefinite"/></circle>`;
  }
  return `<svg class="planeten-kompas iss-kompas" viewBox="0 0 200 200" aria-hidden="true">
    <circle cx="100" cy="100" r="${PLANETEN_KOMPAS_R}" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="1"></circle>
    <circle cx="100" cy="100" r="${(PLANETEN_KOMPAS_R * 2) / 3}" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="1" stroke-dasharray="2 4"></circle>
    <circle cx="100" cy="100" r="${PLANETEN_KOMPAS_R / 3}" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="1" stroke-dasharray="2 4"></circle>
    <line x1="100" y1="${100 - PLANETEN_KOMPAS_R}" x2="100" y2="${100 + PLANETEN_KOMPAS_R}" stroke="rgba(255,255,255,0.06)" stroke-width="1"></line>
    <line x1="${100 - PLANETEN_KOMPAS_R}" y1="100" x2="${100 + PLANETEN_KOMPAS_R}" y2="100" stroke="rgba(255,255,255,0.06)" stroke-width="1"></line>
    <text x="100" y="${100 - PLANETEN_KOMPAS_R - 6}" text-anchor="middle" class="planeten-kompas-label">N</text>
    <text x="${100 + PLANETEN_KOMPAS_R + 8}" y="104" text-anchor="middle" class="planeten-kompas-label">O</text>
    <text x="100" y="${100 + PLANETEN_KOMPAS_R + 14}" text-anchor="middle" class="planeten-kompas-label">Z</text>
    <text x="${100 - PLANETEN_KOMPAS_R - 8}" y="104" text-anchor="middle" class="planeten-kompas-label">W</text>
    ${stip}
  </svg>`;
}

// Eigen, snel pollende live-laag (los van de gewone 20s-signalenpoll) —
// alleen actief zolang je op Hemel > Ruimte > ISS zit (subgroep opengeklapt)
// ÉN er een aanbevolen passage daadwerkelijk actief is. Zelfde
// levenscyclus-patroon als zorgRadarPolling() (vliegradar/vaarradar
// hierboven): één gedeelde timer, expliciet gestart/gestopt i.p.v. impliciet
// laten hangen — zie zorgIssLivePolling() onderaan dit blok.
const ISS_LIVE_POLL_MS = 6000;
let issLivePollTimer = null;
let issLiveData = null;
let issLiveVerzoekTeller = 0;
// 2026-08-22, op verzoek van Lex ("maak die kaart maar hoor met tracking") —
// het wereldkaartje ("waar vliegt de ISS nu overheen") dat eerder als
// optionele latere toevoeging was genoemd. Zie zorgIssWereldkaart() verderop
// voor de opzet/levenscyclus.
let issWereldkaartInstance = null;
let issWereldkaartIssMarker = null;

function actieveAanbevolenIssPassage() {
  const alleSignalen = laatsteSignalenPerCategorie['hemel'] ?? [];
  const nu = Date.now();
  return alleSignalen.find((s) => {
    if (!s.id.startsWith('iss-') || !s.detail?.aanbevolen) return false;
    const start = new Date(s.detail.starttijd).getTime();
    const eind = new Date(s.detail.eindtijd).getTime();
    return Number.isFinite(start) && Number.isFinite(eind) && nu >= start && nu <= eind;
  });
}

function moetIssLivePollen() {
  return (
    huidigeView === 'hemel' &&
    actieveSkyRubriek === 'ruimte' &&
    uitgeklapteRuimteGroepen.has('🛰️ ISS') &&
    Boolean(actieveAanbevolenIssPassage())
  );
}

async function tikIssLive() {
  const verzoekId = ++issLiveVerzoekTeller;
  try {
    const data = await fetch('/api/iss-live').then((r) => r.json());
    if (verzoekId !== issLiveVerzoekTeller) return; // ingehaald door een nieuwere poll
    issLiveData = data;
    werkIssLiveKaartBij();
  } catch (err) {
    console.error('iss-live ophalen mislukt', err);
  }
}

// Werkt de al gerenderde kompas/tekst rechtstreeks bij i.p.v. de hele
// Hemel-lijst opnieuw te renderen (dat zou scrollpositie/opengeklapte
// subgroepen kunnen verstoren voor iets dat alleen deze ene kaart raakt).
// Stil (geen fout) als de kaart net niet (meer) in de DOM zit — bijv. Lex
// tikte tussen het afvuren en binnenkomen van dit verzoek naar een andere
// rubriek.
function werkIssLiveKaartBij() {
  const tekstEl = document.getElementById('issLiveTekst');
  const kompasWrap = document.getElementById('issLiveKompasWrap');
  const live = issLiveData;
  if (!tekstEl || !kompasWrap || !live) return;
  tekstEl.textContent = live.zichtbaarNu ? `Kijk nu ${live.elevatieGraden}° boven ${live.richting}` : 'Nog niet boven de horizon vanaf jouw locatie';
  const subEl = document.getElementById('issLiveSub');
  if (subEl) subEl.textContent = `${live.hoogteKm} km hoog · ${live.afstandTotJouKm} km van jou`;
  kompasWrap.innerHTML = issKompasSvg(live.azimuthGraden, live.elevatieGraden);

  // Wereldkaartje (zie zorgIssWereldkaart() hieronder) meebewegen — alleen de
  // ISS-marker verplaatsen, dezelfde "setLatLng i.p.v. opnieuw aanmaken"-
  // aanpak als de vliegradar-scope-cirkel hierboven. Als de kaart er (nog)
  // niet is (bijv. de allereerste tick, vóór zorgIssWereldkaart() 'm heeft
  // kunnen aanmaken) gebeurt hier gewoon niks — de volgende renderSky()-pas
  // maakt 'm alsnog aan met deze (dan niet meer verse) positie als start.
  //
  // 2026-08-22, op verzoek van Lex ("zoom mee in") — niet alleen de marker
  // verplaatsen, maar ook elke tick opnieuw fitBounds/flyToBounds, zodat het
  // kaartje meezoomt naarmate de ISS dichterbij komt (en weer uitzoomt als
  // 'ie zich verwijdert) i.p.v. één keer een zoomniveau te kiezen bij het
  // aanmaken en dat de hele passage te laten staan.
  if (issWereldkaartInstance && issWereldkaartIssMarker) {
    issWereldkaartIssMarker.setLatLng([live.latitude, live.longitude]);
    const homeLatLon = [THUIS.homeLat, THUIS.homeLon];
    issWereldkaartInstance.flyToBounds(L.latLngBounds([homeLatLon, [live.latitude, live.longitude]]).pad(0.8), {
      maxZoom: 8,
      duration: 1,
    });
  }
}

function zorgIssLivePolling() {
  if (moetIssLivePollen()) {
    if (!issLivePollTimer) {
      tikIssLive();
      issLivePollTimer = setInterval(tikIssLive, ISS_LIVE_POLL_MS);
    }
  } else if (issLivePollTimer) {
    clearInterval(issLivePollTimer);
    issLivePollTimer = null;
    issLiveData = null;
  }
  // 2026-08-22: pas ná de huidige renderSky()-aanroep (met al zijn eigen
  // early-returns, zie renderSky() hierboven) staat de DOM definitief vast —
  // vandaar setTimeout(...,0) i.p.v. hier direct zorgIssWereldkaart()
  // aanroepen. Dit is bewust de ENE plek die dat plant: zorgIssLivePolling()
  // wordt zowel vanaf de allereerste regel van renderSky() als vanuit
  // wisselView() aangeroepen, dus dit dekt tegelijk "de lijst is herbouwd" én
  // "je bent net van tabblad gewisseld".
  setTimeout(zorgIssWereldkaart, 0);
}

// Eigen, kleine Leaflet-kaart (niet de hoofdkaart) met "waar vliegt de ISS nu
// overheen" — dezelfde tegel-proxy als de hoofdkaart (/api/tegel/..., zie
// initMap()), geen los kaartplaatje/eigen wereldomtrek-tekening nodig.
//
// Levenscyclus: elke renderSky()-pas (elke 20s-poll, of een rubriek-/
// subgroep-wissel) bouwt SKY_LIJST_EL volledig opnieuw op, dus ook de
// #issWereldkaart-container is dan telkens een gloednieuw DOM-element — de
// vorige Leaflet-instantie zou daardoor "wees" worden (gekoppeld aan een
// inmiddels losgekoppeld element) als 'm niet expliciet opgeruimd wordt.
// Vandaar: eerst altijd de oude instantie (indien aanwezig) verwijderen met
// .remove(), dan pas — als we nu daadwerkelijk op de live ISS-kaart zitten
// én de container bestaat — een nieuwe aanmaken. Tussen twee renderSky()-
// passen in verplaatst de losse 6s-live-tick (zie werkIssLiveKaartBij()
// hierboven) alleen de ISS-marker, geen hertekening van de hele kaart.
function zorgIssWereldkaart() {
  if (issWereldkaartInstance) {
    issWereldkaartInstance.remove();
    issWereldkaartInstance = null;
    issWereldkaartIssMarker = null;
  }
  // Zelfde voorwaarde als moetIssLivePollen() — geen zin een kaart te tekenen
  // op een rubriek/tabblad die toch niet zichtbaar is (en Leaflet berekent
  // tegel-afmetingen sowieso fout op een display:none-container).
  if (!moetIssLivePollen()) return;
  const container = document.getElementById('issWereldkaart');
  if (!container) return;

  const live = issLiveData;
  const homeLatLon = [THUIS.homeLat, THUIS.homeLon];
  const issLatLon = live ? [live.latitude, live.longitude] : homeLatLon;

  issWereldkaartInstance = L.map('issWereldkaart', {
    attributionControl: false,
    zoomControl: false,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    touchZoom: false,
  });
  L.tileLayer('/api/tegel/{z}/{x}/{y}.png?v=osm1', { maxZoom: 19 }).addTo(issWereldkaartInstance);

  L.marker(homeLatLon, {
    icon: L.divIcon({ className: '', html: '<div class="home-pin"></div>', iconSize: [14, 14], iconAnchor: [7, 7] }),
    interactive: false,
  }).addTo(issWereldkaartInstance);
  issWereldkaartIssMarker = L.marker(issLatLon, {
    icon: L.divIcon({ className: '', html: '<div class="verkeer-pin">🛰️</div>', iconSize: [24, 24], iconAnchor: [12, 12] }),
    interactive: false,
  }).addTo(issWereldkaartInstance);

  // Ruime marge rond beide punten — de ISS legt in de tijd tussen twee
  // renderSky()-passen (~20s) al een flink stuk af, dus een kraptere
  // fitBounds zou 'm zo weer buiten beeld kunnen laten lopen.
  issWereldkaartInstance.fitBounds(L.latLngBounds([homeLatLon, issLatLon]).pad(0.8), { maxZoom: 8 });
  // Zelfde reden als kaart.invalidateSize() bij wisselView hierboven —
  // Leaflet rekent tegel-afmetingen fout uit als de container bij het
  // aanmaken nog display:none heeft gehad (bijv. de Ruimte-subgroep die
  // precies nu pas opengeklapt is).
  setTimeout(() => issWereldkaartInstance?.invalidateSize(), 0);
}

// De "aanbevolen" ISS-passage (zie backend/sources/celestrak.js voor de
// selectiecriteria) krijgt een eigen kaart i.p.v. het generieke
// sky-card-rijtje. Drie standen, afhankelijk van waar `nu` valt t.o.v.
// starttijd/eindtijd:
// - nog niet begonnen: badge + aftelling + de voorspelde cijfers (zoals
//   voorheen, alleen nu gemarkeerd als DE aanbevolen passage).
// - actief (starttijd ≤ nu ≤ eindtijd): live kompas + "Kijk nu ... op ...°"
//   -tekst, bijgewerkt door zorgIssLivePolling()/werkIssLiveKaartBij()
//   hierboven.
// - al voorbij (celestrak.js herberekent maar elke 6 uur, dus een afgelopen
//   aanbevolen passage kan nog even als zodanig gemarkeerd blijven staan):
//   geeft null terug, zodat maakSkyKaart() hieronder terugvalt op de gewone
//   generieke kaart voor dit signaal.
function issKaartVoorHemel(s) {
  const d = s.detail ?? {};
  const nu = Date.now();
  const start = new Date(d.starttijd).getTime();
  const eind = new Date(d.eindtijd).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(eind) || nu > eind) return null;

  const actief = nu >= start;
  const kaart = document.createElement('div');
  kaart.className = 'sky-card sky-card--iss';

  if (actief) {
    const live = issLiveData;
    kaart.innerHTML = `
      <div class="iss-badge">🛰️ Live — ISS-passage bezig</div>
      <div class="planeten-kompas-wrap" id="issLiveKompasWrap">${issKompasSvg(live?.azimuthGraden, live?.elevatieGraden)}</div>
      <div class="iss-live-tekst" id="issLiveTekst">${live ? (live.zichtbaarNu ? `Kijk nu ${live.elevatieGraden}° boven ${live.richting}` : 'Nog niet boven de horizon vanaf jouw locatie') : `Kijk laag boven ${d.richtingOp}`}</div>
      <div class="iss-live-sub" id="issLiveSub">${live ? `${live.hoogteKm} km hoog · ${live.afstandTotJouKm} km van jou` : `loopt op tot ${d.maxElevatieGraden}° · nog ${Math.max(0, Math.round((eind - nu) / 60000))} min`}</div>
      <div class="iss-wereldkaart-wrap"><div id="issWereldkaart" class="iss-wereldkaart"></div></div>
    `;
  } else {
    const overTekst = overTijdTekst(d.starttijd);
    kaart.innerHTML = `
      <div class="iss-badge">🌟 Aanbevolen passage</div>
      <div class="t1">ISS-passage om ${tijdstempelTekst(d.starttijd)}${overTekst ? ` (${overTekst})` : ''}</div>
      <div class="t2">max. ${d.maxElevatieGraden}° · ${d.duurMinuten} min · <span class="iss-sterren">${sterrenTekst(d.sterren)}</span> · op in ${d.richtingOp}, onder in ${d.richtingOnder}</div>
    `;
  }
  return kaart;
}

// Losgetrokken uit renderSky() (was inline in de forEach) zodat zowel de
// platte lijst als de nieuwe gegroepeerde Ruimte-weergave hierboven dezelfde
// kaart-opbouw hergebruiken i.p.v. 'm te dupliceren.
function maakSkyKaart(s) {
  if (s.id.startsWith('moon')) return maanKaartVoorHemel(s);
  if (s.id === 'planeten-nu') return planetenKaartVoorHemel(s);
  if (s.id.startsWith('iss-') && s.detail?.aanbevolen) {
    const speciaal = issKaartVoorHemel(s);
    if (speciaal) return speciaal;
  }
  const kaart = document.createElement('div');
  kaart.className = 'sky-card';
  kaart.innerHTML = `
    <span class="sky-icoon">${hemelIcoon(s.id)}</span>
    <div>
      <div class="t1">${s.titel}</div>
      <div class="t2">${hemelSub(s)}</div>
    </div>
  `;
  return kaart;
}

// 2026-08-22, op verzoek van Lex ("Aarde nu alleen in het hoofdscherm Hemel
// tonen... dan winnen we ruimte") — zelfde rubriek-scoping als de
// weather-card/zonmaan-kaart (zie renderWeer/renderZonMaan hieronder), maar
// dan voor de "🌍 Aarde nu"-knop: alleen zichtbaar op de Maan-rubriek, niet
// bij Planeten/Getij/Ruimte.
function pasHemelActiesZichtbaarheidAan() {
  HEMEL_ACTIES_EL.style.display = actieveSkyRubriek === 'maan' ? 'block' : 'none';
}

function renderSkyRubrieken() {
  SKY_RUBRIEKEN_EL.innerHTML = '';
  SKY_RUBRIEKEN.forEach((r) => {
    const btn = document.createElement('button');
    btn.className = `sky-rubriek${r.key === actieveSkyRubriek ? ' actief' : ''}`;
    btn.textContent = r.label;
    btn.addEventListener('click', () => {
      if (actieveSkyRubriek === r.key) return;
      actieveSkyRubriek = r.key;
      renderSky(laatsteSignalenPerCategorie);
      // 2026-08-22, op verzoek van Lex ("de zonbaan en icons in elk scherm
      // zichtbaar, dat moet alleen in het hoofdscherm Hemel") — deze
      // kaartjes/knop horen alleen bij de Maan-rubriek (zie renderWeer/
      // renderZonMaan/pasHemelActiesZichtbaarheidAan hierboven). Ze worden
      // ook elke 20s-poll opnieuw aangeroepen (zie de dispatcher onderin dit
      // bestand), maar zonder deze aanroep hier zou een tik op een andere
      // chip pas ná die volgende poll verbergen i.p.v. meteen.
      renderWeer(laatsteSignalenPerCategorie);
      renderZonMaan(laatsteSignalenPerCategorie);
      pasHemelActiesZichtbaarheidAan();
    });
    SKY_RUBRIEKEN_EL.appendChild(btn);
  });
}

function renderSky(signalenPerCategorie) {
  laatsteSignalenPerCategorie = signalenPerCategorie;
  renderSkyRubrieken();
  // 2026-08-22: vóór de eventuele early-returns hieronder aangeroepen — deze
  // functie bepaalt zelf via moetIssLivePollen() of de live-timer wel/niet
  // moet lopen, dus dat moet ongeacht welk pad hieronder wordt genomen
  // sowieso opnieuw geëvalueerd worden (bijv. bij een rubriek-wissel of een
  // Ruimte-subgroep die dicht/open klapt, zie de aanroepen van renderSky()
  // hierboven/hieronder).
  zorgIssLivePolling();

  const alleSignalen = [...(signalenPerCategorie['hemel'] ?? [])].sort(sorteerOpErnstEnTijd);
  if (!alleSignalen.length) {
    SKY_LIJST_EL.innerHTML = '';
    HEMEL_LEEG_EL.textContent = 'Geen hemelgegevens beschikbaar';
    HEMEL_LEEG_EL.style.display = 'block';
    return;
  }

  const rubriek = SKY_RUBRIEKEN.find((r) => r.key === actieveSkyRubriek) ?? SKY_RUBRIEKEN[0];
  const signalen = alleSignalen.filter(rubriek.match);

  if (!signalen.length) {
    SKY_LIJST_EL.innerHTML = '';
    HEMEL_LEEG_EL.textContent = `Niets in ${rubriek.label.replace(/^\S+\s/, '') || rubriek.label} op dit moment`;
    HEMEL_LEEG_EL.style.display = 'block';
    return;
  }

  HEMEL_LEEG_EL.style.display = 'none';
  SKY_LIJST_EL.innerHTML = '';

  if (rubriek.key === 'ruimte') {
    RUIMTE_SUBGROEPEN.forEach((groep) => {
      const items = signalen.filter(groep.match);
      if (!items.length) return; // geen lege knoppen tonen
      const uitgeklapt = uitgeklapteRuimteGroepen.has(groep.label);
      // 2026-08-22: subkop-knop + (voor ISS/Starlink) een losse "live op
      // kaart"-knop staan nu samen in één rij (.sky-subkop-rij) — zie
      // startKaartVolgen() verderop en de bijbehorende CSS.
      const rij = document.createElement('div');
      rij.className = 'sky-subkop-rij';
      const kop = document.createElement('button');
      kop.type = 'button';
      kop.className = 'sky-subkop';
      kop.innerHTML = `<span>${groep.label}</span><span class="sky-subkop-pijl">${uitgeklapt ? '▾' : '▸'}</span>`;
      kop.addEventListener('click', () => {
        if (uitgeklapt) uitgeklapteRuimteGroepen.delete(groep.label);
        else uitgeklapteRuimteGroepen.add(groep.label);
        renderSky(laatsteSignalenPerCategorie);
      });
      rij.appendChild(kop);
      if (groep.volgType) {
        const volgKnop = document.createElement('button');
        volgKnop.type = 'button';
        volgKnop.className = `sky-subkop-volg${kaartVolgType === groep.volgType ? ' actief' : ''}`;
        volgKnop.textContent = kaartVolgType === groep.volgType ? '📍 Op kaart' : '📍 Live op kaart';
        volgKnop.addEventListener('click', (e) => {
          e.stopPropagation(); // niet ook de open/dicht-knop ernaast raken
          startKaartVolgen(groep.volgType);
        });
        rij.appendChild(volgKnop);
      }
      SKY_LIJST_EL.appendChild(rij);
      // 2026-08-23, op verzoek van Lex ("Ik wil er een melding bij: De
      // volgende zichtbare baan is op <# dagen> - <datumtijd>") — altijd
      // zichtbaar, ook dichtgeklapt (dus geen "eerst openklappen om te weten
      // wanneer"). Alleen voor ISS: expliciet gesorteerd op starttijd, want
      // `items` staat in ernst+tijd-volgorde (zie sorteerOpErnstEnTijd
      // hierboven) — een verderop liggende maar hogere passage kan dus vóór
      // een dichterbije lagere staan, items[0] is niet per se de eerstkomende.
      if (groep.volgType === 'iss') {
        const volgende = [...items].sort((a, b) => new Date(a.detail.starttijd) - new Date(b.detail.starttijd))[0];
        if (volgende?.detail?.starttijd) {
          const dagen = Math.max(0, Math.round((new Date(volgende.detail.starttijd).getTime() - Date.now()) / 86400000));
          // Zelfde "vandaag"/enkelvoud-"dag"-formulering als de maan-
          // countdown hierboven (maanKaartVoorHemel) — consistent huisstijl.
          const overTekst = dagen === 0 ? 'vandaag' : `over ${dagen} ${dagen === 1 ? 'dag' : 'dagen'}`;
          const melding = document.createElement('div');
          melding.className = 'sky-subkop-melding';
          melding.textContent = `De volgende zichtbare baan is ${overTekst} · ${tijdstempelTekst(volgende.detail.starttijd)}`;
          SKY_LIJST_EL.appendChild(melding);
        }
      }
      if (uitgeklapt) items.forEach((s) => SKY_LIJST_EL.appendChild(maakSkyKaart(s)));
    });
    return;
  }

  signalen.forEach((s) => SKY_LIJST_EL.appendChild(maakSkyKaart(s)));
}

const WINDRICHTINGEN = ['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW'];
function windRichtingTekst(graden) {
  if (graden == null) return '—';
  return WINDRICHTINGEN[Math.round(graden / 45) % 8];
}

// 2026-08-22, op verzoek van Lex ("sterrenwaardering... net als ISS
// spotter") — n komt kant-en-klaar (1-5) uit backend/sources/celestrak.js
// (hoogteScore()/donkerScore() daar), hier alleen de tekstweergave.
function sterrenTekst(n) {
  const aantal = Math.max(0, Math.min(5, n ?? 0));
  return '★'.repeat(aantal) + '☆'.repeat(5 - aantal);
}

// ---- Weericonen, 2026-08-19 ------------------------------------------------
// Op verzoek van Lex ("Bewolkt mag vervangen worden door plaatjes horende
// bij het weertype, icon-achtig maar misschien wel grafische afbeeldingen")
// — zelfgetekende illustraties i.p.v. de kale conditietekst, in dezelfde
// gradient-stijl als de zon/maan-graphics elders in de app. Een klein aantal
// basisvormen (zon, maan, wolk, mist, regen, sneeuw, bliksem), samengesteld
// per WMO-weercode (zie CONDITIE in backend/sources/openmeteo.js voor de
// volledige codetabel) — veel codes delen dezelfde illustratie (bijv. alle
// motregen/regen-varianten), dat is bewust: het gaat om het beeld van "wat
// voor weer is dit ongeveer", niet om elke code een unieke tekening te geven.
function weerIconCategorie(code, isDag) {
  if (code === 0) return isDag ? 'helder-dag' : 'helder-nacht';
  if (code === 1 || code === 2) return isDag ? 'bewolkt-licht-dag' : 'bewolkt-licht-nacht';
  if (code === 3) return 'bewolkt';
  if (code === 45 || code === 48) return 'mist';
  if ([65, 67, 81, 82].includes(code)) return 'regen-zwaar';
  if ([51, 53, 55, 56, 57, 61, 63, 66, 80].includes(code)) return 'regen-licht';
  if ([75, 86].includes(code)) return 'sneeuw-zwaar';
  if ([71, 73, 77, 85].includes(code)) return 'sneeuw-licht';
  if ([95, 96, 99].includes(code)) return 'onweer';
  return 'bewolkt';
}

function weerZonSvg(cx, cy, r, kleur) {
  let stralen = '';
  for (let i = 0; i < 8; i++) {
    const hoek = (i * Math.PI) / 4;
    const x1 = cx + Math.cos(hoek) * (r + 3);
    const y1 = cy + Math.sin(hoek) * (r + 3);
    const x2 = cx + Math.cos(hoek) * (r + 8);
    const y2 = cy + Math.sin(hoek) * (r + 8);
    stralen += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${kleur}" stroke-width="2" stroke-linecap="round"/>`;
  }
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#weerZonGrad)"/>${stralen}`;
}

// Hergebruikt dezelfde "twee bogen"-sikkelvorm als maanPad() elders in dit
// bestand — hier met een vaste fractie (0.28), puur decoratief zoals ook al
// bij de op-/ondergang-mini-iconen.
function weerMaanSvg(cx, cy, r) {
  const pad = maanPad(0.28, r);
  return `<g transform="translate(${cx - r},${cy - r})"><path d="${pad}" fill="url(#weerMaanGrad)"/></g>`;
}

function weerSterrenSvg() {
  return `<circle cx="12" cy="12" r="1.3" fill="#fff" opacity="0.7"/>
    <circle cx="50" cy="10" r="1" fill="#fff" opacity="0.6"/>
    <circle cx="54" cy="20" r="1.3" fill="#fff" opacity="0.7"/>`;
}

// Klassieke wolkvorm (drie overlappende ellipsen + afgeronde basis) — vaste
// coördinaten (geen parameters nodig, dit icoon heeft maar één formaat).
function weerWolkSvg(gradId) {
  return `<ellipse cx="21" cy="30" rx="10" ry="8" fill="url(#${gradId})"/>
    <ellipse cx="34" cy="22" rx="13" ry="11" fill="url(#${gradId})"/>
    <ellipse cx="47" cy="28" rx="11" ry="9" fill="url(#${gradId})"/>
    <rect x="18" y="28" width="34" height="12" rx="6" fill="url(#${gradId})"/>`;
}

function weerMistSvg() {
  return `<line x1="14" y1="20" x2="50" y2="20" stroke="#aab4d9" stroke-width="2.4" stroke-linecap="round" opacity="0.5"/>
    <line x1="10" y1="28" x2="54" y2="28" stroke="#aab4d9" stroke-width="2.4" stroke-linecap="round" opacity="0.75"/>
    <line x1="16" y1="36" x2="48" y2="36" stroke="#aab4d9" stroke-width="2.4" stroke-linecap="round" opacity="0.55"/>`;
}

function weerRegenSvg(aantal) {
  return [24, 32, 40, 30, 38]
    .slice(0, aantal)
    .map((x, i) => {
      const y1 = 42 + (i % 2) * 2;
      return `<line x1="${x}" y1="${y1}" x2="${x - 3}" y2="${y1 + 6}" stroke="#5fb8ff" stroke-width="2.2" stroke-linecap="round"/>`;
    })
    .join('');
}

function weerSneeuwSvg(aantal) {
  return [24, 32, 40, 30, 38]
    .slice(0, aantal)
    .map((x, i) => {
      const y = 44 + (i % 2) * 3;
      const s = 3;
      return `<g stroke="#dfe8ff" stroke-width="1.6" stroke-linecap="round">
        <line x1="${x - s}" y1="${y}" x2="${x + s}" y2="${y}"/>
        <line x1="${x}" y1="${y - s}" x2="${x}" y2="${y + s}"/>
        <line x1="${(x - s * 0.7).toFixed(1)}" y1="${(y - s * 0.7).toFixed(1)}" x2="${(x + s * 0.7).toFixed(1)}" y2="${(y + s * 0.7).toFixed(1)}"/>
        <line x1="${(x - s * 0.7).toFixed(1)}" y1="${(y + s * 0.7).toFixed(1)}" x2="${(x + s * 0.7).toFixed(1)}" y2="${(y - s * 0.7).toFixed(1)}"/>
      </g>`;
    })
    .join('');
}

function weerBliksemSvg() {
  return `<polygon points="37,40 31,50 35,50 29,56 41,45 35,45" fill="#ffd447"/>`;
}

const WEER_ICOON_DEFS = `<defs>
  <radialGradient id="weerZonGrad" cx="35%" cy="30%" r="70%">
    <stop offset="0%" stop-color="#ffe8a3"/>
    <stop offset="100%" stop-color="#ff9d5c"/>
  </radialGradient>
  <linearGradient id="weerMaanGrad" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#e3e7f5"/>
    <stop offset="100%" stop-color="#9aa2c2"/>
  </linearGradient>
  <linearGradient id="weerWolkGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#c7cde0"/>
    <stop offset="100%" stop-color="#9aa2c2"/>
  </linearGradient>
  <linearGradient id="weerWolkGradDonker" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#7c86a8"/>
    <stop offset="100%" stop-color="#565f80"/>
  </linearGradient>
</defs>`;

function weerIconSvg(code, isDag) {
  const categorie = weerIconCategorie(code, isDag);
  let inhoud;
  switch (categorie) {
    case 'helder-dag':
      inhoud = weerZonSvg(32, 27, 14, '#ffb35c');
      break;
    case 'helder-nacht':
      inhoud = weerMaanSvg(32, 27, 13) + weerSterrenSvg();
      break;
    case 'bewolkt-licht-dag':
      inhoud = weerZonSvg(23, 18, 10, '#ffb35c') + weerWolkSvg('weerWolkGrad');
      break;
    case 'bewolkt-licht-nacht':
      inhoud = weerMaanSvg(23, 18, 9) + weerWolkSvg('weerWolkGrad');
      break;
    case 'mist':
      inhoud = weerMistSvg();
      break;
    case 'regen-licht':
      inhoud = weerWolkSvg('weerWolkGradDonker') + weerRegenSvg(3);
      break;
    case 'regen-zwaar':
      inhoud = weerWolkSvg('weerWolkGradDonker') + weerRegenSvg(5);
      break;
    case 'sneeuw-licht':
      inhoud = weerWolkSvg('weerWolkGrad') + weerSneeuwSvg(3);
      break;
    case 'sneeuw-zwaar':
      inhoud = weerWolkSvg('weerWolkGrad') + weerSneeuwSvg(5);
      break;
    case 'onweer':
      inhoud = weerWolkSvg('weerWolkGradDonker') + weerBliksemSvg();
      break;
    case 'bewolkt':
    default:
      inhoud = weerWolkSvg('weerWolkGrad');
      break;
  }
  return `<svg width="64" height="58" viewBox="0 0 64 58" class="weer-icoon" aria-hidden="true">${WEER_ICOON_DEFS}${inhoud}</svg>`;
}

// ---- Iconen bij de stat-tegels (Gevoel/Wind/Windstoten/Vochtigheid/
// Luchtdruk/Bewolking), 2026-08-19 -------------------------------------------
// Op verzoek van Lex ("icons voor de titels, thermometer, wind... het moet
// thematisch") — i.p.v. losse plaatjes uit verschillende sets (die niet bij
// elkaar passen qua stijl/kleur) een eigen kleine set in exact hetzelfde
// gradient-/lijnstijl-taalgebruik als de rest van de kaart: dezelfde blauwe
// regen-tint voor wind/vocht, dezelfde wolktint als weerIconSvg voor
// bewolking, dezelfde warme oranje voor temperatuur. Klein en statisch (geen
// data-afhankelijkheid), dus één keer getekend bij het laden i.p.v. bij elke
// verversing.
const STAT_ICOON_DEFS = `<defs>
  <linearGradient id="statThermoGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#ffb35c"/>
    <stop offset="100%" stop-color="#ff6b9d"/>
  </linearGradient>
  <linearGradient id="statDruppelGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#8fd3ff"/>
    <stop offset="100%" stop-color="#5fb8ff"/>
  </linearGradient>
  <linearGradient id="statWolkGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#c7cde0"/>
    <stop offset="100%" stop-color="#9aa2c2"/>
  </linearGradient>
</defs>`;

function statIconWrap(inhoud) {
  return `<svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">${STAT_ICOON_DEFS}${inhoud}</svg>`;
}

function statThermoSvg() {
  return statIconWrap(`
    <rect x="8.4" y="3" width="3.2" height="10.5" rx="1.6" fill="url(#statThermoGrad)" stroke="rgba(255,255,255,0.25)" stroke-width="0.7"/>
    <circle cx="10" cy="14" r="3.2" fill="url(#statThermoGrad)" stroke="rgba(255,255,255,0.25)" stroke-width="0.7"/>
  `);
}

// Rustig wafelend lijntje dat aan het eind omkrult — het klassieke
// "wind"-glyph (vergelijkbaar met Lex' referentieplaatje).
function statWindSvg() {
  return statIconWrap(`
    <path d="M2 7h9a2 2 0 1 0-2-2" fill="none" stroke="#5fb8ff" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M2 10.5h12a2.2 2.2 0 1 1-2.2 2.2" fill="none" stroke="#5fb8ff" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M2 14h7a1.6 1.6 0 1 0-1.6-1.6" fill="none" stroke="#5fb8ff" stroke-width="1.5" stroke-linecap="round"/>
  `);
}

// Zelfde wind-glyph, plus een paar korte "spark"-streepjes voor het
// plotselinge/piekende karakter van een windstoot — en een iets lichtere
// tint om 'm van de rustige-wind-versie te onderscheiden.
function statWindstotenSvg() {
  return statIconWrap(`
    <path d="M2 6h8a1.8 1.8 0 1 0-1.8-1.8" fill="none" stroke="#8fd3ff" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M2 10h11.5a2 2 0 1 1-2 2" fill="none" stroke="#8fd3ff" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M2 14h6.5a1.5 1.5 0 1 0-1.5-1.5" fill="none" stroke="#8fd3ff" stroke-width="1.5" stroke-linecap="round"/>
    <g stroke="#8fd3ff" stroke-width="1.1" stroke-linecap="round">
      <line x1="15.5" y1="3.5" x2="17" y2="2"/>
      <line x1="16" y1="5" x2="18" y2="5"/>
      <line x1="15.5" y1="6.5" x2="17" y2="8"/>
    </g>
  `);
}

function statDruppelSvg() {
  return statIconWrap(
    `<path d="M10 2.5c2.4 3.4 5 6.6 5 9.6a5 5 0 0 1-10 0c0-3 2.6-6.2 5-9.6Z" fill="url(#statDruppelGrad)" stroke="rgba(255,255,255,0.25)" stroke-width="0.7"/>`
  );
}

// Kleine drukmeter/wijzerplaat — cirkel + wijzer + twee schaalstreepjes.
function statDrukSvg() {
  return statIconWrap(`
    <circle cx="10" cy="10" r="6.5" fill="none" stroke="#9aa2c2" stroke-width="1.4"/>
    <line x1="10" y1="10" x2="13" y2="7" stroke="#9aa2c2" stroke-width="1.4" stroke-linecap="round"/>
    <circle cx="10" cy="10" r="1.1" fill="#9aa2c2"/>
    <line x1="10" y1="4.2" x2="10" y2="5.4" stroke="#9aa2c2" stroke-width="1.2" stroke-linecap="round"/>
    <line x1="15.8" y1="10" x2="14.6" y2="10" stroke="#9aa2c2" stroke-width="1.2" stroke-linecap="round"/>
  `);
}

// Mini-versie van dezelfde wolkvorm als weerWolkSvg (weerIconSvg hierboven),
// alleen geschaald voor het kleine stat-icoontje — zelfde gradient-tint.
function statWolkSvg() {
  return statIconWrap(`
    <ellipse cx="7" cy="11" rx="3.4" ry="2.7" fill="url(#statWolkGrad)"/>
    <ellipse cx="11" cy="8" rx="4.3" ry="3.6" fill="url(#statWolkGrad)"/>
    <ellipse cx="15" cy="10.5" rx="3.6" ry="3" fill="url(#statWolkGrad)"/>
    <rect x="6" y="10" width="11" height="4" rx="2" fill="url(#statWolkGrad)"/>
  `);
}

// 2026-08-20: statThermoSvg() (hierboven) werd alleen gebruikt voor het
// "Gevoel"-tegeltje, dat op Lex' verzoek is weggehaald (de echte temperatuur
// staat al in de app-header) — functie laten staan, wordt nu nergens meer
// aangeroepen.
STAT_ICOON_WIND_EL.innerHTML = statWindSvg();
STAT_ICOON_STOTEN_EL.innerHTML = statWindstotenSvg();
STAT_ICOON_VOCHT_EL.innerHTML = statDruppelSvg();
STAT_ICOON_DRUK_EL.innerHTML = statDrukSvg();
STAT_ICOON_BEWOLKING_EL.innerHTML = statWolkSvg();
STAT_ICOON_KNMI_TEMP_EL.innerHTML = statThermoSvg();

function renderWeer(signalenPerCategorie) {
  const weer = (signalenPerCategorie['algemeen-weer'] ?? []).find((s) => s.id === 'openmeteo-nu');
  if (!weer) return;
  const d = weer.detail;

  HEADER_TEMP_EL.textContent = `${Math.round(d.temperatuurC)}°`;

  // 2026-08-20: icoon + conditietekst stonden hier eerst in het weerkaartje
  // (.weather-card .top), op Lex' verzoek verhuisd naar de app-header, vlak
  // naast de plaatsnaam — WEER_ICOON_EL/WEER_CONDITIE_EL zelf zijn dezelfde
  // elementen gebleven, alleen hun plek in index.html is veranderd.
  WEER_ICOON_EL.innerHTML = weerIconSvg(d.weatherCode, d.isDag);
  WEER_CONDITIE_EL.textContent = weer.titel;

  // 2026-08-22, op verzoek van Lex ("de zonbaan en icons in elk scherm
  // zichtbaar, dat moet alleen in het hoofdscherm Hemel") — dit kaartje
  // (en de zon/maan-kaart, zie renderZonMaan hieronder) hoort alleen bij de
  // Maan-rubriek van de Hemel-tab, niet bij Planeten/Getij/Ruimte: het duwde
  // daar bijv. de nieuwe Planeten-kompas onnodig naar beneden. De
  // header-velden hierboven (HEADER_TEMP_EL/WEER_ICOON_EL/WEER_CONDITIE_EL)
  // blijven WEL altijd bijgewerkt — die staan in de app-header, zichtbaar op
  // elk tabblad, geen onderdeel van deze rubriek-scoping.
  if (actieveSkyRubriek !== 'maan') {
    WEATHER_CARD_EL.style.display = 'none';
    return;
  }
  WEATHER_CARD_EL.style.display = 'block';
  // "Gevoel" (gevoelstemperatuur) is op Lex' verzoek weggehaald — de echte
  // temperatuur staat al rechtsboven in de header, dat was dubbelop.
  WEER_WIND_EL.textContent = `${Math.round(d.windKmh)} km/u ${windRichtingTekst(d.windRichtingGraden)}`;
  WEER_STOTEN_EL.textContent = d.windstotenKmh != null ? `${Math.round(d.windstotenKmh)} km/u` : '—';
  WEER_VOCHT_EL.textContent = `${Math.round(d.luchtvochtigheidPct)}%`;
  WEER_DRUK_EL.textContent = d.luchtdrukHpa != null ? `${Math.round(d.luchtdrukHpa)} hPa` : '—';
  WEER_BEWOLKING_EL.textContent = d.bewolkingPct != null ? `${Math.round(d.bewolkingPct)}%` : '—';


  // 2026-08-22, op verzoek van Lex ('wat zie ik dan nu in de app?') — KNMI
  // (sources/knmi.js) is een NL-precisie-aanvulling naast Open-Meteo, geen
  // vervanging: allebei categorie 'algemeen-weer', dus hier los opgezocht op
  // id i.p.v. de openmeteo-lookup te vervangen. Alleen getoond als de bron ook
  // daadwerkelijk data heeft (implemented + minstens 1x succesvol gepolld).
  const knmi = (signalenPerCategorie['algemeen-weer'] ?? []).find((s) => s.id === 'knmi-nu');
  if (knmi && knmi.detail.temperatuurC != null) {
    WEER_KNMI_TEMP_EL.textContent = `${knmi.detail.temperatuurC.toFixed(1).replace('.', ',')}°`;
    STAT_KNMI_TEMP_EL.style.display = 'flex';
    // Station+afstand gewoon zichtbaar tekstregeltje i.p.v. title-tooltip
    // (die werkt niet fatsoenlijk op iOS — Lex' eigen telefoon).
    WEER_KNMI_STATION_EL.textContent = `KNMI ${knmi.detail.station} · ${Math.round(knmi.detail.afstandKm)} km`;
    WEER_KNMI_STATION_EL.style.display = 'block';
  } else {
    STAT_KNMI_TEMP_EL.style.display = 'none';
    WEER_KNMI_STATION_EL.style.display = 'none';
  }
}

// ---- Zon/maan-kaart + actieve-signalen-samenvatting, 2026-08-19 -----------
// Op verzoek van Lex: de ruimte tussen het weerkaartje en de bottom-nav bleef
// leeg op een lang scherm (bijv. iPhone). Eerst een simpele tekststrook,
// daarna op Lex' verzoek ("mag spectaculair worden ook voor wat de
// maanfasen betreft") uitgebreid naar een dagboog met gloeiende zon-marker
// plus een uitvergroot maanpaneel met sterrenveld en volle/nieuwe-maan-
// aftelling.

// Open-Meteo geeft zonsopkomst/-ondergang terug als lokale wandklok-tijd
// zonder offset (timezone=auto, bijv. "2026-08-19T06:14") — dus gewoon het
// HH:MM-deel eruit knippen voor de labels i.p.v. dit als UTC te
// herinterpreteren (wat met new Date() + timezone-aannames alleen maar
// foutgevoelig zou zijn).
function tijdUitIso(iso) {
  return iso ? iso.slice(11, 16) : '—';
}

// Voor de dagvoortgang (positie van de zon-marker) hebben we wél een echt
// Date-object nodig om te vergelijken met "nu" — die bouwen we zelf op met
// VANDAAG's datum + het uur:minuut uit de ISO-string, in plaats van de
// ISO-string zelf te parsen (zie tijdUitIso hierboven voor waarom).
function tijdVandaagUitIso(iso) {
  if (!iso) return null;
  const [uur, minuut] = iso.slice(11, 16).split(':').map(Number);
  if (Number.isNaN(uur) || Number.isNaN(minuut)) return null;
  const d = new Date();
  d.setHours(uur, minuut, 0, 0);
  return d;
}

function minutenTekst(ms) {
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 60) return `${min} min`;
  return `${Math.round(min / 60)}u`;
}

// Maanop-/ondergang (backend/sources/moon.js) komt als een ECHTE, volledige
// ISO-tijdstempel terug (new Date(...).toISOString(), met correcte
// UTC-informatie) — dus NIET hetzelfde geval als tijdUitIso hierboven
// (Open-Meteo's offset-loze "lokale wandklok"-strings, waar slicen de enige
// juiste aanpak is). Hier kan een gewone new Date() + getHours()/getMinutes()
// gebruikt worden — die geven automatisch de tijd in de tijdzone van het
// toestel (Lex' iPhone), precies wat we willen.
function tijdUitDatum(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Geometrie van de dagboog-SVG (zie index.html: viewBox 0 0 300 60 — was
// 0 0 300 108, toen 0 0 300 80, op 2026-08-20 nogmaals verkleind op Lex'
// verzoek om de kaart zo groot mogelijk te maken) — één plek om cx/cy/rx/ry
// te definiëren, zodat de marker-positieberekening hieronder niet los van de
// <path>-tekening in de SVG zelf kan raken. Het is een ELLIPSBOOG (rx ≠ ry),
// geen cirkelboog: bij rx=136 (volle breedte) zou een cirkelboog een
// 136px-hoge top geven, ver buiten de viewBox.
const ZON_BOOG = { cx: 150, cy: 52.5, rx: 136, ry: 42.75 };

function renderZonMaan(signalenPerCategorie) {
  const weer = (signalenPerCategorie['algemeen-weer'] ?? []).find((s) => s.id === 'openmeteo-nu');
  const maan = (signalenPerCategorie['hemel'] ?? []).find((s) => s.id.startsWith('moon'));
  // 2026-08-22: zelfde rubriek-scoping als renderWeer hierboven — alleen
  // zichtbaar op de Maan-rubriek van de Hemel-tab.
  if (!weer && !maan) {
    ZONMAAN_KAART_EL.style.display = 'none';
    return;
  }
  if (actieveSkyRubriek !== 'maan') {
    ZONMAAN_KAART_EL.style.display = 'none';
    return;
  }
  ZONMAAN_KAART_EL.style.display = 'block';
  ZM_OP_EL.textContent = tijdUitIso(weer?.detail?.zonsopkomst);
  ZM_ONDER_EL.textContent = tijdUitIso(weer?.detail?.zonsondergang);

  // ---- Zon-marker op de dagboog + status ("nog Xu tot zonsondergang" etc.) ----
  const nu = new Date();
  const opkomst = tijdVandaagUitIso(weer?.detail?.zonsopkomst);
  const ondergang = tijdVandaagUitIso(weer?.detail?.zonsondergang);
  if (opkomst && ondergang && ondergang > opkomst) {
    const voortgang = (nu - opkomst) / (ondergang - opkomst);
    if (voortgang >= 0 && voortgang <= 1) {
      // Overdag: marker langs de boog, van links (π, zonsopkomst) naar rechts
      // (0, zonsondergang) — zie ZON_BOOG hierboven voor de geometrie.
      const hoek = Math.PI * (1 - voortgang);
      const x = ZON_BOOG.cx + ZON_BOOG.rx * Math.cos(hoek);
      const y = ZON_BOOG.cy - ZON_BOOG.ry * Math.sin(hoek);
      [ZON_MARKER_EL, ZON_MARKER_GLOED_EL].forEach((el) => {
        el.setAttribute('cx', x);
        el.setAttribute('cy', y);
        el.style.display = '';
      });
      ZM_STATUS_EL.textContent = `☀️ nog ${minutenTekst(ondergang - nu)} tot zonsondergang`;
    } else {
      [ZON_MARKER_EL, ZON_MARKER_GLOED_EL].forEach((el) => (el.style.display = 'none'));
      // Nacht: als we al voorbij de zonsondergang van vandaag zijn, is de
      // eerstvolgende zonsopkomst morgen — bij gebrek aan morgen-data
      // (Open-Meteo's daily-array pakt hier alleen index 0, vandaag) een
      // benadering met dezelfde opkomsttijd + 1 dag i.p.v. een tweede
      // API-veld erbij te halen voor een paar minuten extra precisie.
      const volgendeOpkomst = nu > ondergang ? new Date(opkomst.getTime() + 86400000) : opkomst;
      ZM_STATUS_EL.textContent = `🌙 nog ${minutenTekst(volgendeOpkomst - nu)} tot zonsopkomst`;
    }
  } else {
    [ZON_MARKER_EL, ZON_MARKER_GLOED_EL].forEach((el) => (el.style.display = 'none'));
    ZM_STATUS_EL.textContent = '—';
  }

  // ---- Maanop-/ondergangtijden — de rest (illustratie/fase/aftelling)
  // staat nu op de Hemel-tab, zie maanKaartVoorHemel() hierboven. ----
  ZM_MAAN_OP_EL.textContent = maan ? tijdUitDatum(maan.detail?.maanOpIso) : '—';
  ZM_MAAN_ONDER_EL.textContent = maan ? tijdUitDatum(maan.detail?.maanOnderIso) : '—';
}

// 2026-08-19: hier stond een "N actief"-samenvatting met chips per
// categorie (renderActieveSignalen) — op Lex' verzoek weer weggehaald: de
// optelling liep in de honderden (bijv. bij veel kleine aardbevingen
// tegelijk) en de losse chips dupliceerden gewoon de Meldingen-lijst zonder
// extra waarde toe te voegen. HTML-blok en CSS zijn om diezelfde reden ook
// verwijderd (index.html / styles.css).

// ---- Tornado-alarm — volledig-scherm rode gloedflits + pop-up + geluid +
// trilling, zodra er een NIEUW tornado-gerelateerd signaal verschijnt (op
// verzoek van Lex: "notificatie zodra er een watch en een tornado ontstaan",
// later uitgebreid met bevestigde touchdowns + severe-outlook: "Ja die
// moeten er absoluut ook komen"). Was lange tijd exact dezelfde set als
// DOPPLER_CATEGORIEEN hierboven — bewust niet breder dan tornado-gerelateerd,
// niet elke hazard in de app.
// 2026-08-20, op verzoek van Lex ("straks alleen nog bij Tornado's en
// weeralarm") — 'weerwaarschuwing' (NL code oranje/rood, zie meteoalarm.js)
// erbij als tweede, losstaande trigger. Nu een eigen Set i.p.v. letterlijk
// DOPPLER_CATEGORIEEN, want een Doppler-radarknop heeft geen betekenis bij
// een NL-weeralarm.
// 2026-08-21, op verzoek van Lex ("de tsunami moet er sowieso bij, beiden")
// — Tsunami Warning én Tsunami Watch zaten al in dezelfde NWS-bron als de
// tornado's, maar waren nooit aan deze lijst toegevoegd. Zelfde reden als
// bij weerwaarschuwing: geen Doppler-relevantie, dus niet in
// DOPPLER_CATEGORIEEN, wel hier.
const ALARM_CATEGORIEEN = new Set([...DOPPLER_CATEGORIEEN, 'weerwaarschuwing', 'tsunami', 'tsunami-watch']);

// 2026-08-21, op verzoek van Lex ("ik wil een knop waarmee ik de alarmen
// zelf kan aan- en uitzetten... voor elke categorie een aan/uit switch") —
// welke van de ALARM_CATEGORIEEN daadwerkelijk alarmeren is nu een instelling
// i.p.v. altijd-aan. Label + volgorde staan hier centraal (de Instellingen-
// tab rendert er alleen knoppen voor, zie renderAlarmInstellingen()); een
// categorie die hier ontbreekt kan sowieso nooit alarmeren (magAlarmeren()
// checkt ook ALARM_CATEGORIEEN zelf), dus geen aparte "afgevinkt maar niet
// in de UI"-toestand mogelijk.
const ALARM_CATEGORIE_DEFINITIES = [
  { id: 'tornado', label: 'Tornado Warning' },
  { id: 'tornado-watch', label: 'Tornado Watch' },
  { id: 'tornado-bevestigd', label: 'Tornado bevestigd' },
  { id: 'severe-outlook', label: 'Severe Outlook' },
  { id: 'tsunami', label: 'Tsunami Warning' },
  { id: 'tsunami-watch', label: 'Tsunami Watch' },
  { id: 'weerwaarschuwing', label: 'Weeralarm (oranje/rood)' },
];

// Client-side voorkeur (per toestel/browser) — geen serverinstelling, dit is
// puur "welk alarmscherm wil ík op déze telefoon zien". Ontbrekende sleutel
// = AAN, zodat het bestaande gedrag (alles alarmeert) niet verandert voor
// wie nooit iets omzet; alleen expliciet op false gezette categorieën staan
// uit. try/catch omdat localStorage in een enkel geval kan falen (privé-
// venster/uitgeschakelde site-data) — dan gedraagt de app zich gewoon als
// "alles staat aan", nooit een crash.
const ALARM_INSTELLINGEN_KEY = 'weerAlarmInstellingen';

function laadAlarmInstellingen() {
  try {
    const ruw = localStorage.getItem(ALARM_INSTELLINGEN_KEY);
    return ruw ? JSON.parse(ruw) : {};
  } catch {
    return {};
  }
}

let alarmInstellingen = laadAlarmInstellingen();

function alarmCategorieAan(categorieId) {
  return alarmInstellingen[categorieId] !== false;
}

function zetAlarmCategorie(categorieId, aan) {
  alarmInstellingen = { ...alarmInstellingen, [categorieId]: aan };
  try {
    localStorage.setItem(ALARM_INSTELLINGEN_KEY, JSON.stringify(alarmInstellingen));
  } catch (err) {
    console.warn('[weer] alarm-instelling opslaan mislukt (blijft wel actief voor deze sessie):', err);
  }
}

// 2026-08-21-fix, op verzoek van Lex ("wil je deze alarmopties onder een
// knop Alarmen zetten, zodra ik daarop klik zie ik bovenaan de lijst de
// subtekst... en daaronder alle items") — de sectie staat nu standaard
// dicht; alleen de knop zelf is zichtbaar tot je erop tikt. Zelfde
// uitklap-idioom (booleaanse vlag + pijltje dat omdraait) als
// uitgeklapteRuimteGroepen bij de Hemel-tab, hier een simpele boolean i.p.v.
// een Set omdat dit één sectie is, geen meerdere losse groepen.
let alarmSectieUitgeklapt = false;

function renderAlarmInstellingen() {
  if (ALARM_SECTIE_PIJL_EL) ALARM_SECTIE_PIJL_EL.textContent = alarmSectieUitgeklapt ? '▾' : '▸';
  if (!ALARM_INSTELLINGEN_LIJST_EL) return;
  ALARM_INSTELLINGEN_LIJST_EL.style.display = alarmSectieUitgeklapt ? '' : 'none';
  ALARM_INSTELLINGEN_LIJST_EL.innerHTML = '';
  if (!alarmSectieUitgeklapt) return;

  const uitleg = document.createElement('div');
  uitleg.className = 'instellingen-uitleg';
  uitleg.textContent = 'Dit toont of verbergt het rode alarmscherm.';
  ALARM_INSTELLINGEN_LIJST_EL.appendChild(uitleg);

  ALARM_CATEGORIE_DEFINITIES.forEach((def) => {
    const aan = alarmCategorieAan(def.id);
    const rij = document.createElement('div');
    rij.className = 'instelling-item';
    const label = document.createElement('span');
    label.textContent = def.label;
    const knop = document.createElement('button');
    knop.type = 'button';
    knop.className = `alarm-toggle${aan ? ' aan' : ''}`;
    knop.textContent = aan ? 'AAN' : 'UIT';
    knop.addEventListener('click', () => {
      zetAlarmCategorie(def.id, !aan);
      renderAlarmInstellingen();
    });
    rij.appendChild(label);
    rij.appendChild(knop);
    ALARM_INSTELLINGEN_LIJST_EL.appendChild(rij);
  });
}

ALARM_SECTIE_KNOP_EL?.addEventListener('click', () => {
  alarmSectieUitgeklapt = !alarmSectieUitgeklapt;
  renderAlarmInstellingen();
});

// 2026-08-22, op verzoek van Lex — Web Push (zie backend/src/sources/
// webpush.js) als derde, rustige (niet-herhalende) alarmkanaal naast
// Pushover, specifiek omdat hij Pushover's herhalende prioriteit-2-
// meldingen storend vindt. Standaard geïmplementeerde VAPID-conversiehelper
// (applicationServerKey moet een Uint8Array zijn, de server geeft 'm als
// base64url-string terug via /api/config).
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const ruw = window.atob(base64);
  const output = new Uint8Array(ruw.length);
  for (let i = 0; i < ruw.length; i++) output[i] = ruw.charCodeAt(i);
  return output;
}

// iOS ondersteunt Web Push alleen als de PWA via Safari's "Zet op
// beginscherm" geïnstalleerd is (iOS 16.4+) — een gewone Safari-tab (ook met
// toestemming) krijgt nooit meldingen, en faalt daar stil op zonder duidelijke
// foutmelding. navigator.standalone is de iOS-specifieke check, de
// media-query is de generieke (Android/desktop) variant.
function isPwaGeinstalleerd() {
  return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

function renderMeldingenStatus(tekst) {
  if (!MELDINGEN_STATUS_EL) return;
  if (!tekst) {
    MELDINGEN_STATUS_EL.style.display = 'none';
    MELDINGEN_STATUS_EL.innerHTML = '';
    return;
  }
  MELDINGEN_STATUS_EL.style.display = '';
  MELDINGEN_STATUS_EL.innerHTML = '';
  const regel = document.createElement('div');
  regel.className = 'instellingen-uitleg';
  regel.textContent = tekst;
  MELDINGEN_STATUS_EL.appendChild(regel);
}

async function huidigAbonnement() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  const registratie = await navigator.serviceWorker.ready;
  return registratie.pushManager.getSubscription();
}

// Ververst alleen de knoptekst — geen aparte statusregel als alles al in
// orde is, die is er puur voor uitleg bij problemen/tussenstappen.
async function verversMeldingenKnop() {
  if (!MELDINGEN_KNOP_EL) return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    MELDINGEN_KNOP_EL.querySelector('span').textContent = '🔔 Meldingen niet ondersteund';
    MELDINGEN_KNOP_EL.disabled = true;
    return;
  }
  try {
    const abonnement = await huidigAbonnement();
    // 2026-08-22, op verzoek van Lex ("een aan/uit-knop, per device") — de
    // knoptekst is nu de ACTIE die een tik uitvoert (niet de huidige status),
    // zodat "wat gebeurt er als ik hierop tik" altijd meteen duidelijk is.
    MELDINGEN_KNOP_EL.querySelector('span').textContent = abonnement
      ? '🔔 Meldingen uitzetten'
      : '🔔 Meldingen aanzetten';
  } catch {
    // stil laten — knop houdt gewoon de standaardtekst
  }
}

async function abonneerOpMeldingen() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    renderMeldingenStatus('Deze browser ondersteunt geen pushmeldingen.');
    return;
  }
  if (!isPwaGeinstalleerd()) {
    renderMeldingenStatus(
      'Zet de app eerst op je beginscherm (Safari: deelknop → "Zet op beginscherm"), open de app daarna vanaf dat beginscherm-icoon en probeer het opnieuw — in een gewone browsertab werkt dit op iPhone niet.',
    );
    return;
  }
  if (!THUIS?.vapidPublicKey) {
    renderMeldingenStatus('Meldingen zijn nog niet ingesteld op de server (VAPID-sleutel ontbreekt).');
    return;
  }
  try {
    const toestemming = await Notification.requestPermission();
    if (toestemming !== 'granted') {
      renderMeldingenStatus('Geen toestemming gegeven — je kunt dit later opnieuw proberen via je iOS-instellingen.');
      return;
    }
    const registratie = await navigator.serviceWorker.ready;
    // 2026-08-22-debug: een bestaand abonnement eerst opruimen vóór opnieuw
    // aanmelden. Reden: als er ooit een abonnement is aangemaakt met een
    // ANDERE VAPID-sleutel dan nu in .env staat (bijv. na het opnieuw
    // genereren van een sleutelpaar), levert pushManager.subscribe() op
    // sommige browsers (o.a. Safari/iOS) gewoon stilzwijgend het oude
    // abonnement terug i.p.v. een foutmelding te geven — en dat oude
    // abonnement blijft dan altijd mislukken met "BadAuthorizationHeader"
    // zodra de server ermee probeert te versturen. Expliciet unsubscriben
    // voorkomt dat, ook bij een volgende sleutelwissel in de toekomst.
    const bestaand = await registratie.pushManager.getSubscription();
    if (bestaand) await bestaand.unsubscribe();
    const abonnement = await registratie.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(THUIS.vapidPublicKey),
    });
    const resp = await fetch('/api/push/abonneren', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(abonnement),
    });
    if (!resp.ok) throw new Error(`server antwoordde ${resp.status}`);
    renderMeldingenStatus('Meldingen staan nu aan.');
    verversMeldingenKnop();
  } catch (err) {
    console.warn('[weer] meldingen aanzetten mislukt:', err);
    renderMeldingenStatus(`Meldingen aanzetten is mislukt: ${err.message}`);
  }
}

// 2026-08-22, op verzoek van Lex — netjes afmelden bij de server (niet
// alleen lokaal de browser-toestemming intrekken), zodat een uitgezet
// abonnement ook echt uit pushAbonnementen.json verdwijnt i.p.v. dat de
// server 'm bij een volgend alarm alsnog (vergeefs) blijft proberen.
async function afmeldenVoorMeldingen() {
  try {
    const registratie = await navigator.serviceWorker.ready;
    const abonnement = await registratie.pushManager.getSubscription();
    if (abonnement) {
      const eindpunt = abonnement.endpoint;
      await abonnement.unsubscribe();
      // Best-effort: ook als de server nu even niet bereikbaar is, is de
      // browser sowieso al afgemeld — dan blijft alleen een dood abonnement
      // achter op de server, dat ruimt zichzelf vanzelf op bij de eerst-
      // volgende mislukte verstuurpoging (zie 404/410-afhandeling hierboven
      // in webpush.js).
      await fetch('/api/push/afmelden', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: eindpunt }),
      }).catch(() => {});
    }
    renderMeldingenStatus('Meldingen staan nu uit.');
  } catch (err) {
    console.warn('[weer] meldingen afmelden mislukt:', err);
    renderMeldingenStatus(`Meldingen uitzetten is mislukt: ${err.message}`);
  } finally {
    verversMeldingenKnop();
  }
}

// De knop is nu een echte aan/uit-toggle: staat er al een abonnement, dan
// zet een tik 'm uit; anders zet 'm aan. verversMeldingenKnop() (hierboven)
// zorgt dat de knoptekst altijd de eerstvolgende actie beschrijft.
MELDINGEN_KNOP_EL?.addEventListener('click', async () => {
  const bestaand = await huidigAbonnement();
  if (bestaand) {
    await afmeldenVoorMeldingen();
  } else {
    await abonneerOpMeldingen();
  }
});

// Weeralarm alarmeert alleen bij oranje/rood, niet bij geel — zelfde grens
// als het Pushover/mail-alarm in meteoalarm.js hanteert ("geel is te vaak/
// te mild voor een telefoonalarm"); dit volledig-scherm alarm is minstens zo
// opdringerig, dus dezelfde grens. Die grens staat los van de aan/uit-knop
// hierboven: geel alarmeert nooit, wat de knop ook zegt.
function magAlarmeren(s) {
  if (!ALARM_CATEGORIEEN.has(s.categorie) || s.detail?.verlopen) return false;
  if (!alarmCategorieAan(s.categorie)) return false; // door Lex zelf uitgezet in Instellingen
  if (s.categorie === 'weerwaarschuwing') return s.detail?.kleur === 'oranje' || s.detail?.kleur === 'rood';
  return true;
}

// null = nog niet geïnitialiseerd. Bij de eerste `verversen()` na het laden
// van de app worden de dan al actieve tornado/watch-signalen alleen
// geregistreerd, niet gealarmeerd — anders zou de app bij elke keer openen
// meteen voluit alarmeren voor iets dat allang actief was vóór je 'm opende.
// Pas signalen die daarna verschijnen (nieuwe id's) triggeren het alarm —
// dat is wat "ontstaan" hier betekent.
let gezienAlarmIds = null;
let alarmWachtrij = [];
let alarmPopupOpen = false;
let huidigAlarmSignaal = null;
let audioCtx = null;

// 2026-08-20, bugfix na Lex' persistentietest ("ik kreeg het alarm meteen,
// dat snap ik niet") — deze filter miste tot nu toe `!s.detail?.verlopen`.
// Sinds historie.js een herstart overleeft (zie historie.js), kan een allang
// verlopen signaal bij een herstart voor het eerst binnenkomen bij een
// sessie die al open stond (en dus al een gevulde gezienAlarmIds had) — dat
// zag er voor deze functie precies zo uit als een gloednieuwe waarschuwing,
// met de volle rode-flits/geluid/trilling/pop-up-behandeling tot gevolg,
// terwijl het gewoon oude, allang-niet-meer-actuele historie was. Verlopen
// signalen horen sowieso nooit dit alarm te triggeren, ongeacht of ze net
// verlopen zijn of al 47 uur oud — vandaar hier volledig uitgesloten i.p.v.
// een tijdgevoelige uitzondering te bouwen.
function verwerkTornadoAlarm(signalen) {
  const relevant = signalen.filter(magAlarmeren);
  const huidigeIds = new Set(relevant.map((s) => s.id));
  if (gezienAlarmIds === null) {
    gezienAlarmIds = huidigeIds;
    return;
  }
  for (const s of relevant) {
    if (!gezienAlarmIds.has(s.id)) triggerTornadoAlarm(s);
  }
  gezienAlarmIds = huidigeIds;
}

function triggerTornadoAlarm(signal) {
  flitsAlarmGloed();
  laatAlarmGeluidHoren();
  trilAlarm();
  alarmWachtrij.push(signal);
  toonVolgendeAlarmPopup();
}

// CSS-klasse verwijderen-en-opnieuw-toevoegen (i.p.v. alleen toevoegen) forceert
// een reflow, zodat de animatie ook opnieuw start als er kort na elkaar twee
// nieuwe watches/warnings binnenkomen.
function flitsAlarmGloed() {
  ALARM_GLOED_EL.classList.remove('flits');
  void ALARM_GLOED_EL.offsetWidth;
  ALARM_GLOED_EL.classList.add('flits');
}

// Geen los geluidsbestand nodig — een korte drietonige "alarm"-piep,
// zelf opgebouwd met de Web Audio API (~1 seconde totaal). Safari/iOS staat
// geluid pas toe ná een echte gebruikersinteractie met de pagina; vandaar
// ontgrendelAudioContext() hieronder, die één keer op de eerste tik/klik
// ergens in de app een AudioContext klaarzet zodat een later, automatisch
// getriggerd alarm ook echt hoorbaar is.
function ontgrendelAudioContext() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try {
      audioCtx = new Ctx();
    } catch {
      return;
    }
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}
document.addEventListener('pointerdown', ontgrendelAudioContext, { once: true });

function laatAlarmGeluidHoren() {
  ontgrendelAudioContext();
  if (!audioCtx) return; // Web Audio niet beschikbaar, of nog niet ontgrendeld — stil falen, de gloed/pop-up blijven wel werken
  const nu = audioCtx.currentTime;
  const duurPerToon = 0.32;
  const tonen = [1046.5, 784, 1046.5]; // hoog-laag-hoog, herkenbaar als "alarm" i.p.v. een neutrale piep
  tonen.forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    const start = nu + i * duurPerToon;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
    gain.gain.linearRampToValueAtTime(0, start + duurPerToon - 0.02);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(start);
    osc.stop(start + duurPerToon);
  });
}

// Vibration API — werkt op Android/Chrome, bewust geen probleem dat iOS
// Safari 'm niet ondersteunt (Apple biedt 'm niet aan): navigator.vibrate
// ontbreekt dan simpelweg, en deze functie doet dan stil niets.
function trilAlarm() {
  if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]);
}

// Pop-up-wachtrij: als er kort na elkaar meerdere nieuwe watches/warnings
// binnenkomen, worden ze één voor één getoond i.p.v. elkaar te overschrijven.
function toonVolgendeAlarmPopup() {
  if (alarmPopupOpen || !alarmWachtrij.length) return;
  const signal = alarmWachtrij.shift();
  huidigAlarmSignaal = signal;
  alarmPopupOpen = true;
  ALARM_POPUP_ICOON_EL.textContent = EMOJI_PER_CATEGORIE[signal.categorie] ?? '⚠️';
  ALARM_POPUP_TITEL_EL.textContent = signal.titel;
  ALARM_POPUP_SUB_EL.textContent = signal.detail?.land ?? signal.detail?.subtitel ?? signal.detail?.gebied ?? '';
  ALARM_POPUP_EL.classList.remove('verborgen');
}

function sluitAlarmPopup() {
  ALARM_POPUP_EL.classList.add('verborgen');
  alarmPopupOpen = false;
  huidigAlarmSignaal = null;
  toonVolgendeAlarmPopup();
}

ALARM_POPUP_SLUIT_EL.addEventListener('click', sluitAlarmPopup);
ALARM_POPUP_BEKIJK_EL.addEventListener('click', () => {
  const signal = huidigAlarmSignaal;
  sluitAlarmPopup();
  if (signal) centreerOpMelding(signal);
});

// 2026-08-22, op verzoek van Lex ("klikken op de melding opent wel de app,
// maar niet de melding zelf") — een pushmelding linkt naar /?signaal=<id>
// (zie webpush.js/nws.js/meteoalarm.js); hier pakken we die query-parameter
// op en centreren de kaart op dat specifieke signaal zodra het in de
// /api/signals-lijst verschijnt. Het signaal kan de eerste keer nog net niet
// in de lijst staan (race met de eigen 20-sec-pollcyclus), dus een paar
// pogingen — daarna opgeven i.p.v. voor altijd te blijven zoeken (bijv. als
// het inmiddels alweer uit de historie is verdwenen).
let pendingDeepLinkSignaalId = new URLSearchParams(window.location.search).get('signaal');
let deepLinkPogingen = 0;

async function verversen() {
  try {
    const [signalenRes, statusRes] = await Promise.all([
      fetch('/api/signals').then((r) => r.json()),
      fetch('/api/status').then((r) => r.json()),
    ]);
    ERROR_EL.classList.remove('show');

    const perCategorie = {};
    for (const s of signalenRes.signalen) {
      (perCategorie[s.categorie] ??= []).push(s);
    }

    verwerkTornadoAlarm(signalenRes.signalen);
    renderMap(signalenRes.signalen);

    if (pendingDeepLinkSignaalId) {
      deepLinkPogingen += 1;
      const doelSignaal = signalenRes.signalen.find((s) => s.id === pendingDeepLinkSignaalId);
      if (doelSignaal) {
        centreerOpMelding(doelSignaal);
        pendingDeepLinkSignaalId = null;
        history.replaceState(null, '', window.location.pathname);
      } else if (deepLinkPogingen >= 6) {
        // ~2 minuten geprobeerd (6 x 20 sec) — waarschijnlijk een inmiddels
        // verdwenen signaal, niet voor altijd blijven zoeken.
        pendingDeepLinkSignaalId = null;
        history.replaceState(null, '', window.location.pathname);
      }
    }

    renderMeldingen(signalenRes.signalen);
    renderSky(perCategorie);
    renderWeer(perCategorie);
    renderZonMaan(perCategorie);
    pasHemelActiesZichtbaarheidAan();

    VERBINDING_EL.textContent = 'verbonden';
    BIJGEWERKT_EL.textContent = `Bijgewerkt: ${geledenTekst(Date.now())}`;
  } catch (err) {
    VERBINDING_EL.textContent = 'geen verbinding';
    ERROR_EL.textContent = `Kan de aggregator-service niet bereiken: ${err.message}`;
    ERROR_EL.classList.add('show');
  }
}

async function laadConfig() {
  try {
    THUIS = await fetch('/api/config').then((r) => r.json());
    LOC_NAAM_EL.textContent = THUIS.homeLabel;
    INST_LOCATIE_EL.textContent = `${THUIS.homeLabel} (${THUIS.homeLat.toFixed(4)}, ${THUIS.homeLon.toFixed(4)})`;
  } catch {
    LOC_NAAM_EL.textContent = 'Onbekende locatie';
  }
  initMap();
}

updateKlok();
setInterval(updateKlok, 15000);
laadConfig().then(verversen);
laadRadarstations();
setInterval(verversen, 20000);
renderAlarmInstellingen(); // eenmalig — hangt alleen van localStorage af, niet van live signalen

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () =>
    navigator.serviceWorker
      .register('/sw.js')
      .then(() => verversMeldingenKnop())
      .catch(() => {}),
  );
  // 2026-08-22, op verzoek van Lex ("klikken op de melding opent wel de app,
  // maar niet de melding zelf") — sw.js (notificationclick) stuurt dit
  // berichtje naar een al-open app-venster i.p.v. te navigeren (dat bleek op
  // iOS niet betrouwbaar), zodat we hier gewoon dezelfde deep-link-aanpak als
  // bij een verse paginaload kunnen hergebruiken: pendingDeepLinkSignaalId
  // zetten en direct verversen() aanroepen (niet wachten op de eerstvolgende
  // 20-sec-pollcyclus).
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'open-signaal' && event.data.id) {
      pendingDeepLinkSignaalId = event.data.id;
      deepLinkPogingen = 0;
      verversen();
    }
  });
}
verversMeldingenKnop(); // eenmalig meteen ook al proberen (voor als de service worker al actief was)
