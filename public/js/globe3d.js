// KryptaPay 3D Interactive Neon Globe Engine (Vanilla 3D Canvas Projection - 60 FPS)
class KryptaGlobe3D {
  constructor(canvasId, options = {}) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.options = Object.assign({
      radius: 170,
      dotCount: 420,
      autoRotateSpeed: 0.007,
      glowColor: '#a855f7',
      ringColor: '#c084fc',
      activeBuyers: 45
    }, options);

    this.dots = [];
    this.buyers = [];
    this.rotationX = 0.25;
    this.rotationY = 0;
    this.isDragging = false;
    this.prevMouseX = 0;
    this.prevMouseY = 0;

    this.init();
  }

  init() {
    this.resize();
    window.addEventListener('resize', () => this.resize());

    // Gerar pontos da esfera 3D (Fibonacci Sphere Algorithm para distribuição uniforme)
    const phi = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < this.options.dotCount; i++) {
      const y = 1 - (i / (this.options.dotCount - 1)) * 2;
      const radiusAtY = Math.sqrt(1 - y * y);
      const theta = phi * i;
      const x = Math.cos(theta) * radiusAtY;
      const z = Math.sin(theta) * radiusAtY;
      this.dots.push({ x, y, z });
    }

    // Gerar pontos de clientes ativos ("bolinhas roxas intensas pulsando")
    for (let i = 0; i < this.options.activeBuyers; i++) {
      const dot = this.dots[Math.floor(Math.random() * this.dots.length)];
      this.buyers.push({
        x: dot.x,
        y: dot.y,
        z: dot.z,
        pulsePhase: Math.random() * Math.PI * 2,
        pulseSpeed: 0.04 + Math.random() * 0.04,
        amount: [24.90, 49.90, 97.00, 197.00, 497.00][Math.floor(Math.random() * 5)]
      });
    }

    // Eventos de arraste com mouse e touch no celular (rotação 3D livre)
    this.setupInteractivity();
    this.animate();
  }

  resize() {
    if (!this.canvas) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.width = rect.width || 600;
    this.height = this.canvas.height || 450;
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.scale(dpr, dpr);
    this.radius = Math.min(this.width, this.height) * 0.38;
  }

  setupInteractivity() {
    const onStart = (x, y) => {
      this.isDragging = true;
      this.prevMouseX = x;
      this.prevMouseY = y;
    };

    const onMove = (x, y) => {
      if (!this.isDragging) return;
      const deltaX = x - this.prevMouseX;
      const deltaY = y - this.prevMouseY;
      this.rotationY += deltaX * 0.005;
      this.rotationX -= deltaY * 0.005;
      this.prevMouseX = x;
      this.prevMouseY = y;
    };

    const onEnd = () => { this.isDragging = false; };

    this.canvas.addEventListener('mousedown', (e) => onStart(e.clientX, e.clientY));
    window.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
    window.addEventListener('mouseup', onEnd);

    this.canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length > 0) onStart(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) onMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    window.addEventListener('touchend', onEnd);
  }

  animate() {
    if (!this.canvas) return;
    if (!this.isDragging) {
      this.rotationY += this.options.autoRotateSpeed;
    }

    this.render();
    requestAnimationFrame(() => this.animate());
  }

  render() {
    const { ctx, width, height, radius, rotationX, rotationY } = this;
    ctx.clearRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;

    // 1. Brilho Ambiente Central
    const radialGlow = ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius * 1.3);
    radialGlow.addColorStop(0, 'rgba(139, 92, 246, 0.25)');
    radialGlow.addColorStop(0.6, 'rgba(124, 58, 237, 0.12)');
    radialGlow.addColorStop(1, 'rgba(6, 6, 9, 0)');
    ctx.fillStyle = radialGlow;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.3, 0, Math.PI * 2);
    ctx.fill();

    // 2. Anel Orbital Neon em Volta do Globo (Exatamente como na Logomarca Oficial)
    this.drawOrbitalRing(cx, cy, radius);

    // Matriz de Rotação 3D
    const cosY = Math.cos(rotationY);
    const sinY = Math.sin(rotationY);
    const cosX = Math.cos(rotationX);
    const sinX = Math.sin(rotationX);

    // 3. Projetar e ordenar os pontos da Terra
    const projectedDots = [];

    for (const p of this.dots) {
      // Rotação no eixo Y
      const x1 = p.x * cosY - p.z * sinY;
      const z1 = p.z * cosY + p.x * sinY;
      // Rotação no eixo X
      const y2 = p.y * cosX - z1 * sinX;
      const z2 = z1 * cosX + p.y * sinX;

      const scale = 280 / (280 + z2 * radius);
      const px = cx + x1 * radius;
      const py = cy + y2 * radius;
      const alpha = (z2 + 1) / 2; // Profundidade

      projectedDots.push({ px, py, z2, alpha, scale });
    }

    // Desenhar pontos da malha do mapa mundi
    for (const d of projectedDots) {
      if (d.z2 < -0.3) continue; // Ocultar lado posterior
      ctx.beginPath();
      ctx.arc(d.px, d.py, Math.max(1, 1.8 * d.scale), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(168, 85, 247, ${Math.min(1, d.alpha * 0.75)})`;
      ctx.fill();
    }

    // 4. Desenhar os Clientes Ativos ("Bolinhas Roxas Pulsantes em Tempo Real")
    for (const b of this.buyers) {
      b.pulsePhase += b.pulseSpeed;
      const pulseScale = 1 + Math.sin(b.pulsePhase) * 0.45;

      const x1 = b.x * cosY - b.z * sinY;
      const z1 = b.z * cosY + b.x * sinY;
      const y2 = b.y * cosX - z1 * sinX;
      const z2 = z1 * cosX + b.y * sinX;

      if (z2 > -0.2) {
        const px = cx + x1 * radius;
        const py = cy + y2 * radius;
        const alpha = Math.min(1, (z2 + 1) * 0.85);

        // Halo de pulso
        ctx.beginPath();
        ctx.arc(px, py, 9 * pulseScale, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(192, 132, 252, ${0.35 * alpha})`;
        ctx.fill();

        // Ponto central vibrante
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.shadowColor = '#c084fc';
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.shadowBlur = 0; // reset
      }
    }
  }

  // Desenhar Anel Orbital Iluminado 3D (Inspirado na logo KryptaPay)
  drawOrbitalRing(cx, cy, radius) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.35); // Ângulo inclinado elíptico da logo

    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 1.45, radius * 0.38, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(192, 132, 252, 0.45)';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#a855f7';
    ctx.shadowBlur = 18;
    ctx.stroke();

    // Brilho intenso no arco frontal
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 1.45, radius * 0.38, 0, Math.PI * 0.2, Math.PI * 0.85);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.restore();
  }
}

window.KryptaGlobe3D = KryptaGlobe3D;
