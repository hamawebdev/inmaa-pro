// Written from docs/checker/data/05-home-request.json (the Checker's extraction of his Word file) and kept by hand since.
// definitions.test.ts fails when a label, an option, its order or its tick-box side differs from that file.
import type { FormDefinition } from "../types";

export const HOUSING_REQUEST: FormDefinition = {
  kind: "HOUSING_REQUEST",
  checker: {
    prefix: "HR",
    file: "05-home-request",
  },
  family: "HOUSING",
  registrationSuffix: null,
  titleBox: {
    leftMm: 57.08,
    topMm: 2.93,
    widthMm: 136.23,
    heightMm: 12.29,
  },
  rows: [
    {
      id: "HR-001",
      role: "title",
      raw: "نوع الخدمة : عند الطلب (سكن)",
      label: "نوع الخدمة : عند الطلب (سكن)",
      number: null,
      key: null,
      answer: null,
    },
    {
      id: "HR-002",
      role: "number",
      raw: "رقـــم التســجــيـــل:",
      label: "رقم التسجيل",
      number: null,
      key: "registrationNumber",
      answer: "text",
      blankParts: 2,
    },
    {
      id: "HR-003",
      role: "date",
      raw: "التاريخ:",
      label: "التاريخ",
      number: null,
      key: "registrationDate",
      answer: "date",
      blankParts: 3,
    },
    {
      id: "HR-004",
      role: "heading",
      raw: "المعلومات الأساسية للسكن",
      label: "المعلومات الأساسية للسكن",
      number: "1-",
      key: null,
      answer: null,
    },
    {
      id: "HR-005",
      role: "field",
      raw: "رقم الملف",
      label: "رقم الملف",
      number: "1.",
      key: "dossierNumber",
      answer: "text",
    },
    {
      id: "HR-006",
      role: "field",
      raw: "رقم الباب",
      label: "رقم الباب",
      number: null,
      key: "siteNumber",
      answer: "text",
    },
    {
      id: "HR-007",
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
      id: "HR-008",
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
      id: "HR-009",
      role: "field",
      raw: "اللقب والاسم",
      label: "اللقب والاسم",
      number: "4.",
      key: "clientName",
      answer: "text",
    },
    {
      id: "HR-010",
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
      id: "HR-011",
      role: "field",
      raw: "العنوان مدقق",
      label: "العنوان مدقق",
      number: "5.",
      key: "address",
      answer: "text",
    },
    {
      id: "HR-012",
      role: "field",
      raw: "البلدية / الولاية",
      label: "البلدية / الولاية",
      number: null,
      key: "commune",
      answer: "place",
      pairKey: "wilaya",
    },
    {
      id: "HR-013",
      role: "field",
      raw: "اسم المتداول",
      label: "اسم المتداول",
      number: "6.",
      key: "commonName",
      answer: "text",
    },
    {
      id: "HR-014",
      role: "field",
      raw: "رقم الهاتف",
      label: "رقم الهاتف",
      number: "7.",
      key: "phone",
      answer: "phone",
    },
    {
      id: "HR-015",
      role: "field",
      raw: "تاريخ الزيارة",
      label: "تاريخ الزيارة",
      number: null,
      key: "firstVisitDate",
      answer: "date",
    },
    {
      id: "HR-016",
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
      id: "HR-017",
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
      id: "HR-018",
      role: "field",
      raw: "اسم المكان",
      label: "اسم المكان",
      number: null,
      key: "storagePlace",
      answer: "text",
    },
    {
      id: "HR-019",
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
      id: "HR-020",
      role: "heading",
      raw: "الوصف الفني للموقع",
      label: "الوصف الفني للموقع",
      number: "2-",
      key: null,
      answer: null,
    },
    {
      id: "HR-021",
      role: "field",
      raw: "مساحة البناء",
      label: "مساحة البناء",
      number: null,
      key: "buildArea",
      answer: "area",
      suffix: "م2",
    },
    {
      id: "HR-022",
      role: "field",
      raw: "عدد الطوابق",
      label: "عدد الطوابق",
      number: null,
      key: "floors",
      answer: "number",
    },
    {
      id: "HR-023",
      role: "field",
      raw: "عدد الغرف",
      label: "عدد الغرف",
      number: null,
      key: "rooms",
      answer: "number",
    },
    {
      id: "HR-024",
      role: "field",
      raw: "عدد المجالس",
      label: "عدد المجالس",
      number: null,
      key: "majlis",
      answer: "number",
    },
    {
      id: "HR-025",
      role: "field",
      raw: "عدد الصالونات",
      label: "عدد الصالونات",
      number: null,
      key: "salons",
      answer: "number",
    },
    {
      id: "HR-026",
      role: "field",
      raw: "عدد المطابخ",
      label: "عدد المطابخ",
      number: null,
      key: "kitchens",
      answer: "number",
    },
    {
      id: "HR-027",
      role: "field",
      raw: "عدد الحمامات",
      label: "عدد الحمامات",
      number: null,
      key: "bathrooms",
      answer: "number",
    },
    {
      id: "HR-028",
      role: "field",
      raw: "عدد الشرفات",
      label: "عدد الشرفات",
      number: null,
      key: "balconies",
      answer: "number",
    },
    {
      id: "HR-029",
      role: "field",
      raw: "عدد النوافذ",
      label: "عدد النوافذ",
      number: null,
      key: "windows",
      answer: "number",
    },
    {
      id: "HR-030",
      role: "field",
      raw: "نوع الأرضيات",
      label: "نوع الأرضيات",
      number: null,
      key: "floorType",
      answer: "text",
    },
    {
      id: "HR-031",
      role: "field",
      raw: "مساحة الحديقة",
      label: "مساحة الحديقة",
      number: null,
      key: "gardenArea",
      answer: "area",
    },
    {
      id: "HR-032",
      role: "field",
      raw: "مساحة الفناء",
      label: "مساحة الفناء",
      number: null,
      key: "courtyardArea",
      answer: "area",
    },
    {
      id: "HR-033",
      role: "heading",
      raw: "الخدمات المقدمة",
      label: "الخدمات المقدمة",
      number: "3-",
      key: null,
      answer: null,
    },
    {
      id: "HR-034",
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
      id: "HR-035",
      role: "heading",
      raw: "نوع الخدمة المبرمجة",
      label: "نوع الخدمة المبرمجة",
      number: "4-",
      key: null,
      answer: null,
    },
    {
      id: "HR-036",
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
      id: "HR-037",
      role: "heading",
      raw: "الدراسة المالية",
      label: "الدراسة المالية",
      number: "5-",
      key: null,
      answer: null,
    },
    {
      id: "HR-038",
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
      id: "HR-039",
      role: "field",
      raw: "مدة التنفيذ",
      label: "مدة التنفيذ",
      number: null,
      key: "executionDurationValue",
      answer: "duration",
      pairKey: "executionDurationUnit",
    },
    {
      id: "HR-040",
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
      id: "HR-041",
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
      id: "HR-042",
      role: "field",
      raw: "من:",
      label: "من",
      number: null,
      key: "periodFrom",
      answer: "time",
      flags: ["label-inside-value-cell"],
    },
    {
      id: "HR-043",
      role: "field",
      raw: "إلى:",
      label: "إلى",
      number: null,
      key: "periodTo",
      answer: "time",
      flags: ["label-inside-value-cell"],
    },
    {
      id: "HR-044",
      role: "field",
      raw: "تاريخ البداية",
      label: "تاريخ البداية",
      number: "3.",
      key: "startDate",
      answer: "date",
    },
    {
      id: "HR-045",
      role: "field",
      raw: "تاريخ النهاية",
      label: "تاريخ النهاية",
      number: null,
      key: "endDate",
      answer: "date",
    },
    {
      id: "HR-046",
      role: "field",
      raw: "وقت الوصول",
      label: "وقت الوصول",
      number: "4.",
      key: "arrivalTime",
      answer: "time",
    },
    {
      id: "HR-047",
      role: "field",
      raw: "المغادرة:",
      label: "المغادرة",
      number: null,
      key: "departureTime",
      answer: "time",
      flags: ["label-inside-value-cell"],
    },
    {
      id: "HR-048",
      role: "field",
      raw: "عدد العمال",
      label: "عدد العمال",
      number: null,
      key: "workersCount",
      answer: "number",
    },
    {
      id: "HR-049",
      role: "field",
      raw: "مسدد أتعاب",
      label: "مسدد أتعاب",
      number: "5.",
      key: "payerName",
      answer: "text",
    },
    {
      id: "HR-050",
      role: "field",
      raw: "رقم الهاتف",
      label: "رقم الهاتف",
      number: null,
      key: "payerPhone",
      answer: "phone",
    },
    {
      id: "HR-051",
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
      id: "HR-052",
      role: "field",
      raw: "مصاريفها",
      label: "مصاريفها",
      number: null,
      key: "materialsAmount",
      answer: "money",
      suffix: "دج",
    },
    {
      id: "HR-053",
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
      id: "HR-054",
      role: "field",
      raw: "مصاريفها",
      label: "مصاريفها",
      number: null,
      key: "transportAmount",
      answer: "money",
      suffix: "دج",
    },
    {
      id: "HR-055",
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
      id: "HR-056",
      role: "field",
      raw: "المبلغ إجمالي",
      label: "المبلغ إجمالي",
      number: null,
      key: "totalAmount",
      answer: "money",
      suffix: "دج",
    },
    {
      id: "HR-057",
      role: "field",
      raw: "تاريخ التسديد",
      label: "تاريخ التسديد",
      number: "9.",
      key: "firstDueDate",
      answer: "date",
    },
    {
      id: "HR-058",
      role: "field",
      raw: "مكان التسديد",
      label: "مكان التسديد",
      number: null,
      key: "paymentPlace",
      answer: "text",
    },
    {
      id: "HR-059",
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
      id: "HR-060",
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
      id: "HR-061",
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
      id: "HR-062",
      role: "field",
      raw: "اسمه ولقبه",
      label: "اسمه ولقبه",
      number: "12.",
      key: "guardName",
      answer: "text",
    },
    {
      id: "HR-063",
      role: "field",
      raw: "رقم الهاتف",
      label: "رقم الهاتف",
      number: null,
      key: "guardPhone",
      answer: "phone",
    },
    {
      id: "HR-064",
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
      id: "HR-065",
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
                  row: "HR-004",
                },
              ],
              shaded: true,
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
                  row: "HR-005",
                },
              ],
            },
            {
              span: 8,
              parts: [
                {
                  t: "blank",
                  row: "HR-005",
                },
              ],
              align: "center",
            },
            {
              span: 2,
              parts: [
                {
                  t: "label",
                  row: "HR-006",
                },
              ],
              align: "center",
            },
            {
              span: 3,
              parts: [
                {
                  t: "blank",
                  row: "HR-006",
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
                  row: "HR-007",
                },
              ],
            },
            {
              span: 13,
              parts: [
                {
                  t: "options",
                  row: "HR-007",
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
                  row: "HR-008",
                },
              ],
            },
            {
              span: 13,
              parts: [
                {
                  t: "options",
                  row: "HR-008",
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
                  row: "HR-009",
                },
              ],
            },
            {
              span: 8,
              parts: [
                {
                  t: "blank",
                  row: "HR-009",
                },
              ],
              align: "center",
            },
            {
              span: 2,
              parts: [
                {
                  t: "label",
                  row: "HR-010",
                },
              ],
              align: "center",
            },
            {
              span: 3,
              parts: [
                {
                  t: "options",
                  row: "HR-010",
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
                  row: "HR-011",
                },
              ],
            },
            {
              span: 8,
              parts: [
                {
                  t: "blank",
                  row: "HR-011",
                },
              ],
              align: "center",
            },
            {
              span: 2,
              parts: [
                {
                  t: "label",
                  row: "HR-012",
                },
              ],
              align: "center",
            },
            {
              span: 3,
              parts: [
                {
                  t: "blank",
                  row: "HR-012",
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
                  row: "HR-013",
                },
              ],
            },
            {
              span: 13,
              parts: [
                {
                  t: "blank",
                  row: "HR-013",
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
                  row: "HR-014",
                },
              ],
            },
            {
              span: 8,
              parts: [
                {
                  t: "blank",
                  row: "HR-014",
                },
              ],
              align: "center",
            },
            {
              span: 2,
              parts: [
                {
                  t: "label",
                  row: "HR-015",
                },
              ],
              align: "center",
            },
            {
              span: 3,
              parts: [
                {
                  t: "blank",
                  row: "HR-015",
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
                  row: "HR-016",
                },
              ],
            },
            {
              span: 13,
              parts: [
                {
                  t: "blank",
                  row: "HR-016",
                  of: "note",
                },
                {
                  t: "options",
                  row: "HR-016",
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
                  row: "HR-017",
                },
              ],
              align: "center",
            },
            {
              span: 4,
              parts: [
                {
                  t: "options",
                  row: "HR-017",
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
                  row: "HR-018",
                },
              ],
              align: "center",
            },
            {
              span: 7,
              parts: [
                {
                  t: "blank",
                  row: "HR-018",
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
                  row: "HR-019",
                },
              ],
            },
            {
              span: 9,
              parts: [
                {
                  t: "options",
                  row: "HR-019",
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
                  row: "HR-020",
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
                  row: "HR-021",
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
                  row: "HR-021",
                },
              ],
              align: "center",
            },
            {
              span: 2,
              parts: [
                {
                  t: "label",
                  row: "HR-022",
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
                  row: "HR-022",
                },
              ],
              align: "center",
            },
            {
              span: 3,
              parts: [
                {
                  t: "label",
                  row: "HR-023",
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
                  row: "HR-023",
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
                  row: "HR-024",
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
                  row: "HR-024",
                },
              ],
              align: "center",
            },
            {
              span: 2,
              parts: [
                {
                  t: "label",
                  row: "HR-025",
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
                  row: "HR-025",
                },
              ],
              align: "center",
            },
            {
              span: 3,
              parts: [
                {
                  t: "label",
                  row: "HR-026",
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
                  row: "HR-026",
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
                  row: "HR-027",
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
                  row: "HR-027",
                },
              ],
              align: "center",
            },
            {
              span: 2,
              parts: [
                {
                  t: "label",
                  row: "HR-028",
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
                  row: "HR-028",
                },
              ],
              align: "center",
            },
            {
              span: 3,
              parts: [
                {
                  t: "label",
                  row: "HR-029",
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
                  row: "HR-029",
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
                  row: "HR-030",
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
                  row: "HR-030",
                },
              ],
              align: "center",
            },
            {
              span: 2,
              parts: [
                {
                  t: "label",
                  row: "HR-031",
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
                  row: "HR-031",
                },
              ],
              align: "center",
            },
            {
              span: 3,
              parts: [
                {
                  t: "label",
                  row: "HR-032",
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
                  row: "HR-032",
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
                  row: "HR-033",
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
                  row: "HR-034",
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
                  row: "HR-034",
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
                  row: "HR-034",
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
                  row: "HR-034",
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
                  row: "HR-035",
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
                  row: "HR-036",
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
                  row: "HR-036",
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
                  row: "HR-036",
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
                  row: "HR-036",
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
                  row: "HR-037",
                },
              ],
              shaded: true,
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
                  row: "HR-038",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "HR-038",
                  of: "note",
                },
                {
                  t: "options",
                  row: "HR-038",
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
                  row: "HR-039",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "HR-039",
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
                  row: "HR-040",
                },
              ],
            },
            {
              span: 3,
              parts: [
                {
                  t: "options",
                  row: "HR-040",
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
                  row: "HR-041",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "options",
                  row: "HR-041",
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
                  row: "HR-042",
                  pt: 14.0,
                  regular: true,
                  inline: true,
                },
                {
                  t: "blank",
                  row: "HR-042",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "HR-043",
                  pt: 14.0,
                  regular: true,
                  inline: true,
                },
                {
                  t: "blank",
                  row: "HR-043",
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
                  row: "HR-044",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "HR-044",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "HR-045",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "HR-045",
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
                  row: "HR-046",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "HR-046",
                },
                {
                  t: "label",
                  row: "HR-047",
                  inline: true,
                },
                {
                  t: "blank",
                  row: "HR-047",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "HR-048",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "HR-048",
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
                  row: "HR-049",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "HR-049",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "HR-050",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "HR-050",
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
                  row: "HR-051",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "options",
                  row: "HR-051",
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
                  row: "HR-052",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "HR-052",
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
                  row: "HR-053",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "options",
                  row: "HR-053",
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
                  row: "HR-054",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "HR-054",
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
                  row: "HR-055",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "options",
                  row: "HR-055",
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
                  row: "HR-056",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "HR-056",
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
                  row: "HR-057",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "HR-057",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "HR-058",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "HR-058",
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
                  row: "HR-059",
                },
              ],
            },
            {
              span: 3,
              parts: [
                {
                  t: "options",
                  row: "HR-059",
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
                  row: "HR-060",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "options",
                  row: "HR-060",
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
                  row: "HR-061",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "options",
                  row: "HR-061",
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
                  row: "HR-062",
                },
              ],
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "HR-062",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "label",
                  row: "HR-063",
                },
              ],
              align: "center",
            },
            {
              span: 1,
              parts: [
                {
                  t: "blank",
                  row: "HR-063",
                },
              ],
              align: "center",
            },
          ],
        },
        {
          minMm: 17.34,
          cells: [
            {
              span: 2,
              parts: [
                {
                  t: "label",
                  row: "HR-064",
                  regular: true,
                  inline: true,
                },
                {
                  t: "blank",
                  row: "HR-064",
                },
              ],
              open: true,
            },
            {
              span: 2,
              parts: [
                {
                  t: "signature",
                  row: "HR-065",
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
