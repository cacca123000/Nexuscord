/* Themes page: installed BD themes, theme store, QuickCSS+ editor. */
import { createView, h, Fragment } from "../dom";
import { svgIcon } from "../icons";
import { t } from "../i18n";
import { Native } from "../native";
import { onPageCleanup } from "../settingsUI";
import { Settings } from "../settings";
import { ThemeEngine } from "../themeEngine";
import { Button, Icons, SearchBox, SettingRow, Switch, Tabs, toast } from "../ui";
import { StoreView } from "./store";
void h;
void Fragment;

type Tab = "installed" | "store" | "quickcss";
const state = { tab: "installed" as Tab, q: "" };

// ---------------------------------------------------------------------------
// QuickCSS+ editor: highlighted overlay, var(--) autocomplete, live syntax check
// ---------------------------------------------------------------------------
function escapeHtml(s: string) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function highlightCss(css: string): string {
    return escapeHtml(css)
        .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="c">$1</span>')
        .replace(/(@[\w-]+)/g, '<span class="a">$1</span>')
        .replace(/(--[\w-]+)/g, '<span class="v">$1</span>')
        .replace(/(#[0-9a-fA-F]{3,8})\b/g, '<span class="n" style="--sw:$1">$1</span>')
        .replace(/([\w-]+)(\s*:)(?![^{]*\{)/g, '<span class="p">$1</span>$2')
        .replace(/("[^"\n]*"|'[^'\n]*')/g, '<span class="s">$1</span>')
        .replace(/\b(\d+(?:\.\d+)?)(px|rem|em|%|s|ms|deg|vh|vw)?\b/g, '<span class="n">$1$2</span>');
}

let cssVarCache: string[] | null = null;
function discordCssVars(): string[] {
    if (cssVarCache) return cssVarCache;
    const vars = new Set<string>();
    for (const sheet of [...document.styleSheets]) {
        let rules: CSSRuleList;
        try {
            rules = sheet.cssRules;
        } catch {
            continue;
        }
        for (const r of [...rules]) {
            const style = (r as CSSStyleRule).style;
            if (!style) continue;
            for (let i = 0; i < style.length; i++) if (style[i].startsWith("--")) vars.add(style[i]);
        }
    }
    return (cssVarCache = [...vars].sort());
}

function checkCss(css: string): string | null {
    const opens = (css.match(/\{/g) ?? []).length;
    const closes = (css.match(/\}/g) ?? []).length;
    if (opens !== closes) return t("quickcss.braces", { open: opens, close: closes });
    try {
        new CSSStyleSheet().replaceSync(css.replace(/@import[^;]+;/g, ""));
    } catch (e) {
        return String((e as Error).message);
    }
    return null;
}

export function QuickCssEditor(): Node {
    const hl = <pre className="nc-qc-hl" aria-hidden="true" />;
    const status = <div className="nc-sub" style="min-height:18px" />;
    const suggest = <div className="nc-qc-suggest" style="display:none" />;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const ta = (
        <textarea className="nc-qc-ta" spellcheck="false" data-focus-key="quickcss" placeholder="/* .theme-dark { --background-base-lowest: #0b0d14; } */" />
    ) as HTMLTextAreaElement;
    ta.value = ThemeEngine.getQuickCss();

    const paint = () => {
        hl.innerHTML = highlightCss(ta.value) + "\n";
        const err = checkCss(ta.value);
        status.textContent = err ? `${err}` : `${t("quickcss.valid", { lines: ta.value.split("\n").length })}`;
        status.style.color = err ? "var(--nc-warn)" : "var(--nc-ok)";
    };
    const showSuggest = () => {
        const before = ta.value.slice(0, ta.selectionStart);
        const m = /var\(\s*(--[\w-]*)$/.exec(before) ?? /(--[\w-]{2,})$/.exec(before);
        if (!m) return void (suggest.style.display = "none");
        const prefix = m[1];
        const opts = discordCssVars().filter(v => v.startsWith(prefix) && v !== prefix).slice(0, 8);
        if (!opts.length) return void (suggest.style.display = "none");
        suggest.replaceChildren(
            ...opts.map(v =>
                h("div", {
                    className: "nc-qc-opt",
                    onMouseDown: (e: MouseEvent) => {
                        e.preventDefault();
                        ta.setRangeText(v.slice(prefix.length), ta.selectionStart, ta.selectionStart, "end");
                        suggest.style.display = "none";
                        ta.dispatchEvent(new Event("input"));
                    }
                }, v)
            )
        );
        suggest.style.display = "block";
    };

    ta.addEventListener("input", () => {
        paint();
        showSuggest();
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => ThemeEngine.setQuickCss(ta.value), 250);
    });
    ta.addEventListener("scroll", () => {
        hl.scrollTop = ta.scrollTop;
        hl.scrollLeft = ta.scrollLeft;
    });
    ta.addEventListener("blur", () => setTimeout(() => (suggest.style.display = "none"), 150));
    ta.addEventListener("keydown", e => {
        if (e.key === "Tab") {
            e.preventDefault();
            const first = suggest.style.display === "block" ? suggest.querySelector<HTMLElement>(".nc-qc-opt") : null;
            if (first) return first.dispatchEvent(new MouseEvent("mousedown"));
            ta.setRangeText("    ", ta.selectionStart, ta.selectionEnd, "end");
            ta.dispatchEvent(new Event("input"));
        } else if (e.key === "Escape") suggest.style.display = "none";
    });
    paint();
    return (
        <div className="nc-stack">
            <div className="nc-qc">
                {hl}
                {ta}
                {suggest}
            </div>
            {status}
        </div>
    );
}

function Installed(redraw: () => void) {
    const q = state.q.trim().toLowerCase();
    const themes = ThemeEngine.getThemes().filter(th => !q || `${th.meta.name} ${th.meta.description} ${th.meta.author}`.toLowerCase().includes(q));
    return (
        <>
            <div className="nc-toolbar">
                <SearchBox value={state.q} placeholder={t("common.search")} focusKey="theme-search" onInput={v => ((state.q = v), redraw())} />
                <Button icon={Icons.folder} onClick={() => Native.shell.openFolder("themes")}>{t("themes.openFolder")}</Button>
            </div>
            <p className="nc-sub">{t("themes.subtitle")}</p>
            {themes.length ? (
                <div className="nc-grid">
                    {themes.map(th => {
                        const on = ThemeEngine.isEnabled(th.file);
                        return (
                            <div className={["nc-card interactive", on && "on"]}>
                                <div className="nc-card-head">
                                    <div className="nc-card-icon" html={svgIcon("brush")} />
                                    <div className="nc-card-title">{th.meta.name}</div>
                                    <Switch checked={on} label={th.meta.name} onChange={v => ThemeEngine.setEnabled(th.file, v)} />
                                </div>
                                <div className="nc-card-desc">{th.meta.description}</div>
                                <div className="nc-card-foot">
                                    <span className="nc-tag">v{th.meta.version}</span>
                                    <span className="nc-sub" style="font-size:12px">{t("common.by", { author: th.meta.author })}</span>
                                    <span className="nc-spacer" />
                                    <Button
                                        variant="icon"
                                        title={t("store.remove")}
                                        icon={Icons.trash}
                                        onClick={async () => {
                                            await Native.addons.remove("theme", th.file);
                                            toast(t("store.removed", { name: th.meta.name }), "success");
                                        }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="nc-empty">{ThemeEngine.getThemes().length ? t("common.noResults") : t("themes.empty")}</div>
            )}
        </>
    );
}

let storeNode: Node | null = null;
let editorNode: Node | null = null;
const view = createView(() => {
    const tabs = (
        <Tabs
            value={state.tab}
            tabs={[
                { id: "installed", label: t("themes.tab.installed"), count: ThemeEngine.getThemes().length },
                { id: "store", label: t("themes.tab.store") },
                { id: "quickcss", label: t("themes.quickCss") }
            ]}
            onChange={v => ((state.tab = v), (state.q = ""), view.redraw())}
        />
    );
    let body: Node;
    if (state.tab === "store") body = (storeNode ??= StoreView("theme"));
    else if (state.tab === "quickcss") {
        editorNode ??= QuickCssEditor();
        body = (
            <div className="nc-stack">
                <SettingRow
                    label={t("themes.quickCssEnable")}
                    hint={t("themes.quickCssHint")}
                    control={<Switch checked={Settings.get().quickCssEnabled} onChange={v => ThemeEngine.setQuickCssEnabled(v)} />}
                />
                {editorNode}
            </div>
        );
    } else body = Installed(view.redraw);
    return (
        <div className="nc-stack" style="gap:14px">
            {tabs}
            {body}
        </div>
    );
});

export function ThemesPage(): Node {
    storeNode = editorNode = null;
    view.redraw();
    const off = ThemeEngine.onChange(() => {
        if ((document.activeElement as HTMLElement | null)?.dataset.focusKey === "quickcss") return;
        view.redraw();
    });
    onPageCleanup(off);
    return view.host;
}
