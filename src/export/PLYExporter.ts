// PLY Exporter - Export Gaussian data to PLY format
// Supports both binary and ASCII formats

import type { GaussianData } from '../core/SplatRenderer';

export type PLYFormat = 'binary' | 'ascii';

export interface PLYExportOptions {
    format: PLYFormat;
    includeOpacity: boolean;
    includeScale: boolean;
    includeRotation: boolean;
    includeColor: boolean;
    selectedOnly: boolean;
    selectedIndices?: Set<number>;
}

const DEFAULT_OPTIONS: PLYExportOptions = {
    format: 'binary',
    includeOpacity: true,
    includeScale: true,
    includeRotation: true,
    includeColor: true,
    selectedOnly: false,
};

export class PLYExporter {
    static export(
        gaussianData: GaussianData,
        options: Partial<PLYExportOptions> = {}
    ): ArrayBuffer {
        const opts = { ...DEFAULT_OPTIONS, ...options };

        // Determine which Gaussians to export
        const indices: number[] = [];
        if (opts.selectedOnly && opts.selectedIndices) {
            indices.push(...opts.selectedIndices);
        } else {
            for (let i = 0; i < gaussianData.count; i++) {
                indices.push(i);
            }
        }

        const count = indices.length;

        if (opts.format === 'ascii') {
            return this.exportASCII(gaussianData, indices, opts);
        } else {
            return this.exportBinary(gaussianData, indices, opts);
        }
    }

    private static exportASCII(
        data: GaussianData,
        indices: number[],
        opts: PLYExportOptions
    ): ArrayBuffer {
        const lines: string[] = [];

        // Header
        lines.push('ply');
        lines.push('format ascii 1.0');
        lines.push(`element vertex ${indices.length}`);
        lines.push('property float x');
        lines.push('property float y');
        lines.push('property float z');

        if (opts.includeOpacity) {
            lines.push('property float opacity');
        }

        if (opts.includeScale) {
            lines.push('property float scale_0');
            lines.push('property float scale_1');
            lines.push('property float scale_2');
        }

        if (opts.includeRotation) {
            lines.push('property float rot_0');
            lines.push('property float rot_1');
            lines.push('property float rot_2');
            lines.push('property float rot_3');
        }

        if (opts.includeColor) {
            lines.push('property float f_dc_0');
            lines.push('property float f_dc_1');
            lines.push('property float f_dc_2');
        }

        lines.push('end_header');

        // Data
        const SH_C0_INV = 1 / 0.28209479177387814;

        for (const idx of indices) {
            const values: number[] = [
                data.positions[idx * 3],
                data.positions[idx * 3 + 1],
                data.positions[idx * 3 + 2],
            ];

            if (opts.includeOpacity) {
                // Convert from sigmoid to logit
                const opacity = data.opacities[idx];
                const logit = Math.log(opacity / (1 - opacity + 1e-10));
                values.push(logit);
            }

            if (opts.includeScale) {
                values.push(
                    data.scales[idx * 3],
                    data.scales[idx * 3 + 1],
                    data.scales[idx * 3 + 2]
                );
            }

            if (opts.includeRotation) {
                values.push(
                    data.rotations[idx * 4],
                    data.rotations[idx * 4 + 1],
                    data.rotations[idx * 4 + 2],
                    data.rotations[idx * 4 + 3]
                );
            }

            if (opts.includeColor) {
                // Convert from color to SH DC
                values.push(
                    (data.colors[idx * 3] - 0.5) * SH_C0_INV,
                    (data.colors[idx * 3 + 1] - 0.5) * SH_C0_INV,
                    (data.colors[idx * 3 + 2] - 0.5) * SH_C0_INV
                );
            }

            lines.push(values.map(v => v.toFixed(6)).join(' '));
        }

        const text = lines.join('\n');
        const encoder = new TextEncoder();
        return encoder.encode(text).buffer;
    }

    private static exportBinary(
        data: GaussianData,
        indices: number[],
        opts: PLYExportOptions
    ): ArrayBuffer {
        // Calculate bytes per vertex
        let bytesPerVertex = 12; // xyz
        if (opts.includeOpacity) bytesPerVertex += 4;
        if (opts.includeScale) bytesPerVertex += 12;
        if (opts.includeRotation) bytesPerVertex += 16;
        if (opts.includeColor) bytesPerVertex += 12;

        // Build header
        const headerLines: string[] = [];
        headerLines.push('ply');
        headerLines.push('format binary_little_endian 1.0');
        headerLines.push(`element vertex ${indices.length}`);
        headerLines.push('property float x');
        headerLines.push('property float y');
        headerLines.push('property float z');

        if (opts.includeOpacity) {
            headerLines.push('property float opacity');
        }

        if (opts.includeScale) {
            headerLines.push('property float scale_0');
            headerLines.push('property float scale_1');
            headerLines.push('property float scale_2');
        }

        if (opts.includeRotation) {
            headerLines.push('property float rot_0');
            headerLines.push('property float rot_1');
            headerLines.push('property float rot_2');
            headerLines.push('property float rot_3');
        }

        if (opts.includeColor) {
            headerLines.push('property float f_dc_0');
            headerLines.push('property float f_dc_1');
            headerLines.push('property float f_dc_2');
        }

        headerLines.push('end_header\n');
        const headerText = headerLines.join('\n');
        const headerBytes = new TextEncoder().encode(headerText);

        // Create buffer
        const totalSize = headerBytes.length + indices.length * bytesPerVertex;
        const buffer = new ArrayBuffer(totalSize);
        const view = new DataView(buffer);

        // Write header
        new Uint8Array(buffer).set(headerBytes);

        // Write data
        let offset = headerBytes.length;
        const SH_C0_INV = 1 / 0.28209479177387814;

        for (const idx of indices) {
            // Position
            view.setFloat32(offset, data.positions[idx * 3], true);
            view.setFloat32(offset + 4, data.positions[idx * 3 + 1], true);
            view.setFloat32(offset + 8, data.positions[idx * 3 + 2], true);
            offset += 12;

            if (opts.includeOpacity) {
                const opacity = data.opacities[idx];
                const logit = Math.log(opacity / (1 - opacity + 1e-10));
                view.setFloat32(offset, logit, true);
                offset += 4;
            }

            if (opts.includeScale) {
                view.setFloat32(offset, data.scales[idx * 3], true);
                view.setFloat32(offset + 4, data.scales[idx * 3 + 1], true);
                view.setFloat32(offset + 8, data.scales[idx * 3 + 2], true);
                offset += 12;
            }

            if (opts.includeRotation) {
                view.setFloat32(offset, data.rotations[idx * 4], true);
                view.setFloat32(offset + 4, data.rotations[idx * 4 + 1], true);
                view.setFloat32(offset + 8, data.rotations[idx * 4 + 2], true);
                view.setFloat32(offset + 12, data.rotations[idx * 4 + 3], true);
                offset += 16;
            }

            if (opts.includeColor) {
                view.setFloat32(offset, (data.colors[idx * 3] - 0.5) * SH_C0_INV, true);
                view.setFloat32(offset + 4, (data.colors[idx * 3 + 1] - 0.5) * SH_C0_INV, true);
                view.setFloat32(offset + 8, (data.colors[idx * 3 + 2] - 0.5) * SH_C0_INV, true);
                offset += 12;
            }
        }

        return buffer;
    }

    static saveToFile(buffer: ArrayBuffer, filename: string): void {
        const blob = new Blob([buffer], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename.endsWith('.ply') ? filename : `${filename}.ply`;
        a.click();

        URL.revokeObjectURL(url);
    }
}

export default PLYExporter;
