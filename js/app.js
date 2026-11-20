import {
    appState,
    saveState,
    setStorageAlertHandler,
    checkRolloverAndRecurrence,
    buildDemoData,
    replaceAppState,
    exportBackupFile,
    validateBackupObject,
    computeStreakStats,
    evaluateTodayStreak,
    STORAGE_KEY
} from './state.js';
import {
    unlockAudioContext,
    getTodayKey,
    getCurrentTimeStr,
    escapeHtml,
    muscleCatalog,
    generateId
} from './utils.js';
import {
    tasksUi,
    getTodayRelevantTasks,
    renderTaskModalContent,
    saveTaskFromModal,
    toggleTaskItem,
    postponeTaskToTomorrow,
    toggleSubtaskItem,
    deleteTaskItem,
    startFocusSession,
    toggleFocusPlay,
    setFocusMinutes,
    stopFocusSession,
    syncFocusClock
} from './tasks.js';
import {
    calendarUi,
    renderEventModalContent,
    saveEventFromModal,
    deleteEventItem
} from './calendar.js';
import {
    alertsUi,
    getDueAlertsNow,
    renderAlertModalContent,
    saveAlertFromModal
} from './alerts.js';
import {
    fitnessUi,
    renderRoutineDetailHtml,
    startRestTimer,
    toggleRestTimer,
    adjustRestTimer,
    syncRestClock,
    logRoutineSetAndRest,
    renderGymPrModalContent,
    saveGymPrFromModal,
    updateRoutineCover
} from './fitness.js';
import {
    runUi,
    locateUserCity,
    scheduleNominatimSearch,
    searchRunLocation,
    simulateStepForward,
    toggleRunningSession,
    initOrUpdateLeafletMap
} from './run.js';
import {
    TAB_ORDER,
    uiState,
    mountAppShell,
    renderSection,
    renderAllSections,
    switchTab,
    openModal,
    closeModal,
    closeAllOpenModals,
    showBannerMessage,
    showUndoToast,
    triggerUndo,
    launchSideConfetti,
    downloadGeneratedPwaIcons,
    applyThemeVariables
} from './ui.js';

let trackedTodayKey = getTodayKey();

setStorageAlertHandler((msg) => {
    showBannerMessage('⚠️ Error de almacenamiento', msg);
});

function checkRemindersAndMorningBanner() {
    if (!appState.settings.onboarded) return;
    const today = getTodayKey();
    const nowTime = getCurrentTimeStr();
    const due = getDueAlertsNow();

    if (due.length > 0) {
        showBannerMessage(`🔔 Tienes ${due.length} ${due.length === 1 ? 'aviso activo' : 'avisos activos'}`, due[0].title);
        return;
    }

    if (appState.morning.enabled && appState.morning.lastShownDate !== today && nowTime >= appState.morning.time) {
        appState.morning.lastShownDate = today;
        saveState();
        const streak = computeStreakStats();
        const pending = getTodayRelevantTasks().filter(t => !t.done).length;
        showBannerMessage(`¡Buenos días, ${appState.settings.name || 'Amigo'}!`, `${pending} tareas pendientes · Racha ${streak.days}d`);
    }
}

function handleDayOrVisibilityRefresh() {
    const nowKey = getTodayKey();
    const rolled = checkRolloverAndRecurrence();
    if (nowKey !== trackedTodayKey || rolled) {
        trackedTodayKey = nowKey;
        calendarUi.selectedDate = nowKey;
        renderAllSections();
    }
    syncFocusClock(() => renderSection('tareas'));
    syncRestClock(() => {
        if (fitnessUi.restTimer.openRoutineId) {
            openModal('routine-detail', renderRoutineDetailHtml(fitnessUi.restTimer.openRoutineId));
        }
    });
    if (runUi.recording) {
        initOrUpdateLeafletMap();
    }
    checkRemindersAndMorningBanner();
}

