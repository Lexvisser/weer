#!/usr/bin/env python3
"""
USB-demodulator voor NAVTEX vanaf een Airspy HF+ (of elk float32-IQ-bestand).

Leest complex float32 IQ (zoals `airspyhf_rx -r stdout` levert) van stdin,
schuift het NAVTEX-signaal naar 1000 Hz audio (wat de fldigi/fventuri-decoder
verwacht), filtert, demoduleert USB en schrijft 16-bit mono audio op 12000 Hz
naar stdout.

Gebruik in een pipeline:
  airspyhf_rx -r stdout -f 0.520 -a 768000 -g on \
    | navtex_usb_demod.py --rate 768000 --center 520000 \
    | navtex_rx_from_file 12000

Parameters:
  --rate    samplerate van de IQ-stroom (Hz): 768000 of 192000
  --center  afstemfrequentie van de Airspy (Hz), bv. 520000
  --signal  frequentie van de NAVTEX-zender (Hz), standaard 518000
  --tone    gewenste audio-middenfrequentie (Hz), standaard 1000
  --spectrum PAD  (2026-09-08) schrijf 4x/s een spectrumregel (JSON) naar PAD,
            voor het spectrum/waterval-paneel in de app (zoals SDR++). Neem een
            pad op tmpfs (/dev/shm/...) — het bestand groeit ~8 kB/s en wordt
            bij 1 MB automatisch geleegd (de app-backend vangt dat op).
  --extra HZ:PAD  (2026-09-08) tweede zender op dezelfde IQ-stroom, bv.
            490000:/home/lex/navtex_berichten_490.txt — start een eigen
            decoder (--decoder, standaard "stdbuf -o0 navtex_rx_from_file
            12000") die naar PAD schrijft. Het brede spectrum toont dan alle
            zenders (veld "zenders"), met per zender een zoom ("zooms").
  --audio PAD     (2026-09-08) schrijf dezelfde 16-bit/12 kHz-audio die naar
            de decoder gaat óók naar PAD (tmpfs!), voor meeluisteren in de
            app (/api/navtex-audio-stream). 24 kB/s; bij 4 MB geleegd.
"""
import argparse
import fcntl
import json
import os
import queue
import shlex
import subprocess
import sys
import threading
import time
import numpy as np
from scipy.signal import firwin, lfilter, lfilter_zi

AUDIO_RATE = 12000

# Spectrum/waterval (2026-09-08, "zoals je dat in SDR++ ziet"):
#  - breed: ±SPEC_BREED_HZ rond de zender (518 kHz), uit de ruwe IQ,
#    SPEC_BINS waarden — daarop is de zender op 518 kHz een dunne streep.
#  - zoom: ±SPEC_ZOOM_HZ rond de zender, uit de gedemoduleerde 12 kHz-stroom
#    (daar zit de zender op +tone Hz), fijn genoeg om de twee FSK-tonen
#    (±85 Hz) los van elkaar te zien.
# Waarden zijn dB (gehele getallen, relatief; de app schaalt zelf).
SPEC_BINS = 256
SPEC_BREED_HZ = 12000.0
SPEC_BREED_MARGE_HZ = 6000.0  # marge buiten de buitenste zender bij meerdere zenders (490+518 -> 484-524)
SPEC_ZOOM_HZ = 1500.0
SPEC_FFT_BREED = 16384  # 47 Hz per FFT-bin, 4 per schermbin
SPEC_FFT_ZOOM = 2048  # kwart seconde op 12 kHz = 3000 samples
SPEC_MAX_BYTES = 1024 * 1024
AUDIO_MAX_BYTES = 4 * 1024 * 1024  # ~3 minuten op 12 kHz/16 bit


def spectrum_db(x, nfft, rate, f_mid, span_hz, bins):
    """Gemiddeld vermogensspectrum (dB) van complex signaal x, over
    [f_mid-span, f_mid+span] Hz (basisband-frequenties), herbemonsterd naar
    `bins` waarden. Meerdere FFT-vensters over het blok gemiddeld = rustiger
    beeld. Per schermbin het gemiddelde van de FFT-bins in een SYMMETRISCH
    venster rond de doelfrequentie (2026-09-08: de eerdere searchsorted-
    variant pakte steeds de bin erboven, waardoor het hele beeld tot één
    FFT-bin naar links verschoof — Lex zag het blok naast de 518-streep)."""
    if len(x) < nfft:
        x = np.concatenate([x, np.zeros(nfft - len(x), dtype=x.dtype)])
    nvens = len(x) // nfft
    venster = np.hanning(nfft)
    acc = np.zeros(nfft)
    for i in range(nvens):
        seg = x[i * nfft:(i + 1) * nfft] * venster
        acc += np.abs(np.fft.fft(seg)) ** 2
    acc = np.fft.fftshift(acc / nvens)
    binw = rate / nfft
    f0 = -rate / 2.0  # frequentie van acc[0] na fftshift (even nfft)
    doel = np.linspace(f_mid - span_hz, f_mid + span_hz, bins)
    stap = 2 * span_hz / (bins - 1)
    half = max(0, int(round(stap / binw / 2)))
    midden = np.rint((doel - f0) / binw).astype(int)
    uit = np.empty(bins)
    for k, m in enumerate(midden):
        lo = max(0, m - half)
        hi = min(nfft, m + half + 1)
        uit[k] = acc[lo:hi].mean() if hi > lo else acc[min(max(m, 0), nfft - 1)]
    return (10.0 * np.log10(uit + 1e-20)).round().astype(int).tolist()


