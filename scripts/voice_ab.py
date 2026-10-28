"""Blind voice test: reads the same narration in several voices and sends each to Telegram as "Voice A, B, C…".

The answer key (which letter is which voice, plus its speaking speed) follows as a spoiler message,
so you can pick by ear first. Run it from GitHub: Actions → Voice A/B test → Run workflow.

Voices (each is skipped, with the reason in the answer key, if its key is missing or the service refuses):
  Azure en-US-AndrewNeural, as used now (+5% speed)    AZURE_SPEECH_KEY, AZURE_SPEECH_REGION
  Azure Andrew, Dragon HD                              same
  Azure Andrew, Dragon HD Omni                         same
  Google Gemini TTS (Charon, with a style prompt)      GEMINI_API_KEY  (Google AI Studio key)
  Google Chirp 3 HD (Charon)                           GEMINI_API_KEY, with the Cloud Text-to-Speech API enabled on its project

Keys are always sent in request headers, never in URLs, so they can't appear in logs.
"""
import base64
import json
import os
import random
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import requests

if sys.stdout is not None and sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

# Four lines from the Titanic episode: a hook, two facts with numbers, and the twist.
LINES = [
    "The Titanic is down there. And you're sinking straight toward it.",
    "Past one thousand metres, sunlight can't reach at all. You're sinking through total darkness.",
    "Three thousand eight hundred metres down, the Titanic's bow rises out of the dark.",
    "The twist? A rust-eating bacterium, Halomonas titanicae, is slowly eating the ship's iron.",
]
TEXT = " ".join(LINES)
STYLE = ("Read this as a calm, curious science documentary narrator for a YouTube Short: warm and clear, "
         "with a hint of awe at the big reveals and natural pauses between sentences.")


def _azure(voice: str, rate: str | None = None) -> bytes:
    key, region = os.environ.get("AZURE_SPEECH_KEY"), os.environ.get("AZURE_SPEECH_REGION")
    if not key or not region:
        raise RuntimeError("AZURE_SPEECH_KEY / AZURE_SPEECH_REGION not set")
    body = TEXT if rate is None else f'<prosody rate="{rate}">{TEXT}</prosody>'
    ssml = ('<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">'
            f'<voice name="{voice}">{body}</voice></speak>')
    r = requests.post(
        f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1",
        headers={"Ocp-Apim-Subscription-Key": key, "Content-Type": "application/ssml+xml",
                 "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3", "User-Agent": "innovatio-voice-ab"},
        data=ssml.encode("utf-8"), timeout=120)
    if r.status_code != 200:
        raise RuntimeError(f"Azure {r.status_code}: {r.text[:200] or r.reason}"
                           + (" (this voice may not be offered in your region)" if r.status_code in (400, 404) else ""))
    return r.content


def _gemini() -> tuple[bytes, str]:
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise RuntimeError("GEMINI_API_KEY not set")
    last = ""
    for model in ("gemini-2.5-flash-preview-tts", "gemini-2.5-flash-tts", "gemini-3.1-flash-tts-preview"):
        r = requests.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
            headers={"x-goog-api-key": key, "Content-Type": "application/json"},
            json={"contents": [{"parts": [{"text": f"{STYLE}\n\n{TEXT}"}]}],
                  "generationConfig": {"responseModalities": ["AUDIO"],
                                       "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": "Charon"}}}}},
            timeout=180)
        if r.status_code == 200:
            part = r.json()["candidates"][0]["content"]["parts"][0]["inlineData"]
            return base64.b64decode(part["data"]), model  # 16-bit mono PCM, 24 kHz
        last = f"{model}: {r.status_code} {r.text[:160]}"
    raise RuntimeError(f"Gemini TTS refused ({last})")


