import { Info, OctagonAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import { useTranslations } from "use-intl";

import { cn } from "@/lib/utils";

import type { EntryNote, NoteTone } from "./visit-entry/visit-entry-notes";

/**
 * Notes shown beside a field: what a rule says about what was typed, or what
 * saving will do. Never a refusal: those are the field's errors.
 *
 * Like `StatusChip`, each note says itself three ways: a colour, an icon and
 * a sentence. The colour is never the only signal.
 */
const TONES: Record<NoteTone, { icon: LucideIcon; className: string }> = {
  info: { icon: Info, className: "text-info" },
  warning: { icon: TriangleAlert, className: "text-warning-ink" },
  danger: { icon: OctagonAlert, className: "text-destructive" },
};

export function RuleNotes({ notes, className }: { notes: readonly EntryNote[]; className?: string }) {
  const t = useTranslations("VisitEntry.Notes");
  if (notes.length === 0) return null;
  return (
    <ul className={cn("space-y-1", className)}>
      {notes.map((note) => {
        const { icon: Icon, className: toneClass } = TONES[note.tone];
        return (
          <li key={note.code} className={cn("flex min-w-0 items-start gap-1.5 text-sm font-semibold", toneClass)}>
            <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0">{t(note.code, note.values)}</span>
          </li>
        );
      })}
    </ul>
  );
}
