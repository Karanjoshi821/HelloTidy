/**
 * Admin light/dark theme. The choice lives in localStorage and shows up as a
 * `dark` class on <html>; the dark colours are scoped to the admin in
 * globals.css, so the storefront never changes.
 */

export type AdminTheme = "light" | "dark";

export const ADMIN_THEME_KEY = "hellotidy-admin-theme";

/** Fired on window whenever the theme changes, so every toggle re-reads it. */
export const ADMIN_THEME_EVENT = "hellotidy-admin-theme";

/**
 * Runs in <head> before the first paint, so a saved dark theme never flashes
 * light on load. Light is the default; the OS setting is not followed.
 */
export const adminThemeScript = `(function(){try{if(localStorage.getItem("${ADMIN_THEME_KEY}")==="dark")document.documentElement.classList.add("dark")}catch(e){}})()`;
