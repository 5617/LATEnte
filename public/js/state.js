// js/state.js
// Estado global reactivo — Mapeo 1:1 con la UI del Sintetizador Visual Modular

export const AppState = {
    // ── PASO 1: VIDEO ──
    video: {
        source: null,       // 'gallery' | 'upload'
        galleryIndex: null, // 0, 1, 2
        uploadFile: null,   // File object
        _objectUrl: null    // URL.createObjectURL del video subido (para cleanup)
    },

    // ── PASO 2: SISTEMA (PRESET) ──
    systemPreset: 'matrix', // 'matrix' | 'neural' | 'data-rain' | 'organic' | 'scientific' | 'particle'

    // ── PASO 3: SINTETIZADOR ──
    inputs: {
        brillo:     { sensibilidad: 0.5 },
        movimiento: { sensibilidad: 0.5 },
        color:      { sensibilidad: 0.5 }
    },

    formaActiva: 'numeros',
    modoDistribucion: 'estructurada', // 'estructurada' | 'aleatoria'
    geometriaTipo: 'circulo',         // 'circulo' | 'cuadrado' | 'triangulo' | 'cruz'

    // Parametros compartidos entre todas las formas.
    // Los sliders escriben aqui. Al cambiar de forma se copian a la nueva.
    paramsCompartidos: {
        escala:     { intensidad: 0.5 },
        color:      { hex: '#ffffff' },
        espaciado:  { x: 0.5, y: 0.5 },
        opacidad:   { intensidad: 0.8 }
    },

    formas: {
        numeros: {
            parametros: {
                escala:     { fuente: 'movimiento', intensidad: 0.5 },
                color:      { hex: '#ffffff', fuente: 'color', intensidad: 0.7 },
                espaciado:  { x: 0.5, y: 0.5, fuente: 'movimiento', intensidad: 0.3 },
                opacidad:   { intensidad: 0.8, fuente: 'none' },
                velocidad:  { fuente: 'movimiento', intensidad: 0.5 }
            }
        },
        letras: {
            parametros: {
                escala:     { fuente: 'brillo',     intensidad: 0.5 },
                color:      { hex: '#ffc896', fuente: 'brillo', intensidad: 0.6 },
                espaciado:  { x: 0.3, y: 0.5, fuente: 'brillo', intensidad: 0.3 },
                opacidad:   { intensidad: 0.9, fuente: 'none' },
                velocidad:  { fuente: 'brillo', intensidad: 0.6 }
            }
        },
        geometrias: {
            parametros: {
                escala:     { fuente: 'movimiento', intensidad: 0.6 },
                color:      { hex: '#64b4ff', fuente: 'movimiento', intensidad: 0.7 },
                espaciado:  { x: 0.3, y: 0.3, fuente: 'movimiento', intensidad: 0.4 },
                opacidad:   { intensidad: 1.0, fuente: 'none' },
                velocidad:  { fuente: 'movimiento', intensidad: 0.4 }
            }
        },
        constelaciones: {
            parametros: {
                escala:     { fuente: 'brillo',     intensidad: 0.4 },
                color:      { hex: '#c864ff', fuente: 'color', intensidad: 0.6 },
                espaciado:  { x: 0.7, y: 0.5, fuente: 'brillo', intensidad: 0.5 },
                opacidad:   { intensidad: 0.7, fuente: 'none' },
                velocidad:  { fuente: 'brillo', intensidad: 0.5 }
            }
        }
    },

    // ── TIMELINE (Línea de Tiempo inferior) ──
    timeline: {
        clips: [],       // Array de { id, name, start, duration } en orden secuencial
        isPlaying: false,
        currentClipId: null,
        nextId: 1
    },

    // ── PASO 4: GUARDAR ──
    savedProjects: []  // Array de { name, timestamp, snapshot }
};
