// Transform Gizmo - 3D axis handles for transform operations
// Renders axis arrows, rotation rings, and scale boxes

export type GizmoMode = 'translate' | 'rotate' | 'scale' | 'none';
export type GizmoAxis = 'x' | 'y' | 'z' | 'xy' | 'xz' | 'yz' | 'xyz' | 'none';

export interface GizmoState {
    visible: boolean;
    mode: GizmoMode;
    position: [number, number, number];
    hoveredAxis: GizmoAxis;
    activeAxis: GizmoAxis;
    scale: number;
}

export interface GizmoColors {
    x: string;
    y: string;
    z: string;
    xHover: string;
    yHover: string;
    zHover: string;
    plane: string;
    planeHover: string;
}

const DEFAULT_COLORS: GizmoColors = {
    x: '#ff4444',
    y: '#44ff44',
    z: '#4444ff',
    xHover: '#ff8888',
    yHover: '#88ff88',
    zHover: '#8888ff',
    plane: 'rgba(255, 255, 0, 0.3)',
    planeHover: 'rgba(255, 255, 0, 0.5)',
};

export class TransformGizmo {
    private visible = false;
    private mode: GizmoMode = 'translate';
    private position: [number, number, number] = [0, 0, 0];
    private hoveredAxis: GizmoAxis = 'none';
    private activeAxis: GizmoAxis = 'none';
    private scale = 1;
    private colors: GizmoColors = DEFAULT_COLORS;

    private listeners: Set<(state: GizmoState) => void> = new Set();

    // Screen-space hit areas for each axis (updated by render)
    private hitAreas: Map<GizmoAxis, {
        screenStart: [number, number];
        screenEnd: [number, number];
        thickness: number;
    }> = new Map();

    show(): void {
        this.visible = true;
        this.notifyListeners();
    }

    hide(): void {
        this.visible = false;
        this.notifyListeners();
    }

    isVisible(): boolean {
        return this.visible;
    }

    setMode(mode: GizmoMode): void {
        this.mode = mode;
        this.notifyListeners();
    }

    getMode(): GizmoMode {
        return this.mode;
    }

    setPosition(position: [number, number, number]): void {
        this.position = [...position];
        this.notifyListeners();
    }

    getPosition(): [number, number, number] {
        return [...this.position];
    }

    setScale(scale: number): void {
        this.scale = scale;
        this.notifyListeners();
    }

    // Test if mouse position hits any axis handle
    hitTest(screenX: number, screenY: number): GizmoAxis {
        if (!this.visible) return 'none';

        const hitThreshold = 10; // pixels

        for (const [axis, area] of this.hitAreas) {
            const { screenStart, screenEnd, thickness } = area;

            // Distance from point to line segment
            const dx = screenEnd[0] - screenStart[0];
            const dy = screenEnd[1] - screenStart[1];
            const len = Math.sqrt(dx * dx + dy * dy);

            if (len === 0) continue;

            const t = Math.max(0, Math.min(1, (
                (screenX - screenStart[0]) * dx +
                (screenY - screenStart[1]) * dy
            ) / (len * len)));

            const projX = screenStart[0] + t * dx;
            const projY = screenStart[1] + t * dy;
            const dist = Math.sqrt(
                (screenX - projX) ** 2 + (screenY - projY) ** 2
            );

            if (dist <= thickness + hitThreshold) {
                return axis;
            }
        }

        return 'none';
    }

    setHoveredAxis(axis: GizmoAxis): void {
        if (this.hoveredAxis !== axis) {
            this.hoveredAxis = axis;
            this.notifyListeners();
        }
    }

    getHoveredAxis(): GizmoAxis {
        return this.hoveredAxis;
    }

    setActiveAxis(axis: GizmoAxis): void {
        this.activeAxis = axis;
        this.notifyListeners();
    }

    getActiveAxis(): GizmoAxis {
        return this.activeAxis;
    }

    isActive(): boolean {
        return this.activeAxis !== 'none';
    }

