/**
 * Travel Corner homepage — Atlas Journal editorial system.
 * The front page uses cinematic imagery, asymmetrical chapters, and specific inquiry paths instead of generic travel-template blocks.
 */
import { ArrowUpRight, Bus, CalendarDays, ChevronDown, Compass, Hotel, MapPin, MessageCircle, Search, ShieldCheck, Sparkles, Users } from "lucide-react";
import { FormEvent, useState } from "react";
import { useLocation } from "wouter";
import { assetUrls, destinations, Language, localize, siteCopy } from "@/data/travelData";
import { TravelLayout } from "@/components/TravelLayout";
import { trpc } from "@/lib/trpc";

type HomeOffer = {
  id: number;
  slug: string;
  destinationEn: string;
  destinationAr: string;
  hotelNameEn: string;
  hotelNameAr: string;
  areaEn?: string | null;
  areaAr?: string | null;
  days: number;
  nights: number;
  mealPlanEn: string;
  mealPlanAr: string;
  transportationIncluded: boolean;
  imageUrl?: string | null;
  rates: Array<{ price: string | number }>;
};

function HomeOfferCard({ lang, item }: { lang: Language; item: HomeOffer }) {
  const [, navigate] = useLocation();
  const t = siteCopy[lang];
  const isAr = lang === "ar";
  const rate = item.rates[0];
  const image = item.imageUrl || (item.destinationEn === "Hurghada" ? assetUrls.hurghada : assetUrls.sharm);

  return (
    <article className="package-card home-offer-card">
      <div className="package-corner" aria-hidden="true"><span className="signal-dot" /><i /></div>
      <div className="package-image-wrap">
        <img src={image} alt={isAr ? item.hotelNameAr : item.hotelNameEn} />
        <span className="sample-pill">{isAr ? "أسعار الحملة" : "Campaign rates"}</span>
        <span className="package-badge">{isAr ? item.destinationAr : item.destinationEn}</span>
      </div>
      <div className="package-card-body">
        <p className="card-meta"><MapPin size={14} />{isAr ? item.areaAr : item.areaEn}</p>
        <h3>{isAr ? item.hotelNameAr : item.hotelNameEn}</h3>
        <div className="package-facts">
          <span><CalendarDays size={15} />{isAr ? `${item.days} أيام / ${item.nights} ليالٍ` : `${item.days} days / ${item.nights} nights`}</span>
          <span><Hotel size={15} />{isAr ? item.mealPlanAr : item.mealPlanEn}</span>
          <span><Bus size={15} />{item.transportationIncluded ? (isAr ? "انتقالات مشمولة" : "Transfers included") : (isAr ? "تفاصيل العرض" : "Offer details")}</span>
        </div>
        {rate && <p className="offer-home-rate"><span>{isAr ? "سعر مرجعي يبدأ من" : "Campaign rate from"}</span><strong>{new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(rate.price))} {isAr ? "ج.م" : "EGP"}</strong></p>}
        <button className="text-link" onClick={() => navigate(`/${lang}/packages/${item.slug}`)}>{t.details}<ArrowUpRight size={17} /></button>
      </div>
    </article>
  );
}

