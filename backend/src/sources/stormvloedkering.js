// stormvloedkering.js — Maeslantkering/Hartelkering-status als melding, op
// verzoek van Lex (2026-08-26): "De Maeslantkering/stormvloedkering-status
// zou ik wel als melding willen toevoegen."
//
// BELANGRIJK VOORBEHOUD (uitgebreid research gedaan, geen gok): er bestaat
// GEEN publieke, gedocumenteerde API die de daadwerkelijke kering-stand
// (open/tussenstand/dicht) van de Maeslantkering rechtstreeks als sensordata
// publiceert — dit is geen weerstation-achtige meetwaarde maar een
// besturingssysteem-status van Rijkswaterstaat zelf, niet ontsloten via de
// gewone RWS-waterdata-API (WADAR/DDL, dezelfde die getij.js gebruikt).
// Onderzocht en afgevallen: waterwebservices/WADAR-catalogus (alleen
// waterhoogte-/golfhoogte-METINGEN bij de kering, bijv. stations MLK1/MLK2
// "Maeslantkering-zeezijde-N/Z" — geen statusveld), PDOK/Nationaal
// Georegister (geen kering-statuslaag gevonden), waterberichtgeving.rws.nl
// (stormvloedrapporten zijn PDF's, ná afloop, geen live feed).
//
// Daarom TWEE onafhankelijke, allebei zwakkere signalen gecombineerd
// (op Lex' expliciete keuze, "Combinatie (aanbevolen)"), zelfde aanpak als
// elders in de app waar een harde bron ontbreekt (zie bijv. blitzortung.js/
// p2000.js voor community-bronnen naast officiële):
//
// 1. VROEGE WAARSCHUWING — RWS' EIGEN, PUBLIEK GEDOCUMENTEERDE sluitcriterium:
//    de Maeslantkering sluit automatisch bij een verwachte waterstand van
//    NAP+3,00m bij Rotterdam ÓF NAP+2,90m bij Dordrecht (letterlijk zo
//    gepubliceerd op rijkswaterstaat.nl, deltawerken/maeslantkering-pagina,
//    2026-08-26 geraadpleegd). Dit is een AFGELEIDE inschatting ("kans op
//    sluiting"), geen bevestiging dat de kering ook echt in beweging komt —
//    RWS kan in de praktijk net onder/boven dit criterium net anders
//    besluiten. Gebruikt de EXACT bewezen WADAR-aanroep uit getij.js
//    (Grootheid WATHTE, ProcesType "verwachting", zelfde catalogus-opzoek-
//    mechanisme) — geen nieuw/ongetest requestpatroon, alleen een nieuwe
//    toepassing (drempelwaarde-check i.p.v. hoog/laagwater-extremen).
// 2. BEVESTIGING — nieuwsmonitoring via dezelfde zelfgehoste SearXNG-instance
//    als searxng.js (community-media): zoekt naar recente nieuwsberichten
//    dat de kering daadwerkelijk gesloten is. Dit IS de bevestiging dat het
//    ook echt gebeurt, maar community/fragiel: hangt af van of/hoe snel
//    er nieuws over verschijnt én of Lex' eigen SearXNG-instance bereikbaar
//    is (net als searxng.js: staat de instance niet aan, dan blijft dit deel
//    gewoon stil leeg, breekt de rest van de app niet).
//
// Maeslantkering én Hartelkering (op Lex' verzoek, "Ook Hartelkering") samen
// in ÉÉN melding: beide sluiten vrijwel altijd gelijktijdig, aangestuurd door
// hetzelfde operationele team (rws.nl noemt ze samen: "Operationeel team
// Maeslantkering/Hartelkering") — dus geen twee bijna-identieke meldingen.
// Als dat ooit niet meer klopt (een van de twee sluit los van de ander) is
// dat een aanname die dan bijgesteld moet worden.
import { makeSignal } from '../normalize.js';
import { fetchSearxngNieuws } from './searxng.js';
import { stuurAlarm, kaartTekst } from './pushover.js';
import { stuurMailAlarm } from './email.js';
import { stuurWebPushAlarm } from './webpush.js';

