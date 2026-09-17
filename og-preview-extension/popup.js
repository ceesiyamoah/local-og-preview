function extractMetaTags() {
  const ogTags = {};
  const twitterTags = {};
  const dupes = [];

  // First occurrence wins — the first og:image is the primary one crawlers use,
  // and duplicate singular tags are recorded so we can warn about them.
  const collect = (el, map, key) => {
    const content = el.getAttribute('content');
    if (!key || !content) return;
    if (key in map) { if (!dupes.includes(key)) dupes.push(key); return; }
    map[key] = content;
  };

  document.querySelectorAll('meta[property^="og:"]').forEach((el) => {
    collect(el, ogTags, el.getAttribute('property'));
  });

  document.querySelectorAll('meta[name^="twitter:"], meta[property^="twitter:"]').forEach((el) => {
    collect(el, twitterTags, el.getAttribute('name') || el.getAttribute('property'));
  });

  const descMeta = document.querySelector('meta[name="description"]');
  const title = ogTags['og:title'] || document.title || '';
  const description = ogTags['og:description'] || (descMeta ? descMeta.getAttribute('content') : '') || '';
  const siteName = ogTags['og:site_name'] || location.hostname;

  const faviconEl = document.querySelector('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]');
  const favicon = faviconEl ? faviconEl.getAttribute('href') : '';

  // JSON-LD structured data (schema.org) — what Google reads for rich results
  const jsonLd = [];
  document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
    const text = (s.textContent || '').trim();
    if (!text) return;
    try { jsonLd.push({ valid: true, json: JSON.parse(text) }); }
    catch { jsonLd.push({ valid: false, text: text.slice(0, 4000) }); }
  });

  return { ogTags, twitterTags, title, description, siteName, favicon, dupes, jsonLd, url: location.href };
}

// Fetches the raw HTML and extracts OG/Twitter tags without JS execution
// This simulates what social media crawlers actually see
async function extractRawMetaTags() {
  try {
    const res = await fetch(location.href, { credentials: 'omit' });
    const html = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const ogTags = {};
    const twitterTags = {};
    const dupes = [];

    const collect = (el, map, key) => {
      const content = el.getAttribute('content');
      if (!key || !content) return;
      if (key in map) { if (!dupes.includes(key)) dupes.push(key); return; }
      map[key] = content;
    };

    doc.querySelectorAll('meta[property^="og:"]').forEach((el) => {
      collect(el, ogTags, el.getAttribute('property'));
    });

    doc.querySelectorAll('meta[name^="twitter:"], meta[property^="twitter:"]').forEach((el) => {
      collect(el, twitterTags, el.getAttribute('name') || el.getAttribute('property'));
    });

    // Fallbacks that crawlers use when OG tags are missing
    const titleEl = doc.querySelector('title');
    const title = titleEl ? titleEl.textContent : '';

    const descMeta = doc.querySelector('meta[name="description"]');
    const description = descMeta ? descMeta.getAttribute('content') : '';

    const faviconEl = doc.querySelector('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]');
    const favicon = faviconEl ? faviconEl.getAttribute('href') : '';

    return { ogTags, twitterTags, title, description, favicon, dupes };
  } catch {
    return null;
  }
}

// --- Validation ---

