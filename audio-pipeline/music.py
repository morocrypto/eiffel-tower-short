# Original light Paris-stroll score for "The Tower That Grows in Summer", composed and
# synthesized here. NEW theme, written for this short in C major at a gentle 100 bpm stroll
# (quarter = 0.6 s) — it is NOT the bridge short's Bb march theme, and no march melody from
# the bridge example is reused anywhere. Sections follow the picture: hook statement |
# 1889 build | summer heat | atoms (music-box ticking) | gate | lean sway | engineers (calm) |
# tracks (theme returns, walking bass) | winter (sparse) | finale (theme + final C chord).
import numpy as np
from dsp import SR, ns, rng, pan, place, fades, dbg, make_ir, convolve_st, integrated, lp, hp
import instruments as I
import timeline as T

N = ns(T.DUR)
Q = 0.6  # quarter note (s) at 100 bpm

# ORIGINAL theme E (bar, beat, length in quarters, midi) — C major, stepwise rise with a
# sixth-leap lift in bar 5. Whistle/fife register; nothing shared with the bridge theme.
THEME = [
    (1, 0, 1, 72), (1, 1, .5, 74), (1, 1.5, .5, 76), (1, 2, 1, 79), (1, 3, 1, 76),
    (2, 0, 1, 77), (2, 1, .5, 76), (2, 1.5, .5, 74), (2, 2, 2, 72),
    (3, 0, 1, 76), (3, 1, 1, 79), (3, 2, 1, 81), (3, 3, 1, 79),
    (4, 0, 1.5, 77), (4, 1.5, .5, 76), (4, 2, 2, 74),
    (5, 0, 1, 72), (5, 1, 1, 76), (5, 2, 1, 79), (5, 3, 1, 84),
    (6, 0, 1, 83), (6, 1, 1, 79), (6, 2, 1, 81), (6, 3, 1, 79),
    (7, 0, 1, 77), (7, 1, 1, 81), (7, 2, 1, 79), (7, 3, 1, 76),
    (8, 0, 1, 74), (8, 1, 1, 76), (8, 2, 2, 72),
]
CHB = {1: ["C"] * 4, 2: ["F", "F", "C", "C"], 3: ["C", "C", "G", "G"], 4: ["F", "F", "G", "G"],
       5: ["C"] * 4, 6: ["Em", "Em", "Am", "Am"], 7: ["F", "F", "G", "G"], 8: ["C"] * 4}
CH = {
    "C": dict(oom=(36, 43), pah=[55, 60, 64], hi=[60, 64, 67]),
    "F": dict(oom=(41, 48), pah=[53, 57, 60], hi=[57, 60, 65]),
    "G": dict(oom=(43, 50), pah=[55, 59, 62], hi=[59, 62, 65]),
    "G7": dict(oom=(43, 41), pah=[53, 59, 62], hi=[59, 62, 65]),
    "Am": dict(oom=(45, 40), pah=[57, 60, 64], hi=[60, 64, 69]),
    "Em": dict(oom=(40, 47), pah=[55, 59, 64], hi=[59, 64, 67]),
    "Dm": dict(oom=(38, 45), pah=[53, 57, 62], hi=[57, 62, 65]),
}
F = I.m2f

# where each section of the music sits (used for the cue sheet and the level automation)
SECTIONS = [
    ("hook", 0.0, T.FLASH), ("build", T.FLASH, 10.82), ("summer", 10.82, 15.66),
    ("atoms", 15.66, 27.60), ("gate", 27.60, 33.44), ("lean", 33.44, 45.90),
    ("engineers", 45.90, 51.44), ("tracks", 51.44, 60.94), ("winter", 60.94, 65.16),
    ("finale", 65.16, T.DUR),
]


def theme(t_bar1, bars=range(1, 9)):
    """events for the requested bars; t_bar1 is the start time of the FIRST requested bar
    (so bars=[5, 6] at 27.9 plays bar 5 at 27.9, not 9.6 s later)."""
    bars = list(bars)
    ev = []
    for (b, beat, d, m) in THEME:
        if b not in bars:
            continue
        ev.append((t_bar1 + (b - bars[0]) * 4 * Q + beat * Q, d * Q, m))
    return sorted(ev)


