# NAVTEX via Airspy HF+ op lexdev-nw — installatie

Vervangt de ATS Mini + line-in in de bestaande pipeline. Het bestand
`~/navtex_berichten.txt` en `navtexLokaal.js` blijven ongewijzigd.

Keten:  Airspy (IQ, 768 kS/s, afgestemd op 520 kHz)
        → `navtex_usb_demod.py` (USB-demodulatie, NAVTEX-tonen op 1000 Hz, 12 kHz audio)
        → `navtex_rx_from_file 12000` (fventuri/navtex — al aanwezig)
        → `tee -a ~/navtex_berichten.txt`

Waarom 520 kHz en niet 518: dan staat de zender op -2 kHz in de IQ-stroom
i.p.v. precies op 0 Hz (daar zit bij elke SDR de meeste rommel).
Waarom een 1000 Hz-toon: dat verwacht de decoder (de ATS Mini stond daarom
op 517.000 USB — dat was dus géén afrondfout).

## Stappen (eenmalig, op lexdev-nw)

1. Python-afhankelijkheden:
       sudo apt install -y python3-numpy python3-scipy

2. Demodulator plaatsen (bestanden staan in ~/navtex-airspy na sync):
       sudo install -m 755 ~/navtex-airspy/navtex_usb_demod.py /usr/local/bin/navtex_usb_demod.py

3. Handmatige test (30 s, moet audio opleveren en bij een uitzending tekst):
       airspyhf_rx -r stdout -f 0.520 -a 768000 -g on -n 23040000 \
         | navtex_usb_demod.py --rate 768000 --center 520000 \
         | navtex_rx_from_file 12000

4. Dienst installeren:
       sudo install -m 644 ~/navtex-airspy/navtex-airspy.service /etc/systemd/system/
       sudo systemctl daemon-reload
       sudo systemctl enable --now navtex-airspy.service

5. Meekijken:
       journalctl -u navtex-airspy -f        # foutmeldingen
       tail -f ~/navtex_berichten.txt        # gedecodeerde berichten

6. Linger aanzetten (2026-09-09, eenmalig):
       sudo loginctl enable-linger lex
   Zonder dit ruimt systemd-logind bij het uitloggen van lex (bv. het einde
   van een syncweer-ssh-sessie) diens bestanden in /dev/shm op (RemoveIPC=yes).
   De demodulator schrijft dan door naar een verwijderd bestand en het
   spectrum/waterval-paneel en meeluisteren in de app vallen stil
   ("geen spectrumdata").

Sinds 2026-09-09 synct `syncweer` tools/navtex-airspy mee en installeert
script + service-bestand automatisch (met herstart) als ze verschillen van
wat in /usr/local/bin en /etc/systemd/system staat; stap 2 en 4 zijn dus
alleen nog voor een eerste installatie.

## Let op

- SDR++ server (`sdrpp --server`) en deze dienst kunnen NIET tegelijk de
  Airspy gebruiken. Wil je luisteren met SDR++: `sudo systemctl stop navtex-airspy`,
  daarna weer `start`. (Zelfde patroon als rtl-luister ↔ ais-catcher; een
  `Conflicts=`-regel kan later als SDR++-server ook een dienst wordt.)
- Uitzendtijden 518 kHz (lokale tijd, zomer): Den Helder (P) 04:30/08:30/12:30/16:30/20:30/00:30,
  Oostende (T) 05:10/09:10/13:10/17:10/21:10/01:10, Niton (K) 03:40/07:40/11:40/15:40/19:40/23:40.
