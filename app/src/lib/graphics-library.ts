/* ------------------------------------------------------------------
   VECTOR GRAPHICS & STICKERS LIBRARY (§Canva Parity)
   Curated SVG elements: Badges, Ribbons, Event/Party, Neon, Social Icons,
   Sales Bursts, Arrows & Flourishes.
------------------------------------------------------------------- */

export interface GraphicItem {
  id: string;
  name: string;
  category: "badges" | "ribbons" | "party" | "neon" | "social" | "flourishes" | "shapes";
  svg: string;
  defaultWidth: number;
  defaultHeight: number;
  tags: string[];
}

export const GRAPHICS_LIBRARY: GraphicItem[] = [
  /* ---- 1. BADGES & BURSTS ---- */
  {
    id: "badge_vip_gold",
    name: "VIP Gold Badge",
    category: "badges",
    defaultWidth: 160,
    defaultHeight: 160,
    tags: ["vip", "gold", "exclusive", "star", "luxury"],
    svg: `<svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="100" cy="100" r="90" fill="url(#vip_grad)" stroke="#ffd700" stroke-width="4" stroke-dasharray="6 3"/>
      <circle cx="100" cy="100" r="76" fill="#111111" stroke="#f59e0b" stroke-width="2"/>
      <text x="100" y="92" text-anchor="middle" fill="#ffd700" font-size="34" font-weight="900" font-family="Arial, sans-serif" letter-spacing="4">VIP</text>
      <text x="100" y="122" text-anchor="middle" fill="#ffffff" font-size="13" font-weight="700" font-family="Arial, sans-serif" letter-spacing="2">ACCESS</text>
      <polygon points="100,56 104,66 114,67 107,74 109,84 100,79 91,84 93,74 86,67 96,66" fill="#ffd700"/>
      <defs>
        <radialGradient id="vip_grad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#3b2b00"/>
          <stop offset="100%" stop-color="#000000"/>
        </radialGradient>
      </defs>
    </svg>`,
  },
  {
    id: "burst_sale_red",
    name: "Special Offer Burst",
    category: "badges",
    defaultWidth: 180,
    defaultHeight: 180,
    tags: ["sale", "burst", "discount", "offer", "red", "promo"],
    svg: `<svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M100 0 L123 29 L162 13 L167 52 L200 69 L184 105 L200 141 L167 158 L162 197 L123 181 L100 210 L77 181 L38 197 L33 158 L0 141 L16 105 L0 69 L33 52 L38 13 L77 29 Z" fill="#ef4444"/>
      <circle cx="100" cy="100" r="68" fill="#ffffff"/>
      <text x="100" y="92" text-anchor="middle" fill="#ef4444" font-size="28" font-weight="900" font-family="Arial, sans-serif">SPECIAL</text>
      <text x="100" y="124" text-anchor="middle" fill="#111111" font-size="24" font-weight="900" font-family="Arial, sans-serif">OFFER</text>
    </svg>`,
  },
  {
    id: "badge_live_tag",
    name: "LIVE Broadcast Tag",
    category: "badges",
    defaultWidth: 160,
    defaultHeight: 60,
    tags: ["live", "stream", "broadcast", "red", "tag"],
    svg: `<svg viewBox="0 0 200 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="200" height="80" rx="40" fill="#dc2626"/>
      <circle cx="48" cy="40" r="14" fill="#ffffff"/>
      <circle cx="48" cy="40" r="8" fill="#dc2626"/>
      <text x="120" y="51" text-anchor="middle" fill="#ffffff" font-size="32" font-weight="900" font-family="Arial, sans-serif" letter-spacing="3">LIVE</text>
    </svg>`,
  },
  {
    id: "badge_sold_out",
    name: "Sold Out Stamp",
    category: "badges",
    defaultWidth: 200,
    defaultHeight: 90,
    tags: ["sold out", "stamp", "ticket", "event", "red"],
    svg: `<svg viewBox="0 0 240 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="6" y="6" width="228" height="88" rx="10" fill="#dc2626" fill-opacity="0.1" stroke="#dc2626" stroke-width="6" stroke-dasharray="14 6"/>
      <rect x="14" y="14" width="212" height="72" rx="6" fill="#dc2626"/>
      <text x="120" y="60" text-anchor="middle" fill="#ffffff" font-size="30" font-weight="900" font-family="Arial, sans-serif" letter-spacing="4">SOLD OUT</text>
    </svg>`,
  },

  /* ---- 2. RIBBONS & BANNERS ---- */
  {
    id: "ribbon_gold_classic",
    name: "Golden Header Ribbon",
    category: "ribbons",
    defaultWidth: 320,
    defaultHeight: 90,
    tags: ["ribbon", "banner", "gold", "title", "header"],
    svg: `<svg viewBox="0 0 400 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polygon points="40,20 80,60 40,100 90,80 90,40" fill="#b45309"/>
      <polygon points="360,20 320,60 360,100 310,80 310,40" fill="#b45309"/>
      <polygon points="60,90 90,65 90,90" fill="#78350f"/>
      <polygon points="340,90 310,65 310,90" fill="#78350f"/>
      <path d="M70 20 L330 20 L310 80 L90 80 Z" fill="url(#ribbon_g)" stroke="#fef08a" stroke-width="2"/>
      <line x1="95" y1="30" x2="305" y2="30" stroke="#ffffff" stroke-width="1.5" stroke-dasharray="4 2" stroke-opacity="0.6"/>
      <line x1="95" y1="70" x2="305" y2="70" stroke="#ffffff" stroke-width="1.5" stroke-dasharray="4 2" stroke-opacity="0.6"/>
      <defs>
        <linearGradient id="ribbon_g" x1="70" y1="20" x2="330" y2="80" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#fbbf24"/>
          <stop offset="50%" stop-color="#f59e0b"/>
          <stop offset="100%" stop-color="#d97706"/>
        </linearGradient>
      </defs>
    </svg>`,
  },
  {
    id: "ribbon_curved_neon",
    name: "Curved Cyber Ribbon",
    category: "ribbons",
    defaultWidth: 300,
    defaultHeight: 90,
    tags: ["ribbon", "cyan", "cyber", "neon", "modern"],
    svg: `<svg viewBox="0 0 400 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 30 Q200 -10 380 30 L360 90 Q200 50 40 90 Z" fill="#06b6d4" stroke="#67e8f9" stroke-width="3"/>
      <path d="M30 40 Q200 4 370 40" stroke="#ffffff" stroke-width="2" stroke-dasharray="6 3"/>
    </svg>`,
  },

  /* ---- 3. PARTY & EVENT ---- */
  {
    id: "party_confetti_burst",
    name: "Confetti Celebration Explosion",
    category: "party",
    defaultWidth: 260,
    defaultHeight: 260,
    tags: ["confetti", "party", "celebration", "burst", "festival", "club"],
    svg: `<svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="20" y="30" width="8" height="14" rx="2" transform="rotate(25 20 30)" fill="#ec4899"/>
      <rect x="160" y="40" width="10" height="6" rx="2" transform="rotate(-35 160 40)" fill="#3b82f6"/>
      <rect x="40" y="150" width="12" height="7" rx="2" transform="rotate(45 40 150)" fill="#eab308"/>
      <rect x="150" y="160" width="8" height="12" rx="2" transform="rotate(-15 150 160)" fill="#10b981"/>
      <circle cx="35" cy="80" r="4" fill="#a855f7"/>
      <circle cx="170" cy="100" r="5" fill="#f43f5e"/>
      <circle cx="95" cy="20" r="4" fill="#06b6d4"/>
      <circle cx="110" cy="180" r="5" fill="#eab308"/>
      <polygon points="80,45 84,55 94,56 87,63 89,73 80,68 71,73 73,63 66,56 76,55" fill="#f59e0b"/>
      <polygon points="135,120 138,127 145,128 140,133 141,140 135,136 129,140 130,133 125,128 132,127" fill="#06b6d4"/>
      <path d="M30 110 Q50 90 40 70" stroke="#ec4899" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M150 70 Q170 85 160 110" stroke="#eab308" stroke-width="3" fill="none" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: "party_sparkles_gold",
    name: "Golden Magic Sparkles",
    category: "party",
    defaultWidth: 160,
    defaultHeight: 160,
    tags: ["sparkles", "stars", "gold", "shine", "glow", "magic"],
    svg: `<svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M100 20 Q100 100 20 100 Q100 100 100 180 Q100 100 180 100 Q100 100 100 20 Z" fill="#ffd700"/>
      <path d="M155 35 Q155 65 125 65 Q155 65 155 95 Q155 65 185 65 Q155 65 155 35 Z" fill="#fef08a"/>
      <path d="M45 125 Q45 145 25 145 Q45 145 45 165 Q45 145 65 145 Q45 145 45 125 Z" fill="#fef08a"/>
    </svg>`,
  },
  {
    id: "party_disco_ball",
    name: "Retro Disco Ball",
    category: "party",
    defaultWidth: 180,
    defaultHeight: 220,
    tags: ["disco", "ball", "party", "club", "dj", "night"],
    svg: `<svg viewBox="0 0 200 240" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="100" y1="0" x2="100" y2="40" stroke="#94a3b8" stroke-width="3"/>
      <circle cx="100" cy="130" r="85" fill="#1e293b" stroke="#cbd5e1" stroke-width="4"/>
      <path d="M30 100 Q100 115 170 100 M20 130 Q100 148 180 130 M30 160 Q100 175 170 160" stroke="#e2e8f0" stroke-width="2" fill="none"/>
      <path d="M70 50 Q60 130 70 210 M100 45 Q100 130 100 215 M130 50 Q140 130 130 210" stroke="#e2e8f0" stroke-width="2" fill="none"/>
      <polygon points="90,75 105,75 105,90 90,90" fill="#38bdf8"/>
      <polygon points="120,105 135,105 135,120 120,120" fill="#f43f5e"/>
      <polygon points="65,135 80,135 80,150 65,150" fill="#facc15"/>
    </svg>`,
  },

  /* ---- 4. NEON & GLOWS ---- */
  {
    id: "neon_flame_glow",
    name: "Cyber Neon Flame",
    category: "neon",
    defaultWidth: 160,
    defaultHeight: 220,
    tags: ["flame", "fire", "neon", "cyan", "hot", "trending"],
    svg: `<svg viewBox="0 0 200 260" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M100 10 C120 70 180 110 180 170 C180 220 145 250 100 250 C55 250 20 220 20 170 C20 120 65 80 80 40 C85 70 110 90 100 120 C120 100 130 70 100 10 Z" fill="#06b6d4" stroke="#67e8f9" stroke-width="4"/>
      <path d="M100 120 C115 150 140 170 140 200 C140 225 120 240 100 240 C80 240 60 225 60 200 C60 175 80 160 90 140 Z" fill="#ffffff"/>
    </svg>`,
  },
  {
    id: "neon_starburst",
    name: "Neon Electric Star",
    category: "neon",
    defaultWidth: 180,
    defaultHeight: 180,
    tags: ["star", "electric", "neon", "magenta", "glow"],
    svg: `<svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="100" cy="100" r="30" fill="#ec4899" fill-opacity="0.4"/>
      <path d="M100 0 L108 80 L188 100 L108 120 L100 200 L92 120 L12 100 L92 80 Z" fill="#ec4899" stroke="#fbcfe8" stroke-width="3"/>
      <circle cx="100" cy="100" r="12" fill="#ffffff"/>
    </svg>`,
  },

  /* ---- 5. SOCIAL MEDIA ICONS ---- */
  {
    id: "social_instagram",
    name: "Instagram Icon (Color)",
    category: "social",
    defaultWidth: 80,
    defaultHeight: 80,
    tags: ["instagram", "ig", "social", "media", "follow"],
    svg: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" rx="28" fill="url(#ig_g)"/>
      <rect x="22" y="22" width="56" height="56" rx="16" stroke="#ffffff" stroke-width="7" fill="none"/>
      <circle cx="50" cy="50" r="14" stroke="#ffffff" stroke-width="7" fill="none"/>
      <circle cx="67" cy="33" r="4" fill="#ffffff"/>
      <defs>
        <linearGradient id="ig_g" x1="0" y1="100" x2="100" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#f59e0b"/>
          <stop offset="50%" stop-color="#e11d48"/>
          <stop offset="100%" stop-color="#7c3aed"/>
        </linearGradient>
      </defs>
    </svg>`,
  },
  {
    id: "social_tiktok",
    name: "TikTok Icon",
    category: "social",
    defaultWidth: 80,
    defaultHeight: 80,
    tags: ["tiktok", "video", "social", "media"],
    svg: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" rx="28" fill="#000000"/>
      <path d="M52 24 C54 32 60 38 68 40 L68 49 C62 49 56 46 52 42 L52 64 C52 74 44 80 34 78 C26 76 20 68 22 59 C24 50 33 46 42 48 L42 57 C37 55 32 58 31 63 C30 67 34 70 38 70 C43 70 46 66 46 61 L46 24 L52 24 Z" fill="#25f4ee"/>
      <path d="M54 26 C56 34 62 40 70 42 L70 51 C64 51 58 48 54 44 L54 66 C54 76 46 82 36 80 C28 78 22 70 24 61 C26 52 35 48 44 50 L44 59 C39 57 34 60 33 65 C32 69 36 72 40 72 C45 72 48 68 48 63 L48 26 L54 26 Z" fill="#fe2c55"/>
      <path d="M53 25 C55 33 61 39 69 41 L69 50 C63 50 57 47 53 43 L53 65 C53 75 45 81 35 79 C27 77 21 69 23 60 C25 51 34 47 43 49 L43 58 C38 56 33 59 32 64 C31 68 35 71 39 71 C44 71 47 67 47 62 L47 25 L53 25 Z" fill="#ffffff"/>
    </svg>`,
  },
  {
    id: "social_spotify",
    name: "Spotify Icon",
    category: "social",
    defaultWidth: 80,
    defaultHeight: 80,
    tags: ["spotify", "music", "dj", "playlist", "audio"],
    svg: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="48" fill="#1db954"/>
      <path d="M26 40 Q50 32 74 42" stroke="#000000" stroke-width="7" stroke-linecap="round" fill="none"/>
      <path d="M30 52 Q50 45 70 53" stroke="#000000" stroke-width="6" stroke-linecap="round" fill="none"/>
      <path d="M34 63 Q50 57 66 64" stroke="#000000" stroke-width="5" stroke-linecap="round" fill="none"/>
    </svg>`,
  },
  {
    id: "social_youtube",
    name: "YouTube Icon",
    category: "social",
    defaultWidth: 80,
    defaultHeight: 80,
    tags: ["youtube", "video", "social", "stream"],
    svg: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" rx="28" fill="#ff0000"/>
      <polygon points="40,32 68,50 40,68" fill="#ffffff"/>
    </svg>`,
  },

  /* ---- 6. ARROWS & FLOURISHES ---- */
  {
    id: "flourish_arrow_curved",
    name: "Hand-Drawn Accent Arrow",
    category: "flourishes",
    defaultWidth: 160,
    defaultHeight: 100,
    tags: ["arrow", "pointer", "curved", "doodle", "accent"],
    svg: `<svg viewBox="0 0 180 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 90 C50 20 120 15 150 65" stroke="#f59e0b" stroke-width="7" stroke-linecap="round" fill="none"/>
      <path d="M125 65 L155 70 L150 40" stroke="#f59e0b" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </svg>`,
  },
  {
    id: "flourish_crown_gold",
    name: "Golden Royalty Crown",
    category: "flourishes",
    defaultWidth: 180,
    defaultHeight: 120,
    tags: ["crown", "king", "queen", "vip", "gold", "luxury"],
    svg: `<svg viewBox="0 0 200 140" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 120 L30 40 L70 80 L100 20 L130 80 L170 40 L180 120 Z" fill="#f59e0b" stroke="#fbbf24" stroke-width="4"/>
      <rect x="20" y="115" width="160" height="15" rx="4" fill="#d97706"/>
      <circle cx="30" cy="35" r="7" fill="#fef08a"/>
      <circle cx="100" cy="15" r="9" fill="#fef08a"/>
      <circle cx="170" cy="35" r="7" fill="#fef08a"/>
    </svg>`,
  },
];
