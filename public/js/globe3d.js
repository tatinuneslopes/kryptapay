// KryptaPay Majestic 3D Earth Globe Engine (Ultra Grandão, Foto Oficial, Anéis Orbitais Neon e Pontos Roxos)
class KryptaGlobe3D {
  constructor(canvasId, options = {}) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.options = Object.assign({
      radius: 260, // Grandão por padrão
      autoRotateSpeed: 0.007,
      activeDotsCount: 28
    }, options);

    this.rotationY = 0;
    this.rotationX = 0.15;
    this.isDragging = false;
    this.prevMouseX = 0;
    this.prevMouseY = 0;
    this.velocity = 0;

    // Carregar a imagem oficial da KryptaPay
    this.globeImg = new Image();
    this.globeImg.src = '/assets/globo-oficial.jpg';
    this.imgLoaded = false;
    this.globeImg.onload = () => {
      this.imgLoaded = true;
    };

    // Coordenadas esféricas de pontos de transações pelo mundo (lat/lon)
    // Cidades estratégicas: São Paulo, Rio, Miami, Nova York, Londres, Lisboa, Madrid, Frankfurt, Dubai, Tóquio
    const citiesLatLon = [
      { lat: -23.55, lon: -46.63, name: 'São Paulo' },
      { lat: -22.90, lon: -43.17, name: 'Rio de Janeiro' },
      { lat: -15.78, lon: -47.92, name: 'Brasília' },
      { lat: -12.97, lon: -38.51, name: 'Salvador' },
      { lat: -3.71, lon: -38.54, name: 'Fortaleza' },
      { lat: -30.03, lon: -51.22, name: 'Porto Alegre' },
      { lat: 25.76, lon: -80.19, name: 'Miami' },
      { lat: 40.71, lon: -74.00, name: 'Nova York' },
      { lat: 51.50, lon: -0.12, name: 'Londres' },
      { lat: 38.72, lon: -9.13, name: 'Lisboa' },
      { lat: 40.41, lon: -3.70, name: 'Madrid' },
      { lat: 48.85, lon: 2.35, name: 'Paris' },
      { lat: 50.11, lon: 8.68, name: 'Frankfurt' },
      { lat: 25.20, lon: 55.27, name: 'Dubai' },
      { lat: 35.67, lon: 139.65, name: 'Tóquio' },
      { lat: -34.60, lon: -58.38, name: 'Buenos Aires' },
      { lat: 19.43, lon: -99.13, name: 'Cidade do México' },
      { lat: 43.65, lon: -79.38, name: 'Toronto' }
    ];

    this.nodes = citiesLatLon.map(c => {
      const phi = (90 - c.lat) * (Math.PI / 180);
      const theta = (c.lon + 180) * (Math.PI / 180);
      return {
        x: -(Math.sin(phi) * Math.cos(theta)),
        y: Math.cos(phi),
        z: Math.sin(phi) * Math.sin(theta),
        name: c.name,
        phase: Math.random() * Math.PI * 2,
        speed: 0.04 + Math.random() * 0.03,
        size: 2.2 // Pontinho roxo delicado
      };
    });

    // Múltiplos pontos delicados distribuídos pela superfície da Terra
    for (let i = 0; i < 18; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      this.nodes.push({
        x: Math.sin(phi) * Math.cos(theta),
        y: Math.cos(phi),
        z: Math.sin(phi) * Math.sin(theta),
        phase: Math.random() * Math.PI * 2,
        speed: 0.03 + Math.random() * 0.03,
        size: 1.6
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
    const parent = this.canvas.parentElement;
    const rect = parent ? parent.getBoundingClientRect() : { width: 800, height: 600 };
    const dpr = window.devicePixelRatio || 1;

    this.width = rect.width || 800;
    this.height = Math.max(540, rect.height || 600);
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;

    this.ctx.resetTransform ? this.ctx.resetTransform() : this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);

    // Raio bem grandão: cerca de 45% da menor dimensão do container
    this.radius = Math.min(this.width * 0.44, this.height * 0.44, 280);
  }

  setupInteractivity() {
    const onStart = (x, y) => {
      this.isDragging = true;
      this.prevMouseX = x;
      this.prevMouseY = y;
      this.velocity = 0;
      this.canvas.style.cursor = 'grabbing';
    };

    const onMove = (x, y) => {
      if (!this.isDragging) return;
      const deltaX = x - this.prevMouseX;
      const deltaY = y - this.prevMouseY;
      this.rotationY += deltaX * 0.006;
      this.rotationX -= deltaY * 0.005;

      // Limitar rotação vertical para não inverter
      this.rotationX = Math.max(-0.6, Math.min(0.6, this.rotationX));

      this.velocity = deltaX * 0.002;
      this.prevMouseX = x;
      this.prevMouseY = y;
    };

    const onEnd = () => {
      this.isDragging = false;
      this.canvas.style.cursor = 'grab';
    };

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
      this.rotationY += this.options.autoRotateSpeed + this.velocity;
      this.velocity *= 0.95; // Inércia suave
    }

    this.render();
    requestAnimationFrame(() => this.animate());
  }

