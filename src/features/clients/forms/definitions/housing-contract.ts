// Written from docs/checker/data/06-home-contract.json (the Checker's extraction of his Word file) and kept by hand since.
// definitions.test.ts fails when a label, an option, its order or its tick-box side differs from that file.
import type { FormDefinition } from "../types";

export const HOUSING_CONTRACT: FormDefinition = {
  kind: "HOUSING_CONTRACT",
  checker: {
    prefix: "HC",
    file: "06-home-contract",
  },
  family: "HOUSING",
  registrationSuffix: null,
  titleBox: {
    leftMm: 57.08,
    topMm: 0.83,
    widthMm: 136.23,
    heightMm: 14.69,
  },
  rows: [
    {
      id: "HC-001",
      role: "title",
      raw: "نوع الخدمة : عقد (سكن)",
      label: "نوع الخدمة : عقد (سكن)",
      number: null,
      key: null,
      answer: null,
    },
    {
      id: "HC-002",
      role: "number",
      raw: "رقـــم التســجــيـــل:",
      label: "رقم التسجيل",
      number: null,
      key: "registrationNumber",
      answer: "text",
      blankParts: 2,
    },
    {
      id: "HC-003",
      role: "date",
      raw: "التاريخ:",
      label: "التاريخ",
      number: null,
      key: "registrationDate",
      answer: "date",
      blankParts: 3,
    },
    {
      id: "HC-004",
      role: "heading",
      raw: "المعلومات الأساسية للسكن",
      label: "المعلومات الأساسية للسكن",
      number: "1-",
      key: null,
      answer: null,
    },
    {
      id: "HC-005",
      role: "field",
      raw: "رقم الملف",
      label: "رقم الملف",
      number: "1.",
      key: "dossierNumber",
      answer: "text",
    },
    {
      id: "HC-006",
      role: "field",
      raw: "رقم الباب",
      label: "رقم الباب",
      number: null,
      key: "siteNumber",
      answer: "text",
    },
    {
      id: "HC-007",
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
      id: "HC-008",
      role: "choice",
      raw: "نوع العقار",
      label: "نوع العقار",
      number: "3.",
      key: "propertyType",
      answer: "single",
      list: "PROPERTY_TYPE_HOUSING",
      otherKey: "propertyTypeOther",
      options: [
        {
          raw: "منزل",
          side: "before",
        },
        {
          raw: "شقة",
          side: "before",
        },
        {
          raw: "دوبلكس",
          side: "before",
        },
        {
          raw: "فيلا",
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
      id: "HC-009",
      role: "field",
      raw: "اللقب والاسم",
      label: "اللقب والاسم",
      number: "4.",
      key: "clientName",
      answer: "text",
    },
    {
      id: "HC-010",
      role: "choice",
      raw: "ملكية العقار",
      label: "ملكية العقار",
      number: null,
      key: "ownership",
      answer: "single",
      list: "OWNERSHIP",
      options: [
        {
          raw: "ملك",
          side: "after",
        },
        {
          raw: "مسأجر",
          side: "after",
          printAs: "مستأجر",
        },
      ],
    },
    {
      id: "HC-011",
      role: "field",
      raw: "العنوان مدقق",
      label: "العنوان مدقق",
      number: "5.",
      key: "address",
      answer: "text",
    },
    {
      id: "HC-012",
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
      id: "HC-013",
      role: "field",
      raw: "اسم المتداول",
      label: "اسم المتداول",
      number: "6.",
      key: "commonName",
      answer: "text",
    },
    {
      id: "HC-014",
      role: "field",
      raw: "رقم الهاتف",
      label: "رقم الهاتف",
      number: "7.",
      key: "phone",
      answer: "phone",
      prefix: "(01):",
    },
    {
      id: "HC-015",
      role: "field",
      raw: "تاريخ الزيارة",
      label: "تاريخ الزيارة",
      number: null,
      key: "firstVisitDate",
      answer: "date",
    },
    {
      id: "HC-016",
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
      id: "HC-017",
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
      id: "HC-018",
      role: "field",
      raw: "اسم المكان",
      label: "اسم المكان",
      number: null,
      key: "storagePlace",
      answer: "text",
    },
    {
      id: "HC-019",
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
      id: "HC-020",
      role: "heading",
      raw: "الوصف الفني للموقع",
      label: "الوصف الفني للموقع",
      number: "2-",
      key: null,
      answer: null,
    },
    {
      id: "HC-021",
      role: "field",
      raw: "مساحة البناء",
      label: "مساحة البناء",
      number: null,
      key: "buildArea",
      answer: "area",
      suffix: "م2",
    },
    {
      id: "HC-022",
      role: "field",
      raw: "عدد الطوابق",
      label: "عدد الطوابق",
      number: null,
      key: "floors",
      answer: "number",
    },
    {
      id: "HC-023",
      role: "field",
      raw: "عدد الغرف",
      label: "عدد الغرف",
      number: null,
      key: "rooms",
      answer: "number",
    },
    {
      id: "HC-024",
      role: "field",
      raw: "عدد المجالس",
      label: "عدد المجالس",
      number: null,
      key: "majlis",
      answer: "number",
    },
    {
      id: "HC-025",
      role: "field",
      raw: "عدد الصالونات",
      label: "عدد الصالونات",
      number: null,
      key: "salons",
      answer: "number",
    },
    {
      id: "HC-026",
      role: "field",
      raw: "عدد المطابخ",
      label: "عدد المطابخ",
      number: null,
      key: "kitchens",
      answer: "number",
    },
    {
      id: "HC-027",
      role: "field",
      raw: "عدد الحمامات",
      label: "عدد الحمامات",
      number: null,
      key: "bathrooms",
      answer: "number",
    },
    {
      id: "HC-028",
      role: "field",
      raw: "عدد الشرفات",
      label: "عدد الشرفات",
      number: null,
      key: "balconies",
      answer: "number",
    },
    {
      id: "HC-029",
      role: "field",
      raw: "عدد النوافذ",
      label: "عدد النوافذ",
      number: null,
      key: "windows",
      answer: "number",
    },
    {
      id: "HC-030",
      role: "field",
      raw: "نوع الأرضيات",
      label: "نوع الأرضيات",
      number: null,
      key: "floorType",
      answer: "text",
    },
    {
      id: "HC-031",
      role: "field",
      raw: "مساحة الحديقة",
      label: "مساحة الحديقة",
      number: null,
      key: "gardenArea",
      answer: "area",
    },
    {
      id: "HC-032",
      role: "field",
      raw: "مساحة الفناء",
      label: "مساحة الفناء",
      number: null,
      key: "courtyardArea",
      answer: "area",
    },
    {
      id: "HC-033",
      role: "heading",
      raw: "الخدمات المقدمة",
      label: "الخدمات المقدمة",
      number: "3-",
      key: null,
      answer: null,
    },
    {
      id: "HC-034",
      role: "choice",
      raw: "",
      label: "",
      number: null,
      key: "providedServices",
      answer: "several",
      list: "PROVIDED_SERVICE",
      freeKey: "providedServicesCustom",
      options: [
        {
          raw: "تنظيف الأرضيات",
          side: "after",
        },
        {
          raw: "تنظيف المطبخ",
          side: "after",
        },
        {
          raw: "تنظيف الستائر",
          side: "after",
        },
        {
          raw: "تنظيف النوافذ",
          side: "after",
        },
        {
          raw: "تنظيف الأسقف",
          side: "after",
        },
        {
          raw: "تنظيف الثلاجة",
          side: "after",
        },
        {
          raw: "تنظيف الحمامات",
          side: "after",
        },
        {
          raw: "",
          free: true,
          side: "after",
        },
        {
          raw: "تنظيف الزجاج",
          side: "after",
        },
        {
          raw: "تنظيف الفرن",
          side: "after",
        },
        {
          raw: "تنظيف السجاد",
          side: "after",
        },
        {
          raw: "",
          free: true,
          side: "after",
        },
        {
          raw: "تنظيف الخزائن",
          side: "after",
        },
        {
          raw: "تنظيف غرف الأطفال",
          side: "after",
        },
        {
          raw: "تنظيف المرآب",
          side: "after",
        },
        {
          raw: "",
          free: true,
          side: "after",
        },
      ],
      flags: ["options-without-label"],
    },
    {
      id: "HC-035",
      role: "heading",
      raw: "نوع الخدمة المبرمجة",
      label: "نوع الخدمة المبرمجة",
      number: "4-",
      key: null,
      answer: null,
    },
    {
      id: "HC-036",
      role: "choice",
      raw: "",
      label: "",
      number: null,
      key: "programmedServices",
      answer: "several",
      list: "PROGRAMMED_SERVICE",
      freeKey: "programmedServicesCustom",
      options: [
        {
          raw: "تنظيف دوري",
          side: "after",
        },
        {
          raw: "تنظيف بعد البناء",
          side: "after",
        },
        {
          raw: "تنظيف بعد الترميم",
          side: "after",
        },
        {
          raw: "تنظيف بعد الولائم",
          side: "after",
        },
        {
          raw: "تنظيف شامل",
          side: "after",
        },
        {
          raw: "تنظيف غ..الضيوف",
          side: "after",
        },
        {
          raw: "تنظيف بعد السفر",
          side: "after",
        },
        {
          raw: "تنظيف رمضان",
          side: "after",
        },
        {
          raw: "إزالة المخلفات",
          side: "after",
        },
        {
          raw: "تنظيف قبل المناسبات",
          side: "after",
        },
        {
          raw: "تنظيف بعد المناسبات",
          side: "after",
        },
        {
          raw: "تنظيف عميق",
          side: "after",
        },
      ],
      flags: ["options-without-label"],
    },
    {
      id: "HC-037",
      role: "heading",
      raw: "الدراسة المالية",
      label: "الدراسة المالية",
      number: "5-",
      key: null,
      answer: null,
    },
    {
      id: "HC-038",
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
      id: "HC-039",
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
      id: "HC-040",
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
      id: "HC-041",
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
      id: "HC-042",
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
      id: "HC-043",
      role: "field",
      raw: "من:",
      label: "من",
      number: null,
      key: "periodFrom",
      answer: "time",
      flags: ["label-inside-value-cell"],
    },
    {
      id: "HC-044",
      role: "field",
      raw: "إلى:",
      label: "إلى",
      number: null,
      key: "periodTo",
      answer: "time",
      flags: ["label-inside-value-cell"],
    },
    {
      id: "HC-045",
      role: "field",
      raw: "تاريخ البداية",
      label: "تاريخ البداية",
      number: "6.",
      key: "startDate",
      answer: "date",
    },
    {
      id: "HC-046",
      role: "field",
      raw: "تاريخ النهاية",
      label: "تاريخ النهاية",
      number: null,
      key: "endDate",
      answer: "date",
    },
    {
      id: "HC-047",
      role: "field",
      raw: "وقت الوصول",
      label: "وقت الوصول",
      number: "7.",
      key: "arrivalTime",
      answer: "time",
    },
    {
      id: "HC-048",
      role: "field",
      raw: "المغادرة:",
      label: "المغادرة",
      number: null,
      key: "departureTime",
      answer: "time",
      flags: ["label-inside-value-cell"],
    },
    {
      id: "HC-049",
      role: "field",
      raw: "عدد العمال",
      label: "عدد العمال",
      number: null,
      key: "workersCount",
      answer: "number",
    },
    {
      id: "HC-050",
      role: "field",
      raw: "مسدد أتعاب",
      label: "مسدد أتعاب",
      number: "8.",
      key: "payerName",
      answer: "text",
    },
    {
      id: "HC-051",
      role: "field",
      raw: "رقم الهاتف",
      label: "رقم الهاتف",
      number: null,
      key: "payerPhone",
      answer: "phone",
    },
    {
      id: "HC-052",
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
      id: "HC-053",
      role: "field",
      raw: "مصاريفها",
      label: "مصاريفها",
      number: null,
      key: "materialsAmount",
      answer: "money",
      suffix: "دج",
    },
    {
      id: "HC-054",
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
      id: "HC-055",
      role: "field",
      raw: "مصاريفها",
      label: "مصاريفها",
      number: null,
      key: "transportAmount",
      answer: "money",
      suffix: "دج",
    },
    {
      id: "HC-056",
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
      id: "HC-057",
      role: "field",
      raw: "المبلغ إجمالي",
      label: "المبلغ إجمالي",
      number: null,
      key: "totalAmount",
      answer: "money",
      suffix: "دج",
    },
    {
      id: "HC-058",
      role: "field",
      raw: "تاريخ تسديد",
      label: "تاريخ تسديد",
      number: "12.",
      key: "firstDueDate",
      answer: "date",
    },
    {
      id: "HC-059",
      role: "field",
      raw: "مكان التسديد",
      label: "مكان التسديد",
      number: null,
      key: "paymentPlace",
      answer: "text",
    },
    {
      id: "HC-060",
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
      id: "HC-061",
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
      id: "HC-062",
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
      id: "HC-063",
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
      id: "HC-064",
      role: "field",
      raw: "اسمه ولقبه",
      label: "اسمه ولقبه",
      number: "16.",
      key: "guardName",
      answer: "text",
    },
    {
      id: "HC-065",
      role: "field",
      raw: "رقم الهاتف",
      label: "رقم الهاتف",
      number: null,
      key: "guardPhone",
      answer: "phone",
    },
    {
      id: "HC-066",
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
      id: "HC-067",
      role: "signature",
      raw: "الإمضـــــاء والخـــــتم",
      label: "الإمضاء والختم",
      number: null,
      key: null,
      answer: null,
    },
  ],
  sheet: [
    {
      t: "header",
    },
    {
      t: "table",
      id: "T1",
      columnsMm: [32.49, 0.11, 15.52, 9.51, 7.37, 25.68, 1.82, 3.76, 13.76, 13.74, 18.75, 1.89, 12.42, 35.72],
      offsetMm: -0.79,
      rows: [
        {
          minMm: 1.38,
          cells: [
            {
              span: 14,
              parts: [
                {
                  t: "heading",
                  row: "HC-004",
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
                  row: "HC-005",
                },
              ],
            },
            {
              span: 8,
              parts: [
                {
                  t: "blank",
                  row: "HC-005",
                },
              ],
              align: "center",
            },
            {
              span: 2,
              parts: [
                {
                  t: "label",
                  row: "HC-006",
                },
              ],
              align: "center",
            },
            {
              span: 3,
              parts: [
                {
                  t: "blank",
                  row: "HC-006",
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
                  row: "HC-007",
                },
              ],
            },
            {
              span: 13,
              parts: [
                {
                  t: "options",
                  row: "HC-007",
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
                  row: "HC-008",
                },
              ],
            },
            {
              span: 13,
              parts: [
                {
                  t: "options",
                  row: "HC-008",
                  from: 0,
                  to: 5,
                },
              ],
            },
          ],
        },
        {
          minMm: 8.04,
          cells: [
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "HC-009",
                },
              ],
            },
            {
              span: 8,
              parts: [
                {
                  t: "blank",
                  row: "HC-009",
                },
              ],
              align: "center",
            },
            {
              span: 2,
              parts: [
                {
                  t: "label",
                  row: "HC-010",
                },
              ],
              align: "center",
            },
            {
              span: 3,
              parts: [
                {
                  t: "options",
                  row: "HC-010",
                  from: 0,
                  to: 2,
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
                  row: "HC-011",
                },
              ],
            },
            {
              span: 8,
              parts: [
                {
                  t: "blank",
                  row: "HC-011",
                },
              ],
              align: "center",
            },
            {
              span: 2,
              parts: [
                {
                  t: "label",
                  row: "HC-012",
                },
              ],
              align: "center",
            },
            {
              span: 3,
              parts: [
                {
                  t: "blank",
                  row: "HC-012",
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
                  row: "HC-013",
                },
              ],
            },
            {
              span: 13,
              parts: [
                {
                  t: "blank",
                  row: "HC-013",
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
                  row: "HC-014",
                },
              ],
            },
            {
              span: 8,
              parts: [
                {
                  t: "blank",
                  row: "HC-014",
                },
              ],
              align: "center",
            },
            {
              span: 2,
              parts: [
                {
                  t: "label",
                  row: "HC-015",
                },
              ],
              align: "center",
            },
            {
              span: 3,
              parts: [
                {
                  t: "blank",
                  row: "HC-015",
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
                  row: "HC-016",
                },
              ],
            },
            {
              span: 13,
              parts: [
                {
                  t: "blank",
                  row: "HC-016",
                  of: "note",
                },
                {
                  t: "options",
                  row: "HC-016",
                  from: 0,
                  to: 5,
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
                  row: "HC-017",
                },
              ],
              align: "center",
            },
            {
              span: 4,
              parts: [
                {
                  t: "options",
                  row: "HC-017",
                  from: 0,
                  to: 2,
                },
              ],
            },
            {
              span: 2,
              parts: [
                {
                  t: "label",
                  row: "HC-018",
                },
              ],
              align: "center",
            },
            {
              span: 7,
              parts: [
                {
                  t: "blank",
                  row: "HC-018",
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
              span: 5,
              parts: [
                {
                  t: "label",
                  row: "HC-019",
                },
              ],
            },
            {
              span: 9,
              parts: [
                {
                  t: "options",
                  row: "HC-019",
                  from: 0,
                  to: 4,
                },
              ],
              align: "center",
            },
          ],
        },
        {
          minMm: 11.02,
          cells: [
            {
              span: 14,
              parts: [
                {
                  t: "heading",
                  row: "HC-020",
                },
              ],
              shaded: true,
            },
          ],
        },
        {
          minMm: 8.29,
          cells: [
            {
              span: 2,
              parts: [
                {
                  t: "label",
                  row: "HC-021",
                  regular: true,
                },
              ],
              align: "center",
            },
            {
              span: 2,
              parts: [
                {
                  t: "blank",
                  row: "HC-021",
                },
              ],
              align: "center",
            },
            {
              span: 2,
              parts: [
                {
                  t: "label",
                  row: "HC-022",
                  regular: true,
                },
              ],
              align: "center",
            },
            {
              span: 4,
              parts: [
                {
                  t: "blank",
                  row: "HC-022",
                },
              ],
              align: "center",
            },
            {
              span: 3,
              parts: [
                {
                  t: "label",
                  row: "HC-023",
                  regular: true,
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "HC-023",
                },
              ],
              align: "center",
            },
          ],
        },
        {
          minMm: 8.29,
          cells: [
            {
              span: 2,
              parts: [
                {
                  t: "label",
                  row: "HC-024",
                  regular: true,
                },
              ],
              align: "center",
            },
            {
              span: 2,
              parts: [
                {
                  t: "blank",
                  row: "HC-024",
                },
              ],
              align: "center",
            },
            {
              span: 2,
              parts: [
                {
                  t: "label",
                  row: "HC-025",
                  regular: true,
                },
              ],
              align: "center",
            },
            {
              span: 4,
              parts: [
                {
                  t: "blank",
                  row: "HC-025",
                },
              ],
              align: "center",
            },
            {
              span: 3,
              parts: [
                {
                  t: "label",
                  row: "HC-026",
                  regular: true,
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "HC-026",
                },
              ],
              align: "center",
            },
          ],
        },
        {
          minMm: 8.29,
          cells: [
            {
              span: 2,
              parts: [
                {
                  t: "label",
                  row: "HC-027",
                  regular: true,
                },
              ],
              align: "center",
            },
            {
              span: 2,
              parts: [
                {
                  t: "blank",
                  row: "HC-027",
                },
              ],
              align: "center",
            },
            {
              span: 2,
              parts: [
                {
                  t: "label",
                  row: "HC-028",
                  regular: true,
                },
              ],
              align: "center",
            },
            {
              span: 4,
              parts: [
                {
                  t: "blank",
                  row: "HC-028",
                },
              ],
              align: "center",
            },
            {
              span: 3,
              parts: [
                {
                  t: "label",
                  row: "HC-029",
                  regular: true,
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "HC-029",
                },
              ],
              align: "center",
            },
          ],
        },
        {
          minMm: 8.29,
          cells: [
            {
              span: 2,
              parts: [
                {
                  t: "label",
                  row: "HC-030",
                  regular: true,
                },
              ],
              align: "center",
            },
            {
              span: 2,
              parts: [
                {
                  t: "blank",
                  row: "HC-030",
                },
              ],
              align: "center",
            },
            {
              span: 2,
              parts: [
                {
                  t: "label",
                  row: "HC-031",
                  regular: true,
                },
              ],
              align: "center",
            },
            {
              span: 4,
              parts: [
                {
                  t: "blank",
                  row: "HC-031",
                },
              ],
              align: "center",
            },
            {
              span: 3,
              parts: [
                {
                  t: "label",
                  row: "HC-032",
                  regular: true,
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "HC-032",
                },
              ],
              align: "center",
            },
          ],
        },
        {
          minMm: 8.29,
          cells: [
            {
              span: 14,
              parts: [
                {
                  t: "heading",
                  row: "HC-033",
                },
              ],
              shaded: true,
            },
          ],
        },
        {
          minMm: 38.33,
          cells: [
            {
              span: 3,
              stacked: true,
              parts: [
                {
                  t: "options",
                  row: "HC-034",
                  from: 0,
                  to: 4,
                },
              ],
              align: "center",
            },
            {
              span: 5,
              stacked: true,
              parts: [
                {
                  t: "options",
                  row: "HC-034",
                  from: 4,
                  to: 8,
                },
              ],
              align: "center",
            },
            {
              span: 4,
              stacked: true,
              parts: [
                {
                  t: "options",
                  row: "HC-034",
                  from: 8,
                  to: 12,
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
                  row: "HC-034",
                  from: 12,
                  to: 16,
                },
              ],
              align: "center",
            },
          ],
        },
        {
          minMm: 9.63,
          cells: [
            {
              span: 14,
              parts: [
                {
                  t: "heading",
                  row: "HC-035",
                },
              ],
              shaded: true,
            },
          ],
        },
        {
          minMm: 29.74,
          cells: [
            {
              span: 3,
              stacked: true,
              parts: [
                {
                  t: "options",
                  row: "HC-036",
                  from: 0,
                  to: 3,
                },
              ],
              align: "center",
            },
            {
              span: 5,
              stacked: true,
              parts: [
                {
                  t: "options",
                  row: "HC-036",
                  from: 3,
                  to: 6,
                },
              ],
              align: "center",
            },
            {
              span: 4,
              stacked: true,
              parts: [
                {
                  t: "options",
                  row: "HC-036",
                  from: 6,
                  to: 9,
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
                  row: "HC-036",
                  from: 9,
                  to: 12,
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
      id: "T2",
      columnsMm: [32.49, 77.52, 32.49, 50.02],
      offsetMm: -0.79,
      rows: [
        {
          minMm: 2.42,
          cells: [
            {
              span: 4,
              parts: [
                {
                  t: "heading",
                  row: "HC-037",
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
                  row: "HC-038",
                  inline: true,
                },
                {
                  t: "blank",
                  row: "HC-038",
                  of: "note",
                },
                {
                  t: "options",
                  row: "HC-038",
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
                  row: "HC-039",
                },
              ],
            },
            {
              span: 3,
              parts: [
                {
                  t: "blank",
                  row: "HC-039",
                  of: "note",
                },
                {
                  t: "options",
                  row: "HC-039",
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
                  row: "HC-040",
                },
              ],
            },
            {
              span: 3,
              parts: [
                {
                  t: "options",
                  row: "HC-040",
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
                  row: "HC-041",
                },
              ],
            },
            {
              span: 3,
              parts: [
                {
                  t: "options",
                  row: "HC-041",
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
                  row: "HC-042",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "options",
                  row: "HC-042",
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
                  row: "HC-043",
                  pt: 14.0,
                  inline: true,
                },
                {
                  t: "blank",
                  row: "HC-043",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "HC-044",
                  pt: 14.0,
                  inline: true,
                },
                {
                  t: "blank",
                  row: "HC-044",
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
                  row: "HC-045",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "HC-045",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "HC-046",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "HC-046",
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
                  row: "HC-047",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "HC-047",
                },
                {
                  t: "label",
                  row: "HC-048",
                  inline: true,
                },
                {
                  t: "blank",
                  row: "HC-048",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "HC-049",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "HC-049",
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
                  row: "HC-050",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "HC-050",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "HC-051",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "HC-051",
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
                  row: "HC-052",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "options",
                  row: "HC-052",
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
                  row: "HC-053",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "HC-053",
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
                  row: "HC-054",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "options",
                  row: "HC-054",
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
                  row: "HC-055",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "HC-055",
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
                  row: "HC-056",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "options",
                  row: "HC-056",
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
                  row: "HC-057",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "HC-057",
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
                  row: "HC-058",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "HC-058",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "HC-059",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "HC-059",
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
                  row: "HC-060",
                },
              ],
            },
            {
              span: 3,
              parts: [
                {
                  t: "options",
                  row: "HC-060",
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
                  row: "HC-061",
                },
              ],
            },
            {
              span: 3,
              parts: [
                {
                  t: "options",
                  row: "HC-061",
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
                  row: "HC-062",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "options",
                  row: "HC-062",
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
                  row: "HC-063",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "options",
                  row: "HC-063",
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
                  row: "HC-064",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "HC-064",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "HC-065",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "HC-065",
                },
              ],
              align: "center",
            },
          ],
        },
        {
          minMm: 16.17,
          cells: [
            {
              span: 2,
              parts: [
                {
                  t: "label",
                  row: "HC-066",
                  regular: true,
                  inline: true,
                },
                {
                  t: "blank",
                  row: "HC-066",
                },
              ],
              open: true,
            },
            {
              span: 2,
              parts: [
                {
                  t: "signature",
                  row: "HC-067",
                },
              ],
              align: "end",
              open: true,
            },
          ],
        },
      ],
    },
  ],
};
