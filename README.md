# Weer

Persoonlijke app voor realtime signalering van onweer, orkanen, aardbevingen,
tornado's, algemeen weer en de hemel (maanstand, satellieten, aurora,
meteorenzwermen). Geen educatie — puur actuele data.

Achtergrond, ontwerp en de volledige bron-inventarisatie staan in het
Claude-project **"Weer"** (`weer-app-architectuur-en-ontwerp.md` en
`weer-hoofdinventarisatie-datastromen.md`).

## Structuur

```
backend/    aggregator-service — pollt externe bronnen, normaliseert, cachet,
            serveert alles via één API + de frontend zelf
frontend/   de Storm Noir PWA-schil (vanilla HTML/CSS/JS, geen build-stap)
```

Bewust **geen** framework (geen Express, geen build-stap) — dit is een klein
persoonlijk project, geen enterprise-app. Wel een handvol gerichte
dependencies inmiddels, zie "Starten" hieronder.

## Starten

```
cd backend
node src/index.js
```

Open daarna `http://localhost:4780` in je browser. `npm install` in
`backend/` is inmiddels wél nodig — de oorspronkelijke "puur Node, geen
dependencies"-opzet is losgelaten naarmate er bronnen bijkwamen die er echt
een nodig hebben: `cheerio` (NAVTEX/UKHO-scrapers), `astronomy-engine`
(planeten), `satellite.js` (ISS/Starlink), `nodemailer` en `web-push`
(meldingen). Zie `backend/package.json`.

Wil je een eigen locatie of poort instellen? Kopieer `backend/.env.example`
naar `backend/.env` en pas de waarden aan (`PORT`, `HOME_LAT`/`HOME_LON`,
en de losse API-sleutels per bron — zie de comments in `config.js` voor
welke bron welke sleutel nodig heeft).

## Wat werkt er al

Zo'n 28 bronnen staan `implemented: true` in `backend/src/config.js` en
draaien gewoon mee: aardbevingen (USGS, EMSC), orkanen (NHC), tornado's en
severe weather (NWS, SPC Day 1-outlook, IEM Local Storm Reports),
algemeen weer (Open-Meteo, KNMI EDR), weerwaarschuwingen (Meteoalarm),
multi-hazard-vangnet (GDACS), onweer (Blitzortung, live WebSocket-stream),
hulpdiensten (P2000, Lifeliner/OpenSky), getij (RWS), en de hele
hemel-categorie (maanstand, ISS-passages, Starlink-trein, ruimteweer/aurora,
meteorenzwermen, planeten). Voor de volledige, actuele lijst incl. tier
(officieel/community/lokaal) en pollfrequentie: `backend/src/config.js` is
de bron van waarheid, niet dit bestand.

Voor NAVTEX specifiek, zie de eigen sectie hieronder — dat is de enige
categorie met meerdere bronnen naast elkaar.

Losstaand van de `SOURCES`-lijst (eigen kleine cache, geen
tier/staleAfterMs-status): vliegradar (adsb.lol), ISS-live-positie,
vaarradar/AIS (momenteel zonder data, zie de architectuurnotitie in het
Claude-project), en de kaarttegel-proxy's voor de basiskaart en RainViewer.

## Een nieuwe bron aansluiten

1. Schrijf `backend/src/sources/<naam>.js` met een `fetchXxx(env)`-functie:
   haal data op, zet elk item om naar een signaal via `makeSignal({...})`
   uit `normalize.js`.
