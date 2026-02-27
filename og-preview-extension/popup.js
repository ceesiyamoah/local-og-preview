function extractMetaTags() {
  const ogTags = {};
  const twitterTags = {};

  document.querySelectorAll('meta[property^="og:"]').forEach((el) => {
    const property = el.getAttribute('property');
    const content = el.getAttribute('content');
    if (property && content) ogTags[property] = content;
  });

  document.querySelectorAll('meta[name^="twitter:"], meta[property^="twitter:"]').forEach((el) => {
    const name = el.getAttribute('name') || el.getAttribute('property');
    const content = el.getAttribute('content');
    if (name && content) twitterTags[name] = content;
  });

  const descMeta = document.querySelector('meta[name="description"]');
  const title = ogTags['og:title'] || document.title || '';
  const description = ogTags['og:description'] || (descMeta ? descMeta.getAttribute('content') : '') || '';
  const siteName = ogTags['og:site_name'] || location.hostname;

  return { ogTags, twitterTags, title, description, siteName, url: location.href };
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

    doc.querySelectorAll('meta[property^="og:"]').forEach((el) => {
      const property = el.getAttribute('property');
      const content = el.getAttribute('content');
      if (property && content) ogTags[property] = content;
    });

    doc.querySelectorAll('meta[name^="twitter:"], meta[property^="twitter:"]').forEach((el) => {
      const name = el.getAttribute('name') || el.getAttribute('property');
      const content = el.getAttribute('content');
      if (name && content) twitterTags[name] = content;
    });

    // Fallbacks that crawlers use when OG tags are missing
    const titleEl = doc.querySelector('title');
    const title = titleEl ? titleEl.textContent : '';

    const descMeta = doc.querySelector('meta[name="description"]');
    const description = descMeta ? descMeta.getAttribute('content') : '';

    const faviconEl = doc.querySelector('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]');
    const favicon = faviconEl ? faviconEl.getAttribute('href') : '';

    return { ogTags, twitterTags, title, description, favicon };
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

  // Required OG tags
  if (!ogTags['og:title']) errors.push('Missing og:title');
  else passes.push('og:title is set');

  if (!ogTags['og:description']) errors.push('Missing og:description');
  else if (ogTags['og:description'].length > 200) warnings.push(`og:description is ${ogTags['og:description'].length} chars (recommended: under 200)`);
  else passes.push('og:description is set');

  if (!ogTags['og:image']) errors.push('Missing og:image — link previews will have no thumbnail');
  else passes.push('og:image is set');

  if (!ogTags['og:url']) warnings.push('Missing og:url — should be the canonical URL');
  else passes.push('og:url is set');

  if (!ogTags['og:type']) warnings.push('Missing og:type — defaults to "website"');
  else passes.push('og:type is set');

  // Twitter tags
  if (!twitterTags['twitter:card']) warnings.push('Missing twitter:card — Twitter won\'t show a rich preview');
  else passes.push('twitter:card is set');

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

  for (const tag of criticalTags) {
    if (domData.ogTags[tag] && !rawData.ogTags[tag]) {
      issues.push(tag);
    }
  }

  for (const tag of criticalTwitter) {
    if (domData.twitterTags[tag] && !rawData.twitterTags[tag]) {
      issues.push(tag);
    }
  }

  return issues;
}

function renderSSRWarning(container, issues) {
  container.style.display = 'block';
  const tagList = issues.map((t) => `<strong>${escapeHtml(t)}</strong>`).join(', ');
  container.innerHTML = `
    <div class="ssr-icon">&#x26A0;</div>
    <div class="ssr-text">
      <strong>Client-side only tags detected</strong><br/>
      ${tagList} ${issues.length === 1 ? 'is' : 'are'} injected by JavaScript and <em>won't be visible</em> to social media crawlers (Facebook, Twitter, WhatsApp, etc.). Use server-side rendering to ensure previews work.
    </div>
  `;
}

// --- Rendering ---

