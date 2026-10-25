/*
 * Tibia's news, as TradingView shows a symbol's: a list of headlines with their time and kind, each opening its whole
 * story in a dialog. Read from the TibiaData API (api.tibiadata.com, v5), which serves tibia.com's news archive and
 * ticker with CORS: the latest items for the list, one item's content for its story. Nothing is stored; a story's HTML is
 * reduced to plain text structure and links before it is shown (sanitize), and every story links to tibia.com.
 *
 * Copy rule: Tibinance never shows a middle dot, quoted text included; one in a headline or story becomes a comma.
 */
import { config } from './config.js';
import { openDialog } from './tv-ui.js';
const API = `${config.apiBaseUrl}/news`;
const KINDS = { news: 'News', ticker: 'Ticker', article: 'Featured article' };
const CATEGORIES = { development: 'Development', community: 'Community', support: 'Support', technical: 'Technical', useful: 'Useful info', 'useful info': 'Useful info', cipsoft: 'CipSoft' };
const capital = s => s ? s[0].toUpperCase() + s.slice(1) : s;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const plain = s => String(s ?? '').replace(/\u00a0/g, ' ').replace(/\s*\u00b7\s*/g, ', ').replace(/\s+/g, ' ').trim();
const icon = name => `<svg aria-hidden="true"><use href="css/tv-icons.svg#${name}"/></svg>`;

let latest = null;
// The latest items, newest first: [{id, date, title, category, kind, url}]. Shared by every caller on the page.
export function latestNews() {
  return latest ??= fetch(`${API}/latest`).then(async r => {
    if (!r.ok) throw new Error(`TibiaData news: HTTP ${r.status}`);
    const items = (await r.json()).news ?? [];
    return items.map(n => ({ id: n.id, date: n.date, title: plain(n.news), category: CATEGORIES[n.category] ?? capital(plain(n.category)), kind: KINDS[n.type] ?? plain(n.type), url: n.url }))
      .filter(n => n.id && n.date && n.title)
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  }).catch(error => { latest = null; throw error; });
}

// A story's HTML reduced to safe structure: paragraphs, emphasis, lists, headings, links (to a new tab) and images from
// https; every other element keeps only its text, and no attribute survives but a link's href and an image's src and alt.
export function sanitize(html) {
  const doc = new DOMParser().parseFromString(`<div>${html ?? ''}</div>`, 'text/html');
  const KEEP = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'BLOCKQUOTE', 'A', 'IMG', 'TABLE', 'TBODY', 'TR', 'TD', 'TH']);
  const out = document.createElement('div');
  const copy = (node, into) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) { into.append(child.textContent.replace(/\s*\u00b7\s*/g, ', ')); continue; }
      if (child.nodeType !== Node.ELEMENT_NODE || ['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'FORM', 'NOSCRIPT'].includes(child.tagName)) continue;
      if (!KEEP.has(child.tagName)) { copy(child, into); continue; }
      const el = document.createElement(child.tagName);
      if (child.tagName === 'A') {
        const href = child.getAttribute('href') ?? '';
        if (/^https:\/\//i.test(href)) { el.href = href; el.target = '_blank'; el.rel = 'noopener noreferrer'; }
      }
      if (child.tagName === 'IMG') {
        const src = child.getAttribute('src') ?? '';
        if (!/^https:\/\//i.test(src)) continue;
        el.src = src; el.alt = child.getAttribute('alt') ?? ''; el.loading = 'lazy'; el.referrerPolicy = 'no-referrer';
        // tibia.com floats its pictures beside the text (align); kept as a class, with the size for the layout.
        const align = (child.getAttribute('align') ?? '').toLowerCase();
        el.className = align === 'right' || align === 'left' ? `tv-news-float-${align}` : 'tv-news-figure';
        for (const dim of ['width', 'height']) if (/^\d+$/.test(child.getAttribute(dim) ?? '')) el.setAttribute(dim, child.getAttribute(dim));
      }
      copy(child, el);
      into.append(el);
    }
  };
  copy(doc.body.firstChild, out);
  return out;
}

// When it was published, as TradingView writes a headline's time: today, yesterday, days ago, or the date.
export function ago(date, today = new Date().toISOString().slice(0, 10)) {
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86400000);
  return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : days < 7 ? `${days} days ago` : date;
}

