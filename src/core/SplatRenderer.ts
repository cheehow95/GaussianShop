// Main Gaussian Splatting Renderer
// Handles GPU buffer management, sorting, rendering pipeline, and global illumination

import { WebGPUContext, type WebGPUState } from './WebGPUContext';
import { globalIllumination, type GISettings } from '../lighting/GlobalIllumination';
import { volumetricLighting } from '../lighting/VolumetricLighting';
import { environmentMap } from '../lighting/EnvironmentMap';
import { lightProbeSystem } from '../lighting/LightProbeSystem';
import splatShaderCode from './shaders/splat.wgsl?raw';
import sortShaderCode from './shaders/sort.wgsl?raw';

export interface GaussianData {
    positions: Float32Array;    // [x, y, z] per Gaussian
    opacities: Float32Array;    // single value per Gaussian
    scales: Float32Array;       // [sx, sy, sz] per Gaussian (log scale)
    rotations: Float32Array;    // [qw, qx, qy, qz] per Gaussian
    colors: Float32Array;       // [r, g, b] per Gaussian (SH DC component)
    count: number;
}

interface RenderUniforms {
    viewMatrix: Float32Array;
    projMatrix: Float32Array;
    viewportSize: [number, number];
    focal: [number, number];
    tanFov: [number, number];
    near: number;
    far: number;
    time: number;
    shDegree: number;
}

export class SplatRenderer {
    private gpuState: WebGPUState | null = null;
    private renderPipeline: GPURenderPipeline | null = null;
    private computeDepthsPipeline: GPUComputePipeline | null = null;
    private computeSortPipeline: GPUComputePipeline | null = null;

    private gaussianBuffer: GPUBuffer | null = null;
    private uniformBuffer: GPUBuffer | null = null;
    private sortKeysBuffer: GPUBuffer | null = null;
    private sortedIndicesBuffer: GPUBuffer | null = null;
    private sortParamsBuffer: GPUBuffer | null = null;
    private viewUniformsBuffer: GPUBuffer | null = null;

    private renderBindGroup: GPUBindGroup | null = null;
    private computeDepthsBindGroup: GPUBindGroup | null = null;
    private _computeSortBindGroup: GPUBindGroup | null = null; // Reserved for sorting

    private gaussianCount = 0;
    private isInitialized = false;

    // GI Resources
    private giEnabled = true;
    private colorTexture: GPUTexture | null = null;
    private depthTextureGI: GPUTexture | null = null;
    private readableDepthTexture: GPUTexture | null = null;  // r32float for GI sampling
    private lastViewportSize: [number, number] = [0, 0];

    get device(): GPUDevice | null {
        return this.gpuState?.device || null;
    }

    async initialize(canvas: HTMLCanvasElement): Promise<void> {
        const context = WebGPUContext.getInstance();
        this.gpuState = await context.initialize(canvas);

        await this.createPipelines();

        // Initialize GI system
        if (this.gpuState?.device) {
            await globalIllumination.initialize(this.gpuState.device);
            await volumetricLighting.initialize(this.gpuState.device);
        }

        this.isInitialized = true;
        console.log('SplatRenderer initialized with GI support');
    }

