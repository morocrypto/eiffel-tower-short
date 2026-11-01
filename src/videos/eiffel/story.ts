// Timeline of the Eiffel short: shots timed to the voice words
// (~/cartoon-3d/eiffel-tower/voice/words.json, voice A, 68.98 s).
// Camera grammar copied from the bridge template: continuous slow push-ins;
// symmetric smootherstep glides of 18-40 f; big reframes are cuts; impacts are
// 7-frame kicks that flip sign every frame; no hand-held float.
// World scale: the tower is 66 m tall in world units (a 1:5 stand-in for the real
// 330 m, so cameras, fog and DOF stay in the bridge template's working range).
export const FPS = 30;
export const TOTAL = 2070; // 69.0 s at 30 fps, covering the 68.98 s voice
export const D0 = 0; // ground level (build.ts houses sit on D0)
export const TOWER_H = 66;
export type V3 = [number, number, number];

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
export const easeOut = (u: number) => 1 - (1 - clamp01(u)) ** 4;

/** half-width of the tower footprint at height y (legs curve inward as they rise) */
export const halfW = (y: number) => 1.5 + 11 * Math.pow(Math.max(0, 1 - y / TOWER_H), 1.35);
/** platform heights (1st floor, 2nd floor, top) */
export const PLATFORMS = [13, 27, 55];

// ---------------- tower state (driven by the story, not by audio) ----------------
/** lean away from the sun: 0 except shot 10 (ramp in/out) and a trace of it in 11 */
export const leanAt = (id: number, f: number) => {
  if (id === 10) {
    const s = SHOTS[9];
    const u = smooth((f - s.a) / (s.b - s.a));
    return 0.035 * u; // ~2 deg at peak: tip moves ~2.3 m, clearly readable
  }
  if (id === 11) return 0.035;
  return 0;
};
/** vertical growth: summer shots sit ~2% taller, winter (16) back at 1.0 */
export const growAt = (id: number) => (id === 16 ? 1.0 : id === 2 ? 1.0 : 1.02);

// ---------------- shots ----------------
// Frame ranges are contiguous (pauses extend the previous shot); sentence starts
// (from SHOTS.md) sit inside their shot, never on a cut, except where noted.
export type Light = "day" | "golden";
export type ShotDef = { id: number; a: number; b: number; light: Light; sunDisc?: boolean };
export const SHOTS: ShotDef[] = [
  { id: 1, a: 0, b: 59, light: "day" }, // hook: tower grows taller (0.00-1.96 s)
  { id: 2, a: 59, b: 304, light: "golden" }, // 1889 Paris street
  { id: 3, a: 304, b: 398, light: "day", sunDisc: true }, // summer sun
  { id: 4, a: 398, b: 449, light: "day" }, // lattice joint close-up
  { id: 5, a: 449, b: 579, light: "day" }, // atoms insert
  { id: 6, a: 579, b: 814, light: "day" }, // ruler -> crane up the tower
  { id: 7, a: 814, b: 904, light: "day" }, // garden gate cutaway
  { id: 8, a: 904, b: 989, light: "day" }, // match cut back to tower
  { id: 9, a: 989, b: 1040, light: "day", sunDisc: true }, // sun does not heat evenly
  { id: 10, a: 1040, b: 1199, light: "day", sunDisc: true }, // tower leans away from sun
  { id: 11, a: 1199, b: 1354, light: "day" }, // tip + pencil close-up
  { id: 12, a: 1354, b: 1423, light: "golden" }, // engineers
  { id: 13, a: 1423, b: 1528, light: "day" }, // warped metal fence
  { id: 14, a: 1528, b: 1682, light: "day" }, // railway gaps + bridge joint
  { id: 15, a: 1682, b: 1804, light: "day" }, // buckled rails
  { id: 16, a: 1804, b: 1937, light: "day" }, // winter, tower shrinks back
  { id: 17, a: 1937, b: TOTAL, light: "golden", sunDisc: true }, // dusk wide, final
];
/** crossfades (frames) at place/time changes; a white 4-frame flash after the hook */
export const XFADE: Record<number, number> = { 5: 8, 7: 8, 13: 8, 14: 8, 16: 8 };
export const FLASH_AT = 59;

export const shotAt = (f: number) => SHOTS.find((s) => f >= s.a && f < s.b) ?? SHOTS[SHOTS.length - 1];
export const layersAt = (f: number): { id: number; alpha: number }[] => {
  for (const s of SHOTS) {
    const x = XFADE[s.id];
    if (x && f >= s.a - x / 2 && f < s.a + x / 2) return [{ id: s.id - 1, alpha: 1 }, { id: s.id, alpha: (f - (s.a - x / 2) + 1) / (x + 1) }];
  }
  return [{ id: shotAt(f).id, alpha: 1 }];
};