// The story dialog, one per page.
let dialog = null;
export async function openStory(item) {
  if (!dialog) {
    dialog = Object.assign(document.createElement('dialog'), { className: 'tv-dialog tv-news-story' });
    document.body.append(dialog);
  }
  const head = `<div class="tv-dialog-head"><span class="tv-news-meta">Tibia, ${esc(item.kind)}, ${esc(item.category)}, ${esc(item.date)}</span>`
    + `<button type="button" class="tv-btn tv-icon tv-dialog-close" aria-label="Close" data-close>${icon('close')}</button></div>`;
  dialog.innerHTML = `${head}<h2 class="tv-news-title">${esc(item.title)}</h2><div class="tv-news-body"><p class="tv-status" role="status">Loading the story…</p></div>`
    + `<p class="tv-news-source"><a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">Read on tibia.com</a></p>`;
  dialog.setAttribute('aria-label', item.title);
  openDialog(dialog);
  const body = dialog.querySelector('.tv-news-body');
  try {
    const r = await fetch(`${API}/id/${encodeURIComponent(item.id)}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const story = (await r.json()).news ?? {};
    body.replaceChildren(sanitize(story.content_html || esc(story.content ?? '')));
    body.insertAdjacentHTML('beforeend', '<div class="tv-news-clear"></div>');
  } catch (error) {
    console.warn('The story could not be loaded.', error);
    body.innerHTML = '<p class="tv-status is-error" role="status">The story could not be loaded. It is on tibia.com.</p>';
  }
}

// A list of headlines (the terminal's News panel): each a button opening its story.
export function newsList(container, { limit = 30 } = {}) {
  let items = [];
  container.addEventListener('click', e => {
    const id = e.target.closest('[data-news]')?.dataset.news, item = items.find(n => String(n.id) === id);
    if (item) openStory(item);
  });
  return {
    async load() {
      if (container.dataset.loaded) return;
      container.innerHTML = '<li class="tv-status" role="status">Loading the news…</li>';
      try {
        items = (await latestNews()).slice(0, limit);
        container.dataset.loaded = 'true';
        container.innerHTML = items.map(n => `<li><button type="button" class="tv-news-item" data-news="${esc(n.id)}">`
          + `<span class="tv-news-meta">${esc(ago(n.date))}<span>${esc(n.kind)}</span><span>${esc(n.category)}</span></span>`
          + `<span class="tv-news-headline">${esc(n.title)}</span></button></li>`).join('') || '<li class="tv-status" role="status">No recent news.</li>';
      } catch (error) {
        console.warn('Tibia news are unavailable.', error);
        container.innerHTML = '<li class="tv-status is-error" role="status">The news could not be loaded. They are on tibia.com.</li>';
      }
    },
  };
}

// Top stories, as the /markets/ page leads its news: cards of the latest headlines.
export async function topStories(container, { limit = 8 } = {}) {
  try {
    const items = (await latestNews()).slice(0, limit);
    container.innerHTML = items.map(n => `<li><button type="button" class="tv-story" data-news="${esc(n.id)}">`
      + `<span class="tv-news-meta">${esc(ago(n.date))}<span>${esc(n.kind)}</span><span>${esc(n.category)}</span></span>`
      + `<span class="tv-story-headline">${esc(n.title)}</span></button></li>`).join('') || '<li class="tv-status" role="status">No recent news.</li>';
    container.addEventListener('click', e => {
      const id = e.target.closest('[data-news]')?.dataset.news, item = items.find(n => String(n.id) === id);
      if (item) openStory(item);
    });
  } catch (error) {
    console.warn('Tibia news are unavailable.', error);
    container.innerHTML = '<li class="tv-status is-error" role="status">The news could not be loaded. They are on tibia.com.</li>';
  }
}
