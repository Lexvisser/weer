// vliegradar.js — live vliegtuigposities (ADS-B) rond een opgegeven punt,
// voor de "vliegradar"-kaartlaag. Op verzoek van Lex (2026-08-21): "kunnen
// we een laag flight- en vaarradar toevoegen?" Bewust GEEN hazard-signaal
// (dus niet via SOURCES/SourceState/makeSignal zoals de rest van sources/)
// — dit is een pure live-verkeerslaag op de kaart, vergelijkbaar met de
// OpenSeaMap-laag in Zee-modus, niet iets voor de Meldingen-lijst.
//
// Bron: api.adsb.lol — een gratis, sleutelloze community-ADS-B-aggregator
// (fork van dezelfde readsb/tar1090-stack als adsb.fi/airplanes.live/
// ADSBexchange). Uitdrukkelijk NIET OpenSky: die staat hier al voor
// Lifeliner (zie sources/lifeliner.js) en heeft daar al herhaaldelijk een
// dagquotum-probleem gegeven voor het volgen van ÉÉN heli (anoniem maar 400
// credits/dag) — alle vliegtuigen in een straal tonen zou dat budget in een
// paar uur opsouperen. adsb.lol heeft geen account/sleutel nodig.
//
// 2026-08-21-wissel: eerst geprobeerd met opendata.adsb.fi (identieke
// URL-vorm, /api/v2/point/{lat}/{lon}/{straalNm}) — die gaf bij Lex'
// live-test op zowel de Minisforum als zijn eigen PC steevast een lege
// "HTTP 400 Bad Request" terug (bevestigd met curl -sv, geen Cloudflare-
// challenge-pagina, gewoon een lege 400 — dus geen bot-blokkade maar iets
// dat het verzoek zelf afwijst, oorzaak nooit gevonden). Dezelfde exacte
// URL-vorm tegen api.adsb.lol werkte bij Lex in één keer foutloos (HTTP 200,
// 15 vliegtuigen, exact het hieronder verwachte veldformaat) — vandaar de
// wissel naar adsb.lol als bron, adsb.fi is niet verder onderzocht.
//
// EERLIJKE WAARSCHUWING (zelfde soort disclaimer als bij blitzortung.js):
// deze ontwikkelomgeving heeft geen uitgaande internettoegang naar adsb.lol
// (geverifieerd: elk verzoek naar buiten het toegestane lijstje domeinen
// wordt door de proxy geblokkeerd) — de wissel hierboven is dus gebaseerd op
// Lex' eigen live curl-test, niet op een test vanuit deze omgeving zelf. De
// veldnamen hieronder (hex/flight/r/t/alt_baro/gs/track/lat/lon) zijn
// bevestigd te kloppen aan de hand van die live-testrespons. Bij het eerste
// verzoek loggen we het eerste ruwe record alsnog naar de console ("[weer]
// vliegradar: voorbeeldrecord") zodat je bij twijfel op je eigen PC kunt
// blijven controleren of de velden kloppen. Zie je andere veldnamen? Dan
// moet vertaalRecord() hieronder bijgesteld worden.
import { afstandKm } from '../normalize.js';

// 2026-08-28, op melding van Lex ("met die vliegradar is het ook behelpen
// met de polls"): niet meer aan één community-bron hangen. adsb.lol blijft
// de eerste keus (live bevestigd werkend), maar airplanes.live staat er nu
// als vangnet achter — zelfde re-api/readsb-stack, zelfde /v2/point-URL-vorm
// en (aangenomen, zie de eerlijke waarschuwing bovenaan; het
// voorbeeldrecord-log bevestigt het live) hetzelfde ac[]-veldformaat. Elke
// bron heeft een EIGEN afkoelperiode: hapert adsb.lol, dan neemt
// airplanes.live het naadloos over i.p.v. dat de radar bevriest; pas als
// beide in de afkoelperiode zitten krijgt de app een foutmelding. Snelle
// controle vanaf de Minisforum:
//   curl -s https://api.airplanes.live/v2/point/52.09/5.12/50 | head -c 300
const BRONNEN = [
  { naam: 'adsb.lol', basis: 'https://api.adsb.lol/v2/point' },
  { naam: 'airplanes.live', basis: 'https://api.airplanes.live/v2/point' },
];
const MAX_STRAAL_NM = 250; // zelfde bovengrens als bij adsb.fi voor deze endpoint-vorm
// 2026-08-21: 8000 -> 3000, in lijn met RADAR_POLL_MS in frontend/app.js
// (Lex: "kan het nog sneller"). Blijft ruim onder adsb.lol's eigen limiet
// (community-aggregator, vergelijkbaar met de ~1 req/s die voor adsb.fi
// gedocumenteerd stond) — bij één gebruiker die elke 3s pollt is dat
// hooguit 0,33 verzoeken/s.
const CACHE_MS = 3000; // voorkomt herhaalde upstream-calls bij snel achter elkaar pollen/meerdere tabbladen
const CACHE_MAX = 200; // ruim genoeg voor een handvol verschillende locaties, voorkomt ongelimiteerde groei
const cache = new Map(); // "lat,lon,straal" (afgerond) -> { data, tijdMs }

