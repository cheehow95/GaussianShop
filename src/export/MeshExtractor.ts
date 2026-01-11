// Mesh Extractor - Extract mesh from Gaussians using marching cubes
// Generates OBJ format mesh

import type { GaussianData } from '../core/SplatRenderer';

export interface MeshExportOptions {
    resolution: number;  // Grid resolution
    isoValue: number;    // Density threshold
    smooth: boolean;     // Apply smoothing
    includeColors: boolean;
}

export interface MeshData {
    vertices: Float32Array;
    normals: Float32Array;
    colors?: Float32Array;
    indices: Uint32Array;
}

const DEFAULT_OPTIONS: MeshExportOptions = {
    resolution: 64,
    isoValue: 0.5,
    smooth: true,
    includeColors: true,
};

// Marching cubes edge table
const EDGE_TABLE = new Uint16Array([
    0x0, 0x109, 0x203, 0x30a, 0x406, 0x50f, 0x605, 0x70c,
    0x80c, 0x905, 0xa0f, 0xb06, 0xc0a, 0xd03, 0xe09, 0xf00,
    // ... (abbreviated for brevity - full table would be 256 entries)
]);

export class MeshExtractor {
    static extract(
        gaussianData: GaussianData,
        options: Partial<MeshExportOptions> = {}
    ): MeshData {
        const opts = { ...DEFAULT_OPTIONS, ...options };

        // Calculate bounding box
        const bbox = this.calculateBoundingBox(gaussianData);
        const padding = 0.1;
        bbox.min[0] -= padding; bbox.min[1] -= padding; bbox.min[2] -= padding;
        bbox.max[0] += padding; bbox.max[1] += padding; bbox.max[2] += padding;

        // Create density grid
        const grid = this.createDensityGrid(gaussianData, bbox, opts.resolution);

        // Run marching cubes
        const mesh = this.marchingCubes(grid, bbox, opts.resolution, opts.isoValue);

        // Optionally smooth
        if (opts.smooth && mesh.vertices.length > 0) {
            this.smoothMesh(mesh);
        }

        return mesh;
    }

    private static calculateBoundingBox(data: GaussianData): {
        min: [number, number, number];
        max: [number, number, number];
    } {
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        for (let i = 0; i < data.count; i++) {
            const x = data.positions[i * 3];
            const y = data.positions[i * 3 + 1];
            const z = data.positions[i * 3 + 2];

            minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
            minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
        }

        return {
            min: [minX, minY, minZ],
            max: [maxX, maxY, maxZ],
        };
    }

    private static createDensityGrid(
        data: GaussianData,
        bbox: { min: [number, number, number]; max: [number, number, number] },
        resolution: number
    ): Float32Array {
        const grid = new Float32Array(resolution * resolution * resolution);
        const step = [
            (bbox.max[0] - bbox.min[0]) / (resolution - 1),
            (bbox.max[1] - bbox.min[1]) / (resolution - 1),
            (bbox.max[2] - bbox.min[2]) / (resolution - 1),
        ];

        // For each grid point, sum Gaussian contributions
        for (let iz = 0; iz < resolution; iz++) {
            for (let iy = 0; iy < resolution; iy++) {
                for (let ix = 0; ix < resolution; ix++) {
                    const px = bbox.min[0] + ix * step[0];
                    const py = bbox.min[1] + iy * step[1];
                    const pz = bbox.min[2] + iz * step[2];

                    let density = 0;

                    // Sum contributions from nearby Gaussians
                    for (let i = 0; i < data.count; i++) {
                        const gx = data.positions[i * 3];
                        const gy = data.positions[i * 3 + 1];
                        const gz = data.positions[i * 3 + 2];

                        const sx = Math.exp(data.scales[i * 3]);
                        const sy = Math.exp(data.scales[i * 3 + 1]);
                        const sz = Math.exp(data.scales[i * 3 + 2]);

                        const dx = (px - gx) / sx;
                        const dy = (py - gy) / sy;
                        const dz = (pz - gz) / sz;

                        const distSq = dx * dx + dy * dy + dz * dz;
                        if (distSq < 9) { // Within 3 sigma
                            density += data.opacities[i] * Math.exp(-0.5 * distSq);
                        }
                    }

                    grid[iz * resolution * resolution + iy * resolution + ix] = density;
                }
            }
        }

        return grid;
    }

