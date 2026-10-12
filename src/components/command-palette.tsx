import * as React from "react";

import { useNavigate } from "react-router-dom";
import { useTranslations } from "use-intl";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { QUICK_ACTIONS } from "@/navigation/quick-actions";
import { SECTIONS } from "@/navigation/sections";

/**
 * Ctrl+K / ⌘K navigation.
 *
 * Its entries are **generated from the section registry** rather than
 * hand-listed. The version this replaces was a static array that had drifted out
 * of sync with the router: it offered `/dashboard/observations`, a route that
 * does not exist and rendered the not-found page, and it was also the only way
 * to reach Settings at all. Deriving it means neither can happen again — a
 * section or tab that exists is offered, and one that does not cannot be.
 *
 * It no longer renders a visible trigger. The header that used to hold one is
 * gone, and every destination it lists is now one click away in the bottom bar
 * or its tab strip; this is the shortcut for people who prefer typing, not the
 * primary way in.
 *
 * Navigating into a locked section is deliberately still allowed — the route
 * gate answers with the unlock screen, which is the correct response and also
 * the discoverable one. Filtering locked sections out of the palette would tell
 * a curious user which sections are worth attacking.
 */

export function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const navigate = useNavigate();
  const t = useTranslations("Nav");
  const tHeader = useTranslations("Header");
  // Quick-action labels live in their own folder's messages, under any namespace.
  const tAny = useTranslations();

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  function go(url: string) {
    setOpen(false);
    navigate(url);
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title={tHeader("CommandDialogTitle")}
      description={tHeader("CommandDialogDescription")}
    >
      <Command>
        <CommandInput placeholder={tHeader("SearchPlaceholder")} />
        <CommandList>
          <CommandEmpty>{tHeader("NoResults")}</CommandEmpty>

          {SECTIONS.map((section, index) => (
            <React.Fragment key={section.id}>
              {index > 0 && <CommandSeparator />}
              <CommandGroup heading={t(section.labelKey)}>
                {/* A section with tabs lists its tabs; one without lists
                    itself, so every section is reachable either way. */}
                {section.tabs ? (
                  section.tabs.map((tab) => (
                    <CommandItem
                      key={tab.href}
                      value={`${t(section.labelKey)} ${t(tab.labelKey)}`}
                      onSelect={() => go(tab.href)}
                    >
                      <section.icon />
                      <span>{t(tab.labelKey)}</span>
                    </CommandItem>
                  ))
                ) : (
                  <CommandItem value={t(section.labelKey)} onSelect={() => go(section.href)}>
                    <section.icon />
                    <span>{t(section.labelKey)}</span>
                  </CommandItem>
                )}
              </CommandGroup>
            </React.Fragment>
          ))}

          {QUICK_ACTIONS.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading={tHeader("QuickActions")}>
                {QUICK_ACTIONS.map((action) => (
                  <CommandItem key={action.href} value={tAny(action.labelKey)} onSelect={() => go(action.href)}>
                    <action.icon />
                    <span>{tAny(action.labelKey)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
