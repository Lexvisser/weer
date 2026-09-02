// vaarradarAishub.js — AANVULLENDE scheepsposities via AISHub's aggregatie-
// netwerk, op verzoek van Lex 2026-09-01 ("we konden toch lid worden en dan
// zodoende veel gaan pollen ergens, doordat we nu zelf ontvangen"). Anders
// dan vaarradar.js (aisstream.io) is dit GEEN fallback voor als de lokale
// ontvangst leeg is, maar een MERGE naast vaarradarLokaal.js — het doel is
// niet "sneller dan onze eigen ontvangst" (dat kan niet, zie de 60s-
// ratelimit hieronder) maar "schepen zien die onze antenne mist" (hard
// aangetoond 2026-09-01: schepen binnen bereik kregen soms maar een fractie
// van hun berichten gedecodeerd, zie de sessie-notitie van die dag).
//
// Lex is toegelaten als contributor (aanvraag 2026-09-01, station-ID 4152,
// eigen ontvangst gedeeld via UDP naar data.aishub.net:4152, zie de
// bijgewerkte ExecStart in /etc/systemd/system/ais-catcher.service op
// lexdev-nw) en kreeg DIRECT een API-key/username (AH_4152_E3319140) mee in
// de bevestigingsmail — dus zonder de aangekondigde 7-dagen-kwaliteitstoets
// af te wachten. Die sleutel hoort ALLEEN in het echte .env-bestand op
// lexdev-nw, nooit in git (zie AISHUB_USERNAME in .env.example).
//
// API: https://www.aishub.net/api — GET https://data.aishub.net/ws.php met
// query-params username/format/output/latmin/latmax/lonmin/lonmax/interval.
// format=1 (mensleesbare velden i.p.v. rauwe AIS-encoding), output=json.
// BELANGRIJKE REGEL van AISHub zelf: "Don't access the webservice more
// frequently than once per minute! The web service will return nothing if
// executed more frequently!" — vandaar POLL_MS hieronder ruim boven 60s.
//
// Responsvorm (bevestigd via AISHub's eigen documentatie-voorbeeld, NIET
// live getest vanuit deze sessie — geen curl-toegang tot lexdev-nw hiervoor
// nodig gehad, maar wel expliciet nagekeken i.p.v. geraden na eerdere fouten
// met aannames over externe formaten in dit project):
//   [ { "ERROR": false, "USERNAME": "...", "FORMAT": "HUMAN", "RECORDS": 5 },
//     [ { "MMSI": 244750034, "TIME": "2021-07-09 08:06:53 GMT",
//         "LONGITUDE": 5.03806, "LATITUDE": 52.46015, "COG": 360, "SOG": 0,
//         "HEADING": 511, "ROT": 128, "NAVSTAT": 8, "IMO": 0,
//         "NAME": "CHATEAUROUX", "CALLSIGN": "PH7002", "TYPE": 69,
//         "A": 24, "B": 6, "C": 0, "D": 6, "DRAUGHT": 1.2, "DEST": "",
//         "ETA": "00-00 24:60" }, ... ] ]
// Dus een array van TWEE elementen: eerst een statusobject (ERROR moet
// false zijn), dan pas de array met schepen — GEEN kale schepenlijst zoals
// bij vaarradarLokaal.js's GeoJSON. HEADING=511 is dezelfde AIS-sentinel
// voor "onbekend" als bij de lokale bron, TYPE is dezelfde ITU-R
// M.1371-scheepstypecode als AIS-catcher's shiptype-veld — vandaar hergebruik
// van categoriseerScheepstype() uit vaarradarLokaal.js i.p.v. een eigen kopie.

import { categoriseerScheepstype } from './vaarradarLokaal.js';
import { afstandKm } from '../normalize.js';

const POLL_MS = 65 * 1000; // ruim boven AISHub's "niet vaker dan 1x/minuut"
const VENSTER_MS = 15 * 60 * 1000; // iets ruimer dan vaarradarLokaal.js's 10 min -- AISHub's eigen
// vertraging (andere stations, netwerklatency) betekent dat "vers" hier sowieso wat rekkelijker is
const BACKOFF_START_MS = 30 * 1000;
const BACKOFF_MAX_MS = 5 * 60 * 1000;
const BOX_KM = 250; // 2026-09-02, op verzoek van Lex ("als het kan wil ik graag meer zien") --
// samen opgetrokken met de /api/vaarradar-grens in server.js en VAARRADAR_STRAAL_KM in app.js;
// deze moet minstens even groot zijn als die twee, anders wordt AISHub's eigen aanvulling al
// hier afgekapt voordat de route/kaart er zelfs aan toekomen.

