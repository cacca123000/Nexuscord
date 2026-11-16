import type { NexusCordNativeApi } from "../../preload/preload";
import { DEFAULT_SETTINGS, NexusSettings } from "../../shared/settings";

declare global {
    interface Window {
        NexusCordNative?: NexusCordNativeApi;
    }
}

/**
 * In-memory fallback so the renderer bundle can also run (and be tested) in a
 * plain browser page where the Electron preload bridge is absent.
 */
function createStub(): NexusCordNativeApi {
    let settings: NexusSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    let quickCss = "";
    const noop = () => () => {};
    const stub = {
        version: NEXUSCORD_VERSION,
        platform: "browser",
        settings: {
            get: () => settings,
            set: async (s: NexusSettings) => ((settings = s), true),
            paths: () => ({ data: "(browser)", themes: "(browser)", plugins: "(browser)" })
        },
        themes: {
            list: async () => [],
            onChange: noop,
            getQuickCss: async () => quickCss,
            setQuickCss: async (css: string) => ((quickCss = css), true),
            onQuickCssChange: noop
        },
        plugins: {
            list: async () => [],
            onChange: noop,
            loadData: () => ({}),
            saveData: async () => true
        },
        shell: {
            openFolder: async () => "",
            openExternal: async (url: string) => (window.open(url, "_blank", "noopener"), true)
        },
        perf: {
            memory: async () => ({ totalMB: 0, processes: [], main: {} }),
            rendererMemory: () => {
                const m = (performance as any).memory;
                return { rss: 0, heapUsed: m?.usedJSHeapSize ?? 0, heapTotal: m?.totalJSHeapSize ?? 0, external: 0 };
            },
            purgeCache: async () => true,
            clearWebFrameCache: () => {},
            relaunch: async () => location.reload(),
            setAcrylic: async () => false
        },
        linkShield: {
            isPhishing: () => false,
            status: async () => ({ count: 0, updatedAt: 0, sources: {}, refreshing: false }),
            refresh: async () => ({ count: 0, updatedAt: 0, sources: {}, refreshing: false }),
            unshorten: async (url: string) => ({ url, hops: 0 }),
            onBlocked: noop
        }
    };
    return stub as unknown as NexusCordNativeApi;
}

export const Native: NexusCordNativeApi = window.NexusCordNative ?? createStub();
export const isElectron = !!window.NexusCordNative;
