// navtexLokaal.js — NAVTEX-berichten uit Lex' eigen testontvangst (MLA-30+
// loopantenne + ATS Mini, gedecodeerd met navtex_rx_from_file op lexdev-nw),
// i.p.v. de radio-ontvanger van een derde partij (navtex.js/navtex.lv) of
// gepubliceerde tekst (ukho.js). Bewust een APARTE bron i.p.v. hergebruik van
// navtex.js zelf: andere invoervorm (plat tekstbestand i.p.v. HTML/<pre>),
// en de tekst hier is over-the-air aanmerkelijk ruizinger dan wat navtex.js
// ooit van navtex.lv kreeg — zie de striktere codevalidatie hieronder.
//
// 2026-08-23, op verzoek van Lex ("de ontvangen berichten in de app zetten
// ... dit hoeft nog niet de bouw van het systeem te zijn"): dit is bewust
// het MINIMALE stuk — geen systemd-service, geen audio-pipeline in de app
// zelf. Lex draait zelf op lexdev-nw:
//   arecord -D hw:1,0 -f cd - | sox -t wav - -c 1 -r 11025 -t raw - vol 0.3 \
//     | navtex_rx_from_file 11025 | tee -a ~/navtex_berichten.txt
// en deze bron leest dat (aangroeiende, append-only) bestand gewoon uit bij
// elke pollcyclus. Zodra de Airspy HF Discovery er is (verwacht 2026-08-25)
// en er een écht systeem komt, kan dit bestand-tussenstuk blijven staan
// (zelfde argumentatie als in weer-navtex-en-eigen-radio-ontvangst.md: een
// bestand ertussen overleeft een herstart van beide kanten los) — alleen de
// commandoregel die ernaartoe schrijft verandert dan.
//
// navtex_rx_from_file blijkt zelf al één bericht per met-lege-regel(s)-
// omlijnd blok te leveren, ook als ZCZC/NNNN zelf corrupt binnenkwamen — dus
// hier gesplitst op lege regels i.p.v. strikt op /^ZCZC/ en /^NNNN$/ zoals
// het eerdere (nooit gebruikte) navtex-vangst.js-idee deed.
//
// BELANGRIJKE AFWIJKING t.o.v. navtex.js: bij een corrupt station-stationsdeel
// van de code (bv. "A60" i.p.v. "KA60" — de eerste letter compleet wegge-
// vallen door een bitfout) gokt dit bestand NIET welke letter het was, zoals
// een naïeve code[0]/code[1]-uitlezing zou doen (dat gaf voor "A60" verkeerd
// station 'A' = Portpatrick i.p.v. de werkelijk bedoelde 'K'). Alleen een
// code van het patroon [LETTER][LETTER][CIJFERS] wordt vertrouwd; bij minder
// wordt station/type bewust op onbekend gezet i.p.v. geraden. Zie
// leesStationEnType() hieronder.
//
// 2026-08-24, op verzoek van Lex ("uit de navtex meldingen bruikbare data
// gaan plotten op de zeekaart — posities, ranges, events") — grote uitbreiding:
// (1) dedup + "beste versie tot nu toe"-geheugen op berichtnummer i.p.v. per
// ontvangst een los signaal, (2) alle coordinaten in een bericht meenemen en
// classificeren als punt/lijn/polygoon (hergebruikt de bestaande
// gebiedPolygon/koerslijn-kaartlaag van app.js — zie tekenGebiedOmtrek()
// daar, geen nieuwe tekencode nodig), (3) een eerste event-classificatie op
// trefwoorden, (4) riglijst-berichten (meerdere platformposities in één
// bericht) uitgesplitst naar losse puntsignalen, (5) een vaste kleur per
// station voor onderscheid op de kaart. Expliciete afspraak met Lex: dit is
// een hobbyproject, een enkele onzekere positie is geen dealbreaker — bewust
// GEEN harde "weiger te plotten bij twijfel"-drempel zoals eerder overwogen,
// wel een `betrouwbaar`-vlag in detail zodat de kaart het ANDERS kan tonen
// (bv. gedimd) zonder het te verbergen.
import { readFileSync, existsSync, writeFileSync, statSync, openSync, readSync, closeSync, watchFile, unwatchFile } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { makeSignal, afstandKm, navtexErnst } from '../normalize.js';
import { meldNavtexNood } from '../navtexNoodAlarm.js'; // 2026-09-03: telefoonalarm voor type-D-berichten
import { levenshtein } from './navtexKustrapporten.js'; // 2026-09-10: bitfout-tolerant afzendernamen lezen, zie ZELF_IDENTIFICATIE hieronder

// Standaard: zelfde thuismap als waar Lex' eigen tee-commando naartoe
// schrijft (~/navtex_berichten.txt op lexdev-nw, waar de app-service ook
// draait — zie weer-app.service). NAVTEX_LOKAAL_BESTAND in .env overschrijft
// dit, mocht het pad ooit verhuizen.
const STANDAARD_BESTAND = path.join(homedir(), 'navtex_berichten.txt');
// 2026-08-25, op melding van Lex ("een hele rits is nu weer groen, van de
// eigen ontvangst") na een `syncweer`-herstart: EERSTE_ONTVANGST_PER_ID
// hieronder zat tot nu toe ALLEEN in het RAM van het proces, dus elke
// herstart (elke deploy, of een crash/reboot) wiste 'm helemaal — waardoor
// ieder datumloos bericht bij de eerstvolgende pollronde weer als "voor het
// eerst gezien" gold en dus (terecht volgens de code, maar onwenselijk voor
// Lex) massaal als NIEUW verscheen. Zelfde bestandsnaam-conventie als
// STANDAARD_BESTAND hierboven (naast navtex_berichten.txt in de thuismap),
// klein genoeg (een paar honderd entries × een ISO-tijdstip) om gewoon
// synchroon weg te schrijven bij elke nieuwe entry — geen queue/debounce
// nodig voor dit volume.
const EERSTE_ONTVANGST_BESTAND = path.join(homedir(), 'navtex_eerste_ontvangst.json');

// Zelfde stationslijst als navtex.js (overgenomen uit Lex' oorspronkelijke
// C:\Projects\navtex\stations.json), PLUS 'K'.
//
// 2026-08-23: live ontvangst op lexdev-nw gaf herhaaldelijk code "KA.." (68,
// 58, 53, 45) met inhoud die overduidelijk uit het Kanaal/Wight-gebied komt
// (Dover Strait, "WIGHT - PARC EOLIEN CENTRE MANCHE", doorgestuurde AVURNAV
// CHERBOURG-berichten) — precies Niton Radio's dekkingsgebied. navtex.js
// hieronder kent Niton Radio al toe aan letter 'E', maar dat kwam uit het
// prototype en is nooit tegen echte ontvangst geverifieerd (zie de comment
// daar). Station 'K' bestond nog niet in die lijst, dus hier toegevoegd i.p.v.
// 'E' te overschrijven. navtex.js zelf blijft bewust ongewijzigd — of 'E'
// daar ook naar 'K' moet, of dat beide écht bestaan (bv. voor verschillende
// berichttypes/tijdvakken), is aan Lex om te beslissen met meer ontvangst.
//
// 2026-08-24: `kleur` toegevoegd — op verzoek van Lex ("een aparte kleur
// voor elk station") voor onderscheid op de kaart (zie navtexStationKleur()
// in app.js). Handmatig verdeeld over het kleurenwiel, geen wiskundige
// afleiding — bewust andere hues dan de categorie-randkleuren elders in de
// app (zie styles.css) om verwarring met dat systeem te voorkomen.
// 2026-08-26, op verzoek van Lex ("kan ik dit schema niet ergens handig in
// de app beschikbaar hebben") — `zendschema` (UTC-uitzendtijden, 6x/dag)
// toegevoegd waar Lex 'm zelf heeft aangeleverd. BEWUST NIET zelf ingevuld/
// gegokt voor de overige stations hieronder (Portpatrick/Bodo/Torshavn/
// Egersund/Stockholm/Copenhagen/Den Helder/Grindavik/Brest/La Coruna/
// Lyngby) — een web-zoekopdracht leverde geen betrouwbare tijden op (en
// zelfs een afwijkende letter-toewijzing t.o.v. wat hieronder al vaststaat
// via Lex' eigen live ontvangst), en dit is veiligheidsrelevante info: beter
// hier leeg dan een gegokt schema tonen. `zendschema: null` => in de app
// gewoon "onbekend" i.p.v. een tijdenlijst. Zie eerstvolgendeUitzending() in
// app.js voor hoe dit gebruikt wordt.
export const STATIONS = [
  { id: 'V', naam: 'Oostende Radio (Britse zeegebieden/Kanaal)', land: 'BE', lat: 51.1823, lon: 2.8065, navarea: 'I', kleur: '#ff6b6b', zendschema: ['03:30', '07:30', '11:30', '15:30', '19:30', '23:30'] },
  // 2026-08-24, correctie van Lex ("T = Oostende NAVTEX, België... dit is
  // dus een Belgisch bericht voor hoofdzakelijk de Belgische kust en
  // Noordzee") — GEEN bitfout-verwarring met V (had ik eerst aangenomen),
  // maar een eigen, echt station: dezelfde zender (Oostende/Middelkerke)
  // zendt onder V voor Britse zeegebieden/het Kanaal, en onder T specifiek
  // voor de Belgische kustberichten. Zendschema (UTC): 03:10, 07:10, 11:10,
  // 15:10, 19:10, 23:10. Zelfde locatie als V aangehouden (fysiek dezelfde
  // zendmast) bij gebrek aan een aparte coördinaat voor T specifiek.
  { id: 'T', naam: 'Oostende NAVTEX (Belgische kustberichten)', land: 'BE', lat: 51.1823, lon: 2.8065, navarea: 'I', kleur: '#ff9ec4', zendschema: ['03:10', '07:10', '11:10', '15:10', '19:10', '23:10'] },
  // 2026-09-09, correctie: heette hier 'Scheveningen Radio' met de
  // coordinaat van Scheveningen. De Nederlandse NAVTEX wordt uitgezonden
  // vanuit Den Helder (Kustwacht NL); Scheveningen Radio bestaat als
  // kuststation al lang niet meer. Het projectdocument noemt 'P' overal
  // Den Helder -- alleen deze tabel liep nog achter, waardoor de pin ~130 km
  // te ver zuidelijk stond. Coordinaat is de plaatscoordinaat van Den Helder
  // (benadering, zelfde afspraak als bij S/Pinneberg en J/Gislovshammar).
  { id: 'P', naam: 'Den Helder (Kustwacht NL)', land: 'NL', lat: 52.96, lon: 4.76, navarea: 'I', kleur: '#ffb84c', zendschema: ['02:30', '06:30', '10:30', '14:30', '18:30', '22:30'] },
  { id: 'E', naam: 'Niton Radio', land: 'UK', lat: 50.6, lon: -1.3, navarea: 'I', kleur: '#ffe14c', zendschema: ['00:40', '04:40', '08:40', '12:40', '16:40', '20:40'] },
  // 'K': zelfde zender/dekkingsgebied als 'E' hierboven (Niton Radio), maar
  // in de live ontvangst kwam die letter herhaaldelijk als 'K' binnen i.p.v.
  // 'E' (zie de uitgebreide toelichting hoger in dit bestand) — vandaar een
  // los station-record, met dezelfde naam als 'E' (dit IS gewoon Niton
  // Radio, geen ander station) i.p.v. de eerdere per ongeluk zichtbare
  // debug-notitie in dit naam-veld zelf. Zendschema is de "K/Franse
  // berichten"-uitzending van Niton, dus een ANDER tijdvak dan 'E' hierboven.
  { id: 'K', naam: 'Niton Radio', land: 'UK', lat: 50.6, lon: -1.3, navarea: 'I', kleur: '#c8f04c', zendschema: ['01:40', '05:40', '09:40', '13:40', '17:40', '21:40'] },
  { id: 'G', naam: 'Cullercoats Radio', land: 'UK', lat: 55.0, lon: -1.4, navarea: 'I', kleur: '#6bf07a', zendschema: ['01:00', '05:00', '09:00', '13:00', '17:00', '21:00'] },
  // 2026-08-28, op vraag van Lex ("zitten deze stations al in het schema?"):
  // ontbrekende zendschema's ingevuld via de internationale 518 kHz-
  // letterformule (slotstart = letterpositie x 10 minuten, herhaald elke 4
  // uur). Geen gok: alle zeven schema's die al bevestigd in deze tabel
  // stonden (E 00:40, G 01:00, K 01:40, P 02:30, S 03:00, T 03:10, V 03:30)
  // volgen die formule exact.
  // 2026-08-28 (2e ronde), na Lex' screenshots ("Noorse Rekefjord-
  // waarschuwing gelabeld La Coruna", "Finse Golf gelabeld Brest"): zes
  // letters uit het oude prototype hingen aan het VERKEERDE station. De
  // eigen ontvangst was de scheidsrechter waar die er was: L-berichten gaan
  // over Jaeren/Rekefjord (= Rogaland), N over Trondheimsleia en het Noorse
  // weerbulletin (= Orlandet), F zegt letterlijk "PET NAV WARN" over de
  // Finse Golf (= Sint-Petersburg -- 1800 km nacht-DX). O/Q/M/H komen uit
  // externe stationslijsten (qsl.net PA2OHH, Peter's DX Corner): Portpatrick
  // is O (niet A), Malin Head is Q, Jeloya/Tjome is M, Bjuroklubb is H.
  // A, C, D en R zijn GESCHRAPT: geen enkele eigen ontvangst bevestigt ze --
  // de A/D-blokken in het bestand bleken corrupte kopieen van E-berichten
  // (identieke WZ-nummers) -- en een record met een gegokte mastpositie zou
  // berichten zonder eigen coordinaat op de verkeerde plek plotten. Zodra
  // er echte ontvangst met herkenbare inhoud voor zo'n letter binnenkomt,
  // krijgt 'ie alsnog een record (zelfde afspraak als destijds bij K/E).
  { id: 'B', naam: 'Bodo Radio', land: 'NO', lat: 67.283, lon: 14.383, navarea: 'I', kleur: '#4cd9f0', zendschema: ['00:10', '04:10', '08:10', '12:10', '16:10', '20:10'] },
  { id: 'N', naam: 'Orlandet Radio', land: 'NO', lat: 63.7, lon: 9.6, navarea: 'I', kleur: '#4c9df0', zendschema: ['02:10', '06:10', '10:10', '14:10', '18:10', '22:10'] },
  { id: 'L', naam: 'Rogaland Radio', land: 'NO', lat: 58.8, lon: 5.6, navarea: 'I', kleur: '#f0824c', zendschema: ['01:50', '05:50', '09:50', '13:50', '17:50', '21:50'] },
  { id: 'M', naam: 'Jeloya/Tjome Radio', land: 'NO', lat: 59.12, lon: 10.4, navarea: 'I', kleur: '#f04ca8', zendschema: ['02:00', '06:00', '10:00', '14:00', '18:00', '22:00'] },
  { id: 'O', naam: 'Portpatrick Radio', land: 'UK', lat: 54.85, lon: -5.12, navarea: 'I', kleur: '#7b4cf0', zendschema: ['02:20', '06:20', '10:20', '14:20', '18:20', '22:20'] },
  { id: 'Q', naam: 'Malin Head Radio', land: 'IE', lat: 55.37, lon: -7.34, navarea: 'I', kleur: '#e0c14c', zendschema: ['02:40', '06:40', '10:40', '14:40', '18:40', '22:40'] },
  { id: 'H', naam: 'Bjuroklubb Radio', land: 'SE', lat: 64.48, lon: 21.58, navarea: 'I', kleur: '#d94cf0', zendschema: ['01:10', '05:10', '09:10', '13:10', '17:10', '21:10'] },
  { id: 'F', naam: 'Sint-Petersburg Radio', land: 'RU', lat: 59.93, lon: 30.3, navarea: 'I', kleur: '#f04c6b', zendschema: ['00:50', '04:50', '08:50', '12:50', '16:50', '20:50'] },
  // 2026-08-26, toegevoegd op verzoek van Lex (had tot nu toe helemaal geen
  // record — stationscode 'S' ontbrak in deze lijst). Coördinaat is de
  // plaatscoördinaat van Pinneberg zelf (bij gebrek aan een preciezere
  // zendmastlocatie), net als bij de andere stations hierboven een
  // benadering, geen officieel opgegeven zendmastpositie.
  { id: 'S', naam: 'Pinneberg Radio', land: 'DE', lat: 53.652, lon: 9.797, navarea: 'I', kleur: '#8c8cf0', zendschema: ['03:00', '07:00', '11:00', '15:00', '19:00', '23:00'] },
  // 2026-09-01, op verzoek van Lex ("de stations moeten worden uitgebreid met
  // Gislövshammar, Zweden") -- live ontvangst gaf code 'J' (o.a. JA11, JA61)
  // met een Kaliningrad NAV WARN over de zuidoostelijke Oostzee (54-55N,
  // 019-020E, ~1058 km van Lex' locatie) -- precies het dekkingsgebied van
  // een Oostzee-coordinatiestation, dus geen bitfout-verwarring zoals bij
  // K/Niton. De internationale 518 kHz-lijst kent letter J toe aan
  // Gislovshammar Radio (roepletters SAA), Zweden, NAVAREA I. Coordinaat is
  // een benadering (kustdorp tussen Brantevik en Skillinge, Simrishamn) --
  // net als bij S/Pinneberg hierboven geen officieel opgegeven
  // zendmastpositie. Zendschema via dezelfde 518 kHz-letterformule als de
  // andere stations hierboven (letterpositie 10 x 10 min = 01:30).
  { id: 'J', naam: 'Gislövshammar Radio', land: 'SE', lat: 55.51, lon: 14.30, navarea: 'I', kleur: '#4cf0c8', zendschema: ['01:30', '05:30', '09:30', '13:30', '17:30', '21:30'] },
  // 2026-09-09, na eigen nacht-ontvangst: blok UE60 (091920 UTC SEP 26)
  // noemt zichzelf letterlijk 'MONDOLFO RADIO' en bevat de METEOMAR van het
  // weercentrum in Rome (Adriatische Zee, Tyrrheense Zee, westelijke
  // Middellandse Zee). Geen gok dus: het station identificeert zich in de
  // tekst, en de DTG 19:20 UTC valt exact op het U-slot van de 518 kHz-
  // letterformule. Eerste NAVAREA III-station in deze tabel; ~1105 km, komt
  // alleen 's nachts binnen via ruimtegolf. Coordinaat is de plaats
  // Mondolfo (Marche) -- benadering, zelfde afspraak als hierboven.
  { id: 'U', naam: 'Mondolfo Radio', land: 'IT', lat: 43.75, lon: 13.10, navarea: 'III', kleur: '#3fb0a0', zendschema: ['03:20', '07:20', '11:20', '15:20', '19:20', '23:20'] },
];
const STATION_PER_ID = new Map(STATIONS.map((s) => [s.id, s]));

// 2026-09-08, op verzoek van Lex ("vertel nog even over die 490 — die
// ontvangen we nog helemaal niet?" → "zeker!"): de tweede NAVTEX-frequentie,
// 490 kHz, nationale taal. Sinds vandaag als tweede tak in
// navtex_usb_demod.py (--extra 490000:~/navtex_berichten_490.txt, eigen
// decoder-proces). De stationsletters op 490 zijn een ANDERE toewijzing dan
// op 518 (B is hier Oostende, op 518 Bodø) — vandaar een eigen tabel en een
// eigen lookup per band. Zendschema via dezelfde letterformule (positie ×
// 10 min, elke 4 uur). Alleen de stations opgenomen waarvan de 490-letter
// zeker is; een onbekende letter valt gewoon terug op "station X
// (onbevestigd)", zoals op 518.
export const STATIONS_490 = [
  { id: 'B', naam: 'Oostende NAVTEX 490 (Nederlandstalig)', land: 'BE', lat: 51.1823, lon: 2.8065, navarea: 'I', kleur: '#ff9ec4', zendschema: ['00:10', '04:10', '08:10', '12:10', '16:10', '20:10'] },
  // 2026-09-08 (avond) live gezien: Frans op 490-T in hetzelfde slot als
  // 518-T (19:10 UTC: "BULLETIN SUD MER DU NORD", TA69 Ruytingen) — toen
  // voor Oostende aangezien. 2026-09-09 gecorrigeerd na check van de
  // stationslijst (Wikipedia "List of Navtex stations"): 490-T is NITON
  // (NAVAREA II, 03:10/07:10/…/23:10 UTC), die in het Frans het MSI van
  // CROSS Gris-Nez uitzendt voor het Nauw van Calais ("PAS DE CALAIS - DST
  // DU PAS DE CALAIS"). Oostende zit op 490 alleen onder B. Dat het slot
  // samenvalt met 518-T is gewoon de letterformule (T = 03:10 + n*4h), geen
  // aanwijzing voor dezelfde zender.
  { id: 'T', naam: 'Niton Radio 490 (Frans, MSI Gris-Nez)', land: 'UK', lat: 50.6, lon: -1.3, navarea: 'II', kleur: '#ffc4e0', zendschema: ['03:10', '07:10', '11:10', '15:10', '19:10', '23:10'] },
  { id: 'I', naam: 'Niton Radio 490', land: 'UK', lat: 50.6, lon: -1.3, navarea: 'I', kleur: '#ffe14c', zendschema: ['01:20', '05:20', '09:20', '13:20', '17:20', '21:20'] },
  // U: 2026-09-08 bevestigd (kustrapporten-tabel Lerwick…Sandettie om 19:20 UTC)
  { id: 'U', naam: 'Cullercoats Radio 490', land: 'UK', lat: 55.0, lon: -1.4, navarea: 'I', kleur: '#6bf07a', zendschema: ['03:20', '07:20', '11:20', '15:20', '19:20', '23:20'] },
  { id: 'C', naam: 'Portpatrick Radio 490', land: 'UK', lat: 54.85, lon: -5.12, navarea: 'I', kleur: '#7b4cf0', zendschema: ['00:20', '04:20', '08:20', '12:20', '16:20', '20:20'] },
  { id: 'L', naam: 'Pinneberg Radio 490 (Duitstalig)', land: 'DE', lat: 53.652, lon: 9.797, navarea: 'I', kleur: '#8c8cf0', zendschema: ['01:50', '05:50', '09:50', '13:50', '17:50', '21:50'] },
  { id: 'E', naam: 'CROSS Corsen 490 (Franstalig)', land: 'FR', lat: 48.41, lon: -4.79, navarea: 'II', kleur: '#4cd9f0', zendschema: ['00:40', '04:40', '08:40', '12:40', '16:40', '20:40'] },
  // 2026-09-10, eigen nacht-ontvangst: vijf blokken (EA02, EA06, EA07, EA08,
  // EA09) met DTG '100040 UTC SEP 26' en kopregel 'MONDOLFO RADIO' —
  // COSTAVURNAV/NAVAREA III-inhoud over de Adriatische Zee. De DTG valt exact
  // op het E-slot van de letterformule (00:40 + n x 4h). Daarmee is de
  // 490-letter van Mondolfo beantwoord: E. Alleen: die letter is hierboven al
  // van CROSS Corsen (Bretagne). Dat is geen fout in een van beide — de
  // NAVTEX-letters worden PER NAVAREA opnieuw uitgedeeld, en 's nachts halen
  // we via ruimtegolf allebei de gebieden. Vandaar dit record onder een eigen
  // sleutel 'E-IT': GEEN uitzendletter, maar een intern id voor groepering en
  // weergave. Het wordt nooit via de letter gevonden (de Map hieronder houdt
  // 'E' = Corsen), alleen als het blok zichzelf 'MONDOLFO RADIO' noemt —
  // zie ZELF_IDENTIFICATIE_490. Zonder zelfnoeming blijft E dus Corsen: dat
  // is de gedocumenteerde toewijzing, en liever de bekende dan een gok.
  { id: 'E-IT', naam: 'Mondolfo Radio 490 (Italiaanstalig)', land: 'IT', lat: 43.75, lon: 13.10, navarea: 'III', kleur: '#3fb0a0', zendschema: ['00:40', '04:40', '08:40', '12:40', '16:40', '20:40'] },
  // 2026-09-10, zelfde nacht: een blok met verminkte kop ("ZCZC FA'0;10050 U
  // C EC )6") maar leesbare afzenderregel 'SQLAT RADIO' = SPLIT RADIO, en
  // Kroatische tekst (JADRAN, ZABRANJENE SVE AKTIVNOSTI, PLJUSAK S
  // GRMLJAVINOM) over een explosief object voor de Dalmatische kust. De DTG
  // '10050 U C' = 100050 UTC valt op het F-slot (00:50 + n x 4h) en 'FA' is
  // nog leesbaar in de kop. ~1150 km, de verste eigen ontvangst tot nu toe,
  // alleen 's nachts. Coordinaat is de plaats Split (benadering, zelfde
  // afspraak als bij de andere stations hierboven). NB: F is op 518 kHz
  // Sint-Petersburg — andere band, andere tabel, geen botsing.
  { id: 'F', naam: 'Split Radio 490 (Kroatisch)', land: 'HR', lat: 43.51, lon: 16.44, navarea: 'III', kleur: '#f0a04c', zendschema: ['00:50', '04:50', '08:50', '12:50', '16:50', '20:50'] },
];
const STATION_PER_ID_490 = new Map(STATIONS_490.map((s) => [s.id, s]));

