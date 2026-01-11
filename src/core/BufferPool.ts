// Buffer Pool - Efficient GPU buffer reuse
// Reduces allocation overhead by pooling and recycling buffers

export interface PooledBuffer {
    buffer: GPUBuffer;
    size: number;
    inUse: boolean;
    lastUsed: number;
}

export interface BufferRequest {
    size: number;
    usage: GPUBufferUsageFlags;
    label?: string;
}

export class BufferPool {
    private device: GPUDevice | null = null;
    private pools: Map<GPUBufferUsageFlags, PooledBuffer[]> = new Map();
    private maxPoolSize: number;
    private maxIdleTime: number; // ms

    constructor(maxPoolSize: number = 32, maxIdleTime: number = 30000) {
        this.maxPoolSize = maxPoolSize;
        this.maxIdleTime = maxIdleTime;
    }

    initialize(device: GPUDevice): void {
        this.device = device;
    }

    /**
     * Get a buffer from the pool or create a new one
     */
    acquire(request: BufferRequest): GPUBuffer {
        if (!this.device) {
            throw new Error('BufferPool not initialized');
        }

        const pool = this.pools.get(request.usage) || [];

        // Find a suitable buffer in the pool
        for (const pooled of pool) {
            if (!pooled.inUse && pooled.size >= request.size) {
                pooled.inUse = true;
                pooled.lastUsed = performance.now();
                return pooled.buffer;
            }
        }

        // Create new buffer
        const buffer = this.device.createBuffer({
            label: request.label || 'Pooled Buffer',
            size: request.size,
            usage: request.usage,
        });

        const pooled: PooledBuffer = {
            buffer,
            size: request.size,
            inUse: true,
            lastUsed: performance.now(),
        };

        pool.push(pooled);
        this.pools.set(request.usage, pool);

        return buffer;
    }

    /**
     * Return a buffer to the pool for reuse
     */
    release(buffer: GPUBuffer): void {
        for (const pool of this.pools.values()) {
            for (const pooled of pool) {
                if (pooled.buffer === buffer) {
                    pooled.inUse = false;
                    pooled.lastUsed = performance.now();
                    return;
                }
            }
        }
    }

    /**
     * Clean up old unused buffers
     */
    cleanup(): void {
        const now = performance.now();

        for (const [usage, pool] of this.pools.entries()) {
            const active: PooledBuffer[] = [];

            for (const pooled of pool) {
                const isOld = now - pooled.lastUsed > this.maxIdleTime;
                const poolOverflow = active.length >= this.maxPoolSize;

                if (!pooled.inUse && (isOld || poolOverflow)) {
                    pooled.buffer.destroy();
                } else {
                    active.push(pooled);
                }
            }

            this.pools.set(usage, active);
        }
    }

    /**
     * Get pool statistics
     */
    getStats(): { total: number; inUse: number; byUsage: Map<GPUBufferUsageFlags, { total: number; inUse: number }> } {
        let total = 0;
        let inUse = 0;
        const byUsage = new Map<GPUBufferUsageFlags, { total: number; inUse: number }>();

        for (const [usage, pool] of this.pools.entries()) {
            let usageTotal = 0;
            let usageInUse = 0;

            for (const pooled of pool) {
                usageTotal++;
                if (pooled.inUse) usageInUse++;
            }

            byUsage.set(usage, { total: usageTotal, inUse: usageInUse });
            total += usageTotal;
            inUse += usageInUse;
        }

        return { total, inUse, byUsage };
    }

    /**
     * Destroy all pooled buffers
     */
    dispose(): void {
        for (const pool of this.pools.values()) {
            for (const pooled of pool) {
                pooled.buffer.destroy();
            }
        }
        this.pools.clear();
        this.device = null;
    }
}

// Ring buffer for streaming uploads
export class RingBuffer {
    private device: GPUDevice;
    private buffer: GPUBuffer;
    private size: number;
    private offset: number = 0;
    private generation: number = 0;

    constructor(device: GPUDevice, size: number, usage: GPUBufferUsageFlags) {
        this.device = device;
        this.size = size;
        this.buffer = device.createBuffer({
            label: 'Ring Buffer',
            size,
            usage: usage | GPUBufferUsage.COPY_DST,
        });
    }

    /**
     * Allocate space in the ring buffer
     * Returns offset and whether a new generation started
     */
    allocate(bytes: number): { offset: number; wrapped: boolean } {
        bytes = Math.ceil(bytes / 256) * 256; // Align to 256 bytes

        let wrapped = false;

        if (this.offset + bytes > this.size) {
            this.offset = 0;
            this.generation++;
            wrapped = true;
        }

        const offset = this.offset;
        this.offset += bytes;

        return { offset, wrapped };
    }

    /**
     * Write data to the ring buffer
     */
    write(data: BufferSource): { offset: number; wrapped: boolean } {
        const bytes = data instanceof ArrayBuffer ? data.byteLength : data.byteLength;
        const { offset, wrapped } = this.allocate(bytes);

        if (data instanceof ArrayBuffer) {
            this.device.queue.writeBuffer(this.buffer, offset, data);
        } else {
            this.device.queue.writeBuffer(this.buffer, offset, data);
        }

        return { offset, wrapped };
    }

    /**
     * Get the underlying GPU buffer
     */
    getBuffer(): GPUBuffer {
        return this.buffer;
    }

    /**
     * Get current generation (increments on wrap)
     */
    getGeneration(): number {
        return this.generation;
    }

    /**
     * Reset the ring buffer
     */
    reset(): void {
        this.offset = 0;
        this.generation = 0;
    }

    dispose(): void {
        this.buffer.destroy();
    }
}

export const bufferPool = new BufferPool();
export default BufferPool;
