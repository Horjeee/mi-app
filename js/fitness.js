import { appState, saveState, evaluateTodayStreak } from './state.js';
import { getTodayRelevantTasks } from './tasks.js';
import {
    escapeHtml,
    generateId,
    getTodayKey,
    getWeekStartKey,
    formatShortDate,
    muscleCatalog,
    playGentleChime,
    compressImageFile
} from './utils.js';

export const fitnessUi = {
    mainView: 'cuerpo', // 'cuerpo' | 'rutina' | 'running'
    selectedMuscleFilter: null,
    selectedExerciseChart: '',
    newRoutineMuscles: ['pecho', 'brazos'],
    prSetsDraft: [{ weight: '', reps: '' }],
    restTimer: {
        openRoutineId: null,
        total: 90,
        remaining: 90,
        endTime: null,
        running: false,
        timerId: null
    }
};

/* Fórmula de Epley para 1RM estimado */
export function calcEstimated1RM(weight, reps) {
    const w = parseFloat(weight) || 0;
    const r = parseInt(reps, 10) || 1;
    if (w <= 0) return 0;
    if (r === 1) return Math.round(w * 10) / 10;
    return Math.round(w * (1 + r / 30) * 10) / 10;
}

/* Filtra gymLogs únicamente de la semana actual */
export function getThisWeekGymLogs() {
    const weekStart = getWeekStartKey();
    return appState.gymLogs.filter(g => g.date && g.date >= weekStart);
}

/* Volumen semanal (series y tonelaje) por músculo */
export function getWeeklyMuscleVolume() {
    const weekLogs = getThisWeekGymLogs();
    const vol = {};
    Object.keys(muscleCatalog).forEach(m => {
        vol[m] = { sets: 0, tonnage: 0 };
    });

    weekLogs.forEach(g => {
        if (!vol[g.muscle]) vol[g.muscle] = { sets: 0, tonnage: 0 };
        const setsArr = Array.isArray(g.sets) && g.sets.length > 0 ? g.sets : [{ weight: g.weight, reps: g.reps }];
        setsArr.forEach(s => {
            vol[g.muscle].sets += 1;
            vol[g.muscle].tonnage += (parseFloat(s.weight) || 0) * (parseInt(s.reps, 10) || 0);
        });
    });

    // Rutinas marcadas esta semana aportan series estimadas si no hay log explícito
    appState.routines.forEach(r => {
        if (r.completedThisWeek && Array.isArray(r.muscles)) {
            r.muscles.forEach(m => {
                if (vol[m] && vol[m].sets === 0) {
                    vol[m].sets += (r.exercises?.length || 1) * 3;
                }
            });
        }
    });

    return vol;
}

/* Detecta si un registro supera el mejor 1RM histórico del mismo ejercicio */
export function isPersonalRecordLog(log) {
    const current1RM = calcEstimated1RM(log.weight, log.reps);
    if (current1RM <= 0) return false;
    const sameEx = appState.gymLogs.filter(g => g.exercise.toLowerCase() === log.exercise.toLowerCase());
    if (sameEx.length < 2) return true;
    const bestOther = Math.max(...sameEx.filter(g => g.id !== log.id).map(g => calcEstimated1RM(g.weight, g.reps)));
    return current1RM > bestOther;
}

function renderExerciseProgressChart(exerciseName, unit) {
    const logs = appState.gymLogs
        .filter(g => g.exercise.toLowerCase() === exerciseName.toLowerCase())
        .slice()
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    if (logs.length === 0) return '';

    const values = logs.map(l => calcEstimated1RM(l.weight, l.reps));
    const maxVal = Math.max(...values, 1);
    const minVal = Math.min(...values);
    const span = Math.max(maxVal - minVal, 5);
    const w = 280;
    const h = 84;
    const pad = 14;

    const pts = values.map((v, idx) => {
        const x = logs.length === 1 ? w / 2 : pad + (idx / (logs.length - 1)) * (w - pad * 2);
        const y = h - pad - ((v - minVal) / span) * (h - pad * 2);
        return { x, y, v, date: logs[idx].date };
    });

    const polyPoints = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const best1RM = Math.max(...values);

    return `
        <div class="app-card mb-3">
            <div class="row-between mb-2">
                <div>
                    <p class="eyebrow">Progresión 1RM Estimado</p>
                    <p class="sec-title">${escapeHtml(exerciseName)}</p>
                </div>
                <span class="badge-pill btn-soft">🏆 PR 1RM: ${best1RM} ${unit}</span>
            </div>
            <svg width="100%" height="${h}" viewBox="0 0 ${w} ${h}" aria-label="Gráfica de progreso">
                ${pts.length > 1 ? `<polyline fill="none" stroke="var(--accent-color)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${polyPoints}"/>` : ''}
                ${pts.map(p => `
                    <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4.5" fill="var(--accent-color)"/>
                    <text x="${p.x.toFixed(1)}" y="${Math.max(11, p.y - 7).toFixed(1)}" text-anchor="middle" fill="var(--text-primary)" font-size="11" font-weight="800">${p.v}</text>
                `).join('')}
            </svg>
            <div class="row-between meta-text">
                <span>${escapeHtml(formatShortDate(logs[0].date))}</span>
                <span>${logs.length} sesiones</span>
                <span>${escapeHtml(formatShortDate(logs[logs.length - 1].date))}</span>
            </div>
        </div>
    `;
}

