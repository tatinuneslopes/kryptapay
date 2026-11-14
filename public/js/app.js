// KryptaPay Application Controller (All 27 Modules + 3D Live Globe + Notifications)

const AppState = {
  currentTab: 'dashboard',
  user: null,
  theme: localStorage.getItem('kryptapay_theme') || 'dark',
  simulationRunning: false,
  notificationsHistory: []
};

// Identificador exclusivo deste dispositivo (para sincronização Computador <-> Celular)
const myDeviceId = localStorage.getItem('krypta_device_id') || (() => {
  const id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);
  localStorage.setItem('krypta_device_id', id);
  return id;
})();
const processedNotifIds = new Set();
let lastSeenSyncSeqId = 0;

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  setupNavigation();
  setupSSE();
  startCrossDeviceSync();
  loadDashboardData();
  setupModalListeners();
  updateNotificationPermissionBadge();
  checkActiveSimulationSession();

  // Inicializar o Globo 3D da Dashboard
  setTimeout(() => {
    if (window.KryptaGlobe3D && document.getElementById('dashboardGlobeCanvas')) {
      new KryptaGlobe3D('dashboardGlobeCanvas', {
        radius: 160,
        dotCount: 400,
        activeBuyers: 60,
        autoRotateSpeed: 0.008
      });
    }
  }, 200);
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    checkActiveSimulationSession();
    fetchCrossDeviceSync();
  }
});

// 1. Alternância de Tema Claro / Escuro
function initTheme() {
  document.documentElement.setAttribute('data-theme', AppState.theme);
  const themeToggle = document.getElementById('themeToggleBtn');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      AppState.theme = AppState.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', AppState.theme);
      localStorage.setItem('kryptapay_theme', AppState.theme);
    });
  }
}

// 2. Navegação entre os 27 Módulos
function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item[data-tab]');
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = item.getAttribute('data-tab');
      switchTab(tab);
    });
  });

  const collapseBtn = document.getElementById('sidebarCollapseBtn');
  const sidebar = document.querySelector('.sidebar');
  if (collapseBtn && sidebar) {
    collapseBtn.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
    });
  }

  const mobileToggle = document.getElementById('mobileMenuBtn');
  if (mobileToggle && sidebar) {
    mobileToggle.addEventListener('click', () => {
      sidebar.classList.toggle('mobile-open');
    });
  }
}

function switchTab(tabId) {
  AppState.currentTab = tabId;

  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const activeLink = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
  if (activeLink) activeLink.classList.add('active');

  // Atualizar botões da barra inferior mobile
  document.querySelectorAll('.mobile-nav-btn, .mobile-nav-btn-highlight').forEach(b => b.classList.remove('active'));
  const activeBottomBtn = document.querySelector(`[data-bottom-tab="${tabId}"]`);
  if (activeBottomBtn) activeBottomBtn.classList.add('active');

  const titleEl = document.getElementById('headerPageTitle');
  if (titleEl && activeLink) {
    const label = activeLink.querySelector('.nav-label');
    if (label) titleEl.textContent = label.textContent.trim();
  }

  document.querySelectorAll('.view-pane').forEach(pane => pane.style.display = 'none');
  let targetPane = document.getElementById(`pane-${tabId}`);
  if (!targetPane) {
    if (tabId === 'notifications' || tabId === 'avisos' || tabId === 'notificacoes') {
      targetPane = document.getElementById('pane-notifications');
    } else if (tabId === 'sales' || tabId === 'vendas') {
      targetPane = document.getElementById('pane-sales');
    } else if (tabId === 'rewards' || tabId === 'premiacoes') {
      targetPane = document.getElementById('pane-rewards');
    } else if (tabId === 'customers' || tabId === 'clientes') {
      targetPane = document.getElementById('pane-customers');
    } else if (tabId === 'links' || tabId === 'meus-links') {
      targetPane = document.getElementById('pane-links');
    } else if (tabId === 'checkout') {
      targetPane = document.getElementById('pane-checkout');
    } else if (tabId === 'subscriptions' || tabId === 'assinaturas') {
      targetPane = document.getElementById('pane-subscriptions');
    } else if (tabId === 'api' || tabId === 'api-keys') {
      targetPane = document.getElementById('pane-api');
    } else if (tabId === 'integrations' || tabId === 'integracoes') {
      targetPane = document.getElementById('pane-integrations');
    } else if (tabId === 'support' || tabId === 'suporte') {
      targetPane = document.getElementById('pane-support');
    } else if (tabId === 'settings' || tabId === 'configuracoes') {
      targetPane = document.getElementById('pane-settings');
    } else {
      targetPane = document.getElementById('pane-dashboard');
    }
  }
  if (targetPane) {
    targetPane.style.display = 'block';
  }

  if (tabId === 'dashboard') loadDashboardData();
  else if (tabId === 'test-dashboard') updateTestDashboardUI();
  else if (tabId === 'sales' || tabId === 'transactions') loadTransactionsData();
  else if (tabId === 'financial') loadFinancialData();
  else if (tabId === 'global') loadGlobalData();
  else if (tabId === 'api') loadApiKeysData();
  else if (tabId === 'webhooks') loadWebhooksData();
  else if (tabId === 'notifications') loadNotificationsData();
  else if (tabId === 'admin') loadAdminData();
  else if (tabId === 'acquirers') loadAcquirersData();
  else if (tabId === 'products') loadProductsData();
  else if (tabId === 'rewards') loadRewardsData();

  const sidebar = document.querySelector('.sidebar');
  if (sidebar) sidebar.classList.remove('mobile-open');
}

// 3. SSE: Escuta de Notificações em Tempo Real
function setupSSE() {
  const evtSource = new EventSource('/api/simulation/events');

  evtSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'notification') {
        handleIncomingNotification(data);
      } else if (data.type === 'charge') {
        // Notificação de venda via API oficial ou Pix em tempo real
        handleChargeNotification(data);
      } else if (data.type === 'withdrawal') {
        showToastAlert(`💸 ${data.title}: ${data.body}`);
        if (AppState.currentTab === 'financial') loadFinancialData();
        if (AppState.currentTab === 'dashboard') loadDashboardData();
      } else if (data.type === 'simulation_completed') {
        showToastAlert('Simulação de notificações KryptaPay concluída com sucesso!');
        updateSimProgress(100, 'Concluída');
      }
    } catch (e) {
      console.error('Erro SSE:', e);
    }
  };
}

// ========================================================
// SINCRONIZAÇÃO MULTI-DISPOSITIVOS (COMPUTADOR <-> CELULAR)
// ========================================================
let isSyncInProgress = false;

async function fetchCrossDeviceSync() {
  if (isSyncInProgress) return;
  isSyncInProgress = true;
  try {
    const res = await API.get(`/api/notifications/sync?since=${lastSeenSyncSeqId}`);
    if (res && res.notifications && res.notifications.length > 0) {
      for (const n of res.notifications) {
        if (n.seqId) lastSeenSyncSeqId = Math.max(lastSeenSyncSeqId, n.seqId);
        if (processedNotifIds.has(n.id)) continue;
        processedNotifIds.add(n.id);

        // Se veio de OUTRO dispositivo (ex: disparado no Notebook e recebido no Celular):
        if (n.deviceId !== myDeviceId) {
          // 1. Tocar som de venda oficial no celular
          NotificationAudio.playCashSound();
          // 2. Vibrar celular
          if (navigator.vibrate) navigator.vibrate([250, 100, 250]);
          // 3. Disparar notificação PUSH nativa na barra do celular
          await sendNativePhoneNotification(n);
          // 4. Exibir aviso flutuante
          showFloatingToast(n);
          // 5. Adicionar faturamento à Dashboard Teste
          addTestSale(n);
          // 6. Atualizar histórico
          if (!AppState.notificationsHistory) AppState.notificationsHistory = [];
          AppState.notificationsHistory.unshift(n);
          renderNotificationsList();

          const bellBadge = document.getElementById('notifBellBadge');
          if (bellBadge) bellBadge.style.display = 'block';
        }
      }
    }
  } catch (_) {
  } finally {
    isSyncInProgress = false;
  }
}

function startCrossDeviceSync() {
  fetchCrossDeviceSync();
  setInterval(fetchCrossDeviceSync, 1500);
}

// Manipular Notificação Recebida via SSE (Instantâneo)
function handleIncomingNotification(data) {
  const notif = data.notification;
  if (!notif) return;
  if (processedNotifIds.has(notif.id)) return;
  processedNotifIds.add(notif.id);
  if (notif.seqId) lastSeenSyncSeqId = Math.max(lastSeenSyncSeqId, notif.seqId);

  // Se veio de outro dispositivo
  if (notif.deviceId !== myDeviceId) {
    NotificationAudio.playCashSound();
    if (navigator.vibrate) navigator.vibrate([250, 100, 250]);
    sendNativePhoneNotification(notif);
    showFloatingToast(notif);
  }

  if (!AppState.notificationsHistory) AppState.notificationsHistory = [];
  AppState.notificationsHistory.unshift(notif);
  renderNotificationsList();

  const bellBadge = document.getElementById('notifBellBadge');
  if (bellBadge) bellBadge.style.display = 'block';

  if (data.sentCount && data.totalCount) {
    const percent = Math.round((data.sentCount / data.totalCount) * 100);
    updateSimProgress(percent, `Disparando ${data.sentCount} de ${data.totalCount}`);
  }

  addTestSale(notif);
}

