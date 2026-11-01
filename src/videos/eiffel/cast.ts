// Our cast as lit flat sprites in the 3D world, adapted from the bridge template's
// Pool / Actor / Fx machinery (same canvas pool, same cardShade lighting, same
// NOINK layer so the world ink pass never outlines the cards). The stage itself
// is new: tourists, 1889 builders, engineers, and a kid at a gate.
import * as THREE from "three";
import { Pen, bodyFront, bodySide, townsfolk, soldier, OFFICER, KID, PARENT, fxContact, Outfit, Expr, FrontOpts, SideOpts } from "./toon";
import { FPS } from "./story";
import { NOINK } from "./ink";
import { cardShade, blobMaterial, CARD_K } from "./cardshade";

// ---------------- canvas pool ----------------
type Entry = { cv: HTMLCanvasElement; tex: THREE.CanvasTexture; w: number; h: number };
export type Req = { key: string; w: number; h: number; k: number; draw: (p: Pen) => void; tex?: THREE.CanvasTexture };
const makeEntry = (w: number, h: number): Entry => {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return { cv, tex, w, h };
};
export class Pool {
  private live = new Map<string, Entry>();
  private free: Entry[] = [];
  private reqs: Req[] = [];
  req(key: string, w: number, h: number, k: number, draw: (p: Pen) => void) {
    const r: Req = { key: `${w}x${h}|${key}`, w, h, k, draw };
    this.reqs.push(r);
    return r;
  }
  flush() {
    const want = new Map<string, Req[]>();
    for (const r of this.reqs) { const l = want.get(r.key); if (l) l.push(r); else want.set(r.key, [r]); }
    for (const [key, e] of this.live) if (!want.has(key)) { this.live.delete(key); this.free.push(e); }
    for (const [key, rs] of want) {
      let e = this.live.get(key);
      if (!e) {
        const r = rs[0], i = this.free.findIndex((x) => x.w === r.w && x.h === r.h);
        e = i >= 0 ? this.free.splice(i, 1)[0] : makeEntry(r.w, r.h);
        const g = e.cv.getContext("2d")!;
        g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, e.w, e.h); g.setTransform(r.k, 0, 0, r.k, 0, 0);
        r.draw(new Pen(g));
        e.tex.needsUpdate = true;
        this.live.set(key, e);
      }
      for (const r of rs) r.tex = e.tex;
    }
    this.reqs = [];
  }
}

// ---------------- sprite meshes ----------------
const blank = (() => { const c = document.createElement("canvas"); c.width = c.height = 2; return new THREE.CanvasTexture(c); })();
export const SU = 0.00216; // metres per design unit: 1000 units = 2.16 m
const BODY = (() => { const g = new THREE.PlaneGeometry(600 * SU, 1000 * SU); g.translate(0, (975 - 500) * SU, 0); return g; })();
const CARD = new THREE.PlaneGeometry(1, 1);
export class Actor {
  mesh: THREE.Mesh; mat: THREE.MeshLambertMaterial; dmat: THREE.MeshDepthMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D, geo: THREE.BufferGeometry = BODY) {
    this.mat = cardShade(new THREE.MeshLambertMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide }));
    this.mat.alphaToCoverage = false;
    this.dmat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.customDepthMaterial = this.dmat;
    this.mesh.onBeforeRender = (r) => { const rt = r.getRenderTarget(); CARD_K.uPx.value = (rt ? rt.height : r.domElement.height) / 1920; };
    this.mesh.castShadow = false; this.mesh.receiveShadow = true; this.mesh.visible = false;
    this.mesh.rotation.order = "YXZ"; this.mesh.renderOrder = 1; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
  }
  bind() { const t = this.r?.tex; if (t) { this.mat.map = t; this.dmat.map = t; } }
}
export class Fx {
  mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; soft: THREE.MeshBasicMaterial; blob: THREE.MeshBasicMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D) {
    this.mat = new THREE.MeshBasicMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mat.alphaToCoverage = false;
    this.soft = new THREE.MeshBasicMaterial({ map: blank, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.blob = blobMaterial(blank);
    this.mesh = new THREE.Mesh(CARD, this.mat);
    this.mesh.visible = false; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
  }
  use(soft: boolean) { this.mesh.material = soft ? this.soft : this.mat; }
  bind() {
    const t = this.r?.tex;
    if (!t) return;
    if (this.r!.key.includes("|blob|")) {
      if (t.generateMipmaps) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.needsUpdate = true; }
      this.blob.map = t; this.mesh.material = this.blob; this.mesh.renderOrder = 0.5;
    } else { this.mat.map = t; this.soft.map = t; this.mesh.renderOrder = 0; }
  }
}

// ---------------- placements ----------------
export type Place = {
  key: string; draw: (p: Pen) => void; x: number; y: number; z: number;
  scale?: number; mirror?: boolean; yaw?: number; size?: [number, number, number];
};
export type FxPlace = { key: string; cw: number; ch: number; draw: (p: Pen) => void; x: number; y: number; z: number; w: number; h: number; flat?: boolean; rot?: number; soft?: boolean };
export type CamInfo = { pos: THREE.Vector3; right: THREE.Vector3 };
export type Stage = { places: Place[]; fx: FxPlace[] };

const tier = (d: number): [number, number, number] =>
  d < 3.2 ? [1800, 3000, 3.0] : d < 6.5 ? [1080, 1800, 1.8] : d < 16 ? [480, 800, 0.8] : [240, 400, 0.4];