    // Update screen-space hit areas (called after projection)
    updateHitAreas(
        viewMatrix: Float32Array,
        projMatrix: Float32Array,
        viewportWidth: number,
        viewportHeight: number
    ): void {
        this.hitAreas.clear();

        const axisLength = this.scale;
        const axes: [GizmoAxis, [number, number, number]][] = [
            ['x', [axisLength, 0, 0]],
            ['y', [0, axisLength, 0]],
            ['z', [0, 0, axisLength]],
        ];

        const mvp = new Float32Array(16);
        this.multiplyMatrices(mvp, projMatrix, viewMatrix);

        const projectPoint = (x: number, y: number, z: number): [number, number] | null => {
            const clipX = mvp[0] * x + mvp[4] * y + mvp[8] * z + mvp[12];
            const clipY = mvp[1] * x + mvp[5] * y + mvp[9] * z + mvp[13];
            const clipW = mvp[3] * x + mvp[7] * y + mvp[11] * z + mvp[15];

            if (clipW <= 0) return null;

            const ndcX = clipX / clipW;
            const ndcY = clipY / clipW;

            return [
                (ndcX + 1) * 0.5 * viewportWidth,
                (1 - ndcY) * 0.5 * viewportHeight,
            ];
        };

        const centerScreen = projectPoint(
            this.position[0],
            this.position[1],
            this.position[2]
        );

        if (!centerScreen) return;

        for (const [axis, dir] of axes) {
            const endPoint = projectPoint(
                this.position[0] + dir[0],
                this.position[1] + dir[1],
                this.position[2] + dir[2]
            );

            if (endPoint) {
                this.hitAreas.set(axis, {
                    screenStart: centerScreen,
                    screenEnd: endPoint,
                    thickness: 8,
                });
            }
        }
    }

    // Get rendering data for the gizmo
    getRenderData(): {
        axes: Array<{
            axis: GizmoAxis;
            color: string;
            start: [number, number, number];
            end: [number, number, number];
            isHovered: boolean;
            isActive: boolean;
        }>;
    } {
        const axisLength = this.scale;
        const axes: Array<{
            axis: GizmoAxis;
            color: string;
            start: [number, number, number];
            end: [number, number, number];
            isHovered: boolean;
            isActive: boolean;
        }> = [];

        const addAxis = (
            axis: GizmoAxis,
            dir: [number, number, number],
            baseColor: string,
            hoverColor: string
        ) => {
            const isHovered = this.hoveredAxis === axis;
            const isActive = this.activeAxis === axis;

            axes.push({
                axis,
                color: isHovered || isActive ? hoverColor : baseColor,
                start: [...this.position],
                end: [
                    this.position[0] + dir[0] * axisLength,
                    this.position[1] + dir[1] * axisLength,
                    this.position[2] + dir[2] * axisLength,
                ],
                isHovered,
                isActive,
            });
        };

        addAxis('x', [1, 0, 0], this.colors.x, this.colors.xHover);
        addAxis('y', [0, 1, 0], this.colors.y, this.colors.yHover);
        addAxis('z', [0, 0, 1], this.colors.z, this.colors.zHover);

        return { axes };
    }

    getState(): GizmoState {
        return {
            visible: this.visible,
            mode: this.mode,
            position: [...this.position],
            hoveredAxis: this.hoveredAxis,
            activeAxis: this.activeAxis,
            scale: this.scale,
        };
    }

    subscribe(listener: (state: GizmoState) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notifyListeners(): void {
        const state = this.getState();
        this.listeners.forEach(listener => listener(state));
    }

    private multiplyMatrices(out: Float32Array, a: Float32Array, b: Float32Array): void {
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                out[i * 4 + j] =
                    a[0 * 4 + j] * b[i * 4 + 0] +
                    a[1 * 4 + j] * b[i * 4 + 1] +
                    a[2 * 4 + j] * b[i * 4 + 2] +
                    a[3 * 4 + j] * b[i * 4 + 3];
            }
        }
    }
}

export const transformGizmo = new TransformGizmo();
export default TransformGizmo;