export default function Home({ lang = "en" }: { lang?: Language }) {
  const [, navigate] = useLocation();
  const t = siteCopy[lang];
  const isAr = lang === "ar";
  const [destination, setDestination] = useState("");
  const [tripType, setTripType] = useState("");
  const { data: featuredOffers } = trpc.travel.offers.useQuery();

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    if (destination === "umrah") return navigate(`/${lang}/umrah`);
    const query = destination ? `?destination=${encodeURIComponent(destination)}` : "";
    navigate(`/${lang}/packages${query}`);
  };

  return (
    <TravelLayout lang={lang} active="home">
      <section className="hero-section">
        <img className="hero-image" src={assetUrls.sharm} alt={isAr ? "ساحل هادئ على البحر الأحمر" : "A calm Red Sea coastline"} />
        <div className="hero-image-overlay" />
        <div className="hero-content">
          <div className="hero-eyebrow"><span className="signal-dot" />{isAr ? "ركنك من العالم" : "Your corner of the world"}</div>
          <h1>{isAr ? <>بعض الرحلات تبدأ <em>بمكان.</em><br />الأفضل تبدأ <em>بإحساس.</em></> : <>Some journeys start with <em>a place.</em><br />The best ones start with <em>a feeling.</em></>}</h1>
          <p>{isAr ? "من أول فكرة حتى آخر تفصيلة، نساعدك على ترتيب رحلة تشبهك — بهدوء ووضوح." : "From the first idea to the details that matter, we help shape a trip that feels like you — calmly and clearly."}</p>
          <div className="hero-buttons"><button className="primary-button" onClick={() => navigate(`/${lang}/packages`)}>{t.explore}<ArrowUpRight size={17} /></button><button className="hero-secondary" onClick={() => navigate(`/${lang}/plan-your-trip`)}>{t.plan}<span>↗</span></button></div>
        </div>
        <form className="hero-search" onSubmit={submitSearch}>
          <div className="search-field"><label htmlFor="home-destination"><Compass size={17} />{isAr ? "الوجهة" : "Destination"}</label><select id="home-destination" value={destination} onChange={(event) => setDestination(event.target.value)}><option value="">{isAr ? "إلى أين؟" : "Where to?"}</option>{destinations.map((item) => <option key={item.slug} value={item.slug}>{localize(item.name, lang)}</option>)}</select></div>
          <div className="search-field muted"><label><CalendarDays size={17} />{isAr ? "التاريخ" : "Travel date"}</label><span>{isAr ? "اختر موعد السفر" : "Choose travel month"}</span></div>
          <div className="search-field muted"><label><Users size={17} />{isAr ? "المسافرون" : "Travellers"}</label><span>{isAr ? "عدد المسافرين" : "Number of travellers"}</span></div>
          <div className="search-field"><label htmlFor="home-trip-type"><Sparkles size={17} />{isAr ? "نوع الرحلة" : "Trip style"}</label><select id="home-trip-type" value={tripType} onChange={(event) => setTripType(event.target.value)}><option value="">{isAr ? "اختر نوع الرحلة" : "Choose trip style"}</option><option>{isAr ? "عائلة" : "Family"}</option><option>{isAr ? "أكوا بارك" : "Aqua park"}</option><option>{isAr ? "عمرة" : "Umrah"}</option></select></div>
          <button type="submit" aria-label={t.find}><Search size={19} /><span>{t.find}</span></button>
        </form>
      </section>

      <section className="intro-strip"><span className="section-kicker">{isAr ? "طريقة ترافل كورنر" : "The Travel Corner way"}</span><p>{isAr ? <>لا نبدأ بقائمة طويلة. نبدأ بسؤال بسيط: <strong>كيف تريد أن تشعر في هذه الرحلة؟</strong></> : <>We don’t start with a long list. We start with one useful question: <strong>How do you want this trip to feel?</strong></>}</p><button onClick={() => navigate(`/${lang}/about`)}>{isAr ? "تعرف علينا" : "Meet our approach"}<ArrowUpRight size={18} /></button></section>

      <section className="seo-travel-guide section-shell" aria-labelledby="travel-planning-guide-title">
        <div className="seo-guide-intro"><span className="section-kicker">{isAr ? "دليل تخطيط السفر" : "Travel planning guide"}</span><h2 id="travel-planning-guide-title">{isAr ? "عطلات مصر وبرامج العمرة بخطة سفر واضحة" : "Egypt holidays and Umrah travel planning, made clearer"}</h2></div>
        {isAr ? <div className="seo-guide-copy"><p>تساعدك ترافل كورنر على تحويل فكرة السفر إلى خطوات عملية، سواء كنت تبحث عن عطلات مصر على البحر الأحمر أو برنامج عمرة منظم. تبدأ الخطة من الوقت المتاح ونوع الإقامة وعدد المسافرين، ثم تجمع التفاصيل التي تؤثر في القرار: الفندق، المنطقة، عدد الليالي، الوجبات، الانتقالات، وفترة صلاحية السعر. هذا الأسلوب يجعل مقارنة الخيارات أسهل قبل أن تطلب التأكيد النهائي من فريق السفر.</p><p>لعطلات شرم الشيخ والغردقة، يمكنك <a href={`/${lang}/packages`}>تصفّح عروض فنادق مصر</a> بحسب الوجهة ومعلومات الإقامة. تعرض كل بطاقة التفاصيل الأساسية في مكان واحد حتى تعرف ما يشمله العرض وما يحتاج إلى تأكيد. إذا كنت تبحث عن مسار ديني، انتقل إلى <a href={`/${lang}/umrah`}>برامج العمرة</a> للاطلاع على تاريخ المغادرة، الإقامة في مكة والمدينة، وخيارات أسعار الإشغال قبل التواصل مع الفريق.</p><h3>اختر التفاصيل التي تصنع فرقاً في الرحلة</h3><p>لا تتشابه كل الإقامات أو البرامج حتى عندما تكون الوجهة واحدة. فكر في إيقاع اليوم، وقرب الفندق من النشاط الذي تفضله، ونوع الوجبات، ومن يسافر معك. يمكنك <a href={`/${lang}/plan-your-trip`}>تصميم رحلة خاصة</a> عندما تحتاج إلى اقتراح يناسب ميزانيتك وأولوياتك بدلاً من قالب ثابت. للمعلومات العامة عن وجهات مصر، راجع <a href="https://www.experienceegypt.eg/" target="_blank" rel="noopener noreferrer">دليل Experience Egypt الرسمي</a>، ثم اترك لفريق ترافل كورنر مهمة تأكيد التوفر والسعر النهائي قبل أي حجز.</p></div> : <div className="seo-guide-copy"><p>Travel Corner helps turn an early idea into a practical travel plan, whether you are considering Egypt holidays on the Red Sea or an organised Umrah journey. Planning starts with your available time, preferred stay, and traveller count, then brings together the details that shape a decision: hotel, area, nights, board basis, transfers, and the validity of each rate. This approach makes it easier to compare meaningful options before asking the travel team for final confirmation.</p><p>For Sharm El Sheikh and Hurghada, you can <a href={`/${lang}/packages`}>browse Egypt hotel offers</a> by destination and stay information. Each offer brings the core details together so you can see what is included and what still needs to be confirmed. If you are planning a religious journey, visit the <a href={`/${lang}/umrah`}>Umrah programs</a> page to review departure timing, Makkah and Madinah accommodation, and occupancy prices before speaking with the team.</p><h3>Choose the travel details that matter most</h3><p>Not every hotel stay or program is alike, even in the same destination. Think about the rhythm of the day, proximity to the experiences you prefer, board basis, and who is travelling with you. You can <a href={`/${lang}/plan-your-trip`}>plan a tailored trip</a> when you need a route shaped around your budget and priorities rather than a fixed template. For general destination inspiration, explore the official <a href="https://www.experienceegypt.eg/" target="_blank" rel="noopener noreferrer">Experience Egypt travel guide</a>, then let Travel Corner confirm availability and the final rate before any booking.</p></div>}
      </section>

      <section className="section-shell destinations-section"><div className="section-heading split-heading"><div><span className="section-kicker">{isAr ? "اختيارات ترافل كورنر" : "Travel Corner choices"}</span><h2>{isAr ? <>أماكن تبدأ منها<br /><em>خطوة أهدأ.</em></> : <>Places that begin<br /><em>a calmer step.</em></>}</h2></div><div><p>{isAr ? "شرم الشيخ والغردقة وبرامج العمرة؛ كل مسار له معلوماته وخطوة واضحة للاستفسار." : "Sharm El Sheikh, Hurghada, and Umrah programs; each route has its own information and a clear next step."}</p><button className="text-link" onClick={() => navigate(`/${lang}/destinations`)}>{isAr ? "كل الوجهات" : "All destinations"}<ArrowUpRight size={18} /></button></div></div><div className="destination-rail">{destinations.map((destination, index) => <button className="destination-card" key={destination.slug} onClick={() => navigate(destination.slug === "umrah" ? `/${lang}/umrah` : `/${lang}/packages`)}><img src={destination.image} alt={localize(destination.imageAlt, lang)} /><div className="destination-card-overlay" /><div className="destination-card-content"><span>0{index + 1} · {localize(destination.region, lang)}</span><h3>{localize(destination.name, lang)}</h3><p>{localize(destination.hook, lang)}</p><i><ArrowUpRight size={18} /></i></div></button>)}</div></section>

      <section className="section-shell package-section"><div className="package-section-top"><div><span className="section-kicker">{isAr ? "عروض فنادق مصر" : "Egypt hotel offers"}</span><h2>{isAr ? <>تفاصيل أقرب<br />لقرار <em>أوضح.</em></> : <>Details closer to<br /><em>a clearer decision.</em></>}</h2></div><div className="sample-explainer"><span className="sample-pill">{isAr ? "أسعار الحملة" : "Campaign rates"}</span><p>{isAr ? "تُعرض أسعار وتواريخ الحملة بشكل منظم، ثم يؤكد الفريق التوفر قبل أي حجز." : "Campaign rates and date windows are structured here; the team confirms availability before any booking."}</p></div></div><div className="package-grid">{(featuredOffers ?? []).slice(0, 3).map((item) => <HomeOfferCard key={item.id} lang={lang} item={item as HomeOffer} />)}</div><button className="section-end-link" onClick={() => navigate(`/${lang}/packages`)}>{isAr ? "تصفّح كل عروض مصر" : "Browse all Egypt offers"}<ArrowUpRight size={18} /></button></section>

      <section className="trust-section"><div className="trust-visual"><img src={assetUrls.hero} alt="" /><div className="trust-visual-note"><span className="signal-dot" />{isAr ? "أفضل خطة تبدأ بالاستماع" : "Better plans begin with listening"}</div></div><div className="trust-copy"><span className="section-kicker light">{isAr ? "لماذا ترافل كورنر" : "Why Travel Corner"}</span><h2>{isAr ? <>رحلة مرتبة<br />بدون أن تفقد <em>روحها.</em></> : <>A considered trip<br />without losing <em>its spirit.</em></>}</h2><div className="trust-points"><article><ShieldCheck size={22} /><div><h3>{isAr ? "خيارات أوضح" : "Clearer choices"}</h3><p>{isAr ? "بدلاً من التفاصيل المتناثرة، نرتب ما يغيّر قرارك فعلاً." : "Instead of scattered details, organise what actually changes your decision."}</p></div></article><article><MessageCircle size={22} /><div><h3>{isAr ? "حوار حقيقي" : "A real conversation"}</h3><p>{isAr ? "تبدأ الخطة من التفضيلات التي تشاركها، لا من افتراضات جاهزة." : "The route starts from preferences you share, not a prewritten assumption."}</p></div></article><article><Sparkles size={22} /><div><h3>{isAr ? "إيقاع يناسبك" : "Your pace, respected"}</h3><p>{isAr ? "المساحة والراحة والتوقيت جزء من تصميم الرحلة." : "Space, comfort, and timing are part of the trip design."}</p></div></article></div><button className="hero-secondary light" onClick={() => navigate(`/${lang}/about`)}>{isAr ? "كيف نخطط الرحلات" : "How we plan"}<ArrowUpRight size={17} /></button></div></section>

      <section className="tailored-section"><div className="tailored-index">03</div><div><span className="section-kicker">{isAr ? "رحلتك الخاصة" : "A trip of your own"}</span><h2>{isAr ? "ليس عليك أن تعرف كل التفاصيل الآن." : "You don’t need every detail yet."}</h2></div><div><p>{isAr ? "أخبرنا بالوجهة، والوقت، ونوع اليوم الذي تحلم به. أربع خطوات بسيطة تحوّل الفكرة إلى نقطة بداية واضحة." : "Tell us the destination, the timing, and the kind of day you imagine. Four small steps turn that thought into a clear starting point."}</p><button className="primary-button" onClick={() => navigate(`/${lang}/plan-your-trip`)}>{isAr ? "صمّم رحلتك" : "Design your trip"}<ArrowUpRight size={17} /></button></div></section>

      <section className="section-shell inspiration-home"><div className="inspiration-side"><span className="section-kicker">{isAr ? "إلهام السفر" : "Travel inspiration"}</span><h2>{isAr ? <>اقرأ المكان<br />قبل أن <em>تصل.</em></> : <>Read a place<br />before you <em>arrive.</em></>}</h2><p>{isAr ? "ملاحظات سفر مفيدة قبل الحجز — التفصيل الصحيح في الوقت الصحيح." : "Useful travel notes before you book — the right detail at the right time."}</p><button className="text-link" onClick={() => navigate(`/${lang}/inspiration`)}>{isAr ? "اقرأ ملاحظات السفر" : "Read travel notes"}<ArrowUpRight size={18} /></button></div><div className="inspiration-stack">{destinations.slice(0, 2).map((destination, index) => <button key={destination.slug} onClick={() => navigate(`/${lang}/inspiration`)}><img src={destination.image} alt="" /><div><span>{isAr ? "ملاحظات سفر" : "Travel notes"} · 0{index + 1}</span><h3>{isAr ? `ملاحظات تخطيط: ${localize(destination.name, lang)}` : `Planning notes: ${localize(destination.name, lang)}`}</h3></div></button>)}</div></section>

      <section className="faq-home section-shell"><div><span className="section-kicker">{isAr ? "أسئلة مفيدة" : "A few useful questions"}</span><h2>{isAr ? "الوضوح من البداية." : "Clarity from the start."}</h2></div><div className="faq-list"><details><summary>{isAr ? "هل يمكنني أن أطلب رحلة مخصصة؟" : "Can I request a tailored trip?"}<ChevronDown size={19} /></summary><p>{isAr ? "نعم. صفحة تصميم الرحلة تجمع فكرتك وتُسجلها لفريق ترافل كورنر، ثم نتابع معك للتفاصيل." : "Yes. The custom-trip page records your idea for the Travel Corner team, who then follow up on the details."}</p></details><details><summary>{isAr ? "هل الأسعار متاحة للحجز الآن؟" : "Are the campaign rates bookable now?"}<ChevronDown size={19} /></summary><p>{isAr ? "يؤكد فريق ترافل كورنر التوفر والسعر النهائي قبل إنشاء أي حجز." : "The Travel Corner team confirms availability and the final rate before creating any booking."}</p></details><details><summary>{isAr ? "كيف أستفسر عبر واتساب؟" : "How do I enquire on WhatsApp?"}<ChevronDown size={19} /></summary><p>{isAr ? "استخدم زر واتساب في الموقع أو نموذج العرض؛ كلاهما يستخدم رقم ترافل كورنر الرسمي." : "Use the WhatsApp button or an offer enquiry form; both use the official Travel Corner number."}</p></details></div></section>
      <section className="final-cta"><div><span className="signal-dot" />{isAr ? "خطوتك التالية" : "Your next step"}</div><h2>{isAr ? <>دعنا نترك لك<br />شيئاً يستحق <em>التذكر.</em></> : <>Let’s leave you with<br />something worth <em>remembering.</em></>}</h2><button className="primary-button" onClick={() => navigate(`/${lang}/plan-your-trip`)}>{t.plan}<ArrowUpRight size={17} /></button></section>
    </TravelLayout>
  );
}
