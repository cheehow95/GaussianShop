// Lighting Controller - Lighting state management
// Controls environment, ambient, and point lights

import { environmentMap, type EnvironmentMapData, ENVIRONMENT_PRESETS } from './EnvironmentMap';

export interface PointLight {
    id: string;
    position: [number, number, number];
    color: [number, number, number];
    intensity: number;
    radius: number;
    visible: boolean;
}

export interface LightingState {
    ambientColor: [number, number, number];
    ambientIntensity: number;
    environmentRotation: number;
    environmentIntensity: number;

    exposure: number;
    sunDirection: [number, number, number];
    sunColor: [number, number, number];
    sunIntensity: number;
    pointLights: PointLight[];
}

const DEFAULT_STATE: LightingState = {
    ambientColor: [1, 1, 1],
    ambientIntensity: 0.3,
    environmentRotation: 0,
    environmentIntensity: 1,
    exposure: 1,
    sunDirection: [0.5, 0.8, 0.3], // Default slight angle
    sunColor: [1, 0.95, 0.9],     // Warm sunlight
    sunIntensity: 2.0,
    pointLights: [],
};

export class LightingController {
    private state: LightingState = { ...DEFAULT_STATE };
    private idCounter = 0;
    private listeners: Set<(state: LightingState) => void> = new Set();

    getState(): LightingState {
        return { ...this.state };
    }

    // Ambient lighting
    setAmbientColor(color: [number, number, number]): void {
        this.state.ambientColor = [...color];
        this.notifyListeners();
    }

    setAmbientIntensity(intensity: number): void {
        this.state.ambientIntensity = Math.max(0, Math.min(2, intensity));
        this.notifyListeners();
    }

    // Environment
    setEnvironmentRotation(rotation: number): void {
        this.state.environmentRotation = rotation % 360;
        environmentMap.setRotation(rotation);
        this.notifyListeners();
    }

    setEnvironmentIntensity(intensity: number): void {
        this.state.environmentIntensity = Math.max(0, Math.min(5, intensity));
        environmentMap.setIntensity(intensity);
        this.notifyListeners();
    }

    // Exposure
    setExposure(exposure: number): void {
        this.state.exposure = Math.max(0.1, Math.min(10, exposure));
        this.notifyListeners();
    }

    // Sun settings
    setSunDirection(direction: [number, number, number]): void {
        // Normalize
        const len = Math.sqrt(direction[0] ** 2 + direction[1] ** 2 + direction[2] ** 2);
        this.state.sunDirection = [direction[0] / len, direction[1] / len, direction[2] / len];
        this.notifyListeners();
    }

    setSunColor(color: [number, number, number]): void {
        this.state.sunColor = [...color];
        this.notifyListeners();
    }

    setSunIntensity(intensity: number): void {
        this.state.sunIntensity = Math.max(0, Math.min(10, intensity));
        this.notifyListeners();
    }

    // Point lights
    addPointLight(position: [number, number, number] = [0, 2, 0]): PointLight {
        const light: PointLight = {
            id: `light_${++this.idCounter}`,
            position: [...position],
            color: [1, 1, 1],
            intensity: 1,
            radius: 10,
            visible: true,
        };
        this.state.pointLights.push(light);
        this.notifyListeners();
        return light;
    }

    removePointLight(id: string): void {
        const index = this.state.pointLights.findIndex(l => l.id === id);
        if (index >= 0) {
            this.state.pointLights.splice(index, 1);
            this.notifyListeners();
        }
    }

    updatePointLight(id: string, updates: Partial<Omit<PointLight, 'id'>>): void {
        const light = this.state.pointLights.find(l => l.id === id);
        if (light) {
            if (updates.position) light.position = [...updates.position];
            if (updates.color) light.color = [...updates.color];
            if (updates.intensity !== undefined) light.intensity = updates.intensity;
            if (updates.radius !== undefined) light.radius = updates.radius;
            if (updates.visible !== undefined) light.visible = updates.visible;
            this.notifyListeners();
        }
    }