function validate(data) {
  const warnings = [];
  const errors = [];
  const passes = [];
  const { ogTags, twitterTags } = data;

  // Duplicate singular tags — crawlers keep the first and ignore the rest.
  // og:image/video/audio may legitimately repeat, so they're exempt.
  (data.dupes || []).forEach((tag) => {
    if (/^og:(image|video|audio)/.test(tag) || tag === 'article:tag') return;
    warnings.push(`Duplicate ${tag} — crawlers use the first; the rest are ignored`);
  });

  // Required OG tags
  if (!ogTags['og:title']) {
    errors.push('Missing og:title');
  } else {
    passes.push('og:title is set');
    if (ogTags['og:title'].length > 60) {
      warnings.push(`og:title is ${ogTags['og:title'].length} chars — most platforms truncate around 60`);
    }
  }

  if (!ogTags['og:description']) errors.push('Missing og:description');
  else if (ogTags['og:description'].length > 200) warnings.push(`og:description is ${ogTags['og:description'].length} chars (recommended: under 200)`);
  else passes.push('og:description is set');

  if (!ogTags['og:image']) {
    errors.push('Missing og:image — link previews will have no thumbnail');
  } else {
    passes.push('og:image is set');
    try {
      const imgUrl = new URL(ogTags['og:image']); // no base — throws if relative
      if (imgUrl.protocol !== 'http:' && imgUrl.protocol !== 'https:') {
        warnings.push(`og:image uses an unsupported "${imgUrl.protocol}" URL — crawlers need an http(s) image`);
      } else if (imgUrl.protocol === 'http:') {
        warnings.push('og:image is served over http — some platforms require https');
      }
    } catch {
      warnings.push('og:image is not an absolute URL — crawlers require a full https:// URL');
    }

    // Structured image hints (declared dimensions, alt text)
    const w = parseInt(ogTags['og:image:width'], 10);
    const h = parseInt(ogTags['og:image:height'], 10);
    if (!ogTags['og:image:width'] || !ogTags['og:image:height']) {
      warnings.push('Add og:image:width and og:image:height — crawlers render faster and avoid layout shifts');
    } else if (w < 600 || h < 315) {
      warnings.push(`og:image is small (${w}×${h}) — recommended size is 1200×630`);
    } else {
      passes.push(`og:image dimensions declared (${w}×${h})`);
    }
    if (!ogTags['og:image:alt']) {
      warnings.push('Add og:image:alt — screen readers use it to describe the preview image');
    }

    // Secure URL + declared MIME type
    const secure = ogTags['og:image:secure_url'];
    if (/^http:\/\//i.test(ogTags['og:image']) && !secure) {
      warnings.push('og:image is http — add og:image:secure_url with an https URL for platforms that require it');
    }
    if (secure && !/^https:\/\//i.test(secure)) {
      warnings.push('og:image:secure_url should be an https:// URL');
    }
    if (ogTags['og:image:type'] && !/^image\//i.test(ogTags['og:image:type'])) {
      warnings.push(`og:image:type "${ogTags['og:image:type']}" should be an image/* MIME type`);
    }
  }

  // Twitter large card needs a wide enough image
  if (twitterTags['twitter:card'] === 'summary_large_image') {
    const cw = parseInt(ogTags['og:image:width'] || twitterTags['twitter:image:width'], 10);
    if (cw && cw < 300) {
      warnings.push(`summary_large_image needs a wide image — declared ${cw}px, Twitter wants ≥300px (ideally ≥600px)`);
    }
  }

  if (!ogTags['og:url']) {
    warnings.push('Missing og:url — should be the canonical URL');
  } else {
    passes.push('og:url is set');
    // Canonical mismatch: og:url vs the page's actual URL (normalized)
    const norm = (u) => {
      try { const x = new URL(u, data.url); return (x.origin + x.pathname).replace(/\/$/, ''); }
      catch { return null; }
    };
    const a = norm(ogTags['og:url']);
    const b = data.url ? norm(data.url) : null;
    if (a && b && a !== b) {
      warnings.push(`og:url points to ${ogTags['og:url']} — differs from this page; crawlers will attribute shares to that URL`);
    }
  }

  const ogType = ogTags['og:type'];
  if (!ogType) {
    warnings.push('Missing og:type — defaults to "website"');
  } else {
    passes.push('og:type is set');
    // Type-specific required tags
    if (ogType === 'article' && !ogTags['article:published_time']) {
      warnings.push('og:type is "article" but article:published_time is missing');
    }
    if (ogType.startsWith('product') && !ogTags['product:price:amount']) {
      warnings.push('og:type is "product" but product:price:amount is missing');
    }
  }

  // og:locale should be language_TERRITORY (e.g. en_US)
  if (ogTags['og:locale'] && !/^[a-z]{2,3}_[A-Z]{2}$/.test(ogTags['og:locale'])) {
    warnings.push(`og:locale "${ogTags['og:locale']}" should look like "en_US" (language_TERRITORY)`);
  }

  // Twitter tags
  const validCards = ['summary', 'summary_large_image', 'app', 'player'];
  if (!twitterTags['twitter:card']) {
    warnings.push('Missing twitter:card — Twitter won\'t show a rich preview');
  } else if (!validCards.includes(twitterTags['twitter:card'])) {
    warnings.push(`twitter:card "${twitterTags['twitter:card']}" isn't valid — use one of: ${validCards.join(', ')}`);
  } else {
    passes.push('twitter:card is set');
  }

  if (!twitterTags['twitter:title'] && !ogTags['og:title']) {
    warnings.push('Missing twitter:title (no og:title fallback either)');
  }

  if (!twitterTags['twitter:image'] && !ogTags['og:image']) {
    warnings.push('Missing twitter:image (no og:image fallback either)');
  }

  return { errors, warnings, passes };
}

