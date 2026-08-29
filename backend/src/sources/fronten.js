// fronten.js — koufront/warmtefront/occlusie/stationair-front-lijnen voor de
// kaart, 2026-08-29 op verzoek van Lex ("ik ben echt op zoek naar meteoinfo
// als fronten met dan die driehoekjes aan de frontlijn").
//
// Bron: NWS Weather Prediction Center's "Coded Surface Bulletin" (product
// CODSUS, bulletin-ID ASUS02 KWBC), hetzelfde tekstproduct waarmee WPC/OPC
// hun eigen analysekaart (o.a. de Unified Surface Analysis-GIF) tekent — maar
// dan als platte, machineleesbare tekst i.p.v. een plaatje. Dat is precies
// waarom voor dit format gekozen is i.p.v. de KNMI-kaart of de NOAA
// UA_SFC_ANAL.png die eerder ter sprake kwamen: die twee zijn allebei één
// vast raster-plaatje (georefereren/pixels herkennen nodig), dit is gewoon
// tekst parsen — net als NAVTEX/UKHO elders in dit project.
//
// FORMAAT (bevestigd tegen een echte, door Lex geplakte bulletin van
// 2026-08-29 06Z, niet blind op de WPC-documentatie vertrouwd — zie
// https://www.wpc.ncep.noaa.gov/html/read_coded_bull.shtml voor de
// beschrijving zelf):
//   - Regels beginnen met een fronttype: COLD / WARM / OCFNT (occlusie) /
//     STNRY (stationair) / TROF (trog — geen front, wel in dezelfde bulletin,
//     hieronder meegenomen als aparte, symboolloze lijn).
//   - Elk daaropvolgend cijfergroepje is één punt op de lijn: de eerste 3
//     cijfers zijn de breedtegraad in tienden (bv. "573" = 57,3°N), de
//     laatste 4 de lengtegraad in tienden, ALTIJD geteld als "graden west",
//     0-360 rondlopend (dus 5,0°E wordt geschreven als 355,0°W = "3550") —
//     zelfde 0-360-conventie als de `LatLonBox` in de eerder bekeken
//     UA_SFC_ANAL-KML (west=130/oost=380).
//   - HIGHS/LOWS-regels hebben een ander formaat (drukwaarde + coördinaat) en
//     worden hier genegeerd — dit bestand tekent alleen fronten/trogen.
//
// BEKENDE EIGENAARDIGHEID (ook gezien in de bulletin die Lex plakte, en
// bevestigd als een bekend, niet hier zelf verzonnen probleem — zelfs
// Unidata's eigen MetPy-bibliotheek heeft er een openstaande bug voor:
// https://github.com/Unidata/MetPy/issues/3535): niet elk cijfergroepje is
// netjes 7 cijfers. Vlak bij de nulmeridiaan doken in die bulletin kortere
// groepjes op ("6145", "7705", "5703") waarvan het formaat niet met
// zekerheid is terug te leiden. In plaats van te gokken (zelfde filosofie
// als bij het station-'K'-vs-'E'-onderscheid in navtexLokaal.js: "bij
// twijfel liever iets weglaten dan een verkeerd punt tonen") worden zulke
// afwijkende groepjes gewoon overgeslagen — een front verliest dan hooguit
// één (rand)punt, niet zijn hele vorm. Live tegen de echte bulletin van
// 2026-08-29 06Z getest (79 front-/troglijnen ontleed, 1 regel gedropt omdat
// er te weinig bruikbare punten overbleven, 2 regels met één overgeslagen
// randpunt) — zie de sessie-chat voor het testscript.
//
// NOG NIET LIVE GEVERIFIEERD vanaf een server met eigen internettoegang: de
// sandbox waarin dit gebouwd is kon tgftp.nws.noaa.gov zelf niet bereiken
// (eigen proxy gaf 403) — de bulletin hierboven is met de hand geplakt door
// Lex. Eerste keer dat dit vanaf lexdev-nw echt pollt is dus de eerste
// live-test van de fetch zelf, niet alleen van de parser.

const BRON_URL = 'https://tgftp.nws.noaa.gov/data/raw/as/asus02.kwbc.cod.sus.txt';

// Regels die een front/trog beschrijven beginnen met één van deze codes.
// STNRY/COLD/WARM krijgen driehoekjes/bolletjes (zie tekenlogica in
// app.js), OCFNT afwisselend, TROF blijft een kale (gestreepte) lijn.
const FRONT_TYPES = new Set(['COLD', 'WARM', 'OCFNT', 'STNRY', 'TROF']);