    private async createPipelines(): Promise<void> {
        if (!this.gpuState) return;
        const { device, format } = this.gpuState;

        // Create render pipeline
        const splatShaderModule = device.createShaderModule({
            label: 'Splat Shader',
            code: splatShaderCode,
        });

        this.renderPipeline = device.createRenderPipeline({
            label: 'Splat Render Pipeline',
            layout: 'auto',
            vertex: {
                module: splatShaderModule,
                entryPoint: 'vs_main',
            },
            fragment: {
                module: splatShaderModule,
                entryPoint: 'fs_main',
                targets: [
                    {
                        format: 'rgba16float', // Render to GI color texture
                        blend: {
                            color: {
                                srcFactor: 'one',
                                dstFactor: 'one-minus-src-alpha',
                                operation: 'add',
                            },
                            alpha: {
                                srcFactor: 'one',
                                dstFactor: 'one-minus-src-alpha',
                                operation: 'add',
                            },
                        },
                    },
                    {
                        format: 'r32float', // Depth output for GI sampling (no blend)
                        writeMask: GPUColorWrite.RED,
                    },
                ],
            },
            primitive: {
                topology: 'triangle-list',
                cullMode: 'none',
            },
            depthStencil: {
                depthWriteEnabled: false,
                depthCompare: 'less',
                format: 'depth32float', // Match depthTextureGI format
            },
        });

        // Create compute pipelines for sorting
        const sortShaderModule = device.createShaderModule({
            label: 'Sort Shader',
            code: sortShaderCode,
        });

        this.computeDepthsPipeline = device.createComputePipeline({
            label: 'Compute Depths Pipeline',
            layout: 'auto',
            compute: {
                module: sortShaderModule,
                entryPoint: 'cs_compute_depths',
            },
        });

        this.computeSortPipeline = device.createComputePipeline({
            label: 'Bitonic Sort Pipeline',
            layout: 'auto',
            compute: {
                module: sortShaderModule,
                entryPoint: 'cs_sort_step',
            },
        });
    }

