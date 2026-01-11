// Frustum Culler - View frustum culling for Gaussians
// Skips rendering of Gaussians outside camera view

import { vec3, mat4 } from 'gl-matrix';

export interface Plane {
    normal: vec3;
    distance: number;
}

export interface Frustum {
    planes: Plane[];
}

export interface AABB {
    min: vec3;
    max: vec3;
}

export class FrustumCuller {
    private frustum: Frustum = { planes: [] };
    private viewProjectionMatrix: mat4 = mat4.create();

    /**
     * Extract frustum planes from view-projection matrix
     */
    updateFrustum(viewProjection: mat4): void {
        this.viewProjectionMatrix = viewProjection;
        this.frustum.planes = this.extractPlanes(viewProjection);
    }

    /**
     * Extract 6 frustum planes from combined view-projection matrix
     * Using Gribb/Hartmann method
     */
    private extractPlanes(m: mat4): Plane[] {
        const planes: Plane[] = [];

        // Left plane
        planes.push(this.normalizePlane({
            normal: vec3.fromValues(m[3] + m[0], m[7] + m[4], m[11] + m[8]),
            distance: m[15] + m[12],
        }));

        // Right plane
        planes.push(this.normalizePlane({
            normal: vec3.fromValues(m[3] - m[0], m[7] - m[4], m[11] - m[8]),
            distance: m[15] - m[12],
        }));

        // Bottom plane
        planes.push(this.normalizePlane({
            normal: vec3.fromValues(m[3] + m[1], m[7] + m[5], m[11] + m[9]),
            distance: m[15] + m[13],
        }));

        // Top plane
        planes.push(this.normalizePlane({
            normal: vec3.fromValues(m[3] - m[1], m[7] - m[5], m[11] - m[9]),
            distance: m[15] - m[13],
        }));

        // Near plane
        planes.push(this.normalizePlane({
            normal: vec3.fromValues(m[3] + m[2], m[7] + m[6], m[11] + m[10]),
            distance: m[15] + m[14],
        }));

        // Far plane
        planes.push(this.normalizePlane({
            normal: vec3.fromValues(m[3] - m[2], m[7] - m[6], m[11] - m[10]),
            distance: m[15] - m[14],
        }));

        return planes;
    }

    private normalizePlane(plane: Plane): Plane {
        const length = vec3.length(plane.normal);
        return {
            normal: vec3.scale(vec3.create(), plane.normal, 1 / length),
            distance: plane.distance / length,
        };
    }

    /**
     * Test if a point is inside the frustum
     */
    isPointVisible(point: vec3): boolean {
        for (const plane of this.frustum.planes) {
            const distance = vec3.dot(plane.normal, point) + plane.distance;
            if (distance < 0) {
                return false;
            }
        }
        return true;
    }

    /**
     * Test if a sphere is visible in frustum
     */
    isSphereVisible(center: vec3, radius: number): boolean {
        for (const plane of this.frustum.planes) {
            const distance = vec3.dot(plane.normal, center) + plane.distance;
            if (distance < -radius) {
                return false;
            }
        }
        return true;
    }

    /**
     * Test if an AABB is visible in frustum
     */
    isAABBVisible(aabb: AABB): boolean {
        for (const plane of this.frustum.planes) {
            // Find the positive vertex (farthest in plane normal direction)
            const pVertex = vec3.fromValues(
                plane.normal[0] >= 0 ? aabb.max[0] : aabb.min[0],
                plane.normal[1] >= 0 ? aabb.max[1] : aabb.min[1],
                plane.normal[2] >= 0 ? aabb.max[2] : aabb.min[2]
            );

            if (vec3.dot(plane.normal, pVertex) + plane.distance < 0) {
                return false;
            }
        }
        return true;
    }

    /**
     * Cull Gaussians based on frustum
     * Returns indices of visible Gaussians
     */
    cullGaussians(
        positions: Float32Array,
        count: number,
        radius: number = 0.1
    ): Uint32Array {
        const visibleIndices: number[] = [];

        for (let i = 0; i < count; i++) {
            const center = vec3.fromValues(
                positions[i * 3],
                positions[i * 3 + 1],
                positions[i * 3 + 2]
            );

            // Use sphere test with estimated Gaussian radius
            if (this.isSphereVisible(center, radius)) {
                visibleIndices.push(i);
            }
        }

        return new Uint32Array(visibleIndices);
    }

    /**
     * Batch cull with SIMD-like optimization
     * Processes 4 Gaussians at a time
     */
    cullGaussiansBatch(
        positions: Float32Array,
        count: number,
        radius: number = 0.1
    ): { visibleIndices: Uint32Array; culledCount: number } {
        const visible: number[] = [];
        let culledCount = 0;

        // Process in batches of 4 for better cache utilization
        const batchSize = 4;
        const fullBatches = Math.floor(count / batchSize);

        for (let batch = 0; batch < fullBatches; batch++) {
            const baseIdx = batch * batchSize;

            for (let j = 0; j < batchSize; j++) {
                const i = baseIdx + j;
                const center = vec3.fromValues(
                    positions[i * 3],
                    positions[i * 3 + 1],
                    positions[i * 3 + 2]
                );

                if (this.isSphereVisible(center, radius)) {
                    visible.push(i);
                } else {
                    culledCount++;
                }
            }
        }

        // Handle remaining elements
        for (let i = fullBatches * batchSize; i < count; i++) {
            const center = vec3.fromValues(
                positions[i * 3],
                positions[i * 3 + 1],
                positions[i * 3 + 2]
            );

            if (this.isSphereVisible(center, radius)) {
                visible.push(i);
            } else {
                culledCount++;
            }
        }

        return {
            visibleIndices: new Uint32Array(visible),
            culledCount,
        };
    }

    /**
     * Get frustum corners for debug visualization
     */
    getFrustumCorners(inverseViewProjection: mat4): vec3[] {
        const ndcCorners = [
            vec3.fromValues(-1, -1, -1),
            vec3.fromValues(1, -1, -1),
            vec3.fromValues(1, 1, -1),
            vec3.fromValues(-1, 1, -1),
            vec3.fromValues(-1, -1, 1),
            vec3.fromValues(1, -1, 1),
            vec3.fromValues(1, 1, 1),
            vec3.fromValues(-1, 1, 1),
        ];

        return ndcCorners.map(ndc => {
            const world = vec3.create();
            vec3.transformMat4(world, ndc, inverseViewProjection);
            return world;
        });
    }
}

export const frustumCuller = new FrustumCuller();
export default FrustumCuller;