export function getRoutineMuscleSvg(muscles, isDone) {
    const has = m => (muscles || []).includes(m);
    const activeFill = isDone ? '#10B981' : '#EF4444';
    const inactiveFill = 'rgba(148, 163, 184, 0.25)';
    const isBack = muscles && ['espalda', 'gluteos', 'gemelos'].includes(muscles[0]);
    if (isBack) {
        return `<svg width="74" height="74" viewBox="0 0 120 185" aria-hidden="true"><circle cx="60" cy="18" r="11" fill="none" stroke="#64748B" stroke-width="2"/><path d="M36 40 L84 40 L79 96 L41 96 Z" fill="none" stroke="#64748B" stroke-width="1.6"/><ellipse cx="31" cy="46" rx="7" ry="9" fill="${has('hombros') ? activeFill : inactiveFill}"/><ellipse cx="89" cy="46" rx="7" ry="9" fill="${has('hombros') ? activeFill : inactiveFill}"/><path d="M40 41 L80 41 L74 82 L46 82 Z" fill="${has('espalda') ? activeFill : inactiveFill}"/><rect x="21" y="56" width="9" height="32" rx="4.5" transform="rotate(8 21 56)" fill="${has('brazos') ? activeFill : inactiveFill}"/><rect x="90" y="56" width="9" height="32" rx="4.5" transform="rotate(-8 90 56)" fill="${has('brazos') ? activeFill : inactiveFill}"/><path d="M41 86 L59 86 L59 107 L42 105 Z" fill="${has('gluteos') ? activeFill : inactiveFill}"/><path d="M61 86 L79 86 L78 105 L61 107 Z" fill="${has('gluteos') ? activeFill : inactiveFill}"/><ellipse cx="50" cy="156" rx="6" ry="15" fill="${has('gemelos') ? activeFill : inactiveFill}"/><ellipse cx="70" cy="156" rx="6" ry="15" fill="${has('gemelos') ? activeFill : inactiveFill}"/></svg>`;
    }
    return `<svg width="74" height="74" viewBox="0 0 120 185" aria-hidden="true"><circle cx="60" cy="18" r="11" fill="none" stroke="#64748B" stroke-width="2"/><path d="M36 40 L84 40 L79 96 L41 96 Z" fill="none" stroke="#64748B" stroke-width="1.6"/><ellipse cx="31" cy="46" rx="7" ry="9" fill="${has('hombros') ? activeFill : inactiveFill}"/><ellipse cx="89" cy="46" rx="7" ry="9" fill="${has('hombros') ? activeFill : inactiveFill}"/><path d="M40 42 L59 42 L59 61 L42 59 Z" fill="${has('pecho') ? activeFill : inactiveFill}"/><path d="M61 42 L80 42 L78 59 L61 61 Z" fill="${has('pecho') ? activeFill : inactiveFill}"/><rect x="21" y="56" width="9" height="32" rx="4.5" transform="rotate(8 21 56)" fill="${has('brazos') ? activeFill : inactiveFill}"/><rect x="90" y="56" width="9" height="32" rx="4.5" transform="rotate(-8 90 56)" fill="${has('brazos') ? activeFill : inactiveFill}"/><rect x="48" y="64" width="24" height="29" rx="4" fill="${has('abdomen') ? activeFill : inactiveFill}"/><path d="M42 99 L58 99 L56 138 L44 138 Z" fill="${has('cuadriceps') ? activeFill : inactiveFill}"/><path d="M62 99 L78 99 L76 138 L64 138 Z" fill="${has('cuadriceps') ? activeFill : inactiveFill}"/></svg>`;
}

