# Layout facts: home contract

Word file: `client docs/-04- سكن - عقد.docx`. Print sheet: home contract sheet.

Read from the Word XML by `docs/checker/tools/build_forms.py`; do not edit by hand. Nothing here was seen rendered: this machine has no Word. A fact that depends on Word's rendering is marked **estimated**. Conventions and units are in `README.md`; every cell and run is in `docs/checker/data/06-home-contract.json`. Ids (`T1.r2.c1`, `P2`, `P2.box`) are the ones in the Source column of `docs/checker-table.md`.

## 1. Source

| | |
|---|---|
| SHA-256 | `a5ae74ff837c585e6b7f216c7bbc7c71e93fece9791d7a198615e05350754c95` |
| Saved by | Microsoft Office Word, version 12.0000 (Word 2007 format) |
| Created, last saved | 2026-09-22T07:23:00Z, 2026-10-10T14:48:00Z |
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
| Traditional Arabic | 12 pt | bold | 1335 | …… |
| Traditional Arabic | 14 pt | regular | 961 | قديم |
| Traditional Arabic | 16 pt | bold | 449 | رقم الملف |
| Traditional Arabic | 16 pt | regular | 228 | مساحة البناء |
| Sakkal Majalla | 12 pt | regular | 135 | …… |
| Traditional Arabic | 12 pt | regular | 105 | …… |
| MS Mincho | 14 pt | regular | 89 | ☐ |
| Traditional Arabic | 18 pt | bold | 83 | المعلومات الأساسية للسكن |
| Arabic Typesetting | 18 pt | bold | 29 | رقـــم التســجــيـــل: |
| Traditional Arabic | 20 pt | bold | 18 | نوع الخدمة : عقد (سكن) |
| Traditional Arabic | 14 pt | bold | 10 | 01 |
| Sakkal Majalla | 16 pt | regular | 5 | / |

## 5. Glyphs and drawn shapes

- Tick box: ☐ (U+2610), 93 in all, as text characters: 89 set in MS Mincho 14 pt; 4 set in Traditional Arabic 16 pt.
- Stretching character (tatweel, U+0640): 45. It is part of his label strings and prints as typed; screens drop it.

## 6. Order of blocks, with the page estimate

Heights: "at least" is the sum of the row heights saved in the file; "about" adds line heights assumed from the type sizes (see `README.md`). The running position is measured from the top of the body area, which is 271.6 mm high. All of it is **estimated**.

| Block | What | At least | About | From, to | Page (**estimated**) |
|---|---|---|---|---|---|
| P1 | 1 empty paragraph | — | 5.1 mm | 0 to 5.1 mm | 1 |
| P2 | «رقم التسجيل: …… / ……» | — | 8 mm | 5.1 to 13.1 mm | 1 |
| P3 | «التاريخ: …… / …… / ……» | — | 10.8 mm | 13.1 to 23.8 mm | 1 |
| T1 | table, 20 rows | 152 mm | 249.9 mm | 23.8 to 273.8 mm | 1 to 2 |
| P4–P8 | 5 empty paragraphs | — | 23.7 mm | 273.8 to 297.4 mm | 2 |
| T2 | table, 18 rows | 54.2 mm | 182.6 mm | 297.4 to 480 mm | 2 |
| P9–P31 | 23 empty paragraphs | — | 108.9 mm | 480 to 588.9 mm | 2 to 3 |

Total about 588.9 mm, which is 2.2 body heights. Reading (**estimated**): two pages. Word records 1, which cannot be right: with every line only as high as its type size the file still needs 1.3 page bodies. Page 1: sections 1 to 4 (T1), which about fills it. Page 2: «الدراسة المالية» with the signature row (T2). The 23 empty paragraphs after T2 may add a blank third page in Word; do not print one.

## 7. Text boxes

**P2.box** (row HC-001), anchored to paragraph P2.

- Size 136.2 × 14.7 mm (386.15 × 41.65 pt). Left edge 57.1 mm (161.8 pt) from the left edge of the text area, which puts it 69.8 mm from the left paper edge and 4 mm from the right. Top 0.8 mm (2.35 pt) below the top of its anchor paragraph (position on the page **estimated**).
- Box: fill white, outline none. Shadow: colour black, opacity .5, offset -6pt,4pt.
- Line 1: «نوع الخدمة : عقد (سكن)». centre (jc=center); paragraph fill D9D9D9; line spacing 1.00 lines; Traditional Arabic bold 20 pt.

## 8. Paragraphs outside the tables

