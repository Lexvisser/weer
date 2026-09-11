#!/usr/bin/env python3
"""
navtex-melder — meldt het als de NAVTEX-ontvangst stilvalt. Grijpt NIET in.

Achtergrond: navtex-airspy kan blijven draaien terwijl er niets meer uit de
decoder komt. Voor systemd is de dienst dan gezond, dus niets merkt het op.
Op 11 september 2026 lag de ontvangst daardoor ruim vier uur stil.

Deze melder kijkt niet naar het proces maar naar de datastroom: hoe lang is
het geleden dat er iets aan navtex_berichten.txt is toegevoegd. Bij
overschrijding van de drempel stuurt hij één mail met een momentopname van
alles wat je nodig hebt om de oorzaak te achterhalen — juist het bewijs dat
achteraf niet meer te reconstrueren is, zoals het spectrum van dat moment.

Bewust géén herstart: Lex wil eerst zien wat er aan de hand is.

Instellingen via de omgeving (of gewoon de standaardwaarden):
  NAVTEX_MELDER_DREMPEL_MIN   stilte in minuten voordat er gemeld wordt (150)
  NAVTEX_MELDER_TEST=1        stuur nu een rapport, ongeacht de stilte
"""

import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
import smtplib

HOME = "/home/lex"
BERICHTEN_518 = f"{HOME}/navtex_berichten.txt"
BERICHTEN_490 = f"{HOME}/navtex_berichten_490.txt"
AUDIO_518 = "/dev/shm/navtex_audio.raw"
AUDIO_490 = "/dev/shm/navtex_audio_490.raw"
REGISTER = f"{HOME}/navtex_ruw_tijden.json"
ENV_BESTAND = f"{HOME}/weer-app/backend/.env"
STATUS = f"{HOME}/.navtex-melder-status.json"
LOGBOEK = f"{HOME}/navtex-melder-rapporten.log"
DIENST = "navtex-airspy"

DREMPEL_MIN = int(os.environ.get("NAVTEX_MELDER_DREMPEL_MIN", "150"))
TESTMODUS = os.environ.get("NAVTEX_MELDER_TEST") == "1"


# ---------------------------------------------------------------- hulpjes

def draai(args, timeout=60):
    """Voer een commando uit en geef de uitvoer terug; nooit een uitzondering."""
    try:
        r = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
        return (r.stdout or "") + (r.stderr or "")
    except Exception as e:
        return f"(kon '{' '.join(args)}' niet uitvoeren: {e})"


