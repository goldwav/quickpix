#version 300 es
// Fullscreen triangle — covers the viewport with 3 vertices, no buffers needed.
out vec2 v_uv;
uniform float u_flipY;

void main() {
  vec2 pos = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = vec2(pos.x, mix(pos.y, 1.0 - pos.y, u_flipY));
  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
}
