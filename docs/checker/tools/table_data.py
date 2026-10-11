"""Hand-written rows of docs/checker-table.md: the 49 numbered features and the
lines of the two handwritten pages.

Features: verdict, place and owner are copied from docs/scope.md section 4;
the Arabic names are read from plan/src/plan-ar.md at build time, and the
validator checks them again. Page folders come from CLAUDE.md.

Handwritten lines: the readings are the Checker's, made from the two photos
(the sideways one after a quarter turn counter-clockwise). They cannot be
checked by a script. Confidence: sure, likely, weak.
"""

NP = "not possible offline"

# number: (verdict, [(place, pages, owner)], prints, lost-or-note)
FEATURES = {
    1: ("Planned", [("طلبات الخدمة › العملاء", "clients/", "C"), ("طلبات الخدمة › الملفات › file hub", "files/", "C")], None, ""),
    2: ("Planned, with his eight file statuses", [("طلبات الخدمة › الملفات", "files/", "C")], None, ""),
    3: ("Office form", [("طلبات الخدمة › الملفات › file › الزيارة الأولية", "files/", "C")], "inspection sheet",
        "Photos only by the supervisor. Not possible offline: filling it in on a phone or tablet at the site"),
    4: ("Planned", [("طلبات الخدمة › الملفات › file › الدراسة المالية", "files/", "C")], None, ""),
    5: ("Part", [("طلبات الخدمة › الملفات › file › عرض السعر", "files/", "C")], "quote",
        "Printed and approved in the program. Not possible offline: sending it by WhatsApp"),
    6: ("Planned", [("طلبات الخدمة › الملفات › file › الاستمارة", "files/", "C"), ("طلبات الخدمة › الملفات › file › العقد وتجديده", "files/", "C")],
        "his five client sheets and the complexes copy", "His contract sheet is «الاستمارة»; the second place holds renewal, ending and clause text"),
    7: ("Planned", [("طلبات الخدمة › الملفات › file › الزيارات", "files/[id]/visits/", "O"), ("عمال النظافة › برنامج العمل", "work-program/", "O")], None, ""),
    8: ("Planned", [("عمال النظافة › برنامج العمل", "work-program/", "O")], None, ""),
    9: ("Part", [("عمال النظافة › الحضور والغياب", "worker-attendance/", "O")], None,
        "Suggestions as planned; the client is told by phone from a call list. Not possible offline: sending the client a message"),
    10: ("Part", [("الرئيسية › day board", "home/", "O")], None,
         "Built. Not possible offline: a status that changes by itself when the worker arrives or finishes; it changes when the office types in a phone call or a returned order"),
    11: ("Office form", [("طلبات الخدمة › الزيارات › visit page", "visits/", "O")], "mission order", ""),
    12: ("Office form", [("طلبات الخدمة › الزيارات › visit page", "visits/", "O"), ("عمال النظافة › الحضور والغياب", "worker-attendance/", "O")],
         "mission order (attendance block)",
         "The site contact initials both times on the order. Not possible offline: clock-in from a phone or a shared device, and proof of presence"),
    13: ("Office form", [("طلبات الخدمة › الملفات › file › المهام", "files/[id]/tasks/", "O"), ("طلبات الخدمة › الزيارات › visit page", "visits/", "O")],
         "mission order (checklist)", "Per-visit photos only by the supervisor: his article 8 forbids workers to photograph. Not possible offline: the worker ticking the list on a phone"),
    14: ("Office form", [("طلبات الخدمة › الزيارات › visit page", "visits/", "O"), ("طلبات الخدمة › الجودة والشكاوى", "quality/", "O")],
         "mission order (worker's notes)", "The office can log a phoned report at any time. Not possible offline: «فوراً», the report reaching the office from the site by itself"),
    15: ("Office form", [("طلبات الخدمة › الزيارات › visit page", "visits/", "O")], "mission order (sign-off slip)",
         "A scan can be attached. Not possible offline: the client signing on a screen; his signature exists on paper only"),
    16: ("Part", [("الرئيسية › tile", "home/", "O"), ("طلبات الخدمة › الزيارات", "visits/", "O")], None,
         "Tomorrow's call list with the script and a logged «client informed». Not possible offline: sending the reminder"),
    17: ("Office form", [("طلبات الخدمة › الجودة والشكاوى", "quality/", "O")], "supervisor inspection sheet", "The corrective task is created automatically"),
    18: ("Planned", [("طلبات الخدمة › الجودة والشكاوى", "quality/", "O")], None, ""),
    19: ("Part", [("المصاريف › الفواتير", "invoices/", "M")], "invoice with the visit statement", "Built and printed. Not possible offline: sending the invoice"),
    20: ("Part", [("المصاريف › التسديد والديون", "payments/", "M")], "payment reminder", "Built. Not possible offline: a reminder message; it is a printed letter or a call"),
    21: ("Planned", [("عمال النظافة › الساعات والأجور", "hours-pay/", "P")], None, "Complete only once the day's orders are typed in"),
    22: ("Planned", [("المصاريف › التقارير والمؤشرات", "reports/", "M")], "reports", "The end-of-day report counts orders not yet returned"),
    23: ("Part", [("sign-in (lock screen)", "src/lock/", "F"), ("الإعدادات › المستخدمون والصلاحيات", "settings/", "F")], None,
         "Office roles on the one PC. Not possible offline: a worker account; his «role» is the printed order"),
    24: ("Planned, in his number/suffix format", [("الإعدادات › قواعد العمل", "settings/", "F")], None, ""),
    25: ("Planned, on his registration form", [("عمال النظافة › العمال", "workers/", "P")], "worker sheet; ID card", ""),
    26: ("Part", [("طلبات الخدمة › الملفات › file form", "files/", "C"), ("the printed order", "visits/", "C")], "mission order (address block)",
         "Address, landmark and written directions on the order; an optional QR of the coordinates for the worker's own phone, off by default. Not possible offline: the map"),
    27: ("Part", [("الرئيسية", "home/", "O")], None,
         "Only the «no arrival reported» flag. Not possible offline: the position check, the automatic late alert and the SOS button"),
    28: ("Not possible", [], None, "It is the sync of a worker phone app, and there is no phone app. The program itself needs no network"),
    29: ("Planned (alert tile)", [("الرئيسية › tile", "home/", "C"), ("طلبات الخدمة › الملفات", "files/", "C")], None, ""),
    30: ("Planned", [("طلبات الخدمة › الملفات › file hub", "files/", "M"), ("المصاريف › التقارير والمؤشرات", "reports/", "M")], None, ""),
    31: ("Planned", [("المصاريف › الفواتير", "invoices/", "M")], "invoice", ""),
    32: ("Office form", [("المصاريف › التسديد والديون", "payments/", "M")], "cash receipt",
         "Numbered receipts printed for the authorised collector, reconciled daily; unused ones voided"),
    33: ("Planned", [("الإعدادات › السجل", "settings/", "F"), ("الإعدادات › عام", "settings/", "F")], None,
         "Access and change log, invoices voided never deleted, automatic daily backup"),
    34: ("Planned, in his structure", [("المخزون › جرد المخزون · التسليم · المشتريات", "inventory/, handouts/, purchases/, files/[id]/handouts/", "M")], "hand-out slip", ""),
    35: ("Planned", [("المخزون › الصيانة", "maintenance/", "M")], None, ""),
    36: ("Part", [("الموظفون › المشرفون والمناطق", "supervisors/", "O"), ("الرئيسية › filter", "home/", "O")], "supervisor day sheet",
         "Each supervisor's view on the one PC and a printed day sheet. Not possible offline: a device of his own"),
    37: ("Planned", [("عمال النظافة › التوظيف والتدريب", "hiring/", "P")], None, ""),
    38: ("Planned", [("عمال النظافة › الساعات والأجور", "hours-pay/", "P"), ("الموظفون › الموظفون › employee file", "employees/", "P")], "payslip", ""),
    39: ("Planned", [("المصاريف › المصاريف حسب القسم", "expenses/", "M")], None, ""),
    40: ("Planned (typed in at the office)", [("الموظفون › زيارات المندوب التجاري", "rep-visits/", "C")], None, ""),
    41: ("Planned", [("المصاريف › التقارير والمؤشرات", "reports/", "M")], "reports", ""),
    42: ("Not possible", [], None, "WhatsApp and SMS sending need a connection"),
    43: ("Not possible", [], None, "Card and Baridi Pay payments go through an online provider. The centre's CCP details are printed on invoices instead"),
    44: ("Not possible", [], None, "A web page for clients. The printed visit statement that comes with an invoice (19) covers its main use"),
    45: ("Not possible", [], None, "A public web form"),
    46: ("Part", [("عمال النظافة › برنامج العمل", "work-program/", "O")], None,
         "Day order per team by zone and a register of centre vehicles. Not possible offline: road routing"),
    47: ("Part", [("الإعدادات › عام", "settings/", "F")], None,
         "Branch field, filters and reports in one database. Not possible offline: sharing between branch PCs; a branch elsewhere needs its own PC, licence and data"),
    48: ("Part", [("المصاريف › التقارير والمؤشرات", "reports/", "M")], None,
         "Export files in his program's import format once it is named. Not possible offline: a live link"),
    49: ("Not possible", [], None, "A scan records nothing unless the worker's phone reaches the program. The floor tick table on the printed order (13) stays"),
}

