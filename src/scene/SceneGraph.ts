// Scene Graph - Hierarchical scene structure
// Manages the tree of scene nodes

import { SceneNode, type SceneNodeData } from './SceneNode';

export interface SceneGraphData {
    version: number;
    rootNodes: string[];
    nodes: SceneNodeData[];
}

export class SceneGraph {
    private nodes: Map<string, SceneNode> = new Map();
    private rootNodes: SceneNode[] = [];
    private selectedNodes: Set<string> = new Set();
    private idCounter = 0;

    private listeners: Set<() => void> = new Set();

    // Generate unique ID
    private generateId(): string {
        return `node_${++this.idCounter}_${Date.now()}`;
    }

    // Create new node
    createNode(name: string, parent?: SceneNode): SceneNode {
        const id = this.generateId();
        const node = new SceneNode(id, name);
        this.nodes.set(id, node);

        if (parent) {
            parent.addChild(node);
        } else {
            this.rootNodes.push(node);
        }

        this.notifyListeners();
        return node;
    }

    // Get node by ID
    getNode(id: string): SceneNode | undefined {
        return this.nodes.get(id);
    }

    // Get all nodes
    getAllNodes(): SceneNode[] {
        return Array.from(this.nodes.values());
    }

    // Get root nodes
    getRootNodes(): SceneNode[] {
        return [...this.rootNodes];
    }

    // Delete node and its children
    deleteNode(id: string): void {
        const node = this.nodes.get(id);
        if (!node) return;

        // Delete descendants first
        for (const child of [...node.children]) {
            this.deleteNode(child.id);
        }

        // Remove from parent
        if (node.parent) {
            node.parent.removeChild(node);
        } else {
            const idx = this.rootNodes.indexOf(node);
            if (idx >= 0) {
                this.rootNodes.splice(idx, 1);
            }
        }

        this.nodes.delete(id);
        this.selectedNodes.delete(id);
        this.notifyListeners();
    }

    // Move node to new parent
    reparentNode(nodeId: string, newParentId: string | null): void {
        const node = this.nodes.get(nodeId);
        if (!node) return;

        const newParent = newParentId ? this.nodes.get(newParentId) : null;

        // Prevent circular references
        if (newParent && node.isAncestorOf(newParent)) {
            console.warn('Cannot reparent: would create circular reference');
            return;
        }

        // Remove from current parent
        if (node.parent) {
            node.parent.removeChild(node);
        } else {
            const idx = this.rootNodes.indexOf(node);
            if (idx >= 0) {
                this.rootNodes.splice(idx, 1);
            }
        }

        // Add to new parent
        if (newParent) {
            newParent.addChild(node);
        } else {
            this.rootNodes.push(node);
            node.parent = null;
        }

        this.notifyListeners();
    }

    // Duplicate node and its children
    duplicateNode(id: string): SceneNode | null {
        const node = this.nodes.get(id);
        if (!node) return null;

        const duplicate = (source: SceneNode, parent?: SceneNode): SceneNode => {
            const newNode = this.createNode(source.name + ' Copy', parent);
            newNode.transform = { ...source.transform };
            newNode.visible = source.visible;
            newNode.locked = source.locked;
            newNode.layer = source.layer;
            newNode.gaussianIndices = [...source.gaussianIndices];
            newNode.metadata = { ...source.metadata };

            for (const child of source.children) {
                duplicate(child, newNode);
            }

            return newNode;
        };

        return duplicate(node, node.parent ?? undefined);
    }

    // Group nodes under a new parent
    groupNodes(nodeIds: string[]): SceneNode | null {
        const nodes = nodeIds.map(id => this.nodes.get(id)).filter((n): n is SceneNode => !!n);
        if (nodes.length === 0) return null;

        // Find common parent
        const firstParent = nodes[0].parent;
        const allSameParent = nodes.every(n => n.parent === firstParent);

        const group = this.createNode('Group', allSameParent ? firstParent ?? undefined : undefined);

        for (const node of nodes) {
            this.reparentNode(node.id, group.id);
        }

        return group;
    }

