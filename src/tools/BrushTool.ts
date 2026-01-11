// Brush Tool - Screen-space brush selection
// Provides adjustable radius brush for selecting Gaussians

import { selectionManager, type SelectionMode } from './SelectionManager';

export interface BrushState {
    active: boolean;
    position: { x: number; y: number };
    radius: number;
    mode: SelectionMode;
}

export class BrushTool {
    private radius = 50;
    private minRadius = 10;
    private maxRadius = 200;
    private isActive = false;
    private position = { x: 0, y: 0 };
    private mode: SelectionMode = 'add';
    private listeners: Set<(state: BrushState) => void> = new Set();

    // Viewport info for selection
    private viewMatrix: Float32Array | null = null;
    private projMatrix: Float32Array | null = null;
    private viewportWidth = 0;
    private viewportHeight = 0;

    setViewportInfo(
        viewMatrix: Float32Array,
        projMatrix: Float32Array,
        width: number,
        height: number
    ): void {
        this.viewMatrix = viewMatrix;
        this.projMatrix = projMatrix;
        this.viewportWidth = width;
        this.viewportHeight = height;
    }

    getRadius(): number {
        return this.radius;
    }

    setRadius(radius: number): void {
        this.radius = Math.max(this.minRadius, Math.min(this.maxRadius, radius));
        this.notifyListeners();
    }

    adjustRadius(delta: number): void {
        this.setRadius(this.radius + delta);
    }

    getMode(): SelectionMode {
        return this.mode;
    }

    setMode(mode: SelectionMode): void {
        this.mode = mode;
        this.notifyListeners();
    }

    isActivelyBrushing(): boolean {
        return this.isActive;
    }

    startBrush(x: number, y: number): void {
        this.isActive = true;
        this.position = { x, y };
        this.applyBrush();
        this.notifyListeners();
    }

    moveBrush(x: number, y: number): void {
        this.position = { x, y };
        if (this.isActive) {
            this.applyBrush();
        }
        this.notifyListeners();
    }

    endBrush(): void {
        this.isActive = false;
        this.notifyListeners();
    }

    private applyBrush(): void {
        if (!this.viewMatrix || !this.projMatrix) return;

        selectionManager.selectBrush(
            this.position.x,
            this.position.y,
            this.radius,
            this.viewMatrix,
            this.projMatrix,
            this.viewportWidth,
            this.viewportHeight,
            this.mode
        );
    }

    getState(): BrushState {
        return {
            active: this.isActive,
            position: { ...this.position },
            radius: this.radius,
            mode: this.mode,
        };
    }

    subscribe(listener: (state: BrushState) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notifyListeners(): void {
        const state = this.getState();
        this.listeners.forEach(listener => listener(state));
    }
}

export const brushTool = new BrushTool();
export default BrushTool;
