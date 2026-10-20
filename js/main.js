(function(){
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const canvas = $('#gl');
const gl = canvas.getContext('webgl2', {
  antialias: false, alpha: false, depth: false, stencil: false,
  premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance'
});
if(!gl){ $('#fatal').hidden = false; return; }
const hasFloat = !!gl.getExtension('EXT_color_buffer_float');

/* ================================================================== */
/* Parameters                                                          */
/* ================================================================== */
const BASE_RATE = 6;               // r_s/c of simulation time per real second at ×1
const QUALITY = {
  low:   { k: 0.12, steps: 180 },
  med:   { k: 0.075, steps: 320 },
  high:  { k: 0.045, steps: 560 },
  ultra: { k: 0.028, steps: 1000 },
};
const MASSES = {
  stellar:   { m: 10,    label: 'Stellar black hole · 10 M☉' },
  sgra:      { m: 4.3e6, label: 'Sagittarius A* · 4.3×10⁶ M☉' },
  gargantua: { m: 1e8,   label: 'Gargantua-class · 10⁸ M☉' },
  m87:       { m: 6.5e9, label: 'M87* · 6.5×10⁹ M☉' },
};
const PRESETS = {
  gargantua: { dist: 19,  yaw: 0.0,  pitch: 0.07,  roll: -14, shiftX: 0.14, shiftY: 0.02, fov: 42 },
  edge:      { dist: 17,  yaw: 0.0,  pitch: 0.03,  roll: 0,   shiftX: 0,    shiftY: 0,    fov: 50 },
  top:       { dist: 24,  yaw: 0.0,  pitch: 1.52,  roll: 0,   shiftX: 0,    shiftY: 0,    fov: 55 },
  close:     { dist: 4.2, yaw: 0.5,  pitch: 0.16,  roll: -6,  shiftX: 0,    shiftY: 0,    fov: 80 },
};

const P = {
  speed: 1, playing: true, mass: 'gargantua',
  planetOn: true, planetR: 9, planetInc: 10, planetSize: 0.24,
  gravity: 1, redshift: true, doppler: 0.35, sky: 'stars', stars: 1, guides: false,
  diskOn: true, palette: 'cinematic', diskIn: 3, diskOut: 13, diskTemp: 6500, diskBright: 0.55,
  turb: 0.7, opacity: 1.4, spin: 1,
  fov: 42, roll: -14, autoOrbit: false, orbitSpeed: 0.04,
  scale: 0.75, quality: 'med', bloom: 1.3, exposure: 1.05, vignette: 0.6, grain: true,
  recRes: 'viewport', recDur: 10, recFps: 60,
};

const cam = { dist: 40, yaw: -0.9, pitch: 0.35, roll: -14, shiftX: 0.14, shiftY: 0.02, fov: 42 };
const goal = Object.assign({}, cam, PRESETS.gargantua);
let simTime = 0;

/* ================================================================== */
/* GL plumbing                                                         */
/* ================================================================== */
function compile(type, src){
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)){
    const log = gl.getShaderInfoLog(s);
    console.error(log);
    throw new Error(log);
  }
  return s;
}
const vs = compile(gl.VERTEX_SHADER, SHADERS.vert);
function program(fsSrc){
  const p = gl.createProgram();
  gl.attachShader(p, vs);
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(p);
  if(!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return { p, u: {} };
}
let progs;
try {
  progs = {
    scene: program(SHADERS.scene), pre: program(SHADERS.prefilter), down: program(SHADERS.down),
    blur: program(SHADERS.blur), comp: program(SHADERS.composite),
  };
} catch(e){
  const f = $('#fatal'); f.hidden = false;
  f.innerHTML = 'SHADER COMPILATION FAILED<br><span>' + String(e.message).slice(0, 300) + '</span>';
  return;
}
function loc(pr, n){ if(!(n in pr.u)) pr.u[n] = gl.getUniformLocation(pr.p, n); return pr.u[n]; }
const u1f = (pr, n, v) => gl.uniform1f(loc(pr, n), v);
const u1i = (pr, n, v) => gl.uniform1i(loc(pr, n), v);
const u2f = (pr, n, a, b) => gl.uniform2f(loc(pr, n), a, b);
const u3f = (pr, n, a) => gl.uniform3f(loc(pr, n), a[0], a[1], a[2]);
const u4f = (pr, n, a) => gl.uniform4f(loc(pr, n), a[0], a[1], a[2], a[3]);

const vao = gl.createVertexArray();
function draw(){ gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLES, 0, 3); }

function makeRT(w, h){
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  if(hasFloat) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return { tex, fbo, w, h };
}
function freeRT(rt){ if(rt){ gl.deleteTexture(rt.tex); gl.deleteFramebuffer(rt.fbo); } }

