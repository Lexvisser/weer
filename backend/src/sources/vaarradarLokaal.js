// vaarradarLokaal.js — live scheepsposities (AIS) uit Lex' EIGEN ontvangst:
// een RTL-SDR Blog V4 + AIS-catcher, draaiend en al bevestigd WERKEND als
// service op lexdev-nw (2026-08-31, live curl-test door Lex tegen
// http://127.0.0.1:8100/geojson). Vervangt (voor zover bereikbaar) de
// externe vaarradar.js hiernaast, die structureel geen data krijgt van
// aisstream.io (zie de EERLIJKE WAARSCHUWING in dat bestand — bekend, open,
// onopgelost probleem bij aisstream.io zelf). Zelfde soort niet-hazard
// kaartlaag-databron als vaarradar.js/vliegradar.js — geen
// SOURCES/SourceState/makeSignal.
//
// Bron: AIS-catcher's ingebouwde webviewer (opstartoptie "-N 8100" op
// lexdev-nw) serveert zelf een GeoJSON FeatureCollection op /geojson — dus
// GEEN bestand-tussenpatroon nodig zoals bij NAVTEX (dat was wél nodig omdat
// de daar gebruikte decoder geen eigen HTTP-server heeft). Simpele
// periodieke poll, geen multi-bron-fallback/cache zoals vliegradar.js nodig
// heeft — dit is een lokale, eigen ontvanger, geen gedeelde community-dienst
// om te ontzien.
//
// GeoJSON-vorm (bevestigd met een echte curl door Lex, 2026-08-31):
//   { "type": "FeatureCollection", "time_span": 1800, "features": [
//     { "type": "Feature",
//       "properties": { "mmsi": 244210570, "heading": null, "cog": 0,
//         "speed": 0, "shipname": "", "callsign": "", "country": "NL",
//         "last_signal": 1788199913, ... },
//       "geometry": { "type": "Point", "coordinates": [4.424457, 51.843967] } },
//     ... ] }
// LET OP de GeoJSON-coördinatenvolgorde: [lon, lat], NIET [lat, lon] — een
// klassieke valkuil, hieronder expliciet zo uitgelezen. "heading" is al door
// AIS-catcher zelf naar null vertaald als het niet beschikbaar is (geen
// rauwe AIS-511-sentinel meer, maar voor de zekerheid ook die waarde nog
// als "onbeschikbaar" behandeld). "last_signal" is een epoch-tijdstip in
// SECONDEN — gebruikt als tijdMs i.p.v. het pollmoment zelf, dat is
// nauwkeuriger (AIS-catcher's eigen "time_span" van 1800s bepaalt toch al
// welke schepen meekomen; onze eigen VENSTER_MS hieronder is een striktere,
// client-side aanvulling, zelfde opzet als vaarradar.js).
// "shipname"/"callsign" komen als lege string binnen i.p.v. afwezig zodra ze
// (nog) niet bekend zijn — hieronder naar null omgezet zoals de rest van de
// app dat gewend is (zie vaarradar.js).

const POLL_MS = 3 * 1000; // 2026-09-01, op verzoek van Lex ("dan zou de boot wat meer bewegen") verlaagd van 10s
// naar 3s, gelijk aan de frontend-poll (RADAR_POLL_MS in app.js) — voorheen stapelden beide
// vertragingen op (tot 10s backend + tot 3s frontend = tot 13s voor een verse positie op de
// kaart verscheen), nu is de backend niet meer de tragere schakel. AIS-catcher's /geojson is
// een lokaal in-memory endpoint (zelfde machine), dus 3s pollen kost niets noemenswaardigs.
const VENSTER_MS = 10 * 60 * 1000; // zelfde uitfaseervenster als vaarradar.js — een laatst-bekende positie zonder nieuw bericht verdwijnt na 10 min
const BACKOFF_START_MS = 5000;
const BACKOFF_MAX_MS = 60000;

