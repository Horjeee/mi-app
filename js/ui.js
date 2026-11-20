import {
    appState,
    storageLoadWarning,
    computeStreakStats,
    saveState
} from './state.js';
import {
    escapeHtml,
    getTodayKey,
    getWeekStartKey,
    formatShortDate,
    formatDateTimeLabel,
    getCategoryMeta,
    calendarColors,
    muscleCatalog
} from './utils.js';
import {
    getDayProgressStats,
    getTodayRelevantTasks,
    isTaskOverdue,
    renderTasksSection
} from './tasks.js';
import {
    getCalendarEventsForDate,
    renderCalendarSection
} from './calendar.js';
import { renderAlertsSection } from './alerts.js';
import { renderFitnessBodyAndRoutines } from './fitness.js';
import { renderRunningSection, initOrUpdateLeafletMap } from './run.js';

export const TAB_ORDER = ['inicio', 'tareas', 'calendario', 'avisos', 'fitness', 'ajustes'];

export const uiState = {
    activeTab: 'inicio',
    undoData: null,
    undoTimer: null
};

export function applyThemeVariables() {
    const screen = document.getElementById('app-screen');
    if (!screen) return;
    const isDark = Boolean(appState.settings.darkMode);
    screen.classList.toggle('dark-mode', isDark);
    screen.style.setProperty('--accent-color', appState.settings.accent || '#0066D6');
    screen.style.setProperty('--accent-soft', appState.settings.accentSoft || 'rgba(0, 102, 214, 0.14)');
    const metaTheme = document.getElementById('meta-theme-color');
    if (metaTheme) metaTheme.content = isDark ? '#09090B' : '#F2F2F7';
    document.body.style.backgroundColor = isDark ? '#09090B' : '#F2F2F7';
}

function getWeeklySummaryStats() {
    const weekStart = getWeekStartKey();
    const tasksDoneWeek = appState.tasks.filter(t => t.done && t.completedDate && t.completedDate >= weekStart).length;
    const gymDates = new Set(appState.gymLogs.filter(g => g.date >= weekStart).map(g => g.date));
    const workoutsWeek = Math.max(gymDates.size, appState.routines.filter(r => r.completedThisWeek).length);
    const kmWeek = appState.runLogs
        .filter(r => r.date >= weekStart)
        .reduce((acc, r) => acc + (parseFloat(r.km) || 0), 0);
    return {
        tasksDoneWeek,
        workoutsWeek,
        kmWeek: Math.round(kmWeek * 10) / 10
    };
}

