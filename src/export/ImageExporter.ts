// Image Exporter - Screenshot and render export
// Exports high-quality images from the viewport

export interface ImageExportOptions {
    width: number;
    height: number;
    format: 'png' | 'jpeg' | 'webp';
    quality: number;  // 0-1 for jpeg/webp
    transparentBackground: boolean;
    supersampling: number;  // 1, 2, or 4
}

const DEFAULT_OPTIONS: ImageExportOptions = {
    width: 1920,
    height: 1080,
    format: 'png',
    quality: 0.92,
    transparentBackground: false,
    supersampling: 1,
};

export class ImageExporter {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;

    constructor() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d')!;
    }

    // Capture current viewport
    captureViewport(
        sourceCanvas: HTMLCanvasElement,
        options: Partial<ImageExportOptions> = {}
    ): Promise<Blob> {
        const opts = { ...DEFAULT_OPTIONS, ...options };

        return new Promise((resolve, reject) => {
            const width = opts.width * opts.supersampling;
            const height = opts.height * opts.supersampling;

            this.canvas.width = width;
            this.canvas.height = height;

            // Clear with background
            if (!opts.transparentBackground) {
                this.ctx.fillStyle = '#0a0a14';
                this.ctx.fillRect(0, 0, width, height);
            }

            // Draw source canvas scaled
            this.ctx.drawImage(sourceCanvas, 0, 0, width, height);

            // If supersampling, scale down
            if (opts.supersampling > 1) {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = opts.width;
                tempCanvas.height = opts.height;
                const tempCtx = tempCanvas.getContext('2d')!;

                tempCtx.drawImage(this.canvas, 0, 0, opts.width, opts.height);

                tempCanvas.toBlob(
                    (blob) => {
                        if (blob) resolve(blob);
                        else reject(new Error('Failed to create blob'));
                    },
                    `image/${opts.format}`,
                    opts.format !== 'png' ? opts.quality : undefined
                );
            } else {
                this.canvas.toBlob(
                    (blob) => {
                        if (blob) resolve(blob);
                        else reject(new Error('Failed to create blob'));
                    },
                    `image/${opts.format}`,
                    opts.format !== 'png' ? opts.quality : undefined
                );
            }
        });
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

    // Quick screenshot
    async screenshot(
        sourceCanvas: HTMLCanvasElement,
        filename: string = 'screenshot',
        options: Partial<ImageExportOptions> = {}
    ): Promise<void> {
        const blob = await this.captureViewport(sourceCanvas, options);
        const ext = options.format ?? 'png';
        ImageExporter.saveBlob(blob, `${filename}.${ext}`);
    }

    // Copy to clipboard
    async copyToClipboard(
        sourceCanvas: HTMLCanvasElement,
        options: Partial<ImageExportOptions> = {}
    ): Promise<boolean> {
        try {
            const blob = await this.captureViewport(sourceCanvas, {
                ...options,
                format: 'png', // Clipboard requires PNG
            });

            await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
            ]);

            return true;
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);
            return false;
        }
    }

    // Get data URL
    async toDataURL(
        sourceCanvas: HTMLCanvasElement,
        options: Partial<ImageExportOptions> = {}
    ): Promise<string> {
        const blob = await this.captureViewport(sourceCanvas, options);
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }
}

export const imageExporter = new ImageExporter();
export default ImageExporter;
