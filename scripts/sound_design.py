"""Builds an original music and sound-effects bed for an episode (Descent, Fall or Orbit template).

Everything is synthesised here from sine waves and noise, so there is nothing to license.

Music style comes from SOUND_STYLE in .env:
  lobby (default)  light bossa lobby music: electric piano, bass, shaker, vibraphone
  ambient          a pad and drone that darken with depth, plus water texture

Sound effects on top. An episode with an "sfx" list gets exactly those (each a need from
source_sfx.py and a moment: seconds, "fallAt"/"diagramAt", "skit", or "depth:<metres>").
Every episode with an end skit also gets a cartoon pop as the mascot appears.
Otherwise the Descent schedule: a sonar ping at each new zone, hull creaks in the deep,
a thud when the sub lands, and a whoosh into the plates scene.

Usually run for you by azure_voice.py. To rebuild the bed alone:
    python scripts/sound_design.py remotion/episodes/mariana.json
"""
import json
import math
import os
import random
import subprocess
import sys
import wave
from array import array

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from scripts.episode_timing import depth_at, end_time, skit_span

SR = 32000
CTRL = 160  # samples per control step (200 Hz control rate)
TAU = 2 * math.pi


def _crossings(ep: dict, depth: float, end: float) -> float | None:
    """First time the sub passes `depth`, scanning at 50 Hz."""
    steps = int(end * 50)
    prev = depth_at(ep, 0)
    for i in range(1, steps + 1):
        t = i / 50
        d = depth_at(ep, t)
        if prev < depth <= d:
            return t
        prev = d
    return None


def _add(buf, start_s: float, samples):
    start = int(start_s * SR)
    for i, s in enumerate(samples):
        j = start + i
        if 0 <= j < len(buf):
            buf[j] += s


def _ping(rng):
    out = []
    for i in range(int(2.2 * SR)):
        t = i / SR
        env = math.exp(-t / 0.32) * min(1.0, t / 0.004)
        echo = 0.0
        if t > 0.45:
            te = t - 0.45
            echo = 0.32 * math.exp(-te / 0.4) * math.sin(TAU * 1318 * te)
        out.append(0.30 * (env * (math.sin(TAU * 1320 * t) + 0.25 * math.sin(TAU * 2640 * t)) + echo))
    return out


def _creak(rng):
    out, phase, lp = [], 0.0, 0.0
    length = int(1.1 * SR)
    for i in range(length):
        t = i / SR
        f = 150 - 85 * (t / 1.1)
        phase += TAU * f / SR
        rough = 0.6 + 0.4 * math.sin(TAU * 23 * t + 3 * math.sin(TAU * 7 * t))
        tone = math.sin(phase) + 0.5 * math.sin(2 * phase) + 0.33 * math.sin(3 * phase)
        lp += 0.08 * (rng.uniform(-1, 1) - lp)
        env = math.sin(math.pi * t / 1.1) ** 1.5
        out.append(0.11 * env * rough * (tone + 2.5 * lp))
    return out


def _thud(rng):
    out, lp = [], 0.0
    for i in range(int(1.6 * SR)):
        t = i / SR
        f = 62 - 20 * min(1.0, t / 0.3)
        lp += 0.05 * (rng.uniform(-1, 1) - lp)
        out.append(0.75 * math.exp(-t / 0.35) * math.sin(TAU * f * t) + 0.9 * math.exp(-t / 0.12) * lp)
    return out


def _whoosh(rng):
    out, lp = [], 0.0
    length = 1.4
    for i in range(int(length * SR)):
        t = i / SR
        a = 0.01 + 0.12 * (t / length)
        lp += a * (rng.uniform(-1, 1) - lp)
        env = math.sin(math.pi * min(1.0, t / length)) ** 2
        out.append(0.55 * env * lp)
    return out


