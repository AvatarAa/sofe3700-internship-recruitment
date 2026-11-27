const $ = (selector) => document.querySelector(selector);
const form = $('#external-search-form');
const message = $('#external-search-message');
const results = $('#external-job-results');
const savedButton = $('#load-saved-search');
const storageKey = 'internshipRecruitment.lastExternalJobSearchId';

async function api(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}
function showMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle('error', isError);
}
function safeExternalUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; }
  catch { return null; }
}
function formatSalary(min, max) {
  if (min == null && max == null) return '';
  const money = (value) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(Number(value));
  if (min != null && max != null) return `${money(min)}–${money(max)} (salary listed by source)`;
  return `${money(min ?? max)} (salary listed by source)`;
}
function render(data) {
  results.replaceChildren();
  const rows = Array.isArray(data.rows) ? data.rows : [];
  for (const job of rows) {
    const card = document.createElement('article');
    card.className = 'job-card external-job-card';
    const title = document.createElement('h3'); title.textContent = job.title || 'Job listing'; card.append(title);
    if (job.company_name) { const company = document.createElement('div'); company.className = 'company'; company.textContent = job.company_name; card.append(company); }
    if (job.description) { const description = document.createElement('p'); description.textContent = job.description; card.append(description); }
    const details = [job.location, job.category, formatSalary(job.salary_min, job.salary_max)].filter(Boolean);
    if (details.length) { const meta = document.createElement('div'); meta.className = 'job-meta'; meta.textContent = details.join(' · '); card.append(meta); }
    if (job.published_at) { const published = document.createElement('div'); published.className = 'job-meta'; const date = new Date(job.published_at); if (!Number.isNaN(date.valueOf())) published.textContent = `Listed ${date.toLocaleDateString()}`; card.append(published); }
    const url = safeExternalUrl(job.redirect_url);
    if (url) { const link = document.createElement('a'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Apply on source site'; card.append(link); }
    const attribution = document.createElement('div'); attribution.className = 'small-print'; attribution.append('Listing via ');
    const source = document.createElement('a'); source.className = 'adzuna-label'; source.href = 'https://www.adzuna.ca/'; source.target = '_blank'; source.rel = 'noopener noreferrer'; source.textContent = 'Adzuna'; attribution.append(source); card.append(attribution);
    results.append(card);
  }
  const search = data.search || {};
  if (search.search_id) {
    localStorage.setItem(storageKey, String(search.search_id));
    savedButton.hidden = false;
    form.elements.keyword.value = search.keyword || '';
    form.elements.location.value = search.location || '';
  }
  showMessage(`${rows.length} external job${rows.length === 1 ? '' : 's'} found for “${search.keyword || ''}” near “${search.location || ''}”. Search ID ${search.search_id}. Results saved in the project database.`);
  if (!rows.length) showMessage('No external jobs matched this search. Try a broader keyword or nearby location. The search itself was saved.', false);
}
async function loadSavedSearch(searchId) {
  results.replaceChildren();
  showMessage('Loading saved search…');
  try { render(await api(`/api/external-jobs/searches/${encodeURIComponent(searchId)}`)); }
  catch (error) { showMessage(error.message, true); }
}
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('#external-search-button'); button.disabled = true; results.replaceChildren(); showMessage('Searching Adzuna and saving the results…');
  try {
    const searchData = Object.fromEntries(new FormData(form).entries());
    render(await api('/api/external-jobs/search', { method: 'POST', body: JSON.stringify(searchData) }));
  } catch (error) { showMessage(error.message, true); }
  finally { button.disabled = false; }
});
savedButton.addEventListener('click', () => { const id = localStorage.getItem(storageKey); if (id) loadSavedSearch(id); });
const lastSearch = localStorage.getItem(storageKey);
if (lastSearch && /^\d+$/.test(lastSearch)) { savedButton.hidden = false; }
