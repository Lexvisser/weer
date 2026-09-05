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
"""
import argparse
import sys
import numpy as np
from scipy.signal import firwin, lfilter, lfilter_zi

AUDIO_RATE = 12000


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
    while True:
        raw = stdin.read(chunk * 8)
        if not raw:
            break
        n = len(raw) // 8
        if n == 0:
            break
        iq = np.frombuffer(raw[: n * 8], dtype=np.complex64).astype(np.complex128)

        # mengen met doorlopende fase (geen klik op blokgrenzen)
        t = phase + dphi * np.arange(n)
        iq = iq * np.exp(1j * t)
        phase = (t[-1] + dphi) % (2 * np.pi)

        iq = stage2(stage1(iq))

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
