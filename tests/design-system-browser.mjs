// Shared TradingView component contracts on every application route, in Chrome Beta.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.TIBINANCE_NODE_MODULES ? `${process.env.TIBINANCE_NODE_MODULES}/playwright` : 'playwright');
const root=process.env.TIBINANCE_TEST_URL??'http://127.0.0.1:8880';
const shots=process.env.TIBINANCE_SCREENSHOTS;
if(shots)await mkdir(shots,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.TIBINANCE_CHROME??'/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta'});
const routes=['index.html','trade.html','markets.html','economy.html','markets-overview.html','economy-overview.html','reports/tc-cycle/','reports/tc-cycle/pt-br.html'];
try {
  for(const route of routes){
    const context=await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'light'});
    await context.route('**/api.tibiadata.com/**',r=>r.fulfill({json:r.request().url().includes('/news/')?{news:[{id:1,date:'2026-10-15',news:'Market update',category:'development',type:'news',url:'https://www.tibia.com/'}]}:{worlds:{players_online:100,regular_worlds:[{name:'Antica',players_online:50},{name:'Secura',players_online:50}]}}}));
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`${root}/${route}`);
    await page.waitForFunction(()=>!document.querySelector('[aria-busy="true"]'));
    if(route==='index.html')await page.waitForFunction(()=>document.getElementById('capturesLoading').hidden);
    if(route.startsWith('reports'))await page.waitForSelector('#site-world .site-control');
    for(const theme of ['light','dark']){
      await page.evaluate(t=>window.tvTheme.set(t),theme);
      for(const width of [1440,768,390,320]){
        await page.setViewportSize({width,height:1000});
        await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${route}/${theme}/${width}: overflow`);
        const heading=page.locator('.tv-page .tv-hero h1,.tv-page .hero h1').first();
        if(await heading.count())assert.equal(await heading.evaluate(e=>getComputedStyle(e).fontSize),width<768?'32px':'48px',`${route}/${width}: sourced heading tier`);
        if(shots&&[1440,390].includes(width))await page.screenshot({path:`${shots}/${route.replaceAll('/','_')}-${theme}-${width}.png`});
      }
      await page.setViewportSize({width:1440,height:1000});
      await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      const tipTarget=page.locator('#tvTheme');
      if(await tipTarget.count()){
        const title=await tipTarget.getAttribute('title');await tipTarget.focus();
        const tooltip=page.locator('#tv-control-tooltip');
        assert.ok(await tooltip.isVisible(),'keyboard tooltip');
        assert.equal(await tooltip.evaluate(e=>getComputedStyle(e).fontSize),'13px');
        await page.keyboard.press('Escape');assert.ok(await tooltip.isHidden());
        assert.equal(await tipTarget.getAttribute('title'),title,'native title restored');
        await page.keyboard.press('Space');
        assert.equal(await tipTarget.getAttribute('title'),await tipTarget.getAttribute('aria-label'),'keyboard activation keeps the updated theme label');
        await page.evaluate(t=>window.tvTheme.set(t),theme);
      }
      const trigger=page.locator('[data-site-menu]').first();await trigger.click();
      const menu=page.locator('#site-menu');
      const styles=await menu.evaluate(e=>{const s=getComputedStyle(e);return {radius:s.borderRadius,shadow:s.boxShadow,font:s.fontSize};});
      assert.equal(styles.radius,'6px',`${route}: shared popup radius`);
      assert.equal(styles.shadow,`rgba(0, 0, 0, ${theme==='dark'?'0.4':'0.2'}) 0px 2px 4px 0px`,`${route}: sourced popup shadow`);
      assert.equal(styles.font,'14px');
      await menu.locator('a').first().focus();await page.keyboard.press('End');
      assert.equal(await page.evaluate(()=>document.activeElement.textContent.trim()),'Trade');
      await page.keyboard.press('Escape');assert.ok(await trigger.evaluate(e=>e===document.activeElement));
    }
    if(['markets.html','economy.html','markets-overview.html','economy-overview.html'].includes(route)){
      const search=page.locator('#tvSymbol,#pageSearch').first();
      await search.click();const dialog=page.getByRole('dialog',{name:'World search'});
      assert.ok(await dialog.isVisible());assert.equal(await dialog.getAttribute('aria-modal'),'true');
      assert.equal(await dialog.evaluate(e=>getComputedStyle(e).borderRadius),'6px');
      const input=dialog.locator('input');await input.fill('zzz-no-world');
      assert.equal(await dialog.getByRole('option').count(),0);
      assert.ok(await dialog.getByRole('status').isVisible(),'accessible empty search state');
      await dialog.locator('[data-close]').focus();await page.keyboard.press('Shift+Tab');
      assert.ok(await dialog.evaluate(e=>e.contains(document.activeElement)),'modal focus remains inside');
      await page.keyboard.press('Escape');assert.ok(await search.evaluate(e=>e===document.activeElement),'modal restores opener');
      await page.locator('#tvTheme').focus();await page.evaluate(()=>new Promise(r=>setTimeout(r,0)));
      assert.ok(await page.locator('#tvTheme').evaluate(e=>e===document.activeElement),'queued close does not steal subsequent focus');
      await page.setViewportSize({width:390,height:844});await search.click();
      assert.deepEqual(await dialog.evaluate(e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height];}),[0,0,390,844]);
      if(shots)await page.screenshot({path:`${shots}/${route}-phone-dialog.png`});
      await page.keyboard.press('Escape');
    }
    if(['markets.html','economy.html'].includes(route)){
      await page.setViewportSize({width:1440,height:1000});await page.locator('#tvStyle').click();
      const menu=page.getByRole('menu');
      assert.equal(await menu.locator('button').first().evaluate(e=>e.getBoundingClientRect().height),40,'chart menu row density');
      assert.ok(await menu.locator('svg').first().evaluate(e=>e.getBoundingClientRect().width<=28),'chart menu icon stays in its slot');
      await page.keyboard.press('Home');
      assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('data-value')),'line');
      await page.keyboard.press('End');assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('data-value')),'step');
      await page.keyboard.press('Escape');assert.ok(await page.locator('#tvStyle').evaluate(e=>e===document.activeElement));
    }
    if(route.endsWith('-overview.html')){
      await page.route('**/news/id/**',r=>r.fulfill({status:503,body:''}));
      const story=page.locator('[data-news]').first();await story.click();
      const dialog=page.locator('.tv-news-story');
      await dialog.getByRole('status').filter({hasText:'could not be loaded'}).waitFor();
      await page.keyboard.press('Escape');assert.ok(await story.evaluate(e=>e===document.activeElement),'story error restores opener');
    }
    assert.deepEqual(errors,[],`${route}: clean runtime`);console.log(`PASS Chrome Beta ${route}: shared theme, menus, keyboard, responsive layouts and dialogs`);
    await context.close();
  }
} finally {await browser.close();}
