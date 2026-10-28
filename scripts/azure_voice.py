"""Generates the voiceover for a Remotion episode with Azure AI Speech.

Usage (from the project root):
    pip install azure-cognitiveservices-speech requests
    python scripts/azure_voice.py remotion/episodes/mariana.json

What it does:
  1. Speaks each narration line with the channel voice.
  2. Retimes the episode so each scene lasts as long as its line plus a short beat
     (the animation stretches or shrinks to match), so there are no long gaps.
  3. Writes the voice track to remotion/public/audio/<episode>.mp3 (about -14 LUFS).
  4. Writes word timings back into the episode JSON, so captions highlight each word as it is spoken.
  5. Builds the music and sound-effects bed with sound_design.py.

Needs AZURE_SPEECH_KEY in .env. AZURE_SPEECH_REGION is optional: if it is blank the script finds it.
Optional AZURE_VOICE (default en-US-AndrewNeural) and AZURE_RATE (speaking speed in %, default 5).
"""
import array
import json
import os
import subprocess
import sys
import wave

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import requests
import azure.cognitiveservices.speech as speechsdk

from scripts.env_config import ROOT, ENV_PATH, load_dotenv
from scripts.episode_timing import LEAD_IN, end_time, fit_timeline
from scripts import sound_design

if sys.stdout is not None and sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

SAMPLE_RATE = 24000
REGIONS = [
    "southafricanorth", "eastus", "eastus2", "westus", "westus2", "westus3", "centralus",
    "northcentralus", "southcentralus", "westeurope", "northeurope", "uksouth", "francecentral",
    "germanywestcentral", "swedencentral", "switzerlandnorth", "canadacentral", "brazilsouth",
    "australiaeast", "southeastasia", "eastasia", "japaneast", "koreacentral", "centralindia",
    "uaenorth",
]


def find_region(key: str) -> str:
    region = os.environ.get("AZURE_SPEECH_REGION", "").strip()
    if region:
        return region
    print("AZURE_SPEECH_REGION not set, looking for your resource's region...")
    for r in REGIONS:
        try:
            resp = requests.post(
                f"https://{r}.api.cognitive.microsoft.com/sts/v1.0/issueToken",
                headers={"Ocp-Apim-Subscription-Key": key, "Content-Length": "0"},
                timeout=8,
            )
        except requests.RequestException:
            continue
        if resp.status_code == 200:
            print(f"Found region: {r} (saved to .env)")
            with open(ENV_PATH, "a", encoding="utf-8") as f:
                f.write(f"AZURE_SPEECH_REGION={r}\n")
            return r
    raise SystemExit(
        "Couldn't find the region for this key. In the Azure portal, open your Speech resource, "
        "go to Keys and Endpoint, and add its Location to .env as AZURE_SPEECH_REGION=..."
    )


def ssml_for(text: str, voice: str, rate: int) -> tuple[str, int]:
    """Returns the SSML and the character offset where the line's text starts inside it."""
    if any(ch in text for ch in "&<>"):
        raise SystemExit(f"Remove &, < or > from this narration line: {text}")
    head = (
        '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">'
        f'<voice name="{voice}"><prosody rate="{rate:+d}%">'
    )
    return head + text + "</prosody></voice></speak>", len(head)


def speak(synth_config, text: str, voice: str, rate: int):
    """Speaks one line. Returns (16-bit mono samples, duration in s, word timings)."""
    synth = speechsdk.SpeechSynthesizer(speech_config=synth_config, audio_config=None)
    ssml, text_start = ssml_for(text, voice, rate)
    words = []

    def on_word(evt):
        if evt.boundary_type != speechsdk.SpeechSynthesisBoundaryType.Word:
            return
        start = evt.audio_offset / 10_000_000
        dur = evt.duration.total_seconds()
        char = evt.text_offset - text_start
        words.append({"start": start, "end": start + dur, "char": char, "len": evt.word_length})

    synth.synthesis_word_boundary.connect(on_word)
    result = synth.speak_ssml_async(ssml).get()
    if result.reason != speechsdk.ResultReason.SynthesizingAudioCompleted:
        details = result.cancellation_details
        raise SystemExit(f"Azure synthesis failed: {details.reason} {details.error_details}")
    samples = array.array("h")
    samples.frombytes(result.audio_data)
    return samples, len(samples) / SAMPLE_RATE, words


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python scripts/azure_voice.py remotion/episodes/<episode>.json")
    episode_path = os.path.abspath(sys.argv[1])
    name = os.path.splitext(os.path.basename(episode_path))[0]

    load_dotenv()
    key = os.environ.get("AZURE_SPEECH_KEY", "").strip()
    if not key:
        raise SystemExit("Add AZURE_SPEECH_KEY to .env first.")
    region = find_region(key)
    voice = os.environ.get("AZURE_VOICE", "en-US-AndrewNeural")

    cfg = speechsdk.SpeechConfig(subscription=key, region=region)
    cfg.set_speech_synthesis_output_format(speechsdk.SpeechSynthesisOutputFormat.Raw24Khz16BitMonoPcm)

    with open(episode_path, "r", encoding="utf-8") as f:
        ep = json.load(f)

    rate = int(os.environ.get("AZURE_RATE", "5"))
    spoken = []
    for i, line in enumerate(ep["narration"]):
        samples, dur, words = speak(cfg, line["text"], voice, rate)
        spoken.append((samples, words))
        print(f"[{i + 1}/{len(ep['narration'])}] {dur:4.2f}s  {line['heading']}")

    old_end = end_time(ep)
    fit_timeline(ep, [len(s) / SAMPLE_RATE for s, _ in spoken])
    print(f"\nRetimed to fit the voice: {old_end:.1f}s -> {end_time(ep):.1f}s")

    track = array.array("h", bytes(2 * int((end_time(ep) + 1) * SAMPLE_RATE)))
    for line, (samples, words) in zip(ep["narration"], spoken):
        offset = line["from"] + LEAD_IN
        pos = int(offset * SAMPLE_RATE)
        track[pos:pos + len(samples)] = samples
        line["words"] = [
            {"start": round(offset + w["start"], 3), "end": round(offset + w["end"], 3), "char": w["char"], "len": w["len"]}
            for w in words
        ]

    audio_dir = os.path.join(ROOT, "remotion", "public", "audio")
    os.makedirs(audio_dir, exist_ok=True)
    raw_path = os.path.join(audio_dir, f"{name}_raw.wav")
    mp3_path = os.path.join(audio_dir, f"{name}.mp3")
    with wave.open(raw_path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(track.tobytes())
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", raw_path, "-af", "loudnorm=I=-14:TP=-1.5:LRA=11",
         "-ar", "48000", "-b:a", "192k", mp3_path],
        check=True,
    )
    os.remove(raw_path)

    ep["voiceover"] = f"audio/{name}.mp3"
    ep["music"] = sound_design.build(ep, os.path.join(audio_dir, f"{name}_bed.mp3"))
    with open(episode_path, "w", encoding="utf-8") as f:
        json.dump(ep, f, indent=2)
        f.write("\n")
    print(f"\nVoiceover: {mp3_path}\nWord timings saved to {episode_path}")


if __name__ == "__main__":
    main()
