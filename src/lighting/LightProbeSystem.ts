// Light Probe System
// Manages spherical harmonics probes for diffuse global illumination

export interface SHCoefficients {
    // 9 RGB coefficients for 2nd order SH (L0, L1, L2)
    coefficients: Float32Array; // 9 * 3 = 27 floats
}

export interface LightProbe {
    id: string;
    position: [number, number, number];
    radius: number;
    sh: SHCoefficients;
    visible: boolean;
    autoUpdate: boolean;
}

export interface ProbeGridConfig {
    enabled: boolean;
    resolution: [number, number, number];   // Grid dimensions
    boundsMin: [number, number, number];    // World space min
    boundsMax: [number, number, number];    // World space max
    updateFrequency: 'static' | 'dynamic' | 'manual';
    blendDistance: number;                   // Probe blending distance
    shOrder: 2 | 3;                         // SH order (2 = 9 coeffs, 3 = 16 coeffs)
}

const DEFAULT_GRID_CONFIG: ProbeGridConfig = {
    enabled: true,
    resolution: [4, 4, 4],
    boundsMin: [-10, -10, -10],
    boundsMax: [10, 10, 10],
    updateFrequency: 'static',
    blendDistance: 1.0,
    shOrder: 2,
};

// Precomputed SH basis function coefficients
const SH_COSINE_LOBE_COEFFICIENTS = {
    L0: 0.8862269254527579,    // PI
    L1: 1.0233267079464883,    // 2*PI/3
    L2: 0.4954159260409261,    // PI/4
};

export class LightProbeSystem {
    private config: ProbeGridConfig = { ...DEFAULT_GRID_CONFIG };
    private probes: LightProbe[] = [];
    private device: GPUDevice | null = null;
    private listeners: Set<() => void> = new Set();

    // GPU Resources
    private probeDataBuffer: GPUBuffer | null = null;
    private probeGridBuffer: GPUBuffer | null = null;
    private probeUniformBuffer: GPUBuffer | null = null;

    private needsUpdate = true;

    async initialize(device: GPUDevice): Promise<void> {
        this.device = device;
        this.createDefaultGrid();
        console.log('LightProbeSystem initialized');
    }

    private createDefaultGrid(): void {
        this.probes = [];
        const [rx, ry, rz] = this.config.resolution;
        const [minX, minY, minZ] = this.config.boundsMin;
        const [maxX, maxY, maxZ] = this.config.boundsMax;

        const stepX = (maxX - minX) / Math.max(1, rx - 1);
        const stepY = (maxY - minY) / Math.max(1, ry - 1);
        const stepZ = (maxZ - minZ) / Math.max(1, rz - 1);

        let id = 0;
        for (let z = 0; z < rz; z++) {
            for (let y = 0; y < ry; y++) {
                for (let x = 0; x < rx; x++) {
                    const position: [number, number, number] = [
                        minX + x * stepX,
                        minY + y * stepY,
                        minZ + z * stepZ,
                    ];

                    this.probes.push({
                        id: `probe_${id++}`,
                        position,
                        radius: Math.min(stepX, stepY, stepZ) * 0.5,
                        sh: this.createDefaultSH(),
                        visible: true,
                        autoUpdate: this.config.updateFrequency === 'dynamic',
                    });
                }
            }
        }

        this.needsUpdate = true;
    }

    private createDefaultSH(): SHCoefficients {
        // Default ambient-only SH (bright gray ambient)
        const coeffs = new Float32Array(27);

        // L0 (DC) component - ambient light
        coeffs[0] = 0.5;  // R
        coeffs[1] = 0.5;  // G
        coeffs[2] = 0.5;  // B

        // L1 components (directional) - slight top-down bias
        coeffs[3] = 0.0; coeffs[4] = 0.0; coeffs[5] = 0.0;   // L1-1
        coeffs[6] = 0.2; coeffs[7] = 0.2; coeffs[8] = 0.2;   // L10 (up)
        coeffs[9] = 0.0; coeffs[10] = 0.0; coeffs[11] = 0.0;  // L11

        // L2 components - zero for simple ambient
        for (let i = 12; i < 27; i++) {
            coeffs[i] = 0.0;
        }

        return { coefficients: coeffs };
    }

    getConfig(): ProbeGridConfig {
        return { ...this.config };
    }

    setEnabled(enabled: boolean): void {
        this.config.enabled = enabled;
        this.notifyListeners();
    }

    setResolution(resolution: [number, number, number]): void {
        this.config.resolution = [...resolution];
        this.createDefaultGrid();
        this.notifyListeners();
    }

    setBounds(min: [number, number, number], max: [number, number, number]): void {
        this.config.boundsMin = [...min];
        this.config.boundsMax = [...max];
        this.createDefaultGrid();
        this.notifyListeners();
    }

    setBlendDistance(distance: number): void {
        this.config.blendDistance = Math.max(0.1, distance);
        this.notifyListeners();
    }

    setUpdateFrequency(frequency: 'static' | 'dynamic' | 'manual'): void {
        this.config.updateFrequency = frequency;
        this.probes.forEach(p => p.autoUpdate = frequency === 'dynamic');
        this.notifyListeners();
    }