// 2026-09-01, op verzoek van Lex ("kunnen we nog wat leuks doen om tussen de
// boten te differentieren met de kleuren?") -- optie 2 van de drie besproken
// kleurmodi in app.js: kleur per scheepstype. AIS-catcher's eigen JSON-docu-
// mentatie (jvde-github.github.io/AIS-catcher-docs) noemt een numeriek
// 'shiptype'-veld (0-99, standaard ITU-R M.1371-codes) uit AIS-berichttype
// 5/19/24 -- STATISCHE data, dus een ander bericht dan de positieberichten
// hierboven en minder vaak uitgezonden dan die.
// 2026-09-02-UPDATE: BEVESTIGD -- Lex' eigen curl tegen 127.0.0.1:8100/geojson
// (sessie-overleg over het loskoppelen/opnieuw vormgeven van de vaarradar)
// toonde "shiptype": 8010 bij een echt schip (NAVATA, op weg naar Frankfurt).
// Het veld zit er dus gewoon in -- de eerdere onzekerheid hieronder is
// opgelost. WEL bleek 8010 geen gewone ITU-R-code (die zijn 0-99) maar een
// 4-cijferige ERI/Inland-AIS-scheepstypecode (CCNR/CESNI-standaard voor
// binnenvaart) -- logisch bij deze locatie (Maasmond/Rotterdamse aanloop),
// waar veel Rijnvaart tussen de zeevaart zit. categoriseerEriType()
// hieronder vangt die range (>=1000) apart op.
export function categoriseerScheepstype(typeCode) {
  if (typeof typeCode !== 'number' || typeCode <= 0) return null; // 0/ontbrekend: geen data, niet hetzelfde als "overig"
  if (typeCode >= 1000) return categoriseerEriType(typeCode); // ERI/Inland-AIS, zie hieronder
  if (typeCode === 30) return 'vissersboot';
  if (typeCode === 31 || typeCode === 32 || typeCode === 52) return 'sleepboot';
  if (typeCode === 36 || typeCode === 37) return 'plezierjacht'; // zeilboot + motorjacht op één hoop, zelfde "leuke" kleur
  // 2026-09-03: 53 (haventender), 54 (antivervuiling) en 58 (medisch) erbij --
  // vielen eerst in 'overig', horen naar hun aard bij de hulpdiensten.
  if ([50, 51, 53, 54, 55, 58].includes(typeCode)) return 'hulpdienst'; // loods/SAR/tender/antivervuiling/wetshandhaving/medisch
  if (typeCode >= 40 && typeCode <= 49) return 'hogesnelheid';
  if (typeCode >= 60 && typeCode <= 69) return 'passagiersschip';
  if (typeCode >= 70 && typeCode <= 79) return 'vracht';
  if (typeCode >= 80 && typeCode <= 89) return 'tanker';
  return 'overig'; // bekend type, maar geen van de bovenstaande (bagger/duik/militair/WIG/90-99 etc.)
}

// 2026-09-03, op verzoek van Lex ("hoe komen zij aan al deze info... ja bouw
// maar"): fijnmaziger SUBTYPE naast de grove categorie hierboven, uitsluitend
// met wat de AIS-typecode zelf hard maakt (ITU-R M.1371, tabel 53). Wat
// MarineTraffic daarbovenop toont (Oil/Chemical, Crew Boat, Cable Layer,
// Icebreaker...) komt uit hun eigen scheepsdatabase en zit NIET in AIS --
// dat wordt hier dus bewust niet "geraden". Regels:
//   - 2e cijfer bij 4x/6x/7x/8x: 1-4 = gevaarlijke lading categorie A-D
//     (X=1 A, 2 B, 3 C, 4 D), 0/5-9 = geen extra info.
//   - 31 slepend, 32 slepend groot (sleep >200m of >25m breed), 52 sleepboot.
//   - 50 loods, 51 SAR, 53 haventender, 54 antivervuiling, 55 wetshandhaving,
//     58 medisch transport; 33 bagger, 34 duik, 35 militair, 36 zeil, 37
//     plezier; 20-29 WIG (grondeffect-vaartuig).
//   - ERI-codes (>=1000) = Inland AIS -> subtype 'binnenvaart' (zee vs.
//     binnenvaart is op zichzelf al nuttig om te filteren).
// null = geen fijner onderscheid bekend; de frontend toont dan de categorie.
// Sleutels zijn stabiel (localStorage-filter in app.js), niet hernoemen.
const LADINGCATEGORIE = { 1: 'lading-a', 2: 'lading-b', 3: 'lading-c', 4: 'lading-d' };
const SUBTYPE_PER_CODE = {
  31: 'slepend', 32: 'slepend-groot', 52: 'sleepboot',
  50: 'loods', 51: 'sar', 53: 'haventender', 54: 'antivervuiling', 55: 'wetshandhaving', 58: 'medisch',
  33: 'bagger', 34: 'duik', 35: 'militair', 36: 'zeil', 37: 'plezier',
};
// 2026-09-03, op melding van Lex (MarineTraffic toonde MMSI 111205510 als
// "SAR Aircraft", wij als "schip, scheepstype onbekend"): SAR-vliegtuigen
// (helikopters/kustwachtvliegtuigen) zenden AIS-berichttype 9 en hebben
// per ITU-R M.585 een MMSI van de vorm 111MIDxxx (111000000-111999999).
// Ze sturen geen shiptype-veld, dus dit gaat -- net als AtoN hierboven --
// op MMSI. Categorie 'hulpdienst', subtype 'sar-vliegtuig'.
const SAR_VLIEGTUIG_MMSI_MIN = 111000000;
const SAR_VLIEGTUIG_MMSI_MAX = 111999999;
export function isSarVliegtuigMmsi(mmsi) {
  const m = Number(mmsi);
  return Number.isFinite(m) && m >= SAR_VLIEGTUIG_MMSI_MIN && m <= SAR_VLIEGTUIG_MMSI_MAX;
}

