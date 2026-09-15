// passageBaanAfbeelding.js — het baan-plaatje van een satellietpassage als
// PNG, voor in de mail (2026-09-15, op verzoek van Lex: "de grafische
// weergave van de baan daar op"). Server-side tegenhanger van
// passageBaanSvg() in frontend/app.js: zelfde hemelkaart-projectie (rand =
// horizon, midden = zenit, ringen 30°/60°), zelfde stijl (groene cirkel met
// gloed, lichte baan, gestippeld in de aardschaduw, markers met tijden,
// zijaanzicht, tabel). Bewust een aparte kopie i.p.v. code delen met de
// frontend: die leunt op CSS-klassen en het DOM; hier moet alles inline
// zodat resvg 'm zonder stylesheet kan rasteren.
//
// Rasteren gebeurt met @resvg/resvg-js (kant-en-klaar binair, geen
// compilatie). Ontbreekt die module of faalt het rasteren, dan geeft
// maakPassageBaanPng() null terug en gaat de mail gewoon zonder plaatje —
// een tijdkritieke melding mag hier nooit op stuklopen.
const B = 250; // breedte viewBox
const H = 385; // hoogte viewBox (hemelkaart + zijaanzicht + tabel)
const C = 125;
const CY = 104;
const R = 86;
const PROFIEL_Y0 = 222;
const PROFIEL_H = 60;
const PROFIEL_X0 = 40;
const PROFIEL_X1 = 220;
const TABEL_Y0 = 326;
const GROEN = '#39ff88';
const FONT = 'DejaVu Sans Mono, Menlo, Consolas, monospace';

function positie(az, el) {
  const e = Math.max(0, Math.min(90, el));
  const r = R * (1 - e / 90);
  const rad = (az * Math.PI) / 180;
  return { x: C + r * Math.sin(rad), y: CY - r * Math.cos(rad) };
}

function klokVan(startIso, seconden) {
  return new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' }).format(
    new Date(new Date(startIso).getTime() + seconden * 1000)
  );
}
function klokIso(iso) {
  return new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Amsterdam' }).format(new Date(iso));
}

