/*
 * Extra language packs (#66). English and Italian are complete; these packs translate the
 * navigation, pages and most common UI. Missing keys fall back to English automatically.
 */
import type { TranslationKey } from "./en";

type Pack = Partial<Record<TranslationKey, string>>;

export const es: Pack = {
    "app.tagline": "Mod para Discord todo en uno y ultraligero",
    "app.welcome": "¡NexusCord está activo! Ábrelo en Ajustes de usuario o pulsa Ctrl+Alt+N.",
    "app.restartRequired": "Reinicia Discord para aplicar este cambio.",
    "app.restartNow": "Reiniciar ahora",
    "common.enabled": "Activado", "common.disabled": "Desactivado", "common.close": "Cerrar", "common.cancel": "Cancelar", "common.save": "Guardar",
    "common.confirm": "Confirmar", "common.search": "Buscar...", "common.builtIn": "Integrado", "common.by": "por {author}", "common.copied": "Copiado al portapapeles",
    "common.noResults": "Nada coincide con tu búsqueda.", "common.error": "Algo salió mal: {error}", "common.never": "nunca",
    "page.home": "Resumen", "page.plugins": "Plugins", "page.themes": "Temas", "page.appearance": "Apariencia", "page.privacy": "Privacidad y seguridad", "page.performance": "Rendimiento", "page.tools": "Herramientas y copia",
    "cat.appearance": "Apariencia", "cat.privacy": "Privacidad y seguridad", "cat.chat": "Chat", "cat.media": "Multimedia y voz", "cat.performance": "Rendimiento", "cat.utility": "Utilidades", "cat.fun": "Diversión",
    "plugins.filter.all": "Todos", "plugins.filter.enabled": "Activos", "plugins.filter.disabled": "Inactivos", "plugins.configure": "Configurar {name}", "plugins.tab.builtin": "Integrados", "plugins.tab.store": "Tienda",
    "themes.tab.installed": "Instalados", "themes.tab.store": "Tienda de temas", "themes.openFolder": "Abrir carpeta de temas",
    "store.install": "Instalar", "store.remove": "Quitar", "store.search": "Buscar en la tienda de BetterDiscord…", "store.sortDownloads": "Más descargados", "store.sortLikes": "Más valorados", "store.sortNew": "Actualizados recientemente", "store.sortName": "Nombre",
    "home.activePlugins": "Funciones activas", "home.ram": "RAM de Discord", "home.threatsBlocked": "Amenazas bloqueadas", "home.quickToggles": "Accesos rápidos", "home.notifications": "Centro de notificaciones", "home.commandPalette": "Paleta de comandos", "home.setup": "Configuración guiada", "home.shortcuts": "Ir a",
    "perf.language": "Idioma", "perf.lang.auto": "Automático (como Discord)", "perf.purge": "Vaciar caché", "perf.purged": "Caché vaciada", "perf.ram": "Uso de RAM en tiempo real",
    "palette.placeholder": "Escribe un comando, plugin, tema o página…", "palette.open": "Abrir", "palette.enable": "Activar", "palette.disable": "Desactivar",
    "onboarding.title": "Bienvenido a NexusCord ✨", "onboarding.skip": "Omitir", "onboarding.apply": "Aplicar",
    "tools.restart": "Reiniciar Discord", "tools.safeRestart": "Reiniciar en modo seguro", "tools.export": "Exportar copia", "tools.import": "Importar copia", "tools.checkNow": "Buscar ahora",
    "shield.title.phishing": "Enlace de phishing bloqueado", "shield.goBack": "Volver (recomendado)", "shield.openAnyway": "Abrir de todos modos"
};

