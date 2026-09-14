// 2026-09-14, op verzoek van Lex ("Er staat nog iets open van boeien met een
// file van RWS denk ik" -- daarna: "We hebben data met daarin posities van
// boeien etc. Kunnen we een aparte laag maken met al deze objecten en die
// aan en uit zetten? Ook de optie om alleen deze objecten te tonen zonder
// schepen en andere meldingen en icons"; bevestigd met "bouw dit maar zo"):
// alle Rijkswaterstaat-vaarwegmarkeringen (boeien + vaste bakens/lichten) uit
// de PDOK-dataset "vaarwegmarkeringen-nederland", als EIGEN laag naast (niet
// gekoppeld aan) de bestaande AIS-navigatiehulp-stippen. Eerder onderzocht of
// koppelen aan de AIS type-21-objecten (navigatiehulp) zinvol was: in de
// praktijk vrijwel nooit aanwezig in de eigen ontvangst (0 van 11 schepen op
// een steekproefmoment), dus bewust een losstaande laag geworden.
//
// Twee PDOK-collecties, CC0, geen sleutel nodig:
// - vaarweg_markeringen_drijvend_rd (boeien, ~10.100 stuks)
// - vaarweg_markeringen_vast_rd (vaste bakens/lichten/lichttorens, ~8.400 stuks)
// Cursor-paginering, limit=1000 per pagina (hoger genegeerd door de API).
//
// Zelfde opzet als sources/zeemarkering.js: één STATISCH bestand (gecommit,
// gevuld door tools/haal-vaarwegmarkeringen.mjs) + een maandelijkse
// runtime-verversing door de server (zie server.js). Landelijk is dit maar
// ~18.500 objecten in totaal -- klein genoeg om in het geheugen te houden en
// per kaartbeeld (bbox) uit te filteren, geen aparte cache/straal-opzet nodig.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const STATISCH_BESTAND = join(__dirname, '..', 'data', 'rws-vaarwegmarkeringen-nl.json');
const RUNTIME_BESTAND = join(__dirname, '..', '..', 'data', 'rws-vaarwegmarkeringen-nl.json');
export const VERVERS_MS = 30 * 24 * 60 * 60 * 1000; // RWS wijzigt dit zelden; 1x/maand is ruim genoeg (zelfde ritme als zeemarkeringen)

const PDOK_BASIS = 'https://api.pdok.nl/rws/vaarwegmarkeringen-nederland/ogc/v1';
const COLLECTIES = [
  { naam: 'vaarweg_markeringen_drijvend_rd', drijvend: true },
  { naam: 'vaarweg_markeringen_vast_rd', drijvend: false },
];

let markeringen = null; // [{ naam, drijvend, kleur, vorm, type, lichtkarakter, lichtgroep, lichtperiode, vaarwater, lat, lon }]
let bestandInfo = null; // { opgehaald, aantal, pad }

// ---- inlezen ---------------------------------------------------------------
function leesBestand(pad) {
  const ruw = JSON.parse(readFileSync(pad, 'utf-8'));
  return { markeringen: ruw.markeringen ?? [], opgehaald: ruw.opgehaald ?? null, pad };
}

export function laadVaarwegmarkeringen() {
  const kandidaten = [];
  for (const pad of [RUNTIME_BESTAND, STATISCH_BESTAND]) {
    try { kandidaten.push(leesBestand(pad)); } catch { /* ontbreekt of kapot -- volgende */ }
  }
  if (!kandidaten.length) {
    markeringen = [];
    bestandInfo = { opgehaald: null, aantal: 0, pad: null };
    console.warn('[weer] rws-vaarwegmarkeringen: geen bestand gevonden -- draai tools/haal-vaarwegmarkeringen.mjs');
    return;
  }
  kandidaten.sort((a, b) => new Date(b.opgehaald ?? 0) - new Date(a.opgehaald ?? 0));
  const gekozen = kandidaten[0];
  markeringen = gekozen.markeringen;
  bestandInfo = { opgehaald: gekozen.opgehaald, aantal: markeringen.length, pad: gekozen.pad };
  console.log(`[weer] rws-vaarwegmarkeringen: ${markeringen.length} markeringen geladen (opgehaald ${gekozen.opgehaald ?? '?'}, ${gekozen.pad === RUNTIME_BESTAND ? 'runtime-export' : 'statisch bestand'})`);
}

export function vaarwegmarkeringenLeeftijdMs() {
  if (!bestandInfo) laadVaarwegmarkeringen();
  return bestandInfo?.opgehaald ? Date.now() - new Date(bestandInfo.opgehaald).getTime() : Infinity;
}

