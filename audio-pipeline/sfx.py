# Every sound effect + ambience bed of "The Tower That Grows in Summer" as a cue list timed
# to the picture (timeline.py), rendered into one stereo SFX stem. Levels follow the skill's
# standard mix: each EVENT has a "naive" level (LU relative to the voice stem, measured as the
# event's max momentary loudness) and is placed SFX_DB = -6 dB under it; ambience BEDS
# (integrated loudness) are not reduced. Nothing here is copied from the bridge cue sheet:
# every event below comes from SOUND_CUES_DRAFT.md for this story.
import math
import numpy as np
from dsp import (SR, ns, tt, rng, dbg, lp, hp, bp, peq, shelf, pan, st, place, fades, widen, make_ir, convolve_st,
                 momentary_max, integrated, colored, smooth_noise, modal)
import sfx_gen as G
import timeline as T

N = ns(T.DUR)
SFX_DB = -6.0


class Cue:
    def __init__(self, t, name, desc, gen, naive, kind="event", p=0.0, extra=0.0, lpf=None, send=0.12, group=None, cut=None):
        self.t, self.name, self.desc, self.gen, self.naive = t, name, desc, gen, naive
        self.kind, self.p, self.extra, self.lpf, self.send, self.cut = kind, p, extra, lpf, send, cut
        self.group = group or name
        self.applied = naive + (SFX_DB if kind == "event" else 0.0) + extra
        self.measured = None


