// Orbit Camera Controller
// Provides intuitive orbit, pan, and zoom controls for 3D navigation

import { mat4, vec3 } from 'gl-matrix';

export interface CameraState {
    target: vec3;          // Look-at target point
    distance: number;      // Distance from target
    azimuth: number;       // Horizontal rotation (radians)
    elevation: number;     // Vertical rotation (radians)
    fov: number;           // Field of view (radians)
    near: number;          // Near clipping plane
    far: number;           // Far clipping plane
}

export class OrbitCamera {
    private target: vec3 = vec3.fromValues(0, 0, 0);
    private distance: number = 5;
    private azimuth: number = 0;
    private elevation: number = 0.3;
    private fov: number = Math.PI / 4; // 45 degrees
    private near: number = 0.1;
    private far: number = 1000;

    private viewMatrix: mat4 = mat4.create();
    private projMatrix: mat4 = mat4.create();
    private position: vec3 = vec3.create();

    private canvas: HTMLCanvasElement | null = null;
    private isDragging = false;
    private isPanning = false;
    private lastMouseX = 0;
    private lastMouseY = 0;

    // Camera sensitivity
    private rotateSpeed = 0.005;
    private panSpeed = 0.002;
    private zoomSpeed = 0.001;
    private minDistance = 0.1;
    private maxDistance = 100;
    private minElevation = -Math.PI / 2 + 0.1;
    private maxElevation = Math.PI / 2 - 0.1;

    // Inertia
    private velocityAzimuth = 0;
    private velocityElevation = 0;
    // velocityZoom reserved for future inertia zoom
    private inertia = 0.92;

    constructor(canvas?: HTMLCanvasElement) {
        if (canvas) {
            this.attach(canvas);
        }
        this.updateMatrices();
    }

    attach(canvas: HTMLCanvasElement): void {
        this.canvas = canvas;
        this.addEventListeners();
        this.updateMatrices();
    }

    detach(): void {
        this.removeEventListeners();
        this.canvas = null;
    }

    private addEventListeners(): void {
        if (!this.canvas) return;

        this.canvas.addEventListener('mousedown', this.onMouseDown);
        this.canvas.addEventListener('mousemove', this.onMouseMove);
        this.canvas.addEventListener('mouseup', this.onMouseUp);
        this.canvas.addEventListener('mouseleave', this.onMouseUp);
        this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
        this.canvas.addEventListener('contextmenu', this.onContextMenu);
        this.canvas.addEventListener('touchstart', this.onTouchStart, { passive: false });
        this.canvas.addEventListener('touchmove', this.onTouchMove, { passive: false });
        this.canvas.addEventListener('touchend', this.onTouchEnd);
    }

    private removeEventListeners(): void {
        if (!this.canvas) return;

        this.canvas.removeEventListener('mousedown', this.onMouseDown);
        this.canvas.removeEventListener('mousemove', this.onMouseMove);
        this.canvas.removeEventListener('mouseup', this.onMouseUp);
        this.canvas.removeEventListener('mouseleave', this.onMouseUp);
        this.canvas.removeEventListener('wheel', this.onWheel);
        this.canvas.removeEventListener('contextmenu', this.onContextMenu);
        this.canvas.removeEventListener('touchstart', this.onTouchStart);
        this.canvas.removeEventListener('touchmove', this.onTouchMove);
        this.canvas.removeEventListener('touchend', this.onTouchEnd);
    }

    private onMouseDown = (e: MouseEvent): void => {
        e.preventDefault();
        this.isDragging = true;
        this.isPanning = e.button === 2 || e.button === 1 || e.shiftKey;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        this.velocityAzimuth = 0;
        this.velocityElevation = 0;
    };

    private onMouseMove = (e: MouseEvent): void => {
        if (!this.isDragging) return;

        const deltaX = e.clientX - this.lastMouseX;
        const deltaY = e.clientY - this.lastMouseY;

        if (this.isPanning) {
            this.pan(deltaX, deltaY);
        } else {
            this.rotate(deltaX, deltaY);
        }

        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        this.updateMatrices();
    };

    private onMouseUp = (): void => {
        this.isDragging = false;
        this.isPanning = false;
    };

    private onWheel = (e: WheelEvent): void => {
        e.preventDefault();
        const delta = e.deltaY * this.zoomSpeed;
        this.zoom(delta);
        this.updateMatrices();
    };

    private onContextMenu = (e: MouseEvent): void => {
        e.preventDefault();
    };

    private lastTouchDistance = 0;
    private lastTouchCenter = { x: 0, y: 0 };

    private onTouchStart = (e: TouchEvent): void => {
        e.preventDefault();
        if (e.touches.length === 1) {
            this.isDragging = true;
            this.isPanning = false;
            this.lastMouseX = e.touches[0].clientX;
            this.lastMouseY = e.touches[0].clientY;
        } else if (e.touches.length === 2) {
            this.isDragging = true;
            this.isPanning = true;
            const dx = e.touches[1].clientX - e.touches[0].clientX;
            const dy = e.touches[1].clientY - e.touches[0].clientY;
            this.lastTouchDistance = Math.sqrt(dx * dx + dy * dy);
            this.lastTouchCenter = {
                x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
                y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
            };
        }
    };

