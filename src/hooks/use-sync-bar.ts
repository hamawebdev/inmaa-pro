import { CloudAlert, CloudCheck, CloudDownload, CloudOff, CloudUpload, type LucideIcon } from "lucide-react";

import type { StatusTone } from "@/components/status-chip";
import { useSyncStatus } from "@/features/sync/api";
import { barState, type SyncBarState } from "@/features/sync/view";
import { programClock } from "@/lib/service/program";
import type { SyncStatus } from "@/lib/sync/services/types";

const BAR_ICONS: Record<SyncBarState, LucideIcon> = {
  SYNCED: CloudCheck,
  SENDING: CloudUpload,
  OFFLINE: CloudOff,
  LIMIT: CloudAlert,
  CATCHING_UP: CloudDownload,
  ATTENTION: CloudAlert,
};

/** The word and the icon wear the tone's own ink, as `StatusChip` does. */
const TONE_TEXT: Record<StatusTone, string> = {
  success: "text-success",
  progress: "text-progress",
  neutral: "text-muted-foreground",
  pending: "text-foreground/75",
  info: "text-info",
  warning: "text-warning-ink",
  danger: "text-destructive",
};

/**
 * The sync status for the bar: null until sync is set up on this laptop (the
 * bar then shows nothing new). Read every 15 seconds.
 */
export function useSyncBar(): {
  status: SyncStatus;
  state: SyncBarState;
  tone: StatusTone;
  icon: LucideIcon;
  ink: string;
} | null {
  const status = useSyncStatus();
  if (!status.data) return null;
  const bar = barState(status.data, programClock().now().getTime());
  if (!bar) return null;
  return { status: status.data, ...bar, icon: BAR_ICONS[bar.state], ink: TONE_TEXT[bar.tone] };
}
