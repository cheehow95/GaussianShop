// Transform Tool - Translate, Rotate, Scale operations
// Applies transforms to selected Gaussians with undo support

import type { GaussianData } from '../core/SplatRenderer';
import { selectionManager } from './SelectionManager';
import { historyManager, HistoryManager, type TransformState } from './HistoryManager';

export type TransformMode = 'translate' | 'rotate' | 'scale';
export type TransformSpace = 'world' | 'local';
export type TransformAxis = 'x' | 'y' | 'z' | 'xy' | 'xz' | 'yz' | 'xyz';

export interface TransformOptions {
    mode: TransformMode;
    space: TransformSpace;
    axis: TransformAxis;
    snapEnabled: boolean;
    snapValue: number;
}

export class TransformTool {
    private mode: TransformMode = 'translate';
    private space: TransformSpace = 'world';
    private axis: TransformAxis = 'xyz';
    private snapEnabled = false;
    private snapTranslate = 0.1;
    private snapRotate = 15; // degrees
    private snapScale = 0.1;

    private isTransforming = false;
    private startState: TransformState | null = null;
    private transformIndices: number[] = [];
    private pivot: [number, number, number] = [0, 0, 0];

    private listeners: Set<(options: TransformOptions) => void> = new Set();

    getMode(): TransformMode {
        return this.mode;
    }

    setMode(mode: TransformMode): void {
        this.mode = mode;
        this.notifyListeners();
    }

    getSpace(): TransformSpace {
        return this.space;
    }

    setSpace(space: TransformSpace): void {
        this.space = space;
        this.notifyListeners();
    }

    getAxis(): TransformAxis {
        return this.axis;
    }

    setAxis(axis: TransformAxis): void {
        this.axis = axis;
        this.notifyListeners();
    }

    isSnapEnabled(): boolean {
        return this.snapEnabled;
    }

    toggleSnap(): void {
        this.snapEnabled = !this.snapEnabled;
        this.notifyListeners();
    }

    getSnapValue(): number {
        switch (this.mode) {
            case 'translate': return this.snapTranslate;
            case 'rotate': return this.snapRotate;
            case 'scale': return this.snapScale;
        }
    }

    setSnapValue(value: number): void {
        switch (this.mode) {
            case 'translate': this.snapTranslate = value; break;
            case 'rotate': this.snapRotate = value; break;
            case 'scale': this.snapScale = value; break;
        }
        this.notifyListeners();
    }

    // Start transform operation
    beginTransform(gaussianData: GaussianData): void {
        const selected = selectionManager.getSelectedIndices();
        if (selected.size === 0) return;

        this.isTransforming = true;
        this.transformIndices = Array.from(selected);

        // Store initial state
        this.startState = {
            positions: new Float32Array(this.transformIndices.length * 3),
            rotations: new Float32Array(this.transformIndices.length * 4),
            scales: new Float32Array(this.transformIndices.length * 3),
        };

        for (let i = 0; i < this.transformIndices.length; i++) {
            const idx = this.transformIndices[i];
            this.startState.positions[i * 3] = gaussianData.positions[idx * 3];
            this.startState.positions[i * 3 + 1] = gaussianData.positions[idx * 3 + 1];
            this.startState.positions[i * 3 + 2] = gaussianData.positions[idx * 3 + 2];
            this.startState.rotations[i * 4] = gaussianData.rotations[idx * 4];
            this.startState.rotations[i * 4 + 1] = gaussianData.rotations[idx * 4 + 1];
            this.startState.rotations[i * 4 + 2] = gaussianData.rotations[idx * 4 + 2];
            this.startState.rotations[i * 4 + 3] = gaussianData.rotations[idx * 4 + 3];
            this.startState.scales[i * 3] = gaussianData.scales[idx * 3];
            this.startState.scales[i * 3 + 1] = gaussianData.scales[idx * 3 + 1];
            this.startState.scales[i * 3 + 2] = gaussianData.scales[idx * 3 + 2];
        }

        // Calculate pivot
        const center = selectionManager.getSelectionCenter();
        if (center) {
            this.pivot = center;
        }
    }