// Algemene geografische kennis (zelfde soort aanpak als KANDIDATEN in
// getij.js — expliciet gemarkeerd als approximatie, niet uit een officiële
// bron opgezocht): Maeslantkering ligt in de Nieuwe Waterweg bij Hoek van
// Holland/Maassluis. Kaartpin op deze locatie, Hartelkering (iets zuidelijker
// bij Europoort/Spijkenisse) alleen in de tekst genoemd — zie toelichting
// hierboven waarom niet als losse pin.
const KERING_LAT = 51.9214;
const KERING_LON = 4.1372;

// RWS' eigen sluitcriterium (rijkswaterstaat.nl, Deltawerken/Maeslantkering-
// pagina, geraadpleegd 2026-08-26): "3 m boven Normaal Amsterdams Peil (NAP)
// bij Rotterdam en 2,9 m boven NAP bij Dordrecht". RWS' WADAR-waterhoogtes
// (zie getij.js) komen terug in CENTIMETER t.o.v. NAP, vandaar hier ook in cm.
const DREMPEL_ROTTERDAM_CM = 300;
const DREMPEL_DORDRECHT_CM = 290;
const STATIONS = [
  { naam: 'Rotterdam', drempelCm: DREMPEL_ROTTERDAM_CM },
  { naam: 'Dordrecht', drempelCm: DREMPEL_DORDRECHT_CM },
];

// Zelfde WADAR-basis/endpoints als getij.js (bewust een eigen kleine kopie
// i.p.v. functies vanuit getij.js te importeren: dat bestand exporteert
// alleen fetchGetij() zelf, de interne helpers zijn daar niet voor
// hergebruik bedoeld/geëxporteerd — en dit bestand heeft een net iets ander
// gebruik, vaste stationsnamen i.p.v. een straal-rond-huis-selectie).
const BASE_URL = 'https://ddapi20-waterwebservices.rijkswaterstaat.nl';
const CATALOGUS_URL = `${BASE_URL}/METADATASERVICES/OphalenCatalogus`;
const WAARNEMINGEN_URL = `${BASE_URL}/ONLINEWAARNEMINGENSERVICES/OphalenWaarnemingen`;

const CATALOGUS_CACHE_MS = 24 * 60 * 60 * 1000;
let catalogusCache = null; // { opgehaaldOp, codePerNaam }

async function haalCodePerNaam() {
  if (catalogusCache && Date.now() - catalogusCache.opgehaaldOp < CATALOGUS_CACHE_MS) {
    return catalogusCache.codePerNaam;
  }
  const res = await fetch(CATALOGUS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ CatalogusFilter: { Locaties: true } }),
  });
  if (!res.ok) throw new Error(`RWS-catalogus gaf status ${res.status}`);
  const body = await res.json();
  const codePerNaam = new Map();
  (body.LocatieLijst ?? []).forEach((l) => {
    if (l.Naam && l.Code) codePerNaam.set(String(l.Naam).trim().toLowerCase(), l.Code);
  });
  catalogusCache = { opgehaaldOp: Date.now(), codePerNaam };
  return codePerNaam;
}

async function haalWaterstandVerwachting(code, vanaf, tot) {
  const res = await fetch(WAARNEMINGEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      Locatie: { Code: code },
      AquoPlusWaarnemingMetadata: {
        AquoMetadata: {
          Grootheid: { Code: 'WATHTE' },
          ProcesType: 'verwachting',
        },
      },
      Periode: {
        Begindatumtijd: vanaf.toISOString(),
        Einddatumtijd: tot.toISOString(),
      },
    }),
  });
  if (res.status === 204) return null; // geldig "geen data", zie getij.js
  if (!res.ok) throw new Error(`RWS-waarnemingen gaf status ${res.status}`);
  return res.json();
}

