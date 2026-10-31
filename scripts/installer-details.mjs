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
  const templates = path.join(path.dirname(require.resolve('app-builder-lib/package.json')), 'templates/nsis');
  for (const [name, transform] of [['installSection.nsh', enableDetails], ['uninstaller.nsh', enableDataChoice]]) {
    const template = path.join(templates, name);
    const source = fs.readFileSync(template, 'utf8');
    const updated = transform(source);
    if (updated !== source) fs.writeFileSync(template, updated);
  }
}

export function enableDataChoice(source) {
  const original = '  StrCpy $isDeleteAppData "0"';
  const replacement = '  StrCpy $isDeleteAppData $rehubRemoveData ; ReHUB uninstall choice';
  if (source.includes(replacement)) return source;
  if (source.split(original).length !== 2) {
    throw new Error('electron-builder uninstall template changed; review data removal choice.');
  }
  return source.replace(original, replacement);
}
