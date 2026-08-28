import { useState } from "react";
import type { GeoDistributionRecord } from "../../lib/analytics";

interface GeoWorldMapProps {
  data: GeoDistributionRecord[];
  liveCountByCountry?: Record<string, number>;
  onSelectCountry?: (code: string) => void;
}

// Normalized coordinate hotspots for key countries and regions
const REGION_COORDINATES: Record<string, { x: number; y: number; name: string }> = {
  JM: { x: 265, y: 190, name: "Jamaica" },
  US: { x: 200, y: 140, name: "United States" },
  CA: { x: 190, y: 90, name: "Canada" },
  GB: { x: 470, y: 110, name: "United Kingdom" },
  FR: { x: 485, y: 130, name: "France" },
  DE: { x: 505, y: 120, name: "Germany" },
  NL: { x: 495, y: 115, name: "Netherlands" },
  ES: { x: 475, y: 155, name: "Spain" },
  TT: { x: 290, y: 215, name: "Trinidad & Tobago" },
  BB: { x: 300, y: 205, name: "Barbados" },
  BS: { x: 260, y: 170, name: "Bahamas" },
  TC: { x: 275, y: 180, name: "Turks & Caicos" },
  KY: { x: 250, y: 190, name: "Cayman Islands" },
  JP: { x: 810, y: 150, name: "Japan" },
  SG: { x: 740, y: 240, name: "Singapore" },
  AE: { x: 590, y: 180, name: "United Arab Emirates" },
  AU: { x: 830, y: 310, name: "Australia" },
};

