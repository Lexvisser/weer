// PTWC — Pacific Tsunami Warning Center (NOAA/NWS, Honolulu), via de
// publieke Atom-feed op tsunami.gov. Aanleiding (2026-08-27): Lex — "Ik heb
// tsunami alarmen alleen voor de US. Ik zou dat globaal willen." De
// bestaande tsunami-categorieën kwamen uitsluitend uit nws.js
// (api.weather.gov, VS-only mandaat). PTWC is het officiële waarschuwings-
// centrum voor het HELE Stille-Oceaanbekken (internationaal, incl. Hawaï/
// Guam/Samoa) — waar het overgrote deel van alle tsunami's ontstaat. Voor
// de rest van de wereld (Indische Oceaan, Middellandse Zee, Atlantisch) is
// er geen vergelijkbare vrije, gecentraliseerde feed van de regionale
// centra (BMKG, INCOIS, etc.) — dat gat wordt gedeeltelijk gedicht door
// GDACS' TS-eventtype (zie gdacs.js, sinds vandaag meegenomen) als
// model-gebaseerd wereldwijd vangnet.
//
// Feed: https://www.tsunami.gov/events/xml/PHEBAtom.xml — gratis, geen
// sleutel, klein bestand (bevat het meest recente bulletin; 1 entry per
// getroffen gebied). De NTWC-zusterfeed (PAAQAtom.xml, VS/Canada) is bewust
// NIET toegevoegd: de VS-kust komt al met polygon-detail binnen via nws.js,
// en dubbele bronnen voor hetzelfde gebied geven dubbele meldingen.
//
// EERLIJKE WAARSCHUWING (zelfde stijl als eerdere nieuwe bronnen): de feed
// is alleen live gezien met een "TSUNAMI INFORMATION STATEMENT" (Scotia
// Sea, M6.7, 2026-08-22). Welke exacte producttitels PTWC voor de zwaardere
// niveaus gebruikt ("TSUNAMI THREAT MESSAGE" voor internationaal,
// "TSUNAMI WARNING"/"ADVISORY"/"WATCH" voor VS-gebieden) is uit de
// documentatie afgeleid, niet tegen een echt lopend event bevestigd — de
// classificatie hieronder matcht daarom ruim (op losse woorden, in feed- én
// entry-titel) en logt onherkende producttypes naar de console i.p.v. ze
// stil te laten vallen. Check bij de eerste echte Pacific-tsunami de
// console-regel "[weer] ptwc:".
import { makeSignal } from '../normalize.js';
import { stuurAlarm, kaartTekst } from './pushover.js';
import { stuurMailAlarm } from './email.js';
import { stuurWebPushAlarm } from './webpush.js';
import { telefoonAlarmAan, pushAlarmAan, mailAlarmAan } from '../alarmSchakelaars.js';

const FEED_URL = 'https://www.tsunami.gov/events/xml/PHEBAtom.xml';

// Bulletins blijven in de feed staan nadat het event voorbij is (de feed is
// gewoon "het laatste bulletin", geen levende alertlijst zoals bij NWS) —
// alles ouder dan dit venster wordt genegeerd. Een lopende dreiging krijgt
// om de zoveel tijd een nieuw bulletin, dus een écht actieve waarschuwing
// blijft hiermee gewoon zichtbaar.
const MAX_LEEFTIJD_MS = 12 * 60 * 60 * 1000;

// Producttype -> categorie/ernst. "Information statements" (elke stevige
// Pacific-beving krijgt er standaard een, meestal "geen dreiging") worden
// bewust overgeslagen — anders wordt dit een ruisbron, precies wat bij
// severe thunderstorms al eens misging. Cancellation/final expliciet
// overslaan zodat een ingetrokken waarschuwing niet als actief blijft staan.
function classificeer(tekst) {
  const t = tekst.toUpperCase();
  if (/CANCEL|FINAL/.test(t)) return null;
  if (/WARNING|THREAT/.test(t)) return { categorie: 'tsunami', ernst: 'kritiek', label: 'Tsunami Warning' };
  if (/ADVISORY/.test(t)) return { categorie: 'tsunami', ernst: 'waarschuwing', label: 'Tsunami Advisory' };
  if (/WATCH/.test(t)) return { categorie: 'tsunami-watch', ernst: 'waarschuwing', label: 'Tsunami Watch' };
  if (/INFORMATION|STATEMENT/.test(t)) return null;
  console.log(`[weer] ptwc: onherkend producttype "${tekst}" — overgeslagen (classificeer() in ptwc.js bijstellen?)`);
  return null;
}

function xmlVeld(blok, tag) {
  const m = blok.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? m[1].trim() : null;
}

