// Volumetric Lighting Compute Shader

struct VolumetricConfig {
    density: f32,
    scattering: f32,
    absorption: f32,
    samples: f32,
    anisotropy: f32,
    heightFalloff: f32,
    groundLevel: f32,
    maxDistance: f32,
    
    lightDir: vec3f,
    pad1: f32,
    
    lightColor: vec3f,
    lightIntensity: f32,
    
    viewport: vec2f,
    jitter: f32,
    frameIndex: f32,
};

struct CameraUniforms {
    view: mat4x4f,
    proj: mat4x4f,
    invView: mat4x4f,
    invProj: mat4x4f,
    near: f32,
    far: f32,
    viewport: vec2f,
};

@group(0) @binding(0) var<uniform> config: VolumetricConfig;
@group(0) @binding(1) var<uniform> camera: CameraUniforms;
@group(0) @binding(2) var depthTexture: texture_2d<f32>;
@group(0) @binding(3) var outputTexture: texture_storage_2d<rgba16float, write>;

// Henyey-Greenstein phase function
fn phaseFunction(angleCos: f32, g: f32) -> f32 {
    let g2 = g * g;
    return (1.0 - g2) / (4.0 * 3.14159 * pow(1.0 + g2 - 2.0 * g * angleCos, 1.5));
}

fn getWorldPosition(uv: vec2f, depth: f32) -> vec3f {
    let clipPos = vec4f(uv * 2.0 - 1.0, depth, 1.0);
    // Use proper Y-flip for WebGPU clip space if needed, but usually 0-1 depth
    let clipPosFlip = vec4f(clipPos.x, -clipPos.y, clipPos.z, clipPos.w);
    let worldPos = camera.invView * camera.invProj * clipPosFlip;
    return worldPos.xyz / worldPos.w;
}

@compute @workgroup_size(8, 8)
fn cs_volumetric(@builtin(global_invocation_id) global_id: vec3u) {
    let size = textureDimensions(outputTexture);
    if (global_id.x >= size.x || global_id.y >= size.y) {
        return;
    }

    let uv = vec2f(f32(global_id.x) + 0.5, f32(global_id.y) + 0.5) / vec2f(size);
    
    // Sample depth (upscaled nearest or passed low-res)
    // We assume depthTexture is high-res, need to sample corresponding texel
    let depthDims = textureDimensions(depthTexture);
    let depthCoord = vec2u(uv * vec2f(depthDims));
    let depth = textureLoad(depthTexture, depthCoord, 0).r;

    // Reconstruct world position
    let worldPos = getWorldPosition(uv, depth);
    let camPos = (camera.invView * vec4f(0.0, 0.0, 0.0, 1.0)).xyz;
    let rayDir = normalize(worldPos - camPos);
    let rayLen = min(distance(camPos, worldPos), config.maxDistance);

    // Raymarch
    let stepCount = i32(config.samples);
    let stepSize = rayLen / f32(stepCount);
    
    // Jitter start position
    let offset = config.jitter * stepSize;
    var currentPos = camPos + rayDir * offset;
    
    var accumulatedColor = vec3f(0.0);
    var transmittance = 1.0;
    
    for (var i = 0; i < stepCount; i++) {
        // Height-based density
        let height = currentPos.y - config.groundLevel;
        let density = config.density * exp(-height * config.heightFalloff);
        
        if (density > 0.001) {
            // Light calculation
            let lightDir = normalize(config.lightDir);
            let angleCos = dot(rayDir, lightDir);
            let scattering = phaseFunction(angleCos, config.anisotropy) * config.scattering;
            
            // Shadows would go here (omitted for basic implementation)
            let shadow = 1.0; 
            
            let light = config.lightColor * config.lightIntensity * shadow * scattering * density * stepSize;
            
            accumulatedColor += light * transmittance;
            transmittance *= exp(-(config.absorption + density) * stepSize);
        }
        
        if (transmittance < 0.01) {
            break;
        }
        
        currentPos += rayDir * stepSize;
    }

    textureStore(outputTexture, global_id.xy, vec4f(accumulatedColor, transmittance));
}
