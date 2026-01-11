// Selection Manager - GPU-accelerated Gaussian selection
// Handles point picking, frustum selection, and selection state

import type { GaussianData } from '../core/SplatRenderer';

export type SelectionMode = 'replace' | 'add' | 'subtract' | 'toggle';

export interface SelectionResult {
    indices: number[];
    count: number;
}

export interface RaycastHit {
    index: number;
    distance: number;
    position: [number, number, number];
}

export class SelectionManager {
    private selectedIndices: Set<number> = new Set();
    private listeners: Set<(indices: Set<number>) => void> = new Set();
    private gaussianData: GaussianData | null = null;

    setGaussianData(data: GaussianData | null): void {
        this.gaussianData = data;
        this.clear();
    }

    getSelectedIndices(): Set<number> {
        return new Set(this.selectedIndices);
    }

    getSelectedCount(): number {
        return this.selectedIndices.size;
    }

    isSelected(index: number): boolean {
        return this.selectedIndices.has(index);
    }

    // Point picking with ray-sphere intersection
    pickPoint(
        rayOrigin: [number, number, number],
        rayDirection: [number, number, number],
        maxDistance = 1000
    ): RaycastHit | null {
        if (!this.gaussianData) return null;

        let closestHit: RaycastHit | null = null;
        const { positions, scales } = this.gaussianData;

        for (let i = 0; i < this.gaussianData.count; i++) {
            const px = positions[i * 3];
            const py = positions[i * 3 + 1];
            const pz = positions[i * 3 + 2];

            // Use average scale as sphere radius
            const radius = Math.exp(
                (scales[i * 3] + scales[i * 3 + 1] + scales[i * 3 + 2]) / 3
            );

            // Ray-sphere intersection
            const dx = px - rayOrigin[0];
            const dy = py - rayOrigin[1];
            const dz = pz - rayOrigin[2];

            const a = rayDirection[0] ** 2 + rayDirection[1] ** 2 + rayDirection[2] ** 2;
            const b = -2 * (dx * rayDirection[0] + dy * rayDirection[1] + dz * rayDirection[2]);
            const c = dx ** 2 + dy ** 2 + dz ** 2 - radius ** 2;

            const discriminant = b * b - 4 * a * c;
            if (discriminant < 0) continue;

            const t = (-b - Math.sqrt(discriminant)) / (2 * a);
            if (t < 0 || t > maxDistance) continue;

            if (!closestHit || t < closestHit.distance) {
                closestHit = {
                    index: i,
                    distance: t,
                    position: [px, py, pz],
                };
            }
        }

        return closestHit;
    }

    // Select Gaussians within screen rectangle
    selectRect(
        minX: number, minY: number,
        maxX: number, maxY: number,
        viewMatrix: Float32Array,
        projMatrix: Float32Array,
        viewportWidth: number,
        viewportHeight: number,
        mode: SelectionMode = 'replace'
    ): SelectionResult {
        if (!this.gaussianData) return { indices: [], count: 0 };

        const selected: number[] = [];
        const { positions } = this.gaussianData;

        // Combined view-projection matrix
        const mvp = new Float32Array(16);
        this.multiplyMatrices(mvp, projMatrix, viewMatrix);

        for (let i = 0; i < this.gaussianData.count; i++) {
            const x = positions[i * 3];
            const y = positions[i * 3 + 1];
            const z = positions[i * 3 + 2];

            // Project to clip space
            const clipX = mvp[0] * x + mvp[4] * y + mvp[8] * z + mvp[12];
            const clipY = mvp[1] * x + mvp[5] * y + mvp[9] * z + mvp[13];
            const clipW = mvp[3] * x + mvp[7] * y + mvp[11] * z + mvp[15];

            if (clipW <= 0) continue; // Behind camera

            // Convert to NDC then screen coords
            const ndcX = clipX / clipW;
            const ndcY = clipY / clipW;
            const screenX = (ndcX + 1) * 0.5 * viewportWidth;
            const screenY = (1 - ndcY) * 0.5 * viewportHeight;

            if (screenX >= minX && screenX <= maxX && screenY >= minY && screenY <= maxY) {
                selected.push(i);
            }
        }

        this.applySelection(selected, mode);
        return { indices: selected, count: selected.length };
    }

