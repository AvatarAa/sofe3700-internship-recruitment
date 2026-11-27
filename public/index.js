const $ = (selector) => document.querySelector(selector);
const health = $('#health');
const authMessage = $('#auth-message');
const postMessage = $('#posting-message');
const cards = $('#postings');
const appPanel = $('#applications-panel');
const appMessage = $('#application-message');
const currentUserRef = { value: null };
let employers = [];
let statuses = [];

async function api(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
  const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error([data.error || `Request failed (${response.status}).`, ...(data.details || [])].join(' '));
  return data;
}
const escapeHtml = (value) => { const node = document.createElement('span'); node.textContent = value == null ? '' : String(value); return node.innerHTML; };
function showMessage(node, message, error = false) { node.textContent = message; node.hidden = false; node.classList.toggle('error', error); }
function formObject(form) { return Object.fromEntries(new FormData(form).entries()); }

async function loadHealth() {
  try { const data = await api('/api/health'); health.textContent = `Connected to PostgreSQL database: ${data.database}`; }
  catch (error) { showMessage(health, error.message, true); }
}
async function loadMe() {
  const data = await api('/api/auth/me'); currentUserRef.value = data.user;
  const signedIn = Boolean(data.user);
  $('#auth-forms').hidden = signedIn;
  $('#logout-button').hidden = !signedIn;
  $('#account-status').textContent = signedIn ? `Signed in as ${data.user.email} (${data.user.role}).` : 'You are browsing as a guest. Sign in or create a student account.';
  $('#posting-admin').hidden = !['ADMIN', 'RECRUITER'].includes(data.role);
  $('#recruiter-admin').hidden = data.role !== 'ADMIN';
  $('#applications-panel').hidden = !signedIn;
  $('#recruiter-field').hidden = data.role !== 'ADMIN';
  if (signedIn) {
    await loadEmployers(); await loadStatuses(); await loadApplications();
  }
}
async function handleAuth(form, endpoint) {
  authMessage.hidden = true;
  try { await api(endpoint, { method: 'POST', body: JSON.stringify(formObject(form)) }); form.reset(); await loadMe(); showMessage(authMessage, 'Signed in successfully.'); await loadPostings(); }
  catch (error) { showMessage(authMessage, error.message, true); }
}
$('#login-form').addEventListener('submit', (event) => { event.preventDefault(); handleAuth(event.currentTarget, '/api/auth/login'); });
$('#register-form').addEventListener('submit', (event) => { event.preventDefault(); handleAuth(event.currentTarget, '/api/auth/register'); });
$('#logout-button').addEventListener('click', async () => { try { await api('/api/auth/logout', { method: 'POST' }); currentUserRef.value = null; await loadMe(); await loadPostings(); showMessage(authMessage, 'Signed out.'); } catch (error) { showMessage(authMessage, error.message, true); } });

