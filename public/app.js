// Tab Switching Logic
function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.nav-tabs li').forEach(li => li.classList.remove('active'));
    
    document.getElementById(`${tabName}-tab`).classList.add('active');
    event.currentTarget.classList.add('active');

    if (tabName === 'efficiency') loadEfficiencyData();
}

// Chart.js Initialization
let efficiencyChart;
function initChart(data) {
    const ctx = document.getElementById('efficiencyChart').getContext('2d');
    if (efficiencyChart) efficiencyChart.destroy();
    
    efficiencyChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(d => d.gauge_id),
            datasets: [
                { label: 'Planned', data: data.map(d => d.production_plan), backgroundColor: '#64748b' },
                { label: 'Actual', data: data.map(d => d.actual_production), backgroundColor: '#38bdf8' }
            ]
        },
        options: { responsive: true, plugins: { legend: { labels: { color: '#f8fafc' } } } }
    });
}

// "Why?" Button - Opening the Modal
let activeLogId = null;
function openVarianceModal(gaugeId, logId, variance) {
    activeLogId = logId;
    document.getElementById('variance-info').innerText = `Analyzing ${variance} unit gap for ${gaugeId}`;
    document.getElementById('variance-modal').style.display = 'flex';
}

async function saveVariance() {
    const reason = document.getElementById('reason-code').value;
    const notes = document.getElementById('variance-notes').value;
    
    await fetch(`/api/gauges/any/monthly-log/${activeLogId}/variance`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variance_reason: `${reason}: ${notes}`, resolution_status: 'logged' })
    });
    
    document.getElementById('variance-modal').style.display = 'none';
    loadEfficiencyData(); // Refresh table
}

// ─── UPLOAD / IMPORT FUNCTIONS ────────────────────────────────────────────────
// Ported from: backup/app.js (setupFileUpload, handleFileSelect, uploadFile)

function openUploadModal() {
    document.getElementById('uploadModal').style.display = 'flex';
    setupFileUpload();
}

function closeUploadModal() {
    document.getElementById('uploadModal').style.display = 'none';
    document.getElementById('fileInput').value = '';
    document.getElementById('uploadOptions').style.display = 'none';
    document.getElementById('importResults').style.display = 'none';
    const selFile = document.getElementById('selectedFileName');
    if (selFile) selFile.style.display = 'none';
}

let fileUploadInitialized = false;
function setupFileUpload() {
    if (fileUploadInitialized) return;
    fileUploadInitialized = true;

    const fileUpload = document.getElementById('fileUpload');
    const fileInput = document.getElementById('fileInput');

    fileUpload.addEventListener('dragover', (e) => {
        e.preventDefault();
        fileUpload.classList.add('dragover');
    });

    fileUpload.addEventListener('dragleave', () => {
        fileUpload.classList.remove('dragover');
    });

    fileUpload.addEventListener('drop', (e) => {
        e.preventDefault();
        fileUpload.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            fileInput.files = e.dataTransfer.files;
            handleFileSelect();
        }
    });

    fileUpload.addEventListener('click', (e) => {
        if (e.target.tagName !== 'BUTTON') fileInput.click();
    });

    fileInput.addEventListener('change', handleFileSelect);
}

function handleFileSelect() {
    const fileInput = document.getElementById('fileInput');
    const uploadOptions = document.getElementById('uploadOptions');
    const selectedFileName = document.getElementById('selectedFileName');

    if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
        selectedFileName.innerHTML = `📄 <strong>${file.name}</strong> (${sizeMB} MB)`;
        selectedFileName.style.display = 'flex';
        uploadOptions.style.display = 'block';
        document.getElementById('importResults').style.display = 'none';
    }
}

async function uploadFile() {
    const fileInput = document.getElementById('fileInput');
    const replaceExisting = document.getElementById('replaceExisting').checked;
    const skipDuplicates = document.getElementById('skipDuplicates').checked;

    if (!fileInput.files.length) {
        showNotification('Please select a file first', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    formData.append('replace_existing', replaceExisting);
    formData.append('skip_duplicates', skipDuplicates);
    formData.append('imported_by', 'Web Interface');

    showNotification('Importing data...', 'info');

    try {
        const response = await fetch('/api/upload/import', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        const resultsDiv = document.getElementById('importResults');

        if (result.success) {
            const d = result.data;
            resultsDiv.className = 'success';
            resultsDiv.innerHTML = `
                <strong>✅ Import Complete</strong>
                <div class="import-stat"><span>Total Rows</span><span>${d.total_rows}</span></div>
                <div class="import-stat"><span>Inserted</span><span style="color:#4CAF50">${d.inserted}</span></div>
                <div class="import-stat"><span>Updated</span><span style="color:#FF9800">${d.updated}</span></div>
                <div class="import-stat"><span>Skipped</span><span>${d.skipped}</span></div>
                <div class="import-stat"><span>Alerts Generated</span><span style="color:#f44336">${d.alerts_generated}</span></div>
                ${d.errors.length > 0 ? `<details style="margin-top:0.5rem"><summary style="cursor:pointer;opacity:0.7">${d.errors.length} error(s)</summary><ul style="margin-top:0.5rem;padding-left:1.2rem;font-size:0.8rem;opacity:0.7">${d.errors.map(e => `<li>${e}</li>`).join('')}</ul></details>` : ''}
            `;
            resultsDiv.style.display = 'block';
            showNotification(`Import: ${d.inserted} inserted, ${d.updated} updated`, 'success');
        } else {
            resultsDiv.className = 'error';
            resultsDiv.innerHTML = `<strong>❌ Import Failed</strong><p>${result.error}</p>`;
            resultsDiv.style.display = 'block';
            showNotification(`Import failed: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('Upload error:', error);
        showNotification('Upload failed: ' + error.message, 'error');
    }
}

async function downloadExcel() {
    try {
        showNotification('Generating Excel file...', 'info');
        const response = await fetch('/api/export/excel');
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `gauge-profiles-${new Date().toISOString().split('T')[0]}.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            showNotification('Excel file downloaded', 'success');
        } else {
            showNotification('Failed to generate Excel file', 'error');
        }
    } catch (error) {
        console.error('Export error:', error);
        showNotification('Export failed', 'error');
    }
}

// ─── NOTIFICATION SYSTEM ──────────────────────────────────────────────────────
// Ported from: backup/app.js (showNotification)
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `toast-notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    requestAnimationFrame(() => {
        notification.classList.add('show');
    });

    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentNode) document.body.removeChild(notification);
        }, 350);
    }, 4000);
}

// ─── MODAL CLOSE ON BACKDROP CLICK ────────────────────────────────────────────
window.addEventListener('click', (event) => {
    if (event.target.id === 'uploadModal') closeUploadModal();
    if (event.target.id === 'variance-modal') {
        document.getElementById('variance-modal').style.display = 'none';
    }
});