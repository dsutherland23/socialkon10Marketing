/* ------------------------------------------------------------------
   AI COPYWRITER & MAGIC WRITE ENGINE (§Canva Parity)
   Generates catchy marketing headlines, event slogans, party hooks,
   and tone transformations directly for canvas text layers.
------------------------------------------------------------------- */

export interface MagicWriteOption {
  id: string;
  label: string;
  category: "event" | "promo" | "tone" | "polish";
  icon: string;
  prompt: string;
}

export const MAGIC_WRITE_OPTIONS: MagicWriteOption[] = [
  {
    id: "headline_event",
    label: "High-Energy Event Headline",
    category: "event",
    icon: "⚡",
    prompt: "Generate a powerful, energetic event headline",
  },
  {
    id: "hook_club_night",
    label: "VIP Nightclub & DJ Hook",
    category: "event",
    icon: "🔥",
    prompt: "Generate a hype VIP nightlife and DJ tagline",
  },
  {
    id: "promo_flash_sale",
    label: "Flash Sale & Discount Hook",
    category: "promo",
    icon: "🏷️",
    prompt: "Generate an urgent flash sale discount callout",
  },
  {
    id: "tone_luxury",
    label: "Rewrite: Luxury & Exclusive",
    category: "tone",
    icon: "✨",
    prompt: "Rewrite this in a luxury, prestigious tone",
  },
  {
    id: "tone_hype",
    label: "Rewrite: Maximum Hype",
    category: "tone",
    icon: "🚀",
    prompt: "Rewrite this with extreme hype and energy",
  },
  {
    id: "polish_shorten",
    label: "Shorten (Punchy 3-5 Words)",
    category: "polish",
    icon: "✂️",
    prompt: "Shorten this into 3 to 5 punchy words",
  },
];

const GENERATIVE_BANKS: Record<string, string[]> = {
  headline_event: [
    "THE BIGGEST NIGHT OF THE YEAR",
    "ONE NIGHT ONLY · LIVE IN CONCERT",
    "EXPERIENCE THE SOUND UNLEASHED",
    "THE OFFICIAL SUMMER BLOCK PARTY",
    "A REVOLUTION IN LIVE ENTERTAINMENT",
    "STEP INTO THE FUTURE OF SOUND",
    "UNSTOPPABLE ENERGY · PURE VIBES",
  ],
  hook_club_night: [
    "VIP BOTTLE SERVICE & EXCLUSIVE TABLES",
    "FEATURING WORLD-CLASS GUEST DJS",
    "WHERE LUXURY MEETS THE UNDERGROUND",
    "DANCE UNTIL DAWN · DOORS OPEN 10PM",
    "LADIES FREE BEFORE MIDNIGHT",
    "THE ULTIMATE WEEKEND EXPERIENCE",
  ],
  promo_flash_sale: [
    "LIMITED EARLY BIRD TICKETS AVAILABLE NOW",
    "50% OFF FOR THE FIRST 100 GUESTS",
    "DON'T MISS OUT · TICKETS SELLING FAST",
    "EXCLUSIVE ONLINE PRESALE NOW LIVE",
    "SAVE BIG · SPECIAL WEEKEND PASS",
  ],
  tone_luxury: [
    "An Unrivaled Evening of Distinction & Elegance",
    "Curated Exclusively for the Discerning Elite",
    "Experience Uncompromising Sophistication",
    "Reserved for Those Who Demand the Exceptional",
  ],
  tone_hype: [
    "ARE YOU READY TO BLOW THE ROOF OFF?!",
    "100% UNFILTERED ENERGY ALL NIGHT LONG!",
    "GET READY FOR THE CRAZIEST PARTY IN TOWN!",
    "LOCK IN YOUR SPOT BEFORE IT'S SOLD OUT!",
  ],
  polish_shorten: [
    "LIVE TONIGHT",
    "VIP ACCESS ONLY",
    "TICKETS ON SALE",
    "SUMMER JAM 2026",
    "DON'T MISS THIS",
  ],
};

/**
 * Generate AI copy for the selected text or prompt.
 */
export async function generateAiCopy(
  optionId: string,
  currentText = "",
  customTopic = ""
): Promise<string> {
  // Simulate rapid AI inference
  await new Promise((r) => setTimeout(r, 200));

  const list = GENERATIVE_BANKS[optionId];
  if (list && list.length > 0) {
    if (customTopic.trim()) {
      const prefix = customTopic.toUpperCase();
      const randomItem = list[Math.floor(Math.random() * list.length)];
      return `${prefix} · ${randomItem}`;
    }
    return list[Math.floor(Math.random() * list.length)];
  }

  // Fallback tone adaptation
  if (currentText.trim()) {
    if (optionId.includes("shorten")) {
      return currentText.split(/\s+/).slice(0, 4).join(" ").toUpperCase();
    }
    if (optionId.includes("hype")) {
      return `${currentText.toUpperCase()} — LIVE & UNLEASHED!`;
    }
    if (optionId.includes("luxury")) {
      return `The Art of ${currentText}`;
    }
  }

  return "THE MAIN EVENT · LIVE ON STAGE";
}
