// GPU Sorter - WebGPU-based parallel sorting for Gaussians
// Uses radix sort compute shaders for high-performance depth sorting

import radixSortShader from './shaders/radix_sort.wgsl?raw';

export interface SortResult {
    sortedIndices: Uint32Array;
    sortTimeMs: number;
}

export class GPUSorter {
    private device: GPUDevice | null = null;
    private histogramPipeline: GPUComputePipeline | null = null;
    private prefixSumPipeline: GPUComputePipeline | null = null;
    private scatterPipeline: GPUComputePipeline | null = null;

    private keysBuffer: GPUBuffer | null = null;
    private valuesBuffer: GPUBuffer | null = null;
    private keysOutBuffer: GPUBuffer | null = null;
    private valuesOutBuffer: GPUBuffer | null = null;
    private histogramBuffer: GPUBuffer | null = null;
    private prefixSumsBuffer: GPUBuffer | null = null;
    private uniformBuffer: GPUBuffer | null = null;
    private readbackBuffer: GPUBuffer | null = null;

    private bindGroupLayout: GPUBindGroupLayout | null = null;
    private maxCount: number = 0;

    private static readonly RADIX_BITS = 4;
    private static readonly RADIX_SIZE = 16; // 2^4
    private static readonly WORKGROUP_SIZE = 256;
    private static readonly NUM_PASSES = 8; // 32 bits / 4 bits per pass

    async initialize(device: GPUDevice): Promise<void> {
        this.device = device;

        // Create shader module
        const shaderModule = device.createShaderModule({
            label: 'Radix Sort Shader',
            code: radixSortShader,
        });

        // Create bind group layout
        this.bindGroupLayout = device.createBindGroupLayout({
            label: 'Radix Sort Bind Group Layout',
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
            ],
        });

        const pipelineLayout = device.createPipelineLayout({
            label: 'Radix Sort Pipeline Layout',
            bindGroupLayouts: [this.bindGroupLayout],
        });

        // Create pipelines
        this.histogramPipeline = device.createComputePipeline({
            label: 'Histogram Pipeline',
            layout: pipelineLayout,
            compute: {
                module: shaderModule,
                entryPoint: 'build_histogram',
            },
        });

        this.prefixSumPipeline = device.createComputePipeline({
            label: 'Prefix Sum Pipeline',
            layout: pipelineLayout,
            compute: {
                module: shaderModule,
                entryPoint: 'prefix_sum',
            },
        });

        this.scatterPipeline = device.createComputePipeline({
            label: 'Scatter Pipeline',
            layout: pipelineLayout,
            compute: {
                module: shaderModule,
                entryPoint: 'scatter',
            },
        });

