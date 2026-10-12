# Differences between the forms, and the Checker's findings

Written by `docs/checker/tools/build_forms.py` from the Word XML; the K list is the Checker's and lives in `docs/checker/tools/form_notes.py`.

One shared print component for the five client sheets will erase what is listed here unless it takes each sheet's own strings. Print reproduces each Word file as it is, slips included; the only corrections in force are those of scope A8.

## 1. Findings not in scope section 7

| Id | Finding | Where |
|---|---|---|
| K1 | The worker form prints on four pages, not two. Word's own count is 4, its one page-break marker sits at the regulations title, and the two registration tables need at least 217 mm and 164 mm against a body of 269.5 mm. The regulations are pages 3 and 4, not "the second page" (scope P9). **estimated** | `01-worker.md` section 6 |
| K2 | No form has an explicit page break. Pages are separated by runs of empty paragraphs (up to 23) and by floating tables, so the breaks move with any change of font or row height. Word records 1 page for the four home and organisation forms; that cannot be right: with every line only as high as its type size they still need 1.3 to 1.5 page bodies. They print on two pages. **estimated** | section 6 of each layout file |
| K3 | The letterhead picture is stretched: 63% of its natural height on the worker form, 56% on the five client forms; the footer 91%. One picture, two placements. | `00-letterhead.md`; rows W-071, W-072 and their siblings |
| K4 | Pictures and tables run into the strip most printers cannot print: the header starts about 2 mm from the top edge, the footer ends at the bottom edge (about 2 mm past it on the client forms), and the tables come within 3 to 10 mm of the side edges. **estimated** | `00-letterhead.md`; section 9 of each layout file |
| K5 | A dotted blank comes before the options, with no label of its own: «تقييم النظافة» on the five client forms, «نوع الطلب» on the two request forms, «نوع العقد:» and «مدة العقد» on the three contract forms. | B-016, B-042, B-043 and their siblings |
| K6 | On the organisation forms the last row of «الوصف الفني للموقع» ends with a dotted blank whose label cell is empty. | OR-037, OC-037 |
| K7 | «السجل التجاري» offers «لا» then «نعم». Every other yes / no on the forms is «نعم» then «لا». | OR-010, OC-010 |
| K8 | The side of the ☐ is not constant. It is typed before the label on some fields and after it on others, and both ways inside the building services list. | section 10 of each layout file; B-038 |
| K9 | The worker form uses emoji (🔹 twelve times, ✍️ once) and Symbol-font list bullets. The fonts named in the file have no such glyphs, so Word substitutes; an offline program needs local glyphs or drawn marks. | W-027, W-048, W-060, W-065 |
| K10 | Sibling forms differ in small ways beyond F6: «يوجد حارس ؟» on the request forms and «يوجد حارس» on the contract forms; «نوع الخدمة المبرمجة» on the home forms and «الخدمات المبرمجة» on the others; «نوع الطلب» in a cell of its own, but «نوع العقد:» with a colon in one merged cell with its blank and options; the «البلدية / الولاية» blank undivided on the home request and split by a slash elsewhere; «مساحة البناء» with the unit «م2» on the home forms and with none on the organisation forms. | `differences.md` section 2 |
| K11 | «أخرى» is written three ways: «أخرى: ……» with a blank under «نوع العقار» on the home forms, a bare «أخرى» on the organisation forms, and on the building form's «جهة التعاقد» a blank typed as underscores then dots. | HR-008, HC-008, OR-008, OC-008, B-011 |
| K12 | The building services list mixes places («الساحات», «المداخل», «الأرصفة») with tasks and carries items of the organisation list («تنظيف الأجهزة», «تنظيف المخازن», «تنظيف مواقف السيارات», «تنظيف المرآب», «تنظيف الحدائق»). | B-038 |
| K13 | Room for "other" differs from list to list: three blank options with a ☐ on the home services list; four dotted lines without a ☐ on the organisation one, two of them sharing a line with an option; none on the building one. Programmed services: five dotted lines without a ☐ on the organisation and building forms, none on the home forms. | `differences.md` section 3 |
| K14 | The centre is named three ways inside the worker form: «مركز إنماء» in the title (no «برو»), «مركز إنماء برو» under the last signature, «المؤسسة» in the pledges and the regulations. | W-001, W-027, W-070 |
| K15 | Some blanks on the worker form are drawn in parts: «تاريخ الإزدياد» is a slash and three parts, the third far longer than a year needs; both «رقم الهاتف» are five parts between slashes; «بلدية/ولاية إقامة» is split by a slash while the birth «البلدية / الولاية» is not. | W-007, W-010, W-012, W-017 |
| K16 | «اسم الشهادة» has an empty cell beside it: the only blank on the worker form with no dotted line. | W-020 |
| K17 | The regulations part repeats «رقم التسجيل …… /H/F» and «التاريخ» at its top, so each part carries the number and the date. | W-045, W-046 |
| K18 | Sibling files differ in construction where they look alike: the financial table floats on the two request forms and is an ordinary table on the three contract forms; its first and third columns are 1841 and 1843 twips on the request forms, 1842 and 1842 on the contract forms; the home forms put sections 1 to 4 in one 14-column table where the organisation and building forms use two or three. | `differences.md` section 5 |
| K19 | Handwritten stock page: only «جرد المخزون» (with «جرد المعدات» and «جرد المواد») and «التسليم» are on it. «المشتريات» and «الصيانة», which the scope puts in the same section, come from plan features 34 and 35, not from his notes. | N2-02 to N2-05 |
| K20 | Handwritten stock page, numbering: «1/ قسم جرد المخزون» is followed by «(2)/ قسم التسليم»; under it «1- نوع الخدمة» has no «2-» beside it, while its two values are numbered «1-» and «2-». | N2-05, N2-07 |
| K21 | Handwritten red line: the box he drew after «قديم» has a mark inside it, where his forms print an empty ☐. It reads as the ticked «☐ قديم» box of «حالة الملف», which bears on H3. Weak read. | N1-01 |
| K22 | The first half of the worker form's title («استمارة التسجيـ») carries a light-grey text highlight on top of the grey paragraph fill; the second half does not. Probably an accident of editing; Word prints it. | W-001; `01-worker.md` section 7 |
| K23 | On the two home forms the «2» of «م2» after «مساحة البناء» is a superscript run (`w:vertAlign`), so Word prints it raised: «م²». The layout tables and the table's rows write it «م2», as the text is stored; print must raise the digit. Found during the print audit of 2026-10-12, on which Clients' sheet already raises it. | HR-021, HC-021 |

