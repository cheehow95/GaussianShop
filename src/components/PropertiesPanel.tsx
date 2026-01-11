// Properties Panel Component
// Displays and edits properties of selected Gaussians

import { useState, useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import type { GaussianData } from '../core/SplatRenderer';
import { selectionManager } from '../tools/SelectionManager';
import './PropertiesPanel.css';

interface GaussianProperties {
    position: [number, number, number];
    rotation: [number, number, number, number];
    scale: [number, number, number];
    color: [number, number, number];
    opacity: number;
}

export function PropertiesPanel() {
    const { gaussianData, selectedIndices } = useAppStore();
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [properties, setProperties] = useState<GaussianProperties | null>(null);
    const [isMultiSelect, setIsMultiSelect] = useState(false);

    useEffect(() => {
        const updateProperties = () => {
            const selected = selectionManager.getSelectedIndices();

            if (!gaussianData || selected.size === 0) {
                setProperties(null);
                setIsMultiSelect(false);
                return;
            }

            setIsMultiSelect(selected.size > 1);

            // Get first selected for display
            const firstIdx = [...selected][0];
            setProperties({
                position: [
                    gaussianData.positions[firstIdx * 3],
                    gaussianData.positions[firstIdx * 3 + 1],
                    gaussianData.positions[firstIdx * 3 + 2],
                ],
                rotation: [
                    gaussianData.rotations[firstIdx * 4],
                    gaussianData.rotations[firstIdx * 4 + 1],
                    gaussianData.rotations[firstIdx * 4 + 2],
                    gaussianData.rotations[firstIdx * 4 + 3],
                ],
                scale: [
                    Math.exp(gaussianData.scales[firstIdx * 3]),
                    Math.exp(gaussianData.scales[firstIdx * 3 + 1]),
                    Math.exp(gaussianData.scales[firstIdx * 3 + 2]),
                ],
                color: [
                    gaussianData.colors[firstIdx * 3],
                    gaussianData.colors[firstIdx * 3 + 1],
                    gaussianData.colors[firstIdx * 3 + 2],
                ],
                opacity: gaussianData.opacities[firstIdx],
            });
        };

        updateProperties();
        return selectionManager.subscribe(updateProperties);
    }, [gaussianData, selectedIndices]);

    const colorToHex = (color: [number, number, number]): string => {
        const r = Math.round(color[0] * 255).toString(16).padStart(2, '0');
        const g = Math.round(color[1] * 255).toString(16).padStart(2, '0');
        const b = Math.round(color[2] * 255).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`;
    };

    if (!properties) {
        return (
            <div className={`properties-panel empty ${isCollapsed ? 'collapsed' : ''}`}>
                <div className="panel-header" onClick={() => setIsCollapsed(!isCollapsed)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                    </svg>
                    <span>Properties</span>
                    <svg className="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="6 9 12 15 18 9" />
                    </svg>
                </div>
                {!isCollapsed && (
                    <div className="panel-content">
                        <div className="empty-message">No selection</div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className={`properties-panel ${isCollapsed ? 'collapsed' : ''}`}>
            <div className="panel-header" onClick={() => setIsCollapsed(!isCollapsed)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                <span>Properties</span>
                {isMultiSelect && (
                    <span className="multi-badge">{selectedIndices.size}</span>
                )}
                <svg className="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </div>

            {!isCollapsed && (
                <div className="panel-content">
                    {/* Position */}
                    <div className="property-group">
                        <div className="property-label">Position</div>
                        <div className="property-row">
                            <div className="property-input">
                                <label>X</label>
                                <input type="number" value={properties.position[0].toFixed(3)} readOnly />
                            </div>
                            <div className="property-input">
                                <label>Y</label>
                                <input type="number" value={properties.position[1].toFixed(3)} readOnly />
                            </div>
                            <div className="property-input">
                                <label>Z</label>
                                <input type="number" value={properties.position[2].toFixed(3)} readOnly />
                            </div>
                        </div>
                    </div>

                    {/* Scale */}
                    <div className="property-group">
                        <div className="property-label">Scale</div>
                        <div className="property-row">
                            <div className="property-input">
                                <label>X</label>
                                <input type="number" value={properties.scale[0].toFixed(4)} readOnly />
                            </div>
                            <div className="property-input">
                                <label>Y</label>
                                <input type="number" value={properties.scale[1].toFixed(4)} readOnly />
                            </div>
                            <div className="property-input">
                                <label>Z</label>
                                <input type="number" value={properties.scale[2].toFixed(4)} readOnly />
                            </div>
                        </div>
                    </div>

                    {/* Color */}
                    <div className="property-group">
                        <div className="property-label">Color</div>
                        <div className="property-row color-row">
                            <div
                                className="color-preview"
                                style={{ backgroundColor: colorToHex(properties.color) }}
                            />
                            <input
                                type="text"
                                value={colorToHex(properties.color)}
                                readOnly
                                className="color-hex"
                            />
                        </div>
                    </div>

                    {/* Opacity */}
                    <div className="property-group">
                        <div className="property-label">Opacity</div>
                        <div className="property-row single">
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                                value={properties.opacity}
                                readOnly
                            />
                            <span className="property-value">{(properties.opacity * 100).toFixed(0)}%</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default PropertiesPanel;
