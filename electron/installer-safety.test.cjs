const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('compiled NSIS guard rejects unrelated folders and permits empty folders or registered upgrades', { skip: process.platform !== 'win32' }, (t) => {
  const cache = path.join(process.env.LOCALAPPDATA, 'electron-builder', 'Cache', 'nsis-3.0.4.1');
  const compiler = process.env.NSIS_MAKENSIS || (fs.existsSync(cache)
    ? fs.readdirSync(cache).map((entry) => path.join(cache, entry, 'makensis.exe')).find((entry) => fs.existsSync(entry))
    : null);
  if (!compiler) {
    assert.notEqual(process.env.REHUB_REQUIRE_NSIS_TEST, '1', 'NSIS compiler is required for installer safety verification.');
    return t.skip('NSIS compiler becomes available after the first Windows packaging run.');
  }
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'rehub-installer-safety-'));
  const appName = 'ReHUB for ATK';
  const folder = (name) => path.join(temporary, name, appName);
  const empty = folder('empty');
  const unrelated = folder('unrelated');
  const installed = folder('installed');
  for (const directory of [empty, unrelated, installed]) fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(unrelated, 'family-photo.txt'), 'keep');
  fs.writeFileSync(path.join(installed, `${appName}.exe`), 'app fixture');
  const cases = [
    { directory: folder('new'), known: '', expected: 1 },
    { directory: empty, known: '', expected: 1 },
    { directory: unrelated, known: '', expected: 0 },
    { directory: unrelated, known: unrelated, expected: 0 },
    { directory: installed, known: '', expected: 0 },
    { directory: installed, known: installed, expected: 1 },
    { directory: path.parse(temporary).root, known: path.parse(temporary).root, expected: 0 },
    { directory: os.homedir(), known: os.homedir(), expected: 0 },
    { directory: path.join(temporary, `${appName} backups`), known: '', expected: 0 },
  ];
  const quote = (value) => '"' + value.replaceAll('$', '$$').replaceAll('"', '$\\"') + '"';
  const executable = path.join(temporary, 'guard-test.exe');
  const source = [
    '!include "LogicLib.nsh"', '!include "FileFunc.nsh"',
    `!define APP_FILENAME ${quote(appName)}`,
    `!define APP_EXECUTABLE_FILENAME ${quote(`${appName}.exe`)}`,
    `!include ${quote(path.join(__dirname, 'installer-safety.nsh'))}`,
    `OutFile ${quote(executable)}`, 'RequestExecutionLevel user', 'SilentInstall silent', 'Section',
    ...cases.flatMap(({ directory, known, expected }, index) => [
      `StrCpy $INSTDIR ${quote(directory)}`, `Push ${quote(known)}`,
      'Call RehubInstallDirectoryIsSafe', 'Pop $0',
      `FileOpen $1 ${quote(path.join(temporary, 'result.txt'))} w`, 'FileWrite $1 "$INSTDIR|$0"', 'FileClose $1', `StrCmp $0 "${expected}" +3`,
      `SetErrorLevel ${index + 10}`, 'Quit',
    ]),
    'SetErrorLevel 0', 'SectionEnd',
  ].join('\n');
  try {
    const fixture = path.join(temporary, 'guard-test.nsi');
    fs.writeFileSync(fixture, source);
    const compile = spawnSync(compiler, ['/V2', fixture], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
    assert.equal(compile.status, 0, compile.stdout + compile.stderr);
    const run = spawnSync(executable, ['/S'], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
    assert.equal(run.status, 0, `Guard case failed: ${JSON.stringify(cases[run.status - 10])}; ${run.error || ''}; ${fs.readFileSync(path.join(temporary, 'result.txt'), 'utf8')}`);
    assert.equal(fs.readFileSync(path.join(unrelated, 'family-photo.txt'), 'utf8'), 'keep');
  } finally {
    const relative = path.relative(os.tmpdir(), temporary);
    assert.ok(relative.startsWith('rehub-installer-safety-') && !relative.includes(path.sep));
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