const BLOOM_LEVELS = 5;
let rtScene = null, bloom = [];
function ensureTargets(w, h){
  if(rtScene && rtScene.w === w && rtScene.h === h) return;
  freeRT(rtScene); bloom.forEach(l => { freeRT(l.a); freeRT(l.b); });
  rtScene = makeRT(w, h);
  bloom = [];
  for(let i = 0; i < BLOOM_LEVELS; i++){
    const bw = Math.max(1, w >> (i + 1)), bh = Math.max(1, h >> (i + 1));
    bloom.push({ a: makeRT(bw, bh), b: makeRT(bw, bh) });
  }
}

/* ================================================================== */
/* Sizing                                                              */
/* ================================================================== */
const REC_SIZES = { '720p': [1280, 720], '1080p': [1920, 1080], '4k': [3840, 2160] };
let fixedRes = null;
function resize(){
  let w, h;
  if(fixedRes){
    [w, h] = fixedRes;
    const s = Math.min(innerWidth / w, innerHeight / h);
    canvas.classList.add('fixed');
    canvas.style.width = Math.round(w * s) + 'px';
    canvas.style.height = Math.round(h * s) + 'px';
  } else {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = Math.round(innerWidth * dpr); h = Math.round(innerHeight * dpr);
    canvas.classList.remove('fixed');
    canvas.style.width = ''; canvas.style.height = '';
  }
  if(canvas.width !== w || canvas.height !== h){ canvas.width = w; canvas.height = h; }
}
addEventListener('resize', resize);
resize();

/* ================================================================== */
/* Vector helpers + camera                                             */
/* ================================================================== */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

function cameraBasis(){
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const pos = [cam.dist * cp * Math.sin(cam.yaw), cam.dist * sp, cam.dist * cp * Math.cos(cam.yaw)];
  const f = norm(scl(pos, -1));
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const a = cam.roll * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const r2 = add(scl(r, c), scl(u, s)), u2 = sub(scl(u, c), scl(r, s));
  return { pos, m: new Float32Array([...r2, ...u2, ...f]) };
}

const DIST_MIN = 1.3, DIST_MAX = 90, PITCH_MAX = 1.55;
function clampGoal(){
  for(const k of ['dist', 'yaw', 'pitch', 'shiftX', 'shiftY']) if(!Number.isFinite(goal[k])) goal[k] = PRESETS.gargantua[k];
  goal.dist = Math.min(DIST_MAX, Math.max(DIST_MIN, goal.dist));
  goal.pitch = Math.min(PITCH_MAX, Math.max(-PITCH_MAX, goal.pitch));
}
function applyPreset(name){
  const p = PRESETS[name];
  Object.assign(goal, p);
  // keep yaw continuous so the camera takes the short way round
  const tau = Math.PI * 2;
  goal.yaw = p.yaw + Math.round((cam.yaw - p.yaw) / tau) * tau;
  P.fov = p.fov; P.roll = p.roll;
  syncUI();
}

function planetPos(){
  const R = P.planetR, w = Math.sqrt(0.5 / (R * R * R)) * P.spin;
  const ph = w * simTime + 2.2;
  const i = P.planetInc * Math.PI / 180;
  const x = R * Math.cos(ph), z0 = R * Math.sin(ph);
  return { p: [x, z0 * Math.sin(i), z0 * Math.cos(i)], phase: ((ph / (2 * Math.PI)) % 1 + 1) % 1 };
}

/* ================================================================== */
/* Render                                                              */
/* ================================================================== */
const SKY = { stars: 0, grid: 1, void: 2 };
let lastBasis = null, lastPlanet = null;