def cues():
    C = []
    R = rng(1889)
    rr = lambda: rng(int(R.integers(1 << 30)))
    add = C.append

    # ------------------------------------------------ ambience beds (not reduced by the -6 dB event rule)
    def amb_paris(dur, seed=1):
        def g():
            r = rng(seed)
            n = ns(dur)
            x = G.breeze(dur, r, 1.0, 0.15, 850)
            x += pan(G.bird_chirps(dur, r, 0.45, "sparrow") * 0.08, 0.5)
            x += pan(G.bird_chirps(dur, r, 0.3, "sparrow") * 0.05, -0.6)
            x += st(bp(colored(n, r, 0.8), 300, 2400, 1) * 0.10 * (0.8 + 0.2 * smooth_noise(n, r, 0.3)))
            return fades(x, 0.4, 0.6), 0.0
        return g
    add(Cue(0.0, "amb_paris", "Paris day air: breeze, sparrows, distant street (shots 1-8)",
            _cut(amb_paris(33.44, seed=11), 33.44, 0.4, 0.5), -30, "bed", send=0.0))
    add(Cue(33.44, "amb_paris2", "Paris day air continues: breeze, sparrows (shots 9-13)",
            _cut(amb_paris(17.5, seed=12), 17.5, 0.4, 0.5), -30, "bed", send=0.0))
    add(Cue(51.44, "amb_tracks", "railway-side air: breeze, faint distant clatter (shots 14-15)",
            _cut(amb_paris(9.5, seed=13), 9.5, 0.3, 0.4), -31, "bed", send=0.0))
    add(Cue(60.94, "amb_winter", "cold winter air: low wind, thin and still (shot 16)",
            _cut(lambda: (G.breeze(8.22, rng(14), 0.7, 0.08, 500), 0.0), 8.22, 0.5, 0.6), -32, "bed", send=0.0))
    add(Cue(65.16, "amb_dusk", "dusk air: breeze dying down, last sparrows (shot 17)",
            _cut(amb_paris(3.84, seed=15), 3.84, 0.3, 0.8), -32, "bed", send=0.0))

    # ------------------------------------------------ hook: soft accent on the white flash (~1.97 s)
    add(Cue(T.FLASH, "flash_accent", "soft swell + low warm thump on the white flash at the end of the hook",
            lambda: (_flash_accent(), 0.3),
            -8, send=0.2))

    # ------------------------------------------------ camera-move / crossfade whooshes
    for f, desc in [(416, "tilt up the tower into summer"), (601, "crane up the tower, metre marks"),
                    (1003, "sun arcs across the frame"), (1218, "push to the tip with the pencil"),
                    (1377, "cut to the engineers"), (1828, "cut to winter snow")]:
        add(Cue(T.fr(f), "whoosh_cam", f"camera {desc}", (lambda r=rr(): (G.whoosh(0.6, r, 0.09, 330, 2000, 0.8, 0.18, 0.15), 0.09)),
                -11, send=0.12))
    for shot in (5, 7, 13, 14, 16):
        a, _b = T.shot_t(shot)
        add(Cue(a, "whoosh_xfade", f"crossfade into shot {shot}",
                (lambda r=rr(): (G.whoosh(0.8, r, 0.32, 300, 1600, 0.9, 0.22, 0.1), 0.32)), -12, send=0.15))

    # ------------------------------------------------ heat + atoms + ruler (shots 3-6)
    add(Cue(10.82, "heat_shimmer", "summer heat arrives: rising shimmer that settles under 'cooking it'",
            lambda: (G.whoosh(2.4, rng(33), 0.25, 500, 3600, 0.7, 0.3, 0.25), 0.0), -14, send=0.15))
    add(Cue(14.4, "joint_tick", "small metallic expansion tick on the iron-joint close-up",
            (lambda r=rr(): (G.clink(r, r.uniform(2800, 3600), 0.12), 0.0)), -12, p=0.1, send=0.05))
    add(Cue(15.66, "atom_jiggle", "light vibration texture under the atom insert, fading out by 19.30 s",
            lambda: (_ticks(rng(55), 15.66, 19.30, 0.22, 3000, 4200, 0.10), 0.0), -14, send=0.1))
    add(Cue(20.04, "ruler_ticks", "quiet ticking as metre marks stack up the tower",
            lambda: (_ticks(rng(66), 20.04, 27.14, 0.5, 1800, 2600, 0.08), 0.0), -16, send=0.08))

    # ------------------------------------------------ gate (shot 7): stick, then the THUD at 28.8 s
    add(Cue(27.6, "gate_stick", "garden gate sticks in its frame: wood/metal creak as the kid pushes",
            (lambda r=rr(): (G.creak(0.7, r, 90, 170, G.WOOD, rough=0.18, scale=0.9), 0.0)), -12, p=0.15, send=0.15))
    add(Cue(T.GATE_THUD, "gate_thud", "GATE THUD: the gate gives way with a solid wooden thump + frame rattle",
            lambda: (_sum(G.push_thump(rng(288)), modal(0.5, [(95, 7, 1.0), (180, 9, 0.7), (330, 11, 0.4)], rng(289))), 0.0),
            -2, p=0.15, send=0.2))
    add(Cue(30.76, "tower_accent", "quick push-in accent on the match cut back to the tower (shorter/quieter than the gate thud)",
            (lambda r=rr(): (G.whoosh(0.35, r, 0.12, 500, 2400, 0.8, 0.1, 0.2), 0.1)), -16, send=0.1))

    # ------------------------------------------------ uneven heat + lean (shots 9-10)
    add(Cue(33.44, "sun_arc", "low sun-arc whoosh as the sun moves across the frame",
            lambda: (G.whoosh(1.8, rng(334), 0.2, 300, 1800, 0.8, 0.25, 0.15), 0.0), -14, send=0.15))
    add(Cue(35.3, "lean_creak", "tower leans gently: long soft iron groan, kept subtle under narration",
            (lambda r=rr(): (G.chain_groan(4.6, r, 0.25, 0.6, 24, 38), 0.0)), -14, p=-0.2, send=0.2))

    # ------------------------------------------------ warped metal (shot 13): deadpan dull thud
    add(Cue(49.5, "warped_thud", "deadpan dull thud for the warped metal (deliberately un-triumphant)",
            (lambda r=rr(): (_sum(G.push_thump(r) * 0.8, modal(0.4, [(80, 7, 1.0), (160, 9, 0.5)], r) * 0.6), 0.0)),
            -10, p=-0.1, send=0.18))

    # ------------------------------------------------ tracks + joint + buckle (shots 14-15)
    add(Cue(51.44, "track_clacks", "steady track/joint clacks under the railway shot",
            lambda: (_ticks(rng(144), 51.44, 56.06, 0.7, 1200, 2000, 0.09), 0.0), -16, send=0.1))
    add(Cue(T.BUCKLE, "rail_buckle", "RAIL BUCKLE: iron groan rising + metal crack + low boom as the rails bend",
            lambda: (_sum(G.chain_groan(1.2, rng(580), 0.4, 1.0, 26, 48), G.wood_crack(rng(581)) * 0.7,
                          modal(0.8, [(70, 7, 1.0), (140, 9, 0.6)], rng(582))), 0.0), -2, send=0.2))
    add(Cue(59.5, "concrete_crack", "small concrete crack tick after the buckle",
            (lambda r=rr(): (G.clink(r, r.uniform(1400, 2000), 0.1), 0.0)), -14, send=0.1))

    # ------------------------------------------------ winter (shot 16): soft snow texture is the bed; add faint footfalls in snow
    for tm in (61.5, 62.6, 63.7):
        add(Cue(tm, "snow_step", "soft footstep in snow",
                (lambda r=rr(): (G.stroll_step(r, 0.9) * 0.7, 0.0)), -18, lpf=2500, send=0.2, group="snow_steps"))
    return C


