/* Anatomy in 3D: the four instrument figures as real models you can orbit.
   Same parts and dimensions as the isometric plates (40 world units = 1 rₛ),
   driven by the same models (window.EventHorizon). three.js is loaded from a
   pinned CDN version via the import map; without it the 2D plates are used. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const EH = () => window.EventHorizon;
const RS = 40;
const TAU = Math.PI * 2;

/* ------------------------------------------------------------------ */
/* Materials                                                           */
/* ------------------------------------------------------------------ */
const std = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, metalness: 0.22, roughness: 0.55 }, o));   // low metalness: there is no environment map to reflect
const MAT = {
  lo: std(0x1c1f26, { roughness: 0.62 }),
  mid: std(0x2b2f38),
  hi: std(0x3d424d, { roughness: 0.42 }),
  paper: std(0x3a3e47, { metalness: 0.1, roughness: 0.9 }),
  well: std(0x0a0b0e, { metalness: 0.2, roughness: 0.9 }),
  hole: std(0x020203, { metalness: 0.9, roughness: 0.18 }),
  lit: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  cyan: new THREE.MeshBasicMaterial({ color: 0x7fd8ff }),
  cyanDim: new THREE.MeshBasicMaterial({ color: 0x3f7f9a }),
  amber: new THREE.MeshBasicMaterial({ color: 0xffb36b }),
  glass: new THREE.MeshStandardMaterial({ color: 0x6b7586, metalness: 0.35, roughness: 0.28, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
};
const EDGE = new THREE.LineBasicMaterial({ color: 0xe9e6df, transparent: true, opacity: 0.22 });
const FAINT = new THREE.LineBasicMaterial({ color: 0xe9e6df, transparent: true, opacity: 0.12 });
const TICK = new THREE.LineBasicMaterial({ color: 0xe9e6df, transparent: true, opacity: 0.45 });

/* ------------------------------------------------------------------ */
/* Geometry helpers (y up; the plates' (x, y, z-up) map to (x, z, y))  */
/* ------------------------------------------------------------------ */
function mesh(geo, mat, o = {}){
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = o.cast !== false; m.receiveShadow = o.receive !== false;
  if(o.edges !== false){ const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo, o.edgeAngle || 28), o.edgeMat || EDGE); m.add(e); }
  return m;
}
const at = (obj, x, y, z) => { obj.position.set(x, y, z); return obj; };
function box(w, h, d, mat, o){ return mesh(new THREE.BoxGeometry(w, h, d), mat, o); }
function cyl(r, h, mat, o = {}){ return mesh(new THREE.CylinderGeometry(o.rTop ?? r, r, h, o.seg || 48, 1, !!o.open), mat, o); }
function roundedSlab(w, d, h, r, mat){
  const s = new THREE.Shape(), x0 = -w / 2, y0 = -d / 2;
  s.moveTo(x0 + r, y0); s.lineTo(x0 + w - r, y0); s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
  s.lineTo(x0 + w, y0 + d - r); s.quadraticCurveTo(x0 + w, y0 + d, x0 + w - r, y0 + d);
  s.lineTo(x0 + r, y0 + d); s.quadraticCurveTo(x0, y0 + d, x0, y0 + d - r);
  s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelThickness: 1.2, bevelSize: 1.2, bevelSegments: 2, curveSegments: 10 });
  g.rotateX(-Math.PI / 2);
  return mesh(g, mat, { edgeAngle: 35 });
}
function annulus(rIn, rOut, h, mat, o = {}){
  const s = new THREE.Shape(); s.absarc(0, 0, rOut, 0, TAU, false);
  const hole = new THREE.Path(); hole.absarc(0, 0, rIn, 0, TAU, true); s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: o.seg || 96 });
  g.rotateX(-Math.PI / 2);
  return mesh(g, mat, o);
}
function lines(pts, mat = TICK){
  const g = new THREE.BufferGeometry().setFromPoints(pts.map(p => new THREE.Vector3(...p)));
  return new THREE.LineSegments(g, mat);
}
function ringLine(r, y, mat = FAINT, seg = 128){
  const pts = []; for(let i = 0; i <= seg; i++){ const a = i / seg * TAU; pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r)); }
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
}
function torus(r, tube, y, mat){ const m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 8, 160), mat); m.rotation.x = Math.PI / 2; m.position.y = y; return m; }
function sphere(r, mat, o = {}){ return mesh(new THREE.SphereGeometry(r, 48, 32), mat, Object.assign({ edges: false }, o)); }
function screw(x, y, z, r = 2.4){ const g = new THREE.Group(); g.add(at(cyl(r, 1.2, MAT.lo, { seg: 16, edges: false }), 0, 0.6, 0)); g.add(at(box(r * 1.6, 0.4, 0.4, MAT.hi, { edges: false }), 0, 1.3, 0)); return at(g, x, y, z); }
function tube(points, r, mat){ const c = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))); return mesh(new THREE.TubeGeometry(c, 80, r, 10, false), mat, { edges: false }); }
const disposeTree = o => o.traverse(n => { if(n.geometry) n.geometry.dispose(); if(n.material && !Object.values(MAT).includes(n.material) && ![EDGE, FAINT, TICK].includes(n.material)){ (Array.isArray(n.material) ? n.material : [n.material]).forEach(m => m.dispose()); } });

