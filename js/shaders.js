/* GLSL sources. Units: Schwarzschild radius r_s = 1, c = 1 (so M = 0.5). */
window.SHADERS = {};

SHADERS.vert = `#version 300 es
out vec2 vUv;
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/* ------------------------------------------------------------------ */
/* Main pass: integrate null geodesics through Schwarzschild spacetime */
/* ------------------------------------------------------------------ */
SHADERS.scene = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2  uRes;
uniform vec2  uShift;
uniform float uTime;
uniform vec3  uCamPos;
uniform mat3  uCamRot;
uniform float uTanFov;
uniform float uGravity;
uniform float uEscape;
uniform float uStepK;
uniform int   uMaxSteps;

uniform float uDiskOn;
uniform float uDiskIn;
uniform float uDiskOut;
uniform float uDiskBright;
uniform float uDiskTemp;
uniform float uDiskOpacity;
uniform float uTurb;
uniform float uSpin;
uniform float uDoppler;
uniform float uRedshift;
uniform float uPalette;

uniform int   uSky;
uniform float uStars;
uniform float uGuides;

/* Kerr metric. Ray paths use (uM, uA), which the "light bending" slider scales;
   the disk's own orbital physics uses the true (uDiskM, uDiskA). r_s = 1. */
uniform float uM;
uniform float uA;
uniform float uDiskM;
uniform float uDiskA;
uniform float uRCapture;    // rays inside this Boyer-Lindquist r are absorbed (just outside r+)
uniform float uPhPro;       // prograde / retrograde circular photon orbits (equatorial)
uniform float uPhRetro;
uniform float uIsco;
uniform float uThick;       // disk scale height H/R; 0 = infinitely thin sheet
uniform float uHaze;        // weight of the broad, optically thin envelope
uniform float uDelayRef;    // travel time subtracted so "now" is roughly the direct-view time
uniform vec4  uFlare;       // emission time t_f, orbit radius, azimuth at t_f, mode (0 spot, 1 whole disk)
uniform float uFlareOn;
uniform float uFlareBright;
/* relativistic jets along the spin axis */
uniform float uJetOn;
uniform float uJetPower;    // includes the spin scaling (Blandford-Znajek, ∝ a²)
uniform float uJetBeta;
uniform float uJetGamma;
uniform float uJetW0;       // width at the base
uniform float uJetOpen;     // widening per unit height (cone)
uniform float uJetLen;
uniform float uJetBase;     // height where the jet starts (just outside the horizon)

uniform vec3  uObsBeta;     // observer velocity relative to a local static observer (units of c)
uniform float uObsBeam;     // apply observer Doppler beaming to the image
uniform float uObsExpo;     // auto-exposure for beaming: 1 / D_max³

uniform float uPlanetOn;
uniform vec4  uPlanet;
uniform vec4  uProbeAxis;   // xyz radial unit vector, w tidal stretch factor
uniform float uProbeG;      // observed frequency shift ν_obs/ν_emit

const float PI = 3.14159265359;

float hash13(vec3 p3){
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec3 p){
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i),                  hash13(i + vec3(1,0,0)), f.x),
                 mix(hash13(i + vec3(0,1,0)),    hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)),    hash13(i + vec3(1,0,1)), f.x),
                 mix(hash13(i + vec3(0,1,1)),    hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
}

float fbm(vec3 p){
  float s = 0.0, a = 0.5;
  for(int i = 0; i < 5; i++){
    s += a * vnoise(p);
    p = p * 2.03 + vec3(3.1, 1.7, 5.3);
    a *= 0.5;
  }
  return s / 0.96875;
}

/* Approximate blackbody colour (Tanner Helland fit), returned in linear RGB */
vec3 blackbody(float T){
  float t = clamp(T, 1000.0, 40000.0) / 100.0;
  vec3 c;
  c.r = t <= 66.0 ? 1.0 : clamp(1.292936 * pow(t - 60.0, -0.1332047), 0.0, 1.0);
  c.g = t <= 66.0 ? clamp(0.3900816 * log(t) - 0.6318414, 0.0, 1.0)
                  : clamp(1.1298909 * pow(t - 60.0, -0.0755148), 0.0, 1.0);
  c.b = t >= 66.0 ? 1.0 : (t <= 19.0 ? 0.0 : clamp(0.5432068 * log(t - 10.0) - 1.1962541, 0.0, 1.0));
  return pow(c, vec3(2.2));
}

/* Warm "cinematic" ramp, heat ~ 0..1.6 */
vec3 cineRamp(float h){
  vec3 c0 = vec3(0.50, 0.10, 0.025);
  vec3 c1 = vec3(1.00, 0.36, 0.09);
  vec3 c2 = vec3(1.00, 0.62, 0.32);
  vec3 c3 = vec3(1.00, 0.88, 0.74);
  h = clamp(h, 0.0, 1.6) / 1.6 * 3.0;
  return h < 1.0 ? mix(c0, c1, h) : (h < 2.0 ? mix(c1, c2, h - 1.0) : mix(c2, c3, h - 2.0));
}

float diskLayer(float r, float ang, float seed){
  vec3 q = vec3(cos(ang) * 2.2, sin(ang) * 2.2, r * 2.4 + seed);
  float n = fbm(q + seed);
  float s = vnoise(vec3(cos(ang) * 10.0, sin(ang) * 10.0, r * 11.0 + seed * 3.0));
  return n * 0.78 + s * 0.22;
}

float fbm3(vec3 p){
  float s = 0.0, a = 0.5;
  for(int i = 0; i < 3; i++){
    s += a * vnoise(p);
    p = p * 2.03 + vec3(3.1, 1.7, 5.3);
    a *= 0.5;
  }
  return s / 0.875;
}
/* cheaper turbulence for the volume, with a vertical coordinate zn = z/H */
float diskLayerV(float r, float ang, float zn, float seed){
  vec3 q = vec3(cos(ang) * 2.2, sin(ang) * 2.2, r * 2.4 + seed + zn * 0.9);
  return fbm3(q + seed);
}

/* Source function S (rgb) of disk gas at Boyer-Lindquist radius r and azimuth
   phi, and its column density (out dens). zn = z/H is the height in scale
   heights (volume only). b is the photon's axial angular momentum p_phi, camE
   its energy in the camera's zero-angular-momentum frame. */
vec3 diskSource(float r, float phi, float zn, float b, float camE, bool thick, float te, out float dens, out float flare){
  dens = 0.0; flare = 0.0;
  float rIn = uDiskIn;
  if(r > uDiskOut || (!thick && r < rIn * 0.8) || (thick && r < uRCapture)) return vec3(0.0);
  float x = (r - rIn) / (uDiskOut - rIn);
  float outer = 1.0 - smoothstep(0.3, 1.0, x);
  /* thin: sharp edge at the ISCO. thick: gas keeps glowing, fainter, as it plunges in */
  float inner = thick ? (r >= rIn ? 1.0 : 0.6 * smoothstep(uRCapture, rIn, r))
                      : smoothstep(rIn * 0.82, rIn * 1.06, r);

  /* Kerr circular orbit, sense s = uSpin relative to the hole's rotation:
     Ω = s√M / (r^{3/2} + s a√M). Plunging gas keeps the ISCO's orbit (approx.) */
  float rk = max(r, thick ? rIn : r);
  float M = uDiskM, a = uDiskA, sqM = sqrt(M), r15 = rk * sqrt(rk);
  float omega = uSpin * sqM / (r15 + uSpin * a * sqM);

  /* flow-map style: two phase-shifted layers so differential shear never winds up */
  const float P = 140.0;
  float t1 = mod(te, P), t2 = mod(te + 0.5 * P, P);
  float w1 = 1.0 - abs(2.0 * t1 / P - 1.0);
  float n = thick
    ? diskLayerV(r, phi - omega * t1, zn, 0.0) * w1 + diskLayerV(r, phi - omega * t2, zn, 7.31) * (1.0 - w1)
    : diskLayer(r, phi - omega * t1, 0.0) * w1 + diskLayer(r, phi - omega * t2, 7.31) * (1.0 - w1);
  n = (n - 0.5) / sqrt(w1 * w1 + (1.0 - w1) * (1.0 - w1)) + 0.5;

  float tex = smoothstep(0.18, 0.82, n);
  dens = inner * outer * mix(1.0, tex * 1.7 + 0.04, uTurb);
  /* hot, puffy flows are compact: most of the gas sits close to the hole */
  if(thick) dens *= pow(rIn / max(r, rIn), 1.5);

  /* Novikov-Thorne-like temperature profile, normalised to peak = 1 */
  float rr = max(r / rIn, 1.0001);
  float f = pow(rr, -0.75) * pow(1.0 - sqrt(1.0 / rr), 0.25) / 0.488;
  f = r < rIn ? 0.55 : max(f, 0.18 * inner);

  /* Exact frequency ratio g = E_camera / E_emitted, split into
       gravity + frame dragging (camera ZAMO vs. emitter ZAMO) and
       Doppler (emitter ZAMO vs. orbiting gas), so each can be dialled. */
  float rad = r15 - 3.0 * M * sqrt(rk) + 2.0 * uSpin * a * sqM;
  float ut = (r15 + uSpin * a * sqM) / (pow(rk, 0.75) * sqrt(max(rad, 0.02 * r15)));
  float Eem = ut * (1.0 - omega * b);
  float Dl = r * r - 2.0 * M * r + a * a;
  float S2 = (r * r + a * a) * (r * r + a * a) - a * a * Dl;
  float alE = r * sqrt(max(Dl, 1e-6) / S2), omE = 2.0 * M * a * r / S2;
  float Ezamo = (1.0 - omE * b) / alE;
  float g = clamp(mix(1.0, camE / Ezamo, uRedshift) * pow(max(Ezamo / Eem, 1e-3), uDoppler), 0.0, 12.0);
  float g4 = g * g * g * g;

  vec3 hue = uPalette > 0.5 ? blackbody(uDiskTemp * f * g) : cineRamp(f * g);
  float streak = mix(1.0, 0.3 + 1.2 * tex, uTurb);
  /* flare: a short-lived hot spot riding the flow (or the whole disk at once),
     seen at the time its light left: te = now − travel time */
  if(uFlareOn > 0.5){
    float age = te - uFlare.x;
    if(age > 0.0 && age < 40.0){
      float env = smoothstep(0.0, 0.5, age) * exp(-age / 2.5);
      float spot = 1.0;
      if(uFlare.w < 0.5){
        float rf = uFlare.y, rf15 = rf * sqrt(rf);
        float omF = uSpin * sqM / (rf15 + uSpin * a * sqM);
        float dph = mod(phi - (uFlare.z + omF * age) + PI, 2.0 * PI) - PI;
        float dr = r - rf, arc = rf * dph;
        spot = exp(-(dr * dr + arc * arc) / (2.0 * 0.45 * 0.45));
      } else {
        spot = outer * (thick ? max(inner, 0.0) : inner);
      }
      flare = uFlareBright * env * spot * min(g4, 60.0);
    }
  }
  return hue * uDiskBright * (0.15 + f * f) * g4 * 2.2 * streak;
}
const vec3 FLARE_COLOR = vec3(0.78, 0.9, 1.0);

/* ------------------------------------------------------------------ */
/* Jets: optically thin glowing plasma flowing out along ±y at βc.    */
/* ------------------------------------------------------------------ */
const vec3 JET_COLOR = vec3(0.55, 0.78, 1.0);
float jetWidth(float ay){ return uJetW0 + uJetOpen * ay; }

/* emission over a path element ds at scene point p (Boyer-Lindquist Xbl),
   for a backward ray heading along dir, seen at retarded time te */
vec3 jetEmission(vec3 p, vec3 Xbl, vec3 dir, float b, float camE, float te, float ds){
  float ay = abs(p.y);
  if(ay < uJetBase || ay > uJetLen) return vec3(0.0);
  float w = jetWidth(ay), u = length(p.xz) / w;
  if(u > 3.5) return vec3(0.0);
  /* Gaussian cross-section; total flux spreads as the jet widens; soft ends */
  float prof = exp(-0.5 * u * u) * (uJetW0 * uJetW0) / (w * w)
             * smoothstep(uJetBase, uJetBase + 1.0, ay) * (1.0 - smoothstep(0.5 * uJetLen, uJetLen, ay));
  /* knots: brightness pattern carried outward at βc, with a slow helical twist,
     evaluated at the time the light left, so they show apparent superluminal motion */
  float side = p.y > 0.0 ? 0.0 : 13.7;
  float ang = atan(p.z, p.x) + ay * 0.35 * sign(p.y);
  float kn = fbm3(vec3(u * 1.2 * cos(ang), u * 1.2 * sin(ang), (ay - uJetBeta * te) * 0.45 + side));
  kn = 0.3 + 1.6 * smoothstep(0.35, 0.8, kn);
  /* Doppler from the bulk flow × gravity and frame dragging (camera frame vs local ZAMO) */
  float D = 1.0 / (uJetGamma * (1.0 - uJetBeta * dot(vec3(0.0, sign(p.y), 0.0), -dir)));
  float r = Xbl.x, cs = cos(Xbl.y), sn = sin(Xbl.y), a = uA, M = uM;
  float rho2 = r * r + a * a * cs * cs, Dl = r * r - 2.0 * M * r + a * a;
  float S2 = (r * r + a * a) * (r * r + a * a) - a * a * Dl * sn * sn;
  float al = sqrt(max(rho2 * Dl / S2, 1e-6)), om = 2.0 * M * a * r / S2;
  float G = camE * al / max(1.0 - om * b, 1e-3);
  float g = clamp(D * mix(1.0, G, uRedshift), 0.0, 12.0);
  /* synchrotron-like: I ∝ g³; tint bluer when boosted, magenta when dimmed */
  vec3 tint = mix(vec3(0.95, 0.4, 0.75), JET_COLOR, smoothstep(0.08, 0.6, g));
  return tint * uJetPower * prof * kn * g * g * g * ds;
}

/* Thin sheet: emission (premultiplied rgb) + opacity at the equatorial crossing.
   d is the (backward) ray direction in scene space. */
vec4 diskSample(float r, float phi, vec3 d, float b, float camE, float te){
  float dens, flare;
  vec3 S = diskSource(r, phi, 0.0, b, camE, false, te, dens, flare);
  float alpha = 1.0 - exp(-dens * uDiskOpacity / max(abs(d.y), 0.06));
  alpha = max(alpha, min(flare, 0.9));
  return vec4(S * alpha + FLARE_COLOR * flare, alpha);
}

/* Thick flow: scale height H = uThick · R. Vertical profile is a Gaussian
   (plus an optional envelope 2× wider), normalised so a vertical column has
   the same emission depth as the thin sheet. The gas is hot and mostly
   optically thin: it absorbs only a fraction (THICK_ABSORB) of what it emits,
   so the shadow shows through the glow. Returns emission and absorption for
   a path element ds at (r, θ, φ). */
const float THICK_ABSORB = 0.3;
vec4 diskVolume(float r, float th, float ph, float ds, float b, float camE, float te){
  float Rc = sqrt(r * r + uA * uA) * sin(th), z = r * cos(th);
  float H = uThick * max(Rc, uDiskIn * 0.6);
  float zn = z / H;
  float v = exp(-0.5 * zn * zn) + uHaze * 0.5 * exp(-0.125 * zn * zn);
  if(v < 1e-3) return vec4(0.0);
  float dens, flare;
  vec3 S = diskSource(r, ph, zn, b, camE, true, te, dens, flare);
  float col = ds / (2.5066 * H * (1.0 + uHaze));
  float dtau = uDiskOpacity * dens * v * col;
  return vec4(S * (1.0 - exp(-dtau)) + FLARE_COLOR * flare * exp(-0.5 * zn * zn) * col, 1.0 - exp(-dtau * THICK_ABSORB));
}

/* Equatorial reference grid: 1 r_s rings, 30° spokes, photon orbits, ISCO */
vec3 guides(float r, float phi, float rCam){
  if(r > 24.0) return vec3(0.0);
  float w = 0.0022 * rCam + 0.008;
  float ringD = abs(fract(r + 0.5) - 0.5);
  float spokeD = abs(fract(phi / (PI / 6.0) + 0.5) - 0.5) * (PI / 6.0) * r;
  float fade = 1.0 - smoothstep(14.0, 24.0, r);
  vec3 c = vec3(0.55, 0.65, 0.75) * 0.12 * (smoothstep(w, 0.0, ringD) + smoothstep(w, 0.0, spokeD) * step(1.0, r)) * fade;
  c += vec3(0.35, 0.85, 1.0) * 1.2 * smoothstep(w * 1.6, 0.0, abs(r - uPhPro));
  if(uPhRetro - uPhPro > 0.01) c += vec3(0.35, 0.85, 1.0) * 0.55 * smoothstep(w * 1.6, 0.0, abs(r - uPhRetro));
  c += vec3(1.0, 0.62, 0.28) * 1.2 * smoothstep(w * 1.6, 0.0, abs(r - uIsco));
  return c;
}

/* world offset -> unit-sphere space of the tidally stretched probe
   (radial semi-axis scaled by a, lateral by 1/sqrt(a): volume preserved) */
vec3 probeSpace(vec3 x){
  vec3 n = uProbeAxis.xyz;
  float a = uProbeAxis.w, xn = dot(x, n);
  return (x - xn * n) * sqrt(a) + xn * n / a;
}

vec3 shadePlanet(vec3 hp, vec3 d){
  vec3 q = normalize(probeSpace(hp - uPlanet.xyz));
  vec3 ax = uProbeAxis.xyz;
  float qn = dot(q, ax);
  vec3 n = normalize((q - qn * ax) * sqrt(uProbeAxis.w) + qn * ax / uProbeAxis.w);
  vec3 L = normalize(-uPlanet.xyz);
  float lam = max(dot(n, L), 0.0);
  float tex = fbm(n * 3.5 + 11.0);
  vec3 alb = mix(vec3(0.16, 0.15, 0.14), vec3(0.42, 0.38, 0.33), tex);
  vec3 c = alb * (lam * vec3(1.0, 0.72, 0.48) * 1.4 + abs(n.y) * vec3(1.0, 0.7, 0.45) * 0.12 + 0.01);
  float rim = pow(1.0 - max(dot(n, -d), 0.0), 5.0);
  c += rim * vec3(1.0, 0.75, 0.5) * 0.35 * (0.3 + lam);
  /* redshift dims (∝ g³) and reddens; blueshift brightens and cools the tint */
  float g = clamp(uProbeG, 0.0, 3.0);
  vec3 tint = g < 1.0 ? mix(vec3(1.0, 0.18, 0.04), vec3(1.0), smoothstep(0.25, 1.0, g))
                      : mix(vec3(1.0), vec3(0.7, 0.85, 1.25), clamp(g - 1.0, 0.0, 1.0));
  return c * tint * g * g * g;
}

vec3 starSky(vec3 d){
  vec3 col = vec3(0.0);
  /* cube-face grid: one candidate star per 2D cell, kept away from cell borders */
  vec3 ad = abs(d);
  vec2 fuv; float face;
  if(ad.x >= ad.y && ad.x >= ad.z){ fuv = d.yz / ad.x; face = d.x > 0.0 ? 0.0 : 1.0; }
  else if(ad.y >= ad.z)          { fuv = d.xz / ad.y; face = d.y > 0.0 ? 2.0 : 3.0; }
  else                           { fuv = d.xy / ad.z; face = d.z > 0.0 ? 4.0 : 5.0; }
  for(int l = 0; l < 3; l++){
    float fl = float(l);
    float sc = 34.0 + fl * 38.0;
    vec2 p = fuv * sc;
    vec2 c = floor(p);
    vec3 id = vec3(c, face * 13.0 + fl * 101.0);
    float h = hash13(id);
    if(h > 0.62 + fl * 0.08){
      vec2 o = 0.3 + 0.4 * vec2(hash13(id + 11.1), hash13(id + 23.7));
      float dist = length(p - c - o);
      float mag = pow(hash13(id + 7.7), 10.0);
      float sz = 0.045 + 0.05 * mag;
      float b = exp(-dist * dist / (sz * sz)) * (0.35 + 6.0 * mag) / (1.0 + fl * 0.8);
      vec3 tint = mix(vec3(1.0, 0.74, 0.52), vec3(0.7, 0.82, 1.0), hash13(id + 3.3));
      col += tint * b;
    }
  }
  vec3 bn = normalize(vec3(0.35, 1.0, 0.2));
  float band = exp(-pow(dot(d, bn) * 3.0, 2.0));
  float neb = fbm(d * 4.0 + 2.0);
  float dust = smoothstep(0.45, 0.75, fbm(d * 9.0 + 5.0));
  col += band * (vec3(0.30, 0.25, 0.22) * neb * neb * (1.0 - 0.7 * dust) + vec3(0.02, 0.025, 0.035)) * 0.55;
  return col * uStars;
}

vec3 gridSky(vec3 d){
  vec2 g = vec2(atan(d.z, d.x), asin(clamp(d.y, -1.0, 1.0))) / PI * 18.0;
  vec2 f = abs(fract(g) - 0.5);
  float line = max(smoothstep(0.475, 0.5, f.x), smoothstep(0.475, 0.5, f.y));
  float chk = mod(floor(g.x) + floor(g.y), 2.0);
  vec3 base = mix(vec3(0.018, 0.020, 0.026), vec3(0.05, 0.055, 0.065), chk);
  base *= d.y > 0.0 ? vec3(1.15, 1.0, 0.85) : vec3(0.8, 0.95, 1.2);
  return base + line * vec3(0.22, 0.5, 0.7) * 0.22;
}

/* ------------------------------------------------------------------ */
/* Kerr null geodesics (Boyer-Lindquist), after James et al. 2015,    */
/* "Gravitational lensing by spinning black holes ... Interstellar".  */
/* State (r, θ, φ, p_r, p_θ); p_t = −1, b = p_φ and Carter q conserved. */
/* H = Δp_r²/2ρ² + p_θ²/2ρ² − (R + ΔΘ)/(2Δρ²),                       */
/* R = P² − Δ[(b − a)² + q], P = r² + a² − ab, Θ = q − cos²θ(b²/sin²θ − a²) */
/* ------------------------------------------------------------------ */

/* oblate-spheroidal map; the spin axis is the scene's +y (disk normal) */
vec3 blToCart(float r, float th, float ph){
  float s = sqrt(r * r + uA * uA) * sin(th);
  return vec3(s * cos(ph), r * cos(th), s * sin(ph));
}
vec3 cartToBL(vec3 p){
  float a2 = uA * uA, t = dot(p, p) - a2;
  float r = sqrt(max(0.5 * (t + sqrt(t * t + 4.0 * a2 * p.y * p.y)), 1e-8));
  return vec3(r, acos(clamp(p.y / r, -1.0, 1.0)), atan(p.z, p.x));
}

/* dX = (dr, dθ, dφ)/dζ, dP = (dp_r, dp_θ)/dζ */
void kerrRHS(float r, float th, float pr, float pth, float b, float q, out vec3 dX, out vec2 dP, out float dT){
  float M = uM, a = uA, a2 = a * a;
  float sn = max(sin(th), 1e-4), cs = cos(th);
  float sn2 = sn * sn, cs2 = cs * cs;
  float rho2 = r * r + a2 * cs2, ir2 = 1.0 / rho2, ir4 = ir2 * ir2;
  float Dl = r * r - 2.0 * M * r + a2, Dc = max(Dl, 1e-6);
  float Pp = r * r + a2 - a * b;
  float K = (b - a) * (b - a) + q;
  float R = Pp * Pp - Dl * K;
  float Th = q - cs2 * (b * b / sn2 - a2);

  dX = vec3(Dl * ir2 * pr, pth * ir2, (a * Pp / Dc + (b - a) + b * cs2 / sn2) * ir2);
  /* coordinate time: ρ² dt/dζ = (r² + a²)P/Δ − a(a sin²θ − b) */
  dT = ((r * r + a2) * Pp / Dc - a * (a * sn2 - b)) * ir2;

  float dD = 2.0 * r - 2.0 * M;
  float dR = 4.0 * r * Pp - dD * K;
  float dAr = (dD * rho2 - 2.0 * r * Dl) * 0.5 * ir4;
  float dBr = -r * ir4;
  float dCr = 0.5 * dR * ir2 / Dc - 0.5 * R * (dD * rho2 + 2.0 * r * Dl) * ir4 / (Dc * Dc) - Th * r * ir4;

  float drho = -2.0 * a2 * cs * sn;
  float dTh = 2.0 * cs * (b * b / (sn2 * sn) - a2 * sn);
  float dAt = -0.5 * Dl * drho * ir4;
  float dBt = -0.5 * drho * ir4;
  float dCt = -0.5 * R * drho * ir4 / Dc + 0.5 * dTh * ir2 - 0.5 * Th * drho * ir4;

  dP = vec2(-(dAr * pr * pr + dBr * pth * pth - dCr),
            -(dAt * pr * pr + dBt * pth * pth - dCt));
}

void kerrStep(inout vec3 X, inout vec2 Pm, inout float T, float b, float q, float h){
  vec3 k1x, k2x, k3x, k4x; vec2 k1p, k2p, k3p, k4p; float k1t, k2t, k3t, k4t;
  kerrRHS(X.x, X.y, Pm.x, Pm.y, b, q, k1x, k1p, k1t);
  vec3 X2 = X + 0.5 * h * k1x; vec2 P2 = Pm + 0.5 * h * k1p;
  kerrRHS(X2.x, X2.y, P2.x, P2.y, b, q, k2x, k2p, k2t);
  vec3 X3 = X + 0.5 * h * k2x; vec2 P3 = Pm + 0.5 * h * k2p;
  kerrRHS(X3.x, X3.y, P3.x, P3.y, b, q, k3x, k3p, k3t);
  vec3 X4 = X + h * k3x; vec2 P4 = Pm + h * k3p;
  kerrRHS(X4.x, X4.y, P4.x, P4.y, b, q, k4x, k4p, k4t);
  X += h / 6.0 * (k1x + 2.0 * k2x + 2.0 * k3x + k4x);
  Pm += h / 6.0 * (k1p + 2.0 * k2p + 2.0 * k3p + k4p);
  T -= h / 6.0 * (k1t + 2.0 * k2t + 2.0 * k3t + k4t);   // h < 0: light travel time grows
  /* a ray through the axis comes out on the other side */
  if(X.y < 0.0){ X.y = -X.y; X.z += PI; Pm.y = -Pm.y; }
  else if(X.y > PI){ X.y = 2.0 * PI - X.y; X.z += PI; Pm.y = -Pm.y; }
}

vec3 sky(vec3 d){
  if(uSky == 0) return starSky(d);
  if(uSky == 1) return gridSky(d);
  return vec3(0.0);
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y) - uShift;
  vec3 rd = normalize(uCamRot * vec3(uv * 2.0 * uTanFov, 1.0));

  /* Moving observer: rd is a viewing direction in the camera's own frame.
     Aberration maps it to the static frame the tracer works in (light ahead
     of the motion gets bunched into a smaller patch of sky). D is the
     Doppler factor ν_seen / ν_static for this direction. */
  float D = 1.0;
  float b2 = dot(uObsBeta, uObsBeta);
  if(b2 > 1e-8){
    float gb = inversesqrt(1.0 - b2);
    vec3 bh = uObsBeta * inversesqrt(b2);
    D = 1.0 / (gb * (1.0 - dot(uObsBeta, rd)));
    rd = normalize(rd + (gb - 1.0) * dot(rd, bh) * bh - gb * uObsBeta);
  }

  /* ---- camera in Boyer-Lindquist, frame of the zero-angular-momentum observer */
  vec3 X = cartToBL(uCamPos);
  float rCam = length(uCamPos);
  float a = uA, a2 = a * a, M = uM;
  float cr = X.x, sn = sin(X.y), cs = cos(X.y);
  float sq = sqrt(cr * cr + a2);
  vec3 er = normalize(vec3(cr / sq * sn * cos(X.z), cs, cr / sq * sn * sin(X.z)));
  vec3 et = normalize(vec3(sq * cs * cos(X.z), -cr * sn, sq * cs * sin(X.z)));
  vec3 ep = vec3(-sin(X.z), 0.0, cos(X.z));
  float rho2 = cr * cr + a2 * cs * cs, Dl = cr * cr - 2.0 * M * cr + a2;
  float S2 = (cr * cr + a2) * (cr * cr + a2) - a2 * Dl * sn * sn;
  float lapse = sqrt(rho2 * Dl / S2), drag = 2.0 * M * a * cr / S2, varpi = sqrt(S2 / rho2) * sn;

  /* the arriving photon travels along n = −rd; build its momentum, then trace it back */
  vec3 n = -rd;
  float nr = dot(n, er), nt = dot(n, et), np = dot(n, ep);
  float camE = 1.0 / (lapse + drag * varpi * np);          // energy seen by the camera frame
  vec2 Pm = vec2(camE * sqrt(rho2 / Dl) * nr, camE * sqrt(rho2) * nt);
  float b = camE * varpi * np;
  /* rays that skim the spin axis this closely are taken through it exactly:
     the θ equation is too stiff to resolve there, and the error is sub-pixel */
  if(abs(b) < 2e-3) b = 0.0;
  float q = Pm.y * Pm.y + cs * cs * (b * b / max(sn * sn, 1e-8) - a2);

  vec3 col = vec3(0.0);
  float alpha = 0.0, T = 0.0;     // T: light travel time (coordinate time) back from the camera
  bool captured = false, escaped = false;
  vec3 cPrev = blToCart(X.x, X.y, X.z), dirOut = rd;

  bool thick = uThick > 0.001 && uDiskOn > 0.5;
  /* per-pixel offset of the volume samples along each step (interleaved gradient
     noise): turns banding into a fine, even grain */
  float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  /* rays crossing the gas, or passing near the spin axis, need many short
     steps; the extra budget is only spent by rays that need it */
  int budget = uMaxSteps * (thick ? 3 : 1) + (uJetOn > 0.5 ? 512 : 256);

  for(int i = 0; i < 3600; i++){
    if(i >= budget) break;
    if(X.x < uRCapture){ captured = true; break; }

    vec3 X0 = X;
    float T0 = T;
    /* adaptive step: proportional to r, but never moving r more than a quarter
       of the way to the horizon (p_r grows like 1/Δ there), and finer near the
       axis where the θ equation stiffens */
    float rdot = (X.x * X.x - 2.0 * M * X.x + a2) / (X.x * X.x + a2 * cos(X.y) * cos(X.y)) * Pm.x;
    float h = min(clamp(uStepK * 1.6 * X.x, 0.004, 4.0),
                  0.25 * max(X.x - uRCapture + 0.02, 1e-4) / max(abs(rdot), 1e-6));
    if(thick){
      /* inside (or near) the gas, step a fraction of a scale height */
      float Rc = sqrt(X.x * X.x + a2) * sin(X.y), zc = X.x * cos(X.y);
      float Hc = uThick * max(Rc, uDiskIn * 0.6);
      if(Rc < uDiskOut * 1.1 && abs(zc) < Hc * (3.5 + uHaze * 4.0)) h = min(h, max(0.4 * Hc, 0.006));
    }
    if(b != 0.0){
      /* near the spin axis the θ equation stiffens (b²/sin³θ): limit the angular
         change per step to a fraction of sinθ, whatever the quality setting */
      float snA = max(sin(X.y), 1e-4);
      float w = sqrt(Pm.y * Pm.y + b * b / (snA * snA));
      h = min(h, 0.3 * snA * (X.x * X.x + a2 * cos(X.y) * cos(X.y)) / max(w, 1e-6));
    }
    if(uJetOn > 0.5){
      /* inside or near a jet, step a fraction of its width */
      float ayj = abs(cPrev.y), wj = jetWidth(ayj);
      if(ayj < uJetLen * 1.05 && length(cPrev.xz) < 4.0 * wj) h = min(h, max(0.35 * wj, 0.01));
    }
    h = -h;
    kerrStep(X, Pm, T, b, q, h);
    if(!(X.x > 0.0) || !(abs(Pm.x) < 1e8) || !(abs(Pm.y) < 1e8) || !(abs(X.z) < 1e6)){ captured = true; break; }
    vec3 c1 = blToCart(X.x, X.y, X.z);
    vec3 seg = c1 - cPrev;
    if(dot(seg, seg) > 1e-12) dirOut = normalize(seg);

    float tDisk = 2.0, tPlan = 2.0;
    float cs0 = cos(X0.y), cs1 = cos(X.y);
    if(cs0 * cs1 < 0.0) tDisk = cs0 / (cs0 - cs1);
    if(uPlanetOn > 0.5){
      /* segment vs. stretched ellipsoid, solved in the probe's sphere space */
      vec3 o = probeSpace(cPrev - uPlanet.xyz);
      vec3 e = probeSpace(seg);
      float A = dot(e, e), B = dot(o, e), C = dot(o, o) - uPlanet.w * uPlanet.w;
      float disc = B * B - A * C;
      if(disc > 0.0){
        float s = (-B - sqrt(disc)) / A;
        if(s >= 0.0 && s <= 1.0) tPlan = s;
        else if(C < 0.0) tPlan = 0.0;
      }
    }

    if(tDisk <= 1.0 && tDisk < tPlan){
      float rh = mix(X0.x, X.x, tDisk), ph = mix(X0.z, X.z, tDisk);
      if(uGuides > 0.5) col += (1.0 - alpha * 0.8) * guides(rh, ph, rCam);
      if(uDiskOn > 0.5 && !thick){
        vec4 sm = diskSample(rh, ph, dirOut, b, camE, uTime - (mix(T0, T, tDisk) - uDelayRef));
        col += (1.0 - alpha) * sm.rgb;
        alpha += (1.0 - alpha) * sm.a;
      }
    }
    if(thick){
      /* two stratified samples per step, each covering half of it */
      float span = min(1.0, tPlan), dsh = 0.5 * length(seg) * span;
      for(int k = 0; k < 2; k++){
        float ts = (float(k) + jitter) * 0.5 * span;
        vec4 sm = diskVolume(mix(X0.x, X.x, ts), mix(X0.y, X.y, ts), mix(X0.z, X.z, ts), dsh, b, camE,
                             uTime - (mix(T0, T, ts) - uDelayRef));
        col += (1.0 - alpha) * sm.rgb;
        alpha += (1.0 - alpha) * sm.a;
      }
    }
    if(uJetOn > 0.5){
      float span = min(1.0, tPlan), ts = jitter * span;
      col += (1.0 - alpha) * jetEmission(mix(cPrev, c1, ts), mix(X0, X, ts), dirOut, b, camE,
                                         uTime - (mix(T0, T, ts) - uDelayRef), length(seg) * span);
    }
    if(tPlan <= 1.0){
      vec3 hp = mix(cPrev, c1, tPlan);
      col += (1.0 - alpha) * shadePlanet(hp, dirOut);
      alpha = 1.0;
      break;
    }
    if(alpha > 0.995) break;
    if(X.x > uEscape && X.x > X0.x){ escaped = true; break; }
    cPrev = c1;
  }

  if(!captured && alpha < 1.0){
    float fade = escaped ? 1.0 : smoothstep(2.0, 6.0, X.x);
    col += (1.0 - alpha) * sky(dirOut) * fade;
  }
  if(uObsBeam > 0.5 && D != 1.0){
    /* bolometric intensity ∝ D⁴, auto-exposed so the brightest direction
       does not saturate; hue pushed blue ahead, red behind */
    col *= min(D * D * D * D, 1e4) * uObsExpo;
    col *= D > 1.0 ? mix(vec3(1.0), vec3(0.72, 0.88, 1.3), clamp((D - 1.0) * 0.8, 0.0, 1.0))
                   : mix(vec3(1.0), vec3(1.25, 0.55, 0.3), clamp((1.0 - D) * 1.6, 0.0, 1.0));
  }
  fragColor = vec4(col, 1.0);
}`;

