/*
 * BetterDiscord store plugins that NexusCord already does natively. The store hides them
 * by default ("no duplicates") and points to the built-in feature instead.
 * Key: store plugin name. Value: NexusCord built-in plugin id.
 */
export const BD_DUPLICATES: Record<string, string> = {
    // chat
    Translator: "translate",
    AutoTranslate: "translate",
    DeepTranslate: "translate",
    ReadAllNotificationsButton: "readAllButton",
    PlatformIndicators: "platformIndicators",
    PinDMs: "pinDms",
    CompleteTimestamps: "betterTimestamps",
    ReplaceTimestamps: "betterTimestamps",
    PersonalPins: "bookmarks",
    RemovedConnectionAlerts: "relationshipNotifier",
    Timezones: "timezoneConverter",
    CakeDay: "accountAge",
    enhancecodeblocks: "betterCodeBlocks",
    BetterDoubleClickToEdit: "doubleClickActions",
    DoubleClickToReply: "doubleClickActions",
    MoreDoubleClicks: "doubleClickActions",
    KeywordPing: "keywordAlerts",
    FreeEmojis: "fakeNitro",
    SendStickersAsLinks: "fakeNitro",
    NoReplyPing: "noReplyMention",
    AllowedMentions: "noReplyMention",
    AutoSilentMessage: "silentMessages",
    InsertTimestamps: "sendTimestamps",
    WriteUppercase: "autoCapitalize",
    CharCounter: "charCounter",
    TypingIndicator: "typingIndicator",
    ChatFilter: "chatFilter",
    StaffTag: "staffTag",
    ShowMeYourName: "showMeYourName",
    Copier: "copyTools",
    // privacy
    DoNotTrack: "noTrack",
    Incognito: "noTrack",
    InvisibleTyping: "silentTyping",
    PasscodeLock: "appLock",
    LinkCleaner: "clearUrlsOutgoing",
    FileNameRandomization: "uploadPrivacy",
    BlurNSFW: "blurNsfw",
    // media
    ImageUtilities: "imageViewer",
    BetterImageViewer: "imageViewer",
    NotificationSounds: "customSounds",
    BetterVolume: "volumeBooster",
    CallTimeCounter: "callTimer",
    ExpressionCloner: "emojiCloner",
    // appearance
    TimedLightDarkMode: "themeScheduler",
    BackgroundManager: "backgroundImage",
    // utility
    FriendNotifications: "friendOnline",
    GameActivityToggle: "gameActivityToggle",
    OnlineFriendCount: "onlineFriendCount",
    MemberCount: "memberCount",
    MemberCounter: "memberCount",
    ViewProfilePicture: "viewIcons",
    "High-Res Profile Images": "viewIcons",
    GoogleSearchReplace: "lookUp",
    ADifferentSearch: "lookUp",
    NoF1: "noF1"
};

/** Libraries some store plugins need; installed automatically together with them. */
export const BD_LIBRARIES: { name: string; file: string; detect: RegExp }[] = [{ name: "BDFDB", file: "0BDFDB.plugin.js", detect: /BDFDB_Global|window\.BDFDB\b|BDFDB\.(?:ModuleUtils|PluginUtils)/ }];
/** Libraries that were removed from the store: plugins depending on them can't work. */
export const DEAD_LIBRARIES = /ZeresPluginLibrary|ZLibrary|XenoLib/;
