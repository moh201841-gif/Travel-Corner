/**
 * Travel Corner data architecture — Atlas Journal editorial system.
 * Sample content is deliberately isolated from view components so verified CMS data can replace it later.
 */
export type Language = "en" | "ar";

export type Localized = Record<Language, string>;

export interface Destination {
  slug: string;
  region: Localized;
  name: Localized;
  hook: Localized;
  image: string;
  imageAlt: Localized;
}

export interface TravelPackage {
  slug: string;
  title: Localized;
  destination: Localized;
  duration: Localized;
  tripType: Localized;
  badge: Localized;
  description: Localized;
  highlights: Localized[];
  inclusions: Localized[];
  exclusions: Localized[];
  itinerary: Array<{ day: Localized; title: Localized; detail: Localized }>;
  image: string;
  gallery: string[];
}

export const assetUrls = {
  hero: "/manus-storage/travel-corner-hero_7b834ed9.jpg",
  alps: "/manus-storage/travel-corner-paris-alps_6e640794.jpg",
  maldives: "/manus-storage/travel-corner-maldives_08394876.jpg",
  dubai: "/manus-storage/travel-corner-dubai_9f765ca5.jpg",
  mark: "/manus-storage/travel-corner-official-logo_25ee64eb.jpg",
  sharm: "/manus-storage/travel-corner-sharm-editorial_a1a4794f.jpg",
  hurghada: "/manus-storage/travel-corner-hurghada-editorial_79677206.jpg",
  umrah: "/manus-storage/travel-corner-umrah-editorial_32b3518d.jpg",
};

export const destinations: Destination[] = [
  {
    slug: "sharm-el-sheikh",
    region: { en: "Egypt holidays", ar: "عطلات مصر" },
    name: { en: "Sharm El Sheikh", ar: "شرم الشيخ" },
    hook: { en: "Red Sea stays with clear hotel, board, transfer, and date information.", ar: "إقامات البحر الأحمر مع معلومات واضحة عن الفندق والوجبات والانتقالات والتواريخ." },
    image: assetUrls.sharm,
    imageAlt: { en: "A calm Red Sea bay near Sharm El Sheikh", ar: "خليج هادئ على البحر الأحمر بالقرب من شرم الشيخ" },
  },
  {
    slug: "hurghada",
    region: { en: "Egypt holidays", ar: "عطلات مصر" },
    name: { en: "Hurghada", ar: "الغردقة" },
    hook: { en: "Structured beach-holiday offers across Al Ahyaa, Sahl Hasheesh, and the Promenade.", ar: "عروض عطلات شاطئية منظمة عبر الأحياء وسهل حشيش والممشى السياحي." },
    image: assetUrls.hurghada,
    imageAlt: { en: "A quiet Hurghada shoreline in warm morning light", ar: "شاطئ هادئ في الغردقة بضوء صباح دافئ" },
  },
  {
    slug: "umrah",
    region: { en: "Umrah", ar: "العمرة" },
    name: { en: "Umrah programs", ar: "برامج العمرة" },
    hook: { en: "A respectful program view with stays, flight notes, and room-type pricing kept distinct.", ar: "عرض محترم للبرامج مع الإقامات وملاحظات الطيران وأسعار أنواع الغرف بشكل واضح." },
    image: assetUrls.umrah,
    imageAlt: { en: "A calm architectural approach around Masjid al-Haram at dawn", ar: "مشهد معماري هادئ حول المسجد الحرام وقت الفجر" },
  },
];

