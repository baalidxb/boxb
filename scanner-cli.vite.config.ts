import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Phase 9.6: dedicated build for the standalone secret-scanner CLI.
//
// electron-vite's config model only emits three targets (main/preload/
// renderer), and the main bundle must stay ESM for Electron 33. The git
// hook, however, wants a self-contained CommonJS binary in its own folder
// (out/scanner-cli/index.cjs). So the CLI gets its own plain-Vite SSR build,
// chained after `electron-vite build` in the npm "build" script.
//
// `ssr` targets Node: built-ins stay external, our engine + patterns get
// inlined. @shared is type-only at runtime (erased), but the alias is kept
// so the build resolves cleanly.
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('src/shared')
    }
  },
  build: {
    outDir: 'out/scanner-cli',
    emptyOutDir: true,
    ssr: resolve('src/scanner-cli/index.ts'),
    rollupOptions: {
      output: {
        format: 'cjs',
        entryFileNames: 'index.cjs',
        inlineDynamicImports: true
      }
    }
  }
});
