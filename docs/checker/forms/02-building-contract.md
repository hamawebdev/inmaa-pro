# Layout facts: building contract

Word file: `client docs/-01- عقد - عمارة.docx`. Print sheet: building contract sheet.

Read from the Word XML by `docs/checker/tools/build_forms.py`; do not edit by hand. Nothing here was seen rendered: this machine has no Word. A fact that depends on Word's rendering is marked **estimated**. Conventions and units are in `README.md`; every cell and run is in `docs/checker/data/02-building-contract.json`. Ids (`T1.r2.c1`, `P2`, `P2.box`) are the ones in the Source column of `docs/checker-table.md`.

## 1. Source

| | |
|---|---|
| SHA-256 | `40f3652184b442f3e5c5b9af96b63b4aed101be3219813c995c73cff4b36d31d` |
| Saved by | Microsoft Office Word, version 12.0000 (Word 2007 format) |
| Created, last saved | 2026-09-22T07:23:00Z, 2026-10-10T16:50:00Z |
| Pages recorded by Word | 3 (**estimated**: file metadata, not a rendering) |
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
| Traditional Arabic | 12 pt | bold | 3270 | …… |
| Traditional Arabic | 14 pt | regular | 1419 | قديم |
| Traditional Arabic | 14 pt | bold | 1230 | 01 |
| Traditional Arabic | 16 pt | bold | 482 | رقم الملف |
| Sakkal Majalla | 12 pt | regular | 127 | …… |
| Traditional Arabic | 18 pt | bold | 114 | المعلومات الأساسية للعميل |
| Traditional Arabic | 12 pt | regular | 105 | …… |
| MS Mincho | 14 pt | regular | 103 | ☐ |
| Traditional Arabic | 16 pt | regular | 102 | على عاتق المركز ☐     على عا |
| Arabic Typesetting | 18 pt | bold | 29 | رقـــم التســجــيـــل: |
| Traditional Arabic | 20 pt | bold | 20 | نوع الخدمة : عقد (عمارة) |
| Sakkal Majalla | 16 pt | regular | 8 | / |

## 5. Glyphs and drawn shapes

- Tick box: ☐ (U+2610), 107 in all, as text characters: 103 set in MS Mincho 14 pt; 4 set in Traditional Arabic 16 pt.
- Stretching character (tatweel, U+0640): 45. It is part of his label strings and prints as typed; screens drop it.

## 6. Order of blocks, with the page estimate

Heights: "at least" is the sum of the row heights saved in the file; "about" adds line heights assumed from the type sizes (see `README.md`). The running position is measured from the top of the body area, which is 271.6 mm high. All of it is **estimated**.

| Block | What | At least | About | From, to | Page (**estimated**) |
|---|---|---|---|---|---|
| P1 | 1 empty paragraph | — | 5.1 mm | 0 to 5.1 mm | 1 |
| P2 | «رقم التسجيل: …… /BLC» | — | 8 mm | 5.1 to 13.1 mm | 1 |
| P3 | «التاريخ: …… / …… / ……» | — | 10.8 mm | 13.1 to 23.8 mm | 1 |
| T1 | table, 11 rows | 73.4 mm | 125.4 mm | 23.8 to 149.3 mm | 1 |
| P4 | 1 empty paragraph | — | 4.7 mm | 149.3 to 154 mm | 1 |
| T2 | table, 3 rows | 27.6 mm | 42 mm | 154 to 196.1 mm | 1 |
| P5 | 1 empty paragraph | — | 4.7 mm | 196.1 to 200.8 mm | 1 |
| T3 | table, 7 rows | 60.8 mm | 92.9 mm | 200.8 to 293.7 mm | 1 to 2 |
| P6–P8 | 3 empty paragraphs | — | 17 mm | 293.7 to 310.7 mm | 2 |
| T4 | table, 2 rows, floating | 52 mm | 52 mm | 310.7 to 362.8 mm | 2 |
| P9 | 1 empty paragraph | — | 4.7 mm | 362.8 to 367.5 mm | 2 |
| T5 | table, 18 rows | 52.7 mm | 181.1 mm | 367.5 to 548.6 mm | 2 to 3 |
| P10–P26 | 17 empty paragraphs | — | 80.9 mm | 548.6 to 629.5 mm | 3 |
| T6 | table, 28 rows | 229.3 mm | 245.4 mm | 629.5 to 874.9 mm | 3 to 4 |
| P27 | 1 empty paragraph | — | 4.7 mm | 874.9 to 879.6 mm | 4 |

Total about 879.6 mm, which is 3.2 body heights. Reading (**estimated**): three pages, as Word records; the estimate runs about 8% high. Page 1: sections 1 to 4 (T1, T2, T3). Page 2: «الخدمات المبرمجة» (T4) and «الدراسة المالية» with the signature row (T5). Page 3: the residents list (T6), sent there by the 17 empty paragraphs before it.

## 7. Text boxes

**P2.box** (row B-001), anchored to paragraph P2.

- Size 102 × 12.3 mm (289.15 × 34.85 pt). Left edge 91.3 mm (258.8 pt) from the left edge of the text area, which puts it 104 mm from the left paper edge and 4 mm from the right. Top 0.8 mm (2.35 pt) below the top of its anchor paragraph (position on the page **estimated**).
- Box: fill white, outline none. Shadow: colour black, opacity .5, offset -6pt,4pt.
- Line 1: «نوع الخدمة : عقد (عمارة)». centre (jc=center); paragraph fill D9D9D9; line spacing 1.00 lines; Traditional Arabic bold 20 pt.

## 8. Paragraphs outside the tables

| Id | Rows | Alignment on paper (XML) | Indent, spacing | Mark | Text, raw | Type |
|---|---|---|---|---|---|---|
| P1 | — | — | — | — | (1 empty paragraph) | — |
| P2 | B-002 | left (jc=right) | indent none; line 1.00, after 0 pt | — | رقـــم التســجــيـــل: …… /BLC | text: Arabic Typesetting bold 18 pt and Sakkal Majalla 16 pt; dots: Sakkal Majalla 12 pt |
| P3 | B-003 | left (jc=none) | indent right 2.5 mm; line 1.00 | — | التاريخ: …… / …… / …… | text: Arabic Typesetting bold 18 pt and Sakkal Majalla 16 pt; dots: Sakkal Majalla 12 pt |
| T1 | | | | | (table, section 9) | |
| P4 | — | — | — | — | (1 empty paragraph) | — |
| T2 | | | | | (table, section 9) | |
| P5 | — | — | — | — | (1 empty paragraph) | — |
| T3 | | | | | (table, section 9) | |
| P6–P8 | — | — | — | — | (3 empty paragraphs) | — |
| T4 | | | | | (table, section 9) | |
| P9 | — | — | — | — | (1 empty paragraph) | — |
| T5 | | | | | (table, section 9) | |
| P10–P26 | — | — | — | — | (17 empty paragraphs) | — |
| T6 | | | | | (table, section 9) | |
| P27 | — | — | — | — | (1 empty paragraph) | — |

