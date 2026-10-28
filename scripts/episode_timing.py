"""Timing helpers shared by azure_voice.py and sound_design.py.

The Remotion template eases depth between keyframes with smoothstep; depth_at() here
matches it, so sound effects land on the same frames as the visuals.
"""

LEAD_IN = 0.15   # silence before a line's voice starts
BEAT = 0.45      # pause after a line before the next scene starts
MIN_LINE = 2.0   # shortest a scene may be
END_HOLD = 1.2   # extra time held on the final line
SKIT_ENTER = 0.5  # the mascot pops in this long before its line starts
SKIT_HOLD = 1.4   # time held on the mascot's reaction after its line
SKIT_DEFAULT = 4.5  # skit length before it has been voiced (matches remotion/src/shared/Skit.tsx)


def _smooth(f: float) -> float:
    return f * f * (3 - 2 * f)


def depth_at(ep: dict, t: float) -> float:
    k = ep["keyframes"]
    if t <= k[0][0]:
        return k[0][1]
    for (a, da), (b, db) in zip(k, k[1:]):
        if t <= b:
            f = (t - a) / (b - a) if b > a else 1.0
            return da + (db - da) * _smooth(f)
    return k[-1][1]


def skit_span(ep: dict) -> tuple[float, float] | None:
    """When the end skit runs: its own timing once voiced, otherwise right after the last line."""
    sk = ep.get("skit")
    if not sk:
        return None
    start = sk.get("from", ep["narration"][-1]["to"])
    return start, sk.get("to", start + SKIT_DEFAULT)


def end_time(ep: dict) -> float:
    span = skit_span(ep)
    return max([ep["keyframes"][-1][0]] + [n["to"] for n in ep["narration"]] + ([span[1]] if span else []))


def place_skit(ep: dict, duration: float) -> float:
    """Puts the skit right after the last line, sized to its voice. Returns when its voice starts."""
    start = ep["narration"][-1]["to"]
    ep["skit"]["from"] = round(start, 3)
    ep["skit"]["to"] = round(start + SKIT_ENTER + duration + SKIT_HOLD, 3)
    return start + SKIT_ENTER


def fit_timeline(ep: dict, durations: list[float]) -> None:
    """Retimes the episode in place so each scene lasts as long as its voice line plus a short beat.

    Scene boundaries move; keyframes, the plates scene and word timings move with them,
    so the visuals stay in step with what is being said. Running it twice gives the same result.
    """
    lines = ep["narration"]
    old = [n["from"] for n in lines] + [end_time(ep)]
    new = [old[0]]
    for i, dur in enumerate(durations):
        length = max(MIN_LINE, LEAD_IN + dur + BEAT)
        if i == len(durations) - 1:
            length += END_HOLD
        new.append(round(new[-1] + length, 3))

    def warp(t: float) -> float:
        if t <= old[0]:
            return t - old[0] + new[0]
        for i in range(len(old) - 1):
            if t <= old[i + 1]:
                span = old[i + 1] - old[i]
                f = (t - old[i]) / span if span > 0 else 1.0
                return round(new[i] + f * (new[i + 1] - new[i]), 3)
        return round(t - old[-1] + new[-1], 3)

    ep["keyframes"] = [[warp(t), d] for t, d in ep["keyframes"]]
    # Scene markers used by the templates: Descent's plates scene, Fall's trip and closing diagram.
    for key in ("platesAt", "fallAt", "diagramAt"):
        if ep.get(key) is not None:
            ep[key] = warp(ep[key])
    for s in ep.get("sfx") or []:
        if isinstance(s.get("at"), (int, float)):
            s["at"] = warp(s["at"])
    for i, n in enumerate(lines):
        n["from"], n["to"] = new[i], new[i + 1]
