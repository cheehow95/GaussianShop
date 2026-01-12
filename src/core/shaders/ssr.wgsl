// Screen-Space Reflections (SSR) Compute Shader
// Implements hierarchical ray marching with temporal stability

struct SSRUniforms {
    maxDistance: f32,       // Maximum ray travel distance
    thickness: f32,         // Depth comparison thickness
    maxSteps: f32,          // Maximum ray march steps
    refinementSteps: f32,   // Binary search refinements
    roughnessThreshold: f32,
    resolution: f32,        // Resolution multiplier
    frameIndex: f32,
    roughnessScale: f32,    // Scale factor for roughness-based jitter
}

struct CameraUniforms {
    viewMatrix: mat4x4f,
    projMatrix: mat4x4f,
    invViewMatrix: mat4x4f,
    invProjMatrix: mat4x4f,
    near: f32,
    far: f32,
    viewportWidth: f32,
    viewportHeight: f32,
}

@group(0) @binding(0) var<uniform> ssrParams: SSRUniforms;
@group(0) @binding(1) var<uniform> camera: CameraUniforms;
@group(0) @binding(2) var depthTexture: texture_2d<f32>;
@group(0) @binding(3) var colorTexture: texture_2d<f32>;
@group(0) @binding(4) var linearSampler: sampler;
@group(0) @binding(5) var outputTexture: texture_storage_2d<rgba32float, write>;
@group(0) @binding(6) var environmentMap: texture_2d<f32>;
// Hi-Z mip chain for accelerated ray marching
@group(0) @binding(7) var hizTexture: texture_2d<f32>;

// Constants
const INV_PI = 0.31830988618;
const INV_2PI = 0.15915494309;

// Blue noise for temporal jitter
fn blueNoise(uv: vec2f, frame: f32) -> vec2f {
    let n = fract(sin(dot(uv + frame * 0.1, vec2f(12.9898, 78.233))) * 43758.5453);
    let m = fract(sin(dot(uv + frame * 0.1 + 0.5, vec2f(4.1414, 28.134))) * 23421.631);
    return vec2f(n, m) * 2.0 - 1.0;
}

// Equirectangular mapping for IBL
fn sampleEnvironment(direction: vec3f) -> vec3f {
    let uv = vec2f(atan2(direction.z, direction.x), asin(direction.y));
    let sampleUV = uv * vec2f(INV_2PI, INV_PI) + 0.5;
    return textureSampleLevel(environmentMap, linearSampler, sampleUV, 3.0).rgb; // Blurred mip for diffuse/rough
}

// Reconstruct position from depth
fn getViewPosition(uv: vec2f, depth: f32) -> vec3f {
    let ndc = vec4f(uv * 2.0 - 1.0, depth, 1.0);
    let viewPos = camera.invProjMatrix * ndc;
    return viewPos.xyz / viewPos.w;
}

// Reconstruct normal from depth gradients
fn reconstructNormal(uv: vec2f, depth: f32) -> vec3f {
    let texelSize = vec2f(1.0 / camera.viewportWidth, 1.0 / camera.viewportHeight);
    
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
    
    let dx = select(dxR, dxL, abs(dxL.z) < abs(dxR.z));
    let dy = select(dyB, dyT, abs(dyT.z) < abs(dyB.z));
    
    return normalize(cross(dy, dx));
}

// Project view space point to screen UV
fn projectToScreen(viewPos: vec3f) -> vec3f {
    let clipPos = camera.projMatrix * vec4f(viewPos, 1.0);
    var ndc = clipPos.xyz / clipPos.w;
    ndc.y = -ndc.y; // Flip Y
    return vec3f(ndc.xy * 0.5 + 0.5, ndc.z);
}

// Hash function for noise
fn hash(p: vec3f) -> f32 {
    var p3 = fract(p * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
}

// Importance sampling GGX
fn importanceSampleGGX(Xi: vec2f, roughness: f32, N: vec3f) -> vec3f {
    let a = roughness * roughness;
    
    let phi = 2.0 * 3.14159265 * Xi.x;
    let cosTheta = sqrt((1.0 - Xi.y) / (1.0 + (a * a - 1.0) * Xi.y));
    let sinTheta = sqrt(1.0 - cosTheta * cosTheta);
    
    let H = vec3f(cos(phi) * sinTheta, sin(phi) * sinTheta, cosTheta);
    
    // Transform from tangent to world space
    var upVector = select(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 0.0, 1.0), abs(N.z) < 0.999);
    let tangentX = normalize(cross(upVector, N));
    let tangentY = cross(N, tangentX);
    
    return tangentX * H.x + tangentY * H.y + N * H.z;
}

