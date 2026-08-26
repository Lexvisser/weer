import asyncio
import json
import sys

import websockets

APIKEY = sys.argv[1] if len(sys.argv) > 1 else "PLAK_HIER_JE_SLEUTEL"


async def main():
    print("verbinden...")
    async with websockets.connect("wss://stream.aisstream.io/v0/stream") as ws:
        print("verbonden, abonneren...")
        await ws.send(
            json.dumps(
                {
                    "APIKey": APIKEY,
                    "BoundingBoxes": [[[50.5, 2.0], [54.0, 7.6]]],
                    "FilterMessageTypes": ["PositionReport"],
                }
            )
        )
        print("abonnement verzonden, wachten op berichten (30s max)...")
        try:
            for i in range(10):
                msg = await asyncio.wait_for(ws.recv(), timeout=30)
                print(f"--- bericht {i + 1} ---")
                print(msg[:500])
        except asyncio.TimeoutError:
            print("30s voorbij, nog geen bericht ontvangen.")


asyncio.run(main())