/* the common base plate: feet, plate with groove, corner screws */
function base(){
  const g = new THREE.Group();
  for(const [x, z] of [[-300, -300], [300, -300], [-300, 300], [300, 300]]) g.add(at(cyl(20, 16, MAT.lo), x, -30, z));
  g.add(at(roundedSlab(680, 680, 20, 26, MAT.lo), 0, -22, 0));
  const groove = []; const R = 318;
  for(const [a, b] of [[[-R, -R], [R, -R]], [[R, -R], [R, R]], [[R, R], [-R, R]], [[-R, R], [-R, -R]]]) groove.push([a[0], 0.3, a[1]], [b[0], 0.3, b[1]]);
  g.add(lines(groove, FAINT));
  for(const [x, z] of [[-318, -318], [318, -318], [-318, 318], [318, 318]]) g.add(screw(x, 0, z));
  return g;
}
function labelPlate(x, z){
  const g = new THREE.Group();
  g.add(at(box(68, 2.5, 82, MAT.mid), 0, 1.25, 0));
  for(const [dx, dz] of [[-28, -35], [28, -35], [-28, 35], [28, 35]]) g.add(screw(dx, 2.5, dz, 1.6));
  const l = []; for(let i = 0; i < 3; i++){ const zz = -18 + i * 18; l.push([-22, 2.7, zz], [22, 2.7, zz]); }
  g.add(lines(l, FAINT));
  return at(g, x, 0, z);
}
/* a gauge on a stand, facing direction yaw; returns { group, set(v) } */
function gauge(x, z, yaw, h = 96, r = 30){
  const g = new THREE.Group();
  g.add(at(cyl(12, 4, MAT.mid), 0, 2, 0));
  g.add(at(cyl(3.5, h - r, MAT.hi, { edges: false }), 0, (h - r) / 2 + 4, 0));
  const head = new THREE.Group(); head.position.y = h; head.rotation.y = yaw; g.add(head);
  const bez = cyl(r + 3, 6, MAT.mid, { seg: 64 }); bez.rotation.x = Math.PI / 2; head.add(bez);
  const face = new THREE.Mesh(new THREE.CircleGeometry(r - 1, 64), std(0x0e1014, { metalness: 0.1, roughness: 0.8 })); face.position.z = 3.1; head.add(face);
  const ang = v => (210 - v * 240) * Math.PI / 180;
  const t = [];
  for(let i = 0; i <= 20; i++){ const a = ang(i / 20), l = i % 10 === 0 ? 9 : i % 2 === 0 ? 6 : 4; t.push([Math.cos(a) * (r - 1.5), Math.sin(a) * (r - 1.5), 3.3], [Math.cos(a) * (r - l), Math.sin(a) * (r - l), 3.3]); }
  head.add(lines(t, new THREE.LineBasicMaterial({ color: 0xe9e6df, transparent: true, opacity: 0.7 })));
  const needle = new THREE.Group(); needle.position.z = 3.8; head.add(needle);
  needle.add(at(new THREE.Mesh(new THREE.BoxGeometry(r - 6, 1.4, 0.6), new THREE.MeshBasicMaterial({ color: 0xe9e6df })), (r - 6) / 2 - 4, 0, 0));
  head.add(at(cyl(2.4, 1.6, MAT.hi, { edges: false }), 0, 0, 4.4)).children.at(-1).rotation.x = Math.PI / 2;
  return { group: at(g, x, 0, z), set(v){ needle.rotation.z = ang(Math.max(0, Math.min(1, v))); } };
}
/* Novikov-Thorne-like temperature profile, peak = 1 */
const heat = (r, rIn) => { const rr = Math.max(r / rIn, 1.0001); return Math.pow(rr, -0.75) * Math.pow(1 - Math.sqrt(1 / rr), 0.25) / 0.488; };
const warm = h => new THREE.Color(0x2b2f38).lerp(new THREE.Color(0x7a4f2a), Math.min(1, 0.8 * h));

