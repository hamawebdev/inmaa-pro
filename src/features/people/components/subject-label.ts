import { useCallback } from "react";

import { useTranslations } from "use-intl";

/**
 * Who a sanction is on, in words: a worker is written as the workers list
 * writes her, by her role and her sex («عاملة نظافة», «رئيس فريق»), never
 * «عامل(ة) نظافة» when the program knows which. A worker's number says her sex
 * when nothing else does: it ends in F or H.
 */
export function useSubjectLabel() {
  const t = useTranslations("Sanctions");
  const tOptions = useTranslations("Options");
  return useCallback(
    (kind: string, known: { sex?: string | null; role?: string | null; number?: string | null } = {}): string => {
      if (kind !== "WORKER") return t(`Subjects.${kind}`);
      const sex = known.sex ?? (known.number?.endsWith("/F") ? "FEMALE" : known.number?.endsWith("/H") ? "MALE" : null);
      if (!sex) return t("Subjects.WORKER");
      const list = sex === "FEMALE" ? "WorkerRoleFeminine" : "WorkerRole";
      const role = known.role && tOptions.has(`${list}.${known.role}`) ? known.role : "CLEANER";
      return tOptions(`${list}.${role}`);
    },
    [t, tOptions],
  );
}