// Zelfde defensieve parse als getij.js's puntenUitWaarnemingen().
function puntenUitWaarnemingen(body) {
  const reeks = body?.WaarnemingenLijst?.[0]?.MetingenLijst ?? body?.WaarnemingenLijst?.[0]?.metingenLijst ?? [];
  if (!Array.isArray(reeks)) return [];
  return reeks
    .map((m) => {
      const tijdMs = m?.Tijdstip ? new Date(m.Tijdstip).getTime() : null;
      const ruw = m?.Meetwaarde?.Waarde_Numeriek ?? m?.Meetwaarde?.waarde_Numeriek ?? m?.waarde;
      return { tijdMs, hoogteCm: ruw != null ? Number(ruw) : null };
    })
    .filter((p) => Number.isFinite(p.tijdMs) && Number.isFinite(p.hoogteCm));
}

// Hoogste verwachte waterstand binnen het venster, per station — vergeleken
// met het eigen drempel van dat station.
async function pieknVerwachtingVoorStation(station, codePerNaam) {
  const code = codePerNaam.get(station.naam.trim().toLowerCase());
  if (!code) {
    console.log(`[weer] stormvloedkering: RWS-locatiecode voor "${station.naam}" niet gevonden in de catalogus, sla over.`);
    return null;
  }
  const nu = Date.now();
  // 72 uur vooruit: ruim boven de gebruikelijke ~24u-vooraankondiging van een
  // sluiting, zodat een piek die pas over 2-3 dagen verwacht wordt ook al als
  // vroege waarschuwing meegenomen wordt.
  const vanaf = new Date(nu - 30 * 60 * 1000);
  const tot = new Date(nu + 72 * 60 * 60 * 1000);
  const body = await haalWaterstandVerwachting(code, vanaf, tot);
  const punten = body ? puntenUitWaarnemingen(body) : [];
  if (!punten.length) return null;
  const piek = punten.reduce((max, p) => (p.hoogteCm > max.hoogteCm ? p : max), punten[0]);
  return { station: station.naam, drempelCm: station.drempelCm, piekCm: piek.hoogteCm, piekTijdMs: piek.tijdMs };
}

async function bepaalVroegeWaarschuwing() {
  let codePerNaam;
  try {
    codePerNaam = await haalCodePerNaam();
  } catch (err) {
    console.error('[weer] stormvloedkering: RWS-locatiecatalogus ophalen mislukt,', err.message ?? err);
    return null;
  }
  const resultaten = await Promise.allSettled(STATIONS.map((s) => pieknVerwachtingVoorStation(s, codePerNaam)));
  const pieken = [];
  resultaten.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(`[weer] stormvloedkering: verwachting voor ${STATIONS[i].naam} ophalen mislukt,`, r.reason?.message ?? r.reason);
      return;
    }
    if (r.value) pieken.push(r.value);
  });
  // Alleen stations die daadwerkelijk over hun eigen drempel gaan.
  const overDrempel = pieken.filter((p) => p.piekCm >= p.drempelCm);
  if (!overDrempel.length) return null;
  // Eerstvolgende (in tijd) drempeloverschrijding is het relevantst.
  overDrempel.sort((a, b) => a.piekTijdMs - b.piekTijdMs);
  return overDrempel[0];
}

// 2026-08-26: eigen, kleine nieuws-zoekfunctie in searxng.js (fetchSearxngNieuws)
// i.p.v. de bestaande fetchSearxngMedia() hier hergebruiken — die laatste is
// specifiek gebouwd om FOTO'S/VIDEO'S bij een reeds bestaand signaal te vinden
// (thumbnail verplicht, zie searxng.js), niet om zelf te bepalen OF er relevant
// nieuws is. fetchSearxngNieuws() geeft ruwe titel/link/bron terug, geen
// thumbnail-eis.
async function zoekBevestiging(zoekterm) {
  const resultaten = await fetchSearxngNieuws(zoekterm, 5);
  const GESLOTEN_PATROON = /gesloten|dicht\b/i;
  return resultaten.find((r) => GESLOTEN_PATROON.test(r.titel) || GESLOTEN_PATROON.test(r.samenvatting ?? '')) ?? null;
}

