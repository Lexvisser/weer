// scheepsfoto.js — scheepsfoto opzoeken bij een MMSI, voor de vaartlaag.
// 2026-09-01, op verzoek van Lex ("ik zag wel eens dat de schepen met AIS
// ook een fotootje hadden in zo'n app, hoe werkt dat?" -> "ja leuk!") na
// uitleg dat zulke foto's NIET uit het AIS-signaal zelf komen (dat bevat
// geen beeld) maar uit een losse, crowd-sourced fotodatabase die apps als
// MarineTraffic/VesselFinder zelf raadplegen op MMSI/IMO.
//
// EXPLICIETE KEUZE MET LEX: de "ongeautoriseerde publieke foto-URL"-route
// i.p.v. een officiele (betaalde) API -- gratis, maar NIET ondersteund: kan
// zonder waarschuwing stoppen, en is tegen de voorwaarden van de site. Prima
// voor een hobbyproject (zelfde afweging als eerder bij dit project), niet
// iets om op te bouwen alsof het een gegarandeerde dienst is. Faalt dit ooit
// structureel, dan toont de kaart gewoon geen foto (zie fallback hieronder)
// -- geen harde afhankelijkheid.
//
// MECHANISME (uitgezocht via de browser, 2026-09-01):
// VesselFinder's scheepspagina is direct opvraagbaar op MMSI:
//   https://www.vesselfinder.com/vessels/details/<mmsi>
// Die pagina bevat (in de server-gerenderde HTML, dus GEEN headless browser
// nodig) een <img> met een directe, stabiele fotolink:
//   https://static.vesselfinder.net/ship-photo/<imo>-<mmsi>-<hash>/1?v1
// Die laatste URL is zelf gewoon hotlinkbaar (geen referer-check, live
// getest) -- dus we hoeven 'm alleen te scrapen uit de scheepspagina, niet
// zelf te downloaden/door te sturen. Schepen zonder foto in die database
// hebben simpelweg geen match voor dit patroon -> null, geen fout.
//
// BEWUST ON-DEMAND, NIET MEEGEPOLLED MET vaarradarLokaal.js: die ververst
// elke 3s en kan tientallen schepen tegelijk tonen (zie VENSTER_MS daar) --
// een foto-lookup per schip per pollronde zou VesselFinder binnen no time
// platbombarderen en gegarandeerd een blokkade opleveren. In plaats daarvan
// een eigen /api/scheepsfoto-route (zie server.js) die de FRONTEND pas
// aanroept zodra Lex een scheepspopup daadwerkelijk OPENT -- dus hooguit een
// opzoeking per klik, niet een per schip per 3 seconden.
//
// Cache: simpele in-memory Map, geen bestand (zelfde soort keuze als de
// posities in vaarradarLokaal.js) -- foto's veranderen zelden, en een lege
// cache na een herstart is geen probleem (gewoon opnieuw opzoeken bij de
// eerstvolgende klik). Negatieve resultaten (geen foto gevonden) worden
// KORTER gecached dan gevonden foto's, voor het geval een schip later alsnog
// een foto krijgt in de bron-database.