function render(){
  const W = canvas.width, H = canvas.height;
  const sw = Math.max(2, Math.round(W * P.scale)), sh = Math.max(2, Math.round(H * P.scale));
  ensureTargets(sw, sh);

  const B = lastBasis = cameraBasis();
  const pl = lastPlanet = planetPos();
  const q = QUALITY[P.quality];
  const rCam = cam.dist;

  /* --- scene --- */
  let pr = progs.scene;
  gl.bindFramebuffer(gl.FRAMEBUFFER, rtScene.fbo);
  gl.viewport(0, 0, sw, sh);
  gl.useProgram(pr.p);
  u2f(pr, 'uRes', sw, sh);
  u2f(pr, 'uShift', cam.shiftX, cam.shiftY);
  u1f(pr, 'uTime', simTime);
  u3f(pr, 'uCamPos', B.pos);
  gl.uniformMatrix3fv(loc(pr, 'uCamRot'), false, B.m);
  u1f(pr, 'uTanFov', Math.tan(cam.fov * Math.PI / 360));
  u1f(pr, 'uGravity', P.gravity);
  u1f(pr, 'uEscape', Math.max(rCam * 1.05 + 2, P.diskOut * 1.4, 28));
  u1f(pr, 'uStepK', q.k);
  u1i(pr, 'uMaxSteps', q.steps);
  u1f(pr, 'uDiskOn', P.diskOn ? 1 : 0);
  u1f(pr, 'uDiskIn', P.diskIn);
  u1f(pr, 'uDiskOut', Math.max(P.diskOut, P.diskIn + 0.5));
  u1f(pr, 'uDiskBright', P.diskBright);
  u1f(pr, 'uDiskTemp', P.diskTemp);
  u1f(pr, 'uDiskOpacity', P.opacity);
  u1f(pr, 'uTurb', P.turb);
  u1f(pr, 'uSpin', P.spin);
  u1f(pr, 'uDoppler', P.doppler);
  u1f(pr, 'uRedshift', P.redshift ? 1 : 0);
  u1f(pr, 'uPalette', P.palette === 'blackbody' ? 1 : 0);
  u1i(pr, 'uSky', SKY[P.sky]);
  u1f(pr, 'uStars', P.stars);
  u1f(pr, 'uGuides', P.guides ? 1 : 0);
  u1f(pr, 'uPlanetOn', P.planetOn ? 1 : 0);
  u4f(pr, 'uPlanet', [pl.p[0], pl.p[1], pl.p[2], P.planetSize]);
  draw();

  /* --- bloom --- */
  if(P.bloom > 0){
    pr = progs.pre; gl.useProgram(pr.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, bloom[0].a.fbo);
    gl.viewport(0, 0, bloom[0].a.w, bloom[0].a.h);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, rtScene.tex);
    u1i(pr, 'uTex', 0);
    u2f(pr, 'uTexel', 1 / sw, 1 / sh);
    u1f(pr, 'uThreshold', 0.9); u1f(pr, 'uKnee', 0.6);
    draw();

    pr = progs.down; gl.useProgram(pr.p); u1i(pr, 'uTex', 0);
    for(let i = 1; i < BLOOM_LEVELS; i++){
      const src = bloom[i - 1].a, dst = bloom[i].a;
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
      gl.viewport(0, 0, dst.w, dst.h);
      gl.bindTexture(gl.TEXTURE_2D, src.tex);
      u2f(pr, 'uTexel', 1 / src.w, 1 / src.h);
      draw();
    }
    pr = progs.blur; gl.useProgram(pr.p); u1i(pr, 'uTex', 0);
    for(const l of bloom){
      gl.viewport(0, 0, l.a.w, l.a.h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, l.b.fbo); gl.bindTexture(gl.TEXTURE_2D, l.a.tex);
      u2f(pr, 'uDir', 1 / l.a.w, 0); draw();
      gl.bindFramebuffer(gl.FRAMEBUFFER, l.a.fbo); gl.bindTexture(gl.TEXTURE_2D, l.b.tex);
      u2f(pr, 'uDir', 0, 1 / l.a.h); draw();
    }
  }

  /* --- composite --- */
  pr = progs.comp; gl.useProgram(pr.p);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, W, H);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, rtScene.tex); u1i(pr, 'uScene', 0);
  for(let i = 0; i < BLOOM_LEVELS; i++){
    gl.activeTexture(gl.TEXTURE1 + i); gl.bindTexture(gl.TEXTURE_2D, bloom[i].a.tex);
    u1i(pr, 'uB' + i, 1 + i);
  }
  gl.activeTexture(gl.TEXTURE0);
  u1f(pr, 'uBloom', P.bloom);
  u1f(pr, 'uExposure', P.exposure);
  u1f(pr, 'uGrain', P.grain ? 1 : 0);
  u1f(pr, 'uVignette', P.vignette);
  u1f(pr, 'uTime', performance.now() / 1000);
  u2f(pr, 'uRes', W, H);
  draw();
}

