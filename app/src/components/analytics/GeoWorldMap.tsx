import { useState, useMemo } from "react";
import type { GeoDistributionRecord } from "../../lib/analytics";
import { WorldMap, type MapDot, type MapPoint } from "../ui/world-map";

interface GeoWorldMapProps {
  data: GeoDistributionRecord[];
  liveCountByCountry?: Record<string, number>;
  onSelectCountry?: (code: string) => void;
}

// Precise Lat/Lng geographic coordinates and metadata for countries
export const COUNTRY_GEO_COORDS: Record<string, { lat: number; lng: number; name: string; flag: string }> = {
  JM: { lat: 18.0179, lng: -76.8099, name: "Jamaica", flag: "🇯🇲" },
  US: { lat: 37.0902, lng: -95.7129, name: "United States", flag: "🇺🇸" },
  CA: { lat: 56.1304, lng: -106.3468, name: "Canada", flag: "🇨🇦" },
  GB: { lat: 55.3781, lng: -3.4360, name: "United Kingdom", flag: "🇬🇧" },
  TT: { lat: 10.6918, lng: -61.2225, name: "Trinidad & Tobago", flag: "🇹🇹" },
  BB: { lat: 13.1939, lng: -59.5432, name: "Barbados", flag: "🇧🇧" },
  BS: { lat: 25.0343, lng: -77.3963, name: "Bahamas", flag: "🇧🇸" },
  KY: { lat: 19.3133, lng: -81.2546, name: "Cayman Islands", flag: "🇰🇾" },
  TC: { lat: 21.6940, lng: -71.7979, name: "Turks & Caicos", flag: "🇹🇨" },
  DE: { lat: 51.1657, lng: 10.4515, name: "Germany", flag: "🇩🇪" },
  FR: { lat: 46.2276, lng: 2.2137, name: "France", flag: "🇫🇷" },
  NL: { lat: 52.1326, lng: 5.2913, name: "Netherlands", flag: "🇳🇱" },
  ES: { lat: 40.4637, lng: -3.7492, name: "Spain", flag: "🇪🇸" },
  AE: { lat: 23.4241, lng: 53.8478, name: "United Arab Emirates", flag: "🇦🇪" },
  AU: { lat: -25.2744, lng: 133.7751, name: "Australia", flag: "🇦🇺" },
  JP: { lat: 36.2048, lng: 138.2529, name: "Japan", flag: "🇯🇵" },
  SG: { lat: 1.3521, lng: 103.8198, name: "Singapore", flag: "🇸🇬" },
  BR: { lat: -14.2350, lng: -51.9253, name: "Brazil", flag: "🇧🇷" },
  IN: { lat: 20.5937, lng: 78.9629, name: "India", flag: "🇮🇳" },
  NG: { lat: 9.0820, lng: 8.6753, name: "Nigeria", flag: "🇳🇬" },
  ZA: { lat: -30.5595, lng: 22.9375, name: "South Africa", flag: "🇿🇦" },
};