/* ------------------------------------------------------------------ */
/* Bloom chain                                                         */
/* ------------------------------------------------------------------ */
SHADERS.prefilter = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform vec2 uTexel; uniform float uThreshold; uniform float uKnee;
void main(){
  vec3 c = (texture(uTex, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture(uTex, vUv + uTexel * vec2(1.0, -1.0)).rgb +
            texture(uTex, vUv + uTexel * vec2(-1.0,  1.0)).rgb + texture(uTex, vUv + uTexel * vec2(1.0,  1.0)).rgb) * 0.25;
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-4);
  float w = max(soft, br - uThreshold) / max(br, 1e-4);
  o = vec4(min(c * w, vec3(60.0)), 1.0);
}`;

SHADERS.down = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform vec2 uTexel;
void main(){
  o = vec4((texture(uTex, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture(uTex, vUv + uTexel * vec2(1.0, -1.0)).rgb +
            texture(uTex, vUv + uTexel * vec2(-1.0,  1.0)).rgb + texture(uTex, vUv + uTexel * vec2(1.0,  1.0)).rgb) * 0.25, 1.0);
}`;

SHADERS.blur = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform vec2 uDir;
void main(){
  vec3 c = texture(uTex, vUv).rgb * 0.2270270270;
  c += (texture(uTex, vUv + uDir * 1.3846153846).rgb + texture(uTex, vUv - uDir * 1.3846153846).rgb) * 0.3162162162;
  c += (texture(uTex, vUv + uDir * 3.2307692308).rgb + texture(uTex, vUv - uDir * 3.2307692308).rgb) * 0.0702702703;
  o = vec4(c, 1.0);
}`;

SHADERS.composite = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uScene, uB0, uB1, uB2, uB3, uB4;
uniform float uBloom, uExposure, uGrain, uTime, uVignette;
uniform vec2 uRes;

vec3 aces(vec3 x){
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

void main(){
  vec2 uv = vUv;
  vec2 cc = uv - 0.5;
  float ca = 0.004 * dot(cc, cc);
  vec3 c;
  c.r = texture(uScene, uv - cc * ca).r;
  c.g = texture(uScene, uv).g;
  c.b = texture(uScene, uv + cc * ca).b;
  if(uBloom > 0.0){
    vec3 b = texture(uB0, uv).rgb * 0.35 + texture(uB1, uv).rgb * 0.45 + texture(uB2, uv).rgb * 0.6 +
             texture(uB3, uv).rgb * 0.75 + texture(uB4, uv).rgb * 0.9;
    c += b * uBloom * 0.22;
  }
  c *= uExposure;
  c = aces(c);
  vec2 vc = cc * vec2(uRes.x / uRes.y, 1.0);
  c *= mix(1.0, smoothstep(1.15, 0.25, length(vc)), uVignette);
  c = pow(c, vec3(1.0 / 2.2));
  c += (hash12(gl_FragCoord.xy + fract(uTime * 7.13) * 917.0) - 0.5) * uGrain * (3.0 / 255.0);
  o = vec4(c, 1.0);
}`;
