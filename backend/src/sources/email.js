// email.js — stuurt een e-mailalarm (Gmail SMTP) voor dezelfde signalen als
// Pushover: Amerikaanse tornado warnings/watches (nws.js) en Nederlandse
// code oranje/rood-weeralarmen (meteoalarm.js).
//
// 2026-08-20, op verzoek van Lex: hij twijfelde uiteindelijk aan Pushover
// ("een mail volstaat ook en dat kan gewoon") en zette 'm uit
// (PUSHOVER_INGESCHAKELD=0). Dit is het mail-alternatief — geen Apple
// Critical-Alerts-achtige belschakelaar-doorbraak (dat kán een gewone mail
// niet, zie het commentaar in pushover.js), maar dat hoeft hier ook niet:
// Lex vond een gewone mailmelding voldoende.
//
// Hergebruikt bewust het app-wachtwoord van zijn bestaande vogel-app (zelfde
// Gmail-account, zelfde server) i.p.v. een nieuw account/app-wachtwoord
// apart voor Weer aan te maken — Lex' expliciete keuze ("hergebruiken").
// Nadeel om in de gaten te houden: als dat app-wachtwoord ooit voor de
// vogel-app wordt ingetrokken/vervangen, breekt Weer's mail ook mee.
//
// Vereist in .env: EMAIL_GEBRUIKER (het Gmail-adres) + EMAIL_APP_WACHTWOORD
// (het 16-tekens app-wachtwoord). EMAIL_ONTVANGER is optioneel — standaard
// hetzelfde adres als EMAIL_GEBRUIKER (Lex: "naar mezelf, zelfde account").
// Zonder de twee vereiste env-vars doet deze module gewoon stilzwijgend
// niets (geen crash) — zelfde patroon als pushover.js.
//
// Nodemailer i.p.v. zelf een SMTP/TLS-client bouwen: dit project is verder
// bewust dependency-loos (zie index.js' eigen .env-loader), maar voor
// SMTP-AUTH+TLS is een geteste library de veiligere keuze dan dat zelf
// nabouwen voor iets dat alarmen moet afleveren. Eenmalig `npm install`
// nodig in backend/ — zie package.json.
import nodemailer from 'nodemailer';

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_GEBRUIKER,
        pass: process.env.EMAIL_APP_WACHTWOORD,
      },
    });
  }
  return transporter;
}

// Zelfde in-memory dedup-aanpak als pushover.js (los bijgehouden, niet
// gedeeld): voorkomt dat hetzelfde nog actieve alarm elke pollcyclus
// opnieuw een mail stuurt. Bewust een aparte Set van pushover.js — de twee
// kanalen staan los van elkaar aan/uit, dus een mislukte/overgeslagen mail
// mag de Pushover-dedup niet beïnvloeden en andersom.
const gemeld = new Set();
let waarschuwingGelogd = false;

function ingeschakeld() {
  return process.env.EMAIL_INGESCHAKELD !== '0';
}

function heeftSleutels() {
  return Boolean(process.env.EMAIL_GEBRUIKER && process.env.EMAIL_APP_WACHTWOORD);
}

function beschikbaar() {
  return ingeschakeld() && heeftSleutels();
}

// 2026-08-20, op verzoek van Lex ("mails met een kenmerk een eigen geluid
// laten afspelen") — iOS Mail kan geen onderwerp/inhoud-gebaseerde regels,
// alleen een aparte melding+geluid per VIP-AFZENDER (Instellingen > Mail >
// Notificaties > VIP). Omdat EMAIL_ONTVANGER hier standaard hetzelfde adres
// is als EMAIL_GEBRUIKER (naar zichzelf), zou VIP'en van dat adres élke mail
// die Lex ooit naar zichzelf stuurt als VIP behandelen — niet praktisch. Met
// Gmail-plusadressering (user+tag@gmail.com, technisch dezelfde mailbox, dus
// geen apart "Verzenden als"-alias in Gmail nodig) krijgt Weer's afzender een
// eigen, VIP-baar "kenmerk": lexvisser+weeralarm@gmail.com i.p.v. gewoon
// lexvisser@gmail.com. Zie de mail aan Lex voor de iPhone-kant (VIP
// toevoegen + eigen geluid instellen) — controleer met de testfixture
// (WEER_TEST_TORNADO_WATCH=1) of Gmail deze afzender ongewijzigd doorlaat.
function afzenderAdres() {
  const basis = process.env.EMAIL_GEBRUIKER;
  if (!basis) return null;
  const atIndex = basis.indexOf('@');
  if (atIndex === -1) return basis;
  return `${basis.slice(0, atIndex)}+weeralarm${basis.slice(atIndex)}`;
}

