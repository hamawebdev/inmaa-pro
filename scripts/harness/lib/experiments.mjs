/**
 * "What if" changes applied in memory while a run is being served. No file in
 * the target is touched, so the scratch copy of the reference stays an exact
 * copy and a before/after pair differs by this one change only.
 */

/**
 * Mounts Radix's DirectionProvider inside the reference's I18nProvider.
 *
 * The reference never mounts it, so every Radix part reads direction "ltr"
 * whatever the language. This is the one-line fix, applied for the "after"
 * shots.
 */
export function mountDirectionProvider() {
  const marker = "{children}\n      </IntlProvider>";
  return {
    name: "harness-experiment-direction-provider",
    enforce: "pre",
    transform(code, id) {
      if (!/\/src\/i18n\/provider\.tsx$/.test(id.split("?")[0])) return null;
      if (code.includes("DirectionProvider")) return null; // Already mounted by the app itself.
      if (!code.includes(marker)) {
        throw new Error("experiment: src/i18n/provider.tsx no longer has the shape this change expects");
      }
      return {
        code:
          `import { DirectionProvider as HarnessDirectionProvider } from "@/components/ui/direction";\n` +
          code.replace(
            marker,
            "<HarnessDirectionProvider dir={directionFor(locale)}>{children}</HarnessDirectionProvider>\n      </IntlProvider>",
          ),
        map: null,
      };
    },
  };
}
