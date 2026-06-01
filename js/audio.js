// js/audio.js
const AudioInput = {
    audioContext: null,
    analyser: null,
    dataArray: null,
    source: null,
    isInitialized: false,

    // Soporte para <audio> element (reproducción de presets)
    audioElement: null,

    // Soporte para análisis desde BufferSource (separado del playback)
    analysisSource: null,
    audioBuffer: null,

    // Soporte para archivos de audio subidos (BufferSource → playback + análisis)
    bufferSource: null,
    isPlaying: false,

    async init() {
        if (this.isInitialized) return true;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.source = this.audioContext.createMediaStreamSource(stream);
            this.source.connect(this.analyser);
            this.analyser.fftSize = 256;
            const bufferLength = this.analyser.frequencyBinCount;
            this.dataArray = new Uint8Array(bufferLength);
            this.isInitialized = true;
            console.log("Micrófono inicializado.");
            return true;
        } catch (error) {
            console.error("Error al acceder al micrófono:", error);
            return false;
        }
    },

    // Inicializa el <audio> oculto para reproducción de presets
    initAudioElement(src) {
        if (!this.audioElement) {
            this.audioElement = document.getElementById('bg-audio');
            if (!this.audioElement) {
                this.audioElement = document.createElement('audio');
                this.audioElement.id = 'bg-audio';
                this.audioElement.setAttribute('preload', 'auto');
                this.audioElement.style.display = 'none';
                document.body.appendChild(this.audioElement);
            }
        }

        if (src) {
            this.audioElement.src = src;
            this.audioElement.load();
            this.audioElement.loop = true;
            this._playAudioElement();
            // También cargar fuente de análisis para el visualizador
            this._loadAnalysisSource(src);
        }
    },

    _playAudioElement() {
        if (!this.audioElement) return;
        const playPromise = this.audioElement.play();
        if (playPromise !== undefined) {
            playPromise
                .then(() => {
                    this.isPlaying = true;
                    this.isInitialized = true;
                    // Reanudar AudioContext para que el análisis siga funcionando
                    if (this.audioContext && this.audioContext.state === 'suspended') {
                        this.audioContext.resume();
                    }
                })
                .catch((err) => {
                    console.log('Autoplay bloqueado, esperando interacción:', err.message);
                });
        }
    },

    // Carga un preset: reproduce desde <audio> y analiza desde BufferSource
    loadPreset(url) {
        // Reproducir sonido desde <audio> element
        if (this.audioElement) {
            if (this.bufferSource) {
                try { this.bufferSource.stop(); } catch (e) {}
                this.bufferSource.disconnect();
                this.bufferSource = null;
            }
            this.audioElement.pause();
            this.audioElement.src = url;
            this.audioElement.load();
            this.audioElement.loop = true;
            this._playAudioElement();
        } else {
            this.initAudioElement(url);
        }

        // Analizar desde BufferSource (separado, sin conectar a destination)
        this._loadAnalysisSource(url);
    },

    // Crea un BufferSource para análisis (solo conectado al analyser, sin sonido)
    _loadAnalysisSource(url) {
        this._ensureAudioContext();

        // Fetch para obtener el buffer (si falla, el análisis devuelve 0)
        fetch(url)
            .then(r => {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.arrayBuffer();
            })
            .then(buf => this.audioContext.decodeAudioData(buf))
            .then(buffer => {
                this.audioBuffer = buffer;
                if (this.analysisSource) {
                    try { this.analysisSource.stop(); } catch (e) {}
                    this.analysisSource.disconnect();
                }
                this.analysisSource = this.audioContext.createBufferSource();
                this.analysisSource.buffer = buffer;
                this.analysisSource.loop = true;
                this.analysisSource.connect(this.analyser);
                // NO conectar analyser a destination → solo análisis, sin sonido
                this.analysisSource.start(0);
            })
            .catch(err => {
                // Falló fetch o decode → el análisis se queda en 0 (visualizador sin reacción)
                console.log('Análisis de audio no disponible (fetch puede fallar con file://):', err.message);
            });
    },

    // Carga un archivo de audio subido por el usuario (BufferSource con sonido)
    loadFile(file) {
        this._ensureAudioContext();

        // Pausar audio element si estaba sonando
        if (this.audioElement) {
            this.audioElement.pause();
        }
        // Detener analysis source
        if (this.analysisSource) {
            try { this.analysisSource.stop(); } catch (e) {}
            this.analysisSource.disconnect();
            this.analysisSource = null;
        }

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const audioData = event.target.result;
                this.audioBuffer = await this.audioContext.decodeAudioData(audioData);

                if (this.bufferSource) {
                    try { this.bufferSource.stop(); } catch (e) {}
                    this.bufferSource.disconnect();
                }

                // Crear fuente para reproducción CON sonido (conecta analyser→destination)
                this.bufferSource = this.audioContext.createBufferSource();
                this.bufferSource.buffer = this.audioBuffer;
                this.bufferSource.loop = true;
                this.bufferSource.connect(this.analyser);
                this.analyser.connect(this.audioContext.destination);
                this.bufferSource.start(0);
                // El bufferSource alimenta el analyser (playback + análisis, no duplicar)

                this.isPlaying = true;
                this.isInitialized = true;
                console.log("Audio reproduciendo:", file.name);
                document.dispatchEvent(new CustomEvent('audiostart'));
            } catch (error) {
                console.error("Error decodificando audio:", error);
                alert("No se pudo decodificar el archivo de audio. Formatos soportados: MP3, WAV, OGG, M4A.");
            }
        };
        reader.readAsArrayBuffer(file);
    },

    _ensureAudioContext() {
        if (!this.audioContext) {
            try {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            } catch (e) {
                console.error('Error creando AudioContext:', e);
                return;
            }
        }
        if (!this.analyser) {
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        }
        if (window.Engine && Engine.settings) {
            this.analyser.smoothingTimeConstant = Engine.settings.audioSmoothing || 0.8;
        }
    },

    pause() {
        if (this.audioElement && !this.audioElement.paused) {
            this.audioElement.pause();
            this.isPlaying = false;
            // Suspender el AudioContext para no desperdiciar CPU
            if (this.audioContext && this.audioContext.state === 'running') {
                this.audioContext.suspend();
            }
        } else if (this.bufferSource && this.audioContext && this.audioContext.state === 'running') {
            this.audioContext.suspend();
            this.isPlaying = false;
        }
    },

    resume() {
        if (this.audioElement && this.audioElement.paused && this.audioElement.src) {
            this._playAudioElement();
        } else if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
            this.isPlaying = true;
        }
    },

    stop() {
        if (this.audioElement) {
            this.audioElement.pause();
            this.audioElement.currentTime = 0;
        }
        if (this.bufferSource) {
            try { this.bufferSource.stop(); } catch (e) {}
            this.bufferSource.disconnect();
            this.bufferSource = null;
        }
        this.isPlaying = false;
    },

    restartPlayback() {
        if (this.audioElement && this.audioElement.src) {
            this.audioElement.currentTime = 0;
            this._playAudioElement();
            return;
        }
        if (!this.audioContext || !this.audioBuffer) return;
        if (this.bufferSource) {
            try { this.bufferSource.stop(); } catch (e) {}
            this.bufferSource.disconnect();
        }
        this.bufferSource = this.audioContext.createBufferSource();
        this.bufferSource.buffer = this.audioBuffer;
        this.bufferSource.loop = true;
        this.bufferSource.connect(this.analyser);
        this.analyser.connect(this.audioContext.destination);
        this.bufferSource.start(0);
        this.isPlaying = true;
        this.isInitialized = true;
    },

    getIntensity(band) {
        if (!this.analyser || !this.dataArray) return 0;
        try {
            this.analyser.getByteFrequencyData(this.dataArray);
        } catch (e) {
            return 0;
        }

        const len = this.dataArray.length;
        let start = 0, end = len;

        switch (band) {
            case 'bass':   start = 0;   end = Math.min(2, len); break;
            case 'mid':    start = 2;   end = Math.min(24, len); break;
            case 'treble': start = 24;  end = len; break;
            default:       start = 0;   end = len; break;
        }

        let sum = 0, count = 0;
        for (let i = start; i < end; i++) {
            sum += this.dataArray[i];
            count++;
        }
        const average = count > 0 ? sum / count : 0;
        return average / 255;
    }
};