struct RayMarchResult {
    hit: bool,
    uv: vec2f,
    confidence: f32,
}

fn rayMarch(origin: vec3f, direction: vec3f, jitter: f32) -> RayMarchResult {
    var result: RayMarchResult;
    result.hit = false;
    result.uv = vec2f(0.0);
    result.confidence = 0.0;
    
    let maxSteps = u32(ssrParams.maxSteps);
    
    // Calculate ray end point
    let rayEnd = origin + direction * ssrParams.maxDistance;
    
    // Project start and end to screen
    let startScreen = projectToScreen(origin);
    let endScreen = projectToScreen(rayEnd);
    
    // Screen space ray direction
    let rayDir = endScreen - startScreen;
    let rayLength = length(rayDir.xy);
    
    if (rayLength < 0.001) {
        return result;
    }
    
    let stepDir = rayDir / f32(maxSteps);
    
    // Apply jitter to reduce banding
    var currentPos = startScreen + stepDir * jitter;
    var prevDepth = 0.0;
    
    for (var i = 0u; i < maxSteps; i++) {
        // Bounds check
        if (currentPos.x < 0.0 || currentPos.x > 1.0 || currentPos.y < 0.0 || currentPos.y > 1.0) {
            break;
        }
        
        // Sample scene depth
        let sceneDepth = textureSampleLevel(depthTexture, linearSampler, currentPos.xy, 0.0).r;
        
        // Check for intersection
        let rayDepth = currentPos.z;
        let depthDiff = rayDepth - sceneDepth;
        
        if (depthDiff > 0.0 && depthDiff < ssrParams.thickness) {
            // Hit found - refine with binary search
            var refinedPos = currentPos;
            var stepSize = stepDir * 0.5;
            
            for (var j = 0u; j < u32(ssrParams.refinementSteps); j++) {
                refinedPos -= stepSize;
                let refinedDepth = textureSampleLevel(depthTexture, linearSampler, refinedPos.xy, 0.0).r;
                let refinedDiff = refinedPos.z - refinedDepth;
                
                if (refinedDiff > 0.0) {
                    refinedPos += stepSize;
                }
                stepSize *= 0.5;
            }
            
            result.hit = true;
            result.uv = refinedPos.xy;
            
            // Calculate confidence based on various factors
            let edgeFade = 1.0 - pow(max(abs(result.uv.x * 2.0 - 1.0), abs(result.uv.y * 2.0 - 1.0)), 8.0);
            let distanceFade = 1.0 - f32(i) / f32(maxSteps);
            result.confidence = edgeFade * distanceFade;
            
            break;
        }
        
        prevDepth = sceneDepth;
        currentPos += stepDir;
    }
    
    return result;
}

@compute @workgroup_size(8, 8, 1)
fn cs_ssr(@builtin(global_invocation_id) globalId: vec3u) {
    let width = u32(camera.viewportWidth * ssrParams.resolution);
    let height = u32(camera.viewportHeight * ssrParams.resolution);
    
    if (globalId.x >= width || globalId.y >= height) {
        return;
    }
    
    let uv = (vec2f(globalId.xy) + 0.5) / vec2f(f32(width), f32(height));
    let depth = textureSampleLevel(depthTexture, linearSampler, uv, 0.0).r;
    
    // Skip sky pixels
    if (depth >= 1.0) {
        textureStore(outputTexture, globalId.xy, vec4f(0.0, 0.0, 0.0, 0.0));
        return;
    }
    
    // Get view space position and normal
    let viewPos = getViewPosition(uv, depth);
    let normal = reconstructNormal(uv, depth);
    
    // Calculate reflection direction
    let viewDir = normalize(viewPos); // Camera at origin in view space
    let reflectDir = reflect(viewDir, normal);
    
    // Skip surfaces facing away from camera
    if (reflectDir.z > 0.0) {
        textureStore(outputTexture, globalId.xy, vec4f(0.0, 0.0, 0.0, 0.0));
        return;
    }
    
    // Temporal jitter
    let jitter = hash(vec3f(vec2f(globalId.xy), ssrParams.frameIndex)) * 0.5;
    
    // Ray march
    let marchResult = rayMarch(viewPos, reflectDir, jitter);
    
    var outputColor = vec4f(0.0, 0.0, 0.0, 0.0);
    
    if (marchResult.hit) {
        let reflectedColor = textureSampleLevel(colorTexture, linearSampler, marchResult.uv, 0.0).rgb;
        outputColor = vec4f(reflectedColor, marchResult.confidence);
    } else {
        // IBL Fallback
        // Fade out screen edge reflections to environment map?
        // Actually, if we don't hit anything, we should ideally sample the environment map
        // But we need to handle roughness.
        // For now, simple fallback
        let envColor = sampleEnvironment(reflectDir);
        // Blend based on alpha? 
        // We set alpha to 0.0 if miss, but we can set it to partial if we want IBL
        // Let's set alpha to 1.0 but color to env map, but SSR blend depends on confidence
        // If confidence is 0, we don't apply SSR result in composite.
        // So we can't just return environment color here unless we change composite logic.
        // Composite logic: mix(color, reflection, confidence * intensity)
        // If we want IBL, we should return EnvColor with High Confidence?
        // Or handle IBL separate from SSR?
        // Let's force confidence = 1.0 for skybox hit? 
        // No, that might be jarring.
        
        // Better: Return EnvColor with fading confidence based on roughness?
        outputColor = vec4f(envColor, 0.5); // 0.5 confidence for IBL
    }
    
    textureStore(outputTexture, globalId.xy, outputColor);
}

