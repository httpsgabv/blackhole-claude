/* Anatomy view: the spinning black hole as a bench instrument.
   An isometric SVG figure whose every moving part and number comes from the
   same Kerr model as the simulation (window.EventHorizon.model):
     horizon ball (r₊) · ergosphere well (1 rₛ at the equator) · disk rings turning
     at their own orbital speeds, inner edge on the ISCO · a lit bead riding the
     ISCO · engraved photon-orbit grooves · a frame-dragging vane on the spin
     axle · crown that sets the spin · a/M dial · ruler with r₊ and ISCO sliders. */
(function(){
'use strict';

const $ = s => document.querySelector(s);
const EH = () => window.EventHorizon;

/* ------------------------------------------------------------------ */
/* Isometric drawing kit                                               */
/* ------------------------------------------------------------------ */
/* World units: 40 = 1 rₛ. x, y on the floor, z up. Viewer looks from +x+y. */
const RS = 40;
const C30 = Math.cos(Math.PI / 6);
const PRJ = (x, y, z) => [(x - y) * C30, (x + y) * 0.5 - z];
const SPHERE_K = 1.2247;                      // a sphere's outline radius in an isometric drawing
const FRONT0 = -Math.PI / 4, FRONT1 = 3 * Math.PI / 4;   // visible half of anything round
const f1 = v => (Math.round(v * 10) / 10).toString();
const pathOf = (pts, close = true) => 'M' + pts.map(p => f1(p[0]) + ' ' + f1(p[1])).join('L') + (close ? 'Z' : '');
const isFront = a => Math.cos(a - Math.PI / 4) > 0;
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

const INK = 'var(--an-ink)', FAINT = 'var(--an-faint)', LIT = 'var(--an-lit)';
const TONES = {
  lo:  { top: '#1b1e25', l: '#171a20', r: '#0f1115' },
  mid: { top: '#282c35', l: '#21242c', r: '#17191f' },
  hi:  { top: '#383d48', l: '#2d313a', r: '#22252c' },
};
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mixHex = (a, b, t) => { const A = hex(a), B = hex(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };

let defs = [], gid = 0;
function sideGradient(tone, x0, x1){
  const id = 'ag' + (gid++);
  defs.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${f1(x0)}" y1="0" x2="${f1(x1)}" y2="0"><stop offset="0" stop-color="${tone.l}"/><stop offset="1" stop-color="${tone.r}"/></linearGradient>`);
  return `url(#${id})`;
}
function arc(cx, cy, z, r, a0, a1, n = 48){
  const out = [];
  for(let i = 0; i <= n; i++){ const a = a0 + (a1 - a0) * i / n; out.push(PRJ(cx + r * Math.cos(a), cy + r * Math.sin(a), z)); }
  return out;
}
const ellipse = (cx, cy, z, r, fill, stroke = INK, sw = 0.6) =>
  `<path d="${pathOf(arc(cx, cy, z, r, 0, 2 * Math.PI, 64))}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;

/* vertical cylinder: shaded front side + top */
function cylinder(cx, cy, z0, z1, r, tone, o = {}){
  const L = PRJ(cx + r * Math.cos(FRONT1), cy + r * Math.sin(FRONT1), 0)[0], R = PRJ(cx + r * Math.cos(FRONT0), cy + r * Math.sin(FRONT0), 0)[0];
  const side = arc(cx, cy, z1, r, FRONT0, FRONT1).concat(arc(cx, cy, z0, r, FRONT1, FRONT0));
  let s = `<path d="${pathOf(side)}" fill="${sideGradient(tone, L, R)}" stroke="${INK}" stroke-width="0.6"/>`;
  if(o.knurl){
    for(let a = FRONT0 + 0.12; a < FRONT1; a += o.knurl){
      const p0 = PRJ(cx + r * Math.cos(a), cy + r * Math.sin(a), z0 + 0.6), p1 = PRJ(cx + r * Math.cos(a), cy + r * Math.sin(a), z1 - 0.6);
      s += `<path d="M${f1(p0[0])} ${f1(p0[1])}L${f1(p1[0])} ${f1(p1[1])}" stroke="${FAINT}" stroke-width="0.5"/>`;
    }
  }
  if(o.top !== false) s += ellipse(cx, cy, z1, r, o.topFill || tone.top);
  return s;
}
/* extrude a convex floor outline (counter-clockwise) */
function extrude(pts, z0, z1, tone, o = {}){
  const n = pts.length; let s = '';
  const front = [];
  for(let i = 0; i < n; i++){
    const a = pts[i], b = pts[(i + 1) % n];
    const ex = b[0] - a[0], ey = b[1] - a[1], l = Math.hypot(ex, ey) || 1;
    const nx = ey / l, ny = -ex / l;
    if(nx + ny <= 1e-6) continue;
    const t = Math.max(0, Math.min(1, (ny - nx + Math.SQRT2) / (2 * Math.SQRT2)));
    const fill = mixHex(tone.r, tone.l, t);
    const q = [PRJ(a[0], a[1], z1), PRJ(b[0], b[1], z1), PRJ(b[0], b[1], z0), PRJ(a[0], a[1], z0)];
    s += `<path d="${pathOf(q)}" fill="${fill}" stroke="${fill}" stroke-width="0.4"/>`;
    front.push(i);
  }
  // silhouette of the visible sides
  if(front.length){
    let k0 = front.findIndex((v, j) => !front.includes((v - 1 + n) % n));
    if(k0 < 0) k0 = 0;
    const chain = [];
    for(let j = 0; j < front.length; j++) chain.push(front[(k0 + j) % front.length]);
    const topPts = chain.map(i => pts[i]).concat([pts[(chain[chain.length - 1] + 1) % n]]);
    const outline = topPts.map(p => PRJ(p[0], p[1], z1)).concat(topPts.slice().reverse().map(p => PRJ(p[0], p[1], z0)));
    s += `<path d="${pathOf(outline)}" fill="none" stroke="${INK}" stroke-width="0.6"/>`;
  }
  s += `<path d="${pathOf(pts.map(p => PRJ(p[0], p[1], z1)))}" fill="${o.topFill || tone.top}" stroke="${INK}" stroke-width="0.6"/>`;
  return s;
}
function roundRect(x0, y0, x1, y1, r, seg = 6){
  const pts = [], cs = [[x1 - r, y1 - r, 0], [x0 + r, y1 - r, 0.5], [x0 + r, y0 + r, 1], [x1 - r, y0 + r, 1.5]];
  for(const [cx, cy, q] of cs) for(let i = 0; i <= seg; i++){ const a = (q + i / seg * 0.5) * Math.PI; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return pts;
}
const box = (x0, y0, x1, y1, z0, z1, tone, o) => extrude([[x1, y0], [x1, y1], [x0, y1], [x0, y0]], z0, z1, tone, o);
function screw(x, y, z, r = 2.4){
  const c = PRJ(x, y, z);
  return `<ellipse cx="${f1(c[0])}" cy="${f1(c[1])}" rx="${f1(r * 1.22)}" ry="${f1(r * 0.7)}" fill="#0d0f13" stroke="${INK}" stroke-width="0.5"/>` +
         `<path d="M${f1(c[0] - r * 0.8)} ${f1(c[1] - r * 0.25)}L${f1(c[0] + r * 0.8)} ${f1(c[1] + r * 0.25)}" stroke="${FAINT}" stroke-width="0.6"/>`;
}
const line = (a, b, stroke = INK, w = 0.6) => `<path d="M${f1(a[0])} ${f1(a[1])}L${f1(b[0])} ${f1(b[1])}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round"/>`;
function sphere(x, y, z, r, inner, outer, stroke = INK){
  const c = PRJ(x, y, z), R = r * SPHERE_K, id = 'as' + (gid++);
  defs.push(`<radialGradient id="${id}" cx="0.36" cy="0.3" r="0.75"><stop offset="0" stop-color="${inner}"/><stop offset="1" stop-color="${outer}"/></radialGradient>`);
  return `<circle cx="${f1(c[0])}" cy="${f1(c[1])}" r="${f1(R)}" fill="url(#${id})" stroke="${stroke}" stroke-width="0.7"/>`;
}
/* annulus sector on a horizontal plane */
function annulus(cx, cy, z, rIn, rOut, a0, a1, fill, stroke = INK){
  const o = arc(cx, cy, z, rOut, a0, a1), i = arc(cx, cy, z, rIn, a1, a0);
  // fill the sector; stroke only its arcs, so cut ends between halves leave no seam
  return `<path d="${pathOf(o.concat(i))}" fill="${fill}" stroke="${fill}" stroke-width="0.4"/>` +
         `<path d="${pathOf(o, false)}" fill="none" stroke="${stroke}" stroke-width="0.5"/>` +
         `<path d="${pathOf(i, false)}" fill="none" stroke="${stroke}" stroke-width="0.5"/>`;
}
/* a band of a vertical round wall between z0 and z1 over angles a0..a1 */
function wall(cx, cy, z0, z1, r, a0, a1, fill){
  const pts = arc(cx, cy, z1, r, a0, a1).concat(arc(cx, cy, z0, r, a1, a0));
  return `<path d="${pathOf(pts)}" fill="${fill}" stroke="${INK}" stroke-width="0.5"/>`;
}

/* ------------------------------------------------------------------ */
/* Model: everything the figure shows comes from the simulation's Kerr  */
/* ------------------------------------------------------------------ */
function modelAt(spinA, sense){
  const M = EH().model, a = spinA * M.KM;
  const isco = M.kerrIsco(a, sense);
  return {
    spinA, a, sense,
    rPlus: M.kerrRPlus(a), isco,
    phPro: M.kerrPhoton(a, 1), phRetro: M.kerrPhoton(a, -1),
    vIsco: M.kerrOrbit(isco, sense, a).v,
    omega: r => M.kerrOrbit(r, sense, a).Om,
    drag: r => M.zamo(r, Math.PI / 2, a).omega,
  };
}
/* Novikov-Thorne-like temperature profile (same shape as the shader), peak = 1 */
function heat(r, rIn){
  const rr = Math.max(r / rIn, 1.0001);
  return Math.pow(rr, -0.75) * Math.pow(1 - Math.sqrt(1 / rr), 0.25) / 0.488;
}

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */
const BASE = 340, Z_PLINTH = 14, Z_RING0 = 15, Z_RING1 = 21, Z_WELL = 5;
const R_PLINTH = 262, R_WELL = 1 * RS, R_DISK_OUT = 6.2 * RS, N_RINGS = 9;
const POST_X = 304, Z_BRIDGE = 214, Z_EQ = (Z_RING0 + Z_RING1) / 2;
const DIAL = { x: -252, y: 238, z: 96, r: 30 };
const RULER = { x0: 0, x1: 300, y0: 300, y1: 322 };

function ringsOf(m){
  const rIn = m.isco * RS, out = [];
  for(let k = 0; k < N_RINGS; k++){
    const r0 = rIn * Math.pow(R_DISK_OUT / rIn, k / N_RINGS), r1 = rIn * Math.pow(R_DISK_OUT / rIn, (k + 1) / N_RINGS);
    const rm = (r0 + r1) / 2;
    const warm = Math.min(1, heat(rm, rIn));
    out.push({ r0: r0 + (k ? 0.8 : 0), r1: r1 - 0.8, rm, om: m.omega(rm / RS), top: mixHex(TONES.mid.top, '#6a4a2c', 0.75 * warm) });
  }
  return out;
}

/* static art, split into the layers that moving parts slot between */
function buildStatic(m){
  defs = []; gid = 0;
  const L = { back: '', sphere: '', front: '', top: '' };

  /* --- halo, feet, base plate ------------------------------------- */
  const h0 = PRJ(0, 0, -36);
  defs.push(`<radialGradient id="halo"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>`);
  L.back += `<ellipse cx="${f1(h0[0])}" cy="${f1(h0[1] + 14)}" rx="${f1(BASE * 2.1)}" ry="${f1(BASE * 1.05)}" fill="url(#halo)"/>`;
  for(const [x, y] of [[-300, -300], [300, -300], [-300, 300], [300, 300]]) L.back += cylinder(x, y, -38, -22, 20, TONES.lo);
  L.back += extrude(roundRect(-BASE, -BASE, BASE, BASE, 26), -22, 0, TONES.lo);
  L.back += `<path d="${pathOf(roundRect(-BASE + 11, -BASE + 11, BASE - 11, BASE - 11, 17).map(p => PRJ(p[0], p[1], 0)))}" fill="none" stroke="${FAINT}" stroke-width="0.6"/>`;
  for(const [x, y] of [[-318, -318], [318, -318], [-318, 318], [318, 318]]) L.back += screw(x, y, 0);

  /* --- label plate, ruler strip ------------------------------------ */
  L.back += box(250, -232, 318, -150, 0, 2.5, TONES.mid);
  for(const [x, y] of [[256, -226], [312, -226], [256, -156], [312, -156]]) L.back += screw(x, y, 2.5, 1.6);
  for(let i = 0; i < 3; i++){ const y = -210 + i * 18; L.back += line(PRJ(262, y, 2.5), PRJ(306, y, 2.5), FAINT, 0.7); }
  L.back += box(RULER.x0, RULER.y0, RULER.x1, RULER.y1, 0, 3, TONES.mid);
  for(let x = RULER.x0 + 2; x <= RULER.x1 - 2; x += RS / 4){
    const major = Math.abs((x - 2) % RS) < 1e-6 || Math.abs(x - 2) < 1e-6;
    L.back += line(PRJ(x, RULER.y0, 3), PRJ(x, RULER.y0 + (major ? 11 : 5), 3), major ? INK : FAINT, major ? 0.7 : 0.5);
  }
  const lab = PRJ(RULER.x1 - 14, RULER.y1 - 6, 3);
  L.back += `<text x="${f1(lab[0])}" y="${f1(lab[1])}" class="an-engrave">rₛ</text>`;

  /* --- back bridge post (behind the platter) ----------------------- */
  L.back += box(-POST_X - 9, -9, -POST_X + 9, 9, 0, Z_BRIDGE, TONES.mid);
  L.back += cylinder(-POST_X, 0, 0, 6, 16, TONES.lo, { top: false });

  /* --- plinth with the ergosphere well ---------------------------- */
  // outer wall (front half), top annulus, well wall (back half), well floor
  L.back += cylinder(0, 0, 0, Z_PLINTH, R_PLINTH, TONES.lo, { top: false });
  L.back += annulus(0, 0, Z_PLINTH, R_WELL, R_PLINTH, 0, 2 * Math.PI, TONES.lo.top);
  L.back += ellipse(0, 0, Z_WELL, R_WELL, '#0b0c10', FAINT, 0.5);
  L.back += wall(0, 0, Z_WELL, Z_PLINTH, R_WELL, FRONT1, FRONT1 + Math.PI, '#14161b');
  // the well floor's radial ruling: the ergoregion
  for(let k = 0; k < 24; k++){
    const a = k / 24 * 2 * Math.PI, ri = m.rPlus * RS * SPHERE_K * 0.6 + 2;
    if(ri < R_WELL - 3) L.back += line(PRJ(Math.cos(a) * ri, Math.sin(a) * ri, Z_WELL), PRJ(Math.cos(a) * (R_WELL - 1), Math.sin(a) * (R_WELL - 1), Z_WELL), FAINT, 0.5);
  }

  /* degree scale engraved on the plinth rim: ticks hang from the outer edge */
  for(let k = 0; k < 72; k++){
    const a = k / 72 * 2 * Math.PI, major = k % 6 === 0;
    const r1 = R_PLINTH - 1.5, r0 = R_PLINTH - (major ? 11 : 6);
    L.back += line(PRJ(Math.cos(a) * r0, Math.sin(a) * r0, Z_PLINTH), PRJ(Math.cos(a) * r1, Math.sin(a) * r1, Z_PLINTH), major ? INK : FAINT, major ? 0.6 : 0.45);
  }
  /* cable from the dial stand to the back post's foot, lying on the base, ending on terminals */
  const cab = [];
  const c0 = [DIAL.x - 4, DIAL.y - 12], c3 = [-POST_X - 6, 18], c1 = [DIAL.x - 40, DIAL.y - 110], c2 = [-POST_X - 30, 120];
  for(let i = 0; i <= 40; i++){
    const t = i / 40, u = 1 - t;
    const x = u * u * u * c0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * c3[0];
    const y = u * u * u * c0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * c3[1];
    cab.push(PRJ(x, y, 1.2));
  }
  L.back += `<path d="${pathOf(cab, false)}" fill="none" stroke="#090a0d" stroke-width="3.4" stroke-linecap="round"/>` +
            `<path d="${pathOf(cab, false)}" fill="none" stroke="${TONES.hi.top}" stroke-width="1.8" stroke-linecap="round"/>`;
  for(const [x, y] of [c0, c3]){ const q = PRJ(x, y, 1.2); L.back += `<circle cx="${f1(q[0])}" cy="${f1(q[1])}" r="2.2" fill="${TONES.hi.top}" stroke="${INK}" stroke-width="0.5"/>`; }

  /* --- disk rings: back halves (top + inner wall) ------------------ */
  const rings = ringsOf(m);
  for(const g of rings){
    L.back += wall(0, 0, Z_RING0, Z_RING1, g.r0, FRONT1, FRONT1 + Math.PI, TONES.lo.r);
    L.back += annulus(0, 0, Z_RING1, g.r0, g.r1, FRONT1, FRONT1 + Math.PI, g.top);
  }
  /* photon-orbit grooves, back halves, on whatever surface lies at that radius */
  const grooveZ = r => r >= m.isco * RS ? Z_RING1 : r >= R_WELL ? Z_PLINTH : Z_WELL;
  const grooves = [[m.phPro * RS, 1], [m.phRetro * RS, 0.55]];
  for(const [r, a] of grooves) L.back += `<path d="${pathOf(arc(0, 0, grooveZ(r), r, FRONT1, FRONT1 + Math.PI), false)}" fill="none" stroke="var(--an-cyan)" stroke-opacity="${a}" stroke-width="0.9"/>`;

  /* --- the horizon -------------------------------------------------- */
  L.sphere += sphere(0, 0, Z_EQ, m.rPlus * RS, '#2c313a', '#020203', 'var(--an-ink-hi)');
  const zc = Z_EQ + m.rPlus * RS * SPHERE_K * 0.97;
  L.sphere += cylinder(0, 0, zc - 3, zc + 2, 6.5, TONES.mid);   // bearing collar where the axle meets the horizon

  /* --- front halves: rings (top + outer wall), grooves ------------- */
  for(const g of rings){
    L.front += wall(0, 0, Z_RING0, Z_RING1, g.r1, FRONT0, FRONT1, sideGradient(TONES.mid, PRJ(-g.r1 * 0.707, g.r1 * 0.707, 0)[0], PRJ(g.r1 * 0.707, -g.r1 * 0.707, 0)[0]));
    L.front += annulus(0, 0, Z_RING1, g.r0, g.r1, FRONT0, FRONT1, g.top);
  }
  for(const [r, a] of grooves) L.front += `<path d="${pathOf(arc(0, 0, grooveZ(r), r, FRONT0, FRONT1), false)}" fill="none" stroke="var(--an-cyan)" stroke-opacity="${a}" stroke-width="0.9"/>`;

  /* --- front post, crossbar, bearing, crown, dial ------------------ */
  L.top += box(POST_X - 9, -9, POST_X + 9, 9, 0, Z_BRIDGE, TONES.mid);
  L.top += cylinder(POST_X, 0, 0, 6, 16, TONES.lo, { top: false });
  L.top += box(-POST_X - 12, -10, POST_X + 12, 10, Z_BRIDGE, Z_BRIDGE + 16, TONES.mid);
  for(const x of [-POST_X, POST_X]) L.top += screw(x, 0, Z_BRIDGE + 16, 2);
  L.top += cylinder(0, 0, Z_BRIDGE + 16, Z_BRIDGE + 27, 15, TONES.hi);
  L.top += cylinder(0, 0, Z_BRIDGE + 27, Z_BRIDGE + 31, 9, TONES.mid);
  L.top += cylinder(0, 0, Z_BRIDGE + 31, Z_BRIDGE + 47, 19, TONES.hi, { knurl: 0.16 });
  L.top += screw(0, 0, Z_BRIDGE + 47, 2.2);

  /* dial stand + bezel (face and needle are live) */
  L.top += cylinder(DIAL.x, DIAL.y, 0, 4, 12, TONES.mid);
  L.top += cylinder(DIAL.x, DIAL.y, 4, DIAL.z - DIAL.r + 2, 3.5, TONES.hi);
  L.top += dialBody();
  return L;
}

/* a disc in the vertical plane facing the viewer (normal (1,1,0)/√2) */
const DU = [Math.SQRT1_2, -Math.SQRT1_2], DN = [Math.SQRT1_2, Math.SQRT1_2];
const dialPt = (th, rr, off = 0) => PRJ(DIAL.x + rr * Math.cos(th) * DU[0] + off * DN[0], DIAL.y + rr * Math.cos(th) * DU[1] + off * DN[1], DIAL.z + rr * Math.sin(th));
const dialAngle = v => (210 - v * 240) * Math.PI / 180;
function dialBody(){
  const ring = (rr, off) => Array.from({ length: 65 }, (_, i) => dialPt(i / 64 * 2 * Math.PI, rr, off));
  let s = `<path d="${pathOf(ring(DIAL.r + 3, -6))}" fill="${TONES.lo.r}" stroke="${INK}" stroke-width="0.6"/>`;
  s += `<path d="${pathOf(ring(DIAL.r + 3, 0))}" fill="${TONES.mid.l}" stroke="${INK}" stroke-width="0.6"/>`;
  s += `<path d="${pathOf(ring(DIAL.r - 1, 0.5))}" fill="#101216" stroke="${INK}" stroke-width="0.5"/>`;
  for(let i = 0; i <= 20; i++){
    const v = i / 20, th = dialAngle(v), major = i % 10 === 0, mid = i % 2 === 0;
    s += line(dialPt(th, DIAL.r - 1.5, 0.5), dialPt(th, DIAL.r - (major ? 9 : mid ? 6 : 4), 0.5), major ? 'var(--an-ink-hi)' : mid ? INK : FAINT, major ? 0.9 : 0.6);
  }
  const t = dialPt(-Math.PI / 2, 12, 0.5);
  s += `<text x="${f1(t[0])}" y="${f1(t[1])}" class="an-engrave" text-anchor="middle">a/M</text>`;
  return s;
}

/* ------------------------------------------------------------------ */
/* Live parts                                                          */
/* ------------------------------------------------------------------ */
function buildLive(m, t, rings){
  const L = { back: '', front: '', top: '' };
  /* ring marks: an index line and three rivets per ring, turning at the ring's own Ω */
  rings.forEach((g, k) => {
    const th = g.om * t + k * 0.7;
    for(let j = 0; j < 4; j++){
      const a = th + j * Math.PI / 2;
      const s = j === 0
        ? line(PRJ(Math.cos(a) * (g.r0 + 1), Math.sin(a) * (g.r0 + 1), Z_RING1), PRJ(Math.cos(a) * (g.r1 - 1), Math.sin(a) * (g.r1 - 1), Z_RING1), 'var(--an-ink-hi)', 0.9)
        : screw(Math.cos(a) * g.rm, Math.sin(a) * g.rm, Z_RING1, 1.5);
      if(isFront(a)) L.front += s; else L.back += s;
    }
  });
  /* the lit bead: gas on the innermost stable orbit */
  const ab = m.omega(m.isco) * t, rb = m.isco * RS + 6;
  const bc = PRJ(Math.cos(ab) * rb, Math.sin(ab) * rb, Z_RING1 + 5.5);
  const bead = `<circle cx="${f1(bc[0])}" cy="${f1(bc[1])}" r="14" fill="url(#beadGlow)"/>` +
               sphere(Math.cos(ab) * rb, Math.sin(ab) * rb, Z_RING1 + 5.5, 5.5, '#ffffff', '#c9c1b2', 'var(--an-lit)');
  if(isFront(ab)) L.front += bead; else L.back += bead;

  /* spin axle from the horizon to the bridge, with the frame-dragging vane */
  const zTop = Z_EQ + m.rPlus * RS * SPHERE_K * 0.97 + 2;
  const vz = Z_BRIDGE - 74, av = m.drag(1.3) * t * 8;      // vane at 1.3 rₛ; ω is slow, so its turn is scaled ×8
  const vaneBack = !isFront(av + Math.PI / 2) ? 0 : 1;
  const vane = () => {
    const d = [Math.cos(av), Math.sin(av)];
    const q = [[3.5, vz], [40, vz + 4], [40, vz + 22], [3.5, vz + 26]].map(([r, z]) => PRJ(d[0] * r, d[1] * r, z));
    const facing = Math.abs(Math.cos(av - Math.PI / 4));
    return `<path d="${pathOf(q)}" fill="${mixHex(TONES.hi.r, TONES.hi.top, facing)}" stroke="${INK}" stroke-width="0.6"/>` +
           line(PRJ(d[0] * 24, d[1] * 24, vz + 3.5), PRJ(d[0] * 24, d[1] * 24, vz + 22.5), FAINT, 0.5);
  };
  let axle = '';
  if(!vaneBack) axle += vane();
  axle += cylinder(0, 0, zTop, Z_BRIDGE, 3, TONES.hi, { top: false });
  axle += cylinder(0, 0, vz - 3, vz, 6, TONES.mid);
  if(vaneBack) axle += vane();
  L.top = axle;

  /* sliders on the ruler: horizon and ISCO */
  const slider = (r, cls) => {
    const x = r * RS + 2;
    return box(x - 7, RULER.y0 - 4, x + 7, RULER.y1 + 4, 3, 11, cls === 'isco' ? TONES.hi : TONES.mid) +
           line(PRJ(x, RULER.y0 - 4, 11), PRJ(x, RULER.y0 + 8, 11), cls === 'isco' ? 'var(--an-amber)' : 'var(--an-ink-hi)', 1);
  };
  L.slide = slider(m.rPlus, 'rp') + slider(m.isco, 'isco');

  /* dial needle */
  const th = dialAngle(m.spinA);
  L.needle = line(dialPt(th + Math.PI, 5, 1), dialPt(th, DIAL.r - 5, 1), 'var(--an-ink-hi)', 1.3) +
             `<circle cx="${f1(dialPt(0, 0, 1.2)[0])}" cy="${f1(dialPt(0, 0, 1.2)[1])}" r="2.4" fill="${TONES.hi.top}" stroke="${INK}" stroke-width="0.5"/>`;
  return L;
}

/* ------------------------------------------------------------------ */
/* Shared parts for the other figures                                  */
/* ------------------------------------------------------------------ */
function baseKit(){
  let s = '';
  const h0 = PRJ(0, 0, -36);
  defs.push(`<radialGradient id="halo"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>`);
  s += `<ellipse cx="${f1(h0[0])}" cy="${f1(h0[1] + 14)}" rx="${f1(BASE * 2.1)}" ry="${f1(BASE * 1.05)}" fill="url(#halo)"/>`;
  for(const [x, y] of [[-300, -300], [300, -300], [-300, 300], [300, 300]]) s += cylinder(x, y, -38, -22, 20, TONES.lo);
  s += extrude(roundRect(-BASE, -BASE, BASE, BASE, 26), -22, 0, TONES.lo);
  s += `<path d="${pathOf(roundRect(-BASE + 11, -BASE + 11, BASE - 11, BASE - 11, 17).map(p => PRJ(p[0], p[1], 0)))}" fill="none" stroke="${FAINT}" stroke-width="0.6"/>`;
  for(const [x, y] of [[-318, -318], [318, -318], [-318, 318], [318, 318]]) s += screw(x, y, 0);
  return s;
}
function labelPlate(x0, y0){
  let s = box(x0, y0, x0 + 68, y0 + 82, 0, 2.5, TONES.mid);
  for(const [x, y] of [[x0 + 6, y0 + 6], [x0 + 62, y0 + 6], [x0 + 6, y0 + 76], [x0 + 62, y0 + 76]]) s += screw(x, y, 2.5, 1.6);
  for(let i = 0; i < 3; i++){ const y = y0 + 22 + i * 18; s += line(PRJ(x0 + 12, y, 2.5), PRJ(x0 + 56, y, 2.5), FAINT, 0.7); }
  return s;
}
/* a gauge on a stand, face in the vertical plane facing the viewer */
function gaugeAt(G){
  const pt = (th, rr, off = 0) => PRJ(G.x + rr * Math.cos(th) * DU[0] + off * DN[0], G.y + rr * Math.cos(th) * DU[1] + off * DN[1], G.z + rr * Math.sin(th));
  const ring = (rr, off) => Array.from({ length: 65 }, (_, i) => pt(i / 64 * 2 * Math.PI, rr, off));
  let s = cylinder(G.x, G.y, 0, 4, 12, TONES.mid) + cylinder(G.x, G.y, 4, G.z - G.r + 2, 3.5, TONES.hi);
  s += `<path d="${pathOf(ring(G.r + 3, -6))}" fill="${TONES.lo.r}" stroke="${INK}" stroke-width="0.6"/>`;
  s += `<path d="${pathOf(ring(G.r + 3, 0))}" fill="${TONES.mid.l}" stroke="${INK}" stroke-width="0.6"/>`;
  s += `<path d="${pathOf(ring(G.r - 1, 0.5))}" fill="#101216" stroke="${INK}" stroke-width="0.5"/>`;
  for(let i = 0; i <= 20; i++){
    const th = dialAngle(i / 20), major = i % 10 === 0, mid = i % 2 === 0;
    s += line(pt(th, G.r - 1.5, 0.5), pt(th, G.r - (major ? 9 : mid ? 6 : 4), 0.5), major ? 'var(--an-ink-hi)' : mid ? INK : FAINT, major ? 0.9 : 0.6);
  }
  const t = pt(-Math.PI / 2, 12, 0.5);
  s += `<text x="${f1(t[0])}" y="${f1(t[1])}" class="an-engrave" text-anchor="middle">${G.label}</text>`;
  return s;
}
function gaugeNeedle(G, v){
  const pt = (th, rr, off = 0) => PRJ(G.x + rr * Math.cos(th) * DU[0] + off * DN[0], G.y + rr * Math.cos(th) * DU[1] + off * DN[1], G.z + rr * Math.sin(th));
  const th = dialAngle(Math.max(0, Math.min(1, v)));
  const c = pt(0, 0, 1.2);
  return line(pt(th + Math.PI, 5, 1), pt(th, G.r - 5, 1), 'var(--an-ink-hi)', 1.3) +
         `<circle cx="${f1(c[0])}" cy="${f1(c[1])}" r="2.4" fill="${TONES.hi.top}" stroke="${INK}" stroke-width="0.5"/>`;
}
/* a box rotated about the vertical axis: centre (cx, cy), half-lengths along/across */
function rotBox(cx, cy, ang, hl, hw, z0, z1, tone){
  const u = [Math.cos(ang), Math.sin(ang)], v = [-u[1], u[0]];
  const c = (a, b) => [cx + u[0] * a + v[0] * b, cy + u[1] * a + v[1] * b];
  return extrude([c(hl, -hw), c(hl, hw), c(-hl, hw), c(-hl, -hw)], z0, z1, tone);
}
/* a polyline split into pieces with their own stroke opacity */
function fadedPolyline(pts, alphas, color, w){
  let s = '';
  for(let i = 0; i + 1 < pts.length; i++){
    const a = (alphas[i] + alphas[i + 1]) / 2;
    if(a < 0.02) continue;
    s += `<path d="M${f1(pts[i][0])} ${f1(pts[i][1])}L${f1(pts[i + 1][0])} ${f1(pts[i + 1][1])}" stroke="${color}" stroke-opacity="${a.toFixed(2)}" stroke-width="${w}" stroke-linecap="round"/>`;
  }
  return s;
}
const depthOf = (x, y, z) => x + y + z;          // toward the viewer along (1,1,1)

/* ================================================================== */
/* Fig. 2 · Binary black hole: a two-ball orrery over a wave plate      */
/* ================================================================== */
const B_RS = 40;                                  // world units per rₛ in this figure
const REC = { x0: -312, x1: -150, y0: 186, y1: 292, z: 34 };
const CRANK = { x: 252, y: -186 };
const fig2 = {
  id: 'binary', n: 2, title: 'ANATOMY OF A BINARY BLACK HOLE', hint: 'DRAG SIDEWAYS TO SCRUB THE INSPIRAL · ← →',
  legend: `<span><i class="k-lit"></i>PEN · THE CHIRP AS IT IS RECORDED</span><span><i class="k-ball"></i>THE TWO HOLES · BALLS SIZED BY rₛ</span>
           <span><i class="k-cyan"></i>WAVE CRESTS · TWO ARMS, MOVING OUT AT c</span><span><i class="k-ring"></i>CRANK · TURNS WITH TIME</span>`,
  key(){ return 'binary'; },
  build(){
    let back = baseKit() + labelPlate(250, -300);
    // wave plate on its plinth, with a degree scale
    back += cylinder(0, 0, 0, 14, 262, TONES.lo, { top: false });
    back += ellipse(0, 0, 14, 262, TONES.lo.top);
    for(let k = 0; k < 72; k++){
      const a = k / 72 * 2 * Math.PI, major = k % 6 === 0, r1 = 260.5, r0 = 262 - (major ? 11 : 6);
      back += line(PRJ(Math.cos(a) * r0, Math.sin(a) * r0, 14), PRJ(Math.cos(a) * r1, Math.sin(a) * r1, 14), major ? INK : FAINT, major ? 0.6 : 0.45);
    }
    // radial scale in rₛ on the plate
    for(let r = 1; r <= 6; r++) back += `<path d="${pathOf(arc(0, 0, 14, r * B_RS, 0, 2 * Math.PI, 96), false)}" fill="none" stroke="${FAINT}" stroke-opacity="${r % 3 ? 0.45 : 0.9}" stroke-width="0.4"/>`;
    // central hub with bearing
    const hub = cylinder(0, 0, 14, 30, 22, TONES.mid) + cylinder(0, 0, 30, 36, 13, TONES.hi);
    // strip-chart recorder: housing, paper bed, rollers
    let rec = box(REC.x0, REC.y0, REC.x1, REC.y1, 0, REC.z, TONES.mid);
    rec += box(REC.x0 + 10, REC.y0 + 14, REC.x1 - 10, REC.y1 - 14, REC.z, REC.z + 0.6, { top: '#30343c', l: '#2a2d34', r: '#24272d' });
    for(const x of [REC.x0 + 4, REC.x1 - 14]) rec += box(x, REC.y0 + 8, x + 10, REC.y1 - 8, REC.z, REC.z + 9, TONES.hi);
    for(let i = 0; i <= 8; i++){ const y = REC.y0 + 14 + i * (REC.y1 - REC.y0 - 28) / 8; rec += line(PRJ(REC.x0 + 14, y, REC.z + 0.6), PRJ(REC.x1 - 14, y, REC.z + 0.6), FAINT, i === 4 ? 0.7 : 0.35); }
    for(const [x, y] of [[REC.x0 + 6, REC.y0 + 4], [REC.x1 - 6, REC.y0 + 4]]) rec += screw(x, y, REC.z, 1.6);
    // crank: base disc and shaft (arm and handle are live)
    const crank = cylinder(CRANK.x, CRANK.y, 0, 6, 24, TONES.mid) + cylinder(CRANK.x, CRANK.y, 6, 34, 5, TONES.hi);
    return { layers: [back, '@wavesBack', hub, '@wavesFront', rec, '@pen', crank, '@crank', '@orrery'] };
  },
  live(){
    const E = EH(), t = E.time, st = E.binaryAt(t);
    const L = {};
    /* wave crests: φ = ψ − Ω r − mπ, amplitude (aΩ)²/r, fading after the merger */
    let wb = '', wf = '';
    const amp0 = st.merged ? 0.5 : (st.a * st.Om) ** 2;
    for(let arm = 0; arm < 2; arm++){
      const pts = [], al = [], front = [];
      for(let r = Math.max(st.a * 0.6, 1.2); r <= 6.4; r += 0.03){
        const ph = st.psi - st.Om * r - arm * Math.PI;
        const x = Math.cos(ph) * r * B_RS, y = Math.sin(ph) * r * B_RS;
        pts.push(PRJ(x, y, 14.2)); front.push(isFront(ph));
        let a = Math.min(1, Math.sqrt(amp0 / 0.2)) * Math.min(1, 2.4 / r + 0.35) * (1 - Math.max(0, (r - 5.6) / 0.8));
        if(st.merged) a *= Math.exp(-Math.max(0, st.since - r) / 5);
        al.push(Math.max(0, a) * 0.9);
      }
      wb += fadedPolyline(pts, al.map((a, i) => front[i] ? 0 : a), 'var(--an-cyan)', 1.5);
      wf += fadedPolyline(pts, al.map((a, i) => front[i] ? a : 0), 'var(--an-cyan)', 1.5);
    }
    L.wavesBack = wb; L.wavesFront = wf;

    /* the orrery: telescoping beam and the two holes, or the merged remnant */
    let orr = '';
    if(!st.merged){
      const c = Math.cos(st.psi), s = Math.sin(st.psi), M = 0.5;
      const d1 = (st.m2 / M) * st.a * B_RS, d2 = (st.m1 / M) * st.a * B_RS;
      orr += rotBox(-c * d1 / 2 + c * d2 / 2, -s * d1 / 2 + s * d2 / 2, st.psi, (d1 + d2) / 2 + 6, 4, 38, 44, TONES.mid);
      orr += cylinder(0, 0, 36, 46, 7, TONES.hi);
      const balls = [[-c * d1, -s * d1, 2 * st.m1], [c * d2, s * d2, 2 * st.m2]]
        .sort((p, q) => depthOf(p[0], p[1], 0) - depthOf(q[0], q[1], 0));
      for(const [x, y, rs] of balls){
        const R = rs * B_RS;
        orr += cylinder(x, y, 44, 52, 4, TONES.hi);
        orr += sphere(x, y, 52 + R * SPHERE_K, R, '#2c313a', '#020203', 'var(--an-ink-hi)');
      }
    } else {
      const R = 0.95 * B_RS;
      orr += cylinder(0, 0, 36, 46, 7, TONES.hi);
      orr += sphere(0, 0, 46 + R * SPHERE_K, R, '#2c313a', '#020203', 'var(--an-ink-hi)');
    }
    L.orrery = orr;

    /* chart: h(t') = (aΩ)² cos 2ψ over the last 60 rₛ/c, pen at "now" */
    const W = 60, N = 260, x0 = REC.x0 + 16, x1 = REC.x1 - 18, yc = (REC.y0 + REC.y1) / 2, ha = (REC.y1 - REC.y0) / 2 - 18;
    const trace = [];
    let hNow = 0;
    for(let i = 0; i <= N; i++){
      const ti = t - W + W * i / N, si = E.binaryAt(ti);
      const A = si.merged ? 0.5 * Math.exp(-si.since / 2.5) : (si.a * si.Om) ** 2;
      const h = Math.min(1, A / 0.5) * Math.cos(2 * si.psi);
      if(i === N) hNow = h;
      trace.push(PRJ(x0 + (x1 - x0) * i / N, yc + h * ha, REC.z + 0.8));
    }
    let pen = `<path d="${pathOf(trace, false)}" fill="none" stroke="var(--an-cyan)" stroke-width="0.9"/>`;
    const tip = PRJ(x1, yc + hNow * ha, REC.z + 1);
    pen += rotBox(x1 + 4, (REC.y1 - 4 + yc + hNow * ha) / 2, Math.PI / 2, (REC.y1 - 4 - (yc + hNow * ha)) / 2, 2, REC.z + 3, REC.z + 6, TONES.hi);
    pen += `<circle cx="${f1(tip[0])}" cy="${f1(tip[1])}" r="7" fill="url(#beadGlow)"/><circle cx="${f1(tip[0])}" cy="${f1(tip[1])}" r="2.6" fill="var(--an-lit)" stroke="var(--an-lit)"/>`;
    L.pen = pen;

    /* crank arm turns with time */
    const ca = t * 0.12;
    L.crank = rotBox(CRANK.x + Math.cos(ca) * 17, CRANK.y + Math.sin(ca) * 17, ca, 19, 4, 34, 39, TONES.mid) +
              cylinder(CRANK.x + Math.cos(ca) * 34, CRANK.y + Math.sin(ca) * 34, 39, 58, 4.5, TONES.hi, { knurl: 0.35 });

    const U = E.units();
    this.readout = st.merged
      ? `MERGED ${st.since.toFixed(1)} rₛ/c AGO · REMNANT 0.95 M · a/M ≈ 0.69`
      : `a ${st.a.toFixed(2)} rₛ · f ${U.fmtSci(st.Om / Math.PI / U.tUnit)} Hz · MERGER IN ${(st.tMerge - st.t).toFixed(1)} rₛ/c · 𝓜 ${U.fmtSci(U.m * Math.pow(st.q / ((1 + st.q) ** 2), 0.6))} M☉`;
    this.caption = st.merged
      ? `The two holes have merged into one that has lost about 5% of the mass to gravitational waves and spins at a/M ≈ 0.69. Its ringdown fades within a few rₛ/c, and the last wave crests keep moving outward at the speed of light; on the chart, the chirp has ended.`
      : `Separation ${st.a.toFixed(2)} rₛ, orbital period ${(2 * Math.PI / st.Om).toFixed(1)} rₛ/c. The waves have twice the orbital frequency, ${U.fmtSci(st.Om / Math.PI / U.tUnit)} Hz for this mass. As the orbit shrinks (da/dt ∝ −1/a³) the beam shortens, spins faster and the chart's trace rises in pitch and height: the chirp.`;
    return L;
  },
  dragStart(){ const E = EH(); E.set({ playing: false }); return E.time; },
  drag(t0, dx){ EH().time = t0 + dx * 0.6; },
  arrow(d){ const E = EH(); E.set({ playing: false }); E.time = E.time + d * 4; },
};

/* ================================================================== */
/* Fig. 3 · Relativistic jets: the hole in a test stand                */
/* ================================================================== */
const J = { zh: 168, post: 252, ztop: 334, ztopBar: 346 };
const GAUGES3 = [{ x: -262, y: 236, z: 96, r: 30, label: 'γ' }, { x: 236, y: -262, z: 96, r: 30, label: 'P' }];
const jetWidth = s => 7 + 0.1 * s;                  // collar radius at distance s from the hole
const fig3 = {
  id: 'jets', n: 3, title: 'ANATOMY OF A RELATIVISTIC JET', hint: 'DRAG SIDEWAYS TO SET THE LORENTZ FACTOR · ← →',
  legend: `<span><i class="k-lit"></i>APPROACHING JET · DOPPLER-BOOSTED</span><span><i class="k-dim"></i>RECEDING JET · DIMMED</span>
           <span><i class="k-cyan"></i>MAGNETIC FIELD · WOUND UP BY THE SPIN</span><span><i class="k-ring"></i>DISK ON BRACKETS</span>`,
  key(){ const P = EH().params; return 'jets|' + P.spinA.toFixed(3) + '|' + P.spin; },
  build(){
    const P = EH().params, m = modelAt(P.spinA, P.spin);
    this.m = m;
    const rH = m.rPlus * RS, rIn = Math.max(m.isco * RS, rH * SPHERE_K + 6), rOut = 152;
    let back = baseKit() + labelPlate(250, -150);
    // lower bearing block on the base
    back += cylinder(0, 0, 0, 10, 24, TONES.mid);
    // posts on the axes (a diamond seen from here), so none hides the jet axis
    const R = J.post, postsAt = [[-R, 0], [0, -R], [R, 0], [0, R]];
    const postSvg = ([x, y]) => box(x - 8, y - 8, x + 8, y + 8, 0, J.ztop, TONES.mid) + cylinder(x, y, 0, 5, 14, TONES.lo, { top: false });
    const bar = (a, b) => rotBox((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.atan2(b[1] - a[1], b[0] - a[0]), Math.hypot(b[0] - a[0], b[1] - a[1]) / 2 + 8, 7, J.ztop, J.ztopBar, TONES.mid);
    const bracket = a => rotBox(Math.cos(a) * (R + 152) / 2, Math.sin(a) * (R + 152) / 2, a, (R - 152) / 2, 5, J.zh - 3, J.zh + 3, TONES.hi);
    back += postSvg(postsAt[0]) + postSvg(postsAt[1]) + bracket(Math.PI) + bracket(-Math.PI / 2);
    // disk: back half, horizon, front half
    const zd0 = J.zh - 3, zd1 = J.zh + 3;
    const diskTop = mixHex(TONES.mid.top, '#6a4a2c', 0.55);
    let diskBack = wall(0, 0, zd0, zd1, rIn, FRONT1, FRONT1 + Math.PI, TONES.lo.r) + annulus(0, 0, zd1, rIn, rOut, FRONT1, FRONT1 + Math.PI, diskTop);
    for(let k = 0; k < 12; k++){ const a = k / 12 * 2 * Math.PI; if(!isFront(a)) diskBack += screw(Math.cos(a) * (rOut - 8), Math.sin(a) * (rOut - 8), zd1, 1.5); }
    const sph = sphere(0, 0, J.zh, rH, '#2c313a', '#020203', 'var(--an-ink-hi)');
    let diskFront = wall(0, 0, zd0, zd1, rOut, FRONT0, FRONT1, sideGradient(TONES.mid, PRJ(-rOut * 0.707, rOut * 0.707, 0)[0], PRJ(rOut * 0.707, -rOut * 0.707, 0)[0])) +
                    annulus(0, 0, zd1, rIn, rOut, FRONT0, FRONT1, diskTop);
    for(let k = 0; k < 12; k++){ const a = k / 12 * 2 * Math.PI; if(isFront(a)) diskFront += screw(Math.cos(a) * (rOut - 8), Math.sin(a) * (rOut - 8), zd1, 1.5); }
    const sideBrackets = bracket(0) + bracket(Math.PI / 2);
    const frontBracket = '';
    // top frame: the two back bars first, the front ones and the front posts last
    let top = bar(postsAt[0], postsAt[1]);
    // open at the front, like a test stand facing its camera, so no bar crosses the jet
    let topFront = postSvg(postsAt[2]) + postSvg(postsAt[3]) + bar(postsAt[1], postsAt[2]) + bar(postsAt[0], postsAt[3]);
    for(const [x, y] of postsAt) topFront += screw(x, y, J.ztopBar, 2);
    let gauges = '';
    for(const G of GAUGES3) gauges += gaugeAt(G);
    this.rH = rH;
    return { layers: [back, sideBrackets.slice(0, 0), '@jetDown', diskBack, sph, '@ergo', diskFront, sideBrackets, frontBracket, '@jetUp', top, '@topJet', topFront, gauges, '@needles'] };
  },
  live(){
    const E = EH(), P = E.params, m = this.m;
    this.clock = (this.clock || 0);
    const g = P.jetGamma, beta = Math.sqrt(1 - 1 / (g * g));
    // this drawing's own camera looks along (1,1,1): the jet along +z leans toward it, −z away
    const cosv = 1 / Math.sqrt(3);
    const Dup = 1 / (g * (1 - beta * cosv)), Ddn = 1 / (g * (1 + beta * cosv));
    const power = P.jetOn ? P.spinA ** 2 : 0;
    const bright = D => Math.min(1, power / 0.36 * 0.45 * D ** 3);
    const L = {};
    const t = this.t;
    const jet = (dir) => {
      const D = dir > 0 ? Dup : Ddn, b = bright(D);
      const start = this.rH * SPHERE_K + 6, len = dir > 0 ? J.ztop - J.zh - start - 4 : J.zh - start - 14;
      let back = '', core = '', front = '';
      // glass guide rod
      const zA = J.zh + dir * start, zB = J.zh + dir * (start + len);
      core += cylinder(0, 0, Math.min(zA, zB), Math.max(zA, zB), 2.6, TONES.hi, { top: dir > 0 });
      // collars stream outward at βc (scaled), spaced evenly, born at the base and fading at the end
      const n = 7, speed = beta * 26, base = (t * speed) % (len / n);
      const collars = [];
      for(let k = 0; k < n; k++){
        const s = base + k * len / n;
        const w = jetWidth(s), fade = Math.min(1, s / 20) * Math.min(1, (len - s) / 40);
        collars.push({ s, w, fade });
      }
      // draw from the far end of the jet toward the viewer
      collars.sort((p, q) => dir > 0 ? p.s - q.s : q.s - p.s);
      for(const c of collars){
        const z = J.zh + dir * (start + c.s);
        const glow = b * c.fade;
        const col = dir > 0 ? mixHex('#2a3a4a', '#eaf4ff', Math.min(1, glow * 1.6)) : mixHex('#241b26', '#c27ab8', Math.min(1, glow * 2.2));
        core += cylinder(0, 0, z - 2.5, z + 2.5, c.w, { top: col, l: mixHex(col, '#000000', 0.25), r: mixHex(col, '#000000', 0.5) });
      }
      // field coil: a helix around the jet, turning with the hole's spin
      const R = s => jetWidth(s) + 9, pitch = 28, spinRate = 0.6 + 3 * P.spinA;
      let prev = null;
      for(let s = 0; s <= len; s += 1.2){
        const a = 2 * Math.PI * s / pitch * dir + t * spinRate;
        const z = J.zh + dir * (start + s), r = R(s);
        const p = PRJ(Math.cos(a) * r, Math.sin(a) * r, z);
        if(prev){
          const seg = `<path d="M${f1(prev[0])} ${f1(prev[1])}L${f1(p[0])} ${f1(p[1])}" stroke="var(--an-cyan)" stroke-opacity="${(0.25 + 0.55 * power / 0.36 > 0.8 ? 0.8 : 0.25 + 0.55 * power / 0.36).toFixed(2)}" stroke-width="0.9"/>`;
          if(isFront(a)) front += seg; else back += seg;
        }
        prev = p;
      }
      return back + core + front;
    };
    L.jetDown = jet(-1);
    L.jetUp = jet(1);
    L.ergo = cylinder(0, 0, J.zh + this.rH * SPHERE_K * 0.97 - 2, J.zh + this.rH * SPHERE_K * 0.97 + 3, 6.5, TONES.mid);
    L.topJet = '';
    L.needles = gaugeNeedle(GAUGES3[0], (g - 1) / 9) + gaugeNeedle(GAUGES3[1], power);
    const ratio = (Dup / Ddn) ** 3;
    this.readout = `γ ${g.toFixed(2)} · β ${beta.toFixed(3)} · D↑ ${Dup.toFixed(2)} · D↓ ${Ddn.toFixed(2)} · ${ratio >= 100 ? ratio.toFixed(0) : ratio.toFixed(1)}× BRIGHTER`;
    const cone = Math.asin(1 / g) * 180 / Math.PI;
    this.caption = power <= 0
      ? `With ${P.jetOn ? 'no spin' : 'jets switched off'} there is nothing to power the jets: they draw on the hole's rotation (Blandford–Znajek, P ∝ a²).`
      : `Plasma leaves along the spin axis at ${beta.toFixed(3)}c. This drawing looks at the jets from 54.7° off their axis. ` +
        (Dup >= 1
          ? `The jet leaning toward you is boosted by D = ${Dup.toFixed(2)} and the other dimmed to ${Ddn.toFixed(2)}, so it looks ${ratio >= 100 ? ratio.toFixed(0) : ratio.toFixed(1)}× brighter (∝ D³). `
          : `At this speed the beaming cone is only about ${cone.toFixed(0)}° wide, so even the jet leaning toward you is dimmed (D = ${Dup.toFixed(2)}); it is still ${ratio >= 100 ? ratio.toFixed(0) : ratio.toFixed(1)}× brighter than the other (∝ D³). `) +
        `The magnetic field threading the hole is wound into a helix by its spin, which is what launches the flow; power scales as a², here ${power.toFixed(2)} of maximum.`;
    return L;
  },
  dragStart(){ return EH().params.jetGamma; },
  drag(g0, dx){ EH().set({ jetGamma: Math.round(Math.min(10, Math.max(1.05, g0 + dx / 60)) * 100) / 100 }); },
  arrow(d){ const P = EH().params; EH().set({ jetGamma: Math.round(Math.min(10, Math.max(1.05, P.jetGamma + d * 0.25)) * 100) / 100 }); },
};

/* ================================================================== */
/* Fig. 4 · Wormhole: the embedding diagram as a glass funnel           */
/* ================================================================== */
/* Ellis wormhole embedded as a surface of revolution: r(ℓ) = √(b₀² + ℓ²),
   z(ℓ) = b₀ asinh(ℓ/b₀); the meridian's arc length is exactly ℓ. The upper
   plate is our universe, the lower one the other. */
const W4 = { b0: 46, lmax: 4, zc: 150, rPlate: 236 };
const fig4 = {
  id: 'wormhole', n: 4, title: 'ANATOMY OF A WORMHOLE', hint: 'DRAG SIDEWAYS TO MOVE THE TRAVELLER THROUGH THE THROAT · ← →',
  legend: `<span><i class="k-lit"></i>TRAVELLER · AT THE CAMERA'S ℓ</span><span><i class="k-glass"></i>THROAT · EXACT ELLIS EMBEDDING</span>
           <span><i class="k-stars"></i>UPPER PLATE · OUR UNIVERSE</span><span><i class="k-violet"></i>LOWER PLATE · THE OTHER UNIVERSE</span>`,
  key(){ return 'worm'; },
  geom(){
    if(this.mesh) return this.mesh;
    const b0 = W4.b0, Lm = W4.lmax * b0, items = [];
    const zOf = l => W4.zc + b0 * Math.asinh(l / b0), rOf = l => Math.sqrt(b0 * b0 + l * l);
    const zTop = zOf(Lm), zBot = zOf(-Lm), rRim = rOf(Lm);
    const V = [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)], Ld = norm([-0.35, 0.55, 0.76]);
    const shade = (n, lo, hi) => { const d = Math.max(0, dot3(n, Ld)); return mixHex(lo, hi, 0.25 + 0.75 * d); };
    const quad = (P4, n, fillOut, fillIn, edges) => {
      const facing = dot3(n, V) > 0;
      const nn = facing ? n : n.map(v => -v);
      const fill = facing ? shade(nn, fillOut[0], fillOut[1]) : shade(nn, fillIn[0], fillIn[1]);
      const pts = P4.map(p => PRJ(p[0], p[1], p[2]));
      let s = `<path d="${pathOf(pts)}" fill="${fill}" stroke="${fill}" stroke-width="0.5"/>`;
      for(const [i, j, c, w] of edges || []) s += line(pts[i], pts[j], c, w);
      const cx = P4.reduce((a, p) => a + p[0], 0) / 4, cy = P4.reduce((a, p) => a + p[1], 0) / 4, cz = P4.reduce((a, p) => a + p[2], 0) / 4;
      items.push({ d: depthOf(cx, cy, cz), s });
    };
    const NL = 30, NP = 56;
    const lAt = i => -Lm + 2 * Lm * i / NL, pAt = j => j / NP * 2 * Math.PI;
    for(let i = 0; i < NL; i++) for(let j = 0; j < NP; j++){
      const l0 = lAt(i), l1 = lAt(i + 1), p0 = pAt(j), p1 = pAt(j + 1);
      const pt = (l, p) => [rOf(l) * Math.cos(p), rOf(l) * Math.sin(p), zOf(l)];
      const lm = (l0 + l1) / 2, pm = (p0 + p1) / 2, rm = rOf(lm);
      const n = norm([b0 * Math.cos(pm) / rm, b0 * Math.sin(pm) / rm, -lm / rm]);
      const edges = [];
      if(j % 7 === 0) edges.push([0, 1, 'rgba(233,230,223,.22)', 0.5]);                 // meridian
      if(i % 5 === 0 || i === NL / 2) edges.push([0, 3, i === NL / 2 ? 'rgba(127,216,255,.55)' : 'rgba(233,230,223,.18)', i === NL / 2 ? 0.9 : 0.5]);  // latitude; the throat in cyan
      quad([pt(l0, p0), pt(l1, p0), pt(l1, p1), pt(l0, p1)], n, ['#2c323d', '#7d8798'], ['#0d0f13', '#262b34'], edges);
    }
    // the two plates (top faces), in rings of sectors
    const plate = (z, r0, r1, cols, rim) => {
      const NR = 3;
      for(let k = 0; k < NR; k++) for(let j = 0; j < NP; j++){
        const ra = r0 + (r1 - r0) * k / NR, rb = r0 + (r1 - r0) * (k + 1) / NR, p0 = pAt(j), p1 = pAt(j + 1);
        const P4 = [[ra * Math.cos(p0), ra * Math.sin(p0), z], [rb * Math.cos(p0), rb * Math.sin(p0), z], [rb * Math.cos(p1), rb * Math.sin(p1), z], [ra * Math.cos(p1), ra * Math.sin(p1), z]];
        const edges = [];
        if(k === NR - 1) edges.push([1, 2, INK, 0.6]);
        if(k === 0) edges.push([0, 3, INK, 0.5]);
        quad(P4, [0, 0, 1], cols, cols, edges);
      }
      // rim (front half), as quads so it sorts with everything else
      for(let j = 0; j < NP; j++){
        const p0 = pAt(j), p1 = pAt(j + 1);
        if(!isFront((p0 + p1) / 2)) continue;
        const P4 = [[r1 * Math.cos(p0), r1 * Math.sin(p0), z], [r1 * Math.cos(p1), r1 * Math.sin(p1), z], [r1 * Math.cos(p1), r1 * Math.sin(p1), z - 7], [r1 * Math.cos(p0), r1 * Math.sin(p0), z - 7]];
        quad(P4, [Math.cos((p0 + p1) / 2), Math.sin((p0 + p1) / 2), 0], rim, rim, [[2, 3, INK, 0.5]]);
      }
    };
    plate(zTop, rRim, W4.rPlate, ['#1e2129', '#30353f'], ['#15171c', '#22252c']);
    plate(zBot, rRim, W4.rPlate, ['#1d1a26', '#2e2a3b'], ['#141219', '#221e2b']);
    // engraved skies: dots for our stars above, violet swirls below
    const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
    for(let k = 0; k < 70; k++){
      const r = rRim + 10 + hash(k) * (W4.rPlate - rRim - 18), p = hash(k + 99) * 2 * Math.PI;
      const q = PRJ(r * Math.cos(p), r * Math.sin(p), zTop + 0.3), big = hash(k + 7) > 0.85;
      items.push({ d: depthOf(r * Math.cos(p), r * Math.sin(p), zTop) + 0.5, s: `<circle cx="${f1(q[0])}" cy="${f1(q[1])}" r="${big ? 1.6 : 0.9}" fill="rgba(240,236,228,${big ? 0.9 : 0.55})"/>` });
    }
    for(let k = 0; k < 16; k++){
      const r = rRim + 16 + hash(k + 300) * (W4.rPlate - rRim - 30), p = hash(k + 500) * 2 * Math.PI, rr = 5 + hash(k + 700) * 7;
      const cx = r * Math.cos(p), cy = r * Math.sin(p);
      items.push({ d: depthOf(cx, cy, zBot) + 0.5, s: `<path d="${pathOf(arc(cx, cy, zBot + 0.3, rr, 0, 2 * Math.PI, 28), false)}" fill="none" stroke="#b07ad8" stroke-opacity=".55" stroke-width="0.7"/>` +
                                                    `<path d="${pathOf(arc(cx, cy, zBot + 0.3, rr * 0.5, 0, 2 * Math.PI, 20), false)}" fill="none" stroke="#5fc4d2" stroke-opacity=".4" stroke-width="0.6"/>` });
    }
    // four columns joining the plates, and legs under the lower one
    for(const a of [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4]){
      const x = Math.cos(a) * (W4.rPlate - 16), y = Math.sin(a) * (W4.rPlate - 16);
      items.push({ d: depthOf(x, y, (zTop + zBot) / 2), s: cylinder(x, y, zBot, zTop - 7, 5, TONES.hi, { top: false }) });
    }
    let legs = '';
    for(const a of [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4]){
      const x = Math.cos(a) * (W4.rPlate - 30), y = Math.sin(a) * (W4.rPlate - 30);
      legs += cylinder(x, y, 0, 6, 15, TONES.lo) + cylinder(x, y, 6, zBot - 7, 6, TONES.mid, { top: false });
    }
    items.sort((p, q) => p.d - q.d);
    this.mesh = { items, zOf, rOf, legs, Lm };
    return this.mesh;
  },
  build(){
    const g = this.geom();
    return { layers: [baseKit() + labelPlate(258, -300) + g.legs, '@mesh'] };
  },
  live(){
    const E = EH(), P = E.params, g = this.geom();
    const Lrs = E.wormholeL(), scale = W4.b0 / P.wormB0;                  // world units per rₛ here
    const lw = Math.max(-g.Lm, Math.min(g.Lm, Lrs * scale));
    /* from this angle the upper funnel shows its inside (through the opening) and the lower one its outside
       (between the plates), so the traveller rides the inner back meridian in our universe and the outer
       front meridian in the other; the two meet at the throat */
    const inner = lw >= 0;
    const ph = inner ? Math.PI / 4 + Math.PI - 0.3 : Math.PI / 4 + 0.25;
    const r = g.rOf(lw), z = g.zOf(lw), lift = 7 * (inner ? -1 : 1);
    const nx = W4.b0 / r, nz = -lw / r;                                    // outward normal (radial, vertical)
    const bx = (r + lift * nx) * Math.cos(ph), by = (r + lift * nx) * Math.sin(ph), bz = z + lift * nz;
    const bp = PRJ(bx, by, bz);
    const bead = { d: depthOf(bx, by, bz) + 10, s: `<circle cx="${f1(bp[0])}" cy="${f1(bp[1])}" r="15" fill="url(#beadGlow)"/>` + sphere(bx, by, bz, 6, '#ffffff', '#c9c1b2', 'var(--an-lit)') };
    let s = '', placed = false;
    for(const it of g.items){ if(!placed && it.d > bead.d){ s += bead.s; placed = true; } s += it.s; }
    if(!placed) s += bead.s;
    const side = Lrs >= 0 ? 'OUR UNIVERSE (A)' : 'THE OTHER UNIVERSE (B)';
    const rr = Math.sqrt(P.wormB0 ** 2 + Lrs ** 2);
    this.readout = `b₀ ${P.wormB0.toFixed(2)} rₛ · ℓ ${Lrs >= 0 ? '+' : '−'}${Math.abs(Lrs).toFixed(2)} rₛ · r(ℓ) ${rr.toFixed(2)} rₛ · ${side}`;
    this.caption = `The funnel is the wormhole's exact embedding: going along the glass from the upper plate to the lower, the distance you cover is ℓ, while the circles around the funnel have radius √(b₀² + ℓ²). ` +
      `They shrink to the throat, ${P.wormB0.toFixed(2)} rₛ, and widen again into the other universe. The traveller is where the simulation's camera is, ${Math.abs(Lrs).toFixed(2)} rₛ from the throat in ${Lrs >= 0 ? 'ours' : 'the other one'}. ` +
      `Holding a throat like this open would take matter with negative energy.`;
    return { mesh: s };
  },
  dragStart(){ return EH().wormholeL(); },
  drag(L0, dx){ EH().wormhole(Math.max(-14, Math.min(14, L0 + dx / 40))); },
  arrow(d){ EH().wormhole(Math.max(-14, Math.min(14, EH().wormholeL() + d * 0.4))); },
};

/* ================================================================== */
/* Fig. 1 wrapped in the same interface                                */
/* ================================================================== */
const fig1 = {
  id: 'spin', n: 1, title: 'ANATOMY OF A SPINNING BLACK HOLE', hint: 'DRAG SIDEWAYS TO SET THE SPIN · ← →',
  legend: `<span><i class="k-lit"></i>GAS ON THE ISCO</span><span><i class="k-ring"></i>DISK RINGS · EACH AT ITS OWN ORBITAL SPEED</span>
           <span><i class="k-cyan"></i>PHOTON ORBITS · WITH / AGAINST THE SPIN</span><span><i class="k-well"></i>ERGOSPHERE · 1 rₛ AT THE EQUATOR</span>
           <span><i class="k-vane"></i>FRAME DRAGGING (VANE ×8)</span>`,
  key(){ const P = EH().params; return 'spin|' + P.spinA.toFixed(4) + '|' + P.spin; },
  build(){
    const P = EH().params;
    this.model = modelAt(P.spinA, P.spin);
    this.rings = ringsOf(this.model);
    const S = buildStatic(this.model);
    return { layers: [S.back, '@back', S.sphere, S.front, '@front', '@slide', S.top, '@top', '@needle'] };
  },
  live(){
    const m = this.model;
    this.readout = `a/M ${m.spinA.toFixed(3)} · r₊ ${m.rPlus.toFixed(3)} · ISCO ${m.isco.toFixed(3)} rₛ · v ${m.vIsco.toFixed(2)}c`;
    this.caption =
      `At a/M ${m.spinA.toFixed(3)} the horizon sits at ${m.rPlus.toFixed(2)} rₛ and gas can orbit stably down to ${m.isco.toFixed(2)} rₛ, moving at ${m.vIsco.toFixed(2)}c. ` +
      (m.spinA > 0.005
        ? `Light can circle the hole at ${m.phPro.toFixed(2)} rₛ going with the spin and ${m.phRetro.toFixed(2)} rₛ against it. Inner rings turn faster than outer ones (Ω ≈ r⁻³ᐟ²), and inside the ergosphere nothing can stand still against the spin.`
        : `Light can circle the hole at 1.50 rₛ. Inner rings turn faster than outer ones (Ω ∝ r⁻³ᐟ²). Without spin there is no ergosphere: its edge, 1 rₛ, is the horizon itself, and the vane stands still.`);
    return buildLive(m, this.t, this.rings);
  },
  dragStart(){ return EH().params.spinA; },
  drag(v0, dx){ setSpin(v0 + dx / 420); },
  arrow(d){ setSpin(EH().params.spinA + d * 0.02); },
};
function setSpin(v){ EH().set({ spinA: Math.round(Math.min(0.998, Math.max(0, v)) * 1000) / 1000 }); }
const FIGS = [fig1, fig2, fig3, fig4];

/* ------------------------------------------------------------------ */
/* Card, tabs, interaction, loop                                       */
/* ------------------------------------------------------------------ */
const root = document.createElement('div');
root.id = 'anatomy';
root.hidden = true;
root.innerHTML = `
  <div class="an-card" role="figure">
    <div class="an-head">
      <span class="an-tabs">${FIGS.map(f => `<button data-fig="${f.n}">FIG. ${f.n}<span class="tab-name"> · ${{ 1: 'SPIN', 2: 'BINARY', 3: 'JETS', 4: 'WORMHOLE' }[f.n]}</span></button>`).join('')}</span>
      <span class="an-title"></span>
      <button class="text-btn an-3d" title="Full-screen 3D model">3D</button>
      <button class="an-close" title="Close (A or Esc)">×</button>
    </div>
    <svg class="an-svg" tabindex="0"></svg>
    <div class="an-foot"><span class="an-hint"></span><span class="an-readout"></span></div>
  </div>
  <div class="an-legend"></div>
  <p class="an-caption"></p>`;
document.body.appendChild(root);
const svg = root.querySelector('.an-svg');

let fig = fig1, builtFor = '', slots = {}, clock = 0, last = performance.now(), raf = 0, uiTick = 0;
const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

function viewBoxOf(){
  const pts = [];
  for(const x of [-BASE, BASE]) for(const y of [-BASE, BASE]) for(const z of [-38, 0]) pts.push(PRJ(x, y, z));
  for(const x of [-POST_X - 12, POST_X + 12]) pts.push(PRJ(x, 0, Z_BRIDGE + 47));
  pts.push(PRJ(0, 0, J.ztopBar + 20), PRJ(-J.post, -J.post, J.ztopBar + 10));
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), pad = 24;
  const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad;
  return `${f1(x0)} ${f1(y0)} ${f1(Math.max(...xs) - x0 + pad)} ${f1(Math.max(...ys) - y0 + pad)}`;
}

