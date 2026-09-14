// vaarCanvas.js — 14 sept 2026, stap 2 van het samenbrengen van Baken (het
// losse proefproject, zie baken-status.md) met de weer-app: 1-op-1 dezelfde
// canvas-scheepslaag die in Baken getest is tot 253.504 schepen tegelijk,
// hier ongewijzigd overgenomen. Dit bestand zelf verandert nog NIETS aan wat
// je nu op je scherm ziet -- de weer-app se app.js gebruikt 'm nog nergens,
// zie de toelichting bij verbindVaarradarWs() in app.js voor de volgende
// stappen.
//
// Werking: de canvas hangt in Leaflet's overlayPane, dezelfde pane die de
// bestaande SVG-laag ook gebruikt. Die pane wordt door Leaflet zelf via een
// CSS-transform verschoven tijdens pannen -- dus pannen an sich kost ons
// niks, we hoeven pas te hertekenen bij zoomend/moveend (of als er nieuwe
// data is). Net als Leaflet's eigen renderers tekenen we iets groter dan het
// zichtbare beeld (padding) zodat een klein beetje pannen niet meteen een
// lege rand toont voordat moveend afgaat.
// 2026-09-14, op verzoek van Lex ("We hebben vandaag dus een methode
// ontwikkeld waarmee veel objecten probleemloos tegelijk getoond kunnen
// worden. Daar wil ik ook gebruik van maken met deze objecten"): de
// RWS-vaarwegmarkeringen (18.499 boeien en vaste bakens) gebruiken deze
// zelfde laag, als TWEEDE instantie naast de schepenlaag -- daarmee verviel
// de markercluster-omweg die er eerst voor de boeien in zat. Alles wat
// hieronder met 'boei' te maken heeft is puur toegevoegd; aan de
// schepenkant is geen regel veranderd.
//
// Kleurnamen zoals RWS ze levert ("Rood", "Zwart/geel/zwart", "Rood/wit
// repeterend"). Onbekend = grijs.
const BOEI_KLEUREN = {
  rood: '#d93025', groen: '#1e8e3e', geel: '#f4c22b', wit: '#f8f8f6',
  zwart: '#1c1c1c', grijs: '#9aa0a6', blauw: '#1a73e8', oranje: '#e8710a',
};

function boeiKleurLijst(kleurTekst) {
  if (!kleurTekst) return ['#9aa0a6'];
  const lijst = String(kleurTekst)
    .replace(/repeterend/gi, '')
    .split('/')
    .map((d) => BOEI_KLEUREN[d.trim().toLowerCase()])
    .filter(Boolean);
  return lijst.length ? lijst : ['#9aa0a6'];
}

