"""The hand-written layer over the form rows: which screen each row maps to,
which sheet it prints on, who owns it, and the notes.

Screen names follow docs/scope.md sections 2 and 3. Page folders and owners
follow the ownership table in CLAUDE.md. Real routes and field names are filled
in the table later, from the code.

Ids: H, N, P, F, R, A refer to docs/scope.md sections 7 and 9. K ids are the
Checker's own findings, listed in docs/checker/forms/differences.md.
"""

import formxml as fx

DIVISION = {"B": "العمارات", "OR": "المؤسسات", "OC": "المؤسسات", "HR": "المنازل", "HC": "المنازل"}
SERVICE = {"B": "عقد", "OR": "عند الطلب", "OC": "عقد", "HR": "عند الطلب", "HC": "عقد"}

W_SCREEN = "عمال النظافة › العمال › registration screen (pages `workers/`)"
W_EMPLOYEE = "; also الموظفون › الموظفون › employee file (pages `employees/`), A2"
W_HIRING = ("عمال النظافة › العمال › registration screen, hiring score and decision; "
            "also عمال النظافة › التوظيف والتدريب (pages `workers/`, `hiring/`)")


def client_screen(form):
    return "طلبات الخدمة › الملفات › %s · %s › الاستمارة (pages `files/`)" % (DIVISION[form], SERVICE[form])


def strip_label(text):
    return text.rstrip(" :؟").strip()