// De xhtml-summary bevat o.a. "Preliminary Magnitude 6.7(Mwp)" — best-effort
// eruit vissen voor de subtitel; ontbreekt 'ie, dan gewoon zonder.
function magnitudeUit(summary) {
  const m = summary?.match(/magnitude[^0-9]{0,15}(\d+(?:\.\d+)?)/i);
  return m ? m[1] : null;
}

export async function fetchPtwc() {
  const res = await fetch(FEED_URL, {
    headers: { 'User-Agent': 'weer-app-persoonlijk (contact: lokaal project)' },
  });
  if (!res.ok) throw new Error(`PTWC-feed gaf status ${res.status}`);
  const xml = await res.text();

  const feedTitel = xmlVeld(xml.split('<entry>')[0], 'title') ?? '';
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)].map((m) => m[1]);
  const nu = Date.now();
  const signalen = [];

  for (const entry of entries) {
    try {
      const gebied = xmlVeld(entry, 'title') ?? 'Onbekend gebied';
      const updated = xmlVeld(entry, 'updated');
      const updatedMs = updated ? new Date(updated).getTime() : NaN;
      if (!Number.isFinite(updatedMs) || nu - updatedMs > MAX_LEEFTIJD_MS) continue;

      // Producttype kan zowel in de feed-titel ("TSUNAMI INFORMATION
      // STATEMENT NUMBER 1") als in de entry zelf zitten — beide meenemen.
      const klasse = classificeer(`${feedTitel} ${gebied} ${xmlVeld(entry, 'category') ?? ''}`);
      if (!klasse) continue;

      const lat = Number(xmlVeld(entry, 'geo:lat'));
      const lon = Number(xmlVeld(entry, 'geo:long'));
      const summary = xmlVeld(entry, 'summary');
      const magnitude = magnitudeUit(summary);
      const bulletinUrl = entry.match(/href="([^"]+\.txt)"/i)?.[1] ?? 'https://www.tsunami.gov/';

      // Stabiel id per event (niet per bulletin): gebied + dag. Opeenvolgende
      // bulletins voor dezelfde dreiging vervangen elkaar dan netjes i.p.v.
      // als losse nieuwe meldingen te verschijnen.
      const dag = new Date(updatedMs).toISOString().slice(0, 10).replaceAll('-', '');
      const slug = gebied.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const id = `ptwc-${slug}-${dag}`;

      const signaal = makeSignal({
        id,
        categorie: klasse.categorie,
        titel: `${klasse.label} - ${gebied} (PTWC)`,
        ernst: klasse.ernst,
        lat: Number.isFinite(lat) ? lat : null,
        lon: Number.isFinite(lon) ? lon : null,
        tijd: updated,
        detail: {
          subtitel: [magnitude ? `Magnitude ${magnitude}` : null, 'Pacific Tsunami Warning Center']
            .filter(Boolean)
            .join(' · '),
          bronUrl: bulletinUrl,
        },
      });
      signalen.push(signaal);

      // 2026-08-27, op verzoek van Lex ("telefoonalarm graag") — zelfde
      // drie kanalen als de tornado-alarmen in nws.js (Pushover herhaalt,
      // mail + webpush zijn de rustige kanalen), met dezelfde dedup per
      // signaal-id in die modules zelf (opeenvolgende polls sturen dus niet
      // telkens opnieuw; een nieuw bulletin voor hetzelfde event heeft
      // hetzelfde id per dag, zie hierboven). Uitschakelbaar via de
      // serverbrede schakelaar (Instellingen -> Alarmen -> telefoonalarm).
      // Warning/Threat = emergency-prioriteit 2, Advisory/Watch = 1. Bewust
      // niet geawait — het versturen mag de signalen-opbouw nooit vertragen.
      if (telefoonAlarmAan(klasse.categorie)) { // 2026-09-03: per categorie (tsunami / tsunami-watch)
        const alarmTitel = `🌊 ${klasse.label}`;
        const bericht = kaartTekst(signaal);
        if (pushAlarmAan(klasse.categorie)) stuurAlarm({ id, titel: alarmTitel, bericht, prioriteit: klasse.ernst === 'kritiek' ? 2 : 1 });
        if (mailAlarmAan(klasse.categorie)) stuurMailAlarm({ id, titel: alarmTitel, bericht, lat: signaal.lat, lon: signaal.lon });
        if (pushAlarmAan(klasse.categorie)) stuurWebPushAlarm({ id, titel: alarmTitel, bericht, url: `/?signaal=${encodeURIComponent(id)}`, lat: signaal.lat, lon: signaal.lon });
      }
    } catch (err) {
      // Eén kapotte entry mag de rest nooit meeslepen — zelfde patroon als
      // de per-item try/catch in p2000.js.
      console.error('[weer] ptwc: entry overgeslagen:', err.message ?? err);
    }
  }
  return signalen;
}
