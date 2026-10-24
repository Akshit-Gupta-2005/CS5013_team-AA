/**
 * Multi-Modal Transportation Data Visualization Dashboard
 * CS5013 Midterm Project - Client Controller
 */

// Application State
const appState = {
    datasets: {
        smartwatch_heart_rate: null,
        chest_ecg_heart_rate: null,
        vehicle_velocity: null,
        vehicle_acceleration: null
    },
    charts: {},
    activeSubToggles: {
        hrVel: 'sw',   // 'sw' or 'chest'
        hrAcc: 'sw'    // 'sw' or 'chest'
    }
};

// Sensor Configuration Metadata
const SENSOR_CONFIG = {
    smartwatch_heart_rate: {
        name: 'Smartwatch Heart Rate',
        unit: 'BPM',
        color: '#0284c7',
        colorAlpha: 'rgba(2, 132, 199, 0.25)',
        pointColor: '#0284c7'
    },
    chest_ecg_heart_rate: {
        name: 'Chest ECG Monitor',
        unit: 'BPM',
        color: '#e11d48',
        colorAlpha: 'rgba(225, 29, 72, 0.25)',
        pointColor: '#e11d48'
    },
    vehicle_velocity: {
        name: 'Vehicle Velocity',
        unit: 'km/h',
        color: '#059669',
        colorAlpha: 'rgba(5, 150, 105, 0.25)',
        pointColor: '#059669'
    },
    vehicle_acceleration: {
        name: 'Vehicle Acceleration',
        unit: 'm/s²',
        color: '#7c3aed',
        colorAlpha: 'rgba(124, 58, 237, 0.25)',
        pointColor: '#7c3aed'
    }
};

// Initialize Application on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
    checkBackendHealth();
    initUploadDropzones();
    initTabNavigation();
    initSubToggles();
    initGlobalButtons();
    initEmptyCharts();
});

// -------------------------------------------------------------
// 1. Backend Connectivity & Health Check
// -------------------------------------------------------------
async function checkBackendHealth() {
    const pill = document.getElementById('backendStatusPill');
    const text = document.getElementById('backendStatusText');
    try {
        const res = await fetch('/api/status');
        if (res.ok) {
            const data = await res.json();
            pill.className = 'system-status-pill';
            text.textContent = `Backend Online (Java ${data.runtime || '26'})`;
        } else {
            throw new Error('Non-200 status');
        }
    } catch (e) {
        pill.className = 'system-status-pill error';
        text.textContent = 'Backend Offline';
    }
}

// -------------------------------------------------------------
// 2. Upload Handlers & Dropzone Logic
// -------------------------------------------------------------
function initUploadDropzones() {
    const sensorTypes = Object.keys(SENSOR_CONFIG);

    sensorTypes.forEach(sensorType => {
        const card = document.getElementById(`card-${sensorType}`);
        const dropZone = document.getElementById(`drop-${sensorType}`);
        const fileInput = document.getElementById(`file-${sensorType}`);
        const removeBtn = document.getElementById(`remove-${sensorType}`);

        if (!dropZone || !fileInput) return;

        // Click browse
        dropZone.addEventListener('click', (e) => {
            if (e.target !== fileInput) {
                fileInput.click();
            }
        });

        // Drag & Drop
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                handleFileUpload(sensorType, e.dataTransfer.files[0]);
            }
        });

        // Input file change
        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files.length > 0) {
                handleFileUpload(sensorType, e.target.files[0]);
            }
        });

        // Remove button
        if (removeBtn) {
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                removeFile(sensorType);
            });
        }
    });
}

async function handleFileUpload(sensorType, file) {
    if (!file.name.toLowerCase().endsWith('.csv')) {
        showCardError(sensorType, 'Invalid file type. Please upload a CSV (.csv) file.');
        return;
    }

    setCardLoading(sensorType, file.name);

    try {
        const textContent = await readFileAsText(file);
        const res = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sensorType: sensorType,
                filename: file.name,
                csvContent: textContent
            })
        });

        const data = await res.json();
        if (data.success) {
            appState.datasets[sensorType] = data;
            setCardSuccess(sensorType, data);

            // If a multi-stream GNSS log was uploaded to one motion card, automatically populate the counterpart
            const otherType = sensorType === 'vehicle_velocity' ? 'vehicle_acceleration'
                            : sensorType === 'vehicle_acceleration' ? 'vehicle_velocity' : null;
            if (otherType && !appState.datasets[otherType] && (data.filename.toLowerCase().includes('gnss') || textContent.includes('Speed_kph'))) {
                try {
                    setCardLoading(otherType, file.name);
                    const otherRes = await fetch('/api/upload', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            sensorType: otherType,
                            filename: file.name,
                            csvContent: textContent
                        })
                    });
                    const otherData = await otherRes.json();
                    if (otherData.success) {
                        appState.datasets[otherType] = otherData;
                        setCardSuccess(otherType, otherData);
                    } else {
                        removeFile(otherType);
                    }
                } catch (ignored) {
                    removeFile(otherType);
                }
            }

            updateAllVisualizations();
        } else {
            appState.datasets[sensorType] = null;
            const errList = data.errors && data.errors.length > 0
                ? data.errors.join('<br>')
                : 'Failed to parse CSV file.';
            showCardError(sensorType, errList);
            updateAllVisualizations();
        }
    } catch (err) {
        appState.datasets[sensorType] = null;
        showCardError(sensorType, 'Upload error: ' + err.message);
        updateAllVisualizations();
    }
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Failed to read file from disk.'));
        reader.readAsText(file);
    });
}

