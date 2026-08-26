// historie.js — houdt recent-verlopen signalen nog even vast (48 uur) zodat
// je op de kaart kunt zien waar een waarschuwing was, ook nadat de bron 'm
// niet meer als actief teruggeeft. Op verzoek van Lex, 2026-08-20 ("die
// historie is handig om te hebben zodat je kan zien waar je was") — geïnspi-
// reerd door tornadopath.com's "historical expired warnings (past 48h)".
//
// Generiek en herbruikbaar per bron: elke bron roept metHistorie(sleutel,
// huidigeSignalen) aan met een eigen unieke sleutel (voorkomt dat twee
// bronnen elkaars cache overschrijven zouden kunnen, ook al is dat nu nog
// niet aan de orde) en krijgt de huidige signalen terug MET de nog niet
// verjaarde, inmiddels-verdwenen signalen erbij — die laatste gemarkeerd met
// detail.verlopen = true en detail.verlopenSinds. De frontend gebruikt die
// vlag om ze gedimd op de kaart te tonen en uit de Meldingen-lijst te
// filteren (zie renderMeldingen()/renderMap() in app.js) — dit bestand weet
// zelf niets van rendering, puur databeheer.
//
// 2026-08-20, op verzoek van Lex ("als het niet te zwaar wordt") — nu ook
// naar schijf geschreven (data/historie.json), na eerder een paar keer
// verward te zijn dat een net-verlopen Severe Thunderstorm Warning al weg
// was: elke syncweer-deploy herstart de service, en tot nu toe leefde deze
// cache puur in het geheugen, dus dat wiste 'm telkens. Schrijffrequentie =
// pollfrequentie van de enige bron die dit nu gebruikt (nws.js, 2 minuten) —
// verwaarloosbaar voor zo'n klein bestand. Bewust fire-and-forget en overal
// try/catch: een mislukte schrijf of een corrupt/ontbrekend bestand bij
// opstarten mag deze puur-informatieve "waar was het"-laag nooit laten
// crashen — dan gewoon met een lege cache verder, net als voorheen.
import { readFileSync, mkdirSync, existsSync, writeFile } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HISTORIE_BESTAND = join(__dirname, '..', 'data', 'historie.json');

const VENSTER_MS = 48 * 60 * 60 * 1000;

const caches = new Map(); // sleutel -> Map<signaal-id, { signaal, laatstGezien }>

try {
  mkdirSync(dirname(HISTORIE_BESTAND), { recursive: true });
  if (existsSync(HISTORIE_BESTAND)) {
    const ruw = JSON.parse(readFileSync(HISTORIE_BESTAND, 'utf-8'));
    const nu = Date.now();
    let aantalIngeladen = 0;
    for (const [sleutel, entries] of Object.entries(ruw)) {
      const cache = new Map();
      for (const { id, signaal, laatstGezien } of entries) {
        // Wat al buiten het venster valt (bv. na een lange downtime) meteen
        // overslaan i.p.v. pas bij de eerstvolgende metHistorie()-call op te
        // ruimen.
        if (nu - laatstGezien > VENSTER_MS) continue;
        cache.set(id, { signaal, laatstGezien });
        aantalIngeladen += 1;
      }
      caches.set(sleutel, cache);
    }
    console.log(`[weer] historie: ${aantalIngeladen} signa(a)l(en) teruggeladen van schijf (overleeft nu een herstart/deploy).`);
  }
} catch (err) {
  console.error('[weer] historie: eerdere historie inladen mislukt, start met lege cache —', err.message ?? err);
}

function schrijfNaarSchijf() {
  const data = {};
  for (const [sleutel, cache] of caches) {
    data[sleutel] = [...cache].map(([id, entry]) => ({ id, signaal: entry.signaal, laatstGezien: entry.laatstGezien }));
  }
  writeFile(HISTORIE_BESTAND, JSON.stringify(data), (err) => {
    if (err) console.error('[weer] historie: wegschrijven naar schijf mislukt, blijft wel gewoon in het geheugen werken —', err.message ?? err);
  });
}

export function metHistorie(sleutel, huidigeSignalen) {
  if (!caches.has(sleutel)) caches.set(sleutel, new Map());
  const cache = caches.get(sleutel);
  const nu = Date.now();
  const huidigeIds = new Set(huidigeSignalen.map((s) => s.id));

  // Alles wat nu (nog) actief binnenkomt: cache verversen, blijft "live".
  huidigeSignalen.forEach((s) => cache.set(s.id, { signaal: s, laatstGezien: nu }));

  // Alles wat nog in de cache staat maar niet meer in de live-lijst
  // voorkomt: ofwel net verlopen (nog binnen het venster — dan als
  // "verlopen" meesturen) ofwel te oud (dan definitief opruimen).
  const verlopen = [];
  for (const [id, entry] of cache) {
    if (huidigeIds.has(id)) continue;
    if (nu - entry.laatstGezien > VENSTER_MS) {
      cache.delete(id);
      continue;
    }
    verlopen.push({
      ...entry.signaal,
      detail: { ...entry.signaal.detail, verlopen: true, verlopenSinds: new Date(entry.laatstGezien).toISOString() },
    });
  }
  schrijfNaarSchijf();
  return [...huidigeSignalen, ...verlopen];
}