function rebuild(){
  const key = fig.id + '|' + fig.key();
  if(key === builtFor) return;
  builtFor = key;
  defs = []; gid = 0;
  const S = fig.build();
  defs.push(`<radialGradient id="beadGlow"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`);
  svg.setAttribute('viewBox', viewBoxOf());
  svg.innerHTML = `<defs>${defs.join('')}</defs><defs class="l-defs"></defs>` +
    S.layers.map(l => l.startsWith && l.startsWith('@') ? `<g data-slot="${l.slice(1)}"></g>` : `<g>${l}</g>`).join('');
  slots = { defs: svg.querySelector('.l-defs') };
  svg.querySelectorAll('[data-slot]').forEach(g => { slots[g.dataset.slot] = g; });
  root.querySelector('.an-title').textContent = fig.title;
  root.querySelector('.an-hint').textContent = fig.hint;
  root.querySelector('.an-legend').innerHTML = fig.legend;
  root.querySelectorAll('.an-tabs button').forEach(b => b.classList.toggle('on', +b.dataset.fig === fig.n));
  svg.setAttribute('aria-label', fig.title.toLowerCase());
}

function frame(now){
  raf = requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if(!reduce) clock += dt * 5;
  rebuild();
  defs = []; gid = 100000;                       // moving parts get their own gradient ids
  fig.t = clock;
  const L = fig.live();
  slots.defs.innerHTML = defs.join('');
  for(const k in L) if(slots[k]) slots[k].innerHTML = L[k];
  if((uiTick -= dt) <= 0){
    uiTick = 0.1;
    root.querySelector('.an-readout').textContent = fig.readout || '';
    root.querySelector('.an-caption').textContent = fig.caption || '';
  }
}