// 2026-09-14, op verzoek van Lex ("Ja prima idee!"): de cache hieronder stond
// alleen in het geheugen, dus elke herstart (en dus elke `syncweer`) begon
// weer blanco -- en dan moet elk aangeklikt schip opnieuw opgezocht worden,
// precies wanneer de bron traag is. Nu ook op schijf, zelfde soort
// runtime-bestand als de zeemarkeringen (backend/data/, buiten git).
import { readFileSync, mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_BESTAND = join(__dirname, '..', '..', 'data', 'scheepsfotos.json');
const OPSLAG_VERTRAGING_MS = 30 * 1000; // niet bij elke klik schrijven; hooguit 1x per 30s

const FOTO_CACHE_MS = 7 * 24 * 60 * 60 * 1000; // gevonden foto: 7 dagen
const GEEN_FOTO_CACHE_MS = 6 * 60 * 60 * 1000; // pagina geladen maar geen foto: 6 uur, dan nog eens proberen
// 2026-09-14, op melding van Lex ("ik zie ook nog geen foto's"): een MISLUKTE
// poging (time-out, blokkade, netwerkfout) was hiervoor niet te onderscheiden
// van "dit schip heeft geen foto" -- allebei null, allebei 6 uur vastgehouden.
// Eén hapering betekende dus een halve dag geen foto voor dat schip. Bewezen
// geval: ALREK (304944000) gaf 's middags een echte foto-URL en een halfuur
// later null, terwijl de bron gewoon werkte (THE QUEEN JACQUELINE kwam op
// datzelfde moment wél door). Mislukkingen worden nu kort onthouden en
// gelogd, zodat ze vanzelf herstellen en zichtbaar zijn in het journaal.
const MISLUKT_CACHE_MS = 60 * 1000; // time-out/blokkade: 1 minuut, daarna opnieuw proberen
const FETCH_TIMEOUT_MS = 10000; // was 6s; VesselFinder is regelmatig net trager dan dat
// Harde bovengrens op de HELE opzoeking, los van de fetch-timeout hierboven.
// 2026-09-14 gemeten: een opzoeking die 31 seconden later nog steeds niets had
// teruggegeven, terwijl de fetch-afbreker op 10s staat -- de afbreker pakt het
// dus niet in alle gevallen (een pagina die wel begint maar niet doorkomt).
// /api/scheepsfoto wacht op deze belofte, dus zonder deze grens hangt het
// verzoek van de browser mee. Liever "geen foto" dan een kaartje dat blijft
// wachten; door de mislukt-markering wordt het een minuut later toch weer
// geprobeerd.
const HARDE_GRENS_MS = 13000;

const cache = new Map(); // mmsi -> { url: string|null, tijdMs: number }
const inVlucht = new Map(); // mmsi -> Promise<string|null>, dedupliceert gelijktijdige klikken op hetzelfde schip

function nogGeldig(entry) {
  if (!entry) return false;
  const maxLeeftijdMs = entry.url ? FOTO_CACHE_MS : (entry.mislukt ? MISLUKT_CACHE_MS : GEEN_FOTO_CACHE_MS);
  return Date.now() - entry.tijdMs < maxLeeftijdMs;
}

// ---- schijf ----------------------------------------------------------------
let geladenVanSchijf = false;

function laadVanSchijf() {
  if (geladenVanSchijf) return;
  geladenVanSchijf = true;
  try {
    const ruw = JSON.parse(readFileSync(CACHE_BESTAND, 'utf-8'));
    let overgenomen = 0;
    let verlopen = 0;
    for (const [mmsi, entry] of Object.entries(ruw.fotos ?? {})) {
      if (!entry || typeof entry.tijdMs !== 'number') continue;
      if (!nogGeldig(entry)) { verlopen += 1; continue; } // verlopen: niet overnemen
      cache.set(mmsi, entry);
      overgenomen += 1;
    }
    console.log(`[weer] scheepsfoto: ${overgenomen} foto's uit de opslag geladen${verlopen ? ` (${verlopen} verlopen)` : ''}`);
  } catch {
    /* geen bestand (eerste start) of onleesbaar -- gewoon leeg beginnen */
  }
}

let opslaanTimer = null;

// Uitgesteld wegschrijven: een druk klikmoment levert zo één schrijfactie op
// i.p.v. tientallen. Mislukte opzoekingen gaan bewust NIET mee -- die leven
// maar een minuut, en een time-out van gisteren zegt niets over vandaag.
function planOpslaan() {
  if (opslaanTimer) return;
  opslaanTimer = setTimeout(async () => {
    opslaanTimer = null;
    try {
      const fotos = {};
      for (const [mmsi, entry] of cache) {
        if (entry.mislukt || !nogGeldig(entry)) continue; // meteen opschonen
        fotos[mmsi] = entry;
      }
      mkdirSync(dirname(CACHE_BESTAND), { recursive: true });
      await writeFile(CACHE_BESTAND, JSON.stringify({ bijgewerkt: new Date().toISOString(), fotos }));
    } catch (err) {
      console.warn(`[weer] scheepsfoto: opslaan mislukt: ${err?.message ?? err}`);
    }
  }, OPSLAG_VERTRAGING_MS);
  opslaanTimer.unref?.(); // mag het afsluiten van de dienst niet tegenhouden
}

async function zoekFotoOp(mmsi) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`https://www.vesselfinder.com/vessels/details/${mmsi}`, {
      headers: {
        // Zonder een browser-achtige User-Agent gaf een losse test soms een
        // afwijkende (lichtere/blokkerende) pagina terug -- dit is puur om
        // een gewone paginabezoeker na te bootsen, geen poging om iets te
        // omzeilen wat de site niet al publiek toont aan elke bezoeker.
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      },
      signal: controller.signal,
    });
    if (!res.ok) return { fout: `status ${res.status}` };
    const html = await res.text();
    const match = html.match(/https:\/\/static\.vesselfinder\.net\/ship-photo\/[^"'\s\\]+/);
    return { url: match ? match[0] : null }; // pagina geladen: match of niet, allebei een echt antwoord
  } catch (err) {
    // Netwerkfout, time-out of onbereikbaar: GEEN echt antwoord. Zie de
    // toelichting bij MISLUKT_CACHE_MS hierboven.
    return { fout: err?.name === 'AbortError' ? `time-out na ${FETCH_TIMEOUT_MS} ms` : (err?.message ?? String(err)) };
  } finally {
    clearTimeout(timeout);
  }
}

