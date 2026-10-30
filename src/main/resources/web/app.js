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
        vehicle_acceleration: null,
        healthypi_gsr: null
    },
    charts: {},
    activeSubToggles: {
        hrVel: 'sw',   // 'sw' or 'chest'
        hrAcc: 'sw',   // 'sw' or 'chest'
        gsrRel: 'vel'  // 'vel', 'acc', 'sw', 'chest'
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
    },
    healthypi_gsr: {
        name: 'HealthyPi Watch (GSR)',
        unit: 'GSR (Detrended)',
        color: '#d97706',
        colorAlpha: 'rgba(217, 119, 6, 0.22)',
        pointColor: '#d97706'
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
    initExportSystem();
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
    const uploadTypes = ['smartwatch_heart_rate', 'chest_ecg_heart_rate', 'vehicle_dynamics', 'healthypi_gsr'];

    uploadTypes.forEach(type => {
        const dropZone = document.getElementById(`drop-${type}`);
        const fileInput = document.getElementById(`file-${type}`);
        const removeBtn = document.getElementById(`remove-${type}`);

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
                if (type === 'vehicle_dynamics') {
                    handleVehicleDynamicsUpload(Array.from(e.dataTransfer.files));
                } else {
                    handleFileUpload(type, Array.from(e.dataTransfer.files));
                }
            }
        });

        // Input file change
        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files.length > 0) {
                if (type === 'vehicle_dynamics') {
                    handleVehicleDynamicsUpload(Array.from(e.target.files));
                } else {
                    handleFileUpload(type, Array.from(e.target.files));
                }
            }
        });

        // Remove button
        if (removeBtn) {
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (type === 'vehicle_dynamics') {
                    removeVehicleDynamics();
                } else {
                    removeFile(type);
                }
            });
        }
    });
}

async function handleVehicleDynamicsUpload(files) {
    const fileList = Array.isArray(files) ? files : [files];
    const csvFiles = fileList.filter(f => f.name.toLowerCase().endsWith('.csv'));
    if (csvFiles.length === 0) {
        showCardError('vehicle_dynamics', 'Invalid file type. Please upload a CSV (.csv) file.');
        return;
    }

    const displayFilename = csvFiles[0].name;
    setCardLoading('vehicle_dynamics', displayFilename);

    try {
        const textContent = await readFileAsText(csvFiles[0]);

        // Ingest and parse velocity and acceleration simultaneously from single CSV
        const [velRes, accRes] = await Promise.all([
            fetch('/api/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sensorType: 'vehicle_velocity',
                    filename: displayFilename,
                    csvContent: textContent
                })
            }),
            fetch('/api/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sensorType: 'vehicle_acceleration',
                    filename: displayFilename,
                    csvContent: textContent
                })
            })
        ]);

        const velData = await velRes.json();
        const accData = await accRes.json();

        if (velData.success || accData.success) {
            appState.datasets.vehicle_velocity = velData.success ? velData : null;
            appState.datasets.vehicle_acceleration = accData.success ? accData : null;

            setVehicleDynamicsSuccess(displayFilename, velData, accData);

            // Auto-populate Chest ECG if GNSS multi-stream contains Polar HR
            if (textContent.includes('Polar_HR_bpm') && !appState.datasets.chest_ecg_heart_rate) {
                try {
                    setCardLoading('chest_ecg_heart_rate', displayFilename);
                    const ecgRes = await fetch('/api/upload', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            sensorType: 'chest_ecg_heart_rate',
                            filename: displayFilename,
                            csvContent: textContent
                        })
                    });
                    const ecgData = await ecgRes.json();
                    if (ecgData.success) {
                        appState.datasets.chest_ecg_heart_rate = ecgData;
                        setCardSuccess('chest_ecg_heart_rate', ecgData);
                    } else {
                        removeFile('chest_ecg_heart_rate');
                    }
                } catch (ignored) {
                    removeFile('chest_ecg_heart_rate');
                }
            }

            updateAllVisualizations();
        } else {
            appState.datasets.vehicle_velocity = null;
            appState.datasets.vehicle_acceleration = null;
            const errs = [...(velData.errors || []), ...(accData.errors || [])];
            showCardError('vehicle_dynamics', errs.length > 0 ? errs.join('<br>') : 'Failed to parse vehicle dynamics from CSV.');
            updateAllVisualizations();
        }
    } catch (err) {
        appState.datasets.vehicle_velocity = null;
        appState.datasets.vehicle_acceleration = null;
        showCardError('vehicle_dynamics', 'Upload error: ' + err.message);
        updateAllVisualizations();
    }
}

function setVehicleDynamicsSuccess(displayFilename, velData, accData) {
    const card = document.getElementById('card-vehicle_dynamics');
    const status = document.getElementById('status-vehicle_dynamics');
    const details = document.getElementById('details-vehicle_dynamics');
    const dropZone = document.getElementById('drop-vehicle_dynamics');
    const errorBox = document.getElementById('error-vehicle_dynamics');

    if (errorBox) {
        errorBox.classList.add('hidden');
        errorBox.innerHTML = '';
    }
    if (dropZone) dropZone.classList.add('hidden');
    if (card) {
        card.classList.remove('loading', 'error');
        card.classList.add('loaded');
    }
    if (status) {
        status.className = 'status-badge success';
        status.textContent = 'Active';
    }
    if (details) details.classList.remove('hidden');

    const fnElem = document.getElementById('filename-vehicle_dynamics');
    if (fnElem) fnElem.textContent = displayFilename || velData?.filename || accData?.filename || 'vehicle_dynamics.csv';

    const countElem = document.getElementById('count-vehicle_dynamics');
    const totalPts = Math.max(velData?.validDataPointsCount || 0, accData?.validDataPointsCount || 0);
    if (countElem) countElem.textContent = `${totalPts.toLocaleString()} pts`;

    const spdElem = document.getElementById('range-speed-vehicle_dynamics');
    if (spdElem) {
        if (velData && velData.success && velData.minValue !== null) {
            spdElem.textContent = `${velData.minValue.toFixed(1)} – ${velData.maxValue.toFixed(1)} km/h`;
        } else {
            spdElem.textContent = 'N/A';
        }
    }

    const accElem = document.getElementById('range-accel-vehicle_dynamics');
    if (accElem) {
        if (accData && accData.success && accData.minValue !== null) {
            accElem.textContent = `${accData.minValue.toFixed(2)} – ${accData.maxValue.toFixed(2)} m/s²`;
        } else {
            accElem.textContent = 'N/A';
        }
    }

    const spanElem = document.getElementById('timespan-vehicle_dynamics');
    if (spanElem) {
        const minTime = formatShortTime(velData?.minFormattedTime || accData?.minFormattedTime);
        const maxTime = formatShortTime(velData?.maxFormattedTime || accData?.maxFormattedTime);
        spanElem.textContent = `${minTime} → ${maxTime}`;
    }

    updateUploadCountBadge();
}