export function renderFitnessBodyAndRoutines(runningHtml) {
    const v = fitnessUi.mainView;
    const unit = escapeHtml(appState.settings.units || 'kg');
    const topBtnAction = v === 'rutina' ? 'open-new-routine' : v === 'running' ? 'toggle-run' : 'open-gym-pr';
    const topBtnText = v === 'rutina' ? '+ Rutina' : v === 'running' ? '▶️ / ⏹' : '+ Sesión PR';

    // Filtrar músculos trabajados SOLO esta semana
    const weekLogs = getThisWeekGymLogs();
    const worked = new Set();
    appState.routines.forEach(r => { if (r.completedThisWeek) r.muscles.forEach(m => worked.add(m)); });
    weekLogs.forEach(g => worked.add(g.muscle));

    const weeklyVol = getWeeklyMuscleVolume();
    const mClass = m => `muscle-zone ${worked.has(m) ? 'worked' : ''} ${fitnessUi.selectedMuscleFilter === m ? 'selected' : ''}`;
    const filteredLogs = fitnessUi.selectedMuscleFilter
        ? appState.gymLogs.filter(g => g.muscle === fitnessUi.selectedMuscleFilter)
        : appState.gymLogs;

    const uniqueExercises = [...new Set(appState.gymLogs.map(g => g.exercise))];
    const activeChartEx = fitnessUi.selectedExerciseChart && uniqueExercises.includes(fitnessUi.selectedExerciseChart)
        ? fitnessUi.selectedExerciseChart
        : (uniqueExercises[0] || '');

    const doneR = appState.routines.filter(r => r.completedThisWeek).length;
    const remR = appState.routines.length - doneR;
    const pctR = appState.routines.length ? Math.round((doneR / appState.routines.length) * 100) : 0;

    let subContent = '';
    if (v === 'cuerpo') {
        subContent = `
            <div class="app-card mb-3">
                <div class="row-between mb-2">
                    <span class="sec-title">Músculos trabajados esta semana</span>
                    ${fitnessUi.selectedMuscleFilter ? `<button data-action="filter-muscle" data-muscle="" class="meta-text" style="color: var(--accent-color); font-weight: 800;">Ver todos</button>` : ''}
                </div>
                <div class="grid-2" style="background-color: var(--bg-screen); border-radius: 16px; padding: 10px; justify-items: center;">
                    <div style="text-align: center;">
                        <svg width="108" height="142" viewBox="0 0 120 185" aria-label="Mapa muscular frontal">
                            <circle cx="60" cy="18" r="11" fill="none" stroke="var(--body-outline)" stroke-width="2"/>
                            <path d="M36 40 L84 40 L79 96 L41 96 Z" fill="none" stroke="var(--body-outline)" stroke-width="1.6"/>
                            <ellipse data-action="filter-muscle" data-muscle="hombros" class="${mClass('hombros')}" cx="31" cy="46" rx="7" ry="9"/>
                            <ellipse data-action="filter-muscle" data-muscle="hombros" class="${mClass('hombros')}" cx="89" cy="46" rx="7" ry="9"/>
                            <path data-action="filter-muscle" data-muscle="pecho" class="${mClass('pecho')}" d="M40 42 L59 42 L59 61 L42 59 Z"/>
                            <path data-action="filter-muscle" data-muscle="pecho" class="${mClass('pecho')}" d="M61 42 L80 42 L78 59 L61 61 Z"/>
                            <rect data-action="filter-muscle" data-muscle="brazos" class="${mClass('brazos')}" x="21" y="56" width="9" height="32" rx="4.5" transform="rotate(8 21 56)"/>
                            <rect data-action="filter-muscle" data-muscle="brazos" class="${mClass('brazos')}" x="90" y="56" width="9" height="32" rx="4.5" transform="rotate(-8 90 56)"/>
                            <rect data-action="filter-muscle" data-muscle="abdomen" class="${mClass('abdomen')}" x="48" y="64" width="24" height="29" rx="4"/>
                            <path data-action="filter-muscle" data-muscle="cuadriceps" class="${mClass('cuadriceps')}" d="M42 99 L58 99 L56 138 L44 138 Z"/>
                            <path data-action="filter-muscle" data-muscle="cuadriceps" class="${mClass('cuadriceps')}" d="M62 99 L78 99 L76 138 L64 138 Z"/>
                        </svg>
                        <span class="eyebrow" style="display: block;">Frontal</span>
                    </div>
                    <div style="text-align: center;">
                        <svg width="108" height="142" viewBox="0 0 120 185" aria-label="Mapa muscular espalda">
                            <circle cx="60" cy="18" r="11" fill="none" stroke="var(--body-outline)" stroke-width="2"/>
                            <path d="M36 40 L84 40 L79 96 L41 96 Z" fill="none" stroke="var(--body-outline)" stroke-width="1.6"/>
                            <ellipse data-action="filter-muscle" data-muscle="hombros" class="${mClass('hombros')}" cx="31" cy="46" rx="7" ry="9"/>
                            <ellipse data-action="filter-muscle" data-muscle="hombros" class="${mClass('hombros')}" cx="89" cy="46" rx="7" ry="9"/>
                            <path data-action="filter-muscle" data-muscle="espalda" class="${mClass('espalda')}" d="M40 41 L80 41 L74 82 L46 82 Z"/>
                            <rect data-action="filter-muscle" data-muscle="brazos" class="${mClass('brazos')}" x="21" y="56" width="9" height="32" rx="4.5" transform="rotate(8 21 56)"/>
                            <rect data-action="filter-muscle" data-muscle="brazos" class="${mClass('brazos')}" x="90" y="56" width="9" height="32" rx="4.5" transform="rotate(-8 90 56)"/>
                            <path data-action="filter-muscle" data-muscle="gluteos" class="${mClass('gluteos')}" d="M41 86 L59 86 L59 107 L42 105 Z"/>
                            <path data-action="filter-muscle" data-muscle="gluteos" class="${mClass('gluteos')}" d="M61 86 L79 86 L78 105 L61 107 Z"/>
                            <ellipse data-action="filter-muscle" data-muscle="gemelos" class="${mClass('gemelos')}" cx="50" cy="156" rx="6" ry="15"/>
                            <ellipse data-action="filter-muscle" data-muscle="gemelos" class="${mClass('gemelos')}" cx="70" cy="156" rx="6" ry="15"/>
                        </svg>
                        <span class="eyebrow" style="display: block;">Espalda</span>
                    </div>
                </div>

                <!-- Volumen semanal por músculo -->
                <div class="row-wrap mt-3">
                    ${Object.entries(muscleCatalog).map(([k, info]) => {
                        const setsCount = weeklyVol[k]?.sets || 0;
                        const active = fitnessUi.selectedMuscleFilter === k;
                        return `<button data-action="filter-muscle" data-muscle="${k}" class="chip-btn ${active ? 'active' : ''}" style="${!active && worked.has(k) ? 'background: rgba(239,68,68,0.15); color: #DC2626;' : ''}">${escapeHtml(info.label)} (${setsCount}s)</button>`;
                    }).join('')}
                </div>
            </div>

            ${uniqueExercises.length > 0 ? `
                <div class="mb-2">
                    <label class="eyebrow mb-2" style="display: block;">Historial por ejercicio</label>
                    <select data-change="select-exercise-chart" class="ui-input mb-2">
                        ${uniqueExercises.map(ex => `<option value="${escapeHtml(ex)}" ${ex === activeChartEx ? 'selected' : ''}>📈 ${escapeHtml(ex)}</option>`).join('')}
                    </select>
                </div>
                ${activeChartEx ? renderExerciseProgressChart(activeChartEx, unit) : ''}
            ` : ''}

            <div class="col-stack">
                ${filteredLogs.length === 0 ? `<div class="app-card meta-text" style="text-align: center;">Sin sesiones registradas todavía.</div>` : filteredLogs.map(g => {
                    const est1RM = calcEstimated1RM(g.weight, g.reps);
                    const isPr = isPersonalRecordLog(g);
                    const setsArr = Array.isArray(g.sets) ? g.sets : [];
                    return `<div class="app-card">
                        <div class="row-between">
                            <div>
                                <span class="meta-text" style="font-weight: 800; color: #DC2626;">${escapeHtml(muscleCatalog[g.muscle]?.label || g.muscle)} · ${escapeHtml(formatShortDate(g.date))}</span>
                                <p class="sec-title">${escapeHtml(g.exercise)} ${isPr ? `<span class="badge-pill" style="background: rgba(245,158,11,0.18); color: #D97706;">🏆 PR</span>` : ''}</p>
                            </div>
                            <div style="text-align: right;">
                                <span class="sec-title" style="color: var(--accent-color); display: block;">${g.weight} ${unit} × ${g.reps}</span>
                                <span class="meta-text">1RM ~${est1RM} ${unit}</span>
                            </div>
                        </div>
                        ${setsArr.length > 1 ? `
                            <div class="row-wrap mt-2">
                                ${setsArr.map((s, idx) => `<span class="badge-pill btn-neutral">S${idx + 1}: ${s.weight}${unit}×${s.reps}</span>`).join('')}
                            </div>
                        ` : ''}
                    </div>`;
                }).join('')}
            </div>
        `;
    } else if (v === 'rutina') {
        subContent = `
            <div class="app-card mb-3" style="border-left: 4px solid var(--accent-color);">
                <div class="row-between mb-2">
                    <div>
                        <span class="eyebrow" style="color: var(--accent-color);">Split Semanal</span>
                        <p class="sec-title">${doneR} de ${appState.routines.length} días hechos</p>
                    </div>
                    <button data-action="reset-weekly-routines" class="chip-btn">🔄 Reiniciar</button>
                </div>
                <p class="meta-text mb-2">${remR === 0 ? '🎉 ¡Rutina semanal completada!' : `Quedan ${remR} días por hacer esta semana.`}</p>
                <div style="width: 100%; height: 8px; border-radius: 999px; overflow: hidden; background: var(--bg-screen);">
                    <div style="height: 100%; width: ${pctR}%; background-color: var(--accent-color);"></div>
                </div>
            </div>
            <div class="grid-2">
                ${appState.routines.map(r => {
                    const safeRid = escapeHtml(r.id);
                    return `
                    <div class="app-card" style="padding: 0; overflow: hidden; border: 1.5px solid ${r.completedThisWeek ? '#10B981' : 'var(--border-color)'};">
                        <div data-action="open-routine-detail" data-id="${safeRid}" style="position: relative; height: 96px; display: flex; align-items: center; justify-content: center; background: radial-gradient(circle at center, #1e293b 0%, #090d16 100%); cursor: pointer;">
                            ${r.customImage ? `<img src="${escapeHtml(r.customImage)}" alt="${escapeHtml(r.name)}" style="width: 100%; height: 100%; object-fit: cover;">` : getRoutineMuscleSvg(r.muscles, r.completedThisWeek)}
                            <button data-action="toggle-routine-done" data-id="${safeRid}" aria-label="Marcar rutina ${escapeHtml(r.name)} como hecha" style="position: absolute; top: 8px; right: 8px; width: 28px; height: 28px; border-radius: 999px; color: #FFF; font-weight: 900; background-color: ${r.completedThisWeek ? '#059669' : 'rgba(15,23,42,0.78)'};">✓</button>
                            <span style="position: absolute; bottom: 6px; left: 8px; padding: 2px 7px; border-radius: 6px; font-size: 11px; font-weight: 800; color: #FFF; background-color: ${r.completedThisWeek ? 'rgba(5,150,105,0.9)' : 'rgba(220,38,38,0.9)'};">${r.completedThisWeek ? 'Hecho' : 'Pendiente'}</span>
                        </div>
                        <button data-action="open-routine-detail" data-id="${safeRid}" style="padding: 10px; width: 100%; text-align: left;">
                            <span class="sec-title truncate" style="display: block;">${escapeHtml(r.name)}</span>
                            <span class="meta-text">${r.exercises.length} ejercicios</span>
                        </button>
                    </div>`;
                }).join('')}
            </div>
        `;
    } else {
        subContent = runningHtml;
    }

    return `
        <div class="row-between mb-3">
            <div>
                <p class="eyebrow">Entrenamiento</p>
                <h1 class="page-title">Fitness</h1>
            </div>
            <button data-action="${topBtnAction}" class="btn-primary tap-btn">${topBtnText}</button>
        </div>

        <div class="app-card grid-3 mb-3" style="padding: 6px;">
            <button data-action="set-fitness-view" data-view="cuerpo" class="btn-block" style="padding: 8px; background: ${v === 'cuerpo' ? 'var(--accent-color)' : 'transparent'}; color: ${v === 'cuerpo' ? '#FFF' : 'var(--text-secondary)'};">🧬 Cuerpo</button>
            <button data-action="set-fitness-view" data-view="rutina" class="btn-block" style="padding: 8px; background: ${v === 'rutina' ? 'var(--accent-color)' : 'transparent'}; color: ${v === 'rutina' ? '#FFF' : 'var(--text-secondary)'};">📋 Rutina</button>
            <button data-action="set-fitness-view" data-view="running" class="btn-block" style="padding: 8px; background: ${v === 'running' ? 'var(--accent-color)' : 'transparent'}; color: ${v === 'running' ? '#FFF' : 'var(--text-secondary)'};">🏃 Running</button>
        </div>

        ${subContent}
    `;
}

