/**
 * Travel Corner shell — Atlas Journal editorial system.
 * It pairs a composed navigation and utility footer with language-aware routes and configuration-safe actions.
 */
import { Menu, MessageCircle, X, ArrowUpRight, ChevronRight } from "lucide-react";
import { ReactNode, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { assetUrls, Language, siteCopy } from "@/data/travelData";
import { trpc } from "@/lib/trpc";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

type LayoutProps = { lang: Language; children: ReactNode; active?: string };

const navKeys = ["destinations", "packages", "umrah", "services", "plan", "about", "inspiration", "contact"] as const;

export function TravelLayout({ lang, children, active }: LayoutProps) {
  const [, navigate] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: settings } = trpc.travel.settings.useQuery();
  const t = siteCopy[lang];
  const isAr = lang === "ar";

  const destinationFor = (key: string, targetLanguage = lang) => {
    const base = `/${targetLanguage}`;
    if (key === "home") return base;
    if (key === "plan") return `${base}/plan-your-trip`;
    return `${base}/${key}`;
  };

  const switchLanguage = () => {
    const current = window.location.pathname;
    const next = lang === "en" ? "ar" : "en";
    const normalized = current === "/" ? `/${next}` : current.replace(/^\/(en|ar)/, `/${next}`);
    navigate(normalized);
  };

  const openWhatsApp = (context?: string) => {
    const message = context ?? (isAr ? "مرحباً ترافل كورنر، أود الاستفسار عن أحد العروض." : "Hello Travel Corner, I would like to ask about one of your offers.");
    const url = buildWhatsAppUrl(settings?.whatsappNumber, message);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="site-shell" dir={isAr ? "rtl" : "ltr"} lang={lang}>
      <div className="site-note">
        <span className="signal-dot" aria-hidden="true" />
        <span>{isAr ? "الأسعار وتواريخ السفر تخضع لتأكيد فريق ترافل كورنر قبل الحجز." : "Rates and travel dates are confirmed by the Travel Corner team before booking."}</span>
      </div>
      <header className="site-header">
        <button className="brand-lockup official-lockup" onClick={() => navigate(destinationFor("home"))} aria-label="Travel Corner home">
          <img className="brand-mark official-brand-mark" src={assetUrls.mark} alt="Travel Corner" />
          <span className="official-wordmark" dir="ltr"><b>Travel</b><em>Corner</em><i aria-hidden="true" /></span>
        </button>
        <nav className="desktop-nav" aria-label={isAr ? "التنقل الأساسي" : "Primary navigation"}>
          {navKeys.slice(0, 5).map((key) => (
            <button className={`nav-link ${active === key ? "is-active" : ""}`} key={key} onClick={() => navigate(destinationFor(key))}>
              {t.nav[key]}
            </button>
          ))}
        </nav>
        <div className="header-actions">
          <button className="language-toggle" onClick={switchLanguage} aria-label={isAr ? "التبديل إلى الإنجليزية" : "Switch to Arabic"}>
            <span>{isAr ? "EN" : "ع"}</span>
          </button>
          <button className="header-cta" onClick={() => navigate(destinationFor("plan"))}>
            <span>{t.plan}</span><ArrowUpRight size={16} strokeWidth={2.2} />
          </button>
          <button className="menu-trigger" onClick={() => setMobileOpen(true)} aria-label={isAr ? "فتح القائمة" : "Open menu"}><Menu size={22} /></button>
        </div>
      </header>

      {mobileOpen && (
        <div className="mobile-menu" role="dialog" aria-modal="true" aria-label={isAr ? "قائمة التنقل" : "Navigation menu"}>
          <div className="mobile-menu-head">
            <div className="brand-lockup static official-lockup"><img className="brand-mark official-brand-mark" src={assetUrls.mark} alt="Travel Corner" /><span className="official-wordmark" dir="ltr"><b>Travel</b><em>Corner</em><i aria-hidden="true" /></span></div>
            <button className="menu-close" onClick={() => setMobileOpen(false)} aria-label={isAr ? "إغلاق القائمة" : "Close menu"}><X size={23} /></button>
          </div>
          <div className="mobile-nav-links">
            <button onClick={() => { navigate(destinationFor("home")); setMobileOpen(false); }}>{t.nav.home}<ChevronRight size={20} /></button>
            {navKeys.map((key) => <button key={key} onClick={() => { navigate(destinationFor(key)); setMobileOpen(false); }}>{t.nav[key]}<ChevronRight size={20} /></button>)}
          </div>
          <div className="mobile-menu-bottom">
            <button className="header-cta full" onClick={() => { navigate(destinationFor("plan")); setMobileOpen(false); }}>{t.plan}<ArrowUpRight size={17} /></button>
            <button className="language-toggle wide" onClick={switchLanguage}>{isAr ? "English version" : "النسخة العربية"}</button>
          </div>
        </div>
      )}

      <main>{children}</main>

      <footer className="site-footer">
        <div className="footer-top">
          <div className="footer-brand"><div className="brand-lockup static official-lockup"><img className="brand-mark official-brand-mark" src={assetUrls.mark} alt="Travel Corner" /><span className="official-wordmark" dir="ltr"><b>Travel</b><em>Corner</em><i aria-hidden="true" /></span></div><p>{isAr ? "ركنك الهادئ لخطة سفر مدروسة، من أول فكرة حتى لحظة الانطلاق." : "Your considered corner for travel that begins with a better conversation."}</p></div>
          <div className="footer-links"><span>{isAr ? "استكشف" : "Explore"}</span>{(["destinations", "packages", "umrah", "inspiration"] as const).map((key) => <button key={key} onClick={() => navigate(destinationFor(key))}>{t.nav[key]}</button>)}</div>
          <div className="footer-links"><span>{isAr ? "خطط" : "Plan"}</span>{(["services", "plan", "contact"] as const).map((key) => <button key={key} onClick={() => navigate(destinationFor(key))}>{t.nav[key]}</button>)}</div>
          <div className="footer-status"><span className="status-label">{isAr ? "للحجز والاستفسار" : "Bookings & enquiries"}</span>{settings?.primaryPhone && <p>{settings.primaryPhone}</p>}{settings?.whatsappNumber && <button onClick={() => openWhatsApp()}>{isAr ? `واتساب ${settings.whatsappNumber}` : `WhatsApp ${settings.whatsappNumber}`}<ArrowUpRight size={16} /></button>}<button onClick={() => navigate(destinationFor("contact"))}>{t.contact}<ArrowUpRight size={16} /></button></div>
        </div>
        <div className="footer-bottom"><span>© {new Date().getFullYear()} Travel Corner</span><span>{isAr ? "الأسعار وتواريخ السفر تخضع للتأكيد قبل الحجز." : "Rates and travel dates are confirmed before booking."}</span></div>
      </footer>
      {settings?.whatsappNumber && <button className="whatsapp-float" onClick={() => openWhatsApp()} aria-label={t.whatsapp}><MessageCircle size={20} /><span>{isAr ? "واتساب" : "WhatsApp"}</span></button>}
    </div>
  );
}
