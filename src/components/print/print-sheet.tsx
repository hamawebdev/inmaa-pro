import { Children, Fragment, isValidElement, useEffect, useState } from "react";

import { Printer } from "lucide-react";
import { createPortal } from "react-dom";
import { useTranslations } from "use-intl";

import { LETTERHEAD, type FormFamily, type PlacedPicture } from "@/assets/letterhead/placement";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import "./print-sheet.css";
import { SHEET_FONT, type SheetFont, type SheetMargins } from "./sheet-constants";
import { PageBreak } from "./sheet-elements";

/**
 * The A4 print sheet: what every printed form, contract, order, invoice and
 * slip in this program is drawn on.
 *
 *     <DetailScreen section="workers" title={…} back={…} actions={<PrintButton />}>
 *       <PrintSheet letterhead="worker" margins={SHEET_MARGINS.worker}>
 *         …the sheet, built from the elements in ./sheet-elements.tsx…
 *       </PrintSheet>
 *     </DetailScreen>
 *
 * ## What it guarantees
 *
 *  - **A4, with the margins the sheet asks for**, on every page: text that
 *    runs onto a second page starts where his top margin says.
 *  - **His letterhead**, when asked for: header and footer on every page, at
 *    the size and place his Word files give them for that family of forms.
 *  - **Only the sheet prints.** Not the screen heading, the back link, the
 *    bottom bar or anything else on the screen.
 *  - **White paper, black ink**, whatever the theme; shading and borders reach
 *    paper with the print dialog's default settings.
 *  - **Arabic, right to left**, whatever the language of the interface.
 *
 * ## How
 *
 * The sheet is rendered twice. One copy is the preview you see on the screen.
 * The other is placed outside the app, in `#print-root` (index.html), and is
 * the only thing shown to the printer. That is what makes "only the sheet
 * prints" true by construction rather than by a list of things to hide.
 *
 * Because it is rendered twice, a sheet must be a pure picture of its data: no
 * state, no effects, no ids that must be unique.
 *
 * ## Inside a sheet
 *
 * Sizes are millimetres and points, in `style`. Do not use Tailwind classes or
 * rem units inside a sheet: the app's type scale follows the window size, and
 * paper must not. Put digits that are read left to right (phones, dates,
 * numbers) inside `<Ltr>`, as on screen.
 *
 * `<PageBreak />` starts a new page. It must be a direct child of the sheet,
 * between its blocks (see its own note).
 *
 * The preview is one long sheet with those page breaks marked as dashed lines.
 * Where a long block runs onto the next page by itself is decided by the print
 * engine and not shown in the preview: check a long sheet with
 * `npm run pdf -- --route … --png`.
 */

const PAPER_MM = { portrait: { width: 210, height: 297 }, landscape: { width: 297, height: 210 } };

/** How many sheets are mounted, so that one leaving does not switch printing off for another. */
let mountedSheets = 0;

function Picture({
  picture,
  role,
  paper,
}: {
  picture: PlacedPicture;
  role: "header" | "footer";
  paper: { width: number; height: number };
}) {
  // His footer runs a little past the bottom edge of the paper. On paper the
  // part beyond the edge must simply be lost; left alone, the print engine
  // would carry it over to the top of the next page. So the picture sits in a
  // box that ends where the paper ends.
  const visibleWidth = Math.min(picture.widthMm, paper.width - picture.leftMm);
  const visibleHeight = Math.min(picture.heightMm, paper.height - picture.topMm);
  return (
    <div
      className={cn("sheet-letterhead", `sheet-letterhead-${role}`)}
      style={
        {
          width: `${visibleWidth}mm`,
          height: `${visibleHeight}mm`,
          "--at-left": `${picture.leftMm}mm`,
          "--at-top": `${picture.topMm}mm`,
          "--from-bottom": `${Math.max(0, paper.height - picture.topMm - picture.heightMm)}mm`,
        } as React.CSSProperties
      }
    >
      <img src={picture.src} alt="" style={{ width: `${picture.widthMm}mm`, height: `${picture.heightMm}mm` }} />
    </div>
  );
}

export function PrintSheet({
  letterhead = null,
  margins,
  font = "traditional",
  landscape = false,
  children,
}: {
  /** Whose letterhead placement to use, or none for a sheet without it. */
  letterhead?: FormFamily | null;
  margins: SheetMargins;
  /** The face of the running text. Single runs can differ: see `SHEET_FONT`. */
  font?: SheetFont;
  landscape?: boolean;
  children: React.ReactNode;
}) {
  // Looked up once. It is in index.html; a window without it (the lock window)
  // simply has no print copy.
  const [printRoot] = useState(() => document.getElementById("print-root"));

  useEffect(() => {
    mountedSheets += 1;
    document.documentElement.setAttribute("data-print-sheet", "");
    return () => {
      mountedSheets -= 1;
      if (mountedSheets === 0) document.documentElement.removeAttribute("data-print-sheet");
    };
  }, []);

  const paper = landscape ? PAPER_MM.landscape : PAPER_MM.portrait;
  const pictures = letterhead ? LETTERHEAD[letterhead] : null;
  const style = {
    "--sheet-font": SHEET_FONT[font],
    "--sheet-margin-top": `${margins.top}mm`,
    "--sheet-margin-right": `${margins.right}mm`,
    "--sheet-margin-bottom": `${margins.bottom}mm`,
    "--sheet-margin-left": `${margins.left}mm`,
  } as React.CSSProperties;

  // The sheet's blocks, cut at each <PageBreak />. Each run starts on a new
  // page and may itself flow over several.
  const runs: React.ReactNode[][] = [[]];
  for (const child of Children.toArray(children)) {
    if (isValidElement(child) && child.type === PageBreak) runs.push([]);
    else runs[runs.length - 1].push(child);
  }

  const sheet = (copy: "preview" | "print") => (
    // Always Arabic and right to left: a printed form does not follow the
    // language of the interface.
    <div dir="rtl" lang="ar" className={cn("sheet", `sheet-${copy}`, landscape && "sheet-landscape")} style={style}>
      {pictures && <Picture picture={pictures.header} role="header" paper={paper} />}
      {runs.map((run, index) =>
        copy === "preview" ? (
          <Fragment key={index}>
            {index > 0 && <div className="sheet-page-break" />}
            {run}
          </Fragment>
        ) : (
          // The head and foot of this table are the top and bottom margins, and
          // the print engine repeats them on every page the run flows onto. One
          // table per run: a break forced from *inside* a table stops its foot
          // from being repeated. See print-sheet.css.
          <table key={index} className={cn("sheet-frame", index < runs.length - 1 && "sheet-frame-then-break")}>
            <thead>
              <tr>
                <td />
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{run}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td />
              </tr>
            </tfoot>
          </table>
        ),
      )}
      {pictures && <Picture picture={pictures.footer} role="footer" paper={paper} />}
    </div>
  );

  return (
    <>
      {/* The paper. No page margin: the sheet draws its own, so that the
          letterhead can reach the edges. One sheet is printed at a time. */}
      <style>{`@page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 0; }`}</style>
      <div className="sheet-preview-frame">{sheet("preview")}</div>
      {printRoot && createPortal(sheet("print"), printRoot)}
    </>
  );
}

/** The button that prints the sheet on the screen. Put it in the screen's `actions`. */
export function PrintButton({ label }: { label?: string }) {
  const t = useTranslations("Print");
  return (
    <Button type="button" variant="info" onClick={() => window.print()}>
      <Printer />
      {label ?? t("Print")}
    </Button>
  );
}
