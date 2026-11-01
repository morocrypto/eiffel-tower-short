// The Eiffel place as one three.js scene: sky, Paris street, the procedural iron
// tower (posed per frame: lean + growth), cutaway props (gate, tracks, bridge
// joint, pencil, atoms, ruler, snow) and the cast. update(id, f, camera) poses
// everything for shot `id` at frame f (pure function of id + f).
// Look modules (sky shader pattern, two-tone lighting, sun rig, clouds) follow
// the bridge template; the tower and props are new. No Kenney GLBs are loaded:
// this world builds everything procedurally, so missing kit files cannot crash it.
import * as THREE from "three";
import { Batch, boxGeo, V, lam, house } from "./build";
import { grassHD, cobbleHD, stoneHD, cloudHD, ctex } from "./paint";
import { Pen } from "./toon";
import { LIGHTS, LOOK, LightPreset } from "./lights";
import { TONE, CHAR, twoTone, untone } from "./shade";
import { NOINK } from "./ink";
import { Pool, Actor, Fx, stage } from "./cast";
import { FPS, SHOTS, TOWER_H, halfW, PLATFORMS, camAt, leanAt, growAt, FOREGROUND, ShotDef } from "./story";

const beamBetween = (a: THREE.Vector3, b: THREE.Vector3, th: number) => {
  const g = new THREE.BoxGeometry(th, a.distanceTo(b), th);
  const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5),
    new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize()), V(1, 1, 1));
  return g.applyMatrix4(m);
};
const discTex = () => ctex("sunDisc", 128, 128, (g) => {
  const gr = g.createRadialGradient(64, 64, 58, 64, 64, 64); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
});
const haloTex = () => ctex("sunHalo", 256, 256, (g) => {
  const im = g.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const u = Math.hypot(x - 127.5, y - 127.5) / 128;
    const a = (0.55 * Math.exp(-((u / 0.25) ** 2)) + 0.35 * Math.exp(-((u / 0.6) ** 2))) * (1 - Math.min(1, Math.max(0, (u - 0.8) / 0.2)));
    const i = (y * 256 + x) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = 255; im.data[i + 3] = Math.round(255 * Math.min(1, a));
  }
  g.putImageData(im, 0, 0);
});
function quadUp(x0: number, x1: number, z0: number, z1: number, u: number, v: number, dy = 0) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([x0, dy, z1, x1, dy, z1, x1, dy, z0, x0, dy, z1, x1, dy, z0, x0, dy, z0], 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, u, 0, u, v, 0, 0, u, v, 0, v], 2));
  return g;
}

// Tower levels for the leg / lattice build
const LEVELS = [0, 3, 6.5, 10, 13, 18, 23, 27, 32, 38, 44, 50, 55, 60, 66];
const legPt = (sx: number, sz: number, y: number) => V(sx * halfW(y), y, sz * halfW(y));

export class World {
  root = new THREE.Group();
  private pool = new Pool();
  private actors: Actor[] = [];
  private fxs: Fx[] = [];
  private hemi: THREE.HemisphereLight; private sun: THREE.DirectionalLight; private fill: THREE.DirectionalLight;
  private sky: THREE.Mesh; private skyMat: THREE.ShaderMaterial;
  private fog = new THREE.Fog("#bccbec", 25, 420);
  private sunDisc: THREE.Sprite; private sunHalo: THREE.Sprite;
  private sunCache = new Map<number, THREE.Vector3>();
  private cloudMaps: Record<"day" | "golden", THREE.Texture[]>;
  private clouds: THREE.Mesh[] = [];
  private tower = new THREE.Group();
  private gate = new THREE.Group();
  private tracks = new THREE.Group();
  private buckled = new THREE.Group();
  private joint = new THREE.Group();
  private pencil = new THREE.Group();
  private atoms = new THREE.Group();
  private atomMeshes: THREE.Mesh[] = [];
  private ruler = new THREE.Group();
  private snow: THREE.Points;
  private snowBase: Float32Array;
  private fgs: { o: THREE.Object3D; a: number; b: number }[] = [];
  private frustum = new THREE.Frustum();
  private m4 = new THREE.Matrix4(); private v = new THREE.Vector3(); private sph = new THREE.Sphere();

