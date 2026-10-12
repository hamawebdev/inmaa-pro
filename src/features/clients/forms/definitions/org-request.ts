// Written from docs/checker/data/03-org-request.json (the Checker's extraction of his Word file) and kept by hand since.
// definitions.test.ts fails when a label, an option, its order or its tick-box side differs from that file.
import type { FormDefinition } from "../types";

export const ORG_REQUEST: FormDefinition = {
  kind: "ORG_REQUEST",
  checker: {
    prefix: "OR",
    file: "03-org-request",
  },
  family: "ORGANISATION",
  registrationSuffix: null,
  titleBox: {
    leftMm: 57.08,
    topMm: 0.83,
    widthMm: 136.23,
    heightMm: 12.29,
  },
  rows: [
    {
      id: "OR-001",
      role: "title",
      raw: "نوع الخدمة : عند الطلب (مؤسسة)",
      label: "نوع الخدمة : عند الطلب (مؤسسة)",
      number: null,
      key: null,
      answer: null,
    },
    {
      id: "OR-002",
      role: "number",
      raw: "رقـــم التســجــيـــل:",
      label: "رقم التسجيل",
      number: null,
      key: "registrationNumber",
      answer: "text",
      blankParts: 2,
    },
    {
      id: "OR-003",
      role: "date",
      raw: "التاريخ:",
      label: "التاريخ",
      number: null,
      key: "registrationDate",
      answer: "date",
      blankParts: 3,
    },
    {
      id: "OR-004",
      role: "heading",
      raw: "المعلومات الأساسية للمؤسسة",
      label: "المعلومات الأساسية للمؤسسة",
      number: "1-",
      key: null,
      answer: null,
    },
    {
      id: "OR-005",
      role: "field",
      raw: "رقم الملف",
      label: "رقم الملف",
      number: "1.",
      key: "dossierNumber",
      answer: "text",
    },
    {
      id: "OR-006",
      role: "field",
      raw: "رقم المؤسسة",
      label: "رقم المؤسسة",
      number: null,
      key: "siteNumber",
      answer: "text",
    },
    {
      id: "OR-007",
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
      id: "OR-008",
      role: "choice",
      raw: "نوع العقار",
      label: "نوع العقار",
      number: "3.",
      key: "propertyType",
      answer: "single",
      list: "PROPERTY_TYPE_ORGANISATION",
      options: [
        {
          raw: "محل صغير",
          side: "after",
        },
        {
          raw: "كبير",
          side: "after",
        },
        {
          raw: "شركة",
          side: "after",
        },
        {
          raw: "F2",
          side: "after",
        },
        {
          raw: "F3",
          side: "after",
        },
        {
          raw: "F4",
          side: "after",
        },
        {
          raw: "F5",
          side: "after",
        },
        {
          raw: "أخرى",
          side: "after",
        },
      ],
    },
    {
      id: "OR-009",
      role: "field",
      raw: "مدير/ مسير",
      label: "مدير/ مسير",
      number: "4.",
      key: "managerName",
      answer: "text",
    },
    {
      id: "OR-010",
      role: "choice",
      raw: "السجل التجاري",
      label: "السجل التجاري",
      number: null,
      key: "hasTradeRegister",
      answer: "yesNo",
      list: "YES_NO",
      options: [
        {
          raw: "لا",
          side: "after",
        },
        {
          raw: "نعم",
          side: "after",
        },
      ],
    },
    {
      id: "OR-011",
      role: "field",
      raw: "العنوان مدقق",
      label: "العنوان مدقق",
      number: "5.",
      key: "address",
      answer: "text",
    },
    {
      id: "OR-012",
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
      id: "OR-013",
      role: "field",
      raw: "اسم المتداول",
      label: "اسم المتداول",
      number: "6.",
      key: "commonName",
      answer: "text",
    },
    {
      id: "OR-014",
      role: "field",
      raw: "اسم المؤسسة",
      label: "اسم المؤسسة",
      number: "7.",
      key: "clientName",
      answer: "text",
    },
    {
      id: "OR-015",
      role: "choice",
      raw: "قطاع العمل",
      label: "قطاع العمل",
      number: null,
      key: "sector",
      answer: "single",
      list: "SECTOR",
      options: [
        {
          raw: "عام",
          side: "after",
        },
        {
          raw: "خاص",
          side: "after",
        },
      ],
    },
    {
      id: "OR-016",
      role: "field",
      raw: "رقم الهاتف",
      label: "رقم الهاتف",
      number: "8.",
      key: "phone",
      answer: "phone",
    },
    {
      id: "OR-017",
      role: "field",
      raw: "الزيارة الأولية",
      label: "الزيارة الأولية",
      number: null,
      key: "firstVisitDate",
      answer: "date",
    },
    {
      id: "OR-018",
      role: "choice",
      raw: "تقييم النظافة",
      label: "تقييم النظافة",
      number: "9.",
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
      id: "OR-019",
      role: "choice",
      raw: "تخزين معدات",
      label: "تخزين معدات",
      number: "10.",
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
      id: "OR-020",
      role: "field",
      raw: "اسم المكان",
      label: "اسم المكان",
      number: null,
      key: "storagePlace",
      answer: "text",
    },
    {
      id: "OR-021",
      role: "choice",
      raw: "مكــــــــــان التخـــــلص مــــــن النفايات",
      label: "مكان التخلص من النفايات",
      number: "11.",
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
      id: "OR-022",
      role: "heading",
      raw: "الوصف الفني للموقع",
      label: "الوصف الفني للموقع",
      number: "2-",
      key: null,
      answer: null,
    },
    {
      id: "OR-023",
      role: "field",
      raw: "مساحة البناء",
      label: "مساحة البناء",
      number: null,
      key: "buildArea",
      answer: "area",
    },
    {
      id: "OR-024",
      role: "field",
      raw: "عدد المباني",
      label: "عدد المباني",
      number: null,
      key: "buildings",
      answer: "number",
    },
    {
      id: "OR-025",
      role: "field",
      raw: "عدد المكاتب",
      label: "عدد المكاتب",
      number: null,
      key: "offices",
      answer: "number",
    },
    {
      id: "OR-026",
      role: "field",
      raw: "عدد القاعات",
      label: "عدد القاعات",
      number: null,
      key: "halls",
      answer: "number",
    },
    {
      id: "OR-027",
      role: "field",
      raw: "عدد المخازن",
      label: "عدد المخازن",
      number: null,
      key: "stores",
      answer: "number",
    },
    {
      id: "OR-028",
      role: "field",
      raw: "عدد دورات المياه",
      label: "عدد دورات المياه",
      number: null,
      key: "toilets",
      answer: "number",
    },
    {
      id: "OR-029",
      role: "field",
      raw: "عدد المطابخ",
      label: "عدد المطابخ",
      number: null,
      key: "kitchens",
      answer: "number",
    },
    {
      id: "OR-030",
      role: "field",
      raw: "عدد النوافذ",
      label: "عدد النوافذ",
      number: null,
      key: "windows",
      answer: "number",
    },
    {
      id: "OR-031",
      role: "field",
      raw: "عدد الأبواب",
      label: "عدد الأبواب",
      number: null,
      key: "doors",
      answer: "number",
    },
    {
      id: "OR-032",
      role: "field",
      raw: "مساحة الأرضيات",
      label: "مساحة الأرضيات",
      number: null,
      key: "floorArea",
      answer: "area",
    },
    {
      id: "OR-033",
      role: "field",
      raw: "نوع الأرضيات",
      label: "نوع الأرضيات",
      number: null,
      key: "floorType",
      answer: "text",
    },
    {
      id: "OR-034",
      role: "field",
      raw: "عدد مواقف السيارات",
      label: "عدد مواقف السيارات",
      number: null,
      key: "carParks",
      answer: "number",
    },
    {
      id: "OR-035",
      role: "field",
      raw: "عدد المداخل",
      label: "عدد المداخل",
      number: null,
      key: "entrances",
      answer: "number",
    },
    {
      id: "OR-036",
      role: "field",
      raw: "عدد المخارج",
      label: "عدد المخارج",
      number: null,
      key: "exits",
      answer: "number",
    },
    {
      id: "OR-037",
      role: "field",
      raw: "",
      label: "",
      number: null,
      labelKey: "extraLabel",
      key: "extraValue",
      answer: "text",
      flags: ["blank-without-label"],
    },
    {
      id: "OR-038",
      role: "heading",
      raw: "الخدمات المقدمة",
      label: "الخدمات المقدمة",
      number: "3-",
      key: null,
      answer: null,
    },
    {
      id: "OR-039",
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
          raw: "تنظيف الأثاث",
          side: "after",
        },
        {
          raw: "اللوحات والإعلانات",
          side: "after",
        },
        {
          raw: "",
          free: true,
          side: "none",
        },
        {
          raw: "تنظيف الأسقف",
          side: "after",
        },
        {
          raw: "تنظيف دورات المياه",
          side: "after",
        },
        {
          raw: "تنظيف النوافذ",
          side: "after",
        },
        {
          raw: "جمع وفرز النفايات",
          side: "after",
        },
        {
          raw: "تنظيف الرفوف",
          side: "after",
        },
        {
          raw: "",
          free: true,
          side: "none",
        },
        {
          raw: "تنظيف الزجاج",
          side: "after",
        },
        {
          raw: "تنظيف المكاتب",
          side: "after",
        },
        {
          raw: "تنظيف السجاد",
          side: "after",
        },
        {
          raw: "تنظيف مواقف السيارات",
          side: "after",
        },
        {
          raw: "تنظيف الأجهزة",
          side: "after",
        },
        {
          raw: "",
          free: true,
          side: "none",
          sameLine: true,
        },
        {
          raw: "تنظيف قاعة الاستقبال",
          side: "after",
        },
        {
          raw: "تنظيف قاعات الاجتماعات",
          side: "after",
        },
        {
          raw: "تنظيف المرآب",
          side: "after",
        },
        {
          raw: "تنظيف المخازن",
          side: "after",
        },
        {
          raw: "تنظيف الحدائق",
          side: "after",
        },
        {
          raw: "",
          free: true,
          side: "none",
          sameLine: true,
        },
      ],
      flags: ["options-without-label"],
    },
    {
      id: "OR-040",
      role: "heading",
      raw: "الخدمات المبرمجة",
      label: "الخدمات المبرمجة",
      number: "4-",
      key: null,
      answer: null,
    },
    {
      id: "OR-041",
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
          raw: "",
          free: true,
          side: "none",
        },
        {
          raw: "تنظيف بعد الولائم",
          side: "after",
        },
        {
          raw: "تنظيف شامل وعميق",
          side: "after",
        },
        {
          raw: "تنظيف غ..الضيوف",
          side: "after",
        },
        {
          raw: "",
          free: true,
          side: "none",
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
          raw: "",
          free: true,
          side: "none",
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
          raw: "",
          free: true,
          side: "none",
        },
        {
          raw: "",
          free: true,
          side: "none",
        },
      ],
      flags: ["options-without-label"],
    },
    {
      id: "OR-042",
      role: "heading",
      raw: "الدراسة المالية",
      label: "الدراسة المالية",
      number: "5-",
      key: null,
      answer: null,
    },
    {
      id: "OR-043",
      role: "choice",
      raw: "نــــوع الطلـــب",
      label: "نوع الطلب",
      number: "1.",
      key: "requestKinds",
      answer: "several",
      list: "REQUEST_KIND",
      noteKey: "requestKindNote",
      options: [
        {
          raw: "شامل",
          side: "after",
        },
        {
          raw: "عميق",
          side: "after",
        },
      ],
    },
    {
      id: "OR-044",
      role: "field",
      raw: "مدة التنفيذ",
      label: "مدة التنفيذ",
      number: null,
      key: "executionDurationValue",
      answer: "duration",
      pairKey: "executionDurationUnit",
    },
    {
      id: "OR-045",
      role: "choice",
      raw: "أيام التنفيذ",
      label: "أيام التنفيذ",
      number: "2.",
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
      id: "OR-046",
      role: "choice",
      raw: "تحديد الفترة",
      label: "تحديد الفترة",
      number: "1.",
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
      flags: ["numbering-slip"],
    },
    {
      id: "OR-047",
      role: "field",
      raw: "من:",
      label: "من",
      number: null,
      key: "periodFrom",
      answer: "time",
      flags: ["label-inside-value-cell"],
    },
    {
      id: "OR-048",
      role: "field",
      raw: "إلى:",
      label: "إلى",
      number: null,
      key: "periodTo",
      answer: "time",
      flags: ["label-inside-value-cell"],
    },
    {
      id: "OR-049",
      role: "field",
      raw: "تاريخ البداية",
      label: "تاريخ البداية",
      number: "3.",
      key: "startDate",
      answer: "date",
    },
    {
      id: "OR-050",
      role: "field",
      raw: "تاريخ النهاية",
      label: "تاريخ النهاية",
      number: null,
      key: "endDate",
      answer: "date",
    },
    {
      id: "OR-051",
      role: "field",
      raw: "وقت الوصول",
      label: "وقت الوصول",
      number: "4.",
      key: "arrivalTime",
      answer: "time",
    },
    {
      id: "OR-052",
      role: "field",
      raw: "المغادرة:",
      label: "المغادرة",
      number: null,
      key: "departureTime",
      answer: "time",
      flags: ["label-inside-value-cell"],
    },
    {
      id: "OR-053",
      role: "field",
      raw: "عدد العمال",
      label: "عدد العمال",
      number: null,
      key: "workersCount",
      answer: "number",
    },
    {
      id: "OR-054",
      role: "field",
      raw: "مسدد أتعاب",
      label: "مسدد أتعاب",
      number: "5.",
      key: "payerName",
      answer: "text",
    },
    {
      id: "OR-055",
      role: "field",
      raw: "رقم الهاتف",
      label: "رقم الهاتف",
      number: null,
      key: "payerPhone",
      answer: "phone",
    },
    {
      id: "OR-056",
      role: "choice",
      raw: "مواد التنظيف",
      label: "مواد التنظيف",
      number: "6.",
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
      id: "OR-057",
      role: "field",
      raw: "مصاريفها",
      label: "مصاريفها",
      number: null,
      key: "materialsAmount",
      answer: "money",
      suffix: "دج",
    },
    {
      id: "OR-058",
      role: "choice",
      raw: "توفير النقل",
      label: "توفير النقل",
      number: "7.",
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
      id: "OR-059",
      role: "field",
      raw: "مصاريفها",
      label: "مصاريفها",
      number: null,
      key: "transportAmount",
      answer: "money",
      suffix: "دج",
    },
    {
      id: "OR-060",
      role: "choice",
      raw: "طريقة السداد",
      label: "طريقة السداد",
      number: "8.",
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
      id: "OR-061",
      role: "field",
      raw: "المبلغ إجمالي",
      label: "المبلغ إجمالي",
      number: null,
      key: "totalAmount",
      answer: "money",
      suffix: "دج",
    },
    {
      id: "OR-062",
      role: "field",
      raw: "تاريخ التسديد",
      label: "تاريخ التسديد",
      number: "9.",
      key: "firstDueDate",
      answer: "date",
    },
    {
      id: "OR-063",
      role: "field",
      raw: "مكان التسديد",
      label: "مكان التسديد",
      number: null,
      key: "paymentPlace",
      answer: "text",
    },
    {
      id: "OR-064",
      role: "choice",
      raw: "دخول الفريق",
      label: "دخول الفريق",
      number: "10.",
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
      id: "OR-065",
      role: "choice",
      raw: "يوجد حارس ؟",
      label: "يوجد حارس ؟",
      number: "11.",
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
      id: "OR-066",
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
      id: "OR-067",
      role: "field",
      raw: "اسمه ولقبه",
      label: "اسمه ولقبه",
      number: "12.",
      key: "guardName",
      answer: "text",
    },
    {
      id: "OR-068",
      role: "field",
      raw: "رقم الهاتف",
      label: "رقم الهاتف",
      number: null,
      key: "guardPhone",
      answer: "phone",
    },
    {
      id: "OR-069",
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
      id: "OR-070",
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
      columnsMm: [32.49, 30.0, 7.51, 42.49, 32.51, 47.52],
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
                  row: "OR-004",
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
                  row: "OR-005",
                },
              ],
            },
            {
              span: 3,
              parts: [
                {
                  t: "blank",
                  row: "OR-005",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "OR-006",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "OR-006",
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
                  row: "OR-007",
                },
              ],
            },
            {
              span: 5,
              parts: [
                {
                  t: "options",
                  row: "OR-007",
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
                  row: "OR-008",
                },
              ],
            },
            {
              span: 5,
              parts: [
                {
                  t: "options",
                  row: "OR-008",
                  from: 0,
                  to: 8,
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
                  row: "OR-009",
                },
              ],
            },
            {
              span: 3,
              parts: [
                {
                  t: "blank",
                  row: "OR-009",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "OR-010",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "options",
                  row: "OR-010",
                  from: 0,
                  to: 2,
                },
              ],
              align: "end",
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
                  row: "OR-011",
                },
              ],
            },
            {
              span: 3,
              parts: [
                {
                  t: "blank",
                  row: "OR-011",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "OR-012",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "OR-012",
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
                  row: "OR-013",
                },
              ],
            },
            {
              span: 5,
              parts: [
                {
                  t: "blank",
                  row: "OR-013",
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
                  row: "OR-014",
                },
              ],
            },
            {
              span: 3,
              parts: [
                {
                  t: "blank",
                  row: "OR-014",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "OR-015",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "options",
                  row: "OR-015",
                  from: 0,
                  to: 2,
                },
              ],
              align: "end",
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
                  row: "OR-016",
                },
              ],
            },
            {
              span: 3,
              parts: [
                {
                  t: "blank",
                  row: "OR-016",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "OR-017",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "OR-017",
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
                  row: "OR-018",
                },
              ],
            },
            {
              span: 5,
              parts: [
                {
                  t: "blank",
                  row: "OR-018",
                  of: "note",
                },
                {
                  t: "options",
                  row: "OR-018",
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
                  row: "OR-019",
                },
              ],
              align: "center",
            },
            {
              span: 2,
              parts: [
                {
                  t: "options",
                  row: "OR-019",
                  from: 0,
                  to: 2,
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "OR-020",
                },
              ],
              align: "center",
            },
            {
              span: 2,
              parts: [
                {
                  t: "blank",
                  row: "OR-020",
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
                  row: "OR-021",
                },
              ],
            },
            {
              span: 4,
              parts: [
                {
                  t: "options",
                  row: "OR-021",
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
      columnsMm: [32.6, 17.6, 7.43, 33.06, 6.74, 26.33, 16.4, 16.65, 35.72],
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
                  row: "OR-022",
                },
              ],
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
                  row: "OR-023",
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
                  row: "OR-023",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "OR-024",
                  pt: 14.0,
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
                  row: "OR-024",
                },
              ],
              align: "center",
            },
            {
              span: 2,
              parts: [
                {
                  t: "label",
                  row: "OR-025",
                  pt: 14.0,
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
                  row: "OR-025",
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
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "OR-026",
                  pt: 14.0,
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
                  row: "OR-026",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "OR-027",
                  pt: 14.0,
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
                  row: "OR-027",
                },
              ],
              align: "center",
            },
            {
              span: 2,
              parts: [
                {
                  t: "label",
                  row: "OR-028",
                  pt: 14.0,
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
                  row: "OR-028",
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
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "OR-029",
                  pt: 14.0,
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
                  row: "OR-029",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "OR-030",
                  pt: 14.0,
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
                  row: "OR-030",
                },
              ],
              align: "center",
            },
            {
              span: 2,
              parts: [
                {
                  t: "label",
                  row: "OR-031",
                  pt: 14.0,
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
                  row: "OR-031",
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
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "OR-032",
                  pt: 14.0,
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
                  row: "OR-032",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "OR-033",
                  pt: 14.0,
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
                  row: "OR-033",
                },
              ],
              align: "center",
            },
            {
              span: 2,
              parts: [
                {
                  t: "label",
                  row: "OR-034",
                  pt: 14.0,
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
                  row: "OR-034",
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
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "OR-035",
                  pt: 14.0,
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
                  row: "OR-035",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "OR-036",
                  pt: 14.0,
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
                  row: "OR-036",
                },
              ],
              align: "center",
            },
            {
              span: 2,
              parts: [
                {
                  t: "blank",
                  row: "OR-037",
                  of: "label",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "OR-037",
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
              span: 9,
              parts: [
                {
                  t: "heading",
                  row: "OR-038",
                },
              ],
              shaded: true,
            },
          ],
        },
        {
          minMm: 50.27,
          cells: [
            {
              span: 2,
              stacked: true,
              parts: [
                {
                  t: "options",
                  row: "OR-039",
                  from: 0,
                  to: 6,
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
                  row: "OR-039",
                  from: 6,
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
                  row: "OR-039",
                  from: 12,
                  to: 18,
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
                  row: "OR-039",
                  from: 18,
                  to: 24,
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
      id: "T3",
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
                  row: "OR-040",
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
                  row: "OR-041",
                  from: 0,
                  to: 4,
                },
              ],
              align: "end",
            },
            {
              span: 1,
              stacked: true,
              parts: [
                {
                  t: "options",
                  row: "OR-041",
                  from: 4,
                  to: 8,
                },
              ],
              align: "end",
            },
            {
              span: 1,
              stacked: true,
              parts: [
                {
                  t: "options",
                  row: "OR-041",
                  from: 8,
                  to: 12,
                },
              ],
              align: "end",
            },
            {
              span: 1,
              stacked: true,
              parts: [
                {
                  t: "options",
                  row: "OR-041",
                  from: 12,
                  to: 16,
                },
              ],
              align: "end",
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
      id: "T4",
      columnsMm: [32.47, 77.52, 32.51, 50.02],
      offsetMm: -2.6,
      rows: [
        {
          minMm: 2.42,
          cells: [
            {
              span: 4,
              parts: [
                {
                  t: "heading",
                  row: "OR-042",
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
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "OR-043",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "OR-043",
                  of: "note",
                },
                {
                  t: "options",
                  row: "OR-043",
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
                  row: "OR-044",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "OR-044",
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
                  row: "OR-045",
                },
              ],
            },
            {
              span: 3,
              parts: [
                {
                  t: "options",
                  row: "OR-045",
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
                  row: "OR-046",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "options",
                  row: "OR-046",
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
                  row: "OR-047",
                  pt: 14.0,
                  regular: true,
                  inline: true,
                },
                {
                  t: "blank",
                  row: "OR-047",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "OR-048",
                  pt: 14.0,
                  regular: true,
                  inline: true,
                },
                {
                  t: "blank",
                  row: "OR-048",
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
                  row: "OR-049",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "OR-049",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "OR-050",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "OR-050",
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
                  row: "OR-051",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "OR-051",
                },
                {
                  t: "label",
                  row: "OR-052",
                  inline: true,
                },
                {
                  t: "blank",
                  row: "OR-052",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "OR-053",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "OR-053",
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
                  row: "OR-054",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "OR-054",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "OR-055",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "OR-055",
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
                  row: "OR-056",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "options",
                  row: "OR-056",
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
                  row: "OR-057",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "OR-057",
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
                  row: "OR-058",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "options",
                  row: "OR-058",
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
                  row: "OR-059",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "OR-059",
                },
              ],
            },
          ],
        },
        {
          minMm: 5.29,
          cells: [
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "OR-060",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "options",
                  row: "OR-060",
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
                  row: "OR-061",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "OR-061",
                },
              ],
            },
          ],
        },
        {
          minMm: 5.29,
          cells: [
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "OR-062",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "OR-062",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "OR-063",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "OR-063",
                },
              ],
            },
          ],
        },
        {
          minMm: 5.29,
          cells: [
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "OR-064",
                },
              ],
            },
            {
              span: 3,
              parts: [
                {
                  t: "options",
                  row: "OR-064",
                  from: 0,
                  to: 4,
                },
              ],
            },
          ],
        },
        {
          minMm: 5.29,
          cells: [
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "OR-065",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "options",
                  row: "OR-065",
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
                  row: "OR-066",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "options",
                  row: "OR-066",
                  from: 0,
                  to: 2,
                },
              ],
              align: "center",
            },
          ],
        },
        {
          minMm: 5.29,
          cells: [
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "OR-067",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "OR-067",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "OR-068",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "OR-068",
                },
              ],
              align: "center",
            },
          ],
        },
        {
          minMm: 12.36,
          cells: [
            {
              span: 2,
              parts: [
                {
                  t: "label",
                  row: "OR-069",
                  regular: true,
                  inline: true,
                },
                {
                  t: "blank",
                  row: "OR-069",
                },
              ],
              open: true,
            },
            {
              span: 2,
              parts: [
                {
                  t: "signature",
                  row: "OR-070",
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
