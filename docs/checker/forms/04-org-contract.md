# Layout facts: organisation contract

Word file: `client docs/-02- مؤسسة - عقد.docx`. Print sheet: organisation contract sheet.

Read from the Word XML by `docs/checker/tools/build_forms.py`; do not edit by hand. Nothing here was seen rendered: this machine has no Word. A fact that depends on Word's rendering is marked **estimated**. Conventions and units are in `README.md`; every cell and run is in `docs/checker/data/04-org-contract.json`. Ids (`T1.r2.c1`, `P2`, `P2.box`) are the ones in the Source column of `docs/checker-table.md`.

## 1. Source

| | |
|---|---|
| SHA-256 | `e3adf1335be7dd3778ab60a3a181df99caaf0f1aab0cfee561fe344ead5b81ca` |
| Saved by | Microsoft Office Word, version 12.0000 (Word 2007 format) |
| Created, last saved | 2026-09-22T07:23:00Z, 2026-10-10T14:50:00Z |
| Pages recorded by Word | 1 (**estimated**: file metadata, not a rendering) |
| Explicit page breaks | none |
| Page-break markers left by Word's last layout | none |

## 2. Page

A4 portrait, 210 × 297 mm (11906 × 16838 twips). Text area 187.3 mm wide; body 271.6 mm high between the top and bottom margins.

| Margin | mm | twips |
|---|---|---|
| Top | 12.7 | 720 |
| Right | 10 | 566 |
| Bottom | 12.7 | 720 |
| Left | 12.7 | 720 |
| Header distance from the top edge | 12.5 | 708 |
| Footer distance from the bottom edge | 9.7 | 547 |

## 3. Letterhead and footer

Two pictures, one anchored in the header and one in the footer, printed on every page. Neither pushes the text. Shared facts are in `00-letterhead.md`.

| | Header picture | Footer picture |
|---|---|---|
| File | `docs/checker/assets/letterhead-header.png`, 1040 × 216 px | `docs/checker/assets/letterhead-footer.jpeg`, 883 × 75 px |
| Placed size | 202 × 23.3 mm | 207.5 × 16 mm |
| Height against natural proportions | 56% (natural would be 42 mm) | 91% (natural would be 17.6 mm) |
| Anchor, horizontal | -7.7 mm from the left edge of the text area | -11.4 mm from the left edge of the text area |
| Anchor, vertical | -10.7 mm from the top of the header paragraph | 0.2 mm from the top of the footer paragraph |
| Left edge to paper edge | 5 mm | 1.3 mm |
| Right edge to paper edge | 3 mm | 1.2 mm |
| Top, bottom from the top of the paper (**estimated**) | 1.8 mm, 25.1 mm | 282.8 mm, 298.8 mm (the paper ends at 297 mm) |

## 4. Type in use

For right-to-left runs Word applies the complex-script font, size and weight; these are the values shown. Counted over the whole body, spaces left out.

| Font | Size | Weight | Characters | First use |
|---|---|---|---|---|
| Traditional Arabic | 12 pt | bold | 1473 | …… |
| Traditional Arabic | 14 pt | regular | 1352 | قديم |
| Traditional Arabic | 16 pt | bold | 471 | رقم الملف |
| Sakkal Majalla | 12 pt | regular | 135 | …… |
| Traditional Arabic | 16 pt | regular | 113 | مساحة البناء |
| Traditional Arabic | 12 pt | regular | 105 | …… |
| MS Mincho | 14 pt | regular | 95 | ☐ |
| Traditional Arabic | 18 pt | bold | 83 | المعلومات الأساسية للمؤسسة |
| Arabic Typesetting | 18 pt | bold | 29 | رقـــم التســجــيـــل: |
| Traditional Arabic | 20 pt | bold | 20 | نوع الخدمة : عقد (مؤسسة) |
| Batang | 14 pt | regular | 8 | F2 |
| Traditional Arabic | 14 pt | bold | 6 | من: |
| Sakkal Majalla | 16 pt | regular | 5 | / |
| MS Mincho | 18 pt | regular | 2 | ☐ |

## 5. Glyphs and drawn shapes

- Tick box: ☐ (U+2610), 101 in all, as text characters: 95 set in MS Mincho 14 pt; 2 set in MS Mincho 18 pt; 4 set in Traditional Arabic 16 pt.
- Stretching character (tatweel, U+0640): 45. It is part of his label strings and prints as typed; screens drop it.

## 6. Order of blocks, with the page estimate

Heights: "at least" is the sum of the row heights saved in the file; "about" adds line heights assumed from the type sizes (see `README.md`). The running position is measured from the top of the body area, which is 271.6 mm high. All of it is **estimated**.

| Block | What | At least | About | From, to | Page (**estimated**) |
|---|---|---|---|---|---|
| P1 | 1 empty paragraph | — | 5.1 mm | 0 to 5.1 mm | 1 |
| P2 | «رقم التسجيل: …… / ……» | — | 8 mm | 5.1 to 13.1 mm | 1 |
| P3 | «التاريخ: …… / …… / ……» | — | 10.8 mm | 13.1 to 23.8 mm | 1 |
| T1 | table, 12 rows | 24.6 mm | 135.1 mm | 23.8 to 158.9 mm | 1 |
| P4 | 1 empty paragraph | — | 4.7 mm | 158.9 to 163.7 mm | 1 |
| T2 | table, 8 rows | 111 mm | 120.5 mm | 163.7 to 284.2 mm | 1 to 2 |
| P5–P12 | 8 empty paragraphs | — | 37.9 mm | 284.2 to 322.1 mm | 2 |
| T3 | table, 2 rows, floating | 52 mm | 52 mm | 322.1 to 374.1 mm | 2 |
| P13 | 1 empty paragraph | — | 4.7 mm | 374.1 to 378.8 mm | 2 |
| T4 | table, 18 rows | 53.7 mm | 182.1 mm | 378.8 to 560.9 mm | 2 to 3 |
| P14–P15 | 2 empty paragraphs | — | 9.8 mm | 560.9 to 570.7 mm | 3 |

