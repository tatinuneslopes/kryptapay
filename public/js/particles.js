// KryptaPay Neon Mouse Trail & Dotted Particle Engine
(function() {
  const canvas = document.createElement('canvas');
  canvas.id = 'kryptaMouseTrailCanvas';
  canvas.style.position = 'fixed';
  canvas.style.inset = '0';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '99999';
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  let width, height;
  const particles = [];

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  class TrailDot {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.vx = (Math.random() - 0.5) * 1.5;
      this.vy = (Math.random() - 0.5) * 1.5 - 0.5;
      this.size = Math.random() * 3.5 + 2;
      this.alpha = 1;
      this.decay = Math.random() * 0.025 + 0.018;
      // Tons de roxo neon das placas oficiais
      const colors = ['#b026ff', '#a855f7', '#c084fc', '#d946ef', '#ffffff'];
      this.color = colors[Math.floor(Math.random() * colors.length)];
    }

    update() {
      this.x += this.vx;
      this.y += this.vy;
      this.alpha -= this.decay;
      if (this.size > 0.4) this.size -= 0.04;
    }

    draw(ctx) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, this.alpha);
      ctx.fillStyle = this.color;
      ctx.shadowColor = '#b026ff';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function addDots(x, y, count = 3) {
    for (let i = 0; i < count; i++) {
      particles.push(new TrailDot(x, y));
    }
    if (particles.length > 90) particles.splice(0, particles.length - 90);
  }

  let mouseX = -100, mouseY = -100;
  window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    addDots(mouseX, mouseY, 2);
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (e.touches.length > 0) {
      mouseX = e.touches[0].clientX;
      mouseY = e.touches[0].clientY;
      addDots(mouseX, mouseY, 3);
    }
  }, { passive: true });

  function render() {
    ctx.clearRect(0, 0, width, height);

    // Desenhar linhas pontilhadas conectando os pontos próximos ao cursor
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 65) {
          ctx.save();
          const lineAlpha = (1 - dist / 65) * Math.min(particles[i].alpha, particles[j].alpha) * 0.45;
          ctx.globalAlpha = Math.max(0, lineAlpha);
          ctx.strokeStyle = '#c084fc';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 4]); // Pontilhados elegantes
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    // Desenhar e atualizar as partículas
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.update();
      p.draw(ctx);
      if (p.alpha <= 0) {
        particles.splice(i, 1);
      }
    }

    requestAnimationFrame(render);
  }

  render();
})();
