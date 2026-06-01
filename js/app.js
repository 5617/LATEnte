// js/app.js

// Configuración por defecto
const defaultSettings = {
    // Geometría
    pixelColor: '#ffffff',
    baseScale: 2.0,
    stretchX: 1.0,
    stretchY: 1.0,
    swapAxes: false,

    // Grilla
    densityX: 12,
    densityY: 12,
    offsetX: 0.3,
    offsetY: 0,
    inversion: 'normal',

    // Movimiento
    animationMode: 'wave',
    speed: 2.0,
    scaleMin: 0.2,
    scaleMax: 2.5,
    bgColor: '#ffffff',
    bgMode: 'preset',
    moduleColorMode: 'solid',
    gradColors: ['#222222', '#555555', '#888888', '#cccccc'],

    // Audio
    audioIntensity: 1.5,
    audioSmoothing: 0.5,
    frequencyBand: 'full',
    modTargets: { scale: true, stretchX: true, stretchY: true, speed: false },
};



document.addEventListener('DOMContentLoaded', () => {
    const canvasElement = document.getElementById('pattern-canvas');
    const btnExportPNG = document.getElementById('btn-export-png');
    const btnExportMP4 = document.getElementById('btn-export-mp4');
    const exportStatus = document.getElementById('export-status');
    const viewer = document.querySelector('.viewer-container');

    // 1. Inicializar motor
    Engine.init(canvasElement, defaultSettings);

    // 2. Inicializar audio (primero, para que Controls.init() tenga el elemento disponible)
    AudioInput.initAudioElement('assets/audio/track_02_ambiente.mp3');

    // 3. Inicializar controles (después del audio, para attachar listeners al audio element)
    Controls.init();

    // Reanudar AudioContext en el primer click (requerido por navegadores)
    const resumeAudio = () => {
        if (AudioInput.audioContext && AudioInput.audioContext.state === 'suspended') {
            AudioInput.audioContext.resume();
        }
        // Si el audio element está cargado pero no pudo autoplay, reproducir ahora
        if (AudioInput.audioElement && AudioInput.audioElement.paused && AudioInput.audioElement.src) {
            AudioInput._playAudioElement();
        }
        document.removeEventListener('click', resumeAudio);
        document.removeEventListener('touchstart', resumeAudio);
        document.removeEventListener('keydown', resumeAudio);
    };
    document.addEventListener('click', resumeAudio);
    document.addEventListener('touchstart', resumeAudio);
    document.addEventListener('keydown', resumeAudio);

    // 2. Rastrear cursor
    window.addEventListener('mousemove', (e) => {
        Engine.mouse.x = e.clientX;
        Engine.mouse.y = e.clientY;
    });

    // 3. Exportar PNG
    function exportPNG() {
        if (!exportStatus) return;
        exportStatus.textContent = '⏳ Generando PNG...';

        try {
            const svgClone = canvasElement.cloneNode(true);
            svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
            const svgData = new XMLSerializer().serializeToString(svgClone);
            const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(svgBlob);

            const img = new Image();
            img.onload = () => {
                const w = canvasElement.clientWidth || 800;
                const h = canvasElement.clientHeight || 600;
                const exportCanvas = document.createElement('canvas');
                exportCanvas.width = w;
                exportCanvas.height = h;
                const ctx = exportCanvas.getContext('2d');
                // Fondo
                const bgStyle = canvasElement.style.background || Engine.settings.bgColor || '#ffffff';
                // Si es un gradient o imagen usamos el color sólido como fallback
                ctx.fillStyle = bgStyle.startsWith('#') ? bgStyle : (Engine.settings.bgColor || '#ffffff');
                ctx.fillRect(0, 0, w, h);
                ctx.drawImage(img, 0, 0, w, h);
                exportCanvas.toBlob((blob) => {
                    if (!blob) {
                        exportStatus.textContent = '⚠️ Error al generar PNG';
                        return;
                    }
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.download = 'formas-vivas-captura.png';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    exportStatus.textContent = '✅ PNG exportado';
                    setTimeout(() => { exportStatus.textContent = ''; }, 3000);
                }, 'image/png');
            };
            img.onerror = () => {
                exportStatus.textContent = '⚠️ Error al renderizar PNG';
            };
            img.src = url;
        } catch (err) {
            exportStatus.textContent = '⚠️ Error: ' + err.message;
        }
    }

    if (btnExportPNG) {
        btnExportPNG.addEventListener('click', exportPNG);
    }

    // 4. Exportar MP4 (grabar animación)
    let mediaRecorder = null;
    let recordingChunks = [];
    let isRecording = false;
    let renderCanvas = null;
    let renderCtx = null;
    let animFrameId = null;

    function startRecordingMP4() {
        if (!exportStatus) return;

        try {
            const w = viewer.clientWidth || 800;
            const h = viewer.clientHeight || 600;

            renderCanvas = document.createElement('canvas');
            renderCanvas.width = w;
            renderCanvas.height = h;
            renderCtx = renderCanvas.getContext('2d');

            const stream = renderCanvas.captureStream(12);
            mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
            recordingChunks = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) recordingChunks.push(e.data);
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(recordingChunks, { type: 'video/webm' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = 'formas-vivas-animacion.webm';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                isRecording = false;
                if (btnExportMP4) {
                    btnExportMP4.textContent = 'Exportar MP4';
                }
                exportStatus.textContent = '✅ Video exportado (WebM)';
                setTimeout(() => { exportStatus.textContent = ''; }, 3000);
                if (animFrameId) {
                    cancelAnimationFrame(animFrameId);
                    animFrameId = null;
                }
            };

            mediaRecorder.start(100);
            isRecording = true;
            if (btnExportMP4) btnExportMP4.textContent = '⏺ Detener grabación';
            exportStatus.textContent = '⏳ Grabando ~12fps x 10s (clic para detener)...';

            function captureFrame() {
                if (!isRecording || !renderCtx) {
                    if (animFrameId) cancelAnimationFrame(animFrameId);
                    return;
                }

                try {
                    const bgColor = Engine.settings.bgColor || '#ffffff';
                    renderCtx.fillStyle = bgColor;
                    renderCtx.fillRect(0, 0, renderCanvas.width, renderCanvas.height);

                    const svgData = new XMLSerializer().serializeToString(canvasElement);
                    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
                    const url = URL.createObjectURL(svgBlob);

                    const img = new Image();
                    img.onload = () => {
                        renderCtx.drawImage(img, 0, 0, renderCanvas.width, renderCanvas.height);
                        URL.revokeObjectURL(url);
                        if (isRecording) {
                            animFrameId = requestAnimationFrame(captureFrame);
                        }
                    };
                    img.onerror = () => {
                        if (isRecording) {
                            animFrameId = requestAnimationFrame(captureFrame);
                        }
                    };
                    img.src = url;
                } catch (e) {
                    if (isRecording) {
                        animFrameId = requestAnimationFrame(captureFrame);
                    }
                }
            }

            // Empezar a capturar después del primer frame
            setTimeout(() => {
                animFrameId = requestAnimationFrame(captureFrame);
            }, 100);

            // Auto-stop después de 10 segundos
            setTimeout(() => {
                if (isRecording && mediaRecorder && mediaRecorder.state === 'recording') {
                    mediaRecorder.stop();
                }
            }, 10000);

        } catch (err) {
            exportStatus.textContent = '⚠️ Error: ' + err.message;
            isRecording = false;
            if (btnExportMP4) btnExportMP4.textContent = 'Exportar MP4';
        }
    }

    if (btnExportMP4) {
        btnExportMP4.addEventListener('click', () => {
            if (isRecording) {
                // Detener grabación manual
                if (mediaRecorder && mediaRecorder.state === 'recording') {
                    mediaRecorder.stop();
                }
            } else {
                startRecordingMP4();
            }
        });
    }

    // 5. Bucle de animación
    function loop() {
        const band = Engine.settings.frequencyBand || 'full';
        const audioIntensity = AudioInput.getIntensity(band);
        Engine.update(audioIntensity);
        requestAnimationFrame(loop);
    }

    loop();
});
