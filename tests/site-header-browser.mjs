// The shared site header (js/site-header.js, css/site-header.css) on Capture, Markets, Trade and both Research editions,
// in a real browser: the trail and its menu of sections, keyboard and pointer use, Research's world and language
// controls, their accessible names, and the layout at desktop and phone widths.
// Run with the same local server / Playwright environment as markets-browser.mjs (TIBINANCE_BROWSER=webkit for WebKit).
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium,webkit}=require(process.env.TIBINANCE_NODE_MODULES ? `${process.env.TIBINANCE_NODE_MODULES}/playwright` : 'playwright');
const engine=process.env.TIBINANCE_BROWSER ?? 'chrome';
const root=process.env.TIBINANCE_TEST_URL ?? 'http://127.0.0.1:8765';
const SITE='https://nesleykent.github.io/Tibinance/';
const LOCAL=[['Capture','./'],['Markets','markets.html'],['Trade','trade.html'],['Research','reports/tc-cycle/']];
const pages=[
  {name:'Capture',path:'/',ready:'#capturesLoading[hidden]',trail:['Tibinance'],trigger:'Tibinance',home:null,links:LOCAL},
  {name:'Markets',path:'/markets.html',ready:'#market[aria-busy="false"]',trail:['Tibinance','/','Markets'],trigger:'Markets',home:'./',links:LOCAL},
  {name:'Trade',path:'/trade.html',ready:'#tradeResult .trade-prompt',trail:['Tibinance','/','Trade'],trigger:'Trade',home:'./',links:LOCAL},
  {name:'Research',path:'/reports/tc-cycle/',ready:'#report[aria-busy="false"]',trail:['Tibinance','/','Research'],trigger:'Research',home:SITE,
    links:[['Capture',SITE],['Markets',`${SITE}markets.html`],['Trade',`${SITE}trade.html`],['Research','./']],
    language:{name:'Language: EN, English',code:'EN',current:'English',empty:'No world matches.'}},
  {name:'Research',path:'/reports/tc-cycle/pt-br.html',ready:'#report[aria-busy="false"]',trail:['Tibinance','/','Research'],trigger:'Research',home:SITE,
    links:[['Capture',SITE],['Markets',`${SITE}markets.html`],['Trade',`${SITE}trade.html`],['Research','pt-br.html']],
    language:{name:'Idioma: PT, Português',code:'PT',current:'Português',empty:'Nenhum world encontrado.'}},
];
const EDITIONS=[['English','./','en'],['Português','pt-br.html','pt-BR']];
// The site's shell: one header height and one set of page margins (css/app.css, reports/tc-cycle/report.css).
const HEADER=56;
let captureEdges;
const browser=await (engine==='webkit' ? webkit.launch({headless:true}) : chromium.launch({headless:true,...(process.env.TIBINANCE_CHROME ? {executablePath:process.env.TIBINANCE_CHROME} : {channel:'chrome'})}));
try {
  const context=await browser.newContext({locale:'en-US',viewport:{width:1440,height:900}});
  const page=await context.newPage();
  if(process.env.TIBINANCE_CHART_LIBRARY) {
    const body=await readFile(process.env.TIBINANCE_CHART_LIBRARY,'utf8');
    await page.route('https://cdn.jsdelivr.net/npm/lightweight-charts@5.2.1/**',route=>route.fulfill({body,contentType:'text/javascript',headers:{'access-control-allow-origin':'*'}}));
  }
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
  // Capture's saved list is not under test: an empty one keeps the page independent of local data.
  await page.route('**/data/observations.json',r=>r.fulfill({json:[]}));
  const SECTIONS='[data-site-menu]:not([data-site-menu="end"])';
  const open=()=>page.evaluate(()=>[...document.querySelectorAll('.site-panel')].filter(p=>p.matches(':popover-open')).map(p=>p.id));
  const focused=()=>page.evaluate(()=>document.activeElement?.textContent.trim());
  const isFocused=locator=>locator.evaluate(e=>e===document.activeElement);
  const box=selector=>page.$eval(selector,e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};});
  // A click on the header's empty middle: outside every panel, and on nothing a page reacts to.
  const clickOutside=async()=>{const r=await box('header.site');await page.mouse.click(r.left+(r.right-r.left)/2,r.top+4);};

  for (const p of pages) {
    const label=`${p.name} ${p.path}`;
    await page.setViewportSize({width:1440,height:900});
    await page.goto(`${root}${p.path}`);
    await page.waitForSelector(p.ready,{state:'attached',timeout:60000});
    const nav=page.getByRole('navigation',{name:'Site'});
    const trigger=nav.getByRole('button',{name:p.trigger,exact:true});
    const menu=page.locator('#site-menu');

    // The trail: Tibinance, then the section. Its last crumb opens the menu; Tibinance before it links home.
    assert.deepEqual(await page.$$eval('.site-nav > :not(ul)',els=>els.map(e=>e.textContent.trim())),p.trail,label);
    assert.equal(await page.locator(SECTIONS).count(),1,`${label}: one menu of sections`);
    assert.equal(await trigger.evaluate(b=>b.matches('[data-site-menu]')),true);
    if (p.home) assert.equal(await nav.getByRole('link',{name:'Tibinance',exact:true}).getAttribute('href'),p.home);
    else assert.equal(await nav.getByRole('link').filter({visible:true}).count(),0);
    // No permanent navigation: the sections are listed only inside the closed menu.
    assert.deepEqual(await open(),[]);
    assert.equal(await menu.isVisible(),false);
    const project=page.getByRole('link',{name:'Tibinance project on GitHub'});
    assert.equal(await project.getAttribute('href'),'https://github.com/nesleykent/Tibinance');
    assert.equal(await project.isVisible(),true);
    assert.equal(await page.locator('header.site a:visible').count(),p.home ? 2 : 1,`${label}: home and project links`);
    assert.equal((await box('header.site')).bottom,HEADER,`${label}: the shared header height`);
    // The same margins as Capture, and room kept for a scrollbar whether the page scrolls or not, so they stay the
    // same where scrollbars take up width.
    const edges=await page.$eval('.site .wrap',w=>{const r=w.getBoundingClientRect(),s=getComputedStyle(w);return [r.left+parseFloat(s.paddingLeft),r.right-parseFloat(s.paddingRight)];});
    captureEdges??=edges;
    assert.deepEqual(edges,captureEdges,`${label}: Capture's margins`);
    assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).scrollbarGutter),'stable',`${label}: scrollbar room kept`);

    // Pointer: the menu opens under its button, lists the four sections and marks this one.
    assert.equal(await trigger.getAttribute('aria-expanded'),'false');
    await trigger.click();
    assert.deepEqual(await open(),['site-menu']);
    assert.equal(await trigger.getAttribute('aria-expanded'),'true');
    assert.deepEqual(await menu.locator('a').evaluateAll(as=>as.map(a=>[a.textContent.trim(),a.getAttribute('href')])),p.links);
    assert.deepEqual(await menu.locator('a[aria-current="page"]').allTextContents(),[p.name]);
    const [t,m]=[await box(SECTIONS),await box('#site-menu')];
    assert.ok(m.top>=t.bottom && m.top-t.bottom<=8 && Math.abs(m.left-Math.max(8,t.left))<=1,`${label}: menu anchored under its button`);
    await clickOutside();
    assert.deepEqual(await open(),[],`${label}: a click outside closes the menu`);
    assert.equal(await trigger.getAttribute('aria-expanded'),'false');

    // Keyboard: the arrows open the menu at the current section and move through it; Escape returns to the button.
    // (Engines differ on whether Tab reaches links: WebKit's default does not, so the checks use the arrows and focus().)
    await trigger.focus();
    await page.keyboard.press('ArrowDown');
    assert.equal(await focused(),p.name);
    await page.keyboard.press('Home'); assert.equal(await focused(),'Capture');
    await page.keyboard.press('ArrowDown'); assert.equal(await focused(),'Markets');
    await page.keyboard.press('ArrowDown'); assert.equal(await focused(),'Trade');
    await page.keyboard.press('End'); assert.equal(await focused(),'Research');
    await page.keyboard.press('ArrowDown'); assert.equal(await focused(),'Capture');
    await page.keyboard.press('ArrowUp'); assert.equal(await focused(),'Research');
    await page.keyboard.press('Escape');
    assert.deepEqual(await open(),[]);
    assert.equal(await isFocused(trigger),true,`${label}: Escape returns focus to the button`);
    assert.equal(await trigger.getAttribute('aria-expanded'),'false');
    await page.keyboard.press('Enter');
    assert.deepEqual(await open(),['site-menu'],`${label}: Enter opens the menu`);
    await page.keyboard.press('Enter');
    assert.deepEqual(await open(),[],`${label}: Enter closes it again`);
    // Focus moving out of the menu closes it.
    await trigger.click();
    await menu.locator('a').last().focus();
    await page.locator('main').evaluate(m=>{m.tabIndex=-1;m.focus();});
    assert.deepEqual(await open(),[],`${label}: focus leaving the menu closes it`);

    if (p.language) {
      // ---- Research: All Worlds and the language, with no visible labels and no boxes.
      assert.equal(await page.locator('header.site select').count(),0,'no select in the header');
      const world=page.getByRole('button',{name:'World: All Worlds',exact:true});
      const language=page.getByRole('button',{name:p.language.name,exact:true});
      // On screen, only the choice and the language code; the names above carry what they are.
      assert.deepEqual(await page.$$eval('.site-controls button',bs=>bs.map(b=>b.innerText.trim())),['All Worlds',p.language.code]);
      for (const control of [world,language]) {
        assert.deepEqual(await control.evaluate(b=>{const s=getComputedStyle(b);return [s.borderTopWidth,s.backgroundColor];}),['0px','rgba(0, 0, 0, 0)']);
        await control.hover();
        assert.notEqual(await control.evaluate(b=>getComputedStyle(b).backgroundColor),'rgba(0, 0, 0, 0)','hover feedback');
      }

      // The language menu lists both editions with their links unchanged, and marks this one. (Opened from the
      // keyboard: WebKit does not focus a button it clicks, so only a keyboard opening has a button to return to.)
      await language.focus();
      await page.keyboard.press('Enter');
      assert.deepEqual(await open(),['language-menu']);
      const editions=page.locator('#language-menu a');
      assert.deepEqual(await editions.evaluateAll(as=>as.map(a=>[a.childNodes[0].textContent.trim(),a.getAttribute('href'),a.getAttribute('hreflang')])),EDITIONS);
      assert.deepEqual(await editions.evaluateAll(as=>as.map(a=>a.lang)),['en','pt-BR']);
      assert.deepEqual(await page.locator('#language-menu a[aria-current="page"]').evaluateAll(as=>as.map(a=>a.childNodes[0].textContent.trim())),[p.language.current]);
      const [lb,lm]=[await box('.site-language .site-control'),await box('#language-menu')];
      assert.ok(Math.abs(lm.right-lb.right)<=1 && lm.top>=lb.bottom,'language menu anchored at the button end');
      await page.keyboard.press('Escape');
      assert.equal(await isFocused(language),true);

      // The world picker offers exactly the choices of the report's other world pickers, searchable.
      await page.goto(`${root}${p.path}#card-world-daily`);
      await page.waitForSelector('select[data-picker="world"]');
      const chapterPicker='section:has(#card-world-daily) select[data-picker="world"]';
      const universe=await page.$eval(chapterPicker,s=>[...s.options].map(o=>o.textContent));
      assert.ok(universe.length>1 && universe[0]==='All Worlds');
      await world.click();
      const search=page.getByRole('combobox',{name:p.language.code==='EN' ? 'Search worlds' : 'Buscar worlds',exact:true});
      assert.deepEqual(await open(),['world-picker']);
      assert.equal(await isFocused(search),true,'the search field takes focus');
      assert.equal(await search.getAttribute('aria-expanded'),'true');
      const listbox=page.getByRole('listbox',{name:'World'});
      assert.equal(await search.getAttribute('aria-controls'),await listbox.getAttribute('id'));
      assert.deepEqual(await listbox.getByRole('option').allTextContents(),universe);
      assert.deepEqual(await listbox.locator('[aria-selected="true"]').allTextContents(),['All Worlds']);
      const [wb,wm]=[await box('#site-world .site-control'),await box('#world-picker')];
      assert.ok(Math.abs(wm.right-wb.right)<=1 && wm.top>=wb.bottom && wm.bottom<=900,'picker anchored at the button end, inside the viewport');

      // Typing filters (case ignored); the arrows move; Enter picks and applies the world to the report.
      await search.fill('ANT');
      const matches=universe.filter(w=>w.toLowerCase().includes('ant'));
      assert.ok(matches.length>1);
      const active=()=>page.$eval('#world-picker',panel=>panel.querySelector(`#${panel.querySelector('input').getAttribute('aria-activedescendant')}`)?.textContent);
      assert.deepEqual(await listbox.locator('[role="option"]:visible').allTextContents(),matches);
      assert.equal(await active(),matches[0]);
      await page.keyboard.press('ArrowDown'); assert.equal(await active(),matches[1]);
      await page.keyboard.press('ArrowUp'); assert.equal(await active(),matches[0]);
      await page.keyboard.press('Enter');
      assert.deepEqual(await open(),[]);
      const chosen=page.getByRole('button',{name:`World: ${matches[0]}`,exact:true});
      assert.equal(await isFocused(chosen),true,'focus returns to the picker');
      assert.equal(await page.locator('#card-world-daily').isVisible(),true,'the world filter applies');
      assert.equal(await page.$eval(chapterPicker,s=>s.value),matches[0]);

      // No match: a message and nothing to pick. Escape leaves the choice as it was.
      await chosen.click();
      await search.fill('zzz');
      assert.equal(await listbox.locator('[role="option"]:visible').count(),0);
      assert.equal(await page.locator('#world-picker [role="status"]').innerText(),p.language.empty);
      await page.keyboard.press('Enter');
      await page.keyboard.press('Escape');
      assert.deepEqual(await open(),[]);
      assert.equal(await isFocused(chosen),true);

      // A choice made elsewhere in the report shows in the header; picking All Worlds with the pointer clears it.
      await page.selectOption(chapterPicker,'Gentebra');
      const gentebra=page.getByRole('button',{name:'World: Gentebra',exact:true});
      assert.equal(await gentebra.count(),1);
      await gentebra.click();
      await listbox.getByRole('option',{name:'All Worlds',exact:true}).click();
      assert.equal(await world.count(),1);
      assert.equal(await page.locator('#card-world-daily').isVisible(),false,'All Worlds clears the filter');
      assert.equal(await page.$eval(chapterPicker,s=>s.value),'');
    }

    // Phone and tablet widths: the trail and any controls fit without sideways scrolling; panels stay on screen.
    for (const [width,height] of [[768,1000],[390,844],[375,667]]) {
      await page.setViewportSize({width,height});
      const fit=await page.evaluate(()=>{
        const r=s=>document.querySelector(s)?.getBoundingClientRect(),v=document.querySelector('.site-control-value');
        return {overflow:document.documentElement.scrollWidth-innerWidth,truncated:v ? v.scrollWidth>v.clientWidth : false,
          apart:!r('.site-controls') || r('.site-nav').right<=r('.site-controls').left,header:Math.round(r('header.site').height)};
      });
      assert.deepEqual(fit,{overflow:0,truncated:false,apart:true,header:HEADER},`${label} at ${width}px`);
      for (const [button,panel] of [[SECTIONS,'#site-menu'],...(p.language ? [['#site-world .site-control','#world-picker'],['.site-language .site-control','#language-menu']] : [])]) {
        await page.click(button);
        assert.deepEqual(await open(),[panel.slice(1)]);
        const r=await box(panel);
        assert.ok(r.left>=0 && r.right<=width && r.bottom<=height,`${label}: ${panel} inside ${width}px: ${JSON.stringify(r)}`);
        await page.keyboard.press('Escape');
      }
    }

    // Deep links that name a world still select it.
    if (p.language) {
      await page.goto(`${root}${p.path}#dossier-antica`);
      await page.waitForFunction(()=>document.querySelector('#site-world .site-control-value')?.textContent==='Antica');
      assert.equal(new URL(page.url()).hash,'#dossier-antica');
    }
  }

  // The menu navigates: Capture to Markets, then home again through the Tibinance link.
  await page.setViewportSize({width:1440,height:900});
  await page.goto(`${root}/`);
  await page.getByRole('button',{name:'Tibinance',exact:true}).click();
  await page.locator('#site-menu').getByRole('link',{name:'Markets'}).click();
  await page.waitForSelector('#market[aria-busy="false"]',{state:'attached',timeout:60000});
  assert.equal(new URL(page.url()).pathname,'/markets.html');
  await page.getByRole('navigation',{name:'Site'}).getByRole('link',{name:'Tibinance'}).click();
  await page.waitForSelector('#capturesLoading[hidden]',{state:'attached'});
  assert.equal(new URL(page.url()).pathname,'/');

  assert.deepEqual(errors,[]);
  console.log(`PASS ${engine}: shared trail and menu on Capture, Markets, Trade and Research (EN, PT); keyboard, pointer, focus, Research world and language controls, deep links, 1440/768/390/375 layouts`);
} finally {
  await browser.close();
}
