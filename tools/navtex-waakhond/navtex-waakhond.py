#!/usr/bin/env python3
"""
navtex-waakhond — herstart navtex-airspy als de decoder is vastgelopen.

Wat er op 11 september 2026 gebeurde: beide decoders (navtex_rx_from_file,
één per frequentie) liepen los van elkaar vast — 490 om 09:17 UTC, 518 om
10:31 UTC. De demodulator bleef gewoon signaal leveren (de S/N in het journaal
piekte om 13 UTC op 11 dB, Cullercoats, zoals elke dag), maar er kwam niets
meer uit. Voor systemd was de dienst gezond. Na een handmatige herstart om
16:48 kwam de eerstvolgende beurt (Oostende) meteen foutloos binnen.

De vingerafdruk van een vastgelopen decoder is dus: SIGNAAL AANWEZIG, NIETS
GEDECODEERD. Daar kijkt deze waakhond naar, per frequentie:

  - De demodulator logt elke 10 s "S/N 518 kHz: X dB, 490 kHz: Y dB".
  - Zat de S/N minstens een minuut lang op >= 10 dB (er zond dus een station),
    is die uitzending al meer dan 15 minuten voorbij, en is er sinds vóór het
    BEGIN ervan niets aan het berichtenbestand toegevoegd -> een hele
    uitzending is ongedecodeerd voorbijgegaan -> de decoder is vastgelopen.
    Is er tijdens de uitzending nog iets geschreven, dan leeft de decoder:
    aan het eind stuurt een station alleen nog fasering (sterk signaal,
    terecht niets te decoderen) — dat gaf op 11 september 's avonds een
    onterechte herstart met de eerste, te scherpe regel.
  - Vangnet voor als de S/N-regels ooit wegvallen: 150 minuten stilte op 518.

Vóór de herstart wordt de melder aangeroepen, zodat de momentopname van de
vastgelopen toestand in je mail zit — dat bewijs is na de herstart weg.

Na een (her)start wacht hij 30 minuten, en alleen uitzendingen ná de start
tellen mee. Zo kan hij nooit in een lus raken.

Instellingen via de omgeving (standaardwaarden tussen haakjes):
  NAVTEX_WAAKHOND_SN_DB        drempel "station hoorbaar" (10)
  NAVTEX_WAAKHOND_STERK_MIN    zo lang moet de S/N erboven zitten, minuten (1)
  NAVTEX_WAAKHOND_NA_MIN       wachttijd na de uitzending, minuten (15)
  NAVTEX_WAAKHOND_VANGNET_MIN  absolute stilte op 518, minuten (150)
  NAVTEX_WAAKHOND_REM_MIN      geen ingreep zo lang na een start, minuten (30)
  NAVTEX_WAAKHOND_DROOG=1      wel beoordelen en loggen, niet herstarten
"""

import os
import re
import subprocess
import sys
import time
from datetime import datetime

DIENST = "navtex-airspy.service"
HOME = "/home/lex"
BESTANDEN = {"518": f"{HOME}/navtex_berichten.txt",
             "490": f"{HOME}/navtex_berichten_490.txt"}
MELDER = "/usr/local/bin/navtex-melder.py"

SN_DB = float(os.environ.get("NAVTEX_WAAKHOND_SN_DB", "10"))
STERK_MIN = float(os.environ.get("NAVTEX_WAAKHOND_STERK_MIN", "1"))
NA_MIN = float(os.environ.get("NAVTEX_WAAKHOND_NA_MIN", "15"))
VANGNET_MIN = float(os.environ.get("NAVTEX_WAAKHOND_VANGNET_MIN", "150"))
REM_MIN = float(os.environ.get("NAVTEX_WAAKHOND_REM_MIN", "30"))
DROOG = os.environ.get("NAVTEX_WAAKHOND_DROOG") == "1"


def draai(args, timeout=60):
    try:
        r = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
        return r.stdout
    except Exception as e:
        print(f"navtex-waakhond: '{' '.join(args)}' mislukt: {e}", file=sys.stderr)
        return ""


def log(tekst):
    subprocess.run(["logger", "-t", "navtex-waakhond", tekst])
    print(f"navtex-waakhond: {tekst}")


def klok(ts):
    return datetime.fromtimestamp(ts).strftime("%H:%M")


def dienst_start():
    """Starttijd van de dienst als unix-tijd, via de monotone klok (betrouwbaar)."""
    if draai(["systemctl", "is-active", DIENST]).strip() != "active":
        return None
    mono = draai(["systemctl", "show", DIENST, "-p", "ActiveEnterTimestampMonotonic", "--value"]).strip()
    try:
        mono_s = int(mono) / 1e6
        with open("/proc/uptime") as f:
            uptime = float(f.read().split()[0])
        return time.time() - (uptime - mono_s)
    except Exception:
        return None