export function renderHomeSection() {
    const currentTodayKey = getTodayKey();
    const { pct } = getDayProgressStats();
    const dashOffset = 150.8 - (pct / 100) * 150.8;
    const todayEvs = getCalendarEventsForDate(currentTodayKey);
    const relevantTasks = getTodayRelevantTasks();
    const doneRoutines = appState.routines.filter(r => r.completedThisWeek).length;
    const activeAlert = appState.alerts.find(a => a.active);
    const streak = computeStreakStats();
    const weekly = getWeeklySummaryStats();
    const weekLetters = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
    const todayWeekIdx = (new Date().getDay() + 6) % 7;
    const safeUserName = escapeHtml(appState.settings.name || 'Amigo');

    return `
        <div class="row-between mb-3">
            <div>
                <p class="eyebrow">Panel Diario</p>
                <h1 class="page-title">Hola, ${safeUserName} 👋</h1>
            </div>
            <div class="row-center">
                <div class="badge-pill app-card" style="padding: 6px 12px; border-color: ${streak.days > 0 ? 'rgba(234, 88, 12, 0.4)' : 'var(--border-color)'};">
                    <span style="${streak.days > 0 ? '' : 'filter: grayscale(1); opacity: 0.55;'}">🔥</span>
                    <span style="color: ${streak.days > 0 ? '#EA580C' : 'var(--text-secondary)'};">${streak.days}d</span>
                </div>
                <button data-action="toggle-dark-mode" aria-label="Cambiar modo oscuro o claro" class="icon-circle-btn tap-btn">
                    ${appState.settings.darkMode ? '☀️' : '🌙'}
                </button>
            </div>
        </div>

        <!-- Racha semanal -->
        <div class="app-card mb-3" style="background: ${streak.days > 0 ? 'linear-gradient(135deg, rgba(234, 88, 12, 0.13) 0%, var(--bg-card) 75%)' : 'var(--bg-card)'};">
            <div class="row-between mb-2">
                <div class="row-center">
                    <span style="font-size: 18px; ${streak.days > 0 ? '' : 'filter: grayscale(1); opacity: 0.55;'}">🔥</span>
                    <div>
                        <p class="sec-title">${streak.days === 0 ? 'Sin racha activa' : `Racha de ${streak.days} ${streak.days === 1 ? 'día' : 'días'}`}</p>
                        <p class="meta-text">Completa el 100% de tareas de hoy o un entreno</p>
                    </div>
                </div>
                <span class="badge-pill" style="${streak.todayDone ? 'background: rgba(234,88,12,0.16); color: #EA580C;' : 'background: var(--bg-screen); color: var(--text-secondary);'}">${streak.todayDone ? 'Hecho hoy' : 'Pendiente'}</span>
            </div>
            <div class="grid-7" style="text-align: center;">
                ${weekLetters.map((ltr, idx) => {
                    const doneDay = streak.weekDays[idx];
                    const isToday = idx === todayWeekIdx;
                    return `<div style="padding: 6px 0; border-radius: 12px; background-color: ${doneDay ? 'rgba(234, 88, 12, 0.18)' : 'var(--bg-screen)'}; ${isToday && !doneDay ? 'border: 1px dashed var(--accent-color);' : ''}">
                        <span style="display: block; font-size: 11px; font-weight: 800; color: ${doneDay ? '#EA580C' : isToday ? 'var(--accent-color)' : 'var(--text-secondary)'};">${ltr}</span>
                        <span style="font-size: 12px;">${doneDay ? '🔥' : '·'}</span>
                    </div>`;
                }).join('')}
            </div>
        </div>

        <!-- Progreso del día -->
        <div class="app-card row-center mb-3" style="gap: 14px;">
            <div style="position: relative; width: 64px; height: 64px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                <svg width="64" height="64" viewBox="0 0 60 60" aria-hidden="true">
                    <circle cx="30" cy="30" r="24" fill="none" stroke="var(--border-color)" stroke-width="6"/>
                    <circle class="progress-ring-circle" cx="30" cy="30" r="24" fill="none" stroke="var(--accent-color)" stroke-width="6" stroke-linecap="round" stroke-dasharray="150.8" stroke-dashoffset="${dashOffset}"/>
                </svg>
                <span style="position: absolute; font-size: 14px; font-weight: 800;">${pct}%</span>
            </div>
            <div class="grid-2 flex-1">
                <button data-action="switch-tab" data-tab="calendario" style="padding: 10px; border-radius: 16px; background: var(--bg-screen); text-align: center;">
                    <span style="display: block; font-size: 16px; font-weight: 800; color: #9333EA;">${todayEvs.length}</span>
                    <span class="meta-text" style="font-weight: 700;">Agenda hoy</span>
                </button>
                <button data-action="switch-tab" data-tab="fitness" style="padding: 10px; border-radius: 16px; background: var(--bg-screen); text-align: center;">
                    <span style="display: block; font-size: 16px; font-weight: 800; color: #059669;">${doneRoutines}/${appState.routines.length}</span>
                    <span class="meta-text" style="font-weight: 700;">Rutinas</span>
                </button>
            </div>
        </div>

        <!-- Resumen Semanal (Fase 6.4) -->
        <div class="app-card mb-3">
            <p class="sec-title mb-2">📊 Resumen de esta semana</p>
            <div class="grid-3" style="text-align: center;">
                <div style="background: var(--bg-screen); padding: 8px; border-radius: 14px;">
                    <p class="sec-title" style="color: var(--accent-color); font-size: 16px;">${weekly.tasksDoneWeek}</p>
                    <p class="meta-text">Tareas hechas</p>
                </div>
                <div style="background: var(--bg-screen); padding: 8px; border-radius: 14px;">
                    <p class="sec-title" style="color: #059669; font-size: 16px;">${weekly.workoutsWeek}</p>
                    <p class="meta-text">Entrenos</p>
                </div>
                <div style="background: var(--bg-screen); padding: 8px; border-radius: 14px;">
                    <p class="sec-title" style="color: #EA580C; font-size: 16px;">${weekly.kmWeek} km</p>
                    <p class="meta-text">Running</p>
                </div>
            </div>
        </div>

        <!-- Agenda de hoy -->
        <div class="app-card mb-3">
            <div class="row-between mb-2">
                <span class="sec-title">📅 Agenda de hoy</span>
                <button data-action="switch-tab" data-tab="calendario" class="meta-text" style="color: var(--accent-color); font-weight: 800;">Ver mes ›</button>
            </div>
            <div class="col-stack" style="gap: 8px;">
                ${todayEvs.length === 0 ? `<p class="meta-text">Sin eventos hoy.</p>` : todayEvs.map(ev => {
                    const col = calendarColors.find(c => c.id === ev.color) || calendarColors[0];
                    const timeTxt = ev.isAllDay ? 'Todo el día' : ev.time;
                    return `<button data-action="${ev.linkedTaskId ? 'toggle-task' : 'switch-tab'}" data-id="${escapeHtml(ev.linkedTaskId || '')}" data-tab="calendario" class="row-between" style="width: 100%; padding: 8px 12px; border-radius: 12px; background: ${ev.overdue ? 'rgba(239, 68, 68, 0.12)' : 'var(--bg-screen)'}; text-align: left;">
                        <span class="sec-title truncate" style="${ev.done ? 'text-decoration: line-through; opacity: 0.55;' : ev.overdue ? 'color: #DC2626;' : ''}">${escapeHtml(ev.title)}</span>
                        <span class="meta-text" style="font-weight: 800; flex-shrink: 0; color: ${ev.overdue ? '#DC2626' : col.hex};">${escapeHtml(timeTxt)}</span>
                    </button>`;
                }).join('')}
            </div>
        </div>

        <!-- Tareas rápidas -->
        <div class="app-card mb-3">
            <div class="row-between mb-2">
                <span class="sec-title">✅ Tareas de hoy</span>
                <button data-action="switch-tab" data-tab="tareas" class="meta-text" style="color: var(--accent-color); font-weight: 800;">Todas ›</button>
            </div>
            <div class="col-stack" style="gap: 8px;">
                ${relevantTasks.length === 0 ? `<p class="meta-text">No tienes tareas pendientes hoy.</p>` : relevantTasks.slice(0, 3).map(t => {
                    const overdue = isTaskOverdue(t);
                    const catMeta = getCategoryMeta(t.category);
                    return `<button data-action="toggle-task" data-id="${escapeHtml(t.id)}" class="row-between" style="width: 100%; padding: 8px 12px; border-radius: 12px; background: ${overdue ? 'rgba(239, 68, 68, 0.12)' : 'var(--bg-screen)'}; text-align: left;">
                        <span class="row-center flex-1">
                            <span style="width: 18px; height: 18px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; color: #FFF; font-weight: 900; flex-shrink: 0; background: ${t.done ? 'var(--accent-color)' : 'transparent'}; border: 1.5px solid ${overdue ? '#EF4444' : 'var(--accent-color)'};">${t.done ? '✓' : ''}</span>
                            <span class="sec-title truncate" style="${t.done ? 'text-decoration: line-through; opacity: 0.55;' : overdue ? 'color: #DC2626;' : ''}">${catMeta.icon} ${escapeHtml(t.title)}</span>
                        </span>
                        ${overdue ? `<span class="meta-text" style="color: #DC2626; font-weight: 800;">Vencida</span>` : ''}
                    </button>`;
                }).join('')}
            </div>
        </div>

        ${activeAlert ? `
            <button data-action="switch-tab" data-tab="avisos" class="app-card" style="width: 100%; text-align: left; border-left: 4px solid #E11D48;">
                <span class="eyebrow" style="color: #E11D48; display: block;">🔔 Aviso · ${escapeHtml(activeAlert.level)}</span>
                <span class="sec-title">${escapeHtml(activeAlert.title)}</span>
            </button>
        ` : ''}
    `;
}

