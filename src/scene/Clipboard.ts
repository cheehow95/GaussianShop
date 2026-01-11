// Clipboard - Copy/paste functionality for Gaussians
// Handles copying, pasting, and duplicating scene elements

import type { GaussianData } from '../core/SplatRenderer';
import { selectionManager } from '../tools/SelectionManager';

export interface ClipboardData {
    type: 'gaussians';
    positions: number[];
    opacities: number[];
    scales: number[];
    rotations: number[];
    colors: number[];
    count: number;
    sourceCenter: [number, number, number];
}

export class Clipboard {
    private data: ClipboardData | null = null;
    private listeners: Set<(hasData: boolean) => void> = new Set();

    // Copy selected Gaussians to clipboard
    copy(gaussianData: GaussianData): boolean {
        const selected = selectionManager.getSelectedIndices();
        if (selected.size === 0) return false;

        const indices = Array.from(selected);
        const count = indices.length;

        const positions: number[] = [];
        const opacities: number[] = [];
        const scales: number[] = [];
        const rotations: number[] = [];
        const colors: number[] = [];

        let cx = 0, cy = 0, cz = 0;

        for (const idx of indices) {
            const px = gaussianData.positions[idx * 3];
            const py = gaussianData.positions[idx * 3 + 1];
            const pz = gaussianData.positions[idx * 3 + 2];

            positions.push(px, py, pz);
            cx += px;
            cy += py;
            cz += pz;

            opacities.push(gaussianData.opacities[idx]);

            scales.push(
                gaussianData.scales[idx * 3],
                gaussianData.scales[idx * 3 + 1],
                gaussianData.scales[idx * 3 + 2]
            );

            rotations.push(
                gaussianData.rotations[idx * 4],
                gaussianData.rotations[idx * 4 + 1],
                gaussianData.rotations[idx * 4 + 2],
                gaussianData.rotations[idx * 4 + 3]
            );

            colors.push(
                gaussianData.colors[idx * 3],
                gaussianData.colors[idx * 3 + 1],
                gaussianData.colors[idx * 3 + 2]
            );
        }

        this.data = {
            type: 'gaussians',
            positions,
            opacities,
            scales,
            rotations,
            colors,
            count,
            sourceCenter: [cx / count, cy / count, cz / count],
        };

        this.notifyListeners();
        console.log(`Copied ${count} Gaussians to clipboard`);
        return true;
    }

    // Cut selected Gaussians (copy + delete)
    cut(gaussianData: GaussianData): { newData: GaussianData; success: boolean } {
        const copySuccess = this.copy(gaussianData);
        if (!copySuccess) {
            return { newData: gaussianData, success: false };
        }

        // Create new data without selected Gaussians
        const selected = selectionManager.getSelectedIndices();
        const newCount = gaussianData.count - selected.size;

        const newPositions = new Float32Array(newCount * 3);
        const newOpacities = new Float32Array(newCount);
        const newScales = new Float32Array(newCount * 3);
        const newRotations = new Float32Array(newCount * 4);
        const newColors = new Float32Array(newCount * 3);

        let newIdx = 0;
        for (let i = 0; i < gaussianData.count; i++) {
            if (selected.has(i)) continue;

            newPositions[newIdx * 3] = gaussianData.positions[i * 3];
            newPositions[newIdx * 3 + 1] = gaussianData.positions[i * 3 + 1];
            newPositions[newIdx * 3 + 2] = gaussianData.positions[i * 3 + 2];

            newOpacities[newIdx] = gaussianData.opacities[i];

            newScales[newIdx * 3] = gaussianData.scales[i * 3];
            newScales[newIdx * 3 + 1] = gaussianData.scales[i * 3 + 1];
            newScales[newIdx * 3 + 2] = gaussianData.scales[i * 3 + 2];

            newRotations[newIdx * 4] = gaussianData.rotations[i * 4];
            newRotations[newIdx * 4 + 1] = gaussianData.rotations[i * 4 + 1];
            newRotations[newIdx * 4 + 2] = gaussianData.rotations[i * 4 + 2];
            newRotations[newIdx * 4 + 3] = gaussianData.rotations[i * 4 + 3];

            newColors[newIdx * 3] = gaussianData.colors[i * 3];
            newColors[newIdx * 3 + 1] = gaussianData.colors[i * 3 + 1];
            newColors[newIdx * 3 + 2] = gaussianData.colors[i * 3 + 2];

            newIdx++;
        }

        selectionManager.clear();

        return {
            newData: {
                positions: newPositions,
                opacities: newOpacities,
                scales: newScales,
                rotations: newRotations,
                colors: newColors,
                count: newCount,
            },
            success: true,
        };
    }

