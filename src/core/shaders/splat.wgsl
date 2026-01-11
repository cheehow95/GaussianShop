// Gaussian Splatting WGSL Shader
// Implements rendering and GPU-accelerated sorting of 3D Gaussians

// Uniform buffer for camera matrices and settings
struct Uniforms {
  viewMatrix: mat4x4f,
  projMatrix: mat4x4f,
  viewportSize: vec2f,
  focal: vec2f,
  tanFov: vec2f,
  near: f32,
  far: f32,
  time: f32,
  shDegree: u32,
}

// Gaussian splat data structure
struct Gaussian {
  position: vec3f,
  opacity: f32,
  scale: vec3f,
  _pad1: f32,
  rotation: vec4f, // quaternion
  sh: array<vec3f, 16>, // spherical harmonics coefficients
}

// Packed Gaussian for efficient GPU storage
struct PackedGaussian {
  posOpacity: vec4f,       // xyz = position, w = opacity
  scaleRotation: vec4f,    // xyz = scale (log), w = rotation index lookup
  rot: vec4f,              // quaternion rotation
  color: vec4f,            // computed color (RGB + alpha)
}

// Sort key for depth sorting
struct SortKey {
  depth: f32,
  index: u32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> gaussians: array<PackedGaussian>;
@group(0) @binding(2) var<storage, read> sortedKeys: array<SortKey>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
  @location(1) conic: vec3f,
  @location(2) centerScreenPos: vec2f,
  @location(3) quadPos: vec2f,
}

// Compute covariance matrix from scale and rotation
fn computeCov3D(scale: vec3f, rot: vec4f) -> mat3x3f {
  let s = exp(scale);
  let S = mat3x3f(
    vec3f(s.x, 0.0, 0.0),
    vec3f(0.0, s.y, 0.0),
    vec3f(0.0, 0.0, s.z)
  );
  
  // Normalize quaternion
  let q = normalize(rot);
  let r = q.x; let x = q.y; let y = q.z; let z = q.w;
  
  // Rotation matrix from quaternion
  let R = mat3x3f(
    vec3f(1.0 - 2.0*(y*y + z*z), 2.0*(x*y - r*z), 2.0*(x*z + r*y)),
    vec3f(2.0*(x*y + r*z), 1.0 - 2.0*(x*x + z*z), 2.0*(y*z - r*x)),
    vec3f(2.0*(x*z - r*y), 2.0*(y*z + r*x), 1.0 - 2.0*(x*x + y*y))
  );
  
  let M = S * R;
  return M * transpose(M);
}

// Compute 2D covariance from 3D covariance
fn computeCov2D(mean3D: vec3f, cov3D: mat3x3f) -> vec3f {
  let viewPos = (uniforms.viewMatrix * vec4f(mean3D, 1.0)).xyz;
  
  let limx = 1.3 * uniforms.tanFov.x;
  let limy = 1.3 * uniforms.tanFov.y;
  let txtz = viewPos.x / viewPos.z;
  let tytz = viewPos.y / viewPos.z;
  let tx = min(limx, max(-limx, txtz)) * viewPos.z;
  let ty = min(limy, max(-limy, tytz)) * viewPos.z;
  
  let J = mat3x3f(
    vec3f(uniforms.focal.x / viewPos.z, 0.0, 0.0),
    vec3f(0.0, uniforms.focal.y / viewPos.z, 0.0),
    vec3f(-uniforms.focal.x * tx / (viewPos.z * viewPos.z), -uniforms.focal.y * ty / (viewPos.z * viewPos.z), 0.0)
  );
  
  let W = mat3x3f(
    uniforms.viewMatrix[0].xyz,
    uniforms.viewMatrix[1].xyz,
    uniforms.viewMatrix[2].xyz
  );
  
  let T = W * J;
  let cov = transpose(T) * cov3D * T;
  
  // Extract 2D covariance (upper-left 2x2)
  let cov2D = vec3f(cov[0][0] + 0.3, cov[0][1], cov[1][1] + 0.3);
  return cov2D;
}

