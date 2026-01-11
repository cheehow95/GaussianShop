// SPLAT Exporter - Export to compressed splat format
// Optimized for web viewing

import type { GaussianData } from '../core/SplatRenderer';

export interface SplatExportOptions {
    compress: boolean;
    precision: 'full' | 'half';
    sortByDepth: boolean;
}

const DEFAULT_OPTIONS: SplatExportOptions = {
    compress: true,
    precision: 'half',
    sortByDepth: true,
};

export class SplatExporter {
    static export(
        gaussianData: GaussianData,
        options: Partial<SplatExportOptions> = {}
    ): ArrayBuffer {
        const opts = { ...DEFAULT_OPTIONS, ...options };

        // Splat format: compact representation
        // Each Gaussian: position (12), scale (12), rotation (16), color (4), opacity (1) = 45 bytes
        // Half precision reduces this significantly

        const count = gaussianData.count;
        const bytesPerSplat = opts.precision === 'half' ? 24 : 45;
        const buffer = new ArrayBuffer(8 + count * bytesPerSplat); // 8 byte header
        const view = new DataView(buffer);

        // Header: magic number + count
        view.setUint32(0, 0x53504C54, false); // "SPLT" in ASCII
        view.setUint32(4, count, true);

        let offset = 8;

        for (let i = 0; i < count; i++) {
            if (opts.precision === 'half') {
                // Half precision format
                // Position: 3 x float16 = 6 bytes
                this.writeFloat16(view, offset, gaussianData.positions[i * 3]);
                this.writeFloat16(view, offset + 2, gaussianData.positions[i * 3 + 1]);
                this.writeFloat16(view, offset + 4, gaussianData.positions[i * 3 + 2]);
                offset += 6;

                // Scale: 3 x float16 = 6 bytes
                this.writeFloat16(view, offset, gaussianData.scales[i * 3]);
                this.writeFloat16(view, offset + 2, gaussianData.scales[i * 3 + 1]);
                this.writeFloat16(view, offset + 4, gaussianData.scales[i * 3 + 2]);
                offset += 6;

                // Rotation: 4 x int8 (normalized) = 4 bytes
                view.setInt8(offset, Math.round(gaussianData.rotations[i * 4] * 127));
                view.setInt8(offset + 1, Math.round(gaussianData.rotations[i * 4 + 1] * 127));
                view.setInt8(offset + 2, Math.round(gaussianData.rotations[i * 4 + 2] * 127));
                view.setInt8(offset + 3, Math.round(gaussianData.rotations[i * 4 + 3] * 127));
                offset += 4;

                // Color: RGB uint8 = 3 bytes
                view.setUint8(offset, Math.round(gaussianData.colors[i * 3] * 255));
                view.setUint8(offset + 1, Math.round(gaussianData.colors[i * 3 + 1] * 255));
                view.setUint8(offset + 2, Math.round(gaussianData.colors[i * 3 + 2] * 255));
                offset += 3;

                // Opacity: uint8 = 1 byte
                view.setUint8(offset, Math.round(gaussianData.opacities[i] * 255));
                offset += 1;

                // Padding: 4 bytes for alignment
                offset += 4;
            } else {
                // Full precision format
                // Position
                view.setFloat32(offset, gaussianData.positions[i * 3], true);
                view.setFloat32(offset + 4, gaussianData.positions[i * 3 + 1], true);
                view.setFloat32(offset + 8, gaussianData.positions[i * 3 + 2], true);
                offset += 12;

                // Scale
                view.setFloat32(offset, gaussianData.scales[i * 3], true);
                view.setFloat32(offset + 4, gaussianData.scales[i * 3 + 1], true);
                view.setFloat32(offset + 8, gaussianData.scales[i * 3 + 2], true);
                offset += 12;

                // Rotation
                view.setFloat32(offset, gaussianData.rotations[i * 4], true);
                view.setFloat32(offset + 4, gaussianData.rotations[i * 4 + 1], true);
                view.setFloat32(offset + 8, gaussianData.rotations[i * 4 + 2], true);
                view.setFloat32(offset + 12, gaussianData.rotations[i * 4 + 3], true);
                offset += 16;

                // Color
                view.setUint8(offset, Math.round(gaussianData.colors[i * 3] * 255));
                view.setUint8(offset + 1, Math.round(gaussianData.colors[i * 3 + 1] * 255));
                view.setUint8(offset + 2, Math.round(gaussianData.colors[i * 3 + 2] * 255));
                view.setUint8(offset + 3, 255); // Alpha
                offset += 4;

                // Opacity
                view.setUint8(offset, Math.round(gaussianData.opacities[i] * 255));
                offset += 1;
            }
        }

        return buffer;
    }

    private static writeFloat16(view: DataView, offset: number, value: number): void {
        // Simple float16 conversion (IEEE 754 half precision)
        const floatView = new Float32Array([value]);
        const intView = new Uint32Array(floatView.buffer);
        const f = intView[0];

        const sign = (f >> 31) & 0x0001;
        const exp = (f >> 23) & 0x00ff;
        const frac = f & 0x007fffff;

        let newExp: number;
        let newFrac: number;

        if (exp === 0) {
            newExp = 0;
            newFrac = 0;
        } else if (exp === 0xff) {
            newExp = 31;
            newFrac = frac ? 0x200 : 0;
        } else {
            const newExpUnbiased = exp - 127 + 15;
            if (newExpUnbiased <= 0) {
                newExp = 0;
                newFrac = 0;
            } else if (newExpUnbiased >= 31) {
                newExp = 31;
                newFrac = 0;
            } else {
                newExp = newExpUnbiased;
                newFrac = frac >> 13;
            }
        }

        const half = (sign << 15) | (newExp << 10) | newFrac;
        view.setUint16(offset, half, true);
    }

    static saveToFile(buffer: ArrayBuffer, filename: string): void {
        const blob = new Blob([buffer], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename.endsWith('.splat') ? filename : `${filename}.splat`;
        a.click();

        URL.revokeObjectURL(url);
    }
}

export default SplatExporter;