2. Registreer 'm in de `FETCHERS`-map in `server.js` (`id: (env) =>
   fetchXxx(env)`).
3. Voeg een entry toe aan de `SOURCES`-lijst in `backend/src/config.js`
   (`id`, `categorie`, `naam`, `tier`, `pollIntervalMs`, `staleAfterMs`,
   `implemented: true`).
4. Klaar — polling, caching, de betrouwbaarheidsindicator en de API-routes
   werken automatisch mee vanuit die twee registraties, niets anders hoeft
   aangepast te worden. `implemented: false` laat een bron intact staan
   zonder dat er een poll-timer voor opgezet wordt, handig om iets tijdelijk
   stil te zetten (zoals nu bij `navtex.js`).

## Omgevingen — Windows dev + lexdev-nw (productie)

- **Windows dev-map** (`C:\Projects\Weer`): waar wijzigingen gemaakt worden.
- **lexdev-nw** (Minisforum UM760): 24/7-productie, draait als systemd-service
  `weer-app@lex.service` (Node via nvm). Bereikbaar in het tailnet.

Wijzigingen op Windows komen pas live na een sync. Daarvoor is er een
`syncweer`-alias in Lex' PowerShell-profiel (roept `sync-naar-minisforum.ps1`
aan): pakt `backend/` + `frontend/` in, stuurt het naar lexdev-nw, draait
`npm install` (voor het geval een dependency is bijgekomen), en herstart de
service. Één woord, één stap — `backend/.env` wordt bewust nooit meegestuurd
(bevat de huisadres-coördinaten en per-omgeving instellingen).

**Let op:** de service draait op lexdev-nw als root, niet als `lex` (er staat
geen `User=%i` in `weer-app.service`) — dat raakt onder meer waar Node's
standaard-thuismap naar wijst, zie de NAVTEX-sectie hieronder voor een
concreet voorbeeld waar dat toesloeg.

## API

- `GET /api/status` — status per bron (bijgewerkt-tijdstip, betrouwbaarheidstier, haperend ja/nee)
- `GET /api/signals` — alle actuele signalen
- `GET /api/signals/:categorie` — bijv. `/api/signals/aardbeving`

## NAVTEX — eigen ontvangst (testopstelling)

Naast `navtex.js` (community-scrape van navtex.lv, momenteel `implemented:
false`) en `ukho.js` (officiële UKHO/Admiralty-tekst) is er sinds 2026-08-23
een derde NAVTEX-bron: `sources/navtexLokaal.js`, tier `lokaal`.

Die leest géén netwerk-API, maar een plat tekstbestand dat op `lexdev-nw`
wordt volgeschreven door de eigen testontvangst (MLA-30+ loopantenne + ATS
Mini, gedecodeerd met `navtex_rx_from_file`):

```bash
arecord -D hw:1,0 -f cd - | sox -t wav - -c 1 -r 11025 -t raw - vol 0.3 \
  | navtex_rx_from_file 11025 | tee -a ~/navtex_berichten.txt
```

`navtexLokaal.js` pollt dat bestand elke 2 minuten en zet elk leesbaar blok
om naar een signaal, met dezelfde coördinaten/datum-parseerlogica als
`navtex.js`. Instelbaar pad via `NAVTEX_LOKAAL_BESTAND` in `.env` (standaard:
de home-map van de gebruiker die de service draait).

**Let op — de service draait als root, niet als `lex`:** `weer-app.service`
heeft geen `User=%i`, dus Node's standaard-thuismap is `/root`, niet
`/home/lex`. Zonder `NAVTEX_LOKAAL_BESTAND` expliciet in `.env` zoekt deze
bron dus op de verkeerde plek. Op lexdev-nw staat daarom:

```
NAVTEX_LOKAAL_BESTAND=/home/lex/navtex_berichten.txt
```

**Stationslijst, nog in onderzoek:** `navtex.js` kent Niton Radio toe aan
letter `E` (nooit tegen echte ontvangst geverifieerd). Live testontvangst gaf
herhaaldelijk `K` met inhoud uit Niton's dekkingsgebied (Dover Strait, Wight,
doorgestuurde AVURNAV Cherbourg) — toegevoegd als apart station in
`navtexLokaal.js`, `navtex.js` zelf bewust ongewijzigd gelaten. Er is ook
minstens één keer een station `S` gezien dat in geen van beide tabellen
voorkomt. Bij een onherkende of ambigu-gecodeerde stationsletter (bv. de
eerste letter door een bitfout weggevallen) laat de code het station bewust
op onbekend staan i.p.v. te gokken — zie de comments in `navtexLokaal.js`
voor de exacte regel.

Dit is nadrukkelijk de testfase (MLA-30+ + ATS Mini). Zodra de Airspy HF
Discovery er is en er een echt systeem komt (audio-pipeline als
systemd-service i.p.v. handmatig `tee`-commando), verandert alleen hóe dit
bestand gevuld wordt — de bron zelf kan blijven staan.

## Op meerdere apparaten (Tailscale)

Zodra deze service draait op een machine in je tailnet, is 'm op je andere
apparaten (telefoon, tablet, andere pc) bereikbaar via de Tailscale-hostnaam
van die machine, op dezelfde poort (standaard 4780) — bijvoorbeeld
`http://<machinenaam>.<jouw-tailnet>.ts.net:4780`. Voeg de pagina op je
telefoon/tablet toe aan het beginscherm voor de volledige PWA-ervaring
(fullscreen, eigen icoon).

## Frontend

`frontend/index.html` + `app.js` + `styles.css` vormen de werkende versie van
de Storm Noir-mockups (ticker, kaart met pins, signaalstrip met
betrouwbaarheidsindicator, hemel-kaart). De losse ontwerp-mockups
(`weer-moodboard.html`, `weer-homescreen-storm-noir.html`,
`weer-responsive-layout.html`, `weer-inventarisatie.html`) staan als
referentie in het Claude-project, niet in deze repo.
