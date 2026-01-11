// Scene Node - Base node class for scene hierarchy
// Represents a single object in the scene graph

import type { GaussianData } from '../core/SplatRenderer';

export interface Transform {
    position: [number, number, number];
    rotation: [number, number, number, number]; // quaternion
    scale: [number, number, number];
}

export interface SceneNodeData {
    id: string;
    name: string;
    transform: Transform;
    visible: boolean;
    locked: boolean;
    layer: string;
    gaussianIndices?: number[]; // Indices into main GaussianData
    children?: string[]; // Child node IDs
    parentId?: string;
    metadata?: Record<string, unknown>;
}

export class SceneNode {
    id: string;
    name: string;
    transform: Transform;
    visible: boolean;
    locked: boolean;
    layer: string;
    gaussianIndices: number[];
    children: SceneNode[] = [];
    parent: SceneNode | null = null;
    metadata: Record<string, unknown> = {};

    private listeners: Set<() => void> = new Set();

    constructor(id: string, name: string) {
        this.id = id;
        this.name = name;
        this.transform = {
            position: [0, 0, 0],
            rotation: [1, 0, 0, 0],
            scale: [1, 1, 1],
        };
        this.visible = true;
        this.locked = false;
        this.layer = 'default';
        this.gaussianIndices = [];
    }

    // Create from serialized data
    static fromData(data: SceneNodeData): SceneNode {
        const node = new SceneNode(data.id, data.name);
        node.transform = { ...data.transform };
        node.visible = data.visible;
        node.locked = data.locked;
        node.layer = data.layer;
        node.gaussianIndices = data.gaussianIndices ? [...data.gaussianIndices] : [];
        node.metadata = data.metadata ? { ...data.metadata } : {};
        return node;
    }

    // Serialize to data
    toData(): SceneNodeData {
        return {
            id: this.id,
            name: this.name,
            transform: { ...this.transform },
            visible: this.visible,
            locked: this.locked,
            layer: this.layer,
            gaussianIndices: [...this.gaussianIndices],
            children: this.children.map(c => c.id),
            parentId: this.parent?.id,
            metadata: { ...this.metadata },
        };
    }

    // Add child node
    addChild(node: SceneNode): void {
        if (node.parent) {
            node.parent.removeChild(node);
        }
        node.parent = this;
        this.children.push(node);
        this.notifyListeners();
    }

    // Remove child node
    removeChild(node: SceneNode): void {
        const index = this.children.indexOf(node);
        if (index >= 0) {
            this.children.splice(index, 1);
            node.parent = null;
            this.notifyListeners();
        }
    }

    // Get world transform (accumulated from parents)
    getWorldTransform(): Transform {
        if (!this.parent) {
            return { ...this.transform };
        }

        const parentWorld = this.parent.getWorldTransform();

        // Combine transforms
        return {
            position: [
                parentWorld.position[0] + this.transform.position[0] * parentWorld.scale[0],
                parentWorld.position[1] + this.transform.position[1] * parentWorld.scale[1],
                parentWorld.position[2] + this.transform.position[2] * parentWorld.scale[2],
            ],
            rotation: this.multiplyQuaternion(parentWorld.rotation, this.transform.rotation),
            scale: [
                parentWorld.scale[0] * this.transform.scale[0],
                parentWorld.scale[1] * this.transform.scale[1],
                parentWorld.scale[2] * this.transform.scale[2],
            ],
        };
    }

    // Check if this node is an ancestor of another
    isAncestorOf(node: SceneNode): boolean {
        let current: SceneNode | null = node.parent;
        while (current) {
            if (current === this) return true;
            current = current.parent;
        }
        return false;
    }

    // Get all descendant nodes
    getDescendants(): SceneNode[] {
        const descendants: SceneNode[] = [];
        const traverse = (node: SceneNode) => {
            for (const child of node.children) {
                descendants.push(child);
                traverse(child);
            }
        };
        traverse(this);
        return descendants;
    }

    // Get path from root to this node
    getPath(): SceneNode[] {
        const path: SceneNode[] = [this];
        let current = this.parent;
        while (current) {
            path.unshift(current);
            current = current.parent;
        }
        return path;
    }

    // Check visibility including parents
    isEffectivelyVisible(): boolean {
        if (!this.visible) return false;
        if (this.parent) {
            return this.parent.isEffectivelyVisible();
        }
        return true;
    }

    // Check locked including parents
    isEffectivelyLocked(): boolean {
        if (this.locked) return true;
        if (this.parent) {
            return this.parent.isEffectivelyLocked();
        }
        return false;
    }

    // Apply transform to Gaussian data
    applyTransformToGaussians(gaussianData: GaussianData): void {
        const worldTransform = this.getWorldTransform();

        for (const idx of this.gaussianIndices) {
            // Transform position
            const px = gaussianData.positions[idx * 3];
            const py = gaussianData.positions[idx * 3 + 1];
            const pz = gaussianData.positions[idx * 3 + 2];

            // Apply scale
            const sx = px * worldTransform.scale[0];
            const sy = py * worldTransform.scale[1];
            const sz = pz * worldTransform.scale[2];

            // Apply rotation
            const rotated = this.rotateVector([sx, sy, sz], worldTransform.rotation);

            // Apply translation
            gaussianData.positions[idx * 3] = rotated[0] + worldTransform.position[0];
            gaussianData.positions[idx * 3 + 1] = rotated[1] + worldTransform.position[1];
            gaussianData.positions[idx * 3 + 2] = rotated[2] + worldTransform.position[2];
        }
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notifyListeners(): void {
        this.listeners.forEach(l => l());
    }

    private multiplyQuaternion(
        a: [number, number, number, number],
        b: [number, number, number, number]
    ): [number, number, number, number] {
        return [
            a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
            a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
            a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
            a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
        ];
    }

    private rotateVector(
        v: [number, number, number],
        q: [number, number, number, number]
    ): [number, number, number] {
        const [qw, qx, qy, qz] = q;
        const [vx, vy, vz] = v;

        const tx = 2 * (qy * vz - qz * vy);
        const ty = 2 * (qz * vx - qx * vz);
        const tz = 2 * (qx * vy - qy * vx);

        return [
            vx + qw * tx + qy * tz - qz * ty,
            vy + qw * ty + qz * tx - qx * tz,
            vz + qw * tz + qx * ty - qy * tx,
        ];
    }
}

export default SceneNode;