function removeVehicleDynamics() {
    appState.datasets.vehicle_velocity = null;
    appState.datasets.vehicle_acceleration = null;
    const fileInput = document.getElementById('file-vehicle_dynamics');
    if (fileInput) fileInput.value = '';

    const card = document.getElementById('card-vehicle_dynamics');
    const status = document.getElementById('status-vehicle_dynamics');
    const details = document.getElementById('details-vehicle_dynamics');
    const dropZone = document.getElementById('drop-vehicle_dynamics');
    const errorBox = document.getElementById('error-vehicle_dynamics');

    if (card) card.classList.remove('loaded', 'loading', 'error');
    if (status) {
        status.className = 'status-badge empty';
        status.textContent = 'No File';
    }
    if (details) details.classList.add('hidden');
    if (dropZone) dropZone.classList.remove('hidden');
    if (errorBox) {
        errorBox.classList.add('hidden');
        errorBox.innerHTML = '';
    }

    updateUploadCountBadge();
    updateAllVisualizations();
}

async function handleFileUpload(sensorType, files) {
    const fileList = Array.isArray(files) ? files : [files];
    const csvFiles = fileList.filter(f => f.name.toLowerCase().endsWith('.csv'));
    if (csvFiles.length === 0) {
        showCardError(sensorType, 'Invalid file type. Please upload CSV (.csv) file(s).');
        return;
    }

    const displayFilename = csvFiles.length === 1
        ? csvFiles[0].name
        : `${csvFiles[0].name} (+${csvFiles.length - 1} more)`;

    setCardLoading(sensorType, displayFilename);

    try {
        const contents = await Promise.all(csvFiles.map(readFileAsText));
        const textContent = contents.join('\n');

        const res = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sensorType: sensorType,
                filename: displayFilename,
                csvContent: textContent
            })
        });

        const data = await res.json();
        if (data.success) {
            appState.datasets[sensorType] = data;
            setCardSuccess(sensorType, data);

            // If a multi-stream GNSS+Polar log was uploaded, automatically populate vehicle dynamics and counterpart ECG
            const isGnssMultiStream = displayFilename.toLowerCase().includes('gnss') || textContent.includes('Speed_kph');
            if (isGnssMultiStream) {
                if (!appState.datasets.vehicle_velocity || !appState.datasets.vehicle_acceleration) {
                    try {
                        setCardLoading('vehicle_dynamics', displayFilename);
                        const [vRes, aRes] = await Promise.all([
                            fetch('/api/upload', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ sensorType: 'vehicle_velocity', filename: displayFilename, csvContent: textContent })
                            }),
                            fetch('/api/upload', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ sensorType: 'vehicle_acceleration', filename: displayFilename, csvContent: textContent })
                            })
                        ]);
                        const vData = await vRes.json();
                        const aData = await aRes.json();
                        if (vData.success) appState.datasets.vehicle_velocity = vData;
                        if (aData.success) appState.datasets.vehicle_acceleration = aData;
                        if (vData.success || aData.success) {
                            setVehicleDynamicsSuccess(displayFilename, vData, aData);
                        } else {
                            removeVehicleDynamics();
                        }
                    } catch (ignored) {
                        removeVehicleDynamics();
                    }
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
    if (sensorType === 'vehicle_velocity' || sensorType === 'vehicle_acceleration' || sensorType === 'vehicle_dynamics') {
        removeVehicleDynamics();
        return;
    }

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
    if (sensorType === 'vehicle_velocity' || sensorType === 'vehicle_acceleration') {
        const vel = appState.datasets.vehicle_velocity;
        const acc = appState.datasets.vehicle_acceleration;
        const fn = vel?.filename || acc?.filename || data.filename;
        setVehicleDynamicsSuccess(fn, vel, acc);
        return;
    }
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
    let count = 0;
    if (appState.datasets.smartwatch_heart_rate) count++;
    if (appState.datasets.chest_ecg_heart_rate) count++;
    if (appState.datasets.vehicle_velocity || appState.datasets.vehicle_acceleration) count++;
    if (appState.datasets.healthypi_gsr) count++;
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

    // GSR Relationship toggles
    const gsrToggleMap = [
        { id: 'btnToggleGsrVel', key: 'vel' },
        { id: 'btnToggleGsrAcc', key: 'acc' },
        { id: 'btnToggleGsrSw', key: 'sw' },
        { id: 'btnToggleGsrChest', key: 'chest' }
    ];
    gsrToggleMap.forEach(item => {
        const el = document.getElementById(item.id);
        if (el) {
            el.addEventListener('click', () => {
                gsrToggleMap.forEach(other => {
                    const oEl = document.getElementById(other.id);
                    if (oEl) oEl.classList.remove('active');
                });
                el.classList.add('active');
                appState.activeSubToggles.gsrRel = item.key;
                updateChartGsrRel();
            });
        }
    });
}