## 2. The same label on the five client forms

A row is listed when the label is not on all five forms, or when its options or blank differ between forms. `—` means the form does not have it. Cell contents are the options or blank as in `docs/checker-table.md`, shortened to the count when the list is long.

| Label | B | OR | OC | HR | HC |
|---|---|---|---|---|---|
| المعلومات الأساسية للعميل | B-004: — | — | — | — | — |
| رقم العمارة | B-006: …… | — | — | — | — |
| البلدية / الولاية | B-009: …… / …… | OR-012: …… / …… | OC-012: …… / …… | HR-012: …… | HC-012: …… / …… |
| جهة التعاقد | B-011: 7 options | — | — | — | — |
| اسم المسئول | B-012: …… | — | — | — | — |
| الصفة | B-013: …… | — | — | — | — |
| رقم الهاتف | B-014: (01): …… | OR-016: …… | OC-016: …… | HR-014: …… | HC-014: (01): …… |
| تاريخ الزيارة | B-015: …… | — | — | HR-015: …… | HC-015: …… |
| معلومات السكان | B-020: — | — | — | — | — |
| عدد الشقق المشغولة | B-021: …… | — | — | — | — |
| عدد الغير المشغولة | B-022: …… | — | — | — | — |
| عدد السكان التقريبي | B-023: …… | — | — | — | — |
| عدد الشقق الإجمالي | B-024: …… | — | — | — | — |
| معدل حركة السكان | B-025: [1] منخفض · [2] متوسط · [3] مرتفع | — | — | — | — |
| مواصفات العمارة | B-026: — | — | — | — | — |
| عدد المداخل | B-027: …… | OR-035: …… | OC-035: …… | — | — |
| عدد الطوابق | B-028: …… | — | — | HR-022: …… | HC-022: …… |
| عدد السلالم | B-029: …… | — | — | — | — |
| عدد الشقق | B-030: …… | — | — | — | — |
| عدد الممرات | B-031: …… | — | — | — | — |
| عدد المصاعد | B-032: …… | — | — | — | — |
| هل توجد أقبية | B-033: [1] نعم · [2] لا | — | — | — | — |
| مساحات خضراء | B-034: [1] نعم · [2] لا | — | — | — | — |
| هل توجد مرائب | B-035: [1] نعم · [2] لا | — | — | — | — |
| أسطح مشتركة | B-036: [1] نعم · [2] لا | — | — | — | — |
| الخدمات المبرمجة | B-039: — | OR-040: — | OC-040: — | — | — |
| نوع العقد | B-042 as «نوع العقد:»: …… · [1] قصير · [2] طويل | — | OC-043 as «نوع العقد:»: …… · [1] قصير · [2] طويل | — | HC-038 as «نوع العقد:»: …… · [1] قصير · [2] طويل |
| مدة العقد | B-043: …… · [1] شهر · [2] 3 أشهر · [3] 6 أشهر · [4] سنة | — | OC-044: …… · [1] شهر · [2] 3 أشهر · [3] 6 أشهر · [4] سنة | — | HC-039: …… · [1] شهر · [2] 3 أشهر · [3] 6 أشهر · [4] سنة |
| عدد الزيارات | B-044: 6 options | — | OC-045: 6 options | — | HC-040: 6 options |
| تاريخ تسديد | B-062: …… | — | OC-063: …… | — | HC-058: …… |
| دورية السداد | B-064: [1] بعد كل زيارة · [2] أسبوعيا · [3] كل أسبوعين · [4] كل شهر | — | OC-065: [1] بعد كل زيارة · [2] أسبوعيا · [3] كل أسبوعين · [4] كل شهر | — | HC-060: [1] بعد كل زيارة · [2] أسبوعيا · [3] كل أسبوعين · [4] كل شهر |
| يوجد حارس | B-066: [1] نعم · [2] لا | OR-065 as «يوجد حارس ؟»: [1] نعم · [2] لا | OC-067: [1] نعم · [2] لا | HR-060 as «يوجد حارس ؟»: [1] نعم · [2] لا | HC-062: [1] نعم · [2] لا |
| قائمة القاطنين بالعمارة | B-072: — | — | — | — | — |
| الرقم | B-073: …… | — | — | — | — |
| اللقب والاسم | B-074: …… | — | — | HR-009: …… | HC-009: …… |
| رقم الهاتف (occurrence 4 on the form) | B-075: …… / …… / …… / …… / …… | — | — | — | — |
| تاريخ التسجيل | B-076: …… / …… / …… | — | — | — | — |
| المعلومات الأساسية للمؤسسة | — | OR-004: — | OC-004: — | — | — |
| رقم المؤسسة | — | OR-006: …… | OC-006: …… | — | — |
| نوع العقار | — | OR-008: 8 options | OC-008: 8 options | HR-008: [1] منزل · [2] شقة · [3] دوبلكس · [4] فيلا · [5] أخرى: …… | HC-008: [1] منزل · [2] شقة · [3] دوبلكس · [4] فيلا · [5] أخرى: …… |
| مدير/ مسير | — | OR-009: …… | OC-009: …… | — | — |
| السجل التجاري | — | OR-010: [1] لا · [2] نعم | OC-010: [1] لا · [2] نعم | — | — |
| اسم المؤسسة | — | OR-014: …… | OC-014: …… | — | — |
| قطاع العمل | — | OR-015: [1] عام · [2] خاص | OC-015: [1] عام · [2] خاص | — | — |
| الزيارة الأولية | — | OR-017: …… | OC-017: …… | — | — |
| الوصف الفني للموقع | — | OR-022: — | OC-022: — | HR-020: — | HC-020: — |
| مساحة البناء | — | OR-023: …… | OC-023: …… | HR-021: …… م2 | HC-021: …… م2 |
| عدد المباني | — | OR-024: …… | OC-024: …… | — | — |
| عدد المكاتب | — | OR-025: …… | OC-025: …… | — | — |
| عدد القاعات | — | OR-026: …… | OC-026: …… | — | — |
| عدد المخازن | — | OR-027: …… | OC-027: …… | — | — |
| عدد دورات المياه | — | OR-028: …… | OC-028: …… | — | — |
| عدد المطابخ | — | OR-029: …… | OC-029: …… | HR-026: …… | HC-026: …… |
| عدد النوافذ | — | OR-030: …… | OC-030: …… | HR-029: …… | HC-029: …… |
| عدد الأبواب | — | OR-031: …… | OC-031: …… | — | — |
| مساحة الأرضيات | — | OR-032: …… | OC-032: …… | — | — |
| نوع الأرضيات | — | OR-033: …… | OC-033: …… | HR-030: …… | HC-030: …… |
| عدد مواقف السيارات | — | OR-034: …… | OC-034: …… | — | — |
| عدد المخارج | — | OR-036: …… | OC-036: …… | — | — |
| نوع الطلب | — | OR-043: …… · [1] شامل · [2] عميق | — | HR-038: …… · [1] شامل · [2] عميق | — |
| مدة التنفيذ | — | OR-044: …… | — | HR-039: …… | — |
| تاريخ التسديد | — | OR-062: …… | — | HR-057: …… | — |
| المعلومات الأساسية للسكن | — | — | — | HR-004: — | HC-004: — |
| رقم الباب | — | — | — | HR-006: …… | HC-006: …… |
| ملكية العقار | — | — | — | HR-010: [1] ملك · [2] مسأجر | HC-010: [1] ملك · [2] مسأجر |
| عدد الغرف | — | — | — | HR-023: …… | HC-023: …… |
| عدد المجالس | — | — | — | HR-024: …… | HC-024: …… |
| عدد الصالونات | — | — | — | HR-025: …… | HC-025: …… |
| عدد الحمامات | — | — | — | HR-027: …… | HC-027: …… |
| عدد الشرفات | — | — | — | HR-028: …… | HC-028: …… |
| مساحة الحديقة | — | — | — | HR-031: …… | HC-031: …… |
| مساحة الفناء | — | — | — | HR-032: …… | HC-032: …… |
| نوع الخدمة المبرمجة | — | — | — | HR-035: — | HC-035: — |

