// NASA DONKI — ruimteweer-context (zonnevlammen, coronale massa-uitstoten,
// geomagnetische stormen) als aanvulling op de SWPC-aurorakaart. Werkt met de
// publieke DEMO_KEY (lage rate limit, ruim voldoende bij een poll-interval
// van 6 uur); zet NASA_API_KEY in .env voor een eigen, hogere limiet.
// Documentatie: https://api.nasa.gov/ (zoek "DONKI")
import { makeSignal } from '../normalize.js';

const RELEVANTE_TYPES = new Set(['CME', 'GST', 'FLR', 'IPS']);
const LABEL_PER_TYPE = { CME: 'Coronale massa-uitstoot', GST: 'Geomagnetische storm', FLR: 'Zonnevlam', IPS: 'Interplanetaire schokgolf' };
const ERNST_PER_TYPE = { GST: 'let-op', CME: 'info', FLR: 'info', IPS: 'info' };

export async function fetchDonki({ nasaApiKey }) {
  const url = `https://api.nasa.gov/DONKI/notifications?type=all&api_key=${encodeURIComponent(nasaApiKey || 'DEMO_KEY')}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`DONKI feed gaf status ${res.status}`);
  const body = await res.json();

  const drieDagenGeleden = Date.now() - 3 * 24 * 60 * 60 * 1000;

  return (Array.isArray(body) ? body : [])
    .filter((n) => RELEVANTE_TYPES.has(n.messageType) && new Date(n.messageIssueTime).getTime() >= drieDagenGeleden)
    .slice(0, 5)
    .map((n) =>
      makeSignal({
        id: `donki-${n.messageID}`,
        categorie: 'hemel',
        titel: LABEL_PER_TYPE[n.messageType] ?? n.messageType,
        ernst: ERNST_PER_TYPE[n.messageType] ?? 'info',
        tijd: n.messageIssueTime,
        detail: {
          type: n.messageType,
          samenvatting: (n.messageBody ?? '').replace(/[#*]/g, '').trim().slice(0, 220),
          bronUrl: n.messageURL,
        },
      }),
    );
}
