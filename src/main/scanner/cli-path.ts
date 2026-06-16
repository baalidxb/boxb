import { app } from 'electron';
import { join } from 'node:path';

// Phase 9.6 (Day 2): resolve the on-disk path to the standalone scanner CLI
// (out/scanner-cli/index.cjs). This path is baked into each installed git
// hook, so it must point at a file that exists and is runnable by `node`
// outside any Electron/asar context.
//
// Dev:  app.getAppPath() is the project root (where package.json lives), and
//       the CLI sits at <root>/out/scanner-cli/index.cjs.
// Prod: the app is packaged into resources/app.asar, but the CLI is unpacked
//       (see asarUnpack in electron-builder.yml) to
//       resources/app.asar.unpacked/out/scanner-cli/index.cjs. Loading it
//       from inside the asar would fail, hence the unpacked copy.
export function getScannerCliPath(): string {
  if (app.isPackaged) {
    return join(
      process.resourcesPath,
      'app.asar.unpacked',
      'out',
      'scanner-cli',
      'index.cjs'
    );
  }
  return join(app.getAppPath(), 'out', 'scanner-cli', 'index.cjs');
}