// Toast Flutuante com a Logomarca Oficial
function showFloatingToast(notif) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const isApproved = notif.status === 'approved';
  const toast = document.createElement('div');
  toast.className = 'krypta-toast';

  toast.innerHTML = `
    <img src="/icons/logo.png" class="toast-logo-img" alt="KryptaPay">
    <div class="toast-body-content">
      <div class="toast-brand-header">
        <span>KRYPTAPAY</span>
        <span style="font-size: 0.65rem; color: var(--text-dim);">${notif.timestamp || 'Agora'}</span>
      </div>
      <div class="toast-title" style="color: ${isApproved ? '#fff' : '#f59e0b'};">
        ${isApproved ? '🎉 Venda aprovada!' : '⏳ Venda pendente'}
      </div>
      <div class="toast-amount" style="color: ${isApproved ? 'var(--status-success)' : 'var(--status-warning)'};">
        Valor: ${notif.amount}
      </div>
      <div class="toast-meta">
        <span>Pedido: ${notif.orderId}</span>
        <span style="color: var(--purple-400); font-weight: 600;">Pix Dinâmico</span>
      </div>
    </div>
  `;

  container.prepend(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px) scale(0.95)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

function showToastAlert(msg) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'krypta-toast';
  toast.innerHTML = `
    <img src="/icons/logo.png" class="toast-logo-img" alt="KryptaPay">
    <div class="toast-body-content">
      <div class="toast-brand-header">KRYPTAPAY SISTEMA</div>
      <div class="toast-title" style="font-size: 0.88rem; color: #fff;">${msg}</div>
    </div>
  `;
  container.prepend(toast);
  setTimeout(() => toast.remove(), 4000);
}

// ========================================================
// CENTRAL DE NOTIFICAÇÕES: DISPARO DIRETO NA BARRA DO CELULAR
// ========================================================

// Dispara a Notificação Real na Barra de Status/Notificações do Celular (Android & iOS PWA)
async function sendNativePhoneNotification(notifObj) {
  // 1. Assegurar permissão do navegador
  if ('Notification' in window) {
    if (Notification.permission !== 'granted') {
      try {
        const perm = await Notification.requestPermission();
        updateNotificationPermissionBadge();
        if (perm !== 'granted') return false;
      } catch (e) {
        return false;
      }
    }
  } else {
    return false;
  }

  const title = notifObj.title || '🎉 Venda aprovada! - KryptaPay';
  const bodyText = notifObj.nativeBody || `${notifObj.amount} • Pedido ${notifObj.orderId}\n${notifObj.subtitle || 'Pix Aprovado'}`;

  // 2. Método Oficial e Obrigatório para Celular: ServiceWorkerRegistration.showNotification
  if ('serviceWorker' in navigator) {
    try {
      let reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        reg = await navigator.serviceWorker.register('/sw.js?v=2026.3');
      }
      await navigator.serviceWorker.ready;

      if (reg && reg.showNotification) {
        await reg.showNotification(title, {
          body: bodyText,
          icon: '/icons/logo.png',
          badge: '/icons/logo.png',
          vibrate: [300, 100, 300, 100, 300],
          tag: 'kryptapay-sale-' + (notifObj.orderId || Date.now()) + '-' + Math.floor(Math.random() * 10000),
          renotify: true,
          silent: false,
          requireInteraction: false,
          data: { url: '/app.html' }
        });
        return true;
      } else if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'SHOW_NOTIFICATION',
          notification: {
            title: title,
            body: bodyText,
            url: '/app.html'
          }
        });
        return true;
      }
    } catch (swErr) {
      console.warn('Erro ao disparar via ServiceWorker:', swErr);
    }
  }

  // 3. Fallback para Desktop / navegadores legados
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body: bodyText,
        icon: '/icons/logo.png',
        badge: '/icons/logo.png'
      });
      return true;
    } catch (e) {}
  }

  return false;
}

// Disparo Único com Alternância (Aprovada ou Pendente)
async function triggerSingleTestNotification(customAmount, isPending = false) {
  const prefVibrate = document.getElementById('prefVibrateToggle') ? document.getElementById('prefVibrateToggle').checked : true;

  if (prefVibrate && navigator.vibrate) {
    navigator.vibrate([250, 100, 250]);
  }

  const selectVal = document.getElementById('notifTestAmount') ? document.getElementById('notifTestAmount').value : 'random';
  let amount = 197.00;
  if (customAmount) {
    amount = customAmount;
  } else if (selectVal !== 'random') {
    amount = parseFloat(selectVal) || 197.00;
  } else {
    const list = [47.00, 97.00, 147.00, 197.00, 297.00, 497.00];
    amount = list[Math.floor(Math.random() * list.length)];
  }

  const formattedAmount = amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const orderId = `#${10000 + Math.floor(Math.random() * 90000)}`;

  const isApproved = !isPending;
  const title = isApproved ? '🎉 Venda aprovada! - KryptaPay' : '⏳ Pix Gerado! - KryptaPay';
  const subtitle = isApproved ? 'Pix Instantâneo Aprovado' : 'Aguardando Pagamento do Cliente';

  const notifId = 'krypta_sale_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  processedNotifIds.add(notifId);

  const notifObj = {
    id: notifId,
    deviceId: myDeviceId,
    brand: 'KRYPTAPAY',
    icon: '/icons/logo.png',
    title: title,
    amount: `R$ ${formattedAmount}`,
    rawAmount: amount,
    orderId: orderId,
    status: isApproved ? 'approved' : 'pending',
    subtitle: subtitle,
    nativeBody: `Valor: R$ ${formattedAmount} • Pedido ${orderId}\n${subtitle}`,
    timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  };

  // 1. DISPARAR NOTIFICAÇÃO NATIVA NO DISPOSITIVO ATUAL
  await sendNativePhoneNotification(notifObj);

  // 2. Preencher no histórico da aba Notificações
  if (!AppState.notificationsHistory) AppState.notificationsHistory = [];
  AppState.notificationsHistory.unshift(notifObj);
  renderNotificationsList();

  // 3. Atualizar a Dashboard Teste em tempo real
  addTestSale(notifObj);

  // 4. TRANSMITIR IMEDIATAMENTE PARA TODOS OS CELULARES LOGADOS PINGAREM!
  API.post('/api/notifications/dispatch', {
    amount,
    status: notifObj.status,
    deviceId: myDeviceId,
    orderId
  }).then(res => {
    if (res && res.latestSeqId) {
      lastSeenSyncSeqId = Math.max(lastSeenSyncSeqId, res.latestSeqId);
    }
  }).catch(() => {});
}

async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    alert('Seu navegador não possui suporte a notificações nativas.');
    return;
  }
  try {
    const perm = await Notification.requestPermission();
    updateNotificationPermissionBadge();
    if (perm === 'granted') {
      showToastAlert('Notificações na barra do seu celular ativadas com sucesso!');
      // Dispara 1 teste para confirmar que apitou no celular
      triggerSingleTestNotification();
    } else {
      alert('Permissão bloqueada. Toque no ícone de configurações/cadeado da barra de endereço para permitir notificações deste site.');
    }
  } catch (e) {
    console.warn(e);
  }
}

function updateNotificationPermissionBadge() {
  const badge = document.getElementById('notifNativeStatusBadge');
  const btn = document.getElementById('btnRequestNotifPermission');
  if (!('Notification' in window)) return;

  if (Notification.permission === 'granted') {
    if (badge) {
      badge.innerHTML = '📲 Barra do Celular: <strong>ATIVADA</strong>';
      badge.style.background = 'rgba(34, 197, 94, 0.2)';
      badge.style.color = '#4ade80';
      badge.style.borderColor = 'rgba(34, 197, 94, 0.4)';
    }
    if (btn) {
      btn.innerHTML = '<span>✅</span> <span>Barra do Celular Ativa</span>';
      btn.style.borderColor = '#22c55e';
    }
  } else if (Notification.permission === 'denied') {
    if (badge) {
      badge.innerHTML = '⚠️ Notificações Bloqueadas (Toque no cadeado da URL)';
      badge.style.background = 'rgba(239, 68, 68, 0.2)';
      badge.style.color = '#f87171';
    }
  }
}

// -------------------------------------------------------------
// SISTEMA DE NOTIFICAÇÕES CONTÍNUAS (2 DIAS, NOITE, HORAS & WEB WORKER)
// -------------------------------------------------------------
let notifSeqTimer = null;
let notifSeqCurrent = 0;
let notifSeqTotal = 0;
let notifSeqIsInfinite = false;
let notifSeqIntervalSec = 120;
let notifSeqSessionStart = 0;
let simWakeLock = null;
let simTimerWorker = null;

// Gestão de Wake Lock para evitar tela apagada ou suspensão no celular
async function requestSimulationWakeLock() {
  try {
    if ('wakeLock' in navigator && !simWakeLock) {
      simWakeLock = await navigator.wakeLock.request('screen');
      simWakeLock.addEventListener('release', () => {
        simWakeLock = null;
      });
    }
  } catch (err) {
    console.log('Screen Wake Lock não suportado ou bloqueado no navegador:', err);
  }
}

function releaseSimulationWakeLock() {
  if (simWakeLock) {
    try { simWakeLock.release(); } catch (_) {}
    simWakeLock = null;
  }
}

// Inicializar Web Worker para ticks precisos em segundo plano
function initSimulationWorker() {
  if (window.Worker && !simTimerWorker) {
    try {
      simTimerWorker = new Worker('/js/timer-worker.js');
      simTimerWorker.onmessage = function(e) {
        if (e.data && e.data.type === 'TICK') {
          handleSeqTick();
        }
      };
    } catch (e) {
      console.warn('Web Worker não pôde ser instanciado, usando setInterval de fallback:', e);
      simTimerWorker = null;
    }
  }
}

