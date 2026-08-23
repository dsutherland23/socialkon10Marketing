/* ------------------------------------------------------------------
   PHOTO FRAMES & CLIPPING MASKS SYSTEM (§Canva Parity)
   Pre-designed framing containers: Smartphone, Polaroid, Circle,
   Torn Paper, Hexagon, Star, Heart, Postage Stamp.
------------------------------------------------------------------- */

export interface FrameTemplate {
  id: string;
  name: string;
  category: "device" | "photo" | "geometric" | "grunge";
  width: number;
  height: number;
  previewSvg: string;
  clipShape: "rect" | "circle" | "polygon" | "path";
  clipPathData?: string;
  clipRect?: { left: number; top: number; width: number; height: number; rx?: number };
  frameOverlaySvg?: string;
}

export const FRAME_TEMPLATES: FrameTemplate[] = [
  {
    id: "frame_phone_mockup",
    name: "Smartphone Frame",
    category: "device",
    width: 220,
    height: 440,
    clipShape: "rect",
    clipRect: { left: 16, top: 40, width: 188, height: 360, rx: 18 },
    previewSvg: `<svg viewBox="0 0 220 440" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="6" y="6" width="208" height="428" rx="36" fill="#1e293b" stroke="#64748b" stroke-width="4"/>
      <rect x="16" y="40" width="188" height="360" rx="18" fill="#38bdf8" fill-opacity="0.3"/>
      <circle cx="110" cy="24" r="5" fill="#0f172a"/>
      <rect x="85" y="416" width="50" height="4" rx="2" fill="#64748b"/>
    </svg>`,
    frameOverlaySvg: `<svg viewBox="0 0 220 440" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="6" y="6" width="208" height="428" rx="36" fill="none" stroke="#334155" stroke-width="8"/>
      <circle cx="110" cy="24" r="5" fill="#0f172a"/>
      <rect x="85" y="416" width="50" height="4" rx="2" fill="#64748b"/>
    </svg>`,
  },
  {
    id: "frame_polaroid",
    name: "Vintage Polaroid Frame",
    category: "photo",
    width: 280,
    height: 340,
    clipShape: "rect",
    clipRect: { left: 24, top: 24, width: 232, height: 232, rx: 0 },
    previewSvg: `<svg viewBox="0 0 280 340" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="4" width="272" height="332" rx="6" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
      <rect x="24" y="24" width="232" height="232" fill="#06b6d4" fill-opacity="0.3"/>
      <line x1="40" y1="290" x2="160" y2="290" stroke="#cbd5e1" stroke-width="4" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: "frame_circle_gold",
    name: "Golden Circle Frame",
    category: "geometric",
    width: 260,
    height: 260,
    clipShape: "circle",
    clipRect: { left: 20, top: 20, width: 220, height: 220 },
    previewSvg: `<svg viewBox="0 0 260 260" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="130" cy="130" r="118" fill="#111111" stroke="#ffd700" stroke-width="8"/>
      <circle cx="130" cy="130" r="106" fill="#fbbf24" fill-opacity="0.3" stroke="#fef08a" stroke-width="2" stroke-dasharray="6 3"/>
    </svg>`,
  },
  {
    id: "frame_hexagon_badge",
    name: "Hexagon Badge Frame",
    category: "geometric",
    width: 260,
    height: 280,
    clipShape: "polygon",
    clipPathData: "M130 10 L245 75 L245 205 L130 270 L15 205 L15 75 Z",
    previewSvg: `<svg viewBox="0 0 260 280" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polygon points="130,10 245,75 245,205 130,270 15,205 15,75" fill="#a855f7" fill-opacity="0.3" stroke="#c084fc" stroke-width="6"/>
    </svg>`,
  },
  {
    id: "frame_heart",
    name: "Heart Cutout Frame",
    category: "geometric",
    width: 280,
    height: 260,
    clipShape: "path",
    clipPathData: "M140 240 C140 240 20 160 20 80 C20 30 60 10 100 10 C125 10 140 30 140 30 C140 30 155 10 180 10 C220 10 260 30 260 80 C260 160 140 240 140 240 Z",
    previewSvg: `<svg viewBox="0 0 280 260" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M140 240 C140 240 20 160 20 80 C20 30 60 10 100 10 C125 10 140 30 140 30 C140 30 155 10 180 10 C220 10 260 30 260 80 C260 160 140 240 140 240 Z" fill="#ec4899" fill-opacity="0.3" stroke="#f472b6" stroke-width="6"/>
    </svg>`,
  },
  {
    id: "frame_postage_stamp",
    name: "Postage Stamp Frame",
    category: "grunge",
    width: 280,
    height: 240,
    clipShape: "rect",
    clipRect: { left: 24, top: 24, width: 232, height: 192, rx: 0 },
    previewSvg: `<svg viewBox="0 0 280 240" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="10" width="260" height="220" rx="4" fill="#ffffff" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="8 6"/>
      <rect x="24" y="24" width="232" height="192" fill="#10b981" fill-opacity="0.3"/>
    </svg>`,
  },
];