## 9. Tables

Columns and cells are listed in file order, which is right to left on paper: column 1 and cell c1 are the rightmost. A minimum height is the row height saved in the file; the printed row is at least that high.

### T1: 6 columns, 11 rows

- Width 192.5 mm (10915 twips), fixed layout, right to left.
- Position: from the right margin, offset -0.8 mm (tblInd -45). Right edge 9.2 mm from the right paper edge, left edge 8.3 mm from the left (**estimated** within about 2 mm: Word's cell-margin rule is not in the file).
- Borders: single, 0.5 pt, black, on all sides and between cells.
- Cell padding: 1.9 mm left and right, none top and bottom (the default of the table style).

| Column | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| mm | 32.5 | 30 | 27.5 | 22.5 | 32.5 | 47.5 |
| twips | 1842 | 1701 | 1560 | 1275 | 1843 | 2694 |

| Cell | Columns | Width | Row min. height | Merge, fill, vertical | Rows | Content, raw | Alignment on paper (XML) | Type |
|---|---|---|---|---|---|---|---|---|
| T1.r1.c1 | 1–6 | 192.5 mm | 1.4 mm | fill D9D9D9; middle; borders top none | B-004 | [1-] المعلومات الأساسية للعميل | right (jc=none) | Traditional Arabic bold 18 pt |
| T1.r2.c1 | 1 | 32.5 mm | 1.4 mm | no fill; middle | B-005 | [1.] رقم الملف | centre (jc=center) | Traditional Arabic bold 16 pt |
| T1.r2.c2 | 2–4 | 80 mm | 1.4 mm | no fill; middle | B-005 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T1.r2.c3 | 5 | 32.5 mm | 1.4 mm | no fill; middle | B-006 | رقم العمارة | centre (jc=center) | Traditional Arabic bold 16 pt |
| T1.r2.c4 | 6 | 47.5 mm | 1.4 mm | no fill; middle | B-006 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T1.r3.c1 | 1 | 32.5 mm | 1.4 mm | no fill; middle | B-007 | [2.] حالة الملف | centre (jc=center) | Traditional Arabic bold 16 pt |
| T1.r3.c2 | 2–6 | 160 mm | 1.4 mm | no fill; middle | B-007 | ☐  قديم   ☐ جديد   ☐ الزيارة    ☐ عرض سعر    ☐ متعاقد    ☐ انتهاء التعاقد   ☐ متوقف   ☐ معاقب | right (jc=none) | ☐: MS Mincho 14 pt; text: Traditional Arabic 14 pt |
| T1.r4.c1 | 1 | 32.5 mm | 1.4 mm | no fill; middle | B-008 | [3.] العنوان مدقق | centre (jc=center) | Traditional Arabic bold 16 pt |
| T1.r4.c2 | 2–4 | 80 mm | 1.4 mm | no fill; middle | B-008 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T1.r4.c3 | 5 | 32.5 mm | 1.4 mm | no fill; middle | B-009 | البلدية / الولاية | centre (jc=center) | Traditional Arabic bold 16 pt |
| T1.r4.c4 | 6 | 47.5 mm | 1.4 mm | no fill; middle | B-009 | ……/…… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T1.r5.c1 | 1 | 32.5 mm | 1.4 mm | no fill; middle | B-010 | [4.] اسم المتداول | centre (jc=center) | Traditional Arabic bold 16 pt |
| T1.r5.c2 | 2–6 | 160 mm | 1.4 mm | no fill; middle | B-010 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T1.r6.c1 | 1 | 32.5 mm | 18.6 mm | no fill; middle | B-011 | [5.] جهة التعاقد | centre (jc=center) | Traditional Arabic bold 16 pt |
| T1.r6.c2 | 2–6 | 160 mm | 18.6 mm | no fill; middle | B-011 | ☐  مالك العمارة  ☐  ممثل السكان  ☐  مسير الإقامة   ☐ سانديك   ☐  جمعية السكان ☐  شركة تسيير عقاري ⏎ ☐  أخرى: …… | centre (jc=center) | ☐: MS Mincho 14 pt; text: Traditional Arabic 14 pt; dots: Traditional Arabic 14 pt |
| T1.r7.c1 | 1 | 32.5 mm | 9.7 mm | no fill; middle | B-012 | [6.] اسم المسئول | centre (jc=center) | Traditional Arabic bold 16 pt |
| T1.r7.c2 | 2–4 | 80 mm | 9.7 mm | no fill; middle | B-012 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T1.r7.c3 | 5 | 32.5 mm | 9.7 mm | no fill; middle | B-013 | الصفة | centre (jc=center) | Traditional Arabic bold 16 pt |
| T1.r7.c4 | 6 | 47.5 mm | 9.7 mm | no fill; middle | B-013 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T1.r8.c1 | 1 | 32.5 mm | 9.7 mm | no fill; middle | B-014 | [7.] رقم الهاتف | centre (jc=center) | Traditional Arabic bold 16 pt |
| T1.r8.c2 | 2–4 | 80 mm | 9.7 mm | no fill; middle | B-014 | (01): …… | centre (jc=center) | text: Traditional Arabic bold 12 pt and Traditional Arabic bold 14 pt; dots: Traditional Arabic bold 12 pt |
| T1.r8.c3 | 5 | 32.5 mm | 9.7 mm | no fill; middle | B-015 | تاريخ الزيارة | centre (jc=center) | Traditional Arabic bold 16 pt |
| T1.r8.c4 | 6 | 47.5 mm | 9.7 mm | no fill; middle | B-015 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T1.r9.c1 | 1 | 32.5 mm | 9.5 mm | no fill; middle | B-016 | [8.] تقييم النظافة | centre (jc=center) | Traditional Arabic bold 16 pt |
| T1.r9.c2 | 2–6 | 160 mm | 9.5 mm | no fill; middle | B-016 | ……        ممتاز ☐    جيد ☐     متوسط ☐     ضعيف ☐     يحتاج إلى تنظيف عميق ☐ | centre (jc=center) | dots: Traditional Arabic 14 pt; text: Traditional Arabic 14 pt; ☐: MS Mincho 14 pt |
| T1.r10.c1 | 1 | 32.5 mm | 9.5 mm | no fill; middle | B-017 | [9.] تخزين معدات | centre (jc=center) | Traditional Arabic bold 16 pt |
| T1.r10.c2 | 2 | 30 mm | 9.5 mm | no fill; middle | B-017 | ☐ نعم     ☐ لا | centre (jc=center) | ☐: MS Mincho 14 pt; text: Traditional Arabic 14 pt |
| T1.r10.c3 | 3 | 27.5 mm | 9.5 mm | no fill; middle | B-018 | اسم المكان | centre (jc=center) | Traditional Arabic bold 16 pt |
| T1.r10.c4 | 4–6 | 102.5 mm | 9.5 mm | no fill; middle | B-018 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T1.r11.c1 | 1–2 | 62.5 mm | 9.5 mm | no fill; middle | B-019 | [10.] مكــــــــــان التخـــــلص مــــــن النفايات | centre (jc=center) | Traditional Arabic bold 16 pt |
| T1.r11.c2 | 3–6 | 130 mm | 9.5 mm | no fill; middle | B-019 | ☐  نقطة التجميع  ☐  إلى الحاويات  ☐  تعليمات العمارة  ☐  …… | centre (jc=center) | ☐: MS Mincho 14 pt; text: Traditional Arabic 14 pt; dots: Traditional Arabic 14 pt |

### T2: 6 columns, 3 rows

- Width 192.5 mm (10915 twips), fixed layout, right to left.
- Position: from the right margin, offset -0.8 mm (tblInd -45). Right edge 9.2 mm from the right paper edge, left edge 8.3 mm from the left (**estimated** within about 2 mm: Word's cell-margin rule is not in the file).
- Borders: single, 0.5 pt, black, on all sides and between cells.
- Cell padding: 1.9 mm left and right, none top and bottom (the default of the table style).

| Column | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| mm | 32.6 | 25 | 33.1 | 33.1 | 33.1 | 35.7 |
| twips | 1848 | 1419 | 1874 | 1875 | 1874 | 2025 |

| Cell | Columns | Width | Row min. height | Merge, fill, vertical | Rows | Content, raw | Alignment on paper (XML) | Type |
|---|---|---|---|---|---|---|---|---|
| T2.r1.c1 | 1–6 | 192.5 mm | 11 mm | fill D9D9D9; bottom; borders top none | B-020 | [2-] معلومات السكان | right (jc=none) | Traditional Arabic bold 18 pt |
| T2.r2.c1 | 1 | 32.6 mm | 8.3 mm | no fill; bottom | B-021 | عدد الشقق المشغولة | right (jc=none) | Traditional Arabic 14 pt |
| T2.r2.c2 | 2 | 25 mm | 8.3 mm | no fill; bottom | B-021 | …… | right (jc=none) | Traditional Arabic bold 12 pt |
| T2.r2.c3 | 3 | 33.1 mm | 8.3 mm | no fill; bottom | B-022 | عدد الغير المشغولة | right (jc=none) | Traditional Arabic 14 pt |
| T2.r2.c4 | 4 | 33.1 mm | 8.3 mm | no fill; bottom | B-022 | …… | right (jc=none) | Traditional Arabic bold 12 pt |
| T2.r2.c5 | 5 | 33.1 mm | 8.3 mm | no fill; bottom | B-023 | عدد السكان التقريبي | right (jc=none) | Traditional Arabic 14 pt |
| T2.r2.c6 | 6 | 35.7 mm | 8.3 mm | no fill; bottom | B-023 | …… | right (jc=none) | Traditional Arabic bold 12 pt |
| T2.r3.c1 | 1 | 32.6 mm | 8.3 mm | no fill; bottom | B-024 | عدد الشقق الإجمالي | right (jc=none) | Traditional Arabic 14 pt |
| T2.r3.c2 | 2 | 25 mm | 8.3 mm | no fill; bottom | B-024 | …… | right (jc=none) | Traditional Arabic bold 12 pt |
| T2.r3.c3 | 3 | 33.1 mm | 8.3 mm | no fill; bottom | B-025 | معدل حركة السكان | right (jc=none) | Traditional Arabic 14 pt |
| T2.r3.c4 | 4–6 | 101.8 mm | 8.3 mm | no fill; bottom | B-025 | ☐  منخفض     ☐ متوسط        ☐ مرتفع | centre (jc=center) | ☐: MS Mincho 14 pt; text: Traditional Arabic 14 pt |

### T3: 9 columns, 7 rows

- Width 192.5 mm (10915 twips), fixed layout, right to left.
- Position: from the right margin, offset -0.8 mm (tblInd -45). Right edge 9.2 mm from the right paper edge, left edge 8.3 mm from the left (**estimated** within about 2 mm: Word's cell-margin rule is not in the file).
- Borders: single, 0.5 pt, black, on all sides and between cells.
- Cell padding: 1.9 mm left and right, none top and bottom (the default of the table style).

| Column | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|
| mm | 32.6 | 15.5 | 9.5 | 33.1 | 5.6 | 27.5 | 20.6 | 12.4 | 35.7 |
| twips | 1848 | 880 | 539 | 1874 | 316 | 1559 | 1170 | 704 | 2025 |

| Cell | Columns | Width | Row min. height | Merge, fill, vertical | Rows | Content, raw | Alignment on paper (XML) | Type |
|---|---|---|---|---|---|---|---|---|
| T3.r1.c1 | 1–9 | 192.5 mm | 11 mm | fill D9D9D9; bottom; borders top none | B-026 | [3-] مواصفات العمارة | right (jc=none) | Traditional Arabic bold 18 pt |
| T3.r2.c1 | 1 | 32.6 mm | 8.3 mm | no fill; bottom | B-027 | عدد المداخل | centre (jc=center) | Traditional Arabic 14 pt |
| T3.r2.c2 | 2–3 | 25 mm | 8.3 mm | no fill; bottom | B-027 | …… | right (jc=none) | Traditional Arabic bold 12 pt |
| T3.r2.c3 | 4 | 33.1 mm | 8.3 mm | no fill; bottom | B-028 | عدد الطوابق | centre (jc=center) | Traditional Arabic 14 pt |
| T3.r2.c4 | 5–6 | 33.1 mm | 8.3 mm | no fill; bottom | B-028 | …… | right (jc=none) | Traditional Arabic bold 12 pt |
| T3.r2.c5 | 7–8 | 33.1 mm | 8.3 mm | no fill; bottom | B-029 | عدد السلالم | centre (jc=center) | Traditional Arabic 14 pt |
| T3.r2.c6 | 9 | 35.7 mm | 8.3 mm | no fill; bottom | B-029 | …… | right (jc=none) | Traditional Arabic bold 12 pt |
| T3.r3.c1 | 1 | 32.6 mm | 8.3 mm | no fill; bottom | B-030 | عدد الشقق | centre (jc=center) | Traditional Arabic 14 pt |
| T3.r3.c2 | 2–3 | 25 mm | 8.3 mm | no fill; bottom | B-030 | …… | right (jc=none) | Traditional Arabic bold 12 pt |
| T3.r3.c3 | 4 | 33.1 mm | 8.3 mm | no fill; bottom | B-031 | عدد الممرات | centre (jc=center) | Traditional Arabic 14 pt |
| T3.r3.c4 | 5–6 | 33.1 mm | 8.3 mm | no fill; bottom | B-031 | …… | right (jc=none) | Traditional Arabic bold 12 pt |
| T3.r3.c5 | 7–8 | 33.1 mm | 8.3 mm | no fill; bottom | B-032 | عدد المصاعد | centre (jc=center) | Traditional Arabic 14 pt |
| T3.r3.c6 | 9 | 35.7 mm | 8.3 mm | no fill; bottom | B-032 | …… | right (jc=none) | Traditional Arabic bold 12 pt |
| T3.r4.c1 | 1 | 32.6 mm | 8.3 mm | no fill; bottom | B-033 | هل توجد أقبية | centre (jc=center) | Traditional Arabic 14 pt |
| T3.r4.c2 | 2–4 | 58.1 mm | 8.3 mm | no fill; bottom | B-033 | ☐ نعم                 ☐ لا | right (jc=none) | ☐: MS Mincho 14 pt; text: Traditional Arabic 14 pt |
| T3.r4.c3 | 5–6 | 33.1 mm | 8.3 mm | no fill; bottom | B-034 | مساحات خضراء | right (jc=none) | Traditional Arabic 14 pt |
| T3.r4.c4 | 7–9 | 68.8 mm | 8.3 mm | no fill; bottom | B-034 | ☐ نعم                 ☐ لا | right (jc=none) | ☐: MS Mincho 14 pt; text: Traditional Arabic 14 pt |
| T3.r5.c1 | 1 | 32.6 mm | 8.3 mm | no fill; bottom | B-035 | هل توجد مرائب | centre (jc=center) | Traditional Arabic 14 pt |
| T3.r5.c2 | 2–4 | 58.1 mm | 8.3 mm | no fill; bottom | B-035 | ☐ نعم                 ☐ لا | right (jc=none) | ☐: MS Mincho 14 pt; text: Traditional Arabic 14 pt |
| T3.r5.c3 | 5–6 | 33.1 mm | 8.3 mm | no fill; bottom | B-036 | أسطح مشتركة | right (jc=none) | Traditional Arabic 14 pt |
| T3.r5.c4 | 7–9 | 68.8 mm | 8.3 mm | no fill; bottom | B-036 | ☐ نعم                 ☐ لا | right (jc=none) | ☐: MS Mincho 14 pt; text: Traditional Arabic 14 pt |
| T3.r6.c1 | 1–9 | 192.5 mm | 8.3 mm | fill D9D9D9; bottom | B-037 | [4-] الخدمات المقدمة | right (jc=none) | Traditional Arabic bold 18 pt |
| T3.r7.c1 | 1–2 | 48.1 mm | 8.3 mm | no fill; middle | B-038 | تنظيف الأرضيات ☐ ¶ ☐ الساحات ¶ ☐ كنس وإزالة الغبار ¶ ☐ تنظيف البقع ¶ ☐  تنظيف الأبواب | centre (jc=center) | text: Traditional Arabic 14 pt; ☐: MS Mincho 14 pt |
| T3.r7.c2 | 3–5 | 48.1 mm | 8.3 mm | no fill; middle | B-038 | تنظيف الأسقف ☐ ¶ ☐ تنظيف الممرات ¶ تنظيف النوافذ ☐ ¶ جمع وفرز النفايات ☐ ¶ ☐ تنظيف الجدران | centre (jc=center) | text: Traditional Arabic 14 pt; ☐: MS Mincho 14 pt |
| T3.r7.c3 | 6–7 | 48.1 mm | 8.3 mm | no fill; middle | B-038 | تنظيف الزجاج ☐ ¶ ☐ تنظيف الزوايا ¶ ☐ تنظيف صناديق البريد ¶ تنظيف مواقف السيارات ☐ ¶ تنظيف الأجهزة ☐ | centre (jc=center) | text: Traditional Arabic 14 pt; ☐: MS Mincho 14 pt |
| T3.r7.c4 | 8–9 | 48.1 mm | 8.3 mm | no fill; middle | B-038 | ☐ المداخل ¶ ☐  الأرصفة ¶ تنظيف المرآب ☐ ¶ تنظيف المخازن ☐ ¶ تنظيف الحدائق ☐ | centre (jc=center) | ☐: MS Mincho 14 pt; text: Traditional Arabic 14 pt |

### T4: 4 columns, 2 rows

- Width 192.5 mm (10915 twips), fixed layout, right to left.
- Position: centred on the text area (floating table). Right edge 7.4 mm from the right paper edge, left edge 10.1 mm from the left (**estimated** within about 2 mm: Word's cell-margin rule is not in the file).
- Floating table: anchored to the text, 0.4 mm (21 twips) from its anchor vertically, text kept 2.5 mm away on each side. Where it lands on the page is **estimated**.
- Borders: single, 0.5 pt, black, on all sides and between cells.
- Cell padding: 1.9 mm left and right, none top and bottom (the default of the table style).

| Column | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| mm | 37.5 | 55 | 52.5 | 47.5 |
| twips | 2126 | 3118 | 2977 | 2694 |

| Cell | Columns | Width | Row min. height | Merge, fill, vertical | Rows | Content, raw | Alignment on paper (XML) | Type |
|---|---|---|---|---|---|---|---|---|
| T4.r1.c1 | 1–4 | 192.5 mm | 12.2 mm | fill D9D9D9; middle; borders top none, bottom single 0.5 pt | B-039 | [1-] الخدمات المبرمجة | right (jc=none) | Traditional Arabic bold 18 pt |
| T4.r2.c1 | 1 | 37.5 mm | 39.8 mm | no fill; middle; borders top single 0.5 pt, left single 0.5 pt, bottom single 0.5 pt, right single 0.5 pt | B-040 | تنظيف دوري ☐ ¶ تنظيف بعد البناء ☐ ¶ تنظيف بعد الترميم ☐ ¶ …… | centre (jc=center) | text: Traditional Arabic 14 pt; ☐: MS Mincho 14 pt; dots: Traditional Arabic 14 pt |
| T4.r2.c2 | 2 | 55 mm | 39.8 mm | no fill; middle; borders top single 0.5 pt, left single 0.5 pt, bottom single 0.5 pt, right single 0.5 pt | B-040 | تنظيف بعد الولائم ☐ ¶ تنظيف شامل وعميق ☐ ¶ تنظيف غ..الضيوف ☐ ¶ …… | centre (jc=center) | text: Traditional Arabic 14 pt; ☐: MS Mincho 14 pt; dots: Traditional Arabic 14 pt |
| T4.r2.c3 | 3 | 52.5 mm | 39.8 mm | no fill; middle; borders top single 0.5 pt, left single 0.5 pt, bottom single 0.5 pt, right single 0.5 pt | B-040 | تنظيف بعد السفر ☐ ¶ تنظيف رمضان ☐ ¶ إزالة المخلفات ☐ ¶ …… | centre (jc=center) | text: Traditional Arabic 14 pt; ☐: MS Mincho 14 pt; dots: Traditional Arabic 14 pt |
| T4.r2.c4 | 4 | 47.5 mm | 39.8 mm | no fill; middle; borders top single 0.5 pt, left single 0.5 pt, bottom single 0.5 pt, right single 0.5 pt | B-040 | تنظيف قبل المناسبات ☐ ¶ تنظيف بعد المناسبات ☐ ¶ …… ¶ …… | centre (jc=center) | text: Traditional Arabic 14 pt; ☐: MS Mincho 14 pt; dots: Traditional Arabic 14 pt |

### T5: 4 columns, 18 rows

- Width 192.5 mm (10915 twips), fixed layout, right to left.
- Position: from the right margin, offset -0.8 mm (tblInd -45). Right edge 9.2 mm from the right paper edge, left edge 8.3 mm from the left (**estimated** within about 2 mm: Word's cell-margin rule is not in the file).
- Borders: single, 0.5 pt, black, on all sides and between cells.
- Cell padding: 1.9 mm left and right, none top and bottom (the default of the table style).

| Column | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| mm | 32.5 | 77.5 | 32.5 | 50 |
| twips | 1842 | 4395 | 1842 | 2836 |

| Cell | Columns | Width | Row min. height | Merge, fill, vertical | Rows | Content, raw | Alignment on paper (XML) | Type |
|---|---|---|---|---|---|---|---|---|
| T5.r1.c1 | 1–4 | 192.5 mm | 2.4 mm | fill D9D9D9; middle; borders top none | B-041 | [5-] الدراسة المالية | right (jc=none) | Traditional Arabic bold 18 pt |
| T5.r2.c1 | 1–4 | 192.5 mm | 2.4 mm | no fill; middle | B-042 | [1.] نــــوع العقد: ……         قصير ☐     طويل ☐ | right (jc=none) | text: Traditional Arabic bold 16 pt and Traditional Arabic 14 pt; dots: Traditional Arabic bold 12 pt; ☐: MS Mincho 14 pt |
| T5.r3.c1 | 1 | 32.5 mm | 2.4 mm | no fill; middle | B-043 | [2.] مدة العقد | right (jc=none) | Traditional Arabic bold 16 pt |
| T5.r3.c2 | 2–4 | 160 mm | 2.4 mm | no fill; middle | B-043 | ……             شهر ☐         3 أشهر ☐         6 أشهر ☐         سنة ☐ | right (jc=none) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic 14 pt; ☐: MS Mincho 14 pt |
| T5.r4.c1 | 1 | 32.5 mm | 2.4 mm | no fill; middle | B-044 | [3.] عدد الزيارات | right (jc=none) | Traditional Arabic bold 16 pt |
| T5.r4.c2 | 2–4 | 160 mm | 2.4 mm | no fill; middle | B-044 | واحدة بالأسبوع ☐   اثنين بالأسبوع ☐   ثلاثة بالأسبوع ☐ أربعة بالأسبوع   ☐خمسة بالأسبوع   ☐ستة بالأسبوع | right (jc=none) | text: Traditional Arabic 14 pt; ☐: MS Mincho 14 pt |
| T5.r5.c1 | 1 | 32.5 mm | 2.4 mm | no fill; middle | B-045 | [4.] أيام التنفيذ | right (jc=none) | Traditional Arabic bold 16 pt |
| T5.r5.c2 | 2–4 | 160 mm | 2.4 mm | no fill; middle | B-045 | السبت  ☐      الأحد  ☐      الاثنين  ☐     الثلاثاء  ☐      الأربعاء  ☐      الخميس  ☐ | centre (jc=center) | text: Traditional Arabic 14 pt; ☐: MS Mincho 14 pt |
| T5.r6.c1 | 1 | 32.5 mm | 2.4 mm | no fill; middle | B-046 | [5.] تحديد الفترة | right (jc=none) | Traditional Arabic bold 16 pt |
| T5.r6.c2 | 2 | 77.5 mm | 2.4 mm | no fill; middle | B-046 | الصباحية ☐        المسائية ☐         معا ☐ | centre (jc=center) | text: Traditional Arabic 14 pt; ☐: MS Mincho 14 pt |
| T5.r6.c3 | 3 | 32.5 mm | 2.4 mm | no fill; middle | B-047 | من: …… | right (jc=none) | text: Traditional Arabic bold 14 pt; dots: Traditional Arabic 14 pt |
| T5.r6.c4 | 4 | 50 mm | 2.4 mm | no fill; middle | B-048 | إلى: …… | right (jc=none) | text: Traditional Arabic bold 14 pt and Traditional Arabic 14 pt; dots: Traditional Arabic 14 pt |
| T5.r7.c1 | 1 | 32.5 mm | 2.4 mm | no fill; middle | B-049 | [6.] تاريخ البداية | right (jc=none) | Traditional Arabic bold 16 pt |
| T5.r7.c2 | 2 | 77.5 mm | 2.4 mm | no fill; middle | B-049 | …… | right (jc=none) | Traditional Arabic bold 12 pt |
| T5.r7.c3 | 3 | 32.5 mm | 2.4 mm | no fill; middle | B-050 | تاريخ النهاية | centre (jc=center) | Traditional Arabic bold 16 pt |
| T5.r7.c4 | 4 | 50 mm | 2.4 mm | no fill; middle | B-050 | …… | right (jc=none) | Traditional Arabic bold 12 pt |
| T5.r8.c1 | 1 | 32.5 mm | 2.4 mm | no fill; middle | B-051 | [7.] وقت الوصول | right (jc=none) | Traditional Arabic bold 16 pt |
| T5.r8.c2 | 2 | 77.5 mm | 2.4 mm | no fill; middle | B-051, B-052 | ……  المغادرة: …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 16 pt |
| T5.r8.c3 | 3 | 32.5 mm | 2.4 mm | no fill; middle | B-053 | عدد العمال | centre (jc=center) | Traditional Arabic bold 16 pt |
| T5.r8.c4 | 4 | 50 mm | 2.4 mm | no fill; middle | B-053 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T5.r9.c1 | 1 | 32.5 mm | 2.4 mm | no fill; middle | B-054 | [8.] مسدد أتعاب | right (jc=none) | Traditional Arabic bold 16 pt |
| T5.r9.c2 | 2 | 77.5 mm | 2.4 mm | no fill; middle | B-054 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T5.r9.c3 | 3 | 32.5 mm | 2.4 mm | no fill; middle | B-055 | رقم الهاتف | centre (jc=center) | Traditional Arabic bold 16 pt |
| T5.r9.c4 | 4 | 50 mm | 2.4 mm | no fill; middle | B-055 | …… | right (jc=none) | Traditional Arabic bold 12 pt |
| T5.r10.c1 | 1 | 32.5 mm | 2 mm | no fill; middle | B-056 | [9.] مواد التنظيف | right (jc=none) | Traditional Arabic bold 16 pt |
| T5.r10.c2 | 2 | 77.5 mm | 2 mm | no fill; middle | B-056 | على عاتق المركز ☐     على عاتق صاحبها ☐ | centre (jc=center) | text: Traditional Arabic 16 pt; ☐: Traditional Arabic 16 pt |
| T5.r10.c3 | 3 | 32.5 mm | 2 mm | no fill; middle | B-057 | مصاريفها | centre (jc=center) | Traditional Arabic bold 16 pt |
| T5.r10.c4 | 4 | 50 mm | 2 mm | no fill; middle | B-057 | …… دج | right (jc=none) | dots: Traditional Arabic 12 pt; text: Traditional Arabic 14 pt |
| T5.r11.c1 | 1 | 32.5 mm | 2 mm | no fill; middle | B-058 | [10.] توفير النقل | right (jc=none) | Traditional Arabic bold 16 pt |
| T5.r11.c2 | 2 | 77.5 mm | 2 mm | no fill; middle | B-058 | على عاتق المركز ☐     على عاتق صاحبها ☐ | centre (jc=center) | text: Traditional Arabic 16 pt; ☐: Traditional Arabic 16 pt |
| T5.r11.c3 | 3 | 32.5 mm | 2 mm | no fill; middle | B-059 | مصاريفها | centre (jc=center) | Traditional Arabic bold 16 pt |
| T5.r11.c4 | 4 | 50 mm | 2 mm | no fill; middle | B-059 | …… دج | right (jc=none) | dots: Traditional Arabic 12 pt; text: Traditional Arabic 14 pt |
| T5.r12.c1 | 1 | 32.5 mm | 2 mm | no fill; middle | B-060 | [11.] طريقة السداد | right (jc=none) | Traditional Arabic bold 16 pt |
| T5.r12.c2 | 2 | 77.5 mm | 2 mm | no fill; middle | B-060 | نقدًا  ☐    تحويل بنكي  ☐       تحويل بريدي  ☐ | right (jc=none) | text: Traditional Arabic 14 pt; ☐: MS Mincho 14 pt |
| T5.r12.c3 | 3 | 32.5 mm | 2 mm | no fill; middle | B-061 | المبلغ إجمالي | centre (jc=center) | Traditional Arabic bold 16 pt |
| T5.r12.c4 | 4 | 50 mm | 2 mm | no fill; middle | B-061 | …… دج | right (jc=none) | dots: Traditional Arabic 12 pt; text: Traditional Arabic 14 pt |
| T5.r13.c1 | 1 | 32.5 mm | 2 mm | no fill; middle | B-062 | [12.] تاريخ تسديد | right (jc=none) | Traditional Arabic bold 16 pt |
| T5.r13.c2 | 2 | 77.5 mm | 2 mm | no fill; middle | B-062 | …… | right (jc=none) | Traditional Arabic bold 12 pt |
| T5.r13.c3 | 3 | 32.5 mm | 2 mm | no fill; middle | B-063 | مكان التسديد | centre (jc=center) | Traditional Arabic bold 16 pt |
| T5.r13.c4 | 4 | 50 mm | 2 mm | no fill; middle | B-063 | …… | right (jc=none) | Traditional Arabic bold 12 pt |
| T5.r14.c1 | 1 | 32.5 mm | 2 mm | no fill; middle | B-064 | [13.] دورية السداد | right (jc=none) | Traditional Arabic bold 16 pt |
| T5.r14.c2 | 2–4 | 160 mm | 2 mm | no fill; middle | B-064 | بعد كل زيارة ☐         أسبوعيا ☐         كل أسبوعين ☐         كل شهر ☐ | centre (jc=center) | text: Traditional Arabic 14 pt; ☐: MS Mincho 14 pt |
| T5.r15.c1 | 1 | 32.5 mm | 2 mm | no fill; middle | B-065 | [14.] دخول الفريق | right (jc=none) | Traditional Arabic bold 16 pt |
| T5.r15.c2 | 2–4 | 160 mm | 2 mm | no fill; middle | B-065 | ☐  عن طريق الحارس  ☐     مفتاح خاص      ☐  مسؤول العمارة       ☐  باب مفتوح خلال ساعات العمل | right (jc=none) | ☐: MS Mincho 14 pt; text: Traditional Arabic 14 pt |
| T5.r16.c1 | 1 | 32.5 mm | 2 mm | no fill; middle; borders bottom single 0.5 pt | B-066 | [15.] يوجد حارس | right (jc=none) | Traditional Arabic bold 16 pt |
| T5.r16.c2 | 2 | 77.5 mm | 2 mm | no fill; middle; borders bottom single 0.5 pt | B-066 | ☐  نعم                         ☐ لا | centre (jc=center) | ☐: MS Mincho 14 pt; text: Traditional Arabic 14 pt |
| T5.r16.c3 | 3 | 32.5 mm | 2 mm | no fill; middle; borders bottom single 0.5 pt | B-067 | تعليمات أمنية | centre (jc=center) | Traditional Arabic bold 16 pt |
| T5.r16.c4 | 4 | 50 mm | 2 mm | no fill; middle; borders bottom single 0.5 pt | B-067 | ☐  نعم            ☐ لا | centre (jc=center) | ☐: MS Mincho 14 pt; text: Traditional Arabic 14 pt |
| T5.r17.c1 | 1 | 32.5 mm | 2 mm | no fill; middle; borders bottom single 0.5 pt | B-068 | [16.] اسمه ولقبه | right (jc=none) | Traditional Arabic bold 16 pt |
| T5.r17.c2 | 2 | 77.5 mm | 2 mm | no fill; middle; borders bottom single 0.5 pt | B-068 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T5.r17.c3 | 3 | 32.5 mm | 2 mm | no fill; middle; borders bottom single 0.5 pt | B-069 | رقم الهاتف | centre (jc=center) | Traditional Arabic bold 16 pt |
| T5.r17.c4 | 4 | 50 mm | 2 mm | no fill; middle; borders bottom single 0.5 pt | B-069 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T5.r18.c1 | 1–2 | 110 mm | 14.7 mm | no fill; middle; borders top single 0.5 pt, left none, bottom none, right none | B-070 | حررت: بأم البواقي، بتاريخ: …… / …… / …… | right (jc=none) | text: Traditional Arabic 16 pt and Sakkal Majalla 16 pt; dots: Sakkal Majalla 12 pt |
| T5.r18.c2 | 3–4 | 82.5 mm | 14.7 mm | no fill; middle; borders top single 0.5 pt, left none, bottom none, right none | B-071 | الإمضـــــاء والخـــــتم | left (jc=right) | Traditional Arabic 16 pt |

### T6: 4 columns, 28 rows

- Width 192.5 mm (10915 twips), fixed layout, right to left.
- Position: from the right margin, offset -0.8 mm (tblInd -45). Right edge 9.2 mm from the right paper edge, left edge 8.3 mm from the left (**estimated** within about 2 mm: Word's cell-margin rule is not in the file).
- Borders: single, 0.5 pt, black, on all sides and between cells.
- Cell padding: 1.9 mm left and right, none top and bottom (the default of the table style).

| Column | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| mm | 17.5 | 65 | 67.5 | 42.5 |
| twips | 992 | 3685 | 3828 | 2410 |

| Cell | Columns | Width | Row min. height | Merge, fill, vertical | Rows | Content, raw | Alignment on paper (XML) | Type |
|---|---|---|---|---|---|---|---|---|
| T6.r1.c1 | 1–4 | 192.5 mm | 1.4 mm | fill D9D9D9; middle | B-072 | [6-] قائمة القاطنين بالعمارة | centre (jc=center) | Traditional Arabic bold 18 pt |
| T6.r2.c1 | 1 | 17.5 mm | 1.4 mm | no fill; middle | B-073 | الرقم | centre (jc=center) | Traditional Arabic bold 16 pt |
| T6.r2.c2 | 2 | 65 mm | 1.4 mm | no fill; middle | B-074 | اللقب والاسم | centre (jc=center) | Traditional Arabic bold 16 pt |
| T6.r2.c3 | 3 | 67.5 mm | 1.4 mm | no fill; middle | B-075 | رقم الهاتف | centre (jc=center) | Traditional Arabic bold 16 pt |
| T6.r2.c4 | 4 | 42.5 mm | 1.4 mm | no fill; middle | B-076 | تاريخ التسجيل | centre (jc=center) | Traditional Arabic bold 16 pt |
| T6.r3.c1 | 1 | 17.5 mm | 8.7 mm | no fill; middle | B-073 | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r3.c2 | 2 | 65 mm | 8.7 mm | no fill; middle | B-074 | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r3.c3 | 3 | 67.5 mm | 8.7 mm | no fill; middle | B-075 | ……/ ……/ ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r3.c4 | 4 | 42.5 mm | 8.7 mm | no fill; middle | B-076 | ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r4.c1 | 1 | 17.5 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r4.c2 | 2 | 65 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r4.c3 | 3 | 67.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r4.c4 | 4 | 42.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r5.c1 | 1 | 17.5 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r5.c2 | 2 | 65 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r5.c3 | 3 | 67.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r5.c4 | 4 | 42.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r6.c1 | 1 | 17.5 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r6.c2 | 2 | 65 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r6.c3 | 3 | 67.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r6.c4 | 4 | 42.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r7.c1 | 1 | 17.5 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r7.c2 | 2 | 65 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r7.c3 | 3 | 67.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r7.c4 | 4 | 42.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r8.c1 | 1 | 17.5 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r8.c2 | 2 | 65 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r8.c3 | 3 | 67.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r8.c4 | 4 | 42.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r9.c1 | 1 | 17.5 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r9.c2 | 2 | 65 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r9.c3 | 3 | 67.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r9.c4 | 4 | 42.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r10.c1 | 1 | 17.5 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r10.c2 | 2 | 65 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r10.c3 | 3 | 67.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r10.c4 | 4 | 42.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r11.c1 | 1 | 17.5 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r11.c2 | 2 | 65 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r11.c3 | 3 | 67.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r11.c4 | 4 | 42.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r12.c1 | 1 | 17.5 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r12.c2 | 2 | 65 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r12.c3 | 3 | 67.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r12.c4 | 4 | 42.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r13.c1 | 1 | 17.5 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r13.c2 | 2 | 65 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r13.c3 | 3 | 67.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r13.c4 | 4 | 42.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r14.c1 | 1 | 17.5 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r14.c2 | 2 | 65 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r14.c3 | 3 | 67.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r14.c4 | 4 | 42.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r15.c1 | 1 | 17.5 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r15.c2 | 2 | 65 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r15.c3 | 3 | 67.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r15.c4 | 4 | 42.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r16.c1 | 1 | 17.5 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r16.c2 | 2 | 65 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r16.c3 | 3 | 67.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r16.c4 | 4 | 42.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r17.c1 | 1 | 17.5 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r17.c2 | 2 | 65 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r17.c3 | 3 | 67.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r17.c4 | 4 | 42.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r18.c1 | 1 | 17.5 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r18.c2 | 2 | 65 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r18.c3 | 3 | 67.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r18.c4 | 4 | 42.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r19.c1 | 1 | 17.5 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r19.c2 | 2 | 65 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r19.c3 | 3 | 67.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r19.c4 | 4 | 42.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r20.c1 | 1 | 17.5 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r20.c2 | 2 | 65 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r20.c3 | 3 | 67.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r20.c4 | 4 | 42.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r21.c1 | 1 | 17.5 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r21.c2 | 2 | 65 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r21.c3 | 3 | 67.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r21.c4 | 4 | 42.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r22.c1 | 1 | 17.5 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r22.c2 | 2 | 65 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r22.c3 | 3 | 67.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r22.c4 | 4 | 42.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r23.c1 | 1 | 17.5 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r23.c2 | 2 | 65 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r23.c3 | 3 | 67.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r23.c4 | 4 | 42.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r24.c1 | 1 | 17.5 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r24.c2 | 2 | 65 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r24.c3 | 3 | 67.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r24.c4 | 4 | 42.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r25.c1 | 1 | 17.5 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r25.c2 | 2 | 65 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r25.c3 | 3 | 67.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r25.c4 | 4 | 42.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r26.c1 | 1 | 17.5 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r26.c2 | 2 | 65 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r26.c3 | 3 | 67.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r26.c4 | 4 | 42.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r27.c1 | 1 | 17.5 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r27.c2 | 2 | 65 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r27.c3 | 3 | 67.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r27.c4 | 4 | 42.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r28.c1 | 1 | 17.5 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r28.c2 | 2 | 65 mm | 8.7 mm | no fill; middle | — | …… | centre (jc=center) | Traditional Arabic bold 14 pt |
| T6.r28.c3 | 3 | 67.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T6.r28.c4 | 4 | 42.5 mm | 8.7 mm | no fill; middle | — | ……/ ……/ …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |

## 10. Options: which side the ☐ sits

"Before" means the ☐ is typed before its label, so it prints on the label's right; "after" prints on its left. Options are separated by runs of spaces, not tabs or cells, so their exact spacing is **estimated**; order and side are facts.

| Row | Label | ☐ side | Options |
|---|---|---|---|
| B-007 | حالة الملف | before | 8 |
| B-011 | جهة التعاقد | before | 7 |
| B-016 | تقييم النظافة | after | 5 |
| B-017 | تخزين معدات | before | 2 |
| B-019 | مكان التخلص من النفايات | before | 4 |
| B-025 | معدل حركة السكان | before | 3 |
| B-033 | هل توجد أقبية | before | 2 |
| B-034 | مساحات خضراء | before | 2 |
| B-035 | هل توجد مرائب | before | 2 |
| B-036 | أسطح مشتركة | before | 2 |
| B-038 | — | after / before | 20 |
| B-040 | — | after / none | 11, plus 5 dotted lines without ☐ |
| B-042 | نوع العقد: | after | 2 |
| B-043 | مدة العقد | after | 4 |
| B-044 | عدد الزيارات | after / none | 6 |
| B-045 | أيام التنفيذ | after | 6 |
| B-046 | تحديد الفترة | after | 3 |
| B-056 | مواد التنظيف | after | 2 |
| B-058 | توفير النقل | after | 2 |
| B-060 | طريقة السداد | after | 3 |
| B-064 | دورية السداد | after | 4 |
| B-065 | دخول الفريق | before | 4 |
| B-066 | يوجد حارس | before | 2 |
| B-067 | تعليمات أمنية | before | 2 |

## 11. Notes for builders

- The title is a text box over the right half of the page; the number line and the date line sit at the left, beside it. The box has a soft shadow and no outline.
- Print every label with the number shown in square brackets in section 9. Word generates those numbers; they are not in the text. Slips are reproduced (print reproduces his Word file) and listed in `differences.md` section 4.
- Labels print with their stretching characters, exactly as in the "Content, raw" column. Screens drop that character.
- Dotted blanks are rows of full stops in the file. Draw each as a dotted line filling its cell; the count of dots is not a fact.
- Options sit on one line, spaced by typed spaces. Keep their order and the side of each ☐ (section 10); spread them evenly across the cell.
- Two ☐ on this form, in «على عاتق المركز ☐ على عاتق صاحبها ☐», are typed inside Traditional Arabic runs instead of MS Mincho ones. Draw every ☐ the same.
- The last row of the financial table is open: it has a top border only. It holds «حررت: بأم البواقي، بتاريخ: ……» and, at the left, «الإمضـــــاء والخـــــتم».
- Section numbers print 1-, 2-, 3-, 4-, 1-, 5-, 6-: «الخدمات المبرمجة» restarts at 1 (F8).
- «نوع العقد:» (T5.r2) is one cell across the table holding the label with its colon, a dotted blank and the two options (K5, K10).
- «عدد الزيارات» (T5.r4) has six labels and five ☐; reproduce it as typed (F5).
- The services list (T3.r7) types the ☐ before some labels and after others (K8); section 10 gives the side of each cell's lines in the JSON.
- The residents list (T6) is 26 identical blank lines under four column headings (F12). It has no rule for a building with more residents.
- «(01):» is typed before the first phone blank (T1.r8.c2) on this form and on the home contract only (F6).
- The complexes copy is this sheet with the title «نوع الخدمة : عقد (تجمع سكني)» (scope A1, row BX-001). Nothing else changes.

## 12. What is estimated on this page

- E1. The number of pages and where each page ends (section 6). Word's recorded count is file metadata; the reading comes from the saved row heights and assumed line heights.
- E2. Every vertical position on the page: the top and bottom of the letterhead and footer pictures, where the body starts under the letterhead, where a text box or a floating table lands.
- E3. What a printer clips near the paper edges (K4).
- E4. The distance of each table's edges from the paper edges, within about 2 mm: Word shifts a table by its cell padding under a rule the file does not state.
- E5. Printed row heights. The file gives a minimum per row; the printed height depends on the fonts.
- E6. The spacing between options in a cell: it is typed with spaces.
- E7. The numbers in front of labels: computed from `numbering.xml`, not seen printed.
- E8. "Alignment on paper": Word's rule for right-to-left paragraphs applied to the XML value (`jc=left` is the right side, `jc=right` the left).
- E9. Glyph shapes and line heights. None of his fonts is installed here, and Word's substitutes for missing glyphs (☐ in Traditional Arabic runs, the emoji) are not recorded in the file.