// 2026-09-10 — een station dat zichzelf in de kop noemt wint van de letter.
// Twee aanleidingen in dezelfde nacht:
//  (1) 'E' op 490 is zowel CROSS Corsen (gedocumenteerd) als Mondolfo
//      (eigen ontvangst) — de letters worden per NAVAREA opnieuw uitgedeeld.
//      De enige harde scheidsrechter is de afzenderregel in het bericht zelf.
//  (2) Split Radio kwam binnen met een verminkte ZCZC, waardoor er helemaal
//      geen leesbare letter was, maar met een wel leesbare (zij het
//      bitfout-houdende) naam 'SQLAT RADIO'.
// Bewust smal gehouden, want dit overschrijft de afzender:
//  - alleen de eerste drie regels van een blok tellen mee (codelijn,
//    datumregel, eerste bodyregel), zodat een bericht dat een ander station
//    NOEMT ('RELAYED FROM ...') de afzender niet kan kapen;
//  - de naam moet direct voor het woord RADIO staan;
//  - max 2 tekens afwijking, en nooit fuzzy onder de 5 tekens — dezelfde
//    regel als bij de stationsnamen in navtexKustrapporten.js;
//  - alleen zenders die we zelf bevestigd ontvangen hebben.
const ZELF_IDENTIFICATIE_518 = [
  { naam: 'MONDOLFO', id: 'U' },
];
const ZELF_IDENTIFICATIE_490 = [
  { naam: 'MONDOLFO', id: 'E-IT' },
  { naam: 'SPLIT', id: 'F' },
];

const gemeldZelfIdentificatie = new Set();

function zoekZelfIdentificatie(kop, lijst, stations) {
  if (!lijst?.length || !kop) return null;
  const schoon = kop.toUpperCase().replace(/[^A-Z\s]/g, ' ');
  for (const treffer of schoon.matchAll(/([A-Z]{4,12})\s*RADIO\b/g)) {
    const gelezen = treffer[1];
    for (const { naam, id } of lijst) {
      if (gelezen !== naam) {
        if (naam.length < 5) continue;
        if (levenshtein(gelezen, naam) > 2) continue;
      }
      const station = stations.get(id);
      if (!station) continue;
      if (gelezen !== naam && !gemeldZelfIdentificatie.has(gelezen)) {
        gemeldZelfIdentificatie.add(gelezen);
        console.log(`[weer] navtexLokaal: afzender "${gelezen} RADIO" gelezen als "${naam}" (${station.naam})`);
      }
      return station;
    }
  }
  return null;
}

const STATION_KLEUR_ONBEKEND = '#9aa0b4'; // zelfde neutraal-grijs als de BEVESTIGD-pil elders — "geen idee welk station"

const TYPE_OMSCHRIJVING = {
  A: 'Navigatiewaarschuwing',
  B: 'Weerwaarschuwing',
  C: 'IJsbericht',
  D: 'SAR / piraterij',
  E: 'Weersverwachting',
  F: 'Loodsdienst',
  J: 'SATNAV-waarschuwing',
  L: 'Aanvullende navigatiewaarschuwing',
  V: 'Kennisgeving aan vissers',
};

// 2026-08-24-verbreding, op verzoek van Lex ("ik denk dat we ruimer moeten
// parsen, een wegvallende punt etc") — bleek nodig tegen zijn eigen
// testbestand: TA12/TA11 schreven de minuten-breuk met een "-" of ","
// i.p.v. een "." (bv. "51-21-663N", "51 17,352N", bitfout-achtige
// verminking van het decimaalteken). Was voorheen alleen een letterlijke
// punt (\.\d+); nu ook komma/streepje toegestaan op die plek — de
// buiten-scheiding tussen graden en minuten (het eerste [°\-., ]? hieronder)
// bestond al wel uit die klasse. Genormaliseerd (komma/streepje -> punt)
// vóór Number() in coordinatenIn()/splitsRiglijst() hieronder, want
// Number("21-663") zelf is NaN.
// 2026-08-26-fix, gevonden tijdens het testen van de riglijst-naam-vóór-
// coördinaat-splitsing (MSI 214/26, platform "N7-FA-1 53-30N 006-14E"):
// zonder onderstaande lookbehind matchte dit patroon per ongeluk vanaf de
// LOSSE "1" aan het eind van de platformnaam ("...FA-1"), gevolgd door een
// spatie en toen "53-30" — waarbij het "-30"-stuk werd gelezen als het
// minuten-decimaal (dezelfde constructie als bij "51-21-663N" hierboven,
// zie de toelichting bij normaliseerMinuten()). Resultaat: platform
// N7-FA-1 kreeg lat≈1.9 (Golf van Guinea) i.p.v. het echte 53-30N (Noordzee)
// — een verkeerde match, geen corrupte ontvangst. Lookbehind zorgt dat een
// coördinaat alleen kan BEGINNEN als het niet direct aan een letter/cijfer/
// koppelteken vastplakt (dus wel na spatie, aanhalingsteken, dubbele punt,
// komma, etc. — precies zoals elk echt coördinaat in de praktijkvoorbeelden
// hierboven al staat); de bestaande "51-21-663N"/"49-8.43N"-corruptiegevallen
// blijven onaangetast, want die staan altijd los (na spatie/aanhalingsteken),
// nooit direct tegen een ander alfanumeriek teken aan.
const COORD_REGEX = /(?<![A-Za-z0-9-])(\d{1,2})[°\-., ]?(\d{1,2}(?:[.,\-]\d+)?)?\s*([NS])\s*(\d{1,3})[°\-., ]?(\d{1,2}(?:[.,\-]\d+)?)?\s*([EW])/gi;
// Normaliseert een minuten-string als "21-663" of "17,352" naar "21.663"/
// "17.352" zodat Number() 'm goed leest — zie de comment bij COORD_REGEX.
function normaliseerMinuten(tekst) {
  return (tekst ?? '0').replace(/[,\-]/, '.');
}
const DATUM_REGEX = /(\d{2})(\d{2})(\d{2})\s*UTC\s*([A-Z]{3})\s*(\d{4}|\d{2})/i;
const MAANDEN = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };

// 2026-08-24-fix, op melding van Lex: dezelfde datum-terugval (zie
// datumIn/parseBlok hieronder) toegepast op de HELE body pakte bij AVURNAV
// CHERBOURG-berichten (geen eigen NAVTEX-DTG-regel, wel een geldigheids-
// venster in de tekst) soms een GELDIGHEIDS- of CANCEL-datum i.p.v. de echte
// verzenddatum — bv. "FROM 142200 UTC JUL 26 TO 152159 UTC SEP 26" (begin/
// einde geldigheid) of "CANCEL THIS MSG 152359 UTC SEP 26". Beide zijn
// herkenbaar aan het woord vlak ervoor. Losse 'g'-variant van DATUM_REGEX
// (i.p.v. die zelf 'g' te geven — elders in dit bestand wordt datumIn() met
// een niet-globale .exec() gebruikt, en dat door elkaar laten lopen met een
// gedeelde, stateful lastIndex is vragen om subtiele bugs) zodat hieronder
// ALLE matches in de body langsgegaan kunnen worden i.p.v. alleen de eerste.
const DATUM_REGEX_ALLE = /(\d{2})(\d{2})(\d{2})\s*UTC\s*([A-Z]{3})\s*(\d{4}|\d{2})/gi;
const DATUM_UITSLUITING_ERVOOR = /\b(FROM|TO|CANCEL|VALID)\s*$/i;
function datumInBodyZonderGeldigheidsclausules(tekst) {
  DATUM_REGEX_ALLE.lastIndex = 0;
  let m;
  while ((m = DATUM_REGEX_ALLE.exec(tekst)) !== null) {
    const ervoor = tekst.slice(Math.max(0, m.index - 12), m.index);
    if (DATUM_UITSLUITING_ERVOOR.test(ervoor)) continue; // "FROM"/"TO"/"CANCEL"/"VALID" vlak ervoor -- geen verzenddatum
    const [, dag, uur, min, maandTekst, jaarTekst] = m;
    const maand = MAANDEN[maandTekst.toUpperCase()];
    if (maand == null) continue;
    const jaar = jaarTekst.length === 2 ? 2000 + Number(jaarTekst) : Number(jaarTekst);
    const datum = new Date(Date.UTC(jaar, maand, Number(dag), Number(uur), Number(min), 0));
    if (!Number.isNaN(datum.getTime())) return datum;
  }
  return null;
}

// 2026-08-24: grove plausibiliteitsbox rond het ontvangstgebied, oorspronkelijk
// puur om `positieBinnenBereik` te kunnen zetten (duidelijk-onzeker punt anders
// tonen dan een plausibel punt).
// 2026-08-28-herzien, samen met het loslaten van de 450km-grens (op verzoek
// van Lex): de box is nu WEL een harde drempel geworden — hij is het enige
// vangnet dat corrupte coördinaten ("94N", "204W", "0N 2E") nog van de kaart
// houdt nu de afstandsgrens weg is. Daarom ook verruimd tot alles wat de
// antenne realistisch kán halen: La Coruña (43N) tot Noordkaap (71N), de
// Atlantische Met Office-gebieden (-22W gezien in echte ontvangst) tot en
// met de Finse Golf (23.6E gezien in echte ontvangst).
const PLAUSIBEL_BOX = { latMin: 35, latMax: 72, lonMin: -30, lonMax: 32 };
function positiePlausibel(p) {
  return p.lat >= PLAUSIBEL_BOX.latMin && p.lat <= PLAUSIBEL_BOX.latMax && p.lon >= PLAUSIBEL_BOX.lonMin && p.lon <= PLAUSIBEL_BOX.lonMax;
}