/* ================================================================== */
/* Fig. 1 · spinning black hole                                        */
/* ================================================================== */
function figSpin(){
  const E = EH(), P = E.params, Mo = E.model, a = P.spinA * Mo.KM, s = P.spin;
  const m = { spinA: P.spinA, rPlus: Mo.kerrRPlus(a), isco: Mo.kerrIsco(a, s), phPro: Mo.kerrPhoton(a, 1), phRetro: Mo.kerrPhoton(a, -1) };
  m.vIsco = Mo.kerrOrbit(m.isco, s, a).v;
  const omega = r => Mo.kerrOrbit(r, s, a).Om, drag = r => Mo.zamo(r, Math.PI / 2, a).omega;
  const G = new THREE.Group();
  G.add(base());
  G.add(labelPlate(284, -191));
  // plinth with the ergosphere well, degree scale on the rim
  G.add(annulus(40, 262, 14, MAT.lo, { seg: 128 }));
  G.add(at(new THREE.Mesh(new THREE.CircleGeometry(40, 64).rotateX(-Math.PI / 2), MAT.well), 0, 5, 0));
  const deg = []; for(let k = 0; k < 72; k++){ const q = k / 72 * TAU, l = k % 6 ? 6 : 11; deg.push([Math.cos(q) * (262 - l), 14.2, Math.sin(q) * (262 - l)], [Math.cos(q) * 260.5, 14.2, Math.sin(q) * 260.5]); }
  G.add(lines(deg));
  // disk rings, each a turning group
  const rIn = m.isco * RS, rOut = 248, N = 9, rings = [];
  for(let k = 0; k < N; k++){
    const r0 = rIn * Math.pow(rOut / rIn, k / N) + (k ? 0.8 : 0), r1 = rIn * Math.pow(rOut / rIn, (k + 1) / N) - 0.8, rm = (r0 + r1) / 2;
    const ring = new THREE.Group(); ring.position.y = 15;
    ring.add(annulus(r0, r1, 6, std(warm(heat(rm, rIn)).getHex(), { roughness: 0.55 }), { seg: 128 }));
    ring.add(at(box(r1 - r0 - 2, 0.6, 1.2, MAT.amber, { edges: false }), rm, 6.3, 0));
    for(let j = 1; j < 4; j++){ const q = j * Math.PI / 2; ring.add(screw(Math.cos(q) * rm, 6, Math.sin(q) * rm, 1.5)); }
    ring.rotation.y = k * 0.7;
    G.add(ring); rings.push({ g: ring, om: omega(rm / RS), off: k * 0.7 });
  }
  // photon-orbit grooves on whichever surface lies at that radius
  const gy = r => r >= rIn ? 21.3 : r >= 40 ? 14.3 : 5.3;
  G.add(torus(m.phPro * RS, 0.8, gy(m.phPro * RS), MAT.cyan));
  G.add(torus(m.phRetro * RS, 0.7, gy(m.phRetro * RS), MAT.cyanDim));
  // the horizon, collar, axle, vane, bridge, crown
  const rH = m.rPlus * RS, yEq = 18;
  G.add(at(sphere(rH, MAT.hole), 0, yEq, 0));
  G.add(at(cyl(6.5, 5, MAT.mid), 0, yEq + rH + 0.5, 0));
  const yBridge = 214;
  G.add(at(cyl(3, yBridge - (yEq + rH + 3), MAT.hi, { edges: false }), 0, (yBridge + yEq + rH + 3) / 2, 0));
  const vane = new THREE.Group(); vane.position.y = yBridge - 66;
  vane.add(at(box(36, 22, 1.2, MAT.hi), 22, 0, 0)); vane.add(at(cyl(6, 4, MAT.mid), 0, -13, 0));
  G.add(vane);
  for(const x of [-304, 304]){ G.add(at(box(18, yBridge, 18, MAT.mid), x, yBridge / 2, 0)); G.add(at(cyl(16, 6, MAT.lo), x, 3, 0)); }
  G.add(at(box(632, 16, 20, MAT.mid), 0, yBridge + 8, 0));
  G.add(at(cyl(15, 11, MAT.hi), 0, yBridge + 21.5, 0));
  G.add(at(cyl(19, 16, MAT.hi, { seg: 64, edgeAngle: 1 }), 0, yBridge + 39, 0));
  // a/M dial, ruler with r₊ and ISCO sliders, cable from dial to post
  const dial = gauge(-252, 238, Math.PI / 4); G.add(dial.group); dial.set(m.spinA);
  G.add(at(box(300, 3, 22, MAT.mid), 150, 1.5, 311));
  const tk = []; for(let x = 2; x <= 298; x += 10){ const major = (x - 2) % 40 === 0; tk.push([x, 3.2, 300], [x, 3.2, 300 + (major ? 11 : 5)]); }
  G.add(lines(tk));
  G.add(at(box(14, 8, 38, MAT.mid), m.rPlus * RS + 2, 7, 311));
  G.add(at(box(14, 8, 38, MAT.hi), m.isco * RS + 2, 7, 311));
  G.add(at(box(1.4, 0.6, 12, MAT.amber, { edges: false }), m.isco * RS + 2, 11.3, 298));
  G.add(tube([[-256, 1.2, 226], [-292, 1.2, 128], [-334, 1.2, 120], [-310, 1.2, 18]], 1.6, MAT.hi));
  // the lit bead on the ISCO
  const bead = sphere(5.5, MAT.lit); G.add(bead);
  return {
    group: G, view: { pos: [520, 460, 700], target: [0, 60, 0] },
    update(t){
      for(const r of rings) r.g.rotation.y = r.off - s * r.om * t;
      const ab = -s * omega(m.isco) * t, rb = m.isco * RS + 6;
      bead.position.set(Math.cos(ab) * rb, 26.5, Math.sin(ab) * rb);
      vane.rotation.y = -drag(1.3) * t * 8;
    },
    readout: () => `a/M ${m.spinA.toFixed(3)} · r₊ ${m.rPlus.toFixed(3)} · ISCO ${m.isco.toFixed(3)} rₛ · v ${m.vIsco.toFixed(2)}c`,
    caption: () => `At a/M ${m.spinA.toFixed(3)} the horizon sits at ${m.rPlus.toFixed(2)} rₛ and gas can orbit stably down to ${m.isco.toFixed(2)} rₛ, moving at ${m.vIsco.toFixed(2)}c. ` +
      (m.spinA > 0.005 ? `Light can circle the hole at ${m.phPro.toFixed(2)} rₛ with the spin and ${m.phRetro.toFixed(2)} rₛ against it. Inner rings turn faster than outer ones, and inside the ergosphere nothing can stand still.`
                       : `Light can circle at 1.50 rₛ. Without spin there is no ergosphere: its edge, 1 rₛ, is the horizon, and the vane stands still.`),
    legend: [['lit', 'GAS ON THE ISCO'], ['ring', 'DISK RINGS · OWN ORBITAL SPEEDS'], ['cyan', 'PHOTON ORBITS'], ['well', 'ERGOSPHERE · 1 rₛ'], ['vane', 'FRAME DRAGGING (×8)']],
    control: { label: 'SPIN a/M', min: 0, max: 0.998, step: 0.001, get: () => EH().params.spinA, set: v => EH().set({ spinA: v }), fmt: v => v.toFixed(3) },
    key: () => P.spinA.toFixed(3) + '|' + P.spin,
  };
}

