/* Fancy text (#71): 𝓯𝓪𝓷𝓬𝔂 / 𝐛𝐨𝐥𝐝 / ʇxǝʇ / r̲a̲i̲n̲b̲o̲w̲… - prefix a message with {style} or use the palette. */
import { addCommands } from "./commandPalette";
import { insertText } from "../core/discord";
import { h } from "../core/dom";
import { t } from "../core/i18n";
import { addPreSendHook } from "../core/outgoing";
import { definePlugin } from "../core/pluginManager";
import { openModal } from "../core/ui";

const ID = "fancyText";
let off = () => {};

const A = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const mapRange = (start: number, digits?: number) => (ch: string) => {
    const i = A.indexOf(ch);
    if (i === -1) return ch;
    if (i >= 52) return digits != null ? String.fromCodePoint(digits + i - 52) : ch;
    return String.fromCodePoint(start + (i >= 26 ? i - 26 : i + 26));
};
// Unicode Mathematical Alphanumeric blocks (uppercase first)
const fromBlock = (upper: number, digits?: number) => (s: string) => [...s].map(mapRange(upper, digits)).join("");

const FLIP: Record<string, string> = { a: "ɐ", b: "q", c: "ɔ", d: "p", e: "ǝ", f: "ɟ", g: "ƃ", h: "ɥ", i: "ᴉ", j: "ɾ", k: "ʞ", l: "l", m: "ɯ", n: "u", o: "o", p: "d", q: "b", r: "ɹ", s: "s", t: "ʇ", u: "n", v: "ʌ", w: "ʍ", x: "x", y: "ʎ", z: "z", "?": "¿", "!": "¡", ".": "˙", ",": "'", "'": ",", "(": ")", ")": "(" };

export const STYLES: Record<string, (s: string) => string> = {
    bold: fromBlock(0x1d400, 0x1d7ce),
    italic: s => fromBlock(0x1d434)(s).replace(/\u{1d455}/gu, "ℎ"),
    script: fromBlock(0x1d4d0),
    fraktur: fromBlock(0x1d56c),
    // Reserved code points in the double-struck block live in "Letterlike Symbols"
    double: s => [...fromBlock(0x1d538, 0x1d7d8)(s)].map(c => ({ "\u{1d53a}": "ℂ", "\u{1d53f}": "ℍ", "\u{1d545}": "ℕ", "\u{1d547}": "ℙ", "\u{1d548}": "ℚ", "\u{1d549}": "ℝ", "\u{1d551}": "ℤ" })[c] ?? c).join(""),
    mono: fromBlock(0x1d670, 0x1d7f6),
    small: s => s.toLowerCase().replace(/[a-z]/g, c => "ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ"[c.charCodeAt(0) - 97]),
    wide: s => [...s].map(c => (c >= "!" && c <= "~" ? String.fromCharCode(c.charCodeAt(0) + 0xfee0) : c === " " ? "　" : c)).join(""),
    flip: s => [...s.toLowerCase()].map(c => FLIP[c] ?? c).reverse().join(""),
    underline: s => [...s].map(c => c + "̲").join(""),
    strike: s => [...s].map(c => c + "̶").join(""),
    bubble: s => [...s].map(c => (/[a-z]/.test(c) ? String.fromCodePoint(0x24d0 + c.charCodeAt(0) - 97) : /[A-Z]/.test(c) ? String.fromCodePoint(0x24b6 + c.charCodeAt(0) - 65) : c)).join(""),
    spongebob: s => [...s].map((c, i) => (i % 2 ? c.toUpperCase() : c.toLowerCase())).join("")
};

function openGenerator() {
    const input = h("input", { className: "nc-input", style: "width:100%", placeholder: t("plugin.fancyText.placeholder") }) as HTMLInputElement;
    const list = h("div", { className: "nc-stack" });
    let modal: { close: () => void } | null = null;
    const draw = () =>
        list.replaceChildren(
            ...Object.entries(STYLES).map(([name, fn]) => {
                const out = fn(input.value || "NexusCord");
                return h("div", { className: "nc-row", style: "padding:8px 12px;cursor:pointer", onClick: () => (insertText(out), modal?.close()) }, h("span", { className: "nc-tag" }, name), h("div", { className: "nc-row-label", style: "font-weight:400;font-size:16px" }, out));
            })
        );
    input.addEventListener("input", draw);
    draw();
    modal = openModal({ title: t("plugin.fancyText.name"), body: h("div", { className: "nc-stack" }, input, h("p", { className: "nc-sub", style: "margin:0" }, t("plugin.fancyText.hint")), list), medium: true });
    setTimeout(() => input.focus(), 50);
}

addCommands(() => [{ icon: "wand", label: t("plugin.fancyText.open"), kind: t("palette.kind.action"), run: openGenerator }]);

export default definePlugin({
    id: ID,
    name: "plugin.fancyText.name",
    description: "plugin.fancyText.desc",
    category: "fun",
    start() {
        off = addPreSendHook(ID, ({ message }) => {
            const m = /^\{(\w+)\}\s*([\s\S]+)$/.exec(message.content);
            if (m && STYLES[m[1].toLowerCase()]) message.content = STYLES[m[1].toLowerCase()](m[2]);
        }, 20);
    },
    stop: () => off()
});