function hashTekst(tekst) {
  let h = 0;
  for (let i = 0; i < tekst.length; i++) h = (h * 31 + tekst.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

function coordinatenIn(tekst) {
  const coords = [];
  let match;
  COORD_REGEX.lastIndex = 0;
  while ((match = COORD_REGEX.exec(tekst)) !== null) {
    const lat = (Number(match[1]) + Number(normaliseerMinuten(match[2])) / 60) * (match[3].toUpperCase() === 'S' ? -1 : 1);
    const lon = (Number(match[4]) + Number(normaliseerMinuten(match[5])) / 60) * (match[6].toUpperCase() === 'W' ? -1 : 1);
    if (Number.isFinite(lat) && Number.isFinite(lon)) coords.push({ lat: +lat.toFixed(6), lon: +lon.toFixed(6) });
  }
  return coords;
}

// 2026-08-24-fix, op melding van Lex (screenshot: een lange roze streep dwars
// over de hele Noordzee) — root cause KA58: de brontekst had op één plek
// "494/.73N 00-39.84W" (bitfout-verminking van iets als "49-46.73N ..."),
// en COORD_REGEX zoekt niet vanaf een vaste startpositie maar overal in de
// tekst — vond hier alleen het restje "73N" terug als een op zichzelf
// geldige coordinaat (73°N, 0-39.84W). Dat punt zit zelfs BUITEN de
// PLAUSIBEL_BOX (43-68°N), maar die check wordt alleen op het EERSTE punt
// van een bericht toegepast (voor de afstand-tot-jou), niet op elk punt in
// een meerpuntsgebied. Bij het sluiten van de AREA BOUNDED BY-polygoon
// sprong de rand daardoor van Cherbourg (49-50°N) naar voorbij Noord-
// Noorwegen en terug.
//
// 2026-08-24, herzien na een valse-positieve op UKHO (Lex: "erg toevallig
// dat ukho net weer weg is na je laatste aanpassing"): de EERSTE versie
// vergeleek elk punt met een "mediaanpunt" waarvan de lat en lon ONAFHANKELIJK
// van elkaar bepaald werden (aparte sort op lat, aparte sort op lon). Voor een
// hechte klomp punten (zoals KA58) valt dat toevallig binnen de klomp, maar
// voor een gebied dat een langwerpige vorm heeft (bv. een langgerekt
// oefengebied of een hoek-tot-hoek rechthoek, zoals bij sommige UKHO/NAVAREA
// I-meldingen die een veel groter zeegebied bestrijken dan een lokale
// AVURNAV-melding) kan dat "mediaanpunt" een fictieve locatie zijn die bij
// GEEN van de echte punten in de buurt ligt — met als gevolg dat legitieme
// hoekpunten er ten onrechte uitgefilterd werden. Nieuwe aanpak: per punt de
// afstand tot z'n DICHTSTBIJZIJNDE ANDERE punt in dezelfde melding nemen i.p.v.
// afstand tot een samengesteld mediaanpunt — dat werkt voor elke vorm (klomp,
// langgerekte lijn, rechthoek), want een echt corrupt punt (zoals de 73°N-
// uitschieter, >2000km van alles) staat nooit dicht bij ÉÉN van de andere
// punten, terwijl een legitiem hoekpunt van een groot gebied bijna altijd wel
// een naburig punt binnen een paar honderd km heeft. Drempel op 350km gezet:
// ruim boven wat een reëel NAVAREA I/UK Coastal-gebied tussen twee punten kan
// hebben, ruim onder wat een corrupt fragment doorgaans oplevert. Bewust NIET
// toegepast op riglijst-posities (splitsRiglijst hieronder) — platforms in
// één riglijst-bericht kunnen legitiem honderden km uit elkaar liggen, dat is
// geen corruptie.
const UITSCHIETER_DREMPEL_KM = 350;
// 2026-08-26-uitbreiding, op melding van Lex (screenshot: een waaier roze
// stippellijnen vanaf het Kanaal tot diep Normandie/tot voorbij Angers,
// "iets met de slechte ontvangst van Niton Radio?") -- root cause KA53
// (AVURNAV CHERBOURG via Niton Radio, vrijwel de hele body gecorrumpeerd:
// "49-8.43N 0.0-33.?9W", "45-46.68 , :00-40.082" etc.): van al die
// halfcorrupte fragmenten hield COORD_REGEX er hier toevallig maar 2 over
// die ALSNOG als geldige coordinaat oogden -- een bij de bedoelde locatie
// (~49.7-49.8N) en een tientallen/honderden km daarvandaan (de "45-46.68"
// hierboven is vermoedelijk zelf ook al een corrupte "49-46.68"). De
// hoofdfunctie hierboven miste dit soort paren compleet: "dichtstbijzijnde
// ander punt" is bij precies 2 punten altijd gewoon "het andere punt", dus
// kan die aanpak nooit onderscheiden WELKE van de twee de uitschieter is --
// vandaar de expliciete `< 3`-terugval die dit paar altijd ongemoeid liet.
// Voor precies 2 punten kán je dat onderscheid inderdaad niet maken, maar
// je kunt wel zien dat ze SAMEN te ver uit elkaar liggen: bij deze bron
// (kleine lokale kustmeldingen, zie UITSCHIETER_DREMPEL_KM hierboven) is
// >350km tussen de enige twee punten van een melding op zichzelf al net zo
// onwaarschijnlijk als de bestaande 3+ puntscheck aanneemt. Dan liever
// BEIDE laten vallen (het signaal valt terug op positieIsStation -- een
// radiomast-icoon bij het zendstation, zie fetchNavtexLokaal hieronder) dan
// een lijn/gebied tekenen dat net zo goed op het foute punt kan steunen.
function verwijderUitschieters(coords) {
  if (coords.length < 2) return coords; // 0 of 1 punt: sowieso niets om te vergelijken/filteren, blijft ongemoeid
  // 2026-08-26-verdieping: bij het KA53/Niton-onderzoek hierboven bleek ÉÉN
  // gecorrumpeerd bericht ("AVURNAV CHERBOURG 53/26", bij herhaling ontvangen
  // met wisselende bitfouten) meerdere keren compleet onzinnige coordinaten
  // op te leveren -- niet alleen ver weg (het 2-puntsgeval hierboven), maar
  // ook regelrecht onmogelijke breedtegraden zoals 94N (>90, kan niet
  // bestaan) of kansloos ver weg zoals 8N/22N (equatoriaal, mijlenver van elk
  // NAVAREA I-station). Die laatste soort is GEVAARLIJKER dan een simpele
  // uitschieter: in één voorbeeld leverde de tekst toevallig TWEE van zulke
  // onzinpunten op (allebei rond 8N, ~65km van elkaar) die daardoor voor de
  // dichtstbijzijnde-ander-punt-check hieronder een "buurpunt binnen 350km"
  // hadden -- ELKAAR dus, in plaats van bij het echte kustpunt. Zo'n paar
  // overleeft die check dus ONGEFILTERD, ook al liggen beide punten mijlenver
  // van waar het bericht daadwerkelijk over gaat. Vandaar nu eerst een harde
  // check op individuele plausibiliteit (dezelfde PLAUSIBEL_BOX als
  // positieBinnenBereik hierboven gebruikt) VOORDAT de onderlinge-afstand-
  // vergelijking draait -- dat kan twee onzinpunten die elkaar "beschermen"
  // nooit meer laten samenspannen. Bewust niet toegepast op berichten met
  // maar 1 punt (regel hierboven): dat blijft de bestaande, met Lex
  // afgesproken lichte aanpak (een onzeker éénpuntsbericht wordt getoond,
  // niet geweigerd) -- deze extra check geldt alleen binnen de
  // geometrie-uitschieterlogica, die al een bewuste, eerder afgesproken
  // uitzondering op die regel is (zie de 2026-08-24-toelichting hierboven
  // bij UITSCHIETER_DREMPEL_KM/de eerste versie van deze functie).
  const basis = coords.filter(positiePlausibel);
  if (basis.length === 2) {
    return afstandKm(basis[0].lat, basis[0].lon, basis[1].lat, basis[1].lon) <= UITSCHIETER_DREMPEL_KM ? basis : [];
  }
  if (basis.length < 3) return basis; // 0 of 1 plausibel punt over: niets meer om te vergelijken
  return basis.filter((c) => {
    const afstandTotDichtstbijzijnde = Math.min(
      ...basis.filter((o) => o !== c).map((o) => afstandKm(c.lat, c.lon, o.lat, o.lon))
    );
    return afstandTotDichtstbijzijnde <= UITSCHIETER_DREMPEL_KM;
  });
}

function datumIn(tekst) {
  const m = DATUM_REGEX.exec(tekst);
  if (!m) return null;
  const [, dag, uur, min, maandTekst, jaarTekst] = m;
  const maand = MAANDEN[maandTekst.toUpperCase()];
  if (maand == null) return null;
  const jaar = jaarTekst.length === 2 ? 2000 + Number(jaarTekst) : Number(jaarTekst);
  const datum = new Date(Date.UTC(jaar, maand, Number(dag), Number(uur), Number(min), 0));
  return Number.isNaN(datum.getTime()) ? null : datum;
}

// Zie de "BELANGRIJKE AFWIJKING"-comment bovenaan: alleen vertrouwen als de
// code overtuigend [LETTER][LETTER][CIJFERS] is. Bij twijfel liever
// station/type onbekend dan een verkeerd station tonen.
function leesStationEnType(code) {
  const m = /^([A-Z])([A-Z])(\d{1,3})/.exec(code);
  if (!m) return { stationId: null, typeLetter: null };
  return { stationId: m[1], typeLetter: m[2] };
}

// 2026-08-24, op verzoek van Lex ("berichten die herhaald worden herkennen
// aan het bericht-ID, want we willen wel deduppen") — de dedup-sleutel is
// het VOLLEDIGE gevalideerde code-patroon (station+onderwerp+volgnummer,
// bv. "KA68"), dus inclusief stationsletter.
//
// EERSTE VERSIE liet de stationsletter hier bewust weg (idee: die valt bij
// bitfouten het eerst weg, bv. "A60" i.p.v. "KA60", dus onderwerp+volgnummer
// zou stabieler zijn). Tegen Lex' eigen testbestand aangehouden bleek dat
// idee zelf een bug te veroorzaken i.p.v. 'm op te lossen: leesStationEnType()
// hierboven eist AL BEIDE letters voordat 'ie typeLetter uberhaupt teruggeeft
// — bij een weggevallen stationsletter is typeLetter dus toch al null, dus
// de sleutel zonder stationsletter hielp dat geval helemaal niet. Wat het WEL
// deed: in dit tien-berichten-testbestand kregen KA45 (Niton, wetenschappelijk
// instrument, 1 punt) en PA45 (Scheveningen, TSS-survey-gebied, 4 punten) toevallig
// hetzelfde volgnummer (45) voor hetzelfde onderwerp (A) — met de losse
// sleutel smolten die ten onrechte samen en verdween het PA45-gebied
// stilletjes. Vandaar terug naar de volledige, gevalideerde code als sleutel:
// geen cross-station-botsing meer, en de eigenlijke "kwaliteit oploopt bij
// retransmissie"-winst (zie kwaliteitsScore hieronder) geldt nog steeds voor
// het courantere geval waarbij de code wél stabiel goed gelezen wordt maar de
// BODY/coordinaten tussen ontvangsten verschillen in volledigheid.
function dedupSleutel(code, typeLetter) {
  if (!typeLetter) return null; // typeLetter is alleen gezet als leesStationEnType() BEIDE letters vertrouwde
  return code;
}

// "Kwaliteit" van een geparsete instantie. Simpel met opzet (zie de
// score-vergelijking in smeltSamenOpBesteVersie hieronder) — geen poging om
// coordinaten van verschillende ontvangsten van hetzelfde bericht met elkaar
// te MENGEN (dat is riskanter dan het waard is: bij een afwijkend
// aantal/volgorde is niet zeker genoeg welk punt bij welk punt hoort),
// alleen om de beste HELE instantie tot nu toe te bewaren. Drie signalen,
// zwaarst-eerst:
// 1. Aantal gevonden coördinaten — meer coördinaten = waarschijnlijker een
//    vollediger/schonere ontvangst van hetzelfde bericht (oorspronkelijke,
//    enige maatstaf).
// 2. 2026-08-25-uitbreiding, gevonden tijdens het testen tegen PA11/13/14/15
//    (consolideerOpInhoud hieronder): een gehavende ontvangst mist vaak OOK
//    een leesbare datumregel (PA11: "UTC JUL 2" i.p.v. "UTC JUL 26") zonder
//    dat dat de coördinaten-telling raakt — dus een tweede, onafhankelijk
//    signaal van ontvangstkwaliteit.
// 3. 2026-08-25-uitbreiding #2, op melding van Lex ("is dit het beste
//    bericht uit die serie?" bij een verder prima leesbare PA13/PA15-tekst
//    met rommel ná de NNNN-afsluiting: "...NNNN LJSPWKFOYAAAA...ZA"): de
//    NNNN-strip in parseBlok hierboven werkt alleen als NNNN écht aan het
//    eind staat (`\s*$`) — bij rommel NA de NNNN faalt die match stilzwijgend
//    en blijft "NNNN <rommel>" gewoon in de body zitten. Dat is zichtbaar
//    zonder de coördinaten of de datumregel te raken, dus ook dát is een
//    eigen, onafhankelijk kwaliteitssignaal: een body zonder achtergebleven
//    "NNNN" wint van een verder even goede body mét.
// 4. 2026-09-05-uitbreiding, op melding van Lex (screenshot na de eerste
//    Airspy-dag: een boei midden in Normandië en een waaier lijnen vanaf
//    Cherbourg, uit Niton-berichten met SUBTIELE bitfouten: "51!04,3'N",
//    "49-46.73C", "U: '30 26"): een verminkt cijfer dat een punt 50-100 km
//    verschuift blijft BINNEN de 350km-uitschieterdrempel en raakt dus de
//    coördinaten-telling niet — twee versies scoorden gelijk en de tiebreak
//    (nieuwste tekst wint) besliste, niet de kwaliteit. Daarom twee lichte,
//    onafhankelijke signalen die alleen als TIEBREAK werken (samen < 2, dus
//    nooit zwaarder dan de datum, laat staan dan één coördinaat):
//    a. compactheid: hoe dicht de punten bij hun zwaartepunt liggen (kleine
//       kustmeldingen liggen compact; een verschoven punt vergroot de spreiding);
//    b. rommel: aantal tekens dat in SITOR-B/ITA2 überhaupt niet voorkomt
//       (bv. '!', '"', '%', kleine letters) — die kunnen alleen uit bitfouten
//       komen, dus elk exemplaar is een zekere ontvangstfout.
//    Bewust geen kustlijn-/op-zee-check (geen kaartdata in de backend) en
//    bewust GEEN harde afwijzing: een versie met rommel wordt nog steeds
//    getoond zolang er geen betere is (afspraak: tonen, niet weigeren).
const ITA2_VREEMD_REGEX = /[^A-Z0-9 \r\n.,:;()'\/+\-=?]/g;
function compactheid(coords) {
  if (coords.length < 2) return 1; // niets te spreiden: neutraal, gelijk voor elke versie
  const cLat = coords.reduce((som, c) => som + c.lat, 0) / coords.length;
  const cLon = coords.reduce((som, c) => som + c.lon, 0) / coords.length;
  const spreiding = Math.max(...coords.map((c) => afstandKm(c.lat, c.lon, cLat, cLon)));
  return 1 - Math.min(1, spreiding / UITSCHIETER_DREMPEL_KM);
}
function rommelGraad(body) {
  const aantal = (body.match(ITA2_VREEMD_REGEX) || []).length;
  return Math.min(1, aantal / 10);
}
// 2026-09-06, op melding van Lex (KA69 Niton, 38x ontvangen, toch "datum
// onzeker" met als gekozen versie regel 2 = "DOVER - '$9;34 '54-85" terwijl
// 26 ontvangsten letterlijk identiek "DOVER - DOVER STRAIT" gaven): een
// verminkte regel kan toevallig als coördinaat parsen en daarmee +4 scoren,
// meer dan 26 schone kopieën samen. Daarom `aantalIdentiek`: hoeveel
// ontvangsten in dit bestand EXACT dezelfde tekst hebben. Ruis is nooit twee
// keer hetzelfde, dus veel identieke kopieën is het sterkste bewijs van een
// schone versie -- afgetopt op 8 zodat het niet alles overstemt.
function kwaliteitsScore(bericht, aantalIdentiek = 1) {
  const schoneAfsluiting = /NNNN/i.test(bericht.body) ? 0 : 1;
  return bericht.coords.length * 4 + (bericht.datum ? 2 : 0) + schoneAfsluiting
    + 0.9 * compactheid(bericht.coords) - 0.9 * rommelGraad(bericht.body)
    + 1.5 * Math.min(Math.max(aantalIdentiek, 1), 8);
}

// Module-scoped (niet per pollcyclus gereset) geheugen: dedup-sleutel naar de
// beste tot nu toe geziene instantie van dat bericht. Overleeft zolang de
// backend-service draait. Bewust GEEN eigen ouderdomsvenster erbovenop — het
// bestaande 48u-verlopen-mechanisme elders in de app (zie historie.js) ruimt
// oude signalen toch al op, en het bestand zelf is append-only dus een
// volgnummer dat morgen opnieuw gebruikt wordt hoort automatisch bij een
// andere `datum` (die zit al in de signal-id verderop) en botst dus niet.
const BESTE_VERSIE_PER_SLEUTEL = new Map();

// 2026-08-24-fix, op melding van Lex ("deze meldingen onmogelijk nieuw
// kunnen zijn... alle testmeldingen zijn nu groen"): root cause was dat
// `tijd` hieronder bij een onherkenbare datum terugviel op `new Date()` —
// ELKE pollronde opnieuw. Bij deze ruizinge testontvangst (zie het
// bestandshoofd) is dat geen uitzondering maar de regel: veel blokken (bv.
// de AVURNAV CHERBOURG-relaisberichten) hebben helemaal geen herkenbare
// datumregel — "AVURNAV CHERBOURG 0/26" op regel 2 is een referentienummer,
// geen DTG. Zo'n bericht kreeg dus bij elke pollronde een compleet nieuwe
// "tijd", bleef daardoor voor altijd bovenaan de tijd-gesorteerde lijst
// staan, en werd dus permanent als "nieuw" gemarkeerd — ook al zijn het
// letterlijk de eerste testberichten van gisteren. Fix: een stabiel "voor
// het eerst gezien op"-moment per signaal-ID, één keer gezet bij de eerste
// pollronde waarin dat ID voorkomt en daarna nooit meer overschreven — zie
// het gebruik verderop (tijd: b.datum ? ... : eersteOntvangst(...)).
// Zelfde "geen eigen opruiming"-afweging als BESTE_VERSIE_PER_SLEUTEL
// hierboven (het bestaande 48u-verlopen-mechanisme in historie.js ruimt de
// zichtbare signalen toch al op).
// 2026-08-25-uitbreiding: bij opstarten ingeladen vanaf EERSTE_ONTVANGST_BESTAND
// (zie hierboven) i.p.v. altijd leeg te beginnen — zodat een herstart
// (`syncweer`, crash, reboot) niet meer elk datumloos bericht opnieuw als
// "voor het eerst gezien" behandelt. Ontbrekend/corrupt bestand -> gewoon
// leeg beginnen, zoals voorheen (geen harde afhankelijkheid van dit bestand).
const EERSTE_ONTVANGST_PER_ID = (() => {
  try {
    if (!existsSync(EERSTE_ONTVANGST_BESTAND)) return new Map();
    const ruw = JSON.parse(readFileSync(EERSTE_ONTVANGST_BESTAND, 'utf-8'));
    return new Map(Object.entries(ruw));
  } catch (err) {
    console.error('[weer] navtexLokaal: kon eerste-ontvangst-bestand niet lezen, begin leeg:', err.message ?? err);
    return new Map();
  }
})();

// Synchroon wegschrijven bij elke nieuwe entry (zie de toelichting bij
// EERSTE_ONTVANGST_BESTAND hierboven — klein genoeg, geen debounce nodig).
// Mislukt schrijven (bv. schijf vol) is niet fataal voor de pollronde zelf,
// dus alleen loggen, niet gooien.
function bewaarEersteOntvangst() {
  try {
    writeFileSync(EERSTE_ONTVANGST_BESTAND, JSON.stringify(Object.fromEntries(EERSTE_ONTVANGST_PER_ID)), 'utf-8');
  } catch (err) {
    console.error('[weer] navtexLokaal: kon eerste-ontvangst-bestand niet wegschrijven:', err.message ?? err);
  }
}

// 2026-09-06, op melding van Lex (Rogaland LE76: popup zei "ontvangen 03:51",
// de NIEUW-pil en de lijstvolgorde zeiden 08:30): bij een bericht zonder
// leesbare eigen datum is het echte antenne-ontvangstmoment (laatstOntvangen,
// uit het blok-tijdenregister) een betere tijd dan het moment waarop de app
// het bericht voor het eerst zag -- dat laatste verschuift zodra de tekst
// door een nieuwe ontvangst nét anders binnenkomt (andere hash -> nieuw ID).
// eersteOntvangst() blijft de terugval als er geen blok-tijd bekend is.
// 2026-09-06, tweede ronde: NIET het laatste maar het EERSTE antenne-moment,
// en daarvan het oudste t.o.v. het app-eerst-gezien-moment. Met "laatst"
// schoof de tijd van een dagelijks herhaald bericht (Niton, geen DTG) elke
// dag mee -> elke dag opnieuw "NIEUW" en bovenaan, precies de bug van
// 2026-08-24 in een nieuw jasje (Lex' screenshot: hele Niton-groep "NIEUW OP
// 6 SEP 11:49"). Het oudste bekende moment is stabiel: het bloktijdenregister
// levert de echte antennetijd zolang het bericht daarin staat, en
// eersteOntvangst(id) (op schijf) vangt op als de oudste blokken eruit vallen.
function tijdZonderDatum(b, id) {
  const app = eersteOntvangst(id);
  const blok = b.eerstOntvangen ? new Date(b.eerstOntvangen) : null;
  if (blok && !Number.isNaN(blok.getTime()) && blok.toISOString() < app) return blok.toISOString();
  return app;
}

function eersteOntvangst(id) {
  const bestaand = EERSTE_ONTVANGST_PER_ID.get(id);
  if (bestaand) return bestaand;
  const nu = new Date().toISOString();
  EERSTE_ONTVANGST_PER_ID.set(id, nu);
  bewaarEersteOntvangst();
  return nu;
}

// 2026-08-24-fix: eerste versie deed dit in één for-lus die bij een TWEEDE
// bericht met dezelfde sleutel binnen hetzelfde bestand meteen `continue`de
// — dus stilletjes weggegooid i.p.v. vergeleken. Onschuldig zolang zo'n
// botsing niet voorkwam, maar bij het testen tegen Lex' eigen bestand bleek
// het wél voor te komen (zie de comment bij dedupSleutel hierboven) en
// verdween daardoor een heel bericht. Nu in twee stappen: eerst per sleutel
// de beste instantie BINNEN dit bestand bepalen, dan pas vergelijken met het
// over-pollcycli-heen bewaarde geheugen — zodat een latere, betere instantie
// in hetzelfde bestand de eerdere altijd nog kan inhalen.
function smeltSamenOpBesteVersie(berichten) {
  const zonderSleutel = [];
  const besteDitBestand = new Map(); // sleutel -> { bericht, score }
  // 2026-09-06, zie kwaliteitsScore(): identieke teksten per sleutel tellen.
  const identiekPerSleutelEnBody = new Map();
  for (const b of berichten) {
    const sleutel = dedupSleutel(b.code, b.typeLetter);
    if (!sleutel) continue;
    const k = `${sleutel}\u0000${b.body}`;
    identiekPerSleutelEnBody.set(k, (identiekPerSleutelEnBody.get(k) ?? 0) + 1);
  }
  for (const b of berichten) {
    const sleutel = dedupSleutel(b.code, b.typeLetter);
    if (!sleutel) {
      zonderSleutel.push(b); // geen betrouwbare sleutel -- zoals voorheen: los behandelen
      continue;
    }
    const score = kwaliteitsScore(b, identiekPerSleutelEnBody.get(`${sleutel}\u0000${b.body}`) ?? 1);
    const huidigBeste = besteDitBestand.get(sleutel);
    // 2026-08-25-fix, op melding van Lex (PA14 — kabelbericht, de gehavende
    // ATS Mini-ontvangst bleef getoond terwijl een latere, veel schonere
    // ontvangst dezelfde avond binnenkwam: "ik had verwacht dat de beste
    // versie zou worden bewaard"): de 2026-08-25-fix hieronder bij de
    // vergelijking met BESTE_VERSIE_PER_SLEUTEL (gelijke score + andere tekst
    // = toch verversen) gold tot nu toe NIET voor déze reductiestap, die
    // binnen ÉÉN bestandsinlezing de beste van meerdere instanties van
    // dezelfde code kiest. Bij PA14 hadden beide ontvangsten toevallig exact
    // evenveel coordinaten (6, A t/m F identiek) — dus gelijke score — en de
    // oude strikte `score > huidigBeste.score` behield dan altijd de EERST
    // gevonden instantie. Omdat het bronbestand append-only is (oudste
    // eerst), betekende dat: de oudere, slechter gedecodeerde ontvangst won
    // altijd van een latere, betere op een gelijkspel. Zelfde redenering als
    // bij de vergelijking hieronder toegepast: gelijke score MET andere tekst
    // is geen echte tie.
    const isVerbetering = !huidigBeste || score > huidigBeste.score || (score === huidigBeste.score && b.body !== huidigBeste.bericht.body);
    if (isVerbetering) besteDitBestand.set(sleutel, { bericht: b, score });
  }

  const resultaat = [...zonderSleutel];
  for (const [sleutel, { bericht, score }] of besteDitBestand) {
    const eerder = BESTE_VERSIE_PER_SLEUTEL.get(sleutel);
    // 2026-08-25-fix, op melding van Lex (TA79 — een MSI-melding over een
    // ketting op de zeebodem, opnieuw ontvangen met dezelfde 1 coördinaat als
    // eerder, dus GELIJKE score — bleef daardoor eeuwig op het oude
    // eersteOntvangst()-moment staan, ook al was de tekst deze keer merkbaar
    // anders (andere ontvangstkwaliteit)). De oude vergelijking (`score >
    // eerder.score`, strikt groter) behandelde een gelijke score altijd als
    // "geen verbetering, dus de oude versie blijft leidend" — maar een
    // GELIJKE score met een ANDERE tekst is geen echte tie, het is gewoon een
    // volgende, op zichzelf staande ontvangst van hetzelfde bericht, die een
    // eigen vers moment verdient (zie eersteOntvangst()/hashTekst() hieronder
    // -- een andere tekst geeft toch al een andere hash/baseId). Alleen bij
    // EXACT dezelfde tekst (letterlijk hetzelfde bericht nogmaals gehoord)
    // blijft de oude versie leidend -- daar is niks aan veranderd, en dat
    // voorkomt ook meteen dat dit weer de oude "elke pollronde ziet er nieuw
    // uit"-bug zou terugbrengen (identieke tekst -> identieke hash -> toch al
    // hetzelfde eersteOntvangst()-moment, dus geen churn).
    const isVerbetering = !eerder || score > eerder.score || (score === eerder.score && bericht.body !== eerder.bericht.body);
    if (isVerbetering) {
      BESTE_VERSIE_PER_SLEUTEL.set(sleutel, { bericht, score });
      resultaat.push(bericht);
    } else {
      resultaat.push(eerder.bericht); // exact dezelfde tekst als eerder -- geen reden om te verversen
    }
  }
  return resultaat;
}

// 2026-08-25, op verzoek van Lex (PA11/PA13/PA14/PA15 — allemaal dezelfde
// kabelwaarschuwing bij Brown Ridge, vier keer apart in de Meldingen-lijst
// terwijl de kaart maar 1 symbool toont omdat de coördinaten identiek zijn:
// "je ziet 11, 13, 14 en 15" / "en toch is er maar 1 symbool op de kaart!"):
// een station zendt een STAANDE waarschuwing normaal gesproken meerdere
// keren uit onder een NIEUW, oplopend berichtnummer — dat is normale
// NAVTEX-praktijk, geen fout in de ontvangst (bevestigd door Lex: "P =
// zendstation... A = navigatiewaarschuwing... 11 en 14 = twee verschillende
// berichtnummers"). dedupSleutel/BESTE_VERSIE_PER_SLEUTEL hierboven dedupt
// bewust op de VOLLEDIGE code (dus per volgnummer) om de eerdere
// KA45/PA45-botsing (twee ECHT verschillende berichten met toevallig
// hetzelfde volgnummer) te vermijden — dat blijft ongewijzigd. Deze stap
// hieronder herkent er vervolgens BOVENOP dat meerdere van die
// per-code-uitkomsten in werkelijkheid dezelfde onderliggende waarschuwing
// zijn, aan een veel scherper kenmerk dan het volgnummer: EXACT dezelfde
// coördinatenset (2+ punten) van hetzelfde station+type. Twee losstaande
// berichten die toevallig exact dezelfde coördinatenlijst delen is vrijwel
// ondenkbaar — veel specifieker dan een toevallig gelijk volgnummer (dat
// maar 1-99 waarden kent). Bewust NIET toegepast bij losse puntmeldingen of
// berichten zonder betrouwbare station/type-letters (te vaag om veilig op
// te matchen, zelfde afweging als bij UITSCHIETER_DREMPEL_KM hierboven).
function inhoudsSleutel(bericht) {
  if (bericht.coords.length < 2) return null;
  const { stationId, typeLetter } = leesStationEnType(bericht.code);
  if (!stationId || !typeLetter) return null;
  const coordsSleutel = bericht.coords.map((c) => `${c.lat},${c.lon}`).sort().join(';');
  return `${stationId}|${typeLetter}|${coordsSleutel}`;
}

// Laatste cijfergroep van de code, bv. "PA14" -> 14 — voor het "meebewegend
// volgnummer" hieronder (op verzoek van Lex: "kan dan wel dat volgnummer mee
// blijven stijgen?"): ook als de TEKST zelf niet verbetert (PA14/PA15
// zonden allebei letterlijk dezelfde schone tekst uit), mag het GETOONDE
// volgnummer gewoon meebewegen naar de nieuwste uitzending.
function volgnummerIn(code) {
  const m = /(\d+)$/.exec(code);
  return m ? Number(m[1]) : null;
}

// 2026-08-25-fix, tijdens het testen tegen PA11/13/14/15: `berichten` hier is
// het resultaat van smeltSamenOpBesteVersie() hierboven, dus al 1x per code
// samengevouwen — een JS Map bewaart bij herhaald `.set()` op dezelfde sleutel
// de volgorde van de EERSTE keer dat die sleutel werd toegevoegd, niet de
// laatste. Daardoor zegt de positie van PA11/13/14/15 in díe lijst NIETS
// betrouwbaars over welke van de vier het laatst/vaakst goed ontvangen is —
// bij een testrun met exact deze vier berichten koos de kale "gelijke score +
// andere tekst wint"-regel hieronder daardoor willekeurig de gehavende PA11-
// tekst, puur omdat PA11's CODE toevallig als laatste voor het eerst in het
// bestand voorkwam. Fix: hergebruikt nu dezelfde (inmiddels uitgebreide)
// kwaliteitsScore() hierboven als smeltSamenOpBesteVersie — die geeft PA11
// (geen geldige datum, en zoals Lex later liet zien kan zelfs een verder
// schone tekst nog "NNNN <rommel>" overhouden) aantoonbaar een lagere score
// dan een écht schone ontvangst, ongeacht verwerkingsvolgorde.

// Zelfde soort module-scoped geheugen als BESTE_VERSIE_PER_SLEUTEL
// hierboven, nu op inhoudsSleutel: de beste tot nu toe geziene tekst/score
// (zelfde score+tiebreak-regel als hierboven — dus een gehavende ontvangst
// maakt hier ook plaats voor een latere, schonere ontvangst met gelijke
// score) EN, los daarvan, het hoogste tot nu toe geziene volgnummer, puur
// voor de weergave.
const BESTE_INHOUD_PER_SLEUTEL = new Map(); // inhoudsSleutel -> { bericht, score, hoogsteCode }

function consolideerOpInhoud(berichten) {
  const zonderInhoudsSleutel = [];
  const besteDitBestand = new Map(); // sleutel -> { bericht, score }
  const hoogsteCodeDitBestand = new Map(); // sleutel -> code (hoogste volgnummer in dit bestand)

  for (const b of berichten) {
    const sleutel = inhoudsSleutel(b);
    if (!sleutel) {
      zonderInhoudsSleutel.push(b); // te vaag om veilig te matchen -- los behandelen, zoals voorheen
      continue;
    }

    const score = kwaliteitsScore(b);
    const huidigBeste = besteDitBestand.get(sleutel);
    const isVerbetering = !huidigBeste || score > huidigBeste.score || (score === huidigBeste.score && b.body !== huidigBeste.bericht.body);
    if (isVerbetering) besteDitBestand.set(sleutel, { bericht: b, score });

    const huidigeHoogsteCode = hoogsteCodeDitBestand.get(sleutel);
    const volgnrHuidig = volgnummerIn(b.code) ?? -1;
    const volgnrHoogste = huidigeHoogsteCode ? volgnummerIn(huidigeHoogsteCode) ?? -1 : -1;
    if (!huidigeHoogsteCode || volgnrHuidig > volgnrHoogste) hoogsteCodeDitBestand.set(sleutel, b.code);
  }

  const resultaat = [...zonderInhoudsSleutel];
  for (const [sleutel, { bericht, score }] of besteDitBestand) {
    const eerder = BESTE_INHOUD_PER_SLEUTEL.get(sleutel);
    const isVerbetering = !eerder || score > eerder.score || (score === eerder.score && bericht.body !== eerder.bericht.body);
    const gekozenBericht = isVerbetering ? bericht : eerder.bericht;
    const gekozenScore = isVerbetering ? score : eerder.score;

    const kandidaatHoogsteCode = hoogsteCodeDitBestand.get(sleutel) ?? gekozenBericht.code;
    const volgnrKandidaat = volgnummerIn(kandidaatHoogsteCode) ?? -1;
    const volgnrEerder = eerder ? volgnummerIn(eerder.hoogsteCode) ?? -1 : -1;
    const hoogsteCode = volgnrKandidaat >= volgnrEerder ? kandidaatHoogsteCode : eerder.hoogsteCode;

    BESTE_INHOUD_PER_SLEUTEL.set(sleutel, { bericht: gekozenBericht, score: gekozenScore, hoogsteCode });
    // Getoonde code volgt altijd het hoogste geziene volgnummer, ook als de
    // tekst zelf (gekozenBericht) uit een oudere uitzending komt.
    resultaat.push({ ...gekozenBericht, code: hoogsteCode });
  }
  return resultaat;
}

// 2026-08-26, op verzoek van Lex -- de teller "hoe vaak is een bericht al
// ontvangen" (zie navtexOntvangstBadge()/navtexNummerBadge() in app.js, die
// al sinds 25 aug op deze velden wachtten zonder dat de backend ze ooit
// leverde: detail.versie/detail.aantalOntvangsten bestonden hier nergens --
// een half afgebouwd feature, geen bug die kapot ging). Lex' eigen keuze na
// overleg: het onderscheid tussen "zelfde exacte code" (smeltSamenOpBesteVersie
// hierboven) en "zelfde inhoud, ander volgnummer" (consolideerOpInhoud
// hierboven) hoeft voor hem niet zichtbaar te zijn -- "mag samen op dezelfde
// teller visueel". Daarom hier EEN gecombineerde telling: alle ruwe
// ontvangsten die via OF dezelfde inhoudsSleutel OF (als die er niet is)
// dezelfde dedupSleutel bij dit bericht horen.
//
// Bewust GEEN nieuwe permanente staat (zoals BESTE_VERSIE_PER_SLEUTEL/
// EERSTE_ONTVANGST_PER_ID hierboven wel nodig hadden) -- het bronbestand
// wordt sowieso elke pollronde in zijn geheel opnieuw ingelezen (zie het
// begin van fetchNavtexLokaal hieronder), dus `ruweBerichten` bevat altijd de
// volledige ontvangstgeschiedenis. Simpelweg tellen/filteren daarop is dus
// net zo actueel als een bijgehouden teller, zonder het risico dat zo'n
// teller na een herstart (syncweer, crash, reboot) weer bij 0 begint.
//
// Zelfde aanpak voor "laatst gezien": het nieuwste DTG onder alle
// bijbehorende ruwe ontvangsten, ook live herberekend. Op Lex' expliciete
// verzoek NIET gebouwd voor berichten zonder eigen leesbare datum (vooral de
// AVURNAV-relaisberichten, zie datumOnbetrouwbaar hieronder) -- dat zou een
// nieuw, fijnmaziger soort boekhouding vergen (elke losse ontvangst een eigen
// tijdstempel geven, i.p.v. alleen het bestaande "eerste keer gezien"-moment
// per getoond bericht, zie eersteOntvangst() hierboven), en dat vond Lex de
// moeite niet waard voor die kleinere groep. Voor die berichten (b.datum ==
// null) is laatsteDatum hier dus irrelevant -- de aanroeper (fetchNavtexLokaal
// hieronder) geeft laatstGezien alleen door als b.datum wel bestaat.
function ontvangstStatsVoorBericht(bericht, ruweBerichten) {
  const inhoudSleutel = inhoudsSleutel(bericht);
  const codeSleutel = dedupSleutel(bericht.code, bericht.typeLetter);
  let aantalOntvangsten = 0;
  let laatsteDatum = null;
  // 2026-08-28 (DX-lijst): ook het nieuwste ONTVANGST-moment over alle
  // duplicaten heen — de blok-begintijd uit het viewer-register (zie
  // fetchNavtexLokaal), niet de DTG. ISO-strings, dus kaal vergelijkbaar.
  let laatsteOntvangst = null;
  let eersteOntvangstBlok = null; // 2026-09-06: oudste blok-tijd, zie tijdZonderDatum()
  for (const rb of ruweBerichten) {
    const hoortErbij = inhoudSleutel
      ? inhoudsSleutel(rb) === inhoudSleutel
      : Boolean(codeSleutel) && dedupSleutel(rb.code, rb.typeLetter) === codeSleutel;
    if (!hoortErbij) continue;
    aantalOntvangsten += 1;
    if (rb.datum && (!laatsteDatum || rb.datum.getTime() > laatsteDatum.getTime())) laatsteDatum = rb.datum;
    if (rb.ontvangstTijd && (!laatsteOntvangst || rb.ontvangstTijd > laatsteOntvangst)) laatsteOntvangst = rb.ontvangstTijd;
    if (rb.ontvangstTijd && (!eersteOntvangstBlok || rb.ontvangstTijd < eersteOntvangstBlok)) eersteOntvangstBlok = rb.ontvangstTijd;
  }
  // Geen inhouds- of code-sleutel (te vage station/type-lezing, zie
  // dedupSleutel()/inhoudsSleutel() hierboven) -- dan is er niets om tegen te
  // matchen, en telt het bericht zichzelf als enige ontvangst, net zoals de
  // rest van dit bestand zulke berichten al ongemoeid/los behandelt.
  if (aantalOntvangsten === 0) {
    aantalOntvangsten = 1;
    laatsteOntvangst = bericht.ontvangstTijd ?? null;
    eersteOntvangstBlok = bericht.ontvangstTijd ?? null;
  }
  return { aantalOntvangsten, laatsteDatum, laatsteOntvangst, eersteOntvangstBlok };
}

// 2026-08-24, op verzoek van Lex ("er staat best vaak cancel in een bericht
// ... het navtex-systeem voorziet zelf al goed in geldigheid") — i.p.v. een
// blinde ouderdomsgrens de intrekking uit de berichten zelf lezen. Twee
// vormen, zie Lex' eigen toelichting:
// (1) een bericht geeft zichzelf een vervaldatum: "CANCEL THIS MSG/MESSAGE
//     <DTG>" — zie zelfVervalDatumIn() hieronder.
// (2) een LATER bericht trekt een EERDER bericht in via diens eigen
//     referentienummer: "CANCEL WZ 411/26", "CANCEL MSI 202/26", "CANCEL
//     AVURNAV CHERBOURG 52/26" — zie geannuleerdeReferentiesIn() hieronder.
// Referentienummer is NADRUKKELIJK iets anders dan de transmissiecode (bv.
// "TA11", de over-de-lucht-verpakking, per station verschillend) — het is
// het "eigen" nummer dat de afzender erin zet, en dat blijft gelijk ook als
// hetzelfde bericht via een ANDER station opnieuw wordt uitgezonden (zie de
// WZ 500/26 / VA11+EA82-observatie: zelfde referentie, twee transmissiecodes).
const REFERENTIE_REGEX = /\b(MSI|WZ|NAVAREA\s+[IVXLC]+|AVURNAV\s+[A-Z]+)\s+(\d{1,4})\s*\/\s*(\d{1,4})\b/i;
function referentieIn(tekst) {
  const m = REFERENTIE_REGEX.exec(tekst);
  if (!m) return null;
  const prefix = m[1].toUpperCase().replace(/\s+/g, ' ');
  return `${prefix} ${Number(m[2])}/${Number(m[3])}`; // genormaliseerd (geen leidende nullen) zodat "045/26" en "45/26" hetzelfde matchen
}

// "CANCEL THIS MSG/MESSAGE <DTG>" — specifiek NA die frase zoeken zodat een
// willekeurige andere datum in het bericht niet per ongeluk als vervaldatum
// wordt gelezen. Hergebruikt datumIn() (zie hieronder) op het stukje tekst
// erna.
const ZELF_VERVAL_REGEX = /CANCEL\s+THIS\s+(?:MSG|MESSAGE)\s+([\s\S]{0,40})/i;
function zelfVervalDatumIn(tekst) {
  const m = ZELF_VERVAL_REGEX.exec(tekst);
  if (!m) return null;
  return datumIn(m[1]);
}

// Alle "CANCEL <referentienummer>"-vermeldingen in een bericht, MET
// uitzondering van "CANCEL THIS MSG/MESSAGE ..." (dat is de zelf-vervaldatum
// hierboven, geen kruisverwijzing naar een ander bericht). Kan in theorie
// meerdere keren voorkomen (niet live gezien, voor de zekerheid alles
// meegenomen).
const CANCEL_REGEX = /CANCEL\s+([\s\S]{0,40})/gi;
// 2026-08-26, op verzoek van Lex ("MSI 217/26 MSI 216/26 CANCELLED") --
// tweede, omgekeerde volgorde: het referentienummer EERST, met "CANCELLED"
// er losstaand achteraan i.p.v. "CANCEL <referentie>" ervoor (allebei
// bestaande NAVTEX-formuleringen). Per gevonden referentie wordt alleen
// gekeken naar het stukje tekst TOT de volgende referentie (of einde
// bericht) -- anders zou een CANCELLED verderop in het bericht per ongeluk
// aan een EERDERE referentie kunnen blijven plakken, zoals hier het eigen
// berichtnummer (217/26) vlak voor de echte, ingetrokken referentie
// (216/26).
const REFERENTIE_GLOBAAL_REGEX = new RegExp(REFERENTIE_REGEX.source, 'gi');
function cancelledAchterAfIn(tekst) {
  const gevonden = [];
  const matches = [...tekst.matchAll(REFERENTIE_GLOBAAL_REGEX)];
  for (let i = 0; i < matches.length; i++) {
    const eind = matches[i].index + matches[i][0].length;
    const volgendeStart = i + 1 < matches.length ? matches[i + 1].index : tekst.length;
    const ertussen = tekst.slice(eind, volgendeStart);
    if (/^\s*(?:IS\s+|NOW\s+)?CANCELLED\b/i.test(ertussen)) {
      const ref = referentieIn(matches[i][0]);
      if (ref) gevonden.push(ref);
    }
  }
  return gevonden;
}
function geannuleerdeReferentiesIn(tekst) {
  const gevonden = [];
  CANCEL_REGEX.lastIndex = 0;
  let m;
  while ((m = CANCEL_REGEX.exec(tekst)) !== null) {
    if (/^THIS\s+(MSG|MESSAGE)\b/i.test(m[1])) continue;
    const ref = referentieIn(m[1]);
    if (ref) gevonden.push(ref);
  }
  gevonden.push(...cancelledAchterAfIn(tekst));
  return gevonden;
}

// Module-scoped (niet per pollcyclus gereset), zelfde soort geheugen als
// BESTE_VERSIE_PER_SLEUTEL hierboven: eenmaal een referentie hier ingezet,
// blijft 'm geannuleerd zolang de service draait — een intrekking komt
// immers niet terug.
const GEANNULEERDE_REFERENTIES = new Set();

// Vangnet, GEEN primair mechanisme: berichten zonder zelf-vervaldatum en
// zonder ooit een CANCEL-verwijzing blijven anders voor altijd staan (zie
// Lex: "blijft in principe van kracht totdat... of een bericht verschijnt
// zoals CANCEL NAVTEX..." — maar dat bericht komt niet altijd binnen bereik/
// leesbaar binnen). 60 dagen is ruim gekozen om nooit een nog geldige
// waarschuwing te vroeg weg te gooien.
// 2026-09-06, op verzoek van Lex (TA12 van Oostende, MSI 131/26 van 26 maart,
// nog steeds elke beurt uitgezonden maar door de 60-dagengrens onzichtbaar):
// het vangnet is nu een noodrem van een jaar, en het echte vervalmechanisme
// is "wordt niet meer herhaald" -- zie NIET_MEER_GEHOORD_MS hieronder.
const VANGNET_MAX_OUDERDOM_MS = 365 * 24 * 60 * 60 * 1000;

// Een NAVTEX-station herhaalt elk geldig bericht bij ELKE uitzendbeurt
// (Oostende 'T': elke 4 uur); een CANCEL wordt maar een paar keer uitgezonden
// en kan dus gemist worden -- de norm, niet de uitzondering. Het betrouwbare
// signaal is dat het bericht niet meer herhaald wordt. Regel (Lex' keuze,
// 72 uur = 18 beurten van Oostende): een bericht vervalt als het 72 uur niet
// meer gehoord is TERWIJL het station in die periode wel hoorbaar was
// (andere berichten van datzelfde station ontvangen). Zonder dat bewijs
// (ontvanger uit, SDR++-server had de Airspy, storing) blijft alles staan.
const NIET_MEER_GEHOORD_MS = 72 * 60 * 60 * 1000;

function nietMeerHerhaald(b, laatstGehoordPerStation, registerStartMs) {
  if (!b.stationId) return false;
  const stationLaatstMs = laatstGehoordPerStation.get(b.stationId);
  if (!stationLaatstMs) return false; // station nooit (recent) gehoord -> geen bewijs
  if (b.laatstOntvangen) {
    const eigenMs = new Date(b.laatstOntvangen).getTime();
    return Number.isFinite(eigenMs) && stationLaatstMs - eigenMs > NIET_MEER_GEHOORD_MS;
  }
  // Geen blok-tijd bekend: het bericht ligt vóór het tijdenregister (ouder
  // dan de laatste RUW_TIJDEN_MAX blokken). Alleen vervallen als het register
  // zelf al meer dan 72 uur van dit station bestrijkt -- anders weten we het
  // gewoon niet en houden we het.
  return Number.isFinite(registerStartMs) && stationLaatstMs - registerStartMs > NIET_MEER_GEHOORD_MS;
}

// 2026-08-24, op verzoek van Lex: eerste, trefwoord-gebaseerde classificatie
// van het soort navigatiewaarschuwing, voor een eigen icoon per eventtype op
// de kaart (zie navtexEventIconHtml() in app.js). Bewust simpele regex-
// regels i.p.v. iets slimmers (NLP/ML) — de frasering in MSI/AVURNAV-
// berichten is vrij vast, en dit is makkelijk uit te breiden zodra een
// nieuw, nog niet herkend type voorbijkomt. Volgorde is van
// specifiek-eerst-algemeen; de eerste match wint.
const EVENT_REGELS = [
  { type: 'riglijst', label: 'Boorplatform(s)', re: /\bRIG\s*(LIST|MOVE)\b|MOBILE OFFSHORE DRILLING UNIT|\bMODU\b/i },
  // 2026-08-26, afgesplitst van 'riglijst' hierboven op vraag van Lex, na
  // MSI 214/26 ("FOLLOWING PLATFORMS HAVE DEFECTS: ..."): de platforms in
  // zo'n bericht (bv. K6-PC, L10-M, N7-FA-1 -- Nederlandse/Duitse
  // blokaanduidingen) zijn VASTE productieplatforms met een defect aan hun
  // navigatiehulpmiddelen, geen boorplatforms/riglijst-posities. Eerst
  // per ongeluk onder 'riglijst' meegenomen (nodig voor dezelfde
  // splits-per-positie-behandeling, zie splitsRiglijst() hieronder), maar
  // dat gaf zo'n bericht het verkeerde generieke label ("Boorplatform(s)")
  // en, waar geen specifieke status herkend wordt, het verkeerde icoon (een
  // booreiland-derrick) -- zie classificeerRiglijstStatus()/de call-site
  // hieronder en NAVTEX_PLATFORM_SVG/NAVTEX_EVENT_ICOON in app.js.
  { type: 'platform-defect', label: 'Platform(s) met defect', re: /FOLLOWING\s+PLATFORMS?\b/i },
  // 2026-09-10, op melding van Lex ("Dit is een vreemde toch? ... ik bedoel
  // de verbonden lijnen"), na PA46 / MSI 230/26 ("THE FOLLOWING WIND
  // TURBINES HAVE DEFECTS HOLLANDSE KUST NOORD 52-44.9N 004-12.2E HNF4
  // UNLIT HOLLANDSE KUST ZUID 52-11.4N 004-00.9E HZR FOGHORN INOPERATIVE
  // ..."): exact hetzelfde lek als MSI 214/26 destijds bij de platforms,
  // maar dan met turbines. 'FOLLOWING PLATFORMS' matchte niet, er staan
  // geen A./B.-lijsttekens in, dus viel het bericht door naar
  // classificeerGeometrie() en werden de 5 turbineposities als EEN
  // polygoon aan elkaar geknoopt -- de zigzag die Lex op de kaart zag.
  // Bijkomend gevolg van hetzelfde lek: 'FOGHORN INOPERATIVE' van de ENE
  // turbine (HZR) bepaalde via de foghorn-regel hieronder het eventtype van
  // het HELE bericht, dus alle vijf zaten onder een misthoorn-marker
  // terwijl er vier gewoon UNLIT waren. Eigen type (dus voor de
  // licht/foghorn-regels hieronder, die dit bericht anders opslokken) dat
  // net als riglijst/platform-defect via splitsRiglijst() naar losse
  // puntsignalen gaat.
  { type: 'turbine-defect', label: 'Windturbine(s) met defect', re: /FOLLOWING\s+WIND\s*TURBINES?\b/i },
  { type: 'boei-vermist', label: 'Boei vermist/beschadigd', re: /BUOY[^.]{0,20}\bMISSING\b|BUOY[^.]{0,25}\b(TOPMARK|DAMAGED?)\b/i },
  // 2026-08-24, op verzoek van Lex (NAV WARN 454, GERMAN BIGHT: "OFFSHORE
  // WIND FARM 'AMRUMBANK'... LIGHTING INOPERATIVE" viel nog in "overig") —
  // een kapot licht is een kapot licht, ongeacht of het op een boei,
  // vuurtoren of windturbine zit, dus geen apart "windmolen"-type/icoon
  // nodig — alleen de trefwoordenlijst verbreed met een paar gangbare
  // synoniemen naast UNRELIABLE/EXTINGUISHED/UNLIT.
  // 2026-08-24: "NAVAID(S) INOPERATIVE" komt ook voor (bredere term dan
  // "LIGHT" — een navigatiehulpmiddel kan ook een racon/DGPS-baken/etc. zijn,
  // niet per se een licht) — zelfde 💡-categorie, want in de praktijk gaat
  // dit vrijwel altijd over precies zo'n zelfde soort storing, en een apart
  // icoon voor "welk type navigatiehulpmiddel precies" voegt weinig toe.
  // 2026-08-24, op verzoek van Lex ("BOUY + UNLIT"): een boei-melding noemt
  // "LIGHT"/"NAVAID" niet altijd expliciet — "EIDE APPROACH BUOY ... UNLIT"
  // volstaat kennelijk ook. BUOY toegevoegd als trigger-woord, en het venster
  // van 20 naar 60 tekens — bij dit concrete bericht zat er een hele
  // coördinaat (32 tekens) tussen BUOY en UNLIT in, ruimer dan de oude 20.
  { type: 'licht-onbetrouwbaar', label: 'Licht onbetrouwbaar/uit', re: /(LIGHT|NAV\s*AIDS?|BUOY)[^.]{0,60}\b(UNRELIABLE|EXTINGUISHED|UNLIT|INOPERATIVE|OUT\s+OF\s+ORDER|NOT\s+WORKING|DEFECTIVE)\b/i },
  // 2026-08-26, op verzoek van Lex (MSI 214/26, Scheveningen: meerdere
  // platforms met "FOGHORN INOPERATIVE"/"FOGHORN...NOT WORKING" naast de
  // bestaande licht-defecten) -- eigen categorie/icoon i.p.v. dat dit met
  // een licht-storing op één hoop gegooid wordt: een misthoorn is een
  // akoestisch signaal (relevant bij slecht zicht/mist), geen licht, dus een
  // ander soort gevaar voor een heel andere situatie. VOOR
  // 'licht-onbetrouwbaar' gezet (specifieker eerst) zodat "FOGHORN
  // INOPERATIVE" niet per ongeluk als lichtstoring wegvalt.
  { type: 'foghorn', label: 'Misthoorn defect', re: /\bFOG\s*(?:HORNS?|SIGNALS?)\b[^.]{0,40}\b(INOPERATIVE|OUT\s+OF\s+ORDER|NOT\s+WORKING|DEFECTIVE|SILENT|UNRELIABLE)\b/i }, // 2026-09-06: ook "FOG SIGNAL(S)" (WZ 537/26 windturbines)
  { type: 'boei-nieuw', label: 'Boei geplaatst/gewijzigd', re: /(LIGHT)?BUOY[^.]{0,25}\bESTABLISHED\b|BUOY\s+DEPLOYED|WAVERIDER BUOY/i },
  { type: 'safety-zone', label: 'Veiligheidszone', re: /SAFETY ZONE|AREA PROHIBITED/i },
  { type: 'kabel', label: 'Kabelwerkzaamheden', re: /\bCABLE\b/i },
  // 2026-08-24, op verzoek van Lex (NAV WARN 468: "UKO SURVEY BY MV 'OCEAN
  // RESEARCHER'... RESTRICTED MANOEUVRABILITY DURING OPERATIONS" — duidelijk
  // een actief surveyschip, maar "SURVEY BY" viel nog niet onder de oude
  // OPERATIONS/VESSEL-varianten) — verbreed met BY/WORK/CONDUCTED.
  { type: 'survey', label: 'Survey/onderzoeksvaartuig', re: /SURVEY\s+(OPERATIONS?|VESSEL|BY|WORK|CONDUCTED)\b/i },
  { type: 'wetenschappelijk', label: 'Wetenschappelijke instrumenten', re: /SCIENTIFIC (INSTRUMENT|EQUIPMENT)/i },
  { type: 'wrak', label: 'Wrak', re: /\bWRECK\b/i },
  // 2026-08-26, op melding van Lex (Oostende MSI 130/26: "OBSTACLES ON
  // THE SEABED IN FOLLOWING POSITIONS...") -- "OBSTACLE(S)" is een
  // net zo gangbare bewoording als "OBSTRUCTION" voor hetzelfde soort
  // gevaar (iets op de bodem waar niet geankerd/gevist mag worden), dus
  // dat viel voorheen nog in 'overig' i.p.v. als obstructie herkend.
  { type: 'obstructie', label: 'Obstructie', re: /\bOBSTRUCTIONS?\b|\bOBSTACLES?\b/i },
  // 2026-08-24, op verzoek van Lex (MSI 293/26 Oostende: "ANCHOR AND CHAIN
  // LOST IN POS ...") — een los anker+ketting op de bodem is een eigen,
  // herkenbaar gevaar (verstrikking/beschadiging voor wie daar zelf ankert
  // of sleepnetvist), dus een eigen type i.p.v. de generieke 'obstructie'.
  // ANCHOR en LOST mogen in beide volgordes voorkomen ("ANCHOR ... LOST" of
  // "LOST ... ANCHOR") — bewust NIET op "DRAGG(ED/ING)" laten matchen, dat is
  // een ander soort melding (een ANKER dat sleept, niet een verloren anker).
  { type: 'anker-verloren', label: 'Anker/ketting verloren', re: /\bANCHOR\b[^.]{0,30}\bLOST\b|\bLOST\b[^.]{0,20}\bANCHOR\b/i },
  // 2026-08-24, op verzoek van Lex ("neem gelijk een bom/granaat icon mee
  // als er bij een gebied over ordinance of munitions, explosives wordt
  // gemeld") — vóór 'oefening' gezet: een munitie/explosieven-melding is
  // specifieker (en relevanter om apart te herkennen) dan een generieke
  // "FIRING EXERCISE"-melding, en de trefwoorden overlappen toch niet.
  { type: 'munitie', label: 'Munitie/explosieven', re: /\b(ORDNANCE|MUNITIONS?|AMMUNITION|EXPLOSIVES?|UNEXPLODED|UXO|EOD)\b/i },
  { type: 'oefening', label: 'Militaire oefening', re: /FIRING EXERCISE|GUNNERY|NAVAL EXERCISE/i },
];
function classificeerEvent(body) {
  for (const regel of EVENT_REGELS) {
    if (regel.re.test(body)) return regel;
  }
  return { type: 'overig', label: 'Overige navigatiewaarschuwing' };
}

// 2026-08-24-fix, op melding van Lex ("ik zie een verticale lijn ten westen
// van Londen?") — dat was het kabelbericht (PA14: "ALONG A LINE JOINING A.
// ... F.", 6 punten). Eerste versie classificeerde PUUR op AANTAL punten
// (>=3 -> polygoon), en negeerde dat de brontekst hier expliciet "LINE
// JOINING" zegt — dus een lijnstuk/tracé, geen gesloten gebied. Met 6 punten
// die ruwweg op een rijtje liggen (kust-parallel kabeltracé) sloot de
// "polygoon" zich van het laatste punt terug naar het eerste, wat een dun,
// bijna-plat viervlak oplevert — visueel niet van een streep te
// onderscheiden. Nu eerst op trefwoord in de body kijken ("LINE JOINING"/
// "ALONG A LINE" -> altijd lijn, ongeacht aantal punten), en pas als dat
// niet gevonden wordt terugvallen op de telling (1 punt, 2 punten -> lijn,
// 3+ -> polygoon, bv. "AREA BOUNDED BY"/"OUTER BOUNDARIES"). Hergebruikt
// bewust de bestaande gebiedPolygon/koerslijn-velden uit het signal-model
// (zie tekenGebiedOmtrek() in app.js, tot nu toe gebruikt voor orkaan-cone
// en tornado-watch-omtrek) — dezelfde tekenlogica op de kaart werkt hierdoor
// automatisch mee voor NAVTEX, geen nieuwe kaartcode nodig voor het "vak".
const LIJN_TRIGGER = /LINE JOINING|ALONG A LINE/i;
// 2026-08-24-uitbreiding, op melding van Lex ("die verticale lijn ten
// westen van Londen") — TA59 (kabelwerk M/V Manu Pekka/Duke/Kamara, 13
// punten) bleek hetzelfde lek als PA14 destijds, maar met een andere
// bewoording ("BETWEEN FOLLOWING COORDINATES"/"ENTIRE CORRIDOR" i.p.v.
// "LINE JOINING"/"ALONG A LINE") — LIJN_TRIGGER miste het dus, en het viel
// terug op de polygoon-standaard. I.p.v. steeds nieuwe frases achterna te
// blijven jagen (kat-en-muis, de volgende afwijkende formulering mist 'm
// weer): een kabeltracé is per definitie geen gesloten gebied, dus een
// bericht dat al als eventType 'kabel' geclassificeerd is (zie
// classificeerEvent hierboven) wordt bij 2+ coördinaten ALTIJD als lijn
// getekend, ongeacht bewoording. Bekend, geaccepteerd risico (akkoord met
// Lex): een kabelmelding die ooit een omsloten WERKGEBIED beschrijft i.p.v.
// een tracé (bv. "AREA BOUNDED BY" rond een kabelleg-schip) zou hierdoor
// ten onrechte ook als lijn getekend worden — nog niet gezien in de
// praktijk, wel hier genoteerd.
function classificeerGeometrie(body, coords, eventType) {
  if (coords.length === 0) return { type: 'geen', gebiedPolygon: null, koerslijn: null };
  if (coords.length === 1) return { type: 'punt', gebiedPolygon: null, koerslijn: null };
  const latLon = coords.map((c) => [c.lat, c.lon]);
  if (eventType === 'kabel') return { type: 'lijn', gebiedPolygon: null, koerslijn: latLon };
  if (LIJN_TRIGGER.test(body)) return { type: 'lijn', gebiedPolygon: null, koerslijn: latLon };
  if (coords.length === 2) return { type: 'lijn', gebiedPolygon: null, koerslijn: latLon };
  return { type: 'polygoon', gebiedPolygon: [latLon], koerslijn: null };
}

// 2026-08-24, op verzoek van Lex ("rigs met hun positie moeten worden
// weergegeven, riglijst komt regelmatig voorbij"): een riglijst-bericht
// bevat meerdere losse platformposities in ÉÉN NAVTEX-bericht — dat wordt
// dus NIET als één gebied/polygoon behandeld (dat zou de platforms ten
// onrechte met lijnen aan elkaar verbinden), maar uitgesplitst naar een los
// puntsignaal per gevonden positie.
//
// 2026-08-24, herzien nadat de EERSTE écht ontvangen riglijst binnenkwam (via
// UKHO, NAVAREA I 176/26 — nog niet via déze lokale bron, maar het format is
// vermoedelijk hetzelfde onderliggende NAVAREA-riglijst-format, alleen via
// een andere weg ontvangen, zie ukho.js voor de volledige toelichting):
// "Naam" bleek NA de positie te staan, niet ervoor ("52-59.1N 002-18.2E
// HAEVA"), en de oude versie kende de naam bovendien aan het VERKEERDE
// platform toe (off-by-one: de tekst tussen twee coördinaten hoort bij het
// EERSTE van de twee, niet het tweede). Beide gefixt. Sectiekoppen tussen
// twee platforms in ("NORTH SEA: 55N TO 60N...") kan ukho.js buiten de naam
// houden omdat die bron de originele regeleindes bewaart — hier NIET
// mogelijk, want parseBlok() hierboven slaat de hele body al plat tot één
// regel (`lines.slice(2).join(' ')`) vóórdat dit ooit gebeurt. Vangnet: knip
// op het eerste leesteken/"POSITION" (nu het EERSTE stuk pakken, niet het
// laatste — de naam staat vooraan in de tekst na de eigen coördinaat) — vangt
// niet elke sectiekop, maar is beter dan niks. d.positie.naam kan nog steeds
// null zijn/mis zijn; de kaart-popup toont dan "Onbekend platform" i.p.v. een
// gegokt tekstfragment (zie riglijstTitelHtml() in app.js).
// 2026-08-26, op verzoek van Lex, na MSI 214/26 (Scheveningen Radio:
// "FOLLOWING PLATFORMS HAVE DEFECTS: L10-M 53-34N 004-01E UNLIT G16B
// 54-07N 005-15E UNLIT AND FOGHORN INOPERATIVE N7-FA-1 53-30N 006-14E
// FOGHORN INOPERATIVE ..."): dit bericht gebruikt de OMGEKEERDE volgorde
// t.o.v. het HAEVA-voorbeeld hierboven — de platformnaam staat hier VOOR
// de coördinaat, de status (UNLIT/FOGHORN INOPERATIVE/NAV AIDS
// UNRELIABLE/...) erna. Zonder onderscheid werd de "naam" dan de
// statustekst van het VOLGENDE platform (verkeerd) en werden alle 7
// platforms als één polygoon getekend i.p.v. losse punten ("Ik zie maar 1
// icon er aan vast", meldde Lex) — dat laatste kwam doordat de oude
// riglijst-trigger (RIG LIST/MOVE/MODU) deze formulering niet herkende en
// het bericht dus als generieke meerdere-coördinaten-vorm bij
// classificeerGeometrie() belandde; zie de bijgewerkte 'riglijst'-regel in
// EVENT_REGELS hierboven.
//
// Onderscheid: als het woord vlak NA de EERSTE coördinaat een statuswoord
// is, kan dat onmogelijk een platformnaam zijn — dus staat de naam in dat
// geval vóór de coördinaat (dit format), anders erna (HAEVA-format).
const RIGLIJST_STATUSWOORD_REGEX = /^\s*(UNLIT|EXTINGUISHED|UNRELIABLE|INOPERATIVE|FOGHORN|FOG\s+(?:HORN|SIGNAL)S?|DEFECTIVE|NOT\s+WORKING|OUT\s+OF\s+ORDER|SILENT)\b/i;

// 2026-09-10, DERDE formaatvariant, na PA46 / MSI 230/26 (zie
// 'turbine-defect' in EVENT_REGELS hierboven): naam NA de coördinaat, en de
// status weer NA die naam ("52-44.9N 004-12.2E HNF4 UNLIT"). Dat is geen van
// beide bestaande varianten: het HAEVA-format heeft de naam er ook achter
// maar ZONDER status (de hele staart is dan de naam), en MSI 214/26 heeft
// juist de naam ervoor. Zonder eigen tak werd de naam hier "HNF4 UNLIT
// HOLLANDSE KUST ZUID" (alles tot de volgende coördinaat) en bleef de status
// per turbine onbekend.
//
// Herkenning: haal het eerste woord na de eerste coördinaat weg (dat is dan
// de naam) en kijk of dáár een statuswoord op volgt.
//
// Woorden waarmee een statuszin kan beginnen/doorlopen, zodat de statustekst
// van elke turbine aan de voorkant weggeknipt kan worden en wat er overblijft
// de sectiekop van de VOLGENDE turbine is ("... HNF4 UNLIT HOLLANDSE KUST
// ZUID 52-11.4N ..." -> status "UNLIT", kop "HOLLANDSE KUST ZUID"). Bewust
// een vaste woordenlijst i.p.v. iets slimmers: de bewoording in MSI-berichten
// is kort en vast, en een onbekend woord levert hooguit een gemiste park-
// naam op (null), nooit een verkeerde positie.
const STATUS_VERVOLGWOORD_REGEX = /^(?:AND|OR|ALL|TEMPORARILY|LIGHTS?|LIGHTING|NAV\s*AIDS?|NAVAIDS?|AIS|RACON|UNLIT|EXTINGUISHED|UNRELIABLE|INOPERATIVE|FOGHORNS?|FOG|HORNS?|SIGNALS?|DEFECTIVE|NOT|WORKING|OUT|OF|ORDER|SILENT|BLACK\s*OUT|BLACK|OUT)\b/i;

// Een sectiekop is de naam van het windpark/gebied waaronder de volgende
// posities vallen ("HOLLANDSE KUST NOORD"). Alleen accepteren als het er ook
// echt als kop uitziet: hooguit vijf woorden, geen leestekens/cijfergedoe,
// en niet de afsluitende regel van het bericht ("CANCEL MSI 191/26").
function parkKopUit(tekst) {
  if (!tekst) return null;
  const t = String(tekst).replace(/\s+/g, ' ').trim();
  if (!t) return null;
  if (/\b(CANCEL|CANCELLED|MSI|NAVAREA|NNNN|ZCZC)\b/i.test(t)) return null;
  if (!/^[A-Z][A-Z '-]*$/i.test(t)) return null;
  const woorden = t.split(' ');
  if (woorden.length > 5) return null;
  return t.slice(0, 40);
}

// Knipt de statuszin vooraan van `rest` af; geeft { statusTekst, staart }
// terug, waarbij `staart` de eventuele sectiekop van de volgende positie is.
function splitsStatusEnStaart(rest) {
  const woorden = String(rest ?? '').trim().split(/\s+/).filter(Boolean);
  let i = 0;
  while (i < woorden.length && STATUS_VERVOLGWOORD_REGEX.test(woorden[i])) i++;
  return { statusTekst: woorden.slice(0, i).join(' '), staart: woorden.slice(i).join(' ') };
}

// Los, per-platform statuslabel (UNLIT/FOGHORN INOPERATIVE/NAV AIDS
// UNRELIABLE/...) — bewust NIET via de EVENT_REGELS hierboven: die
// vereisen een triggerwoord (LIGHT/NAV AIDS/BUOY) binnen 60 tekens van een
// statuswoord, en dat triggerwoord ontbreekt vaak in zo'n kort, geïsoleerd
// statuszinnetje per platform (bv. gewoon " UNLIT " tussen twee
// coördinaten). FOGHORN eerst gecheckt (specifieker) zodat bv. "UNLIT AND
// FOGHORN INOPERATIVE" (platform G16B in MSI 214/26) het foghorn-icoon
// krijgt — inhoudelijk kloppen hier eigenlijk beide labels, maar Lex vroeg
// expliciet om foghorn-defecten een eigen icoon te geven ("voor foghorns
// inoperative zou ik aparte icons willen trouwens").
function classificeerRiglijstStatus(statusTekst) {
  if (!statusTekst) return null;
  if (/\bFOG\s*(?:HORNS?|SIGNALS?)\b[^.]{0,40}\b(INOPERATIVE|OUT\s+OF\s+ORDER|NOT\s+WORKING|DEFECTIVE|SILENT|UNRELIABLE)\b/i.test(statusTekst)) {
    return { type: 'foghorn', label: 'Misthoorn defect' };
  }
  // 2026-08-27, op verzoek van Lex, na MSI 220/26 (platform K6DN: "TOTAL
  // BLACK OUT") -- eerst tijdelijk onder 'licht-onbetrouwbaar' geschaard
  // (die tekst matchte geen van de bestaande statuswoorden), maar Lex wilde
  // hier een eigen, duidelijk zwaarder icoon voor ("we hebben dus een
  // ander icon nodig voor total black out toch?") -- "BLACK OUT" is
  // inhoudelijk ook meer dan alleen het licht (heel platform stroomloos),
  // dus nu een eigen 'blackout'-type/icoon i.p.v. meegeschaard onder
  // licht-onbetrouwbaar. Check vóór de algemene licht-regel hieronder
  // (specifieker eerst, zelfde patroon als de FOGHORN-check hierboven).
  if (/\bBLACK\s*OUT\b/i.test(statusTekst)) {
    return { type: 'blackout', label: 'Totale black-out' };
  }
  if (/\b(UNLIT|EXTINGUISHED|UNRELIABLE|INOPERATIVE|OUT\s+OF\s+ORDER|NOT\s+WORKING|DEFECTIVE)\b/i.test(statusTekst)) {
    return { type: 'licht-onbetrouwbaar', label: 'Licht onbetrouwbaar/uit' };
  }
  return null;
}

function splitsRiglijst(body) {
  const regex = new RegExp(COORD_REGEX.source, 'gi');
  const matches = [...body.matchAll(regex)];
  if (matches.length === 0) return [];

  const naEersteCoordinaat = body.slice(matches[0].index + matches[0][0].length);
  const naamStaatVoorCoordinaat = RIGLIJST_STATUSWOORD_REGEX.test(naEersteCoordinaat);
  // 2026-09-10, zie STATUS_VERVOLGWOORD_REGEX hierboven: naam NA de
  // coördinaat MET status daar weer achter (PA46-format). Alleen bekeken als
  // de naam niet vóór de coördinaat staat -- dan is het eerste woord erna de
  // naam, en bepaalt het woord dáárna welke van de twee "naam erachter"-
  // varianten het is.
  const naamDanStatus = !naamStaatVoorCoordinaat
    && RIGLIJST_STATUSWOORD_REGEX.test(naEersteCoordinaat.replace(/^\s*\S+/, ''));

  if (naamDanStatus) {
    // PA46-format: <coördinaat> <naam> <status...> [<sectiekop volgende>]
    const entries = [];
    // Kop vóór de eerste coördinaat: alles ná de inleidende frase
    // ("... HAVE DEFECTS" / "...:") is de sectiekop van de eerste positie.
    const kop = body.slice(0, matches[0].index);
    const koprest = kop.match(/(?:DEFECTS?|DEFECTIVE|FOLLOWS|:)([\s\S]*)$/i);
    let park = parkKopUit(koprest ? koprest[1] : null);
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const vanaf = match.index + match[0].length;
      const tot = i + 1 < matches.length ? matches[i + 1].index : body.length;
      const segment = body.slice(vanaf, tot).trim();
      const woorden = segment.split(/\s+/).filter(Boolean);
      const naam = woorden.length ? woorden[0].slice(0, 60) : null;
      const { statusTekst, staart } = splitsStatusEnStaart(woorden.slice(1).join(' '));
      const lat = (Number(match[1]) + Number(normaliseerMinuten(match[2])) / 60) * (match[3].toUpperCase() === 'S' ? -1 : 1);
      const lon = (Number(match[4]) + Number(normaliseerMinuten(match[5])) / 60) * (match[6].toUpperCase() === 'W' ? -1 : 1);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        const status = classificeerRiglijstStatus(statusTekst);
        entries.push({
          naam: naam || null,
          lat: +lat.toFixed(6),
          lon: +lon.toFixed(6),
          park: park ?? null,
          ...(status ? { eventType: status.type, eventLabel: status.label } : {}),
        });
      }
      // Wat na de statuszin overblijft is de sectiekop van de VOLGENDE
      // positie; blijft die leeg (of ziet het er niet als kop uit), dan valt
      // deze positie nog onder hetzelfde park als de vorige.
      const volgendPark = parkKopUit(staart);
      if (volgendPark) park = volgendPark;
    }
    return entries;
  }

  if (!naamStaatVoorCoordinaat) {
    // Bestaande logica (HAEVA-format): naam NA de coördinaat, ongewijzigd.
    const entries = [];
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const vanaf = match.index + match[0].length;
      const tot = i + 1 < matches.length ? matches[i + 1].index : body.length;
      const naamKandidaat = body
        .slice(vanaf, tot)
        .split(/[.,;]|\bIN\s+POSITION\b|\bPOSITION\b/i)[0];
      // "NEW " hoort bij het VOLGENDE platform (markeert een nieuwe
      // toevoeging t.o.v. de vorige riglijst, zie Lex' voorbeeld) en staat
      // dus aan het EIND van dit stuk tekst, vlak voor de volgende
      // coördinaat — platgeslagen (geen regeleinde om op te knippen, zie
      // hierboven) lekt dat anders mee als staart van déze naam.
      const naam = naamKandidaat ? naamKandidaat.trim().replace(/\s+NEW$/i, '').slice(0, 60) : null;
      const lat = (Number(match[1]) + Number(normaliseerMinuten(match[2])) / 60) * (match[3].toUpperCase() === 'S' ? -1 : 1);
      const lon = (Number(match[4]) + Number(normaliseerMinuten(match[5])) / 60) * (match[6].toUpperCase() === 'W' ? -1 : 1);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        entries.push({ naam: naam || null, lat: +lat.toFixed(6), lon: +lon.toFixed(6) });
      }
    }
    return entries;
  }

  // "Naam VOOR de coördinaat"-format (MSI 214/26-stijl): het stuk tekst
  // TUSSEN twee coördinaten bevat, platgeslagen zonder scheidingsteken,
  // eerst het staartje van de statustekst van het VORIGE platform en dan
  // de naam van DIT platform. Per tussenstuk wordt daarom eerst de naam
  // (het laatste woord, of de laatste twee bij de "L13 -FE1"-glitch
  // hieronder) eraf geknipt — de rest is de statustekst van het vorige
  // platform.
  const ruw = [];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const vanafVorige = i === 0 ? 0 : matches[i - 1].index + matches[i - 1][0].length;
    const segment = body.slice(vanafVorige, match.index);
    const woorden = segment.trim().split(/\s+/).filter(Boolean);
    let naam = null;
    let statusVanVorige = '';
    if (woorden.length > 0) {
      const laatste = woorden[woorden.length - 1];
      // Ontvangstglitch (gezien bij "L13 -FE1" i.p.v. "L13-FE1" — een
      // stray spatie vlak voor het koppelteken): dan hoort het woord
      // ERVOOR ook nog bij de naam.
      if (/^-/.test(laatste) && woorden.length > 1) {
        naam = `${woorden[woorden.length - 2]}${laatste}`;
        statusVanVorige = woorden.slice(0, -2).join(' ');
      } else {
        naam = laatste;
        statusVanVorige = woorden.slice(0, -1).join(' ');
      }
    }
    if (i > 0 && ruw.length > 0) ruw[ruw.length - 1].statusTekst = statusVanVorige;
    const lat = (Number(match[1]) + Number(normaliseerMinuten(match[2])) / 60) * (match[3].toUpperCase() === 'S' ? -1 : 1);
    const lon = (Number(match[4]) + Number(normaliseerMinuten(match[5])) / 60) * (match[6].toUpperCase() === 'W' ? -1 : 1);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      ruw.push({ naam: naam ? naam.slice(0, 60) : null, lat: +lat.toFixed(6), lon: +lon.toFixed(6), statusTekst: '' });
    }
  }
  // Laatste platform: geen volgende coördinaat om op te knippen, dus de
  // statustekst loopt door tot het einde van het bericht.
  if (ruw.length > 0) {
    const laatsteMatch = matches[matches.length - 1];
    ruw[ruw.length - 1].statusTekst = body.slice(laatsteMatch.index + laatsteMatch[0].length);
  }

  return ruw.map(({ statusTekst, ...rest }) => {
    const status = classificeerRiglijstStatus(statusTekst);
    return status ? { ...rest, eventType: status.type, eventLabel: status.label } : rest;
  });
}