/* ================================================================== */
/* UI construction                                                     */
/* ================================================================== */
const ctrls = {};
const pct = v => Math.round(v * 100) + '%';
const SECTIONS = [
  { id: 'sim', title: 'Simulation', items: [
    { t: 'range', k: 'speed', label: 'Time rate', min: -4, max: 4, step: 0.05, fmt: v => '×' + v.toFixed(2),
      hint: 'Negative values run the clock backwards.' },
    { t: 'seg', k: 'mass', label: 'Mass scale', opts: [['stellar', '10 M☉'], ['sgra', 'SGR A*'], ['gargantua', '10⁸ M☉'], ['m87', 'M87*']],
      hint: 'Sets physical units only. Geometry is scale-free.' },
    { t: 'toggle', k: 'planetOn', label: 'Orbiting probe' },
    { t: 'range', k: 'planetR', label: 'Orbit radius', min: 2, max: 18, step: 0.1, fmt: v => v.toFixed(1) + ' rₛ', dep: 'planetOn',
      hint: 'Circular orbits below 3 rₛ (ISCO) are unstable.' },
    { t: 'range', k: 'planetInc', label: 'Orbit inclination', min: 0, max: 80, step: 1, fmt: v => v + '°', dep: 'planetOn' },
  ]},
  { id: 'space', title: 'Spacetime', items: [
    { t: 'range', k: 'gravity', label: 'Light bending', min: 0, max: 1, step: 0.01, fmt: pct,
      hint: '0% = light travels in straight lines (no lensing).' },
    { t: 'range', k: 'doppler', label: 'Doppler beaming', min: 0, max: 1, step: 0.01, fmt: pct,
      hint: 'Approaching gas brightens, receding gas dims.' },
    { t: 'toggle', k: 'redshift', label: 'Gravitational redshift' },
    { t: 'seg', k: 'sky', label: 'Background', opts: [['stars', 'STARS'], ['grid', 'GRID'], ['void', 'VOID']],
      hint: 'The grid makes the lensing distortion easy to read.' },
    { t: 'toggle', k: 'guides', label: 'Equatorial guides' },
  ]},
  { id: 'disk', title: 'Accretion Disk', items: [
    { t: 'toggle', k: 'diskOn', label: 'Accretion disk' },
    { t: 'seg', k: 'palette', label: 'Palette', opts: [['cinematic', 'CINEMATIC'], ['blackbody', 'BLACKBODY']], dep: 'diskOn' },
    { t: 'range', k: 'diskTemp', label: 'Peak temperature', min: 1500, max: 30000, step: 100, fmt: v => Math.round(v) + ' K', dep: 'diskOn' },
    { t: 'range', k: 'diskIn', label: 'Inner edge', min: 1.5, max: 8, step: 0.05, fmt: v => v.toFixed(2) + ' rₛ', dep: 'diskOn' },
    { t: 'range', k: 'diskOut', label: 'Outer edge', min: 5, max: 26, step: 0.1, fmt: v => v.toFixed(1) + ' rₛ', dep: 'diskOn' },
    { t: 'range', k: 'diskBright', label: 'Luminosity', min: 0, max: 3, step: 0.01, fmt: v => v.toFixed(2), dep: 'diskOn' },
    { t: 'range', k: 'opacity', label: 'Optical depth', min: 0.1, max: 4, step: 0.01, fmt: v => v.toFixed(2), dep: 'diskOn' },
    { t: 'range', k: 'turb', label: 'Turbulence', min: 0, max: 1, step: 0.01, fmt: pct, dep: 'diskOn' },
    { t: 'seg', k: 'spin', label: 'Rotation', opts: [[1, 'PROGRADE'], [-1, 'RETROGRADE']], dep: 'diskOn' },
  ]},
  { id: 'cam', title: 'Camera', items: [
    { t: 'buttons', items: [['Gargantua', () => applyPreset('gargantua')], ['Edge-on', () => applyPreset('edge')],
                            ['Polar', () => applyPreset('top')], ['Close pass', () => applyPreset('close')]] },
    { t: 'range', k: 'fov', label: 'Field of view', min: 20, max: 120, step: 1, fmt: v => v + '°' },
    { t: 'range', k: 'roll', label: 'Roll', min: -60, max: 60, step: 1, fmt: v => v + '°' },
    { t: 'toggle', k: 'autoOrbit', label: 'Auto orbit' },
    { t: 'range', k: 'orbitSpeed', label: 'Orbit speed', min: -0.3, max: 0.3, step: 0.005, fmt: v => v.toFixed(3) + ' rad/s', dep: 'autoOrbit' },
  ]},
  { id: 'render', title: 'Render', collapsed: true, items: [
    { t: 'seg', k: 'quality', label: 'Integrator', opts: [['low', 'LOW'], ['med', 'MED'], ['high', 'HIGH'], ['ultra', 'ULTRA']],
      hint: 'Geodesic step size and step budget per ray.' },
    { t: 'range', k: 'scale', label: 'Resolution', min: 0.3, max: 1, step: 0.05, fmt: pct },
    { t: 'range', k: 'bloom', label: 'Bloom', min: 0, max: 2.5, step: 0.01, fmt: v => v.toFixed(2) },
    { t: 'range', k: 'exposure', label: 'Exposure', min: 0.2, max: 3, step: 0.01, fmt: v => v.toFixed(2) },
    { t: 'range', k: 'stars', label: 'Star field', min: 0, max: 2, step: 0.01, fmt: pct },
    { t: 'range', k: 'vignette', label: 'Vignette', min: 0, max: 1, step: 0.01, fmt: pct },
    { t: 'toggle', k: 'grain', label: 'Film grain' },
  ]},
  { id: 'export', title: 'Export', items: [
    { t: 'seg', k: 'recRes', label: 'Output size', opts: [['viewport', 'VIEW'], ['720p', '720P'], ['1080p', '1080P'], ['4k', '4K']] },
    { t: 'seg', k: 'recDur', label: 'Clip length', opts: [[5, '5 S'], [10, '10 S'], [30, '30 S'], [0, 'MANUAL']] },
    { t: 'seg', k: 'recFps', label: 'Frame rate', opts: [[30, '30 FPS'], [60, '60 FPS']] },
    { t: 'buttons', items: [['Snapshot', () => snapshot()], ['<span class="dot"></span><span class="rec-label">Record</span>', () => toggleRecording(), 'rec']] },
    { t: 'note', id: 'recNote' },
  ]},
];