class Stage:
    """FIR-laagdoorlaat + decimatie met doorlopende filtertoestand."""

    def __init__(self, ntaps, cutoff_hz, rate_in, decim):
        self.taps = firwin(ntaps, cutoff_hz / (rate_in / 2))
        self.zi = lfilter_zi(self.taps, 1.0).astype(np.complex128)
        self.decim = decim
        self.offset = 0  # decimatiefase over blokgrenzen heen

    def __call__(self, x):
        y, self.zi = lfilter(self.taps, 1.0, x, zi=self.zi)
        y = y[self.offset::self.decim]
        self.offset = (self.offset - len(x)) % self.decim
        return y


class Tak:
    """Eén zender: mengen naar de toon, filteren/decimeren, USB, AGC.
    (2026-09-08: uit main() gehaald zodat 490 kHz als tweede tak op dezelfde
    IQ-stroom kan meedraaien — "die ontvangen we nog helemaal niet?")"""

    def __init__(self, signal_hz, rate, center_hz, tone_hz, gain):
        self.signal = signal_hz
        self.tone = tone_hz
        self.gain = gain
        decim = rate // AUDIO_RATE          # 64 bij 768k, 16 bij 192k
        decim1 = decim // 4                 # eerste, grove stap
        rate2 = rate // decim1              # 48000
        # Signaal zit op (signal - center) Hz in de IQ-stroom; meng zo dat het op +tone uitkomt.
        self.dphi = 2 * np.pi * (tone_hz - (signal_hz - center_hz)) / rate
        self.phase = 0.0
        self.stage1 = Stage(64, 8000.0, rate, decim1)     # 768k -> 48k, ruim filter
        self.stage2 = Stage(256, 2500.0, rate2, 4)        # 48k -> 12k, USB-band 0..2500 Hz
        self.agc_level = None

    def verwerk(self, iq):
        """Geeft (complex 12 kHz-stroom met de zender op +tone, int16-PCM bytes)."""
        n = len(iq)
        t = self.phase + self.dphi * np.arange(n)   # doorlopende fase (geen klik op blokgrenzen)
        x = iq * np.exp(1j * t)
        self.phase = (t[-1] + self.dphi) % (2 * np.pi)
        x = self.stage2(self.stage1(x))
        audio = np.real(x)                            # USB: reëel deel van 0..2500 Hz
        rms = float(np.sqrt(np.mean(audio ** 2))) + 1e-12
        self.agc_level = rms if self.agc_level is None else 0.9 * self.agc_level + 0.1 * rms
        audio = audio / self.agc_level * self.gain * 32767.0
        return x, np.clip(audio, -32767, 32767).astype(np.int16).tobytes()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rate", type=int, required=True)
    ap.add_argument("--center", type=float, required=True)
    ap.add_argument("--signal", type=float, default=518000.0)
    ap.add_argument("--tone", type=float, default=1000.0)
    ap.add_argument("--gain", type=float, default=0.15,
                    help="doelamplitude (fractie van full scale) na normalisatie")
    ap.add_argument("--audio", default=None,
                    help="pad voor meeluister-audio (raw int16 12 kHz mono), bv. /dev/shm/navtex_audio.raw")
    ap.add_argument("--spectrum", default=None,
                    help="pad voor spectrumregels (JSONL), bv. /dev/shm/navtex_waterval.jsonl")
    ap.add_argument("--extra", action="append", default=[], metavar="HZ:PAD",
                    help="extra zender op dezelfde IQ-stroom, met eigen decoder die naar PAD "
                         "schrijft, bv. 490000:/home/lex/navtex_berichten_490.txt (herhaalbaar)")
    ap.add_argument("--decoder", default="stdbuf -o0 navtex_rx_from_file 12000",
                    help="decoder-commando voor de --extra-takken (leest 12 kHz int16 van stdin)")
    args = ap.parse_args()

    rate = args.rate
    if rate % AUDIO_RATE != 0:
        sys.exit(f"samplerate {rate} is geen veelvoud van {AUDIO_RATE}")

    hoofd = Tak(args.signal, rate, args.center, args.tone, args.gain)
    extras = []  # [(Tak, Popen)]
    for spec in args.extra:
        hz, _, pad = spec.partition(":")
        if not pad:
            sys.exit(f"--extra verwacht HZ:PAD, kreeg {spec!r}")
        uit = open(pad, "ab", buffering=0)
        proc = subprocess.Popen(shlex.split(args.decoder), stdin=subprocess.PIPE, stdout=uit, stderr=sys.stderr)
        extras.append((Tak(float(hz), rate, args.center, args.tone, args.gain), proc))

    # Breed spectrum: alle zenders in beeld, gecentreerd op hun midden, met
    # SPEC_BREED_HZ marge buiten de buitenste zenders (één zender: ±SPEC_BREED_HZ).
    zenders = [hoofd.signal] + [t.signal for t, _ in extras]
    spec_midden = (min(zenders) + max(zenders)) / 2.0
    spec_breed = (max(zenders) - min(zenders)) / 2.0 + (SPEC_BREED_HZ if len(zenders) == 1 else SPEC_BREED_MARGE_HZ)

    chunk = rate // 4  # kwart seconde per blok
    stdin = sys.stdin.buffer
    stdout = sys.stdout.buffer

    # 2026-09-08: de pipe van airspyhf_rx naar dit script is standaard 64 kB
    # = ~10 ms aan IQ; zodra dit script langer dan dat met een blok bezig is
    # blokkeert airspyhf_rx en laat de Airspy-driver stilletjes samples vallen
    # (verdacht bij rommelige ontvangst van zwakkere zenders terwijl Oostende
    # schoon doorkomt). Daarom: pipe naar 1 MB (~170 ms) én een leesthread die
    # de pipe altijd leeg houdt, met een wachtrij van 8 blokken (2 s). Loopt
    # die wachtrij toch vol, dan wordt dat expliciet gemeld op stderr (journal).
    try:
        fcntl.fcntl(stdin.fileno(), 1031, 1 << 20)  # F_SETPIPE_SZ
    except OSError as e:
        print(f"pipe vergroten mislukt (geen probleem, wel minder marge): {e}", file=sys.stderr)
    wachtrij = queue.Queue(maxsize=8)

    def lezer():
        weggevallen = 0
        while True:
            raw = stdin.read(chunk * 8)
            if not raw:
                wachtrij.put(None)
                return
            try:
                wachtrij.put_nowait(raw)
            except queue.Full:
                weggevallen += 1
                print(f"WAARSCHUWING: verwerking loopt achter, blok {weggevallen} weggegooid", file=sys.stderr)

    threading.Thread(target=lezer, daemon=True).start()
    spec_f = None
    if args.spectrum:
        spec_f = open(args.spectrum, "a", buffering=1)
    audio_f = None
    if args.audio:
        audio_f = open(args.audio, "ab", buffering=0)
    while True:
        raw = wachtrij.get()
        if raw is None:
            break
        n = len(raw) // 8
        if n == 0:
            break
        iq = np.frombuffer(raw[: n * 8], dtype=np.complex64).astype(np.complex128)

        # breed spectrum uit de ruwe IQ (vóór het mengen; 0 Hz in de IQ = --center)
        b_spec = spectrum_db(iq, SPEC_FFT_BREED, rate, spec_midden - args.center, spec_breed, SPEC_BINS) if spec_f else None

        x, pcm = hoofd.verwerk(iq)
        stdout.write(pcm)
        stdout.flush()
        if audio_f:
            try:
                if audio_f.tell() > AUDIO_MAX_BYTES:
                    audio_f.seek(0)
                    audio_f.truncate()
                audio_f.write(pcm)
            except OSError as e:
                print(f"audio schrijven mislukt: {e}", file=sys.stderr)

        zooms = []
        if spec_f:
            zooms.append({"f": hoofd.signal, "d": spectrum_db(x, SPEC_FFT_ZOOM, AUDIO_RATE, hoofd.tone, SPEC_ZOOM_HZ, SPEC_BINS)})

        for tak, proc in extras:
            x2, pcm2 = tak.verwerk(iq)
            try:
                proc.stdin.write(pcm2)
                proc.stdin.flush()
            except (BrokenPipeError, OSError) as e:
                print(f"decoder voor {tak.signal:.0f} Hz weg ({e}); stop", file=sys.stderr)
                sys.exit(1)  # systemd herstart de hele pipeline
            if spec_f:
                zooms.append({"f": tak.signal, "d": spectrum_db(x2, SPEC_FFT_ZOOM, AUDIO_RATE, tak.tone, SPEC_ZOOM_HZ, SPEC_BINS)})

        if spec_f:
            try:
                if spec_f.tell() > SPEC_MAX_BYTES:
                    spec_f.seek(0)
                    spec_f.truncate()
                spec_f.write(json.dumps({
                    "t": round(time.time(), 2),
                    "midden": spec_midden, "breed": spec_breed,
                    "zender": hoofd.signal, "zoom": SPEC_ZOOM_HZ,
                    "zenders": zenders,
                    "b": b_spec, "z": zooms[0]["d"], "zooms": zooms,
                }, separators=(",", ":")) + "\n")
            except OSError as e:
                print(f"spectrum schrijven mislukt: {e}", file=sys.stderr)


if __name__ == "__main__":
    main()
