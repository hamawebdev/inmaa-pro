import * as React from "react";

import { BookLock, Ellipsis, KeyRound, LockKeyhole, RefreshCw, Search, Settings2, UserRound } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useLocale, useTranslations } from "use-intl";

import { openCommandPalette } from "@/components/command-palette-open";
import { PasswordChangeDialog } from "@/components/security/password-dialogs";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { leaveSession } from "@/features/core/services/session";
import { SYNC_PATH, syncApi, useMayAskForBooks } from "@/features/sync/api";
import { useInstantText } from "@/features/sync/use-instant-text";
import { isolate } from "@/features/sync/view";
import { useSession } from "@/hooks/use-session";
import { useSyncBar } from "@/hooks/use-sync-bar";
import { useErrorMessage } from "@/i18n/errors";
import { ROLE_CODES, ROLE_LABELS, type RoleCode } from "@/lib/access/catalogue";
import { mayOpenSection } from "@/lib/access/session";
import { cn } from "@/lib/utils";
import {
  getSection,
  resolveSection,
  SECTION_ACCENT,
  SECTIONS,
  type SectionDef,
  type SectionId,
} from "@/navigation/sections";

/**
 * The bottom bar under 768 pixels of width: the director's phone, or a narrow window
 * (docs/phone/DECISION.md section 5). Drawn instead of {@link BottomNav}, never beside it:
 * the layout swaps the two by width, so a laptop's window at its usual size never sees this.
 *
 * Five targets a thumb reaches: the four places he opens most (الرئيسية, طلبات الخدمة,
 * المصاريف, عمال النظافة) and «المزيد», a sheet from the bottom with everything else: the
 * other sections, the search (the Ctrl+K list, which a phone has no keyboard to open), the
 * exchange between the devices, his password, and «قفل الآن».
 *
 * The items are the desktop bar's own: icon over word, the section's hue, the thick rule over
 * the lit one, so the phone reads as the same program.
 */

/** In the bar, in this order. What the role cannot open is left out, and the others share its room. */
const PHONE_BAR_SECTIONS: readonly SectionId[] = ["home", "requests", "money", "workers"];

const itemBase = cn(
  "relative flex min-h-11 min-w-0 flex-1 basis-0 flex-col items-center justify-center gap-1 px-1",
  "transition-colors duration-150 outline-none active:scale-[0.98]",
  "focus-visible:z-10 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-inset",
);

function ItemInner({ icon: Icon, label, active }: { icon: React.ElementType; label: string; active: boolean }) {
  return (
    <>
      <Icon className={cn("shrink-0", active ? "size-7" : "size-6")} strokeWidth={active ? 2.4 : 2} />
      {/* Two lines at most: «طلبات الخدمة» on a 360px phone. */}
      <span className="line-clamp-2 max-w-full text-center text-xs leading-tight tracking-tight">{label}</span>
    </>
  );
}

function Rule({ section, active }: { section: SectionId; active: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "absolute inset-x-0 top-0 h-1.5 transition-opacity",
        SECTION_ACCENT[section].rule,
        active ? "opacity-100" : "opacity-0",
      )}
    />
  );
}

export function PhoneNav({ pathname, className }: { pathname: string; className?: string }) {
  const t = useTranslations("Nav");
  const tPhone = useTranslations("Phone");
  const session = useSession();
  const [moreOpen, setMoreOpen] = React.useState(false);
  const activeSection = resolveSection(pathname);
  const opens = (id: SectionId) => session !== null && mayOpenSection(session, id);
  const inBar = PHONE_BAR_SECTIONS.filter(opens).map(getSection);
  const inMore = SECTIONS.filter((section) => !PHONE_BAR_SECTIONS.includes(section.id) && opens(section.id));
  // «المزيد» is lit while the page on screen is one of the sections it holds.
  const moreActive = activeSection !== undefined && !PHONE_BAR_SECTIONS.includes(activeSection);

  return (
    <nav
      aria-label={t("Sections")}
      data-phone-nav
      className={cn(
        "shrink-0 border-t-[3px] border-border-strong bg-card pb-[max(env(safe-area-inset-bottom),var(--inmaa-inset-bottom,0px))]",
        className,
      )}
    >
      <div className="flex h-chrome-navbar">
        {inBar.map((section, i) => {
          const active = activeSection === section.id;
          const accent = SECTION_ACCENT[section.id];
          return (
            <NavLink
              key={section.id}
              to={section.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                itemBase,
                accent.text,
                active ? cn(accent.fill, "font-bold") : cn(accent.bg, "font-semibold"),
                i > 0 && "border-s-2 border-border",
              )}
            >
              <Rule section={section.id} active={active} />
              <ItemInner icon={section.icon} label={t(section.labelKey)} active={active} />
            </NavLink>
          );
        })}
        <button
          type="button"
          data-phone-more
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen(true)}
          className={cn(
            itemBase,
            "border-s-[3px] border-border-strong font-semibold text-muted-foreground",
            moreActive || moreOpen ? "bg-accent text-foreground" : "hover:bg-accent/60",
          )}
        >
          <ItemInner icon={Ellipsis} label={tPhone("More")} active={moreActive} />
        </button>
      </div>

      <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} sections={inMore} activeSection={activeSection} />
    </nav>
  );
}

