-- Demo rows for the REFERENCE academy app only (.reference-scratch).
--
-- The reference's own seed leaves every list empty, and an empty table shows
-- none of the styling a new screen has to match: row height, badges, numbers,
-- the pager, a chart with bars. These rows fill the screens the baseline shots
-- cover. They are invented and belong to no real person.
--
-- Written for a clock fixed at 2026-10-11 10:30, Africa/Algiers (09:30 UTC):
--   node scripts/harness/baseline.mjs
--
-- Not for this project's own database: its schema is different.

-- ── Employees ───────────────────────────────────────────────────────────
INSERT INTO "Employee" (
  "id", "adminId", "lastName", "firstName", "jobPosition", "gender", "phoneNumber", "email",
  "joiningDate", "contractType", "employmentContract", "socialSecurityDeclared", "educationLevel",
  "maritalStatus", "isActive", "createdAt", "updatedAt"
) VALUES
  ('emp-01', 'local-admin', 'بن عيسى',  'كريم',   'ADMINISTRATOR',          'MALE',   '0661 20 31 42', 'karim.benaissa@example.dz',  '2023-09-03T00:00:00.000Z', 'FULL_TIME',   'CDI', 1, 'ليسانس',      'MARRIED', 1, '2026-09-01T08:00:00.000Z', '2026-09-01T08:00:00.000Z'),
  ('emp-02', 'local-admin', 'مرابط',    'نادية',  'FINANCIAL_OFFICER',      'FEMALE', '0550 14 27 93', 'nadia.merabet@example.dz',   '2024-01-15T00:00:00.000Z', 'FULL_TIME',   'CDI', 1, 'ماستر',       'SINGLE',  1, '2026-09-01T08:05:00.000Z', '2026-09-01T08:05:00.000Z'),
  ('emp-03', 'local-admin', 'حمدي',     'يوسف',   'SECURITY_GUARD',         'MALE',   '0770 85 12 06', NULL,                         '2022-11-01T00:00:00.000Z', 'FULL_TIME',   'CDD', 1, NULL,          'MARRIED', 1, '2026-09-01T08:10:00.000Z', '2026-09-01T08:10:00.000Z'),
  ('emp-04', 'local-admin', 'زروقي',    'سميرة',  'CLEANING_STAFF',         'FEMALE', '0699 43 70 18', NULL,                         '2025-02-10T00:00:00.000Z', 'PART_TIME',   'CDD', 0, NULL,          'MARRIED', 1, '2026-09-01T08:15:00.000Z', '2026-09-01T08:15:00.000Z'),
  ('emp-05', 'local-admin', 'بوزيد',    'أمين',   'PEDAGOGICAL_SUPERVISOR', 'MALE',   '0558 62 09 77', 'amine.bouzid@example.dz',    '2021-09-05T00:00:00.000Z', 'FULL_TIME',   'CDI', 1, 'ماستر',       'MARRIED', 1, '2026-09-01T08:20:00.000Z', '2026-09-01T08:20:00.000Z'),
  ('emp-06', 'local-admin', 'شريف',     'إيمان',  'SUPERVISOR',             'FEMALE', '0662 31 58 40', 'imane.cherif@example.dz',    '2024-09-01T00:00:00.000Z', 'CONTRACTUAL', 'CDD', 1, 'ليسانس',      'SINGLE',  1, '2026-09-01T08:25:00.000Z', '2026-09-01T08:25:00.000Z'),
  ('emp-07', 'local-admin', 'عمراني',   'رشيد',   'CONSULTANT',             'MALE',   '0771 90 22 15', 'rachid.amrani@example.dz',   '2025-06-01T00:00:00.000Z', 'PART_TIME',   'CDD', 0, 'دكتوراه',     'MARRIED', 1, '2026-09-01T08:30:00.000Z', '2026-09-01T08:30:00.000Z'),
  ('emp-08', 'local-admin', 'قاسمي',    'هدى',    'EDUCATIONAL_SUPERVISOR', 'FEMALE', '0540 77 64 29', 'houda.kacemi@example.dz',    '2020-10-12T00:00:00.000Z', 'FULL_TIME',   'CDI', 1, 'ليسانس',      'DIVORCED', 0, '2026-09-01T08:35:00.000Z', '2026-09-01T08:35:00.000Z');

