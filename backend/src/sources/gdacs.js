// GDACS — Global Disaster Alert and Coordination System. Vangnet-bron voor
// rampen die de specifieke bronnen niet dekken: overstromingen, natuurbranden,
// vulkanen, droogte, en cyclonen buiten het bekken dat NHC bedient.
// Docs: https://www.gdacs.org/gdacsapi/ — gratis, geen sleutel.
//
// Bewust: alleen alertlevel Orange/Red komt door. Green betekent bij GDACS
// per definitie "geen significante impact verwacht" en zou de meldingen
// vooral vervuilen — precies het probleem dat we bij aardbevingen al hadden.
import { makeSignal } from '../normalize.js';
import { verversMedia } from '../mediaHistorie.js';

const FEED_URL = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH';

const CATEGORIE_PER_TYPE = { EQ: 'aardbeving', TC: 'orkaan', FL: 'overstroming', WF: 'natuurbrand', VO: 'vulkaan', DR: 'droogte' };
// 2026-08-19: VO was 'Vulkaanuitbarsting' — een ander woord dan de
// categorienaam 'Vulkaan' (zie NAAM_PER_CATEGORIE in app.js), waardoor de
// titel ("Vulkaanuitbarsting Semeru") en de "+N meer (Vulkaan)"-knop eronder
// niet meer bij elkaar leken te horen. Nu exact gelijk aan de categorienaam.
const LABEL_PER_TYPE = { EQ: 'Aardbeving', TC: 'Cycloon', FL: 'Overstroming', WF: 'Natuurbrand', VO: 'Vulkaan', DR: 'Droogte' };
const ERNST_PER_ALERTLEVEL = { Red: 'kritiek', Orange: 'waarschuwing', Green: 'info' };
const ALERTLEVEL_NL = { Red: 'Rood', Orange: 'Oranje', Green: 'Groen' };