export const fr: Pack = {
    "app.tagline": "Mod Discord tout-en-un et ultra-léger",
    "app.welcome": "NexusCord est actif ! Ouvrez-le depuis les Paramètres utilisateur ou appuyez sur Ctrl+Alt+N.",
    "app.restartRequired": "Redémarrez Discord pour appliquer ce changement.",
    "app.restartNow": "Redémarrer",
    "common.enabled": "Activé", "common.disabled": "Désactivé", "common.close": "Fermer", "common.cancel": "Annuler", "common.save": "Enregistrer",
    "common.confirm": "Confirmer", "common.search": "Rechercher...", "common.builtIn": "Intégré", "common.by": "par {author}", "common.copied": "Copié dans le presse-papiers",
    "common.noResults": "Aucun résultat.", "common.error": "Une erreur est survenue : {error}", "common.never": "jamais",
    "page.home": "Vue d'ensemble", "page.plugins": "Plugins", "page.themes": "Thèmes", "page.appearance": "Apparence", "page.privacy": "Confidentialité et sécurité", "page.performance": "Performances", "page.tools": "Outils et sauvegarde",
    "cat.appearance": "Apparence", "cat.privacy": "Confidentialité et sécurité", "cat.chat": "Discussion", "cat.media": "Médias et voix", "cat.performance": "Performances", "cat.utility": "Utilitaires", "cat.fun": "Fun",
    "plugins.filter.all": "Tous", "plugins.filter.enabled": "Actifs", "plugins.filter.disabled": "Inactifs", "plugins.configure": "Configurer {name}", "plugins.tab.builtin": "Intégrés", "plugins.tab.store": "Boutique",
    "themes.tab.installed": "Installés", "themes.tab.store": "Boutique de thèmes", "themes.openFolder": "Ouvrir le dossier des thèmes",
    "store.install": "Installer", "store.remove": "Supprimer", "store.search": "Rechercher dans la boutique BetterDiscord…", "store.sortDownloads": "Les plus téléchargés", "store.sortLikes": "Les plus aimés", "store.sortNew": "Mis à jour récemment", "store.sortName": "Nom",
    "home.activePlugins": "Fonctions actives", "home.ram": "RAM de Discord", "home.threatsBlocked": "Menaces bloquées", "home.quickToggles": "Raccourcis", "home.notifications": "Centre de notifications", "home.commandPalette": "Palette de commandes", "home.setup": "Configuration guidée", "home.shortcuts": "Aller à",
    "perf.language": "Langue", "perf.lang.auto": "Automatique (comme Discord)", "perf.purge": "Vider le cache", "perf.purged": "Cache vidé", "perf.ram": "Utilisation de la RAM en direct",
    "palette.placeholder": "Tapez une commande, un plugin, un thème ou une page…", "palette.open": "Ouvrir", "palette.enable": "Activer", "palette.disable": "Désactiver",
    "onboarding.title": "Bienvenue dans NexusCord ✨", "onboarding.skip": "Passer", "onboarding.apply": "Appliquer",
    "tools.restart": "Redémarrer Discord", "tools.safeRestart": "Redémarrer en mode sans échec", "tools.export": "Exporter la sauvegarde", "tools.import": "Importer une sauvegarde", "tools.checkNow": "Vérifier",
    "shield.title.phishing": "Lien d'hameçonnage bloqué", "shield.goBack": "Revenir (recommandé)", "shield.openAnyway": "Ouvrir quand même"
};

export const de: Pack = {
    "app.tagline": "All-in-one, ultraleichte Discord-Mod",
    "app.welcome": "NexusCord ist aktiv! Öffne es in den Benutzereinstellungen oder drücke Strg+Alt+N.",
    "app.restartRequired": "Starte Discord neu, um diese Änderung anzuwenden.",
    "app.restartNow": "Jetzt neu starten",
    "common.enabled": "Aktiviert", "common.disabled": "Deaktiviert", "common.close": "Schließen", "common.cancel": "Abbrechen", "common.save": "Speichern",
    "common.confirm": "Bestätigen", "common.search": "Suchen...", "common.builtIn": "Integriert", "common.by": "von {author}", "common.copied": "In die Zwischenablage kopiert",
    "common.noResults": "Keine Treffer.", "common.error": "Etwas ist schiefgelaufen: {error}", "common.never": "nie",
    "page.home": "Übersicht", "page.plugins": "Plugins", "page.themes": "Themes", "page.appearance": "Darstellung", "page.privacy": "Datenschutz & Sicherheit", "page.performance": "Leistung", "page.tools": "Werkzeuge & Backup",
    "cat.appearance": "Darstellung", "cat.privacy": "Datenschutz & Sicherheit", "cat.chat": "Chat", "cat.media": "Medien & Sprache", "cat.performance": "Leistung", "cat.utility": "Werkzeuge", "cat.fun": "Spaß",
    "plugins.filter.all": "Alle", "plugins.filter.enabled": "Aktiv", "plugins.filter.disabled": "Inaktiv", "plugins.configure": "{name} konfigurieren", "plugins.tab.builtin": "Integriert", "plugins.tab.store": "Store",
    "themes.tab.installed": "Installiert", "themes.tab.store": "Theme-Store", "themes.openFolder": "Theme-Ordner öffnen",
    "store.install": "Installieren", "store.remove": "Entfernen", "store.search": "Im BetterDiscord-Store suchen…", "store.sortDownloads": "Meiste Downloads", "store.sortLikes": "Beliebteste", "store.sortNew": "Kürzlich aktualisiert", "store.sortName": "Name",
    "home.activePlugins": "Aktive Funktionen", "home.ram": "Discord-RAM", "home.threatsBlocked": "Blockierte Bedrohungen", "home.quickToggles": "Schnellschalter", "home.notifications": "Benachrichtigungen", "home.commandPalette": "Befehlspalette", "home.setup": "Geführte Einrichtung", "home.shortcuts": "Gehe zu",
    "perf.language": "Sprache", "perf.lang.auto": "Automatisch (wie Discord)", "perf.purge": "Cache leeren", "perf.purged": "Cache geleert", "perf.ram": "RAM-Nutzung live",
    "palette.placeholder": "Befehl, Plugin, Theme oder Seite eingeben…", "palette.open": "Öffnen", "palette.enable": "Aktivieren", "palette.disable": "Deaktivieren",
    "onboarding.title": "Willkommen bei NexusCord ✨", "onboarding.skip": "Überspringen", "onboarding.apply": "Übernehmen",
    "tools.restart": "Discord neu starten", "tools.safeRestart": "Im abgesicherten Modus neu starten", "tools.export": "Backup exportieren", "tools.import": "Backup importieren", "tools.checkNow": "Jetzt prüfen",
    "shield.title.phishing": "Phishing-Link blockiert", "shield.goBack": "Zurück (empfohlen)", "shield.openAnyway": "Trotzdem öffnen"
};

