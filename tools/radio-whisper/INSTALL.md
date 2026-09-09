# radio-whisper — installatie op lexdev-nw

Vereist: `~/whisper.cpp` gebouwd (`build/bin/whisper-cli`) met `models/ggml-small.en.bin`, en `ffmpeg`.

```
sudo install -m 755 radio_whisper.sh /usr/local/bin/radio_whisper.sh
cp radio-whisper.conf ~/radio-whisper.conf          # stream-adres hierin aanpassen
sudo install -m 644 radio-whisper.service /etc/systemd/system/radio-whisper.service
sudo systemctl daemon-reload && sudo systemctl enable --now radio-whisper
tail -f ~/radio_tekst.txt
```

Let op: `tools/` gaat niet mee met Syncweer; deze map is handmatig op de server gezet.
