// Screen-Space Ambient Occlusion (SSAO) Compute Shader
// Implements HBAO-style ambient occlusion with bilateral blur

// Uniform struct for SSAO parameters
struct SSAOUniforms {
    radius: f32,          // World-space AO radius
    intensity: f32,       // Darkness multiplier
    bias: f32,            // Depth bias
    numSamples: f32,      // Sample count (8-64)
    viewportWidth: f32,
    viewportHeight: f32,
    frameIndex: f32,      // For temporal jitter
    resolutionScale: f32, // Half-res multiplier
}

struct CameraUniforms {
    viewMatrix: mat4x4f,
    projMatrix: mat4x4f,
    invViewMatrix: mat4x4f,
    invProjMatrix: mat4x4f,
    near: f32,
    far: f32,
}

@group(0) @binding(0) var<uniform> ssaoParams: SSAOUniforms;
@group(0) @binding(1) var<uniform> camera: CameraUniforms;
@group(0) @binding(2) var depthTexture: texture_2d<f32>;
@group(0) @binding(3) var noiseTexture: texture_2d<f32>;
@group(0) @binding(4) var linearSampler: sampler;
@group(0) @binding(5) var outputTexture: texture_storage_2d<r32float, write>;

// Hemisphere sample kernel (Poisson disk in 3D)
const KERNEL_SIZE: u32 = 64u;
var<private> kernel: array<vec3f, 64> = array<vec3f, 64>(
    vec3f(0.0381, 0.0270, 0.0219),
    vec3f(-0.0324, 0.0493, 0.0215),
    vec3f(-0.0392, -0.0287, 0.0283),
    vec3f(0.0497, 0.0127, 0.0328),
    vec3f(-0.0185, 0.0591, 0.0142),
    vec3f(0.0563, -0.0248, 0.0205),
    vec3f(-0.0486, -0.0401, 0.0192),
    vec3f(0.0328, 0.0516, 0.0297),
    vec3f(-0.0612, 0.0089, 0.0341),
    vec3f(0.0187, -0.0643, 0.0182),
    vec3f(-0.0095, 0.0487, 0.0521),
    vec3f(0.0684, 0.0193, 0.0145),
    vec3f(-0.0542, 0.0418, 0.0287),
    vec3f(0.0391, -0.0572, 0.0243),
    vec3f(-0.0478, -0.0562, 0.0158),
    vec3f(0.0623, 0.0387, 0.0312),
    // Extended kernel samples for higher quality
    vec3f(0.0752, -0.0156, 0.0421),
    vec3f(-0.0687, 0.0432, 0.0198),
    vec3f(0.0298, 0.0789, 0.0267),
    vec3f(-0.0812, -0.0187, 0.0342),
    vec3f(0.0543, -0.0678, 0.0189),
    vec3f(-0.0398, 0.0756, 0.0298),
    vec3f(0.0876, 0.0234, 0.0156),
    vec3f(-0.0623, -0.0654, 0.0278),
    vec3f(0.0187, 0.0891, 0.0321),
    vec3f(-0.0912, 0.0098, 0.0187),
    vec3f(0.0734, 0.0567, 0.0234),
    vec3f(-0.0456, -0.0821, 0.0198),
    vec3f(0.0943, -0.0321, 0.0267),
    vec3f(-0.0789, 0.0543, 0.0312),
    vec3f(0.0321, -0.0912, 0.0187),
    vec3f(-0.0654, 0.0698, 0.0243),
    vec3f(0.1012, 0.0156, 0.0321),
    vec3f(-0.0876, -0.0432, 0.0198),
    vec3f(0.0543, 0.0876, 0.0267),
    vec3f(-0.0321, -0.0943, 0.0187),
    vec3f(0.0987, 0.0432, 0.0234),
    vec3f(-0.1021, 0.0187, 0.0156),
    vec3f(0.0432, -0.0987, 0.0298),
    vec3f(-0.0789, 0.0678, 0.0187),
    vec3f(0.1098, -0.0234, 0.0321),
    vec3f(-0.0654, -0.0876, 0.0243),
    vec3f(0.0678, 0.0912, 0.0198),
    vec3f(-0.1012, -0.0321, 0.0267),
    vec3f(0.0876, -0.0654, 0.0187),
    vec3f(-0.0543, 0.0987, 0.0234),
    vec3f(0.1132, 0.0298, 0.0156),
    vec3f(-0.0912, 0.0543, 0.0298),
    vec3f(0.0321, 0.1098, 0.0187),
    vec3f(-0.1098, -0.0187, 0.0243),
    vec3f(0.0789, 0.0789, 0.0321),
    vec3f(-0.0432, -0.1021, 0.0198),
    vec3f(0.1187, -0.0156, 0.0187),
    vec3f(-0.0987, 0.0432, 0.0267),
    vec3f(0.0543, -0.1012, 0.0234),
    vec3f(-0.0678, 0.0912, 0.0156),
    vec3f(0.1021, 0.0567, 0.0298),
    vec3f(-0.1132, 0.0098, 0.0187),
    vec3f(0.0678, 0.0987, 0.0243),
    vec3f(-0.0789, -0.0789, 0.0321),
    vec3f(0.1243, 0.0187, 0.0198),
    vec3f(-0.0876, 0.0678, 0.0267),
    vec3f(0.0432, 0.1132, 0.0156),
    vec3f(-0.1187, -0.0298, 0.0234),
);

