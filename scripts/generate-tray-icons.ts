import sharp from 'sharp';
import { mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'resources', 'tray');

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

// Mirrors the geometry in src/renderer/components/Logo.tsx exactly.
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
  <polygon points="80,40 116,62 116,104 80,126 44,104 44,62" fill="#D4AF37"/>
  <rect x="44" y="72" width="72" height="7" fill="#000000"/>
  <rect x="44" y="92" width="72" height="7" fill="#000000"/>
</svg>`;

const targets: Array<{ name: string; size: number }> = [
  { name: 'tray-16.png', size: 16 },
  { name: 'tray-32.png', size: 32 },
  { name: 'tray-32@2x.png', size: 64 }
];

for (const t of targets) {
  await sharp(Buffer.from(SVG))
    .resize(t.size, t.size)
    .png()
    .toFile(join(outDir, t.name));
  console.log(`[tray-icons] wrote ${t.name} (${t.size}x${t.size})`);
}
