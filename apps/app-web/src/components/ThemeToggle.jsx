import { useTheme } from "../lib/ThemeContext.jsx";
import Icon from "./Icon.jsx";

// key={theme} forces the icon span to remount on every toggle, which is
// what retriggers the theme-icon-in CSS animation (a plain prop change
// wouldn't restart a `both`-filled animation).
export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      <span key={theme} className="theme-toggle-icon">
        <Icon name={isDark ? "moon" : "sun"} size={17} />
      </span>
    </button>
  );
}
