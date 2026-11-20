import { appState, saveState, evaluateTodayStreak } from './state.js';
import { getTodayRelevantTasks } from './tasks.js';
import { escapeHtml, generateId, getTodayKey, formatShortDate } from './utils.js';

export const runUi = {
    recording: false,
    startTime: null,
    seconds: 0,
    km: 0,
    path: [],
    center: [40.4168, -3.7038],
    city: 'Listo para GPS',
    hasLocated: false,
    selectedLogId: null,
    timerId: null,
    watchId: null,
    leafletMap: null,
    leafletPolyline: null,
    leafletMarker: null,
    nominatimTimer: null,
    lastNominatimCall: 0
};

export function calcGeoDist(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function initOrUpdateLeafletMap() {
    const container = document.getElementById('leaflet-map');
    if (!container || typeof window.L === 'undefined') return;

    // Si el contenedor se recreó, reiniciar instancia de Leaflet
    if (runUi.leafletMap && runUi.leafletMap.getContainer() !== container) {
        runUi.leafletMap.remove();
        runUi.leafletMap = null;
        runUi.leafletPolyline = null;
        runUi.leafletMarker = null;
    }

    if (!runUi.leafletMap) {
        runUi.leafletMap = window.L.map(container, {
            zoomControl: true,
            attributionControl: true
        }).setView(runUi.center, 15);

        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap'
        }).addTo(runUi.leafletMap);
    }

    setTimeout(() => {
        if (runUi.leafletMap) runUi.leafletMap.invalidateSize();
    }, 60);

    const selectedLog = runUi.selectedLogId ? appState.runLogs.find(l => l.id === runUi.selectedLogId) : null;
    const activePath = runUi.recording && runUi.path.length > 0 ? runUi.path : (selectedLog?.path || []);

    if (runUi.leafletPolyline) {
        runUi.leafletPolyline.remove();
        runUi.leafletPolyline = null;
    }
    if (runUi.leafletMarker) {
        runUi.leafletMarker.remove();
        runUi.leafletMarker = null;
    }

    if (activePath.length > 0) {
        runUi.leafletPolyline = window.L.polyline(activePath, {
            color: runUi.recording ? '#10B981' : '#0066D6',
            weight: 5,
            opacity: 0.92
        }).addTo(runUi.leafletMap);

        const lastPt = activePath[activePath.length - 1];
        runUi.leafletMarker = window.L.circleMarker(lastPt, {
            radius: 7,
            color: '#FFFFFF',
            weight: 2,
            fillColor: runUi.recording ? '#10B981' : '#0066D6',
            fillOpacity: 1
        }).addTo(runUi.leafletMap);

        if (activePath.length > 1 && !runUi.recording) {
            runUi.leafletMap.fitBounds(runUi.leafletPolyline.getBounds(), { padding: [24, 24] });
        } else {
            runUi.leafletMap.setView(lastPt, runUi.leafletMap.getZoom());
        }
    } else {
        runUi.leafletMap.setView(runUi.center, runUi.leafletMap.getZoom());
    }
}

export function locateUserCity(silent = false) {
    const lbl = document.getElementById('run-city-label');
    runUi.hasLocated = true;
    if (!('geolocation' in navigator)) {
        if (!silent && lbl) lbl.textContent = 'GPS no disponible · Usa el buscador';
        return;
    }
    if (lbl) lbl.textContent = 'Obteniendo ubicación real...';
    navigator.geolocation.getCurrentPosition(pos => {
        const c = [pos.coords.latitude, pos.coords.longitude];
        runUi.center = c;
        runUi.city = `Ubicación GPS (${c[0].toFixed(4)}, ${c[1].toFixed(4)})`;
        if (lbl) lbl.textContent = runUi.city;
        initOrUpdateLeafletMap();
    }, () => {
        runUi.city = 'Permiso GPS pendiente · Busca tu ciudad';
        if (lbl) lbl.textContent = runUi.city;
    }, { enableHighAccuracy: true, timeout: 8000 });
}

/* Debounce + mínimo 1.1s entre llamadas para cumplir política de uso de Nominatim */
export function scheduleNominatimSearch(query) {
    clearTimeout(runUi.nominatimTimer);
    runUi.nominatimTimer = setTimeout(() => {
        searchRunLocation(query);
    }, 650);
}

