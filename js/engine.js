// js/engine.js

// FORMAS: definidas directamente en código
const SHAPES = {
    cruz:      `<path d="M-6,0 L6,0 M0,-6 L0,6" stroke-width="2.5"/>`,
    estrella:  `<path d="M0,-9 L2.5,-2.5 L9,0 L2.5,2.5 L0,9 L-2.5,2.5 L-9,0 L-2.5,-2.5 Z" stroke-width="1.2"/>`,
    flor:      `<path d="M0,-8 L6.5,6 L-6.5,6 Z" stroke-width="1.5"/>`,
    sol:       `<rect x="-6" y="-6" width="12" height="12" stroke-width="2.5"/>`,
    puntos:    `<circle cx="0" cy="-5.5" r="2.2"/><circle cx="0" cy="5.5" r="2.2"/><circle cx="-5.5" cy="0" r="2.2"/><circle cx="5.5" cy="0" r="2.2"/>`,
    petalo:    `<path d="M0,8 C-7,3 -7,-3 0,-8 C7,-3 7,3 0,8 Z" stroke-width="1.2"/>`,
    circulo:   `<circle cx="0" cy="0" r="6"/>`,
    asterisco: `<path d="M0,-8 L0,8 M-7,-4 L7,4 M-7,4 L7,-4" stroke-width="2"/>`,
};

