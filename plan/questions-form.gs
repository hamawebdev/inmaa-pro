/**
 * Builds the Google Form for the 26 validation questions in the Inmaa system plan
 * (plan/inmaa-system-plan-ar.pdf, section «أسئلة للتحقق من الخطة»).
 *
 * How to run
 *   1. Open https://script.google.com and create a new project.
 *   2. Replace the contents of Code.gs with this file and save.
 *   3. Choose the function createQuestionsForm and click Run. Approve the Google Forms permission.
 *   4. Open the execution log. It prints two links:
 *        - the edit link, for you;
 *        - the answer link, to send to the client.
 *
 * Notes
 *   - Every run creates a new form. Delete the old one in Google Drive if you run it twice.
 *   - Question codes (س1 … س26) are the plan's own, so each answer maps back to the plan
 *     and to the "Question to build decision" table in the notes. Compound questions are
 *     split into parts (أ، ب، ج…) so they can be answered by tapping on a phone.
 *   - Choice questions offer «لم أقرر بعد», so a required question never blocks the client.
 *   - To read the answers in a spreadsheet, open the form's Responses tab and click "Link to Sheets".
 */

const UNDECIDED = 'لم أقرر بعد';

const ROLES = [
  'المدير',
  'موظف الاستقبال أو المبيعات',
  'مسؤول العمليات',
  'المشرف الميداني',
  'المحاسب',
  'لم يُحدَّد بعد',
];

const TASKS = [
  'تسجيل الطلبات',
  'المعاينة',
  'إعداد عروض الأسعار',
  'اعتماد الأسعار',
  'جدولة العمال',
  'الإشراف الميداني',
  'قبض المال',
  'إصدار الفواتير',
];

const DIVISIONS = ['المنازل', 'المؤسسات', 'العمارات'];

const PRICE_BASES = [
  'التكلفة زائد هامش الربح',
  'بالساعة',
  'بالمتر المربع',
  'لكل زيارة',
  'حسب المداخل أو الطوابق',
  'سعر ثابت (باقة)',
  UNDECIDED,
];

const SIGNED_DOCUMENTS = ['استمارة التسجيل', 'قبول عرض السعر', 'استلام الخدمة'];

const LANGUAGE_TARGETS = ['شاشات المكتب', 'تطبيق العامل', 'الفواتير والعروض والعقود'];

// Features 34–49 of the plan (the "later" list), offered in س26.
const LATER_FEATURES = [
  '34 المخزون والمشتريات',
  '35 المعدات وصيانتها',
  '36 عدة مشرفين ومناطق',
  '37 التوظيف والتدريب',
  '38 حساب الأجور كاملاً',
  '39 المصاريف والربح الشهري',
  '40 متابعة زيارات المندوب',
  '41 التحليلات المتقدمة والتدفق النقدي',
  '42 الرسائل الآلية',
  '43 الدفع بالبطاقة',
  '44 صفحة العميل',
  '45 الحجز عبر الإنترنت بسعر فوري',
  '46 تنظيم التنقل والمسارات',
  '47 الفروع',
  '48 الربط مع برنامج المحاسب',
  '49 رموز QR في العمارات والمؤسسات',
  'لا شيء منها الآن',
];

/**
 * Item types: header, choice (one answer), checkbox (several answers), text, paragraph.
 * `other: true` adds a free-text "Other" option; `undecided: true` appends «لم أقرر بعد».
 */
