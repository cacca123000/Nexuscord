/*
 * Upload privacy (#15, #16): strips GPS/EXIF/XMP metadata from images and optionally
 * randomizes file names - for drag & drop, paste and the upload button alike.
 * Works at the DOM-event level (the files are rewritten before Discord sees them), so
 * it keeps working when Discord refactors its upload code.
 */
import { onDomReady } from "../core/dom";
import { t } from "../core/i18n";
import { definePlugin, getOption } from "../core/pluginManager";
import { toast } from "../core/ui";
import { randomFileName, sniff, stripMetadata } from "../../shared/metadata";

const ID = "uploadPrivacy";
const ours = new WeakSet<Event>();

async function processFiles(files: File[]): Promise<{ files: File[]; stripped: number }> {
    let stripped = 0;
    const out: File[] = [];
    for (const f of files) {
        let data: BlobPart = f;
        if (getOption(ID, "strip") && f.size < 100 * 1024 * 1024) {
            const bytes = new Uint8Array(await f.arrayBuffer());
            if (sniff(bytes)) {
                const clean = stripMetadata(bytes);
                if (clean.length !== bytes.length) stripped++;
                data = clean as BlobPart;
            }
        }
        const name = getOption(ID, "randomName") ? randomFileName(f.name) : f.name;
        out.push(data === f && name === f.name ? f : new File([data], name, { type: f.type, lastModified: getOption(ID, "randomName") ? Date.now() : f.lastModified }));
    }
    return { files: out, stripped };
}

function toDataTransfer(files: File[]) {
    const dt = new DataTransfer();
    for (const f of files) dt.items.add(f);
    return dt;
}

function report(stripped: number, count: number) {
    if (stripped && getOption(ID, "notify")) toast(t("plugin.uploadPrivacy.stripped", { n: stripped }), "success", 2200);
    void count;
}

async function onDrop(e: DragEvent) {
    if (ours.has(e) || !e.dataTransfer?.files?.length || !(e.target as Element)?.closest?.('[class*="chat"], [class*="channelTextArea"], [class*="uploadArea"], main')) return;
    const files = [...e.dataTransfer.files];
    e.preventDefault();
    e.stopImmediatePropagation();
    const { files: clean, stripped } = await processFiles(files);
    const ev = new DragEvent("drop", { bubbles: true, cancelable: true, composed: true, clientX: e.clientX, clientY: e.clientY, dataTransfer: toDataTransfer(clean) });
    ours.add(ev);
    e.target!.dispatchEvent(ev);
    report(stripped, clean.length);
}

async function onPaste(e: ClipboardEvent) {
    if (ours.has(e) || !e.clipboardData?.files?.length) return;
    const files = [...e.clipboardData.files];
    e.preventDefault();
    e.stopImmediatePropagation();
    const { files: clean, stripped } = await processFiles(files);
    const ev = new ClipboardEvent("paste", { bubbles: true, cancelable: true, composed: true, clipboardData: toDataTransfer(clean) });
    ours.add(ev);
    e.target!.dispatchEvent(ev);
    report(stripped, clean.length);
}

async function onChange(e: Event) {
    const input = e.target as HTMLInputElement;
    if (ours.has(e) || input?.type !== "file" || !input.files?.length) return;
    const files = [...input.files];
    e.stopImmediatePropagation();
    const { files: clean, stripped } = await processFiles(files);
    input.files = toDataTransfer(clean).files;
    const ev = new Event("change", { bubbles: true });
    ours.add(ev);
    input.dispatchEvent(ev);
    report(stripped, clean.length);
}

export default definePlugin({
    id: ID,
    name: "plugin.uploadPrivacy.name",
    description: "plugin.uploadPrivacy.desc",
    category: "privacy",
    options: {
        strip: { type: "boolean", label: "plugin.uploadPrivacy.opt.strip", default: true },
        randomName: { type: "boolean", label: "plugin.uploadPrivacy.opt.randomName", default: false },
        notify: { type: "boolean", label: "plugin.uploadPrivacy.opt.notify", default: true }
    },
    start() {
        onDomReady(() => {
            window.addEventListener("drop", onDrop, true);
            window.addEventListener("paste", onPaste, true);
            window.addEventListener("change", onChange, true);
        });
    },
    stop() {
        window.removeEventListener("drop", onDrop, true);
        window.removeEventListener("paste", onPaste, true);
        window.removeEventListener("change", onChange, true);
    }
});
