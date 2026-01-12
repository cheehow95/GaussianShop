// Global Illumination Controller
// Manages SSAO, SSR, Light Probes, and Volumetric Lighting

export type GIQuality = 'low' | 'medium' | 'high' | 'ultra';

export interface SSAOSettings {
    enabled: boolean;
    radius: number;        // World-space radius (0.1 - 2.0)
    intensity: number;     // Darkness intensity (0.0 - 3.0)
    bias: number;          // Depth bias to prevent self-occlusion
    samples: number;       // Number of samples (8, 16, 32, 64)
    blurPasses: number;    // Bilateral blur iterations
}

export interface SSRSettings {
    enabled: boolean;
    maxDistance: number;      // Maximum ray distance
    resolution: number;       // Resolution multiplier (0.5 - 1.0)
    thickness: number;        // Ray thickness for depth comparison
    maxSteps: number;         // Ray march steps (16 - 128)
    refinementSteps: number;  // Binary search refinements
    roughnessThreshold: number; // Max roughness for SSR
}

export interface VolumetricSettings {
    enabled: boolean;
    density: number;       // Fog density (0.0 - 1.0)
    scattering: number;    // Light scattering coefficient
    absorption: number;    // Light absorption coefficient
    samples: number;       // Ray march samples
    anisotropy: number;    // Phase function anisotropy (-1 to 1)
}

export interface LightProbeSettings {
    enabled: boolean;
    gridResolution: [number, number, number];
    updateFrequency: 'static' | 'dynamic' | 'manual';
    shOrder: number;       // Spherical harmonics order (2 or 3)
}

export interface GISettings {
    quality: GIQuality;
    ssao: SSAOSettings;
    ssr: SSRSettings;
    volumetric: VolumetricSettings;
    lightProbes: LightProbeSettings;
    temporalAccumulation: boolean;
    halfResolution: boolean;
}

const QUALITY_PRESETS: Record<GIQuality, Partial<GISettings>> = {
    low: {
        halfResolution: true,
        ssao: { enabled: true, samples: 8, blurPasses: 1, radius: 0.5, intensity: 1.0, bias: 0.025 },
        ssr: { enabled: false, maxSteps: 16, resolution: 0.5, maxDistance: 10, thickness: 0.1, refinementSteps: 4, roughnessThreshold: 0.5 },
        volumetric: { enabled: false, samples: 8, density: 0.02, scattering: 0.5, absorption: 0.1, anisotropy: 0.3 },
    },
    medium: {
        halfResolution: true,
        ssao: { enabled: true, samples: 16, blurPasses: 2, radius: 0.75, intensity: 1.2, bias: 0.025 },
        ssr: { enabled: true, maxSteps: 32, resolution: 0.5, maxDistance: 20, thickness: 0.1, refinementSteps: 8, roughnessThreshold: 0.6 },
        volumetric: { enabled: false, samples: 16, density: 0.02, scattering: 0.5, absorption: 0.1, anisotropy: 0.3 },
    },
    high: {
        halfResolution: false,
        ssao: { enabled: true, samples: 32, blurPasses: 2, radius: 1.0, intensity: 1.5, bias: 0.02 },
        ssr: { enabled: true, maxSteps: 64, resolution: 0.75, maxDistance: 30, thickness: 0.05, refinementSteps: 8, roughnessThreshold: 0.7 },
        volumetric: { enabled: true, samples: 32, density: 0.02, scattering: 0.5, absorption: 0.1, anisotropy: 0.3 },
    },
    ultra: {
        halfResolution: false,
        ssao: { enabled: true, samples: 64, blurPasses: 3, radius: 1.5, intensity: 1.8, bias: 0.015 },
        ssr: { enabled: true, maxSteps: 128, resolution: 1.0, maxDistance: 50, thickness: 0.025, refinementSteps: 16, roughnessThreshold: 0.8 },
        volumetric: { enabled: true, samples: 64, density: 0.02, scattering: 0.5, absorption: 0.1, anisotropy: 0.3 },
    },
};

