import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

// electron-builder disables details inside its install section, after NSIS UI hooks.
// Keep its extraction/retry/uninstaller logic intact; fail if its template changes.
export function enableDetails(source) {
  const hidden = '  SetDetailsPrint none';
  const enabled = '  SetDetailsPrint both ; ReHUB installation details';
  if (source.includes(enabled)) return source;
  if (source.split(hidden).length !== 2) {
    throw new Error('electron-builder NSIS template changed; review installer details logging.');
  }
  return source.replace(hidden, enabled);
}

export default async function () {
  const template = path.join(path.dirname(require.resolve('app-builder-lib/package.json')),
    'templates/nsis/installSection.nsh');
  const source = fs.readFileSync(template, 'utf8');
  const updated = enableDetails(source);
  if (updated !== source) fs.writeFileSync(template, updated);
}