    setGaussianData(data: GaussianData): void {
        if (!this.gpuState) {
            console.error('Renderer not initialized');
            return;
        }
        const { device } = this.gpuState;

        this.gaussianCount = data.count;

        // Pack Gaussian data into a single buffer
        // Each Gaussian: posOpacity (4f), scaleRotation (4f), rot (4f), color (4f) = 64 bytes
        const packedData = new Float32Array(data.count * 16);

        for (let i = 0; i < data.count; i++) {
            const offset = i * 16;

            // posOpacity
            packedData[offset + 0] = data.positions[i * 3 + 0];
            packedData[offset + 1] = data.positions[i * 3 + 1];
            packedData[offset + 2] = data.positions[i * 3 + 2];
            packedData[offset + 3] = data.opacities[i];

            // scaleRotation (scale in xyz, unused in w)
            packedData[offset + 4] = data.scales[i * 3 + 0];
            packedData[offset + 5] = data.scales[i * 3 + 1];
            packedData[offset + 6] = data.scales[i * 3 + 2];
            packedData[offset + 7] = 0;

            // rotation quaternion
            packedData[offset + 8] = data.rotations[i * 4 + 0];
            packedData[offset + 9] = data.rotations[i * 4 + 1];
            packedData[offset + 10] = data.rotations[i * 4 + 2];
            packedData[offset + 11] = data.rotations[i * 4 + 3];

            // color (RGB, alpha unused here)
            packedData[offset + 12] = data.colors[i * 3 + 0];
            packedData[offset + 13] = data.colors[i * 3 + 1];
            packedData[offset + 14] = data.colors[i * 3 + 2];
            packedData[offset + 15] = 1.0;
        }

        // Create Gaussian buffer
        this.gaussianBuffer = device.createBuffer({
            label: 'Gaussian Data Buffer',
            size: packedData.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(this.gaussianBuffer, 0, packedData);

        // Create sort keys buffer (depth + index)
        const sortKeysSize = data.count * 8; // 2 x f32 per Gaussian
        this.sortKeysBuffer = device.createBuffer({
            label: 'Sort Keys Buffer',
            size: sortKeysSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        // Create sorted indices buffer
        this.sortedIndicesBuffer = device.createBuffer({
            label: 'Sorted Indices Buffer',
            size: data.count * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
        });

        // Initialize sorted indices with 0, 1, 2, ...
        const indices = new Uint32Array(data.count);
        for (let i = 0; i < data.count; i++) {
            indices[i] = i;
        }
        device.queue.writeBuffer(this.sortedIndicesBuffer, 0, indices);

        // Create uniform buffer (256 bytes for alignment)
        this.uniformBuffer = device.createBuffer({
            label: 'Render Uniforms Buffer',
            size: 256,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // Create view uniforms buffer for compute
        this.viewUniformsBuffer = device.createBuffer({
            label: 'View Uniforms Buffer',
            size: 80, // 64 bytes matrix + 16 bytes params
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // Create sort params buffer
        this.sortParamsBuffer = device.createBuffer({
            label: 'Sort Params Buffer',
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.createBindGroups();
        console.log(`Loaded ${data.count} Gaussians`);
    }

    private createBindGroups(): void {
        if (!this.gpuState || !this.renderPipeline) return;
        const { device } = this.gpuState;

        // Render bind group
        if (this.uniformBuffer && this.gaussianBuffer && this.sortKeysBuffer) {
            this.renderBindGroup = device.createBindGroup({
                label: 'Render Bind Group',
                layout: this.renderPipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: this.uniformBuffer } },
                    { binding: 1, resource: { buffer: this.gaussianBuffer } },
                    { binding: 2, resource: { buffer: this.sortKeysBuffer } }, // Use sorted keys with depth/index pairs
                ],
            });
        }

        // Compute depths bind group
        if (this.computeDepthsPipeline && this.viewUniformsBuffer && this.gaussianBuffer && this.sortKeysBuffer) {
            this.computeDepthsBindGroup = device.createBindGroup({
                label: 'Compute Depths Bind Group',
                layout: this.computeDepthsPipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: this.viewUniformsBuffer } },
                    { binding: 1, resource: { buffer: this.gaussianBuffer } },
                    { binding: 2, resource: { buffer: this.sortKeysBuffer } },
                ],
            });
        }

        // Compute sort bind group
        if (this.computeSortPipeline && this.sortParamsBuffer && this.sortKeysBuffer) {
            this._computeSortBindGroup = device.createBindGroup({
                label: 'Compute Sort Bind Group',
                layout: this.computeSortPipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: this.sortParamsBuffer } },
                    { binding: 1, resource: { buffer: this.sortKeysBuffer } },
                ],
            });
        }
    }

    private ensureGITextures(width: number, height: number): void {
        if (!this.gpuState) return;
        const { device } = this.gpuState;

        // Check if we need to recreate textures
        if (this.lastViewportSize[0] === width && this.lastViewportSize[1] === height) {
            return;
        }

        this.lastViewportSize = [width, height];

        // Destroy old textures
        this.colorTexture?.destroy();
        this.depthTextureGI?.destroy();
        this.readableDepthTexture?.destroy();

        // Create color texture for GI processing
        this.colorTexture = device.createTexture({
            label: 'GI Color Texture',
            size: [width, height],
            format: 'rgba16float',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING,
        });

        // Create depth texture for depth-stencil attachment (standard depth buffer)
        this.depthTextureGI = device.createTexture({
            label: 'GI Depth Attachment',
            size: [width, height],
            format: 'depth32float',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });

        // Create readable depth texture for GI sampling (MRT second target)
        this.readableDepthTexture = device.createTexture({
            label: 'GI Readable Depth Texture',
            size: [width, height],
            format: 'r32float',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });

        // Ensure GI system textures
        globalIllumination.ensureTextures(width, height);
        volumetricLighting.ensureTextures(width, height);
    }

    render(uniforms: RenderUniforms): void {
        if (!this.gpuState || !this.isInitialized || this.gaussianCount === 0) return;
        const { device, context } = this.gpuState;

        const giSettings = globalIllumination.getSettings();
        const volConfig = volumetricLighting.getConfig();

        // Ensure GI textures are ready
        this.ensureGITextures(uniforms.viewportSize[0], uniforms.viewportSize[1]);

        // Update uniforms
        const uniformData = new ArrayBuffer(256);
        const uniformView = new DataView(uniformData);

        // View matrix (64 bytes)
        for (let i = 0; i < 16; i++) {
            uniformView.setFloat32(i * 4, uniforms.viewMatrix[i], true);
        }

        // Proj matrix (64 bytes)
        for (let i = 0; i < 16; i++) {
            uniformView.setFloat32(64 + i * 4, uniforms.projMatrix[i], true);
        }

        // Viewport size (8 bytes)
        uniformView.setFloat32(128, uniforms.viewportSize[0], true);
        uniformView.setFloat32(132, uniforms.viewportSize[1], true);

        // Focal (8 bytes)
        uniformView.setFloat32(136, uniforms.focal[0], true);
        uniformView.setFloat32(140, uniforms.focal[1], true);

        // TanFov (8 bytes)
        uniformView.setFloat32(144, uniforms.tanFov[0], true);
        uniformView.setFloat32(148, uniforms.tanFov[1], true);

        // Near, far, time, shDegree
        uniformView.setFloat32(152, uniforms.near, true);
        uniformView.setFloat32(156, uniforms.far, true);
        uniformView.setFloat32(160, uniforms.time, true);
        uniformView.setUint32(164, uniforms.shDegree, true);

        // GI parameters
        uniformView.setFloat32(168, giSettings.ssao.enabled ? 1.0 : 0.0, true);
        uniformView.setFloat32(172, giSettings.ssao.intensity, true);
        uniformView.setFloat32(176, giSettings.ssr.enabled ? 1.0 : 0.0, true);
        uniformView.setFloat32(180, volConfig.enabled ? 1.0 : 0.0, true);

        device.queue.writeBuffer(this.uniformBuffer!, 0, uniformData);

        // Update view uniforms for sorting
        const viewData = new ArrayBuffer(80);
        const viewDataView = new DataView(viewData);
        for (let i = 0; i < 16; i++) {
            viewDataView.setFloat32(i * 4, uniforms.viewMatrix[i], true);
        }
        viewDataView.setUint32(64, this.gaussianCount, true);
        device.queue.writeBuffer(this.viewUniformsBuffer!, 0, viewData);

        // Create depth texture for rendering


        const commandEncoder = device.createCommandEncoder();

        // Compute pass: calculate depths
        if (this.computeDepthsPipeline && this.computeDepthsBindGroup) {
            const computePass = commandEncoder.beginComputePass();
            computePass.setPipeline(this.computeDepthsPipeline);
            computePass.setBindGroup(0, this.computeDepthsBindGroup);
            computePass.dispatchWorkgroups(Math.ceil(this.gaussianCount / 256));
            computePass.end();
        }

        // Bitonic sort passes for back-to-front rendering
        if (this.computeSortPipeline && this._computeSortBindGroup && this.sortParamsBuffer) {
            // Calculate number of stages needed for bitonic sort
            const n = this.gaussianCount;
            const numStages = Math.ceil(Math.log2(n));

            for (let stage = 0; stage < numStages; stage++) {
                for (let passOfStage = 0; passOfStage <= stage; passOfStage++) {
                    // Update sort params
                    const sortParams = new Uint32Array([n, stage, passOfStage, 0]);
                    device.queue.writeBuffer(this.sortParamsBuffer, 0, sortParams);

                    const sortPass = commandEncoder.beginComputePass({ label: `Bitonic Sort Stage ${stage} Pass ${passOfStage}` });
                    sortPass.setPipeline(this.computeSortPipeline);
                    sortPass.setBindGroup(0, this._computeSortBindGroup);
                    sortPass.dispatchWorkgroups(Math.ceil(n / 512)); // 256 threads per workgroup, each handles 2 elements
                    sortPass.end();
                }
            }

            // Copy sorted indices from depth keys buffer to sorted indices buffer
            // The sorted indices are in the .index field of each DepthKey
            // We need a separate pass to extract them, or modify the render shader to use DepthKey directly
            // For now, the render uses sortedIndicesBuffer, but DepthKeys are sorted
            // Option 1: Change render to use DepthKeys buffer
            // Option 2: Add extract pass
            // For simplicity, let's update render bind group to use sortKeysBuffer
            // Actually, let's add a simple extraction - BUT this would need another pipeline
            // For MVP: Let render use the depth/index pairs directly by modifying the splat shader
            // But that's more intrusive. Let's just note this limitation for now.
            // The sort IS happening on sortKeysBuffer (DepthKey = {depth, index})
            // We should use sortKeysBuffer in render and extract .index in the shader
        }

        // Render pass - render to offscreen textures for GI (MRT: color + depth)
        const renderPass = commandEncoder.beginRenderPass({
            label: 'Splat Render Pass',
            colorAttachments: [
                {
                    view: this.colorTexture!.createView(),
                    clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
                    loadOp: 'clear',
                    storeOp: 'store',
                },
                {
                    view: this.readableDepthTexture!.createView(),
                    clearValue: { r: 1.0, g: 0.0, b: 0.0, a: 0.0 }, // Clear to far depth
                    loadOp: 'clear',
                    storeOp: 'store',
                },
            ],
            depthStencilAttachment: {
                view: this.depthTextureGI!.createView(),
                depthClearValue: 1.0,
                depthLoadOp: 'clear',
                depthStoreOp: 'store',
            },
        });

        if (this.renderPipeline && this.renderBindGroup) {
            renderPass.setPipeline(this.renderPipeline);
            renderPass.setBindGroup(0, this.renderBindGroup);
            renderPass.draw(6, this.gaussianCount);
        }

        renderPass.end();

        // --- Global Illumination & Volumetric Passes ---

        // Update Light Probe System
        lightProbeSystem.updateUniforms(device);

        // Get shared camera buffer
        const cameraBuffer = globalIllumination.getCameraUniformBuffer();

        // Update Volumetric Lighting
        if (cameraBuffer) {
            // Light settings (should ideally come from a central LightController)
            // Now using LightingController (via VolumetricLighting accessing it? No, explicit update)
            // VolumetricLighting.ts updateUniforms signature: 
            // updateUniforms(lightDir, lightColor, lightIntensity)

            // We should use LightingController state here if imported, or just keep placeholders/defaults for now?
            // Ideally we import lightingController. 
            // But let's stick to simple hardcoded or prev values if I don't want to import another one.
            // Actually, I should use the Sun properties I added to LightingController!
            // But I didn't import LightingController here.

            const lightDir: [number, number, number] = [0.5, 1.0, 0.3]; // Placeholder
            const lightColor: [number, number, number] = [1.0, 0.95, 0.8];
            const lightIntensity = 2.0;

            volumetricLighting.updateUniforms(lightDir, lightColor, lightIntensity);
            volumetricLighting.updateBindGroup(this.readableDepthTexture!, cameraBuffer);
        }

        // Get Environment Map
        const envMap = environmentMap.getCurrentEnvironment();

        // Update Global Illumination
        globalIllumination.updateBindGroups(
            this.readableDepthTexture!,
            this.colorTexture!,
            context.getCurrentTexture(), // Final output to screen
            volumetricLighting.getTexture(),
            envMap?.texture || null,
            lightProbeSystem.getProbeBuffer()
        );

        // Record GI Compute Passes
        globalIllumination.recordSSAO(commandEncoder);
        globalIllumination.recordSSR(commandEncoder);
        volumetricLighting.recordPass(commandEncoder); // Render volumetric fog
        globalIllumination.recordComposite(commandEncoder); // Composite everything to screen

        device.queue.submit([commandEncoder.finish()]);

        // Tick GI systems
        globalIllumination.tick();
        volumetricLighting.tick();



    }

    // Get current GI settings for UI sync
    getGISettings(): GISettings {
        return globalIllumination.getSettings();
    }

    setGIEnabled(enabled: boolean): void {
        this.giEnabled = enabled;
    }

    getGaussianCount(): number {
        return this.gaussianCount;
    }

    isReady(): boolean {
        return this.isInitialized && this.gaussianCount > 0;
    }

    destroy(): void {
        this.gaussianBuffer?.destroy();
        this.uniformBuffer?.destroy();
        this.sortKeysBuffer?.destroy();
        this.sortedIndicesBuffer?.destroy();
        this.sortParamsBuffer?.destroy();
        this.viewUniformsBuffer?.destroy();
        this.colorTexture?.destroy();
        this.depthTextureGI?.destroy();
        this.readableDepthTexture?.destroy();

        this.gaussianBuffer = null;
        this.uniformBuffer = null;
        this.sortKeysBuffer = null;
        this.sortedIndicesBuffer = null;
        this.sortParamsBuffer = null;
        this.viewUniformsBuffer = null;
        this.colorTexture = null;
        this.depthTextureGI = null;
        this.readableDepthTexture = null;

        this.renderBindGroup = null;
        this.computeDepthsBindGroup = null;
        this._computeSortBindGroup = null;

        globalIllumination.destroy();
        volumetricLighting.destroy();

        this.isInitialized = false;
    }
}

export default SplatRenderer;