def _ambient(ep: dict, buf: list, rng, end: float) -> None:
    """Pad and drone that darken with depth, plus water texture."""
    n = len(buf)
    max_depth = ep.get("maxDepth") or 1.0
    pad_freqs = [220.0, 261.63, 329.63, 493.88]
    pad_ph = [0.0] * len(pad_freqs)
    dr_ph = [0.0, 0.0, 0.0, 0.0]
    water = 0.0
    rumble = 0.0

    for b in range(0, n, CTRL):
        t = b / SR
        d = depth_at(ep, t)
        df = min(1.0, d / max_depth)
        fade = min(1.0, t / 1.0) * min(1.0, max(0.0, (end - t) / 1.8))
        pad_amp = 0.045 * max(0.0, 1 - d / 1500) * (0.8 + 0.2 * math.sin(TAU * 0.11 * t)) * fade
        dr_amp = (0.05 + 0.09 * df) * fade
        f0 = 55.0 * (1 - 0.12 * df)
        w_amp = 0.10 * (1 - 0.65 * df) * fade
        w_cut = 0.015 + 0.09 * (1 - df) ** 2
        r_amp = 0.22 * df * fade
        dr_f = [f0, f0 * 1.004, f0 * 2, f0 * 3]
        dr_g = [1.0, 0.8, 0.35, 0.12]
        for j in range(b, min(n, b + CTRL)):
            s = 0.0
            if pad_amp > 1e-4:
                for k, f in enumerate(pad_freqs):
                    pad_ph[k] += TAU * f / SR
                    s += pad_amp * math.sin(pad_ph[k]) * (1.0 if k < 3 else 0.4)
            ds = 0.0
            for k in range(4):
                dr_ph[k] += TAU * dr_f[k] / SR
                ds += dr_g[k] * math.sin(dr_ph[k])
            s += dr_amp * math.tanh(0.8 * ds)
            noise = rng.uniform(-1, 1)
            water += w_cut * (noise - water)
            rumble += 0.004 * (noise - rumble)
            s += w_amp * water * 3 + r_amp * rumble * 6
            buf[j] = s



def _mtof(m: float) -> float:
    return 440.0 * 2 ** ((m - 69) / 12)


def _epiano(buf, start: float, midi: int, vel: float, length: float = 1.1) -> None:
    """Rhodes-like tine: FM with a bright attack that mellows."""
    f = _mtof(midi)
    s0 = int(start * SR)
    for i in range(int(length * SR)):
        j = s0 + i
        if j >= len(buf):
            break
        tt = i / SR
        env = math.exp(-tt / 0.55) * min(1.0, tt / 0.003)
        rel = min(1.0, (length - tt) / 0.08)
        idx = 1.6 * math.exp(-tt / 0.12) + 0.25
        x = math.sin(TAU * f * tt + idx * math.sin(TAU * f * tt))
        buf[j] += vel * env * rel * (x + 0.12 * math.sin(TAU * 2 * f * tt))


def _bass(buf, start: float, midi: int, length: float) -> None:
    f = _mtof(midi)
    s0 = int(start * SR)
    for i in range(int(length * SR)):
        j = s0 + i
        if j >= len(buf):
            break
        tt = i / SR
        env = math.exp(-tt / 0.6) * min(1.0, tt / 0.006) * min(1.0, (length - tt) / 0.05)
        buf[j] += 0.30 * env * (math.sin(TAU * f * tt) + 0.35 * math.sin(TAU * 2 * f * tt) + 0.1 * math.sin(TAU * 3 * f * tt))


def _vibes(buf, start: float, midi: int, vel: float) -> None:
    f = _mtof(midi)
    s0 = int(start * SR)
    for i in range(int(1.6 * SR)):
        j = s0 + i
        if j >= len(buf):
            break
        tt = i / SR
        env = math.exp(-tt / 0.7) * min(1.0, tt / 0.002)
        trem = 0.8 + 0.2 * math.sin(TAU * 5.5 * tt)
        buf[j] += vel * env * trem * (math.sin(TAU * f * tt) + 0.18 * math.exp(-tt / 0.08) * math.sin(TAU * 4 * f * tt))


def _shaker(buf, start: float, vel: float, rng) -> None:
    s0 = int(start * SR)
    prev = 0.0
    for i in range(int(0.07 * SR)):
        j = s0 + i
        if j >= len(buf):
            break
        tt = i / SR
        nz = rng.uniform(-1, 1)
        hp = nz - prev  # crude high-pass
        prev = nz
        buf[j] += vel * math.sin(math.pi * tt / 0.07) ** 2 * hp


