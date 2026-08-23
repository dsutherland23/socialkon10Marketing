import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { CONTACT, CURRENCIES, DEPARTMENTS, type CurrencyCode } from "../lib/data";
import { useRouteDept } from "../lib/dept";
import { useShop } from "../lib/shop";
import { useTheme } from "../lib/theme";
import { ShuffleText } from "../lib/motion";

function Wordmark() {
  return (
    <Link to="/" className="flex items-center gap-2.5 shrink-0" aria-label="Social Kon10 Marketing — home">
      <img src="/assets/sk-mark.png" alt="" width={34} height={22} className="h-[24px] w-auto" />
      <span className="leading-none">
        <span className="font-display-wide block text-[13px] sm:text-[15px] font-bold tracking-tight">SOCIAL KON10</span>
        <span className="font-meta hidden sm:block mt-1 text-[9px] text-[var(--muted)]">Marketing</span>
      </span>
    </Link>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const order = ["light", "dark", "system"] as const;
  const next = order[(order.indexOf(theme) + 1) % order.length];
  return (
    <button
      onClick={() => setTheme(next)}
      className="hidden sm:inline-flex font-meta text-[10px] px-2 py-1 border border-[var(--line)] hover:border-[var(--dept)] hover:text-[var(--dept)] transition-colors"
      aria-label={`Theme: ${theme}. Switch to ${next}.`}
      title={`Theme: ${theme} → ${next}`}
    >
      {theme === "light" ? "LIGHT" : theme === "dark" ? "DARK" : "AUTO"}
    </button>
  );
}

function CurrencySelect() {
  const { currency, setCurrency } = useShop();
  return (
    <label className="hidden lg:inline-flex items-center gap-1 font-meta text-[10px]">
      <span className="sr-only">Display currency</span>
      <select
        value={currency}
        onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
        className="bg-transparent border border-[var(--line)] px-2 py-1 cursor-pointer hover:border-[var(--dept)] transition-colors"
      >
        {CURRENCIES.map((c) => <option key={c.code} value={c.code} className="text-black">{c.code}</option>)}
      </select>
    </label>
  );
}

function ServicesMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div
      className="absolute left-0 right-0 top-full border-b border-[var(--line)]"
      style={{ background: "var(--bg)" }}
      role="menu"
    >
      <div className="wrap grid md:grid-cols-3 gap-0">
        {DEPARTMENTS.map((d) => (
          <NavLink
            key={d.id}
            to={d.path}
            onClick={onClose}
            role="menuitem"
            className="group block border-t md:border-t-0 md:border-l first:border-l-0 border-[var(--line)] px-6 py-8 hover:bg-[var(--dept-soft)] transition-colors"
            style={{ ["--dept" as string]: undefined }}
            data-dept-link={d.id}
          >
            <span className="idx">{d.index}</span>
            <span className="font-display block text-xl font-bold uppercase mt-2 group-hover:translate-x-1 transition-transform duration-200">
              {d.name}
            </span>
            <span className="font-meta text-[10px] text-[var(--muted)] block mt-2">
              {d.personality.slice(0, 3).join(" · ")}
            </span>
          </NavLink>
        ))}
      </div>
      {/* bridge: department services → the design store (findability) */}
      <div className="rule-t">
        <NavLink
          to="/graphic-design-branding/design-store"
          onClick={onClose}
          role="menuitem"
          className="group wrap flex items-center justify-between py-4 hover:text-[var(--dept)] transition-colors"
        >
          <span className="font-meta text-[10px] text-[var(--muted)] group-hover:text-[var(--dept)] transition-colors">
            60+ design services with live pricing — flyers, logos, cards, banners
          </span>
          <span className="font-meta text-[10px] dept-accent">BROWSE THE STORE →</span>
        </NavLink>
      </div>
    </div>
  );
}

