// Loading Progress Component
// Shows animated loading progress for file imports

import { useState, useEffect } from 'react';
import './LoadingProgress.css';

interface LoadingProgressProps {
    isLoading: boolean;
    message?: string;
    progress?: number; // 0-100
}

export function LoadingProgress({ isLoading, message = 'Loading...', progress }: LoadingProgressProps) {
    const [dots, setDots] = useState('');

    useEffect(() => {
        if (isLoading) {
            const interval = setInterval(() => {
                setDots(prev => prev.length >= 3 ? '' : prev + '.');
            }, 400);
            return () => clearInterval(interval);
        }
        setDots('');
    }, [isLoading]);

    if (!isLoading) return null;

    return (
        <div className="loading-progress-overlay">
            <div className="loading-progress-container">
                <div className="loading-spinner-container">
                    <div className="loading-spinner">
                        <svg viewBox="0 0 50 50">
                            <circle
                                className="spinner-track"
                                cx="25"
                                cy="25"
                                r="20"
                                fill="none"
                                strokeWidth="4"
                            />
                            <circle
                                className="spinner-fill"
                                cx="25"
                                cy="25"
                                r="20"
                                fill="none"
                                strokeWidth="4"
                                strokeLinecap="round"
                            />
                        </svg>
                        <div className="spinner-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="4" y="4" width="16" height="16" rx="2" />
                                <circle cx="12" cy="12" r="4" />
                            </svg>
                        </div>
                    </div>
                </div>

                <div className="loading-text">
                    <span className="loading-message">{message}{dots}</span>
                    {progress !== undefined && (
                        <span className="loading-percent">{Math.round(progress)}%</span>
                    )}
                </div>

                {progress !== undefined && (
                    <div className="loading-progress-bar">
                        <div
                            className="loading-progress-fill"
                            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                        />
                    </div>
                )}

                <p className="loading-hint">Large files may take a moment</p>
            </div>
        </div>
    );
}

export default LoadingProgress;
