// Welcome Screen Component
// Attractive landing page when no file is loaded

import { useState, useCallback, type DragEvent } from 'react';
import './WelcomeScreen.css';

interface WelcomeScreenProps {
    onOpenFile: () => void;
    onFileLoad?: (file: File) => void;
}

export function WelcomeScreen({ onOpenFile, onFileLoad }: WelcomeScreenProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [dragError, setDragError] = useState<string | null>(null);

    const validateFile = (file: File): boolean => {
        const validExtensions = ['.ply', '.splat', '.gsp'];
        const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
        return validExtensions.includes(ext);
    };

    const handleDragOver = useCallback((e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (e.dataTransfer.types.includes('Files')) {
            setIsDragging(true);
            setDragError(null);
        }
    }, []);

    const handleDragLeave = useCallback((e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        setDragError(null);
    }, []);

    const handleDrop = useCallback((e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        const files = Array.from(e.dataTransfer.files);
        const validFile = files.find(f => validateFile(f));

        if (validFile && onFileLoad) {
            onFileLoad(validFile);
        } else if (files.length > 0) {
            setDragError('Please drop a .ply, .splat, or .gsp file');
            setTimeout(() => setDragError(null), 3000);
        }
    }, [onFileLoad]);

    return (
        <div
            className={`welcome-screen ${isDragging ? 'dragging' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            <div className="welcome-content">
                <div className="welcome-logo">
                    <svg viewBox="0 0 80 80" fill="none" className="welcome-icon">
                        <defs>
                            <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#818cf8" />
                                <stop offset="100%" stopColor="#6366f1" />
                            </linearGradient>
                        </defs>
                        <rect x="10" y="10" width="60" height="60" rx="12" fill="url(#logoGradient)" opacity="0.2" />
                        <rect x="18" y="18" width="44" height="44" rx="8" fill="url(#logoGradient)" opacity="0.4" />
                        <rect x="26" y="26" width="28" height="28" rx="6" fill="url(#logoGradient)" />
                        <circle cx="40" cy="40" r="8" fill="white" opacity="0.9" />
                    </svg>
                </div>

                <h1 className="welcome-title">GaussianShop</h1>
                <p className="welcome-subtitle">3D Gaussian Splatting Editor</p>

                <div className="welcome-actions">
                    <button className="welcome-button welcome-button-primary" onClick={onOpenFile}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                        </svg>
                        Open File
                        <span className="welcome-shortcut">Ctrl+O</span>
                    </button>
                </div>

                <div className={`welcome-drop-zone ${isDragging ? 'active' : ''} ${dragError ? 'error' : ''}`}>
                    {isDragging ? (
                        <>
                            <div className="welcome-drop-icon active">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="7 10 12 15 17 10" />
                                    <line x1="12" y1="15" x2="12" y2="3" />
                                </svg>
                            </div>
                            <p className="drop-active-text">Release to load file</p>
                        </>
                    ) : dragError ? (
                        <>
                            <div className="welcome-drop-icon error">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="15" y1="9" x2="9" y2="15" />
                                    <line x1="9" y1="9" x2="15" y2="15" />
                                </svg>
                            </div>
                            <p className="drop-error-text">{dragError}</p>
                        </>
                    ) : (
                        <>
                            <div className="welcome-drop-icon">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="7 10 12 15 17 10" />
                                    <line x1="12" y1="15" x2="12" y2="3" />
                                </svg>
                            </div>
                            <p>Drop a <strong>.ply</strong> or <strong>.splat</strong> file here</p>
                        </>
                    )}
                </div>

                <div className="welcome-features">
                    <div className="welcome-feature">
                        <div className="feature-icon">🎨</div>
                        <div className="feature-text">
                            <h4>Edit & Transform</h4>
                            <p>Select, move, scale, and rotate splats</p>
                        </div>
                    </div>
                    <div className="welcome-feature">
                        <div className="feature-icon">💡</div>
                        <div className="feature-text">
                            <h4>Global Illumination</h4>
                            <p>SSAO, SSR, and volumetric lighting</p>
                        </div>
                    </div>
                    <div className="welcome-feature">
                        <div className="feature-icon">📤</div>
                        <div className="feature-text">
                            <h4>Multi-Format Export</h4>
                            <p>PLY, SPLAT, OBJ mesh, images</p>
                        </div>
                    </div>
                </div>

                <div className="welcome-footer">
                    <p>Press <kbd>?</kbd> for keyboard shortcuts</p>
                </div>
            </div>

            {/* Drag overlay */}
            {isDragging && (
                <div className="drag-overlay">
                    <div className="drag-overlay-content">
                        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="8" y="8" width="48" height="48" rx="8" strokeDasharray="4 4" />
                            <path d="M32 20v24M20 32h24" />
                        </svg>
                        <span>Drop file to load</span>
                    </div>
                </div>
            )}
        </div>
    );
}

export default WelcomeScreen;

