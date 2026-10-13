/**
 * The views of the tab «الجودة والشكاوى», kept in the address (`?view=`) as the
 * attendance tab keeps its own: a reload, Back and an alert tile's link all
 * land on the right list. Each view keeps its own further parameters
 * (`state`, `id`…) beside it.
 */
export const QUALITY_PATH = "/dashboard/quality";

export const QUALITY_VIEWS = ["inspections", "complaints", "corrective", "problems", "ratings"] as const;
export type QualityView = (typeof QUALITY_VIEWS)[number];

export function readQualityView(search: URLSearchParams): QualityView {
  const view = search.get("view");
  return (QUALITY_VIEWS as readonly string[]).includes(view ?? "") ? (view as QualityView) : "inspections";
}

/** The address of a view, with its own parameters: `qualityHref("complaints", { state: "late" })`. */
export function qualityHref(view: QualityView, params: Record<string, string | null | undefined> = {}): string {
  const search = new URLSearchParams();
  if (view !== "inspections") search.set("view", view);
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const text = search.toString();
  return text ? `${QUALITY_PATH}?${text}` : QUALITY_PATH;
}
