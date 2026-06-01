// js/controls.js
const Controls = {
    init() {
        this.setupPatternSelect();
        this.setupFileInput();
        this.setupSliders();
        this.setupColorControls();
        this.setupModuleColorMode();
        this.setupBgMode();
        this.setupAccordion();
        this.setupBackgroundImage();
        this.setupBackgroundVideo();
        this.setupBgPresets();
        this.setupAnimationMode();
        this.setupInversion();
        this.setupSwapAxes();
        this.setupAudioPresets();
        this.setupAudioPlaybackControls();
        this.setupAudioControls();
        this.setupModulationTargets();

        // Auto-cargar la forma inicial
        const select = document.getElementById('pattern-select');
        if (select && select.value) {
            this.loadShape(select.value);
            const statusDiv = document.getElementById('file-name');
            if (statusDiv) {
                statusDiv.textContent = select.options[select.selectedIndex].text;
            }
        }
    },

    // ---- 1. GEOMETRÍA ----

    setupPatternSelect() {
        const select = document.getElementById('pattern-select');
        const statusDiv = document.getElementById('file-name');
        const fileInput = document.getElementById('svg-file');
        if (!select) return;

        let prevValue = select.value;

        select.addEventListener('change', (e) => {
            const key = e.target.value;
            if (key === '__upload__') {
                // Disparar file picker y restaurar valor previo
                if (fileInput) fileInput.click();
                select.value = prevValue;
                return;
            }
            prevValue = key;
            const text = e.target.options[e.target.selectedIndex].text;
            if (statusDiv) statusDiv.textContent = text;
            this.loadShape(key);
        });
    },

    loadShape(key) {
        if (SHAPES && SHAPES[key]) {
            Engine.changeModule(SHAPES[key]);
        }
    },

    setupFileInput() {
        const fileInput = document.getElementById('svg-file');
        const statusDiv = document.getElementById('file-name');

        if (!fileInput) return;

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (statusDiv) statusDiv.textContent = '📁 ' + file.name;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const cleanSVG = this.extractSVGContent(event.target.result);
                    Engine.changeModule(cleanSVG);
                } catch (err) {
                    console.error('Error procesando SVG:', err);
                    if (statusDiv) statusDiv.textContent = '⚠️ Error al procesar el SVG';
                }
            };
            reader.readAsText(file);
        });
    },

    // ---- ACORDEÓN ----

    setupAccordion() {
        const headerEl = document.querySelector('.control-panel header');

        const updateHeader = () => {
            const anyOpen = document.querySelectorAll('.control-group .section-content.open').length > 0;
            if (headerEl) {
                headerEl.classList.toggle('compact', anyOpen);
            }
        };

        const closeSection = (section) => {
            const content = section.querySelector('.section-content');
            const arrow = section.querySelector('.accordion-arrow');
            if (content) content.classList.remove('open');
            if (arrow) arrow.classList.remove('open');
        };

        document.querySelectorAll('.accordion-toggle').forEach(toggle => {
            toggle.addEventListener('click', () => {
                const section = toggle.closest('.control-group');
                if (!section) return;
                const content = section.querySelector('.section-content');
                const arrow = toggle.querySelector('.accordion-arrow');
                if (!content) return;

                const isOpen = content.classList.contains('open');
                if (isOpen) {
                    closeSection(section);
                } else {
                    // Cerrar todas las demás secciones
                    document.querySelectorAll('.control-group').forEach(other => {
                        if (other !== section) closeSection(other);
                    });
                    content.classList.add('open');
                    if (arrow) arrow.classList.add('open');
                }

                updateHeader();
            });
        });

        // Estado inicial
        updateHeader();
    },

    // ---- SLIDERS (todos los sliders unificados) ----

    setupSliders() {
        const sliders = [
            // Geometría
            { id: 'param-base-scale', key: 'baseScale', viewId: 'val-base-scale', rebuild: false },

            // Grilla
            { id: 'param-density-x', key: 'densityX', viewId: 'val-density-x', integer: true, rebuild: true },
            { id: 'param-density-y', key: 'densityY', viewId: 'val-density-y', integer: true, rebuild: true },
            { id: 'param-offset-x', key: 'offsetX', viewId: 'val-offset-x', integer: false, rebuild: true },
            { id: 'param-offset-y', key: 'offsetY', viewId: 'val-offset-y', integer: false, rebuild: true },

            // Geometría (continuación)
            { id: 'param-stretch-x', key: 'stretchX', viewId: 'val-stretch-x', integer: false, rebuild: false },
            { id: 'param-stretch-y', key: 'stretchY', viewId: 'val-stretch-y', integer: false, rebuild: false },

            // Movimiento
            { id: 'param-speed', key: 'speed', viewId: 'val-speed', integer: false, rebuild: false },
            { id: 'param-scale-min', key: 'scaleMin', viewId: 'val-scale-min', integer: false, rebuild: false },
            { id: 'param-scale-max', key: 'scaleMax', viewId: 'val-scale-max', integer: false, rebuild: false },

            // Música
            { id: 'param-audio-intensity', key: 'audioIntensity', viewId: 'val-audio-intensity', integer: false, rebuild: false },
            { id: 'param-audio-smoothing', key: 'audioSmoothing', viewId: 'val-audio-smoothing', integer: false, rebuild: false },
        ];

        sliders.forEach(slider => {
            const el = document.getElementById(slider.id);
            const view = document.getElementById(slider.viewId);
            if (!el || !view) return;

            el.addEventListener('input', (e) => {
                let val = parseFloat(e.target.value);
                if (slider.integer) val = parseInt(e.target.value, 10);
                view.textContent = slider.integer ? val : val.toFixed(1);
                Engine.settings[slider.key] = val;

                // Smoothing en el analizador de audio
                if (slider.key === 'audioSmoothing' && AudioInput.analyser) {
                    AudioInput.analyser.smoothingTimeConstant = val;
                }

                if (slider.rebuild) Engine.buildGrid();
            });
        });
    },

    // ---- COLOR CONTROLS ----

    setupColorControls() {
        const bgColor = document.getElementById('param-bg-color');
        const pixelColor = document.getElementById('param-pixel-color');

        if (bgColor) {
            bgColor.addEventListener('input', (e) => {
                Engine.settings.bgColor = e.target.value;
                Engine.settings.bgMode = 'solid';
                const bgSelect = document.getElementById('param-bg-mode');
                if (bgSelect) bgSelect.value = 'solid';
                this.toggleBgMode('solid');
                Engine.applyBg('solid');
                // Limpiar imagen
                const statusDiv = document.getElementById('bg-image-status');
                if (statusDiv) statusDiv.textContent = 'Sin imagen';
                const fileInput = document.getElementById('bg-image-file');
                if (fileInput) fileInput.value = '';
            });
        }

        if (pixelColor) {
            pixelColor.addEventListener('input', (e) => {
                Engine.settings.pixelColor = e.target.value;
            });
        }

        // 4 colores del gradiente (compartidos módulo + fondo)
        const gradColorIds = ['param-grad-color-1', 'param-grad-color-2', 'param-grad-color-3', 'param-grad-color-4'];
        gradColorIds.forEach((id, index) => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', (e) => {
                    Engine.settings.gradColors[index] = e.target.value;
                    // Refrescar fondo si está en modo gradient
                    if (Engine.settings.bgMode === 'gradient') {
                        Engine.applyBg('gradient');
                    }
                });
            }
        });
    },

    // ---- FONDO IMAGEN ----

    setupBackgroundImage() {
        const fileInput = document.getElementById('bg-image-file');
        const statusDiv = document.getElementById('bg-image-status');

        if (!fileInput) return;

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (statusDiv) statusDiv.textContent = '🖼 ' + file.name;

            const reader = new FileReader();
            reader.onload = (event) => {
                Engine.applyBgImage(event.target.result);
            };
            reader.readAsDataURL(file);
        });
    },

    // ---- FONDO VIDEO ----

    setupBackgroundVideo() {
        const fileInput = document.getElementById('bg-video-file');
        const statusDiv = document.getElementById('bg-video-status');

        if (!fileInput) return;

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (statusDiv) statusDiv.textContent = '🎬 ' + file.name;

            const url = URL.createObjectURL(file);
            Engine.applyBgVideo(url);
        });
    },

    // ---- GALERÍA DE FONDOS PRECARGADOS ----

    setupBgPresets() {
        const grid = document.getElementById('preset-grid');
        if (!grid) return;

        const presets = [
            { name: 'Cuadrille', file: 'cuadrille.jpg' },
            { name: 'Diagonales', file: 'diagonales.jpg' },
            { name: 'Karola', file: 'karola.jpg' },
            { name: 'Líneas', file: 'lineas.jpg' },
            { name: 'Luces', file: 'luces.jpg' },
            { name: 'Ondas', file: 'ondas.jpg' },
        ];

        const BASE = 'assets/backgrounds/';

        presets.forEach(p => {
            const btn = document.createElement('div');
            btn.className = 'preset-item';
            btn.textContent = p.name;
            btn.dataset.file = p.file;

            btn.addEventListener('click', () => {
                this.selectPreset(btn, BASE + p.file);
            });

            grid.appendChild(btn);
        });

        // Si bgMode inicial es 'preset', cargar karola por defecto
        if (Engine.settings.bgMode === 'preset') {
            const karolaBtn = grid.querySelector('[data-file="karola.jpg"]');
            if (karolaBtn) {
                this.selectPreset(karolaBtn, BASE + 'karola.jpg');
            }
        }
    },

    selectPreset(btn, path) {
        const grid = document.getElementById('preset-grid');
        if (!grid) return;
        grid.querySelectorAll('.preset-item').forEach(el => el.classList.remove('active'));
        btn.classList.add('active');
        Engine.settings.bgMode = 'preset';
        Engine.applyBgImage(path);
        const statusDiv = document.getElementById('bg-image-status');
        if (statusDiv) statusDiv.textContent = '';
    },

    // ---- MODO COLOR DE MÓDULO (sólido / gradiente) ----

    setupModuleColorMode() {
        const select = document.getElementById('param-module-color-mode');
        const solidDiv = document.getElementById('module-solid-color');

        if (!select) return;

        const toggle = (mode) => {
            Engine.settings.moduleColorMode = mode;
            if (solidDiv) solidDiv.style.display = mode === 'solid' ? 'flex' : 'none';
            this.toggleSharedGradient();
        };

        select.addEventListener('change', (e) => toggle(e.target.value));
        toggle(select.value);
    },

    // ---- MODO COLOR DE FONDO (sólido / gradiente / imagen / video) ----

    setupBgMode() {
        const select = document.getElementById('param-bg-mode');
        if (!select) return;

        select.addEventListener('change', (e) => {
            Engine.settings.bgMode = e.target.value;
            this.toggleBgMode(e.target.value);
            Engine.applyBg(e.target.value);
        });

        this.toggleBgMode(select.value);
    },

    toggleBgMode(mode) {
        const solid = document.getElementById('bg-solid-color');
        const image = document.getElementById('bg-image-upload');
        const video = document.getElementById('bg-video-upload');
        const preset = document.getElementById('bg-preset-gallery');
        if (solid) solid.style.display = mode === 'solid' ? 'flex' : 'none';
        if (image) image.style.display = mode === 'image' ? 'block' : 'none';
        if (video) video.style.display = mode === 'video' ? 'block' : 'none';
        if (preset) preset.style.display = mode === 'preset' ? 'block' : 'none';
        this.toggleSharedGradient();
    },

    toggleSharedGradient() {
        const gradDiv = document.getElementById('shared-gradient-colors');
        if (!gradDiv) return;
        const modMode = Engine.settings.moduleColorMode || 'solid';
        const bgMode = Engine.settings.bgMode || 'solid';
        gradDiv.style.display = (modMode === 'gradient' || bgMode === 'gradient') ? 'block' : 'none';
    },

    // ---- ANIMATION MODE ----

    setupAnimationMode() {
        const modeSelect = document.getElementById('param-animation-mode');
        if (!modeSelect) return;

        modeSelect.addEventListener('change', (e) => {
            Engine.settings.animationMode = e.target.value;
        });
    },

    // ---- INVERSIÓN / MIRROR ----

    setupInversion() {
        const inversionSelect = document.getElementById('param-inversion');
        if (!inversionSelect) return;

        inversionSelect.addEventListener('change', (e) => {
            Engine.settings.inversion = e.target.value;
            Engine.buildGrid();
        });
    },

    // ---- SWAP AXES ----

    setupSwapAxes() {
        const swapAxes = document.getElementById('param-swap-axes');
        if (!swapAxes) return;

        swapAxes.addEventListener('change', (e) => {
            Engine.settings.swapAxes = e.target.checked;
        });
    },

    // ---- AUDIO PRESETS ----

    setupAudioPresets() {
        const grid = document.getElementById('audio-preset-grid');
        if (!grid) return;

        const BASE = 'assets/audio/';

        grid.querySelectorAll('.preset-item').forEach(btn => {
            btn.addEventListener('click', () => {
                grid.querySelectorAll('.preset-item').forEach(el => el.classList.remove('active'));
                btn.classList.add('active');
                const trackFile = btn.dataset.track;
                if (trackFile) {
                    AudioInput.loadPreset(BASE + trackFile);
                }
                const statusDiv = document.getElementById('audio-status');
                if (statusDiv) statusDiv.textContent = '🎵 ' + btn.textContent.trim();
            });
        });

        // Marcar Ambiente como activo por defecto
        const ambiente = grid.querySelector('[data-track="track_02_ambiente.mp3"]');
        if (ambiente && !grid.querySelector('.preset-item.active')) {
            ambiente.classList.add('active');
        }
    },

    // ---- PLAYBACK CONTROLS ----

    setupAudioPlaybackControls() {
        const btnPlay = document.getElementById('btn-play');
        const btnPause = document.getElementById('btn-pause');
        const btnStop = document.getElementById('btn-stop');

        const hasAudioElement = () => {
            return AudioInput.audioElement && AudioInput.audioElement.src && AudioInput.audioElement.src !== '';
        };

        const hasBuffer = () => {
            return AudioInput.audioBuffer != null || hasAudioElement();
        };

        const updateState = () => {
            const ctx = AudioInput.audioContext;
            const isSuspended = ctx && ctx.state === 'suspended';
            const isPlaying = AudioInput.isPlaying;
            const audioAvailable = hasBuffer();

            [btnPlay, btnPause, btnStop].forEach(btn => {
                if (btn) btn.disabled = !audioAvailable;
            });
            if (btnPlay) {
                btnPlay.textContent = isSuspended ? '▶ Reanudar' : '▶ Play';
                btnPlay.disabled = !audioAvailable || (isPlaying && !isSuspended);
            }
            if (btnPause) {
                btnPause.disabled = !audioAvailable || !isPlaying || isSuspended;
            }
            if (btnStop) {
                btnStop.disabled = !audioAvailable || (!isPlaying && !isSuspended);
            }
        };

        // Exponer updateState para que setupAudioControls lo llame al subir archivo
        this._updatePlaybackState = updateState;

        if (btnPlay) {
            btnPlay.addEventListener('click', () => {
                const ctx = AudioInput.audioContext;
                const audioElPresent = hasAudioElement();

                if (ctx && ctx.state === 'suspended') {
                    AudioInput.resume();
                } else if (!AudioInput.audioSource && AudioInput.audioBuffer) {
                    AudioInput.restartPlayback();
                } else if (audioElPresent && !AudioInput.isPlaying) {
                    AudioInput.resume();
                }
                updateState();
            });
        }

        if (btnPause) {
            btnPause.addEventListener('click', () => {
                AudioInput.pause();
                updateState();
            });
        }

        if (btnStop) {
            btnStop.addEventListener('click', () => {
                AudioInput.stop();
                updateState();
            });
        }

        // Escuchar 'canplay' del audio element para habilitar botones
        const audioEl = AudioInput.audioElement;
        if (audioEl) {
            audioEl.addEventListener('canplay', updateState);
            audioEl.addEventListener('play', updateState);
            audioEl.addEventListener('pause', updateState);
        }

        // Escuchar inicio de audio subido por archivo (evento personalizado)
        document.addEventListener('audiostart', this._updatePlaybackState);

        // Estado inicial (con un pequeño delay para dar tiempo a que se monte)
        setTimeout(updateState, 100);
    },

    // ---- AUDIO ----

    setupAudioControls() {
        const audioInput = document.getElementById('audio-file');
        const freqBand = document.getElementById('param-frequency-band');
        const statusDiv = document.getElementById('audio-status');

        if (audioInput) {
            audioInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                if (statusDiv) statusDiv.textContent = file.name;
                AudioInput.loadFile(file);
                // Sincronizar botones de reproducción
                if (this._updatePlaybackState) this._updatePlaybackState();
            });
        }

        if (freqBand) {
            freqBand.addEventListener('change', (e) => {
                Engine.settings.frequencyBand = e.target.value;
            });
        }
    },

    // ---- MODULATION TARGETS ----

    setupModulationTargets() {
        const targets = [
            { id: 'mod-target-scale', key: 'scale' },
            { id: 'mod-target-stretch-x', key: 'stretchX' },
            { id: 'mod-target-stretch-y', key: 'stretchY' },
            { id: 'mod-target-speed', key: 'speed' },
        ];

        targets.forEach(t => {
            const el = document.getElementById(t.id);
            if (!el) return;
            el.addEventListener('change', (e) => {
                Engine.settings.modTargets[t.key] = e.target.checked;
            });
        });
    },

    // ---- SVG EXTRACTION ----

    extractSVGContent(rawSvg) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(rawSvg, 'image/svg+xml');
        const svgElement = doc.querySelector('svg');
        if (!svgElement) return rawSvg;

        const allElements = svgElement.querySelectorAll('path, circle, ellipse, rect, line, polyline, polygon, text, g');
        for (const el of allElements) {
            if (el.hasAttribute('fill') && el.getAttribute('fill').toLowerCase() !== 'none') {
                el.removeAttribute('fill');
            }
            if (el.hasAttribute('stroke') && el.getAttribute('stroke').toLowerCase() !== 'none') {
                el.removeAttribute('stroke');
            }
        }

        const styleBlocks = svgElement.querySelectorAll('style');
        for (const style of styleBlocks) style.remove();

        return svgElement.innerHTML;
    }
};
