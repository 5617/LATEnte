// js/app.js

import { AppState } from './state.js';
import { Engine } from './engine.js';
import { Controls } from './controls.js';

// Configuración por defecto (mantenida para compatibilidad)
const defaultSettings = {
    pixelColor: '#ffffff',
    baseScale: 2.0,
    stretchX: 1.0,
    stretchY: 1.0,
    swapAxes: false,
    densityX: 12,
    densityY: 12,
    offsetX: 0.3,
    offsetY: 0,
    inversion: 'normal',
    animationMode: 'wave',
    speed: 2.0,
    scaleMin: 0.2,
    scaleMax: 2.5,
    bgColor: '#0a0a0a',
    bgMode: 'preset',
    moduleColorMode: 'solid',
    gradColors: ['#222222', '#555555', '#888888', '#cccccc'],
};

console.log('🧬 AppState inicializado:', AppState);

document.addEventListener('DOMContentLoaded', () => {
    const canvasElement = document.getElementById('pattern-canvas');

    // 1. Inicializar motor Canvas2D
    Engine.init(canvasElement, defaultSettings);

    // 2. Inicializar controles
    Controls.init();

    // 3. Rastrear cursor para efectos
    window.addEventListener('mousemove', (e) => {
        Engine.mouse.x = e.clientX;
        Engine.mouse.y = e.clientY;
    });

    // 4. Bucle de animación a 60fps
    function loop() {
        Engine.update();
        requestAnimationFrame(loop);
    }

    loop();
});