  constructor() {
    const R = this.root;
    // ---- sky + light ----
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { c0: { value: new THREE.Color() }, c1: { value: new THREE.Color() }, c2: { value: new THREE.Color() },
        c3: { value: new THREE.Color() }, c4: { value: new THREE.Color() }, e: { value: new THREE.Vector4() } },
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `uniform vec3 c0, c1, c2, c3, c4; uniform vec4 e; varying vec3 vP;
        void main(){ float el = asin(clamp(normalize(vP).y, -1.0, 1.0));
          vec3 c = mix(c0, c1, smoothstep(0.0, e.x, el));
          c = mix(c, c2, smoothstep(e.x, e.y, el));
          c = mix(c, c3, smoothstep(e.y, e.z, el));
          c = mix(c, c4, smoothstep(e.z, e.w, el));
          gl_FragColor = vec4(c, 1.0); }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1100, 48, 24), this.skyMat);
    this.sky.renderOrder = -1; this.sky.frustumCulled = false; this.sky.layers.set(NOINK);
    R.add(this.sky);
    this.sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTex(), color: new THREE.Color(6.0, 4.4, 2.4), fog: false, depthWrite: false }));
    this.sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: new THREE.Color(1, 1, 1), fog: false, depthWrite: false, depthTest: true,
      transparent: true, blending: THREE.AdditiveBlending }));
    this.sunDisc.renderOrder = -0.5; this.sunHalo.renderOrder = 5;
    for (const m of [this.sunDisc, this.sunHalo]) { m.frustumCulled = false; m.layers.set(NOINK); R.add(m); }
    this.hemi = new THREE.HemisphereLight("#cfe6ff", "#6c5c8c", 1.1);
    this.sun = new THREE.DirectionalLight("#fff0d6", 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    this.fill = new THREE.DirectionalLight("#9fb8ff", 0.35);
    R.add(this.hemi, this.sun, this.sun.target, this.fill, this.fill.target);
    this.cloudMaps = { day: [0, 1, 2, 3].map((k) => cloudHD(k, LOOK.day.cloud)), golden: [0, 1, 2, 3].map((k) => cloudHD(k, LOOK.golden.cloud)) };
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3, d = 620 + (i % 3) * 60;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.cloudMaps.day[i % 4], color: new THREE.Color(1.1, 1.1, 1.1), transparent: true, depthWrite: false, fog: false }));
      const w = 130 + (i % 4) * 30;
      m.position.set(Math.cos(a) * d, 120 + (i % 4) * 38, Math.sin(a) * d); m.scale.set(w, w / 2, 1);
      m.layers.set(NOINK);
      this.clouds.push(m); R.add(m);
    }

    // ---- ground, plaza, Paris street (static batch) ----
    const b = new Batch();
    const grass = lam("grassHD", () => ({ map: grassHD() }));
    const cobble = lam("cobbleHD", () => ({ map: cobbleHD() }));
    const wall = lam("wallHD", () => ({ map: stoneHD("wallHD", ["#c9bcaa", "#bfb19f", "#d1c5b4", "#b8aa97"], "#958776") }));
    b.add(quadUp(-900, 900, -900, 900, 450, 450), grass);
    const plaza = new THREE.CircleGeometry(24, 48); plaza.rotateX(-Math.PI / 2);
    b.add(plaza, cobble, new THREE.Matrix4().makeTranslation(0, 0.02, 0));
    // Paris street rows, fronts facing the plaza (tower kept clear in the middle)
    const rows: [number, number, number][] = []; // x, z, yaw
    for (let x = -58; x <= 58; x += 11) { rows.push([x, -42, 0]); rows.push([x, 42, Math.PI]); }
    for (let z = -30; z <= 30; z += 11) { rows.push([-46, z, Math.PI / 2]); rows.push([46, z, -Math.PI / 2]); }
    rows.forEach(([x, z, yaw], i) => house(b, x, z, yaw, i % 2 ? 9 : 7, 8, [7, 8.4, 9.8][i % 3], i % 8));
    b.build(R);
    void wall;

    // ---- the tower (its own group: lean rotates about the base, growth scales Y) ----
    const tb = new Batch();
    const iron = twoTone(new THREE.MeshPhongMaterial({ color: "#3d414c", specular: "#8a8a8a", shininess: 60 }), 0.15);
    const ironLight = twoTone(new THREE.MeshPhongMaterial({ color: "#6d727e", specular: "#a0a0a0", shininess: 45 }), 0.15);
    const CORNERS: [number, number][] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (const [sx, sz] of CORNERS) {
      for (let i = 0; i < LEVELS.length - 1; i++) {
        const y0 = LEVELS[i], y1 = LEVELS[i + 1];
        tb.add(beamBetween(legPt(sx, sz, y0), legPt(sx, sz, y1), y1 < 27 ? 0.85 : 0.5), iron);
      }
    }
    // lattice: horizontal rings + X braces on each face between consecutive levels
    const FACES: [[number, number], [number, number]][] = [
      [[1, 1], [1, -1]], [[1, -1], [-1, -1]], [[-1, -1], [-1, 1]], [[-1, 1], [1, 1]],
    ];
    for (const [[sx1, sz1], [sx2, sz2]] of FACES) {
      for (let i = 0; i < LEVELS.length - 1; i++) {
        const y0 = LEVELS[i], y1 = LEVELS[i + 1];
        tb.add(beamBetween(legPt(sx1, sz1, y0), legPt(sx2, sz2, y0), 0.32), ironLight);
        tb.add(beamBetween(legPt(sx1, sz1, y0), legPt(sx2, sz2, y1), 0.22), ironLight);
        tb.add(beamBetween(legPt(sx2, sz2, y0), legPt(sx1, sz1, y1), 0.22), ironLight);
      }
    }
    // first-floor arch suggestion: diagonal beams from the legs up to the platform corners
    for (const [sx, sz] of CORNERS) {
      tb.add(beamBetween(legPt(sx, sz, 5), V(sx * halfW(13), 13, sz * halfW(13)), 0.45), iron);
    }
    // platforms + railings
    for (const y of PLATFORMS) {
      const w = halfW(y) + 1.2;
      tb.add(boxGeo(V(-w, y, -w), V(w, y + 0.8, w), 2), iron);
      for (const s of [-1, 1]) {
        tb.add(boxGeo(V(-w, y + 0.8, s * w), V(w, y + 1.7, s * w + 0.08), 0), ironLight);
        tb.add(boxGeo(V(s * w, y + 0.8, -w), V(s * w + 0.08, y + 1.7, w), 0), ironLight);
      }
    }
    // top shaft + antenna
    tb.add(boxGeo(V(-1.1, 55, -1.1), V(1.1, 62, 1.1), 1), iron);
    const ant = new THREE.CylinderGeometry(0.12, 0.3, 4.5, 8);
    tb.add(ant, ironLight, new THREE.Matrix4().makeTranslation(0, 64, 0));
    tb.build(this.tower);
    R.add(this.tower);

    // ---- cutaway props ----
    const wood = lam("wood", () => ({ color: "#a8724a" }));
    const gateIron = twoTone(new THREE.MeshPhongMaterial({ color: "#2f333d", specular: "#777777", shininess: 40 }), 0.15);
    // garden gate (shot 7): two posts + a panel stuck ajar
    const post = new THREE.BoxGeometry(0.25, 1.6, 0.25);
    for (const x of [-17.2, -14.8]) { const m = new THREE.Mesh(post, wood); m.position.set(x, 0.8, 14); m.castShadow = true; this.gate.add(m); }
    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.15, 0.08), gateIron);
    panel.position.set(-16, 0.75, 14); panel.rotation.y = 0.22; panel.castShadow = true;
    this.gate.add(panel);
    this.gate.userData.panel = panel;
    R.add(this.gate);
    // railway tracks with gaps (shot 14) along x at z = 18
    const sleeper = new THREE.BoxGeometry(0.5, 0.15, 2.4);
    const railMat = twoTone(new THREE.MeshPhongMaterial({ color: "#7d8088", specular: "#b0b0b0", shininess: 45 }), 0.15);
    for (let x = -30; x <= 30; x += 1.2) { const m = new THREE.Mesh(sleeper, wood); m.position.set(x, 0.08, 18); this.tracks.add(m); }
    for (const zr of [17.4, 18.6]) for (let x = -30; x < 30; x += 6) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.18, 0.18), railMat);
      m.position.set(x + 2.75, 0.24, zr); m.castShadow = true; this.tracks.add(m);
    }
    R.add(this.tracks);
    // buckled rails (shot 15): same line, rails bent in a sine wave + tilted slabs
    for (let x = -30; x < 30; x += 2) {
      const y = 0.24 + 0.55 * Math.sin((x + 30) * 0.35);
      for (const zr of [17.4, 18.6]) { const m = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.18, 0.18), railMat); m.position.set(x + 1, y, zr); m.rotation.z = 0.35 * Math.cos((x + 30) * 0.35); this.buckled.add(m); }
      const slab = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.22, 2.6), cobble);
      slab.position.set(x + 1, 0.1 + 0.2 * Math.sin((x + 30) * 0.35 + 1), 18); slab.rotation.z = 0.18 * Math.sin((x + 30) * 0.35); this.buckled.add(slab);
    }
    R.add(this.buckled);
    // small bridge expansion joint (shot 14): two deck slabs with a visible gap over a ditch
    const deckMat = lam("deckwood", () => ({ color: "#8a6a4a" }));
    for (const [x0, w] of [[4, 3.4], [8, 3.4]] as const) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, 3.2), deckMat);
      m.position.set(x0 + w / 2, 0.45, 18); m.castShadow = true; this.joint.add(m);
    }
    R.add(this.joint);
    // pencil beside the tip (shot 11): deliberately oversized (1.6 m) so it reads on a phone screen
    const pencilMat = new THREE.MeshLambertMaterial({ color: "#f2c230" });
    const pencilWood = new THREE.MeshLambertMaterial({ color: "#e8cfa4" });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.3, 6), pencilMat);
    body.rotation.z = Math.PI / 2; body.position.y = 0;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 6), pencilWood);
    tip.rotation.z = -Math.PI / 2; tip.position.x = 0.8;
    this.pencil.add(body, tip);
    this.pencil.position.set(2.4, 63.5, 1.2); this.pencil.rotation.z = 0.5;
    R.add(this.pencil);
    // atoms insert (shot 5): jiggling spheres in front of an iron plate
    const plate = new THREE.Mesh(new THREE.BoxGeometry(9, 4.5, 0.3), iron);
    plate.position.set(0, 2.6, 9.4); this.atoms.add(plate);
    const atomMat = new THREE.MeshLambertMaterial({ color: "#c8ccd4" });
    const atomHot = new THREE.MeshLambertMaterial({ color: "#e8a06a" });
    for (let i = 0; i < 18; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), i % 3 === 0 ? atomHot : atomMat);
      m.position.set(-3.4 + (i % 6) * 1.35, 1.2 + Math.floor(i / 6) * 1.35, 10);
      this.atomMeshes.push(m); this.atoms.add(m);
    }
    R.add(this.atoms);
    // ruler (shot 6): 10 m board with tick marks
    const board = new THREE.Mesh(new THREE.BoxGeometry(10, 0.7, 0.12), new THREE.MeshLambertMaterial({ color: "#f1ece0" }));
    board.position.set(0, 0.55, 10); this.ruler.add(board);
    const tickMat = new THREE.MeshLambertMaterial({ color: "#241726" });
    for (let i = 0; i <= 10; i++) { const tk = new THREE.Mesh(new THREE.BoxGeometry(0.08, i % 5 === 0 ? 0.5 : 0.3, 0.02), tickMat); tk.position.set(-5 + i, 0.55, 10.07); this.ruler.add(tk); }
    R.add(this.ruler);
    // snow (shot 16)
    const N = 700, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 160; pos[i * 3 + 1] = Math.random() * 70; pos[i * 3 + 2] = (Math.random() - 0.5) * 160; }
    this.snowBase = pos.slice();
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.snow = new THREE.Points(sg, new THREE.PointsMaterial({ color: "#ffffff", size: 0.35, transparent: true, opacity: 0.9, depthWrite: false }));
    this.snow.frustumCulled = false;
    R.add(this.snow);
    // foreground bushes (world-built, toggled per frame from story FOREGROUND)
    for (const fg of FOREGROUND) {
      const grp = new THREE.Group();
      const leaf = lam("bushleaf", () => ({ color: "#4a9142" }));
      for (const [dx, dy, dz, r] of [[0, 0.7, 0, 1.0], [0.7, 0.5, 0.3, 0.7], [-0.6, 0.55, -0.2, 0.65]] as const) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), leaf);
        m.position.set(dx, dy, dz); m.scale.y = 0.8; grp.add(m);
      }
      grp.position.set(...fg.pos); grp.scale.setScalar(fg.s); grp.visible = false;
      this.fgs.push({ o: grp, a: fg.a, b: fg.b }); R.add(grp);
    }
  }

  /** camera-relative sun, frozen per shot (bridge pattern) */
  private shotSun(id: number, s: ShotDef, L: LightPreset) {
    let v = this.sunCache.get(id);
    if (v) return v;
    let fx = 0, fz = 0;
    for (let f = s.a; f < s.b; f += 3) {
      const c = camAt(id, f), x = c.look[0] - c.pos[0], z = c.look[2] - c.pos[2], n = Math.hypot(x, z) || 1;
      fx += x / n; fz += z / n;
    }
    const n = Math.hypot(fx, fz) || 1; fx /= n; fz /= n;
    const az = THREE.MathUtils.degToRad(L.az), el = THREE.MathUtils.degToRad(L.el);
    const hx = fx * Math.cos(az) - fz * Math.sin(az), hz = fz * Math.cos(az) + fx * Math.sin(az);
    v = new THREE.Vector3(hx * Math.cos(el), Math.sin(el), hz * Math.cos(el)).normalize();
    this.sunCache.set(id, v);
    return v;
  }

  private actor(i: number) { while (this.actors.length <= i) this.actors.push(new Actor(this.root)); return this.actors[i]; }
  private fx(i: number) { while (this.fxs.length <= i) this.fxs.push(new Fx(this.root)); return this.fxs[i]; }

  update(id: number, f: number, cam: THREE.PerspectiveCamera, scene: THREE.Scene) {
    const t = f / FPS, s = SHOTS[id - 1], L = LIGHTS[s.light];
    // ---- camera ----
    const c = camAt(id, f);
    cam.position.set(...c.pos); cam.up.set(0, 1, 0); cam.lookAt(...c.look); cam.rotateZ(c.roll);
    cam.fov = c.fov; cam.near = 0.2; cam.far = 1500; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    const focus = V(...c.look), dist = cam.position.distanceTo(focus);
    cam.layers.enable(NOINK);
    // ---- light rig ----
    const K = LOOK[s.light];
    let sunDir = this.shotSun(id, s, L);
    if (id === 9) { // sun arcs across the frame during this shot (story beat: uneven heating)
      const u = (f - s.a) / Math.max(1, s.b - s.a);
      const az = THREE.MathUtils.degToRad(100 - 70 * u);
      const fwd = new THREE.Vector3(c.look[0] - c.pos[0], 0, c.look[2] - c.pos[2]).normalize();
      const hx = fwd.x * Math.cos(az) - fwd.z * Math.sin(az), hz = fwd.z * Math.cos(az) + fwd.x * Math.sin(az);
      sunDir = new THREE.Vector3(hx * Math.cos(THREE.MathUtils.degToRad(L.el)), Math.sin(THREE.MathUtils.degToRad(L.el)), hz * Math.cos(THREE.MathUtils.degToRad(L.el))).normalize();
    }
    this.hemi.color.set(L.sky); this.hemi.groundColor.set(L.ground); this.hemi.intensity = L.hemiI;
    this.sun.color.set(L.sunCol); this.sun.intensity = L.sunI;
    let Rr = THREE.MathUtils.clamp(dist * 1.15 + 7, 12, 95);
    if (s.light === "golden") Rr = Math.max(Rr, 30);
    this.sun.position.copy(focus).addScaledVector(sunDir, 220); this.sun.target.position.copy(focus);
    const sc = this.sun.shadow.camera;
    sc.left = -Rr; sc.right = Rr; sc.top = Rr; sc.bottom = -Rr; sc.near = 20; sc.far = 480; sc.updateProjectionMatrix();
    this.sun.shadow.bias = L.bias; this.sun.shadow.normalBias = L.normalBias * (Rr / 12);
    this.fill.intensity = 0;
    TONE.uLitCol.value.set(...L.lit); TONE.uShadeCol.value.set(...L.shade); TONE.uShadeLift.value.set(...L.lift);
    TONE.uLambert.value = L.lambert; TONE.uSideK.value = L.sideK; TONE.uTerm.value = L.term; TONE.uBounce.value.set(...LOOK[s.light].bounce); TONE.uSat.value = LOOK[s.light].sat;
    CHAR.uCharTint.value.set(...L.charTint); CHAR.uCharShade.value = L.charShade; CHAR.uGrad.value = L.charGrad;
    CHAR.uBodyGrad.value = L.bodyGrad; CHAR.uSideTint.value.set(...L.sideTint);
    // ---- sky, fog, sun disc + halo, clouds ----
    const su = this.skyMat.uniforms;
    K.sky.c.forEach((h, i) => untone(h, su["c" + i].value));
    const e = K.sky.e.map((deg) => THREE.MathUtils.degToRad(deg));
    su.e.value.set(e[1], e[2], e[3], e[4]);
    this.sky.position.copy(cam.position);
    untone(L.fog, this.fog.color); this.fog.near = L.fogNear; this.fog.far = L.fogFar;
    scene.fog = this.fog; scene.background = null;
    const showSun = !!s.sunDisc || s.light === "golden";
    this.sunDisc.visible = this.sunHalo.visible = showSun;
    if (showSun) {
      this.sunDisc.position.copy(cam.position).addScaledVector(sunDir, 900);
      this.sunDisc.scale.setScalar(2 * 900 * Math.tan(THREE.MathUtils.degToRad(1.7)));
      this.sunHalo.position.copy(this.sunDisc.position); this.sunHalo.scale.setScalar(2 * 900 * Math.tan(THREE.MathUtils.degToRad(24)));
      (this.sunHalo.material as THREE.SpriteMaterial).color.set(L.sunDisc === "#000000" ? "#ffcf9e" : L.sunDisc).multiplyScalar(1.3);
    }
    for (let i = 0; i < this.clouds.length; i++) {
      const m = this.clouds[i], mat = m.material as THREE.MeshBasicMaterial;
      m.lookAt(cam.position.x, m.position.y, cam.position.z);
      mat.map = this.cloudMaps[s.light][i % 4];
    }
    // ---- tower state + props ----
    this.tower.rotation.z = leanAt(id, f);
    this.tower.scale.y = growAt(id);
    this.gate.visible = id === 7;
    if (id === 7) (this.gate.userData.panel as THREE.Mesh).rotation.y = 0.22 + 0.03 * Math.sin(t * 9);
    this.tracks.visible = id === 14;
    this.joint.visible = id === 14;
    this.buckled.visible = id === 15;
    this.pencil.visible = id === 11;
    if (id === 11) this.pencil.position.y = 63.5 + 0.15 * Math.sin(t * 2.2);
    this.atoms.visible = id === 5;
    if (id === 5) this.atomMeshes.forEach((m, i) => { m.position.x += 0; m.position.y = m.position.y; m.position.x = -3.4 + (i % 6) * 1.35 + 0.12 * Math.sin(t * 9 + i); m.position.y = 1.2 + Math.floor(i / 6) * 1.35 + 0.1 * Math.cos(t * 8 + i * 1.7); });
    this.ruler.visible = id === 6;
    this.snow.visible = id === 16;
    if (id === 16) {
      const p = this.snow.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        let y = this.snowBase[i * 3 + 1] - ((t * 3.5 + i * 0.37) % 70);
        if (y < 0) y += 70;
        p.setXYZ(i, this.snowBase[i * 3] + 1.5 * Math.sin(t + i), y, this.snowBase[i * 3 + 2]);
      }
      p.needsUpdate = true;
    }
    for (const g of this.fgs) g.o.visible = f >= g.a && f < g.b;
    // ---- cast ----
    const right = V(0, 0, 0).setFromMatrixColumn(cam.matrixWorld, 0);
    const st = stage(id, t, { pos: cam.position, right });
    this.frustum.setFromProjectionMatrix(this.m4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    let ai = 0;
    const used: Actor[] = [];
    for (const p of st.places) {
      const sc2 = p.scale ?? 1;
      if (!this.frustum.intersectsSphere(this.sph.set(this.v.set(p.x, p.y + 1.1 * sc2, p.z), 3.5))) continue;
      const a = this.actor(ai++);
      const [w, h, k] = p.size ?? [300, 500, 0.5];
      a.r = this.pool.req(p.key, w, h, k, p.draw);
      a.mesh.visible = true;
      a.mesh.position.set(p.x, p.y, p.z);
      a.mesh.rotation.set(0, p.yaw ?? Math.atan2(cam.position.x - p.x, cam.position.z - p.z), 0);
      a.mesh.scale.set(p.mirror ? -sc2 : sc2, sc2, sc2);
      a.mesh.castShadow = L.actorShadow;
      used.push(a);
    }
    for (let i = ai; i < this.actors.length; i++) this.actors[i].mesh.visible = false;
    let fi = 0;
    const fused: Fx[] = [];
    for (const p of st.fx) {
      if (!this.frustum.intersectsSphere(this.sph.set(this.v.set(p.x, p.y, p.z), Math.max(p.w, p.h)))) continue;
      const e = this.fx(fi++);
      e.r = this.pool.req(p.key, p.cw, p.ch, 1, p.draw);
      e.use(!!p.soft);
      e.mesh.visible = true;
      e.mesh.position.set(p.x, p.y, p.z);
      if (p.flat) e.mesh.rotation.set(-Math.PI / 2, 0, p.rot ?? 0);
      else { e.mesh.quaternion.copy(cam.quaternion); e.mesh.rotateZ(p.rot ?? 0); }
      e.mesh.scale.set(p.w, p.h, 1);
      fused.push(e);
    }
    for (let i = fi; i < this.fxs.length; i++) this.fxs[i].mesh.visible = false;
    this.pool.flush();
    for (const a of used) a.bind();
    for (const e of fused) e.bind();
    return focus;
  }
}