# notes by label (after strip_label), per set of forms. '*' = every client form.
CLIENT = ("B", "OR", "OC", "HR", "HC")
LABEL_NOTES = [
    (CLIENT, "حالة الملف", "Eight statuses, printed as ticks: «قديم» is set by the «قديم» button, one stage is current, «متوقف» and «معاقب» are states on the client (A5, P2). One tick or several is not stated (F7)"),
    (CLIENT, "اسم المتداول", "Meaning unclear (F9)"),
    (CLIENT, "العنوان مدقق", "Meaning unclear (F9)"),
    (CLIENT, "تخزين معدات", "Meaning unclear (F9)"),
    (CLIENT, "رقم الملف", "«رقم الملف» against «رقم التسجيل» is not explained (P3)"),
    (("HR", "HC"), "رقم الباب", "A street number or a code: not explained (P3)"),
    (("OR", "OC"), "رقم المؤسسة", "A street number or a code: not explained (P3)"),
    (("B",), "رقم العمارة", "A street number or a code: not explained (P3)"),
    (CLIENT, "تقييم النظافة", "One five-level scale (P8)"),
    (("OR", "HR"), "نوع الطلب", "«شامل / عميق» repeats two programmed services (F7)"),
    (("OC", "HC", "B"), "نوع العقد", "The قصير / طويل threshold is not stated (F9). K10: label, blank and options share one merged cell and the label ends with a colon; on the request forms «نوع الطلب» has a cell of its own"),
    (("OC", "HC", "B"), "مدة العقد", "Four lengths (P5)"),
    (("OC", "HC", "B"), "عدد الزيارات", "Six labels and five boxes (F5). The first three labels have their ☐ after them; the last two ☐ are written before «خمسة» and «ستة», so «أربعة بالأسبوع» or «ستة بالأسبوع» is left without one. Option [6] has no ☐ after it"),
    (CLIENT, "أيام التنفيذ", "Saturday to Thursday, no Friday (P6)"),
    (CLIENT, "تحديد الفترة", "«معا» has a single «من / إلى» pair (F7)"),
    (("OR", "HR"), "مدة التنفيذ", "Hours or days: not stated (F9)"),
    (CLIENT, "مسدد أتعاب", "The payer. The payment-due alert lists this name and phone (scope 1.6)"),
    (CLIENT, "مواد التنظيف", "«على عاتق صاحبها» is unclear (F9)"),
    (CLIENT, "توفير النقل", "«على عاتق صاحبها» is unclear (F9)"),
    (CLIENT, "مصاريفها", "Whether this amount is inside «المبلغ إجمالي» is not said (F3)"),
    (CLIENT, "المبلغ إجمالي", "Per visit, per period or for the whole contract: not said (F3). Stored as written, with a choice beside it (A7); fed by file › الدراسة المالية (A4)"),
    (("OC", "HC", "B"), "تاريخ تسديد", "The first due date; later ones come from «دورية السداد» (A7). Written «تاريخ التسديد» on the request forms (F6)"),
    (("OR", "HR"), "تاريخ التسديد", "Written «تاريخ تسديد» on the contract forms (F6)"),
    (("OC", "HC", "B"), "دورية السداد", "Four options (P7)"),
    (CLIENT, "طريقة السداد", "Three methods (P7)"),
    (("OR", "OC", "HR", "HC"), "دخول الفريق", "«مسؤول العمارة» is carried over from the building form (F4)"),
    (("OR", "HR"), "يوجد حارس", "K10: written «يوجد حارس ؟» here and «يوجد حارس» on the contract forms. The guard rows are carried over from the building form (F4)"),
    (("OC", "HC"), "يوجد حارس", "K10: written «يوجد حارس» here and «يوجد حارس ؟» on the request forms. The guard rows are carried over from the building form (F4)"),
    (("B",), "يوجد حارس", "K10: written «يوجد حارس» here and «يوجد حارس ؟» on the request forms"),
    (CLIENT, "تعليمات أمنية", "Yes or no only; no room for the instructions (F7)"),
    (("OR", "OC", "HR", "HC"), "مكان التخلص من النفايات", "«تعليمات العمارة» is carried over from the building form (F4)"),
    (("HR", "HC"), "ملكية العقار", "«مسأجر» is his spelling; screen and print use «مستأجر» (A8)"),
    (("OR", "OC"), "نوع العقار", "Flat sizes F2 to F5 and a bare «كبير» (F4). K11: «أخرى» has no blank here; the home forms have «أخرى: ……»"),
    (("HR", "HC"), "نوع العقار", "K11: «أخرى: ……» has a blank here; the organisation forms have «أخرى» with none"),
    (("OR", "OC"), "السجل التجاري", "K7: the options are «لا» then «نعم», the reverse of every other yes / no on the forms"),
    (("OR", "OC"), "قطاع العمل", "Public or private (س17)"),
    (("OR", "OC"), "الزيارة الأولية", "The first inspection (feature 3); see also file › الزيارة الأولية. Written «تاريخ الزيارة» on the other forms (F6)"),
    (("B", "HR", "HC"), "تاريخ الزيارة", "The first inspection (feature 3); see also file › الزيارة الأولية. Written «الزيارة الأولية» on the organisation forms (F6)"),
    (("B",), "جهة التعاقد", "K11: the blank after «أخرى:» is typed as underscores followed by dots"),
    (("B",), "اسم المسئول", "«مسئول» here, «مسؤول» in «مسؤول العمارة» (F10)"),
    (("B",), "عدد الشقق الإجمالي", "The number of flats is asked twice: see «عدد الشقق» (F12)"),
    (("B",), "عدد الشقق", "The number of flats is asked twice: see «عدد الشقق الإجمالي» (F12)"),
    (("B",), "تاريخ التسجيل", "A date per resident whose purpose is not said; third-party personal data (F12)"),
    (("HR",), "البلدية / الولاية", "K10: one undivided blank here; the other forms split it «…… / ……»"),
    (("HR", "HC"), "مساحة البناء", "K10: the unit «م2» is printed after the blank here; the organisation forms have none"),
    (("OR", "OC"), "مساحة البناء", "K10: no unit after the blank here; the home forms print «م2»"),
    # worker form
    (("W",), "هل عملت في المجال", "«نعم» and «لا» carry no ☐: two drawn ovals instead (F11)"),
    (("W",), "اسم الشهادة", "K16: the cell beside it is empty, with no dotted line"),
    (("W",), "تاريخ الإزدياد", "K15: the blank is a slash, then three dotted parts, the third far longer than a year needs. «الإزدياد» is his spelling"),
    (("W",), "بلدية/ولاية إقامة", "K15: the blank is split in two by a slash; the birth «البلدية / الولاية» blank is not"),
    (("W",), "الحالة الإجتماعية", "«الإجتماعية» is his spelling"),
    (("W",), "الأيام المتاحة", "Seven days, including «الجمعة» (P6). «الإثنين» here, «الاثنين» on the client forms (F10). One tick or several is not stated"),
    (("W",), "هل تعاني من", "Health answers: restricted to المدير and مسئول الموارد البشرية, access logged (scope 3 and 5)"),
    (("W",), "تقييم مسئول الموارد البشرية (سري)", "Confidential: المدير and مسئول الموارد البشرية only, access logged (scope 3 and 5). «مسئول» is his spelling (F10)"),
    (("W",), "المجموع", "A score out of 100 over ten criteria (F11)"),
    (("W",), "قرار الإدارة", "«رفض المعني النهائي» is unclear and no trial length is given (F11)"),
    (("W",), "إقرار وتعهد / أتعهد بأن جميع المعلومات الواردة صحيحة / وأتعهد بما يلي", "Twelve pledges in two cells of six, each marked 🔹 (K9). They say «المؤسسة», not «المركز» (K14)"),
    (("W",), "إمضاء مركز إنماء برو", "K14: «مركز إنماء برو» here, «مركز إنماء» in the title"),
]

