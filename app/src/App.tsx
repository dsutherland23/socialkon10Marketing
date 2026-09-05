import { useEffect, useState, lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { Toaster } from "sonner";
import { ThemeProvider } from "./lib/theme";
import { ShopProvider } from "./lib/shop";
import { AuthProvider } from "./lib/auth";
import { ContentProvider } from "./lib/content";
import { DesignCatalogProvider, DesignPackageProvider } from "./lib/design-shop";
import { WebsiteAddonsCatalogProvider } from "./lib/website-addons-provider";
import { TemplateCatalogProvider } from "./lib/templates";
import { AgencyServicesProvider } from "./lib/agency-services-provider";
import { trackPageView, initTracking } from "./lib/analytics";
import { SiteHeader } from "./components/header";
import { SiteFooter } from "./components/footer";
import { CommandPalette } from "./components/command";
import HandEgg from "./components/HandEgg";
import LogoEgg from "./components/LogoEgg";
import CatchEgg from "./components/CatchEgg";
import FlashBadge from "./components/FlashBadge";
import MicroEggs from "./components/MicroEggs";
import MoreHandEggs from "./components/MoreHandEggs";
import StampEgg from "./components/StampEgg";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ConsentBanner } from "./components/ConsentBanner";
import Home from "./pages/Home";
import DepartmentPage from "./pages/Department";
import Work from "./pages/Work";
import { resolveServiceSlug } from "./lib/data";
import { cleanStorageIfNeeded } from "./lib/storage";

// Immediately ensure storage quota health before providers initialize
cleanStorageIfNeeded();

/** Redirect /services/:slug → /design-services/:resolvedSlug (preserves external links + SEO) */
function ServiceRedirect() {
  const { slug } = useParams<{ slug: string }>();
  const resolved = slug ? resolveServiceSlug(slug) : "";
  return <Navigate to={`/design-services/${resolved}`} replace />;
}
import Packages from "./pages/Packages";
import Start from "./pages/Start";
import About from "./pages/About";
import Insights from "./pages/Insights";
import NotFound from "./pages/NotFound";

function lazyWithRetry<T extends React.ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      const isChunkError = /Failed to fetch dynamically imported module|Loading chunk|Importing a module script failed|status of 404/i.test(msg);
      const retryKey = "sk_chunk_reload_" + window.location.pathname;
      if (isChunkError && !sessionStorage.getItem(retryKey)) {
        sessionStorage.setItem(retryKey, "true");
        window.location.reload();
        return new Promise<{ default: T }>(() => {});
      }
      throw error;
    }
  });
}

/* Route-based code splitting (PRD §58) — conversion + account flows
   and heavy pages load on demand, keeping the landing bundle lean. */
const ProjectPage = lazyWithRetry(() => import("./pages/Project"));
const InsightArticle = lazyWithRetry(() => import("./pages/Insight"));
const Checkout = lazyWithRetry(() => import("./pages/Checkout"));
const AuthPage = lazyWithRetry(() => import("./pages/Auth"));
const ClientPortal = lazyWithRetry(() => import("./pages/Client"));
const Admin = lazyWithRetry(() => import("./pages/Admin"));
const DesignStore = lazyWithRetry(() => import("./pages/DesignStore"));
const DesignServicePage = lazyWithRetry(() => import("./pages/DesignService"));
const CustomPackage = lazyWithRetry(() => import("./pages/CustomPackage"));
const Templates = lazyWithRetry(() => import("./pages/Templates"));
const TemplateDetail = lazyWithRetry(() => import("./pages/TemplateDetail"));
const Editor = lazyWithRetry(() => import("./pages/Editor"));
const MeetingRoom = lazyWithRetry(() => import("./pages/MeetingRoom"));
const Privacy = lazyWithRetry(() => import("./pages/Privacy"));
const Terms = lazyWithRetry(() => import("./pages/Terms"));
import { IncomingCallModal } from "./components/IncomingCallModal";
import { MeetingProximityAlert } from "./components/MeetingProximityAlert";


