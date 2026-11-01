// Reuse the synthetic automation fixture; never connect to the production API.
process.env.SETTINGS_TOGGLE_FOCUS='1';
await import('./test-automation-settings-ui.mjs');