    // Apply translation
    translate(gaussianData: GaussianData, delta: [number, number, number]): void {
        if (!this.isTransforming || !this.startState) return;

        let dx = delta[0], dy = delta[1], dz = delta[2];

        // Apply axis constraint
        if (!this.axis.includes('x')) dx = 0;
        if (!this.axis.includes('y')) dy = 0;
        if (!this.axis.includes('z')) dz = 0;

        // Apply snap
        if (this.snapEnabled) {
            dx = Math.round(dx / this.snapTranslate) * this.snapTranslate;
            dy = Math.round(dy / this.snapTranslate) * this.snapTranslate;
            dz = Math.round(dz / this.snapTranslate) * this.snapTranslate;
        }

        for (let i = 0; i < this.transformIndices.length; i++) {
            const idx = this.transformIndices[i];
            gaussianData.positions[idx * 3] = this.startState.positions[i * 3] + dx;
            gaussianData.positions[idx * 3 + 1] = this.startState.positions[i * 3 + 1] + dy;
            gaussianData.positions[idx * 3 + 2] = this.startState.positions[i * 3 + 2] + dz;
        }
    }

    // Apply rotation (angle in radians)
    rotate(gaussianData: GaussianData, axis: [number, number, number], angle: number): void {
        if (!this.isTransforming || !this.startState) return;

        // Apply snap
        if (this.snapEnabled) {
            const snapRad = (this.snapRotate * Math.PI) / 180;
            angle = Math.round(angle / snapRad) * snapRad;
        }

        const halfAngle = angle / 2;
        const sinHalf = Math.sin(halfAngle);
        const cosHalf = Math.cos(halfAngle);

        // Rotation quaternion
        const rw = cosHalf;
        const rx = axis[0] * sinHalf;
        const ry = axis[1] * sinHalf;
        const rz = axis[2] * sinHalf;

        for (let i = 0; i < this.transformIndices.length; i++) {
            const idx = this.transformIndices[i];

            // Rotate position around pivot
            const px = this.startState.positions[i * 3] - this.pivot[0];
            const py = this.startState.positions[i * 3 + 1] - this.pivot[1];
            const pz = this.startState.positions[i * 3 + 2] - this.pivot[2];

            const rotated = this.rotateVector([px, py, pz], [rw, rx, ry, rz]);
            gaussianData.positions[idx * 3] = rotated[0] + this.pivot[0];
            gaussianData.positions[idx * 3 + 1] = rotated[1] + this.pivot[1];
            gaussianData.positions[idx * 3 + 2] = rotated[2] + this.pivot[2];

            // Rotate the Gaussian's orientation
            const qw = this.startState.rotations[i * 4];
            const qx = this.startState.rotations[i * 4 + 1];
            const qy = this.startState.rotations[i * 4 + 2];
            const qz = this.startState.rotations[i * 4 + 3];

            const newQuat = this.multiplyQuaternion([rw, rx, ry, rz], [qw, qx, qy, qz]);
            gaussianData.rotations[idx * 4] = newQuat[0];
            gaussianData.rotations[idx * 4 + 1] = newQuat[1];
            gaussianData.rotations[idx * 4 + 2] = newQuat[2];
            gaussianData.rotations[idx * 4 + 3] = newQuat[3];
        }
    }

    // Apply scale
    scale(gaussianData: GaussianData, scaleFactor: [number, number, number]): void {
        if (!this.isTransforming || !this.startState) return;

        let sx = scaleFactor[0], sy = scaleFactor[1], sz = scaleFactor[2];

        // Apply axis constraint
        if (!this.axis.includes('x')) sx = 1;
        if (!this.axis.includes('y')) sy = 1;
        if (!this.axis.includes('z')) sz = 1;

        // Apply snap
        if (this.snapEnabled) {
            sx = Math.round(sx / this.snapScale) * this.snapScale || this.snapScale;
            sy = Math.round(sy / this.snapScale) * this.snapScale || this.snapScale;
            sz = Math.round(sz / this.snapScale) * this.snapScale || this.snapScale;
        }

        for (let i = 0; i < this.transformIndices.length; i++) {
            const idx = this.transformIndices[i];

            // Scale position relative to pivot
            const px = this.startState.positions[i * 3] - this.pivot[0];
            const py = this.startState.positions[i * 3 + 1] - this.pivot[1];
            const pz = this.startState.positions[i * 3 + 2] - this.pivot[2];

            gaussianData.positions[idx * 3] = px * sx + this.pivot[0];
            gaussianData.positions[idx * 3 + 1] = py * sy + this.pivot[1];
            gaussianData.positions[idx * 3 + 2] = pz * sz + this.pivot[2];

            // Scale the Gaussian's scale (log scale)
            gaussianData.scales[idx * 3] = this.startState.scales[i * 3] + Math.log(sx);
            gaussianData.scales[idx * 3 + 1] = this.startState.scales[i * 3 + 1] + Math.log(sy);
            gaussianData.scales[idx * 3 + 2] = this.startState.scales[i * 3 + 2] + Math.log(sz);
        }
    }

