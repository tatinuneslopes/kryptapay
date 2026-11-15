// KryptaPay Majestic 3D Earth Globe Engine
// Globo Oficial Gigante + Rotação 3D Contínua + Bolinhas Roxas Pulsando em Todos os Estados
class KryptaGlobe3D {
  constructor(canvasId, options = {}) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;

    if (this.canvas._globeInstance) {
      try { cancelAnimationFrame(this.canvas._globeInstance.animFrameId); } catch (_) {}
    }
    this.canvas._globeInstance = this;

    this.ctx = this.canvas.getContext('2d');
    this.options = Object.assign({
      radius: 260,
      autoRotateSpeed: 0.0075
    }, options);

    this.rotationY = 0;
    this.rotationX = 0.12;
    this.isDragging = false;
    this.prevMouseX = 0;
    this.prevMouseY = 0;
    this.velocity = 0;

    // Carregar imagem oficial do mapa mundi
    this.globeImg = new Image();
    this.imgLoaded = false;
    this.globeImg.onload = () => {
      this.imgLoaded = true;
    };
    this.globeImg.src = '/assets/globo-oficial.jpg';
    if (this.globeImg.complete && this.globeImg.naturalWidth > 0) {
      this.imgLoaded = true;
    }

    // Gerar malha procedural de coordenadas dos continentes da Terra (América do Sul, América do Norte, Europa, África, Ásia, Oceania)
    this.continentDots = [];
    const continents = [
      { minLat: -55, maxLat: 12, minLon: -80, maxLon: -35, count: 180 }, // América do Sul (Brasil)
      { minLat: 15, maxLat: 68, minLon: -160, maxLon: -55, count: 220 }, // América do Norte
      { minLat: 36, maxLat: 70, minLon: -10, maxLon: 45, count: 160 },   // Europa
      { minLat: -34, maxLat: 36, minLon: -17, maxLon: 51, count: 200 },  // África
      { minLat: 5, maxLat: 72, minLon: 45, maxLon: 145, count: 280 },   // Ásia
      { minLat: -42, maxLat: -12, minLon: 114, maxLon: 154, count: 100 } // Oceania
    ];

    continents.forEach(c => {
      for (let i = 0; i < c.count; i++) {
        const lat = c.minLat + Math.random() * (c.maxLat - c.minLat);
        const lon = c.minLon + Math.random() * (c.maxLon - c.minLon);
        const phi = (90 - lat) * (Math.PI / 180);
        const theta = (lon + 180) * (Math.PI / 180);
        this.continentDots.push({
          x: -(Math.sin(phi) * Math.cos(theta)),
          y: Math.cos(phi),
          z: Math.sin(phi) * Math.sin(theta)
        });
      }
    });

