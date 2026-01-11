// Shortcut Manager - Keyboard shortcut system
// Handles key bindings and shortcut execution

export interface ShortcutDefinition {
    key: string;
    modifiers?: {
        ctrl?: boolean;
        shift?: boolean;
        alt?: boolean;
    };
    action: () => void;
    description: string;
    category: string;
}

export interface ShortcutBinding {
    id: string;
    key: string;
    ctrl: boolean;
    shift: boolean;
    alt: boolean;
    description: string;
    category: string;
}

export class ShortcutManager {
    private shortcuts: Map<string, ShortcutDefinition> = new Map();
    private enabled = true;

    constructor() {
        this.handleKeyDown = this.handleKeyDown.bind(this);
    }

    // Attach to window
    attach(): void {
        window.addEventListener('keydown', this.handleKeyDown);
    }

    // Detach from window
    detach(): void {
        window.removeEventListener('keydown', this.handleKeyDown);
    }

    enable(): void {
        this.enabled = true;
    }

    disable(): void {
        this.enabled = false;
    }

    // Register a shortcut
    register(id: string, definition: ShortcutDefinition): void {
        this.shortcuts.set(id, definition);
    }

    // Unregister a shortcut
    unregister(id: string): void {
        this.shortcuts.delete(id);
    }

    // Get all registered shortcuts
    getBindings(): ShortcutBinding[] {
        const bindings: ShortcutBinding[] = [];
        this.shortcuts.forEach((def, id) => {
            bindings.push({
                id,
                key: def.key,
                ctrl: def.modifiers?.ctrl ?? false,
                shift: def.modifiers?.shift ?? false,
                alt: def.modifiers?.alt ?? false,
                description: def.description,
                category: def.category,
            });
        });
        return bindings.sort((a, b) => a.category.localeCompare(b.category));
    }

    // Get shortcut string representation
    static getShortcutString(binding: ShortcutBinding): string {
        const parts: string[] = [];
        if (binding.ctrl) parts.push('Ctrl');
        if (binding.shift) parts.push('Shift');
        if (binding.alt) parts.push('Alt');
        parts.push(binding.key.toUpperCase());
        return parts.join('+');
    }

    private handleKeyDown(event: KeyboardEvent): void {
        if (!this.enabled) return;

        // Skip if typing in input
        const target = event.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
            return;
        }

        const key = event.key.toLowerCase();
        const ctrl = event.ctrlKey || event.metaKey;
        const shift = event.shiftKey;
        const alt = event.altKey;

        for (const [, def] of this.shortcuts) {
            const modifiers = def.modifiers ?? {};
            const matchCtrl = (modifiers.ctrl ?? false) === ctrl;
            const matchShift = (modifiers.shift ?? false) === shift;
            const matchAlt = (modifiers.alt ?? false) === alt;
            const matchKey = def.key.toLowerCase() === key;

            if (matchKey && matchCtrl && matchShift && matchAlt) {
                event.preventDefault();
                def.action();
                return;
            }
        }
    }

    // Register default shortcuts for GaussianShop
    registerDefaults(actions: {
        selectTool: () => void;
        translateTool: () => void;
        rotateTool: () => void;
        scaleTool: () => void;
        brushTool: () => void;
        eraserTool: () => void;
        undo: () => void;
        redo: () => void;
        deleteSelected: () => void;
        selectAll: () => void;
        deselectAll: () => void;
        invertSelection: () => void;
        toggleGrid: () => void;
        toggleStats: () => void;
        focusSelected: () => void;
        resetCamera: () => void;
    }): void {
        // Tools
        this.register('tool.select', {
            key: 'v',
            action: actions.selectTool,
            description: 'Select Tool',
            category: 'Tools',
        });
        this.register('tool.translate', {
            key: 'g',
            action: actions.translateTool,
            description: 'Move Tool',
            category: 'Tools',
        });
        this.register('tool.rotate', {
            key: 'r',
            action: actions.rotateTool,
            description: 'Rotate Tool',
            category: 'Tools',
        });
        this.register('tool.scale', {
            key: 's',
            action: actions.scaleTool,
            description: 'Scale Tool',
            category: 'Tools',
        });
        this.register('tool.brush', {
            key: 'b',
            action: actions.brushTool,
            description: 'Brush Select',
            category: 'Tools',
        });
        this.register('tool.eraser', {
            key: 'e',
            action: actions.eraserTool,
            description: 'Eraser',
            category: 'Tools',
        });

        // Edit
        this.register('edit.undo', {
            key: 'z',
            modifiers: { ctrl: true },
            action: actions.undo,
            description: 'Undo',
            category: 'Edit',
        });
        this.register('edit.redo', {
            key: 'y',
            modifiers: { ctrl: true },
            action: actions.redo,
            description: 'Redo',
            category: 'Edit',
        });
        this.register('edit.delete', {
            key: 'Delete',
            action: actions.deleteSelected,
            description: 'Delete Selected',
            category: 'Edit',
        });
        this.register('edit.deleteBackspace', {
            key: 'Backspace',
            action: actions.deleteSelected,
            description: 'Delete Selected',
            category: 'Edit',
        });

        // Selection
        this.register('select.all', {
            key: 'a',
            modifiers: { ctrl: true },
            action: actions.selectAll,
            description: 'Select All',
            category: 'Selection',
        });
        this.register('select.deselect', {
            key: 'd',
            modifiers: { ctrl: true },
            action: actions.deselectAll,
            description: 'Deselect All',
            category: 'Selection',
        });
        this.register('select.invert', {
            key: 'i',
            modifiers: { ctrl: true },
            action: actions.invertSelection,
            description: 'Invert Selection',
            category: 'Selection',
        });

        // View
        this.register('view.grid', {
            key: 'g',
            modifiers: { shift: true },
            action: actions.toggleGrid,
            description: 'Toggle Grid',
            category: 'View',
        });
        this.register('view.stats', {
            key: 'i',
            action: actions.toggleStats,
            description: 'Toggle Stats',
            category: 'View',
        });
        this.register('view.focus', {
            key: 'f',
            action: actions.focusSelected,
            description: 'Focus Selected',
            category: 'View',
        });
        this.register('view.reset', {
            key: 'Home',
            action: actions.resetCamera,
            description: 'Reset Camera',
            category: 'View',
        });
    }
}

export const shortcutManager = new ShortcutManager();
export default ShortcutManager;
