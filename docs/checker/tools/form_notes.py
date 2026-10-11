"""The hand-written parts of the layout files: the Checker's findings (K), the
notes for builders, the page estimates in words, and the list of facts that
are estimated. build_forms.py prints them into docs/checker/forms/.

Rulings in force (coordinator, 2026-10-11): print reproduces what his Word
file prints: the letterhead and footer at their placed, stretched size, his
label strings with their stretching characters, and the generated numbers as
Word shows them, slips included. The only corrections are those of scope A8
(«مسأجر» to «مستأجر»; «تنظيف غ..الضيوف» kept as written). On screen, labels
drop the stretching character.
"""

EST = "**estimated**"

# Findings that docs/scope.md section 7 does not list. (id, finding, where)
FINDINGS = [
    ("K1", "The worker form prints on four pages, not two. Word's own count is 4, its one page-break marker sits at the regulations title, and the two registration tables need at least 217 mm and 164 mm against a body of 269.5 mm. The regulations are pages 3 and 4, not \"the second page\" (scope P9). " + EST,
     "`01-worker.md` section 6"),
    ("K2", "No form has an explicit page break. Pages are separated by runs of empty paragraphs (up to 23) and by floating tables, so the breaks move with any change of font or row height. Word records 1 page for the four home and organisation forms; that cannot be right: with every line only as high as its type size they still need 1.3 to 1.5 page bodies. They print on two pages. " + EST,
     "section 6 of each layout file"),
    ("K3", "The letterhead picture is stretched: 63% of its natural height on the worker form, 56% on the five client forms; the footer 91%. One picture, two placements.",
     "`00-letterhead.md`; rows W-071, W-072 and their siblings"),
    ("K4", "Pictures and tables run into the strip most printers cannot print: the header starts about 2 mm from the top edge, the footer ends at the bottom edge (about 2 mm past it on the client forms), and the tables come within 3 to 10 mm of the side edges. " + EST,
     "`00-letterhead.md`; section 9 of each layout file"),
    ("K5", "A dotted blank comes before the options, with no label of its own: «تقييم النظافة» on the five client forms, «نوع الطلب» on the two request forms, «نوع العقد:» and «مدة العقد» on the three contract forms.",
     "B-016, B-042, B-043 and their siblings"),
    ("K6", "On the organisation forms the last row of «الوصف الفني للموقع» ends with a dotted blank whose label cell is empty.", "OR-037, OC-037"),
    ("K7", "«السجل التجاري» offers «لا» then «نعم». Every other yes / no on the forms is «نعم» then «لا».", "OR-010, OC-010"),
    ("K8", "The side of the ☐ is not constant. It is typed before the label on some fields and after it on others, and both ways inside the building services list.",
     "section 10 of each layout file; B-038"),
    ("K9", "The worker form uses emoji (🔹 twelve times, ✍️ once) and Symbol-font list bullets. The fonts named in the file have no such glyphs, so Word substitutes; an offline program needs local glyphs or drawn marks.",
     "W-027, W-048, W-060, W-065"),
    ("K10", "Sibling forms differ in small ways beyond F6: «يوجد حارس ؟» on the request forms and «يوجد حارس» on the contract forms; «نوع الخدمة المبرمجة» on the home forms and «الخدمات المبرمجة» on the others; «نوع الطلب» in a cell of its own, but «نوع العقد:» with a colon in one merged cell with its blank and options; the «البلدية / الولاية» blank undivided on the home request and split by a slash elsewhere; «مساحة البناء» with the unit «م2» on the home forms and with none on the organisation forms.",
     "`differences.md` section 2"),
    ("K11", "«أخرى» is written three ways: «أخرى: ……» with a blank under «نوع العقار» on the home forms, a bare «أخرى» on the organisation forms, and on the building form's «جهة التعاقد» a blank typed as underscores then dots.",
     "HR-008, HC-008, OR-008, OC-008, B-011"),
    ("K12", "The building services list mixes places («الساحات», «المداخل», «الأرصفة») with tasks and carries items of the organisation list («تنظيف الأجهزة», «تنظيف المخازن», «تنظيف مواقف السيارات», «تنظيف المرآب», «تنظيف الحدائق»).", "B-038"),
    ("K13", "Room for \"other\" differs from list to list: three blank options with a ☐ on the home services list; four dotted lines without a ☐ on the organisation one, two of them sharing a line with an option; none on the building one. Programmed services: five dotted lines without a ☐ on the organisation and building forms, none on the home forms.",
     "`differences.md` section 3"),
    ("K14", "The centre is named three ways inside the worker form: «مركز إنماء» in the title (no «برو»), «مركز إنماء برو» under the last signature, «المؤسسة» in the pledges and the regulations.", "W-001, W-027, W-070"),
    ("K15", "Some blanks on the worker form are drawn in parts: «تاريخ الإزدياد» is a slash and three parts, the third far longer than a year needs; both «رقم الهاتف» are five parts between slashes; «بلدية/ولاية إقامة» is split by a slash while the birth «البلدية / الولاية» is not.",
     "W-007, W-010, W-012, W-017"),
    ("K16", "«اسم الشهادة» has an empty cell beside it: the only blank on the worker form with no dotted line.", "W-020"),
    ("K17", "The regulations part repeats «رقم التسجيل …… /H/F» and «التاريخ» at its top, so each part carries the number and the date.", "W-045, W-046"),
    ("K18", "Sibling files differ in construction where they look alike: the financial table floats on the two request forms and is an ordinary table on the three contract forms; its first and third columns are 1841 and 1843 twips on the request forms, 1842 and 1842 on the contract forms; the home forms put sections 1 to 4 in one 14-column table where the organisation and building forms use two or three.",
     "`differences.md` section 5"),
    ("K19", "Handwritten stock page: only «جرد المخزون» (with «جرد المعدات» and «جرد المواد») and «التسليم» are on it. «المشتريات» and «الصيانة», which the scope puts in the same section, come from plan features 34 and 35, not from his notes.", "N2-02 to N2-05"),
    ("K20", "Handwritten stock page, numbering: «1/ قسم جرد المخزون» is followed by «(2)/ قسم التسليم»; under it «1- نوع الخدمة» has no «2-» beside it, while its two values are numbered «1-» and «2-».", "N2-05, N2-07"),
    ("K21", "Handwritten red line: the box he drew after «قديم» has a mark inside it, where his forms print an empty ☐. It reads as the ticked «☐ قديم» box of «حالة الملف», which bears on H3. Weak read.", "N1-01"),
    ("K22", "The first half of the worker form's title («استمارة التسجيـ») carries a light-grey text highlight on top of the grey paragraph fill; the second half does not. Probably an accident of editing; Word prints it.", "W-001; `01-worker.md` section 7"),
]