  render() {
    const { ctx, width, height, radius, rotationX, rotationY } = this;
    ctx.clearRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;

    // 1. Halo e Brilho de Fundo Gigante Roxo Neon
    const outerHalo = ctx.createRadialGradient(cx, cy, radius * 0.4, cx, cy, radius * 1.55);
    outerHalo.addColorStop(0, 'rgba(176, 38, 255, 0.35)');
    outerHalo.addColorStop(0.45, 'rgba(147, 51, 234, 0.18)');
    outerHalo.addColorStop(0.8, 'rgba(76, 29, 149, 0.08)');
    outerHalo.addColorStop(1, 'rgba(4, 1, 8, 0)');
    ctx.fillStyle = outerHalo;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.55, 0, Math.PI * 2);
    ctx.fill();

    // 2. Reflexo Espelhado do Pedestal (Base da Imagem Oficial)
    ctx.save();
    ctx.translate(cx, cy + radius * 0.98);
    const pedestalGlow = ctx.createRadialGradient(0, 0, radius * 0.1, 0, 0, radius * 1.15);
    pedestalGlow.addColorStop(0, 'rgba(217, 70, 239, 0.45)');
    pedestalGlow.addColorStop(0.5, 'rgba(176, 38, 255, 0.25)');
    pedestalGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = pedestalGlow;
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 1.25, radius * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 3. Renderização Perfeita da Esfera 3D Central
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();

    // Fundo profundo da Terra
    ctx.fillStyle = '#06020c';
    ctx.fill();

    // Desenhar Imagem Oficial Perfeitamente Alinhada (Sem ficar torta!)
    if (this.imgLoaded) {
      // Ajuste de escala proporcional preservando proporção 1:1 sem distorção
      const imgSize = radius * 2.25;
      ctx.drawImage(this.globeImg, cx - imgSize / 2, cy - imgSize / 2, imgSize, imgSize);
    }

    // Camada Esférica de Sombreado 3D Real (Realce de Luz e Borda)
    const sphereGradient = ctx.createRadialGradient(
      cx - radius * 0.32,
      cy - radius * 0.32,
      radius * 0.15,
      cx,
      cy,
      radius
    );
    sphereGradient.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
    sphereGradient.addColorStop(0.55, 'rgba(176, 38, 255, 0.05)');
    sphereGradient.addColorStop(0.85, 'rgba(10, 4, 22, 0.35)');
    sphereGradient.addColorStop(1, 'rgba(4, 1, 10, 0.85)');
    ctx.fillStyle = sphereGradient;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

    ctx.restore();

    // 4. Borda Luminosa Neon Esférica da Terra
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(217, 70, 239, 0.8)';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#b026ff';
    ctx.shadowBlur = 18;
    ctx.stroke();
    ctx.restore();

    // 5. Múltiplos Grandes Anéis Orbitais Neon em Roxo (Idêntico à Imagem Oficial)
    this.drawOfficialOrbitalRings(cx, cy, radius);

