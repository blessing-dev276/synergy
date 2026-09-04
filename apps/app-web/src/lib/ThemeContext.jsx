import { createContext, useCallback, useContext, useEffect, useState } from "react";

// Same shape/conventions as AuthContext: a small provider + hook pair.
// Persists to localStorage and mirrors onto <html data-theme> so tokens.css's
// [data-theme="light"|"dark"] blocks apply. index.html also sets this
// attribute synchronously (inline script, before React/CSS load) using the
// same storage key, so the first paint already has the right theme — this
// effect keeps it in sync after that and on every toggle.
const STORAGE_KEY = "synergy-theme";
const THEME_COLOR = { dark: "#0B1F3A", light: "#F3F6FB" };
// iOS ignores theme-color for its actual status bar (that's Safari's own
// tab bar) -- apple-mobile-web-app-status-bar-style is what a standalone/
// home-screen install reads instead. "black-translucent" lets the dark
// canvas show through with light icons/text; "default" is opaque white
// with dark icons/text, the light-theme equivalent. index.html's inline
// script sets the same two tags before first paint; this keeps them
// correct after every toggle.
const STATUS_BAR_STYLE = { dark: "black-translucent", light: "default" };

function getInitialTheme() {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem(STORAGE_KEY, theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme]);
    document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.setAttribute("content", STATUS_BAR_STYLE[theme]);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