/* =========================================================
   DETALLE DE RUTINA + DESCANSO CON endTime + SERIES EN VIVO
   ========================================================= */
export function renderRoutineDetailHtml(rid) {
    const r = appState.routines.find(x => x.id === rid);
    if (!r) return '';
    const rt = fitnessUi.restTimer;
    rt.openRoutineId = rid;
    const unit = escapeHtml(appState.settings.units || 'kg');
    const restPct = rt.total > 0 ? Math.round((rt.remaining / rt.total) * 100) : 0;
    const safeRid = escapeHtml(r.id);

    return `
        <div class="row-between mb-3">
            <button data-action="delete-routine" data-id="${safeRid}" class="meta-text" style="color: #E11D48; font-weight: 800;">🗑️ Eliminar</button>
            <span class="sec-title truncate">${escapeHtml(r.name)}</span>
            <button data-action="close-modal" data-modal="routine-detail" class="sec-title" style="color: var(--accent-color);">Listo</button>
        </div>

        <div class="p-2 mb-3" style="background-color: var(--bg-screen); border-radius: 16px; padding: 12px; border: 1px solid ${rt.running ? 'var(--accent-color)' : 'var(--border-color)'};">
            <div class="row-between mb-2">
                <span class="eyebrow" style="color: var(--accent-color);">⏱️ Descanso entre series</span>
                <span id="rest-clock" class="sec-title tabular" style="font-size: 16px;">${String(Math.floor(rt.remaining / 60)).padStart(2, '0')}:${String(rt.remaining % 60).padStart(2, '0')}</span>
            </div>
            <div style="width: 100%; height: 6px; border-radius: 999px; overflow: hidden; background: var(--border-color); margin-bottom: 10px;">
                <div id="rest-bar" style="height: 100%; width: ${restPct}%; background-color: ${rt.remaining === 0 ? '#059669' : 'var(--accent-color)'};"></div>
            </div>
            <div class="row-between">
                <div class="row-center">
                    ${[60, 90, 120, 180].map(sec => `<button data-action="start-rest" data-sec="${sec}" class="chip-btn ${rt.total === sec && rt.running ? 'active' : ''}">${sec / 60}m</button>`).join('')}
                </div>
                <div class="row-center">
                    <button data-action="adjust-rest" data-delta="15" class="chip-btn" style="color: var(--accent-color);">+15s</button>
                    <button data-action="toggle-rest" class="chip-btn" style="background: ${rt.running ? '#DC2626' : '#059669'}; color: #FFF;">${rt.running ? '⏸' : '▶️'}</button>
                </div>
            </div>
        </div>

        <div style="position: relative; height: 96px; border-radius: 16px; overflow: hidden; margin-bottom: 12px; display: flex; align-items: center; justify-content: center; background: radial-gradient(circle at center, #1e293b 0%, #090d16 100%);">
            ${r.customImage ? `<img src="${escapeHtml(r.customImage)}" alt="${escapeHtml(r.name)}" style="width: 100%; height: 100%; object-fit: cover;">` : getRoutineMuscleSvg(r.muscles, r.completedThisWeek)}
            <label style="position: absolute; bottom: 8px; right: 8px; padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 800; color: #FFF; cursor: pointer; background: rgba(15,23,42,0.88); border: 1px solid rgba(255,255,255,0.2);">
                🖼️ Foto <input data-file="routine-cover" data-id="${safeRid}" type="file" accept="image/*" class="hidden">
            </label>
        </div>

        <button data-action="toggle-routine-done-modal" data-id="${safeRid}" class="btn-block mb-3" style="background-color: ${r.completedThisWeek ? '#059669' : 'var(--accent-color)'}; color: #FFF;">
            ${r.completedThisWeek ? '✅ Completado esta semana' : '☑️ Marcar día completado'}
        </button>

        <div class="col-stack mb-3">
            ${r.exercises.map(ex => {
                const safeExId = escapeHtml(ex.id);
                return `<div class="row-between" style="background: var(--bg-screen); padding: 10px; border-radius: 14px;">
                    <span class="sec-title truncate flex-1">${escapeHtml(ex.name)}</span>
                    <input data-change="routine-ex-field" data-id="${safeRid}" data-ex-id="${safeExId}" data-field="lastWeight" type="number" value="${escapeHtml(ex.lastWeight)}" aria-label="Peso" class="ui-input" style="width: 68px; padding: 6px; text-align: center; font-weight: 800;">
                    <span class="meta-text" style="font-weight: 800;">${unit}×</span>
                    <input data-change="routine-ex-field" data-id="${safeRid}" data-ex-id="${safeExId}" data-field="lastReps" type="number" value="${escapeHtml(ex.lastReps)}" aria-label="Repeticiones" class="ui-input" style="width: 56px; padding: 6px; text-align: center; font-weight: 800;">
                    <button data-action="log-set-and-rest" data-id="${safeRid}" data-ex-id="${safeExId}" title="Registrar serie y arrancar descanso" class="chip-btn btn-soft">✓ Serie</button>
                </div>`;
            }).join('')}
        </div>

        <div class="row-center">
            <input id="new-ex-name" type="text" placeholder="Añadir ejercicio..." class="ui-input">
            <button data-action="add-routine-ex" data-id="${safeRid}" aria-label="Añadir ejercicio" class="btn-primary" style="border-radius: 13px; padding: 11px 16px;">+</button>
        </div>
    `;
}