function resolveImage(src, baseUrl) {
  if (!src) return '';
  try { return new URL(src, baseUrl).href; } catch { return src; }
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

function renderValidation(container, results) {
  container.innerHTML = '';

  results.errors.forEach((msg) => {
    const el = document.createElement('div');
    el.className = 'validation-item validation-error';
    el.innerHTML = `<span class="validation-icon">&#x2718;</span> ${escapeHtml(msg)}`;
    container.appendChild(el);
  });

  results.warnings.forEach((msg) => {
    const el = document.createElement('div');
    el.className = 'validation-item validation-warn';
    el.innerHTML = `<span class="validation-icon">&#x26A0;</span> ${escapeHtml(msg)}`;
    container.appendChild(el);
  });

  results.passes.forEach((msg) => {
    const el = document.createElement('div');
    el.className = 'validation-item validation-pass';
    el.innerHTML = `<span class="validation-icon">&#x2714;</span> ${escapeHtml(msg)}`;
    container.appendChild(el);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderSocialPreviews(data) {
  const ogImage = resolveImage(data.ogTags['og:image'] || data.twitterTags['twitter:image'], data.url);
  const favicon = data.favicon || '';
  const image = ogImage || favicon;
  const title = data.ogTags['og:title'] || data.twitterTags['twitter:title'] || data.title;
  const desc = data.ogTags['og:description'] || data.twitterTags['twitter:description'] || data.description;
  const siteName = data.siteName;
  let hostname;
  try { hostname = new URL(data.url).hostname; } catch { hostname = data.url; }

  // Facebook
  const fb = document.getElementById('panel-facebook');
  fb.innerHTML = `
    ${image ? `<div class="sp-fb-image"><img src="${escapeHtml(image)}" /></div>` : ''}
    <div class="sp-fb-body">
      <div class="sp-fb-site">${escapeHtml(hostname)}</div>
      <div class="sp-fb-title">${escapeHtml(title)}</div>
      <div class="sp-fb-desc">${escapeHtml(desc)}</div>
    </div>
  `;

  // Twitter/X
  const twitterCard = data.twitterTags['twitter:card'] || 'summary';
  const tw = document.getElementById('panel-x');
  const twTitle = data.twitterTags['twitter:title'] || title;
  const twDesc = data.twitterTags['twitter:description'] || desc;

  if (twitterCard === 'summary_large_image') {
    tw.innerHTML = `
      ${image ? `<div class="sp-tw-large-image"><img src="${escapeHtml(image)}" /></div>` : ''}
      <div class="sp-tw-body">
        <div class="sp-tw-title">${escapeHtml(twTitle)}</div>
        <div class="sp-tw-desc">${escapeHtml(twDesc)}</div>
        <div class="sp-tw-site">${escapeHtml(hostname)}</div>
      </div>
    `;
  } else {
    tw.innerHTML = `
      <div class="sp-tw-summary">
        ${image ? `<div class="sp-tw-thumb"><img src="${escapeHtml(image)}" /></div>` : ''}
        <div class="sp-tw-body">
          <div class="sp-tw-site">${escapeHtml(hostname)}</div>
          <div class="sp-tw-title">${escapeHtml(twTitle)}</div>
          <div class="sp-tw-desc">${escapeHtml(twDesc)}</div>
        </div>
      </div>
    `;
  }

  // LinkedIn
  const li = document.getElementById('panel-linkedin');
  li.innerHTML = `
    ${image ? `<div class="sp-li-image"><img src="${escapeHtml(image)}" /></div>` : ''}
    <div class="sp-li-body">
      <div class="sp-li-title">${escapeHtml(title)}</div>
      <div class="sp-li-site">${escapeHtml(hostname)}</div>
    </div>
  `;

  // Slack
  const sl = document.getElementById('panel-slack');
  sl.innerHTML = `
    <div class="sp-sl-bar">
      <div class="sp-sl-site">${escapeHtml(siteName)}</div>
      <div class="sp-sl-title">${escapeHtml(title)}</div>
      <div class="sp-sl-desc">${escapeHtml(desc)}</div>
      ${image ? `<div class="sp-sl-image"><img src="${escapeHtml(image)}" /></div>` : ''}
    </div>
  `;

  // WhatsApp
  const wa = document.getElementById('panel-whatsapp');
  wa.innerHTML = `
    <div class="sp-wa-bubble">
      <div class="sp-wa-link-card">
        ${image ? `<div class="sp-wa-image"><img src="${escapeHtml(image)}" /></div>` : ''}
        <div class="sp-wa-body">
          <div class="sp-wa-title">${escapeHtml(title)}</div>
          <div class="sp-wa-desc">${escapeHtml(desc)}</div>
          <div class="sp-wa-domain">
            <span class="sp-wa-domain-icon">&#x1F310;</span>
            ${escapeHtml(hostname)}
          </div>
        </div>
      </div>
      <div class="sp-wa-url">${escapeHtml(data.url)}</div>
    </div>
  `;
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

// --- Init ---

async function init() {
  const loadingEl = document.getElementById('loading');
  const errorEl = document.getElementById('error');
  const cardEl = document.getElementById('preview-card');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

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
      effectiveData = {
        ogTags: rawData.ogTags,
        twitterTags: rawData.twitterTags,
        title: rawData.ogTags['og:title'] || rawData.title || '',
        description: rawData.ogTags['og:description'] || rawData.description || '',
        siteName: rawData.ogTags['og:site_name'] || '',
        favicon: faviconUrl,
        url: data.url,
      };
    }

    // Render preview card using effective data
    const image = resolveImage(effectiveData.ogTags['og:image'], data.url) || effectiveData.favicon || '';
    const imgEl = document.getElementById('og-image');
    if (image) {
      imgEl.src = image;
      imgEl.style.display = 'block';
    } else {
      imgEl.style.display = 'none';
    }

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

    // Score badge
    const scoreEl = document.getElementById('validation-score');
    if (validationResults.errors.length > 0) {
      scoreEl.textContent = `${validationResults.errors.length} error${validationResults.errors.length > 1 ? 's' : ''}`;
      scoreEl.className = 'score-badge score-error';
    } else if (validationResults.warnings.length > 0) {
      scoreEl.textContent = `${validationResults.warnings.length} warning${validationResults.warnings.length > 1 ? 's' : ''}`;
      scoreEl.className = 'score-badge score-warn';
    } else {
      scoreEl.textContent = 'All good';
      scoreEl.className = 'score-badge score-pass';
    }

    // Social previews — show what crawlers will actually see
    renderSocialPreviews(effectiveData);

    // Init tabs
    initTabs();

    cardEl.style.display = 'block';
  } catch (err) {
    loadingEl.style.display = 'none';
    errorEl.textContent = `Error: ${err.message}`;
    errorEl.style.display = 'block';
    console.error('OG Preview error:', err);
  }
}

init();
