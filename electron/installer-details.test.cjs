const { test } = require('node:test');
const assert = require('node:assert/strict');

test('enables logging before extraction without changing installation logic', async () => {
  const { enableDetails } = await import('../scripts/installer-details.mjs');
  const source = 'InitPluginsDir\n  SetDetailsPrint none\n!insertmacro installApplicationFiles\n';
  const result = enableDetails(source);
  assert.equal(result, 'InitPluginsDir\n!insertmacro rehubValidateInstallDir ; Validate before any old-version removal\n  SetDetailsPrint both ; ReHUB installation details\n!insertmacro installApplicationFiles\n');
  assert.equal(enableDetails(result), result);
  assert.throws(() => enableDetails('changed upstream template'), /template changed/);
  assert.throws(() => enableDetails(source + source), /template changed/);
});

test('uses the explicit data-removal choice while retaining upstream flag handling', async () => {
  const { enableDataChoice } = await import('../scripts/installer-details.mjs');
  const source = '  StrCpy $isDeleteAppData "0"\n  ${GetOptions} $R0 "--delete-app-data" $R1\n';
  const result = enableDataChoice(source);
  assert.equal(result, '  StrCpy $isDeleteAppData $rehubRemoveData ; ReHUB uninstall choice\n  ${GetOptions} $R0 "--delete-app-data" $R1\n');
  assert.equal(enableDataChoice(result), result);
  assert.throws(() => enableDataChoice('changed upstream template'), /template changed/);
  assert.throws(() => enableDataChoice(source + source), /template changed/);
});