// Compute SH color
fn computeSHColor(position: vec3f, sh0: vec3f) -> vec3f {
  // For now, just use DC component (SH degree 0)
  let SH_C0 = 0.28209479177387814;
  return max(vec3f(0.0), sh0 * SH_C0 + 0.5);
}

@vertex
fn vs_main(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32,
) -> VertexOutput {
  var output: VertexOutput;
  
  // Get sorted Gaussian index from depth key
  let gaussianIdx = sortedKeys[instanceIndex].index;
  let gaussian = gaussians[gaussianIdx];
  
  // Quad vertices (two triangles)
  let quadPositions = array<vec2f, 6>(
    vec2f(-1.0, -1.0),
    vec2f(1.0, -1.0),
    vec2f(1.0, 1.0),
    vec2f(-1.0, -1.0),
    vec2f(1.0, 1.0),
    vec2f(-1.0, 1.0)
  );
  
  let quadPos = quadPositions[vertexIndex];
  let position = gaussian.posOpacity.xyz;
  let opacity = gaussian.posOpacity.w;
  let scale = gaussian.scaleRotation.xyz;
  let rotation = gaussian.rot;
  
  // Compute 3D and 2D covariance
  let cov3D = computeCov3D(scale, rotation);
  let cov2D = computeCov2D(position, cov3D);
  
  // Compute conic (inverse of 2D covariance)
  let det = cov2D.x * cov2D.z - cov2D.y * cov2D.y;
  if (det <= 0.0) {
    output.position = vec4f(0.0, 0.0, 2.0, 1.0); // Behind camera
    return output;
  }
  let detInv = 1.0 / det;
  let conic = vec3f(cov2D.z * detInv, -cov2D.y * detInv, cov2D.x * detInv);
  
  // Compute eigenvalues for splat size
  let mid = 0.5 * (cov2D.x + cov2D.z);
  let lambda1 = mid + sqrt(max(0.1, mid * mid - det));
  let lambda2 = mid - sqrt(max(0.1, mid * mid - det));
  let radius = ceil(3.0 * sqrt(max(lambda1, lambda2)));
  
  // Project center to screen
  let viewPos = uniforms.viewMatrix * vec4f(position, 1.0);
  let clipPos = uniforms.projMatrix * viewPos;
  let ndcPos = clipPos.xyz / clipPos.w;
  let screenPos = vec2f(
    (ndcPos.x * 0.5 + 0.5) * uniforms.viewportSize.x,
    (ndcPos.y * 0.5 + 0.5) * uniforms.viewportSize.y
  );
  
  // Offset quad vertex by radius
  let vertexScreenPos = screenPos + quadPos * radius;
  let vertexNDC = vec2f(
    (vertexScreenPos.x / uniforms.viewportSize.x) * 2.0 - 1.0,
    (vertexScreenPos.y / uniforms.viewportSize.y) * 2.0 - 1.0
  );
  
  // Compute color from spherical harmonics
  let color = gaussian.color.rgb;
  
  output.position = vec4f(vertexNDC, ndcPos.z, 1.0);
  output.color = vec4f(color, opacity);
  output.conic = conic;
  output.centerScreenPos = screenPos;
  output.quadPos = quadPos * radius;
  
  return output;
}

struct FragmentOutput {
  @location(0) color: vec4f,
  @location(1) depth: f32,  // Linear depth for GI sampling
}

@fragment
fn fs_main(input: VertexOutput) -> FragmentOutput {
  var output: FragmentOutput;
  
  // Compute offset from center
  let d = input.quadPos;
  
  // Compute Gaussian weight using conic
  let power = -0.5 * (input.conic.x * d.x * d.x + input.conic.z * d.y * d.y) - input.conic.y * d.x * d.y;
  
  if (power > 0.0) {
    discard;
  }
  
  let alpha = min(0.99, input.color.a * exp(power));
  
  if (alpha < 1.0 / 255.0) {
    discard;
  }
  
  output.color = vec4f(input.color.rgb * alpha, alpha);
  output.depth = input.position.z;  // NDC depth for reconstruction
  
  return output;
}
