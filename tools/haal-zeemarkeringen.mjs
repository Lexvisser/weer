#!/usr/bin/env node
// 2026-09-07, op verzoek van Lex ("die platform-info is zo statisch als wat"):
// eenmalig alle zeemarkeringen met licht, misthoorn, racon of AIS-baken in
// het Nederlandse zeegebied uit OpenStreetMap/OpenSeaMap halen en als
// STATISCH bestand in het project zetten (backend/src/data/zeemarkeringen-
// nl.json, gecommit). De server leest dat bestand en ververst zelf 1x per
// maand een runtime-kopie; dit script is voor de eerste vulling en om het
// gecommitte basisbestand af en toe bij te werken.
//
// Gebruik (vanuit de projectmap, met netwerk):
//   node tools/haal-zeemarkeringen.mjs
import { exporteerZeemarkeringen, STATISCH_BESTAND } from '../backend/src/sources/zeemarkering.js';

const { aantal, doel } = await exporteerZeemarkeringen({ doel: STATISCH_BESTAND, log: (t) => console.log(t) });
console.log(`Klaar: ${aantal} markeringen in ${doel}. Commit dit bestand.`);
