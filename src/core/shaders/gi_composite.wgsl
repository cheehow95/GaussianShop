// GI Composite Shader
// Combines base rendering with SSAO, SSR, volumetric lighting, and tone mapping

struct CompositeUniforms {
    ssaoEnabled: u32,
    ssaoIntensity: f32,
    ssrEnabled: u32,
    ssrIntensity: f32,
    volumetricEnabled: u32,
    volumetricIntensity: f32,
    exposure: f32,
    gamma: f32,
    vignetteIntensity: f32,
    viewportWidth: f32,
    viewportHeight: f32,
    time: f32,
}

struct LightingData {
    ambientColor: vec3f,
    ambientIntensity: f32,
    sunDirection: vec3f,
    sunIntensity: f32,
    sunColor: vec3f,
    pad1: f32, 
}

struct SHCoefficients {
    coefficients: array<f32, 27>,
}

struct LightProbe {
    position: vec3f,
    radius: f32,
    sh: SHCoefficients,
}

struct CameraUniforms {
    view: mat4x4f,
    proj: mat4x4f,
    invView: mat4x4f,
    invProj: mat4x4f,
    near: f32,
    far: f32,
    viewportWidth: f32,
    viewportHeight: f32,
}
// Note: Camera uniforms are not bound in Group 0 directly in typical GI setup? 
// Wait, GlobalIlluminationbindGroup entries:
// 0: compositeUniforms
// 1: lightingUniforms 
// ...
// GlobalIllumination.ts doesn't bind camera buffer to composite pass?
// checking updateBindGroups:
// { binding: 0, resource: { buffer: this.compositeUniformBuffer } },
// { binding: 1, resource: { buffer: this.lightingUniformBuffer } },
// ...
// It does NOT bind camera buffer!
// But wait, how do I get ray direction?
// I need camera matrices.
// I should add camera buffer to composite pass bindings!
// It was missing.


@group(0) @binding(0) var<uniform> params: CompositeUniforms;
@group(0) @binding(1) var<uniform> lighting: LightingData;
@group(0) @binding(2) var baseColorTexture: texture_2d<f32>;
@group(0) @binding(3) var depthTexture: texture_2d<f32>;
@group(0) @binding(4) var ssaoTexture: texture_2d<f32>;
@group(0) @binding(5) var ssrTexture: texture_2d<f32>;
@group(0) @binding(6) var volumetricTexture: texture_2d<f32>;
@group(0) @binding(7) var linearSampler: sampler;
@group(0) @binding(8) var outputTexture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(9) var environmentMap: texture_2d<f32>;
@group(0) @binding(10) var<storage, read> lightProbes: array<LightProbe>;
@group(0) @binding(11) var<uniform> camera: CameraUniforms;

// Constants
const PI = 3.14159265359;
const INV_PI = 0.31830988618;
const INV_2PI = 0.15915494309;

// Equirectangular mapping
fn sampleEnvironment(direction: vec3f) -> vec3f {
    let uv = vec2f(atan2(direction.z, direction.x), asin(direction.y));
    let sampleUV = uv * vec2f(INV_2PI, INV_PI) + 0.5;
    return textureSampleLevel(environmentMap, linearSampler, sampleUV, 0.0).rgb;
}

// Reconstruct world position from depth
fn getWorldPosition(uv: vec2f, depth: f32) -> vec3f {
    let ndc = vec4f(uv * 2.0 - 1.0, depth, 1.0);
    let viewPos = camera.invProj * ndc;
    let worldPos = camera.invView * vec4f(viewPos.xyz / viewPos.w, 1.0);
    return worldPos.xyz;
}

// Get ray direction for skybox
fn getRayDirection(uv: vec2f) -> vec3f {
    // ND depth = 1.0 for far plane in WebGPU (0-1 range, 1 is far?) 
    // Wait, typical projection maps far to 1.
    return normalize(getWorldPosition(uv, 1.0) - (camera.invView * vec4f(0.0, 0.0, 0.0, 1.0)).xyz);
}

// ACES filmic tone mapping
fn ACESFilm(x: vec3f) -> vec3f {
    let a = 2.51;
    let b = 0.03;
    let c = 2.43;
    let d = 0.59;
    let e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3f(0.0), vec3f(1.0));
}

// Reinhard tone mapping
fn Reinhard(x: vec3f) -> vec3f {
    return x / (x + vec3f(1.0));
}

// Uncharted 2 tone mapping
fn Uncharted2Tonemap(x: vec3f) -> vec3f {
    let A = 0.15;
    let B = 0.50;
    let C = 0.10;
    let D = 0.20;
    let E = 0.02;
    let F = 0.30;
    return ((x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F)) - E / F;
}