// --- SSR Check ---

function checkSSR(domData, rawData) {
  const issues = [];
  if (!rawData) return issues;

  const criticalTags = ['og:title', 'og:description', 'og:image', 'og:url'];
  const criticalTwitter = ['twitter:card', 'twitter:title', 'twitter:image'];

  // A tag is an SSR problem if the rendered DOM has it but the server HTML
  // either lacks it (injected client-side) or has a *different* value (rewritten
  // client-side). Either way, the crawler sees something other than the user.
  const flag = (domMap, rawMap, tag) => {
    const inDom = domMap[tag];
    if (!inDom) return;
    const inRaw = rawMap[tag];
    if (!inRaw || inDom.trim() !== inRaw.trim()) issues.push(tag);
  };

  for (const tag of criticalTags) flag(domData.ogTags, rawData.ogTags, tag);
  for (const tag of criticalTwitter) flag(domData.twitterTags, rawData.twitterTags, tag);

  return issues;
}

function renderSSRWarning(container, issues) {
  container.style.display = 'block';
  const tagList = issues.map((t) => `<strong>${escapeHtml(t)}</strong>`).join(', ');
  container.innerHTML = `
    <div class="ssr-icon">&#x26A0;</div>
    <div class="ssr-text">
      <strong>Client-side rendering detected</strong><br/>
      ${tagList} ${issues.length === 1 ? 'is' : 'are'} missing from (or differ in) the server HTML, so social crawlers (Facebook, Twitter, WhatsApp, etc.) will <em>see different content</em> than your browser. Render these server-side to ensure previews are correct.
    </div>
  `;
}

// --- Rendering ---

function resolveImage(src, baseUrl) {
  if (!src) return '';
  try { return new URL(src, baseUrl).href; } catch { return src; }
}

// Resolves an image URL and allows only http(s). This blocks data:/javascript:
// and other schemes from ever reaching an <img> src — both defense-in-depth
// (no injection via opaque-scheme values) and correctness (crawlers ignore
// non-http(s) images anyway).
function safeImageUrl(src, baseUrl) {
  const resolved = resolveImage(src, baseUrl);
  if (!resolved) return '';
  try {
    const u = new URL(resolved, baseUrl);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '';
  } catch {
    return '';
  }
}

// --- Safe DOM builders ---
// Building nodes (instead of innerHTML strings) keeps every page-controlled
// value as text/attribute data, so there is nothing to escape and no way for
// a crafted meta tag to break out of its context.
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function imageBox(className, src) {
  const box = el('div', className);
  const img = document.createElement('img');
  img.alt = '';
  // A broken image would show a broken-icon; crawlers that can't fetch it show
  // no thumbnail, so mirror that by removing the box on load failure.
  img.addEventListener('error', () => box.remove());
  img.src = src; // property assignment — no HTML quoting involved
  box.appendChild(img);
  return box;
}