const DEFAULT_SETTINGS: GISettings = {
    quality: 'medium',
    temporalAccumulation: true,
    halfResolution: true,
    ssao: {
        enabled: true,
        radius: 0.75,
        intensity: 1.2,
        bias: 0.025,
        samples: 16,
        blurPasses: 2,
    },
    ssr: {
        enabled: true,
        maxDistance: 20,
        resolution: 0.5,
        thickness: 0.1,
        maxSteps: 32,
        refinementSteps: 8,
        roughnessThreshold: 0.6,
    },
    volumetric: {
        enabled: false,
        density: 0.02,
        scattering: 0.5,
        absorption: 0.1,
        samples: 16,
        anisotropy: 0.3,
    },
    lightProbes: {
        enabled: true,
        gridResolution: [4, 4, 4],
        updateFrequency: 'static',
        shOrder: 2,
    },
};

export class GlobalIllumination {
    private settings: GISettings = { ...DEFAULT_SETTINGS };
    private device: GPUDevice | null = null;
    private listeners: Set<(settings: GISettings) => void> = new Set();

    // GPU Resources
    private ssaoTexture: GPUTexture | null = null;
    private ssaoBlurTexture: GPUTexture | null = null;
    private ssrTexture: GPUTexture | null = null;
    private volumetricTexture: GPUTexture | null = null;
    private noiseTexture: GPUTexture | null = null;
    private historyTexture: GPUTexture | null = null;

    // Motion vectors for temporal reprojection
    private motionVectorTexture: GPUTexture | null = null;
    private ssaoHistoryTexture: GPUTexture | null = null;

    // Pipelines
    private ssaoPipeline: GPUComputePipeline | null = null;
    private ssaoBlurPipeline: GPUComputePipeline | null = null;
    private ssrPipeline: GPUComputePipeline | null = null;
    private volumetricPipeline: GPUComputePipeline | null = null;
    private compositePipeline: GPUComputePipeline | null = null;

    // Uniform buffers
    private ssaoUniformBuffer: GPUBuffer | null = null;
    private ssrUniformBuffer: GPUBuffer | null = null;
    private volumetricUniformBuffer: GPUBuffer | null = null;
    private compositeUniformBuffer: GPUBuffer | null = null;

    // Samplers
    private linearSampler: GPUSampler | null = null;
    private nearestSampler: GPUSampler | null = null;
    private dummyTexture: GPUTexture | null = null;
    private dummyBuffer: GPUBuffer | null = null;

    private frameIndex = 0;
    private lastViewport: [number, number] = [0, 0];

    // Previous frame matrices for motion vector computation
    private prevViewMatrix: Float32Array = new Float32Array(16);
    private prevProjMatrix: Float32Array = new Float32Array(16);
    private prevViewProjMatrix: Float32Array = new Float32Array(16);

    // Bind Groups
    private ssaoBindGroup: GPUBindGroup | null = null;
    private ssaoBlurBindGroup: GPUBindGroup | null = null;
    private ssrBindGroup: GPUBindGroup | null = null;
    private compositeBindGroup: GPUBindGroup | null = null;

    // Camera uniforms buffer for GI shaders
    private cameraUniformBuffer: GPUBuffer | null = null;
    private lightingUniformBuffer: GPUBuffer | null = null;
    private blurUniformBuffer: GPUBuffer | null = null;

    constructor() {
        this.generateNoisePattern();
    }

    async initialize(device: GPUDevice): Promise<void> {
        this.device = device;
        await this.createPipelines();
        this.createSamplers();
        this.createInternalBuffers();
        this.createDummyResources();
        this.createNoiseTexture();
        console.log('GlobalIllumination initialized');
    }

    private createDummyResources(): void {
        if (!this.device) return;
        this.dummyTexture = this.device.createTexture({
            label: 'Dummy Black Texture',
            size: [1, 1],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING,
        });
        this.dummyBuffer = this.device.createBuffer({
            label: 'Dummy Buffer',
            size: 64, // Minimum size
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.UNIFORM,
        });
    }