const FORM = {
  title: 'أسئلة للتحقق من خطة نظام مركز إنماء للخدمات',
  description:
    '26 سؤالاً عن طريقة عمل المركز. لا يحتاج أيٌّ منها معرفة تقنية، وكل جواب يغيّر ما سنبنيه في النظام.\n\n' +
    'الأرقام (س1، س2…) هي أرقام الأسئلة في الخطة المرسلة إليكم، والأرقام بين قوسين مثل (34) هي أرقام الخصائص فيها.\n\n' +
    'إن لم تحسموا أمراً بعد فاختاروا «لم أقرر بعد» أو اكتبوا ذلك. يمكنكم تعديل إجاباتكم بعد الإرسال من الرابط الذي يظهر لكم.',
  confirmation:
    'شكراً لكم. وصلت إجاباتكم، ويمكنكم تعديلها من رابط «تعديل الرد». بهذه الإجابات تكتمل الصورة التي نحتاجها لبدء البناء.',
  sections: [
    {
      title: 'البداية والحجم',
      items: [
        {
          type: 'checkbox',
          code: 'س1',
          title: 'بأي الأقسام ستبدؤون؟',
          help: 'اختاروا قسماً أو أكثر. لماذا نسأل: نبني أولاً استمارات القسم الذي ستبدؤون به وقوائم مهامه، ويدخل القسم المؤجَّل لاحقاً.',
          options: ['تنظيف المنازل والشقق والفلل', 'تنظيف المحلات والمؤسسات', 'تنظيف العمارات والإقامات'],
          required: true,
        },
        {
          type: 'text',
          code: 'س2 (أ)',
          title: 'كم عاملاً ستبدؤون بهم؟',
          help: 'لماذا نسأل: الحجم يحدد متى تنتقل خصائص مرحلة النمو إلى الانطلاق، مثل تعدد المشرفين (36) والمخزون (34).',
          required: true,
        },
        { type: 'text', code: 'س2 (ب)', title: 'كم موظف مكتب ستبدؤون بهم؟', required: true },
        {
          type: 'text',
          code: 'س2 (ج)',
          title: 'كم عاملاً تتوقعون بعد سنة؟',
          help: 'الدراسة تذكر 5–10 عاملات ثم 20 ثم 100 فأكثر، وتترك المرحلة الثالثة فارغة.',
          required: true,
        },
        {
          type: 'choice',
          code: 'س2 (د)',
          title: 'كيف تنظّمون الاحتياط عند غياب عامل؟',
          help: 'لماذا نسأل: طريقة الاحتياط تحدد من يقترحه النظام بديلاً (9).',
          options: [
            'عمال احتياط ثابتون (مثلاً 2 لكل 10 كما في الدراسة)',
            'بديل لكل منطقة',
            'نبحث عن عامل متاح من الفريق دون احتياط خاص',
          ],
          other: true,
          undecided: true,
          required: true,
        },
        {
          type: 'text',
          code: 'س3 (أ)',
          title: 'في أي مدينة أو ولايات ستعملون عند الانطلاق؟',
          help: 'لماذا نسأل: المناطق أساس توزيع العمال واقتراح البدلاء (8، 9).',
          required: true,
        },
        {
          type: 'choice',
          code: 'س3 (ب)',
          title: 'هل ستقسّمون منطقة العمل إلى مناطق من البداية كما تقترح الدراسة؟',
          options: ['نعم، من البداية', 'لا، لاحقاً عند التوسع'],
          undecided: true,
          required: true,
        },
        {
          type: 'paragraph',
          code: 'س3 (ج)',
          title: 'إن نعم، ما هي المناطق؟',
          help: 'مثلاً: شرق المدينة، وسطها، غربها.',
        },
        {
          type: 'checkbox',
          code: 'س4 (أ)',
          title: 'هل لديكم الآن عملاء أو عمال مسجلون في مكان ما؟',
          help: 'لماذا نسأل: إن وُجدوا نُدخل بياناتهم في النظام قبل التشغيل.',
          options: ['نعم، في دفتر', 'نعم، في ملف Excel', 'نعم، في الهاتف', 'لا يوجد شيء مسجل بعد'],
          other: true,
          required: true,
        },
        { type: 'text', code: 'س4 (ب)', title: 'كم عددهم تقريباً (العملاء والعمال)؟' },
      ],
    },
    {
      title: 'من يفعل ماذا',
      items: [
        {
          type: 'header',
          title: 'س5 · عند الانطلاق، من سيتولى كل مهمة؟',
          help: 'يمكن لشخص واحد أن يتولى عدة مهام، ولمهمة واحدة أكثر من شخص. لماذا نسأل: لكل دور حساب وصلاحيات (23)؛ الدراسة تقترح خمسة أدوار بينما تبدؤون بفريق صغير.',
        },
        ...TASKS.map((task) => ({
          type: 'checkbox',
          code: 'س5',
          title: task + ': من يتولى هذه المهمة؟',
          options: ROLES,
          other: true,
          required: true,
        })),
        {
          type: 'choice',
          code: 'س6 (أ)',
          title: 'أي عروض الأسعار يجب أن تمر عليكم قبل إرسالها؟',
          help: 'لماذا نسأل: استمارات المعاينة تفصل بين من يعدّ السعر ومن يعتمده؛ الجواب يحدد متى يُوقف النظام العرض في انتظار موافقتكم (5).',
          options: [
            'كل العروض',
            'العروض التي فيها خصم فقط',
            'العروض التي تتجاوز مبلغاً معيناً فقط',
            'العروض التي فيها خصم أو تتجاوز مبلغاً معيناً',
            'لا حاجة إلى اعتماد',
          ],
          undecided: true,
          required: true,
        },
        { type: 'text', code: 'س6 (ب)', title: 'إن كان هناك مبلغ، كم هو بالدينار؟' },
      ],
    },
    {
      title: 'العمال في الميدان',
      items: [
        {
          type: 'choice',
          code: 'س7 (أ)',
          title: 'هل لدى العمال هاتف ذكي فيه إنترنت أثناء العمل؟',
          help: 'لماذا نسأل: يحدد هل نبني تطبيقاً للعامل، أم نطبع أوامر المهام ويسجّل غيره بدلاً منه (11 إلى 14، 27، 28).',
          options: ['كلهم', 'أغلبهم', 'بعضهم فقط', 'لا'],
          undecided: true,
          required: true,
        },
        {
          type: 'choice',
          code: 'س7 (ب)',
          title: 'هل يقرأ العمال العربية أو الفرنسية بسهولة؟',
          options: ['نعم، العربية', 'نعم، الفرنسية', 'نعم، اللغتين', 'بعضهم يقرأ بصعوبة'],
          undecided: true,
          required: true,
        },
        {
          type: 'choice',
          code: 'س7 (ج)',
          title: 'من يسجّل حضور ومهام العامل الذي لا يستعمل الهاتف؟',
          options: ['المشرف', 'المكتب', 'لا ينطبق: الجميع يستعمل الهاتف'],
          other: true,
          undecided: true,
          required: true,
        },
        {
          type: 'choice',
          code: 'س8 (أ)',
          title: 'هل يعمل العامل منفرداً أم ضمن فريق له قائد؟',
          help: 'بطاقة توجيه العمارات تذكر «قائد فريق». لماذا نسأل: يحدد هل يُصدَر أمر المهمة ويُسجَّل الحضور لكل عامل أم لكل فريق (11، 12).',
          options: ['منفرداً في الغالب', 'ضمن فريق له قائد في الغالب', 'يختلف حسب نوع الخدمة'],
          undecided: true,
          required: true,
        },
        {
          type: 'choice',
          code: 'س8 (ب)',
          title: 'في الفريق، من يسجّل الحضور؟',
          options: ['القائد يسجّل حضور الجميع', 'كل عامل يسجّل حضوره', 'لا ينطبق: لا نعمل بفرق'],
          undecided: true,
          required: true,
        },
        {
          type: 'checkbox',
          code: 'س9 (أ)',
          title: 'كيف سيتنقل العمال إلى المواقع؟',
          help: 'لماذا نسأل: يحدد هل يُحسب وقت الطريق بين موقعين في الجدول وتكلفة النقل في السعر (4، 8)، ومتى نحتاج تنظيم المسارات (46).',
          options: ['سيارة المركز', 'النقل العمومي', 'وسيلتهم الخاصة'],
          other: true,
          required: true,
        },
        {
          type: 'choice',
          code: 'س9 (ب)',
          title: 'من يتحمل تكلفة التنقل؟',
          options: ['المركز', 'العامل', 'تُضاف إلى سعر العميل'],
          other: true,
          undecided: true,
          required: true,
        },
        {
          type: 'checkbox',
          code: 'س10 (أ)',
          title: 'ما أيام عمل المركز؟',
          help: 'الدراسة تجعل العمل من السبت إلى الخميس والجمعة عطلة، بينما تشمل استمارتا المؤسسات والعمارات يوم الجمعة. لماذا نسأل: هذه قواعد التقويم التي تُبنى عليها الجدولة الدورية وحساب طاقة العمال (7، 8).',
          options: ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'],
          required: true,
        },
        {
          type: 'choice',
          code: 'س10 (ب)',
          title: 'هل تعملون بفترات ثابتة أم في أي ساعة يطلبها العميل؟',
          help: 'تذكر الدراسة 09:00–12:00 و13:30–16:00، وفي موضع آخر 08:00–12:00 وخدمات مسائية من 14:00.',
          options: ['فترات ثابتة', 'أي ساعة يطلبها العميل', 'فترات ثابتة للعقود وساعات حرة للطلبات الأخرى'],
          other: true,
          undecided: true,
          required: true,
        },
        {
          type: 'text',
          code: 'س10 (ج)',
          title: 'إن كانت الفترات ثابتة، ما هي؟',
          help: 'مثلاً: 08:00–12:00 و13:30–16:30.',
        },
        {
          type: 'choice',
          code: 'س10 (د)',
          title: 'هل ستقدّمون خدمات ليلية بين التاسعة مساءً والخامسة صباحاً؟',
          help: 'قانون العمل يمنع العمل الليلي للعاملات إلا بترخيص من مفتشية العمل، فينبّه النظام عند الجدولة.',
          options: ['نعم', 'لا', 'ربما لاحقاً'],
          required: true,
        },
        {
          type: 'checkbox',
          code: 'س11 (أ)',
          title: 'كيف يُدفع أجر العامل؟',
          help: 'لماذا نسأل: يحدد ما يسجّله النظام لكل عامل (ساعات أم مهام) والحدود التي ينبّه عندها (8، 21، 38).',
          options: ['راتب شهري ثابت', 'أجر يومي', 'بالساعة', 'بالمهمة'],
          other: true,
          required: true,
        },
        {
          type: 'choice',
          code: 'س11 (ب)',
          title: 'متى يُدفع الأجر؟',
          help: 'الدراسة تذكر «أسبوعياً أو شهرياً».',
          options: ['كل أسبوع', 'كل شهر'],
          other: true,
          undecided: true,
          required: true,
        },
        {
          type: 'text',
          code: 'س11 (ج)',
          title: 'كم ساعة يعمل العامل في الأسبوع بدوام كامل حسب عقده؟',
          help: 'الدراسة تذكر 40–45 ساعة مرة و40–48 مرة أخرى. للعلم: يحدد القانون 40 ساعة أسبوعياً، والساعات الإضافية استثنائية في حدود 20% وبأجر أعلى.',
          required: true,
        },
        {
          type: 'text',
          code: 'س11 (د)',
          title: 'كم ساعة في اليوم كحد أقصى؟',
          help: 'تقترح الدراسة 8 ساعات مثلاً.',
          required: true,
        },
        {
          type: 'checkbox',
          code: 'س12 (أ)',
          title: 'هل هناك عملاء أو خدمات تشترط عمالاً بعينهم؟',
          help: 'لماذا نسأل: يحدد القواعد التي يتبعها النظام حين يقترح عاملاً أو بديلاً، فلا يقترح من لا يقبله العميل (8، 9، 25).',
          options: [
            'العامل نفسه في كل زيارة (كما في استمارتي المؤسسات والعمارات)',
            'عاملات فقط داخل المنازل',
            'عامل يتقن آلة معينة',
            'لا توجد شروط',
          ],
          other: true,
          required: true,
        },
        { type: 'paragraph', code: 'س12 (ب)', title: 'تفاصيل هذه الشروط إن وُجدت' },
      ],
    },
    {
      title: 'الأسعار والعقود',
      items: [
        {
          type: 'choice',
          code: 'س13 (أ)',
          title: 'هل ستبيعون باقات جاهزة بأسعار ثابتة، أم تسعّرون كل عميل بعد المعاينة؟',
          help: 'لماذا نسأل: الباقات تعني قائمة أسعار جاهزة في النظام؛ التسعير بعد المعاينة يعني حساباً لكل عميل (4، 5).',
          options: [
            'باقات جاهزة بأسعار ثابتة',
            'تسعير كل عميل بعد المعاينة',
            'باقات للخدمات البسيطة، ومعاينة للباقي',
          ],
          undecided: true,
          required: true,
        },
        {
          type: 'choice',
          code: 'س13 (ب)',
          title: 'إن اعتمدتم الباقات، بأي تقسيم؟',
          help: 'الدراسة تقترح باقات تختلف في عدد الزيارات والخدمات (للعمارات: BASIC مرتين وSTANDARD ثلاث مرات وPREMIUM ست مرات أسبوعياً؛ وللمكاتب حسب عدد الزيارات؛ وللمنازل حسب نوع الخدمة)، بينما تذكر استمارة معاينة العمارات أربعة مستويات دون تعريفها.',
          options: [
            'باقات الدراسة (BASIC، STANDARD، PREMIUM وغيرها)',
            'أربعة مستويات: أساسي، قياسي، متقدم، شامل',
            'لا ينطبق: لا باقات',
          ],
          other: true,
          undecided: true,
        },
        {
          type: 'header',
          title: 'س14 (أ) · على أي أساس تحسبون السعر في كل قسم؟',
          help: 'يمكن اختيار أكثر من أساس. استمارات المعاينة تحسبه من التكلفة زائد هامش الربح، واستمارة تسجيل العمارات تقترح أيضاً السعر لكل زيارة أو حسب المداخل أو الطوابق أو المساحة. لماذا نسأل: يحدد طريقة الحساب لكل قسم (4، 30).',
        },
        ...DIVISIONS.map((division) => ({
          type: 'checkbox',
          code: 'س14 (أ)',
          title: division + ': أساس حساب السعر',
          options: PRICE_BASES,
          other: true,
          required: true,
        })),
        {
          type: 'choice',
          code: 'س14 (ب)',
          title: 'هل تدخل في حساب السعر حصة من المصاريف الإدارية والضرائب والتأمين؟',
          help: 'الدراسة تضيفها إلى التكلفة، واستمارات المعاينة تكتفي بالتكاليف المباشرة (أجور، مواد، نقل، معدات، إشراف، احتياط).',
          options: ['نعم، كما في الدراسة', 'لا، التكاليف المباشرة فقط كما في الاستمارات'],
          undecided: true,
          required: true,
        },
        {
          type: 'paragraph',
          code: 'س14 (ج)',
          title: 'ما الخدمات التي تسعّرونها بالهاتف دون معاينة، وعلى أي أساس؟',
          help: 'مثلاً: تنظيف دوري لشقة، بالساعة أو بالغرفة أو بسعر ثابت. لماذا نسأل: يحدد هل نضيف حاسبة سريعة لأسعار الهاتف.',
          required: true,
        },
        {
          type: 'checkbox',
          code: 'س15 (أ)',
          title: 'كيف تفوترون؟',
          help: 'الاستمارات تذكر الثلاثة، ويمكن اختيار أكثر من طريقة حسب نوع العميل. لماذا نسأل: يحدد كيف يحسب النظام الفواتير وما يُكتب في العقد عن الغياب والإلغاء (6، 19).',
          options: ['بعد كل خدمة', 'أسبوعياً', 'شهرياً'],
          required: true,
        },
        {
          type: 'choice',
          code: 'س15 (ب)',
          title: 'في العقود الشهرية، متى تصدر الفاتورة وبأي مبلغ؟',
          options: [
            'مبلغ ثابت في بداية الشهر (دفع مسبق كما تنصح الدراسة)',
            'في نهاية الشهر حسب الزيارات المنجزة فعلاً',
          ],
          other: true,
          undecided: true,
          required: true,
        },
        {
          type: 'choice',
          code: 'س15 (ج)',
          title: 'إذا فاتت زيارة دون بديل، ماذا يحدث؟',
          options: ['تُخصم من الفاتورة', 'تُعوَّض بزيارة أخرى', 'حسب ما يُتفق عليه في كل عقد'],
          undecided: true,
          required: true,
        },
        {
          type: 'choice',
          code: 'س15 (د)',
          title: 'إذا ألغى العميل في آخر لحظة أو لم يفتح الباب، هل تُحتسب الزيارة عليه؟',
          options: ['نعم، تُحتسب', 'لا، لا تُحتسب', 'تُحتسب إذا تكرر ذلك'],
          other: true,
          undecided: true,
          required: true,
        },
      ],
    },
    {
      title: 'الفواتير والدفع',
      items: [
        {
          type: 'choice',
          code: 'س16 (أ)',
          title: 'ما نظامكم الضريبي؟',
          help: 'محاسبكم يعرف الجواب. لماذا نسأل: النظام الضريبي يغيّر شكل الفاتورة وطريقة حساب مبالغها (31).',
          options: [
            'نفوتر بالرسم على القيمة المضافة (TVA)',
            'نظام الضريبة الجزافية الوحيدة (IFU)',
            'لا أعرف، سأسأل المحاسب',
          ],
          required: true,
        },
        {
          type: 'choice',
          code: 'س16 (ب)',
          title: 'هل يشترط القانون أن تصدر الفواتير أو تُسجَّل المبيعات من برنامج معتمد؟',
          help: 'اسألوا محاسبكم. إن كان البرنامج المعتمد شرطاً، نبني النظام ليستوفيه أو نربطه ببرنامج فوترة معتمد.',
          options: ['نعم', 'لا', 'لم أسأل المحاسب بعد'],
          required: true,
        },
        { type: 'paragraph', code: 'س16 (ج)', title: 'ما قاله المحاسب بالتفصيل' },
        {
          type: 'choice',
          code: 'س17 (أ)',
          title: 'هل تتوقعون عملاء من الإدارات العمومية أو الشركات الكبيرة؟',
          help: 'استمارة تسجيل المؤسسات تتضمن القطاع العام. لماذا نسأل: إن نعم نضيف وثائقهم الخاصة ونتابع آجال الدفع الطويلة في التحصيل (19، 20).',
          options: ['نعم، من البداية', 'ربما لاحقاً', 'لا'],
          required: true,
        },
        {
          type: 'checkbox',
          code: 'س17 (ب)',
          title: 'ما الوثائق الخاصة التي يطلبها هؤلاء العملاء؟',
          options: ['شهادة إنجاز الخدمة كل شهر', 'استلام موقّع ومختوم', 'لا أعرف بعد', 'لا ينطبق'],
          other: true,
        },
        {
          type: 'choice',
          code: 'س18 (أ)',
          title: 'عندما يدفع عميل منزلي نقداً في نهاية الخدمة، من يقبض المال؟',
          help: 'الدراسة تقول إن العاملة لا تمسك المال إلا بنظام رسمي. لماذا نسأل: الجواب يحدد هل نفعّل سند القبض والمطابقة اليومية (32).',
          options: ['العامل', 'المشرف', 'يدفع العميل للمكتب فقط'],
          other: true,
          undecided: true,
          required: true,
        },
        {
          type: 'choice',
          code: 'س18 (ب)',
          title: 'هل تطلبون عربوناً قبل بعض الخدمات؟',
          help: 'مثلاً قبل التنظيف بعد البناء. لماذا نسأل: يحدد هل نسجّل العربون قبل الخدمة (20).',
          options: ['نعم', 'لا'],
          undecided: true,
          required: true,
        },
        { type: 'text', code: 'س18 (ج)', title: 'إن نعم، لأي خدمات وبأي نسبة؟' },
        {
          type: 'choice',
          code: 'س19',
          title: 'هل تريدون أن يدفع العملاء بالبطاقة الذهبية أو CIB من رابط في الفاتورة؟',
          help: 'يتطلب اتفاقاً مع بنك أو مزوّد دفع. لماذا نسأل: الدفع بالبطاقة ربط إضافي نؤجله إلى مرحلة النمو ما لم تحتاجوه من البداية (43).',
          options: [
            'نعم، من البداية',
            'لاحقاً في مرحلة النمو',
            'لا، يكفي تسجيل ما يُدفع نقداً أو عبر CCP أو التحويل أو الصك',
          ],
          undecided: true,
          required: true,
        },
      ],
    },
    {
      title: 'التواصل مع العملاء',
      items: [
        {
          type: 'header',
          title: 'س20 · أي توقيع يكفي لكل وثيقة؟',
          help: 'لماذا نسأل: يحدد هل تكون التوقيعات رقمية فقط أم نطبع الوثائق أيضاً (2، 5، 15).',
        },
        ...SIGNED_DOCUMENTS.map((document) => ({
          type: 'choice',
          code: 'س20',
          title: document + ': أي توقيع يكفي؟',
          options: [
            'توقيع على شاشة الهاتف يكفي',
            'ورقة موقّعة ومختومة لبعض العملاء، خاصة المؤسسات',
            'ورقة موقّعة ومختومة دائماً',
          ],
          undecided: true,
          required: true,
        })),
        {
          type: 'header',
          title: 'س21 · بأي لغة يعمل النظام وتصدر الوثائق؟',
          help: 'مثلاً فواتير بالفرنسية للشركات وتطبيق بالعربية للعمال. لماذا نسأل: اللغتان معاً تعني أن تُكتب كل شاشة ووثيقة بالاثنتين.',
        },
        ...LANGUAGE_TARGETS.map((target) => ({
          type: 'choice',
          code: 'س21',
          title: target + ': بأي لغة؟',
          options: ['العربية', 'الفرنسية', 'اللغتان'],
          undecided: true,
          required: true,
        })),
        {
          type: 'choice',
          code: 'س22',
          title: 'هل تريدون أن يتعامل العملاء مع النظام مباشرة منذ البداية؟',
          help: 'مثلاً رابط لتأكيد الموعد أو للتقييم أو لرؤية الفواتير. لماذا نسأل: صفحة العميل مؤجلة إلى مرحلة النمو (44)؛ إن احتجتموها من البداية ننقلها إلى الانطلاق.',
          options: [
            'نعم، منذ البداية',
            'لا، يمر كل شيء عبر المكتب بالهاتف وواتساب',
            'لاحقاً في مرحلة النمو',
          ],
          undecided: true,
          required: true,
        },
      ],
    },
    {
      title: 'توحيد ما تختلف فيه الوثائق',
      items: [
        {
          type: 'choice',
          code: 'س23 (أ)',
          title: 'كيف نرقّم الوثائق؟',
          help: 'وثائقكم تعطي الشيء نفسه رموزاً مختلفة (العميل CL أو CUS أو CL-H، المعاينة VIS أو INS، العرض QT أو Q، العقد CT أو CTR أو CON، العامل W أو EMP). نقترح ترقيماً واحداً للأقسام الثلاثة بحرف يدل على نوع الوثيقة: CL للعميل، INS للمعاينة، Q للعرض، CTR للعقد، JOB للمهمة. لماذا نسأل: النظام يرقّم تلقائياً ويحتاج صيغة واحدة (24).',
          options: ['أوافق على الترقيم المقترح', 'أفضّل حرفاً يميّز القسم أيضاً (مثل H للمنازل)'],
          other: true,
          required: true,
        },
        {
          type: 'choice',
          code: 'س23 (ب)',
          title: 'هل نعتمد مراحل واحدة لملف العميل في الأقسام الثلاثة؟',
          help: 'المراحل المقترحة: جديد، معاينة، عرض سعر، متعاقد أو لم يتم التعاقد، ثم نشط أو متوقف أو منتهٍ. قوائم «حالة الملف» تختلف بين استماراتكم. لماذا نسأل: النظام يتابع المراحل تلقائياً ويحتاج قائمة واحدة (2).',
          options: ['أوافق على المراحل المقترحة', 'أريد تعديلها'],
          required: true,
        },
        {
          type: 'choice',
          code: 'س23 (ج)',
          title: 'هل نعتمد حالات واحدة للمهمة؟',
          help: 'الحالات المقترحة: مؤكدة، بانتظار التأكيد، جارية، منفذة، مؤجلة، مشكلة، ملغاة. الدراسة تستعمل خمسة ألوان، واستمارة معاينة المنازل قائمة أخرى (10).',
          options: ['أوافق على الحالات المقترحة', 'أريد تعديلها'],
          required: true,
        },
        {
          type: 'paragraph',
          code: 'س23 (د)',
          title: 'إن أردتم تعديل المراحل أو الحالات، اكتبوا القائمة التي تريدونها',
        },
        {
          type: 'paragraph',
          code: 'س24 (أ-1)',
          title: 'ماذا يعني «التصنيف الأولي للعميل» A–D في استمارة المؤسسات؟',
          help: 'الاستمارة لا تعرّفه. لماذا نسأل: إن كان للتصنيف أثر (أولوية، سعر، مشرف) نبنيه في النظام وإلا نحذفه (2).',
          required: true,
        },
        {
          type: 'choice',
          code: 'س24 (أ-2)',
          title: 'الحروف A إلى E تعني في وثائقكم أشياء مختلفة. هل نحتفظ بها؟',
          help: 'تعني تكرار العقد في الدراسة، ومستوى الخدمة في معاينة المنازل، ودرجة الصعوبة في معاينة المؤسسات.',
          options: ['نستعمل أسماء صريحة بدل الحروف', 'نحتفظ بالحروف'],
          undecided: true,
          required: true,
        },
        {
          type: 'choice',
          code: 'س24 (ب)',
          title: 'أي سلّم نعتمد لدرجة الصعوبة؟',
          help: 'في وثائقكم ثلاثة سلالم. لماذا نسأل: السلّم الموحد يسمح بمقارنة المعاينات (3، 7).',
          options: [
            'أربع درجات: سهل، متوسط، صعب، صعب جداً (استمارتا المنازل)',
            'ثلاث درجات لكل مساحة: 1، 2، 3 (معاينة المنازل)',
            'خمس درجات من A إلى E (معاينة المؤسسات)',
          ],
          undecided: true,
          required: true,
        },
        {
          type: 'choice',
          code: 'س24 (ج)',
          title: 'أي سلّم نعتمد لحالة النظافة؟',
          help: 'تُقاس في وثائقكم بسلالم من ثلاث إلى خمس درجات بتسميات مختلفة.',
          options: [
            'ثلاث درجات: جيدة، متوسطة، سيئة',
            'أربع درجات: جيدة، متوسطة، ضعيفة، متدهورة',
            'خمس درجات: ممتازة، جيدة، متوسطة، ضعيفة، متدهورة',
          ],
          other: true,
          undecided: true,
          required: true,
        },
        {
          type: 'choice',
          code: 'س25 (أ)',
          title: 'كيف تقيسون الجودة؟',
          help: 'لماذا نسأل: يحدد شكل استمارة التفتيش والتقييم، وعدد زيارات التفتيش، والحدود التي تطلق إجراءً أو تنبيهاً (15، 17، 18).',
          options: [
            'درجة من 100 مع إجراء تحت 80 (كما في الدراسة)',
            'تقدير من خمس درجات، من «ممتاز» إلى «يحتاج إلى إعادة» (كما في بطاقة التوجيه)',
          ],
          other: true,
          undecided: true,
          required: true,
        },
        {
          type: 'choice',
          code: 'س25 (ب)',
          title: 'كم مرة يزور المشرف كل عقد للتفتيش؟',
          help: 'تذكر الدراسة زيارة أسبوعية، ومراقبة شهرية في مثال عقد العمارة.',
          options: ['كل أسبوع', 'كل أسبوعين', 'كل شهر', 'حسب حجم العقد'],
          other: true,
          undecided: true,
          required: true,
        },
        {
          type: 'choice',
          code: 'س25 (ج)',
          title: 'ما الوقت المستهدف للرد على الشكوى؟',
          help: 'تقترح الدراسة ساعتين في أوقات العمل مثلاً.',
          options: ['خلال ساعتين في أوقات العمل', 'في اليوم نفسه', 'خلال 24 ساعة'],
          other: true,
          undecided: true,
          required: true,
        },
        {
          type: 'choice',
          code: 'س25 (د)',
          title: 'بأي معايير يقيّم العميل الخدمة؟',
          options: [
            'أربعة معايير: النظافة، الالتزام، السلوك، الجودة (كما في الدراسة)',
            'خمسة معايير مع سؤال «هل توصي بنا؟»: جودة التنظيف، الالتزام بالموعد، سلوك العاملة، جودة المواد، التقييم العام (كما في ملف المنازل)',
          ],
          other: true,
          undecided: true,
          required: true,
        },
      ],
    },
    {
      title: 'نطاق الانطلاق',
      items: [
        {
          type: 'checkbox',
          code: 'س26 (أ)',
          title: 'أي خصائص مرحلة النمو تحتاجونها من اليوم الأول؟',
          help: 'الأرقام هي أرقام الخصائص في الخطة. لماذا نسأل: هذا يحدد مباشرة ما نبنيه أولاً.',
          options: LATER_FEATURES,
          required: true,
        },
        {
          type: 'paragraph',
          code: 'س26 (ب)',
          title: 'هل في قائمة الانطلاق (الخصائص 1 إلى 33) ما لا تحتاجونه؟',
          help: 'اذكروا أرقام الخصائص، أو اكتبوا «لا».',
          required: true,
        },
        { type: 'paragraph', title: 'ملاحظات أخرى على الخطة' },
      ],
    },
  ],
};

