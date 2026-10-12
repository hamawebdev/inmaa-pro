import type { StatusTone } from "@/components/status-chip";
import type { FileStage } from "@/features/clients/validators/option-lists";

/** The tone of a stage's chip: waiting, in progress, signed, over. The word is always his status box's. */
const TONES: Record<FileStage, StatusTone> = {
  NEW: "pending",
  VISIT: "info",
  QUOTE: "warning",
  CONTRACTED: "success",
  CONTRACT_ENDED: "neutral",
};

export function stageTone(stage: FileStage): StatusTone {
  return TONES[stage];
}
