
// Lighting Panel Component
// UI for controlling lighting settings and global illumination

import { useState, useEffect } from 'react';
import { lightingController, type LightingState } from './LightingController';
import { environmentMap } from './EnvironmentMap';
import { globalIllumination, type GISettings, type GIQuality } from './GlobalIllumination';
import { volumetricLighting, VOLUMETRIC_PRESETS, type VolumetricConfig } from './VolumetricLighting';
import './LightingPanel.css';

export function LightingPanel() {
    const [state, setState] = useState<LightingState>(lightingController.getState());
    const [giSettings, setGiSettings] = useState<GISettings>(globalIllumination.getSettings());
    const [volConfig, setVolConfig] = useState<VolumetricConfig>(volumetricLighting.getConfig());
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [giExpanded, setGiExpanded] = useState(true);

    // Track which subsections are expanded
    const [expandedSections, setExpandedSections] = useState({
        gi: true,
        lights: true
    });

    useEffect(() => {
        const unsub1 = lightingController.subscribe(setState);
        const unsub2 = globalIllumination.subscribe(setGiSettings);
        const unsub3 = volumetricLighting.subscribe(setVolConfig);
        return () => { unsub1(); unsub2(); unsub3(); };
    }, []);

    const handleEnvironmentRotationChange = (rotation: number) => {
        lightingController.setEnvironmentRotation(rotation);
    };

    const handleEnvironmentIntensityChange = (intensity: number) => {
        lightingController.setEnvironmentIntensity(intensity);
    };

    const handleExposureChange = (exposure: number) => {
        lightingController.setExposure(exposure);
    };

    const updateSunDirection = (dir: [number, number, number]) => {
        lightingController.setSunDirection(dir);
    };

    const updateSunIntensity = (intensity: number) => {
        lightingController.setSunIntensity(intensity);
    };

    const updateSunColor = (color: [number, number, number]) => {
        lightingController.setSunColor(color);
    };

    const applyPreset = (preset: 'studio' | 'outdoor' | 'sunset' | 'night') => {
        lightingController.applyPreset(preset);
        environmentMap.loadPreset(preset);
    };

    // GI handlers
    const updateGIQuality = (quality: GIQuality) => {
        globalIllumination.setQuality(quality);
    };

    const updateSSAOEnabled = (enabled: boolean) => {
        globalIllumination.setSSAOEnabled(enabled);
    };

    const updateSSAORadius = (radius: number) => {
        globalIllumination.setSSAORadius(radius);
    };

    const updateSSAOIntensity = (intensity: number) => {
        globalIllumination.setSSAOIntensity(intensity);
    };

    const updateSSREnabled = (enabled: boolean) => {
        globalIllumination.setSSREnabled(enabled);
    };

    const updateVolumetricEnabled = (enabled: boolean) => {
        volumetricLighting.setEnabled(enabled);
    };

    const updateVolumetricDensity = (density: number) => {
        volumetricLighting.setDensity(density);
    };

    const updateVolumetricScattering = (scattering: number) => {
        volumetricLighting.setScattering(scattering);
    };

    const applyVolumetricPreset = (presetName: string) => {
        volumetricLighting.applyPreset(presetName);
    };

    // Helpers
    const rgbToHex = (rgb: [number, number, number]) => {
        const r = Math.round(rgb[0] * 255).toString(16).padStart(2, '0');
        const g = Math.round(rgb[1] * 255).toString(16).padStart(2, '0');
        const b = Math.round(rgb[2] * 255).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`;
    };

    const hexToRgb = (hex: string): [number, number, number] => {
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        return [r, g, b];
    };

    const PRESETS = [
        { id: 'studio', label: 'Studio' },
        { id: 'outdoor', label: 'Outdoor' },
        { id: 'sunset', label: 'Sunset' },
        { id: 'night', label: 'Night' }
    ] as const;

    const activePreset = 'studio'; // Placeholder, add logic to track active preset if needed

    const { environmentRotation, environmentIntensity, exposure, sunDirection, sunIntensity, sunColor } = state;

    return (
        <div className={`lighting-panel ${isCollapsed ? 'collapsed' : ''}`}>

            <div className="panel-header" onClick={() => setIsCollapsed(!isCollapsed)} style={{ cursor: 'pointer' }}>
                <div className="panel-title">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 18, height: 18 }}>
                        <circle cx="12" cy="12" r="5" />
                        <line x1="12" y1="1" x2="12" y2="3" />
                        <line x1="12" y1="21" x2="12" y2="23" />
                        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                        <line x1="1" y1="12" x2="3" y2="12" />
                        <line x1="21" y1="12" x2="23" y2="12" />
                        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                    </svg>
                    <span>Lighting</span>
                </div>
                <div style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.3s' }}>▼</div>
            </div>

            {!isCollapsed && (
                <div className="panel-content">
                    {/* Presets */}
                    <div className="control-group">
                        <div className="control-group-title">Presets</div>
                        <div className="presets-container">
                            {PRESETS.map(preset => (
                                <button
                                    key={preset.id}
                                    className={`preset-btn`}
                                    onClick={() => applyPreset(preset.id)}
                                >
                                    {preset.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Environment */}
                    <div className="control-group">
                        <div className="control-group-title">Environment</div>

                        <div className="slider-container">
                            <span className="slider-label">Rotation</span>
                            <input
                                type="range"
                                min="0"
                                max="360"
                                value={environmentRotation}
                                onChange={(e) => handleEnvironmentRotationChange(parseFloat(e.target.value))}
                            />
                            <span className="value-display">{Math.round(environmentRotation)}°</span>
                        </div>

                        <div className="slider-container">
                            <span className="slider-label">Intensity</span>
                            <input
                                type="range"
                                min="0"
                                max="5"
                                step="0.1"
                                value={environmentIntensity}
                                onChange={(e) => handleEnvironmentIntensityChange(parseFloat(e.target.value))}
                            />
                            <span className="value-display">{environmentIntensity.toFixed(1)}</span>
                        </div>
                    </div>

                    {/* Exposure */}
                    <div className="control-group">
                        <div className="control-group-title">Exposure</div>
                        <div className="slider-container">
                            <span className="slider-label">Level</span>
                            <input
                                type="range"
                                min="0"
                                max="5"
                                step="0.1"
                                value={exposure}
                                onChange={(e) => handleExposureChange(parseFloat(e.target.value))}
                            />
                            <span className="value-display">{exposure.toFixed(1)}</span>
                        </div>
                    </div>

                    {/* Sun Light */}
                    <div className="control-group">
                        <div className="control-group-title">Sun Light</div>

                        {['X', 'Y', 'Z'].map((axis, i) => (
                            <div className="slider-container" key={axis}>
                                <span className="slider-label">Dir {axis}</span>
                                <input
                                    type="range"
                                    min="-1"
                                    max="1"
                                    step="0.01"
                                    value={sunDirection[i]}
                                    onChange={(e) => {
                                        const newDir = [...sunDirection] as [number, number, number];
                                        newDir[i] = parseFloat(e.target.value);
                                        updateSunDirection(newDir);
                                    }}
                                />
                            </div>
                        ))}

                        <div className="slider-container">
                            <span className="slider-label">Intensity</span>
                            <input
                                type="range"
                                min="0"
                                max="10"
                                step="0.1"
                                value={sunIntensity}
                                onChange={(e) => updateSunIntensity(parseFloat(e.target.value))}
                            />
                            <span className="value-display">{sunIntensity.toFixed(1)}</span>
                        </div>

                        <div className="slider-container">
                            <span className="slider-label">Color</span>
                            <input
                                type="color"
                                value={rgbToHex(sunColor)}
                                onChange={(e) => updateSunColor(hexToRgb(e.target.value))}
                            />
                        </div>
                    </div>

                    {/* Global Illumination Section */}
                    <div className="nested-section">
                        <div
                            className="nested-header"
                            onClick={() => setGiExpanded(!giExpanded)}
                        >
                            <div className="control-group-title" style={{ marginBottom: 0 }}>Global Illumination</div>
                            <span className={`arrow-icon ${giExpanded ? 'open' : ''}`}>▼</span>
                        </div>

                        {giExpanded && (
                            <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div className="control-group">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <span className="slider-label">Quality</span>
                                        <div style={{ display: 'flex', gap: '4px' }}>
                                            {(['low', 'medium', 'high', 'ultra'] as GIQuality[]).map(q => (
                                                <button
                                                    key={q}
                                                    style={{
                                                        padding: '4px 8px',
                                                        fontSize: '0.7rem',
                                                        background: giSettings.quality === q ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)',
                                                        color: giSettings.quality === q ? 'white' : 'var(--text-secondary)',
                                                        border: giSettings.quality === q ? 'none' : '1px solid rgba(255,255,255,0.1)'
                                                    }}
                                                    onClick={() => updateGIQuality(q)}
                                                >
                                                    {q.charAt(0).toUpperCase() + q.slice(1)}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* SSAO */}
                                <div className="control-group">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span className="slider-label">Ambient Occlusion</span>
                                        <label className="toggle-switch">
                                            <input
                                                type="checkbox"
                                                checked={giSettings.ssao.enabled}
                                                onChange={(e) => updateSSAOEnabled(e.target.checked)}
                                            />
                                            <span className="slider-round"></span>
                                        </label>
                                    </div>

                                    {giSettings.ssao.enabled && (
                                        <>
                                            <div className="slider-container">
                                                <span className="slider-label" style={{ fontSize: '0.8em', marginLeft: '8px' }}>Radius</span>
                                                <input
                                                    type="range"
                                                    min="0.1"
                                                    max="2.0"
                                                    step="0.1"
                                                    value={giSettings.ssao.radius}
                                                    onChange={(e) => updateSSAORadius(parseFloat(e.target.value))}
                                                />
                                                <span className="value-display">{giSettings.ssao.radius.toFixed(1)}</span>
                                            </div>
                                            <div className="slider-container">
                                                <span className="slider-label" style={{ fontSize: '0.8em', marginLeft: '8px' }}>Intensity</span>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="3.0"
                                                    step="0.1"
                                                    value={giSettings.ssao.intensity}
                                                    onChange={(e) => updateSSAOIntensity(parseFloat(e.target.value))}
                                                />
                                                <span className="value-display">{giSettings.ssao.intensity.toFixed(1)}</span>
                                            </div>
                                        </>
                                    )}
                                </div>

                                {/* SSR */}
                                <div className="control-group">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span className="slider-label">Screen Reflections</span>
                                        <label className="toggle-switch">
                                            <input
                                                type="checkbox"
                                                checked={giSettings.ssr.enabled}
                                                onChange={(e) => updateSSREnabled(e.target.checked)}
                                            />
                                            <span className="slider-round"></span>
                                        </label>
                                    </div>
                                </div>

                                {/* Volumetric */}
                                <div className="control-group">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span className="slider-label">Volumetric Fog</span>
                                        <label className="toggle-switch">
                                            <input
                                                type="checkbox"
                                                checked={volConfig.enabled}
                                                onChange={(e) => updateVolumetricEnabled(e.target.checked)}
                                            />
                                            <span className="slider-round"></span>
                                        </label>
                                    </div>

                                    {volConfig.enabled && (
                                        <>
                                            <div className="slider-container">
                                                <span className="slider-label" style={{ fontSize: '0.8em', marginLeft: '8px' }}>Density</span>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="0.1"
                                                    step="0.001"
                                                    value={volConfig.density}
                                                    onChange={(e) => updateVolumetricDensity(parseFloat(e.target.value))}
                                                />
                                                <span className="value-display">{volConfig.density.toFixed(3)}</span>
                                            </div>
                                            <div className="slider-container">
                                                <span className="slider-label" style={{ fontSize: '0.8em', marginLeft: '8px' }}>Scattering</span>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="2.0"
                                                    step="0.1"
                                                    value={volConfig.scattering}
                                                    onChange={(e) => updateVolumetricScattering(parseFloat(e.target.value))}
                                                />
                                                <span className="value-display">{volConfig.scattering.toFixed(1)}</span>
                                            </div>
                                            <div className="presets-container" style={{ marginTop: '8px' }}>
                                                {VOLUMETRIC_PRESETS.map(preset => (
                                                    <button
                                                        key={preset.name}
                                                        className="preset-btn"
                                                        style={{ fontSize: '0.7rem', padding: '4px' }}
                                                        onClick={() => applyVolumetricPreset(preset.name)}
                                                    >
                                                        {preset.name}
                                                    </button>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default LightingPanel;
