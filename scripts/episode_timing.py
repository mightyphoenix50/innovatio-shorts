"""Timing helpers shared by azure_voice.py and sound_design.py.

The Remotion template eases depth between keyframes with smoothstep; depth_at() here
matches it, so sound effects land on the same frames as the visuals.
"""

LEAD_IN = 0.15   # silence before a line's voice starts
BEAT = 0.45      # pause after a line before the next scene starts
MIN_LINE = 2.0   # shortest a scene may be
END_HOLD = 1.2   # extra time held on the final line


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


def end_time(ep: dict) -> float:
    return max([ep["keyframes"][-1][0]] + [n["to"] for n in ep["narration"]])


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