class Band:
    def __init__(self):
        self.tr = {}
        self.send = {}
        self.cues = []

    def track(self, name, send):
        if name not in self.tr:
            self.tr[name] = np.zeros((2, N))
            self.send[name] = send
        return self.tr[name]

    def add(self, name, x, t, p=0.0, g=1.0, send=0.15):
        buf = self.track(name, send)
        place(buf, pan(x, p) if np.ndim(x) == 1 else x, t, g)


R = rng(1889)


def _r():
    return rng(int(R.integers(1 << 30)))


def oompah(b, t_bar, chords, vel=0.6, every=True, pah_vel=0.4):
    """soft bass on the beats + after-beat chords (a stroll, not a march)"""
    for beat in range(4):
        c = CH[chords[beat]]
        t = t_bar + beat * Q
        if every or beat in (0, 2):
            m = c["oom"][beat % 2] if every else c["oom"][0 if beat == 0 else 1]
            b.add("tuba", I.brass(F(m), 0.3, vel * (1.0 if beat in (0, 2) else 0.88), _r(), "tuba"), t, -0.1)
        if every:
            for k, m in enumerate(c["pah"]):
                b.add("pah", I.brass(F(m), 0.15, pah_vel, _r(), "horn", scoop=-12), t + Q / 2 + 0.004 * k, 0.32 - 0.12 * k)
        elif beat in (1, 3):
            for k, m in enumerate(c["pah"]):
                b.add("pah", I.brass(F(m), 0.17, pah_vel, _r(), "horn", scoop=-12), t + 0.004 * k, 0.32 - 0.12 * k)


def melody(b, name, notes, vel, transpose=0, fn="glock", p=0.0, gate=0.9):
    for (t, d, m) in notes:
        m = m + transpose
        if fn == "glock":
            x = I.glock(F(m), vel * R.uniform(0.92, 1.05), _r())
        elif fn == "fife":
            x = I.fife(F(m), d * gate, vel * R.uniform(0.94, 1.04), _r())
        elif fn == "vibes":
            x = I.vibes(F(m), vel * R.uniform(0.92, 1.05), _r(), dur=max(1.2, d + 0.8), damp=d + 0.35)
        elif fn == "musicbox":
            x = I.musicbox(F(m), vel * R.uniform(0.92, 1.05), _r())
        b.add(name, x, t, p)


