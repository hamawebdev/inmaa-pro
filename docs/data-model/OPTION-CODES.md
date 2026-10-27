# Option codes (revision 2)

Every list named by an `@code` or `@codes` tag in `schema.prisma`, plus the lists that are only shown (derived states). Codes are stable and upper snake case. The Arabic label is copied exactly as the builders took it from his documents; his spellings are kept («الإزدياد», «الإجتماعية», «مسئول»), tatweel is dropped on screen and kept on paper. French and English labels are the owner's to write.

- **Owner** = who keeps the constants module and its labels. Lists used by more than one owner are kept by Foundation in `src/lib/options` (marked **shared**), with the wording supplied by the owner named.
- "no client wording" = the builder invented the list; the Arabic shown is the builder's proposal, to confirm.
- "—" = the builder gave codes without Arabic; the owner must word them before the screen ships.
- Lists whose Arabic is still to be written by their owner are listed once, in `RULINGS-NEEDED.md` (the last item of section D).
- What changed since the first draft is in `CHANGES.md`.

## 1. Shared lists

### DIVISION (shared; wording Clients)
Used by `Site.division`, `File.division`, `ClauseTemplate.division`, `RepVisit.prospectKind`, `InspectionCriterion.division`, `Invoice.division`, `Payment.division`, `HandOut.division`. The database checks the four codes on `Site`, `File`, `Invoice` and `Payment`.

| Code | Switch label (his notes) | Word in the form's title box |
|---|---|---|
| `HOUSING` | «المنازل» | «سكن» |
| `ORGANISATION` | «المؤسسات» | «مؤسسة» |
| `BUILDING` | «العمارات» | «عمارة» |
| `COMPLEX` | «التجمعات السكنية» | «تجمع سكني» |

