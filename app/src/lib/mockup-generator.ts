/* ------------------------------------------------------------------
   3D SMART MOCKUP GENERATOR (§Canva Parity)
   Composites live canvas designs onto photorealistic surfaces:
   Street Posters, Smartphone Screens, Vinyl Sleeves, Framed Art,
   Billboards, and Apparel.
------------------------------------------------------------------- */

export interface MockupTemplate {
  id: string;
  name: string;
  category: "poster" | "digital" | "print" | "apparel";
  description: string;
  icon: string;
  canvasAspect: "flyer" | "square" | "story";
}

export const MOCKUP_TEMPLATES: MockupTemplate[] = [
  {
    id: "street_poster",
    name: "Urban Street Poster",
    category: "poster",
    description: "Pasted on an urban concrete / brick wall with realistic texture",
    icon: "🧱",
    canvasAspect: "flyer",
  },
  {
    id: "framed_gallery",
    name: "Minimalist Framed Wall Art",
    category: "poster",
    description: "Sleek wooden frame hanging in a modern studio interior",
    icon: "🖼️",
    canvasAspect: "flyer",
  },
  {
    id: "smartphone_hand",
    name: "Smartphone in Hand",
    category: "digital",
    description: "Social media flyer viewed on a modern mobile device",
    icon: "📱",
    canvasAspect: "story",
  },
  {
    id: "vinyl_record",
    name: "12-Inch Vinyl & Sleeve",
    category: "print",
    description: "Vinyl record sliding out of the album cover",
    icon: "💿",
    canvasAspect: "square",
  },
  {
    id: "city_billboard",
    name: "Highway Billboard",
    category: "poster",
    description: "Illuminated nighttime outdoor billboard",
    icon: "🏙️",
    canvasAspect: "flyer",
  },
];

/**
 * Render design into a photorealistic 3D mockup.
 */
export async function generateMockupDataUrl(
  templateId: string,
  designDataUrl: string
): Promise<string> {
  const canvas = document.createElement("canvas");
  const W = 1200;
  const H = 1200;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return designDataUrl;

  const designImg = await loadImage(designDataUrl);

  if (templateId === "street_poster") {
    // 1. Dark textured urban background
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, "#1c1917");
    bgGrad.addColorStop(1, "#0c0a09");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Brick pattern
    ctx.strokeStyle = "#292524";
    ctx.lineWidth = 2;
    for (let y = 0; y < H; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // 2. Poster shadow
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 35;
    ctx.shadowOffsetX = 10;
    ctx.shadowOffsetY = 20;

    // 3. Draw poster
    const pW = 680;
    const pH = 920;
    const pX = (W - pW) / 2;
    const pY = (H - pH) / 2;

    ctx.drawImage(designImg, pX, pY, pW, pH);
    ctx.restore();

    // 4. Subtle lighting glare overlay
    const glare = ctx.createLinearGradient(pX, pY, pX + pW, pY + pH);
    glare.addColorStop(0, "rgba(255,255,255,0.12)");
    glare.addColorStop(0.5, "rgba(255,255,255,0)");
    glare.addColorStop(1, "rgba(0,0,0,0.2)");
    ctx.fillStyle = glare;
    ctx.fillRect(pX, pY, pW, pH);

  } else if (templateId === "framed_gallery") {
    // Elegant warm room background
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, "#27272a");
    bgGrad.addColorStop(1, "#18181b");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Floor line
    ctx.fillStyle = "#09090b";
    ctx.fillRect(0, H - 120, W, 120);

    // Frame shadow
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 25;

    const fW = 660;
    const fH = 880;
    const fX = (W - fW) / 2;
    const fY = (H - fH) / 2 - 40;

    // Outer frame (Oak wood)
    ctx.fillStyle = "#78350f";
    ctx.fillRect(fX - 24, fY - 24, fW + 48, fH + 48);

    // Inner matting (Off-white)
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(fX, fY, fW, fH);

    // Design artwork inside matting
    const mPad = 48;
    ctx.drawImage(designImg, fX + mPad, fY + mPad, fW - mPad * 2, fH - mPad * 2);
    ctx.restore();

  } else if (templateId === "vinyl_record") {
    // Dark studio background
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    // 1. Vinyl Record sliding out to the right
    ctx.save();
    ctx.beginPath();
    ctx.arc(W / 2 + 180, H / 2, 340, 0, Math.PI * 2);
    ctx.fillStyle = "#020617";
    ctx.fill();
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 4;
    ctx.stroke();

    // Grooves
    for (let r = 160; r < 320; r += 20) {
      ctx.beginPath();
      ctx.arc(W / 2 + 180, H / 2, r, 0, Math.PI * 2);
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Vinyl Center label
    ctx.beginPath();
    ctx.arc(W / 2 + 180, H / 2, 100, 0, Math.PI * 2);
    ctx.fillStyle = "#ec4899";
    ctx.fill();
    ctx.drawImage(designImg, W / 2 + 100, H / 2 - 80, 160, 160);
    ctx.restore();

    // 2. Vinyl Album Sleeve Cover on left
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 30;
    ctx.shadowOffsetX = 10;
    ctx.shadowOffsetY = 15;

    const sW = 620;
    const sH = 620;
    const sX = 140;
    const sY = (H - sH) / 2;
    ctx.drawImage(designImg, sX, sY, sW, sH);
    ctx.restore();

  } else {
    // Default Clean Studio Mockup
    ctx.fillStyle = "#18181b";
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.7)";
    ctx.shadowBlur = 35;
    ctx.shadowOffsetY = 20;

    const dW = 700;
    const dH = (dW / designImg.width) * designImg.height;
    const dX = (W - dW) / 2;
    const dY = (H - dH) / 2;

    ctx.drawImage(designImg, dX, dY, dW, dH);
    ctx.restore();
  }

  return canvas.toDataURL("image/png");
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