// 2026-08-19: Lex vroeg om een startdatum bij bijv. een natuurbrand — GDACS
// geeft die al mee als "fromdate" (werd al gebruikt als signal.tijd, maar
// nooit ook getoond) en meestal ook "todate". Niet live geverifieerd of
// todate bij elk type altijd aanwezig is, dus best-effort: ontbreekt 'ie, dan
// laten we dat deel van de tekst gewoon weg i.p.v. "vanaf ... tot onbekend".
function formatDatum(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// GDACS geeft "country" vaak als kommagescheiden lijst van álle getroffen
// landen terug (bij een grote cycloon kan dat zomaar 6+ landen zijn) — te
// lang en verwarrend om in een titel te proppen. Verkort tot maximaal 2
// namen + een telling; de volledige lijst blijft beschikbaar in detail.land.
function verkorteLandenlijst(land) {
  if (!land) return null;
  const landen = land.split(',').map((l) => l.trim()).filter(Boolean);
  if (landen.length <= 2) return landen.join(', ');
  return `${landen[0]} e.a. (${landen.length} landen)`;
}

// 2026-08-19: community-media (zie media.js), op verzoek van Lex ("voor
// elke categorie akkoord"). GDACS filtert al op Orange/Red, dus dit is een
// kleine, wereldwijd overzichtelijke lijst (geen aparte magnitude-drempel
// nodig zoals bij emsc.js).
// 2026-08-22-fix, op verzoek van Lex ("is media bij onweer wel zinvol?",
// bij navraag ook voor de andere bronnen nagelopen): was hier nog een
// simpele one-shot cache (precies één keer zoeken, op het moment dat een
// event voor het eerst Orange/Red wordt) — vervangen door mediaHistorie.js
// se verversMedia(). Juist bij GDACS zinvol: een Orange/Red-alert wordt vaak
// AL afgegeven vóórdat een ramp daadwerkelijk toeslaat (bv. een naderende
// cycloon), dus de eerste zoekopdracht komt structureel te vroeg voor nieuws/
// beeldmateriaal — en overstromingen/natuurbranden/vulkanen blijven hier
// (via de todate-check hierboven) vaak dagen tot weken zichtbaar, dus is er
// ruim gelegenheid om later alsnog iets te vinden.
async function communityMediaVoor(id, zoekterm, ontstaanIso) {
  if (!zoekterm) return [];
  return verversMedia({ id, zoekterm, ontstaanIso });
}

export async function fetchGdacs() {
  const res = await fetch(FEED_URL, { headers: { 'User-Agent': 'weer-app-persoonlijk (contact: lokaal project)' } });
  if (!res.ok) throw new Error(`GDACS feed gaf status ${res.status}`);
  const body = await res.json();

  const nu = Date.now();
  const relevanteFeatures = (body.features ?? [])
    .filter((f) => f.properties.alertlevel === 'Orange' || f.properties.alertlevel === 'Red')
    // 2026-08-19: Lex zag een bosbrand met "vanaf 22 jul - 1 aug" nog gewoon
    // als melding — een echte bug: er zat nooit een check op of het event al
    // voorbij is. GDACS blijft afgelopen events kennelijk een tijd in de feed
    // houden (alertlevel blijft Orange/Red), dus filteren we hier ook nog op
    // todate. Events zonder todate (nog lopend, geen einddatum bekend) blijven
    // gewoon door.
    .filter((f) => !f.properties.todate || new Date(f.properties.todate).getTime() >= nu);

  return Promise.all(
    relevanteFeatures.map(async (f) => {
      const p = f.properties;
      const [lon, lat] = f.geometry?.coordinates ?? [null, null];
      const type = p.eventtype;
      // Cyclonen en vulkanen krijgen bij GDACS een echte, herkenbare naam in
      // eventname ("MELISSA-25", "Semeru"). Bij droogte (en vermoedelijk ook
      // overstroming/natuurbrand) bleek `eventname` echter GEEN naam te zijn
      // maar gewoon een kommagescheiden landenlijst met jaartal erachter
      // (bijv. "Uganda, Kenya-2026") — dus alleen bij die twee types vertrouwen
      // we eventname, de rest gebruikt de landenlijst. 2026-08-19: het
      // streepje zelf hoort er altijd te staan, ook bij een echte naam — een
      // titel zonder streepje ("Vulkaanuitbarsting Semeru") oogde inconsistent
      // met de rest van de app.
      const heeftEchteNaam = (type === 'TC' || type === 'VO') && p.eventname;
      const naamOfLand = heeftEchteNaam ? p.eventname : (verkorteLandenlijst(p.country) ?? p.name ?? 'onbekend gebied');
      const titel = `${LABEL_PER_TYPE[type] ?? type} - ${naamOfLand}`;
      const samenvatting = p.severitydata?.severitytext ?? p.name ?? null;
      const vanafTot =
        p.fromdate && p.todate
          ? `vanaf ${formatDatum(p.fromdate)} – ${formatDatum(p.todate)}`
          : p.fromdate
            ? `vanaf ${formatDatum(p.fromdate)}`
            : null;
      // 2026-08-19: op verzoek van Lex ("Ik zie het nog niet overal") — deze
      // categorieën lieten in de meldingenlijst alleen "GDACS · X geleden"
      // zien i.p.v. iets zinvols, terwijl GDACS zelf al een alertlevel en een
      // severitytext-samenvatting meegeeft. subtitel hergebruikt exact
      // dezelfde velden die hierboven ook al in detail staan. vanafTot erbij
      // op Lex' verzoek ("is er ook een datum vanaf bij zo'n bosbrand?").
      const subtitel = [ALERTLEVEL_NL[p.alertlevel] ? `${ALERTLEVEL_NL[p.alertlevel]} niveau` : null, samenvatting, vanafTot]
        .filter(Boolean)
        .join(' · ') || null;
      const id = `gdacs-${type}-${p.eventid}-${p.episodeid ?? 0}`;
      return makeSignal({
        id,
        categorie: CATEGORIE_PER_TYPE[type] ?? 'multi-hazard',
        titel,
        ernst: ERNST_PER_ALERTLEVEL[p.alertlevel] ?? 'info',
        lat,
        lon,
        tijd: p.fromdate,
        detail: {
          naam: p.eventname ?? null,
          land: p.country ?? null,
          gdacsAlertlevel: p.alertlevel,
          samenvatting,
          communityMedia: await communityMediaVoor(id, naamOfLand, p.fromdate),
          subtitel,
          bronUrl: `https://www.gdacs.org/report.aspx?eventid=${p.eventid}&eventtype=${type}`,
        },
      });
    })
  );
}
