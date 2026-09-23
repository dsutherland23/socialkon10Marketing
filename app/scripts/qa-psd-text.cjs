/* QA: verify PSD text metadata extraction + conversion simulation on real files */
const fs = require("fs");
const path = require("path");
const { readPsd } = require("ag-psd");

// --- replicate the normalization + style-run logic from the app ---
function normalizePsdFontName(raw) {
  let n = (raw || "").trim();
  n = n.replace(/[-_ ](regular|bold|italic|oblique|light|medium|semibold|semi bold|black|thin|extrabold|extra bold|extralight|extra light|heavy|book|roman|normal|condensed|narrow|display|text)$/i, "");
  n = n.replace(/MT$/i, "");
  n = n.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return n.replace(/[-_]+/g, " ").replace(/\s{2,}/g, " ").trim();
}

const CATALOG = ["Archivo","Instrument Sans","Inter","Montserrat","Poppins","Work Sans","DM Sans","Oswald","Arial","Playfair Display","Libre Baskerville","DM Serif Display","Georgia","Times New Roman","Bebas Neue","Anton","Righteous","Bungee","Space Grotesk","Dancing Script","Pacifico","Caveat","Space Mono","JetBrains Mono","Courier New"];

function walk(layers, out = [], depth = 0) {
  for (const l of layers || []) {
    if (l.children) { walk(l.children, out, depth + 1); continue; }
    if (l.text?.text) out.push({ layer: l, depth });
  }
  return out;
}

for (const file of process.argv.slice(2)) {
  console.log(`\n========== ${path.basename(file)} ==========`);
  const buf = fs.readFileSync(file);
  const psd = readPsd(buf, { skipLayerImageData: true, skipCompositeImageData: true, skipThumbnail: true });
  console.log(`canvas: ${psd.width}x${psd.height}`);
  const textLayers = walk(psd.layers);
  console.log(`text layers: ${textLayers.length}`);
  for (const { layer, depth } of textLayers) {
    const t = layer.text;
    const st = t.style || {};
    const indent = "  ".repeat(depth);
    const rawFont = st.font?.name || "?";
    const norm = normalizePsdFontName(rawFont);
    const inCatalog = CATALOG.some((c) => c.toLowerCase() === norm.toLowerCase());
    console.log(`${indent}• "${(t.text || "").replace(/\r/g, "\\n").slice(0, 40)}"`);
    console.log(`${indent}  font: ${rawFont} → "${norm}" ${inCatalog ? "✓ in catalog" : "✗ NOT in catalog"}`);
    console.log(`${indent}  size: ${st.fontSize}  tracking: ${st.tracking ?? "-"}  leading: ${st.leading ?? "-"}  caps: ${st.fontCaps ?? 0}  bold: ${!!st.fauxBold}  italic: ${!!st.fauxItalic}  underline: ${!!st.underline}`);
    console.log(`${indent}  align: ${t.paragraphStyle?.justification ?? "-"}  styleRuns: ${t.styleRuns?.length ?? 0}  bounds: ${layer.width ?? (layer.right - layer.left)}x${layer.height ?? (layer.bottom - layer.top)}`);
    if (t.styleRuns?.length > 1) {
      let off = 0;
      t.styleRuns.forEach((r, i) => {
        console.log(`${indent}    run${i}: [${off}..${off + r.length}) size=${r.style?.fontSize} font=${r.style?.font?.name} bold=${!!r.style?.fauxBold} tracking=${r.style?.tracking ?? "-"}`);
        off += r.length;
      });
      console.log(`${indent}    text length: ${(t.text || "").length}`);
    }
  }
}
