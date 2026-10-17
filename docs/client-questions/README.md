# Client questions (Google Form)

`client-questions-form.gs` is a Google Apps Script. It creates a Google Form in Arabic for the owner of مركز إنماء برو (and his accountant), and a Google Sheet where the answers arrive. It has 74 questions on 9 pages, and every question is optional. 59 of them have a help line «الآن: …» that says what the program does today. That is what the program keeps when the question is left empty. Only invoicing waits for answers: no invoice issues until page 1 gives the address, RC, NIS, NIF and AI, and the tax regime (page 2) is chosen.

Words used in the form: «الاستبيان» means this Google Form, «الاستمارة/الاستمارات» means only his six Word forms, «وثيقة» means a file he sends, «سند القبض» is the cash receipt, and «خارج الرسم» / «بكل الرسوم» are HT / TTC.

## Running it

1. Open script.google.com, signed in with the Google account that should own the form.
2. Create a new project, replace the editor's content with the whole `.gs` file, and save.
3. Choose `createClientQuestionsForm` in the function list and press Run. Authorise the access it asks for (Forms and Sheets in your own Drive).
4. Open the Execution log. It prints three links: the form to send to the client, the edit link, and the answers sheet.

Each run creates a new, separate form. The structure is data: `FORM` holds the title, description and confirmation, and `SECTIONS` holds the pages and their items (`text`, `paragraph`, `choice`, `checkbox`, `header`; `other: true` adds Google's "Other" box; `validate: NUMBER` accepts only a number ≥ 0). `addItem` marks every item optional.

## What each answer changes

Keys are those in `src/lib/settings/catalogue.ts`. Most are set in Settings › عام or › قواعد العمل. Scope references: `Q` = `docs/scope.md` section 10, `س` = section 6, `A` = section 9; F/H/N/P/R are the section 7 findings. "Change by X" means the program has no setting for that answer, so the owner named must change the code.

### 1. هوية المركز على الفواتير والوثائق (centre identity)

| Question | English | Changes |
|---|---|---|
| اسم المركز كما يُكتب على الفواتير | Centre name on invoices (Arabic + Latin) | `centre.nameAr`, `centre.nameLatin` (P10) |
| الشكل القانوني | Legal form | `centre.legalForm` |
| العنوان الكامل للمقر، والهاتف والبريد الإلكتروني | Address, phone, e-mail | `centre.address`, `centre.phone`, `centre.email` |
| رقم السجل التجاري (RC) | Trade register no. | `centre.rc` |
| رقم التعريف الإحصائي (NIS) | NIS | `centre.nis` |
| رقم التعريف الجبائي (NIF) | NIF | `centre.nif` |
| رقم المادة (AI) | Article no. | `centre.articleNumber` |
| رقم التعريف الوطني (NIN) | Owner's NIN, if a natural person | `centre.nin` (Q5) |
| رقم المستخدم لدى الضمان الاجتماعي (CNAS) | CNAS employer no. | `centre.cnasEmployerNumber` |
| الحساب البنكي … والحساب البريدي الجاري (CCP) ومفتاحه | Bank account, CCP and key | `centre.bankName`, `centre.bankAccount`, `centre.ccpNumber`, `centre.ccpKey` |

### 2. الضرائب والفوترة (tax and invoicing)

| Question | English | Changes |
|---|---|---|
| النظام الضريبي للمركز | VAT or IFU | `tax.mode` (Q5, س16) |
| … هل «المبلغ إجمالي» … يشمل الرسم؟ | Is his amount tax-included? | `tax.pricesIncludeVat` (Q5); per file `File.amountIncludesVat` |
| كيف يُحسب حق الطابع على الدفع نقدًا؟ | Stamp duty: whole amount or progressive | `stamp.mode` WHOLE / PROGRESSIVE (Q4) |
| … برنامج فوترة معتمدًا؟ | Is certified software required? | Information only (س16). A "yes" is a decision for the developer |
| الفاتورة الخاطئة والمبلغ الزائد المدفوع | Credit note instead of void; refund instead of credit | Q8. Credit notes or refunds: change by Money (a new chained document also needs Foundation) |
| المؤسسات التي ليس لها سجل تجاري | Organisations without RC | Q15. Exempting administrations: change by Clients (`getClientForInvoice().missing`) |
| طريقة السداد | Several methods per file, one per invoice | Q3. One box only: change by Clients |
| متى تُحرَّر الفاتورة؟ | Invoice at period end after returned orders | `invoice.requireSignOff` (س15, A9). Billing in advance: change by Money |
| الزيارة المبرمجة التي لم تُنجز | Missed visit: pro-rata or fixed deduction | `invoice.missedVisitRule` BILL_DONE_ONLY / FIXED_AMOUNT, `invoice.missedVisitAmount` (س15) |
| إذا ألغى العميل زيارة في آخر لحظة، أو وجد العمال الباب مغلقًا | Late cancellation / closed door | س15. Today only per visit, through «قرار الفوترة» (`VisitBilling`). "Billed in full" automatically: change by Operations (set `Visit.clientAtFault` for LATE_CANCELLATION and CLIENT_ABSENT; Money already bills it) |
| ما الوثائق التي تطلبها منكم الإدارات العمومية … | Papers public clients ask for | س17. Any new paper: change by Money or Clients |
| هل تحتاجون الفاتورة أو وثائق أخرى بالفرنسية؟ | French documents | س21. Change by Money (invoice sheet) or the sheet's owner |

### 3. الأجور (pay)

| Question | English | Changes |
|---|---|---|
| كيف يُحسب أجر عمال النظافة عندكم؟ | Pay bases in use | `pay.defaultBasis`; basis set per worker (س11, A9) |
| كل كم تُدفع أجور العمال؟ | Pay frequency | `pay.runPeriods`. Only monthly runs exist, so weekly or per-task runs need a change by People (today the extra payments are advances) |
| نسب الاشتراك في الضمان الاجتماعي | CNAS rates | `pay.cnasEmployeeRate`, `pay.cnasEmployerRate` (Q6) |
| جدول الضريبة على الدخل الإجمالي (IRG) | IRG scale | `pay.irgTable` (Q6). Writing it needs `settings.rules` (manager only by default) |
| العطلة السنوية | Annual leave | `pay.leaveDaysPerMonth`, `pay.leaveYearStart`, `pay.leaveCapDays` (Q6) |
| العمل يوم الراحة الأسبوعية والساعات الإضافية | Rest-day work, overtime | `pay.restDayPremium`, `pay.overtimePremium`, `work.weekMin`, `work.dayMin` (Q6) |

### 4. استماراتكم: الترقيم والحالات والكلمات (numbering, statuses, words)

| Question | English | Changes |
|---|---|---|
| معنى «متوقف» في «حالة الملف» … | Does «متوقف» block? | `sanction.blockingStates.CLIENT` (Q1). "Does not block" also needs a change by Operations: the order hold (`mission-order.ts`) reads `getSanctionStates` and ignores the setting |
| عرض سعر رفضه العميل، أو عمل لمرة واحدة انتهى | Status for a refused quote or finished job | A5, P2. Today a refused quote closes the file at «عرض سعر» (`closeFile` QUOTE_REFUSED); a finished on-demand job reaches «انتهاء التعاقد» (END_KIND JOB_DONE) and closes. A new status: change by Clients plus a FILE_STAGE option code from Foundation |
| الحروف بعد رقم التسجيل (مثل BLC) | Number suffixes | `numbering.fileSuffix`, `numbering.employeeSuffix` (Q2, A6, س23) |
| الأرقام المستعملة على الورق | Last paper numbers | `numbering.startAt` for files, workers, employees (Q2). Invoices and receipts: the manager declares this year's last paper number and its date, once per kind and before the first one in the program, on the paper-numbers card of Settings › قواعد العمل (`declarePaperNumbers`, `SequenceGap` OPENING, RULINGS A.4) |
| … «تنظيف غ..الضيوف» … | «غرف الضيوف»? | A8. Change by Clients (form definitions and sheets) |
| صحّحنا «مسأجر» إلى «مستأجر» … | Keep the correction? | A8. Change by Clients |
| أسماء قرأناها من ملاحظاتكم المكتوبة باليد | «المصاريف» label, «التجمعات السكنية» | Decision 2 (section 1), H1, H2, A1. Change by Foundation (`Nav` messages) and Clients |
| كلمات اقترحناها في البرنامج … | Invented word lists to change | Q14, س23, A9. First-visit results, site condition, interest, contact duties: Clients' messages. Visit statuses: Operations' messages |
| تعديلاتكم على الكلمات التي اقترحناها | His replacement words | Same owners as above |
| كلمات في استماراتكم: هل فهمناها كما تقصدون؟ | Our reading of his terms | F5, F7, F9, P3. Change by Clients |

### 5. استماراتكم: المبالغ والعقود (amounts and contracts)

| Question | English | Changes |
|---|---|---|
| في عقودكم، هل «المبلغ إجمالي» لكل فترة سداد أم لكامل العقد؟ | Amount per period or whole contract | A7, F3. Chosen per file (`AMOUNT_BASES`). A fixed default: change by Clients |
| خانة «مصاريفها» في «مواد التنظيف» و«توفير النقل» | Meaning of the bearer amounts | Q11, F3. Adding either amount to what the client pays: change by Money (invoice lines) and Clients |
| تنظيف أولي عميق ثم عقد دوري للعميل نفسه | First deep clean + contract | Q12. Two files: change by Clients and Money |
| العمارات والتجمعات السكنية: بعقد فقط؟ | One-off work for buildings? | A1, N1. Change by Clients (form kinds) and Foundation |
| خانة «الإمضاء والختم» في عقودكم: لمن هي؟ | Whose signature box | س20, F2, A11. A second box: change by Clients (sheets) |
| قائمة القاطنين في عقد العمارة: فيمَ تُستعمل؟ | Purpose of the residents list | Q9, F12. Change by Clients if it should do anything |

### 6. تنظيم العمل (work organisation)

| Question | English | Changes |
|---|---|---|
| يوم الجمعة | Friday work | `work.days`, `work.restDay` (Q10, س10). Friday on his client forms: change by Clients |
| العطل الرسمية والأعياد | Public holidays | Q10. `calendar.closedDays` exists, but no service reads it, so no visits on holidays needs a change by Operations |
| أوقات الفترتين … وساعات عمل المكتب | Period times, office hours | `work.period.morning`, `work.period.evening`, `office.hours` (س10) |
| المناطق | Zones of several communes | Settings › قواعد العمل, zones of communes (س3, A9); supervisors in المشرفون والمناطق |
| كيف ينتقل العمال إلى المواقع؟ | Transport, travel time | `work.travelGapMin` (س9). The means of transport is information only |
| أمر المهمة وقائد الفريق | One order per team or per worker | س8, A9. One order per worker: change by Operations |
| من يكتب في البرنامج أوامر المهام الراجعة من المواقع؟ | Who types returned orders | Capability `visit.enterOrder` in Settings › المستخدمون والصلاحيات (س5, س7, A9) |
| هل يقرأ كل العمال أمر المهمة المطبوع بالعربية؟ | Workers' reading | س7. French order: change by Operations |
| التفتيش والتقييم | Inspection and rating scales | `inspection.defaultFrequency.contract`, `inspection.threshold`, `corrective.dueDays`, `evaluation.scaleMax` (س25, A9). The client's 1 to 5 rating is fixed: change by Operations |

### 7. المكتب والمستخدمون (office and users)

| Question | English | Changes |
|---|---|---|
| الموافقة على عروض الأسعار | Quote approval rule | `quote.approvalRule` (س6, A9). Only MANAGER_ALWAYS is offered. "Above an amount" is not built: change by Clients and Foundation |
| كيف تحدّدون سعر الخدمة؟ | How prices are set; packages | `costing.*` (manager types them; `cost.read`) (س13, س14). Packages: change by Clients |
| من يكتب زيارات المندوب التجاري في البرنامج؟ | Who types rep visits | Section level EMPLOYEES = WRITE for that role in Settings › المستخدمون والصلاحيات (Q13) |
| من يقبض المال نقدًا من العملاء؟ | Cash collectors | Capability `payment.record`; worker's "authorised to collect" flag (س18) |
| إيداع المال المقبوض نقدًا | Bank deposits | س18. Recording deposits: change by Money |
| من سيستعمل البرنامج؟ | Users and roles | Accounts in Settings › المستخدمون والصلاحيات (`createAccount`, `linkAccountToStaff`) (س5) |
| هل عندكم قوائم جاهزة …؟ | Existing lists | س4, A9 (no import). An import: change by People, Clients or Money, with Foundation |

### 8. الآجال (lead times, in figures)

| Question | English | Changes |
|---|---|---|
| التنبيه قبل انتهاء العقد (بالأيام) | Contract-end alert | `alerts.contractEndLeadDays` (A3) |
| التنبيه قبل موعد الدفع (بالأيام) | Payment-due alert | `alerts.paymentDueLeadDays` (A3) |
| صلاحية عرض السعر (بالأيام) | Quote validity | `quote.validityDays` (Q7) |
| مدة التجربة للعامل الجديد (بالأيام) | Trial period | `hiring.trialDays` (Q7) |
| التقييم الدوري للعامل (كل كم شهرًا) | Evaluation period | `evaluation.periodMonths` (Q7) |
| التنبيه قبل انتهاء صلاحية وثائق العامل (بالأيام) | Document expiry alert | `alerts.documentExpiryLeadDays` (Q7) |
| أجل الرد على شكوى العميل (بالساعات) | Complaint answer time | `complaint.targetMin` (hours × 60; office hours only) (A9) |
| تنبيهات أخرى | Other alert lead times | `alerts.quoteFollowUpDays`, `alerts.trialEndLeadDays`, `alerts.staffContractEndLeadDays`, `alerts.maintenanceLeadDays` |

### 9. الحاسوب والطباعة والوثائق (computer, printing, documents)

| Question | English | Changes |
|---|---|---|
| نظام تشغيل الحاسوب … | Windows version | No setting. Windows installer with offline WebView2 (decision 5, R4) |
| هل كُتبت استماراتكم في Word على الحاسوب …؟ | Are his fonts on that PC? | No setting. His faces are used when installed; otherwise the bundled stand-in prints (R5) |
| هل عندكم طابعة بورق A4؟ | A4 printer | No setting |
| النسخة الاحتياطية اليومية | Backup drive | `backup.targetDir`, `backup.autoEnabled` (R8) |
| الوثائق التي سأرسلها | Documents he will send | PDFs: the Checker compares prints. Logo: `centre.logoUrl`. Clauses: typed per file and printed as an annex (no template screen). Other pages: H3, H8 |
| ملاحظات أخرى | Other remarks | Read by the coordinator |
