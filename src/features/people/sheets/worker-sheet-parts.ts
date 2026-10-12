/** Which pages of his worker form a job prints: all four, the registration (1 and 2), or the regulations (3 and 4). */
export const WORKER_SHEET_PARTS = ["all", "registration", "regulations"] as const;
export type WorkerSheetPart = (typeof WORKER_SHEET_PARTS)[number];
