import type { NexusPlugin } from "../core/pluginManager";
import fakeNitro from "./fakeNitro";
import linkShield from "./linkShield";
import lowRamOptimizer from "./lowRamOptimizer";
import messageLogger from "./messageLogger";
import noTrack from "./noTrack";
import showHiddenChannels from "./showHiddenChannels";
import windowTweaks from "./windowTweaks";

/** Built-in plugins, in display order. */
export const builtInPlugins: NexusPlugin[] = [
    noTrack,
    linkShield,
    lowRamOptimizer,
    messageLogger,
    showHiddenChannels,
    fakeNitro,
    windowTweaks
];