export const pt: Pack = {
    "app.tagline": "Mod para Discord tudo-em-um e ultraleve",
    "app.welcome": "O NexusCord está ativo! Abra-o nas Configurações de usuário ou pressione Ctrl+Alt+N.",
    "app.restartRequired": "Reinicie o Discord para aplicar esta alteração.",
    "app.restartNow": "Reiniciar agora",
    "common.enabled": "Ativado", "common.disabled": "Desativado", "common.close": "Fechar", "common.cancel": "Cancelar", "common.save": "Salvar",
    "common.confirm": "Confirmar", "common.search": "Pesquisar...", "common.builtIn": "Integrado", "common.by": "por {author}", "common.copied": "Copiado para a área de transferência",
    "common.noResults": "Nada corresponde à sua pesquisa.", "common.error": "Algo deu errado: {error}", "common.never": "nunca",
    "page.home": "Visão geral", "page.plugins": "Plugins", "page.themes": "Temas", "page.appearance": "Aparência", "page.privacy": "Privacidade e segurança", "page.performance": "Desempenho", "page.tools": "Ferramentas e backup",
    "cat.appearance": "Aparência", "cat.privacy": "Privacidade e segurança", "cat.chat": "Chat", "cat.media": "Mídia e voz", "cat.performance": "Desempenho", "cat.utility": "Utilitários", "cat.fun": "Diversão",
    "plugins.filter.all": "Todos", "plugins.filter.enabled": "Ativos", "plugins.filter.disabled": "Inativos", "plugins.configure": "Configurar {name}", "plugins.tab.builtin": "Integrados", "plugins.tab.store": "Loja",
    "themes.tab.installed": "Instalados", "themes.tab.store": "Loja de temas", "themes.openFolder": "Abrir pasta de temas",
    "store.install": "Instalar", "store.remove": "Remover", "store.search": "Pesquisar na loja do BetterDiscord…", "store.sortDownloads": "Mais baixados", "store.sortLikes": "Mais curtidos", "store.sortNew": "Atualizados recentemente", "store.sortName": "Nome",
    "home.activePlugins": "Funções ativas", "home.ram": "RAM do Discord", "home.threatsBlocked": "Ameaças bloqueadas", "home.quickToggles": "Atalhos rápidos", "home.notifications": "Central de notificações", "home.commandPalette": "Paleta de comandos", "home.setup": "Configuração guiada", "home.shortcuts": "Ir para",
    "perf.language": "Idioma", "perf.lang.auto": "Automático (igual ao Discord)", "perf.purge": "Limpar cache", "perf.purged": "Cache limpo", "perf.ram": "Uso de RAM em tempo real",
    "palette.placeholder": "Digite um comando, plugin, tema ou página…", "palette.open": "Abrir", "palette.enable": "Ativar", "palette.disable": "Desativar",
    "onboarding.title": "Bem-vindo ao NexusCord ✨", "onboarding.skip": "Pular", "onboarding.apply": "Aplicar",
    "tools.restart": "Reiniciar o Discord", "tools.safeRestart": "Reiniciar no modo seguro", "tools.export": "Exportar backup", "tools.import": "Importar backup", "tools.checkNow": "Verificar agora",
    "shield.title.phishing": "Link de phishing bloqueado", "shield.goBack": "Voltar (recomendado)", "shield.openAnyway": "Abrir mesmo assim"
};