function renderNewRoutineModalHtml() {
    return `
        <div class="row-between mb-3">
            <button data-action="close-modal" data-modal="new-routine" class="meta-text" style="font-weight: 700;">Cancelar</button>
            <span class="sec-title">Nuevo Día de Rutina</span>
            <button data-action="save-new-routine" class="sec-title" style="color: var(--accent-color);">Crear</button>
        </div>
        <input id="nr-name" type="text" placeholder="Nombre (ej. Día de Pecho)" class="ui-input mb-3">
        <div class="row-wrap">
            ${Object.entries(muscleCatalog).map(([k, v]) => {
                const sel = fitnessUi.newRoutineMuscles.includes(k);
                return `<button type="button" data-action="toggle-new-routine-muscle" data-muscle="${k}" class="chip-btn ${sel ? 'active' : ''}">${v.icon} ${escapeHtml(v.label)}</button>`;
            }).join('')}
        </div>
    `;
}

/* =========================================================
   DELEGACIÓN CENTRAL DE EVENTOS (data-action / data-change / data-input)
   ========================================================= */
function bindGlobalDelegation() {
    const screen = document.getElementById('app-screen');
    if (!screen) return;

    // Desbloquear AudioContext en el primer toque
    ['touchstart', 'pointerdown', 'keydown'].forEach(evt => {
        window.addEventListener(evt, unlockAudioContext, { once: true, passive: true });
    });

    // Cerrar modales con Escape (Fase 4.4)
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeAllOpenModals();
        }
        if (e.key === 'Enter' && e.target?.id === 'onboarding-name-input') {
            completeOnboarding();
        }
        if (e.key === 'Enter' && e.target?.id === 'new-ex-name') {
            const rid = fitnessUi.restTimer.openRoutineId;
            if (rid) addExerciseToRoutine(rid);
        }
    });

    screen.addEventListener('click', (e) => {
        const el = e.target.closest('[data-action]');
        if (!el) return;
        const action = el.dataset.action;

        if (action === 'backdrop-close') {
            if (e.target === el) closeModal(el.dataset.modal);
            return;
        }
        if (action === 'close-modal') {
            closeModal(el.dataset.modal);
            return;
        }
        if (action === 'dismiss-banner') {
            el.classList.remove('show');
            return;
        }
        if (action === 'complete-onboarding') {
            completeOnboarding();
            return;
        }
        if (action === 'switch-tab') {
            switchTab(el.dataset.tab);
            return;
        }
        if (action === 'toggle-dark-mode') {
            appState.settings.darkMode = !appState.settings.darkMode;
            applyThemeVariables();
            saveState();
            renderSection('inicio');
            renderSection('ajustes');
            return;
        }

        /* --- TAREAS --- */
        if (action === 'open-task-modal') {
            openModal('task', renderTaskModalContent(null));
            return;
        }
        if (action === 'edit-task') {
            openModal('task', renderTaskModalContent(el.dataset.id));
            return;
        }
        if (action === 'save-task') {
            if (saveTaskFromModal()) {
                closeModal('task');
                renderSection('inicio');
                renderSection('tareas');
                renderSection('calendario');
            }
            return;
        }
        if (action === 'toggle-task') {
            const res = toggleTaskItem(el.dataset.id);
            renderSection('inicio');
            renderSection('tareas');
            renderSection('calendario');
            if (res.becameAllDone && appState.settings.confetti !== false) {
                launchSideConfetti();
            }
            return;
        }
        if (action === 'postpone-task') {
            postponeTaskToTomorrow(el.dataset.id);
            renderSection('inicio');
            renderSection('tareas');
            renderSection('calendario');
            showBannerMessage('⏭️ Tarea pospuesta', 'Movida para mañana');
            return;
        }
        if (action === 'toggle-subtask') {
            toggleSubtaskItem(el.dataset.taskId, el.dataset.subId);
            renderSection('tareas');
            return;
        }
        if (action === 'delete-task') {
            const res = deleteTaskItem(el.dataset.id);
            if (res) {
                renderSection('inicio');
                renderSection('tareas');
                renderSection('calendario');
                showUndoToast(`Tarea eliminada: ${res.removed.title}`, () => {
                    appState.tasks.splice(res.idx, 0, res.removed);
                    evaluateTodayStreak(getTodayRelevantTasks(), appState.routines.some(r => r.completedThisWeek));
                    saveState();
                    renderSection('inicio');
                    renderSection('tareas');
                    renderSection('calendario');
                });
            }
            return;
        }
        if (action === 'filter-tasks') {
            tasksUi.filter = el.dataset.filter;
            renderSection('tareas');
            return;
        }
        if (action === 'toggle-task-archive') {
            tasksUi.showArchive = !tasksUi.showArchive;
            renderSection('tareas');
            return;
        }
        if (action === 'clear-task-archive') {
            const prev = [...appState.tasks];
            const today = getTodayKey();
            appState.tasks = appState.tasks.filter(t => !(t.done && (!t.recurrence || t.recurrence === 'none') && t.completedDate && t.completedDate < today));
            saveState();
            renderSection('tareas');
            showUndoToast('Historial vaciado', () => {
                appState.tasks = prev;
                saveState();
                renderSection('tareas');
            });
            return;
        }

        /* --- FOCUS --- */
        if (action === 'start-focus') {
            startFocusSession(el.dataset.id, () => renderSection('tareas'));
            renderSection('tareas');
            return;
        }
        if (action === 'toggle-focus-play') {
            toggleFocusPlay(() => renderSection('tareas'));
            renderSection('tareas');
            return;
        }
        if (action === 'set-focus-mins') {
            setFocusMinutes(parseInt(el.dataset.mins, 10) || 25, () => renderSection('tareas'));
            renderSection('tareas');
            return;
        }
        if (action === 'stop-focus') {
            stopFocusSession();
            renderSection('tareas');
            return;
        }
        if (action === 'confirm-focus-done') {
            const tid = tasksUi.focus.activeTaskId;
            stopFocusSession();
            if (tid) {
                const t = appState.tasks.find(x => x.id === tid);
                if (t && !t.done) {
                    const res = toggleTaskItem(tid);
                    if (res.becameAllDone && appState.settings.confetti !== false) launchSideConfetti();
                }
            }
            renderSection('inicio');
            renderSection('tareas');
            renderSection('calendario');
            return;
        }
        if (action === 'dismiss-focus-prompt') {
            stopFocusSession();
            renderSection('tareas');
            return;
        }

        /* --- CALENDARIO --- */
        if (action === 'select-cal-date') {
            calendarUi.selectedDate = el.dataset.date;
            renderSection('calendario');
            return;
        }
        if (action === 'shift-cal-month') {
            calendarUi.month += parseInt(el.dataset.delta, 10);
            if (calendarUi.month < 0) { calendarUi.month = 11; calendarUi.year--; }
            if (calendarUi.month > 11) { calendarUi.month = 0; calendarUi.year++; }
            renderSection('calendario');
            return;
        }
        if (action === 'set-cal-view') {
            calendarUi.viewMode = el.dataset.view;
            renderSection('calendario');
            return;
        }
        if (action === 'open-event-modal') {
            openModal('event', renderEventModalContent(null));
            return;
        }
        if (action === 'edit-event') {
            openModal('event', renderEventModalContent(el.dataset.id));
            return;
        }
        if (action === 'pick-event-color') {
            calendarUi.selectedColor = el.dataset.color;
            openModal('event', renderEventModalContent(calendarUi.editingEventId));
            return;
        }
        if (action === 'save-event') {
            if (saveEventFromModal()) {
                closeModal('event');
                renderSection('inicio');
                renderSection('calendario');
            }
            return;
        }
        if (action === 'delete-event') {
            const res = deleteEventItem(el.dataset.id);
            if (res) {
                renderSection('inicio');
                renderSection('calendario');
                showUndoToast(`Evento eliminado: ${res.removed.title}`, () => {
                    appState.events.splice(res.idx, 0, res.removed);
                    saveState();
                    renderSection('inicio');
                    renderSection('calendario');
                });
            }
            return;
        }

        /* --- AVISOS --- */
        if (action === 'open-alert-modal') {
            openModal('alert', renderAlertModalContent(null));
            return;
        }
        if (action === 'edit-alert') {
            openModal('alert', renderAlertModalContent(el.dataset.id));
            return;
        }
        if (action === 'save-alert') {
            if (saveAlertFromModal()) {
                closeModal('alert');
                renderSection('inicio');
                renderSection('avisos');
            }
            return;
        }
        if (action === 'toggle-alert') {
            const a = appState.alerts.find(x => x.id === el.dataset.id);
            if (a) {
                a.active = !a.active;
                saveState();
                renderSection('inicio');
                renderSection('avisos');
            }
            return;
        }
        if (action === 'delete-alert') {
            const idx = appState.alerts.findIndex(x => x.id === el.dataset.id);
            if (idx !== -1) {
                const removed = appState.alerts[idx];
                appState.alerts.splice(idx, 1);
                saveState();
                renderSection('inicio');
                renderSection('avisos');
                showUndoToast(`Aviso eliminado: ${removed.title}`, () => {
                    appState.alerts.splice(idx, 0, removed);
                    saveState();
                    renderSection('inicio');
                    renderSection('avisos');
                });
            }
            return;
        }
        if (action === 'toggle-morning-alert') {
            appState.morning.enabled = !appState.morning.enabled;
            saveState();
            renderSection('avisos');
            return;
        }
        if (action === 'trigger-push-preview') {
            const streak = computeStreakStats();
            const pending = getTodayRelevantTasks().filter(t => !t.done).length;
            showBannerMessage(`¡Buenos días, ${appState.settings.name || 'Amigo'}!`, `${pending} tareas pendientes · Racha ${streak.days}d`);
            return;
        }

        /* --- FITNESS & RUTINAS --- */
        if (action === 'set-fitness-view') {
            fitnessUi.mainView = el.dataset.view;
            renderSection('fitness');
            if (el.dataset.view === 'running' && !runUi.hasLocated) {
                locateUserCity(true);
            }
            return;
        }
        if (action === 'filter-muscle') {
            const m = el.dataset.muscle || null;
            fitnessUi.selectedMuscleFilter = fitnessUi.selectedMuscleFilter === m ? null : m;
            renderSection('fitness');
            return;
        }
        if (action === 'open-gym-pr') {
            fitnessUi.prSetsDraft = [{ weight: '', reps: '' }];
            openModal('gym-pr', renderGymPrModalContent());
            return;
        }
        if (action === 'add-pr-set-row') {
            fitnessUi.prSetsDraft.push({ weight: '', reps: '' });
            openModal('gym-pr', renderGymPrModalContent());
            return;
        }
        if (action === 'save-gym-pr') {
            if (saveGymPrFromModal()) {
                closeModal('gym-pr');
                renderSection('inicio');
                renderSection('fitness');
            }
            return;
        }
        if (action === 'open-routine-detail') {
            openModal('routine-detail', renderRoutineDetailHtml(el.dataset.id));
            return;
        }
        if (action === 'toggle-routine-done' || action === 'toggle-routine-done-modal') {
            const r = appState.routines.find(x => x.id === el.dataset.id);
            if (r) {
                r.completedThisWeek = !r.completedThisWeek;
                evaluateTodayStreak(getTodayRelevantTasks(), appState.routines.some(x => x.completedThisWeek));
                saveState();
                renderSection('inicio');
                renderSection('fitness');
                if (action === 'toggle-routine-done-modal') {
                    openModal('routine-detail', renderRoutineDetailHtml(r.id));
                }
            }
            return;
        }
        if (action === 'reset-weekly-routines') {
            appState.routines.forEach(r => { r.completedThisWeek = false; });
            evaluateTodayStreak(getTodayRelevantTasks(), false);
            saveState();
            renderSection('inicio');
            renderSection('fitness');
            return;
        }
        if (action === 'open-new-routine') {
            openModal('new-routine', renderNewRoutineModalHtml());
            return;
        }
        if (action === 'toggle-new-routine-muscle') {
            const mKey = el.dataset.muscle;
            const arr = fitnessUi.newRoutineMuscles;
            const idx = arr.indexOf(mKey);
            if (idx > -1 && arr.length > 1) arr.splice(idx, 1);
            else if (idx === -1) arr.push(mKey);
            openModal('new-routine', renderNewRoutineModalHtml());
            return;
        }
        if (action === 'save-new-routine') {
            const name = (document.getElementById('nr-name')?.value || '').trim();
            if (!name) return;
            appState.routines.push({
                id: generateId(),
                name,
                muscles: [...fitnessUi.newRoutineMuscles],
                completedThisWeek: false,
                exercises: [{ id: generateId(), name: 'Ejercicio principal', lastWeight: 40, lastReps: 10 }]
            });
            saveState();
            closeModal('new-routine');
            renderSection('inicio');
            renderSection('fitness');
            return;
        }
        if (action === 'delete-routine') {
            const idx = appState.routines.findIndex(x => x.id === el.dataset.id);
            if (idx !== -1) {
                const removed = appState.routines[idx];
                appState.routines.splice(idx, 1);
                saveState();
                closeModal('routine-detail');
                renderSection('inicio');
                renderSection('fitness');
                showUndoToast(`Rutina eliminada: ${removed.name}`, () => {
                    appState.routines.splice(idx, 0, removed);
                    saveState();
                    renderSection('inicio');
                    renderSection('fitness');
                });
            }
            return;
        }
        if (action === 'add-routine-ex') {
            addExerciseToRoutine(el.dataset.id);
            return;
        }
        if (action === 'log-set-and-rest') {
            logRoutineSetAndRest(el.dataset.id, el.dataset.exId, () => {
                if (fitnessUi.restTimer.openRoutineId) {
                    openModal('routine-detail', renderRoutineDetailHtml(fitnessUi.restTimer.openRoutineId));
                }
            });
            openModal('routine-detail', renderRoutineDetailHtml(el.dataset.id));
            renderSection('inicio');
            renderSection('fitness');
            showBannerMessage('⏱️ Serie registrada', 'Descanso iniciado automáticamente');
            return;
        }
        if (action === 'start-rest') {
            startRestTimer(parseInt(el.dataset.sec, 10) || 90, () => {
                if (fitnessUi.restTimer.openRoutineId) {
                    openModal('routine-detail', renderRoutineDetailHtml(fitnessUi.restTimer.openRoutineId));
                }
            });
            if (fitnessUi.restTimer.openRoutineId) {
                openModal('routine-detail', renderRoutineDetailHtml(fitnessUi.restTimer.openRoutineId));
            }
            return;
        }
        if (action === 'toggle-rest') {
            toggleRestTimer(() => {
                if (fitnessUi.restTimer.openRoutineId) {
                    openModal('routine-detail', renderRoutineDetailHtml(fitnessUi.restTimer.openRoutineId));
                }
            });
            if (fitnessUi.restTimer.openRoutineId) {
                openModal('routine-detail', renderRoutineDetailHtml(fitnessUi.restTimer.openRoutineId));
            }
            return;
        }
        if (action === 'adjust-rest') {
            adjustRestTimer(parseInt(el.dataset.delta, 10) || 15);
            if (fitnessUi.restTimer.openRoutineId) {
                openModal('routine-detail', renderRoutineDetailHtml(fitnessUi.restTimer.openRoutineId));
            }
            return;
        }

        /* --- RUNNING --- */
        if (action === 'locate-gps') {
            locateUserCity(false);
            return;
        }
        if (action === 'search-run-location') {
            searchRunLocation();
            return;
        }
        if (action === 'toggle-run') {
            const finished = toggleRunningSession();
            if (finished) renderSection('inicio');
            renderSection('fitness');
            return;
        }
        if (action === 'sim-run-step') {
            simulateStepForward();
            return;
        }
        if (action === 'select-saved-run') {
            runUi.selectedLogId = el.dataset.id;
            renderSection('fitness');
            return;
        }
        if (action === 'clear-selected-run') {
            runUi.selectedLogId = null;
            renderSection('fitness');
            return;
        }

        /* --- AJUSTES Y UTILIDADES --- */
        if (action === 'set-unit') {
            appState.settings.units = el.dataset.unit === 'lb' ? 'lb' : 'kg';
            saveState();
            renderSection('fitness');
            renderSection('ajustes');
            return;
        }
        if (action === 'toggle-confetti') {
            appState.settings.confetti = !(appState.settings.confetti !== false);
            saveState();
            renderSection('ajustes');
            return;
        }
        if (action === 'toggle-dev-mode') {
            appState.settings.devMode = !appState.settings.devMode;
            saveState();
            renderSection('fitness');
            renderSection('ajustes');
            return;
        }
        if (action === 'set-accent') {
            appState.settings.accent = el.dataset.hex;
            appState.settings.accentSoft = el.dataset.soft;
            applyThemeVariables();
            saveState();
            renderAllSections();
            return;
        }
        if (action === 'export-backup') {
            exportBackupFile();
            showBannerMessage('📤 Respaldo .JSON descargado', `midia-respaldo-${getTodayKey()}.json`);
            return;
        }
        if (action === 'download-pwa-icons') {
            downloadGeneratedPwaIcons();
            showBannerMessage('🖼️ Iconos descargados', 'Guarda icon-192.png e icon-512.png en la raíz');
            return;
        }
        if (action === 'load-demo-data') {
            const demo = buildDemoData();
            appState.tasks = [...demo.tasks, ...appState.tasks];
            appState.events = [...demo.events, ...appState.events];
            appState.alerts = [...demo.alerts, ...appState.alerts];
            appState.gymLogs = [...demo.gymLogs, ...appState.gymLogs];
            appState.runLogs = [...demo.runLogs, ...appState.runLogs];
            saveState();
            renderAllSections();
            showBannerMessage('✨ Datos demo cargados', 'Ya puedes probar todas las secciones');
            return;
        }
        if (action === 'factory-reset') {
            if (!confirm('¿Seguro que quieres borrar todos tus datos para empezar de cero?')) return;
            localStorage.removeItem(STORAGE_KEY);
            location.reload();
            return;
        }
        if (action === 'undo-delete') {
            triggerUndo();
        }
    });

    /* Eventos input / change delegados */
    screen.addEventListener('input', (e) => {
        const el = e.target;
        if (el.dataset.input === 'search-tasks') {
            tasksUi.searchQuery = el.value;
            renderSection('tareas');
        } else if (el.dataset.input === 'run-search-debounce') {
            scheduleNominatimSearch(el.value);
        } else if (el.dataset.setIdx !== undefined) {
            const idx = parseInt(el.dataset.setIdx, 10);
            if (fitnessUi.prSetsDraft[idx]) {
                fitnessUi.prSetsDraft[idx][el.dataset.setField] = el.value;
            }
        }
    });

    screen.addEventListener('change', async (e) => {
        const el = e.target;
        if (el.dataset.change === 'update-user-name') {
            const val = el.value.trim();
            if (val) {
                appState.settings.name = val;
                saveState();
                renderSection('inicio');
                renderSection('ajustes');
            }
        } else if (el.dataset.change === 'select-exercise-chart') {
            fitnessUi.selectedExerciseChart = el.value;
            renderSection('fitness');
        } else if (el.dataset.change === 'routine-ex-field') {
            const r = appState.routines.find(x => x.id === el.dataset.id);
            const ex = r?.exercises.find(x => x.id === el.dataset.exId);
            if (ex) {
                ex[el.dataset.field] = parseFloat(el.value) || 0;
                saveState();
            }
        } else if (el.dataset.file === 'routine-cover') {
            const file = el.files?.[0];
            if (file) {
                try {
                    await updateRoutineCover(el.dataset.id, file);
                    openModal('routine-detail', renderRoutineDetailHtml(el.dataset.id));
                    renderSection('fitness');
                } catch (err) {
                    showBannerMessage('⚠️ Error de imagen', 'No se pudo comprimir la foto.');
                }
            }
        } else if (el.dataset.file === 'import-backup') {
            const file = el.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const parsed = JSON.parse(ev.target.result);
                    if (!validateBackupObject(parsed)) {
                        showBannerMessage('⚠️ JSON inválido', 'El archivo no corresponde a Mi Día.');
                        return;
                    }
                    replaceAppState(parsed);
                    saveState();
                    mountAppShell();
                    showBannerMessage('📥 Respaldo importado', 'Datos restaurados correctamente');
                } catch (err) {
                    showBannerMessage('⚠️ Archivo corrupto', 'No se pudo leer el JSON.');
                } finally {
                    el.value = '';
                }
            };
            reader.readAsText(file);
        }
    });
}