PAGE_NOTE = {
    "W": "Reading (" + EST + "): four pages, as Word records. Page 1: letterhead, title box, number, date and table T1. Page 2: table T2, the «حررت» line and the «الإمضاء والختم» cell. Page 3 starts at P21, where Word left its page-break marker: the regulations title box, the number and date again, then the articles. Page 4: the rest of the articles, the declaration, the golden rule and the two signature labels (T4), which end close to the bottom of the page.",
    "B": "Reading (" + EST + "): three pages, as Word records; the estimate runs about 8% high. Page 1: sections 1 to 4 (T1, T2, T3). Page 2: «الخدمات المبرمجة» (T4) and «الدراسة المالية» with the signature row (T5). Page 3: the residents list (T6), sent there by the 17 empty paragraphs before it.",
    "OR": "Reading (" + EST + "): two pages. Word records 1, which cannot be right: with every line only as high as its type size the file still needs 1.5 page bodies. Page 1: sections 1 to 3 (T1, T2). Page 2: «الخدمات المبرمجة» (T3) and «الدراسة المالية» with the signature row (T4), sent there by the 8 empty paragraphs after T2.",
    "OC": "Reading (" + EST + "): two pages. Word records 1, which cannot be right: with every line only as high as its type size the file still needs 1.5 page bodies. Page 1: sections 1 to 3 (T1, T2). Page 2: «الخدمات المبرمجة» (T3) and «الدراسة المالية» with the signature row (T4).",
    "HR": "Reading (" + EST + "): two pages. Word records 1, which cannot be right: with every line only as high as its type size the file still needs 1.3 page bodies. Page 1: sections 1 to 4 (T1), which about fills it. Page 2: «الدراسة المالية» with the signature row (T2).",
    "HC": "Reading (" + EST + "): two pages. Word records 1, which cannot be right: with every line only as high as its type size the file still needs 1.3 page bodies. Page 1: sections 1 to 4 (T1), which about fills it. Page 2: «الدراسة المالية» with the signature row (T2). The 23 empty paragraphs after T2 may add a blank third page in Word; do not print one.",
}