export function renderSettingsSection() {
    const unit = appState.settings.units || 'kg';
    return `
        <div class="row-between mb-3">
            <div>
                <p class="eyebrow">Sistema</p>
                <h1 class="page-title">Ajustes</h1>
            </div>
            <span class="badge-pill btn-soft">v${appState.version} Offline PWA</span>
        </div>

        <div class="app-card mb-3">
            <label for="settings-name" class="eyebrow mb-2" style="display: block;">Tu nombre</label>
            <input id="settings-name" data-change="update-user-name" type="text" value="${escapeHtml(appState.settings.name)}" class="ui-input" style="font-weight: 800;">
        </div>

        <div class="app-card col-stack mb-3">
            <div class="row-between">
                <span class="sec-title">Modo Oscuro Liquid Glass</span>
                <button data-action="toggle-dark-mode" aria-label="Alternar modo oscuro" class="ui-switch ${appState.settings.darkMode ? 'on' : ''}"><span class="ui-switch-thumb"></span></button>
            </div>

            <div class="row-between" style="padding-top: 10px; border-top: 1px solid var(--border-color);">
                <div>
                    <p class="sec-title">Unidad de peso en gimnasio</p>
                    <p class="meta-text">Kilogramos (kg) o Libras (lb)</p>
                </div>
                <div class="row-center">
                    <button data-action="set-unit" data-unit="kg" class="chip-btn ${unit === 'kg' ? 'active' : ''}">kg</button>
                    <button data-action="set-unit" data-unit="lb" class="chip-btn ${unit === 'lb' ? 'active' : ''}">lb</button>
                </div>
            </div>

            <div class="row-between" style="padding-top: 10px; border-top: 1px solid var(--border-color);">
                <div>
                    <p class="sec-title">Confeti al 100% de tareas</p>
                    <p class="meta-text">Celebración al completar el día</p>
                </div>
                <button data-action="toggle-confetti" aria-label="Alternar confeti" class="ui-switch ${appState.settings.confetti !== false ? 'on' : ''}"><span class="ui-switch-thumb"></span></button>
            </div>

            <div class="row-between" style="padding-top: 10px; border-top: 1px solid var(--border-color);">
                <div>
                    <p class="sec-title">Modo desarrollador</p>
                    <p class="meta-text">Activa simulación GPS en Running</p>
                </div>
                <button data-action="toggle-dev-mode" aria-label="Alternar modo desarrollador" class="ui-switch ${appState.settings.devMode ? 'on' : ''}"><span class="ui-switch-thumb"></span></button>
            </div>

            <div style="padding-top: 10px; border-top: 1px solid var(--border-color);">
                <p class="sec-title mb-2">Color de acento</p>
                <div class="row-between">
                    ${[
                        { hex: '#0066D6', soft: 'rgba(0, 102, 214, 0.14)', name: 'Azul' },
                        { hex: '#EA580C', soft: 'rgba(234, 88, 12, 0.16)', name: 'Naranja' },
                        { hex: '#059669', soft: 'rgba(5, 150, 105, 0.16)', name: 'Verde' },
                        { hex: '#9333EA', soft: 'rgba(147, 51, 234, 0.16)', name: 'Morado' },
                        { hex: '#E11D48', soft: 'rgba(225, 29, 72, 0.16)', name: 'Rosa' }
                    ].map(c => `<button data-action="set-accent" data-hex="${c.hex}" data-soft="${c.soft}" aria-label="Color ${c.name}" style="width: 34px; height: 34px; border-radius: 999px; background-color: ${c.hex}; box-shadow: ${appState.settings.accent === c.hex ? '0 0 0 2px var(--bg-card), 0 0 0 4px ' + c.hex : 'none'};"></button>`).join('')}
                </div>
            </div>
        </div>

        <div class="app-card col-stack">
            <div class="grid-2">
                <button data-action="export-backup" class="btn-block btn-soft">📤 Exportar .JSON</button>
                <label class="btn-block btn-neutral" style="cursor: pointer;">
                    📥 Importar .JSON
                    <input data-file="import-backup" type="file" accept=".json,application/json" class="hidden">
                </label>
            </div>
            <button data-action="download-pwa-icons" class="btn-block btn-neutral">🖼️ Descargar iconos PNG (192/512)</button>
            <button data-action="load-demo-data" class="btn-block btn-neutral">✨ Cargar datos de ejemplo (Demo)</button>
            <button data-action="factory-reset" class="btn-block btn-danger">Restaurar datos iniciales</button>
        </div>
    `;
}

