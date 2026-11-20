import {
    generateId,
    deepMerge,
    getTodayKey,
    getWeekStartKey,
    getCurrentWeekDates,
    addDays,
    toDateKey
} from './utils.js';

export const STORAGE_KEY = 'midia_iphone_pwa_v2';
export const CURRENT_STATE_VERSION = 2;

export function createDefaultState() {
    const prefersDark = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return {
        version: CURRENT_STATE_VERSION,
        weekStart: getWeekStartKey(),
        settings: {
            name: '',
            onboarded: false,
            units: 'kg',
            darkMode: Boolean(prefersDark),
            accent: '#0066D6',
            accentSoft: 'rgba(0, 102, 214, 0.14)',
            confetti: true,
            devMode: false
        },
        streak: {
            completedDates: []
        },
        morning: {
            enabled: true,
            time: '08:00',
            lastShownDate: null
        },
        tasks: [],
        events: [],
        alerts: [],
        routines: [
            {
                id: generateId(),
                name: 'Día de Pecho',
                muscles: ['pecho', 'brazos'],
                completedThisWeek: false,
                exercises: [
                    { id: generateId(), name: 'Press Banca Plano', lastWeight: 60, lastReps: 10 },
                    { id: generateId(), name: 'Press Inclinado Mancuernas', lastWeight: 22, lastReps: 10 }
                ]
            },
            {
                id: generateId(),
                name: 'Día de Espalda',
                muscles: ['espalda', 'brazos'],
                completedThisWeek: false,
                exercises: [
                    { id: generateId(), name: 'Dominadas', lastWeight: 0, lastReps: 8 },
                    { id: generateId(), name: 'Remo con Barra', lastWeight: 50, lastReps: 10 }
                ]
            },
            {
                id: generateId(),
                name: 'Día de Pierna',
                muscles: ['cuadriceps', 'gluteos', 'gemelos'],
                completedThisWeek: false,
                exercises: [
                    { id: generateId(), name: 'Sentadilla Libre', lastWeight: 70, lastReps: 8 },
                    { id: generateId(), name: 'Prensa Inclinada', lastWeight: 120, lastReps: 12 }
                ]
            }
        ],
        gymLogs: [],
        runLogs: []
    };
}

export function buildDemoData() {
    const tk = getTodayKey();
    const yesterday = toDateKey(addDays(new Date(), -1));
    return {
        tasks: [
            {
                id: generateId(),
                title: 'Revisar objetivos del día',
                category: 'Personal',
                priority: 'alta',
                recurrence: 'daily',
                dueDate: tk,
                dueTime: '09:30',
                done: true,
                completedDate: tk,
                subtasks: [
                    { id: generateId(), title: 'Revisar agenda', done: true },
                    { id: generateId(), title: 'Priorizar 3 tareas clave', done: true }
                ]
            },
            {
                id: generateId(),
                title: 'Preparar mochila del gimnasio',
                category: 'Salud',
                priority: 'media',
                recurrence: 'none',
                dueDate: tk,
                dueTime: '18:00',
                done: false,
                completedDate: null,
                subtasks: []
            },
            {
                id: generateId(),
                title: 'Hacer test de autoescuela',
                category: 'Autoescuela',
                priority: 'alta',
                recurrence: 'none',
                dueDate: tk,
                dueTime: '20:30',
                done: false,
                completedDate: null,
                subtasks: []
            }
        ],
        events: [
            { id: generateId(), date: tk, time: '10:00', endTime: '11:30', title: 'Bloque de estudio / trabajo', color: 'purple', recurrence: 'none' },
            { id: generateId(), date: tk, time: '18:30', endTime: '20:00', title: 'Entrenamiento Gimnasio', color: 'green', recurrence: 'weekly' }
        ],
        alerts: [
            { id: generateId(), title: 'Beber 2.5L de agua al día', date: tk, time: '14:00', level: 'Alta', active: true }
        ],
        gymLogs: [
            {
                id: generateId(),
                exercise: 'Press Banca Plano',
                muscle: 'pecho',
                weight: 85,
                reps: 8,
                date: yesterday,
                sets: [
                    { weight: 80, reps: 8 },
                    { weight: 85, reps: 8 }
                ]
            },
            {
                id: generateId(),
                exercise: 'Sentadilla Libre',
                muscle: 'cuadriceps',
                weight: 100,
                reps: 8,
                date: tk,
                sets: [
                    { weight: 90, reps: 8 },
                    { weight: 100, reps: 8 }
                ]
            }
        ],
        runLogs: [
            {
                id: generateId(),
                title: 'Rodaje Parque Retiro',
                city: 'Madrid, España',
                km: 5.2,
                mins: 26,
                date: yesterday,
                path: [
                    [40.4153, -3.6844],
                    [40.4172, -3.6831],
                    [40.4191, -3.6815],
                    [40.4180, -3.6790],
                    [40.4153, -3.6844]
                ]
            }
        ]
    };
}