ARTICLE_NOTES = {
    2: "Four items with Symbol-font bullets (K9)",
    8: "Forbids workers to photograph at clients' sites (P12)",
    12: "Cash only when authorised and documented (س18, feature 32)",
    14: "Six items with Symbol-font bullets (K9)",
    15: "Names المشرف, الإدارة, المدير (س5)",
    16: "Seven criteria on one centred line, no scale (س25)",
}


def annotate(form, rows, model):
    """Fill maps, prints, owner, screen, print and the notes of each row."""
    sheet = fx.FORMS[form]["sheet"]
    criteria_seen = False
    for row in rows:
        notes = list(row["notes"])
        label = strip_label(row["text"])
        kind = row["kind"]
        sec = row["section"] or ""

        # ---- where it prints
        if form == "W":
            row["prints"] = "%s · %s" % (sheet, row["part"])
        elif form == "B":
            row["prints"] = "%s; complexes copy" % sheet
        else:
            row["prints"] = sheet
        row["owner"] = "P" if form == "W" else "C"
        row["print"] = "not built"
        row["screen"] = "not built"

        # ---- which screen
        if form == "W":
            if row["part"] == "regulations":
                if kind == "title":
                    row["maps"] = "print only: the fixed regulations text printed with the form"
                elif kind in ("number", "date"):
                    row["maps"] = "print only: repeats the value of the registration part"
                    notes.append("K17: the number and the date are repeated at the top of the regulations part")
                elif kind == "field":
                    row["maps"] = "print only: the worker's name, from W-005"
                else:
                    row["maps"] = "print only"
                row["screen"] = "n/a"
            elif kind == "signature":
                row["maps"] = "print only"
                row["screen"] = "n/a"
            elif kind == "static":
                row["maps"] = "print only: fixed text"
                row["screen"] = "n/a"
            elif kind == "date" and label.startswith("حررت"):
                row["maps"] = "print only: place «أم البواقي» is fixed; which date prints here needs a ruling"
                row["screen"] = "n/a"
            elif row["id"] >= "W-029" and row["id"] <= "W-041":
                row["maps"] = W_HIRING
            elif kind == "title":
                row["maps"] = W_SCREEN + ", screen title"
            elif sec.startswith("المعلومات الشخصية"):
                row["maps"] = W_SCREEN + W_EMPLOYEE
            else:
                row["maps"] = W_SCREEN
        else:
            base = client_screen(form)
            if kind == "signature":
                row["maps"] = "print only"
                row["screen"] = "n/a"
            elif kind == "date" and label.startswith("حررت"):
                row["maps"] = "print only: place «أم البواقي» is fixed; which date prints here needs a ruling"
                row["screen"] = "n/a"
            elif kind == "title":
                row["maps"] = base + ", screen title"
            elif form == "B" and sec.startswith("قائمة القاطنين"):
                row["maps"] = "طلبات الخدمة › الملفات › العمارات · عقد › file › القاطنون (pages `files/`)"
            else:
                row["maps"] = base

        # ---- notes by kind
        if kind == "number":
            if form == "W":
                notes.append("Suffix «/H/F» as written; H or F chosen per worker (A6); what the letters stand for is unconfirmed (F9). Number format: Foundation's numbering")
            elif form == "B":
                notes.append("Suffix «/BLC» as written (A6, F9). Number format: Foundation's numbering")
            else:
                notes.append("The suffix after «/» is a blank on this form (P3, A6). Number format: Foundation's numbering")
        if kind == "title" and form == "W" and row["part"] == "registration":
            notes.append("In a text box. K14: says «مركز إنماء», without «برو»; the form may also be his employee form (F1). K22: half the title carries a grey highlight")
        elif kind == "title":
            notes.append("In a text box")

        for forms, lab, text in LABEL_NOTES:
            if form in forms and lab == label:
                notes.append(text)
        if label == "رقم الهاتف" and form == "W":
            notes.append("K15: five dotted parts between slashes")
        if label == "رقم الهاتف" and row["items"] and row["items"][0]["text"].startswith("(01)"):
            notes.append("«(01):» is typed before the blank on this form and not on its siblings (F6)")

        if label == "الإمضاء والختم":
            notes.append("Whose signature and stamp it is, and where the other party signs, is not said (F2, س20)")
        if label == "الوثائق المسلمة":
            notes.append("Document expiry dates are followed under التوظيف والتدريب (feature 37)")
        if row["text"].startswith("المادة"):
            try:
                n = int(row["text"].split(":")[0].split()[1])
            except (ValueError, IndexError):
                n = None
            if n in ARTICLE_NOTES:
                notes.append(ARTICLE_NOTES[n])
        if row["text"].startswith("✍"):
            notes.append("Starts with the ✍️ emoji (K9)")

        # ---- notes by flag
        flags = row["flags"]
        if row["lead_blank"]:
            notes.append("K5: a dotted blank comes before the options, with no label of its own")
        if "blank-without-label" in flags:
            notes.append("K6: a dotted blank whose label cell is empty")
        if "options-without-label" in flags:
            notes.append("The list under «%s»; it has no label of its own" % sec)
        if "shares-blank-cell" in flags and not criteria_seen:
            notes.append("The ten criteria share one cell that holds twelve dotted score blanks (F11)")
            criteria_seen = True
        if "column-heading" in flags and form == "B":
            notes = [n for n in notes if "identical blank lines" not in n]
            notes.append("Column heading of the residents list: 26 identical blank lines below (F12)")
        sides = set(i.get("side") for i in row["items"] if i["kind"] == "option" and i.get("side") in ("before", "after"))
        if sides == {"before", "after"} and "label-without-box" not in flags:
            notes.append("K8: ☐ is written before some labels and after others in this list")
        boxed_blanks = sum(1 for i in row["items"] if i["kind"] == "option" and not i.get("free") and i["text"] == fx.BLANK_MARK)
        free_lines = sum(1 for i in row["items"] if i.get("free"))
        if kind == "choice" and "options-without-label" in flags:
            if "الخدمات المقدمة" in sec:
                if form in ("HR", "HC"):
                    notes.append("K13: %d blank options with a ☐ for other services" % boxed_blanks)
                elif form in ("OR", "OC"):
                    notes.append("K13: %d dotted lines without a ☐ for other services; two of them share a line with an option" % free_lines)
                else:
                    notes.append("K12: mixes places («الساحات», «المداخل», «الأرصفة») with tasks and carries organisation items («تنظيف الأجهزة», «تنظيف المخازن», «تنظيف مواقف السيارات»). K13: no blank line for other services")
            else:
                if form in ("HR", "HC"):
                    notes.append("«تنظيف شامل» and «تنظيف عميق» are two options here and one on the other forms (F6). «تنظيف غ..الضيوف» is kept as written (A8). K13: no blank line for other services")
                else:
                    notes.append("«تنظيف شامل وعميق» is one option here and two on the home forms (F6). «تنظيف غ..الضيوف» is kept as written (A8). Household occasions carried over (F4). K13: %d dotted lines without a ☐" % free_lines)
        if kind == "heading" and label in ("نوع الخدمة المبرمجة", "الخدمات المبرمجة"):
            notes.append("K10: «نوع الخدمة المبرمجة» on the home forms, «الخدمات المبرمجة» on the organisation and building forms")
        row["notes_out"] = ". ".join(n.rstrip(".") for n in notes)