def sn_metingen(sinds_min):
    """[(unix-tijd, sn518, sn490)] uit het journaal."""
    uit = draai(["journalctl", "-u", DIENST, "--since", f"-{int(sinds_min)} min",
                 "--no-pager", "-o", "short-unix"], timeout=90)
    m = []
    for regel in uit.splitlines():
        r = re.match(r"^(\d+)\.\d+\s.*S/N 518 kHz:\s*(-?[\d.]+) dB,\s*490 kHz:\s*(-?[\d.]+) dB", regel)
        if r:
            m.append((int(r.group(1)), float(r.group(2)), float(r.group(3))))
    return m


def laatste_uitzending(metingen, kolom, na_start):
    """(begin, einde) van de meest recente uitzending: een cluster waarin de
    S/N minstens STERK_MIN minuten (binnen 10 min) op >= SN_DB zat, geheel ná
    de dienststart. Het BEGIN is wat telt (2026-09-11, avond): aan het eind
    van een uitzending stuurt een station alleen nog fasering — sterk signaal,
    terecht niets te decoderen. Alleen als er sinds vóór het begin niets meer
    geschreven is, is een hele uitzending ongedecodeerd voorbijgegaan."""
    nodig = int(STERK_MIN * 6)          # metingen zijn elke 10 s
    sterk = sorted(t for t, *sn in metingen if sn[kolom] >= SN_DB and t > na_start)
    if len(sterk) < nodig:
        return None
    # loop van achteren naar voren; het laatste venster met genoeg metingen is de uitzending
    for i in range(len(sterk) - 1, -1, -1):
        einde = sterk[i]
        cluster = [u for u in sterk if einde - 600 <= u <= einde]
        if len(cluster) >= nodig:
            # rek het begin op naar voren zolang de metingen aaneensluiten (gat < 2 min)
            begin = cluster[0]
            j = sterk.index(begin)
            while j > 0 and begin - sterk[j - 1] < 120:
                j -= 1
                begin = sterk[j]
            return begin, einde
    return None


def beoordeel():
    nu = time.time()
    start = dienst_start()
    if start is None:
        return None, "dienst niet actief — niets te doen"
    if nu - start < REM_MIN * 60:
        return None, f"dienst pas {int((nu - start) / 60)} min geleden gestart — rem"

    metingen = sn_metingen(VANGNET_MIN + 30)
    redenen = []
    for kolom, (band, pad) in enumerate(BESTANDEN.items()):
        try:
            geschreven = os.path.getmtime(pad)
        except OSError:
            continue
        uitz = laatste_uitzending(metingen, kolom, start) if metingen else None
        if uitz:
            begin, einde = uitz
            # hele uitzending voorbij (NA_MIN na het einde) en sinds vóór het
            # begin ervan is er niets meer geschreven -> decoder vastgelopen
            if geschreven < begin - 60 and nu - einde > NA_MIN * 60:
                redenen.append(f"{band}: uitzending {klok(begin)}–{klok(einde)} (S/N >= {SN_DB:.0f} dB) "
                               f"volledig ongedecodeerd, laatste decodering {klok(geschreven)}")
        # Vangnet telt vanaf de laatste decodering óf de laatste (her)start,
        # wat het meest recent is — anders herstart hij na een ingreep elke
        # REM_MIN opnieuw zolang er toevallig niets uitgezonden wordt.
        stil_sinds = max(geschreven, start)
        if band == "518" and nu - stil_sinds > VANGNET_MIN * 60:
            redenen.append(f"518: {int((nu - stil_sinds) / 60)} min helemaal niets (vangnet)")

    if not metingen:
        print("navtex-waakhond: geen S/N-regels in het journaal gevonden — alleen het vangnet werkt",
              file=sys.stderr)
    return (redenen or None), None


def main():
    redenen, info = beoordeel()
    if not redenen:
        if info:
            print(f"navtex-waakhond: {info}")
        return 0

    reden = "; ".join(redenen)
    if DROOG:
        log(f"DROOG — zou herstarten: {reden}")
        return 0

    log(f"decoder vastgelopen: {reden} — momentopname wordt gemaild, daarna herstart")
    env = dict(os.environ, NAVTEX_MELDER_FORCEER="1",
               NAVTEX_MELDER_ONDERWERP=f"[weer] NAVTEX-waakhond herstart — {redenen[0]}")
    try:
        subprocess.run(["runuser", "-u", "lex", "--", MELDER], env=env, timeout=170)
    except Exception as e:
        log(f"melder mislukt ({e}), herstart gaat door")
    subprocess.run(["systemctl", "restart", DIENST])
    log("herstart uitgevoerd")
    return 0


if __name__ == "__main__":
    sys.exit(main())