function showFig(n){ fig = FIGS[n - 1] || fig1; builtFor = ''; }
root.querySelectorAll('.an-tabs button').forEach(b => b.onclick = () => showFig(+b.dataset.fig));

let drag = null;
svg.addEventListener('pointerdown', e => { drag = { x: e.clientX, v: fig.dragStart() }; svg.setPointerCapture(e.pointerId); svg.classList.add('dragging'); });
svg.addEventListener('pointermove', e => { if(drag) fig.drag(drag.v, e.clientX - drag.x); });
const endDrag = () => { drag = null; svg.classList.remove('dragging'); };
svg.addEventListener('pointerup', endDrag);
svg.addEventListener('pointercancel', endDrag);

/* the plates (2D isometric drawings); open() prefers the 3D view when it has loaded */
function openPlate(n){
  const sc = EH().params.scene;
  showFig(n || (sc === 'binary' ? 2 : sc === 'wormhole' ? 4 : 1));
  root.hidden = false;
  document.body.classList.add('anatomy-open');
  EH().pauseRender(true);
  last = performance.now();
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(frame);
  svg.focus({ preventScroll: true });
  $('#btnAnatomy') && $('#btnAnatomy').classList.add('on');
}
function close(){
  root.hidden = true;
  document.body.classList.remove('anatomy-open');
  EH().pauseRender(false);
  cancelAnimationFrame(raf);
  $('#btnAnatomy') && $('#btnAnatomy').classList.remove('on');
}
function open(n){
  if(window.Anatomy3D){ window.Anatomy3D.open(n); return; }
  openPlate(n);
}
const toggle = () => {
  if(window.Anatomy3D && window.Anatomy3D.isOpen()) window.Anatomy3D.close();
  else if(!root.hidden) close();
  else open();
};
root.querySelector('.an-3d').onclick = () => { const n = fig.n; close(); if(window.Anatomy3D) window.Anatomy3D.open(n); };
root.querySelector('.an-close').onclick = close;
if($('#btnAnatomy')) $('#btnAnatomy').onclick = toggle;

addEventListener('keydown', e => {
  if(e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key;
  if(k === 'a' || k === 'A'){ if(document.activeElement && document.activeElement.tagName === 'INPUT') return; toggle(); e.preventDefault(); return; }
  if(root.hidden) return;
  if(k === 'Escape'){ close(); e.preventDefault(); }
  else if(k >= '1' && k <= '4'){ showFig(+k); e.preventDefault(); }
  else if(k === 'ArrowLeft' || k === 'ArrowRight'){ fig.arrow(k === 'ArrowRight' ? 1 : -1); e.preventDefault(); }
});

window.EventHorizonAnatomy = { open, openPlate, close, toggle, show: showFig };
})();