// -------------------------------------------------------------
// 4. Global Action Buttons (Load 22 Oct Data, Load Samples, Reset)
// -------------------------------------------------------------
function initGlobalButtons() {
    const btnLoadOct22 = document.getElementById('btnLoadOct22');
    const btnLoad = document.getElementById('btnLoadSamples');
    const btnReset = document.getElementById('btnResetAll');

    if (btnLoadOct22) {
        btnLoadOct22.addEventListener('click', async () => {
            btnLoadOct22.disabled = true;
            btnLoadOct22.textContent = 'Loading Field Data...';
            try {
                setCardLoading('smartwatch_heart_rate', '22 Oct Field Data');
                setCardLoading('chest_ecg_heart_rate', '22 Oct Field Data');
                setCardLoading('vehicle_dynamics', '22 Oct Field Data');
                setCardLoading('healthypi_gsr', '22 Oct Field Data');

                const res = await fetch('/api/oct22-data');
                const payload = await res.json();
                if (res.ok && payload.success && payload.datasets) {
                    Object.entries(payload.datasets).forEach(([sensorType, data]) => {
                        if (data && data.success) {
                            appState.datasets[sensorType] = data;
                        } else {
                            if (sensorType !== 'vehicle_velocity' && sensorType !== 'vehicle_acceleration') {
                                removeFile(sensorType);
                            }
                        }
                    });

                    if (appState.datasets.smartwatch_heart_rate) {
                        setCardSuccess('smartwatch_heart_rate', appState.datasets.smartwatch_heart_rate);
                    }
                    if (appState.datasets.chest_ecg_heart_rate) {
                        setCardSuccess('chest_ecg_heart_rate', appState.datasets.chest_ecg_heart_rate);
                    }
                    if (appState.datasets.healthypi_gsr) {
                        setCardSuccess('healthypi_gsr', appState.datasets.healthypi_gsr);
                    }
                    if (appState.datasets.vehicle_velocity || appState.datasets.vehicle_acceleration) {
                        setVehicleDynamicsSuccess(
                            'gnss_log_2026_10_22_16_41_32.csv',
                            appState.datasets.vehicle_velocity,
                            appState.datasets.vehicle_acceleration
                        );
                    } else {
                        removeVehicleDynamics();
                    }

                    updateAllVisualizations();
                } else {
                    throw new Error(payload.error || 'Could not load field data');
                }
            } catch (e) {
                alert('Failed to load field study dataset: ' + e.message);
                removeFile('smartwatch_heart_rate');
                removeFile('chest_ecg_heart_rate');
                removeVehicleDynamics();
                removeFile('healthypi_gsr');
            } finally {
                btnLoadOct22.disabled = false;
                btnLoadOct22.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Load Field Data`;
            }
        });
    }

    if (btnLoad) {
        btnLoad.addEventListener('click', async () => {
            btnLoad.disabled = true;
            btnLoad.textContent = 'Loading Samples...';
            try {
                removeFile('healthypi_gsr');
                removeVehicleDynamics();
                removeFile('smartwatch_heart_rate');
                removeFile('chest_ecg_heart_rate');

                // Load Smartwatch HR
                const swRes = await fetch('/api/sample-data/smartwatch_heart_rate.csv');
                if (swRes.ok) {
                    const sw = await swRes.json();
                    const upSw = await fetch('/api/upload', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ sensorType: 'smartwatch_heart_rate', filename: sw.filename, csvContent: sw.content })
                    });
                    const dSw = await upSw.json();
                    if (dSw.success) {
                        appState.datasets.smartwatch_heart_rate = dSw;
                        setCardSuccess('smartwatch_heart_rate', dSw);
                    }
                }

                // Load Chest ECG
                const ecgRes = await fetch('/api/sample-data/chest_ecg_heart_rate.csv');
                if (ecgRes.ok) {
                    const ecg = await ecgRes.json();
                    const upEcg = await fetch('/api/upload', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ sensorType: 'chest_ecg_heart_rate', filename: ecg.filename, csvContent: ecg.content })
                    });
                    const dEcg = await upEcg.json();
                    if (dEcg.success) {
                        appState.datasets.chest_ecg_heart_rate = dEcg;
                        setCardSuccess('chest_ecg_heart_rate', dEcg);
                    }
                }

                // Load Vehicle Dynamics from vehicle_dynamics.csv
                const dynRes = await fetch('/api/sample-data/vehicle_dynamics.csv');
                if (dynRes.ok) {
                    const dyn = await dynRes.json();
                    const [vUp, aUp] = await Promise.all([
                        fetch('/api/upload', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ sensorType: 'vehicle_velocity', filename: dyn.filename, csvContent: dyn.content })
                        }),
                        fetch('/api/upload', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ sensorType: 'vehicle_acceleration', filename: dyn.filename, csvContent: dyn.content })
                        })
                    ]);
                    const vData = await vUp.json();
                    const aData = await aUp.json();
                    if (vData.success) appState.datasets.vehicle_velocity = vData;
                    if (aData.success) appState.datasets.vehicle_acceleration = aData;
                    if (vData.success || aData.success) {
                        setVehicleDynamicsSuccess(dyn.filename, vData, aData);
                    }
                }

                updateAllVisualizations();
            } catch (e) {
                alert('Failed to load sample dataset: ' + e.message);
            } finally {
                btnLoad.disabled = false;
                btnLoad.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Load Sample Data`;
            }
        });
    }

    if (btnReset) {
        btnReset.addEventListener('click', () => {
            if (confirm('Clear all uploaded streams and reset dashboard?')) {
                removeFile('smartwatch_heart_rate');
                removeFile('chest_ecg_heart_rate');
                removeVehicleDynamics();
                removeFile('healthypi_gsr');
            }
        });
    }
}

// -------------------------------------------------------------
// 5. Chart Management & Rendering
// -------------------------------------------------------------
function initEmptyCharts() {
    Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    Chart.defaults.color = '#64748b';
    Chart.defaults.scale.grid.color = 'rgba(226, 232, 240, 0.7)';
}

