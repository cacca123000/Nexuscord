/* Shared building blocks for the NexusCord settings pages. */
import { h, Fragment, reactive } from "../dom";
import { t, TranslationKey } from "../i18n";
import { getOption, getPlugin, isEnabled, isRunning, NexusPlugin, onPluginsChange, PluginOption, setOption, setPluginEnabled } from "../pluginManager";
import { ColorInput, Icon, Icons, openModal, Select, SettingRow, Slider, Switch, TextInput } from "../ui";
import { onPageCleanup } from "../settingsUI";
import { CATEGORY_ICONS, PLUGIN_ICONS, svgIcon } from "../icons";
void h;
void Fragment;

export function tryT(label: string): string {
    const translated = t(label as TranslationKey);
    return translated === label ? label : translated;
}

export function OptionControl(pluginId: string, key: string, opt: PluginOption): Node {
    const value = getOption<any>(pluginId, key);
    const set = (v: unknown) => setOption(pluginId, key, v);
    switch (opt.type) {
        case "boolean":
            return <Switch checked={!!value} label={t(opt.label)} onChange={set} />;
        case "select":
            return <Select value={value} options={opt.options.map(o => ({ value: o.value, label: tryT(o.label) }))} onChange={set} />;
        case "number":
            return (
                <input
                    className="nc-input"
                    style="width:110px"
                    type="number"
                    min={opt.min}
                    max={opt.max}
                    step={opt.step}
                    value={String(value)}
                    onChange={(e: Event) => {
                        const n = Number((e.target as HTMLInputElement).value);
                        if (Number.isFinite(n)) set(Math.min(opt.max ?? Infinity, Math.max(opt.min ?? -Infinity, n)));
                    }}
                />
            );
        case "slider":
            return <Slider value={Number(value)} min={opt.min} max={opt.max} step={opt.step} unit={opt.unit} onChange={set} />;
        case "string":
            return <TextInput value={String(value ?? "")} placeholder={opt.placeholder} onChange={set} />;
        case "color":
            return <ColorInput value={String(value ?? "")} onChange={set} />;
        case "keybind":
            return <TextInput value={String(value ?? "")} placeholder="Ctrl+Shift+X" onChange={set} />;
        case "text":
            return (
                <textarea
                    className="nc-textarea"
                    style="min-height:90px;font-family:var(--nc-mono);font-size:12.5px"
                    placeholder={opt.placeholder}
                    onChange={(e: Event) => set((e.target as HTMLTextAreaElement).value)}
                >
                    {String(value ?? "")}
                </textarea>
            );
    }
}

/** All options of a plugin as setting rows. Text areas get a full-width row. */
export function OptionRows(p: NexusPlugin): Node {
    const rows = Object.entries(p.options ?? {}).map(([key, opt]) =>
        opt.type === "text" ? (
            <div className="nc-stack" style="gap:6px">
                <div className="nc-row-label">
                    {t(opt.label)}
                    {opt.hint ? <small>{t(opt.hint)}</small> : null}
                </div>
                {OptionControl(p.id, key, opt)}
            </div>
        ) : (
            <SettingRow
                label={t(opt.label)}
                hint={opt.hint ? t(opt.hint) : opt.restartNeeded ? t("plugins.restartNeeded") : undefined}
                control={OptionControl(p.id, key, opt)}
            />
        )
    );
    return (
        <div className="nc-stack">
            {rows}
            {p.settingsPanel ? p.settingsPanel() : null}
        </div>
    );
}

export function openPluginConfig(p: NexusPlugin) {
    const body = <div className="nc-stack" />;
    const dispose = reactive(
        body,
        () => (
            <>
                <p className="nc-sub">{t(p.description)}</p>
                {p.options || p.settingsPanel ? OptionRows(p) : <div className="nc-empty">{t("plugins.noSettings")}</div>}
            </>
        ),
        cb => onPluginsChange(() => {
            // Avoid re-rendering while typing in a text field of this modal
            const a = document.activeElement as HTMLElement | null;
            if (a && body.contains(a) && /INPUT|TEXTAREA/.test(a.tagName)) return;
            cb();
        })
    );
    openModal({ title: t("plugins.configure", { name: t(p.name) }), body, medium: true, onClose: dispose });
}

