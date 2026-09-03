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
const TOGGLE_FRONTEN_EL = document.getElementById('toggleFronten'); // 2026-08-30, zie toggleFronten()
const TOGGLE_GRADEN_EL = document.getElementById('toggleGraden'); // 2026-08-30, zie toggleGradenGrid()
const FRONTEN_INFO_EL = document.getElementById('frontenInfo');
const TOGGLE_DWD_KAART_EL = document.getElementById('toggleDwdKaart'); // 2026-08-30, zie openDwdKaart()
const DWD_KAART_OVERLAY_EL = document.getElementById('dwdKaartOverlay');
const DWD_KAART_IMG_EL = document.getElementById('dwdKaartImg');
const DWD_KAART_STATUS_EL = document.getElementById('dwdKaartStatus');
// 2026-09-02: vervangt de losse #toggleVaarradar-knop -- #vaarMenuHandle in
// het nieuwe verticale AIS-menu (zie index.html) is nu zowel de aan/uit-knop
// als de uitklap-knop, zie toggleVaarradar() hieronder.
const TOGGLE_VAARRADAR_EL = document.getElementById('vaarMenuHandle');
const VAAR_MENU_INHOUD_EL = document.getElementById('vaarMenuInhoud');
const VAAR_UIT_KNOP_EL = document.getElementById('vaarUitKnop');
const VAAR_KLEUR_KNOP_EL = document.getElementById('vaarKleurModus');
const VAAR_AISHUB_KNOP_EL = document.getElementById('vaarAishubToggle');
const VAAR_BOEIEN_KNOP_EL = document.getElementById('vaarBoeienToggle');
const VAAR_STRAAL_KNOP_EL = document.getElementById('vaarStraalKnop');
const VAAR_TYPE_FILTER_PANEEL_EL = document.getElementById('vaarTypeFilterPaneel');
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
const NAVTEX_UITLEG_KNOP_EL = document.getElementById('navtexUitlegKnop');
const NAVTEX_UITLEG_PIJL_EL = document.getElementById('navtexUitlegPijl');
const NAVTEX_UITLEG_LIJST_EL = document.getElementById('navtexUitlegLijst');
// 2026-08-27: ruwe-NAVTEX-ontvangst-viewer (tail -f van ~/navtex_berichten.txt
// via /api/navtex-ruw) — zie openNavtexRuw() verderop.
const NAVTEX_RUW_KNOP_EL = document.getElementById('toggleNavtexRuw');
const NAVTEX_RUW_OVERLAY_EL = document.getElementById('navtexRuwOverlay');
const NAVTEX_RUW_STATUS_EL = document.getElementById('navtexRuwStatus');
const NAVTEX_RUW_INHOUD_EL = document.getElementById('navtexRuwInhoud');
const NAVTEX_RUW_TEKST_EL = document.getElementById('navtexRuwTekst');
const NAVTEX_RUW_SLUITEN_EL = document.getElementById('navtexRuwSluiten');
// 2026-08-27: "volgende uitzending"-plaatje rechtsboven op de zeekaart +
// AUTO-schakelknop — zie ververNavtexVolgende() verderop.
const NAVTEX_VOLGENDE_EL = document.getElementById('navtexVolgendeUitzending');
const NAVTEX_VOLGENDE_TEKST_EL = document.getElementById('navtexVolgendeTekst');
const NAVTEX_AUTO_KNOP_EL = document.getElementById('navtexAutoKnop');
// 2026-08-28: DX-lijst (bijzondere verre ontvangst) onder het plaatje —
// zie dxLijst()/renderNavtexDx() verderop.
const NAVTEX_DX_KNOP_EL = document.getElementById('navtexDxKnop');
const NAVTEX_DX_PANEEL_EL = document.getElementById('navtexDxPaneel');
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

// 2026-08-26-fix, op melding van Lex ("de pil bij de navtexberichten geeft
// AM/PM tijden dat moet 24h zijn"): 'nl-NL' als locale is kennelijk niet
// genoeg om altijd een 24-uursklok af te dwingen (op zijn toestel gaf het
// AM/PM) -- overal waar toLocaleTimeString hieronder gebruikt wordt nu
// expliciet hour12: false erbij, niet alleen hier.
function updateKlok() {
  KLOK_EL.textContent = new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', hour12: false });
  // 2026-08-27: het "volgende NAVTEX-uitzending"-plaatje op de zeekaart lift
  // mee op ditzelfde 15s-ritme — puur rekenwerk op al opgehaalde
  // zendschema's, geen netwerkverkeer (zie ververNavtexVolgende()).
  ververNavtexVolgende();
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
  const tijd = d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', hour12: false });
  const vandaag = d.toDateString() === new Date().toDateString();
  if (vandaag) return tijd;
  const datum = d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
  return `${datum} ${tijd}`;
}

// 2026-09-02, op verzoek van Lex ("dat ook zo maken op de kaartjes in de
// app") -- zelfde tijdzone-verrijking als backend/src/sources/email.js
// (verrijkTekstMetTijdzones), maar dan front-end en zonder UTC: NWS-titels
// bevatten de lokale Amerikaanse tijd ("... issued August 27 at 8:24PM EDT
// until ..."), hier komt daar meteen de Amsterdamse tijd achter, geen UTC
// ertussenin (net als de mail sinds vandaag). Losse duplicate van dezelfde
// tabellen/regex i.p.v. gedeeld bestand -- dit project heeft geen
// frontend/backend-buildstap die modules tussen de twee kan delen (losse
// <script>, geen bundler), zie ook de "dependency-loos"-keuze elders.
const TZ_OFFSET_UREN_FE = {
  EDT: -4, EST: -5, CDT: -5, CST: -6, MDT: -6, MST: -7, PDT: -7, PST: -8,
  AKDT: -8, AKST: -9, HDT: -9, HST: -10, AST: -4, ADT: -3, SST: -11, CHST: 10,
  GMT: 0, UTC: 0,
};
const MAAND_INDEX_FE = {
  JANUARY: 0, FEBRUARY: 1, MARCH: 2, APRIL: 3, MAY: 4, JUNE: 5,
  JULY: 6, AUGUST: 7, SEPTEMBER: 8, OCTOBER: 9, NOVEMBER: 10, DECEMBER: 11,
};
const TIJD_REGEX_FE = new RegExp(
  `\\b(${Object.keys(MAAND_INDEX_FE).join('|')})\\s+(\\d{1,2})\\s+at\\s+(\\d{1,2}):(\\d{2})\\s*(AM|PM)\\s+(${Object.keys(TZ_OFFSET_UREN_FE).join('|')})\\b`,
  'gi',
);

// Zelfde jaarwisseling-afhandeling als backend (geen jaartal in de
// brontekst, dus het jaar kiezen dat de datum het dichtst bij nu legt).
function verrijkTekstMetNlTijd(tekst) {
  if (typeof tekst !== 'string') return tekst;
  TIJD_REGEX_FE.lastIndex = 0;
  let uit = '';
  let vorige = 0;
  let m;
  while ((m = TIJD_REGEX_FE.exec(tekst)) !== null) {
    const maand = MAAND_INDEX_FE[m[1].toUpperCase()];
    const dag = Number(m[2]);
    let uur = Number(m[3]) % 12;
    if (m[5].toUpperCase() === 'PM') uur += 12;
    const minuut = Number(m[4]);
    const offset = TZ_OFFSET_UREN_FE[m[6].toUpperCase()];
    const eind = m.index + m[0].length;
    if (maand == null || offset == null) {
      uit += tekst.slice(vorige, eind);
      vorige = eind;
      continue;
    }
    const nu = Date.now();
    let utcMs = Date.UTC(new Date().getUTCFullYear(), maand, dag, uur, minuut) - offset * 3600e3;
    const halfJaar = 183 * 24 * 3600e3;
    if (utcMs - nu > halfJaar) utcMs -= 365 * 24 * 3600e3;
    else if (nu - utcMs > halfJaar) utcMs += 365 * 24 * 3600e3;
    const nl = new Date(utcMs)
      .toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
      .replace(',', '');
    uit += tekst.slice(vorige, eind) + ` (${nl} NL)`;
    vorige = eind;
  }
  return uit + tekst.slice(vorige);
}

// 2026-09-02, op verzoek van Lex ("kan je de NL tijden hier een ander
// kleurtje geven?"): het door verrijkTekstMetNlTijd() toegevoegde
// "(2 sep 14:57 NL)" in een eigen span zetten, PAS bij het renderen (niet in
// s.titel zelf, want die wordt ook als platte tekst gebruikt, bijv. in de
// alarm-popup via textContent). Zie .nl-tijd in styles.css.
// 2026-09-02-vervolg ("kan je ook de NL-tijden begin en eind een aparte
// regel geven"): de "(.. NL)"-stukjes uit de titel halen en als eigen regel
// eronder zetten -- "NL: 2 sep 14:57 – 3 sep 05:00" (bij één tijd alleen
// die ene). De Amerikaanse brontekst blijft ongewijzigd staan.
function markeerNlTijd(html) {
  if (typeof html !== 'string') return html;
  const tijden = [];
  const zonder = html.replace(/\s*\((\d{1,2} [a-z]{3}\.? \d{2}:\d{2}) NL\)/g, (_, t) => {
    tijden.push(t);
    return '';
  });
  if (!tijden.length) return html;
  const regel = tijden.length >= 2 ? `${tijden[0]} – ${tijden[tijden.length - 1]}` : tijden[0];
  return `${zonder}<div class="nl-tijd">NL: ${regel}</div>`;
}

// Muteert s.titel (in place) voor elk signaal dat een NWS-achtige tijd
// bevat -- op één centrale plek aangeroepen (verversen() hieronder) zodat
// elk kaartje/popup dat s.titel toont (Meldingen-lijst, kaart-popup,
// schermvullende overlay, alarm-popup) de verrijking automatisch meekrijgt,
// zonder elke renderplek los aan te passen.
function verrijkSignalenMetNlTijd(signalen) {
  for (const s of signalen) {
    if (typeof s.titel === 'string') s.titel = verrijkTekstMetNlTijd(s.titel);
  }
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
  const tijd = d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', hour12: false });
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
  // 2026-08-27-fix, zelfde patroon als bij centreerOpMelding() (zie fix
  // aldaar): wisselView() hierboven stelt zijn eigen kaart.invalidateSize()
  // bewust een tik uit (setTimeout(...,0)), maar kaart.setView() hieronder
  // draaide daarvóór -- dus op de OUDE, mogelijk te kleine containermaat van
  // vóór de tabwissel. Resultaat (op melding van Lex): na op "Kaart"/Home
  // drukken eerst maar een klein stukje kaart zichtbaar. Fix: ook dit een
  // tik uitstellen, zodat het pas draait NADAT de containermaat al gecorrigeerd is.
  setTimeout(() => {
    if (kaart) {
      // 2026-08-27, iPad-freeze-analyse (observatie van Lex: vanuit Tropische
      // Storm Lala werkt de Kaart-knop meteen vlekkeloos, vanuit een
      // Weeralarm-gebied duurt het consequent 15-16s): het verschil is de
      // afstand — bij Lala (halve wereld weg) slaat Leaflet de pan/zoom-
      // animatie vanzelf over ("teleport"), bij een NL-gebied vlakbij huis
      // animeert hij wél, en juist die geanimeerde transform over de
      // gefilterde tegellaag is zwaar op de iPad. animate:false maakt de
      // Home-reset altijd een directe teleport — precies het pad dat
      // aantoonbaar wél soepel werkt.
      kaart.setView([THUIS.homeLat, THUIS.homeLon], 6, { animate: false });
      dwingRegenradarZoomAf(); // zie definitie verderop in dit bestand — Home negeerde deze vloer tot nu toe
    }
  }, 0);
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
// 2026-09-02: basiskaart-tegellaag + de donkere Stadia-variant die tijdens
// Vaart/AIS-modus ervoor in de plaats komt (zie toggleVaarradar()).
let basisKaartLaag = null;
let donkereKaartLaag = null;
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
  // 2026-08-19: tsunami (destijds VS-only via NWS; sinds 2026-08-27 ook
  // wereldwijd via PTWC/tsunami.gov en GDACS TS-events, zie backend
  // sources/ptwc.js en gdacs.js — zelfde twee categorieën) — geen apart
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
  // 2026-08-26, op verzoek van Lex — Maeslant-/Hartelkering, zie
  // backend/src/sources/stormvloedkering.js. 🚧 voor de vroege
  // waarschuwing (kans op sluiting, nog niet bevestigd), 🔒 voor de
  // nieuws-bevestigde daadwerkelijke sluiting — bewust een ander icoon
  // zodat het verschil ook op de kaart meteen duidelijk is.
  'stormvloedkering-waarschuwing': '🚧',
  'stormvloedkering-gesloten': '🔒',
  // 2026-09-03, op verzoek van Lex — AIS-noodsignalen (SART/MOB/EPIRB, status 14),
  // zie backend/src/sources/aisNood.js.
  'ais-nood': '🆘',
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
  'stormvloedkering-waarschuwing': 'Kans op sluiting stormvloedkering',
  'stormvloedkering-gesloten': 'Stormvloedkering gesloten',
  'ais-nood': 'AIS-noodsignaal',
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

// 2026-08-30, op verzoek van Lex ("de teller loopt flink op door de
// navtexberichten en de aardbevingen") — LOS van de Meldingen-lijst zelf
// (die blijft alles tonen, niets wordt hier weggefilterd): dit bepaalt
// alleen hoever de teller op de Meldingen-knop (MELDINGEN_BADGE_EL)
// oploopt. Lex' eigen keuze na overleg:
// - aardbeving: pas vanaf M4.5 meetellen. USGS/EMSC leveren een
//   detail.magnitude; GDACS' aardbeving-vangnet (zie gdacs.js) heeft geen
//   magnitude-veld maar is al op Orange/Red (echte impact) gefilterd, dus
//   die tellen gewoon mee.
// - navtex: elke ontvangst blijft een eigen kaartje in de lijst (ook een
//   letterlijke herhaling), maar een bericht dat in de kern hetzelfde is
//   als eentje dat al meetelt (zelfde station + eventType + berichttekst)
//   verhoogt de teller niet nogmaals — NAVTEX-stations zenden dezelfde
//   waarschuwing standaard meerdere keren uit, telkens met een nieuw
//   volgnummer/tijdstip.
const AARDBEVING_TELLER_MIN_MAGNITUDE = 4.5;

function normaliseerNavtexTekstVoorTeller(tekst) {
  return (tekst ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

function navtexTellerSleutel(s) {
  const tekst = normaliseerNavtexTekstVoorTeller(s.detail?.bericht);
  return `${s.detail?.station ?? ''}|${s.detail?.eventType ?? ''}|${tekst}`;
}

// gezienNavtexSleutels wordt per renderMeldingen()-aanroep vers aangemaakt
// (zie hieronder) — dus telt een sleutel alleen binnen de nu actieve
// signalen mee, niet blijvend over herstarts/dagen heen.
function moetMeetellenVoorTeller(s, gezienNavtexSleutels) {
  if (s.categorie === 'aardbeving') {
    const mag = s.detail?.magnitude;
    return typeof mag !== 'number' || mag >= AARDBEVING_TELLER_MIN_MAGNITUDE;
  }
  if (s.categorie === 'navtex') {
    const sleutel = navtexTellerSleutel(s);
    if (gezienNavtexSleutels.has(sleutel)) return false;
    gezienNavtexSleutels.add(sleutel);
    return true;
  }
  return true;
}

function initMap() {
  kaart = L.map('map', { attributionControl: true, zoomControl: true, maxZoom: 18 }).setView([THUIS.homeLat, THUIS.homeLon], 6);

  // 2026-08-26-fix, op melding van Lex (blijvend zwart/afgesneden vlak
  // rechts op de kaart, tablet-breedte, meteen bij het openen -- geen
  // pinch/zoom nodig): L.map('map', ...) hierboven meet de containermaat op
  // het EXACTE moment van initMap() (aangeroepen zodra laadConfig()'s eigen
  // fetch klaar is, dus mogelijk vlak vóórdat de pagina een volledige
  // reflow/laatste stylesheet-toepassing heeft gehad). Als de tablet-only
  // fullscreen-kaart-CSS (@media (min-width:768px) body.kaart-actief in
  // styles.css) op dat moment nog niet volledig is toegepast, bakt Leaflet
  // een te kleine interne maat in -- de kaart-DIV zelf is dan wel al
  // edge-to-edge breed (CSS klopt), maar Leaflet tekent alleen tegels
  // binnen zijn eigen (te kleine) onthouden maat, en de rest van de
  // container blijft gewoon zijn eigen donkere achtergrondkleur tonen
  // (.map { background:#0c0f1a }) -- vandaar het zwarte vlak.
  // wisselView()'s eigen kaart.invalidateSize() (verderop in dit bestand)
  // vangt dit alleen bij een latere tabwissel NAAR Kaart, niet bij de
  // eerste keer laden terwijl je al op de kaarttab staat (de standaardstand,
  // en precies Lex' geval). Een ResizeObserver op de kaartcontainer zelf is
  // hier het robuustere structurele antwoord: die meldt zich bij ELKE
  // daadwerkelijke afmetingswijziging (initiële layout, lettertype-reflow,
  // rotatie, iPad-split-view), niet alleen het ene moment waarop
  // wisselView() toevallig oplet.
  new ResizeObserver(() => kaart.invalidateSize()).observe(document.getElementById('map'));

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
  // 2026-08-30: fronten-laag boven de zeekaart-tegels, onder de markers
  // (overlayPane = 400). Zie toggleFronten().
  kaart.createPane('frontenPane');
  kaart.getPane('frontenPane').style.zIndex = 360;
  // 2026-08-30: gradengrid boven de fronten, onder de markers. Zie
  // toggleGradenGrid(). Herstel de bewaarde voorkeur zodra de kaart er is.
  kaart.createPane('gradenPane');
  kaart.getPane('gradenPane').style.zIndex = 370;
  kaart.getPane('gradenPane').style.pointerEvents = 'none';
  kaart.on('moveend zoomend', () => { if (gradenActief) tekenGradenGrid(); });
  // 2026-08-30: isobaar-labels/H-L alleen vanaf ISOBAAR_LABEL_MIN_ZOOM, zie tekenIsobaren().
  kaart.on('zoomend', zetIsobaarLabelsZichtbaar);
  // 2026-09-02, op verzoek van Lex (zoom-gate voor vaarradar, zie
  // VAAR_MIN_ZOOM_VOOR_SCHEPEN hierboven) -- meteen reageren op een zoom-
  // wissel i.p.v. tot de eerstvolgende 3s-poll te wachten.
  kaart.on('zoomend', () => { if (vaarradarActief) ververVaarradar(); });
  kaart.on('moveend', () => { if (vaarradarActief) werkVaarTellingBij(); }); // 2026-09-03: telling in het AIS-menu volgt het kaartbeeld
  // 2026-08-30, op verzoek van Lex ("in welk gridvak de cursor is"): vak
  // onder de muis oplichten + uitlezen. Op touch geen hover, dus daar telt
  // een tik op de kaart als 'cursor'. Zie toonGradenVak().
  kaart.on('mousemove', (e) => { if (gradenActief) toonGradenVak(e.latlng); });
  kaart.on('mouseout', () => { if (gradenActief) verbergGradenVak(); });
  kaart.on('click', (e) => { if (gradenActief && window.matchMedia('(hover: none)').matches) toonGradenVak(e.latlng); });
  try { if (localStorage.getItem(GRADEN_KEY) === 'aan') toggleGradenGrid(); } catch (_) { /* privé-modus */ }

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
  basisKaartLaag = L.tileLayer('/api/tegel/{z}/{x}/{y}.png?v=osm1', {
    attribution: '© OpenStreetMap-auteurs',
    maxZoom: 19,
  }).addTo(kaart);

  // 2026-09-02, op verzoek van Lex ("Ik bedoel dit" -- twee MarineTraffic-
  // screenshots): het bestaande donkere-modus-effect (CSS invert-filter over
  // de gewone OSM-tegels hierboven, zie styles.css) blijft altijd de volle
  // straatniveau-drukte van OSM tonen, alleen omgekleurd -- niet de vlakke,
  // rustige donkere kaartSTIJL die MarineTraffic zelf gebruikt (Leaflet +
  // Mapbox met een eigen donker ontwerp, te zien aan hun attributieregel).
  // Stadia Maps (gratis tier, geen creditcard, zie backend/.env
  // STADIAMAPS_API_KEY) is het alternatief dat Lex koos; stijl
  // "Alidade Smooth Dark" via de backend-proxy /api/tegel-donker/ (zelfde
  // cache-opzet als de OSM-proxy, zie server.js). Nog niet aan de kaart
  // toegevoegd hier -- toggleVaarradar() wisselt ernaartoe zodra Vaart/AIS-
  // modus aan gaat (en terug naar basisKaartLaag zodra hij weer uit gaat),
  // zodat de rest van de app (incl. de losstaande Zee/NAVTEX-stand) gewoon
  // de vertrouwde OSM-kaart + invert-filter blijft tonen.
  donkereKaartLaag = L.tileLayer('/api/tegel-donker/{z}/{x}/{y}.png?v=stadia1', {
    attribution: '© Stadia Maps, © OpenStreetMap-auteurs',
    maxZoom: 20,
  });

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
  if (TOGGLE_FRONTEN_EL) TOGGLE_FRONTEN_EL.addEventListener('click', toggleFronten);
  if (TOGGLE_GRADEN_EL) TOGGLE_GRADEN_EL.addEventListener('click', toggleGradenGrid);
  if (TOGGLE_DWD_KAART_EL) TOGGLE_DWD_KAART_EL.addEventListener('click', openDwdKaart);
  document.getElementById('dwdKaartSluiten')?.addEventListener('click', sluitDwdKaart);
  // Tik op de kaart: wisselen tussen passend en 100% (dan scrollen/pinchen).
  DWD_KAART_IMG_EL?.addEventListener('click', () => DWD_KAART_IMG_EL.classList.toggle('passend'));
  TOGGLE_VAARRADAR_EL.addEventListener('click', vaarMenuHandleKlik);
  VAAR_UIT_KNOP_EL?.addEventListener('click', () => { if (vaarradarActief) toggleVaarradar(); });
  // Elke keuze/aanraking in het menu = "er wordt gekozen": auto-inklappen afblazen.
  VAAR_MENU_INHOUD_EL?.addEventListener('pointerdown', annuleerVaarMenuAutoDicht);
  VAAR_KLEUR_KNOP_EL?.addEventListener('click', wisselVaarKleurModus);
  VAAR_AISHUB_KNOP_EL?.addEventListener('click', wisselVaarAishubZichtbaar);
  VAAR_BOEIEN_KNOP_EL?.addEventListener('click', wisselVaarBoeienZichtbaar);
  VAAR_STRAAL_KNOP_EL?.addEventListener('click', wisselVaarStraal);
  zetVaarStraalKnopLabel(); // meteen bij opstarten het opgeslagen/standaard getal tonen
  zetVaarKleurKnopLabel();
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
      // echte links/foto's (a) én de open/dicht-knop van de community-
      // miniaturenstrip (summary, 2026-09-02) ongemoeid laten
      if (klikEvent.target.closest('a, summary')) return;
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

// 2026-08-26, op verzoek van Lex ("kan ik dit schema niet ergens handig in
// de app beschikbaar hebben") — stationsnaam/land/zendschema per NAVTEX-
// station, opgehaald bij het opstarten (zie laadNavtexStations() hieronder,
// bron: STATIONS in backend/src/sources/navtexLokaal.js via
// /api/navtex-stations). Blijft `null` zolang die fetch nog niet is geweest
// of is mislukt — de popup-regel en de Instellingen-sectie tonen dan
// gewoon niets extra i.p.v. een foutmelding.
let NAVTEX_STATIONS_DATA = null;

async function laadNavtexStations() {
  try {
    const body = await fetch('/api/navtex-stations').then((r) => r.json());
    if (Array.isArray(body?.stations) && body.stations.length) {
      NAVTEX_STATIONS_DATA = body.stations;
      renderNavtexUitlegSectie(); // ververst meteen als de sectie toevallig al openstond
      ververNavtexVolgende(); // 2026-08-27: het "volgende uitzending"-plaatje kan nu gevuld worden
    }
  } catch {
    // Stil falen, zelfde reden als laadRadarstations() hierboven.
  }
}

// Puur informatieve naslagtabel (berichttype-letter -> betekenis), zelf
// aangeleverd door Lex ("wat zijn de varianten voor A") — losstaand van de
// functionele TYPE_OMSCHRIJVING-map in navtexLokaal.js/ukho.js (die kent
// alleen de letters die daadwerkelijk voorkomen en classificeert echte
// berichten; dit is puur voor het overzicht hieronder in Instellingen, geen
// enkele signal-classificatie hangt hiervan af). M–U en V–Y als reeks i.p.v.
// losse letters, want dat zijn geen individueel toegewezen letters.
const NAVTEX_TYPE_NASLAG = [
  { letters: 'A', omschrijving: 'Navigatiewaarschuwingen' },
  { letters: 'B', omschrijving: 'Meteorologische waarschuwingen' },
  { letters: 'C', omschrijving: 'IJsberichten' },
  { letters: 'D', omschrijving: "Opsporing en redding (SAR), piraterij, tsunami's en andere natuurrampen" },
  { letters: 'E', omschrijving: 'Weersverwachtingen' },
  { letters: 'F', omschrijving: 'Loods- en VTS-berichten' },
  { letters: 'G', omschrijving: 'AIS-berichten' },
  { letters: 'H', omschrijving: 'LORAN-berichten' },
  { letters: 'I', omschrijving: 'Niet meer gebruikt (vroeger OMEGA)' },
  { letters: 'J', omschrijving: 'Waarschuwingen over satellietnavigatie (GPS/GLONASS)' },
  { letters: 'K', omschrijving: 'Andere elektronische navigatiehulpmiddelen' },
  { letters: 'L', omschrijving: 'Extra navigatiewaarschuwingen (als de reeks onder A vol is)' },
  { letters: 'M–U', omschrijving: 'Niet standaard toegewezen' },
  { letters: 'V–Y', omschrijving: 'Speciale diensten, alleen na toewijzing' },
  { letters: 'Z', omschrijving: 'Geen berichten aanwezig' },
];

// Geeft "HH:MM UTC (HH:MM NL-tijd)" voor de eerstvolgende uitzending van dit
// station, of null als het zendschema van dit station (nog) niet bekend is
// (zie de toelichting bij STATIONS in navtexLokaal.js — bewust niet voor
// elk station gegokt). Europe/Amsterdam i.p.v. een handmatige +1/+2-som,
// zodat dit vanzelf klopt ongeacht zomer-/wintertijd.
function eerstvolgendeUitzendingTekst(stationId) {
  const station = NAVTEX_STATIONS_DATA?.find((s) => s.id === stationId);
  if (!station || !Array.isArray(station.zendschema) || !station.zendschema.length) return null;
  const nu = new Date();
  const nuMinuten = nu.getUTCHours() * 60 + nu.getUTCMinutes();
  const minutenLijst = station.zendschema.map((t) => {
    const [u, m] = t.split(':').map(Number);
    return u * 60 + m;
  });
  const eerstvolgende = minutenLijst.find((m) => m > nuMinuten) ?? (minutenLijst[0] + 24 * 60);
  const uur = Math.floor(eerstvolgende / 60) % 24;
  const dagErna = eerstvolgende >= 24 * 60;
  const utcTekst = `${String(uur).padStart(2, '0')}:${String(eerstvolgende % 60).padStart(2, '0')}`;
  const volgendeDatum = new Date(Date.UTC(nu.getUTCFullYear(), nu.getUTCMonth(), nu.getUTCDate() + (dagErna ? 1 : 0), uur, eerstvolgende % 60));
  const nlTekst = volgendeDatum.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Amsterdam' });
  return `${utcTekst} UTC (${nlTekst} NL-tijd)`;
}

// ---- "Volgende uitzending"-plaatje op de zeekaart (2026-08-27) --------
// Op verzoek van Lex: rechtsboven op de zeekaart "Volgende uitzending door
// [station] over [## u ## min]", in hetzelfde fosfor-groen als de ruwe-
// ontvangst-viewer. Berekend over ALLE stations met een zendschema (NAVTEX
// op 518 kHz is tijd-gemultiplext: elk station heeft eigen vaste
// tijdsloten, dus "wie zendt hierna" is over de hele lijst heen zinvol).
// Herberekend op het bestaande 15s-klokritme (updateKlok) — puur rekenen op
// al opgehaalde data, geen extra netwerkverkeer.
//
// De AUTO-knop (tweede verzoek, aan/uit): vanzelf de ruwe-ontvangst-viewer
// openen zodra er ECHT tekst binnenrolt — niet op het geplande tijdstip.
// Eerste versie triggerde op het zendschema; op verzoek van Lex omgebouwd
// ("ontvangst actief alleen lijkt me beter ivm noodberichten" — terecht:
// nood-/SAR-berichten mogen buiten het schema om uitgezonden worden, en op
// tijdstip openen bij een gemiste ontvangst geeft alleen een leeg scherm).
// De monitor (zie zorgNavtexAutoMonitor() hieronder) checkt elke ~10s met
// een kale stat-route (/api/navtex-ruw-status) of het ontvangstbestand
// groeit, en opent de viewer bij de eerste groei. Per toestel bewaard in
// localStorage (weergavevoorkeur van dit scherm, zoals de alarmscherm-
// toggles — geen serverinstelling), standaard UIT: een overlay die
// "vanzelf" opent moet een bewuste keuze zijn.
const NAVTEX_AUTO_KEY = 'weerNavtexAutoSchakel';
let navtexAutoSchakel = false;
try {
  navtexAutoSchakel = localStorage.getItem(NAVTEX_AUTO_KEY) === 'aan';
} catch {
  // privé-venster/geblokkeerde site-data — gewoon standaard UIT
}

function renderNavtexAutoKnop() {
  if (!NAVTEX_AUTO_KNOP_EL) return;
  NAVTEX_AUTO_KNOP_EL.textContent = navtexAutoSchakel ? 'AUTO AAN' : 'AUTO UIT';
  NAVTEX_AUTO_KNOP_EL.classList.toggle('aan', navtexAutoSchakel);
}

// Eerstvolgende uitzending over alle stations heen: {naam, overMin, tijdMs}.
function volgendeNavtexUitzending() {
  if (!Array.isArray(NAVTEX_STATIONS_DATA)) return null;
  const nu = new Date();
  const nuMin = nu.getUTCHours() * 60 + nu.getUTCMinutes();
  let beste = null;
  for (const station of NAVTEX_STATIONS_DATA) {
    if (!Array.isArray(station.zendschema)) continue;
    for (const t of station.zendschema) {
      const [u, m] = String(t).split(':').map(Number);
      if (!Number.isFinite(u) || !Number.isFinite(m)) continue;
      let over = u * 60 + m - nuMin;
      if (over <= 0) over += 24 * 60; // vandaag al geweest (of exact nu) -> morgen
      if (!beste || over < beste.overMin) beste = { naam: station.naam, overMin: over };
    }
  }
  if (!beste) return null;
  // Absoluut tijdstip (op hele minuut) voor de AUTO-trigger hieronder.
  const basis = new Date(Date.UTC(nu.getUTCFullYear(), nu.getUTCMonth(), nu.getUTCDate(), nu.getUTCHours(), nu.getUTCMinutes()));
  beste.tijdMs = basis.getTime() + beste.overMin * 60 * 1000;
  return beste;
}

function ververNavtexVolgende() {
  if (!NAVTEX_VOLGENDE_EL) return;
  renderNavtexDx(); // DX-lijst lift mee op hetzelfde klok-ritme en dezelfde zichtbaarheidsregels
  const volgende = zeeModusActief ? volgendeNavtexUitzending() : null;
  if (!volgende) {
    NAVTEX_VOLGENDE_EL.classList.add('verborgen');
    return;
  }

  const uren = Math.floor(volgende.overMin / 60);
  const minuten = volgende.overMin % 60;
  const overTekst = uren > 0 ? `${uren} u ${minuten} min` : minuten > 0 ? `${minuten} min` : 'minder dan 1 min';
  NAVTEX_VOLGENDE_TEKST_EL.textContent = `Volgende uitzending door ${volgende.naam} over ${overTekst}`;
  renderNavtexAutoKnop();
  NAVTEX_VOLGENDE_EL.classList.remove('verborgen');
}

// ---- AUTO-monitor: viewer openen zodra het ontvangstbestand groeit -----
// Draait alleen zolang Zee-modus én AUTO allebei aan staan (zie
// zorgNavtexAutoMonitor). Elke tik een kale stat via /api/navtex-ruw-status;
// pas bij daadwerkelijke groei opent de viewer (die haalt dan zelf de
// volledige tekst op). Eerste meting is puur de nulmeting — bestaande oude
// inhoud mag nooit meteen een "ontvangst!" zijn. Na één keer openen is de
// trekker "ontwapend" tot het bestand 3 minuten stil is geweest: als je de
// viewer zelf wegklikt terwijl dezelfde uitzending nog binnenloopt, klapt
// 'ie dus niet meteen weer open — pas een écht nieuwe ontvangst (na een
// stilteperiode) opent opnieuw.
const NAVTEX_AUTO_POLL_MS = 10 * 1000;
const NAVTEX_AUTO_HERWAPEN_MS = 3 * 60 * 1000;
// 2026-08-27, op verzoek van Lex ("1 minuut"): een viewer die door AUTO is
// geopend klapt vanzelf weer dicht zodra het bestand zó lang stil is — terug
// naar de kaart. Alleen voor auto-geopende viewers (zelf via 📻/BEKIJK
// geopend = zelf sluiten), en nooit terwijl je omhoog gescrold bent om iets
// terug te lezen.
const NAVTEX_AUTO_SLUIT_STILTE_MS = 60 * 1000;
let navtexAutoTimer = null;
let navtexAutoBekendeBytes = null; // null = nog geen nulmeting gedaan
let navtexAutoGewapend = true;
let navtexAutoLaatsteGroeiMs = 0;

async function navtexAutoTik() {
  try {
    const res = await fetch('/api/navtex-ruw-status').then((r) => r.json());
    const bytes = res.bestandsBytes ?? 0;
    if (navtexAutoBekendeBytes === null) {
      navtexAutoBekendeBytes = bytes; // nulmeting
      return;
    }
    const groei = bytes > navtexAutoBekendeBytes;
    navtexAutoBekendeBytes = bytes;
    if (groei) {
      navtexAutoLaatsteGroeiMs = Date.now();
      if (navtexAutoGewapend && NAVTEX_RUW_OVERLAY_EL?.classList.contains('verborgen')) {
        navtexAutoGewapend = false;
        openNavtexRuw(true); // true = door AUTO geopend, mag ook weer vanzelf dicht
      }
    } else {
      if (!navtexAutoGewapend && Date.now() - navtexAutoLaatsteGroeiMs > NAVTEX_AUTO_HERWAPEN_MS) {
        navtexAutoGewapend = true; // stilteperiode voorbij — volgende ontvangst mag weer openen
      }
      // Terugschakelen naar de kaart (zie NAVTEX_AUTO_SLUIT_STILTE_MS): 1
      // minuut geen nieuwe bytes én de viewer was door AUTO geopend. De
      // vastgepind-check (zelfde 40px-marge als ververNavtexRuw) zorgt dat
      // we nooit dichtklappen terwijl je omhoog gescrold zit terug te lezen
      // — dan proberen we het bij de volgende tik gewoon opnieuw.
      if (
        navtexRuwGeopendDoorAuto &&
        !NAVTEX_RUW_OVERLAY_EL?.classList.contains('verborgen') &&
        Date.now() - navtexAutoLaatsteGroeiMs > NAVTEX_AUTO_SLUIT_STILTE_MS
      ) {
        const vastgepind =
          NAVTEX_RUW_INHOUD_EL.scrollHeight - NAVTEX_RUW_INHOUD_EL.scrollTop - NAVTEX_RUW_INHOUD_EL.clientHeight < 40;
        if (vastgepind) {
          sluitNavtexRuw();
          // Na een AUTO-sluiting meteen herwapenen: begint de ontvangst
          // even later tóch weer (lang gat middenin een uitzending), dan
          // mag de viewer direct opnieuw openklappen. De 3-minuten-
          // herwapentermijn blijft alleen gelden na een HANDMATIGE sluiting
          // — dat is de "niet meteen weer in mijn gezicht"-bescherming.
          navtexAutoGewapend = true;
        }
      }
    }
  } catch (err) {
    console.warn('[weer] navtex-auto-statuscheck mislukt:', err);
  }
}

function zorgNavtexAutoMonitor() {
  const moetDraaien = zeeModusActief && navtexAutoSchakel;
  if (moetDraaien && !navtexAutoTimer) {
    navtexAutoBekendeBytes = null;
    navtexAutoGewapend = true;
    navtexAutoTik(); // meteen de nulmeting, niet pas na de eerste 10s
    navtexAutoTimer = setInterval(navtexAutoTik, NAVTEX_AUTO_POLL_MS);
  } else if (!moetDraaien && navtexAutoTimer) {
    clearInterval(navtexAutoTimer);
    navtexAutoTimer = null;
  }
}

NAVTEX_AUTO_KNOP_EL?.addEventListener('click', () => {
  navtexAutoSchakel = !navtexAutoSchakel;
  try {
    localStorage.setItem(NAVTEX_AUTO_KEY, navtexAutoSchakel ? 'aan' : 'uit');
  } catch (err) {
    console.warn('[weer] navtex-auto-voorkeur opslaan mislukt (blijft wel actief voor deze sessie):', err);
  }
  renderNavtexAutoKnop();
  zorgNavtexAutoMonitor();
});

// ---- DX-lijst: bijzondere (verre) ontvangst (2026-08-28) ---------------
// Op verzoek van Lex ("een lijstje met DX bijzonderheden... onder de melding
// voor de uitzendingen, met een toon en verberg knop, zelfde stijl" — en
// "niet per se 's morgens", dus gewoon altijd beschikbaar): welke VERRE
// stations zaten er de afgelopen 24 uur in de eigen ontvangst. "Ver" is de
// MASTafstand (niet de berichtpositie — een Scheveningen-bericht over een
// verre positie is geen DX), drempel 500 km: de vaste kring (Scheveningen,
// Oostende, Niton, Hamburg) valt eronder, Cullercoats en verder erboven.
// Per station één regel: mastafstand, aantal berichten, laatste ontvangst;
// tikken centreert de kaart op het nieuwste bericht van dat station.
// Toon/verberg per toestel bewaard (zelfde patroon als de AUTO-knop);
// ververst mee op het klok-ritme via ververNavtexVolgende().
const NAVTEX_DX_KEY = 'weerNavtexDxOpen';
const NAVTEX_DX_VENSTER_MS = 24 * 60 * 60 * 1000;
const NAVTEX_DX_MAST_KM = 500;
let navtexDxOpen = false;
try {
  navtexDxOpen = localStorage.getItem(NAVTEX_DX_KEY) === 'aan';
} catch {
  // privé-venster/geblokkeerde site-data — standaard dicht
}

function dxLijst() {
  if (!Array.isArray(NAVTEX_STATIONS_DATA)) return [];
  const nu = Date.now();
  const perStation = new Map();
  for (const s of laatsteMeldingenSignalen ?? []) {
    if (s.categorie !== 'navtex' || s.detail?.verlopen) continue;
    const stationId = s.detail?.stationId;
    if (!stationId) continue;
    const station = NAVTEX_STATIONS_DATA.find((st) => st.id === stationId);
    if (!station || !Number.isFinite(station.lat)) continue;
    const mastKm = afstandKm(THUIS.homeLat, THUIS.homeLon, station.lat, station.lon);
    if (mastKm < NAVTEX_DX_MAST_KM) continue;
    // 2026-08-28-herzien, op vraag van Lex ("welke tijd zie ik hier nu?"):
    // eerst het echte laatste ONTVANGST-moment (blok-begintijd uit het
    // viewer-register, nieuw meegegeven door de backend), dan pas de oudere
    // terugvallen — laatstGezien is het nieuwste DTG en s.tijd kan het
    // "eerst gezien"-moment zijn, wat na een deploy voor alles hetzelfde is.
    const laatst = new Date(s.detail?.laatstOntvangen ?? s.detail?.laatstGezien ?? s.tijd).getTime();
    if (!Number.isFinite(laatst) || nu - laatst > NAVTEX_DX_VENSTER_MS) continue;
    const rec = perStation.get(stationId) ?? { station, mastKm, aantal: 0, laatst: 0, signaal: null };
    rec.aantal += 1;
    if (laatst > rec.laatst) {
      rec.laatst = laatst;
      rec.signaal = s;
    }
    perStation.set(stationId, rec);
  }
  return [...perStation.values()].sort((a, b) => b.mastKm - a.mastKm);
}

// 2026-08-28, op melding van Lex ("ik vind de nieuwe dx-tijden wat vreemd —
// zou je daar ook de datum bij willen zetten? die 24 uur is heel etmaal
// toch?"): klopt, het venster is een rollend etmaal, dus een kale kloktijd
// kan óók gisteren zijn. Binnen 24 uur zijn er maar twee dagen mogelijk —
// vandaag toont alleen de tijd, anders "gisteren HH:MM". hour12:false
// expliciet, zelfde AM/PM-les als elders (2026-08-26).
function dxOntvangstTekst(ms) {
  const d = new Date(ms);
  const opties = { timeZone: 'Europe/Amsterdam' };
  const tijd = d.toLocaleTimeString('nl-NL', { ...opties, hour: '2-digit', minute: '2-digit', hour12: false });
  const dagVan = (x) => x.toLocaleDateString('nl-NL', opties);
  return dagVan(d) === dagVan(new Date()) ? tijd : `gisteren ${tijd}`;
}

function renderNavtexDx() {
  if (!NAVTEX_DX_PANEEL_EL) return;
  if (NAVTEX_DX_KNOP_EL) NAVTEX_DX_KNOP_EL.classList.toggle('aan', navtexDxOpen);
  if (!zeeModusActief || !navtexDxOpen) {
    NAVTEX_DX_PANEEL_EL.classList.add('verborgen');
    return;
  }
  const lijst = dxLijst();
  const kop = '<div class="dx-kop">DX-ontvangst · afgelopen 24 uur</div>';
  if (!lijst.length) {
    NAVTEX_DX_PANEEL_EL.innerHTML = `${kop}<div class="dx-leeg">geen verre ontvangst</div>`;
  } else {
    NAVTEX_DX_PANEEL_EL.innerHTML = kop + lijst.map((r, i) => (
      `<button type="button" class="dx-regel" data-dx="${i}">`
      + `<span class="dx-station">${escapeHtml(r.station.naam)}${r.station.land ? ` (${escapeHtml(r.station.land)})` : ''}</span>`
      + `<span class="dx-info">${Math.round(r.mastKm)} km · ${r.aantal} ber. · ${dxOntvangstTekst(r.laatst)}</span>`
      + '</button>'
    )).join('');
    NAVTEX_DX_PANEEL_EL.querySelectorAll('.dx-regel').forEach((knop) => {
      knop.addEventListener('click', () => {
        const r = lijst[Number(knop.dataset.dx)];
        if (r?.signaal) centreerOpMelding(r.signaal);
      });
    });
  }
  NAVTEX_DX_PANEEL_EL.classList.remove('verborgen');
}

NAVTEX_DX_KNOP_EL?.addEventListener('click', () => {
  navtexDxOpen = !navtexDxOpen;
  try {
    localStorage.setItem(NAVTEX_DX_KEY, navtexDxOpen ? 'aan' : 'uit');
  } catch (err) {
    console.warn('[weer] navtex-dx-voorkeur opslaan mislukt (blijft wel actief voor deze sessie):', err);
  }
  renderNavtexDx();
});

// 2026-08-26: zelfde dicht-tot-je-erop-tikt uitklap-idioom (booleaanse vlag
// + pijltje dat omdraait) als alarmSectieUitgeklapt hierboven — zie de
// toelichting daar. Lex expliciet: "niet altijd zichtbaar maar wel op te
// roepen (ook op iOS)", dus geen <details>-element (iOS-Safari-styling
// daarvan is lastig consistent te krijgen met de rest van deze knoppen) maar
// hetzelfde bestaande knop-mechanisme.
let navtexUitlegSectieUitgeklapt = false;

// ---- Ruwe NAVTEX-ontvangst-viewer (2026-08-27) ------------------------
// Op verzoek van Lex ("ik heb een systemd naar tail -f
// ~/navtex_berichten.txt — kan ik de binnenkomende tekst ook tonen in de
// app?"): de staart van het ruwe decoder-bestand, in de app, tail -f-stijl —
// oudste boven, nieuwste onderaan, opent onderaan gescrold en ververst elke
// 10s zolang de viewer openstaat. Als je zelf omhoog gescrold bent om iets
// terug te lezen, laat een verversing je scrollpositie met rust (alleen
// "vastgepind" onderaan springt 'ie mee naar het nieuwste — precies zoals
// een terminal met tail -f aanvoelt). Te openen vanaf twee plekken (keuze
// van Lex: "beide"): de 📻-knop in Zee-modus en de knop in Instellingen ->
// NAVTEX-sectie. De 10s-verversing is goedkoop: /api/navtex-ruw geeft ETag +
// gzip mee (zie server.js), dus een ongewijzigd bestand kost een 304'je.
const NAVTEX_RUW_VERVERS_MS = 10 * 1000;
let navtexRuwTimer = null;

async function ververNavtexRuw() {
  try {
    const res = await fetch('/api/navtex-ruw').then((r) => r.json());
    if (res.tekst == null) {
      NAVTEX_RUW_TEKST_EL.textContent = 'Nog geen ontvangstbestand gevonden op de server (~/navtex_berichten.txt).';
      NAVTEX_RUW_STATUS_EL.textContent = '📻 Ruwe ontvangst';
      return;
    }
    // Vastgepind onderaan? (marge van 40px zodat een klein sleepje niet
    // meteen als "omhoog gescrold" telt) — alleen dan na het verversen mee
    // naar het nieuwste springen.
    const vastgepind =
      NAVTEX_RUW_INHOUD_EL.scrollHeight - NAVTEX_RUW_INHOUD_EL.scrollTop - NAVTEX_RUW_INHOUD_EL.clientHeight < 40;
    // 2026-08-28, op verzoek van Lex ("de begintijd ervoor en streep
    // eronder — groter font/kleur zal wel niet kunnen met txt"): in het
    // .txt-bestand niet, maar hier wél. De backend geeft per ZCZC-blok de
    // begintijd mee (zie blokken/ruweBlokTijden in navtexLokaal.js); elke
    // blokstart krijgt een kopregel — groter, feller groen, streep eronder.
    // Een blok dat nog geen geregistreerde tijd heeft (jonger dan de
    // 2-minuten-pollcyclus, of ouder dan het register) krijgt alleen de
    // streep. Opbouw via escapeHtml per stuk — de ruwe tekst zelf blijft
    // altijd data, nooit HTML.
    NAVTEX_RUW_TEKST_EL.innerHTML = bouwRuweOntvangstHtml(res.tekst || '(bestand is nog leeg)', res.blokken ?? []);
    const tijd = res.bijgewerkt
      ? new Date(res.bijgewerkt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : '—';
    NAVTEX_RUW_STATUS_EL.textContent = `📻 Ruwe ontvangst · ${Math.round(res.bestandsBytes / 1024)} kB · laatste schrijf ${tijd}`;
    if (vastgepind) NAVTEX_RUW_INHOUD_EL.scrollTop = NAVTEX_RUW_INHOUD_EL.scrollHeight;
  } catch (err) {
    NAVTEX_RUW_STATUS_EL.textContent = '📻 Ruwe ontvangst · server niet bereikbaar';
    console.warn('[weer] navtex-ruw ophalen mislukt:', err);
  }
}

// 2026-08-27: onthoudt of de viewer door de AUTO-monitor is geopend — alleen
// dan mag 'ie ook weer vanzelf dichtklappen (zie navtexAutoTik). Strikte
// `=== true`-check omdat openNavtexRuw ook direct als click-handler hangt en
// dan een (truthy) event-object als eerste argument meekrijgt.
let navtexRuwGeopendDoorAuto = false;

// Zie de toelichting in ververNavtexRuw() — kopregel met begintijd + streep
// per ZCZC-blok. `blokken` = [{offset, tijd}] met offsets binnen `tekst`,
// oplopend gesorteerd door de backend.
function bouwRuweOntvangstHtml(tekst, blokken) {
  const geldig = blokken.filter((b) => Number.isFinite(b?.offset) && b.offset >= 0 && b.offset <= tekst.length);
  if (!geldig.length) return escapeHtml(tekst);
  let html = '';
  let vorige = 0;
  geldig.forEach((blok) => {
    if (blok.offset > vorige) html += escapeHtml(tekst.slice(vorige, blok.offset));
    const tijdTekst = blok.tijd
      ? new Date(blok.tijd).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      : null;
    html += `<span class="ruw-blok-kop">${tijdTekst ? `▸ ontvangen ${escapeHtml(tijdTekst)}` : '▸'}</span>`;
    vorige = blok.offset;
  });
  html += escapeHtml(tekst.slice(vorige));
  return html;
}

function openNavtexRuw(doorAuto) {
  if (!NAVTEX_RUW_OVERLAY_EL) return;
  navtexRuwGeopendDoorAuto = doorAuto === true;
  NAVTEX_RUW_OVERLAY_EL.classList.remove('verborgen');
  NAVTEX_RUW_TEKST_EL.textContent = 'Ophalen…';
  NAVTEX_RUW_STATUS_EL.textContent = '📻 Ruwe ontvangst';
  // Eerste keer: na het renderen meteen onderaan beginnen — de "vastgepind"-
  // check in ververNavtexRuw() is dan al waar (lege inhoud = onderaan).
  ververNavtexRuw();
  if (!navtexRuwTimer) navtexRuwTimer = setInterval(ververNavtexRuw, NAVTEX_RUW_VERVERS_MS);
}

function sluitNavtexRuw() {
  NAVTEX_RUW_OVERLAY_EL?.classList.add('verborgen');
  navtexRuwGeopendDoorAuto = false;
  if (navtexRuwTimer) {
    clearInterval(navtexRuwTimer);
    navtexRuwTimer = null;
  }
}

NAVTEX_RUW_KNOP_EL?.addEventListener('click', openNavtexRuw);
NAVTEX_RUW_SLUITEN_EL?.addEventListener('click', sluitNavtexRuw);

function renderNavtexUitlegSectie() {
  if (NAVTEX_UITLEG_PIJL_EL) NAVTEX_UITLEG_PIJL_EL.textContent = navtexUitlegSectieUitgeklapt ? '▾' : '▸';
  if (!NAVTEX_UITLEG_LIJST_EL) return;
  NAVTEX_UITLEG_LIJST_EL.style.display = navtexUitlegSectieUitgeklapt ? '' : 'none';
  NAVTEX_UITLEG_LIJST_EL.innerHTML = '';
  if (!navtexUitlegSectieUitgeklapt) return;

  // 2026-08-27: knop naar de ruwe-ontvangst-viewer, ook hier (naast de
  // 📻-knop in Zee-modus) — keuze van Lex: "beide".
  const ruwRij = document.createElement('div');
  ruwRij.className = 'instelling-item';
  const ruwLabel = document.createElement('span');
  ruwLabel.textContent = '📻 Ruwe ontvangst (live decoder-tekst)';
  const ruwKnop = document.createElement('button');
  ruwKnop.type = 'button';
  ruwKnop.className = 'alarm-toggle';
  ruwKnop.textContent = 'BEKIJK';
  ruwKnop.addEventListener('click', openNavtexRuw);
  ruwRij.appendChild(ruwLabel);
  ruwRij.appendChild(ruwKnop);
  NAVTEX_UITLEG_LIJST_EL.appendChild(ruwRij);

  const uitleg = document.createElement('div');
  uitleg.className = 'instellingen-uitleg';
  uitleg.textContent = 'De tweede letter in de berichtcode (bv. de "A" in PA11) is het station, de rest het berichttype.';
  NAVTEX_UITLEG_LIJST_EL.appendChild(uitleg);

  const stationsKop = document.createElement('div');
  stationsKop.className = 'instellingen-uitleg';
  stationsKop.textContent = 'Stations (zendschema UTC):';
  NAVTEX_UITLEG_LIJST_EL.appendChild(stationsKop);

  const stations = NAVTEX_STATIONS_DATA ?? [];
  if (!stations.length) {
    const leeg = document.createElement('div');
    leeg.className = 'instellingen-uitleg';
    leeg.textContent = '(nog aan het laden...)';
    NAVTEX_UITLEG_LIJST_EL.appendChild(leeg);
  }
  stations.forEach((station) => {
    const rij = document.createElement('div');
    rij.className = 'instelling-item navtex-naslag-rij';
    const label = document.createElement('span');
    label.textContent = `${station.id}  ${station.naam}${station.land ? ` (${station.land})` : ''}`;
    const tijden = document.createElement('span');
    tijden.className = 'navtex-naslag-tijden';
    tijden.textContent = station.zendschema?.length ? station.zendschema.join(', ') : 'onbekend';
    rij.appendChild(label);
    rij.appendChild(tijden);
    NAVTEX_UITLEG_LIJST_EL.appendChild(rij);
  });

  const typeKop = document.createElement('div');
  typeKop.className = 'instellingen-uitleg';
  typeKop.textContent = 'Berichttype (2e letter van de code):';
  NAVTEX_UITLEG_LIJST_EL.appendChild(typeKop);

  NAVTEX_TYPE_NASLAG.forEach((regel) => {
    const rij = document.createElement('div');
    rij.className = 'instelling-item navtex-naslag-rij';
    const letter = document.createElement('span');
    letter.textContent = regel.letters;
    const omschrijving = document.createElement('span');
    omschrijving.className = 'navtex-naslag-tijden';
    omschrijving.textContent = regel.omschrijving;
    rij.appendChild(letter);
    rij.appendChild(omschrijving);
    NAVTEX_UITLEG_LIJST_EL.appendChild(rij);
  });
}

NAVTEX_UITLEG_KNOP_EL?.addEventListener('click', () => {
  navtexUitlegSectieUitgeklapt = !navtexUitlegSectieUitgeklapt;
  renderNavtexUitlegSectie();
});

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
    attributie: `Radar: IEM - ${station.naam} (${station.id}), Storm-Relative Velocity`,
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
  // 2026-08-27-fix, op melding van Lex (kaart stond na het aantikken van een
  // melding eerst te ver ingezoomd, en "corrigeerde" zichzelf pas een cyclus
  // later naar verder uitgezoomd): wisselView() hierboven stelt zijn eigen
  // kaart.invalidateSize() bewust met setTimeout(...,0) uit (de kaarttab moet
  // eerst zichtbaar worden voordat de afmeting goed te meten is). Dit
  // fitBounds/setView-blok draaide daarvóór, dus nog op de OUDE containermaat
  // van vóór de tabwissel -- Leaflet berekende de zoom dan verkeerd. Pas de
  // eerstvolgende 20-seconden-cyclus (ververGeselecteerdGebied hieronder)
  // deed dezelfde berekening nog eens, dan wél op de juiste maat -- wat
  // oogde als "verspringen"/"verder uitzoomen", maar in werkelijkheid gewoon
  // de eerste, foute weergave was die zichzelf rechtzette. Fix: dit hele
  // blok ook een tik uitstellen, zodat het pas draait NADAT wisselView()'s
  // eigen invalidateSize() al is geweest (die stond eerder in de wachtrij,
  // dus draait eerder) -- dan is de containermaat vanaf de eerste weergave
  // al goed.
  // 2026-08-27 (tweede ronde), op melding van Lex: de 15-16s-freeze kwam
  // terug bij het AANTIKKEN van een weeralarm — zelfde mechanisme als eerder
  // bij de Kaart-knop (een geanimeerde pan/zoom die op de iPad vastloopt op
  // het compositen van de kaartlagen), vermoedelijk verergerd doordat de
  // verlopen (grijze) pins sinds vandaag weer op de kaart staan en juist
  // rond NL clusteren, precies waar een weeralarm-klik heen zoomt. Zelfde
  // bewezen remedie als in gaNaarStart(): animate:false, directe teleport.
  setTimeout(() => {
    if (gebiedBounds && signal.lat != null && signal.lon != null) {
      // Zowel een omtrek als een eigen actuele positie (orkaan) — symmetrisch
      // rond die positie, zie symmetrischeBoundsRondPunt() hierboven.
      beweegKaartProgrammatisch(() => {
        kaart.fitBounds(symmetrischeBoundsRondPunt(signal.lat, signal.lon, gebiedBounds), { padding: [24, 24], animate: false });
        dwingRegenradarZoomAf(); // fitBounds kan met gemak onder REGENRADAR_ZOOM uitkomen bij een groot gebied
      });
    } else if (gebiedBounds) {
      // Groot gebied zonder eigen "nu"-punt (bv. een NWS-watch-polygon) —
      // gewoon de hele omtrek in beeld.
      beweegKaartProgrammatisch(() => {
        kaart.fitBounds(gebiedBounds, { padding: [24, 24], animate: false });
        dwingRegenradarZoomAf();
      });
    } else if (signal.lat != null && signal.lon != null) {
      const minZoom = signal.categorie === 'hulpdiensten' ? HULPDIENSTEN_ZOOM : 8;
      beweegKaartProgrammatisch(() => kaart.setView([signal.lat, signal.lon], Math.max(kaart.getZoom(), minZoom), { animate: false }));
    }
  }, 0);
  // 2026-08-27, op verzoek van Lex ("dat label even terug zetten") — het
  // label/popup weer op zijn oude, vaste timing (250ms na dit punt, niet
  // pas na de kaart-fit-vertraging hierboven) -- alleen de kaart-fit zelf
  // bleef uitgesteld, zie de fix hierboven.
  //
  // 2026-08-27-fix (tweede ronde), op melding van Lex ("soms komt het label
  // meteen soms niet", iPad): de marker-referentie werd op het KLIK-moment
  // opgezocht, maar renderMap() (elke 20s-cyclus, én de zoomend/dragend-
  // gekoppelde her-renders) doet signaalLaag.clearLayers() en bouwt alle
  // markers opnieuw — een tussen klik en de 250ms-timeout herbouwde kaart
  // maakte de vastgehouden referentie dus stilletjes een wees: openPopup()
  // op een marker die niet meer op de kaart staat doet gewoon niks. Fix:
  // de marker pas ÍN de timeout vers opzoeken (markersPerId wordt bij elke
  // herbouw opnieuw gevuld), en als de popup even later alsnog niet open
  // blijkt (bv. omdat een herbouw er net tussendoor kwam), nog maximaal
  // twee keer opnieuw proberen.
  if (gebiedBounds || (signal.lat != null && signal.lon != null)) {
    const openPopupPoging = (pogingenOver) => {
      const marker = markersPerId.get(signal.id);
      if (marker) marker.openPopup();
      if (pogingenOver > 0) {
        setTimeout(() => {
          const controle = markersPerId.get(signal.id);
          if (controle && !controle.isPopupOpen()) openPopupPoging(pogingenOver - 1);
        }, 900);
      }
    };
    setTimeout(() => openPopupPoging(2), 250); // 250ms: wacht tot de pan/zoom-animatie klaar is
  }
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
  // 2026-08-27, op melding van Lex ("ik weet zeker dat dit voorheen een
  // gevuld kader had, ook bij verlopen"): klopt — vóór 2026-08-26 tekenden
  // verlopen signalen hun omtrek gewoon mee. Bij het terugbrengen van de
  // grijze verlopen-pins eerder vandaag waren de omtrekken nog uitgesloten;
  // nu weer terug, maar dan in het grijs (zelfde kleurtaal als de
  // .is-verlopen-pins) zodat een verlopen kader nooit voor een actieve
  // warning kan worden aangezien. Zelfde opzet (gestippelde rand + lichte
  // vulling), alleen kleur/dekking gedempt.
  const verlopen = Boolean(signal.detail?.verlopen);
  const omtrekKleur = verlopen
    ? '#9ea6b4'
    : (GEBIED_OMTREK_KLEUR_PER_CATEGORIE[signal.categorie] ?? GEBIED_OMTREK_KLEUR_STANDAARD);
  let ietsGetekend = false;
  // 2026-09-02, op verzoek van Lex ("maak de rasters bij tornado watch
  // gebieden wat prominenter"): actieve tornado-omtrekken (watch én warning)
  // dikker, feller en met iets meer vulling dan de overige categorieën --
  // die 1.5px-stippellijn viel op de donkere kaart nauwelijks op.
  const prominent = !verlopen && DOPPLER_CATEGORIEEN.has(signal.categorie); // tornado, tornado-watch, tornado-bevestigd, severe-outlook
  if (Array.isArray(ringenLatLon) && ringenLatLon.length) {
    ringenLatLon.forEach((ring) => {
      L.polygon(ring, {
        className: 'gebied-omtrek',
        color: omtrekKleur,
        weight: prominent ? 3 : 1.5,
        opacity: verlopen ? 0.4 : prominent ? 0.95 : 0.55,
        dashArray: verlopen ? '3 7' : prominent ? '10 6' : '5 7',
        fillColor: omtrekKleur,
        fillOpacity: verlopen ? 0.04 : prominent ? 0.12 : 0.05,
        interactive: false,
      }).addTo(gebiedLaag);
    });
    ietsGetekend = true;
  }
  if (Array.isArray(koerslijnLatLon) && koerslijnLatLon.length >= 2) {
    L.polyline(koerslijnLatLon, {
      className: 'koers-lijn',
      color: verlopen ? '#9ea6b4' : '#3ec6ff',
      weight: 2.5,
      opacity: verlopen ? 0.4 : 0.85,
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
  // animate:false (2026-08-27): zelfde teleport-remedie als centreerOpMelding
  // — dit her-fitten draait tijdens de ververscyclus terwijl je zit te
  // kijken; juist dan is een iPad-freeze van een geanimeerde fit het
  // vervelendst.
  if (gebiedBounds && actueel.lat != null && actueel.lon != null) {
    beweegKaartProgrammatisch(() => {
      kaart.fitBounds(symmetrischeBoundsRondPunt(actueel.lat, actueel.lon, gebiedBounds), { padding: [24, 24], animate: false });
      dwingRegenradarZoomAf(); // zelfde reden als bij centreerOpMelding() hierboven
    });
  } else if (gebiedBounds) {
    beweegKaartProgrammatisch(() => {
      kaart.fitBounds(gebiedBounds, { padding: [24, 24], animate: false });
      dwingRegenradarZoomAf();
    });
  } else if (actueel.lat != null && actueel.lon != null) {
    beweegKaartProgrammatisch(() => kaart.setView([actueel.lat, actueel.lon], kaart.getZoom(), { animate: false }));
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
  const label = new Date(frame.time * 1000).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', hour12: false });
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

// 2026-08-29: hier stond de tekenlogica voor een fronten-kaartlaag
// (driehoekjes/bolletjes langs koufront/warmtefront/occlusie) — gebouwd en
// dezelfde dag teruggedraaid, de bron bleek de Noordzee niet te dekken. Zie
// de uitgebreide aantekening bij de vaarradar-sectie in server.js en commit
// fa2966e voor de volledige (werkende) implementatie.

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
  // animate:false (2026-08-27): loopt in dezelfde klikpaden als de
  // teleport-fixes in centreerOpMelding()/gaNaarStart() — een geanimeerde
  // zoomstap er direct achteraan zou de iPad-freeze via de achterdeur
  // terughalen.
  if (regenradarAan && kaart && kaart.getZoom() < REGENRADAR_ZOOM) kaart.setZoom(REGENRADAR_ZOOM, { animate: false });
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
    // 2026-08-27-fix, op melding van Lex (regenradar-aanzetten: kaart zoomde
    // na een paar seconden vanzelf verder uit dan zoomniveau 7, ook zonder
    // enig ander gebied aangetikt te hebben in dezelfde sessie) — als er nog
    // een gebied-signaal "gevolgd" werd van eerder (geselecteerdGebiedId,
    // zie centreerOpMelding/ververGeselecteerdGebied), telt deze eigen
    // programmatische zoom daar bewust niet als "handmatig zoomen" voor (zie
    // kaart.on('zoomend dragend', ...) hierboven) — dus die oude selectie
    // bleef gewoon staan, en de eerstvolgende 20-seconden-cyclus deed er
    // alsnog een fitBounds() op, wat zomaar verder uit kon zoomen dan
    // REGENRADAR_ZOOM. Regenradar-aanzetten is zelf ook een bewuste "ik wil
    // nu hiernaar kijken"-actie, dus die mag zo'n oude selectie net zo goed
    // opruimen als een handmatige zoom dat al doet.
    geselecteerdGebiedId = null;
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
  // 2026-08-30, op verzoek van Lex: bij een weeralarm de geldigheidsperiode
  // op een eigen regel, en het klokje expliciet als "uitgegeven" — dat is
  // namelijk body.sent van Meteoalarm/KNMI (moment van uitgifte/laatste
  // update), niet onze ontvangsttijd; zonder label oogde het als een derde,
  // onverklaarde tijd achter de geldig-van-tot-periode.
  const isWeeralarm = s.categorie === 'weerwaarschuwing';
  const tijdDeel = tijdregel ? `<span class="tijd-icoon-mat">🕓</span> ${isWeeralarm ? 'uitgegeven ' : ''}${tijdregel}` : null;
  const subDelen = [detailregel, tijdDeel, ontvangstregel].filter(Boolean);
  const subHtml = !subDelen.length
    ? ''
    : isWeeralarm
      ? subDelen.map((deel) => `<div class="popup-sub">${deel}</div>`).join('')
      : `<div class="popup-sub">${subDelen.join(' · ')}</div>`;
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
  const titelHtml = markeerNlTijd(riglijstTitelHtml(s) ?? s.titel);
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
  if (s.categorie !== 'navtex' || (s.detail?.eventType !== 'riglijst' && s.detail?.eventType !== 'platform-defect')) return null;
  const d = s.detail;
  // navtexLokaal.js zet titel altijd met het vaste woord "NAVTEX" vooraan;
  // ukho.js gebruikt daar w.type (bv. "NAVAREA 1") — zie detail.bron.
  const kop = d.bron === 'ukho' ? d.land : 'NAVTEX';
  const naamHtml = d.positie?.naam
    ? `<span class="popup-rig-naam">${escapeHtml(d.positie.naam)}</span>`
    : `<span class="popup-rig-naam popup-rig-naam-onbekend">Onbekend platform</span>`;
  const tellerHtml = d.riglijstTotaal > 1 ? ` <span class="popup-rig-teller">(${d.riglijstIndex + 1}/${d.riglijstTotaal})</span>` : '';
  return `${escapeHtml(kop ?? '')} - ${escapeHtml(d.rigStatusLabel ?? d.eventLabel ?? '')} - ${naamHtml}${tellerHtml} - ${escapeHtml(d.station ?? '')}`;
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
    // 2026-08-28, op vraag van Lex ("hier zie ik geen GA in — wordt het
    // zendstation afgekapt op het label?"): de zendcode-kop (ZCZC GA27 +
    // WZ-nummer) wordt bij het parsen bewust uit de weergavetekst geknipt,
    // dus de code stond nergens meer zichtbaar — terwijl de "+N andere
    // berichten"-regels 'm wél tonen. Nu hier expliciet in de statregel.
    if (d.code) stats.push(`code ${d.code}`);
    if (d.afstandTotJouKm != null) stats.push(`${d.afstandTotJouKm}km van jou`);
    // 2026-08-28, op verzoek van Lex ("ook de datum en tijd van ontvangst
    // willen zien"): het echte laatste ontvangstmoment uit het blok-
    // tijdenregister (zie laatstOntvangen in navtexLokaal.js) — dit is
    // wanneer JOUW antenne 'm binnenkreeg, los van de DTG in het bericht.
    if (d.laatstOntvangen) {
      const o = new Date(d.laatstOntvangen);
      if (!Number.isNaN(o.getTime())) {
        stats.push(`ontvangen ${o.toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Amsterdam' })}`);
      }
    }
    if (stats.length) blokken.push(`<div class="popup-stats">${stats.join(' · ')}</div>`);
    // 2026-08-26, op verzoek van Lex ("kan ik dit schema niet ergens handig
    // in de app beschikbaar hebben") -- alleen tonen als het zendschema van
    // dít station bekend is (zie NAVTEX_STATIONS_DATA/eerstvolgendeUitzending-
    // Tekst() hierboven), anders niets i.p.v. een lege/misleidende regel.
    const uitzendingTekst = d.stationId ? eerstvolgendeUitzendingTekst(d.stationId) : null;
    if (uitzendingTekst) {
      blokken.push(`<div class="popup-sub">🕓 eerstvolgende uitzending: ${escapeHtml(uitzendingTekst)}</div>`);
    }
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
    // 2026-08-26, op verzoek van Lex ("Details van de Boei... Kunnen we dit
    // ook verbeteren"), na een ZINK-N-lichtboei-melding zonder coördinaat:
    // naam + lichtkarakteristiek apart tonen i.p.v. de rauwe berichttekst,
    // zie boeiDetailsUit() in navtexLokaal.js. Alleen bij een LOSSE boei uit
    // die functie (boeiDetails), niet bij de boeiNaam uit een boei-LIJST
    // (splitsBoeiLijst) hieronder -- die heeft geen lichtkarakteristiek-
    // ontleding, alleen een naam, en toont dus gewoon zijn bestaande regel.
    if (d.boeiDetails?.naam) {
      // 2026-08-26, op verzoek van Lex (ZINK-N: "nadering Stellendam" viel
      // weg t.o.v. de andere boeien): toon de gebiedsomschrijving vóór de
      // naam, als die er is (zie boeiDetailsUit() in navtexLokaal.js).
      if (d.boeiDetails.gebied) {
        blokken.push(`<div class="popup-advies">Gebied: ${escapeHtml(d.boeiDetails.gebied)}</div>`);
      }
      blokken.push(`<div class="popup-advies">Naam: ${escapeHtml(d.boeiDetails.naam)}</div>`);
      if (d.boeiDetails.lichtKarakteristiek) {
        const omschrijvingTekst = d.boeiDetails.lichtOmschrijving ? ` (${d.boeiDetails.lichtOmschrijving})` : '';
        blokken.push(`<div class="popup-advies">Lichtkarakteristiek: ${escapeHtml(d.boeiDetails.lichtKarakteristiek)}${escapeHtml(omschrijvingTekst)}</div>`);
      }
    } else if (d.boeiNaam) {
      blokken.push(`<div class="popup-advies">${escapeHtml(d.boeiNaam)}</div>`);
    } else if (d.bericht) {
      blokken.push(`<div class="popup-advies">${escapeHtml(d.bericht)}</div>`);
    }
    if (d.positieUitBericht === false) {
      blokken.push('<div class="popup-sub">📍 positie geschat via zendstation - geen coördinaat in het bericht zelf gevonden</div>');
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
// 2026-09-02, op verzoek van Lex ("niet meteen zichtbaar, met een teller
// erop") — de strip staat nu standaard dicht achter een <summary>-knop met
// het aantal miniaturen erop. <details>/<summary> i.p.v. een eigen
// show/hide-knop met JS-state: dit werkt vanzelf zowel in de kleine
// Leaflet-popup als in de schermvullende overlay (die de popup-HTML 1-op-1
// kopieert, zie toonVolledigSchermPopup) zonder dat er ergens apart
// open/dicht-state bijgehouden hoeft te worden. De bestaande "tik op de
// popup opent schermvullend"-listener sluit .popup-fotostrip-toggle
// (de summary) nu ook uit, naast .popup-fotostrip-item (echte links) --
// anders zou open-/dichtklikken van de strip zelf ook meteen de
// schermvullende weergave triggeren.
function popupFotostripHtml(items) {
  const html = items
    .map((m) => {
      const badge = m.type === 'video' ? '<span class="popup-fotostrip-play">▶</span>' : '';
      return `<a href="${m.link}" target="_blank" rel="noopener" title="${escapeAttr(m.titel)}" class="popup-fotostrip-item"><img src="${m.thumbUrl ?? m.url}" alt="${m.type === 'video' ? 'Communityvideo' : 'Communityfoto'}" loading="lazy" onerror="this.closest('a').remove()">${badge}</a>`;
    })
    .join('');
  const aantal = items.length;
  const label = `📷 ${aantal} community-miniatu${aantal === 1 ? 'ur' : 'ren'} tonen`;
  return `<details class="popup-fotostrip-details"><summary class="popup-fotostrip-toggle">${escapeHtml(label)}</summary><div class="popup-fotostrip">${html}</div><div class="popup-fotostrip-label">📷 community, ongecontroleerd</div></details>`;
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
// werkt"), toen (2026-08-20 t/m 2026-08-26) een donkere bolboei met een
// oranje band en vlaggetje. Nog steeds alleen voor de kaart-marker, zelfde
// aanpak als LIFELINER_HELI_SVG hierboven; 🛟 blijft de
// EMOJI_PER_CATEGORIE-fallback voor lijsten/legenda.
//
// 2026-08-26, VIERDE poging, op verzoek van Lex: "het is uiteindelijk de
// bedoeling om alle generieke boeien onder te brengen in hun eigen event...
// ik vind alleen de huidige vorm niet zo mooi" -- dus bewust GEEN ander
// concept (dat werd eerst voorgesteld met 4 radicaal andere iconen, radio/
// driehoek/reddingsring/tekst, maar dat bleek een misverstand -- Lex wil
// een boei houden voor "nog niet ingedeeld", gewoon een mooiere). Eerste
// vervolgpoging (grijze bol met lantaarn i.p.v. vlag) werd ook afgewezen
// ("ik wil een andere kant op van die balvorm af") -- de rond-lichaam-vorm
// zelf was het probleem, niet de details erop. Nu een SPAR-vorm (smalle
// paal, taps toelopend, iets breder onderaan als vlotter) -- sluit aan bij
// de letterlijke berichttekst ("SPAR LIGHT BUOY", zie NAVTEX_BOEI_CARDINAAL_SVG
// hieronder) en bij de referentie-afbeelding die Lex zelf aandroeg voor de
// kardinaalboeien. Neutraal grijs (i.p.v. het oranje van de oude vorm, of
// een kleur die al iets zou kunnen betekenen) -- past bij "nog niet
// classificeerd/onbekend". Klein lichtbolletje boven de mast, een subtiele
// highlight-boog voor wat diepte/glans i.p.v. een platte vorm.
// 2026-08-26-fix, op verzoek van Lex ("moet iets groter en mag ook een
// kleur met gloed") -- het grijze/neutrale kleurenschema hierboven (bewuste
// keuze bij de spar-herbouw, "past bij nog niet classificeerd/onbekend")
// bleek in de praktijk toch te saai/onopvallend. Amber/oranje gekozen --
// pakt de kleurtraditie van de ALLEREERSTE boei-versie in dit bestand weer
// op (die had ook een oranje band/vlag), maar botst niet met de kleuren die
// inmiddels wel een eigen betekenis hebben (groen=net geplaatst,
// zwart/geel=kardinaal, blauw=techniek/uitzending zie NAVTEX_KABEL_SVG/
// NAVTEX_SURVEY_SVG/NAVTEX_RADIOMAST_SVG hierboven/hieronder). De kleur-MET-
// gloed (drop-shadow) zit in .navtex-pin.is-generieke-boei, samen met de
// grotere maat, zie styles.css.
const NAVTEX_BOEI_SVG = `
  <svg viewBox="0 0 24 24" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="navtexBoeiSparGradient" x1="0" y1="4" x2="0" y2="22" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#ff8a63"/>
        <stop offset="1" stop-color="#c81e0f"/>
      </linearGradient>
    </defs>
    <circle cx="12" cy="2.8" r="1.4" fill="#ffd4c2"/>
    <line x1="12" y1="4.2" x2="12" y2="8" stroke="#a81c0f" stroke-width="1.1" stroke-linecap="round"/>
    <path d="M11.3 8 L12.7 8 L14.2 17 Q14.2 20 12 21.6 Q9.8 20 9.8 17 Z" fill="url(#navtexBoeiSparGradient)"/>
    <path d="M9.9 16.8 Q12 15.6 14.1 16.8" fill="none" stroke="#ffc2ad" stroke-width="0.6" opacity="0.7"/>
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

// 2026-08-26, op vraag van Lex ("wat zijn dat voor platforms (niet uit de
// riglist toch?)" / "we willen niet het boorplatform icon dan toch?"): een
// "FOLLOWING PLATFORMS HAVE DEFECTS"-bericht (zie 'platform-defect' in
// EVENT_REGELS, navtexLokaal.js/ukho.js) gaat over VASTE productieplatforms
// met een navigatiehulpmiddel-defect, geen boorplatforms/riglijst-posities
// -- verdient dus een eigen, generiek icoon i.p.v. NAVTEX_RIG_SVG hierboven
// (die booreiland-derrick/antennebal suggereert actief boren, wat hier niet
// aan de orde is). Plat dek op rechte poten + een fakkelmast i.p.v. de
// derrick/kruisverband -- bewust GEEN antennebal/driehoekstoren, zodat het
// verschil met NAVTEX_RIG_SVG ook zonder de titel te lezen duidelijk is.
// Alleen de FALLBACK voor een platform zonder herkende specifieke status --
// zie classificeerRiglijstStatus() in navtexLokaal.js: een UNLIT/FOGHORN-
// defect krijgt gewoon zijn eigen specifieke icoon (NAVTEX_LICHT_UIT_SVG/
// NAVTEX_MISTHOORN_SVG), dit icoon is voor de rest.
const NAVTEX_PLATFORM_SVG = `
  <svg viewBox="0 0 24 24" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="#f4f6fb" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
      <rect x="6" y="9" width="12" height="4" rx="0.6"/>
      <path d="M7.5 13 L5 21 M16.5 13 L19 21 M10.5 13 L9 21 M13.5 13 L15 21"/>
      <path d="M4 21 H20"/>
      <path d="M17 9 V4.3"/>
    </g>
    <circle cx="17" cy="3.3" r="0.95" fill="#ff8a3d"/>
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

// 2026-08-27, op verzoek van Lex, na MSI 220/26 (platform K6DN: "TOTAL
// BLACK OUT") -- een total black-out is zwaarder dan een gewoon
// licht-onbetrouwbaar (heel platform stroomloos, niet alleen het licht),
// dus een eigen icoon i.p.v. hetzelfde NAVTEX_LICHT_UIT_SVG hergebruiken
// (zie classificeerRiglijstStatus() in navtexLokaal.js voor de herkenning,
// nieuw type 'blackout'). Lex was expliciet: geen standaard/generiek icoon
// (hij liet als tegenvoorbeeld het kale rondje-met-kruis zien dat op
// standaard zeekaarten voor een lichtprobleem gebruikt wordt) en ook geen
// cirkel als vorm ("Dus de laatste maar dan zonder cirkel" / "D zonder
// cirkel"). Daarom: zelfde peertje-silhouet als NAVTEX_LICHT_UIT_SVG
// hierboven (voetje, spiraaltje) zodat het herkenbaar bij dezelfde
// "licht"-iconenfamilie hoort, maar met een hoekige (zeshoekige) kop i.p.v.
// een cirkel, helemaal zwart gevuld (i.p.v. gedimd grijs) voor "volledig
// uit/kapot", en een fel rood kruis (i.p.v. het donkere kruisje) voor de
// hogere ernst -- zelfde rode (#ff3b3b) als het diagonale streepje bij
// NAVTEX_MISTHOORN_SVG, dezelfde ernst-conventie. Puur zwart bleek eerder
// (NAVTEX_ANKER_SVG/NAVTEX_BOEI_NOORD_SVG hieronder) nauwelijks zichtbaar
// tegen een donkere kaartondergrond, dus de kop/voet krijgen net als daar
// een lichte contourlijn (stroke #f4f6fb) rond de zwarte vulling.
const NAVTEX_BLACKOUT_SVG = `
  <svg viewBox="0 0 24 24" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
    <g fill="#1a1c22" stroke="#f4f6fb" stroke-width="1" stroke-linejoin="round">
      <path d="M12 3.2 L17 6.3 L16.1 13 Q16 14.8 14.7 14.8 L9.3 14.8 Q8 14.8 7.9 13 L7 6.3 Z"/>
      <path d="M9.3 14.8 L9.3 18.3 Q9.3 19.1 10.1 19.1 L13.9 19.1 Q14.7 19.1 14.7 18.3 L14.7 14.8 Z"/>
    </g>
    <g fill="none" stroke="#5c6274" stroke-width="1.1">
      <line x1="9.6" y1="16.4" x2="14.4" y2="16.4"/>
      <line x1="9.6" y1="17.7" x2="14.4" y2="17.7"/>
    </g>
    <line x1="10.4" y1="21" x2="13.6" y2="21" stroke="#5c6274" stroke-width="1.3" stroke-linecap="round"/>
    <path d="M9.8 7.5 Q9.8 6 12 6 Q14.2 6 14.2 7.5 Q14.2 9.5 12.7 10.4 L12.7 12 L11.3 12 L11.3 10.4 Q9.8 9.5 9.8 7.5 Z" fill="none" stroke="#5c6274" stroke-width="0.9"/>
    <g stroke="#ff3b3b" stroke-width="1.6" stroke-linecap="round">
      <line x1="8.4" y1="6.4" x2="15.6" y2="12.6"/>
      <line x1="15.6" y1="6.4" x2="8.4" y2="12.6"/>
    </g>
  </svg>
`.trim();

// 2026-08-26, op verzoek van Lex, na MSI 214/26 ("voor foghorns
// inoperative zou ik aparte icons willen trouwens") -- eigen icoon voor
// een defecte misthoorn i.p.v. hetzelfde generieke riglijst/licht-icoon,
// zie classificeerRiglijstStatus() in navtexLokaal.js/EVENT_REGELS
// ('foghorn') voor de herkenning.
//
// Eerste versie: kleine hoorn-silhouet + dubbel kruis (dezelfde aanpak als
// NAVTEX_LICHT_UIT_SVG hierboven) -- Lex' feedback na het zien van de
// echte kaart: "iets groter denk ik, met het kruis er doorheen is het
// onherkenbaar. Misschien een enkele diagonale streep er doorheen" (met
// referentiebeelden van herkenbare misthoorn/geluidssignaal-iconen erbij).
// Tweede versie: groter/vollere hoorn-vorm (mondstuk + bel) met
// geluidsboogjes, en één diagonale streep i.p.v. een kruis -- bij een
// langwerpige hoorn-vorm oogt een dubbel kruis al snel rommelig/onleesbaar
// (anders dan bij het compacte ronde lampje hierboven).
// Lex daarna nogmaals: "ik vind het icon van de foghorn niet goed... met
// rode streep er doorheen" (i.p.v. de subtiele donkere streep) en "de hoorn
// minder dik wat smaller en breder" en tenslotte "Meer dit aspect / lean"
// (met zijn referentiebeeld als voorbeeld) -- definitieve versie: een
// slanke, weinig geflareerde hoorn-cone (klein mondstuk-blokje + lage,
// langgerekte bel) met 4 rechte geluidslijnen i.p.v. boogjes, en een
// felrode (#ff3b3b) diagonale streep. Visueel geverifieerd op 22/90px.
const NAVTEX_MISTHOORN_SVG = `
  <svg viewBox="0 0 24 24" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
    <g fill="#e8eaed">
      <rect x="1" y="10.6" width="2.2" height="2.8" rx="0.35"/>
      <path d="M3.2,9.7 L13.5,7.6 L13.5,16.4 L3.2,14.3 Z"/>
    </g>
    <g stroke="#e8eaed" stroke-width="1.1" stroke-linecap="round" fill="none">
      <line x1="15.8" y1="7.4" x2="20.3" y2="4.6"/>
      <line x1="16.3" y1="9.8" x2="21.6" y2="8.3"/>
      <line x1="16.3" y1="14.2" x2="21.6" y2="15.7"/>
      <line x1="15.8" y1="16.6" x2="20.3" y2="19.4"/>
    </g>
    <line x1="1.8" y1="19.2" x2="21.5" y2="4.8" stroke="#ff3b3b" stroke-width="1.9" stroke-linecap="round"/>
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

// 2026-08-26, op verzoek van Lex ("die cardinal boeien kunnen we dus
// specifiek laten zien ook, in de juiste kleuren") -- een IALA-kardinaalteken
// (NORTH/EAST/SOUTH/WEST CARDINAL, zie cardinaalRichtingUit() in
// navtexLokaal.js/ukho.js) krijgt een eigen icoon met de ECHTE IALA-banden
// en topmark-vorm, i.p.v. het generieke groene NAVTEX_BOEI_NIEUW_SVG
// hierboven. Eerst geprobeerd met de rode referentie-afbeelding die Lex
// aandroeg (letterlijk gebruiken) -- afgewezen: rood is geen IALA-
// kardinaalkleur (dat is voor laterale/havenmarkeringen), dus dat zou op de
// kaart juist verwarrend zijn. Het vorm-idee (slanke mast met lichtje) is
// wel overgenomen. Zelfde opbouw als NAVTEX_BOEI_SVG/-_NIEUW_SVG hierboven
// (mast + cirkelvormig boeilichaam via clipPath), maar de band-kleuren en de
// topmark (twee kegels boven de mast) volgen nu de officiele IALA-regels:
//   Noord: zwart boven geel, beide kegels wijzen omhoog
//   Oost:  zwart-geel-zwart, kegels basis-tegen-basis (punten uit elkaar)
//   Zuid:  geel boven zwart, beide kegels wijzen omlaag
//   West:  geel-zwart-geel, kegels punt-tegen-punt (punten naar elkaar toe)
// De kegels krijgen een lichte contourlijn (stroke), want puur zwart bleek
// in een losse test nauwelijks zichtbaar tegen de donkere kaart -- de
// gedeelde .navtex-pin svg-schaduwfilter (zie styles.css) volstond daar niet
// voor (zelfde les als bij NAVTEX_ANKER_SVG hierboven).
function navtexKardinaalSvg(clipId, kegelPaden, bandenSvg) {
  return `
  <svg viewBox="0 0 24 24" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
    <defs><clipPath id="${clipId}"><circle cx="12" cy="16" r="6"/></clipPath></defs>
    <line x1="12" y1="8" x2="12" y2="10.5" stroke="#3a3d47" stroke-width="1.4" stroke-linecap="round"/>
    ${kegelPaden.map((d) => `<path d="${d}" fill="#1a1c22" stroke="#f4f6fb" stroke-width="0.8" stroke-linejoin="round"/>`).join('\n    ')}
    ${bandenSvg}
    <circle cx="12" cy="16" r="6" fill="none" stroke="#f4f6fb" stroke-width="0.6"/>
  </svg>
`.trim();
}
const NAVTEX_BOEI_NOORD_SVG = navtexKardinaalSvg(
  'navtexKardinaalClipNoord',
  ['M12 4 L14 7.5 L10 7.5 Z', 'M12 0.5 L14 4 L10 4 Z'],
  `<rect x="6" y="10" width="12" height="6" fill="#1a1c22" clip-path="url(#navtexKardinaalClipNoord)"/>
    <rect x="6" y="16" width="12" height="6" fill="#ffd633" clip-path="url(#navtexKardinaalClipNoord)"/>`
);
const NAVTEX_BOEI_OOST_SVG = navtexKardinaalSvg(
  'navtexKardinaalClipOost',
  ['M12 0.5 L14 4 L10 4 Z', 'M12 7.5 L14 4 L10 4 Z'],
  `<rect x="6" y="10" width="12" height="4" fill="#1a1c22" clip-path="url(#navtexKardinaalClipOost)"/>
    <rect x="6" y="14" width="12" height="4" fill="#ffd633" clip-path="url(#navtexKardinaalClipOost)"/>
    <rect x="6" y="18" width="12" height="4" fill="#1a1c22" clip-path="url(#navtexKardinaalClipOost)"/>`
);
const NAVTEX_BOEI_ZUID_SVG = navtexKardinaalSvg(
  'navtexKardinaalClipZuid',
  ['M12 7.5 L14 4 L10 4 Z', 'M12 4 L14 0.5 L10 0.5 Z'],
  `<rect x="6" y="10" width="12" height="6" fill="#ffd633" clip-path="url(#navtexKardinaalClipZuid)"/>
    <rect x="6" y="16" width="12" height="6" fill="#1a1c22" clip-path="url(#navtexKardinaalClipZuid)"/>`
);
const NAVTEX_BOEI_WEST_SVG = navtexKardinaalSvg(
  'navtexKardinaalClipWest',
  ['M12 4 L14 0.5 L10 0.5 Z', 'M12 4 L14 7.5 L10 7.5 Z'],
  `<rect x="6" y="10" width="12" height="4" fill="#ffd633" clip-path="url(#navtexKardinaalClipWest)"/>
    <rect x="6" y="14" width="12" height="4" fill="#1a1c22" clip-path="url(#navtexKardinaalClipWest)"/>
    <rect x="6" y="18" width="12" height="4" fill="#ffd633" clip-path="url(#navtexKardinaalClipWest)"/>`
);
const NAVTEX_BOEI_CARDINAAL_SVG = {
  noord: NAVTEX_BOEI_NOORD_SVG,
  oost: NAVTEX_BOEI_OOST_SVG,
  zuid: NAVTEX_BOEI_ZUID_SVG,
  west: NAVTEX_BOEI_WEST_SVG,
};

// 2026-08-26, op verzoek van Lex (PA04 "WAVERIDER BUOY DEPLOYED": "de
// waverider bouy is helemaal geel (volledig rond) met een antenne") --
// zie detail.boeiSoort in navtexLokaal.js. Na een echte referentiefoto van
// Lex een paar keer bijgesteld: romp een platte, brede koepel (i.p.v. een
// volledige bol) met een inkeping in de onderkant (het luikje op de foto),
// citroengele mast vanuit het midden van de romp i.p.v. wit vanaf de rand.
const NAVTEX_WAVERIDER_SVG = `
  <svg viewBox="0 0 24 24" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
    <path d="M5.5,17.2 A6.5,4 0 0 1 18.5,17.2 L11,17.2 L9,15.5 L7,17.2 Z" fill="#ffcc33" stroke="#8a6d1a" stroke-width="0.7" stroke-linejoin="round"/>
    <line x1="12" y1="16" x2="15.8" y2="2.2" stroke="#f5f500" stroke-width="1.3" stroke-linecap="round"/>
  </svg>
`.trim();

// 2026-08-26, op verzoek van Lex ("ik zie dat er berichten zijn die zijn
// herleid tot het uitzendstation... daar kan een radiomast voor gebruikt
// worden") -- zie positieIsStation in navtexLokaal.js/ukho.js hierboven.
// EERSTE versie (eigen mast + gebouwtje + golfboogjes) bleek te druk/wazig
// ("het radiostation wordt toch blur"). TWEEDE versie liet het gebouwtje
// juist helemaal weg (puur de NAVTEX_RIG_SVG-tekening hierboven, blauw
// i.p.v. wit) -- maar Lex wilde het gebouwtje terug ("dat radiostation wel
// met het gebouw maar verder gelijk houden aan rig"). DERDE, huidige versie:
// het gebouwtje van de eerste versie weer terug (links), de mast-tekening nu
// wel EXACT dezelfde geometrie als NAVTEX_RIG_SVG (antennebal, platform,
// kruisverband-poten, basisbalk) i.p.v. de eigen mast van versie 1 --
// horizontaal gecomprimeerd (elke x-co??rdinaat lineair herschaald van het
// origineel 4-20-bereik naar 11-21) zodat 'm rechts van het gebouwtje past,
// zelfde stroke-width (1.4) als het origineel. Kleur blauw + gloed (zie
// .navtex-pin.is-station in styles.css) blijven het onderscheid t.o.v. een
// echt booreiland-icoon.
const NAVTEX_RADIOMAST_SVG = `
  <svg viewBox="0 0 24 24" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="14.5" width="7.5" height="7.5" fill="none" stroke="#f4f6fb" stroke-width="1.4" stroke-linejoin="round"/>
    <rect x="4.3" y="17" width="2.2" height="2.2" fill="#f4f6fb"/>
    <g fill="none" stroke="#f4f6fb" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
      <path d="M16 1 V2.6"/>
      <circle cx="16" cy="0.9" r="0.6" fill="#f4f6fb" stroke="none"/>
      <rect x="14.75" y="3" width="2.5" height="1.6" rx="0.3"/>
      <path d="M14.125 5.4 L11.625 21 M17.875 5.4 L20.375 21"/>
      <path d="M14.125 5.4 L18.5 13 M17.875 5.4 L13.5 13"/>
      <path d="M13.5 13 L20.375 21 M18.5 13 L11.625 21"/>
      <rect x="13.1875" y="12" width="5.625" height="1.8" rx="0.3"/>
      <path d="M11 21 H21"/>
    </g>
    <g fill="none" stroke="#f4f6fb" stroke-width="1" stroke-linecap="round">
      <path d="M18.6 0.4 Q20.4 1.2 18.6 2"/>
      <path d="M13.4 0.4 Q11.6 1.2 13.4 2"/>
    </g>
  </svg>
`.trim();

// 2026-08-26, op verzoek van Lex ("een ander explosieven icon" — de losse
// bom-emoji verving vervangen door een eigen zee-mijn: gestileerd op een
// referentie die Lex aandroeg (een klassieke hoorn-contactmijn, spikey bol
// met highlight-stipje), zelf opnieuw getekend. Acht korte stekels rondom
// een donkere bol (zelfde donkere kleur #1a1c22 als de dunne contourlijnen
// elders, i.p.v. puur zwart, blijft zo consistent met de rest van de set),
// met rode stipjes op de stekeluiteinden als gevaar-accent (zelfde rode tint
// #ff5c5c als bij is-anker hierboven) en een lichte highlight voor de
// "glimmende bol"-uitstraling uit de referentie.
const NAVTEX_MUNITIE_SVG = `
  <svg viewBox="0 0 24 24" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
    <g stroke="#1a1c22" stroke-width="2.2" stroke-linecap="round">
      <line x1="18" y1="12" x2="20.2" y2="12"/>
      <line x1="16.24" y1="16.24" x2="17.8" y2="17.8"/>
      <line x1="12" y1="18" x2="12" y2="20.2"/>
      <line x1="7.76" y1="16.24" x2="6.2" y2="17.8"/>
      <line x1="6" y1="12" x2="3.8" y2="12"/>
      <line x1="7.76" y1="7.76" x2="6.2" y2="6.2"/>
      <line x1="12" y1="6" x2="12" y2="3.8"/>
      <line x1="16.24" y1="7.76" x2="17.8" y2="6.2"/>
    </g>
    <circle cx="12" cy="12" r="6" fill="#1a1c22" stroke="#f4f6fb" stroke-width="0.6"/>
    <g fill="#ff5c5c">
      <circle cx="20.2" cy="12" r="1"/>
      <circle cx="17.8" cy="17.8" r="1"/>
      <circle cx="12" cy="20.2" r="1"/>
      <circle cx="6.2" cy="17.8" r="1"/>
      <circle cx="3.8" cy="12" r="1"/>
      <circle cx="6.2" cy="6.2" r="1"/>
      <circle cx="12" cy="3.8" r="1"/>
      <circle cx="17.8" cy="6.2" r="1"/>
    </g>
    <circle cx="9.6" cy="9.6" r="1.3" fill="#f4f6fb" opacity="0.85"/>
  </svg>
`.trim();

// 2026-08-26, op verzoek van Lex (Oostende MSI 130/26: "OBSTACLES ON THE
// SEABED..." — zie de verbrede 'obstructie'-regel in navtexLokaal.js/
// ukho.js) — eigen icoon i.p.v. het generieke ⚠️-emoji, in dezelfde stijl
// als NAVTEX_MUNITIE_SVG/NAVTEX_ANKER_SVG hierboven: een gebroken/jagged
// rots-silhouet (donkere vulling, lichte contourlijn) met een golflijn
// erover heen -- vergelijkbaar met het officiele zeekaart-symbool voor een
// "rots die bij laag water droogvalt/net onder water staat" (rots
// gedeeltelijk zichtbaar boven de golflijn) -- plus een klein rood
// uitroepteken op de hoogste piek als gevaar-accent (zelfde rode tint
// #ff5c5c als bij NAVTEX_ANKER_SVG/NAVTEX_MUNITIE_SVG).
const NAVTEX_OBSTRUCTIE_SVG = `
  <svg viewBox="0 0 24 24" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
    <path d="M2,20 L4,11 L6.5,15 L9,7 L11.5,14 L14,6 L16.5,13 L19,9.5 L22,20 Z"
          fill="#1a1c22" stroke="#f4f6fb" stroke-width="0.8" stroke-linejoin="round"/>
    <path d="M1,15.5 C4,13.5 6,13.5 8,15.5 C10,17.5 12,17.5 14,15.5 C16,13.5 18,13.5 20,15.5 C21,16.3 22,16.5 23,15.8"
          fill="none" stroke="#4c9df0" stroke-width="1.4" stroke-linecap="round" opacity="0.9"/>
    <g stroke="#ff5c5c" stroke-width="1.6" stroke-linecap="round">
      <line x1="14" y1="4.4" x2="14" y2="1.6"/>
      <circle cx="14" cy="0.4" r="0.75" fill="#ff5c5c" stroke="none"/>
    </g>
  </svg>
`.trim();

const NAVTEX_EVENT_ICOON = {
  riglijst: NAVTEX_RIG_SVG,
  'licht-onbetrouwbaar': NAVTEX_LICHT_UIT_SVG,
  blackout: NAVTEX_BLACKOUT_SVG,
  'safety-zone': '🚧',
  kabel: NAVTEX_KABEL_SVG,
  survey: NAVTEX_SURVEY_SVG,
  wetenschappelijk: '🔬',
  wrak: '☠️',
  obstructie: NAVTEX_OBSTRUCTIE_SVG,
  // 2026-08-24, op verzoek van Lex ("neem gelijk een bom/granaat icon mee
  // als er bij een gebied over ordinance of munitions, explosives wordt
  // gemeld") — zie 'munitie' in navtexLokaal.js/ukho.js EVENT_REGELS.
  munitie: NAVTEX_MUNITIE_SVG,
  oefening: '🎯',
  'anker-verloren': NAVTEX_ANKER_SVG,
  'boei-nieuw': NAVTEX_BOEI_NIEUW_SVG,
  foghorn: NAVTEX_MISTHOORN_SVG,
  'platform-defect': NAVTEX_PLATFORM_SVG,
};
function hazardIconHtml(s) {
  if (isLifeliner(s)) return LIFELINER_HELI_SVG;
  if (s.categorie === 'navtex') {
    // 2026-08-26, zie NAVTEX_RADIOMAST_SVG hierboven -- staat v??r de
    // eventType-lookup, want als de positie sowieso al "gewoon het
    // zendstation" is (geen echte coordinaat in het bericht), is dat
    // belangrijker om te tonen dan WAT voor bericht het is.
    if (s.detail?.positieIsStation) return NAVTEX_RADIOMAST_SVG;
    // 2026-08-26, zie NAVTEX_BOEI_CARDINAAL_SVG hierboven -- alleen van
    // toepassing op boei-nieuw-signalen MET een herkende windrichting;
    // andere boei-nieuw-signalen (geen kardinaalteken) houden gewoon het
    // bestaande groene icoon via de normale NAVTEX_EVENT_ICOON-lookup.
    const kardinaal = s.detail?.eventType === 'boei-nieuw' ? NAVTEX_BOEI_CARDINAAL_SVG[s.detail?.boeiRichting] : null;
    // 2026-08-26, zie NAVTEX_WAVERIDER_SVG hierboven -- zelfde
    // voorrangsvolgorde-idee als kardinaal hierboven, een boei-nieuw-signaal
    // is nooit tegelijk kardinaal EN waverider dus de volgorde t.o.v.
    // elkaar maakt niet uit.
    const waverider = s.detail?.eventType === 'boei-nieuw' && s.detail?.boeiSoort === 'waverider' ? NAVTEX_WAVERIDER_SVG : null;
    const rigStatus = (s.detail?.eventType === 'riglijst' || s.detail?.eventType === 'platform-defect') ? NAVTEX_EVENT_ICOON[s.detail?.rigStatusType] : null;
    // 2026-08-26, op verzoek van Lex ("alle boeien die nu rood zijn worden
    // groen, wat waverider hiervoor ook had... alle boeien die geen eigen
    // event hebben nog") -- de rood/oranje NAVTEX_BOEI_SVG hierboven was tot
    // nu toe de terugval voor ALLES zonder eigen icoon (dus ook niet-
    // gebonden aan 'boei-nieuw'). Vervangen door dezelfde groene
    // NAVTEX_BOEI_NIEUW_SVG als hierboven, zodat elke boei zonder eigen
    // classificatie er nu consequent hetzelfde (groen) uitziet i.p.v. soms
    // groen (boei-nieuw) en soms rood (deze algemene terugval).
    return kardinaal ?? waverider ?? rigStatus ?? NAVTEX_EVENT_ICOON[s.detail?.eventType] ?? NAVTEX_BOEI_NIEUW_SVG;
  }
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
// 2026-08-28, op verzoek van Lex ("waarom gebruiken we eigenlijk niet de
// echte zeekaart?"): de dieptelaag (EMODnet Bathymetry, via de eigen
// tegel-proxy) die van de kale OSM-zee een echte zeekaart maakt —
// dieptetinten onder de seamark-laag. Zie TEGEL_DIEPTE_* in server.js.
let zeeDiepteLaag = null;
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
// 2026-08-30, op verzoek van Lex ("datum en tijd van deze melding, altijd de
// meest actuele, alsmede het station" -- ook voor de windvanen): per
// synopsisbron de uitgiftetijd van de verwachting zelf (`uitgegeven`, uit
// de KNMI-/Met Office-pagina gehaald, zie uitgifteTijdIn() in de backend)
// en het moment waarop de backend 'm ophaalde (`bijgewerkt`). Getoond in de
// gebieds-/vaanpopup, zie synopsisHerkomstHtml().
const zeeSynopsisMeta = { knmi: null, metoffice: null };

async function laadZeeSynopsis() {
  try {
    const data = await fetch('/api/zee-synopsis').then((r) => r.json());
    zeeSynopsisPerGebied = data.gebieden ?? {};
    zeeSynopsisMeta.knmi = { uitgegeven: data.uitgegeven ?? null, bijgewerkt: data.bijgewerkt ?? null };
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
    zeeSynopsisMeta.metoffice = { uitgegeven: data.uitgegeven ?? null, bijgewerkt: data.bijgewerkt ?? null };
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
  // 2026-08-26-herzien (2e ronde), op verzoek van Lex ("de gold als je de
  // golf zelf de vorm mee wil geven, globaal zoveel mogelijk de bovenste
  // lijn pakken... liever nog deze golf overnemen") -- de vorige versie had
  // wel de juiste OPZET (grote golf + spiraal-hoek + waterlijnen) maar de
  // krul zelf was te klein/te rond t.o.v. Lex' referentie-afbeelding. Path
  // opnieuw getekend met een duidelijke S-zwaai in de opgaande lijn (de
  // referentie stijgt niet in één rechte boog, maar buigt eerst iets naar
  // links voor 'ie doorzet naar de top) en een grotere, verder doorgetrokken
  // spiraal, zodat het silhouet dichter bij de referentie komt. Zelf
  // getekend/benaderd (geen overname van de referentie-afbeelding zelf),
  // driedelig pad zodat de vorm bij elke maat een eigen, scherp gedefinieerd
  // stuk blijft i.p.v. verder te verdunnen.
  return '<svg class="golf-emoji" viewBox="0 0 24 24" aria-hidden="true">'
    + '<path d="M1,18 C1,14 4,12 3.3,8 C2.8,4.8 6.5,2 11,2 C15.5,2 19,4.3 19,8 C19,10.9 16,12.4 13,11.1 C10.9,10.2 10.6,7.9 12.4,7 C13.5,6.5 14.6,7.2 14,7.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>'
    + '<path d="M1,17.5 C3.5,15.5 5.5,15.5 8,17.5 C10.5,19.5 12.5,19.5 15,17.5 C17.5,15.5 19.5,15.5 22,17.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'
    + '<path d="M1,21.5 C3.5,19.5 5.5,19.5 8,21.5 C10.5,23.5 12.5,23.5 15,21.5 C17.5,19.5 19.5,19.5 22,21.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'
    + '</svg>';
}

// 2026-08-25, op verzoek van Lex ("geen golfhoogte hoor" bij de Fisher-popup,
// "grote letters in een andere kleur... onder de titel met ruimte boven en
// onder 3 mm") — golfHoogteVoorGebied() bestond al voor het kaartlabel-golfje
// (zie zeeGebiedLabelHtml hierboven) maar werd nooit in de klik-popup zelf
// getoond. Eén keer berekend en vóór alle vier de content-varianten (knmi/
// metoffice/waarschuwingen/leeg) geplakt, zodat 'ie overal verschijnt zodra
// er een golfhoogte uit de synopsistekst te halen viel — en gewoon wegvalt
// (lege string) als dat niet lukt, i.p.v. een kale/foutieve regel.
// 2026-08-30, zie zeeSynopsisMeta: één herkomstregel voor de synopsis-
// popup en de windvanen -- "uitgegeven" is de tijd van de verwachting zelf,
// "opgehaald" wanneer de backend 'm binnenhaalde. Bij ontbrekende
// uitgiftetijd (pagina-opmaak gewijzigd) alleen het ophaalmoment.
function synopsisHerkomstHtml(bron) {
  const meta = zeeSynopsisMeta[bron];
  const naam = bron === 'knmi' ? 'KNMI' : 'UK Met Office';
  const delen = [`Bron: ${naam}`];
  if (meta?.uitgegeven) delen.push(`uitgegeven ${nieuwSindsTekst(meta.uitgegeven) ?? '—'}`);
  if (meta?.bijgewerkt) delen.push(`opgehaald ${nieuwSindsTekst(meta.bijgewerkt) ?? '—'}`);
  return `<div class="popup-sub">${escapeHtml(delen.join(' · '))}</div>`;
}

// 2026-08-30, voor de gale-vanen die (mede) op de eigen NAVTEX-ontvangst
// steunen: station, berichttijd (DTG) en laatste ontvangstmoment van het
// meest recente galewarning-bericht -- zelfde velden als bij de
// druksymbolen (zie drukgebiedenUitNavtex()/verversDrukgebieden()).
function navtexGaleHerkomstHtml(info) {
  if (!info) return '';
  return `<div class="popup-sub">${info.allClear ? '"NO WARNING"' : 'Galewarning'} uit eigen NAVTEX-ontvangst${info.code ? ` (${escapeHtml(info.code)})` : ''}</div>`
    + `<div class="popup-sub">Station: ${escapeHtml(info.station ?? 'onbekend')}</div>`
    + `<div class="popup-sub">Bericht: ${info.berichtTijd ? escapeHtml(nieuwSindsTekst(info.berichtTijd) ?? '—') : '— (datum onzeker)'}`
    + `${info.ontvangenTijd ? ` · ontvangen ${escapeHtml(nieuwSindsTekst(info.ontvangenTijd) ?? '—')}` : ''}</div>`;
}

function zeeSynopsisPopupHtml(naam) {
  const gekozen = synopsisBronVoorGebied(naam);
  const golfbereik = golfHoogteVoorGebied(naam);
  const titelHtml = `<div class="popup-titel">${escapeHtml(naam)}</div>${golfbereik ? `<div class="popup-golfhoogte">${golfIcoonHtml()} ${golfbereik}</div>` : ''}`;
  if (gekozen?.bron === 'knmi') {
    return `${titelHtml}<div class="popup-advies">${escapeHtml(gekozen.synopsis.tekst)}</div>${synopsisHerkomstHtml('knmi')}`;
  }
  if (gekozen?.bron === 'metoffice') {
    return `${titelHtml}<div class="popup-sub">Synopsis (bron: UK Met Office):</div><div class="popup-advies">${escapeHtml(gekozen.synopsis.tekst)}</div>${synopsisHerkomstHtml('metoffice')}`;
  }
  const waarschuwingen = zeeWaarschuwingenPerGebied[naam.toUpperCase()] ?? [];
  if (waarschuwingen.length > 0) {
    const meldingTekst = waarschuwingen.length === 1 ? '1 actieve scheepvaartwaarschuwing' : `${waarschuwingen.length} actieve scheepvaartwaarschuwingen`;
    const lijstHtml = waarschuwingen
      .map((w) => `<div class="popup-advies">${w.id ? `<strong>${escapeHtml(w.id)}</strong> - ` : ''}${escapeHtml(w.tekst)}</div>`)
      .join('');
    return `${titelHtml}<div class="popup-sub">Geen synopsis beschikbaar voor dit gebied - wel ${meldingTekst} (bron: SeaLagom):</div>${lijstHtml}`;
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
// ongeluk al bij "ROUGH"/"HIGH" matchen. Bewust een RUW indicatief bereik,
// geen exacte meting -- het "~"-teken dat dat eerst benadrukte is 2026-08-26
// op verzoek van Lex weer weggehaald (stond ie nu naast het golf-icoon,
// dat maakt zelf al duidelijk dat het indicatief is).
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
  // 2026-08-28, op verzoek van Lex (corpus-analyse: 18 berichten met
  // zicht-informatie): mist/slecht-zicht-badge naast het golfje, alleen
  // bij STRUCTUREEL slecht zicht — zie zichtVoorGebied() verderop.
  const zicht = zichtVoorGebied(naam);
  const zichtHtml = zicht ? ` <span class="zicht-label">${mistIcoonHtml()} ${zicht}</span>` : '';
  return golfbereik
    ? `${escapeHtml(naam)} <span class="golf-label">${golfIcoonHtml()} ${golfbereik}</span>${zichtHtml}`
    : `${escapeHtml(naam)}${zichtHtml}`;
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

// ---- Gale-windvanen per zeegebied (2026-08-27) ------------------------
// Op verzoek van Lex ("er zitten galewarnings in de berichten... een
// windvaan met de windkracht of de voorspellende verandering, dedup is daar
// super belangrijk, mooi icon, rood, best wat groter"). Bewust GEEN parsing
// van losse (ruizige) NAVTEX-berichten: de schone, al opgehaalde teksten
// per zeegebied (KNMI-synopsis, Met Office shipping forecast, SeaLagom-
// waarschuwingen) noemen gale/storm mét kracht en verwachting letterlijk —
// en door per GEBIED te kijken is de dedup vanzelf geregeld: hooguit één
// vaan per zeegebied, de nieuwste verwachting wint, hoe vaak stations
// hetzelfde ook herhalen.
//
// Herkenning (internationale shipping-forecast-terminologie, hoogste wint):
// HURRICANE FORCE 12 > VIOLENT STORM 11 > STORM (FORCE) 10 > SEVERE GALE 9
// > GALE (FORCE) 8 > kaal "GALE" (zonder cijfer -> 8). "NO WARNING"/
// "GALE WARNINGS." als kop zonder inhoud matcht niet (negatieve check).
// Trendpijl: INCREASING/LATER/SOON/EXPECTED/IMMINENT -> ↗ ("wordt/komt"),
// DECREASING/MODERATING -> ↘ (neemt af).
const GALE_NIVEAUS = [
  { regex: /HURRICANE\s+FORCE\s*12|HURRICANE\s+FORCE/, kracht: 12 },
  { regex: /VIOLENT\s+STORM\s*(?:11)?/, kracht: 11 },
  { regex: /STORM(?:\s+FORCE)?\s*10|(?<!VIOLENT\s)STORM\s+FORCE/, kracht: 10 },
  { regex: /SEVERE\s+GALE\s*(?:FORCE\s*)?9|SEVERE\s+GALE/, kracht: 9 },
  { regex: /GALE\s*(?:FORCE\s*)?[89]|(?<!NO\s)(?<!SEVERE\s)GALE(?!\s*WARNINGS?\s*[.:]?\s*$)/, kracht: 8 },
];

// 2026-08-27 (vervolg, op verzoek van Lex "kunnen we nog wat met de
// windrichting?"): windrichting uit dezelfde tekst halen. Shipping-forecast-
// teksten beginnen vrijwel altijd met de richting ("SOUTHWESTERLY 5 TO 7"),
// en een draaiing staat er als "VEERING W" (ruimend) of "BACKING S"
// (krimpend). Samengestelde richtingen (NE/SW/...) staan bewust vóór de
// enkelvoudige in de lijst — "SOUTHWESTERLY" mag nooit als "SOUTH" matchen
// (de \b-grenzen voorkomen dat ook al, maar volgorde maakt het expliciet).
const WINDRICHTING_TOKENS = [
  { regex: /\bNORTH-?EAST(?:ERLY)?\b|\bNE\b/, nl: 'NO', graden: 45 },
  { regex: /\bNORTH-?WEST(?:ERLY)?\b|\bNW\b/, nl: 'NW', graden: 315 },
  { regex: /\bSOUTH-?EAST(?:ERLY)?\b|\bSE\b/, nl: 'ZO', graden: 135 },
  { regex: /\bSOUTH-?WEST(?:ERLY)?\b|\bSW\b/, nl: 'ZW', graden: 225 },
  { regex: /\bNORTH(?:ERLY)?\b|\bN\b/, nl: 'N', graden: 0 },
  { regex: /\bEAST(?:ERLY)?\b|\bE\b/, nl: 'O', graden: 90 },
  { regex: /\bSOUTH(?:ERLY)?\b|\bS\b/, nl: 'Z', graden: 180 },
  { regex: /\bWEST(?:ERLY)?\b|\bW\b/, nl: 'W', graden: 270 },
];

// Eerste richting op of ná `vanaf` in de tekst — vroegste treffer wint (bij
// "W OR NW" is de huidige richting dus W, precies wat de forecast bedoelt).
function eersteWindrichting(t, vanaf = 0) {
  const stuk = t.slice(vanaf);
  let beste = null;
  for (const token of WINDRICHTING_TOKENS) {
    const m = stuk.match(token.regex);
    if (m && (beste === null || m.index < beste.index)) beste = { index: m.index, nl: token.nl, graden: token.graden };
  }
  return beste;
}

// 2026-08-28-fix, uit Lex' echte data ("een aantal vermeldingen met Gale
// niet terug zoals verwacht" — en het omgekeerde bleek ook te spelen): de
// Met Office deelt één tekst over meerdere gebieden, en een gale kan daarin
// expliciet aan een ANDER gebied hangen ("...4 to 6, but 7 or gale 8 at
// first in north Fisher" staat óók in de German Bight-tekst; "occasionally
// gale 8 in South Utsire" in die van Forties). Zonder deze check kreeg
// German Bight een 8-vaan die van Fisher was. Oplossing: elk gale-woord
// dat binnen zijn eigen zin door "IN <bekend zeegebied>" wordt ingeperkt
// telt alleen mee als dat gebied het eigen gebied is — anders wordt het
// woord uitgewist en valt de tekst terug op wat er wél voor dit gebied
// staat. "IN PRECIPITATION" e.d. is géén gebied en perkt dus niets in.
const BEKENDE_ZEEGEBIEDEN = new Set([
  'VIKING', 'UTSIRE', 'FORTIES', 'CROMARTY', 'FORTH', 'TYNE', 'DOGGER',
  'FISHER', 'GERMAN BIGHT', 'HUMBER', 'THAMES', 'DOVER', 'WIGHT', 'PORTLAND',
  'PLYMOUTH', 'BISCAY', 'TRAFALGAR', 'FITZROY', 'SOLE', 'LUNDY', 'FASTNET',
  'IRISH SEA', 'SHANNON', 'ROCKALL', 'MALIN', 'HEBRIDES', 'BAILEY',
  'FAIR ISLE', 'FAEROES', 'SOUTHEAST ICELAND',
]);
const WINDSTREEK_VOORVOEGSEL = /^(?:NORTH|SOUTH|EAST|WEST)(?:ERN|EAST|WEST)?\s+/;

function wisGaleVoorAndereGebieden(t, gebiedNaam) {
  if (!gebiedNaam) return t;
  const eigen = String(gebiedNaam).toUpperCase().replace(WINDSTREEK_VOORVOEGSEL, '');
  const re = /SEVERE\s+GALE|GALE|(?<!THUNDER)STORM|HURRICANE/g;
  const wissen = [];
  let m;
  while ((m = re.exec(t)) !== null) {
    const zinEinde = t.indexOf('.', m.index);
    const zin = t.slice(m.index, zinEinde === -1 ? t.length : zinEinde);
    const q = zin.match(/\bIN\s+((?:NORTH|SOUTH|EAST|WEST)(?:ERN)?\s+)?([A-Z]+(?:\s+[A-Z]+)?)/);
    if (!q) continue;
    // Twee woorden proberen ("GERMAN BIGHT", "FAIR ISLE"), dan één —
    // UTSIRE dekt north/south Utsire, de windstreek is al apart gestript.
    const woorden = q[2].trim().split(/\s+/);
    const twee = woorden.slice(0, 2).join(' ');
    const genoemd = BEKENDE_ZEEGEBIEDEN.has(twee) ? twee : BEKENDE_ZEEGEBIEDEN.has(woorden[0]) ? woorden[0] : null;
    if (genoemd && genoemd !== eigen && !eigen.startsWith(genoemd)) wissen.push([m.index, m.index + m[0].length]);
  }
  if (!wissen.length) return t;
  let uit = t;
  for (const [van, tot] of wissen) uit = uit.slice(0, van) + ' '.repeat(tot - van) + uit.slice(tot);
  return uit;
}

function galeInfoUitTekst(tekst, gebiedNaam = null) {
  if (!tekst) return null;
  let t = String(tekst).toUpperCase();
  // 2026-08-27-fix (live voorbeeld van Lex: "Northeast Forties:
  // Southeasterly 5 to 7, perhaps gale 8 later"): een gebiedskop kan zelf
  // een windstreek bevatten ("Northeast Forties") die dan ten onrechte als
  // windrichting zou matchen. Een vroege dubbele punt is altijd zo'n kop —
  // alles ervoor weggooien; de echte windbeschrijving begint erna. Alleen
  // als er een LETTER voor de dubbele punt staat — een tijdstip ("11:06")
  // is geen kop.
  const dubbelePunt = t.indexOf(':');
  if (dubbelePunt > 0 && dubbelePunt < 40 && /[A-Z]/.test(t[dubbelePunt - 1])) t = t.slice(dubbelePunt + 1);
  // "GALE WARNINGS. ... NO WARNING." (eigen-ontvangst/KNMI-vorm) is juist
  // de mededeling dat er NIETS is — niet op de sectiekop afgaan.
  // 2026-08-28: (?<!THUNDER) — de KNMI-teksten zeggen "risk of a
  // thunderstorm" en dat mag hier nooit als STORM meetellen.
  const zonderKop = wisGaleVoorAndereGebieden(t.replace(/GALE\s+WARNINGS?\s*[.:]/g, ' '), gebiedNaam);
  if (/NO\s+(?:GALE\s+)?WARNINGS?/.test(t) && !/GALE\s*(?:FORCE\s*)?[89]|SEVERE\s+GALE|(?<!THUNDER)STORM|HURRICANE/.test(zonderKop)) return null;
  let kracht = null;
  for (const niveau of GALE_NIVEAUS) {
    if (niveau.regex.test(zonderKop)) {
      kracht = niveau.kracht;
      break; // lijst staat van zwaar naar licht — eerste treffer is de hoogste
    }
  }
  if (kracht == null) return null;
  // Expliciet cijfer wint van het niveau-default (bv. "GALE 9" -> 9).
  const cijfer = zonderKop.match(/(?:SEVERE\s+)?GALE\s*(?:FORCE\s*)?(\d{1,2})|STORM\s*(?:FORCE\s*)?(1[01])/);
  const expliciet = Number(cijfer?.[1] ?? cijfer?.[2]);
  if (Number.isFinite(expliciet) && expliciet > kracht) kracht = expliciet;
  const trend = /INCREASING|LATER|SOON|EXPECTED|IMMINENT|PERHAPS|POSSIBLY/.test(zonderKop)
    ? '↗'
    : /DECREASING|MODERATING/.test(zonderKop)
      ? '↘'
      : '';
  // Windrichting: de eerste genoemde is de huidige; staat er een VEERING/
  // BACKING met daarná een richting, dan is dát waar 'ie heen draait.
  const richting = eersteWindrichting(zonderKop);
  let richtingNa = null;
  const draai = zonderKop.match(/VEERING|BACKING/);
  if (draai) {
    const na = eersteWindrichting(zonderKop, draai.index + draai[0].length);
    if (na && (!richting || na.nl !== richting.nl)) richtingNa = na;
  }
  // 2026-08-27-fix, op melding van Lex ("er staat 8 terwijl de werkelijke
  // wind lager is, de trend is wel naar 8"): shipping-forecast-teksten
  // beginnen met de HUIDIGE kracht ("SE 5 TO 7, occasionally gale 8 later")
  // — het gale-getal is dan de verwáchting, niet het nu.
  // 2026-08-27-herzien (live Fisher-tekst van Lex: "Easterly or
  // southeasterly veering southerly or southwesterly, 4 to 6, but 7 or gale
  // 8 at first in north Fisher"): het oude 40-tekens-venster achter de
  // richting was te krap — een dubbele richting + veering duwt "4 to 6" er
  // al uit. Nu: de eerste losse kracht(range) VÓÓR de gale-term is de
  // algemene range (patroon \b1-12\b matcht nooit drukwaarden als 1013, en
  // golfhoogte/zicht komen in deze teksten pas ná de windzin). Bij "X TO Y"
  // telt de bovenkant; alleen geaccepteerd als 'ie ONDER het gale-getal
  // ligt.
  // En de omkering: "GALE 8 AT FIRST" betekent dat de gale er NÚ is en
  // daarna afzakt naar die algemene range — precies andersom dan "gale 8
  // later". Dat wordt naKracht (voor de "8→6"-weergave), met trend ↘.
  const galeIndex = zonderKop.search(/SEVERE\s+GALE|GALE|(?<!THUNDER)STORM|HURRICANE/);
  let algemeneKracht = null;
  if (galeIndex > 0) {
    const voorGale = zonderKop.slice(0, galeIndex);
    const m = voorGale.match(/\b([1-9]|1[0-2])(?:\s*TO\s*([1-9]|1[0-2]))?\b/);
    if (m) {
      const bovenkant = Math.max(Number(m[1]), Number(m[2] ?? 0));
      if (bovenkant < kracht) algemeneKracht = bovenkant;
    }
  }
  // Staat er niets vóór de gale-term ("SW GALE 8 INCREASING SEVERE GALE 9
  // SOON"), dan is het EERSTE gale-cijfer zelf de huidige kracht — mits
  // lager dan het eindgetal.
  if (algemeneKracht === null) {
    const eersteGaleCijfer = zonderKop.match(/(?:SEVERE\s+)?GALE\s*(?:FORCE\s*)?([89])|STORM\s*(?:FORCE\s*)?(1[01])/);
    const eerste = Number(eersteGaleCijfer?.[1] ?? eersteGaleCijfer?.[2]);
    if (Number.isFinite(eerste) && eerste < kracht) algemeneKracht = eerste;
  }
  const galeEerst = galeIndex > -1 && /AT\s+FIRST/.test(zonderKop.slice(galeIndex, galeIndex + 60));
  let huidigeKracht = null;
  let naKracht = null;
  let trendDefinitief = trend;
  if (galeEerst) {
    // Gale nu, zakt af naar de algemene range.
    naKracht = algemeneKracht; // mag null zijn -> dan alleen "8↘"
    trendDefinitief = '↘';
  } else {
    huidigeKracht = algemeneKracht;
  }
  return { kracht, trend: trendDefinitief, richting: richting ?? null, richtingNa, huidigeKracht, naKracht };
}

// ---- Gale-warnings uit de eigen NAVTEX-ontvangst (2026-08-28) ---------
// Op melding van Lex: een échte, zelf ontvangen KNMI-galewarning
// ("GALEWARNING, DTG 28 AUG 0702 UTC. DOVER. THAMES. SOUTHWEST 7. HUMBER.
// GERMAN BIGHT. DOGGER. NO WARNING.") gaf geen vanen — de vanen keken
// alleen naar de synopsis-bronnen, en dit meergebieden-format zou de
// algemene parser bovendien breken (het "NO WARNING" aan het eind — dat
// alleen over de LAATSTE gebieden gaat — zou het hele bericht wegvagen).
// Eigen parser dus: gebiedsnamen verzamelen tot er een wind- of
// NO WARNING-zin volgt, en die zin geldt dan precies voor de verzamelde
// gebieden. Alleen berichten met GALE(-)WARNING erin en jonger dan 6 uur
// (KNMI herhaalt/vernieuwt ruim binnen die termijn) tellen mee.
const NAVTEX_GEBIED_NAMEN = {
  DOVER: 'Dover', THAMES: 'Thames', HUMBER: 'Humber', 'GERMAN BIGHT': 'German Bight',
  DOGGER: 'Dogger', FISHER: 'Fisher', FORTIES: 'Forties', VIKING: 'Viking',
  TYNE: 'Tyne', FORTH: 'Forth',
};
const NAVTEX_GALE_VERS_MS = 6 * 60 * 60 * 1000;

function parseNavtexGaleWarning(tekst) {
  const heel = String(tekst ?? '').toUpperCase();
  if (!/GALE\s*WARNING/.test(heel.replace(/GALEWARNING/g, 'GALE WARNING'))) return [];
  // 2026-08-28-fix, uit Lex' echte ontvangstbestand: de KNMI "FORECAST
  // DUTCH EEZ"-berichten (PE-codes) beginnen met een "GALE WARNINGS."-
  // sectie (die passeert de poort hierboven terecht), maar daarná volgen
  // SYNOPSIS en een verwachting per gebied waarin dezelfde gebiedsnamen
  // ("THAMES.") opnieuw langskomen mét gewone krachtcijfers — de replay op
  // het echte bestand gaf zo spookvanen (Thames 6 uit een routineverwachting).
  // Alleen het stuk vóór SYNOPSIS/FORECAST VALID is de warning-sectie.
  const sectieEinde = heel.search(/\bSYNOPSIS\b|\bFORECAST\s+VALID\b/);
  const t = sectieEinde > -1 ? heel.slice(0, sectieEinde) : heel;
  const delen = t.split(/[.\n]+/).map((d) => d.trim()).filter(Boolean);
  const uit = [];
  let verzameld = [];
  for (const deel of delen) {
    // "NORTH GERMAN BIGHT" e.d.: windstreek-voorvoegsel op een gebiedsnaam
    // strippen en opnieuw proberen — zelfde valkuil als bij de Met Office-
    // koppen ("Northeast Forties").
    const kaal = deel.replace(/^(?:NORTH|SOUTH|EAST|WEST)\s+/, '');
    const gebied = NAVTEX_GEBIED_NAMEN[deel] ?? NAVTEX_GEBIED_NAMEN[kaal];
    if (gebied) {
      verzameld.push(gebied);
      continue;
    }
    // 2026-08-28-fix (Lex' eigen ontvangst, PB01 van de kustwacht:
    // "GERMAN BIGHT EAST TO SOUTHEAST 7."): gebiedsnaam en windzin kunnen
    // ook in ÉÉN zin staan — dan is de rest van de zin de windbeschrijving
    // voor dat gebied. Zonder dit werd die 7 volledig gemist.
    let zin = deel;
    for (const naam of Object.keys(NAVTEX_GEBIED_NAMEN)) {
      const bronDeel = kaal.startsWith(`${naam} `) ? kaal : deel.startsWith(`${naam} `) ? deel : null;
      if (bronDeel) {
        verzameld.push(NAVTEX_GEBIED_NAMEN[naam]);
        zin = bronDeel.slice(naam.length + 1);
        break;
      }
    }
    if (!verzameld.length) continue; // kop/DTG-zin vóór de eerste gebiedsnaam
    if (/NO\s+WARNING/.test(zin)) {
      // 2026-08-28: expliciet doorgeven i.p.v. stilletjes overslaan — een
      // NIEUWERE "NO WARNING" (zoals PB03 om 02:11) moet een oudere
      // warning voor hetzelfde gebied kunnen aflossen, anders blijft een
      // vaan tot het eind van het 6-uursvenster hangen terwijl de KNMI 'm
      // al heeft ingetrokken. kracht:null = "dit gebied is nu schoon".
      for (const g of verzameld) uit.push({ gebied: g, kracht: null, trend: '', richting: null, richtingNa: null });
      verzameld = [];
      continue;
    }
    const cijfer = zin.match(/\b([6-9]|1[0-2])\b/);
    if (cijfer) {
      const kracht = Number(cijfer[1]);
      const richting = eersteWindrichting(zin);
      const trend = /INCREASING|LATER|SOON|EXPECTED/.test(zin) ? '↗' : /DECREASING|MODERATING/.test(zin) ? '↘' : '';
      for (const g of verzameld) uit.push({ gebied: g, kracht, trend, richting: richting ?? null, richtingNa: null });
    }
    verzameld = [];
  }
  return uit;
}

// Nieuwste galewarning per gebied uit de actuele navtex-signalen — nieuwste
// bericht wint (eerste schrijver per gebied, na sorteren op tijd aflopend).
function navtexGaleInfoPerGebied() {
  const uit = new Map();
  const nu = Date.now();
  const kandidaten = (laatsteMeldingenSignalen ?? [])
    .filter((s) => s.categorie === 'navtex' && !s.detail?.verlopen)
    .filter((s) => {
      const tijdMs = s.tijd ? new Date(s.tijd).getTime() : NaN;
      return Number.isFinite(tijdMs) && nu - tijdMs < NAVTEX_GALE_VERS_MS;
    })
    .sort((a, b) => new Date(b.tijd) - new Date(a.tijd));
  for (const s of kandidaten) {
    for (const info of parseNavtexGaleWarning(s.detail?.bericht)) {
      // 2026-08-30: herkomst van het (nieuwste) bericht meegeven voor de
      // vaanpopup, zie navtexGaleHerkomstHtml().
      if (!uit.has(info.gebied)) uit.set(info.gebied, {
        ...info,
        code: s.detail?.code ?? null,
        station: s.detail?.station ?? null,
        berichtTijd: s.detail?.datumOnbetrouwbaar ? null : (s.tijd ?? null),
        ontvangenTijd: s.detail?.laatstOntvangen ?? null,
      });
    }
  }
  // 2026-08-28: kracht:null is de expliciete "NO WARNING"-aflossing uit
  // parseNavtexGaleWarning — die heeft z'n werk (nieuwere all-clear blokkeert
  // een oudere warning via de eerste-schrijver-regel hierboven) gedaan en
  // mag zelf nooit een vaan worden.
  // 2026-08-30, op verzoek van Lex ("is er verschil in gewicht?"): de
  // all-clear blijft nu WEL in de map staan (als allClear:true), zodat
  // verversWindvanen() 'm ook kan gebruiken om een verouderde gale uit de
  // synopsis te onderdrukken — een verse KNMI "NO WARNING" weegt zwaarder
  // dan een zes uur oude verwachting van de Met Office.
  for (const [gebiedNaam, info] of uit) {
    if (info.kracht == null) uit.set(gebiedNaam, { ...info, allClear: true });
  }
  return uit;
}

// Alle beschikbare teksten voor één gebied bij elkaar — zelfde bronnen (en
// voorrangsvolgorde qua beschikbaarheid) als de synopsis-popup.
function galeInfoVoorGebied(naam) {
  const teksten = [];
  const synopsis = synopsisBronVoorGebied(naam);
  if (synopsis?.synopsis?.tekst) teksten.push(synopsis.synopsis.tekst);
  for (const w of zeeWaarschuwingenPerGebied[naam.toUpperCase()] ?? []) {
    if (w?.tekst) teksten.push(w.tekst);
  }
  let beste = null;
  for (const tekst of teksten) {
    // 2026-08-28: naam meegeven zodat een gale die de tekst expliciet aan
    // een ANDER gebied hangt ("gale 8 in South Utsire" in de Forties-tekst)
    // hier niet meetelt — zie wisGaleVoorAndereGebieden().
    const info = galeInfoUitTekst(tekst, naam);
    if (info && (!beste || info.kracht > beste.kracht)) beste = info;
  }
  return beste;
}

// Weergave (2026-08-27, na twee iteraties met Lex: richtingtekst erbij
// "wordt wel veel", en meteorologische barb-veertjes coderen kracht — "dat
// hebben we al" als getal): een klassieke WINDVAAN-pijl, zoals op een
// kerktoren — precies het woord waar Lex' oorspronkelijke verzoek mee
// begon. De pijl draait met de wind en wijst waar 'ie VANDAAN komt (de
// windvaan-conventie), met veerstaart aan de achterkant en een pivot-stip
// in het midden. De kracht staat er al als getal naast; de richting zit
// dus puur in de draaiing — niets extra's erbij.
function windVaanPijlSvg(graden, kleur = '#ff2e3f', rand = '#7a0d16') {
  // 2026-08-27-fix, op melding van Lex ("de wind wordt E gegeven maar de
  // pijl wijst vanuit het westen"): de eerste versie volgde de klassieke
  // windvaan-conventie (punt prikt IN de wind, dus bij oostenwind punt naar
  // het oosten) — maar op een kaart lees je een pijl instinctief als
  // STROMING, en dan oogt diezelfde pijl als wind die uit het westen komt.
  // Nu dus de windkaart-conventie (zoals Windy): de pijl wijst mee met de
  // wind — oostenwind stroomt van oost naar west, punt naar het westen.
  // `graden` blijft de aanvoerrichting uit de forecast; +180 maakt er de
  // stroomrichting van.
  return `<svg viewBox="0 0 44 44" width="44" height="44" aria-hidden="true">
    <g transform="rotate(${(graden + 180) % 360} 22 22)" fill="${kleur}" stroke="${rand}" stroke-linejoin="round">
      <line x1="22" y1="8" x2="22" y2="36" stroke="${kleur}" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M22 2 L28 13 L22 10.5 L16 13 Z" stroke-width="1.1"/>
      <path d="M22 36 L27.5 42 L22 39.5 L16.5 42 Z" stroke-width="1.1"/>
      <circle cx="22" cy="22" r="3.4" stroke-width="1.1"/>
    </g>
  </svg>`;
}

// Terugval als er geen richting uit de tekst te halen valt (cyclonic/
// variable): het internationale stormsein — rode wimpel op mast.
const WIND_VAAN_SVG = `<svg viewBox="0 0 30 40" width="30" height="40" aria-hidden="true">
  <line x1="7" y1="3" x2="7" y2="38" stroke="#f4f6fb" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M8.4 4 L27 10.5 L8.4 17.5 Z" fill="#ff2e3f" stroke="#7a0d16" stroke-width="1.2" stroke-linejoin="round"/>
</svg>`;

// 2026-08-28-fix, op Lex' screenshot (Dover-vaan op het strand van
// Boulogne): L.latLngBounds(...).getCenter() is het midden van de
// omsluitende RECHTHOEK — bij een schuine kuststrook als Dover valt dat
// buiten het gebied zelf, op land. Dit is het echte polygoon-zwaartepunt
// (shoelace-formule); voor Dover: 50.83N 1.38O, netjes midden in het
// Kanaal. Ontaarde ring (oppervlak ~0) valt terug op het rechthoek-midden.
function polygoonZwaartepunt(ringLatLon) {
  let a2 = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ringLatLon.length; i++) {
    const [y1, x1] = ringLatLon[i];
    const [y2, x2] = ringLatLon[(i + 1) % ringLatLon.length];
    const kruis = x1 * y2 - x2 * y1;
    a2 += kruis;
    cx += (x1 + x2) * kruis;
    cy += (y1 + y2) * kruis;
  }
  if (Math.abs(a2) < 1e-9) return L.latLngBounds(ringLatLon).getCenter();
  return L.latLng(cy / (3 * a2), cx / (3 * a2));
}

let windvaanLaag = null;

function verversWindvanen() {
  if (!kaart) return;
  if (windvaanLaag) {
    kaart.removeLayer(windvaanLaag);
    windvaanLaag = null;
  }
  if (!zeeModusActief) return;
  const vanen = [];
  // 2026-08-28: de eigen NAVTEX-ontvangst telt nu ook mee als vanenbron.
  // 2026-08-30-herzien, op verzoek van Lex (Dover: eigen NAVTEX PB18
  // "SOUTHWEST 7" van 17:31 werd weggedrukt door "perhaps gale 8 later" uit
  // een Met Office-synopsis van 11:30 — "de vraag is of er verschil in
  // gewicht is"): niet langer "hoogste getal wint", maar een rangorde.
  // Een verse (< 6 uur), zelf ontvangen KNMI-galewarning is een waarschuwing
  // die NU van kracht is en bepaalt het hoofdgetal; de synopsis is een
  // verwachting en mag alleen AANVULLEN (hoger getal -> "7→8"). Zonder verse
  // NAVTEX-warning valt de vaan terug op de synopsis zoals voorheen. En de
  // omgekeerde kant: een verse NAVTEX "NO WARNING" onderdrukt een gale uit
  // de synopsis (allClear, zie navtexGaleInfoPerGebied) — dan blijft alleen
  // de amber verwachte-windvaan over.
  const navtexPerGebied = navtexGaleInfoPerGebied();
  ZEE_GEBIEDEN.features.forEach((feature) => {
    const naam = feature.properties.name;
    const synopsisInfo = galeInfoVoorGebied(naam);
    const navtexRuw = navtexPerGebied.get(naam) ?? null;
    const navtexInfo = navtexRuw && !navtexRuw.allClear ? navtexRuw : null;
    let info;
    if (navtexInfo) {
      info = synopsisInfo && synopsisInfo.kracht > navtexInfo.kracht && navtexInfo.naKracht == null
        ? { ...navtexInfo, naKracht: synopsisInfo.kracht, verwachtingUitSynopsis: true }
        : navtexInfo;
    } else if (navtexRuw?.allClear) {
      info = null; // verse KNMI all-clear: geen gale-vaan, ook al zegt de synopsis nog gale
    } else {
      info = synopsisInfo;
    }
    const ring = feature.geometry.coordinates[0].map(([lon, lat]) => [lat, lon]);
    const midden = polygoonZwaartepunt(ring); // zwaartepunt, niet rechthoek-midden — zie de fix hierboven
    // 2026-08-28, op verzoek van Lex ("alles wat je goed kunt herleiden en
    // herhalen"): geen gale voor dit gebied -> kleine GRIJZE vaan met de
    // gewone voorspelde wind uit dezelfde synopsis-tekst. Bewust duidelijk
    // kleiner en zonder gloed (zie .wind-vaan-voorspeld in styles.css),
    // zodat 'ie nooit met de rode gale-vanen concurreert; zonder bekende
    // richting (cyclonic/variable) tonen we niets — een grijze wimpel zou
    // als waarschuwing lezen.
    if (!info) {
      const voorspeld = windInfoUitTekst(synopsisBronVoorGebied(naam)?.synopsis?.tekst);
      if (voorspeld?.richting) {
        // 2026-08-28-herzien, op verzoek van Lex: even groot als de rode
        // gale-vanen (test), en amber i.p.v. grijs — grijs is hier al de
        // kleur van "verlopen", en amber leest als "informatie" zonder met
        // het rode alarm te concurreren.
        const marker = L.marker(midden, {
          icon: L.divIcon({
            className: '',
            html: `<div class="wind-vaan wind-vaan-voorspeld" title="${escapeHtml(naam)}: voorspelde wind">${windVaanPijlSvg(voorspeld.richting.graden, '#ffb020', '#7a5200')}<span class="wind-vaan-kracht">${voorspeld.bereik}</span></div>`,
            iconSize: [64, 44],
            iconAnchor: [22, 50],
          }),
        });
        marker.on('click', () => {
          // 2026-08-30: als een verse NAVTEX "NO WARNING" hier een gale uit
          // de synopsis heeft onderdrukt, dat ook in de popup laten zien —
          // anders lijkt de vaan de synopsistekst tegen te spreken.
          const allClearHtml = navtexRuw?.allClear && synopsisInfo
            ? `<div class="popup-sub">Synopsis noemt gale ${synopsisInfo.kracht}, maar eigen NAVTEX-ontvangst meldt "NO WARNING" voor dit gebied — die is nieuwer en heeft voorrang.</div>${navtexGaleHerkomstHtml(navtexRuw)}`
            : '';
          L.popup({ maxWidth: 280 }).setLatLng(midden).setContent(zeeSynopsisPopupHtml(naam) + allClearHtml).openOn(kaart);
        });
        vanen.push(marker);
      }
      return;
    }
    // Richting bekend -> draaiende windvaan-pijl; onbekend (cyclonic/
    // variable) -> het statische stormsein-wimpeltje als terugval.
    const icoonSvg = info.richting ? windVaanPijlSvg(info.richting.graden) : WIND_VAAN_SVG;
    // 2026-08-27-fix, op melding van Lex ("er staat 8 terwijl de werkelijke
    // wind lager is, de trend is wel naar 8"): als de huidige kracht bekend
    // is en het gale-getal de verwachting is, toon dan "7→8" i.p.v. een
    // misleidend kaal "8↗" — dat las als "nu al 8".
    // Drie vormen: "8→6" (gale nu, zakt af — 'at first'), "7→8" (gale op
    // komst) en kaal "8"/"8↘" als er geen tweede getal te vinden was.
    const krachtTekst = info.naKracht != null
      ? `${info.kracht}→${info.naKracht}`
      : info.trend === '↗' && info.huidigeKracht != null
        ? `${info.huidigeKracht}→${info.kracht}`
        : `${info.kracht}${info.trend}`;
    const marker = L.marker(midden, {
      icon: L.divIcon({
        className: '',
        html: `<div class="wind-vaan" title="${escapeHtml(naam)}: gale/storm">${icoonSvg}<span class="wind-vaan-kracht">${krachtTekst}</span></div>`,
        iconSize: [64, 44],
        iconAnchor: [22, 50],
      }),
    });
    // Zelfde popup als het gebiedslabel — daar staat de volledige tekst
    // waar deze vaan uit is afgeleid.
    // 2026-08-30: plus een regel waar de vaan zelf op steunt (NAVTEX of
    // synopsis), en bij een NAVTEX-galewarning station/berichttijd/
    // ontvangstmoment -- zie navtexGaleHerkomstHtml().
    marker.on('click', () => {
      const synopsisBronNaam = synopsisBronVoorGebied(naam)?.bron === 'metoffice' ? 'UK Met Office' : 'KNMI';
      const basis = navtexInfo
        ? `<div class="popup-sub">Vaan op basis van: eigen NAVTEX-ontvangst (galewarning heeft voorrang op de synopsis)${info.verwachtingUitSynopsis ? ` · verwachting ${info.naKracht} uit synopsis (${synopsisBronNaam})` : ''}</div>`
        : `<div class="popup-sub">Vaan op basis van: synopsis (${synopsisBronNaam})</div>`;
      L.popup({ maxWidth: 280 }).setLatLng(midden).setContent(zeeSynopsisPopupHtml(naam) + basis + navtexGaleHerkomstHtml(navtexInfo)).openOn(kaart);
    });
    vanen.push(marker);
  });
  if (vanen.length) {
    windvaanLaag = L.layerGroup(vanen).addTo(kaart);
  }
  // Zelfde levenscyclus als de vanen (aan/uit met Zee-modus, ververst op
  // dezelfde vier momenten) — zie verversDrukgebieden() hieronder.
  verversDrukgebieden();
}

// ---- Voorspelde wind, zicht en drukgebieden (2026-08-28) ---------------
// Op verzoek van Lex, na de corpus-analyse van 4+ dagen eigen ontvangst
// ("wil je onderzoeken of we meer uit de berichten kunnen halen en plotten
// op de zeekaart" -> "alles wat je goed kunt herleiden en herhalen"). Drie
// uitbreidingen, alle drie uit teksten die er al zijn (geen nieuwe fetch):
// 1. windInfoUitTekst(): gewone voorspelde wind (richting + krachtbereik)
//    voor gebieden zonder gale -> kleine grijze vaan (zie verversWindvanen).
// 2. zichtVoorGebied(): mist/slecht-zicht-badge naast het golfje.
// 3. parseDrukgebieden() + verversDrukgebieden(): LOW/HIGH-druksystemen uit
//    de SYNOPSIS-sectie van de eigen KNMI PE-ontvangst als klassieke
//    weerkaart-symbolen (rode L / blauwe H) met bewegingspijl en stippellijn
//    naar het genoemde doelgebied.

// Richting + krachtbereik uit het begin van een synopsis-tekst. Zelfde
// kop-strip als galeInfoUitTekst; de range moet DICHT bij de richting staan
// (binnen 45 tekens) zodat golfhoogtes en luchtdrukcijfers verderop nooit
// als windkracht kunnen matchen.
function windInfoUitTekst(tekst) {
  if (!tekst) return null;
  let t = String(tekst).toUpperCase();
  const dubbelePunt = t.indexOf(':');
  if (dubbelePunt > 0 && dubbelePunt < 40 && /[A-Z]/.test(t[dubbelePunt - 1])) t = t.slice(dubbelePunt + 1);
  const richting = eersteWindrichting(t);
  if (!richting || richting.index > 40) return null;
  // Tot het einde van de windzin kijken (max 90 tekens): een dubbele
  // richting met veering ("EASTERLY OR SOUTHEASTERLY VEERING SOUTHERLY OR
  // SOUTHWESTERLY, 4 TO 6") duwt het krachtcijfer anders buiten beeld —
  // zelfde les als bij galeInfoUitTekst. De punt-grens voorkomt dat een
  // golfhoogte uit een vólgende zin ooit als windkracht matcht.
  const naRichting = t.slice(richting.index, richting.index + 90).split('.')[0];
  const m = naRichting.match(/\b([1-9]|1[0-2])(?:\s*(?:-|–|TO|OR)\s*([1-9]|1[0-2]))?\b/);
  if (!m) return null;
  return { richting, bereik: m[2] ? `${m[1]}–${m[2]}` : m[1] };
}

// Mist/zicht per gebied, uit dezelfde gekozen synopsis-tekst als het
// golfje. Vrijwel elke tekst zegt ergens "in precipitation moderate to
// poor" — dat is gewoon "in een bui zie je minder" en verdient GEEN badge.
// Alleen structureel slecht zicht telt: FOG (mist), of een zin met POOR
// die niét over neerslag/buien gaat.
function zichtVoorGebied(naam) {
  const tekst = synopsisBronVoorGebied(naam)?.synopsis?.tekst;
  if (!tekst) return null;
  const zinnen = String(tekst).toUpperCase().split(/[.\n]+/);
  let slechtZicht = false;
  for (const zin of zinnen) {
    if (/\bFOG\b/.test(zin)) return 'mist';
    // "OCCASIONALLY POOR" e.d. is een bijzin, geen structureel slecht
    // zicht — anders badgede vandaag elk gebied ("moderate or good,
    // occasionally poor" staat in vrijwel elke Met Office-tekst).
    if (/\bPOOR\b/.test(zin)
      && !/PRECIPITATION|SHOWER|THUNDER|RAIN|DRIZZLE/.test(zin)
      && !/(?:OCCASIONALLY|POSSIBLY|LOCALLY|AT\s+TIMES)\s+(?:\w+\s+)?POOR/.test(zin)) slechtZicht = true;
  }
  return slechtZicht ? 'slecht zicht' : null;
}

// Mist-icoontje in dezelfde open-lijn-stijl als golfIcoonHtml() (zie de
// blob-les daar: dunne lijnen + currentColor, geen kleur-emoji met gloed).
function mistIcoonHtml() {
  return '<svg class="golf-emoji" viewBox="0 0 24 24" aria-hidden="true">'
    + '<path d="M2,9 L18,9 M5,13 L22,13 M2,17 L15,17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'
    + '</svg>';
}

// Benoemde plaatsen buiten de eigen 10 kaartgebieden waar de KNMI-synopsis
// druksystemen aan ophangt ("LOW, 1008, OVER SPAIN..."). INDICATIEVE
// centroïden — op synoptische schaal is een drukgebied zelf honderden km
// groot, dus een landelijk/zeegebied-middelpunt is precies de resolutie
// die het bronbericht ook heeft. Onbekende namen worden gewoon
// overgeslagen (liever geen symbool dan een gegokt symbool).
const DRUK_PLAATSEN = {
  'BRITTANY': [48.0, -3.5], 'SPAIN': [40.0, -4.0], 'PORTUGAL': [39.5, -8.0],
  'FRANCE': [47.0, 2.0], 'ENGLAND': [52.5, -1.5], 'SCOTLAND': [56.8, -4.2],
  'IRELAND': [53.3, -8.0], 'WALES': [52.3, -3.7], 'NORWAY': [61.0, 8.0],
  'DENMARK': [56.0, 9.5], 'SHETLAND': [60.35, -1.25], 'ICELAND': [64.9, -18.6],
  'FAEROES': [62.0, -6.8], 'FAEROE': [62.0, -6.8], 'AZORES': [38.5, -28.0],
  'NORWEGIAN SEA': [66.0, 2.0], 'NORTH SEA': [56.0, 3.5], 'IRISH SEA': [53.5, -5.3],
  'BAY OF BISCAY': [45.5, -4.0], 'BISCAY': [45.5, -4.0], 'CHANNEL': [50.2, -1.5],
  // omliggende shipping-forecast-gebieden (benaderd middelpunt)
  'UTSIRE': [59.3, 4.5], 'FAIR ISLE': [59.5, -2.0], 'CROMARTY': [57.7, -2.5],
  'SOLE': [48.5, -8.0], 'FITZROY': [44.5, -9.0], 'PLYMOUTH': [49.7, -4.5],
  'WIGHT': [50.3, -1.0], 'PORTLAND': [50.2, -2.8], 'LUNDY': [51.0, -5.3],
  'FASTNET': [51.0, -8.5], 'SHANNON': [52.5, -10.5], 'ROCKALL': [57.0, -13.0],
  'MALIN': [55.8, -7.5], 'HEBRIDES': [57.8, -8.0],
};

// Middelpunt (zwaartepunt) van één van de 10 eigen kaartgebieden, of null.
function zeeGebiedMidden(naam) {
  const kaal = String(naam ?? '').trim().toUpperCase().replace(WINDSTREEK_VOORVOEGSEL, '');
  const feature = ZEE_GEBIEDEN.features.find((f) => f.properties.name.toUpperCase() === kaal);
  if (!feature) return null;
  const ring = feature.geometry.coordinates[0].map(([lon, lat]) => [lat, lon]);
  const p = polygoonZwaartepunt(ring);
  return [p.lat, p.lng];
}

function drukPlaatsVoorNaam(naam) {
  const kaal = String(naam ?? '').trim().toUpperCase();
  return zeeGebiedMidden(kaal) ?? DRUK_PLAATSEN[kaal] ?? DRUK_PLAATSEN[kaal.replace(/^THE\s+/, '')] ?? null;
}

const KOMPAS_GRADEN = {
  N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315,
  NORTH: 0, NORTHEAST: 45, EAST: 90, SOUTHEAST: 135, SOUTH: 180,
  SOUTHWEST: 225, WEST: 270, NORTHWEST: 315,
};

// Druksystemen uit een SYNOPSIS-tekst. Twee vormen uit de echte ontvangst:
// - KNMI PE: "LOW, 1003, OVER THE DOGGER IS MOVING NORTH TOWARDS FORTIES."
//   en "LOW, 1007, WEST OF BRITTANY REMAINS FAIRLY STATIONARY."
// - Noorse bulletin-vorm: "LOW 1001 HPA, 49 N 12 W, MOV LITTLE, EXP 1000
//   HPA AT 49 N 11 W THU 18 UTC" (coördinaten, met verwachte positie).
// Druk-sanity 940–1060 hPa zodat een corrupte "100&" of een jaartal nooit
// als druk doorgaat.
function parseDrukgebieden(tekst) {
  const uit = [];
  const zinnen = String(tekst ?? '').toUpperCase().split(/[.\n]+/);
  for (const zin of zinnen) {
    const kop = zin.match(/\b(LOW|HIGH)S?,?\s*(?:PRESSURE\s+)?(9[4-9]\d|10[0-5]\d)\b/);
    if (!kop) continue;
    const soort = kop[1];
    const druk = Number(kop[2]);
    const rest = zin.slice(kop.index + kop[0].length);
    // Positie: exacte coördinaten winnen van een benoemde plaats. Alleen
    // VÓÓR een eventuele "EXP ..." zoeken — in het echte (deels corrupte)
    // Noorse NE35-bulletin was de huidige positie weggevallen maar de
    // EXP-positie intact, en dan zou het systeem op zijn VERWACHTE plek
    // als huidig geplot worden. Lat/lon-sanity ertegenaan ("687E" gezien).
    let positie = null;
    let benaderd = false;
    let opEigenGebied = false; // ligt het symbool op één van de 10 kaartgebieden?
    const expIndex = rest.search(/\bEXP\b/);
    const voorExp = expIndex === -1 ? rest : rest.slice(0, expIndex);
    const co = voorExp.match(/\b(\d{1,2}(?:[.,]\d+)?)\s*N[, ]+\s*(\d{1,3}(?:[.,]\d+)?)\s*([EW])\b/);
    if (co && Number(co[1].replace(',', '.')) <= 85 && Number(co[2].replace(',', '.')) <= 180) {
      positie = [Number(co[1].replace(',', '.')), Number(co[2].replace(',', '.')) * (co[3] === 'W' ? -1 : 1)];
    } else {
      const bij = rest.match(/^[,\s]*(?:HPA[,\s]*)?(?:(NORTH|SOUTH|EAST|WEST)(?:WEST|EAST)?\s+OF|OVER|NEAR)\s+(?:THE\s+)?([A-Z][A-Z ]*?)(?=\s+(?:IS|REMAINS|MOVES|MOVING|MOV|WITH|AND|TRACKING|DEVELOPING|EXTENDS|BECOMES|FOLLOWS)\b|\s*,|\s*$)/);
      if (bij) {
        const opEigen = zeeGebiedMidden(bij[2]);
        const plek = opEigen ?? drukPlaatsVoorNaam(bij[2]);
        if (plek) {
          benaderd = true;
          positie = [...plek];
          // "WEST OF BRITTANY": indicatief een stuk opschuiven in de
          // genoemde richting (synoptische schaal, dus grof is prima).
          const offset = bij[0].match(/\b(NORTH|SOUTH|EAST|WEST)(WEST|EAST)?\s+OF\b/);
          if (offset) {
            const g = KOMPAS_GRADEN[offset[1] + (offset[2] ?? '')] ?? KOMPAS_GRADEN[offset[1]];
            positie[0] += 2.5 * Math.cos((g * Math.PI) / 180);
            positie[1] += 4.0 * Math.sin((g * Math.PI) / 180);
          }
          // 2026-08-28, op verzoek van Lex ("kan je zo'n drukgebied L of H
          // een stukje boven de areanaam zetten?"): alleen als het symbool
          // ECHT op het gebiedsmidden ligt (geen offset weggeschoven) weet
          // verversDrukgebieden dat de gebiedsnaam + vaan eronder staan en
          // tilt het 'm daar bovenuit.
          opEigenGebied = !!opEigen && !offset;
        }
      }
    }
    if (!positie) continue; // geen herleidbare plek -> geen symbool
    // Beweging: stilstand, kompasrichting, en/of een benoemd doelgebied.
    const stationair = /REMAINS\s+(?:FAIRLY\s+)?STATIONARY|MOV(?:ES|ING)?\s+LITTLE/.test(rest);
    let bewegingGraden = null;
    const beweegt = rest.match(/\b(?:IS\s+)?(?:MOVING|MOVES|MOV)\s+(NORTHEAST|NORTHWEST|SOUTHEAST|SOUTHWEST|NORTH|SOUTH|EAST|WEST|NE|NW|SE|SW|N|E|S|W)(?:WARDS?)?\b/);
    if (beweegt && KOMPAS_GRADEN[beweegt[1]] != null) bewegingGraden = KOMPAS_GRADEN[beweegt[1]];
    let doel = null;
    const naar = rest.match(/\bTO(?:WARDS)?\s+(?:THE\s+)?([A-Z][A-Z ]*?)(?=\s*[,.]|\s*$)/);
    if (naar) doel = drukPlaatsVoorNaam(naar[1]);
    // "AT" is optioneel: "EXP 1000 HPA AT 49 N 11 W" én "EXP 995 HPA 57 N
    // 01 E" komen allebei in de echte Noorse bulletins voor.
    const exp = rest.match(/\bEXP\s+(9[4-9]\d|10[0-5]\d)\s*HPA\s+(?:AT\s+)?(\d{1,2})\s*N\s+(\d{1,3})\s*([EW])/);
    if (exp && Number(exp[2]) <= 85 && Number(exp[3]) <= 180) doel = [Number(exp[2]), Number(exp[3]) * (exp[4] === 'W' ? -1 : 1)];
    uit.push({ soort, druk, positie, benaderd, opEigenGebied, stationair, bewegingGraden, doel, zin: zin.trim() });
  }
  return uit;
}

// Nieuwste bruikbare SYNOPSIS uit de eigen NAVTEX-ontvangst. De KNMI
// PE-berichten komen ~2x per dag; 15 uur venster zodat er altijd precies
// één actuele set symbolen staat en een gemiste uitzending niet meteen een
// lege kaart geeft. Alleen de SYNOPSIS-sectie zelf (tot FORECAST VALID) —
// dezelfde sectiegrens als parseNavtexGaleWarning, om dezelfde reden.
const DRUK_VERS_MS = 15 * 60 * 60 * 1000;

function drukgebiedenUitNavtex() {
  const nu = Date.now();
  const kandidaten = (laatsteMeldingenSignalen ?? [])
    .filter((s) => s.categorie === 'navtex' && !s.detail?.verlopen)
    .filter((s) => {
      const tijdMs = s.tijd ? new Date(s.tijd).getTime() : NaN;
      return Number.isFinite(tijdMs) && nu - tijdMs < DRUK_VERS_MS;
    })
    .sort((a, b) => new Date(b.tijd) - new Date(a.tijd));
  // 2026-08-28-herzien, na het loslaten van de 450km-grens: nu de Noorse
  // NE35-bulletins (coördinaten-vorm) ook binnenkomen zijn er MEERDERE
  // synopsis-bronnen tegelijk die elkaar aanvullen — KNMI dekt het eigen
  // stuk Noordzee, het Noorse bulletin de Atlantische/Arctische systemen.
  // Daarom mergen over alle berichten in het venster i.p.v. alleen het
  // nieuwste: nieuwste bericht eerst, en een systeem van dezelfde soort
  // dat vlakbij een al gevonden systeem ligt (< ~2.5° lat / 4° lon) is
  // hetzelfde systeem uit een oudere uitzending — overslaan.
  const stelsels = [];
  for (const s of kandidaten) {
    const bericht = String(s.detail?.bericht ?? '').toUpperCase();
    const synopsisStart = bericht.search(/\bSYNOPSIS\b|\bSYNOPTIC\s+SITUATIO\w*/);
    if (synopsisStart === -1) continue;
    const einde = bericht.search(/FORECAST\s+VALID/);
    const sectie = bericht.slice(synopsisStart, einde > synopsisStart ? einde : undefined);
    for (const st of parseDrukgebieden(sectie)) {
      const dubbel = stelsels.some((eerder) => eerder.soort === st.soort
        && Math.abs(eerder.positie[0] - st.positie[0]) < 2.5
        && Math.abs(eerder.positie[1] - st.positie[1]) < 4);
      // 2026-08-30, op verzoek van Lex ("datum en tijd van deze melding,
      // altijd de meest actuele, alsmede het station"): kandidaten staan
      // nieuwste-eerst, dus het eerst gevonden systeem komt altijd uit het
      // meest recente bericht -- die herkomst gaat mee naar de popup.
      // berichtTijd = de DTG uit het bericht zelf (null als onbetrouwbaar),
      // ontvangenTijd = het echte laatste ontvangstmoment van dat bericht.
      if (!dubbel) stelsels.push({
        ...st,
        code: s.detail?.code ?? null,
        station: s.detail?.station ?? null,
        berichtTijd: s.detail?.datumOnbetrouwbaar ? null : (s.tijd ?? null),
        ontvangenTijd: s.detail?.laatstOntvangen ?? null,
      });
    }
  }
  return stelsels.length ? { stelsels } : null;
}

let drukLaag = null;

function verversDrukgebieden() {
  if (!kaart) return;
  if (drukLaag) {
    kaart.removeLayer(drukLaag);
    drukLaag = null;
  }
  if (!zeeModusActief) return;
  const bron = drukgebiedenUitNavtex();
  if (!bron) return;
  const lagen = [];
  for (const st of bron.stelsels) {
    const letter = st.soort === 'LOW' ? 'L' : 'H';
    // Bewegingspijl wijst waar het systeem HEEN gaat (dit is verplaatsing,
    // geen wind — dus géén +180 zoals bij de windvanen).
    const pijl = st.bewegingGraden != null
      ? `<svg class="druk-pijl" viewBox="0 0 20 20" aria-hidden="true"><g transform="rotate(${st.bewegingGraden} 10 10)"><path d="M10 2 L14 10 L11 8.5 L11 18 L9 18 L9 8.5 L6 10 Z" fill="currentColor"/></g></svg>`
      : '';
    const marker = L.marker(st.positie, {
      icon: L.divIcon({
        className: '',
        html: `<div class="druk-symbool druk-${st.soort.toLowerCase()}" title="${escapeHtml(st.zin)}"><span class="druk-letter">${letter}</span><span class="druk-waarde">${st.druk}</span>${pijl}</div>`,
        iconSize: [52, 56],
        // 2026-08-28, op verzoek van Lex: op een eigen kaartgebied staat op
        // ditzelfde punt ook de gebiedsnaam (en evt. een vaan) — het symbool
        // dan een stuk OMHOOG tillen zodat L/H er netjes boven zweeft.
        iconAnchor: [26, st.opEigenGebied ? 92 : 28],
      }),
    });
    marker.on('click', () => {
      const uitleg = `<div class="popup-titel">${letter === 'L' ? 'Lagedrukgebied' : 'Hogedrukgebied'} ${st.druk} hPa</div>`
        + `<div class="popup-advies">${escapeHtml(st.zin)}</div>`
        + `<div class="popup-sub">Bron: eigen NAVTEX-ontvangst${st.code ? ` (${escapeHtml(st.code)})` : ''}${st.benaderd ? ' — positie indicatief' : ''}</div>`
        // 2026-08-30, zie drukgebiedenUitNavtex(): station + berichttijd (DTG)
        // + laatste ontvangstmoment van het meest recente bericht.
        + `<div class="popup-sub">Station: ${escapeHtml(st.station ?? 'onbekend')}</div>`
        + `<div class="popup-sub">Bericht: ${st.berichtTijd ? escapeHtml(nieuwSindsTekst(st.berichtTijd) ?? '—') : '— (datum onzeker)'}`
        + `${st.ontvangenTijd ? ` · ontvangen ${escapeHtml(nieuwSindsTekst(st.ontvangenTijd) ?? '—')}` : ''}</div>`;
      L.popup({ maxWidth: 280 }).setLatLng(st.positie).setContent(uitleg).openOn(kaart);
    });
    lagen.push(marker);
    if (st.doel) {
      lagen.push(L.polyline([st.positie, st.doel], {
        color: st.soort === 'LOW' ? '#ff2e3f' : '#4d8dff',
        weight: 2,
        opacity: 0.55,
        dashArray: '7 7',
        interactive: false,
      }));
    }
  }
  if (lagen.length) drukLaag = L.layerGroup(lagen).addTo(kaart);
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

// ---- Fronten-laag uit de DWD-Bodenanalyse (2026-08-30) -----------------
// Tweede poging na de teruggedraaide WPC-versie van 2026-08-29 (die bron
// hield op bij de Britse eilanden). De backend (sources/dwdFronten.js) haalt
// elke 6 uur DWD's handgetekende Bodenwetterkarte op, georefereert 'm
// (gefitte polair-stereografische projectie), warpt naar Web Mercator en
// houdt alleen de fronten (rood/blauw/paars) en de vette H/T- en
// druklabels over als transparante PNG. Hier alleen nog: één
// L.imageOverlay met de bbox uit /api/fronten-info, en het bijschrift met
// de analysetijd. Elke 15 min opnieuw de info ophalen zolang de laag aan
// staat; de PNG-URL krijgt de bijwerktijd als cache-buster zodat een
// nieuwe analyse ook echt opnieuw geladen wordt.
let frontenLaag = null;
let frontenActief = false;
let frontenTimer = null;
let frontenLaatsteBijgewerkt = null;
// 2026-08-30 (isobaren zelf tekenen, op verzoek van Lex — "kan dan ook de
// grote waarde 1000 en T kleiner"): de backend levert via /api/isobaren
// isobaren + H/L-centra uit een modeldrukveld (sources/isobaren.js). Zolang
// die beschikbaar zijn, tonen we de DWD-PNG met ALLEEN de fronten
// (/api/fronten-alleen.png) en tekenen we de isobaren hier zelf als
// Leaflet-polylines met eigen, kleine labels. Valt het drukveld weg, dan
// schakelt de laag terug naar de volledige DWD-PNG (met DWD's eigen
// isobaren en labels) — de laag is dus nooit leeg.
let isobarenLaag = null; // L.layerGroup: lijnen + labels + H/L
let isobarenLaatsteSleutel = null; // geldig+bijgewerkt van de getekende set
let frontenPngVariant = null; // 'alleen' | 'vol' — welke DWD-PNG nu in frontenLaag zit
let frontenTerugvalTimer = null; // snelle hercontrole zolang de laag op de DWD-terugval staat
const ISOBAAR_LABEL_MIN_ZOOM = 4;

// Bijschrift net boven de knoppenbalk houden, ook als die balk over meer
// rijen wikkelt (zie .fronten-info in styles.css).
function positioneerFrontenInfo() {
  const balk = document.querySelector('.radar-controls');
  if (!balk || !FRONTEN_INFO_EL) return;
  // 2026-08-30 (3e ronde), op melding van Lex ("op de iPad staat het er nog
  // niet boven"): niet de balkHOOGTE optellen (dat neemt aan dat de balk op
  // 6 px van de onderrand hangt -- op tablet staat 'ie hoger, met safe-area
  // en een andere opbouw), maar de echte bovenrand van de balk t.o.v. de
  // onderrand van het element waar het bijschrift zelf in gepositioneerd is.
  const ouder = FRONTEN_INFO_EL.offsetParent;
  if (!ouder || !balk.offsetParent) return;
  const balkTop = balk.getBoundingClientRect().top;
  const ouderBottom = ouder.getBoundingClientRect().bottom;
  FRONTEN_INFO_EL.style.bottom = `${Math.max(26, Math.round(ouderBottom - balkTop + 10))}px`;
}
window.addEventListener('resize', positioneerFrontenInfo);
if (window.ResizeObserver && document.querySelector('.radar-controls')) {
  new ResizeObserver(positioneerFrontenInfo).observe(document.querySelector('.radar-controls'));
}

async function verversFronten() {
  if (!kaart || !frontenActief) return;
  positioneerFrontenInfo();
  let info;
  try {
    info = await fetch('/api/fronten-info').then((r) => r.json());
  } catch (err) {
    console.error('fronten-info ophalen mislukt', err);
    return;
  }
  // Eigen isobaren erbij (zie toelichting bij isobarenLaag). Mislukt dit
  // (backend nog niet zover, netwerk), dan gedragen we ons als "niet
  // beschikbaar" en valt de laag terug op de volledige DWD-PNG.
  let iso = null;
  try {
    iso = await fetch('/api/isobaren').then((r) => r.json());
  } catch (err) {
    console.error('isobaren ophalen mislukt', err);
  }
  const eigenIsobaren = !!iso?.beschikbaar && Array.isArray(iso.lijnen);
  if (!info?.beschikbaar) {
    // Geen DWD-kaart: dan toch de eigen isobaren tonen als die er zijn —
    // beter een drukkaart zonder fronten dan helemaal niets.
    if (eigenIsobaren) tekenIsobaren(iso);
    FRONTEN_INFO_EL.textContent = `Fronten: nog geen DWD-analyse beschikbaar${eigenIsobaren ? ` · ${isobarenInfoTekst(iso)}` : ''}`;
    FRONTEN_INFO_EL.classList.remove('verborgen');
    return;
  }
  const variant = eigenIsobaren ? 'alleen' : 'vol';
  if (info.bijgewerkt !== frontenLaatsteBijgewerkt || variant !== frontenPngVariant) {
    frontenLaatsteBijgewerkt = info.bijgewerkt;
    frontenPngVariant = variant;
    const grenzen = [[info.bbox.latS, info.bbox.lonW], [info.bbox.latN, info.bbox.lonE]];
    const url = `/api/${variant === 'alleen' ? 'fronten-alleen' : 'fronten'}.png?v=${encodeURIComponent(info.bijgewerkt)}`;
    if (frontenLaag) {
      frontenLaag.setUrl(url);
    } else {
      frontenLaag = L.imageOverlay(url, grenzen, { pane: 'frontenPane', opacity: 0.65, interactive: false, // 2026-08-30 (2e ronde): 0.9 -> 0.65 op verzoek van Lex ("mag wat doorzichtiger")
         attribution: 'Fronten: © Deutscher Wetterdienst' }).addTo(kaart);
    }
  }
  if (eigenIsobaren) tekenIsobaren(iso);
  else verwijderIsobaren();
  // 2026-08-30: in terugvalstand (drukveld ontbreekt, bv. net na een
  // backend-herstart) niet 15 minuten wachten maar elke minuut opnieuw
  // kijken — Lex zag anders "de oude weer terug" terwijl het veld allang
  // weer binnen was.
  if (!eigenIsobaren && frontenActief) {
    clearTimeout(frontenTerugvalTimer);
    frontenTerugvalTimer = setTimeout(verversFronten, 60 * 1000);
  }
  const tijd = info.analyseTijd ? nieuwSindsTekst(info.analyseTijd) : null;
  const isoTekst = eigenIsobaren ? isobarenInfoTekst(iso) : 'Isobaren: DWD-kaart (drukveld niet beschikbaar)';
  FRONTEN_INFO_EL.textContent = `Fronten: DWD-analyse${tijd ? ` ${tijd}` : ''} · ${isoTekst}`;
  const isoTitel = eigenIsobaren
    ? ` · isobaren: Open-Meteo-model, geldig ${nieuwSindsTekst(iso.geldig)}, drukveld opgehaald ${nieuwSindsTekst(iso.bijgewerkt)}`
    : iso?.fout ? ` · isobaren-drukveld mislukt: ${iso.fout.melding}` : '';
  FRONTEN_INFO_EL.title = `${info.gepubliceerd ? `fronten gepubliceerd ${nieuwSindsTekst(info.gepubliceerd)} · opgehaald ${nieuwSindsTekst(info.bijgewerkt)}` : ''}${isoTitel}`;
  FRONTEN_INFO_EL.classList.remove('verborgen');
}

function isobarenInfoTekst(iso) {
  const d = new Date(iso.geldig);
  const uur = Number.isNaN(d.getTime()) ? null : d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `Isobaren: model${uur ? ` ${uur}` : ''}`;
}

// Isobaren + labels + H/L tekenen. Lijnen als polylines in frontenPane
// (zelfde laag als de fronten-PNG, dus onder alle markers). Stijl bewust
// rustig: dunne donkere lijnen, hoofdisobaren (elke 10 hPa) iets zwaarder
// en alleen díe krijgen een klein getal; H/L als kleine letter met de
// druk eronder. Labels hangen aan de zoom (zie zetIsobaarLabelsZichtbaar):
// ver uitgezoomd zouden ze elkaar overlappen. Alleen opnieuw tekenen als
// de set echt veranderd is (geldig/bijgewerkt) — elke 15 min hertekenen
// zonder reden geeft een knipper.
function tekenIsobaren(iso) {
  const sleutel = `${iso.geldig}|${iso.bijgewerkt}`;
  if (isobarenLaag && sleutel === isobarenLaatsteSleutel) return;
  verwijderIsobaren();
  isobarenLaatsteSleutel = sleutel;
  const lagen = [];
  const labels = [];
  for (const lijn of iso.lijnen) {
    lagen.push(L.polyline(lijn.punten, {
      pane: 'frontenPane', interactive: false,
      // 2026-08-30 (4e ronde), op verzoek van Lex ("nog iets dikker"): 1.7/1.1 -> 2.4/1.5.
      color: '#1b1e2a', weight: lijn.hoofd ? 2.4 : 1.5, opacity: lijn.hoofd ? 0.85 : 0.65,
      smoothFactor: 1.2,
    }));
    if (!lijn.hoofd) continue;
    // Eén label halverwege; bij een lange lijn ook op een kwart en driekwart.
    const n = lijn.punten.length;
    const posities = n > 60 ? [0.25, 0.5, 0.75] : [0.5];
    for (const f of posities) {
      const p = lijn.punten[Math.min(n - 1, Math.floor(n * f))];
      labels.push(L.marker(p, {
        pane: 'frontenPane', interactive: false, keyboard: false,
        icon: L.divIcon({ className: 'isobaar-label', html: String(lijn.hpa), iconSize: [44, 20], iconAnchor: [22, 10] }),
      }));
    }
  }
  for (const e of iso.extrema ?? []) {
    labels.push(L.marker([e.lat, e.lon], {
      pane: 'frontenPane', interactive: false, keyboard: false,
      icon: L.divIcon({ className: `drukcentrum drukcentrum-${e.type.toLowerCase()}`, html: `<span class="drukcentrum-letter">${e.type}</span><span class="drukcentrum-hpa">${e.hpa}</span>`, iconSize: [40, 40], iconAnchor: [20, 20] }),
    }));
  }
  isobarenLaag = L.layerGroup(lagen).addTo(kaart);
  isobarenLaag.labels = L.layerGroup(labels);
  zetIsobaarLabelsZichtbaar();
}

function zetIsobaarLabelsZichtbaar() {
  if (!isobarenLaag?.labels || !kaart) return;
  const toon = kaart.getZoom() >= ISOBAAR_LABEL_MIN_ZOOM;
  if (toon && !kaart.hasLayer(isobarenLaag.labels)) isobarenLaag.labels.addTo(kaart);
  if (!toon && kaart.hasLayer(isobarenLaag.labels)) kaart.removeLayer(isobarenLaag.labels);
}

function verwijderIsobaren() {
  if (!isobarenLaag) return;
  if (isobarenLaag.labels && kaart.hasLayer(isobarenLaag.labels)) kaart.removeLayer(isobarenLaag.labels);
  kaart.removeLayer(isobarenLaag);
  isobarenLaag = null;
  isobarenLaatsteSleutel = null;
}

// 2026-08-30, op verzoek van Lex: de complete DWD-bronkaart schermvullend
// (knop DWD naast Satelliet). De backend houdt de onbewerkte PNG (5 MB) in
// geheugen (/api/fronten-bron.png); de analysetijd komt uit /api/fronten-info.
async function openDwdKaart() {
  DWD_KAART_OVERLAY_EL.classList.remove('verborgen');
  DWD_KAART_IMG_EL.classList.add('passend');
  let info = null;
  try { info = await fetch('/api/fronten-info').then((r) => r.json()); } catch { /* status blijft kaal */ }
  if (!info?.beschikbaar) {
    DWD_KAART_STATUS_EL.textContent = 'DWD-Bodenanalyse — nog niet opgehaald';
    DWD_KAART_IMG_EL.removeAttribute('src');
    return;
  }
  // 2026-08-30, op vraag van Lex ("discrepantie?" — kop zei 02:00, kaart zelf
  // "00 UTC"): zelfde moment, alleen NL-tijd vs UTC. UTC er nu expliciet bij.
  const utcTekst = info.analyseTijd ? ` (${String(new Date(info.analyseTijd).getUTCHours()).padStart(2, '0')} UTC)` : '';
  DWD_KAART_STATUS_EL.textContent = `DWD-Bodenanalyse ${info.analyseTijd ? nieuwSindsTekst(info.analyseTijd) : ''}${utcTekst} · tik = zoom`;
  DWD_KAART_IMG_EL.src = `/api/fronten-bron.png?v=${encodeURIComponent(info.bijgewerkt)}`;
}

function sluitDwdKaart() {
  DWD_KAART_OVERLAY_EL.classList.add('verborgen');
}

// 2026-08-30, op verzoek van Lex: gradengrid (breedte-/lengtegraden) op de
// kaart, aan/uit met de knop uiterst links in de onderste balk, "hangend aan
// de zoomfactor": hoe verder ingezoomd, hoe fijner de maaswijdte. De lijnen
// worden alleen getekend voor het zichtbare gebied (plus een rand), en
// opnieuw bij elke move/zoom (zie kaart.on('moveend zoomend') in initMap).
// Labels (bv. "52°N", "4.5°E") zitten aan de linker- en bovenrand van het
// scherm zodat ze altijd zichtbaar blijven. Voorkeur per toestel bewaard.
const GRADEN_KEY = 'gradenGrid';
// [vanaf zoom, stap in graden] — eerste passende regel (van fijn naar grof).
const GRADEN_STAPPEN = [[13, 0.1], [11, 0.25], [9, 0.5], [7, 1], [5, 2], [4, 5], [2, 10], [0, 30]];
let gradenActief = false;
let gradenLaag = null;

function gradenStapVoorZoom(zoom) {
  return (GRADEN_STAPPEN.find(([vanaf]) => zoom >= vanaf) ?? GRADEN_STAPPEN[GRADEN_STAPPEN.length - 1])[1];
}

// Nette labeltekst: geen "52.00", wel "4.5"; N/S en E/W i.p.v. minteken.
function gradenLabel(waarde, isBreedte) {
  const abs = Math.abs(waarde);
  const tekst = Number.isInteger(abs) ? String(abs) : String(parseFloat(abs.toFixed(3)));
  const kant = isBreedte ? (waarde < 0 ? 'S' : 'N') : (waarde < 0 ? 'W' : 'E');
  return `${tekst}°${kant}`;
}

function tekenGradenGrid() {
  if (!kaart) return;
  if (!gradenLaag) gradenLaag = L.layerGroup().addTo(kaart);
  gradenLaag.clearLayers();
  gradenVakLaag = null; gradenVakSleutel = null; // vak-markering is mee gewist; volgende mousemove tekent 'm opnieuw
  const stap = gradenStapVoorZoom(kaart.getZoom());
  const grenzen = kaart.getBounds().pad(0.1);
  const lijnStijl = { pane: 'gradenPane', color: '#1a2233', weight: 0.8, opacity: 0.6, interactive: false }; // 2026-08-30, Lex: donkere lijnen i.p.v. lichtblauw
  const labelStijl = (tekst) => L.divIcon({ className: 'graden-label', html: tekst, iconSize: null, iconAnchor: [0, 0] });
  const zichtbaar = kaart.getBounds();
  const zuid = Math.max(-85, zichtbaar.getSouth()); // buiten ±85 tekent Leaflet/Mercator toch niets zinnigs
  const noord = Math.min(85, zichtbaar.getNorth());
  // Breedtegraden (horizontale lijnen), label aan de linkerrand.
  for (let lat = Math.ceil(Math.max(-85, grenzen.getSouth()) / stap) * stap; lat <= Math.min(85, grenzen.getNorth()); lat += stap) {
    lat = parseFloat(lat.toFixed(6)); // drijvende-komma-ruis (0.30000000000000004) weg
    L.polyline([[lat, grenzen.getWest()], [lat, grenzen.getEast()]], lijnStijl).addTo(gradenLaag);
    if (lat >= zuid && lat <= noord) {
      L.marker([lat, zichtbaar.getWest()], { icon: labelStijl(gradenLabel(lat, true)), pane: 'gradenPane', interactive: false, keyboard: false })
        .addTo(gradenLaag);
    }
  }
  // Lengtegraden (verticale lijnen), label aan de bovenrand.
  for (let lon = Math.ceil(grenzen.getWest() / stap) * stap; lon <= grenzen.getEast(); lon += stap) {
    lon = parseFloat(lon.toFixed(6));
    L.polyline([[Math.max(-85, grenzen.getSouth()), lon], [Math.min(85, grenzen.getNorth()), lon]], lijnStijl).addTo(gradenLaag);
    if (lon >= zichtbaar.getWest() && lon <= zichtbaar.getEast()) {
      // Label-lengte terugbrengen naar -180..180 als de kaart 'doorloopt'.
      const lonLabel = ((lon + 180) % 360 + 360) % 360 - 180;
      L.marker([noord, lon], { icon: labelStijl(gradenLabel(lonLabel, false)), pane: 'gradenPane', interactive: false, keyboard: false })
        .addTo(gradenLaag);
    }
  }
}

// Vak-markering + uitlezing (zie kaart.on('mousemove') in initMap): een
// rechthoek over het gridvak waar de cursor in zit, plus een klein kaartje
// linksboven (onder de zoomknoppen) met de vakgrenzen en de exacte
// cursorpositie. Het vak wordt alleen opnieuw getekend als de cursor een
// ANDER vak binnengaat (sleutel), de cursorpositie ververst wel elke keer.
const GRADEN_SUBVAKKEN = 10; // onderverdeling van het actieve vak (10 = tienden van de stap)
let gradenVakLaag = null;
let gradenVakSleutel = null;
const GRADEN_VAK_EL = document.getElementById('gradenVak');

function toonGradenVak(latlng) {
  if (!kaart || !gradenLaag) return;
  const stap = gradenStapVoorZoom(kaart.getZoom());
  const zuid = parseFloat((Math.floor(latlng.lat / stap) * stap).toFixed(6));
  const west = parseFloat((Math.floor(latlng.lng / stap) * stap).toFixed(6));
  const noord = parseFloat((zuid + stap).toFixed(6));
  const oost = parseFloat((west + stap).toFixed(6));
  const sleutel = `${stap}|${zuid}|${west}`;
  if (sleutel !== gradenVakSleutel) {
    gradenVakSleutel = sleutel;
    if (gradenVakLaag) gradenLaag.removeLayer(gradenVakLaag);
    gradenVakLaag = L.layerGroup().addTo(gradenLaag);
    L.rectangle([[zuid, west], [noord, oost]], {
      pane: 'gradenPane', color: '#3ec6ff', weight: 1.2, opacity: 0.8, fillColor: '#3ec6ff', fillOpacity: 0.06, interactive: false,
    }).addTo(gradenVakLaag);
    // 2026-08-30, op verzoek van Lex: het actieve vak krijgt een fijnere
    // onderverdeling (GRADEN_SUBVAKKEN gelijke delen, dus bij 1° per 0.1°),
    // met de middellijn iets sterker en kleine labels langs de linker- en
    // bovenrand van het vak.
    const sub = stap / GRADEN_SUBVAKKEN;
    const subStijl = (i) => ({ pane: 'gradenPane', color: '#3ec6ff', weight: i === GRADEN_SUBVAKKEN / 2 ? 0.9 : 0.5, opacity: i === GRADEN_SUBVAKKEN / 2 ? 0.7 : 0.45, dashArray: i === GRADEN_SUBVAKKEN / 2 ? null : '3 3', interactive: false });
    const subLabel = (tekst) => L.divIcon({ className: 'graden-label graden-sublabel', html: tekst, iconSize: null, iconAnchor: [0, 0] });
    for (let i = 1; i < GRADEN_SUBVAKKEN; i++) {
      const lat = parseFloat((zuid + i * sub).toFixed(6));
      const lon = parseFloat((west + i * sub).toFixed(6));
      L.polyline([[lat, west], [lat, oost]], subStijl(i)).addTo(gradenVakLaag);
      L.polyline([[zuid, lon], [noord, lon]], subStijl(i)).addTo(gradenVakLaag);
      L.marker([lat, west], { icon: subLabel(gradenLabel(lat, true)), pane: 'gradenPane', interactive: false, keyboard: false }).addTo(gradenVakLaag);
      L.marker([noord, lon], { icon: subLabel(gradenLabel(lon, false)), pane: 'gradenPane', interactive: false, keyboard: false }).addTo(gradenVakLaag);
    }
  }
  if (GRADEN_VAK_EL) {
    const dec = stap >= 1 ? 2 : stap >= 0.25 ? 3 : 4;
    GRADEN_VAK_EL.innerHTML =
      `<div class="graden-vak-regel">vak ${gradenLabel(zuid, true)}–${gradenLabel(noord, true)} · ${gradenLabel(west, false)}–${gradenLabel(oost, false)}</div>` +
      `<div class="graden-vak-regel graden-vak-cursor">${latlng.lat.toFixed(dec)}°, ${latlng.lng.toFixed(dec)}° · ${graadNaarMinuten(latlng.lat, true)} ${graadNaarMinuten(latlng.lng, false)}</div>`;
    GRADEN_VAK_EL.classList.remove('verborgen');
  }
}

function verbergGradenVak() {
  if (gradenVakLaag && gradenLaag) gradenLaag.removeLayer(gradenVakLaag);
  gradenVakLaag = null;
  gradenVakSleutel = null;
  GRADEN_VAK_EL?.classList.add('verborgen');
}

// 51.6487 -> "51-38.92N": dezelfde schrijfwijze als in de NAVTEX-berichten
// zelf, zodat je een positie uit een bericht direct kunt vergelijken.
function graadNaarMinuten(waarde, isBreedte) {
  const abs = Math.abs(waarde);
  const graden = Math.floor(abs);
  const minuten = ((abs - graden) * 60).toFixed(2).padStart(5, '0');
  const kant = isBreedte ? (waarde < 0 ? 'S' : 'N') : (waarde < 0 ? 'W' : 'E');
  return `${String(graden).padStart(isBreedte ? 2 : 3, '0')}-${minuten}${kant}`;
}

function toggleGradenGrid() {
  gradenActief = !gradenActief;
  TOGGLE_GRADEN_EL?.classList.toggle('actief', gradenActief);
  if (gradenActief) {
    tekenGradenGrid();
  } else if (gradenLaag) {
    verbergGradenVak();
    kaart.removeLayer(gradenLaag);
    gradenLaag = null;
  }
  try { localStorage.setItem(GRADEN_KEY, gradenActief ? 'aan' : 'uit'); } catch (_) { /* privé-modus */ }
}

function toggleFronten() {
  frontenActief = !frontenActief;
  TOGGLE_FRONTEN_EL.classList.toggle('actief', frontenActief);
  if (frontenActief) {
    verversFronten();
    frontenTimer = setInterval(verversFronten, 15 * 60 * 1000);
  } else {
    if (frontenTimer) { clearInterval(frontenTimer); frontenTimer = null; }
    clearTimeout(frontenTerugvalTimer); frontenTerugvalTimer = null;
    if (frontenLaag) { kaart.removeLayer(frontenLaag); frontenLaag = null; }
    verwijderIsobaren();
    frontenLaatsteBijgewerkt = null;
    frontenPngVariant = null;
    FRONTEN_INFO_EL.classList.add('verborgen');
  }
}

function toggleZeeModus() {
  zeeModusActief = !zeeModusActief;
  TOGGLE_ZEE_EL.classList.toggle('actief', zeeModusActief);
  kaart.getContainer().classList.toggle('zee-modus-actief', zeeModusActief);
  // 2026-08-27: de 📻-knop (ruwe NAVTEX-ontvangst, zie openNavtexRuw())
  // hoort bij de zeekaart — alleen tonen in Zee-modus, en de viewer sluiten
  // als Zee-modus uitgaat zodat de 10s-ververstimer niet blijft doorlopen.
  if (NAVTEX_RUW_KNOP_EL) NAVTEX_RUW_KNOP_EL.style.display = zeeModusActief ? '' : 'none';
  if (!zeeModusActief) sluitNavtexRuw();
  // 2026-08-27: "volgende uitzending"-plaatje hoort ook bij de zeekaart —
  // meteen tonen/verbergen bij het omschakelen i.p.v. wachten op de
  // eerstvolgende klok-tik. De AUTO-monitor (openen bij binnenrollende
  // tekst) start/stopt op hetzelfde moment, net als de gale-windvanen
  // (verversWindvanen ruimt zichzelf op als Zee-modus uit is).
  ververNavtexVolgende();
  zorgNavtexAutoMonitor();
  verversWindvanen();
  if (zeeModusActief) {
    if (!zeeLaag) {
      zeeLaag = L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', {
        attribution: 'OpenSeaMap',
        maxZoom: 18,
        pane: 'zeePane',
      });
    }
    // 2026-08-28: dieptelaag ÓNDER de seamarks (zelfde pane, eerder
    // toegevoegd = eronder getekend). maxNativeZoom 12: dieper inzoomen
    // rekt de laatste echte dieptetegel op i.p.v. grijs te worden. Opacity
    // zodat vanen, drukgebieden en waarschuwingen leesbaar blijven.
    if (!zeeDiepteLaag) {
      zeeDiepteLaag = L.tileLayer('/api/tegel-diepte/{z}/{x}/{y}.png?v=d1', {
        attribution: 'EMODnet Bathymetry',
        maxNativeZoom: 12,
        maxZoom: 18,
        opacity: 0.55,
        pane: 'zeePane',
      });
    }
    if (!zeeGebiedenLaag) zeeGebiedenLaag = bouwZeeGebiedenLaag();
    kaart.addLayer(zeeDiepteLaag);
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
    // 2026-08-27: na het binnenkomen van de teksten ook de gale-windvanen
    // (her)tekenen — zie verversWindvanen().
    Promise.all([laadZeeSynopsis(), laadMetOfficeSynopsis()]).then(() => {
      verversZeeGebiedLabels();
      verversWindvanen();
    });
    laadZeeWaarschuwingen().then(verversWindvanen);
    // 2026-08-21: Zee-modus en Vliegradar tonen allebei een heel andere
    // kaartweergave (Lex: "of boten of vliegtuigen") — wederzijds
    // uitsluitend. vliegModusActief is op dit punt nog de OUDE waarde (dit
    // if-blok draait pas ná de toggle hierboven), dus deze check is veilig.
    if (vliegModusActief) toggleVliegradar();
    if (kaartVolgType) stopKaartVolgen(false); // zie toggleVliegradar
  } else {
    if (zeeLaag) kaart.removeLayer(zeeLaag);
    if (zeeDiepteLaag) kaart.removeLayer(zeeDiepteLaag);
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
// 2026-09-02: eerst hard op 250 gezet (zie de git-geschiedenis), maar met 9261 schepen bij
// die volle 250km bleek de kaart merkbaar traag op te bouwen -- Lex wilde 'm daarom
// INSTELBAAR i.p.v. een vaste waarde: standaard 50 (net als voorheen), met een knopje
// (#vaarStraalKnop) om 'm in stappen van 25 op te hogen tot 250 "voor noodgevallen".
// Servergrens (server.js, Math.min(250,...)) en BOX_KM (vaarradarAishub.js) blijven op
// 250 staan -- die bepalen het PLAFOND, dit hier is wat de kaart daadwerkelijk opvraagt.
const VAARRADAR_STRAAL_STAPPEN = [50, 75, 100, 125, 150, 175, 200, 225, 250];
// 2026-09-02, op verzoek van Lex ("zoomen gaat niet lekker meer met een
// range boven de 50... pas opbouwen na een vrij forse zoomfactor") -- na het
// weghalen van clustering (zie vorige commit) worden bij een grote straal
// alle schepen als losse DOM-markers opgebouwd, ook ver uitgezoomd waar je
// toch niks van de losse stipjes kunt onderscheiden. Onder dit zoomniveau
// bouwt ververVaarradar() de laag niet meer op (en slaat zelfs de dure
// /api/vaarradar-aanvraag over) -- pas erboven verschijnen de schepen weer.
// 10 is een eerste inschatting (vergelijkbaar met VLIEGRADAR_ZOOM=8, maar
// bewust hoger -- "vrij fors" was Lex' eigen woordkeuze); bijstellen als het
// te laat/te vroeg aanvoelt.
const VAAR_MIN_ZOOM_VOOR_SCHEPEN = 10;
// Startbeeld bij het aanzetten van de vaarradar: de Maasmond (zie
// toggleVaarradar()). Zoom 12 toont Hoek van Holland t/m de Maasvlakte en
// een stuk Nieuwe Waterweg.
// 2026-09-02-herziening, op Lex' screenshot ("Wil je de initiele zoom zo
// maken?"): niet alleen de Maasmond, maar het hele Rijnmondgebied --
// Maasvlakte/Hoek van Holland in het westen t/m Dordrecht/Gouda in het
// oosten, Haringvliet/Hollands Diep in het zuiden. fitBounds i.p.v. een
// vaste zoom, zodat het op telefoon én breed scherm hetzelfde gebied toont.
const VAAR_STARTBOUNDS = [[51.70, 3.85], [52.05, 4.85]];
const VAARRADAR_STRAAL_KEY = 'weerVaarradarStraalKm';
let vaarradarStraalKm = 50;
try {
  const opgeslagen = Number(localStorage.getItem(VAARRADAR_STRAAL_KEY));
  if (VAARRADAR_STRAAL_STAPPEN.includes(opgeslagen)) vaarradarStraalKm = opgeslagen;
} catch (_) {
  /* prive-modus, gewoon bij de standaard (50) blijven */
}
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
// 2026-09-01-bug (Lex: "de plaatjes van de boten blijven kort in beeld") --
// ververVaarradar() deed elke poll (RADAR_POLL_MS = 3s) een clearLayers()
// en maakte alle bootjes opnieuw aan, dus een open scheepspopup (met de net
// opgehaalde foto) ging binnen 3s vanzelf weer dicht. Nu blijft elke marker
// per MMSI bestaan en wordt alleen positie/icoon/tekst bijgewerkt; de popup
// blijft dus gewoon openstaan totdat je zelf ernaast op de kaart tikt
// (Leaflet-standaard) of 'm sluit. De foto-url wordt per MMSI onthouden
// zodat 'ie bij elke update in de popup blijft staan en nooit twee keer
// opgezocht wordt.
const vaarMarkers = new Map(); // mmsi -> L.marker
// 2026-09-03, op verzoek van Lex ("kan ik ook een vessel zoeken op onze
// kaart"): alle schepen uit de laatste poll (ONgefilterd, dus ook wat het
// type-filter of de AISHub-knop verbergt), zodat zoeken altijd de volledige
// set doorzoekt. Gevuld in ververVaarradar(), gelezen door vaarZoekUitvoeren().
let laatsteVaarSchepen = [];
// 2026-09-02: de clustervrije-zone/hysterese-aanpak (opgebouwd op verzoek van
// Lex, "is het mogelijk om een specifiek gebied vrij te houden van
// clustering") is hier weer WEGGEHAALD, op Lex' eigen verzoek ("Alles wat
// buiten de clustervrije zone ligt knippert. Hef anders die zone maar op").
// Wat feitelijk bleek: niet de zonerand was het probleem (de hysterese-fix
// van daarnet loste dat wel op) -- ALLES in de geclusterde laag (vaarLaag)
// knipperde, ongeacht afstand tot een rand, terwijl de losse zone (nooit
// geclusterd) nooit knipperde. Dat wijst naar L.markerClusterGroup zelf
// (vermoedelijk refreshClusters(), zie de weggehaalde aanroep hieronder) als
// echte oorzaak, niet naar de zonegrens. Vaarradar gebruikt hieronder nu een
// kale L.layerGroup voor ALLE schepen -- geen clustering meer, dus ook geen
// clustervrije-zone-onderscheid meer nodig. Lex test zelf even hoe zoomen/
// pannen aanvoelt bij veel schepen (de oorspronkelijke reden voor clustering
// was duizenden bootjes bij een grote straal, zie wisselVaarStraal()) --
// mocht dat traag blijken, dan is clustering met een écht werkende refresh-
// aanpak een latere vervolgstap, niet dit weer blind terugzetten.
const scheepsfotoUrls = new Map(); // mmsi -> url (string) of null (= geen foto)
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

// 2026-08-31, op verzoek van Lex ("een ander icoon, zonder rondje, desnoods
// zoals de echte vaarradar dat doet") — eerste versie gebruikte de ⛴️-emoji
// (zijaanzicht) met een geraden +90deg-rotatiecorrectie, maar Lex wees erop
// dat een zijaanzicht niet werkt voor een van-bovenaf-geroteerd icoon
// ("dat plaatje met een zijaanzicht werkt niet, beter een soort papieren
// bootje van bovenaf"). Vervangen door een zelf getekende SVG. Tweede
// poging (een gladde kite-curve, boeg->volle breedte->afgeronde punt) zag er
// volgens Lex uit als "een soort druppel", niet als een boot — een echte
// scheepsromp van bovenaf heeft een puntige boeg maar daarna vrij RECHTE,
// evenwijdige zijden (het "midscheeps"-gedeelte) en een platte achtersteven
// (spiegel), geen doorlopende bolle curve. Path hieronder volgt dat: boeg
// (punt) -> rechte schuine zijden naar volle breedte -> rechte evenwijdige
// zijden -> licht afgeronde hoeken naar een platte achtersteven. Boeg wijst
// naar boven (noord) bij 0°, dus koersGraden kan direct als rotatie.
// 2026-09-01, op verzoek van Lex ("ik zou de bootjes een kleurtje willen
// geven -- kunnen we nog wat leuks doen om tussen de boten te differentieren
// met de kleuren?"). Eerste van drie besproken opties gekozen: elk schip een
// eigen, VASTE kleur i.p.v. per scheepstype (zou shiptype-data uit AIS-catcher
// vereisen -- nog niet bevestigd of de lokale geojson-feed dat meegeeft, zie
// vaarradarLokaal.js) of op snelheid/status (zegt niets over WELK schip het
// is). Zelfde soort idee als de vaste kleur per NAVTEX-station in
// navtexLokaal.js, maar daar is een kleine, VASTE lijst met stations die
// stuk voor stuk met de hand een kleur kregen -- hier is elk denkbaar MMSI
// mogelijk, dus een kleine hash i.p.v. een lookup-tabel. Simpele
// vermenigvuldig-hash (a la Java's String.hashCode) + een extra
// bit-menging (hash ^ hash>>>16, dezelfde afrondingstruc als MurmurHash's
// finalizer) zodat schepen met dezelfde landcode (MMSI's beginnen met een
// vast MID-landprefix, dus zonder die extra menging zouden bijv. alle
// Nederlandse schepen -- 244/245/246... -- toch te dicht bij elkaar op het
// kleurenwiel kunnen uitkomen). Zelfde MMSI geeft altijd dezelfde kleur,
// ook over herstarts/polls heen (puur een functie van het getal, geen
// opgeslagen state nodig).
function kleurVoorMmsi(mmsi) {
  let hash = 0;
  const tekst = String(mmsi ?? '');
  for (let i = 0; i < tekst.length; i++) {
    hash = (Math.imul(hash, 31) + tekst.charCodeAt(i)) | 0;
  }
  hash ^= hash >>> 16;
  const tint = ((hash % 360) + 360) % 360; // hash is een int32, dus kan negatief zijn
  return `hsl(${tint}, 78%, 62%)`;
}

// 2026-09-01, vervolg op kleurVoorMmsi hierboven -- Lex wilde "gewoon een
// keuzelijst" om tussen de drie besproken kleurmodi te wisselen i.p.v. maar
// een van de drie definitief te kiezen. vaarKleurModus (hieronder, met
// VAARKLEUR_KEY voor het onthouden per toestel -- zelfde localStorage-
// patroon als GRADEN_KEY/NAVTEX_AUTO_KEY elders) bepaalt welke van de drie
// kleurVoorSchip() teruggeeft; de #vaarKleurModus-knop (zie index.html,
// alleen zichtbaar in Vaart-modus) cyclet ertussen.
const VAARKLEUR_KEY = 'weerVaarKleurModus';
const VAARKLEUR_MODI = ['schip', 'type', 'snelheid'];
const VAARKLEUR_MODUS_LABEL = { schip: 'Schip', type: 'Type', snelheid: 'Snelheid' };
// 2026-09-02, op verzoek van Lex ("nooit goed begrepen wat 'Schip' anders
// doet dan dat je alle kleuren ziet") -- 'schip' geeft elk MMSI gewoon een
// eigen VASTE, willekeurig ogende kleur (zie kleurVoorMmsi() hierboven) --
// nuttig om twee dicht-bij-elkaar-liggende bootjes uit elkaar te houden,
// maar zegt verder niets over het schip zelf. Nu de ERI/binnenvaart-codes
// ook meegenomen worden in categoriseerScheepstype() (zie
// vaarradarLokaal.js), is 'type' een stuk informatiever geworden -- daarom
// als standaard gekozen i.p.v. 'schip'. 'schip' blijft gewoon beschikbaar
// via de kleurmodus-knop, alleen niet meer de eerste keer die je ziet.
let vaarKleurModus = 'type';
try {
  const opgeslagen = localStorage.getItem(VAARKLEUR_KEY);
  if (VAARKLEUR_MODI.includes(opgeslagen)) vaarKleurModus = opgeslagen;
} catch (_) {
  /* privé-modus, gewoon bij de standaard ('type') blijven */
}

// Optie 2: kleur per scheepscategorie (zie categoriseerScheepstype() in
// vaarradarLokaal.js voor hoe s.scheepscategorie tot stand komt). 'overig'
// (bekend type, maar geen van de onderstaande) en een ontbrekende categorie
// (geen scheepstype-data binnengekomen) delen bewust dezelfde neutrale
// grijstint -- hetzelfde "geen idee"-grijs (#9aa0b4) dat de NAVTEX-kaart ook
// al gebruikt voor een onbevestigd station (zie STATION_KLEUR_ONBEKEND in
// navtexLokaal.js), voor eenzelfde visuele taal door de hele app heen.
const KLEUR_SCHEEP_ONBEKEND = '#9aa0b4';
const KLEUR_PER_SCHEEPSCATEGORIE = {
  vracht: '#4c9df0',
  tanker: '#ff2020', // 2026-09-02, op verzoek van Lex ("die wil ik fel rood, net als bij MarineTraffic") -- was #f0824c
  vissersboot: '#5be0a0',
  sleepboot: '#e0c14c',
  plezierjacht: '#f04ca8',
  passagiersschip: '#7b4cf0',
  hogesnelheid: '#ff6b6b',
  hulpdienst: '#4cf0e0',
  // 2026-09-02, op verzoek van Lex (filterpaneel per scheepstype, zie
  // bepaalScheepscategorie() in vaarradarLokaal.js) -- navigatiehulpmiddelen
  // (boeien/bakens/vuurtorens) zijn geen "schip", dus een eigen kleur i.p.v.
  // mee te liften op een van de bovenstaande vaartuig-categorieën. Wit/grijs
  // gekozen, vergelijkbaar met hoe MarineTraffic deze toont (los ruitje).
  navigatiehulp: '#c9cdd8',
  overig: KLEUR_SCHEEP_ONBEKEND,
};
const SCHEEPSCATEGORIE_LABEL = {
  vracht: 'Vrachtschip',
  tanker: 'Tanker',
  vissersboot: 'Vissersboot',
  sleepboot: 'Sleepboot',
  plezierjacht: 'Plezierjacht',
  passagiersschip: 'Passagiersschip',
  hogesnelheid: 'Hogesnelheidsvaartuig',
  hulpdienst: 'Hulpvaartuig',
  navigatiehulp: 'Navigatiehulpmiddel',
  // 'overig' bewust GEEN label -- "Overig" in de popup zegt niks nuttigs,
  // beter helemaal weglaten dan een loze regel tonen.
};

// 2026-09-03, op verzoek van Lex ("ja bouw maar" -- fijnmaziger filter zoals
// MarineTraffic's subgroepen, maar alleen met wat AIS zelf hard maakt, zie
// bepaalScheepssubtype() in vaarradarLokaal.js). Per categorie de subtypes
// die in het filterpaneel als eigen rij verschijnen; elk subtype dat NIET in
// de lijst van zijn categorie staat (of null is) valt onder de pseudo-rij
// 'rest', zodat elke categorie altijd een sluitende verdeling heeft en een
// schip nooit "tussen de rijen door" onfilterbaar wordt. Categorieën zonder
// vermelding hebben geen subrijen.
const LADING_SUBTYPES = ['lading-a', 'lading-b', 'lading-c', 'lading-d'];
const VAAR_SUBTYPES_PER_CATEGORIE = {
  tanker: [...LADING_SUBTYPES, 'binnenvaart', 'rest'],
  vracht: [...LADING_SUBTYPES, 'binnenvaart', 'rest'],
  passagiersschip: ['binnenvaart', 'rest'],
  sleepboot: ['sleepboot', 'slepend', 'slepend-groot', 'binnenvaart', 'rest'],
  hulpdienst: ['loods', 'sar', 'sar-vliegtuig', 'haventender', 'antivervuiling', 'wetshandhaving', 'medisch', 'binnenvaart', 'rest'],
  plezierjacht: ['zeil', 'plezier', 'rest'],
  overig: ['bagger', 'duik', 'militair', 'wig', 'binnenvaart', 'rest'],
};
const SCHEEPSSUBTYPE_LABEL = {
  'lading-a': 'Gev. lading cat. A',
  'lading-b': 'Gev. lading cat. B',
  'lading-c': 'Gev. lading cat. C',
  'lading-d': 'Gev. lading cat. D',
  binnenvaart: 'Binnenvaart',
  rest: 'Overig / onbekend',
  sleepboot: 'Sleepboot',
  slepend: 'Slepend',
  'slepend-groot': 'Slepend, groot',
  loods: 'Loodsboot',
  sar: 'Search & Rescue',
  'sar-vliegtuig': 'SAR-vliegtuig', // 2026-09-03: op MMSI 111MIDxxx (berichttype 9), zie isSarVliegtuigMmsi() backend
  haventender: 'Haventender',
  antivervuiling: 'Antivervuiling',
  wetshandhaving: 'Handhaving / overheid', // AIS 55 "law enforcement": ook Rijkswaterstaat, douane e.d.
  medisch: 'Medisch transport',
  bagger: 'Baggerschip',
  duik: 'Duikvaartuig',
  militair: 'Militair',
  wig: 'Grondeffect (WIG)',
  zeil: 'Zeilschip',
  plezier: 'Motorjacht',
};

// Subtype-sleutel zoals het filterpaneel 'm kent (zie hierboven): het echte
// subtype als de categorie die als rij heeft, anders 'rest'; null als de
// categorie helemaal geen subrijen heeft.
function scheepsFilterSubtype(s) {
  const subs = VAAR_SUBTYPES_PER_CATEGORIE[scheepsFilterCategorie(s)];
  if (!subs) return null;
  return subs.includes(s.scheepssubtype) ? s.scheepssubtype : 'rest';
}

// Typeregel voor de scheepspopup: zo specifiek als AIS het toelaat.
// "Loodsboot" i.p.v. "Hulpvaartuig", "Tanker · gevaarlijke lading cat. A",
// "Vrachtschip (binnenvaart)" -- en gewoon de categorie als er niets fijners is.
function scheepsTypeLabel(s) {
  const cat = SCHEEPSCATEGORIE_LABEL[s.scheepscategorie] ?? null;
  const sub = s.scheepssubtype;
  if (!sub || sub === 'rest') return cat ?? 'Scheepstype onbekend';
  if (sub === 'binnenvaart') return `${cat ?? 'Schip'} (binnenvaart)`;
  if (sub.startsWith('lading-')) return `${cat ?? 'Schip'} · gevaarlijke lading cat. ${sub.slice(-1).toUpperCase()}`;
  return SCHEEPSSUBTYPE_LABEL[sub] ?? cat ?? 'Scheepstype onbekend';
}

// 2026-09-03, op verzoek van Lex ("kan ik ook een vessel zoeken op onze
// kaart. Dit ontbreekt", met MarineTraffic als voorbeeld): zoekveld in het
// AIS-menu. Zoekt op deel van de naam (hoofdletterongevoelig) of op begin
// van de MMSI, alleen binnen wat de laatste poll binnenbracht (dus binnen
// de ingestelde zoekstraal -- geen wereldwijde zoektocht, daar hebben we
// geen bron voor). Max 8 treffers, dichtstbijzijnde eerst. Klik = kaart
// naar het schip + popup open; staat het schip verborgen door het
// type-filter of de AISHub-knop, dan vliegt de kaart er wel heen maar is
// er geen marker om te openen -- dat staat dan in de treffer vermeld.
const vaarZoekVeldEl = document.getElementById('vaarZoekVeld');
const vaarZoekResultatenEl = document.getElementById('vaarZoekResultaten');
function vaarZoekUitvoeren() {
  if (!vaarZoekVeldEl || !vaarZoekResultatenEl) return;
  const q = vaarZoekVeldEl.value.trim().toLowerCase();
  vaarZoekResultatenEl.innerHTML = '';
  if (!q) { vaarZoekResultatenEl.classList.add('verborgen'); return; }
  vaarZoekResultatenEl.classList.remove('verborgen');
  const isMmsi = /^\d+$/.test(q);
  const treffers = laatsteVaarSchepen
    .filter((s) => (isMmsi ? String(s.mmsi).startsWith(q) : (s.naam || '').toLowerCase().includes(q)))
    .map((s) => ({ s, km: typeof s.afstandKm === 'number' ? s.afstandKm : null })) // afstand komt uit de backend (vaarradar.js)
    .sort((a, b) => (a.km ?? 1e9) - (b.km ?? 1e9))
    .slice(0, 8);
  if (!treffers.length) {
    vaarZoekResultatenEl.innerHTML = `<div class="vaar-zoek-leeg">Geen schip gevonden binnen ${vaarradarStraalKm} km</div>`;
    return;
  }
  treffers.forEach(({ s, km }) => {
    const knop = document.createElement('button');
    knop.type = 'button';
    knop.className = 'vaar-zoek-treffer';
    const verborgen = schipVerborgenDoorFilter(s) || (!aishubZichtbaar && s.bron === 'aishub');
    const sub = [scheepsTypeLabel(s), km != null ? `${km < 10 ? km.toFixed(1) : Math.round(km)} km` : null, verborgen ? 'verborgen door filter' : null].filter(Boolean).join(' · ');
    knop.innerHTML = `<div class="vaar-zoek-treffer-naam"><span class="popup-scheepskleur" style="background:${kleurVoorSchip(s)}"></span>${escapeHtml(s.naam || `MMSI ${s.mmsi}`)}</div><div class="vaar-zoek-treffer-sub">${escapeHtml(sub)}</div>`;
    knop.addEventListener('click', () => vaarZoekGaNaar(s));
    vaarZoekResultatenEl.appendChild(knop);
  });
}
// 2026-09-03, op verzoek van Lex ("ik wil doorzoeken waarom er verborgen
// worden. Dit is echt veel leger"): telling voor het huidige kaartbeeld in
// het AIS-menu -- hoeveel schepen de laatste poll binnen het beeld heeft,
// hoeveel daarvan getekend zijn, en hoeveel er wegblijven door het
// scheepstype-filter of de AISHub-knop. Alles wat NIET in die telling zit
// maar wel bij MarineTraffic staat, is dus een ontvangstverschil, geen
// tekenverschil. Bijgewerkt na elke poll en na elke kaartbeweging.
const vaarTellingEl = document.getElementById('vaarTelling');
function werkVaarTellingBij() {
  if (!vaarTellingEl || !kaart) return;
  if (!vaarradarActief) { vaarTellingEl.textContent = ''; return; }
  const grens = kaart.getBounds();
  let inData = 0, getekend = 0, doorFilter = 0, doorAishub = 0, stapel = 0;
  const posities = new Set();
  laatsteVaarSchepen.forEach((s) => {
    if (typeof s.lat !== 'number' || typeof s.lon !== 'number' || !grens.contains([s.lat, s.lon])) return;
    inData++;
    if (!aishubZichtbaar && s.bron === 'aishub') { doorAishub++; return; }
    if (schipVerborgenDoorFilter(s)) { doorFilter++; return; }
    getekend++;
    const sleutel = `${s.lat.toFixed(4)},${s.lon.toFixed(4)}`; // ~10m: zelfde plek = over elkaar getekend
    if (posities.has(sleutel)) stapel++; else posities.add(sleutel);
  });
  const regels = [`In beeld: ${getekend} van ${inData} getekend`];
  if (doorFilter) regels.push(`${doorFilter} verborgen door typefilter`);
  if (doorAishub) regels.push(`${doorAishub} verborgen (AISHub uit)`);
  if (stapel) regels.push(`${stapel} op dezelfde plek als een ander`);
  vaarTellingEl.textContent = regels.join('\n');
}

function vaarZoekGaNaar(s) {
  if (typeof s.lat !== 'number' || typeof s.lon !== 'number') return;
  kaart.setView([s.lat, s.lon], Math.max(kaart.getZoom(), 14), { animate: true });
  const marker = vaarMarkers.get(s.mmsi);
  if (marker) kaart.once('moveend', () => marker.openPopup());
}
if (vaarZoekVeldEl) {
  vaarZoekVeldEl.addEventListener('input', vaarZoekUitvoeren);
  // Zolang er in het zoekveld getypt wordt mag het menu niet vanzelf
  // inklappen (de 3s-timer van zetVaarMenuOpen() -- pointerdown vangt een
  // muisklik al af, dit vangt ook focus via toetsenbord/autofocus).
  vaarZoekVeldEl.addEventListener('focus', () => annuleerVaarMenuAutoDicht());
  vaarZoekVeldEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const eerste = vaarZoekResultatenEl?.querySelector('.vaar-zoek-treffer'); if (eerste) eerste.click(); }
    if (e.key === 'Escape') { vaarZoekVeldEl.value = ''; vaarZoekUitvoeren(); vaarZoekVeldEl.blur(); }
  });
}

function kleurVoorScheepscategorie(categorie) {
  return KLEUR_PER_SCHEEPSCATEGORIE[categorie] ?? KLEUR_SCHEEP_ONBEKEND;
}

// 2026-09-02, op verzoek van Lex ("kunnen wij dit?" bij een MarineTraffic-
// screenshot van hun "Ship Type"-filterpaneel, daarna "go") -- aan/uit-
// vinkjes per scheepscategorie, zelfde categorieën als de kleurmodus 'type'
// hierboven gebruikt (geen tweede lijst om los bij te houden). 'onbekend'
// is een EXTRA, pseudo-categorie hier (geen echte waarde van
// categoriseerScheepstype()) voor schepen zonder scheepstype-data (null) --
// zonder deze rij zou je die schepen nooit kunnen uit-/aanvinken.
// Opgeslagen als lijst VERBORGEN categorieën (niet zichtbaar) i.p.v. lijst
// zichtbare -- dan betekent een lege/ontbrekende opslag automatisch "alles
// aan", zelfde soort "standaard alles zichtbaar tenzij expliciet uitgevinkt"
// als bij aishubZichtbaar hierboven.
const VAAR_TYPE_FILTER_KEY = 'weerVaarVerborgenTypes';
const VAAR_TYPE_FILTER_CATEGORIEEN = [...Object.keys(SCHEEPSCATEGORIE_LABEL), 'overig', 'onbekend'];
const VAAR_TYPE_FILTER_LABEL = { ...SCHEEPSCATEGORIE_LABEL, overig: 'Overig', onbekend: 'Onbekend / geen data' };
let vaarVerborgenCategorieen = new Set();
try {
  const opgeslagen = localStorage.getItem(VAAR_TYPE_FILTER_KEY);
  // 2026-09-03: naast hele categorieën ('tanker') ook subrijen ('tanker/lading-a').
  if (opgeslagen) vaarVerborgenCategorieen = new Set(opgeslagen.split(',').filter(isGeldigeVaarFilterSleutel));
} catch (_) {
  /* prive-modus, gewoon bij de standaard (niets verborgen) blijven */
}

function isGeldigeVaarFilterSleutel(sleutel) {
  const [cat, sub] = String(sleutel).split('/');
  if (!VAAR_TYPE_FILTER_CATEGORIEEN.includes(cat)) return false;
  return sub == null || (VAAR_SUBTYPES_PER_CATEGORIE[cat] ?? []).includes(sub);
}

// Een schip is verborgen als z'n hele categorie uitgevinkt is, óf de subrij
// waar het in valt (zie scheepsFilterSubtype()).
function schipVerborgenDoorFilter(s) {
  const cat = scheepsFilterCategorie(s);
  if (vaarVerborgenCategorieen.has(cat)) return true;
  const sub = scheepsFilterSubtype(s);
  return sub != null && vaarVerborgenCategorieen.has(`${cat}/${sub}`);
}

function bewaarVaarTypeFilter() {
  try {
    localStorage.setItem(VAAR_TYPE_FILTER_KEY, [...vaarVerborgenCategorieen].join(','));
  } catch (_) {
    /* prive-modus */
  }
}

// s.scheepscategorie is null zodra er geen scheepstype-data binnenkwam
// (zie categoriseerScheepstype() in vaarradarLokaal.js) -- die schepen
// vallen hier onder de pseudo-categorie 'onbekend', zie hierboven.
function scheepsFilterCategorie(s) {
  return s.scheepscategorie ?? 'onbekend';
}

// Bouwt het paneel eenmalig (leeg -> gevuld); latere aanroepen zijn een
// no-op zodra er al rijen staan -- de vinkjes zelf onthouden hun eigen
// staat via de change-listener hieronder, geen re-render per poll nodig
// (en dus ook geen kans om een net aangeklikt vinkje weer te overschrijven).
function bouwVaarTypeFilterPaneel() {
  if (!VAAR_TYPE_FILTER_PANEEL_EL || VAAR_TYPE_FILTER_PANEEL_EL.childElementCount) return;

  const allesRij = document.createElement('label');
  allesRij.className = 'vaar-type-filter-item vaar-type-filter-alles';
  const allesVink = document.createElement('input');
  allesVink.type = 'checkbox';
  allesVink.checked = vaarVerborgenCategorieen.size === 0;
  allesVink.addEventListener('change', () => {
    vaarVerborgenCategorieen = allesVink.checked ? new Set() : new Set(VAAR_TYPE_FILTER_CATEGORIEEN);
    bewaarVaarTypeFilter();
    VAAR_TYPE_FILTER_PANEEL_EL.querySelectorAll('input[data-categorie]').forEach((el) => {
      el.checked = !vaarVerborgenCategorieen.has(el.dataset.categorie);
      el.indeterminate = false;
    });
    VAAR_TYPE_FILTER_PANEEL_EL.querySelectorAll('input[data-subtype]').forEach((el) => { el.checked = allesVink.checked; });
    ververVaarradar();
  });
  allesRij.appendChild(allesVink);
  allesRij.appendChild(document.createTextNode('Alle scheepstypes'));
  VAAR_TYPE_FILTER_PANEEL_EL.appendChild(allesRij);

  // 2026-09-03: per categorie optioneel een uitklapbare set subrijen (zie
  // VAAR_SUBTYPES_PER_CATEGORIE hierboven). Het categorie-vinkje staat op
  // "indeterminate" zodra een deel van de subrijen uit staat, net als bij
  // MarineTraffic. De uitklapstand wordt niet bewaard (standaard dicht).
  const werkAllesVinkBij = () => { allesVink.checked = vaarVerborgenCategorieen.size === 0; };
  VAAR_TYPE_FILTER_CATEGORIEEN.forEach((categorie) => {
    const subs = VAAR_SUBTYPES_PER_CATEGORIE[categorie] ?? [];
    const rij = document.createElement('label');
    rij.className = 'vaar-type-filter-item';
    const vink = document.createElement('input');
    vink.type = 'checkbox';
    vink.dataset.categorie = categorie;
    const subVinken = [];
    const werkCategorieVinkBij = () => {
      const heel = vaarVerborgenCategorieen.has(categorie);
      const deels = subs.some((sub) => vaarVerborgenCategorieen.has(`${categorie}/${sub}`));
      vink.checked = !heel;
      vink.indeterminate = !heel && deels;
      subVinken.forEach((sv) => { sv.checked = !heel && !vaarVerborgenCategorieen.has(`${categorie}/${sv.dataset.subtype}`); });
    };
    vink.addEventListener('change', () => {
      // aanvinken zet de hele categorie incl. alle subrijen weer aan;
      // uitvinken verbergt de hele categorie in één sleutel.
      vaarVerborgenCategorieen.delete(categorie);
      subs.forEach((sub) => vaarVerborgenCategorieen.delete(`${categorie}/${sub}`));
      if (!vink.checked) vaarVerborgenCategorieen.add(categorie);
      bewaarVaarTypeFilter();
      werkCategorieVinkBij();
      werkAllesVinkBij();
      ververVaarradar();
    });
    const kleurbol = document.createElement('span');
    kleurbol.className = 'vaar-type-filter-kleur';
    kleurbol.style.background = kleurVoorScheepscategorie(categorie === 'onbekend' ? null : categorie);
    rij.appendChild(vink);
    rij.appendChild(kleurbol);
    const labelTekst = document.createElement('span');
    labelTekst.className = 'vaar-type-filter-tekst';
    labelTekst.textContent = VAAR_TYPE_FILTER_LABEL[categorie] ?? categorie;
    rij.appendChild(labelTekst);
    VAAR_TYPE_FILTER_PANEEL_EL.appendChild(rij);
    if (!subs.length) { werkCategorieVinkBij(); return; }

    const uitklap = document.createElement('button');
    uitklap.type = 'button';
    uitklap.className = 'vaar-type-filter-uitklap';
    uitklap.textContent = '▾';
    uitklap.title = 'Subtypes tonen/verbergen';
    rij.appendChild(uitklap);
    const subLijst = document.createElement('div');
    subLijst.className = 'vaar-type-filter-sublijst';
    subLijst.hidden = true;
    uitklap.addEventListener('click', (ev) => {
      ev.preventDefault(); // anders schakelt de omliggende <label> ook het vinkje
      subLijst.hidden = !subLijst.hidden;
      uitklap.classList.toggle('open', !subLijst.hidden);
    });
    subs.forEach((sub) => {
      const subRij = document.createElement('label');
      subRij.className = 'vaar-type-filter-item vaar-type-filter-subitem';
      const subVink = document.createElement('input');
      subVink.type = 'checkbox';
      subVink.dataset.subtype = sub;
      subVink.addEventListener('change', () => {
        const sleutel = `${categorie}/${sub}`;
        if (subVink.checked) {
          // een subrij aanzetten terwijl de hele categorie uit stond: de
          // categorie-sleutel omzetten naar "alle ANDERE subrijen uit".
          if (vaarVerborgenCategorieen.has(categorie)) {
            vaarVerborgenCategorieen.delete(categorie);
            subs.forEach((andere) => { if (andere !== sub) vaarVerborgenCategorieen.add(`${categorie}/${andere}`); });
          }
          vaarVerborgenCategorieen.delete(sleutel);
        } else {
          vaarVerborgenCategorieen.add(sleutel);
          // alle subrijen uit == hele categorie uit: samenvouwen tot één sleutel
          if (subs.every((andere) => vaarVerborgenCategorieen.has(`${categorie}/${andere}`))) {
            subs.forEach((andere) => vaarVerborgenCategorieen.delete(`${categorie}/${andere}`));
            vaarVerborgenCategorieen.add(categorie);
          }
        }
        bewaarVaarTypeFilter();
        werkCategorieVinkBij();
        werkAllesVinkBij();
        ververVaarradar();
      });
      subVinken.push(subVink);
      subRij.appendChild(subVink);
      subRij.appendChild(document.createTextNode(SCHEEPSSUBTYPE_LABEL[sub] ?? sub));
      subLijst.appendChild(subRij);
    });
    VAAR_TYPE_FILTER_PANEEL_EL.appendChild(subLijst);
    werkCategorieVinkBij();
  });
}

// toggleVaarTypeFilterPaneel() is vervallen -- het scheepstype-filter zit nu
// altijd inline in #vaarMenu, zie toggleVaarradar() hieronder.

// Optie 3: kleur op snelheid -- een "warmte"-schaal (grijsblauw stilliggend
// tot rood snel) i.p.v. willekeurige kleuren, zodat de kleur zelf meteen wat
// betekent i.p.v. alleen onderscheid te maken. Grenzen met de hand gekozen
// (geen officiele norm zoals bij scheepstype-codes): 0-0,5kn nog als
// "stilliggend" behandeld i.p.v. precies 0, voor kleine GPS/decodeerruis
// rond stilstand.
function kleurVoorSnelheid(snelheidKn) {
  if (typeof snelheidKn !== 'number') return KLEUR_SCHEEP_ONBEKEND;
  if (snelheidKn <= 0.5) return '#6c7a94'; // stilliggend/geankerd
  if (snelheidKn <= 5) return '#4cd9f0'; // langzaam
  if (snelheidKn <= 12) return '#3bff7c'; // normale vaart
  if (snelheidKn <= 20) return '#ffce4c'; // vlot
  return '#ff6b6b'; // snel
}

// 2026-09-02, op verzoek van Lex (AIS verder uitbouwen -- status, bestemming/
// ETA tonen, stilliggende schepen als stip i.p.v. driehoekje, net als
// MarineTraffic/VesselFinder) -- de officiële AIS-navigatiestatus (ITU-R
// M.1371, 0-15) komt nu mee vanuit de backend (zie "status" in
// vaarradarLokaal.js/vaarradarAishub.js). Codes 9/10/13 zijn gereserveerd/
// regionaal en hebben bewust geen label (zouden toch niets zeggen).
const NAVSTATUS_LABEL = {
  0: 'Varend, motor aan',
  1: 'Voor anker',
  2: 'Niet onder besturing',
  3: 'Beperkt manoeuvreerbaar',
  4: 'Beperkt door diepgang',
  5: 'Afgemeerd',
  6: 'Aan de grond',
  7: 'Aan het vissen',
  8: 'Varend onder zeil',
  11: 'Duwend/slepend (regionaal)',
  12: 'Duwend/gekoppeld (regionaal)',
  14: 'Noodsignaal actief',
};
// Voor-anker/afgemeerd/aan-de-grond -> stip i.p.v. driehoekje (zie
// bouwVaarIcon() hieronder). Betrouwbaarder dan zelf een snelheidsdrempel
// verzinnen (status is wat het schip zelf uitzendt), met een snelheids-
// fallback voor het geval status ontbreekt (bijv. een oudere AISHub-respons
// zonder NAVSTAT-veld) -- Lex meldde tot nu toe geen last van GPS-jitter
// rond stilstand, dus bewust geen extra marge ingebouwd totdat dat wél
// nodig blijkt.
const NAVSTATUS_STILLIGGEND = new Set([1, 5, 6]);
// 2026-09-03 (Lex: "hoe kan dit afgemeerd zijn met 7 knts"): de navigatie-
// status is een handmatige instelling op de transponder die vaak niet wordt
// omgezet (sleepboten!). Bij een tegenstrijdige status is de gemeten snelheid
// leidend: boven STATUS_TEGENSTRIJDIG_KN wordt "afgemeerd/voor anker" niet
// geloofd -- het schip wordt als varend getekend (driehoekje) en de popup
// toont de status met de snelheid erbij (zie statusTekstVoorSchip()).
const STATUS_TEGENSTRIJDIG_KN = 1;
function statusTegenstrijdig(s) {
  return typeof s.status === 'number' && NAVSTATUS_STILLIGGEND.has(s.status)
    && typeof s.snelheidKn === 'number' && s.snelheidKn > STATUS_TEGENSTRIJDIG_KN;
}
function schipLigtStil(s) {
  if (statusTegenstrijdig(s)) return false;
  if (typeof s.status === 'number') return NAVSTATUS_STILLIGGEND.has(s.status);
  return typeof s.snelheidKn === 'number' && s.snelheidKn <= 0.5;
}
function statusTekstVoorSchip(s) {
  const tekst = typeof s.status === 'number' ? NAVSTATUS_LABEL[s.status] ?? null : null;
  if (tekst && statusTegenstrijdig(s)) return `${tekst} (vaart ${Math.round(s.snelheidKn * 10) / 10} kn)`;
  return tekst;
}

// ETA komt genormaliseerd binnen als { maand, dag, uur, minuut } (zie
// normaliseerEta() in vaarradarLokaal.js) -- uur/minuut kunnen los ontbreken
// (AIS-sentinel voor "tijd onbekend, datum wel") terwijl maand/dag er altijd
// zijn zodra deze functie een niet-null object teruggeeft.
function etaTekst(eta) {
  const datum = `${String(eta.dag).padStart(2, '0')}-${String(eta.maand).padStart(2, '0')}`;
  if (eta.uur == null || eta.minuut == null) return datum;
  return `${datum} ${String(eta.uur).padStart(2, '0')}:${String(eta.minuut).padStart(2, '0')}`;
}

// 2026-09-02, op verzoek van Lex (mouse-over i.p.v. altijd meteen klikken --
// zie sessie-overleg, MarineTraffic/VesselFinder tonen bij hover een lichte
// label en pas bij een klik het volledige kaartje) -- Leaflet's ingebouwde
// (niet-permanente) tooltip regelt de show/hide-op-hover zelf, dus hier is
// geen eigen mouseover/mouseout-wiring nodig. Bewust kort gehouden (naam +
// snelheid) -- bestemming/ETA/status/foto blijven voorbehouden aan de volle
// klik-popup (zie scheepsPopupEl() hieronder), anders is er geen verschil
// meer tussen hoveren en klikken.
// 2026-09-02-herziening, op verzoek van Lex ("dit kaartje namaken" -- zie
// het gedeelde MarineTraffic-hoverkaartje: naam [land], snelheid/koers,
// bestemming, "positie ontvangen X geleden"). Land komt alleen van
// vaarradarLokaal.js (AIS-catcher decodeert dat zelf uit de MMSI, zie
// 'land' daar) -- AISHub's respons heeft dat veld niet, dan blijft het
// "[..]"-label gewoon weg i.p.v. "[null]" te tonen. tijdMs komt via
// vaarradarLokaal.js/vaarradarAishub.js/server.js ongewijzigd door naar de
// frontend, dus geledenTekst() (elders in app.js, al gebruikt voor
// "Bijgewerkt: X geleden") kan hier gewoon hergebruikt worden.
function vaarTooltipHtml(s) {
  const naam = s.naam || `MMSI ${s.mmsi}`;
  const landLabel = s.land ? ` <span class="vaar-tooltip-land">[${escapeHtml(s.land)}]</span>` : '';
  const snelheid = s.snelheidKn != null ? Math.round(s.snelheidKn) : 0;
  const koers = typeof s.koersGraden === 'number' ? Math.round(s.koersGraden) : 0;
  const bestemmingRegel = s.bestemming
    ? `<div>Bestemming: ${escapeHtml(s.bestemming)}</div>`
    : '';
  const positieRegel = s.tijdMs ? `<div>Positie ontvangen: ${geledenTekst(s.tijdMs)}</div>` : '';
  return (
    `<div><strong>${escapeHtml(naam)}</strong>${landLabel}</div>` +
    `<div>${snelheid} kn / ${koers}°</div>` +
    bestemmingRegel +
    positieRegel
  );
}

// 2026-09-02-CORRECTIE (zelfde sessie): eerste aanname was dat de vele rode
// stipjes in het gedeelde MarineTraffic-screenshot stilliggende/geankerde
// schepen waren -- Lex corrigeerde dit direct ("herstel dat zijn tankers"):
// het was gewoon de tanker-kleur (categorie-gekleurde modus), geen aparte
// stilliggend-regel. De stilliggend/varend-vorm (stip vs. driehoek, zie
// bouwVaarIcon()) blijft wel gewoon bestaan -- alleen GEEN aparte vaste
// kleuroverride hier.
function kleurVoorSchip(s) {
  if (vaarKleurModus === 'type') return kleurVoorScheepscategorie(s.scheepscategorie);
  if (vaarKleurModus === 'snelheid') return kleurVoorSnelheid(s.snelheidKn);
  return kleurVoorMmsi(s.mmsi);
}

function wisselVaarKleurModus() {
  const huidigeIndex = VAARKLEUR_MODI.indexOf(vaarKleurModus);
  vaarKleurModus = VAARKLEUR_MODI[(huidigeIndex + 1) % VAARKLEUR_MODI.length];
  try {
    localStorage.setItem(VAARKLEUR_KEY, vaarKleurModus);
  } catch (_) {
    /* privé-modus */
  }
  zetVaarKleurKnopLabel();
  ververVaarradar(); // meteen herkleuren, niet wachten op de volgende 3s-poll
}

function zetVaarKleurKnopLabel() {
  const label = VAAR_KLEUR_KNOP_EL?.querySelector('.knop-tekst');
  if (label) label.textContent = ` ${VAARKLEUR_MODUS_LABEL[vaarKleurModus]}`;
}

// 2026-09-01, op verzoek van Lex (AISHub als aanvulling naast eigen
// ontvangst, zie sources/vaarradarAishub.js) -- twee dingen om lokaal
// ontvangen schepen te onderscheiden van AISHub-aanvulling: (a) een
// aan/uit-knop (#vaarAishubToggle) om AISHub-schepen helemaal te verbergen,
// (b) ongeacht die knop krijgen AISHub-only schepen altijd een lagere
// dekkingsgraad (opacity) dan lokaal ontvangen schepen -- zie
// AISHUB_OPACITEIT in bouwVaarIcon() hieronder. Bewust GEEN aparte kleur:
// kleur is al druk bezet met betekenis (kleurVoorSchip() hierboven, drie
// modi). Standaard AAN (zelfde localStorage-patroon als VAARKLEUR_KEY).
const VAAR_AISHUB_KEY = 'weerVaarAishubZichtbaar';
let aishubZichtbaar = true;
try {
  const opgeslagen = localStorage.getItem(VAAR_AISHUB_KEY);
  if (opgeslagen === '0') aishubZichtbaar = false;
} catch (_) {
  /* prive-modus, gewoon bij de standaard (aan) blijven */
}
// 2026-09-02-bug-fix, op melding van Lex ("de knop van AISHub is ook al blauw
// als er nog een keer op geklikt moet worden"): index.html zet de knop
// standaard op 'actief', maar de onthouden stand (localStorage) werd bij het
// laden nooit op de knop teruggezet -- pas na een klik liep het weer gelijk.
VAAR_AISHUB_KNOP_EL?.classList.toggle('actief', aishubZichtbaar);
const AISHUB_OPACITEIT = 0.55; // vol dekkend voor lokaal, duidelijk getemperd voor AISHub-only

function wisselVaarStraal() {
  const huidigeIndex = VAARRADAR_STRAAL_STAPPEN.indexOf(vaarradarStraalKm);
  vaarradarStraalKm = VAARRADAR_STRAAL_STAPPEN[(huidigeIndex + 1) % VAARRADAR_STRAAL_STAPPEN.length];
  try {
    localStorage.setItem(VAARRADAR_STRAAL_KEY, String(vaarradarStraalKm));
  } catch (_) {
    /* prive-modus */
  }
  zetVaarStraalKnopLabel();
  ververVaarradar(); // meteen opnieuw ophalen met de nieuwe straal, niet wachten op de volgende 3s-poll
}

function zetVaarStraalKnopLabel() {
  const label = VAAR_STRAAL_KNOP_EL?.querySelector('.knop-tekst');
  if (label) label.textContent = ` ${vaarradarStraalKm}km`;
}

function wisselVaarAishubZichtbaar() {
  aishubZichtbaar = !aishubZichtbaar;
  VAAR_AISHUB_KNOP_EL?.classList.toggle('actief', aishubZichtbaar);
  try {
    localStorage.setItem(VAAR_AISHUB_KEY, aishubZichtbaar ? '1' : '0');
  } catch (_) {
    /* prive-modus */
  }
  ververVaarradar(); // meteen bijwerken, niet wachten op de volgende 3s-poll
}

// 2026-09-02, op verzoek van Lex ("Is het mogelijk om de boeien te verbergen?
// Dat zit ws vast aan een zeelaag. Aan uit knopje misschien. Het is erg druk
// nu") -- de OpenSeaMap-seamark-laag (zeeLaag: boeien, lichten, vaargeulen)
// in Vaart-modus aan/uit. Bewust ALLEEN voor Vaart-modus: de losstaande
// Zee/NAVTEX-stand heeft geen knop hiervoor, dus daar blijft de laag altijd
// gewoon aan (anders zou een hier verborgen laag daar onzichtbaar "vast"
// blijven staan). Zelfde localStorage-patroon als VAAR_AISHUB_KEY.
const VAAR_BOEIEN_KEY = 'weerVaarBoeienZichtbaar';
let vaarBoeienZichtbaar = true;
try {
  if (localStorage.getItem(VAAR_BOEIEN_KEY) === '0') vaarBoeienZichtbaar = false;
} catch (_) {
  /* prive-modus, gewoon bij de standaard (aan) blijven */
}
VAAR_BOEIEN_KNOP_EL?.classList.toggle('actief', vaarBoeienZichtbaar);

// Past de zichtbaarheid van zeeLaag toe op de huidige stand (Vaart-modus
// aan + knop uit = laag weg; anders laag aan zolang Zee-modus actief is).
function pasVaarBoeienToe() {
  if (!zeeLaag || !zeeModusActief) return;
  const moetTonen = !(vaarradarActief && !vaarBoeienZichtbaar);
  if (moetTonen && !kaart.hasLayer(zeeLaag)) kaart.addLayer(zeeLaag);
  if (!moetTonen && kaart.hasLayer(zeeLaag)) kaart.removeLayer(zeeLaag);
}

function wisselVaarBoeienZichtbaar() {
  vaarBoeienZichtbaar = !vaarBoeienZichtbaar;
  VAAR_BOEIEN_KNOP_EL?.classList.toggle('actief', vaarBoeienZichtbaar);
  try {
    localStorage.setItem(VAAR_BOEIEN_KEY, vaarBoeienZichtbaar ? '1' : '0');
  } catch (_) {
    /* prive-modus */
  }
  pasVaarBoeienToe();
}

// 2026-09-02, op verzoek van Lex ("alles wat stil ligt is een stip") --
// stilliggende schepen (zie schipLigtStil() hierboven) krijgen nu een simpel
// rond stipje i.p.v. de geroteerde scheepsromp, zelfde patroon als
// MarineTraffic/VesselFinder: vorm zegt "vaart/ligt stil", kleur blijft
// zeggen wat de actieve kleurmodus zegt (zie kleurVoorSchip()).
// 2026-09-03, op verzoek van Lex ("de pijltjes die zij gebruiken variëren in
// formaat, dat zou ik ook willen"): icoonschaal naar scheepslengte uit de
// AIS-afmetingen (boeg+hek). Zonder afmetingen (klasse B, jachten) = klein,
// wat in de praktijk ook klopt. Vier stappen, geen glijdende schaal -- dan
// blijft vaarIconSleutel() stabiel en wordt het icoon niet bij elke poll
// herbouwd (zie de flicker-fix bij ververVaarradar()).
function vaarIconSchaal(afmetingen) {
  const lengte = afmetingen ? afmetingen.boeg + afmetingen.hek : 0;
  if (lengte >= 200) return 1.7; // zeeschepen/containerreuzen
  if (lengte >= 100) return 1.35; // coasters, grote binnenvaart
  if (lengte >= 40) return 1; // gewone binnenvaart, sleepboten
  return 0.75; // klein/onbekend
}

function bouwVaarIcon(koersGraden, kleur, bron, stil, schaal = 1) {
  const dekking = bron === 'aishub' ? AISHUB_OPACITEIT : 1;
  if (stil) {
    // 2026-09-03, Lex: stipjes (stilliggend) NIET meeschalen -- vaste 12px
    // zoals voorheen; alleen de pijltjes volgen de scheepslengte.
    return L.divIcon({
      className: '',
      html: `<div class="vaar-stip" style="background:${kleur};opacity:${dekking}"></div>`,
      iconSize: [12, 12],
      iconAnchor: [6, 6],
    });
  }
  const px = Math.round(16 * schaal);
  const rotatie = typeof koersGraden === 'number' ? koersGraden : 0;
  // 2026-09-02-herziening, op verzoek van Lex ("je moet eerst de icons omvormen
  // naar dat pijltje dat zij ook hebben, zodat het een mooi rondje wordt") --
  // de oude langwerpige scheepsromp-SVG (18x30) paste niet netjes binnen de
  // pulserende ring (.vaar-marker-actief, zie styles.css): een compact
  // vierkant pijltje/chevron (16x16, net als MarineTraffic/VesselFinder)
  // geeft een centreerbare vorm waar een cirkelvormige ring omheen past.
  return L.divIcon({
    className: '',
    html: `<div class="vaar-pin" style="transform:rotate(${rotatie}deg);opacity:${dekking};width:${px}px;height:${px}px"><svg viewBox="0 0 16 16" width="${px}" height="${px}"><path d="M8,0 L14,15 L8,11.5 L2,15 Z" fill="${kleur}" stroke="#0a0d16" stroke-width="1.3" stroke-linejoin="round"/></svg></div>`,
    iconSize: [px, px],
    iconAnchor: [px / 2, px / 2],
  });
}

// 2026-09-02-bug-fix, op melding van Lex ("ik zie het korte label bij hover,
// maar het knippert nog wel") -- ROOT CAUSE: bouwVaarIcon() werd via
// setIcon() bij ELKE poll (3s) opnieuw aangeroepen, ook als er niets
// zichtbaars veranderde (bijv. koers een fractie anders) -- setIcon()
// vervangt Leaflet's DOM-element voor die marker VOLLEDIG, wat de hover
// (en daarmee de open tooltip) elke keer abrupt afbrak. Fix: een simpele
// sleutel (vorm/kleur/bron) bepaalt nu of het icoon ECHT opnieuw moet -- zie
// vaarIconSleutel() en de aanroep in ververVaarradar() hieronder. Puur een
// koerswijziging (het meest voorkomende geval bij een varend schip) update
// nu alleen de rotatie van het BESTAANDE DOM-element (marker._icon is een
// Leaflet-interne, maar in de praktijk stabiele referentie naar het
// icoon-element), zonder het element zelf te vervangen -- dus geen
// onderbroken hover meer.
function vaarIconSleutel(kleur, bron, stil, schaal = 1) {
  return `${stil ? 'stip' : 'driehoek'}|${kleur}|${bron}|${schaal}`;
}

// 2026-09-02, op verzoek van Lex ("dat rondje om het item als er een
// mouseover is... namaken" -- zie het gedeelde MarineTraffic-screenshot met
// een pulserend rondje om het geselecteerde/gehoverde schip). Ring-kleur
// volgt de kleur van het bootje zelf (kleurVoorSchip()) via een CSS-custom-
// property op marker._icon -- zie .vaar-marker-actief in styles.css.
// "Actief" = aan het hoveren OF de popup staat open (zelfde ring voor beide,
// net als het screenshot: dat rondje bleef ook staan na doorklikken). Losse
// booleans i.p.v. alleen marker.isPopupOpen() checken, zodat mouseout tijdens
// een open popup de ring niet per ongeluk uitzet.
function zetVaarRingKleur(marker, kleur) {
  marker._icon?.style?.setProperty('--vaar-ring-kleur', kleur);
}
// 2026-09-02-DEFINITIEVE VERSIE (na Lex' volledige stap-voor-stap uitleg,
// zie sessie-overleg): TWEE losse ring-standen, niet één aan/uit-vlag.
// 1) Hoveren -> een STATISCH rondje verschijnt (samen met het bestaande
//    hover-tooltipje) bij elk schip -- geen animatie.
// 2) Klikken (popup/foto-kaartje open) -> het rondje gaat PAS DAN pulseren.
// Twee losse CSS-classes (.vaar-marker-ring voor het statische rondje,
// .vaar-marker-actief voor de puls-animatie erbovenop, zie styles.css) i.p.v.
// één "actief"-klasse, zodat beide standen onafhankelijk van elkaar aan/uit
// kunnen -- losse booleans (_vaarHover / isPopupOpen()) i.p.v. een simpele
// OR, zodat mouseout tijdens een open popup de puls niet per ongeluk uitzet.
function vaarRingBijwerken(marker) {
  const el = marker._icon;
  if (!el) return;
  el.classList.toggle('vaar-marker-ring', !!marker._vaarHover);
  // 2026-09-02-bug-fix, op melding van Lex ("het pulseren blijft actief als
  // ik naar een ander vessel ga en klik, alles blijft pulseren"): Leaflet
  // vuurt 'popupclose' op de marker terwijl de popup intern nog als "open"
  // geldt (het event komt uit onRemove(), vóórdat de map-koppeling weg is),
  // dus marker.isPopupOpen() gaf hier nog steeds true en de puls bleef
  // staan. Daarom een eigen vlag (_vaarPopupOpen, gezet in de popupopen/
  // popupclose-handlers in ververVaarradar) i.p.v. isPopupOpen().
  el.classList.toggle('vaar-marker-actief', !!marker._vaarPopupOpen);
}

function werkVaarIconRotatieBij(marker, koersGraden) {
  const rotatie = typeof koersGraden === 'number' ? koersGraden : 0;
  const pinEl = marker._icon?.querySelector?.('.vaar-pin');
  if (pinEl) pinEl.style.transform = `rotate(${rotatie}deg)`;
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

// 2026-09-01, op verzoek van Lex ("ik zag wel eens dat de schepen met AIS
// ook een fotootje hadden in zo'n app, hoe werkt dat?" -> "ja leuk!") --
// zoekt de foto pas op als een scheepspopup daadwerkelijk opengaat (zie de
// marker.once('popupopen', ...) in ververVaarradar), en laat de popup verder
// gewoon ongewijzigd als er geen foto gevonden is (data.url is dan null --
// zie scheepsfoto.js) i.p.v. een lege/kapotte afbeelding te tonen.
// 2026-09-02-bug-fix, op melding van Lex ("de foto knippert in een
// regelmatige interval") -- ROOT CAUSE: elke poll (3s) verandert basisHtml
// bijna altijd een klein beetje (afstandKm/snelheid schuiven mee), en de
// oude scheepsPopupHtml() plakte de <img> en de tekst samen tot ÉÉN string
// die bij zo'n wijziging via popup.setContent() in zijn GEHEEL werd
// vervangen -- dus ook de <img>, die daardoor bij elke poll opnieuw werd
// aangemaakt (en dus opnieuw laadde/knipperde), ook als de foto-url zelf
// niet veranderde. Fix: foto en tekst zijn nu APARTE DOM-elementen
// (marker.popupFotoEl/marker.popupTekstEl, zie scheepsPopupEl() hieronder)
// die allebei blijven bestaan; alleen popupTekstEl.innerHTML wordt elke
// poll bijgewerkt, popupFotoEl wordt met rust gelaten zolang de url niet
// wijzigt -- geen herladende <img> meer bij een simpele snelheids-/
// afstandswijziging.
// 2026-09-02, op verzoek van Lex ("Ik wil ook graag de kaart namaken van
// marine traffic. Begin met de nationaliteit met een vlaggetje te tonen
// boven de foto") -- landcode uit de MMSI: de eerste drie cijfers zijn de
// ITU "Maritime Identification Digits" (MID). Eigen tabel (ITU-lijst,
// compact: de voor de Noordzee/Europa relevante landen plus de grote
// vlagstaten) omdat AISHub geen landveld meegeeft en AIS-catcher's 'land'
// (zie vaarradarLokaal.js) niet altijd gevuld is. Vlaggetje als plaatje via
// flagcdn.com (emoji-vlaggen tonen op Windows/Chrome niet, alleen "NL") --
// bij een ontbrekende/onbekende code blijft alleen de tekstcode over.
const MMSI_MID_LAND = {
  201: 'AL', 202: 'AD', 203: 'AT', 204: 'PT', 205: 'BE', 206: 'BY', 207: 'BG', 208: 'VA', 209: 'CY', 210: 'CY',
  211: 'DE', 212: 'CY', 213: 'GE', 214: 'MD', 215: 'MT', 216: 'AM', 218: 'DE', 219: 'DK', 220: 'DK', 224: 'ES',
  225: 'ES', 226: 'FR', 227: 'FR', 228: 'FR', 229: 'MT', 230: 'FI', 231: 'FO', 232: 'GB', 233: 'GB', 234: 'GB',
  235: 'GB', 236: 'GI', 237: 'GR', 238: 'HR', 239: 'GR', 240: 'GR', 241: 'GR', 242: 'MA', 243: 'HU', 244: 'NL',
  245: 'NL', 246: 'NL', 247: 'IT', 248: 'MT', 249: 'MT', 250: 'IE', 251: 'IS', 252: 'LI', 253: 'LU', 254: 'MC',
  255: 'PT', 256: 'MT', 257: 'NO', 258: 'NO', 259: 'NO', 261: 'PL', 262: 'ME', 263: 'PT', 264: 'RO', 265: 'SE',
  266: 'SE', 267: 'SK', 268: 'SM', 269: 'CH', 270: 'CZ', 271: 'TR', 272: 'UA', 273: 'RU', 274: 'MK', 275: 'LV',
  276: 'EE', 277: 'LT', 278: 'SI', 279: 'RS', 301: 'AI', 303: 'US', 304: 'AG', 305: 'AG', 306: 'CW', 307: 'AW',
  308: 'BS', 309: 'BS', 310: 'BM', 311: 'BS', 312: 'BZ', 314: 'BB', 316: 'CA', 319: 'KY', 321: 'CR', 323: 'CU',
  325: 'DM', 327: 'DO', 329: 'GP', 330: 'GD', 331: 'GL', 332: 'GT', 334: 'HN', 336: 'HT', 338: 'US', 339: 'JM',
  341: 'KN', 343: 'LC', 345: 'MX', 347: 'MQ', 348: 'MS', 350: 'NI', 351: 'PA', 352: 'PA', 353: 'PA', 354: 'PA',
  355: 'PA', 356: 'PA', 357: 'PA', 358: 'PR', 359: 'SV', 361: 'PM', 362: 'TT', 364: 'TC', 366: 'US', 367: 'US',
  368: 'US', 369: 'US', 370: 'PA', 371: 'PA', 372: 'PA', 373: 'PA', 374: 'PA', 375: 'VC', 376: 'VC', 377: 'VC',
  378: 'VG', 379: 'VI', 401: 'AF', 403: 'SA', 405: 'BD', 408: 'BH', 410: 'BT', 412: 'CN', 413: 'CN', 414: 'CN',
  416: 'TW', 417: 'LK', 419: 'IN', 422: 'IR', 423: 'AZ', 425: 'IQ', 428: 'IL', 431: 'JP', 432: 'JP', 434: 'TM',
  436: 'KZ', 437: 'UZ', 438: 'JO', 440: 'KR', 441: 'KR', 443: 'PS', 445: 'KP', 447: 'KW', 450: 'LB', 451: 'KG',
  453: 'MO', 455: 'MV', 457: 'MN', 459: 'NP', 461: 'OM', 463: 'PK', 466: 'QA', 468: 'SY', 470: 'AE', 471: 'AE',
  472: 'TJ', 473: 'YE', 475: 'YE', 477: 'HK', 478: 'BA', 501: 'AQ', 503: 'AU', 506: 'MM', 508: 'BN', 510: 'FM',
  511: 'PW', 512: 'NZ', 514: 'KH', 515: 'KH', 516: 'CX', 518: 'CK', 520: 'FJ', 523: 'CC', 525: 'ID', 529: 'KI',
  531: 'LA', 533: 'MY', 536: 'MP', 538: 'MH', 540: 'NC', 542: 'NU', 544: 'NR', 546: 'PF', 548: 'PH', 553: 'PG',
  555: 'PN', 557: 'SB', 559: 'AS', 561: 'WS', 563: 'SG', 564: 'SG', 565: 'SG', 566: 'SG', 567: 'TH', 570: 'TO',
  572: 'TV', 574: 'VN', 576: 'VU', 577: 'VU', 578: 'WF', 601: 'ZA', 603: 'AO', 605: 'DZ', 607: 'TF', 608: 'IO',
  609: 'BI', 610: 'BJ', 611: 'BW', 612: 'CF', 613: 'CM', 615: 'CG', 616: 'KM', 617: 'CV', 618: 'AQ', 619: 'CI',
  620: 'KM', 621: 'DJ', 622: 'EG', 624: 'ET', 625: 'ER', 626: 'GA', 627: 'GH', 629: 'GM', 630: 'GW', 631: 'GQ',
  632: 'GN', 633: 'BF', 634: 'KE', 635: 'AQ', 636: 'LR', 637: 'LR', 638: 'SS', 642: 'LY', 644: 'LS', 645: 'MU',
  647: 'MG', 649: 'ML', 650: 'MZ', 654: 'MR', 655: 'MW', 656: 'NE', 657: 'NG', 659: 'NA', 660: 'RE', 661: 'RW',
  662: 'SD', 663: 'SN', 664: 'SC', 665: 'SH', 666: 'SO', 667: 'SL', 668: 'ST', 669: 'SZ', 670: 'TD', 671: 'TG',
  672: 'TN', 674: 'TZ', 675: 'UG', 676: 'CD', 677: 'TZ', 678: 'ZM', 679: 'ZW', 701: 'AR', 710: 'BR', 720: 'BO',
  725: 'CL', 730: 'CO', 735: 'EC', 740: 'FK', 745: 'GF', 750: 'GY', 755: 'PY', 760: 'PE', 765: 'SR', 770: 'UY',
  775: 'VE',
};

function landcodeVoorSchip(s) {
  const eigen = String(s.land ?? '').trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(eigen)) return eigen;
  const mid = Number(String(s.mmsi ?? '').slice(0, 3));
  return MMSI_MID_LAND[mid] ?? null;
}

function vlagHtml(landcode) {
  if (!landcode) return '';
  const code = landcode.toLowerCase();
  return `<span class="popup-vlag"><img src="https://flagcdn.com/w40/${code}.png" alt="" loading="lazy" onerror="this.remove()"><span class="popup-vlag-code">${landcode}</span></span>`;
}

async function haalEnToonScheepsfoto(marker, mmsi) {
  if (scheepsfotoUrls.has(mmsi)) return; // al opgezocht (met of zonder resultaat)
  try {
    const data = await fetch(`/api/scheepsfoto?mmsi=${mmsi}`).then((r) => r.json());
    scheepsfotoUrls.set(mmsi, data.url || null);
    if (!data.url || !marker.popupFotoEl) return;
    marker.popupFotoEl.innerHTML = `<img class="popup-scheepsfoto" src="${escapeHtml(data.url)}" alt="" loading="lazy">`;
    marker.popupFotoUrl = data.url;
    if (marker.isPopupOpen() && schipSheetMarker !== marker) marker.getPopup()?.update(); // sheet: element leeft al live, update() zou 'm terugtrekken
  } catch (err) {
    console.error('scheepsfoto ophalen mislukt', err);
  }
}

// 2026-09-03, op verzoek van Lex: het MarineTraffic-kaartje nabouwen met wat
// we al hebben (schermafbeelding HAFNIA CATERINA als voorbeeld). Onder de
// foto, van boven naar beneden:
//   1. knoppenrij: "Scheepsdetails" -- native <details>/<summary>, zodat 'ie
//      ook werkt in de schermvullende kopie (toonVolledigSchermPopup() kopieert
//      alleen innerHTML, een click-listener zou daar verloren gaan) en de
//      popup-klik-naar-volledig-scherm 'm al met rust laat (die slaat
//      'summary' over). Toont MMSI/IMO/roepnaam -- meer hebben we (nog) niet;
//      Lex: "kan nog leeg blijven".
//   2. reisblok: vertrekhaven links (hebben we NIET -- AIS zendt alleen de
//      bestemming uit, MarineTraffic haalt ATD uit z'n eigen havenhistorie),
//      bestemming rechts met ETA, daaronder een lijn met pijl.
//   3. drie cellen: navigatiestatus / snelheid+koers / diepgang.
//   4. voettekst: "Ontvangen: X geleden (AIS-bron: ...)" + afstand.
// Alles wat de bron niet meegeeft wordt als "—" getoond i.p.v. weggelaten,
// zodat het kaartje altijd dezelfde vorm houdt.
//
// Bestemming: AIS-schepen zenden vaak een UN/LOCODE uit ("NLRTM", "NL RTM",
// "NL IJM") -- die splitsen we in landvlag + code zoals MarineTraffic doet;
// vrije tekst ("ROTTERDAM 7E PETROH") blijft gewoon staan.
// 2026-09-03-bug (Lex' screenshot RWS 81): bestemming "EEFDE" (sluis Eefde)
// werd als Estland + FDE getoond. Vlag + code nu ALLEEN als de backend de
// code daadwerkelijk in de UN/LOCODE-haventabel vond (s.bestemmingHaven, zie
// reisvoortgang.js) -- anders gewoon de tekst zoals het schip 'm uitzendt.
function havenHtml(tekst, leegLabel, haven) {
  const t = String(tekst ?? '').trim().toUpperCase();
  if (!t) return `<span class="popup-haven popup-haven-leeg">${leegLabel}</span>`;
  const m = haven?.code ? String(haven.code).match(/^([A-Z]{2}) ([A-Z2-9]{3})$/) : null;
  if (m) {
    const naamHtml = haven.naam ? `<span class="popup-haven-naam">${escapeHtml(haven.naam)}</span>` : '';
    return `<span class="popup-haven">${vlagHtml(m[1])}<span class="popup-haven-code">${escapeHtml(m[2])}${naamHtml}</span></span>`;
  }
  // 2026-09-03: vrije tekst waar de backend toch een haven bij vond (via de
  // naam-index in havenNamen.js) -- herkende havennaam klein eronder, zodat
  // je ziet waar de voortgang op gebaseerd is; gelijk aan de tekst zelf =
  // niet herhalen.
  const herkend = haven?.naam && haven.naam.toUpperCase() !== t ? `<span class="popup-haven-naam">→ ${escapeHtml(haven.naam)}</span>` : '';
  return `<span class="popup-haven popup-haven-tekst" title="${escapeHtml(t)}">${escapeHtml(t)}${herkend}</span>`;
}

// 2026-09-03, op verzoek van Lex ("MarineTraffic gebruikt de pijl om te tonen
// hoeveel van de reis is afgelegd"): de stip schuift mee met s.reisVoortgang
// (0..1, geschat door reisvoortgang.js in de backend -- zie de eerlijke
// beperking daar: startpunt is ons eerste gezicht, niet de vertrekhaven).
// Zonder bruikbare bestemming (vrije tekst, onbekende LOCODE) geen stip en
// een gedempte lijn, zodat de lijn niets suggereert wat we niet weten.
function reislijnHtml(s) {
  const v = typeof s.reisVoortgang === 'number' ? s.reisVoortgang : null;
  if (v == null) return '<div class="popup-schip-reislijn popup-schip-reislijn-onbekend"><span class="popup-schip-reispijl"></span></div>';
  const pct = Math.round(v * 100);
  const teGaan = s.bestemmingAfstandKm != null ? `${s.bestemmingAfstandKm} km te gaan` : '';
  return `<div class="popup-schip-reislijn" title="${pct}% afgelegd sinds eerste waarneming${teGaan ? ` · ${teGaan}` : ''}"><span class="popup-schip-reisbaan"><span class="popup-schip-reisgedaan" style="width:${pct}%"></span><span class="popup-schip-reisstip" style="left:${pct}%"></span></span><span class="popup-schip-reispijl"></span></div>
    <div class="popup-schip-reisvoortgang">${pct}% afgelegd${teGaan ? ` · ${teGaan}` : ''}</div>`;
}

function scheepsKaartHtml(s, statusTekst) {
  const bronTekst = s.bron === 'aishub' ? 'AISHub' : s.bron === 'lokaal' ? 'eigen ontvanger' : 'aisstream';
  const koers = s.cogGraden ?? s.koersGraden;
  const snelheidKoers = s.snelheidKn != null || koers != null
    ? `${s.snelheidKn != null ? `${Math.round(s.snelheidKn * 10) / 10} kn` : '—'} / ${koers != null ? `${Math.round(koers)}°` : '—'}`
    : '—';
  const diepgang = s.diepgangM != null ? `${s.diepgangM.toFixed(1)} m` : '—';
  const etaHtml = s.eta ? `<b>ETA:</b> ${etaTekst(s.eta)}` : '<b>ETA:</b> —';
  const detailRegels = [
    ['MMSI', s.mmsi],
    ['IMO', s.imo],
    ['Roepnaam', s.callsign],
  ]
    .map(([label, waarde]) => `<div class="popup-schip-detailrij"><span>${label}</span><span>${waarde != null && waarde !== '' ? escapeHtml(String(waarde)) : '—'}</span></div>`)
    .join('');
  return `
    <div class="popup-schip-knoppen">
      <details class="popup-schip-details">
        <summary class="popup-schip-knop popup-schip-knop-primair">Vessel</summary>
        <div class="popup-schip-detailblok">${detailRegels}</div>
      </details>
    </div>
    <div class="popup-schip-reis">
      <div class="popup-schip-havens">
        ${havenHtml(null, 'Vertrek —')}
        ${havenHtml(s.bestemming, 'Bestemming —', s.bestemmingHaven)}
      </div>
      <div class="popup-schip-reistijden">
        <span><b>Vertrek:</b> —</span>
        <span>${etaHtml}</span>
      </div>
      ${reislijnHtml(s)}
    </div>
    <div class="popup-schip-cellen">
      <div class="popup-schip-cel"><span class="popup-schip-cellabel">Navigatie-status</span><span class="popup-schip-celwaarde">${escapeHtml(statusTekst ?? '—')}</span></div>
      <div class="popup-schip-cel"><span class="popup-schip-cellabel">Snelheid / koers</span><span class="popup-schip-celwaarde">${escapeHtml(snelheidKoers)}</span></div>
      <div class="popup-schip-cel"><span class="popup-schip-cellabel">Diepgang</span><span class="popup-schip-celwaarde">${escapeHtml(diepgang)}</span></div>
    </div>
    <div class="popup-schip-voet">Ontvangen: <b>${escapeHtml(geledenTekst(s.tijdMs))}</b> (AIS-bron: ${escapeHtml(bronTekst)}) · ${s.afstandKm} km van jou</div>`;
}

// Bouwt (eenmalig per marker) een wrapper-element met twee losse kinderen --
// popupFotoEl en popupTekstEl -- en bindt/hergebruikt die vervolgens als
// Leaflet-popupinhoud. Alleen popupTekstEl.innerHTML wordt hier bijgewerkt;
// popupFotoEl wordt uitsluitend door haalEnToonScheepsfoto() hierboven
// gevuld, en alleen als de url daadwerkelijk verandert -- zie de
// bug-fix-toelichting hierboven voor waarom dat apart moet blijven.
// 2026-09-02: derde kind popupKopEl BOVEN de foto (vlag + naam + type, zoals
// MarineTraffic's kaartje) -- zie vlagHtml()/landcodeVoorSchip() hierboven.
function scheepsPopupEl(marker, mmsi, kopHtml, basisHtml) {
  if (!marker.popupWrapperEl) {
    marker.popupWrapperEl = document.createElement('div');
    marker.popupWrapperEl.className = 'popup-schip';
    marker.popupKopEl = document.createElement('div');
    marker.popupKopEl.className = 'popup-scheepskop';
    marker.popupFotoEl = document.createElement('div');
    marker.popupTekstEl = document.createElement('div');
    marker.popupWrapperEl.appendChild(marker.popupKopEl);
    marker.popupWrapperEl.appendChild(marker.popupFotoEl);
    marker.popupWrapperEl.appendChild(marker.popupTekstEl);
    const bestaandeUrl = scheepsfotoUrls.get(mmsi);
    if (bestaandeUrl) {
      marker.popupFotoEl.innerHTML = `<img class="popup-scheepsfoto" src="${escapeHtml(bestaandeUrl)}" alt="" loading="lazy">`;
      marker.popupFotoUrl = bestaandeUrl;
    }
  }
  if (marker.popupKopEl.innerHTML !== kopHtml) marker.popupKopEl.innerHTML = kopHtml;
  // 2026-09-03: de "Scheepsdetails"-uitklap (native <details>, zie
  // scheepsKaartHtml()) niet dichtklappen bij elke 3s-tekstverversing van
  // een varend schip -- open-stand onthouden en na de herbouw terugzetten.
  const detailsStondOpen = !!marker.popupTekstEl.querySelector('details.popup-schip-details[open]');
  marker.popupTekstEl.innerHTML = basisHtml;
  if (detailsStondOpen) marker.popupTekstEl.querySelector('details.popup-schip-details')?.setAttribute('open', '');
  return marker.popupWrapperEl;
}

// 2026-09-03, op verzoek van Lex ("MarineTraffic toont bij inzoomen een
// [scheeps]icoon op schaal, kunnen wij dat ook?"): vanaf VAAR_ZOOM_SCHEEPSVORM
// tekenen we per schip een polygoon op WARE GROOTTE -- de AIS-afmetingen zijn
// vier afstanden vanaf de GPS-antenne (boeg/hek/bakboord/stuurboord, zie
// afmetingenVan() in vaarradarLokaal.js), gedraaid naar de ware koers
// (headingGraden; zonder heading geen vorm, COG zegt niets over waar een
// stilliggend schip heen wijst). Vorm: rechthoek met een spitse boeg
// (afknotting = min(15% lengte, breedte)). De vormen liggen in een eigen
// layerGroup ONDER de markers; het stipje/driehoekje blijft voor klik/hover.
// Meters -> graden via 111320 m per breedtegraad en cos(lat) voor lengte --
// ruim goed genoeg op 20-400 m scheepslengte.
const VAAR_ZOOM_SCHEEPSVORM = 13; // 2026-09-03, Lex: "kan dat wat eerder afgaan?" -- was 15
let vaarVormLaag = null;
const vaarVormen = new Map(); // mmsi -> L.polygon

function scheepsvormPunten(lat, lon, headingGraden, a) {
  const lengte = a.boeg + a.hek;
  const breedte = a.bakboord + a.stuurboord;
  const punt = Math.min(lengte * 0.15, breedte);
  // schipsframe: x = stuurboord (+), y = vooruit (+), oorsprong = antenne
  const lokaal = [
    [-a.bakboord, -a.hek],
    [a.stuurboord, -a.hek],
    [a.stuurboord, a.boeg - punt],
    [(a.stuurboord - a.bakboord) / 2, a.boeg],
    [-a.bakboord, a.boeg - punt],
  ];
  const rad = (headingGraden * Math.PI) / 180;
  const sin = Math.sin(rad), cos = Math.cos(rad);
  const mPerGraadLat = 111320;
  const mPerGraadLon = 111320 * Math.cos((lat * Math.PI) / 180);
  return lokaal.map(([x, y]) => {
    const oost = x * cos + y * sin; // heading 0 = noord: vooruit (y) wijst naar noorden
    const noord = -x * sin + y * cos;
    return [lat + noord / mPerGraadLat, lon + oost / mPerGraadLon];
  });
}

function tekenScheepsvorm(s, kleur, marker) {
  if (!vaarVormLaag) return;
  const zichtbaar = kaart.getZoom() >= VAAR_ZOOM_SCHEEPSVORM && s.afmetingen && typeof s.headingGraden === 'number';
  let vorm = vaarVormen.get(s.mmsi);
  if (!zichtbaar) {
    if (vorm) { vaarVormLaag.removeLayer(vorm); vaarVormen.delete(s.mmsi); }
    return;
  }
  const punten = scheepsvormPunten(s.lat, s.lon, s.headingGraden, s.afmetingen);
  const opacity = s.bron === 'aishub' ? 0.45 : 0.65;
  if (!vorm) {
    // 2026-09-03 (Lex: "ingezoomd niet meer klikbaar? ... oh, op de punt"):
    // de omtrek is zelf klikbaar/hoverbaar en geeft dat door aan de marker,
    // zodat je niet precies het stipje hoeft te raken.
    vorm = L.polygon(punten, { color: kleur, weight: 1, opacity: 0.9, fillColor: kleur, fillOpacity: opacity, bubblingMouseEvents: false, pane: 'overlayPane' });
    vorm.on('click', () => { const m = vaarMarkers.get(s.mmsi); if (m) m.openPopup(); });
    vorm.on('mouseover', () => { const m = vaarMarkers.get(s.mmsi); if (m) { m._vaarHover = true; vaarRingBijwerken(m); m.openTooltip(); } });
    vorm.on('mouseout', () => { const m = vaarMarkers.get(s.mmsi); if (m) { m._vaarHover = false; vaarRingBijwerken(m); m.closeTooltip(); } });
    vaarVormLaag.addLayer(vorm);
    vaarVormen.set(s.mmsi, vorm);
  } else {
    vorm.setLatLngs(punten);
    if (vorm.options.color !== kleur) vorm.setStyle({ color: kleur, fillColor: kleur, fillOpacity: opacity });
  }
}

function verwijderScheepsvorm(mmsi) {
  const vorm = vaarVormen.get(mmsi);
  if (vorm && vaarVormLaag) vaarVormLaag.removeLayer(vorm);
  vaarVormen.delete(mmsi);
}

// 2026-09-03, op verzoek van Lex ("op de iPhone moet dat anders: laat het
// kaartje het hele scherm innemen met een sluitknop"): op smalle schermen
// wordt het scheepskaartje niet als kleine Leaflet-popup getoond maar
// schermvullend in #schipSheet (index.html). Het echte popup-element
// (marker.popupWrapperEl) wordt daarheen VERPLAATST, niet gekopieerd: zo
// blijven de 3s-tekstverversing (scheepsPopupEl schrijft in dezelfde
// kind-elementen) en de foto-lading gewoon werken. Sluiten zet het element
// terug en sluit ook de Leaflet-popup; Leaflet hangt het element bij een
// volgende open zelf weer in z'n eigen container.
const SCHIP_SHEET_EL = document.getElementById('schipSheet');
const SCHIP_SHEET_INHOUD_EL = document.getElementById('schipSheetInhoud');
const SCHIP_SHEET_SLUITEN_EL = document.getElementById('schipSheetSluiten');
let schipSheetMarker = null;

function isSmalScherm() {
  return window.matchMedia('(max-width: 640px)').matches;
}

function toonSchipSheet(marker) {
  if (!SCHIP_SHEET_EL || !marker.popupWrapperEl) return;
  if (schipSheetMarker && schipSheetMarker !== marker) sluitSchipSheet(true);
  schipSheetMarker = marker;
  SCHIP_SHEET_INHOUD_EL.appendChild(marker.popupWrapperEl);
  SCHIP_SHEET_INHOUD_EL.scrollTop = 0;
  SCHIP_SHEET_EL.classList.remove('verborgen');
}

function sluitSchipSheet(ookPopupSluiten) {
  const marker = schipSheetMarker;
  schipSheetMarker = null;
  SCHIP_SHEET_EL?.classList.add('verborgen');
  if (marker?.popupWrapperEl?.parentNode === SCHIP_SHEET_INHOUD_EL) SCHIP_SHEET_INHOUD_EL.removeChild(marker.popupWrapperEl);
  if (ookPopupSluiten && marker?.isPopupOpen()) marker.closePopup();
}

SCHIP_SHEET_SLUITEN_EL?.addEventListener('click', () => sluitSchipSheet(true));

async function ververVaarradar() {
  if (!vaarradarActief || !kaart) return;
  if (kaart.getZoom() < VAAR_MIN_ZOOM_VOOR_SCHEPEN) {
    // Nog te ver uitgezoomd -- laag leeghouden i.p.v. duizenden onbruikbare
    // stipjes op te bouwen, en de dure aanvraag+JSON-parse overslaan.
    if (vaarLaag) vaarLaag.clearLayers();
    if (vaarVormLaag) vaarVormLaag.clearLayers();
    vaarMarkers.clear();
    vaarVormen.clear();
    return;
  }
  try {
    const { lat, lon } = await huidigePositie();
    if (!vaarradarActief) return;
    const data = await fetch(`/api/vaarradar?lat=${lat}&lon=${lon}&straal=${vaarradarStraalKm}`).then((r) => r.json());
    if (!vaarradarActief) return;
    laatsteVaarSchepen = data.schepen ?? []; // 2026-09-03: voor vaarZoekUitvoeren()
    if (vaarZoekVeldEl && vaarZoekVeldEl.value.trim()) vaarZoekUitvoeren(); // treffers verversen (afstand/positie)
    // 2026-09-02: was L.markerClusterGroup (voor grote zoekstralen tot 250km met
    // duizenden bootjes, zie wisselVaarStraal() hierboven) -- nu terug naar een kale
    // L.layerGroup, zie de toelichting hierboven bij het weggehaalde clustervrije-
    // zone-blok. Geen refreshClusters() meer nodig: een kale layerGroup toont een
    // in-place bijgewerkte marker (setLatLng/setIcon) gewoon meteen goed.
    if (!vaarLaag) {
      vaarVormLaag = L.layerGroup().addTo(kaart); // eerst, zodat de vormen onder de markers liggen
      vaarLaag = L.layerGroup().addTo(kaart);
    }
    const gezien = new Set();
    // AISHub-only schepen (bron: 'aishub', geen eigen ontvangst) blijven weg
    // als de knop uitstaat -- lokaal ontvangen schepen (bron: 'lokaal')
    // blijven altijd zichtbaar, ongeacht deze knop.
    const zichtbareSchepen = (data.schepen ?? [])
      .filter((s) => aishubZichtbaar || s.bron !== 'aishub')
      // 2026-09-02: scheepstype-filterpaneel, zie bouwVaarTypeFilterPaneel() hierboven.
      .filter((s) => !schipVerborgenDoorFilter(s));
    zichtbareSchepen.forEach((s) => {
      gezien.add(s.mmsi);
      const kleur = kleurVoorSchip(s);
      tekenScheepsvorm(s, kleur); // 2026-09-03: ware-grootte-omtrek vanaf zoom 15, zie tekenScheepsvorm()
      // navigatiehulpmiddelen (boeien/bakens) bewegen per definitie nooit --
      // altijd als stip tekenen, ongeacht status/snelheid (die velden zijn bij
      // dit soort AIS-zenders vaak leeg/betekenisloos).
      const stil = schipLigtStil(s) || s.scheepscategorie === 'navigatiehulp';
      const naam = s.naam || `schip (MMSI ${s.mmsi})`;
      const statusTekst = statusTekstVoorSchip(s); // 2026-09-03: met snelheid erbij als de status tegenspreekt
      // Scheepscategorie-label (bv. "Vrachtschip") staat er ALTIJD bij als
      // 'ie bekend is, ongeacht de actieve kleurmodus -- nuttige info op
      // zichzelf, en meteen de manier om te zien of AIS-catcher's shiptype-
      // veld hier uberhaupt gevuld binnenkomt (zie categoriseerScheepstype()
      // in vaarradarLokaal.js): blijft dit label overal weg, dan is dat het
      // antwoord op die open vraag.
      // Het bolletje voor de naam herhaalt dezelfde kleur als het bootje op de
      // kaart -- puur zodat een popup meteen te koppelen is aan "welk bootje
      // was dat ook alweer" als er meerdere tegelijk openstaan.
      // "via AISHub"-label alleen als deze positie NIET van onze eigen
      // ontvangst komt -- zo blijft in de popup zelf ook zichtbaar waarom
      // een bootje getemperd (opacity) getekend is, niet alleen op de kaart.
      const bronLabel = s.bron === 'aishub' ? '<span class="popup-aishub-label">via AISHub</span>' : '';
      // 2026-09-02, op verzoek van Lex (bestemming/ETA erbij, net als
      // MarineTraffic/VesselFinder) -- alleen getoond als de bron het meegeeft
      // (niet elk schip zendt voyage-data uit, en niet elke bron decodeert 'm).
      // 2026-09-03, op verzoek van Lex ("de andere alvast gerealiseerd zien
      // met wat we hebben"): bestemming/ETA/diepgang zitten nu in het
      // MarineTraffic-achtige kaartje van scheepsKaartHtml() hieronder.
      // 2026-09-02, op verzoek van Lex ("de kaart namaken van marine traffic
      // -- begin met de nationaliteit met een vlaggetje boven de foto"):
      // naam + vlag + scheepstype in een eigen kop BOVEN de foto (zie
      // scheepsPopupEl()), de rest van de regels eronder zoals voorheen.
      const typeLabel = scheepsTypeLabel(s); // 2026-09-03: subtype-bewust, zie scheepsTypeLabel()
      // 2026-09-03: vlag groot in de linkerbovenhoek, naam + type als twee
      // regels rechts ervan (zie .popup-schip .popup-scheepskop-* in styles.css).
      const kopHtml = `<div class="popup-scheepskop-rij">${vlagHtml(landcodeVoorSchip(s))}<div class="popup-scheepskop-tekst"><div class="popup-scheepskop-naam"><span class="popup-scheepskleur" style="background:${kleur}"></span>${escapeHtml(naam)}${bronLabel}</div><div class="popup-scheepskop-type">${escapeHtml(typeLabel)}</div></div></div>`;
      const basisHtml = scheepsKaartHtml(s, statusTekst);
      let marker = vaarMarkers.get(s.mmsi);
      if (marker) {
        // Bestaand bootje: alleen bijwerken, nooit opnieuw aanmaken -- dan
        // blijft een open popup gewoon open (en de foto erin staan).
        marker.setLatLng([s.lat, s.lon]);
        const schaal = vaarIconSchaal(s.afmetingen);
        const iconSleutel = vaarIconSleutel(kleur, s.bron, stil, schaal);
        if (marker.vaarIconSleutel !== iconSleutel) {
          marker.setIcon(bouwVaarIcon(s.koersGraden, kleur, s.bron, stil, schaal));
          marker.vaarIconSleutel = iconSleutel;
        } else if (!stil) {
          werkVaarIconRotatieBij(marker, s.koersGraden); // zelfde vorm/kleur, alleen de koers bijwerken -- geen DOM-vervanging
        }
        zetVaarRingKleur(marker, kleur);
        // Alleen bijwerken bij een echte wijziging -- zelfde soort onnodige-
        // churn-preventie als bij het icoon hierboven (setTooltipContent is
        // hier zelf onschuldiger dan setIcon, geen DOM-vervanging, maar geen
        // reden om 'm elke 3s ongewijzigd opnieuw aan te roepen).
        const tooltipHtml = vaarTooltipHtml(s);
        if (marker.vaarTooltipHtml !== tooltipHtml) {
          marker.setTooltipContent(tooltipHtml);
          marker.vaarTooltipHtml = tooltipHtml;
        }
        if (kopHtml + basisHtml !== marker.basisPopupHtml) {
          marker.basisPopupHtml = kopHtml + basisHtml;
          // Tekst-only bijwerken (zie scheepsPopupEl()/bug-fix-toelichting
          // hierboven bij haalEnToonScheepsfoto) -- geen setContent() met een
          // hele nieuwe string meer, dus de foto blijft met rust.
          scheepsPopupEl(marker, s.mmsi, kopHtml, basisHtml);
          // Leaflet's popup.update() hangt het inhoud-element terug in de
          // eigen popup-container -- overslaan zolang de telefoon-sheet 'm
          // heeft (zie toonSchipSheet()), daar is het element toch al live.
          if (marker.isPopupOpen() && schipSheetMarker !== marker) marker.getPopup()?.update();
        }
        return;
      }
      const schaal = vaarIconSchaal(s.afmetingen);
      marker = L.marker([s.lat, s.lon], { icon: bouwVaarIcon(s.koersGraden, kleur, s.bron, stil, schaal) });
      marker.vaarIconSleutel = vaarIconSleutel(kleur, s.bron, stil, schaal);
      marker.basisPopupHtml = kopHtml + basisHtml;
      // 2026-09-03, op verzoek van Lex ("maak de kaart wit"): eigen className
      // op de Leaflet-popup zelf, zodat styles.css de wrapper/tip van alleen
      // de scheepspopup licht kan maken (zie .popup-schip-wit daar).
      marker.bindPopup(scheepsPopupEl(marker, s.mmsi, kopHtml, basisHtml), { className: 'popup-schip-wit', minWidth: 340, maxWidth: 380 }); // 2026-09-03: MarineTraffic-breedte (~385px)
      marker.vaarTooltipHtml = vaarTooltipHtml(s);
      marker.bindTooltip(marker.vaarTooltipHtml, { direction: 'top', offset: [0, -8], className: 'vaar-tooltip', sticky: false });
      marker.on('mouseover', () => { marker._vaarHover = true; vaarRingBijwerken(marker); });
      marker.on('mouseout', () => { marker._vaarHover = false; vaarRingBijwerken(marker); });
      marker.on('popupopen', () => { marker._vaarPopupOpen = true; vaarRingBijwerken(marker); });
      marker.on('popupclose', () => { marker._vaarPopupOpen = false; vaarRingBijwerken(marker); });
      // 2026-09-01, op verzoek van Lex ("ik zag wel eens dat de schepen met
      // AIS ook een fotootje hadden... ja leuk!") -- foto pas opzoeken zodra
      // deze popup daadwerkelijk OPENT, nooit vooraf voor alle zichtbare
      // schepen -- zie scheepsfoto.js/server.js voor waarom (geen eigen
      // officiele API, dus zuinig zijn op het aantal opzoekingen).
      // haalEnToonScheepsfoto() slaat zelf over als de url al bekend is.
      marker.on('popupopen', () => haalEnToonScheepsfoto(marker, s.mmsi));
      // 2026-09-03: op een smal scherm (telefoon) meteen schermvullend, zie
      // toonSchipSheet() -- de Leaflet-popup blijft daaronder open (zo blijft
      // de verversing lopen en blijft het bootje staan bij een datagat).
      marker.on('popupopen', () => { if (isSmalScherm()) toonSchipSheet(marker); });
      marker.on('popupclose', () => { if (schipSheetMarker === marker) sluitSchipSheet(false); });
      vaarLaag.addLayer(marker);
      vaarMarkers.set(s.mmsi, marker);
      zetVaarRingKleur(marker, kleur);
    });
    // Bootjes die niet meer in de data zitten weghalen -- behalve als de
    // popup ervan nog openstaat (AIS-data heeft wel eens een gaatje; het is
    // vervelender dat je popup onder je vingers verdwijnt dan dat een bootje
    // een poll langer blijft staan).
    vaarMarkers.forEach((marker, mmsi) => {
      if (gezien.has(mmsi) || marker.isPopupOpen()) return;
      vaarLaag.removeLayer(marker);
      vaarMarkers.delete(mmsi);
      verwijderScheepsvorm(mmsi);
    });
    werkVaarTellingBij(); // 2026-09-03: telling in het AIS-menu
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

// 2026-09-02, op verzoek van Lex ("het menu voor de AIS kan dat weer
// inklappen? en slim te openen zijn? 3 seconden na start en geen keuze
// gemaakt menu weer dicht?") -- de handle is niet langer de aan/uit-knop:
// - AIS uit + klik  -> AIS aan én menu open (met 3s-auto-inklap-timer)
// - AIS aan + klik  -> menu in-/uitklappen, AIS blijft aan
// - AIS uit gaat via de ⏻-knop bovenin het menu (#vaarUitKnop).
// Auto-inklappen: 3 s na het openen, tenzij er in het menu iets aangeraakt
// wordt (pointerdown in #vaarMenuInhoud -> annuleerVaarMenuAutoDicht()).
const VAAR_MENU_AUTO_DICHT_MS = 3000;
let vaarMenuAutoDichtTimer = null;

function annuleerVaarMenuAutoDicht() {
  if (vaarMenuAutoDichtTimer) clearTimeout(vaarMenuAutoDichtTimer);
  vaarMenuAutoDichtTimer = null;
}

function zetVaarMenuOpen(open) {
  VAAR_MENU_INHOUD_EL?.classList.toggle('verborgen', !open);
  TOGGLE_VAARRADAR_EL.classList.toggle('open', open);
  annuleerVaarMenuAutoDicht();
  if (open) vaarMenuAutoDichtTimer = setTimeout(() => zetVaarMenuOpen(false), VAAR_MENU_AUTO_DICHT_MS);
}

function vaarMenuHandleKlik() {
  if (!vaarradarActief) {
    toggleVaarradar(); // zet ook het menu open, zie daar
    return;
  }
  zetVaarMenuOpen(VAAR_MENU_INHOUD_EL?.classList.contains('verborgen'));
}

function toggleVaarradar() {
  vaarradarActief = !vaarradarActief;
  // 2026-09-02-herziening: #vaarMenuHandle is nu ZOWEL de aan/uit-knop als de
  // uitklap-knop van het verticale AIS-menu (zie index.html/styles.css) --
  // "actief" bepaalt dus in één keer het handle-uiterlijk EN of
  // #vaarMenuInhoud (kleurmodus/AISHub/straal/scheepstype-filter, voorheen
  // vier losse knoppen + een los paneel) zichtbaar is. Geen apart
  // show/hide meer per los knopje nodig zoals voorheen.
  TOGGLE_VAARRADAR_EL.classList.toggle('actief', vaarradarActief);
  zetVaarMenuOpen(vaarradarActief); // aan = menu open (klapt na 3s vanzelf in), uit = dicht
  if (vaarradarActief) bouwVaarTypeFilterPaneel(); // eenmalig, zie de child-count-guard daarin
  // 2026-09-02, op verzoek van Lex ("Donkere kaart next" -- zie ook zijn
  // allereerste wens bij dit hele vaarradar-traject: "De donkere kaart vind
  // ik prachtig... Misschien kunnen we dat wel in zijn geheel meenemen").
  // Zee-modus zet normaal de donkere invert-filter uit (zie de
  // #map.zee-modus-actief-regel in styles.css, bedoeld voor de gewone
  // Zee/NAVTEX-stand omdat de OpenSeaMap-seamark-laag op de donkere tegels
  // niet lekker leesbaar was) -- deze extra klasse overschrijft dat weer
  // specifiek voor Vaart-modus, dus de donkere kaart blijft staan terwijl
  // AIS actief is, zonder de losstaande Zee/NAVTEX-stand te raken.
  kaart.getContainer().classList.toggle('vaar-modus-actief', vaarradarActief);
  // 2026-09-02: echte donkere tegelstijl (Stadia "Alidade Smooth Dark", zie
  // donkereKaartLaag hierboven) i.p.v. het oudere CSS-invert-filter-trucje —
  // basiskaart wisselen i.p.v. met CSS overschilderen, zodat de kaart ook
  // daadwerkelijk vlakker/rustiger oogt (minder straatdetail), niet alleen
  // donkerder. Alleen tijdens Vaart/AIS-modus; de losstaande Zee/NAVTEX-stand
  // (en de rest van de app) houdt gewoon de gebruikelijke OSM-kaart.
  if (donkereKaartLaag) {
    if (vaarradarActief) {
      if (basisKaartLaag && kaart.hasLayer(basisKaartLaag)) kaart.removeLayer(basisKaartLaag);
      if (!kaart.hasLayer(donkereKaartLaag)) kaart.addLayer(donkereKaartLaag);
      donkereKaartLaag.bringToBack();
    } else {
      if (kaart.hasLayer(donkereKaartLaag)) kaart.removeLayer(donkereKaartLaag);
      if (basisKaartLaag && !kaart.hasLayer(basisKaartLaag)) kaart.addLayer(basisKaartLaag);
      basisKaartLaag?.bringToBack();
    }
  }
  if (vaarradarActief) {
    if (vliegModusActief) toggleVliegradar(); // wederzijds uitsluitend, zie toggleVliegradar
    if (!zeeModusActief) toggleZeeModus(); // Lex: "als voor boten wordt gekozen dan uiteraard meteen de zeekaart"
    // 2026-09-02, op verzoek van Lex ("gelijk inzoomen op de maasmond zodra
    // ik kies voor AIS") -- toggleZeeModus() hierboven zoomt naar het hele
    // Noordzeegebied (fitBounds op de NAVTEX-gebieden); voor de vaarradar is
    // dat veel te ver uit (schepen verschijnen pas vanaf zoom
    // VAAR_MIN_ZOOM_VOOR_SCHEPEN). Daarom direct erna naar de Maasmond
    // (Hoek van Holland / Maasvlakte / Nieuwe Waterweg), zoom 12.
    beweegKaartProgrammatisch(() => kaart.fitBounds(VAAR_STARTBOUNDS, { animate: false }));
    // 2026-09-02, op melding van Lex ("Deze kaart is ook nog eens zeer
    // vaag" -- een haven-screenshot in Vaart-modus toonde een wazige
    // beige/grijze waas over de hele kaart): de EMODnet-dieptelaag
    // (zeeDiepteLaag, zie toggleZeeModus() hierboven) heeft maxNativeZoom
    // 12 -- bij het inzoomen op een haven (ver voorbij zoom 12) rekt
    // Leaflet die tegels dus fors op, met flinke wazigheid als gevolg. Dat
    // viel eerder niet zo op tegen de kleurrijke OSM-kaart, maar springt
    // direct in het oog bovenop de nieuwe effen donkere Stadia-tegels. De
    // donkere kaart oogt zelf al als een zeekaart, dus deze laag hier
    // specifiek uitzetten voor Vaart-modus (de losstaande Zee/NAVTEX-stand
    // op de OSM-kaart houdt 'm gewoon, daar was hij nooit het probleem).
    if (zeeDiepteLaag && kaart.hasLayer(zeeDiepteLaag)) kaart.removeLayer(zeeDiepteLaag);
    pasVaarBoeienToe(); // 2026-09-02: ⚓-knop in het vaarmenu, zie wisselVaarBoeienZichtbaar()
    if (kaartVolgType) stopKaartVolgen(false); // zie toggleVliegradar
  } else {
    if (vaarLaag) {
      kaart.removeLayer(vaarLaag);
      vaarLaag = null;
    }
    if (vaarVormLaag) {
      kaart.removeLayer(vaarVormLaag);
      vaarVormLaag = null;
    }
    vaarVormen.clear();
    vaarMarkers.clear(); // zie vaarMarkers hierboven; foto-urls mogen blijven
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

// 2026-08-26, bugfix op verzoek van Lex ("de eerste afbeelding toont een
// ongelijke intensiteit... Scheveningen heeft de juiste") -- meerdere NAVTEX-
// berichten die terugvallen op DEZELFDE stationspositie (zie positieIsStation
// in navtexLokaal.js/ukho.js -- op dit moment bijv. 6x Oostende t.o.v. 2x
// Scheveningen) kregen elk een eigen, volledig overlappende marker+popup op
// exact dezelfde coordinaat. Meerdere gestapelde .is-station blauwe drop-
// shadows precies boven op elkaar blijken elkaar te verzadigen/verdonkeren
// i.p.v. gewoon "aan te staan" -- vandaar dat Oostende (6x) merkbaar anders
// oogde dan Scheveningen (2x), puur een bijwerking van het aantal gestapelde
// lagen, geen bewuste styling. Fix: op de kaart nog maar EEN marker per
// stationspositie (de nieuwste van de groep als representant), met de
// overige berichten als compacte lijst onderaan diezelfde popup (zie
// navtexGroepPopupHtml hieronder) -- er gaat niets verloren, alleen het
// stapel-effect verdwijnt.
const NAVTEX_GROEP_TONEN = 10;  // hoeveel daarvan de popup uitschrijft, rest als "...en N meer"
function groepeerStationSignalen(lijst) {
  const groepen = new Map();
  lijst.forEach((s) => {
    // 2026-08-28-verbreed, op melding van Lex ("aan de versterkte gloed te
    // zien lijkt het alsof er een aantal over elkaar heen staan"): de
    // groepering gold alleen voor zendmast-terugval, maar het echte bestand
    // stapelt ook op BERICHTposities — zes PA-berichten over dezelfde
    // werklocatie op exact dezelfde coördinaat, en corrupte duplicaten van
    // één bericht onder meerdere codes (A82/VA11/EA82, zelfde Goodwin-
    // waarschuwing). Nu geldt de één-marker-met-lijstje-aanpak voor elke
    // NAVTEX-stapel op exact dezelfde positie; andere categorieën blijven
    // erbuiten (een aardbeving mag nooit in een navtex-groepje verdwijnen).
    if (s.categorie !== 'navtex') return;
    const sleutel = `${s.lat},${s.lon}`;
    if (!groepen.has(sleutel)) groepen.set(sleutel, []);
    groepen.get(sleutel).push(s);
  });
  const overgeslagenIds = new Set();
  groepen.forEach((leden) => {
    if (leden.length < 2) return;
    const gesorteerd = [...leden].sort((a, b) => new Date(b.tijd ?? 0) - new Date(a.tijd ?? 0));
    const [representant, ...rest] = gesorteerd;
    representant._groepMeer = rest;
    rest.forEach((s) => overgeslagenIds.add(s.id));
  });
  return lijst.filter((s) => !overgeslagenIds.has(s.id));
}

// Compacte lijst van de overige berichten binnen een groepeerStationSignalen()
// -groep (zie hierboven) -- lege string als er geen groep is, zodat dit
// veilig altijd achter popupHtml() geplakt kan worden.
// 2026-08-26-fix, op melding van Lex ("het is nu exact gelijk vaak" — 5
// regels "25 aug 11:07 — Overige navigatiewaarschuwing" onder elkaar): deze
// lijst toonde alleen tijd + generieke classificatie, dus verschillende
// echte berichten (andere code/referentie, andere inhoud) die toevallig
// zonder eigen coördinaat zaten (dus 'overig' geclassificeerd) en in
// dezelfde pollcyclus binnenkwamen (dus dezelfde tijd) waren niet van elkaar
// te onderscheiden. Berichtcode (bv. "PA11", alleen navtexLokaal.js — de
// korte, herkenbare kenmerk) of anders het referentienummer (bv. "MSI
// 130/26", beide bronnen) erbij, zodat elke regel een eigen kenmerk toont.
function navtexGroepPopupHtml(s) {
  if (!Array.isArray(s._groepMeer) || !s._groepMeer.length) return '';
  // 2026-08-30, op verzoek van Lex: niet meer de hele groep uitschrijven
  // (26 regels bij Niton), maar de 10 nieuwste + een telregel voor de rest.
  const meer = s._groepMeer.length - NAVTEX_GROEP_TONEN;
  const items = s._groepMeer
    .slice(0, NAVTEX_GROEP_TONEN)
    .map((e) => {
      const kenmerk = e.detail?.code ?? e.detail?.referentie ?? null;
      const kenmerkTekst = kenmerk ? `${escapeHtml(kenmerk)} - ` : '';
      return `<div class="popup-groep-item">${tijdstempelTekst(e.tijd) ?? ''} - ${kenmerkTekst}${escapeHtml(e.detail?.eventLabel ?? e.titel ?? '')}</div>`;
    })
    .join('') + (meer > 0 ? `<div class="popup-groep-item popup-groep-meer">…en ${meer} meer</div>` : '');
  // 2026-08-28: de groepering dekt nu ook stapels op een berichtpositie
  // (zie groepeerStationSignalen) — dan klopt "van dit station" niet meer.
  const kop = s.detail?.positieIsStation
    ? `+${s._groepMeer.length} ander(e) bericht(en) van dit station`
    : `+${s._groepMeer.length} ander(e) bericht(en) op deze positie`;
  return `<div class="popup-groep"><div class="popup-groep-kop">${kop}</div>${items}</div>`;
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
  // 2026-08-26, op verzoek van Lex: verlopen signalen (detail.verlopen,
  // zie historie.js) niet meer als los, gedimd icoon op de kaart tonen --
  // dat vervagen bleek in de praktijk onbetrouwbaar (zie sw.js-fix
  // hierboven) en maakte de kaart alleen maar drukker.
  // 2026-08-27, op verzoek van Lex: TERUGGEDRAAID -- de verlopen icoontjes
  // mogen weer op de kaart, mits echt goed als grijs te onderscheiden. De
  // eigenlijke reden dat het grijs "maar niet lukte" is gevonden: de
  // .is-verlopen-CSS-regel zette alleen opacity + een halve grayscale(0.6),
  // maar de gekleurde achtergrond/rand van de .ernst-*-klasse en de
  // saturate(1.6)-backdrop-filter bleven gewoon staan -- een oranje pin
  // bleef er dus oranjig uitzien. De regel in styles.css overschrijft nu
  // expliciet ALLES (neutraal grijze achtergrond, gestippelde grijze rand,
  // geen gloed, volledige grayscale op het emoji-icoon). Daarbovenop
  // speelde destijds ook nog de stale-styles.css-cache mee (zie de
  // sw.js-historie), en juist die levering is sinds vandaag betrouwbaar
  // (ETag + no-cache). Gebied-omtrekken van verlopen signalen blijven WEL
  // uitgesloten (zie tekenAlleGebiedOmtrekken-aanroep hieronder) -- alleen
  // het grijze icoontje komt terug, geen omtrek die actief zou kunnen lijken.
  const teTonenSignalen = vliegModusActief || kaartVolgType
    ? []
    : zeeModusActief
      ? signalen.filter((s) => s.categorie === 'navtex')
      : signalen.filter((s) => s.categorie !== 'navtex');
  groepeerStationSignalen(teTonenSignalen.filter((s) => s.lat != null && s.lon != null))
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
      // 2026-08-26, op verzoek van Lex (na een uur-lang stokoude
      // onweerbui op de kaart door een WebSocket-hapering bij Blitzortung
      // -- zie SourceState.isStale()/staleAfterMs in normalize.js/
      // config.js): dezelfde gedimde is-verlopen-look, nu ook op de
      // kaart-pin zelf zodra de BRON van dit signaal al te lang niets vers
      // heeft aangeleverd, i.p.v. alleen de subtiele klasse in de
      // Meldingen-lijst (maakMeldingItem() verderop).
      const haperendKlasse = s.bron?.haperend ? ' is-haperend' : '';
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
      // 2026-08-26-fix, op verzoek van Lex ("het radiostation wordt toch
      // blur, het rigicon als basis nemen en toch maar zoiets doen ook met
      // die gloed") -- NAVTEX_RADIOMAST_SVG hierboven is inmiddels op
      // NAVTEX_RIG_SVG-formaat herbouwd (leest prima op 22px), deze klasse
      // geeft nu een blauwe gloed i.p.v. een grotere maat (zie .navtex-pin.
      // is-station in styles.css).
      const stationKlasse = s.detail?.positieIsStation ? ' is-station' : '';
      // 2026-08-26, zie NAVTEX_BOEI_SVG hierboven ("moet iets groter en mag
      // ook een kleur met gloed") -- zelfde voorrangsvolgorde als
      // hazardIconHtml() hierboven (station > cardinaal > eventType-lookup),
      // om precies te bepalen wanneer de generieke boei ook ECHT getoond
      // wordt (en dus niet per ongeluk ook gloeit rond een ander icoon).
      const kardinaalActief = s.detail?.eventType === 'boei-nieuw' && NAVTEX_BOEI_CARDINAAL_SVG[s.detail?.boeiRichting];
      // 2026-08-26, zie NAVTEX_WAVERIDER_SVG/hazardIconHtml() hierboven --
      // zelfde soort uitzondering als kardinaalActief hierboven, anders
      // gloeit de generieke-boei-achtergrond ook nog per ongeluk rond het
      // eigen gele waverider-icoon.
      const waveriderActief = s.detail?.eventType === 'boei-nieuw' && s.detail?.boeiSoort === 'waverider';
      const generiekeBoeiKlasse = s.categorie === 'navtex'
        && !s.detail?.positieIsStation
        && !kardinaalActief
        && !waveriderActief
        && !NAVTEX_EVENT_ICOON[s.detail?.eventType]
        ? ' is-generieke-boei'
        : '';
      // 2026-08-20, op verzoek van Lex: NAVTEX is "een volledig separaat
      // gebeuren" t.o.v. de landgebonden hazard-pins — geen gedeelde ronde
      // achtergrond/ernst-kleur, een eigen (kleinere, vierkante, maritiem
      // getinte) marker i.p.v. .hazard-pin, zie .navtex-pin in styles.css.
      const icon = s.categorie === 'navtex'
        ? L.divIcon({
            className: '',
            html: `<div class="navtex-pin${verlopenKlasse}${haperendKlasse}${ukhoTestKlasse}${kabelKlasse}${surveyKlasse}${ankerKlasse}${stationKlasse}${generiekeBoeiKlasse}">${hazardIconHtml(s)}</div>`,
            iconSize: [26, 26],
            iconAnchor: [13, 13],
          })
        : L.divIcon({
            className: '',
            html: `<div class="hazard-pin ${pinKlasse}${verlopenKlasse}${haperendKlasse}">${hazardIconHtml(s)}</div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15],
          });
      // 2026-08-30, op verzoek van Lex: NAVTEX-popup breder (360 i.p.v. 300)
      // zodat een groepsregel als "29 aug 22:44 - EB60 - Overige
      // navigatiewaarschuwing" (zie navtexGroepPopupHtml) op één regel past
      // i.p.v. af te breken; de overige brede categorieën blijven op 300.
      const popupBreedte = s.categorie === 'navtex' ? 360 : POPUP_BREED_CATEGORIEEN.has(s.categorie) ? 300 : 240;
      // 2026-08-26, perf-fix (op melding van Lex: kaart-opbouw trager +
      // zwarte tegels bij pinch-zoom): popupHtml(s) draaide voorheen
      // EAGER voor elke marker, elke 20-seconden-ververscyclus (zie
      // verversen()/renderMap() hierboven), ook als niemand 'm ooit opent.
      // Sinds de riglijst-boei/platform-opsplitsing (elke platform/boei nu
      // een eigen puntsignaal i.p.v. 1 gedeeld signaal) is dat aantal
      // markers per cyclus flink gegroeid. Leaflet's bindPopup() accepteert
      // ook een functie i.p.v. een kant-en-klare string -- die wordt pas
      // aangeroepen op het moment dat de popup daadwerkelijk opent (ook via
      // marker.openPopup(), zie centreerOpMelding() hierboven), dus dit
      // werk verschuift van "elke cyclus, voor alle markers" naar "alleen
      // bij een klik, voor die ene marker".
      const marker = L.marker([s.lat, s.lon], { icon })
        .addTo(signaalLaag)
        .bindPopup(() => popupHtml(s) + navtexGroepPopupHtml(s), { maxWidth: popupBreedte });
      markersPerId.set(s.id, marker);
      if (Array.isArray(s._groepMeer)) s._groepMeer.forEach((extra) => markersPerId.set(extra.id, marker));
    });
  // 2026-08-20, op verzoek van Lex ("2 gebieden in Raleigh maar maar 1
  // outline bij beide apart") — ALLE actieve gebied-omtrekken (tornado-
  // watch/severe-outlook/severe-thunderstorm-polygonen, orkaan-cone+koers)
  // tegelijk tekenen, elke cyclus, net als de hazard-pins hierboven i.p.v.
  // alleen de laatst-aangetikte. Zelfde teTonenSignalen als de pins (dus ook
  // hier uit tijdens Zee-modus, consistent met de rest van de kaart).
  // 2026-08-27 (herzien, op melding van Lex "voorheen een gevuld kader, ook
  // bij verlopen"): verlopen signalen tekenen hun omtrek weer gewoon mee —
  // tekenGebiedOmtrek() dempt ze zelf naar grijs, dus het eerdere
  // "actief lijken"-bezwaar is daarmee ondervangen.
  tekenAlleGebiedOmtrekken(teTonenSignalen);
  // Geen eigen ververs-lus voor de flitsenstippen — die liften mee op
  // dezelfde 20-seconden-cyclus die renderMap() toch al elke keer met verse
  // data aanroept (zie verversen()). ververGeselecteerdGebied houdt alleen
  // nog de kaartpositie bij (tekenen gebeurt hierboven al voor iedereen).
  ververGeselecteerdeFlitsen(signalen);
  ververGeselecteerdGebied(signalen);
  // 2026-08-28: verse signalen kunnen een (nieuwe of vervallen) NAVTEX-
  // galewarning bevatten — vanen meteen bijwerken. Goedkoop en zelf-
  // beschermend (doet niets buiten Zee-modus).
  verversWindvanen();
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
    ? `<span class="pil roodvaag" title="Datum/herkomst van dit bericht kon niet betrouwbaar uit de tekst gehaald worden - de tijd hierboven is het moment van eerste ontvangst, niet de echte verzenddatum.">DATUM ONZEKER</span>`
    : '';
  // 2026-08-26, zie navtexNummerBadge() hierboven.
  const navtexNummerHtml = navtexNummerBadge(s) ? `<div class="navtex-nummerbadge">${navtexNummerBadge(s)}</div>` : '';
  btn.innerHTML = `
    <span class="em">${hazardIconHtml(s)}</span>
    <span class="txt">
      ${navtexNummerHtml}
      <div class="titel">${pilHtml}${datumOnbetrouwbaarHtml}${markeerNlTijd(s.titel)}</div>
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
      <div class="titel">${pilHtml}${markeerNlTijd(s.detail?.gebied ?? s.titel)}</div>
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

  // 2026-08-30: teller op de knop gebruikt een eigen, strengere telling
  // (zie moetMeetellenVoorTeller hierboven) — de lijst hieronder blijft
  // gewoon op `relevant` gebaseerd, dus ongewijzigd.
  const gezienNavtexSleutels = new Set();
  const tellerRelevant = relevant.filter((s) => moetMeetellenVoorTeller(s, gezienNavtexSleutels));

  MELDINGEN_BADGE_EL.style.display = tellerRelevant.length ? 'flex' : 'none';
  MELDINGEN_BADGE_EL.textContent = String(tellerRelevant.length);

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
      <div class="iss-badge">🛰️ Live - ISS-passage bezig</div>
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
// 2026-08-26, op verzoek van Lex ("Maeslantkering/stormvloedkering-status
// als melding") — 'stormvloedkering-gesloten' (nieuws-bevestigde sluiting)
// erbij als volledig-scherm-alarm-trigger, zelfde soort losstaande
// toevoeging als weerwaarschuwing/tsunami hierboven. 'stormvloedkering-
// waarschuwing' (de vroege, afgeleide inschatting) bewust NIET hier — dat
// zou te vaak/te vroeg het volledig-scherm-alarm laten afgaan voor iets
// dat nog geen bevestigde gebeurtenis is; die krijgt wel gewoon een
// Pushover/mail/webpush-melding (zie stormvloedkering.js), alleen niet dit
// zwaarste kanaal.
const ALARM_CATEGORIEEN = new Set([...DOPPLER_CATEGORIEEN, 'weerwaarschuwing', 'tsunami', 'tsunami-watch', 'stormvloedkering-gesloten', 'ais-nood']); // 2026-09-03: ais-nood erbij

// 2026-08-21, op verzoek van Lex ("ik wil een knop waarmee ik de alarmen
// zelf kan aan- en uitzetten... voor elke categorie een aan/uit switch") —
// welke van de ALARM_CATEGORIEEN daadwerkelijk alarmeren is nu een instelling
// i.p.v. altijd-aan. Label + volgorde staan hier centraal (de Instellingen-
// tab rendert er alleen knoppen voor, zie renderAlarmInstellingen()); een
// categorie die hier ontbreekt kan sowieso nooit alarmeren (magAlarmeren()
// checkt ook ALARM_CATEGORIEEN zelf), dus geen aparte "afgevinkt maar niet
// in de UI"-toestand mogelijk.
// 2026-09-03, op verzoek van Lex ("gelijktrekken... één consistente lijst"):
// één tabel met per categorie twee schakelaars. `scherm` = het rode
// alarmscherm in de app (localStorage, per toestel); `telefoon` = de
// Pushover/mail/webpush die de backend verstuurt (serverinstelling via
// /api/alarm-schakelaars, geldt voor alle toestellen; sleutel = categorie-id,
// zie GELDIGE_SLEUTELS in backend/src/alarmSchakelaars.js). false = die
// kolom bestaat niet voor deze categorie (geen push-code resp. geen
// schermalarm), dan staat er "—".
const ALARM_RIJEN = [
  { id: 'tornado', label: 'Tornado Warning', scherm: true, telefoon: true },
  { id: 'tornado-watch', label: 'Tornado Watch', scherm: true, telefoon: true },
  { id: 'tornado-bevestigd', label: 'Tornado bevestigd', scherm: true, telefoon: false },
  { id: 'severe-outlook', label: 'Severe Outlook', scherm: true, telefoon: false },
  { id: 'tsunami', label: 'Tsunami Warning', scherm: true, telefoon: true },
  { id: 'tsunami-watch', label: 'Tsunami Watch', scherm: true, telefoon: true },
  { id: 'weerwaarschuwing', label: 'Weeralarm (oranje/rood)', scherm: true, telefoon: true },
  // Losse toggle i.p.v. gewoon "navtex" (dat zou ELK navtex-bericht laten
  // alarmeren, veel te druk); dit dekt alleen type-D berichten. Zie magAlarmeren().
  { id: 'navtex-nood', label: 'NAVTEX noodbericht', scherm: true, telefoon: true }, // 2026-09-03, Lex: korter, past op één regel // telefoon sinds 2026-09-03, zie backend/src/navtexNoodAlarm.js
  { id: 'stormvloedkering-waarschuwing', label: 'Kans op sluiting stormvloedkering', scherm: false, telefoon: true },
  { id: 'stormvloedkering-gesloten', label: 'Stormvloedkering gesloten (bevestigd)', scherm: true, telefoon: true },
  { id: 'ais-nood', label: '🆘 AIS-noodsignaal (SART/MOB/EPIRB)', scherm: true, telefoon: true },
];
const ALARM_CATEGORIE_DEFINITIES = ALARM_RIJEN.filter((r) => r.scherm);

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
  // 2026-09-03: Lex gebruikt Pushover niet meer (PUSHOVER_INGESCHAKELD=0), dus
  // de kanalen zijn mail + browsermelding (webpush) -- kolom heet 'Melding'.
  // 2026-09-03 (Lex: "mail apart is wel beter te onthouden"): Browser en Mail
  // als twee losse serverschakelaars per categorie ('<cat>' en '<cat>/mail').
  uitleg.textContent = 'Scherm = het rode alarmscherm in de app, alleen op dit toestel. Push = pushmelding door de server, komt ook binnen als de app dicht is, op elk toestel waar push hieronder aanstaat. Mail = e-mail door de server. Push en Mail gelden voor alle toestellen.';
  ALARM_INSTELLINGEN_LIJST_EL.appendChild(uitleg);

  const kop = document.createElement('div');
  kop.className = 'alarm-rij alarm-rij-kop';
  kop.innerHTML = '<span>Categorie</span><span>Scherm</span><span>Mail</span><span>Push</span>'; // 2026-09-03, Lex: Push uiterst rechts
  ALARM_INSTELLINGEN_LIJST_EL.appendChild(kop);

  if (telefoonSchakelaars === null) haalTelefoonSchakelaars(); // eerste keer: serverstand ophalen, daarna opnieuw renderen

  const maakKnop = (aan, onClick) => {
    const knop = document.createElement('button');
    knop.type = 'button';
    knop.className = `alarm-toggle${aan ? ' aan' : ''}`;
    knop.textContent = aan ? 'AAN' : 'UIT';
    knop.addEventListener('click', onClick);
    return knop;
  };
  const streepje = () => { const el = document.createElement('span'); el.className = 'alarm-nvt'; el.textContent = '—'; return el; };

  ALARM_RIJEN.forEach((def) => {
    const rij = document.createElement('div');
    rij.className = 'alarm-rij';
    const label = document.createElement('span');
    label.className = 'alarm-rij-label';
    label.textContent = def.label;
    rij.appendChild(label);

    if (def.scherm) {
      const aan = alarmCategorieAan(def.id);
      rij.appendChild(maakKnop(aan, () => { zetAlarmCategorie(def.id, !aan); renderAlarmInstellingen(); }));
    } else rij.appendChild(streepje());

    // Browser- en Mail-kolom: serverschakelaars '<id>' resp. '<id>/mail'.
    const serverKnop = (sleutel) => {
      if (!def.telefoon) return streepje();
      if (telefoonSchakelaars === 'fout') {
        const knop = maakKnop(false, () => { telefoonSchakelaars = null; renderAlarmInstellingen(); });
        knop.textContent = 'OPNIEUW';
        knop.title = 'Server niet bereikbaar — opnieuw proberen';
        return knop;
      }
      if (telefoonSchakelaars === null) { const el = document.createElement('span'); el.className = 'alarm-nvt'; el.textContent = '…'; return el; }
      const aan = telefoonSchakelaars[sleutel] !== false;
      return maakKnop(aan, async () => {
        try {
          const res = await fetch('/api/alarm-schakelaars', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sleutel, aan: !aan }),
          }).then((r) => r.json());
          telefoonSchakelaars = res.schakelaars ?? telefoonSchakelaars;
        } catch (err) {
          console.warn('[weer] alarm-schakelaar omzetten mislukt:', err);
        }
        renderAlarmInstellingen();
      });
    };
    rij.appendChild(serverKnop(`${def.id}/mail`));
    rij.appendChild(serverKnop(def.id));
    ALARM_INSTELLINGEN_LIJST_EL.appendChild(rij);
  });
}

// Serverinstelling voor de Telefoon-kolom (zie ALARM_RIJEN): de backend
// verstuurt de telefoonalarmen ook zonder open app, dus de schakelaar leeft
// op de server (alarmSchakelaars.js + /api/alarm-schakelaars).
let telefoonSchakelaars = null; // null = nog niet opgehaald; 'fout' = ophalen mislukt
let telefoonSchakelaarsBezig = false; // tegen dubbele/oneindige fetch-lussen

async function haalTelefoonSchakelaars() {
  if (telefoonSchakelaarsBezig) return;
  telefoonSchakelaarsBezig = true;
  try {
    const res = await fetch('/api/alarm-schakelaars').then((r) => r.json());
    telefoonSchakelaars = res.schakelaars ?? {};
  } catch (err) {
    console.warn('[weer] telefoonalarm-schakelaars ophalen mislukt:', err);
    telefoonSchakelaars = 'fout'; // expliciete fouttoestand — nooit stil opnieuw blijven proberen
  }
  telefoonSchakelaarsBezig = false;
  renderAlarmInstellingen();
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
    MELDINGEN_KNOP_EL.querySelector('span').textContent = '🔔 Push niet ondersteund op dit toestel';
    MELDINGEN_KNOP_EL.disabled = true;
    return;
  }
  try {
    const abonnement = await huidigAbonnement();
    // 2026-08-22, op verzoek van Lex ("een aan/uit-knop, per device") — de
    // knoptekst is nu de ACTIE die een tik uitvoert (niet de huidige status),
    // zodat "wat gebeurt er als ik hierop tik" altijd meteen duidelijk is.
    // 2026-09-03: duidelijker naam -- dit gaat alleen over het webpush-kanaal
    // op DIT toestel, niet over welke categorieën melden (dat is de tabel).
    MELDINGEN_KNOP_EL.querySelector('span').textContent = abonnement
      ? '🔔 Push op dit toestel: AAN (tik om uit te zetten)'
      : '🔔 Push op dit toestel: UIT (tik om aan te zetten)';
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
      renderMeldingenStatus('Geen toestemming gegeven - je kunt dit later opnieuw proberen via je iOS-instellingen.');
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
  if (s.detail?.verlopen) return false;
  // 2026-08-26, op verzoek van Lex ("noodberichten via navtex met een alarm
  // laten binnenkomen net als de andere alarms") -- navtex zit expres NIET
  // in ALARM_CATEGORIEEN: bijna elk navtex-bericht is routine (boei
  // verplaatst, licht kapot, oefening) en zou het alarm zinloos druk maken.
  // Alleen berichttype D (SAR/opsporing-redding, piraterij, tsunami/
  // natuurrampen -- zie noodbericht in navtexLokaal.js) verdient dezelfde
  // volledig-scherm/geluid/trilling-behandeling als tornado/tsunami/
  // weerwaarschuwing hieronder, dus een eigen kortsluiting vóór de generieke
  // ALARM_CATEGORIEEN-check (die 'navtex' als categorie sowieso nooit bevat).
  if (s.categorie === 'navtex') return Boolean(s.detail?.noodbericht) && alarmCategorieAan('navtex-nood');
  if (!ALARM_CATEGORIEEN.has(s.categorie)) return false;
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

// 2026-08-27, iPad-freeze-analyse: renderMap() (alle markers slopen en
// herbouwen) en renderMeldingen() (hele lijst-DOM opnieuw) draaiden élke
// 20-seconden-cyclus, ook als er inhoudelijk niets veranderd was — op de
// iPad gaf die periodieke sloop/herbouw merkbare hikken (en het was de
// motor achter het soms-verdwijnende popup-label, zie centreerOpMelding).
// Nu wordt eerst een vingerafdruk van de signalen vergeleken met de vorige
// cyclus. Het bron.bijgewerkt-veld (laatste poll-moment per bron) verandert
// vrijwel elke cyclus zonder dat er iets zichtbaars wijzigt — dat veld
// wordt buiten de vingerafdruk gehouden (bron.haperend telt WEL mee, dat
// dimt de pins). De datum zit er ook in, zodat dag-afhankelijke weergave
// (isNavtexNieuw) rond middernacht gewoon ververst. Alleen de zware twee
// (renderMap/renderMeldingen) worden overgeslagen — de Hemel/Weer-renders
// bevatten klokjes/aftellingen en draaien gewoon elke cyclus door.
let vorigeSignalenVingerafdruk = null;

function signalenVingerafdruk(signalen) {
  return new Date().toDateString() + JSON.stringify(signalen, (sleutel, waarde) => (
    sleutel === 'bijgewerkt' ? undefined : waarde
  ));
}

async function verversen() {
  try {
    const [signalenRes, statusRes] = await Promise.all([
      fetch('/api/signals').then((r) => r.json()),
      fetch('/api/status').then((r) => r.json()),
    ]);
    ERROR_EL.classList.remove('show');

    verrijkSignalenMetNlTijd(signalenRes.signalen);

    const perCategorie = {};
    for (const s of signalenRes.signalen) {
      (perCategorie[s.categorie] ??= []).push(s);
    }

    const vingerafdruk = signalenVingerafdruk(signalenRes.signalen);
    const signalenGewijzigd = vingerafdruk !== vorigeSignalenVingerafdruk;
    vorigeSignalenVingerafdruk = vingerafdruk;

    verwerkTornadoAlarm(signalenRes.signalen);
    if (signalenGewijzigd) renderMap(signalenRes.signalen);

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

    if (signalenGewijzigd) renderMeldingen(signalenRes.signalen);
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
laadNavtexStations();
setInterval(verversen, 20000);
renderAlarmInstellingen(); // eenmalig — hangt alleen van localStorage af, niet van live signalen
renderNavtexUitlegSectie(); // eenmalig -- staat standaard dicht, NAVTEX_STATIONS_DATA vult zich async

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
