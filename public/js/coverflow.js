// KryptaPay 3D Coverflow Slider — Placas e Pulseiras Interativas
class KryptaCoverflow {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) return;

    this.items = Array.from(this.container.querySelectorAll('.coverflow-item'));
    this.total = this.items.length;
    this.currentIndex = 0;
    this.dotsContainer = document.getElementById('coverflowDots');

    this.init();
  }

  init() {
    this.createDots();
    this.updateClasses();

    // Eventos de clique nas placas
    this.items.forEach((item, index) => {
      item.addEventListener('click', () => {
        if (index !== this.currentIndex) {
          this.currentIndex = index;
          this.updateClasses();
        }
      });
    });

    // Botões de navegação
    const prevBtn = document.getElementById('cfPrevBtn');
    const nextBtn = document.getElementById('cfNextBtn');
    if (prevBtn) prevBtn.addEventListener('click', () => this.prev());
    if (nextBtn) nextBtn.addEventListener('click', () => this.next());

    // Suporte a Touch Swipe no celular
    let startX = 0;
    this.container.addEventListener('touchstart', (e) => {
      if (e.touches.length > 0) startX = e.touches[0].clientX;
    }, { passive: true });

    this.container.addEventListener('touchend', (e) => {
      if (e.changedTouches.length > 0) {
        const deltaX = e.changedTouches[0].clientX - startX;
        if (deltaX > 45) this.prev();
        else if (deltaX < -45) this.next();
      }
    }, { passive: true });

    // Auto rotate a cada 6 segundos se o usuário não estiver interagindo
    setInterval(() => {
      if (!this.container.matches(':hover')) {
        this.next();
      }
    }, 6000);
  }

  createDots() {
    if (!this.dotsContainer) return;
    this.dotsContainer.innerHTML = '';
    for (let i = 0; i < this.total; i++) {
      const dot = document.createElement('div');
      dot.className = `cf-dot ${i === 0 ? 'active' : ''}`;
      dot.addEventListener('click', () => {
        this.currentIndex = i;
        this.updateClasses();
      });
      this.dotsContainer.appendChild(dot);
    }
  }

  prev() {
    this.currentIndex = (this.currentIndex - 1 + this.total) % this.total;
    this.updateClasses();
  }

  next() {
    this.currentIndex = (this.currentIndex + 1) % this.total;
    this.updateClasses();
  }

  updateClasses() {
    this.items.forEach((item, index) => {
      item.classList.remove('active', 'prev-1', 'next-1', 'prev-2', 'next-2', 'hidden-card');

      const diff = (index - this.currentIndex + this.total) % this.total;

      if (diff === 0) {
        item.classList.add('active');
      } else if (diff === 1) {
        item.classList.add('next-1');
      } else if (diff === 2) {
        item.classList.add('next-2');
      } else if (diff === this.total - 1) {
        item.classList.add('prev-1');
      } else if (diff === this.total - 2) {
        item.classList.add('prev-2');
      } else {
        item.classList.add('hidden-card');
      }
    });

    if (this.dotsContainer) {
      const dots = this.dotsContainer.querySelectorAll('.cf-dot');
      dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === this.currentIndex);
      });
    }
  }
}

window.KryptaCoverflow = KryptaCoverflow;