/* ================================================================== */
/* Fig. 2 · binary black hole                                          */
/* ================================================================== */
function figBinary(){
  // opened from another scene: start an inspiral so there is something to show
  { const E = EH(), s0 = E.binaryAt(E.time); if(E.params.scene !== 'binary' && s0.merged && s0.since > 30) E.restartBinary(); }
  const G = new THREE.Group(), B = 40;
  G.add(base()); G.add(labelPlate(-260, -284));
  G.add(at(cyl(262, 14, MAT.mid, { seg: 128 }), 0, 7, 0));
  for(let r = 1; r <= 6; r++) G.add(ringLine(r * B, 14.2, r % 3 ? FAINT : TICK));
  const deg = []; for(let k = 0; k < 72; k++){ const q = k / 72 * TAU, l = k % 6 ? 6 : 11; deg.push([Math.cos(q) * (262 - l), 14.2, Math.sin(q) * (262 - l)], [Math.cos(q) * 260.5, 14.2, Math.sin(q) * 260.5]); }
  G.add(lines(deg));
  G.add(at(cyl(22, 16, MAT.mid), 0, 22, 0)); G.add(at(cyl(13, 6, MAT.hi), 0, 33, 0));
  // telescoping beam, two pedestals and balls (scaled each frame)
  const beam = box(1, 6, 8, MAT.mid); beam.position.y = 41; G.add(beam);
  const hubCap = at(cyl(7, 10, MAT.hi), 0, 41, 0); G.add(hubCap);
  const mk = () => { const g = new THREE.Group(); const ped = at(cyl(4, 8, MAT.hi), 0, 48, 0); const ball = sphere(1, MAT.hole); g.add(ped, ball); G.add(g); return { g, ball }; };
  const b1 = mk(), b2 = mk(), rem = sphere(0.95 * B, MAT.hole); G.add(rem);
  // wave crests: two arms, recomputed each frame, fading into the plate colour
  const NW = 240, waves = [0, 1].map(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NW * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(NW * 3), 3));
    const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ vertexColors: true })); G.add(l); return l;
  });
  // strip-chart recorder: housing, paper, rollers, trace, pen
  const REC = { x: -231, z: 239, w: 162, d: 106, h: 34 };
  G.add(at(box(REC.w, REC.h, REC.d, MAT.mid), REC.x, REC.h / 2, REC.z));
  G.add(at(box(REC.w - 20, 0.6, REC.d - 28, MAT.paper, { edges: false }), REC.x, REC.h + 0.3, REC.z));
  for(const dx of [-REC.w / 2 + 9, REC.w / 2 - 9]){ const r = cyl(5, REC.d - 16, MAT.hi); r.rotation.x = Math.PI / 2; G.add(at(r, REC.x + dx, REC.h + 5, REC.z)); }
  const NT = 260, trace = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(NT * 3), 3)), new THREE.LineBasicMaterial({ color: 0x7fd8ff }));
  G.add(trace);
  const penTip = sphere(2.6, MAT.lit); G.add(penTip);
  const penArm = box(4, 3, 1, MAT.hi); G.add(penArm);
  // crank turning with time
  G.add(at(cyl(24, 6, MAT.mid), 252, 3, 186)); G.add(at(cyl(5, 28, MAT.hi), 252, 20, 186));
  const crank = new THREE.Group(); crank.position.set(252, 36, 186);
  crank.add(at(box(38, 5, 8, MAT.mid), 17, 0, 0)); crank.add(at(cyl(4.5, 19, MAT.hi, { seg: 24, edgeAngle: 1 }), 34, 12, 0));
  G.add(crank);
  const bgCol = new THREE.Color(0x2b2f38), cy = new THREE.Color(0x7fd8ff);
  let st = null;
  return {
    group: G, view: { pos: [480, 520, 640], target: [0, 40, 0] },
    update(){
      const E = EH(), t = E.time; st = E.binaryAt(t);
      const M = 0.5;
      if(!st.merged){
        const c = Math.cos(st.psi), s = Math.sin(st.psi), d1 = (st.m2 / M) * st.a * B, d2 = (st.m1 / M) * st.a * B;
        const p1 = [-c * d1, -s * d1], p2 = [c * d2, s * d2];
        beam.visible = b1.g.visible = b2.g.visible = true; rem.visible = false;
        beam.scale.x = d1 + d2 + 12; beam.position.set((p1[0] + p2[0]) / 2, 41, (p1[1] + p2[1]) / 2); beam.rotation.y = -st.psi;
        for(const [b, p, rs] of [[b1, p1, 2 * st.m1], [b2, p2, 2 * st.m2]]){
          b.g.position.set(p[0], 0, p[1]); const R = rs * B; b.ball.scale.setScalar(R); b.ball.position.y = 52 + R;
        }
      } else {
        beam.visible = b1.g.visible = b2.g.visible = false; rem.visible = true; rem.position.set(0, 46 + 0.95 * B, 0);
      }
      // crests: φ = ψ − Ω r − mπ, amplitude (aΩ)²/r, fading after the merger
      const amp0 = st.merged ? 0.5 : (st.a * st.Om) ** 2;
      waves.forEach((w, arm) => {
        const pos = w.geometry.attributes.position.array, col = w.geometry.attributes.color.array;
        const r0 = Math.max(st.a * 0.6, 1.2), r1 = 6.4;
        for(let i = 0; i < NW; i++){
          const r = r0 + (r1 - r0) * i / (NW - 1), ph = st.psi - st.Om * r - arm * Math.PI;
          pos.set([Math.cos(ph) * r * B, 14.6, Math.sin(ph) * r * B], i * 3);
          let a = Math.min(1, Math.sqrt(amp0 / 0.2)) * Math.min(1, 2.4 / r + 0.35) * (1 - Math.max(0, (r - 5.6) / 0.8));
          if(st.merged) a *= Math.exp(-Math.max(0, st.since - r) / 5);
          const cc = bgCol.clone().lerp(cy, Math.max(0, Math.min(1, a)));
          col.set([cc.r, cc.g, cc.b], i * 3);
        }
        w.geometry.attributes.position.needsUpdate = w.geometry.attributes.color.needsUpdate = true;
      });
      // chart: h(t') = (aΩ)² cos 2ψ over the last 60 rₛ/c
      const tp = trace.geometry.attributes.position.array, x0 = REC.x - REC.w / 2 + 16, x1 = REC.x + REC.w / 2 - 18, ha = REC.d / 2 - 18;
      let hNow = 0;
      for(let i = 0; i < NT; i++){
        const si = E.binaryAt(t - 60 + 60 * i / (NT - 1));
        const A = si.merged ? 0.5 * Math.exp(-si.since / 2.5) : (si.a * si.Om) ** 2;
        const h = Math.min(1, A / 0.5) * Math.cos(2 * si.psi); if(i === NT - 1) hNow = h;
        tp.set([x0 + (x1 - x0) * i / (NT - 1), REC.h + 0.9, REC.z + h * ha], i * 3);
      }
      trace.geometry.attributes.position.needsUpdate = true;
      penTip.position.set(x1, REC.h + 2, REC.z + hNow * ha);
      const armLen = (REC.d / 2 - 4) - hNow * ha; penArm.scale.z = Math.max(1, armLen); penArm.position.set(x1 + 3, REC.h + 4, REC.z + hNow * ha + armLen / 2);
      crank.rotation.y = -t * 0.12;
    },
    readout(){
      if(!st) return '';
      const U = EH().units();
      return st.merged ? `MERGED ${st.since.toFixed(1)} rₛ/c AGO · REMNANT 0.95 M · a/M ≈ 0.69`
        : `a ${st.a.toFixed(2)} rₛ · f ${U.fmtSci(st.Om / Math.PI / U.tUnit)} Hz · MERGER IN ${(st.tMerge - st.t).toFixed(1)} rₛ/c`;
    },
    caption(){
      if(!st) return '';
      return st.merged ? 'The holes have merged into one that lost about 5% of the mass to gravitational waves. The last crests keep moving outward at the speed of light; on the chart the chirp has ended.'
        : `Separation ${st.a.toFixed(2)} rₛ. As the orbit shrinks (da/dt ∝ −1/a³) the arm shortens and spins faster, the wave spiral tightens, and the chart's trace rises in pitch and height: the chirp.`;
    },
    legend: [['lit', 'PEN · THE CHIRP'], ['ball', 'THE TWO HOLES'], ['cyan', 'WAVE CRESTS · OUT AT c'], ['ring', 'CRANK · TURNS WITH TIME']],
    control: { label: 'INSPIRAL', min: 0, max: 1.15, step: 0.001,
      get(){ const s = EH().binaryAt(EH().time); return s.t / s.tMerge; },
      set(v){ const E = EH(), s = E.binaryAt(E.time); E.set({ playing: false }); E.time = E.time - s.t + v * s.tMerge; },
      fmt: v => v >= 1 ? 'MERGED' : (v * 100).toFixed(0) + '%', play: true },
    key: () => 'binary',
  };
}