export function renderSection(sectionId) {
    if (!appState.settings.onboarded) {
        mountAppShell();
        return;
    }
    const container = document.getElementById(`section-content-${sectionId}`);
    if (!container) {
        mountAppShell();
        return;
    }
    const slide = container.parentElement;
    const prevScroll = slide ? slide.scrollTop : 0;

    if (sectionId === 'inicio') container.innerHTML = renderHomeSection();
    else if (sectionId === 'tareas') container.innerHTML = renderTasksSection();
    else if (sectionId === 'calendario') container.innerHTML = renderCalendarSection();
    else if (sectionId === 'avisos') container.innerHTML = renderAlertsSection();
    else if (sectionId === 'fitness') {
        container.innerHTML = renderFitnessBodyAndRoutines(renderRunningSection());
        if (document.getElementById('leaflet-map')) {
            setTimeout(() => initOrUpdateLeafletMap(), 30);
        }
    } else if (sectionId === 'ajustes') container.innerHTML = renderSettingsSection();

    if (slide) slide.scrollTop = prevScroll;
}

export function renderAllSections() {
    if (!appState.settings.onboarded) {
        mountAppShell();
        return;
    }
    TAB_ORDER.forEach(sec => renderSection(sec));
}

export function switchTab(tab, animate = true) {
    const nextIdx = TAB_ORDER.indexOf(tab);
    if (nextIdx === -1) return;
    uiState.activeTab = tab;

    const screen = document.getElementById('app-screen');
    if (screen) {
        screen.querySelectorAll('.nav-tab-btn').forEach(btn => {
            const isAct = btn.dataset.tab === tab;
            btn.classList.toggle('liquid-active', isAct);
            btn.style.color = isAct ? 'var(--accent-color)' : 'var(--text-secondary)';
        });
    }

    const track = document.getElementById('carousel-track');
    if (track) {
        track.style.transition = animate ? 'transform 0.32s cubic-bezier(0.22, 1, 0.36, 1)' : 'none';
        track.style.transform = `translate3d(${-nextIdx * 100}%, 0, 0)`;
    }

    if (tab === 'fitness' && document.getElementById('leaflet-map')) {
        setTimeout(() => initOrUpdateLeafletMap(), 50);
    }
}

