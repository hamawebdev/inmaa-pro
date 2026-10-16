# مركز إنماء برو management program: approved scope

**Status: approved by the developer on 2026-10-11 ("continue"), with the defaults below and the assumptions in section 9 in force.**
Desktop only, fully offline, Tauri, on the academy app at `/mnt/data/academy-system-desktop` (v2.2.0).
Owners: **F** Foundation, **P** People, **C** Clients and contracts, **O** Operations, **M** Money and stock. The Checker owns no feature.

## 1. Decisions in force

The developer was asked six questions and answered "continue", so these defaults apply until he says otherwise.

1. **Reference app.** `/mnt/data/academy-system-desktop`.
2. **His section ④.** Bar label «المصاريف», screen heading «المصاريف والمداخيل». Expenses per division (his note, which reads «قسم المصاريف») and income per division (the developer's instruction) are two tabs.
3. **The suspended-or-penalised check** applies to cleaning workers, centre employees and clients. Only the manager can answer yes, the answer is logged, and it allows that one registration.
4. **One PC.** One local database and one licence per machine. Staff take turns, each with an account and a role.
5. **Windows.** The app is built and proven on Linux here. The Windows installer is built later on a Windows machine; the configuration must already carry an offline WebView2 install mode.
6. **Alerts** are a tile and a list on the home screen plus a desktop notification while the program is open. Nothing is sent. The payment alert is for the office and lists the payer's name and phone.

## 2. Navigation

The academy bar holds six sections plus Lock and Settings. His five sections and the academy's home screen fill it exactly.

| Bar label (screen heading) | From | Tabs, with owner |
|---|---|---|
| الرئيسية | academy shell; not in his notes | One screen, no tabs, as the academy: today's tiles and the day board (O); alert tiles (F; each alert's rule belongs to its feature's owner) |
| الموظفون (موظفو المركز) | his ① قسم الموظفين بالمركز | الموظفون (P) · الحضور والغياب (P) · المشرفون والمناطق (O) · زيارات المندوب التجاري (C) |
| عمال النظافة (عمال وعاملات النظافة) | his ② | العمال (P) · التوظيف والتدريب (P) · برنامج العمل (O) · الحضور والغياب (O) · الساعات والأجور (P) |
| طلبات الخدمة | his ③ | الملفات (C) · الزيارات (O) · الجودة والشكاوى (O) · العملاء (C). On الملفات his four divisions are a switch: المنازل · المؤسسات · العمارات · التجمعات السكنية. «نوع الخدمة» (عند الطلب / عقد) filters the first two; the last two are contract only |
| المصاريف (المصاريف والمداخيل) | his ④, name to confirm | المصاريف حسب القسم · المداخيل حسب القسم · الفواتير · التسديد والديون · التقارير والمؤشرات (all M) |
| المخزون (إدارة المخزون) | his ⑤ | جرد المخزون · التسليم · المشتريات · الصيانة (all M). المعدات / المواد is a switch; on التسليم, «نوع الخدمة» and the division are filters, as he drew them |
| القفل · الإعدادات | academy shell | Settings tabs: عام · قواعد العمل · المستخدمون والصلاحيات · السجل (F) |

His notes name no section for daily operations. The day board goes on the home screen and the rest under «طلبات الخدمة».

## 3. Screens under each section

The closest academy screen is in brackets. The academy has two visual generations; I match the newer one (home, attendance, settings).

- **الرئيسية.** Tiles for today's visits by status, alert tiles, then the day board: visits of the chosen day by colour, with a "no arrival reported" flag [home tiles; attendance list]. Each alert tile opens a filtered list in the section that owns it, as the academy's "expired" and "debt" tiles do.
- **الموظفون.** List, new, file, pay [academy employees, redrawn with the newer table]. Attendance and absence [academy attendance; edit and delete are new]. Supervisors and zones: who supervises which zone and workers, with a printed day sheet per supervisor [list with dialog]. Rep visits: organisations and buildings visited, call-back dates [dialog form over a list].
- **عمال النظافة.** Workers: list; a registration screen with every field of his form; the hiring score and decision; documents; an office-only block (zone, role, pay basis, capacity, authorised to collect, sanction state, violations); prints the form and the internal regulations [academy teachers: list and form]. Hiring and training: candidates, training days, document expiry [list with dialog]. برنامج العمل: week per worker with load against capacity, visits generated from contracts, team day order, centre vehicles [academy scheduling calendar; dated weeks, teams and load are new]. Attendance and absence with replacement suggestions [academy attendance]. Hours and pay: hours per period, pay run, advances, deductions, payslip [academy payouts and debt ledger].
- **طلبات الخدمة › الملفات.** List with status chips. "New" opens the screen form that mirrors his Word form; the «قديم» button finds the client and fills the basic information and the site description [academy students list, groups level switch, employee form]. A file is a hub page with one page per part, each with a back action, as the academy does for a student: الاستمارة (prints in his Word layout) · الزيارة الأولية · الدراسة المالية · عرض السعر · العقد وتجديده · المهام (daily, weekly, monthly) · الزيارات · القاطنون (buildings and complexes) · التسليم · التسديد.
- **طلبات الخدمة › الزيارات.** Visits by date and status; orders printed here, returned orders typed in here. A visit is one page with one Save, because it is typed from one returned sheet: order, attendance, tasks, worker's notes, sign-off and rating [nearest: academy group page; mostly new].
- **طلبات الخدمة › الجودة والشكاوى.** Inspection plan, supervisor inspections, corrective tasks, complaints with a response counter, problem reports [two-axis attendance list].
- **طلبات الخدمة › العملاء.** One card per client: sites, contacts, last and next service, payment state, rating, sanction state [academy student overview].
- **المصاريف.** Expenses by division and category [academy expenses]. Income by division: four tiles, period filter, chart and table [academy finance analytics]. Invoices: list, a run for all contracts with the visit statement, print, void [finance table and receipt print; the run is new]. التسديد والديون: payments, due dates, overdue list, cash receipts and daily reconciliation [academy payment ledger and debt list]. Reports: end of day, week, month, per worker, per contract, forecast, export files.
- **المخزون.** Inventory with minimum levels; hand-outs recorded against a job, to a named worker, with equipment returns; purchases; maintenance [list with dialog throughout].
- **الإعدادات.** عام: centre identity, tax identifiers, letterhead, language, appearance, backup, licence, system, branches. قواعد العمل: days, periods, limits, alert lead times, approval rule, tax mode, stamp duty, numbering, zones, rates. المستخدمون والصلاحيات: accounts, roles, role by section. السجل: access and change log.
- **Lock.** Signing in at start is new: the academy opens straight onto its home screen. The lock screen gains a user list, "lock now" signs out, and the section picker becomes role by section. Cost and margin are for المدير; health answers and the confidential hiring score for المدير and مسئول الموارد البشرية.

Printed sheets: his six forms and a complexes copy of the building contract, in his layout with his letterhead; inspection sheet, quote, mission order (with attendance, checklist, worker's notes and sign-off slip), supervisor inspection sheet, invoice, cash receipt, payment reminder, payslip, hand-out slip, supervisor day sheet, reports, ID card. Printed forms are always Arabic.

## 4. Every numbered feature

**Planned** = built as planned. **Office form** = printed, then typed in by the office or the supervisor. **Part** = some of it needs a network and is left out. **Not possible** = exists only with a network.

| # | Feature | Built | Where | Owner |
|---|---|---|---|---|
| 1 | Client file and sites | Planned | Requests › العملاء; file hub | C |
| 2 | Requests up to contract | Planned, with his eight file statuses | Requests › الملفات | C |
| 3 | Field inspection | Office form. Photos only by the supervisor | File › الزيارة الأولية | C |
| 4 | Cost and price | Planned | File › الدراسة المالية | C |
| 5 | Quote and approval | Part: printed and approved in the program; not sent by WhatsApp | File › عرض السعر | C |
| 6 | Contract and renewal | Planned. His contract sheet is «الاستمارة»; this part holds renewal, ending and clause text | File › الاستمارة, العقد وتجديده | C |
| 7 | Recurring scheduling | Planned | File › الزيارات; Workers › برنامج العمل | O |
| 8 | Worker schedule and workload | Planned | Workers › برنامج العمل | O |
| 9 | Absence and replacement | Part: suggestions as planned; the client is told by phone from a call list, nothing is sent | Workers › الحضور والغياب | O |
| 10 | Day board | Part: built, but a status changes only when the office types in a phone call or a returned order | Home | O |
| 11 | Mission order | Office form | Visit page | O |
| 12 | Attendance | Office form. Lost: proof of presence, so the site contact initials both times on the order. No clock-in from a phone or a shared device | Visit page; Workers › الحضور والغياب | O |
| 13 | Task list and photos | Office form. Per-visit photos only by the supervisor (his article 8 forbids workers to photograph) | File › المهام; visit page | O |
| 14 | Problem report from the site | Office form. Lost: «فوراً»; the office can log a phoned report at any time | Visit page; Requests › الجودة والشكاوى | O |
| 15 | End of service, sign-off, rating | Office form. The client's signature exists on paper only; a scan can be attached | Visit page | O |
| 16 | Client reminder before the visit | Part: tomorrow's call list with the script and a logged "client informed"; nothing is sent | Home tile; Requests › الزيارات | O |
| 17 | Supervisor inspection and quality score | Office form. The corrective task is created automatically | Requests › الجودة والشكاوى | O |
| 18 | Complaints log | Planned | Requests › الجودة والشكاوى | O |
| 19 | Invoices | Part: built and printed; not sent | Money › الفواتير | M |
| 20 | Payments and debts | Part: built; the reminder is a printed letter or a call, not a message | Money › التسديد والديون | M |
| 21 | Hours per worker | Planned. Complete only once the day's orders are typed in | Workers › الساعات والأجور | P |
| 22 | Reports and indicators | Planned. The end-of-day report counts orders not yet returned | Money › التقارير والمؤشرات | M |
| 23 | Users and permissions | Part: office roles on the one PC; the worker has no account, his "role" is the printed order | Sign-in; Settings › المستخدمون والصلاحيات | F |
| 24 | Unified numbering | Planned, in his number/suffix format | Settings › قواعد العمل | F |
| 25 | Worker file | Planned, on his registration form | Workers › العمال | P |
| 26 | Site on the map | Part: address, landmark and written directions on the order; an optional QR of the coordinates for the worker's own phone, off by default; no map | File form; printed order | C |
| 27 | Worker presence and safety | Part: only the "no arrival reported" flag; position check, automatic late alert and SOS not possible | Home | O |
| 28 | Work without internet | Not possible | | none |
| 29 | Follow-up of pending quotes | Planned (alert tile) | Home tile; Requests › الملفات | C |
| 30 | Profitability per contract | Planned | File hub; Money › التقارير والمؤشرات | M |
| 31 | Legal invoice data | Planned | Money › الفواتير | M |
| 32 | Cash receipt in the field | Office form: numbered receipts printed for the authorised collector, reconciled daily; unused ones voided | Money › التسديد والديون | M |
| 33 | Data protection | Planned: access and change log, invoices voided never deleted, automatic daily backup | Settings › السجل, عام | F |
| 34 | Stock and purchasing | Planned, in his structure | Stock | M |
| 35 | Equipment and maintenance | Planned | Stock › الصيانة | M |
| 36 | Several supervisors and zones | Part: each supervisor's view on the one PC and a printed day sheet; no device of his own | Employees › المشرفون والمناطق; home filter | O |
| 37 | Hiring and training | Planned | Workers › التوظيف والتدريب | P |
| 38 | Full payroll | Planned | Workers › الساعات والأجور; employee file | P |
| 39 | Expenses and monthly profit | Planned | Money › المصاريف حسب القسم | M |
| 40 | Sales rep visits | Planned (typed in at the office) | Employees › زيارات المندوب التجاري | C |
| 41 | Advanced analytics and cash flow | Planned | Money › التقارير والمؤشرات | M |
| 42 | Automated messages | Not possible | | none |
| 43 | Card payment | Not possible | | none |
| 44 | Client page | Not possible | | none |
| 45 | Online booking with instant price | Not possible | | none |
| 46 | Routes and travel | Part: day order per team by zone and a register of centre vehicles; no road routing | Workers › برنامج العمل | O |
| 47 | Branches | Part: branch field, filters and reports in one database; a branch elsewhere needs its own PC, licence and data, and nothing merges them | Settings › عام | F |
| 48 | Link to the accountant's program | Part: export files in his program's import format once it is named; no live link | Money › التقارير والمؤشرات | M |
| 49 | QR codes in buildings and organisations | Not possible | | none |

**Not built, with the reason**
- 28: it is the sync of a worker phone app, and there is no phone app. The program itself needs no network.
- 42: WhatsApp and SMS sending need a connection.
- 43: card and Baridi Pay payments go through an online provider. The centre's CCP details are printed on invoices instead.
- 44: a web page for clients. The printed visit statement that comes with an invoice (19) covers its main use.
- 45: a public web form.
- 49: a scan records nothing unless the worker's phone reaches the program. The floor tick table on the printed order (13) stays.
- Parts of others: WhatsApp sending (5, 9, 16, 19, 20); status change from a phone (10); clock-in from a phone or a shared device (12); a worker account (23); the map (26); position check, automatic late alert and SOS (27); a supervisor's own device (36); road routing (46); sharing between branch PCs (47); a live accounting link (48).

**What his new documents add:** centre employees (P); the fourth division, التجمعات السكنية (C for its files; M for its expense and income lines and its stock filter); stock hand-outs per job (M); returning-client fill-in (C); the alert tiles and registry (F) with the contract-end and payment-due alerts (M); the suspended-or-penalised check (P, called by C when a new file is started).

**The end-to-end run.** A contract file goes جديد, الزيارة, عرض سعر, متعاقد, then visits from «أيام التنفيذ» between its two dates, then انتهاء التعاقد. An on-demand file follows the same statuses, which his on-demand forms also print: the accepted quote confirms the job, and its visits come from the form's dates and days. Buildings and complexes run as contracts.

## 5. Legal rules built in

| Rule (build notes) | Where | Owner |
|---|---|---|
| Invoice fields of Decree 05-468: both parties' RC, NIS and NIF, payment method and due date, totals before and after tax, the total in words in Arabic and French; 19% VAT or IFU with no VAT shown; stamp duty on cash, on receipts too | Invoices; the centre's identifiers in Settings; a client's on its card, required before an organisation's first invoice | M |
| Unbroken invoice and receipt sequences per year, outside the numbering settings; void, never delete; no issue dated before the last one | Invoices, receipts | M, F |
| Access and change log: collection, consultation, change, disclosure (print, export, backup) and erasure, each with reason, date, time and user; hash chain over invoices, receipts and the log; nothing purged for ten years; restore for the manager only, with a warning when a backup predates the last invoice | Settings › السجل; backup | F |
| Health answers and the confidential hiring score restricted and logged | Worker file | P, F |
| 40-hour week with a warning up to 48; 12-hour day span; flag for women scheduled between 21:00 and 05:00; rotating rest day on six-visit contracts | برنامج العمل | O |
| Leave at 2.5 days a month, overtime at +50%; CNAS and IRG from rates kept in settings, editable per payslip | Hours and pay | P |
| No fingerprint or face clock-in; no worker location stored | everywhere | all |

The declaration to the ANPDP stays the centre's duty. Offline does not remove it.

## 6. The 26 questions

| س | Topic | After the new documents |
|---|---|---|
| 1 | Which divisions first | Answered: all, plus complexes |
| 2 | Headcount, reserves | Open |
| 3 | City, zones | Partly: every form is issued at أم البواقي; zones open |
| 4 | Existing records to import | Open |
| 5 | Who does what | Partly: the worker form names المدير, الإدارة, المشرف, مسئول الموارد البشرية; who does which task open |
| 6 | Quote approval rule | Open |
| 7 | Workers' phones | Settled by your decision; who types in, and workers' reading level, open |
| 8 | Alone or in a team | Partly: «عدد العمال» and «دخول الفريق» on every file; team leader open |
| 9 | Transport | Partly: per file, on the centre or the client, with an amount; means and travel time open |
| 10 | Days and hours | Partly: Saturday to Thursday on client forms; morning, evening or both, with free times; Friday, period limits and night work open |
| 11 | Worker pay | Open |
| 12 | Worker constraints per client | Partly: abilities, health and available days are on his form, sex only as the «/H/F» suffix; client-side rules open |
| 13 | Packages or a price per client | Partly: no package on any form, one amount per file (inferred) |
| 14 | Price formula | Partly: materials cost, transport cost and a total; the formula open |
| 15 | Billing | Partly: «دورية السداد» has four options; advance or arrears, missed visits, late cancellation open |
| 16 | VAT or IFU, certified software | Open |
| 17 | Public or large clients | Partly: «قطاع العمل: عام / خاص»; the documents they ask for open |
| 18 | Who collects cash | Partly: a worker may not, unless authorised and documented (regulations, article 12); deposits open |
| 19 | Card payment | Answered: three methods (نقدًا, تحويل بنكي, تحويل بريدي); card settled by offline |
| 20 | Signature | Partly: paper. Whose «الإمضاء والختم» it is, and where the client signs, open |
| 21 | Language | Answered for documents (Arabic); French documents open |
| 22 | Client pages | Settled by your decision |
| 23 | Numbering, statuses | Partly: his eight file statuses and a number/suffix format (BLC, H/F); the other suffixes and the visit statuses open |
| 24 | Scales | Partly: one five-level cleanliness scale; letter classes gone; difficulty scale open |
| 25 | Quality | Open. Only hiring is scored, out of 100; article 16 names seven worker criteria with no scale |
| 26 | Launch scope | Answered for stock and for expenses per division; the rest settled by your scope |

## 7. Conflicts and unreadable lines

**Handwriting**
- H1. Section ④ title: «قسم المصاريف» is the likely read (see question 2 above). A word after it is struck out, probably «الإجمالية».
- H2. The fourth division reads «التجمعات السكنية»; «المجمعات السكنية» is possible.
- H3. The red line starts mid-sentence («و يضغط على زر قديم ☐ و يتم ملئها : استمارة التسجيل الأولى تلقائيا»), so the page before it is missing. «الأولى» is a weak read. Whether «زر قديم» is a button or the «☐ قديم» box, and whether «استمارة التسجيل الأولى» is a form I was not given, is not clear.
- H4. Second alert: the word after «التسديد» is probably «الأتعاب» (as in «مسدد أتعاب»), possibly «الاتفاق».
- H5. Third alert: he wrote «موقفا» then «و» or «أو» then «معاقبا». "Person" is not defined. It says both "prevents us" and "asks us".
- H6. Line ④ of section ④ says «القسم ③», with a circled 4 added in the margin.
- H7. Under التسليم the first branch label is partly struck out; the second reads «2/ للمواد: نفس الخصائص تاع المعدات».
- H8. Writing from facing pages is cut off at the edges of both photos, and the list is headed «1/» with no «2/». More pages probably exist.
- H9. He writes "sends a message", introduces the alerts with «مثل» (examples only), and gives no lead time and no recipient for the payment alert.

**Inside his notes**
- N1. Requests give buildings and complexes «عقد عمل» only; the stock tree lists both under «عند الطلب» as well. The building form itself offers one-off work («تنظيف بعد البناء»).
- N2. Three divisions under requests; four lines under section ④ and under stock.
- N3. Requests nest division then service type; stock nests service type then division. Who receives a hand-out is not said; "per job" is your instruction.

**Plan against the new documents (the new documents win)**
- P1. Five sections replace the plan's journey; operations have no section in his notes.
- P2. His eight file statuses replace the plan's list. They mix client kind (قديم, جديد), stage (الزيارة, عرض سعر, متعاقد, انتهاء التعاقد) and sanction (متوقف, معاقب), with no value for a refused quote or a finished one-off job. «متوقف» is not the notes' «موقفا», and in the older forms it meant a client who paused.
- P3. Numbers are a sequence then «/suffix» (BLC on the building contract, H/F on the worker form), not the plan's prefixes. Four suffixes are blank; «رقم التسجيل» against «رقم الملف» is not explained; «رقم العمارة», «رقم المؤسسة» and «رقم الباب» may be street numbers or codes.
- P4. One sheet per file replaces registration, inspection, quote and contract. The old inspection detail (per-space state, hours, cost lines, margin, photos, approval) is absent.
- P5. Contracts are قصير or طويل, for شهر, 3 أشهر, 6 أشهر or سنة, with one to six visits a week. The plan's "once" and "weekly" contracts are gone; one-off work is «عند الطلب».
- P6. Client forms offer Saturday to Thursday; the older forms offered Friday, and the worker form still does.
- P7. Three payment methods; electronic payment is gone. New: «كل أسبوعين», «مسدد أتعاب», «مكان التسديد».
- P8. One cleanliness scale. No difficulty scale and no letter classes.
- P9. His worker form replaces the plan's worker file. It registers, it does not employ: no zone, role, leave, skills, contract, start date, capacity or pay, and no status field. Its last two pages (18 articles of internal regulations; the form is four A4 pages in Word) are signed with it, though the plan left conduct rules outside the system.
- P10. The letterhead says «مركز إنماء برو للتدريب والتنظيف والإحصاء» (UNMAA Pro Center), three activities; the plan says «مركز إنماء للخدمات»; the footer image carries both names and two Latin spellings. No tax identifier or address appears.
- P11. Stock and equipment move from "later" to a main section.
- P12. Article 8 forbids workers to photograph at clients' sites, against the plan's before and after photos.
- P13. No invoice, tax line or receipt appears in any new document. They stay, because the law requires them.
- P14. Fields the plan relies on are gone from the forms (request source, priority, forbidden areas, photo consent, same-worker rule, client tax numbers) or reduced (contacts' roles, keys, allowed hours, estimated hours).
- P15. Wording differs between his notes and his forms: «عقد عمل» against «عقد»; «المنازل . الشقق - الفلل» against «سكن»; «المحلات و المؤسسات الاقتصادية» against «مؤسسة», which also has «قطاع العمل: عام». «الزيارة» means both the first inspection and a service visit.

**Inside the forms**
- F1. No form for: residential complexes, on-demand buildings, centre employees, quote, mission order, attendance, inspection, invoice, receipt, stock hand-out. The worker form's title is general («استمارة التسجيل بمركز إنماء»), so it may also be his employee form.
- F2. The contract forms have no clauses, one «الإمضاء والختم» box with no owner, and no assigned workers.
- F3. «المبلغ إجمالي»: per visit, per period or for the whole contract is not said; one «تاريخ تسديد» sits beside a periodic «دورية السداد»; whether the two «مصاريفها» amounts are inside it is not said.
- F4. Options carried over from another form: «مسؤول العمارة», «تعليمات العمارة» and the guard rows on housing and organisation forms; flat sizes F2 to F5 and a bare «كبير» on the organisation forms; household occasions (الولائم, رمضان, السفر) on organisation and building forms.
- F5. «عدد الزيارات» has six labels and five boxes.
- F6. Sibling forms word the same field differently: «تاريخ الزيارة» and «الزيارة الأولية»; «تاريخ تسديد» and «تاريخ التسديد»; «(01):» before the phone on two forms; «تنظيف شامل وعميق» as one option on three forms and as two on the housing forms.
- F7. On-demand forms carry «متعاقد», «انتهاء التعاقد» and «تنظيف دوري»; «نوع الطلب: شامل / عميق» repeats two programmed services; one tick or several is not said. «معا» has a single «من / إلى» pair. «تعليمات أمنية: نعم / لا» has no room for the instructions.
- F8. Numbering slips: sections restart at 1 on the building contract; items run 1, 2, 1, 3 on the two request forms; three files are named «-01-», «-01-.docx» is a copy of the worker form, and the file names put organisations before housing, the reverse of his notes.
- F9. Unclear terms: «اسم المتداول», «العنوان مدقق», «على عاتق صاحبها», «تخزين معدات», «تنظيف غ..الضيوف», «مدة التنفيذ» (hours or days), the قصير / طويل threshold, «BLC», «H/F».
- F10. Typos: «مسأجر», «للخمات» (footer image), «مسئول» and «مسؤول», «الإثنين» and «الاثنين».
- F11. Worker form: a score out of 100 over ten criteria with twelve score slots; «رفض المعني النهائي»; no trial length; «هل عملت في المجال: نعم لا» is ticked with two drawn ovals, not boxes; «الإمضاء والختم» is a borderless cell.
- F13. The Checker's reading of the Word files adds findings K1 to K22 (page counts, the stretched letterhead that runs to the paper edge, unlabelled blanks before option lists, which side each tick box sits on, sibling differences). They are listed with their rows in `docs/checker/forms/differences.md`. The five client forms are two pages each and the building contract three, by estimate.
- F12. Building contract: the residents table has 26 fixed rows and a «تاريخ التسجيل» per resident whose purpose is not said (third-party personal data); the number of flats is asked twice.

**The academy app against your rules**
- R1. It has no user accounts or roles (one manager password that locks sections), no access log, no numbering, no automatic backup, no alerts, no A4 form print, no export. These are built new, in its style.
- R2. It has two visual generations. I match the newer one.
- R3. It prints through the system print dialog; saving a PDF means "print to PDF".
- R4. This Linux machine builds and runs the Linux app. The Windows installer needs a Windows machine, and must carry the WebView2 runtime so that installing needs no download.
- R5. No Word or LibreOffice here, so I cannot render his files. Print layouts are rebuilt from the Word XML (A4; one margin set for the worker form, another for the five client forms; tables; letterhead images) and you compare them on paper. His fonts (Traditional Arabic, Sakkal Majalla) are Windows fonts: used when installed, otherwise the app's bundled Arabic font.
- R6. Its tab strips appear to run left to right in Arabic (the direction provider is never mounted). Read from the code, not seen running. If confirmed I fix it here rather than copy it.
- R7. It is offline only because it has no network code: there is no content security policy. I add one and remove the unused link-opener, so that offline is enforced.
- R8. Its backup is an unencrypted copy of the database and uploads, and its restore accepts any file. I keep the format, add the daily automatic copy to a second drive or USB (never a synced folder), and guard restore as in section 5.
- R9. Dropped from the academy: badge scanning, the "coming soon" page. Kept: the printable ID card, for workers and employees, without a QR.

## 8. How the team splits

Foundation lands first: the academy shell copied here under a new name, identifier and licence secret, his sections in the bar, sign-in, the whole data model, numbering, statuses, settings, the log, the alert registry and the print sheet. Then People, Clients and contracts, Operations, and Money and stock build in parallel, each in its own folders. The Checker keeps one table of every numbered feature, form field and note line against a screen, compares each screen with the academy, and runs build, lint and tests.

Done means: one seeded job runs end to end in each of the four divisions and shows in income and the reports; a worker is registered and the form printed; a hand-out is recorded; both alerts and the suspended-person check fire; build, lint, type-check and tests pass; the app opens with the network off.

## 9. Assumed unless you object

- A1. Division 4 is «التجمعات السكنية», contract only, on a copy of the building contract titled «نوع الخدمة : عقد (تجمع سكني)». Buildings stay contract only. On التسليم, «عند الطلب» stays available for all four divisions as he drew it.
- A2. Centre employees get the academy's employee file with the personal block of his worker form, a job position, a login role and a sanction state.
- A3. Alert lead times are settings: 30 days before a contract ends, 7 days before a payment is due.
- A4. The form screen mirrors his Word form field for field, with his options. Fields the plan's features need and his forms dropped (P9, P14) sit in an office-only block that is not printed on his sheets. The old inspection and cost detail stays as the optional parts for features 3 and 4, feeding his «المبلغ إجمالي».
- A5. The eight statuses appear as he lists them and print as ticks. «قديم» is ticked by the «قديم» button, one stage is current, and «متوقف» and «معاقب» are states on the client. A refused quote or a finished one-off job closes the file without a new status.
- A6. Registration numbers follow his format. BLC and H/F as given, H or F chosen per worker. The other suffixes stay empty until he names them. Quotes, visits, invoices, receipts and complaints get plain sequences per year.
- A7. «المبلغ إجمالي» is stored as he writes it, with a choice beside it: per payment period, or the whole contract. «تاريخ تسديد» is the first due date; later ones come from «دورية السداد».
- A11. Print reproduces what his Word file prints: the letterhead at its placed size, his label strings, and the numbers Word generates, slips included. A screen shows each form's own wording without the stretching character. «حررت: بأم البواقي، بتاريخ» prints the file's issue date, and stays blank on an empty form.
- A8. Wording follows his forms. I correct «مسأجر» to «مستأجر», and keep «تنظيف غ..الضيوف» as written until he confirms «غرف».
- A9. Open questions become settings with working defaults: tax mode chosen at first run (16); the manager approves every quote (6); 40 hours a week and 8 a day, pay basis per worker (11); the commune as the zone (3); the plan's seven visit statuses (23); one order per team with a line per worker (8); the office types in (7); invoices at period end for visits done (15); inspections scored out of 100, client rating 1 to 5, complaints answered within 2 hours (25); no import (4).
- A10. The program carries his letterhead name, «مركز إنماء برو». Arabic becomes the default language; French and English stay, so every new text is written in all three.

## 10. Questions for the client or his accountant

These came out of the data model. Each has a working default that is a setting or a seed row, so nothing waits for the answers.

1. Is «متوقف» on his client forms the blocking state? In his older forms it meant a client who paused. Default: it blocks.
2. «رقم التسجيل» and «رقم الملف»: one counter per form kind that never restarts, suffix BLC on the building contract and none on the others (the complexes copy too, so its numbers never look like a building contract's); one counter for all clients; workers numbered `n/H` or `n/F`. Which suffixes does he want for the other forms and for complexes? Does he already have numbers on paper to continue from?
3. «طريقة السداد»: can several be ticked? Default: yes on the file, one chosen on each invoice.
4. Stamp duty on cash: on the whole tax-included amount from 300 DA, or by bands? Default: the whole amount.
5. VAT or IFU, and when he quotes «المبلغ إجمالي» under VAT, is tax included? Default: asked at first run; read as tax included. Does he have a NIN to print?
6. Pay: the CNAS rates (9% and 26% assumed), the IRG scale (not seeded), the leave year, the premium for work on a rest day.
7. Lead times and lengths with no source in his documents: document expiry warning (30 days), trial period (30 days), quote validity (15 days), worker evaluation every 3 months.
8. Credit notes and refunds. Default: none; a wrong invoice is voided and issued again, and an overpayment stays as the file's credit.
9. The residents list on a building contract and its «تاريخ التسجيل»: what is it for? Default: kept on the site, never billed, never printed on an order.
10. Friday and public holidays. Default: client forms offer six days; a Friday visit only by hand.
11. When «على عاتق صاحبها» is ticked, does the amount beside it mean anything? Default: stored, ignored in totals.
12. A first deep clean followed by a periodic contract. Default: one file and one sheet, with the first job as an extra amount due.
13. Who types the sales rep's visits (feature 40)? Default: whoever writes the employees section (the manager and الإدارة); the manager can give reception the right in Settings.
14. Wording the program had to invent, where his documents give none, for him to confirm or replace: the first visit's results (مناسب للخدمة، يحتاج إلى دراسة، يحتاج إلى تنظيف أولي عميق، يحتاج إلى معدات، يحتاج إلى فريق إضافي، يحتاج إلى خدمات خاصة), the site's condition factors (بقايا إسمنت أو طلاء، دهون، روائح قوية، حيوانات أليفة، نفايات متراكمة، أشغال حديثة، أجهزة حساسة), the rep visit's interest levels and the contact roles. Default: as worded.
15. An organisation without a trade register (an administration, an association): the program asks for its NIF and NIS on every first invoice, and its RC only when «السجل التجاري» is نعم. Is that what his accountant wants?

Two lists were checked on 2026-10-12. The 29 communes of the wilaya of أم البواقي match the 2008 census list and its official codes (0401 to 0429), with one correction («الراحية»). The 69 wilayas still need one check: the eleven created on 16 November 2025 are numbered 59 to 69 as the press reported them, not yet against the Journal officiel.