function renderTagList(container, tags, commonKeys, colorClass) {
  const allKeys = [
    ...commonKeys,
    ...Object.keys(tags).filter((k) => !commonKeys.includes(k)),
  ];

  allKeys.forEach((key) => {
    const row = document.createElement('div');
    row.className = 'tag-row';

    const name = document.createElement('span');
    name.className = `tag-name ${colorClass}`;
    name.textContent = key;

    const value = document.createElement('span');
    value.className = 'tag-value';

    if (tags[key]) {
      value.textContent = tags[key];
    } else {
      value.textContent = 'not set';
      value.classList.add('missing');
    }

    row.appendChild(name);
    row.appendChild(value);
    container.appendChild(row);
  });
}

function validationRow(kind, icon, msg) {
  const row = el('div', `validation-item validation-${kind}`);
  row.append(el('span', 'validation-icon', icon), el('span', null, msg));
  return row;
}

// Show only problems by default; passes stay collapsed behind a count.
function renderValidation(container, results) {
  container.replaceChildren();
  results.errors.forEach((m) => container.appendChild(validationRow('error', '✘', m)));
  results.warnings.forEach((m) => container.appendChild(validationRow('warn', '⚠', m)));
  if (!results.errors.length && !results.warnings.length) {
    container.appendChild(validationRow('pass', '✔', 'No problems found'));
  }
}

function renderPasses(passes) {
  const toggle = document.getElementById('passes-toggle');
  const list = document.getElementById('passes-list');
  if (!passes.length) {
    toggle.style.display = 'none';
    list.style.display = 'none';
    return;
  }
  const label = `${passes.length} check${passes.length > 1 ? 's' : ''} passed`;
  list.replaceChildren(...passes.map((m) => validationRow('pass', '✔', m)));
  list.style.display = 'none';
  toggle.style.display = 'block';
  toggle.textContent = `▸ ${label}`;
  toggle.onclick = () => {
    const open = list.style.display === 'none';
    list.style.display = open ? 'block' : 'none';
    toggle.textContent = `${open ? '▾' : '▸'} ${label}`;
  };
}

function renderVerdict(results) {
  const v = document.getElementById('verdict');
  const e = results.errors.length;
  const w = results.warnings.length;
  let kind, icon, text;
  if (e) {
    kind = 'err'; icon = '✘';
    text = `${e} error${e > 1 ? 's' : ''}${w ? `, ${w} warning${w > 1 ? 's' : ''}` : ''}`;
  } else if (w) {
    kind = 'warn'; icon = '⚠';
    text = `${w} warning${w > 1 ? 's' : ''}`;
  } else {
    kind = 'ok'; icon = '✔';
    text = 'All good';
  }
  v.className = `verdict ${kind}`;
  v.replaceChildren(el('span', 'verdict-icon', icon), el('span', null, text));
}

// Escapes for BOTH text and attribute contexts (the DOM-text round-trip
// previously used here did not escape quotes, so it was unsafe in attributes).
function escapeHtml(str) {
  return String(str).replace(/[&<>"'`]/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '`': '&#96;',
  })[c]);
}