export function bepaalScheepssubtype(typeCode, mmsi = null) {
  if (isSarVliegtuigMmsi(mmsi)) return 'sar-vliegtuig';
  if (typeof typeCode !== 'number' || typeCode <= 0) return null;
  if (typeCode >= 1000) return typeCode === 8000 ? null : 'binnenvaart';
  if (SUBTYPE_PER_CODE[typeCode]) return SUBTYPE_PER_CODE[typeCode];
  if (typeCode >= 20 && typeCode <= 29) return 'wig';
  const tiental = Math.floor(typeCode / 10);
  if ([4, 6, 7, 8].includes(tiental)) return LADINGCATEGORIE[typeCode % 10] ?? null;
  return null;
}

// 2026-09-02, op verzoek van Lex (filterpaneel per scheepstype, net als
// MarineTraffic's "Ship Type"-paneel -- zie sessie-overleg) -- naast de
// shiptype-code hierboven bestaat er ook een heel ander soort AIS-zender:
// "Aid to Navigation" (boeien/bakens/vuurtorens, AIS-berichttype 21). Die
// zenden zelf meestal GEEN (zinnig) shiptype-veld uit, maar zijn wel te
// herkennen aan hun MMSI: de ITU/IMO-conventie reserveert het bereik
// 990000000-999999999 (MMSI begint met "99") specifiek voor dit soort vaste
// navigatiehulpmiddelen. NIET live geverifieerd tegen een echt AtoN-baken
// vanuit deze sessie (geen directe toegang tot de AIS-catcher-feed hiervandaan) --
// dit is de gedocumenteerde MMSI-conventie, geen aanname op basis van shiptype.
// Bij twijfel (mmsi buiten dat bereik) valt dit gewoon terug op de normale
// scheepstype-categorisering hierboven.
const ATON_MMSI_MIN = 990000000;
const ATON_MMSI_MAX = 999999999;
export function bepaalScheepscategorie(mmsi, typeCode) {
  const m = Number(mmsi);
  if (Number.isFinite(m) && m >= ATON_MMSI_MIN && m <= ATON_MMSI_MAX) return 'navigatiehulp';
  if (isSarVliegtuigMmsi(m)) return 'hulpdienst';
  return categoriseerScheepstype(typeCode);
}

// 2026-09-02: ERI/Inland-AIS-scheepstypecodes (4-cijferig, >=1000) -- tabel
// overgenomen uit CESNI/ERI's publieke Annex-1-documentatie voor Inland AIS
// (zie sessienotitie), NIET stuk voor stuk live geverifieerd tegen echte
// schepen -- alleen 8010 is hard bevestigd (NAVATA, zie boven). Bij twijfel
// over een code: laat 'm in 'overig' vallen, nooit gokken naar een "leukere"
// categorie. 8000 ("Vessel, type unknown") wordt als "geen data" behandeld,
// net als een ontbrekende ITU-R-code hierboven.
const ERI_TANKER = new Set([8020, 8021, 8022, 8023, 8040, 8060, 8160, 8161, 8162, 8163, 8180, 8490, 8500]);
const ERI_VRACHT = new Set([8010, 8030, 8050, 8070, 8080, 8090, 8100, 8150, 8170]);
const ERI_SLEEPBOOT = new Set([8110, 8120, 8130, 8140, 8400, 8410, 8420, 8430]);
const ERI_PASSAGIER = new Set([8440, 8441, 8442, 8443, 8444]);
const ERI_HULPDIENST = new Set([8450, 8460]);
const ERI_VISSER = new Set([8480]);