let voorbeeldenGelogd = 0;

// 2026-08-21, op verzoek van Lex ("er verschijnen geen vliegtuigen" /
// "ik zie geen vliegtuigen stop met die aannames") — root cause via
// journalctl op de Minisforum gevonden (pas zichtbaar met `sudo`, zie die
// sessie): adsb.lol gaf op een gegeven moment `HTTP 429` terug (rate-limit,
// vermoedelijk door al het testen vandaag), en daarna faalde ELK volgend
// verzoek met `fetch failed`. Zonder eigen afkoelperiode bleef deze functie
// gewoon elke RADAR_POLL_MS (3s, zie frontend/app.js) een nieuw verzoek naar
// adsb.lol sturen terwijl die al blokkeerde — dat maakt een tijdelijke
// blokkade eerder erger/langer dan dat 'm de kans geeft te herstellen, en is
// sowieso onbeleefd tegenover een gratis, sleutelloze community-dienst.
// Simpele circuit-breaker: na een mislukt verzoek een oplopende
// afkoelperiode aanhouden (5s, 10s, 20s, 40s, max 60s) zonder adsb.lol
// opnieuw te bestoken — gewoon direct dezelfde foutmelding teruggeven aan
// de aanroeper (die geeft 'm door als 502, zie server.js). Bij een
// geslaagd verzoek meteen weer terug naar 0. Lost de EERSTE blokkade niet
// op (die moet gewoon vanzelf overwaaien bij adsb.lol), maar voorkomt dat
// wij 'm zelf verlengen.
const BACKOFF_START_MS = 5000;
const BACKOFF_MAX_MS = 60000;
// 2026-08-21: tijdelijk uitgezet geweest op Lex' verzoek om te testen of het
// herstel bij adsb.lol ECHT van deze rustpauzes afhangt — bevestigd: zónder
// backoff bleef het continu falen (live meegekeken via journalctl -f), MET
// backoff herstelde het eerder vanzelf binnen een paar minuten. Dus weer aan.
const BACKOFF_INGESCHAKELD = true;
// 2026-08-28: afkoelstaat per bron i.p.v. één globale — zie BRONNEN hierboven.
const backoffPerBron = new Map(); // naam -> { backoffMs, totMs }

function bronInAfkoeling(bron, nu) {
  const staat = backoffPerBron.get(bron.naam);
  return BACKOFF_INGESCHAKELD && staat && nu < staat.totMs;
}

function noteerBronFout(bron) {
  const staat = backoffPerBron.get(bron.naam) ?? { backoffMs: 0, totMs: 0 };
  staat.backoffMs = staat.backoffMs ? Math.min(staat.backoffMs * 2, BACKOFF_MAX_MS) : BACKOFF_START_MS;
  staat.totMs = Date.now() + staat.backoffMs;
  backoffPerBron.set(bron.naam, staat);
}

function kmNaarNm(km) {
  return km * 0.539957;
}

function vertaalRecord(ac, lat, lon) {
  if (typeof ac?.lat !== 'number' || typeof ac?.lon !== 'number') return null;
  return {
    icao: ac.hex ?? null,
    callsign: typeof ac.flight === 'string' ? ac.flight.trim() || null : null,
    registratie: ac.r ?? null,
    type: ac.t ?? null,
    lat: ac.lat,
    lon: ac.lon,
    altitudeFt: typeof ac.alt_baro === 'number' ? ac.alt_baro : null,
    grond: ac.alt_baro === 'ground',
    snelheidKnts: typeof ac.gs === 'number' ? ac.gs : null,
    koersGraden: typeof ac.track === 'number' ? ac.track : null,
    afstandKm: Math.round(afstandKm(lat, lon, ac.lat, ac.lon) * 10) / 10,
  };
}