// ---------------- camera ----------------
export type Cam = { pos: V3; look: V3; fov: number; roll: number };
type Shot = Partial<Cam> & { pos: V3; look: V3 };
type Key = { f: number; dur?: number; cut?: boolean; s: (f: number) => Shot };
export const glide = (u: number) => { const x = clamp01(u); return x * x * x * (x * (6 * x - 15) + 10); };
const mix = (a: Cam, b: Cam, k: number): Cam => ({
  pos: a.pos.map((v, i) => v + (b.pos[i] - v) * k) as V3, look: a.look.map((v, i) => v + (b.look[i] - v) * k) as V3,
  fov: a.fov + (b.fov - a.fov) * k, roll: a.roll + (b.roll - a.roll) * k,
});
const full = (c: Shot): Cam => ({ fov: 40, roll: 0, ...c });
const run = (keys: Key[], f: number) => {
  let cur = full(keys[0].s(f));
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (f < k.f) break;
    cur = k.cut ? full(k.s(f)) : mix(cur, full(k.s(f)), glide((f - k.f) / (k.dur ?? 24)));
  }
  return cur;
};
const pushK = (f: number, f0: number, rate: number, punch = 0, n = 35) => {
  const x = Math.max(0, f - f0);
  let s = rate * x;
  if (punch > rate) for (let i = 0; i < Math.min(x, n); i++) s += (punch - rate) * Math.max(0, Math.min(1, (i + 0.5) / 8, (n - i - 0.5) / 8));
  return Math.exp(-s);
};
const dolly = (pos: V3, look: V3, k: number, rest: Partial<Cam> = {}): Shot =>
  ({ pos: [look[0] + (pos[0] - look[0]) * k, look[1] + (pos[1] - look[1]) * k, look[2] + (pos[2] - look[2]) * k], look, ...rest });
const zoom = (pos: V3, look: V3, fov: number, k: number, rest: Partial<Cam> = {}): Shot =>
  ({ pos, look, fov: (360 / Math.PI) * Math.atan(Math.tan((fov * Math.PI) / 360) * k), ...rest });

// ---- framings (f -> camera); each pushes in from the frame its key starts ----
const S1a = (f: number) => dolly([30, 4, 82], [0, 30, 0], pushK(f, 0, 0.0025), { fov: 44 });
const S2a = (f: number) => dolly([-26, 3.2, 36], [0, 9, 0], pushK(f, 59, 0.002), { fov: 42 });
const S2b = (f: number) => dolly([-12, 3.0, 31], [0, 10, 0], pushK(f, 180, 0.002), { fov: 40 });
const S3a = (f: number) => dolly([16, 9, 58], [0, 46, 0], pushK(f, 304, 0.002), { fov: 42 });
const S4a = (f: number) => dolly([2.5, 14.5, 16], [8.5, 14, 8.5], pushK(f, 398, 0.0025), { fov: 36 });
const S5a = (f: number) => dolly([0, 2.8, 17], [0, 2.6, 10], pushK(f, 449, 0.002), { fov: 38 });
const S6a = (f: number) => dolly([0, 1.4, 15.5], [0, 0.7, 10], pushK(f, 579, 0.002), { fov: 36 });
const S6b = (f: number) => dolly([6, 22, 95], [0, 32, 0], pushK(f, 700, 0.002), { fov: 44 });
const S7a = (f: number) => dolly([-12.5, 1.9, 21], [-16, 1.2, 14], pushK(f, 814, 0.002), { fov: 38 });
const S8a = (f: number) => dolly([22, 6, 62], [0, 28, 0], pushK(f, 904, 0.0035), { fov: 42 });
const S9a = (f: number) => dolly([58, 12, 12], [0, 26, 0], pushK(f, 989, 0.002), { fov: 42 });
const S10a = (f: number) => dolly([62, 10, 2], [0, 30, 0], pushK(f, 1040, 0.0018), { fov: 40 });
const S11a = (f: number) => dolly([3.2, 62.5, 7.5], [0.4, 65, 0], pushK(f, 1199, 0.002), { fov: 34 });
const S12a = (f: number) => dolly([8.5, 1.9, 22], [2, 1.5, 13], pushK(f, 1354, 0.002), { fov: 38 });
const S13a = (f: number) => dolly([-13, 2.2, 18], [-21, 1.0, 10], pushK(f, 1423, 0.002), { fov: 40 });
const S14a = (f: number) => dolly([-17, 2.6, 27], [2, 0.6, 18], pushK(f, 1528, 0.002), { fov: 42 });
const S15a = (f: number) => dolly([-12, 2.2, 25], [2, 0.6, 18], pushK(f, 1682, 0.002), { fov: 40 });
const S16a = (f: number) => dolly([30, 5, 85], [0, 28, 0], pushK(f, 1804, 0.0018), { fov: 44 });
const S17a = (f: number) => dolly([36, 6, 92], [0, 30, 0], pushK(f, 1937, 0.0016), { fov: 44 });

