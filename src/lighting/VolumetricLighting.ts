// Volumetric Lighting Controller
// Manages fog, god rays, and atmospheric scattering

export interface VolumetricConfig {
    enabled: boolean;
    density: number;           // Fog density (0 - 1)
    scattering: number;        // Light scattering coefficient (0 - 2)
    absorption: number;        // Light absorption coefficient (0 - 1)
    anisotropy: number;        // Phase function anisotropy (-1 to 1, 0 = isotropic)
    samples: number;           // Number of ray march samples
    maxDistance: number;       // Maximum ray march distance
    heightFalloff: number;     // Height-based density falloff
    groundLevel: number;       // Y coordinate of ground
    color: [number, number, number];  // Fog color tint
    sunIntegration: boolean;   // Integrate with main sun light
    temporalReprojection: boolean;  // Use temporal filtering
}

const DEFAULT_CONFIG: VolumetricConfig = {
    enabled: false,
    density: 0.02,
    scattering: 0.5,
    absorption: 0.1,
    anisotropy: 0.3,
    samples: 32,
    maxDistance: 100,
    heightFalloff: 0.5,
    groundLevel: 0,
    color: [1, 1, 1],
    sunIntegration: true,
    temporalReprojection: true,
};

export interface VolumetricPreset {
    name: string;
    config: Partial<VolumetricConfig>;
}

export const VOLUMETRIC_PRESETS: VolumetricPreset[] = [
    {
        name: 'Clear',
        config: {
            enabled: false,
            density: 0,
        },
    },
    {
        name: 'Light Haze',
        config: {
            enabled: true,
            density: 0.01,
            scattering: 0.3,
            absorption: 0.05,
            anisotropy: 0.5,
            color: [1, 1, 1],
        },
    },
    {
        name: 'Morning Fog',
        config: {
            enabled: true,
            density: 0.03,
            scattering: 0.6,
            absorption: 0.1,
            anisotropy: 0.2,
            heightFalloff: 0.8,
            color: [1, 0.98, 0.95],
        },
    },
    {
        name: 'Dense Fog',
        config: {
            enabled: true,
            density: 0.08,
            scattering: 0.8,
            absorption: 0.15,
            anisotropy: 0.1,
            heightFalloff: 0.3,
            color: [0.9, 0.9, 0.92],
        },
    },
    {
        name: 'God Rays',
        config: {
            enabled: true,
            density: 0.015,
            scattering: 0.9,
            absorption: 0.02,
            anisotropy: 0.8,
            color: [1, 0.95, 0.85],
        },
    },
    {
        name: 'Sunset Haze',
        config: {
            enabled: true,
            density: 0.025,
            scattering: 0.7,
            absorption: 0.08,
            anisotropy: 0.6,
            color: [1, 0.85, 0.7],
        },
    },
    {
        name: 'Night Mist',
        config: {
            enabled: true,
            density: 0.04,
            scattering: 0.4,
            absorption: 0.2,
            anisotropy: 0.15,
            color: [0.7, 0.75, 0.9],
        },
    },
];

export class VolumetricLighting {
    private config: VolumetricConfig = { ...DEFAULT_CONFIG };
    private device: GPUDevice | null = null;
    private listeners: Set<(config: VolumetricConfig) => void> = new Set();

    // GPU Resources
    private volumetricTexture: GPUTexture | null = null;
    private historyTexture: GPUTexture | null = null;
    private uniformBuffer: GPUBuffer | null = null;
    private pipeline: GPUComputePipeline | null = null;
    private bindGroup: GPUBindGroup | null = null;

    private lastViewport: [number, number] = [0, 0];
    private frameIndex = 0;

    // Jitter pattern for temporal stability
    private jitterPattern: Float32Array = new Float32Array([
        0.0625, 0.1875, 0.3125, 0.4375, 0.5625, 0.6875, 0.8125, 0.9375,
        0.125, 0.375, 0.625, 0.875, 0.0, 0.25, 0.5, 0.75,
    ]);

    async initialize(device: GPUDevice): Promise<void> {
        this.device = device;
        await this.createPipeline();
        console.log('VolumetricLighting initialized');
    }

    private async createPipeline(): Promise<void> {
        if (!this.device) return;

        const shaderCode = await import('../core/shaders/volumetric.wgsl?raw').then(m => m.default);
        const module = this.device.createShaderModule({
            label: 'Volumetric Shader',
            code: shaderCode,
        });

        this.pipeline = this.device.createComputePipeline({
            label: 'Volumetric Pipeline',
            layout: 'auto',
            compute: {
                module,
                entryPoint: 'cs_volumetric',
            },
        });
    }

    getConfig(): VolumetricConfig {
        return { ...this.config };
    }

    setEnabled(enabled: boolean): void {
        this.config.enabled = enabled;
        this.notifyListeners();
    }

    setDensity(density: number): void {
        this.config.density = Math.max(0, Math.min(1, density));
        this.notifyListeners();
    }

    setScattering(scattering: number): void {
        this.config.scattering = Math.max(0, Math.min(2, scattering));
        this.notifyListeners();
    }

    setAbsorption(absorption: number): void {
        this.config.absorption = Math.max(0, Math.min(1, absorption));
        this.notifyListeners();
    }