export function SiteHeader({ onOpenCommand }: { onOpenCommand: () => void }) {
  const [servicesOpen, setServicesOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [shuffleDept, setShuffleDept] = useState<string | null>(null);
  const { count } = useShop();
  const routeDept = useRouteDept();
  const navigate = useNavigate();
  const headerRef = useRef<HTMLElement>(null);

  // close menus on route change / escape
  useEffect(() => {
    const close = () => { setServicesOpen(false); setMobileOpen(false); setMoreOpen(false); };
    window.addEventListener("popstate", close);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("popstate", close); window.removeEventListener("keydown", esc); };
  }, []);

  // subtle elevation once the page scrolls
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // click-outside for services + more menus
  useEffect(() => {
    if (!servicesOpen && !moreOpen) return;
    const fn = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) { setServicesOpen(false); setMoreOpen(false); }
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [servicesOpen, moreOpen]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  const navCls = ({ isActive }: { isActive: boolean }) =>
    `u-line font-meta text-[11px] whitespace-nowrap ${isActive ? "text-[var(--dept)]" : ""}`;

  return (
    <header ref={headerRef} className="sticky top-0 z-50" style={{ background: "var(--bg)" }}>
      {/* signature border-line motif: dept accent bar + hairline */}
      <div className="h-[3px] dept-bg transition-colors duration-500" aria-hidden />
      <div className="rule-b" style={{ boxShadow: scrolled ? "0 10px 34px rgb(0 0 0 / 0.07)" : "none", transition: "box-shadow 0.25s" }}>
        <div className="wrap flex items-center justify-between gap-4 h-16">
          <Wordmark />

          {/* desktop nav — only at xl+; below that the drawer takes over (no overflow, no wrap) */}
          <nav className="hidden xl:flex items-center gap-6" aria-label="Primary">
            <button
              className={`font-meta text-[11px] u-line whitespace-nowrap ${servicesOpen || routeDept ? "text-[var(--dept)]" : ""}`}
              aria-expanded={servicesOpen}
              aria-haspopup="menu"
              onClick={() => { setServicesOpen((v) => !v); setMoreOpen(false); }}
              onMouseEnter={() => { setServicesOpen(true); setMoreOpen(false); }}
            >
              Services {servicesOpen ? "—" : "+"}
            </button>
            <NavLink to="/work" className={navCls}>Work</NavLink>
            <NavLink to="/packages" className={navCls}>Packages</NavLink>
            <NavLink to="/graphic-design-branding/design-store" className={navCls}>Store</NavLink>
            <NavLink to="/templates" className={navCls}>Templates</NavLink>
            <div className="relative">
              <button
                className={`font-meta text-[11px] u-line whitespace-nowrap ${moreOpen ? "text-[var(--dept)]" : ""}`}
                aria-expanded={moreOpen}
                aria-haspopup="menu"
                onClick={() => { setMoreOpen((v) => !v); setServicesOpen(false); }}
              >
                More {moreOpen ? "—" : "+"}
              </button>
              {moreOpen && (
                <div className="absolute right-0 top-full mt-3 border border-[var(--line)] min-w-[168px] py-1.5 z-50"
                  style={{ background: "var(--bg)", boxShadow: "0 18px 44px rgb(0 0 0 / 0.10)" }} role="menu">
                  {[["/about", "About"], ["/insights", "Insights"], ["/client", "Client portal"], ["/custom-package", "Build a package"]].map(([to, label]) => (
                    <NavLink key={to} to={to} role="menuitem" onClick={() => setMoreOpen(false)}
                      className="block px-4 py-2.5 font-meta text-[11px] hover:text-[var(--dept)] hover:bg-[var(--dept-soft)] transition-colors">
                      {label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          </nav>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <CurrencySelect />
            <ThemeToggle />
            <button
              onClick={onOpenCommand}
              className="hidden sm:inline-flex font-meta text-[10px] px-2 py-1 border border-[var(--line)] hover:border-[var(--dept)] hover:text-[var(--dept)] transition-colors items-center gap-1.5"
              aria-label="Open command menu"
            >
              <span aria-hidden>⌘</span>K
            </button>
            <Link to="/checkout" className="font-meta text-[11px] u-line whitespace-nowrap" aria-label={`Cart, ${count} items`}>
              Cart {String(count).padStart(2, "0")}
            </Link>
            <Link to="/start" className="btn btn-fill hidden sm:inline-flex !py-2.5 !px-4 whitespace-nowrap">
              Start a project <span className="btn-arrow" aria-hidden>→</span>
            </Link>
            <button
              className="xl:hidden p-2 -mr-2"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((v) => !v)}
            >
              <span className="block w-6 h-[2px] bg-current mb-1.5 transition-transform" style={mobileOpen ? { transform: "translateY(4px) rotate(45deg)" } : {}} />
              <span className="block w-6 h-[2px] bg-current transition-transform" style={mobileOpen ? { transform: "translateY(-4px) rotate(-45deg)" } : {}} />
            </button>
          </div>
        </div>

        <div onMouseLeave={() => setServicesOpen(false)}>
          <ServicesMenu open={servicesOpen} onClose={() => setServicesOpen(false)} />
        </div>
      </div>

      {/* mobile drawer */}
      {mobileOpen && (
        <div className="xl:hidden fixed inset-0 top-[67px] z-40 overflow-y-auto rule-t" style={{ background: "var(--bg)" }}>
          <nav className="wrap py-8 flex flex-col gap-1" aria-label="Mobile">
            <span className="font-meta text-[10px] text-[var(--muted)] mb-2">Services</span>
            {DEPARTMENTS.map((d) => (
              <button
                key={d.id}
                className="text-left py-3 border-b border-[var(--line)] group"
                onMouseEnter={() => setShuffleDept(d.id)}
                onMouseLeave={() => setShuffleDept(null)}
                onClick={() => { setMobileOpen(false); navigate(d.path); }}
              >
                <span className="idx mr-3">{d.index}</span>
                <span className="font-display text-2xl font-bold uppercase">
                  <ShuffleText text={d.name} play={shuffleDept === d.id} />
                </span>
              </button>
            ))}
            <div className="mt-6 flex flex-col gap-1">
              {[["/work", "Work"], ["/packages", "Packages"], ["/graphic-design-branding/design-store", "Design Store"], ["/templates", "Templates"], ["/custom-package", "Build a Package"], ["/about", "About"], ["/insights", "Insights"], ["/client", "Client portal"], ["/start", "Contact"]].map(([to, label]) => (
                <Link key={to} to={to} onClick={() => setMobileOpen(false)} className="py-3 border-b border-[var(--line)] font-display text-2xl font-bold uppercase">
                  {label}
                </Link>
              ))}
            </div>
            <Link to="/start" onClick={() => setMobileOpen(false)} className="btn btn-dept mt-8 justify-center">
              Start a project <span className="btn-arrow" aria-hidden>→</span>
            </Link>
            <p className="font-meta text-[10px] text-[var(--muted)] mt-8">
              {CONTACT.phone} · {CONTACT.email} · {CONTACT.location}
            </p>
          </nav>
        </div>
      )}
    </header>
  );
}
