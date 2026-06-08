/**
 * Génère l’icône iOS SPLove (master 1024 + déclinaisons) à partir du SVG master.
 * Normalise le logo vers ~91 % du canvas (+30 % vs passe précédente à 70 %).
 *
 * Usage: node scripts/generate-ios-app-icon.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const MASTER_SVG = path.join(ROOT, "resources/app-icon/ios-app-icon-master.svg");
const LEGACY_PNG = path.join(
  ROOT,
  "ios/App/App/Assets.xcassets/AppIcon.appiconset/109D1075-6308-4D06-B119-3382B3F77933.png",
);
const OUT_DIR = path.join(ROOT, "ios/App/App/Assets.xcassets/AppIcon.appiconset");
const MASTER_PNG = path.join(OUT_DIR, "AppIcon-1024.png");

const CANVAS = 1024;
/** ~91 % : présence type ChatGPT / Gemini (cœur + orbite, marges minimales). */
const TARGET_FILL = 0.91;
const BG = { r: 11, g: 11, b: 15, alpha: 1 };

const IOS_SIZES = [
  { name: "Icon-20@2x", size: 40, idiom: "iphone", scale: "2x", sizePt: "20x20" },
  { name: "Icon-20@3x", size: 60, idiom: "iphone", scale: "3x", sizePt: "20x20" },
  { name: "Icon-29@2x", size: 58, idiom: "iphone", scale: "2x", sizePt: "29x29" },
  { name: "Icon-29@3x", size: 87, idiom: "iphone", scale: "3x", sizePt: "29x29" },
  { name: "Icon-40@2x", size: 80, idiom: "iphone", scale: "2x", sizePt: "40x40" },
  { name: "Icon-40@3x", size: 120, idiom: "iphone", scale: "3x", sizePt: "40x40" },
  { name: "Icon-60@2x", size: 120, idiom: "iphone", scale: "2x", sizePt: "60x60" },
  { name: "Icon-60@3x", size: 180, idiom: "iphone", scale: "3x", sizePt: "60x60" },
  { name: "Icon-20", size: 20, idiom: "ipad", scale: "1x", sizePt: "20x20" },
  { name: "Icon-20@2x-ipad", size: 40, idiom: "ipad", scale: "2x", sizePt: "20x20" },
  { name: "Icon-29", size: 29, idiom: "ipad", scale: "1x", sizePt: "29x29" },
  { name: "Icon-29@2x-ipad", size: 58, idiom: "ipad", scale: "2x", sizePt: "29x29" },
  { name: "Icon-40", size: 40, idiom: "ipad", scale: "1x", sizePt: "40x40" },
  { name: "Icon-40@2x-ipad", size: 80, idiom: "ipad", scale: "2x", sizePt: "40x40" },
  { name: "Icon-76", size: 76, idiom: "ipad", scale: "1x", sizePt: "76x76" },
  { name: "Icon-76@2x", size: 152, idiom: "ipad", scale: "2x", sizePt: "76x76" },
  { name: "Icon-83.5@2x", size: 167, idiom: "ipad", scale: "2x", sizePt: "83.5x83.5" },
];

function isBackgroundPixel(r, g, b, a) {
  if (a < 8) return true;
  return r < 40 && g < 40 && b < 48;
}

async function detectLogoBounds(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (!isBackgroundPixel(r, g, b, a)) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX) throw new Error("Aucun pixel logo détecté");
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

async function logoFillRatio(bufferOrPath) {
  const bounds = await detectLogoBounds(bufferOrPath);
  return Math.max(bounds.width, bounds.height) / CANVAS;
}

async function renderFromSvg() {
  const svg = fs.readFileSync(MASTER_SVG);
  return sharp(svg).resize(CANVAS, CANVAS).png().toBuffer();
}

async function composeToTargetFill(sourceBuffer, fill = TARGET_FILL) {
  const bounds = await detectLogoBounds(sourceBuffer);
  const targetLogoPx = Math.round(CANVAS * fill);
  const logoMax = Math.max(bounds.width, bounds.height);
  const scale = targetLogoPx / logoMax;

  const resizedLogo = await sharp(sourceBuffer)
    .extract(bounds)
    .resize(Math.round(bounds.width * scale), Math.round(bounds.height * scale), {
      fit: "inside",
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer();

  const meta = await sharp(resizedLogo).metadata();
  const left = Math.round((CANVAS - meta.width) / 2);
  const top = Math.round((CANVAS - meta.height) / 2);

  return sharp({
    create: { width: CANVAS, height: CANVAS, channels: 4, background: BG },
  })
    .composite([{ input: resizedLogo, left, top }])
    .png()
    .toBuffer();
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  let masterBuffer = await renderFromSvg();
  let fill = await logoFillRatio(masterBuffer);
  console.log(`[app-icon] SVG rendu — remplissage ${(fill * 100).toFixed(1)} %`);

  if (fill < 0.65) {
    const legacyPath = fs.existsSync(LEGACY_PNG) ? LEGACY_PNG : MASTER_PNG;
    if (fs.existsSync(legacyPath)) {
      console.log(`[app-icon] Affinage: agrandissement vers ~${TARGET_FILL * 100} % depuis PNG existant`);
      masterBuffer = await composeToTargetFill(legacyPath, TARGET_FILL);
      fill = await logoFillRatio(masterBuffer);
    }
  } else if (fill < TARGET_FILL - 0.02 || fill > TARGET_FILL + 0.06) {
    console.log(`[app-icon] Normalisation remplissage → ${TARGET_FILL * 100} %`);
    masterBuffer = await composeToTargetFill(masterBuffer, TARGET_FILL);
    fill = await logoFillRatio(masterBuffer);
  }

  await sharp(masterBuffer).png().toFile(MASTER_PNG);
  console.log(`[app-icon] Master: ${MASTER_PNG} (${(fill * 100).toFixed(1)} % fill)`);

  const images = [
    {
      filename: "AppIcon-1024.png",
      idiom: "universal",
      platform: "ios",
      size: "1024x1024",
    },
    {
      filename: "AppIcon-1024.png",
      idiom: "ios-marketing",
      scale: "1x",
      size: "1024x1024",
    },
  ];

  for (const spec of IOS_SIZES) {
    const filename = `${spec.name}.png`;
    await sharp(MASTER_PNG)
      .resize(spec.size, spec.size, { kernel: sharp.kernel.lanczos3 })
      .png()
      .toFile(path.join(OUT_DIR, filename));
    images.push({
      filename,
      idiom: spec.idiom,
      scale: spec.scale,
      size: spec.sizePt,
    });
    console.log(`[app-icon] ${filename} (${spec.size}px)`);
  }

  fs.writeFileSync(path.join(OUT_DIR, "Contents.json"), `${JSON.stringify({ images, info: { author: "xcode", version: 1 } }, null, 2)}\n`);

  const oldUuid = path.join(OUT_DIR, "109D1075-6308-4D06-B119-3382B3F77933.png");
  if (fs.existsSync(oldUuid)) {
    fs.unlinkSync(oldUuid);
    console.log("[app-icon] Ancien PNG UUID supprimé");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
