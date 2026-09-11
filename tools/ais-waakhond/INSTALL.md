# ais-waakhond

Herstart `ais-catcher` automatisch als de AIS-ontvangst stilvalt.

## Waarom

AIS-catcher sluit niet af wanneer de RTL-SDR wordt losgekoppeld of vastloopt.
Hij blijft `RTLSDR: timeout.` loggen en is voor systemd nog steeds `active`,
waardoor `Restart=always` in `ais-catcher.service` nooit ingrijpt.

Op 11 september 2026 lag de ontvangst daardoor stil na het verlengen van de
USB-kabel: de dongle was gezond (`rtl_test` las 25 s lang met 0 verloren
samples per miljoen), maar AIS-catcher hield de oude, verdwenen USB-handle
vast. Een herstart van de dienst was genoeg — alleen merkte niemand het.

Deze waakhond kijkt daarom niet naar het proces maar naar de datastroom:
staat er in de laatste 10 minuten geen enkele `!AIVDM`-regel in het journaal
van `ais-catcher`, dan herstart hij de dienst.

## Wat er gebeurt

- Elke 5 minuten één controle (systemd-timer, als root).
- Geen ingreep als de dienst bewust gestopt is.
- Geen ingreep als de dienst nog geen 10 minuten draait. Zonder die rem lokt
  elke herstart vijf minuten later de volgende uit.
- Elke ingreep komt in het journaal onder de tag `ais-waakhond`, mét de laatste
  logregel van AIS-catcher als reden.

## Installatie op de server (eenmalig)

De bestanden komen met `syncweer` mee naar `~/weer-app/tools/ais-waakhond/`.
Daarna, op `lexdev-nw`:

```
sudo install -m 755 ~/weer-app/tools/ais-waakhond/ais-waakhond.sh /usr/local/bin/ais-waakhond.sh
sudo install -m 644 ~/weer-app/tools/ais-waakhond/ais-waakhond.service /etc/systemd/system/ais-waakhond.service
sudo install -m 644 ~/weer-app/tools/ais-waakhond/ais-waakhond.timer /etc/systemd/system/ais-waakhond.timer
sudo systemctl daemon-reload
sudo systemctl enable --now ais-waakhond.timer
```

## Controleren

Wanneer hij weer loopt:

```
systemctl list-timers ais-waakhond.timer --no-pager
```

Of hij ooit heeft ingegrepen:

```
journalctl -t ais-waakhond --no-pager
```

De ingreep zelf uitproberen (herstart ais-catcher direct, ca. 20 s geen
ontvangst):

```
sudo AIS_WAAKHOND_STILTE_MIN=0 AIS_WAAKHOND_MIN_DRAAITIJD=0 /usr/local/bin/ais-waakhond.sh
```

## De enige aanname

De controle leest `!AIVDM`-regels uit het journaal van `ais-catcher`. Wordt de
logging van AIS-catcher ooit uitgezet of stiller gezet, dan ziet de waakhond
niets meer en herstart hij elke 10 minuten onnodig. Dat is dan zichtbaar in
`journalctl -t ais-waakhond`.