// 2026-08-26, op verzoek van Lex, na PA37 (HINDERPLAAT: "THE FOLLOWING
// LIGHT BUOYS ARE ESTABLISHED A-WEST CARDINAL SPAR LIGHT BUOY K-MV A
// VQ(9)W.10S ESTABLISHED IN POS 51-54,729N 003-58,243E B- WEST CARDINAL
// SPAR LIGHT BUOY K-MV B VQ(9)W.10S ESTABLISHED IN POS 51-54,977N
// 003-58,263E.."): net als een riglijst-bericht (zie splitsRiglijst
// hierboven) beschrijft dit bericht MEERDERE LOSSE boeien in EEN NAVTEX-
// bericht. Zonder deze splitsing werd dit als "lijn" tussen de twee boeien
// getekend (zie classificeerGeometrie hieronder: 2 coordinaten zonder
// LIJN_TRIGGER/kabel-type vallen standaard terug op "lijn") -- fout hier,
// het zijn twee onafhankelijke boeien, geen tracé.
//
// Andere veldvolgorde dan splitsRiglijst hierboven: bij een riglijst staat
// de naam NA de positie, hier staat de boei-omschrijving ERVOOR, gevolgd
// door "ESTABLISHED IN POS <coordinaat>". Zoekt daarom vanaf elke
// coordinaat TERUG naar de dichtstbijzijnde "[LETTER]-...ESTABLISHED IN
// POS"-aanloop, i.p.v. vooruit zoals bij rigs.
//
// Op Lex' eigen verzoek: bij een klik op zo'n boei-pin toont de app straks
// deze naam i.p.v. de volledige berichttekst (zie detail.boeiNaam hieronder
// en popupHtml() in app.js) -- de tekst geldt namelijk voor de HELE lijst
// boeien, niet specifiek voor de ene boei waarop geklikt is.
// 2026-08-26, op verzoek van Lex ("die cardinal boeien kunnen we dus
// specifiek laten zien ook, in de juiste kleuren") -- IALA-kardinaaltekens
// (NORTH/EAST/SOUTH/WEST CARDINAL) krijgen een eigen icoon met de echte
// zwart/geel-banden + topmark-vorm (zie NAVTEX_BOEI_CARDINAAL_SVG in
// app.js), i.p.v. het generieke groene "nieuwe boei"-icoon. Puur
// trefwoord-match op de Engelse windrichting + "CARDINAL" -- staat letterlijk
// zo in de MSI-tekst (bevestigd bij PA37/HINDERPLAAT: "WEST CARDINAL SPAR
// LIGHT BUOY"). Geen L/N/O/Z/W-afkortingen geprobeerd (te makkelijk te
// verwarren met andere lettercombinaties in de tekst, bv. boei-namen).
const CARDINAAL_REGEX = /\b(NORTH|EAST|SOUTH|WEST)\s+CARDINAL\b/i;
const CARDINAAL_RICHTING_PER_WOORD = { NORTH: 'noord', EAST: 'oost', SOUTH: 'zuid', WEST: 'west' };
// 2026-08-26, op verzoek van Lex (ZINK-N: geen letterlijk "CARDINAL" in de
// tekst, maar wel "Q/W" als lichtkarakteristiek): fallback die de
// windrichting afleidt uit de lichtkarakteristiek zelf i.p.v. het woord
// CARDINAL. IALA-standaard, door Lex zelf met bronnen bevestigd: continu
// snelflitsend wit licht (Q/VQ, geen groepsgetal) is wereldwijd EXCLUSIEF
// gereserveerd voor noord-kardinaal; met groepsgetal (3)/(9) voor oost/west
// en (6)+lange flits voor zuid. Vaste tabel-vertaling, geen gok op de
// boeinaam alleen (die is formeel niet sluitend -- ZINK-A..ZINK-N-achtige
// reeksen bestaan ook voor gewone gele speciale boeien). Alleen het
// Noord-geval (kale Q/VQ zonder groep) is tot nu toe tegen een echt
// ontvangen bericht geverifieerd (ZINK-N); Oost/Zuid/West volgen dezelfde
// IALA-tabel maar zijn nog niet in een live ontvangen bericht gezien --
// bij twijfel of een onbekende combinatie levert dit bewust null (geen
// icoon) i.p.v. een verkeerde windrichting.
function cardinaalRichtingUitLicht(lichtMatch) {
  if (!lichtMatch) return null;
  const type = lichtMatch[1].toUpperCase();
  if (type !== 'Q' && type !== 'VQ') return null;
  const kleur = lichtMatch[4] ? lichtMatch[4].toUpperCase() : null;
  if (kleur && kleur !== 'W') return null; // expliciet een andere kleur -> geen kardinaal-conclusie
  const groep = lichtMatch[2] ?? '';
  const langeFlits = Boolean(lichtMatch[3]);
  if (groep === '' && !langeFlits) return 'noord';
  if (groep === '3' && !langeFlits) return 'oost';
  if (groep === '6' && langeFlits) return 'zuid';
  if (groep === '9' && !langeFlits) return 'west';
  return null; // onbekende combinatie -> bewust geen gok
}
function cardinaalRichtingUit(tekst) {
  const woordMatch = CARDINAAL_REGEX.exec(tekst);
  if (woordMatch) return CARDINAAL_RICHTING_PER_WOORD[woordMatch[1].toUpperCase()];
  // Geen letterlijk "CARDINAL" gevonden -> licht-gebaseerde fallback
  // hierboven, op dezelfde naam+lichtcode als boeiDetailsUit() hieronder
  // gebruikt (BOEI_ENKEL_NAAM_REGEX/BOEI_LICHT_REGEX zijn verderop in dit
  // bestand gedefinieerd maar zijn er tegen de tijd dat deze functie
  // daadwerkelijk aangeroepen wordt, gewoon beschikbaar).
  const naamMatch = BOEI_ENKEL_NAAM_REGEX.exec(tekst);
  if (!naamMatch) return null;
  const naTekst = tekst.slice(naamMatch.index + naamMatch[0].length, naamMatch.index + naamMatch[0].length + 30);
  return cardinaalRichtingUitLicht(BOEI_LICHT_REGEX.exec(naTekst));
}

