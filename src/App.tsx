// Main Application Component
// GaussianShop - 3D Gaussian Splatting Editor

import { useCallback, useRef, useState, useEffect, lazy, Suspense } from 'react';
import { Viewport } from './components/Viewport';
import { Toolbar } from './components/Toolbar';
import { Sidebar } from './components/Sidebar';
import { PropertiesPanel } from './components/PropertiesPanel';
import { LightingPanel } from './lighting/LightingPanel';
import { useAppStore } from './store/appStore';
import { loadPLY } from './loaders/PLYLoader';
import { layerManager } from './scene/LayerManager';
import { shortcutManager } from './tools/ShortcutManager';
import { selectionManager } from './tools/SelectionManager';
import { historyManager } from './tools/HistoryManager';
import { clipboard } from './scene/Clipboard';
import PLYExporter from './export/PLYExporter';
import SceneSerializer from './scene/SceneSerializer';
import { ExportMenu } from './components/ExportMenu';
import { StatusBar } from './components/StatusBar';
import { ToastProvider, useToast } from './components/Toast';
import { WelcomeScreen } from './components/WelcomeScreen';
import { LoadingProgress } from './components/LoadingProgress';
import './App.css';

// Lazy-loaded components for code splitting
const SettingsModal = lazy(() => import('./components/SettingsModal'));
const KeyboardShortcutsModal = lazy(() => import('./components/KeyboardShortcutsModal'));

function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    setGaussianData,
    setLoading,
    setError,
    fileName,
    isLoading,
    error,
    gaussianData,
    showStats,
    toggleStats,
    showGrid,
    toggleGrid,
  } = useAppStore();

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showLeftSidebar, setShowLeftSidebar] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Initialize Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if typing in input
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      // Toggle shortcuts modal with '?' key
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        setShowShortcuts(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleFileLoad = useCallback(async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();

    if (!['ply', 'splat', 'gsp'].includes(ext || '')) {
      setError('Unsupported file format. Please use .ply, .splat, or .gsp files.');
      return;
    }

    try {
      setLoading(true, 0);
      console.log('Loading file:', file.name);

      if (ext === 'gsp') {
        // Load project file
        const projectData = await SceneSerializer.loadFromFile(file);
        const { gaussianData: loadedData } = SceneSerializer.loadProject(projectData);
        if (loadedData) {
          setGaussianData(loadedData, projectData.metadata.name + '.ply');
          console.log('Loaded project:', projectData.metadata.name, loadedData.count, 'Gaussians');
        } else {
          setError('Project file contains no Gaussian data');
        }
      } else {
        // Load PLY/Splat file
        const data = await loadPLY(file);
        setGaussianData(data, file.name);
        console.log('Loaded successfully:', data.count, 'Gaussians');
      }
    } catch (err) {
      console.error('Failed to load file:', err);
      setError(err instanceof Error ? err.message : 'Failed to load file');
    }
  }, [setGaussianData, setLoading, setError]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileLoad(file);
    }
  }, [handleFileLoad]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileLoad(file);
    }
  }, [handleFileLoad]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleOpenFile = () => {
    fileInputRef.current?.click();
  };

  const handleSave = useCallback(async () => {
    if (gaussianData) {
      const projectName = fileName?.replace('.ply', '').replace('.splat', '') || 'project';
      const project = SceneSerializer.createProjectData(projectName, gaussianData);
      await SceneSerializer.saveToFile(project, projectName + '.gsp');
      console.log('Saved project:', projectName + '.gsp');
    }
  }, [gaussianData, fileName]);

  const handleExport = useCallback(() => {
    if (gaussianData) {
      const buffer = PLYExporter.export(gaussianData, { format: 'binary' });
      PLYExporter.saveToFile(buffer, fileName || 'gaussian.ply');
      console.log('Exported PLY:', fileName || 'gaussian.ply');
    }
  }, [gaussianData, fileName]);

  return (
    <div
      className="app"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

      {/* Header */}
      <header className="app-header">
        <div className="header-left">
          <div className="app-logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="3" fill="currentColor" />
              <circle cx="12" cy="12" r="8" opacity="0.3" />
              <circle cx="12" cy="12" r="11" opacity="0.1" />
            </svg>
            <span className="logo-text">GaussianShop</span>
          </div>

          <nav className="header-nav">
            <button className="nav-button" onClick={handleOpenFile}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              Open
            </button>
            <button className="nav-button" disabled={!gaussianData} onClick={handleSave}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              Save
            </button>
            <ExportMenu
              gaussianData={gaussianData}
              fileName={fileName}
              canvasRef={{ current: null }}
            />
          </nav>
        </div>

        <div className="header-right">
          {fileName && (
            <div className="file-name">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              {fileName}
            </div>
          )}

          <div className="header-actions">
            <button
              className={`action-button ${showStats ? 'active' : ''}`}
              onClick={toggleStats}
              title="Toggle Stats"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
            </button>
            <button
              className={`action-button ${showGrid ? 'active' : ''}`}
              onClick={toggleGrid}
              title="Toggle Grid"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="3" y1="15" x2="21" y2="15" />
                <line x1="9" y1="3" x2="9" y2="21" />
                <line x1="15" y1="3" x2="15" y2="21" />
              </svg>
            </button>
            <button
              className={`action-button ${showLeftSidebar ? 'active' : ''}`}
              onClick={() => setShowLeftSidebar(!showLeftSidebar)}
              title="Toggle Left Panel"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </svg>
            </button>
            <button
              className={`action-button ${showRightPanel ? 'active' : ''}`}
              onClick={() => setShowRightPanel(!showRightPanel)}
              title="Toggle Right Panel"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="15" y1="3" x2="15" y2="21" />
              </svg>
            </button>
            <button
              className="action-button"
              onClick={() => setIsSettingsOpen(true)}
              title="Settings"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
            <button
              className="action-button"
              onClick={() => setShowShortcuts(true)}
              title="Keyboard Shortcuts (?)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="app-content">
        {showLeftSidebar && <Sidebar />}

        <div className="center-panel">
          {gaussianData ? (
            <>
              <Viewport />
              <Toolbar />
            </>
          ) : (
            <WelcomeScreen onOpenFile={handleOpenFile} onFileLoad={handleFileLoad} />
          )}
        </div>

        {showRightPanel && (
          <div className="right-panels">
            <PropertiesPanel />
            <LightingPanel />
          </div>
        )}
      </main>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".ply,.splat,.gsp"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      {/* Loading overlay */}
      <LoadingProgress isLoading={isLoading} message="Loading file" />

      {/* Error toast */}
      {error && (
        <div className="error-toast">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Status Bar */}
      <StatusBar gaussianData={gaussianData} fileName={fileName} />

      {/* Settings Modal */}
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />
    </div>
  );
}

export default App;
