# Picture timeline for "The Tower That Grows in Summer" (EiffelShort), mirrored from
# ~/workspace/cartoon-3d/eiffel-tower/SHOTS.md and the Remotion story.ts: 17 shots, one per
# sentence of the approved script, timed to voice A (68.98 s). Total 2070 frames = 69.0 s.
# This file replaces the bridge timeline entirely; no bridge timings survive here.
import math
import numpy as np

FPS = 30
TOTAL = 2070
DUR = TOTAL / FPS            # 69.0 s exactly
fr = lambda f: f / FPS

FLASH = fr(59)               # white flash at the end of the hook shot (frame 59, ~1.97 s)
GATE_THUD = 28.8             # gate-thud kick (shot 7, from BUILD_REPORT.md)
BUCKLE = 58.0                # rail-buckle kick (shot 15, from BUILD_REPORT.md)

# id: (first frame, end frame, light, crowd) — contiguous, from sentence bounds
SHOTS = {
    1: (0, 76, "day", "none"),
    2: (76, 325, "golden", "builders"),
    3: (325, 416, "day", "none"),
    4: (416, 470, "day", "none"),
    5: (470, 601, "day", "none"),
    6: (601, 828, "day", "none"),
    7: (828, 923, "day", "kid"),
    8: (923, 1003, "day", "none"),
    9: (1003, 1059, "day", "none"),
    10: (1059, 1218, "day", "none"),
    11: (1218, 1377, "day", "none"),
    12: (1377, 1439, "golden", "engineers"),
    13: (1439, 1543, "day", "none"),
    14: (1543, 1702, "day", "worker"),
    15: (1702, 1828, "day", "worker"),
    16: (1828, 1955, "day", "none"),
    17: (1955, TOTAL, "golden", "tourists"),
}
# crossfade lengths (frames) at place/time changes, from story.ts
XFADE = {5: 6, 7: 8, 13: 8, 14: 8, 16: 8}


def shot_t(i):
    a, b = SHOTS[i][:2]
    return fr(a), fr(b)


def shot_at(t):
    f = t * FPS
    for i, (a, b, *_r) in SHOTS.items():
        if a <= f < b:
            return i
    return 17


def easeout(u):
    u = min(1.0, max(0.0, u))
    return 1 - (1 - u) ** 4


def hh(i, s=0):
    """same hash as cast.ts (IEEE doubles, so it reproduces the JS values)"""
    v = math.sin(i * 127.1 + s * 311.7) * 43758.5453
    return v - math.floor(v)


def words(path):
    import json
    return json.load(open(path, encoding="utf-8"))