function categoriseerEriType(typeCode) {
  if (typeCode === 8000) return null; // "type unknown" -- geen data
  if (ERI_TANKER.has(typeCode) || (typeCode >= 8310 && typeCode <= 8399)) return 'tanker'; // losse tankcodes + duw/sleep-combi's met tank-/gasbak(ken)
  if (ERI_VRACHT.has(typeCode) || (typeCode >= 8210 && typeCode <= 8299)) return 'vracht'; // losse vrachtcodes + duw/sleep-combi's met droge-lading-bak(ken)
  if (ERI_SLEEPBOOT.has(typeCode)) return 'sleepboot';
  if (ERI_PASSAGIER.has(typeCode)) return 'passagiersschip';
  if (ERI_HULPDIENST.has(typeCode)) return 'hulpdienst';
  if (ERI_VISSER.has(typeCode)) return 'vissersboot';
  return 'overig'; // bekende ERI-range, maar geen van bovenstaande (getrokken object, bunkerschip, onbekend object...)
}

// 2026-09-02: ETA komt bij AIS in vier losse velden (maand/dag/uur/minuut),
// met vaste ITU-R M.1371-sentinelwaarden voor "onbekend per veld" (maand 0,
// dag 0, uur 24, minuut 60) -- geen eigen aanname, staat zo in de standaard.
// Eén normalisatiefunctie hier zodat beide bronnen (lokaal: losse velden,
// AISHub: samengevoegde tekst, zie vaarradarAishub.js) hetzelfde opleveren
// voor de frontend. Zonder bruikbare maand/dag (het meest gebruikelijke
// "nog niet bekend"-geval) geeft dit null terug -- geen halve/misleidende
// datum tonen.
export function normaliseerEta(maand, dag, uur, minuut) {
  const m = Number(maand);
  const d = Number(dag);
  if (!Number.isFinite(m) || !Number.isFinite(d) || m <= 0 || d <= 0) return null;
  const u = Number(uur);
  const min = Number(minuut);
  return {
    maand: m,
    dag: d,
    uur: Number.isFinite(u) && u < 24 ? u : null,
    minuut: Number.isFinite(min) && min < 60 ? min : null,
  };
}

// 2026-09-02-bug-fix, op melding van Lex ("de labels knipperen ook" / "niet
// alle schepen knipperen") -- ROOT CAUSE: scheepstype (msg 5, statische
// data) wordt door AIS-catcher/AISHub maar zo eens in de paar minuten
// uitgezonden. Zonder deze functie viel scheepscategorie (en daarmee de
// kleur in 'type'-modus, en dus vaarIconSleutel() in app.js) bij elke poll
// zonder een vers type-5-bericht terug naar null/grijs, en sprong bij de
// eerstvolgende poll mét weer terug naar de echte kleur -- dat wisselende
// icoon triggerde bij elke wissel een echte setIcon()-vervanging (zie
// app.js), wat zowel het icoon als de eraan gekoppelde hover-tooltip liet
// knipperen. Verklaart ook waarom niet ALLE schepen knipperden: alleen
// schepen waarvan het type-5-bericht wisselend wel/niet in de meest recente
// snapshot zat, niet schepen met stabiel bekende (of stabiel onbekende)
// statische data.
// Fix: bij het bijwerken van een bekend schip vullen ontbrekende STATISCHE
// velden (naam/categorie/bestemming/diepgang/eta/callsign/imo) aan vanuit de
// vorige bekende waarde i.p.v. meteen naar null te springen -- dynamische
// velden (positie/koers/snelheid/status/tijdstip) komen altijd vers uit het
// nieuwste bericht, die worden hier NIET overgenomen uit de vorige waarde.
// 2026-09-03: AIS-afmetingen (A=boeg, B=hek, C=bakboord, D=stuurboord, vanaf
// de antenne) -> { boeg, hek, bakboord, stuurboord } of null als er niets in
// zit (alle 0 = niet ingevuld, komt veel voor bij kleine schepen/klasse B).
export function afmetingenVan(boeg, hek, bakboord, stuurboord) {
  const n = (x) => (typeof x === 'number' && x >= 0 ? x : 0);
  const a = { boeg: n(boeg), hek: n(hek), bakboord: n(bakboord), stuurboord: n(stuurboord) };
  if (a.boeg + a.hek < 5 || a.bakboord + a.stuurboord < 1) return null; // te klein/leeg om zinvol te tekenen
  return a;
}

