// Eenmalige test (2026-09-06): mail met een keten van vier polygonen, om te
// zien of het kaartje via Geoapify-POST wél meekomt (de GET-URL gaf status
// 400 bij 3+ polygonen). Draaien op de server vanuit ~/weer-app:
//   node backend/tools/test-mailkaart.mjs
// Gebruikt een uniek id per run, dus de "al gemeld"-dedup blokkeert niet.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const hier = dirname(fileURLToPath(import.meta.url));
for (const regel of readFileSync(join(hier, '..', '.env'), 'utf-8').split('\n')) {
  const m = regel.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const { stuurMailAlarm } = await import('../src/sources/email.js');

// Vier verschoven rechthoeken rond Brevard FL (28.3N, -80.7W), elk als [[ring]] in [lat, lon].
const blok = (dlat, dlon) => [[
  [28.10 + dlat, -80.95 + dlon], [28.10 + dlat, -80.45 + dlon], [28.45 + dlat, -80.40 + dlon],
  [28.55 + dlat, -80.60 + dlon], [28.50 + dlat, -80.90 + dlon], [28.10 + dlat, -80.95 + dlon],
]];
// Tientallen tussenpunten erbij zodat de polygonen even 'zwaar' zijn als echte NWS-polygonen.
const verdicht = (poly) => [poly[0].flatMap((p, i, arr) => {
  const q = arr[(i + 1) % arr.length];
  return Array.from({ length: 12 }, (_, k) => [p[0] + (q[0] - p[0]) * k / 12, p[1] + (q[1] - p[1]) * k / 12]);
})];
const trail = [blok(0, 0), blok(0.05, 0.12), blok(0.10, 0.24), blok(0.15, 0.36)].map(verdicht);
console.log('polygoonpunten totaal:', trail.reduce((n, p) => n + p[0].length, 0));

await stuurMailAlarm({
  id: `test-mailkaart-${Date.now()}`,
  titel: '🧪 TEST – heruitgave 4 (gebied aangepast) – kaartje via POST',
  bericht: 'Testmail van test-mailkaart.mjs. Als hieronder een kaartje met vier overlappende rode vlakken staat, werkt de Geoapify-POST-route.',
  lat: 28.35, lon: -80.65,
  gebiedPolygon: trail[trail.length - 1],
  gebiedPolygonTrail: trail,
});
console.log('klaar -- check je mail en de logregel hierboven.');