// 2026-08-20, op verzoek van Lex ("kan je een kaartje meesturen met de
// boundary in die mail?") — een kleine statische kaart via Geoapify's
// Static Maps API (gratis, geen creditcard nodig — zie
// https://www.geoapify.com/static-maps-api/), met de gebied-omtrek erop
// getekend als het signaal die heeft (detail.gebiedPolygon, dezelfde data
// die de kaart-omtrek in de app zelf tekent, zie toonGebiedVoor() in
// app.js), anders gewoon een pin op lat/lon. Bewust een NIEUW/optioneel
// GEOAPIFY_API_KEY in .env — zonder sleutel gaat de mail gewoon door, alleen
// zonder kaartje (zie de try/catch in stuurMailAlarm hieronder): een
// haperend of ontbrekend kaartje mag een tijd-kritiek alarm nooit
// tegenhouden.
//
// Coördinaten-let-op: detail.gebiedPolygon staat al in [lat, lon]-volgorde
// (Leaflet-conventie, zie ringenAlsLatLon() in nws.js) — Geoapify's
// geometry-parameter wil juist lon,lat, dus hieronder omgedraaid.
// 2026-08-22: geëxporteerd (was intern) — webpush.js hergebruikt 'm nu ook
// voor de kaartafbeelding in de pushmelding zelf, i.p.v. dezelfde
// polygon-tekenlogica te dupliceren.
export function kaartUrlVoor({ lat, lon, gebiedPolygon }) {
  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey) return null;
  const basis = 'https://maps.geoapify.com/v1/staticmap?style=osm-carto&width=640&height=420';
  const eersteRing = Array.isArray(gebiedPolygon) && gebiedPolygon.length ? gebiedPolygon[0] : null;
  if (Array.isArray(eersteRing) && eersteRing.length >= 3) {
    const coords = eersteRing.map(([latP, lonP]) => `${lonP},${latP}`).join(',');
    return `${basis}&geometry=polygon:${coords};linewidth:3;linecolor:%23ff2e6d;fillcolor:%23ff2e6d;lineopacity:0.9;fillopacity:0.15&apiKey=${apiKey}`;
  }
  if (lat != null && lon != null) {
    return `${basis}&center=lonlat:${lon},${lat}&zoom=9&marker=lonlat:${lon},${lat};color:%23ff2e6d;size:large&apiKey=${apiKey}`;
  }
  return null;
}

// 2026-08-23, op verzoek van Lex ("kan dat naar lexvisser@gmail.com ipv het
// apple adres?", over het Lifeliner-poll-rapport specifiek) — optionele `to`-
// override: zonder deze param blijft het gedrag exact zoals voorheen
// (EMAIL_ONTVANGER, of anders EMAIL_GEBRUIKER) voor alle bestaande aanroepen
// (nws.js/meteoalarm.js). Alleen lifeliner.js geeft nu bewust een eigen `to`
// mee, zodat dat ene rapport naar een ander adres gaat zonder de tornado-/
// weeralarm-mails (die wél naar het algemene, Apple-gekoppelde adres moeten
// blijven gaan) te raken.
// ---- Tijdzone-verrijking (2026-08-28) ---------------------------------
// Op verzoek van Lex: NWS-mails noemen tijden in de lokale Amerikaanse zone
// ("Tornado Warning issued August 27 at 8:24PM EDT until ...") — daar komt
// nu per gevonden tijd een vermelding in UTC én Amsterdamse tijd achter,
// in de HTML-mail als twee gekleurde pillen (inline styles, want
// mailclients kennen geen stylesheets), in de platte-tekst-variant als
// " (28 aug 00:24 UTC · 28 aug 02:24 NL)". De datum staat er telkens bij:
// juist rond middernacht schuift die bij het omrekenen (Lex' voorbeeld:
// 27 aug 20:24 EDT = 28 aug 00:24 UTC).
//
// Vaste offset-tabel voor de zone-afkortingen die NWS gebruikt — de
// afkorting zelf codeert al zomer- of wintertijd (EDT vs EST), dus dit is
// geen gok maar een 1-op-1-vertaling. De Amsterdamse tijd komt via de echte
// ICU-tijdzone (Europe/Amsterdam), dus de NL-zomertijdgrens klopt altijd.
const TZ_OFFSET_UREN = {
  // VS-vasteland
  EDT: -4, EST: -5, CDT: -5, CST: -6, MDT: -6, MST: -7, PDT: -7, PST: -8,
  // Alaska/Hawaï/territoria (tsunami- en orkaanberichten)
  AKDT: -8, AKST: -9, HDT: -9, HST: -10, AST: -4, ADT: -3, SST: -11, CHST: 10,
  GMT: 0, UTC: 0,
};
const MAAND_INDEX = {
  JANUARY: 0, FEBRUARY: 1, MARCH: 2, APRIL: 3, MAY: 4, JUNE: 5,
  JULY: 6, AUGUST: 7, SEPTEMBER: 8, OCTOBER: 9, NOVEMBER: 10, DECEMBER: 11,
};
const TIJD_REGEX = new RegExp(
  `\\b(${Object.keys(MAAND_INDEX).join('|')})\\s+(\\d{1,2})\\s+at\\s+(\\d{1,2}):(\\d{2})\\s*(AM|PM)\\s+(${Object.keys(TZ_OFFSET_UREN).join('|')})\\b`,
  'gi',
);