function ScrollAndTrack() {
  const { pathname } = useLocation();

  // ── One-time engine startup: initialises session, geo-enrichment, scroll & click listeners ──
  useEffect(() => {
    initTracking();
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    void trackPageView(pathname); // First-party dual-persistence + GA4/Pixel/dataLayer mirroring
  }, [pathname]);
  return null;
}

/* Dept-accented scroll progress hairline — transform-only, rAF-throttled */
function ScrollProgress() {
  useEffect(() => {
    const el = document.getElementById("sk-progress");
    if (!el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, window.scrollY / max) : 0;
      el.style.transform = `scaleX(${p})`;
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return <div id="sk-progress" className="scroll-progress" aria-hidden="true" />;
}

function Shell() {
  const [cmdOpen, setCmdOpen] = useState(false);
  const { pathname } = useLocation();
  // ⌘K / Ctrl+K opens the command center
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);

  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <ScrollProgress />
      <div className="grain-overlay" aria-hidden="true" />
      <SiteHeader onOpenCommand={() => setCmdOpen(true)} />
      <main id="main">
        <ErrorBoundary>
          <Suspense fallback={<div className="wrap pt-24 pb-32 min-h-[50vh]"><span className="font-meta text-[10px] text-[var(--muted)]">Loading…</span></div>}>
            <div key={pathname} className="page-enter">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/auth" element={<AuthPage />} />

              <Route path="/graphic-design-branding" element={<DepartmentPage deptId="brand" />} />
              <Route path="/graphic-design-branding/design-store" element={<DesignStore />} />
              <Route path="/design-services/:slug" element={<DesignServicePage />} />
              <Route path="/custom-package" element={<CustomPackage />} />
              <Route path="/templates" element={<Templates />} />
              <Route path="/templates/:slug" element={<TemplateDetail />} />
              <Route path="/editor/author/:slug" element={<Editor />} />
              <Route path="/editor/:slug" element={<Editor />} />
              <Route path="/social-media-marketing" element={<DepartmentPage deptId="social" />} />
              <Route path="/website-design-development" element={<DepartmentPage deptId="web" />} />
              <Route path="/services/:slug" element={<ServiceRedirect />} />
              <Route path="/work" element={<Work />} />
              <Route path="/work/:slug" element={<ProjectPage />} />
              <Route path="/packages" element={<Packages />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/start" element={<Start />} />
              <Route path="/about" element={<About />} />
              <Route path="/insights" element={<Insights />} />
              <Route path="/insights/:slug" element={<InsightArticle />} />
              <Route path="/contact" element={<Start />} />
              <Route path="/client" element={<ClientPortal />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/meet/:roomId" element={<MeetingRoom />} />
              <Route path="/meet" element={<MeetingRoom />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            </div>
          </Suspense>
        </ErrorBoundary>
      </main>
      <SiteFooter />
      <IncomingCallModal />
      <MeetingProximityAlert />
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
      <HandEgg />
      <LogoEgg />
      <CatchEgg />
      <FlashBadge />
      <MicroEggs />
      <MoreHandEggs />
      <StampEgg />
      <ConsentBanner />
      <Toaster position="bottom-right" toastOptions={{ style: { background: "var(--panel)", color: "var(--ink)", border: "1px solid var(--line-strong)", borderRadius: 0, fontSize: 13 } }} />
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ContentProvider>
          <AgencyServicesProvider>
            <ShopProvider>
              <DesignCatalogProvider>
                <DesignPackageProvider>
                  <WebsiteAddonsCatalogProvider>
                    <TemplateCatalogProvider>
                      <ScrollAndTrack />
                      <Shell />
                    </TemplateCatalogProvider>
                  </WebsiteAddonsCatalogProvider>
                </DesignPackageProvider>
              </DesignCatalogProvider>
            </ShopProvider>
          </AgencyServicesProvider>
        </ContentProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