def build():
    b = Band()
    for name, send in [("fife", 0.16), ("glock", 0.22), ("tuba", 0.10), ("pah", 0.18),
                       ("cymbal", 0.16), ("timpani", 0.18), ("pad", 0.25), ("vibes", 0.26),
                       ("musicbox", 0.26), ("pluck", 0.18), ("brush", 0.12), ("triangle", 0.25)]:
        b.track(name, send)

    # ============ HOOK 0 - 1.97: theme bars 1-2 stated warmly, cut by the white flash,
    # soft C chord button ON the flash (after the last word, so it never masks the hook line)
    h = theme(0.0, bars=[1, 2])
    melody(b, "vibes", h, 0.55, 0, "vibes", -0.25)
    melody(b, "glock", h, 0.4, 12, "glock", -0.35)
    oompah(b, 0.0, CHB[1], 0.55, True, 0.36)
    b.cues.append((0.0, "hook: original theme E bars 1-2, vibes + glock, soft bass"))
    hook_cut = np.ones(N)
    a, z = ns(T.FLASH - 0.03), ns(T.FLASH + 0.015)
    hook_cut[a:z] = np.linspace(1, 0, z - a)
    hook_cut[z:] = 0
    for k in b.tr:
        b.tr[k] *= hook_cut[None, :]
    for m in [48, 55, 60, 64, 67]:
        b.add("pad", I.brass(F(m), 0.2, 0.5, _r(), "stab", scoop=-15), T.FLASH, (m - 58) / 20)
    b.add("tuba", I.brass(F(36), 0.25, 0.7, _r(), "tuba"), T.FLASH, -0.1)
    b.add("glock", I.glock(F(84), 0.5, _r()), T.FLASH, -0.35)
    b.add("cymbal", I.cymbal(0.3, _r(), dur=1.2), T.FLASH, 0.0)
    b.cues.append((T.FLASH, "soft C chord button exactly on the white flash, then the band steps back"))

    # ============ BUILD 1.97 - 10.82: theme bars 1-8, light (fife + vibes, pluck bass, brushes)
    s0 = 2.4  # first full bar after the flash
    a18 = theme(s0, bars=range(1, 9))
    melody(b, "fife", a18, 0.42, 0, "fife", 0.25)
    melody(b, "vibes", a18, 0.4, 0, "vibes", -0.25)
    for bar in range(1, 9):
        tb = s0 + (bar - 1) * 4 * Q
        if tb > 10.6:
            break
        oompah(b, tb, CHB[bar], 0.5, False, 0.34)
        for k in range(4):
            b.add("pluck", I.pluck(F(48 if k % 2 == 0 else 43), 0.5, _r(), dur=0.8), tb + k * Q, -0.05)
    b.cues.append((s0, "build: theme E bars 1-8 light (fife + vibes, walking pluck bass, brushes)"))

    # ============ SUMMER 10.82 - 15.66: warm pad + rising glock ticks as the heat arrives
    for (ta, tb_, ms) in [(10.82, 12.6, [48, 60, 64, 67]), (12.6, 14.2, [41, 57, 60, 65]), (14.2, 15.66, [43, 59, 62, 65])]:
        b.add("pad", I.pad([F(m) for m in ms], tb_ - ta, 0.5, _r(), att=0.4, rel=0.5), ta, 0.0)
    for k, m in enumerate([84, 86, 88, 89, 91]):
        b.add("glock", I.glock(F(m), 0.3, _r(), dur=0.6), 11.2 + k * 0.8, -0.35)
    b.cues.append((10.82, "summer: warm pad C - F - G with rising glock ticks as the sun cooks the iron"))

    # ============ ATOMS 15.66 - 27.60: music-box theme bars 1-4 + pizzicato ticking
    mbox = theme(15.9, bars=[1, 2, 3, 4])
    melody(b, "musicbox", mbox, 0.55, 0, "musicbox", 0.2)
    for k in range(22):
        t = 16.2 + k * 0.5
        if t > 27.4:
            break
        b.add("pluck", I.pluck(F(72 if k % 2 == 0 else 76), 0.4, _r(), dur=0.4, bright=0.7), t, 0.25)
    b.cues.append((15.9, "atoms: music-box theme E bars 1-4 with pizzicato ticking (metre marks stacking up)"))

    # ============ GATE 27.60 - 33.44: gentle theme bars 5-6, room for the gate thud SFX
    g = theme(27.9, bars=[5, 6])
    melody(b, "vibes", g, 0.45, 0, "vibes", -0.25)
    melody(b, "fife", g, 0.35, 0, "fife", 0.25)
    b.cues.append((27.9, "gate: gentle theme E bars 5-6, leaving room for the gate thud at 28.8 s"))

    # ============ LEAN 33.44 - 45.90: slow sway pads + vibes pendulum on the lean extremes
    for (ta, tb_, ms) in [(33.44, 36.8, [48, 60, 64, 67]), (36.8, 40.2, [45, 57, 60, 64]),
                          (40.2, 43.2, [41, 57, 60, 65]), (43.2, 45.9, [43, 59, 62, 65])]:
        b.add("pad", I.pad([F(m) for m in ms], tb_ - ta, 0.5, _r(), att=0.5, rel=0.6), ta, 0.0)
    for tb_, m in zip([34.6, 37.4, 40.1, 42.9, 45.0], [79, 76, 81, 76, 79]):
        b.add("vibes", I.vibes(F(m), 0.45, _r(), dur=1.4, damp=0.7, trem_depth=0.12), tb_, -0.25)
    b.cues.append((33.44, "lean: slow sway pads C - Am - F - G, vibes pendulum on the lean extremes"))

    # ============ ENGINEERS 45.90 - 51.44: calm resolved theme bars 7-8
    e = theme(46.2, bars=[7, 8])
    melody(b, "vibes", e, 0.5, 0, "vibes", -0.25)
    melody(b, "glock", e, 0.32, 12, "glock", -0.35)
    b.add("pad", I.pad([F(m) for m in [48, 60, 64, 67]], 5.2, 0.45, _r(), att=0.5, rel=0.6), 46.2, 0.0)
    b.cues.append((46.2, "engineers: calm resolved theme E bars 7-8 over a C pad"))

    # ============ TRACKS 51.44 - 60.94: theme returns with walking bass + brushes
    tsec = theme(51.6, bars=[1, 2, 3])
    melody(b, "fife", tsec, 0.42, 0, "fife", 0.25)
    melody(b, "vibes", tsec, 0.4, 0, "vibes", -0.25)
    walk = [48, 52, 55, 52, 41, 45, 48, 50, 43, 47, 48, 50, 48, 43, 36]
    for k, m in enumerate(walk):
        t = 51.6 + k * Q
        if t > 60.6:
            break
        b.add("pluck", I.pluck(F(m), 0.7, _r(), dur=0.8), t, -0.05)
        b.add("brush", I.brush(0.4 if k % 2 else 0.28, _r(), dur=0.4, swish=True), t - 0.05, 0.1)
    b.cues.append((51.6, "tracks: theme E bars 1-3 returns with walking pluck bass and brushes"))

    # ============ WINTER 60.94 - 65.16: sparse — pad + occasional glock, no melody drive
    b.add("pad", I.pad([F(m) for m in [48, 60, 64, 67]], 4.2, 0.4, _r(), att=0.8, rel=0.9), 60.94, 0.0)
    for t, m in [(61.4, 84), (62.6, 79), (63.8, 84)]:
        b.add("glock", I.glock(F(m), 0.28, _r(), dur=1.2), t, -0.35)
    b.cues.append((60.94, "winter: sparse C pad with three lone glock notes, no melody drive"))

    # ============ FINALE 65.16 - 69.0: theme bar 1 + final C chord, faded to silence at 69.0
    fin = theme(65.4, bars=[1])
    melody(b, "vibes", fin, 0.55, 0, "vibes", -0.25)
    melody(b, "glock", fin, 0.4, 12, "glock", -0.35)
    for m in [48, 55, 60, 64, 67, 72]:
        b.add("vibes", I.vibes(F(m), 0.4, _r(), dur=1.6, damp=None, trem_depth=0.3), 67.6, 0.2)
    b.add("triangle", I.triangle(0.25, _r(), dur=0.5), 67.6, 0.3)
    b.cues.append((65.4, "finale: theme E bar 1, then a final C chord ringing out to 69.0 s"))
    end = np.ones(N)
    a = ns(68.4)
    end[a:] = np.linspace(1, 0, N - a) ** 1.5
    for k in b.tr:
        b.tr[k] *= end[None, :]
    return b


