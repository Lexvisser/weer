#!/usr/bin/env node
// nwr-inventarisatie.mjs — 2026-09-09. Eenmalige ronde langs alle NOAA Weather
// Radio-zenders uit frontend/data/nwr-stations.json: per zender ~12 minuten
// luisteren (ffmpeg + whisper.cpp via sources/radioLuister.js, drie tegelijk),
// tekst naar ~/radio_tekst_<ID>.txt, en aan het eind een rapport met per
// zender het aantal waarnemingen/tijdvakken, dode streams, en alle plaats-
// namen die nog niet in data/nwr-plaatsen.json staan.
//
// Draaien op lexdev-nw, als lex, vanuit ~/weer-app/backend:
//   (LET OP 2026-09-09: drie tegelijk legde de server plat — gebruik 1)
//   RADIO_MAX_TEGELIJK=1 RADIO_WHISPER_THREADS=4 nohup node tools/nwr-inventarisatie.mjs > ~/radio_inventarisatie.log 2>&1 &
// Voortgang: tail -f ~/radio_inventarisatie.log ; rapport: ~/radio_inventarisatie.txt
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { startLuisteren, luisterStatus, beschikbaar } from '../src/sources/radioLuister.js';
import { fetchRadioTekst } from '../src/sources/radioTekst.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const STATIONS = JSON.parse(readFileSync(path.join(HIER, '..', '..', 'frontend', 'data', 'nwr-stations.json'), 'utf-8')).stations;
const TEGELIJK = Number(process.env.RADIO_MAX_TEGELIJK || 1);
const DUUR_MIN = Number(process.env.RADIO_LUISTER_MIN || 12);
const RAPPORT = path.join(homedir(), 'radio_inventarisatie.txt');
const alleen = process.argv.slice(2); // optioneel: alleen deze ids

if (!beschikbaar()) { console.error('whisper.cpp of model niet gevonden'); process.exit(1); }

// onbekende plaatsnamen opvangen uit de console-uitvoer van de parser
const onbekend = new Map(); // naam -> zender
const origLog = console.log;
let huidigeParse = null;
console.log = (...a) => {
  const m = /plaats "(.+?)" onbekend/.exec(a.join(' '));
  if (m && huidigeParse) onbekend.set(`${huidigeParse}: ${m[1]}`, true);
  origLog(...a);
};

const slaap = (ms) => new Promise((r) => setTimeout(r, ms));
const tijd = () => new Date().toLocaleTimeString('nl-NL', { hour12: false });

const lijst = STATIONS.filter((s) => s.url && (!alleen.length || alleen.includes(s.id)));
console.log(`[inventarisatie] ${lijst.length} zenders, ${TEGELIJK} tegelijk, ${DUUR_MIN} min per zender → ~${Math.ceil(lijst.length / TEGELIJK) * DUUR_MIN} min`);
const resultaat = new Map();
const wachtrij = [...lijst];
const bezig = new Set();

while (wachtrij.length || bezig.size) {
  while (wachtrij.length && bezig.size < TEGELIJK) {
    const s = wachtrij.shift();
    const r = startLuisteren(s);
    if (!r.ok) { console.log(`[inventarisatie] ${tijd()} ${s.id} niet gestart: ${r.fout}`); resultaat.set(s.id, { fout: r.fout }); continue; }
    console.log(`[inventarisatie] ${tijd()} ${s.id} ${s.plaats}, ${s.staat} gestart`);
    bezig.add(s.id);
  }
  await slaap(5000);
  for (const id of [...bezig]) {
    if (!luisterStatus(id).actief) {
      bezig.delete(id);
      huidigeParse = id;
      const d = fetchRadioTekst(id);
      huidigeParse = null;
      const regels = d.regels?.length ?? 0;
      resultaat.set(id, { regels, waarnemingen: d.waarnemingen?.length ?? 0, tijdvakken: d.verwachting?.length ?? 0 });
      console.log(`[inventarisatie] ${tijd()} ${id} klaar: ${regels} regels, ${d.waarnemingen?.length ?? 0} waarnemingen, ${d.verwachting?.length ?? 0} tijdvakken`);
    }
  }
}

const uit = [];
uit.push(`NWR-inventarisatie ${new Date().toISOString()} — ${lijst.length} zenders`);
uit.push('');
uit.push('Per zender (regels tekst / waarnemingen op de kaart / tijdvakken verwachting):');
for (const s of lijst) {
  const r = resultaat.get(s.id) ?? {};
  const status = r.fout ? `NIET GESTART (${r.fout})` : (r.regels ? `${r.regels} / ${r.waarnemingen} / ${r.tijdvakken}` : 'GEEN TEKST — stream dood of stil');
  uit.push(`  ${s.id.padEnd(7)} ${(s.plaats + ', ' + s.staat).padEnd(32)} ${status}`);
}
uit.push('');
uit.push(`Onbekende plaatsnamen (${onbekend.size}) — toevoegen aan backend/src/data/nwr-plaatsen.json:`);
for (const k of [...onbekend.keys()].sort()) uit.push(`  ${k}`);
writeFileSync(RAPPORT, uit.join('\n') + '\n');
console.log(uit.join('\n'));
console.log(`[inventarisatie] rapport: ${RAPPORT}`);
process.exit(0);
