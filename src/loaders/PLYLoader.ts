// PLY File Loader for 3D Gaussian Splatting
// Parses both ASCII and binary PLY formats with Gaussian properties

import type { GaussianData } from '../core/SplatRenderer';

interface PLYHeader {
    format: 'ascii' | 'binary_little_endian' | 'binary_big_endian';
    vertexCount: number;
    properties: PLYProperty[];
    headerEndOffset: number;
}

interface PLYProperty {
    name: string;
    type: string;
    offset: number;
    size: number;
}

const PLY_TYPES: Record<string, { size: number; read: (view: DataView, offset: number, le: boolean) => number }> = {
    'char': { size: 1, read: (v, o) => v.getInt8(o) },
    'uchar': { size: 1, read: (v, o) => v.getUint8(o) },
    'short': { size: 2, read: (v, o, le) => v.getInt16(o, le) },
    'ushort': { size: 2, read: (v, o, le) => v.getUint16(o, le) },
    'int': { size: 4, read: (v, o, le) => v.getInt32(o, le) },
    'uint': { size: 4, read: (v, o, le) => v.getUint32(o, le) },
    'float': { size: 4, read: (v, o, le) => v.getFloat32(o, le) },
    'double': { size: 8, read: (v, o, le) => v.getFloat64(o, le) },
    'int8': { size: 1, read: (v, o) => v.getInt8(o) },
    'uint8': { size: 1, read: (v, o) => v.getUint8(o) },
    'int16': { size: 2, read: (v, o, le) => v.getInt16(o, le) },
    'uint16': { size: 2, read: (v, o, le) => v.getUint16(o, le) },
    'int32': { size: 4, read: (v, o, le) => v.getInt32(o, le) },
    'uint32': { size: 4, read: (v, o, le) => v.getUint32(o, le) },
    'float32': { size: 4, read: (v, o, le) => v.getFloat32(o, le) },
    'float64': { size: 8, read: (v, o, le) => v.getFloat64(o, le) },
};

function parseHeader(text: string): PLYHeader {
    const lines = text.split('\n');
    let format: PLYHeader['format'] = 'ascii';
    let vertexCount = 0;
    const properties: PLYProperty[] = [];
    let inVertex = false;
    let currentOffset = 0;
    let headerEndOffset = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        headerEndOffset += lines[i].length + 1;

        if (line.startsWith('format')) {
            const parts = line.split(/\s+/);
            if (parts[1] === 'binary_little_endian') format = 'binary_little_endian';
            else if (parts[1] === 'binary_big_endian') format = 'binary_big_endian';
            else format = 'ascii';
        } else if (line.startsWith('element vertex')) {
            vertexCount = parseInt(line.split(/\s+/)[2], 10);
            inVertex = true;
        } else if (line.startsWith('element') && inVertex) {
            inVertex = false; // Other elements after vertex
        } else if (line.startsWith('property') && inVertex) {
            const parts = line.split(/\s+/);
            const type = parts[1];
            const name = parts[2];
            const typeInfo = PLY_TYPES[type];
            if (typeInfo) {
                properties.push({
                    name,
                    type,
                    offset: currentOffset,
                    size: typeInfo.size,
                });
                currentOffset += typeInfo.size;
            }
        } else if (line === 'end_header') {
            break;
        }
    }

    return { format, vertexCount, properties, headerEndOffset };
}

function findProperty(properties: PLYProperty[], name: string): PLYProperty | undefined {
    return properties.find(p => p.name === name);
}

