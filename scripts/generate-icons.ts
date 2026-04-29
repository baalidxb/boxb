import { writeFileSync, readdirSync, unlinkSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as si from 'simple-icons';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const outDir = join(repoRoot, 'src', 'renderer', 'public', 'icons');

interface SiIcon {
  title: string;
  slug: string;
  hex: string;
  path: string;
}

// Hand-drawn substitutes for catalog entries whose brand isn't (or no longer
// is) in simple-icons. Used only when no slug resolves; never silently
// preferred over a real brand icon. Glyphs are generic (a hashtag, a chat
// bubble) on brand-color backgrounds — not copies of trademarked marks.
interface ManualOverride {
  fill: string;
  svg: string;
}
// Look up siWhatsapp at module load so the WhatsApp Business composite can
// reuse the same path data the regular WhatsApp tile uses.
const whatsappPath = (si as unknown as Record<string, SiIcon | undefined>).siWhatsapp?.path ?? '';

const manualOverrides: Record<string, ManualOverride> = {
  slack: {
    fill: '#4A154B',
    svg:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
      '<circle cx="32" cy="32" r="32" fill="#4A154B"/>' +
      '<g stroke="#FFFFFF" stroke-width="5" stroke-linecap="round">' +
      '<line x1="22" y1="20" x2="18" y2="44"/>' +
      '<line x1="46" y1="20" x2="42" y2="44"/>' +
      '<line x1="14" y1="28" x2="48" y2="28"/>' +
      '<line x1="14" y1="38" x2="48" y2="38"/>' +
      '</g></svg>'
  },
  chatgpt: {
    fill: '#10A37F',
    svg:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
      '<circle cx="32" cy="32" r="32" fill="#10A37F"/>' +
      '<path d="M18 22 Q18 16 24 16 L40 16 Q46 16 46 22 L46 34 Q46 40 40 40 L28 40 L22 46 L22 40 Q18 40 18 34 Z" fill="#FFFFFF"/>' +
      '<circle cx="26" cy="28" r="2" fill="#10A37F"/>' +
      '<circle cx="32" cy="28" r="2" fill="#10A37F"/>' +
      '<circle cx="38" cy="28" r="2" fill="#10A37F"/>' +
      '</svg>'
  },
  'whatsapp-business': {
    fill: '#25D366',
    svg:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
      '<circle cx="32" cy="32" r="32" fill="#25D366"/>' +
      '<g transform="translate(14,14) scale(1.5)" fill="#FFFFFF">' +
      `<path d="${whatsappPath}"/>` +
      '</g>' +
      '<circle cx="50" cy="50" r="11" fill="#0F0F0F" stroke="#FFFFFF" stroke-width="1.5"/>' +
      '<text x="50" y="55" text-anchor="middle" font-family="-apple-system, Segoe UI, sans-serif" font-size="14" font-weight="700" fill="#FFFFFF">B</text>' +
      '</svg>'
  }
};

// Slug fallback chain per catalog id. First slug that resolves wins.
const slugMap: Array<{ id: string; slugs: string[] }> = [
  { id: 'whatsapp-web',      slugs: ['whatsapp'] },
  { id: 'whatsapp-business', slugs: ['whatsapp'] },
  { id: 'telegram-web',      slugs: ['telegram'] },
  { id: 'messenger',         slugs: ['messenger'] },
  { id: 'gmail',             slugs: ['gmail'] },
  { id: 'google-docs',       slugs: ['googledocs'] },
  { id: 'google-sheets',     slugs: ['googlesheets'] },
  { id: 'google-drive',      slugs: ['googledrive'] },
  { id: 'notion',            slugs: ['notion'] },
  { id: 'trello',            slugs: ['trello'] },
  { id: 'google-keep',       slugs: ['googlekeep'] },
  { id: 'slack',             slugs: ['slack'] },
  { id: 'discord',           slugs: ['discord'] },
  { id: 'chatgpt',           slugs: ['chatgpt', 'openai'] },
  { id: 'claude',            slugs: ['claude', 'anthropic'] },
  { id: 'gemini',            slugs: ['googlegemini'] },
  { id: 'perplexity',        slugs: ['perplexity'] }
];

function exportNameForSlug(slug: string): string {
  return 'si' + slug.charAt(0).toUpperCase() + slug.slice(1);
}

function lookup(slug: string): SiIcon | null {
  const key = exportNameForSlug(slug);
  const icon = (si as unknown as Record<string, SiIcon | undefined>)[key];
  if (!icon || !icon.path || !icon.hex) return null;
  return icon;
}

// Perceived-luminance threshold. Brand hexes below this read as "too dark for
// our dark sidebar"; we invert their treatment so the circle stays visible.
function isDarkColor(hex: string): boolean {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b < 60;
}

function makeWrappedSvg(hex: string, path: string): string {
  let circleFill: string;
  let glyphFill: string;
  if (isDarkColor(hex)) {
    // Inverted treatment: white circle, brand-color glyph. For pure black we
    // bump the glyph to #0F0F0F so it doesn't render as identical-to-bg.
    circleFill = '#FFFFFF';
    glyphFill = hex.replace('#', '').toLowerCase() === '000000' ? '#0F0F0F' : `#${hex}`;
  } else {
    circleFill = `#${hex}`;
    glyphFill = '#FFFFFF';
  }
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
    `<circle cx="32" cy="32" r="32" fill="${circleFill}"/>` +
    `<g transform="translate(14,14) scale(1.5)" fill="${glyphFill}">` +
    `<path d="${path}"/>` +
    '</g></svg>'
  );
}

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

// Wipe the dir so leftover Phase 3 monograms don't shadow missing-slug entries.
for (const f of readdirSync(outDir)) {
  if (f.endsWith('.svg')) unlinkSync(join(outDir, f));
}

const generated: Array<{ id: string; source: string; hex: string }> = [];
const missing: Array<{ id: string; tried: string[] }> = [];

for (const entry of slugMap) {
  // Manual override takes precedence over a simple-icons match — needed so the
  // whatsapp-business composite (WhatsApp glyph + "B" badge) wins over the
  // plain `whatsapp` slug lookup it shares with whatsapp-web.
  const override = manualOverrides[entry.id];
  if (override) {
    writeFileSync(join(outDir, `${entry.id}.svg`), override.svg, 'utf8');
    generated.push({ id: entry.id, source: 'manual-override', hex: override.fill.replace('#', '') });
    continue;
  }
  let resolved: SiIcon | null = null;
  for (const slug of entry.slugs) {
    resolved = lookup(slug);
    if (resolved) break;
  }
  if (resolved) {
    const svg = makeWrappedSvg(resolved.hex, resolved.path);
    writeFileSync(join(outDir, `${entry.id}.svg`), svg, 'utf8');
    generated.push({ id: entry.id, source: resolved.slug, hex: resolved.hex });
    continue;
  }
  missing.push({ id: entry.id, tried: entry.slugs });
}

console.log(`[generate-icons] wrote ${generated.length}/${slugMap.length} icons`);
for (const g of generated) {
  console.log(`  ${g.id} <- ${g.source} (#${g.hex})`);
}
if (missing.length > 0) {
  console.log(`[generate-icons] no icon for ${missing.length} entries (renderer falls back to monogram):`);
  for (const m of missing) {
    console.log(`  ${m.id} (tried: ${m.tried.join(', ')})`);
  }
  process.exitCode = 1;
}
