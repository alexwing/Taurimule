import "./styles/global.css";
import { ThemeManager } from "./lib/theme";
import { I18nManager } from "./lib/i18n";
import { bootApplication } from "./app/boot";

// Initialize Theme & i18n
ThemeManager.initTheme();
I18nManager.initI18n();

bootApplication();