const Engine = {
    canvas: null,
    settings: {},
    mouse: { x: 0, y: 0 },
    time: 0,
    cells: [],
    currentSVGContent: SHAPES.cruz,

    init(canvasElement, currentSettings) {
        this.canvas = canvasElement;
        this.settings = currentSettings;
        this.applyBg(this.settings.bgMode || 'solid');
        this.buildGrid();
        window.addEventListener('resize', () => this.buildGrid());
    },

    applyBg(mode) {
        const videoEl = document.getElementById('bg-video');

        if (mode === 'solid') {
            if (videoEl) { videoEl.style.display = 'none'; videoEl.pause(); }
            this.canvas.style.background = this.settings.bgColor;
            this.canvas.style.backgroundImage = 'none';
        } else if (mode === 'gradient') {
            if (videoEl) { videoEl.style.display = 'none'; videoEl.pause(); }
            const colors = this.settings.gradColors || ['#222222','#555555','#888888','#cccccc'];
            this.canvas.style.background = `linear-gradient(135deg, ${colors[0]} 0%, ${colors[1]} 33%, ${colors[2]} 66%, ${colors[3]} 100%)`;
        } else if (mode === 'image') {
            if (videoEl) { videoEl.style.display = 'none'; videoEl.pause(); }
            this.canvas.style.backgroundImage = this.canvas.style.backgroundImage || 'none';
        } else if (mode === 'preset') {
            if (videoEl) { videoEl.style.display = 'none'; videoEl.pause(); }
            this.canvas.style.backgroundImage = 'none';
        } else if (mode === 'video') {
            this.canvas.style.background = 'transparent';
            this.canvas.style.backgroundImage = 'none';
            if (videoEl) {
                if (videoEl.src && videoEl.src !== window.location.href) {
                    videoEl.style.display = 'block';
                    videoEl.play().catch(() => {});
                }
            }
        }
    },

    applyBgImage(dataUrl) {
        this.canvas.style.background = `url(${dataUrl}) center / cover no-repeat`;
        const videoEl = document.getElementById('bg-video');
        if (videoEl) { videoEl.style.display = 'none'; videoEl.pause(); }
    },

    applyBgVideo(url) {
        const videoEl = document.getElementById('bg-video');
        if (!videoEl) return;
        videoEl.src = url;
        videoEl.style.display = 'block';
        videoEl.play().catch(() => {});
        this.canvas.style.background = 'transparent';
        this.canvas.style.backgroundImage = 'none';
    },

    clearBgImage() {
        this.canvas.style.backgroundImage = 'none';
        this.canvas.style.background = this.settings.bgColor;
    },

    buildGrid() {
        this.canvas.innerHTML = '';
        this.cells = [];

        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;
        const densityX = this.settings.densityX || 15;
        const densityY = this.settings.densityY || 15;
        const offsetX = this.settings.offsetX || 0;
        const offsetY = this.settings.offsetY || 0;
        const inversion = this.settings.inversion || 'normal';

        const cellWidth = width / densityX;
        const cellHeight = height / densityY;

        // <defs> con el módulo SVG
        const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        defs.innerHTML = `<g id="modulo-svg">${this.currentSVGContent}</g>`;
        this.canvas.appendChild(defs);

        for (let r = 0; r < densityY; r++) {
            for (let c = 0; c < densityX; c++) {
                // Desfase intercalado (patrón ladrillo / panal)
                const xOff = (r % 2 === 1) ? cellWidth * offsetX : 0;
                const yOff = (c % 2 === 1) ? cellHeight * offsetY : 0;

                const x = c * cellWidth + cellWidth / 2 + xOff;
                const y = r * cellHeight + cellHeight / 2 + yOff;

                const group = document.createElementNS("http://www.w3.org/2000/svg", "g");

                // Mirror / inversión en celdas alternadas
                let mirrorX = 1, mirrorY = 1;
                const isAlternate = (r + c) % 2 === 1;
                if (inversion === 'mirror-h' && isAlternate) mirrorX = -1;
                if (inversion === 'mirror-v' && isAlternate) mirrorY = -1;
                if (inversion === 'mirror-both' && isAlternate) { mirrorX = -1; mirrorY = -1; }

                if (mirrorX === 1 && mirrorY === 1) {
                    group.setAttribute("transform", `translate(${x}, ${y})`);
                } else {
                    group.setAttribute("transform", `translate(${x}, ${y}) scale(${mirrorX}, ${mirrorY})`);
                }

                // Módulo: fill y stroke heredados del <use>
                const useTag = document.createElementNS("http://www.w3.org/2000/svg", "use");
                useTag.setAttribute("href", "#modulo-svg");
                useTag.style.transformOrigin = "center";
                useTag.setAttribute("fill", this.settings.pixelColor);
                useTag.setAttribute("stroke", this.settings.pixelColor);
                group.appendChild(useTag);

                this.canvas.appendChild(group);

                this.cells.push({
                    element: group,
                    useTag: useTag,
                    baseX: x,
                    baseY: y,
                    col: c,
                    row: r
                });
            }
        }
    },

    changeModule(svgString) {
        this.currentSVGContent = svgString;
        this.buildGrid();
    },

    update(audioIntensity) {
        const ai = this.settings.audioIntensity || 1.0;
        const modTargets = this.settings.modTargets || {};
        const isAudioActive = audioIntensity > 0.01;

        // Audio modulation: Velocidad (modulación global del time step)
        let speedMul = 1;
        if (isAudioActive && modTargets.speed) {
            speedMul = (1 + audioIntensity * ai * 2);
        }
        this.time += 0.02 * this.settings.speed * speedMul;

        const pixelColor = this.settings.pixelColor || '#222222';
        const animationMode = this.settings.animationMode || 'static';
        const baseScale = this.settings.baseScale || 1.0;

        this.cells.forEach(cell => {
            let factor = this.computeFactor(animationMode, cell);

            const rawScale = this.settings.scaleMin + factor * (this.settings.scaleMax - this.settings.scaleMin);
            let globalScale = rawScale * baseScale;

            let stretchX = this.settings.stretchX || 1.0;
            let stretchY = this.settings.stretchY || 1.0;

            // Audio modulation según destinos
            if (isAudioActive) {
                if (modTargets.scale) {
                    globalScale *= (1 + audioIntensity * ai * 2);
                }
                if (modTargets.stretchX) {
                    stretchX *= (1 + audioIntensity * ai * 0.5);
                }
                if (modTargets.stretchY) {
                    stretchY *= (1 + audioIntensity * ai * 0.5);
                }
            }

            const swap = this.settings.swapAxes || false;
            let sx = globalScale * stretchX;
            let sy = globalScale * stretchY;
            if (swap) { [sx, sy] = [sy, sx]; }

            this.updatePatternCell(cell, sx, sy, factor, pixelColor);
        });
    },

    computeFactor(mode, cell) {
        switch (mode) {
            case 'static':
                return 0.5;
            case 'random':
                return cell.randomSeed ?? (cell.randomSeed = Math.random());
            case 'wave':
                return (Math.sin(this.time + cell.baseX * 0.005 + cell.baseY * 0.005) + 1) / 2;
            case 'interference': {
                const w1 = Math.sin(this.time + cell.baseX * 0.008);
                const w2 = Math.cos(this.time * 0.7 + cell.baseY * 0.012);
                return (w1 * 0.5 + w2 * 0.5 + 1) / 2;
            }
            case 'noise': {
                const n = Math.sin(cell.baseX * 0.01 + cell.baseY * 0.015 + this.time * 2) * 10000;
                return n - Math.floor(n);
            }
            case 'cursor': {
                const dx = this.mouse.x - cell.baseX;
                const dy = this.mouse.y - cell.baseY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                return Math.max(0, 1 - dist / 300);
            }
            default:
                return 0.5;
        }
    },

    updatePatternCell(cell, sx, sy, factor, pixelColor) {
        const rotacion = factor * 360;
        const useTag = cell.useTag || cell.element.querySelector('use');

        if (useTag) {
            if (this.settings.moduleColorMode === 'gradient' && this.settings.gradColors) {
                const gradColor = this.lerpGradient(factor, this.settings.gradColors);
                useTag.setAttribute('fill', gradColor);
                useTag.setAttribute('stroke', gradColor);
            } else {
                useTag.setAttribute('fill', pixelColor);
                useTag.setAttribute('stroke', pixelColor);
            }
        }

        // Actualizar transform: mantener mirror si ya está en el group
        const currentTrans = cell.element.getAttribute('transform') || '';
        const mirrorMatch = currentTrans.match(/scale\((-?\d+),?\s*(-?\d+)\)/);
        const mirrorStr = mirrorMatch
            ? ` scale(${mirrorMatch[1]}, ${mirrorMatch[2]})`
            : '';

        cell.element.setAttribute("transform",
            `translate(${cell.baseX}, ${cell.baseY})${mirrorStr} scale(${sx}, ${sy}) rotate(${rotacion})`
        );
    },

    lerpColor(c1, c2, t) {
        const r1 = parseInt(c1.slice(1,3), 16);
        const g1 = parseInt(c1.slice(3,5), 16);
        const b1 = parseInt(c1.slice(5,7), 16);
        const r2 = parseInt(c2.slice(1,3), 16);
        const g2 = parseInt(c2.slice(3,5), 16);
        const b2 = parseInt(c2.slice(5,7), 16);
        const r = Math.round(r1 + (r2 - r1) * t);
        const g = Math.round(g1 + (g2 - g1) * t);
        const b = Math.round(b1 + (b2 - b1) * t);
        return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
    },

    lerpGradient(t, colors) {
        const clampedT = Math.max(0, Math.min(1, t));
        const segmentCount = colors.length - 1;
        const seg = Math.min(Math.floor(clampedT * segmentCount), segmentCount - 1);
        const localT = (clampedT * segmentCount) - seg;
        return this.lerpColor(colors[seg], colors[seg + 1], localT);
    }
};