    private onTouchMove = (e: TouchEvent): void => {
        e.preventDefault();
        if (!this.isDragging) return;

        if (e.touches.length === 1 && !this.isPanning) {
            const deltaX = e.touches[0].clientX - this.lastMouseX;
            const deltaY = e.touches[0].clientY - this.lastMouseY;
            this.rotate(deltaX, deltaY);
            this.lastMouseX = e.touches[0].clientX;
            this.lastMouseY = e.touches[0].clientY;
        } else if (e.touches.length === 2) {
            // Pinch zoom
            const dx = e.touches[1].clientX - e.touches[0].clientX;
            const dy = e.touches[1].clientY - e.touches[0].clientY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const delta = (this.lastTouchDistance - distance) * 0.01;
            this.zoom(delta);
            this.lastTouchDistance = distance;

            // Pan
            const center = {
                x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
                y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
            };
            const panDeltaX = center.x - this.lastTouchCenter.x;
            const panDeltaY = center.y - this.lastTouchCenter.y;
            this.pan(panDeltaX, panDeltaY);
            this.lastTouchCenter = center;
        }

        this.updateMatrices();
    };

    private onTouchEnd = (e: TouchEvent): void => {
        if (e.touches.length === 0) {
            this.isDragging = false;
            this.isPanning = false;
        }
    };

    rotate(deltaX: number, deltaY: number): void {
        this.azimuth -= deltaX * this.rotateSpeed;
        this.elevation -= deltaY * this.rotateSpeed;
        this.elevation = Math.max(this.minElevation, Math.min(this.maxElevation, this.elevation));
        this.velocityAzimuth = -deltaX * this.rotateSpeed;
        this.velocityElevation = -deltaY * this.rotateSpeed;
    }

    pan(deltaX: number, deltaY: number): void {
        const panScale = this.distance * this.panSpeed;

        // Calculate right and up vectors
        const right = vec3.fromValues(
            Math.cos(this.azimuth),
            0,
            Math.sin(this.azimuth)
        );
        // World up used for reference
        const forward = vec3.create();
        vec3.subtract(forward, this.target, this.position);
        vec3.normalize(forward, forward);
        const up = vec3.create();
        vec3.cross(up, right, forward);
        vec3.normalize(up, up);

        // Apply pan
        vec3.scaleAndAdd(this.target, this.target, right, -deltaX * panScale);
        vec3.scaleAndAdd(this.target, this.target, up, deltaY * panScale);
    }

    zoom(delta: number): void {
        this.distance *= 1 + delta;
        this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.distance));
    }

    update(_deltaTime: number = 1 / 60): void {
        // Apply inertia
        if (!this.isDragging) {
            this.azimuth += this.velocityAzimuth;
            this.elevation += this.velocityElevation;
            this.elevation = Math.max(this.minElevation, Math.min(this.maxElevation, this.elevation));

            this.velocityAzimuth *= this.inertia;
            this.velocityElevation *= this.inertia;

            if (Math.abs(this.velocityAzimuth) > 0.0001 || Math.abs(this.velocityElevation) > 0.0001) {
                this.updateMatrices();
            }
        }
    }

    private updateMatrices(): void {
        // Calculate camera position from spherical coordinates
        const x = this.target[0] + this.distance * Math.cos(this.elevation) * Math.sin(this.azimuth);
        const y = this.target[1] + this.distance * Math.sin(this.elevation);
        const z = this.target[2] + this.distance * Math.cos(this.elevation) * Math.cos(this.azimuth);

        vec3.set(this.position, x, y, z);

        // Create view matrix
        mat4.lookAt(this.viewMatrix, this.position, this.target, [0, 1, 0]);

        // Create projection matrix
        if (this.canvas) {
            const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
            mat4.perspective(this.projMatrix, this.fov, aspect, this.near, this.far);
        }
    }

    getViewMatrix(): Float32Array {
        return this.viewMatrix as Float32Array;
    }

    getProjectionMatrix(): Float32Array {
        return this.projMatrix as Float32Array;
    }

    getPosition(): vec3 {
        return vec3.clone(this.position);
    }

    getState(): CameraState {
        return {
            target: vec3.clone(this.target),
            distance: this.distance,
            azimuth: this.azimuth,
            elevation: this.elevation,
            fov: this.fov,
            near: this.near,
            far: this.far,
        };
    }

    setState(state: Partial<CameraState>): void {
        if (state.target) vec3.copy(this.target, state.target);
        if (state.distance !== undefined) this.distance = state.distance;
        if (state.azimuth !== undefined) this.azimuth = state.azimuth;
        if (state.elevation !== undefined) this.elevation = state.elevation;
        if (state.fov !== undefined) this.fov = state.fov;
        if (state.near !== undefined) this.near = state.near;
        if (state.far !== undefined) this.far = state.far;
        this.updateMatrices();
    }

    setTarget(x: number, y: number, z: number): void {
        vec3.set(this.target, x, y, z);
        this.updateMatrices();
    }

    setDistance(distance: number): void {
        this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, distance));
        this.updateMatrices();
    }

    getFov(): number {
        return this.fov;
    }

    getNear(): number {
        return this.near;
    }

    getFar(): number {
        return this.far;
    }

    getAspect(): number {
        return this.canvas ? this.canvas.clientWidth / this.canvas.clientHeight : 1;
    }

    // Focus on a bounding box
    focusOnBounds(min: vec3, max: vec3): void {
        const center = vec3.create();
        vec3.add(center, min, max);
        vec3.scale(center, center, 0.5);

        const size = vec3.create();
        vec3.subtract(size, max, min);
        const maxSize = Math.max(size[0], size[1], size[2]);

        vec3.copy(this.target, center);
        this.distance = maxSize * 1.5;
        this.updateMatrices();
    }
}

export default OrbitCamera;
