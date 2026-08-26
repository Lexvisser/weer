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
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { makeSignal, afstandKm } from '../normalize.js';

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
const STATIONS = [
  { id: 'V', naam: 'Oostende Radio (Britse zeegebieden/Kanaal)', land: 'BE', lat: 51.1823, lon: 2.8065, navarea: 'I', kleur: '#ff6b6b' },
  // 2026-08-24, correctie van Lex ("T = Oostende NAVTEX, België... dit is
  // dus een Belgisch bericht voor hoofdzakelijk de Belgische kust en
  // Noordzee") — GEEN bitfout-verwarring met V (had ik eerst aangenomen),
  // maar een eigen, echt station: dezelfde zender (Oostende/Middelkerke)
  // zendt onder V voor Britse zeegebieden/het Kanaal, en onder T specifiek
  // voor de Belgische kustberichten. Zendschema (UTC): 03:10, 07:10, 11:10,
  // 15:10, 19:10, 23:10. Zelfde locatie als V aangehouden (fysiek dezelfde
  // zendmast) bij gebrek aan een aparte coördinaat voor T specifiek.
  { id: 'T', naam: 'Oostende NAVTEX (Belgische kustberichten)', land: 'BE', lat: 51.1823, lon: 2.8065, navarea: 'I', kleur: '#ff9ec4' },
  { id: 'P', naam: 'Scheveningen Radio', land: 'NL', lat: 52.0951, lon: 4.258, navarea: 'I', kleur: '#ffb84c' },
  { id: 'E', naam: 'Niton Radio', land: 'UK', lat: 50.6, lon: -1.3, navarea: 'I', kleur: '#ffe14c' },
  // 'K': zelfde zender/dekkingsgebied als 'E' hierboven (Niton Radio), maar
  // in de live ontvangst kwam die letter herhaaldelijk als 'K' binnen i.p.v.
  // 'E' (zie de uitgebreide toelichting hoger in dit bestand) — vandaar een
  // los station-record, met dezelfde naam als 'E' (dit IS gewoon Niton
  // Radio, geen ander station) i.p.v. de eerdere per ongeluk zichtbare
  // debug-notitie in dit naam-veld zelf.
  { id: 'K', naam: 'Niton Radio', land: 'UK', lat: 50.6, lon: -1.3, navarea: 'I', kleur: '#c8f04c' },
  { id: 'G', naam: 'Cullercoats Radio', land: 'UK', lat: 55.0, lon: -1.4, navarea: 'I', kleur: '#6bf07a' },
  { id: 'A', naam: 'Portpatrick Radio', land: 'UK', lat: 54.85, lon: -5.12, navarea: 'I', kleur: '#4cf0c8' },
  { id: 'B', naam: 'Bodo Radio', land: 'NO', lat: 67.283, lon: 14.383, navarea: 'I', kleur: '#4cd9f0' },
  { id: 'N', naam: 'Torshavn Radio', land: 'FO', lat: 62.02, lon: -6.77, navarea: 'I', kleur: '#4c9df0' },
  { id: 'D', naam: 'Egersund Radio', land: 'NO', lat: 58.45, lon: 6.0, navarea: 'I', kleur: '#4c63f0' },
  { id: 'O', naam: 'Stockholm Radio', land: 'SE', lat: 59.33, lon: 18.05, navarea: 'I', kleur: '#7b4cf0' },
  { id: 'C', naam: 'Copenhagen Radio', land: 'DK', lat: 55.68, lon: 12.57, navarea: 'I', kleur: '#a84cf0' },
  { id: 'H', naam: 'Den Helder Kust', land: 'NL', lat: 52.96, lon: 4.76, navarea: 'I', kleur: '#d94cf0' },
  { id: 'M', naam: 'Grindavik Radio', land: 'IS', lat: 63.84, lon: -22.43, navarea: 'I', kleur: '#f04ca8' },
  { id: 'F', naam: 'Brest Radio', land: 'FR', lat: 48.39, lon: -4.49, navarea: 'II', kleur: '#f04c6b' },
  { id: 'L', naam: 'La Coruna Radio', land: 'ES', lat: 43.37, lon: -8.41, navarea: 'II', kleur: '#f0824c' },
  { id: 'Q', naam: 'Grindavik Radio (reserve)', land: 'IS', lat: 63.83, lon: -22.4, navarea: 'I', kleur: '#e0c14c' },
  { id: 'R', naam: 'Lyngby Radio', land: 'DK', lat: 55.77, lon: 12.52, navarea: 'I', kleur: '#9ee04c' },
];
const STATION_PER_ID = new Map(STATIONS.map((s) => [s.id, s]));
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
const COORD_REGEX = /(\d{1,2})[°\-., ]?(\d{1,2}(?:[.,\-]\d+)?)?\s*([NS])\s*(\d{1,3})[°\-., ]?(\d{1,2}(?:[.,\-]\d+)?)?\s*([EW])/gi;
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