// Interpretar duração selecionada pelo usuário
function parseNotifDurationValue(val) {
  switch (val) {
    case 'dur_8h': return { totalTicks: 240, durationSec: 8 * 3600, infinite: false, label: '1 Noite (8 Horas)' };
    case 'dur_24h': return { totalTicks: 720, durationSec: 24 * 3600, infinite: false, label: '24 Horas (1 Dia)' };
    case 'dur_2d': return { totalTicks: 1440, durationSec: 48 * 3600, infinite: false, label: '2 Dias (48 Horas)' };
    case 'dur_3d': return { totalTicks: 2160, durationSec: 72 * 3600, infinite: false, label: '3 Dias' };
    case 'dur_7d': return { totalTicks: 5040, durationSec: 168 * 3600, infinite: false, label: '7 Dias (1 Semana)' };
    case 'dur_10d': return { totalTicks: 7200, durationSec: 240 * 3600, infinite: false, label: '10 Dias' };
    case 'dur_infinite': return { totalTicks: Infinity, durationSec: Infinity, infinite: true, label: 'Contínuo / Infinito' };
    default: {
      const parsed = parseInt(val, 10) || 5;
      return { totalTicks: parsed, durationSec: parsed * 60, infinite: false, label: `${parsed} Notificações` };
    }
  }
}

// Iniciar sequência de notificações contínua
async function startNotificationSequence() {
  // Solicita permissão de push se ainda não concedida
  if ('Notification' in window && Notification.permission !== 'granted') {
    const perm = await Notification.requestPermission();
    updateNotificationPermissionBadge();
    if (perm !== 'granted') {
      alert('Para as notificações de venda pingarem na barra do seu celular, autorize as notificações tocando em "Permitir"!');
      return;
    }
  }

  const countSelect = document.getElementById('notifTestCount');
  const intervalSelect = document.getElementById('notifTestInterval');
  const durConfig = parseNotifDurationValue(countSelect ? countSelect.value : 'dur_2d');
  const intervalSec = parseInt(intervalSelect ? intervalSelect.value : '120', 10) || 120;

  notifSeqIntervalSec = intervalSec;
  notifSeqIsInfinite = durConfig.infinite;
  notifSeqTotal = durConfig.infinite ? Infinity : Math.max(1, Math.round(durConfig.durationSec / intervalSec));
  if (!durConfig.infinite && countSelect && !countSelect.value.startsWith('dur_')) {
    notifSeqTotal = durConfig.totalTicks;
  }
  notifSeqCurrent = 0;
  notifSeqSessionStart = Date.now();

  // Salvar sessão persistente no localStorage
  const sessionData = {
    active: true,
    startTime: notifSeqSessionStart,
    intervalSec: notifSeqIntervalSec,
    totalTicks: notifSeqTotal === Infinity ? -1 : notifSeqTotal,
    currentTicks: 0,
    isInfinite: notifSeqIsInfinite,
    lastTickTime: Date.now(),
    durationLabel: durConfig.label
  };
  localStorage.setItem('kryptapay_sim_session', JSON.stringify(sessionData));

  // Manter a tela acordada / não suspender
  requestSimulationWakeLock();

  const btnStart = document.getElementById('btnStartNotifSeq');
  const btnStop = document.getElementById('btnStopNotifSeq');
  if (btnStart) btnStart.disabled = true;
  if (btnStop) btnStop.disabled = false;

  updateNotifSeqProgressUI(`🚀 Disparos Ativos (${durConfig.label}) • Intervalo: ${intervalSec}s`);

  // Disparar o primeiro ping imediato (Venda Aprovada)
  handleSeqTick();

  // Iniciar timer com Web Worker ou setInterval
  initSimulationWorker();
  if (simTimerWorker) {
    simTimerWorker.postMessage({ action: 'start', intervalMs: intervalSec * 1000 });
  } else {
    if (notifSeqTimer) clearInterval(notifSeqTimer);
    notifSeqTimer = setInterval(handleSeqTick, intervalSec * 1000);
  }
}

// Cada disparo individual da sequência
function handleSeqTick() {
  if (!notifSeqIsInfinite && notifSeqCurrent >= notifSeqTotal) {
    stopNotificationSequence(true);
    return;
  }

  // Alterna: venda pendente (índices ímpares) e venda aprovada (índices pares)
  const isPending = (notifSeqCurrent % 2 !== 0);
  triggerSingleTestNotification(null, isPending);
  notifSeqCurrent++;

  // Atualizar sessão persistente
  try {
    const raw = localStorage.getItem('kryptapay_sim_session');
    if (raw) {
      const s = JSON.parse(raw);
      s.currentTicks = notifSeqCurrent;
      s.lastTickTime = Date.now();
      localStorage.setItem('kryptapay_sim_session', JSON.stringify(s));
    }
  } catch (_) {}

  updateNotifSeqProgressUI();

  if (!notifSeqIsInfinite && notifSeqCurrent >= notifSeqTotal) {
    stopNotificationSequence(true);
  }
}

// Atualizar interface visual do progresso de disparos
function updateNotifSeqProgressUI(customStatus) {
  const statusLabel = document.getElementById('notifSeqStatusLabel');
  const countLabel = document.getElementById('notifSeqCountLabel');
  const pBar = document.getElementById('notifSeqProgressBar');

  if (statusLabel && customStatus) {
    statusLabel.textContent = customStatus;
  } else if (statusLabel) {
    statusLabel.textContent = `📲 Pingando no celular • Intervalo: ${notifSeqIntervalSec}s`;
  }

  if (countLabel) {
    if (notifSeqIsInfinite) {
      countLabel.textContent = `${notifSeqCurrent} / ♾️ Contínuo`;
    } else {
      countLabel.textContent = `${notifSeqCurrent} / ${notifSeqTotal}`;
    }
  }

  if (pBar) {
    if (notifSeqIsInfinite) {
      pBar.style.width = '100%';
    } else {
      const pct = Math.min(100, Math.round((notifSeqCurrent / notifSeqTotal) * 100));
      pBar.style.width = `${pct}%`;
    }
  }
}

// Parar disparos
function stopNotificationSequence(completed = false) {
  if (simTimerWorker) {
    try { simTimerWorker.postMessage({ action: 'stop' }); } catch (_) {}
  }
  if (notifSeqTimer) {
    clearInterval(notifSeqTimer);
    notifSeqTimer = null;
  }
  releaseSimulationWakeLock();
  localStorage.removeItem('kryptapay_sim_session');

  const btnStart = document.getElementById('btnStartNotifSeq');
  const btnStop = document.getElementById('btnStopNotifSeq');
  if (btnStart) btnStart.disabled = false;
  if (btnStop) btnStop.disabled = true;

  const statusLabel = document.getElementById('notifSeqStatusLabel');
  if (statusLabel) {
    statusLabel.textContent = completed 
      ? `✅ Disparo concluído com sucesso! ${notifSeqCurrent} vendas pingadas no celular.` 
      : 'Disparos interrompidos pelo usuário.';
  }
}

// Recuperar sessão e repor vendas perdidas caso o aparelho tenha dormido à noite
function checkActiveSimulationSession() {
  try {
    const raw = localStorage.getItem('kryptapay_sim_session');
    if (!raw) return;
    const s = JSON.parse(raw);
    if (!s || !s.active) return;

    const now = Date.now();
    const intervalMs = (s.intervalSec || 120) * 1000;
    const elapsedSinceLast = now - (s.lastTickTime || s.startTime);
    const missedTicks = Math.floor(elapsedSinceLast / intervalMs);

    if (missedTicks > 0) {
      // Repõe no Dashboard Teste as vendas que ocorreram no período que o aparelho dormiu
      let accumulatedGross = 0;
      for (let i = 0; i < Math.min(missedTicks, 500); i++) {
        const tickIdx = (s.currentTicks || 0) + i;
        const isPending = (tickIdx % 2 !== 0);
        const amount = generateTestSaleAmount();
        recordTestSaleIntoDashboard({
          id: 'pay_sim_' + Math.random().toString(36).substr(2, 9),
          title: isPending ? 'Pix Gerado — Aguardando' : 'Venda Aprovada!',
          amount: amount,
          status: isPending ? 'pending' : 'approved',
          timestamp: new Date(s.lastTickTime + (i + 1) * intervalMs).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          customer: 'Cliente VIP #' + Math.floor(Math.random() * 9000 + 1000)
        });
        if (!isPending) accumulatedGross += amount;
      }

      s.currentTicks = (s.currentTicks || 0) + missedTicks;
      s.lastTickTime = now;
      localStorage.setItem('kryptapay_sim_session', JSON.stringify(s));

      if (missedTicks >= 1) {
        showToastAlert(`☀️ Bom dia! Durante a noite a KryptaPay processou +${missedTicks} vendas de teste (+R$ ${accumulatedGross.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}).`);
      }
    }

    const maxTicks = s.totalTicks === -1 ? Infinity : s.totalTicks;
    if (s.isInfinite || s.currentTicks < maxTicks) {
      notifSeqIntervalSec = s.intervalSec || 120;
      notifSeqIsInfinite = s.isInfinite;
      notifSeqTotal = maxTicks;
      notifSeqCurrent = s.currentTicks || 0;
      notifSeqSessionStart = s.startTime || now;

      const btnStart = document.getElementById('btnStartNotifSeq');
      const btnStop = document.getElementById('btnStopNotifSeq');
      if (btnStart) btnStart.disabled = true;
      if (btnStop) btnStop.disabled = false;

      updateNotifSeqProgressUI(`🚀 Continuando disparos em segundo plano (${s.durationLabel || 'Ativo'})...`);
      requestSimulationWakeLock();
      initSimulationWorker();
      if (simTimerWorker) {
        simTimerWorker.postMessage({ action: 'start', intervalMs: notifSeqIntervalSec * 1000 });
      } else {
        if (notifSeqTimer) clearInterval(notifSeqTimer);
        notifSeqTimer = setInterval(handleSeqTick, notifSeqIntervalSec * 1000);
      }
    } else {
      stopNotificationSequence(true);
    }
  } catch (e) {
    console.error('Erro ao verificar sessão de simulação ativa:', e);
  }
}

