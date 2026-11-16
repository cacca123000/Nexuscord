import { t } from "../i18n";
import { getPlugins } from "../pluginManager";
import { registerPage } from "../settingsUI";
import { Icons } from "../ui";
import { AppearancePage } from "./appearance";
import { HomePage } from "./home";
import { PerformancePage } from "./performance";
import { PluginsPage } from "./plugins";
import { PrivacyPage } from "./privacy";
import { ThemesPage } from "./themes";
import { ToolsPage } from "./tools";

export function registerPages() {
    registerPage({ id: "home", label: "page.home", icon: Icons.logo.replace('stroke="#fff"', 'stroke="currentColor"'), render: HomePage });
    registerPage({ id: "plugins", label: "page.plugins", icon: Icons.puzzle, render: PluginsPage, searchTerms: () => getPlugins().map(p => t(p.name)) });
    registerPage({ id: "themes", label: "page.themes", icon: Icons.brush, render: ThemesPage, searchTerms: () => ["QuickCSS", "CSS", "BetterDiscord"] });
    registerPage({ id: "appearance", label: "page.appearance", icon: Icons.palette, render: AppearancePage });
    registerPage({ id: "privacy", label: "page.privacy", icon: Icons.shield, render: PrivacyPage, searchTerms: () => ["LinkShield", "phishing"] });
    registerPage({ id: "performance", label: "page.performance", icon: Icons.bolt, render: PerformancePage, searchTerms: () => ["RAM", "memory"] });
    registerPage({ id: "tools", label: "page.tools", icon: Icons.wrench, render: ToolsPage, searchTerms: () => ["backup", "update", "safe mode"] });
}