// Eén coördinaat-token ("5730627") ontleden naar [lat, lon] in normale
// graden (lon: west negatief, oost positief). Geeft `null` bij twijfel —
// zie de eigenaardigheid hierboven — i.p.v. te gokken.
function ontleedPunt(token) {
  if (!/^\d{7}$/.test(token)) return null; // alleen de standaard 3+4-vorm vertrouwen
  const lat = Number(token.slice(0, 3)) / 10;
  const lonWest = Number(token.slice(3));
  if (lat < 0 || lat > 90) return null;
  const lon = lonWest <= 1800 ? -(lonWest / 10) : (3600 - lonWest) / 10;
  return [lat, lon];
}

// Eén regel ("COLD 5730627 5520610 ...") naar een front-object. Geeft
// `null` als er na het overslaan van twijfelachtige tokens minder dan 2
// bruikbare punten overblijven (geen lijn te tekenen).
function ontleedRegel(regel) {
  const tokens = regel.trim().split(/\s+/);
  const type = tokens[0];
  if (!FRONT_TYPES.has(type)) return null;

  const punten = [];
  for (const token of tokens.slice(1)) {
    const punt = ontleedPunt(token);
    if (punt) punten.push(punt);
    // Niet-numerieke tokens (bv. een intensiteitscode als "MDT") en
    // afwijkend-lange groepjes worden hier stil overgeslagen — zie de
    // module-comment hierboven.
  }
  if (punten.length < 2) return null;
  return { type, punten };
}

// 2026-08-29-fix, op melding van Lex (live screenshot: driehoekjes/bolletjes
// wisselden niet af, één lang front toonde alleen driehoekjes) — root cause:
// de bulletin splitst één DOORLOPEND front regelmatig op in meerdere
// opeenvolgende regels van hetzelfde type (bevestigd in de bulletin die Lex
// eerder plakte: een STNRY-regel eindigend op "...7001402" gevolgd door een
// STNRY-regel die begint op "7011403" — nagenoeg hetzelfde punt, dus
// overduidelijk hetzelfde fysieke front, alleen over twee regels verdeeld).
// tekenFrontSymbolen() in app.js telt de afwisseling PER front-object vanaf
// nul, dus zonder samenvoegen begint elk los regeltje weer bij "driehoekje"
// — bij veel korte regels achter elkaar ziet dat er dan uit als "bijna
// altijd driehoekjes". Fix: opeenvolgende regels van hetzelfde type met een
// (bijna) gedeeld eindpunt hier al aaneensmeden tot één front, vóórdat de
// data de frontend bereikt.
const AANEENSLUIT_TOLERANTIE_GRADEN = 0.3; // ~30km — vangt afrondingsverschil tussen twee regels die in werkelijkheid één front zijn

function voegAaneen(fronten) {
  const resultaat = [];
  for (const front of fronten) {
    const vorige = resultaat[resultaat.length - 1];
    if (vorige && vorige.type === front.type) {
      const [laatsteLat, laatsteLon] = vorige.punten[vorige.punten.length - 1];
      const [eersteLat, eersteLon] = front.punten[0];
      const dichtbij =
        Math.abs(laatsteLat - eersteLat) <= AANEENSLUIT_TOLERANTIE_GRADEN &&
        Math.abs(laatsteLon - eersteLon) <= AANEENSLUIT_TOLERANTIE_GRADEN;
      if (dichtbij) {
        vorige.punten.push(...front.punten.slice(1)); // gedeelde punt niet dubbel opnemen
        continue;
      }
    }
    resultaat.push({ type: front.type, punten: [...front.punten] });
  }
  return resultaat;
}

export async function fetchFronten() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let tekst;
  try {
    const res = await fetch(BRON_URL, { signal: controller.signal });
    if (!res.ok) throw new Error(`WPC coded bulletin gaf HTTP ${res.status}`);
    tekst = await res.text();
  } finally {
    clearTimeout(timeout);
  }

  const ruw = tekst
    .split('\n')
    .map(ontleedRegel)
    .filter(Boolean);
  const fronten = voegAaneen(ruw);

  console.log(`[weer] fronten: ${ruw.length} regels ontleed, ${fronten.length} front-/troglijnen na aaneensmeden.`);

  return { bron: BRON_URL, bijgewerkt: new Date().toISOString(), fronten };
}
