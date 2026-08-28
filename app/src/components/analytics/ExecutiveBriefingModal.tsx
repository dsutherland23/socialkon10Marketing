import { useMoney } from "../../lib/money";
import type { SessionData, GeoDistributionRecord, TechDistribution } from "../../lib/analytics";

interface ExecutiveBriefingModalProps {
  days: number;
  revenue: number;
  aov: number;
  sessionCount: number;
  leadsCount: number;
  ordersCount: number;
  topPages: { path: string; views: number }[];
  trafficSources: { source: string; sessions: number }[];
  serviceInterest: { service_name: string; views: number }[];
  geoData: GeoDistributionRecord[];
  techData: TechDistribution;
  recentSessions: SessionData[];
  onClose: () => void;
}

export function ExecutiveBriefingModal({
  days,
  revenue,
  aov,
  sessionCount,
  leadsCount,
  ordersCount,
  topPages,
  trafficSources,
  serviceInterest,
  geoData,
  techData,
  recentSessions,
  onClose,
}: ExecutiveBriefingModalProps) {
  const money = useMoney();

  const totalCvr = sessionCount > 0 ? (((leadsCount + ordersCount) / sessionCount) * 100).toFixed(1) : "0.0";
  const hotVisitors = recentSessions.filter((s) => s.segment === "hot" || s.segment === "high_intent").length;
  const topChannel = trafficSources[0]?.source || "Direct";
  const topCountry = geoData[0]?.country_name || "No data yet";
  const topService = serviceInterest[0]?.service_name || "No views recorded yet";

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/70 backdrop-blur-xs overflow-y-auto"
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] overflow-y-auto border border-[var(--line-strong)] rounded-3xl p-6 sm:p-10 shadow-2xl space-y-8 bg-[var(--panel)] text-[var(--ink)]"
        id="executive-briefing-print"
      >
        {/* Header & Print Actions */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--line)] pb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">📊</span>
              <span className="font-display text-xs font-bold uppercase tracking-widest text-[var(--dept)]">
                STUDIO INTELLIGENCE BRIEFING
              </span>
            </div>
            <h2 className="font-display text-2xl font-bold uppercase tracking-tight mt-1">
              Executive Marketing & Conversion Report
            </h2>
            <p className="font-meta text-[11px] text-[var(--muted)] mt-1">
              Period: Last {days} Days · Generated on {new Date().toLocaleDateString(undefined, { dateStyle: "long" })}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="btn btn-dept !py-2 !px-4 text-xs font-bold rounded-xl flex items-center gap-2"
            >
              <span>🖨️</span>
              <span>Print / Save PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-ghost !py-2 !px-3 text-xs rounded-xl"
            >
              ✕ Close
            </button>
          </div>
        </div>

        {/* Executive KPI Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="p-4 rounded-2xl border border-[var(--line)] bg-[var(--bg)]">
            <span className="font-meta text-[9px] text-[var(--muted)] uppercase tracking-wider block">COLLECTED REVENUE</span>
            <span className="font-display text-xl sm:text-2xl font-bold text-emerald-500 font-mono mt-1 block">
              {money(revenue)}
            </span>
            <span className="font-meta text-[9px] text-[var(--muted)] mt-0.5 block">{ordersCount} closed orders</span>
          </div>

          <div className="p-4 rounded-2xl border border-[var(--line)] bg-[var(--bg)]">
            <span className="font-meta text-[9px] text-[var(--muted)] uppercase tracking-wider block">TOTAL SESSIONS</span>
            <span className="font-display text-xl sm:text-2xl font-bold font-mono mt-1 block text-[var(--ink)]">
              {sessionCount.toLocaleString()}
            </span>
            <span className="font-meta text-[9px] text-[var(--muted)] mt-0.5 block">{leadsCount} qualified leads</span>
          </div>

          <div className="p-4 rounded-2xl border border-[var(--line)] bg-[var(--bg)]">
            <span className="font-meta text-[9px] text-[var(--muted)] uppercase tracking-wider block">OVERALL CVR</span>
            <span className="font-display text-xl sm:text-2xl font-bold font-mono text-[var(--dept)] mt-1 block">
              {totalCvr}%
            </span>
            <span className="font-meta text-[9px] text-[var(--muted)] mt-0.5 block">Visitor-to-inquiry rate</span>
          </div>

          <div className="p-4 rounded-2xl border border-[var(--line)] bg-[var(--bg)]">
            <span className="font-meta text-[9px] text-[var(--muted)] uppercase tracking-wider block">HIGH-INTENT PROSPECTS</span>
            <span className="font-display text-xl sm:text-2xl font-bold font-mono text-amber-500 mt-1 block">
              {hotVisitors}
            </span>
            <span className="font-meta text-[9px] text-[var(--muted)] mt-0.5 block">Score ≥ 60 (Warm / Hot)</span>
          </div>
        </div>

        {/* 2-Column Strategic Deep Dive */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Acquisition & Geographic Dominance */}
          <div className="p-5 rounded-2xl border border-[var(--line)] space-y-4">
            <div className="flex items-center gap-2 font-display text-xs font-bold uppercase">
              <span>🌐</span>
              <span>Acquisition & Geographic Reach</span>
            </div>
            <div className="space-y-2 text-[10.5px] font-meta">
              <div className="flex justify-between py-1.5 border-b border-[var(--line)]">
                <span className="text-[var(--muted)]">Top Traffic Channel</span>
                <span className="font-bold dept-accent capitalize">{topChannel}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[var(--line)]">
                <span className="text-[var(--muted)]">Primary Country</span>
                <span className="font-bold">{geoData[0]?.flag} {topCountry} ({geoData[0]?.share_pct || 100}%)</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[var(--line)]">
                <span className="text-[var(--muted)]">Primary Device Form</span>
                <span className="font-bold capitalize">
                  {techData.devices[0] ? `${techData.devices[0].label} (${techData.devices[0].pct}%)` : "—"}
                </span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-[var(--muted)]">Top Browser</span>
                <span className="font-bold">
                  {techData.browsers[0] ? `${techData.browsers[0].label} (${techData.browsers[0].pct}%)` : "—"}
                </span>
              </div>
            </div>
          </div>

          {/* Service Demand & Conversion Matrix */}
          <div className="p-5 rounded-2xl border border-[var(--line)] space-y-4">
            <div className="flex items-center gap-2 font-display text-xs font-bold uppercase">
              <span>🎯</span>
              <span>Service Demand & Pipeline</span>
            </div>
            <div className="space-y-2 text-[10.5px] font-meta">
              <div className="flex justify-between py-1.5 border-b border-[var(--line)]">
                <span className="text-[var(--muted)]">Highest-Demand Service</span>
                <span className="font-bold">{topService}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[var(--line)]">
                <span className="text-[var(--muted)]">Average Order Value (AOV)</span>
                <span className="font-bold font-mono">{money(aov)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[var(--line)]">
                <span className="text-[var(--muted)]">Top Landing Page</span>
                <code className="text-[9px] bg-[var(--bg)] px-1.5 py-0.5 rounded border border-[var(--line)]">{topPages[0]?.path || "/services"}</code>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-[var(--muted)]">Lead-to-Order Conversion</span>
                <span className="font-bold text-emerald-500">{leadsCount > 0 ? Math.round((ordersCount / leadsCount) * 100) : 0}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* AI-Grounded Strategic Recommendations */}
        <div className="p-6 rounded-2xl border border-[var(--dept)]/40 bg-[var(--dept)]/5 space-y-3">
          <div className="flex items-center gap-2 font-display text-xs font-bold uppercase">
            <span>✨</span>
            <span>Strategic Growth Recommendations for Next 30 Days</span>
          </div>
          <ul className="space-y-2.5 font-meta text-[11px] leading-relaxed list-disc list-inside text-[var(--ink)]">
            <li>
              <strong>Scale Primary Channel:</strong> Double down on <strong>{topChannel}</strong> ad campaigns and UTM tagging, as this channel delivers your highest volume of engaged visits.
            </li>
            <li>
              <strong>Bundle High-Demand Services:</strong> Create a dedicated discount bundle for <strong>{topService}</strong> on your pricing page to turn high view interest into immediate deposit checkouts.
            </li>
            <li>
              <strong>Fast-Track High-Intent Leads:</strong> Prioritize instant proposal follow-ups for the <strong>{hotVisitors} high-intent visitor sessions</strong> identified this month.
            </li>
          </ul>
        </div>

        {/* Briefing Footer */}
        <div className="flex items-center justify-between text-[9px] font-meta text-[var(--muted)] pt-4 border-t border-[var(--line)]">
          <span>Socialkon Studio Intelligence Engine · First-Party Source of Truth</span>
          <span>Confidential Agency Report</span>
        </div>
      </div>
    </div>
  );
}