function renderSocialPreviews(data) {
  const image = safeImageUrl(data.ogTags['og:image'] || data.twitterTags['twitter:image'], data.url)
    || safeImageUrl(data.favicon, data.url);
  const title = data.ogTags['og:title'] || data.twitterTags['twitter:title'] || data.title;
  const desc = data.ogTags['og:description'] || data.twitterTags['twitter:description'] || data.description;
  const siteName = data.siteName;
  let hostname;
  try { hostname = new URL(data.url).hostname; } catch { hostname = data.url; }

  // Facebook
  const fbBody = el('div', 'sp-fb-body');
  fbBody.append(
    el('div', 'sp-fb-site', hostname),
    el('div', 'sp-fb-title', title),
    el('div', 'sp-fb-desc', desc),
  );
  document.getElementById('panel-facebook').replaceChildren(
    ...(image ? [imageBox('sp-fb-image', image)] : []),
    fbBody,
  );

  // Twitter/X
  const twitterCard = data.twitterTags['twitter:card'] || 'summary';
  const tw = document.getElementById('panel-x');
  const twTitle = data.twitterTags['twitter:title'] || title;
  const twDesc = data.twitterTags['twitter:description'] || desc;

  if (twitterCard === 'summary_large_image') {
    const body = el('div', 'sp-tw-body');
    body.append(
      el('div', 'sp-tw-title', twTitle),
      el('div', 'sp-tw-desc', twDesc),
      el('div', 'sp-tw-site', hostname),
    );
    tw.replaceChildren(
      ...(image ? [imageBox('sp-tw-large-image', image)] : []),
      body,
    );
  } else {
    const body = el('div', 'sp-tw-body');
    body.append(
      el('div', 'sp-tw-site', hostname),
      el('div', 'sp-tw-title', twTitle),
      el('div', 'sp-tw-desc', twDesc),
    );
    const summary = el('div', 'sp-tw-summary');
    summary.append(...(image ? [imageBox('sp-tw-thumb', image)] : []), body);
    tw.replaceChildren(summary);
  }

  // LinkedIn
  const liBody = el('div', 'sp-li-body');
  liBody.append(
    el('div', 'sp-li-title', title),
    el('div', 'sp-li-site', hostname),
  );
  document.getElementById('panel-linkedin').replaceChildren(
    ...(image ? [imageBox('sp-li-image', image)] : []),
    liBody,
  );

  // Slack
  const slBar = el('div', 'sp-sl-bar');
  slBar.append(
    el('div', 'sp-sl-site', siteName),
    el('div', 'sp-sl-title', title),
    el('div', 'sp-sl-desc', desc),
  );
  if (image) slBar.append(imageBox('sp-sl-image', image));
  document.getElementById('panel-slack').replaceChildren(slBar);

  // WhatsApp
  const domain = el('div', 'sp-wa-domain');
  domain.append(el('span', 'sp-wa-domain-icon', '\u{1F310}'), document.createTextNode(hostname));
  const waBody = el('div', 'sp-wa-body');
  waBody.append(el('div', 'sp-wa-title', title), el('div', 'sp-wa-desc', desc), domain);
  const card = el('div', 'sp-wa-link-card');
  if (image) card.append(imageBox('sp-wa-image', image));
  card.append(waBody);
  const bubble = el('div', 'sp-wa-bubble');
  bubble.append(card, el('div', 'sp-wa-url', data.url));
  document.getElementById('panel-whatsapp').replaceChildren(bubble);
}

// --- JSON-LD / structured data ---

// Walks an LD object (handling @graph and @type arrays) to gather schema types.
function collectTypes(node, types = new Set()) {
  if (!node || typeof node !== 'object') return types;
  if (Array.isArray(node)) { node.forEach((n) => collectTypes(n, types)); return types; }
  if (node['@type']) [].concat(node['@type']).forEach((t) => types.add(t));
  if (node['@graph']) collectTypes(node['@graph'], types);
  return types;
}