function formatteerKort(ms, timeZone) {
  return new Date(ms)
    .toLocaleString('nl-NL', { timeZone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
    .replace(',', '');
}

// Alle NWS-achtige tijden in een tekst vinden en omrekenen. Geen jaartal in
// de brontekst — we kiezen het jaar dat de datum het dichtst bij nu legt
// (vangt de jaarwisseling af: "December 31 at 11:30PM EST" gelezen op 1 jan).
function vindTijdVerrijkingen(tekst) {
  const uit = [];
  TIJD_REGEX.lastIndex = 0;
  let m;
  while ((m = TIJD_REGEX.exec(tekst)) !== null) {
    const maand = MAAND_INDEX[m[1].toUpperCase()];
    const dag = Number(m[2]);
    let uur = Number(m[3]) % 12;
    if (m[5].toUpperCase() === 'PM') uur += 12;
    const minuut = Number(m[4]);
    const offset = TZ_OFFSET_UREN[m[6].toUpperCase()];
    if (maand == null || offset == null) continue;
    const nu = Date.now();
    let utcMs = Date.UTC(new Date().getUTCFullYear(), maand, dag, uur, minuut) - offset * 3600e3;
    const halfJaar = 183 * 24 * 3600e3;
    if (utcMs - nu > halfJaar) utcMs -= 365 * 24 * 3600e3;
    else if (nu - utcMs > halfJaar) utcMs += 365 * 24 * 3600e3;
    uit.push({ index: m.index, lengte: m[0].length, utc: formatteerKort(utcMs, 'UTC'), nl: formatteerKort(utcMs, 'Europe/Amsterdam') });
  }
  return uit;
}

// Platte tekst: " (28 aug 00:24 UTC · 28 aug 02:24 NL)" direct achter de tijd.
export function verrijkTekstMetTijdzones(tekst) {
  const verrijkingen = vindTijdVerrijkingen(tekst);
  if (!verrijkingen.length) return tekst;
  let uit = '';
  let vorige = 0;
  for (const v of verrijkingen) {
    uit += tekst.slice(vorige, v.index + v.lengte) + ` (${v.utc} UTC · ${v.nl} NL)`;
    vorige = v.index + v.lengte;
  }
  return uit + tekst.slice(vorige);
}

function escapeHtmlMail(tekst) {
  return tekst.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

const PIL_BASIS = 'display:inline-block;border-radius:999px;padding:1px 9px;font-size:12px;font-family:monospace;white-space:nowrap;margin:0 2px;';

// HTML: zelfde tekst, maar met de UTC- en NL-tijd als twee gekleurde pillen
// achter elke gevonden tijd (blauw = UTC, oranje = NL — elk "in eigen kleur
// in kadertje of pil", zoals gevraagd).
function htmlMetTijdzonePillen(tekst) {
  const verrijkingen = vindTijdVerrijkingen(tekst);
  let uit = '';
  let vorige = 0;
  for (const v of verrijkingen) {
    uit += escapeHtmlMail(tekst.slice(vorige, v.index + v.lengte));
    uit += ` <span style="${PIL_BASIS}background:#eaf3ff;color:#1b5fae;border:1px solid #7cb4ea;">${escapeHtmlMail(v.utc)} UTC</span>`;
    uit += `<span style="${PIL_BASIS}background:#fff3e0;color:#a35a00;border:1px solid #f0b46a;">${escapeHtmlMail(v.nl)} NL</span>`;
    vorige = v.index + v.lengte;
  }
  return uit + escapeHtmlMail(tekst.slice(vorige));
}

export async function stuurMailAlarm({ id, titel, bericht, url, lat, lon, gebiedPolygon, to }) {
  if (!id) return;
  if (gemeld.has(id)) {
    console.log(`[weer] mail: "${id}" al eerder gemeld sinds laatste herstart, overgeslagen (titel: ${titel}).`);
    return;
  }
  if (!beschikbaar()) {
    if (!waarschuwingGelogd) {
      waarschuwingGelogd = true;
      console.log(
        !ingeschakeld()
          ? '[weer] mail: EMAIL_INGESCHAKELD=0 in .env — mailmeldingen staan bewust uit (rest van de app werkt gewoon door).'
          : '[weer] mail: EMAIL_GEBRUIKER/EMAIL_APP_WACHTWOORD niet ingesteld in .env — mailmeldingen staan uit (rest van de app werkt gewoon door).'
      );
    }
    return;
  }
  gemeld.add(id);

  const ontvanger = to || process.env.EMAIL_ONTVANGER || process.env.EMAIL_GEBRUIKER;
  const tekst = url ? `${bericht}\n\n${url}` : bericht;

  // 2026-08-20: kaartje ZELF ophalen (i.p.v. nodemailer een externe URL
  // rechtstreeks te laten attachen) en in een eigen try/catch — zo kan een
  // haperende kaart-aanroep nooit de hele mailverzending laten mislukken.
  // Bij een nodemailer-URL-attachment zou een mislukte fetch namelijk de
  // hele sendMail() laten falen, en daarmee (via de catch hieronder) het
  // hele alarm blokkeren — voor een tijd-kritieke waarschuwing onacceptabel
  // voor iets wat puur "aardig om te hebben" is.
  const attachments = [];
  const kaartUrl = kaartUrlVoor({ lat, lon, gebiedPolygon });
  if (kaartUrl) {
    try {
      const res = await fetch(kaartUrl);
      if (!res.ok) throw new Error(`status ${res.status}`);
      attachments.push({ filename: 'gebied.png', content: Buffer.from(await res.arrayBuffer()), cid: 'gebiedkaart' });
    } catch (err) {
      console.error('[weer] mail: kaartje ophalen mislukt, mail gaat gewoon door zonder kaartje —', err.message ?? err);
    }
  }
  // 2026-08-28: de mail is nu ALTIJD ook HTML (voorheen alleen met kaartje)
  // zodat de tijdzone-pillen overal zichtbaar zijn; de platte-tekst-variant
  // krijgt dezelfde omgerekende tijden tussen haakjes als terugval voor
  // clients zonder HTML.
  const html = `<div style="font-family:sans-serif;white-space:pre-wrap;">${htmlMetTijdzonePillen(tekst)}</div>${attachments.length ? '<img src="cid:gebiedkaart" alt="Kaart met gebied" style="max-width:100%;border-radius:8px;margin-top:12px;" />' : ''}`;

  try {
    await getTransporter().sendMail({
      from: `"Weer Alarm" <${afzenderAdres()}>`,
      to: ontvanger,
      subject: titel,
      text: verrijkTekstMetTijdzones(tekst),
      html,
      attachments: attachments.length ? attachments : undefined,
    });
    console.log(`[weer] mail: alarm verstuurd — ${titel}${attachments.length ? ' (met kaartje)' : ''}`);
  } catch (err) {
    console.error('[weer] mail: versturen mislukt,', err.message ?? err);
    gemeld.delete(id); // niet blijvend onthouden als het mislukte — volgende cyclus opnieuw proberen
  }
}