export function openModal(name, innerHtml = null) {
    const el = document.getElementById(`modal-${name}`);
    if (!el) return;
    if (innerHtml !== null) {
        const body = el.querySelector('.modal-dynamic-body');
        if (body) body.innerHTML = innerHtml;
    }
    el.classList.add('open');
    el.setAttribute('aria-hidden', 'false');
}

export function closeModal(name) {
    const el = document.getElementById(`modal-${name}`);
    if (!el) return;
    el.classList.remove('open');
    el.setAttribute('aria-hidden', 'true');
}

export function closeAllOpenModals() {
    document.querySelectorAll('.dev-modal-backdrop.open').forEach(el => {
        el.classList.remove('open');
        el.setAttribute('aria-hidden', 'true');
    });
}

export function showBannerMessage(titleText, subText) {
    const banner = document.getElementById('push-banner');
    const title = document.getElementById('banner-title');
    const sub = document.getElementById('banner-sub');
    if (banner && title && sub) {
        title.textContent = titleText;
        sub.textContent = subText;
        banner.classList.add('show');
        setTimeout(() => banner.classList.remove('show'), 4200);
    }
}

export function showUndoToast(label, onUndo) {
    uiState.undoData = onUndo;
    const toast = document.getElementById('undo-toast');
    const txt = document.getElementById('undo-text');
    if (toast && txt) {
        txt.textContent = label;
        toast.classList.add('show');
        clearTimeout(uiState.undoTimer);
        uiState.undoTimer = setTimeout(() => {
            toast.classList.remove('show');
            uiState.undoData = null;
        }, 5500);
    }
}