    // TODOS OS ESTADOS DO BRASIL + PRINCIPAIS ESTADOS DOS EUA E EUROPA
    this.stateNodes = [
      // 🇧🇷 ESTADOS DO BRASIL (Cobertura completa)
      { lat: -23.55, lon: -46.63, name: 'São Paulo', state: 'SP' },
      { lat: -22.90, lon: -43.17, name: 'Rio de Janeiro', state: 'RJ' },
      { lat: -19.92, lon: -43.94, name: 'Minas Gerais', state: 'MG' },
      { lat: -20.31, lon: -40.33, name: 'Espírito Santo', state: 'ES' },
      { lat: -25.43, lon: -49.27, name: 'Paraná', state: 'PR' },
      { lat: -27.59, lon: -48.54, name: 'Santa Catarina', state: 'SC' },
      { lat: -30.03, lon: -51.23, name: 'Rio Grande do Sul', state: 'RS' },
      { lat: -12.97, lon: -38.50, name: 'Bahia', state: 'BA' },
      { lat: -8.05, lon: -34.88, name: 'Pernambuco', state: 'PE' },
      { lat: -3.73, lon: -38.52, name: 'Ceará', state: 'CE' },
      { lat: -15.79, lon: -47.88, name: 'Distrito Federal', state: 'DF' },
      { lat: -16.68, lon: -49.25, name: 'Goiás', state: 'GO' },
      { lat: -15.60, lon: -56.09, name: 'Mato Grosso', state: 'MT' },
      { lat: -20.44, lon: -54.64, name: 'Mato Grosso do Sul', state: 'MS' },
      { lat: -1.45, lon: -48.49, name: 'Pará', state: 'PA' },
      { lat: -3.11, lon: -60.02, name: 'Amazonas', state: 'AM' },
      { lat: -2.53, lon: -44.30, name: 'Maranhão', state: 'MA' },
      { lat: -5.79, lon: -35.20, name: 'Rio Grande do Norte', state: 'RN' },
      { lat: -7.11, lon: -34.86, name: 'Paraíba', state: 'PB' },
      { lat: -9.66, lon: -35.73, name: 'Alagoas', state: 'AL' },
      { lat: -10.94, lon: -37.07, name: 'Sergipe', state: 'SE' },
      { lat: -5.09, lon: -42.80, name: 'Piauí', state: 'PI' },
      { lat: -10.24, lon: -48.32, name: 'Tocantins', state: 'TO' },
      { lat: -8.76, lon: -63.90, name: 'Rondônia', state: 'RO' },
      { lat: -9.97, lon: -67.82, name: 'Acre', state: 'AC' },
      { lat: 2.82, lon: -60.67, name: 'Roraima', state: 'RR' },
      { lat: 0.03, lon: -51.05, name: 'Amapá', state: 'AP' },

      // 🇺🇸 ESTADOS AMERICANOS E CAPITAIS
      { lat: 25.76, lon: -80.19, name: 'Flórida (Miami)', state: 'FL' },
      { lat: 28.53, lon: -81.37, name: 'Orlando', state: 'FL' },
      { lat: 40.71, lon: -74.00, name: 'Nova York', state: 'NY' },
      { lat: 34.05, lon: -118.24, name: 'Califórnia', state: 'CA' },
      { lat: 37.77, lon: -122.41, name: 'São Francisco', state: 'CA' },
      { lat: 32.77, lon: -96.79, name: 'Texas', state: 'TX' },
      { lat: 41.87, lon: -87.62, name: 'Illinois (Chicago)', state: 'IL' },
      { lat: 33.74, lon: -84.38, name: 'Geórgia (Atlanta)', state: 'GA' },
      { lat: 47.60, lon: -122.33, name: 'Washington (Seattle)', state: 'WA' },

      // 🇪🇺 EUROPA E AMÉRICA LATINA
      { lat: 38.72, lon: -9.13, name: 'Lisboa', state: 'PT' },
      { lat: 41.15, lon: -8.62, name: 'Porto', state: 'PT' },
      { lat: 40.41, lon: -3.70, name: 'Madrid', state: 'ES' },
      { lat: 41.38, lon: 2.17, name: 'Barcelona', state: 'ES' },
      { lat: 48.85, lon: 2.35, name: 'Paris', state: 'FR' },
      { lat: 51.50, lon: -0.12, name: 'Londres', state: 'UK' },
      { lat: 50.11, lon: 8.68, name: 'Frankfurt', state: 'DE' },
      { lat: 41.90, lon: 12.49, name: 'Roma', state: 'IT' },
      { lat: 45.46, lon: 9.19, name: 'Milão', state: 'IT' },
      { lat: -34.60, lon: -58.38, name: 'Buenos Aires', state: 'AR' },
      { lat: 19.43, lon: -99.13, name: 'Cidade do México', state: 'MX' },
      { lat: 43.65, lon: -79.38, name: 'Toronto', state: 'CA' },
      { lat: 25.20, lon: 55.27, name: 'Dubai', state: 'UAE' },
      { lat: 35.67, lon: 139.65, name: 'Tóquio', state: 'JP' }
    ];