// 2026-08-24: grove plausibiliteitsbox rond het ontvangstgebied (Noordzee/
// Kanaal — ruim rond alle stations in NAVAREA I hierboven). Geen harde
// weiger-drempel (zie de afspraak met Lex hierboven), puur om
// `positieBinnenBereik` te kunnen zetten zodat de kaart een duidelijk-
// onzeker punt anders kan tonen dan een plausibel punt.
const PLAUSIBEL_BOX = { latMin: 43, latMax: 68, lonMin: -25, lonMax: 20 };
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
function kwaliteitsScore(bericht) {
  const schoneAfsluiting = /NNNN/i.test(bericht.body) ? 0 : 1;
  return bericht.coords.length * 4 + (bericht.datum ? 2 : 0) + schoneAfsluiting;
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
  for (const b of berichten) {
    const sleutel = dedupSleutel(b.code, b.typeLetter);
    if (!sleutel) {
      zonderSleutel.push(b); // geen betrouwbare sleutel -- zoals voorheen: los behandelen
      continue;
    }
    const score = kwaliteitsScore(b);
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
  for (const rb of ruweBerichten) {
    const hoortErbij = inhoudSleutel
      ? inhoudsSleutel(rb) === inhoudSleutel
      : Boolean(codeSleutel) && dedupSleutel(rb.code, rb.typeLetter) === codeSleutel;
    if (!hoortErbij) continue;
    aantalOntvangsten += 1;
    if (rb.datum && (!laatsteDatum || rb.datum.getTime() > laatsteDatum.getTime())) laatsteDatum = rb.datum;
  }
  // Geen inhouds- of code-sleutel (te vage station/type-lezing, zie
  // dedupSleutel()/inhoudsSleutel() hierboven) -- dan is er niets om tegen te
  // matchen, en telt het bericht zichzelf als enige ontvangst, net zoals de
  // rest van dit bestand zulke berichten al ongemoeid/los behandelt.
  if (aantalOntvangsten === 0) aantalOntvangsten = 1;
  return { aantalOntvangsten, laatsteDatum };
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
function geannuleerdeReferentiesIn(tekst) {
  const gevonden = [];
  CANCEL_REGEX.lastIndex = 0;
  let m;
  while ((m = CANCEL_REGEX.exec(tekst)) !== null) {
    if (/^THIS\s+(MSG|MESSAGE)\b/i.test(m[1])) continue;
    const ref = referentieIn(m[1]);
    if (ref) gevonden.push(ref);
  }
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
const VANGNET_MAX_OUDERDOM_MS = 60 * 24 * 60 * 60 * 1000;

// 2026-08-24, op verzoek van Lex: eerste, trefwoord-gebaseerde classificatie
// van het soort navigatiewaarschuwing, voor een eigen icoon per eventtype op
// de kaart (zie navtexEventIconHtml() in app.js). Bewust simpele regex-
// regels i.p.v. iets slimmers (NLP/ML) — de frasering in MSI/AVURNAV-
// berichten is vrij vast, en dit is makkelijk uit te breiden zodra een
// nieuw, nog niet herkend type voorbijkomt. Volgorde is van
// specifiek-eerst-algemeen; de eerste match wint.
const EVENT_REGELS = [
  { type: 'riglijst', label: 'Boorplatform(s)', re: /\bRIG\s*(LIST|MOVE)\b|MOBILE OFFSHORE DRILLING UNIT|\bMODU\b/i },
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
  { type: 'licht-onbetrouwbaar', label: 'Licht onbetrouwbaar/uit', re: /(LIGHT|NAVAIDS?|BUOY)[^.]{0,60}\b(UNRELIABLE|EXTINGUISHED|UNLIT|INOPERATIVE|OUT\s+OF\s+ORDER|NOT\s+WORKING|DEFECTIVE)\b/i },
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
function splitsRiglijst(body) {
  const entries = [];
  const regex = new RegExp(COORD_REGEX.source, 'gi');
  const matches = [...body.matchAll(regex)];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const vanaf = match.index + match[0].length;
    const tot = i + 1 < matches.length ? matches[i + 1].index : body.length;
    const naamKandidaat = body
      .slice(vanaf, tot)
      .split(/[.,;]|\bIN\s+POSITION\b|\bPOSITION\b/i)[0];
    // "NEW " hoort bij het VOLGENDE platform (markeert een nieuwe toevoeging
    // t.o.v. de vorige riglijst, zie Lex' voorbeeld) en staat dus aan het
    // EIND van dit stuk tekst, vlak voor de volgende coördinaat — plat-
    // geslagen (geen regeleinde om op te knippen, zie hierboven) lekt dat
    // anders mee als staart van déze naam.
    const naam = naamKandidaat ? naamKandidaat.trim().replace(/\s+NEW$/i, '').slice(0, 60) : null;
    const lat = (Number(match[1]) + Number(normaliseerMinuten(match[2])) / 60) * (match[3].toUpperCase() === 'S' ? -1 : 1);
    const lon = (Number(match[4]) + Number(normaliseerMinuten(match[5])) / 60) * (match[6].toUpperCase() === 'W' ? -1 : 1);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      entries.push({ naam: naam || null, lat: +lat.toFixed(6), lon: +lon.toFixed(6) });
    }
  }
  return entries;
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
function cardinaalRichtingUit(tekst) {
  const match = CARDINAAL_REGEX.exec(tekst);
  return match ? CARDINAAL_RICHTING_PER_WOORD[match[1].toUpperCase()] : null;
}

const BOEI_NAAM_REGEX = /\b([A-Z])\s*-\s*([\s\S]{1,90}?)\s+ESTABLISHED\s+IN\s+POS(?:ITION)?\s*:?\s*$/i;
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
function parseBlok(blok) {
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
  const code = lines[0] || '';
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

  const { stationId, typeLetter } = leesStationEnType(code);
  const station = stationId ? STATION_PER_ID.get(stationId) ?? null : null;
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

  return { code, station, typeLetter, datum, body, weergaveTekst, coords };
}

export async function fetchNavtexLokaal(env = {}) {
  const homeLat = env.homeLat ?? 52.0907;
  const homeLon = env.homeLon ?? 5.1214;
  const straalKm = Number(process.env.NAVTEX_STRAAL_KM) || 450; // zelfde env-var als navtex.js/ukho.js — voor Lex "hetzelfde soort maritiem bericht"
  const bestand = process.env.NAVTEX_LOKAAL_BESTAND || STANDAARD_BESTAND;

  if (!existsSync(bestand)) {
    console.log(`[weer] navtexLokaal: ${bestand} bestaat nog niet — nog geen bericht ontvangen/opgeslagen.`);
    return [];
  }

  const tekst = readFileSync(bestand, 'utf-8').replace(/\r\n/g, '\n');
  const blokken = segmenteerBerichten(tekst);
  const ruweBerichten = blokken.map(parseBlok).filter(Boolean);
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
    const positieIsStation = !b.coords[0] && Boolean(b.station);
    const positie = b.coords[0] ?? (b.station ? { lat: b.station.lat, lon: b.station.lon } : null);
    const afstandTotJouKm = positie ? afstandKm(homeLat, homeLon, positie.lat, positie.lon) : null;
    const positieBinnenBereik = positie ? positiePlausibel(positie) : null;
    const referentie = referentieIn(b.body);
    const zelfVervalDatum = zelfVervalDatumIn(b.body);
    // 2026-08-26, zie ontvangstStatsVoorBericht() hierboven.
    const { aantalOntvangsten, laatsteDatum } = ontvangstStatsVoorBericht(b, ruweBerichten);
    // "laatst gezien" alleen doorgeven als het ECHT een latere waarde is dan
    // de toch al getoonde b.datum -- op Lex' verzoek ("dubbele info anders"
    // naast de bestaande tijdregel), zie tijdregelVoorSignaal() in app.js.
    const laatstGezien = b.datum && laatsteDatum && laatsteDatum.getTime() > b.datum.getTime() ? laatsteDatum : null;
    return { ...b, eventInfo, positie, positieIsStation, afstandTotJouKm, positieBinnenBereik, referentie, zelfVervalDatum, aantalOntvangsten, laatstGezien };
  });

  // Elk bericht (ongeacht bereik/positie) kan een ANDER bericht intrekken —
  // eerst alle CANCEL-verwijzingen uit dit hele bestand verzamelen en in het
  // module-scoped geheugen zetten, dan pas filteren. Zie de toelichting bij
  // GEANNULEERDE_REFERENTIES hierboven.
  for (const b of berichten) {
    for (const ref of geannuleerdeReferentiesIn(b.body)) GEANNULEERDE_REFERENTIES.add(ref);
  }

  const nu = Date.now();
  const binnenBereik = metPositie.filter((b) => b.afstandTotJouKm != null && b.afstandTotJouKm <= straalKm);
  const nietVervallen = binnenBereik.filter((b) => {
    if (b.zelfVervalDatum && b.zelfVervalDatum.getTime() < nu) return false; // "CANCEL THIS MSG <datum>" al gepasseerd
    if (b.referentie && GEANNULEERDE_REFERENTIES.has(b.referentie)) return false; // door een later bericht ingetrokken
    if (!b.zelfVervalDatum && b.datum && nu - b.datum.getTime() > VANGNET_MAX_OUDERDOM_MS) return false; // vangnet, geen primair mechanisme
    return true;
  });

  // Zelfde logdiscipline als navtex.js/ukho.js/getij.js: altijd loggen, ook
  // bij 0 treffers, en ook hoeveel blokken sowieso geen bruikbare code/positie
  // hadden — dat is bij deze testopstelling waardevolle info op zich (hoeveel
  // van wat er binnenkwam is eigenlijk bruikbaar).
  const zonderPositie = berichten.length - metPositie.filter((b) => b.positie).length;
  const vervallen = binnenBereik.length - nietVervallen.length;
  console.log(
    `[weer] navtexLokaal: ${blokken.length} blok(ken) (${ruweBerichten.length} ruw, ${berichten.length} na dedup) in ${bestand}, ` +
      `${berichten.length} met leesbare code, ${zonderPositie} zonder bruikbare positie (corrupte/onbekende station-letter of geen coordinaat), ` +
      `${binnenBereik.length} binnen ${straalKm}km, ${vervallen} vervallen/ingetrokken, ${nietVervallen.length} blijft over.`
  );

  return nietVervallen.flatMap((b) => {
    const typeOmschrijving = b.typeLetter ? TYPE_OMSCHRIJVING[b.typeLetter] ?? null : null;
    const stationNaam = b.station?.naam ?? `station ${leesStationEnType(b.code).stationId ?? '?'} (onbevestigd)`;
    const stationKleur = b.station?.kleur ?? STATION_KLEUR_ONBEKEND;
    const baseId = `navtexlokaal-${b.code}-${b.datum ? b.datum.getTime() : hashTekst(b.body)}`;
    const gedeeldeDetail = {
      code: b.code,
      referentie: b.referentie,
      station: stationNaam,
      stationId: b.station?.id ?? null,
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
      typeLetter: b.typeLetter ?? null,
      noodbericht: b.typeLetter === 'D',
      bron: 'lokaal (ATS Mini + MLA-30+, testopstelling)',
      bestand,
    };

    // Riglijst: los puntsignaal per gevonden platformpositie i.p.v. één
    // gebiedssignaal (zie splitsRiglijst() hierboven).
    if (b.eventInfo.type === 'riglijst') {
      const rigs = splitsRiglijst(b.body);
      if (rigs.length === 0) return []; // frase herkend maar geen enkele positie erin gevonden -- niks te plotten
      return rigs.map((rig, i) =>
        makeSignal({
          id: `${baseId}-rig${i}`,
          categorie: 'navtex',
          titel: `NAVTEX — ${b.eventInfo.label}${rig.naam ? ` — ${rig.naam}` : ''} — ${stationNaam}`,
          ernst: 'waarschuwing',
          lat: rig.lat,
          lon: rig.lon,
          tijd: b.datum ? b.datum.toISOString() : eersteOntvangst(`${baseId}-rig${i}`),
          detail: { ...gedeeldeDetail, positie: rig, riglijstIndex: i, riglijstTotaal: rigs.length },
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
          titel: `NAVTEX (ATS Mini V4) — ${b.eventInfo.label}${boei.naam ? ` — ${boei.naam}` : ''} — ${stationNaam}`,
          ernst: 'waarschuwing',
          lat: boei.lat,
          lon: boei.lon,
          tijd: b.datum ? b.datum.toISOString() : eersteOntvangst(`${baseId}-boei${i}`),
          detail: { ...gedeeldeDetail, positie: boei, boeiNaam: boei.naam, boeiRichting: boei.richting, boeiIndex: i, boeiTotaal: boeien.length },
        })
      );
    }

    const geometrie = classificeerGeometrie(b.body, b.coords, b.eventInfo.type);
    return [
      makeSignal({
        id: baseId,
        categorie: 'navtex',
        // 2026-08-24, op verzoek van Lex: "(test-ontvangst)" tijdelijk
        // vervangen door de concrete hardwarenaam (ATS Mini V4) — "het zal
        // binnenkort weer veranderen" zodra de Airspy HF Discovery er is
        // (verwacht 2026-08-25, zie het bestandshoofd). Dus bewust NIET als
        // losse constante uitgetrokken, gewoon inline zodat de volgende
        // wissel net zo'n kleine, voor de hand liggende diff is als deze.
        titel: `NAVTEX (ATS Mini V4)${typeOmschrijving ? ` — ${typeOmschrijving}` : ''} — ${stationNaam}`,
        ernst: 'waarschuwing',
        lat: b.positie.lat,
        lon: b.positie.lon,
        tijd: b.datum ? b.datum.toISOString() : eersteOntvangst(baseId),
        detail: {
          ...gedeeldeDetail,
          geometrieType: geometrie.type,
          gebiedPolygon: geometrie.gebiedPolygon,
          koerslijn: geometrie.koerslijn,
          // 2026-08-26, zie boeiOmschrijvingUit() hierboven -- alleen gezet
          // bij een LOSSE boei (de gesplitste boei-lijst hierboven zet zijn
          // eigen boeiNaam al, dit is het pad voor 1 boei per bericht).
          boeiNaam: b.eventInfo.type === 'boei-nieuw' ? boeiOmschrijvingUit(b.body) : null,
          // 2026-08-26, zie cardinaalRichtingUit() hierboven.
          boeiRichting: b.eventInfo.type === 'boei-nieuw' ? cardinaalRichtingUit(b.body) : null,
        },
      }),
    ];
  });
}
