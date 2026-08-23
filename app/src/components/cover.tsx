import { useMemo } from "react";

/* ------------------------------------------------------------------
   GENERATIVE PROJECT COVERS
   Code-drawn cover art — no stock photos. Each project seeds a
   deterministic composition in its own hue. Three composition
   archetypes rotate by seed: halftone field, bar rhythm, orbit arcs.
------------------------------------------------------------------- */

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function ProjectCover({
  seed,
  hue,
  title,
  image,
  className = "",
}: {
  seed: number;
  hue: number;
  title: string;
  image?: string;   // uploaded cover (admin CMS) — takes precedence over generative art
  className?: string;
}) {
  const kind = seed % 3;
  const nodes = useMemo(() => {
    const rnd = mulberry(seed * 997 + 13);
    const els: React.ReactNode[] = [];
    const W = 800, H = 1000;

    if (kind === 0) {
      // halftone field — dot grid with a seeded diagonal falloff
      const step = 40;
      for (let y = step; y < H; y += step) {
        for (let x = step; x < W; x += step) {
          const d = (x + y) / (W + H);
          const r = Math.max(0.5, (rnd() * 0.55 + d * 0.75) * step * 0.42);
          els.push(<circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill={`hsl(${hue} 80% ${18 + d * 30}%)`} />);
        }
      }
    } else if (kind === 1) {
      // bar rhythm — vertical strips, seeded heights and gaps
      const n = 9 + Math.floor(rnd() * 5);
      const bw = W / n;
      for (let i = 0; i < n; i++) {
        const h = H * (0.25 + rnd() * 0.7);
        const light = 14 + rnd() * 42;
        els.push(
          <rect key={i} x={i * bw + bw * 0.14} y={H - h} width={bw * 0.72} height={h}
            fill={i % 4 === 0 ? `hsl(${hue} 85% 55%)` : `hsl(${hue} 60% ${light}%)`} />
        );
      }
    } else {
      // orbit arcs — concentric strokes with a seeded sweep
      const cx = W * (0.3 + rnd() * 0.4), cy = H * (0.35 + rnd() * 0.3);
      for (let i = 0; i < 12; i++) {
        const r = 60 + i * 52 + rnd() * 20;
        const start = rnd() * 360;
        const sweep = 60 + rnd() * 220;
        const large = sweep > 180 ? 1 : 0;
        const a0 = (start * Math.PI) / 180, a1 = ((start + sweep) * Math.PI) / 180;
        els.push(
          <path key={i}
            d={`M ${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)} A ${r} ${r} 0 ${large} 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)}`}
            stroke={i % 3 === 0 ? `hsl(${hue} 85% 58%)` : `hsl(${hue} 55% ${20 + i * 3}%)`}
            strokeWidth={i % 3 === 0 ? 10 : 4} fill="none" />
        );
      }
    }
    return els;
  }, [seed, hue, kind]);

  return (
    <svg
      viewBox="0 0 800 1000"
      role="img"
      aria-label={`${title} — project cover artwork`}
      className={className}
      preserveAspectRatio="xMidYMid slice"
      style={{ display: "block", width: "100%", height: "100%", background: `hsl(${hue} 45% 8%)` }}
    >
      {image ? (
        <image href={image} x="0" y="0" width="800" height="1000" preserveAspectRatio="xMidYMid slice" />
      ) : (
        nodes
      )}
      <rect x="0" y="0" width="800" height="1000" fill="none" stroke={`hsl(${hue} 70% 50% / 0.35)`} strokeWidth="2" />
    </svg>
  );
}