/* ================================================================== */
/* Fig. 3 · relativistic jets                                          */
/* ================================================================== */
function figJets(){
  const E = EH(), P = E.params, Mo = E.model, a = P.spinA * Mo.KM;
  const rH = Mo.kerrRPlus(a) * RS, rIn = Math.max(Mo.kerrIsco(a, P.spin) * RS, rH + 8), rOut = 152, yh = 168, top = 334, R = 252;
  const G = new THREE.Group();
  G.add(base()); G.add(labelPlate(284, 120));
  G.add(at(cyl(24, 10, MAT.mid), 0, 5, 0));
  const posts = [[-R, 0], [0, -R], [R, 0], [0, R]];
  for(const [x, z] of posts){ G.add(at(box(16, top, 16, MAT.mid), x, top / 2, z)); G.add(at(cyl(14, 5, MAT.lo), x, 2.5, z)); G.add(screw(x, top + 12, z, 2)); }
  for(let i = 0; i < 4; i++){
    const p = posts[i], q = posts[(i + 1) % 4], len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const b = box(len + 16, 12, 14, MAT.mid); b.position.set((p[0] + q[0]) / 2, top + 6, (p[1] + q[1]) / 2); b.rotation.y = -Math.atan2(q[1] - p[1], q[0] - p[0]); G.add(b);
  }
  G.add(at(annulus(rIn, rOut, 6, std(warm(0.7).getHex()), { seg: 128 }), 0, yh - 3, 0));
  for(let k = 0; k < 12; k++){ const q = k / 12 * TAU; G.add(screw(Math.cos(q) * (rOut - 8), yh + 3, Math.sin(q) * (rOut - 8), 1.5)); }
  for(const [x, z] of posts){ const b = box((R - rOut) + 4, 6, 10, MAT.hi); b.position.set(x * (R + rOut) / (2 * R), yh, z * (R + rOut) / (2 * R)); b.rotation.y = -Math.atan2(z, x); G.add(b); }
  G.add(at(sphere(rH, MAT.hole), 0, yh, 0));
  // jets: rod, collars streaming outward, a helical field coil turning with the spin
  const jets = [1, -1].map(dir => {
    const start = rH + 6, len = dir > 0 ? top - yh - start - 4 : yh - start - 14;
    const g = new THREE.Group(); G.add(g);
    g.add(at(cyl(2.6, len, MAT.hi, { edges: false }), 0, yh + dir * (start + len / 2), 0));
    const collars = [];
    for(let k = 0; k < 8; k++){
      const mat = new THREE.MeshStandardMaterial({ color: 0x1b2430, emissive: 0x000000, metalness: 0.2, roughness: 0.5 });
      const c = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 5, 40), mat); g.add(c); collars.push(c);
    }
    const coil = new THREE.Group(); coil.position.y = yh; g.add(coil);
    const pts = []; for(let sd = 0; sd <= len; sd += 2){ const q = TAU * sd / 28 * dir, rr = 7 + 0.1 * sd + 9; pts.push([Math.cos(q) * rr, dir * (start + sd), Math.sin(q) * rr]); }
    coil.add(tube(pts, 0.9, new THREE.MeshBasicMaterial({ color: 0x5aa9cc })));
    return { dir, start, len, collars, coil };
  });
  const gG = gauge(-262, 236, Math.PI / 4), gP = gauge(236, -262, Math.PI / 4);
  G.add(gG.group, gP.group);
  const camDir = new THREE.Vector3();
  let info = {};
  return {
    group: G, view: { pos: [560, 420, 640], target: [0, 160, 0] },
    update(t, camera){
      const P = EH().params, g = P.jetGamma, beta = Math.sqrt(1 - 1 / (g * g)), power = P.jetOn ? P.spinA ** 2 : 0;
      // Doppler factors from the real camera direction: D = 1 / γ(1 − β cos ψ)
      camDir.copy(camera.position).sub(new THREE.Vector3(0, yh, 0)).normalize();
      const cosv = camDir.y, Dup = 1 / (g * (1 - beta * cosv)), Ddn = 1 / (g * (1 + beta * cosv));
      info = { g, beta, Dup, Ddn, power, cosv };
      for(const j of jets){
        const D = j.dir > 0 ? Dup : Ddn, b = Math.min(1.6, power / 0.36 * 0.45 * D ** 3);
        const n = j.collars.length, base0 = (t * beta * 26) % (j.len / n);
        j.collars.forEach((c, k) => {
          const sd = base0 + k * j.len / n, w = 7 + 0.1 * sd, fade = Math.min(1, sd / 20) * Math.min(1, (j.len - sd) / 40);
          c.scale.set(w, 1, w); c.position.y = yh + j.dir * (j.start + sd);
          const glow = Math.max(0, b * fade);
          c.material.emissive.setRGB(j.dir > 0 ? 0.55 * glow : 0.75 * glow, j.dir > 0 ? 0.8 * glow : 0.35 * glow, glow);
        });
        j.coil.rotation.y = -t * (0.6 + 3 * P.spinA) * j.dir;
      }
      gG.set((g - 1) / 9); gP.set(power);
    },
    readout(){ const { g, beta, Dup, Ddn } = info; if(!g) return ''; const r = (Dup / Ddn) ** 3; return `γ ${g.toFixed(2)} · β ${beta.toFixed(3)} · D↑ ${Dup.toFixed(2)} · D↓ ${Ddn.toFixed(2)} · ${r >= 100 ? r.toFixed(0) : r.toFixed(1)}× BRIGHTER`; },
    caption(){
      const { g, beta, Dup, Ddn, power, cosv } = info; if(!g) return '';
      if(power <= 0) return 'No spin, no jets: they draw their power from the hole\'s rotation (Blandford–Znajek, P ∝ a²).';
      const angle = Math.acos(Math.abs(cosv)) * 180 / Math.PI, cone = Math.asin(1 / g) * 180 / Math.PI, near = cosv >= 0 ? Dup : Ddn;
      return `You are looking ${angle.toFixed(0)}° off the jet axis. ` + (near >= 1
        ? `The jet leaning toward you is Doppler-boosted (D = ${near.toFixed(2)}); orbit the camera toward the axis and it blazes, toward the side and both dim.`
        : `At β = ${beta.toFixed(3)} the beaming cone is only about ${cone.toFixed(0)}° wide, so from here even the nearer jet is dimmed (D = ${near.toFixed(2)}). Orbit toward the axis to see it flare.`) +
        ` The field coils are wound by the spin, which launches the flow; power ∝ a² = ${power.toFixed(2)} of maximum.`;
    },
    legend: [['lit', 'APPROACHING JET · BOOSTED'], ['dim', 'RECEDING JET · DIMMED'], ['cyan', 'FIELD COILS · WOUND BY THE SPIN'], ['ring', 'DISK ON BRACKETS']],
    control: { label: 'LORENTZ γ', min: 1.05, max: 10, step: 0.01, get: () => EH().params.jetGamma, set: v => EH().set({ jetGamma: v }), fmt: v => v.toFixed(2) },
    key: () => P.spinA.toFixed(3) + '|' + P.spin,
  };
}