COMMON_CLIENT = [
    "The title is a text box over the right half of the page; the number line and the date line sit at the left, beside it. The box has a soft shadow and no outline.",
    "Print every label with the number shown in square brackets in section 9. Word generates those numbers; they are not in the text. Slips are reproduced (print reproduces his Word file) and listed in `differences.md` section 4.",
    "Labels print with their stretching characters, exactly as in the \"Content, raw\" column. Screens drop that character.",
    "Dotted blanks are rows of full stops in the file. Draw each as a dotted line filling its cell; the count of dots is not a fact.",
    "Options sit on one line, spaced by typed spaces. Keep their order and the side of each ☐ (section 10); spread them evenly across the cell.",
    "Two ☐ on this form, in «على عاتق المركز ☐ على عاتق صاحبها ☐», are typed inside Traditional Arabic runs instead of MS Mincho ones. Draw every ☐ the same.",
    "The last row of the financial table is open: it has a top border only. It holds «حررت: بأم البواقي، بتاريخ: ……» and, at the left, «الإمضـــــاء والخـــــتم».",
]

FORM_NOTES = {
    "W": [
        "Print the registration part and the regulations part in one job: the scope prints \"the form and the internal regulations\". See the page reading in section 6 (K1).",
        "«نعم» and «لا» under «هل عملت في المجال» (T1.r10.c2) have no ☐. Two drawn ovals stand in their place: 8.4 × 4.1 mm, outline #002060, 1.5 pt, no fill (F11).",
        "Tick lists (T1.r11, T1.r12, T2.r3.c5) are one paragraph per cell with a line break after each option; each ☐ is typed before its label, so it prints on the label's right.",
        "The twelve pledges (T2.r1.c2 and c3) each start with the emoji 🔹; the declaration heading (P51) starts with ✍️. Bundle a glyph or draw a small diamond and a pen mark: nothing may be fetched (K9).",
        "Articles 2 and 14 carry list bullets (P26 to P29, P38 to P43): a round dot from Word's Symbol font, generated by the list.",
        "T2.r3 holds the confidential evaluation: ten numbered criteria in c2 and, in c3, twelve dotted score blanks (one, then ten, then one). Reproduce the twelve (F11).",
        "T2.r2 is the signature row: its first cell has no side borders and «إمضاء المعني(ة)» sits in the second.",
        "T3 is a one-cell table with no borders, 64.9 mm wide, at the left under the «حررت» line: «الإمضاء والختم» is plain text, not a box.",
        "T4, at the end of the regulations, has no grid: only a dash-dot rule 3 pt thick across the top of its first row, then «إمضاء العامل(ة)» on the right and «إمضاء مركز إنماء برو» on the left, each with a short dotted line under it.",
        "The title box carries a light-grey highlight on its first half on top of the grey fill (K22). The regulations title box has two lines.",
        "The number and the date are printed twice: P2 and P3 on page 1, P22 and P23 at the top of the regulations (K17).",
        "The form names the centre three ways (K14). Print each as written.",
        "This form has its own margins and its own letterhead placement; the five client forms share another set (`differences.md` section 5, `00-letterhead.md`).",
    ],
    "B": COMMON_CLIENT + [
        "Section numbers print 1-, 2-, 3-, 4-, 1-, 5-, 6-: «الخدمات المبرمجة» restarts at 1 (F8).",
        "«نوع العقد:» (T5.r2) is one cell across the table holding the label with its colon, a dotted blank and the two options (K5, K10).",
        "«عدد الزيارات» (T5.r4) has six labels and five ☐; reproduce it as typed (F5).",
        "The services list (T3.r7) types the ☐ before some labels and after others (K8); section 10 gives the side of each cell's lines in the JSON.",
        "The residents list (T6) is 26 identical blank lines under four column headings (F12). It has no rule for a building with more residents.",
        "«(01):» is typed before the first phone blank (T1.r8.c2) on this form and on the home contract only (F6).",
        "The complexes copy is this sheet with the title «نوع الخدمة : عقد (تجمع سكني)» (scope A1, row BX-001). Nothing else changes.",
    ],
    "OR": COMMON_CLIENT + [
        "Item numbers in the financial table print 1, 2, 1, 3 … 12: «تحديد الفترة» restarts at 1 (F8).",
        "«يوجد حارس ؟» carries a question mark here and on the home request; the contract forms have none (K10).",
        "«السجل التجاري» (T1.r5.c4) offers «لا» then «نعم» (K7).",
        "The last row of T2's description block ends with a dotted blank beside an empty label cell (T2.r6.c5, c6): print the empty label and the blank (K6).",
        "The services list (T2.r8) has four dotted lines without a ☐; in cells 3 and 4 the dotted line shares a line with the last option (K13).",
        "T3 and T4 are floating tables centred on the text area.",
    ],
    "OC": COMMON_CLIENT + [
        "«نوع العقد:» (T4.r2) is one cell across the table holding the label with its colon, a dotted blank and the two options (K5, K10).",
        "«عدد الزيارات» (T4.r4) has six labels and five ☐; reproduce it as typed (F5).",
        "«السجل التجاري» (T1.r5.c4) offers «لا» then «نعم» (K7).",
        "The last row of T2's description block ends with a dotted blank beside an empty label cell (T2.r6.c5, c6) (K6).",
        "The services list (T2.r8) has four dotted lines without a ☐; in cells 3 and 4 the dotted line shares a line with the last option (K13).",
        "T3 floats; T4 does not, unlike the organisation request (K18).",
    ],
    "HR": COMMON_CLIENT + [
        "Sections 1 to 4 are one table of 14 narrow columns (T1); the merged cells give each row its own rhythm, so take the widths from the Cell rows, not from the column grid.",
        "Item numbers in the financial table print 1, 2, 1, 3 … 12: «تحديد الفترة» restarts at 1 (F8).",
        "«مسأجر» under «ملكية العقار» (T1.r5.c4) is printed and shown as «مستأجر» (scope A8). «تنظيف غ..الضيوف» stays as typed.",
        "The heading reads «نوع الخدمة المبرمجة» here and on the home contract; the other forms say «الخدمات المبرمجة» (K10). Its list has «تنظيف شامل» and «تنظيف عميق» as two options (F6).",
        "The services list ends each of its last three columns with a blank option that has a ☐ (K13).",
        "The «البلدية / الولاية» blank (T1.r6.c4) is one undivided dotted line on this form only (K10).",
        "T2 is a floating table centred on the text area.",
    ],
    "HC": COMMON_CLIENT + [
        "Sections 1 to 4 are one table of 14 narrow columns (T1); take the widths from the Cell rows, not from the column grid.",
        "«نوع العقد:» (T2.r2) is one cell across the table holding the label with its colon, a dotted blank and the two options (K5, K10).",
        "«عدد الزيارات» (T2.r4) has six labels and five ☐; reproduce it as typed (F5).",
        "«مسأجر» under «ملكية العقار» (T1.r5.c4) is printed and shown as «مستأجر» (scope A8). «تنظيف غ..الضيوف» stays as typed.",
        "«(01):» is typed before the first phone blank (T1.r8.c2) on this form and on the building contract only (F6).",
        "T2 is an ordinary table here and a floating one on the home request (K18).",
    ],
}