    setAnisotropy(anisotropy: number): void {
        this.config.anisotropy = Math.max(-1, Math.min(1, anisotropy));
        this.notifyListeners();
    }

    setSamples(samples: number): void {
        this.config.samples = Math.max(8, Math.min(128, samples));
        this.notifyListeners();
    }

    setColor(color: [number, number, number]): void {
        this.config.color = [...color];
        this.notifyListeners();
    }

    setHeightFalloff(falloff: number): void {
        this.config.heightFalloff = Math.max(0, Math.min(2, falloff));
        this.notifyListeners();
    }

    setGroundLevel(level: number): void {
        this.config.groundLevel = level;
        this.notifyListeners();
    }

    applyPreset(presetName: string): void {
        const preset = VOLUMETRIC_PRESETS.find(p => p.name === presetName);
        if (preset) {
            this.config = { ...this.config, ...preset.config };
            this.notifyListeners();
        }
    }

    reset(): void {
        this.config = { ...DEFAULT_CONFIG };
        this.notifyListeners();
    }

    ensureTextures(width: number, height: number): void {
        if (!this.device) return;

        if (this.lastViewport[0] === width && this.lastViewport[1] === height) {
            return;
        }

        this.lastViewport = [width, height];
        this.destroyTextures();

        // Use half resolution for performance
        const texWidth = Math.ceil(width / 2);
        const texHeight = Math.ceil(height / 2);

        this.volumetricTexture = this.device.createTexture({
            label: 'Volumetric Lighting Texture',
            size: [texWidth, texHeight],
            format: 'rgba16float',
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
        });

        this.historyTexture = this.device.createTexture({
            label: 'Volumetric History Texture',
            size: [texWidth, texHeight],
            format: 'rgba16float',
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });

        this.uniformBuffer = this.device.createBuffer({
            label: 'Volumetric Uniforms',
            size: 80,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
    }

    private destroyTextures(): void {
        this.volumetricTexture?.destroy();
        this.historyTexture?.destroy();
        this.uniformBuffer?.destroy();
        this.volumetricTexture = null;
        this.historyTexture = null;
        this.uniformBuffer = null;
    }

    getUniformData(lightDirection: [number, number, number], lightColor: [number, number, number], lightIntensity: number): Float32Array {
        const data = new Float32Array(20);

        data[0] = this.config.density;
        data[1] = this.config.scattering;
        data[2] = this.config.absorption;
        data[3] = this.config.samples;

        data[4] = this.config.anisotropy;
        data[5] = this.config.heightFalloff;
        data[6] = this.config.groundLevel;
        data[7] = this.config.maxDistance;

        // Light direction
        data[8] = lightDirection[0];
        data[9] = lightDirection[1];
        data[10] = lightDirection[2];
        data[11] = 0; // padding

        // Light color * fog color * intensity
        data[12] = lightColor[0] * this.config.color[0];
        data[13] = lightColor[1] * this.config.color[1];
        data[14] = lightColor[2] * this.config.color[2];
        data[15] = lightIntensity;

        // Viewport and jitter
        data[16] = this.lastViewport[0];
        data[17] = this.lastViewport[1];
        data[18] = this.jitterPattern[this.frameIndex % 16];
        data[19] = this.frameIndex;

        return data;
    }

    updateUniforms(
        lightDirection: [number, number, number],
        lightColor: [number, number, number],
        lightIntensity: number
    ): void {
        if (!this.device || !this.uniformBuffer) return;
        const data = this.getUniformData(lightDirection, lightColor, lightIntensity);
        this.device.queue.writeBuffer(this.uniformBuffer, 0, data.buffer);
    }

    getTexture(): GPUTexture | null {
        return this.volumetricTexture;
    }

    updateBindGroup(
        depthTexture: GPUTexture,
        cameraUniformBuffer: GPUBuffer
    ): void {
        if (!this.device || !this.pipeline || !this.uniformBuffer || !this.volumetricTexture) return;

        this.bindGroup = this.device.createBindGroup({
            label: 'Volumetric Bind Group',
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.uniformBuffer } },
                { binding: 1, resource: { buffer: cameraUniformBuffer } },
                { binding: 2, resource: depthTexture.createView() },
                { binding: 3, resource: this.volumetricTexture.createView() },
            ],
        });
    }

    recordPass(commandEncoder: GPUCommandEncoder): void {
        const config = this.config; // Access config directly since getConfig returns a copy and strict local checks might fail or just for clarity
        if (!config.enabled || !this.pipeline || !this.bindGroup || !this.volumetricTexture) return;

        const width = this.volumetricTexture.width;
        const height = this.volumetricTexture.height;
        const workgroupsX = Math.ceil(width / 8);
        const workgroupsY = Math.ceil(height / 8);

        const pass = commandEncoder.beginComputePass({ label: 'Volumetric Pass' });
        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, this.bindGroup);
        pass.dispatchWorkgroups(workgroupsX, workgroupsY);
        pass.end();
    }

    tick(): void {
        this.frameIndex++;
    }

    subscribe(listener: (config: VolumetricConfig) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notifyListeners(): void {
        this.listeners.forEach(l => l(this.config));
    }

    destroy(): void {
        this.destroyTextures();
    }
}

export const volumetricLighting = new VolumetricLighting();
export default VolumetricLighting;