## 3. Lists of services

| Form | Row | Heading above | Options with ☐ | Of which blank | Dotted lines without ☐ | ☐ side |
|---|---|---|---|---|---|---|
| B | B-038 | الخدمات المقدمة | 20 | 0 | 0 | after and before |
| B | B-040 | الخدمات المبرمجة | 11 | 0 | 5 | after |
| OR | OR-039 | الخدمات المقدمة | 20 | 0 | 4 | after |
| OR | OR-041 | الخدمات المبرمجة | 11 | 0 | 5 | after |
| OC | OC-039 | الخدمات المقدمة | 20 | 0 | 4 | after |
| OC | OC-041 | الخدمات المبرمجة | 11 | 0 | 5 | after |
| HR | HR-034 | الخدمات المقدمة | 16 | 3 | 0 | after |
| HR | HR-036 | نوع الخدمة المبرمجة | 12 | 0 | 0 | after |
| HC | HC-034 | الخدمات المقدمة | 16 | 3 | 0 | after |
| HC | HC-036 | نوع الخدمة المبرمجة | 12 | 0 | 0 | after |

## 4. Numbers Word generates, and the slips

The section and item numbers are not typed: Word's list numbering produces them, and this table is computed from `numbering.xml` (**estimated**: not seen rendered). Print shows them as listed, slips included.