    // Inicializar propriedades de pulso individual para cada estado
    this.stateNodes.forEach((node, idx) => {
      node.phase = idx * 0.35;
      node.pulseSpeed = 0.045 + (idx % 5) * 0.01;
      node.size = 2.4; // Bolinha roxa nítida
    });

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
    const clientW = parent && parent.clientWidth > 0 ? parent.clientWidth : (window.innerWidth || 800);
    const rect = parent ? parent.getBoundingClientRect() : { width: clientW, height: 500 };
    const dpr = window.devicePixelRatio || 1;

    let computedW = rect.width > 50 ? rect.width : (clientW > 50 ? clientW : 360);
    this.width = Math.min(computedW, window.innerWidth || computedW);
    const isMobile = this.width < 640;

    // Altura proporcional respeitando o container pai
    if (rect.height && rect.height > 120) {
      this.height = rect.height;
    } else if (parent && parent.clientHeight > 120) {
      this.height = parent.clientHeight;
    } else if (isMobile) {
      this.height = Math.min(this.width * 1.05, 410);
    } else {
      this.height = 480;
    }

    // Raio do globo proporcional respeitando as opções e dimensões
    if (this.options && this.options.radius) {
      const maxRadius = Math.min(this.width * 0.44, this.height * 0.44);
      this.radius = Math.min(this.options.radius, Math.max(80, maxRadius));
    } else if (isMobile) {
      this.radius = Math.min(this.width * 0.38, 150);
    } else {
      this.radius = Math.min(this.width * 0.44, this.height * 0.44, 270);
    }

    this.canvas.width = Math.max(200, this.width) * dpr;
    this.canvas.height = Math.max(200, this.height) * dpr;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.canvas.style.maxWidth = '100%';