-- Yesterday's full day, and this morning's arrivals.
INSERT INTO "EmployeeCheckRecord" ("id", "employeeId", "type", "timestamp", "note", "createdAt", "updatedAt") VALUES
  ('ecr-01', 'emp-01', 'CHECK_IN',  '2026-10-10T06:58:00.000Z', NULL,              '2026-10-10T06:58:00.000Z', '2026-10-10T06:58:00.000Z'),
  ('ecr-02', 'emp-01', 'CHECK_OUT', '2026-10-10T15:32:00.000Z', NULL,              '2026-10-10T15:32:00.000Z', '2026-10-10T15:32:00.000Z'),
  ('ecr-03', 'emp-02', 'CHECK_IN',  '2026-10-10T07:05:00.000Z', NULL,              '2026-10-10T07:05:00.000Z', '2026-10-10T07:05:00.000Z'),
  ('ecr-04', 'emp-02', 'CHECK_OUT', '2026-10-10T15:10:00.000Z', NULL,              '2026-10-10T15:10:00.000Z', '2026-10-10T15:10:00.000Z'),
  ('ecr-05', 'emp-03', 'CHECK_IN',  '2026-10-10T05:45:00.000Z', NULL,              '2026-10-10T05:45:00.000Z', '2026-10-10T05:45:00.000Z'),
  ('ecr-06', 'emp-03', 'CHECK_OUT', '2026-10-10T17:02:00.000Z', NULL,              '2026-10-10T17:02:00.000Z', '2026-10-10T17:02:00.000Z'),
  ('ecr-07', 'emp-05', 'CHECK_IN',  '2026-10-10T07:12:00.000Z', 'تأخر بسبب النقل', '2026-10-10T07:12:00.000Z', '2026-10-10T07:12:00.000Z'),
  ('ecr-08', 'emp-05', 'CHECK_OUT', '2026-10-10T15:40:00.000Z', NULL,              '2026-10-10T15:40:00.000Z', '2026-10-10T15:40:00.000Z'),
  ('ecr-09', 'emp-01', 'CHECK_IN',  '2026-10-11T06:55:00.000Z', NULL,              '2026-10-11T06:55:00.000Z', '2026-10-11T06:55:00.000Z'),
  ('ecr-10', 'emp-02', 'CHECK_IN',  '2026-10-11T07:02:00.000Z', NULL,              '2026-10-11T07:02:00.000Z', '2026-10-11T07:02:00.000Z'),
  ('ecr-11', 'emp-03', 'CHECK_IN',  '2026-10-11T05:50:00.000Z', NULL,              '2026-10-11T05:50:00.000Z', '2026-10-11T05:50:00.000Z'),
  ('ecr-12', 'emp-04', 'CHECK_IN',  '2026-10-11T06:30:00.000Z', NULL,              '2026-10-11T06:30:00.000Z', '2026-10-11T06:30:00.000Z'),
  ('ecr-13', 'emp-04', 'CHECK_OUT', '2026-10-11T09:05:00.000Z', NULL,              '2026-10-11T09:05:00.000Z', '2026-10-11T09:05:00.000Z'),
  ('ecr-14', 'emp-06', 'CHECK_IN',  '2026-10-11T07:20:00.000Z', NULL,              '2026-10-11T07:20:00.000Z', '2026-10-11T07:20:00.000Z');

INSERT INTO "EmployeeAbsence" ("id", "employeeId", "type", "startTime", "endTime", "absenceHours", "reason", "details", "createdAt", "updatedAt") VALUES
  ('eab-01', 'emp-05', 'FULL_DAY', '2026-10-05T07:00:00.000Z', '2026-10-05T15:00:00.000Z', 8, 'مرض',          'شهادة طبية', '2026-10-05T08:00:00.000Z', '2026-10-05T08:00:00.000Z'),
  ('eab-02', 'emp-07', 'HALF_DAY', '2026-10-07T07:00:00.000Z', '2026-10-07T11:00:00.000Z', 4, 'ظرف عائلي',    NULL,         '2026-10-07T08:00:00.000Z', '2026-10-07T08:00:00.000Z'),
  ('eab-03', 'emp-07', 'HOURS',    '2026-10-08T12:00:00.000Z', '2026-10-08T14:00:00.000Z', 2, 'موعد إداري',   NULL,         '2026-10-08T08:00:00.000Z', '2026-10-08T08:00:00.000Z');