    private createInternalBuffers(): void {
        if (!this.device) return;

        // Camera uniforms (View, Proj, InvView, InvProj, Near, Far, Viewport)
        // 4 matrices (64*4 = 256) + params
        this.cameraUniformBuffer = this.device.createBuffer({
            label: 'GI Camera Uniforms',
            size: 512, // Generous size
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.lightingUniformBuffer = this.device.createBuffer({
            label: 'GI Lighting Uniforms',
            size: 256,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.blurUniformBuffer = this.device.createBuffer({
            label: 'SSAO Blur Uniforms',
            size: 64,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
    }

    private async createPipelines(): Promise<void> {
        if (!this.device) return;

        // Import shaders dynamically
        const [ssaoShader, ssrShader, compositeShader] = await Promise.all([
            import('../core/shaders/ssao.wgsl?raw').then(m => m.default),
            import('../core/shaders/ssr.wgsl?raw').then(m => m.default),
            import('../core/shaders/gi_composite.wgsl?raw').then(m => m.default),
        ]);

        // SSAO Pipeline
        const ssaoModule = this.device.createShaderModule({
            label: 'SSAO Shader',
            code: ssaoShader,
        });

        this.ssaoPipeline = this.device.createComputePipeline({
            label: 'SSAO Pipeline',
            layout: 'auto',
            compute: {
                module: ssaoModule,
                entryPoint: 'cs_ssao',
            },
        });

        this.ssaoBlurPipeline = this.device.createComputePipeline({
            label: 'SSAO Blur Pipeline',
            layout: 'auto',
            compute: {
                module: ssaoModule,
                entryPoint: 'cs_bilateral_blur',
            },
        });

        // SSR Pipeline
        const ssrModule = this.device.createShaderModule({
            label: 'SSR Shader',
            code: ssrShader,
        });

        this.ssrPipeline = this.device.createComputePipeline({
            label: 'SSR Pipeline',
            layout: 'auto',
            compute: {
                module: ssrModule,
                entryPoint: 'cs_ssr',
            },
        });

        // Composite Pipeline
        const compositeModule = this.device.createShaderModule({
            label: 'GI Composite Shader',
            code: compositeShader,
        });

        this.compositePipeline = this.device.createComputePipeline({
            label: 'GI Composite Pipeline',
            layout: 'auto',
            compute: {
                module: compositeModule,
                entryPoint: 'cs_composite',
            },
        });
    }

    private createSamplers(): void {
        if (!this.device) return;

        this.linearSampler = this.device.createSampler({
            label: 'Linear Sampler',
            magFilter: 'linear',
            minFilter: 'linear',
            mipmapFilter: 'linear',
            addressModeU: 'clamp-to-edge',
            addressModeV: 'clamp-to-edge',
        });

        this.nearestSampler = this.device.createSampler({
            label: 'Nearest Sampler',
            magFilter: 'nearest',
            minFilter: 'nearest',
            addressModeU: 'clamp-to-edge',
            addressModeV: 'clamp-to-edge',
        });
    }

    private noisePattern: Float32Array = new Float32Array(0);

    private generateNoisePattern(): void {
        // Generate 4x4 blue noise rotations for SSAO
        const size = 4 * 4 * 4; // 4x4 texels, RGBA
        this.noisePattern = new Float32Array(size);

        for (let i = 0; i < 16; i++) {
            const angle = (i / 16) * Math.PI * 2 + Math.random() * 0.1;
            this.noisePattern[i * 4 + 0] = Math.cos(angle);
            this.noisePattern[i * 4 + 1] = Math.sin(angle);
            this.noisePattern[i * 4 + 2] = Math.random();
            this.noisePattern[i * 4 + 3] = Math.random();
        }
    }

    private createNoiseTexture(): void {
        if (!this.device) return;

        this.noiseTexture = this.device.createTexture({
            label: 'SSAO Noise Texture',
            size: [4, 4],
            format: 'rgba32float',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });

        this.device.queue.writeTexture(
            { texture: this.noiseTexture },
            this.noisePattern.buffer,
            { bytesPerRow: 4 * 4 * 4, rowsPerImage: 4 },
            { width: 4, height: 4 }
        );
    }

    ensureTextures(width: number, height: number): void {
        if (!this.device) return;

        if (this.lastViewport[0] === width && this.lastViewport[1] === height) {
            return;
        }

        this.lastViewport = [width, height];
        this.destroyTextures();

        const giWidth = this.settings.halfResolution ? Math.ceil(width / 2) : width;
        const giHeight = this.settings.halfResolution ? Math.ceil(height / 2) : height;

        // SSAO textures
        this.ssaoTexture = this.device.createTexture({
            label: 'SSAO Texture',
            size: [giWidth, giHeight],
            format: 'r32float',
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
        });

        this.ssaoBlurTexture = this.device.createTexture({
            label: 'SSAO Blur Texture',
            size: [giWidth, giHeight],
            format: 'r32float',
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
        });

        // SSR texture
        this.ssrTexture = this.device.createTexture({
            label: 'SSR Texture',
            size: [giWidth, giHeight],
            format: 'rgba32float',
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
        });

        // Volumetric texture
        // Volumetric texture is now managed externally by VolumetricLighting


        // History texture for temporal accumulation
        this.historyTexture = this.device.createTexture({
            label: 'History Texture',
            size: [width, height],
            format: 'rgba32float',
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });

        // Motion vector texture for temporal reprojection
        this.motionVectorTexture = this.device.createTexture({
            label: 'Motion Vector Texture',
            size: [width, height],
            format: 'rg16float',
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
        });

        // SSAO history for temporal accumulation
        this.ssaoHistoryTexture = this.device.createTexture({
            label: 'SSAO History Texture',
            size: [giWidth, giHeight],
            format: 'r32float',
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });

        // Create uniform buffers
        this.ssaoUniformBuffer = this.device.createBuffer({
            label: 'SSAO Uniforms',
            size: 64,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.ssrUniformBuffer = this.device.createBuffer({
            label: 'SSR Uniforms',
            size: 64,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });



        this.compositeUniformBuffer = this.device.createBuffer({
            label: 'Composite Uniforms',
            size: 64, // Changed from 32 to 64 to hold 16 floats
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
    }

    private destroyTextures(): void {
        this.ssaoTexture?.destroy();
        this.ssaoBlurTexture?.destroy();
        this.ssrTexture?.destroy();
        // volumetricTexture is external
        this.historyTexture?.destroy();

        this.ssaoUniformBuffer?.destroy();
        this.ssrUniformBuffer?.destroy();
        this.volumetricUniformBuffer?.destroy();
        this.compositeUniformBuffer?.destroy();

        this.ssaoTexture = null;
        this.ssaoBlurTexture = null;
        this.ssrTexture = null;
        // this.volumetricTexture = null;
        this.historyTexture = null;

        // Clear bind groups as they are invalid now
        this.ssaoBindGroup = null;
        this.ssaoBlurBindGroup = null;
        this.ssrBindGroup = null;
        this.compositeBindGroup = null;
    }

    // Call this every frame to ensure bind groups have valid texture views
    updateBindGroups(
        depthTexture: GPUTexture,
        baseColorTexture: GPUTexture,
        outputTexture: GPUTexture,
        volumetricTexture: GPUTexture | null,
        environmentTexture: GPUTexture | null,
        lightProbeBuffer: GPUBuffer | null
    ): void {
        if (!this.device || !this.ssaoTexture || !this.ssaoBlurTexture || !this.ssrTexture) return;

        // SSAO Bind Group
        if (this.ssaoPipeline && this.ssaoUniformBuffer && this.cameraUniformBuffer && this.noiseTexture && this.linearSampler) {
            this.ssaoBindGroup = this.device.createBindGroup({
                label: 'SSAO Bind Group',
                layout: this.ssaoPipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: this.ssaoUniformBuffer } },
                    { binding: 1, resource: { buffer: this.cameraUniformBuffer } },
                    { binding: 2, resource: depthTexture.createView() },
                    { binding: 3, resource: this.noiseTexture.createView() },
                    { binding: 4, resource: this.linearSampler },
                    { binding: 5, resource: this.ssaoTexture.createView() },
                ],
            });
        }

        // SSAO Blur Bind Group
        if (this.ssaoBlurPipeline && this.blurUniformBuffer && this.linearSampler) {
            this.ssaoBlurBindGroup = this.device.createBindGroup({
                label: 'SSAO Blur Bind Group',
                layout: this.ssaoBlurPipeline.getBindGroupLayout(1), // Group 1 in shader
                entries: [
                    { binding: 0, resource: { buffer: this.blurUniformBuffer } },
                    { binding: 1, resource: this.ssaoTexture.createView() },
                    { binding: 2, resource: this.ssaoBlurTexture.createView() },
                ],
            });
        }

        // SSR Bind Group
        if (this.ssrPipeline && this.ssrUniformBuffer && this.cameraUniformBuffer && this.linearSampler) {
            this.ssrBindGroup = this.device.createBindGroup({
                label: 'SSR Bind Group',
                layout: this.ssrPipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: this.ssrUniformBuffer } },
                    { binding: 1, resource: { buffer: this.cameraUniformBuffer } },
                    { binding: 2, resource: depthTexture.createView() },
                    { binding: 3, resource: baseColorTexture.createView() },
                    { binding: 4, resource: this.linearSampler },
                    { binding: 5, resource: this.ssrTexture.createView() },
                    { binding: 6, resource: environmentTexture ? environmentTexture.createView() : this.dummyTexture!.createView() },
                ],
            });
        }

        // Composite Bind Group
        if (this.compositePipeline && this.compositeUniformBuffer && this.lightingUniformBuffer && this.linearSampler) {
            this.compositeBindGroup = this.device.createBindGroup({
                label: 'Composite Bind Group',
                layout: this.compositePipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: this.compositeUniformBuffer } },
                    { binding: 1, resource: { buffer: this.lightingUniformBuffer } },
                    { binding: 2, resource: baseColorTexture.createView() },
                    { binding: 3, resource: depthTexture.createView() },
                    { binding: 4, resource: this.ssaoBlurTexture.createView() },
                    { binding: 5, resource: this.ssrTexture.createView() },
                    { binding: 6, resource: volumetricTexture ? volumetricTexture.createView() : this.dummyTexture!.createView() },
                    { binding: 7, resource: this.linearSampler },
                    { binding: 8, resource: outputTexture.createView() },
                    { binding: 9, resource: environmentTexture ? environmentTexture.createView() : this.dummyTexture!.createView() },
                    { binding: 10, resource: { buffer: lightProbeBuffer || this.dummyBuffer! } },
                    { binding: 11, resource: { buffer: this.cameraUniformBuffer! } },
                ],
            });
        }
    }

    getCameraUniformBuffer(): GPUBuffer | null {
        return this.cameraUniformBuffer;
    }

    updateUniforms(
        viewMatrix: Float32Array,
        projMatrix: Float32Array,
        invViewMatrix: Float32Array,
        invProjMatrix: Float32Array,
        near: number,
        far: number,
        time: number
    ): void {
        if (!this.device) return;

        // Update Camera Uniforms
        const cameraData = new Float32Array(128);
        cameraData.set(viewMatrix, 0);
        cameraData.set(projMatrix, 16);
        cameraData.set(invViewMatrix, 32);
        cameraData.set(invProjMatrix, 48);
        cameraData[64] = near;
        cameraData[65] = far;
        cameraData[66] = this.lastViewport[0];
        cameraData[67] = this.lastViewport[1];

        this.device.queue.writeBuffer(this.cameraUniformBuffer!, 0, cameraData);

        // Update SSAO Uniforms
        this.device.queue.writeBuffer(this.ssaoUniformBuffer!, 0, this.getSSAOUniformData().buffer);

        // Update Blur Uniforms
        const blurData = new Float32Array(8);
        blurData[0] = 1.0; blurData[1] = 0.0; // Direction X
        blurData[2] = 2.0; // Radius
        blurData[3] = 0.05; // Depth threshold
        blurData[4] = this.lastViewport[0] * (this.settings.halfResolution ? 0.5 : 1.0);
        blurData[5] = this.lastViewport[1] * (this.settings.halfResolution ? 0.5 : 1.0);
        this.device.queue.writeBuffer(this.blurUniformBuffer!, 0, blurData);

        // Update SSR Uniforms
        this.device.queue.writeBuffer(this.ssrUniformBuffer!, 0, this.getSSRUniformData().buffer);

        // Update Composite Uniforms
        const compositeData = new Float32Array(16);
        compositeData[0] = this.settings.ssao.enabled ? 1 : 0; // cast to u32 in shader
        compositeData[1] = this.settings.ssao.intensity;
        compositeData[2] = this.settings.ssr.enabled ? 1 : 0;
        compositeData[3] = 1.0; // SSR intensity default
        compositeData[4] = this.settings.volumetric.enabled ? 1 : 0;
        compositeData[5] = 1.0; // Volumetric intensity
        compositeData[6] = 1.0; // Exposure
        compositeData[7] = 2.2; // Gamma
        compositeData[8] = 0.4; // Vignette
        compositeData[9] = this.lastViewport[0];
        compositeData[10] = this.lastViewport[1];
        compositeData[11] = time;
        this.device.queue.writeBuffer(this.compositeUniformBuffer!, 0, compositeData);

        // Default Lighting
        const lightingData = new Float32Array(12);
        lightingData[0] = 0.1; lightingData[1] = 0.1; lightingData[2] = 0.15; // Ambient
        lightingData[3] = 0.5; // Ambient intensity
        lightingData[4] = 0.5; lightingData[5] = 1.0; lightingData[6] = 0.3; // Sun Dir
        lightingData[7] = 2.0; // Sun Intensity
        lightingData[8] = 1.0; lightingData[9] = 0.95; lightingData[10] = 0.8; // Sun Color
        this.device.queue.writeBuffer(this.lightingUniformBuffer!, 0, lightingData);
    }

    recordSSAO(commandEncoder: GPUCommandEncoder): void {
        if (!this.settings.ssao.enabled || !this.ssaoPipeline || !this.ssaoBlurPipeline || !this.ssaoBindGroup || !this.ssaoBlurBindGroup) return;

        const width = Math.ceil(this.lastViewport[0] * (this.settings.halfResolution ? 0.5 : 1.0));
        const height = Math.ceil(this.lastViewport[1] * (this.settings.halfResolution ? 0.5 : 1.0));
        const workgroupsX = Math.ceil(width / 8);
        const workgroupsY = Math.ceil(height / 8);

        // SSAO Pass
        const ssaoPass = commandEncoder.beginComputePass({ label: 'SSAO Pass' });
        ssaoPass.setPipeline(this.ssaoPipeline);
        ssaoPass.setBindGroup(0, this.ssaoBindGroup);
        ssaoPass.dispatchWorkgroups(workgroupsX, workgroupsY);
        ssaoPass.end();

        // Blur Pass
        const blurPass = commandEncoder.beginComputePass({ label: 'SSAO Blur Pass' });
        blurPass.setPipeline(this.ssaoBlurPipeline);
        blurPass.setBindGroup(1, this.ssaoBlurBindGroup);
        blurPass.dispatchWorkgroups(workgroupsX, workgroupsY);
        blurPass.end();
    }

    recordSSR(commandEncoder: GPUCommandEncoder): void {
        if (!this.settings.ssr.enabled || !this.ssrPipeline || !this.ssrBindGroup) return;

        const width = Math.ceil(this.lastViewport[0] * this.settings.ssr.resolution);
        const height = Math.ceil(this.lastViewport[1] * this.settings.ssr.resolution);
        const workgroupsX = Math.ceil(width / 8);
        const workgroupsY = Math.ceil(height / 8);

        const pass = commandEncoder.beginComputePass({ label: 'SSR Pass' });
        pass.setPipeline(this.ssrPipeline);
        pass.setBindGroup(0, this.ssrBindGroup);
        pass.dispatchWorkgroups(workgroupsX, workgroupsY);
        pass.end();
    }

    recordComposite(commandEncoder: GPUCommandEncoder): void {
        if (!this.compositePipeline || !this.compositeBindGroup) return;

        const width = this.lastViewport[0];
        const height = this.lastViewport[1];
        const workgroupsX = Math.ceil(width / 8);
        const workgroupsY = Math.ceil(height / 8);

        const pass = commandEncoder.beginComputePass({ label: 'GI Composite Pass' });
        pass.setPipeline(this.compositePipeline);
        pass.setBindGroup(0, this.compositeBindGroup);
        pass.dispatchWorkgroups(workgroupsX, workgroupsY);
        pass.end();
    }


    // Settings management
    getSettings(): GISettings {
        return { ...this.settings };
    }

    setQuality(quality: GIQuality): void {
        const preset = QUALITY_PRESETS[quality];
        this.settings = {
            ...this.settings,
            ...preset,
            quality,
            ssao: { ...this.settings.ssao, ...preset.ssao },
            ssr: { ...this.settings.ssr, ...preset.ssr },
            volumetric: { ...this.settings.volumetric, ...preset.volumetric },
        };
        this.notifyListeners();
    }

    setSSAOEnabled(enabled: boolean): void {
        this.settings.ssao.enabled = enabled;
        this.notifyListeners();
    }

    setSSAORadius(radius: number): void {
        this.settings.ssao.radius = Math.max(0.1, Math.min(2.0, radius));
        this.notifyListeners();
    }

    setSSAOIntensity(intensity: number): void {
        this.settings.ssao.intensity = Math.max(0, Math.min(3.0, intensity));
        this.notifyListeners();
    }

    setSSREnabled(enabled: boolean): void {
        this.settings.ssr.enabled = enabled;
        this.notifyListeners();
    }

    setSSRQuality(steps: number): void {
        this.settings.ssr.maxSteps = Math.max(16, Math.min(128, steps));
        this.notifyListeners();
    }

    setVolumetricEnabled(enabled: boolean): void {
        this.settings.volumetric.enabled = enabled;
        this.notifyListeners();
    }

    setVolumetricDensity(density: number): void {
        this.settings.volumetric.density = Math.max(0, Math.min(1.0, density));
        this.notifyListeners();
    }

    setVolumetricScattering(scattering: number): void {
        this.settings.volumetric.scattering = Math.max(0, Math.min(2.0, scattering));
        this.notifyListeners();
    }

    // Get GPU resources for rendering
    getSSAOTexture(): GPUTexture | null {
        return this.settings.ssao.enabled ? this.ssaoBlurTexture : null;
    }

    getSSRTexture(): GPUTexture | null {
        return this.settings.ssr.enabled ? this.ssrTexture : null;
    }

    getVolumetricTexture(): GPUTexture | null {
        return this.settings.volumetric.enabled ? this.volumetricTexture : null;
    }

    // Get uniform data for shaders
    getSSAOUniformData(): Float32Array {
        const data = new Float32Array(16);
        data[0] = this.settings.ssao.radius;
        data[1] = this.settings.ssao.intensity;
        data[2] = this.settings.ssao.bias;
        data[3] = this.settings.ssao.samples;
        data[4] = this.lastViewport[0];
        data[5] = this.lastViewport[1];
        data[6] = this.frameIndex;
        data[7] = this.settings.halfResolution ? 0.5 : 1.0;
        return data;
    }

    getSSRUniformData(): Float32Array {
        const data = new Float32Array(16);
        data[0] = this.settings.ssr.maxDistance;
        data[1] = this.settings.ssr.thickness;
        data[2] = this.settings.ssr.maxSteps;
        data[3] = this.settings.ssr.refinementSteps;
        data[4] = this.settings.ssr.roughnessThreshold;
        data[5] = this.settings.ssr.resolution;
        data[6] = this.frameIndex;
        data[7] = 1.0; // roughnessScale for jitter
        return data;
    }

    getVolumetricUniformData(): Float32Array {
        const data = new Float32Array(16);
        data[0] = this.settings.volumetric.density;
        data[1] = this.settings.volumetric.scattering;
        data[2] = this.settings.volumetric.absorption;
        data[3] = this.settings.volumetric.samples;
        data[4] = this.settings.volumetric.anisotropy;
        data[5] = this.frameIndex;
        return data;
    }

    tick(): void {
        this.frameIndex++;
    }

    subscribe(listener: (settings: GISettings) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notifyListeners(): void {
        this.listeners.forEach(l => l(this.settings));
    }

    destroy(): void {
        this.destroyTextures();
        this.noiseTexture?.destroy();
        this.ssaoUniformBuffer?.destroy();
        this.ssrUniformBuffer?.destroy();
        this.volumetricUniformBuffer?.destroy();
        this.compositeUniformBuffer?.destroy();
        this.cameraUniformBuffer?.destroy();
        this.lightingUniformBuffer?.destroy();
        this.blurUniformBuffer?.destroy();

        this.dummyTexture?.destroy();
        this.dummyBuffer?.destroy();
        this.dummyTexture = null;
        this.dummyBuffer = null;
        this.noiseTexture = null;
    }
}

export const globalIllumination = new GlobalIllumination();
export default GlobalIllumination;