/** The feature's own icon (falls back to its category's icon). */
export const iconOf = (p: NexusPlugin) => svgIcon(PLUGIN_ICONS[p.id] ?? CATEGORY_ICONS[p.category] ?? "sparkles");

export function PluginCard(p: NexusPlugin): Node {
    const on = isEnabled(p.id);
    return (
        <div className={["nc-card interactive", on && "on"]} data-plugin={p.id}>
            <div className="nc-card-head">
                <div className="nc-card-icon" html={iconOf(p)} />
                <div className="nc-card-title">{t(p.name)}</div>
                {p.required ? <span className="nc-tag accent">{t("plugins.core")}</span> : <Switch checked={on} label={t(p.name)} onChange={v => setPluginEnabled(p.id, v)} />}
            </div>
            <div className="nc-card-desc">{t(p.description)}</div>
            <div className="nc-card-foot">
                {p.tosRisk ? <span className="nc-tag warn" title={t("plugins.tosRiskHint")}>{t("plugins.tosRisk")}</span> : null}
                {on && !isRunning(p.id) ? <span className="nc-tag danger">{t("plugins.notRunning")}</span> : null}
                <span className="nc-spacer" />
                {p.options || p.settingsPanel ? (
                    <button className="nc-btn icon ghost" type="button" title={t("plugins.configure", { name: t(p.name) })} onClick={() => openPluginConfig(p)}>
                        <Icon svg={Icons.gear} />
                    </button>
                ) : null}
            </div>
        </div>
    );
}

/** Inline block (toggle + options) used on the category pages. */
export function PluginBlock(id: string): Node {
    const p = getPlugin(id);
    if (!p) return document.createComment(`missing plugin ${id}`);
    const host = <div className="nc-card" />;
    const dispose = reactive(
        host,
        () => {
            const on = isEnabled(p.id);
            return (
                <>
                    <div className="nc-card-head" style="align-items:center">
                        <div className="nc-card-icon" html={iconOf(p)} />
                        <div style="flex:1;min-width:0">
                            <div className="nc-card-title">{t(p.name)}</div>
                            <div className="nc-card-desc">{t(p.description)}</div>
                        </div>
                        {p.tosRisk ? <span className="nc-tag warn" title={t("plugins.tosRiskHint")}>{t("plugins.tosRisk")}</span> : null}
                        {p.required ? null : <Switch checked={on} label={t(p.name)} onChange={v => setPluginEnabled(p.id, v)} />}
                    </div>
                    {on && (p.options || p.settingsPanel) ? <div style="margin-top:6px">{OptionRows(p)}</div> : null}
                </>
            );
        },
        cb => onPluginsChange(() => {
            const a = document.activeElement as HTMLElement | null;
            if (a && host.contains(a) && /INPUT|TEXTAREA/.test(a.tagName)) return;
            cb();
        })
    );
    onPageCleanup(dispose);
    return host;
}

export function PageHeader(props: { title: string; subtitle: string; icon: string; actions?: Node[] }) {
    return (
        <div className="nc-hero">
            <div className="nc-logo" html={props.icon} />
            <div>
                <h1>{props.title}</h1>
                <p>{props.subtitle}</p>
            </div>
            {props.actions?.length ? <div className="nc-hero-actions">{props.actions}</div> : null}
        </div>
    );
}

export function relTime(ts: number): string {
    if (!ts) return t("common.never");
    const s = Math.round((Date.now() - ts) / 1000);
    const rtf = new Intl.RelativeTimeFormat(document.documentElement?.lang || undefined, { numeric: "auto" });
    if (s < 60) return rtf.format(-s, "second");
    if (s < 3600) return rtf.format(-Math.round(s / 60), "minute");
    if (s < 86400) return rtf.format(-Math.round(s / 3600), "hour");
    return rtf.format(-Math.round(s / 86400), "day");
}
