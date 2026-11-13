// KryptaPay Official 3D Neon Earth Globe Engine (Foto Oficial + Pontos Roxos Delicados)
class KryptaGlobe3D {
  constructor(canvasId, options = {}) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.options = Object.assign({
      radius: 200,
      autoRotateSpeed: 0.006,
      activeDotsCount: 22 // Poucos pontinhos dentro da bola
    }, options);

    this.rotationY = 0;
    this.rotationX = 0.22;
    this.isDragging = false;
    this.prevMouseX = 0;
    this.prevMouseY = 0;

    // Carregar a foto oficial do mapa mundi
    this.globeImg = new Image();
    this.globeImg.src = '/assets/globo-oficial.jpg';
    this.imgLoaded = false;
    this.globeImg.onload = () => {
      this.imgLoaded = true;
    };

    // Gerar poucos pontinhos roxos delicados dentro da esfera
    this.purpleNodes = [];
    for (let i = 0; i < this.options.activeDotsCount; i++) {
      // Distribuição esférica
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      this.purpleNodes.push({
        x: Math.sin(phi) * Math.cos(theta),
        y: Math.cos(phi),
        z: Math.sin(phi) * Math.sin(theta),
        phase: Math.random() * Math.PI * 2,
        speed: 0.03 + Math.random() * 0.03,
        size: Math.random() * 1.2 + 1.8 // Bem pequenininho
      });
    }

    this.init();
  }

  init() {
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.setupInteractivity();
    this.animate();
  }

  resize() {
    if (!this.canvas) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.width = rect.width || 680;
    this.height = this.canvas.height || 480;
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.scale(dpr, dpr);
    this.radius = Math.min(this.width, this.height) * 0.42; // Bem grandão
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

    // 1. Brilho Ambiente Roxo Profundo no Fundo
    const bgGlow = ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius * 1.4);
    bgGlow.addColorStop(0, 'rgba(176, 38, 255, 0.28)');
    bgGlow.addColorStop(0.5, 'rgba(147, 51, 234, 0.15)');
    bgGlow.addColorStop(1, 'rgba(4, 1, 8, 0)');
    ctx.fillStyle = bgGlow;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.4, 0, Math.PI * 2);
    ctx.fill();

    // 2. Desenhar o Globo Base Oficial com Máscara Esférica
    if (this.imgLoaded) {
      ctx.save();
      // Criar máscara circular do mundo
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.clip();

      // Rotação da imagem simulada
      ctx.translate(cx, cy);
      ctx.rotate(this.rotationX * 0.1);
      ctx.drawImage(this.globeImg, -radius, -radius, radius * 2, radius * 2);

      // Sombra esfumada para efeito de esfera 3D
      const sphereShade = ctx.createRadialGradient(cx - radius * 0.35, cy - radius * 0.35, radius * 0.2, cx, cy, radius);
      sphereShade.addColorStop(0, 'rgba(255, 255, 255, 0.05)');
      sphereShade.addColorStop(0.7, 'rgba(10, 4, 20, 0.2)');
      sphereShade.addColorStop(1, 'rgba(4, 1, 8, 0.75)');
      ctx.fillStyle = sphereShade;
      ctx.fillRect(-radius, -radius, radius * 2, radius * 2);

      ctx.restore();
    }

    // 3. Desenhar os Múltiplos Anéis Orbitais Neon em Roxo (Igual à Foto Oficial)
    this.drawOfficialOrbitalRings(cx, cy, radius);

    // 4. Desenhar os POUCOS PONTINHOS ROXOS DELICADOS DENTRO DA BOLA
    const cosY = Math.cos(rotationY);
    const sinY = Math.sin(rotationY);
    const cosX = Math.cos(rotationX);
    const sinX = Math.sin(rotationX);

    for (const node of this.purpleNodes) {
      node.phase += node.speed;
      const pulse = Math.sin(node.phase);
      const alpha = 0.5 + pulse * 0.45; // Oscilação suave

      // Projeção 3D
      const x1 = node.x * cosY - node.z * sinY;
      const z1 = node.z * cosY + node.x * sinY;
      const y2 = node.y * cosX - z1 * sinX;
      const z2 = z1 * cosX + node.y * sinX;

      // Desenhar apenas na parte visível da esfera
      if (z2 > -0.15) {
        const px = cx + x1 * (radius * 0.95);
        const py = cy + y2 * (radius * 0.95);

        // Halo roxo neon oscilante
        ctx.beginPath();
        ctx.arc(px, py, node.size * 2.8, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(176, 38, 255, ${0.3 * alpha})`;
        ctx.fill();

        // Ponto central roxo vibrante bem pequenininho
        ctx.beginPath();
        ctx.arc(px, py, node.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(217, 70, 239, ${alpha})`;
        ctx.shadowColor = '#b026ff';
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
  }

  // Desenhar os múltiplos anéis orbitais com brilho roxo neon da foto oficial
  drawOfficialOrbitalRings(cx, cy, radius) {
    const { ctx } = this;
    const time = Date.now() * 0.001;

    ctx.save();
    ctx.translate(cx, cy);

    // Anel Principal Inclinado
    ctx.save();
    ctx.rotate(-0.35 + Math.sin(time * 0.5) * 0.03);
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 1.35, radius * 0.36, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(176, 38, 255, 0.55)';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#b026ff';
    ctx.shadowBlur = 20;
    ctx.stroke();

    // Destaque de brilho roxo vibrante no arco frontal
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 1.35, radius * 0.36, 0, Math.PI * 0.15, Math.PI * 0.85);
    ctx.strokeStyle = '#d946ef';
    ctx.lineWidth = 3.5;
    ctx.stroke();
    ctx.restore();

    // Segundo Anel Transversal
    ctx.save();
    ctx.rotate(0.45);
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 1.28, radius * 0.32, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(192, 132, 252, 0.35)';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.restore();

    // Terceiro Anel da Base (Reflexo de pedestal)
    ctx.save();
    ctx.translate(0, radius * 0.85);
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 1.15, radius * 0.22, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(176, 38, 255, 0.45)';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#b026ff';
    ctx.shadowBlur = 15;
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }
}

window.KryptaGlobe3D = KryptaGlobe3D;
