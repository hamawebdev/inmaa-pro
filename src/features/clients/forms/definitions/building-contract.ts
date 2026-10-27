// Written from docs/checker/data/02-building-contract.json (the Checker's extraction of his Word file) and kept by hand since.
// definitions.test.ts fails when a label, an option, its order or its tick-box side differs from that file.
import type { FormDefinition } from "../types";

export const BUILDING_CONTRACT: FormDefinition = {
  kind: "BUILDING_CONTRACT",
  checker: {
    prefix: "B",
    file: "02-building-contract",
  },
  family: "BUILDING",
  registrationSuffix: "BLC",
  titleBox: {
    leftMm: 91.3,
    topMm: 0.83,
    widthMm: 102.01,
    heightMm: 12.29,
  },
  rows: [
    {
      id: "B-001",
      role: "title",
      raw: "نوع الخدمة : عقد (عمارة)",
      label: "نوع الخدمة : عقد (عمارة)",
      number: null,
      key: null,
      answer: null,
    },
    {
      id: "B-002",
      role: "number",
      raw: "رقـــم التســجــيـــل:",
      label: "رقم التسجيل",
      number: null,
      key: "registrationNumber",
      answer: "text",
    },
    {
      id: "B-003",
      role: "date",
      raw: "التاريخ:",
      label: "التاريخ",
      number: null,
      key: "registrationDate",
      answer: "date",
      blankParts: 3,
    },
    {
      id: "B-004",
      role: "heading",
      raw: "المعلومات الأساسية للعميل",
      label: "المعلومات الأساسية للعميل",
      number: "1-",
      key: null,
      answer: null,
    },
    {
      id: "B-005",
      role: "field",
      raw: "رقم الملف",
      label: "رقم الملف",
      number: "1.",
      key: "dossierNumber",
      answer: "text",
    },
    {
      id: "B-006",
      role: "field",
      raw: "رقم العمارة",
      label: "رقم العمارة",
      number: null,
      key: "siteNumber",
      answer: "text",
    },
    {
      id: "B-007",
      role: "choice",
      raw: "حالة الملف",
      label: "حالة الملف",
      number: "2.",
      key: "statusTicks",
      answer: "computed",
      list: "FILE_STATUS_TICK",
      options: [
        {
          raw: "قديم",
          side: "before",
        },
        {
          raw: "جديد",
          side: "before",
        },
        {
          raw: "الزيارة",
          side: "before",
        },
        {
          raw: "عرض سعر",
          side: "before",
        },
        {
          raw: "متعاقد",
          side: "before",
        },
        {
          raw: "انتهاء التعاقد",
          side: "before",
        },
        {
          raw: "متوقف",
          side: "before",
        },
        {
          raw: "معاقب",
          side: "before",
        },
      ],
    },
    {
      id: "B-008",
      role: "field",
      raw: "العنوان مدقق",
      label: "العنوان مدقق",
      number: "3.",
      key: "address",
      answer: "text",
    },
    {
      id: "B-009",
      role: "field",
      raw: "البلدية / الولاية",
      label: "البلدية / الولاية",
      number: null,
      key: "commune",
      answer: "place",
      pairKey: "wilaya",
      blankParts: 2,
    },
    {
      id: "B-010",
      role: "field",
      raw: "اسم المتداول",
      label: "اسم المتداول",
      number: "4.",
      key: "commonName",
      answer: "text",
    },
    {
      id: "B-011",
      role: "choice",
      raw: "جهة التعاقد",
      label: "جهة التعاقد",
      number: "5.",
      key: "contractingParty",
      answer: "single",
      list: "CONTRACTING_PARTY",
      otherKey: "contractingPartyOther",
      options: [
        {
          raw: "مالك العمارة",
          side: "before",
        },
        {
          raw: "ممثل السكان",
          side: "before",
        },
        {
          raw: "مسير الإقامة",
          side: "before",
        },
        {
          raw: "سانديك",
          side: "before",
        },
        {
          raw: "جمعية السكان",
          side: "before",
        },
        {
          raw: "شركة تسيير عقاري",
          side: "before",
        },
        {
          raw: "أخرى:",
          withText: true,
          side: "before",
        },
      ],
    },
    {
      id: "B-012",
      role: "field",
      raw: "اسم المسئول",
      label: "اسم المسئول",
      number: "6.",
      key: "clientName",
      answer: "text",
    },
    {
      id: "B-013",
      role: "field",
      raw: "الصفة",
      label: "الصفة",
      number: null,
      key: "capacity",
      answer: "text",
    },
    {
      id: "B-014",
      role: "field",
      raw: "رقم الهاتف",
      label: "رقم الهاتف",
      number: "7.",
      key: "phone",
      answer: "phone",
      prefix: "(01):",
    },
    {
      id: "B-015",
      role: "field",
      raw: "تاريخ الزيارة",
      label: "تاريخ الزيارة",
      number: null,
      key: "firstVisitDate",
      answer: "date",
    },
    {
      id: "B-016",
      role: "choice",
      raw: "تقييم النظافة",
      label: "تقييم النظافة",
      number: "8.",
      key: "cleanliness",
      answer: "single",
      list: "CLEANLINESS",
      noteKey: "cleanlinessNote",
      options: [
        {
          raw: "ممتاز",
          side: "after",
        },
        {
          raw: "جيد",
          side: "after",
        },
        {
          raw: "متوسط",
          side: "after",
        },
        {
          raw: "ضعيف",
          side: "after",
        },
        {
          raw: "يحتاج إلى تنظيف عميق",
          side: "after",
        },
      ],
    },
    {
      id: "B-017",
      role: "choice",
      raw: "تخزين معدات",
      label: "تخزين معدات",
      number: "9.",
      key: "equipmentStorage",
      answer: "yesNo",
      list: "YES_NO",
      options: [
        {
          raw: "نعم",
          side: "before",
        },
        {
          raw: "لا",
          side: "before",
        },
      ],
    },
    {
      id: "B-018",
      role: "field",
      raw: "اسم المكان",
      label: "اسم المكان",
      number: null,
      key: "storagePlace",
      answer: "text",
    },
    {
      id: "B-019",
      role: "choice",
      raw: "مكــــــــــان التخـــــلص مــــــن النفايات",
      label: "مكان التخلص من النفايات",
      number: "10.",
      key: "wasteDisposal",
      answer: "several",
      list: "WASTE_DISPOSAL",
      otherKey: "wasteDisposalOther",
      options: [
        {
          raw: "نقطة التجميع",
          side: "before",
        },
        {
          raw: "إلى الحاويات",
          side: "before",
        },
        {
          raw: "تعليمات العمارة",
          side: "before",
        },
        {
          raw: "",
          withText: true,
          side: "before",
        },
      ],
    },
    {
      id: "B-020",
      role: "heading",
      raw: "معلومات السكان",
      label: "معلومات السكان",
      number: "2-",
      key: null,
      answer: null,
    },
    {
      id: "B-021",
      role: "field",
      raw: "عدد الشقق المشغولة",
      label: "عدد الشقق المشغولة",
      number: null,
      key: "occupiedApartments",
      answer: "number",
    },
    {
      id: "B-022",
      role: "field",
      raw: "عدد الغير المشغولة",
      label: "عدد الغير المشغولة",
      number: null,
      key: "unoccupiedApartments",
      answer: "number",
    },
    {
      id: "B-023",
      role: "field",
      raw: "عدد السكان التقريبي",
      label: "عدد السكان التقريبي",
      number: null,
      key: "approxResidents",
      answer: "number",
    },
    {
      id: "B-024",
      role: "field",
      raw: "عدد الشقق الإجمالي",
      label: "عدد الشقق الإجمالي",
      number: null,
      key: "totalApartments",
      answer: "number",
    },
    {
      id: "B-025",
      role: "choice",
      raw: "معدل حركة السكان",
      label: "معدل حركة السكان",
      number: null,
      key: "residentTurnover",
      answer: "single",
      list: "RESIDENT_TURNOVER",
      options: [
        {
          raw: "منخفض",
          side: "before",
        },
        {
          raw: "متوسط",
          side: "before",
        },
        {
          raw: "مرتفع",
          side: "before",
        },
      ],
    },
    {
      id: "B-026",
      role: "heading",
      raw: "مواصفات العمارة",
      label: "مواصفات العمارة",
      number: "3-",
      key: null,
      answer: null,
    },
    {
      id: "B-027",
      role: "field",
      raw: "عدد المداخل",
      label: "عدد المداخل",
      number: null,
      key: "entrances",
      answer: "number",
    },
    {
      id: "B-028",
      role: "field",
      raw: "عدد الطوابق",
      label: "عدد الطوابق",
      number: null,
      key: "floors",
      answer: "number",
    },
    {
      id: "B-029",
      role: "field",
      raw: "عدد السلالم",
      label: "عدد السلالم",
      number: null,
      key: "stairs",
      answer: "number",
    },
    {
      id: "B-030",
      role: "field",
      raw: "عدد الشقق",
      label: "عدد الشقق",
      number: null,
      key: "apartments",
      answer: "number",
    },
    {
      id: "B-031",
      role: "field",
      raw: "عدد الممرات",
      label: "عدد الممرات",
      number: null,
      key: "corridors",
      answer: "number",
    },
    {
      id: "B-032",
      role: "field",
      raw: "عدد المصاعد",
      label: "عدد المصاعد",
      number: null,
      key: "lifts",
      answer: "number",
    },
    {
      id: "B-033",
      role: "choice",
      raw: "هل توجد أقبية",
      label: "هل توجد أقبية",
      number: null,
      key: "hasBasements",
      answer: "yesNo",
      list: "YES_NO",
      options: [
        {
          raw: "نعم",
          side: "before",
        },
        {
          raw: "لا",
          side: "before",
        },
      ],
    },
    {
      id: "B-034",
      role: "choice",
      raw: "مساحات خضراء",
      label: "مساحات خضراء",
      number: null,
      key: "hasGreenSpaces",
      answer: "yesNo",
      list: "YES_NO",
      options: [
        {
          raw: "نعم",
          side: "before",
        },
        {
          raw: "لا",
          side: "before",
        },
      ],
    },
    {
      id: "B-035",
      role: "choice",
      raw: "هل توجد مرائب",
      label: "هل توجد مرائب",
      number: null,
      key: "hasGarages",
      answer: "yesNo",
      list: "YES_NO",
      options: [
        {
          raw: "نعم",
          side: "before",
        },
        {
          raw: "لا",
          side: "before",
        },
      ],
    },
    {
      id: "B-036",
      role: "choice",
      raw: "أسطح مشتركة",
      label: "أسطح مشتركة",
      number: null,
      key: "hasSharedRoofs",
      answer: "yesNo",
      list: "YES_NO",
      options: [
        {
          raw: "نعم",
          side: "before",
        },
        {
          raw: "لا",
          side: "before",
        },
      ],
    },
    {
      id: "B-037",
      role: "heading",
      raw: "الخدمات المقدمة",
      label: "الخدمات المقدمة",
      number: "4-",
      key: null,
      answer: null,
    },
    {
      id: "B-038",
      role: "choice",
      raw: "",
      label: "",
      number: null,
      key: "providedServices",
      answer: "several",
      list: "PROVIDED_SERVICE",
      freeKey: "providedServicesCustom",
      services: {
        side: "after",
        // His file puts the box before these, the services only the building form lists (K8).
        sideOf: {
          COURTYARDS: "before",
          SWEEP_DUST: "before",
          STAINS: "before",
          DOORS: "before",
          CORRIDORS: "before",
          WALLS: "before",
          CORNERS: "before",
          MAILBOXES: "before",
          ENTRANCES: "before",
          PAVEMENTS: "before",
        },
        columns: [{ blanks: [] }, { blanks: [] }, { blanks: [] }, { blanks: [] }],
      },
      flags: ["options-without-label"],
    },
    {
      id: "B-039",
      role: "heading",
      raw: "الخدمات المبرمجة",
      label: "الخدمات المبرمجة",
      number: "1-",
      key: null,
      answer: null,
      flags: ["numbering-slip"],
    },
    {
      id: "B-040",
      role: "choice",
      raw: "",
      label: "",
      number: null,
      key: "programmedServices",
      answer: "several",
      list: "PROGRAMMED_SERVICE",
      freeKey: "programmedServicesCustom",
      services: {
        side: "after",
        columns: [
          { blanks: [{ side: "none" }] },
          { blanks: [{ side: "none" }] },
          { blanks: [{ side: "none" }] },
          { blanks: [{ side: "none" }, { side: "none" }] },
        ],
      },
      flags: ["options-without-label"],
    },
    {
      id: "B-041",
      role: "heading",
      raw: "الدراسة المالية",
      label: "الدراسة المالية",
      number: "5-",
      key: null,
      answer: null,
    },
    {
      id: "B-042",
      role: "choice",
      raw: "نــــوع العقد:",
      label: "نوع العقد",
      number: "1.",
      key: "contractKind",
      answer: "single",
      list: "CONTRACT_KIND",
      noteKey: "contractKindNote",
      options: [
        {
          raw: "قصير",
          side: "after",
        },
        {
          raw: "طويل",
          side: "after",
        },
      ],
      flags: ["label-inside-value-cell"],
    },
    {
      id: "B-043",
      role: "choice",
      raw: "مدة العقد",
      label: "مدة العقد",
      number: "2.",
      key: "contractDuration",
      answer: "single",
      list: "CONTRACT_DURATION",
      noteKey: "contractDurationNote",
      options: [
        {
          raw: "شهر",
          side: "after",
        },
        {
          raw: "3 أشهر",
          side: "after",
        },
        {
          raw: "6 أشهر",
          side: "after",
        },
        {
          raw: "سنة",
          side: "after",
        },
      ],
    },
    {
      id: "B-044",
      role: "choice",
      raw: "عدد الزيارات",
      label: "عدد الزيارات",
      number: "3.",
      key: "visitsPerWeek",
      answer: "single",
      list: "VISITS_PER_WEEK",
      options: [
        {
          raw: "واحدة بالأسبوع",
          side: "after",
        },
        {
          raw: "اثنين بالأسبوع",
          side: "after",
        },
        {
          raw: "ثلاثة بالأسبوع",
          side: "after",
        },
        {
          raw: "أربعة بالأسبوع",
          side: "after",
        },
        {
          raw: "خمسة بالأسبوع",
          side: "after",
        },
        {
          raw: "ستة بالأسبوع",
          side: "none",
        },
      ],
      flags: ["label-without-box"],
    },
    {
      id: "B-045",
      role: "choice",
      raw: "أيام التنفيذ",
      label: "أيام التنفيذ",
      number: "4.",
      key: "executionDays",
      answer: "several",
      list: "WEEKDAY",
      options: [
        {
          raw: "السبت",
          side: "after",
        },
        {
          raw: "الأحد",
          side: "after",
        },
        {
          raw: "الاثنين",
          side: "after",
        },
        {
          raw: "الثلاثاء",
          side: "after",
        },
        {
          raw: "الأربعاء",
          side: "after",
        },
        {
          raw: "الخميس",
          side: "after",
        },
      ],
    },
    {
      id: "B-046",
      role: "choice",
      raw: "تحديد الفترة",
      label: "تحديد الفترة",
      number: "5.",
      key: "period",
      answer: "single",
      list: "DAY_PERIOD",
      options: [
        {
          raw: "الصباحية",
          side: "after",
        },
        {
          raw: "المسائية",
          side: "after",
        },
        {
          raw: "معا",
          side: "after",
        },
      ],
    },
    {
      id: "B-047",
      role: "field",
      raw: "من:",
      label: "من",
      number: null,
      key: "periodFrom",
      answer: "time",
      flags: ["label-inside-value-cell"],
    },
    {
      id: "B-048",
      role: "field",
      raw: "إلى:",
      label: "إلى",
      number: null,
      key: "periodTo",
      answer: "time",
      flags: ["label-inside-value-cell"],
    },
    {
      id: "B-049",
      role: "field",
      raw: "تاريخ البداية",
      label: "تاريخ البداية",
      number: "6.",
      key: "startDate",
      answer: "date",
    },
    {
      id: "B-050",
      role: "field",
      raw: "تاريخ النهاية",
      label: "تاريخ النهاية",
      number: null,
      key: "endDate",
      answer: "date",
    },
    {
      id: "B-051",
      role: "field",
      raw: "وقت الوصول",
      label: "وقت الوصول",
      number: "7.",
      key: "arrivalTime",
      answer: "time",
    },
    {
      id: "B-052",
      role: "field",
      raw: "المغادرة:",
      label: "المغادرة",
      number: null,
      key: "departureTime",
      answer: "time",
      flags: ["label-inside-value-cell"],
    },
    {
      id: "B-053",
      role: "field",
      raw: "عدد العمال",
      label: "عدد العمال",
      number: null,
      key: "workersCount",
      answer: "number",
    },
    {
      id: "B-054",
      role: "field",
      raw: "مسدد أتعاب",
      label: "مسدد أتعاب",
      number: "8.",
      key: "payerName",
      answer: "text",
    },
    {
      id: "B-055",
      role: "field",
      raw: "رقم الهاتف",
      label: "رقم الهاتف",
      number: null,
      key: "payerPhone",
      answer: "phone",
    },
    {
      id: "B-056",
      role: "choice",
      raw: "مواد التنظيف",
      label: "مواد التنظيف",
      number: "9.",
      key: "materialsBearer",
      answer: "single",
      list: "BEARER",
      options: [
        {
          raw: "على عاتق المركز",
          side: "after",
        },
        {
          raw: "على عاتق صاحبها",
          side: "after",
        },
      ],
    },
    {
      id: "B-057",
      role: "field",
      raw: "مصاريفها",
      label: "مصاريفها",
      number: null,
      key: "materialsAmount",
      answer: "money",
      suffix: "دج",
    },
    {
      id: "B-058",
      role: "choice",
      raw: "توفير النقل",
      label: "توفير النقل",
      number: "10.",
      key: "transportBearer",
      answer: "single",
      list: "BEARER",
      options: [
        {
          raw: "على عاتق المركز",
          side: "after",
        },
        {
          raw: "على عاتق صاحبها",
          side: "after",
        },
      ],
    },
    {
      id: "B-059",
      role: "field",
      raw: "مصاريفها",
      label: "مصاريفها",
      number: null,
      key: "transportAmount",
      answer: "money",
      suffix: "دج",
    },
    {
      id: "B-060",
      role: "choice",
      raw: "طريقة السداد",
      label: "طريقة السداد",
      number: "11.",
      key: "paymentMethods",
      answer: "several",
      list: "PAYMENT_METHOD",
      options: [
        {
          raw: "نقدًا",
          side: "after",
        },
        {
          raw: "تحويل بنكي",
          side: "after",
        },
        {
          raw: "تحويل بريدي",
          side: "after",
        },
      ],
    },
    {
      id: "B-061",
      role: "field",
      raw: "المبلغ إجمالي",
      label: "المبلغ إجمالي",
      number: null,
      key: "totalAmount",
      answer: "money",
      suffix: "دج",
    },
    {
      id: "B-062",
      role: "field",
      raw: "تاريخ تسديد",
      label: "تاريخ تسديد",
      number: "12.",
      key: "firstDueDate",
      answer: "date",
    },
    {
      id: "B-063",
      role: "field",
      raw: "مكان التسديد",
      label: "مكان التسديد",
      number: null,
      key: "paymentPlace",
      answer: "text",
    },
    {
      id: "B-064",
      role: "choice",
      raw: "دورية السداد",
      label: "دورية السداد",
      number: "13.",
      key: "paymentFrequency",
      answer: "single",
      list: "PAYMENT_FREQUENCY",
      options: [
        {
          raw: "بعد كل زيارة",
          side: "after",
        },
        {
          raw: "أسبوعيا",
          side: "after",
        },
        {
          raw: "كل أسبوعين",
          side: "after",
        },
        {
          raw: "كل شهر",
          side: "after",
        },
      ],
    },
    {
      id: "B-065",
      role: "choice",
      raw: "دخول الفريق",
      label: "دخول الفريق",
      number: "14.",
      key: "teamAccess",
      answer: "several",
      list: "TEAM_ACCESS",
      options: [
        {
          raw: "عن طريق الحارس",
          side: "before",
        },
        {
          raw: "مفتاح خاص",
          side: "before",
        },
        {
          raw: "مسؤول العمارة",
          side: "before",
        },
        {
          raw: "باب مفتوح خلال ساعات العمل",
          side: "before",
        },
      ],
    },
    {
      id: "B-066",
      role: "choice",
      raw: "يوجد حارس",
      label: "يوجد حارس",
      number: "15.",
      key: "hasGuard",
      answer: "yesNo",
      list: "YES_NO",
      options: [
        {
          raw: "نعم",
          side: "before",
        },
        {
          raw: "لا",
          side: "before",
        },
      ],
    },
    {
      id: "B-067",
      role: "choice",
      raw: "تعليمات أمنية",
      label: "تعليمات أمنية",
      number: null,
      key: "securityInstructions",
      answer: "yesNo",
      list: "YES_NO",
      options: [
        {
          raw: "نعم",
          side: "before",
        },
        {
          raw: "لا",
          side: "before",
        },
      ],
    },
    {
      id: "B-068",
      role: "field",
      raw: "اسمه ولقبه",
      label: "اسمه ولقبه",
      number: "16.",
      key: "guardName",
      answer: "text",
    },
    {
      id: "B-069",
      role: "field",
      raw: "رقم الهاتف",
      label: "رقم الهاتف",
      number: null,
      key: "guardPhone",
      answer: "phone",
    },
    {
      id: "B-070",
      role: "date",
      raw: "حررت: بأم البواقي، بتاريخ:",
      label: "حررت: بأم البواقي، بتاريخ",
      number: null,
      key: "issuedDate",
      answer: "date",
      blankParts: 3,
      flags: ["label-inside-value-cell"],
    },
    {
      id: "B-071",
      role: "signature",
      raw: "الإمضـــــاء والخـــــتم",
      label: "الإمضاء والختم",
      number: null,
      key: null,
      answer: null,
    },
    {
      id: "B-072",
      role: "heading",
      raw: "قائمة القاطنين بالعمارة",
      label: "قائمة القاطنين بالعمارة",
      number: "6-",
      key: null,
      answer: null,
    },
    {
      id: "B-073",
      role: "field",
      raw: "الرقم",
      label: "الرقم",
      number: null,
      key: null,
      answer: null,
      flags: ["column-heading"],
    },
    {
      id: "B-074",
      role: "field",
      raw: "اللقب والاسم",
      label: "اللقب والاسم",
      number: null,
      key: null,
      answer: null,
      flags: ["column-heading"],
    },
    {
      id: "B-075",
      role: "field",
      raw: "رقم الهاتف",
      label: "رقم الهاتف",
      number: null,
      key: null,
      answer: null,
      blankParts: 5,
      flags: ["column-heading"],
    },
    {
      id: "B-076",
      role: "field",
      raw: "تاريخ التسجيل",
      label: "تاريخ التسجيل",
      number: null,
      key: null,
      answer: null,
      blankParts: 3,
      flags: ["column-heading"],
    },
  ],
  sheet: [
    {
      t: "header",
    },
    {
      t: "table",
      id: "T1",
      columnsMm: [32.49, 30.0, 27.52, 22.49, 32.51, 47.52],
      offsetMm: -2.7,
      rows: [
        {
          minMm: 1.38,
          cells: [
            {
              span: 6,
              parts: [
                {
                  t: "heading",
                  row: "B-004",
                },
              ],
              shaded: true,
              noTop: true,
            },
          ],
        },
        {
          minMm: 1.38,
          cells: [
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-005",
                },
              ],
              align: "center",
            },
            {
              span: 3,
              parts: [
                {
                  t: "blank",
                  row: "B-005",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-006",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "B-006",
                },
              ],
              align: "center",
            },
          ],
        },
        {
          minMm: 1.38,
          cells: [
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-007",
                },
              ],
              align: "center",
            },
            {
              span: 5,
              parts: [
                {
                  t: "options",
                  row: "B-007",
                  from: 0,
                  to: 8,
                },
              ],
            },
          ],
        },
        {
          minMm: 1.38,
          cells: [
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-008",
                },
              ],
              align: "center",
            },
            {
              span: 3,
              parts: [
                {
                  t: "blank",
                  row: "B-008",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-009",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "B-009",
                },
              ],
              align: "center",
            },
          ],
        },
        {
          minMm: 1.38,
          cells: [
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-010",
                },
              ],
              align: "center",
            },
            {
              span: 5,
              parts: [
                {
                  t: "blank",
                  row: "B-010",
                },
              ],
              align: "center",
            },
          ],
        },
        {
          minMm: 18.61,
          cells: [
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-011",
                },
              ],
              align: "center",
            },
            {
              span: 5,
              parts: [
                {
                  t: "options",
                  row: "B-011",
                  from: 0,
                  to: 6,
                },
                {
                  t: "break",
                },
                {
                  t: "options",
                  row: "B-011",
                  from: 6,
                  to: 7,
                },
              ],
              align: "center",
            },
          ],
        },
        {
          minMm: 9.74,
          cells: [
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-012",
                },
              ],
              align: "center",
            },
            {
              span: 3,
              parts: [
                {
                  t: "blank",
                  row: "B-012",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-013",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "B-013",
                },
              ],
              align: "center",
            },
          ],
        },
        {
          minMm: 9.74,
          cells: [
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-014",
                },
              ],
              align: "center",
            },
            {
              span: 3,
              parts: [
                {
                  t: "blank",
                  row: "B-014",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-015",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "B-015",
                },
              ],
              align: "center",
            },
          ],
        },
        {
          minMm: 9.47,
          cells: [
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-016",
                },
              ],
              align: "center",
            },
            {
              span: 5,
              parts: [
                {
                  t: "blank",
                  row: "B-016",
                  of: "note",
                },
                {
                  t: "options",
                  row: "B-016",
                  from: 0,
                  to: 5,
                },
              ],
              align: "center",
            },
          ],
        },
        {
          minMm: 9.47,
          cells: [
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-017",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "options",
                  row: "B-017",
                  from: 0,
                  to: 2,
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-018",
                },
              ],
              align: "center",
            },
            {
              span: 3,
              parts: [
                {
                  t: "blank",
                  row: "B-018",
                },
              ],
              align: "center",
            },
          ],
        },
        {
          minMm: 9.47,
          cells: [
            {
              span: 2,
              parts: [
                {
                  t: "label",
                  row: "B-019",
                },
              ],
              align: "center",
            },
            {
              span: 4,
              parts: [
                {
                  t: "options",
                  row: "B-019",
                  from: 0,
                  to: 4,
                },
              ],
              align: "center",
            },
          ],
        },
      ],
    },
    {
      t: "gap",
      paragraphs: 1,
    },
    {
      t: "table",
      id: "T2",
      columnsMm: [32.6, 25.03, 33.06, 33.07, 33.06, 35.72],
      offsetMm: -2.6,
      rows: [
        {
          minMm: 11.02,
          cells: [
            {
              span: 6,
              parts: [
                {
                  t: "heading",
                  row: "B-020",
                },
              ],
              valign: "bottom",
              shaded: true,
              noTop: true,
            },
          ],
        },
        {
          minMm: 8.29,
          cells: [
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-021",
                  pt: 14.0,
                  regular: true,
                },
              ],
              valign: "bottom",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "B-021",
                },
              ],
              valign: "bottom",
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-022",
                  pt: 14.0,
                  regular: true,
                },
              ],
              valign: "bottom",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "B-022",
                },
              ],
              valign: "bottom",
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-023",
                  pt: 14.0,
                  regular: true,
                },
              ],
              valign: "bottom",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "B-023",
                },
              ],
              valign: "bottom",
            },
          ],
        },
        {
          minMm: 8.29,
          cells: [
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-024",
                  pt: 14.0,
                  regular: true,
                },
              ],
              valign: "bottom",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "B-024",
                },
              ],
              valign: "bottom",
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-025",
                  pt: 14.0,
                  regular: true,
                },
              ],
              valign: "bottom",
            },
            {
              span: 3,
              parts: [
                {
                  t: "options",
                  row: "B-025",
                  from: 0,
                  to: 3,
                },
              ],
              align: "center",
              valign: "bottom",
            },
          ],
        },
      ],
    },
    {
      t: "gap",
      paragraphs: 1,
    },
    {
      t: "table",
      id: "T3",
      columnsMm: [32.6, 15.52, 9.51, 33.06, 5.57, 27.5, 20.64, 12.42, 35.72],
      offsetMm: -2.6,
      rows: [
        {
          minMm: 11.02,
          cells: [
            {
              span: 9,
              parts: [
                {
                  t: "heading",
                  row: "B-026",
                },
              ],
              valign: "bottom",
              shaded: true,
              noTop: true,
            },
          ],
        },
        {
          minMm: 8.29,
          cells: [
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-027",
                  pt: 14.0,
                  regular: true,
                },
              ],
              align: "center",
              valign: "bottom",
            },
            {
              span: 2,
              parts: [
                {
                  t: "blank",
                  row: "B-027",
                },
              ],
              valign: "bottom",
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-028",
                  pt: 14.0,
                  regular: true,
                },
              ],
              align: "center",
              valign: "bottom",
            },
            {
              span: 2,
              parts: [
                {
                  t: "blank",
                  row: "B-028",
                },
              ],
              valign: "bottom",
            },
            {
              span: 2,
              parts: [
                {
                  t: "label",
                  row: "B-029",
                  pt: 14.0,
                  regular: true,
                },
              ],
              align: "center",
              valign: "bottom",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "B-029",
                },
              ],
              valign: "bottom",
            },
          ],
        },
        {
          minMm: 8.29,
          cells: [
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-030",
                  pt: 14.0,
                  regular: true,
                },
              ],
              align: "center",
              valign: "bottom",
            },
            {
              span: 2,
              parts: [
                {
                  t: "blank",
                  row: "B-030",
                },
              ],
              valign: "bottom",
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-031",
                  pt: 14.0,
                  regular: true,
                },
              ],
              align: "center",
              valign: "bottom",
            },
            {
              span: 2,
              parts: [
                {
                  t: "blank",
                  row: "B-031",
                },
              ],
              valign: "bottom",
            },
            {
              span: 2,
              parts: [
                {
                  t: "label",
                  row: "B-032",
                  pt: 14.0,
                  regular: true,
                },
              ],
              align: "center",
              valign: "bottom",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "B-032",
                },
              ],
              valign: "bottom",
            },
          ],
        },
        {
          minMm: 8.29,
          cells: [
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-033",
                  pt: 14.0,
                  regular: true,
                },
              ],
              align: "center",
              valign: "bottom",
            },
            {
              span: 3,
              parts: [
                {
                  t: "options",
                  row: "B-033",
                  from: 0,
                  to: 2,
                },
              ],
              valign: "bottom",
            },
            {
              span: 2,
              parts: [
                {
                  t: "label",
                  row: "B-034",
                  pt: 14.0,
                  regular: true,
                },
              ],
              valign: "bottom",
            },
            {
              span: 3,
              parts: [
                {
                  t: "options",
                  row: "B-034",
                  from: 0,
                  to: 2,
                },
              ],
              valign: "bottom",
            },
          ],
        },
        {
          minMm: 8.29,
          cells: [
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-035",
                  pt: 14.0,
                  regular: true,
                },
              ],
              align: "center",
              valign: "bottom",
            },
            {
              span: 3,
              parts: [
                {
                  t: "options",
                  row: "B-035",
                  from: 0,
                  to: 2,
                },
              ],
              valign: "bottom",
            },
            {
              span: 2,
              parts: [
                {
                  t: "label",
                  row: "B-036",
                  pt: 14.0,
                  regular: true,
                },
              ],
              valign: "bottom",
            },
            {
              span: 3,
              parts: [
                {
                  t: "options",
                  row: "B-036",
                  from: 0,
                  to: 2,
                },
              ],
              valign: "bottom",
            },
          ],
        },
        {
          minMm: 8.29,
          cells: [
            {
              span: 9,
              parts: [
                {
                  t: "heading",
                  row: "B-037",
                },
              ],
              valign: "bottom",
              shaded: true,
            },
          ],
        },
        {
          minMm: 8.29,
          cells: [
            {
              span: 2,
              stacked: true,
              parts: [
                {
                  t: "options",
                  row: "B-038",
                  from: 0,
                  to: 5,
                },
              ],
              align: "center",
            },
            {
              span: 3,
              stacked: true,
              parts: [
                {
                  t: "options",
                  row: "B-038",
                  from: 5,
                  to: 10,
                },
              ],
              align: "center",
            },
            {
              span: 2,
              stacked: true,
              parts: [
                {
                  t: "options",
                  row: "B-038",
                  from: 10,
                  to: 15,
                },
              ],
              align: "center",
            },
            {
              span: 2,
              stacked: true,
              parts: [
                {
                  t: "options",
                  row: "B-038",
                  from: 15,
                  to: 20,
                },
              ],
              align: "center",
            },
          ],
        },
      ],
    },
    {
      t: "pageBreak",
    },
    {
      t: "table",
      id: "T4",
      columnsMm: [37.5, 55.0, 52.51, 47.52],
      offsetMm: -2.6,
      rows: [
        {
          minMm: 12.24,
          cells: [
            {
              span: 4,
              parts: [
                {
                  t: "heading",
                  row: "B-039",
                },
              ],
              shaded: true,
              noTop: true,
            },
          ],
        },
        {
          minMm: 39.79,
          cells: [
            {
              span: 1,
              stacked: true,
              parts: [
                {
                  t: "options",
                  row: "B-040",
                  from: 0,
                  to: 4,
                },
              ],
              align: "center",
            },
            {
              span: 1,
              stacked: true,
              parts: [
                {
                  t: "options",
                  row: "B-040",
                  from: 4,
                  to: 8,
                },
              ],
              align: "center",
            },
            {
              span: 1,
              stacked: true,
              parts: [
                {
                  t: "options",
                  row: "B-040",
                  from: 8,
                  to: 12,
                },
              ],
              align: "center",
            },
            {
              span: 1,
              stacked: true,
              parts: [
                {
                  t: "options",
                  row: "B-040",
                  from: 12,
                  to: 16,
                },
              ],
              align: "center",
            },
          ],
        },
      ],
    },
    {
      t: "gap",
      paragraphs: 1,
    },
    {
      t: "table",
      id: "T5",
      columnsMm: [32.49, 77.52, 32.49, 50.02],
      offsetMm: -2.7,
      rows: [
        {
          minMm: 2.42,
          cells: [
            {
              span: 4,
              parts: [
                {
                  t: "heading",
                  row: "B-041",
                },
              ],
              shaded: true,
              noTop: true,
            },
          ],
        },
        {
          minMm: 2.42,
          cells: [
            {
              span: 4,
              parts: [
                {
                  t: "label",
                  row: "B-042",
                  inline: true,
                },
                {
                  t: "blank",
                  row: "B-042",
                  of: "note",
                },
                {
                  t: "options",
                  row: "B-042",
                  from: 0,
                  to: 2,
                },
              ],
            },
          ],
        },
        {
          minMm: 2.42,
          cells: [
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-043",
                },
              ],
            },
            {
              span: 3,
              parts: [
                {
                  t: "blank",
                  row: "B-043",
                  of: "note",
                },
                {
                  t: "options",
                  row: "B-043",
                  from: 0,
                  to: 4,
                },
              ],
            },
          ],
        },
        {
          minMm: 2.42,
          cells: [
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-044",
                },
              ],
            },
            {
              span: 3,
              parts: [
                {
                  t: "options",
                  row: "B-044",
                  from: 0,
                  to: 6,
                },
              ],
            },
          ],
        },
        {
          minMm: 2.42,
          cells: [
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-045",
                },
              ],
            },
            {
              span: 3,
              parts: [
                {
                  t: "options",
                  row: "B-045",
                  from: 0,
                  to: 6,
                },
              ],
              align: "center",
            },
          ],
        },
        {
          minMm: 2.42,
          cells: [
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-046",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "options",
                  row: "B-046",
                  from: 0,
                  to: 3,
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-047",
                  pt: 14.0,
                  inline: true,
                },
                {
                  t: "blank",
                  row: "B-047",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-048",
                  pt: 14.0,
                  inline: true,
                },
                {
                  t: "blank",
                  row: "B-048",
                },
              ],
            },
          ],
        },
        {
          minMm: 2.42,
          cells: [
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-049",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "B-049",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-050",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "B-050",
                },
              ],
            },
          ],
        },
        {
          minMm: 2.42,
          cells: [
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-051",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "B-051",
                },
                {
                  t: "label",
                  row: "B-052",
                  inline: true,
                },
                {
                  t: "blank",
                  row: "B-052",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-053",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "B-053",
                },
              ],
              align: "center",
            },
          ],
        },
        {
          minMm: 2.42,
          cells: [
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-054",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "B-054",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-055",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "B-055",
                },
              ],
            },
          ],
        },
        {
          minMm: 2.03,
          cells: [
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-056",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "options",
                  row: "B-056",
                  pt: 16.0,
                  from: 0,
                  to: 2,
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-057",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "B-057",
                },
              ],
            },
          ],
        },
        {
          minMm: 2.03,
          cells: [
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-058",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "options",
                  row: "B-058",
                  pt: 16.0,
                  from: 0,
                  to: 2,
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-059",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "B-059",
                },
              ],
            },
          ],
        },
        {
          minMm: 2.03,
          cells: [
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-060",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "options",
                  row: "B-060",
                  from: 0,
                  to: 3,
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-061",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "B-061",
                },
              ],
            },
          ],
        },
        {
          minMm: 2.03,
          cells: [
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-062",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "B-062",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-063",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "B-063",
                },
              ],
            },
          ],
        },
        {
          minMm: 2.03,
          cells: [
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-064",
                },
              ],
            },
            {
              span: 3,
              parts: [
                {
                  t: "options",
                  row: "B-064",
                  from: 0,
                  to: 4,
                },
              ],
              align: "center",
            },
          ],
        },
        {
          minMm: 2.03,
          cells: [
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-065",
                },
              ],
            },
            {
              span: 3,
              parts: [
                {
                  t: "options",
                  row: "B-065",
                  from: 0,
                  to: 4,
                },
              ],
            },
          ],
        },
        {
          minMm: 2.03,
          cells: [
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-066",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "options",
                  row: "B-066",
                  from: 0,
                  to: 2,
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-067",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "options",
                  row: "B-067",
                  from: 0,
                  to: 2,
                },
              ],
              align: "center",
            },
          ],
        },
        {
          minMm: 2.03,
          cells: [
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-068",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "B-068",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "B-069",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "B-069",
                },
              ],
              align: "center",
            },
          ],
        },
        {
          minMm: 14.73,
          cells: [
            {
              span: 2,
              parts: [
                {
                  t: "label",
                  row: "B-070",
                  regular: true,
                  inline: true,
                },
                {
                  t: "blank",
                  row: "B-070",
                },
              ],
              open: true,
            },
            {
              span: 2,
              parts: [
                {
                  t: "signature",
                  row: "B-071",
                },
              ],
              align: "end",
              open: true,
            },
          ],
        },
      ],
    },
    {
      t: "pageBreak",
    },
    {
      t: "residents",
      id: "T6",
      columnsMm: [17.5, 65.0, 67.52, 42.51],
      offsetMm: -2.7,
      heading: "B-072",
      columns: ["B-073", "B-074", "B-075", "B-076"],
      lines: 26,
      titleMinMm: 1.38,
      headMinMm: 1.38,
      lineMinMm: 8.71,
    },
  ],
};