const BOEI_NAAM_REGEX = /\b([A-Z])\s*-\s*([\s\S]{1,90}?)\s+ESTABLISHED\s+IN\s+POS(?:ITION)?\s*:?\s*$/i;
// 2026-09-06, zie de aanroep in fetchNavtexLokaal(): geletterde/genummerde
// puntenlijst. Elke coördinaat moet in zijn eigen stuk tekst (sinds de vorige
// coördinaat) een lijstteken hebben -- "A." / "B." (losse hoofdletter + punt)
// of "1." / "(2)" -- anders is het geen opsomming en geeft dit [] terug.
// Naam = tekst tussen dat lijstteken en de coördinaat, opgeschoond ("C22").
const PUNT_LIJSTTEKEN_REGEX = /(?:^|[\s.;:])(?:([A-Z])\.|\(?(\d{1,2})[.)])\s+([^]*?)$/;
export function splitsPuntenLijst(body) {
  const entries = [];
  const regex = new RegExp(COORD_REGEX.source, 'gi');
  const matches = [...body.matchAll(regex)];
  let vanaf = 0;
  for (const match of matches) {
    const stuk = body.slice(vanaf, match.index);
    const m = PUNT_LIJSTTEKEN_REGEX.exec(stuk);
    if (!m) return [];
    const naam = (m[3] ?? '').replace(/[\s,.:;-]+$/g, '').replace(/\s+/g, ' ').trim();
    if (naam.length > 40) return []; // te veel tekst tussen lijstteken en coördinaat -- geen kale puntenlijst
    const lat = (Number(match[1]) + Number(normaliseerMinuten(match[2])) / 60) * (match[3].toUpperCase() === 'S' ? -1 : 1);
    const lon = (Number(match[4]) + Number(normaliseerMinuten(match[5])) / 60) * (match[6].toUpperCase() === 'W' ? -1 : 1);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
    entries.push({ naam: naam || null, lat: +lat.toFixed(6), lon: +lon.toFixed(6) });
    vanaf = match.index + match[0].length;
  }
  return entries;
}

