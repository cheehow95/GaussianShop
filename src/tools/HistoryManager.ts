// History Manager - Undo/Redo System
// Implements command pattern for reversible operations

import type { GaussianData } from '../core/SplatRenderer';

export interface HistoryCommand {
    type: string;
    description: string;
    execute: () => void;
    undo: () => void;
}

export interface TransformState {
    positions: Float32Array;
    rotations: Float32Array;
    scales: Float32Array;
}

export interface DeleteState {
    indices: number[];
    data: {
        positions: Float32Array;
        opacities: Float32Array;
        scales: Float32Array;
        rotations: Float32Array;
        colors: Float32Array;
    };
}

export class HistoryManager {
    private undoStack: HistoryCommand[] = [];
    private redoStack: HistoryCommand[] = [];
    private maxHistorySize: number;
    private listeners: Set<() => void> = new Set();

    constructor(maxHistorySize = 50) {
        this.maxHistorySize = maxHistorySize;
    }

    execute(command: HistoryCommand): void {
        command.execute();
        this.undoStack.push(command);
        this.redoStack = []; // Clear redo stack on new action

        // Trim history if needed
        if (this.undoStack.length > this.maxHistorySize) {
            this.undoStack.shift();
        }

        this.notifyListeners();
    }

    undo(): boolean {
        const command = this.undoStack.pop();
        if (!command) return false;

        command.undo();
        this.redoStack.push(command);
        this.notifyListeners();
        return true;
    }

    redo(): boolean {
        const command = this.redoStack.pop();
        if (!command) return false;

        command.execute();
        this.undoStack.push(command);
        this.notifyListeners();
        return true;
    }

    canUndo(): boolean {
        return this.undoStack.length > 0;
    }

    canRedo(): boolean {
        return this.redoStack.length > 0;
    }

    getUndoDescription(): string | null {
        const command = this.undoStack[this.undoStack.length - 1];
        return command?.description ?? null;
    }

    getRedoDescription(): string | null {
        const command = this.redoStack[this.redoStack.length - 1];
        return command?.description ?? null;
    }

    clear(): void {
        this.undoStack = [];
        this.redoStack = [];
        this.notifyListeners();
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notifyListeners(): void {
        this.listeners.forEach(listener => listener());
    }

    // Command factory methods
    static createTransformCommand(
        gaussianData: GaussianData,
        indices: number[],
        oldState: TransformState,
        newState: TransformState,
        description: string
    ): HistoryCommand {
        return {
            type: 'transform',
            description,
            execute: () => {
                for (let i = 0; i < indices.length; i++) {
                    const idx = indices[i];
                    gaussianData.positions[idx * 3] = newState.positions[i * 3];
                    gaussianData.positions[idx * 3 + 1] = newState.positions[i * 3 + 1];
                    gaussianData.positions[idx * 3 + 2] = newState.positions[i * 3 + 2];
                    gaussianData.rotations[idx * 4] = newState.rotations[i * 4];
                    gaussianData.rotations[idx * 4 + 1] = newState.rotations[i * 4 + 1];
                    gaussianData.rotations[idx * 4 + 2] = newState.rotations[i * 4 + 2];
                    gaussianData.rotations[idx * 4 + 3] = newState.rotations[i * 4 + 3];
                    gaussianData.scales[idx * 3] = newState.scales[i * 3];
                    gaussianData.scales[idx * 3 + 1] = newState.scales[i * 3 + 1];
                    gaussianData.scales[idx * 3 + 2] = newState.scales[i * 3 + 2];
                }
            },
            undo: () => {
                for (let i = 0; i < indices.length; i++) {
                    const idx = indices[i];
                    gaussianData.positions[idx * 3] = oldState.positions[i * 3];
                    gaussianData.positions[idx * 3 + 1] = oldState.positions[i * 3 + 1];
                    gaussianData.positions[idx * 3 + 2] = oldState.positions[i * 3 + 2];
                    gaussianData.rotations[idx * 4] = oldState.rotations[i * 4];
                    gaussianData.rotations[idx * 4 + 1] = oldState.rotations[i * 4 + 1];
                    gaussianData.rotations[idx * 4 + 2] = oldState.rotations[i * 4 + 2];
                    gaussianData.rotations[idx * 4 + 3] = oldState.rotations[i * 4 + 3];
                    gaussianData.scales[idx * 3] = oldState.scales[i * 3];
                    gaussianData.scales[idx * 3 + 1] = oldState.scales[i * 3 + 1];
                    gaussianData.scales[idx * 3 + 2] = oldState.scales[i * 3 + 2];
                }
            },
        };
    }
}

export const historyManager = new HistoryManager();
export default HistoryManager;