export function syncRestClock(onFinish) {
    const rt = fitnessUi.restTimer;
    if (!rt.running || !rt.endTime) return;
    const left = Math.max(0, Math.ceil((rt.endTime - Date.now()) / 1000));
    rt.remaining = left;
    const clockEl = document.getElementById('rest-clock');
    const barEl = document.getElementById('rest-bar');
    if (clockEl) {
        clockEl.textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
    }
    if (barEl) {
        const pct = rt.total > 0 ? Math.round((left / rt.total) * 100) : 0;
        barEl.style.width = `${pct}%`;
        barEl.style.backgroundColor = left === 0 ? '#059669' : 'var(--accent-color)';
    }
    if (left <= 0) {
        clearInterval(rt.timerId);
        rt.running = false;
        rt.endTime = null;
        playGentleChime();
        if (typeof onFinish === 'function') onFinish();
    }
}

export function startRestTimer(seconds, onTickRender) {
    const rt = fitnessUi.restTimer;
    clearInterval(rt.timerId);
    rt.total = seconds;
    rt.remaining = seconds;
    rt.endTime = Date.now() + seconds * 1000;
    rt.running = true;
    rt.timerId = setInterval(() => syncRestClock(onTickRender), 500);
}

export function toggleRestTimer(onTickRender) {
    const rt = fitnessUi.restTimer;
    if (rt.running) {
        syncRestClock(onTickRender);
        clearInterval(rt.timerId);
        rt.running = false;
        rt.endTime = null;
    } else {
        const secs = rt.remaining > 0 ? rt.remaining : (rt.total || 90);
        startRestTimer(secs, onTickRender);
    }
}