async function bepaalBevestiging() {
  // Twee zoektermen (kering kan ook los van de andere genoemd worden in een
  // kop), eerste treffer wint — zie toelichting bovenaan waarom dit één
  // gecombineerde melding is.
  try {
    const [maeslant, hartel] = await Promise.all([
      zoekBevestiging('Maeslantkering'),
      zoekBevestiging('Hartelkering'),
    ]);
    return maeslant ?? hartel ?? null;
  } catch (err) {
    console.error('[weer] stormvloedkering: nieuwsbevestiging ophalen mislukt (SearXNG niet bereikbaar?),', err.message ?? err);
    return null;
  }
}

function dagIso(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export async function fetchStormvloedkering() {
  const signalen = [];

  const [waarschuwing, bevestiging] = await Promise.all([bepaalVroegeWaarschuwing(), bepaalBevestiging()]);

  if (waarschuwing) {
    const signaalId = `stormvloedkering-waarschuwing-${dagIso(waarschuwing.piekTijdMs)}`;
    const signaal = makeSignal({
      id: signaalId,
      categorie: 'stormvloedkering-waarschuwing',
      titel: 'Kans op sluiting Maeslant-/Hartelkering',
      ernst: 'waarschuwing',
      lat: KERING_LAT,
      lon: KERING_LON,
      tijd: new Date().toISOString(),
      detail: {
        subtitel: `Verwachte waterstand ${waarschuwing.station} ${Math.round(waarschuwing.piekCm / 10) / 10}m boven NAP (drempel ${waarschuwing.drempelCm / 100}m)`,
        station: waarschuwing.station,
        drempelCm: waarschuwing.drempelCm,
        piekCm: waarschuwing.piekCm,
        piekTijdIso: new Date(waarschuwing.piekTijdMs).toISOString(),
        bronUrl: 'https://waterinfo.rws.nl/',
      },
    });
    const titel = 'Kans op sluiting stormvloedkering';
    const bericht = kaartTekst(signaal);
    stuurAlarm({ id: signaalId, titel, bericht, prioriteit: 1 });
    stuurMailAlarm({ id: signaalId, titel, bericht, lat: signaal.lat, lon: signaal.lon });
    stuurWebPushAlarm({ id: signaalId, titel, bericht, url: `/?signaal=${encodeURIComponent(signaalId)}`, lat: signaal.lat, lon: signaal.lon });
    signalen.push(signaal);
  }

  if (bevestiging) {
    const signaalId = `stormvloedkering-gesloten-${dagIso(Date.now())}`;
    const signaal = makeSignal({
      id: signaalId,
      categorie: 'stormvloedkering-gesloten',
      titel: 'Maeslant-/Hartelkering gesloten',
      ernst: 'kritiek',
      lat: KERING_LAT,
      lon: KERING_LON,
      tijd: new Date().toISOString(),
      detail: {
        subtitel: bevestiging.titel,
        bronUrl: bevestiging.link,
        bronNaam: bevestiging.bron,
      },
    });
    const titel = 'Stormvloedkering gesloten';
    const bericht = kaartTekst(signaal);
    stuurAlarm({ id: signaalId, titel, bericht, url: bevestiging.link, prioriteit: 2 });
    stuurMailAlarm({ id: signaalId, titel, bericht, url: bevestiging.link, lat: signaal.lat, lon: signaal.lon });
    stuurWebPushAlarm({ id: signaalId, titel, bericht, url: `/?signaal=${encodeURIComponent(signaalId)}`, lat: signaal.lat, lon: signaal.lon });
    signalen.push(signaal);
  }

  return signalen;
}