| Form | Section numbers, in order | Item numbers, per table | Slips |
|---|---|---|---|
| W | none | T2: 1 2 3 4 5 6 7 8 9 10 | none |
| B | 1- 2- 3- 4- 1- 5- 6- | T1: 1 2 3 4 5 6 7 8 9 10; T5: 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 | B-039 «الخدمات المبرمجة» prints «1-» |
| OR | 1- 2- 3- 4- 5- | T1: 1 2 3 4 5 6 7 8 9 10 11; T4: 1 2 1 3 4 5 6 7 8 9 10 11 12 | OR-046 «تحديد الفترة» prints «1.» |
| OC | 1- 2- 3- 4- 5- | T1: 1 2 3 4 5 6 7 8 9 10 11; T4: 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 | none |
| HR | 1- 2- 3- 4- 5- | T1: 1 2 3 4 5 6 7 8 9 10; T2: 1 2 1 3 4 5 6 7 8 9 10 11 12 | HR-041 «تحديد الفترة» prints «1.» |
| HC | 1- 2- 3- 4- 5- | T1: 1 2 3 4 5 6 7 8 9 10; T2: 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 | none |

## 5. Layout differences between sibling files

| Form | Margins top, right, bottom, left (mm) | Tables: columns, width mm, floating | Empty paragraphs between blocks | Title box: width × height, left offset (mm) |
|---|---|---|---|---|
| W | 22.5, 12.5, 5, 7.5 | T1 6, 197.5; T2 5, 194.9; T3 1, 64.9; T4 2, 192.5 | 0 · 4 · 0 · 1 · 1 (before each table, then after the last) | 98.3 × 13.6, 98.7; 131.3 × 19, 65.7 |
| B | 12.7, 10, 12.7, 12.7 | T1 6, 192.5; T2 6, 192.5; T3 9, 192.5; T4 4, 192.5, floating; T5 4, 192.5; T6 4, 192.5 | 0 · 1 · 1 · 3 · 1 · 17 · 1 (before each table, then after the last) | 102 × 12.3, 91.3 |
| OR | 12.7, 10, 12.7, 12.7 | T1 6, 192.5; T2 9, 192.5; T3 4, 192.5, floating; T4 4, 192.5, floating | 0 · 1 · 8 · 1 · 6 (before each table, then after the last) | 136.2 × 12.3, 57.1 |
| OC | 12.7, 10, 12.7, 12.7 | T1 6, 192.5; T2 9, 192.5; T3 4, 192.5, floating; T4 4, 192.5 | 0 · 1 · 8 · 1 · 2 (before each table, then after the last) | 136.2 × 12.3, 57.1 |
| HR | 12.7, 10, 12.7, 12.7 | T1 14, 192.5; T2 4, 192.5, floating | 0 · 6 · 7 (before each table, then after the last) | 136.2 × 12.3, 57.1 |
| HC | 12.7, 10, 12.7, 12.7 | T1 14, 192.5; T2 4, 192.5 | 0 · 5 · 23 (before each table, then after the last) | 136.2 × 14.7, 57.1 |