def duur(seconden):
    seconden = int(max(0, seconden))
    u, m = divmod(seconden // 60, 60)
    return f"{u}u{m:02d}" if u else f"{m} min"


def lees_env(pad):
    waarden = {}
    try:
        with open(pad, "r", encoding="utf-8", errors="replace") as f:
            for regel in f:
                regel = regel.strip()
                if not regel or regel.startswith("#") or "=" not in regel:
                    continue
                sleutel, _, waarde = regel.partition("=")
                waarden[sleutel.strip()] = waarde.strip().strip('"').strip("'")
    except Exception:
        pass
    return waarden


def stilte_seconden(pad):
    try:
        return time.time() - os.path.getmtime(pad)
    except Exception:
        return None


# ------------------------------------------------------- onderdelen rapport

def deel_bestanden():
    r = []
    for naam, pad in (("518", BERICHTEN_518), ("490", BERICHTEN_490)):
        s = stilte_seconden(pad)
        if s is None:
            r.append(f"  {naam}: bestand niet gevonden ({pad})")
        else:
            klok = datetime.fromtimestamp(os.path.getmtime(pad)).strftime("%d-%m %H:%M")
            r.append(f"  {naam}: laatst geschreven {klok}  —  {duur(s)} geleden"
                     f"  ({os.path.getsize(pad)} bytes)")
    return "\n".join(r)


def deel_dienst():
    uit = draai(["systemctl", "show", DIENST,
                 "-p", "ActiveState", "-p", "SubState", "-p", "ActiveEnterTimestamp"])
    velden = dict(re.findall(r"^(\w+)=(.*)$", uit, re.M))
    r = [f"  toestand: {velden.get('ActiveState','?')} / {velden.get('SubState','?')}",
         f"  actief sinds: {velden.get('ActiveEnterTimestamp','?')}"]
    return "\n".join(r)


def deel_processen():
    """Bytetellers: leest de keten nog audio, en produceert de decoder iets?"""
    r = []
    for naam, patroon in (("airspyhf_rx", "airspyhf_rx"),
                          ("demodulator", "navtex_usb_demod.py"),
                          ("decoder", "navtex_rx_from_file")):
        pids = draai(["pgrep", "-f", patroon]).split()
        if not pids:
            r.append(f"  {naam:12s}: draait niet")
            continue
        for pid in pids[:2]:
            try:
                with open(f"/proc/{pid}/io") as f:
                    io = dict(re.findall(r"^(\w+):\s*(\d+)$", f.read(), re.M))
                r.append(f"  {naam:12s} pid {pid}: gelezen {int(io.get('rchar',0)):,}"
                         f"  geschreven {int(io.get('wchar',0)):,}")
            except Exception as e:
                r.append(f"  {naam:12s} pid {pid}: tellers onleesbaar ({e})")
    r.append("  (twee metingen met 20 s ertussen staan hieronder bij 'doorstroom')")
    return "\n".join(r)


def deel_doorstroom():
    """Groeien de tellers nog? Onderscheidt 'geen audio' van 'audio maar niets herkend'."""
    def snap():
        uit = {}
        for naam, patroon in (("demodulator", "navtex_usb_demod.py"),
                              ("decoder", "navtex_rx_from_file")):
            for pid in draai(["pgrep", "-f", patroon]).split()[:1]:
                try:
                    with open(f"/proc/{pid}/io") as f:
                        io = dict(re.findall(r"^(\w+):\s*(\d+)$", f.read(), re.M))
                    uit[naam] = (int(io.get("rchar", 0)), int(io.get("wchar", 0)))
                except Exception:
                    pass
        return uit

    voor = snap()
    time.sleep(20)
    na = snap()
    r = []
    for naam in ("demodulator", "decoder"):
        if naam in voor and naam in na:
            dr = na[naam][0] - voor[naam][0]
            dw = na[naam][1] - voor[naam][1]
            r.append(f"  {naam:12s}: +{dr:,} gelezen, +{dw:,} geschreven in 20 s")
        else:
            r.append(f"  {naam:12s}: niet gemeten")
    r.append("  (12 kHz 16-bit audio = ongeveer 480.000 bytes per 20 s)")
    return "\n".join(r)


def deel_sn():
    """S/N van het laatste half uur naast dat van de afgelopen dag."""
    def gemiddelden(sinds):
        uit = draai(["journalctl", "-u", DIENST, "--since", sinds, "--no-pager", "-o", "cat"])
        a, b = [], []
        for regel in uit.splitlines():
            m = re.search(r"S/N 518 kHz:\s*(-?[\d.]+) dB,\s*490 kHz:\s*(-?[\d.]+) dB", regel)
            if m:
                a.append(float(m.group(1)))
                b.append(float(m.group(2)))
        if not a:
            return None
        return (sum(a) / len(a), sum(b) / len(b), len(a))

    r = []
    for label, sinds in (("laatste 30 min", "-30 min"), ("laatste 24 uur", "-1 day")):
        g = gemiddelden(sinds)
        if g is None:
            r.append(f"  {label}: geen metingen gevonden (journaal niet leesbaar?)")
        else:
            r.append(f"  {label}: 518 kHz {g[0]:.1f} dB, 490 kHz {g[1]:.1f} dB  ({g[2]} metingen)")
    return "\n".join(r)


def deel_spectrum(pad, label):
    """De sterkste componenten in de live audio — het bewijs dat achteraf weg is."""
    try:
        import numpy as np
    except Exception as e:
        return f"  ({label}: numpy niet beschikbaar: {e})"
    fs, secs = 12000, 20
    try:
        with open(pad, "rb") as f:
            f.seek(0, 2)
            grootte = f.tell()
            pak = min(grootte, fs * 2 * secs)
            f.seek(grootte - pak)
            x = np.frombuffer(f.read(pak), dtype="<i2").astype(float)
    except Exception as e:
        return f"  ({label}: kon audio niet lezen: {e})"
    if len(x) < 4096:
        return f"  ({label}: te weinig audio)"
    x = x - x.mean()
    N = 1 << 16
    xx = x[-N:] if len(x) >= N else x
    X = np.abs(np.fft.rfft(xx * np.hanning(len(xx)), N))
    fr = np.fft.rfftfreq(N, 1 / fs)
    m = (fr > 300) & (fr < 2500)
    fr, X = fr[m], X[m]
    r = []
    gezien = []
    for i in np.argsort(X)[::-1]:
        if all(abs(fr[i] - g) > 25 for g in gezien):
            gezien.append(fr[i])
            r.append(f"    {fr[i]:8.1f} Hz  {20 * np.log10(X[i] / X.max()):6.1f} dB")
        if len(gezien) >= 6:
            break
    r.append(f"    RMS {float(np.sqrt((x ** 2).mean())):.0f} van 32767")
    r.insert(0, f"  {label}:")
    r.append("    (NAVTEX hoort twee tonen te geven rond 915 en 1085 Hz, 170 Hz uit elkaar)")
    return "\n".join(r)


def deel_gaten():
    """Hoe lang zijn de normale stiltes? Uit het register van de app zelf."""
    try:
        with open(REGISTER) as f:
            d = json.load(f)
        tijden = sorted({x["tijd"] for x in d})
        t = [datetime.fromisoformat(s.replace("Z", "+00:00")) for s in tijden]
        grens = datetime.now(timezone.utc) - timedelta(days=7)
        t = [x for x in t if x >= grens]
        if len(t) < 3:
            return "  (te weinig geschiedenis in het register)"
        gaten = sorted(((b - a).total_seconds() / 60 for a, b in zip(t, t[1:])), reverse=True)
        top = ", ".join(f"{g:.0f}" for g in gaten[:5])
        mediaan = gaten[len(gaten) // 2]
        return (f"  grootste gaten (min): {top}\n"
                f"  mediaan {mediaan:.0f} min over {len(gaten)} gaten, laatste 7 dagen\n"
                f"  drempel van deze melder: {DREMPEL_MIN} min")
    except Exception as e:
        return f"  (register onleesbaar: {e})"


def deel_hardware():
    r = []
    lsusb = draai(["lsusb"])
    regels = [x for x in lsusb.splitlines() if "03eb:800c" in x or "Airspy" in x]
    r.append("  " + (regels[0] if regels else "Airspy NIET gevonden in lsusb"))
    kernel = draai(["dmesg", "-T"])
    if "not permitted" in kernel or "Operation not" in kernel:
        r.append("  (kernelmeldingen niet leesbaar zonder rechten)")
    else:
        usb = [x for x in kernel.splitlines() if "usb" in x.lower()][-5:]
        if usb:
            r.extend("  " + x for x in usb)
        else:
            r.append("  (geen USB-meldingen)")
    return "\n".join(r)


# ------------------------------------------------------------------ rapport

def maak_rapport(stil_518, hersteld=False):
    nu = datetime.now().strftime("%A %d %B %Y, %H:%M")
    kop = ("NAVTEX-ontvangst is weer op gang gekomen."
           if hersteld else
           f"NAVTEX-ontvangst ligt stil: al {duur(stil_518)} geen nieuw blok.")
    blokken = [
        f"{kop}\n\nMomentopname van {nu} op lexdev-nw.",
        "BERICHTENBESTANDEN\n" + deel_bestanden(),
        "DIENST\n" + deel_dienst(),
        "PROCESSEN\n" + deel_processen(),
        "DOORSTROOM\n" + deel_doorstroom(),
        "SIGNAAL-RUISVERHOUDING\n" + deel_sn(),
        "SPECTRUM VAN DE LIVE AUDIO\n"
        + deel_spectrum(AUDIO_518, "518 kHz") + "\n"
        + deel_spectrum(AUDIO_490, "490 kHz"),
        "NORMALE STILTES TER VERGELIJKING\n" + deel_gaten(),
        "HARDWARE\n" + deel_hardware(),
        "Deze melder grijpt niet in. Herstarten doe je zelf met:\n"
        "  sudo systemctl restart navtex-airspy",
    ]
    return "\n\n".join(blokken)


def verstuur(onderwerp, tekst):
    env = lees_env(ENV_BESTAND)
    gebruiker = env.get("EMAIL_GEBRUIKER")
    wachtwoord = env.get("EMAIL_APP_WACHTWOORD")
    ontvanger = env.get("EMAIL_ONTVANGER") or gebruiker
    if not gebruiker or not wachtwoord:
        print("navtex-melder: geen mailgegevens in .env — rapport alleen in het logboek",
              file=sys.stderr)
        return False
    bericht = EmailMessage()
    bericht["Subject"] = onderwerp
    bericht["From"] = gebruiker
    bericht["To"] = ontvanger
    bericht.set_content(tekst)
    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=45) as s:
            s.login(gebruiker, wachtwoord)
            s.send_message(bericht)
        return True
    except Exception as e:
        print(f"navtex-melder: mail versturen mislukt: {e}", file=sys.stderr)
        return False


def lees_status():
    try:
        with open(STATUS) as f:
            return json.load(f)
    except Exception:
        return {"gemeld": False}


def schrijf_status(d):
    try:
        with open(STATUS, "w") as f:
            json.dump(d, f)
    except Exception as e:
        print(f"navtex-melder: kon status niet opslaan: {e}", file=sys.stderr)


def bewaar(tekst):
    try:
        with open(LOGBOEK, "a", encoding="utf-8") as f:
            f.write("\n" + "=" * 72 + "\n" + tekst + "\n")
    except Exception:
        pass


def main():
    stil = stilte_seconden(BERICHTEN_518)
    if stil is None:
        print("navtex-melder: berichtenbestand niet gevonden", file=sys.stderr)
        return 1

    status = lees_status()

    if TESTMODUS:
        tekst = maak_rapport(stil)
        onderwerp = f"[weer] TEST — NAVTEX-melder ({duur(stil)} stil)"
        bewaar("TESTRAPPORT\n" + tekst)
        print("verstuurd" if verstuur(onderwerp, tekst) else "niet verstuurd")
        print("\n" + tekst)
        return 0

    if stil > DREMPEL_MIN * 60:
        if status.get("gemeld"):
            return 0                      # deze episode is al gemeld
        tekst = maak_rapport(stil)
        onderwerp = f"[weer] NAVTEX stil — {duur(stil)} geen ontvangst"
        bewaar(tekst)
        verstuur(onderwerp, tekst)
        print(f"navtex-melder: gemeld, {duur(stil)} stil")
        schrijf_status({"gemeld": True, "sinds": datetime.now().isoformat(timespec="seconds")})
    else:
        if status.get("gemeld"):
            tekst = maak_rapport(stil, hersteld=True)
            bewaar(tekst)
            verstuur("[weer] NAVTEX weer op gang", tekst)
            print("navtex-melder: herstel gemeld")
            schrijf_status({"gemeld": False})
    return 0


if __name__ == "__main__":
    sys.exit(main())