export async function searchRunLocation(forcedQuery = null) {
    const inp = document.getElementById('run-search');
    const query = (forcedQuery !== null ? forcedQuery : (inp?.value || '')).trim();
    if (query.length < 3) return;

    const now = Date.now();
    if (now - runUi.lastNominatimCall < 1100) return;
    runUi.lastNominatimCall = now;

    const lbl = document.getElementById('run-city-label');
    if (lbl) lbl.textContent = `Buscando "${query}"...`;
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`, {
            headers: { 'Accept-Language': 'es' }
        });
        const data = await res.json();
        if (data && data[0]) {
            const lat = parseFloat(data[0].lat);
            const lon = parseFloat(data[0].lon);
            runUi.center = [lat, lon];
            runUi.city = data[0].display_name.split(',').slice(0, 2).join(',');
            runUi.selectedLogId = null;
            if (lbl) lbl.textContent = runUi.city;
            initOrUpdateLeafletMap();
        } else if (lbl) {
            lbl.textContent = 'No encontrado · Prueba otra calle o ciudad';
        }
    } catch (err) {
        console.warn('Error Nominatim:', err);
        if (lbl) lbl.textContent = runUi.city;
    }
}

export function syncRunClock() {
    if (!runUi.recording || !runUi.startTime) return;
    runUi.seconds = Math.max(0, Math.floor((Date.now() - runUi.startTime) / 1000));
    const tEl = document.getElementById('run-time');
    const kEl = document.getElementById('run-km');
    const pEl = document.getElementById('run-pace');
    if (tEl) tEl.textContent = `${String(Math.floor(runUi.seconds / 60)).padStart(2, '0')}:${String(runUi.seconds % 60).padStart(2, '0')}`;
    if (kEl) kEl.textContent = `${runUi.km.toFixed(2)} km`;
    if (pEl && runUi.km > 0.02) {
        const paceSec = Math.round(runUi.seconds / runUi.km);
        pEl.textContent = `${Math.floor(paceSec / 60)}:${String(paceSec % 60).padStart(2, '0')} /km`;
    }
}

export function simulateStepForward() {
    if (!runUi.recording) return;
    const last = runUi.path[runUi.path.length - 1] || runUi.center;
    const next = [last[0] + 0.0007, last[1] + 0.0005];
    runUi.km += calcGeoDist(last[0], last[1], next[0], next[1]);
    runUi.path.push(next);
    runUi.center = next;
    initOrUpdateLeafletMap();
    syncRunClock();
}

export function toggleRunningSession() {
    if (!runUi.recording) {
        runUi.recording = true;
        runUi.startTime = Date.now();
        runUi.seconds = 0;
        runUi.km = 0;
        runUi.path = [[...runUi.center]];

        if ('geolocation' in navigator) {
            runUi.watchId = navigator.geolocation.watchPosition(pos => {
                // Filtro de precisión: descartar puntos con accuracy > 30m
                if (pos.coords.accuracy && pos.coords.accuracy > 30) return;

                const c = [pos.coords.latitude, pos.coords.longitude];
                if (runUi.path.length > 0) {
                    const last = runUi.path[runUi.path.length - 1];
                    const distKm = calcGeoDist(last[0], last[1], c[0], c[1]);
                    // Descartar deriva GPS menor a 4 metros (0.004 km)
                    if (distKm < 0.004) return;
                    runUi.km += distKm;
                }
                runUi.path.push(c);
                runUi.center = c;
                initOrUpdateLeafletMap();
                syncRunClock();
            }, () => {}, { enableHighAccuracy: true, maximumAge: 2000 });
        }

        runUi.timerId = setInterval(syncRunClock, 500);
        return false;
    } else {
        syncRunClock();
        clearInterval(runUi.timerId);
        if (runUi.watchId) navigator.geolocation.clearWatch(runUi.watchId);
        runUi.recording = false;
        runUi.startTime = null;

        // Guardar datos reales sin mínimos artificiales
        const realKm = parseFloat(runUi.km.toFixed(2));
        const realMins = parseFloat((runUi.seconds / 60).toFixed(1));
        const id = generateId();
        appState.runLogs.unshift({
            id,
            title: `Carrera GPS ${formatShortDate(getTodayKey())}`,
            city: runUi.city,
            km: realKm,
            mins: realMins,
            date: getTodayKey(),
            path: [...runUi.path]
        });
        runUi.selectedLogId = id;
        evaluateTodayStreak(getTodayRelevantTasks(), appState.routines.some(r => r.completedThisWeek));
        saveState();
        return true;
    }
}

export function renderRunningSection() {
    const devMode = Boolean(appState.settings.devMode);
    return `
        <div class="app-card mb-3">
            <div class="row-between mb-2">
                <div class="flex-1">
                    <p id="run-city-label" class="sec-title truncate">${escapeHtml(runUi.city)}</p>
                    <p class="meta-text">Mapa OpenStreetMap · Filtro GPS ≤ 30m</p>
                </div>
                <button data-action="locate-gps" class="chip-btn btn-soft">🎯 Mi GPS</button>
            </div>

            <div class="p-2 mb-2" style="background: rgba(234, 88, 12, 0.12); border-radius: 12px; padding: 8px 10px;">
                <p class="meta-text" style="color: #EA580C; font-weight: 700;">
                    ⚠️ En iOS Safari/PWA, si bloqueas la pantalla o sales de la app, el GPS en segundo plano puede pausarse.
                </p>
            </div>

            <div class="row-center mb-2">
                <input id="run-search" data-input="run-search-debounce" type="text" placeholder="Buscar calle o ciudad..." class="ui-input" style="padding: 8px 12px;">
                <button data-action="search-run-location" class="btn-primary" style="border-radius: 13px; padding: 9px 14px;">Ir</button>
            </div>

            <div class="running-map-box">
                <div id="leaflet-map"></div>
                ${runUi.recording ? `<div style="position: absolute; top: 10px; right: 10px; z-index: 400; padding: 4px 10px; border-radius: 999px; background: #E11D48; color: #FFF; font-size: 11px; font-weight: 800;">● EN VIVO</div>` : ''}
                ${runUi.selectedLogId && !runUi.recording ? `<button data-action="clear-selected-run" style="position: absolute; top: 10px; right: 10px; z-index: 400; padding: 5px 10px; border-radius: 999px; background: rgba(15,23,42,0.88); color: #FFF; font-size: 11px; font-weight: 800;">✕ Limpiar ruta</button>` : ''}
            </div>

            <div class="grid-3 mt-3" style="text-align: center;">
                <div style="background: var(--bg-screen); padding: 8px; border-radius: 14px;">
                    <p id="run-km" class="sec-title tabular" style="color: #059669;">${runUi.km.toFixed(2)} km</p>
                    <p class="eyebrow">Distancia</p>
                </div>
                <div style="background: var(--bg-screen); padding: 8px; border-radius: 14px;">
                    <p id="run-time" class="sec-title tabular">${String(Math.floor(runUi.seconds / 60)).padStart(2, '0')}:${String(runUi.seconds % 60).padStart(2, '0')}</p>
                    <p class="eyebrow">Tiempo</p>
                </div>
                <div style="background: var(--bg-screen); padding: 8px; border-radius: 14px;">
                    <p id="run-pace" class="sec-title tabular" style="color: var(--accent-color);">0:00 /km</p>
                    <p class="eyebrow">Ritmo</p>
                </div>
            </div>

            <div class="row-center mt-3">
                ${!runUi.recording
                    ? `<button data-action="toggle-run" class="btn-block btn-success">▶️ Iniciar Carrera GPS</button>`
                    : `${devMode ? `<button data-action="sim-run-step" class="btn-block btn-soft" style="flex: 1;">👟 +Simular (Dev)</button>` : ''}
                       <button data-action="toggle-run" class="btn-block" style="flex: 1; background: #DC2626; color: #FFF;">💾 Finalizar y Guardar</button>`
                }
            </div>
        </div>

        <p class="sec-title mb-2">🗺️ Rutas guardadas (${appState.runLogs.length})</p>
        <div class="col-stack">
            ${appState.runLogs.length === 0 ? `<div class="app-card meta-text" style="text-align: center;">Aún no has guardado ninguna carrera.</div>` : appState.runLogs.map(r => `
                <button data-action="select-saved-run" data-id="${escapeHtml(r.id)}" class="app-card row-between" style="width: 100%; text-align: left;">
                    <span>
                        <span class="meta-text" style="display: block; font-weight: 800; color: #059669;">🗺️ ${escapeHtml(formatShortDate(r.date))}</span>
                        <span class="sec-title">${escapeHtml(r.title)}</span>
                    </span>
                    <span class="sec-title" style="color: #059669;">${r.km} km · ${r.mins}m</span>
                </button>
            `).join('')}
        </div>
    `;
}