function segmenten(punten) {
  const uit = [];
  let huidig = null;
  punten.forEach((p, i) => {
    const zichtbaar = p[3] === 1;
    if (!huidig || huidig.zichtbaar !== zichtbaar) {
      huidig = { zichtbaar, punten: i > 0 ? [punten[i - 1], p] : [p] };
      uit.push(huidig);
    } else huidig.punten.push(p);
  });
  return uit;
}
function pad(punten, naarXY) {
  return punten.map((p, i) => { const { x, y } = naarXY(p); return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`; }).join(' ');
}
const label = (x, y, tekst, anker = 'start', kleur = '#eaf6ff', grootte = 8.5) =>
  `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anker}" font-family="${FONT}" font-size="${grootte}" fill="${kleur}" stroke="#0c0f1a" stroke-width="2.5" stroke-linejoin="round" paint-order="stroke">${tekst}</text>`;
const as = (x, y, tekst, anker = 'start', kleur = '#7d8399') =>
  `<text x="${x}" y="${y}" text-anchor="${anker}" font-family="${FONT}" font-size="7.5" fill="${kleur}">${tekst}</text>`;

export function maakPassageBaanSvg(traject) {
  const baan = traject?.baan;
  if (!Array.isArray(baan) || baan.length < 2 || !traject.start) return null;
  const klok = (sec) => klokVan(traject.start, sec);
  const boven = baan.filter((p) => p[1] >= 0);
  const totaalSec = baan[baan.length - 1][0] || 1;
  const naarKaart = (p) => positie(p[2], p[1]);
  const naarProfiel = (p) => ({
    x: PROFIEL_X0 + ((PROFIEL_X1 - PROFIEL_X0) * p[0]) / totaalSec,
    y: PROFIEL_Y0 + PROFIEL_H * (1 - Math.max(0, Math.min(90, p[1])) / 90),
  });

  const lijnen = segmenten(boven)
    .map((seg) => {
      const stijl = seg.zichtbaar
        ? 'stroke="#eaf6ff" stroke-width="2.2" filter="url(#gloed)"'
        : 'stroke="rgba(234,246,255,0.35)" stroke-width="1.2" stroke-dasharray="2 4"';
      return `<path d="${pad(seg.punten, naarKaart)}" fill="none" stroke-linecap="round" stroke-linejoin="round" ${stijl}/>` +
        `<path d="${pad(seg.punten, naarProfiel)}" fill="none" stroke-linecap="round" stroke-linejoin="round" ${stijl}/>`;
    })
    .join('');

  const zichtbare = boven.filter((p) => p[3] === 1);
  const markers = [];
  let topProfiel = null;
  if (zichtbare.length) {
    const eerste = zichtbare[0];
    const laatste = zichtbare[zichtbare.length - 1];
    const top = boven.reduce((a, b) => (b[1] > a[1] ? b : a));
    const kant = (m) => ({ dx: m.x < C ? -7 : 7, dy: m.y < CY ? -6 : 12, anker: m.x < C ? 'end' : 'start' });
    const m1 = naarKaart(eerste), k1 = kant(m1);
    markers.push(`<circle cx="${m1.x.toFixed(1)}" cy="${m1.y.toFixed(1)}" r="3" fill="#5df7ff"/>${label(m1.x + k1.dx, m1.y + k1.dy, klok(eerste[0]), k1.anker)}`);
    const mt = naarKaart(top), kt = kant(mt);
    markers.push(`<circle cx="${mt.x.toFixed(1)}" cy="${mt.y.toFixed(1)}" r="3.4" fill="#0c0f1a" stroke="#ffd75e" stroke-width="1.6"/>${label(mt.x + kt.dx, mt.y + kt.dy, `${Math.round(top[1])}° ${klok(top[0])}`, kt.anker)}`);
    const m2 = naarKaart(laatste), k2 = kant(m2);
    if (Math.hypot(m2.x - m1.x, m2.y - m1.y) < 40 && Math.abs(k2.dy - k1.dy) < 1) k2.dy += k2.dy < 0 ? -10 : 10;
    const kruis = (x, y, s) => `<path d="M${(x - s).toFixed(1)} ${(y - s).toFixed(1)} L${(x + s).toFixed(1)} ${(y + s).toFixed(1)} M${(x - s).toFixed(1)} ${(y + s).toFixed(1)} L${(x + s).toFixed(1)} ${(y - s).toFixed(1)}" stroke="#ff9f6e" stroke-width="1.6" stroke-linecap="round"/>`;
    markers.push(`${traject.dooftUit ? kruis(m2.x, m2.y, 4) : `<circle cx="${m2.x.toFixed(1)}" cy="${m2.y.toFixed(1)}" r="3" fill="#5df7ff"/>`}${label(m2.x + k2.dx, m2.y + k2.dy, klok(laatste[0]), k2.anker)}`);
    const p1 = naarProfiel(eerste), pt = naarProfiel(top), p2 = naarProfiel(laatste);
    topProfiel = { x: pt.x, y: pt.y, klok: klok(top[0]) };
    markers.push(`<circle cx="${p1.x.toFixed(1)}" cy="${p1.y.toFixed(1)}" r="2.6" fill="#5df7ff"/>`);
    markers.push(`<circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="3" fill="#0c0f1a" stroke="#ffd75e" stroke-width="1.5"/>`);
    markers.push(traject.dooftUit ? kruis(p2.x, p2.y, 3.5) : `<circle cx="${p2.x.toFixed(1)}" cy="${p2.y.toFixed(1)}" r="2.6" fill="#5df7ff"/>`);
    if (zichtbare.length > 3) {
      const i = Math.floor(zichtbare.length / 2);
      const a = naarKaart(zichtbare[i - 1]), b = naarKaart(zichtbare[i + 1]), m = naarKaart(zichtbare[i]);
      const hoek = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      markers.push(`<path d="M-5 -3.5 L1.5 0 L-5 3.5 Z" fill="#eaf6ff" transform="translate(${m.x.toFixed(1)} ${m.y.toFixed(1)}) rotate(${hoek.toFixed(1)})"/>`);
    }
  }

  const ring = (el) => `<circle cx="${C}" cy="${CY}" r="${(R * (1 - el / 90)).toFixed(1)}" fill="none" stroke="rgba(57,255,136,0.16)" stroke-width="1" stroke-dasharray="2 4"/>`;
  const windroos = ['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW']
    .map((naam, i) => { const { x, y } = positie(i * 45, -17); const tussen = i % 2 === 1; return `<text x="${x.toFixed(1)}" y="${(y + 3.5).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="${tussen ? 8 : 9.5}" font-weight="${tussen ? 'normal' : 'bold'}" fill="${tussen ? 'rgba(57,255,136,0.6)' : GROEN}">${naam}</text>`; })
    .join('');
  const streepjes = Array.from({ length: 16 }, (_, i) => { const a = positie(i * 22.5, 0), b = positie(i * 22.5, i % 4 === 0 ? -6 : -3); return `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="rgba(57,255,136,0.55)" stroke-width="1"/>`; }).join('');
  const py = (el) => (PROFIEL_Y0 + PROFIEL_H * (1 - el / 90)).toFixed(1);

  const profiel = `
    <line x1="${PROFIEL_X0}" y1="${PROFIEL_Y0 + PROFIEL_H}" x2="${PROFIEL_X1}" y2="${PROFIEL_Y0 + PROFIEL_H}" stroke="${GROEN}" stroke-width="1.2" filter="url(#groeneGloed)"/>
    <line x1="${PROFIEL_X0}" y1="${py(30)}" x2="${PROFIEL_X1}" y2="${py(30)}" stroke="rgba(57,255,136,0.16)" stroke-width="1" stroke-dasharray="2 4"/>
    <line x1="${PROFIEL_X0}" y1="${py(60)}" x2="${PROFIEL_X1}" y2="${py(60)}" stroke="rgba(57,255,136,0.16)" stroke-width="1" stroke-dasharray="2 4"/>
    ${as(PROFIEL_X0 - 4, PROFIEL_Y0 + PROFIEL_H + 3, '0°', 'end')}${as(PROFIEL_X0 - 4, Number(py(30)) + 3, '30°', 'end')}${as(PROFIEL_X0 - 4, Number(py(60)) + 3, '60°', 'end')}${as(PROFIEL_X0 - 4, PROFIEL_Y0 + 3, '90°', 'end')}
    ${as(PROFIEL_X0, PROFIEL_Y0 + PROFIEL_H + 13, klok(baan[0][0]))}${as(PROFIEL_X1, PROFIEL_Y0 + PROFIEL_H + 13, klok(baan[baan.length - 1][0]), 'end')}
    ${as((PROFIEL_X0 + PROFIEL_X1) / 2, PROFIEL_Y0 - 8, 'hoogte boven de horizon in de tijd', 'middle')}
    ${topProfiel ? `<line x1="${topProfiel.x.toFixed(1)}" y1="${topProfiel.y.toFixed(1)}" x2="${topProfiel.x.toFixed(1)}" y2="${PROFIEL_Y0 + PROFIEL_H}" stroke="rgba(255,215,94,0.35)" stroke-width="1" stroke-dasharray="2 3"/>${as(topProfiel.x.toFixed(1), PROFIEL_Y0 + PROFIEL_H + 13, topProfiel.klok, 'middle', '#ffd75e')}` : ''}`;

  // Tabel: zichtbaar vanaf / hoogste punt / in schaduw of ondergang
  const rijen = [
    ['Zichtbaar vanaf', traject.beginZicht],
    ['Hoogste punt', traject.max],
    [traject.dooftUit ? 'In schaduw' : 'Ondergang', traject.eindeZicht],
  ].filter(([, m]) => m);
  const kol = [10, 84, 132, 180, 242];
  const tabel = rijen.length
    ? `${as(kol[1], TABEL_Y0, 'TIJD')}${as(kol[2], TABEL_Y0, 'RICHTING')}${as(kol[3], TABEL_Y0, 'HOOGTE')}${as(kol[4], TABEL_Y0, 'AFSTAND', 'end')}` +
      rijen.map(([naam, m], i) => { const y = TABEL_Y0 + 16 + i * 15; return `${as(kol[0], y, naam, 'start', '#5df7ff')}${as(kol[1], y, klokIso(m.tijd), 'start', '#c9d1e6')}${as(kol[2], y, `${m.az}° (${m.richting})`, 'start', '#c9d1e6')}${as(kol[3], y, `${m.el}°`, 'start', '#c9d1e6')}${as(kol[4], y, `${m.afstandKm} km`, 'end', '#c9d1e6')}`; }).join('')
    : '';
  const legenda = as(B / 2, TABEL_Y0 - 24, 'rand = horizon · midden = recht boven je', 'middle') +
    as(B / 2, TABEL_Y0 - 14, `━ zichtbaar · ┅ in aardschaduw${traject.dooftUit ? ' · ✕ dooft uit' : ''}`, 'middle');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${B} ${H}" width="${B * 3}" height="${H * 3}">
    <defs>
      <filter id="gloed" filterUnits="userSpaceOnUse" x="0" y="0" width="${B}" height="${H}"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <filter id="groeneGloed" filterUnits="userSpaceOnUse" x="0" y="0" width="${B}" height="${H}"><feGaussianBlur stdDeviation="3.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <radialGradient id="hemel" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#151a2e"/><stop offset="100%" stop-color="#0a0d18"/></radialGradient>
    </defs>
    <rect width="${B}" height="${H}" fill="#0c0f1a"/>
    <circle cx="${C}" cy="${CY}" r="${R}" fill="url(#hemel)"/>
    <circle cx="${C}" cy="${CY}" r="${R}" fill="none" stroke="${GROEN}" stroke-width="1.4" filter="url(#groeneGloed)"/>
    ${ring(30)}${ring(60)}
    <line x1="${C}" y1="${CY - R}" x2="${C}" y2="${CY + R}" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>
    <line x1="${C - R}" y1="${CY}" x2="${C + R}" y2="${CY}" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>
    ${as(C + 3, (CY - R * (1 - 30 / 90) - 2).toFixed(1), '30°')}${as(C + 3, (CY - R * (1 - 60 / 90) - 2).toFixed(1), '60°')}
    ${streepjes}${windroos}${lijnen}${markers.join('')}${profiel}${legenda}${tabel}
  </svg>`;
}

let resvgModule = null;
let resvgWaarschuwingGelogd = false;
export async function maakPassageBaanPng(traject) {
  const svg = maakPassageBaanSvg(traject);
  if (!svg) return null;
  try {
    if (!resvgModule) resvgModule = await import('@resvg/resvg-js');
    const { Resvg } = resvgModule;
    const r = new Resvg(svg, { fitTo: { mode: 'width', value: B * 3 }, font: { loadSystemFonts: true, defaultFontFamily: 'DejaVu Sans Mono' } });
    return Buffer.from(r.render().asPng());
  } catch (err) {
    if (!resvgWaarschuwingGelogd) {
      resvgWaarschuwingGelogd = true;
      console.error('[weer] passage-baan-PNG mislukt (mail gaat zonder plaatje):', err.message ?? err);
    }
    return null;
  }
}
