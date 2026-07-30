#version 300 es
precision highp float;

// QuickPix pointwise adjustment pass. Mirrors src/shared/editMath.ts — any
// change here must be reflected there so preview and export stay identical.

uniform sampler2D u_image;
uniform sampler2D u_curve; // 256x1 RGBA LUT, identity when no curve is set

uniform float u_exposure;   // EV stops
uniform float u_contrast;   // -1..1
uniform float u_highlights; // -1..1
uniform float u_shadows;    // -1..1
uniform float u_whites;     // -1..1
uniform float u_blacks;     // -1..1
uniform float u_temp;       // -1..1
uniform float u_tint;       // -1..1
uniform float u_vibrance;   // -1..1
uniform float u_saturation; // -1..1
uniform float u_vignette;   // -1..1 (negative darkens corners)
uniform float u_grain;      // 0..1

in vec2 v_uv;
out vec4 outColor;

vec3 srgb2lin(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }
vec3 lin2srgb(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec4 tex = texture(u_image, v_uv);
  vec3 c = srgb2lin(tex.rgb);

  // --- White balance (linear) ---
  c.r *= 1.0 + 0.25 * u_temp;
  c.b *= 1.0 - 0.25 * u_temp;
  c.g *= 1.0 - 0.20 * u_tint;

  // --- Exposure (linear) ---
  c *= exp2(u_exposure);

  // --- Highlights / shadows: luminance-masked scaling in linear ---
  float l = luma(c);
  float highlightMask = smoothstep(0.35, 1.0, l);
  float shadowMask = 1.0 - smoothstep(0.0, 0.45, l);
  float lNew = l;
  lNew += u_highlights * highlightMask * 0.6 * l;
  lNew += u_shadows * shadowMask * 0.35 * (1.0 - min(l, 1.0));
  if (l > 1e-5) c *= lNew / l;

  c = lin2srgb(c);

  // --- Whites / blacks: endpoint levels in gamma space ---
  float whitePoint = 1.0 - 0.25 * u_whites;
  float blackPoint = -0.25 * u_blacks;
  c = (c - blackPoint) / max(whitePoint - blackPoint, 0.05);

  // --- Contrast: blend toward an S-curve (+) or toward flat (-) ---
  vec3 sCurve = c * c * (3.0 - 2.0 * clamp(c, 0.0, 1.0));
  c = mix(c, sCurve, clamp(u_contrast, 0.0, 1.0));
  c = mix(c, vec3(0.5) + (c - 0.5) * 0.75, clamp(-u_contrast, 0.0, 1.0));

  // --- Vibrance: boosts muted colors more than saturated ones ---
  float lu = luma(c);
  float satLevel = clamp((max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b))) * 1.5, 0.0, 1.0);
  c = mix(vec3(lu), c, 1.0 + u_vibrance * (1.0 - satLevel));

  // --- Saturation ---
  lu = luma(c);
  c = mix(vec3(lu), c, 1.0 + u_saturation);

  c = clamp(c, 0.0, 1.0);

  // --- Tone curve LUT (master baked into per-channel entries) ---
  c.r = texture(u_curve, vec2(c.r * (255.0 / 256.0) + 0.5 / 256.0, 0.5)).r;
  c.g = texture(u_curve, vec2(c.g * (255.0 / 256.0) + 0.5 / 256.0, 0.5)).g;
  c.b = texture(u_curve, vec2(c.b * (255.0 / 256.0) + 0.5 / 256.0, 0.5)).b;

  // --- Vignette (radial, after tone) ---
  vec2 p = v_uv - 0.5;
  float dist = length(p) * 1.41421356;
  float vig = 1.0 + u_vignette * smoothstep(0.4, 1.05, dist) * 0.85;
  c *= clamp(vig, 0.0, 2.0);

  // --- Film grain ---
  if (u_grain > 0.0) {
    float g = (hash(floor(v_uv * 900.0) + 0.07) - 0.5) * u_grain * 0.18;
    c += g * (0.35 + 0.65 * (1.0 - luma(c))); // grain shows more in shadows, like film
  }

  outColor = vec4(clamp(c, 0.0, 1.0), tex.a);
}
