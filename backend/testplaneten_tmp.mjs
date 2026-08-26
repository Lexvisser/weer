import * as Astronomy from 'astronomy-engine';

const lat = 52.0907, lon = 5.1214;
const observer = new Astronomy.Observer(lat, lon, 0);
const nu = new Date();
console.log('Tijd (UTC):', nu.toISOString());
console.log('Observer:', JSON.stringify(observer));

const PLANETEN = [
  ['Mercurius', Astronomy.Body.Mercury],
  ['Venus', Astronomy.Body.Venus],
  ['Mars', Astronomy.Body.Mars],
  ['Jupiter', Astronomy.Body.Jupiter],
  ['Saturnus', Astronomy.Body.Saturn],
];

for (const [naam, body] of PLANETEN) {
  const equator = Astronomy.Equator(body, nu, observer, true, true);
  const horizon = Astronomy.Horizon(nu, observer, equator.ra, equator.dec, 'normal');
  const illum = Astronomy.Illumination(body, nu);
  console.log(`${naam}: az=${horizon.azimuth.toFixed(1)} el=${horizon.altitude.toFixed(1)} mag=${illum.mag.toFixed(2)} ra=${equator.ra.toFixed(2)} dec=${equator.dec.toFixed(2)}`);
}