Total about 570.7 mm, which is 2.1 body heights. Reading (**estimated**): two pages. Word records 1, which cannot be right: with every line only as high as its type size the file still needs 1.5 page bodies. Page 1: sections 1 to 3 (T1, T2). Page 2: «الخدمات المبرمجة» (T3) and «الدراسة المالية» with the signature row (T4).

## 7. Text boxes

**P2.box** (row OC-001), anchored to paragraph P2.

- Size 136.2 × 12.3 mm (386.15 × 34.85 pt). Left edge 57.1 mm (161.8 pt) from the left edge of the text area, which puts it 69.8 mm from the left paper edge and 4 mm from the right. Top 0.8 mm (2.35 pt) below the top of its anchor paragraph (position on the page **estimated**).
- Box: fill white, outline none. Shadow: colour black, opacity .5, offset -6pt,4pt.
- Line 1: «نوع الخدمة : عقد (مؤسسة)». centre (jc=center); paragraph fill D9D9D9; line spacing 1.00 lines; Traditional Arabic bold 20 pt.

## 8. Paragraphs outside the tables

| Id | Rows | Alignment on paper (XML) | Indent, spacing | Mark | Text, raw | Type |
|---|---|---|---|---|---|---|
| P1 | — | — | — | — | (1 empty paragraph) | — |
| P2 | OC-002 | left (jc=right) | indent none; line 1.00, after 0 pt | — | رقـــم التســجــيـــل: …… /…… | text: Arabic Typesetting bold 18 pt and Sakkal Majalla 16 pt; dots: Sakkal Majalla 12 pt |
| P3 | OC-003 | left (jc=none) | indent right 2.5 mm; line 1.00 | — | التاريخ: …… / …… / …… | text: Arabic Typesetting bold 18 pt and Sakkal Majalla 16 pt; dots: Sakkal Majalla 12 pt |
| T1 | | | | | (table, section 9) | |
| P4 | — | — | — | — | (1 empty paragraph) | — |
| T2 | | | | | (table, section 9) | |
| P5–P12 | — | — | — | — | (8 empty paragraphs) | — |
| T3 | | | | | (table, section 9) | |
| P13 | — | — | — | — | (1 empty paragraph) | — |
| T4 | | | | | (table, section 9) | |
| P14–P15 | — | — | — | — | (2 empty paragraphs) | — |

## 9. Tables

Columns and cells are listed in file order, which is right to left on paper: column 1 and cell c1 are the rightmost. A minimum height is the row height saved in the file; the printed row is at least that high.

### T1: 6 columns, 12 rows

