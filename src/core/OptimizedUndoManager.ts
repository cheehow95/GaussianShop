// Optimized Undo Manager - Incremental state storage
// Stores deltas instead of full state for memory efficiency

export interface UndoAction {
    id: string;
    type: string;
    timestamp: number;
    delta: unknown;
    redo: () => void;
    undo: () => void;
    merge?: (other: UndoAction) => UndoAction | null;
}

export interface UndoState {
    past: UndoAction[];
    future: UndoAction[];
}

export class OptimizedUndoManager {
    private state: UndoState = { past: [], future: [] };
    private maxHistorySize: number;
    private mergeWindow: number; // ms
    private listeners: Set<() => void> = new Set();

    constructor(maxHistorySize: number = 50, mergeWindow: number = 500) {
        this.maxHistorySize = maxHistorySize;
        this.mergeWindow = mergeWindow;
    }

    /**
     * Push an action to the undo stack
     */
    push(action: UndoAction): void {
        const now = performance.now();

        // Try to merge with last action
        if (this.state.past.length > 0) {
            const last = this.state.past[this.state.past.length - 1];

            // Only merge if same type and within merge window
            if (
                last.type === action.type &&
                now - last.timestamp < this.mergeWindow &&
                action.merge
            ) {
                const merged = action.merge(last);
                if (merged) {
                    this.state.past[this.state.past.length - 1] = merged;
                    this.state.future = []; // Clear future on new action
                    this.notify();
                    return;
                }
            }
        }

        // Add new action
        this.state.past.push(action);
        this.state.future = []; // Clear future on new action

        // Trim history if too large
        while (this.state.past.length > this.maxHistorySize) {
            this.state.past.shift();
        }

        this.notify();
    }

    /**
     * Undo last action
     */
    undo(): boolean {
        const action = this.state.past.pop();
        if (!action) return false;

        action.undo();
        this.state.future.unshift(action);
        this.notify();
        return true;
    }

    /**
     * Redo last undone action
     */
    redo(): boolean {
        const action = this.state.future.shift();
        if (!action) return false;

        action.redo();
        this.state.past.push(action);
        this.notify();
        return true;
    }

    /**
     * Check if undo is available
     */
    canUndo(): boolean {
        return this.state.past.length > 0;
    }

    /**
     * Check if redo is available
     */
    canRedo(): boolean {
        return this.state.future.length > 0;
    }

    /**
     * Get undo/redo state summary
     */
    getState(): { undoCount: number; redoCount: number; lastAction: string | null } {
        return {
            undoCount: this.state.past.length,
            redoCount: this.state.future.length,
            lastAction: this.state.past.length > 0
                ? this.state.past[this.state.past.length - 1].type
                : null,
        };
    }

    /**
     * Subscribe to changes
     */
    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notify(): void {
        for (const listener of this.listeners) {
            listener();
        }
    }

    /**
     * Clear all history
     */
    clear(): void {
        this.state = { past: [], future: [] };
        this.notify();
    }

    /**
     * Get memory estimate
     */
    getMemoryEstimate(): number {
        // Rough estimate based on action count
        return (this.state.past.length + this.state.future.length) * 1024; // ~1KB per action
    }
}

// Helper to create transform actions
export function createTransformAction(
    id: string,
    objectId: string,
    oldTransform: { position?: number[]; rotation?: number[]; scale?: number[] },
    newTransform: { position?: number[]; rotation?: number[]; scale?: number[] },
    apply: (transform: typeof oldTransform) => void
): UndoAction {
    return {
        id,
        type: 'transform',
        timestamp: performance.now(),
        delta: { objectId, oldTransform, newTransform },
        undo: () => apply(oldTransform),
        redo: () => apply(newTransform),
        merge: (other: UndoAction) => {
            const otherDelta = other.delta as typeof newTransform & { objectId: string; oldTransform: typeof oldTransform };
            if (otherDelta.objectId === objectId) {
                return createTransformAction(
                    id,
                    objectId,
                    otherDelta.oldTransform, // Keep original old transform
                    newTransform,
                    apply
                );
            }
            return null;
        },
    };
}

// Helper to create selection actions
export function createSelectionAction(
    id: string,
    oldSelection: string[],
    newSelection: string[],
    apply: (selection: string[]) => void
): UndoAction {
    return {
        id,
        type: 'selection',
        timestamp: performance.now(),
        delta: { oldSelection, newSelection },
        undo: () => apply(oldSelection),
        redo: () => apply(newSelection),
    };
}

export const undoManager = new OptimizedUndoManager();
export default OptimizedUndoManager;
