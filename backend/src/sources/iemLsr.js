// Iowa Environmental Mesonet — Local Storm Reports (LSR), doorgefilterd op
// TORNADO. Dit zijn geen voorspellingen zoals een Warning/Watch, maar
// daadwerkelijk gemelde/bevestigde tornado's op de grond — spiegelt de
// officiële NWS-LSR-feed. Gratis, geen sleutel.
// https://mesonet.agron.iastate.edu/geojson/lsr.py?help=
//
// Altijd ernst "kritiek": een bevestigde tornado op de grond is per definitie
// het meest urgente wat deze app kan tonen, dringender nog dan een Warning
// (die is een voorspelling, dit is een waarneming).
import { makeSignal } from '../normalize.js';
import { verversMedia } from '../mediaHistorie.js';
import { metHistorie } from '../historie.js';

const VENSTER_MS = 3 * 60 * 60 * 1000; // alleen recente (laatste 3 uur) meldingen — "actuele signalering"

function isoZonderMillis(ms) {
  return new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');
}

// 2026-08-19: community-media (zie media.js), op verzoek van Lex ("voor
// elke categorie akkoord") — bij een bevestigde tornado op de grond is dit
// juist een categorie waar mensen vaak zelf foto's/video's van maken en
// delen, dus verwacht meer treffers dan bij een abstracte "watch".
// 2026-08-22-fix, op verzoek van Lex ("is media bij onweer wel zinvol?", bij
// navraag ook voor de andere bronnen nagelopen): dit was hier nog een simpele
// one-shot cache (media.js precies één keer bevragen, op het moment dat een
// LSR voor het eerst gezien wordt) — vervangen door mediaHistorie.js se
// verversMedia() (periodiek herhaald zoeken, zelfde reden als bij nws.js).
// Minstens zo belangrijk: VENSTER_MS hierboven is maar 3 uur — de onderliggende
// feedquery zelf (sts/ets) laat een bevestigde tornado dus na 3 uur helemaal
// uit de live-lijst vallen, zonder enige historie-opslag. Dat is precies het
// euvel dat Lex bij onweer signaleerde ("de bui is al weg voordat er iets
// wordt gepost en we hebben geen historie") — hier dus ook opgelost met
// metHistorie() hieronder (48 uur, zelfde patroon als nws.js), zodat een
// bevestigde tornado niet na 3 uur spoorloos verdwijnt en er alsnog tijd is
// voor nieuws-/stormchaser-materiaal om te verschijnen.
//
// Zoekterm: was hier nog kaal "gebied" (bv. "Putnam, IL") — te generiek, zie
// dezelfde les in nws.js ("Putnam" alleen levert vooral ruis op). Nu met
// "tornado"-voorvoegsel, zelfde aanpak als nws.js' EVENT_PER_CATEGORIE.
async function communityMediaVoor(id, zoekterm, ontstaanIso) {
  if (!zoekterm) return [];
  return verversMedia({ id, zoekterm, ontstaanIso });
}

export async function fetchIemLsr() {
  const nu = Date.now();
  const params = new URLSearchParams({
    sts: isoZonderMillis(nu - VENSTER_MS),
    ets: isoZonderMillis(nu),
    wfo: 'ALL',
  });
  const res = await fetch(`https://mesonet.agron.iastate.edu/geojson/lsr.py?${params}`);
  if (!res.ok) throw new Error(`IEM LSR gaf status ${res.status}`);
  const body = await res.json();

  const signalen = await Promise.all(
    (body.features ?? [])
      .filter((f) => (f.properties?.typetext ?? '').toUpperCase() === 'TORNADO')
      .map(async (f) => {
        const p = f.properties;
        const [lon, lat] = f.geometry?.coordinates ?? [null, null];
        const gebied = [p.city, p.county ? `${p.county} County` : null, p.state].filter(Boolean).join(', ');
        const id = `iem-lsr-${p.product_id ?? `${p.valid}-${lat}-${lon}`}`;
        const zoekterm = gebied ? `tornado ${gebied}` : null;
        return makeSignal({
          id,
          categorie: 'tornado-bevestigd',
          titel: `Tornado bevestigd - ${gebied || 'onbekende locatie (VS)'}`,
          ernst: 'kritiek',
          lat,
          lon,
          tijd: p.valid,
          detail: {
            gebied: gebied || null,
            omschrijving: p.remark ?? null,
            bronUrl: 'https://mesonet.agron.iastate.edu/lsr/',
            communityMedia: await communityMediaVoor(id, zoekterm, p.valid),
          },
        });
      })
  );

  // 2026-08-22: historie (zie historie.js) — zie de comment bij
  // communityMediaVoor hierboven: zonder dit viel een bevestigde tornado na
  // VENSTER_MS (3 uur) spoorloos uit de feed, ook op de kaart. Zelfde 48-uurs
  // patroon als nws.js.
  const totaal = metHistorie('iemLsr', signalen);

  // 2026-08-22: verlopen signalen (ouder dan 3 uur, niet meer in de live
  // feedquery) hebben hierboven geen nieuwe verversMedia()-aanroep gehad —
  // zonder deze aparte pas zou een tornado die inmiddels "verlopen" is nooit
  // meer nieuw materiaal krijgen, exact hetzelfde gat als bij nws.js
  // opgelost (het beste materiaal verschijnt vaak pas uren later). Bewust ná
  // metHistorie() i.p.v. hier zelf een aparte cache bij te houden —
  // mediaHistorie.js is de enige plek die weet wát/wanneer er laatst gezocht
  // is.
  await Promise.all(
    totaal
      .filter((s) => s.detail?.verlopen)
      .map(async (s) => {
        const gebied = s.detail?.gebied;
        const zoekterm = gebied ? `tornado ${gebied}` : null;
        s.detail.communityMedia = await verversMedia({ id: s.id, zoekterm, ontstaanIso: s.tijd });
      })
  );

  return totaal;
}
