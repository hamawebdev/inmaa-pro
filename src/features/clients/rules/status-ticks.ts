import {
  codesOf,
  FILE_STAGES,
  type ClientSanction,
  type FileStage,
  type FileStatusTick,
} from "../validators/option-lists";

/**
 * Which of the eight boxes of «حالة الملف» are ticked on a file's sheet.
 *
 * His list mixes three things (scope P2, A5), and the sheet ticks one of each:
 *
 *  - who the client is: «قديم» when the file was filled in with the «قديم»
 *    control, «جديد» otherwise;
 *  - where the file stands, once it is past its first stage: «الزيارة»,
 *    «عرض سعر», «متعاقد» or «انتهاء التعاقد». At the first stage nothing more is
 *    ticked: «جديد» or «قديم» already says it;
 *  - a sanction on the client: «متوقف» or «معاقب».
 *
 * A refused quote or a closed file ticks nothing of its own: it keeps the
 * stage it stopped at.
 */
export interface FileStatusFacts {
  stage: FileStage;
  /** The file was filled in from an earlier client with the «قديم» control. */
  isReturning: boolean;
  clientSanction: ClientSanction;
}

export function statusTicks(facts: FileStatusFacts): FileStatusTick[] {
  const ticked = new Set<FileStatusTick>([facts.isReturning ? "OLD" : "NEW"]);
  if (facts.stage !== FILE_STAGES[0]) ticked.add(facts.stage);
  if (facts.clientSanction !== "NONE") ticked.add(facts.clientSanction);
  // In the order his forms print the boxes.
  return codesOf("FILE_STATUS_TICK").filter((tick) => ticked.has(tick));
}
