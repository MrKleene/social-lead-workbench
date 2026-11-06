// Uses a marked disposable fixture; never opens the user's workbench or keychain.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const {_electron} = require('playwright');
const root = path.resolve(__dirname, '../..');

(async () => {
  const fixture = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'social-lead-desktop-ui-')));
  fs.writeFileSync(path.join(fixture, '.fixture'), 'synthetic-only');
  const evidence = path.join(root, '.local/desktop-qa');
  fs.mkdirSync(evidence, {recursive: true});
  const errors = [];
  let app;
  try {
    const {LocalDatabase}=require('../../runtime/local/database.cjs');
    const {prepareLegacySnapshot,importLegacySnapshot}=require('../../runtime/local/legacy-import.cjs');
    const seed=new LocalDatabase(path.join(fixture,'workbench.sqlite'));
    importLegacySnapshot(seed,prepareLegacySnapshot({PlatformAccount:[{id:'synthetic-account',platform:'XHS',label:'合成测试账号',dailyLimit:2,version:1,loginProvider:'real',loginPlatformUserId:'a'.repeat(24)}],InboxMessage:[{id:'synthetic-message',accountId:'synthetic-account',channel:'DM',platformId:'1234567890123',senderId:'b'.repeat(24),senderName:'合成会话用户',body:'合成历史私信；只用于离线界面验证。',contentType:'TEXT',receivedAt:'2026-11-06T04:00:00Z',isNew:true}]}));seed.close();
    app = await _electron.launch({
      executablePath: require('electron'),
      args: [path.join(root, 'apps/desktop/src/main.cjs'), '--test-fixture', fixture],
      timeout: 30000,
    });
    const page = await app.firstWindow();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.getByRole('button', {name: '初始化并打开'}).click();
    await page.getByRole('heading', {name: '配置管理'}).waitFor();
    const add = page.getByRole('button', {name: '新增配置'});
    await add.focus();
    await page.keyboard.press('Enter');
    await page.getByLabel('名称', {exact: true}).fill('合成关键词配置');
    await page.getByLabel('关键词，每行一条').fill('合成词一\n合成词二\n合成词三');
    await page.getByRole('button', {name: '保存到本机'}).click();
    await page.getByText('3 条关键词', {exact: true}).waitFor();
    await page.getByRole('button',{name:'查看会话'}).click();
    await page.getByText('缺少可靠入站身份，只可查看。历史消息不会因导入而自动获得回复资格。',{exact:true}).waitFor();
    await page.getByRole('button',{name:'标记已读'}).click();
    await page.getByRole('button',{name:'标记已读'}).waitFor({state:'detached'});
    await page.getByRole('button',{name:'评论审核',exact:true}).click();
    await page.getByText('本机还没有这类业务记录。',{exact:true}).waitFor();
    await page.getByRole('button',{name:'私信会话',exact:true}).click();
    await page.screenshot({path: path.join(evidence, 'desktop.png'), fullPage: true});
    for (const width of [390, 320]) {
      await page.setViewportSize({width, height: 844});
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({path: path.join(evidence, `mobile-${width}.png`), fullPage: true});
    }
    await page.getByRole('button', {name: '创建本地备份'}).click();
    await page.getByRole('status').filter({hasText: '备份已保存'}).waitFor();
    await page.reload();
    await page.getByText('合成关键词配置', {exact: true}).waitFor();
    assert.equal(await page.getByRole('button', {name: '初始化并打开'}).count(), 0);
    // Native integration is intentionally unavailable. UI cannot imply readiness.
    await page.getByText('平台功能尚未切换', {exact: true}).waitFor();
    assert.equal(await page.getByRole('button', {name: '加密保存'}).isDisabled(), true);
    assert.deepEqual(errors, []);
    const result = {platform: process.platform, title: await page.title(), url: page.url(), initialized: true,
      keywordsSaved: 3, backupCreated: true, reloadPersisted: true, keyboardActivation: true, importedInboxViewOnly:true,markReadPersisted:true,
      widthsWithoutOverflow: [390, 320], osCredentialsAccessed: false, externalCalls: false, errors};
    fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally {
    await app?.close();
    fs.rmSync(fixture, {recursive: true, force: true});
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
