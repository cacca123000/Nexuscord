/*
 * Byte-level metadata stripping (no re-encoding, so image quality is untouched).
 *  JPEG: drops APP1 (EXIF/XMP - includes GPS), APP13 (IPTC/Photoshop), COM segments
 *  PNG : drops tEXt, zTXt, iTXt, eXIf, tIME chunks
 *  WebP: drops EXIF and XMP chunks and clears the matching VP8X flags
 *  GIF : drops comment and application (XMP) extensions
 * Unknown formats are returned unchanged.
 */

export type ImageKind = "jpeg" | "png" | "webp" | "gif" | null;

export function sniff(b: Uint8Array): ImageKind {
    if (b[0] === 0xff && b[1] === 0xd8) return "jpeg";
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
    if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "webp";
    if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "gif";
    return null;
}

function concat(parts: Uint8Array[]): Uint8Array {
    const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
    let o = 0;
    for (const p of parts) {
        out.set(p, o);
        o += p.length;
    }
    return out;
}

export function stripJpeg(b: Uint8Array): Uint8Array {
    const parts: Uint8Array[] = [b.subarray(0, 2)];
    let i = 2;
    while (i + 4 <= b.length) {
        if (b[i] !== 0xff) return b; // corrupt - leave untouched
        const marker = b[i + 1];
        if (marker === 0xda) {
            parts.push(b.subarray(i)); // start of scan: copy the rest verbatim
            return concat(parts);
        }
        if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
            parts.push(b.subarray(i, i + 2));
            i += 2;
            continue;
        }
        const len = (b[i + 2] << 8) | b[i + 3];
        const seg = b.subarray(i, i + 2 + len);
        const drop = marker === 0xe1 || marker === 0xed || marker === 0xfe;
        if (!drop) parts.push(seg);
        i += 2 + len;
    }
    return concat(parts);
}

const PNG_DROP = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);
export function stripPng(b: Uint8Array): Uint8Array {
    const parts: Uint8Array[] = [b.subarray(0, 8)];
    let i = 8;
    while (i + 12 <= b.length) {
        const len = ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
        const type = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
        const end = i + 12 + len;
        if (end > b.length) return b;
        if (!PNG_DROP.has(type)) parts.push(b.subarray(i, end));
        i = end;
        if (type === "IEND") break;
    }
    return concat(parts);
}

export function stripWebp(b: Uint8Array): Uint8Array {
    const chunks: Uint8Array[] = [];
    let i = 12;
    let vp8x: Uint8Array | null = null;
    while (i + 8 <= b.length) {
        const type = String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);
        const len = (b[i + 4] | (b[i + 5] << 8) | (b[i + 6] << 16) | (b[i + 7] << 24)) >>> 0;
        const end = i + 8 + len + (len & 1);
        if (end > b.length + 1) return b;
        const chunk = b.slice(i, Math.min(end, b.length));
        if (type === "VP8X") vp8x = chunk;
        if (type !== "EXIF" && type !== "XMP ") chunks.push(chunk);
        i = end;
    }
    if (vp8x) vp8x[8] &= ~(0x08 | 0x04); // clear EXIF + XMP flags
    const body = concat(chunks);
    const header = new Uint8Array(12);
    header.set(b.subarray(0, 4));
    const size = body.length + 4;
    header.set([size & 255, (size >> 8) & 255, (size >> 16) & 255, (size >>> 24) & 255], 4);
    header.set(b.subarray(8, 12), 8);
    return concat([header, body]);
}

export function stripGif(b: Uint8Array): Uint8Array {
    // Header (6) + logical screen descriptor (7) + optional global color table
    let i = 13;
    if (b[10] & 0x80) i += 3 * (1 << ((b[10] & 0x07) + 1));
    const parts: Uint8Array[] = [b.subarray(0, i)];
    const skipSubBlocks = (j: number) => {
        while (j < b.length && b[j] !== 0) j += b[j] + 1;
        return j + 1;
    };
    while (i < b.length) {
        const intro = b[i];
        if (intro === 0x3b) {
            parts.push(b.subarray(i, i + 1));
            break;
        }
        if (intro === 0x21) {
            const label = b[i + 1];
            const end = skipSubBlocks(i + 2);
            // keep graphic control (F9) and NETSCAPE looping app ext; drop comments (FE) & XMP app ext
            const isApp = label === 0xff;
            const appId = isApp ? String.fromCharCode(...b.subarray(i + 3, i + 14)) : "";
            if (!(label === 0xfe || (isApp && !appId.startsWith("NETSCAPE")))) parts.push(b.subarray(i, end));
            i = end;
        } else if (intro === 0x2c) {
            let j = i + 10;
            if (b[i + 9] & 0x80) j += 3 * (1 << ((b[i + 9] & 0x07) + 1));
            j = skipSubBlocks(j + 1);
            parts.push(b.subarray(i, j));
            i = j;
        } else return b;
    }
    return concat(parts);
}

export function stripMetadata(b: Uint8Array): Uint8Array {
    try {
        switch (sniff(b)) {
            case "jpeg": return stripJpeg(b);
            case "png": return stripPng(b);
            case "webp": return stripWebp(b);
            case "gif": return stripGif(b);
            default: return b;
        }
    } catch {
        return b;
    }
}

export function randomFileName(original: string): string {
    const spoiler = original.startsWith("SPOILER_") ? "SPOILER_" : "";
    const ext = /\.[a-z0-9]{1,8}$/i.exec(original)?.[0] ?? "";
    const rnd = Array.from(crypto.getRandomValues(new Uint8Array(6)), x => x.toString(16).padStart(2, "0")).join("");
    return `${spoiler}${rnd}${ext.toLowerCase()}`;
}
