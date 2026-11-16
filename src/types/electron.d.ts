/*
 * Minimal, hand-maintained Electron typings for the APIs NexusCord touches.
 * We intentionally avoid depending on the full `electron` npm package so that
 * `npm install` never downloads a 100MB Electron binary just for types.
 */
declare module "electron" {
    import { EventEmitter } from "events";

    export interface WebPreferences {
        preload?: string;
        contextIsolation?: boolean;
        nodeIntegration?: boolean;
        sandbox?: boolean;
        [key: string]: unknown;
    }

    export interface BrowserWindowConstructorOptions {
        title?: string;
        width?: number;
        height?: number;
        frame?: boolean;
        transparent?: boolean;
        backgroundColor?: string;
        backgroundMaterial?: "auto" | "none" | "mica" | "acrylic" | "tabbed";
        webPreferences?: WebPreferences;
        [key: string]: unknown;
    }

    export interface ProcessMetric {
        pid: number;
        type: string;
        name?: string;
        memory: { workingSetSize: number; peakWorkingSetSize: number; privateBytes?: number };
        cpu: { percentCPUUsage: number };
    }

    export interface WebContents extends EventEmitter {
        id: number;
        send(channel: string, ...args: unknown[]): void;
        isDestroyed(): boolean;
        getURL(): string;
        setBackgroundThrottling(allowed: boolean): void;
        session: Session;
    }

    export class BrowserWindow extends EventEmitter {
        constructor(options?: BrowserWindowConstructorOptions);
        static getAllWindows(): BrowserWindow[];
        static fromWebContents(wc: WebContents): BrowserWindow | null;
        webContents: WebContents;
        isDestroyed(): boolean;
        isMinimized(): boolean;
        setBackgroundMaterial?(material: "auto" | "none" | "mica" | "acrylic" | "tabbed"): void;
        setBackgroundColor(color: string): void;
    }

    export interface OnHeadersReceivedListenerDetails {
        id: number;
        url: string;
        method: string;
        resourceType: string;
        statusCode: number;
        statusLine: string;
        responseHeaders?: Record<string, string[]>;
        [key: string]: unknown;
    }
    export interface HeadersReceivedResponse {
        cancel?: boolean;
        responseHeaders?: Record<string, string | string[]>;
        statusLine?: string;
    }
    export interface OnBeforeRequestListenerDetails {
        id: number;
        url: string;
        method: string;
        resourceType: string;
        [key: string]: unknown;
    }
    export interface CallbackResponse {
        cancel?: boolean;
        redirectURL?: string;
    }
    export interface WebRequestFilter {
        urls: string[];
    }
    export type HeadersListener = (d: OnHeadersReceivedListenerDetails, cb: (r: HeadersReceivedResponse) => void) => void;
    export type BeforeRequestListener = (d: OnBeforeRequestListenerDetails, cb: (r: CallbackResponse) => void) => void;

    export interface WebRequest {
        onHeadersReceived(listener: HeadersListener | null): void;
        onHeadersReceived(filter: WebRequestFilter, listener: HeadersListener | null): void;
        onBeforeRequest(listener: BeforeRequestListener | null): void;
        onBeforeRequest(filter: WebRequestFilter, listener: BeforeRequestListener | null): void;
    }

    export interface Session {
        webRequest: WebRequest;
        clearCache(): Promise<void>;
        clearCodeCaches(options: { urls?: string[] }): Promise<void>;
        clearStorageData(options?: { storages?: string[] }): Promise<void>;
    }

    export const session: { defaultSession: Session };

    export interface CommandLine {
        appendSwitch(name: string, value?: string): void;
        hasSwitch(name: string): boolean;
        getSwitchValue(name: string): string;
    }

    export interface App extends EventEmitter {
        commandLine: CommandLine;
        name: string;
        whenReady(): Promise<void>;
        isReady(): boolean;
        getPath(name: string): string;
        setPath(name: string, path: string): void;
        getAppPath(): string;
        setAppPath(path: string): void;
        getVersion(): string;
        getAppMetrics(): ProcessMetric[];
        relaunch(options?: { args?: string[]; execPath?: string }): void;
        exit(code?: number): void;
        quit(): void;
    }
    export const app: App;

    export interface IpcMainEvent {
        sender: WebContents;
        returnValue: unknown;
    }
    export interface IpcMainInvokeEvent {
        sender: WebContents;
    }
    export const ipcMain: {
        on(channel: string, listener: (event: IpcMainEvent, ...args: any[]) => void): void;
        handle(channel: string, listener: (event: IpcMainInvokeEvent, ...args: any[]) => unknown): void;
        removeHandler(channel: string): void;
    };

    export interface IpcRendererEvent {
        sender: unknown;
    }
    export const ipcRenderer: {
        send(channel: string, ...args: unknown[]): void;
        sendSync(channel: string, ...args: unknown[]): any;
        invoke(channel: string, ...args: unknown[]): Promise<any>;
        on(channel: string, listener: (event: IpcRendererEvent, ...args: any[]) => void): void;
        removeListener(channel: string, listener: (...args: any[]) => void): void;
    };

    export const contextBridge: {
        exposeInMainWorld(apiKey: string, api: unknown): void;
    };

    export const webFrame: {
        executeJavaScript(code: string, userGesture?: boolean): Promise<unknown>;
        clearCache(): void;
        getResourceUsage(): Record<string, { count: number; size: number; liveSize: number }>;
    };

    export const shell: {
        openExternal(url: string, options?: unknown): Promise<void>;
        openPath(path: string): Promise<string>;
        showItemInFolder(path: string): void;
    };

    export const net: {
        fetch(input: string, init?: RequestInit & { bypassCustomProtocolHandlers?: boolean }): Promise<Response>;
    };

    const electron: {
        app: App;
        BrowserWindow: typeof BrowserWindow;
        ipcMain: typeof ipcMain;
        session: typeof session;
        shell: typeof shell;
        net: typeof net;
        [key: string]: unknown;
    };
    export default electron;
}