export function migrateState(raw) {
    const base = createDefaultState();
    const merged = deepMerge(base, raw || {});
    merged.version = CURRENT_STATE_VERSION;

    // Eliminar ajustes obsoletos (goal, haptics)
    if (merged.settings) {
        delete merged.settings.goal;
        delete merged.settings.haptics;
    }

    // Eventos manuales limpios
    merged.events = Array.isArray(merged.events)
        ? merged.events
            .filter(e => e && !e.linkedTaskId && !String(e.id || '').startsWith('task_ev_'))
            .map(e => ({
                ...e,
                id: String(e.id || generateId()),
                endTime: e.endTime || '',
                recurrence: e.recurrence || 'none'
            }))
        : [];

    // Tareas normalizadas
    merged.tasks = Array.isArray(merged.tasks)
        ? merged.tasks.map(t => ({
            ...t,
            id: String(t.id || generateId()),
            priority: t.priority || 'media',
            recurrence: t.recurrence || 'none',
            subtasks: Array.isArray(t.subtasks)
                ? t.subtasks.map(st => ({ id: String(st.id || generateId()), title: String(st.title || ''), done: Boolean(st.done) }))
                : [],
            completedDate: t.done ? (t.completedDate || getTodayKey()) : null
        }))
        : [];

    // Avisos normalizados con fecha/hora ISO real
    merged.alerts = Array.isArray(merged.alerts)
        ? merged.alerts.map(a => ({
            id: String(a.id || generateId()),
            title: String(a.title || ''),
            date: a.date && /^\d{4}-\d{2}-\d{2}$/.test(a.date) ? a.date : getTodayKey(),
            time: a.time && /^\d{2}:\d{2}$/.test(a.time) ? a.time : '09:00',
            level: a.level || 'Media',
            active: a.active !== false
        }))
        : [];

    // Rutinas
    merged.routines = Array.isArray(merged.routines)
        ? merged.routines.map(r => ({
            ...r,
            id: String(r.id || generateId()),
            exercises: Array.isArray(r.exercises)
                ? r.exercises.map(ex => ({ ...ex, id: String(ex.id || generateId()) }))
                : []
        }))
        : [];

    // GymLogs con fecha ISO
    merged.gymLogs = Array.isArray(merged.gymLogs)
        ? merged.gymLogs.map(g => ({
            ...g,
            id: String(g.id || generateId()),
            date: g.date && /^\d{4}-\d{2}-\d{2}$/.test(g.date) ? g.date : getTodayKey(),
            sets: Array.isArray(g.sets) ? g.sets : [{ weight: g.weight || 0, reps: g.reps || 1 }]
        }))
        : [];

    // RunLogs con fecha ISO
    merged.runLogs = Array.isArray(merged.runLogs)
        ? merged.runLogs.map(rl => ({
            ...rl,
            id: String(rl.id || generateId()),
            date: rl.date && /^\d{4}-\d{2}-\d{2}$/.test(rl.date) ? rl.date : getTodayKey()
        }))
        : [];

    if (!merged.streak || !Array.isArray(merged.streak.completedDates)) {
        merged.streak = { completedDates: [] };
    }

    return merged;
}

export let appState = createDefaultState();
export let storageLoadWarning = null;

