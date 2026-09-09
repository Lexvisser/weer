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
import { existsSync, mkdirSync, readdirSync, rmSync, appendFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { radioBestand } from './radioTekst.js';

const FFMPEG = process.env.RADIO_FFMPEG || 'ffmpeg';
const WHISPER = process.env.RADIO_WHISPER_BIN || '/home/lex/whisper.cpp/build/bin/whisper-cli';
const MODEL = process.env.RADIO_WHISPER_MODEL || '/home/lex/whisper.cpp/models/ggml-small.en.bin';
const THREADS = Number(process.env.RADIO_WHISPER_THREADS || 6);
const BLOK_S = 30;
const LUISTER_MS = Number(process.env.RADIO_LUISTER_MIN || 12) * 60 * 1000;
const MAX_TEGELIJK = Number(process.env.RADIO_MAX_TEGELIJK || 2);

const actief = new Map(); // stationId -> { proces, tot, timer, werk, bezig }

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
    bestanden = readdirSync(a.werk).filter((f) => f.endsWith('.wav')).sort();
  } catch (_) {
    return;
  }
  if (bestanden.length < 2 && a.proces) return;
  const klaar = a.proces ? bestanden.slice(0, -1) : bestanden;
  const f = klaar[0];
  if (!f) return;
  a.bezig = true;
  const pad = path.join(a.werk, f);
  execFile(WHISPER, ['-m', MODEL, '-f', pad, '-t', String(THREADS), '-nt'], { timeout: 120000, maxBuffer: 1 << 20 }, (err, stdout) => {
    a.bezig = false;
    try { rmSync(pad, { force: true }); } catch (_) { /* weg is weg */ }
    if (err) console.warn(`[weer] radioLuister ${id}: whisper mislukt: ${err.message}`);
    else {
      const tekst = String(stdout).split('\n').map((r) => r.trim()).filter(Boolean).join(' ');
      if (tekst) appendFileSync(radioBestand(id), `[${f.replace(/\.wav$/, '')}] ${tekst}\n`);
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
  const a = { proces, tot: Date.now() + LUISTER_MS, werk, bezig: false, timer: null };
  actief.set(id, a);
  a.timer = setInterval(() => verwerkBlokken(id), 2000);

  const opruimen = () => {
    clearInterval(a.timer);
    a.proces = null;
    // laatste blokken nog verwerken, dan de map weg
    const rest = () => {
      if (a.bezig) { setTimeout(rest, 1000); return; }
      const over = (() => { try { return readdirSync(werk).some((f) => f.endsWith('.wav') && statSync(path.join(werk, f)).size > 32000); } catch (_) { return false; } })();
      if (over) { verwerkBlokken(id); setTimeout(rest, 1000); return; }
      try { rmSync(werk, { recursive: true, force: true }); } catch (_) { /* leeg */ }
      actief.delete(id);
      console.log(`[weer] radioLuister ${id}: klaar`);
    };
    rest();
  };
  proces.on('exit', (code) => { if (actief.get(id)?.proces === proces) { console.log(`[weer] radioLuister ${id}: ffmpeg gestopt (${code})`); opruimen(); } });
  setTimeout(() => { if (actief.get(id) === a && a.proces) a.proces.kill('SIGTERM'); }, LUISTER_MS);
  console.log(`[weer] radioLuister ${id}: gestart, ${LUISTER_MS / 60000} min (${station.url})`);
  return { ok: true, ...luisterStatus(id) };
}

export function stopLuisteren(stationId) {
  const a = actief.get(stationId);
  if (!a) return { ok: true, actief: false };
  if (a.proces) a.proces.kill('SIGTERM');
  return { ok: true, actief: false };
}
