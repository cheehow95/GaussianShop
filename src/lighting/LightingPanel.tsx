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

    useEffect(() => {
        const unsub1 = lightingController.subscribe(setState);
        const unsub2 = globalIllumination.subscribe(setGiSettings);
        const unsub3 = volumetricLighting.subscribe(setVolConfig);
        return () => { unsub1(); unsub2(); unsub3(); };
    }, []);

    const handleAmbientIntensityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        lightingController.setAmbientIntensity(parseFloat(e.target.value));
    };

    const handleEnvironmentRotationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        lightingController.setEnvironmentRotation(parseFloat(e.target.value));
    };

    const handleEnvironmentIntensityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        lightingController.setEnvironmentIntensity(parseFloat(e.target.value));
    };

    const handleExposureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        lightingController.setExposure(parseFloat(e.target.value));
    };

    const handleSunDirectionChange = (e: React.ChangeEvent<HTMLInputElement>, axis: number) => {
        const dir = [...state.sunDirection] as [number, number, number];
        dir[axis] = parseFloat(e.target.value);
        lightingController.setSunDirection(dir);
    };

    const handleSunIntensityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        lightingController.setSunIntensity(parseFloat(e.target.value));
    };

    const handleSunColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        // Hex to RGB
        const hex = e.target.value;
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        lightingController.setSunColor([r, g, b]);
    };

    // Helper to convert RGB to Hex for color input
    const getSunColorHex = () => {
        const r = Math.round(state.sunColor[0] * 255).toString(16).padStart(2, '0');
        const g = Math.round(state.sunColor[1] * 255).toString(16).padStart(2, '0');
        const b = Math.round(state.sunColor[2] * 255).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`;
    };

    const handlePresetClick = (preset: 'studio' | 'outdoor' | 'sunset' | 'night') => {
        lightingController.applyPreset(preset);
        environmentMap.loadPreset(preset);
    };

    const handleAddLight = () => {
        lightingController.addPointLight();
    };

    const handleRemoveLight = (id: string) => {
        lightingController.removePointLight(id);
    };

    const handleLightIntensityChange = (id: string, value: number) => {
        lightingController.updatePointLight(id, { intensity: value });
    };

    const handleLightVisibilityToggle = (id: string) => {
        const light = lightingController.getPointLight(id);
        if (light) {
            lightingController.updatePointLight(id, { visible: !light.visible });
        }
    };

    // GI handlers
    const handleGIQualityChange = (quality: GIQuality) => {
        globalIllumination.setQuality(quality);
    };

    const handleSSAOToggle = () => {
        globalIllumination.setSSAOEnabled(!giSettings.ssao.enabled);
    };

    const handleSSAORadiusChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        globalIllumination.setSSAORadius(parseFloat(e.target.value));
    };

    const handleSSAOIntensityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        globalIllumination.setSSAOIntensity(parseFloat(e.target.value));
    };

    const handleSSRToggle = () => {
        globalIllumination.setSSREnabled(!giSettings.ssr.enabled);
    };

    const handleVolumetricToggle = () => {
        volumetricLighting.setEnabled(!volConfig.enabled);
    };

    const handleVolumetricDensityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        volumetricLighting.setDensity(parseFloat(e.target.value));
    };

    const handleVolumetricScatteringChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        volumetricLighting.setScattering(parseFloat(e.target.value));
    };

    const handleVolumetricPreset = (presetName: string) => {
        volumetricLighting.applyPreset(presetName);
    };

    return (
        <div className={`lighting-panel ${isCollapsed ? 'collapsed' : ''}`}>
            <div className="panel-header" onClick={() => setIsCollapsed(!isCollapsed)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                <svg className="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </div>

            {!isCollapsed && (
                <div className="panel-content">
                    {/* Presets */}
                    <div className="panel-section">
                        <div className="section-label">Presets</div>
                        <div className="preset-buttons">
                            <button onClick={() => handlePresetClick('studio')}>Studio</button>
                            <button onClick={() => handlePresetClick('outdoor')}>Outdoor</button>
                            <button onClick={() => handlePresetClick('sunset')}>Sunset</button>
                            <button onClick={() => handlePresetClick('night')}>Night</button>
                        </div>
                    </div>

                    {/* Environment */}
                    <div className="panel-section">
                        <div className="section-label">Environment</div>
                        <div className="slider-row">
                            <label>Rotation</label>
                            <input
                                type="range"
                                min="0"
                                max="360"
                                step="1"
                                value={state.environmentRotation}
                                onChange={handleEnvironmentRotationChange}
                            />
                            <span className="slider-value">{state.environmentRotation.toFixed(0)}°</span>
                        </div>
                        <div className="slider-row">
                            <label>Intensity</label>
                            <input
                                type="range"
                                min="0"
                                max="3"
                                step="0.1"
                                value={state.environmentIntensity}
                                onChange={handleEnvironmentIntensityChange}
                            />
                            <span className="slider-value">{state.environmentIntensity.toFixed(1)}</span>
                        </div>
                    </div>

                    {/* Exposure */}
                    <div className="panel-section">
                        <div className="section-label">Exposure</div>
                        <div className="slider-row">
                            <label>Level</label>
                            <input
                                type="range"
                                min="0.1"
                                max="3"
                                step="0.1"
                                value={state.exposure}
                                onChange={handleExposureChange}
                            />
                            <span className="slider-value">{state.exposure.toFixed(1)}</span>
                        </div>
                    </div>

                    {/* Sun Light */}
                    <div className="panel-section">
                        <div className="section-label">Sun Light</div>
                        <div className="slider-row">
                            <label>Direction X</label>
                            <input type="range" min="-1" max="1" step="0.1" value={state.sunDirection[0]} onChange={(e) => handleSunDirectionChange(e, 0)} />
                        </div>
                        <div className="slider-row">
                            <label>Direction Y</label>
                            <input type="range" min="-1" max="1" step="0.1" value={state.sunDirection[1]} onChange={(e) => handleSunDirectionChange(e, 1)} />
                        </div>
                        <div className="slider-row">
                            <label>Direction Z</label>
                            <input type="range" min="-1" max="1" step="0.1" value={state.sunDirection[2]} onChange={(e) => handleSunDirectionChange(e, 2)} />
                        </div>
                        <div className="slider-row">
                            <label>Intensity</label>
                            <input type="range" min="0" max="5" step="0.1" value={state.sunIntensity} onChange={handleSunIntensityChange} />
                            <span className="slider-value">{state.sunIntensity.toFixed(1)}</span>
                        </div>
                        <div className="slider-row">
                            <label>Color</label>
                            <input type="color" value={getSunColorHex()} onChange={handleSunColorChange} />
                        </div>
                    </div>

                    {/* Global Illumination */}
                    <div className="panel-section gi-section">
                        <div className="section-header clickable" onClick={() => setGiExpanded(!giExpanded)}>
                            <div className="section-label">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 16, height: 16, marginRight: 6 }}>
                                    <circle cx="12" cy="12" r="10" opacity="0.3" />
                                    <circle cx="12" cy="12" r="6" opacity="0.5" />
                                    <circle cx="12" cy="12" r="2" />
                                </svg>
                                Global Illumination
                            </div>
                            <svg className={`chevron ${giExpanded ? 'expanded' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="6 9 12 15 18 9" />
                            </svg>
                        </div>

                        {giExpanded && (
                            <div className="gi-content">
                                {/* Quality Preset */}
                                <div className="slider-row">
                                    <label>Quality</label>
                                    <div className="quality-buttons">
                                        {(['low', 'medium', 'high', 'ultra'] as GIQuality[]).map(q => (
                                            <button
                                                key={q}
                                                className={giSettings.quality === q ? 'active' : ''}
                                                onClick={() => handleGIQualityChange(q)}
                                            >
                                                {q.charAt(0).toUpperCase() + q.slice(1)}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* SSAO */}
                                <div className="gi-subsection">
                                    <div className="toggle-row">
                                        <label>Ambient Occlusion (SSAO)</label>
                                        <button
                                            className={`toggle-button ${giSettings.ssao.enabled ? 'active' : ''}`}
                                            onClick={handleSSAOToggle}
                                        >
                                            {giSettings.ssao.enabled ? 'ON' : 'OFF'}
                                        </button>
                                    </div>
                                    {giSettings.ssao.enabled && (
                                        <>
                                            <div className="slider-row indent">
                                                <label>Radius</label>
                                                <input
                                                    type="range"
                                                    min="0.1"
                                                    max="2"
                                                    step="0.1"
                                                    value={giSettings.ssao.radius}
                                                    onChange={handleSSAORadiusChange}
                                                />
                                                <span className="slider-value">{giSettings.ssao.radius.toFixed(1)}</span>
                                            </div>
                                            <div className="slider-row indent">
                                                <label>Intensity</label>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="3"
                                                    step="0.1"
                                                    value={giSettings.ssao.intensity}
                                                    onChange={handleSSAOIntensityChange}
                                                />
                                                <span className="slider-value">{giSettings.ssao.intensity.toFixed(1)}</span>
                                            </div>
                                        </>
                                    )}
                                </div>

                                {/* SSR */}
                                <div className="gi-subsection">
                                    <div className="toggle-row">
                                        <label>Screen-Space Reflections</label>
                                        <button
                                            className={`toggle-button ${giSettings.ssr.enabled ? 'active' : ''}`}
                                            onClick={handleSSRToggle}
                                        >
                                            {giSettings.ssr.enabled ? 'ON' : 'OFF'}
                                        </button>
                                    </div>
                                </div>

                                {/* Volumetric */}
                                <div className="gi-subsection">
                                    <div className="toggle-row">
                                        <label>Volumetric Lighting</label>
                                        <button
                                            className={`toggle-button ${volConfig.enabled ? 'active' : ''}`}
                                            onClick={handleVolumetricToggle}
                                        >
                                            {volConfig.enabled ? 'ON' : 'OFF'}
                                        </button>
                                    </div>
                                    {volConfig.enabled && (
                                        <>
                                            <div className="slider-row indent">
                                                <label>Density</label>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="0.2"
                                                    step="0.005"
                                                    value={volConfig.density}
                                                    onChange={handleVolumetricDensityChange}
                                                />
                                                <span className="slider-value">{volConfig.density.toFixed(3)}</span>
                                            </div>
                                            <div className="slider-row indent">
                                                <label>Scattering</label>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="2"
                                                    step="0.1"
                                                    value={volConfig.scattering}
                                                    onChange={handleVolumetricScatteringChange}
                                                />
                                                <span className="slider-value">{volConfig.scattering.toFixed(1)}</span>
                                            </div>
                                            <div className="volumetric-presets">
                                                {VOLUMETRIC_PRESETS.slice(1, 5).map(preset => (
                                                    <button
                                                        key={preset.name}
                                                        onClick={() => handleVolumetricPreset(preset.name)}
                                                        title={preset.name}
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

                    {/* Point Lights */}
                    <div className="panel-section">
                        <div className="section-header">
                            <div className="section-label">Point Lights</div>
                            <button className="add-button" onClick={handleAddLight}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <line x1="12" y1="5" x2="12" y2="19" />
                                    <line x1="5" y1="12" x2="19" y2="12" />
                                </svg>
                            </button>
                        </div>
                        <div className="lights-list">
                            {state.pointLights.map((light, index) => (
                                <div key={light.id} className="light-item">
                                    <button
                                        className={`visibility-toggle ${light.visible ? 'visible' : ''}`}
                                        onClick={() => handleLightVisibilityToggle(light.id)}
                                    >
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            {light.visible ? (
                                                <>
                                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                                    <circle cx="12" cy="12" r="3" />
                                                </>
                                            ) : (
                                                <>
                                                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                                    <line x1="1" y1="1" x2="23" y2="23" />
                                                </>
                                            )}
                                        </svg>
                                    </button>
                                    <span className="light-name">Light {index + 1}</span>
                                    <input
                                        type="range"
                                        min="0"
                                        max="5"
                                        step="0.1"
                                        value={light.intensity}
                                        onChange={(e) => handleLightIntensityChange(light.id, parseFloat(e.target.value))}
                                    />
                                    <button className="remove-button" onClick={() => handleRemoveLight(light.id)}>
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <line x1="18" y1="6" x2="6" y2="18" />
                                            <line x1="6" y1="6" x2="18" y2="18" />
                                        </svg>
                                    </button>
                                </div>
                            ))}
                            {state.pointLights.length === 0 && (
                                <div className="no-lights">No point lights</div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default LightingPanel;