function splitsBoeiLijst(body) {
  const entries = [];
  const regex = new RegExp(COORD_REGEX.source, 'gi');
  const matches = [...body.matchAll(regex)];
  let vanaf = 0;
  for (const match of matches) {
    const stuk = body.slice(vanaf, match.index);
    const naamMatch = BOEI_NAAM_REGEX.exec(stuk);
    // Geen match (bv. ongebruikelijke frasering) -- dan liever geen naam
    // dan een gegokte, net als bij splitsRiglijst hierboven.
    const naam = naamMatch ? `${naamMatch[1]}-${naamMatch[2].trim().replace(/\s+/g, ' ')}` : null;
    // Richting uit hetzelfde stukje tekst (dus per boei, niet voor de hele
    // lijst -- bij een gemengde lijst kan elke boei een andere windrichting
    // hebben, zie cardinaalRichtingUit() hierboven).
    const richting = cardinaalRichtingUit(stuk);
    const lat = (Number(match[1]) + Number(normaliseerMinuten(match[2])) / 60) * (match[3].toUpperCase() === 'S' ? -1 : 1);
    const lon = (Number(match[4]) + Number(normaliseerMinuten(match[5])) / 60) * (match[6].toUpperCase() === 'W' ? -1 : 1);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      entries.push({ naam, lat: +lat.toFixed(6), lon: +lon.toFixed(6), richting });
    }
    vanaf = match.index + match[0].length;
  }
  return entries;
}

// 2026-08-26, op verzoek van Lex, na PA04 ("WAVERIDER BUOY DEPLOYED"):
// zelfde wens als bij splitsBoeiLijst() hierboven ("niet het bericht, maar
// de naam/classificatie"), maar dan voor een LOSSE boei (1 coordinaat) --
// geen "[LETTER]-...ESTABLISHED IN POS"-lijstpatroon om op te leunen. Hier
// simpeler: het referentienummer (bv. "MSI 184/26") en de coordinaat zelf
// (staat al apart in detail.positie / op de kaart, geen reden om 'm ook nog
// in de tekst te herhalen) eruit knippen, plus alles vanaf een eventuele
// "NNNN" (bericht-einde-marker) -- bij een gehavende ontvangst staat daar
// soms nog rommel achter (zie kwaliteitsScore() hierboven, "NNNN <rommel>"),
// en voor een KORTE samenvatting is dat nooit bruikbare inhoud. Wat overblijft
// is het beschrijvende stuk, bv. "PUZZLE HOLE WAVERIDER BUOY DEPLOYED".
// Alleen toegepast op eventType 'boei-nieuw' (zie hieronder) -- andere types
// tonen nog gewoon het volledige bericht, dit was specifiek Lex' wens voor
// boeien.
// 2026-08-26, op verzoek van Lex, na een ZINK-N-lichtboei-melding
// ("COASTAL ZONE NEAR GOEREE/STELLENDAM APPROACH LIGHTBUOY ZINK-N Q/W
// ESTABLISHED"): dit soort berichten heeft GEEN coördinaat (dus
// positieIsStation blijft van toepassing, zie hierboven), maar wel een
// naam en een lichtkarakteristiek in een vast NAVTEX-formaat -- die kunnen
// wél netjes uitgelezen worden, ook zonder positie. Bewust GEEN poging om
// hier alsnog een positie bij te verzinnen of op te zoeken (bevestigd met
// Lex: alleen naam/lichtkarakteristiek tonen, de kaartpositie blijft het
// zendstation zoals bij elk ander coördinaatloos bericht).
//
// Lichtkarakteristiek-afkortingen volgen de internationale IALA-notatie
// (bv. "Q" = quick flashing, "Fl" = flashing, "Iso" = isophase) gevolgd
// door een kleurletter (W/R/G/Y) -- hier alleen de meest voorkomende
// afkortingen, niet de volledige IALA-lijst (geen aanwijzing dat de
// zeldzamere varianten in dit lokale-ontvangstgebied ooit voorkomen; een
// onherkende afkortig levert gewoon lichtKarakteristiek zonder
// lichtOmschrijving op, geen gegokte vertaling).
// Hoofdletter-genormaliseerde sleutels -- NAVTEX-tekst zelf is altijd
// HOOFDLETTERS (telegrafie-achtige transmissie), dus de regex hieronder is
// case-insensitive (/i) en het gematchte type/kleur wordt vóór opzoeken
// naar hoofdletters genormaliseerd.
const BOEI_LICHT_TYPE_OMSCHRIJVING = {
  VQ: 'zeer snel knipperend',
  LFL: 'lang flikkerend',
  FL: 'flikkerend',
  ISO: 'isofase',
  OC: 'onderbroken',
  Q: 'snel knipperend',
  F: 'vast',
};
const BOEI_LICHT_KLEUR_OMSCHRIJVING = { W: 'wit', R: 'rood', G: 'groen', Y: 'geel' };
// Licht-code direct ná de naam, bv. "Q/W", "Fl(2)W", "Iso.G" -- het
// optionele groepje-getal ("(2)") is standaard IALA-notatie (aantal
// flitsen), maar een eventuele tijdsduur erna (bv. ".10s") wordt bewust
// NIET meegenomen: geen bevestigd echt voorbeeld van hoe dat in deze
// bron precies genoteerd wordt, dus liever een kortere-maar-zekere
// lichtKarakteristiek dan een gegokt langer patroon. \b ná elke
// letter-afkorting voorkomt dat dit per ongeluk matcht op de eerste
// letters van een gewoon woord erna (bv. "Fl" in "FLASHING" zonder
// lichtcode-achtig vervolg) -- \b faalt daar want "l" en "A" zijn allebei
// woordtekens, geen grens.
const BOEI_LICHT_REGEX = /^\s*(VQ|LFl|Fl|Iso|Oc|Q|F)\b(?:\((\d+)\))?(\+\s*LFl)?[/.]?([WRGY])?\b/i;
// Naam direct ná "(LIGHT)?BUOY" -- met een negative lookahead voor
// ESTABLISHED/DEPLOYED, want bij "WAVERIDER BUOY DEPLOYED" (zie
// boeiOmschrijvingUit hieronder, ander bestaand berichttype) staat er
// geen naam, alleen die twee woorden, en zonder deze uitzondering zou
// "DEPLOYED" zelf per ongeluk als "naam" gelezen worden.
const BOEI_ENKEL_NAAM_REGEX = /(?:LIGHT)?BUOY\s+(?!(?:ESTABLISHED|DEPLOYED)\b)([A-Z0-9][A-Z0-9\-]{0,20})\b/i;