function setRangeFill(inp){
  const p = (inp.value - inp.min) / (inp.max - inp.min) * 100;
  inp.style.setProperty('--p', p + '%');
}

function buildUI(){
  const root = $('#sections');
  SECTIONS.forEach((sec, si) => {
    const el = document.createElement('section');
    el.className = 'sec' + (sec.collapsed ? ' collapsed' : '');
    el.innerHTML = `<button class="sec-head"><span class="n">${String(si + 1).padStart(2, '0')}</span><span class="t">${sec.title.toUpperCase()}</span><span class="pm">${sec.collapsed ? '+' : '−'}</span></button><div class="sec-body"></div>`;
    const head = el.firstChild, body = el.lastChild;
    head.onclick = () => { el.classList.toggle('collapsed'); head.lastChild.textContent = el.classList.contains('collapsed') ? '+' : '−'; };
    sec.items.forEach(it => body.appendChild(buildItem(it)));
    root.appendChild(el);
  });
}

function buildItem(it){
  const row = document.createElement('div');
  row.className = 'row';
  if(it.t === 'range'){
    row.innerHTML = `<div class="row-head"><span class="lbl">${it.label}</span><span class="val"></span></div><input type="range" min="${it.min}" max="${it.max}" step="${it.step}">` + (it.hint ? `<div class="hint">${it.hint}</div>` : '');
    const inp = row.querySelector('input'), val = row.querySelector('.val');
    inp.oninput = () => { P[it.k] = parseFloat(inp.value); val.textContent = it.fmt(P[it.k]); setRangeFill(inp); onParam(it.k); };
    inp.ondblclick = () => { P[it.k] = DEFAULTS[it.k]; ctrls[it.k].update(); onParam(it.k); };
    ctrls[it.k] = { row, dep: it.dep, update(){ inp.value = P[it.k]; val.textContent = it.fmt(P[it.k]); setRangeFill(inp); } };
  } else if(it.t === 'toggle'){
    row.innerHTML = `<div class="toggle-row"><span class="lbl">${it.label}</span><button class="switch" role="switch"></button></div>`;
    const sw = row.querySelector('.switch');
    sw.onclick = () => { P[it.k] = !P[it.k]; ctrls[it.k].update(); onParam(it.k); };
    ctrls[it.k] = { row, dep: it.dep, update(){ sw.classList.toggle('on', !!P[it.k]); sw.setAttribute('aria-checked', !!P[it.k]); } };
  } else if(it.t === 'seg'){
    row.innerHTML = `<div class="row-head"><span class="lbl">${it.label}</span></div><div class="seg"></div>` + (it.hint ? `<div class="hint">${it.hint}</div>` : '');
    const seg = row.querySelector('.seg');
    const bs = it.opts.map(([v, l]) => {
      const b = document.createElement('button');
      b.textContent = l;
      b.onclick = () => { P[it.k] = v; ctrls[it.k].update(); onParam(it.k); };
      seg.appendChild(b);
      return [v, b];
    });
    ctrls[it.k] = { row, dep: it.dep, update(){ bs.forEach(([v, b]) => b.classList.toggle('on', v === P[it.k])); } };
  } else if(it.t === 'buttons'){
    row.innerHTML = '<div class="btns"></div>';
    const g = row.firstChild;
    it.items.forEach(([label, fn, cls]) => {
      const b = document.createElement('button');
      b.className = 'btn' + (cls ? ' ' + cls : '');
      b.innerHTML = label;
      b.onclick = fn;
      g.appendChild(b);
    });
  } else if(it.t === 'note'){
    row.className = 'row hint';
    row.id = it.id;
  }
  return row;
}

function syncUI(){
  for(const k in ctrls){
    const c = ctrls[k];
    c.update();
    if(c.dep) c.row.classList.toggle('disabled', !P[c.dep]);
  }
  $('#timeline').classList.toggle('playing', P.playing);
  $('#tlRate').textContent = '×' + P.speed.toFixed(2);
  $('#legend').classList.toggle('on', P.guides);
}

function onParam(k){
  if(k === 'fov' || k === 'roll') goal[k] = P[k];
  if(k === 'diskIn' && P.diskOut < P.diskIn + 1){ P.diskOut = P.diskIn + 1; }
  if(k === 'diskOut' && P.diskIn > P.diskOut - 1){ P.diskIn = Math.max(1.5, P.diskOut - 1); }
  if(k === 'palette'){
    if(P.palette === 'blackbody'){ P.doppler = 1; }
    else { P.doppler = 0.35; }
  }
  syncUI();
}

const DEFAULTS = Object.assign({}, P);