function updateAllVisualizations() {
    updateChartHeartRate();
    updateChartVelocity();
    updateChartAcceleration();
    updateChartGsr();
    updateChartHrVsVel();
    updateChartHrVsAcc();
    updateChartVelVsAcc();
    updateChartHrAgreement();
    updateChartGsrRel();
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
            borderWidth: sw.dataPoints.length > 2000 ? 1.5 : 2,
            pointRadius: sw.dataPoints.length > 2000 ? 0 : 2,
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
            borderWidth: chest.dataPoints.length > 2000 ? 1.5 : 2,
            borderDash: sw ? [4, 4] : [],
            pointRadius: chest.dataPoints.length > 2000 ? 0 : 2,
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
                        title: { display: true, text: 'Time (UTC)' },
                        ticks: {
                            callback: (val) => formatEpochTicks(val)
                        }
                    },
                    y: {
                        title: { display: true, text: 'Heart Rate (BPM)' },
                        suggestedMin: 55,
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
                        title: { display: true, text: 'Time (UTC)' },
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
        borderWidth: acc.dataPoints.length > 2000 ? 1.5 : 2,
        pointRadius: acc.dataPoints.length > 2000 ? 0 : 2,
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
                        title: { display: true, text: 'Time (UTC)' },
                        ticks: { callback: (val) => formatEpochTicks(val) }
                    },
                    y: {
                        title: { display: true, text: 'Acceleration (m/s²)' },
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
// Chart 2D: HealthyPi Watch GSR Over Time
// -------------------------------------------------------------
function updateChartGsr() {
    const gsr = appState.datasets.healthypi_gsr;
    const canvas = document.getElementById('chartGsr');
    const summaryPill = document.getElementById('gsrSummaryPill');
    const ptsSpan = document.getElementById('gsrPtsVal');
    if (!canvas) return;

    if (!gsr) {
        toggleEmptyState('chartGsr', true);
        if (summaryPill) summaryPill.style.display = 'none';
        if (appState.charts.gsr) {
            appState.charts.gsr.destroy();
            appState.charts.gsr = null;
        }
        return;
    }

    toggleEmptyState('chartGsr', false);
    if (summaryPill && ptsSpan) {
        summaryPill.style.display = 'block';
        ptsSpan.textContent = gsr.validDataPointsCount.toLocaleString();
    }

    const dataset = {
        label: 'Detrended GSR (Electrodermal Activity)',
        data: gsr.dataPoints.map(p => ({ x: p.epochMillis, y: p.value, rawTs: p.rawTimestamp, fmt: p.formattedTime })),
        borderColor: SENSOR_CONFIG.healthypi_gsr.color,
        backgroundColor: SENSOR_CONFIG.healthypi_gsr.colorAlpha,
        borderWidth: gsr.dataPoints.length > 2000 ? 1.4 : 2,
        pointRadius: gsr.dataPoints.length > 2000 ? 0 : 2,
        pointHoverRadius: 5,
        tension: 0.12
    };

    if (appState.charts.gsr) {
        appState.charts.gsr.data.datasets = [dataset];
        appState.charts.gsr.update();
    } else {
        appState.charts.gsr = new Chart(canvas, {
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
                            label: (item) => ` Detrended GSR: ${item.parsed.y.toFixed(2)}`
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        title: { display: true, text: 'Time (UTC)' },
                        ticks: { callback: (val) => formatEpochTicks(val) }
                    },
                    y: {
                        title: { display: true, text: 'Detrended GSR (ADC)' },
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

    const match = exactMatchStreams(vel, hr);

    if (!match.sufficient) {
        toggleEmptyState('chartHrVsVel', true, 'Insufficient exact timestamp matches to plot this relationship.',
            '0 exact timestamp matches found between recorded timestamps. Exact timestamp equality is required; no clock offsets or interpolation are applied.');
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
        pointRadius: match.points.length > 2000 ? 1.8 : 4,
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

    const match = exactMatchStreams(acc, hr);

    if (!match.sufficient) {
        toggleEmptyState('chartHrVsAcc', true, 'Insufficient exact timestamp matches to plot this relationship.',
            '0 exact timestamp matches found between recorded timestamps. Exact timestamp equality is required; no clock offsets or interpolation are applied.');
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
        pointRadius: match.points.length > 2000 ? 1.8 : 4,
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
        pointRadius: match.points.length > 2000 ? 1.8 : 4,
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

    const scatterDataset = {
        label: 'Heart Rate Agreement',
        data: match.points.map(pt => ({ x: pt.x, y: pt.y, time: pt.formattedTime })),
        backgroundColor: '#4f46e5',
        borderColor: 'white',
        borderWidth: 1,
        pointRadius: match.points.length > 2000 ? 2 : 4
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

    const diffDataset = {
        label: 'Δ HR (Smartwatch − Chest ECG)',
        data: match.points.map(pt => ({ x: pt.epochMillis, y: pt.y - pt.x, time: pt.formattedTime })),
        borderColor: '#db2777',
        backgroundColor: 'rgba(219, 39, 119, 0.2)',
        borderWidth: match.points.length > 2000 ? 1.5 : 2,
        pointRadius: match.points.length > 2000 ? 0 : 2,
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
                        title: { display: true, text: 'Time (UTC)' },
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
// Chart 3E: HealthyPi GSR vs Motion / Heart Rate Scatter
// -------------------------------------------------------------
function updateChartGsrRel() {
    const gsr = appState.datasets.healthypi_gsr;
    const mode = appState.activeSubToggles.gsrRel;
    const titleEl = document.getElementById('titleGsrRel');
    const subEl = document.getElementById('subtitleGsrRel');
    const badgeEl = document.getElementById('matchBadgeGsrRel');
    const canvas = document.getElementById('chartGsrRel');
    if (!canvas) return;

    const targetMap = {
        vel: { ds: appState.datasets.vehicle_velocity, label: 'Vehicle Velocity', unit: 'km/h', color: '#d97706' },
        acc: { ds: appState.datasets.vehicle_acceleration, label: 'Vehicle Acceleration', unit: 'm/s²', color: '#7c3aed' },
        sw: { ds: appState.datasets.smartwatch_heart_rate, label: 'Smartwatch Heart Rate', unit: 'BPM', color: '#0284c7' },
        chest: { ds: appState.datasets.chest_ecg_heart_rate, label: 'Chest ECG Heart Rate', unit: 'BPM', color: '#e11d48' }
    };

    const target = targetMap[mode] || targetMap.vel;
    if (titleEl) titleEl.textContent = `HealthyPi GSR vs ${target.label}`;
    if (subEl) subEl.textContent = `X-axis: ${target.label} (${target.unit}) • Y-axis: Detrended GSR`;

    if (!gsr || !target.ds) {
        const missing = !gsr && !target.ds ? `HealthyPi GSR and ${target.label}` : (!gsr ? 'HealthyPi Watch (GSR)' : target.label);
        toggleEmptyState('chartGsrRel', true, 'Missing Data Stream(s)', `Please upload ${missing} to explore this relationship.`);
        if (badgeEl) {
            badgeEl.className = 'match-badge';
            badgeEl.textContent = 'Awaiting file uploads';
        }
        if (appState.charts.gsrRel) {
            appState.charts.gsrRel.destroy();
            appState.charts.gsrRel = null;
        }
        return;
    }

    const match = exactMatchStreams(target.ds, gsr);

    if (!match.sufficient) {
        toggleEmptyState('chartGsrRel', true, 'Insufficient exact timestamp matches to plot this relationship.',
            '0 exact timestamp matches found between recorded timestamps.');
        if (badgeEl) {
            badgeEl.className = 'match-badge unmatched';
            badgeEl.textContent = '0 exact matches';
        }
        if (appState.charts.gsrRel) {
            appState.charts.gsrRel.destroy();
            appState.charts.gsrRel = null;
        }
        return;
    }

    toggleEmptyState('chartGsrRel', false);
    if (badgeEl) {
        badgeEl.className = 'match-badge matched';
        badgeEl.textContent = `${match.count.toLocaleString()} exact matches paired`;
    }

    const dataset = {
        label: `GSR vs ${target.label}`,
        data: match.points.map(pt => ({ x: pt.x, y: pt.y, time: pt.formattedTime })),
        backgroundColor: target.color,
        borderColor: 'white',
        borderWidth: 1,
        pointRadius: match.points.length > 2000 ? 1.8 : 4,
        pointHoverRadius: match.points.length > 2000 ? 4 : 7
    };

    if (appState.charts.gsrRel) {
        appState.charts.gsrRel.data.datasets = [dataset];
        appState.charts.gsrRel.options.scales.x.title.text = `${target.label} (${target.unit})`;
        appState.charts.gsrRel.update();
    } else {
        appState.charts.gsrRel = new Chart(canvas, {
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
                            label: (item) => ` ${target.label}: ${item.parsed.x.toFixed(2)} ${target.unit} | GSR: ${item.parsed.y.toFixed(2)} (${item.raw.time})`
                        }
                    }
                },
                scales: {
                    x: {
                        title: { display: true, text: `${target.label} (${target.unit})` }
                    },
                    y: {
                        title: { display: true, text: 'Detrended GSR (ADC)' }
                    }
                }
            }
        });
    }
}

// -------------------------------------------------------------
// Section 4: Combined Motion, Heart Rate & GSR Timeline
// -------------------------------------------------------------
function updateCombinedTimeline() {
    const sw = appState.datasets.smartwatch_heart_rate;
    const chest = appState.datasets.chest_ecg_heart_rate;
    const gsr = appState.datasets.healthypi_gsr;
    const vel = appState.datasets.vehicle_velocity;
    const acc = appState.datasets.vehicle_acceleration;

    let minEpoch = Infinity;
    let maxEpoch = -Infinity;

    [sw, chest, gsr, vel, acc].forEach(ds => {
        if (ds && ds.minEpochMillis !== null) {
            if (ds.minEpochMillis < minEpoch) minEpoch = ds.minEpochMillis;
            if (ds.maxEpochMillis > maxEpoch) maxEpoch = ds.maxEpochMillis;
        }
    });

    const hasAnyTime = minEpoch !== Infinity && maxEpoch !== -Infinity;
    const commonXScale = hasAnyTime ? { min: minEpoch, max: maxEpoch } : {};

    updateTimelinePanelHr(sw, chest, commonXScale);
    updateTimelinePanelGsr(gsr, commonXScale);
    updateTimelinePanelVel(vel, commonXScale);
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
            borderWidth: 1.6,
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
            borderWidth: 1.6,
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
                        suggestedMin: 55,
                        suggestedMax: 110
                    }
                }
            }
        });
    }
}