INSERT INTO "EmployeePayout" ("id", "employeeId", "amount", "note", "createdAt") VALUES
  ('epo-01', 'emp-01', 45000, 'راتب سبتمبر', '2026-10-02T09:00:00.000Z'),
  ('epo-02', 'emp-02', 52000, 'راتب سبتمبر', '2026-10-02T09:10:00.000Z'),
  ('epo-03', 'emp-03', 32000, 'راتب سبتمبر', '2026-10-03T09:00:00.000Z'),
  ('epo-04', 'emp-04', 18000, 'راتب سبتمبر', '2026-10-03T09:20:00.000Z');

-- ── Expenses ────────────────────────────────────────────────────────────
INSERT INTO "Expense" ("id", "adminId", "purchasingAgent", "educationLevel", "category", "date", "amount", "note", "createdAt", "updatedAt") VALUES
  ('exp-01', 'local-admin', 'كريم بن عيسى', 'PRIMARY',     'BOOKS',            '2026-10-01T09:00:00.000Z', 12500, 'كتب القراءة',        '2026-10-01T09:00:00.000Z', '2026-10-01T09:00:00.000Z'),
  ('exp-02', 'local-admin', 'نادية مرابط',  NULL,          'KITCHEN_SUPPLIES', '2026-10-02T09:00:00.000Z',  3200, NULL,                 '2026-10-02T09:00:00.000Z', '2026-10-02T09:00:00.000Z'),
  ('exp-03', 'local-admin', 'كريم بن عيسى', 'MIDDLE',      'FURNITURE',        '2026-10-03T09:00:00.000Z', 48000, 'طاولات وكراسي',      '2026-10-03T09:00:00.000Z', '2026-10-03T09:00:00.000Z'),
  ('exp-04', 'local-admin', 'يوسف حمدي',    NULL,          'MAINTENANCE',      '2026-10-04T09:00:00.000Z',  7600, 'إصلاح المكيف',       '2026-10-04T09:00:00.000Z', '2026-10-04T09:00:00.000Z'),
  ('exp-05', 'local-admin', 'نادية مرابط',  'HIGH_SCHOOL', 'COMPUTERS',        '2026-10-05T09:00:00.000Z', 86000, 'حاسوب محمول',        '2026-10-05T09:00:00.000Z', '2026-10-05T09:00:00.000Z'),
  ('exp-06', 'local-admin', 'كريم بن عيسى', 'PROGRAMS',    'TOOLS',            '2026-10-06T09:00:00.000Z',  5400, 'أدوات السوروبان',    '2026-10-06T09:00:00.000Z', '2026-10-06T09:00:00.000Z'),
  ('exp-07', 'local-admin', 'سميرة زروقي',  NULL,          'KITCHEN_SUPPLIES', '2026-10-07T09:00:00.000Z',  2150, NULL,                 '2026-10-07T09:00:00.000Z', '2026-10-07T09:00:00.000Z'),
  ('exp-08', 'local-admin', 'كريم بن عيسى', 'PRIMARY',     'BAGS',             '2026-10-08T09:00:00.000Z',  9800, NULL,                 '2026-10-08T09:00:00.000Z', '2026-10-08T09:00:00.000Z'),
  ('exp-09', 'local-admin', 'يوسف حمدي',    NULL,          'MAINTENANCE',      '2026-10-09T09:00:00.000Z', 14300, 'دهان القاعة 3',      '2026-10-09T09:00:00.000Z', '2026-10-09T09:00:00.000Z'),
  ('exp-10', 'local-admin', 'نادية مرابط',  'MIDDLE',      'BOOKS',            '2026-10-10T09:00:00.000Z',  6700, NULL,                 '2026-10-10T09:00:00.000Z', '2026-10-10T09:00:00.000Z');

