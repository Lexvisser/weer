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
import { existsSync, mkdirSync, readdirSync, rmSync, appendFileSync, statSync, renameSync } from 'node:fs';
import path from 'node:path';
import { radioBestand } from './radioTekst.js';

const FFMPEG = process.env.RADIO_FFMPEG || 'ffmpeg';
const WHISPER = process.env.RADIO_WHISPER_BIN || '/home/lex/whisper.cpp/build/bin/whisper-cli';
const MODEL = process.env.RADIO_WHISPER_MODEL || '/home/lex/whisper.cpp/models/ggml-small.en.bin';
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
  return a ? { actief: true, tot: new Date(a.tot).toISOString() } : { actief: false, tot: null };
}

export function alleLuisterStatus() {
  return Object.fromEntries([...actief.keys()].map((id) => [id, luisterStatus(id)]));
}

// Verwerkt afgeronde blokken (alle wav's behalve de nieuwste, die is nog in opname).
function verwerkBlokken(id) {
  const a = actief.get(id);
  if (!a || a.bezig) return;
  let bestanden;
  try {
    bestanden = readdirSync(a.werk).filter((f) => f.endsWith('.wav') && !f.startsWith('klaar-')).sort();
  } catch (_) {
    return;
  }
  if (bestanden.length < 2 && a.proces) return;
  const klaar = a.proces ? bestanden.slice(0, -1) : bestanden;
  const f = klaar[0];
  if (!f) return;
  a.bezig = true;
  const pad = path.join(a.werk, f);
  whisperRun(['-m', MODEL, '-f', pad, '-t', String(THREADS), '-nt'], (err, stdout) => {
    a.bezig = false;
    const stamp = f.replace(/\.wav$/, '');
    if (err) { console.warn(`[weer] radioLuister ${id}: whisper mislukt: ${err.message}`); try { rmSync(pad, { force: true }); } catch (_) { /* weg */ } }
    else {
      const tekst = String(stdout).split('\n').map((r) => r.trim()).filter(Boolean).join(' ');
      appendFileSync(radioBestand(id), `[${stamp}] ${tekst}\n`);
      // 2026-09-09: blok bewaren voor het synchroon meeluisteren — de browser
      // speelt precies dit blok af op het moment dat de tekst ervan er is.
      const klaarPad = path.join(a.werk, `klaar-${stamp}.wav`);
      try { renameSync(pad, klaarPad); a.blokken.push({ stamp, tijd: stempelNaarIso(stamp), tekst, pad: klaarPad, duurS: BLOK_S }); } catch (_) { /* dan zonder audio */ }
      while (a.blokken.length > MAX_BLOKKEN) { const oud = a.blokken.shift(); try { rmSync(oud.pad, { force: true }); } catch (_) { /* weg */ } }
    }
    setImmediate(() => verwerkBlokken(id)); // volgende blok, als dat er al is
  });
}

export function startLuisteren(station) {
  const id = station?.id;
  if (!id || !station.url) return { ok: false, fout: 'geen zender/stream' };
  if (!beschikbaar()) return { ok: false, fout: 'whisper.cpp of model niet gevonden op de server' };
  const bestaand = actief.get(id);
  if (bestaand) return { ok: true, ...luisterStatus(id), al: true };
  if (actief.size >= MAX_TEGELIJK) return { ok: false, fout: `al ${MAX_TEGELIJK} zenders aan het luisteren` };

  const werk = `/dev/shm/radio-luister-${id}`;
  try { rmSync(werk, { recursive: true, force: true }); } catch (_) { /* leeg */ }
  mkdirSync(werk, { recursive: true });
  appendFileSync(radioBestand(id), `[${stempel()}] #station ${id}\n`);

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
  const a = { proces, tot: Date.now() + LUISTER_MS, werk, bezig: false, timer: null, blokken: [] };
  actief.set(id, a);
  a.timer = setInterval(() => verwerkBlokken(id), 2000);

  const opruimen = () => {
    clearInterval(a.timer);
    a.proces = null;
    // laatste blokken nog verwerken, dan de map weg
    const rest = () => {
      if (a.bezig) { setTimeout(rest, 1000); return; }
      const over = (() => { try { return readdirSync(werk).some((f) => f.endsWith('.wav') && !f.startsWith('klaar-') && statSync(path.join(werk, f)).size > 32000); } catch (_) { return false; } })();
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
  console.log(`[weer] radioLuister ${id}: gestart, ${LUISTER_MS / 60000} min (${station.url})`);
  return { ok: true, ...luisterStatus(id) };
}

// Voor het synchroon meeluisteren: lijst van klare blokken (tijd + tekst) en
// het pad van de audio van één blok.
export function blokkenStatus(stationId) {
  const a = actief.get(stationId) ?? afgerond.get(stationId);
  if (!a) return { actief: false, tot: null, blokS: BLOK_S, blokken: [] };
  return { actief: actief.has(stationId), tot: new Date(a.tot).toISOString(), blokS: BLOK_S, blokken: a.blokken.map((b) => ({ stamp: b.stamp, tijd: b.tijd, tekst: b.tekst, duurS: b.duurS })) };
}

export function blokAudioPad(stationId, stamp) {
  const a = actief.get(stationId) ?? afgerond.get(stationId);
  const b = a?.blokken.find((x) => x.stamp === stamp);
  return b && existsSync(b.pad) ? b.pad : null;
}

export function stopLuisteren(stationId) {
  const a = actief.get(stationId);
  if (!a) return { ok: true, actief: false };
  if (a.proces) a.proces.kill('SIGTERM');
  return { ok: true, actief: false };
}