// Reconstruct position from depth
fn getViewPosition(uv: vec2f, depth: f32) -> vec3f {
    let ndc = vec4f(uv * 2.0 - 1.0, depth, 1.0);
    let viewPos = camera.invProjMatrix * ndc;
    return viewPos.xyz / viewPos.w;
}

// Reconstruct normal from depth gradients
fn reconstructNormal(uv: vec2f, depth: f32) -> vec3f {
    let texelSize = vec2f(1.0 / ssaoParams.viewportWidth, 1.0 / ssaoParams.viewportHeight);
    
    let depthL = textureSampleLevel(depthTexture, linearSampler, uv - vec2f(texelSize.x, 0.0), 0.0).r;
    let depthR = textureSampleLevel(depthTexture, linearSampler, uv + vec2f(texelSize.x, 0.0), 0.0).r;
    let depthT = textureSampleLevel(depthTexture, linearSampler, uv - vec2f(0.0, texelSize.y), 0.0).r;
    let depthB = textureSampleLevel(depthTexture, linearSampler, uv + vec2f(0.0, texelSize.y), 0.0).r;
    
    let posC = getViewPosition(uv, depth);
    let posL = getViewPosition(uv - vec2f(texelSize.x, 0.0), depthL);
    let posR = getViewPosition(uv + vec2f(texelSize.x, 0.0), depthR);
    let posT = getViewPosition(uv - vec2f(0.0, texelSize.y), depthT);
    let posB = getViewPosition(uv + vec2f(0.0, texelSize.y), depthB);
    
    let dxL = posC - posL;
    let dxR = posR - posC;
    let dyT = posC - posT;
    let dyB = posB - posC;
    
    // Use smaller derivatives (better at edges)
    let dx = select(dxR, dxL, abs(dxL.z) < abs(dxR.z));
    let dy = select(dyB, dyT, abs(dyT.z) < abs(dyB.z));
    
    return normalize(cross(dy, dx));
}

// Random rotation based on screen position and frame
fn getRandomRotation(uv: vec2f) -> mat3x3f {
    let noiseScale = vec2f(ssaoParams.viewportWidth / 4.0, ssaoParams.viewportHeight / 4.0);
    let noise = textureSampleLevel(noiseTexture, linearSampler, uv * noiseScale, 0.0);
    
    // Temporal jitter
    let jitter = sin(ssaoParams.frameIndex * 0.1) * 0.1;
    let angle = noise.x * 6.28318 + jitter;
    
    let c = cos(angle);
    let s = sin(angle);
    
    return mat3x3f(
        vec3f(c, s, 0.0),
        vec3f(-s, c, 0.0),
        vec3f(0.0, 0.0, 1.0)
    );
}