async function loadPostings(params = new URLSearchParams(new FormData($('#search-form')))) {
  cards.replaceChildren();
  try {
    const data = await api(`/api/postings?${params}`);
    showMessage(postMessage, `${data.count} open internship${data.count === 1 ? '' : 's'} found.`);
    for (const posting of data.rows) {
      const card = document.createElement('article'); card.className = 'job-card';
      card.innerHTML = `<h3>${escapeHtml(posting.title)}</h3><div class="company">${escapeHtml(posting.company_name)}</div><p>${escapeHtml(posting.description)}</p><div class="job-meta">${escapeHtml(posting.location)} · ${escapeHtml(posting.work_mode)} · Deadline ${escapeHtml(String(posting.deadline).slice(0, 10))}</div><div class="job-meta">Hourly salary: ${escapeHtml(posting.min_salary ?? '—')}–${escapeHtml(posting.max_salary ?? '—')} · Contact ${escapeHtml(posting.recruiter_email)}</div>`;
      if (typeof posting.external_url === 'string' && /^https?:\/\//i.test(posting.external_url)) { const link = document.createElement('a'); link.href = posting.external_url; link.target = '_blank'; link.rel = 'noreferrer'; link.textContent = 'View original posting'; card.append(link); }
      if (currentUserRef.value?.role === 'STUDENT') {
        const form = document.createElement('form'); form.className = 'apply-form';
        form.innerHTML = `<label>Resume link (optional)<input name="resumeLink" type="url" maxlength="500" placeholder="https://…"></label><button type="submit">Apply</button>`;
        form.addEventListener('submit', async (event) => { event.preventDefault(); const input = form.elements.resumeLink; try { await api('/api/applications', { method: 'POST', body: JSON.stringify({ postingId: posting.posting_id, resumeLink: input.value }) }); showMessage(postMessage, `Application submitted for ${posting.title}.`); await loadApplications(); } catch (error) { showMessage(postMessage, error.message, true); } });
        card.append(form);
      }
      if (['ADMIN', 'RECRUITER'].includes(currentUserRef.value?.role)) {
        const edit = document.createElement('button'); edit.className = 'secondary'; edit.type = 'button'; edit.textContent = 'Edit posting'; edit.addEventListener('click', () => fillPostingForm(posting.posting_id)); card.append(edit);
      }
      cards.append(card);
    }
  } catch (error) { showMessage(postMessage, error.message, true); }
}
$('#search-form').addEventListener('submit', (event) => { event.preventDefault(); loadPostings(new URLSearchParams(new FormData(event.currentTarget))); });

async function loadEmployers() {
  try {
    const data = await api('/api/employers'); employers = data.rows;
    for (const select of [$('#posting-form [name="employerId"]'), $('#recruiter-form [name="employerId"]')]) {
      select.replaceChildren();
      for (const employer of employers) { const option = document.createElement('option'); option.value = employer.employer_id; option.textContent = `${employer.company_name} (ID ${employer.employer_id})`; select.append(option); }
    }
  } catch (error) { showMessage($('#posting-admin-message'), error.message, true); }
}
async function fillPostingForm(postingId) {
  try {
    const { posting } = await api(`/api/postings/${postingId}/edit-data`); const form = $('#posting-form');
    form.elements.postingId.value = posting.posting_id; form.elements.title.value = posting.title; form.elements.location.value = posting.location; form.elements.workMode.value = posting.work_mode; form.elements.deadline.value = String(posting.deadline).slice(0, 10); form.elements.minSalary.value = posting.min_salary ?? ''; form.elements.maxSalary.value = posting.max_salary ?? ''; form.elements.externalUrl.value = posting.external_url ?? '';
    form.elements.employerId.value = posting.employer_id;
    form.elements.description.value = posting.description || '';
    form.elements.recruiterId.value = posting.recruiter_id || '';
    $('#delete-posting').hidden = false;
    
    showMessage($('#posting-admin-message'), `Editing posting ${postingId}.`);
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (error) { showMessage($('#posting-admin-message'), error.message, true); }
}
$('#posting-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const form = event.currentTarget; const values = formObject(form); const id = values.postingId;
  const body = { ...values, employerId: Number(values.employerId), recruiterId: values.recruiterId ? Number(values.recruiterId) : undefined, minSalary: values.minSalary || null, maxSalary: values.maxSalary || null };
  delete body.postingId;
  try { await api(id ? `/api/postings/${id}` : '/api/postings', { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) }); form.reset(); form.elements.postingId.value = ''; $('#delete-posting').hidden = true; await loadPostings(); showMessage($('#posting-admin-message'), id ? 'Posting updated.' : 'Posting created.'); }
  catch (error) { showMessage($('#posting-admin-message'), error.message, true); }
});
$('#clear-posting').addEventListener('click', () => { $('#posting-form').reset(); $('#posting-form').elements.postingId.value = ''; $('#delete-posting').hidden = true; });
$('#delete-posting').addEventListener('click', async () => {
  const id = $('#posting-form').elements.postingId.value;
  if (!id || !confirm('Delete this posting? Postings with applications cannot be deleted.')) return;
  try { const result = await api(`/api/postings/${id}`, { method: 'DELETE' }); $('#posting-form').reset(); $('#posting-form').elements.postingId.value = ''; $('#delete-posting').hidden = true; await loadPostings(); showMessage($('#posting-admin-message'), result.message); }
  catch (error) { showMessage($('#posting-admin-message'), error.message, true); }
});
$('#recruiter-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try { const data = await api('/api/recruiters', { method: 'POST', body: JSON.stringify({ ...formObject(event.currentTarget), employerId: Number(event.currentTarget.elements.employerId.value) }) }); event.currentTarget.reset(); showMessage($('#recruiter-message'), `Recruiter account created: ${data.recruiter.email} (user ID ${data.recruiter.user_id}). Use this ID when creating their posting.`); }
  catch (error) { showMessage($('#recruiter-message'), error.message, true); }
});

