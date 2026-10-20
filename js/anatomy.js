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
/* Card, interaction, loop                                             */
/* ------------------------------------------------------------------ */
const root = document.createElement('div');
root.id = 'anatomy';
root.hidden = true;
root.innerHTML = `
  <div class="an-card" role="figure" aria-label="Anatomy of a spinning black hole">
    <div class="an-head"><span class="an-fig">FIG. 1</span><span class="an-title">ANATOMY OF A SPINNING BLACK HOLE</span>
      <button class="an-close" title="Close (A or Esc)">×</button></div>
    <svg class="an-svg" tabindex="0" aria-label="Isometric figure: the black hole as a bench instrument"></svg>
    <div class="an-foot"><span class="an-hint">DRAG SIDEWAYS TO SET THE SPIN · ← →</span><span class="an-readout"></span></div>
  </div>
  <div class="an-legend">
    <span><i class="k-lit"></i>GAS ON THE ISCO</span>
    <span><i class="k-ring"></i>DISK RINGS · EACH AT ITS OWN ORBITAL SPEED</span>
    <span><i class="k-cyan"></i>PHOTON ORBITS · WITH / AGAINST THE SPIN</span>
    <span><i class="k-well"></i>ERGOSPHERE · 1 rₛ AT THE EQUATOR</span>
    <span><i class="k-vane"></i>FRAME DRAGGING (VANE ×8)</span>
  </div>
  <p class="an-caption"></p>`;
document.body.appendChild(root);
const svg = root.querySelector('.an-svg');

let model = null, rings = null, statics = null, layers = null, builtFor = '', clock = 0, last = performance.now(), raf = 0;
const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

function viewBoxOf(){
  const pts = [];
  for(const x of [-BASE, BASE]) for(const y of [-BASE, BASE]) for(const z of [-38, 0]) pts.push(PRJ(x, y, z));
  for(const x of [-POST_X - 12, POST_X + 12]) pts.push(PRJ(x, 0, Z_BRIDGE + 47));
  pts.push(PRJ(0, 0, Z_BRIDGE + 47 + 12));
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), pad = 24;
  const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad;
  return `${f1(x0)} ${f1(y0)} ${f1(Math.max(...xs) - x0 + pad)} ${f1(Math.max(...ys) - y0 + pad)}`;
}

function rebuild(){
  const P = EH().params;
  const key = P.spinA.toFixed(4) + '|' + P.spin;
  if(key === builtFor) return;
  builtFor = key;
  model = modelAt(P.spinA, P.spin);
  rings = ringsOf(model);
  statics = buildStatic(model);
  svg.setAttribute('viewBox', viewBoxOf());
  defs.push(`<radialGradient id="beadGlow"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`);
  svg.innerHTML = `<defs>${defs.join('')}</defs><defs class="l-defs"></defs>
    <g>${statics.back}</g><g class="l-back"></g>
    <g>${statics.sphere}</g>
    <g>${statics.front}</g><g class="l-front"></g><g class="l-slide"></g>
    <g>${statics.top}</g><g class="l-top"></g><g class="l-needle"></g>`;
  layers = { defs: svg.querySelector('.l-defs'), back: svg.querySelector('.l-back'), front: svg.querySelector('.l-front'), slide: svg.querySelector('.l-slide'), top: svg.querySelector('.l-top'), needle: svg.querySelector('.l-needle') };
  const m = model;
  root.querySelector('.an-readout').textContent =
    `a/M ${m.spinA.toFixed(3)} · r₊ ${m.rPlus.toFixed(3)} · ISCO ${m.isco.toFixed(3)} rₛ · v ${m.vIsco.toFixed(2)}c`;
  root.querySelector('.an-caption').textContent =
    `At a/M ${m.spinA.toFixed(3)} the horizon sits at ${m.rPlus.toFixed(2)} rₛ and gas can orbit stably down to ${m.isco.toFixed(2)} rₛ, ` +
    `moving at ${m.vIsco.toFixed(2)}c. ` +
    (m.spinA > 0.005
      ? `Light can circle the hole at ${m.phPro.toFixed(2)} rₛ going with the spin and ${m.phRetro.toFixed(2)} rₛ against it. Inner rings turn faster than outer ones (Ω ≈ r⁻³ᐟ²), and inside the ergosphere nothing can stand still against the spin.`
      : `Light can circle the hole at 1.50 rₛ. Inner rings turn faster than outer ones (Ω ∝ r⁻³ᐟ²). Without spin there is no ergosphere: its edge, 1 rₛ, is the horizon itself, and the vane stands still.`);
}

function frame(now){
  raf = requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if(!reduce) clock += dt * 5;
  rebuild();
  defs = []; gid = 100000;                       // moving parts get their own gradient ids
  const L = buildLive(model, clock, rings);
  layers.defs.innerHTML = defs.join('');
  layers.back.innerHTML = L.back;
  layers.front.innerHTML = L.front;
  layers.slide.innerHTML = L.slide;
  layers.top.innerHTML = L.top;
  layers.needle.innerHTML = L.needle;
}

function setSpin(v){ EH().set({ spinA: Math.round(Math.min(0.998, Math.max(0, v)) * 1000) / 1000 }); }
let drag = null;
svg.addEventListener('pointerdown', e => { drag = { x: e.clientX, v: EH().params.spinA }; svg.setPointerCapture(e.pointerId); svg.classList.add('dragging'); });
svg.addEventListener('pointermove', e => { if(drag) setSpin(drag.v + (e.clientX - drag.x) / 420); });
const endDrag = () => { drag = null; svg.classList.remove('dragging'); };
svg.addEventListener('pointerup', endDrag);
svg.addEventListener('pointercancel', endDrag);

function open(){
  root.hidden = false;
  document.body.classList.add('anatomy-open');
  EH().pauseRender(true);
  builtFor = '';
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
const toggle = () => root.hidden ? open() : close();
root.querySelector('.an-close').onclick = close;
if($('#btnAnatomy')) $('#btnAnatomy').onclick = toggle;

addEventListener('keydown', e => {
  if(e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key;
  if(k === 'a' || k === 'A'){ if(document.activeElement && document.activeElement.tagName === 'INPUT') return; toggle(); e.preventDefault(); return; }
  if(root.hidden) return;
  if(k === 'Escape'){ close(); e.preventDefault(); }
  else if(k === 'ArrowLeft' || k === 'ArrowRight'){ setSpin(EH().params.spinA + (k === 'ArrowRight' ? 0.02 : -0.02)); e.preventDefault(); }
});

window.EventHorizonAnatomy = { open, close, toggle };
})();