@compute @workgroup_size(8, 8, 1)
fn cs_ssao(@builtin(global_invocation_id) globalId: vec3u) {
    let dims = vec2u(u32(ssaoParams.viewportWidth * ssaoParams.resolutionScale),
                     u32(ssaoParams.viewportHeight * ssaoParams.resolutionScale));
    
    if (globalId.x >= dims.x || globalId.y >= dims.y) {
        return;
    }
    
    let uv = (vec2f(globalId.xy) + 0.5) / vec2f(dims);
    let depth = textureSampleLevel(depthTexture, linearSampler, uv, 0.0).r;
    
    // Skip sky pixels
    if (depth >= 1.0) {
        textureStore(outputTexture, globalId.xy, vec4f(1.0, 0.0, 0.0, 0.0));
        return;
    }
    
    let viewPos = getViewPosition(uv, depth);
    let normal = reconstructNormal(uv, depth);
    let randomRot = getRandomRotation(uv);
    
    var occlusion = 0.0;
    let numSamples = u32(ssaoParams.numSamples);
    
    for (var i = 0u; i < numSamples; i++) {
        // Get sample from kernel and apply random rotation
        var sampleVec = randomRot * kernel[i];
        
        // Flip sample if behind surface
        sampleVec = select(sampleVec, -sampleVec, dot(sampleVec, normal) < 0.0);
        
        // Scale sample by radius with falloff
        let scale = f32(i + 1u) / f32(numSamples);
        let scaledSample = sampleVec * ssaoParams.radius * mix(0.1, 1.0, scale * scale);
        
        // Sample position in view space
        let samplePos = viewPos + scaledSample;
        
        // Project to screen space
        let sampleClip = camera.projMatrix * vec4f(samplePos, 1.0);
        var sampleUV = sampleClip.xy / sampleClip.w;
        sampleUV = sampleUV * 0.5 + 0.5;
        sampleUV.y = 1.0 - sampleUV.y; // Flip Y for texture coords
        
        // Out of bounds check
        if (sampleUV.x < 0.0 || sampleUV.x > 1.0 || sampleUV.y < 0.0 || sampleUV.y > 1.0) {
            continue;
        }
        
        // Sample depth at projected position
        let sampleDepth = textureSampleLevel(depthTexture, linearSampler, sampleUV, 0.0).r;
        let sampleViewPos = getViewPosition(sampleUV, sampleDepth);
        
        // Range check with smooth falloff
        let rangeCheck = smoothstep(0.0, 1.0, ssaoParams.radius / abs(viewPos.z - sampleViewPos.z));
        
        // Occlusion: sample is occluded if it's closer than the sampled depth
        let depthDiff = viewPos.z - sampleViewPos.z;
        occlusion += select(0.0, 1.0, depthDiff > ssaoParams.bias) * rangeCheck;
    }
    
    occlusion = 1.0 - (occlusion / f32(numSamples)) * ssaoParams.intensity;
    occlusion = clamp(occlusion, 0.0, 1.0);
    
    // Apply power curve for contrast
    occlusion = pow(occlusion, 1.5);
    
    textureStore(outputTexture, globalId.xy, vec4f(occlusion, 0.0, 0.0, 0.0));
}

// Bilateral blur pass
struct BlurUniforms {
    direction: vec2f,    // (1,0) or (0,1) for separable blur
    blurRadius: f32,
    depthThreshold: f32,
    viewportWidth: f32,
    viewportHeight: f32,
}

@group(1) @binding(0) var<uniform> blurParams: BlurUniforms;
@group(1) @binding(1) var inputSSAO: texture_2d<f32>;
@group(1) @binding(2) var blurOutput: texture_storage_2d<r32float, write>;

// Gaussian weights for 7-tap filter
const BLUR_WEIGHTS: array<f32, 4> = array<f32, 4>(
    0.3829, 0.2417, 0.0606, 0.0060
);

@compute @workgroup_size(8, 8, 1)
fn cs_bilateral_blur(@builtin(global_invocation_id) globalId: vec3u) {
    let dims = vec2u(u32(blurParams.viewportWidth), u32(blurParams.viewportHeight));
    
    if (globalId.x >= dims.x || globalId.y >= dims.y) {
        return;
    }
    
    let uv = (vec2f(globalId.xy) + 0.5) / vec2f(dims);
    let centerDepth = textureSampleLevel(depthTexture, linearSampler, uv, 0.0).r;
    let centerAO = textureSampleLevel(inputSSAO, linearSampler, uv, 0.0).r;
    
    let texelSize = 1.0 / vec2f(dims);
    var result = centerAO * BLUR_WEIGHTS[0];
    var totalWeight = BLUR_WEIGHTS[0];
    
    // Bilateral blur with depth-aware weighting
    for (var i = 1; i < 4; i++) {
        let offset = blurParams.direction * texelSize * f32(i);
        
        // Positive direction
        let uvPos = uv + offset;
        let depthPos = textureSampleLevel(depthTexture, linearSampler, uvPos, 0.0).r;
        let aoPos = textureSampleLevel(inputSSAO, linearSampler, uvPos, 0.0).r;
        let weightPos = BLUR_WEIGHTS[i] * max(0.0, 1.0 - abs(centerDepth - depthPos) / blurParams.depthThreshold);
        result += aoPos * weightPos;
        totalWeight += weightPos;
        
        // Negative direction
        let uvNeg = uv - offset;
        let depthNeg = textureSampleLevel(depthTexture, linearSampler, uvNeg, 0.0).r;
        let aoNeg = textureSampleLevel(inputSSAO, linearSampler, uvNeg, 0.0).r;
        let weightNeg = BLUR_WEIGHTS[i] * max(0.0, 1.0 - abs(centerDepth - depthNeg) / blurParams.depthThreshold);
        result += aoNeg * weightNeg;
        totalWeight += weightNeg;
    }
    
    result /= totalWeight;
    
    textureStore(blurOutput, globalId.xy, vec4f(result, 0.0, 0.0, 0.0));
}