    this.ctx.resetTransform ? this.ctx.resetTransform() : this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);
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
      this.rotationY += deltaX * 0.007;
      this.rotationX -= deltaY * 0.005;

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
    if (!this.canvas || this.canvas._globeInstance !== this) return;

    // Rotação contínua e suave do mundo
    if (!this.isDragging) {
      this.rotationY += this.options.autoRotateSpeed + this.velocity;
      this.velocity *= 0.95;
    }

    this.render();
    this.animFrameId = requestAnimationFrame(() => this.animate());
  }

  render() {
    const { ctx, width, height, radius, rotationX, rotationY } = this;
    ctx.clearRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;

    // 1. Halo Roxo de Fundo Gigante
    const outerHalo = ctx.createRadialGradient(cx, cy, radius * 0.4, cx, cy, radius * 1.55);
    outerHalo.addColorStop(0, 'rgba(176, 38, 255, 0.38)');
    outerHalo.addColorStop(0.45, 'rgba(147, 51, 234, 0.20)');
    outerHalo.addColorStop(0.85, 'rgba(76, 29, 149, 0.08)');
    outerHalo.addColorStop(1, 'rgba(4, 1, 8, 0)');
    ctx.fillStyle = outerHalo;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.55, 0, Math.PI * 2);
    ctx.fill();

    // 2. Reflexo de Pedestal Espelhado na Base
    ctx.save();
    ctx.translate(cx, cy + radius * 0.96);
    const pedestalGlow = ctx.createRadialGradient(0, 0, radius * 0.1, 0, 0, radius * 1.25);
    pedestalGlow.addColorStop(0, 'rgba(217, 70, 239, 0.5)');
    pedestalGlow.addColorStop(0.5, 'rgba(176, 38, 255, 0.28)');
    pedestalGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = pedestalGlow;
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 1.3, radius * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 3. Desenhar a Esfera da Terra com Rotação Texturizada e Projeção Esférica
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();

    // Fundo azul/violeta cósmico profundo
    const spaceGrad = ctx.createRadialGradient(cx, cy, radius * 0.1, cx, cy, radius);
    spaceGrad.addColorStop(0, '#100624');
    spaceGrad.addColorStop(0.7, '#070212');
    spaceGrad.addColorStop(1, '#020005');
    ctx.fillStyle = spaceGrad;
    ctx.fill();

    // 3.1. Grade 3D de Meridianos e Paralelos (Latitude & Longitude)
    const cosY = Math.cos(rotationY);
    const sinY = Math.sin(rotationY);
    const cosX = Math.cos(rotationX);
    const sinX = Math.sin(rotationX);

    // Paralelos de Latitude
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.22)';
    [-60, -30, 0, 30, 60].forEach(lat => {
      const phi = (90 - lat) * (Math.PI / 180);
      const ringRadius = Math.sin(phi) * radius;
      const ringY = Math.cos(phi) * radius;
      const y2 = ringY * cosX;
      ctx.beginPath();
      ctx.ellipse(cx, cy + y2, ringRadius, ringRadius * 0.28, 0, 0, Math.PI * 2);
      ctx.stroke();
    });

    // 3.2. Malha de Continentes 3D (visível sempre rotacionando a 60fps)
    if (this.continentDots && this.continentDots.length) {
      for (const dot of this.continentDots) {
        const x1 = dot.x * cosY - dot.z * sinY;
        const z1 = dot.z * cosY + dot.x * sinY;
        const y2 = dot.y * cosX - z1 * sinX;
        const z2 = z1 * cosX + dot.y * sinX;

        if (z2 > -0.15) {
          const px = cx + x1 * radius;
          const py = cy + y2 * radius;
          const alpha = Math.max(0.15, (z2 + 0.2) * 0.85);
          ctx.beginPath();
          ctx.arc(px, py, 1.4, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(192, 132, 252, ${alpha * 0.75})`;
          ctx.fill();
        }
      }
    }

    // 3.3. Textura da Terra (quando a foto oficial estiver disponível)
    if (this.imgLoaded) {
      ctx.save();
      ctx.globalAlpha = 0.58;
      const imgSize = radius * 2.3;
      const rotOffset = ((rotationY % (Math.PI * 2)) / (Math.PI * 2)) * imgSize;
      ctx.drawImage(this.globeImg, cx - imgSize / 2 + rotOffset, cy - imgSize / 2, imgSize, imgSize);
      ctx.drawImage(this.globeImg, cx - imgSize / 2 + rotOffset - imgSize, cy - imgSize / 2, imgSize, imgSize);
      ctx.drawImage(this.globeImg, cx - imgSize / 2 + rotOffset + imgSize, cy - imgSize / 2, imgSize, imgSize);
      ctx.restore();
    }

    // 3.4. Camada de Sombra Esférica 3D Real (Profundidade e borda iluminada)
    const sphereShade = ctx.createRadialGradient(
      cx - radius * 0.32,
      cy - radius * 0.32,
      radius * 0.15,
      cx,
      cy,
      radius
    );
    sphereShade.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
    sphereShade.addColorStop(0.55, 'rgba(176, 38, 255, 0.04)');
    sphereShade.addColorStop(0.82, 'rgba(12, 4, 25, 0.38)');
    sphereShade.addColorStop(1, 'rgba(4, 1, 10, 0.88)');
    ctx.fillStyle = sphereShade;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

    ctx.restore();

    // 4. Borda Esférica Neon Roxo Vibrante
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(217, 70, 239, 0.85)';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#b026ff';
    ctx.shadowBlur = 20;
    ctx.stroke();
    ctx.restore();

    // 5. Desenhar os Múltiplos Grandes Anéis Orbitais Neon
    this.drawOfficialOrbitalRings(cx, cy, radius);

    // 6. DESENHAR AS BOLINHAS ROXAS EM CADA ESTADO RODANDO COM O GLOBO
    this.drawStateNodesRotating(cx, cy, radius, rotationX, rotationY);
  }

  drawOfficialOrbitalRings(cx, cy, radius) {
    const { ctx } = this;
    const time = Date.now() * 0.001;

    ctx.save();
    ctx.translate(cx, cy);

    // 1. Grande Anel Orbital Superior
    ctx.save();
    ctx.rotate(-0.38 + Math.sin(time * 0.4) * 0.02);
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 1.38, radius * 0.38, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(176, 38, 255, 0.65)';
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

  // DESENHAR AS BOLINHAS ROXAS EM CADA ESTADO SEGUINDO A ROTAÇÃO
  drawStateNodesRotating(cx, cy, radius, rotationX, rotationY) {
    const { ctx } = this;
    const cosX = Math.cos(rotationX);
    const sinX = Math.sin(rotationX);

    const visiblePoints = [];

    for (const node of this.stateNodes) {
      // Pulso contínuo individual
      node.phase += node.pulseSpeed;
      const pulseWave = (Math.sin(node.phase) + 1) / 2; // de 0 a 1 suave
      const alpha = 0.5 + pulseWave * 0.5;

      // Calcular ângulo 3D com rotação contínua Y
      const phi = (90 - node.lat) * (Math.PI / 180);
      const theta = (node.lon + 180) * (Math.PI / 180) + rotationY;

      // Posição na esfera unitária com rotação
      const x = -(Math.sin(phi) * Math.cos(theta));
      const y = Math.cos(phi);
      const z = Math.sin(phi) * Math.sin(theta);

      // Inclinação vertical X
      const y2 = y * cosX - z * sinX;
      const z2 = z * cosX + y * sinX;

      // Se z2 > 0, o estado está na face frontal voltada para o usuário!
      if (z2 > -0.05) {
        const px = cx + x * (radius * 0.97);
        const py = cy + y2 * (radius * 0.97);

        visiblePoints.push({ px, py, node, alpha, z: z2 });

        // 1. Halo expansivo pulsante roxo neon em volta do estado
        const haloRadius = node.size * (2.8 + pulseWave * 2.2);
        ctx.beginPath();
        ctx.arc(px, py, haloRadius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(176, 38, 255, ${0.22 * alpha})`;
        ctx.fill();

        // 2. Anel de onda expansiva
        ctx.beginPath();
        ctx.arc(px, py, haloRadius * 1.25, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(217, 70, 239, ${0.35 * (1 - pulseWave)})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // 3. Ponto central roxo neon de alta intensidade no estado
        ctx.beginPath();
        ctx.arc(px, py, node.size + pulseWave * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = pulseWave > 0.85 ? '#ffffff' : `rgba(240, 171, 252, ${alpha})`;
        ctx.shadowColor = '#b026ff';
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.shadowBlur = 0;

        // 4. Sigla do estado sutil ao lado do ponto (ex: SP, RJ, MG, etc.)
        if (node.state && z2 > 0.35) {
          ctx.font = '600 9px monospace';
          ctx.fillStyle = `rgba(233, 213, 255, ${0.75 * alpha})`;
          ctx.fillText(node.state, px + 5, py - 4);
        }
      }
    }

    // Arcos de conexão neon roxos entre estados conectados (rotas financeiras)
    if (visiblePoints.length >= 2) {
      ctx.lineWidth = 1.1;
      for (let i = 0; i < visiblePoints.length - 1; i += 3) {
        const p1 = visiblePoints[i];
        const p2 = visiblePoints[i + 1];
        if (!p1 || !p2) continue;

        const dist = Math.hypot(p2.px - p1.px, p2.py - p1.py);
        if (dist < radius * 0.65) {
          const midX = (p1.px + p2.px) / 2;
          const midY = (p1.py + p2.py) / 2 - dist * 0.18;

          ctx.beginPath();
          ctx.moveTo(p1.px, p1.py);
          ctx.quadraticCurveTo(midX, midY, p2.px, p2.py);
          ctx.strokeStyle = 'rgba(192, 132, 252, 0.28)';
          ctx.stroke();
        }
      }
    }
  }
}

window.KryptaGlobe3D = KryptaGlobe3D;
