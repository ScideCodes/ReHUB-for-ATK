const { test } = require('node:test');
const assert = require('node:assert/strict');

test('enables logging before extraction without changing installation logic', async () => {
  const { enableDetails } = await import('../scripts/installer-details.mjs');
  const source = 'InitPluginsDir\n  SetDetailsPrint none\n!insertmacro installApplicationFiles\n';
  const result = enableDetails(source);
  assert.equal(result, 'InitPluginsDir\n  SetDetailsPrint both ; ReHUB installation details\n!insertmacro installApplicationFiles\n');
  assert.equal(enableDetails(result), result);
  assert.throws(() => enableDetails('changed upstream template'), /template changed/);
  assert.throws(() => enableDetails(source + source), /template changed/);
});
