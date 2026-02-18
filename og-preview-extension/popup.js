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
  const image = resolveImage(data.ogTags['og:image'] || data.twitterTags['twitter:image'], data.url);
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

    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractMetaTags,
    });

    loadingEl.style.display = 'none';
    const data = result.result;

    const image = resolveImage(data.ogTags['og:image'], data.url);

    // Render preview card
    const imgEl = document.getElementById('og-image');
    if (image) {
      imgEl.src = image;
      imgEl.style.display = 'block';
    } else {
      imgEl.style.display = 'none';
    }

    document.getElementById('og-title').textContent = data.title;
    document.getElementById('og-description').textContent = data.description;
    document.getElementById('og-url').textContent = data.url;

    // OG tag list
    renderTagList(
      document.getElementById('og-tags-list'),
      data.ogTags,
      ['og:title', 'og:description', 'og:image', 'og:url', 'og:type', 'og:site_name', 'og:locale'],
      'tag-og'
    );

    // Twitter tag list
    renderTagList(
      document.getElementById('twitter-tags-list'),
      data.twitterTags,
      ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image', 'twitter:site', 'twitter:creator'],
      'tag-twitter'
    );

    // Validation
    const validationResults = validate(data);
    renderValidation(document.getElementById('validation-list'), validationResults);

    // Score badge
    const total = validationResults.errors.length + validationResults.warnings.length + validationResults.passes.length;
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

    // Social previews
    renderSocialPreviews(data);

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
