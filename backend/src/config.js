// Bronregister — één plek die overeenkomt met de hoofdinventarisatie
// (project: "Weer" > weer-hoofdinventarisatie-datastromen.md).
//
// tier: 'officieel' | 'community' | 'lokaal'
// Community-bronnen worden in de UI expliciet gemarkeerd en klappen om naar
// "haperend" als staleAfterMs verstreken is zonder succesvolle update.

export const SOURCES = [
  {
    id: 'usgs',
    categorie: 'aardbeving',
    naam: 'USGS Earthquake Feed',
    tier: 'officieel',
    pollIntervalMs: 90 * 1000,
    staleAfterMs: 10 * 60 * 1000,
    implemented: true,
  },
  {
    id: 'emsc',
    categorie: 'aardbeving',
    naam: 'EMSC SeismicPortal',
    tier: 'officieel',
    pollIntervalMs: 2 * 60 * 1000,
    staleAfterMs: 10 * 60 * 1000,
    implemented: true,
    note: 'FDSN REST-query (niet de WebSocket) — Europees-Mediterrane focus, kan overlappen met USGS.',
  },
  {
    id: 'nhc',
    categorie: 'orkaan',
    naam: 'NOAA National Hurricane Center',
    tier: 'officieel',
    pollIntervalMs: 45 * 60 * 1000,
    staleAfterMs: 3 * 60 * 60 * 1000,
    implemented: true,
    note: 'CurrentStorms.json op nhc.noaa.gov — geen officiële uptime-garantie',
  },
  {
    id: 'nws',
    categorie: 'tornado',
    naam: 'NWS api.weather.gov (alerts)',
    tier: 'officieel',
    pollIntervalMs: 2 * 60 * 1000,
    staleAfterMs: 30 * 60 * 1000,
    implemented: true,
    note: 'Vereist herkenbare User-Agent header. Dekt alleen de VS. Levert vier categorieën: tornado (Warning), tornado-watch (Watch), tsunami (Warning) en tsunami-watch (Watch) — allemaal incl. polygon-omtrek van het gebied waar van toepassing. Severe Thunderstorm Warning zat er even bij (2026-08-20) maar is op verzoek van Lex weer uitgezet ("veeeeeels te veel") — zie EVENT_TYPES in nws.js om terug te zetten. Toont ook tot 48 uur terug verlopen waarschuwingen (detail.verlopen, zie historie.js) als lichte historie op de kaart. Binnen tornado/tornado-watch wordt ook PDS ("Particularly Dangerous Situation"), Tornado Emergency (hoogste niveau) en tornadoDetection=OBSERVED ("op de grond") herkend, zie tornadoDreigingsniveau()/tornadoWaargenomen() in nws.js. Tsunami is hier VS-only — wereldwijde dekking komt sinds 2026-08-27 van ptwc (Stille Oceaan, officieel) + gdacs TS-events (rest van de wereld, model-vangnet).',
  },
  {
    id: 'ptwc',
    categorie: 'tsunami',
    naam: 'PTWC tsunami.gov (Pacific)',
    tier: 'officieel',
    pollIntervalMs: 3 * 60 * 1000,
    staleAfterMs: 30 * 60 * 1000,
    implemented: true,
    note: 'Pacific Tsunami Warning Center (NOAA, Honolulu) — officiële tsunamiberichten voor het hele Stille-Oceaanbekken (internationaal), via de sleutelloze Atom-feed op tsunami.gov (2026-08-27, op verzoek van Lex: "tsunami alarmen globaal"). Information statements (routinemeldingen zonder dreiging) worden bewust overgeslagen; alleen Warning/Threat/Advisory/Watch komen door. De NTWC-zusterfeed (VS/Canada) is bewust weggelaten: de VS-kust zit al met polygon-detail in nws. LET OP: nog niet live bevestigd tegen een echte Pacific-tsunami — zie de eerlijke waarschuwing in sources/ptwc.js.',
  },
  {
    id: 'spcOutlook',
    categorie: 'severe-outlook',
    naam: 'NOAA Storm Prediction Center (Day 1 Outlook)',
    tier: 'officieel',
    pollIntervalMs: 30 * 60 * 1000,
    staleAfterMs: 6 * 60 * 60 * 1000,
    implemented: true,
    note: 'Categorical Day 1-outlook, alleen Enhanced/Moderate/High-risicogebieden (Marginal/Slight bewust weggefilterd — te routinematig ergens in de VS). VS-only, incl. polygon-omtrek.',
  },
  {
    id: 'iemLsr',
    categorie: 'tornado-bevestigd',
    naam: 'IEM Local Storm Reports (bevestigde tornado\'s)',
    tier: 'officieel',
    pollIntervalMs: 3 * 60 * 1000,
    staleAfterMs: 20 * 60 * 1000,
    implemented: true,
    note: 'Spiegelt NWS Local Storm Reports, gefilterd op typetext=TORNADO — daadwerkelijk gemelde/bevestigde tornado\'s, geen voorspelling. Venster van 3 uur. VS-only.',
  },
  {
    id: 'openmeteo',
    categorie: 'algemeen-weer',
    naam: 'Open-Meteo',
    tier: 'officieel',
    pollIntervalMs: 15 * 60 * 1000,
    staleAfterMs: 2 * 60 * 60 * 1000,
    implemented: true,
    note: 'Gratis, geen sleutel nodig (niet-commercieel), tot 10.000 requests/dag.',
  },
  {
    id: 'knmi',
    categorie: 'algemeen-weer',
    naam: 'KNMI EDR API (10-minuten-waarnemingen)',
    tier: 'officieel',
    pollIntervalMs: 20 * 60 * 1000,
    staleAfterMs: 2 * 60 * 60 * 1000,
    implemented: true,
    // 2026-08-22: overgestapt van het idee "KNMI Open Data" (bleek puur een
    // bestandsbrowser voor grib/netcdf, te omslachtig) naar de EDR API —
    // zie de uitgebreide comment bovenaan sources/knmi.js voor de volledige
    // aanloop, live-geteste velden en de stationskeuze (Rotterdam Airport,
    // dichtstbijzijnde "volwaardige" sensorset bij HOME_LAT/HOME_LON).
    // Vereist een EIGEN sleutel t.o.v. de Open Data API (KNMI_API_KEY in
    // .env, header "Authorization" — andere headernaam dan meteoalarm.js).
    note: 'EDR API (api.dataplatform.knmi.nl/edr/v1) — 10-minuten-waarnemingen van het dichtstbijzijnde volwaardige KNMI-station, als NL-precisie-aanvulling naast Open-Meteo. Vereist KNMI_API_KEY in .env, zie sources/knmi.js voor het volledige voorbehoud.',
  },
  {
    id: 'meteoalarm',
    categorie: 'weerwaarschuwing',
    naam: 'Meteoalarm (via MeteoGate)',
    tier: 'officieel',
    pollIntervalMs: 20 * 60 * 1000,
    staleAfterMs: 2 * 60 * 60 * 1000,
    implemented: true,
    // 2026-08-19: overgestapt van de legacy Atom-feed naar de officiële
    // MeteoAlarm OGC-API EDR via MeteoGate's gateway — geeft nu wel een
    // Nederlandstalige gebiedsnaam (language=nl-NL) en echte geometrie
    // (featureType geocode = puntmarkering, polygon = omtrek) i.p.v. alleen
    // een EMMA-regiocode. Vereist METEOGATE_API_KEY in .env (gratis via
    // devportal.meteogate.eu). Detailbestand-veldnamen nog niet live
    // bevestigd — zie de uitgebreide comment bovenaan sources/meteoalarm.js.
    note: 'Officiële EUMETNET-API via MeteoGate, met echte geometrie en NL-taalfilter. Vereist METEOGATE_API_KEY in .env.',
  },
  {
    id: 'gdacs',
    categorie: 'multi-hazard',
    naam: 'GDACS',
    tier: 'officieel',
    pollIntervalMs: 3 * 60 * 60 * 1000,
    staleAfterMs: 12 * 60 * 60 * 1000,
    implemented: true,
    note: 'Vangnet-bron voor overstroming/natuurbrand/vulkaan/droogte en cyclonen buiten NHC. Alleen Orange/Red. Sinds 2026-08-27 ook TS-events (tsunami, JRC-model, wereldwijd) — het vangnet naast de officiële PTWC-bron voor de Stille Oceaan.',
  },
  {
    id: 'blitzortung',
    categorie: 'onweercomplex',
    naam: 'Blitzortung.org',
    tier: 'community',
    pollIntervalMs: null, // permanente WebSocket-stream i.p.v. periodiek pollen — zie sources/blitzortung.js
    staleAfterMs: 5 * 60 * 1000, // strenger: community-bron, snel als "haperend" markeren
    implemented: true,
    note: 'Geen officiële API — reverse-engineered WebSocket-protocol, geen SLA. Clustert losse flitsen tot "onweercomplexen" met een naderend/actief/verwijderend-status i.p.v. losse puntflitsen te tonen. Protocol-decodering nog niet live bevestigd — check bij opstarten de console-log "voorbeeldrecord".',
  },
  {
    id: 'p2000',
    categorie: 'hulpdiensten',
    // 2026-08-19: was 'P2000 (Brandweer Berkel-Enschot RSS)' — Lex las dit
    // (begrijpelijk) als "dit incident is in Berkel-Enschot", terwijl het de
    // naam van de landelijke feed-aggregator is (een vrijwilliger die tóevallig
    // in Berkel-Enschot zit, maar het hele land publiceert — bevestigd tegen
    // echte meldingen in Bleiswijk/Vlaardingen/Oudenhoorn/Delft, allemaal met
    // kloppende coördinaten). Naam verduidelijkt zodat 'ie niet als locatie
    // leest.
    naam: 'P2000 Livemonitor (landelijke feed)',
    tier: 'community',
    pollIntervalMs: 90 * 1000,
    staleAfterMs: 10 * 60 * 1000,
    implemented: true,
    note: 'Vrijwilligersfeed, geen officiële overheids-API/SLA. Alleen brandweer/politie/ambulance-items mét coördinaten binnen 25km van huis — zie sources/p2000.js voor het volledige voorbehoud (XML-tagnamen nog niet live bevestigd, check bij opstarten de console-log "voorbeelditem"). Bron-"naam" is de feed-aggregator (landelijk, gevestigd in Berkel-Enschot), niet de incidentlocatie — zie history-comment hierboven.',
  },
  {
    id: 'lifeliner',
    categorie: 'hulpdiensten',
    naam: 'Lifeliner (OpenSky Network)',
    tier: 'community',
    // 2026-08-19: TIJDELIJK op false gezet — het OpenSky-dagbudget zat al
    // vast (herhaalde 429's) toen Lex gewoon aan het werk was met de app
    // open, en het is onduidelijk of afgewezen 429-requests ook credits
    // kosten (niet gedocumenteerd door OpenSky) — dus voorlopig helemaal
    // stilzetten i.p.v. door blijven pollen tegen een dichte deur.
    // `implemented: false` slaat regel 305 in server.js's startPolling()
    // over, dus er wordt letterlijk geen timer meer opgezet voor deze bron
    // (zelfde mechanisme als bij 'knmi' hierboven). Zet terug op true zodra
    // het quotum weer ruimte heeft — de rest van de app (incl. P2000) blijft
    // intussen gewoon normaal doorlopen, dit raakt alleen Lifeliner.
    implemented: true,
    // 2026-08-19: eerst 5→2 min, toen 20s, toen 10s, toen 30s — op elke
    // stand liep het OpenSky-dagbudget tijdens dit project herhaaldelijk
    // vast (429's), ook op 30s: Lex meldde op 2026-08-21 "ik heb elke dag
    // 429 daar". Zuiver aan het interval draaien loste het steeds maar
    // tijdelijk op (het hangt af van hoe lang de app op een dag open staat,
    // niet alleen van de snelheid), dus 2026-08-21: interval nu 60s (nog
    // steeds ruim "bijna realtime") ÉN — belangrijker — een harde
    // dagbudget-stop toegevoegd in `sources/lifeliner.js` zelf
    // (`OPENSKY_DAG_BUDGET`), die het écht garandeert i.p.v. hopen dat het
    // interval ruim genoeg is. Zie de comment daar voor hoe dat werkt.
    pollIntervalMs: 60 * 1000,
    // Idle-drempel + direct-verversen-bij-terugkeer zit in server.js
    // (IDLE_DREMPEL_MS/isIdle()/signaalVerzoekOntvangen()) — deze vlag
    // schakelt dat gedrag alleen voor déze bron in, want dit is de enige met
    // een harde per-dag credit-limiet bij de bron zelf.
    overslaanAlsIdle: true,
    staleAfterMs: 10 * 60 * 1000,
    note: 'Volgt bekende Lifeliner-registraties (PH-TTR/PH-MAA/PH-UMC/PH-HVB/PH-OOP) via OpenSky\'s gratis ADS-B-data binnen 75km van huis, incl. zelf opgebouwd vluchtspoor (geen historie van vóór opstarten). Registratie- en callsign-matching nog niet live bevestigd — zie sources/lifeliner.js. Polt alleen zolang er een client actief is (zie overslaanAlsIdle) om OpenSky\'s anonieme dagbudget te sparen.',
  },
  {
    id: 'moon',
    categorie: 'hemel',
    naam: 'Maanstand (lokale berekening)',
    tier: 'lokaal',
    pollIntervalMs: 60 * 60 * 1000,
    staleAfterMs: null, // lokale berekening is nooit stale
    implemented: true,
  },
  {
    id: 'celestrak',
    categorie: 'hemel',
    naam: 'ISS-passages (g7vrd.co.uk)',
    tier: 'officieel',
    pollIntervalMs: 6 * 60 * 60 * 1000,
    staleAfterMs: 24 * 60 * 60 * 1000,
    implemented: true,
    note: 'Kant-en-klare passage-voorspelling i.p.v. zelf TLE + SGP4 — zie sources/celestrak.js.',
  },
  {
    id: 'starlinkTrein',
    categorie: 'hemel',
    naam: 'Starlink-trein (CelesTrak + g7vrd.co.uk)',
    tier: 'officieel',
    pollIntervalMs: 6 * 60 * 60 * 1000,
    staleAfterMs: 24 * 60 * 60 * 1000,
    implemented: true,
    note: 'Zoekt zelf de meest recente lancering die nog als trein vliegt — zie sources/starlinkTrain.js. Levert een lege lijst op als er nu geen trein is (geen fout).',
  },
  {
    id: 'swpc',
    categorie: 'hemel',
    naam: 'NOAA SWPC (aurora)',
    tier: 'officieel',
    pollIntervalMs: 30 * 60 * 1000,
    staleAfterMs: 3 * 60 * 60 * 1000,
    implemented: true,
    note: 'OVATION-raster, uitgelezen op HOME_LAT/HOME_LON. Alleen zichtbaar bij waarde ≥5.',
  },
  {
    id: 'donki',
    categorie: 'hemel',
    naam: 'NASA DONKI (ruimteweer-context)',
    tier: 'officieel',
    // 2026-08-21: was 6 uur — bleek toch niet "ruim voldoende" bij DEMO_KEY,
    // Lex meldde dagelijks 429's. NASA_API_KEY in `.env` bleek letterlijk op
    // de placeholder-waarde "DEMO_KEY" te staan (nooit een eigen sleutel
    // geregistreerd), dus deze bron zit vast op DEMO_KEY's officiële limiet
    // van 30 requests/uur en 50/dag PER IP-ADRES (bevestigd via api.nasa.gov's
    // eigen docs) — bij 1 request/6u (4/dag) zou dat ruim moeten passen, dus
    // vermoedelijk deelt Lex' IP (CGNAT/thuisnetwerk) die DEMO_KEY-teller met
    // anderen, of NASA handhaaft 'm in de praktijk strenger dan gedocumenteerd
    // (een bekend, vaker gemeld probleem met DEMO_KEY). Interval hier naar 12
    // uur als extra marge, maar de échte/permanente fix is een eigen gratis
    // sleutel: zelfde patroon als METEOGATE_API_KEY — direct via
    // https://api.nasa.gov/ aanvragen (naam + e-mail, geen wachttijd, 1000
    // requests/uur i.p.v. 30) en invullen als NASA_API_KEY in backend/.env
    // (Windows én Minisforum) i.p.v. de huidige placeholder "DEMO_KEY".
    pollIntervalMs: 12 * 60 * 60 * 1000,
    staleAfterMs: 30 * 60 * 60 * 1000,
    implemented: true,
    note: 'NASA_API_KEY staat nu nog op de placeholder "DEMO_KEY" (30/uur, 50/dag per IP) — vandaar de 429\'s. Eigen gratis sleutel aanvragen op api.nasa.gov (1000/uur) lost dit permanent op.',
  },
  {
    id: 'meteors',
    categorie: 'hemel',
    naam: 'Meteorenzwermen (statische kalender)',
    tier: 'lokaal',
    pollIntervalMs: 6 * 60 * 60 * 1000,
    staleAfterMs: null,
    implemented: true,
    note: 'Geen API — lokale kalender, 1x/jaar handmatig bijwerken o.b.v. IMO-jaaroverzicht.',
  },
  {
    id: 'planeten',
    categorie: 'hemel',
    naam: 'Planeten (lokale berekening — astronomy-engine)',
    tier: 'lokaal',
    pollIntervalMs: 15 * 60 * 1000,
    staleAfterMs: null, // lokale berekening is nooit stale, zelfde als moon/meteors
    implemented: true,
    // 2026-08-22, op verzoek van Lex ("Wanneer is welke planeet waar te zien.
    // Elevatie azimuth op onder etc. Liefst in een planetarium-achtige
    // setting.") — azimuth/elevatie/rise-set voor Mercurius t/m Saturnus
    // vanaf HOME_LAT/HOME_LON, elke 15 minuten herrekend (planeten bewegen
    // traag genoeg dat vaker geen zin heeft). Zie sources/planeten.js voor de
    // volledige toelichting, incl. waarom hier WEL een npm-dependency
    // (astronomy-engine) is gekozen i.p.v. het gebruikelijke dependency-loze
    // uitgangspunt.
    note: 'Lokale berekening via astronomy-engine (MIT, geen sleutel nodig) — zie sources/planeten.js voor het volledige voorbehoud.',
  },
  {
    id: 'getij',
    categorie: 'hemel',
    naam: 'Rijkswaterstaat — getij (hoog-/laagwater)',
    tier: 'officieel',
    pollIntervalMs: 30 * 60 * 1000,
    staleAfterMs: 3 * 60 * 60 * 1000,
    implemented: true,
    // 2026-08-20, op verzoek van Lex: eerstvolgende hoog-/laagwater voor elk
    // RWS-getijstation binnen 35km van HOME_LAT/HOME_LON (o.a. Oud-
    // Beijerland-omgeving en Hoek van Holland, als die daarbinnen vallen —
    // zie sources/getij.js voor de volledige kandidatenlijst). De
    // stationscode wordt live opgezocht in RWS' officiële locatiecatalogus
    // (geen hardcoded codes). LET OP: de getij-curve zelf komt van een NIET
    // officieel gedocumenteerd RWS-endpoint (waterinfo.rws.nl/api/chart/get)
    // — functioneel bevestigd via reverse-engineering door derden, maar de
    // exacte JSON-vorm kon in deze projectomgeving niet live getest worden.
    // Check bij de eerste keer draaien de server-log op parse-waarschuwingen.
    note: 'Astronomisch getij via RWS\' nieuwe WADAR-dienst (ddapi20-waterwebservices.rijkswaterstaat.nl), 60km-straal rond huis (GETIJ_STRAAL_KM in .env aanpasbaar). Stationscode live opgezocht (geen hardcoded codes). Probeert eerst RWS\' eigen extremen-grootheid (GETETBRKD2), valt terug op zelf-berekende pieken/dalen uit de waterhoogte-curve (WATHTE) — zie sources/getij.js voor het volledige voorbehoud.',
  },
  {
    id: 'navtex',
    categorie: 'navtex',
    naam: 'NAVTEX — maritieme veiligheidswaarschuwingen',
    tier: 'community',
    pollIntervalMs: 10 * 60 * 1000,
    staleAfterMs: 3 * 60 * 60 * 1000,
    // 2026-08-21 UITGEZET op verzoek van Lex ("latvia geeft garbage...
    // misschien dat niet meer meenemen en even kijken wat er dan overblijft
    // tot we een betere optie hebben").
    //
    // WAAROM (belangrijk voor later — dit is GEEN parseerfout, dus niet
    // proberen te repareren in navtex.js): navtex.lv is een echte
    // radio-ontvanger in LETLAND. NAVTEX zendt op 518 kHz met een
    // ontwerpbereik van ~400 zeemijl (~740 km); Oostende/Scheveningen liggen
    // ~1200 km van die ontvanger, dus ruim buiten bereik. Gevolg: bitfouten
    // in de ontvangen tekst. Live bevestigd in Lex' eigen API-uitvoer
    // (117 berichten): dezelfde standaardzin kwam er drie keer verschillend
    // verminkt uit ("SHIPPING IS REQUESTED NOT" -> "YZIPPING IS REQUESTED
    // NOT" / "SHIP ING IS" / "SHIPPING IS REQ D NOT TO ANCHOR NOR TSH IN"),
    // afgewisseld met stukken die perfect doorkwamen ("EAST GOODWIN LIGHT
    // VESSEL 51-13.3N 001-36.4E"). Ook de ZCZC/NNNN-berichtgrenzen waren
    // stuk (ZCZC dook middenin berichten op, NNNN kwam binnen als
    // "ONNIII"/"GONNIII"). Tekens die al kapot binnenkomen zijn met geen
    // enkele code te herstellen.
    //
    // Bijkomend: geen enkel bericht kreeg een datum (`date: null`), want de
    // DTG's blijken hier helemaal geen jaartal te bevatten ("300828 UTC SEP")
    // terwijl DATUM_REGEX er wel een verwacht. Zonder datum kan niets
    // verouderen — er zat dus ook een jaar oude troep tussen (MSI 356/25,
    // tijdstempels uit MEI en SEPTEMBER). Als deze bron ooit terugkomt, moet
    // dat óók opgelost worden.
    //
    // WEER AANZETTEN: gewoon `implemented: true` hieronder. De code in
    // sources/navtex.js blijft volledig intact en ongewijzigd staan.
    //
    // BETERE OPTIES voor later, in volgorde van voorkeur:
    // 1. Officiële, gepubliceerde tekst i.p.v. radio-ontvangst — daar zijn
    //    bitfouten per definitie onmogelijk. De UKHO-bron hieronder is
    //    precies dat, en dekt NAVAREA I incl. de zuidelijke Noordzee. Voor
    //    Nederlandse/Belgische kustwaarschuwingen is nog geen gelijkwaardige
    //    live tekstbron gevonden (Kustwacht NL en agentschap MDK publiceren
    //    vooral periodieke "Berichten aan Zeevarenden"-PDF's, geen actuele
    //    waarschuwingenlijst) — dat is het gat dat nog openstaat.
    // 2. Eigen ontvangst op 518 kHz. Lex heeft hier de hardware al voor
    //    (ATS Mini V4: 0,1-30 MHz, USB/LSB, koptelefoonuitgang, USB-C-
    //    voeding). NAVTEX is 100 baud FSK en past dus gewoon in audio — een
    //    USB-geluidskaartje + een decoder als YaND volstaat, geen
    //    discriminator-ingreep nodig zoals bij AIS. Op ~100 km van Oostende
    //    zou de kopie vrijwel foutloos zijn. Kritieke factor: de antenne
    //    (518 kHz = ~580 m golflengte, dus een lange draad of loop, niet het
    //    meegeleverde sprietje) en lokale ruis van homelab-apparatuur.
    implemented: false,
    // 2026-08-20, op verzoek van Lex ("laten we dat wel gelijk in de app
    // trekken") — overgenomen/gehard uit zijn losse prototype
    // (C:\Projects\navtex). Scraped navtex.lv (GEEN officiële bron, tier
    // bewust 'community' i.p.v. 'officieel' — zie sources/navtex.js voor het
    // volledige voorbehoud incl. waarom niet de officiële UKHO/Admiralty-
    // portal). Berichten (navigatie/weer/ijs/SAR-waarschuwingen) binnen
    // NAVTEX_STRAAL_KM (standaard 450km, .env aanpasbaar) van HOME_LAT/
    // HOME_LON — gemeten vanaf de coördinaat IN het bericht zelf indien
    // aanwezig, anders vanaf de locatie van het zendstation. Alleen zichtbaar
    // op de kaart via de "Zee"-modus (frontend/app.js) — bij ~15-20+
    // berichten binnen bereik zou dit de gewone hazard-kaart onleesbaar
    // maken naast tornado/aardbeving/onweer.
    note: 'UITGEZET 2026-08-21 — navtex.lv is een radio-ontvanger in Letland, ~1200km buiten NAVTEX-bereik van de voor ons relevante stations, dus de tekst komt met bitfouten binnen. Zie de toelichting hierboven. UKHO hieronder is de schone vervanger.',
  },
  {
    id: 'ukho',
    categorie: 'navtex',
    naam: 'UKHO — Radio Navigational Warnings',
    tier: 'officieel',
    pollIntervalMs: 10 * 60 * 1000,
    staleAfterMs: 3 * 60 * 60 * 1000,
    implemented: true,
    // 2026-08-20, op verzoek van Lex ("UKHO graag") — de officiële NAVAREA
    // I-coördinator + UK Coastal Warnings-bron (msi.admiralty.co.uk), als
    // aanvulling op (niet vervanging van) navtex.js hierboven: rijkere data
    // (volledige coördinaten, officiële referentienummers), maar een andere
    // dekking (geen NAVTEX-radiouitzendingen zelf). Zelfde 'navtex'-
    // categorie/Zee-modus-kaartlaag als navtex.js — zie sources/ukho.js voor
    // het volledige voorbehoud, incl. het (geaccepteerde) risico op een
    // enkele dubbele melding tussen de twee bronnen.
    //
    // 2026-08-21: hiermee de ENIGE bron in deze categorie, nu navtex.js
    // hierboven is uitgezet (zie de toelichting daar). Dat "risico op een
    // dubbele melding" is dus voorlopig niet meer van toepassing. Vanuit
    // deze omgeving live geverifieerd op 2026-08-21: 28 waarschuwingen,
    // schone tekst, actuele DTG's (augustus 2026), met zuidelijke-Noordzee-
    // dekking rond 52-54°N / 000-003°E — dus binnen de 450km-straal valt
    // hier wel degelijk wat. Wat UKHO NIET dekt: Nederlandse en Belgische
    // kustwaarschuwingen (Scheveningen/Oostende) — dat gat staat nog open.
    note: 'Officiële UKHO/Admiralty MSI-portal (msi.admiralty.co.uk), 450km-straal rond huis (NAVTEX_STRAAL_KM in .env, gedeeld met navtex.js) — zie sources/ukho.js voor het volledige voorbehoud.',
  },
  {
    id: 'navtexLokaal',
    categorie: 'navtex',
    naam: 'NAVTEX — eigen testontvangst (ATS Mini + MLA-30+)',
    tier: 'lokaal',
    pollIntervalMs: 2 * 60 * 1000,
    staleAfterMs: 3 * 60 * 60 * 1000,
    implemented: true,
    // 2026-08-23, op verzoek van Lex — eerste stap van eigen NAVTEX-ontvangst
    // (zie weer-navtex-en-eigen-radio-ontvangst.md), NOG met de testopstelling
    // (MLA-30+ loop + ATS Mini + navtex_rx_from_file), niet met de Airspy HF
    // Discovery die er 2026-08-25 aankomt. Leest ~/navtex_berichten.txt op
    // lexdev-nw, waar Lex zelf naartoe schrijft met:
    //   arecord -D hw:1,0 -f cd - | sox -t wav - -c 1 -r 11025 -t raw - vol 0.3
    //     | navtex_rx_from_file 11025 | tee -a ~/navtex_berichten.txt
    // Bewust GEEN systemd-service/audio-pipeline in de app zelf toegevoegd —
    // dat is voor als het echte systeem er is. Zie sources/navtexLokaal.js
    // voor de striktere codevalidatie t.o.v. navtex.js (de over-the-air-tekst
    // hier is aanmerkelijk ruizinger dan wat navtex.js van navtex.lv kreeg),
    // en voor de toevoeging van station 'K' (Niton Radio, live waargenomen —
    // navtex.js kent Niton nog aan 'E' toe, ongewijzigd gelaten, zie de
    // comment in navtexLokaal.js).
    note: 'Testontvangst met ATS Mini + MLA-30+ loopantenne op lexdev-nw, gedecodeerd met navtex_rx_from_file. Zie sources/navtexLokaal.js voor het volledige voorbehoud — dit is nadrukkelijk nog een testopstelling, geen definitief systeem.',
  },
  {
    id: 'stormvloedkering',
    categorie: 'stormvloedkering-waarschuwing',
    naam: 'Maeslant-/Hartelkering (RWS-drempel + nieuwsbevestiging)',
    tier: 'officieel',
    pollIntervalMs: 30 * 60 * 1000,
    staleAfterMs: 3 * 60 * 60 * 1000,
    implemented: true,
    // 2026-08-26, op verzoek van Lex ("De Maeslantkering/stormvloedkering-
    // status zou ik wel als melding willen toevoegen") — geen directe
    // kering-standsensor gevonden bij RWS (uitgebreid onderzocht, zie de
    // uitgebreide toelichting bovenaan sources/stormvloedkering.js), dus
    // TWEE gecombineerde signalen: (1) vroege waarschuwing via RWS' eigen
    // gepubliceerde sluitcriterium (verwachte waterstand >NAP+3,00m
    // Rotterdam of >NAP+2,90m Dordrecht, dezelfde bewezen WADAR-aanroep als
    // getij.js), categorie 'stormvloedkering-waarschuwing'; (2) bevestiging
    // via nieuwsmonitoring op Lex' eigen SearXNG-instance (net als
    // searxng.js), categorie 'stormvloedkering-gesloten' — community/
    // fragiel, hangt af van of/hoe snel er nieuws verschijnt. Maeslant- en
    // Hartelkering samen in één melding (sluiten vrijwel altijd
    // gelijktijdig, zelfde operationeel team). Beide categorieën nog niet
    // live bevestigd tegen een echte sluiting (die kwam voor het eerst pas
    // in december 2023 voor, dus zeldzaam) — check bij een volgende storm
    // de server-log.
    note: 'RWS-sluitcriterium (WADAR-verwachting) als vroege waarschuwing + SearXNG-nieuwsmonitoring als bevestiging — zie sources/stormvloedkering.js voor het volledige voorbehoud. Nog niet live bevestigd tegen een echte sluiting.',
  },
];

export function getSource(id) {
  return SOURCES.find((s) => s.id === id);
}
