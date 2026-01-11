// Toolbar Component
// Tool palette for selection, transform, and editing modes

import type { ReactNode } from 'react';
import { useAppStore, type Tool } from '../store/appStore';
import './Toolbar.css';

interface ToolButton {
    id: Tool;
    label: string;
    icon: ReactNode;
    shortcut: string;
}

const tools: ToolButton[] = [
    {
        id: 'select',
        label: 'Select',
        shortcut: 'V',
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
            </svg>
        ),
    },
    {
        id: 'translate',
        label: 'Move',
        shortcut: 'G',
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="5 9 2 12 5 15" />
                <polyline points="9 5 12 2 15 5" />
                <polyline points="15 19 12 22 9 19" />
                <polyline points="19 9 22 12 19 15" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <line x1="12" y1="2" x2="12" y2="22" />
            </svg>
        ),
    },
    {
        id: 'rotate',
        label: 'Rotate',
        shortcut: 'R',
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 2v6h-6" />
                <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                <path d="M3 22v-6h6" />
                <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
            </svg>
        ),
    },
    {
        id: 'scale',
        label: 'Scale',
        shortcut: 'S',
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
        ),
    },
    {
        id: 'brush',
        label: 'Brush Select',
        shortcut: 'B',
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="4" fill="currentColor" opacity="0.3" />
            </svg>
        ),
    },
    {
        id: 'eraser',
        label: 'Eraser',
        shortcut: 'E',
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 20H7L3 16c-.6-.6-.6-1.5 0-2.1L13.1 3.8c.6-.6 1.5-.6 2.1 0l5 5c.6.6.6 1.5 0 2.1L12 19" />
                <line x1="7" y1="20" x2="20" y2="20" />
            </svg>
        ),
    },
];

export function Toolbar() {
    const { currentTool, setCurrentTool, selectedIndices, clearSelection } = useAppStore();

    const handleToolClick = (tool: Tool) => {
        setCurrentTool(tool);
    };

    const handleDeleteSelected = () => {
        console.log('Delete selected:', selectedIndices.size);
        clearSelection();
    };

    return (
        <div className="toolbar">
            <div className="toolbar-section">
                <div className="toolbar-label">Tools</div>
                <div className="toolbar-tools">
                    {tools.map((tool) => (
                        <button
                            key={tool.id}
                            className={`toolbar-button ${currentTool === tool.id ? 'active' : ''}`}
                            onClick={() => handleToolClick(tool.id)}
                            title={`${tool.label} (${tool.shortcut})`}
                        >
                            {tool.icon}
                        </button>
                    ))}
                </div>
            </div>

            <div className="toolbar-divider" />

            <div className="toolbar-section">
                <div className="toolbar-label">Actions</div>
                <div className="toolbar-actions">
                    <button
                        className="toolbar-button action"
                        onClick={handleDeleteSelected}
                        disabled={selectedIndices.size === 0}
                        title="Delete Selected (Del)"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            <line x1="10" y1="11" x2="10" y2="17" />
                            <line x1="14" y1="11" x2="14" y2="17" />
                        </svg>
                    </button>
                    <button
                        className="toolbar-button action"
                        title="Duplicate (Ctrl+D)"
                        disabled={selectedIndices.size === 0}
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                    </button>
                </div>
            </div>

            {selectedIndices.size > 0 && (
                <>
                    <div className="toolbar-divider" />
                    <div className="toolbar-selection-info">
                        <span className="selection-count">{selectedIndices.size.toLocaleString()}</span>
                        <span className="selection-label">selected</span>
                    </div>
                </>
            )}
        </div>
    );
}

export default Toolbar;
