// KryptaPay Interactive 3D Card Tilt, Gyro & Free Lateral Rotation Engine
class KryptaCard3D {
  static init() {
    const cards = document.querySelectorAll('.tilt-card-3d, .coverflow-item');
    cards.forEach(card => KryptaCard3D.attach(card));
  }

  static attach(card) {
    if (card._has3dAttached) return;
    card._has3dAttached = true;

    // Criar camada de reflexo de luz metálica (Specular Glare)
    let glare = card.querySelector('.card-glare');
    if (!glare) {
      glare = document.createElement('div');
      glare.className = 'card-glare';
      card.appendChild(glare);
    }

    let isTouching = false;
    let currentRotY = 0;
    let currentRotX = 0;
    let startX = 0;
    let startY = 0;

    const updateTransform = (rotX, rotY, scale = 1.05) => {
      card.style.transform = `perspective(1000px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale3d(${scale}, ${scale}, ${scale}) translateZ(30px)`;
    };

    // MOUSE TILT DINÂMICO
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      // Inclinação proporcional (transversal e lateral)
      const rotX = -((y - centerY) / centerY) * 22;
      const rotY = ((x - centerX) / centerX) * 28;

      card.style.transition = 'transform 0.08s ease-out';
      updateTransform(rotX, rotY, 1.04);

      // Mover reflexo de luz roxa neon
      const glareX = (x / rect.width) * 100;
      const glareY = (y / rect.height) * 100;
      glare.style.opacity = '1';
      glare.style.background = `radial-gradient(circle at ${glareX}% ${glareY}%, rgba(217, 70, 239, 0.45) 0%, rgba(176, 38, 255, 0.15) 45%, transparent 75%)`;
    });

    card.addEventListener('mouseleave', () => {
      card.style.transition = 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)';
      card.style.transform = '';
      glare.style.opacity = '0';
    });

    // TOQUE NO CELULAR / ARRASTE LIVRE LATERAL
    card.addEventListener('touchstart', (e) => {
      if (e.touches.length > 0) {
        isTouching = true;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        card.style.transition = 'none';
      }
    }, { passive: true });

    card.addEventListener('touchmove', (e) => {
      if (!isTouching || e.touches.length === 0) return;
      const touchX = e.touches[0].clientX;
      const touchY = e.touches[0].clientY;
      const deltaX = touchX - startX;
      const deltaY = touchY - startY;

      // Permitir rotação lateral e transversal livre com o dedo
      currentRotY = Math.max(-45, Math.min(45, deltaX * 0.4));
      currentRotX = Math.max(-30, Math.min(30, -deltaY * 0.3));

      updateTransform(currentRotX, currentRotY, 1.06);

      const rect = card.getBoundingClientRect();
      const glareX = Math.max(0, Math.min(100, ((touchX - rect.left) / rect.width) * 100));
      const glareY = Math.max(0, Math.min(100, ((touchY - rect.top) / rect.height) * 100));
      glare.style.opacity = '1';
      glare.style.background = `radial-gradient(circle at ${glareX}% ${glareY}%, rgba(217, 70, 239, 0.5) 0%, rgba(176, 38, 255, 0.2) 50%, transparent 75%)`;
    }, { passive: true });

    const endTouch = () => {
      isTouching = false;
      card.style.transition = 'transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)';
      card.style.transform = '';
      glare.style.opacity = '0';
    };

    card.addEventListener('touchend', endTouch);
    card.addEventListener('touchcancel', endTouch);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  KryptaCard3D.init();
});

window.KryptaCard3D = KryptaCard3D;