export const packages: TravelPackage[] = [
  {
    slug: "alpine-weekend-sample",
    title: { en: "Alpine Weekends", ar: "عطلة نهاية أسبوع في الألب" },
    destination: { en: "Swiss Alps · Sample itinerary", ar: "جبال الألب السويسرية · برنامج تجريبي" },
    duration: { en: "5 days / 4 nights", ar: "5 أيام / 4 ليالٍ" },
    tripType: { en: "Couples & friends", ar: "للأزواج والأصدقاء" },
    badge: { en: "Sample itinerary", ar: "برنامج تجريبي" },
    description: {
      en: "A sample high-country route built around lakeside stays, light trails, and long, unplanned lunches.",
      ar: "مسار تجريبي في المرتفعات يجمع بين الإقامة قرب البحيرات، والمسارات الخفيفة، والغداء الطويل بلا استعجال.",
    },
    highlights: [
      { en: "Flexible city-to-mountain pacing", ar: "إيقاع مرن بين المدينة والجبال" },
      { en: "Scenic rail concept", ar: "فكرة تنقل بالقطار وسط مناظر طبيعية" },
      { en: "Private planning consultation", ar: "استشارة تخطيط خاصة" },
    ],
    inclusions: [
      { en: "Planning consultation", ar: "استشارة تخطيط" },
      { en: "Sample route outline", ar: "مخطط مسار تجريبي" },
      { en: "Accommodation preference matching", ar: "مطابقة تفضيلات الإقامة" },
    ],
    exclusions: [
      { en: "Airfare and live hotel availability", ar: "تذاكر الطيران وتوفر الفنادق الفعلي" },
      { en: "Visa requirements", ar: "متطلبات التأشيرة" },
    ],
    itinerary: [
      { day: { en: "Day 01", ar: "اليوم 01" }, title: { en: "Arrive and settle", ar: "الوصول والاستقرار" }, detail: { en: "A calm arrival window and an orientation to the neighbourhood you choose.", ar: "وقت وصول هادئ وتعريف بالمنطقة التي تختارها." } },
      { day: { en: "Day 02", ar: "اليوم 02" }, title: { en: "Follow the lake line", ar: "على امتداد البحيرة" }, detail: { en: "Build your day around a scenic connection and a place worth lingering in.", ar: "صمّم يومك حول رحلة خلابة ومكان يستحق البقاء فيه." } },
      { day: { en: "Day 03", ar: "اليوم 03" }, title: { en: "Choose your altitude", ar: "اختر ارتفاعك" }, detail: { en: "A flexible mountain day shaped around your pace, weather, and interests.", ar: "يوم جبلي مرن يتشكل وفق سرعتك والطقس واهتماماتك." } },
    ],
    image: assetUrls.alps,
    gallery: [assetUrls.alps, assetUrls.hero, assetUrls.dubai],
  },
  {
    slug: "maldives-honeymoon-sample",
    title: { en: "Maldives, Slowly", ar: "المالديف على مهل" },
    destination: { en: "Maldives · Sample honeymoon route", ar: "المالديف · مسار شهر عسل تجريبي" },
    duration: { en: "6 days / 5 nights", ar: "6 أيام / 5 ليالٍ" },
    tripType: { en: "Honeymoon", ar: "شهر عسل" },
    badge: { en: "Sample itinerary", ar: "برنامج تجريبي" },
    description: {
      en: "A sample honeymoon rhythm with room for stillness, thoughtful surprises, and time together.",
      ar: "إيقاع تجريبي لشهر العسل يترك مساحة للهدوء والمفاجآت المدروسة والوقت معاً.",
    },
    highlights: [
      { en: "Stay-style consultation", ar: "استشارة لاختيار أسلوب الإقامة" },
      { en: "Pace-first itinerary design", ar: "تصميم برنامج يبدأ من إيقاعكما" },
      { en: "Celebration notes captured early", ar: "تسجيل تفاصيل المناسبة مبكراً" },
    ],
    inclusions: [
      { en: "Trip-design call", ar: "مكالمة تصميم الرحلة" },
      { en: "Sample day-by-day flow", ar: "تسلسل يومي تجريبي" },
      { en: "Celebration preference notes", ar: "تسجيل تفضيلات الاحتفال" },
    ],
    exclusions: [
      { en: "Confirmed resort booking", ar: "حجز منتجع مؤكد" },
      { en: "Live rate quote", ar: "عرض سعر مباشر" },
    ],
    itinerary: [
      { day: { en: "Day 01", ar: "اليوم 01" }, title: { en: "Land softly", ar: "بداية هادئة" }, detail: { en: "Make arrival day intentionally quiet rather than over-scheduled.", ar: "اجعلا يوم الوصول هادئاً عن قصد بدلاً من ملئه بالأنشطة." } },
      { day: { en: "Day 02", ar: "اليوم 02" }, title: { en: "The water is the plan", ar: "الماء هو الخطة" }, detail: { en: "Leave room for water time, one memorable meal, and very little else.", ar: "اتركا مساحة للوقت على الماء ووجبة لا تُنسى والقليل جداً من غير ذلك." } },
      { day: { en: "Day 03", ar: "اليوم 03" }, title: { en: "A shared occasion", ar: "مناسبة مشتركة" }, detail: { en: "A private celebration moment designed around the way you want to remember it.", ar: "لحظة احتفال خاصة تُصمم بالطريقة التي تودان تذكرها بها." } },
    ],
    image: assetUrls.maldives,
    gallery: [assetUrls.maldives, assetUrls.hero, assetUrls.alps],
  },
  {
    slug: "dubai-city-break-sample",
    title: { en: "Dubai After Hours", ar: "دبي بعد الغروب" },
    destination: { en: "Dubai · Sample city break", ar: "دبي · عطلة مدينة تجريبية" },
    duration: { en: "4 days / 3 nights", ar: "4 أيام / 3 ليالٍ" },
    tripType: { en: "Short escape", ar: "عطلة قصيرة" },
    badge: { en: "Sample itinerary", ar: "برنامج تجريبي" },
    description: {
      en: "A sample city escape that trades rush-hour checklists for well-timed, memorable moments.",
      ar: "عطلة مدينة تجريبية تستبدل قوائم العجلة بلحظات مدروسة وسهلة التذكر.",
    },
    highlights: [
      { en: "Neighbourhood-led plan", ar: "خطة تقودها الأحياء" },
      { en: "Heat-aware timing", ar: "مواعيد تراعي حرارة الجو" },
      { en: "Flexible evening suggestions", ar: "اقتراحات مسائية مرنة" },
    ],
    inclusions: [
      { en: "Personalized route framework", ar: "إطار مسار مخصص" },
      { en: "Travel timing notes", ar: "ملاحظات لمواعيد السفر" },
      { en: "Experience preference check", ar: "مراجعة تفضيلات التجارب" },
    ],
    exclusions: [
      { en: "Attraction tickets", ar: "تذاكر المعالم" },
      { en: "Transport reservations", ar: "حجوزات المواصلات" },
    ],
    itinerary: [
      { day: { en: "Day 01", ar: "اليوم 01" }, title: { en: "Find your district", ar: "اكتشف منطقتك" }, detail: { en: "Arrive with a clear, neighbourhood-first sense of the city.", ar: "استكشف المدينة بفكرة واضحة تبدأ من الحي الذي يناسبك." } },
      { day: { en: "Day 02", ar: "اليوم 02" }, title: { en: "Frame the city", ar: "شاهد المدينة من زاويتك" }, detail: { en: "Choose one architectural moment, one local table, and time to wander.", ar: "اختر لحظة معمارية ووجبة محلية ووقتاً للتجول." } },
      { day: { en: "Day 03", ar: "اليوم 03" }, title: { en: "A cooler evening", ar: "مساء ألطف" }, detail: { en: "Save the city’s better rhythm for the evening.", ar: "احتفظ بإيقاع المدينة الأجمل للمساء." } },
    ],
    image: assetUrls.dubai,
    gallery: [assetUrls.dubai, assetUrls.hero, assetUrls.maldives],
  },
];

export const siteCopy = {
  en: {
    nav: { home: "Home", destinations: "Destinations", packages: "Egypt holidays", umrah: "Umrah", services: "Services", plan: "Plan your trip", about: "About", inspiration: "Inspiration", contact: "Contact" },
    sample: "Campaign reference", explore: "Explore offers", plan: "Plan my trip", contact: "Contact us", find: "Find my trip", details: "View offer", quote: "Ask about this offer", whatsapp: "WhatsApp Travel Corner", availability: "Confirm availability", back: "Back to offers",
  },
  ar: {
    nav: { home: "الرئيسية", destinations: "الوجهات", packages: "عطلات مصر", umrah: "العمرة", services: "الخدمات", plan: "خطط رحلتك", about: "عن ترافل كورنر", inspiration: "إلهام السفر", contact: "تواصل معنا" },
    sample: "مرجع حملة", explore: "استكشف العروض", plan: "خطط رحلتي", contact: "تواصل معنا", find: "ابحث عن عرض", details: "اطّلع على العرض", quote: "اسأل عن هذا العرض", whatsapp: "واتساب ترافل كورنر", availability: "تأكد من التوفر", back: "العودة إلى العروض",
  },
} as const;

export const localize = (value: Localized, lang: Language) => value[lang];
