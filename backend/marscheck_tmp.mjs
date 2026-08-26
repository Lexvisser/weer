import * as Astronomy from 'astronomy-engine';

const lat = 51.8200, lon = 4.4303; // Lex' echte HOME_LAT/HOME_LON
const observer = new Astronomy.Observer(lat, lon, 0);
const nu = new Date();
console.log('Nu (UTC):', nu.toISOString());
console.log('Nu (lokaal, Europe/Amsterdam):', nu.toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' }));

const body = Astronomy.Body.Mars;
const equator = Astronomy.Equator(body, nu, observer, true, true);
const horizon = Astronomy.Horizon(nu, observer, equator.ra, equator.dec, 'normal');
console.log(`Mars nu: az=${horizon.azimuth.toFixed(1)} el=${horizon.altitude.toFixed(1)}`);

const op = Astronomy.SearchRiseSet(body, observer, 1, nu, 2);
const onder = Astronomy.SearchRiseSet(body, observer, -1, nu, 2);
console.log('Volgende opkomst (lokaal):', op ? op.date.toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' }) : null);
console.log('Volgende ondergang (lokaal):', onder ? onder.date.toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' }) : null);

// ook de vorige ondergang/opkomst (24u terug zoeken) voor context
const gisteren = new Date(nu.getTime() - 24*60*60*1000);
const opVoor = Astronomy.SearchRiseSet(body, observer, 1, gisteren, 2);
const onderVoor = Astronomy.SearchRiseSet(body, observer, -1, gisteren, 2);
console.log('Opkomst rond vandaag (lokaal):', opVoor ? opVoor.date.toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' }) : null);
console.log('Ondergang rond vandaag (lokaal):', onderVoor ? onderVoor.date.toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' }) : null);