        // Create uniform buffer
        this.uniformBuffer = device.createBuffer({
            label: 'Sort Uniforms',
            size: 16, // count, pass, padding
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // Create histogram buffer
        this.histogramBuffer = device.createBuffer({
            label: 'Histogram Buffer',
            size: GPUSorter.RADIX_SIZE * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        // Create prefix sums buffer
        this.prefixSumsBuffer = device.createBuffer({
            label: 'Prefix Sums Buffer',
            size: GPUSorter.RADIX_SIZE * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        });
    }

    private ensureBuffers(count: number): void {
        if (!this.device) return;

        if (count <= this.maxCount) return;

        // Dispose old buffers
        this.keysBuffer?.destroy();
        this.valuesBuffer?.destroy();
        this.keysOutBuffer?.destroy();
        this.valuesOutBuffer?.destroy();
        this.readbackBuffer?.destroy();

        const bufferSize = count * 4;

        this.keysBuffer = this.device.createBuffer({
            label: 'Keys Input',
            size: bufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        this.valuesBuffer = this.device.createBuffer({
            label: 'Values Input',
            size: bufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        this.keysOutBuffer = this.device.createBuffer({
            label: 'Keys Output',
            size: bufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        });

        this.valuesOutBuffer = this.device.createBuffer({
            label: 'Values Output',
            size: bufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        });

        this.readbackBuffer = this.device.createBuffer({
            label: 'Readback Buffer',
            size: bufferSize,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        });

        this.maxCount = count;
    }

    /**
     * Sort indices by depth keys on GPU
     * @param depthKeys Float32Array of depth values (camera.z * position)
     * @returns Sorted indices
     */
    async sort(depthKeys: Float32Array): Promise<SortResult> {
        if (!this.device) {
            throw new Error('GPUSorter not initialized');
        }

        const startTime = performance.now();
        const count = depthKeys.length;

        // Ensure buffers are large enough
        this.ensureBuffers(count);

        // Convert float depths to sortable uint32 keys
        const keys = new Uint32Array(count);
        for (let i = 0; i < count; i++) {
            // Float to uint32 that preserves sort order
            const floatBits = new Float32Array([depthKeys[i]]);
            const uintBits = new Uint32Array(floatBits.buffer)[0];
            // Flip sign bit for correct ordering
            keys[i] = (uintBits ^ ((uintBits >> 31) | 0x80000000)) >>> 0;
        }

        // Initialize indices
        const indices = new Uint32Array(count);
        for (let i = 0; i < count; i++) {
            indices[i] = i;
        }

        // Upload data
        this.device.queue.writeBuffer(this.keysBuffer!, 0, keys);
        this.device.queue.writeBuffer(this.valuesBuffer!, 0, indices);

        // Run sorting passes
        for (let pass = 0; pass < GPUSorter.NUM_PASSES; pass++) {
            await this.runSortPass(count, pass);
        }

        // Read back sorted indices
        const commandEncoder = this.device.createCommandEncoder();
        commandEncoder.copyBufferToBuffer(
            this.valuesOutBuffer!, 0,
            this.readbackBuffer!, 0,
            count * 4
        );
        this.device.queue.submit([commandEncoder.finish()]);

        await this.readbackBuffer!.mapAsync(GPUMapMode.READ);
        const sortedIndices = new Uint32Array(
            this.readbackBuffer!.getMappedRange().slice(0)
        );
        this.readbackBuffer!.unmap();

        return {
            sortedIndices,
            sortTimeMs: performance.now() - startTime,
        };
    }

    private async runSortPass(count: number, pass: number): Promise<void> {
        if (!this.device || !this.bindGroupLayout) return;

        // Update uniforms
        const uniforms = new Uint32Array([count, pass, 0, 0]);
        this.device.queue.writeBuffer(this.uniformBuffer!, 0, uniforms);

        // Clear histogram
        const zeroHistogram = new Uint32Array(GPUSorter.RADIX_SIZE);
        this.device.queue.writeBuffer(this.histogramBuffer!, 0, zeroHistogram);

        // Use alternating buffers
        const keysIn = pass % 2 === 0 ? this.keysBuffer! : this.keysOutBuffer!;
        const keysOut = pass % 2 === 0 ? this.keysOutBuffer! : this.keysBuffer!;
        const valuesIn = pass % 2 === 0 ? this.valuesBuffer! : this.valuesOutBuffer!;
        const valuesOut = pass % 2 === 0 ? this.valuesOutBuffer! : this.valuesBuffer!;

        // Create bind group
        const bindGroup = this.device.createBindGroup({
            layout: this.bindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.uniformBuffer! } },
                { binding: 1, resource: { buffer: keysIn } },
                { binding: 2, resource: { buffer: keysOut } },
                { binding: 3, resource: { buffer: valuesIn } },
                { binding: 4, resource: { buffer: valuesOut } },
                { binding: 5, resource: { buffer: this.histogramBuffer! } },
                { binding: 6, resource: { buffer: this.prefixSumsBuffer! } },
            ],
        });

        const workgroupCount = Math.ceil(count / GPUSorter.WORKGROUP_SIZE);

        const commandEncoder = this.device.createCommandEncoder();

        // Phase 1: Build histogram
        const histogramPass = commandEncoder.beginComputePass();
        histogramPass.setPipeline(this.histogramPipeline!);
        histogramPass.setBindGroup(0, bindGroup);
        histogramPass.dispatchWorkgroups(workgroupCount);
        histogramPass.end();

        // Phase 2: Prefix sum
        const prefixPass = commandEncoder.beginComputePass();
        prefixPass.setPipeline(this.prefixSumPipeline!);
        prefixPass.setBindGroup(0, bindGroup);
        prefixPass.dispatchWorkgroups(1);
        prefixPass.end();

        // Phase 3: Scatter
        const scatterPass = commandEncoder.beginComputePass();
        scatterPass.setPipeline(this.scatterPipeline!);
        scatterPass.setBindGroup(0, bindGroup);
        scatterPass.dispatchWorkgroups(workgroupCount);
        scatterPass.end();

        this.device.queue.submit([commandEncoder.finish()]);
        await this.device.queue.onSubmittedWorkDone();
    }

    /**
     * Simple CPU-based counting sort for comparison/fallback
     */
    static cpuSort(depthKeys: Float32Array): Uint32Array {
        const count = depthKeys.length;
        const indices = new Uint32Array(count);

        // Initialize indices
        for (let i = 0; i < count; i++) {
            indices[i] = i;
        }

        // Sort indices by depth (back to front)
        const keysArray = Array.from(depthKeys);
        const indicesArray = Array.from(indices);

        indicesArray.sort((a, b) => keysArray[b] - keysArray[a]);

        return new Uint32Array(indicesArray);
    }

    dispose(): void {
        this.keysBuffer?.destroy();
        this.valuesBuffer?.destroy();
        this.keysOutBuffer?.destroy();
        this.valuesOutBuffer?.destroy();
        this.histogramBuffer?.destroy();
        this.prefixSumsBuffer?.destroy();
        this.uniformBuffer?.destroy();
        this.readbackBuffer?.destroy();

        this.keysBuffer = null;
        this.valuesBuffer = null;
        this.keysOutBuffer = null;
        this.valuesOutBuffer = null;
        this.histogramBuffer = null;
        this.prefixSumsBuffer = null;
        this.uniformBuffer = null;
        this.readbackBuffer = null;
        this.device = null;
    }
}

export const gpuSorter = new GPUSorter();
export default GPUSorter;
