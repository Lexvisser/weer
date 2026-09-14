#!/usr/bin/env node
// 2026-09-14, op verzoek van Lex ("bouw dit maar zo" -- RWS-boeienlaag):
// eenmalig alle RWS-vaarwegmarkeringen (boeien + vaste bakens/lichten) uit
// PDOK halen en als STATISCH bestand in het project zetten
// (backend/src/data/rws-vaarwegmarkeringen-nl.json, gecommit). De server
// leest dat bestand en ververst zelf 1x per maand een runtime-kopie; dit
// script is voor de eerste vulling en om het gecommitte basisbestand af en
// toe bij te werken. Zelfde patroon als tools/haal-zeemarkeringen.mjs.
//
// Gebruik (vanuit de projectmap, met netwerk):
//   node tools/haal-vaarwegmarkeringen.mjs
import { exporteerVaarwegmarkeringen, STATISCH_BESTAND } from '../backend/src/sources/rwsVaarwegmarkeringen.js';

const { aantal, doel } = await exporteerVaarwegmarkeringen({ doel: STATISCH_BESTAND, log: (t) => console.log(t) });
console.log(`Klaar: ${aantal} markeringen in ${doel}. Commit dit bestand.`);