const CAMS: Record<number, Key[]> = {
  1: [{ f: 0, s: S1a }],
  2: [
    { f: 59, s: S2a },
    { f: 180, dur: 24, s: S2b },
  ],
  3: [{ f: 304, s: S3a }],
  4: [{ f: 398, s: S4a }],
  5: [{ f: 449, s: S5a }],
  6: [
    { f: 579, s: S6a },
    { f: 700, cut: true, s: S6b }, // cut up the tower on "tower is 330 metres tall"
  ],
  7: [{ f: 814, s: S7a }],
  8: [{ f: 904, s: S8a }],
  9: [{ f: 989, s: S9a }],
  10: [{ f: 1040, s: S10a }],
  11: [{ f: 1199, s: S11a }],
  12: [{ f: 1354, s: S12a }],
  13: [{ f: 1423, s: S13a }],
  14: [{ f: 1528, s: S14a }],
  15: [{ f: 1682, s: S15a }],
  16: [{ f: 1804, s: S16a }],
  17: [{ f: 1937, s: S17a }],
};

// impact kicks: the gate thud (shot 7) and the rail buckle (shot 15). Times in seconds.
const KICKS: [number, number][] = [[28.8, 0.5], [58.0, 0.6]];
export const kickAt = (t: number) => {
  let a = 0;
  for (const [t0, g] of KICKS) {
    const n = Math.floor((t - t0) * FPS + 1e-6);
    if (n >= 0 && n < 7) a += g * (n % 2 ? -1 : 1) * (1 - n / 7) ** 1.5;
  }
  return a;
};
export const camAt = (id: number, f: number): Cam => {
  const c = run(CAMS[id], f), a = kickAt(f / FPS);
  if (!a) return c;
  const d: V3 = [c.look[0] - c.pos[0], c.look[1] - c.pos[1], c.look[2] - c.pos[2]];
  const L = Math.hypot(...d), h = Math.hypot(d[0], d[2]) || 1;
  const m = (3 / 640) * Math.tan((c.fov * Math.PI) / 360) * L * a;
  return { ...c, look: [c.look[0] - (d[2] / h) * m, c.look[1] + 0.6 * m, c.look[2] + (d[0] / h) * m], roll: c.roll + a * 0.004 };
};

// ---------------- lens: depth of field + foreground framing ----------------
export type Dof = { f: number; dur?: number; cInf: number; focus?: (f: number) => V3 };
export const DOF: Dof[] = [
  { f: 0, cInf: 12, focus: () => [0, 30, 0] }, // hook wide: tower sharp, street soft
  { f: 59, cInf: 0 }, // 1889 street (busy, kept sharp)
  { f: 304, cInf: 0 }, // summer sun wide
  { f: 398, cInf: 14, focus: () => [8.5, 14, 8.5] }, // lattice joint CU
  { f: 449, cInf: 14, focus: () => [0, 2.6, 10] }, // atoms insert
  { f: 579, cInf: 12, focus: () => [0, 0.7, 10] }, // ruler CU
  { f: 700, cInf: 0 }, // crane up the tower
  { f: 814, cInf: 8, focus: () => [-16, 1.2, 14] }, // gate + kid
  { f: 904, cInf: 0 }, // match cut tower
  { f: 989, cInf: 0 }, // sun arc side view
  { f: 1040, cInf: 0 }, // lean side view
  { f: 1199, cInf: 16, focus: () => [0.4, 65, 0] }, // tip + pencil
  { f: 1354, cInf: 10, focus: () => [2, 1.5, 13] }, // engineers
  { f: 1423, cInf: 0 }, // warped fence
  { f: 1528, cInf: 8, focus: () => [2, 0.6, 18] }, // tracks
  { f: 1682, cInf: 8, focus: () => [2, 0.6, 18] }, // buckled tracks
  { f: 1804, cInf: 0 }, // winter wide
  { f: 1937, cInf: 5 }, // dusk wide, mild
];
export const dofAt = (f: number) => {
  let i = 0; while (i + 1 < DOF.length && f >= DOF[i + 1].f) i++;
  const d = DOF[i], p = DOF[Math.max(0, i - 1)];
  const k = d.dur ? Math.min(1, (f - d.f) / d.dur) : 1;
  return { cInf: p.cInf + (d.cInf - p.cInf) * k, focus: d.focus };
};

/** near framing objects (simple world-built bushes): visible while a <= f < b */
export type Fg = { a: number; b: number; pos: V3; s: number };
export const FOREGROUND: Fg[] = [
  { a: 814, b: 904, pos: [-19.5, 0, 18.5], s: 1.4 }, // gate shot, bottom-left bush
  { a: 1354, b: 1423, pos: [11.5, 0, 19.5], s: 1.2 }, // engineers shot, bottom-right bush
  { a: 1937, b: TOTAL, pos: [-24, 0, 78], s: 2.2 }, // dusk wide, bottom-left bush
];
