// WebGPU Context Manager
// Handles device initialization with fallback support

export interface WebGPUState {
    device: GPUDevice;
    adapter: GPUAdapter;
    context: GPUCanvasContext;
    format: GPUTextureFormat;
    canvas: HTMLCanvasElement;
}

export class WebGPUContext {
    private static instance: WebGPUContext | null = null;
    private state: WebGPUState | null = null;
    private initPromise: Promise<WebGPUState> | null = null;

    static getInstance(): WebGPUContext {
        if (!WebGPUContext.instance) {
            WebGPUContext.instance = new WebGPUContext();
        }
        return WebGPUContext.instance;
    }

    async initialize(canvas: HTMLCanvasElement): Promise<WebGPUState> {
        if (this.state && this.state.canvas === canvas) {
            return this.state;
        }

        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = this.doInitialize(canvas);
        return this.initPromise;
    }

    private async doInitialize(canvas: HTMLCanvasElement): Promise<WebGPUState> {
        // Check WebGPU support
        if (!navigator.gpu) {
            throw new Error(
                'WebGPU is not supported in this browser. Please use Chrome 113+ or Edge 113+.'
            );
        }

        // Request adapter
        const adapter = await navigator.gpu.requestAdapter({
            powerPreference: 'high-performance',
        });

        if (!adapter) {
            throw new Error('Failed to get WebGPU adapter.');
        }

        // Log adapter info
        console.log('WebGPU Adapter:', adapter.info ?? 'No adapter info available');

        // Check for float32-filterable feature (needed for SSAO/SSR with r32float textures)
        const requiredFeatures: GPUFeatureName[] = [];
        if (adapter.features.has('float32-filterable')) {
            requiredFeatures.push('float32-filterable');
            console.log('float32-filterable feature enabled');
        } else {
            console.warn('float32-filterable feature not available - some GI effects may not work correctly');
        }

        // Request device with required features
        const device = await adapter.requestDevice({
            requiredFeatures,
            requiredLimits: {
                maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
                maxBufferSize: adapter.limits.maxBufferSize,
                maxComputeWorkgroupsPerDimension: adapter.limits.maxComputeWorkgroupsPerDimension,
            },
        });

        // Handle device loss
        device.lost.then((info) => {
            console.error('WebGPU device lost:', info.message);
            this.state = null;
            this.initPromise = null;
        });

        // Configure canvas context
        const context = canvas.getContext('webgpu');
        if (!context) {
            throw new Error('Failed to get WebGPU context from canvas.');
        }

        const format = navigator.gpu.getPreferredCanvasFormat();
        context.configure({
            device,
            format,
            alphaMode: 'premultiplied',
        });

        this.state = {
            device,
            adapter,
            context,
            format,
            canvas,
        };

        console.log('WebGPU initialized successfully');
        return this.state;
    }

    getState(): WebGPUState | null {
        return this.state;
    }

    destroy(): void {
        if (this.state) {
            this.state.device.destroy();
            this.state = null;
            this.initPromise = null;
        }
    }
}

export default WebGPUContext;