/** «المزيد»: the other sections, the search, the exchange, and the way out. */
function MoreSheet({
  open,
  onOpenChange,
  sections,
  activeSection,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sections: readonly SectionDef[];
  activeSection: SectionId | undefined;
}) {
  const t = useTranslations("Nav");
  const tPhone = useTranslations("Phone");
  const tAuth = useTranslations("Auth");
  const locale = useLocale();
  const session = useSession();
  const [passwordOpen, setPasswordOpen] = React.useState(false);

  const labels = (ROLE_CODES as readonly string[]).includes(session?.roleId ?? "")
    ? ROLE_LABELS[session?.roleId as RoleCode]
    : null;
  const role = labels ? (labels[locale as keyof typeof labels] ?? labels.ar) : "";

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          data-phone-more-sheet
          // Nothing lit on opening: a ring on the first button reads as a choice already made.
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="gap-5 rounded-t-2xl border-x-0 border-b-0 px-4 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom),var(--inmaa-inset-bottom,0px))]"
        >
          <SheetHeader>
            <SheetTitle>{tPhone("More")}</SheetTitle>
            <SheetDescription className="sr-only">{tPhone("MoreHint")}</SheetDescription>
          </SheetHeader>

          {sections.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {sections.map((section) => {
                const accent = SECTION_ACCENT[section.id];
                const active = activeSection === section.id;
                return (
                  <NavLink
                    key={section.id}
                    to={section.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => onOpenChange(false)}
                    className={cn(
                      "border-app relative flex min-h-20 min-w-0 flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl px-2 py-3 outline-none",
                      "focus-visible:ring-[3px] focus-visible:ring-ring/40",
                      accent.text,
                      accent.border,
                      active ? cn(accent.fill, "font-bold") : cn(accent.bg, "font-semibold"),
                    )}
                  >
                    <Rule section={section.id} active={active} />
                    <section.icon className="size-7 shrink-0" />
                    <span className="max-w-full truncate text-sm">{t(section.labelKey)}</span>
                  </NavLink>
                );
              })}
            </div>
          )}

          <Button
            variant="outline"
            className="w-full justify-start"
            data-phone-search
            onClick={() => {
              onOpenChange(false);
              openCommandPalette();
            }}
          >
            <Search />
            {tPhone("Search")}
          </Button>

          <SyncBlock onNavigate={() => onOpenChange(false)} />

          {session && (
            <div className="flex min-w-0 flex-col gap-3 rounded-xl border-2 border-border bg-muted/40 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <UserRound className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-base font-bold">{session.userName}</span>
                  {role && <span className="truncate text-sm text-muted-foreground">{role}</span>}
                </span>
              </div>
              <div className="flex flex-col gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    onOpenChange(false);
                    setPasswordOpen(true);
                  }}
                >
                  <KeyRound />
                  {tAuth("ChangePassword")}
                </Button>
                <Button data-lock-now onClick={() => void leaveSession()}>
                  <LockKeyhole />
                  {tAuth("LockNow")}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <PasswordChangeDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
    </>
  );
}

/** Where the exchange stands, as the desktop bar's sync menu says it: only once sync is set up here. */
function SyncBlock({ onNavigate }: { onNavigate: () => void }) {
  const t = useTranslations("Sync");
  const navigate = useNavigate();
  const session = useSession();
  const instant = useInstantText();
  const errorMessage = useErrorMessage();
  const mayAskBooks = useMayAskForBooks();
  const sync = useSyncBar();
  if (!sync) return null;

  const { status, state, tone, icon: Icon, ink } = sync;
  const last = status.lastExchangeAt ? instant(status.lastExchangeAt) : null;
  const books = status.books;
  const revoked = status.exchange === "REVOKED";
  const settingsOpen = session !== null && mayOpenSection(session, "settings");

  async function syncNow() {
    const result = await syncApi.syncNow();
    if (result.success) toast.success(t("SyncNowStarted"));
    else toast.error(errorMessage(result.error, t("SyncNowFailed")));
  }

  async function askForBooks() {
    const result = await syncApi.requestBooks();
    if (result.success) toast.success(t("Devices.RequestBooksDone"));
    else toast.error(errorMessage(result.error, t("Devices.RequestBooksFailed")));
  }

  return (
    <div data-phone-sync={state} className="flex min-w-0 flex-col gap-3 rounded-xl border-2 border-border p-4">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Icon className={cn("size-6 shrink-0", ink)} aria-hidden />
        <StatusChip tone={tone} label={t(`Bar.${state}`)} />
      </div>
      {status.problem && (state === "ATTENTION" || state === "OUTDATED") && (
        <p className="text-sm font-bold">{t(`ProblemTitles.${status.problem}`)}</p>
      )}
      <p className="text-sm text-muted-foreground">
        {last ? t("Bar.Last", { date: last.date, time: isolate(last.time) }) : t("Bar.Never")}
        {" · "}
        {t("Bar.Waiting", { count: status.waitingCount })}
      </p>
      <div className="flex min-w-0 flex-wrap gap-3">
        {!revoked && (
          <Button variant="outline" size="sm" onClick={() => void syncNow()}>
            <RefreshCw />
            {t("SyncNow")}
          </Button>
        )}
        {mayAskBooks && books && !books.heldHere && !books.requestedAt && !revoked && (
          <Button variant="outline" size="sm" onClick={() => void askForBooks()}>
            <BookLock />
            {t("Devices.RequestBooks")}
          </Button>
        )}
        {settingsOpen && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onNavigate();
              navigate(SYNC_PATH);
            }}
          >
            <Settings2 />
            {t("Open")}
          </Button>
        )}
      </div>
    </div>
  );
}
