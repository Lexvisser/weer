// 2026-09-15, n.a.v. Lex' melding dat de scheepsfoto's "veel trager" kwamen
// sinds er een bron (GFW, 14 sept) bij was: live gemeten op de Minisforum dat
// zelfs /api/config 300-1100 ms deed en een WS-verbinding 11 s nodig had om
// open te gaan -- de event-loop werd elke seconde geblokkeerd door de
// vaarradar-tick (wsVaarradar.js), die per tick ALLE ~116.000 posities (GFW
// 65k + AISHub 51k + lokaal) opnieuw kopieerde, verrijkte en per client met
// JSON.stringify vergeleek. De bronnen wijzigen maar zelden (lokaal elke 3 s,
// AISHub elke 65 s, GFW elke 6 u), dus de samengevoegde set hoeft alleen
// opnieuw gebouwd te worden als een bron écht iets wijzigde. Daarvoor moet
// je kunnen zien DAT er iets wijzigde: deze Map telt elke set/delete/clear.
export class VersieMap extends Map {
  versie = 0;
  set(sleutel, waarde) {
    this.versie += 1;
    return super.set(sleutel, waarde);
  }
  delete(sleutel) {
    const weg = super.delete(sleutel);
    if (weg) this.versie += 1;
    return weg;
  }
  clear() {
    this.versie += 1;
    super.clear();
  }
}
