declare const NEXUSCORD_VERSION: string;
declare const NEXUSCORD_DEV: boolean;

declare module "*.css" {
    const css: string;
    export default css;
}

declare namespace NodeJS {
    interface Process {
        /** Electron: path to the app's resources directory */
        resourcesPath: string;
        type?: "browser" | "renderer" | "worker" | "utility";
    }
}