LETTERHEAD_TEXT = "مركز إنماء برو / للتدريب والتنظيف والإحصاء / UNMAA Pro Center / ثقتكم ... أساس نجاحنا"
FOOTER_TEXT = "مركز إنماء للخمات - INMAA services center / مركز إنماء برو UNMAA Pro Center / Tel/WhatsApp: 06.59.53.81.83 / Gmail: unmaapro.center@gmail.com"


def letterhead_rows(form, start, model):
    """Two rows per form: the header picture and the footer picture."""
    sheet = fx.FORMS[form]["sheet"]
    prints = sheet + (" · every page" if form != "B" else "; complexes copy · every page")
    out = []
    for i, (part, text, note) in enumerate((
            ("header", LETTERHEAD_TEXT, "Picture, not text; the words are read off the picture. Placed %(w).1f × %(h).1f mm, %(r)d%% of its natural height (K3). Three activities and a Latin spelling the plan does not have (P10)"),
            ("footer", FOOTER_TEXT, "Picture, not text; the words are read off the picture. Placed %(w).1f × %(h).1f mm, %(r)d%% of its natural height (K3); it reaches the bottom edge of the paper (K4). «للخمات» is a typo inside the picture (F10); two names and two Latin spellings (P10)"))):
        pic = model[part][0]
        out.append(dict(
            id="%s-%03d" % (form, start + i), form=form, kind="image", text=text, loc=part, value_locs=[], items=[],
            lead_blank=None, flags=[], section=None, part="letterhead",
            maps="الإعدادات › عام › letterhead (pages `settings/`)", prints=prints, owner="F",
            screen="not built", print="not built",
            notes_out=note % dict(w=pic["width_mm"], h=pic["height_mm"], r=round(100 * pic["height_ratio_to_natural"]))))
    return out