// Apply gamma correction
fn gammaCorrect(color: vec3f, gamma: f32) -> vec3f {
    return pow(color, vec3f(1.0 / gamma));
}

// Vignette effect
fn applyVignette(color: vec3f, uv: vec2f, intensity: f32) -> vec3f {
    let center = vec2f(0.5, 0.5);
    let dist = distance(uv, center);
    let vignette = 1.0 - smoothstep(0.3, 0.8, dist * intensity);
    return color * vignette;
}

// Film grain
fn filmGrain(uv: vec2f, time: f32) -> f32 {
    let noise = fract(sin(dot(uv + time, vec2f(12.9898, 78.233))) * 43758.5453);
    return (noise - 0.5) * 0.03;
}

// Chromatic aberration
fn chromaticAberration(baseColor: texture_2d<f32>, sampler_: sampler, uv: vec2f, amount: f32) -> vec3f {
    let center = vec2f(0.5, 0.5);
    let direction = normalize(uv - center);
    let dist = distance(uv, center);
    let offset = direction * dist * amount;
    
    let r = textureSampleLevel(baseColor, sampler_, uv + offset, 0.0).r;
    let g = textureSampleLevel(baseColor, sampler_, uv, 0.0).g;
    let b = textureSampleLevel(baseColor, sampler_, uv - offset, 0.0).b;
    
    return vec3f(r, g, b);
}

// Bloom threshold
fn bloomThreshold(color: vec3f, threshold: f32) -> vec3f {
    let brightness = dot(color, vec3f(0.2126, 0.7152, 0.0722));
    return color * max(0.0, brightness - threshold);
}

@compute @workgroup_size(8, 8, 1)
fn cs_composite(@builtin(global_invocation_id) globalId: vec3u) {
    let dims = vec2u(u32(params.viewportWidth), u32(params.viewportHeight));
    
    if (globalId.x >= dims.x || globalId.y >= dims.y) {
        return;
    }
    
    let uv = (vec2f(globalId.xy) + 0.5) / vec2f(dims);
    
    // Sample base color
    var color = textureSampleLevel(baseColorTexture, linearSampler, uv, 0.0).rgb;
    let depth = textureSampleLevel(depthTexture, linearSampler, uv, 0.0).r;
    
    // Skip processing for sky pixels (just apply exposure)
    let isSky = depth >= 1.0;
    
    // Skybox logic
    if (isSky) {
        let rayDir = getRayDirection(uv);
        let skyColor = sampleEnvironment(rayDir) * lighting.ambientIntensity * 2.0; // Boost sky brightness?
        color = skyColor;
    } else {
        // Apply SSAO
        if (params.ssaoEnabled != 0u) {
            let ao = textureSampleLevel(ssaoTexture, linearSampler, uv, 0.0).r;
            let aoFactor = mix(1.0, ao, params.ssaoIntensity);
            color *= aoFactor;
        }
        
        // Apply SSR
        if (params.ssrEnabled != 0u) {
            let reflection = textureSampleLevel(ssrTexture, linearSampler, uv, 0.0);
            let reflectionColor = reflection.rgb;
            let reflectionConfidence = reflection.a;
            
            // Blend reflection based on confidence and intensity
            let reflectionAmount = reflectionConfidence * params.ssrIntensity * 0.5;
            color = mix(color, reflectionColor, reflectionAmount);
        }
    }
    
    // Apply volumetric lighting (affects both sky and objects)
    if (params.volumetricEnabled != 0u) {
        let volumetric = textureSampleLevel(volumetricTexture, linearSampler, uv, 0.0);
        let scatteredLight = volumetric.rgb;
        let transmittance = volumetric.a;
        
        // Apply scattering: final = scattered + transmittance * color
        color = scatteredLight * params.volumetricIntensity + color * transmittance;
    }
    
    // Apply exposure
    color *= params.exposure;
    
    // Tone mapping (ACES)
    color = ACESFilm(color);
    
    // Gamma correction
    color = gammaCorrect(color, params.gamma);
    
    // Apply vignette
    if (params.vignetteIntensity > 0.0) {
        color = applyVignette(color, uv, params.vignetteIntensity);
    }
    
    // Optional: Add subtle film grain
    let grain = filmGrain(uv, params.time);
    color = clamp(color + grain, vec3f(0.0), vec3f(1.0));
    
    textureStore(outputTexture, globalId.xy, vec4f(color, 1.0));
}


