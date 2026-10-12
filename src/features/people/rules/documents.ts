import type { StaffDocumentType } from "@/features/people/validators/staff-codes";

import { addDays, daysBetween, isDate } from "./dates";

/**
 * Which of a person's documents need attention (feature 37, «تواريخ انتهاء
 * الوثائق»): expired, about to expire, or never handed in.
 *
 * The lead time is the setting `alerts.documentExpiryLeadDays` (30), passed in.
 * A document with no expiry date never expires.
 */

export type DocumentState = "VALID" | "EXPIRING" | "EXPIRED" | "NO_EXPIRY" | "MISSING";

export interface HeldDocument {
  type: StaffDocumentType;
  delivered: boolean;
  /** `YYYY-MM-DD`, or null for a document that does not expire. */
  expiryDate: string | null;
}

export interface DocumentCheck {
  type: StaffDocumentType;
  state: DocumentState;
  /** Days until it expires; negative once it has. Null without an expiry date. */
  daysLeft: number | null;
}

/** The state of one document on `today`. It is valid through its expiry date and expired the day after. */
export function documentState(
  document: HeldDocument | undefined,
  today: string,
  leadDays: number,
): DocumentCheck["state"] {
  if (!document || !document.delivered) return "MISSING";
  if (document.expiryDate === null) return "NO_EXPIRY";
  if (!isDate(document.expiryDate) || !isDate(today)) throw new RangeError("dates are written YYYY-MM-DD");
  if (document.expiryDate < today) return "EXPIRED";
  if (document.expiryDate <= addDays(today, leadDays)) return "EXPIRING";
  return "VALID";
}

const URGENCY: Record<DocumentState, number> = { EXPIRED: 0, MISSING: 1, EXPIRING: 2, VALID: 3, NO_EXPIRY: 3 };

/**
 * The documents to follow up for one person: those required and missing,
 * those expired, those about to expire. Most urgent first, then the soonest.
 *
 * Of several copies of one type, the one expiring last is the one that counts
 * (a renewed certificate replaces the old one).
 */
export function documentsToFollow(
  held: readonly HeldDocument[],
  required: readonly StaffDocumentType[],
  today: string,
  leadDays: number,
): DocumentCheck[] {
  const latest = new Map<StaffDocumentType, HeldDocument>();
  for (const document of held) {
    if (!document.delivered) continue;
    const kept = latest.get(document.type);
    const later =
      !kept || (kept.expiryDate !== null && (document.expiryDate === null || document.expiryDate > kept.expiryDate));
    if (later) latest.set(document.type, document);
  }

  const types = [...new Set([...required, ...latest.keys()])];
  return types
    .map((type) => {
      const document = latest.get(type);
      const state = documentState(document, today, leadDays);
      const daysLeft = document?.expiryDate ? daysBetween(today, document.expiryDate) : null;
      return { type, state, daysLeft };
    })
    .filter((check) => check.state === "EXPIRED" || check.state === "EXPIRING" || check.state === "MISSING")
    .sort((a, b) => URGENCY[a.state] - URGENCY[b.state] || (a.daysLeft ?? 0) - (b.daysLeft ?? 0));
}
