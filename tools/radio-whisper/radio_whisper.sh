#!/bin/bash
# radio_whisper.sh — 2026-09-09. Haalt een radiostream op, knipt 'm in blokken
# van BLOK seconden en zet elk blok met whisper.cpp om in tekst, die met
# tijdstempel achter UIT wordt geplakt (zelfde bestand-ertussen-patroon als
# NAVTEX: de app leest het bestand, de dienst weet niets van de app).
# Instellingen in ~/radio-whisper.conf (URL, MODEL, BLOK, UIT, THREADS).
set -u
CONF="${1:-$HOME/radio-whisper.conf}"
# shellcheck disable=SC1090
source "$CONF"
: "${BLOK:=30}" "${THREADS:=6}" "${UIT:=$HOME/radio_tekst.txt}"
WHISPER="${WHISPER:-$HOME/whisper.cpp/build/bin/whisper-cli}"
WERK=/dev/shm/radio-whisper
mkdir -p "$WERK"
rm -f "$WERK"/*.wav

echo "[radio-whisper] start: ${STATION:-?} $URL, blok ${BLOK}s, model $(basename "$MODEL") -> $UIT" >&2
# kopregel zodat de app weet welke zender dit is (id uit frontend/data/nwr-stations.json)
[ -n "${STATION:-}" ] && printf '[%s] #station %s\n' "$(date +%Y%m%d-%H%M%S)" "$STATION" >> "$UIT"
ffmpeg -loglevel error -nostdin \
  -reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 10 \
  -i "$URL" -ac 1 -ar 16000 \
  -f segment -segment_time "$BLOK" -reset_timestamps 1 -strftime 1 \
  "$WERK/%Y%m%d-%H%M%S.wav" &
FFPID=$!
trap 'kill $FFPID 2>/dev/null' EXIT

while kill -0 "$FFPID" 2>/dev/null; do
  # alle afgeronde blokken (het nieuwste bestand is nog in opname)
  for f in $(ls "$WERK"/*.wav 2>/dev/null | head -n -1); do
    tijd=$(basename "$f" .wav)
    tekst=$("$WHISPER" -m "$MODEL" -f "$f" -t "$THREADS" -nt 2>/dev/null | sed 's/^ *//; s/ *$//' | grep -v '^$' | tr '\n' ' ')
    printf '[%s] %s\n' "$tijd" "$tekst" >> "$UIT"
    rm -f "$f"
  done
  sleep 2
done
echo "[radio-whisper] ffmpeg gestopt" >&2
exit 1