/* ================================================================== */
/* Fig. 4 · wormhole                                                    */
/* ================================================================== */
function figWormhole(){
  const b0 = 46, Lm = 4 * b0, yc = 150, rPlate = 236;
  const yOf = l => yc + b0 * Math.asinh(l / b0), rOf = l => Math.sqrt(b0 * b0 + l * l);
  const yTop = yOf(Lm), yBot = yOf(-Lm), rRim = rOf(Lm);
  const G = new THREE.Group();
  G.add(base()); G.add(labelPlate(292, -292));
  // the exact embedding as a turned glass funnel
  const prof = []; for(let i = 0; i <= 80; i++){ const l = -Lm + 2 * Lm * i / 80; prof.push(new THREE.Vector2(rOf(l), yOf(l))); }
  const funnel = new THREE.Mesh(new THREE.LatheGeometry(prof, 96), MAT.glass); funnel.castShadow = true; funnel.receiveShadow = true; G.add(funnel);
  for(let k = 0; k < 16; k++){                       // meridians
    const q = k / 16 * TAU, pts = prof.map(p => new THREE.Vector3(Math.cos(q) * (p.x + 0.4), p.y, Math.sin(q) * (p.x + 0.4)));
    G.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), FAINT));
  }
  for(let i = 1; i < 8; i++){ const l = -Lm + 2 * Lm * i / 8; G.add(ringLine(rOf(l) + 0.4, yOf(l), FAINT)); }
  G.add(torus(b0 + 0.6, 0.9, yc, MAT.cyan));
  // the two universes: plates with their skies
  G.add(at(annulus(rRim, rPlate, 7, MAT.mid, { seg: 128 }), 0, yTop - 7, 0));
  G.add(at(annulus(rRim, rPlate, 7, std(0x2a2536), { seg: 128 }), 0, yBot - 7, 0));
  const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const star = []; for(let k = 0; k < 110; k++){ const r = rRim + 8 + hash(k) * (rPlate - rRim - 14), q = hash(k + 99) * TAU; star.push(new THREE.Vector3(Math.cos(q) * r, yTop + 0.4, Math.sin(q) * r)); }
  G.add(new THREE.Points(new THREE.BufferGeometry().setFromPoints(star), new THREE.PointsMaterial({ color: 0xf0ece4, size: 2.2, sizeAttenuation: true })));
  for(let k = 0; k < 18; k++){
    const r = rRim + 14 + hash(k + 300) * (rPlate - rRim - 26), q = hash(k + 500) * TAU, rr = 5 + hash(k + 700) * 7;
    const sw = new THREE.Group(); sw.position.set(Math.cos(q) * r, 0, Math.sin(q) * r);
    sw.add(ringLine(rr, yBot + 0.4, new THREE.LineBasicMaterial({ color: 0xb07ad8, transparent: true, opacity: 0.7 }), 40));
    sw.add(ringLine(rr * 0.5, yBot + 0.4, new THREE.LineBasicMaterial({ color: 0x5fc4d2, transparent: true, opacity: 0.6 }), 28));
    G.add(sw);
  }
  for(const q of [1, 3, 5, 7].map(k => k * Math.PI / 4)){
    G.add(at(cyl(5, yTop - 7 - yBot, MAT.hi), Math.cos(q) * (rPlate - 16), (yTop - 7 + yBot) / 2, Math.sin(q) * (rPlate - 16)));
    G.add(at(cyl(6, yBot - 7, MAT.mid), Math.cos(q) * (rPlate - 30), (yBot - 7) / 2, Math.sin(q) * (rPlate - 30)));
    G.add(at(cyl(15, 6, MAT.lo), Math.cos(q) * (rPlate - 30), 3, Math.sin(q) * (rPlate - 30)));
  }
  const bead = sphere(6, MAT.lit); G.add(bead);
  let info = {};
  return {
    group: G, view: { pos: [520, 420, 620], target: [0, 140, 0] },
    update(){
      const E = EH(), P = E.params, L = E.wormholeL(), scale = b0 / P.wormB0;
      const l = Math.max(-Lm, Math.min(Lm, L * scale)), r = rOf(l), y = yOf(l), q = Math.PI / 4;
      const nx = b0 / r, ny = -l / r, lift = 7;                  // outward normal (radial, vertical)
      bead.position.set(Math.cos(q) * (r + lift * nx), y + lift * ny, Math.sin(q) * (r + lift * nx));
      info = { L, b: P.wormB0 };
    },
    readout(){ const { L, b } = info; if(b === undefined) return ''; return `b₀ ${b.toFixed(2)} rₛ · ℓ ${L >= 0 ? '+' : '−'}${Math.abs(L).toFixed(2)} rₛ · r(ℓ) ${Math.sqrt(b * b + L * L).toFixed(2)} rₛ · ${L >= 0 ? 'OUR UNIVERSE (A)' : 'THE OTHER (B)'}`; },
    caption(){ const { L, b } = info; if(b === undefined) return '';
      return `The funnel is the wormhole's exact embedding: along the glass, distance is ℓ, and the circles around it have radius √(b₀² + ℓ²), shrinking to the throat (${b.toFixed(2)} rₛ, cyan) and widening into the other universe below. The traveller is where the simulation's camera is. Holding the throat open would take negative-energy matter.`; },
    legend: [['lit', "TRAVELLER · THE CAMERA'S ℓ"], ['glass', 'EXACT ELLIS EMBEDDING'], ['stars', 'UPPER PLATE · OUR UNIVERSE'], ['violet', 'LOWER PLATE · THE OTHER']],
    control: { label: 'TRAVELLER ℓ', min: -20, max: 20, step: 0.01, get: () => EH().wormholeL(), set: v => EH().wormhole(v), fmt: v => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2) + ' rₛ' },
    key: () => 'worm',
  };
}