export function adjustRestTimer(delta) {
    const rt = fitnessUi.restTimer;
    rt.remaining = Math.max(5, rt.remaining + delta);
    rt.total = Math.max(rt.total, rt.remaining);
    if (rt.running) {
        rt.endTime = Date.now() + rt.remaining * 1000;
    }
}

/* Marca una serie completada, la guarda en gymLogs del día y arranca el descanso automáticamente */
export function logRoutineSetAndRest(rid, eid, onTickRender) {
    const r = appState.routines.find(x => x.id === rid);
    if (!r) return;
    const ex = r.exercises.find(x => x.id === eid);
    if (!ex) return;

    const today = getTodayKey();
    const muscle = (r.muscles && r.muscles[0]) || 'pecho';
    const w = parseFloat(ex.lastWeight) || 0;
    const reps = parseInt(ex.lastReps, 10) || 1;

    let todayLog = appState.gymLogs.find(g => g.date === today && g.exercise.toLowerCase() === ex.name.toLowerCase());
    if (!todayLog) {
        todayLog = {
            id: generateId(),
            exercise: ex.name,
            muscle,
            weight: w,
            reps,
            date: today,
            sets: []
        };
        appState.gymLogs.unshift(todayLog);
    }
    todayLog.sets.push({ weight: w, reps });
    if (calcEstimated1RM(w, reps) >= calcEstimated1RM(todayLog.weight, todayLog.reps)) {
        todayLog.weight = w;
        todayLog.reps = reps;
    }

    evaluateTodayStreak(getTodayRelevantTasks(), appState.routines.some(x => x.completedThisWeek));
    saveState();
    startRestTimer(fitnessUi.restTimer.total || 90, onTickRender);
}

