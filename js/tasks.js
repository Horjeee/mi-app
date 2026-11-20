import { appState, saveState, evaluateTodayStreak } from './state.js';
import {
    escapeHtml,
    generateId,
    getTodayKey,
    getCurrentTimeStr,
    addDays,
    toDateKey,
    formatDateTimeLabel,
    formatShortDate,
    getCategoryMeta,
    taskCategories,
    playGentleChime
} from './utils.js';

export const tasksUi = {
    filter: 'all',
    searchQuery: '',
    showArchive: true,
    editingTaskId: null,
    focus: {
        activeTaskId: null,
        duration: 25 * 60,
        remaining: 25 * 60,
        endTime: null,
        running: false,
        finishedPrompt: false,
        timerId: null
    }
};

export function isTaskOverdue(t) {
    if (!t || t.done || !t.dueDate) return false;
    const today = getTodayKey();
    if (t.dueDate < today) return true;
    if (t.dueDate === today && t.dueTime) {
        return t.dueTime < getCurrentTimeStr();
    }
    return false;
}

export function isTaskArchived(t) {
    if (!t || !t.done) return false;
    if (t.recurrence && t.recurrence !== 'none') return false;
    const today = getTodayKey();
    return Boolean(t.completedDate && t.completedDate < today);
}

/* El progreso del día solo cuenta tareas de hoy, vencidas o sin fecha (excluye fechas futuras) */
export function getTodayRelevantTasks() {
    const today = getTodayKey();
    return appState.tasks.filter(t => {
        if (isTaskArchived(t)) return false;
        if (!t.dueDate) return true;
        return t.dueDate <= today;
    });
}

export function getDayProgressStats() {
    const relevant = getTodayRelevantTasks();
    const total = relevant.length;
    const done = relevant.filter(t => t.done).length;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    return { total, done, pct };
}

function priorityBadge(p) {
    if (p === 'alta') return `<span class="badge-pill" style="background: rgba(225,29,72,0.14); color: #E11D48;">🔴 Alta</span>`;
    if (p === 'baja') return `<span class="badge-pill" style="background: rgba(100,116,139,0.14); color: var(--text-secondary);">🟢 Baja</span>`;
    return '';
}

