import { appState, saveState } from './state.js';
import { isTaskOverdue } from './tasks.js';
import {
    escapeHtml,
    generateId,
    getTodayKey,
    getCurrentWeekDates,
    formatShortDate,
    monthNames,
    calendarColors,
    getCategoryMeta
} from './utils.js';

const now = new Date();

export const calendarUi = {
    year: now.getFullYear(),
    month: now.getMonth(),
    selectedDate: getTodayKey(),
    viewMode: 'month', // 'month' | 'week'
    selectedColor: 'blue',
    editingEventId: null
};

/* Calcula eventos de tareas + recurrencia semanal de eventos al vuelo */
export function getCalendarEventsForDate(dateStr) {
    const targetDate = new Date(dateStr + 'T00:00:00');
    const targetDow = targetDate.getDay();

    const manual = appState.events
        .filter(ev => {
            if (ev.date === dateStr) return true;
            if (ev.recurrence === 'weekly' && ev.date <= dateStr) {
                const startDow = new Date(ev.date + 'T00:00:00').getDay();
                return startDow === targetDow;
            }
            return false;
        })
        .map(ev => ({
            ...ev,
            isAllDay: !ev.time
        }));

    const taskEvs = appState.tasks
        .filter(t => t.dueDate === dateStr)
        .map(t => {
            const catMeta = getCategoryMeta(t.category);
            return {
                id: `task_ev_${t.id}`,
                linkedTaskId: t.id,
                date: t.dueDate,
                time: t.dueTime || '',
                endTime: '',
                isAllDay: !t.dueTime,
                title: `${t.done ? '☑️' : '✅'} ${t.title}`,
                color: catMeta.color,
                done: t.done,
                overdue: isTaskOverdue(t)
            };
        });

    // Ordenar "Todo el día" ANTES que las horas
    return [...manual, ...taskEvs].sort((a, b) => {
        if (a.isAllDay !== b.isAllDay) return a.isAllDay ? -1 : 1;
        return (a.time || '').localeCompare(b.time || '');
    });
}

