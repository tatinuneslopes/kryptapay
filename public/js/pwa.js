// CryptaPay PWA Handler (iOS Safari & Android Chrome)
let deferredPrompt = null;

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
});