export function vulOntbrekendeVeldenAan(nieuw, vorige) {
  if (!vorige) return nieuw;
  return {
    ...nieuw,
    naam: nieuw.naam ?? vorige.naam,
    scheepscategorie: nieuw.scheepscategorie ?? vorige.scheepscategorie,
    scheepssubtype: nieuw.scheepssubtype ?? vorige.scheepssubtype,
    afmetingen: nieuw.afmetingen ?? vorige.afmetingen,
    bestemming: nieuw.bestemming ?? vorige.bestemming,
    diepgangM: nieuw.diepgangM ?? vorige.diepgangM,
    eta: nieuw.eta ?? vorige.eta,
    callsign: nieuw.callsign ?? vorige.callsign,
    imo: nieuw.imo ?? vorige.imo,
  };
}

function vertaalFeature(feature) {
  const coords = feature?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const [lon, lat] = coords; // GeoJSON: [lon, lat], niet [lat, lon]
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;

  const p = feature.properties ?? {};
  const mmsi = p.mmsi;
  if (mmsi == null) return null;

  // "heading" is bij AIS-catcher al null als het niet beschikbaar is; de
  // klassieke AIS-511-sentinel wordt hier voor de zekerheid ook nog als
  // "onbeschikbaar" behandeld, mocht een andere/oudere AIS-catcher-versie
  // die ooit toch rauw doorgeven. Val dan terug op cog (course over ground).
  const koersGraden =
    typeof p.heading === 'number' && p.heading < 511 ? p.heading : typeof p.cog === 'number' && p.cog < 360 ? p.cog : null; // 2026-09-03: 360 = "COG niet beschikbaar" (ITU-R M.1371)

  const tijdMs = typeof p.last_signal === 'number' ? p.last_signal * 1000 : Date.now();

  const scheepstypeRuw =
    typeof p.shiptype === 'number' ? p.shiptype : typeof p.ship_type === 'number' ? p.ship_type : null;

  // 2026-09-02, op verzoek van Lex (bestemming/ETA/status/diepgang erbij --
  // zie sessie-overleg): stuk voor stuk bevestigd aanwezig in Lex' eigen
  // curl tegen 127.0.0.1:8100/geojson (NAVATA-voorbeeld: destination
  // "FRANKFURT  HOCHST", draught 1.5, eta_month/day/hour/minute, status 0).
  // "status" is de officiële AIS-navigatiestatus (0-15, zie NAVSTATUS_LABEL
  // in app.js) -- gebruikt door de frontend om stilliggende schepen als stip
  // i.p.v. driehoekje te tekenen, betrouwbaarder dan zelf een snelheids-
  // drempel verzinnen.
  const bestemming = String(p.destination ?? '').trim() || null;
  const diepgangM = typeof p.draught === 'number' && p.draught > 0 ? p.draught : null;
  const eta = normaliseerEta(p.eta_month, p.eta_day, p.eta_hour, p.eta_minute);
  const status = typeof p.status === 'number' ? p.status : null;
  const callsign = String(p.callsign ?? '').trim() || null;
  const imo = typeof p.imo === 'number' && p.imo > 0 ? p.imo : null;
  // 2026-09-02, op verzoek van Lex (hover-kaartje met landcode, zoals
  // MarineTraffic's "NAAM [NL]") -- AIS-catcher decodeert het land zelf al
  // uit de MMSI (MID-landprefix) en zet dat in het 'country'-veld van de
  // geojson-feed (zie voorbeeld bovenaan dit bestand); geen eigen MID-tabel
  // nodig. AISHub's eigen voorbeeldrespons (zie vaarradarAishub.js) heeft dit
  // veld niet -- daar blijft 'land' dus altijd null, de frontend laat het
  // '[..]'-label dan gewoon weg.
  const land = String(p.country ?? '').trim() || null;

  return {
    mmsi,
    naam: String(p.shipname ?? '').trim() || null,
    land,
    lat,
    lon,
    koersGraden,
    // 2026-09-03: losse koers-over-grond, zie toelichting in vaarradarAishub.js.
    cogGraden: typeof p.cog === 'number' && p.cog < 360 ? p.cog : null,
    // 2026-09-03 (Lex: MarineTraffic tekent bij inzoomen de echte scheepsvorm):
    // ware koers los (heading 511 = onbekend) + afmetingen vanaf de GPS-antenne
    // (AIS type 5/24: to_bow/to_stern/to_port/to_starboard, in meters).
    // Zie tekenScheepsvorm() in app.js. null zodra alle vier 0/ontbrekend.
    headingGraden: typeof p.heading === 'number' && p.heading < 511 ? p.heading : null,
    afmetingen: afmetingenVan(p.to_bow, p.to_stern, p.to_port, p.to_starboard),
    snelheidKn: typeof p.speed === 'number' ? p.speed : null,
    scheepscategorie: bepaalScheepscategorie(mmsi, scheepstypeRuw),
    scheepssubtype: bepaalScheepssubtype(scheepstypeRuw, mmsi),
    bestemming,
    diepgangM,
    eta,
    status,
    callsign,
    imo,
    tijdMs,
  };
}

