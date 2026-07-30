#version 300 es
precision highp float;

// Detail pass: sharpen (small-radius unsharp mask via 3x3 neighborhood) and
// clarity (midtone local contrast via mipmap-blurred luminance). Runs on the
// output of the adjust pass. Skipped entirely when both amounts are zero.

uniform sampler2D u_tex; // adjust-pass result, mipmapped
uniform vec2 u_texel;    // 1 / texture size
uniform float u_sharpen; // 0..1
uniform float u_clarity; // -1..1
uniform float u_clarityLod;

in vec2 v_uv;
out vec4 outColor;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main() {
  vec4 tex = texture(u_tex, v_uv);
  vec3 c = tex.rgb;

  if (u_sharpen > 0.0) {
    vec3 n = texture(u_tex, v_uv + vec2(0.0, u_texel.y)).rgb;
    vec3 s = texture(u_tex, v_uv - vec2(0.0, u_texel.y)).rgb;
    vec3 e = texture(u_tex, v_uv + vec2(u_texel.x, 0.0)).rgb;
    vec3 w = texture(u_tex, v_uv - vec2(u_texel.x, 0.0)).rgb;
    vec3 blurred = (c * 4.0 + n + s + e + w) * 0.125;
    c += (c - blurred) * u_sharpen * 3.0;
  }

  if (u_clarity != 0.0) {
    float l = luma(c);
    float low = luma(textureLod(u_tex, v_uv, u_clarityLod).rgb);
    float detail = l - low;
    float midtoneWeight = 1.0 - abs(l * 2.0 - 1.0); // strongest at 50% gray
    float lNew = l + detail * u_clarity * 1.2 * midtoneWeight;
    if (l > 1e-5) c *= clamp(lNew, 0.0, 1.5) / l;
  }

  outColor = vec4(clamp(c, 0.0, 1.0), tex.a);
}
