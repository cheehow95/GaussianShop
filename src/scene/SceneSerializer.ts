// Scene Serializer - Project save/load functionality
// Handles JSON-based project format with version compatibility

import type { GaussianData } from '../core/SplatRenderer';
import { sceneGraph, type SceneGraphData } from './SceneGraph';
import { layerManager, type LayerData } from './LayerManager';

export interface ProjectMetadata {
    name: string;
    created: string;
    modified: string;
    author?: string;
    description?: string;
}

export interface ProjectSettings {
    gridVisible: boolean;
    gridSize: number;
    backgroundColor: [number, number, number, number];
    cameraPosition: [number, number, number];
    cameraTarget: [number, number, number];
    cameraFov: number;
}

export interface ProjectData {
    version: number;
    metadata: ProjectMetadata;
    settings: ProjectSettings;
    sceneGraph: SceneGraphData;
    layers: LayerData;
    gaussianData?: {
        positions: number[];
        opacities: number[];
        scales: number[];
        rotations: number[];
        colors: number[];
        count: number;
    };
}

const CURRENT_VERSION = 1;

const DEFAULT_SETTINGS: ProjectSettings = {
    gridVisible: true,
    gridSize: 1,
    backgroundColor: [0.05, 0.05, 0.1, 1],
    cameraPosition: [0, 0, 5],
    cameraTarget: [0, 0, 0],
    cameraFov: 45,
};

export class SceneSerializer {
    // Create project data from current state
    static createProjectData(
        name: string,
        gaussianData: GaussianData | null,
        settings?: Partial<ProjectSettings>
    ): ProjectData {
        const now = new Date().toISOString();

        return {
            version: CURRENT_VERSION,
            metadata: {
                name,
                created: now,
                modified: now,
            },
            settings: { ...DEFAULT_SETTINGS, ...settings },
            sceneGraph: sceneGraph.toData(),
            layers: layerManager.toData(),
            gaussianData: gaussianData ? {
                positions: Array.from(gaussianData.positions),
                opacities: Array.from(gaussianData.opacities),
                scales: Array.from(gaussianData.scales),
                rotations: Array.from(gaussianData.rotations),
                colors: Array.from(gaussianData.colors),
                count: gaussianData.count,
            } : undefined,
        };
    }

    // Serialize project to JSON string
    static serialize(project: ProjectData): string {
        return JSON.stringify(project, null, 2);
    }

    // Serialize project to binary blob (compressed)
    static async serializeToBlob(project: ProjectData): Promise<Blob> {
        const json = this.serialize(project);
        const encoder = new TextEncoder();
        const data = encoder.encode(json);

        // Use CompressionStream if available
        if ('CompressionStream' in window) {
            const stream = new Blob([data]).stream();
            const compressed = stream.pipeThrough(new CompressionStream('gzip'));
            return new Response(compressed).blob();
        }

        return new Blob([data], { type: 'application/json' });
    }

    // Parse project from JSON string
    static parse(json: string): ProjectData {
        const data = JSON.parse(json) as ProjectData;
        return this.migrateVersion(data);
    }

    // Parse project from binary blob
    static async parseFromBlob(blob: Blob): Promise<ProjectData> {
        let text: string;

        // Check if gzip compressed
        const header = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
        if (header[0] === 0x1f && header[1] === 0x8b) {
            // Gzip magic number detected
            if ('DecompressionStream' in window) {
                const stream = blob.stream();
                const decompressed = stream.pipeThrough(new DecompressionStream('gzip'));
                const decompressedBlob = await new Response(decompressed).blob();
                text = await decompressedBlob.text();
            } else {
                throw new Error('Cannot decompress: DecompressionStream not supported');
            }
        } else {
            text = await blob.text();
        }

        return this.parse(text);
    }

    // Migrate old versions to current
    private static migrateVersion(data: ProjectData): ProjectData {
        // Currently only version 1, no migration needed
        if (data.version < CURRENT_VERSION) {
            console.log(`Migrating project from v${data.version} to v${CURRENT_VERSION}`);
        }
        return data;
    }

    // Load project into app state
    static loadProject(data: ProjectData): {
        gaussianData: GaussianData | null;
        settings: ProjectSettings;
    } {
        // Load scene graph
        sceneGraph.loadFromData(data.sceneGraph);

        // Load layers
        layerManager.loadFromData(data.layers);

        // Convert Gaussian data
        let gaussianData: GaussianData | null = null;
        if (data.gaussianData) {
            gaussianData = {
                positions: new Float32Array(data.gaussianData.positions),
                opacities: new Float32Array(data.gaussianData.opacities),
                scales: new Float32Array(data.gaussianData.scales),
                rotations: new Float32Array(data.gaussianData.rotations),
                colors: new Float32Array(data.gaussianData.colors),
                count: data.gaussianData.count,
            };
        }

        return {
            gaussianData,
            settings: data.settings,
        };
    }

    // Save project to file
    static async saveToFile(project: ProjectData, filename: string): Promise<void> {
        const blob = await this.serializeToBlob(project);
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename.endsWith('.gsp') ? filename : `${filename}.gsp`;
        a.click();

        URL.revokeObjectURL(url);
    }

    // Load project from file
    static async loadFromFile(file: File): Promise<ProjectData> {
        const blob = new Blob([await file.arrayBuffer()]);
        return this.parseFromBlob(blob);
    }
}

export default SceneSerializer;