    // 6. Desenhar os Pontinhos Roxos Delicados e Arcos de Transações
    this.drawPurpleNodesAndArcs(cx, cy, radius, rotationX, rotationY);
  }

  drawOfficialOrbitalRings(cx, cy, radius) {
    const { ctx } = this;
    const time = Date.now() * 0.001;

    ctx.save();
    ctx.translate(cx, cy);

    // 1. Grande Anel Orbital Superior Inclinado
    ctx.save();
    ctx.rotate(-0.38 + Math.sin(time * 0.4) * 0.02);
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 1.38, radius * 0.38, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(176, 38, 255, 0.6)';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#d946ef';
    ctx.shadowBlur = 22;
    ctx.stroke();

    // Feixe Neon de Alta Intensidade Frontal
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 1.38, radius * 0.38, 0, Math.PI * 0.2, Math.PI * 0.85);
    ctx.strokeStyle = '#f0abfc';
    ctx.lineWidth = 3.8;
    ctx.stroke();
    ctx.restore();

    // 2. Segundo Grande Anel Orbital Transversal
    ctx.save();
    ctx.rotate(0.52);
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 1.32, radius * 0.34, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(192, 132, 252, 0.45)';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#b026ff';
    ctx.shadowBlur = 15;
    ctx.stroke();

    // Partícula viajando na órbita
    const orbitAngle = (time * 1.2) % (Math.PI * 2);
    const px = Math.cos(orbitAngle) * (radius * 1.32);
    const py = Math.sin(orbitAngle) * (radius * 0.34);
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#d946ef';
    ctx.shadowBlur = 15;
    ctx.fill();
    ctx.restore();

    // 3. Terceiro Anel Inferior
    ctx.save();
    ctx.translate(0, radius * 0.35);
    ctx.rotate(-0.15);
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 1.22, radius * 0.28, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.35)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }

  drawPurpleNodesAndArcs(cx, cy, radius, rotationX, rotationY) {
    const { ctx } = this;
    const cosY = Math.cos(rotationY);
    const sinY = Math.sin(rotationY);
    const cosX = Math.cos(rotationX);
    const sinX = Math.sin(rotationX);

    const projectedNodes = [];

    // Calcular posições 3D de cada nó
    for (const node of this.nodes) {
      node.phase += node.speed;
      const pulse = Math.sin(node.phase);
      const alpha = 0.55 + pulse * 0.42;

      // Rotação Y (horizontal) e X (inclinação)
      const x1 = node.x * cosY - node.z * sinY;
      const z1 = node.z * cosY + node.x * sinY;
      const y2 = node.y * cosX - z1 * sinX;
      const z2 = z1 * cosX + node.y * sinX;

      // Desenhar apenas os que estão virados para a frente do globo
      if (z2 > -0.15) {
        const px = cx + x1 * (radius * 0.96);
        const py = cy + y2 * (radius * 0.96);

        projectedNodes.push({ px, py, alpha, z: z2, node });

        // Halo roxo neon oscilante delicado
        ctx.beginPath();
        ctx.arc(px, py, node.size * 3.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(176, 38, 255, ${0.28 * alpha})`;
        ctx.fill();

        // Ponto roxo central vibrante
        ctx.beginPath();
        ctx.arc(px, py, node.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(236, 72, 153, ${alpha})`;
        ctx.shadowColor = '#b026ff';
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    // Desenhar linhas de arcos conectando cidades próximas (fluxo de pagamentos)
    if (projectedNodes.length >= 2) {
      ctx.lineWidth = 1;
      for (let i = 0; i < projectedNodes.length - 1; i += 2) {
        const p1 = projectedNodes[i];
        const p2 = projectedNodes[i + 1];
        if (!p1 || !p2) continue;

        const dist = Math.hypot(p2.px - p1.px, p2.py - p1.py);
        if (dist < radius * 0.8) {
          const midX = (p1.px + p2.px) / 2;
          const midY = (p1.py + p2.py) / 2 - dist * 0.15; // Curvatura para fora

          ctx.beginPath();
          ctx.moveTo(p1.px, p1.py);
          ctx.quadraticCurveTo(midX, midY, p2.px, p2.py);
          ctx.strokeStyle = 'rgba(192, 132, 252, 0.25)';
          ctx.stroke();
        }
      }
    }
  }
}

window.KryptaGlobe3D = KryptaGlobe3D;
