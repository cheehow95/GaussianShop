// File Info Panel Component
// Shows detailed information about the loaded Gaussian file

import type { GaussianData } from '../core/SplatRenderer';
import './FileInfoPanel.css';

interface FileInfoPanelProps {
    fileName: string | null;
    gaussianData: GaussianData | null;
    isCollapsed?: boolean;
    onToggle?: () => void;
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatNumber(num: number): string {
    return num.toLocaleString();
}

export function FileInfoPanel({ fileName, gaussianData, isCollapsed, onToggle }: FileInfoPanelProps) {
    if (!gaussianData || !fileName) return null;

    const stats = {
        count: gaussianData.count,
        positions: formatBytes(gaussianData.positions.byteLength),
        scales: formatBytes(gaussianData.scales.byteLength),
        rotations: formatBytes(gaussianData.rotations.byteLength),
        colors: formatBytes(gaussianData.colors.byteLength),
        opacities: formatBytes(gaussianData.opacities.byteLength),
        total: formatBytes(
            gaussianData.positions.byteLength +
            gaussianData.scales.byteLength +
            gaussianData.rotations.byteLength +
            gaussianData.colors.byteLength +
            gaussianData.opacities.byteLength
        ),
    };

    // Calculate bounds
    const bounds = {
        min: [Infinity, Infinity, Infinity],
        max: [-Infinity, -Infinity, -Infinity],
    };

    for (let i = 0; i < gaussianData.count; i++) {
        for (let j = 0; j < 3; j++) {
            const val = gaussianData.positions[i * 3 + j];
            bounds.min[j] = Math.min(bounds.min[j], val);
            bounds.max[j] = Math.max(bounds.max[j], val);
        }
    }

    const dimensions = bounds.min[0] !== Infinity ? [
        (bounds.max[0] - bounds.min[0]).toFixed(2),
        (bounds.max[1] - bounds.min[1]).toFixed(2),
        (bounds.max[2] - bounds.min[2]).toFixed(2),
    ] : null;

    return (
        <div className={`file-info-panel ${isCollapsed ? 'collapsed' : ''}`}>
            <header className="file-info-header" onClick={onToggle}>
                <h4>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                    </svg>
                    File Info
                </h4>
                <svg className="collapse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points={isCollapsed ? "6 9 12 15 18 9" : "18 15 12 9 6 15"} />
                </svg>
            </header>

            {!isCollapsed && (
                <div className="file-info-content">
                    <div className="info-row">
                        <span className="info-label">File</span>
                        <span className="info-value info-filename" title={fileName}>{fileName}</span>
                    </div>

                    <div className="info-divider" />

                    <div className="info-row">
                        <span className="info-label">Splat Count</span>
                        <span className="info-value info-number">{formatNumber(stats.count)}</span>
                    </div>

                    <div className="info-row">
                        <span className="info-label">Total Memory</span>
                        <span className="info-value">{stats.total}</span>
                    </div>

                    {dimensions && (
                        <>
                            <div className="info-divider" />
                            <div className="info-row">
                                <span className="info-label">Dimensions</span>
                                <span className="info-value info-dims">
                                    {dimensions[0]} × {dimensions[1]} × {dimensions[2]}
                                </span>
                            </div>
                        </>
                    )}

                    <div className="info-divider" />

                    <div className="info-section-title">Buffer Sizes</div>
                    <div className="info-row">
                        <span className="info-label">Positions</span>
                        <span className="info-value">{stats.positions}</span>
                    </div>
                    <div className="info-row">
                        <span className="info-label">Scales</span>
                        <span className="info-value">{stats.scales}</span>
                    </div>
                    <div className="info-row">
                        <span className="info-label">Rotations</span>
                        <span className="info-value">{stats.rotations}</span>
                    </div>
                    <div className="info-row">
                        <span className="info-label">Colors</span>
                        <span className="info-value">{stats.colors}</span>
                    </div>
                    <div className="info-row">
                        <span className="info-label">Opacities</span>
                        <span className="info-value">{stats.opacities}</span>
                    </div>
                </div>
            )}
        </div>
    );
}

export default FileInfoPanel;
