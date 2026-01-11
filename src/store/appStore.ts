// Global State Store using Zustand
// Manages application state across components

import { create } from 'zustand';
import type { GaussianData } from '../core/SplatRenderer';

export type Tool = 'select' | 'translate' | 'rotate' | 'scale' | 'brush' | 'eraser';
export type ViewMode = 'splat' | 'points' | 'wireframe';

interface AppState {
    // Scene data
    gaussianData: GaussianData | null;
    fileName: string | null;
    isLoading: boolean;
    loadProgress: number;
    error: string | null;

    // Selection
    selectedIndices: Set<number>;
    selectionMode: 'add' | 'subtract' | 'replace';

    // Tools
    currentTool: Tool;
    viewMode: ViewMode;
    transformMode: 'local' | 'world';

    // Camera
    cameraDistance: number;
    cameraFov: number;

    // Lighting
    environmentMapUrl: string | null;
    lightIntensity: number;
    ambientIntensity: number;

    // UI
    showGrid: boolean;
    showStats: boolean;
    sidebarOpen: boolean;
    propertiesPanelOpen: boolean;

    // Actions
    setGaussianData: (data: GaussianData | null, fileName?: string) => void;
    setLoading: (loading: boolean, progress?: number) => void;
    setError: (error: string | null) => void;

    setSelectedIndices: (indices: Set<number>) => void;
    addToSelection: (indices: number[]) => void;
    removeFromSelection: (indices: number[]) => void;
    clearSelection: () => void;

    setCurrentTool: (tool: Tool) => void;
    setViewMode: (mode: ViewMode) => void;

    setCameraDistance: (distance: number) => void;
    setCameraFov: (fov: number) => void;

    setEnvironmentMap: (url: string | null) => void;
    setLightIntensity: (intensity: number) => void;
    setAmbientIntensity: (intensity: number) => void;

    toggleGrid: () => void;
    toggleStats: () => void;
    toggleSidebar: () => void;
    togglePropertiesPanel: () => void;
}

export const useAppStore = create<AppState>((set) => ({
    // Initial state
    gaussianData: null,
    fileName: null,
    isLoading: false,
    loadProgress: 0,
    error: null,

    selectedIndices: new Set(),
    selectionMode: 'replace',

    currentTool: 'select',
    viewMode: 'splat',
    transformMode: 'local',

    cameraDistance: 5,
    cameraFov: 45,

    environmentMapUrl: null,
    lightIntensity: 1.0,
    ambientIntensity: 0.3,

    showGrid: true,
    showStats: true,
    sidebarOpen: true,
    propertiesPanelOpen: true,

    // Actions
    setGaussianData: (data, fileName) => set({
        gaussianData: data,
        fileName: fileName ?? null,
        isLoading: false,
        loadProgress: 100,
        error: null,
        selectedIndices: new Set(),
    }),

    setLoading: (loading, progress = 0) => set({
        isLoading: loading,
        loadProgress: progress,
        error: null,
    }),

    setError: (error) => set({
        error,
        isLoading: false,
    }),

    setSelectedIndices: (indices) => set({ selectedIndices: indices }),

    addToSelection: (indices) => set((state) => {
        const newSet = new Set(state.selectedIndices);
        indices.forEach(i => newSet.add(i));
        return { selectedIndices: newSet };
    }),

    removeFromSelection: (indices) => set((state) => {
        const newSet = new Set(state.selectedIndices);
        indices.forEach(i => newSet.delete(i));
        return { selectedIndices: newSet };
    }),

    clearSelection: () => set({ selectedIndices: new Set() }),

    setCurrentTool: (tool) => set({ currentTool: tool }),
    setViewMode: (mode) => set({ viewMode: mode }),

    setCameraDistance: (distance) => set({ cameraDistance: distance }),
    setCameraFov: (fov) => set({ cameraFov: fov }),

    setEnvironmentMap: (url) => set({ environmentMapUrl: url }),
    setLightIntensity: (intensity) => set({ lightIntensity: intensity }),
    setAmbientIntensity: (intensity) => set({ ambientIntensity: intensity }),

    toggleGrid: () => set((state) => ({ showGrid: !state.showGrid })),
    toggleStats: () => set((state) => ({ showStats: !state.showStats })),
    toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
    togglePropertiesPanel: () => set((state) => ({ propertiesPanelOpen: !state.propertiesPanelOpen })),
}));

export default useAppStore;