function removeFile(sensorType) {
    appState.datasets[sensorType] = null;
    const fileInput = document.getElementById(`file-${sensorType}`);
    if (fileInput) fileInput.value = '';

    const card = document.getElementById(`card-${sensorType}`);
    const status = document.getElementById(`status-${sensorType}`);
    const details = document.getElementById(`details-${sensorType}`);
    const errorBox = document.getElementById(`error-${sensorType}`);

    if (card) card.classList.remove('loaded');
    if (status) {
        status.className = 'status-badge empty';
        status.textContent = 'No File';
    }
    if (details) details.classList.add('hidden');
    if (errorBox) {
        errorBox.classList.add('hidden');
        errorBox.innerHTML = '';
    }

    updateUploadCountBadge();
    updateAllVisualizations();
}

function setCardLoading(sensorType, filename) {
    const status = document.getElementById(`status-${sensorType}`);
    const errorBox = document.getElementById(`error-${sensorType}`);
    if (status) {
        status.className = 'status-badge loading';
        status.textContent = 'Parsing...';
    }
    if (errorBox) errorBox.classList.add('hidden');
}

function setCardSuccess(sensorType, data) {
    const card = document.getElementById(`card-${sensorType}`);
    const status = document.getElementById(`status-${sensorType}`);
    const details = document.getElementById(`details-${sensorType}`);
    const errorBox = document.getElementById(`error-${sensorType}`);

    if (card) card.classList.add('loaded');
    if (status) {
        status.className = 'status-badge success';
        status.textContent = `${data.validDataPointsCount.toLocaleString()} pts`;
    }
    if (errorBox) errorBox.classList.add('hidden');

    if (details) {
        details.classList.remove('hidden');
        document.getElementById(`filename-${sensorType}`).textContent = data.filename;
        document.getElementById(`count-${sensorType}`).textContent = data.validDataPointsCount.toLocaleString();
        
        const minVal = data.minValue !== null ? data.minValue.toFixed(1) : '-';
        const maxVal = data.maxValue !== null ? data.maxValue.toFixed(1) : '-';
        document.getElementById(`range-${sensorType}`).textContent = `${minVal} - ${maxVal} ${data.unit}`;

        const startTime = formatShortTime(data.minFormattedTime);
        const endTime = formatShortTime(data.maxFormattedTime);
        document.getElementById(`timespan-${sensorType}`).textContent = `${startTime} → ${endTime}`;
    }

    updateUploadCountBadge();
}

function showCardError(sensorType, msg) {
    const card = document.getElementById(`card-${sensorType}`);
    const status = document.getElementById(`status-${sensorType}`);
    const details = document.getElementById(`details-${sensorType}`);
    const errorBox = document.getElementById(`error-${sensorType}`);

    if (card) card.classList.remove('loaded');
    if (status) {
        status.className = 'status-badge error';
        status.textContent = 'Error';
    }
    if (details) details.classList.add('hidden');
    if (errorBox) {
        errorBox.classList.remove('hidden');
        errorBox.innerHTML = msg;
    }
    updateUploadCountBadge();
}

function updateUploadCountBadge() {
    const count = Object.values(appState.datasets).filter(d => d !== null).length;
    const badge = document.getElementById('uploadedFileCount');
    if (badge) badge.textContent = count;
}

// -------------------------------------------------------------
// 3. Tab Navigation & Sub-toggles
// -------------------------------------------------------------
function initTabNavigation() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const targetId = btn.getAttribute('data-tab');
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            const targetPane = document.getElementById(targetId);
            if (targetPane) targetPane.classList.add('active');

            // Resize charts in active tab
            setTimeout(resizeAllCharts, 50);
        });
    });
}

function initSubToggles() {
    // HR vs Vel toggles
    const btnHrVelSw = document.getElementById('btnToggleHrVelSw');
    const btnHrVelChest = document.getElementById('btnToggleHrVelChest');
    if (btnHrVelSw && btnHrVelChest) {
        btnHrVelSw.addEventListener('click', () => {
            btnHrVelSw.classList.add('active');
            btnHrVelChest.classList.remove('active');
            appState.activeSubToggles.hrVel = 'sw';
            updateChartHrVsVel();
        });
        btnHrVelChest.addEventListener('click', () => {
            btnHrVelChest.classList.add('active');
            btnHrVelSw.classList.remove('active');
            appState.activeSubToggles.hrVel = 'chest';
            updateChartHrVsVel();
        });
    }

    // HR vs Accel toggles
    const btnHrAccSw = document.getElementById('btnToggleHrAccSw');
    const btnHrAccChest = document.getElementById('btnToggleHrAccChest');
    if (btnHrAccSw && btnHrAccChest) {
        btnHrAccSw.addEventListener('click', () => {
            btnHrAccSw.classList.add('active');
            btnHrAccChest.classList.remove('active');
            appState.activeSubToggles.hrAcc = 'sw';
            updateChartHrVsAcc();
        });
        btnHrAccChest.addEventListener('click', () => {
            btnHrAccChest.classList.add('active');
            btnHrAccSw.classList.remove('active');
            appState.activeSubToggles.hrAcc = 'chest';
            updateChartHrVsAcc();
        });
    }
}