export async function loadPLY(source: string | ArrayBuffer | File): Promise<GaussianData> {
    let buffer: ArrayBuffer;

    if (typeof source === 'string') {
        // URL
        const response = await fetch(source);
        buffer = await response.arrayBuffer();
    } else if (source instanceof File) {
        buffer = await source.arrayBuffer();
    } else {
        buffer = source;
    }

    // Parse header (read as text first)
    const textDecoder = new TextDecoder();
    const headerText = textDecoder.decode(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 10000)));

    // Find the byte offset of 'end_header' by searching in the raw buffer
    const endHeaderMarker = 'end_header';
    const headerBytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 10000));
    let headerEndOffset = -1;

    for (let i = 0; i < headerBytes.length - endHeaderMarker.length; i++) {
        let found = true;
        for (let j = 0; j < endHeaderMarker.length; j++) {
            if (headerBytes[i + j] !== endHeaderMarker.charCodeAt(j)) {
                found = false;
                break;
            }
        }
        if (found) {
            // Move past 'end_header' and any trailing newline characters
            headerEndOffset = i + endHeaderMarker.length;
            // Skip \r and \n after 'end_header'
            while (headerEndOffset < headerBytes.length &&
                (headerBytes[headerEndOffset] === 10 || headerBytes[headerEndOffset] === 13)) {
                headerEndOffset++;
            }
            break;
        }
    }

    if (headerEndOffset === -1) {
        throw new Error('Invalid PLY file: could not find end_header marker');
    }

    const header = parseHeader(headerText);

    console.log('PLY Header:', header);

    const { format, vertexCount, properties } = header;

    // Allocate output arrays
    const positions = new Float32Array(vertexCount * 3);
    const opacities = new Float32Array(vertexCount);
    const scales = new Float32Array(vertexCount * 3);
    const rotations = new Float32Array(vertexCount * 4);
    const colors = new Float32Array(vertexCount * 3);

    // Find property indices
    const xProp = findProperty(properties, 'x');
    const yProp = findProperty(properties, 'y');
    const zProp = findProperty(properties, 'z');
    const opacityProp = findProperty(properties, 'opacity');
    const scale0Prop = findProperty(properties, 'scale_0');
    const scale1Prop = findProperty(properties, 'scale_1');
    const scale2Prop = findProperty(properties, 'scale_2');
    const rot0Prop = findProperty(properties, 'rot_0');
    const rot1Prop = findProperty(properties, 'rot_1');
    const rot2Prop = findProperty(properties, 'rot_2');
    const rot3Prop = findProperty(properties, 'rot_3');
    const f_dc_0 = findProperty(properties, 'f_dc_0');
    const f_dc_1 = findProperty(properties, 'f_dc_1');
    const f_dc_2 = findProperty(properties, 'f_dc_2');

    // Alternative color properties
    const redProp = findProperty(properties, 'red');
    const greenProp = findProperty(properties, 'green');
    const blueProp = findProperty(properties, 'blue');

    // Calculate vertex stride
    const vertexStride = properties.reduce((acc, p) => acc + p.size, 0);

    if (format === 'ascii') {
        // Parse ASCII format
        const dataText = textDecoder.decode(new Uint8Array(buffer, headerEndOffset));
        const lines = dataText.trim().split('\n');

        for (let i = 0; i < vertexCount && i < lines.length; i++) {
            const values = lines[i].trim().split(/\s+/).map(parseFloat);

            // Position
            const xi = properties.findIndex(p => p.name === 'x');
            const yi = properties.findIndex(p => p.name === 'y');
            const zi = properties.findIndex(p => p.name === 'z');
            positions[i * 3 + 0] = values[xi] ?? 0;
            positions[i * 3 + 1] = values[yi] ?? 0;
            positions[i * 3 + 2] = values[zi] ?? 0;

            // Opacity
            const opIdx = properties.findIndex(p => p.name === 'opacity');
            opacities[i] = opIdx >= 0 ? 1 / (1 + Math.exp(-values[opIdx])) : 1.0; // Sigmoid

            // Scale
            const s0i = properties.findIndex(p => p.name === 'scale_0');
            const s1i = properties.findIndex(p => p.name === 'scale_1');
            const s2i = properties.findIndex(p => p.name === 'scale_2');
            scales[i * 3 + 0] = s0i >= 0 ? values[s0i] : -5;
            scales[i * 3 + 1] = s1i >= 0 ? values[s1i] : -5;
            scales[i * 3 + 2] = s2i >= 0 ? values[s2i] : -5;

            // Rotation
            const r0i = properties.findIndex(p => p.name === 'rot_0');
            const r1i = properties.findIndex(p => p.name === 'rot_1');
            const r2i = properties.findIndex(p => p.name === 'rot_2');
            const r3i = properties.findIndex(p => p.name === 'rot_3');
            const qw = r0i >= 0 ? values[r0i] : 1;
            const qx = r1i >= 0 ? values[r1i] : 0;
            const qy = r2i >= 0 ? values[r2i] : 0;
            const qz = r3i >= 0 ? values[r3i] : 0;
            const qlen = Math.sqrt(qw * qw + qx * qx + qy * qy + qz * qz);
            rotations[i * 4 + 0] = qw / qlen;
            rotations[i * 4 + 1] = qx / qlen;
            rotations[i * 4 + 2] = qy / qlen;
            rotations[i * 4 + 3] = qz / qlen;

            // Color
            const c0i = properties.findIndex(p => p.name === 'f_dc_0');
            const c1i = properties.findIndex(p => p.name === 'f_dc_1');
            const c2i = properties.findIndex(p => p.name === 'f_dc_2');
            const ri = properties.findIndex(p => p.name === 'red');
            const gi = properties.findIndex(p => p.name === 'green');
            const bi = properties.findIndex(p => p.name === 'blue');

            if (c0i >= 0) {
                // Spherical harmonics DC component
                const SH_C0 = 0.28209479177387814;
                colors[i * 3 + 0] = Math.max(0, values[c0i] * SH_C0 + 0.5);
                colors[i * 3 + 1] = Math.max(0, values[c1i] * SH_C0 + 0.5);
                colors[i * 3 + 2] = Math.max(0, values[c2i] * SH_C0 + 0.5);
            } else if (ri >= 0) {
                colors[i * 3 + 0] = values[ri] / 255;
                colors[i * 3 + 1] = values[gi] / 255;
                colors[i * 3 + 2] = values[bi] / 255;
            } else {
                colors[i * 3 + 0] = 0.5;
                colors[i * 3 + 1] = 0.5;
                colors[i * 3 + 2] = 0.5;
            }
        }
    } else {
        // Parse binary format
        const isLittleEndian = format === 'binary_little_endian';
        const dataView = new DataView(buffer, headerEndOffset);

        for (let i = 0; i < vertexCount; i++) {
            const baseOffset = i * vertexStride;

            // Position
            if (xProp && yProp && zProp) {
                positions[i * 3 + 0] = PLY_TYPES[xProp.type].read(dataView, baseOffset + xProp.offset, isLittleEndian);
                positions[i * 3 + 1] = PLY_TYPES[yProp.type].read(dataView, baseOffset + yProp.offset, isLittleEndian);
                positions[i * 3 + 2] = PLY_TYPES[zProp.type].read(dataView, baseOffset + zProp.offset, isLittleEndian);
            }

            // Opacity (apply sigmoid)
            if (opacityProp) {
                const rawOpacity = PLY_TYPES[opacityProp.type].read(dataView, baseOffset + opacityProp.offset, isLittleEndian);
                opacities[i] = 1 / (1 + Math.exp(-rawOpacity));
            } else {
                opacities[i] = 1.0;
            }

            // Scale
            if (scale0Prop && scale1Prop && scale2Prop) {
                scales[i * 3 + 0] = PLY_TYPES[scale0Prop.type].read(dataView, baseOffset + scale0Prop.offset, isLittleEndian);
                scales[i * 3 + 1] = PLY_TYPES[scale1Prop.type].read(dataView, baseOffset + scale1Prop.offset, isLittleEndian);
                scales[i * 3 + 2] = PLY_TYPES[scale2Prop.type].read(dataView, baseOffset + scale2Prop.offset, isLittleEndian);
            } else {
                scales[i * 3 + 0] = -5;
                scales[i * 3 + 1] = -5;
                scales[i * 3 + 2] = -5;
            }

            // Rotation (normalize quaternion)
            if (rot0Prop && rot1Prop && rot2Prop && rot3Prop) {
                const qw = PLY_TYPES[rot0Prop.type].read(dataView, baseOffset + rot0Prop.offset, isLittleEndian);
                const qx = PLY_TYPES[rot1Prop.type].read(dataView, baseOffset + rot1Prop.offset, isLittleEndian);
                const qy = PLY_TYPES[rot2Prop.type].read(dataView, baseOffset + rot2Prop.offset, isLittleEndian);
                const qz = PLY_TYPES[rot3Prop.type].read(dataView, baseOffset + rot3Prop.offset, isLittleEndian);
                const qlen = Math.sqrt(qw * qw + qx * qx + qy * qy + qz * qz);
                rotations[i * 4 + 0] = qw / qlen;
                rotations[i * 4 + 1] = qx / qlen;
                rotations[i * 4 + 2] = qy / qlen;
                rotations[i * 4 + 3] = qz / qlen;
            } else {
                rotations[i * 4 + 0] = 1;
                rotations[i * 4 + 1] = 0;
                rotations[i * 4 + 2] = 0;
                rotations[i * 4 + 3] = 0;
            }

            // Color
            if (f_dc_0 && f_dc_1 && f_dc_2) {
                const SH_C0 = 0.28209479177387814;
                const c0 = PLY_TYPES[f_dc_0.type].read(dataView, baseOffset + f_dc_0.offset, isLittleEndian);
                const c1 = PLY_TYPES[f_dc_1.type].read(dataView, baseOffset + f_dc_1.offset, isLittleEndian);
                const c2 = PLY_TYPES[f_dc_2.type].read(dataView, baseOffset + f_dc_2.offset, isLittleEndian);
                colors[i * 3 + 0] = Math.max(0, c0 * SH_C0 + 0.5);
                colors[i * 3 + 1] = Math.max(0, c1 * SH_C0 + 0.5);
                colors[i * 3 + 2] = Math.max(0, c2 * SH_C0 + 0.5);
            } else if (redProp && greenProp && blueProp) {
                colors[i * 3 + 0] = PLY_TYPES[redProp.type].read(dataView, baseOffset + redProp.offset, isLittleEndian) / 255;
                colors[i * 3 + 1] = PLY_TYPES[greenProp.type].read(dataView, baseOffset + greenProp.offset, isLittleEndian) / 255;
                colors[i * 3 + 2] = PLY_TYPES[blueProp.type].read(dataView, baseOffset + blueProp.offset, isLittleEndian) / 255;
            } else {
                colors[i * 3 + 0] = 0.5;
                colors[i * 3 + 1] = 0.5;
                colors[i * 3 + 2] = 0.5;
            }
        }
    }

    console.log(`Loaded PLY: ${vertexCount} vertices`);

    return {
        positions,
        opacities,
        scales,
        rotations,
        colors,
        count: vertexCount,
    };
}

export default loadPLY;
