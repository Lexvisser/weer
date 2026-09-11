# navtex-waakhond

Herstart `navtex-airspy` als de decoder is vastgelopen. Vlak vóór de herstart
mailt hij, via `navtex-melder`, een momentopname van de vastgelopen toestand.

## Wat er op 11 september 2026 gebeurde

Beide decoders (`navtex_rx_from_file`, één per frequentie) liepen los van
elkaar vast: 490 om 09:17 UTC, 518 om 10:31 UTC. De demodulator bleef gewoon
signaal leveren — de S/N in het journaal piekte om 13 UTC op 11 dB
(Cullercoats), zoals elke dag — maar er kwam niets meer uit. Voor systemd was
de dienst gezond, dus `Restart=always` deed niets. Na een handmatige herstart
om 16:48 kwam de eerstvolgende beurt (Oostende, 17:10) meteen foutloos binnen.

Antenne, Airspy en demodulator zijn daarmee uitgesloten; wat vastloopt is de
decoder zelf. Wat er precies in dat programma blijft hangen is niet
uitgezocht (C-code van fventuri/navtex).

## Hoe hij beslist

De vingerafdruk van een vastgelopen decoder is: **signaal aanwezig, niets
gedecodeerd**. Per frequentie:

- De demodulator logt elke 10 s `S/N 518 kHz: X dB, 490 kHz: Y dB`.
- Een **uitzending** is minstens een minuut aaneengesloten S/N van 18 dB of
  hoger. IJking van 11 september: alles wat decodeerde piekte op 25–34 dB
  (Oostende 32 en 34, Den Helder 27, station V 29 en 30); rustige kwartieren
  halen max 9–12; de twee "stations" die 's avonds een onterechte herstart
  uitlokten zaten op gemiddeld 7,5 / max 12 dB. De eerste versie had de lat
  op 10 dB en zag ruis aan voor een station.
- Is zo'n uitzending al meer dan 15 minuten voorbij en is er sinds vóór het
  **begin** ervan niets aan het berichtenbestand toegevoegd, dan is hij
  volledig ongedecodeerd voorbijgegaan. Het begin telt: aan het eind stuurt
  een station alleen nog fasering (sterk signaal, terecht niets te decoderen).
- Pas bij **twee** van zulke uitzendingen achter elkaar grijpt hij in. Eén
  sterk maar ongedecodeerd station kan 's avonds nog fading zijn; twee op rij
  is een vastgelopen decoder. Op 11 september had dit rond 15:15 UTC
  ingegrepen, anderhalf uur vóór de handmatige herstart.
- Vangnet voor als de S/N-regels ooit wegvallen: 150 minuten stilte op 518,
  geteld vanaf de laatste decodering of de laatste (her)start.

Beveiligingen tegen een lus: geen ingreep binnen 30 minuten na een start, en
alleen uitzendingen ná de start tellen mee. De timer heeft bewust geen
`OnBootSec`: die vuurt bij inschakelen direct als de machine al dagen aan staat.

Elke ingreep staat in het journaal onder de tag `navtex-waakhond`, mét reden.

## Installatie op de server (eenmalig)

Vereist dat `navtex-melder` al geïnstalleerd is (voor de momentopname). De
bestanden komen met `syncweer` mee naar `~/weer-app/tools/navtex-waakhond/`.

```
sudo install -m 755 ~/weer-app/tools/navtex-waakhond/navtex-waakhond.py /usr/local/bin/navtex-waakhond.py
sudo install -m 644 ~/weer-app/tools/navtex-waakhond/navtex-waakhond.service /etc/systemd/system/navtex-waakhond.service
sudo install -m 644 ~/weer-app/tools/navtex-waakhond/navtex-waakhond.timer /etc/systemd/system/navtex-waakhond.timer
sudo systemctl daemon-reload
sudo systemctl enable --now navtex-waakhond.timer
```

## Controleren

```
systemctl list-timers navtex-waakhond.timer --no-pager
journalctl -t navtex-waakhond --no-pager
```

Droog draaien (beoordelen en loggen, niet herstarten):

```
sudo NAVTEX_WAAKHOND_DROOG=1 /usr/local/bin/navtex-waakhond.py
```

## Instellingen

Via een drop-in (`sudo systemctl edit navtex-waakhond.service`, sectie
`[Service]`, regel `Environment=...`):

- `NAVTEX_WAAKHOND_SN_DB` — drempel "station hoorbaar" (18)
- `NAVTEX_WAAKHOND_AANTAL` — zoveel ongedecodeerde uitzendingen op rij (2)
- `NAVTEX_WAAKHOND_STERK_MIN` — zo lang moet de S/N erboven zitten (1)
- `NAVTEX_WAAKHOND_NA_MIN` — wachttijd na de uitzending (15)
- `NAVTEX_WAAKHOND_VANGNET_MIN` — absolute stilte op 518 (150)
- `NAVTEX_WAAKHOND_REM_MIN` — geen ingreep zo lang na een start (30)