# ================================================================ helpers
def _sum(*xs):
    """add mono/stereo parts of different lengths: pad to the longest, return stereo"""
    xs = [st(np.asarray(x, float)) for x in xs]
    n = max(x.shape[1] for x in xs)
    out = np.zeros((2, n))
    for x in xs:
        out[:, :x.shape[1]] += x
    return out


def _flash_accent():
    r = rng(19)
    y = G.whoosh(0.6, r, 0.3, 400, 3200, 0.9, 0.1, 0.3)
    t = tt(0.6)
    boom = np.where(t > 0.3, np.exp(-(t - 0.3) / 0.12) * np.sin(2 * np.pi * 65 * (t - 0.3)), 0) * 0.6
    return widen(y + boom, r, 12, 0.9)


def _cut(gen, dur, fin, fout):
    def g():
        x, a = gen()
        return fades(x, fin, fout), a
    return g


def _ticks(r, t0, t1, step, f_lo, f_hi, dur):
    """a run of small metallic ticks between t0 and t1 (absolute times handled by placement in render)."""
    n = ns(t1 - t0 + dur + 0.1)
    out = np.zeros(n)
    t = 0.0
    while t < t1 - t0:
        c = G.clink(r, r.uniform(f_lo, f_hi), dur) * r.uniform(0.5, 1.0)
        k = ns(t)
        out[k:k + len(c)] += c[:len(out) - k]
        t += step * r.uniform(0.85, 1.15)
    return out


# ================================================================ render
def render(v_ref, on_event=None):
    """v_ref = integrated loudness of the voice stem (stereo). Returns (stereo stem, cue list with measured levels)."""
    C = cues()
    out = np.zeros((2, N))
    send = np.zeros(N)
    for c in C:
        x, anchor = c.gen()
        x = np.asarray(x, float)
        x = pan(x, c.p) if x.ndim == 1 else x
        if c.cut is not None:
            k = ns(c.cut - (c.t - anchor))
            if 0 < k < x.shape[1]:
                x = fades(x[:, :k], 0.0, 0.02)
        tgt = v_ref + c.applied
        cur = momentary_max(x) if c.kind == "event" else integrated(x)
        if np.isfinite(cur):
            x = x * dbg(tgt - cur)
        if c.lpf:
            x = lp(x, c.lpf, 1)
        c.measured = momentary_max(x) - v_ref if c.kind == "event" else integrated(x) - v_ref
        t0 = c.t - anchor
        place(out, x, t0)
        if on_event:
            on_event(c, x, t0)
        if c.send > 0:
            G._place_mono(send, c.send * x.mean(0), t0)
    hall = make_ir(1.1, 77, pre=0.01, hf=1.6, early=[(0.09, 0.45, -0.5), (0.14, 0.3, 0.6), (0.23, 0.2, -0.2)])
    out += 0.55 * convolve_st(send, hall)
    out = hp(out, 25, 2)
    end = ns(T.DUR - 0.12)
    out[:, end:] *= np.linspace(1, 0, N - end)[None, :] ** 2
    return out, C
