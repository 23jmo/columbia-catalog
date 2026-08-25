import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const assetsDirectory = path.dirname(fileURLToPath(import.meta.url));
const extensionDirectory = path.dirname(assetsDirectory);
const iconsDirectory = path.join(extensionDirectory, "icons");

await mkdir(iconsDirectory, { recursive: true });

function iconSvg(size) {
  const inset = size * 0.125;
  const tile = size - inset * 2;
  const radius = size * 0.18;
  const barWidth = size * 0.105;
  const gap = size * 0.075;
  const startX = size / 2 - (barWidth * 3 + gap * 2) / 2;
  const baseline = size - inset - size * 0.18;
  const heights = [size * 0.25, size * 0.43, size * 0.34];
  const bars = heights
    .map(
      (height, index) =>
        `<rect x="${startX + index * (barWidth + gap)}" y="${baseline - height}" width="${barWidth}" height="${height}" rx="${barWidth / 2}" fill="white"/>`,
    )
    .join("");
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg"><rect x="${inset}" y="${inset}" width="${tile}" height="${tile}" rx="${radius}" fill="#1D4ED8"/>${bars}</svg>`;
}

for (const size of [16, 32, 48, 128]) {
  await sharp(Buffer.from(iconSvg(size)))
    .png()
    .toFile(path.join(iconsDirectory, `icon-${size}.png`));
}

const promoSvg = `
<svg width="440" height="280" viewBox="0 0 440 280" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#173AA8"/><stop offset="1" stop-color="#3374EE"/></linearGradient>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="12" stdDeviation="14" flood-opacity=".2"/></filter>
  </defs>
  <rect width="440" height="280" rx="18" fill="url(#bg)"/>
  <circle cx="382" cy="-14" r="116" fill="#93B5FF" opacity=".17"/>
  <circle cx="32" cy="276" r="92" fill="#0B1E68" opacity=".22"/>
  <g transform="translate(56 54)" filter="url(#shadow)">
    <rect width="96" height="96" rx="24" fill="white" opacity=".98"/>
    <rect x="27" y="47" width="10" height="25" rx="5" fill="#1D4ED8"/>
    <rect x="43" y="29" width="10" height="43" rx="5" fill="#1D4ED8"/>
    <rect x="59" y="38" width="10" height="34" rx="5" fill="#1D4ED8"/>
  </g>
  <g transform="translate(176 50)" filter="url(#shadow)">
    <rect width="214" height="180" rx="22" fill="white"/>
    <rect x="22" y="22" width="78" height="9" rx="4.5" fill="#DDE7FF"/>
    <rect x="22" y="44" width="168" height="24" rx="10" fill="#F3F6FC"/>
    <rect x="22" y="80" width="48" height="56" rx="11" fill="#EEF3FF"/>
    <rect x="82" y="80" width="48" height="56" rx="11" fill="#EEF3FF"/>
    <rect x="142" y="80" width="48" height="56" rx="11" fill="#EEF3FF"/>
    <rect x="22" y="151" width="168" height="10" rx="5" fill="#1D4ED8"/>
  </g>
</svg>`;

await sharp(Buffer.from(promoSvg)).png().toFile(path.join(assetsDirectory, "promo-440x280.png"));

const popupPath = path.join(assetsDirectory, "popup-final.png");
const popupCrop = await sharp(popupPath)
  .extract({ left: 0, top: 0, width: 850, height: 1050 })
  .resize({ width: 566, height: 700, fit: "contain", background: "#f7f8fb" })
  .png()
  .toBuffer();

const screenshotBackdrop = `
<svg width="1280" height="800" viewBox="0 0 1280 800" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="shotbg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#EEF3FF"/><stop offset="1" stop-color="#F9FAFD"/></linearGradient></defs>
  <rect width="1280" height="800" fill="url(#shotbg)"/>
  <circle cx="120" cy="760" r="230" fill="#DCE7FF" opacity=".55"/>
  <circle cx="1180" cy="20" r="220" fill="#C9DAFF" opacity=".4"/>
  <g transform="translate(72 98)">
    <rect width="64" height="64" rx="16" fill="#1D4ED8"/>
    <rect x="18" y="31" width="7" height="17" rx="3.5" fill="white"/>
    <rect x="29" y="20" width="7" height="28" rx="3.5" fill="white"/>
    <rect x="40" y="26" width="7" height="22" rx="3.5" fill="white"/>
    <text x="0" y="122" fill="#1D4ED8" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="800" letter-spacing="2">COLUMBIA CATALOG</text>
    <text x="0" y="186" fill="#172033" font-family="Inter, Arial, sans-serif" font-size="52" font-weight="800" letter-spacing="-2">Refresh every course.</text>
    <text x="0" y="231" fill="#657087" font-family="Inter, Arial, sans-serif" font-size="25">Every Fall 2026 course checked in Vergil.</text>
    <g fill="#334056" font-family="Inter, Arial, sans-serif" font-size="22">
      <circle cx="9" cy="306" r="9" fill="#1D4ED8"/><text x="35" y="314">Times and locations, with observation time</text>
      <circle cx="9" cy="359" r="9" fill="#1D4ED8"/><text x="35" y="367">52 visible result pages, verified end to end</text>
      <circle cx="9" cy="412" r="9" fill="#1D4ED8"/><text x="35" y="420">No credentials or registration data</text>
    </g>
    <rect x="0" y="475" width="480" height="1" fill="#CBD5E6"/>
    <text x="0" y="522" fill="#657087" font-family="Inter, Arial, sans-serif" font-size="19">Sharing stays off until the student enables it.</text>
  </g>
</svg>`;

await sharp(Buffer.from(screenshotBackdrop))
  .composite([{ input: popupCrop, left: 690, top: 50 }])
  .png()
  .toFile(path.join(assetsDirectory, "screenshot-1280x800.png"));