/** Entry point: creates the form and logs its links. */
function createQuestionsForm() {
  const form = FormApp.create(FORM.title);
  form.setDescription(FORM.description);
  form.setConfirmationMessage(FORM.confirmation);
  form.setProgressBar(true);
  form.setAllowResponseEdits(true);
  form.setCollectEmail(false);
  form.setLimitOneResponsePerUser(false);
  form.setShowLinkToRespondAgain(false);

  FORM.sections.forEach((section) => {
    form.addPageBreakItem().setTitle(section.title);
    section.items.forEach((spec) => addItem(form, spec));
  });

  publish(form);

  const answerUrl = form.getPublishedUrl();
  Logger.log('Edit link (yours): %s', form.getEditUrl());
  Logger.log('Answer link (send to the client): %s', answerUrl);
  const separator = answerUrl.indexOf('?') === -1 ? '?' : '&';
  Logger.log('Same link with the Arabic interface forced: %s', answerUrl + separator + 'hl=ar');
  return { editUrl: form.getEditUrl(), answerUrl: answerUrl };
}

function addItem(form, spec) {
  let item;
  switch (spec.type) {
    case 'header':
      item = form.addSectionHeaderItem();
      break;
    case 'choice':
      item = form.addMultipleChoiceItem();
      break;
    case 'checkbox':
      item = form.addCheckboxItem();
      break;
    case 'text':
      item = form.addTextItem();
      break;
    case 'paragraph':
      item = form.addParagraphTextItem();
      break;
    default:
      throw new Error('Unknown item type: ' + spec.type);
  }

  item.setTitle(spec.code ? spec.code + ' ' + spec.title : spec.title);
  if (spec.help) item.setHelpText(spec.help);
  if (spec.type === 'header') return;

  if (spec.type === 'choice' || spec.type === 'checkbox') {
    const options = spec.undecided ? spec.options.concat(UNDECIDED) : spec.options;
    item.setChoiceValues(options);
    if (spec.other) item.showOtherOption(true);
  }
  item.setRequired(Boolean(spec.required));
}

/**
 * Forms created since 2025 must be published before anyone can answer.
 * Older accounts don't have the publish setting; their forms are open as soon as they exist.
 */
function publish(form) {
  try {
    if (form.supportsAdvancedResponderPermissions()) form.setPublished(true);
  } catch (e) {
    Logger.log(
      'Could not confirm the form is published (%s). Open the edit link; if you see a Publish button, click it.',
      e.message
    );
  }
}