    // Ungroup nodes (move children to parent of group)
    ungroupNode(groupId: string): void {
        const group = this.nodes.get(groupId);
        if (!group) return;

        const children = [...group.children];
        const parentId = group.parent?.id ?? null;

        for (const child of children) {
            this.reparentNode(child.id, parentId);
        }

        this.deleteNode(groupId);
    }

    // Selection management
    selectNode(id: string, additive = false): void {
        if (!additive) {
            this.selectedNodes.clear();
        }
        this.selectedNodes.add(id);
        this.notifyListeners();
    }

    deselectNode(id: string): void {
        this.selectedNodes.delete(id);
        this.notifyListeners();
    }

    toggleNodeSelection(id: string): void {
        if (this.selectedNodes.has(id)) {
            this.selectedNodes.delete(id);
        } else {
            this.selectedNodes.add(id);
        }
        this.notifyListeners();
    }

    clearSelection(): void {
        this.selectedNodes.clear();
        this.notifyListeners();
    }

    getSelectedNodes(): SceneNode[] {
        return Array.from(this.selectedNodes)
            .map(id => this.nodes.get(id))
            .filter((n): n is SceneNode => !!n);
    }

    isNodeSelected(id: string): boolean {
        return this.selectedNodes.has(id);
    }

    // Find nodes by name
    findNodesByName(name: string, partial = true): SceneNode[] {
        const results: SceneNode[] = [];
        const search = name.toLowerCase();

        for (const node of this.nodes.values()) {
            const nodeName = node.name.toLowerCase();
            if (partial ? nodeName.includes(search) : nodeName === search) {
                results.push(node);
            }
        }

        return results;
    }

    // Find nodes by layer
    findNodesByLayer(layer: string): SceneNode[] {
        return Array.from(this.nodes.values()).filter(n => n.layer === layer);
    }

    // Get all Gaussian indices from visible nodes
    getVisibleGaussianIndices(): number[] {
        const indices: number[] = [];

        const traverse = (node: SceneNode) => {
            if (node.isEffectivelyVisible()) {
                indices.push(...node.gaussianIndices);
                for (const child of node.children) {
                    traverse(child);
                }
            }
        };

        for (const root of this.rootNodes) {
            traverse(root);
        }

        return indices;
    }

    // Serialize to data
    toData(): SceneGraphData {
        return {
            version: 1,
            rootNodes: this.rootNodes.map(n => n.id),
            nodes: Array.from(this.nodes.values()).map(n => n.toData()),
        };
    }

    // Load from data
    loadFromData(data: SceneGraphData): void {
        this.nodes.clear();
        this.rootNodes = [];
        this.selectedNodes.clear();

        // Create all nodes first
        for (const nodeData of data.nodes) {
            const node = SceneNode.fromData(nodeData);
            this.nodes.set(node.id, node);
        }

        // Establish parent-child relationships
        for (const nodeData of data.nodes) {
            const node = this.nodes.get(nodeData.id);
            if (!node) continue;

            if (nodeData.parentId) {
                const parent = this.nodes.get(nodeData.parentId);
                if (parent) {
                    parent.addChild(node);
                }
            }
        }

        // Set root nodes
        this.rootNodes = data.rootNodes
            .map(id => this.nodes.get(id))
            .filter((n): n is SceneNode => !!n);

        this.notifyListeners();
    }

    // Clear all nodes
    clear(): void {
        this.nodes.clear();
        this.rootNodes = [];
        this.selectedNodes.clear();
        this.idCounter = 0;
        this.notifyListeners();
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notifyListeners(): void {
        this.listeners.forEach(l => l());
    }
}

export const sceneGraph = new SceneGraph();
export default SceneGraph;