export async function fetchVliegradar({ lat, lon, straalKm }) {
  const sleutel = `${lat.toFixed(2)},${lon.toFixed(2)},${straalKm}`;
  const bestaand = cache.get(sleutel);
  const nu = Date.now();
  if (bestaand && nu - bestaand.tijdMs < CACHE_MS) return bestaand.data;

  const straalNm = Math.min(MAX_STRAAL_NM, Math.max(1, Math.round(kmNaarNm(straalKm))));
  // 2026-08-21-fix, op verzoek van Lex ("raar voor een 429 probleem toch?" —
  // terecht: het faalde steevast na 3-4 verzoeken, ook na minuten wachten
  // tussen losse testrondes, wat niet past bij een echte externe rate-limit
  // die met tijd zou moeten resetten). In de logs stond vlak vóór de reeks
  // "fetch failed" één "This operation was aborted" — dat was onze eigen
  // AbortController die na 10s het verzoek HARD afbrak. Een hard afgebroken
  // fetch kan in Node/undici de onderliggende (keep-alive) TCP-verbinding in
  // een kapotte staat achterlaten; bij hergebruik van diezelfde pool falen
  // daarna alle volgende verzoeken naar hetzelfde adres meteen — een bug die
  // precies na een klein vast aantal verzoeken toeslaat en niet met wachten
  // "afkoelt", ongeacht wat adsb.lol zelf doet. Fix: niet meer forceren met
  // AbortController.abort() (dat is wat de verbinding beschadigt) — in
  // plaats daarvan gewoon stoppen met WACHTEN na 10s via Promise.race, en
  // het onderliggende verzoek desnoods op de achtergrond gewoon netjes laten
  // uitlopen/falen i.p.v. het abrupt te kappen. Plus Connection: close zodat
  // de verbinding sowieso niet hergebruikt wordt.
  // 2026-08-28: bronnen op volgorde proberen — de eerste die niet in zijn
  // afkoelperiode zit én een goed antwoord geeft, wint. Fouten zetten alleen
  // de afkoelperiode van DIE bron; de volgende bron krijgt meteen de kans.
  const fouten = [];
  for (const bron of BRONNEN) {
    if (bronInAfkoeling(bron, nu)) {
      const staat = backoffPerBron.get(bron.naam);
      fouten.push(`${bron.naam}: afkoelperiode, nog ${Math.ceil((staat.totMs - nu) / 1000)}s`);
      continue;
    }
    const fetchPromise = fetch(`${bron.basis}/${lat}/${lon}/${straalNm}`, {
      headers: {
        'User-Agent': 'WeerApp/1.0 (persoonlijk zelfgehost hobbyproject, geen commercieel gebruik)',
        Connection: 'close',
      },
    });
    // Als dit verzoek de race hieronder verliest (timeout), loopt het op de
    // achtergrond gewoon door totdat het zelf afrondt — en als het dán alsnog
    // faalt, moet die afwijzing ergens "opgevangen" worden, anders ziet Node
    // dat als een onafgehandelde promise-rejection (kan het hele proces laten
    // crashen). Dit vangt 'm stil af; de ECHTE foutafhandeling/backoff
    // hieronder loopt gewoon via de timeoutPromise-tak van de race.
    fetchPromise.catch(() => {});
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${bron.naam} antwoordde niet binnen 10s`)), 10000);
    });
    try {
      const res = await Promise.race([fetchPromise, timeoutPromise]);
      if (!res.ok) throw new Error(`${bron.naam} gaf HTTP ${res.status}`);
      const body = await res.json();
      const ruwLijst = Array.isArray(body?.ac) ? body.ac : [];

      if (voorbeeldenGelogd < 3 && ruwLijst.length) {
        voorbeeldenGelogd++;
        console.log(`[weer] vliegradar: voorbeeldrecord ${voorbeeldenGelogd} (${bron.naam}): ${JSON.stringify(ruwLijst[0]).slice(0, 300)}`);
      }

      const vliegtuigen = ruwLijst
        .map((ac) => vertaalRecord(ac, lat, lon))
        .filter(Boolean)
        .filter((v) => v.afstandKm <= straalKm);

      const data = { bijgewerkt: new Date().toISOString(), vliegtuigen, bron: bron.naam };

      if (cache.size >= CACHE_MAX) {
        const oudsteSleutel = cache.keys().next().value; // Map bewaart invoegvolgorde — oudste eerst
        cache.delete(oudsteSleutel);
      }
      cache.set(sleutel, { data, tijdMs: nu });
      backoffPerBron.delete(bron.naam); // succes — afkoelperiode meteen weer resetten
      return data;
    } catch (err) {
      noteerBronFout(bron);
      fouten.push(`${bron.naam}: ${err.message ?? err}`);
      // door naar de volgende bron
    }
  }
  throw new Error(`alle vliegradar-bronnen falen — ${fouten.join(' | ')}`);
}
