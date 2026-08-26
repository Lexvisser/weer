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
