// radioLuister.js — 2026-09-09. Op verzoek luisteren naar één NOAA Weather
// Radio-zender: ffmpeg haalt de stream op en knipt 'm in blokken van 30 s,
// whisper.cpp zet elk blok om in tekst, en die gaat met tijdstempel naar
// ~/radio_tekst_<ID>.txt (gelezen door radioTekst.js). Na één cyclus
// (LUISTER_MS, ~12 min: dan zijn waarnemingen én verwachting voorbijgekomen)
// stopt het vanzelf. Lex (09/09): "hij hoeft toch pas te luisteren als ik op
// zo'n station klik" — dus geen 24/7-dienst meer (dat was ook netter tegen-
// over de hobbyrelays van wxradio.org), maar starten vanuit de app bij het
// aanklikken van een pin. Zelfde pijplijn als tools/radio-whisper/
// radio_whisper.sh, alleen nu vanuit node zodat er niets geïnstalleerd hoeft
// te worden behalve ffmpeg en whisper.cpp.
import { spawn, execFile } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, appendFileSync, statSync, renameSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { radioBestand } from './radioTekst.js';

const FFMPEG = process.env.RADIO_FFMPEG || 'ffmpeg';
const WHISPER = process.env.RADIO_WHISPER_BIN || '/home/lex/whisper.cpp/build/bin/whisper-cli';
// Model: base.en als het er staat (2026-09-09: small.en deed 12–20 s per blok
// naast Frigate — te traag voor blokken van 15 s; base.en is ~3× sneller en
// verstaat de NWR-omroepers prima), anders small.en. RADIO_WHISPER_MODEL wint.
const MODEL = process.env.RADIO_WHISPER_MODEL
  || (existsSync('/home/lex/whisper.cpp/models/ggml-base.en.bin') ? '/home/lex/whisper.cpp/models/ggml-base.en.bin' : '/home/lex/whisper.cpp/models/ggml-small.en.bin');
const THREADS = Number(process.env.RADIO_WHISPER_THREADS || 4);
const BLOK_S = Number(process.env.RADIO_BLOK_S || 15); // 2026-09-09: 15 s — korter = minder vertraging voor het synchroon meeluisteren
const LUISTER_MS = Number(process.env.RADIO_LUISTER_MIN || 12) * 60 * 1000;
const MAX_TEGELIJK = Number(process.env.RADIO_MAX_TEGELIJK || 1); // 2026-09-09 14:00: drie tegelijk + inventarisatie legde de Minisforum plat (load 85, geheugen op)

const actief = new Map(); // stationId -> { proces, tot, timer, werk, bezig, blokken }
// Afgeronde luistersessies blijven nog even beschikbaar voor de browser die
// achterloopt (synchroon meeluisteren): stationId -> { werk, blokken, tot }
const afgerond = new Map();
const NABLIJF_MS = 15 * 60 * 1000;
const MAX_BLOKKEN = 60; // ~15 min audio op tmpfs (wav 16 kHz mono ≈ 0,5 MB per 15 s)

// Eén Whisper tegelijk op de hele server, met nice: elk proces laadt het model
// (~0,5 GB bij small) en trekt THREADS kernen; meer dan één tegelijk vrat op
// 2026-09-09 al het geheugen op naast Frigate/Immich.
let whisperBezig = false;
const whisperWachtrij = [];
function whisperRun(args, klaar) {
  whisperWachtrij.push({ args, klaar });
  whisperVolgende();
}
function whisperVolgende() {
  if (whisperBezig) return;
  const taak = whisperWachtrij.shift();
  if (!taak) return;
  whisperBezig = true;
  execFile('nice', ['-n', '15', WHISPER, ...taak.args], { timeout: 180000, maxBuffer: 1 << 20 }, (err, stdout) => {
    whisperBezig = false;
    try { taak.klaar(err, stdout); } finally { setImmediate(whisperVolgende); }
  });
}