try {
    const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('midia_iphone_pwa_v1');
    if (saved) {
        const parsed = JSON.parse(saved);
        appState = migrateState(parsed);
        if (appState.settings && appState.settings.onboarded === undefined) {
            appState.settings.onboarded = Boolean(appState.settings.name && appState.settings.name.trim());
        }
    }
} catch (err) {
    console.error('Error al cargar localStorage:', err);
    storageLoadWarning = 'No se pudieron leer los datos guardados (' + (err.message || 'almacenamiento bloqueado') + ').';
}

export function replaceAppState(nextState) {
    appState = migrateState(nextState);
}

let notifyCallback = null;
export function setStorageAlertHandler(fn) {
    notifyCallback = fn;
}

export function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
        return true;
    } catch (err) {
        console.error('Error al guardar en localStorage:', err);
        const isQuota = err && (err.name === 'QuotaExceededError' || err.code === 22 || err.code === 1014);
        const msg = isQuota
            ? 'Espacio de almacenamiento lleno. Elimina fotos de rutina o datos antiguos.'
            : 'No se pudieron guardar los cambios (' + (err.message || 'error') + ').';
        if (typeof notifyCallback === 'function') notifyCallback(msg);
        return false;
    }
}

/* =========================================================
   REINICIO AUTOMÁTICO DE SEMANA Y TAREAS RECURRENTES
   ========================================================= */
export function checkRolloverAndRecurrence() {
    let changed = false;
    const currentWeekStart = getWeekStartKey();
    if (appState.weekStart !== currentWeekStart) {
        appState.weekStart = currentWeekStart;
        appState.routines.forEach(r => { r.completedThisWeek = false; });
        changed = true;
    }

    const today = getTodayKey();
    appState.tasks.forEach(t => {
        if (t.done && t.recurrence && t.recurrence !== 'none' && t.completedDate && t.completedDate < today) {
            const last = new Date(t.completedDate + 'T00:00:00');
            const diffDays = Math.floor((new Date(today + 'T00:00:00') - last) / 86400000);
            if ((t.recurrence === 'daily' && diffDays >= 1) || (t.recurrence === 'weekly' && diffDays >= 7)) {
                t.done = false;
                t.completedDate = null;
                t.dueDate = today;
                if (Array.isArray(t.subtasks)) {
                    t.subtasks.forEach(st => { st.done = false; });
                }
                changed = true;
            }
        }
    });

    if (changed) saveState();
    return changed;
}

/* =========================================================
   RACHA REAL CON REVERSIÓN SI EL DÍA DEJA DE ESTAR COMPLETO
   ========================================================= */
export function computeStreakStats() {
    const now = new Date();
    const today = toDateKey(now);
    const yesterday = toDateKey(addDays(now, -1));
    const set = new Set(appState.streak.completedDates);
    let count = 0;

    let cursor = set.has(today) ? now : (set.has(yesterday) ? addDays(now, -1) : null);
    while (cursor && set.has(toDateKey(cursor))) {
        count++;
        cursor = addDays(cursor, -1);
    }

    const weekDates = getCurrentWeekDates();
    const weekDays = weekDates.map(d => set.has(d));
    const todayDone = set.has(today);
    return { days: count, weekDays, todayDone };
}

export function evaluateTodayStreak(dueTasksToday, anyRoutineDoneThisWeek) {
    const today = getTodayKey();
    const allDueTasksDone = dueTasksToday.length > 0 && dueTasksToday.every(t => t.done);
    const todayLogExists = appState.gymLogs.some(g => g.date === today) || appState.runLogs.some(r => r.date === today);
    const qualifies = allDueTasksDone || todayLogExists || anyRoutineDoneThisWeek;

    const idx = appState.streak.completedDates.indexOf(today);
    if (qualifies && idx === -1) {
        appState.streak.completedDates.push(today);
    } else if (!qualifies && idx !== -1) {
        appState.streak.completedDates.splice(idx, 1);
    }
}

export function exportBackupFile() {
    const payload = JSON.stringify(appState, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `midia-respaldo-${getTodayKey()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function validateBackupObject(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
    if (!data.settings || typeof data.settings !== 'object') return false;
    if (!Array.isArray(data.tasks) || !Array.isArray(data.events) || !Array.isArray(data.routines)) return false;
    return true;
}
