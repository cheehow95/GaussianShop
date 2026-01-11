// Pipeline Cache Manager - Cache and reuse WebGPU pipelines
// Reduces pipeline compilation overhead

export interface PipelineKey {
    type: 'render' | 'compute';
    vertexShader?: string;
    fragmentShader?: string;
    computeShader?: string;
    topology?: GPUPrimitiveTopology;
    format?: GPUTextureFormat;
    blend?: boolean;
    depthTest?: boolean;
}

interface CachedPipeline {
    pipeline: GPURenderPipeline | GPUComputePipeline;
    key: string;
    lastUsed: number;
    useCount: number;
}

export class PipelineCache {
    private device: GPUDevice | null = null;
    private cache: Map<string, CachedPipeline> = new Map();
    private shaderModuleCache: Map<string, GPUShaderModule> = new Map();
    private maxCacheSize: number;

    constructor(maxCacheSize: number = 64) {
        this.maxCacheSize = maxCacheSize;
    }

    initialize(device: GPUDevice): void {
        this.device = device;
    }

    private hashKey(key: PipelineKey): string {
        return JSON.stringify(key);
    }

    /**
     * Get or create a shader module
     */
    getShaderModule(code: string, label?: string): GPUShaderModule {
        if (!this.device) {
            throw new Error('PipelineCache not initialized');
        }

        const cached = this.shaderModuleCache.get(code);
        if (cached) {
            return cached;
        }

        const module = this.device.createShaderModule({
            label: label || 'Cached Shader Module',
            code,
        });

        this.shaderModuleCache.set(code, module);
        return module;
    }

    /**
     * Get or create a compute pipeline
     */
    getComputePipeline(
        shader: string,
        entryPoint: string,
        bindGroupLayouts: GPUBindGroupLayout[],
        label?: string
    ): GPUComputePipeline {
        if (!this.device) {
            throw new Error('PipelineCache not initialized');
        }

        const key: PipelineKey = {
            type: 'compute',
            computeShader: shader + '::' + entryPoint,
        };
        const hash = this.hashKey(key);

        const cached = this.cache.get(hash);
        if (cached) {
            cached.lastUsed = performance.now();
            cached.useCount++;
            return cached.pipeline as GPUComputePipeline;
        }

        const module = this.getShaderModule(shader);
        const layout = this.device.createPipelineLayout({
            bindGroupLayouts,
        });

        const pipeline = this.device.createComputePipeline({
            label: label || `Compute Pipeline (${entryPoint})`,
            layout,
            compute: {
                module,
                entryPoint,
            },
        });

        this.addToCache(hash, pipeline, key);
        return pipeline;
    }

    /**
     * Get or create a render pipeline
     */
    getRenderPipeline(
        vertexShader: string,
        fragmentShader: string,
        vertexEntryPoint: string,
        fragmentEntryPoint: string,
        vertexBufferLayouts: GPUVertexBufferLayout[],
        bindGroupLayouts: GPUBindGroupLayout[],
        format: GPUTextureFormat,
        options: {
            topology?: GPUPrimitiveTopology;
            blend?: boolean;
            depthTest?: boolean;
            label?: string;
        } = {}
    ): GPURenderPipeline {
        if (!this.device) {
            throw new Error('PipelineCache not initialized');
        }

        const key: PipelineKey = {
            type: 'render',
            vertexShader: vertexShader + '::' + vertexEntryPoint,
            fragmentShader: fragmentShader + '::' + fragmentEntryPoint,
            topology: options.topology || 'triangle-list',
            format,
            blend: options.blend,
            depthTest: options.depthTest,
        };
        const hash = this.hashKey(key);

        const cached = this.cache.get(hash);
        if (cached) {
            cached.lastUsed = performance.now();
            cached.useCount++;
            return cached.pipeline as GPURenderPipeline;
        }

        const vertexModule = this.getShaderModule(vertexShader);
        const fragmentModule = vertexShader === fragmentShader
            ? vertexModule
            : this.getShaderModule(fragmentShader);

        const layout = this.device.createPipelineLayout({
            bindGroupLayouts,
        });

        const pipeline = this.device.createRenderPipeline({
            label: options.label || 'Cached Render Pipeline',
            layout,
            vertex: {
                module: vertexModule,
                entryPoint: vertexEntryPoint,
                buffers: vertexBufferLayouts,
            },
            fragment: {
                module: fragmentModule,
                entryPoint: fragmentEntryPoint,
                targets: [{
                    format,
                    blend: options.blend ? {
                        color: {
                            srcFactor: 'src-alpha',
                            dstFactor: 'one-minus-src-alpha',
                            operation: 'add',
                        },
                        alpha: {
                            srcFactor: 'one',
                            dstFactor: 'one-minus-src-alpha',
                            operation: 'add',
                        },
                    } : undefined,
                }],
            },
            primitive: {
                topology: options.topology || 'triangle-list',
            },
            depthStencil: options.depthTest ? {
                format: 'depth24plus',
                depthWriteEnabled: true,
                depthCompare: 'less',
            } : undefined,
        });

        this.addToCache(hash, pipeline, key);
        return pipeline;
    }

    private addToCache(
        hash: string,
        pipeline: GPURenderPipeline | GPUComputePipeline,
        key: PipelineKey
    ): void {
        // Evict old entries if cache is full
        if (this.cache.size >= this.maxCacheSize) {
            this.evictLeastUsed();
        }

        this.cache.set(hash, {
            pipeline,
            key: hash,
            lastUsed: performance.now(),
            useCount: 1,
        });
    }

    private evictLeastUsed(): void {
        let oldest: CachedPipeline | null = null;
        let oldestKey: string | null = null;

        for (const [key, cached] of this.cache.entries()) {
            if (!oldest || cached.lastUsed < oldest.lastUsed) {
                oldest = cached;
                oldestKey = key;
            }
        }

        if (oldestKey) {
            this.cache.delete(oldestKey);
        }
    }

    /**
     * Get cache statistics
     */
    getStats(): {
        pipelineCount: number;
        shaderModuleCount: number;
        hitRate: number;
    } {
        let totalUseCount = 0;
        for (const cached of this.cache.values()) {
            totalUseCount += cached.useCount;
        }

        return {
            pipelineCount: this.cache.size,
            shaderModuleCount: this.shaderModuleCache.size,
            hitRate: this.cache.size > 0
                ? (totalUseCount - this.cache.size) / totalUseCount
                : 0,
        };
    }

    /**
     * Clear cache
     */
    clear(): void {
        this.cache.clear();
        this.shaderModuleCache.clear();
    }

    dispose(): void {
        this.clear();
        this.device = null;
    }
}

export const pipelineCache = new PipelineCache();
export default PipelineCache;