PHOTO1 = "WhatsApp Image 2026-10-11 at 19.26.23(1).jpeg"  # upright; alerts and sections ① to ④; reads first
PHOTO2 = "WhatsApp Image 2026-10-11 at 19.26.23.jpeg"  # sideways; section ⑤ (stock)

FILES = "طلبات الخدمة › الملفات"
EXP = "المصاريف › المصاريف حسب القسم"
HAND = "المخزون › التسليم"

# (reading, confidence, maps to, owner, notes)
NOTES_1 = [
    ("و يضغط على زر قديم ☐ و يتم ملئها : استمارة التسجيل", "likely", FILES + " › new file › the «قديم» button, returning-client fill-in (pages `files/`)", "C",
     "Red ink. Starts mid-sentence, so the page before it is missing; whether «زر قديم» is a button or the «☐ قديم» box is not clear (H3). K21: the box he drew after «قديم» has a mark inside it"),
    ("الأولى تلقائيا .", "weak", FILES + " › new file › the «قديم» button (pages `files/`)", "C", "Red ink, end of the line above. «الأولى» is a weak read (H3)"),
    ("أريد تنبيهات متنوعة ، مثل :", "sure", "الرئيسية › alert tiles (pages `home/`)", "F", "«مثل»: the three below are examples only (H9)"),
    (". عند اقتراب فترة انتهاء العقد يرسل لنا رسالة لإعلامنا", "sure", "الرئيسية › alert tile: contract end (pages `home/`)", "M",
     "Built as a tile, a list and a desktop notification; nothing is sent (scope 1.6, H9). Lead time 30 days, a setting (A3)"),
    (". عند اقتراب التسديد الأتعاب يرسل رسالة .", "likely", "الرئيسية › alert tile: payment due (pages `home/`)", "M",
     "«الأتعاب» is probable, «الاتفاق» possible (H4). No lead time and no recipient given (H9); 7 days, a setting (A3)"),
    (". عند التعامل مع شخص موقفا و معاقبا يمنعنا من تسجيله", "likely", "the suspended-or-penalised check on new worker, employee and client registrations (pages `workers/`, `employees/`, `files/`)", "P",
     "«و» or «أو» between «موقفا» and «معاقبا»; «شخص» is not defined (H5). Called by C when a new file is started"),
    ("و ينبهنا و يسألنا : هل نسمح له أم لا ؟", "sure", "the suspended-or-penalised check: the question, answered by the manager only and logged", "P",
     "It says both «يمنعنا» and «يسألنا» (H5); scope 1.3"),
    ("1/ أقسام البرنامج :", "sure", "the navigation bar", "F", "Headed «1/» with no «2/» anywhere on the two pages (H8)"),
    ("① - قسم الموظفين بالمركز .", "sure", "bar section الموظفون (موظفو المركز)", "F", "Tabs: الموظفون (P) · الحضور والغياب (P) · المشرفون والمناطق (O) · زيارات المندوب التجاري (C)"),
    ("② - قسم عمال(ات) النظافة", "sure", "bar section عمال النظافة (عمال وعاملات النظافة)", "F", ""),
    ("③ - قسم طلبات الخدمة .", "sure", "bar section طلبات الخدمة", "F", "Daily operations have no section in his notes (P1)"),
    ("↳ 1 - قسم : المنازل . الشقق - الفلل", "sure", FILES + " › division switch: المنازل (pages `files/`)", "C", "His forms say «سكن» (P15)"),
    ("↳ 1- نوع الخدمة : عند الطلب .", "sure", FILES + " › المنازل › «نوع الخدمة» filter: عند الطلب (pages `files/`)", "C", "Form: home request"),
    ("↳ 2- نوع الخدمة : عقد عمل .", "sure", FILES + " › المنازل › «نوع الخدمة» filter: عقد (pages `files/`)", "C", "Form: home contract. «عقد عمل» here, «عقد» on the forms (P15)"),
    ("↳ 2- قسم : المحلات و المؤسسات الاقتصادية", "sure", FILES + " › division switch: المؤسسات (pages `files/`)", "C", "His forms say «مؤسسة» (P15)"),
    ("↳ 1- نوع الخدمة : عند الطلب .", "sure", FILES + " › المؤسسات › «نوع الخدمة» filter: عند الطلب (pages `files/`)", "C", "Form: organisation request"),
    ("↳ 2- نوع الخدمة : عقد عمل .", "sure", FILES + " › المؤسسات › «نوع الخدمة» filter: عقد (pages `files/`)", "C", "Form: organisation contract"),
    ("↳ 3 - قسم : العمارات و التجمعات السكنية .", "likely", FILES + " › division switch: العمارات and التجمعات السكنية (pages `files/`)", "C",
     "One line for two divisions (scope N2). «التجمعات» is the read; «المجمعات» is possible (H2)"),
    ("↳ ❶ - نوع الخدمة : عقد عمل (للعمارات)", "sure", FILES + " › العمارات, contract only (pages `files/`)", "C", "Form: building contract. The stock page also lists العمارات under «عند الطلب» (scope N1)"),
    ("❷ - نوع الخدمة : عقد عمل (للتجمعات)", "sure", FILES + " › التجمعات السكنية, contract only (pages `files/`)", "C", "No form of his own: the complexes copy of the building contract (A1, F1)"),
    ("④ - قسم المصاريف", "likely", "bar section المصاريف (المصاريف والمداخيل)", "F", "A word after it is struck out, probably «الإجمالية» (H1). Income per division is the developer's instruction (scope 1.2)"),
    ("↳ ① - مصاريف القسم ① : المنازل .", "sure", EXP + ": المنازل (pages `expenses/`)", "M", ""),
    ("↳ ② - مصاريف القسم ② : المؤسسات .", "sure", EXP + ": المؤسسات (pages `expenses/`)", "M", ""),
    ("↳ ③ - مصاريف القسم ③ : العمارات", "sure", EXP + ": العمارات (pages `expenses/`)", "M", ""),
    ("↳ ④ - مصاريف القسم ③ : التجمعات السكنية", "likely", EXP + ": التجمعات السكنية (pages `expenses/`)", "M", "He wrote «القسم ③» and added a circled 4 in the margin (H6)"),
    ("(writing from the facing page, cut off at the right edge: red and blue fragments)", "unreadable", "not mapped: cut off", "none", "More pages probably exist (H8)"),
]