function updateTimelinePanelGsr(gsr, commonXScale) {
    const canvas = document.getElementById('timelineChartGsr');
    if (!canvas) return;

    if (!gsr) {
        toggleEmptyState('timelineChartGsr', true);
        if (appState.charts.timelineGsr) {
            appState.charts.timelineGsr.destroy();
            appState.charts.timelineGsr = null;
        }
        return;
    }

    toggleEmptyState('timelineChartGsr', false);
    const dataset = {
        label: 'Detrended GSR',
        data: gsr.dataPoints.map(p => ({ x: p.epochMillis, y: p.value, fmt: p.formattedTime })),
        borderColor: SENSOR_CONFIG.healthypi_gsr.color,
        backgroundColor: SENSOR_CONFIG.healthypi_gsr.colorAlpha,
        borderWidth: 1.6,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.1
    };

    if (appState.charts.timelineGsr) {
        appState.charts.timelineGsr.data.datasets = [dataset];
        if (commonXScale.min !== undefined) {
            appState.charts.timelineGsr.options.scales.x.min = commonXScale.min;
            appState.charts.timelineGsr.options.scales.x.max = commonXScale.max;
        }
        appState.charts.timelineGsr.update();
    } else {
        appState.charts.timelineGsr = new Chart(canvas, {
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
                            label: (item) => ` Detrended GSR: ${item.parsed.y.toFixed(2)}`
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
                        title: { display: true, text: 'GSR' }
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
        borderWidth: 1.6,
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
        borderWidth: 1.6,
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
                        title: { display: true, text: 'Trip Timeline (UTC)' },
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
    const parts = formattedStr.split(' ');
    if (parts.length > 1) {
        return parts[1].split('.')[0];
    }
    return formattedStr;
}

// -------------------------------------------------------------
// 10. Processed Data Export System
// -------------------------------------------------------------

function initExportSystem() {
    const btnOpen = document.getElementById('btnOpenExportModal');
    const btnCloseTop = document.getElementById('btnCloseExportModal');
    const btnCloseBottom = document.getElementById('btnCloseExportModalBottom');
    const backdrop = document.getElementById('exportModalBackdrop');

    if (btnOpen) btnOpen.addEventListener('click', openExportModal);
    if (btnCloseTop) btnCloseTop.addEventListener('click', closeExportModal);
    if (btnCloseBottom) btnCloseBottom.addEventListener('click', closeExportModal);

    if (backdrop) {
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) closeExportModal();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && backdrop && !backdrop.classList.contains('hidden')) {
            closeExportModal();
        }
    });

    // Action button listeners
    const btnMaster = document.getElementById('btnExportMasterCsv');
    if (btnMaster) btnMaster.addEventListener('click', () => exportMasterCsv());

    const btnAllIndiv = document.getElementById('btnExportAllIndividual');
    if (btnAllIndiv) btnAllIndiv.addEventListener('click', () => exportAllIndividualCsvs());

    const btnAllMatched = document.getElementById('btnExportAllMatched');
    if (btnAllMatched) btnAllMatched.addEventListener('click', () => exportAllMatchedCsvs());

    const btnJson = document.getElementById('btnExportJsonBundle');
    if (btnJson) btnJson.addEventListener('click', () => exportJsonBundle());

    const btnBatch = document.getElementById('btnExportBatchAll');
    if (btnBatch) btnBatch.addEventListener('click', () => exportBatchAll());

    // Individual sensor chips
    Object.keys(SENSOR_CONFIG).forEach(sensorType => {
        const chip = document.getElementById(`chipExp-${sensorType}`);
        if (chip) {
            chip.addEventListener('click', () => {
                if (appState.datasets[sensorType]) {
                    exportSensorCsv(sensorType);
                } else {
                    alert(`No processed data available for ${SENSOR_CONFIG[sensorType].name}. Please upload or load a dataset first.`);
                }
            });
        }
    });

    // Cross-sensor relationship chips
    ['hr_vel', 'hr_acc', 'vel_acc', 'hr_agreement', 'gsr_rel'].forEach(relType => {
        const chip = document.getElementById(`chipExpRel-${relType}`);
        if (chip) {
            chip.addEventListener('click', () => {
                const res = generateMatchedCsv(relType);
                if (res) {
                    downloadBlob(res.filename, res.csv);
                } else {
                    alert('Cannot export relationship: required sensor streams are not loaded or have 0 exact timestamp matches.');
                }
            });
        }
    });
}

