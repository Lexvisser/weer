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

## Let op

- SDR++ server (`sdrpp --server`) en deze dienst kunnen NIET tegelijk de
  Airspy gebruiken. Wil je luisteren met SDR++: `sudo systemctl stop navtex-airspy`,
  daarna weer `start`. (Zelfde patroon als rtl-luister ↔ ais-catcher; een
  `Conflicts=`-regel kan later als SDR++-server ook een dienst wordt.)
- Uitzendtijden 518 kHz (lokale tijd, zomer): Den Helder (P) 04:30/08:30/12:30/16:30/20:30/00:30,
  Oostende (T) 05:10/09:10/13:10/17:10/21:10/01:10, Niton (K) 03:40/07:40/11:40/15:40/19:40/23:40.
