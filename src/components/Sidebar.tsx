// Sidebar Component
// Scene hierarchy and layer management panel

import { useState, useEffect } from 'react';
import { sceneGraph } from '../scene/SceneGraph';
import { SceneNode } from '../scene/SceneNode';
import { layerManager, type Layer } from '../scene/LayerManager';
import { useAppStore } from '../store/appStore';
import { FileInfoPanel } from './FileInfoPanel';
import './Sidebar.css';

type SidebarTab = 'hierarchy' | 'layers' | 'info';

export function Sidebar() {
    const [activeTab, setActiveTab] = useState<SidebarTab>('hierarchy');
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [rootNodes, setRootNodes] = useState<SceneNode[]>([]);
    const [layers, setLayers] = useState<Layer[]>([]);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
    const { gaussianData, fileName } = useAppStore();

    useEffect(() => {
        const updateScene = () => {
            setRootNodes(sceneGraph.getRootNodes());
        };
        const updateLayers = () => {
            setLayers(layerManager.getAllLayers());
        };

        updateScene();
        updateLayers();

        const unsubScene = sceneGraph.subscribe(updateScene);
        const unsubLayers = layerManager.subscribe(updateLayers);

        return () => {
            unsubScene();
            unsubLayers();
        };
    }, []);

    const toggleExpanded = (nodeId: string) => {
        setExpandedNodes(prev => {
            const next = new Set(prev);
            if (next.has(nodeId)) {
                next.delete(nodeId);
            } else {
                next.add(nodeId);
            }
            return next;
        });
    };

    const handleNodeClick = (node: SceneNode, e: React.MouseEvent) => {
        setSelectedNodeId(node.id);
        sceneGraph.selectNode(node.id, e.shiftKey || e.ctrlKey);
    };

    const handleLayerVisibilityToggle = (layerId: string) => {
        layerManager.toggleLayerVisible(layerId);
    };

    const handleLayerLockToggle = (layerId: string) => {
        layerManager.toggleLayerLocked(layerId);
    };

    const handleAddLayer = () => {
        layerManager.createLayer(`Layer ${layers.length + 1}`);
    };

    const renderNode = (node: SceneNode, depth: number = 0): React.ReactNode => {
        const isExpanded = expandedNodes.has(node.id);
        const isSelected = selectedNodeId === node.id;
        const hasChildren = node.children.length > 0;

        return (
            <div key={node.id} className="tree-node">
                <div
                    className={`tree-item ${isSelected ? 'selected' : ''}`}
                    style={{ paddingLeft: `${12 + depth * 16}px` }}
                    onClick={(e) => handleNodeClick(node, e)}
                >
                    {hasChildren && (
                        <button
                            className="expand-button"
                            onClick={(e) => {
                                e.stopPropagation();
                                toggleExpanded(node.id);
                            }}
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points={isExpanded ? "6 9 12 15 18 9" : "9 6 15 12 9 18"} />
                            </svg>
                        </button>
                    )}
                    <svg className="node-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="3" />
                        <circle cx="12" cy="12" r="8" opacity="0.3" />
                    </svg>
                    <span className="node-name">{node.name}</span>
                    <button
                        className={`visibility-button ${node.visible ? 'visible' : ''}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            node.visible = !node.visible;
                            setRootNodes([...sceneGraph.getRootNodes()]);
                        }}
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            {node.visible ? (
                                <>
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                    <circle cx="12" cy="12" r="3" />
                                </>
                            ) : (
                                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                            )}
                        </svg>
                    </button>
                </div>
                {hasChildren && isExpanded && (
                    <div className="tree-children">
                        {node.children.map(child => renderNode(child, depth + 1))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
            <div className="sidebar-header">
                <button
                    className="collapse-button"
                    onClick={() => setIsCollapsed(!isCollapsed)}
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points={isCollapsed ? "9 18 15 12 9 6" : "15 18 9 12 15 6"} />
                    </svg>
                </button>
                {!isCollapsed && (
                    <div className="tab-buttons">
                        <button
                            className={activeTab === 'hierarchy' ? 'active' : ''}
                            onClick={() => setActiveTab('hierarchy')}
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                            </svg>
                            Hierarchy
                        </button>
                        <button
                            className={activeTab === 'layers' ? 'active' : ''}
                            onClick={() => setActiveTab('layers')}
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                                <polyline points="2 17 12 22 22 17" />
                                <polyline points="2 12 12 17 22 12" />
                            </svg>
                            Layers
                        </button>
                        {gaussianData && (
                            <button
                                className={activeTab === 'info' ? 'active' : ''}
                                onClick={() => setActiveTab('info')}
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="12" y1="16" x2="12" y2="12" />
                                    <line x1="12" y1="8" x2="12.01" y2="8" />
                                </svg>
                                Info
                            </button>
                        )}
                    </div>
                )}
            </div>

            {!isCollapsed && (
                <div className="sidebar-content">
                    {activeTab === 'hierarchy' && (
                        <div className="hierarchy-view">
                            {rootNodes.length === 0 ? (
                                <div className="empty-message">No objects in scene</div>
                            ) : (
                                <div className="tree-view">
                                    {rootNodes.map(node => renderNode(node))}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'layers' && (
                        <div className="layers-view">
                            <div className="layers-header">
                                <button className="add-layer-button" onClick={handleAddLayer}>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <line x1="12" y1="5" x2="12" y2="19" />
                                        <line x1="5" y1="12" x2="19" y2="12" />
                                    </svg>
                                    Add Layer
                                </button>
                            </div>
                            <div className="layers-list">
                                {layers.map(layer => (
                                    <div
                                        key={layer.id}
                                        className={`layer-item ${layer.id === layerManager.getActiveLayer().id ? 'active' : ''}`}
                                        onClick={() => layerManager.setActiveLayer(layer.id)}
                                    >
                                        <div
                                            className="layer-color"
                                            style={{ backgroundColor: layer.color }}
                                        />
                                        <span className="layer-name">{layer.name}</span>
                                        <button
                                            className={`layer-visibility ${layer.visible ? 'visible' : ''}`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleLayerVisibilityToggle(layer.id);
                                            }}
                                        >
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                {layer.visible ? (
                                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                                ) : (
                                                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8" />
                                                )}
                                            </svg>
                                        </button>
                                        <button
                                            className={`layer-lock ${layer.locked ? 'locked' : ''}`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleLayerLockToggle(layer.id);
                                            }}
                                        >
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                {layer.locked ? (
                                                    <>
                                                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                                    </>
                                                ) : (
                                                    <>
                                                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                                        <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                                                    </>
                                                )}
                                            </svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === 'info' && gaussianData && (
                        <div className="info-view">
                            <FileInfoPanel
                                fileName={fileName}
                                gaussianData={gaussianData}
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default Sidebar;