export function GeoWorldMap({ data, liveCountByCountry = {}, onSelectCountry }: GeoWorldMapProps) {
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);

  const dataMap = useMemo(() => new Map(data.map((d) => [d.country_code, d])), [data]);

  // Agency primary hub
  const HUB_POINT: MapPoint = {
    lat: COUNTRY_GEO_COORDS.JM.lat,
    lng: COUNTRY_GEO_COORDS.JM.lng,
    label: "Kingston Creative Studio",
    code: "JM",
    flag: "🇯🇲",
  };

  // Generate interactive map points based on available countries and real session data
  const mapPoints: MapPoint[] = useMemo(() => {
    return Object.entries(COUNTRY_GEO_COORDS).map(([code, meta]) => {
      const record = dataMap.get(code);
      return {
        lat: meta.lat,
        lng: meta.lng,
        label: record?.country_name || meta.name,
        code,
        sessions: record?.sessions ?? 0,
        live: liveCountByCountry[code] || 0,
        flag: record?.flag || meta.flag,
      };
    });
  }, [dataMap, liveCountByCountry]);

  // Generate telemetry traffic arcs connecting top active visitors to the agency hub
  const mapDots: MapDot[] = useMemo(() => {
    const dots: MapDot[] = [];
    const activeCountries = data
      .filter((d) => d.country_code !== "JM" && COUNTRY_GEO_COORDS[d.country_code])
      .sort((a, b) => b.sessions - a.sessions);

    // If active traffic is detected, connect traffic streams to the hub
    activeCountries.slice(0, 8).forEach((item) => {
      const coords = COUNTRY_GEO_COORDS[item.country_code];
      if (coords) {
        dots.push({
          start: {
            lat: coords.lat,
            lng: coords.lng,
            label: item.country_name,
            code: item.country_code,
            flag: item.flag,
          },
          end: HUB_POINT,
        });
      }
    });

    // Fallback default demonstration streams if telemetry is booting up
    if (dots.length === 0) {
      const defaults = ["US", "GB", "CA", "TT", "DE", "BB"];
      defaults.forEach((code) => {
        const coords = COUNTRY_GEO_COORDS[code];
        if (coords) {
          dots.push({
            start: {
              lat: coords.lat,
              lng: coords.lng,
              label: coords.name,
              code,
              flag: coords.flag,
            },
            end: HUB_POINT,
          });
        }
      });
    }

    return dots;
  }, [data, HUB_POINT]);

  const activeRecord = hoveredCode ? dataMap.get(hoveredCode) : selectedCode ? dataMap.get(selectedCode) : null;

  return (
    <div className="relative w-full border border-[var(--line)] rounded-2xl overflow-hidden p-4 sm:p-6" style={{ background: "var(--panel)" }}>
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <span className="idx">/geographic-telemetry-engine</span>
          <p className="font-meta text-[10px] text-[var(--muted)] mt-0.5">
            Dotted-grid global telemetry with animated bezier routes &amp; active visitor beacons.
          </p>
        </div>
        <div className="flex items-center gap-3 text-[9px] font-meta text-[var(--muted)]">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--dept)] shadow-xs" /> Telemetry Streams
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" /> Live Beacons
          </span>
        </div>
      </div>

      {/* World Map Dotted Component */}
      <div className="relative w-full min-h-[260px] bg-[var(--bg)]/40 rounded-xl border border-[var(--line)]/50 p-2">
        <WorldMap
          dots={mapDots}
          points={mapPoints}
          lineColor="var(--dept, #0ea5e9)"
          activePointCode={selectedCode || hoveredCode}
          onSelectPoint={(pt) => {
            if (pt.code) {
              setSelectedCode(pt.code);
              onSelectCountry?.(pt.code);
            }
          }}
          onHoverPoint={(pt) => {
            setHoveredCode(pt?.code || null);
          }}
        />
      </div>

      {/* Interactive Detail Overlay */}
      {activeRecord && (
        <div
          className="absolute z-20 pointer-events-none p-3.5 rounded-xl border border-[var(--line-strong)] shadow-2xl text-left font-meta text-[10px] space-y-1.5 animate-fade-in backdrop-blur-md"
          style={{
            background: "var(--panel)",
            color: "var(--ink)",
            bottom: "24px",
            right: "24px",
            minWidth: "190px",
          }}
        >
          <div className="flex items-center justify-between font-display text-xs font-bold uppercase">
            <span className="flex items-center gap-1.5">
              <span className="text-base">{activeRecord.flag}</span>
              <span>{activeRecord.country_name}</span>
            </span>
            <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-[var(--dept-soft)] text-[var(--dept)] border border-[var(--dept)]/30">
              {activeRecord.country_code}
            </span>
          </div>
          <div className="flex items-center justify-between text-[9px] pt-1.5 border-t border-[var(--line)]">
            <span className="text-[var(--muted)]">Total Sessions:</span>
            <span className="font-bold dept-accent">{activeRecord.sessions.toLocaleString()} ({activeRecord.share_pct}%)</span>
          </div>
          <div className="flex items-center justify-between text-[9px]">
            <span className="text-[var(--muted)]">Conversion Rate:</span>
            <span className="font-bold font-mono text-emerald-500">{activeRecord.cvr}% CVR</span>
          </div>
          {activeRecord.top_cities && activeRecord.top_cities.length > 0 && (
            <div className="text-[8.5px] text-[var(--muted)] pt-1">
              Top Regions: <span className="text-[var(--ink)] font-semibold">{activeRecord.top_cities.join(", ")}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