export function startVaarradarLokaalFeed(env) {
  const posities = new Map(); // mmsi -> { mmsi, naam, lat, lon, koersGraden, snelheidKn, tijdMs }

  if (!env.vaarradarLokaalUrl) {
    console.log('[weer] vaarradarLokaal: geen VAARRADAR_LOKAAL_URL ingesteld, laag blijft leeg (zie backend/.env.example).');
    return { posities, stop: () => {} };
  }
  if (typeof fetch === 'undefined') {
    console.log('[weer] vaarradarLokaal: deze Node-versie heeft geen ingebouwde fetch (nodig: Node 18+), laag blijft leeg.');
    return { posities, stop: () => {} };
  }

  let gestopt = false;
  let backoffMs = 0;
  let voorbeeldenGelogd = 0;
  let pollTimer = null;

  function log(bericht) {
    console.log(`[weer] vaarradarLokaal: ${bericht}`);
  }

  function opschonen() {
    const nu = Date.now();
    for (const [mmsi, p] of posities) {
      if (nu - p.tijdMs > VENSTER_MS) posities.delete(mmsi);
    }
  }

  async function pollEenmaal() {
    try {
      const res = await fetch(env.vaarradarLokaalUrl, { headers: { Connection: 'close' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      const features = Array.isArray(body?.features) ? body.features : null;
      if (features === null) throw new Error('onherkenbaar antwoord (geen GeoJSON FeatureCollection met "features")');

      if (voorbeeldenGelogd < 3 && features.length) {
        voorbeeldenGelogd++;
        log(`voorbeeldrecord ${voorbeeldenGelogd}: ${JSON.stringify(features[0]).slice(0, 400)}`);
      }

      for (const feature of features) {
        const p = vertaalFeature(feature);
        if (p) posities.set(p.mmsi, vulOntbrekendeVeldenAan(p, posities.get(p.mmsi)));
      }
      opschonen();
      if (backoffMs) log('lokale AIS-catcher weer bereikbaar.');
      backoffMs = 0;
    } catch (err) {
      backoffMs = backoffMs ? Math.min(backoffMs * 2, BACKOFF_MAX_MS) : BACKOFF_START_MS;
      log(`poll van ${env.vaarradarLokaalUrl} mislukt (${err.message ?? err}), volgende poging over ${Math.round((POLL_MS + backoffMs) / 1000)}s`);
    }
  }

  function planVolgende() {
    if (gestopt) return;
    pollTimer = setTimeout(async () => {
      await pollEenmaal();
      planVolgende();
    }, POLL_MS + backoffMs);
  }

  pollEenmaal().then(planVolgende);
  const opschoonTimer = setInterval(opschonen, 60 * 1000);

  return {
    posities,
    stop: () => {
      gestopt = true;
      clearInterval(opschoonTimer);
      clearTimeout(pollTimer);
    },
  };
}
