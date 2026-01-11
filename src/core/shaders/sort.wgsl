// GPU-accelerated radix sort compute shader for depth sorting Gaussians
// Uses a parallel prefix-sum based bitonic sort

struct SortParams {
  numGaussians: u32,
  stage: u32,
  passOfStage: u32,
  _pad: u32,
}

struct DepthKey {
  depth: f32,
  index: u32,
}

@group(0) @binding(0) var<uniform> params: SortParams;
@group(0) @binding(1) var<storage, read_write> depthKeys: array<DepthKey>;

// Bitonic sort compare and swap
fn compareAndSwap(i: u32, j: u32, dir: bool) {
  let keyI = depthKeys[i];
  let keyJ = depthKeys[j];
  
  // Sort back-to-front (larger depth first)
  let shouldSwap = (keyI.depth < keyJ.depth) == dir;
  
  if (shouldSwap) {
    depthKeys[i] = keyJ;
    depthKeys[j] = keyI;
  }
}

@compute @workgroup_size(256)
fn cs_sort_step(@builtin(global_invocation_id) globalId: vec3u) {
  let tid = globalId.x;
  if (tid >= params.numGaussians / 2) {
    return;
  }
  
  let stageSize = 1u << params.stage;
  let halfStageSize = stageSize >> 1u;
  let blockId = tid / halfStageSize;
  let inBlockId = tid % halfStageSize;
  
  var j: u32;
  if (params.passOfStage == 0u) {
    // First pass of stage - long swap
    j = blockId * stageSize + inBlockId;
  } else {
    // Subsequent passes - shorter swaps
    let subStageSize = stageSize >> params.passOfStage;
    let subBlockId = inBlockId / (subStageSize >> 1u);
    let inSubBlockId = inBlockId % (subStageSize >> 1u);
    j = blockId * stageSize + subBlockId * subStageSize + inSubBlockId;
  }
  
  let partner = j + (stageSize >> params.passOfStage);
  
  if (partner >= params.numGaussians) {
    return;
  }
  
  let dir = ((j / stageSize) % 2u) == 0u;
  compareAndSwap(j, partner, dir);
}

// Compute depths from view matrix
struct ViewUniforms {
  viewMatrix: mat4x4f,
  numGaussians: u32,
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
}

struct PackedGaussian {
  posOpacity: vec4f,
  scaleRotation: vec4f,
  rot: vec4f,
  color: vec4f,
}

@group(0) @binding(0) var<uniform> viewUniforms: ViewUniforms;
@group(0) @binding(1) var<storage, read> gaussians: array<PackedGaussian>;
@group(0) @binding(2) var<storage, read_write> keys: array<DepthKey>;

@compute @workgroup_size(256)
fn cs_compute_depths(@builtin(global_invocation_id) globalId: vec3u) {
  let idx = globalId.x;
  if (idx >= viewUniforms.numGaussians) {
    return;
  }
  
  let position = gaussians[idx].posOpacity.xyz;
  let viewPos = viewUniforms.viewMatrix * vec4f(position, 1.0);
  
  keys[idx].depth = viewPos.z;
  keys[idx].index = idx;
}