export function renderTasksSection() {
    const { total, done, pct } = getDayProgressStats();
    const dashOffset = 188.5 - (pct / 100) * 188.5;
    const fs = tasksUi.focus;
    const focusTask = fs.activeTaskId ? appState.tasks.find(t => t.id === fs.activeTaskId) : null;

    const activeTasks = appState.tasks.filter(t => !isTaskArchived(t));
    const archivedTasks = appState.tasks.filter(t => isTaskArchived(t));

    const q = tasksUi.searchQuery.trim().toLowerCase();
    const filtered = activeTasks
        .filter(t => {
            if (tasksUi.filter === 'pending' && t.done) return false;
            if (tasksUi.filter === 'done' && !t.done) return false;
            if (tasksUi.filter === 'today' && t.dueDate && t.dueDate > getTodayKey()) return false;
            if (q && !t.title.toLowerCase().includes(q) && !(t.category || '').toLowerCase().includes(q)) return false;
            return true;
        })
        .sort((a, b) => {
            if (a.done !== b.done) return a.done ? 1 : -1;
            const pOrder = { alta: 0, media: 1, baja: 2 };
            return (pOrder[a.priority] ?? 1) - (pOrder[b.priority] ?? 1);
        });

    return `
        <div class="row-between mb-3">
            <div>
                <p class="eyebrow">Productividad</p>
                <h1 class="page-title">Mis Tareas</h1>
            </div>
            <button data-action="open-task-modal" class="btn-primary tap-btn">+ Tarea</button>
        </div>

        ${focusTask ? `
            <div class="app-card mb-3" style="border: 1.5px solid var(--accent-color); background: linear-gradient(135deg, var(--accent-soft) 0%, var(--bg-card) 85%)">
                <div class="row-between mb-2">
                    <span class="eyebrow" style="color: var(--accent-color)">🍅 MODO FOCUS</span>
                    <button data-action="stop-focus" class="meta-text" style="font-weight: 800">✕ Cerrar</button>
                </div>
                <p class="sec-title truncate mb-2">${escapeHtml(focusTask.title)}</p>
                ${fs.finishedPrompt ? `
                    <div class="p-2" style="background: var(--bg-screen); border-radius: 14px;">
                        <p class="sec-title mb-2">⏰ ¡Tiempo terminado! ¿Has completado esta tarea?</p>
                        <div class="grid-2">
                            <button data-action="confirm-focus-done" class="btn-block btn-success">✓ Sí, completada</button>
                            <button data-action="dismiss-focus-prompt" class="btn-block btn-neutral">Seguir pendiente</button>
                        </div>
                    </div>
                ` : `
                    <div class="row-between">
                        <div id="focus-clock-display" class="tabular" style="font-size: 30px; font-weight: 900; color: var(--accent-color)">
                            ${String(Math.floor(fs.remaining / 60)).padStart(2, '0')}:${String(fs.remaining % 60).padStart(2, '0')}
                        </div>
                        <div class="row-center">
                            ${[15, 25, 45].map(m => `<button data-action="set-focus-mins" data-mins="${m}" class="chip-btn ${fs.duration === m * 60 ? 'active' : ''}">${m}m</button>`).join('')}
                        </div>
                    </div>
                    <div class="grid-2 mt-3">
                        <button data-action="toggle-focus-play" class="btn-block btn-neutral">
                            ${fs.running ? '⏸ Pausar' : '▶️ Reanudar'}
                        </button>
                        <button data-action="confirm-focus-done" class="btn-block btn-success">
                            ✓ Completar Tarea
                        </button>
                    </div>
                `}
            </div>
        ` : ''}

        <!-- Progreso solo de hoy/vencidas + buscador -->
        <div class="app-card mb-3">
            <div class="row-center mb-3" style="gap: 14px;">
                <div style="position: relative; width: 64px; height: 64px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                    <svg width="64" height="64" viewBox="0 0 70 70" aria-hidden="true">
                        <circle cx="35" cy="35" r="30" fill="none" stroke="var(--border-color)" stroke-width="6"/>
                        <circle class="progress-ring-circle" cx="35" cy="35" r="30" fill="none" stroke="var(--accent-color)" stroke-width="6" stroke-linecap="round" stroke-dasharray="188.5" stroke-dashoffset="${dashOffset}"/>
                    </svg>
                    <span style="position: absolute; font-size: 14px; font-weight: 800;">${pct}%</span>
                </div>
                <div class="flex-1">
                    <p class="sec-title">${pct === 100 && total > 0 ? '🎉 ¡Objetivos de hoy cumplidos!' : 'Progreso de hoy'}</p>
                    <p class="meta-text mt-2" style="margin-top: 2px;">${done} de ${total} tareas de hoy/vencidas</p>
                    <div class="row-wrap mt-2">
                        ${[
                            { id: 'all', lbl: 'Todas' },
                            { id: 'today', lbl: 'Hoy' },
                            { id: 'pending', lbl: 'Pendientes' },
                            { id: 'done', lbl: 'Hechas' }
                        ].map(f => `<button data-action="filter-tasks" data-filter="${f.id}" class="chip-btn ${tasksUi.filter === f.id ? 'active' : ''}">${f.lbl}</button>`).join('')}
                    </div>
                </div>
            </div>
            <input type="search" data-input="search-tasks" value="${escapeHtml(tasksUi.searchQuery)}" placeholder="🔍 Buscar tarea o categoría..." aria-label="Buscar tareas" class="ui-input">
        </div>

        <!-- Lista de tareas -->
        <div class="col-stack">
            ${filtered.length === 0 ? `<div class="app-card meta-text" style="text-align: center;">No hay tareas en esta vista.</div>` : filtered.map(t => {
                const overdue = isTaskOverdue(t);
                const isFuture = t.dueDate && t.dueDate > getTodayKey();
                const catMeta = getCategoryMeta(t.category);
                const safeId = escapeHtml(t.id);
                const subs = Array.isArray(t.subtasks) ? t.subtasks : [];
                return `
                <div class="app-card" style="${overdue ? 'background-color: rgba(239, 68, 68, 0.12); border: 1.5px solid #EF4444;' : ''}">
                    <div class="row-between">
                        <button data-action="toggle-task" data-id="${safeId}" aria-label="Marcar tarea ${escapeHtml(t.title)}" class="row-center flex-1" style="text-align: left; gap: 10px;">
                            <span style="width: 22px; height: 22px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; background-color: ${t.done ? 'var(--accent-color)' : 'transparent'}; border: 2px solid ${overdue ? '#EF4444' : t.done ? 'var(--accent-color)' : 'var(--border-color)'}; color: #FFF; font-size: 12px; font-weight: 900;">
                                ${t.done ? '✓' : overdue ? '!' : ''}
                            </span>
                            <span class="flex-1">
                                <span class="sec-title truncate" style="display: block; ${t.done ? 'text-decoration: line-through; opacity: 0.55;' : overdue ? 'color: #DC2626;' : ''}">${escapeHtml(t.title)}</span>
                                <span class="row-wrap mt-2" style="margin-top: 4px;">
                                    <span class="meta-text" style="font-weight: 700;">${catMeta.icon} ${escapeHtml(t.category || 'Personal')}</span>
                                    ${priorityBadge(t.priority)}
                                    ${t.recurrence && t.recurrence !== 'none' ? `<span class="badge-pill btn-soft">🔁 ${t.recurrence === 'daily' ? 'Diaria' : 'Semanal'}</span>` : ''}
                                    ${t.dueDate ? `<span class="badge-pill" style="background: ${overdue ? 'rgba(239,68,68,0.2)' : 'var(--bg-screen)'}; color: ${overdue ? '#DC2626' : 'var(--text-secondary)'};">${overdue ? `⚠️ Vencida (${escapeHtml(formatDateTimeLabel(t.dueDate, t.dueTime))})` : `${isFuture ? '🗓️' : '⏰'} ${escapeHtml(formatDateTimeLabel(t.dueDate, t.dueTime))}`}</span>` : ''}
                                </span>
                            </span>
                        </button>
                        <div class="row-center" style="flex-shrink: 0;">
                            ${overdue ? `<button data-action="postpone-task" data-id="${safeId}" title="Posponer a mañana" class="chip-btn" style="color: var(--accent-color)">⏭️ Mañana</button>` : ''}
                            ${!t.done && !overdue ? `<button data-action="start-focus" data-id="${safeId}" aria-label="Iniciar Focus" class="chip-btn btn-soft">🍅</button>` : ''}
                            <button data-action="edit-task" data-id="${safeId}" aria-label="Editar tarea" class="chip-btn">✏️</button>
                            <button data-action="delete-task" data-id="${safeId}" aria-label="Eliminar tarea" class="chip-btn">✕</button>
                        </div>
                    </div>

                    ${subs.length > 0 ? `
                        <div class="col-stack mt-3" style="padding-left: 30px; gap: 6px;">
                            ${subs.map(st => `
                                <button data-action="toggle-subtask" data-task-id="${safeId}" data-sub-id="${escapeHtml(st.id)}" class="row-center meta-text" style="text-align: left;">
                                    <span>${st.done ? '☑️' : '⬜'}</span>
                                    <span style="${st.done ? 'text-decoration: line-through; opacity: 0.6;' : ''}">${escapeHtml(st.title)}</span>
                                </button>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>`;
            }).join('')}
        </div>

        ${archivedTasks.length > 0 ? `
            <div class="mt-3" style="padding-top: 12px; border-top: 1px solid var(--border-color);">
                <div class="row-between mb-2">
                    <button data-action="toggle-task-archive" class="sec-title meta-text">
                        📦 Completadas anteriores (${archivedTasks.length}) ${tasksUi.showArchive ? '▾' : '▸'}
                    </button>
                    ${tasksUi.showArchive ? `<button data-action="clear-task-archive" class="meta-text" style="color: #E11D48; font-weight: 800;">Vaciar</button>` : ''}
                </div>
                ${tasksUi.showArchive ? `
                    <div class="col-stack" style="opacity: 0.85;">
                        ${archivedTasks.map(t => `
                            <div class="app-card row-between" style="padding: 10px 12px;">
                                <button data-action="toggle-task" data-id="${escapeHtml(t.id)}" class="row-center flex-1" style="text-align: left;">
                                    <span>✅</span>
                                    <span class="flex-1">
                                        <span class="sec-title truncate" style="display: block; text-decoration: line-through;">${escapeHtml(t.title)}</span>
                                        <span class="meta-text">Hecha ${escapeHtml(formatShortDate(t.completedDate))}</span>
                                    </span>
                                </button>
                                <button data-action="delete-task" data-id="${escapeHtml(t.id)}" aria-label="Eliminar" class="chip-btn">✕</button>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        ` : ''}
    `;
}

export function renderTaskModalContent(taskId = null) {
    tasksUi.editingTaskId = taskId;
    const existing = taskId ? appState.tasks.find(t => t.id === taskId) : null;
    const subs = existing && Array.isArray(existing.subtasks) ? existing.subtasks : [];

    return `
        <div class="row-between mb-3">
            <button data-action="close-modal" data-modal="task" class="meta-text" style="font-weight: 700;">Cancelar</button>
            <span class="sec-title">${existing ? 'Editar Tarea' : 'Nueva Tarea'}</span>
            <button data-action="save-task" class="sec-title" style="color: var(--accent-color);">${existing ? 'Guardar' : 'Añadir'}</button>
        </div>
        <input id="task-title" type="text" value="${escapeHtml(existing ? existing.title : '')}" placeholder="¿Qué necesitas hacer?" class="ui-input mb-2">
        <div class="grid-2 mb-2">
            <div>
                <label class="eyebrow mb-2" style="display: block;">Categoría</label>
                <select id="task-cat" class="ui-input">
                    ${taskCategories.map(c => `<option value="${escapeHtml(c.id)}" ${existing && existing.category === c.id ? 'selected' : ''}>${c.icon} ${escapeHtml(c.label)}</option>`).join('')}
                </select>
            </div>
            <div>
                <label class="eyebrow mb-2" style="display: block;">Prioridad</label>
                <select id="task-priority" class="ui-input">
                    <option value="alta" ${existing?.priority === 'alta' ? 'selected' : ''}>🔴 Alta</option>
                    <option value="media" ${!existing || existing.priority === 'media' ? 'selected' : ''}>🟡 Media</option>
                    <option value="baja" ${existing?.priority === 'baja' ? 'selected' : ''}>🟢 Baja</option>
                </select>
            </div>
        </div>
        <div class="grid-2 mb-2">
            <div>
                <label class="eyebrow mb-2" style="display: block;">Fecha límite</label>
                <input id="task-due" type="date" value="${escapeHtml(existing ? (existing.dueDate || '') : getTodayKey())}" class="ui-input">
            </div>
            <div>
                <label class="eyebrow mb-2" style="display: block;">Hora límite</label>
                <input id="task-time" type="time" value="${escapeHtml(existing ? (existing.dueTime || '') : '20:00')}" class="ui-input">
            </div>
        </div>
        <div class="mb-3">
            <label class="eyebrow mb-2" style="display: block;">Repetición / Hábito</label>
            <select id="task-recurrence" class="ui-input">
                <option value="none" ${!existing || existing.recurrence === 'none' ? 'selected' : ''}>Una vez (sin repetir)</option>
                <option value="daily" ${existing?.recurrence === 'daily' ? 'selected' : ''}>🔁 Hábito diario</option>
                <option value="weekly" ${existing?.recurrence === 'weekly' ? 'selected' : ''}>📅 Semanal</option>
            </select>
        </div>
        <div class="mb-2">
            <label class="eyebrow mb-2" style="display: block;">Subtareas (una por línea)</label>
            <textarea id="task-subtasks" rows="3" placeholder="Paso 1&#10;Paso 2" class="ui-input">${escapeHtml(subs.map(s => s.title).join('\n'))}</textarea>
        </div>
    `;
}

export function saveTaskFromModal() {
    const title = (document.getElementById('task-title')?.value || '').trim();
    if (!title) return false;
    const category = document.getElementById('task-cat')?.value || 'Personal';
    const priority = document.getElementById('task-priority')?.value || 'media';
    const dueDate = document.getElementById('task-due')?.value || null;
    const dueTime = dueDate ? (document.getElementById('task-time')?.value || null) : null;
    const recurrence = document.getElementById('task-recurrence')?.value || 'none';
    const rawSubs = (document.getElementById('task-subtasks')?.value || '')
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean);

    if (tasksUi.editingTaskId) {
        const t = appState.tasks.find(x => x.id === tasksUi.editingTaskId);
        if (t) {
            const oldSubs = Array.isArray(t.subtasks) ? t.subtasks : [];
            t.title = title;
            t.category = category;
            t.priority = priority;
            t.dueDate = dueDate;
            t.dueTime = dueTime;
            t.recurrence = recurrence;
            t.subtasks = rawSubs.map(stTitle => {
                const match = oldSubs.find(o => o.title === stTitle);
                return match ? match : { id: generateId(), title: stTitle, done: false };
            });
        }
    } else {
        appState.tasks.unshift({
            id: generateId(),
            title,
            category,
            priority,
            recurrence,
            dueDate,
            dueTime,
            done: false,
            completedDate: null,
            subtasks: rawSubs.map(stTitle => ({ id: generateId(), title: stTitle, done: false }))
        });
    }

    tasksUi.editingTaskId = null;
    evaluateTodayStreak(getTodayRelevantTasks(), appState.routines.some(r => r.completedThisWeek));
    saveState();
    return true;
}

export function toggleTaskItem(id) {
    const t = appState.tasks.find(x => x.id === id);
    if (!t) return { becameAllDone: false };
    const before = getDayProgressStats();
    const wasAllDone = before.total > 0 && before.done === before.total;

    t.done = !t.done;
    t.completedDate = t.done ? getTodayKey() : null;

    const after = getDayProgressStats();
    const isAllDoneNow = after.total > 0 && after.done === after.total;
    evaluateTodayStreak(getTodayRelevantTasks(), appState.routines.some(r => r.completedThisWeek));
    saveState();
    return { becameAllDone: !wasAllDone && isAllDoneNow };
}

export function postponeTaskToTomorrow(id) {
    const t = appState.tasks.find(x => x.id === id);
    if (!t) return;
    t.dueDate = toDateKey(addDays(new Date(), 1));
    evaluateTodayStreak(getTodayRelevantTasks(), appState.routines.some(r => r.completedThisWeek));
    saveState();
}

export function toggleSubtaskItem(taskId, subId) {
    const t = appState.tasks.find(x => x.id === taskId);
    if (!t || !Array.isArray(t.subtasks)) return;
    const st = t.subtasks.find(s => s.id === subId);
    if (st) {
        st.done = !st.done;
        saveState();
    }
}

export function deleteTaskItem(id) {
    const idx = appState.tasks.findIndex(x => x.id === id);
    if (idx === -1) return null;
    const removed = appState.tasks[idx];
    appState.tasks.splice(idx, 1);
    evaluateTodayStreak(getTodayRelevantTasks(), appState.routines.some(r => r.completedThisWeek));
    saveState();
    return { removed, idx };
}

/* =========================================================
   TEMPORIZADOR FOCUS BASADO EN endTime (RESISTENTE A SEGUNDO PLANO iOS)
   ========================================================= */
export function syncFocusClock(onCompletePrompt) {
    const fs = tasksUi.focus;
    if (!fs.running || !fs.endTime) return;
    const left = Math.max(0, Math.ceil((fs.endTime - Date.now()) / 1000));
    fs.remaining = left;
    const el = document.getElementById('focus-clock-display');
    if (el) {
        el.textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
    }
    if (left <= 0) {
        clearInterval(fs.timerId);
        fs.running = false;
        fs.endTime = null;
        fs.finishedPrompt = true;
        playGentleChime();
        if (typeof onCompletePrompt === 'function') onCompletePrompt();
    }
}

export function startFocusSession(taskId, onCompletePrompt) {
    const fs = tasksUi.focus;
    clearInterval(fs.timerId);
    fs.activeTaskId = taskId;
    fs.remaining = fs.duration;
    fs.endTime = Date.now() + fs.duration * 1000;
    fs.running = true;
    fs.finishedPrompt = false;
    fs.timerId = setInterval(() => syncFocusClock(onCompletePrompt), 500);
}

export function toggleFocusPlay(onCompletePrompt) {
    const fs = tasksUi.focus;
    if (fs.running) {
        syncFocusClock(onCompletePrompt);
        clearInterval(fs.timerId);
        fs.running = false;
        fs.endTime = null;
    } else {
        fs.endTime = Date.now() + fs.remaining * 1000;
        fs.running = true;
        fs.timerId = setInterval(() => syncFocusClock(onCompletePrompt), 500);
    }
}

export function setFocusMinutes(mins, onCompletePrompt) {
    const fs = tasksUi.focus;
    fs.duration = mins * 60;
    fs.remaining = mins * 60;
    if (fs.running) {
        fs.endTime = Date.now() + fs.remaining * 1000;
    }
}

export function stopFocusSession() {
    const fs = tasksUi.focus;
    clearInterval(fs.timerId);
    fs.activeTaskId = null;
    fs.running = false;
    fs.endTime = null;
    fs.finishedPrompt = false;
}
