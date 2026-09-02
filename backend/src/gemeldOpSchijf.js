// gemeldOpSchijf.js — dedup-geheugen voor alarmkanalen (email.js, pushover.js)
// dat een herstart overleeft.
//
// 2026-09-02, op melding van Lex (Tornado Watch-mails "van het laatste half
// uur"): de dedup-Set in email.js/pushover.js leefde alleen in het geheugen
// van de lopende server. Elke sync (= herstart) begon dus met een lege lijst,
// en dezelfde nog actieve Tornado Watch ging bij ELKE herstart opnieuw de
// mail in — in de journal: 3 mails per herstart, zes herstarts op een
// avond = 18 mails voor één watch. Nu: id -> tijdstip in een JSON-bestand in
// backend/data/ (staat in .gitignore, net als de verlopen-historie en de
// AISHub-snapshot), bij het opstarten ingelezen, na elke wijziging
// weggeschreven (atomair via tmp + rename). Oude ids (> BEWAAR_MS) worden
// opgeruimd, zodat het bestand niet eindeloos groeit; een alarm dat langer
// dan dat actief blijft, mag dan ook gerust nog eens gemeld worden.
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const BEWAAR_MS = 72 * 3600e3;

export function maakGemeldOpSchijf(naam) {
  const pad = join(DATA_DIR, `${naam}-gemeld.json`);
  const gemeld = new Map(); // id -> tijdstip (ms)

  function opschonen() {
    const grens = Date.now() - BEWAAR_MS;
    for (const [id, t] of gemeld) if (t < grens) gemeld.delete(id);
  }

  function bewaar() {
    try {
      mkdirSync(DATA_DIR, { recursive: true });
      const tmp = `${pad}.tmp`;
      writeFileSync(tmp, JSON.stringify([...gemeld]));
      renameSync(tmp, pad);
    } catch (err) {
      console.error(`[weer] ${naam}: gemeld-lijst bewaren mislukt,`, err.message ?? err);
    }
  }

  try {
    if (existsSync(pad)) {
      for (const [id, t] of JSON.parse(readFileSync(pad, 'utf-8'))) {
        if (typeof id === 'string' && Number.isFinite(t)) gemeld.set(id, t);
      }
      opschonen();
      console.log(`[weer] ${naam}: gemeld-lijst geladen (${gemeld.size} ids, overleeft herstarts).`);
    }
  } catch (err) {
    console.error(`[weer] ${naam}: gemeld-lijst laden mislukt, begin leeg —`, err.message ?? err);
  }

  return {
    has: (id) => gemeld.has(id),
    add: (id) => {
      gemeld.set(id, Date.now());
      opschonen();
      bewaar();
    },
    delete: (id) => {
      if (gemeld.delete(id)) bewaar();
    },
  };
}