export function renderCalendarSection() {
    const currentTodayKey = getTodayKey();
    const weekDates = getCurrentWeekDates();
    const dayLabels = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

    let gridHtml = '';
    if (calendarUi.viewMode === 'week') {
        gridHtml = `
            <div class="grid-7">
                ${weekDates.map((ds, idx) => {
                    const dayNum = parseInt(ds.split('-')[2], 10);
                    const evs = getCalendarEventsForDate(ds);
                    const sel = calendarUi.selectedDate === ds;
                    return `<button data-action="select-cal-date" data-date="${ds}" style="height: 54px; border-radius: 14px; display: flex; flex-direction: column; align-items: center; justify-content: center; background-color: ${sel ? 'var(--accent-color)' : ds === currentTodayKey ? 'var(--accent-soft)' : 'var(--bg-screen)'}; color: ${sel ? '#FFF' : 'var(--text-primary)'};">
                        <span style="font-size: 11px; font-weight: 800; opacity: 0.75;">${dayLabels[idx]}</span>
                        <span style="font-size: 14px; font-weight: 800;">${dayNum}</span>
                        <span style="font-size: 11px; line-height: 1;">${evs.length > 0 ? '•' : '&nbsp;'}</span>
                    </button>`;
                }).join('')}
            </div>
        `;
    } else {
        const firstDay = (new Date(calendarUi.year, calendarUi.month, 1).getDay() + 6) % 7;
        const daysInMonth = new Date(calendarUi.year, calendarUi.month + 1, 0).getDate();
        let cells = '';
        for (let i = 0; i < firstDay; i++) cells += `<div></div>`;
        for (let d = 1; d <= daysInMonth; d++) {
            const ds = `${calendarUi.year}-${String(calendarUi.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const evs = getCalendarEventsForDate(ds);
            const sel = calendarUi.selectedDate === ds;
            cells += `<button data-action="select-cal-date" data-date="${ds}" style="height: 40px; border-radius: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; background-color: ${sel ? 'var(--accent-color)' : ds === currentTodayKey ? 'var(--accent-soft)' : 'transparent'}; color: ${sel ? '#FFF' : 'var(--text-primary)'};">
                <span style="font-size: 12.5px; font-weight: 800; line-height: 1;">${d}</span>
                <div style="display: flex; gap: 2px; margin-top: 4px; height: 4px;">
                    ${evs.slice(0, 3).map(e => `<span style="width: 4px; height: 4px; border-radius: 999px; background-color: ${sel ? '#FFF' : e.overdue ? '#EF4444' : (calendarColors.find(c => c.id === e.color)?.hex || '#0066D6')};"></span>`).join('')}
                </div>
            </button>`;
        }
        gridHtml = `
            <div class="grid-7 meta-text mb-2" style="text-align: center; font-weight: 800;">
                ${dayLabels.map(l => `<span>${l}</span>`).join('')}
            </div>
            <div class="grid-7">${cells}</div>
        `;
    }

    const dayEvs = getCalendarEventsForDate(calendarUi.selectedDate);

    return `
        <div class="row-between mb-3">
            <div>
                <p class="eyebrow">Agenda</p>
                <h1 class="page-title" style="font-size: 21px;">${monthNames[calendarUi.month]} ${calendarUi.year}</h1>
            </div>
            <div class="row-center">
                <button data-action="shift-cal-month" data-delta="-1" aria-label="Mes anterior" class="icon-circle-btn" style="width: 34px; height: 34px;">‹</button>
                <button data-action="shift-cal-month" data-delta="1" aria-label="Mes siguiente" class="icon-circle-btn" style="width: 34px; height: 34px;">›</button>
                <button data-action="open-event-modal" class="btn-primary">+ Evento</button>
            </div>
        </div>

        <div class="app-card mb-3">
            <div class="row-between mb-2">
                <span class="meta-text" style="font-weight: 700;">Vista de calendario</span>
                <div class="row-center">
                    <button data-action="set-cal-view" data-view="month" class="chip-btn ${calendarUi.viewMode === 'month' ? 'active' : ''}">Mes</button>
                    <button data-action="set-cal-view" data-view="week" class="chip-btn ${calendarUi.viewMode === 'week' ? 'active' : ''}">Semana</button>
                </div>
            </div>
            ${gridHtml}
        </div>

        <p class="sec-title mb-2">Eventos y tareas (${escapeHtml(formatShortDate(calendarUi.selectedDate))})</p>
        <div class="col-stack">
            ${dayEvs.length === 0 ? `<div class="app-card meta-text" style="text-align: center;">Sin eventos ni tareas este día.</div>` : dayEvs.map(ev => {
                const col = calendarColors.find(c => c.id === ev.color) || calendarColors[0];
                const isLinkedTask = Boolean(ev.linkedTaskId);
                const targetId = escapeHtml(isLinkedTask ? ev.linkedTaskId : ev.id);
                const timeLabel = ev.isAllDay ? 'Todo el día' : (ev.endTime ? `${ev.time} – ${ev.endTime}` : ev.time);
                return `<div class="app-card row-between" style="border-left: 4px solid ${ev.overdue ? '#EF4444' : col.hex}; ${ev.overdue ? 'background-color: rgba(239, 68, 68, 0.11);' : ''}">
                    <button data-action="${isLinkedTask ? 'toggle-task' : 'edit-event'}" data-id="${targetId}" class="flex-1" style="text-align: left;">
                        <span class="meta-text" style="display: block; font-weight: 800; color: ${ev.overdue ? '#DC2626' : col.hex};">
                            ${isLinkedTask ? 'Tarea' : escapeHtml(col.name.split(' ')[0])} · ${escapeHtml(timeLabel)}${ev.recurrence === 'weekly' ? ' · 🔁 Semanal' : ''}${ev.overdue ? ' · ⚠️ Vencida' : ''}
                        </span>
                        <span class="sec-title truncate" style="display: block; ${ev.done ? 'text-decoration: line-through; opacity: 0.55;' : ev.overdue ? 'color: #DC2626;' : ''}">${escapeHtml(ev.title)}</span>
                    </button>
                    <div class="row-center">
                        ${!isLinkedTask ? `<button data-action="edit-event" data-id="${targetId}" aria-label="Editar evento" class="chip-btn">✏️</button>` : ''}
                        <button data-action="${isLinkedTask ? 'delete-task' : 'delete-event'}" data-id="${targetId}" aria-label="Eliminar" class="chip-btn">✕</button>
                    </div>
                </div>`;
            }).join('')}
        </div>
    `;
}

export function renderEventModalContent(eventId = null) {
    calendarUi.editingEventId = eventId;
    const existing = eventId ? appState.events.find(e => e.id === eventId) : null;
    if (existing) calendarUi.selectedColor = existing.color || 'blue';

    return `
        <div class="row-between mb-3">
            <button data-action="close-modal" data-modal="event" class="meta-text" style="font-weight: 700;">Cancelar</button>
            <span class="sec-title">${existing ? 'Editar Evento' : 'Nuevo Evento'}</span>
            <button data-action="save-event" class="sec-title" style="color: var(--accent-color);">Guardar</button>
        </div>
        <input id="ev-title" type="text" value="${escapeHtml(existing ? existing.title : '')}" placeholder="Título del evento..." class="ui-input mb-2">
        <div class="mb-2">
            <label class="eyebrow mb-2" style="display: block;">Fecha</label>
            <input id="ev-date" type="date" value="${escapeHtml(existing ? existing.date : calendarUi.selectedDate)}" class="ui-input">
        </div>
        <div class="grid-2 mb-2">
            <div>
                <label class="eyebrow mb-2" style="display: block;">Inicio (vacío = Todo el día)</label>
                <input id="ev-time" type="time" value="${escapeHtml(existing ? (existing.time || '') : '10:00')}" class="ui-input">
            </div>
            <div>
                <label class="eyebrow mb-2" style="display: block;">Hora de fin</label>
                <input id="ev-end-time" type="time" value="${escapeHtml(existing ? (existing.endTime || '') : '11:00')}" class="ui-input">
            </div>
        </div>
        <div class="mb-3">
            <label class="eyebrow mb-2" style="display: block;">Repetición</label>
            <select id="ev-recurrence" class="ui-input">
                <option value="none" ${!existing || existing.recurrence === 'none' ? 'selected' : ''}>No se repite</option>
                <option value="weekly" ${existing?.recurrence === 'weekly' ? 'selected' : ''}>🔁 Cada semana</option>
            </select>
        </div>
        <div class="row-wrap">
            ${calendarColors.map(c => `<button type="button" data-action="pick-event-color" data-color="${c.id}" class="chip-btn" style="flex: 1; text-align: center; background-color: ${c.hex}; color: #FFF; border: ${calendarUi.selectedColor === c.id ? '2px solid var(--text-primary)' : 'none'};">${escapeHtml(c.name.split(' ')[0])}</button>`).join('')}
        </div>
    `;
}

export function saveEventFromModal() {
    const title = (document.getElementById('ev-title')?.value || '').trim();
    if (!title) return false;
    const date = document.getElementById('ev-date')?.value || calendarUi.selectedDate;
    const time = document.getElementById('ev-time')?.value || '';
    const endTime = time ? (document.getElementById('ev-end-time')?.value || '') : '';
    const recurrence = document.getElementById('ev-recurrence')?.value || 'none';

    if (calendarUi.editingEventId) {
        const ev = appState.events.find(x => x.id === calendarUi.editingEventId);
        if (ev) {
            ev.title = title;
            ev.date = date;
            ev.time = time;
            ev.endTime = endTime;
            ev.recurrence = recurrence;
            ev.color = calendarUi.selectedColor;
        }
    } else {
        appState.events.push({
            id: generateId(),
            date,
            time,
            endTime,
            recurrence,
            title,
            color: calendarUi.selectedColor
        });
    }
    calendarUi.editingEventId = null;
    saveState();
    return true;
}

export function deleteEventItem(id) {
    const idx = appState.events.findIndex(x => x.id === id);
    if (idx === -1) return null;
    const removed = appState.events[idx];
    appState.events.splice(idx, 1);
    saveState();
    return { removed, idx };
}