async function loadNotificationsData() {
  updateNotificationPermissionBadge();
  const container = document.getElementById('notificationsHistoryList');
  if (!container) return;

  if (AppState.notificationsHistory && AppState.notificationsHistory.length > 0) {
    renderNotificationsList();
    return;
  }

  const res = await API.get('/api/notifications');
  if (res && res.notifications && res.notifications.length > 0) {
    AppState.notificationsHistory = res.notifications.map(n => ({
      id: n.id,
      brand: 'KRYPTAPAY',
      icon: '/icons/logo.png',
      title: n.title,
      amount: n.amount ? `R$ ${n.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'R$ 197,00',
      orderId: n.order_id || '#10293',
      status: n.category === 'saque' ? 'completed' : 'approved',
      timestamp: new Date(n.created_at || Date.now()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    }));
  }
  renderNotificationsList();
}

function renderNotificationsList() {
  const container = document.getElementById('notificationsHistoryList');
  if (!container) return;

  if (!AppState.notificationsHistory || AppState.notificationsHistory.length === 0) {
    container.innerHTML = `
      <div style="padding: 2.5rem 1rem; text-align:center; color:var(--text-muted); font-size:0.88rem;">
        <span style="font-size:2rem; display:block; margin-bottom:0.5rem;">🔔</span>
        Nenhuma notificação registrada ainda.<br>
        Clique no botão roxo <strong>"Enviar Teste de Venda"</strong> acima para ouvir o toque e ver o aviso pingar!
      </div>
    `;
    return;
  }

  container.innerHTML = AppState.notificationsHistory.slice(0, 30).map(n => `
    <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); padding:0.9rem 1.15rem; border-radius:12px; display:flex; justify-content:space-between; align-items:center; gap:1rem;">
      <div style="display:flex; align-items:center; gap:0.85rem;">
        <img src="/icons/logo.png" style="width:38px; height:38px; border-radius:8px; border:1px solid rgba(176,38,255,0.4);" alt="Logo">
        <div>
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <strong style="color:#fff; font-size:0.92rem;">${n.title || 'Venda aprovada!'}</strong>
            <span style="font-size:0.75rem; color:var(--text-dim);">${n.timestamp || 'Agora'}</span>
          </div>
          <div style="font-size:0.78rem; color:var(--text-muted);">Pedido: <span style="color:#c084fc;">${n.orderId || '#10001'}</span> • Pix Dinâmico Instantâneo</div>
        </div>
      </div>
      <div style="text-align:right;">
        <span style="font-size:1rem; font-weight:800; color:var(--status-success);">${n.amount}</span>
        <div><span class="badge-status badge-approved" style="font-size:0.68rem; padding:0.15rem 0.45rem;">Aprovada</span></div>
      </div>
    </div>
  `).join('');
}

function clearNotificationHistory() {
  AppState.notificationsHistory = [];
  renderNotificationsList();
  showToastAlert('Histórico de notificações limpo.');
}

function toggleMobileSidebar() {
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) sidebar.classList.toggle('mobile-open');
}

function openIntegrationModal(platform) {
  showToastAlert(`Integração com ${platform}: Utilize suas chaves de API para conectar.`);
  switchTab('api');
}

// 4. Carregamento dos Dados da Dashboard Real (10 Indicadores)
async function loadDashboardData() {
  const res = await API.get('/api/dashboard/metrics');
  if (!res || !res.indicators) return;

  const ind = res.indicators;
  document.getElementById('metric-faturamento').textContent = `R$ ${ind.faturamento_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  document.getElementById('metric-disponivel').textContent = `R$ ${ind.saldo_disponivel.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  document.getElementById('metric-pendente').textContent = `R$ ${ind.saldo_pendente.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  document.getElementById('metric-retencao').textContent = `R$ ${ind.saldo_retencao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  document.getElementById('metric-aprovadas').textContent = ind.vendas_aprovadas;
  document.getElementById('metric-vendas-pendentes').textContent = ind.vendas_pendentes;
  document.getElementById('metric-recusadas').textContent = ind.vendas_recusadas;
  document.getElementById('metric-taxa').textContent = ind.taxa_aprovacao;
  document.getElementById('metric-ticket').textContent = `R$ ${parseFloat(ind.ticket_medio).toFixed(2).replace('.', ',')}`;
  document.getElementById('metric-reembolsos').textContent = `R$ ${ind.total_reembolsos.toFixed(2).replace('.', ',')}`;

  renderChart(res.chart);
}

function renderChart(chartData) {
  const canvas = document.getElementById('revenueChartCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.parentElement.clientWidth || 800;
  const h = canvas.height = 240;

  ctx.clearRect(0, 0, w, h);

  const points = (chartData && chartData.data && chartData.data.length) ? chartData.data : [0, 0, 0, 0, 0, 0, 0];
  const max = (Math.max(...points, 100)) * 1.15;
  const stepX = (w - 60) / (points.length - 1);

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(139, 92, 246, 0.4)');
  grad.addColorStop(1, 'rgba(139, 92, 246, 0.0)');

  ctx.beginPath();
  ctx.moveTo(30, h - 20);
  points.forEach((val, i) => {
    const x = 30 + i * stepX;
    const y = (h - 30) - (val / max) * (h - 60);
    ctx.lineTo(x, y);
  });
  ctx.lineTo(30 + (points.length - 1) * stepX, h - 20);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  points.forEach((val, i) => {
    const x = 30 + i * stepX;
    const y = (h - 30) - (val / max) * (h - 60);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#a855f7';
  ctx.lineWidth = 3;
  ctx.stroke();

  points.forEach((val, i) => {
    const x = 30 + i * stepX;
    const y = (h - 30) - (val / max) * (h - 60);
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#7c3aed';
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

// 5. Vendas Reais
async function loadTransactionsData() {
  const res = await API.get('/api/transactions');
  const salesTbody = document.getElementById('salesTableBody');
  const transTbody = document.getElementById('transactionsTableBody');
  const transactions = (res && res.transactions) ? res.transactions : [];

  const html = transactions.map(t => {
    let badgeClass = 'badge-pending';
    let badgeLabel = 'Pendente';
    if (t.status === 'approved') { badgeClass = 'badge-approved'; badgeLabel = 'Aprovada'; }
    else if (t.status === 'refused') { badgeClass = 'badge-refused'; badgeLabel = 'Recusada'; }

    return `
      <tr>
        <td style="font-weight:700; color:var(--purple-400);">${t.order_id}</td>
        <td>${t.customer_name || 'Cliente Direto'}</td>
        <td style="font-weight:700;">R$ ${t.amount.toFixed(2).replace('.', ',')}</td>
        <td style="color:var(--status-success);">R$ ${t.net_amount.toFixed(2).replace('.', ',')}</td>
        <td><span class="badge-status ${badgeClass}">${badgeLabel}</span></td>
        <td>${(t.payment_method || 'PIX').toUpperCase()}</td>
        <td style="font-size:0.8rem; color:var(--text-dim);">${new Date(t.created_at).toLocaleDateString('pt-BR')} ${new Date(t.created_at).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}</td>
      </tr>
    `;
  }).join('');

  if (salesTbody) salesTbody.innerHTML = html;
  if (transTbody) transTbody.innerHTML = html;
}

let currentQuickPix = null;
let quickPixAutoTimer = null;

// 6. Pagamento Rápido Pix Dinâmico
async function generateQuickPix() {
  const amountInput = document.getElementById('quickPixAmount');
  const nameInput = document.getElementById('quickPixName');
  const phoneInput = document.getElementById('quickPixPhone');

  const amount = amountInput ? parseFloat(amountInput.value) : 0;
  const name = nameInput && nameInput.value.trim() ? nameInput.value.trim() : 'Cliente Cobrança';
  const phone = phoneInput ? phoneInput.value.trim() : '';

  if (!amount || isNaN(amount) || amount <= 0) {
    alert('Informe um valor válido para a cobrança Pix (ex: 400).');
    return;
  }

  const res = await API.post('/api/payments/quick-pix', {
    amount: amount,
    customer_name: name,
    customer_phone: phone
  });

  if (res && res.success) {
    const formattedAmount = amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    currentQuickPix = {
      txId: res.transaction_id,
      orderId: res.order_id || ('#' + (10000 + Math.floor(Math.random() * 90000))),
      amount: amount,
      formattedAmount: formattedAmount,
      name: name,
      phone: phone,
      paid: false
    };

    document.getElementById('pixResultArea').style.display = 'block';
    document.getElementById('pixQrContainer').innerHTML = res.qr_code_svg;
    document.getElementById('pixCopyCode').value = res.copy_paste;
    document.getElementById('pixAmountLabel').textContent = `R$ ${formattedAmount}`;
    const payerEl = document.getElementById('pixPayerLabel');
    if (payerEl) payerEl.textContent = `Pagador: ${name} ${phone ? '• ' + phone : ''}`;

    const statusBadge = document.getElementById('pixStatusBadge');
    if (statusBadge) {
      statusBadge.className = 'badge-status badge-pending';
      statusBadge.textContent = '⏳ Aguardando Pagamento do Cliente';
    }

    const timerBadge = document.getElementById('pixNotifTimerBadge');
    if (timerBadge) timerBadge.textContent = '⏳ Notificação de Pix Gerado enviada!';

    const btnSimulate = document.getElementById('btnSimulatePixPaid');
    if (btnSimulate) {
      btnSimulate.disabled = false;
      btnSimulate.innerHTML = '⚡ Simular Pagamento do Pagador (Receber Venda Agora)';
    }

    // 1. PINGAR NOTIFICAÇÃO NATIVA DE VENDA PENDENTE / PIX GERADO NO CELULAR DO CLIENTE
    sendNativePhoneNotification({
      title: '⏳ Pix Gerado! - KryptaPay',
      nativeBody: `Cobrança de R$ ${formattedAmount} enviada para ${name} aguardando pagamento.`,
      tag: 'kryptapay-pix-pending-' + Date.now()
    });

    showToastAlert(`⚡ Cobrança Pix de R$ ${formattedAmount} gerada com sucesso! Notificação enviada.`);

    // Iniciar contagem regressiva automática (7 segundos) para simular o pagamento do pagador se não clicado
    if (quickPixAutoTimer) clearTimeout(quickPixAutoTimer);
    let secondsLeft = 7;
    const updateCountdown = () => {
      if (!currentQuickPix || currentQuickPix.paid) return;
      if (timerBadge) timerBadge.textContent = `Aguardando transferência Pix (${secondsLeft}s)...`;
      if (secondsLeft <= 0) {
        simulateQuickPixPaid();
      } else {
        secondsLeft--;
        quickPixAutoTimer = setTimeout(updateCountdown, 1000);
      }
    };
    quickPixAutoTimer = setTimeout(updateCountdown, 1000);
  }
}

async function simulateQuickPixPaid() {
  if (quickPixAutoTimer) {
    clearTimeout(quickPixAutoTimer);
    quickPixAutoTimer = null;
  }
  if (!currentQuickPix || currentQuickPix.paid) return;
  currentQuickPix.paid = true;

  const { amount, formattedAmount, name, orderId } = currentQuickPix;

  // 1. DISPARAR NOTIFICAÇÃO NATIVA DE VENDA APROVADA DIRETO NA BARRA DO CELULAR
  sendNativePhoneNotification({
    title: '🎉 Venda aprovada! - KryptaPay',
    nativeBody: `R$ ${formattedAmount} recebido via Pix de ${name}!\nPedido ${orderId} aprovado.`,
    tag: 'kryptapay-sale-approved-' + Date.now()
  });

  // 2. Atualizar UI da Cobrança Pix
  const statusBadge = document.getElementById('pixStatusBadge');
  if (statusBadge) {
    statusBadge.className = 'badge-status badge-approved';
    statusBadge.innerHTML = '✅ Venda Aprovada! Pix Pago com Sucesso!';
  }

  const timerBadge = document.getElementById('pixNotifTimerBadge');
  if (timerBadge) {
    timerBadge.textContent = '🎉 Venda Aprovada & Notificada no Celular!';
    timerBadge.style.color = '#4ade80';
  }

  const btnSimulate = document.getElementById('btnSimulatePixPaid');
  if (btnSimulate) {
    btnSimulate.disabled = true;
    btnSimulate.innerHTML = '✅ Pagamento Confirmado e Saldo Liberado';
  }

  // 3. Atualizar Dashboard Real com o faturamento
  const faturamentoEl = document.getElementById('metric-faturamento');
  const disponivelEl = document.getElementById('metric-disponivel');
  const aprovadasEl = document.getElementById('metric-aprovadas');

  const curFat = parseFloat(localStorage.getItem('krypta_real_fat') || '0') + amount;
  const curDisp = parseFloat(localStorage.getItem('krypta_real_disp') || '0') + (amount * 0.98);
  const curAprov = parseInt(localStorage.getItem('krypta_real_aprov') || '0', 10) + 1;

  localStorage.setItem('krypta_real_fat', curFat);
  localStorage.setItem('krypta_real_disp', curDisp);
  localStorage.setItem('krypta_real_aprov', curAprov);

  if (faturamentoEl) faturamentoEl.textContent = `R$ ${curFat.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (disponivelEl) disponivelEl.textContent = `R$ ${curDisp.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (aprovadasEl) aprovadasEl.textContent = curAprov;

  // 4. Inserir venda no topo das tabelas de vendas e transações
  const salesTbody = document.getElementById('salesTableBody');
  const transTbody = document.getElementById('transactionsTableBody');
  const rowHtml = `
    <tr>
      <td style="font-weight:700; color:var(--purple-400);">${orderId}</td>
      <td>${name}</td>
      <td style="font-weight:700;">R$ ${formattedAmount}</td>
      <td style="color:var(--status-success);">R$ ${(amount * 0.98).toFixed(2).replace('.', ',')}</td>
      <td><span class="badge-status badge-approved">Aprovada</span></td>
      <td>PIX</td>
      <td style="font-size:0.8rem; color:var(--text-dim);">${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}</td>
    </tr>
  `;
  if (salesTbody) salesTbody.insertAdjacentHTML('afterbegin', rowHtml);
  if (transTbody) transTbody.insertAdjacentHTML('afterbegin', rowHtml);

  showToastAlert(`🎉 Venda Pix de R$ ${formattedAmount} aprovada com sucesso! Saldo adicionado à Dashboard.`);
}

function copyPixCode() {
  const input = document.getElementById('pixCopyCode');
  input.select();
  navigator.clipboard.writeText(input.value);
  showToastAlert('Código Pix Copia e Cola copiado!');
}

// 7. Financeiro & Saques Pix
async function loadFinancialData() {
  const res = await API.get('/api/financial/overview');
  if (!res) return;

  if (res.wallet) {
    document.getElementById('finAvailable').textContent = `R$ ${res.wallet.balance_available.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    document.getElementById('finPending').textContent = `R$ ${res.wallet.balance_pending.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    document.getElementById('finRetained').textContent = `R$ ${res.wallet.balance_retained.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  }

  const tbody = document.getElementById('withdrawalsTableBody');
  if (tbody && res.withdrawals) {
    tbody.innerHTML = res.withdrawals.map(w => `
      <tr>
        <td style="font-weight:600;">${w.id.substring(0, 8)}...</td>
        <td style="font-weight:700;">R$ ${w.amount.toFixed(2).replace('.', ',')}</td>
        <td style="color:var(--text-dim);">R$ ${w.fee.toFixed(2).replace('.', ',')}</td>
        <td style="color:var(--status-success); font-weight:700;">R$ ${w.net_amount.toFixed(2).replace('.', ',')}</td>
        <td><code>${w.pix_key}</code> (${w.pix_key_type})</td>
        <td><span class="badge-status badge-pending">${w.status.toUpperCase()}</span></td>
        <td style="font-size:0.8rem; color:var(--text-dim);">${new Date(w.created_at).toLocaleDateString('pt-BR')}</td>
      </tr>
    `).join('');
  }
}

async function requestWithdrawal() {
  const amount = document.getElementById('withdrawAmount').value;
  const pixKey = document.getElementById('withdrawPixKey').value;
  const pixType = document.getElementById('withdrawPixType').value;

  if (!amount || !pixKey) {
    alert('Preencha o valor e a chave Pix.');
    return;
  }

  const res = await API.post('/api/financial/withdraw', {
    amount: parseFloat(amount),
    pix_key: pixKey,
    pix_key_type: pixType
  });

  if (res.error) {
    alert(res.error);
  } else {
    showToastAlert('Solicitação de saque Pix registrada com sucesso!');
    loadFinancialData();
  }
}

// 8. Adquirentes & Smart Routing
async function loadAcquirersData() {
  const res = await API.get('/api/acquirers');
  const container = document.getElementById('acquirersList');
  if (!container || !res.acquirers) return;

  container.innerHTML = res.acquirers.map(acq => `
    <div class="glass-card" style="padding: 1.5rem; display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
      <div style="display:flex; align-items:center; gap:1.25rem;">
        <div class="brand-icon" style="background: rgba(139, 92, 246, 0.2); font-weight:800; font-size:1.1rem; color:var(--purple-400);">
          ${acq.name.substring(0, 2).toUpperCase()}
        </div>
        <div>
          <div style="font-size: 1.1rem; font-weight:700; color:#fff;">${acq.name}</div>
          <div style="font-size: 0.8rem; color:var(--text-muted); margin-top:2px;">
            Taxa Pix: <strong>${acq.fee_pix_percent}%</strong> | Cartão: <strong>${acq.fee_card_percent}%</strong> | Prioridade: #${acq.priority}
          </div>
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:1rem;">
        <span class="badge-status badge-approved">Conectado</span>
        <button class="btn-secondary" style="padding:0.4rem 0.8rem; font-size:0.8rem;">Credenciais</button>
      </div>
    </div>
  `).join('');
}

// 9. Central de Notificações & Simulação (1 a 100)
async function startSimulationRun() {
  const count = document.getElementById('simCountSelect').value;
  const speed = document.getElementById('simSpeedSelect').value;
  const interval = document.getElementById('simCustomInterval').value;
  const adSpend = document.getElementById('simAdSpend').value;

  const res = await API.post('/api/simulation/start', {
    count: parseInt(count, 10),
    speed,
    interval_seconds: parseInt(interval, 10) || 5,
    ad_spend: parseFloat(adSpend) || 0
  });

  if (res.success) {
    showToastAlert(`Simulação iniciada! Serão disparadas ${res.totalCount} notificações.`);
    updateSimProgress(0, `Iniciando ${res.totalCount} eventos`);
  }
}

async function pauseSimulationRun() {
  await API.post('/api/simulation/pause', {});
  showToastAlert('Simulação pausada.');
}

async function cancelSimulationRun() {
  await API.post('/api/simulation/cancel', {});
  showToastAlert('Simulação cancelada.');
  updateSimProgress(0, 'Cancelada');
}

function updateSimProgress(percent, label) {
  const bar = document.getElementById('simProgressBar');
  const labelEl = document.getElementById('simProgressLabel');
  if (bar) bar.style.width = `${percent}%`;
  if (labelEl) labelEl.textContent = label;
}

// 10. Dashboard de Testes
async function loadTestDashboardData() {
  const res = await API.get('/api/simulation/metrics');
  if (!res) return;

  const t = res.totals || {};
  document.getElementById('simMetricTotal').textContent = t.total_notifications || 0;
  document.getElementById('simMetricApproved').textContent = t.approved_count || 0;
  document.getElementById('simMetricPending').textContent = t.pending_count || 0;
  document.getElementById('simMetricFaturamento').textContent = `R$ ${(t.approved_amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  document.getElementById('simMetricPendingAmount').textContent = `R$ ${(t.pending_amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  document.getElementById('simMetricTicket').textContent = `R$ ${(t.avg_ticket || 0).toFixed(2).replace('.', ',')}`;

  document.getElementById('simMetricAdSpend').textContent = `R$ ${(res.adSpend || 0).toFixed(2).replace('.', ',')}`;
  document.getElementById('simMetricROI').textContent = res.simulatedROI || '0.0%';
}

// 11. Premiações 3D
async function loadRewardsData() {
  const res = await API.get('/api/rewards');
  if (!res) return;

  document.getElementById('rewardsRevenueLabel').textContent = `R$ ${(res.eligible_revenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

  const grid = document.getElementById('trophyPlaquesGrid');
  if (grid && res.plaques) {
    grid.innerHTML = res.plaques.map(p => `
      <div class="trophy-card">
        <div class="trophy-inner ${p.unlocked ? '' : 'locked'}" style="padding:1.25rem;">
          <div style="position:relative; width:100%; border-radius:14px; overflow:hidden; border:2px solid rgba(176,38,255,0.4); margin-bottom:1rem; box-shadow:0 10px 25px rgba(0,0,0,0.6);">
            <img src="${p.image}" style="width:100%; height:auto; display:block; object-fit:cover;" alt="${p.title}">
          </div>
          <h4 style="font-size: 1.15rem; font-weight:800; color:#fff; margin-bottom:0.25rem;">${p.title}</h4>
          <p style="font-size: 0.85rem; color: var(--purple-neon); margin-bottom:0.5rem; font-weight:700;">Meta: R$ ${p.target.toLocaleString('pt-BR')}</p>
          <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom:1rem;">${p.description || ''}</p>
          <span class="badge-status ${p.unlocked ? 'badge-approved' : 'badge-pending'}">
            ${p.unlocked ? '✨ Conquistada!' : '🔒 Em Progresso'}
          </span>
        </div>
      </div>
    `).join('');
  }

  // Renderizar Pulseiras Oficiais
  const wristbandsGrid = document.getElementById('wristbandsGrid');
  if (wristbandsGrid && res.bracelets) {
    wristbandsGrid.innerHTML = res.bracelets.map(b => `
      <div class="trophy-card">
        <div class="trophy-inner ${b.unlocked ? '' : 'locked'}" style="padding:1.25rem;">
          <div style="position:relative; width:100%; border-radius:14px; overflow:hidden; border:2px solid rgba(176,38,255,0.4); margin-bottom:1rem; box-shadow:0 10px 25px rgba(0,0,0,0.6);">
            <img src="${b.image}" style="width:100%; height:auto; display:block; object-fit:cover;" alt="${b.color}">
          </div>
          <h4 style="font-size: 1.15rem; font-weight:800; color:#fff; margin-bottom:0.25rem;">${b.color}</h4>
          <p style="font-size: 0.85rem; color: var(--purple-400); margin-bottom:0.5rem; font-weight:700;">${b.description}</p>
          <span class="badge-status ${b.unlocked ? 'badge-approved' : 'badge-pending'}">
            ${b.unlocked ? '✨ Liberada!' : '🔒 Em Progresso'}
          </span>
        </div>
      </div>
    `).join('');
  }

  if (res.specialIPhone) {
    document.getElementById('iphoneProgressPercent').textContent = `${res.specialIPhone.progress_percent}%`;
    document.getElementById('iphoneProgressBar').style.width = `${res.specialIPhone.progress_percent}%`;
  }
}

// 12. Produtos
async function loadProductsData() {
  const res = await API.get('/api/products');
  const list = document.getElementById('productsGrid');
  if (!list || !res.products) return;

  list.innerHTML = res.products.map(p => `
    <div class="glass-card" style="padding: 1.5rem; display:flex; flex-direction:column; justify-content:space-between;">
      <div>
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.75rem;">
          <span class="badge-status badge-approved" style="text-transform:uppercase;">${p.product_type}</span>
          <span style="font-size: 1.35rem; font-weight:800; color:#fff;">R$ ${p.price.toFixed(2).replace('.', ',')}</span>
        </div>
        <h4 style="font-size:1.1rem; font-weight:700; color:#fff; margin-bottom:0.4rem;">${p.name}</h4>
        <p style="font-size:0.85rem; color:var(--text-muted); line-height:1.5;">${p.description || 'Sem descrição cadastrada.'}</p>
      </div>
      <div style="margin-top:1.5rem; display:flex; gap:0.5rem;">
        <button class="btn-primary" style="flex:1; justify-content:center; padding:0.5rem;">Criar Checkout</button>
        <button class="btn-secondary" style="padding:0.5rem 0.8rem;">Editar</button>
      </div>
    </div>
  `).join('');
}

function setupModalListeners() {
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.style.display = 'none';
    });
  });
}

// ------------------------------------------------------------------
// NOTIFICAÇÕES DE TRANSAÇÃO REAL (COM FOTO DA LOGOMARCA OFICIAL)
// ------------------------------------------------------------------
function handleChargeNotification(chargeEvent) {
  const isApproved = chargeEvent.event === 'payment.approved';

  // Som de venda
  NotificationAudio.playCashSound();

  const container = document.getElementById('toastContainer');
  if (container) {
    const toast = document.createElement('div');
    toast.className = 'krypta-toast';
    toast.innerHTML = `
      <img src="/icons/logo.png" class="toast-logo-img" alt="KryptaPay">
      <div class="toast-body-content">
        <div class="toast-brand-header">
          <span>KRYPTAPAY GATEWAY</span>
          <span style="font-size: 0.65rem; color: var(--text-dim);">Agora</span>
        </div>
        <div class="toast-title" style="color: ${isApproved ? '#fff' : '#f59e0b'};">
          ${isApproved ? '🎉 Venda Aprovada!' : '⏳ Venda Pendente (Pix Emitido)'}
        </div>
        <div class="toast-amount" style="color: ${isApproved ? 'var(--status-success)' : 'var(--status-warning)'};">
          R$ ${chargeEvent.amount.toFixed(2).replace('.', ',')}
        </div>
        <div class="toast-meta">
          <span>Pedido: ${chargeEvent.order_id}</span>
          <span style="color: var(--purple-400); font-weight: 600;">${isApproved ? 'Saldo Creditado' : 'Aguardando Pagamento'}</span>
        </div>
      </div>
    `;
    container.prepend(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px) scale(0.95)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 5500);
  }

  // Recarregar métricas da dashboard se estiver visível
  if (AppState.currentTab === 'dashboard') loadDashboardData();
  if (AppState.currentTab === 'sales' || AppState.currentTab === 'transactions') loadTransactionsData();
}

// ------------------------------------------------------------------
// MÓDULO 13: GLOBAL FX MULTI-MOEDA
// ------------------------------------------------------------------
async function loadGlobalData() {
  const res = await API.get('/api/global/countries');
  const container = document.getElementById('globalCountriesList');
  if (!container || !res || !res.countries) return;

  container.innerHTML = res.countries.map(c => `
    <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); padding:0.9rem 1rem; border-radius:10px; display:flex; justify-content:space-between; align-items:center;">
      <div style="display:flex; align-items:center; gap:0.75rem;">
        <span style="font-size:1.6rem;">${c.flag_emoji}</span>
        <div>
          <strong style="color:#fff; font-size:0.95rem;">${c.name}</strong>
          <div style="font-size:0.78rem; color:var(--text-muted);">Moeda: <span style="color:#22d3ee; font-weight:600;">${c.currency}</span> (${c.code})</div>
        </div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:0.85rem; font-weight:700; color:#fff;">1 ${c.currency} = R$ ${c.exchange_rate_to_brl.toFixed(2)}</div>
        <span class="badge-status badge-approved" style="font-size:0.7rem; padding:0.2rem 0.5rem;">Ativo FX</span>
      </div>
    </div>
  `).join('');
}

async function calculateFxConversion() {
  const amount = document.getElementById('fxInputAmount').value;
  const from = document.getElementById('fxFromCurrency').value;
  const to = document.getElementById('fxToCurrency').value;

  if (!amount || parseFloat(amount) <= 0) {
    alert('Informe um valor válido para conversão.');
    return;
  }

  const res = await API.post('/api/global/convert', {
    amount: parseFloat(amount),
    from_currency: from,
    to_currency: to
  });

  if (res && res.converted_amount !== undefined) {
    const card = document.getElementById('fxResultCard');
    const amtEl = document.getElementById('fxConvertedAmount');
    const infoEl = document.getElementById('fxSpreadInfo');

    card.style.display = 'block';
    amtEl.textContent = `${to} ${res.converted_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    infoEl.textContent = `Cotação: 1 ${from} = ${res.exchange_rate} ${to} • Spread transparente de ${res.spread_percent}% (${to} ${res.spread_amount})`;
  }
}

// ------------------------------------------------------------------
// MÓDULO 14: INTEGRAÇÕES & API KEYS (SANDBOX & PRODUÇÃO)
// ------------------------------------------------------------------
let activeApiEnv = 'production';
let currentApiSnippets = {
  curl: `curl -X POST https://api.kryptapay.com/api/v1/charges \\
  -H "Authorization: Bearer krypta_sec_live_SEU_TOKEN_AQUI" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: pedido_10928_xyz" \\
  -d '{
    "amount": 97.00,
    "payment_method": "pix",
    "customer": {
      "name": "Comprador Exemplo",
      "email": "cliente@email.com",
      "phone": "+5511999998888"
    }
  }'`,
  node: `const response = await fetch('https://api.kryptapay.com/api/v1/charges', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer krypta_sec_live_SEU_TOKEN_AQUI',
    'Content-Type': 'application/json',
    'Idempotency-Key': 'pedido_10928_xyz'
  },
  body: JSON.stringify({
    amount: 97.00,
    payment_method: 'pix',
    customer: {
      name: 'Comprador Exemplo',
      email: 'cliente@email.com'
    }
  })
});
const data = await response.json();
console.log('Pix Copia e Cola:', data.pix.copy_paste);`,
  python: `import requests

url = "https://api.kryptapay.com/api/v1/charges"
headers = {
    "Authorization": "Bearer krypta_sec_live_SEU_TOKEN_AQUI",
    "Content-Type": "application/json",
    "Idempotency-Key": "pedido_10928_xyz"
}
payload = {
    "amount": 97.00,
    "payment_method": "pix",
    "customer": {
        "name": "Comprador Exemplo",
        "email": "cliente@email.com"
    }
}

response = requests.post(url, json=payload, headers=headers)
print(response.json())`
};

let activeSnippetLang = 'curl';

function setApiCodeTab(lang) {
  activeSnippetLang = lang;
  document.getElementById('btnCodeCurl').classList.toggle('active', lang === 'curl');
  document.getElementById('btnCodeNode').classList.toggle('active', lang === 'node');
  document.getElementById('btnCodePython').classList.toggle('active', lang === 'python');
  document.getElementById('apiCodeBlock').textContent = currentApiSnippets[lang];
}

function copyCurrentCodeSnippet() {
  navigator.clipboard.writeText(currentApiSnippets[activeSnippetLang]);
  showToastAlert('Exemplo de código copiado para a área de transferência!');
}

function switchApiKeyTab(env) {
  activeApiEnv = env;
  document.getElementById('tabKeyProd').classList.toggle('active', env === 'production');
  document.getElementById('tabKeySand').classList.toggle('active', env === 'sandbox');
  loadApiKeysData();
}

async function loadApiKeysData() {
  const res = await API.get('/api/api-keys');
  const container = document.getElementById('apiKeysList');
  if (!container || !res || !res.keys) return;

  const filtered = res.keys.filter(k => k.environment === activeApiEnv);

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:2rem; color:var(--text-muted);">
        Nenhuma chave de ${activeApiEnv === 'production' ? 'Produção' : 'Sandbox'} encontrada. Clique em "+ Gerar Nova Chave" acima.
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(k => `
    <div class="glass-card" style="padding:1.25rem; margin-bottom:1rem; border-left:3px solid ${k.environment === 'production' ? '#10b981' : '#f59e0b'};">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:0.75rem;">
        <div>
          <strong style="color:#fff; font-size:1.05rem;">${k.name}</strong>
          <span style="font-size:0.75rem; color:var(--text-dim); margin-left:0.5rem;">Criada em ${new Date(k.created_at).toLocaleDateString('pt-BR')}</span>
        </div>
        <span class="badge-status ${k.status === 'active' ? 'badge-approved' : 'badge-refused'}">${k.status.toUpperCase()}</span>
      </div>

      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:1rem;">
        <div>
          <label style="font-size:0.8rem; color:var(--text-muted);">Chave Pública (Frontend / Checkout):</label>
          <div style="display:flex; gap:0.4rem; margin-top:0.2rem;">
            <input type="text" readonly value="${k.public_key}" class="glass-card" style="flex:1; padding:0.5rem 0.7rem; font-size:0.8rem; color:#a78bfa; background:var(--bg-surface);">
            <button onclick="navigator.clipboard.writeText('${k.public_key}'); showToastAlert('Chave Pública copiada!');" class="btn-secondary" style="padding:0.4rem 0.75rem; font-size:0.8rem;">Copiar</button>
          </div>
        </div>

        <div>
          <label style="font-size:0.8rem; color:var(--text-muted);">Chave Secreta (Backend):</label>
          <div style="display:flex; gap:0.4rem; margin-top:0.2rem;">
            <input type="text" readonly value="${k.secret_key_preview}" class="glass-card" style="flex:1; padding:0.5rem 0.7rem; font-size:0.8rem; color:var(--text-dim); background:var(--bg-surface);">
            <button onclick="revokeApiKey('${k.id}')" class="btn-secondary" style="padding:0.4rem 0.75rem; font-size:0.8rem; color:var(--status-danger);">Revogar</button>
          </div>
        </div>
      </div>
    </div>
  `).join('');
}

async function showGenerateKeyModal() {
  const name = prompt('Nome de identificação da Chave (ex: Minha Loja Shopify, Checkout Principal):', 'Chave Oficial');
  if (!name) return;

  const res = await API.post('/api/api-keys/generate', {
    name,
    environment: activeApiEnv
  });

  if (res && res.key) {
    alert(`🔑 ATENÇÃO! Guarde sua Chave Secreta agora:\n\n${res.key.secret_key}\n\nPor motivos de segurança financeira, ela NÃO será exibida novamente!`);
    loadApiKeysData();
  }
}

async function revokeApiKey(keyId) {
  if (!confirm('Deseja realmente revogar esta Chave de API? Qualquer integração que utilize ela parará de funcionar.')) return;
  await API.post('/api/api-keys/revoke', { key_id: keyId });
  showToastAlert('Chave de API revogada com sucesso.');
  loadApiKeysData();
}

// ------------------------------------------------------------------
// MÓDULO 15: WEBHOOKS & EVENTOS
// ------------------------------------------------------------------
async function loadWebhooksData() {
  const res = await API.get('/api/webhooks');
  if (res && res.webhooks && res.webhooks.length > 0) {
    const hook = res.webhooks[0];
    document.getElementById('webhookInputUrl').value = hook.url;
    document.getElementById('webhookSecretKey').value = hook.secret_key;
  }

  // Carregar entregas recentes
  const delivRes = await API.get('/api/webhooks/deliveries');
  const tbody = document.getElementById('webhookDeliveriesTableBody');
  if (tbody && delivRes && delivRes.deliveries) {
    if (delivRes.deliveries.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:1.5rem;">Nenhum disparo de webhook registrado ainda. Faça um teste abaixo.</td></tr>`;
      return;
    }

    tbody.innerHTML = delivRes.deliveries.map(d => `
      <tr>
        <td><strong style="color:#a78bfa;">${d.event}</strong></td>
        <td style="font-family:monospace; font-size:0.8rem; color:var(--text-muted);">${d.url.substring(0, 35)}...</td>
        <td>
          <span class="badge-status ${d.status === 'success' ? 'badge-approved' : 'badge-refused'}">
            HTTP ${d.status_code || '0'} (${d.status.toUpperCase()})
          </span>
        </td>
        <td style="font-size:0.85rem;">${d.response_time_ms || 0} ms</td>
        <td><code style="font-size:0.75rem; color:var(--text-dim);">${d.signature.substring(0, 16)}...</code></td>
        <td style="font-size:0.8rem; color:var(--text-dim);">${new Date(d.created_at).toLocaleTimeString('pt-BR')}</td>
      </tr>
    `).join('');
  }
}

async function saveWebhookConfig() {
  const url = document.getElementById('webhookInputUrl').value;
  if (!url || !url.startsWith('http')) {
    alert('Digite uma URL válida (http:// ou https://)');
    return;
  }

  const res = await API.post('/api/webhooks', { url, events: 'all' });
  if (res && res.success) {
    showToastAlert('Configurações de Webhook salvas com sucesso!');
    loadWebhooksData();
  }
}

function copyWebhookSecret() {
  const secret = document.getElementById('webhookSecretKey').value;
  navigator.clipboard.writeText(secret);
  showToastAlert('Chave Secreta do Webhook copiada!');
}

async function triggerWebhookTest() {
  const targetUrl = document.getElementById('webhookInputUrl').value;
  const secretKey = document.getElementById('webhookSecretKey').value;

  if (!targetUrl) {
    alert('Preencha a URL de destino do Webhook antes de disparar o teste.');
    return;
  }

  showToastAlert('Enviando requisição de teste assinada HMAC-SHA256...');

  const res = await API.post('/api/webhooks/test', {
    target_url: targetUrl,
    secret_key: secretKey,
    event: 'payment.approved'
  });

  const card = document.getElementById('webhookTestResultCard');
  if (card && res && res.testResult) {
    card.style.display = 'block';
    const t = res.testResult;
    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
        <strong style="color:#fff;">Resultado do Disparo de Teste:</strong>
        <span class="badge-status ${t.success ? 'badge-approved' : 'badge-refused'}">
          HTTP ${t.statusCode} (${t.success ? 'Sucesso' : 'Falha na Entrega'})
        </span>
      </div>
      <div style="font-size:0.82rem; color:var(--text-muted); margin-bottom:0.5rem;">
        Tempo de Resposta: <strong>${t.responseTimeMs} ms</strong> | Assinatura Enviada: <code style="color:#a78bfa;">${t.signature}</code>
      </div>
      <pre style="background:#090614; padding:0.8rem; border-radius:6px; font-size:0.78rem; color:#e2e8f0; overflow-x:auto;">${t.responseBody || 'Sem resposta do servidor'}</pre>
    `;
    loadWebhooksData();
  }
}

// ------------------------------------------------------------------
// MÓDULO 16: PAINEL ADMIN MASTER & TAXAS DINÂMICAS
// ------------------------------------------------------------------
async function loadAdminData() {
  // 1. Resumo financeiro do Gateway
  const summary = await API.get('/api/admin/financial-summary');
  if (summary) {
    document.getElementById('adminTotalVolume').textContent = `R$ ${(summary.total_volume || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    document.getElementById('adminGatewayRev').textContent = `R$ ${(summary.gateway_revenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    document.getElementById('adminProcessorCost').textContent = `R$ ${(summary.processor_cost || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    document.getElementById('adminNetProfit').textContent = `R$ ${(summary.net_profit || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  }

  // 2. Taxas atuais
  const ratesRes = await API.get('/api/rates');
  if (ratesRes && ratesRes.rates) {
    const r = ratesRes.rates;
    document.getElementById('adminRatePix').value = r.pix_percent;
    document.getElementById('adminRateWithdraw').value = r.pix_withdrawal_fee;
    document.getElementById('adminRateCardNat').value = r.card_national_percent;
    document.getElementById('adminRateCardFixed').value = r.card_national_fixed;
    document.getElementById('adminRateCardInt').value = r.card_international_percent;
    document.getElementById('adminRateInstallment').value = r.installment_rate_per_month;
  }
}

async function saveAdminRates() {
  const newRates = {
    pix_percent: parseFloat(document.getElementById('adminRatePix').value),
    pix_withdrawal_fee: parseFloat(document.getElementById('adminRateWithdraw').value),
    card_national_percent: parseFloat(document.getElementById('adminRateCardNat').value),
    card_national_fixed: parseFloat(document.getElementById('adminRateCardFixed').value),
    card_international_percent: parseFloat(document.getElementById('adminRateCardInt').value),
    installment_rate_per_month: parseFloat(document.getElementById('adminRateInstallment').value)
  };

  const res = await API.put('/api/admin/rates', newRates);
  if (res && res.success) {
    showToastAlert('✅ Tabela de taxas oficiais do KryptaPay atualizada com sucesso no SQLite!');
  }
}

// ------------------------------------------------------------------
// INTERNACIONALIZAÇÃO & SELETOR DE IDIOMAS
// ------------------------------------------------------------------
function toggleLangMenu() {
  const menu = document.getElementById('langMenu');
  if (menu) menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

function changeAppLang(langCode) {
  if (window.KryptaI18n) {
    window.KryptaI18n.setLanguage(langCode);
  }
  const menu = document.getElementById('langMenu');
  if (menu) menu.style.display = 'none';
  showToastAlert(`Idioma alterado com sucesso!`);
}

// ------------------------------------------------------------------
// MODAL PWA
// ------------------------------------------------------------------
function showPWAModal() {
  const modal = document.getElementById('pwaInstructionsModal');
  if (modal) modal.style.display = 'flex';
}

function closePWAModal() {
  const modal = document.getElementById('pwaInstructionsModal');
  if (modal) modal.style.display = 'none';
}

// Fechar menu de idiomas se clicar fora
document.addEventListener('click', (e) => {
  const dropdown = document.querySelector('.lang-selector-dropdown');
  const menu = document.getElementById('langMenu');
  if (menu && dropdown && !dropdown.contains(e.target)) {
    menu.style.display = 'none';
  }
});

// Funções para Meus Links de Pagamento e Configurações
function copyPaymentLink(url) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      showToastAlert('Link de checkout copiado para a área de transferência!');
    }).catch(() => {
      prompt('Copie o link abaixo:', url);
    });
  } else {
    prompt('Copie o link abaixo:', url);
  }
}

function saveUserSettings() {
  const name = document.getElementById('settingName')?.value || 'KryptaPay Operador';
  const pixKey = document.getElementById('settingPixKey')?.value || '';
  const pixBank = document.getElementById('settingPixBank')?.value || '';
  showToastAlert(`✅ Configurações salvas com sucesso! Chave Pix cadastrada: ${pixKey} (${pixBank})`);
}

// ------------------------------------------------------------------
// ESTADO E FUNÇÕES DA DASHBOARD DE TESTES (SIMULAÇÃO AO VIVO NO CELULAR)
// ------------------------------------------------------------------
const TestDashboardState = {
  faturamentoTotal: parseFloat(localStorage.getItem('krypta_test_faturamento')) || 0,
  saldoDisponivel: parseFloat(localStorage.getItem('krypta_test_disponivel')) || 0,
  saldoPendente: parseFloat(localStorage.getItem('krypta_test_pendente')) || 0,
  saldoRetencao: parseFloat(localStorage.getItem('krypta_test_retencao')) || 0,
  vendasAprovadas: parseInt(localStorage.getItem('krypta_test_aprovadas'), 10) || 0,
  vendasPendentes: parseInt(localStorage.getItem('krypta_test_pendentes'), 10) || 0,
  recentSales: JSON.parse(localStorage.getItem('krypta_test_recent_sales') || '[]')
};

function saveTestDashboardState() {
  localStorage.setItem('krypta_test_faturamento', TestDashboardState.faturamentoTotal);
  localStorage.setItem('krypta_test_disponivel', TestDashboardState.saldoDisponivel);
  localStorage.setItem('krypta_test_pendente', TestDashboardState.saldoPendente);
  localStorage.setItem('krypta_test_retencao', TestDashboardState.saldoRetencao);
  localStorage.setItem('krypta_test_aprovadas', TestDashboardState.vendasAprovadas);
  localStorage.setItem('krypta_test_pendentes', TestDashboardState.vendasPendentes);
  localStorage.setItem('krypta_test_recent_sales', JSON.stringify(TestDashboardState.recentSales.slice(0, 50)));
}

function resetTestDashboard() {
  TestDashboardState.faturamentoTotal = 0;
  TestDashboardState.saldoDisponivel = 0;
  TestDashboardState.saldoPendente = 0;
  TestDashboardState.saldoRetencao = 0;
  TestDashboardState.vendasAprovadas = 0;
  TestDashboardState.vendasPendentes = 0;
  TestDashboardState.recentSales = [];
  saveTestDashboardState();
  updateTestDashboardUI();
  showToastAlert('🔄 Dashboard de Testes zerada com sucesso! Faturamento: R$ 0,00');
}

function addTestSale(notif) {
  const rawAmt = typeof notif.rawAmount === 'number' ? notif.rawAmount : (parseFloat(String(notif.amount || '').replace(/[^0-9,.-]/g, '').replace(',', '.')) || 97.00);
  const isApproved = notif.status === 'approved' || (notif.title && notif.title.includes('aprovada'));

  if (isApproved) {
    TestDashboardState.vendasAprovadas++;
    TestDashboardState.faturamentoTotal += rawAmt;
    TestDashboardState.saldoDisponivel += (rawAmt * 0.95);
    TestDashboardState.saldoRetencao += (rawAmt * 0.05);
  } else {
    TestDashboardState.vendasPendentes++;
    TestDashboardState.saldoPendente += rawAmt;
  }

  TestDashboardState.recentSales.unshift({
    orderId: notif.orderId || ('#' + (10000 + Math.floor(Math.random() * 90000))),
    amount: rawAmt,
    isApproved: isApproved,
    status: isApproved ? 'Aprovada' : 'Pendente (Pix)',
    device: /iphone|ipad/i.test(navigator.userAgent) ? 'iPhone Push' : (/android/i.test(navigator.userAgent) ? 'Android Push' : 'Celular Push'),
    time: notif.timestamp || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  });

  saveTestDashboardState();
  updateTestDashboardUI();
}

function updateTestDashboardUI() {
  const faturamentoEl = document.getElementById('test-metric-faturamento');
  const disponivelEl = document.getElementById('test-metric-disponivel');
  const pendenteEl = document.getElementById('test-metric-pendente');
  const retencaoEl = document.getElementById('test-metric-retencao');
  const aprovadasEl = document.getElementById('test-metric-aprovadas');
  const pendentesEl = document.getElementById('test-metric-pendentes');
  const taxaEl = document.getElementById('test-metric-taxa');
  const ticketEl = document.getElementById('test-metric-ticket');
  const tableBody = document.getElementById('testSalesTableBody');
  const liveBadge = document.getElementById('test-sales-live-badge');

  if (faturamentoEl) faturamentoEl.textContent = `R$ ${TestDashboardState.faturamentoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (disponivelEl) disponivelEl.textContent = `R$ ${TestDashboardState.saldoDisponivel.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (pendenteEl) pendenteEl.textContent = `R$ ${TestDashboardState.saldoPendente.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (retencaoEl) retencaoEl.textContent = `R$ ${TestDashboardState.saldoRetencao.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (aprovadasEl) aprovadasEl.textContent = TestDashboardState.vendasAprovadas;
  if (pendentesEl) pendentesEl.textContent = TestDashboardState.vendasPendentes;

  const totalVendas = TestDashboardState.vendasAprovadas + TestDashboardState.vendasPendentes;
  const taxaCalc = totalVendas > 0 ? ((TestDashboardState.vendasAprovadas / totalVendas) * 100).toFixed(1) + '%' : '0%';
  if (taxaEl) taxaEl.textContent = taxaCalc;

  const ticketCalc = TestDashboardState.vendasAprovadas > 0 ? (TestDashboardState.faturamentoTotal / TestDashboardState.vendasAprovadas) : 0;
  if (ticketEl) ticketEl.textContent = `R$ ${ticketCalc.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (liveBadge) {
    if (totalVendas > 0) {
      liveBadge.innerHTML = `🟢 ${totalVendas} Notificações Processadas no Celular`;
      liveBadge.className = 'badge-status badge-approved';
    } else {
      liveBadge.innerHTML = '⚪ Aguardando Disparo de Notificações';
      liveBadge.className = 'badge-status badge-pending';
    }
  }

  if (tableBody) {
    if (!TestDashboardState.recentSales || TestDashboardState.recentSales.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align:center; padding:2rem; color:var(--text-muted);">
            Nenhuma notificação pingada ainda. Vá em <strong>Notificações</strong>, configure a quantidade e inicie os disparos para ver o faturamento subir ao vivo!
          </td>
        </tr>
      `;
    } else {
      tableBody.innerHTML = TestDashboardState.recentSales.slice(0, 30).map(s => {
        const badgeClass = s.isApproved ? 'badge-approved' : 'badge-pending';
        return `
          <tr>
            <td style="font-weight:700; color:var(--purple-400);">${s.orderId}</td>
            <td style="font-weight:700; color:${s.isApproved ? '#4ade80' : '#fbbf24'};">R$ ${s.amount.toFixed(2).replace('.', ',')}</td>
            <td>Pix Instantâneo</td>
            <td><span class="badge-status ${badgeClass}">${s.status}</span></td>
            <td><span style="font-size:0.8rem; color:#c084fc;">📲 ${s.device}</span></td>
            <td style="font-size:0.82rem; color:var(--text-dim);">${s.time}</td>
          </tr>
        `;
      }).join('');
    }
  }
}