async function loadStatuses() { const data = await api('/api/application-statuses'); statuses = data.rows; }
async function loadApplications() {
  try {
    const data = await api('/api/applications'); const body = $('#applications-table tbody'); const head = $('#applications-table thead'); body.replaceChildren(); head.replaceChildren();
    const columns = currentUserRef.value.role === 'STUDENT' ? ['application_id','internship_title','company_name','status_name','applied_at','resume_link'] : ['application_id','student_id','first_name','last_name','internship_title','company_name','status_name','applied_at'];
    const header = head.insertRow(); for (const key of columns) { const th = document.createElement('th'); th.textContent = key.replaceAll('_', ' '); header.append(th); }
    if (currentUserRef.value.role !== 'ADMIN') { const th = document.createElement('th'); th.textContent = 'Actions'; header.append(th); }
    for (const item of data.rows) {
      const row = body.insertRow(); for (const key of columns) { const cell = row.insertCell(); cell.textContent = item[key] == null ? '' : String(item[key]); }
      if (currentUserRef.value.role === 'STUDENT') {
        const cell = row.insertCell(); const edit = document.createElement('button'); edit.type='button'; edit.className='secondary'; edit.textContent='Edit resume';
        edit.addEventListener('click', async () => { const resume = prompt('Enter the new resume URL (leave blank to remove it):', item.resume_link || ''); if (resume === null) return; try { await api(`/api/applications/${item.application_id}`, {method:'PUT',body:JSON.stringify({resumeLink:resume})}); await loadApplications(); } catch (error) { showMessage(appMessage,error.message,true); } });
        const remove = document.createElement('button'); remove.type='button'; remove.className='secondary'; remove.textContent='Withdraw'; remove.addEventListener('click', async () => { if (!confirm('Withdraw and delete this application?')) return; try { await api(`/api/applications/${item.application_id}`,{method:'DELETE'}); await loadApplications(); } catch(error) { showMessage(appMessage,error.message,true); } }); cell.append(edit,remove);
      } else if (currentUserRef.value.role === 'RECRUITER') {
        const cell = row.insertCell(); const select = document.createElement('select'); select.setAttribute('aria-label','New application status');
        for (const status of statuses) { const option = document.createElement('option'); option.value=status.status_id; option.textContent=status.status_name; if (status.status_name===item.status_name) option.selected=true; select.append(option); }
        const save=document.createElement('button'); save.type='button'; save.textContent='Update status'; save.addEventListener('click',async()=>{try{await api(`/api/applications/${item.application_id}`,{method:'PUT',body:JSON.stringify({statusId:Number(select.value),note:'Status updated by recruiter through the portal.'})});await loadApplications();}catch(error){showMessage(appMessage,error.message,true);}}); cell.append(select,save);
      }
    }
    showMessage(appMessage, `${data.rows.length} application${data.rows.length===1?'':'s'} loaded.`);
  } catch (error) { showMessage(appMessage, error.message, true); }
}
$('#refresh-applications').addEventListener('click', loadApplications);

$('#weather-form').addEventListener('submit', async (event) => {
  event.preventDefault(); showMessage($('#weather-message'),'Contacting Open-Meteo and saving results…');
  try { const data = await api('/api/weather',{method:'POST',body:JSON.stringify(formObject(event.currentTarget))}); renderWeather([data.observation]); showMessage($('#weather-message'),`Saved current conditions for ${data.observation.resolved_location}. Source: ${data.source}.`); }
  catch(error){showMessage($('#weather-message'),error.message,true);}
});
$('#weather-history').addEventListener('click', async () => { try { const location=$('#weather-form').elements.location.value; const data=await api(`/api/weather?location=${encodeURIComponent(location)}`); renderWeather(data.rows); showMessage($('#weather-message'),`${data.rows.length} saved result(s) for ${location}.`); } catch(error){showMessage($('#weather-message'),error.message,true);} });
function renderWeather(rows) {
  const target=$('#weather-results'); target.replaceChildren();
  for(const row of rows){const card=document.createElement('article');card.className='job-card';card.innerHTML=`<h3>${escapeHtml(row.resolved_location)}</h3><p><strong>${escapeHtml(row.temperature_c)} °C</strong> · feels like ${escapeHtml(row.apparent_temperature_c)} °C</p><div class="job-meta">Humidity ${escapeHtml(row.humidity_percent)}% · Rain ${escapeHtml(row.precipitation_mm)} mm · Wind ${escapeHtml(row.wind_speed_kmh)} km/h</div><div class="job-meta">Observed ${escapeHtml(row.observed_at)}</div>`;target.append(card);}
}

(async function init(){await loadHealth();try{await loadMe();}catch(error){showMessage(authMessage,error.message,true);}await loadPostings();})();