| Id | Rows | Alignment on paper (XML) | Indent, spacing | Mark | Text, raw | Type |
|---|---|---|---|---|---|---|
| P1 | — | — | — | — | (1 empty paragraph) | — |
| P2 | HC-002 | left (jc=right) | indent none; line 1.00, after 0 pt | — | رقـــم التســجــيـــل: …… /…… | text: Arabic Typesetting bold 18 pt and Sakkal Majalla 16 pt; dots: Sakkal Majalla 12 pt |
| P3 | HC-003 | left (jc=none) | indent right 2.5 mm; line 1.00 | — | التاريخ: …… / …… / …… | text: Arabic Typesetting bold 18 pt and Sakkal Majalla 16 pt; dots: Sakkal Majalla 12 pt |
| T1 | | | | | (table, section 9) | |
| P4–P8 | — | — | — | — | (5 empty paragraphs) | — |
| T2 | | | | | (table, section 9) | |
| P9–P31 | — | — | — | — | (23 empty paragraphs) | — |

## 9. Tables

Columns and cells are listed in file order, which is right to left on paper: column 1 and cell c1 are the rightmost. A minimum height is the row height saved in the file; the printed row is at least that high.

### T1: 14 columns, 20 rows

- Width 192.5 mm (10915 twips), fixed layout, right to left.
- Position: aligned to the right margin, its leading edge: the text of its first cell at tblInd -45 twips (-0.8 mm) from the margin, so its border 108 twips further out, by the cell padding. Right edge 7.3 mm from the right paper edge, left edge 10.2 mm from the left (**estimated**: Word's rules for a Word 2007 file, see `README.md` E4; not seen rendered).
- Borders: single, 0.5 pt, black, on all sides and between cells.
- Cell padding: 1.9 mm left and right, none top and bottom (the default of the table style).

| Column | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| mm | 32.5 | 0.1 | 15.5 | 9.5 | 7.4 | 25.7 | 1.8 | 3.8 | 13.8 | 13.7 | 18.8 | 1.9 | 12.4 | 35.7 |
| twips | 1842 | 6 | 880 | 539 | 418 | 1456 | 103 | 213 | 780 | 779 | 1063 | 107 | 704 | 2025 |

| Cell | Columns | Width | Row min. height | Merge, fill, vertical | Rows | Content, raw | Alignment on paper (XML) | Type |
|---|---|---|---|---|---|---|---|---|
| T1.r1.c1 | 1–14 | 192.5 mm | 1.4 mm | fill D9D9D9; middle; borders top none | HC-004 | [1-] المعلومات الأساسية للسكن | right (jc=none) | Traditional Arabic bold 18 pt |
| T1.r2.c1 | 1 | 32.5 mm | 1.4 mm | no fill; middle | HC-005 | [1.] رقم الملف | right (jc=none) | Traditional Arabic bold 16 pt |
| T1.r2.c2 | 2–9 | 77.5 mm | 1.4 mm | no fill; middle | HC-005 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T1.r2.c3 | 10–11 | 32.5 mm | 1.4 mm | no fill; middle | HC-006 | رقم الباب | centre (jc=center) | Traditional Arabic bold 16 pt |
| T1.r2.c4 | 12–14 | 50 mm | 1.4 mm | no fill; middle | HC-006 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T1.r3.c1 | 1 | 32.5 mm | 1.4 mm | no fill; middle | HC-007 | [2.] حالة الملف | right (jc=none) | Traditional Arabic bold 16 pt |
| T1.r3.c2 | 2–14 | 160 mm | 1.4 mm | no fill; middle | HC-007 | ☐  قديم   ☐ جديد   ☐ الزيارة    ☐ عرض سعر    ☐ متعاقد    ☐ انتهاء التعاقد   ☐ متوقف   ☐ معاقب | right (jc=none) | ☐: MS Mincho 14 pt; text: Traditional Arabic 14 pt |
| T1.r4.c1 | 1 | 32.5 mm | 1.4 mm | no fill; middle | HC-008 | [3.] نوع العقار | right (jc=none) | Traditional Arabic bold 16 pt |
| T1.r4.c2 | 2–14 | 160 mm | 1.4 mm | no fill; middle | HC-008 | ☐  منزل     ☐ شقة   ☐ دوبلكس    ☐ فيلا    ☐ أخرى: …… | right (jc=none) | ☐: MS Mincho 14 pt; text: Traditional Arabic 14 pt; dots: Traditional Arabic 14 pt |
| T1.r5.c1 | 1 | 32.5 mm | 8 mm | no fill; middle | HC-009 | [4.] اللقب والاسم | right (jc=none) | Traditional Arabic bold 16 pt |
| T1.r5.c2 | 2–9 | 77.5 mm | 8 mm | no fill; middle | HC-009 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T1.r5.c3 | 10–11 | 32.5 mm | 8 mm | no fill; middle | HC-010 | ملكية العقار | centre (jc=center) | Traditional Arabic bold 16 pt |
| T1.r5.c4 | 12–14 | 50 mm | 8 mm | no fill; middle | HC-010 | ملك ☐      مسأجر ☐ | centre (jc=center) | text: Traditional Arabic 14 pt; ☐: MS Mincho 14 pt |
| T1.r6.c1 | 1 | 32.5 mm | 1.4 mm | no fill; middle | HC-011 | [5.] العنوان مدقق | right (jc=none) | Traditional Arabic bold 16 pt |
| T1.r6.c2 | 2–9 | 77.5 mm | 1.4 mm | no fill; middle | HC-011 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T1.r6.c3 | 10–11 | 32.5 mm | 1.4 mm | no fill; middle | HC-012 | البلدية / الولاية | centre (jc=center) | Traditional Arabic bold 16 pt |
| T1.r6.c4 | 12–14 | 50 mm | 1.4 mm | no fill; middle | HC-012 | ……/…… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 12 pt |
| T1.r7.c1 | 1 | 32.5 mm | 1.4 mm | no fill; middle | HC-013 | [6.] اسم المتداول | right (jc=none) | Traditional Arabic bold 16 pt |
| T1.r7.c2 | 2–14 | 160 mm | 1.4 mm | no fill; middle | HC-013 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T1.r8.c1 | 1 | 32.5 mm | 1.4 mm | no fill; middle | HC-014 | [7.] رقم الهاتف | right (jc=none) | Traditional Arabic bold 16 pt |
| T1.r8.c2 | 2–9 | 77.5 mm | 1.4 mm | no fill; middle | HC-014 | (01): …… | centre (jc=center) | text: Traditional Arabic bold 12 pt and Traditional Arabic bold 14 pt; dots: Traditional Arabic bold 12 pt |
| T1.r8.c3 | 10–11 | 32.5 mm | 1.4 mm | no fill; middle | HC-015 | تاريخ الزيارة | centre (jc=center) | Traditional Arabic bold 16 pt |
| T1.r8.c4 | 12–14 | 50 mm | 1.4 mm | no fill; middle | HC-015 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T1.r9.c1 | 1 | 32.5 mm | 1.4 mm | no fill; middle | HC-016 | [8.] تقييم النظافة | right (jc=none) | Traditional Arabic bold 16 pt |
| T1.r9.c2 | 2–14 | 160 mm | 1.4 mm | no fill; middle | HC-016 | ……        ممتاز ☐    جيد ☐     متوسط ☐     ضعيف ☐     يحتاج إلى تنظيف عميق ☐ | centre (jc=center) | dots: Traditional Arabic 14 pt; text: Traditional Arabic 14 pt; ☐: MS Mincho 14 pt |
| T1.r10.c1 | 1 | 32.5 mm | 1.4 mm | no fill; middle | HC-017 | [9.] تخزين معدات | centre (jc=center) | Traditional Arabic bold 16 pt |
| T1.r10.c2 | 2–5 | 32.5 mm | 1.4 mm | no fill; middle | HC-017 | ☐ نعم      ☐ لا | right (jc=none) | ☐: MS Mincho 14 pt; text: Traditional Arabic 14 pt |
| T1.r10.c3 | 6–7 | 27.5 mm | 1.4 mm | no fill; middle | HC-018 | اسم المكان | centre (jc=center) | Traditional Arabic bold 16 pt |
| T1.r10.c4 | 8–14 | 100 mm | 1.4 mm | no fill; middle | HC-018 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T1.r11.c1 | 1–5 | 65 mm | 1.4 mm | no fill; middle | HC-019 | [10.] مكــــــــــان التخـــــلص مــــــن النفايات | right (jc=none) | Traditional Arabic bold 16 pt |
| T1.r11.c2 | 6–14 | 127.5 mm | 1.4 mm | no fill; middle | HC-019 | ☐  نقطة التجميع  ☐  إلى الحاويات  ☐  تعليمات العمارة  ☐  …… | centre (jc=center) | ☐: MS Mincho 14 pt; text: Traditional Arabic 14 pt; dots: Traditional Arabic 14 pt |
| T1.r12.c1 | 1–14 | 192.5 mm | 11 mm | fill D9D9D9; middle | HC-020 | [2-] الوصف الفني للموقع | right (jc=none) | Traditional Arabic bold 18 pt |
| T1.r13.c1 | 1–2 | 32.6 mm | 8.3 mm | no fill; middle | HC-021 | مساحة البناء | centre (jc=center) | Traditional Arabic 16 pt |
| T1.r13.c2 | 3–4 | 25 mm | 8.3 mm | no fill; middle | HC-021 | …… م2 | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 14 pt |
| T1.r13.c3 | 5–6 | 33.1 mm | 8.3 mm | no fill; middle | HC-022 | عدد الطوابق | centre (jc=center) | Traditional Arabic 16 pt |
| T1.r13.c4 | 7–10 | 33.1 mm | 8.3 mm | no fill; middle | HC-022 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T1.r13.c5 | 11–13 | 33.1 mm | 8.3 mm | no fill; middle | HC-023 | عدد الغرف | centre (jc=center) | Traditional Arabic 16 pt |
| T1.r13.c6 | 14 | 35.7 mm | 8.3 mm | no fill; middle | HC-023 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T1.r14.c1 | 1–2 | 32.6 mm | 8.3 mm | no fill; middle | HC-024 | عدد المجالس | centre (jc=center) | Traditional Arabic 16 pt |
| T1.r14.c2 | 3–4 | 25 mm | 8.3 mm | no fill; middle | HC-024 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T1.r14.c3 | 5–6 | 33.1 mm | 8.3 mm | no fill; middle | HC-025 | عدد الصالونات | centre (jc=center) | Traditional Arabic 16 pt |
| T1.r14.c4 | 7–10 | 33.1 mm | 8.3 mm | no fill; middle | HC-025 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T1.r14.c5 | 11–13 | 33.1 mm | 8.3 mm | no fill; middle | HC-026 | عدد المطابخ | centre (jc=center) | Traditional Arabic 16 pt |
| T1.r14.c6 | 14 | 35.7 mm | 8.3 mm | no fill; middle | HC-026 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T1.r15.c1 | 1–2 | 32.6 mm | 8.3 mm | no fill; middle | HC-027 | عدد الحمامات | centre (jc=center) | Traditional Arabic 16 pt |
| T1.r15.c2 | 3–4 | 25 mm | 8.3 mm | no fill; middle | HC-027 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T1.r15.c3 | 5–6 | 33.1 mm | 8.3 mm | no fill; middle | HC-028 | عدد الشرفات | centre (jc=center) | Traditional Arabic 16 pt |
| T1.r15.c4 | 7–10 | 33.1 mm | 8.3 mm | no fill; middle | HC-028 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T1.r15.c5 | 11–13 | 33.1 mm | 8.3 mm | no fill; middle | HC-029 | عدد النوافذ | centre (jc=center) | Traditional Arabic 16 pt |
| T1.r15.c6 | 14 | 35.7 mm | 8.3 mm | no fill; middle | HC-029 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T1.r16.c1 | 1–2 | 32.6 mm | 8.3 mm | no fill; middle | HC-030 | نوع الأرضيات | centre (jc=center) | Traditional Arabic 16 pt |
| T1.r16.c2 | 3–4 | 25 mm | 8.3 mm | no fill; middle | HC-030 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T1.r16.c3 | 5–6 | 33.1 mm | 8.3 mm | no fill; middle | HC-031 | مساحة الحديقة | centre (jc=center) | Traditional Arabic 16 pt |
| T1.r16.c4 | 7–10 | 33.1 mm | 8.3 mm | no fill; middle | HC-031 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T1.r16.c5 | 11–13 | 33.1 mm | 8.3 mm | no fill; middle | HC-032 | مساحة الفناء | centre (jc=center) | Traditional Arabic 16 pt |
| T1.r16.c6 | 14 | 35.7 mm | 8.3 mm | no fill; middle | HC-032 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T1.r17.c1 | 1–14 | 192.5 mm | 8.3 mm | fill D9D9D9; middle | HC-033 | [3-] الخدمات المقدمة | right (jc=none) | Traditional Arabic bold 18 pt |
| T1.r18.c1 | 1–3 | 48.1 mm | 38.3 mm | no fill; middle | HC-034 | تنظيف الأرضيات ☐ ¶ تنظيف المطبخ ☐ ¶ تنظيف الستائر ☐ ¶ تنظيف النوافذ ☐ | centre (jc=center) | text: Traditional Arabic 14 pt; ☐: MS Mincho 14 pt |
| T1.r18.c2 | 4–8 | 48.1 mm | 38.3 mm | no fill; middle | HC-034 | تنظيف الأسقف ☐ ¶ تنظيف الثلاجة ☐ ¶ تنظيف الحمامات ☐ ¶ …… ☐ | centre (jc=center) | text: Traditional Arabic 14 pt; ☐: MS Mincho 14 pt; dots: Traditional Arabic 14 pt |
| T1.r18.c3 | 9–12 | 48.1 mm | 38.3 mm | no fill; middle | HC-034 | تنظيف الزجاج ☐ ¶ تنظيف الفرن ☐ ¶ تنظيف السجاد ☐ ¶ …… ☐ | centre (jc=center) | text: Traditional Arabic 14 pt; ☐: MS Mincho 14 pt; dots: Traditional Arabic 14 pt |
| T1.r18.c4 | 13–14 | 48.1 mm | 38.3 mm | no fill; middle | HC-034 | تنظيف الخزائن ☐ ¶ تنظيف غرف الأطفال ☐ ¶ تنظيف المرآب ☐ ¶ …… ☐ | centre (jc=center) | text: Traditional Arabic 14 pt; ☐: MS Mincho 14 pt; dots: Traditional Arabic 14 pt |
| T1.r19.c1 | 1–14 | 192.5 mm | 9.6 mm | fill D9D9D9; middle | HC-035 | [4-] نوع الخدمة المبرمجة | right (jc=none) | Traditional Arabic bold 18 pt |
| T1.r20.c1 | 1–3 | 48.1 mm | 29.7 mm | no fill; middle | HC-036 | تنظيف دوري ☐ ¶ تنظيف بعد البناء ☐ ¶ تنظيف بعد الترميم ☐ | centre (jc=center) | text: Traditional Arabic 14 pt; ☐: MS Mincho 14 pt |
| T1.r20.c2 | 4–8 | 48.1 mm | 29.7 mm | no fill; middle | HC-036 | تنظيف بعد الولائم ☐ ¶ تنظيف شامل ☐ ¶ تنظيف غ..الضيوف ☐ | centre (jc=center) | text: Traditional Arabic 14 pt; ☐: MS Mincho 14 pt |
| T1.r20.c3 | 9–12 | 48.1 mm | 29.7 mm | no fill; middle | HC-036 | تنظيف بعد السفر ☐ ¶ تنظيف رمضان ☐ ¶ إزالة المخلفات ☐ | centre (jc=center) | text: Traditional Arabic 14 pt; ☐: MS Mincho 14 pt |
| T1.r20.c4 | 13–14 | 48.1 mm | 29.7 mm | no fill; middle | HC-036 | تنظيف قبل المناسبات ☐ ¶ تنظيف بعد المناسبات ☐ ¶ تنظيف عميق ☐ | centre (jc=center) | text: Traditional Arabic 14 pt; ☐: MS Mincho 14 pt |

### T2: 4 columns, 18 rows

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
| T2.r1.c1 | 1–4 | 192.5 mm | 2.4 mm | fill D9D9D9; middle; borders top none | HC-037 | [5-] الدراسة المالية | right (jc=none) | Traditional Arabic bold 18 pt |
| T2.r2.c1 | 1–4 | 192.5 mm | 2.4 mm | no fill; middle | HC-038 | [1.] نــــوع العقد: ……         قصير ☐     طويل ☐ | right (jc=none) | text: Traditional Arabic bold 16 pt and Traditional Arabic 14 pt; dots: Traditional Arabic bold 12 pt; ☐: MS Mincho 14 pt |
| T2.r3.c1 | 1 | 32.5 mm | 2.4 mm | no fill; middle | HC-039 | [2.] مدة العقد | right (jc=none) | Traditional Arabic bold 16 pt |
| T2.r3.c2 | 2–4 | 160 mm | 2.4 mm | no fill; middle | HC-039 | ……             شهر ☐         3 أشهر ☐         6 أشهر ☐         سنة ☐ | right (jc=none) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic 14 pt; ☐: MS Mincho 14 pt |
| T2.r4.c1 | 1 | 32.5 mm | 2.4 mm | no fill; middle | HC-040 | [3.] عدد الزيارات | right (jc=none) | Traditional Arabic bold 16 pt |
| T2.r4.c2 | 2–4 | 160 mm | 2.4 mm | no fill; middle | HC-040 | واحدة بالأسبوع ☐   اثنين بالأسبوع ☐   ثلاثة بالأسبوع ☐ أربعة بالأسبوع   ☐خمسة بالأسبوع   ☐ستة بالأسبوع | right (jc=none) | text: Traditional Arabic 14 pt; ☐: MS Mincho 14 pt |
| T2.r5.c1 | 1 | 32.5 mm | 2.4 mm | no fill; middle | HC-041 | [4.] أيام التنفيذ | right (jc=none) | Traditional Arabic bold 16 pt |
| T2.r5.c2 | 2–4 | 160 mm | 2.4 mm | no fill; middle | HC-041 | السبت  ☐      الأحد  ☐      الاثنين  ☐     الثلاثاء  ☐      الأربعاء  ☐      الخميس  ☐ | centre (jc=center) | text: Traditional Arabic 14 pt; ☐: MS Mincho 14 pt |
| T2.r6.c1 | 1 | 32.5 mm | 2.4 mm | no fill; middle | HC-042 | [5.] تحديد الفترة | right (jc=none) | Traditional Arabic bold 16 pt |
| T2.r6.c2 | 2 | 77.5 mm | 2.4 mm | no fill; middle | HC-042 | الصباحية ☐        المسائية ☐         معا ☐ | centre (jc=center) | text: Traditional Arabic 14 pt; ☐: MS Mincho 14 pt |
| T2.r6.c3 | 3 | 32.5 mm | 2.4 mm | no fill; middle | HC-043 | من: …… | right (jc=none) | text: Traditional Arabic bold 14 pt; dots: Traditional Arabic 14 pt |
| T2.r6.c4 | 4 | 50 mm | 2.4 mm | no fill; middle | HC-044 | إلى: …… | right (jc=none) | text: Traditional Arabic bold 14 pt and Traditional Arabic 14 pt; dots: Traditional Arabic 14 pt |
| T2.r7.c1 | 1 | 32.5 mm | 2.4 mm | no fill; middle | HC-045 | [6.] تاريخ البداية | right (jc=none) | Traditional Arabic bold 16 pt |
| T2.r7.c2 | 2 | 77.5 mm | 2.4 mm | no fill; middle | HC-045 | …… | right (jc=none) | Traditional Arabic bold 12 pt |
| T2.r7.c3 | 3 | 32.5 mm | 2.4 mm | no fill; middle | HC-046 | تاريخ النهاية | centre (jc=center) | Traditional Arabic bold 16 pt |
| T2.r7.c4 | 4 | 50 mm | 2.4 mm | no fill; middle | HC-046 | …… | right (jc=none) | Traditional Arabic bold 12 pt |
| T2.r8.c1 | 1 | 32.5 mm | 2.4 mm | no fill; middle | HC-047 | [7.] وقت الوصول | right (jc=none) | Traditional Arabic bold 16 pt |
| T2.r8.c2 | 2 | 77.5 mm | 2.4 mm | no fill; middle | HC-047, HC-048 | ……  المغادرة: …… | centre (jc=center) | dots: Traditional Arabic bold 12 pt; text: Traditional Arabic bold 16 pt |
| T2.r8.c3 | 3 | 32.5 mm | 2.4 mm | no fill; middle | HC-049 | عدد العمال | centre (jc=center) | Traditional Arabic bold 16 pt |
| T2.r8.c4 | 4 | 50 mm | 2.4 mm | no fill; middle | HC-049 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T2.r9.c1 | 1 | 32.5 mm | 2.4 mm | no fill; middle | HC-050 | [8.] مسدد أتعاب | right (jc=none) | Traditional Arabic bold 16 pt |
| T2.r9.c2 | 2 | 77.5 mm | 2.4 mm | no fill; middle | HC-050 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T2.r9.c3 | 3 | 32.5 mm | 2.4 mm | no fill; middle | HC-051 | رقم الهاتف | centre (jc=center) | Traditional Arabic bold 16 pt |
| T2.r9.c4 | 4 | 50 mm | 2.4 mm | no fill; middle | HC-051 | …… | right (jc=none) | Traditional Arabic bold 12 pt |
| T2.r10.c1 | 1 | 32.5 mm | 2 mm | no fill; middle | HC-052 | [9.] مواد التنظيف | right (jc=none) | Traditional Arabic bold 16 pt |
| T2.r10.c2 | 2 | 77.5 mm | 2 mm | no fill; middle | HC-052 | على عاتق المركز ☐     على عاتق صاحبها ☐ | centre (jc=center) | text: Traditional Arabic 16 pt; ☐: Traditional Arabic 16 pt |
| T2.r10.c3 | 3 | 32.5 mm | 2 mm | no fill; middle | HC-053 | مصاريفها | centre (jc=center) | Traditional Arabic bold 16 pt |
| T2.r10.c4 | 4 | 50 mm | 2 mm | no fill; middle | HC-053 | …… دج | right (jc=none) | dots: Traditional Arabic 12 pt; text: Traditional Arabic 14 pt |
| T2.r11.c1 | 1 | 32.5 mm | 2 mm | no fill; middle | HC-054 | [10.] توفير النقل | right (jc=none) | Traditional Arabic bold 16 pt |
| T2.r11.c2 | 2 | 77.5 mm | 2 mm | no fill; middle | HC-054 | على عاتق المركز ☐     على عاتق صاحبها ☐ | centre (jc=center) | text: Traditional Arabic 16 pt; ☐: Traditional Arabic 16 pt |
| T2.r11.c3 | 3 | 32.5 mm | 2 mm | no fill; middle | HC-055 | مصاريفها | centre (jc=center) | Traditional Arabic bold 16 pt |
| T2.r11.c4 | 4 | 50 mm | 2 mm | no fill; middle | HC-055 | …… دج | right (jc=none) | dots: Traditional Arabic 12 pt; text: Traditional Arabic 14 pt |
| T2.r12.c1 | 1 | 32.5 mm | 2 mm | no fill; middle | HC-056 | [11.] طريقة السداد | right (jc=none) | Traditional Arabic bold 16 pt |
| T2.r12.c2 | 2 | 77.5 mm | 2 mm | no fill; middle | HC-056 | نقدًا  ☐    تحويل بنكي  ☐       تحويل بريدي  ☐ | right (jc=none) | text: Traditional Arabic 14 pt; ☐: MS Mincho 14 pt |
| T2.r12.c3 | 3 | 32.5 mm | 2 mm | no fill; middle | HC-057 | المبلغ إجمالي | centre (jc=center) | Traditional Arabic bold 16 pt |
| T2.r12.c4 | 4 | 50 mm | 2 mm | no fill; middle | HC-057 | …… دج | right (jc=none) | dots: Traditional Arabic 12 pt; text: Traditional Arabic 14 pt |
| T2.r13.c1 | 1 | 32.5 mm | 2 mm | no fill; middle | HC-058 | [12.] تاريخ تسديد | right (jc=none) | Traditional Arabic bold 16 pt |
| T2.r13.c2 | 2 | 77.5 mm | 2 mm | no fill; middle | HC-058 | …… | right (jc=none) | Traditional Arabic bold 12 pt |
| T2.r13.c3 | 3 | 32.5 mm | 2 mm | no fill; middle | HC-059 | مكان التسديد | centre (jc=center) | Traditional Arabic bold 16 pt |
| T2.r13.c4 | 4 | 50 mm | 2 mm | no fill; middle | HC-059 | …… | right (jc=none) | Traditional Arabic bold 12 pt |
| T2.r14.c1 | 1 | 32.5 mm | 2 mm | no fill; middle | HC-060 | [13.] دورية السداد | right (jc=none) | Traditional Arabic bold 16 pt |
| T2.r14.c2 | 2–4 | 160 mm | 2 mm | no fill; middle | HC-060 | بعد كل زيارة ☐         أسبوعيا ☐         كل أسبوعين ☐         كل شهر ☐ | centre (jc=center) | text: Traditional Arabic 14 pt; ☐: MS Mincho 14 pt |
| T2.r15.c1 | 1 | 32.5 mm | 2 mm | no fill; middle | HC-061 | [14.] دخول الفريق | right (jc=none) | Traditional Arabic bold 16 pt |
| T2.r15.c2 | 2–4 | 160 mm | 2 mm | no fill; middle | HC-061 | ☐  عن طريق الحارس  ☐  مفتاح خاص      ☐  مسؤول العمارة       ☐  باب مفتوح خلال ساعات العمل | right (jc=none) | ☐: MS Mincho 14 pt; text: Traditional Arabic 14 pt |
| T2.r16.c1 | 1 | 32.5 mm | 2 mm | no fill; middle | HC-062 | [15.] يوجد حارس | right (jc=none) | Traditional Arabic bold 16 pt |
| T2.r16.c2 | 2 | 77.5 mm | 2 mm | no fill; middle | HC-062 | ☐  نعم                         ☐ لا | centre (jc=center) | ☐: MS Mincho 14 pt; text: Traditional Arabic 14 pt |
| T2.r16.c3 | 3 | 32.5 mm | 2 mm | no fill; middle | HC-063 | تعليمات أمنية | centre (jc=center) | Traditional Arabic bold 16 pt |
| T2.r16.c4 | 4 | 50 mm | 2 mm | no fill; middle | HC-063 | ☐  نعم            ☐ لا | centre (jc=center) | ☐: MS Mincho 14 pt; text: Traditional Arabic 14 pt |
| T2.r17.c1 | 1 | 32.5 mm | 2 mm | no fill; middle; borders bottom single 0.5 pt | HC-064 | [16.] اسمه ولقبه | right (jc=none) | Traditional Arabic bold 16 pt |
| T2.r17.c2 | 2 | 77.5 mm | 2 mm | no fill; middle; borders bottom single 0.5 pt | HC-064 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T2.r17.c3 | 3 | 32.5 mm | 2 mm | no fill; middle; borders bottom single 0.5 pt | HC-065 | رقم الهاتف | centre (jc=center) | Traditional Arabic bold 16 pt |
| T2.r17.c4 | 4 | 50 mm | 2 mm | no fill; middle; borders bottom single 0.5 pt | HC-065 | …… | centre (jc=center) | Traditional Arabic bold 12 pt |
| T2.r18.c1 | 1–2 | 110 mm | 16.2 mm | no fill; middle; borders top single 0.5 pt, left none, bottom none, right none | HC-066 | حررت: بأم البواقي، بتاريخ: …… / …… / …… | right (jc=none) | text: Traditional Arabic 16 pt and Sakkal Majalla 16 pt; dots: Sakkal Majalla 12 pt |
| T2.r18.c2 | 3–4 | 82.5 mm | 16.2 mm | no fill; middle; borders top single 0.5 pt, left none, bottom none, right none | HC-067 | الإمضـــــاء والخـــــتم | left (jc=right) | Traditional Arabic 16 pt |

## 10. Options: which side the ☐ sits

"Before" means the ☐ is typed before its label, so it prints on the label's right; "after" prints on its left. Options are separated by runs of spaces, not tabs or cells, so their exact spacing is **estimated**; order and side are facts.

| Row | Label | ☐ side | Options |
|---|---|---|---|
| HC-007 | حالة الملف | before | 8 |
| HC-008 | نوع العقار | before | 5 |
| HC-010 | ملكية العقار | after | 2 |
| HC-016 | تقييم النظافة | after | 5 |
| HC-017 | تخزين معدات | before | 2 |
| HC-019 | مكان التخلص من النفايات | before | 4 |
| HC-034 | — | after | 16 |
| HC-036 | — | after | 12 |
| HC-038 | نوع العقد: | after | 2 |
| HC-039 | مدة العقد | after | 4 |
| HC-040 | عدد الزيارات | after / none | 6 |
| HC-041 | أيام التنفيذ | after | 6 |
| HC-042 | تحديد الفترة | after | 3 |
| HC-052 | مواد التنظيف | after | 2 |
| HC-054 | توفير النقل | after | 2 |
| HC-056 | طريقة السداد | after | 3 |
| HC-060 | دورية السداد | after | 4 |
| HC-061 | دخول الفريق | before | 4 |
| HC-062 | يوجد حارس | before | 2 |
| HC-063 | تعليمات أمنية | before | 2 |

## 11. Notes for builders

- The title is a text box over the right half of the page; the number line and the date line sit at the left, beside it. The box has a soft shadow and no outline.
- Print every label with the number shown in square brackets in section 9. Word generates those numbers; they are not in the text. Slips are reproduced (print reproduces his Word file) and listed in `differences.md` section 4.
- Labels print with their stretching characters, exactly as in the "Content, raw" column. Screens drop that character.
- Dotted blanks are rows of full stops in the file. Draw each as a dotted line filling its cell; the count of dots is not a fact.
- Options sit on one line, spaced by typed spaces. Keep their order and the side of each ☐ (section 10); spread them evenly across the cell.
- Two ☐ on this form, in «على عاتق المركز ☐ على عاتق صاحبها ☐», are typed inside Traditional Arabic runs instead of MS Mincho ones. Draw every ☐ the same.
- The last row of the financial table is open: it has a top border only. It holds «حررت: بأم البواقي، بتاريخ: ……» and, at the left, «الإمضـــــاء والخـــــتم».
- Sections 1 to 4 are one table of 14 narrow columns (T1); take the widths from the Cell rows, not from the column grid.
- «نوع العقد:» (T2.r2) is one cell across the table holding the label with its colon, a dotted blank and the two options (K5, K10).
- «عدد الزيارات» (T2.r4) has six labels and five ☐; reproduce it as typed (F5).
- «مسأجر» under «ملكية العقار» (T1.r5.c4) is printed and shown as «مستأجر» (scope A8). «تنظيف غ..الضيوف» stays as typed.
- «(01):» is typed before the first phone blank (T1.r8.c2) on this form and on the building contract only (F6).
- T2 is an ordinary table here and a floating one on the home request (K18).

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