const VaarCanvasLaag = L.Layer.extend({
  options: {
    pane: 'overlayPane',
    padding: 0.2, // 20% extra rondom het zichtbare beeld, zelfde idee als Leaflets eigen renderer-padding
    rasterGrootte: 64, // px per raster-cel voor de hit-test-index (fase 4), zie zoekSchipOpContainerPunt()
  },

  onAdd() {
    // 'leaflet-zoom-animated' is Leaflets eigen klasse (zie leaflet.css):
    // elementen met die klasse krijgen een CSS-transition op hun transform
    // zodra de pane in zoom-animatie staat. Zonder deze klasse "springt"
    // een transform die wij zelf zetten in _onZoomAnim() in één keer naar
    // de eindstand i.p.v. mee te vloeien met de tegels (zie git-log 14
    // sept 2026, "hele laag apart geprojecteerd"-fix).
    this._canvas = L.DomUtil.create('canvas', 'vaar-canvas-laag leaflet-zoom-animated');
    this._ctx = this._canvas.getContext('2d');
    this.getPane().appendChild(this._canvas);
    // Fase 4: hover-/actief-ring, los van de canvas zelf (zie bestandskop).
    this._ringHover = L.DomUtil.create('div', 'vaar-canvas-ring verborgen');
    this._ringActief = L.DomUtil.create('div', 'vaar-canvas-ring vaar-canvas-ring-actief verborgen');
    this.getPane().appendChild(this._ringHover);
    this.getPane().appendChild(this._ringActief);
    this._schepen = this._schepen ?? [];
    this._hoverMmsi = this._hoverMmsi ?? null;
    this._actiefMmsi = this._actiefMmsi ?? null;
    this._posities = new Map(); // mmsi -> { mmsi, x, y, hitR } in canvas-lokale pixels, ververst bij elke _redraw()
    this._raster = new Map(); // "cx,cy" -> array van diezelfde items, voor de hit-test in zoekSchipOpContainerPunt()
    this._reset();
    return this;
  },

  onRemove() {
    L.DomUtil.remove(this._canvas);
    L.DomUtil.remove(this._ringHover);
    L.DomUtil.remove(this._ringActief);
    this._canvas = null;
    this._ctx = null;
    this._ringHover = null;
    this._ringActief = null;
  },

  getEvents() {
    return {
      moveend: this._reset,
      // GEEN zoomend hier (fase 4-optimalisatie, 14 sept 2026): app.js roept
      // bij zoomend zelf eerst herpositioneerVoorZoom() en dan
      // tekenCanvasTest() aan (zie app.js) -- dat laatste moet toch de hele
      // scheepslijst opnieuw opbouwen (de vorm/pijl/stip-keuze hangt zelf ook
      // van de zoom af), dus een aparte hertekening hier zou puur dubbel werk
      // zijn. Bij grote aantallen (Lex test met AISHub AAN, ~49.000 schepen)
      // was dat dubbele werk merkbaar: schepen "vielen laat op hun nieuwe
      // plek" bij het zoomen.
      viewreset: this._reset, // extra vangnet: dit is Leaflets eigen signaal dat de pixel-oorsprong opnieuw gezet is
      resize: this._resize,
      // Fix 14 sept 2026 ("hele laag apart geprojecteerd"): Leaflets eigen
      // renderers (L.SVG/L.Canvas) en de tegellaag luisteren zelf naar
      // 'zoomanim' om hun container-element live mee te schalen tijdens de
      // ~250ms zoom-animatie (zie Leaflet-bron: Renderer._onAnimZoom /
      // GridLayer._animateZoom). Onze canvas deed dat niet -- die bleef
      // gewoon stilstaan tot zoomend, terwijl de tegels er al omheen
      // zoomden. Vandaar dat het leek of "de hele laag apart over de zoom
      // werd geprojecteerd": dat klopte letterlijk, hij deed niet mee.
      zoomstart: this._onZoomStart,
      zoomanim: this._onZoomAnim,
    };
  },

  // Vervangt de volledige tekenset. Verwacht een array met per schip een van:
  // { mmsi, lat, lon, kleur, alpha, vorm: 'stip', straalPx }
  // { mmsi, lat, lon, kleur, alpha, vorm: 'pijl', schaal, koersGraden }
  // { mmsi, lat, lon, kleur, alpha, vorm: 'vorm', afmetingen, headingGraden }
  // Simpel en grofweg -- geen delta-verwerking hier, elke aanroep hertekent
  // alles opnieuw (bleek bij fase 1 al ruim snel genoeg bij 1x/seconde-updates).
  teken(schepen) {
    this._schepen = schepen;
    this._redraw();
  },

  // Fase 4: interactie terugzetten (gebruikt door app.js als de canvas-
  // testlaag wordt UITgezet, zodat er geen "vastgeplakte" ring overblijft
  // als de laag later weer AAN gaat).
  resetInteractie() {
    this._hoverMmsi = null;
    this._actiefMmsi = null;
  },

  zetHover(mmsi) {
    if (this._hoverMmsi === mmsi) return;
    this._hoverMmsi = mmsi;
    this._plaatsRingen();
  },

  zetActief(mmsi) {
    if (this._actiefMmsi === mmsi) return;
    this._actiefMmsi = mmsi;
    this._plaatsRingen();
  },

  // Fase 4: welk schip zit (het dichtst bij) een gegeven containerPoint
  // (zoals e.containerPoint van een Leaflet-muisevent)? Raster-index i.p.v.
  // een lineaire scan over alle schepen -- bij 50.000+ schepen scheelt dat
  // het verschil tussen een paar array-lookups en tienduizenden hypot()-
  // aanroepen per mousemove.
  zoekSchipOpContainerPunt(containerPoint) {
    if (!this._map || !this._raster) return null;
    const lp = this._map.containerPointToLayerPoint(containerPoint).subtract(this._canvasOrigin);
    const g = this.options.rasterGrootte;
    const cx = Math.floor(lp.x / g);
    const cy = Math.floor(lp.y / g);
    let beste = null;
    let besteAfstand = Infinity;
    // 3x3 buurt: een schip vlak over een celgrens moet ook nog gevonden
    // worden als de cursor net aan de andere kant van die grens staat.
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const kandidaten = this._raster.get(`${cx + dx},${cy + dy}`);
        if (!kandidaten) continue;
        for (const k of kandidaten) {
          const afstand = Math.hypot(k.x - lp.x, k.y - lp.y);
          if (afstand <= k.hitR && afstand < besteAfstand) {
            beste = k.mmsi;
            besteAfstand = afstand;
          }
        }
      }
    }
    return beste;
  },

  _resize(e) {
    this._canvas.width = e.newSize.x;
    this._canvas.height = e.newSize.y;
    this._reset();
  },

  _reset() {
    this._herberekenOorsprong();
    this._redraw();
  },

  // Fase 4-optimalisatie (14 sept 2026): losgetrokken uit _reset() zodat
  // app.js dit bij zoomend ALVAST kan aanroepen (canvas-element op de juiste
  // plek/grootte voor de nieuwe zoom) vóórdat het de scheepslijst opnieuw
  // opbouwt en tekent -- voorkomt dat er bij elke zoomstap twee keer
  // hertekend wordt (zie getEvents()).
  herpositioneerVoorZoom() {
    this._herberekenOorsprong();
  },

  _herberekenOorsprong() {
    if (!this._map || !this._canvas) return;
    const p = this.options.padding;
    const size = this._map.getSize();
    const min = this._map.containerPointToLayerPoint([0, 0]).subtract([size.x * p, size.y * p]);
    this._canvasOrigin = min; // linksboven van de canvas, in Leaflets layer-point-coördinaten
    this._canvas.width = Math.ceil(size.x * (1 + 2 * p));
    this._canvas.height = Math.ceil(size.y * (1 + 2 * p));
    // setPosition zet transform op translate3d(...) ZONDER scale-deel, dus
    // dit is meteen ook de "reset naar schaal 1" na afloop van een
    // zoom-animatie (zie _onZoomAnim hieronder).
    L.DomUtil.setPosition(this._canvas, min);
    // Onthouden bij welk midden/welke zoom dit canvas-element nu correct
    // staat -- _onZoomAnim heeft dit referentiepunt nodig om de
    // tussentijdse schaal/verschuiving tijdens de volgende zoom-animatie
    // te berekenen (zelfde aanpak als Leaflets eigen Renderer._center/_zoom).
    this._middenBijHerberekening = this._map.getCenter();
    this._zoomBijHerberekening = this._map.getZoom();
  },

  // Fix 14 sept 2026: wordt aangeroepen bij zoomstart. De hover-/actief-ring
  // zijn los gepositioneerde div's (geen deel van de canvas-transform) --
  // die zouden tijdens de animatie op hun oude plek blijven "plakken".
  // Simpelweg verbergen tot _redraw() ze na zoomend weer neerzet is
  // eenvoudiger en veiliger dan ze ook los mee laten schalen.
  _onZoomStart() {
    if (this._ringHover) L.DomUtil.addClass(this._ringHover, 'verborgen');
    if (this._ringActief) L.DomUtil.addClass(this._ringActief, 'verborgen');
  },

  // Fix 14 sept 2026 ("hele laag apart geprojecteerd"): tijdens een
  // geanimeerde zoom past Leaflet zelf GEEN schaal toe op onze canvas --
  // elke laag moet dat voor zichzelf doen door naar 'zoomanim' te
  // luisteren (zo doen L.SVG/L.Canvas en de tegellaag het ook, zie
  // Leaflet-bron Renderer._onAnimZoom/_updateTransform). Deze methode is
  // vrijwel 1-op-1 diezelfde berekening, toegepast op ons canvas-element:
  // we zetten in één keer de transform die hoort bij de DOELzoom/-center
  // van de animatie; de 'leaflet-zoom-animated' klasse (zie onAdd) zorgt
  // dat de browser dat via een CSS-transition over dezelfde ~250ms laat
  // meevloeien als de tegels, i.p.v. dat het instant springt.
  _onZoomAnim(e) {
    if (!this._map || !this._canvas || this._zoomBijHerberekening == null) return;
    const map = this._map;
    const schaal = map.getZoomScale(e.zoom, this._zoomBijHerberekening);
    const kijkHelft = map.getSize().multiplyBy(0.5 + this.options.padding);
    const huidigMidden = map.project(this._middenBijHerberekening, e.zoom);
    const doelMidden = map.project(e.center, e.zoom);
    const middenVerschil = doelMidden.subtract(huidigMidden);
    const linksBovenOffset = kijkHelft
      .multiplyBy(-schaal)
      .add(this._canvasOrigin)
      .add(kijkHelft)
      .subtract(middenVerschil);
    L.DomUtil.setTransform(this._canvas, linksBovenOffset, schaal);
  },

  _redraw() {
    if (!this._ctx || !this._map) return;
    const ctx = this._ctx;
    const zoom = this._map.getZoom();
    ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    const g = this.options.rasterGrootte;
    this._posities = new Map();
    this._raster = new Map();
    // 20px marge i.p.v. 10: een groot geschaald pijl-icoon (schaal tot 2.2x)
    // of een grote ware-grootte-vorm steekt verder uit zijn eigen lat/lon-punt
    // dan de oude vaste stip.
    for (const s of this._schepen) {
      const lp = this._map.latLngToLayerPoint([s.lat, s.lon]).subtract(this._canvasOrigin);
      if (lp.x < -20 || lp.y < -20 || lp.x > this._canvas.width + 20 || lp.y > this._canvas.height + 20) continue;
      ctx.fillStyle = s.kleur;
      ctx.globalAlpha = s.alpha ?? 1;
      let hitR;
      if (s.vorm === 'vorm' && s.afmetingen && typeof s.headingGraden === 'number') {
        hitR = this._tekenVorm(ctx, lp.x, lp.y, s.afmetingen, s.headingGraden, this._pixelsPerMeter(s.lat, zoom));
      } else if (s.vorm === 'pijl' && typeof s.koersGraden === 'number') {
        hitR = this._tekenPijl(ctx, lp.x, lp.y, s.schaal ?? 1, s.koersGraden);
      } else if (s.vorm === 'boei' && s.boei) {
        hitR = this._tekenBoei(ctx, lp.x, lp.y, s.boei, zoom);
      } else {
        const straalPx = s.straalPx ?? 4;
        ctx.beginPath();
        ctx.arc(lp.x, lp.y, straalPx, 0, Math.PI * 2);
        ctx.fill();
        hitR = straalPx + 3; // iets ruimer dan de zichtbare stip, anders is een stip nauwelijks te raken
      }
      // 2026-09-14: `id` als alternatief voor `mmsi`, zodat deze laag ook
      // voor niet-schepen (de RWS-boeien) te gebruiken is zonder dat de
      // schepenkant iets merkt -- die levert gewoon `mmsi` en geen `id`.
      const sleutel = s.id ?? s.mmsi;
      if (sleutel != null) {
        const item = { mmsi: sleutel, x: lp.x, y: lp.y, hitR };
        this._posities.set(sleutel, item);
        const cx = Math.floor(lp.x / g);
        const cy = Math.floor(lp.y / g);
        const key = `${cx},${cy}`;
        let lijst = this._raster.get(key);
        if (!lijst) {
          lijst = [];
          this._raster.set(key, lijst);
        }
        lijst.push(item);
      }
    }
    ctx.globalAlpha = 1;
    this._plaatsRingen();
  },

  // Fase 4: hover-/actief-ring op hun huidige positie zetten (of verbergen
  // als hun mmsi niet meer in de laatste _redraw() voorkwam -- bijv. het
  // schip is buiten het scherm gevaren, of verborgen door een filter).
  _plaatsRingen() {
    this._plaatsEenRing(this._ringHover, this._hoverMmsi);
    this._plaatsEenRing(this._ringActief, this._actiefMmsi);
  },

  _plaatsEenRing(el, mmsi) {
    if (!el) return;
    const item = mmsi != null ? this._posities.get(mmsi) : null;
    if (!item) {
      L.DomUtil.addClass(el, 'verborgen');
      return;
    }
    L.DomUtil.removeClass(el, 'verborgen');
    const straal = item.hitR + 4; // net iets ruimer dan de hit-radius, zodat de ring zichtbaar om het icoon heen valt
    el.style.width = `${straal * 2}px`;
    el.style.height = `${straal * 2}px`;
    L.DomUtil.setPosition(el, this._canvasOrigin.add(L.point(item.x - straal, item.y - straal)));
  },

  // Standaard Web Mercator-formule (tegelgrootte 256px) voor meters-per-pixel
  // op een gegeven breedtegraad/zoom -- zelfde cos(lat)-correctie als de
  // weer-app gebruikt bij het omrekenen van meters naar graden, hier
  // toegepast op pixels i.p.v. graden zodat we in canvas-pixelruimte kunnen
  // tekenen/roteren (Web Mercator is hoektrouw, dus deze schaal geldt lokaal
  // even sterk in beide richtingen -- geen aparte breedte/lengte-correctie
  // nodig zoals bij een losse lat/lon-berekening).
  _pixelsPerMeter(lat, zoom) {
    const metersPerPixel = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
    return 1 / metersPerPixel;
  },

  // Geroteerd chevron-icoon (spitse boeg, lichte inkeping in de achtersteven),
  // wijzend "omhoog" (noord) vóór rotatie -- canvas roteert kloksgewijs bij een
  // positieve hoek, precies zoals een kompaskoers (0°=noord, 90°=oost) werkt,
  // dus koersGraden kan zo direct als rotatiehoek gebruikt worden.
  // Retourneert de hit-radius (fase 4) zodat _redraw() die kan opslaan.
  _tekenPijl(ctx, x, y, schaal, koersGraden) {
    const basis = 7; // px vanuit het centrum tot de boeg-punt, bij de kleinste schaal (1.25)
    const halfLengte = basis * schaal;
    const halfBreedte = halfLengte * 0.55;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((koersGraden * Math.PI) / 180);
    ctx.beginPath();
    ctx.moveTo(0, -halfLengte); // boeg
    ctx.lineTo(halfBreedte, halfLengte * 0.6); // stuurboord-achter
    ctx.lineTo(0, halfLengte * 0.25); // inkeping in de achtersteven (chevron-vorm)
    ctx.lineTo(-halfBreedte, halfLengte * 0.6); // bakboord-achter
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    return Math.hypot(halfBreedte, halfLengte);
  },

  // 2026-09-14: RWS-vaarwegmarkering in zeekaartvorm. Drie detailniveaus,
  // puur op zoom -- er wordt NIETS weggelaten of geclusterd (uitdrukkelijke
  // keuze van Lex), alleen minder detail als je ver uitgezoomd bent, anders
  // wordt het bij 18.499 objecten een soep van stippen.
  //   < 9  : stipje in de hoofdkleur
  //   9-10 : silhouet (stomp/spits/bol/spar/baken) met kleurbanden
  //   >= 11: idem + lichtvlek
  //   >= 12: idem + topteken (kardinale kegels e.d.)
  _tekenBoei(ctx, x, y, b, zoom) {
    const kleuren = boeiKleurLijst(b.kleur);
    if (zoom < 9) {
      ctx.fillStyle = kleuren[0];
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
      return 4;
    }
    const lichtAan = zoom >= 11;
    const toptekenAan = zoom >= 12;
    const h = toptekenAan ? 12 : 8;
    const vorm = (b.vorm || '').toLowerCase();
    const functie = (b.functie || '').toLowerCase();
    let w = h * 0.7;

    // Het silhouet. Als losse functie omdat we hem twee keer nodig hebben:
    // eerst om de kleurbanden binnen te clippen, daarna om te omlijnen.
    const pad = () => {
      ctx.beginPath();
      if (!b.drijvend) {
        if (functie.includes('krib')) {
          w = h * 0.5; // kribbaken: klein vierkantje, er staan er honderden langs de rivieren
          ctx.rect(x - w / 2, y - w / 2, w, w);
        } else {
          w = h * 0.8; // vast baken/licht: driehoek
          ctx.moveTo(x, y - h / 2);
          ctx.lineTo(x + w / 2, y + h / 2);
          ctx.lineTo(x - w / 2, y + h / 2);
          ctx.closePath();
        }
      } else if (vorm === 'spits') {
        w = h * 0.8; // kegelboei (stuurboord)
        ctx.moveTo(x, y - h / 2);
        ctx.lineTo(x + w / 2, y + h / 2);
        ctx.lineTo(x - w / 2, y + h / 2);
        ctx.closePath();
      } else if (vorm === 'bol') {
        w = h * 0.85; // bolboei (veilig vaarwater)
        ctx.arc(x, y, w / 2, 0, Math.PI * 2);
      } else if (vorm === 'spar' || vorm === 'paal') {
        w = h * 0.3; // sparboei: dun paaltje, veruit de grootste groep
        ctx.rect(x - w / 2, y - h / 2, w, h);
      } else if (vorm === 'pilaar') {
        w = h * 0.45;
        ctx.rect(x - w / 2, y - h / 2, w, h);
      } else {
        w = h * 0.7; // stomp (bakboord), ton, afwijkend
        ctx.rect(x - w / 2, y - h / 2, w, h);
      }
    };

    pad();
    ctx.save();
    ctx.clip();
    if (kleuren.length > 1 && b.kleurpatroon) {
      // Echte banden i.p.v. alleen de eerste kleur: zo is een kardinaal
      // (zwart/geel/zwart) of een veilig-vaarwaterboei (rood/wit) te zien.
      const horizontaal = /horiz/i.test(b.kleurpatroon);
      const n = kleuren.length;
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = kleuren[i];
        if (horizontaal) ctx.fillRect(x - w, y - h / 2 + (h / n) * i, w * 2, h / n + 0.5);
        else ctx.fillRect(x - w / 2 + (w / n) * i, y - h, w / n + 0.5, h * 2);
      }
    } else {
      ctx.fillStyle = kleuren[0];
      ctx.fillRect(x - w, y - h, w * 2, h * 2);
    }
    ctx.restore();
    // Omlijning: zonder dit zijn de 6.160 witte en de gele objecten
    // onzichtbaar op een lichte ondergrond.
    pad();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.stroke();

    if (toptekenAan && b.topteken) this._tekenTopteken(ctx, x, y - h / 2 - 1.5, b);
    if (lichtAan && b.lichtkarakter) {
      // Lichtvlek rechtsboven, in de werkelijke lichtkleur; magenta als de
      // kleur onbekend is (dat is ook de kleur die de zeekaart gebruikt).
      const lk = b.lichtkleur ? boeiKleurLijst(b.lichtkleur)[0] : '#ff2fd0';
      const lx = x + w / 2 + 2;
      const ly = y - h / 2 + 1.5;
      ctx.save();
      ctx.fillStyle = lk;
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.arc(lx, ly, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(lx, ly, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 0.7;
      ctx.stroke();
      ctx.restore();
    }
    return Math.max(w, h) / 2 + 4;
  },

  // Topteken boven de boei. De kardinale tekens zijn het hele punt: twee
  // kegels met de punten omhoog = noord, omlaag = zuid, van elkaar af =
  // oost, naar elkaar toe = west.
  _tekenTopteken(ctx, x, yBasis, b) {
    const t = (b.topteken || '').toLowerCase();
    const kl = boeiKleurLijst(b.toptekenKleur)[0];
    // Bewust klein gehouden: bij een sparboei (breedte ~3,5 px) werd een
    // topteken van 4 px een dikke zwarte pijl die het silhouet overstemde.
    const s = 3.2;
    ctx.save();
    ctx.fillStyle = kl;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 0.5;
    const kegel = (cy, omhoog) => {
      ctx.beginPath();
      if (omhoog) {
        ctx.moveTo(x, cy - s / 2);
        ctx.lineTo(x + s / 2, cy + s / 2);
        ctx.lineTo(x - s / 2, cy + s / 2);
      } else {
        ctx.moveTo(x, cy + s / 2);
        ctx.lineTo(x + s / 2, cy - s / 2);
        ctx.lineTo(x - s / 2, cy - s / 2);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    };
    const bolletje = (cy) => {
      ctx.beginPath();
      ctx.arc(x, cy, s * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    };
    const onder = yBasis - s * 0.45;
    const boven = yBasis - s * 1.35;
    if (/2 kegels/.test(t)) {
      if (/naar boven/.test(t)) { kegel(onder, true); kegel(boven, true); } // noord
      else if (/naar beneden/.test(t)) { kegel(onder, false); kegel(boven, false); } // zuid
      else if (/van elkaar/.test(t)) { kegel(onder, false); kegel(boven, true); } // oost
      else { kegel(onder, true); kegel(boven, false); } // west (punten naar elkaar)
    } else if (/kegel boven bol/.test(t)) {
      bolletje(onder); kegel(boven, true);
    } else if (/kegel/.test(t)) {
      kegel(onder, !/naar beneden/.test(t));
    } else if (/cilinder/.test(t)) {
      ctx.beginPath();
      ctx.rect(x - s / 2, onder - s / 2, s, s);
      ctx.fill();
      ctx.stroke();
    } else if (/bol/.test(t)) {
      bolletje(onder);
    } else if (/kruis/.test(t)) {
      ctx.beginPath();
      ctx.moveTo(x - s / 2, onder - s / 2);
      ctx.lineTo(x + s / 2, onder + s / 2);
      ctx.moveTo(x + s / 2, onder - s / 2);
      ctx.lineTo(x - s / 2, onder + s / 2);
      ctx.strokeStyle = kl;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    ctx.restore();
  },

  // Ware-grootte scheepsvorm (fase 3): een vijfhoek (rechthoek met spitse
  // boeg) uit de AIS-afmetingen (boeg/hek/bakboord/stuurboord, gemeten vanaf
  // de GPS-antenne, dus NIET per se symmetrisch rond het gemelde punt),
  // geroteerd op headingGraden (ware koers -- NIET koers-over-grond, want een
  // stilliggend of drijvend schip se COG zegt niets over waar de boeg heen
  // wijst). Zelfde lokale as-conventie als _tekenPijl: -y = boeg/voorwaarts,
  // +x = stuurboord, vóór rotatie.
  // Retourneert de hit-radius (fase 4) zodat _redraw() die kan opslaan --
  // een cirkel rond het centrum die de hele (mogelijk asymmetrische) vorm
  // ruim dekt, precisie is hier minder belangrijk dan een simpele, snelle
  // hit-test.
  _tekenVorm(ctx, x, y, afmetingen, headingGraden, pixelsPerMeter) {
    const boegPx = afmetingen.boeg * pixelsPerMeter;
    const hekPx = afmetingen.hek * pixelsPerMeter;
    const bbPx = afmetingen.bakboord * pixelsPerMeter;
    const sbPx = afmetingen.stuurboord * pixelsPerMeter;
    // De spitse boeg begint op 20% van de totale lengte terug vanaf de punt
    // (nooit verder terug dan de boeg-afstand zelf, anders klapt de vorm om
    // bij een schip met een heel kleine "boeg"-afmeting).
    const taperPx = Math.min((boegPx + hekPx) * 0.2, boegPx * 0.9);
    const middenX = (sbPx - bbPx) / 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((headingGraden * Math.PI) / 180);
    ctx.beginPath();
    ctx.moveTo(-bbPx, hekPx); // achtersteven, bakboord
    ctx.lineTo(-bbPx, -(boegPx - taperPx)); // begin spitse boeg, bakboord
    ctx.lineTo(middenX, -boegPx); // boeg-punt, gecentreerd op de rompbreedte
    ctx.lineTo(sbPx, -(boegPx - taperPx)); // begin spitse boeg, stuurboord
    ctx.lineTo(sbPx, hekPx); // achtersteven, stuurboord
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    return Math.hypot(Math.max(boegPx, hekPx), Math.max(bbPx, sbPx));
  },
});

function nieuweVaarCanvasLaag() {
  return new VaarCanvasLaag();
}
