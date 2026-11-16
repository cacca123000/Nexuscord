import type { NexusPlugin } from "../core/pluginManager";
import accountAge from "./accountAge";
import appLock from "./appLock";
import backgroundImage from "./backgroundImage";
import betterCodeBlocks from "./betterCodeBlocks";
import betterTimestamps from "./betterTimestamps";
import bookmarks from "./bookmarks";
import clearUrlsOutgoing from "./clearUrlsOutgoing";
import commandPalette from "./commandPalette";
import copyTools from "./copyTools";
import customFonts from "./customFonts";
import customizer from "./customizer";
import customRpc from "./customRpc";
import customSounds from "./customSounds";
import dataSaver from "./dataSaver";
import declutter from "./declutter";
import doubleClickActions from "./doubleClickActions";
import emojiCloner from "./emojiCloner";
import fakeNitro from "./fakeNitro";
import fancyText from "./fancyText";
import friendOnline from "./friendOnline";
import hideBlocked from "./hideBlocked";
import imageViewer from "./imageViewer";
import keywordAlerts from "./keywordAlerts";
import linkShield from "./linkShield";
import liteMode from "./liteMode";
import localNicknames from "./localNicknames";
import lowRamOptimizer from "./lowRamOptimizer";
import mediaDownloader from "./mediaDownloader";
import messageLogger from "./messageLogger";
import musicPresence from "./musicPresence";
import noTrack from "./noTrack";
import pictureInPicture from "./pictureInPicture";
import pinDms from "./pinDms";
import platformIndicators from "./platformIndicators";
import pluginScanner from "./pluginScanner";
import readAllButton from "./readAllButton";
import relationshipNotifier from "./relationshipNotifier";
import safeModeGuard from "./safeModeGuard";
import scamGuard from "./scamGuard";
import scheduledMessages from "./scheduledMessages";
import showHiddenChannels from "./showHiddenChannels";
import silentTyping from "./silentTyping";
import streamerPlus from "./streamerPlus";
import textSnippets from "./textSnippets";
import themeScheduler from "./themeScheduler";
import timezoneConverter from "./timezoneConverter";
import translate from "./translate";
import uploadPrivacy from "./uploadPrivacy";
import volumeBooster from "./volumeBooster";
import whoReacted from "./whoReacted";
import windowTweaks from "./windowTweaks";
import wrapped from "./wrapped";

/** All built-in plugins (display order inside each category follows this list). */
export const builtInPlugins: NexusPlugin[] = [
    // appearance
    customizer, customFonts, backgroundImage, themeScheduler, windowTweaks,
    // privacy & security
    linkShield, noTrack, appLock, scamGuard, pluginScanner, silentTyping, uploadPrivacy, clearUrlsOutgoing, streamerPlus,
    // chat
    translate, messageLogger, bookmarks, scheduledMessages, textSnippets, keywordAlerts, betterTimestamps, timezoneConverter,
    accountAge, imageViewer, betterCodeBlocks, doubleClickActions, localNicknames, pinDms, hideBlocked, readAllButton,
    platformIndicators, whoReacted, relationshipNotifier, fakeNitro,
    // media
    volumeBooster, customSounds, pictureInPicture, customRpc, musicPresence, mediaDownloader, emojiCloner,
    // performance
    lowRamOptimizer, declutter, liteMode, dataSaver,
    // utility
    commandPalette, copyTools, showHiddenChannels, safeModeGuard,
    // fun
    fancyText, wrapped, friendOnline
];