/* ================================================================== */
/* Shell: renderer, camera, controls, HUD                              */
/* ================================================================== */
const FIGS = [
  { n: 1, name: 'SPIN', title: 'ANATOMY OF A SPINNING BLACK HOLE', make: figSpin },
  { n: 2, name: 'BINARY', title: 'ANATOMY OF A BINARY BLACK HOLE', make: figBinary },
  { n: 3, name: 'JETS', title: 'ANATOMY OF A RELATIVISTIC JET', make: figJets },
  { n: 4, name: 'WORMHOLE', title: 'ANATOMY OF A WORMHOLE', make: figWormhole },
];

const root = document.createElement('div');
root.id = 'anatomy3d';
root.hidden = true;
root.innerHTML = `
  <canvas class="a3-canvas"></canvas>
  <div class="a3-frame" aria-hidden="true"><i class="c tl"></i><i class="c tr"></i><i class="c bl"></i><i class="c br"></i></div>
  <header class="a3-top">
    <div class="a3-brand"><span class="pulse"></span><span class="a3-name">ANATOMY · 3D</span><span class="a3-title"></span></div>
    <nav class="a3-tabs">${FIGS.map(f => `<button data-fig="${f.n}">FIG. ${f.n}<span class="tab-name"> · ${f.name}</span></button>`).join('')}</nav>
    <div class="a3-actions">
      <button class="text-btn a3-plate" title="The isometric drawing">PLATE</button>
      <button class="text-btn a3-reset" title="Reset the camera (R)">RESET VIEW</button>
      <button class="icon-btn a3-close" title="Close (A or Esc)">×</button>
    </div>
  </header>
  <aside class="a3-side"><div class="a3-legend"></div><p class="a3-caption"></p></aside>
  <footer class="a3-bottom">
    <div class="a3-control"><span class="k a3-clabel"></span><input type="range" class="a3-slider"><span class="a3-cval"></span>
      <button class="tl-btn a3-play" title="Play / pause time"><svg class="i-play" viewBox="0 0 16 16"><path d="M5 3.5l7 4.5-7 4.5z"/></svg><svg class="i-pause" viewBox="0 0 16 16"><path d="M5.5 3.5v9M10.5 3.5v9"/></svg></button></div>
    <span class="a3-hint">DRAG ORBIT · RMB / SHIFT PAN · WHEEL ZOOM · ← → ADJUST · 1–4 FIGURES</span>
    <span class="a3-readout"></span>
  </footer>
  <div class="a3-loading" hidden>BUILDING MODEL…</div>`;
