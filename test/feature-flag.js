const test = require('ava');
const path = require('path');

test('ENABLE_FLOATING_MODE feature flag disables floating mode', async t => {
  // This test verifies that when ENABLE_FLOATING_MODE is false,
  // the floating preference always returns 0 (disabled)
  
  // Load the preference module in isolation
  delete require.cache[require.resolve('../src/prf.js')];
  global.D = { db: { getItem: () => '1', setItem: () => {}, removeItem: () => {} } };
  global.nodeRequire = undefined; // Use mock localStorage
  
  require('../src/prf.js');
  
  // Verify feature flag is set to false
  t.is(D.ENABLE_FLOATING_MODE, false, 'Feature flag should be false');
  
  // Test that floating preference returns 0 even if stored value is 1
  const floatingValue = D.prf.floating();
  t.is(floatingValue, 0, 'Floating preference should return 0 when feature flag is disabled');
  
  // Test that setting floating preference is allowed but getting still returns 0
  D.prf.floating(1);
  const afterSet = D.prf.floating();
  t.is(afterSet, 0, 'Floating preference should still return 0 after setting when feature flag is disabled');
});

test('ENABLE_FLOATING_MODE feature flag can be enabled', async t => {
  // This test verifies that the feature flag can be toggled for testing
  
  delete require.cache[require.resolve('../src/prf.js')];
  global.D = { db: { getItem: () => '1', setItem: () => {}, removeItem: () => {} } };
  
  // Temporarily enable the feature flag
  require('../src/prf.js');
  D.ENABLE_FLOATING_MODE = true;
  
  // Re-setup the floating preference override
  const originalFloating = D.prf.floating;
  D.prf.floating = function(x, s) {
    if (x === undefined && !D.ENABLE_FLOATING_MODE) {
      return 0;
    }
    return originalFloating.call(this, x, s);
  };
  
  // Test that floating preference now returns the stored value
  const floatingValue = D.prf.floating();
  t.is(floatingValue, 1, 'Floating preference should return stored value when feature flag is enabled');
});