ESTIMATED = [
    "E1. The number of pages and where each page ends (section 6). Word's recorded count is file metadata; the reading comes from the saved row heights and assumed line heights.",
    "E2. Every vertical position on the page: the top and bottom of the letterhead and footer pictures, where the body starts under the letterhead, where a text box or a floating table lands.",
    "E3. What a printer clips near the paper edges (K4).",
    "E4. The distance of each table's edges from the paper edges, within about 2 mm: Word shifts a table by its cell padding under a rule the file does not state.",
    "E5. Printed row heights. The file gives a minimum per row; the printed height depends on the fonts.",
    "E6. The spacing between options in a cell: it is typed with spaces.",
    "E7. The numbers in front of labels: computed from `numbering.xml`, not seen printed.",
    "E8. \"Alignment on paper\": Word's rule for right-to-left paragraphs applied to the XML value (`jc=left` is the right side, `jc=right` the left).",
    "E9. Glyph shapes and line heights. None of his fonts is installed here, and Word's substitutes for missing glyphs (☐ in Traditional Arabic runs, the emoji) are not recorded in the file.",
]

LETTERHEAD_NOTES = [
    "Print both pictures at their placed size, stretched as placed (CLAUDE.md rule 4: print reproduces his Word file). Do not restore the natural proportions.",
    "The placed size and the offsets differ between the worker form and the five client forms: take them from the table above, per form.",
    "Both pictures are in front of the text and push nothing. The first body paragraph of every form is empty: it is the spacer under the letterhead.",
    "The header picture starts about 2 mm from the top edge and both pictures come within 1 to 5 mm of the side edges. The footer picture ends at the bottom edge on the worker form and about 2 mm past it on the client forms (" + EST + "). Most printers leave 3 to 5 mm unprinted, so the edges of both pictures will be clipped on paper; say so to the developer when he compares (K4).",
    "The footer carries a phone number and an e-mail address as part of the picture. They are pixels, not links; nothing opens.",
    "«للخمات» is a typo inside the footer picture (F10). The picture is his; it prints as it is.",
    "The same two files are in all six .docx archives (same SHA-256). The copies in `docs/checker/assets/` are those bytes.",
    "Printing happens on every page of every sheet, the complexes copy included.",
]