document.body.appendChild(root);
const $ = s => root.querySelector(s);

const canvas = $('.a3-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.4;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07080a);
scene.fog = new THREE.Fog(0x07080a, 1600, 3400);
const camera = new THREE.PerspectiveCamera(38, 1, 2, 8000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.minDistance = 120; controls.maxDistance = 2600; controls.maxPolarAngle = Math.PI * 0.495;
controls.screenSpacePanning = true;
controls.keys = {};                                 // the arrow keys adjust the figure instead

scene.add(new THREE.HemisphereLight(0xbfd2ff, 0x101015, 0.8));
const key = new THREE.DirectionalLight(0xfff0dc, 2.4);
key.position.set(-420, 820, 360); key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -560, right: 560, top: 560, bottom: -560, near: 100, far: 2200 });
key.shadow.bias = -0.0004;
scene.add(key);
const rim = new THREE.DirectionalLight(0x7fb8ff, 0.9); rim.position.set(600, 300, -700); scene.add(rim);
const fill = new THREE.DirectionalLight(0xffb36b, 0.35); fill.position.set(500, 160, 600); scene.add(fill);
const floor = new THREE.Mesh(new THREE.CircleGeometry(3200, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x0b0c0f, roughness: 0.95, metalness: 0 }));
floor.position.y = -38.5; floor.receiveShadow = true; scene.add(floor);
const grid = new THREE.GridHelper(2400, 60, 0x1e2128, 0x14161b); grid.position.y = -38.2; grid.material.transparent = true; grid.material.opacity = 0.5; scene.add(grid);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.75, 0.55, 0.82);
composer.addPass(bloom);
composer.addPass(new OutputPass());

let fig = null, figDef = FIGS[0], builtKey = '', clock = 0, last = performance.now(), raf = 0, uiTick = 0, open = false;
const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

function resize(){
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); composer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', () => { if(open) resize(); });

function setView(v){ camera.position.set(...v.pos); controls.target.set(...v.target); controls.update(); }
function build(resetView){
  if(fig){ scene.remove(fig.group); disposeTree(fig.group); }
  fig = figDef.make();
  fig.group.traverse(o => { if(o.isMesh){ o.castShadow = o.castShadow !== false; } });
  scene.add(fig.group);
  builtKey = figDef.n + '|' + fig.key();
  if(resetView) setView(fig.view);
  $('.a3-title').textContent = figDef.title;
  root.querySelectorAll('.a3-tabs button').forEach(b => b.classList.toggle('on', +b.dataset.fig === figDef.n));
  $('.a3-legend').innerHTML = fig.legend.map(([k, t]) => `<span><i class="k-${k}"></i>${t}</span>`).join('');
  const c = fig.control, s = $('.a3-slider');
  $('.a3-clabel').textContent = c.label;
  Object.assign(s, { min: c.min, max: c.max, step: c.step });
  $('.a3-play').hidden = !c.play;
}
function show(n){ figDef = FIGS[n - 1] || FIGS[0]; build(true); }

function frame(now){
  raf = requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if(!reduce) clock += dt * 5;
  if(figDef.n + '|' + fig.key() !== builtKey) build(false);          // spin changed: rebuild the instrument
  controls.update();
  fig.update(clock, camera);
  composer.render();
  if((uiTick -= dt) <= 0){
    uiTick = 0.1;
    $('.a3-readout').textContent = fig.readout();
    $('.a3-caption').textContent = fig.caption();
    const c = fig.control, s = $('.a3-slider');
    if(document.activeElement !== s){ s.value = c.get(); }
    s.style.setProperty('--p', ((s.value - c.min) / (c.max - c.min) * 100) + '%');
    $('.a3-cval').textContent = c.fmt(+s.value);
    root.classList.toggle('playing', !!EH().params.playing);
  }
}

$('.a3-slider').addEventListener('input', e => { fig.control.set(+e.target.value); });
$('.a3-play').onclick = () => { const P = EH().params; EH().set({ playing: !P.playing }); };
$('.a3-reset').onclick = () => setView(fig.view);
$('.a3-close').onclick = () => close3d();
$('.a3-plate').onclick = () => { const n = figDef.n; close3d(); window.EventHorizonAnatomy && window.EventHorizonAnatomy.openPlate(n); };
root.querySelectorAll('.a3-tabs button').forEach(b => b.onclick = () => show(+b.dataset.fig));

function open3d(n){
  open = true;
  root.hidden = false;
  document.body.classList.add('anatomy-open');
  EH().pauseRender(true);
  resize();
  const sc = EH().params.scene;
  show(n || (sc === 'binary' ? 2 : sc === 'wormhole' ? 4 : 1));
  last = performance.now();
  cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
  canvas.focus && canvas.focus();
}
function close3d(){
  open = false;
  root.hidden = true;
  document.body.classList.remove('anatomy-open');
  EH().pauseRender(false);
  cancelAnimationFrame(raf);
}

addEventListener('keydown', e => {
  if(!open || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key;
  if(k === 'Escape'){ close3d(); e.preventDefault(); }
  else if(k >= '1' && k <= '4'){ show(+k); e.preventDefault(); }
  else if(k === 'r' || k === 'R'){ setView(fig.view); e.preventDefault(); }
  else if(k === 'ArrowLeft' || k === 'ArrowRight'){
    const c = fig.control, span = c.max - c.min;
    c.set(Math.min(c.max, Math.max(c.min, c.get() + (k === 'ArrowRight' ? 1 : -1) * span / 60)));
    e.preventDefault();
  }
});

window.Anatomy3D = { open: open3d, close: close3d, isOpen: () => open, show };
