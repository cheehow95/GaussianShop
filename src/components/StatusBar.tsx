// Status Bar Component
// Displays file info, stats, and shortcuts

import { useMemo } from 'react';
import type { GaussianData } from '../core/SplatRenderer';
import './StatusBar.css';

interface StatusBarProps {
    gaussianData: GaussianData | null;
    fileName: string | null;
    fps?: number;
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatNumber(num: number): string {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
    return num.toString();
}

export function StatusBar({ gaussianData, fileName, fps }: StatusBarProps) {
    const stats = useMemo(() => {
        if (!gaussianData) return null;

        const posBytes = gaussianData.positions.byteLength;
        const opacBytes = gaussianData.opacities.byteLength;
        const scaleBytes = gaussianData.scales.byteLength;
        const rotBytes = gaussianData.rotations.byteLength;
        const colorBytes = gaussianData.colors.byteLength;

        return {
            count: gaussianData.count,
            totalBytes: posBytes + opacBytes + scaleBytes + rotBytes + colorBytes,
        };
    }, [gaussianData]);

    return (
        <footer className="status-bar">
            <div className="status-left">
                {gaussianData ? (
                    <>
                        <span className="status-item" title="Gaussian count">
                            <span className="status-icon">⚛</span>
                            {formatNumber(stats!.count)} splats
                        </span>
                        <span className="status-separator">|</span>
                        <span className="status-item" title="Memory usage">
                            <span className="status-icon">💾</span>
                            {formatBytes(stats!.totalBytes)}
                        </span>
                        {fileName && (
                            <>
                                <span className="status-separator">|</span>
                                <span className="status-item status-filename" title={fileName}>
                                    {fileName}
                                </span>
                            </>
                        )}
                    </>
                ) : (
                    <span className="status-item status-empty">
                        No file loaded
                    </span>
                )}
            </div>

            <div className="status-right">
                {fps !== undefined && fps > 0 && (
                    <span className="status-item status-fps" title="Frames per second">
                        {fps} FPS
                    </span>
                )}
                <span className="status-shortcuts">
                    <kbd>Ctrl</kbd>+<kbd>O</kbd> Open
                    <span className="status-separator">|</span>
                    <kbd>Ctrl</kbd>+<kbd>S</kbd> Save
                    <span className="status-separator">|</span>
                    <kbd>Ctrl</kbd>+<kbd>Z</kbd> Undo
                </span>
            </div>
        </footer>
    );
}

export default StatusBar;
