/**
 * The web app's locale-aware navigation wrappers (next-intl's createNavigation).
 * The desktop app has no locale in the URL — the locale is app state — so these
 * are plain re-exports of the router shims. Kept at the original import path so
 * ported components (`page-shell.tsx` and friends) need no edit.
 */
export { Link, useRouter, usePathname, redirect } from "@/lib/compat/navigation";

export { DEFAULT_LOCALE, LOCALES } from "./config";
