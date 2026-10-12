import { useCallback } from "react";

import { useTranslations } from "use-intl";

/**
 * Display text for a value the database stores as a code: an education level
 * ("HIGH_SCHOOL"), a subject ("PHYSICS_CHEM"), a stream, a seeded term name.
 * Records keep the code and never a label, so switching language relabels every
 * screen at once and nothing stored has to change.
 *
 * A code the catalogue does not know — written by an older build, or typed in
 * before a list existed — is shown exactly as stored, rather than as the
 * "Subjects.XYZ" path use-intl renders for a missing key.
 *
 *     const subjectLabel = useCodeLabel("Subjects");
 *     subjectLabel(group.subject); // "الرياضيات" in Arabic, "Mathématiques" in French
 */
export function useCodeLabel(namespace: string) {
  const t = useTranslations(namespace);
  return useCallback((code: string | null | undefined) => (code ? (t.has(code) ? t(code) : code) : ""), [t]);
}