const q = (v: number, n = 120) => Math.round(v * n) / n;
const fkey = (o: object) => JSON.stringify(o, (_k, v) => (typeof v === "number" ? q(v) : v));
const FOLK = [0, 1, 2, 3, 4, 5].map((v) => townsfolk(v));
const BUILD = [0, 1, 2, 3].map((v) => soldier(v, { hat: null }));
const seedOf = (i: number) => ((i * 5 + 3) % 7) + 1;
const tmp = new THREE.Vector3();

const person = (cam: CamInfo, o: Outfit, okey: string, i: number, x: number, y: number, z: number, side: boolean, mirror: boolean, fo: FrontOpts, so: SideOpts, scale = 1): Place => {
  const d = cam.pos.distanceTo(tmp.set(x, y + 1.2, z)) / scale;
  const [w, h, k] = tier(d), seed = seedOf(i);
  const f2: FrontOpts = { ...fo, seed }, s2: SideOpts = { ...so, seed };
  const key = side ? `S|${okey}|${fkey(s2)}` : `F|${okey}|${fkey(f2)}`;
  return { key, x, y, z, scale, mirror: side && mirror, draw: (p) => (side ? bodySide(p, o, s2) : bodyFront(p, o, f2)), size: [w, h, k] };
};
const blob = (out: Stage, x: number, y: number, z: number, sc = 1) => {
  out.fx.push({ key: "blob|contact|#3a3348", cw: 128, ch: 128, draw: (p) => fxContact(p, "#3a3348"), x, y: y + 0.022, z, w: 0.52 * sc, h: 0.4 * sc, flat: true, rot: 0 });
};
const stand = (out: Stage, cam: CamInfo, o: Outfit, okey: string, i: number, x: number, z: number, expr: Expr, scale = 1) => {
  out.places.push(person(cam, o, okey, i, x, 0, z, false, false, { expr, mode: "stand" }, { mode: "stand" }, scale));
  blob(out, x, 0, z, scale);
};

// ---------------- stage by shot ----------------
export const stage = (id: number, _t: number, cam: CamInfo): Stage => {
  const out: Stage = { places: [], fx: [] };
  const folk = (i: number, x: number, z: number, expr: Expr = "neutral", sc = 1) => stand(out, cam, FOLK[i % 6], `folk${i % 6}`, i, x, z, expr, sc);
  switch (id) {
    case 1: // hook wide: a few tourists on the plaza looking up
      folk(0, -7, 27, "grin"); folk(1, -3, 29, "neutral"); folk(2, 4, 28, "grin");
      break;
    case 2: // 1889 street: builders by the tower base + townsfolk watching
      out.places.push(person(cam, BUILD[0], "build0", 10, -13, 0, 21, false, false, { expr: "stern", mode: "stand" }, { mode: "stand" }));
      out.places.push(person(cam, BUILD[1], "build1", 11, -10, 0, 22, false, false, { expr: "neutral", mode: "stand" }, { mode: "stand" }));
      out.places.push(person(cam, OFFICER, "officer", 12, -8, 0, 23, false, false, { expr: "stern", mode: "stand" }, { mode: "stand" }));
      blob(out, -13, 0, 21); blob(out, -10, 0, 22); blob(out, -8, 0, 23);
      folk(3, -18, 30, "grin"); folk(4, 14, 30, "neutral"); folk(5, 18, 28, "grin");
      break;
    case 7: // kid at the stuck gate + parent watching
      out.places.push(person(cam, KID, "kid", 20, -15.2, 0, 14.6, true, false, { expr: "stern", mode: "stand" }, { mode: "stand" }, 0.72));
      blob(out, -15.2, 0, 14.6, 0.72);
      out.places.push(person(cam, PARENT, "parent", 21, -12.5, 0, 17, false, false, { expr: "neutral", mode: "stand" }, { mode: "stand" }));
      blob(out, -12.5, 0, 17);
      break;
    case 8: // match cut: two tourists back on the plaza
      folk(0, -5, 27, "grin"); folk(1, 3, 29, "neutral");
      break;
    case 12: // engineers with plans, calm
      out.places.push(person(cam, OFFICER, "officer", 12, 0.5, 0, 13.5, false, false, { expr: "neutral", mode: "stand" }, { mode: "stand" }));
      out.places.push(person(cam, BUILD[2], "build2", 13, 3.2, 0, 14.5, false, false, { expr: "neutral", mode: "stand" }, { mode: "stand" }));
      out.places.push(person(cam, FOLK[2], "folk2", 14, 5.5, 0, 14, false, false, { expr: "grin", mode: "stand" }, { mode: "stand" }));
      blob(out, 0.5, 0, 13.5); blob(out, 3.2, 0, 14.5); blob(out, 5.5, 0, 14);
      break;
    case 14: // worker by the tracks
      out.places.push(person(cam, BUILD[3], "build3", 15, -6, 0, 22, false, false, { expr: "neutral", mode: "stand" }, { mode: "stand" }));
      blob(out, -6, 0, 22);
      break;
    case 16: // winter: two tourists, breath vapour is a gap (no particle breath in this pass)
      folk(0, -6, 27, "neutral"); folk(1, 5, 28, "neutral");
      break;
    case 17: // dusk wide: tourists on the plaza
      folk(0, -8, 28, "grin"); folk(1, 0, 30, "neutral"); folk(2, 7, 27, "grin");
      break;
    default:
      break; // macro / tower-only / cutaway shots carry no characters
  }
  void FPS;
  return out;
};
export { FPS };