function openExportModal() {
    const backdrop = document.getElementById('exportModalBackdrop');
    if (!backdrop) return;

    updateExportModalStatus();
    backdrop.classList.remove('hidden');
}

function closeExportModal() {
    const backdrop = document.getElementById('exportModalBackdrop');
    if (backdrop) backdrop.classList.add('hidden');
}

function updateExportModalStatus() {
    const activeSensors = Object.entries(appState.datasets).filter(([_, d]) => d && d.success);
    const totalPoints = activeSensors.reduce((acc, [_, d]) => acc + (d.validDataPointsCount || 0), 0);

    const statusText = document.getElementById('exportStatusText');
    if (statusText) {
        if (activeSensors.length === 0) {
            statusText.textContent = 'No sensor datasets currently loaded. Upload CSV files or click "Load 22 Oct 2026 Field Data" above.';
        } else {
            statusText.textContent = `${activeSensors.length} of ${Object.keys(SENSOR_CONFIG).length} streams active (${totalPoints.toLocaleString()} total processed observations available for export).`;
        }
    }

    // Update sensor chip states
    Object.keys(SENSOR_CONFIG).forEach(sensorType => {
        const chip = document.getElementById(`chipExp-${sensorType}`);
        if (chip) {
            const hasData = !!(appState.datasets[sensorType] && appState.datasets[sensorType].success);
            chip.disabled = !hasData;
            chip.title = hasData
                ? `Click to download processed ${SENSOR_CONFIG[sensorType].name} (${appState.datasets[sensorType].validDataPointsCount.toLocaleString()} pts)`
                : 'No data loaded for this stream';
        }
    });

    // Update relationship chip states
    const hasSw = !!appState.datasets.smartwatch_heart_rate;
    const hasChest = !!appState.datasets.chest_ecg_heart_rate;
    const hasHr = hasSw || hasChest;
    const hasVel = !!appState.datasets.vehicle_velocity;
    const hasAcc = !!appState.datasets.vehicle_acceleration;
    const hasGsr = !!appState.datasets.healthypi_gsr;

    const relState = {
        hr_vel: hasHr && hasVel,
        hr_acc: hasHr && hasAcc,
        vel_acc: hasVel && hasAcc,
        hr_agreement: hasSw && hasChest,
        gsr_rel: hasGsr && (hasVel || hasAcc || hasHr)
    };

    Object.entries(relState).forEach(([relKey, isAvail]) => {
        const chip = document.getElementById(`chipExpRel-${relKey}`);
        if (chip) {
            chip.disabled = !isAvail;
            chip.title = isAvail ? 'Click to export paired data CSV' : 'Requires corresponding streams to be uploaded';
        }
    });
}