NOTES_2 = [
    ("⑤ - قسم إدارة المخزون :", "sure", "bar section المخزون (إدارة المخزون)", "F", ""),
    ("1/ قسم جرد المخزون :", "sure", "المخزون › جرد المخزون (pages `inventory/`)", "M", ""),
    ("1- ↳ جرد المعدات .", "sure", "المخزون › جرد المخزون › switch: المعدات (pages `inventory/`)", "M", ""),
    ("2- ↳ جرد المواد .", "sure", "المخزون › جرد المخزون › switch: المواد (pages `inventory/`)", "M", ""),
    ("(2)/ قسم التسليم :", "sure", HAND + " (pages `handouts/`)", "M", "K20: numbered «(2)/» where the line above it is «1/». K19: المشتريات and الصيانة are not on this page; the scope adds them from features 34 and 35"),
    ("1/ للمعدات :", "likely", HAND + " › switch: المعدات (pages `handouts/`)", "M", "The label is written twice, the first partly struck out (H7)"),
    ("1- ↳ نوع الخدمة :", "sure", HAND + " › «نوع الخدمة» filter (pages `handouts/`)", "M", "K20: numbered «1-» with no «2-» beside it; the two values below carry their own «1-» and «2-»"),
    ("1- ↳ عند الطلب :", "sure", HAND + " › «نوع الخدمة» filter: عند الطلب (pages `handouts/`)", "M", "Service type first, then division: the reverse of the requests section (scope N3)"),
    ("↳ المنازل .", "sure", HAND + " › عند الطلب › division filter: المنازل (pages `handouts/`)", "M", ""),
    ("↳ المؤسسات .", "sure", HAND + " › عند الطلب › division filter: المؤسسات (pages `handouts/`)", "M", ""),
    ("↳ العمارات .", "sure", HAND + " › عند الطلب › division filter: العمارات (pages `handouts/`)", "M", "The requests section gives buildings «عقد عمل» only (scope N1); kept available here as he drew it (A1)"),
    ("↳ التجمعات .", "sure", HAND + " › عند الطلب › division filter: التجمعات السكنية (pages `handouts/`)", "M", "As the line above (scope N1, A1)"),
    ("2- ↳ عقد عمل :", "sure", HAND + " › «نوع الخدمة» filter: عقد (pages `handouts/`)", "M", ""),
    ("↳ المنازل", "sure", HAND + " › عقد › division filter: المنازل (pages `handouts/`)", "M", ""),
    ("↳ المؤسسات .", "sure", HAND + " › عقد › division filter: المؤسسات (pages `handouts/`)", "M", ""),
    ("↳ العمارات .", "sure", HAND + " › عقد › division filter: العمارات (pages `handouts/`)", "M", ""),
    ("↳ التجمعات .", "sure", HAND + " › عقد › division filter: التجمعات السكنية (pages `handouts/`)", "M", ""),
    ("2/ للمواد : نفس الخصائص تاع المعدات .", "sure", HAND + " › switch: المواد, with the same filters (pages `handouts/`)", "M", "«تاع» is dialect for «of» (H7). Who receives a hand-out is not said; «per job» is the developer's instruction (scope N3)"),
    ("(marks in the right margin: a «ع» at the top corner, digits and dashes at the bottom, cut off)", "unreadable", "not mapped: cut off", "none", "Writing from the facing page (H8)"),
]
