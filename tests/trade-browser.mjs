// The Trade page in a real browser: reached from the site menu, typed into like a player copying the Market, and
// checked for what it shows, what it refuses, what it never reads (the market history) and how it lays out.
// Run with the same local server / Playwright environment as markets-browser.mjs (TIBINANCE_BROWSER=webkit for WebKit).
// Set TIBINANCE_SCREENSHOTS to a directory to keep full-page screenshots for inspection.
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium,webkit}=require(process.env.TIBINANCE_NODE_MODULES ? `${process.env.TIBINANCE_NODE_MODULES}/playwright` : 'playwright');
const engine=process.env.TIBINANCE_BROWSER ?? 'chrome';
const root=process.env.TIBINANCE_TEST_URL ?? 'http://127.0.0.1:8765';
const shots=process.env.TIBINANCE_SCREENSHOTS;
const browser=await (engine==='webkit' ? webkit.launch({headless:true}) : chromium.launch({headless:true,...(process.env.TIBINANCE_CHROME ? {executablePath:process.env.TIBINANCE_CHROME} : {channel:'chrome'})}));
try {
  if (shots) await mkdir(shots,{recursive:true});
  const context=await browser.newContext({locale:'en-US',viewport:{width:1440,height:900}});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
  const text=selector=>page.$eval(selector,e=>e.innerText.trim().replace(/\s+/g,' '));
  const field=name=>page.locator(`[data-field="${name}"]`);
  // A player types, then moves on (Tab), as when copying from the Market.
  const type=async (name,value)=>{await field(name).fill('');await field(name).pressSequentially(value);await field(name).press('Tab');};
  const cards=()=>page.$$eval('.trade-card',cs=>cs.map(c=>({id:c.dataset.strategy,name:c.querySelector('.trade-name').childNodes[0].textContent,best:c.classList.contains('is-best'),
    net:c.querySelector('.trade-net b').textContent,lines:Object.fromEntries([...c.querySelectorAll('.trade-lines > div')].map(d=>[d.querySelector('dt').textContent,d.querySelector('dd').textContent]))})));

  // Trade is a section of its own, reached from the site menu on every page (tests/site-header-browser.mjs covers the menu).
  await page.route('**/data/observations.json',r=>r.fulfill({json:[]}));
  await page.goto(`${root}/`);
  assert.deepEqual(await page.$$eval('#site-menu a',as=>as.map(a=>[a.textContent,a.getAttribute('href')])),
    [['Capture','./'],['Markets','markets.html'],['Trade','trade.html'],['Research','reports/tc-cycle/']]);
  // From here on, every request the page makes is recorded: none may reach the market history or the captures.
  const requests=[];page.on('request',r=>requests.push(new URL(r.url()).pathname));
  // What Capture keeps in this browser (its column choices); Trade must add nothing to it.
  const stored=()=>page.evaluate(()=>[Object.keys(localStorage).sort(),sessionStorage.length]);
  const storedBefore=await stored();
  await page.click('header.site [data-site-menu]');
  await page.click('#site-menu a[href="trade.html"]');
  await page.waitForSelector('#tradeResult .trade-prompt');
  assert.equal(await page.title(),'Tibinance Trade');
  assert.equal(await page.$eval('header.site [data-site-menu]',b=>b.textContent.trim()),'Trade');
  assert.equal(await page.getAttribute('#site-menu a[aria-current="page"]','href'),'trade.html');
  assert.equal(await page.$eval('h1',h=>h.textContent),'Trade Now or Create an Offer');

  // Nothing entered: the page asks for the amount, and nothing is computed or invented.
  assert.equal(await text('#tradeResult'),'Enter how many Tibia Coins you want to sell.');
  assert.deepEqual(await page.$$eval('#tradeIntent [role="radio"]',bs=>bs.map(b=>[b.textContent,b.getAttribute('aria-checked')])),[['Sell','true'],['Buy','false']]);
  await type('amount','10000');
  assert.equal(await field('amount').inputValue(),'10,000','a number is written back in full when the field is left');
  assert.equal(await text('#tradeOwnAmount'),'10,000','an offer of one\'s own is for the whole amount');
  assert.match(await text('#tradeResult'),/^Enter the top Buy Offer to see what selling now brings/);

  // Selling into enough Buy Offers, with an offer of one's own above them. Shorthand is read and written back.
  await type('book.sell.0.amount','2500');
  await type('book.sell.0.price','38,900');
  await type('book.buy.0.amount','12000');
  await type('book.buy.0.price','38.42k');
  assert.equal(await field('book.buy.0.price').inputValue(),'38,420');
  assert.match(await text('#tradeResult .trade-verdict'),/^Sell now Net proceeds: 384,200,000\. Enter your Sell Offer price to compare it with an offer\.$/);
  assert.match(await text('.trade-breakeven'),/^BREAK-EVEN SELL OFFER PRICE 38,520 /,'the break-even price needs no offer price');
  await type('offerPrice','38900');
  assert.equal(await text('.trade-verdict'),'BEST ON THESE NUMBERS Create Sell Offer +3,800,000 (+0.99%) over selling now, if the offer fills.');
  assert.equal(await text('.trade-breakeven'),'BREAK-EVEN SELL OFFER PRICE 38,520 Below it, selling now nets more; from it up, an offer that fills nets at least as much.');
  assert.deepEqual(await cards(),[
    {id:'take',name:'Sell now',best:false,net:'384,200,000',lines:{'Sells now':'10,000 at 38,420','Market fee':'0'}},
    {id:'make',name:'Create Sell Offer',best:true,net:'388,000,000',lines:{'Offers':'10,000 at 38,900','Total Price':'389,000,000','Market fee':'1,000,000'}}]);
  assert.equal(await page.$eval('[data-strategy="make"] .trade-net .trade-label',e=>e.textContent),'Net proceeds, if it fills');
  assert.match(await text('[data-strategy="make"] .trade-note'),/^It would join 2,500 already offered at that price\. The fee leaves your bank when it is placed\.$/);
  assert.match(await text('.trade-fine'),/fills completely at your price; nothing here estimates whether or when it will/);
  if (shots) await page.screenshot({path:join(shots,`trade-${engine}-1440-sell.png`),fullPage:true});
  // Screen readers hear the verdict once typing pauses.
  await page.waitForFunction(()=>document.getElementById('tradeStatus').textContent==='Best on these numbers. Create Sell Offer. +3,800,000 (+0.99%) over selling now, if the offer fills.');

  // At the break-even price the two are equal, and selling now leads; below it, selling now wins outright.
  await type('offerPrice','38520');
  assert.equal(await text('.trade-verdict'),'BEST ON THESE NUMBERS Sell now The same as a Sell Offer of 10,000 at 38,520: 384,200,000 either way, and selling now does not wait on an offer.');
  await type('offerPrice','38500');
  assert.equal(await text('.trade-verdict'),'BEST ON THESE NUMBERS Sell now +200,000 (+0.05%) over a Sell Offer of 10,000 at 38,500, even if the offer filled.');

  // More than the Buy Offers hold: only their amount is priced, the rest is shown, and a split is offered.
  await type('offerPrice','38900');
  await type('book.buy.0.amount','4000');
  assert.deepEqual((await cards()).map(c=>[c.id,c.best,c.net]),[['take',false,'153,680,000'],['split',false,'386,080,000'],['make',true,'388,000,000']]);
  const [take,split]=await cards();
  assert.deepEqual(take.lines,{'Sells now':'4,000 of 10,000 at 38,420','Market fee':'0','Unsold':'6,000'});
  assert.equal(await page.$eval('[data-strategy="take"] .trade-net .trade-label',e=>e.textContent),'Net proceeds, for 4,000');
  assert.deepEqual(split.lines,{'Sells now':'4,000 at 38,420','Received now':'153,680,000','Then offers':'6,000 at 38,900','Offer Total Price':'233,400,000','Market fee':'1,000,000'});
  assert.equal(await text('.trade-verdict'),'BEST ON THESE NUMBERS Create Sell Offer +1,920,000 (+0.50%) over selling 4,000 now and offering 6,000, if the offer fills.');
  assert.match(await text('.trade-breakeven'),/^BREAK-EVEN SELL OFFER PRICE 38,421 Below it, selling 4,000 now and offering the rest nets more/);

  // An own price at the Buy Offer would be matched at once: refused as an offer, with the reason beside it.
  await type('offerPrice','38000');
  assert.equal(await field('offerPrice').getAttribute('aria-invalid'),'true');
  assert.equal(await field('offerPrice').getAttribute('aria-describedby'),'tradeOfferError');
  assert.equal(await text('#tradeOfferError'),'At or below the Buy Offer at 38,420, your Sell Offer would be matched against it at once and still pay the fee. Selling now does the same without it.');
  assert.deepEqual((await cards()).map(c=>c.id),['take']);
  assert.equal(await text('.trade-pick'),'Only 4,000 of 10,000 can sell now');

  // Values the Market would not take are marked where they were entered, and hold the comparison back.
  await type('offerPrice','38900');
  await type('amount','30');
  assert.equal(await text('#tradeAmountError'),'Tibia Coins trade in lots of 25.');
  assert.equal(await field('amount').getAttribute('aria-invalid'),'true');
  assert.equal(await text('#tradeResult'),'Correct the marked values to see the comparison.');
  await type('amount','10000');
  assert.equal(await page.isVisible('#tradeAmountError'),false);
  assert.equal(await field('amount').getAttribute('aria-invalid'),null);
  await type('book.sell.0.amount','');
  assert.equal(await text('#tradeSellError'),'Enter the Amount as well.');
  await type('book.sell.0.amount','2500');
  await type('book.buy.0.price','38.52');
  assert.equal(await text('#tradeBuyError'),'Piece Price: Enter a whole number, such as 38,520 or 38.5k.');
  assert.equal(await field('book.buy.0.price').inputValue(),'38.52','an unreadable value is left as typed');
  // A crossed book is one message, under the Buy Offers, and both prices are marked.
  await type('book.buy.0.price','39000');
  assert.equal(await text('#tradeBuyError'),'A Buy Offer at 39,000 and a Sell Offer at 38,900 would already have traded: the Buy Offer must be the lower.');
  assert.equal(await page.isVisible('#tradeSellError'),false);
  assert.deepEqual([await field('book.sell.0.price').getAttribute('aria-invalid'),await field('book.buy.0.price').getAttribute('aria-invalid')],['true','true']);
  assert.equal(await field('book.sell.0.price').getAttribute('aria-describedby'),'tradeBuyError');

  // Buying: the same comparison on cost; the page's words follow the intent.
  await page.getByRole('radio',{name:'Buy'}).click();
  await type('amount','2,000');
  await type('book.sell.0.amount','500');
  await type('book.sell.0.price','38800');
  await type('book.buy.0.amount','300');
  await type('book.buy.0.price','38000');
  await type('offerPrice','38050');
  assert.equal(await text('#tradeOwnName'),'Your Buy Offer');
  assert.equal(await field('offerPrice').getAttribute('aria-label'),'Your Buy Offer, Piece Price');
  assert.deepEqual((await cards()).map(c=>[c.name,c.best,c.net]),[['Buy now',false,'19,400,000'],['Buy now, offer the rest',false,'77,475,000'],['Create Buy Offer',true,'77,100,000']]);
  assert.equal(await text('.trade-verdict'),'BEST ON THESE NUMBERS Create Buy Offer 375,000 (0.48%) less than buying 500 now and offering 1,500, if the offer fills.');
  assert.match(await text('[data-strategy="make"] .trade-note'),/^It would be the highest Buy Offer\. Its price and the fee leave your bank when it is placed\.$/);
  assert.equal((await cards())[0].lines['Not bought'],'1,500');

  // Very large orders: exact to the last gold, past the range a Number holds.
  await type('amount','6,400,000');
  await type('book.sell.0.amount','6400000');
  await type('book.sell.0.price','999,999,999,999');
  await type('book.buy.0.price','1');
  await type('offerPrice','999999999899');
  const big=await cards();
  assert.equal(big[0].net,'6,399,999,999,993,600,000');
  assert.equal(big.at(-1).lines['Offers'],'6,400,000 at 999,999,999,899, in 100 offers');
  assert.equal(big.at(-1).lines['Market fee'],'100,000,000');
  // 540,000,000 on 6.4 quintillion is a real saving below the last shown digit: never 0.00%.
  assert.equal(await text('.trade-gain'),'540,000,000 (<0.01%) less than buying now, if the offer fills.');
  // Figures that long wrap only between digit groups.
  assert.equal(await page.$eval('[data-strategy="take"] .trade-net b',b=>b.querySelectorAll('wbr').length),6);
  if (shots) await page.screenshot({path:join(shots,`trade-${engine}-1440-buy.png`),fullPage:true});

  // Layout: the order beside the comparison at 1440; stacked, inside the page, at a phone's width.
  const layout=()=>page.evaluate(()=>{const f=document.getElementById('tradeForm').getBoundingClientRect(),r=document.querySelector('.trade-result').getBoundingClientRect();
    return {beside:r.left>=f.right && Math.abs(r.top-f.top)<2,below:r.top>=f.bottom,overflow:document.documentElement.scrollWidth-innerWidth,
      fieldFont:Math.min(...[...document.querySelectorAll('.trade-input')].map(i=>parseFloat(getComputedStyle(i).fontSize)))};});
  const wide=await layout();
  assert.equal(wide.beside,true);
  assert.equal(wide.overflow,0);
  await page.setViewportSize({width:390,height:844});
  const narrow=await layout();
  assert.deepEqual([narrow.beside,narrow.below,narrow.overflow],[false,true,0]);
  assert.ok(narrow.fieldFont>=16,'phones do not zoom into the fields');
  if (shots) await page.screenshot({path:join(shots,`trade-${engine}-390.png`),fullPage:true});

  // Clear empties every field and starts again at the amount.
  await page.click('#tradeClear');
  assert.deepEqual(await page.$$eval('input[data-field]',fs=>fs.map(f=>f.value).filter(Boolean)),[]);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'tradeAmount');
  assert.equal(await text('#tradeResult'),'Enter how many Tibia Coins you want to buy.');

  // The page read only its own files: no market history, no captures, and it kept nothing in the browser.
  assert.deepEqual(requests.filter(p=>p.startsWith('/data/')),[]);
  assert.deepEqual(await stored(),storedBefore);
  assert.deepEqual(errors,[]);
  console.log(`PASS ${engine}: Trade page reached from the menu; sell and buy comparisons, break-even, partial liquidity, split, crossing and lot checks, very large orders, no market history read, 1440/390 layouts`);
} finally {
  await browser.close();
}