/* Modal de registro serie a serie */
export function renderGymPrModalContent() {
    const unit = escapeHtml(appState.settings.units || 'kg');
    return `
        <div class="row-between mb-3">
            <button data-action="close-modal" data-modal="gym-pr" class="meta-text" style="font-weight: 700;">Cancelar</button>
            <span class="sec-title">Registrar Sesión / PR</span>
            <button data-action="save-gym-pr" class="sec-title" style="color: var(--accent-color);">Guardar</button>
        </div>
        <input id="gym-ex" type="text" placeholder="Ejercicio (ej. Press Banca)" class="ui-input mb-2">
        <select id="gym-muscle" class="ui-input mb-3">
            ${Object.entries(muscleCatalog).map(([k, v]) => `<option value="${k}">${v.icon} ${escapeHtml(v.label)}</option>`).join('')}
        </select>
        <div class="row-between mb-2">
            <span class="eyebrow">Series realizadas</span>
            <button data-action="add-pr-set-row" class="chip-btn btn-soft">+ Añadir serie</button>
        </div>
        <div id="pr-sets-container" class="col-stack">
            ${fitnessUi.prSetsDraft.map((s, idx) => `
                <div class="row-center">
                    <span class="meta-text" style="font-weight: 800; width: 28px;">S${idx + 1}</span>
                    <input type="number" data-set-idx="${idx}" data-set-field="weight" value="${escapeHtml(s.weight)}" placeholder="Peso (${unit})" class="ui-input">
                    <input type="number" data-set-idx="${idx}" data-set-field="reps" value="${escapeHtml(s.reps)}" placeholder="Reps" class="ui-input">
                </div>
            `).join('')}
        </div>
    `;
}

