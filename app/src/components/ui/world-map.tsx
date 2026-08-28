"use client";

import { useRef, useMemo, useState } from "react";
import { motion } from "framer-motion";
import DottedMap from "dotted-map";
import { useTheme } from "next-themes";

export interface MapPoint {
  lat: number;
  lng: number;
  label?: string;
  code?: string;
  sessions?: number;
  live?: number;
  flag?: string;
}

export interface MapDot {
  start: MapPoint;
  end: MapPoint;
}

export interface WorldMapProps {
  dots?: MapDot[];
  points?: MapPoint[];
  lineColor?: string;
  className?: string;
  onSelectPoint?: (point: MapPoint) => void;
  onHoverPoint?: (point: MapPoint | null) => void;
  activePointCode?: string | null;
}

export function WorldMap({
  dots = [],
  points = [],
  lineColor = "#0ea5e9",
  className = "",
  onSelectPoint,
  onHoverPoint,
  activePointCode,
}: WorldMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [internalHover, setInternalHover] = useState<MapPoint | null>(null);

  // Safe theme detection with fallback for non-next-themes contexts
  let currentTheme = "dark";
  try {
    const themeContext = useTheme();
    if (themeContext?.theme) {
      currentTheme = themeContext.theme;
    } else if (typeof document !== "undefined" && document.documentElement.classList.contains("light")) {
      currentTheme = "light";
    }
  } catch {
    if (typeof document !== "undefined" && document.documentElement.classList.contains("light")) {
      currentTheme = "light";
    }
  }

  const isDark = currentTheme === "dark" || currentTheme === "system";

  const svgMap = useMemo(() => {
    try {
      const DottedMapConstructor = (DottedMap as unknown as { default?: typeof DottedMap }).default || DottedMap;
      const map = new DottedMapConstructor({ height: 100, grid: "diagonal" });
      return map.getSVG({
        radius: 0.22,
        color: isDark ? "rgba(255, 255, 255, 0.28)" : "rgba(0, 0, 0, 0.25)",
        shape: "circle",
        backgroundColor: "transparent",
      });
    } catch (e) {
      console.warn("Failed to generate dotted map SVG:", e);
      return "";
    }
  }, [isDark]);

  const projectPoint = (lat: number, lng: number) => {
    const x = (lng + 180) * (800 / 360);
    const y = (90 - lat) * (400 / 180);
    return { x, y };
  };

  const createCurvedPath = (
    start: { x: number; y: number },
    end: { x: number; y: number }
  ) => {
    const midX = (start.x + end.x) / 2;
    const midY = Math.min(start.y, end.y) - 50;
    return `M ${start.x} ${start.y} Q ${midX} ${midY} ${end.x} ${end.y}`;
  };

  // Collect all unique points from explicit points array and dot endpoints
  const allPoints = useMemo(() => {
    const map = new Map<string, MapPoint>();
    points.forEach((p) => {
      const key = `${p.lat.toFixed(2)}_${p.lng.toFixed(2)}`;
      map.set(key, p);
    });
    dots.forEach((d) => {
      const k1 = `${d.start.lat.toFixed(2)}_${d.start.lng.toFixed(2)}`;
      const k2 = `${d.end.lat.toFixed(2)}_${d.end.lng.toFixed(2)}`;
      if (!map.has(k1)) map.set(k1, d.start);
      if (!map.has(k2)) map.set(k2, d.end);
    });
    return Array.from(map.values());
  }, [points, dots]);

  return (
    <div className={`w-full aspect-[2/1] rounded-2xl relative font-sans overflow-hidden select-none ${className}`}>
      {/* Background Dotted SVG Map */}
      {svgMap && (
        <img
          src={`data:image/svg+xml;utf8,${encodeURIComponent(svgMap)}`}
          className="h-full w-full object-cover [mask-image:linear-gradient(to_bottom,transparent,white_8%,white_92%,transparent)] pointer-events-none select-none opacity-85"
          alt="World telemetry map"
          height="495"
          width="1056"
          draggable={false}
        />
      )}

      {/* Foreground Interactive SVG Overlay */}
      <svg
        ref={svgRef}
        viewBox="0 0 800 400"
        className="w-full h-full absolute inset-0 pointer-events-auto"
      >
        <defs>
          <linearGradient id="path-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="white" stopOpacity="0" />
            <stop offset="10%" stopColor={lineColor} stopOpacity="0.8" />
            <stop offset="90%" stopColor={lineColor} stopOpacity="0.9" />
            <stop offset="100%" stopColor="white" stopOpacity="0.1" />
          </linearGradient>

          <filter id="map-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Animated Curved Telemetry Arcs */}
        {dots.map((dot, i) => {
          const startPoint = projectPoint(dot.start.lat, dot.start.lng);
          const endPoint = projectPoint(dot.end.lat, dot.end.lng);
          return (
            <g key={`path-group-${i}`}>
              <motion.path
                d={createCurvedPath(startPoint, endPoint)}
                fill="none"
                stroke="url(#path-gradient)"
                strokeWidth="1.5"
                strokeDasharray="4 2"
                initial={{
                  pathLength: 0,
                  opacity: 0.2,
                }}
                animate={{
                  pathLength: 1,
                  opacity: [0.2, 0.9, 0.4],
                }}
                transition={{
                  duration: 2.2,
                  delay: 0.3 * i,
                  ease: "easeInOut",
                  repeat: Infinity,
                  repeatType: "loop",
                  repeatDelay: 1.5,
                }}
              />
            </g>
          );
        })}

        {/* Hotspots / City Nodes */}
        {allPoints.map((pt, i) => {
          const coords = projectPoint(pt.lat, pt.lng);
          const isSelected = activePointCode && pt.code === activePointCode;
          const isLive = (pt.live ?? 0) > 0;
          const hasTraffic = (pt.sessions ?? 0) > 0;

          return (
            <g
              key={`point-${i}-${pt.code || i}`}
              className="cursor-pointer group"
              onClick={() => onSelectPoint?.(pt)}
              onMouseEnter={() => {
                setInternalHover(pt);
                onHoverPoint?.(pt);
              }}
              onMouseLeave={() => {
                setInternalHover(null);
                onHoverPoint?.(null);
              }}
            >
              {/* Outer Radar Ripple for Live / High Traffic Nodes */}
              {(isLive || hasTraffic || isSelected) && (
                <circle
                  cx={coords.x}
                  cy={coords.y}
                  r="3.5"
                  fill={isLive ? "#22c55e" : lineColor}
                  opacity="0.5"
                >
                  <animate
                    attributeName="r"
                    from="3"
                    to={isSelected ? "16" : "12"}
                    dur="2s"
                    begin={`${(i % 5) * 0.3}s`}
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    from="0.8"
                    to="0"
                    dur="2s"
                    begin={`${(i % 5) * 0.3}s`}
                    repeatCount="indefinite"
                  />
                </circle>
              )}

              {/* Core Solid Node */}
              <circle
                cx={coords.x}
                cy={coords.y}
                r={isSelected ? 4.5 : hasTraffic ? 3.5 : 2.5}
                fill={isLive ? "#22c55e" : isSelected ? "var(--dept, #0ea5e9)" : lineColor}
                stroke={isDark ? "rgba(0,0,0,0.8)" : "rgba(255,255,255,0.9)"}
                strokeWidth="1"
                className="transition-transform group-hover:scale-150"
              />

              {/* Node Code / Label */}
              {pt.code && (
                <text
                  x={coords.x}
                  y={coords.y - 6}
                  textAnchor="middle"
                  className={`text-[7.5px] font-mono font-bold fill-[var(--ink,#fff)] pointer-events-none transition-opacity ${
                    isSelected ? "opacity-100 font-extrabold" : "opacity-60 group-hover:opacity-100"
                  }`}
                >
                  {pt.code}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Built-in Tooltip if hovered point exists */}
      {internalHover && (
        <div
          className="absolute z-20 pointer-events-none p-2.5 rounded-xl border border-[var(--line-strong,rgba(255,255,255,0.2))] shadow-2xl font-meta text-[10px] space-y-1 animate-fade-in backdrop-blur-md"
          style={{
            background: isDark ? "rgba(10, 10, 15, 0.88)" : "rgba(255, 255, 255, 0.92)",
            color: isDark ? "#fff" : "#111",
            bottom: "16px",
            right: "16px",
            minWidth: "150px",
          }}
        >
          <div className="flex items-center gap-1.5 font-display text-xs font-bold uppercase">
            {internalHover.flag && <span>{internalHover.flag}</span>}
            <span>{internalHover.label || internalHover.code}</span>
          </div>
          {internalHover.sessions !== undefined && (
            <div className="flex items-center justify-between text-[9px] pt-1 border-t border-[var(--line,rgba(255,255,255,0.1))]">
              <span className="opacity-70">Visitors:</span>
              <span className="font-bold text-[var(--dept,#0ea5e9)]">{internalHover.sessions.toLocaleString()}</span>
            </div>
          )}
          {internalHover.live !== undefined && internalHover.live > 0 && (
            <div className="flex items-center justify-between text-[9px]">
              <span className="opacity-70">Live Now:</span>
              <span className="font-bold text-emerald-400">⚡ {internalHover.live} active</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