// -------------------------------------------------------------
// 4. Global Action Buttons (Load Samples, Reset)
// -------------------------------------------------------------
function initGlobalButtons() {
    const btnLoad = document.getElementById('btnLoadSamples');
    const btnReset = document.getElementById('btnResetAll');

    if (btnLoad) {
        btnLoad.addEventListener('click', async () => {
            btnLoad.disabled = true;
            btnLoad.textContent = 'Loading Samples...';
            try {
                const sampleFiles = [
                    { type: 'smartwatch_heart_rate', file: 'smartwatch_heart_rate.csv' },
                    { type: 'chest_ecg_heart_rate', file: 'chest_ecg_heart_rate.csv' },
                    { type: 'vehicle_velocity', file: 'vehicle_velocity.csv' },
                    { type: 'vehicle_acceleration', file: 'vehicle_acceleration.csv' }
                ];

                for (const item of sampleFiles) {
                    const res = await fetch(`/api/sample-data/${item.file}`);
                    if (res.ok) {
                        const payload = await res.json();
                        const upRes = await fetch('/api/upload', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                sensorType: item.type,
                                filename: payload.filename,
                                csvContent: payload.content
                            })
                        });
                        const data = await upRes.json();
                        if (data.success) {
                            appState.datasets[item.type] = data;
                            setCardSuccess(item.type, data);
                        }
                    }
                }
                updateAllVisualizations();
            } catch (e) {
                alert('Failed to load sample dataset: ' + e.message);
            } finally {
                btnLoad.disabled = false;
                btnLoad.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Load Sample Trip CSVs`;
            }
        });
    }

    if (btnReset) {
        btnReset.addEventListener('click', () => {
            if (confirm('Clear all uploaded streams and reset dashboard?')) {
                Object.keys(SENSOR_CONFIG).forEach(removeFile);
            }
        });
    }
}

// -------------------------------------------------------------
// 5. Chart Management & Rendering
// -------------------------------------------------------------
function initEmptyCharts() {
    // Register Chart.js defaults
    Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    Chart.defaults.color = '#64748b';
    Chart.defaults.scale.grid.color = 'rgba(226, 232, 240, 0.7)';
}

function updateAllVisualizations() {
    updateChartHeartRate();
    updateChartVelocity();
    updateChartAcceleration();
    updateChartHrVsVel();
    updateChartHrVsAcc();
    updateChartVelVsAcc();
    updateChartHrAgreement();
    updateCombinedTimeline();
}

function resizeAllCharts() {
    Object.values(appState.charts).forEach(c => {
        if (c && typeof c.resize === 'function') c.resize();
    });
}

// Helper: Toggle Chart vs Empty State
function toggleEmptyState(chartId, showEmpty, title, desc) {
    const emptyEl = document.getElementById(`empty-${chartId}`);
    const canvas = document.getElementById(chartId);
    if (!emptyEl || !canvas) return;

    if (showEmpty) {
        emptyEl.classList.remove('hidden');
        canvas.style.display = 'none';
        if (title) {
            const tEl = emptyEl.querySelector('.empty-title');
            if (tEl) tEl.textContent = title;
        }
        if (desc) {
            const dEl = emptyEl.querySelector('.empty-desc');
            if (dEl) dEl.innerHTML = desc;
        }
    } else {
        emptyEl.classList.add('hidden');
        canvas.style.display = 'block';
    }
}

// -------------------------------------------------------------
// Chart 2A: Heart Rate Comparison
// -------------------------------------------------------------
function updateChartHeartRate() {
    const sw = appState.datasets.smartwatch_heart_rate;
    const chest = appState.datasets.chest_ecg_heart_rate;
    const canvas = document.getElementById('chartHeartRate');
    if (!canvas) return;

    if (!sw && !chest) {
        toggleEmptyState('chartHeartRate', true);
        if (appState.charts.heartRate) {
            appState.charts.heartRate.destroy();
            appState.charts.heartRate = null;
        }
        document.getElementById('chipSw').classList.add('hidden');
        document.getElementById('chipChest').classList.add('hidden');
        return;
    }

    toggleEmptyState('chartHeartRate', false);
    const datasets = [];

    if (sw) {
        document.getElementById('chipSw').classList.remove('hidden');
        datasets.push({
            label: 'Smartwatch HR (BPM)',
            data: sw.dataPoints.map(p => ({ x: p.epochMillis, y: p.value, rawTs: p.rawTimestamp, fmt: p.formattedTime })),
            borderColor: SENSOR_CONFIG.smartwatch_heart_rate.color,
            backgroundColor: SENSOR_CONFIG.smartwatch_heart_rate.colorAlpha,
            borderWidth: 2,
            pointRadius: 2,
            pointHoverRadius: 5,
            tension: 0.15
        });
    } else {
        document.getElementById('chipSw').classList.add('hidden');
    }

    if (chest) {
        document.getElementById('chipChest').classList.remove('hidden');
        datasets.push({
            label: 'Chest ECG HR (BPM)',
            data: chest.dataPoints.map(p => ({ x: p.epochMillis, y: p.value, rawTs: p.rawTimestamp, fmt: p.formattedTime })),
            borderColor: SENSOR_CONFIG.chest_ecg_heart_rate.color,
            backgroundColor: SENSOR_CONFIG.chest_ecg_heart_rate.colorAlpha,
            borderWidth: 2,
            borderDash: sw ? [4, 4] : [], // Distinguish by dash if both displayed
            pointRadius: 2,
            pointHoverRadius: 5,
            tension: 0.15
        });
    } else {
        document.getElementById('chipChest').classList.add('hidden');
    }

    if (appState.charts.heartRate) {
        appState.charts.heartRate.data.datasets = datasets;
        appState.charts.heartRate.update();
    } else {
        appState.charts.heartRate = new Chart(canvas, {
            type: 'line',
            data: { datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 300 },
                interaction: { mode: 'nearest', intersect: false },
                plugins: {
                    legend: { display: true, position: 'top' },
                    tooltip: {
                        callbacks: {
                            title: (items) => items.length ? items[0].raw.fmt : '',
                            label: (item) => ` ${item.dataset.label}: ${item.parsed.y.toFixed(1)} BPM`
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        title: { display: true, text: 'Time (Original Timestamps Preserved)' },
                        ticks: {
                            callback: (val) => formatEpochTicks(val)
                        }
                    },
                    y: {
                        title: { display: true, text: 'Heart Rate (BPM)' },
                        suggestedMin: 50,
                        suggestedMax: 110
                    }
                }
            }
        });
    }
}

// -------------------------------------------------------------
// Chart 2B: Vehicle Velocity Over Time
// -------------------------------------------------------------
function updateChartVelocity() {
    const vel = appState.datasets.vehicle_velocity;
    const canvas = document.getElementById('chartVelocity');
    const summaryPill = document.getElementById('velSummaryPill');
    const maxValSpan = document.getElementById('velMaxVal');
    if (!canvas) return;

    if (!vel) {
        toggleEmptyState('chartVelocity', true);
        if (summaryPill) summaryPill.style.display = 'none';
        if (appState.charts.velocity) {
            appState.charts.velocity.destroy();
            appState.charts.velocity = null;
        }
        return;
    }

    toggleEmptyState('chartVelocity', false);
    if (summaryPill && maxValSpan) {
        summaryPill.style.display = 'block';
        maxValSpan.textContent = vel.maxValue.toFixed(1);
    }

    const dataset = {
        label: 'Velocity (km/h)',
        data: vel.dataPoints.map(p => ({ x: p.epochMillis, y: p.value, rawTs: p.rawTimestamp, fmt: p.formattedTime })),
        borderColor: SENSOR_CONFIG.vehicle_velocity.color,
        backgroundColor: SENSOR_CONFIG.vehicle_velocity.colorAlpha,
        borderWidth: vel.dataPoints.length > 2000 ? 1.5 : 2,
        pointRadius: vel.dataPoints.length > 2000 ? 0 : 2,
        pointHoverRadius: 5,
        fill: true,
        tension: 0.15
    };

    if (appState.charts.velocity) {
        appState.charts.velocity.data.datasets = [dataset];
        appState.charts.velocity.update();
    } else {
        appState.charts.velocity = new Chart(canvas, {
            type: 'line',
            data: { datasets: [dataset] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 300 },
                interaction: { mode: 'nearest', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            title: (items) => items.length ? items[0].raw.fmt : '',
                            label: (item) => ` Speed: ${item.parsed.y.toFixed(1)} km/h`
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        title: { display: true, text: 'Time' },
                        ticks: { callback: (val) => formatEpochTicks(val) }
                    },
                    y: {
                        min: 0,
                        title: { display: true, text: 'Velocity (km/h)' }
                    }
                }
            }
        });
    }
}

// -------------------------------------------------------------
// Chart 2C: Vehicle Acceleration Over Time
// -------------------------------------------------------------
function updateChartAcceleration() {
    const acc = appState.datasets.vehicle_acceleration;
    const canvas = document.getElementById('chartAcceleration');
    const summaryPill = document.getElementById('accSummaryPill');
    if (!canvas) return;

    if (!acc) {
        toggleEmptyState('chartAcceleration', true);
        if (summaryPill) summaryPill.style.display = 'none';
        if (appState.charts.acceleration) {
            appState.charts.acceleration.destroy();
            appState.charts.acceleration = null;
        }
        return;
    }

    toggleEmptyState('chartAcceleration', false);
    if (summaryPill) summaryPill.style.display = 'block';

    const dataset = {
        label: 'Acceleration (m/s²)',
        data: acc.dataPoints.map(p => ({ x: p.epochMillis, y: p.value, rawTs: p.rawTimestamp, fmt: p.formattedTime })),
        borderColor: SENSOR_CONFIG.vehicle_acceleration.color,
        backgroundColor: SENSOR_CONFIG.vehicle_acceleration.colorAlpha,
        borderWidth: vel.dataPoints.length > 2000 ? 1.5 : 2,
        pointRadius: vel.dataPoints.length > 2000 ? 0 : 2,
        pointHoverRadius: 5,
        tension: 0.15
    };

    if (appState.charts.acceleration) {
        appState.charts.acceleration.data.datasets = [dataset];
        appState.charts.acceleration.update();
    } else {
        appState.charts.acceleration = new Chart(canvas, {
            type: 'line',
            data: { datasets: [dataset] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 300 },
                interaction: { mode: 'nearest', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            title: (items) => items.length ? items[0].raw.fmt : '',
                            label: (item) => ` Acceleration: ${item.parsed.y.toFixed(2)} m/s²`
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        title: { display: true, text: 'Time' },
                        ticks: { callback: (val) => formatEpochTicks(val) }
                    },
                    y: {
                        title: { display: true, text: 'Acceleration (m/s²)' },
                        grid: {
                            // Highlight zero line
                            color: (ctx) => ctx.tick.value === 0 ? '#334155' : 'rgba(226, 232, 240, 0.7)',
                            lineWidth: (ctx) => ctx.tick.value === 0 ? 2 : 1
                        }
                    }
                }
            }
        });
    }
}

// -------------------------------------------------------------
// EXACT TIMESTAMP MATCHING UTILITY (Client-side strict match)
// -------------------------------------------------------------
function exactMatchStreams(streamX, streamY) {
    if (!streamX || !streamY || !streamX.dataPoints || !streamY.dataPoints) {
        return { count: 0, points: [], sufficient: false };
    }

    const mapY = new Map();
    streamY.dataPoints.forEach(pt => {
        if (!mapY.has(pt.epochMillis)) {
            mapY.set(pt.epochMillis, pt);
        }
    });

    const matched = [];
    const seenX = new Set();

    streamX.dataPoints.forEach(ptX => {
        if (!seenX.has(ptX.epochMillis) && mapY.has(ptX.epochMillis)) {
            seenX.add(ptX.epochMillis);
            const ptY = mapY.get(ptX.epochMillis);
            matched.push({
                epochMillis: ptX.epochMillis,
                formattedTime: ptX.formattedTime,
                x: ptX.value,
                y: ptY.value,
                rawX: ptX.rawTimestamp,
                rawY: ptY.rawTimestamp
            });
        }
    });

    return {
        count: matched.length,
        points: matched,
        sufficient: matched.length > 0
    };
}

// -------------------------------------------------------------
// Chart 3A: Heart Rate vs Vehicle Velocity Scatter
// -------------------------------------------------------------
function updateChartHrVsVel() {
    const vel = appState.datasets.vehicle_velocity;
    const isSw = appState.activeSubToggles.hrVel === 'sw';
    const hr = isSw ? appState.datasets.smartwatch_heart_rate : appState.datasets.chest_ecg_heart_rate;
    const titleEl = document.getElementById('titleHrVel');
    const badgeEl = document.getElementById('matchBadgeHrVel');
    const canvas = document.getElementById('chartHrVsVel');
    if (!canvas) return;

    const hrLabel = isSw ? 'Smartwatch Heart Rate' : 'Chest ECG Heart Rate';
    if (titleEl) titleEl.textContent = `${hrLabel} vs Vehicle Velocity`;

    if (!vel || !hr) {
        const missing = !vel && !hr ? 'both Velocity and Heart Rate CSVs' : (!vel ? 'Vehicle Velocity CSV' : `${hrLabel} CSV`);
        toggleEmptyState('chartHrVsVel', true, 'Missing Data File(s)', `Please upload ${missing} above to enable this scatter plot.`);
        if (badgeEl) {
            badgeEl.className = 'match-badge';
            badgeEl.textContent = 'Awaiting file uploads';
        }
        if (appState.charts.hrVsVel) {
            appState.charts.hrVsVel.destroy();
            appState.charts.hrVsVel = null;
        }
        return;
    }

    // Exact Match Pairing: X = Velocity, Y = Heart Rate
    const match = exactMatchStreams(vel, hr);

    if (!match.sufficient) {
        toggleEmptyState('chartHrVsVel', true, 'Insufficient exact timestamp matches to plot this relationship.',
            '0 exact timestamp matches found between recorded timestamps. As per midterm rules, no clock offsets, nearest-neighbor matching, or interpolation are applied.');
        if (badgeEl) {
            badgeEl.className = 'match-badge unmatched';
            badgeEl.textContent = '0 exact matches';
        }
        if (appState.charts.hrVsVel) {
            appState.charts.hrVsVel.destroy();
            appState.charts.hrVsVel = null;
        }
        return;
    }

    toggleEmptyState('chartHrVsVel', false);
    if (badgeEl) {
        badgeEl.className = 'match-badge matched';
        badgeEl.textContent = `${match.count.toLocaleString()} exact matches paired`;
    }

    const scatterData = match.points.map(pt => ({ x: pt.x, y: pt.y, time: pt.formattedTime }));
    const color = isSw ? SENSOR_CONFIG.smartwatch_heart_rate.color : SENSOR_CONFIG.chest_ecg_heart_rate.color;

    const dataset = {
        label: `${hrLabel} vs Velocity`,
        data: scatterData,
        backgroundColor: color,
        borderColor: 'white',
        borderWidth: 1,
        pointRadius: match.points.length > 2000 ? 1.5 : 4,
        pointHoverRadius: match.points.length > 2000 ? 4 : 7
    };

    if (appState.charts.hrVsVel) {
        appState.charts.hrVsVel.data.datasets = [dataset];
        appState.charts.hrVsVel.update();
    } else {
        appState.charts.hrVsVel = new Chart(canvas, {
            type: 'scatter',
            data: { datasets: [dataset] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 300 },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (item) => ` Speed: ${item.parsed.x.toFixed(1)} km/h | HR: ${item.parsed.y.toFixed(1)} BPM (${item.raw.time})`
                        }
                    }
                },
                scales: {
                    x: {
                        title: { display: true, text: 'Vehicle Velocity (km/h)' }
                    },
                    y: {
                        title: { display: true, text: 'Heart Rate (BPM)' }
                    }
                }
            }
        });
    }
}

// -------------------------------------------------------------
// Chart 3B: Heart Rate vs Vehicle Acceleration Scatter
// -------------------------------------------------------------
function updateChartHrVsAcc() {
    const acc = appState.datasets.vehicle_acceleration;
    const isSw = appState.activeSubToggles.hrAcc === 'sw';
    const hr = isSw ? appState.datasets.smartwatch_heart_rate : appState.datasets.chest_ecg_heart_rate;
    const titleEl = document.getElementById('titleHrAcc');
    const badgeEl = document.getElementById('matchBadgeHrAcc');
    const canvas = document.getElementById('chartHrVsAcc');
    if (!canvas) return;

    const hrLabel = isSw ? 'Smartwatch Heart Rate' : 'Chest ECG Heart Rate';
    if (titleEl) titleEl.textContent = `${hrLabel} vs Vehicle Acceleration`;

    if (!acc || !hr) {
        const missing = !acc && !hr ? 'both Acceleration and Heart Rate CSVs' : (!acc ? 'Vehicle Acceleration CSV' : `${hrLabel} CSV`);
        toggleEmptyState('chartHrVsAcc', true, 'Missing Data File(s)', `Please upload ${missing} above to enable this scatter plot.`);
        if (badgeEl) {
            badgeEl.className = 'match-badge';
            badgeEl.textContent = 'Awaiting file uploads';
        }
        if (appState.charts.hrVsAcc) {
            appState.charts.hrVsAcc.destroy();
            appState.charts.hrVsAcc = null;
        }
        return;
    }

    // Exact Match Pairing: X = Acceleration, Y = Heart Rate
    const match = exactMatchStreams(acc, hr);

    if (!match.sufficient) {
        toggleEmptyState('chartHrVsAcc', true, 'Insufficient exact timestamp matches to plot this relationship.',
            '0 exact timestamp matches found between recorded timestamps. As per midterm rules, no clock offsets, nearest-neighbor matching, or interpolation are applied.');
        if (badgeEl) {
            badgeEl.className = 'match-badge unmatched';
            badgeEl.textContent = '0 exact matches';
        }
        if (appState.charts.hrVsAcc) {
            appState.charts.hrVsAcc.destroy();
            appState.charts.hrVsAcc = null;
        }
        return;
    }

    toggleEmptyState('chartHrVsAcc', false);
    if (badgeEl) {
        badgeEl.className = 'match-badge matched';
        badgeEl.textContent = `${match.count.toLocaleString()} exact matches paired`;
    }

    const scatterData = match.points.map(pt => ({ x: pt.x, y: pt.y, time: pt.formattedTime }));
    const color = isSw ? SENSOR_CONFIG.smartwatch_heart_rate.color : SENSOR_CONFIG.chest_ecg_heart_rate.color;

    const dataset = {
        label: `${hrLabel} vs Acceleration`,
        data: scatterData,
        backgroundColor: color,
        borderColor: 'white',
        borderWidth: 1,
        pointRadius: match.points.length > 2000 ? 1.5 : 4,
        pointHoverRadius: match.points.length > 2000 ? 4 : 7
    };

    if (appState.charts.hrVsAcc) {
        appState.charts.hrVsAcc.data.datasets = [dataset];
        appState.charts.hrVsAcc.update();
    } else {
        appState.charts.hrVsAcc = new Chart(canvas, {
            type: 'scatter',
            data: { datasets: [dataset] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 300 },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (item) => ` Accel: ${item.parsed.x.toFixed(2)} m/s² | HR: ${item.parsed.y.toFixed(1)} BPM (${item.raw.time})`
                        }
                    }
                },
                scales: {
                    x: {
                        title: { display: true, text: 'Longitudinal Acceleration (m/s²)' },
                        grid: {
                            color: (ctx) => ctx.tick.value === 0 ? '#334155' : 'rgba(226, 232, 240, 0.7)',
                            lineWidth: (ctx) => ctx.tick.value === 0 ? 2 : 1
                        }
                    },
                    y: {
                        title: { display: true, text: 'Heart Rate (BPM)' }
                    }
                }
            }
        });
    }
}

// -------------------------------------------------------------
// Chart 3C: Velocity vs Acceleration (Phase Portrait)
// -------------------------------------------------------------
function updateChartVelVsAcc() {
    const vel = appState.datasets.vehicle_velocity;
    const acc = appState.datasets.vehicle_acceleration;
    const badgeEl = document.getElementById('matchBadgeVelAcc');
    const canvas = document.getElementById('chartVelVsAcc');
    if (!canvas) return;

    if (!vel || !acc) {
        toggleEmptyState('chartVelVsAcc', true, 'Upload Motion Streams', 'Requires both Vehicle Velocity CSV and Vehicle Acceleration CSV.');
        if (badgeEl) {
            badgeEl.className = 'match-badge';
            badgeEl.textContent = 'Awaiting velocity & acceleration';
        }
        if (appState.charts.velVsAcc) {
            appState.charts.velVsAcc.destroy();
            appState.charts.velVsAcc = null;
        }
        return;
    }

    const match = exactMatchStreams(vel, acc);

    if (!match.sufficient) {
        toggleEmptyState('chartVelVsAcc', true, 'Insufficient exact timestamp matches to plot this relationship.',
            '0 exact timestamp matches found between velocity and acceleration streams.');
        if (badgeEl) {
            badgeEl.className = 'match-badge unmatched';
            badgeEl.textContent = '0 exact matches';
        }
        if (appState.charts.velVsAcc) {
            appState.charts.velVsAcc.destroy();
            appState.charts.velVsAcc = null;
        }
        return;
    }

    toggleEmptyState('chartVelVsAcc', false);
    if (badgeEl) {
        badgeEl.className = 'match-badge matched';
        badgeEl.textContent = `${match.count.toLocaleString()} exact matches paired`;
    }

    const dataset = {
        label: 'Velocity vs Acceleration',
        data: match.points.map(pt => ({ x: pt.x, y: pt.y, time: pt.formattedTime })),
        backgroundColor: '#0d9488',
        borderColor: 'white',
        borderWidth: 1,
        pointRadius: match.points.length > 2000 ? 1.5 : 4,
        pointHoverRadius: match.points.length > 2000 ? 4 : 7
    };

    if (appState.charts.velVsAcc) {
        appState.charts.velVsAcc.data.datasets = [dataset];
        appState.charts.velVsAcc.update();
    } else {
        appState.charts.velVsAcc = new Chart(canvas, {
            type: 'scatter',
            data: { datasets: [dataset] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 300 },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (item) => ` Velocity: ${item.parsed.x.toFixed(1)} km/h | Accel: ${item.parsed.y.toFixed(2)} m/s² (${item.raw.time})`
                        }
                    }
                },
                scales: {
                    x: {
                        title: { display: true, text: 'Vehicle Velocity (km/h)' }
                    },
                    y: {
                        title: { display: true, text: 'Longitudinal Acceleration (m/s²)' },
                        grid: {
                            color: (ctx) => ctx.tick.value === 0 ? '#334155' : 'rgba(226, 232, 240, 0.7)',
                            lineWidth: (ctx) => ctx.tick.value === 0 ? 2 : 1
                        }
                    }
                }
            }
        });
    }
}

// -------------------------------------------------------------
// Chart 3D: Sensor Agreement (Smartwatch vs Chest ECG)
// -------------------------------------------------------------
function updateChartHrAgreement() {
    const sw = appState.datasets.smartwatch_heart_rate;
    const chest = appState.datasets.chest_ecg_heart_rate;
    const badgeEl = document.getElementById('matchBadgeHrAgreement');
    const canvasScatter = document.getElementById('chartHrScatterAgreement');
    const canvasDiff = document.getElementById('chartHrDiffTimeline');
    if (!canvasScatter || !canvasDiff) return;

    if (!sw || !chest) {
        toggleEmptyState('chartHrScatterAgreement', true, 'Upload Both Heart Rate Files', 'Requires Smartwatch Heart Rate and Chest ECG Monitor CSVs.');
        toggleEmptyState('chartHrDiffTimeline', true, 'Upload Both Heart Rate Files', 'Requires Smartwatch Heart Rate and Chest ECG Monitor CSVs.');
        if (badgeEl) {
            badgeEl.className = 'match-badge';
            badgeEl.textContent = 'Awaiting both heart rate streams';
        }
        if (appState.charts.hrScatterAgree) {
            appState.charts.hrScatterAgree.destroy();
            appState.charts.hrScatterAgree = null;
        }
        if (appState.charts.hrDiffTime) {
            appState.charts.hrDiffTime.destroy();
            appState.charts.hrDiffTime = null;
        }
        return;
    }

    // Exact matching between Chest ECG (X) and Smartwatch (Y)
    const match = exactMatchStreams(chest, sw);

    if (!match.sufficient) {
        toggleEmptyState('chartHrScatterAgreement', true, 'Insufficient exact timestamp matches.', '0 exact timestamp matches between smartwatch and chest monitor.');
        toggleEmptyState('chartHrDiffTimeline', true, 'Insufficient exact timestamp matches.', '0 exact timestamp matches between smartwatch and chest monitor.');
        if (badgeEl) {
            badgeEl.className = 'match-badge unmatched';
            badgeEl.textContent = '0 exact matches';
        }
        if (appState.charts.hrScatterAgree) {
            appState.charts.hrScatterAgree.destroy();
            appState.charts.hrScatterAgree = null;
        }
        if (appState.charts.hrDiffTime) {
            appState.charts.hrDiffTime.destroy();
            appState.charts.hrDiffTime = null;
        }
        return;
    }

    toggleEmptyState('chartHrScatterAgreement', false);
    toggleEmptyState('chartHrDiffTimeline', false);
    if (badgeEl) {
        badgeEl.className = 'match-badge matched';
        badgeEl.textContent = `${match.count.toLocaleString()} synchronized seconds`;
    }

    // 1. Scatter Plot: Chest (X) vs Smartwatch (Y)
    const scatterDataset = {
        label: 'Heart Rate Agreement',
        data: match.points.map(pt => ({ x: pt.x, y: pt.y, time: pt.formattedTime })),
        backgroundColor: '#4f46e5',
        borderColor: 'white',
        borderWidth: 1,
        pointRadius: 4
    };

    if (appState.charts.hrScatterAgree) {
        appState.charts.hrScatterAgree.data.datasets = [scatterDataset];
        appState.charts.hrScatterAgree.update();
    } else {
        appState.charts.hrScatterAgree = new Chart(canvasScatter, {
            type: 'scatter',
            data: { datasets: [scatterDataset] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 300 },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (item) => ` Chest ECG: ${item.parsed.x.toFixed(1)} BPM | Watch: ${item.parsed.y.toFixed(1)} BPM (${item.raw.time})`
                        }
                    }
                },
                scales: {
                    x: { title: { display: true, text: 'Chest ECG Heart Rate (BPM)' } },
                    y: { title: { display: true, text: 'Smartwatch Heart Rate (BPM)' } }
                }
            }
        });
    }

    // 2. Difference Timeline: (Watch - Chest) vs Time
    const diffDataset = {
        label: 'Δ HR (Smartwatch − Chest ECG)',
        data: match.points.map(pt => ({ x: pt.epochMillis, y: pt.y - pt.x, time: pt.formattedTime })),
        borderColor: '#db2777',
        backgroundColor: 'rgba(219, 39, 119, 0.2)',
        borderWidth: 2,
        pointRadius: 2,
        tension: 0.1
    };

    if (appState.charts.hrDiffTime) {
        appState.charts.hrDiffTime.data.datasets = [diffDataset];
        appState.charts.hrDiffTime.update();
    } else {
        appState.charts.hrDiffTime = new Chart(canvasDiff, {
            type: 'line',
            data: { datasets: [diffDataset] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 300 },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            title: (items) => items.length ? items[0].raw.time : '',
                            label: (item) => ` Difference (Watch − Chest): ${item.parsed.y > 0 ? '+' : ''}${item.parsed.y.toFixed(1)} BPM`
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        title: { display: true, text: 'Time' },
                        ticks: { callback: (val) => formatEpochTicks(val) }
                    },
                    y: {
                        title: { display: true, text: 'Δ Heart Rate (BPM)' },
                        grid: {
                            color: (ctx) => ctx.tick.value === 0 ? '#334155' : 'rgba(226, 232, 240, 0.7)',
                            lineWidth: (ctx) => ctx.tick.value === 0 ? 2 : 1
                        }
                    }
                }
            }
        });
    }
}

// -------------------------------------------------------------
// Section 4: Combined Motion and Heart Rate Timeline
// -------------------------------------------------------------
function updateCombinedTimeline() {
    const sw = appState.datasets.smartwatch_heart_rate;
    const chest = appState.datasets.chest_ecg_heart_rate;
    const vel = appState.datasets.vehicle_velocity;
    const acc = appState.datasets.vehicle_acceleration;

    // Calculate common time bounds across available streams
    let minEpoch = Infinity;
    let maxEpoch = -Infinity;

    [sw, chest, vel, acc].forEach(ds => {
        if (ds && ds.minEpochMillis !== null) {
            if (ds.minEpochMillis < minEpoch) minEpoch = ds.minEpochMillis;
            if (ds.maxEpochMillis > maxEpoch) maxEpoch = ds.maxEpochMillis;
        }
    });

    const hasAnyTime = minEpoch !== Infinity && maxEpoch !== -Infinity;
    const commonXScale = hasAnyTime ? { min: minEpoch, max: maxEpoch } : {};

    // 1. Panel 1: Heart Rate
    updateTimelinePanelHr(sw, chest, commonXScale);

    // 2. Panel 2: Velocity
    updateTimelinePanelVel(vel, commonXScale);

    // 3. Panel 3: Acceleration
    updateTimelinePanelAcc(acc, commonXScale);
}

function updateTimelinePanelHr(sw, chest, commonXScale) {
    const canvas = document.getElementById('timelineChartHr');
    if (!canvas) return;

    if (!sw && !chest) {
        toggleEmptyState('timelineChartHr', true);
        if (appState.charts.timelineHr) {
            appState.charts.timelineHr.destroy();
            appState.charts.timelineHr = null;
        }
        return;
    }

    toggleEmptyState('timelineChartHr', false);
    const datasets = [];

    if (sw) {
        datasets.push({
            label: 'Smartwatch HR',
            data: sw.dataPoints.map(p => ({ x: p.epochMillis, y: p.value, fmt: p.formattedTime })),
            borderColor: SENSOR_CONFIG.smartwatch_heart_rate.color,
            borderWidth: 1.8,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.1
        });
    }
    if (chest) {
        datasets.push({
            label: 'Chest ECG HR',
            data: chest.dataPoints.map(p => ({ x: p.epochMillis, y: p.value, fmt: p.formattedTime })),
            borderColor: SENSOR_CONFIG.chest_ecg_heart_rate.color,
            borderWidth: 1.8,
            borderDash: sw ? [4, 4] : [],
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.1
        });
    }

    if (appState.charts.timelineHr) {
        appState.charts.timelineHr.data.datasets = datasets;
        if (commonXScale.min !== undefined) {
            appState.charts.timelineHr.options.scales.x.min = commonXScale.min;
            appState.charts.timelineHr.options.scales.x.max = commonXScale.max;
        }
        appState.charts.timelineHr.update();
    } else {
        appState.charts.timelineHr = new Chart(canvas, {
            type: 'line',
            data: { datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 200 },
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: true, position: 'right' },
                    tooltip: {
                        callbacks: {
                            title: (items) => items.length ? items[0].raw.fmt : '',
                            label: (item) => ` ${item.dataset.label}: ${item.parsed.y.toFixed(1)} BPM`
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        min: commonXScale.min,
                        max: commonXScale.max,
                        ticks: { display: false },
                        grid: { drawTicks: false }
                    },
                    y: {
                        title: { display: true, text: 'BPM' },
                        suggestedMin: 50,
                        suggestedMax: 110
                    }
                }
            }
        });
    }
}

function updateTimelinePanelVel(vel, commonXScale) {
    const canvas = document.getElementById('timelineChartVel');
    if (!canvas) return;

    if (!vel) {
        toggleEmptyState('timelineChartVel', true);
        if (appState.charts.timelineVel) {
            appState.charts.timelineVel.destroy();
            appState.charts.timelineVel = null;
        }
        return;
    }

    toggleEmptyState('timelineChartVel', false);
    const dataset = {
        label: 'Velocity',
        data: vel.dataPoints.map(p => ({ x: p.epochMillis, y: p.value, fmt: p.formattedTime })),
        borderColor: SENSOR_CONFIG.vehicle_velocity.color,
        backgroundColor: SENSOR_CONFIG.vehicle_velocity.colorAlpha,
        fill: true,
        borderWidth: 1.8,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.1
    };

    if (appState.charts.timelineVel) {
        appState.charts.timelineVel.data.datasets = [dataset];
        if (commonXScale.min !== undefined) {
            appState.charts.timelineVel.options.scales.x.min = commonXScale.min;
            appState.charts.timelineVel.options.scales.x.max = commonXScale.max;
        }
        appState.charts.timelineVel.update();
    } else {
        appState.charts.timelineVel = new Chart(canvas, {
            type: 'line',
            data: { datasets: [dataset] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 200 },
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            title: (items) => items.length ? items[0].raw.fmt : '',
                            label: (item) => ` Velocity: ${item.parsed.y.toFixed(1)} km/h`
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        min: commonXScale.min,
                        max: commonXScale.max,
                        ticks: { display: false },
                        grid: { drawTicks: false }
                    },
                    y: {
                        title: { display: true, text: 'km/h' },
                        min: 0
                    }
                }
            }
        });
    }
}

function updateTimelinePanelAcc(acc, commonXScale) {
    const canvas = document.getElementById('timelineChartAcc');
    if (!canvas) return;

    if (!acc) {
        toggleEmptyState('timelineChartAcc', true);
        if (appState.charts.timelineAcc) {
            appState.charts.timelineAcc.destroy();
            appState.charts.timelineAcc = null;
        }
        return;
    }

    toggleEmptyState('timelineChartAcc', false);
    const dataset = {
        label: 'Acceleration',
        data: acc.dataPoints.map(p => ({ x: p.epochMillis, y: p.value, fmt: p.formattedTime })),
        borderColor: SENSOR_CONFIG.vehicle_acceleration.color,
        borderWidth: 1.8,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.1
    };

    if (appState.charts.timelineAcc) {
        appState.charts.timelineAcc.data.datasets = [dataset];
        if (commonXScale.min !== undefined) {
            appState.charts.timelineAcc.options.scales.x.min = commonXScale.min;
            appState.charts.timelineAcc.options.scales.x.max = commonXScale.max;
        }
        appState.charts.timelineAcc.update();
    } else {
        appState.charts.timelineAcc = new Chart(canvas, {
            type: 'line',
            data: { datasets: [dataset] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 200 },
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            title: (items) => items.length ? items[0].raw.fmt : '',
                            label: (item) => ` Acceleration: ${item.parsed.y.toFixed(2)} m/s²`
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        min: commonXScale.min,
                        max: commonXScale.max,
                        title: { display: true, text: 'Trip Timeline' },
                        ticks: { callback: (val) => formatEpochTicks(val) }
                    },
                    y: {
                        title: { display: true, text: 'm/s²' },
                        grid: {
                            color: (ctx) => ctx.tick.value === 0 ? '#334155' : 'rgba(226, 232, 240, 0.7)',
                            lineWidth: (ctx) => ctx.tick.value === 0 ? 2 : 1
                        }
                    }
                }
            }
        });
    }
}

// -------------------------------------------------------------
// Formatting Helpers
// -------------------------------------------------------------
function formatEpochTicks(epochMillis) {
    if (!epochMillis || isNaN(epochMillis)) return '';
    const d = new Date(epochMillis);
    const h = String(d.getUTCHours()).padStart(2, '0');
    const m = String(d.getUTCMinutes()).padStart(2, '0');
    const s = String(d.getUTCSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
}

function formatShortTime(formattedStr) {
    if (!formattedStr) return '-';
    // e.g. "2026-10-11 14:30:00.000" -> "14:30:00"
    const parts = formattedStr.split(' ');
    if (parts.length > 1) {
        return parts[1].split('.')[0];
    }
    return formattedStr;
}