export function saveGymPrFromModal() {
    const ex = (document.getElementById('gym-ex')?.value || '').trim();
    if (!ex) return false;
    const muscle = document.getElementById('gym-muscle')?.value || 'pecho';

    const rows = document.querySelectorAll('#pr-sets-container [data-set-idx]');
    const setsMap = {};
    rows.forEach(inp => {
        const idx = inp.dataset.setIdx;
        const field = inp.dataset.setField;
        if (!setsMap[idx]) setsMap[idx] = { weight: 0, reps: 1 };
        setsMap[idx][field] = field === 'weight' ? (parseFloat(inp.value) || 0) : (parseInt(inp.value, 10) || 1);
    });

    const sets = Object.values(setsMap).filter(s => s.weight > 0 || s.reps > 0);
    if (sets.length === 0) return false;

    let bestSet = sets[0];
    sets.forEach(s => {
        if (calcEstimated1RM(s.weight, s.reps) > calcEstimated1RM(bestSet.weight, bestSet.reps)) {
            bestSet = s;
        }
    });

    appState.gymLogs.unshift({
        id: generateId(),
        exercise: ex,
        muscle,
        weight: bestSet.weight,
        reps: bestSet.reps,
        date: getTodayKey(),
        sets
    });

    fitnessUi.prSetsDraft = [{ weight: '', reps: '' }];
    evaluateTodayStreak(getTodayRelevantTasks(), appState.routines.some(r => r.completedThisWeek));
    saveState();
    return true;
}

export async function updateRoutineCover(rid, file) {
    const compressedDataUrl = await compressImageFile(file, 800, 0.7);
    const r = appState.routines.find(x => x.id === rid);
    if (r) {
        r.customImage = compressedDataUrl;
        saveState();
    }
}