function renderJsonLd(blocks) {
  const section = document.getElementById('jsonld-section');
  const list = document.getElementById('jsonld-list');
  const countEl = document.getElementById('jsonld-count');

  if (!blocks || blocks.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  const invalid = blocks.filter((b) => !b.valid).length;
  countEl.textContent = invalid
    ? `${invalid} invalid`
    : `${blocks.length} block${blocks.length > 1 ? 's' : ''}`;
  countEl.className = `score-badge ${invalid ? 'score-error' : 'score-pass'}`;

  list.replaceChildren(...blocks.map((b) => {
    const wrap = el('div', 'jsonld-block');
    if (b.valid) {
      const types = [...collectTypes(b.json)];
      (types.length ? types : ['{ }']).forEach((t) => wrap.append(el('span', 'jsonld-type', t)));
      wrap.append(el('pre', 'jsonld-json', JSON.stringify(b.json, null, 2)));
    } else {
      wrap.append(el('span', 'jsonld-type invalid', 'Invalid JSON-LD'));
      wrap.append(el('pre', 'jsonld-json', b.text || ''));
    }
    return wrap;
  }));
}

// --- Image health ---

// Loads the og:image to report its real pixel size and catch broken URLs.
// (File size isn't available without a cross-origin fetch / host permission.)
function checkImageHealth(url, declaredW, declaredH) {
  const statusEl = document.getElementById('og-image-status');
  if (!url) { statusEl.style.display = 'none'; return; }

  statusEl.style.display = 'flex';
  statusEl.className = 'og-image-status';
  statusEl.textContent = 'Checking image…';

  const probe = new Image();
  probe.onload = () => {
    const w = probe.naturalWidth;
    const h = probe.naturalHeight;
    const ratio = h ? (w / h).toFixed(2) : '?';
    let cls = 'ok';
    let icon = '✔';
    let note = '';

    if (w < 200 || h < 200) {
      cls = 'err'; icon = '✘'; note = ' — too small for previews';
    } else if (w < 600 || h < 315) {
      cls = 'warn'; icon = '⚠'; note = ' — below recommended 1200×630';
    }

    if (declaredW && declaredH && (Math.abs(declaredW - w) > 1 || Math.abs(declaredH - h) > 1)) {
      note += ` · declared ${declaredW}×${declaredH}`;
      if (cls === 'ok') { cls = 'warn'; icon = '⚠'; }
    }

    statusEl.className = `og-image-status ${cls}`;
    statusEl.textContent = `${icon} ${w}×${h} · ${ratio}:1${note}`;
  };
  probe.onerror = () => {
    statusEl.className = 'og-image-status err';
    statusEl.textContent = '✘ og:image failed to load — broken or unreachable URL';
  };
  probe.src = url;
}

// --- Debugger deep-links ---

// Crawlers cache aggressively, so devs constantly need the official tools to
// force a re-scrape. These open pre-filled with the current URL.
function renderDebuggers(url) {
  const enc = encodeURIComponent(url);
  const targets = [
    { label: 'Facebook', color: '#1877f2', url: `https://developers.facebook.com/tools/debug/?q=${enc}` },
    { label: 'LinkedIn', color: '#0a66c2', url: `https://www.linkedin.com/post-inspector/inspect/${enc}` },
    { label: 'Google Rich Results', color: '#34a853', url: `https://search.google.com/test/rich-results?url=${enc}` },
  ];
  const row = document.getElementById('debugger-row');
  row.replaceChildren(...targets.map((t) => {
    const btn = el('button', 'debugger-btn');
    btn.type = 'button';
    btn.title = `Open the ${t.label} tool for this URL`;
    const dot = el('span', 'debugger-dot');
    dot.style.background = t.color;
    btn.append(dot, document.createTextNode(t.label));
    btn.addEventListener('click', () => chrome.tabs.create({ url: t.url }));
    return btn;
  }));
}

// --- Tabs ---

function initTabs() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const group = tab.closest('.tabs-container');
      group.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      group.nextElementSibling.querySelectorAll('.tab-panel').forEach((p) => {
        p.style.display = p.id === target ? 'block' : 'none';
      });
    });
  });
}

// --- Restricted pages ---

// Extensions can't read browser-internal pages or the Web Store. Detect these
// up front so we can show a friendly message instead of a raw API error.
function restrictedPageReason(url) {
  const blockedSchemes = [
    'chrome:', 'chrome-extension:', 'chrome-search:', 'chrome-untrusted:',
    'edge:', 'brave:', 'about:', 'devtools:', 'view-source:', 'moz-extension:',
  ];
  try {
    const u = new URL(url);
    if (blockedSchemes.includes(u.protocol)) {
      return `This is a browser-internal page (${u.protocol}//…), which extensions can't read. Open OG Preview on a normal website.`;
    }
    if (u.hostname === 'chromewebstore.google.com'
      || (u.hostname === 'chrome.google.com' && u.pathname.startsWith('/webstore'))) {
      return "The Chrome Web Store blocks extensions from reading its pages. Open OG Preview on a normal website.";
    }
  } catch {
    return "This page can't be inspected. Open OG Preview on a normal website.";
  }
  return null;
}

// --- Init ---