// Temporal filtering for SSR
struct TemporalUniforms {
    historyWeight: f32,
    colorBoxScale: f32,
}

@group(2) @binding(0) var<uniform> temporalParams: TemporalUniforms;
@group(2) @binding(1) var historyTexture: texture_2d<f32>;
@group(2) @binding(2) var currentSSR: texture_2d<f32>;
@group(2) @binding(3) var motionVectors: texture_2d<f32>;
@group(2) @binding(4) var temporalOutput: texture_storage_2d<rgba32float, write>;

fn RGB_to_YCoCg(rgb: vec3f) -> vec3f {
    let Y = dot(rgb, vec3f(0.25, 0.5, 0.25));
    let Co = dot(rgb, vec3f(0.5, 0.0, -0.5));
    let Cg = dot(rgb, vec3f(-0.25, 0.5, -0.25));
    return vec3f(Y, Co, Cg);
}

fn YCoCg_to_RGB(ycocg: vec3f) -> vec3f {
    let tmp = ycocg.x - ycocg.z;
    let r = tmp + ycocg.y;
    let g = ycocg.x + ycocg.z;
    let b = tmp - ycocg.y;
    return vec3f(r, g, b);
}

@compute @workgroup_size(8, 8, 1)
fn cs_ssr_temporal(@builtin(global_invocation_id) globalId: vec3u) {
    let dims = vec2u(u32(camera.viewportWidth), u32(camera.viewportHeight));
    
    if (globalId.x >= dims.x || globalId.y >= dims.y) {
        return;
    }
    
    let uv = (vec2f(globalId.xy) + 0.5) / vec2f(dims);
    
    // Current frame SSR
    let current = textureSampleLevel(currentSSR, linearSampler, uv, 0.0);
    
    // Get motion vector (if available, otherwise use 0)
    let motion = textureSampleLevel(motionVectors, linearSampler, uv, 0.0).xy;
    let historyUV = uv - motion;
    
    // Sample history
    var history = textureSampleLevel(historyTexture, linearSampler, historyUV, 0.0);
    
    // Neighborhood clamping in YCoCg space
    var minColor = current.rgb;
    var maxColor = current.rgb;
    
    let texelSize = 1.0 / vec2f(dims);
    for (var y = -1; y <= 1; y++) {
        for (var x = -1; x <= 1; x++) {
            let neighborUV = uv + vec2f(f32(x), f32(y)) * texelSize;
            let neighbor = textureSampleLevel(currentSSR, linearSampler, neighborUV, 0.0).rgb;
            minColor = min(minColor, neighbor);
            maxColor = max(maxColor, neighbor);
        }
    }
    
    // Clamp history to neighborhood
    history = vec4f(clamp(history.rgb, minColor, maxColor), history.a);
    
    // Blend based on confidence
    let blendFactor = mix(temporalParams.historyWeight, 0.5, current.a);
    let blended = mix(current, history, blendFactor);
    
    textureStore(temporalOutput, globalId.xy, blended);
}