- Width 192.5 mm (10915 twips), fixed layout, right to left.
- Position: aligned to the right margin, its leading edge: the text of its first cell at tblInd -45 twips (-0.8 mm) from the margin, so its border 108 twips further out, by the cell padding. Right edge 7.3 mm from the right paper edge, left edge 10.2 mm from the left (**estimated**: Word's rules for a Word 2007 file, see `README.md` E4; not seen rendered).
- Borders: single, 0.5 pt, black, on all sides and between cells.
- Cell padding: 1.9 mm left and right, none top and bottom (the default of the table style).

| Column | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| mm | 32.5 | 30 | 7.5 | 42.5 | 32.5 | 47.5 |
| twips | 1842 | 1701 | 426 | 2409 | 1843 | 2694 |

| Cell | Columns | Width | Row min. height | Merge, fill, vertical | Rows | Content, raw | Alignment on paper (XML) | Type |
|---|---|---|---|---|---|---|---|---|
| T1.r1.c1 | 1–6 | 192.5 mm | 1.4 mm | fill D9D9D9; middle; borders top none | OC-004 | [1-] المعلومات الأساسية للمؤسسة | right (jc=none) | Traditional Arabic bold 18 pt |
| T1.r2.c1 | 1 | 32.5 mm | 1.4 mm | no fill; middle | OC-005 | [1.] رقم الملف | right (jc=none) | Traditional Arabic bold 16 pt |
| T1.r2.c2 | 2–4 | 80 mm | 1.4 mm | no fill; middle | OC-005 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T1.r2.c3 | 5 | 32.5 mm | 1.4 mm | no fill; middle | OC-006 | رقم المؤسسة | centre (jc=center) | Traditional Arabic bold 16 pt |
| T1.r2.c4 | 6 | 47.5 mm | 1.4 mm | no fill; middle | OC-006 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T1.r3.c1 | 1 | 32.5 mm | 1.4 mm | no fill; middle | OC-007 | [2.] حالة الملف | right (jc=none) | Traditional Arabic bold 16 pt |
| T1.r3.c2 | 2–6 | 160 mm | 1.4 mm | no fill; middle | OC-007 | ☐  قديم   ☐ جديد   ☐ الزيارة    ☐ عرض سعر    ☐ متعاقد    ☐ انتهاء التعاقد   ☐ متوقف   ☐ معاقب | right (jc=none) | ☐: MS Mincho 14 pt; text: Traditional Arabic 14 pt |
| T1.r4.c1 | 1 | 32.5 mm | 1.4 mm | no fill; middle | OC-008 | [3.] نوع العقار | right (jc=none) | Traditional Arabic bold 16 pt |
| T1.r4.c2 | 2–6 | 160 mm | 1.4 mm | no fill; middle | OC-008 | محل صغير ☐     كبير ☐    شركة ☐    F2 ☐     F3 ☐     F4 ☐     F5 ☐     أخرى ☐ | centre (jc=center) | text: Traditional Arabic 14 pt and Batang 14 pt; ☐: MS Mincho 14 pt |
| T1.r5.c1 | 1 | 32.5 mm | 1.4 mm | no fill; middle | OC-009 | [4.] مدير/ مسير | right (jc=none) | Traditional Arabic bold 16 pt |
| T1.r5.c2 | 2–4 | 80 mm | 1.4 mm | no fill; middle | OC-009 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T1.r5.c3 | 5 | 32.5 mm | 1.4 mm | no fill; middle | OC-010 | السجل التجاري | centre (jc=center) | Traditional Arabic bold 16 pt |
| T1.r5.c4 | 6 | 47.5 mm | 1.4 mm | no fill; middle | OC-010 | لا ☐         نعم ☐ | left (jc=right) | text: Traditional Arabic 14 pt; ☐: MS Mincho 18 pt |
| T1.r6.c1 | 1 | 32.5 mm | 1.4 mm | no fill; middle | OC-011 | [5.] العنوان مدقق | right (jc=none) | Traditional Arabic bold 16 pt |
| T1.r6.c2 | 2–4 | 80 mm | 1.4 mm | no fill; middle | OC-011 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T1.r6.c3 | 5 | 32.5 mm | 1.4 mm | no fill; middle | OC-012 | البلدية / الولاية | centre (jc=center) | Traditional Arabic bold 16 pt |
| T1.r6.c4 | 6 | 47.5 mm | 1.4 mm | no fill; middle | OC-012 | ……/…… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T1.r7.c1 | 1 | 32.5 mm | 1.4 mm | no fill; middle | OC-013 | [6.] اسم المتداول | right (jc=none) | Traditional Arabic bold 16 pt |
| T1.r7.c2 | 2–6 | 160 mm | 1.4 mm | no fill; middle | OC-013 | …… | right (jc=none) | Traditional Arabic bold 12 pt |
| T1.r8.c1 | 1 | 32.5 mm | 1.4 mm | no fill; middle | OC-014 | [7.] اسم المؤسسة | right (jc=none) | Traditional Arabic bold 16 pt |
| T1.r8.c2 | 2–4 | 80 mm | 1.4 mm | no fill; middle | OC-014 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T1.r8.c3 | 5 | 32.5 mm | 1.4 mm | no fill; middle | OC-015 | قطاع العمل | centre (jc=center) | Traditional Arabic bold 16 pt |
| T1.r8.c4 | 6 | 47.5 mm | 1.4 mm | no fill; middle | OC-015 | عام ☐          خاص ☐ | left (jc=right) | text: Traditional Arabic 14 pt; ☐: MS Mincho 14 pt |
| T1.r9.c1 | 1 | 32.5 mm | 1.4 mm | no fill; middle | OC-016 | [8.] رقم الهاتف | right (jc=none) | Traditional Arabic bold 16 pt |
| T1.r9.c2 | 2–4 | 80 mm | 1.4 mm | no fill; middle | OC-016 | …… | right (jc=none) | Traditional Arabic bold 12 pt |
| T1.r9.c3 | 5 | 32.5 mm | 1.4 mm | no fill; middle | OC-017 | الزيارة الأولية | centre (jc=center) | Traditional Arabic bold 16 pt |
| T1.r9.c4 | 6 | 47.5 mm | 1.4 mm | no fill; middle | OC-017 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T1.r10.c1 | 1 | 32.5 mm | 1.4 mm | no fill; middle | OC-018 | [9.] تقييم النظافة | right (jc=none) | Traditional Arabic bold 16 pt |
| T1.r10.c2 | 2–6 | 160 mm | 1.4 mm | no fill; middle | OC-018 | ……        ممتاز ☐    جيد ☐   متوسط ☐   ضعيف ☐     يحتاج إلى تنظيف عميق ☐ | centre (jc=center) | dots: Traditional Arabic 14 pt; text: Traditional Arabic 14 pt; ☐: MS Mincho 14 pt |
| T1.r11.c1 | 1 | 32.5 mm | 1.4 mm | no fill; middle | OC-019 | [10.] تخزين معدات | centre (jc=center) | Traditional Arabic bold 16 pt |
| T1.r11.c2 | 2–3 | 37.5 mm | 1.4 mm | no fill; middle | OC-019 | ☐ نعم      ☐ لا | right (jc=none) | ☐: MS Mincho 14 pt; text: Traditional Arabic 14 pt |
| T1.r11.c3 | 4 | 42.5 mm | 1.4 mm | no fill; middle | OC-020 | اسم المكان | centre (jc=center) | Traditional Arabic bold 16 pt |
| T1.r11.c4 | 5–6 | 80 mm | 1.4 mm | no fill; middle | OC-020 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T1.r12.c1 | 1–2 | 62.5 mm | 9.5 mm | no fill; middle | OC-021 | [11.] مكــــــــــان التخـــــلص مــــــن النفايات | right (jc=none) | Traditional Arabic bold 16 pt |
| T1.r12.c2 | 3–6 | 130 mm | 9.5 mm | no fill; middle | OC-021 | ☐  نقطة التجميع  ☐  إلى الحاويات  ☐  تعليمات العمارة  ☐  …… | centre (jc=center) | ☐: MS Mincho 14 pt; text: Traditional Arabic 14 pt; dots: Traditional Arabic 14 pt |

### T2: 9 columns, 8 rows

- Width 192.5 mm (10915 twips), fixed layout, right to left.
- Position: centred on the text area (jc=center; its tblInd -45 is ignored: Word indents only a table aligned to its leading edge). Right edge 7.4 mm from the right paper edge, left edge 10.1 mm from the left (**estimated**: Word's rules for a Word 2007 file, see `README.md` E4; not seen rendered).
- Borders: single, 0.5 pt, black, on all sides and between cells.
- Cell padding: 1.9 mm left and right, none top and bottom (the default of the table style).

| Column | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|
| mm | 32.6 | 17.6 | 7.4 | 33.1 | 6.7 | 26.3 | 16.4 | 16.6 | 35.7 |
| twips | 1848 | 998 | 421 | 1874 | 382 | 1493 | 930 | 944 | 2025 |

| Cell | Columns | Width | Row min. height | Merge, fill, vertical | Rows | Content, raw | Alignment on paper (XML) | Type |
|---|---|---|---|---|---|---|---|---|
| T2.r1.c1 | 1–9 | 192.5 mm | 11 mm | fill D9D9D9; middle; borders top none | OC-022 | [2-] الوصف الفني للموقع | right (jc=none) | Traditional Arabic bold 18 pt |
| T2.r2.c1 | 1 | 32.6 mm | 8.3 mm | no fill; middle | OC-023 | مساحة البناء | centre (jc=center) | Traditional Arabic 16 pt |
| T2.r2.c2 | 2–3 | 25 mm | 8.3 mm | no fill; middle | OC-023 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T2.r2.c3 | 4 | 33.1 mm | 8.3 mm | no fill; middle | OC-024 | عدد المباني | centre (jc=center) | Traditional Arabic 14 pt |
| T2.r2.c4 | 5–6 | 33.1 mm | 8.3 mm | no fill; middle | OC-024 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T2.r2.c5 | 7–8 | 33.1 mm | 8.3 mm | no fill; middle | OC-025 | عدد المكاتب | centre (jc=center) | Traditional Arabic 14 pt |
| T2.r2.c6 | 9 | 35.7 mm | 8.3 mm | no fill; middle | OC-025 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T2.r3.c1 | 1 | 32.6 mm | 8.3 mm | no fill; middle | OC-026 | عدد القاعات | centre (jc=center) | Traditional Arabic 14 pt |
| T2.r3.c2 | 2–3 | 25 mm | 8.3 mm | no fill; middle | OC-026 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T2.r3.c3 | 4 | 33.1 mm | 8.3 mm | no fill; middle | OC-027 | عدد المخازن | centre (jc=center) | Traditional Arabic 14 pt |
| T2.r3.c4 | 5–6 | 33.1 mm | 8.3 mm | no fill; middle | OC-027 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T2.r3.c5 | 7–8 | 33.1 mm | 8.3 mm | no fill; middle | OC-028 | عدد دورات المياه | centre (jc=center) | Traditional Arabic 14 pt |
| T2.r3.c6 | 9 | 35.7 mm | 8.3 mm | no fill; middle | OC-028 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T2.r4.c1 | 1 | 32.6 mm | 8.3 mm | no fill; middle | OC-029 | عدد المطابخ | centre (jc=center) | Traditional Arabic 14 pt |
| T2.r4.c2 | 2–3 | 25 mm | 8.3 mm | no fill; middle | OC-029 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T2.r4.c3 | 4 | 33.1 mm | 8.3 mm | no fill; middle | OC-030 | عدد النوافذ | centre (jc=center) | Traditional Arabic 14 pt |
| T2.r4.c4 | 5–6 | 33.1 mm | 8.3 mm | no fill; middle | OC-030 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T2.r4.c5 | 7–8 | 33.1 mm | 8.3 mm | no fill; middle | OC-031 | عدد الأبواب | centre (jc=center) | Traditional Arabic 14 pt |
| T2.r4.c6 | 9 | 35.7 mm | 8.3 mm | no fill; middle | OC-031 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T2.r5.c1 | 1 | 32.6 mm | 8.3 mm | no fill; middle | OC-032 | مساحة الأرضيات | centre (jc=center) | Traditional Arabic 14 pt |
| T2.r5.c2 | 2–3 | 25 mm | 8.3 mm | no fill; middle | OC-032 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T2.r5.c3 | 4 | 33.1 mm | 8.3 mm | no fill; middle | OC-033 | نوع الأرضيات | centre (jc=center) | Traditional Arabic 14 pt |
| T2.r5.c4 | 5–6 | 33.1 mm | 8.3 mm | no fill; middle | OC-033 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T2.r5.c5 | 7–8 | 33.1 mm | 8.3 mm | no fill; middle | OC-034 | عدد مواقف السيارات | centre (jc=center) | Traditional Arabic 14 pt |
| T2.r5.c6 | 9 | 35.7 mm | 8.3 mm | no fill; middle | OC-034 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T2.r6.c1 | 1 | 32.6 mm | 8.3 mm | no fill; middle | OC-035 | عدد المداخل | centre (jc=center) | Traditional Arabic 14 pt |
| T2.r6.c2 | 2–3 | 25 mm | 8.3 mm | no fill; middle | OC-035 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T2.r6.c3 | 4 | 33.1 mm | 8.3 mm | no fill; middle | OC-036 | عدد المخارج | centre (jc=center) | Traditional Arabic 14 pt |
| T2.r6.c4 | 5–6 | 33.1 mm | 8.3 mm | no fill; middle | OC-036 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T2.r6.c5 | 7–8 | 33.1 mm | 8.3 mm | no fill; middle | — | (empty) | — | — |
| T2.r6.c6 | 9 | 35.7 mm | 8.3 mm | no fill; middle | OC-037 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T2.r7.c1 | 1–9 | 192.5 mm | 8.3 mm | fill D9D9D9; middle | OC-038 | [3-] الخدمات المقدمة | right (jc=none) | Traditional Arabic bold 18 pt |
| T2.r8.c1 | 1–2 | 50.2 mm | 50.3 mm | no fill; middle | OC-039 | تنظيف الأرضيات ☐ ¶ تنظيف المطبخ ☐ ¶ تنظيف الستائر ☐ ¶ تنظيف الأثاث ☐ ¶ اللوحات والإعلانات ☐ ¶ …… | centre (jc=center) | text: Traditional Arabic 14 pt; ☐: MS Mincho 14 pt; dots: Traditional Arabic 14 pt |
| T2.r8.c2 | 3–5 | 47.2 mm | 50.3 mm | no fill; middle | OC-039 | تنظيف الأسقف ☐ ¶ تنظيف دورات المياه ☐ ¶ تنظيف النوافذ ☐ ¶ جمع وفرز النفايات ☐ ¶ تنظيف الرفوف ☐ ¶ …… | centre (jc=center) | text: Traditional Arabic 14 pt; ☐: MS Mincho 14 pt; dots: Traditional Arabic 14 pt |
| T2.r8.c3 | 6–7 | 42.7 mm | 50.3 mm | no fill; middle | OC-039 | تنظيف الزجاج ☐ ¶ تنظيف المكاتب ☐ ¶ تنظيف السجاد ☐ ¶ تنظيف مواقف السيارات ☐ ¶ تنظيف الأجهزة ☐  …… | centre (jc=center) | text: Traditional Arabic 14 pt; ☐: MS Mincho 14 pt; dots: Traditional Arabic 14 pt |
| T2.r8.c4 | 8–9 | 52.4 mm | 50.3 mm | no fill; middle | OC-039 | تنظيف قاعة الاستقبال ☐ ¶ تنظيف قاعات الاجتماعات ☐ ¶ تنظيف المرآب ☐ ¶ تنظيف المخازن ☐ ¶ تنظيف الحدائق ☐ …… | centre (jc=center) | text: Traditional Arabic 14 pt; ☐: MS Mincho 14 pt; dots: Traditional Arabic 14 pt |

### T3: 4 columns, 2 rows

- Width 192.5 mm (10915 twips), fixed layout, right to left.
- Position: centred on the text area (floating table, tblpXSpec=center). Right edge 7.4 mm from the right paper edge, left edge 10.1 mm from the left (**estimated**: Word's rules for a Word 2007 file, see `README.md` E4; not seen rendered).
- Floating table: anchored to the text, 0.4 mm (21 twips) from its anchor vertically, text kept 2.5 mm away on each side. Where it lands on the page is **estimated**.
- Borders: single, 0.5 pt, black, on all sides and between cells.
- Cell padding: 1.9 mm left and right, none top and bottom (the default of the table style).

| Column | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| mm | 37.5 | 55 | 52.5 | 47.5 |
| twips | 2126 | 3118 | 2977 | 2694 |

| Cell | Columns | Width | Row min. height | Merge, fill, vertical | Rows | Content, raw | Alignment on paper (XML) | Type |
|---|---|---|---|---|---|---|---|---|
| T3.r1.c1 | 1–4 | 192.5 mm | 12.2 mm | fill D9D9D9; middle; borders top none, bottom single 0.5 pt | OC-040 | [4-] الخدمات المبرمجة | right (jc=none) | Traditional Arabic bold 18 pt |
| T3.r2.c1 | 1 | 37.5 mm | 39.8 mm | no fill; middle; borders top single 0.5 pt, left single 0.5 pt, bottom single 0.5 pt, right single 0.5 pt | OC-041 | تنظيف دوري ☐ ¶ تنظيف بعد البناء ☐ ¶ تنظيف بعد الترميم ☐ ¶ …… | left (jc=right) | text: Traditional Arabic 14 pt; ☐: MS Mincho 14 pt; dots: Traditional Arabic 14 pt |
| T3.r2.c2 | 2 | 55 mm | 39.8 mm | no fill; middle; borders top single 0.5 pt, left single 0.5 pt, bottom single 0.5 pt, right single 0.5 pt | OC-041 | تنظيف بعد الولائم ☐ ¶ تنظيف شامل وعميق ☐ ¶ تنظيف غ..الضيوف ☐ ¶ …… | left (jc=right) | text: Traditional Arabic 14 pt; ☐: MS Mincho 14 pt; dots: Traditional Arabic 14 pt |
| T3.r2.c3 | 3 | 52.5 mm | 39.8 mm | no fill; middle; borders top single 0.5 pt, left single 0.5 pt, bottom single 0.5 pt, right single 0.5 pt | OC-041 | تنظيف بعد السفر ☐ ¶ تنظيف رمضان ☐ ¶ إزالة المخلفات ☐ ¶ …… | left (jc=right) | text: Traditional Arabic 14 pt; ☐: MS Mincho 14 pt; dots: Traditional Arabic 14 pt |
| T3.r2.c4 | 4 | 47.5 mm | 39.8 mm | no fill; middle; borders top single 0.5 pt, left single 0.5 pt, bottom single 0.5 pt, right single 0.5 pt | OC-041 | تنظيف قبل المناسبات ☐ ¶ تنظيف بعد المناسبات ☐ ¶ …… ¶ …… | left (jc=right) | text: Traditional Arabic 14 pt; ☐: MS Mincho 14 pt; dots: Traditional Arabic 14 pt |

### T4: 4 columns, 18 rows

- Width 192.5 mm (10915 twips), fixed layout, right to left.
- Position: aligned to the right margin, its leading edge: the text of its first cell at tblInd -45 twips (-0.8 mm) from the margin, so its border 108 twips further out, by the cell padding. Right edge 7.3 mm from the right paper edge, left edge 10.2 mm from the left (**estimated**: Word's rules for a Word 2007 file, see `README.md` E4; not seen rendered).
- Borders: single, 0.5 pt, black, on all sides and between cells.
- Cell padding: 1.9 mm left and right, none top and bottom (the default of the table style).

| Column | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| mm | 32.5 | 77.5 | 32.5 | 50 |
| twips | 1842 | 4395 | 1842 | 2836 |

| Cell | Columns | Width | Row min. height | Merge, fill, vertical | Rows | Content, raw | Alignment on paper (XML) | Type |
|---|---|---|---|---|---|---|---|---|
| T4.r1.c1 | 1–4 | 192.5 mm | 2.4 mm | fill D9D9D9; middle; borders top none | OC-042 | [5-] الدراسة المالية | right (jc=none) | Traditional Arabic bold 18 pt |
| T4.r2.c1 | 1–4 | 192.5 mm | 2.4 mm | no fill; middle | OC-043 | [1.] نــــوع العقد: ……         قصير ☐     طويل ☐ | right (jc=none) | text: Traditional Arabic bold 16 pt and Traditional Arabic 14 pt; dots: Traditional Arabic bold 12 pt; ☐: MS Mincho 14 pt |
| T4.r3.c1 | 1 | 32.5 mm | 2.4 mm | no fill; middle | OC-044 | [2.] مدة العقد | right (jc=none) | Traditional Arabic bold 16 pt |
| T4.r3.c2 | 2–4 | 160 mm | 2.4 mm | no fill; middle | OC-044 | ……             شهر ☐         3 أشهر ☐         6 أشهر ☐         سنة ☐ | right (jc=none) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic 14 pt; ☐: MS Mincho 14 pt |
| T4.r4.c1 | 1 | 32.5 mm | 2.4 mm | no fill; middle | OC-045 | [3.] عدد الزيارات | right (jc=none) | Traditional Arabic bold 16 pt |
| T4.r4.c2 | 2–4 | 160 mm | 2.4 mm | no fill; middle | OC-045 | واحدة بالأسبوع ☐   اثنين بالأسبوع ☐   ثلاثة بالأسبوع ☐ أربعة بالأسبوع   ☐خمسة بالأسبوع   ☐ستة بالأسبوع | right (jc=none) | text: Traditional Arabic 14 pt; ☐: MS Mincho 14 pt |
| T4.r5.c1 | 1 | 32.5 mm | 2.4 mm | no fill; middle | OC-046 | [4.] أيام التنفيذ | right (jc=none) | Traditional Arabic bold 16 pt |
| T4.r5.c2 | 2–4 | 160 mm | 2.4 mm | no fill; middle | OC-046 | السبت  ☐      الأحد  ☐      الاثنين  ☐     الثلاثاء  ☐      الأربعاء  ☐      الخميس  ☐ | centre (jc=center) | text: Traditional Arabic 14 pt; ☐: MS Mincho 14 pt |
| T4.r6.c1 | 1 | 32.5 mm | 2.4 mm | no fill; middle | OC-047 | [5.] تحديد الفترة | right (jc=none) | Traditional Arabic bold 16 pt |
| T4.r6.c2 | 2 | 77.5 mm | 2.4 mm | no fill; middle | OC-047 | الصباحية ☐        المسائية ☐         معا ☐ | centre (jc=center) | text: Traditional Arabic 14 pt; ☐: MS Mincho 14 pt |
| T4.r6.c3 | 3 | 32.5 mm | 2.4 mm | no fill; middle | OC-048 | من: …… | right (jc=none) | text: Traditional Arabic bold 14 pt; dots: Traditional Arabic 14 pt |
| T4.r6.c4 | 4 | 50 mm | 2.4 mm | no fill; middle | OC-049 | إلى: …… | right (jc=none) | text: Traditional Arabic bold 14 pt and Traditional Arabic 14 pt; dots: Traditional Arabic 14 pt |
| T4.r7.c1 | 1 | 32.5 mm | 2.4 mm | no fill; middle | OC-050 | [6.] تاريخ البداية | right (jc=none) | Traditional Arabic bold 16 pt |
| T4.r7.c2 | 2 | 77.5 mm | 2.4 mm | no fill; middle | OC-050 | …… | right (jc=none) | Traditional Arabic bold 12 pt |
| T4.r7.c3 | 3 | 32.5 mm | 2.4 mm | no fill; middle | OC-051 | تاريخ النهاية | centre (jc=center) | Traditional Arabic bold 16 pt |
| T4.r7.c4 | 4 | 50 mm | 2.4 mm | no fill; middle | OC-051 | …… | right (jc=none) | Traditional Arabic bold 12 pt |
| T4.r8.c1 | 1 | 32.5 mm | 2.4 mm | no fill; middle | OC-052 | [7.] وقت الوصول | right (jc=none) | Traditional Arabic bold 16 pt |
| T4.r8.c2 | 2 | 77.5 mm | 2.4 mm | no fill; middle | OC-052, OC-053 | ……  المغادرة: …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 16 pt |
| T4.r8.c3 | 3 | 32.5 mm | 2.4 mm | no fill; middle | OC-054 | عدد العمال | centre (jc=center) | Traditional Arabic bold 16 pt |
| T4.r8.c4 | 4 | 50 mm | 2.4 mm | no fill; middle | OC-054 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T4.r9.c1 | 1 | 32.5 mm | 2.4 mm | no fill; middle | OC-055 | [8.] مسدد أتعاب | right (jc=none) | Traditional Arabic bold 16 pt |
| T4.r9.c2 | 2 | 77.5 mm | 2.4 mm | no fill; middle | OC-055 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T4.r9.c3 | 3 | 32.5 mm | 2.4 mm | no fill; middle | OC-056 | رقم الهاتف | centre (jc=center) | Traditional Arabic bold 16 pt |
| T4.r9.c4 | 4 | 50 mm | 2.4 mm | no fill; middle | OC-056 | …… | right (jc=none) | Traditional Arabic bold 12 pt |
| T4.r10.c1 | 1 | 32.5 mm | 2 mm | no fill; middle | OC-057 | [9.] مواد التنظيف | right (jc=none) | Traditional Arabic bold 16 pt |
| T4.r10.c2 | 2 | 77.5 mm | 2 mm | no fill; middle | OC-057 | على عاتق المركز ☐     على عاتق صاحبها ☐ | centre (jc=center) | text: Traditional Arabic 16 pt; ☐: Traditional Arabic 16 pt |
| T4.r10.c3 | 3 | 32.5 mm | 2 mm | no fill; middle | OC-058 | مصاريفها | centre (jc=center) | Traditional Arabic bold 16 pt |
| T4.r10.c4 | 4 | 50 mm | 2 mm | no fill; middle | OC-058 | …… دج | right (jc=none) | dots: Traditional Arabic 12 pt; text: Traditional Arabic 14 pt |
| T4.r11.c1 | 1 | 32.5 mm | 2 mm | no fill; middle | OC-059 | [10.] توفير النقل | right (jc=none) | Traditional Arabic bold 16 pt |
| T4.r11.c2 | 2 | 77.5 mm | 2 mm | no fill; middle | OC-059 | على عاتق المركز ☐     على عاتق صاحبها ☐ | centre (jc=center) | text: Traditional Arabic 16 pt; ☐: Traditional Arabic 16 pt |
| T4.r11.c3 | 3 | 32.5 mm | 2 mm | no fill; middle | OC-060 | مصاريفها | centre (jc=center) | Traditional Arabic bold 16 pt |
| T4.r11.c4 | 4 | 50 mm | 2 mm | no fill; middle | OC-060 | …… دج | right (jc=none) | dots: Traditional Arabic 12 pt; text: Traditional Arabic 14 pt |
| T4.r12.c1 | 1 | 32.5 mm | 2 mm | no fill; middle | OC-061 | [11.] طريقة السداد | right (jc=none) | Traditional Arabic bold 16 pt |
| T4.r12.c2 | 2 | 77.5 mm | 2 mm | no fill; middle | OC-061 | نقدًا  ☐    تحويل بنكي  ☐       تحويل بريدي  ☐ | right (jc=none) | text: Traditional Arabic 14 pt; ☐: MS Mincho 14 pt |
| T4.r12.c3 | 3 | 32.5 mm | 2 mm | no fill; middle | OC-062 | المبلغ إجمالي | centre (jc=center) | Traditional Arabic bold 16 pt |
| T4.r12.c4 | 4 | 50 mm | 2 mm | no fill; middle | OC-062 | …… دج | right (jc=none) | dots: Traditional Arabic 12 pt; text: Traditional Arabic 14 pt |
| T4.r13.c1 | 1 | 32.5 mm | 2 mm | no fill; middle | OC-063 | [12.] تاريخ تسديد | right (jc=none) | Traditional Arabic bold 16 pt |
| T4.r13.c2 | 2 | 77.5 mm | 2 mm | no fill; middle | OC-063 | …… | right (jc=none) | Traditional Arabic bold 12 pt |
| T4.r13.c3 | 3 | 32.5 mm | 2 mm | no fill; middle | OC-064 | مكان التسديد | centre (jc=center) | Traditional Arabic bold 16 pt |
| T4.r13.c4 | 4 | 50 mm | 2 mm | no fill; middle | OC-064 | …… | right (jc=none) | Traditional Arabic bold 12 pt |
| T4.r14.c1 | 1 | 32.5 mm | 2 mm | no fill; middle | OC-065 | [13.] دورية السداد | right (jc=none) | Traditional Arabic bold 16 pt |
| T4.r14.c2 | 2–4 | 160 mm | 2 mm | no fill; middle | OC-065 | بعد كل زيارة ☐         أسبوعيا ☐         كل أسبوعين ☐         كل شهر ☐ | centre (jc=center) | text: Traditional Arabic 14 pt; ☐: MS Mincho 14 pt |
| T4.r15.c1 | 1 | 32.5 mm | 2 mm | no fill; middle | OC-066 | [14.] دخول الفريق | right (jc=none) | Traditional Arabic bold 16 pt |
| T4.r15.c2 | 2–4 | 160 mm | 2 mm | no fill; middle | OC-066 | ☐  عن طريق الحارس  ☐  مفتاح خاص      ☐  مسؤول العمارة       ☐  باب مفتوح خلال ساعات العمل | right (jc=none) | ☐: MS Mincho 14 pt; text: Traditional Arabic 14 pt |
| T4.r16.c1 | 1 | 32.5 mm | 2 mm | no fill; middle | OC-067 | [15.] يوجد حارس | right (jc=none) | Traditional Arabic bold 16 pt |
| T4.r16.c2 | 2 | 77.5 mm | 2 mm | no fill; middle | OC-067 | ☐  نعم                         ☐ لا | centre (jc=center) | ☐: MS Mincho 14 pt; text: Traditional Arabic 14 pt |
| T4.r16.c3 | 3 | 32.5 mm | 2 mm | no fill; middle | OC-068 | تعليمات أمنية | centre (jc=center) | Traditional Arabic bold 16 pt |
| T4.r16.c4 | 4 | 50 mm | 2 mm | no fill; middle | OC-068 | ☐  نعم            ☐ لا | centre (jc=center) | ☐: MS Mincho 14 pt; text: Traditional Arabic 14 pt |
| T4.r17.c1 | 1 | 32.5 mm | 2 mm | no fill; middle; borders bottom single 0.5 pt | OC-069 | [16.] اسمه ولقبه | right (jc=none) | Traditional Arabic bold 16 pt |
| T4.r17.c2 | 2 | 77.5 mm | 2 mm | no fill; middle; borders bottom single 0.5 pt | OC-069 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T4.r17.c3 | 3 | 32.5 mm | 2 mm | no fill; middle; borders bottom single 0.5 pt | OC-070 | رقم الهاتف | centre (jc=center) | Traditional Arabic bold 16 pt |
| T4.r17.c4 | 4 | 50 mm | 2 mm | no fill; middle; borders bottom single 0.5 pt | OC-070 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T4.r18.c1 | 1–2 | 110 mm | 15.7 mm | no fill; middle; borders top single 0.5 pt, left none, bottom none, right none | OC-071 | حررت: بأم البواقي، بتاريخ: …… / …… / …… | right (jc=none) | text: Traditional Arabic 16 pt and Sakkal Majalla 16 pt; dots: Sakkal Majalla 12 pt |
| T4.r18.c2 | 3–4 | 82.5 mm | 15.7 mm | no fill; middle; borders top single 0.5 pt, left none, bottom none, right none | OC-072 | الإمضـــــاء والخـــــتم | left (jc=right) | Traditional Arabic 16 pt |

## 10. Options: which side the ☐ sits

"Before" means the ☐ is typed before its label, so it prints on the label's right; "after" prints on its left. Options are separated by runs of spaces, not tabs or cells, so their exact spacing is **estimated**; order and side are facts.

| Row | Label | ☐ side | Options |
|---|---|---|---|
| OC-007 | حالة الملف | before | 8 |
| OC-008 | نوع العقار | after | 8 |
| OC-010 | السجل التجاري | after | 2 |
| OC-015 | قطاع العمل | after | 2 |
| OC-018 | تقييم النظافة | after | 5 |
| OC-019 | تخزين معدات | before | 2 |
| OC-021 | مكان التخلص من النفايات | before | 4 |
| OC-039 | — | after / none | 20, plus 4 dotted lines without ☐ |
| OC-041 | — | after / none | 11, plus 5 dotted lines without ☐ |
| OC-043 | نوع العقد: | after | 2 |
| OC-044 | مدة العقد | after | 4 |
| OC-045 | عدد الزيارات | after / none | 6 |
| OC-046 | أيام التنفيذ | after | 6 |
| OC-047 | تحديد الفترة | after | 3 |
| OC-057 | مواد التنظيف | after | 2 |
| OC-059 | توفير النقل | after | 2 |
| OC-061 | طريقة السداد | after | 3 |
| OC-065 | دورية السداد | after | 4 |
| OC-066 | دخول الفريق | before | 4 |
| OC-067 | يوجد حارس | before | 2 |
| OC-068 | تعليمات أمنية | before | 2 |

## 11. Notes for builders

- The title is a text box over the right half of the page; the number line and the date line sit at the left, beside it. The box has a soft shadow and no outline.
- Print every label with the number shown in square brackets in section 9. Word generates those numbers; they are not in the text. Slips are reproduced (print reproduces his Word file) and listed in `differences.md` section 4.
- Labels print with their stretching characters, exactly as in the "Content, raw" column. Screens drop that character.
- Dotted blanks are rows of full stops in the file. Draw each as a dotted line filling its cell; the count of dots is not a fact.
- Options sit on one line, spaced by typed spaces. Keep their order and the side of each ☐ (section 10); spread them evenly across the cell.
- Two ☐ on this form, in «على عاتق المركز ☐ على عاتق صاحبها ☐», are typed inside Traditional Arabic runs instead of MS Mincho ones. Draw every ☐ the same.
- The last row of the financial table is open: it has a top border only. It holds «حررت: بأم البواقي، بتاريخ: ……» and, at the left, «الإمضـــــاء والخـــــتم».
- «نوع العقد:» (T4.r2) is one cell across the table holding the label with its colon, a dotted blank and the two options (K5, K10).
- «عدد الزيارات» (T4.r4) has six labels and five ☐; reproduce it as typed (F5).
- «السجل التجاري» (T1.r5.c4) offers «لا» then «نعم» (K7).
- The last row of T2's description block ends with a dotted blank beside an empty label cell (T2.r6.c5, c6) (K6).
- The services list (T2.r8) has four dotted lines without a ☐; in cells 3 and 4 the dotted line shares a line with the last option (K13).
- T3 floats; T4 does not, unlike the organisation request (K18).

## 12. What is estimated on this page

- E1. The number of pages and where each page ends (section 6). Word's recorded count is file metadata; the reading comes from the saved row heights and assumed line heights.
- E2. Every vertical position on the page: the top and bottom of the letterhead and footer pictures, where the body starts under the letterhead, where a text box or a floating table lands.
- E3. What a printer clips near the paper edges (K4).
- E4. The distance of each table's edges from the paper edges. Computed with Word's rules for a Word 2007 file: a centred table (jc=center, or floating with tblpXSpec=center) is centred on the text area and its tblInd is ignored; a table aligned to its trailing edge stands against that margin; a table aligned to its leading edge puts the text of its first cell at the indent, so its border stands out by the cell padding. With these rules every table of a client form has its right edge 7.3 to 7.4 mm and its left edge 10.1 to 10.2 mm from the paper edges. Not seen rendered.
- E5. Printed row heights. The file gives a minimum per row; the printed height depends on the fonts.
- E6. The spacing between options in a cell: it is typed with spaces.
- E7. The numbers in front of labels: computed from `numbering.xml`, not seen printed.
- E8. "Alignment on paper": Word's rule for right-to-left paragraphs applied to the XML value (`jc=left` is the right side, `jc=right` the left).
- E9. Glyph shapes and line heights. None of his fonts is installed here, and Word's substitutes for missing glyphs (☐ in Traditional Arabic runs, the emoji) are not recorded in the file.
