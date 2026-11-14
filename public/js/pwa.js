// CryptaPay PWA Handler (iOS Safari & Android Chrome)
let deferredPrompt = null;

// ========================================================
// CONTROLE RESPONSIVO MOBILE RIGOROSO (SAFARI & ANDROID)
// ========================================================

// 1. DESATIVAR DUPLO TOQUE QUE DÁ ZOOM NA TELA
let lastTouchEnd = 0;
document.addEventListener('touchend', (event) => {
  const now = Date.now();
  if (now - lastTouchEnd <= 300) {
    event.preventDefault(); // Impede o Safari de dar zoom ao dar dois cliques rápidos
  }
  lastTouchEnd = now;
}, { passive: false });

// 2. IMPEDIR QUE O SITE ENCOLHA OU EXPANDA AO ARRASTAR O DEDO EM PINÇA
document.addEventListener('gesturestart', (e) => {
  e.preventDefault();
}, { passive: false });

document.addEventListener('gesturechange', (e) => {
  e.preventDefault();
}, { passive: false });

document.addEventListener('gestureend', (e) => {
  e.preventDefault();
}, { passive: false });

document.addEventListener('dblclick', (e) => {
  e.preventDefault();
}, { passive: false });

// 3. Suporte a touchmove para bloquear encolhimento abaixo de 100% de largura
let initialDistance = 0;
document.addEventListener('touchstart', (e) => {
  if (e.touches.length === 2) {
    initialDistance = Math.hypot(
      e.touches[0].pageX - e.touches[1].pageX,
      e.touches[0].pageY - e.touches[1].pageY
    );
  }
}, { passive: true });

document.addEventListener('touchmove', (e) => {
  if (e.touches.length === 2 && initialDistance > 0) {
    const currentDistance = Math.hypot(
      e.touches[0].pageX - e.touches[1].pageX,
      e.touches[0].pageY - e.touches[1].pageY
    );
    // Se estiver tentando diminuir/encolher (pinça para dentro)
    if (currentDistance < initialDistance && window.visualViewport && window.visualViewport.scale <= 1.0) {
      e.preventDefault();
    }
  }
}, { passive: false });

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  
  // Exibir botão de instalação Android caso disponível
  const installBtn = document.getElementById('pwaInstallActionBtn');
  if (installBtn) {
    installBtn.style.display = 'inline-flex';
  }
});

function triggerPWAInstall() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        console.log('Usuário aceitou a instalação do CryptaPay');
      }
      deferredPrompt = null;
    });
  } else {
    // Abrir modal de instruções para iOS Safari
    const modal = document.getElementById('pwaModal');
    if (modal) modal.classList.add('active');
  }
}

// Detectar se está rodando no Safari iOS fora do modo standalone
function isIosSafari() {
  const userAgent = window.navigator.userAgent.toLowerCase();
  const isIos = /iphone|ipad|ipod/.test(userAgent);
  const isStandalone = ('standalone' in window.navigator) && (window.navigator.standalone);
  return isIos && !isStandalone;
}

document.addEventListener('DOMContentLoaded', () => {
  if (isIosSafari()) {
    console.log('📱 Navegador Safari iOS detectado. Sugerindo Adicionar à Tela de Início.');
    const banner = document.getElementById('iosInstallBanner');
    if (banner) banner.style.display = 'block';
  }

  // Registro Obrigatório do Service Worker para Notificações Nativas no Celular (Android & iOS)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js?v=2026.16')
      .then(reg => {
        console.log('✅ ServiceWorker KryptaPay ativo para notificações na barra do celular:', reg.scope);
      })
      .catch(err => {
        console.warn('Erro ao registrar ServiceWorker:', err);
      });
  }
});