def _kick(buf, start: float) -> None:
    s0 = int(start * SR)
    for i in range(int(0.3 * SR)):
        j = s0 + i
        if j >= len(buf):
            break
        tt = i / SR
        f = 55 + 60 * math.exp(-tt / 0.03)
        buf[j] += 0.28 * math.exp(-tt / 0.12) * math.sin(TAU * f * tt)


def _lobby(ep: dict, buf: list, rng, end: float) -> None:
    """Light lobby/elevator bossa: electric piano comping, bass, shaker, soft kick, vibraphone melody."""
    bpm = 100.0
    beat = 60.0 / bpm
    bar = 4 * beat
    # (root MIDI for bass, chord tones MIDI for the piano), in F major: I-vi-ii-V, then IV-iii-ii-V
    progression = [
        (41, [57, 60, 64, 65]),   # Fmaj7: A C E F
        (38, [57, 60, 62, 65]),   # Dm7:   A C D F
        (43, [58, 62, 65, 67]),   # Gm7:   Bb D F G
        (36, [58, 62, 64, 67]),   # C9:    Bb D E G
        (46, [57, 60, 62, 65]),   # Bbmaj7: A C D F
        (45, [55, 60, 64, 67]),   # Am7:   G C E (G)
        (43, [58, 62, 65, 69]),   # Gm9:   Bb D F A
        (36, [58, 62, 64, 69]),   # C13:   Bb D E A
    ]
    scale = [60, 62, 64, 65, 67, 69, 72, 74, 76, 77, 79]
    comp = [0.0, 1.5, 3.0]          # bossa comping hits, in beats
    bass_pat = [(0.0, 0, 1.4), (1.5, 7, 0.5), (2.0, 0, 0.9), (3.5, 7, 0.5)]  # (beat, interval, length in beats)
    bars = int(end / bar) + 2
    for b in range(bars):
        t0 = b * bar
        root, chord = progression[b % len(progression)]
        last_bar = t0 + bar > end - 1.0
        if last_bar:
            for k, m in enumerate(chord):
                _epiano(buf, t0 + 0.012 * k, m, 0.10, 2.2)
            _bass(buf, t0, root, 2.0)
            _vibes(buf, t0 + beat, 72, 0.10)
            break
        for c in comp:
            vel = 0.085 if c == 0 else 0.065
            for k, m in enumerate(chord):
                _epiano(buf, t0 + c * beat + 0.008 * k, m, vel, 0.95)
        for bt, iv, ln in bass_pat:
            _bass(buf, t0 + bt * beat, root + iv, ln * beat)
        for e in range(8):
            _shaker(buf, t0 + e * beat / 2, 0.022 if e % 2 else 0.012, rng)
        for bt in (0, 2):
            _kick(buf, t0 + bt * beat)
        # Vibraphone: a short, simple phrase on every other bar, chord-friendly notes
        if b % 2 == 1:
            tones = sorted({m + 12 for m in chord} | {s for s in scale if s % 12 in {m % 12 for m in chord}})
            tones = [m for m in tones if 67 <= m <= 81]
            pos = rng.randrange(len(tones))
            for bt in (0.5, 1.5, 2.0, 3.0):
                if rng.random() < 0.75:
                    pos = max(0, min(len(tones) - 1, pos + rng.choice([-2, -1, 1, 1, 2])))
                    _vibes(buf, t0 + bt * beat, tones[pos], 0.085)
    # gentle fades
    n = len(buf)
    fin, fout = int(0.6 * SR), int(1.5 * SR)
    for i in range(min(fin, n)):
        buf[i] *= i / fin
    for i in range(min(fout, n)):
        buf[n - 1 - i] *= i / fout


# Target peak level of each effect in the bed (the bed is normalised afterwards, so these are relative).
EFFECT_PEAK = {"dive_splash": 0.45, "sonar_ping": 0.32, "hull_creak": 0.28, "seabed_thud": 0.62, "whoosh": 0.36,
               "fall_wind": 0.34, "rock_rumble": 0.5, "lava_bubble": 0.32, "plane_flyby": 0.4, "station_beep": 0.3}
