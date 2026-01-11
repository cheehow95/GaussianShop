// Environment Map - HDRI environment loading
// Loads and manages environment maps for lighting

export interface EnvironmentMapData {
    id: string;
    name: string;
    texture: GPUTexture | null;
    thumbnail?: string;
    rotation: number;
    intensity: number;
}

export interface EnvironmentPreset {
    id: string;
    name: string;
    url: string;
    thumbnail: string;
}

// Built-in environment presets
export const ENVIRONMENT_PRESETS: EnvironmentPreset[] = [
    {
        id: 'studio',
        name: 'Studio',
        url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFhAJ/wlseKgAAAABJRU5ErkJggg==',
        thumbnail: '',
    },
    {
        id: 'outdoor',
        name: 'Outdoor',
        url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mOsr6+vBwAE8wH0xXfGJgAAAABJRU5ErkJggg==',
        thumbnail: '',
    },
    {
        id: 'sunset',
        name: 'Sunset',
        url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX+63DAAAAABJRU5ErkJggg==',
        thumbnail: '',
    },
];

export class EnvironmentMap {
    private device: GPUDevice | null = null;
    private currentEnv: EnvironmentMapData | null = null;
    private listeners: Set<(env: EnvironmentMapData | null) => void> = new Set();

    setDevice(device: GPUDevice): void {
        this.device = device;
    }

    async loadFromURL(url: string, name: string): Promise<EnvironmentMapData | null> {
        if (!this.device) {
            console.error('GPU device not set');
            return null;
        }

        try {
            // Load image
            const response = await fetch(url);
            const blob = await response.blob();
            const imageBitmap = await createImageBitmap(blob);

            // Create texture
            const texture = this.device.createTexture({
                size: [imageBitmap.width, imageBitmap.height],
                format: 'rgba8unorm',
                usage:
                    GPUTextureUsage.TEXTURE_BINDING |
                    GPUTextureUsage.COPY_DST |
                    GPUTextureUsage.RENDER_ATTACHMENT,
            });

            this.device.queue.copyExternalImageToTexture(
                { source: imageBitmap },
                { texture },
                [imageBitmap.width, imageBitmap.height]
            );

            const env: EnvironmentMapData = {
                id: `env_${Date.now()}`,
                name,
                texture,
                rotation: 0,
                intensity: 1,
            };

            this.currentEnv = env;
            this.notifyListeners();
            return env;
        } catch (error) {
            console.error('Failed to load environment map:', error);
            return null;
        }
    }

    async loadFromFile(file: File): Promise<EnvironmentMapData | null> {
        const url = URL.createObjectURL(file);
        try {
            const result = await this.loadFromURL(url, file.name);
            return result;
        } finally {
            URL.revokeObjectURL(url);
        }
    }

    loadPreset(presetId: string): Promise<EnvironmentMapData | null> {
        const preset = ENVIRONMENT_PRESETS.find(p => p.id === presetId);
        if (!preset) return Promise.resolve(null);
        return this.loadFromURL(preset.url, preset.name);
    }

    getCurrentEnvironment(): EnvironmentMapData | null {
        return this.currentEnv;
    }

    setRotation(rotation: number): void {
        if (this.currentEnv) {
            this.currentEnv.rotation = rotation % 360;
            this.notifyListeners();
        }
    }

    setIntensity(intensity: number): void {
        if (this.currentEnv) {
            this.currentEnv.intensity = Math.max(0, Math.min(5, intensity));
            this.notifyListeners();
        }
    }

    clear(): void {
        if (this.currentEnv?.texture) {
            this.currentEnv.texture.destroy();
        }
        this.currentEnv = null;
        this.notifyListeners();
    }

    subscribe(listener: (env: EnvironmentMapData | null) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notifyListeners(): void {
        this.listeners.forEach(l => l(this.currentEnv));
    }
}

export const environmentMap = new EnvironmentMap();
export default EnvironmentMap;