export function GeoWorldMap({ data, liveCountByCountry = {}, onSelectCountry }: GeoWorldMapProps) {
  const [hovered, setHovered] = useState<GeoDistributionRecord | null>(null);

  const maxSessions = Math.max(1, ...data.map((d) => d.sessions));
  const dataMap = new Map(data.map((d) => [d.country_code, d]));

  const handleMouseEnter = (code: string) => {
    const item = dataMap.get(code) || {
      country_code: code,
      country_name: REGION_COORDINATES[code]?.name || code,
      flag: "🌐",
      sessions: 0,
      share_pct: 0,
      conversions: 0,
      cvr: 0,
      top_cities: [],
    };
    setHovered(item);
  };

  return (
    <div className="relative w-full border border-[var(--line)] rounded-2xl overflow-hidden p-4 sm:p-6" style={{ background: "var(--panel)" }}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <span className="idx">/geographic-traffic-telemetry</span>
          <p className="font-meta text-[10px] text-[var(--muted)] mt-0.5">
            Real-time visual map of visitor density and regional clusters.
          </p>
        </div>
        <div className="flex items-center gap-3 text-[9px] font-meta text-[var(--muted)]">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--dept)]" /> High Traffic
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" /> Live Now
          </span>
        </div>
      </div>

      {/* SVG World Map Canvas */}
      <div className="relative w-full aspect-[2/1] min-h-[260px] flex items-center justify-center">
        <svg
          viewBox="0 0 960 480"
          className="w-full h-full stroke-[var(--line-strong)] fill-[var(--bg)] transition-colors select-none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <radialGradient id="mapGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--dept)" stopOpacity="0.25" />
              <stop offset="100%" stopColor="transparent" stopOpacity="0" />
            </radialGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Background Grid Lines */}
          <g opacity="0.15" stroke="var(--ink)" strokeWidth="0.5" strokeDasharray="3 3">
            <line x1="0" y1="120" x2="960" y2="120" />
            <line x1="0" y1="240" x2="960" y2="240" />
            <line x1="0" y1="360" x2="960" y2="360" />
            <line x1="240" y1="0" x2="240" y2="480" />
            <line x1="480" y1="0" x2="480" y2="480" />
            <line x1="720" y1="0" x2="720" y2="480" />
          </g>

          {/* Continents Simplified Vector Paths */}
          {/* North America */}
          <path
            d="M120,60 L240,50 L280,100 L240,140 L260,180 L200,200 L160,160 L100,120 Z"
            fill="var(--bg)"
            stroke="var(--line)"
            strokeWidth="1.2"
            className="hover:fill-[var(--line)] transition-colors"
          />
          {/* Central America & Caribbean Basin */}
          <path
            d="M200,200 L260,200 L280,240 L240,260 L210,230 Z"
            fill="var(--bg)"
            stroke="var(--line)"
            strokeWidth="1.2"
          />
          {/* South America */}
          <path
            d="M260,240 L340,260 L360,340 L300,420 L260,360 L240,280 Z"
            fill="var(--bg)"
            stroke="var(--line)"
            strokeWidth="1.2"
          />
          {/* Europe */}
          <path
            d="M440,70 L540,60 L560,120 L500,160 L450,140 L430,100 Z"
            fill="var(--bg)"
            stroke="var(--line)"
            strokeWidth="1.2"
          />
          {/* Africa */}
          <path
            d="M440,160 L540,160 L580,240 L540,360 L480,380 L440,260 Z"
            fill="var(--bg)"
            stroke="var(--line)"
            strokeWidth="1.2"
          />
          {/* Asia */}
          <path
            d="M550,60 L800,50 L860,140 L780,220 L660,200 L570,140 Z"
            fill="var(--bg)"
            stroke="var(--line)"
            strokeWidth="1.2"
          />
          {/* Australia & Oceania */}
          <path
            d="M780,280 L880,270 L900,340 L820,380 L760,340 Z"
            fill="var(--bg)"
            stroke="var(--line)"
            strokeWidth="1.2"
          />

          {/* Interactive Country & Region Hotspots */}
          {Object.entries(REGION_COORDINATES).map(([code, coord]) => {
            const countryData = dataMap.get(code);
            const sessions = countryData?.sessions ?? 0;
            const live = liveCountByCountry[code] || 0;
            const intensity = sessions > 0 ? Math.max(0.3, sessions / maxSessions) : 0.1;
            const radius = sessions > 0 ? Math.min(18, 6 + (sessions / maxSessions) * 12) : 4;

            return (
              <g
                key={code}
                className="cursor-pointer group"
                onClick={() => onSelectCountry?.(code)}
                onMouseEnter={() => handleMouseEnter(code)}
                onMouseLeave={() => setHovered(null)}
              >
                {/* Outer Activity Heat Aura */}
                {sessions > 0 && (
                  <circle
                    cx={coord.x}
                    cy={coord.y}
                    r={radius * 1.8}
                    fill="var(--dept)"
                    opacity={intensity * 0.4}
                    className="animate-pulse"
                  />
                )}

                {/* Primary Region Node */}
                <circle
                  cx={coord.x}
                  cy={coord.y}
                  r={radius}
                  fill={sessions > 0 ? "var(--dept)" : "var(--line-strong)"}
                  stroke="var(--panel)"
                  strokeWidth="2"
                  className="transition-transform group-hover:scale-125"
                />

                {/* Live Visitor Pulsating Beacon */}
                {live > 0 && (
                  <circle
                    cx={coord.x}
                    cy={coord.y}
                    r={radius + 4}
                    fill="none"
                    stroke="#22c55e"
                    strokeWidth="2"
                    className="animate-ping"
                  />
                )}

                {/* Country Code Label */}
                <text
                  x={coord.x}
                  y={coord.y - radius - 4}
                  textAnchor="middle"
                  className="text-[8px] font-mono font-bold fill-[var(--ink)] opacity-75 group-hover:opacity-100 transition-opacity"
                >
                  {code}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Floating Hover Card */}
      {hovered && (
        <div
          className="absolute z-20 pointer-events-none p-3 rounded-xl border border-[var(--line-strong)] shadow-xl text-left font-meta text-[10px] space-y-1 animate-fade-in"
          style={{
            background: "var(--panel)",
            color: "var(--ink)",
            bottom: "20px",
            right: "20px",
            minWidth: "170px",
          }}
        >
          <div className="flex items-center gap-1.5 font-display text-xs font-bold uppercase">
            <span>{hovered.flag}</span>
            <span>{hovered.country_name}</span>
          </div>
          <div className="flex items-center justify-between text-[9px] pt-1 border-t border-[var(--line)]">
            <span className="text-[var(--muted)]">Sessions:</span>
            <span className="font-bold dept-accent">{hovered.sessions.toLocaleString()} ({hovered.share_pct}%)</span>
          </div>
          <div className="flex items-center justify-between text-[9px]">
            <span className="text-[var(--muted)]">Conversion Rate:</span>
            <span className="font-bold font-mono text-emerald-500">{hovered.cvr}% CVR</span>
          </div>
          {hovered.top_cities.length > 0 && (
            <div className="text-[8.5px] text-[var(--muted)] pt-1">
              Top Cities: <span className="text-[var(--ink)] font-semibold">{hovered.top_cities.join(", ")}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
