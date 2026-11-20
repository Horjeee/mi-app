export function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function generateId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export function deepMerge(target, source) {
    if (!source || typeof source !== 'object') return target;
    const out = Array.isArray(target) ? [...target] : { ...target };
    for (const key of Object.keys(source)) {
        const srcVal = source[key];
        const tgtVal = out[key];
        if (Array.isArray(srcVal)) {
            out[key] = srcVal.map(item => (item && typeof item === 'object' ? deepMerge({}, item) : item));
        } else if (srcVal && typeof srcVal === 'object' && tgtVal && typeof tgtVal === 'object' && !Array.isArray(tgtVal)) {
            out[key] = deepMerge(tgtVal, srcVal);
        } else if (srcVal !== undefined) {
            out[key] = srcVal;
        }
    }
    return out;
}

export function toDateKey(d) {
    const dt = d instanceof Date ? d : new Date(d);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export function addDays(base, days) {
    const c = new Date(base);
    c.setDate(c.getDate() + days);
    return c;
}

export function getTodayKey() {
    return toDateKey(new Date());
}

export function getWeekStartKey(dateObj = new Date()) {
    const d = new Date(dateObj);
    const dayOfWeek = (d.getDay() + 6) % 7; // Lunes = 0
    d.setDate(d.getDate() - dayOfWeek);
    return toDateKey(d);
}

export function getCurrentWeekDates() {
    const monday = new Date(getWeekStartKey() + 'T00:00:00');
    return Array.from({ length: 7 }, (_, i) => toDateKey(addDays(monday, i)));
}

export function getCurrentTimeStr() {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

export function formatShortDate(dateStr) {
    if (!dateStr) return '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    const today = getTodayKey();
    const tomorrow = toDateKey(addDays(new Date(), 1));
    const yesterday = toDateKey(addDays(new Date(), -1));
    if (dateStr === today) return 'Hoy';
    if (dateStr === tomorrow) return 'Mañana';
    if (dateStr === yesterday) return 'Ayer';
    const parts = dateStr.split('-');
    const mShort = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `${parseInt(parts[2], 10)} ${mShort[parseInt(parts[1], 10) - 1] || parts[1]}`;
}

export function formatDateTimeLabel(dateStr, timeStr) {
    const d = formatShortDate(dateStr);
    if (!d) return timeStr || '';
    return timeStr ? `${d} · ${timeStr}` : d;
}

export const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export const calendarColors = [
    { id: 'blue', name: 'Personal', hex: '#0066D6' },
    { id: 'purple', name: 'Trabajo / Estudios', hex: '#9333EA' },
    { id: 'green', name: 'Salud', hex: '#059669' },
    { id: 'orange', name: 'Autoescuela / Social', hex: '#EA580C' },
    { id: 'rose', name: 'Importante', hex: '#E11D48' }
];

export const taskCategories = [
    { id: 'Personal', label: 'Personal', icon: '👤', color: 'blue' },
    { id: 'Estudios', label: 'Estudios', icon: '📚', color: 'purple' },
    { id: 'Autoescuela', label: 'Autoescuela', icon: '🚗', color: 'orange' },
    { id: 'Trabajo', label: 'Trabajo', icon: '💼', color: 'purple' },
    { id: 'Salud', label: 'Salud', icon: '💪', color: 'green' },
    { id: 'Hábito', label: 'Hábito', icon: '✨', color: 'green' },
    { id: 'Compras', label: 'Compras', icon: '🛒', color: 'rose' },
    { id: 'Hogar', label: 'Hogar', icon: '🏠', color: 'blue' }
];

export function getCategoryMeta(catName) {
    return taskCategories.find(c => c.id === catName) || taskCategories[0];
}

export const muscleCatalog = {
    pecho: { label: 'Pecho', icon: '🏋️' },
    hombros: { label: 'Hombros', icon: '🦾' },
    brazos: { label: 'Brazos', icon: '💪' },
    abdomen: { label: 'Abdomen', icon: '⚡' },
    cuadriceps: { label: 'Cuádriceps', icon: '🦵' },
    espalda: { label: 'Espalda', icon: '🔥' },
    gluteos: { label: 'Glúteos', icon: '🍑' },
    gemelos: { label: 'Gemelos', icon: '👟' }
};

/* AudioContext único desbloqueado en el primer toque (iOS Safari) */
let sharedAudioCtx = null;

export function unlockAudioContext() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        if (!sharedAudioCtx) {
            sharedAudioCtx = new AudioCtx();
        }
        if (sharedAudioCtx.state === 'suspended') {
            sharedAudioCtx.resume();
        }
    } catch (e) {}
}

export function playGentleChime() {
    try {
        unlockAudioContext();
        if (!sharedAudioCtx) return;
        const now = sharedAudioCtx.currentTime;
        [523.25, 659.25, 783.99].forEach((freq, idx) => {
            const osc = sharedAudioCtx.createOscillator();
            const gain = sharedAudioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + idx * 0.14);
            gain.gain.setValueAtTime(0.08, now + idx * 0.14);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.14 + 0.45);
            osc.connect(gain);
            gain.connect(sharedAudioCtx.destination);
            osc.start(now + idx * 0.14);
            osc.stop(now + idx * 0.14 + 0.45);
        });
    } catch (err) {
        console.warn('Audio no disponible:', err);
    }
}

export function compressImageFile(file, maxSize = 800, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
        reader.onload = (e) => {
            const img = new Image();
            img.onerror = () => reject(new Error('Formato de imagen no válido.'));
            img.onload = () => {
                let width = img.width;
                let height = img.height;
                if (width > maxSize || height > maxSize) {
                    if (width > height) {
                        height = Math.round((height * maxSize) / width);
                        width = maxSize;
                    } else {
                        width = Math.round((width * maxSize) / height);
                        height = maxSize;
                    }
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}
