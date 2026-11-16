// Procedurally renders the NexusCord icon (gradient rounded square + "N" monogram) into a
// multi-size Windows .ico - no image tools or binary assets needed in the repository.
const SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const A = [0x7c, 0x5c, 0xff];
const B = [0x3e, 0xc6, 0xff];

function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function roundRectInside(x, y, s, r) {
    const cx = Math.min(Math.max(x, r), s - r);
    const cy = Math.min(Math.max(y, r), s - r);
    return Math.hypot(x - cx, y - cy) <= r;
}

/** Returns BGRA pixels (top-down) for a size x size icon. */
export function renderIcon(size) {
    const ss = 4; // supersampling
    const out = new Uint8Array(size * size * 4);
    const r = size * 0.24;
    // "N" stroke: left bar, diagonal, right bar (in 0..1 units)
    const segs = [[0.32, 0.72, 0.32, 0.28], [0.32, 0.28, 0.68, 0.72], [0.68, 0.72, 0.68, 0.28]];
    const stroke = size <= 24 ? 0.085 : 0.075;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            let cover = 0, white = 0;
            for (let sy = 0; sy < ss; sy++) {
                for (let sx = 0; sx < ss; sx++) {
                    const px = x + (sx + 0.5) / ss, py = y + (sy + 0.5) / ss;
                    if (!roundRectInside(px, py, size, r)) continue;
                    cover++;
                    const u = px / size, v = py / size;
                    if (segs.some(([ax, ay, bx, by]) => segDist(u, v, ax, ay, bx, by) <= stroke)) white++;
                }
            }
            const n = ss * ss;
            const alpha = cover / n;
            const w = cover ? white / cover : 0;
            const t = Math.min(1, Math.max(0, (x + y) / (2 * size)));
            const base = [0, 1, 2].map(i => A[i] + (B[i] - A[i]) * t);
            const rgb = base.map(c => c + (255 - c) * w);
            const o = (y * size + x) * 4;
            out[o] = Math.round(rgb[2]);
            out[o + 1] = Math.round(rgb[1]);
            out[o + 2] = Math.round(rgb[0]);
            out[o + 3] = Math.round(alpha * 255);
        }
    }
    return out;
}

/** Encodes a 32-bit BMP-based ICO with all SIZES. */
export function buildIco() {
    const images = SIZES.map(size => {
        const px = renderIcon(size);
        const rowBytes = size * 4;
        const maskRow = Math.ceil(size / 32) * 4;
        const header = Buffer.alloc(40);
        header.writeUInt32LE(40, 0);
        header.writeInt32LE(size, 4);
        header.writeInt32LE(size * 2, 8); // XOR + AND masks
        header.writeUInt16LE(1, 12);
        header.writeUInt16LE(32, 14);
        header.writeUInt32LE(0, 16);
        header.writeUInt32LE(rowBytes * size + maskRow * size, 20);
        const pixels = Buffer.alloc(rowBytes * size);
        for (let y = 0; y < size; y++) Buffer.from(px.buffer, (size - 1 - y) * rowBytes, rowBytes).copy(pixels, y * rowBytes); // bottom-up
        const mask = Buffer.alloc(maskRow * size); // alpha channel is authoritative
        return { size, data: Buffer.concat([header, pixels, mask]) };
    });
    const dir = Buffer.alloc(6 + 16 * images.length);
    dir.writeUInt16LE(0, 0);
    dir.writeUInt16LE(1, 2);
    dir.writeUInt16LE(images.length, 4);
    let offset = dir.length;
    images.forEach((img, i) => {
        const e = 6 + i * 16;
        dir.writeUInt8(img.size >= 256 ? 0 : img.size, e);
        dir.writeUInt8(img.size >= 256 ? 0 : img.size, e + 1);
        dir.writeUInt8(0, e + 2);
        dir.writeUInt8(0, e + 3);
        dir.writeUInt16LE(1, e + 4);
        dir.writeUInt16LE(32, e + 6);
        dir.writeUInt32LE(img.data.length, e + 8);
        dir.writeUInt32LE(offset, e + 12);
        offset += img.data.length;
    });
    return Buffer.concat([dir, ...images.map(i => i.data)]);
}
