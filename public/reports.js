const select = document.querySelector('#view-select');
const runButton = document.querySelector('#load-view');
const exportCsv = document.querySelector('#export-csv');
const exportPdf = document.querySelector('#export-pdf');
const status = document.querySelector('#report-message');
const table = document.querySelector('#results');
let chart;

async function readJson(url) {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}
function addCell(row, value, header = false) {
  const cell = document.createElement(header ? 'th' : 'td');
  cell.textContent = value == null ? '' : String(value);
  row.append(cell);
}
async function loadViewNames() {
  try {
    const data = await readJson('/api/views');
    for (const name of data.views) { const option = document.createElement('option'); option.value = name; option.textContent = name; select.append(option); }
    runButton.disabled = false;
    await runView();
  } catch (error) { status.textContent = error.message; status.classList.add('error'); }
}
async function runView() {
  status.textContent = 'Running report query…'; status.classList.remove('error');
  table.querySelector('thead').replaceChildren(); table.querySelector('tbody').replaceChildren();
  try {
    const data = await readJson(`/api/views/${encodeURIComponent(select.value)}`);
    const header = table.querySelector('thead').insertRow(); data.columns.forEach((column) => addCell(header, column, true));
    const body = table.querySelector('tbody');
    data.rows.forEach((item) => { const row = body.insertRow(); data.columns.forEach((column) => addCell(row, item[column])); });
    exportCsv.disabled = false; exportPdf.disabled = false;
    status.textContent = `${data.view}: ${data.rows.length} row(s). CSV and PDF downloads will export this view directly from the database.`;
  } catch (error) { exportCsv.disabled = true; exportPdf.disabled = true; status.textContent = error.message; status.classList.add('error'); }
}
async function loadChart() {
  try {
    const data = await readJson('/api/stats/application-status');
    const labels = data.rows.map((row) => row.status_name);
    const values = data.rows.map((row) => Number(row.application_count));
    chart?.destroy();
    chart = new Chart(document.querySelector('#status-chart'), { type: 'bar', data: { labels, datasets: [{ label: 'Applications', data: values, backgroundColor: '#3476a2', borderRadius: 6 }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }, plugins: { legend: { display: false } } } });
    document.querySelector('#chart-message').textContent = `${values.reduce((a,b)=>a+b,0)} application(s) grouped across ${labels.length} statuses.`;
  } catch (error) { const node = document.querySelector('#chart-message'); node.textContent = error.message; node.classList.add('error'); }
}
runButton.addEventListener('click', runView);
select.addEventListener('change', runView);
exportCsv.addEventListener('click', () => { if (select.value) window.location.href = `/api/views/${encodeURIComponent(select.value)}.csv`; });
exportPdf.addEventListener('click', () => { if (select.value) window.location.href = `/api/views/${encodeURIComponent(select.value)}.pdf`; });
runButton.disabled = true;
loadViewNames(); loadChart();