async function init() {
  const loadingEl = document.getElementById('loading');
  const errorEl = document.getElementById('error');
  const cardEl = document.getElementById('preview-card');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const reason = restrictedPageReason(tab.url);
    if (reason) {
      loadingEl.style.display = 'none';
      errorEl.textContent = reason;
      errorEl.style.display = 'block';
      return;
    }

    // Extract tags from the live DOM (post-JS)
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractMetaTags,
    });

    // Extract tags from the raw HTML (pre-JS) — what crawlers see
    const [rawResult] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractRawMetaTags,
    });

    loadingEl.style.display = 'none';
    const data = result.result;
    const rawData = rawResult.result;

    // SSR check — compare raw HTML tags vs live DOM tags
    const ssrIssues = checkSSR(data, rawData);
    const hasSSRIssues = ssrIssues.length > 0;
    if (hasSSRIssues) {
      renderSSRWarning(document.getElementById('ssr-warning'), ssrIssues);
    }

    // Use raw server data for validation and previews when CSR-only tags detected
    // This shows what crawlers will actually see — with crawler-like fallbacks
    let effectiveData = data;
    if (hasSSRIssues && rawData) {
      const faviconUrl = rawData.favicon ? resolveImage(rawData.favicon, data.url) : '';
      let host;
      try { host = new URL(data.url).hostname; } catch { host = ''; }
      effectiveData = {
        ogTags: rawData.ogTags,
        twitterTags: rawData.twitterTags,
        title: rawData.ogTags['og:title'] || rawData.title || '',
        description: rawData.ogTags['og:description'] || rawData.description || '',
        siteName: rawData.ogTags['og:site_name'] || host,
        favicon: faviconUrl,
        dupes: rawData.dupes || [],
        url: data.url,
      };
    }

    // Render preview card using effective data
    const ogImg = safeImageUrl(effectiveData.ogTags['og:image'], data.url);
    const image = ogImg || safeImageUrl(effectiveData.favicon, data.url);
    const imgEl = document.getElementById('og-image');
    if (image) {
      imgEl.alt = '';
      imgEl.onerror = () => { imgEl.style.display = 'none'; };
      imgEl.src = image;
      imgEl.style.display = 'block';
    } else {
      imgEl.style.display = 'none';
    }

    // Image health — real dimensions + broken-URL detection for og:image
    checkImageHealth(
      ogImg,
      parseInt(effectiveData.ogTags['og:image:width'], 10),
      parseInt(effectiveData.ogTags['og:image:height'], 10),
    );

    document.getElementById('og-title').textContent = effectiveData.title;
    document.getElementById('og-description').textContent = effectiveData.description;
    document.getElementById('og-url').textContent = data.url;

    // OG tag list — show what crawlers will actually see
    renderTagList(
      document.getElementById('og-tags-list'),
      effectiveData.ogTags,
      ['og:title', 'og:description', 'og:image', 'og:url', 'og:type', 'og:site_name', 'og:locale'],
      'tag-og'
    );

    // Twitter tag list
    renderTagList(
      document.getElementById('twitter-tags-list'),
      effectiveData.twitterTags,
      ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image', 'twitter:site', 'twitter:creator'],
      'tag-twitter'
    );

    // Validation — validate what crawlers will actually see
    const validationResults = validate(effectiveData);
    renderValidation(document.getElementById('validation-list'), validationResults);
    renderPasses(validationResults.passes);
    renderVerdict(validationResults);

    // Social previews — show what crawlers will actually see
    renderSocialPreviews(effectiveData);

    // Structured data — from the live DOM (Googlebot renders JS)
    renderJsonLd(data.jsonLd);

    // Official re-scrape / validation tools for this URL
    renderDebuggers(data.url);

    // Init tabs
    initTabs();

    cardEl.style.display = 'block';
  } catch (err) {
    loadingEl.style.display = 'none';
    const blocked = /cannot access|extensions gallery|chrome:\/\//i.test(err.message || '');
    errorEl.textContent = blocked
      ? "This page can't be inspected — it may be a protected or browser-internal page. Open OG Preview on a normal website."
      : `Error: ${err.message}`;
    errorEl.style.display = 'block';
    console.error('OG Preview error:', err);
  }
}

init();
