// LOD Manager - Level of Detail system for Gaussians
// Reduces rendered Gaussian count based on distance

export interface LODLevel {
    distance: number;      // Camera distance threshold
    keepRatio: number;     // Fraction of Gaussians to keep (0-1)
    skipFactor: number;    // Skip every N Gaussians
}

export interface LODConfig {
    enabled: boolean;
    levels: LODLevel[];
    dynamicAdjust: boolean;  // Auto-adjust based on FPS
    targetFps: number;
}

export class LODManager {
    private config: LODConfig;
    private currentFps: number = 60;
    private fpsHistory: number[] = [];
    private readonly FPS_HISTORY_SIZE = 30;

    constructor() {
        this.config = {
            enabled: true,
            levels: [
                { distance: 0, keepRatio: 1.0, skipFactor: 1 },       // Full detail
                { distance: 10, keepRatio: 0.75, skipFactor: 1 },    // 75%
                { distance: 25, keepRatio: 0.5, skipFactor: 2 },     // 50%
                { distance: 50, keepRatio: 0.25, skipFactor: 4 },    // 25%
                { distance: 100, keepRatio: 0.1, skipFactor: 10 },   // 10%
            ],
            dynamicAdjust: true,
            targetFps: 60,
        };
    }

    /**
     * Update FPS tracker
     */
    updateFps(fps: number): void {
        this.fpsHistory.push(fps);
        if (this.fpsHistory.length > this.FPS_HISTORY_SIZE) {
            this.fpsHistory.shift();
        }
        this.currentFps = this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length;

        // Dynamic adjustment
        if (this.config.dynamicAdjust) {
            this.adjustLOD();
        }
    }

    /**
     * Dynamic LOD adjustment based on FPS
     */
    private adjustLOD(): void {
        const fpsRatio = this.currentFps / this.config.targetFps;

        if (fpsRatio < 0.8) {
            // FPS too low, increase aggressiveness
            for (const level of this.config.levels) {
                level.distance *= 0.9;
                level.keepRatio = Math.max(0.05, level.keepRatio * 0.95);
            }
        } else if (fpsRatio > 1.1 && this.currentFps > this.config.targetFps) {
            // FPS above target, relax LOD
            for (const level of this.config.levels) {
                level.distance *= 1.05;
                level.keepRatio = Math.min(1.0, level.keepRatio * 1.02);
            }
        }
    }

    /**
     * Get LOD level for a given distance
     */
    getLODLevel(distance: number): LODLevel {
        if (!this.config.enabled) {
            return { distance: 0, keepRatio: 1, skipFactor: 1 };
        }

        // Find appropriate LOD level
        let level = this.config.levels[0];
        for (const l of this.config.levels) {
            if (distance >= l.distance) {
                level = l;
            } else {
                break;
            }
        }
        return level;
    }

    /**
     * Filter Gaussians based on LOD and camera distance
     */
    filterGaussians(
        positions: Float32Array,
        count: number,
        cameraPosition: [number, number, number]
    ): { indices: Uint32Array; filteredCount: number } {
        if (!this.config.enabled) {
            const indices = new Uint32Array(count);
            for (let i = 0; i < count; i++) indices[i] = i;
            return { indices, filteredCount: count };
        }

        const filtered: number[] = [];
        const [cx, cy, cz] = cameraPosition;

        for (let i = 0; i < count; i++) {
            const px = positions[i * 3];
            const py = positions[i * 3 + 1];
            const pz = positions[i * 3 + 2];

            const dx = px - cx;
            const dy = py - cy;
            const dz = pz - cz;
            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

            const level = this.getLODLevel(distance);

            // Apply skip factor
            if (i % level.skipFactor === 0) {
                // Apply keep ratio (stochastic)
                if (level.keepRatio >= 1 || Math.random() < level.keepRatio) {
                    filtered.push(i);
                }
            }
        }

        return {
            indices: new Uint32Array(filtered),
            filteredCount: filtered.length,
        };
    }

    /**
     * Deterministic LOD filtering (better for sorting stability)
     */
    filterGaussiansDeterministic(
        positions: Float32Array,
        count: number,
        cameraPosition: [number, number, number]
    ): { indices: Uint32Array; filteredCount: number } {
        if (!this.config.enabled) {
            const indices = new Uint32Array(count);
            for (let i = 0; i < count; i++) indices[i] = i;
            return { indices, filteredCount: count };
        }

        const filtered: number[] = [];
        const [cx, cy, cz] = cameraPosition;

        // Group by distance bands
        const bands: Map<number, number[]> = new Map();

        for (let i = 0; i < count; i++) {
            const px = positions[i * 3];
            const py = positions[i * 3 + 1];
            const pz = positions[i * 3 + 2];

            const dx = px - cx;
            const dy = py - cy;
            const dz = pz - cz;
            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

            const level = this.getLODLevel(distance);
            const bandKey = level.distance;

            if (!bands.has(bandKey)) {
                bands.set(bandKey, []);
            }
            bands.get(bandKey)!.push(i);
        }

        // Apply skip factor to each band
        for (const [bandKey, indices] of bands.entries()) {
            const level = this.getLODLevel(bandKey);

            for (let i = 0; i < indices.length; i++) {
                if (i % level.skipFactor === 0) {
                    filtered.push(indices[i]);
                }
            }
        }

        return {
            indices: new Uint32Array(filtered),
            filteredCount: filtered.length,
        };
    }

    /**
     * Get current config
     */
    getConfig(): LODConfig {
        return { ...this.config };
    }

    /**
     * Update config
     */
    setConfig(config: Partial<LODConfig>): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * Enable/disable LOD
     */
    setEnabled(enabled: boolean): void {
        this.config.enabled = enabled;
    }

    /**
     * Get stats
     */
    getStats(): { currentFps: number; avgFps: number } {
        return {
            currentFps: this.currentFps,
            avgFps: this.fpsHistory.length > 0
                ? this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length
                : 0,
        };
    }
}

export const lodManager = new LODManager();
export default LODManager;
