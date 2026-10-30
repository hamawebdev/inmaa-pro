# استمارة تسجيل وتعهد موظف: the one-page sheet given to a centre employee at registration

Status: **the developer's direction of 2026-10-30: one single A4 page**, replacing the first version (four pages with 25 articles). The client wants one simple, formal document per employee: the essential details, a statement that the employee is registered, the تعهد, the signatures.

The sheet is printed from the employee's file («استمارة التسجيل والتعهد», beside «بطاقة التعريف») and offered on the file right after registration. Each print writes one DISCLOSE in the log, as the ID card does. Arabic, A4, his letterhead (the worker form's family), one page whatever the data; empty values print as dotted blanks for the pen.

## The page

### Head
Title box in his style: «استمـــارة تسجيـــل وتعهـــد / موظف(ة) بمركز إنماء برو» (usual titles: «استمارة معلومات وتعهد الموظف», «إقرار وتعهد»). Beside it «رقم التسجيل» (`StaffMember.number`, no H/F) and «التاريخ» (`registrationDate`).

### 1. معلومات الموظف(ة)
A bordered table, two label/value pairs a row:

| Row | Field | Source |
|---|---|---|
| 1 | اللقب والاسم · الاسم باللغة الفرنسية | `lastName` `firstName` (surname first), `fullNameLatin` |
| 2 | تاريخ ومكان الإزدياد · الحالة الإجتماعية | `birthDate`, `birthPlace` / `birthWilayaCode`; `maritalStatus` in the person's sex |
| 3 | رقم بطاقة التعريف الوطنية · رقم الضمان الاجتماعي | `nationalIdNumber`; `cnasNumber` only when `cnasDeclared` |
| 4 | العنوان الشخصي (whole row) | `address`, residence commune / wilaya |
| 5 | رقم الهاتف · البريد الإلكتروني | `phone`, `email` |
| 6 | المنصب · تاريخ بداية العمل | `jobPosition` (`JOB_POSITION_AR`), `startDate` |
| 7 | نوع العقد · (CDD) إلى غاية | `employmentContract`; `contractEndDate` for a CDD |
| 8 | في حالة الطوارئ: الاسم وصلة القرابة · الهاتف | `emergencyName` `emergencyRelation`, `emergencyPhone` |

### 2. تأكيد التسجيل
«يشهد مدير مركز إنماء برو بأن {السيد/السيدة} {name} قد {تم تسجيله/تم تسجيلها} ضمن مستخدمي المركز تحت رقم التسجيل {number} بتاريخ {registrationDate}، بصفة {post}، ابتداءً من {startDate}.»

(Phrasing of Algerian work certificates: «أشهد بأن … يعمل لدى مؤسستنا منذ … بصفة …».)

### 3. التعهد
«أنا {الممضي/الممضية} أسفله، {المذكور/المذكورة} أعلاه، أتعهد بما يلي:» then five points:
1. الالتزام بالنظام الداخلي للمركز وبالتعليمات الصادرة عن الإدارة والمسؤولين.
2. احترام مواقيت العمل والانضباط، وعدم التغيب إلا بمبرر أو ترخيص مسبق.
3. أداء مهامي بأمانة وإخلاص، والمحافظة على ممتلكات المركز وأمواله ووسائل العمل الموضوعة تحت تصرفي.
4. الحفاظ على سرية جميع المعلومات والوثائق التي أطّلع عليها بحكم عملي، ولا سيما ما يخص عملاء المركز وعماله، وعدم إفشائها لأي جهة غير مخوّلة، حتى بعد انتهاء علاقة العمل لأي سبب كان.
5. التحلي بحسن السلوك والاحترام في التعامل مع العملاء والزملاء والمسؤولين، واحترام شروط العمل المتفق عليها عند التوظيف.

Closing: «وأقر بصحة المعلومات المدونة أعلاه، وبأنني قرأت هذا التعهد وفهمت محتواه وأوافق عليه، وفي حالة الإخلال بأي من هذه الالتزامات أتحمل الإجراءات التأديبية المنصوص عليها في النظام الداخلي.»

His own words kept: «أنا الممضي(ة) أسفله», «تعليمات الإدارة» (his «إقرار العامل(ة)», worker form W-066, W-067). The rest is the usual wording of Algerian and Arab undertakings (rules, hours, honesty and property, confidentiality after leaving, conduct), kept plain.

### 4. التوقيعات
«حُرّر بأم البواقي في: {registrationDate}» ({centre.city}; a dotted blank when the setting is empty), then his dash-dot rule and two columns: «إمضاء {الموظف/الموظفة}» with «(مسبوقًا بعبارة "قرئ وصودق عليه")» on the right, «إمضاء وختم مركز إنماء برو» on the left, each with its dotted line.

## Left out on purpose
The 25 articles, the review copy, the employer block, the trial period and the CDD reason, pay, education, the recruitment-documents checklist, the data-protection foot. The trial end date and the CDD reason stay on the employee form (migration 0004, decided 2026-10-30); they are no longer printed.