// ---- opzoeken ----------------------------------------------------------------
// Geen straal-vanuit-huis zoals rwsMeetpunten/zeemarkering: dit is een
// landelijke laag die je overal op het water wilt kunnen zien. Landelijk is
// dit maar ~18.500 objecten (~1-2 MB JSON) -- klein genoeg om in één keer
// naar de frontend te sturen zodra de laag aangezet wordt (zie
// toggleRwsBoeien() in app.js, dezelfde "eenmaal ophalen, klantzijde
// clusteren" opzet als de NWR-zenderlijst). Een bbox (?west=&zuid=&oost=&noord=)
// is optioneel, voor eventueel later filteren; zonder bbox komt alles terug.
export function fetchVaarwegmarkeringen({ west, zuid, oost, noord } = {}) {
  if (!markeringen) laadVaarwegmarkeringen();
  // Let op: URLSearchParams.get() geeft null terug voor een ontbrekende
  // parameter, en Number(null) is 0 -- niet NaN. Zonder deze expliciete
  // "is er überhaupt iets meegegeven"-check zou een ontbrekende bbox dus
  // stilletjes als bbox (0,0,0,0) gelezen worden, en alles wegfilteren
  // (bug gevonden 2026-09-14: de RWS-boeienlaag toonde daardoor 0 boeien).
  const opgegeven = [west, zuid, oost, noord].every((v) => v != null && v !== '');
  const w = Number(west), z = Number(zuid), o = Number(oost), n = Number(noord);
  const heeftBbox = opgegeven && [w, z, o, n].every(Number.isFinite);
  const lijst = heeftBbox ? markeringen.filter((m) => m.lat >= z && m.lat <= n && m.lon >= w && m.lon <= o) : markeringen;
  return { markeringen: lijst, bestand: bestandInfo };
}

// ---- normaliseren ------------------------------------------------------------
// sign_kar is in vaarweg_markeringen_vast_rd voluit geschreven, bv.
// "LFl (long-flashing)" of "Q (quick)" -- de PDOK-uitleg tussen haakjes eraf,
// zodat het net zo compact wordt als de al-korte waarden in _drijvend_rd
// (bv. "Fl", "Iso"). "Niet toegewezen" (= onverlicht/niet van toepassing) en
// "#" (= geen waarde) worden null.
function normaliseerTekst(waarde) {
  if (waarde == null) return null;
  const t = String(waarde).trim();
  if (!t || t === '#' || t === 'Niet toegewezen') return null;
  return t;
}

// Keuzelijst-velden (topteken, kleurpatroon, lichtkleur, racon) gebruiken "X"
// als "niet van toepassing" -- bij de vrije-tekstvelden hierboven komt "X"
// niet voor, dus dat blijft een aparte helper.
function normaliseerKeuze(waarde) {
  const t = normaliseerTekst(waarde);
  return !t || t === 'X' ? null : t;
}

function normaliseerLichtKarakter(waarde) {
  const t = normaliseerTekst(waarde);
  if (!t) return null;
  const m = t.match(/^([^(]+?)\s*\(/); // "LFl (long-flashing)" -> "LFl"
  return (m ? m[1] : t).trim();
}

// Lege velden weglaten: veruit de meeste objecten hebben geen topteken, licht
// of racon, en met ~18.500 records scheelt dat flink in de bestandsgrootte en
// in wat er per keer naar de frontend gaat. Let op: `false` moet blijven
// staan (drijvend), dus alleen null/undefined eruit.
function zonderLege(o) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null));
}