function boeiDetailsUit(body) {
  const naamMatch = BOEI_ENKEL_NAAM_REGEX.exec(body);
  if (!naamMatch) return null;
  const naam = naamMatch[1];
  // 2026-08-26: tekst vóór "(LIGHT)?BUOY" is meestal de omschrijving van het
  // gebied/de nadering (bv. "COASTAL ZONE NEAR GOEREE/STELLENDAM APPROACH"),
  // die anders stilzwijgend verdween t.o.v. de vroegere platte weergave.
  // Zelfde defensieve opschoning als boeiOmschrijvingUit() hierboven
  // (referentiecode eruit, whitespace normaliseren) zodat de logica simpel
  // en consistent blijft.
  const voorTekst = body
    .slice(0, naamMatch.index)
    .replace(new RegExp(REFERENTIE_REGEX.source, 'gi'), '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^[\s,.\-]+|[\s,.\-]+$/g, '')
    .trim();
  const gebied = voorTekst.length > 0 ? voorTekst : null;
  // 20 -> 30 tekens: het "+LFl"-samenstelsuffix (zuid-kardinaal, zie
  // cardinaalRichtingUitLicht() hierboven) plus een duur-aanduiding als
  // ".15s" ervoor kunnen de kleurletter net buiten een kortere window duwen.
  const naTekst = body.slice(naamMatch.index + naamMatch[0].length, naamMatch.index + naamMatch[0].length + 30);
  const lichtMatch = BOEI_LICHT_REGEX.exec(naTekst);
  if (!lichtMatch) return { naam, gebied, lichtKarakteristiek: null, lichtOmschrijving: null };
  const type = BOEI_LICHT_TYPE_OMSCHRIJVING[lichtMatch[1].toUpperCase()] ?? null;
  // 2026-08-26: groepsgetal (groep 2) en +LFl-samenstelsuffix (groep 3)
  // kwamen erbij t.b.v. cardinaalRichtingUitLicht() hierboven -- kleur
  // schoof daardoor van groep 2 naar groep 4.
  const kleur = lichtMatch[4] ? BOEI_LICHT_KLEUR_OMSCHRIJVING[lichtMatch[4].toUpperCase()] : null;
  // (bewust dezelfde .toUpperCase()-normalisatie als hierboven, nu de
  // regex zelf ook case-insensitive is)
  const omschrijving = type ? `${type}${kleur ? ` ${kleur}` : ''} licht` : null;
  return { naam, gebied, lichtKarakteristiek: lichtMatch[0].trim(), lichtOmschrijving: omschrijving };
}

function boeiOmschrijvingUit(body) {
  return body
    .replace(new RegExp(REFERENTIE_REGEX.source, 'gi'), '')
    .replace(new RegExp(COORD_REGEX.source, 'gi'), '')
    .replace(/\bNNNN\b[\s\S]*$/i, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^[\s,.\-]+|[\s,.\-]+$/g, '')
    .trim();
}

// 2026-08-24-fix: bleek bij het testen tegen Lex' eigen bestand een
// verborgen dataverlies-bug te maskeren. Segmentatie liep tot nu toe op
// LEGE REGELS (\n\s*\n+) — prima voor de meeste berichten, maar de twee
// AVURNAV CHERBOURG-polygoonberichten (KA58/KA53) bleken elke coördinaat op
// een eigen, door een lege regel omringde regel te hebben. Daardoor brak dat
// ÉÉN logische bericht in tientallen losse fragmentjes, waarvan alleen het
// allereerste stukje (code + eerste regel, verder niks) nog een ZCZC bevatte
// — de rest (bijna de hele polygoon + het "SCIENTIFIC INSTRUMENTS..."-lijf)
// belandde in ZCZC-loze fragmentjes en werd stilletjes weggegooid door
// parseBlok() hieronder (`!body` → null). Nieuwe segmentatie: elk bericht
// loopt van de ene ZCZC-marker tot de volgende (of tot het eind van het
// bestand) — lege regels ERBINNEN maken dan niks meer stuk.
function segmenteerBerichten(tekst) {
  const startIndices = [];
  const re = /ZCZC/gi;
  let m;
  while ((m = re.exec(tekst)) !== null) startIndices.push(m.index);
  return startIndices.map((start, i) => {
    const eind = i + 1 < startIndices.length ? startIndices[i + 1] : tekst.length;
    return tekst.slice(start, eind).trim();
  });
}

// Eén bericht-segment (zie segmenteerBerichten hierboven) omzetten naar een
// los, nog-niet-gefilterd bericht-object. Zelfde opschoning als navtex.js,
// met twee verschillen: (1) ZCZC wordt GEZOCHT i.p.v. verondersteld aan het
// begin te staan (bitfouten plakken er soms een teken voor, bv. "WZCZC" of
// een heel voorgaand restje zoals "VIK SKZCZC" — segmenteerBerichten snijdt
// al ÓP de ZCZC-match zelf, dus dit vangt alleen nog een eventueel restje
// vóór die exacte match), en (2) de station/type-uitlezing is stricter, zie
// leesStationEnType().
function parseBlok(blok, stations = STATION_PER_ID, zelfIdentificatie = []) {
  const zczcIndex = blok.search(/ZCZC/i);
  if (zczcIndex < 0) return null; // geen herkenbare berichtstart in dit blok
  const vanafZczc = blok.slice(zczcIndex);

  // 2026-08-24-fix: `\s{2,}` platsloeg TOT NU TOE ook lege regels (\n\n) plat
  // tot één spatie -- onschuldig bij berichten met alles op een paar volle
  // regels, maar bij dit "één zin per regel, lege regel ertussen"-format
  // (zie KA58/KA53 hierboven) smolten daardoor meerdere losse inhoudsregels
  // (kop, gebiedsnaam, onderwerp, datumvenster) samen tot ÉÉN regel, die dan
  // per ongeluk als de "datumregel" (lines[1] hieronder) werd gelezen i.p.v.
  // als los stuk BODY -- met als concreet gevolg dat het woord "SCIENTIFIC"
  // uit de body verdween en het bericht fout als "overig" classificeerde
  // i.p.v. "wetenschappelijk". Nu twee aparte stappen: eerst alleen
  // horizontale witruimte (spaties/tabs) platslaan, dan pas lege regels
  // samenvoegen tot één regeleinde (in plaats van laten verdwijnen) — zodat
  // elke oorspronkelijke inhoudsregel een eigen array-element blijft.
  const cleaned = vanafZczc
    .replace(/^ZCZC\s*/i, '')
    // 2026-08-26-fix, op melding van Lex (screenshot: waaier roze lijnen tot
    // voorbij Angers, hierboven het KA53/Niton-uitschieteronderzoek) --
    // bleek uiteindelijk een TWEEDE, apart mechanisme te zijn, naast de
    // uitschieter-fix in verwijderUitschieters() hierboven: VA08 (Oostende
    // Radio) had een eigen, keurig afgesloten bericht ("...MISSING. NNNN"),
    // maar segmenteerBerichten() hierboven splitst UITSLUITEND op de
    // volgende "ZCZC" -- niet op "NNNN" -- juist om de KA58/KA53-
    // polygoonberichten niet meer stuk te breken (zie de 2026-08-24-
    // toelichting daar). Toen het ZCZC-kopje van het VOLGENDE bericht
    // corrupt binnenkwam ("OCZC" i.p.v. "ZCZC" -- een bitfout), vond
    // segmenteerBerichten() dus geen nieuwe grens en liep VA08's segment
    // gewoon door tot het ECHT volgende (wel intacte) ZCZC -- met het hele
    // tweede bericht (incl. een eigen "AREA BOUNDED BY"-polygoon rond
    // Cherbourg) er middenin geplakt. Deze regel stripte NNNN-rommel tot nu
    // toe alleen als die LETTERLIJK aan het eind van de string stond
    // (`\s*$`) -- bij rommel/een tweede bericht ERNA (zoals hier) deed hij
    // dus niets, en bleven de coordinaten van beide berichten samen in één body
    // zitten, dus ook in één (nonsens-)geometrie. Nu: alles vanaf de eerste
    // "NNNN" (met de bestaande tolerantie voor 0-3 letters ervoor, bv.
    // "SNNNN") wordt weggeknipt, ongeacht wat erna komt -- net als de
    // langer bestaande `\bNNNN\b[\s\S]*$`-aanpak in boeiOmschrijvingUit()
    // hieronder, nu ook hier, VOOR de regel-opsplitsing, zodat ALLE
    // eventTypes ervan profiteren (niet alleen boei-nieuw z'n samenvatting).
    .replace(/[A-Z]{0,3}NNNN[\s\S]*$/i, '') // "NNNN" (of "SNNNN" e.d.), plus alles erna
    .replace(/[_*]+/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .replace(/[^\x20-\x7E\n]/g, '')
    .trim();

  const lines = cleaned.split('\n').map((l) => l.trim()).filter(Boolean);
  // 2026-08-26-fix, op melding van Lex (live: code "SA05NC-OAMBURG" i.p.v.
  // "SA05" -- vermoedelijk een weggevallen regeleinde tijdens ontvangst,
  // waardoor de eerste regel van de body ("...HAMBURG...", Pinneberg ligt
  // er dichtbij) tegen de codelijn aan plakte). GEEN kansrekening/woorden-
  // voorspelling op toepassen -- dat is prima voor vrije berichttekst-typo's
  // maar hier is de codevorm exact gespecificeerd (station+type+volgnummer,
  // zie leesStationEnType()), dus gewoon dat harde patroon eraf knippen i.p.v.
  // gokken wat de rest zou moeten zijn. Bijkomend voordeel: volgnummerIn()
  // hieronder (zoekt cijfers aan het EIND van de code) en dedupSleutel()
  // (gebruikt de code 1-op-1 als sleutel) faalden/verschilden stil bij zo'n
  // vervuilde code -- dit fixt die twee ook meteen mee, niet alleen de
  // weergave. Geen match (code volgt het patroon totaal niet) -> ongewijzigd
  // laten staan, net als voorheen, i.p.v. het bericht te laten sneuvelen.
  const codeRuw = lines[0] || '';
  const codeMatch = /^([A-Z]{2}\d{1,3})/.exec(codeRuw);
  const code = codeMatch ? codeMatch[1] : codeRuw;
  const datumregel = lines[1] || '';
  const body = lines.slice(2).join(' ');
  if (!code || !body) return null;

  // 2026-08-25, op verzoek van Lex (screenshot van de ruwe ontvangst met
  // nette regeleinden per zin/coördinaat, versus de app die alles tot 1
  // lange lopende regel platslaat: "regeleinden kunnen die mee?") — een
  // APARTE weergavetekst, naast `body` hierboven. `body` blijft bewust
  // ongewijzigd (ruimte-gescheiden): daar leunen alle regexen in dit bestand
  // op (COORD_REGEX, EVENT_REGELS, REFERENTIE_REGEX, de NNNN-check in
  // kwaliteitsScore, hashTekst, ...), en dat allemaal laten meebewegen naar
  // regeleinde-gescheiden tekst is een onnodig risico voor iets dat puur
  // over WEERGAVE gaat. `weergaveTekst` hergebruikt dezelfde `lines` (dus
  // dezelfde opschoning), alleen met '\n' i.p.v. ' ' als scheidingsteken —
  // de frontend heeft `white-space: pre-wrap` al staan op `.popup-advies`
  // (zie styles.css), dus dit is puur een backend-aanpassing.
  const weergaveTekst = lines.slice(2).join('\n');

  const { stationId: letterId, typeLetter } = leesStationEnType(code);
  // 2026-09-10: zelfnoeming in de kop wint van de letter (zie
  // ZELF_IDENTIFICATIE_490 hierboven voor het waarom en de grenzen). Ook
  // `stationId` gaat mee, zodat de 72-uur-vervalregel en de groepering
  // Mondolfo en Corsen als APARTE stations bijhouden i.p.v. onder één 'E'.
  const genoemd = zoekZelfIdentificatie(lines.slice(0, 3).join('\n'), zelfIdentificatie, stations);
  const station = genoemd ?? (letterId ? stations.get(letterId) ?? null : null);
  const stationId = genoemd ? genoemd.id : letterId;
  const ruweDatum = datumIn(datumregel) ?? datumInBodyZonderGeldigheidsclausules(body); // sommige blokken missen de aparte datumregel niet, maar staat 'ie soms toch pas in de body
  // 2026-08-24-fix, op melding van Lex (een NAVTEX-melding met datum "12 sep"
  // terwijl vandaag 24 aug is): een NAVTEX-bericht kan niet uit de toekomst
  // verzonden zijn. De datumIn(body)-terugval hierboven scant de HELE body,
  // en pakte bij dit soort ruizinge ontvangst soms een ANDERE datum in het
  // bericht i.p.v. de echte verzenddatum — met name de "CANCEL THIS MSG
  // <DTG>"-geldigheidsdatum verderop in AVURNAV CHERBOURG-berichten (bv.
  // "CANCEL THIS MSG 152359 UTC SEP 26"), die per definitie in de toekomst
  // ligt t.o.v. het moment van verzenden. 2 uur marge voor kloktolerantie
  // tussen ontvanger en server, verder simpel: toekomst = onbetrouwbaar, dan
  // liever "onbekend" (valt terug op eersteOntvangst(), zie hierboven) dan
  // een zichtbaar verkeerde datum tonen.
  const TOEKOMST_MARGE_MS = 2 * 60 * 60 * 1000;
  const datum = ruweDatum && ruweDatum.getTime() <= Date.now() + TOEKOMST_MARGE_MS ? ruweDatum : null;
  const coords = verwijderUitschieters(coordinatenIn(body));

  return { code, station, stationId, typeLetter, datum, body, weergaveTekst, coords }; // stationId sinds 2026-09-06, zie nietMeerHerhaald()
}

// 2026-08-27, op verzoek van Lex ("ik heb een systemd naar tail -f
// ~/navtex_berichten.txt — kan ik de binnenkomende tekst ook tonen in de
// app?") — de staart van het ruwe ontvangstbestand, voor de 📻-viewer in de
// frontend (zie /api/navtex-ruw in server.js). Leest bewust alleen de
// laatste maxBytes via een gerichte tail-read (het bestand is append-only en
// groeit onbeperkt — het hele bestand inlezen zou hier op den duur zonde
// zijn, en de viewer toont toch alleen het recente stuk). Bij afkappen wordt
// de halve eerste regel weggegooid zodat de weergave nooit midden in een
// regel begint. Zelfde pad-logica als fetchNavtexLokaal() hieronder.
// ---- Begintijden van ruwe blokken (2026-08-28) -------------------------
// Op verzoek van Lex ("kan je achteraf in dat tekstfile de begintijd er nog
// voor zetten, en streep eronder"): het bronbestand zelf blijft bewust rauw
// (de decoder schrijft er live in — er tussendoor schrijven geeft races, en
// het bestand-ertussen-patroon is juist de kracht), maar de VIEWER kan per
// bericht een kopregel tonen — en die kan daar wél groter en in kleur, wat
// in een .txt nooit had gekund. Hiervoor onthouden we per ZCZC-blok de
// BESTANDSPOSITIE waar het begint en wanneer we het voor het eerst zagen.
// De positie is het ankerpunt: het bestand is append-only, dus een offset
// verandert nooit meer — en herhaalde uitzendingen van exact hetzelfde
// bericht krijgen zo elk hun eigen begintijd (elke herhaling staat immers
// op een nieuwe positie). Nauwkeurigheid = de pollcyclus van deze bron
// (2 min), ruim genoeg voor "wanneer kwam dit binnen".
// Zelfde persistentie-patroon als EERSTE_ONTVANGST_BESTAND hierboven.
// Offsets zijn tekenposities in de utf-8-tekst; de decoder-uitvoer is
// (SITOR-B) puur ASCII, dus teken- en bytepositie vallen samen — mocht er
// ooit een multibyte-teken insluipen, dan verschuift een kopregel hooguit
// een paar tekens, nooit fataal.
const RUW_TIJDEN_BESTAND = path.join(homedir(), 'navtex_ruw_tijden.json');
const RUW_TIJDEN_BESTAND_490 = path.join(homedir(), 'navtex_ruw_tijden_490.json');
const RUW_TIJDEN_MAX = 800;

function laadRuweBlokTijden(tijdenBestand) {
  try {
    if (!existsSync(tijdenBestand)) return [];
    const ruw = JSON.parse(readFileSync(tijdenBestand, 'utf-8'));
    return Array.isArray(ruw) ? ruw.filter((b) => Number.isFinite(b?.offset) && b?.tijd) : [];
  } catch (err) {
    console.error('[weer] navtexLokaal: ruw-tijden-bestand niet leesbaar, begin leeg:', err.message ?? err);
    return [];
  }
}

// 2026-09-08: één "band" per NAVTEX-frequentie — eigen ontvangstbestand,
// eigen stationstabel, eigen bloktijdenregister, eigen id-voorvoegsel (zodat
// "BA12" op 490 en "BA12" op 518 nooit samensmelten). fetchNavtexLokaal()
// draait de hele verwerking per band. BAND_518 is wat de 📻-viewer toont.
const BAND_518 = { frequentieKhz: 518, bestand: () => process.env.NAVTEX_LOKAAL_BESTAND || STANDAARD_BESTAND, stations: STATION_PER_ID, zelfId: ZELF_IDENTIFICATIE_518, idPrefix: 'navtexlokaal', tijdenBestand: RUW_TIJDEN_BESTAND, tijden: laadRuweBlokTijden(RUW_TIJDEN_BESTAND) };
// 490-pad: expliciet via NAVTEX_LOKAAL_BESTAND_490, anders NAAST het 518-
// bestand (zelfde map, '_490' erachter) — niet via homedir(), want de app
// draait als root en het 518-pad staat in .env op /home/lex (gezien
// 2026-09-08: '/root/navtex_berichten_490.txt bestaat nog niet').
const BAND_490 = { frequentieKhz: 490, bestand: () => process.env.NAVTEX_LOKAAL_BESTAND_490 || BAND_518.bestand().replace(/(\.[^.\/]*)?$/, (ext) => `_490${ext}`), stations: STATION_PER_ID_490, zelfId: ZELF_IDENTIFICATIE_490, idPrefix: 'navtexlokaal490', tijdenBestand: RUW_TIJDEN_BESTAND_490, tijden: laadRuweBlokTijden(RUW_TIJDEN_BESTAND_490) };
const BANDEN = [BAND_518, BAND_490];

// Aangeroepen vanuit fetchNavtexBand() met de zojuist gelezen RAUWE tekst
// (vóór elke normalisatie, zodat de offsets bij het bestand blijven horen).
function registreerRuweBlokTijden(band, ruweTekst) {
  try {
    let ruweBlokTijden = band.tijden;
    // Bestand gekrompen (handmatig geleegd/geroteerd)? Dan kloppen alle
    // onthouden posities niet meer — opnieuw beginnen.
    if (ruweBlokTijden.length && ruweBlokTijden[ruweBlokTijden.length - 1].offset >= ruweTekst.length) {
      ruweBlokTijden = [];
    }
    const bekend = new Set(ruweBlokTijden.map((b) => b.offset));
    const re = /ZCZC/g;
    const nu = new Date().toISOString();
    let m;
    let nieuw = false;
    while ((m = re.exec(ruweTekst)) !== null) {
      if (!bekend.has(m.index)) {
        ruweBlokTijden.push({ offset: m.index, tijd: nu });
        nieuw = true;
      }
    }
    if (nieuw) {
      ruweBlokTijden.sort((a, b) => a.offset - b.offset);
      if (ruweBlokTijden.length > RUW_TIJDEN_MAX) ruweBlokTijden = ruweBlokTijden.slice(-RUW_TIJDEN_MAX);
      writeFileSync(band.tijdenBestand, JSON.stringify(ruweBlokTijden), 'utf-8');
    }
    band.tijden = ruweBlokTijden;
  } catch (err) {
    console.error('[weer] navtexLokaal: ruw-tijden bijwerken mislukt:', err.message ?? err);
  }
}

// 2026-08-27 (vervolg): alleen de bestandsstatus, zonder de inhoud te lezen
// — voor de AUTO-schakelmonitor in de frontend (zie zorgNavtexAutoMonitor()
// in app.js), die elke ~10s alleen wil weten OF het bestand groeit. Een kale
// stat() is daarvoor genoeg; de volledige tail wordt pas gelezen zodra de
// viewer echt opent.
export function ruweOntvangstStatus() {
  const bestand = process.env.NAVTEX_LOKAAL_BESTAND || STANDAARD_BESTAND;
  if (!existsSync(bestand)) return { bestandsBytes: 0, bijgewerkt: null };
  const s = statSync(bestand);
  return { bestandsBytes: s.size, bijgewerkt: s.mtime.toISOString() };
}

export function leesRuweOntvangst(maxBytes = 64 * 1024) {
  const bestand = process.env.NAVTEX_LOKAAL_BESTAND || STANDAARD_BESTAND;
  if (!existsSync(bestand)) return { tekst: null, bestandsBytes: 0, bijgewerkt: null };
  const s = statSync(bestand);
  const lees = Math.min(maxBytes, s.size);
  if (lees === 0) return { tekst: '', bestandsBytes: 0, bijgewerkt: s.mtime.toISOString() };
  const fd = openSync(bestand, 'r');
  try {
    const buf = Buffer.alloc(lees);
    readSync(fd, buf, 0, lees, s.size - lees);
    let tekst = buf.toString('utf-8').replace(/\r\n/g, '\n');
    let weggeknipt = 0;
    if (lees < s.size) {
      const knip = tekst.indexOf('\n') + 1;
      weggeknipt = Buffer.byteLength(tekst.slice(0, knip));
      tekst = tekst.slice(knip);
    }
    // 2026-08-28: begintijden van de blokken in dit staartstuk meegeven —
    // offsets omgerekend van bestandspositie naar positie binnen `tekst`
    // (zie ruweBlokTijden hierboven). De viewer tekent er kopregels mee.
    const startInBestand = s.size - lees + weggeknipt;
    const blokken = BAND_518.tijden
      .filter((b) => b.offset >= startInBestand && b.offset < s.size)
      .map((b) => ({ offset: b.offset - startInBestand, tijd: b.tijd }));
    return { tekst, bestandsBytes: s.size, bijgewerkt: s.mtime.toISOString(), blokken };
  } finally {
    closeSync(fd);
  }
}

// 2026-09-08, op verzoek van Lex ("dat binnendruppelen zou leuker zijn dan
// wat er nu is"): de 📻-viewer haalde elke 10 s de hele staart op en tekende
// die opnieuw — dat oogt als "een regel per 10 s". Hier het live-alternatief:
// abonnees krijgen ELKE aangroei van het bestand direct als tekst (voor de
// eventstream /api/navtex-ruw-stream in server.js). Eén gedeelde
// fs.watchFile-poller (250 ms) voor alle abonnees; die stopt vanzelf zodra
// de laatste abonnee weg is. Bewust watchFile i.p.v. fs.watch: inotify
// meldt op sommige bestandssystemen/`tee -a`-patronen niet betrouwbaar en
// een stat elke 250 ms kost niets. Wordt het bestand kleiner (roteerd/
// geleegd), dan begint de lezer opnieuw vanaf 0 — geen verzonnen tekst.
const RUW_STREAM_POLL_MS = 250;
// Per gevolgd bestand één poller + set abonnees (2026-09-08 verder
// veralgemeend voor het spectrum/waterval-bestand, zie abonneerWaterval).
const bestandVolgers = new Map(); // pad -> { abonnees:Set, gelezenTot:number, tik:fn }

// `binair`: abonnees krijgen Buffers i.p.v. utf-8-tekst (audio, 2026-09-08).
function volgBestand(bestand, onTekst, vanafBytes, binair = false) {
  let v = bestandVolgers.get(bestand);
  if (!v) {
    v = { abonnees: new Set(), gelezenTot: 0, tik: null };
    v.gelezenTot = Number.isFinite(vanafBytes) ? vanafBytes : (existsSync(bestand) ? statSync(bestand).size : 0);
    v.tik = (cur) => {
      if (cur.size === 0 && cur.mtimeMs === 0) return; // (nog) niet aanwezig
      if (cur.size < v.gelezenTot) v.gelezenTot = 0; // geleegd/geroteerd: opnieuw vanaf 0
      if (cur.size === v.gelezenTot) return;
      const lengte = cur.size - v.gelezenTot;
      const fd = openSync(bestand, 'r');
      try {
        const buf = Buffer.alloc(lengte);
        const n = readSync(fd, buf, 0, lengte, v.gelezenTot);
        v.gelezenTot += n;
        const tekst = binair ? buf.subarray(0, n) : buf.subarray(0, n).toString('utf-8').replace(/\r\n/g, '\n');
        if (!tekst.length) return;
        for (const cb of v.abonnees) {
          try { cb(tekst); } catch (err) { console.warn('[weer] bestand-stream abonnee:', err.message ?? err); }
        }
      } finally {
        closeSync(fd);
      }
    };
    bestandVolgers.set(bestand, v);
    watchFile(bestand, { interval: RUW_STREAM_POLL_MS, persistent: false }, v.tik);
  } else if (Number.isFinite(vanafBytes) && vanafBytes < v.gelezenTot) {
    // Late abonnee die nog een stukje mist: dat stuk eenmalig nasturen.
    try {
      const fd = openSync(bestand, 'r');
      try {
        const buf = Buffer.alloc(v.gelezenTot - vanafBytes);
        const n = readSync(fd, buf, 0, buf.length, vanafBytes);
        onTekst(buf.subarray(0, n).toString('utf-8').replace(/\r\n/g, '\n'));
      } finally { closeSync(fd); }
    } catch (err) { console.warn('[weer] bestand-stream inhalen mislukt:', err.message ?? err); }
  }
  v.abonnees.add(onTekst);
  return () => {
    v.abonnees.delete(onTekst);
    if (v.abonnees.size === 0) {
      unwatchFile(bestand, v.tik);
      bestandVolgers.delete(bestand);
    }
  };
}

// Meld je aan voor aangroei van het ontvangstbestand vanaf `vanafBytes`
// (normaal de bestandsgrootte die de eerste vulling via leesRuweOntvangst()
// teruggaf, zodat er niets dubbel of niets overgeslagen wordt). Geeft een
// afmeldfunctie terug.
export function abonneerRuweOntvangst(onTekst, vanafBytes) {
  return volgBestand(process.env.NAVTEX_LOKAAL_BESTAND || STANDAARD_BESTAND, onTekst, vanafBytes);
}

// 2026-09-08, op verzoek van Lex ("de frequentie en de waterval, zoals je
// dat in SDR++ ziet"): navtex_usb_demod.py schrijft met --spectrum 4x/s een
// JSON-regel (breed ±12 kHz rond 520 kHz + zoom ±1,5 kHz rond 518 kHz, dB
// per bin) naar een tmpfs-bestand; die regels gaan als eventstream naar het
// spectrum/waterval-paneel. Het bestand wordt door de demodulator bij 1 MB
// geleegd — volgBestand() begint dan gewoon opnieuw vanaf 0.
const STANDAARD_WATERVAL_BESTAND = '/dev/shm/navtex_waterval.jsonl';

export function abonneerWaterval(onTekst) {
  return volgBestand(process.env.NAVTEX_WATERVAL_BESTAND || STANDAARD_WATERVAL_BESTAND, onTekst, undefined);
}

// Meeluisteren (2026-09-08, "en geluid?"): navtex_usb_demod.py --audio
// schrijft de decoder-audio (raw int16, 12 kHz, mono) naar tmpfs; abonnees
// krijgen elke aangroei als Buffer, vanaf het huidige einde (geen
// geschiedenis — je luistert live).
const STANDAARD_AUDIO_BESTAND = '/dev/shm/navtex_audio.raw';
export const AUDIO_SAMPLERATE = 12000;

// `khz`: 518 (hoofdbestand) of een extra zender — de demodulator schrijft
// die naast het hoofdbestand als navtex_audio_<khz>.raw (2026-09-08).
export function abonneerAudio(onBuffer, khz = 518) {
  const hoofd = process.env.NAVTEX_AUDIO_BESTAND || STANDAARD_AUDIO_BESTAND;
  const bestand = khz === 518 ? hoofd : hoofd.replace(/(\.[^.]*)?$/, (ext) => `_${khz}${ext}`);
  return volgBestand(bestand, onBuffer, undefined, true);
}

// Laatste `maxRegels` complete spectrumregels als geschiedenis bij het
// openen van het paneel (zodat de waterval niet leeg begint).
export function leesWatervalGeschiedenis(maxRegels = 200) {
  const bestand = process.env.NAVTEX_WATERVAL_BESTAND || STANDAARD_WATERVAL_BESTAND;
  if (!existsSync(bestand)) return { regels: [], bestandsBytes: 0 };
  const s = statSync(bestand);
  const lees = Math.min(maxRegels * 3000, s.size);
  if (lees === 0) return { regels: [], bestandsBytes: 0 };
  const fd = openSync(bestand, 'r');
  try {
    const buf = Buffer.alloc(lees);
    readSync(fd, buf, 0, lees, s.size - lees);
    let tekst = buf.toString('utf-8');
    if (lees < s.size) tekst = tekst.slice(tekst.indexOf('\n') + 1);
    const regels = tekst.split('\n').filter((r) => r.startsWith('{') && r.endsWith('}')).slice(-maxRegels);
    return { regels, bestandsBytes: s.size };
  } finally {
    closeSync(fd);
  }
}

// 2026-09-08 (Lex: "ik wil het sowieso tussen deze berichten in zien"): de
// staarten van 518 én 490 als één lijst segmenten in tijdvolgorde, voor de
// 📻-viewer. Per band wordt de staart in segmenten geknipt op de
// geregistreerde blokstarts (ZCZC-offsets met tijd); een segment zonder
// eigen tijd (het stuk vóór de eerste bekende blokstart) erft de tijd van
// het eerstvolgende segment uit dezelfde band, zodat de volgorde binnen een
// band altijd blijft kloppen. Daarna stabiel gesorteerd op tijd.
export function leesRuweOntvangstGemengd(maxBytes = 64 * 1024) {
  const segmenten = [];
  const bestandsBytes = {};
  let bijgewerkt = null;
  for (const band of BANDEN) {
    const bestand = band.bestand();
    bestandsBytes[band.frequentieKhz] = 0;
    if (!existsSync(bestand)) continue;
    const s = statSync(bestand);
    bestandsBytes[band.frequentieKhz] = s.size;
    if (!bijgewerkt || s.mtime > bijgewerkt) bijgewerkt = s.mtime;
    const lees = Math.min(maxBytes, s.size);
    if (lees === 0) continue;
    const fd = openSync(bestand, 'r');
    let tekst;
    let startInBestand;
    try {
      const buf = Buffer.alloc(lees);
      readSync(fd, buf, 0, lees, s.size - lees);
      tekst = buf.toString('utf-8').replace(/\r\n/g, '\n');
      let weggeknipt = 0;
      if (lees < s.size) {
        const knip = tekst.indexOf('\n') + 1;
        weggeknipt = Buffer.byteLength(tekst.slice(0, knip));
        tekst = tekst.slice(knip);
      }
      startInBestand = s.size - lees + weggeknipt;
    } finally {
      closeSync(fd);
    }
    // offsets zijn byte-posities in het bestand; tekst-index ≈ byte-index
    // (vrijwel puur ASCII), zelfde aanname als leesRuweOntvangst().
    const blokken = band.tijden
      .filter((b) => b.offset >= startInBestand && b.offset < s.size)
      .map((b) => ({ offset: b.offset - startInBestand, tijd: b.tijd }))
      .filter((b) => b.offset <= tekst.length);
    const eigen = [];
    let vorige = 0;
    for (const blok of blokken) {
      if (blok.offset > vorige) eigen.push({ khz: band.frequentieKhz, tijd: null, tekst: tekst.slice(vorige, blok.offset) });
      vorige = blok.offset;
      eigen.push({ khz: band.frequentieKhz, tijd: blok.tijd, tekst: '' , kop: true });
    }
    if (vorige < tekst.length) eigen.push({ khz: band.frequentieKhz, tijd: null, tekst: tekst.slice(vorige) });
    // kopregel-segment en de tekst erna samenvoegen; tijd erven van de volgende
    const samengevoegd = [];
    for (const seg of eigen) {
      const laatste = samengevoegd[samengevoegd.length - 1];
      if (laatste && laatste.kop && !seg.kop) { laatste.tekst += seg.tekst; continue; }
      samengevoegd.push({ ...seg });
    }
    let volgendeTijd = null;
    for (let i = samengevoegd.length - 1; i >= 0; i--) {
      if (samengevoegd[i].tijd) volgendeTijd = samengevoegd[i].tijd;
      else samengevoegd[i].sorteerTijd = volgendeTijd;
      samengevoegd[i].sorteerTijd = samengevoegd[i].sorteerTijd ?? samengevoegd[i].tijd;
    }
    // Zonder enige bloktijd (staart begint niet met een gaaf ZCZC, of het
    // register kent 'm nog niet): terugvallen op het schrijfmoment van het
    // bestand, niet op 0 — anders belandt zo'n stuk helemaal bovenaan.
    samengevoegd.forEach((seg, i) => segmenten.push({ khz: seg.khz, tijd: seg.kop ? seg.tijd : null, tekst: seg.tekst, sorteerMs: seg.sorteerTijd ? new Date(seg.sorteerTijd).getTime() : s.mtimeMs, volgorde: i }));
  }
  segmenten.sort((a, b) => a.sorteerMs - b.sorteerMs || a.khz - b.khz || a.volgorde - b.volgorde);
  return {
    segmenten: segmenten.map(({ khz, tijd, tekst }) => ({ khz, tijd, tekst })),
    bestandsBytes,
    bijgewerkt: bijgewerkt ? bijgewerkt.toISOString() : null,
  };
}

// Aangroei van het ontvangstbestand van een band (518 of 490) volgen.
export function abonneerRuweOntvangstBand(khz, onTekst, vanafBytes) {
  const band = BANDEN.find((b) => b.frequentieKhz === khz) ?? BAND_518;
  return volgBestand(band.bestand(), onTekst, vanafBytes);
}

export async function fetchNavtexLokaal(env = {}) {
  const alles = [];
  for (const band of BANDEN) alles.push(...(await fetchNavtexBand(env, band)));
  return alles;
}

async function fetchNavtexBand(env, band) {
  const homeLat = env.homeLat ?? 52.0907;
  const homeLon = env.homeLon ?? 5.1214;
  // 2026-08-28, op verzoek van Lex ("de 450 km grens graag los laten"): de
  // eigen radio-ontvangst heeft — anders dan de web-bronnen in navtex.js/
  // ukho.js, die hun NAVTEX_STRAAL_KM houden — een NATUURLIJKE afstandsgrens:
  // je ontvangt alleen wat de antenne haalt. Wat er doorheen komt van ver
  // (Noorse weerbulletins, Oostzee-berichten bij goede condities) is juist
  // interessant, en het Noorse NE35-bulletin draagt drukgebied-coördinaten
  // die de zeekaart nu ook plot. Geen afstandsfilter meer dus; alleen een
  // plotbare positie blijft vereist.
  const bestand = band.bestand();

  if (!existsSync(bestand)) {
    console.log(`[weer] navtexLokaal ${band.frequentieKhz}: ${bestand} bestaat nog niet — nog geen bericht ontvangen/opgeslagen.`);
    return [];
  }

  const ruweTekst = readFileSync(bestand, 'utf-8');
  // 2026-08-28: begintijden per ruw blok bijhouden vóór elke normalisatie,
  // zodat de offsets bij het bestand blijven horen (zie registreerRuweBlokTijden).
  registreerRuweBlokTijden(band, ruweTekst);
  // 2026-08-28 (DX-lijst, vraag van Lex "wordt dat straks de tijd van het
  // laatst ontvangen bericht?"): de ECHTE ontvangsttijd per blok bestaat al
  // — het begintijden-register van de viewer hierboven. Hier per blok
  // doorgekoppeld: het i-de blok uit segmenteerBerichten is de i-de
  // ZCZC-treffer, en die offset staat (voor de laatste RUW_TIJDEN_MAX
  // blokken) in ruweBlokTijden. Blokken van vóór het register of buiten de
  // cap krijgen null — liever geen tijd dan een verzonnen tijd.
  const tijdPerOffset = new Map(band.tijden.map((b) => [b.offset, b.tijd]));
  const ruweOffsets = [];
  {
    const re = /ZCZC/gi;
    let tref;
    while ((tref = re.exec(ruweTekst)) !== null) ruweOffsets.push(tref.index);
  }
  const tekst = ruweTekst.replace(/\r\n/g, '\n');
  const blokken = segmenteerBerichten(tekst);
  const ruweBerichten = blokken
    .map((blok, i) => {
      const b = parseBlok(blok, band.stations, band.zelfId);
      if (b) b.ontvangstTijd = tijdPerOffset.get(ruweOffsets[i]) ?? null;
      return b;
    })
    .filter(Boolean);
  const berichten = consolideerOpInhoud(smeltSamenOpBesteVersie(ruweBerichten));

  const metPositie = berichten.map((b) => {
    const eventInfo = classificeerEvent(b.body);
    // 2026-08-26, op verzoek van Lex ("ik zie dat er berichten zijn die zijn
    // herleid tot het uitzendstation... daar kan een radiomast voor gebruikt
    // worden") -- onthouden OF de positie hieronder een echte, uit de
    // berichttekst gehaalde coordinaat is, of de terugval-positie van het
    // zendstation zelf (bv. bij een gebiedsdekkend bericht zoals een
    // weersverwachting, type E, dat nooit een eigen puntcoordinaat heeft).
    // Zie NAVTEX_RADIOMAST_SVG/hazardIconHtml() in app.js -- die krijgt
    // voorrang boven het normale eventType-icoon, want de positie zelf is
    // hier het belangrijkste te communiceren feit (dit is NIET de echte
    // locatie van het gemelde fenomeen).
    // 2026-08-28, bij het loslaten van de 450km-grens: een berichtcoordinaat
    // die buiten de plausibiliteitsbox valt is vrijwel zeker corrupt
    // ("204-38.9W" gezien in echte ontvangst) — dan liever terugvallen op de
    // zendstation-positie (met radiomast-icoon, precies waar dat voor is)
    // dan het bericht helemaal kwijtraken of in de Indische Oceaan plotten.
    const coordPlausibel = b.coords[0] && positiePlausibel(b.coords[0]) ? b.coords[0] : null;
    const positieIsStation = !coordPlausibel && Boolean(b.station);
    const positie = coordPlausibel ?? (b.station ? { lat: b.station.lat, lon: b.station.lon } : null);
    const afstandTotJouKm = positie ? afstandKm(homeLat, homeLon, positie.lat, positie.lon) : null;
    const positieBinnenBereik = positie ? positiePlausibel(positie) : null;
    const referentie = referentieIn(b.body);
    const zelfVervalDatum = zelfVervalDatumIn(b.body);
    // 2026-08-26, zie ontvangstStatsVoorBericht() hierboven.
    const { aantalOntvangsten, laatsteDatum, laatsteOntvangst, eersteOntvangstBlok } = ontvangstStatsVoorBericht(b, ruweBerichten);
    // "laatst gezien" alleen doorgeven als het ECHT een latere waarde is dan
    // de toch al getoonde b.datum -- op Lex' verzoek ("dubbele info anders"
    // naast de bestaande tijdregel), zie tijdregelVoorSignaal() in app.js.
    const laatstGezien = b.datum && laatsteDatum && laatsteDatum.getTime() > b.datum.getTime() ? laatsteDatum : null;
    return { ...b, eventInfo, positie, positieIsStation, afstandTotJouKm, positieBinnenBereik, referentie, zelfVervalDatum, aantalOntvangsten, laatstGezien, laatstOntvangen: laatsteOntvangst ?? null, eerstOntvangen: eersteOntvangstBlok ?? null };
  });

  // Elk bericht (ongeacht bereik/positie) kan een ANDER bericht intrekken —
  // eerst alle CANCEL-verwijzingen uit dit hele bestand verzamelen en in het
  // module-scoped geheugen zetten, dan pas filteren. Zie de toelichting bij
  // GEANNULEERDE_REFERENTIES hierboven.
  for (const b of berichten) {
    for (const ref of geannuleerdeReferentiesIn(b.body)) GEANNULEERDE_REFERENTIES.add(ref);
  }

  const nu = Date.now();
  // Geen afstandsgrens meer (zie de toelichting bij fetchNavtexLokaal-start),
  // maar wél de plausibiliteitsbox als hard vangnet: zonder de 450km-grens is
  // dit het enige dat corrupte coördinaten (94N, 204W, ...) nog tegenhoudt.
  const metPlek = metPositie.filter((b) => b.positie && positiePlausibel(b.positie));
  // 2026-09-06, zie nietMeerHerhaald() hierboven: per station het laatste
  // moment waarop we ÜBERHAUPT iets van dat station hoorden (over alle
  // berichten, ook de ruwe duplicaten), plus het begin van het tijdenregister.
  const laatstGehoordPerStation = new Map();
  for (const rb of ruweBerichten) {
    if (!rb.stationId || !rb.ontvangstTijd) continue;
    const ms = new Date(rb.ontvangstTijd).getTime();
    if (!Number.isFinite(ms)) continue;
    if (ms > (laatstGehoordPerStation.get(rb.stationId) ?? 0)) laatstGehoordPerStation.set(rb.stationId, ms);
  }
  const registerStartMs = band.tijden.length ? new Date(band.tijden[0].tijd).getTime() : NaN;
  let nietMeerHerhaaldTeller = 0;
  const nietVervallen = metPlek.filter((b) => {
    if (b.zelfVervalDatum && b.zelfVervalDatum.getTime() < nu) return false; // "CANCEL THIS MSG <datum>" al gepasseerd
    if (b.referentie && GEANNULEERDE_REFERENTIES.has(b.referentie)) return false; // door een later bericht ingetrokken
    if (nietMeerHerhaald(b, laatstGehoordPerStation, registerStartMs)) { nietMeerHerhaaldTeller += 1; return false; } // station hoorbaar, bericht 72u niet meer herhaald
    if (!b.zelfVervalDatum && b.datum && nu - b.datum.getTime() > VANGNET_MAX_OUDERDOM_MS) return false; // noodrem (1 jaar), geen primair mechanisme
    return true;
  });

  // Zelfde logdiscipline als navtex.js/ukho.js/getij.js: altijd loggen, ook
  // bij 0 treffers, en ook hoeveel blokken sowieso geen bruikbare code/positie
  // hadden — dat is bij deze testopstelling waardevolle info op zich (hoeveel
  // van wat er binnenkwam is eigenlijk bruikbaar).
  const zonderPositie = berichten.length - metPlek.length;
  const vervallen = metPlek.length - nietVervallen.length;
  console.log(
    `[weer] navtexLokaal ${band.frequentieKhz}: ${blokken.length} blok(ken) (${ruweBerichten.length} ruw, ${berichten.length} na dedup) in ${bestand}, ` +
      `${berichten.length} met leesbare code, ${zonderPositie} zonder bruikbare positie (corrupte/onbekende station-letter of geen coordinaat), ` +
      `${metPlek.length} met positie (geen afstandsgrens), ${vervallen} vervallen/ingetrokken (waarvan ${nietMeerHerhaaldTeller} 72u niet meer herhaald), ${nietVervallen.length} blijft over.`
  );

  return meldNavtexNood(nietVervallen.flatMap((b) => {
    const typeOmschrijving = b.typeLetter ? TYPE_OMSCHRIJVING[b.typeLetter] ?? null : null;
    const stationNaam = b.station?.naam ?? `station ${leesStationEnType(b.code).stationId ?? '?'} (onbevestigd)`;
    const stationKleur = b.station?.kleur ?? STATION_KLEUR_ONBEKEND;
    const baseId = `${band.idPrefix}-${b.code}-${b.datum ? b.datum.getTime() : hashTekst(b.body)}`;
    const gedeeldeDetail = {
      code: b.code,
      referentie: b.referentie,
      station: stationNaam,
      // 2026-09-08: op 490 met '@490'-achtervoegsel, zodat de frontend (schema,
      // DX-lijst, groepering — alles zoekt op stationId) 'B' op 490 (Oostende)
      // nooit verwart met 'B' op 518 (Bodø). Zie ook /api/navtex-stations.
      stationId: b.station ? (band.frequentieKhz === 518 ? b.station.id : `${b.station.id}@${band.frequentieKhz}`) : null,
      stationKleur,
      land: b.station?.land ?? null,
      navarea: b.station?.navarea ?? null,
      eventType: b.eventInfo.type,
      eventLabel: b.eventInfo.label,
      bericht: b.weergaveTekst ?? b.body, // met regeleinden voor weergave (zie parseBlok) -- terugval op body voor het onwaarschijnlijke geval dat een oudere gecachete bericht-instantie nog geen weergaveTekst heeft
      afstandTotJouKm: b.afstandTotJouKm,
      positieUitBericht: b.coords.length > 0,
      positieBinnenBereik: b.positieBinnenBereik,
      vervaltOp: b.zelfVervalDatum ? b.zelfVervalDatum.toISOString() : null,
      // 2026-08-24, op verzoek van Lex ("mag een marker meegeven... datum of
      // herkomst onbetrouwbaar, rode gloed of zo") — statisch, in
      // tegenstelling tot de groene "nieuw"-markering (die vervalt na het
      // sluiten van de categorie/10 min, zie isNavtexNieuw() in app.js): dit
      // blijft staan zolang er geen betrouwbare verzenddatum uit het bericht
      // te halen viel, dus `tijd` hierboven het "eerst gezien op"-moment is
      // i.p.v. de echte berichtdatum (zie eersteOntvangst() hierboven).
      datumOnbetrouwbaar: b.datum == null,
      // 2026-08-26, zie ontvangstStatsVoorBericht() hierboven -- de
      // gecombineerde teller en (waar zinvol) het laatst-gezien-moment,
      // getoond via navtexNummerBadge()/de sub-regel in app.js.
      aantalOntvangsten: b.aantalOntvangsten,
      laatstGezien: b.laatstGezien ? b.laatstGezien.toISOString() : null,
      // 2026-08-28 (DX-lijst): het echte laatste ONTVANGST-moment (blok-
      // begintijd uit het viewer-register, over alle duplicaten heen) —
      // los van laatstGezien hierboven, dat het nieuwste DTG is.
      laatstOntvangen: b.laatstOntvangen ?? null,
      // 2026-08-26, zie positieIsStation hierboven.
      positieIsStation: b.positieIsStation,
      // 2026-08-26, op verzoek van Lex ("noodberichten via navtex met een
      // alarm laten binnenkomen net als de andere alarms") -- de tweede
      // letter in de NAVTEX-code (zie leesStationEnType()/typeLetter
      // hierboven, ITU-R M.540/M.625) geeft het berichttype aan; letter D is
      // "SAR (opsporing en redding), piraterij, tsunami's en andere
      // natuurrampen" (zie TYPE_OMSCHRIJVING.D hierboven) -- precies de
      // categorie die een telefoonalarm verdient, in tegenstelling tot bijv.
      // A (gewone navigatiewaarschuwing) of E (weersverwachting). Alleen
      // zinvol voor deze lokale bron (typeLetter komt uit de eigen
      // ATS Mini-decodering); de UKHO-bulletinbron (ukho.js) heeft geen
      // vergelijkbare lettercode en blijft dus altijd noodbericht:false. Zie
      // magAlarmeren() in app.js voor de daadwerkelijke alarmtrigger.
      //
      // 2026-09-05-fix, n.a.v. een fout noodalarm (Rogaland Radio, 780 km --
      // ver voorbij NAVTEX' betrouwbare bereik van ~740 km): bij zulke zwaar
      // verminkte ontvangst overleeft toevallig een geldig ogende
      // [LETTER][LETTER][CIJFERS]-code de check in leesStationEnType(),
      // terwijl de tweede letter zelf (het berichttype) net zo goed een
      // bitfout kan zijn -- deze keer een B (Weerwaarschuwing, de tekst was
      // gewoon een routine-weerbulletin) verminkt tot D (SAR/piraterij).
      // Zo'n zwaar verminkt bericht mist typisch ook een leesbare datumregel
      // (zie DATUM_REGEX/b.datum) -- vandaar nu een tweede eis: alleen nog
      // een noodalarm bij een BEIDE herkende typeLetter D EN een geldige
      // datum uit het bericht zelf. Voorkomt niet elke misclassificatie,
      // maar wel precies dit geval (en scheelt meteen ook de herhaalde
      // alarmen hieronder, want zonder geldige datum viel de dedup-id verderop
      // terug op hashTekst(b.body), en gaf elke net iets anders gedecodeerde
      // pollronde van hetzelfde bericht een nieuw alarm).
      typeLetter: b.typeLetter ?? null,
      noodbericht: b.typeLetter === 'D' && b.datum != null,
      bron: `lokaal (Airspy HF+ + MLA-30+, ${band.frequentieKhz} kHz)`,
      frequentieKhz: band.frequentieKhz, // 2026-09-08: 518 of 490, voor de badge in de app
      bestand,
    };

    // Riglijst: los puntsignaal per gevonden platformpositie i.p.v. één
    // gebiedssignaal (zie splitsRiglijst() hierboven).
    if (b.eventInfo.type === 'riglijst' || b.eventInfo.type === 'platform-defect' || b.eventInfo.type === 'turbine-defect') {
      const rigs = splitsRiglijst(b.body);
      if (rigs.length === 0) return []; // frase herkend maar geen enkele positie erin gevonden -- niks te plotten
      return rigs.map((rig, i) =>
        makeSignal({
          id: `${baseId}-rig${i}`,
          categorie: 'navtex',
          // Per-platform status (bv. "Misthoorn defect" i.p.v. het
          // generieke "Boorplatform(s)") als splitsRiglijst() die kon
          // classificeren, zie classificeerRiglijstStatus() hierboven.
          // 2026-09-10, op verzoek van Lex: bij een turbinelijst staat de
          // windparknaam als sectiekop in de tekst ("HOLLANDSE KUST NOORD")
          // -- die hoort achter de turbinenaam, anders zegt "HZD6" op zichzelf
          // niets over wáár je zit. Alleen als splitsRiglijst() er een vond.
          titel: `NAVTEX - ${rig.eventLabel ?? b.eventInfo.label}${rig.naam ? ` - ${rig.naam}` : ''}${rig.park ? ` (${rig.park})` : ''} - ${stationNaam}`,
          ernst: navtexErnst(b.body, b.typeLetter), // 2026-09-04
          lat: rig.lat,
          lon: rig.lon,
          tijd: b.datum ? b.datum.toISOString() : tijdZonderDatum(b, `${baseId}-rig${i}`),
          detail: {
            ...gedeeldeDetail,
            positie: rig,
            riglijstIndex: i,
            riglijstTotaal: rigs.length,
            // eventType blijft bewust 'riglijst' (via gedeeldeDetail) zodat
            // riglijstTitelHtml()/de teller in app.js gewoon blijven
            // werken — het per-platform icoon/label loopt via deze eigen
            // velden, zie hazardIconHtml() in app.js.
            rigStatusType: rig.eventType ?? null,
            rigStatusLabel: rig.eventLabel ?? null,
            // 2026-09-10: windpark/sectiekop, zie de titel hierboven.
            rigPark: rig.park ?? null,
          },
        })
      );
    }

    // Boei-lijst: los puntsignaal per genoemde boei i.p.v. een lijn ertussen
    // (zie splitsBoeiLijst() hierboven) -- alleen bij 2+ coordinaten; een
    // enkele boei (1 coordinaat, bv. PA53 "LIGHTBUOY ... ESTABLISHED")
    // blijft gewoon de bestaande, simpele punt-afhandeling hieronder volgen.
    if (b.eventInfo.type === 'boei-nieuw' && b.coords.length >= 2) {
      const boeien = splitsBoeiLijst(b.body);
      if (boeien.length === 0) return []; // vangnet, zie riglijst hierboven voor dezelfde afweging
      return boeien.map((boei, i) =>
        makeSignal({
          id: `${baseId}-boei${i}`,
          categorie: 'navtex',
          titel: `NAVTEX - ${b.eventInfo.label}${boei.naam ? ` - ${boei.naam}` : ''} - ${stationNaam}`,
          ernst: navtexErnst(b.body, b.typeLetter), // 2026-09-04
          lat: boei.lat,
          lon: boei.lon,
          tijd: b.datum ? b.datum.toISOString() : tijdZonderDatum(b, `${baseId}-boei${i}`),
          detail: { ...gedeeldeDetail, positie: boei, boeiNaam: boei.naam, boeiRichting: boei.richting, boeiIndex: i, boeiTotaal: boeien.length },
        })
      );
    }

    // 2026-09-06, op verzoek van Lex (VA17 / WZ 537/26: "EAST ANGLIA ONE
    // OFFSHORE WIND FARM. TURBINE FOG SIGNALS INOPERATIVE: A. C22, 52-17.0N
    // 002-27.3E. B. F17, 52-15.7N 002-33.7E." -- "we zouden deze 2 kunnen
    // plotten"): een geletterde/genummerde opsomming van losse posities
    // (A. ... B. ... of 1. ... 2. ...) zonder lijn-/gebiedswoorden is een
    // lijst van PUNTEN, geen lijnstuk of polygoon. Zelfde patroon als de
    // boei-lijst hierboven, maar generiek: elk punt een eigen signaal met
    // de naam uit de tekst tussen het lijstteken en de coördinaat ("C22").
    // Verdwijnen gaat mee met het moederbericht (zelfde referentie/72u-regel).
    if (b.coords.length >= 2 && !LIJN_TRIGGER.test(b.body) && !/\b(AREA|BOUNDED|BOUNDARIES|BETWEEN|RADIUS|CIRCLE)\b/i.test(b.body)) {
      const punten = splitsPuntenLijst(b.body);
      if (punten.length === b.coords.length) {
        return punten.map((punt, i) =>
          makeSignal({
            id: `${baseId}-punt${i}`,
            categorie: 'navtex',
            titel: `NAVTEX - ${b.eventInfo.label}${punt.naam ? ` - ${punt.naam}` : ''} - ${stationNaam}`,
            ernst: navtexErnst(b.body, b.typeLetter),
            lat: punt.lat,
            lon: punt.lon,
            tijd: b.datum ? b.datum.toISOString() : tijdZonderDatum(b, `${baseId}-punt${i}`),
            detail: { ...gedeeldeDetail, positie: punt, puntNaam: punt.naam, puntIndex: i, puntTotaal: punten.length, geometrieType: 'punt' },
          })
        );
      }
    }

    const geometrie = classificeerGeometrie(b.body, b.coords, b.eventInfo.type);
    return [
      makeSignal({
        id: baseId,
        categorie: 'navtex',
        // 2026-08-24, op verzoek van Lex: "(test-ontvangst)" tijdelijk
        // vervangen door de concrete hardwarenaam (ATS Mini V4) -- "het zal
        // binnenkort weer veranderen" zodra de Airspy HF Discovery er is.
        // 2026-08-26, op verzoek van Lex ("wil je ook ATS MINI V4 laten
        // vervallen") weer weggehaald -- gewoon "NAVTEX", net als bij de
        // andere titels hierboven/hieronder (riglijst/platform-defect/
        // boei-lijst) die deze hardwarenaam nooit hebben gehad.
        titel: `NAVTEX${typeOmschrijving ? ` - ${typeOmschrijving}` : ''} - ${stationNaam}`,
        ernst: navtexErnst(b.body, b.typeLetter), // 2026-09-04
        lat: b.positie.lat,
        lon: b.positie.lon,
        tijd: b.datum ? b.datum.toISOString() : tijdZonderDatum(b, baseId),
        detail: {
          ...gedeeldeDetail,
          geometrieType: geometrie.type,
          gebiedPolygon: geometrie.gebiedPolygon,
          koerslijn: geometrie.koerslijn,
          // 2026-08-26, zie boeiOmschrijvingUit() hierboven -- alleen gezet
          // bij een LOSSE boei (de gesplitste boei-lijst hierboven zet zijn
          // eigen boeiNaam al, dit is het pad voor 1 boei per bericht).
          boeiNaam: b.eventInfo.type === 'boei-nieuw' ? boeiOmschrijvingUit(b.body) : null,
          boeiDetails: b.eventInfo.type === 'boei-nieuw' ? boeiDetailsUit(b.body) : null,
          // 2026-08-26, zie cardinaalRichtingUit() hierboven.
          boeiRichting: b.eventInfo.type === 'boei-nieuw' ? cardinaalRichtingUit(b.body) : null,
          // 2026-08-26, op verzoek van Lex (PA04 "PUZZLE HOLE WAVERIDER
          // BUOY DEPLOYED": "de waverider bouy is helemaal geel (volledig
          // rond) met een antenne") -- eigen icoon i.p.v. het generieke
          // groene "nieuwe boei"-icoon, zie NAVTEX_WAVERIDER_SVG in app.js.
          // Letterlijk trefwoord, net als CARDINAAL_REGEX hierboven -- staat
          // altijd zo in de tekst (het is een meetinstrument-typenaam, geen
          // vrije omschrijving).
          boeiSoort: b.eventInfo.type === 'boei-nieuw' && /WAVERIDER/i.test(b.body) ? 'waverider' : null,
        },
      }),
    ];
  }));
}