TARGET = {  # relative balance inside the band (LU, measured on each track's own active span)
    "fife": -3.0, "glock": -6.0, "tuba": -2.5, "pah": -7.5, "cymbal": -11.0,
    "timpani": -5.0, "pad": -3.5, "vibes": -2.0, "musicbox": -1.5, "pluck": -4.0,
    "brush": -13.0, "triangle": -15.0,
}


def render(b, ref=-20.0):
    hall = make_ir(1.5, 7, pre=0.018, hf=1.4)
    yard = make_ir(0.9, 8, pre=0.008, hf=1.8, early=[(0.11, 0.5, -0.4), (0.19, 0.35, 0.5)])
    dry = np.zeros((2, N))
    wet_hall = np.zeros((2, N))
    wet_yard = np.zeros((2, N))
    levels = {}
    for k, x in b.tr.items():
        if not np.any(x):
            continue
        L = integrated(x)
        g = dbg(ref + TARGET.get(k, -6) - L)
        levels[k] = (round(L, 1), round(ref + TARGET.get(k, -6), 1))
        x = x * g
        b.tr[k] = x
        dry += x
        wet_hall += b.send[k] * x
    out = dry + 0.7 * convolve_st(wet_hall.mean(0), hall) + 0.8 * convolve_st(wet_yard.mean(0), yard)
    out = hp(out, 30, 2)
    return out, levels
