// Layer Manager - Layer system for organizing objects
// Controls visibility, locking, and color per layer

export interface Layer {
    id: string;
    name: string;
    visible: boolean;
    locked: boolean;
    color: string;
    order: number;
}

export interface LayerData {
    layers: Layer[];
    activeLayerId: string;
}

const DEFAULT_LAYERS: Layer[] = [
    { id: 'default', name: 'Default', visible: true, locked: false, color: '#808080', order: 0 },
];

export class LayerManager {
    private layers: Map<string, Layer> = new Map();
    private activeLayerId = 'default';
    private idCounter = 0;

    private listeners: Set<() => void> = new Set();

    constructor() {
        this.reset();
    }

    // Reset to default layers
    reset(): void {
        this.layers.clear();
        for (const layer of DEFAULT_LAYERS) {
            this.layers.set(layer.id, { ...layer });
        }
        this.activeLayerId = 'default';
        this.notifyListeners();
    }

    // Generate unique ID
    private generateId(): string {
        return `layer_${++this.idCounter}_${Date.now()}`;
    }

    // Create new layer
    createLayer(name: string): Layer {
        const id = this.generateId();
        const order = this.layers.size;
        const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c'];
        const color = colors[order % colors.length];

        const layer: Layer = {
            id,
            name,
            visible: true,
            locked: false,
            color,
            order,
        };

        this.layers.set(id, layer);
        this.notifyListeners();
        return layer;
    }

    // Get layer by ID
    getLayer(id: string): Layer | undefined {
        return this.layers.get(id);
    }

    // Get all layers sorted by order
    getAllLayers(): Layer[] {
        return Array.from(this.layers.values()).sort((a, b) => a.order - b.order);
    }

    // Delete layer (moves objects to default layer)
    deleteLayer(id: string): boolean {
        if (id === 'default') {
            console.warn('Cannot delete default layer');
            return false;
        }

        const deleted = this.layers.delete(id);
        if (deleted && this.activeLayerId === id) {
            this.activeLayerId = 'default';
        }
        this.notifyListeners();
        return deleted;
    }

    // Rename layer
    renameLayer(id: string, name: string): void {
        const layer = this.layers.get(id);
        if (layer) {
            layer.name = name;
            this.notifyListeners();
        }
    }

    // Set layer visibility
    setLayerVisible(id: string, visible: boolean): void {
        const layer = this.layers.get(id);
        if (layer) {
            layer.visible = visible;
            this.notifyListeners();
        }
    }

    // Toggle layer visibility
    toggleLayerVisible(id: string): void {
        const layer = this.layers.get(id);
        if (layer) {
            layer.visible = !layer.visible;
            this.notifyListeners();
        }
    }

    // Set layer lock
    setLayerLocked(id: string, locked: boolean): void {
        const layer = this.layers.get(id);
        if (layer) {
            layer.locked = locked;
            this.notifyListeners();
        }
    }

    // Toggle layer lock
    toggleLayerLocked(id: string): void {
        const layer = this.layers.get(id);
        if (layer) {
            layer.locked = !layer.locked;
            this.notifyListeners();
        }
    }

    // Set layer color
    setLayerColor(id: string, color: string): void {
        const layer = this.layers.get(id);
        if (layer) {
            layer.color = color;
            this.notifyListeners();
        }
    }

    // Set active layer
    setActiveLayer(id: string): void {
        if (this.layers.has(id)) {
            this.activeLayerId = id;
            this.notifyListeners();
        }
    }

    // Get active layer
    getActiveLayer(): Layer {
        return this.layers.get(this.activeLayerId) ?? this.layers.get('default')!;
    }

    // Check if layer is visible
    isLayerVisible(id: string): boolean {
        return this.layers.get(id)?.visible ?? true;
    }

    // Check if layer is locked
    isLayerLocked(id: string): boolean {
        return this.layers.get(id)?.locked ?? false;
    }

    // Reorder layers
    reorderLayers(orderedIds: string[]): void {
        orderedIds.forEach((id, index) => {
            const layer = this.layers.get(id);
            if (layer) {
                layer.order = index;
            }
        });
        this.notifyListeners();
    }

    // Show all layers
    showAllLayers(): void {
        for (const layer of this.layers.values()) {
            layer.visible = true;
        }
        this.notifyListeners();
    }

    // Hide all layers except one
    isolateLayer(id: string): void {
        for (const layer of this.layers.values()) {
            layer.visible = layer.id === id;
        }
        this.notifyListeners();
    }

    // Serialize to data
    toData(): LayerData {
        return {
            layers: Array.from(this.layers.values()),
            activeLayerId: this.activeLayerId,
        };
    }

    // Load from data
    loadFromData(data: LayerData): void {
        this.layers.clear();
        for (const layer of data.layers) {
            this.layers.set(layer.id, { ...layer });
        }
        this.activeLayerId = data.activeLayerId;
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

export const layerManager = new LayerManager();
export default LayerManager;
