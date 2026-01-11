// Video Exporter - Animation and video export
// Creates turntable animations and custom camera paths

export interface VideoExportOptions {
    width: number;
    height: number;
    fps: number;
    duration: number;  // seconds
    format: 'webm' | 'mp4';
    quality: number;  // 0-1
}

export interface CameraKeyframe {
    time: number;  // 0-1
    position: [number, number, number];
    target: [number, number, number];
    fov: number;
}

const DEFAULT_OPTIONS: VideoExportOptions = {
    width: 1920,
    height: 1080,
    fps: 30,
    duration: 5,
    format: 'webm',
    quality: 0.9,
};

export class VideoExporter {
    private mediaRecorder: MediaRecorder | null = null;
    private chunks: Blob[] = [];
    private isRecording = false;
    private listeners: Set<(progress: number) => void> = new Set();

    // Start recording from canvas
    startRecording(
        canvas: HTMLCanvasElement,
        options: Partial<VideoExportOptions> = {}
    ): boolean {
        if (this.isRecording) return false;

        const opts = { ...DEFAULT_OPTIONS, ...options };
        const stream = canvas.captureStream(opts.fps);

        const mimeType = opts.format === 'webm'
            ? 'video/webm;codecs=vp9'
            : 'video/mp4';

        if (!MediaRecorder.isTypeSupported(mimeType)) {
            console.error(`MIME type ${mimeType} not supported`);
            return false;
        }

        this.chunks = [];
        this.mediaRecorder = new MediaRecorder(stream, {
            mimeType,
            videoBitsPerSecond: opts.quality * 10_000_000,
        });

        this.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                this.chunks.push(e.data);
            }
        };

        this.mediaRecorder.start(100); // Collect every 100ms
        this.isRecording = true;
        return true;
    }

    // Stop recording and get video blob
    stopRecording(): Promise<Blob> {
        return new Promise((resolve, reject) => {
            if (!this.mediaRecorder || !this.isRecording) {
                reject(new Error('Not recording'));
                return;
            }

            this.mediaRecorder.onstop = () => {
                const blob = new Blob(this.chunks, { type: this.mediaRecorder!.mimeType });
                this.chunks = [];
                this.isRecording = false;
                resolve(blob);
            };

            this.mediaRecorder.stop();
        });
    }

    // Cancel recording
    cancelRecording(): void {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.chunks = [];
            this.isRecording = false;
        }
    }

    isCurrentlyRecording(): boolean {
        return this.isRecording;
    }

    // Create turntable animation
    async createTurntable(
        canvas: HTMLCanvasElement,
        renderFrame: (rotation: number) => Promise<void>,
        options: Partial<VideoExportOptions> = {}
    ): Promise<Blob> {
        const opts = { ...DEFAULT_OPTIONS, ...options };
        const totalFrames = opts.fps * opts.duration;

        // Start recording
        if (!this.startRecording(canvas, opts)) {
            throw new Error('Failed to start recording');
        }

        // Render frames
        for (let frame = 0; frame < totalFrames; frame++) {
            const rotation = (frame / totalFrames) * Math.PI * 2;
            await renderFrame(rotation);

            // Notify progress
            this.notifyProgress(frame / totalFrames);

            // Allow browser to process
            await new Promise(resolve => requestAnimationFrame(resolve));
        }

        return this.stopRecording();
    }

    // Create animation from keyframes
    async createFromKeyframes(
        canvas: HTMLCanvasElement,
        keyframes: CameraKeyframe[],
        renderFrame: (position: [number, number, number], target: [number, number, number], fov: number) => Promise<void>,
        options: Partial<VideoExportOptions> = {}
    ): Promise<Blob> {
        const opts = { ...DEFAULT_OPTIONS, ...options };
        const totalFrames = opts.fps * opts.duration;

        if (!this.startRecording(canvas, opts)) {
            throw new Error('Failed to start recording');
        }

        for (let frame = 0; frame < totalFrames; frame++) {
            const t = frame / totalFrames;

            // Interpolate keyframes
            const { position, target, fov } = this.interpolateKeyframes(keyframes, t);
            await renderFrame(position, target, fov);

            this.notifyProgress(t);
            await new Promise(resolve => requestAnimationFrame(resolve));
        }

        return this.stopRecording();
    }

    private interpolateKeyframes(keyframes: CameraKeyframe[], t: number): {
        position: [number, number, number];
        target: [number, number, number];
        fov: number;
    } {
        if (keyframes.length === 0) {
            return {
                position: [0, 0, 5],
                target: [0, 0, 0],
                fov: 45,
            };
        }

        if (keyframes.length === 1) {
            return {
                position: [...keyframes[0].position],
                target: [...keyframes[0].target],
                fov: keyframes[0].fov,
            };
        }

        // Find surrounding keyframes
        let k1 = keyframes[0];
        let k2 = keyframes[1];

        for (let i = 0; i < keyframes.length - 1; i++) {
            if (t >= keyframes[i].time && t <= keyframes[i + 1].time) {
                k1 = keyframes[i];
                k2 = keyframes[i + 1];
                break;
            }
        }

        // Linear interpolation
        const localT = (t - k1.time) / (k2.time - k1.time);

        return {
            position: [
                k1.position[0] + (k2.position[0] - k1.position[0]) * localT,
                k1.position[1] + (k2.position[1] - k1.position[1]) * localT,
                k1.position[2] + (k2.position[2] - k1.position[2]) * localT,
            ],
            target: [
                k1.target[0] + (k2.target[0] - k1.target[0]) * localT,
                k1.target[1] + (k2.target[1] - k1.target[1]) * localT,
                k1.target[2] + (k2.target[2] - k1.target[2]) * localT,
            ],
            fov: k1.fov + (k2.fov - k1.fov) * localT,
        };
    }

    // Save blob to file
    static saveBlob(blob: Blob, filename: string): void {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    subscribe(listener: (progress: number) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notifyProgress(progress: number): void {
        this.listeners.forEach(l => l(progress));
    }
}

export const videoExporter = new VideoExporter();
export default VideoExporter;