function addExerciseToRoutine(rid) {
    const inp = document.getElementById('new-ex-name');
    const name = (inp?.value || '').trim();
    if (!name) return;
    const r = appState.routines.find(x => x.id === rid);
    if (r) {
        r.exercises.push({ id: generateId(), name, lastWeight: 20, lastReps: 10 });
        saveState();
        openModal('routine-detail', renderRoutineDetailHtml(rid));
        renderSection('fitness');
    }
}

function completeOnboarding() {
    const inp = document.getElementById('onboarding-name-input');
    const err = document.getElementById('onboarding-error');
    const val = (inp?.value || '').trim();
    if (!val) {
        if (err) err.classList.remove('hidden');
        if (inp) inp.focus();
        return;
    }
    appState.settings.name = val;
    appState.settings.onboarded = true;
    saveState();
    mountAppShell();
    checkRemindersAndMorningBanner();
}

/* =========================================================
   NAVEGACIÓN POR SWIPE TÁCTIL
   ========================================================= */
function attachSwipeNavigation() {
    const screen = document.getElementById('app-screen');
    if (!screen || screen.dataset.swipeBound === 'true') return;
    screen.dataset.swipeBound = 'true';

    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let currentDx = 0;
    let gestureMode = null;

    const isBlocked = (target) => {
        if (!target || !target.closest) return false;
        return Boolean(
            !appState.settings.onboarded ||
            target.closest('.running-map-box') ||
            target.closest('input') ||
            target.closest('select') ||
            target.closest('textarea') ||
            target.closest('.dev-modal-backdrop.open')
        );
    };

    screen.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        if (isBlocked(e.target)) { gestureMode = 'blocked'; return; }
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        startTime = performance.now();
        currentDx = 0;
        gestureMode = null;
    }, { passive: true });

    screen.addEventListener('touchmove', (e) => {
        if (e.touches.length !== 1 || gestureMode === 'blocked' || gestureMode === 'vertical') return;
        const dx = e.touches[0].clientX - startX;
        const dy = e.touches[0].clientY - startY;

        if (gestureMode === null) {
            if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
            gestureMode = Math.abs(dx) > Math.abs(dy) * 1.15 ? 'horizontal' : 'vertical';
            if (gestureMode === 'vertical') return;
        }

        if (gestureMode === 'horizontal') {
            if (e.cancelable) e.preventDefault();
            const track = document.getElementById('carousel-track');
            const viewport = document.getElementById('carousel-viewport');
            if (!track || !viewport) return;
            const width = viewport.offsetWidth || window.innerWidth;
            const idx = TAB_ORDER.indexOf(uiState.activeTab);
            const adjDx = ((idx === 0 && dx > 0) || (idx === TAB_ORDER.length - 1 && dx < 0)) ? dx * 0.28 : dx;
            currentDx = adjDx;
            track.style.transition = 'none';
            track.style.transform = `translate3d(${-idx * width + adjDx}px, 0, 0)`;
        }
    }, { passive: false });

    screen.addEventListener('touchend', () => {
        if (gestureMode !== 'horizontal') { gestureMode = null; return; }
        gestureMode = null;
        const viewport = document.getElementById('carousel-viewport');
        const width = viewport?.offsetWidth || window.innerWidth;
        const idx = TAB_ORDER.indexOf(uiState.activeTab);
        const velocity = Math.abs(currentDx) / Math.max(1, performance.now() - startTime);
        let targetIdx = idx;

        if (Math.abs(currentDx) > width * 0.22 || (velocity > 0.45 && Math.abs(currentDx) > 28)) {
            if (currentDx < 0 && idx < TAB_ORDER.length - 1) targetIdx = idx + 1;
            else if (currentDx > 0 && idx > 0) targetIdx = idx - 1;
        }
        switchTab(TAB_ORDER[targetIdx], true);
    }, { passive: true });
}

/* =========================================================
   ARRANQUE Y REGISTRO DE SERVICE WORKER
   ========================================================= */
window.addEventListener('DOMContentLoaded', () => {
    checkRolloverAndRecurrence();
    mountAppShell();
    bindGlobalDelegation();
    attachSwipeNavigation();
    checkRemindersAndMorningBanner();

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            handleDayOrVisibilityRefresh();
        }
    });
    setInterval(handleDayOrVisibilityRefresh, 30000);

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(err => {
            console.warn('No se pudo registrar el Service Worker:', err);
        });
    }
});