// ========================================
// Temporal Accumulation Pass for SSAO
// ========================================

struct TemporalSSAOUniforms {
    prevViewProj: mat4x4f,          // Previous frame view-projection matrix
    currViewProj: mat4x4f,          // Current frame view-projection matrix
    invCurrViewProj: mat4x4f,       // Inverse current view-projection
    historyWeight: f32,             // How much to blend history (0.8 - 0.95)
    viewportWidth: f32,
    viewportHeight: f32,
    frameIndex: f32,
}

@group(2) @binding(0) var<uniform> temporalParams: TemporalSSAOUniforms;
@group(2) @binding(1) var currentSSAO: texture_2d<f32>;
@group(2) @binding(2) var historySSAO: texture_2d<f32>;
@group(2) @binding(3) var velocityTexture: texture_2d<f32>;  // Motion vectors
@group(2) @binding(4) var temporalOutput: texture_storage_2d<r32float, write>;

// Reconstruct world position from screen UV and depth
fn reconstructWorldPos(uv: vec2f, depth: f32, invViewProj: mat4x4f) -> vec3f {
    let ndc = vec4f(uv * 2.0 - 1.0, depth, 1.0);
    let worldPos = invViewProj * ndc;
    return worldPos.xyz / worldPos.w;
}

// Project world position to screen UV
fn projectToScreen(worldPos: vec3f, viewProj: mat4x4f) -> vec2f {
    let clipPos = viewProj * vec4f(worldPos, 1.0);
    var ndc = clipPos.xy / clipPos.w;
    return ndc * 0.5 + 0.5;
}

@compute @workgroup_size(8, 8, 1)
fn cs_ssao_temporal(@builtin(global_invocation_id) globalId: vec3u) {
    let dims = vec2u(u32(temporalParams.viewportWidth), u32(temporalParams.viewportHeight));
    
    if (globalId.x >= dims.x || globalId.y >= dims.y) {
        return;
    }
    
    let uv = (vec2f(globalId.xy) + 0.5) / vec2f(dims);
    let currentAO = textureSampleLevel(currentSSAO, linearSampler, uv, 0.0).r;
    
    // Get motion vector for temporal reprojection
    let velocity = textureSampleLevel(velocityTexture, linearSampler, uv, 0.0).xy;
    let historyUV = uv - velocity;
    
    // Reject history if outside screen bounds
    if (historyUV.x < 0.0 || historyUV.x > 1.0 || historyUV.y < 0.0 || historyUV.y > 1.0) {
        textureStore(temporalOutput, globalId.xy, vec4f(currentAO, 0.0, 0.0, 0.0));
        return;
    }
    
    // Sample history AO
    let historyAO = textureSampleLevel(historySSAO, linearSampler, historyUV, 0.0).r;
    
    // Neighborhood clamping for temporal stability
    var minAO = currentAO;
    var maxAO = currentAO;
    let texelSize = 1.0 / vec2f(dims);
    
    for (var y = -1; y <= 1; y++) {
        for (var x = -1; x <= 1; x++) {
            let neighborUV = uv + vec2f(f32(x), f32(y)) * texelSize;
            let neighborAO = textureSampleLevel(currentSSAO, linearSampler, neighborUV, 0.0).r;
            minAO = min(minAO, neighborAO);
            maxAO = max(maxAO, neighborAO);
        }
    }
    
    // Extend clamp box slightly for stability
    let boxExtent = (maxAO - minAO) * 0.1;
    minAO -= boxExtent;
    maxAO += boxExtent;
    
    // Clamp history to neighborhood
    let clampedHistory = clamp(historyAO, minAO, maxAO);
    
    // Blend current and history with adaptive weight
    // Reduce weight if history was clamped significantly
    let clampDistance = abs(historyAO - clampedHistory);
    let adaptiveWeight = temporalParams.historyWeight * smoothstep(0.2, 0.0, clampDistance);
    
    let blendedAO = mix(currentAO, clampedHistory, adaptiveWeight);
    
    textureStore(temporalOutput, globalId.xy, vec4f(blendedAO, 0.0, 0.0, 0.0));
}

// Halton sequence generator for improved sample distribution
fn halton(index: u32, base: u32) -> f32 {
    var f = 1.0;
    var r = 0.0;
    var i = index;
    
    while (i > 0u) {
        f = f / f32(base);
        r = r + f * f32(i % base);
        i = i / base;
    }
    
    return r;
}

// Get jittered sample position using Halton sequence for better convergence
fn getHaltonOffset(sampleIndex: u32, frameIndex: u32) -> vec2f {
    let i = sampleIndex + frameIndex * 64u;
    return vec2f(halton(i, 2u), halton(i, 3u)) * 2.0 - 1.0;
}