    getPointLight(id: string): PointLight | undefined {
        return this.state.pointLights.find(l => l.id === id);
    }

    getPointLights(): PointLight[] {
        return this.state.pointLights.map(l => ({ ...l }));
    }

    // Presets
    applyPreset(presetName: 'studio' | 'outdoor' | 'sunset' | 'night'): void {
        switch (presetName) {
            case 'studio':
                this.state.ambientColor = [1, 1, 1];
                this.state.ambientIntensity = 0.4;
                this.state.environmentIntensity = 0.8;
                this.state.exposure = 1;
                break;
            case 'outdoor':
                this.state.ambientColor = [0.9, 0.95, 1];
                this.state.ambientIntensity = 0.3;
                this.state.environmentIntensity = 1.2;
                this.state.exposure = 1.1;
                break;
            case 'sunset':
                this.state.ambientColor = [1, 0.9, 0.7];
                this.state.ambientIntensity = 0.25;
                this.state.environmentIntensity = 1.5;
                this.state.exposure = 1.2;
                break;
            case 'night':
                this.state.ambientColor = [0.6, 0.7, 1];
                this.state.ambientIntensity = 0.1;
                this.state.environmentIntensity = 0.3;
                this.state.exposure = 1.5;
                break;
        }
        this.notifyListeners();
    }

    // Reset to defaults
    reset(): void {
        this.state = { ...DEFAULT_STATE, pointLights: [] };
        environmentMap.clear();
        this.notifyListeners();
    }

    // Get uniform data for shaders
    getUniformData(): Float32Array {
        // Pack lighting data for GPU:
        // [ambientColor.rgb, ambientIntensity]
        // [envRotation, envIntensity, exposure, numLights]
        // For each light: [position.xyz, intensity], [color.rgb, radius]

        const numLights = this.state.pointLights.filter(l => l.visible).length;
        const uniformSize = 8 + numLights * 8;
        const data = new Float32Array(uniformSize);

        data[0] = this.state.ambientColor[0];
        data[1] = this.state.ambientColor[1];
        data[2] = this.state.ambientColor[2];
        data[3] = this.state.ambientIntensity;

        data[4] = this.state.sunDirection[0];
        data[5] = this.state.sunDirection[1];
        data[6] = this.state.sunDirection[2];
        data[7] = this.state.sunIntensity;

        data[8] = this.state.sunColor[0];
        data[9] = this.state.sunColor[1];
        data[10] = this.state.sunColor[2];
        data[11] = 0.0; // Padding

        // Extra params can go here or effectively we just need to match shader struct
        // The previous packing was a bit ad-hoc, let's stick to what gi_composite expecting or update it.
        // gi_composite struct:
        // struct LightingData {
        //     ambientColor: vec3f,
        //     ambientIntensity: f32,
        //     sunDirection: vec3f,
        //     sunIntensity: f32,
        //     sunColor: vec3f,
        // }
        // That is 5 * 4 = 20 floats (aligned to vec4) -> 
        // 0-3: ambient(3), ambientIntensity(1)
        // 4-7: sunDir(3), sunIntensity(1)
        // 8-11: sunColor(3), padding(1) -> Total 48 bytes (float32 * 12)


        let offset = 8;
        for (const light of this.state.pointLights) {
            if (!light.visible) continue;

            data[offset] = light.position[0];
            data[offset + 1] = light.position[1];
            data[offset + 2] = light.position[2];
            data[offset + 3] = light.intensity;

            data[offset + 4] = light.color[0];
            data[offset + 5] = light.color[1];
            data[offset + 6] = light.color[2];
            data[offset + 7] = light.radius;

            offset += 8;
        }

        return data;
    }

    subscribe(listener: (state: LightingState) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notifyListeners(): void {
        this.listeners.forEach(l => l(this.state));
    }
}

export const lightingController = new LightingController();
export default LightingController;