Money wrote `homes`, `organisations`, `buildings`, `complexes`: replaced by the codes above (coordinator's decision).

- **EXPENSE_DIVISION** (Money): the four above + `COMMON` «عام» (Money's addition; his note has four lines).
- `InspectionCriterion.division` takes the four codes above: one set of criteria per division. The draft's `ALL` is gone, because its `FLOORS` and `ENTRANCES` collided with the building set.

### SERVICE_TYPE (shared; wording Clients)
`ON_DEMAND` «عند الطلب» · `CONTRACT` «عقد» (he writes «عقد عمل» in the notes). Buildings and complexes are contract only on files (scope A1: a validator rule, not a database constraint, so the assumption can be lifted without rebuilding the table); on التسليم both stay available for all four.

### PAYMENT_METHOD (shared; wording Clients) «طريقة السداد»
`CASH` «نقدًا» · `BANK_TRANSFER` «تحويل بنكي» · `POSTAL_TRANSFER` «تحويل بريدي».
One list for the file's «طريقة السداد», invoices, payments, expenses, purchases and People's wage method. Money wrote `cash`, `bank_transfer`, `postal_transfer`; People wrote the same three in upper case: no conflict left.

### WEEKDAY (shared)
| Code | Int in Operations' tables | F1 «الأيام المتاحة» | Client forms «أيام التنفيذ» |
|---|---|---|---|
| `SAT` | 0 | «السبت» | «السبت» |
| `SUN` | 1 | «الأحد» | «الأحد» |
| `MON` | 2 | «الإثنين» | «الاثنين» |
| `TUE` | 3 | «الثلاثاء» | «الثلاثاء» |
| `WED` | 4 | «الأربعاء» | «الأربعاء» |
| `THU` | 5 | «الخميس» | «الخميس» |
| `FRI` | 6 | «الجمعة» | not offered |

### YES_NO (shared; not stored as a code)
A nullable Boolean: true «نعم», false «لا», null = neither box ticked. Printed in the form's own order: «لا» then «نعم» on «السجل التجاري» (F3, F4), «نعم» then «لا» everywhere else.

### WILAYA (shared; Foundation)
A fixed list bundled as static data (`src/lib/geo`): code `01`..`69` with the Arabic and French name (ruling 6: 69, not 58; `src/lib/geo/wilayas.ts`). The list is data: no database constraint names the range, so a longer list is a change of that file only. Used by `Commune.wilayaCode`, `StaffMember.birthWilayaCode` and setting `centre.wilayaCode`.

**Communes are not a code list.** They are rows of the `Commune` table, seeded with the communes of the wilaya of أم البواقي and grown by the office when it types a new one (`BUILD-NOTES.md` section 5). A birthplace is free text (`StaffMember.birthPlace`) with an optional wilaya code.

### SEX and REG_SUFFIX (People)
`MALE` «ذكر» · `FEMALE` «أنثى» (People's wording; the form has no sex field). Suffix: `H` for MALE, `F` for FEMALE, as printed «/H/F».

### ABILITY (shared; wording People) F1 «القدرة البدنية / هل لديك قدرة على»
Used by `StaffMember.abilities` and `Site.requiredAbilityCodes`.

**SKILL** is not a fixed list: `StaffMember.skillCodes` holds `code` values of rows of People's `Skill` table, which starts empty.
`CARRY_EQUIPMENT` «حمل المعدات» · `STAND_LONG_HOURS` «الوقوف لساعات طويلة» · `CLIMB_STAIRS` «صعود السلالم» · `UPPER_FLOORS` «العمل في الطوابق العليا» · `WORK_UNDER_PRESSURE` «العمل تحت الضغط» · `MOVE_BETWEEN_SITES` «التنقل بين المؤسسات».

### WORKER_ROLE (shared; wording People) D9 section 2 «الصفة»
Used by `StaffMember.role` and `VisitWorker.role`.
`CLEANER` «عامل نظافة» / «عاملة نظافة» (by sex) · `SENIOR_WORKER` «عامل رئيسي» · `TEAM_LEADER` «قائد فريق».
**Conflict settled:** Operations wrote `WORKER`, `SENIOR`, `LEADER` for the same list. People's codes are kept (People owns the worker's role).

### TRANSPORT_MEANS (shared; wording Operations) D6 section 16
Used by `FirstVisit.transportMeans` and `Visit.transportMode`.
`CENTRE_VEHICLE` «سيارة المؤسسة» (Operations would print «سيارة المركز») · `PUBLIC` «نقل عمومي» · `WORKER_OWN` «وسيلة العامل» · `OTHER` «أخرى».
**Conflict settled:** Clients wrote `WORKER_OWN`, Operations `OWN`. `WORKER_OWN` is kept.

### CLEANLINESS (shared; wording Clients) all client forms «تقييم النظافة»
Used by `File.cleanliness` and the `state` of each row inside `FirstVisit.spaces`.
`EXCELLENT` «ممتاز» · `GOOD` «جيد» · `AVERAGE` «متوسط» · `POOR` «ضعيف» · `NEEDS_DEEP` «يحتاج إلى تنظيف عميق». A dotted free-text place stands before the options (`cleanlinessNote`).

### ABSENCE_TYPE (shared; wording Operations, from the academy)
Used by `EmployeeAbsence.type` and `WorkerAbsence.type`.
`FULL_DAY` «يوم كامل» · `HALF_DAY` «نصف يوم» · `HOURS` «ساعات».

### LEAVE_TYPE (shared; wording People, no client wording)
Used by `EmployeeLeave.type` and `WorkerAbsence.leaveType`.
`ANNUAL` «عطلة سنوية» · `SICK` «عطلة مرضية» · `UNPAID` «عطلة بدون أجر» · `MATERNITY` «عطلة أمومة» · `FAMILY_EVENT` «عطلة استثنائية» · `COMP_REST` «راحة تعويضية» · `OTHER` «أخرى».
On a `WorkerAbsence` it is filled only when `category = LEAVE`; `SICK` is then not used (the category already says it).

### PPE (shared; wording Operations) D9 section 12
Used by `Site.ppeCodes`; the hand-out slip prints the same list.
`GLOVES` «قفازات» · `SHOES` «أحذية مناسبة» · `WORKWEAR` «لباس العمل» · `BADGE` «سترة/شارة تعريف» · `MASK` «كمامة عند الحاجة» · `EXTRA` «معدات حماية إضافية حسب طبيعة المهمة».
**Conflict settled:** Money listed the same six as stock items `ppe_gloves`, `ppe_shoes`, `ppe_workwear`, `ppe_vest`, `ppe_mask`, `ppe_extra`. The option list keeps Operations' codes; the seeded stock items take `PPE_` + the same code (`PPE_BADGE`, not `PPE_VEST`).

### CORRECTIVE_ACTION and EVALUATION_RECOMMENDATION (wording Operations) D1
| Code | Label | `Inspection.recommendedAction` | `CorrectiveTask.action` | `PeriodicEvaluation.recommendation` |
|---|---|---|---|---|
| `REDO_SERVICE` | «إعادة الخدمة» | yes | yes | |
| `FIX_ITEMS` | — | | yes | |
| `TRAIN_WORKER` | «تدريب العاملة» | yes | yes | yes |
| `CHANGE_WORKER` | «تغيير العاملة» | yes | yes | yes |
| `OTHER` | «أخرى» | | yes | |
| `NONE` | — | | | yes |

**Conflict settled:** People wrote `TRAINING` and `CHANGE` for the two D1 actions; Operations' `TRAIN_WORKER` and `CHANGE_WORKER` are kept.

### AMOUNT_BASIS (shared; wording Clients, office-only, A7)
Used by `File.amountBasis`, `Quote.amountBasis`.
`PER_PAYMENT_PERIOD` «لكل فترة سداد» · `WHOLE_CONTRACT` «لكامل العقد».
**Conflict settled:** Money wrote `per_period` and `whole_contract` with «لكامل مدة العقد». Clients' codes and words are kept (the field is on the file).

### Foundation's own lists

| List | Codes |
|---|---|
| ROLE (`Role.id`) | `MANAGER` «المدير» · `HR_OFFICER` «مسئول الموارد البشرية» · `ADMINISTRATION` «الإدارة» · `SUPERVISOR` «المشرف» (the four words of F1) · `RECEPTION_SALES` «الاستقبال والمبيعات» · `OPERATIONS` «العمليات» · `ACCOUNTANT` «المحاسب» (plan feature 23) |
| SECTION | `HOME` «الرئيسية» · `EMPLOYEES` «الموظفون» · `WORKERS` «عمال النظافة» · `REQUESTS` «طلبات الخدمة» · `MONEY` «المصاريف» · `STOCK` «المخزون» · `SETTINGS` «الإعدادات» |
| GRANT_KIND (`RoleGrant.kind`) | `SECTION` · `CAPABILITY` |
| GRANT_ACCESS (`RoleGrant.access`) | `READ` · `WRITE` for a section (no row = no access) · `GRANTED` for a capability |
| LOG_OPERATION | `COLLECT` «جمع» · `CONSULT` «اطلاع» · `CHANGE` «تعديل» · `DISCLOSE` «إفشاء / تبليغ» · `ERASE` «محو» · `SECURITY` (Arabic words are mine; Law 18-07 art. 41 bis 3 names the five operations) |
| LOG_ACTION | `CREATE` · `UPDATE` · `SOFT_DELETE` · `STATUS_CHANGE` · `VIEW` · `VIEW_RESTRICTED` · `PRINT` · `EXPORT` · `BACKUP` · `RESTORE` · `ISSUE` · `VOID` · `CANCEL` · `APPROVE` · `REFUSE` · `OVERRIDE` · `NUMBER_CLAIM` · `SANCTION_CHECK` · `SANCTION_SET` · `SANCTION_LIFT` · `UPLOAD_REMOVE` · `SETTINGS_CHANGE` · `SIGN_IN` · `SIGN_IN_FAILED` · `LOCK` · `PASSWORD_CHANGE` · `CHAIN_VERIFY` · `ANCHOR_REBASE` · `CLOCK_WARNING` |
| OWNER | `FOUNDATION` · `PEOPLE` · `CLIENTS` · `OPERATIONS` · `MONEY` |
| DATA_SUBJECT | `WORKER` · `EMPLOYEE` · `CLIENT` · `RESIDENT` · `CONTACT` · `USER` |
| DISCLOSURE_KIND | `PRINT` · `EXPORT` · `BACKUP` |
| BACKUP_KIND | `AUTO` · `MANUAL` · `PRE_RESTORE` · `RESTORE` |
| GAP_KIND (`SequenceGap.kind`) | `RESTORE` (numbers lost when an older backup was restored) · `OPENING` (numbers issued on paper that year before the program) |
| PHOTO_KIND (`Upload.kind`, sets of photos; wording Operations) | `BEFORE` · `AFTER` · `ISSUE` |
| SEQUENCE_KEY | `STAFF_WORKER` · `STAFF_EMPLOYEE` · `CLIENT_DOSSIER` · `FILE_HOUSING_REQUEST` · `FILE_HOUSING_CONTRACT` · `FILE_ORG_REQUEST` · `FILE_ORG_CONTRACT` · `FILE_BUILDING_CONTRACT` · `FILE_COMPLEX_CONTRACT` · `QUOTE` · `VISIT` · `INVOICE` · `RECEIPT` · `COMPLAINT` · `INSPECTION` · `VIOLATION` · `PAY_RUN` · `PAYSLIP` · `PAYOUT` · `HANDOUT` · `COUNT` · `PURCHASE_REQUEST` · `PURCHASE` · `EQUIPMENT_UNIT` |

## 2. People

### From his worker form (F1)

| List | Codes and labels |
|---|---|
| HEALTH_CONDITION «هل تعاني من» | `ASTHMA` «الربو» · `BACK` «مشاكل الظهر» · `HEART` «مشاكل القلب» · `CHRONIC` «أمراض مزمنة» · `NONE` «لا يوجد» (excludes the others) · `OTHER` «أخرى» (with `otherText`) |
| STAFF_DOCUMENT_TYPE «الوثائق المسلمة» | `ID_CARD_COPY` «نسخة من بطاقة التعريف» · `BIRTH_CERT` «شهادة الميلاد» · `RESIDENCE_CERT` «شهادة الإقامة» · `MEDICAL_CERT` «شهادة طبية» (restricted) · `CROSSED_CCP_CHEQUE` «صك بريدي مشطوب» · `EXPERIENCE_CERT` «شهادة الخبرة» · `CRIMINAL_RECORD` «صحيفة السوابق العدلية (إذا كانت مطلوبة)» (restricted). Not on his list, never printed among the ticks: `REGULATIONS_ACK` «إقرار العامل(ة)» (each signed copy of the internal regulations, with the version signed) |
| HIRING_DECISION «قرار الإدارة» | `ACCEPTED` «قبول» · `ACCEPTED_ON_TRIAL` «قبول تحت التجربة» · `REFUSED_FINAL` «رفض المعني النهائي» |
| REGULATION_ARTICLE (titles of articles 1 to 15) | `ART_1` «الالتزام بالعمل» · `ART_2` «الانضباط» · `ART_3` «المظهر المهني» · `ART_4` «جودة التنظيف» · `ART_5` «المعدات والمواد» · `ART_6` «السلامة» · `ART_7` «ممتلكات العملاء» · `ART_8` «السرية والخصوصية» · `ART_9` «التعامل مع العملاء» · `ART_10` «الهاتف» · `ART_11` «الشكاوى» · `ART_12` «الأموال» · `ART_13` «الحوادث» · `ART_14` «الممنوعات» · `ART_15` «التسلسل الإداري» |
| ARTICLE_14_ITEM | `THEFT` «السرقة أو الاستيلاء على ممتلكات الغير» · `WILFUL_DAMAGE` «إتلاف الممتلكات عمدًا» · `FALSIFIED_RECORDS` «تزوير الحضور أو سجلات العمل» · `DISCLOSED_SECRETS` «إفشاء أسرار العملاء» · `LEFT_WITHOUT_LEAVE` «ترك العمل دون إذن» · `PERSONAL_WORK` «القيام بأعمال شخصية على حساب وقت العمل» |

**The ten criteria of «تقييم مسئول الموارد البشرية (سري)»** are columns of `StaffConfidential` (group SCORE), in his order: 1 `scoreAppearance` «المظهر العام» · 2 `scorePersonalHygiene` «النظافة الشخصية» · 3 `scoreCommunication` «أسلوب التواصل» · 4 `scoreDiscipline` «الانضباط» · 5 `scoreExperience` «الخبرة» · 6 `scoreQuickUnderstanding` «سرعة الفهم» · 7 `scorePhysicalFitness` «اللياقة البدنية» · 8 `scoreWorkPressure` «تحمل ضغط العمل» · 9 `scorePunctuality` «الالتزام بالمواعيد» · 10 `scoreTrustHonesty` «الثقة والأمانة».

**The seven criteria of article 16** are columns of `PeriodicEvaluation`: `scoreDiscipline` «الانضباط» · `scoreAttendance` «الحضور» · `scoreCleaningQuality` «جودة التنظيف» · `scoreClientRespect` «احترام العميل» · `scoreEquipmentCare` «المحافظة على المعدات» · `scoreSafety` «السلامة» · `scoreProgramme` «الالتزام بالبرنامج».

### From his other documents

| List | Codes and labels | Source |
|---|---|---|
| SANCTION_STATE | `SUSPENDED` «موقف» for workers and employees, «متوقف» for clients · `PENALISED` «معاقب» | his note; client forms |
| SANCTION_SUBJECT | `WORKER` «عامل(ة) نظافة» · `EMPLOYEE` «موظف(ة) بالمركز» · `CLIENT` «عميل» | People's prompt |
| PAY_PERIOD | `WEEKLY` «أسبوعيًا» · `MONTHLY` «شهريًا» | D1 |
| PAY_BASIS | `MONTHLY` «راتب شهري» · `DAILY` «أجر يومي» · `HOURLY` «بالساعة» · `PER_TASK` «بالمهمة» | plan س11 |
| JOB_POSITION | `MANAGER` «المدير» · `ADMINISTRATION` «الإدارة» · `SUPERVISOR` «المشرف» · `HR_OFFICER` «مسئول الموارد البشرية» (F1) · `OPERATIONS` «مسؤول العمليات» · `RECEPTION_SALES` «مسؤول تجاري / استقبال» (D1) · `SALES_REP` «المندوب التجاري» · `ACCOUNTANT` «المحاسب» · `STOREKEEPER` «أمين المخزن» (Money's hand-out screen; wording to confirm) · `OTHER` «أخرى». Where a position and a login role mean the same job they carry the same code as list ROLE | F1, D1, scope |
| VIOLATION_SEVERITY | `SERIOUS` «جسيمة» (F1 article 17) · `MINOR` «بسيطة» (People's word) | |
| TRAINING_MODULE (seed rows of the table) | `DAY_1` «التعريف بالمؤسسة» · `DAY_2` «معدات التنظيف» · `DAY_3` «طرق تنظيف الأرضيات» · `DAY_4` «الحمامات والمطابخ» · `DAY_5` «النوافذ» · `DAY_6` «السلامة» · `DAY_7` «تطبيق عملي» · `CONDUCT` «سلوك العاملة داخل منزل العميل» | D1 |

**PAY_PERIOD conflict settled (inside People's file):** the worker's pay period is `WEEKLY` / `MONTHLY`, the pay run's period type was `WEEK` / `MONTH`. One list, `WEEKLY` / `MONTHLY`.

### People's own wording (no client wording, to confirm)

| List | Codes and labels |
|---|---|
| STAFF_KIND | `WORKER` · `EMPLOYEE` |
| ENGAGEMENT_STATUS | `CANDIDATE` «مترشح» · `ON_TRIAL` «تحت التجربة» · `ACCEPTED` «مقبول» · `REFUSED` «مرفوض» · `LEFT` «غادر» |
| MARITAL_STATUS | `SINGLE` «أعزب / عزباء» · `MARRIED` «متزوج(ة)» · `DIVORCED` «مطلق(ة)» · `WIDOWED` «أرمل(ة)» |
| EMPLOYMENT_CONTRACT | `NONE` «بدون عقد» · `CDD` «عقد محدد المدة» · `CDI` «عقد غير محدد المدة» |
| WORK_TIME | `FULL_TIME` «دوام كامل» · `PART_TIME` «دوام جزئي» |
| INTERVIEW_STATUS | `SCHEDULED` · `DONE` · `NO_SHOW` · `CANCELLED` — |
| TRAINING_ATTENDANCE | `ATTENDED` · `ABSENT` · `EXCUSED` — |
| VIOLATION_SOURCE | `OFFICE` · `COMPLAINT` · `INSPECTION` · `VISIT` · `PROBLEM_REPORT` — |
| VIOLATION_ACTION (empty = not decided yet) | `NONE` «دون إجراء» · `VERBAL_WARNING` «تنبيه شفوي» · `WRITTEN_WARNING` «إنذار كتابي» · `DEDUCTION` «اقتطاع» · `SUSPENSION` «توقيف» (creates a SUSPENDED sanction) · `PENALTY` «معاقبة» (creates a PENALISED sanction) · `END_REGISTRATION` «إنهاء التسجيل» |
| VIOLATION_STATUS | `OPEN` (to decide; where a row handed over by Operations arrives) · `DECIDED` · `CANCELLED` — |
| STAFF_EVENT_KIND | `STATUS` · `PAY_TERMS` |
| SANCTION_CONTEXT | `WORKER_REGISTRATION` · `EMPLOYEE_REGISTRATION` · `CLIENT_FILE` · `READMISSION` · `IDENTITY_CHANGE` (the name, number or phone of an existing record is edited into a match) — |
| MATCH_BASIS | `SAME_RECORD` «الملف نفسه» · `NATIONAL_ID` «رقم بطاقة التعريف» · `PHONE` «رقم الهاتف» · `NAME_AND_BIRTHDATE` «الاسم وتاريخ الإزدياد» · `NAME_CONFIRMED` (a weak name match the clerk confirmed) · `TAX_NUMBER` (added here: People matches a body on the tax numbers Clients passes, and had no code for it) |
| DECISION_STATUS | `PENDING` «في انتظار قرار المدير» · `ALLOWED` «سمح المدير» · `REFUSED` «لم يسمح المدير» · `CANCELLED` |
| CONSUMED_ENTITY | `STAFF_MEMBER` · `FILE` |
| LEAVE_STATUS | `REQUESTED` · `APPROVED` · `REFUSED` · `CANCELLED` — |
| CHECK_TYPE | `CHECK_IN` · `CHECK_OUT` (academy) |
| HOURS_ADJUSTMENT_KIND | `TRAINING` · `OFFICE_WORK` · `CORRECTION` · `OTHER` — |
| PAY_ITEM_TYPE | `ALLOWANCE` · `DEDUCTION` (People wrote "type code" without values: these two are a placeholder, to confirm) |
| PAY_RUN_STATUS | `DRAFT` · `CLOSED` · `VOID` — |
| PAYSLIP_ITEM_TYPE | `BASE` · `OVERTIME_50` · `REST_DAY_PREMIUM` · `LEAVE_PAY` · `ALLOWANCE` · `BONUS` · `ABSENCE` · `CNAS` · `IRG` · `ADVANCE_REPAYMENT` · `DEDUCTION` · `OTHER` — |
| PAYSLIP_ITEM_SOURCE | `PAY_ITEM` · `DEBT_ENTRY` · `HOURS` · `MANUAL` (People wrote `sourceKind` without values: placeholder, to confirm) |
| PAYOUT_KIND | `ADVANCE` · `WAGE` · `OTHER` — |
| DEBT_DIRECTION | `INCREASE` · `DECREASE` (academy) |
| DEBT_REASON | `ADVANCE` · `DAMAGE` · `LOSS` · `OVERPAYMENT` · `REPAID_ON_PAYSLIP` · `REPAID_IN_CASH` · `WRITTEN_OFF` · `REVERSAL` (undoes the line in `reversesEntryId`: a voided payout or run) · `OTHER` — |

## 3. Clients and contracts

### Lists on his five forms (F2 building contract, F3 organisation request, F4 organisation contract, F5 housing request, F6 housing contract)

| List | Codes and labels | Forms |
|---|---|---|
| FORM_KIND (stored, set by the service) | `HOUSING_REQUEST` (F5) · `HOUSING_CONTRACT` (F6) · `ORG_REQUEST` (F3) · `ORG_CONTRACT` (F4) · `BUILDING_CONTRACT` (F2) · `COMPLEX_CONTRACT` (copy of F2 titled «نوع الخدمة : عقد (تجمع سكني)») | |
| DESCRIPTION_FAMILY (stored, set by the service: which columns of `FileDescription` the form prints) | `HOUSING` (F5, F6) · `ORGANISATION` (F3, F4) · `BUILDING` (F2 and its complexes copy) | |
| FILE_STATUS_TICK «حالة الملف» (printed, never stored as such) | `OLD` «قديم» · `NEW` «جديد» · `VISIT` «الزيارة» · `QUOTE` «عرض سعر» · `CONTRACTED` «متعاقد» · `CONTRACT_ENDED` «انتهاء التعاقد» · `SUSPENDED` «متوقف» · `PENALISED` «معاقب» | all, same order |
| FILE_STAGE (stored) | `NEW` · `VISIT` · `QUOTE` · `CONTRACTED` · `CONTRACT_ENDED` (labels as the ticks) | A5 |
| PROPERTY_TYPE_HOUSING «نوع العقار» | `HOUSE` «منزل» · `APARTMENT` «شقة» · `DUPLEX` «دوبلكس» · `VILLA` «فيلا» · `OTHER` «أخرى» + text | F5, F6 |
| PROPERTY_TYPE_ORGANISATION «نوع العقار» | `SMALL_SHOP` «محل صغير» · `LARGE` «كبير» · `COMPANY` «شركة» · `FLAT_F2` «F2» · `FLAT_F3` «F3» · `FLAT_F4` «F4» · `FLAT_F5` «F5» · `OTHER` «أخرى» (no text line on paper) | F3, F4 |
| OWNERSHIP «ملكية العقار» | `OWNED` «ملك» · `RENTED` «مسأجر» on paper, shown and printed «مستأجر» (A8) | F5, F6 |
| SECTOR «قطاع العمل» | `PUBLIC` «عام» · `PRIVATE` «خاص» | F3, F4 |
| CONTRACTING_PARTY «جهة التعاقد» | `BUILDING_OWNER` «مالك العمارة» · `RESIDENTS_REP` «ممثل السكان» · `RESIDENCE_MANAGER` «مسير الإقامة» · `SYNDIC` «سانديك» · `RESIDENTS_ASSOCIATION` «جمعية السكان» · `PROPERTY_MANAGEMENT` «شركة تسيير عقاري» · `OTHER` «أخرى» + text | F2 |
| WASTE_DISPOSAL «مكان التخلص من النفايات» (several) | `COLLECTION_POINT` «نقطة التجميع» · `CONTAINERS` «إلى الحاويات» · `BUILDING_INSTRUCTIONS` «تعليمات العمارة» · `OTHER` (a blank line) + text | all |
| RESIDENT_TURNOVER «معدل حركة السكان» | `LOW` «منخفض» · `MEDIUM` «متوسط» · `HIGH` «مرتفع» | F2 |
| CONTRACT_KIND «نوع العقد» | `SHORT` «قصير» · `LONG` «طويل», with a dotted free-text place | F2, F4, F6 |
| CONTRACT_DURATION «مدة العقد» | `M1` «شهر» · `M3` «3 أشهر» · `M6` «6 أشهر» · `Y1` «سنة», with a dotted free-text place | F2, F4, F6 |
| «عدد الزيارات» (stored as the Int `visitsPerWeek`, 1..6) | 1 «واحدة بالأسبوع» · 2 «اثنين بالأسبوع» · 3 «ثلاثة بالأسبوع» · 4 «أربعة بالأسبوع» · 5 «خمسة بالأسبوع» · 6 «ستة بالأسبوع» (six labels, five boxes on paper: six boxes are printed) | F2, F4, F6 |
| REQUEST_KIND «نوع الطلب» (several) | `COMPREHENSIVE` «شامل» · `DEEP` «عميق», with a dotted free-text place | F3, F5 |
| DAY_PERIOD «تحديد الفترة» | `MORNING` «الصباحية» · `EVENING` «المسائية» · `BOTH` «معا» | all |
| BEARER («مواد التنظيف», «توفير النقل») | `CENTRE` «على عاتق المركز» · `OWNER` «على عاتق صاحبها» | all, twice |
| PAYMENT_FREQUENCY «دورية السداد» | `PER_VISIT` «بعد كل زيارة» · `WEEKLY` «أسبوعيا» · `BIWEEKLY` «كل أسبوعين» · `MONTHLY` «كل شهر» | F2, F4, F6 |
| TEAM_ACCESS «دخول الفريق» (several) | `VIA_GUARD` «عن طريق الحارس» · `OWN_KEY` «مفتاح خاص» · `BUILDING_MANAGER` «مسؤول العمارة» · `OPEN_DOOR` «باب مفتوح خلال ساعات العمل» | all |
| SERVICE_LIST | `PROVIDED` («الخدمات المقدمة») · `PROGRAMMED` («الخدمات المبرمجة» on F2, F3, F4; «نوع الخدمة المبرمجة» on F5, F6) | |

Money's `payment_periodicity` and `borne_by` are these PAYMENT_FREQUENCY and BEARER lists, upper-cased.

Labels that differ between sibling forms and are properties of the form definition, not of a list: «تاريخ الزيارة» (F2, F5, F6) / «الزيارة الأولية» (F3, F4); «تاريخ تسديد» (F2, F4, F6) / «تاريخ التسديد» (F3, F5); «يوجد حارس» (F2, F4, F6) / «يوجد حارس ؟» (F3, F5); «(01):» before the phone on F2 and F6 only; the site number «رقم العمارة» (F2) / «رقم المؤسسة» (F3, F4) / «رقم الباب» (F5, F6).

### PROVIDED_SERVICE «الخدمات المقدمة»: one catalogue, each form a subset in its own order

**The manager's since 2026-10-22.** This list and PROGRAMMED_SERVICE are rows (`CatalogueService`, `CatalogueServiceDivision`) edited in Settings › الخدمات: services added (coded `ADDED_1`, `ADDED_2`… in each list, never reused), renamed in three languages, removed (no longer offered; the files that tick one keep it), given divisions, moved within a division. The two tables below are what migration 0003 seeded, from his six forms (`src/lib/options/service-catalogue-seed.ts`; `scripts/db/check-docs.mjs` holds them against it). On paper each division's services fill the columns of its form in its order, each column ending with his blank lines (`resolveDefinition`); with these seeded lists that is exactly the layout below.

Print order is column by column, first column on the right.

| Code | Label | Housing F5, F6 (13 + 3 blank boxes) | Organisation F3, F4 (20 + 4 blank lines) | Building F2 (20, no blank) |
|---|---|---|---|---|
| `FLOORS` | «تنظيف الأرضيات» | col 1, 1 | col 1, 1 | col 1, 1 |
| `KITCHEN` | «تنظيف المطبخ» | col 1, 2 | col 1, 2 | |
| `CURTAINS` | «تنظيف الستائر» | col 1, 3 | col 1, 3 | |
| `WINDOWS` | «تنظيف النوافذ» | col 1, 4 | col 2, 3 | col 2, 3 |
| `CEILINGS` | «تنظيف الأسقف» | col 2, 1 | col 2, 1 | col 2, 1 |
| `FRIDGE` | «تنظيف الثلاجة» | col 2, 2 | | |
| `BATHROOMS` | «تنظيف الحمامات» | col 2, 3 | | |
| `GLASS` | «تنظيف الزجاج» | col 3, 1 | col 3, 1 | col 3, 1 |
| `OVEN` | «تنظيف الفرن» | col 3, 2 | | |
| `CARPETS` | «تنظيف السجاد» | col 3, 3 | col 3, 3 | |
| `CUPBOARDS` | «تنظيف الخزائن» | col 4, 1 | | |
| `CHILDREN_ROOMS` | «تنظيف غرف الأطفال» | col 4, 2 | | |
| `GARAGE` | «تنظيف المرآب» | col 4, 3 | col 4, 3 | col 4, 3 |
| `FURNITURE` | «تنظيف الأثاث» | | col 1, 4 | |
| `SIGNS_ADS` | «اللوحات والإعلانات» | | col 1, 5 | |
| `TOILETS` | «تنظيف دورات المياه» | | col 2, 2 | |
| `WASTE_SORTING` | «جمع وفرز النفايات» | | col 2, 4 | col 2, 4 |
| `SHELVES` | «تنظيف الرفوف» | | col 2, 5 | |
| `OFFICES` | «تنظيف المكاتب» | | col 3, 2 | |
| `CAR_PARKS` | «تنظيف مواقف السيارات» | | col 3, 4 | col 3, 4 |
| `APPLIANCES` | «تنظيف الأجهزة» | | col 3, 5 (then a blank on the same line) | col 3, 5 |
| `RECEPTION_HALL` | «تنظيف قاعة الاستقبال» | | col 4, 1 | |
| `MEETING_ROOMS` | «تنظيف قاعات الاجتماعات» | | col 4, 2 | |
| `STORES` | «تنظيف المخازن» | | col 4, 4 | col 4, 4 |
| `GARDENS` | «تنظيف الحدائق» | | col 4, 5 (then a blank on the same line) | col 4, 5 |
| `COURTYARDS` | «الساحات» | | | col 1, 2 |
| `SWEEP_DUST` | «كنس وإزالة الغبار» | | | col 1, 3 |
| `STAINS` | «تنظيف البقع» | | | col 1, 4 |
| `DOORS` | «تنظيف الأبواب» | | | col 1, 5 |
| `CORRIDORS` | «تنظيف الممرات» | | | col 2, 2 |
| `WALLS` | «تنظيف الجدران» | | | col 2, 5 |
| `CORNERS` | «تنظيف الزوايا» | | | col 3, 2 |
| `MAILBOXES` | «تنظيف صناديق البريد» | | | col 3, 3 |
| `ENTRANCES` | «المداخل» | | | col 4, 1 |
| `PAVEMENTS` | «الأرصفة» | | | col 4, 2 |

Blank lines: housing has one blank box at the foot of columns 2, 3 and 4; organisation has one blank line at the foot of columns 1 and 2 and one beside the last option of columns 3 and 4. A filled blank is a `FileService` row with `customLabel`, no code and its `blankSlot` (1, 2, ... in print order; the limits per form are in the schema). The dots that follow «تنظيف الأجهزة» and «تنظيف الحدائق» on the organisation forms may be a detail of that option: such a row carries the code and a `customLabel`.

### PROGRAMMED_SERVICE

| Code | Label | F2, F3, F4 «الخدمات المبرمجة» (11 + 5 blank lines) | F5, F6 «نوع الخدمة المبرمجة» (12, no blank) |
|---|---|---|---|
| `PERIODIC` | «تنظيف دوري» | col 1, 1 | col 1, 1 |
| `AFTER_CONSTRUCTION` | «تنظيف بعد البناء» | col 1, 2 | col 1, 2 |
| `AFTER_RENOVATION` | «تنظيف بعد الترميم» | col 1, 3 | col 1, 3 |
| `AFTER_BANQUETS` | «تنظيف بعد الولائم» | col 2, 1 | col 2, 1 |
| `COMPREHENSIVE_DEEP` | «تنظيف شامل وعميق» | col 2, 2 | |
| `COMPREHENSIVE` | «تنظيف شامل» | | col 2, 2 |
| `GUESTS` | «تنظيف غ..الضيوف» (kept as written until he confirms «غرف», A8) | col 2, 3 | col 2, 3 |
| `AFTER_TRAVEL` | «تنظيف بعد السفر» | col 3, 1 | col 3, 1 |
| `RAMADAN` | «تنظيف رمضان» | col 3, 2 | col 3, 2 |
| `DEBRIS_REMOVAL` | «إزالة المخلفات» | col 3, 3 | col 3, 3 |
| `BEFORE_EVENTS` | «تنظيف قبل المناسبات» | col 4, 1 | col 4, 1 |
| `AFTER_EVENTS` | «تنظيف بعد المناسبات» | col 4, 2 | col 4, 2 |
| `DEEP` | «تنظيف عميق» | | col 4, 3 |

Blank lines on F2, F3, F4: one at the foot of columns 1, 2 and 3, two at the foot of column 4.

### Clients' office-only lists (Clients' wording, none printed on his sheets)

| List | Codes and labels |
|---|---|
| CLIENT_TYPE | `INDIVIDUAL` · `ORGANISATION` · `BUILDING_PARTY` — |
| REQUEST_SOURCE | `PHONE` «هاتف» · `WHATSAPP` «واتساب» · `FACEBOOK` «فيسبوك» · `VISIT` «زيارة» · `REFERRAL` «توصية» · `REP` «المندوب التجاري» · `AD` «إعلان» · `SERVICE_LEAD` (asked on a returned visit sheet; `File.sourceVisitId`) — · `OTHER` |
| PRIORITY | `NORMAL` «عادية» · `IMPORTANT` «مهمة» · `URGENT` «مستعجلة» (D5 item 17) |
| CLOSE_REASON | `QUOTE_REFUSED` · `JOB_DONE` · `NO_ANSWER` · `CLIENT_CANCELLED` · `NOT_SERVICEABLE` · `NOT_RENEWED` (an expired contract the office closes) · `OTHER` — |
| QUOTE_STATUS | `DRAFT` · `AWAITING_APPROVAL` · `APPROVED` · `NEEDS_REVIEW` · `ISSUED` · `SUPERSEDED` (a newer version was issued) · `CANCELLED` — |
| QUOTE_RESULT | `PENDING` «في الانتظار» · `ACCEPTED` «قبول» · `REFUSED` «رفض» · `DISCOUNT_REQUESTED` «طلب تخفيض» · `CHANGE_REQUESTED` «طلب تعديل» · `POSTPONED` «مؤجل» · `NO_ANSWER` «لا رد» |
| QUOTE_LINE_KIND | `INITIAL_JOB` (a first deep clean before a periodic contract: Money builds one due of kind INITIAL_JOB, Operations one visit of origin INITIAL) · `PERIODIC` · `EXTRA` — |
| END_KIND | `EXPIRED` · `ENDED_BY_CLIENT` · `ENDED_BY_CENTRE` · `NON_PAYMENT` · `RENEWED` · `JOB_DONE` (an on-demand job whose last visit is done) · `CANCELLED` (a signed contract the client cancels before its start; Clients' fix CLI-3) — |
| RENEWAL_DECISION | `PENDING` · `WILL_RENEW` · `WILL_NOT_RENEW` — |
| DURATION_UNIT («مدة التنفيذ») | `HOURS` «ساعة» · `DAYS` «يوم» |
| FIRST_VISIT_RESULT (several; D6, D8) | `SUITABLE` · `NEEDS_STUDY` · `NEEDS_INITIAL_DEEP` · `NEEDS_EQUIPMENT` · `NEEDS_EXTRA_TEAM` · `NEEDS_SPECIAL_SERVICES` «يحتاج إلى خدمات خاصة» (D6) — |
| CONDITION_FACTOR (several; D3..D7) | Clients described seven without codes: cement or paint traces, grease, strong smells, pets, piled waste, recent works, sensitive equipment. Codes proposed here: `CEMENT_PAINT_TRACES` · `GREASE` · `STRONG_SMELLS` · `PETS` · `PILED_WASTE` · `RECENT_WORKS` · `SENSITIVE_EQUIPMENT` — |
| FIRST_VISIT_RECOMMENDATION (several) | Homes, D4 section 16: `NORMAL` «يمكن تنفيذ الخدمة بشكل عادي» · `EXTRA_WORKER` «تحتاج عاملة إضافية» · `SPECIAL_EQUIPMENT` «تحتاج معدات خاصة» · `EXTRA_TIME` «تحتاج وقتًا إضافيًا» · `SECOND_VISIT` «تحتاج زيارة ثانية» · `NOT_ADVISED` «لا يُنصح بتنفيذها بالشروط الحالية». Organisations, D6 item 24: `STANDARD_QUOTE` «تقديم عرض سعر عادي» · `MONTHLY_CONTRACT` «تقديم عقد شهري» · `ANNUAL_CONTRACT` «تقديم عقد سنوي» · `INITIAL_THEN_PERIODIC` «تنفيذ خدمة أولية ثم عقد دوري» · `ADD_SPECIAL_SERVICES` «إضافة خدمات خاصة» · `REINSPECT` «إعادة المعاينة» · `REFUSE` «رفض الخدمة لأسباب تشغيلية». Buildings and complexes, D8 item 26, add: `PERIODIC_CONTRACT` «عقد تنظيف دوري» · `INITIAL_DEEP_FIRST` «تنظيف أولي عميق قبل بداية العقد» · `MORE_WORKERS` «زيادة عدد العمال» · `FEWER_VISITS` «تقليل عدد الزيارات» · `ADD_PERIODIC_SERVICES` «إضافة خدمات دورية». Each division's screen offers its own subset |
| COST_LINE (the `code` of each row inside `CostStudy.lines`) | `LABOUR` · `SUPERVISION` · `MATERIALS` · `EQUIPMENT` · `TRANSPORT` · `SPECIAL_SERVICES` · `OTHER` · `RESERVE` · `ADMIN_SHARE` · `TAX_INSURANCE` (the last three carry a typed percentage, `rateBp`) — |
| INTEREST (rep visit) | `HIGH` · `MEDIUM` · `LOW` · `NONE` — |

## 4. Operations

### On the order, the returned sheet and the board

| List | Codes and labels | Source |
|---|---|---|
| VISIT_STATUS (the seven of A9) | `CONFIRMED` «مؤكدة» · `AWAITING_CONFIRMATION` «بانتظار التأكيد» · `IN_PROGRESS` «جارية» · `DONE` «منفذة» · `POSTPONED` «مؤجلة» · `PROBLEM` «مشكلة» · `CANCELLED` «ملغاة» | plan features 10 and س23; his five colours in D1: أخضر «خدمة مؤكدة», أصفر «في انتظار التأكيد», أزرق «تم التنفيذ», أحمر «مشكلة», أسود «ملغاة» |
| VISIT_ORIGIN | `CONTRACT` · `ON_DEMAND` · `INITIAL` (the first deep clean of an accepted quote's INITIAL_JOB line) · `EXTRA` · `REDO` · `MAKEUP` — | Operations |
| VISIT_STATUS_REASON | `CLIENT_REQUEST` · `CLIENT_ABSENT` · `LATE_CANCELLATION` · `NO_WORKER` · `ACCESS_BLOCKED` · `MATERIALS_MISSING` · `CONTRACT_ENDED` · `CLIENT_SUSPENDED` · `CENTRE_DECISION` · `PROGRAMME_CHANGED` (the slot was dropped or moved: the visit is left out of every count and its slot is free again) · `OTHER` — | Operations, no client wording |
| ARRIVAL_VIA | `PHONE_WORKER` · `PHONE_SUPERVISOR` · `PHONE_CLIENT` · `ORDER` — | Operations |
| SEAT_STATUS | `ASSIGNED` · `ABSENT` (always with its `absenceId`) · `RESTING` (her rotated rest day on a six-visit contract) · `REPLACED` · `REMOVED` — | Operations |
| REPLACEMENT_REASON | `ABSENCE` · `CLIENT_REQUEST` · `SANCTION` · `WORKER_LEFT` · `REST_ROTATION` · `SCHEDULE_CHANGE` — | Operations |
| ATTENDANCE_SOURCE | `ORDER` · `PHONE` · `SUPERVISOR_SHEET` · `CORRECTION` — | Operations |
| ASSIGNMENT_ROLE | `LEADER` «قائد فريق» · `MEMBER` · `ALTERNATE` (D1 «كل منطقة لها عاملة بديلة») | Operations |
| CHECKLIST_KIND | `TASK` · `AREA` · `DEPARTURE` | D9 sections 6, 14 |
| TASK_FREQUENCY | `DAILY` «يومية» · `WEEKLY` «أسبوعية» · `MONTHLY` «شهرية» · `SPECIAL` «خاصة» | D6 section 11, D8 section 12 |
| AREA_KIND | `ENTRANCE` «مدخل» · `FLOOR` «طابق» · `ROOM` «غرفة» · `SPACE` «مساحة» · `OTHER` «مناطق أخرى» | D9 section 6 |
| ENTRY_STATE | `PARTIAL` · `COMPLETE` | Operations |
| PRESENCE_PROOF (per worker on `VisitWorker`; the weakest one on `VisitReport`) | `BOTH` · `ARRIVAL_ONLY` · `DEPARTURE_ONLY` · `NONE` — | scope feature 12; D9 section 13 |
| COMPLETION | `FULL` «مكتملة بالكامل» · `PARTIAL` «مكتملة جزئياً» · `NOT_DONE` «لم تكتمل» (D2 asks «هل تم تنفيذ جميع المهام؟ نعم / جزئيًا / لا») | D9 section 16 |
| SIGNOFF_STATUS | `ACCEPTED` · `ACCEPTED_WITH_NOTES` · `NOT_ACCEPTED`, two wordings: housing (D2 section 21) «راضٍ» · «راضٍ مع ملاحظات» · «غير راضٍ»; the other three divisions (D9 section 18) «تم قبول الخدمة» · «تم قبولها مع ملاحظات» · «تحتاج إلى تصحيح» | |
| NEXT_FREQUENCY | `WEEKLY` «أسبوعي» · `TWICE_WEEKLY` «مرتان أسبوعيًا» · `MONTHLY` «شهري» · `ON_DEMAND` «حسب الطلب» | D2 section 24 |
| CALL_PURPOSE | `REMINDER` · `REPLACEMENT_NOTICE` · `ARRIVAL_CHECK` · `FOLLOW_UP` — | features 16, 9, 27 |
| CALL_RESULT | `INFORMED` «تم إبلاغ العميل» · `NO_ANSWER` «لم يرد» · `POSTPONE_REQUESTED` «طلب تأجيل» · `CANCEL_REQUESTED` «طلب إلغاء» | Operations' wording |
| REMINDER_MODE | `ALL` · `FIRST_AND_CHANGED` · `NONE` | Operations |
| PHOTO_KIND | see Foundation's lists: photos are `Upload` rows | Operations' wording |

Money's visit statement froze different words for the same two lists («كامل / جزئي / لم يكتمل», «راضٍ / مع ملاحظات / غير راضٍ»): `InvoiceVisit.completion` and `signOff` copy Operations' labels above, in the division's wording.

**DEPARTURE check lines** (D9 section 14), codes `DEP_01`..`DEP_08`, copied onto `VisitChecklistItem` rows of kind DEPARTURE: «تم تنظيف جميع المناطق المحددة» · «تم جمع النفايات حسب الاتفاق» · «تم تنظيف الأدوات بعد الاستعمال» · «تم إعادة المعدات إلى مكانها» · «تم التأكد من عدم ترك مواد التنظيف في أماكن غير آمنة» · «تم التأكد من إغلاق الأبواب التي تم فتحها أثناء العمل» · «تم إبلاغ المشرف بأي ملاحظة» · «تم تسليم الموقع للمسؤول».

### The site's office block (entered by Clients, wording from Operations' reading of D9)

| List | Codes and labels |
|---|---|
| FORBIDDEN_PLACE (D9 section 9) | `RESIDENT_FLATS` «شقق السكان» · `TECH_ROOMS` «غرف تقنية» · `ELECTRIC_ROOMS` «غرف كهرباء» · `EQUIPMENT_ROOMS` «غرف معدات» · `STORES` «مستودعات» · `OTHER` «مناطق أخرى» |
| SITE_INSTRUCTION (D9 section 10) | `NO_MOVE_PROPERTY` «عدم تحريك ممتلكات السكان» · `NO_TOUCH_DOCS` «عدم لمس الوثائق أو الأغراض الشخصية» · `NO_UNAPPROVED_PRODUCTS` «عدم استعمال مواد غير معتمدة» · `NO_MIXING` «عدم خلط مواد التنظيف» · `PROTECT_COMMON` «المحافظة على الممتلكات المشتركة» · `KEEP_QUIET` «المحافظة على الهدوء وعدم إزعاج السكان» · `KEEP_PASSAGES_SAFE` «إبقاء الممرات آمنة أثناء التنظيف» · `WET_FLOOR_SIGNS` «وضع إشارات تحذيرية عند وجود أرضية مبللة» · `REPORT_DAMAGE` «إبلاغ المشرف فوراً عن أي ضرر أو خطر» |

### Problems, absences, rules

| List | Codes and labels | Source |
|---|---|---|
| PROBLEM_KIND | `MATERIAL_SHORTAGE` «نقص مواد» · `EQUIPMENT_SHORTAGE` «نقص معدات» · `OBSTACLE` «عائق أمام العمل» · `AREA_UNAVAILABLE` «مساحة غير متاحة» · `PRIOR_DAMAGE` «تلف سابق» · `SAFETY_HAZARD` «خطر على السلامة» · `RESIDENT_COMPLAINT` «شكوى من أحد السكان» · `EXTRA_SERVICE` «خدمة إضافية مطلوبة» · `OTHER` «أخرى» · `DAMAGE_DURING_WORK` «تلف أو كسر» · `INJURY_ACCIDENT` «إصابة أو حادث» | D9 section 15; the last two from F1 article 13 |
| PROBLEM_VIA | `ORDER` · `PHONE` · `SUPERVISOR` — | Operations |
| PROBLEM_STATUS | `OPEN` · `IN_PROGRESS` · `CLOSED` — | Operations |
| HANDED_TO | `STOCK` · `CLIENTS` · `PEOPLE` | Operations |
| ABSENCE_CATEGORY | `LEAVE` «إجازة» · `SICK` «مرض» · `PERSONAL` «ظرف شخصي» · `UNJUSTIFIED` «دون مبرر» (F1 article 2) · `OTHER` «أخرى» | Operations' wording |
| ABSENCE_STATUS | `RECORDED` · `REQUESTED` · `APPROVED` · `REFUSED` · `CANCELLED` (Operations' `isCancelled` and People's leave status in one column). `RECORDED` and `APPROVED` block a picker and open the seats hit; `REQUESTED` warns; the other two are ignored | |
| ABSENCE_VIA | `PHONE` · `IN_PERSON` · `SUPERVISOR` · `NO_SHOW` — | Operations |
| RULE_CODE | `OVERLAP` · `DAY_SPAN_12H` · `WEEK_OVER_48H` · `NIGHT_WOMAN` · `NO_REST_DAY` · `UNAVAILABLE_DAY` · `ON_LEAVE` (with `valueMin` and `ruleDate` on the override) | scope section 5 |
| VEHICLE_STATUS | `ACTIVE` «في الخدمة» · `MAINTENANCE` «في الصيانة» · `RETIRED` «خارج الخدمة» | Operations' wording |

### Quality and complaints

| List | Codes and labels | Source |
|---|---|---|
| INSPECTION_CRITERION, seed rows for `HOUSING` and for `ORGANISATION` (seven each) | `FLOORS` «الأرضيات» · `GLASS` «الزجاج» · `BATHROOMS` «الحمامات» · `ENTRANCES` «المداخل» · `ODOURS` «الروائح» · `DUST` «الغبار» · `EQUIPMENT` «المعدات» | D1 «نظام مراقبة الجودة» |
| INSPECTION_CRITERION, seed rows for `BUILDING` and for `COMPLEX` (eight each) | `FLOORS` «الأرضيات» · `STAIRS` «السلالم» · `CORRIDORS` «الممرات» · `LIFTS` «المصاعد» · `ENTRANCES` «المداخل» · `WASTE` «جمع النفايات» · `INSTRUCTIONS` «الالتزام بالتعليمات» · `APPEARANCE` «المظهر المهني» | D9 section 17 |
| INSPECTION_FREQUENCY | `WEEKLY` «أسبوعية» · `MONTHLY` «شهرية» · `NONE` | Operations |
| INSPECTION_STATUS | `PLANNED` · `DONE` · `MISSED` · `CANCELLED` — | Operations |
| QUALITY_LEVEL «مستوى جودة العمل» | `EXCELLENT` «ممتاز» · `VERY_GOOD` «جيد جداً» · `GOOD` «جيد» · `ACCEPTABLE` «مقبول» · `REDO` «يحتاج إلى إعادة» | D9 section 17 |
| CORRECTIVE_SOURCE | `INSPECTION` · `COMPLAINT` · `PROBLEM_REPORT` · `SIGNOFF` · `MANUAL` | Operations |
| TASK_STATUS | `OPEN` · `IN_PROGRESS` · `DONE` · `CANCELLED` — | Operations |
| COMPLAINT_CHANNEL | `PHONE` · `AT_OFFICE` · `ON_ORDER` · `SUPERVISOR` · `VIA_WORKER` — | Operations |
| COMPLAINT_KIND «نوع المشكلة» | `QUALITY` «جودة» · `DELAY` «تأخير» · `BEHAVIOUR` «سلوك» · `EQUIPMENT_SHORTAGE` «نقص معدات» · `DAMAGE` «تلف» · `ABSENCE` «غياب» · `OTHER` «أخرى» (added) | D1 |
| COMPLAINT_STATUS | `NEW` · `IN_PROGRESS` · `SETTLED` · `REJECTED` — | Operations |
| FAULT | `YES` · `NO` · `UNDECIDED` | D1 «إذا كانت المشكلة بسبب المؤسسة» |
| SETTLEMENT «سياسة التعويض» | `REDO_SERVICE` «إعادة الخدمة» · `DISCOUNT` «خصم متفق عليه» · `NONE` · `OTHER` (the last two added) | D1 |

`QUALITY_LEVEL` and `CLEANLINESS` are two different five-level scales and stay two lists. `COMPLAINT_KIND.EQUIPMENT_SHORTAGE` and `PROBLEM_KIND.EQUIPMENT_SHORTAGE` are codes of two different lists.

### TASK_CATALOG: the seeded task catalogue (constants in Operations' folder, no table)

Used by `FileTask.catalogCode`.

Operations wrote these codes with dots (`ORG.D.01`); they are upper snake case here. The label is copied onto the `FileTask` row, so the code is only its origin. Numbering follows his order.

| Prefix | Source | Items, in order |
|---|---|---|
| `ORG_D_01`..`10` organisations, daily | D6 section 11 | كنس · مسح · إزالة الغبار · تنظيف المكاتب · تنظيف الأسطح · تنظيف الممرات · تنظيف السلالم · تنظيف دورات المياه · تفريغ النفايات · تنظيف المطبخ/الاستراحة |
| `ORG_W_01`..`07` weekly | D6 | تنظيف الزجاج · تنظيف الأبواب · تنظيف الجدران · تنظيف الزوايا · تنظيف السلالم بعمق · تنظيف المخازن · تنظيف المساحات الخارجية |
| `ORG_M_01`..`06` monthly | D6 | تنظيف شامل · تنظيف الواجهات · تنظيف النوافذ بالكامل · تنظيف عميق للأرضيات · تنظيف مناطق يصعب الوصول إليها · تنظيف موسمي |
| `ORG_S_01`..`06` special | D6 | بعد الأشغال · قبل الافتتاح · بعد مناسبة · بعد الانتقال · تنظيف طارئ · خدمة إضافية حسب الطلب |
| `BLD_D_01`..`06` buildings and complexes, daily | D8 section 12 | المداخل · السلالم · الممرات · المصاعد · إزالة النفايات · المساحات الخارجية |
| `BLD_W_01`..`06` weekly | D8 | تنظيف عميق للسلالم · تنظيف النوافذ · تنظيف الأبواب · تنظيف الجدران · تنظيف المرائب · تنظيف الأقبية |
| `BLD_M_01`..`05` monthly | D8 | تنظيف شامل · تنظيف الواجهات · تنظيف النوافذ بالكامل · تنظيف عميق للأرضيات · تنظيف المناطق قليلة الاستخدام |
| `BLD_S_01`..`05` extra services | D8 | تنظيف بعد الأشغال · تنظيف موسمي · تنظيف طارئ · تنظيف شامل قبل/بعد مناسبة · خدمات أخرى |
| `BLD_B_FLOORS_01`..`04` | D9 section 7 «مهام التنظيف الأساسية», الأرضيات | كنس · إزالة الغبار · مسح · إزالة البقع الظاهرة |
| `BLD_B_STAIRS_01`..`04` | السلالم | كنس الدرج · مسح الدرج · تنظيف حواف الدرج · تنظيف الدرابزين |
| `BLD_B_CORRIDORS_01`..`04` | الممرات | كنس · مسح · إزالة الغبار · تنظيف الزوايا |
| `BLD_B_LIFTS_01`..`05` | المصاعد | تنظيف الأرضية · تنظيف الأبواب · تنظيف المرآة · تنظيف الجدران الداخلية · تنظيف لوحة التحكم |
| `BLD_B_ENTRANCES_01`..`04` | المداخل | تنظيف الباب · تنظيف الزجاج · تنظيف الأرضية · إزالة الغبار |
| `BLD_B_WASTE_01`..`03` | النفايات | جمع النفايات · نقلها إلى نقطة التجميع المحددة · تنظيف مكان الحاويات عند إدراجه في نطاق العقد |
| `HOM_T_01`..`09` homes | D2 section 17 | إزالة الغبار · تنظيف الأرضيات · تنظيف المطبخ · تنظيف الحمامات · تنظيف النوافذ · تنظيف الأبواب · تنظيف الشرفات · تنظيف الأثاث · أخرى |
| `HOM_C_SALON_01`..`05` | D2 section 18, الصالون | إزالة الغبار · تنظيف الأرضية · تنظيف الأثاث · تنظيف النوافذ · تنظيف الأبواب |
| `HOM_C_BEDROOMS_01`..`04` | غرف النوم | إزالة الغبار · تنظيف الأرضيات · ترتيب حسب الاتفاق · تنظيف النوافذ |
| `HOM_C_KITCHEN_01`..`05` | المطبخ | الأسطح · الحوض · الأرضية · الخزائن الخارجية · الأجهزة حسب الاتفاق |
| `HOM_C_BATHROOM_01`..`05` | الحمام | المرحاض · المغسلة · المرآة · الأرضية · الجدران حسب الاتفاق |
| `HOM_C_EXTRAS_01`..`06` | إضافات | الشرفات · السلالم · الزجاج · السجاد · الستائر · أخرى |

The place part of the `BLD_B_` and `HOM_C_` codes is my split of Operations' `BLD.B.*` and `HOM.C.*`, which he left unnumbered.

**BUILDING_AREA** (D9 section 5), `BLD_A_01`..`14`, used by `FileArea.catalogCode`: المدخل الرئيسي · المداخل الثانوية · السلالم · الممرات · المصاعد · الأبواب والمقابض · صناديق البريد · النوافذ المشتركة · المرآب · القبو · الساحة الخارجية · الأرصفة والمحيط الخارجي · منطقة النفايات · أخرى.

A tick of PROVIDED_SERVICE on a file seeds one DAILY task with the form's own wording (Clients' label), with no catalogue code.

## 5. Money and stock

Money wrote every code in lower case; all are upper snake case here (coordinator's decision). The labels are Money's.

### Money

| List | Codes and labels | Source |
|---|---|---|
| DUE_KIND | `SCHEDULE` (one per payment period) · `VISIT` («بعد كل زيارة») · `SINGLE` (the one due of an on-demand job) · `INITIAL_JOB` (the first deep clean of an accepted quote, once per file) · `EXTRA` (a priced extra visit, `VisitBilling.amount`) · `DEPOSIT` «عربون» · `MANUAL` | «عربون» from س18 |
| DUE_STATE (derived, a chip) | `UPCOMING` «قادم» · `DUE_SOON` «يقترب موعده» · `OVERDUE` «متأخر» · `PARTIAL` «مدفوع جزئيًا» · `PAID` «مدفوع بالكامل» · `CANCELLED` «ملغى» | Money's wording, D2 |
| PAYMENT_STATE «حالة الدفع» (derived) | `PAID` «مدفوع بالكامل» · `PARTIAL` «مدفوع جزئيًا» · `UNPAID` «غير مدفوع» | D2 item 23 |
| INVOICE_STATUS (derived: a draft is an `InvoiceDraft` row, voided is a `LegalEvent`) | `DRAFT` «مسودة» · `ISSUED` «صادرة» · `VOIDED` «ملغاة» | plan feature 33 «تُلغى» |
| INVOICE_LINE_KIND | `SERVICE` · `VISIT` · `MATERIALS` · `TRANSPORT` · `EXTRA` · `MISSED_VISIT` · `DISCOUNT` · `DEPOSIT` (the last three carry negative amounts) | Money |
| LEGAL_EVENT_TYPE (`LegalEvent.type`, one table for invoices, payments and receipts) | `VOIDED` (any of the three) · `MISSING` (a receipt blank that was lost) · `PRINTED` (an invoice or a receipt). Money's `issued` is the invoice row itself; its `used` is the payment that points at the receipt | |
| RECEIPT_STATUS (derived) | `WITH_COLLECTOR` «لدى المحصِّل» · `USED` «مستعمل» (a payment points at it) · `VOIDED` «ملغى» · `MISSING` «مفقود» (wording to confirm) | Money's wording |
| COLLECTOR_KIND | `OFFICE` «المكتب» · `EMPLOYEE` «موظف» · `WORKER` «عامل مخوَّل» | F1 article 12 «مخولًا» |
| RECONCILIATION_OUTCOME | `USED` · `VOIDED` · `MISSING` | |
| FOLLOWUP_KIND | `CALL` «اتصال» · `LETTER` «رسالة مطبوعة» | scope decision 6 |
| EXPENSE_CATEGORY | `WAGES` «أجور» · `CONTRIBUTIONS` «مساهمات والتزامات» · `TRANSPORT` «نقل» · `MATERIALS` «مواد» · `RENT` «إيجار» · `PHONE` «هاتف» · `ACCOUNTING` «محاسبة» · `MARKETING` «تسويق» · `EQUIPMENT` «معدات» · `MAINTENANCE` «صيانة» · `COMPENSATION` «تعويضات» · `TAXES` «ضرائب» · `LOSSES` «خسائر/إلغاءات» · `OTHER` «أخرى» (added) | D1 «نموذج ربحية شهري», his order |
| EXPENSE_SOURCE | `MANUAL` · `PURCHASE` · `MAINTENANCE` · `PAYROLL` | Money |
| RECURRENCE | `NONE` · `MONTHLY` | Money |
| EXPORT_KIND | `INVOICES` · `PAYMENTS` · `RECEIPTS` · `EXPENSES` · `PURCHASES` | `RECEIPTS`: the receipts journal (F4, asked by Money) |
| TAX_MODE (setting and `Invoice.taxMode`) | `VAT` · `IFU` | LAW, س16 |
| STAMP_MODE (setting) | `WHOLE` · `PROGRESSIVE` | LAW |
| MISSED_VISIT_RULE (setting) | `BILL_DONE_ONLY` · `FIXED_AMOUNT` (the amount is setting `invoice.missedVisitAmount`) | Money, س15 |

Invoice line unit labels are free text frozen on the line: «زيارة», «شهر», «أسبوع», «خدمة».

### Stock

| List | Codes and labels | Source |
|---|---|---|
| STOCK_KIND | `EQUIPMENT` «المعدات» · `MATERIAL` «المواد» | his note, section 5 |
| STOCK_TRACKING | `QUANTITY` · `UNIT` | Money |
| STOCK_CATEGORY (`StockItem.category`, a filter) | `CLEANING_PRODUCT` · `CONSUMABLE` · `TOOL` · `MACHINE` · `PPE` — | Money |
| UNIT | `PIECE` «قطعة» · `LITRE` «لتر» · `KG` «كلغ» · `BOX` «علبة» · `BAG` «كيس» · `PAIR` «زوج» · `ROLL` «لفة» | Money's wording (no list in his documents) |
| ITEM_CONDITION «الحالة عند الاستلام» | `GOOD` «جيدة» · `NEEDS_MAINTENANCE` «تحتاج صيانة» · `OUT_OF_SERVICE` «خارج الخدمة» (added) | D9 item 11 |
| MOVEMENT_TYPE | `OPENING` · `PURCHASE_IN` · `HANDOUT_OUT` · `RETURN_IN` · `COUNT_ADJUST` · `WRITE_OFF` · `REVERSAL` (undoes the movement in `reversesMovementId`: a cancelled hand-out or purchase) | Money |
| EQUIPMENT_LOCATION | `STORE` «المخزن» · `WITH_WORKER` «لدى العامل» · `AT_SITE` «بموقع العميل» · `IN_MAINTENANCE` «في الصيانة» | D1 «المخزن»; client forms «تخزين معدات»; rest Money's |
| MAINTENANCE_KIND | `PREVENTIVE` «صيانة دورية» · `REPAIR` «إصلاح» | Money's wording |
| HANDOUT_PURPOSE | `JOB` «مهمة» · `WORKER_KIT` «تجهيز العامل» | scope N3; second Money's |
| PURCHASE_STATUS | `REQUESTED` «طلب شراء» · `ORDERED` «تم الطلب» · `RECEIVED` «مستلم» · `CANCELLED` «ملغى» | D1 «طلب شراء»; rest Money's |
| COUNT_STATUS | `OPEN` · `CLOSED` | |

### Seeded stock items (rows of `StockItem`, all editable; `code` values, not an option list)

- Materials (D8 item 17, D9 item 11, D1, D6 item 17): `FLOOR_CLEANER` «منظف أرضيات» · `GLASS_CLEANER` «منظف زجاج» · `BATHROOM_CLEANER` «منظف دورات/أسطح» · `DISINFECTANT` «مطهرات» · `MULTI_CLEANER` «منظف متعدد الاستعمال» · `SPECIAL_CLEANERS` «منظفات خاصة» · `WASTE_BAGS` «أكياس نفايات» · `CLOTHS` «مناديل/أقمشة» · `MICROFIBER` «فوط Microfiber» · `SPONGE` «إسفنج» · `BRUSHES` «فرش» · `GLOVES` «قفازات» · `MASK` «كمامة» · `OTHER_MATERIAL` «مواد أخرى».
- Equipment (D8 item 18, D9 item 11, D6 item 17): `BROOM` «مكنسة» · `MOP` «ممسحة» · `BUCKET` «دلو» · `VACUUM` «مكنسة كهربائية» · `BINS` «سلال/حاويات» · `LADDER` «سلم» · `GLASS_TOOLS` «معدات تنظيف الزجاج» · `FLOOR_MACHINE` «آلة تنظيف الأرضيات» · `OTHER_EQUIPMENT` «معدات أخرى».
- Protective kit (D9 item 12): `PPE_GLOVES` «قفازات» · `PPE_SHOES` «أحذية مناسبة» · `PPE_WORKWEAR` «لباس العمل» · `PPE_BADGE` «سترة/شارة تعريف» · `PPE_MASK` «كمامة عند الحاجة» · `PPE_EXTRA` «معدات حماية إضافية حسب طبيعة المهمة».

## 6. Conflicts between builders, in one place

| List | Builder A | Builder B | Kept |
|---|---|---|---|
| Division | Clients `HOUSING`, `ORGANISATION`, `BUILDING`, `COMPLEX` | Money `homes`, `organisations`, `buildings`, `complexes` | Clients' (coordinator) |
| Service type, payment method, payment frequency, bearer | Clients, upper case | Money, lower case (`payment_periodicity`, `borne_by`) | Clients' codes and names |
| Amount basis | Clients `PER_PAYMENT_PERIOD`, `WHOLE_CONTRACT` («لكامل العقد») | Money `per_period`, `whole_contract` («لكامل مدة العقد») | Clients' |
| Worker role «الصفة» | People `CLEANER`, `SENIOR_WORKER`, `TEAM_LEADER` | Operations `WORKER`, `SENIOR`, `LEADER` | People's |
| Transport means | Clients `WORKER_OWN` | Operations `OWN` | `WORKER_OWN` |
| D1's two actions | People `TRAINING`, `CHANGE` | Operations `TRAIN_WORKER`, `CHANGE_WORKER` | Operations' |
| Pay period | People `WEEKLY`, `MONTHLY` (worker) | People `WEEK`, `MONTH` (pay run) | `WEEKLY`, `MONTHLY` |
| Protective kit | Operations `BADGE` | Money `ppe_vest` | `BADGE`; stock item `PPE_BADGE` |
| Client sanction | Clients `NONE`, `SUSPENDED`, `PENALISED` (a column) | People `SUSPENDED`, `PENALISED` (rows) | People's; "none" is the absence of an active row |
| Completion and sign-off words on the visit statement | Operations (D9, D2 wording) | Money («كامل / جزئي / لم يكتمل», «راضٍ / مع ملاحظات / غير راضٍ») | Operations' |
| Leave and absence | People LEAVE_TYPE (7) and LEAVE_STATUS | Operations ABSENCE_CATEGORY (5) and `isCancelled` | both lists on `WorkerAbsence`; one ABSENCE_STATUS |
| Job position against login role | People `SALES_RECEPTION`, `OPERATIONS_OFFICER` | Foundation `RECEPTION_SALES`, `OPERATIONS` | the role codes, on both lists |
| Events of legal documents | Money `InvoiceEvent`, `PaymentEvent`, `ReceiptEvent` with three type lists | — | one `LegalEvent` table, one LEGAL_EVENT_TYPE |
| Task catalogue codes | — | Operations `ORG.D.01` | `ORG_D_01` |
