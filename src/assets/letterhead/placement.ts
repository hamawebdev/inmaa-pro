import footerSrc from "./footer.jpeg";
import headerSrc from "./header.png";

/**
 * The centre's letterhead, as his Word files place it.
 *
 * The six Word forms carry the same two pictures, byte for byte, and place them
 * in two ways: one for the worker registration form, one for the five client
 * forms (requests and contracts). The facts are the Checker's, in
 * docs/checker/forms/00-letterhead.md; this file is their copy for the program.
 *
 * Three things a printed sheet must respect:
 *
 *  - **The pictures are stretched.** Word shows both at a size that is not
 *    their natural proportion (the header at 63% of its height on the worker
 *    form and 56% on the others). Printing "in the layout of his Word file"
 *    means drawing them at exactly these sizes, not restoring the proportion.
 *  - **Positions are from the paper's physical top-left corner**, in
 *    millimetres, whatever the direction of the text. The vertical ones are
 *    estimates (see the Checker's file).
 *  - **They sit in front of the text and push nothing**, and they come within
 *    1 to 5 mm of the paper's edges, so a printer's unprintable margin clips
 *    them, as it does when he prints from Word.
 *
 * The pictures are his: the footer's wording, typo included, prints as it is.
 * They are about 131 and 108 dots per inch at the placed size, so they are as
 * soft on paper as they are from Word.
 */

export type FormFamily = "worker" | "client";

export interface PlacedPicture {
  src: string;
  /** Placed size, in millimetres. Not the picture's own proportion. */
  widthMm: number;
  heightMm: number;
  /** From the left edge of the paper, in millimetres. */
  leftMm: number;
  /** From the top edge of the paper, in millimetres. */
  topMm: number;
}

export interface Letterhead {
  header: PlacedPicture;
  footer: PlacedPicture;
}

export const LETTERHEAD: Record<FormFamily, Letterhead> = {
  // "-01- تسجيل عامل نظافة"
  worker: {
    header: { src: headerSrc, widthMm: 202.1, heightMm: 26.5, leftMm: 5.1, topMm: 1.9 },
    footer: { src: footerSrc, widthMm: 207.5, heightMm: 16, leftMm: 1.6, topMm: 280.7 },
  },
  // The building contract, and the request and contract forms for organisations and homes.
  client: {
    header: { src: headerSrc, widthMm: 202, heightMm: 23.3, leftMm: 5, topMm: 1.8 },
    footer: { src: footerSrc, widthMm: 207.5, heightMm: 16, leftMm: 1.3, topMm: 282.8 },
  },
};
