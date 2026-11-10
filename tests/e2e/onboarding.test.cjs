// First-run failure/retry and theme checks use isolated data and no external executors.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const assert = require('node:assert/strict');
const { _electron } = require('playwright');
const { LocalDatabase } = require('@crm/local-runtime/database');
const root = path.resolve(__dirname, '../..');
(async () => {
  const fixture = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'social-lead-desktop-ui-onboarding-')));
  fs.writeFileSync(path.join(fixture, '.fixture'), 'synthetic-only');
  const evidence = path.join(root, '.local/desktop-qa');
  fs.mkdirSync(evidence, { recursive: true });
  const seed = new LocalDatabase(path.join(fixture, 'workbench.sqlite'));
  seed.db.exec("CREATE TRIGGER fail_initialization BEFORE INSERT ON settings WHEN NEW.key='initialized' BEGIN SELECT RAISE(ABORT,'SYNTHETIC_INITIALIZE_FAILURE'); END;");
  seed.close();
  let app;
  const errors = [];
  const launch = () => _electron.launch({ executablePath: require('electron'), args: [path.join(root, 'apps/desktop/src/main.cjs'), '--test-fixture', fixture] });
  try {
    app = await launch();
    let page = await app.firstWindow();
    page.on('pageerror', e => errors.push(e.message));
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.getByRole('heading', { name: '欢迎使用线索工作台' }).waitFor();
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
    await page.screenshot({ path: path.join(evidence, 'welcome-dark.png'), fullPage: true, animations: 'disabled' });
    await page.keyboard.press('Tab');
    assert.equal(await page.getByRole('button', { name: '连接账号', exact: true }).evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Tab');
    assert.equal(await page.getByRole('button', { name: '先进入工作台', exact: true }).evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Enter');
    await page.getByRole('alert').waitFor();
    await page.getByRole('heading', { name: '欢迎使用线索工作台' }).waitFor();
    await page.screenshot({ path: path.join(evidence, 'welcome-retry.png'), fullPage: true });
    const database = new LocalDatabase(path.join(fixture, 'workbench.sqlite'));
    assert.equal(database.db.prepare("SELECT COUNT(*) AS n FROM settings WHERE key='initialized'").get().n, 0);
    database.db.exec('DROP TRIGGER fail_initialization');
    database.close();
    await page.emulateMedia({ colorScheme: 'light' });
    await page.getByRole('button', { name: '先进入工作台', exact: true }).click();
    await page.getByRole('navigation', { name: '主导航', exact: true }).waitFor();
    assert.ok(page.url().endsWith('/work'));
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    page.on('pageerror', e => errors.push(e.message));
    await page.getByRole('navigation', { name: '主导航', exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { name: '欢迎使用线索工作台' }).count(), 0);
    assert.deepEqual(errors, []);
    const result = { initializedOnlyAfterSuccess: true, retry: true, skipToWorkbench: true, restartSkipsWelcome: true, darkTheme: true, keyboardNavigation: true, externalCalls: false, errors };
    fs.writeFileSync(path.join(evidence, 'onboarding-result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally {
    await app?.close();
    fs.rmSync(fixture, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
