// Keyboard Shortcuts Modal
// Displays all available keyboard shortcuts

import { useEffect, useState } from 'react';
import { shortcutManager, type ShortcutBinding } from '../tools/ShortcutManager';
import ShortcutManager from '../tools/ShortcutManager';
import './KeyboardShortcutsModal.css';

interface KeyboardShortcutsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
    const [bindings, setBindings] = useState<ShortcutBinding[]>([]);

    useEffect(() => {
        if (isOpen) {
            setBindings(shortcutManager.getBindings());
        }
    }, [isOpen]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    // Group bindings by category
    const grouped = bindings.reduce((acc, binding) => {
        if (!acc[binding.category]) {
            acc[binding.category] = [];
        }
        acc[binding.category].push(binding);
        return acc;
    }, {} as Record<string, ShortcutBinding[]>);

    const categories = Object.keys(grouped).sort();

    return (
        <div className="shortcuts-overlay" onClick={onClose}>
            <div className="shortcuts-modal" onClick={e => e.stopPropagation()}>
                <header className="shortcuts-header">
                    <h2>Keyboard Shortcuts</h2>
                    <button className="shortcuts-close" onClick={onClose}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </header>

                <div className="shortcuts-content">
                    {categories.length === 0 ? (
                        <div className="shortcuts-empty">
                            No shortcuts registered yet. Load a file to enable shortcuts.
                        </div>
                    ) : (
                        categories.map(category => (
                            <div key={category} className="shortcuts-category">
                                <h3>{category}</h3>
                                <div className="shortcuts-list">
                                    {grouped[category].map(binding => (
                                        <div key={binding.id} className="shortcut-item">
                                            <span className="shortcut-description">
                                                {binding.description}
                                            </span>
                                            <kbd className="shortcut-keys">
                                                {ShortcutManager.getShortcutString(binding)}
                                            </kbd>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))
                    )}

                    <div className="shortcuts-category">
                        <h3>Navigation</h3>
                        <div className="shortcuts-list">
                            <div className="shortcut-item">
                                <span className="shortcut-description">Orbit</span>
                                <kbd className="shortcut-keys">Left Mouse</kbd>
                            </div>
                            <div className="shortcut-item">
                                <span className="shortcut-description">Pan</span>
                                <kbd className="shortcut-keys">Right Mouse</kbd>
                            </div>
                            <div className="shortcut-item">
                                <span className="shortcut-description">Zoom</span>
                                <kbd className="shortcut-keys">Scroll</kbd>
                            </div>
                        </div>
                    </div>

                    <div className="shortcuts-footer">
                        Press <kbd>?</kbd> to toggle this dialog
                    </div>
                </div>
            </div>
        </div>
    );
}

export default KeyboardShortcutsModal;