/* ================================================================== */
/* Telemetry                                                           */
/* ================================================================== */
const TELE = [
  ['R_CAM', 'rcam'], ['DISTANCE', 'rphys'], ['INCLINATION', 'incl'], ['CLOCK RATE', 'clock'],
  ['ESCAPE V', 'vesc'], ['PROBE τ/t', 'probe'], ['R_S', 'rs'], ['FRAME', 'fps'],
];
const teleEls = {};
(function(){
  const dl = $('#telemetry');
  TELE.forEach(([label, id]) => {
    const dt = document.createElement('dt'); dt.textContent = label;
    const dd = document.createElement('dd'); dd.textContent = '—';
    dl.append(dt, dd); teleEls[id] = dd;
  });
})();

function fmtLen(km){
  const AU = 1.495978707e8, LY = 9.4607e12;
  if(km < 1e6) return km.toPrecision(3) + ' km';
  if(km < 0.5 * LY) return (km / AU).toPrecision(3) + ' AU';
  return (km / LY).toPrecision(3) + ' ly';
}
function fmtDur(s){
  const a = Math.abs(s), sign = s < 0 ? '−' : '';
  if(a === 0) return '0 s';
  if(a < 1e-3) return sign + (a * 1e6).toFixed(1) + ' µs';
  if(a < 1) return sign + (a * 1e3).toFixed(1) + ' ms';
  if(a < 120) return sign + a.toFixed(1) + ' s';
  if(a < 7200) return sign + (a / 60).toFixed(1) + ' min';
  if(a < 172800) return sign + (a / 3600).toFixed(1) + ' h';
  if(a < 3.15576e7 * 2) return sign + (a / 86400).toFixed(1) + ' d';
  return sign + (a / 3.15576e7).toFixed(2) + ' yr';
}

let fpsAvg = 60, teleTimer = 0;
function updateTelemetry(dt){
  if(dt > 0) fpsAvg += (1 / dt - fpsAvg) * 0.05;
  teleTimer -= dt;
  const m = MASSES[P.mass].m, rsKm = 2.9532 * m, tUnit = 9.851e-6 * m;
  $('#tlTime').textContent = simTime.toFixed(1);
  $('#tlPhys').textContent = fmtDur(simTime * tUnit);
  if(lastPlanet) $('#tlPhase').style.width = (lastPlanet.phase * 100).toFixed(1) + '%';
  if(teleTimer > 0) return;
  teleTimer = 0.12;
  const r = cam.dist;
  teleEls.rcam.textContent = r.toFixed(2) + ' rₛ';
  teleEls.rphys.textContent = fmtLen(r * rsKm);
  teleEls.incl.textContent = (90 - cam.pitch * 180 / Math.PI).toFixed(1) + '°';
  teleEls.clock.textContent = Math.sqrt(Math.max(0, 1 - 1 / r)).toFixed(4) + '×';
  teleEls.vesc.textContent = Math.sqrt(1 / r).toFixed(3) + ' c';
  if(P.planetOn){
    const R = P.planetR;
    teleEls.probe.textContent = R > 1.5 ? Math.sqrt(1 - 1.5 / R).toFixed(4) + (R < 3 ? ' UNSTABLE' : '') : '—';
    teleEls.probe.classList.toggle('warn', R < 3);
  } else { teleEls.probe.textContent = 'OFF'; teleEls.probe.classList.remove('warn'); }
  teleEls.rs.textContent = fmtLen(rsKm);
  teleEls.fps.textContent = Math.round(fpsAvg) + ' FPS · ' + Math.round(canvas.width * P.scale) + '×' + Math.round(canvas.height * P.scale);
}

/* ================================================================== */
/* Input                                                               */
/* ================================================================== */
const pointers = new Map();
let dragMode = null, pinchStart = 0, pinchDist = 0;
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if(pointers.size === 2){
    const [a, b] = [...pointers.values()];
    pinchStart = Math.hypot(a.x - b.x, a.y - b.y); pinchDist = goal.dist; dragMode = 'pinch';
  } else {
    dragMode = (e.button === 2 || e.button === 1 || e.shiftKey) ? 'pan' : 'orbit';
  }
  canvas.classList.add('dragging');
});
canvas.addEventListener('pointermove', e => {
  const p = pointers.get(e.pointerId);
  if(!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if(dragMode === 'pinch' && pointers.size === 2){
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if(pinchStart > 0 && d > 1) goal.dist = pinchDist * pinchStart / d;
  } else if(dragMode === 'orbit'){
    const sens = 0.005 * Math.min(1, 0.4 + cam.fov / 100);
    goal.yaw -= dx * sens;
    goal.pitch += dy * sens;
  } else if(dragMode === 'pan'){
    const h = Math.min(canvas.clientWidth, canvas.clientHeight);
    goal.shiftX += dx / h; goal.shiftY -= dy / h;
  }
  clampGoal();
});
function endPointer(e){
  pointers.delete(e.pointerId);
  if(pointers.size === 0){ dragMode = null; canvas.classList.remove('dragging'); }
  else if(pointers.size === 1) dragMode = 'orbit';
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('lostpointercapture', endPointer);
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  goal.dist *= Math.exp(e.deltaY * (e.deltaMode === 1 ? 0.04 : 0.0012));
  clampGoal();
}, { passive: false });
canvas.addEventListener('dblclick', () => applyPreset('gargantua'));

