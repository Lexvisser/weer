#!/usr/bin/env bash
# ais-waakhond.sh
#
# Herstart ais-catcher als er een tijd lang geen AIS-bericht meer binnenkwam.
#
# Achtergrond: AIS-catcher sluit niet af wanneer de RTL-SDR wordt losgekoppeld
# of vastloopt. Hij blijft "RTLSDR: timeout." loggen en geldt voor systemd nog
# steeds als actief, dus Restart=always in ais-catcher.service grijpt nooit in.
# Deze waakhond kijkt daarom niet naar het proces maar naar de datastroom zelf.
#
# Drempels zijn te overschrijven, handig om de ingreep te testen:
#   sudo AIS_WAAKHOND_STILTE_MIN=0 AIS_WAAKHOND_MIN_DRAAITIJD=0 /usr/local/bin/ais-waakhond.sh

set -u

DIENST="ais-catcher.service"
STILTE_MIN="${AIS_WAAKHOND_STILTE_MIN:-10}"
MIN_DRAAITIJD="${AIS_WAAKHOND_MIN_DRAAITIJD:-600}"

# 1. Dienst staat uit of is bewust gestopt? Dan is dit niet onze zaak.
if ! systemctl is-active --quiet "$DIENST"; then
    exit 0
fi

# 2. Draait hij nog geen MIN_DRAAITIJD seconden? Een net gestarte dienst heeft
#    tijd nodig voor zijn eerste bericht. Zonder deze rem lokt elke herstart
#    vijf minuten later de volgende uit.
#    De monotone klok, niet de tekstuele tijdstempel: die laatste is niet overal
#    door 'date' te parseren, en dan zou de rem ongemerkt wegvallen.
draaitijd=""
mono_us="$(systemctl show "$DIENST" -p ActiveEnterTimestampMonotonic --value 2>/dev/null)"
if [ -n "$mono_us" ] && [ "$mono_us" -gt 0 ] 2>/dev/null; then
    uptime_sec="$(cut -d' ' -f1 /proc/uptime | cut -d'.' -f1)"
    draaitijd="$(( uptime_sec - mono_us / 1000000 ))"
fi
if [ -z "$draaitijd" ]; then
    start_tekst="$(systemctl show "$DIENST" -p ActiveEnterTimestamp --value 2>/dev/null)"
    start_sec="$(date -d "$start_tekst" +%s 2>/dev/null || echo 0)"
    [ "$start_sec" -gt 0 ] && draaitijd="$(( $(date +%s) - start_sec ))"
fi
if [ -n "$draaitijd" ] && [ "$draaitijd" -lt "$MIN_DRAAITIJD" ]; then
    exit 0
fi

# 3. Kwam er in het stiltevenster een AIS-bericht binnen? Dan is alles goed.
if journalctl -u "$DIENST" --since "-${STILTE_MIN} min" --no-pager -q 2>/dev/null | grep -q 'AIVDM'; then
    exit 0
fi

# 4. Stil. Ingrijpen, en vastleggen waarom - stil ingrijpen is waardeloos.
laatste="$(journalctl -u "$DIENST" --no-pager -q -n 1 -o cat 2>/dev/null)"
logger -t ais-waakhond "Geen AIS-bericht in ${STILTE_MIN} min - ais-catcher wordt herstart. Laatste logregel: ${laatste:-<niets>}"
systemctl restart "$DIENST"
logger -t ais-waakhond "Herstart uitgevoerd."