-- ── Teachers, groups, students ──────────────────────────────────────────
INSERT INTO "Teacher" (
  "id", "adminId", "firstName", "lastName", "gender", "phone1", "email", "academicDegree",
  "joiningDate", "contractType", "isActive", "createdAt", "updatedAt"
) VALUES
  ('tch-01', 'local-admin', 'سليم',   'بوعلام', 'MALE',   '0661 11 22 33', 'salim.boualem@example.dz',  'MASTERS',  '2023-09-01T00:00:00.000Z', 'FULL_TIME', 1, '2026-09-01T09:00:00.000Z', '2026-09-01T09:00:00.000Z'),
  ('tch-02', 'local-admin', 'فاطمة',  'دحماني', 'FEMALE', '0550 44 55 66', 'fatima.dahmani@example.dz', 'BACHELOR', '2024-09-01T00:00:00.000Z', 'PART_TIME', 1, '2026-09-01T09:05:00.000Z', '2026-09-01T09:05:00.000Z'),
  ('tch-03', 'local-admin', 'مراد',   'خليفي',  'MALE',   '0770 77 88 99', 'mourad.khelifi@example.dz', 'PHD',      '2022-09-01T00:00:00.000Z', 'FULL_TIME', 1, '2026-09-01T09:10:00.000Z', '2026-09-01T09:10:00.000Z'),
  ('tch-04', 'local-admin', 'ليلى',   'منصوري', 'FEMALE', '0699 12 34 56', 'leila.mansouri@example.dz', 'MASTERS',  '2025-01-06T00:00:00.000Z', 'SUBSTITUTE', 1, '2026-09-01T09:15:00.000Z', '2026-09-01T09:15:00.000Z');

INSERT INTO "Group" (
  "id", "adminId", "name", "teacherId", "teacherIncomePercent", "educationLevel", "subject",
  "numberOfMonths", "totalSessions", "pricePerSession", "isActive", "createdAt", "updatedAt"
) VALUES
  ('grp-01', 'local-admin', 'رياضيات 4 متوسط',  'tch-01', 60, 'MIDDLE',  'MATH',   4, 16, 600, 1, '2026-09-05T09:00:00.000Z', '2026-09-05T09:00:00.000Z'),
  ('grp-02', 'local-admin', 'فرنسية 5 ابتدائي', 'tch-02', 55, 'PRIMARY', 'FRENCH', 4, 16, 500, 1, '2026-09-05T09:10:00.000Z', '2026-09-05T09:10:00.000Z'),
  ('grp-03', 'local-admin', 'فيزياء 3 متوسط',   'tch-03', 60, 'MIDDLE',  'PHYSICS_CHEM', 3, 12, 700, 1, '2026-09-05T09:20:00.000Z', '2026-09-05T09:20:00.000Z');

INSERT INTO "Student" ("id", "adminId", "firstName", "lastName", "fatherName", "gender", "fatherPhone", "motherPhone", "educationLevel", "createdAt", "updatedAt") VALUES
  ('std-01', 'local-admin', 'أنس',    'بلقاسم',  'محمد',   'MALE',   '0661 50 10 01', '0550 50 10 01', 'MIDDLE',  '2026-09-06T09:00:00.000Z', '2026-09-06T09:00:00.000Z'),
  ('std-02', 'local-admin', 'ريم',    'سعدي',    'علي',    'FEMALE', '0661 50 10 02', NULL,            'MIDDLE',  '2026-09-06T09:01:00.000Z', '2026-09-06T09:01:00.000Z'),
  ('std-03', 'local-admin', 'إلياس',  'مزيان',   'حسين',   'MALE',   '0661 50 10 03', '0550 50 10 03', 'MIDDLE',  '2026-09-06T09:02:00.000Z', '2026-09-06T09:02:00.000Z'),
  ('std-04', 'local-admin', 'سارة',   'بوشامة',  'عمر',    'FEMALE', '0661 50 10 04', NULL,            'MIDDLE',  '2026-09-06T09:03:00.000Z', '2026-09-06T09:03:00.000Z'),
  ('std-05', 'local-admin', 'آدم',    'طالبي',   'خالد',   'MALE',   '0661 50 10 05', '0550 50 10 05', 'PRIMARY', '2026-09-06T09:04:00.000Z', '2026-09-06T09:04:00.000Z'),
  ('std-06', 'local-admin', 'لينة',   'حداد',    'سمير',   'FEMALE', '0661 50 10 06', NULL,            'PRIMARY', '2026-09-06T09:05:00.000Z', '2026-09-06T09:05:00.000Z'),
  ('std-07', 'local-admin', 'ياسين',  'قريشي',   'نبيل',   'MALE',   '0661 50 10 07', '0550 50 10 07', 'PRIMARY', '2026-09-06T09:06:00.000Z', '2026-09-06T09:06:00.000Z'),
  ('std-08', 'local-admin', 'مريم',   'عثماني',  'رضا',    'FEMALE', '0661 50 10 08', NULL,            'MIDDLE',  '2026-09-06T09:07:00.000Z', '2026-09-06T09:07:00.000Z'),
  ('std-09', 'local-admin', 'زكرياء', 'لعريبي',  'فريد',   'MALE',   '0661 50 10 09', '0550 50 10 09', 'MIDDLE',  '2026-09-06T09:08:00.000Z', '2026-09-06T09:08:00.000Z'),
  ('std-10', 'local-admin', 'جنى',    'بن يحيى', 'كمال',   'FEMALE', '0661 50 10 10', NULL,            'PRIMARY', '2026-09-06T09:09:00.000Z', '2026-09-06T09:09:00.000Z');