// 2026-09-14, op verzoek van Lex ("zo compleet mogelijk doen"): naast naam/
// kleur/vorm/licht ook alles wat nodig is om echte zeekaartsymbolen te
// tekenen -- topteken (twee kegels = kardinaal), kleurpatroon (horizontale
// of verticale strepen i.p.v. alleen de eerste kleur), lichtkleur, IALA-
// categorie, racon, en bij de vaste objecten de nautische functie
// (kribbaken/oeverlicht/havenlicht/lichtopstand) en de hoogte.
// De twee collecties noemen een paar velden anders: obj_vorm vs
// object_vorm_o, tt_toptek vs v_toptek, iala_categorie vs iala_cat,
// licht_klr vs licht_kl.
function markeringUitFeature(f, drijvend) {
  const p = f.properties ?? {};
  const lat = p.y_wgs84;
  const lon = p.x_wgs84;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  // Getallen komen als tekst met een decimale komma ("47,5").
  const getal = (v) => {
    const n = Number(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : null;
  };
  // 2026-09-14, tweede ronde (Lex zag op OpenSeaMap "Dir Iso.W.4s47.5m21M"
  // bij LL 112 GR. HOOG en vroeg of die completere info ook te halen was):
  // op de 21M na staat dat allemaal gewoon in deze dataset. Eerste versie
  // pakte obj_hoogte voor de hoogte -- dat veld staat overal op "0,00000";
  // de werkelijke lichthoogte zit in licht_hgt.
  const lichthoogte = getal(p.licht_hgt);
  const lichtrichting = getal(p.licht_rich);
  // Sectorlichten: tot 16 paren kleur + grens-hoek. De veldnamen zijn niet
  // helemaal consequent (licht_11g naast licht_1_g), vandaar beide vormen.
  const sectoren = [];
  for (let i = 1; i <= 16; i++) {
    const sectorKleur = normaliseerKeuze(p[`licht_${i}_k`]);
    if (!sectorKleur) continue;
    const grens = getal(p[`licht_${i}_g`] ?? p[`licht_${i}g`]);
    sectoren.push(grens != null ? `${sectorKleur} tot ${grens}°` : sectorKleur);
  }
  return zonderLege({
    naam: normaliseerTekst(p.benaming),
    drijvend,
    kleur: normaliseerTekst(p.obj_kleur),
    kleurpatroon: normaliseerKeuze(p.kleurpatr), // "Horizontaal" / "Vertikaal"; anders egaal
    vorm: normaliseerTekst(drijvend ? p.obj_vorm : p.object_vorm_o),
    type: normaliseerTekst(p.obj_soort),
    functie: normaliseerTekst(p.naut_funct), // alleen bij de vaste objecten
    topteken: normaliseerKeuze(drijvend ? p.tt_toptek : p.v_toptek),
    toptekenKleur: normaliseerKeuze(p.tt_kleur),
    toptekenPatroon: normaliseerKeuze(p.tt_klr_pat),
    lichtkarakter: normaliseerLichtKarakter(p.sign_kar),
    lichtgroep: normaliseerTekst(p.sign_groep),
    lichtperiode: normaliseerTekst(p.sign_perio),
    lichtkleur: normaliseerKeuze(drijvend ? p.licht_klr : p.licht_kl),
    iala: normaliseerKeuze(drijvend ? p.iala_categorie : p.iala_cat),
    racon: normaliseerKeuze(p.racon_code),
    lichthoogteM: lichthoogte,
    lichtrichting: lichtrichting, // gerichte lichten/lichtenlijnen: peiling in graden
    lichtsectoren: sectoren.length ? sectoren : null,
    lichtnummer: normaliseerKeuze(p.licht_nr), // nummer in de officiële lichtenlijst
    opgeheven: normaliseerKeuze(p.opgeheven),
    vaarwater: normaliseerTekst(p.vaarwater),
    lat: Math.round(lat * 1e5) / 1e5,
    lon: Math.round(lon * 1e5) / 1e5,
  });
}

// ---- exporteren (PDOK, cursor-paginering) ----------------------------------
async function haalCollectie(collectie, log) {
  const items = [];
  let url = `${PDOK_BASIS}/collections/${collectie.naam}/items?f=json&limit=1000`;
  let pagina = 0;
  while (url) {
    pagina += 1;
    const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new Error(`PDOK ${collectie.naam} pagina ${pagina} gaf status ${res.status}`);
    const body = await res.json();
    for (const f of body.features ?? []) {
      const m = markeringUitFeature(f, collectie.drijvend);
      if (m) items.push(m);
    }
    log(`${collectie.naam}: pagina ${pagina}, totaal ${items.length}`);
    const volgende = (body.links ?? []).find((l) => l.rel === 'next');
    url = volgende?.href ?? null;
  }
  return items;
}

// Haalt beide PDOK-collecties landelijk op en schrijft naar `doel`; geeft
// { aantal, doel } terug. Gebruikt door tools/haal-vaarwegmarkeringen.mjs
// (doel = statisch bestand) en door de maandelijkse verversing in server.js
// (doel = runtime-bestand).
export async function exporteerVaarwegmarkeringen({ doel = RUNTIME_BESTAND, log = (t) => console.log(`[weer] rws-vaarwegmarkeringen: ${t}`) } = {}) {
  const alle = [];
  for (const collectie of COLLECTIES) {
    const items = await haalCollectie(collectie, log);
    alle.push(...items);
    log(`${collectie.naam}: klaar, ${items.length} markeringen`);
  }
  mkdirSync(dirname(doel), { recursive: true });
  writeFileSync(doel, JSON.stringify({ bron: 'Rijkswaterstaat via PDOK (CC0)', opgehaald: new Date().toISOString(), aantal: alle.length, markeringen: alle }));
  log(`${alle.length} vaarwegmarkeringen -> ${doel}`);
  markeringen = null; // volgende fetchVaarwegmarkeringen() laadt opnieuw (nieuwste bestand wint)
  return { aantal: alle.length, doel };
}
