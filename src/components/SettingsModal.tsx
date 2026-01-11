// Settings Modal Component
// Application settings and preferences

import { useState } from 'react';
import './SettingsModal.css';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface Settings {
    performance: {
        maxGaussians: number;
        sortingEnabled: boolean;
        antialiasing: boolean;
    };
    appearance: {
        theme: 'dark' | 'light';
        gridColor: string;
        backgroundColor: string;
        accentColor: string;
    };
    controls: {
        panSpeed: number;
        rotateSpeed: number;
        zoomSpeed: number;
        invertY: boolean;
    };
}

const DEFAULT_SETTINGS: Settings = {
    performance: {
        maxGaussians: 5000000,
        sortingEnabled: true,
        antialiasing: true,
    },
    appearance: {
        theme: 'dark',
        gridColor: '#333333',
        backgroundColor: '#0a0a14',
        accentColor: '#3b82f6',
    },
    controls: {
        panSpeed: 1,
        rotateSpeed: 1,
        zoomSpeed: 1,
        invertY: false,
    },
};

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
    const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
    const [activeTab, setActiveTab] = useState<'performance' | 'appearance' | 'controls'>('performance');

    if (!isOpen) return null;

    const handleReset = () => {
        setSettings(DEFAULT_SETTINGS);
    };

    const handleSave = () => {
        // Save to localStorage
        localStorage.setItem('gaussianshop_settings', JSON.stringify(settings));
        onClose();
    };

    return (
        <div className="settings-modal-overlay" onClick={onClose}>
            <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Settings</h2>
                    <button className="close-button" onClick={onClose}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                <div className="modal-content">
                    <div className="settings-tabs">
                        <button
                            className={activeTab === 'performance' ? 'active' : ''}
                            onClick={() => setActiveTab('performance')}
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                            </svg>
                            Performance
                        </button>
                        <button
                            className={activeTab === 'appearance' ? 'active' : ''}
                            onClick={() => setActiveTab('appearance')}
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="5" />
                                <line x1="12" y1="1" x2="12" y2="3" />
                                <line x1="12" y1="21" x2="12" y2="23" />
                                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                                <line x1="1" y1="12" x2="3" y2="12" />
                                <line x1="21" y1="12" x2="23" y2="12" />
                            </svg>
                            Appearance
                        </button>
                        <button
                            className={activeTab === 'controls' ? 'active' : ''}
                            onClick={() => setActiveTab('controls')}
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" />
                                <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
                            </svg>
                            Controls
                        </button>
                    </div>

                    <div className="settings-panel">
                        {activeTab === 'performance' && (
                            <div className="settings-section">
                                <div className="setting-row">
                                    <label>Max Gaussians</label>
                                    <select
                                        value={settings.performance.maxGaussians}
                                        onChange={(e) => setSettings({
                                            ...settings,
                                            performance: {
                                                ...settings.performance,
                                                maxGaussians: parseInt(e.target.value),
                                            },
                                        })}
                                    >
                                        <option value={1000000}>1 Million</option>
                                        <option value={2000000}>2 Million</option>
                                        <option value={5000000}>5 Million</option>
                                        <option value={10000000}>10 Million</option>
                                    </select>
                                </div>
                                <div className="setting-row">
                                    <label>GPU Sorting</label>
                                    <input
                                        type="checkbox"
                                        checked={settings.performance.sortingEnabled}
                                        onChange={(e) => setSettings({
                                            ...settings,
                                            performance: {
                                                ...settings.performance,
                                                sortingEnabled: e.target.checked,
                                            },
                                        })}
                                    />
                                </div>
                                <div className="setting-row">
                                    <label>Antialiasing</label>
                                    <input
                                        type="checkbox"
                                        checked={settings.performance.antialiasing}
                                        onChange={(e) => setSettings({
                                            ...settings,
                                            performance: {
                                                ...settings.performance,
                                                antialiasing: e.target.checked,
                                            },
                                        })}
                                    />
                                </div>
                            </div>
                        )}

                        {activeTab === 'appearance' && (
                            <div className="settings-section">
                                <div className="setting-row">
                                    <label>Theme</label>
                                    <select
                                        value={settings.appearance.theme}
                                        onChange={(e) => setSettings({
                                            ...settings,
                                            appearance: {
                                                ...settings.appearance,
                                                theme: e.target.value as 'dark' | 'light',
                                            },
                                        })}
                                    >
                                        <option value="dark">Dark</option>
                                        <option value="light">Light</option>
                                    </select>
                                </div>
                                <div className="setting-row">
                                    <label>Accent Color</label>
                                    <input
                                        type="color"
                                        value={settings.appearance.accentColor}
                                        onChange={(e) => setSettings({
                                            ...settings,
                                            appearance: {
                                                ...settings.appearance,
                                                accentColor: e.target.value,
                                            },
                                        })}
                                    />
                                </div>
                                <div className="setting-row">
                                    <label>Background Color</label>
                                    <input
                                        type="color"
                                        value={settings.appearance.backgroundColor}
                                        onChange={(e) => setSettings({
                                            ...settings,
                                            appearance: {
                                                ...settings.appearance,
                                                backgroundColor: e.target.value,
                                            },
                                        })}
                                    />
                                </div>
                            </div>
                        )}

                        {activeTab === 'controls' && (
                            <div className="settings-section">
                                <div className="setting-row">
                                    <label>Pan Speed</label>
                                    <input
                                        type="range"
                                        min="0.1"
                                        max="3"
                                        step="0.1"
                                        value={settings.controls.panSpeed}
                                        onChange={(e) => setSettings({
                                            ...settings,
                                            controls: {
                                                ...settings.controls,
                                                panSpeed: parseFloat(e.target.value),
                                            },
                                        })}
                                    />
                                    <span>{settings.controls.panSpeed.toFixed(1)}x</span>
                                </div>
                                <div className="setting-row">
                                    <label>Rotate Speed</label>
                                    <input
                                        type="range"
                                        min="0.1"
                                        max="3"
                                        step="0.1"
                                        value={settings.controls.rotateSpeed}
                                        onChange={(e) => setSettings({
                                            ...settings,
                                            controls: {
                                                ...settings.controls,
                                                rotateSpeed: parseFloat(e.target.value),
                                            },
                                        })}
                                    />
                                    <span>{settings.controls.rotateSpeed.toFixed(1)}x</span>
                                </div>
                                <div className="setting-row">
                                    <label>Zoom Speed</label>
                                    <input
                                        type="range"
                                        min="0.1"
                                        max="3"
                                        step="0.1"
                                        value={settings.controls.zoomSpeed}
                                        onChange={(e) => setSettings({
                                            ...settings,
                                            controls: {
                                                ...settings.controls,
                                                zoomSpeed: parseFloat(e.target.value),
                                            },
                                        })}
                                    />
                                    <span>{settings.controls.zoomSpeed.toFixed(1)}x</span>
                                </div>
                                <div className="setting-row">
                                    <label>Invert Y Axis</label>
                                    <input
                                        type="checkbox"
                                        checked={settings.controls.invertY}
                                        onChange={(e) => setSettings({
                                            ...settings,
                                            controls: {
                                                ...settings.controls,
                                                invertY: e.target.checked,
                                            },
                                        })}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="modal-footer">
                    <button className="reset-button" onClick={handleReset}>
                        Reset to Defaults
                    </button>
                    <div className="button-group">
                        <button className="cancel-button" onClick={onClose}>
                            Cancel
                        </button>
                        <button className="save-button" onClick={handleSave}>
                            Save Changes
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default SettingsModal;
