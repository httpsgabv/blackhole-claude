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

/* Emission (premultiplied rgb) + opacity of the thin disk at equatorial hit p, ray dir d */
vec4 diskSample(vec3 p, vec3 d, float rCam){
  float r = length(p.xz);
  if(r < uDiskIn * 0.8 || r > uDiskOut) return vec4(0.0);
  float x = (r - uDiskIn) / (uDiskOut - uDiskIn);

  float inner = smoothstep(uDiskIn * 0.82, uDiskIn * 1.06, r);
  float outer = 1.0 - smoothstep(0.3, 1.0, x);

  /* Keplerian angular velocity Ω = sqrt(M / r³), M = 0.5 */
  float omega = sqrt(0.5 / (r * r * r)) * uSpin;
  float phi = atan(p.z, p.x);

  /* flow-map style: two phase-shifted layers so differential shear never winds up */
  const float P = 140.0;
  float t1 = mod(uTime, P), t2 = mod(uTime + 0.5 * P, P);
  float w1 = 1.0 - abs(2.0 * t1 / P - 1.0);
  float n = diskLayer(r, phi - omega * t1, 0.0) * w1 + diskLayer(r, phi - omega * t2, 7.31) * (1.0 - w1);
  n = (n - 0.5) / sqrt(w1 * w1 + (1.0 - w1) * (1.0 - w1)) + 0.5;

  float tex = smoothstep(0.18, 0.82, n);
  float dens = inner * outer * mix(1.0, tex * 1.7 + 0.04, uTurb);

  /* Novikov-Thorne-like temperature profile, normalised to peak = 1 */
  float rr = max(r / uDiskIn, 1.0001);
  float f = pow(rr, -0.75) * pow(1.0 - sqrt(1.0 / rr), 0.25) / 0.488;
  f = max(f, 0.18 * inner);

  /* Relativistic Doppler + gravitational redshift */
  vec3 vdir = normalize(vec3(-p.z, 0.0, p.x)) * uSpin;
  float beta = clamp(sqrt(0.5 / max(r - 1.0, 0.05)), 0.0, 0.95) * uDoppler;
  float gam = inversesqrt(1.0 - beta * beta);
  float delta = 1.0 / (gam * (1.0 - beta * dot(vdir, -d)));
  float grav = sqrt(max(1.0 - 1.0 / r, 1e-3)) / sqrt(max(1.0 - 1.0 / rCam, 1e-3));
  float g = delta * mix(1.0, grav, uRedshift);
  float g4 = g * g * g * g;

  float alpha = 1.0 - exp(-dens * uDiskOpacity / max(abs(d.y), 0.06));
  vec3 hue = uPalette > 0.5 ? blackbody(uDiskTemp * f * g) : cineRamp(f * g);
  float streak = mix(1.0, 0.3 + 1.2 * tex, uTurb);
  float I = uDiskBright * (0.15 + f * f) * g4 * 2.2 * streak;
  return vec4(hue * I * alpha, alpha);
}

/* Equatorial reference grid: 1 r_s rings, 30° spokes, photon sphere, ISCO */
vec3 guides(vec3 p, float rCam){
  float r = length(p.xz);
  if(r > 24.0) return vec3(0.0);
  float w = 0.0022 * rCam + 0.008;
  float phi = atan(p.z, p.x);
  float ringD = abs(fract(r + 0.5) - 0.5);
  float spokeD = abs(fract(phi / (PI / 6.0) + 0.5) - 0.5) * (PI / 6.0) * r;
  float fade = 1.0 - smoothstep(14.0, 24.0, r);
  vec3 c = vec3(0.55, 0.65, 0.75) * 0.12 * (smoothstep(w, 0.0, ringD) + smoothstep(w, 0.0, spokeD) * step(1.0, r)) * fade;
  c += vec3(0.35, 0.85, 1.0) * 1.2 * smoothstep(w * 1.6, 0.0, abs(r - 1.5));
  c += vec3(1.0, 0.62, 0.28) * 1.2 * smoothstep(w * 1.6, 0.0, abs(r - 3.0));
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

vec3 sky(vec3 d){
  if(uSky == 0) return starSky(d);
  if(uSky == 1) return gridSky(d);
  return vec3(0.0);
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y) - uShift;
  vec3 rd = normalize(uCamRot * vec3(uv * 2.0 * uTanFov, 1.0));

  vec3 pos = uCamPos, vel = rd;
  float rCam = length(uCamPos);
  vec3 hv = cross(pos, vel);
  /* photon orbit eq. u'' + u = 3/2 r_s u² <=> x'' = -3/2 h² x / r⁵ */
  float k = -1.5 * dot(hv, hv) * uGravity;

  vec3 col = vec3(0.0);
  float alpha = 0.0;
  bool captured = false, escaped = false;

  for(int i = 0; i < 1200; i++){
    if(i >= uMaxSteps) break;
    float r = length(pos);
    if(r < 1.0){ captured = true; break; }
    if(r > uEscape && dot(pos, vel) > 0.0){ escaped = true; break; }

    float dt = max(uStepK * r, 0.01);
    vec3 acc = k * pos / pow(r, 5.0);
    vec3 np = pos + vel * dt + 0.5 * acc * dt * dt;
    vec3 nacc = k * np / pow(length(np), 5.0);
    vec3 nv = vel + 0.5 * (acc + nacc) * dt;

    float tDisk = 2.0, tPlan = 2.0;
    if(pos.y * np.y < 0.0) tDisk = pos.y / (pos.y - np.y);
    if(uPlanetOn > 0.5){
      /* segment vs. stretched ellipsoid, solved in the probe's sphere space */
      vec3 o = probeSpace(pos - uPlanet.xyz);
      vec3 e = probeSpace(np - pos);
      float A = dot(e, e), B = dot(o, e), C = dot(o, o) - uPlanet.w * uPlanet.w;
      float disc = B * B - A * C;
      if(disc > 0.0){
        float s = (-B - sqrt(disc)) / A;
        if(s >= 0.0 && s <= 1.0) tPlan = s;
        else if(C < 0.0) tPlan = 0.0;
      }
    }

    if(tDisk <= 1.0 && tDisk < tPlan){
      vec3 hp = mix(pos, np, tDisk);
      vec3 hd = normalize(mix(vel, nv, tDisk));
      if(uGuides > 0.5) col += (1.0 - alpha * 0.8) * guides(hp, rCam);
      if(uDiskOn > 0.5){
        vec4 s = diskSample(hp, hd, rCam);
        col += (1.0 - alpha) * s.rgb;
        alpha += (1.0 - alpha) * s.a;
      }
    }
    if(tPlan <= 1.0){
      vec3 hp = mix(pos, np, tPlan);
      col += (1.0 - alpha) * shadePlanet(hp, normalize(mix(vel, nv, tPlan)));
      alpha = 1.0;
      break;
    }
    if(alpha > 0.995) break;
    pos = np; vel = nv;
  }

  if(!captured && alpha < 1.0){
    float fade = escaped ? 1.0 : smoothstep(2.0, 6.0, length(pos));
    col += (1.0 - alpha) * sky(normalize(vel)) * fade;
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