    // Paste from clipboard
    paste(
        gaussianData: GaussianData,
        offset: [number, number, number] = [0.5, 0, 0]
    ): GaussianData | null {
        if (!this.data) return null;

        const pasteCount = this.data.count;
        const newCount = gaussianData.count + pasteCount;

        // Create expanded arrays
        const newPositions = new Float32Array(newCount * 3);
        const newOpacities = new Float32Array(newCount);
        const newScales = new Float32Array(newCount * 3);
        const newRotations = new Float32Array(newCount * 4);
        const newColors = new Float32Array(newCount * 3);

        // Copy existing data
        newPositions.set(gaussianData.positions);
        newOpacities.set(gaussianData.opacities);
        newScales.set(gaussianData.scales);
        newRotations.set(gaussianData.rotations);
        newColors.set(gaussianData.colors);

        // Calculate paste center (source center + offset)
        const pasteCenter = [
            this.data.sourceCenter[0] + offset[0],
            this.data.sourceCenter[1] + offset[1],
            this.data.sourceCenter[2] + offset[2],
        ];

        // Append pasted data
        const baseIdx = gaussianData.count;
        for (let i = 0; i < pasteCount; i++) {
            const idx = baseIdx + i;

            // Position relative to new center
            const px = this.data.positions[i * 3] - this.data.sourceCenter[0] + pasteCenter[0];
            const py = this.data.positions[i * 3 + 1] - this.data.sourceCenter[1] + pasteCenter[1];
            const pz = this.data.positions[i * 3 + 2] - this.data.sourceCenter[2] + pasteCenter[2];

            newPositions[idx * 3] = px;
            newPositions[idx * 3 + 1] = py;
            newPositions[idx * 3 + 2] = pz;

            newOpacities[idx] = this.data.opacities[i];

            newScales[idx * 3] = this.data.scales[i * 3];
            newScales[idx * 3 + 1] = this.data.scales[i * 3 + 1];
            newScales[idx * 3 + 2] = this.data.scales[i * 3 + 2];

            newRotations[idx * 4] = this.data.rotations[i * 4];
            newRotations[idx * 4 + 1] = this.data.rotations[i * 4 + 1];
            newRotations[idx * 4 + 2] = this.data.rotations[i * 4 + 2];
            newRotations[idx * 4 + 3] = this.data.rotations[i * 4 + 3];

            newColors[idx * 3] = this.data.colors[i * 3];
            newColors[idx * 3 + 1] = this.data.colors[i * 3 + 1];
            newColors[idx * 3 + 2] = this.data.colors[i * 3 + 2];
        }

        // Select pasted Gaussians
        const pastedIndices = Array.from({ length: pasteCount }, (_, i) => baseIdx + i);
        selectionManager.select(pastedIndices, 'replace');

        console.log(`Pasted ${pasteCount} Gaussians`);

        return {
            positions: newPositions,
            opacities: newOpacities,
            scales: newScales,
            rotations: newRotations,
            colors: newColors,
            count: newCount,
        };
    }

    // Duplicate in place (combines copy + paste)
    duplicate(
        gaussianData: GaussianData,
        offset: [number, number, number] = [0.5, 0, 0]
    ): GaussianData | null {
        if (!this.copy(gaussianData)) return null;
        return this.paste(gaussianData, offset);
    }

    hasData(): boolean {
        return this.data !== null;
    }

    getCount(): number {
        return this.data?.count ?? 0;
    }

    clear(): void {
        this.data = null;
        this.notifyListeners();
    }

    subscribe(listener: (hasData: boolean) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notifyListeners(): void {
        const hasData = this.data !== null;
        this.listeners.forEach(l => l(hasData));
    }
}

export const clipboard = new Clipboard();
export default Clipboard;
