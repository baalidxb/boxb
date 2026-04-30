import sharp from 'sharp';
import { mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'resources');

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

// Mirrors Logo.tsx geometry on a 1024-canvas. The hex sits on a solid black
// square so the installer thumbnail and Action Center toast icon don't bleed
// against light Windows surfaces.
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="#000000"/>
  <polygon points="512,256 742,396 742,664 512,804 282,664 282,396" fill="#D4AF37"/>
  <rect x="282" y="460" width="460" height="44" fill="#000000"/>
  <rect x="282" y="588" width="460" height="44" fill="#000000"/>
</svg>`;

await sharp(Buffer.from(SVG)).resize(1024, 1024).png().toFile(join(outDir, 'icon.png'));
console.log('[app-icons] wrote resources/icon.png (1024x1024)');
