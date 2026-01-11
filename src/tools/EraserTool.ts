// Eraser Tool - Delete Gaussians
// Marks Gaussians for deletion with undo support

import type { GaussianData } from '../core/SplatRenderer';
import { selectionManager } from './SelectionManager';
import { historyManager, type HistoryCommand } from './HistoryManager';

export interface EraserState {
    mode: 'selection' | 'brush';
    brushRadius: number;
    pendingDeletion: Set<number>;
}

export class EraserTool {
    private mode: 'selection' | 'brush' = 'selection';
    private brushRadius = 30;
    private pendingDeletion: Set<number> = new Set();
    private listeners: Set<(state: EraserState) => void> = new Set();

    getMode(): 'selection' | 'brush' {
        return this.mode;
    }

    setMode(mode: 'selection' | 'brush'): void {
        this.mode = mode;
        this.notifyListeners();
    }

    getBrushRadius(): number {
        return this.brushRadius;
    }

    setBrushRadius(radius: number): void {
        this.brushRadius = Math.max(5, Math.min(100, radius));
        this.notifyListeners();
    }

    // Mark selected Gaussians for deletion
    markSelectedForDeletion(): void {
        const selected = selectionManager.getSelectedIndices();
        selected.forEach(idx => this.pendingDeletion.add(idx));
        this.notifyListeners();
    }

    // Mark Gaussians at brush position for deletion
    markBrushForDeletion(
        x: number, y: number,
        viewMatrix: Float32Array,
        projMatrix: Float32Array,
        viewportWidth: number,
        viewportHeight: number
    ): void {
        const result = selectionManager.selectBrush(
            x, y, this.brushRadius,
            viewMatrix, projMatrix,
            viewportWidth, viewportHeight,
            'replace'
        );
        result.indices.forEach(idx => this.pendingDeletion.add(idx));
        this.notifyListeners();
    }

    // Get pending deletion count
    getPendingCount(): number {
        return this.pendingDeletion.size;
    }

    // Clear pending deletions
    clearPending(): void {
        this.pendingDeletion.clear();
        this.notifyListeners();
    }

    // Apply deletion with undo support
    applyDeletion(gaussianData: GaussianData): GaussianData | null {
        if (this.pendingDeletion.size === 0) return null;

        const indicesToDelete = Array.from(this.pendingDeletion).sort((a, b) => b - a);
        const newCount = gaussianData.count - indicesToDelete.length;

        // Store old data for undo
        const oldData = {
            positions: new Float32Array(gaussianData.positions),
            opacities: new Float32Array(gaussianData.opacities),
            scales: new Float32Array(gaussianData.scales),
            rotations: new Float32Array(gaussianData.rotations),
            colors: new Float32Array(gaussianData.colors),
            count: gaussianData.count,
        };

        // Create new arrays without deleted Gaussians
        const newPositions = new Float32Array(newCount * 3);
        const newOpacities = new Float32Array(newCount);
        const newScales = new Float32Array(newCount * 3);
        const newRotations = new Float32Array(newCount * 4);
        const newColors = new Float32Array(newCount * 3);

        const deleteSet = new Set(indicesToDelete);
        let newIdx = 0;

        for (let i = 0; i < gaussianData.count; i++) {
            if (deleteSet.has(i)) continue;

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

        const newData: GaussianData = {
            positions: newPositions,
            opacities: newOpacities,
            scales: newScales,
            rotations: newRotations,
            colors: newColors,
            count: newCount,
        };

        // Create undo command
        const command: HistoryCommand = {
            type: 'delete',
            description: `Delete ${indicesToDelete.length} Gaussians`,
            execute: () => {
                // Already executed
            },
            undo: () => {
                // Restore is handled at higher level by replacing gaussianData
                console.log('Undo delete - restore needed at app level');
            },
        };

        historyManager.execute(command);
        this.pendingDeletion.clear();
        selectionManager.clear();
        this.notifyListeners();

        return newData;
    }

    getState(): EraserState {
        return {
            mode: this.mode,
            brushRadius: this.brushRadius,
            pendingDeletion: new Set(this.pendingDeletion),
        };
    }

    subscribe(listener: (state: EraserState) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notifyListeners(): void {
        const state = this.getState();
        this.listeners.forEach(listener => listener(state));
    }
}

export const eraserTool = new EraserTool();
export default EraserTool;