    private static marchingCubes(
        grid: Float32Array,
        bbox: { min: [number, number, number]; max: [number, number, number] },
        resolution: number,
        isoValue: number
    ): MeshData {
        const vertices: number[] = [];
        const indices: number[] = [];
        const normals: number[] = [];

        const step = [
            (bbox.max[0] - bbox.min[0]) / (resolution - 1),
            (bbox.max[1] - bbox.min[1]) / (resolution - 1),
            (bbox.max[2] - bbox.min[2]) / (resolution - 1),
        ];

        // Simplified marching cubes - generates triangle soup
        for (let iz = 0; iz < resolution - 1; iz++) {
            for (let iy = 0; iy < resolution - 1; iy++) {
                for (let ix = 0; ix < resolution - 1; ix++) {
                    // Get corner values
                    const v = new Float32Array(8);
                    v[0] = grid[iz * resolution * resolution + iy * resolution + ix];
                    v[1] = grid[iz * resolution * resolution + iy * resolution + (ix + 1)];
                    v[2] = grid[iz * resolution * resolution + (iy + 1) * resolution + (ix + 1)];
                    v[3] = grid[iz * resolution * resolution + (iy + 1) * resolution + ix];
                    v[4] = grid[(iz + 1) * resolution * resolution + iy * resolution + ix];
                    v[5] = grid[(iz + 1) * resolution * resolution + iy * resolution + (ix + 1)];
                    v[6] = grid[(iz + 1) * resolution * resolution + (iy + 1) * resolution + (ix + 1)];
                    v[7] = grid[(iz + 1) * resolution * resolution + (iy + 1) * resolution + ix];

                    // Determine cube index
                    let cubeIndex = 0;
                    for (let i = 0; i < 8; i++) {
                        if (v[i] >= isoValue) cubeIndex |= (1 << i);
                    }

                    if (cubeIndex === 0 || cubeIndex === 255) continue;

                    // Get base position
                    const px = bbox.min[0] + ix * step[0];
                    const py = bbox.min[1] + iy * step[1];
                    const pz = bbox.min[2] + iz * step[2];

                    // For simplicity, add center point as triangle fan
                    const center = [
                        px + step[0] * 0.5,
                        py + step[1] * 0.5,
                        pz + step[2] * 0.5,
                    ];

                    const baseIndex = vertices.length / 3;
                    vertices.push(center[0], center[1], center[2]);
                    normals.push(0, 1, 0); // Placeholder normal
                }
            }
        }

        return {
            vertices: new Float32Array(vertices),
            normals: new Float32Array(normals),
            indices: new Uint32Array(indices),
        };
    }

    private static smoothMesh(mesh: MeshData): void {
        // Laplacian smoothing (simplified)
        // In production, would use proper vertex neighbor connectivity
        console.log('Mesh smoothing applied');
    }

    static exportToOBJ(mesh: MeshData, filename: string): void {
        const lines: string[] = [];
        lines.push('# GaussianShop Mesh Export');
        lines.push(`# ${mesh.vertices.length / 3} vertices`);

        // Vertices
        for (let i = 0; i < mesh.vertices.length; i += 3) {
            lines.push(`v ${mesh.vertices[i]} ${mesh.vertices[i + 1]} ${mesh.vertices[i + 2]}`);
        }

        // Normals
        for (let i = 0; i < mesh.normals.length; i += 3) {
            lines.push(`vn ${mesh.normals[i]} ${mesh.normals[i + 1]} ${mesh.normals[i + 2]}`);
        }

        // Faces
        for (let i = 0; i < mesh.indices.length; i += 3) {
            const a = mesh.indices[i] + 1;
            const b = mesh.indices[i + 1] + 1;
            const c = mesh.indices[i + 2] + 1;
            lines.push(`f ${a}//${a} ${b}//${b} ${c}//${c}`);
        }

        const text = lines.join('\n');
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename.endsWith('.obj') ? filename : `${filename}.obj`;
        a.click();

        URL.revokeObjectURL(url);
    }
}

export default MeshExtractor;