    // End transform and create undo command
    endTransform(gaussianData: GaussianData): void {
        if (!this.isTransforming || !this.startState) return;

        // Capture final state
        const endState: TransformState = {
            positions: new Float32Array(this.transformIndices.length * 3),
            rotations: new Float32Array(this.transformIndices.length * 4),
            scales: new Float32Array(this.transformIndices.length * 3),
        };

        for (let i = 0; i < this.transformIndices.length; i++) {
            const idx = this.transformIndices[i];
            endState.positions[i * 3] = gaussianData.positions[idx * 3];
            endState.positions[i * 3 + 1] = gaussianData.positions[idx * 3 + 1];
            endState.positions[i * 3 + 2] = gaussianData.positions[idx * 3 + 2];
            endState.rotations[i * 4] = gaussianData.rotations[idx * 4];
            endState.rotations[i * 4 + 1] = gaussianData.rotations[idx * 4 + 1];
            endState.rotations[i * 4 + 2] = gaussianData.rotations[idx * 4 + 2];
            endState.rotations[i * 4 + 3] = gaussianData.rotations[idx * 4 + 3];
            endState.scales[i * 3] = gaussianData.scales[idx * 3];
            endState.scales[i * 3 + 1] = gaussianData.scales[idx * 3 + 1];
            endState.scales[i * 3 + 2] = gaussianData.scales[idx * 3 + 2];
        }

        // Create undo command
        const modeStr = this.mode.charAt(0).toUpperCase() + this.mode.slice(1);
        const command = HistoryManager.createTransformCommand(
            gaussianData,
            this.transformIndices,
            this.startState,
            endState,
            `${modeStr} ${this.transformIndices.length} Gaussians`
        );

        historyManager.execute(command);

        this.isTransforming = false;
        this.startState = null;
        this.transformIndices = [];
    }

    // Cancel transform
    cancelTransform(gaussianData: GaussianData): void {
        if (!this.isTransforming || !this.startState) return;

        // Restore original state
        for (let i = 0; i < this.transformIndices.length; i++) {
            const idx = this.transformIndices[i];
            gaussianData.positions[idx * 3] = this.startState.positions[i * 3];
            gaussianData.positions[idx * 3 + 1] = this.startState.positions[i * 3 + 1];
            gaussianData.positions[idx * 3 + 2] = this.startState.positions[i * 3 + 2];
            gaussianData.rotations[idx * 4] = this.startState.rotations[i * 4];
            gaussianData.rotations[idx * 4 + 1] = this.startState.rotations[i * 4 + 1];
            gaussianData.rotations[idx * 4 + 2] = this.startState.rotations[i * 4 + 2];
            gaussianData.rotations[idx * 4 + 3] = this.startState.rotations[i * 4 + 3];
            gaussianData.scales[idx * 3] = this.startState.scales[i * 3];
            gaussianData.scales[idx * 3 + 1] = this.startState.scales[i * 3 + 1];
            gaussianData.scales[idx * 3 + 2] = this.startState.scales[i * 3 + 2];
        }

        this.isTransforming = false;
        this.startState = null;
        this.transformIndices = [];
    }

    // Helper: rotate vector by quaternion
    private rotateVector(v: [number, number, number], q: [number, number, number, number]): [number, number, number] {
        const [qw, qx, qy, qz] = q;
        const [vx, vy, vz] = v;

        // q * v * q^-1
        const tx = 2 * (qy * vz - qz * vy);
        const ty = 2 * (qz * vx - qx * vz);
        const tz = 2 * (qx * vy - qy * vx);

        return [
            vx + qw * tx + qy * tz - qz * ty,
            vy + qw * ty + qz * tx - qx * tz,
            vz + qw * tz + qx * ty - qy * tx,
        ];
    }

    // Helper: multiply quaternions
    private multiplyQuaternion(
        a: [number, number, number, number],
        b: [number, number, number, number]
    ): [number, number, number, number] {
        const [aw, ax, ay, az] = a;
        const [bw, bx, by, bz] = b;

        return [
            aw * bw - ax * bx - ay * by - az * bz,
            aw * bx + ax * bw + ay * bz - az * by,
            aw * by - ax * bz + ay * bw + az * bx,
            aw * bz + ax * by - ay * bx + az * bw,
        ];
    }

    getOptions(): TransformOptions {
        return {
            mode: this.mode,
            space: this.space,
            axis: this.axis,
            snapEnabled: this.snapEnabled,
            snapValue: this.getSnapValue(),
        };
    }

    subscribe(listener: (options: TransformOptions) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notifyListeners(): void {
        const options = this.getOptions();
        this.listeners.forEach(listener => listener(options));
    }
}

export const transformTool = new TransformTool();
export default TransformTool;
