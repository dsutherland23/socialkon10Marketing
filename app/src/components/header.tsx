import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { CONTACT, CURRENCIES, DEPARTMENTS, type CurrencyCode } from "../lib/data";
import { fxStatus, getRate } from "../lib/rates";
import { useRouteDept } from "../lib/dept";
import { useShop } from "../lib/shop";
import { useDesignPackage } from "../lib/design-shop";
import { useTheme } from "../lib/theme";
import { ShuffleText } from "../lib/motion";
import { useAuth } from "../lib/auth";
import { firebaseReady } from "../lib/firebase";
import { subscribeMyOrders, orderHasUnreadStudioMessage } from "../lib/backend";


function Wordmark() {
  return (
    <Link to="/" className="flex items-center gap-3 shrink-0 group" aria-label="Social Kon10 Marketing — home">
      <img
        src="/assets/sk-mark.png"
        alt="Social Kon10 Logo"
        width={42}
        height={33}
        className="h-[34px] sm:h-[38px] w-auto object-contain shrink-0 group-hover:scale-105 transition-transform duration-200"
      />
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
  const { currency, setCurrency, fxLive } = useShop();
  const fx = fxStatus();
  const rate = currency !== "USD" ? getRate(currency) : 1;
  const age = fx.fetchedAt ? new Date(fx.fetchedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : null;
  return (
    <label className="inline-flex items-center gap-1 font-meta text-[10px]">
      <span className="sr-only">Display currency</span>
      <select
        value={currency}
        onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
        aria-label="Display currency"
        title={currency === "USD" || currency === "BMD"
          ? "US Dollar — all charges settle in USD"
          : fxLive
            ? `Live rate: $1 USD = ${currency === "JMD" ? "J$" : "C$"}${rate.toFixed(2)} (updated ${age}) · display only — charges settle in USD`
            : `Estimated rate: $1 USD = ${currency === "JMD" ? "J$" : "C$"}${rate.toFixed(2)} · display only — charges settle in USD`}
        className="bg-transparent border border-[var(--line)] px-1.5 py-1 sm:px-2 rounded-lg cursor-pointer hover:border-[var(--dept)] transition-colors text-[10px] font-bold outline-none"
      >
        {CURRENCIES.map((c) => <option key={c.code} value={c.code} className="text-black">{c.code}</option>)}
      </select>
      {currency !== "USD" && currency !== "BMD" && (
        <span
          className={`w-1.5 h-1.5 rounded-full ${fxLive ? "bg-emerald-500" : "bg-amber-500"}`}
          title={fxLive ? "Live exchange rate" : "Estimated rate (feed unavailable)"}
          role="img"
          aria-label={fxLive ? "Live exchange rate" : "Estimated rate"}
        />
      )}
    </label>
  );
}

function StoreMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="absolute left-0 right-0 top-full border-b border-[var(--line)] shadow-2xl z-50 animate-in fade-in slide-in-from-top-1 duration-150"
      style={{ background: "var(--bg)" }}
      role="menu"
      aria-label="Store menu"
    >
      <div className="wrap py-7">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-5 border-b border-[var(--line)] gap-2">
          <div>
            <span className="font-meta text-[10px] uppercase tracking-wider text-[var(--dept)] font-bold">Social Kon10 Store & Marketplace</span>
            <h3 className="font-display text-lg font-bold uppercase tracking-tight text-[var(--text)] mt-0.5">Purchasing & Digital Products</h3>
          </div>
          <div className="hidden lg:flex items-center gap-3 text-[10.5px] font-meta text-[var(--muted)]">
            <span className="text-cyan-400 font-medium">✓ Built-in KON10 Studio Editor</span>
            <span>·</span>
            <span>✓ Instant Digital Downloads</span>
            <span>·</span>
            <span>✓ Commercial License Included</span>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Templates & Live Editor */}
          <NavLink
            to="/templates"
            onClick={onClose}
            role="menuitem"
            className="group block p-4 sm:p-5 rounded-xl border border-[var(--line)] hover:border-cyan-500/50 hover:bg-cyan-500/[0.04] transition-all relative overflow-hidden flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-2xl" aria-hidden>🎨</span>
                <span className="font-meta text-[8.5px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                  LIVE EDITOR BUILT-IN
                </span>
              </div>
              <h4 className="font-display text-base font-bold uppercase text-[var(--text)] group-hover:text-cyan-400 transition-colors">
                Templates & Editor
              </h4>
              <p className="font-meta text-[11px] text-[var(--muted)] mt-1.5 leading-relaxed">
                DIY editable flyer, social & branding templates. Open & customize live in your browser using our built-in <strong>KON10 Studio editor</strong> — no software required!
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-[var(--line)] flex items-center justify-between text-[11px] font-meta">
              <span className="text-cyan-400 font-bold group-hover:translate-x-0.5 transition-transform">Browse Templates →</span>
              <span className="text-[var(--muted)] text-[10px]">Instant Access</span>
            </div>
          </NavLink>

          {/* Card 2: Packages */}
          <NavLink
            to="/packages"
            onClick={onClose}
            role="menuitem"
            className="group block p-4 sm:p-5 rounded-xl border border-[var(--line)] hover:border-amber-500/50 hover:bg-amber-500/[0.04] transition-all relative overflow-hidden flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-2xl" aria-hidden>📦</span>
                <span className="font-meta text-[8.5px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  SAVE UP TO 30%
                </span>
              </div>
              <h4 className="font-display text-base font-bold uppercase text-[var(--text)] group-hover:text-amber-400 transition-colors">
                Design Packages
              </h4>
              <p className="font-meta text-[11px] text-[var(--muted)] mt-1.5 leading-relaxed">
                Curated turnkey branding and marketing bundles. Get logos, business cards, social media kits, and web assets bundled together with volume savings.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-[var(--line)] flex items-center justify-between text-[11px] font-meta">
              <span className="text-amber-400 font-bold group-hover:translate-x-0.5 transition-transform">View Packages →</span>
              <span className="text-[var(--muted)] text-[10px]">Turnkey Packs</span>
            </div>
          </NavLink>

          {/* Card 3: Design Store */}
          <NavLink
            to="/graphic-design-branding/design-store"
            onClick={onClose}
            role="menuitem"
            className="group block p-4 sm:p-5 rounded-xl border border-[var(--line)] hover:border-emerald-500/50 hover:bg-emerald-500/[0.04] transition-all relative overflow-hidden flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-2xl" aria-hidden>🏷️</span>
                <span className="font-meta text-[8.5px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  DONE-FOR-YOU
                </span>
              </div>
              <h4 className="font-display text-base font-bold uppercase text-[var(--text)] group-hover:text-emerald-400 transition-colors">
                Design Services Store
              </h4>
              <p className="font-meta text-[11px] text-[var(--muted)] mt-1.5 leading-relaxed">
                60+ à la carte custom design services — event flyers, logo marks, business cards, roll-up banners, and menus with transparent instant pricing.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-[var(--line)] flex items-center justify-between text-[11px] font-meta">
              <span className="text-emerald-400 font-bold group-hover:translate-x-0.5 transition-transform">Shop 60+ Services →</span>
              <span className="text-[var(--muted)] text-[10px]">Instant Pricing</span>
            </div>
          </NavLink>

          {/* Card 4: Build a Custom Package */}
          <NavLink
            to="/custom-package"
            onClick={onClose}
            role="menuitem"
            className="group block p-4 sm:p-5 rounded-xl border border-[var(--line)] hover:border-purple-500/50 hover:bg-purple-500/[0.04] transition-all relative overflow-hidden flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-2xl" aria-hidden>🛠️</span>
                <span className="font-meta text-[8.5px] font-bold px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/30">
                  CUSTOM BUNDLER
                </span>
              </div>
              <h4 className="font-display text-base font-bold uppercase text-[var(--text)] group-hover:text-purple-400 transition-colors">
                Build a Package
              </h4>
              <p className="font-meta text-[11px] text-[var(--muted)] mt-1.5 leading-relaxed">
                Interactive package builder. Select your exact deliverables to calculate live price estimates and unlock automated tiered volume discounts.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-[var(--line)] flex items-center justify-between text-[11px] font-meta">
              <span className="text-purple-400 font-bold group-hover:translate-x-0.5 transition-transform">Build Your Bundle →</span>
              <span className="text-[var(--muted)] text-[10px]">Volume Discounts</span>
            </div>
          </NavLink>
        </div>
      </div>
    </div>
  );
}

function ServicesMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="absolute left-0 right-0 top-full border-b border-[var(--line)] shadow-2xl z-50 animate-in fade-in slide-in-from-top-1 duration-150"
      style={{ background: "var(--bg)" }}
      role="menu"
      aria-label="Services menu"
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

type MenuId = "services" | "store" | "company";

/** 2026 hover-intent: small delay before open, grace period before close —
 *  prevents accidental triggers and lets the pointer travel diagonally into panels. */
function useMenuIntent() {
  const [openMenu, setOpenMenu] = useState<MenuId | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  const openNow = (m: MenuId | null) => { clear(); setOpenMenu(m); };
  const openIntent = (m: MenuId) => { clear(); timer.current = setTimeout(() => setOpenMenu(m), 120); };
  const closeIntent = () => { clear(); timer.current = setTimeout(() => setOpenMenu(null), 220); };
  const toggle = (m: MenuId) => { clear(); setOpenMenu((cur) => (cur === m ? null : m)); };
  useEffect(() => clear, []);
  return { openMenu, openNow, openIntent, closeIntent, toggle };
}

/** Unified dropdown indicator — one rotating chevron everywhere. */
function Chevron({ open }: { open: boolean }) {
  return (
    <span
      aria-hidden
      className="inline-block text-[9px] opacity-70 transition-transform duration-200"
      style={{ transform: open ? "rotate(180deg)" : "none" }}
    >▾</span>
  );
}

