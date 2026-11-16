/* Clean profiles: hides Shop cosmetics - avatar decorations, profile effects, nameplates. */
import { setStyle } from "../core/dom";
import { definePlugin, getOption } from "../core/pluginManager";

const ID = "noCosmetics";

function css(): string {
    const out: string[] = [];
    if (getOption(ID, "decorations")) out.push('img[src*="avatar-decoration-presets"],[class*="avatarDecoration_"]{display:none!important}');
    if (getOption(ID, "effects")) out.push('[class*="profileEffects_"],img[src*="profile-effect"],video[src*="profile-effect"]{display:none!important}');
    if (getOption(ID, "nameplates")) out.push('img[src*="/nameplates/"],video[src*="/nameplates/"],[class*="nameplated_"]>[class*="container_"]:has(> video, > img[src*="nameplates"]){display:none!important}');
    if (getOption(ID, "superReactions")) out.push('[class*="burstGlow"],[class*="effectsWrapper"] canvas,[class*="superReactionsImage_"]{display:none!important}');
    return out.join("\n");
}

export default definePlugin({
    id: ID,
    name: "plugin.noCosmetics.name",
    description: "plugin.noCosmetics.desc",
    category: "appearance",
    options: {
        decorations: { type: "boolean", label: "plugin.noCosmetics.opt.decorations", default: true },
        effects: { type: "boolean", label: "plugin.noCosmetics.opt.effects", default: true },
        nameplates: { type: "boolean", label: "plugin.noCosmetics.opt.nameplates", default: true },
        superReactions: { type: "boolean", label: "plugin.noCosmetics.opt.superReactions", default: false }
    },
    start() {
        setStyle(ID, css());
    },
    stop() {
        setStyle(ID, null);
    },
    onOptionChange() {
        setStyle(ID, css());
    }
});