MAX_LEN = {"dive_splash": 2.4, "sonar_ping": 2.0, "hull_creak": 2.0, "seabed_thud": 1.6, "whoosh": 1.4,
           "fall_wind": 3.0, "rock_rumble": 2.0, "lava_bubble": 2.5, "plane_flyby": 3.0, "station_beep": 2.0}
_clip_cache = {}


def _load_choices(episode: str = "") -> dict:
    """Real recordings picked by source_sfx.py for this episode (audio/sfx_choices/<episode>.json)."""
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    path = os.path.join(root, "audio", "sfx_choices", f"{episode}.json")
    if not os.path.exists(path):
        legacy = os.path.join(root, "audio", "sfx_choices.json")  # before choices were per episode
        if episode == "mariana" and os.path.exists(legacy):
            path = legacy
        else:
            return {}
    with open(path, "r", encoding="utf-8") as f:
        choices = json.load(f)
    out = {}
    for name, c in choices.items():
        file = os.path.join(root, c["file"])
        if os.path.exists(file):
            out[name] = dict(c, path=file)
    return out


def _real_clip(choice, name):
    """Decodes the chosen segment of a real recording to mono samples at SR, with short fades, at its target level."""
    if not choice:
        return None
    key = (choice["path"], choice.get("start"), choice.get("end"))
    if key in _clip_cache:
        return _clip_cache[key]
    start = float(choice.get("start") or 0.0)
    length = min(float(choice.get("end") or start + MAX_LEN[name]) - start, MAX_LEN[name])
    try:
        raw = subprocess.run(
            ["ffmpeg", "-v", "error", "-ss", f"{start:.3f}", "-t", f"{length:.3f}", "-i", choice["path"],
             "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"],
            check=True, capture_output=True,
        ).stdout
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None
    pcm = array("h")
    pcm.frombytes(raw[: len(raw) // 2 * 2])
    if not pcm:
        return None
    x = [s / 32768 for s in pcm]
    fin, fout = int(0.004 * SR), min(len(x) // 3, int(0.12 * SR))
    for i in range(min(fin, len(x))):
        x[i] *= i / fin
    for i in range(fout):
        x[len(x) - 1 - i] *= i / fout
    pk = max(1e-9, max(abs(s) for s in x))
    # Attack = first sample within 20 dB of the peak; leave 5 ms before it and drop the silence ahead.
    attack = next(i for i, s in enumerate(x) if abs(s) >= pk * 0.1)
    x = x[max(0, attack - int(0.005 * SR)):]
    for i in range(min(fin, len(x))):
        x[i] *= i / fin
    g = EFFECT_PEAK[name] / pk
    clip = [s * g for s in x]
    _clip_cache[key] = clip
    return clip


def build(ep: dict, out_mp3: str) -> str:
    """Writes the bed to out_mp3 and returns its path relative to remotion/public."""
    rng = random.Random(ep.get("seed", "descent") + "-sound")
    end = end_time(ep)
    n = int(end * SR)
    buf = [0.0] * n
    max_depth = ep.get("maxDepth") or 1.0
    style = os.environ.get("SOUND_STYLE", "lobby").strip().lower()
    if style == "ambient":
        _ambient(ep, buf, rng, end)
    else:
        _lobby(ep, buf, rng, end)

    # Sound effects, timed from the same depth curve the visuals use.
    # Real recordings chosen by source_sfx.py are used where available; the code-made sound otherwise.
    real = _load_choices(os.path.basename(out_mp3).rsplit("_bed", 1)[0])
    used = []

    def effect(name, t, synth, align="attack"):
        clip = _real_clip(real.get(name), name)
        if clip is None:
            _add(buf, t, synth())
            return
        if align == "peak":
            k = max(range(len(clip)), key=lambda i: abs(clip[i]))
            t -= k / SR
        _add(buf, max(0.0, t - 0.005), clip)
        if name not in used:
            used.append(name)

    span = skit_span(ep)
    if span and not any(x.get("at") == "skit" for x in ep.get("sfx") or []):
        effect("cartoon_pop", span[0] + 0.12, lambda: _ping(rng))

    if ep.get("sfx"):
        # Episodes with their own plan (the Fall and Orbit templates): each entry names a need and a moment.
        fallback = {"cartoon_pop": _ping, "rock_rumble": _thud, "seabed_thud": _thud, "sonar_ping": _ping, "hull_creak": _creak,
                    "station_beep": _ping}
        for s in ep["sfx"]:
            t = _resolve_at(ep, s["at"], end)
            if t is None:
                continue
            synth = fallback.get(s["need"], _whoosh)
            effect(s["need"], t, lambda synth=synth: synth(rng), align=s.get("align", "attack"))
        _finish(buf, out_mp3)
        print(f"Sound bed: {out_mp3}  ({len(ep['sfx'])} planned effects, "
              f"real recordings: {', '.join(used) if used else 'none'})")
        return "audio/" + os.path.basename(out_mp3)

    zone_starts = [z["from"] for z in ep["zones"] if z["from"] > 0]
    descent_start = next((a for (a, da), (b, db) in zip(ep["keyframes"], ep["keyframes"][1:]) if db > da), None)
    pings = [c for c in (_crossings(ep, z, end) for z in zone_starts) if c is not None]
    if descent_start is not None:
        if "dive_splash" in real:
            effect("dive_splash", descent_start, lambda: _ping(rng))
        else:
            pings.insert(0, descent_start)
    for t in pings:
        effect("sonar_ping", t, lambda: _ping(rng))
    if max_depth > 5000:
        for frac in (0.66, 0.84, 0.95):
            c = _crossings(ep, frac * max_depth, end)
            if c is not None:
                effect("hull_creak", c, lambda: _creak(rng))
    land = _crossings(ep, max_depth - 2, end)
    if land is not None:
        effect("seabed_thud", land, lambda: _thud(rng))
    if ep.get("platesAt") is not None:
        if "whoosh" in real:
            effect("whoosh", ep["platesAt"], lambda: _whoosh(rng), align="peak")
        else:
            _add(buf, ep["platesAt"] - 0.7, _whoosh(rng))
    pings_count = len(pings)
    _finish(buf, out_mp3)
    print(f"Sound bed: {out_mp3}  (pings {pings_count}, landing {'yes' if land else 'no'}, "
          f"real recordings: {', '.join(used) if used else 'none'})")
    return "audio/" + os.path.basename(out_mp3)


def _resolve_at(ep: dict, at, end: float) -> float | None:
    """An sfx moment: seconds, a scene marker ("fallAt", "diagramAt", "skit"), or "depth:<metres>" (first crossing)."""
    if isinstance(at, (int, float)):
        return float(at)
    if at == "skit":
        span = skit_span(ep)
        return span[0] + 0.12 if span else None
    if at.startswith("depth:"):
        return _crossings(ep, float(at.split(":", 1)[1]), end)
    v = ep.get(at)
    return float(v) if isinstance(v, (int, float)) else None


def _finish(buf: list, out_mp3: str) -> None:
    peak = max(1e-9, max(abs(x) for x in buf))
    scale = 0.89 / peak * 32767
    pcm = array("h", (int(max(-32767, min(32767, x * scale))) for x in buf))

    os.makedirs(os.path.dirname(out_mp3), exist_ok=True)
    raw = out_mp3[:-4] + "_raw.wav"
    with wave.open(raw, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", raw, "-af", "loudnorm=I=-20:TP=-4:LRA=14",
         "-ar", "48000", "-b:a", "160k", out_mp3],
        check=True,
    )
    os.remove(raw)


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python scripts/sound_design.py remotion/episodes/<episode>.json")
    from scripts.env_config import load_dotenv
    load_dotenv()
    path = os.path.abspath(sys.argv[1])
    with open(path, "r", encoding="utf-8") as f:
        ep = json.load(f)
    name = os.path.splitext(os.path.basename(path))[0]
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    ep["music"] = build(ep, os.path.join(root, "remotion", "public", "audio", f"{name}_bed.mp3"))
    with open(path, "w", encoding="utf-8") as f:
        json.dump(ep, f, indent=2)
        f.write("\n")


if __name__ == "__main__":
    main()
