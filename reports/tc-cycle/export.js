/* Semantic, dependency-free PNG exports. Clone synchronously to freeze the clicked state.
 * Loaded before report.js, whose language helper t(en, pt) these functions call when they run. */
'use strict';
function exportButton(table = false) {
  const label = t('Download high-resolution PNG', 'Baixar PNG em alta resolução');
  return `<button type="button" class="icon-button" data-export-ui ${table ? 'data-export-table' : 'data-export'} aria-label="${label}" title="${label}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M5 16v5h14v-5"/></svg></button>`;
}
function exportSnapshot(button) {
  const source = button.closest('[data-export-figure]');
  const figure = source.cloneNode(true);
  const drawer = button.hasAttribute('data-export-table');
  const controls = drawer ? [source.querySelector('.card-controls'), button.closest('.drawer')] : [source.querySelector('.card-controls')];
  const context = controls.filter(Boolean).flatMap(el => [
    ...[...el.querySelectorAll('[aria-pressed="true"]')].map(b => `${b.closest('[aria-label]')?.getAttribute('aria-label') || ''}: ${b.textContent.trim()}`),
    ...[...el.querySelectorAll('select')].map(s => s.selectedOptions[0]?.textContent.trim()).filter(Boolean)
  ]);
  if (drawer) {
    const table = button.nextElementSibling.cloneNode(true);
    figure.querySelector('.card-body').replaceChildren(table);
    // The data table is named after its exhibit; a title's closing side qualifier stays last.
    const heading = figure.querySelector('.card-title');
    heading.textContent = heading.textContent.replace(/^(.*?)( \([^()]*\))?$/, '$1: Chart Data$2');
  }
  figure.querySelectorAll('.sort-arrow').forEach(el => el.remove());
  // Sorting is UI, but column labels are publication content.
  figure.querySelectorAll('.sort-button').forEach(el => {
    const label = document.createElement('span');
    label.className = 'col-head'; label.textContent = el.textContent;
    el.replaceWith(label);
  });
  figure.querySelectorAll('[data-export-ui], .card-controls, .table-tools, .drawer, .tip, .xhair, .hover, button, select, input, .katex-mathml').forEach(el => el.remove());
  figure.querySelectorAll('[id]').forEach(el => { if (!el.closest('svg')) el.removeAttribute('id'); });
  // The selections the head does not already state, once each: the caption and the file name both read them.
  const head = figure.querySelector('.card-head').textContent;
  const selections = [...new Set(context)].filter(value => !head.includes(value.split(': ').at(-1)));
  if (selections.length) {
    const caption = document.createElement('p'); caption.className = 'card-sub';
    caption.textContent = selections.join('; ');
    figure.querySelector('.card-head').append(caption);
  }
  figure.classList.add('export-figure');
  // Expand to the natural width of every column and never crop a scroll viewport.
  const tables = drawer ? [button.nextElementSibling] : [...source.querySelectorAll(':scope > .card-body .scroll')];
  const width = Math.ceil(Math.max(source.getBoundingClientRect().width, ...tables.map(el => el.scrollWidth)));
  figure.style.width = `${width}px`;
  const title = figure.querySelector('.card-title').textContent;
  const date = document.querySelector('.eyebrow time')?.dateTime || '';
  const slug = text => text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return {figure, filename: `${slug([title, ...selections, date].filter(Boolean).join('-')).slice(0, 220)}.png`};
}
// SVG images cannot request web fonts. Embed the formula fonts actually used by this figure.
const exportFontCache = new Map();
async function exportFonts(figure) {
  if (!figure.querySelector('.katex')) return '';
  const sheet = [...document.styleSheets].find(s => s.href?.includes('katex'));
  if (!sheet) return '';
  const families = new Set([...figure.querySelectorAll('.katex, .katex *')].map(el => getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim()));
  const read = url => {
    if (!exportFontCache.has(url)) exportFontCache.set(url, fetch(url, {signal: AbortSignal.timeout(15000)}).then(r => {
      if (!r.ok) throw new Error('Could not load export font');
      return r.blob();
    }).catch(error => { exportFontCache.delete(url); throw error; }));
    return exportFontCache.get(url);
  };
  const css = await (await read(sheet.href)).text();
  const faces = css.match(/@font-face\s*\{[^}]+\}/g) || [];
  return (await Promise.all(faces.filter(face => [...families].some(f => face.includes(`font-family:${f};`))).map(async face => {
    const match = face.match(/url\(([^)]+\.woff2)\)/);
    if (!match) return '';
    const blob = await read(new URL(match[1], sheet.href).href);
    const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
    return face.replace(/src:[^;]+/, `src:url(${data}) format('woff2')`);
  }))).join('');
}
async function renderExport({figure}) {
  const stage = document.createElement('div');
  stage.style.cssText = 'position:fixed;left:-100000px;top:0;pointer-events:none;';
  stage.setAttribute('aria-hidden', 'true'); stage.append(figure); document.body.append(stage);
  try {
    await document.fonts.ready;
    // Inline resolved styles so SVG, typography and legends travel with the image.
    const styled = [figure, ...figure.querySelectorAll('*')].map(el => {
      const computed = getComputedStyle(el);
      // Let text/table containers reflow, but keep the explicit geometry of
      // empty legend marks: without their CSS height they disappear in the PNG.
      const css = [...computed].filter(key => el.matches('.sw') || !/^(height|min-height|max-height|block-size|min-block-size|max-block-size)$/.test(key))
        .map(key => `${key}:${computed.getPropertyValue(key)};`).join('');
      return [el, css];
    });
    styled.forEach(([el, css]) => el.setAttribute('style', css));
    const width = Math.ceil(figure.getBoundingClientRect().width), height = Math.ceil(figure.getBoundingClientRect().height);
    const fontCSS = await exportFonts(figure);
    const fontStyle = document.createElement('style'); fontStyle.textContent = fontCSS; figure.prepend(fontStyle);
    const markup = new XMLSerializer().serializeToString(figure).replace(/url\(&quot;[^)]*?#([^&]+)&quot;\)/g, 'url(#$1)').replace(/url\(["']?[^)]*?#([^"')]+)["']?\)/g, 'url(#$1)');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${markup}</foreignObject></svg>`;
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = width * 2; canvas.height = height * 2;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = getComputedStyle(figure).backgroundColor; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG encoding failed')), 'image/png'));
  } finally { stage.remove(); }
}
let exportStatusTimer;
document.addEventListener('click', async event => {
  const button = event.target.closest('[data-export], [data-export-table]');
  if (!button || button.disabled) return;
  const status = document.getElementById('export-status') || document.body.appendChild(Object.assign(document.createElement('div'), {id: 'export-status', className: 'export-status'}));
  clearTimeout(exportStatusTimer);
  status.setAttribute('role', 'status');
  button.disabled = true; button.setAttribute('aria-busy', 'true');
  status.textContent = t('Generating PNG…', 'Gerando PNG…');
  try {
    const snapshot = exportSnapshot(button);
    const blob = await renderExport(snapshot);
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = snapshot.filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    status.textContent = t('PNG ready.', 'PNG pronto.');
  } catch (error) {
    console.error('Report PNG export failed', error);
    status.textContent = t('Could not generate the PNG. Please try again.', 'Não foi possível gerar o PNG. Tente novamente.');
  } finally {
    button.disabled = false; button.removeAttribute('aria-busy');
    exportStatusTimer = setTimeout(() => { status.textContent = ''; }, 8000);
  }
});
