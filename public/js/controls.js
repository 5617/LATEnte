// js/controls.js
import { AppState } from './state.js';
import { Engine } from './engine.js';

export const Controls = {
    _previewTimeout: null,
    _onVideoEndHandler: null,

    init() {
        this.setupAccordion();
        this.setupVideoStep();
        this.setupDragDrop();
        this.setupSystemPresets();
        this.setupInputs();
        this.setupFormas();
        this.setupParametros();
        this.setupDistribucion();
        this.setupGeometriaTipo();
        this.setupSave();
        this.setupExport();
        this.setupTimeline();
        this.setupTimelineHandle();
        this.setupWelcomeScreen();

        // Cargar presets guardados
        this._loadSavedPresets();

        // Generar miniaturas de los videos (defer para que el DOM esté listo)
        setTimeout(() => this._generateThumbnails(), 100);

        // Panel toggle
        this.setupPanelToggle();
    },

    // ──────────────────────────────────────────────
    //  ACORDEÓN (colapsable entre pasos)
    // ──────────────────────────────────────────────

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
                    document.querySelectorAll('.control-group').forEach(other => {
                        if (other !== section) closeSection(other);
                    });
                    content.classList.add('open');
                    if (arrow) arrow.classList.add('open');
                }

                updateHeader();
            });
        });

        updateHeader();
    },

    // ──────────────────────────────────────────────
    //  PASO 1: VIDEO (con Drag & DragDrop nativo)
    // ──────────────────────────────────────────────

    setupVideoStep() {
        const gallery = document.getElementById('video-gallery-grid');
        if (gallery) {
            gallery.querySelectorAll('.video-thumb').forEach((item, index) => {
                // Click para seleccionar y reproducir
                item.addEventListener('click', (e) => {
                    if (e.target.closest('.video-thumb')) {
                        gallery.querySelectorAll('.video-thumb').forEach(el => el.classList.remove('active'));
                        item.classList.add('active');
                        AppState.video.source = 'gallery';
                        AppState.video.galleryIndex = index;
                        AppState.video.uploadFile = null;

                        const videoUrl = item.dataset.clipSrc;
                        Engine.applyBgVideo(videoUrl);
                        this._applyVideoFilters();
                        console.log(`📽 Video de galería seleccionado: ${item.dataset.video}`);
                    }
                });
            });
        }

        // Botón Subir MP4: conectar al input file oculto
        const uploadLabel = document.querySelector('.btn-upload');
        const uploadInput = document.getElementById('upload-video-file');
        const statusDiv = document.getElementById('video-upload-status');

        if (uploadLabel && uploadInput) {
            // Click en el label dispara el file picker
            uploadLabel.addEventListener('click', (e) => {
                e.preventDefault();
                uploadInput.click();
            });

            uploadInput.setAttribute('accept', 'video/mp4, video/quicktime');

            uploadInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;

                // Limpiar selección de galería
                if (gallery) {
                    gallery.querySelectorAll('.video-thumb').forEach(el => el.classList.remove('active'));
                }

                // Limpiar estado anterior de video subido
                if (AppState.video.uploadFile && AppState.video._objectUrl) {
                    URL.revokeObjectURL(AppState.video._objectUrl);
                }

                AppState.video.source = 'upload';
                AppState.video.uploadFile = file;
                AppState.video.galleryIndex = null;

                if (statusDiv) statusDiv.textContent = '🎬 ' + file.name;

                // Crear URL temporal local ultra rápida
                const url = URL.createObjectURL(file);
                AppState.video._objectUrl = url;

                // Inyectar en el motor
                Engine.applyBgVideo(url);
                this._applyVideoFilters();

                console.log('Video subido:', file.name, '(' + (file.size / 1024 / 1024).toFixed(1) + ' MB)');
            });
        }
    },

    // ──────────────────────────────────────────────
    //  GENERAR MINIATURAS desde el primer frame del video
    // ──────────────────────────────────────────────

    _generateThumbnails() {
        const thumbs = document.querySelectorAll('.video-thumb');
        if (!thumbs.length) return;

        thumbs.forEach(thumb => {
            const src = thumb.dataset.clipSrc;
            if (!src) return;

            const video = document.createElement('video');
            video.muted = true;
            video.preload = 'metadata';
            video.crossOrigin = 'anonymous';
            video.src = src;

            // Mostrar estado de carga
            thumb.classList.add('loading');

            // Cuando los metadatos están listos, buscar un frame y capturarlo
            video.addEventListener('loadeddata', () => {
                video.currentTime = 0.3; // buscar un frame temprano
            });

            video.addEventListener('seeked', () => {
                const canvas = document.createElement('canvas');
                canvas.width = 180;
                canvas.height = 120;
                const ctx = canvas.getContext('2d');
                try {
                    ctx.drawImage(video, 0, 0, 180, 120);
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                    thumb.style.backgroundImage = `url(${dataUrl})`;
                } catch (e) {
                    // fallback: dejar el color de fondo
                }
                thumb.classList.remove('loading');
                video.remove();
            });

            // Timeout por si el video no carga
            video.addEventListener('error', () => {
                thumb.classList.remove('loading');
                video.remove();
            });

            video.load();
        });
    },

    // ──────────────────────────────────────────────
    //  DRAG & DROP NATIVO (Paso 1 ⟶ Línea de Tiempo)
    // ──────────────────────────────────────────────

    setupDragDrop() {
        const track = document.getElementById('timeline-track');
        const timeline = document.getElementById('timeline-container');
        if (!track || !timeline) return;

        // ── Helper para abrir la timeline al arrastrar ──
        const showTimeline = () => {
            if (timeline.classList.contains('timeline-closed')) {
                this._openTimeline();
            }
        };

        // ── Helper para limpiar estado expandido ──
        const collapseSequencer = () => {
            timeline.classList.remove('sequencer-expanded');
            track.classList.remove('drag-over');
            document.querySelectorAll('#video-gallery-grid .video-thumb.dragging').forEach(el => {
                el.classList.remove('dragging');
            });
        };

        // ── Drag start en los items de la galería ──
        document.querySelectorAll('#video-gallery-grid .video-thumb[draggable]').forEach(item => {
            item.addEventListener('dragstart', (e) => {
                const clipName = item.dataset.clipName || item.textContent.trim();
                const clipSrc = item.dataset.clipSrc;
                e.dataTransfer.setData('text/plain', JSON.stringify({
                    source: 'gallery',
                    name: clipName,
                    src: clipSrc
                }));
                e.dataTransfer.effectAllowed = 'copy';
                item.classList.add('dragging');

                // Auto-mostrar timeline al empezar a arrastrar
                showTimeline();
            });

            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
                collapseSequencer();
            });
        });

        // ── Dropzone: timeline container (expansión) ──
        timeline.addEventListener('dragenter', (e) => {
            e.preventDefault();
            timeline.classList.add('sequencer-expanded');
        });

        timeline.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            timeline.classList.add('sequencer-expanded');
            track.classList.add('drag-over');
        });

        timeline.addEventListener('dragleave', (e) => {
            // Solo colapsar si realmente salimos del contenedor (no de un hijo)
            if (!timeline.contains(e.relatedTarget)) {
                collapseSequencer();
            }
        });

        // ── Drop en la zona ──
        timeline.addEventListener('drop', (e) => {
            e.preventDefault();
            collapseSequencer();

            try {
                const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                if (!data || !data.name) return;

                // Cargar el video soltado en el motor
                if (data.src) {
                    // Marcar thumbnail correspondiente en la galería
                    const thumb = document.querySelector(`.video-thumb[data-clip-src="${data.src}"]`);
                    if (thumb) {
                        document.querySelectorAll('.video-thumb').forEach(el => el.classList.remove('active'));
                        thumb.classList.add('active');
                        const index = Array.from(thumb.parentElement.children).indexOf(thumb);
                        AppState.video.source = 'gallery';
                        AppState.video.galleryIndex = index;
                    }
                    Engine.applyBgVideo(data.src);
                    this._applyVideoFilters();
                }

                // Agregar clip a la timeline
                const clipId = 'clip-' + (AppState.timeline.nextId++);
                const duration = 5;
                const lastClip = AppState.timeline.clips[AppState.timeline.clips.length - 1];
                const start = lastClip ? lastClip.start + lastClip.duration : 0;

                AppState.timeline.clips.push({
                    id: clipId,
                    name: data.name,
                    src: data.src,
                    start: start,
                    duration: duration
                });

                this._renderTimelineTrack();
                console.log(`📌 Clip añadido a la línea de tiempo: ${data.name} (${start}s - ${start + duration}s)`);
            } catch (err) {
                console.warn('Drop inválido:', err);
            }
        });

        // ── Global: limpiar si se cancela el arrastre fuera de la zona ──
        document.addEventListener('dragend', () => {
            collapseSequencer();
        });
    },

    // ──────────────────────────────────────────────
    //  TIMELINE TOGGLE (slide up/down desde el borde inferior)
    // ──────────────────────────────────────────────

    setupTimelineHandle() {
        const handle = document.getElementById('timeline-handle');
        const timeline = document.getElementById('timeline-container');
        const viewer = document.getElementById('viewer-container');
        const icon = handle?.querySelector('.tl-handle-icon');
        if (!handle || !timeline) return;

        handle.addEventListener('click', () => {
            const isClosed = timeline.classList.contains('timeline-closed');
            if (isClosed) {
                this._openTimeline();
            } else {
                this._closeTimeline();
            }
        });
    },

    _openTimeline() {
        const timeline = document.getElementById('timeline-container');
        const viewer = document.getElementById('viewer-container');
        const panel = document.querySelector('.control-panel');
        const handle = document.getElementById('timeline-handle');
        const icon = handle?.querySelector('.tl-handle-icon');
        if (!timeline) return;

        timeline.classList.remove('timeline-closed');
        // Reducir la altura del panel lateral para no superponerse con la timeline
        if (panel) panel.classList.add('tl-open');
        if (viewer) {
            viewer.classList.remove('timeline-closed');
            viewer.classList.add('timeline-open');
        }
        // Ocultar el handle cuando la timeline está abierta
        if (handle) {
            handle.classList.add('tl-hidden');
            handle.title = 'Cerrar línea de tiempo';
        }
        if (icon) icon.classList.add('open');

        // Avisar al canvas que cambió el tamaño
        setTimeout(() => window.dispatchEvent(new Event('resize')), 420);
    },

    _closeTimeline() {
        const timeline = document.getElementById('timeline-container');
        const viewer = document.getElementById('viewer-container');
        const panel = document.querySelector('.control-panel');
        const handle = document.getElementById('timeline-handle');
        const icon = handle?.querySelector('.tl-handle-icon');
        if (!timeline) return;

        timeline.classList.add('timeline-closed');
        // Restaurar la altura completa del panel lateral
        if (panel) panel.classList.remove('tl-open');
        if (viewer) {
            viewer.classList.remove('timeline-open');
            viewer.classList.add('timeline-closed');
        }
        // Mostrar el handle de nuevo
        if (handle) {
            handle.classList.remove('tl-hidden');
            handle.title = 'Abrir línea de tiempo';
        }
        if (icon) icon.classList.remove('open');

        setTimeout(() => window.dispatchEvent(new Event('resize')), 420);
    },

    // ──────────────────────────────────────────────
    //  TIMELINE: render, preview, stop, clear
    // ──────────────────────────────────────────────

    setupTimeline() {
        const clearBtn = document.getElementById('timeline-btn-clear');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                this._clearTimeline();
                this._closeTimeline();
            });
        }

        const previewBtn = document.getElementById('timeline-btn-preview');
        if (previewBtn) {
            previewBtn.addEventListener('click', () => this._previewTimeline());
        }

        const stopBtn = document.getElementById('timeline-btn-stop');
        if (stopBtn) {
            stopBtn.addEventListener('click', () => this._stopTimeline());
        }

        this._renderTimelineTrack();
    },

    _renderTimelineTrack() {
        const track = document.getElementById('timeline-track');
        if (!track) return;

        // Limpiar solo los clips, mantener el hint si no hay clips
        const hint = track.querySelector('.timeline-drop-hint');

        // Remover todos los bloques de clip existentes
        track.querySelectorAll('.timeline-clip-block').forEach(el => el.remove());

        const clips = AppState.timeline.clips;

        if (clips.length === 0) {
            if (!hint) {
                const newHint = document.createElement('span');
                newHint.className = 'timeline-drop-hint';
                newHint.textContent = 'Arrastra videos desde el panel para armar tu secuencia';
                track.appendChild(newHint);
            }
            return;
        }

        // Ocultar hint si hay clips
        if (hint) hint.remove();

        const totalDuration = clips.reduce((sum, c) => sum + c.duration, 0);

        clips.forEach((clip, index) => {
            const block = document.createElement('div');
            block.className = 'timeline-clip-block';
            block.dataset.clipId = clip.id;

            const widthPct = (clip.duration / totalDuration) * 100;
            block.style.width = `calc(${widthPct}% - 4px)`;

            block.innerHTML = `
                <span class="timeline-block-index">#${index + 1}</span>
                <span class="timeline-block-name">${clip.name}</span>
                <span class="timeline-block-time">${clip.duration}s</span>
                <button class="timeline-block-remove" data-clip-id="${clip.id}" title="Eliminar clip">✕</button>
            `;

            // Click en el bloque para reproducir ese clip
            block.addEventListener('click', (e) => {
                if (e.target.closest('.timeline-block-remove')) return;
                this._playClip(clip);
            });

            // Botón de eliminar
            const removeBtn = block.querySelector('.timeline-block-remove');
            if (removeBtn) {
                removeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    AppState.timeline.clips = AppState.timeline.clips.filter(c => c.id !== clip.id);
                    this._recalcTimelineStarts(); // llama a _renderTimelineTrack internamente
                });
            }

            track.appendChild(block);
        });

        // Sombra del total
        const totalLabel = document.createElement('div');
        totalLabel.className = 'timeline-total';
        totalLabel.textContent = `Total: ${totalDuration}s`;
        track.appendChild(totalLabel);
    },

    _recalcTimelineStarts() {
        let cursor = 0;
        AppState.timeline.clips.forEach(clip => {
            clip.start = cursor;
            cursor += clip.duration;
        });
        this._renderTimelineTrack();
    },

    _playClip(clip) {
        if (!clip || !clip.src) return;
        AppState.timeline.currentClipId = clip.id;
        console.log(`▶ Reproduciendo clip: ${clip.name} (${clip.src})`);
        Engine.applyBgVideo(clip.src);
        this._applyVideoFilters();

        // Feedback visual: resaltar bloque activo
        document.querySelectorAll('.timeline-clip-block').forEach(el => {
            el.classList.toggle('playing', el.dataset.clipId === clip.id);
        });
    },

    _previewTimeline() {
        const clips = AppState.timeline.clips;
        if (clips.length === 0) return;

        AppState.timeline.isPlaying = true;
        AppState.timeline.currentClipIndex = 0;

        const previewBtn = document.getElementById('timeline-btn-preview');
        const stopBtn = document.getElementById('timeline-btn-stop');
        if (previewBtn) previewBtn.disabled = true;
        if (stopBtn) stopBtn.disabled = false;

        // Desactivar loop para que el evento 'ended' se dispare
        const videoEl = document.getElementById('bg-video');
        if (videoEl) {
            videoEl.removeAttribute('loop');

            if (!this._onVideoEndHandler) {
                this._onVideoEndHandler = () => {
                    if (!AppState.timeline.isPlaying) return;
                    const nextIdx = AppState.timeline.currentClipIndex + 1;
                    if (nextIdx < AppState.timeline.clips.length) {
                        AppState.timeline.currentClipIndex = nextIdx;
                        this._playClip(AppState.timeline.clips[nextIdx]);
                    } else {
                        this._stopTimeline();
                    }
                };
                videoEl.addEventListener('ended', this._onVideoEndHandler);
            }
        }

        // Reproducir el primer clip
        this._playClip(clips[0]);
    },

    _stopTimeline() {
        AppState.timeline.isPlaying = false;
        AppState.timeline.currentClipId = null;
        AppState.timeline.currentClipIndex = -1;

        // Detener reproducción, restaurar loop y remover listener de 'ended'
        const videoEl = document.getElementById('bg-video');
        if (videoEl) {
            videoEl.pause();
            videoEl.currentTime = 0;
            videoEl.setAttribute('loop', '');
            if (this._onVideoEndHandler) {
                videoEl.removeEventListener('ended', this._onVideoEndHandler);
                this._onVideoEndHandler = null;
            }
        }

        const previewBtn = document.getElementById('timeline-btn-preview');
        const stopBtn = document.getElementById('timeline-btn-stop');
        if (previewBtn) previewBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;

        document.querySelectorAll('.timeline-clip-block').forEach(el => el.classList.remove('playing'));

        console.log('⏹ Secuencia detenida');
    },

    _clearTimeline() {
        AppState.timeline.clips = [];
        AppState.timeline.nextId = 1;
        this._stopTimeline();
        this._renderTimelineTrack();
        console.log('🧹 Línea de tiempo limpiada');
    },

    // ──────────────────────────────────────────────
    //  PASO 2: SISTEMA (PRESETS)
    // ──────────────────────────────────────────────

    setupSystemPresets() {
        const grid = document.getElementById('preset-system-grid');
        if (!grid) return;

        const presets = {
            matrix: {
                shape: 'puntos',
                densityX: 20, densityY: 16,
                color: '#00ff41',
                bgColor: '#0a0a0a',
                animationMode: 'wave',
                speed: 1.5,
                scaleMin: 0.3, scaleMax: 1.5,
                outputs: { numeros: true, letras: true, geometrias: false, constelaciones: false }
            },
            'data-rain': {
                shape: 'asterisco',
                densityX: 30, densityY: 20,
                color: '#22d3ee',
                bgColor: '#020617',
                animationMode: 'wave',
                speed: 3.0,
                scaleMin: 0.1, scaleMax: 1.0,
                outputs: { numeros: true, letras: true, geometrias: false, constelaciones: false }
            }
        };

        grid.querySelectorAll('.system-preset-item').forEach(item => {
            item.addEventListener('click', () => {
                grid.querySelectorAll('.system-preset-item').forEach(el => el.classList.remove('active'));
                item.classList.add('active');

                const presetKey = item.dataset.preset;
                AppState.systemPreset = presetKey;
                const p = presets[presetKey];
                if (!p) return;

                // Aplicar preset al engine
                Engine.settings.densityX = p.densityX;
                Engine.settings.densityY = p.densityY;
                Engine.settings.pixelColor = p.color;
                Engine.settings.bgColor = p.bgColor;
                Engine.settings.animationMode = p.animationMode;
                Engine.settings.speed = p.speed;
                Engine.settings.scaleMin = p.scaleMin;
                Engine.settings.scaleMax = p.scaleMax;

                // Aplicar forma activa según preset
                const firstActive = Object.entries(p.outputs).find(([, v]) => v);
                if (firstActive) {
                    const formaKey = firstActive[0];
                    AppState.formaActiva = formaKey;
                    const radio = document.querySelector(`#forma-selector input[value="${formaKey}"]`);
                    if (radio) {
                        radio.checked = true;
                        document.querySelectorAll('#forma-selector .forma-radio').forEach(el => {
                            el.classList.toggle('active', el.querySelector('input')?.value === formaKey);
                        });
                    }
                    this._propagarParamsAForma();
                    this._syncParamUI();
                    if (this._toggleGeometriaVis) this._toggleGeometriaVis();
                }

                // Aplicar background
                Engine.applyBg('solid');

                console.log(`🎛 Preset aplicado: ${presetKey}`);
            });
        });
    },

    // ──────────────────────────────────────────────
    //  PASO 3A: INPUTS (Sensibilidad + filtros visuales)
    // ──────────────────────────────────────────────

    _applyVideoFilters() {
        const videoEl = document.getElementById('bg-video');
        if (!videoEl) return;
        const b = AppState.inputs.brillo.sensibilidad;
        const m = AppState.inputs.movimiento.sensibilidad;
        const c = AppState.inputs.color.sensibilidad;
        // brillo: 0→0 (negro), 0.5→1 (normal), 1→2 (sobreexpuesto)
        const brightness = b * 2;
        // movimiento: contraste — 0→0.3 (plano), 0.5→1 (normal), 1→2 (marcado)
        const contrast = 0.3 + m * 1.7;
        // color: saturación — 0→0 (escala de grises), 0.5→1 (normal), 1→2 (saturado)
        const saturate = c * 2;
        videoEl.style.filter = `brightness(${brightness}) contrast(${contrast}) saturate(${saturate})`;
    },

    setupInputs() {
        const inputMap = [
            { key: 'brillo',     sliderId: 'slider-input-brillo',     valId: 'val-input-brillo' },
            { key: 'movimiento', sliderId: 'slider-input-contraste', valId: 'val-input-contraste' },
            { key: 'color',      sliderId: 'slider-input-color',     valId: 'val-input-color' },
        ];
        inputMap.forEach(({ key, sliderId, valId }) => {
            const slider = document.getElementById(sliderId);
            const view = document.getElementById(valId);
            if (!slider || !view) return;

            // Sincronizar valor inicial desde estado
            slider.value = AppState.inputs[key].sensibilidad;
            view.textContent = AppState.inputs[key].sensibilidad.toFixed(2);

            slider.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                AppState.inputs[key].sensibilidad = val;
                view.textContent = val.toFixed(2);
                this._applyVideoFilters();
            });
        });
        // Aplicar filtros iniciales
        this._applyVideoFilters();
    },

    // ──────────────────────────────────────────────
    //  PASO 3B: FORMAS (Selección única)
    // ──────────────────────────────────────────────

    setupFormas() {
        const radios = document.querySelectorAll('#forma-selector input[type="radio"]');
        radios.forEach(radio => {
            radio.addEventListener('change', () => {
                if (!radio.checked) return;
                const forma = radio.value;
                if (forma === AppState.formaActiva) return;

                // Actualizar active en los labels
                document.querySelectorAll('#forma-selector .forma-radio').forEach(el => {
                    el.classList.toggle('active', el.querySelector('input')?.value === forma);
                });

                AppState.formaActiva = forma;

                // Copiar los valores compartidos a la nueva forma para el motor
                this._propagarParamsAForma();
                this._syncParamUI();
                // Mostrar/ocultar sub-selector de geometría
                if (this._toggleGeometriaVis) this._toggleGeometriaVis();
            });
        });
    },

    // ──────────────────────────────────────────────
    //  Sync UI: actualiza sliders/selects de parámetros
    //  según la forma activa
    // ──────────────────────────────────────────────

    _syncParamUI() {
        const shared = AppState.paramsCompartidos;
        if (!shared) return;

        // Escala
        const eSlider = document.querySelector('.param-slider[data-param="escala"]');
        const eView = document.getElementById('val-intensity-escala');
        if (eSlider) eSlider.value = shared.escala?.intensidad ?? 0.5;
        if (eView) eView.textContent = (shared.escala?.intensidad ?? 0.5).toFixed(2);

        // Color (unico picker hex)
        const cPicker = document.getElementById('param-color-picker');
        const cView = document.getElementById('val-intensity-color');
        const hex = shared.color?.hex ?? '#ffffff';
        if (cPicker) cPicker.value = hex;
        if (cView) cView.textContent = hex;

        // Espaciado X, Y
        const eX = document.querySelector('.param-slider[data-param="espaciado-x"]');
        const eY = document.querySelector('.param-slider[data-param="espaciado-y"]');
        const vX = document.getElementById('val-intensity-espaciado-x');
        const vY = document.getElementById('val-intensity-espaciado-y');
        const esp = shared.espaciado ?? { x: 0.5, y: 0.5 };
        if (eX) eX.value = esp.x ?? 0.5;
        if (eY) eY.value = esp.y ?? 0.5;
        if (vX) vX.textContent = (esp.x ?? 0.5).toFixed(2);
        if (vY) vY.textContent = (esp.y ?? 0.5).toFixed(2);

        // Opacidad
        const oSlider = document.querySelector('.param-slider[data-param="opacidad"]');
        const oView = document.getElementById('val-intensity-opacidad');
        if (oSlider) oSlider.value = shared.opacidad?.intensidad ?? 1.0;
        if (oView) oView.textContent = (shared.opacidad?.intensidad ?? 1.0).toFixed(2);
    },

    // ──────────────────────────────────────────────
    //  PASO 3C: PARÁMETROS (solo intensidad)
    //  Lee/escribe desde la forma activa
    // ──────────────────────────────────────────────

    // Copia los valores de paramsCompartidos a la forma activa
    // para que el motor (que lee de formas[x].parametros) los tenga.
    _propagarParamsAForma() {
        const forma = AppState.formaActiva;
        const p = AppState.formas[forma]?.parametros;
        const shared = AppState.paramsCompartidos;
        if (!p || !shared) return;
        if (p.escala) p.escala.intensidad = shared.escala.intensidad;
        if (p.color) p.color.hex = shared.color.hex;
        if (p.espaciado) {
            p.espaciado.x = shared.espaciado.x;
            p.espaciado.y = shared.espaciado.y;
        }
        if (p.opacidad) p.opacidad.intensidad = shared.opacidad.intensidad;
    },

    setupParametros() {
        const bindSlider = (selector, viewId, setter) => {
            const slider = document.querySelector(selector);
            const view = document.getElementById(viewId);
            if (!slider || !view) return;
            slider.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                setter(val);
                view.textContent = val % 1 === 0 ? String(val) : val.toFixed(2);
                // Propagar a la forma activa para el motor
                this._propagarParamsAForma();
            });
        };

        // Escala
        bindSlider('.param-slider[data-param="escala"]', 'val-intensity-escala', (val) => {
            AppState.paramsCompartidos.escala.intensidad = val;
        });

        // Color: picker unico (hex)
        const colorPicker = document.getElementById('param-color-picker');
        const colorView = document.getElementById('val-intensity-color');
        if (colorPicker && colorView) {
            colorPicker.addEventListener('input', (e) => {
                const hex = e.target.value;
                AppState.paramsCompartidos.color.hex = hex;
                colorView.textContent = hex;
                this._propagarParamsAForma();
            });
        }

        // Espaciado X, Y
        bindSlider('.param-slider[data-param="espaciado-x"]', 'val-intensity-espaciado-x', (val) => {
            AppState.paramsCompartidos.espaciado.x = val;
        });
        bindSlider('.param-slider[data-param="espaciado-y"]', 'val-intensity-espaciado-y', (val) => {
            AppState.paramsCompartidos.espaciado.y = val;
        });

        // Opacidad
        bindSlider('.param-slider[data-param="opacidad"]', 'val-intensity-opacidad', (val) => {
            AppState.paramsCompartidos.opacidad.intensidad = val;
        });
    },

    // ──────────────────────────────────────────────
    //  DISTRIBUCIÓN (Grilla Estructurada vs Aleatoria)
    // ──────────────────────────────────────────────

    // ──────────────────────────────────────────────
    //  SUB-SELECTOR DE TIPO DE GEOMETRÍA
    // ──────────────────────────────────────────────

    setupGeometriaTipo() {
        const wrapper = document.getElementById('geometria-tipo-wrapper');
        const select = document.getElementById('geometria-tipo-select');
        if (!wrapper || !select) return;

        // Mostrar/ocultar segun la forma activa
        const toggleVis = () => {
            wrapper.style.display = AppState.formaActiva === 'geometrias' ? 'block' : 'none';
        };
        toggleVis();

        // Sincronizar select con el estado
        select.value = AppState.geometriaTipo;

        // Change event en el dropdown
        select.addEventListener('change', () => {
            const tipo = select.value;
            if (tipo === AppState.geometriaTipo) return;
            AppState.geometriaTipo = tipo;
            console.log(`🔷 Geometría cambiada a: ${tipo}`);
        });

        // Exponer toggleVis para que setupFormas lo llame
        this._toggleGeometriaVis = toggleVis;
    },

    // ──────────────────────────────────────────────
    //  PANEL TOGGLE (mostrar/ocultar menú lateral)
    // ──────────────────────────────────────────────

    // ──────────────────────────────────────────────
    //  TIMELINE TOGGLE (mostrar/ocultar línea de tiempo)
    // ──────────────────────────────────────────────

    // ── Timeline toggle eliminado — la barra thin se expande al arrastrar ──

    setupPanelToggle() {
        const btn = document.getElementById('panel-toggle');
        const panel = document.querySelector('.control-panel');
        const viewer = document.querySelector('.viewer-container');
        const icon = btn?.querySelector('.toggle-icon');
        if (!btn || !panel) return;

        btn.addEventListener('click', () => {
            const isOpen = panel.classList.toggle('hidden');
            btn.classList.toggle('panel-open', !isOpen);
            btn.classList.toggle('panel-closed', isOpen);

            // Lógica corregida:
            // Panel ABIERTO → flecha DERECHA (›) indica que se cierra hacia la derecha
            // Panel CERRADO → flecha IZQUIERDA (‹) indica que se abre hacia la izquierda
            if (icon) {
                // Rotar el SVG 180° según el estado
                icon.style.transform = isOpen ? 'rotate(180deg)' : 'rotate(0deg)';
            }
            btn.title = isOpen ? 'Mostrar panel' : 'Ocultar panel';

            // Disparar resize al terminar la animación para que el canvas se reajuste
            setTimeout(() => {
                window.dispatchEvent(new Event('resize'));
            }, 400);
        });
    },

    // ──────────────────────────────────────────────
    //  DISTRIBUCIÓN (Grilla Estructurada vs Aleatoria)
    // ──────────────────────────────────────────────

    // ──────────────────────────────────────────────
    //  WELCOME SCREEN (Splash)
    // ──────────────────────────────────────────────

    setupWelcomeScreen() {
        const btn = document.getElementById('btn-ingresar');
        const screen = document.getElementById('welcome-screen');
        if (!btn || !screen) return;

        btn.addEventListener('click', () => {
            // Animación crossfade: splash se desvanece y se encoge
            screen.classList.add('fade-out');

            // El viewer se revela con un zoom-in suave
            const viewer = document.querySelector('.viewer-container');
            if (viewer) viewer.classList.add('splash-reveal');

            // Cargar video por defecto: Flor 1 (margarita)
            // Esto ocurre dentro del gesto del usuario, necesario para autoplay
            this._loadDefaultVideo();

            // Ocultar completamente tras la transición
            setTimeout(() => {
                screen.style.display = 'none';
                if (viewer) viewer.classList.remove('splash-reveal');
            }, 900);
        });
    },

    // ──────────────────────────────────────────────
    //  CARGA INICIAL: Flor 1 por defecto
    // ──────────────────────────────────────────────

    _loadDefaultVideo() {
        const gallery = document.getElementById('video-gallery-grid');
        if (!gallery) return;

        // Buscar el thumbnail de Flor 1 (data-video="flor-1")
        const defaultThumb = gallery.querySelector('.video-thumb[data-video="flor-1"]');
        if (!defaultThumb) return;

        const index = Array.from(gallery.children).indexOf(defaultThumb);
        const videoUrl = defaultThumb.dataset.clipSrc;
        if (!videoUrl) return;

        // Limpiar selección previa y marcar Flor 1 como activa
        gallery.querySelectorAll('.video-thumb').forEach(el => el.classList.remove('active'));
        defaultThumb.classList.add('active');

        // Actualizar estado
        AppState.video.source = 'gallery';
        AppState.video.galleryIndex = index;
        AppState.video.uploadFile = null;

        // Cargar y reproducir el video
        Engine.applyBgVideo(videoUrl);
        this._applyVideoFilters();

        console.log('Video inicial cargado: Flor 1');
    },

    setupDistribucion() {
        const btn = document.getElementById('btn-distribucion');
        if (!btn) return;

        // Sincronizar estado inicial
        btn.textContent = AppState.modoDistribucion === 'aleatoria' ? 'Caótica' : 'Estructurada';
        btn.classList.toggle('active', AppState.modoDistribucion === 'aleatoria');

        btn.addEventListener('click', () => {
            const nuevo = AppState.modoDistribucion === 'aleatoria' ? 'estructurada' : 'aleatoria';
            AppState.modoDistribucion = nuevo;
            btn.textContent = nuevo === 'aleatoria' ? 'Caótica' : 'Estructurada';
            btn.classList.toggle('active', nuevo === 'aleatoria');
            console.log(`📐 Distribución cambiada a: ${nuevo}`);
        });
    },

    // ──────────────────────────────────────────────
    //  PASO 4: GUARDAR
    // ──────────────────────────────────────────────

    // ── Construye el snapshot del estado actual (reusable) ──
    _buildSnapshot(name) {
        return {
            name: name,
            timestamp: new Date().toISOString(),
            version: 1,
            video: { ...AppState.video },
            systemPreset: AppState.systemPreset,
            modoDistribucion: AppState.modoDistribucion,
            geometriaTipo: AppState.geometriaTipo,
            inputs: JSON.parse(JSON.stringify(AppState.inputs)),
            formaActiva: AppState.formaActiva,
            formas: JSON.parse(JSON.stringify(AppState.formas)),
            paramsCompartidos: JSON.parse(JSON.stringify(AppState.paramsCompartidos)),
            engineSettings: {
                pixelColor: Engine.settings.pixelColor,
                baseScale: Engine.settings.baseScale,
                stretchX: Engine.settings.stretchX,
                stretchY: Engine.settings.stretchY,
                densityX: Engine.settings.densityX,
                densityY: Engine.settings.densityY,
                offsetX: Engine.settings.offsetX,
                offsetY: Engine.settings.offsetY,
                inversion: Engine.settings.inversion,
                animationMode: Engine.settings.animationMode,
                speed: Engine.settings.speed,
                scaleMin: Engine.settings.scaleMin,
                scaleMax: Engine.settings.scaleMax,
                bgColor: Engine.settings.bgColor,
                bgMode: Engine.settings.bgMode,
                gradColors: [...(Engine.settings.gradColors || [])]
            }
        };
    },

    setupSave() {
        const saveBtn = document.getElementById('btn-save-config');
        const nameInput = document.getElementById('save-project-name');
        const statusDiv = document.getElementById('save-status');

        if (!saveBtn) return;

        saveBtn.addEventListener('click', () => {
            const name = nameInput ? nameInput.value.trim() : '';
            if (!name) {
                if (statusDiv) statusDiv.textContent = '⚠️ Escribe un nombre para el preset.';
                return;
            }

            // Tomar snapshot del estado actual
            const snapshot = this._buildSnapshot(name);

            AppState.savedProjects.push(snapshot);

            // Guardar en localStorage para persistencia
            try {
                const existing = JSON.parse(localStorage.getItem('formas-vivas-projects') || '[]');
                existing.push(snapshot);
                localStorage.setItem('formas-vivas-projects', JSON.stringify(existing));
            } catch (e) {
                console.warn('No se pudo guardar en localStorage:', e.message);
            }

            // Crear tarjeta de preset dinámico en la grilla
            this._addPresetCard(name, snapshot);

            // Feedback instantáneo (solo LocalStorage — 100% frontend)
            if (statusDiv) {
                statusDiv.textContent = `✅ «${name}» guardado en el panel.`;
                setTimeout(() => { statusDiv.textContent = ''; }, 3000);
            }

            if (nameInput) nameInput.value = '';
            console.log(`💾 Preset guardado en localStorage: ${name}`);
        });

        // ── EXPORTAR JSON ──
        const exportBtn = document.getElementById('btn-export-json');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                const name = nameInput ? nameInput.value.trim() : 'latente-preset';
                const snapshot = this._buildSnapshot(name || 'latente-preset');

                const jsonStr = JSON.stringify(snapshot, null, 2);
                const blob = new Blob([jsonStr], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                const safeName = (name || 'latente-preset').replace(/[^a-zA-Z0-9_-]/g, '_');
                link.download = `${safeName}.json`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);

                if (statusDiv) {
                    statusDiv.textContent = `✅ Exportado: ${safeName}.json`;
                    setTimeout(() => { statusDiv.textContent = ''; }, 3000);
                }
                console.log(`📦 Preset exportado: ${safeName}.json`);
            });
        }

        // ── IMPORTAR JSON ──
        const importInput = document.getElementById('import-json-input');
        const importBtn = document.getElementById('btn-import-json');
        const importStatus = document.getElementById('import-status');

        if (importBtn && importInput) {
            importBtn.addEventListener('click', () => {
                importInput.click();
            });

            importInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (evt) => {
                    try {
                        const data = JSON.parse(evt.target.result);

                        // Validar que sea un preset válido
                        if (!data.formaActiva && !data.engineSettings) {
                            throw new Error('El archivo no contiene un preset válido de LATEnte.');
                        }

                        const presetName = data.name || file.name.replace(/\.json$/i, '');
                        data.name = presetName;
                        if (!data.timestamp) data.timestamp = new Date().toISOString();

                        // Agregar a la lista y guardar en localStorage
                        AppState.savedProjects.push(data);
                        try {
                            const existing = JSON.parse(localStorage.getItem('formas-vivas-projects') || '[]');
                            existing.push(data);
                            localStorage.setItem('formas-vivas-projects', JSON.stringify(existing));
                        } catch (e) {
                            console.warn('No se pudo guardar en localStorage:', e.message);
                        }

                        // Crear tarjeta en la grilla
                        this._addPresetCard(presetName, data);

                        if (importStatus) {
                            importStatus.textContent = `✅ «${presetName}» importado.`;
                            setTimeout(() => { importStatus.textContent = ''; }, 4000);
                        }
                        console.log(`📂 Preset importado: ${presetName}`);
                    } catch (err) {
                        if (importStatus) {
                            importStatus.textContent = `❌ Error: ${err.message}`;
                            setTimeout(() => { importStatus.textContent = ''; }, 4000);
                        }
                        console.warn('Error al importar JSON:', err);
                    }
                };
                reader.readAsText(file);

                // Resetear el input para permitir re-importar el mismo archivo
                importInput.value = '';
            });
        }
    },

    // ── Crear tarjeta de preset dinámico ──
    _addPresetCard(name, snapshot) {
        const grid = document.getElementById('preset-system-grid');
        if (!grid) return;

        const item = document.createElement('div');
        item.className = 'system-preset-item';
        item.dataset.preset = 'custom-' + Date.now();
        item.dataset.custom = 'true';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'system-preset-name';
        nameSpan.textContent = name;

        item.appendChild(nameSpan);

        // Botones Editar / Eliminar (solo para presets custom)
        const actions = document.createElement('div');
        actions.className = 'system-preset-actions';

        const editBtn = document.createElement('button');
        editBtn.className = 'preset-action-btn preset-action-edit';
        editBtn.innerHTML = '✎';
        editBtn.title = 'Renombrar preset';

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'preset-action-btn preset-action-delete';
        deleteBtn.innerHTML = '✕';
        deleteBtn.title = 'Eliminar preset';

        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);
        item.appendChild(actions);

        // Click para aplicar el preset guardado
        item.addEventListener('click', (e) => {
            if (e.target.closest('.preset-action-btn')) return;
            grid.querySelectorAll('.system-preset-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');

            AppState.systemPreset = item.dataset.preset;

            if (snapshot.engineSettings) {
                Object.assign(Engine.settings, snapshot.engineSettings);
            }
            if (snapshot.inputs) {
                Object.assign(AppState.inputs, snapshot.inputs);
                this._applyVideoFilters();
            }
            if (snapshot.formaActiva) {
                AppState.formaActiva = snapshot.formaActiva;
                const radio = document.querySelector(`#forma-selector input[value="${snapshot.formaActiva}"]`);
                if (radio) {
                    radio.checked = true;
                    document.querySelectorAll('#forma-selector .forma-radio').forEach(el => {
                        el.classList.toggle('active', el.querySelector('input')?.value === snapshot.formaActiva);
                    });
                }
            }

            // Restaurar modo de distribución
            if (snapshot.modoDistribucion) {
                AppState.modoDistribucion = snapshot.modoDistribucion;
                const distBtn = document.getElementById('btn-distribucion');
                if (distBtn) {
                    distBtn.textContent = snapshot.modoDistribucion === 'aleatoria' ? 'Caótica' : 'Estructurada';
                    distBtn.classList.toggle('active', snapshot.modoDistribucion === 'aleatoria');
                }
            }

            // Restaurar tipo de geometría
            if (snapshot.geometriaTipo) {
                AppState.geometriaTipo = snapshot.geometriaTipo;
                const geoSelect = document.getElementById('geometria-tipo-select');
                if (geoSelect) geoSelect.value = snapshot.geometriaTipo;
            }

            // Restaurar parámetros compartidos
            if (snapshot.paramsCompartidos) {
                const sc = snapshot.paramsCompartidos;
                if (sc.escala) AppState.paramsCompartidos.escala.intensidad = sc.escala.intensidad;
                if (sc.color) AppState.paramsCompartidos.color.hex = sc.color.hex;
                if (sc.espaciado) {
                    AppState.paramsCompartidos.espaciado.x = sc.espaciado.x;
                    AppState.paramsCompartidos.espaciado.y = sc.espaciado.y;
                }
                if (sc.opacidad) AppState.paramsCompartidos.opacidad.intensidad = sc.opacidad.intensidad;
            }

            // Propagar a la forma activa, sincronizar UI y actualizar visibilidad de geometría
            this._propagarParamsAForma();
            this._syncParamUI();
            if (this._toggleGeometriaVis) this._toggleGeometriaVis();
            Engine.applyBg('solid');
            console.log(`🎛 Preset personalizado aplicado: ${name}`);
        });

        // Botón Editar: renombrar
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const newName = prompt('Nuevo nombre para el preset:', name);
            if (newName && newName.trim() && newName.trim() !== name) {
                const trimmed = newName.trim();
                nameSpan.textContent = trimmed;
                // Actualizar en localStorage
                try {
                    const saved = JSON.parse(localStorage.getItem('formas-vivas-projects') || '[]');
                    const idx = saved.findIndex(p => p.name === name && p.timestamp === snapshot.timestamp);
                    if (idx !== -1) {
                        saved[idx].name = trimmed;
                        localStorage.setItem('formas-vivas-projects', JSON.stringify(saved));
                    }
                } catch (err) {
                    console.warn('Error al renombrar preset:', err);
                }
                // Actualizar también en AppState.savedProjects
                const stateIdx = AppState.savedProjects.findIndex(p => p.name === name && p.timestamp === snapshot.timestamp);
                if (stateIdx !== -1) {
                    AppState.savedProjects[stateIdx].name = trimmed;
                }
            }
        });

        // Botón Eliminar: remover del DOM, localStorage y AppState
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!confirm(`¿Eliminar preset «${name}»?`)) return;
            item.remove();
            // Eliminar de localStorage
            try {
                const saved = JSON.parse(localStorage.getItem('formas-vivas-projects') || '[]');
                const filtered = saved.filter(p => !(p.name === name && p.timestamp === snapshot.timestamp));
                localStorage.setItem('formas-vivas-projects', JSON.stringify(filtered));
            } catch (err) {
                console.warn('Error al eliminar preset:', err);
            }
            // Eliminar de AppState
            AppState.savedProjects = AppState.savedProjects.filter(p => !(p.name === name && p.timestamp === snapshot.timestamp));
        });

        grid.appendChild(item);
    },

    // ── Cargar presets guardados desde localStorage ──
    _loadSavedPresets() {
        try {
            const saved = JSON.parse(localStorage.getItem('formas-vivas-projects') || '[]');
            saved.forEach(proj => {
                if (proj.name) {
                    this._addPresetCard(proj.name, proj);
                }
            });
        } catch (e) {
            console.warn('No se pudieron cargar presets guardados:', e.message);
        }
    },

    // ──────────────────────────────────────────────
    //  PASO 5: EXPORTAR
    // ──────────────────────────────────────────────

    setupExport() {
        const recordBtn = document.getElementById('btn-export-record');
        const statusDiv = document.getElementById('export-status');
        const canvasElement = document.getElementById('pattern-canvas');
        if (!recordBtn || !statusDiv || !canvasElement) return;

        let mediaRecorder = null;
        let recordingChunks = [];
        let isRecording = false;

        recordBtn.addEventListener('click', () => {
            if (!isRecording) {
                // ── INICIAR GRABACIÓN ──
                const stream = canvasElement.captureStream(30);
                const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
                    ? 'video/webm;codecs=vp9'
                    : 'video/webm';

                mediaRecorder = new MediaRecorder(stream, { mimeType });
                recordingChunks = [];

                mediaRecorder.ondataavailable = (e) => {
                    if (e.data.size > 0) recordingChunks.push(e.data);
                };

                mediaRecorder.onstop = () => {
                    const blob = new Blob(recordingChunks, { type: 'video/webm' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = 'latente-visual.webm';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);

                    statusDiv.textContent = '✅ Video exportado';
                    setTimeout(() => { statusDiv.textContent = ''; }, 3000);
                };

                mediaRecorder.start(1000); // chunks cada 1s
                isRecording = true;
                recordBtn.classList.add('recording');
                recordBtn.querySelector('.export-format-name').textContent = '⬤ Grabando...';
                statusDiv.textContent = '⏺ Grabando canvas en tiempo real...';

                console.log('🔴 Export: grabación iniciada');
            } else {
                // ── DETENER GRABACIÓN Y DESCARGAR ──
                if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                    mediaRecorder.stop();
                }
                isRecording = false;
                recordBtn.classList.remove('recording');
                recordBtn.querySelector('.export-format-name').textContent = '● Exportar';

                console.log('⏹ Export: grabación detenida, descargando...');
            }
        });
    }
};
