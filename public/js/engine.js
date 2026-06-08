// js/engine.js
// Motor gráfico Canvas2D con análisis de video en tiempo real

import { AppState } from './state.js';

const VIDEO_COLS = 80;
const VIDEO_ROWS = 60;
const CELL_SIZE = 4;
const GRID_COLS = Math.floor(VIDEO_COLS / CELL_SIZE); // 20
const GRID_ROWS = Math.floor(VIDEO_ROWS / CELL_SIZE); // 15

export const Engine = {
    canvas: null,
    ctx: null,
    settings: {},
    mouse: { x: 0, y: 0 },
    time: 0,

    // Video analysis
    offscreen: null,
    offCtx: null,
    prevFrame: null,      // Float32Array(GRID_COLS * GRID_ROWS) — luminancia anterior
    frameData: null,      // ImageData del frame actual (80x60)
    videoData: null,      // { brillo[][], movimiento[][], colorR[][], colorG[][], colorB[][] }
    hasVideo: false,

    // Form state
    _digitCache: null,    // Para Números: matriz de dígitos actuales
    _digitTime: 0,
    _constellationPoints: null, // Para Constelaciones
    _captureErrorLogged: false, // Evita spam de error CORS en consola
    _useSyntheticData: false,   // Fallback para file:// o CORS

    init(canvasElement, currentSettings) {
        this.canvas = canvasElement;
        this.ctx = canvasElement.getContext('2d');
        this.settings = currentSettings;

        // Offscreen canvas para análisis de video
        this.offscreen = document.createElement('canvas');
        this.offscreen.width = VIDEO_COLS;
        this.offscreen.height = VIDEO_ROWS;
        this.offCtx = this.offscreen.getContext('2d', { willReadFrequently: true });

        // Inicializar buffers
        this.prevFrame = new Float32Array(GRID_COLS * GRID_ROWS);
        this.time = Math.random() * 100; // Semilla para ondas sintéticas desde el primer frame
        this._initGrid();

        // Resize handler
        const resize = () => {
            this.canvas.width = this.canvas.clientWidth * devicePixelRatio;
            this.canvas.height = this.canvas.clientHeight * devicePixelRatio;
            this.ctx.scale(devicePixelRatio, devicePixelRatio);
        };
        resize();
        window.addEventListener('resize', resize);
    },

    _initGrid() {
        const cols = GRID_COLS, rows = GRID_ROWS;
        this.videoData = {
            brillo: new Float32Array(cols * rows),
            movimiento: new Float32Array(cols * rows),
            color: new Float32Array(cols * rows),
            colorR: new Float32Array(cols * rows),
            colorG: new Float32Array(cols * rows),
            colorB: new Float32Array(cols * rows),
        };

        // Pre-generar puntos para constelaciones
        this._constellationPoints = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                this._constellationPoints.push({ c, r });
            }
        }
    },

    // ──────────────────────────────────────────────
    //  ANÁLISIS DE VIDEO (80×60 → grilla 20×15)
    //  Si getImageData falla por CORS/seguridad (file://),
    //  genera datos sintéticos (ondas) para que la app
    //  siga siendo reactiva y visible.
    // ──────────────────────────────────────────────

    _captureFrame() {
        const videoEl = document.getElementById('bg-video');
        if (!videoEl || !videoEl.videoWidth || videoEl.paused || videoEl.ended) {
            this.hasVideo = false;
            return;
        }
        this.hasVideo = true;

        try {
            // Dibujar video en offscreen 80×60
            this.offCtx.drawImage(videoEl, 0, 0, VIDEO_COLS, VIDEO_ROWS);
            this.frameData = this.offCtx.getImageData(0, 0, VIDEO_COLS, VIDEO_ROWS);
            this._useSyntheticData = false;
        } catch (e) {
            // Error CORS/seguridad (file://) → usar datos sintéticos
            if (!this._captureErrorLogged) {
                console.info('ℹ Video analysis blocked by browser security (CORS). Using synthetic wave data instead. Open via HTTP server for real video reactivity.');
                this._captureErrorLogged = true;
            }
            this._useSyntheticData = true;
            this._generateSyntheticFrame();
            return;
        }

        const data = this.frameData.data;
        const cols = GRID_COLS, rows = GRID_ROWS;
        const b = this.videoData.brillo;
        const m = this.videoData.movimiento;
        const cR = this.videoData.colorR;
        const cG = this.videoData.colorG;
        const cB = this.videoData.colorB;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const idx = r * cols + c;
                // Sample center of each cell (CELL_SIZE×CELL_SIZE block)
                const px = c * CELL_SIZE + Math.floor(CELL_SIZE / 2);
                const py = r * CELL_SIZE + Math.floor(CELL_SIZE / 2);
                const srcIdx = (py * VIDEO_COLS + px) * 4;
                const R = data[srcIdx];
                const G = data[srcIdx + 1];
                const B = data[srcIdx + 2];

                // Brillo: promedio RGB normalizado
                const lum = (R + G + B) / 765; // 765 = 255*3
                b[idx] = lum;

                // Colorfulness: qué tan saturado/distinto del gris (0=gris, 1=máxima saturación)
                const maxC = Math.max(R, G, B);
                const minC = Math.min(R, G, B);
                const colSat = maxC === 0 ? 0 : (maxC - minC) / maxC;
                this.videoData.color[idx] = colSat;

                // Color: RGB dominante normalizado
                cR[idx] = R / 255;
                cG[idx] = G / 255;
                cB[idx] = B / 255;

                // Movimiento: frame-differencing con alta sensibilidad
                const diff = Math.abs(lum - this.prevFrame[idx]);
                const rawMov = Math.min(1, diff * 30);
                m[idx] = m[idx] * 0.3 + rawMov * 0.7;
                this.prevFrame[idx] = lum;
            }
        }
    },

    // ── DATOS SINTÉTICOS (fallback cuando CORS bloquea getImageData) ──
    //   Genera ondas viajeras que imitan brillo + movimiento real,
    //   perfecto para probar la app sin servidor HTTP.

    _generateSyntheticFrame() {
        const cols = GRID_COLS, rows = GRID_ROWS;
        const b = this.videoData.brillo;
        const m = this.videoData.movimiento;
        const cR = this.videoData.colorR;
        const cG = this.videoData.colorG;
        const cB = this.videoData.colorB;
        const t = this.time * 0.04;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const idx = r * cols + c;
                const nx = c / cols;
                const ny = r / rows;

                // Onda senoidal viajera: brillo (0.1 ~ 0.9)
                const wave1 = Math.sin(nx * 6 + t) * 0.5 + 0.5;
                const wave2 = Math.cos(ny * 5 + t * 0.7) * 0.5 + 0.5;
                const wave3 = Math.sin((nx + ny) * 4 + t * 1.3) * 0.4 + 0.5;
                const lum = 0.1 + 0.8 * (wave1 * 0.4 + wave2 * 0.4 + wave3 * 0.2);
                b[idx] = Math.min(0.95, lum);

                // Colorfulness (saturación): ondas en fase opuesta
                this.videoData.color[idx] = 0.3 + 0.7 * (1 - Math.abs(wave1 - wave2));

                // Color RGB: gradiente cromático que viaja
                const hue = (nx * 2 + ny + t * 0.1) % 1;
                cR[idx] = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(hue * Math.PI * 2));
                cG[idx] = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin((hue + 0.33) * Math.PI * 2));
                cB[idx] = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin((hue + 0.67) * Math.PI * 2));

                // Movimiento: diferencia con frame anterior (simulado)
                const diff = Math.abs(lum - this.prevFrame[idx]);
                const rawMov = Math.min(1, diff * 40);
                m[idx] = m[idx] * 0.3 + rawMov * 0.7;
                this.prevFrame[idx] = lum;
            }
        }
    },

    // ──────────────────────────────────────────────
    //  MODULACIÓN POR PARÁMETRO (según especificación)
    //  Cada parámetro tiene reacciones distintas según su fuente
    // ──────────────────────────────────────────────

    // ── FUNCIÓN UNIFICADA DE RUTEO ──
    //   Determina qué FUENTE (none / brillo / movimiento / color) tiene
    //   asignada una propiedad en la UI para la forma activa y retorna
    //   la señal modulada correspondiente (0…1).
    //
    //   - 'none':           devuelve el valor estático del slider (intensidad)
    //   - 'brillo'/'movimiento'/'color': multiplica la señal cruda del video
    //     por la intensidad del slider, sensibilidad global mediante.
    //
    //   Centralizar el ruteo aquí permite añadir nuevas propiedades
    //   (rotación, distorsión, etc.) sin escribir nueva lógica de fuente.

    obtenerValorModulado(propiedad, idx) {
        const formaParams = AppState.formas[AppState.formaActiva]?.parametros;
        if (!formaParams) return 0.5;

        const p = formaParams[propiedad];
        if (!p) return 0.5;

        // Ninguno → valor estático del slider
        if (p.fuente === 'none' || !this.hasVideo) return p.intensidad;

        // Señal cruda desde el video
        const raw = this._getSignalValue(p.fuente, idx);

        // Sensibilidad global del input
        const sen = AppState.inputs[p.fuente]?.sensibilidad ?? 0.5;

        // Señal amplificada con corte suave
        return Math.min(1, raw * Math.max(0.2, sen * 2.5));
    },

    // Helper: valor raw de la fuente en una celda
    _getSignalValue(fuente, idx) {
        if (fuente === 'none' || !this.hasVideo) return 0.5;
        return this.videoData[fuente]?.[idx] ?? 0.5;
    },

    // ── ESCALA: tamaño físico de la forma ──
    //   Ninguno → fijo por slider
    //   Brillo   → crece en luz, se encoge en sombra
    //   Movimiento → grande solo donde hay acción
    //   Color    → varía por saturación cromática
    _modularEscala(idx, formaParams) {
        const p = formaParams?.escala;
        if (!p) return 0.5;
        const inten = p.intensidad;
        if (p.fuente === 'none' || !this.hasVideo) return 0.15 + 0.85 * inten;
        const signal = this.obtenerValorModulado('escala', idx);
        // Mapeo agresivo: señal baja → ~0.05 (casi invisible), señal alta → 1.0 (máximo)
        // Usar pow con exp < 1 estira los valores bajos para más sensibilidad
        const aggressive = Math.pow(signal, 0.5) * inten + 0.3 * (1 - inten);
        // Escala final: rango 0.05 ~ 1.0 con énfasis dramático
        return 0.05 + 0.95 * aggressive;
    },

    // ── VELOCIDAD: ritmo de mutación/parpadeo ──
    //   Ninguno → constante uniforme
    //   Brillo   → frenética en luces, congelada en oscuro
    //   Movimiento → aceleración solo donde hay desplazamiento
    //   Color    → calibrada por cambios cromáticos
    _modularVelocidad(idx, formaParams) {
        const p = formaParams?.velocidad;
        if (!p || p.fuente === 'none' || !this.hasVideo) return 0.2;
        const signal = this.obtenerValorModulado('velocidad', idx);
        return Math.min(1, signal * (0.3 + 0.7 * (p.intensidad ?? 0.5)) * 1.8);
    },

    // ── COLOR: Paleta Monocromática Dinámica ──
    //   Genera una paleta monocromática en tiempo real a partir del
    //   color base seleccionado por el usuario, modulada por el brillo
    //   del video en cada celda:
    //     Píxel brillante → Tonalidad clara/saturada
    //     Píxel medio     → Tonalidad base
    //     Píxel oscuro    → Tonalidad oscura
    //   Aplica universalmente a todos los modos gráficos.

    _hexToHsl(hex) {
        const rgb = this._hexToRgb(hex);
        const r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h = 0, s = 0, l = (max + min) / 2;
        if (max !== min) {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
            else if (max === g) h = ((b - r) / d + 2) / 6;
            else h = ((r - g) / d + 4) / 6;
        }
        return { h, s, l };
    },

    _hslToRgb(h, s, l) {
        let r, g, b;
        if (s === 0) {
            r = g = b = l;
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }
        return {
            r: Math.round(r * 255),
            g: Math.round(g * 255),
            b: Math.round(b * 255),
        };
    },

    _modularColor(idx, formaParams) {
        const p = formaParams?.color;
        if (!p) return { r: 255, g: 255, b: 255 };

        const hex = p.hex || '#ffffff';
        const inten = p.intensidad ?? 0.5;
        const hsl = this._hexToHsl(hex);

        // Obtener señal de brillo (0…1) para modular el color
        let brightnessSignal;
        if (this.hasVideo && p.fuente !== 'none') {
            // Usar el brillo del video en esta celda
            brightnessSignal = this.videoData.brillo?.[idx] ?? 0.5;
        } else {
            // Sin video: generar variación sutil por posición (onda suave)
            const cols = GRID_COLS, rows = GRID_ROWS;
            const r = Math.floor(idx / cols);
            const c = idx % cols;
            const t = this.time * 0.02;
            brightnessSignal = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(c * 0.3 + r * 0.5 + t));
        }

        // Mapear brillo a luminosidad HSL (monocromática)
        //   brillo 0.0 → l = 0.10 (muy oscuro)
        //   brillo 0.5 → l = hsl.l (base)
        //   brillo 1.0 → l = 0.90 (muy claro)
        const lMin = 0.08;
        const lMax = 0.92;
        const lBase = hsl.l;
        let l;
        if (brightnessSignal < 0.5) {
            // Oscuro: interpolar entre lMin y lBase
            const u = brightnessSignal * 2; // 0→1
            l = lMin + (lBase - lMin) * u;
        } else {
            // Claro: interpolar entre lBase y lMax
            const u = (brightnessSignal - 0.5) * 2; // 0→1
            l = lBase + (lMax - lBase) * u;
        }

        // Saturación: más saturado en medios tonos, ligeramente dessaturado en extremos
        const satBoost = 1 - 0.3 * Math.abs(brightnessSignal - 0.5) * 2;
        const s = Math.min(1, hsl.s * (0.7 + 0.3 * satBoost) * (0.8 + 0.2 * inten));

        return this._hslToRgb(hsl.h, s, Math.max(0.05, Math.min(0.95, l)));
    },

    // ── OPACIDAD: canal alfa de la forma ──
    //   Ninguno → fija por slider
    //   Brillo   → opaca en luz, fantasma en sombra
    //   Movimiento → sólida donde hay movimiento, transparente donde quieto
    //   Color    → graduada por intensidad del tono
    _modularOpacidad(idx, formaParams) {
        const p = formaParams?.opacidad;
        if (!p || p.fuente === 'none' || !this.hasVideo) {
            return Math.min(1, Math.max(0.05, p?.intensidad ?? 1.0));
        }
        const signal = this.obtenerValorModulado('opacidad', idx);
        const inten = p.intensidad ?? 0.5;
        // Opacidad reactiva: señal 0 → ~0.05 (casi invisible), señal 1 → 1.0 (sólido)
        const op = signal * inten + 0.3 * (1 - inten);
        return Math.min(1, Math.max(0.05, op));
    },

    // ── ESPACIADO: peso por celda (threshold de densidad) ──
    //   Retorna 0 (celda oculta) o 1 (celda visible).
    //   Ninguno → 1 (todo visible, grilla uniforme)
    //   Brillo   → compacto en luz, disperso en sombra
    //   Movimiento → denso donde hay acción, disperso donde quieto
    //   Color    → distribuido por bloques cromáticos
    _getEspaciadoWeight(idx, formaParams) {
        const p = formaParams?.espaciado;
        if (!p || p.fuente === 'none' || !this.hasVideo) return 1;
        const signal = this.obtenerValorModulado('espaciado', idx);
        const inten = p.intensidad ?? 0.5;
        // Transición brusca: con intensidad alta, el umbral es más permisivo
        const threshold = 0.15 + (1 - inten) * 0.3;
        if (signal < threshold) return 0;
        return Math.min(1, 0.5 + 0.5 * (signal - threshold) / (1 - threshold));
    },

    // ── COLOR: parsea hex de la UI a RGB ──
    _hexToRgb(hex) {
        const h = hex?.replace('#', '') ?? 'ffffff';
        return {
            r: parseInt(h.substring(0, 2), 16) || 255,
            g: parseInt(h.substring(2, 4), 16) || 255,
            b: parseInt(h.substring(4, 6), 16) || 255,
        };
    },

    // ── ESPACIADO: grilla dinámica (columnas × filas) ──
    //   Los sliders ESP. X e Y (0-1) controlan la densidad de la grilla.
    //   0 = muy densa (~40 cols), 1 = muy dispersa (~4 cols).
    _getRenderGrid(formaParams) {
        const p = formaParams?.espaciado ?? { x: 0.5, y: 0.5 };
        const cols = 4 + Math.round(36 * (1 - (p.x ?? 0.5)));  // 4 ~ 40
        const rows = 3 + Math.round(27 * (1 - (p.y ?? 0.5)));  // 3 ~ 30
        return { cols, rows };
    },

    // Mapea una celda de la grilla de render (cr, rr) al índice del video data
    // Usa la posición BASE de la celda (sin jitter) para mantener el análisis
    // de píxel alineado independientemente del modo de distribución.
    _videoIdx(cr, rr, renderCols, renderRows) {
        const vc = Math.floor(cr * GRID_COLS / renderCols);
        const vr = Math.floor(rr * GRID_ROWS / renderRows);
        return Math.min(vr * GRID_COLS + vc, GRID_COLS * GRID_ROWS - 1);
    },

    // ── JITTER: desplazamiento de desalineación ──
    //   En modo 'aleatoria', añade un offset pseudo-aleatorio a la posición
    //   de cada elemento para dispersión orgánica (basado en el tamaño de celda).
    //   En modo 'estructurada', devuelve 0 (grilla perfecta).
    _aplicarJitter(cellSize) {
        if (AppState.modoDistribucion === 'aleatoria') {
            return (Math.random() - 0.5) * cellSize * 0.8;
        }
        return 0;
    },

    // ──────────────────────────────────────────────
    //  UPDATE PRINCIPAL (llamado cada frame)
    // ──────────────────────────────────────────────

    update() {
        const ctx = this.ctx;
        const W = this.canvas.clientWidth;
        const H = this.canvas.clientHeight;

        // Capturar y analizar frame de video
        // _captureFrame maneja internamente el error CORS y genera datos sintéticos
        try {
            this._captureFrame();
        } catch (e) {
            // Error inesperado (no CORS): desactivar video silenciosamente
            this.hasVideo = false;
        }

        const forma = AppState.formaActiva;
        const formaParams = AppState.formas[forma]?.parametros;
        if (!formaParams) return;

        // Escalar el tiempo con velocidad modulada (celda central como referencia)
        const centerIdx = Math.floor(GRID_COLS * GRID_ROWS / 2);
        const velMod = this._modularVelocidad(centerIdx, formaParams);
        this.time += 0.016 * this.settings.speed * (0.3 + 1.7 * velMod);

        // Fondo transparente: el <video> detrás del canvas se ve a través
        ctx.clearRect(0, 0, W, H);

        // Renderizar formas sobre el video (con transparencia/mezcla)
        switch (forma) {
            case 'numeros':    this._renderNumeros(W, H, formaParams); break;
            case 'letras':     this._renderNumeros(W, H, formaParams, true); break;
            case 'geometrias': this._renderGeometrias(W, H, formaParams); break;
            case 'constelaciones': this._renderConstelaciones(W, H, formaParams); break;
        }
    },

    // ──────────────────────────────────────────────
    //  RENDER: NÚMEROS (y LETRAS)
    // ──────────────────────────────────────────────

    _renderNumeros(W, H, formaParams, isLetras) {
        const ctx = this.ctx;
        const grid = this._getRenderGrid(formaParams);
        const cols = grid.cols, rows = grid.rows;
        const cellW = W / cols;
        const cellH = H / rows;
        const totalCells = cols * rows;
        const chars = isLetras
            ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmn'
            : '0123456789';

        // Inicializar/actualizar caché de caracteres si cambia el tamaño de grilla
        if (!this._digitCache || this._digitCache.isLetras !== isLetras || this._digitCache.totalCells !== totalCells) {
            this._digitCache = {
                isLetras,
                totalCells,
                chars: new Uint8Array(totalCells),
                time: new Float32Array(totalCells),
            };
            for (let i = 0; i < totalCells; i++) {
                this._digitCache.chars[i] = Math.floor(Math.random() * chars.length);
                this._digitCache.time[i] = Math.random() * 100;
            }
        }

        const cache = this._digitCache;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const cellIdx = r * cols + c;
                const vidx = this._videoIdx(c, r, cols, rows);

                // ── ESPACIADO (densidad per-cell) ──
                const espWeight = this._getEspaciadoWeight(vidx, formaParams);
                if (espWeight < 0.3) continue;

                // ── VELOCIDAD per-cell: mutación reactiva al video ──
                const cellSpeedFactor = this._modularVelocidad(vidx, formaParams);
                const localSpeed = 0.005 + cellSpeedFactor * 0.10;
                cache.time[cellIdx] += localSpeed;

                // Cambiar caracter cuando el acumulador supera 1
                if (cache.time[cellIdx] > 1) {
                    cache.time[cellIdx] = 0;
                    cache.chars[cellIdx] = (cache.chars[cellIdx] + 1) % chars.length;
                    if (Math.random() < 0.05 + cellSpeedFactor * 0.4) {
                        cache.chars[cellIdx] = Math.floor(Math.random() * chars.length);
                    }
                }

                // ── OPACIDAD per-cell ──
                const opacidad = this._modularOpacidad(vidx, formaParams);

                // ── COLOR per-cell reactivo al video ──
                const col = this._modularColor(vidx, formaParams);
                const fillColor = `rgba(${col.r},${col.g},${col.b},${Math.max(0.08, opacidad)})`;

                // ── ESCALA per-cell ──
                const escala = this._modularEscala(vidx, formaParams);
                const fontSize = Math.max(6, Math.min(cellW, cellH) * 0.55 * (0.05 + 0.95 * escala));

                // ── POSICIÓN con jitter ──
                const jitterX = this._aplicarJitter(cellW);
                const jitterY = this._aplicarJitter(cellH);
                const x = c * cellW + cellW / 2 + jitterX;
                const y = r * cellH + cellH / 2 + jitterY;

                ctx.font = `bold ${fontSize}px "Roboto Slab", serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = fillColor;
                ctx.fillText(chars[cache.chars[cellIdx]], x, y);
            }
        }
    },

    // ──────────────────────────────────────────────
    //  RENDER: GEOMETRÍAS (círculos modulados)
    // ──────────────────────────────────────────────

    _renderGeometrias(W, H, formaParams) {
        const ctx = this.ctx;
        const grid = this._getRenderGrid(formaParams);
        const cols = grid.cols, rows = grid.rows;
        const cellW = W / cols;
        const cellH = H / rows;
        const tipo = AppState.geometriaTipo || 'circulo';

        // Tamano exactamente igual al de numeros/letras (5%-100% de la celda)
        // Usa el mismo multiplicador 0.55 que _renderNumeros para consistencia visual
        const getSize = (escala) => Math.min(cellW, cellH) * 0.15 * (0.05 + 0.95 * escala);
        // Lado para cuadrado, base para triangulo, brazo para cruz
        const getHalfSize = (escala) => getSize(escala) * 0.5;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const vidx = this._videoIdx(c, r, cols, rows);

                // ── ESPACIADO (densidad per-cell) ──
                const espWeight = this._getEspaciadoWeight(vidx, formaParams);
                if (espWeight < 0.3) continue;

                // ── POSICIÓN con jitter ──
                const jitterX = this._aplicarJitter(cellW);
                const jitterY = this._aplicarJitter(cellH);
                const x = c * cellW + cellW / 2 + jitterX;
                const y = r * cellH + cellH / 2 + jitterY;

                // ── ESCALA per-cell (compartida con las otras formas) ──
                const escala = this._modularEscala(vidx, formaParams);
                const size = getSize(escala);
                const half = getHalfSize(escala);

                // ── COLOR per-cell reactivo ──
                const col = this._modularColor(vidx, formaParams);

                // ── OPACIDAD per-cell reactiva ──
                const alpha = Math.max(0.05, this._modularOpacidad(vidx, formaParams));

                ctx.fillStyle = `rgba(${col.r},${col.g},${col.b},${alpha})`;

                switch (tipo) {
                    case 'circulo':
                        ctx.beginPath();
                        ctx.arc(x, y, size, 0, Math.PI * 2);
                        ctx.fill();
                        break;

                    case 'cuadrado':
                        ctx.fillRect(x - half, y - half, size, size);
                        break;

                    case 'triangulo':
                        ctx.beginPath();
                        ctx.moveTo(x, y - size);
                        ctx.lineTo(x - size, y + size);
                        ctx.lineTo(x + size, y + size);
                        ctx.closePath();
                        ctx.fill();
                        break;

                    case 'cruz':
                        const ancho = Math.max(1, size * 0.25);
                        const largo = size;
                        // Brazo vertical
                        ctx.fillRect(x - ancho, y - largo, ancho * 2, largo * 2);
                        // Brazo horizontal
                        ctx.fillRect(x - largo, y - ancho, largo * 2, ancho * 2);
                        break;
                }

                // Anillo exterior de movimiento (solo círculo, si hay señal en el video)
                if (tipo === 'circulo' && this.hasVideo) {
                    const rawMotion = this.videoData.movimiento[vidx];
                    if (rawMotion > 0.15) {
                        ctx.strokeStyle = `rgba(${col.r},${col.g},${col.b},${rawMotion * 0.4 * alpha})`;
                        ctx.lineWidth = 0.5;
                        ctx.beginPath();
                        ctx.arc(x, y, size * (1 + rawMotion), 0, Math.PI * 2);
                        ctx.stroke();
                    }
                }
            }
        }
    },

    // ──────────────────────────────────────────────
    //  RENDER: CONSTELACIONES
    // ──────────────────────────────────────────────

    _renderConstelaciones(W, H, formaParams) {
        const ctx = this.ctx;
        const grid = this._getRenderGrid(formaParams);
        const cols = grid.cols, rows = grid.rows;
        const cellW = W / cols;
        const cellH = H / rows;

        // Recolectar puntos activos (con filtro de espaciado)
        const activePoints = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const vidx = this._videoIdx(c, r, cols, rows);

                // ── ESPACIADO (densidad per-cell) ──
                const espWeight = this._getEspaciadoWeight(vidx, formaParams);
                if (espWeight < 0.35) continue;

                // ── POSICIÓN con jitter ──
                const jitterX = this._aplicarJitter(cellW);
                const jitterY = this._aplicarJitter(cellH);
                const x = c * cellW + cellW / 2 + jitterX;
                const y = r * cellH + cellH / 2 + jitterY;

                // ── ESCALA per-cell (radio del punto) ──
                const escala = this._modularEscala(vidx, formaParams);
                const radius = Math.max(1, 1.5 + escala * 4);

                // ── OPACIDAD per-cell reactiva ──
                const opacidad = this._modularOpacidad(vidx, formaParams);

                // ── COLOR per-cell reactivo ──
                const col = this._modularColor(vidx, formaParams);

                activePoints.push({
                    x, y,
                    radius,
                    alpha: Math.min(1, opacidad),
                    color: `rgb(${col.r},${col.g},${col.b})`
                });
            }
        }

        // Dibujar líneas entre puntos cercanos
        if (activePoints.length > 1) {
            const points = activePoints.slice(0, 250);
            const maxDist = Math.max(cellW, cellH) * 1.8;

            for (let i = 0; i < points.length; i++) {
                for (let j = i + 1; j < points.length; j++) {
                    const dx = points[i].x - points[j].x;
                    const dy = points[i].y - points[j].y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < maxDist) {
                        const lineAlpha = Math.min(points[i].alpha, points[j].alpha) * (1 - dist / maxDist) * 0.5;
                        if (lineAlpha > 0.02) {
                            ctx.strokeStyle = `rgba(255,255,255,${lineAlpha})`;
                            ctx.lineWidth = 0.5;
                            ctx.beginPath();
                            ctx.moveTo(points[i].x, points[i].y);
                            ctx.lineTo(points[j].x, points[j].y);
                            ctx.stroke();
                        }
                    }
                }
            }
        }

        // Dibujar puntos
        for (const p of activePoints) {
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.alpha;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    },

    // ──────────────────────────────────────────────
    //  MÉTODOS PÚBLICOS (compatibilidad con controles)
    // ──────────────────────────────────────────────

    applyBg(mode) {
        // El fondo se maneja en el update con fillRect
        if (mode === 'solid') {
            this.settings.bgMode = 'solid';
        } else if (mode === 'video') {
            this.settings.bgMode = 'video';
        }
    },

    applyBgVideo(url) {
        const videoEl = document.getElementById('bg-video');
        if (!videoEl) return;

        // Limpiar estado anterior
        this.hasVideo = false;
        this._captureErrorLogged = false;
        this._useSyntheticData = false;

        // Configurar atributos para máxima compatibilidad y rendimiento
        videoEl.muted = true;
        videoEl.loop = true;
        videoEl.playsInline = true;
        videoEl.setAttribute('crossOrigin', 'anonymous');
        videoEl.setAttribute('playsinline', '');
        videoEl.src = url;
        videoEl.style.display = 'block';
        videoEl.load();

        // Detectar dimensiones del video (el CSS ya maneja object-fit: cover)
        videoEl.addEventListener('loadedmetadata', () => {
            const vw = videoEl.videoWidth;
            const vh = videoEl.videoHeight;
            if (vw && vh) {
                console.log('Video dimensions:', vw + 'x' + vh);
            }
        }, { once: true });

        const playPromise = videoEl.play();
        if (playPromise) {
            playPromise.catch(() => {
                // Autoplay bloqueado por politica del navegador
                console.info('Autoplay bloqueado. El usuario debe interactuar primero.');
            });
        }

        this.settings.bgMode = 'video';
    },

    applyBgImage(dataUrl) {
        this.settings.bgImage = dataUrl;
    }
};
