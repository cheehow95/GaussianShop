// Context Menu Component
// Right-click context menu with nested submenus

import { useState, useEffect, useRef } from 'react';
import './ContextMenu.css';

export interface MenuOption {
    id: string;
    label: string;
    icon?: React.ReactNode;
    shortcut?: string;
    disabled?: boolean;
    divider?: boolean;
    submenu?: MenuOption[];
    action?: () => void;
}

interface ContextMenuProps {
    x: number;
    y: number;
    options: MenuOption[];
    onClose: () => void;
}

export function ContextMenu({ x, y, options, onClose }: ContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);
    const [submenuId, setSubmenuId] = useState<string | null>(null);
    const [submenuPos, setSubmenuPos] = useState<{ x: number; y: number } | null>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [onClose]);

    // Adjust position to stay in viewport
    useEffect(() => {
        if (menuRef.current) {
            const rect = menuRef.current.getBoundingClientRect();
            const adjustedX = Math.min(x, window.innerWidth - rect.width - 10);
            const adjustedY = Math.min(y, window.innerHeight - rect.height - 10);

            if (adjustedX !== x || adjustedY !== y) {
                menuRef.current.style.left = `${adjustedX}px`;
                menuRef.current.style.top = `${adjustedY}px`;
            }
        }
    }, [x, y]);

    const handleOptionClick = (option: MenuOption) => {
        if (option.disabled) return;
        if (option.submenu) return; // Submenus open on hover

        option.action?.();
        onClose();
    };

    const handleOptionHover = (option: MenuOption, e: React.MouseEvent) => {
        if (option.submenu) {
            const rect = (e.target as HTMLElement).getBoundingClientRect();
            setSubmenuId(option.id);
            setSubmenuPos({ x: rect.right, y: rect.top });
        } else {
            setSubmenuId(null);
            setSubmenuPos(null);
        }
    };

    return (
        <div
            ref={menuRef}
            className="context-menu"
            style={{ left: x, top: y }}
        >
            {options.map((option) => {
                if (option.divider) {
                    return <div key={option.id} className="menu-divider" />;
                }

                return (
                    <div
                        key={option.id}
                        className={`menu-option ${option.disabled ? 'disabled' : ''} ${option.submenu ? 'has-submenu' : ''}`}
                        onClick={() => handleOptionClick(option)}
                        onMouseEnter={(e) => handleOptionHover(option, e)}
                    >
                        {option.icon && <span className="option-icon">{option.icon}</span>}
                        <span className="option-label">{option.label}</span>
                        {option.shortcut && <span className="option-shortcut">{option.shortcut}</span>}
                        {option.submenu && (
                            <svg className="submenu-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="9 18 15 12 9 6" />
                            </svg>
                        )}
                    </div>
                );
            })}

            {submenuId && submenuPos && (
                <ContextMenu
                    x={submenuPos.x}
                    y={submenuPos.y}
                    options={options.find(o => o.id === submenuId)?.submenu ?? []}
                    onClose={() => {
                        setSubmenuId(null);
                        setSubmenuPos(null);
                    }}
                />
            )}
        </div>
    );
}

// Context menu manager
export class ContextMenuManager {
    private static instance: ContextMenuManager;
    private container: HTMLDivElement | null = null;
    private root: any = null;

    static getInstance(): ContextMenuManager {
        if (!this.instance) {
            this.instance = new ContextMenuManager();
        }
        return this.instance;
    }

    show(x: number, y: number, options: MenuOption[]): void {
        this.hide();

        // Create container
        this.container = document.createElement('div');
        this.container.id = 'context-menu-container';
        document.body.appendChild(this.container);

        // Use dynamic import to avoid circular deps
        import('react-dom/client').then(({ createRoot }) => {
            this.root = createRoot(this.container!);
            this.root.render(
                <ContextMenu
                    x={x}
                    y={y}
                    options={options}
                    onClose={() => this.hide()}
                />
            );
        });
    }

    hide(): void {
        if (this.root) {
            this.root.unmount();
            this.root = null;
        }
        if (this.container) {
            this.container.remove();
            this.container = null;
        }
    }
}

export const contextMenuManager = ContextMenuManager.getInstance();
export default ContextMenu;