// 2026-09-02, HARDE LES: een volle 250km-box in een druk gebied (Rotterdam-aanloop +
// Noordzee/Kanaal) leverde 9261-10000+ schepen op -- dat werd bij ELKE /api/vaarradar-
// verzoek vanuit de kaart (elke 3s, zolang Vaart-modus openstaat) opnieuw doorgerekend
// voor de dekkings-/straal-filters in server.js, en dat heeft vermoedelijk de Minisforum
// zelf vastgezet (Tailscale liet nog wel tx zien maar geen rx meer terug -- consistent
// met een dichtgeslibd systeem, niet met een netwerk-/stroomprobleem). MAX_AISHUB_SCHEPEN
// hieronder is een harde bovengrens, ONGEACHT hoe druk het gebied is: na elke poll wordt,
// als dat aantal overschreden is, gesorteerd op afstand tot de antenne en blijft alleen
// het dichtstbijzijnde deel over -- de instelbare straal-knop in de kaart (app.js) bepaalt
// verder nog steeds wat je daadwerkelijk TE ZIEN krijgt, dit is puur een geheugen-/CPU-
// veiligheidsklep die nooit had mogen ontbreken.
//
// 2026-09-02, TWEEDE HARDE LES (zelfde dag): de gap-filter ("AISHub-schepen binnen
// het eigen antennebereik weglaten") stond eerst in server.js NA deze cap. Gevolg,
// hard gemeten in de journal: 8618 schepen binnen -> 800 dichtstbijzijnde bewaard ->
// die 800 lagen ALLEMAAL binnen de 15km rond Oud-Beijerland (Botlek, Waalhaven,
// Oude Maas, Dordrecht...) -> de route gooide ze daarna allemaal weg -> 0 AISHub-
// schepen op de kaart. Twee filters die elk apart kloppen, kannibaliseerden elkaar.
// Daarom staat de gap-filter nu HIER, bij binnenkomst en VOOR de cap: eerst het
// gebied weglaten dat de eigen antenne toch al dekt, dan pas de 800 dichtstbijzijnde
// van wat overblijft bewaren. En hij is instelbaar via AISHUB_LOKALE_DEKKING_KM in
// .env, standaard 0 (= uit) -- Lex zei letterlijk "nu niet van belang, maar bouw het
// maar voor als straks de antenne komt", dus pas aanzetten (op het dan opnieuw
// gemeten bereik) als de VHF-antenne gemonteerd is.
//
// 2026-09-02 (later die dag): eerst 800, toen 2000, en toen bleek dat verwarrend
// naast de rangeknop in de kaart: de 2000 dichtstbijzijnde rond Rotterdam liggen
// allemaal binnen enkele tientallen km, dus de rangeknop op 250km toonde daarbuiten
// toch geen AISHub-schepen -- twee knoppen voor een gevoel. Besluit van Lex: de
// rangeknop (app.js, 50-250km) is de ENIGE knop die de gebruiker voelt; deze cap is
// puur een noodrem tegen een op hol geslagen API-antwoord en hoort zo hoog te staan
// dat hij binnen de 250km-box (~8600 schepen gemeten) nooit bijt. Vandaar 10000.
// Overschrijfbaar via AISHUB_MAX_SCHEPEN in .env.
const MAX_AISHUB_SCHEPEN_STANDAARD = 10000;

function bounding(homeLat, homeLon) {
  const latMargin = BOX_KM / 111; // 1 breedtegraad ~ 111km, overal op aarde
  const lonMargin = BOX_KM / (111 * Math.max(0.1, Math.cos((homeLat * Math.PI) / 180))); // lengtegraad krimpt met cos(breedtegraad)
  return {
    latmin: homeLat - latMargin,
    latmax: homeLat + latMargin,
    lonmin: homeLon - lonMargin,
    lonmax: homeLon + lonMargin,
  };
}

function vertaalVaartuig(v) {
  const mmsi = v?.MMSI;
  const lat = v?.LATITUDE;
  const lon = v?.LONGITUDE;
  if (mmsi == null || typeof lat !== 'number' || typeof lon !== 'number') return null;

  const koersGraden =
    typeof v.HEADING === 'number' && v.HEADING < 511 ? v.HEADING : typeof v.COG === 'number' ? v.COG : null;

  // TIME komt als "YYYY-MM-DD HH:MM:SS GMT" -- Node/V8 parsen dat formaat
  // prima (niet-standaard maar breed ondersteunde uitbreiding), maar val bij
  // een onverwachte afwijking terug op "nu" i.p.v. een NaN-tijdstip.
  const geparsed = typeof v.TIME === 'string' ? Date.parse(v.TIME) : NaN;
  const tijdMs = Number.isFinite(geparsed) ? geparsed : Date.now();

  return {
    mmsi,
    naam: String(v.NAME ?? '').trim() || null,
    lat,
    lon,
    koersGraden,
    snelheidKn: typeof v.SOG === 'number' ? v.SOG : null,
    scheepscategorie: categoriseerScheepstype(typeof v.TYPE === 'number' ? v.TYPE : null),
    tijdMs,
  };
}