INSERT INTO "GroupStudent" ("id", "groupId", "studentId", "enrolledAt", "updatedAt") VALUES
  ('gs-01', 'grp-01', 'std-01', '2026-09-07T09:00:00.000Z', '2026-09-07T09:00:00.000Z'),
  ('gs-02', 'grp-01', 'std-02', '2026-09-07T09:00:00.000Z', '2026-09-07T09:00:00.000Z'),
  ('gs-03', 'grp-01', 'std-03', '2026-09-07T09:00:00.000Z', '2026-09-07T09:00:00.000Z'),
  ('gs-04', 'grp-01', 'std-04', '2026-09-07T09:00:00.000Z', '2026-09-07T09:00:00.000Z'),
  ('gs-05', 'grp-02', 'std-05', '2026-09-07T09:00:00.000Z', '2026-09-07T09:00:00.000Z'),
  ('gs-06', 'grp-02', 'std-06', '2026-09-07T09:00:00.000Z', '2026-09-07T09:00:00.000Z'),
  ('gs-07', 'grp-02', 'std-07', '2026-09-07T09:00:00.000Z', '2026-09-07T09:00:00.000Z'),
  ('gs-08', 'grp-03', 'std-08', '2026-09-07T09:00:00.000Z', '2026-09-07T09:00:00.000Z'),
  ('gs-09', 'grp-03', 'std-09', '2026-09-07T09:00:00.000Z', '2026-09-07T09:00:00.000Z');

-- Paid sessions against attended ones give the three home tiles something to
-- count: two subscriptions used up, two with one session left, two in debt.
INSERT INTO "Payment" ("id", "studentId", "groupId", "amount", "sessionsAdded", "type", "createdAt") VALUES
  ('pay-01', 'std-01', 'grp-01', 4800, 8,  'RENEWAL', '2026-10-01T10:00:00.000Z'),
  ('pay-02', 'std-02', 'grp-01', 4800, 8,  'RENEWAL', '2026-10-02T10:00:00.000Z'),
  ('pay-03', 'std-03', 'grp-01', 4800, 8,  'RENEWAL', '2026-10-03T10:00:00.000Z'),
  ('pay-04', 'std-04', 'grp-01', 2400, 4,  'RENEWAL', '2026-10-04T10:00:00.000Z'),
  ('pay-05', 'std-05', 'grp-02', 4000, 8,  'RENEWAL', '2026-10-05T10:00:00.000Z'),
  ('pay-06', 'std-06', 'grp-02', 4000, 8,  'RENEWAL', '2026-10-06T10:00:00.000Z'),
  ('pay-07', 'std-07', 'grp-02', 4000, 8,  'RENEWAL', '2026-10-08T10:00:00.000Z'),
  ('pay-08', 'std-08', 'grp-03', 8400, 12, 'RENEWAL', '2026-10-10T10:00:00.000Z');

WITH RECURSIVE
  attended("studentId", "groupId", "total") AS (
    VALUES
      ('std-01', 'grp-01', 3), ('std-02', 'grp-01', 8), ('std-03', 'grp-01', 7), ('std-04', 'grp-01', 6),
      ('std-05', 'grp-02', 2), ('std-06', 'grp-02', 8), ('std-07', 'grp-02', 7),
      ('std-08', 'grp-03', 4), ('std-09', 'grp-03', 3)
  ),
  session("n") AS (SELECT 1 UNION ALL SELECT "n" + 1 FROM session WHERE "n" < 12)
INSERT INTO "GroupAttendance" ("id", "groupId", "studentId", "monthIndex", "sessionNumber", "status", "updatedAt")
SELECT
  'ga-' || attended."studentId" || '-' || session."n",
  attended."groupId",
  attended."studentId",
  (session."n" - 1) / 4,
  ((session."n" - 1) % 4) + 1,
  'PRESENT',
  '2026-10-09T10:00:00.000Z'
FROM attended JOIN session ON session."n" <= attended."total";
