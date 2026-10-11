# Layout facts: letterhead and footer

Written by `docs/checker/tools/build_forms.py`. The six Word files carry the same two pictures, byte for byte; they place them in two ways, one for the worker form and one for the five client forms.

| | Header picture | Footer picture |
|---|---|---|
| Copy for builders | `docs/checker/assets/letterhead-header.png` | `docs/checker/assets/letterhead-footer.jpeg` |
| Inside each .docx | `word/media/image1.png` | `word/media/image2.jpeg` |
| Pixels | 1040 × 216 | 883 × 75 |
| SHA-256 | `895f13b5d8e3b168…` | `1d2fe4d4b21aa48d…` |
| Words in the picture, read by eye | مركز إنماء برو / للتدريب والتنظيف والإحصاء / UNMAA Pro Center / ثقتكم ... أساس نجاحنا | مركز إنماء للخمات - INMAA services center / مركز إنماء برو UNMAA Pro Center / Tel/WhatsApp: 06.59.53.81.83 / Gmail: unmaapro.center@gmail.com |
| Cropping | none | none |
| Wrapping | none: in front of the text, nothing is pushed | the same |

## Placement per form

Horizontal offsets are from the left edge of the text area; vertical offsets from the top of the header or footer paragraph. Positions from the paper edges follow from the margins; the vertical ones are **estimated** (they assume one empty 11 pt line in the header and footer, as in the file).

| Form | Picture | Placed size | Of natural height | Offset h, v | Left, right gap to paper edge | Top, bottom from top of paper (**estimated**) |
|---|---|---|---|---|---|---|
| W | header | 202.1 × 26.5 mm | 63% | -2.4, -10.6 mm | 5.1, 2.8 mm | 1.9, 28.3 mm |
| W | footer | 207.5 × 16 mm | 91% | -5.9, -6.9 mm | 1.6, 0.9 mm | 280.7, 296.8 mm |
| B | header | 202 × 23.3 mm | 56% | -7.7, -10.7 mm | 5, 3 mm | 1.8, 25.1 mm |
| B | footer | 207.5 × 16 mm | 91% | -11.4, 0.2 mm | 1.3, 1.2 mm | 282.8, 298.8 mm |
| OR | header | 202 × 23.3 mm | 56% | -7.7, -10.7 mm | 5, 3 mm | 1.8, 25.1 mm |
| OR | footer | 207.5 × 16 mm | 91% | -11.4, 0.2 mm | 1.3, 1.2 mm | 282.8, 298.8 mm |
| OC | header | 202 × 23.3 mm | 56% | -7.7, -10.7 mm | 5, 3 mm | 1.8, 25.1 mm |
| OC | footer | 207.5 × 16 mm | 91% | -11.4, 0.2 mm | 1.3, 1.2 mm | 282.8, 298.8 mm |
| HR | header | 202 × 23.3 mm | 56% | -7.7, -10.7 mm | 5, 3 mm | 1.8, 25.1 mm |
| HR | footer | 207.5 × 16 mm | 91% | -11.4, 0.2 mm | 1.3, 1.2 mm | 282.8, 298.8 mm |
| HC | header | 202 × 23.3 mm | 56% | -7.7, -10.7 mm | 5, 3 mm | 1.8, 25.1 mm |
| HC | footer | 207.5 × 16 mm | 91% | -11.4, 0.2 mm | 1.3, 1.2 mm | 282.8, 298.8 mm |

## What a builder needs to know

- Print both pictures at their placed size, stretched as placed (CLAUDE.md rule 4: print reproduces his Word file). Do not restore the natural proportions.
- The placed size and the offsets differ between the worker form and the five client forms: take them from the table above, per form.
- Both pictures are in front of the text and push nothing. The first body paragraph of every form is empty: it is the spacer under the letterhead.
- The header picture starts about 2 mm from the top edge and both pictures come within 1 to 5 mm of the side edges. The footer picture ends at the bottom edge on the worker form and about 2 mm past it on the client forms (**estimated**). Most printers leave 3 to 5 mm unprinted, so the edges of both pictures will be clipped on paper; say so to the developer when he compares (K4).
- The footer carries a phone number and an e-mail address as part of the picture. They are pixels, not links; nothing opens.
- «للخمات» is a typo inside the footer picture (F10). The picture is his; it prints as it is.
- The same two files are in all six .docx archives (same SHA-256). The copies in `docs/checker/assets/` are those bytes.
- Printing happens on every page of every sheet, the complexes copy included.
