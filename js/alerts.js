import { appState, saveState } from './state.js';
import {
    escapeHtml,
    generateId,
    getTodayKey,
    getCurrentTimeStr,
    formatDateTimeLabel
} from './utils.js';

export const alertsUi = {
    editingAlertId: null
};

export function getDueAlertsNow() {
    const today = getTodayKey();
    const nowTime = getCurrentTimeStr();
    return appState.alerts.filter(a => {
        if (!a.active) return false;
        if (a.date < today) return true;
        if (a.date === today && a.time <= nowTime) return true;
        return false;
    });
}

export function renderAlertsSection() {
    const dueAlerts = getDueAlertsNow();

    return `
        <div class="row-between mb-3">
            <div>
                <p class="eyebrow">Recordatorios</p>
                <h1 class="page-title">Avisos</h1>
            </div>
            <button data-action="open-alert-modal" class="btn-primary">+ Aviso</button>
        </div>

        <div class="app-card mb-3" style="border-left: 4px solid var(--accent-color);">
            <p class="sec-title">ℹ️ Recordatorios locales en iOS</p>
            <p class="meta-text" style="margin-top: 4px;">
                Esta app funciona 100% sin servidor: los avisos programados se muestran como banner dentro de la app al abrirla o cuando llega su hora. Para notificaciones push con la app cerrada se requiere un servidor backend (APNs / Web Push).
            </p>
        </div>

        ${dueAlerts.length > 0 ? `
            <div class="app-card mb-3" style="background: rgba(225, 29, 72, 0.12); border: 1.5px solid #E11D48;">
                <p class="sec-title" style="color: #E11D48;">🔔 Avisos vencidos o activos ahora (${dueAlerts.length})</p>
                <div class="col-stack mt-2">
                    ${dueAlerts.map(a => `<div class="meta-text" style="font-weight: 800; color: var(--text-primary);">• ${escapeHtml(a.title)} (${escapeHtml(formatDateTimeLabel(a.date, a.time))})</div>`).join('')}
                </div>
            </div>
        ` : ''}

        <div class="app-card mb-3">
            <div class="row-between mb-2">
                <div>
                    <p class="sec-title">☀️ Resumen Matutino al abrir</p>
                    <p class="meta-text">Se muestra al abrir la app a partir de las ${escapeHtml(appState.morning.time)}</p>
                </div>
                <button data-action="toggle-morning-alert" aria-label="Activar resumen matutino" class="ui-switch ${appState.morning.enabled ? 'on' : ''}"><span class="ui-switch-thumb"></span></button>
            </div>
            <button data-action="trigger-push-preview" class="btn-block btn-soft">🔔 Probar banner de resumen ahora</button>
        </div>

        <div class="col-stack">
            ${appState.alerts.length === 0 ? `<div class="app-card meta-text" style="text-align: center;">No tienes avisos creados todavía.</div>` : appState.alerts.map(al => {
                const safeId = escapeHtml(al.id);
                return `
                <div class="app-card row-between">
                    <button data-action="edit-alert" data-id="${safeId}" class="flex-1" style="text-align: left;">
                        <span class="meta-text" style="display: block; font-weight: 800; color: #E11D48;">${escapeHtml(al.level)} · ${escapeHtml(formatDateTimeLabel(al.date, al.time))}</span>
                        <span class="sec-title truncate" style="display: block;">${escapeHtml(al.title)}</span>
                    </button>
                    <div class="row-center">
                        <button data-action="toggle-alert" data-id="${safeId}" aria-label="Activar o desactivar aviso" class="ui-switch ${al.active ? 'on' : ''}"><span class="ui-switch-thumb"></span></button>
                        <button data-action="edit-alert" data-id="${safeId}" aria-label="Editar aviso" class="chip-btn">✏️</button>
                        <button data-action="delete-alert" data-id="${safeId}" aria-label="Eliminar aviso" class="chip-btn">✕</button>
                    </div>
                </div>`;
            }).join('')}
        </div>
    `;
}

export function renderAlertModalContent(alertId = null) {
    alertsUi.editingAlertId = alertId;
    const existing = alertId ? appState.alerts.find(a => a.id === alertId) : null;

    return `
        <div class="row-between mb-3">
            <button data-action="close-modal" data-modal="alert" class="meta-text" style="font-weight: 700;">Cancelar</button>
            <span class="sec-title">${existing ? 'Editar Aviso' : 'Nuevo Aviso'}</span>
            <button data-action="save-alert" class="sec-title" style="color: var(--accent-color);">Guardar</button>
        </div>
        <input id="al-title" type="text" value="${escapeHtml(existing ? existing.title : '')}" placeholder="Recordatorio importante..." class="ui-input mb-2">
        <div class="grid-2 mb-2">
            <div>
                <label class="eyebrow mb-2" style="display: block;">Fecha</label>
                <input id="al-date" type="date" value="${escapeHtml(existing ? existing.date : getTodayKey())}" class="ui-input">
            </div>
            <div>
                <label class="eyebrow mb-2" style="display: block;">Hora</label>
                <input id="al-time" type="time" value="${escapeHtml(existing ? existing.time : '09:30')}" class="ui-input">
            </div>
        </div>
        <select id="al-level" class="ui-input">
            <option value="Urgente" ${existing?.level === 'Urgente' ? 'selected' : ''}>🔴 Urgente</option>
            <option value="Alta" ${existing?.level === 'Alta' ? 'selected' : ''}>🟠 Alta</option>
            <option value="Media" ${!existing || existing.level === 'Media' ? 'selected' : ''}>🔵 Media</option>
        </select>
    `;
}

export function saveAlertFromModal() {
    const title = (document.getElementById('al-title')?.value || '').trim();
    if (!title) return false;
    const date = document.getElementById('al-date')?.value || getTodayKey();
    const time = document.getElementById('al-time')?.value || '09:00';
    const level = document.getElementById('al-level')?.value || 'Media';

    if (alertsUi.editingAlertId) {
        const al = appState.alerts.find(x => x.id === alertsUi.editingAlertId);
        if (al) {
            al.title = title;
            al.date = date;
            al.time = time;
            al.level = level;
        }
    } else {
        appState.alerts.unshift({
            id: generateId(),
            title,
            date,
            time,
            level,
            active: true
        });
    }
    alertsUi.editingAlertId = null;
    saveState();
    return true;
}