def _chirp() -> bytes:
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise RuntimeError("GEMINI_API_KEY not set")
    r = requests.post(
        "https://texttospeech.googleapis.com/v1/text:synthesize",
        headers={"x-goog-api-key": key, "Content-Type": "application/json"},
        json={"input": {"text": TEXT}, "voice": {"languageCode": "en-US", "name": "en-US-Chirp3-HD-Charon"},
              "audioConfig": {"audioEncoding": "MP3", "sampleRateHertz": 24000}},
        timeout=120)
    if r.status_code != 200:
        hint = " (enable the Cloud Text-to-Speech API on the key's project)" if r.status_code == 403 else ""
        raise RuntimeError(f"Chirp {r.status_code}: {r.text[:160]}{hint}")
    return base64.b64decode(r.json()["audioContent"])


def _to_mp3(raw: bytes, out: str, pcm: bool = False) -> float:
    """Levels every sample to the same loudness (so louder doesn't sound better) and returns its length in s."""
    src = out + (".pcm" if pcm else ".in.mp3")
    with open(src, "wb") as f:
        f.write(raw)
    fmt = ["-f", "s16le", "-ar", "24000", "-ac", "1"] if pcm else []
    subprocess.run(["ffmpeg", "-v", "error", "-y", *fmt, "-i", src, "-af", "loudnorm=I=-16:TP=-1.5",
                    "-ar", "44100", "-b:a", "160k", out], check=True)
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out],
                               capture_output=True, text=True, check=True).stdout.strip())
    return dur


def main():
    voices = [
        ("Azure Andrew (current voice, +5%)", lambda: (_azure("en-US-AndrewNeural", "+5%"), False, "")),
        ("Azure Andrew Dragon HD", lambda: (_azure("en-US-Andrew:DragonHDLatestNeural"), False, "")),
        ("Azure Andrew Dragon HD Omni", lambda: (_azure("en-us-Andrew:DragonHDOmniLatestNeural"), False, "")),
        ("Google Gemini TTS (Charon, style prompt)", lambda: (*_gemini_pcm(), )),
        ("Google Chirp 3 HD (Charon)", lambda: (_chirp(), False, "")),
    ]
    random.shuffle(voices)
    token, chat = os.environ["TELEGRAM_BOT_TOKEN"], os.environ["TELEGRAM_CHAT_ID"]
    api = f"https://api.telegram.org/bot{token}"
    words = len(TEXT.split())
    key_lines, letter = [], ord("A")
    tmp = tempfile.mkdtemp()
    requests.post(f"{api}/sendMessage", json={"chat_id": chat, "text": (
        "🎙 Voice test: the same four Titanic lines in different voices, levelled to the same loudness. "
        "Listen to each and reply with the letter you like best. The answer key follows as a spoiler.")}, timeout=30)
    for name, make in voices:
        try:
            raw, pcm, note = make()
            path = os.path.join(tmp, f"voice_{chr(letter)}.mp3")
            dur = _to_mp3(raw, path, pcm=pcm)
        except Exception as e:  # noqa: BLE001 - one failing voice must not stop the test
            print(f"skipped {name}: {e}")
            key_lines.append(f"(skipped) {name}: {str(e)[:180]}")
            continue
        wpm = round(words / dur * 60)
        with open(path, "rb") as f:
            r = requests.post(f"{api}/sendAudio", data={"chat_id": chat, "title": f"Voice {chr(letter)}",
                                                         "performer": "Innovatio voice test",
                                                         "caption": f"Voice {chr(letter)}"},
                              files={"audio": (f"Voice {chr(letter)}.mp3", f, "audio/mpeg")}, timeout=120)
        r.raise_for_status()
        print(f"Voice {chr(letter)}: {name}, {dur:.1f}s, {wpm} wpm {note}")
        key_lines.append(f"{chr(letter)}: {name}, {wpm} words/min {note}".strip())
        letter += 1
    answer = "\n".join(key_lines)
    requests.post(f"{api}/sendMessage", json={"chat_id": chat, "parse_mode": "HTML",
                                              "text": f"Answer key:\n<tg-spoiler>{answer}</tg-spoiler>"}, timeout=30)
    print("\nAnswer key:\n" + answer)


def _gemini_pcm():
    pcm, model = _gemini()
    return pcm, True, f"[{model}]"


if __name__ == "__main__":
    main()