export function triggerUndo() {
    if (typeof uiState.undoData === 'function') {
        uiState.undoData();
        uiState.undoData = null;
    }
    const toast = document.getElementById('undo-toast');
    if (toast) toast.classList.remove('show');
}

export function launchSideConfetti() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');
    const colors = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#007AFF', '#AF52DE', '#FF2D55'];
    const particles = Array.from({ length: 120 }, (_, i) => {
        const fromLeft = i % 2 === 0;
        return {
            x: fromLeft ? 0 : canvas.width,
            y: canvas.height * (0.42 + Math.random() * 0.42),
            vx: (fromLeft ? 1 : -1) * (Math.random() * 8.5 + 3),
            vy: -(Math.random() * 11 + 5),
            size: Math.random() * 7 + 5,
            color: colors[Math.floor(Math.random() * colors.length)],
            rot: Math.random() * Math.PI * 2,
            vRot: (Math.random() - 0.5) * 0.25
        };
    });

    let frame = 0;
    function step() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.26;
            p.vx *= 0.985;
            p.rot += p.vRot;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.65);
            ctx.restore();
        });
        frame++;
        if (frame < 130) requestAnimationFrame(step);
        else ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    requestAnimationFrame(step);
}

/* Generador opcional de los iconos PNG físicos de la PWA */
export function downloadGeneratedPwaIcons() {
    [192, 512].forEach(size => {
        const c = document.createElement('canvas');
        c.width = size;
        c.height = size;
        const ctx = c.getContext('2d');
        const g = ctx.createLinearGradient(0, 0, size, size);
        g.addColorStop(0, '#007AFF');
        g.addColorStop(1, '#5856D6');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.roundRect(0, 0, size, size, size * 0.22);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.28)';
        ctx.lineWidth = size * 0.055;
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size * 0.28, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = size * 0.066;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(size * 0.375, size * 0.51);
        ctx.lineTo(size * 0.46, size * 0.60);
        ctx.lineTo(size * 0.635, size * 0.405);
        ctx.stroke();

        c.toBlob(blob => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `icon-${size}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1500);
        }, 'image/png');
    });
}

export function mountAppShell() {
    const screen = document.getElementById('app-screen');
    if (!screen) return;
    applyThemeVariables();

    if (!appState.settings.onboarded) {
        screen.innerHTML = `
            <div class="safe-top-bar"></div>
            <div style="flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 24px; max-width: 420px; margin: 0 auto; width: 100%;">
                <div class="app-card" style="padding: 24px; text-align: center;">
                    <div style="width: 64px; height: 64px; border-radius: 22px; margin: 0 auto 14px; display: flex; align-items: center; justify-content: center; font-size: 30px; color: #FFF; background: linear-gradient(135deg, var(--accent-color) 0%, #5856D6 100%);">👋</div>
                    <p class="eyebrow" style="color: var(--accent-color);">Bienvenido a Mi Día</p>
                    <h1 class="page-title mb-2">¿Cómo te llamas?</h1>
                    <p class="meta-text mb-4">Tu nombre se guarda localmente en este dispositivo para personalizar tu panel.</p>
                    <input id="onboarding-name-input" type="text" placeholder="Escribe tu nombre..." autocomplete="given-name" class="ui-input mb-2" style="text-align: center; font-weight: 800;">
                    <p id="onboarding-error" class="meta-text hidden mb-2" style="color: #E11D48; font-weight: 800;">Introduce tu nombre para continuar.</p>
                    <button data-action="complete-onboarding" class="btn-block mt-2" style="background: var(--accent-color); color: #FFF;">Comenzar →</button>
                </div>
            </div>
        `;
        return;
    }

    const activeIdx = Math.max(0, TAB_ORDER.indexOf(uiState.activeTab));

    screen.innerHTML = `
        <canvas id="confetti-canvas" aria-hidden="true" style="position: fixed; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 55;"></canvas>

        <div id="push-banner" role="status" aria-live="polite" data-action="dismiss-banner" class="push-banner">
            <div class="row-center">
                <div style="width: 36px; height: 36px; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: #FFF; background: var(--accent-color); flex-shrink: 0;">☀️</div>
                <div class="flex-1">
                    <p id="banner-title" class="sec-title">¡Buenos días!</p>
                    <p id="banner-sub" class="meta-text truncate">Resumen listo</p>
                </div>
            </div>
        </div>

        <div class="safe-top-bar"></div>

        <div id="carousel-viewport" class="tab-carousel-viewport">
            <div id="carousel-track" class="tab-carousel-track" style="transform: translate3d(${-activeIdx * 100}%, 0, 0)">
                <div class="tab-slide"><div id="section-content-inicio" class="section-wrap">${renderHomeSection()}</div></div>
                <div class="tab-slide"><div id="section-content-tareas" class="section-wrap">${renderTasksSection()}</div></div>
                <div class="tab-slide"><div id="section-content-calendario" class="section-wrap">${renderCalendarSection()}</div></div>
                <div class="tab-slide"><div id="section-content-avisos" class="section-wrap">${renderAlertsSection()}</div></div>
                <div class="tab-slide"><div id="section-content-fitness" class="section-wrap">${renderFitnessBodyAndRoutines(renderRunningSection())}</div></div>
                <div class="tab-slide"><div id="section-content-ajustes" class="section-wrap">${renderSettingsSection()}</div></div>
            </div>
        </div>

        <div id="undo-toast" role="status" aria-live="polite" class="undo-toast">
            <span id="undo-text" class="meta-text truncate" style="color: #FFF; font-weight: 700;">Eliminado</span>
            <button data-action="undo-delete" class="chip-btn" style="background: var(--accent-color); color: #FFF; border: none;">↩️ Deshacer</button>
        </div>

        <nav class="iphone-tabbar" aria-label="Navegación principal">
            ${[
                { id: 'inicio', label: 'Inicio', icon: '🏠' },
                { id: 'tareas', label: 'Tareas', icon: '✅' },
                { id: 'calendario', label: 'Agenda', icon: '📅' },
                { id: 'avisos', label: 'Avisos', icon: '🔔' },
                { id: 'fitness', label: 'Fitness', icon: '💪' },
                { id: 'ajustes', label: 'Ajustes', icon: '⚙️' }
            ].map(tab => {
                const active = uiState.activeTab === tab.id;
                return `<button data-action="switch-tab" data-tab="${tab.id}" class="nav-tab-btn ${active ? 'liquid-active' : ''}" style="color: ${active ? 'var(--accent-color)' : 'var(--text-secondary)'};">
                    <span class="nav-tab-icon" aria-hidden="true">${tab.icon}</span>
                    <span class="nav-tab-label">${tab.label}</span>
                </button>`;
            }).join('')}
        </nav>

        <!-- Modales accesibles con role="dialog" y aria-modal="true" -->
        <div id="modals-root">
            ${['task', 'event', 'alert', 'gym-pr', 'routine-detail', 'new-routine'].map(mName => `
                <div id="modal-${mName}" role="dialog" aria-modal="true" aria-hidden="true" data-action="backdrop-close" data-modal="${mName}" class="dev-modal-backdrop">
                    <div class="dev-modal-panel">
                        <div style="width: 40px; height: 4px; border-radius: 999px; background: rgba(148,163,184,0.5); margin: 0 auto 12px;"></div>
                        <div class="modal-dynamic-body"></div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    if (storageLoadWarning) {
        setTimeout(() => showBannerMessage('⚠️ Almacenamiento', storageLoadWarning), 400);
    }
    if (document.getElementById('leaflet-map')) {
        setTimeout(() => initOrUpdateLeafletMap(), 80);
    }
}
