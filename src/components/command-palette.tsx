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
import { useSession } from "@/hooks/use-session";
import { mayOpenSection, sectionCodeOf, sectionLevel } from "@/lib/access/session";
import { QUICK_ACTIONS } from "@/navigation/quick-actions";
import { resolveSection, SECTIONS } from "@/navigation/sections";

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
 * It lists what the signed-in user's role can open, as the bottom bar does:
 * a section it cannot open is left out, and a "new …" entry is offered only
 * where the role may write. The route gate still answers an address reached
 * another way.
 */

export function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const navigate = useNavigate();
  const t = useTranslations("Nav");
  const tHeader = useTranslations("Header");
  // Quick-action labels live in their own folder's messages, under any namespace.
  const tAny = useTranslations();
  const session = useSession();
  const sections = SECTIONS.filter((section) => session !== null && mayOpenSection(session, section.id));
  // A "new …" entry opens a form: it is for a role that may write in that form's section.
  const quickActions = QUICK_ACTIONS.filter((entry) => {
    const code = sectionCodeOf(resolveSection(entry.href) ?? "");
    return session !== null && code !== null && sectionLevel(session, code) === "WRITE";
  });

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

          {sections.map((section, index) => (
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

          {quickActions.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading={tHeader("QuickActions")}>
                {quickActions.map((action) => (
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
