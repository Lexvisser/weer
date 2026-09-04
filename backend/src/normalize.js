// Gedeelde vorm voor elk signaal dat de aggregator naar de frontend stuurt,
// plus de betrouwbaarheidsindicator-logica uit het ontwerp: elke bron krijgt
// een tier + tijdstempel mee, en community-bronnen klappen om naar
// "haperend" als ze te lang niet zijn bijgewerkt (staleAfterMs).

/**
 * @typedef {Object} Signal
 * @property {string} id
 * @property {string} categorie
 * @property {string} titel
 * @property {'info'|'let-op'|'waarschuwing'|'kritiek'} ernst
 * @property {number|null} lat
 * @property {number|null} lon
 * @property {string} tijd            ISO-tijdstip van het onderliggende event
 * @property {Object} detail          vrije, bron-specifieke velden
 */

// Gedeelde haversine-afstand (km) — gebruikt door elke aardbevingsbron om
// "afstand tot jou" te tonen, zodat elke bron 'm niet los hoeft te herdefiniëren.
export function afstandKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function makeSignal(partial) {
  return {
    id: partial.id,
    categorie: partial.categorie,
    titel: partial.titel,
    ernst: partial.ernst ?? 'info',
    lat: partial.lat ?? null,
    lon: partial.lon ?? null,
    tijd: partial.tijd,
    detail: partial.detail ?? {},
  };
}

/**
 * Houdt de status van één bron bij: laatste succesvolle fetch, laatste fout,
 * en of de bron nu als "haperend" moet gelden.
 */
export class SourceState {
  constructor(sourceConfig) {
    this.config = sourceConfig;
    this.signals = [];
    this.lastSuccessAt = null;
    this.lastError = null;
  }

  markSuccess(signals) {
    this.signals = signals;
    this.lastSuccessAt = Date.now();
    this.lastError = null;
  }

  markError(err) {
    this.lastError = String(err?.message ?? err);
  }

  isStale() {
    if (this.config.staleAfterMs == null) return false; // n.v.t. voor lokale bronnen
    if (!this.lastSuccessAt) return true;
    return Date.now() - this.lastSuccessAt > this.config.staleAfterMs;
  }

  toStatus() {
    return {
      id: this.config.id,
      naam: this.config.naam,
      categorie: this.config.categorie,
      tier: this.config.tier,
      implemented: this.config.implemented,
      lastSuccessAt: this.lastSuccessAt,
      stale: this.isStale(),
      lastError: this.lastError,
      note: this.config.note ?? null,
    };
  }
}

// 2026-09-04, op verzoek van Lex ("navtex voor oranje met wind7 en vanaf
// wind8 + nood = rood"): ernst van een NAVTEX-/navwarning-bericht op basis
// van de inhoud, i.p.v. altijd 'waarschuwing'. Bepaalt de kleur op de kaart
// én of 'ie meetelt voor de Meldingen-badge (die telt vanaf 'waarschuwing').
//   - noodbericht (berichttype D, of MAYDAY/DISTRESS/SAR-tekst)   -> kritiek
//   - windkracht 8+ / GALE / STORM / HURRICANE FORCE                -> kritiek
//   - windkracht 7 / NEAR GALE / STRONG WIND (6-7)                  -> waarschuwing
//   - alle overige navigatiewaarschuwingen (boeien, kabels, rigs…)  -> let-op
export function navtexErnst(body, typeLetter = null) {
  const t = (body ?? '').toUpperCase();
  if (typeLetter === 'D' || /\b(MAYDAY|DISTRESS|MAN OVERBOARD|SEARCH AND RESCUE|\bSAR\b|PAN[ -]PAN|PIRACY|OVERDUE)\b/.test(t)) return 'kritiek';
  let maxForce = 0;
  // "FORCE 8", "FORCE 7 TO 8", "BFT 8", "BEAUFORT 8", "8 TO 9 BFT", "GALE 8"
  for (const m of t.matchAll(/\b(?:FORCE|BFT|BEAUFORT|GALE|STORM)\s*(\d{1,2})(?:\s*(?:TO|-|\/)\s*(\d{1,2}))?/g)) {
    maxForce = Math.max(maxForce, Number(m[1]), Number(m[2] ?? 0));
  }
  for (const m of t.matchAll(/\b(\d{1,2})(?:\s*(?:TO|-|\/)\s*(\d{1,2}))?\s*(?:BFT|BEAUFORT)\b/g)) {
    maxForce = Math.max(maxForce, Number(m[1]), Number(m[2] ?? 0));
  }
  // Windberichten schrijven de kracht vaak zonder "FORCE": "NORTHWEST 7
  // DECREASING 6", "SW 8 LATER" -- alleen tellen als het bericht duidelijk
  // over wind gaat (anders is "BUOY 7" of "7 PERSONS" ineens windkracht).
  if (/\b(WIND|GALE|STORM)\b/.test(t)) {
    for (const m of t.matchAll(/\b(?:NORTH|SOUTH|EAST|WEST|NORTHWEST|NORTHEAST|SOUTHWEST|SOUTHEAST|[NSEW]{1,3}|INCREASING|DECREASING|BECOMING|VEERING|BACKING|LATER|SOON)\s+(\d{1,2})\b/g)) {
      const n = Number(m[1]);
      if (n >= 5 && n <= 12) maxForce = Math.max(maxForce, n);
    }
  }
  if (maxForce >= 8 || /\b(GALE|STORM|HURRICANE)\s*(FORCE|WARNING)\b|\bSEVERE GALE\b|\bVIOLENT STORM\b/.test(t)) {
    // "NEAR GALE" is windkracht 7 -- alleen als er verder geen echte gale in zit
    if (maxForce < 8 && /\bNEAR GALE\b/.test(t) && !/\b(?<!NEAR )GALE\s*(FORCE|WARNING)\b/.test(t)) return 'waarschuwing';
    return 'kritiek';
  }
  if (maxForce === 7 || /\bNEAR GALE\b|\bSTRONG WIND\b/.test(t)) return 'waarschuwing';
  return 'let-op';
}
