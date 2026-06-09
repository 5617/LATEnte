// js/controls.js
import { AppState } from './state.js';
import { Engine } from './engine.js';

export const Controls = {
    _previewTimeout: null,
    _onVideoEndHandler: null,
    _onTimeUpdateHandler: null,

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
        this.setupEfectos();
        this._setupTramasActivas();
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

                const clip = {
                    id: clipId,
                    name: data.name,
                    src: data.src,
                    start: start,
                    duration: duration,
                    filmstrip: null // se llenará con frames cuando estén listos
                };

                AppState.timeline.clips.push(clip);

                this._renderTimelineTrack();

                // Generar filmstrip de frames en segundo plano
                this._generateFilmstrip(clip);
                this._updateTimelineTotal();

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
    //  GENERAR FILMSTRIP: captura N frames del video
    // ──────────────────────────────────────────────

    _generateFilmstrip(clip) {
        if (!clip || !clip.src) return;

        const video = document.createElement('video');
        video.muted = true;
        video.preload = 'metadata';
        video.crossOrigin = 'anonymous';
        video.src = clip.src;

        const FRAME_COUNT = 6; // frames por clip
        const FRAME_W = 48;
        const FRAME_H = 34;

        video.addEventListener('loadedmetadata', () => {
            const dur = video.duration || clip.duration;
            const ids = [];
            let captured = 0;

            const captureFrame = (time) => {
                video.currentTime = time;
            };

            video.addEventListener('seeked', function onSeek() {
                const canvas = document.createElement('canvas');
                canvas.width = FRAME_W;
                canvas.height = FRAME_H;
                const ctx = canvas.getContext('2d');
                try {
                    ctx.drawImage(video, 0, 0, FRAME_W, FRAME_H);
                    ids.push(canvas.toDataURL('image/jpeg', 0.6));
                } catch (e) {
                    ids.push(null);
                }
                captured++;

                if (captured < FRAME_COUNT) {
                    const t = (dur / (FRAME_COUNT + 1)) * (captured + 1);
                    captureFrame(Math.max(0.1, Math.min(t, dur - 0.1)));
                } else {
                    clip.filmstrip = ids;
                    video.remove();
                    // Re-render para mostrar los frames
                    this._renderTimelineTrack();
                }
            }.bind(this));

            // Arrancar con el primer frame
            captureFrame(dur / (FRAME_COUNT + 1));
        });

        video.addEventListener('error', () => {
            clip.filmstrip = [];
            video.remove();
        });

        video.load();
    },

    // ──────────────────────────────────────────────
    //  PRECARGA DE CLIP (para transición fluida)
    // ──────────────────────────────────────────────

    _preloadClip(clip) {
        if (!clip || !clip.src) return;
        const hidden = document.getElementById('bg-video-next');
        if (!hidden) return;

        // Si ya está cargando este mismo src, no reiniciar
        if (hidden.dataset.prelSrc === clip.src) return;

        hidden.dataset.prelSrc = clip.src;
        hidden.muted = true;
        hidden.playsInline = true;
        hidden.setAttribute('playsinline', '');
        hidden.setAttribute('crossOrigin', 'anonymous');
        hidden.style.display = 'none';
        hidden.src = clip.src;
        hidden.load();
        hidden.currentTime = 0;
    },

    // ── Intercambio instantáneo de videos: el oculto pasa a ser el visible ──
    _swapVideo() {
        const current = document.getElementById('bg-video');
        const hidden = document.getElementById('bg-video-next');
        if (!current || !hidden) return;

        // Si el hidden no tiene src o no está cargado, salir
        if (!hidden.src || !hidden.readyState) return;

        // Guardar referencia al current para ocultarlo después
        const oldVideo = current;

        // Intercambiar IDs: el hidden pasa a ser el activo
        hidden.id = 'bg-video';
        hidden.style.display = 'block';

        oldVideo.id = 'bg-video-next';
        oldVideo.style.display = 'none';
        oldVideo.removeAttribute('loop');

        // Quitar loop en el nuevo video si estamos en modo timeline
        if (AppState.timeline.isPlaying) {
            hidden.removeAttribute('loop');
        } else {
            hidden.setAttribute('loop', '');
        }

        // Aplicar filtros visuales al nuevo video
        this._applyVideoFilters();

        // Asegurar reproducción
        hidden.play().catch(() => {});

        // Resetear estado de captura del engine para el nuevo video
        Engine.hasVideo = false;
        Engine._captureErrorLogged = false;

        // Limpiar marca de precarga
        delete hidden.dataset.prelSrc;

        // Re-adjuntar el listener ended al nuevo video activo
        // (el listener estaba en el elemento viejo, ahora con ID bg-video-next)
        if (this._onVideoEndHandler) {
            oldVideo.removeEventListener('ended', this._onVideoEndHandler);
            const newActive = document.getElementById('bg-video');
            newActive.addEventListener('ended', this._onVideoEndHandler);
        }
    },

    // ──────────────────────────────────────────────
    //  SCRUBBING: clic en la línea de tiempo para buscar
    // ──────────────────────────────────────────────

    _setupTimelineScrubbing() {
        const track = document.getElementById('timeline-track');
        if (!track) return;

        let isScrubbing = false;

        const seekTo = (clientX) => {
            const clips = AppState.timeline.clips;
            if (clips.length === 0) return;

            const rect = track.getBoundingClientRect();
            const clickX = clientX - rect.left;
            const pct = Math.max(0, Math.min(1, clickX / rect.width));

            const totalDuration = clips.reduce((sum, c) => sum + c.duration, 0);
            const targetTime = pct * totalDuration;

            // Encontrar clip y tiempo interno correspondiente
            let accum = 0;
            let targetClip = null;
            let targetClipIndex = -1;
            let timeWithinClip = 0;

            for (let i = 0; i < clips.length; i++) {
                const c = clips[i];
                if (targetTime >= accum && targetTime < accum + c.duration) {
                    targetClip = c;
                    targetClipIndex = i;
                    timeWithinClip = targetTime - accum;
                    break;
                }
                accum += c.duration;
            }

            if (!targetClip && clips.length > 0) {
                targetClip = clips[clips.length - 1];
                targetClipIndex = clips.length - 1;
                timeWithinClip = targetClip.duration;
            }

            if (!targetClip) return;

            // ── Actualizar elapsed global ──
            AppState.timeline.elapsed = targetTime;
            AppState.timeline.currentClipIndex = targetClipIndex;
            AppState.timeline.currentClipId = targetClip.id;

            // ── Mover playhead visualmente ──
            const playhead = track.querySelector('.timeline-playhead');
            if (playhead) {
                playhead.style.display = 'block';
                playhead.style.left = `min(${pct * 100}%, calc(100% - 2px))`;
            }

            // ── Feedback visual del clip activo ──
            document.querySelectorAll('.timeline-clip-block').forEach(el => {
                el.classList.toggle('playing', el.dataset.clipId === targetClip.id);
            });

            const videoEl = document.getElementById('bg-video');
            const sameClip = videoEl && AppState.timeline.currentClipId === targetClip.id;

            // ── Mismo clip con video cargado: solo seek ──
            if (sameClip && videoEl.readyState > 0) {
                videoEl.currentTime = Math.min(timeWithinClip, videoEl.duration || targetClip.duration);
                this._updatePlayhead();
                return;
            }

            // ── Diferente clip, hay reproducción activa: swap + seek ──
            if (AppState.timeline.isPlaying && videoEl && videoEl.readyState > 0) {
                this._preloadClip(targetClip);
                const videoHidden = document.getElementById('bg-video-next');
                const doSwap = () => this._swapToClip(targetClip, targetClipIndex, timeWithinClip);
                if (videoHidden && videoHidden.readyState > 0) {
                    doSwap();
                } else if (videoHidden) {
                    videoHidden.addEventListener('canplay', doSwap, { once: true });
                    setTimeout(() => {
                        videoHidden?.removeEventListener('canplay', doSwap);
                        doSwap();
                    }, 500);
                } else {
                    doSwap();
                }
                return;
            }

            // ── Sin reproducción activa: cargar fresco y seek, SIN auto-play ──
            Engine.applyBgVideo(targetClip.src);
            this._applyVideoFilters();

            const v = document.getElementById('bg-video');
            if (v) {
                v.removeAttribute('loop');
                const setTime = () => {
                    v.currentTime = Math.min(timeWithinClip, v.duration || targetClip.duration);
                };
                if (v.readyState > 0) {
                    setTime();
                } else {
                    v.addEventListener('loadedmetadata', setTime, { once: true });
                }
            }

            this._updatePlayhead();
        };

        // ── Mousedown: inicia scrubbing ──
        track.addEventListener('mousedown', (e) => {
            if (e.target.closest('.timeline-block-remove')) return;
            isScrubbing = true;
            seekTo(e.clientX);
        });

        // ── Mousemove: drag scrubbing ──
        document.addEventListener('mousemove', (e) => {
            if (!isScrubbing) return;
            seekTo(e.clientX);
        });

        // ── Mouseup: detiene el drag ──
        document.addEventListener('mouseup', () => {
            isScrubbing = false;
        });
    },

    // ── Helper: cambia al clip indicado en la posición exacta ──
    _swapToClip(clip, index, seekTime) {
        AppState.timeline.currentClipIndex = index;
        AppState.timeline.currentClipId = clip.id;

        // Calcular elapsed global: suma de clips anteriores + seekTime
        let elapsedBase = 0;
        for (let i = 0; i < index; i++) {
            elapsedBase += AppState.timeline.clips[i].duration;
        }
        AppState.timeline.elapsed = elapsedBase + seekTime;

        this._preloadClip(clip);
        this._swapVideo();

        const videoEl = document.getElementById('bg-video');
        if (videoEl) {
            videoEl.removeAttribute('loop');
            videoEl.currentTime = Math.min(seekTime, videoEl.duration || clip.duration);
        }

        document.querySelectorAll('.timeline-clip-block').forEach(el => {
            el.classList.toggle('playing', el.dataset.clipId === clip.id);
        });

        this._updatePlayhead();

        // Pre-cargar el siguiente clip
        const nextIdx = index + 1;
        if (nextIdx < AppState.timeline.clips.length) {
            this._preloadClip(AppState.timeline.clips[nextIdx]);
        }
    },

    // ── Actualiza el label de duración total en la toolbar ──
    _updateTimelineTotal() {
        const totalLabel = document.getElementById('timeline-total-label');
        if (!totalLabel) return;
        const total = AppState.timeline.clips.reduce((sum, c) => sum + c.duration, 0);
        totalLabel.textContent = total > 0 ? `Total: ${total}s` : '';
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
        this._setupTimelineScrubbing();
    },

    _renderTimelineTrack() {
        const track = document.getElementById('timeline-track');
        if (!track) return;

        // Limpiar solo los clips, mantener el hint si no hay clips
        const hint = track.querySelector('.timeline-drop-hint');

        // Remover playhead si existe
        const oldPlayhead = track.querySelector('.timeline-playhead');
        if (oldPlayhead) oldPlayhead.remove();

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
            block.style.flex = `${clip.duration} ${clip.duration} ${widthPct}%`;

            // ── Filmstrip (frames del video) ──
            let filmstripHtml = '';
            if (clip.filmstrip && clip.filmstrip.length > 0) {
                filmstripHtml = clip.filmstrip.map(url =>
                    url ? `<img class="filmstrip-frame" src="${url}" alt="">` : `<span class="filmstrip-frame filmstrip-empty"></span>`
                ).join('');
            } else {
                // Placeholder mientras se cargan
                filmstripHtml = `<div class="filmstrip-loading">🎞</div>`;
            }

            block.innerHTML = `
                <div class="filmstrip-row">${filmstripHtml}</div>
                <div class="timeline-block-info">
                    <span class="timeline-block-index">#${index + 1}</span>
                    <span class="timeline-block-name">${clip.name}</span>
                    <span class="timeline-block-time">${clip.duration}s</span>
                    <button class="timeline-block-remove" data-clip-id="${clip.id}" title="Eliminar clip">✕</button>
                </div>
            `;

            // El scrubbing (click/arrastre en el track) maneja el seekeo.
            // El click en un clip block lo captura _setupTimelineScrubbing.

            // Botón de eliminar
            const removeBtn = block.querySelector('.timeline-block-remove');
            if (removeBtn) {
                removeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    AppState.timeline.clips = AppState.timeline.clips.filter(c => c.id !== clip.id);
                    this._recalcTimelineStarts();
                });
            }

            track.appendChild(block);
        });

        // ── Playhead (aguja de reproducción) ──
        const playhead = document.createElement('div');
        playhead.className = 'timeline-playhead';
        track.appendChild(playhead);

        // Actualizar label de duración total en la toolbar
        this._updateTimelineTotal();
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

        // Si estamos en modo timeline (isPlaying), quitar loop para que ended dispare
        if (AppState.timeline.isPlaying) {
            const videoEl = document.getElementById('bg-video');
            if (videoEl) {
                videoEl.removeAttribute('loop');
            }
        }

        // Feedback visual: resaltar bloque activo
        document.querySelectorAll('.timeline-clip-block').forEach(el => {
            el.classList.toggle('playing', el.dataset.clipId === clip.id);
        });

        // Mover playhead al inicio del clip
        this._updatePlayhead();
    },

    _updatePlayhead() {
        const track = document.getElementById('timeline-track');
        const playhead = track?.querySelector('.timeline-playhead');
        if (!playhead) return;

        const clips = AppState.timeline.clips;
        const totalDuration = clips.reduce((sum, c) => sum + c.duration, 0);
        if (totalDuration <= 0) {
            playhead.style.display = 'none';
            return;
        }

        playhead.style.display = 'block';

        const videoEl = document.getElementById('bg-video');
        if (!videoEl) return;

        // Remover listener anterior del elemento correcto
        if (this._onTimeUpdateHandler) {
            // Intentar remover de ambos elementos por si el listener quedó huérfano
            const active = document.getElementById('bg-video');
            const hidden = document.getElementById('bg-video-next');
            if (active) active.removeEventListener('timeupdate', this._onTimeUpdateHandler);
            if (hidden) hidden.removeEventListener('timeupdate', this._onTimeUpdateHandler);
        }

        const onTimeUpdate = () => {
            if (!AppState.timeline.isPlaying) {
                videoEl.removeEventListener('timeupdate', onTimeUpdate);
                return;
            }

            const clips = AppState.timeline.clips;
            const currentClipId = AppState.timeline.currentClipId;
            if (!currentClipId || clips.length === 0) return;

            const clipIdx = clips.findIndex(c => c.id === currentClipId);
            if (clipIdx === -1) return;

            // Tiempo acumulado GLOBAL: suma de duraciones de clips anteriores + currentTime del video
            let elapsedBase = 0;
            for (let i = 0; i < clipIdx; i++) {
                elapsedBase += clips[i].duration;
            }

            const curTime = videoEl.currentTime || 0;
            const elapsed = elapsedBase + curTime;
            AppState.timeline.elapsed = elapsed;

            const totalDur = clips.reduce((sum, c) => sum + c.duration, 0);
            const pct = totalDur > 0 ? (elapsed / totalDur) * 100 : 0;
            playhead.style.left = `min(${pct}%, calc(100% - 2px))`;
        };

        this._onTimeUpdateHandler = onTimeUpdate;
        videoEl.addEventListener('timeupdate', onTimeUpdate);
    },

    _previewTimeline() {
        const clips = AppState.timeline.clips;
        if (clips.length === 0) return;

        AppState.timeline.isPlaying = true;

        const previewBtn = document.getElementById('timeline-btn-preview');
        const stopBtn = document.getElementById('timeline-btn-stop');
        if (previewBtn) previewBtn.disabled = true;
        if (stopBtn) stopBtn.disabled = false;

        // ── RESUME: si hay posición guardada y mismo clip cargado, solo reanudar ──
        const videoEl = document.getElementById('bg-video');
        if (AppState.timeline.elapsed > 0
            && AppState.timeline.currentClipId
            && videoEl && videoEl.readyState > 0) {

            videoEl.removeAttribute('loop');

            // Re-adjuntar handler ended (apunta al clip actual, no al siguiente)
            if (this._onVideoEndHandler) {
                videoEl.removeEventListener('ended', this._onVideoEndHandler);
            }
            this._onVideoEndHandler = () => {
                if (!AppState.timeline.isPlaying) return;
                const nextIdx = AppState.timeline.currentClipIndex + 1;
                if (nextIdx < clips.length) {
                    AppState.timeline.currentClipIndex = nextIdx;
                    const nextClip = clips[nextIdx];
                    AppState.timeline.currentClipId = nextClip.id;
                    this._swapVideo();
                    document.querySelectorAll('.timeline-clip-block').forEach(el => {
                        el.classList.toggle('playing', el.dataset.clipId === nextClip.id);
                    });
                    this._updatePlayhead();
                    const nextNextIdx = nextIdx + 1;
                    if (nextNextIdx < clips.length) {
                        this._preloadClip(clips[nextNextIdx]);
                    }
                } else {
                    this._stopTimeline();
                }
            };
            videoEl.addEventListener('ended', this._onVideoEndHandler);

            videoEl.play().catch(() => {});
            this._updatePlayhead();

            // Pre-cargar el siguiente clip si no está ya
            const nextIdx = AppState.timeline.currentClipIndex + 1;
            if (nextIdx < clips.length) {
                this._preloadClip(clips[nextIdx]);
            }

            return;
        }

        // ── START FROM BEGINNING ──
        AppState.timeline.currentClipIndex = 0;
        AppState.timeline.elapsed = 0;

        // Pre-cargar el segundo clip (transición fluida)
        if (clips.length > 1) {
            this._preloadClip(clips[1]);
        }

        // Remover loop para que 'ended' se dispare
        if (videoEl) {
            videoEl.removeAttribute('loop');

            // Remover handler anterior si existe
            if (this._onVideoEndHandler) {
                videoEl.removeEventListener('ended', this._onVideoEndHandler);
            }

            this._onVideoEndHandler = () => {
                if (!AppState.timeline.isPlaying) return;
                const nextIdx = AppState.timeline.currentClipIndex + 1;
                if (nextIdx < AppState.timeline.clips.length) {
                    AppState.timeline.currentClipIndex = nextIdx;
                    const nextClip = AppState.timeline.clips[nextIdx];
                    AppState.timeline.currentClipId = nextClip.id; // ✨ FIX CRÍTICO

                    // Usar swap en vez de recargar desde cero
                    this._swapVideo();

                    // Feedback visual: resaltar bloque activo
                    document.querySelectorAll('.timeline-clip-block').forEach(el => {
                        el.classList.toggle('playing', el.dataset.clipId === nextClip.id);
                    });

                    this._updatePlayhead();

                    // Pre-cargar el siguiente (si hay más)
                    const nextNextIdx = nextIdx + 1;
                    if (nextNextIdx < AppState.timeline.clips.length) {
                        this._preloadClip(AppState.timeline.clips[nextNextIdx]);
                    }
                } else {
                    this._stopTimeline();
                }
            };

            videoEl.addEventListener('ended', this._onVideoEndHandler);
        }

        // Reproducir el primer clip
        this._playClip(clips[0]);
    },

    _stopTimeline() {
        AppState.timeline.isPlaying = false;
        // NO reseteamos currentClipId ni currentClipIndex:
        // queremos que el playhead se quede en la posición donde se detuvo.

        const videoEl = document.getElementById('bg-video');
        if (videoEl) {
            videoEl.pause();
            // NO reseteamos currentTime = 0 — el video se congela en el frame actual
            videoEl.setAttribute('loop', '');
            if (this._onVideoEndHandler) {
                videoEl.removeEventListener('ended', this._onVideoEndHandler);
                this._onVideoEndHandler = null;
            }        // NO removemos el listener timeupdate para que el playhead
        // no se mueva mientras está pausado (timeupdate no se dispara en pause).
        }

        // Limpiar listeners huérfanos (elementos que quedaron tras un swap)
        if (this._onTimeUpdateHandler) {
            const hiddenEl = document.getElementById('bg-video-next');
            if (hiddenEl) hiddenEl.removeEventListener('timeupdate', this._onTimeUpdateHandler);
            // También del activo por si hubiera quedado colgado
            const activeEl = document.getElementById('bg-video');
            if (activeEl) activeEl.removeEventListener('timeupdate', this._onTimeUpdateHandler);
        }
        this._onTimeUpdateHandler = null;

        // Limpiar y resetear el video oculto de precarga
        const hidden = document.getElementById('bg-video-next');
        if (hidden) {
            hidden.pause();
            hidden.removeAttribute('src');
            hidden.load();
            hidden.style.display = 'none';
            delete hidden.dataset.prelSrc;
            // Asegurar que el ID del hidden sea correcto (por si quedó mal)
            if (hidden.id !== 'bg-video-next') {
                hidden.id = 'bg-video-next';
            }
        }

        // Asegurar que bg-video tenga el ID correcto
        const current = document.getElementById('bg-video');
        if (!current && videoEl) {
            videoEl.id = 'bg-video';
        }

        const previewBtn = document.getElementById('timeline-btn-preview');
        const stopBtn = document.getElementById('timeline-btn-stop');
        if (previewBtn) previewBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;

        // NO ocultamos el playhead — se queda donde está

        document.querySelectorAll('.timeline-clip-block').forEach(el => el.classList.remove('playing'));

        console.log('⏹ Secuencia detenida — posición preservada');
    },

    _clearTimeline() {
        AppState.timeline.clips = [];
        AppState.timeline.nextId = 1;
        AppState.timeline.currentClipId = null;
        AppState.timeline.currentClipIndex = -1;
        AppState.timeline.elapsed = 0;
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

        // Exponer toggleVis para que setupFormas lo llame            this._toggleGeometriaVis = toggleVis;
        },

    // ── Toggle Tramas Visuales on/off ──
    _setupTramasActivas() {
        const check = document.getElementById('tramas-activas-check');
        if (check) {
            check.addEventListener('change', () => {
                AppState.tramasActivas = check.checked;
            });
        }
    },

    // ──────────────────────────────────────────────
    //  EFECTOS DE VIDEO
    // ──────────────────────────────────────────────

    setupEfectos() {
        // ── CALEIDOSCOPIO ──
        const ckCheck = document.getElementById('efecto-caleidoscopio-check');
        const ckSlider = document.getElementById('efecto-caleidoscopio-segmentos');
        const ckVal = document.getElementById('val-caleidoscopio-segmentos');
        if (ckCheck) {
            ckCheck.addEventListener('change', () => {
                AppState.efectos.caleidoscopio.activo = ckCheck.checked;
            });
        }
        if (ckSlider && ckVal) {
            ckSlider.addEventListener('input', () => {
                const val = parseInt(ckSlider.value);
                AppState.efectos.caleidoscopio.segmentos = val;
                ckVal.textContent = val;
            });
        }

        // ── PIXELART ──
        const pxCheck = document.getElementById('efecto-pixelart-check');
        const pxSlider = document.getElementById('efecto-pixelart-tamanio');
        const pxVal = document.getElementById('val-pixelart-tamanio');
        if (pxCheck) {
            pxCheck.addEventListener('change', () => {
                AppState.efectos.pixelart.activo = pxCheck.checked;
            });
        }
        if (pxSlider && pxVal) {
            const updatePx = () => {
                const factor = parseInt(pxSlider.value);
                const pixelSize = Math.pow(2, factor); // 2,4,8,16,32,64
                AppState.efectos.pixelart.tamanioPixel = pixelSize;
                pxVal.textContent = pixelSize + 'px';
            };
            pxSlider.addEventListener('input', updatePx);
            updatePx();
        }

        // ── NOISE ──
        const nsCheck = document.getElementById('efecto-noise-check');
        const nsSlider = document.getElementById('efecto-noise-intensidad');
        const nsVal = document.getElementById('val-noise-intensidad');
        if (nsCheck) {
            nsCheck.addEventListener('change', () => {
                AppState.efectos.noise.activo = nsCheck.checked;
            });
        }
        if (nsSlider && nsVal) {
            nsSlider.addEventListener('input', () => {
                const val = parseFloat(nsSlider.value);
                AppState.efectos.noise.intensidad = val;
                nsVal.textContent = val.toFixed(2);
            });
        }
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
        const timeline = document.getElementById('timeline-container');
        const icon = btn?.querySelector('.toggle-icon');
        if (!btn || !panel) return;

        btn.addEventListener('click', () => {
            const isOpen = panel.classList.toggle('hidden');
            btn.classList.toggle('panel-open', !isOpen);
            btn.classList.toggle('panel-closed', isOpen);

            // Viewer y timeline se expanden cuando el panel está oculto
            if (viewer) viewer.classList.toggle('panel-hidden', isOpen);
            if (timeline) timeline.classList.toggle('panel-hidden', isOpen);

            // Panel visible: flecha DERECHA (→) para indicar "ocultar hacia la derecha"
            // Panel oculto: flecha IZQUIERDA (←) para indicar "mostrar desde la derecha"
            if (icon) {
                icon.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
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

            // No cargar ningún video — se muestra el empty state
            // [ ESPERANDO SEÑAL ] hasta que el usuario arrastre un video

            // Ocultar completamente tras la transición
            setTimeout(() => {
                screen.style.display = 'none';
                if (viewer) viewer.classList.remove('splash-reveal');
            }, 900);
        });
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
        const statusDiv = document.getElementById('export-status');
        const canvasEl = document.getElementById('pattern-canvas');
        if (!statusDiv || !canvasEl) return;

        const setStatus = (msg, isError) => {
            statusDiv.textContent = msg;
            if (isError) statusDiv.style.color = '#e74c3c';
            else statusDiv.style.color = '';
            setTimeout(() => {
                if (statusDiv.textContent === msg) statusDiv.textContent = '';
            }, 4000);
        };

        const downloadBlob = (blob, filename) => {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        };

        // Convertir dataURL a Blob
        const dataUrlToBlob = (dataUrl) => {
            const parts = dataUrl.split(',');
            const mime = parts[0].match(/:(.*?);/)[1];
            const raw = atob(parts[1]);
            const len = raw.length;
            const arr = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                arr[i] = raw.charCodeAt(i);
            }
            return new Blob([arr], { type: mime });
        };

        const captureFrame = (format, quality) => {
            // Usar el canvas PRINCIPAL (pattern-canvas) que tiene la composicion completa
            // Engine._efectsCanvas NO se usa porque solo tiene el video+efectos, sin tramas
            if (!canvasEl || canvasEl.width === 0) {
                setStatus('❌ No hay contenido para exportar', true);
                return null;
            }

            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = canvasEl.width;
            tempCanvas.height = canvasEl.height;
            const tempCtx = tempCanvas.getContext('2d');

            if (format === 'jpeg') {
                tempCtx.fillStyle = '#000000';
                tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
            }

            // Capturar el frame actual del canvas principal (incluye video+efectos+tramas)
            tempCtx.drawImage(canvasEl, 0, 0);

            return tempCanvas.toDataURL(`image/${format === 'jpeg' ? 'jpeg' : 'png'}`, quality || 0.92);
        };

        // ─── PNG ───
        const pngBtn = document.getElementById('btn-export-png');
        if (pngBtn) {
            pngBtn.addEventListener('click', () => {
                const dataUrl = captureFrame('png');
                if (!dataUrl) return;
                downloadBlob(dataUrlToBlob(dataUrl),
                    `latente-captura-${Date.now()}.png`);
                setStatus('✅ PNG exportado');
            });
        }

        // ─── JPG ───
        const jpgBtn = document.getElementById('btn-export-jpg');
        if (jpgBtn) {
            jpgBtn.addEventListener('click', () => {
                const dataUrl = captureFrame('jpeg', 0.9);
                if (!dataUrl) return;
                downloadBlob(dataUrlToBlob(dataUrl),
                    `latente-captura-${Date.now()}.jpg`);
                setStatus('✅ JPG exportado');
            });
        }

        // ─── MP4 (MediaRecorder toggle) ───
        const mp4Btn = document.getElementById('btn-export-mp4');
        if (mp4Btn) {
            let mediaRecorder = null;
            let recordingChunks = [];
            let isRecording = false;

            const resetMp4Btn = () => {
                isRecording = false;
                mp4Btn.classList.remove('recording');
                mp4Btn.querySelector('.export-format-name').textContent = 'MP4';
                mp4Btn.querySelector('.export-format-desc').textContent = 'Grabar secuencia';
            };

            mp4Btn.addEventListener('click', () => {
                if (!isRecording) {
                    try {
                        const stream = canvasEl.captureStream(30);

                        // Validar que el stream tenga tracks de video
                        if (!stream || !stream.getVideoTracks || !stream.getVideoTracks().length) {
                            setStatus('❌ El canvas no está generando video', true);
                            return;
                        }

                        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
                            ? 'video/webm;codecs=vp9'
                            : 'video/webm';

                        // Verificar que al menos el codec base sea soportado
                        if (!MediaRecorder.isTypeSupported(mimeType)) {
                            setStatus('❌ Tu navegador no soporta grabación de video', true);
                            return;
                        }

                        mediaRecorder = new MediaRecorder(stream, { mimeType });
                        recordingChunks = [];

                        mediaRecorder.ondataavailable = (e) => {
                            if (e.data.size > 0) recordingChunks.push(e.data);
                        };

                        mediaRecorder.onstop = () => {
                            try {
                                if (recordingChunks.length === 0) {
                                    setStatus('❌ No se grabó ningún dato', true);
                                    return;
                                }
                                const blob = new Blob(recordingChunks, { type: 'video/webm' });
                                downloadBlob(blob, `latente-secuencia-${Date.now()}.webm`);
                                setStatus('✅ Video exportado');
                            } catch (e) {
                                setStatus('❌ Error al generar el video: ' + e.message, true);
                            }
                        };

                        mediaRecorder.onerror = () => {
                            setStatus('❌ Error durante la grabación', true);
                            resetMp4Btn();
                        };

                        mediaRecorder.start(1000);
                        isRecording = true;
                        mp4Btn.classList.add('recording');
                        mp4Btn.querySelector('.export-format-name').textContent = 'Grabando';
                        mp4Btn.querySelector('.export-format-desc').textContent = 'Tocar para detener';
                        setStatus('⏺ Grabando...');
                        console.log('🔴 MP4 grabación iniciada');
                    } catch (e) {
                        setStatus('❌ Error al iniciar grabación: ' + e.message, true);
                        resetMp4Btn();
                    }
                } else {
                    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                        try {
                            // Forzar último fragmento de datos antes de detener
                            mediaRecorder.requestData();
                        } catch (_) { /* ignore */ }
                        mediaRecorder.stop();
                    }
                    resetMp4Btn();
                    console.log('⏹ MP4 grabación detenida');
                }
            });
        }

        // ─── GIF ───
        const gifBtn = document.getElementById('btn-export-gif');
        if (gifBtn) {
            let gifFrames = [];
            let gifInterval = null;
            let isGrabbingGif = false;
            let gifImageW = 0;
            let gifImageH = 0;

            gifBtn.addEventListener('click', () => {
                if (!isGrabbingGif) {
                    if (!canvasEl || canvasEl.width === 0) {
                        setStatus('❌ No hay contenido para exportar', true);
                        return;
                    }

                    isGrabbingGif = true;
                    gifFrames = [];
                    gifImageW = Math.min(canvasEl.width, 640);
                    gifImageH = Math.round(gifImageW * (canvasEl.height / canvasEl.width));

                    gifBtn.classList.add('grabbing-gif');
                    gifBtn.querySelector('.export-format-name').textContent = 'Capturando';
                    gifBtn.querySelector('.export-format-desc').textContent = `2.5s · ${Math.floor(2500 / 100)} frames`;
                    setStatus('⏺ Capturando fotogramas para GIF...');

                    const DURATION = 2500; // ms
                    const INTERVAL = 100;  // ms
                    let elapsed = 0;

                    gifInterval = setInterval(() => {
                        if (elapsed >= DURATION) {
                            clearInterval(gifInterval);
                            gifInterval = null;
                            this._exportGif(gifFrames, gifImageW, gifImageH,
                                setStatus, downloadBlob, gifBtn);
                            isGrabbingGif = false;
                            return;
                        }

                        const tempCanvas = document.createElement('canvas');
                        tempCanvas.width = gifImageW;
                        tempCanvas.height = gifImageH;
                        const tempCtx = tempCanvas.getContext('2d');
                        tempCtx.fillStyle = '#000000';
                        tempCtx.fillRect(0, 0, gifImageW, gifImageH);
                        tempCtx.drawImage(canvasEl, 0, 0, gifImageW, gifImageH);
                        gifFrames.push(tempCanvas.toDataURL('image/png'));

                        elapsed += INTERVAL;
                        const remaining = ((DURATION - elapsed) / 1000).toFixed(1);
                        gifBtn.querySelector('.export-format-desc').textContent =
                            `${gifFrames.length} frames · ${remaining}s`;
                    }, INTERVAL);
                } else {
                    if (gifInterval) {
                        clearInterval(gifInterval);
                        gifInterval = null;
                    }
                    isGrabbingGif = false;
                    gifBtn.classList.remove('grabbing-gif');
                    gifBtn.querySelector('.export-format-name').textContent = 'GIF';
                    gifBtn.querySelector('.export-format-desc').textContent = 'Animación en bucle';
                    gifFrames = [];
                    setStatus('❌ Captura cancelada', true);
                }
            });
        }
    },

    // ── Exportar GIF usando gif.js desde CDN ──
    _exportGif(frames, imgW, imgH, setStatus, downloadBlob, gifBtn) {
        gifBtn.classList.remove('grabbing-gif');
        gifBtn.querySelector('.export-format-name').textContent = 'GIF';
        gifBtn.querySelector('.export-format-desc').textContent = 'Procesando...';
        setStatus('⏳ Procesando GIF...');

        // Reset UI helper
        const resetUI = (msg, isError) => {
            gifBtn.querySelector('.export-format-desc').textContent = 'Animación en bucle';
            setStatus(msg, isError);
        };

        // Evitar múltiples exportaciones (race condition timeout vs onload)
        let completed = false;

        // Timeout de seguridad: si el CDN no responde o el render se cuelga
        let timeoutId = setTimeout(() => {
            if (completed) return;
            completed = true;
            timeoutId = null;
            resetUI('❌ Tiempo de espera agotado — exportando frame estático', true);
            this._encodeGifFallback(frames, downloadBlob, gifBtn, setStatus);
        }, 8000);

        const safeRender = () => {
            if (completed) return;
            completed = true;
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            this._renderGif(frames, imgW, imgH, setStatus, downloadBlob, gifBtn, resetUI);
        };

        // Evitar acumular múltiples script tags
        if (!document.querySelector('script[src*="gif.js@0.2.0"]')) {
            const script = document.createElement('script');
            // Setear onload/onerror ANTES de appendChild para evitar race condition con caché
            script.onload = safeRender;
            script.onerror = () => {
                if (completed) return;
                completed = true;
                if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
                resetUI('⚠️ CDN no disponible — exportando frame estático', false);
                this._encodeGifFallback(frames, downloadBlob, gifBtn, setStatus);
            };
            script.src = 'https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.js';
            document.head.appendChild(script);
        } else {
            safeRender();
        }
    },

    _renderGif(frames, imgW, imgH, setStatus, downloadBlob, gifBtn, resetUI) {
        try {
            if (typeof GIF === 'undefined') {
                resetUI('⚠️ Librería GIF no disponible — exportando frame estático', false);
                this._encodeGifFallback(frames, downloadBlob, gifBtn, setStatus);
                return;
            }

            // workers: 0 para evitar Web Workers que fallan con CDN antiguo
            const gif = new GIF({
                workers: 0,
                quality: 10,
                width: imgW || 320,
                height: imgH || 240
            });

            let loaded = 0;
            const totalFrames = frames.length;

            frames.forEach((dataUrl) => {
                const img = new Image();
                img.onload = () => {
                    gif.addFrame(img, { delay: 100, copy: true });
                    loaded++;
                    if (loaded === totalFrames) {
                        gif.on('progress', (pct) => {
                            gifBtn.querySelector('.export-format-desc').textContent =
                                `Codificando ${Math.round(pct * 100)}%`;
                        });
                        gif.on('finished', (blob) => {
                            downloadBlob(blob, `latente-loop-${Date.now()}.gif`);
                            gifBtn.querySelector('.export-format-desc').textContent =
                                'Animación en bucle';
                            setStatus('✅ GIF exportado');
                        });
                        gif.render();
                    }
                };
                img.onerror = () => {
                    loaded++;
                    if (loaded === totalFrames) {
                        resetUI('❌ Error al cargar fotogramas', true);
                    }
                };
                img.src = dataUrl;
            });
        } catch (e) {
            resetUI('❌ Error: ' + e.message, true);
        }
    },

    // ── Fallback: codificador GIF inline mínimo ──
    _encodeGifFallback(frames, downloadBlob, gifBtn, setStatus) {
        try {
            // Reducir frames a la mitad para mantener el tamaño manejable
            const reduced = frames.filter((_, i) => i % 2 === 0);
            const firstCanvas = document.createElement('canvas');
            firstCanvas.width = 320;
            firstCanvas.height = 240;
            const firstCtx = firstCanvas.getContext('2d');
            firstCtx.fillStyle = '#000000';
            firstCtx.fillRect(0, 0, 320, 240);

            // Cargar primer frame
            const img = new Image();
            img.onload = () => {
                firstCtx.drawImage(img, 0, 0, 320, 240);
                const dataUrl = firstCanvas.toDataURL('image/gif');
                const byteString = atob(dataUrl.split(',')[1]);
                const ab = new ArrayBuffer(byteString.length);
                const ia = new Uint8Array(ab);
                for (let i = 0; i < byteString.length; i++) {
                    ia[i] = byteString.charCodeAt(i);
                }
                downloadBlob(new Blob([ab], { type: 'image/gif' }),
                    `latente-frame-${Date.now()}.gif`);
                gifBtn.querySelector('.export-format-desc').textContent = 'Animación en bucle';
                setStatus('✅ Frame exportado (GIF completo requiere conexión)');
            };
            img.onerror = () => {
                setStatus('❌ Error en codificación alternativa', true);
                gifBtn.querySelector('.export-format-desc').textContent = 'Animación en bucle';
            };
            img.src = reduced[0];
        } catch (e) {
            setStatus('❌ Error: ' + e.message, true);
            gifBtn.querySelector('.export-format-desc').textContent = 'Animación en bucle';
        }
    }
};