// Geeft de fotoURL terug (of null als er geen bekend is), met cache/dedupe.
export async function haalScheepsfotoOp(mmsiRuw) {
  const mmsi = String(mmsiRuw ?? '').trim();
  if (!/^\d{5,9}$/.test(mmsi)) return null; // geen geldig MMSI-patroon, niet eens proberen
  laadVanSchijf();

  const bestaand = cache.get(mmsi);
  if (nogGeldig(bestaand)) return bestaand.url;

  if (inVlucht.has(mmsi)) return inVlucht.get(mmsi);

  const metGrens = Promise.race([
    zoekFotoOp(mmsi),
    new Promise((klaar) => setTimeout(() => klaar({ fout: `geen antwoord binnen ${HARDE_GRENS_MS} ms` }), HARDE_GRENS_MS)),
  ]);
  const belofte = metGrens.then((resultaat) => {
    if (resultaat.fout) {
      console.warn(`[weer] scheepsfoto ${mmsi} mislukt: ${resultaat.fout}`);
      cache.set(mmsi, { url: null, tijdMs: Date.now(), mislukt: true });
    } else {
      cache.set(mmsi, { url: resultaat.url, tijdMs: Date.now() });
      planOpslaan(); // ook "geen foto" bewaren: dat scheelt herhaald opzoeken
    }
    inVlucht.delete(mmsi);
    return resultaat.url ?? null;
  }).catch((err) => {
    // Vangnet: zonder dit zou een onverwachte fout een afgewezen belofte in
    // inVlucht achterlaten, en dan krijgt elke volgende klik op dat schip die
    // afwijzing terug in plaats van een nieuwe poging.
    console.warn(`[weer] scheepsfoto ${mmsi} onverwachte fout: ${err?.message ?? err}`);
    cache.set(mmsi, { url: null, tijdMs: Date.now(), mislukt: true });
    inVlucht.delete(mmsi);
    return null;
  });
  inVlucht.set(mmsi, belofte);
  return belofte;
}
