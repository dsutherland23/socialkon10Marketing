import { useEffect, useState, lazy, Suspense } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { ThemeProvider } from "./lib/theme";
import { ShopProvider } from "./lib/shop";
import { AuthProvider } from "./lib/auth";
import { ContentProvider } from "./lib/content";
import { DesignCatalogProvider, DesignPackageProvider } from "./lib/design-shop";
import { TemplateCatalogProvider } from "./lib/templates";
import { track } from "./lib/seo";
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
import Home from "./pages/Home";
import DepartmentPage from "./pages/Department";
import Work from "./pages/Work";
import ServicePage from "./pages/Service";
import Packages from "./pages/Packages";
import Start from "./pages/Start";
import About from "./pages/About";
import Insights from "./pages/Insights";
import NotFound from "./pages/NotFound";

/* Route-based code splitting (PRD §58) — conversion + account flows
   and heavy pages load on demand, keeping the landing bundle lean. */
const ProjectPage = lazy(() => import("./pages/Project"));
const InsightArticle = lazy(() => import("./pages/Insight"));
const Checkout = lazy(() => import("./pages/Checkout"));
const ClientPortal = lazy(() => import("./pages/Client"));
const Admin = lazy(() => import("./pages/Admin"));
const DesignStore = lazy(() => import("./pages/DesignStore"));
const DesignServicePage = lazy(() => import("./pages/DesignService"));
const CustomPackage = lazy(() => import("./pages/CustomPackage"));
const Templates = lazy(() => import("./pages/Templates"));
const TemplateDetail = lazy(() => import("./pages/TemplateDetail"));
const Editor = lazy(() => import("./pages/Editor"));

function ScrollAndTrack() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    track("page_view", { path: pathname });
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
              <Route path="/services/:slug" element={<ServicePage />} />
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
              <Route path="*" element={<NotFound />} />
            </Routes>
            </div>
          </Suspense>
        </ErrorBoundary>
      </main>
      <SiteFooter />
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
      <HandEgg />
      <LogoEgg />
      <CatchEgg />
      <FlashBadge />
      <MicroEggs />
      <MoreHandEggs />
      <StampEgg />
      <Toaster position="bottom-right" toastOptions={{ style: { background: "var(--panel)", color: "var(--ink)", border: "1px solid var(--line-strong)", borderRadius: 0, fontSize: 13 } }} />
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ContentProvider>
          <ShopProvider>
            <DesignCatalogProvider>
              <DesignPackageProvider>
                <TemplateCatalogProvider>
                  <ScrollAndTrack />
                  <Shell />
                </TemplateCatalogProvider>
              </DesignPackageProvider>
            </DesignCatalogProvider>
          </ShopProvider>
        </ContentProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
