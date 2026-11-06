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
    importLegacySnapshot(seed,prepareLegacySnapshot({PlatformAccount:[{id:'synthetic-account',platform:'XHS',label:'合成测试账号',dailyLimit:2,version:1,loginProvider:'real',loginPlatformUserId:'a'.repeat(24)}],InboxMessage:[{id:'synthetic-message',accountId:'synthetic-account',channel:'DM',platformId:'1234567890123',senderId:'b'.repeat(24),senderName:'合成会话用户',body:'合成历史私信；只用于离线界面验证。',contentType:'TEXT',receivedAt:'2026-11-06T04:00:00Z',isNew:true}]}));seed.db.exec(`INSERT INTO review_policies VALUES('synthetic-policy','合成自动规则目标','寻找明确提出学习方法指导需求的评论',1,1,1,1); INSERT INTO model_profile VALUES('qwen','qwen3.8-flash',1,1,10,'qwen3.8-flash:beijing-2026-10-21','beijing-original-comments-v2');`);seed.close();
    app = await _electron.launch({
      executablePath: require('electron'),
      args: [path.join(root, 'apps/desktop/src/main.cjs'), '--test-fixture', fixture],
      timeout: 30000,
    });
    let page = await app.firstWindow();
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
    for(const name of ['合成规则一','合成规则二']){
      await page.getByRole('button',{name:'新增联系规则',exact:true}).click();
      await page.getByLabel('规则名称',{exact:true}).fill(name);
      await page.getByLabel('规则匹配目标',{exact:true}).selectOption('synthetic-policy');
      await page.getByLabel('规则发送账号',{exact:true}).selectOption('synthetic-account');
      await page.getByLabel('发送内容',{exact:true}).fill('合成规则内容，不会发送');
      await page.getByRole('button',{name:'保存规则草稿'}).click();
      await page.getByText(name+' · 停用',{exact:true}).waitFor();
    }
    await page.getByRole('button',{name:'预览规则授权'}).first().click();
    await page.getByRole('heading',{name:'核对自动联系授权'}).waitFor();
    assert.equal(await page.getByRole('button',{name:'确认并启用规则'}).isDisabled(),true);
    await page.getByRole('button',{name:'重新核对恢复状态'}).click();
    await page.getByLabel('已停止原工作台任务，核对副本和历史限制。仅解除副本核对暂停；新账号登录和新任务另行授权。').check();
    await page.getByRole('button',{name:'允许重新授权新任务'}).click();
    await page.getByRole('status').filter({hasText:'已解除副本核对暂停'}).waitFor();
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
    await page.locator('.local-config-list strong').getByText('合成关键词配置', {exact: true}).waitFor();
    assert.equal(await page.getByRole('button', {name: '初始化并打开'}).count(), 0);
    // Native integration is intentionally unavailable. UI cannot imply readiness.
    await page.getByText('平台功能尚未切换', {exact: true}).waitFor();
    assert.equal(await page.getByRole('button', {name: '加密保存'}).isDisabled(), true);
    const exported=path.join(fixture,'synthetic-export.json');
    fs.writeFileSync(exported,JSON.stringify({CollectionConfig:[{id:'new-config',name:'合成迁移关键词',keywords:['迁移一','迁移二'],excludeWords:[]}],CommentReviewPolicy:[{id:'p-one',name:'合成匹配一',target:'寻找明确提出学习方法指导需求的评论'},{id:'p-two',name:'合成匹配二',target:'寻找明确提出选题方法指导需求的评论'}],CapturedPost:[{id:'archived-post',title:'合成历史笔记'}]}));
    await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},exported);
    await page.getByRole('button',{name:'选择旧业务导出文件'}).click();
    await page.getByRole('heading',{name:'切换前核对'}).waitFor();
    assert.equal(await page.getByRole('button',{name:'备份当前数据并切换'}).isDisabled(),true);
    await page.getByLabel('我已核对副本，确认切换当前业务数据。').check();
    await page.getByRole('button',{name:'备份当前数据并切换'}).click();
    await page.locator('.local-config-list strong').getByText('合成迁移关键词',{exact:true}).waitFor();
    assert.equal(await page.getByText('合成关键词配置',{exact:true}).count(),0);
    await page.getByLabel('历史记录类型').selectOption('CapturedPost');
    await page.locator('.local-archive').getByText(/合成历史笔记/).waitFor();
    await app.close();app=await _electron.launch({executablePath:require('electron'),args:[path.join(root,'apps/desktop/src/main.cjs'),'--test-fixture',fixture],timeout:30000});page=await app.firstWindow();await page.locator('.local-config-list strong').getByText('合成迁移关键词',{exact:true}).waitFor();
    assert.equal(await page.getByText('合成匹配一',{exact:true}).count(),2);
    assert.equal(await page.getByText('合成匹配二',{exact:true}).count(),2);
    assert.ok(fs.existsSync(path.join(fixture,'workbench.sqlite')));
    await page.screenshot({path:path.join(evidence,'migration.png'),fullPage:true});
    assert.deepEqual(errors, []);
    const result = {platform: process.platform, title: await page.title(), url: page.url(), initialized: true,
      multipleAutomationDrafts:2,unregisteredAutomationDisabled:true,reviewedCopyRecovery:true,keywordsSaved: 3, backupCreated: true, reloadPersisted: true, keyboardActivation: true, importedInboxViewOnly:true,markReadPersisted:true,
      widthsWithoutOverflow: [390, 320],migrationPreviewAndActivation:true,oldDatabaseRetained:true,multipleMatchingTargets:2,activatedCopySurvivesRestart:true, osCredentialsAccessed: false, externalCalls: false, errors};
    fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } catch(error) {
    if(app){const page=await app.firstWindow();fs.writeFileSync(path.join(evidence,'ui-failure.txt'),await page.locator('body').innerText());await page.screenshot({path:path.join(evidence,'ui-failure.png'),fullPage:true});}
    throw error;
  } finally {
    await app?.close();
    fs.rmSync(fixture, {recursive: true, force: true});
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