// -------------------------------------------------------------
// Download Utility (Blob URL)
// -------------------------------------------------------------
function downloadBlob(filename, textContent, mimeType = 'text/csv;charset=utf-8;') {
    const blob = new Blob([textContent], { type: mimeType });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeCsvField(val) {
    if (val === null || val === undefined) return '';
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

// -------------------------------------------------------------
// Export 1: Synchronized Multi-Stream Master CSV
// -------------------------------------------------------------
function exportMasterCsv() {
    const activeEntries = Object.entries(appState.datasets).filter(([_, d]) => d && d.success && d.dataPoints);
    if (activeEntries.length === 0) {
        alert('No active sensor data available to export. Please load data first.');
        return;
    }

    const epochToIso = new Map();
    const epochToFmt = new Map();
    const streamMaps = {
        smartwatch_heart_rate: new Map(),
        chest_ecg_heart_rate: new Map(),
        vehicle_velocity: new Map(),
        vehicle_acceleration: new Map(),
        healthypi_gsr: new Map()
    };

    activeEntries.forEach(([sType, data]) => {
        const map = streamMaps[sType];
        data.dataPoints.forEach(pt => {
            if (!map.has(pt.epochMillis)) {
                map.set(pt.epochMillis, pt.value);
            }
            if (!epochToIso.has(pt.epochMillis) && pt.rawTimestamp) {
                epochToIso.set(pt.epochMillis, pt.rawTimestamp);
            }
            if (!epochToFmt.has(pt.epochMillis) && pt.formattedTime) {
                epochToFmt.set(pt.epochMillis, pt.formattedTime);
            }
        });
    });

    const sortedEpochs = Array.from(epochToIso.keys()).sort((a, b) => a - b);
    if (sortedEpochs.length === 0) {
        alert('No timestamped observations found.');
        return;
    }

    let csv = '\uFEFFtimestamp_iso,formatted_time,epoch_millis,smartwatch_heart_rate_bpm,chest_ecg_heart_rate_bpm,vehicle_velocity_kmh,vehicle_acceleration_ms2,healthypi_gsr_detrended\r\n';

    sortedEpochs.forEach(epoch => {
        const iso = epochToIso.get(epoch) || '';
        const fmt = epochToFmt.get(epoch) || '';
        const sw = streamMaps.smartwatch_heart_rate.get(epoch);
        const chest = streamMaps.chest_ecg_heart_rate.get(epoch);
        const vel = streamMaps.vehicle_velocity.get(epoch);
        const acc = streamMaps.vehicle_acceleration.get(epoch);
        const gsr = streamMaps.healthypi_gsr.get(epoch);

        csv += [
            escapeCsvField(iso),
            escapeCsvField(fmt),
            epoch,
            sw !== undefined ? sw.toFixed(2) : '',
            chest !== undefined ? chest.toFixed(2) : '',
            vel !== undefined ? vel.toFixed(2) : '',
            acc !== undefined ? acc.toFixed(3) : '',
            gsr !== undefined ? gsr.toFixed(2) : ''
        ].join(',') + '\r\n';
    });

    downloadBlob('master_synced_processed_timeline.csv', csv);
}

// -------------------------------------------------------------
// Export 2: Individual Processed Sensor CSV
// -------------------------------------------------------------
function exportSensorCsv(sensorType) {
    const data = appState.datasets[sensorType];
    if (!data || !data.success || !data.dataPoints || data.dataPoints.length === 0) {
        alert(`No data available to export for ${SENSOR_CONFIG[sensorType]?.name || sensorType}.`);
        return;
    }

    const cfg = SENSOR_CONFIG[sensorType] || { name: sensorType, unit: '' };
    let csv = '\uFEFFtimestamp_iso,formatted_time,epoch_millis,value,sensor_type,sensor_name,unit\r\n';

    data.dataPoints.forEach(pt => {
        csv += [
            escapeCsvField(pt.rawTimestamp),
            escapeCsvField(pt.formattedTime),
            pt.epochMillis,
            typeof pt.value === 'number' ? pt.value.toFixed(4) : pt.value,
            escapeCsvField(sensorType),
            escapeCsvField(cfg.name),
            escapeCsvField(cfg.unit)
        ].join(',') + '\r\n';
    });

    downloadBlob(`processed_${sensorType}.csv`, csv);
}

function exportAllIndividualCsvs() {
    const activeSensors = Object.keys(SENSOR_CONFIG).filter(t => appState.datasets[t] && appState.datasets[t].success);
    if (activeSensors.length === 0) {
        alert('No active sensor streams loaded.');
        return;
    }

    activeSensors.forEach((sensorType, index) => {
        setTimeout(() => exportSensorCsv(sensorType), index * 300);
    });
}

// -------------------------------------------------------------
// Export 3: Cross-Sensor Matched Pairs CSV
// -------------------------------------------------------------
function generateMatchedCsv(relationType) {
    const vel = appState.datasets.vehicle_velocity;
    const acc = appState.datasets.vehicle_acceleration;
    const sw = appState.datasets.smartwatch_heart_rate;
    const chest = appState.datasets.chest_ecg_heart_rate;
    const gsr = appState.datasets.healthypi_gsr;

    if (relationType === 'hr_vel') {
        const isSw = appState.activeSubToggles.hrVel === 'sw';
        const hr = isSw ? sw : chest;
        const hrName = isSw ? 'Smartwatch Heart Rate' : 'Chest ECG Heart Rate';
        if (!vel || !hr) return null;

        const match = exactMatchStreams(vel, hr);
        if (!match.sufficient) return null;

        let csv = `\uFEFF# CS5013 Matched Relationship: ${hrName} vs Vehicle Velocity\r\n`;
        csv += `# Total Synchronized Matches: ${match.count}\r\n`;
        csv += `timestamp_iso,formatted_time,epoch_millis,vehicle_velocity_kmh,heart_rate_bpm,sensor_used\r\n`;
        match.points.forEach(pt => {
            csv += [
                escapeCsvField(pt.rawX || pt.rawY),
                escapeCsvField(pt.formattedTime),
                pt.epochMillis,
                pt.x.toFixed(2),
                pt.y.toFixed(2),
                escapeCsvField(hrName)
            ].join(',') + '\r\n';
        });
        return { filename: `matched_${isSw ? 'smartwatch' : 'chest'}_hr_vs_velocity.csv`, csv };
    }

    if (relationType === 'hr_acc') {
        const isSw = appState.activeSubToggles.hrAcc === 'sw';
        const hr = isSw ? sw : chest;
        const hrName = isSw ? 'Smartwatch Heart Rate' : 'Chest ECG Heart Rate';
        if (!acc || !hr) return null;

        const match = exactMatchStreams(acc, hr);
        if (!match.sufficient) return null;

        let csv = `\uFEFF# CS5013 Matched Relationship: ${hrName} vs Vehicle Acceleration\r\n`;
        csv += `# Total Synchronized Matches: ${match.count}\r\n`;
        csv += `timestamp_iso,formatted_time,epoch_millis,vehicle_acceleration_ms2,heart_rate_bpm,sensor_used\r\n`;
        match.points.forEach(pt => {
            csv += [
                escapeCsvField(pt.rawX || pt.rawY),
                escapeCsvField(pt.formattedTime),
                pt.epochMillis,
                pt.x.toFixed(3),
                pt.y.toFixed(2),
                escapeCsvField(hrName)
            ].join(',') + '\r\n';
        });
        return { filename: `matched_${isSw ? 'smartwatch' : 'chest'}_hr_vs_acceleration.csv`, csv };
    }

    if (relationType === 'vel_acc') {
        if (!vel || !acc) return null;
        const match = exactMatchStreams(vel, acc);
        if (!match.sufficient) return null;

        let csv = `\uFEFF# CS5013 Matched Relationship: Vehicle Velocity vs Vehicle Acceleration\r\n`;
        csv += `# Total Synchronized Matches: ${match.count}\r\n`;
        csv += `timestamp_iso,formatted_time,epoch_millis,vehicle_velocity_kmh,vehicle_acceleration_ms2\r\n`;
        match.points.forEach(pt => {
            csv += [
                escapeCsvField(pt.rawX || pt.rawY),
                escapeCsvField(pt.formattedTime),
                pt.epochMillis,
                pt.x.toFixed(2),
                pt.y.toFixed(3)
            ].join(',') + '\r\n';
        });
        return { filename: 'matched_velocity_vs_acceleration.csv', csv };
    }

    if (relationType === 'hr_agreement') {
        if (!sw || !chest) return null;
        const match = exactMatchStreams(chest, sw);
        if (!match.sufficient) return null;

        let csv = `\uFEFF# CS5013 Sensor Agreement Analysis: Smartwatch HR vs Chest ECG Monitor\r\n`;
        csv += `# Total Synchronized Seconds: ${match.count}\r\n`;
        csv += `timestamp_iso,formatted_time,epoch_millis,chest_ecg_hr_bpm,smartwatch_hr_bpm,diff_smartwatch_minus_chest_bpm\r\n`;
        match.points.forEach(pt => {
            const diff = pt.y - pt.x;
            csv += [
                escapeCsvField(pt.rawX || pt.rawY),
                escapeCsvField(pt.formattedTime),
                pt.epochMillis,
                pt.x.toFixed(2),
                pt.y.toFixed(2),
                diff.toFixed(2)
            ].join(',') + '\r\n';
        });
        return { filename: 'matched_sensor_agreement_watch_vs_chest.csv', csv };
    }

    if (relationType === 'gsr_rel') {
        if (!gsr) return null;
        const targetType = appState.activeSubToggles.gsrRel;
        const targetStream = appState.datasets[
            targetType === 'vel' ? 'vehicle_velocity' :
            targetType === 'acc' ? 'vehicle_acceleration' :
            targetType === 'sw' ? 'smartwatch_heart_rate' : 'chest_ecg_heart_rate'
        ];
        if (!targetStream) return null;

        const match = exactMatchStreams(targetStream, gsr);
        if (!match.sufficient) return null;

        const targetLabel = targetType === 'vel' ? 'velocity_kmh' :
                            targetType === 'acc' ? 'acceleration_ms2' :
                            targetType === 'sw' ? 'smartwatch_hr_bpm' : 'chest_ecg_hr_bpm';

        let csv = `\uFEFF# CS5013 Matched Relationship: GSR vs ${targetLabel}\r\n`;
        csv += `# Total Synchronized Matches: ${match.count}\r\n`;
        csv += `timestamp_iso,formatted_time,epoch_millis,${targetLabel},detrended_gsr_adc\r\n`;
        match.points.forEach(pt => {
            csv += [
                escapeCsvField(pt.rawX || pt.rawY),
                escapeCsvField(pt.formattedTime),
                pt.epochMillis,
                pt.x.toFixed(3),
                pt.y.toFixed(2)
            ].join(',') + '\r\n';
        });
        return { filename: `matched_gsr_vs_${targetType}.csv`, csv };
    }

    return null;
}

function exportAllMatchedCsvs() {
    const list = ['hr_vel', 'hr_acc', 'vel_acc', 'hr_agreement', 'gsr_rel'];
    let delay = 0;
    let foundAny = false;

    list.forEach(relType => {
        const res = generateMatchedCsv(relType);
        if (res) {
            foundAny = true;
            setTimeout(() => downloadBlob(res.filename, res.csv), delay);
            delay += 300;
        }
    });

    if (!foundAny) {
        alert('No cross-sensor relationships currently have sufficient matching data.');
    }
}

// -------------------------------------------------------------
// Export 4: Complete Processed Data Bundle (JSON)
// -------------------------------------------------------------
function exportJsonBundle() {
    const bundle = {
        application: 'Multi-Modal Transportation Data Fusion Platform',
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        summary: {
            activeStreamCount: Object.values(appState.datasets).filter(d => d && d.success).length,
            totalObservations: Object.values(appState.datasets).reduce((acc, d) => acc + (d ? d.validDataPointsCount || 0 : 0), 0)
        },
        streams: {},
        crossSensorMatches: {}
    };

    Object.entries(appState.datasets).forEach(([sType, data]) => {
        if (data && data.success) {
            bundle.streams[sType] = {
                sensorType: sType,
                filename: data.filename,
                unit: data.unit,
                validDataPointsCount: data.validDataPointsCount,
                corruptedDataPointsCount: data.corruptedDataPointsCount,
                minValue: data.minValue,
                maxValue: data.maxValue,
                meanValue: data.meanValue,
                timeSpanStartIso: data.timeSpanStartIso,
                timeSpanEndIso: data.timeSpanEndIso,
                dataPoints: data.dataPoints
            };
        }
    });

    // Add active relationship pairs
    ['hr_vel', 'hr_acc', 'vel_acc', 'hr_agreement', 'gsr_rel'].forEach(rel => {
        const matched = generateMatchedCsv(rel);
        if (matched) {
            bundle.crossSensorMatches[rel] = {
                filename: matched.filename,
                status: 'matched'
            };
        }
    });

    const jsonStr = JSON.stringify(bundle, null, 2);
    downloadBlob('processed_transportation_data_bundle.json', jsonStr, 'application/json;charset=utf-8;');
}

// -------------------------------------------------------------
// Export 5: Batch Download Everything
// -------------------------------------------------------------
function exportBatchAll() {
    exportMasterCsv();
    setTimeout(() => exportAllIndividualCsvs(), 400);
    setTimeout(() => exportAllMatchedCsvs(), 1200);
    setTimeout(() => exportJsonBundle(), 2000);
}