// 2026-09-10: deze twee schrijfacties stonden kaal in de code, en één
// EACCES nam het hele Node-proces mee ("Main process exited, code=exited,
// status=1/FAILURE" bij elke klik op een zender, waarna systemd vijf seconden
// later herstartte — Lex zag dat als ERR_CONNECTION_REFUSED en "het blijft
// erratic"). Oorzaak was de omzetting van root naar lex: de tekstbestanden in
// /home/lex waren nog van root. Dat is rechtgezet, maar een rechtenprobleem
// mag sowieso nooit de app kunnen neerhalen — dus afgevangen.
let schrijfKlachtGemeld = false;
function schrijfRegel(id, regel) {
  try {
    appendFileSync(radioBestand(id), `${regel}\n`);
    schrijfKlachtGemeld = false;
    return true;
  } catch (err) {
    if (!schrijfKlachtGemeld) {
      console.error(`[weer] radioLuister ${id}: kan niet schrijven naar ${radioBestand(id)} (${err.code ?? err.message}) — verstaan levert nu niets op`);
      schrijfKlachtGemeld = true;
    }
    return false;
  }
}

function stempelNaarIso(s) {
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/.exec(s);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])).toISOString() : null;
}

function stempel(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function beschikbaar() {
  return existsSync(WHISPER) && existsSync(MODEL);
}

export function luisterStatus(stationId) {
  const a = actief.get(stationId);
  return a && !a.gestopt ? { actief: true, tot: new Date(a.tot).toISOString() } : { actief: false, tot: null };
}

export function alleLuisterStatus() {
  return Object.fromEntries([...actief.keys()].map((id) => [id, luisterStatus(id)]));
}

// 2026-09-09 (avond): blokgrenzen knippen midden in woorden ("up to 1" /
// "10."), en dan slaat de vertaling op hol. Daarom hoort Whisper steeds het
// VORIGE + huidige blok (30 s) en nemen we alleen de tekst over die volgens
// Whisper's eigen tijdstempels in de tweede helft begint. Elk woord wordt zo
// één keer heel gehoord; de vertraging blijft één blok.
// PCM-data uit een WAV halen door de RIFF-blokken te lopen (ffmpeg zet een
// LIST/INFO-blok vóór 'data', dus de kop is NIET altijd 44 bytes — dat was op
// 2026-09-09 de reden dat Whisper op het geplakte venster niets teruggaf).
function wavData(buf) {
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null;
  let p = 12;
  let fmt = null;
  while (p + 8 <= buf.length) {
    const id = buf.toString('ascii', p, p + 4);
    const len = buf.readUInt32LE(p + 4);
    const begin = p + 8;
    if (id === 'fmt ') fmt = { kanalen: buf.readUInt16LE(begin + 2), rate: buf.readUInt32LE(begin + 4), bits: buf.readUInt16LE(begin + 14) };
    if (id === 'data') return { fmt, data: buf.subarray(begin, Math.min(buf.length, begin + len)) };
    p = begin + len + (len % 2);
  }
  return null;
}

function plakWavs(padA, padB, uit) {
  const a = wavData(readFileSync(padA));
  const b = wavData(readFileSync(padB));
  if (!a || !b) throw new Error('geen geldige wav');
  const fmt = a.fmt ?? { kanalen: 1, rate: 16000, bits: 16 };
  const data = Buffer.concat([a.data, b.data]);
  const kop = Buffer.alloc(44);
  kop.write('RIFF', 0); kop.writeUInt32LE(36 + data.length, 4); kop.write('WAVE', 8);
  kop.write('fmt ', 12); kop.writeUInt32LE(16, 16); kop.writeUInt16LE(1, 20); kop.writeUInt16LE(fmt.kanalen, 22);
  kop.writeUInt32LE(fmt.rate, 24); kop.writeUInt32LE((fmt.rate * fmt.kanalen * fmt.bits) / 8, 28); kop.writeUInt16LE((fmt.kanalen * fmt.bits) / 8, 32); kop.writeUInt16LE(fmt.bits, 34);
  kop.write('data', 36); kop.writeUInt32LE(data.length, 40);
  writeFileSync(uit, Buffer.concat([kop, data]));
  return a.data.length / ((fmt.rate * fmt.kanalen * fmt.bits) / 8); // duur van A in seconden
}

// "[00:00:12.340 --> 00:00:15.900]   tekst" → { van, tot, tekst }
function parseSegmenten(stdout) {
  const uit = [];
  for (const regel of String(stdout).split('\n')) {
    const m = /^\[(\d{2}):(\d{2}):(\d{2})\.(\d{3}) --> (\d{2}):(\d{2}):(\d{2})\.(\d{3})\]\s*(.*)$/.exec(regel.trim());
    if (!m) continue;
    const t = (h, mi, se, ms) => Number(h) * 3600 + Number(mi) * 60 + Number(se) + Number(ms) / 1000;
    const tekst = m[9].trim();
    if (tekst) uit.push({ van: t(m[1], m[2], m[3], m[4]), tot: t(m[5], m[6], m[7], m[8]), tekst });
  }
  return uit;
}

// Verwerkt afgeronde blokken (alle wav's behalve de nieuwste, die is nog in opname).
function verwerkBlokken(id) {
  const a = actief.get(id);
  if (!a || a.bezig) return;
  let bestanden;
  try {
    bestanden = readdirSync(a.werk).filter((f) => /^\d{8}-\d{6}\.wav$/.test(f)).sort(); // alleen echte opnameblokken (niet klaar-*, niet het venster)
  } catch (_) {
    return;
  }
  if (bestanden.length < 2 && a.proces) return;
  const klaar = a.proces ? bestanden.slice(0, -1) : bestanden;
  const f = klaar[0];
  if (!f) return;
  a.bezig = true;
  const pad = path.join(a.werk, f);
  const t0 = Date.now();
  const achterstand = klaar.length - 1; // blokken die nog wachten
  // venster = vorig blok + dit blok (als er een vorig blok is)
  const vorig = a.blokken.length ? a.blokken[a.blokken.length - 1] : null;
  let invoer = pad;
  let offset = 0;
  if (vorig && existsSync(vorig.pad)) {
    try { invoer = path.join(a.werk, 'venster-werk.wav'); offset = plakWavs(vorig.pad, pad, invoer); } catch (_) { invoer = pad; offset = 0; }
  }
  // -ml 1 -sow: één woord per regel met tijdstempel, zodat we precies de
  // woorden uit de tweede helft van het venster kunnen nemen (een doorlopende
  // spreker gaf anders één segment van 0–30 s en dus niets in de tweede helft)
  whisperRun(['-m', MODEL, '-f', invoer, '-t', String(THREADS), '-ml', '1', '-sow'], (err, stdout) => {
    a.bezig = false;
    const stamp = f.replace(/\.wav$/, '');
    const duurS = (Date.now() - t0) / 1000;
    if (duurS > BLOK_S * 0.8 || achterstand > 0) console.log(`[weer] radioLuister ${id}: blok ${stamp} in ${duurS.toFixed(1)} s${achterstand ? `, ${achterstand} blok(ken) achterstand` : ''}`);
    if (err) { console.warn(`[weer] radioLuister ${id}: whisper mislukt: ${err.message}`); try { rmSync(pad, { force: true }); } catch (_) { /* weg */ } }
    else {
      const segmenten = parseSegmenten(stdout);
      // alleen wat in de tweede helft begint (met een halve seconde speling);
      // per woord de tijd t.o.v. het begin van dit blok (voor het woord-voor-
      // woord tonen in de app, Lex 09/09: "lastig te volgen, een hele alinea
      // tegelijk")
      let woorden = segmenten
        .filter((sg) => sg.van >= offset - 0.5 && !/^\[[A-Z_ ]+\]$/.test(sg.tekst)) // [BLANK_AUDIO] e.d. eruit
        .map((sg) => ({ t: Math.max(0, Math.round((sg.van - offset) * 10) / 10), w: sg.tekst }));
      let tekst = woorden.map((x) => x.w).join(' ').replace(/\s+/g, ' ').trim();
      // dubbel met het vorige blok (zelfde zin twee keer gehoord) wegpoetsen
      // (woordgewijs, zonder leestekens: "temperature was 88." | "was 88 degrees" → "degrees")
      if (vorig?.woorden?.length && woorden.length) {
        const kaal = (w) => w.toLowerCase().replace(/[^a-z0-9%]/g, '');
        const staart = vorig.woorden.slice(-10).map((x) => kaal(x.w));
        const kop = woorden.slice(0, 10).map((x) => kaal(x.w));
        for (let n = Math.min(staart.length, kop.length); n >= 2; n -= 1) {
          if (staart.slice(-n).join(' ') === kop.slice(0, n).join(' ') && kop.slice(0, n).some((w) => w.length > 2)) {
            woorden = woorden.slice(n);
            tekst = woorden.map((x) => x.w).join(' ').replace(/\s+/g, ' ').trim();
            break;
          }
        }
      }
      schrijfRegel(id, `[${stamp}] ${tekst}`);
      // 2026-09-09: blok bewaren voor het synchroon meeluisteren — de browser
      // speelt precies dit blok af op het moment dat de tekst ervan er is.
      const klaarPad = path.join(a.werk, `klaar-${stamp}.wav`);
      try { renameSync(pad, klaarPad); a.blokken.push({ stamp, tijd: stempelNaarIso(stamp), tekst, woorden, pad: klaarPad, duurS: BLOK_S }); } catch (_) { /* dan zonder audio */ }
      while (a.blokken.length > MAX_BLOKKEN) { const oud = a.blokken.shift(); try { rmSync(oud.pad, { force: true }); } catch (_) { /* weg */ } }
    }
    setImmediate(() => verwerkBlokken(id)); // volgende blok, als dat er al is
  });
}

export function startLuisteren(station, opties = {}) {
  const id = station?.id;
  if (!id || !station.url) return { ok: false, fout: 'geen zender/stream' };
  if (!beschikbaar()) return { ok: false, fout: 'whisper.cpp of model niet gevonden op de server' };
  const bestaand = actief.get(id);
  if (bestaand && !bestaand.gestopt) return { ok: true, ...luisterStatus(id), al: true };
  if (bestaand?.gestopt) return { ok: false, fout: 'vorige sessie van deze zender wordt nog afgerond, probeer zo opnieuw' };
  // Vol? Dan de oudste luisteraar stoppen — een klik op een nieuwe zender wint
  // (Lex 09/09: klik op WXX67 deed niets omdat KEC56 nog 12 min bezig was).
  const lopend = () => [...actief.entries()].filter(([, x]) => !x.gestopt);
  while (lopend().length >= MAX_TEGELIJK) {
    const oudste = lopend().sort((x, y) => x[1].tot - y[1].tot)[0];
    if (!oudste) break;
    console.log(`[weer] radioLuister ${oudste[0]}: gestopt voor ${id}`);
    oudste[1].gestopt = true;
    if (oudste[1].proces) oudste[1].proces.kill('SIGTERM'); // opruimen loopt via het exit-event verder
  }

  const werk = `/dev/shm/radio-luister-${id}`;
  try { rmSync(werk, { recursive: true, force: true }); } catch (_) { /* leeg */ }
  mkdirSync(werk, { recursive: true });
  // Kopregel in het tekstbestand. Zonder achtervoegsel = nieuwe klik: radioTekst.js
  // gooit alles daarvóór weg, zodat waarnemingen én verwachting van deze zender
  // opnieuw opbouwen (2026-09-10, Lex: "een klik verwijdert niet meteen alles,
  // dat had ik wel verwacht"). Met " verleng" = dezelfde sessie oprekken, dan
  // blijft de tekst tot nu toe staan.
  schrijfRegel(id, `[${stempel()}] #station ${id}${opties.verleng ? ' verleng' : ''}`);

  const proces = spawn(FFMPEG, [
    '-loglevel', 'error', '-nostdin',
    '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '10',
    '-i', station.url, '-ac', '1', '-ar', '16000',
    '-f', 'segment', '-segment_time', String(BLOK_S), '-reset_timestamps', '1', '-strftime', '1',
    path.join(werk, '%Y%m%d-%H%M%S.wav'),
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  proces.stderr.on('data', (d) => console.warn(`[weer] radioLuister ${id} ffmpeg: ${String(d).trim()}`));
  const oudAf = afgerond.get(id);
  if (oudAf) { clearTimeout(oudAf.timer); afgerond.delete(id); }
  const a = { proces, tot: Date.now() + LUISTER_MS, werk, bezig: false, timer: null, blokken: [], gestopt: false };
  actief.set(id, a);
  a.timer = setInterval(() => verwerkBlokken(id), 2000);

  const opruimen = () => {
    clearInterval(a.timer);
    a.proces = null;
    // laatste blokken nog verwerken, dan de map weg
    const rest = () => {
      if (a.bezig) { setTimeout(rest, 1000); return; }
      const over = (() => { try { return readdirSync(werk).some((f) => /^\d{8}-\d{6}\.wav$/.test(f) && statSync(path.join(werk, f)).size > 32000); } catch (_) { return false; } })();
      if (over) { verwerkBlokken(id); setTimeout(rest, 1000); return; }
      actief.delete(id);
      const oudAfgerond = afgerond.get(id);
      if (oudAfgerond?.timer) clearTimeout(oudAfgerond.timer);
      const na = { werk, blokken: a.blokken, tot: a.tot, timer: null };
      na.timer = setTimeout(() => { try { rmSync(werk, { recursive: true, force: true }); } catch (_) { /* leeg */ } if (afgerond.get(id) === na) afgerond.delete(id); }, NABLIJF_MS);
      afgerond.set(id, na);
      console.log(`[weer] radioLuister ${id}: klaar (${a.blokken.length} blokken blijven ${NABLIJF_MS / 60000} min beschikbaar)`);
    };
    rest();
  };
  proces.on('exit', (code) => { if (actief.get(id)?.proces === proces) { console.log(`[weer] radioLuister ${id}: ffmpeg gestopt (${code})`); opruimen(); } });
  setTimeout(() => { if (actief.get(id) === a && a.proces) a.proces.kill('SIGTERM'); }, LUISTER_MS);
  console.log(`[weer] radioLuister ${id}: gestart, ${LUISTER_MS / 60000} min (${station.url}), model ${path.basename(MODEL)}`);
  return { ok: true, ...luisterStatus(id) };
}

// Voor het synchroon meeluisteren: lijst van klare blokken (tijd + tekst) en
// het pad van de audio van één blok.
export function blokkenStatus(stationId) {
  const a = actief.get(stationId) ?? afgerond.get(stationId);
  if (!a) return { actief: false, tot: null, blokS: BLOK_S, blokken: [] };
  return { actief: actief.has(stationId), tot: new Date(a.tot).toISOString(), blokS: BLOK_S, blokken: a.blokken.map((b) => ({ stamp: b.stamp, tijd: b.tijd, tekst: b.tekst, woorden: b.woorden ?? [], duurS: b.duurS })) };
}

export function blokAudioPad(stationId, stamp) {
  const a = actief.get(stationId) ?? afgerond.get(stationId);
  const b = a?.blokken.find((x) => x.stamp === stamp);
  return b && existsSync(b.pad) ? b.pad : null;
}

export function stopLuisteren(stationId) {
  const a = actief.get(stationId);
  if (!a) return { ok: true, actief: false };
  a.gestopt = true;
  if (a.proces) a.proces.kill('SIGTERM');
  return { ok: true, actief: false };
}