const SPEEDS = [-4, -2, -1, -0.5, -0.25, 0, 0.25, 0.5, 1, 2, 4];
function changeSpeed(dir){
  const s = P.speed;
  const next = dir > 0 ? SPEEDS.find(v => v > s + 1e-6) : [...SPEEDS].reverse().find(v => v < s - 1e-6);
  if(next !== undefined) P.speed = next;
  syncUI();
}
function stepTime(sign = 1){ simTime += sign * (P.speed < 0 ? -1 : 1); }
function togglePlay(){ P.playing = !P.playing; syncUI(); }

$('#timeline').addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if(!b) return;
  const a = b.dataset.act;
  if(a === 'play') togglePlay();
  else if(a === 'reset'){ simTime = 0; }
  else if(a === 'slower') changeSpeed(-1);
  else if(a === 'faster') changeSpeed(1);
  else if(a === 'step'){ P.playing = false; stepTime(1); syncUI(); }
});

const keys = new Set();
addEventListener('keydown', e => {
  if(e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = document.activeElement && document.activeElement.tagName;
  const onRange = tag === 'INPUT';
  const k = e.key;
  if(k === 'Escape'){ $('#info').hidden = true; return; }
  if(k === ' '){ e.preventDefault(); togglePlay(); return; }
  if(onRange && k.startsWith('Arrow')) return;
  if(k.startsWith('Arrow') || k === '+' || k === '=' || k === '-' || k === '_'){ keys.add(k); e.preventDefault(); return; }
  switch(k.toLowerCase()){
    case '[': changeSpeed(-1); break;
    case ']': changeSpeed(1); break;
    case '.': P.playing = false; stepTime(1); syncUI(); break;
    case ',': P.playing = false; stepTime(-1); syncUI(); break;
    case '0': simTime = 0; break;
    case '1': applyPreset('gargantua'); break;
    case '2': applyPreset('edge'); break;
    case '3': applyPreset('top'); break;
    case '4': applyPreset('close'); break;
    case 'g': P.guides = !P.guides; syncUI(); break;
    case 'h': toggleHUD(); break;
    case 'c': togglePanel(); break;
    case 'i': $('#info').hidden = !$('#info').hidden; break;
    case 'f': toggleFullscreen(); break;
    case 'p': snapshot(); break;
    case 'r': toggleRecording(); break;
  }
});
addEventListener('keyup', e => keys.delete(e.key));
addEventListener('blur', () => keys.clear());

function toggleHUD(){ $('#hud').classList.toggle('hidden'); }
function togglePanel(){
  const closed = $('#panel').classList.toggle('closed');
  $('#btnPanel').classList.toggle('on', !closed);
}
function toggleFullscreen(){
  if(document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {});
}
$('#btnHide').onclick = toggleHUD;
$('#btnPanel').onclick = togglePanel;
$('#btnFull').onclick = toggleFullscreen;
$('#btnInfo').onclick = () => { $('#info').hidden = false; };
$('#infoClose').onclick = () => { $('#info').hidden = true; };
$('#info').addEventListener('click', e => { if(e.target.id === 'info') $('#info').hidden = true; });

/* ================================================================== */
/* Export                                                              */
/* ================================================================== */
let toastTimer = 0;
function toast(msg){
  const t = $('#toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2600);
}
function stamp(){
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
function download(blob, name){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

let snapPending = false;
function snapshot(){ snapPending = true; }
function doSnapshot(){
  // must run right after render() in the same task, before the buffer is presented
  canvas.toBlob(b => {
    if(!b){ toast('SNAPSHOT FAILED'); return; }
    download(b, `blackhole-${stamp()}.png`);
    toast(`SNAPSHOT SAVED · ${canvas.width}×${canvas.height}`);
  }, 'image/png');
}

const MIMES = [
  ['video/mp4;codecs=avc1.640033', 'mp4'], ['video/mp4;codecs=avc1', 'mp4'], ['video/mp4', 'mp4'],
  ['video/webm;codecs=vp9', 'webm'], ['video/webm;codecs=vp8', 'webm'], ['video/webm', 'webm'],
];
const recFormat = (window.MediaRecorder && MIMES.find(([m]) => MediaRecorder.isTypeSupported(m))) || null;
let recorder = null, recStart = 0, recTimer = 0;

function setRecNote(){
  const n = $('#recNote');
  if(!n) return;
  n.textContent = recFormat
    ? `Encodes ${recFormat[1].toUpperCase()} in real time while the simulation runs. Higher output sizes cost frame rate.`
    : 'Video recording is not supported in this browser. Snapshots still work.';
}

function toggleRecording(){
  if(recorder){ recorder.stop(); return; }
  if(!recFormat){ toast('RECORDING NOT SUPPORTED'); return; }
  fixedRes = P.recRes === 'viewport' ? null : REC_SIZES[P.recRes];
  resize();
  const stream = canvas.captureStream(P.recFps);
  const px = canvas.width * canvas.height;
  const bps = Math.min(80e6, Math.max(6e6, px * P.recFps * 0.16));
  let chunks = [];
  try {
    recorder = new MediaRecorder(stream, { mimeType: recFormat[0], videoBitsPerSecond: bps });
  } catch(e){
    fixedRes = null; resize(); toast('RECORDER ERROR'); return;
  }
  recorder.ondataavailable = e => { if(e.data && e.data.size) chunks.push(e.data); };
  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: recFormat[0].split(';')[0] });
    download(blob, `blackhole-${stamp()}.${recFormat[1]}`);
    toast(`CLIP SAVED · ${(blob.size / 1048576).toFixed(1)} MB`);
    stream.getTracks().forEach(t => t.stop());
    recorder = null; chunks = [];
    clearTimeout(recTimer);
    fixedRes = null; resize();
    updateRecUI();
  };
  recorder.start(250);
  recStart = performance.now();
  if(P.recDur > 0) recTimer = setTimeout(() => recorder && recorder.stop(), P.recDur * 1000);
  updateRecUI();
}
function updateRecUI(){
  const on = !!recorder;
  $('#rec').classList.toggle('on', on);
  const b = document.querySelector('.btn.rec');
  if(b){ b.classList.toggle('active', on); b.querySelector('.rec-label').textContent = on ? 'Stop' : 'Record'; }
}
function tickRecUI(){
  if(!recorder) return;
  const s = (performance.now() - recStart) / 1000;
  const mm = String(Math.floor(s / 60)).padStart(2, '0'), ss = String(Math.floor(s % 60)).padStart(2, '0');
  $('#recText').textContent = `REC ${mm}:${ss}` + (P.recDur ? ` / ${String(Math.floor(P.recDur / 60)).padStart(2, '0')}:${String(P.recDur % 60).padStart(2, '0')}` : '') + ` · ${canvas.width}×${canvas.height}`;
}

/* ================================================================== */
/* Main loop                                                           */
/* ================================================================== */
let last = performance.now();
function frame(now){
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;

  if(P.playing) simTime += dt * P.speed * BASE_RATE;

  // keyboard camera
  const kr = 1.4 * dt;
  if(keys.has('ArrowLeft')) goal.yaw += kr;
  if(keys.has('ArrowRight')) goal.yaw -= kr;
  if(keys.has('ArrowUp')) goal.pitch += kr;
  if(keys.has('ArrowDown')) goal.pitch -= kr;
  if(keys.has('+') || keys.has('=')) goal.dist *= Math.exp(-dt * 1.2);
  if(keys.has('-') || keys.has('_')) goal.dist *= Math.exp(dt * 1.2);
  if(P.autoOrbit) goal.yaw += P.orbitSpeed * dt;
  clampGoal();

  const a = 1 - Math.exp(-dt * 7);
  for(const k of ['dist', 'yaw', 'pitch', 'roll', 'shiftX', 'shiftY', 'fov']){
    if(k === 'dist') cam.dist = Math.exp(Math.log(cam.dist) + (Math.log(goal.dist) - Math.log(cam.dist)) * a);
    else cam[k] += (goal[k] - cam[k]) * a;
    if(!Number.isFinite(cam[k])) cam[k] = goal[k];
  }

  render();
  if(snapPending){ snapPending = false; doSnapshot(); }
  updateTelemetry(dt);
  tickRecUI();
  requestAnimationFrame(frame);
}

buildUI();
setRecNote();
syncUI();
$('#btnPanel').classList.add('on');
$('#panelMeta').textContent = hasFloat ? 'GL2 · HDR' : 'GL2 · LDR';
if(innerWidth < 640) togglePanel();

/* Small scripting API, e.g. from the console:
   EventHorizon.set({ sky: 'grid', guides: true }); EventHorizon.preset('edge'); EventHorizon.time = 0; */
window.EventHorizon = {
  params: P,
  camera: goal,
  get time(){ return simTime; },
  set time(v){ simTime = +v || 0; },
  set(o){ Object.assign(P, o); if('fov' in o) goal.fov = P.fov; if('roll' in o) goal.roll = P.roll; syncUI(); },
  preset: applyPreset,
  snapCamera(){ clampGoal(); Object.assign(cam, goal); },
  togglePanel, toggleHUD, snapshot, toggleRecording,
};

requestAnimationFrame(frame);
})();
