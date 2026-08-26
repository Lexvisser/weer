// pushover.js — stuurt push-alarmen via Pushover (pushover.net) voor de
// paar signalen die letterlijk als telefoonalarm moeten aankomen, óók als de
// app niet open staat en de telefoon op stil/niet-storen staat. Op verzoek
// van Lex (2026-08-19): Amerikaanse tornado warnings + watches (nws.js) en
// Nederlandse code oranje/rood-weeralarmen (meteoalarm.js).
//
// Waarom Pushover en niet gewoon e-mail: een gewone e-mail/pushmelding volgt
// altijd de belschakelaar en Focus/niet-storen-instellingen van de telefoon
// — om daar dwars doorheen te breken is Apple's "Critical Alerts"-
// entitlement nodig, die Apple alleen aan goedgekeurde apps geeft. Pushover
// heeft die entitlement al (zie hun documentatie), dus wij hoeven 'm niet
// zelf aan te vragen.
//
// Vereist een gratis Pushover-account + een eigen "applicatie" (levert de
// PUSHOVER_APP_TOKEN op via https://pushover.net/apps/build) en de user key
// van je telefoon (PUSHOVER_USER_KEY, te vinden in de Pushover-app zelf) —
// beide in .env, nooit in git. Zonder deze twee env-vars doet deze module
// gewoon stilzwijgend niets (geen crash) — zo blijft de app ook werken voor
// wie geen Pushover-account heeft.
//
// LET OP bij Lex zelf instellen: in de Pushover-app op je telefoon (per
// apparaat, Instellingen) moet "Critical Alerts" aanstaan wil prioriteit 2
// ("emergency") echt door de belschakelaar/niet-storen heen breken — anders
// is het "alleen maar" een gewone, herhalende melding.
const API_URL = 'https://api.pushover.net/1/messages.json';

// 2026-08-20: op verzoek van Lex ("laat de melding maar overeenkomen met de
// tekst op de kaart, kaart is leidend") — dit is exact dezelfde
// detailregel-logica als popupHtml() in frontend/app.js (titel + één
// subregel, met dezelfde land/subtitel/gebied-volgorde). Reden dat dit hier
// gedupliceerd staat i.p.v. gedeeld: de backend en frontend zijn twee losse
// bestanden zonder gedeelde module — bij een wijziging aan popupHtml()'s
// fallback-volgorde moet deze functie in de gaten gehouden worden.
const CATEGORIEEN_MET_EIGEN_POPUP_STATS = new Set(['aardbeving', 'orkaan']);

export function kaartTekst({ titel, categorie, detail }) {
  const subtitelOfNull = CATEGORIEEN_MET_EIGEN_POPUP_STATS.has(categorie) ? null : detail?.subtitel;
  const detailregel = detail?.land ?? subtitelOfNull ?? detail?.gebied ?? null;
  return detailregel ? `${titel}\n${detailregel}` : titel;
}

// In-memory dedup: voorkomt dat hetzelfde nog actieve alarm bij elke
// pollcyclus (elke paar minuten) opnieuw een melding stuurt. Net als de
// andere caches in dit project (zie plaatsCache/mediaCache in
// blitzortung.js) bewust zonder eviction/persistentie over herstarts heen —
// in het ergste geval meldt een serverherstart een nog actief alarm één
// keer opnieuw. Voor een alarm is dat de veilige kant om op te fouten
// (liever een keer te veel dan te weinig).
const gemeld = new Set();
let waarschuwingGelogd = false;

// 2026-08-20: op verzoek van Lex ("zet Pushover maar even uit") — een losse
// aan/uit-schakelaar i.p.v. gewoon PUSHOVER_APP_TOKEN/PUSHOVER_USER_KEY uit
// .env te verwijderen. Bewust zo, niet door de sleutels te wissen: die twee
// kostten nogal wat uitzoekwerk (user key vs. app-token, Critical Alerts
// aanzetten, volume) — dit laat dat allemaal intact staan, zodat 'm later
// weer aanzetten gewoon één regel in .env is i.p.v. het hele Pushover-account
// opnieuw doorlopen. Standaard AAN (zodra de twee sleutels er zijn) tenzij
// hier expliciet op '0' gezet.
function ingeschakeld() {
  return process.env.PUSHOVER_INGESCHAKELD !== '0';
}

function heeftSleutels() {
  return Boolean(process.env.PUSHOVER_APP_TOKEN && process.env.PUSHOVER_USER_KEY);
}

function beschikbaar() {
  return ingeschakeld() && heeftSleutels();
}

// prioriteit: 2 = "emergency" (Pushover blijft herhalen met geluid tot
// bevestiging, breekt door belschakelaar/niet-storen heen — zie LET OP
// hierboven), 1 = "high" (geen herhaling, wel meteen hoorbaar/zichtbaar
// zonder de app te hoeven openen).
export async function stuurAlarm({ id, titel, bericht, url, prioriteit = 1 }) {
  if (!id) return;
  if (gemeld.has(id)) {
    // 2026-08-19: was stil (geen enkele logregel) — bij het testen met Lex
    // bleek dat onduidelijk: leek dan alsof er niks gebeurde, terwijl dit
    // gewoon de dedup deed waar-ie voor bedoeld is (zelfde alarm niet
    // opnieuw sturen zolang de service niet herstart is). Nu wel zichtbaar.
    console.log(`[weer] pushover: "${id}" al eerder gemeld sinds laatste herstart, overgeslagen (titel: ${titel}).`);
    return;
  }
  if (!beschikbaar()) {
    if (!waarschuwingGelogd) {
      waarschuwingGelogd = true;
      console.log(
        !ingeschakeld()
          ? '[weer] pushover: PUSHOVER_INGESCHAKELD=0 in .env — alarmmeldingen staan bewust uit (rest van de app werkt gewoon door).'
          : '[weer] pushover: PUSHOVER_APP_TOKEN/PUSHOVER_USER_KEY niet ingesteld in .env — alarmmeldingen staan uit (rest van de app werkt gewoon door).'
      );
    }
    return;
  }
  gemeld.add(id);

  const velden = {
    token: process.env.PUSHOVER_APP_TOKEN,
    user: process.env.PUSHOVER_USER_KEY,
    title: titel,
    message: bericht,
    priority: String(prioriteit),
    ...(url ? { url, url_title: 'Open Weer' } : {}),
    // Emergency-prioriteit vereist retry/expire (hoe vaak/lang Pushover blijft
    // aandringen); "siren" is een van de ingebouwde, opvallende geluiden.
    ...(prioriteit === 2 ? { retry: '60', expire: '3600', sound: 'siren' } : { sound: 'persistent' }),
  };

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(velden),
    });
    if (!res.ok) {
      const tekst = await res.text().catch(() => '');
      console.error(`[weer] pushover: melding versturen mislukt (status ${res.status}): ${tekst.slice(0, 200)}`);
      gemeld.delete(id); // niet blijvend onthouden als het mislukte — volgende cyclus opnieuw proberen
    } else {
      console.log(`[weer] pushover: alarm verstuurd — ${titel}`);
    }
  } catch (err) {
    console.error('[weer] pushover: melding versturen mislukt,', err.message ?? err);
    gemeld.delete(id);
  }
}