export function SiteHeader({ onOpenCommand }: { onOpenCommand: () => void }) {
  const { openMenu, openNow, openIntent, closeIntent, toggle } = useMenuIntent();
  const servicesOpen = openMenu === "services";
  const storeOpen = openMenu === "store";
  const companyOpen = openMenu === "company";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [shuffleDept, setShuffleDept] = useState<string | null>(null);
  const { count } = useShop();
  const { count: pkgCount } = useDesignPackage();
  const totalCartCount = count + pkgCount;
  const { user, isAdmin } = useAuth();
  const routeDept = useRouteDept();
  const navigate = useNavigate();
  const headerRef = useRef<HTMLElement>(null);

  // close menus on route change / escape
  useEffect(() => {
    const close = () => { openNow(null); setMobileOpen(false); };
    window.addEventListener("popstate", close);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("popstate", close); window.removeEventListener("keydown", esc); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // subtle elevation once the page scrolls
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // click-outside for the mega menus
  useEffect(() => {
    if (!openMenu) return;
    const fn = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        openNow(null);
      }
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openMenu]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  const [hasUnreadClientMsg, setHasUnreadClientMsg] = useState(false);
  useEffect(() => {
    if (!user || isAdmin) {
      setHasUnreadClientMsg(false);
      return;
    }
    const unsub = subscribeMyOrders(user, (ords) => {
      setHasUnreadClientMsg(ords.some(orderHasUnreadStudioMessage));
    });
    return unsub;
  }, [user, isAdmin]);

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
              className={`font-meta text-[11px] u-line whitespace-nowrap flex items-center gap-1 ${servicesOpen || routeDept ? "text-[var(--dept)]" : ""}`}
              aria-expanded={servicesOpen}
              aria-haspopup="menu"
              aria-controls="menu-services"
              onClick={() => toggle("services")}
              onMouseEnter={() => openIntent("services")}
              onMouseLeave={closeIntent}
            >
              Services <Chevron open={servicesOpen} />
            </button>

            <NavLink to="/packages" className={navCls}>Packages & Pricing</NavLink>

            <NavLink to="/work" className={navCls}>Work</NavLink>

            {/* Store & Products Mega Dropdown */}
            <button
              className={`font-meta text-[11px] u-line whitespace-nowrap flex items-center gap-1 ${storeOpen ? "text-[var(--dept)]" : ""}`}
              aria-expanded={storeOpen}
              aria-haspopup="menu"
              aria-controls="menu-store"
              onClick={() => toggle("store")}
              onMouseEnter={() => openIntent("store")}
              onMouseLeave={closeIntent}
            >
              Studio Store <Chevron open={storeOpen} />
            </button>

            <div className="relative">
              <button
                className={`font-meta text-[11px] u-line whitespace-nowrap flex items-center gap-1 ${companyOpen ? "text-[var(--dept)]" : ""}`}
                aria-expanded={companyOpen}
                aria-haspopup="menu"
                aria-controls="menu-company"
                onClick={() => toggle("company")}
                onMouseEnter={() => openIntent("company")}
                onMouseLeave={closeIntent}
              >
                Company <Chevron open={companyOpen} />
              </button>
              {companyOpen && (
                <div id="menu-company" className="absolute right-0 top-full mt-3 border border-[var(--line)] min-w-[168px] py-1.5 z-50"
                  style={{ background: "var(--bg)", boxShadow: "0 18px 44px rgb(0 0 0 / 0.10)" }} role="menu" aria-label="Company menu"
                  onMouseEnter={() => openNow("company")} onMouseLeave={closeIntent}>
                  {[["/about", "About"], ["/insights", "Insights"], ["/client", "Client portal"]].map(([to, label]) => (
                    <NavLink key={to} to={to} role="menuitem" onClick={() => openNow(null)}
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
            {/* Auth indicator */}
            {firebaseReady && (
              user ? (
                <Link
                  to={isAdmin ? "/admin" : "/client"}
                  className="hidden sm:inline-flex font-meta text-[10px] px-2 py-1 border border-[var(--line)] hover:border-[var(--dept)] hover:text-[var(--dept)] transition-colors items-center gap-1.5"
                  title={user.email ?? "My account"}
                >
                  {hasUnreadClientMsg && (
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shrink-0" />
                  )}
                  {isAdmin ? "Studio" : "Account"}
                </Link>
              ) : (
                <Link
                  to="/auth"
                  className="hidden sm:inline-flex font-meta text-[10px] px-2 py-1 border border-[var(--line)] hover:border-[var(--dept)] hover:text-[var(--dept)] transition-colors"
                >
                  Sign in
                </Link>
              )
            )}
            <Link to="/checkout" className="font-meta text-[11px] u-line whitespace-nowrap" aria-label={`Cart, ${totalCartCount} items`}>
              Cart {String(totalCartCount).padStart(2, "0")}
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

        <div id="menu-services" onMouseEnter={() => servicesOpen && openNow("services")} onMouseLeave={closeIntent}>
          <ServicesMenu open={servicesOpen} onClose={() => openNow(null)} />
        </div>

        <div id="menu-store" onMouseEnter={() => storeOpen && openNow("store")} onMouseLeave={closeIntent}>
          <StoreMenu open={storeOpen} onClose={() => openNow(null)} />
        </div>
      </div>

      {/* mobile drawer */}
      {mobileOpen && (
        <div className="xl:hidden fixed inset-0 top-[67px] z-40 overflow-y-auto rule-t" style={{ background: "var(--bg)" }}>
          <nav className="wrap py-8 flex flex-col gap-4" aria-label="Mobile">
            {/* Agency Solutions Section */}
            <div className="pb-4 border-b border-[var(--line)]">
              <span className="font-meta text-[10px] text-[var(--dept)] uppercase tracking-wider font-bold block mb-2">
                Agency Solutions
              </span>
              {DEPARTMENTS.map((d) => (
                <button
                  key={d.id}
                  className="text-left py-2.5 w-full flex items-center group"
                  onMouseEnter={() => setShuffleDept(d.id)}
                  onMouseLeave={() => setShuffleDept(null)}
                  onClick={() => { setMobileOpen(false); navigate(d.path); }}
                >
                  <span className="idx mr-3 text-xs">{d.index}</span>
                  <span className="font-display text-lg font-bold uppercase">
                    <ShuffleText text={d.name} play={shuffleDept === d.id} />
                  </span>
                </button>
              ))}
            </div>

            {/* Packages & Pricing + Work */}
            <div className="pb-4 border-b border-[var(--line)] flex flex-col gap-1">
              <Link
                to="/packages"
                onClick={() => setMobileOpen(false)}
                className="py-2.5 flex items-center justify-between font-display text-xl font-bold uppercase hover:text-[var(--dept)] transition-colors"
              >
                <span>Packages & Pricing</span>
                <span className="font-meta text-[8.5px] px-2 py-0.5 rounded-full bg-[var(--dept-soft)] text-[var(--dept)] font-bold">Transparent Rates</span>
              </Link>
              <Link
                to="/work"
                onClick={() => setMobileOpen(false)}
                className="py-2.5 font-display text-xl font-bold uppercase text-[var(--muted)] hover:text-[var(--text)] transition-colors"
              >
                Selected Work
              </Link>
            </div>

            {/* Studio Store & Digital Products Section */}
            <div className="pb-4 border-b border-[var(--line)]">
              <span className="font-meta text-[10px] text-[var(--muted)] uppercase tracking-wider font-bold block mb-2">
                Studio Store & Digital Products
              </span>
              <div className="flex flex-col gap-1">
                <Link
                  to="/templates"
                  onClick={() => setMobileOpen(false)}
                  className="py-2 flex items-center justify-between font-display text-base font-bold uppercase hover:text-cyan-400 transition-colors"
                >
                  <span className="flex items-center gap-2"><span>🎨</span> Templates & Live Editor</span>
                  <span className="font-meta text-[8px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-bold">Instant</span>
                </Link>
                <Link
                  to="/graphic-design-branding/design-store"
                  onClick={() => setMobileOpen(false)}
                  className="py-2 flex items-center justify-between font-display text-base font-bold uppercase hover:text-emerald-400 transition-colors"
                >
                  <span className="flex items-center gap-2"><span>🏷️</span> 60+ À La Carte Design Services</span>
                  <span className="font-meta text-[8px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold">Catalog</span>
                </Link>
                <Link
                  to="/custom-package"
                  onClick={() => setMobileOpen(false)}
                  className="py-2 flex items-center justify-between font-display text-base font-bold uppercase hover:text-purple-400 transition-colors"
                >
                  <span className="flex items-center gap-2"><span>🛠️</span> Custom Package Builder</span>
                  <span className="font-meta text-[8px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-bold">Discounts</span>
                </Link>
              </div>
            </div>

            {/* General Navigation */}
            <div className="flex flex-col gap-1">
              {[["/about", "About"], ["/insights", "Insights"], ["/client", "Client portal"]].map(([to, label]) => (
                <Link key={to} to={to} onClick={() => setMobileOpen(false)} className="py-2 font-display text-base font-bold uppercase text-[var(--muted)] hover:text-[var(--text)] transition-colors">
                  {label}
                </Link>
              ))}
            </div>

            {/* Account + utility — mobile users otherwise have no auth or cart entry point */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <CurrencySelect />
              {firebaseReady && (
                <Link
                  to={user ? (isAdmin ? "/admin" : "/client") : "/auth"}
                  onClick={() => setMobileOpen(false)}
                  className="font-meta text-[10px] px-3 py-2 border border-[var(--line)] hover:border-[var(--dept)] hover:text-[var(--dept)] transition-colors uppercase tracking-wider inline-flex items-center gap-1.5 rounded-lg"
                >
                  {user ? (
                    isAdmin ? (
                      "Studio admin"
                    ) : (
                      <>
                        {hasUnreadClientMsg && (
                          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shrink-0" />
                        )}
                        My account
                      </>
                    )
                  ) : (
                    "Sign in"
                  )}
                </Link>
              )}
              <Link
                to="/checkout"
                onClick={() => setMobileOpen(false)}
                className="font-meta text-[10px] px-3 py-2 border border-[var(--line)] hover:border-[var(--dept)] hover:text-[var(--dept)] transition-colors uppercase tracking-wider rounded-lg"
              >
                Cart · {String(totalCartCount).padStart(2, "0")}
              </Link>
              <button
                onClick={onOpenCommand}
                className="font-meta text-[10px] px-3 py-2 border border-[var(--line)] hover:border-[var(--dept)] hover:text-[var(--dept)] transition-colors uppercase tracking-wider rounded-lg"
                aria-label="Open command menu"
              >
                ⌘K Command
              </button>
            </div>

            <Link to="/start" onClick={() => setMobileOpen(false)} className="btn btn-dept mt-4 justify-center">
              Start a project <span className="btn-arrow" aria-hidden>→</span>
            </Link>
            <p className="font-meta text-[10px] text-[var(--muted)] mt-4">
              {CONTACT.phone} · {CONTACT.email} · {CONTACT.location}
            </p>
          </nav>
        </div>
      )}
    </header>
  );
}