export function startVaarradarAishubFeed(env) {
  const posities = new Map(); // mmsi -> { mmsi, naam, lat, lon, koersGraden, snelheidKn, scheepscategorie, tijdMs }

  if (!env.aishubUsername) {
    console.log('[weer] vaarradarAishub: geen AISHUB_USERNAME ingesteld, laag blijft leeg (zie backend/.env.example).');
    return { posities, stop: () => {} };
  }
  if (typeof fetch === 'undefined') {
    console.log('[weer] vaarradarAishub: deze Node-versie heeft geen ingebouwde fetch (nodig: Node 18+), laag blijft leeg.');
    return { posities, stop: () => {} };
  }

  const dekkingKm = Number.isFinite(env.aishubLokaleDekkingKm) && env.aishubLokaleDekkingKm > 0 ? env.aishubLokaleDekkingKm : 0;
  const MAX_AISHUB_SCHEPEN =
    Number.isFinite(env.aishubMaxSchepen) && env.aishubMaxSchepen > 0 ? Math.floor(env.aishubMaxSchepen) : MAX_AISHUB_SCHEPEN_STANDAARD;
  log(`max ${MAX_AISHUB_SCHEPEN} schepen bewaren, gap-filter ${dekkingKm > 0 ? dekkingKm + 'km' : 'uit'}, box ${BOX_KM}km.`);
  const { latmin, latmax, lonmin, lonmax } = bounding(env.homeLat, env.homeLon);
  const url =
    `https://data.aishub.net/ws.php?username=${encodeURIComponent(env.aishubUsername)}` +
    `&format=1&output=json&compress=0&interval=30` +
    `&latmin=${latmin.toFixed(4)}&latmax=${latmax.toFixed(4)}&lonmin=${lonmin.toFixed(4)}&lonmax=${lonmax.toFixed(4)}`;

  let gestopt = false;
  let backoffMs = 0;
  let voorbeeldenGelogd = 0;
  let pollTimer = null;

  function log(bericht) {
    console.log(`[weer] vaarradarAishub: ${bericht}`);
  }

  function opschonen() {
    const nu = Date.now();
    for (const [mmsi, p] of posities) {
      if (nu - p.tijdMs > VENSTER_MS) posities.delete(mmsi);
    }
  }

  async function pollEenmaal() {
    try {
      const res = await fetch(url, { headers: { Connection: 'close' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (!Array.isArray(body) || body.length < 2) throw new Error('onherkenbaar antwoord (verwacht [status, schepen])');
      const [status, vaartuigen] = body;
      if (status?.ERROR) throw new Error(`AISHub meldt ERROR (${JSON.stringify(status).slice(0, 200)})`);
      if (!Array.isArray(vaartuigen)) throw new Error('tweede element is geen schepenlijst');

      if (voorbeeldenGelogd < 3 && vaartuigen.length) {
        voorbeeldenGelogd++;
        log(`voorbeeldrecord ${voorbeeldenGelogd}: ${JSON.stringify(vaartuigen[0]).slice(0, 400)}`);
      }

      let binnenDekking = 0;
      for (const v of vaartuigen) {
        const p = vertaalVaartuig(v);
        if (!p) continue;
        // Gap-filter (zie toelichting boven MAX_AISHUB_SCHEPEN): binnen het eigen
        // antennebereik hoort vaarradarLokaal.js dit schip te zien, dus AISHub's
        // (oudere) positie is daar alleen maar ruis. Staat standaard uit (0).
        if (dekkingKm > 0 && afstandKm(env.homeLat, env.homeLon, p.lat, p.lon) <= dekkingKm) {
          binnenDekking++;
          posities.delete(p.mmsi); // ook een eerder bewaarde positie van dit schip opruimen
          continue;
        }
        posities.set(p.mmsi, p);
      }
      opschonen();
      let afgekapt = 0;
      if (posities.size > MAX_AISHUB_SCHEPEN) {
        // Afstand eenmalig per schip berekenen i.p.v. twee keer per vergelijking in de sort.
        const metAfstand = [...posities.values()].map((p) => ({ p, d: afstandKm(env.homeLat, env.homeLon, p.lat, p.lon) }));
        metAfstand.sort((a, b) => a.d - b.d);
        afgekapt = metAfstand.length - MAX_AISHUB_SCHEPEN;
        for (const { p } of metAfstand.slice(MAX_AISHUB_SCHEPEN)) posities.delete(p.mmsi);
      }
      log(
        `${vaartuigen.length} schepen binnen` +
          (dekkingKm > 0 ? `, ${binnenDekking} binnen eigen dekking (${dekkingKm}km) weggelaten` : '') +
          (afgekapt ? `, ${afgekapt} verste afgekapt op MAX_AISHUB_SCHEPEN=${MAX_AISHUB_SCHEPEN}` : '') +
          `, ${posities.size} bewaard.`
      );
      if (backoffMs) log('AISHub weer bereikbaar.');
      backoffMs = 0;
    } catch (err) {
      backoffMs = backoffMs ? Math.min(backoffMs * 2, BACKOFF_MAX_MS) : BACKOFF_START_MS;
      log(`poll mislukt (${err.message ?? err}), volgende poging over ${Math.round((POLL_MS + backoffMs) / 1000)}s`);
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
