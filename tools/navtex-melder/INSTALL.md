# navtex-melder

Mailt wanneer de NAVTEX-ontvangst stilvalt, met een momentopname van alles wat
je nodig hebt om de oorzaak te achterhalen. **Grijpt bewust niet in.**

## Waarom

`navtex-airspy` kan blijven draaien terwijl er niets meer uit de decoder komt.
Voor systemd is de dienst dan gezond, dus niets merkt het op. Op 11 september
2026 lag de ontvangst daardoor ruim vier uur stil; dat kwam pas aan het licht
doordat Lex het toevallig zag. Na een herstart van de dienst kwam de
eerstvolgende beurt (Oostende, 17:10) meteen weer foutloos binnen.

De les uit die middag: de oorzaak was achteraf nauwelijks te reconstrueren.
Het spectrum van het moment zelf was weg, de bytetellers waren gereset door de
herstart. Daarom legt deze melder die momentopname vast op het moment dat het
misgaat — en laat hij het herstarten aan Lex.

## Wat hij doet

- Elk kwartier kijken hoe lang geleden er voor het laatst iets aan
  `~/navtex_berichten.txt` is toegevoegd.
- Boven de drempel (standaard **150 minuten**): één mail met het rapport, en
  daarna niets meer zolang dezelfde storing duurt.
- Komt de ontvangst weer op gang: één mail dat het over is.
- Elk rapport wordt ook bewaard in `~/navtex-melder-rapporten.log`, zodat er na
  een paar keer een patroon zichtbaar wordt.

### Waarom 150 minuten

Uit `navtex_ruw_tijden.json` over 8 t/m 11 september: het langste **normale**
gat tussen twee blokken was 122 minuten, daarnaast een paar van 111 en 90. De
storing van 11 september was 279 minuten. 150 ligt daar ruim tussenin. Een
drempel van 120 minuten zou op 9 september al vals alarm hebben gegeven.

Na een week of wat de moeite waard om terug te kijken of 122 minuten echt het
maximum was; zo ja, dan kan de drempel omlaag.

## Het rapport

- Hoe lang 518 en 490 stil zijn, en hoe groot de bestanden zijn.
- Toestand van de dienst en sinds wanneer die draait.
- Bytetellers van demodulator en decoders, plus een tweede meting 20 seconden
  later. Dat onderscheidt "krijgt geen audio" van "krijgt audio maar herkent er
  niets in" — precies het onderscheid waar het op 11 september om draaide.
- S/N van het laatste half uur naast dat van de afgelopen dag.
- De sterkste componenten in de live audio van 518 en 490. Hiermee zie je
  achteraf of er een stoorzender op de frequentie zat; de S/N-waarde zelf kan
  een station niet van een storing onderscheiden.
- De grootste normale stiltes van de afgelopen week, ter vergelijking.
- De Airspy in `lsusb` en de laatste USB-meldingen uit de kernel.

## Installatie op de server (eenmalig)

De bestanden komen met `syncweer` mee naar `~/weer-app/tools/navtex-melder/`.
Daarna, op `lexdev-nw`:

```
sudo install -m 755 ~/weer-app/tools/navtex-melder/navtex-melder.py /usr/local/bin/navtex-melder.py
sudo install -m 644 ~/weer-app/tools/navtex-melder/navtex-melder.service /etc/systemd/system/navtex-melder.service
sudo install -m 644 ~/weer-app/tools/navtex-melder/navtex-melder.timer /etc/systemd/system/navtex-melder.timer
sudo systemctl daemon-reload
sudo systemctl enable --now navtex-melder.timer
```

## Uitproberen

Stuurt meteen een rapport, ongeacht de stilte — zo weet je dat de mail werkt:

```
NAVTEX_MELDER_TEST=1 /usr/local/bin/navtex-melder.py
```

## Controleren

```
systemctl list-timers navtex-melder.timer --no-pager
journalctl -u navtex-melder --no-pager | tail -20
less ~/navtex-melder-rapporten.log
```

## Instellingen

- `NAVTEX_MELDER_DREMPEL_MIN` — stilte in minuten voor er gemeld wordt (150).
  Aanpassen via een drop-in: `sudo systemctl edit navtex-melder.service` en
  daarin `[Service]` + `Environment=NAVTEX_MELDER_DREMPEL_MIN=120`.
- `NAVTEX_MELDER_TEST=1` — stuur nu een rapport.

## Aannames

- Mailen gaat via de Gmail-gegevens uit `~/weer-app/backend/.env`
  (`EMAIL_GEBRUIKER`, `EMAIL_APP_WACHTWOORD`), rechtstreeks
  over SMTP, met dezelfde +weeralarm-afzender als de app. Ontvanger is het
  Gmail-adres zelf (niet `EMAIL_ONTVANGER`, dat is het alarmadres op de
  telefoon); anders instellen kan met `NAVTEX_MELDER_ONTVANGER` in `.env`.
  De app wordt niet aangeraakt; wijzigt Lex daar het mailkanaal,
  dan moet dit script mee.
- De dienst draait als `lex`; de unit ook, met `systemd-journal` als extra
  groep zodat de S/N-regels leesbaar zijn.
- De audio wordt gelezen als 12 kHz 16-bit mono uit `/dev/shm`, hetzelfde
  formaat als de pijplijn levert.