    // Select Gaussians within brush radius
    selectBrush(
        centerX: number, centerY: number,
        radius: number,
        viewMatrix: Float32Array,
        projMatrix: Float32Array,
        viewportWidth: number,
        viewportHeight: number,
        mode: SelectionMode = 'add'
    ): SelectionResult {
        if (!this.gaussianData) return { indices: [], count: 0 };

        const selected: number[] = [];
        const { positions } = this.gaussianData;
        const radiusSq = radius * radius;

        const mvp = new Float32Array(16);
        this.multiplyMatrices(mvp, projMatrix, viewMatrix);

        for (let i = 0; i < this.gaussianData.count; i++) {
            const x = positions[i * 3];
            const y = positions[i * 3 + 1];
            const z = positions[i * 3 + 2];

            const clipX = mvp[0] * x + mvp[4] * y + mvp[8] * z + mvp[12];
            const clipY = mvp[1] * x + mvp[5] * y + mvp[9] * z + mvp[13];
            const clipW = mvp[3] * x + mvp[7] * y + mvp[11] * z + mvp[15];

            if (clipW <= 0) continue;

            const ndcX = clipX / clipW;
            const ndcY = clipY / clipW;
            const screenX = (ndcX + 1) * 0.5 * viewportWidth;
            const screenY = (1 - ndcY) * 0.5 * viewportHeight;

            const dx = screenX - centerX;
            const dy = screenY - centerY;
            if (dx * dx + dy * dy <= radiusSq) {
                selected.push(i);
            }
        }

        this.applySelection(selected, mode);
        return { indices: selected, count: selected.length };
    }

    // Apply selection with mode
    private applySelection(indices: number[], mode: SelectionMode): void {
        switch (mode) {
            case 'replace':
                this.selectedIndices = new Set(indices);
                break;
            case 'add':
                indices.forEach(i => this.selectedIndices.add(i));
                break;
            case 'subtract':
                indices.forEach(i => this.selectedIndices.delete(i));
                break;
            case 'toggle':
                indices.forEach(i => {
                    if (this.selectedIndices.has(i)) {
                        this.selectedIndices.delete(i);
                    } else {
                        this.selectedIndices.add(i);
                    }
                });
                break;
        }
        this.notifyListeners();
    }

    select(indices: number[], mode: SelectionMode = 'replace'): void {
        this.applySelection(indices, mode);
    }

    selectAll(): void {
        if (!this.gaussianData) return;
        this.selectedIndices = new Set(
            Array.from({ length: this.gaussianData.count }, (_, i) => i)
        );
        this.notifyListeners();
    }

    invertSelection(): void {
        if (!this.gaussianData) return;
        const newSelection = new Set<number>();
        for (let i = 0; i < this.gaussianData.count; i++) {
            if (!this.selectedIndices.has(i)) {
                newSelection.add(i);
            }
        }
        this.selectedIndices = newSelection;
        this.notifyListeners();
    }

    clear(): void {
        this.selectedIndices.clear();
        this.notifyListeners();
    }

    subscribe(listener: (indices: Set<number>) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notifyListeners(): void {
        this.listeners.forEach(listener => listener(this.selectedIndices));
    }

    private multiplyMatrices(out: Float32Array, a: Float32Array, b: Float32Array): void {
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                out[i * 4 + j] =
                    a[0 * 4 + j] * b[i * 4 + 0] +
                    a[1 * 4 + j] * b[i * 4 + 1] +
                    a[2 * 4 + j] * b[i * 4 + 2] +
                    a[3 * 4 + j] * b[i * 4 + 3];
            }
        }
    }

    // Get center of selection for transform pivot
    getSelectionCenter(): [number, number, number] | null {
        if (!this.gaussianData || this.selectedIndices.size === 0) return null;

        let cx = 0, cy = 0, cz = 0;
        const { positions } = this.gaussianData;

        this.selectedIndices.forEach(idx => {
            cx += positions[idx * 3];
            cy += positions[idx * 3 + 1];
            cz += positions[idx * 3 + 2];
        });

        const count = this.selectedIndices.size;
        return [cx / count, cy / count, cz / count];
    }
}

export const selectionManager = new SelectionManager();
export default SelectionManager;
