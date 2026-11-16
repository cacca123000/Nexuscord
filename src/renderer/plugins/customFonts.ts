/* Custom fonts (#5): pick any Google Font for the UI and for code blocks. */
import { setStyle } from "../core/dom";
import { definePlugin, getOption } from "../core/pluginManager";

const ID = "customFonts";
export const UI_FONTS = ["Inter", "Roboto", "Open Sans", "Lato", "Montserrat", "Poppins", "Nunito", "Rubik", "Manrope", "Outfit", "Plus Jakarta Sans", "DM Sans", "Figtree", "Lexend", "Sora", "Space Grotesk", "Quicksand", "Comfortaa", "Ubuntu", "Source Sans 3", "Noto Sans", "Work Sans", "Karla", "Mulish", "Barlow", "Josefin Sans", "Atkinson Hyperlegible", "Lexend Deca", "Comic Neue", "Pixelify Sans"];
export const CODE_FONTS = ["JetBrains Mono", "Fira Code", "Source Code Pro", "IBM Plex Mono", "Roboto Mono", "Space Mono", "Ubuntu Mono", "Inconsolata", "Cascadia Code", "Red Hat Mono"];
const LOCAL = new Set(["Cascadia Code"]);

function apply() {
    const ui = String(getOption(ID, "uiFont") || "");
    const code = String(getOption(ID, "codeFont") || "");
    const families = [ui, code].filter(f => f && !LOCAL.has(f));
    let css = families.length ? `@import url("https://fonts.googleapis.com/css2?${families.map(f => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;500;600;700;800`).join("&")}&display=swap");` : "";
    if (ui) css += `:root{--font-primary:"${ui}",sans-serif;--font-display:"${ui}",sans-serif;--font-headline:"${ui}",sans-serif;--font-sans:"${ui}",sans-serif}body,button,input,textarea,select{font-family:"${ui}",sans-serif}`;
    if (code) css += `:root{--font-code:"${code}",monospace}code,pre,kbd,samp,[class*="codeBlock"]{font-family:"${code}",monospace!important}`;
    setStyle("nc-custom-fonts", css || null);
}

export default definePlugin({
    id: ID,
    name: "plugin.customFonts.name",
    description: "plugin.customFonts.desc",
    category: "appearance",
    options: {
        uiFont: { type: "select", label: "plugin.customFonts.opt.uiFont", default: "", options: [{ label: "plugin.customFonts.default", value: "" }, ...UI_FONTS.map(f => ({ label: f, value: f }))] },
        codeFont: { type: "select", label: "plugin.customFonts.opt.codeFont", default: "", options: [{ label: "plugin.customFonts.default", value: "" }, ...CODE_FONTS.map(f => ({ label: f, value: f }))] }
    },
    start: apply,
    stop: () => setStyle("nc-custom-fonts", null),
    onOptionChange: apply
});
