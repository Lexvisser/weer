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
"""
import argparse
import json
import os
import sys
import time
import numpy as np
from scipy.signal import firwin, lfilter, lfilter_zi

AUDIO_RATE = 12000

# Spectrum/waterval (2026-09-08, "zoals je dat in SDR++ ziet"):
#  - breed: ±SPEC_BREED_HZ rond de Airspy-afstemfrequentie, uit de ruwe IQ,
#    SPEC_BINS waarden — daarop is de zender op 518 kHz een dunne streep.
#  - zoom: ±SPEC_ZOOM_HZ rond de zender, uit de gedemoduleerde 12 kHz-stroom
#    (daar zit de zender op +tone Hz), fijn genoeg om de twee FSK-tonen
#    (±85 Hz) los van elkaar te zien.
# Waarden zijn dB (gehele getallen, relatief; de app schaalt zelf).
SPEC_BINS = 256
SPEC_BREED_HZ = 12000.0
SPEC_ZOOM_HZ = 1500.0
SPEC_FFT_BREED = 8192
SPEC_FFT_ZOOM = 2048  # kwart seconde op 12 kHz = 3000 samples
SPEC_MAX_BYTES = 1024 * 1024


def spectrum_db(x, nfft, rate, f_mid, span_hz, bins):
    """Gemiddeld vermogensspectrum (dB) van complex signaal x, over
    [f_mid-span, f_mid+span] Hz (basisband-frequenties), herbemonsterd naar
    `bins` waarden. Meerdere FFT-vensters over het blok gemiddeld = rustiger
    beeld."""
    if len(x) < nfft:
        x = np.concatenate([x, np.zeros(nfft - len(x), dtype=x.dtype)])
    nvens = len(x) // nfft
    venster = np.hanning(nfft)
    acc = np.zeros(nfft)
    for i in range(nvens):
        seg = x[i * nfft:(i + 1) * nfft] * venster
        acc += np.abs(np.fft.fft(seg)) ** 2
    acc = np.fft.fftshift(acc / nvens)
    freqs = np.fft.fftshift(np.fft.fftfreq(nfft, 1.0 / rate))
    doel = np.linspace(f_mid - span_hz, f_mid + span_hz, bins)
    # per doel-bin het gemiddelde van de FFT-bins die erin vallen
    idx = np.searchsorted(freqs, doel)
    idx = np.clip(idx, 1, nfft - 1)
    breedte = max(1, int(round((2 * span_hz / bins) / (rate / nfft))))
    uit = np.empty(bins)
    for k, i in enumerate(idx):
        lo = max(0, i - breedte // 2)
        uit[k] = acc[lo:lo + breedte].mean()
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rate", type=int, required=True)
    ap.add_argument("--center", type=float, required=True)
    ap.add_argument("--signal", type=float, default=518000.0)
    ap.add_argument("--tone", type=float, default=1000.0)
    ap.add_argument("--gain", type=float, default=0.15,
                    help="doelamplitude (fractie van full scale) na normalisatie")
    ap.add_argument("--spectrum", default=None,
                    help="pad voor spectrumregels (JSONL), bv. /dev/shm/navtex_waterval.jsonl")
    args = ap.parse_args()

    rate = args.rate
    if rate % AUDIO_RATE != 0:
        sys.exit(f"samplerate {rate} is geen veelvoud van {AUDIO_RATE}")
    decim = rate // AUDIO_RATE          # 64 bij 768k, 16 bij 192k
    decim1 = decim // 4                 # eerste, grove stap
    rate2 = rate // decim1              # 48000

    # Signaal zit op (signal - center) Hz in de IQ-stroom; meng zo dat het op +tone uitkomt.
    shift_hz = args.tone - (args.signal - args.center)
    dphi = 2 * np.pi * shift_hz / rate

    stage1 = Stage(64, 8000.0, rate, decim1)     # 768k -> 48k, ruim filter
    stage2 = Stage(256, 2500.0, rate2, 4)        # 48k -> 12k, USB-band 0..2500 Hz

    chunk = rate // 4  # kwart seconde per blok
    phase = 0.0
    agc_level = None

    stdin = sys.stdin.buffer
    stdout = sys.stdout.buffer
    spec_f = None
    if args.spectrum:
        spec_f = open(args.spectrum, "a", buffering=1)
    while True:
        raw = stdin.read(chunk * 8)
        if not raw:
            break
        n = len(raw) // 8
        if n == 0:
            break
        iq = np.frombuffer(raw[: n * 8], dtype=np.complex64).astype(np.complex128)

        # breed spectrum uit de ruwe IQ (vóór het mengen; 0 Hz = --center)
        spec_breed = spectrum_db(iq, SPEC_FFT_BREED, rate, 0.0, SPEC_BREED_HZ, SPEC_BINS) if spec_f else None

        # mengen met doorlopende fase (geen klik op blokgrenzen)
        t = phase + dphi * np.arange(n)
        iq = iq * np.exp(1j * t)
        phase = (t[-1] + dphi) % (2 * np.pi)

        iq = stage2(stage1(iq))

        if spec_f:
            # zoom rond de zender: die staat nu op +tone Hz in deze 12 kHz-stroom
            spec_zoom = spectrum_db(iq, SPEC_FFT_ZOOM, AUDIO_RATE, args.tone, SPEC_ZOOM_HZ, SPEC_BINS)
            try:
                if spec_f.tell() > SPEC_MAX_BYTES:
                    spec_f.seek(0)
                    spec_f.truncate()
                spec_f.write(json.dumps({
                    "t": round(time.time(), 2),
                    "midden": args.center, "breed": SPEC_BREED_HZ,
                    "zender": args.signal, "zoom": SPEC_ZOOM_HZ,
                    "b": spec_breed, "z": spec_zoom,
                }, separators=(",", ":")) + "\n")
            except OSError as e:
                print(f"spectrum schrijven mislukt: {e}", file=sys.stderr)

        # USB-demodulatie: reëel deel van het signaal dat nu alleen 0..2500 Hz bevat
        audio = np.real(iq)

        # langzame normalisatie zodat de decoder een net, niet-clippend niveau krijgt
        rms = float(np.sqrt(np.mean(audio ** 2))) + 1e-12
        agc_level = rms if agc_level is None else 0.9 * agc_level + 0.1 * rms
        audio = audio / agc_level * args.gain * 32767.0
        stdout.write(np.clip(audio, -32767, 32767).astype(np.int16).tobytes())
        stdout.flush()


if __name__ == "__main__":
    main()