    // Update SH coefficients from environment map
    updateFromEnvironment(
        envTexture: GPUTexture | null,
        rotation: number = 0
    ): void {
        if (!envTexture) {
            // Reset to default ambient
            this.probes.forEach(probe => {
                probe.sh = this.createDefaultSH();
            });
            this.needsUpdate = true;
            return;
        }

        // In a full implementation, this would:
        // 1. Render cubemap at each probe position
        // 2. Project to SH coefficients using GPU compute
        // For now, we use a simplified approach

        this.needsUpdate = true;
    }

    updateUniforms(device: GPUDevice): void {
        this.device = device;
        if (!this.config.enabled || this.probes.length === 0) return;

        // Create buffer if needed or resize
        const probeSize = 32 * 4; // 32 floats * 4 bytes
        const totalSize = this.probes.length * probeSize;

        if (!this.probeDataBuffer || this.probeDataBuffer.size < totalSize) {
            this.probeDataBuffer?.destroy();
            this.probeDataBuffer = device.createBuffer({
                label: 'Light Probe Buffer',
                size: totalSize,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });
        }

        if (this.needsUpdate) {
            const data = this.getGPUData();
            if (data) {
                device.queue.writeBuffer(this.probeDataBuffer, 0, data.buffer);
            }
            this.needsUpdate = false;
        }
    }

    getProbeBuffer(): GPUBuffer | null {
        return this.probeDataBuffer;
    }

    // Set probe SH from direction and color (for simple directional light)
    setDirectionalLight(direction: [number, number, number], color: [number, number, number], intensity: number): void {
        const [dx, dy, dz] = direction;
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const ndx = dx / len;
        const ndy = dy / len;
        const ndz = dz / len;

        this.probes.forEach(probe => {
            const coeffs = probe.sh.coefficients;

            // L0 (ambient)
            coeffs[0] = color[0] * intensity * SH_COSINE_LOBE_COEFFICIENTS.L0 * 0.3;
            coeffs[1] = color[1] * intensity * SH_COSINE_LOBE_COEFFICIENTS.L0 * 0.3;
            coeffs[2] = color[2] * intensity * SH_COSINE_LOBE_COEFFICIENTS.L0 * 0.3;

            // L1 components (directional)
            const l1Scale = SH_COSINE_LOBE_COEFFICIENTS.L1;
            coeffs[3] = color[0] * intensity * l1Scale * ndy;
            coeffs[4] = color[1] * intensity * l1Scale * ndy;
            coeffs[5] = color[2] * intensity * l1Scale * ndy;

            coeffs[6] = color[0] * intensity * l1Scale * ndz;
            coeffs[7] = color[1] * intensity * l1Scale * ndz;
            coeffs[8] = color[2] * intensity * l1Scale * ndz;

            coeffs[9] = color[0] * intensity * l1Scale * ndx;
            coeffs[10] = color[1] * intensity * l1Scale * ndx;
            coeffs[11] = color[2] * intensity * l1Scale * ndx;
        });

        this.needsUpdate = true;
    }

    // Get interpolated SH at world position
    sampleAtPosition(position: [number, number, number]): SHCoefficients {
        if (this.probes.length === 0) {
            return this.createDefaultSH();
        }

        // Find nearby probes and blend
        const result = new Float32Array(27);
        let totalWeight = 0;

        for (const probe of this.probes) {
            const dx = position[0] - probe.position[0];
            const dy = position[1] - probe.position[1];
            const dz = position[2] - probe.position[2];
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

            if (dist < this.config.blendDistance * 2) {
                const weight = Math.max(0, 1 - dist / (this.config.blendDistance * 2));
                const w2 = weight * weight;

                for (let i = 0; i < 27; i++) {
                    result[i] += probe.sh.coefficients[i] * w2;
                }
                totalWeight += w2;
            }
        }

        if (totalWeight > 0) {
            for (let i = 0; i < 27; i++) {
                result[i] /= totalWeight;
            }
        }

        return { coefficients: result };
    }

    // Get GPU buffer data for rendering
    getGPUData(): Float32Array | null {
        if (!this.config.enabled || this.probes.length === 0) {
            return null;
        }

        // Pack probe data: position (3) + radius (1) + sh (27) = 31 floats per probe
        // Pad to 32 for alignment
        const probeSize = 32;
        const data = new Float32Array(this.probes.length * probeSize);

        for (let i = 0; i < this.probes.length; i++) {
            const probe = this.probes[i];
            const offset = i * probeSize;

            data[offset] = probe.position[0];
            data[offset + 1] = probe.position[1];
            data[offset + 2] = probe.position[2];
            data[offset + 3] = probe.radius;

            for (let j = 0; j < 27; j++) {
                data[offset + 4 + j] = probe.sh.coefficients[j];
            }
        }

        return data;
    }

    getProbeCount(): number {
        return this.probes.length;
    }

    getProbes(): LightProbe[] {
        return this.probes.map(p => ({
            ...p,
            sh: { coefficients: new Float32Array(p.sh.coefficients) },
        }));
    }

    // Manual update trigger
    updateProbes(): void {
        this.needsUpdate = true;
        this.notifyListeners();
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notifyListeners(): void {
        this.listeners.forEach(l => l());
    }

    destroy(): void {
        this.probeDataBuffer?.destroy();
        this.probeGridBuffer?.destroy();
        this.probeUniformBuffer?.destroy();
        this.probeDataBuffer = null;
        this.probeGridBuffer = null;
        this.probeUniformBuffer = null;
        this.probes = [];
    }
}

export const lightProbeSystem = new LightProbeSystem();
export default LightProbeSystem;
