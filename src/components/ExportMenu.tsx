// Export Menu Component
// Dropdown menu for all export options

import { useState, useRef, useEffect } from 'react';
import PLYExporter from '../export/PLYExporter';
import SplatExporter from '../export/SplatExporter';
import MeshExtractor from '../export/MeshExtractor';
import { imageExporter } from '../export/ImageExporter';
import type { GaussianData } from '../core/SplatRenderer';
import './ExportMenu.css';

interface ExportMenuProps {
    gaussianData: GaussianData | null;
    fileName: string | null;
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

export function ExportMenu({ gaussianData, fileName, canvasRef }: ExportMenuProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const baseName = fileName?.replace(/\.(ply|splat|gsp)$/i, '') || 'gaussian';

    const handleExportPLY = () => {
        if (!gaussianData) return;
        setIsExporting(true);
        try {
            const buffer = PLYExporter.export(gaussianData, { format: 'binary' });
            PLYExporter.saveToFile(buffer, `${baseName}.ply`);
        } finally {
            setIsExporting(false);
            setIsOpen(false);
        }
    };

    const handleExportPLYAscii = () => {
        if (!gaussianData) return;
        setIsExporting(true);
        try {
            const buffer = PLYExporter.export(gaussianData, { format: 'ascii' });
            PLYExporter.saveToFile(buffer, `${baseName}_ascii.ply`);
        } finally {
            setIsExporting(false);
            setIsOpen(false);
        }
    };

    const handleExportSplat = () => {
        if (!gaussianData) return;
        setIsExporting(true);
        try {
            const buffer = SplatExporter.export(gaussianData);
            SplatExporter.saveToFile(buffer, `${baseName}.splat`);
        } finally {
            setIsExporting(false);
            setIsOpen(false);
        }
    };

    const handleExportMesh = () => {
        if (!gaussianData) return;
        setIsExporting(true);
        try {
            console.log('Extracting mesh (this may take a moment)...');
            const mesh = MeshExtractor.extract(gaussianData, { resolution: 64 });
            MeshExtractor.exportToOBJ(mesh, `${baseName}.obj`);
            console.log('Mesh exported with', mesh.vertices.length / 3, 'vertices');
        } finally {
            setIsExporting(false);
            setIsOpen(false);
        }
    };

    const handleScreenshotPNG = async () => {
        const canvas = canvasRef.current || document.querySelector('canvas');
        if (!canvas) return;
        setIsExporting(true);
        try {
            await imageExporter.screenshot(canvas, `${baseName}_screenshot`, { format: 'png' });
        } finally {
            setIsExporting(false);
            setIsOpen(false);
        }
    };

    const handleScreenshotJPEG = async () => {
        const canvas = canvasRef.current || document.querySelector('canvas');
        if (!canvas) return;
        setIsExporting(true);
        try {
            await imageExporter.screenshot(canvas, `${baseName}_screenshot`, { format: 'jpeg', quality: 0.95 });
        } finally {
            setIsExporting(false);
            setIsOpen(false);
        }
    };

    const handleCopyToClipboard = async () => {
        const canvas = canvasRef.current || document.querySelector('canvas');
        if (!canvas) return;
        setIsExporting(true);
        try {
            const success = await imageExporter.copyToClipboard(canvas);
            if (success) {
                console.log('Screenshot copied to clipboard');
            }
        } finally {
            setIsExporting(false);
            setIsOpen(false);
        }
    };

    return (
        <div className="export-menu" ref={menuRef}>
            <button
                className="nav-button"
                disabled={!gaussianData || isExporting}
                onClick={() => setIsOpen(!isOpen)}
            >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Export
                <svg className="dropdown-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </button>

            {isOpen && gaussianData && (
                <div className="export-dropdown">
                    <div className="export-section">
                        <div className="export-section-title">Image</div>
                        <button onClick={handleScreenshotPNG}>
                            <span className="export-icon">📷</span>
                            Screenshot (PNG)
                            <span className="export-hint">Lossless</span>
                        </button>
                        <button onClick={handleScreenshotJPEG}>
                            <span className="export-icon">🖼️</span>
                            Screenshot (JPEG)
                            <span className="export-hint">Smaller</span>
                        </button>
                        <button onClick={handleCopyToClipboard}>
                            <span className="export-icon">📋</span>
                            Copy to Clipboard
                            <span className="export-hint">Ctrl+C</span>
                        </button>
                    </div>

                    <div className="export-section">
                        <div className="export-section-title">Gaussian Formats</div>
                        <button onClick={handleExportPLY}>
                            <span className="export-icon">📄</span>
                            PLY (Binary)
                            <span className="export-hint">Compact</span>
                        </button>
                        <button onClick={handleExportPLYAscii}>
                            <span className="export-icon">📝</span>
                            PLY (ASCII)
                            <span className="export-hint">Readable</span>
                        </button>
                        <button onClick={handleExportSplat}>
                            <span className="export-icon">⚡</span>
                            SPLAT
                            <span className="export-hint">Web-optimized</span>
                        </button>
                    </div>

                    <div className="export-section">
                        <div className="export-section-title">3D Formats</div>
                        <button onClick={handleExportMesh}>
                            <span className="export-icon">🔷</span>
                            OBJ Mesh
                            <span className="export-hint">Marching cubes</span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default ExportMenu;

