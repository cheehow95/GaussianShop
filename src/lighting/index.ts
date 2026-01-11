// Lighting Module Index
// Exports all lighting components

export { EnvironmentMap, environmentMap, ENVIRONMENT_PRESETS, type EnvironmentMapData, type EnvironmentPreset } from './EnvironmentMap';
export { LightingController, lightingController, type PointLight, type LightingState } from './LightingController';
export { LightingPanel } from './LightingPanel';

// Global Illumination
export { GlobalIllumination, globalIllumination, type GISettings, type SSAOSettings, type SSRSettings, type VolumetricSettings, type GIQuality } from './GlobalIllumination';
export { VolumetricLighting, volumetricLighting, VOLUMETRIC_PRESETS, type VolumetricConfig, type VolumetricPreset } from './VolumetricLighting';
export { LightProbeSystem, lightProbeSystem, type LightProbe, type SHCoefficients, type ProbeGridConfig } from './LightProbeSystem';
