// Main 3D Viewport Component
// Renders the Gaussian splat scene with WebGPU

import { useRef, useEffect, useCallback, useState } from 'react';
import { SplatRenderer } from '../core/SplatRenderer';
import { OrbitCamera } from '../camera/OrbitCamera';
import { useAppStore } from '../store/appStore';
import { selectionManager } from '../tools/SelectionManager';
import { brushTool } from '../tools/BrushTool'; // Assuming exported instance
import { transformTool } from '../tools/TransformTool'; // Assuming exported instance
import { transformGizmo } from '../tools/TransformGizmo'; // Assuming exported instance
import { environmentMap } from '../lighting/EnvironmentMap';
import { lightingController } from '../lighting/LightingController';
import { contextMenuManager } from '../components/ContextMenu';
import './Viewport.css';

export function Viewport() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<SplatRenderer | null>(null);
    const cameraRef = useRef<OrbitCamera | null>(null);
    const animationFrameRef = useRef<number>(0);
    const isInteractingRef = useRef(false);

    const {
        gaussianData,
        currentTool,
        transformMode,
        selectionMode,
        showStats,
        showGrid
    } = useAppStore();

    const [fps, setFps] = useState(0);
    const [gaussianCount, setGaussianCount] = useState(0);
    const [webgpuError, setWebgpuError] = useState<string | null>(null);

    // Initialize renderer and camera
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const init = async () => {
            try {
                // Initialize renderer
                const renderer = new SplatRenderer();
                await renderer.initialize(canvas);
                rendererRef.current = renderer;

                // Initialize camera
                const camera = new OrbitCamera(canvas);
                camera.setDistance(5);
                cameraRef.current = camera;

                // Setup environment map
                if (renderer.device) {
                    environmentMap.setDevice(renderer.device);
                }

                // Initialize default environment (async)
                environmentMap.loadPreset('studio').catch(console.error);

                // Start render loop
                startRenderLoop();
            } catch (error) {
                console.error('Failed to initialize WebGPU:', error);
                setWebgpuError(error instanceof Error ? error.message : 'WebGPU initialization failed');
            }
        };

        init();

        return () => {
            cancelAnimationFrame(animationFrameRef.current);
            rendererRef.current?.destroy();
            cameraRef.current?.detach();
            environmentMap.clear();
        };
    }, []);

    // Handle window resize
    useEffect(() => {
        const handleResize = () => {
            const canvas = canvasRef.current;
            const container = containerRef.current;
            if (!canvas || !container) return;

            const { width, height } = container.getBoundingClientRect();
            const dpr = Math.min(window.devicePixelRatio, 2);
            canvas.width = width * dpr;
            canvas.height = height * dpr;
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
        };

        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Load Gaussian data when it changes
    useEffect(() => {
        if (gaussianData && rendererRef.current) {
            rendererRef.current.setGaussianData(gaussianData);
            setGaussianCount(gaussianData.count);

            // Focus camera on scene
            if (cameraRef.current) {
                // Calculate bounding box
                const positions = gaussianData.positions;
                let minX = Infinity, minY = Infinity, minZ = Infinity;
                let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

                for (let i = 0; i < gaussianData.count; i++) {
                    const x = positions[i * 3];
                    const y = positions[i * 3 + 1];
                    const z = positions[i * 3 + 2];
                    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
                    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
                    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
                }

                const centerX = (minX + maxX) / 2;
                const centerY = (minY + maxY) / 2;
                const centerZ = (minZ + maxZ) / 2;
                const size = Math.max(maxX - minX, maxY - minY, maxZ - minZ);

                cameraRef.current.setTarget(centerX, centerY, centerZ);
                cameraRef.current.setDistance(size * 2);
            }
        }
    }, [gaussianData]);

    const startRenderLoop = useCallback(() => {
        let lastTime = performance.now();
        let frameCount = 0;
        let fpsTime = 0;

        const render = (time: number) => {
            animationFrameRef.current = requestAnimationFrame(render);

            const deltaTime = time - lastTime;
            lastTime = time;

            // Update FPS counter
            frameCount++;
            fpsTime += deltaTime;
            if (fpsTime >= 1000) {
                setFps(Math.round(frameCount * 1000 / fpsTime));
                frameCount = 0;
                fpsTime = 0;
            }

            // Update camera
            cameraRef.current?.update(deltaTime / 1000);

            // Render
            const renderer = rendererRef.current;
            const camera = cameraRef.current;
            const canvas = canvasRef.current;

            if (renderer && camera && canvas && renderer.isReady()) {
                const fov = camera.getFov();
                const tanFovY = Math.tan(fov / 2);
                const tanFovX = tanFovY * camera.getAspect();
                const focalY = canvas.height / (2 * tanFovY);
                const focalX = canvas.width / (2 * tanFovX);

                renderer.render({
                    viewMatrix: camera.getViewMatrix(),
                    projMatrix: camera.getProjectionMatrix(),
                    viewportSize: [canvas.width, canvas.height],
                    focal: [focalX, focalY],
                    tanFov: [tanFovX, tanFovY],
                    near: camera.getNear(),
                    far: camera.getFar(),
                    time: time / 1000,
                    shDegree: 0,
                });
            }
        };

        animationFrameRef.current = requestAnimationFrame(render);
    }, []);

    if (webgpuError) {
        return (
            <div className="viewport-container viewport-error">
                <div className="error-content">
                    <svg className="error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="15" y1="9" x2="9" y2="15" />
                        <line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                    <h2>WebGPU Not Available</h2>
                    <p>{webgpuError}</p>
                    <p className="error-hint">
                        Please use a browser that supports WebGPU (Chrome 113+, Edge 113+)
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div ref={containerRef} className="viewport-container">
            <canvas ref={canvasRef} className="viewport-canvas" />

            {showStats && (
                <div className="viewport-stats">
                    <div className="stat">
                        <span className="stat-value">{fps}</span>
                        <span className="stat-label">FPS</span>
                    </div>
                    <div className="stat">
                        <span className="stat-value">{gaussianCount.toLocaleString()}</span>
                        <span className="stat-label">Gaussians</span>
                    </div>
                </div>
            )}

            {!gaussianData && (
                <div className="viewport-empty">
                    <div className="empty-content">
                        <svg className="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                            <line x1="12" y1="22.08" x2="12" y2="12" />
                        </svg>
                        <h2>GaussianShop</h2>
                        <p>Drop a .ply file or use File → Open to load a Gaussian Splat</p>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Viewport;
