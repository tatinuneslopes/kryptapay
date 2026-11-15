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

function startApp() {
  initTheme();
  setupNavigation();
  setupSSE();
  startCrossDeviceSync();
  loadSavedPixKey();
  loadDashboardData();
  updateTestDashboardUI();
  fetchTestDashboardState(true);
  setupModalListeners();
  updateNotificationPermissionBadge();
  checkActiveSimulationSession();

  // Redirecionamento automático quando clicado na notificação com ?tab=test-dashboard
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const targetTab = urlParams.get('tab');
    if (targetTab) {
      setTimeout(() => switchTab(targetTab), 50);
    }
  } catch (_) {}

  // Listener para troca de aba instantânea vinda do Service Worker (ao clicar na notificação)
  if ('serviceWorker' in navigator) {
    try {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'SWITCH_TAB' && event.data.tab) {
          switchTab(event.data.tab);
        }
      });
    } catch (_) {}
  }

  // Pré-habilitar áudio em segundo plano no primeiro toque em celular iOS/Android
  const armAudio = () => {
    if (!BackgroundNotificationEngine._audioEl) {
      try {
        BackgroundNotificationEngine._audioEl = new Audio('/audio/silence.wav');
        BackgroundNotificationEngine._audioEl.loop = true;
        BackgroundNotificationEngine._audioEl.volume = 0.05;
        BackgroundNotificationEngine._audioEl.setAttribute('playsinline', 'true');
        BackgroundNotificationEngine._audioEl.setAttribute('webkit-playsinline', 'true');
        BackgroundNotificationEngine._audioEl.load();
      } catch (_) {}
    }
  };
  document.addEventListener('touchstart', armAudio, { once: true, passive: true });
  document.addEventListener('click', armAudio, { once: true, passive: true });

  // Inicializar o Globo 3D da Dashboard
  function initDashboardGlobe() {
    if (window.KryptaGlobe3D && document.getElementById('dashboardGlobeCanvas')) {
      try {
        new KryptaGlobe3D('dashboardGlobeCanvas', {
          radius: 170,
          dotCount: 400,
          activeBuyers: 60,
          autoRotateSpeed: 0.008
        });
      } catch (err) {
        console.error('Erro ao iniciar Globo 3D na Dashboard:', err);
      }
    }
  }

  initDashboardGlobe();
  setTimeout(initDashboardGlobe, 200);
}

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
  if (collapseBtn && !collapseBtn.dataset.bound) {
    collapseBtn.dataset.bound = 'true';
    collapseBtn.addEventListener('click', (e) => {
      closeMobileSidebar();
    });
  }

  const mobileToggle = document.getElementById('mobileMenuBtn');
  if (mobileToggle && !mobileToggle.dataset.bound) {
    mobileToggle.dataset.bound = 'true';
    mobileToggle.addEventListener('click', (e) => {
      toggleSidebarMenu(e);
    });
  }
}

function switchTab(tabId) {
  AppState.currentTab = tabId;

  // Fechar sidebar mobile imediatamente ao trocar de tela
  closeMobileSidebar();

  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const activeLink = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
  if (activeLink) activeLink.classList.add('active');

  // Atualizar botões da barra inferior mobile
  document.querySelectorAll('.mobile-nav-btn, .mobile-nav-btn-highlight').forEach(b => b.classList.remove('active'));
  const activeBottomBtn = document.querySelector(`[data-bottom-tab="${tabId}"]`);
  if (activeBottomBtn) activeBottomBtn.classList.add('active');

  const titleEl = document.getElementById('headerPageTitle');
  if (titleEl) {
    if (activeLink) {
      const label = activeLink.querySelector('.nav-label');
      if (label) titleEl.textContent = label.textContent.trim();
    } else if (tabId === 'dashboard') {
      titleEl.textContent = 'Dashboard 1';
    } else if (tabId === 'test-dashboard') {
      titleEl.textContent = 'Dashboard 2';
    }
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
  else if (tabId === 'test-dashboard') {
    updateTestDashboardUI();
    fetchTestDashboardState(true);
  }
  else if (tabId === 'sales' || tabId === 'transactions') loadTransactionsData();
  else if (tabId === 'financial') loadFinancialData();
  else if (tabId === 'global') loadGlobalData();
  else if (tabId === 'api') loadApiKeysData();
  else if (tabId === 'webhooks') loadWebhooksData();
  else if (tabId === 'notifications') {
    loadNotificationsData();
    checkServerSimulationStatus();
  }
  else if (tabId === 'admin') loadAdminData();
  else if (tabId === 'acquirers') loadAcquirersData();
  else if (tabId === 'products') loadProductsData();
  else if (tabId === 'rewards') loadRewardsData();
  else if (tabId === 'dashboard') {
    setTimeout(() => {
      if (window.KryptaGlobe3D && document.getElementById('dashboardGlobeCanvas')) {
        try {
          new KryptaGlobe3D('dashboardGlobeCanvas', {
            radius: 170,
            autoRotateSpeed: 0.008
          });
        } catch (_) {}
      }
    }, 80);
  }

  const sidebar = document.querySelector('.sidebar');
  if (sidebar) sidebar.classList.remove('mobile-open');
}
window.switchTab = switchTab;

// 3. SSE: Escuta de Notificações em Tempo Real (Auto-Reconectável)
let simulationEvtSource = null;
function setupSSE() {
  function connectSSE() {
    try {
      if (simulationEvtSource) {
        try { simulationEvtSource.close(); } catch (_) {}
      }
      simulationEvtSource = new EventSource('/api/simulation/events');

      simulationEvtSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'notification' || data.type === 'sync_notification') {
            handleIncomingNotification(data);
          } else if (data.type === 'test_dashboard_sync' && data.state) {
            applyServerTestDashboardState(data.state);
          } else if (data.type === 'simulation_state' && data.state) {
            handleServerSimulationState(data.state);
          } else if (data.type === 'product_created') {
            if (AppState.currentTab === 'products') loadProductsData();
          } else if (data.type === 'charge') {
            handleChargeNotification(data);
          } else if (data.type === 'withdrawal') {
            if (AppState.currentTab === 'financial') loadFinancialData();
            if (AppState.currentTab === 'dashboard') loadDashboardData();
          } else if (data.type === 'simulation_completed') {
            updateSimProgress(100, 'Concluída');
          }
        } catch (e) {
          console.error('Erro SSE:', e);
        }
      };

      simulationEvtSource.onerror = () => {
        try { simulationEvtSource.close(); } catch (_) {}
        setTimeout(connectSSE, 3000);
      };
    } catch (_) {
      setTimeout(connectSSE, 5000);
    }
  }

  connectSSE();
}

// ========================================================
// SINCRONIZAÇÃO MULTI-DISPOSITIVOS (COMPUTADOR <-> CELULAR)
// ========================================================
let isSyncInProgress = false;

function setNotifSequenceUIState(isActive, stateInfo = {}) {
  const toggle = document.getElementById('toggleNotifSequence');
  const toggleBadge = document.getElementById('toggleNotifSequenceBadge');
  const toggleStateText = document.getElementById('toggleNotifStateText');
  const btnStart = document.getElementById('btnStartNotifSeq');
  const btnStop = document.getElementById('btnStopNotifSeq');

  if (isActive) {
    if (toggle) toggle.checked = true;
    if (toggleBadge) {
      toggleBadge.className = 'badge-status badge-approved';
      toggleBadge.innerHTML = '🟢 LIGADO — PINGANDO NO CELULAR';
    }
    if (toggleStateText) {
      toggleStateText.textContent = 'LIGADO ⚡';
      toggleStateText.style.color = '#4ade80';
    }
    if (btnStart) btnStart.disabled = true;
    if (btnStop) btnStop.disabled = false;
    updateNotifSeqProgressUI(`🚀 Disparos Ativos (${stateInfo.durationLabel || 'Contínuo'}) • Intervalo: ${stateInfo.intervalSeconds || notifSeqIntervalSec || 5}s`);
  } else {
    if (toggle) toggle.checked = false;
    if (toggleBadge) {
      toggleBadge.className = 'badge-status badge-pending';
      toggleBadge.innerHTML = '⚪ DESLIGADO (Arraste para Ligar)';
    }
    if (toggleStateText) {
      toggleStateText.textContent = 'DESLIGADO';
      toggleStateText.style.color = 'var(--text-muted)';
    }
    if (btnStart) btnStart.disabled = false;
    if (btnStop) btnStop.disabled = true;
    const statusLabel = document.getElementById('notifSeqStatusLabel');
    if (statusLabel) {
      statusLabel.textContent = 'Disparos desligados pelo botão.';
    }
  }
}

function handleServerSimulationState(state) {
  if (!state) return;
  if (state.active) {
    setNotifSequenceUIState(true, state);
    notifSeqIntervalSec = state.intervalSeconds || notifSeqIntervalSec || 5;
    notifSeqIsInfinite = true;
    notifSeqTotal = Infinity;
    requestSimulationWakeLock();

    const resumeIntervalMs = Math.round(notifSeqIntervalSec * 1000);
    if (!notifSeqTimer) {
      notifSeqTimer = setInterval(() => {
        handleSeqTick();
      }, resumeIntervalMs);
    }
    if (!BackgroundNotificationEngine._isActive) {
      BackgroundNotificationEngine.start(() => {
        handleSeqTick();
      }, () => Math.round(notifSeqIntervalSec * 1000));
    }
  } else {
    setNotifSequenceUIState(false);
    BackgroundNotificationEngine.stop();
    if (simTimerWorker) {
      try { simTimerWorker.postMessage({ action: 'stop' }); } catch (_) {}
    }
    if (notifSeqTimer) {
      clearInterval(notifSeqTimer);
      notifSeqTimer = null;
    }
    lastSeqTickTime = 0;
    releaseSimulationWakeLock();
    localStorage.removeItem('kryptapay_sim_session');
  }
}

async function checkServerSimulationStatus() {
  try {
    const res = await API.get('/api/notifications/sequence/status');
    if (res && res.state) {
      handleServerSimulationState(res.state);
    }
  } catch (_) {}
}

async function fetchCrossDeviceSync() {
  if (isSyncInProgress) return;
  isSyncInProgress = true;
  try {
    // Sincronizar saldos e faturamento da Dashboard 2 continuamente entre celular e notebook
    fetchTestDashboardState();

    const res = await API.get(`/api/notifications/sync?since=${lastSeenSyncSeqId}`);
    if (res && res.notifications && res.notifications.length > 0) {
      if (lastSeenSyncSeqId === 0) {
        // Na primeira sincronização, define o cursor para o último ID existente para não repetir o passado
        lastSeenSyncSeqId = res.latestSeqId || 0;
        for (const n of res.notifications) {
          processedNotifIds.add(n.id);
        }
        return;
      }

      for (const n of res.notifications) {
        if (n.seqId) lastSeenSyncSeqId = Math.max(lastSeenSyncSeqId, n.seqId);
        if (processedNotifIds.has(n.id)) continue;
        processedNotifIds.add(n.id);

        // Se veio de OUTRO dispositivo (ex: disparado no Notebook e recebido no Celular):
        if (n.deviceId !== myDeviceId) {
          if (navigator.vibrate) navigator.vibrate([250, 100, 250]);
          await sendNativePhoneNotification(n);
          addTestSale(n);
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
  fetchTestDashboardState(true);
  fetchCrossDeviceSync();
  setInterval(fetchCrossDeviceSync, 1200);
  checkServerSimulationStatus();
  setInterval(checkServerSimulationStatus, 4000);
}

// Manipular Notificação Recebida via SSE (Instantâneo)
function handleIncomingNotification(data) {
  if (data.testDashboardState) {
    applyServerTestDashboardState(data.testDashboardState);
  }

  const notif = data.notification;
  if (!notif) return;
  if (processedNotifIds.has(notif.id)) return;
  processedNotifIds.add(notif.id);
  if (notif.seqId) lastSeenSyncSeqId = Math.max(lastSeenSyncSeqId, notif.seqId);

  // Se veio de outro dispositivo (ex: notebook) ou do servidor:
  if (notif.deviceId !== myDeviceId) {
    if (navigator.vibrate) navigator.vibrate([250, 100, 250]);
    sendNativePhoneNotification(notif);
    addTestSale(notif);
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
}

// Toasts visuais internos na tela desativados conforme solicitação expressa:
// Vendas pingam exclusivamente na barra / tela de bloqueio do celular nativo,
// sem pop-ups ou poluição visual na dashboard.
function showFloatingToast(notif) {
  return;
}

function showToastAlert(msg) {
  console.log('[KryptaPay Status]:', msg);
  return;
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
        reg = await navigator.serviceWorker.register('/sw.js?v=2026.26');
      }
      await navigator.serviceWorker.ready;

      if (reg && reg.showNotification) {
        await reg.showNotification(title, {
          body: bodyText,
          icon: '/icons/logo.png',
          badge: '/icons/logo.png',
          vibrate: [300, 100, 300, 100, 300],
          tag: 'kryptapay-sale-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
          renotify: true,
          silent: false,
          requireInteraction: false,
          data: '/app.html?tab=test-dashboard'
        });
        return true;
      } else if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'SHOW_NOTIFICATION',
          notification: {
            title: title,
            body: bodyText,
            url: '/app.html?tab=test-dashboard'
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
      const desktopNotif = new Notification(title, {
        body: bodyText,
        icon: '/icons/logo.png',
        badge: '/icons/logo.png',
        data: '/app.html?tab=test-dashboard'
      });
      desktopNotif.onclick = function() {
        try { window.focus(); } catch (_) {}
        if (typeof switchTab === 'function') switchTab('test-dashboard');
      };
      return true;
    } catch (e) {}
  }

  return false;
}

let pendingTestOrder = null;
let singleTestToggle = false;

// Disparo com Alternância (VENDA PENDENTE -> VENDA APROVADA)
async function triggerSingleTestNotification(customAmount, isPending = null) {
  if (isPending === null) {
    // Alterna a cada clique: 1º Pendente, 2º Aprovada, 3º Pendente, 4º Aprovada...
    isPending = singleTestToggle;
    singleTestToggle = !singleTestToggle;
  }

  const prefSound = document.getElementById('prefSoundToggle') ? document.getElementById('prefSoundToggle').checked : true;
  if (prefSound) {
    NotificationAudio.playCashSound();
  }

  const prefVibrate = document.getElementById('prefVibrateToggle') ? document.getElementById('prefVibrateToggle').checked : true;
  if (prefVibrate && navigator.vibrate) {
    navigator.vibrate([250, 100, 250]);
  }

  const selectVal = document.getElementById('notifTestAmount') ? document.getElementById('notifTestAmount').value : 'random';
  let amount = 197.00;
  let orderId = '';

  if (isPending || !pendingTestOrder) {
    if (customAmount) {
      amount = customAmount;
    } else if (selectVal !== 'random') {
      amount = parseFloat(selectVal) || 197.00;
    } else {
      const list = [47.00, 97.00, 147.00, 197.00, 297.00, 497.00];
      amount = list[Math.floor(Math.random() * list.length)];
    }
    orderId = `#${10000 + Math.floor(Math.random() * 90000)}`;
    pendingTestOrder = { amount, orderId };
  } else {
    // Aprovação da venda pendente anterior (mesmo pedido e valor)
    amount = pendingTestOrder.amount;
    orderId = pendingTestOrder.orderId;
    pendingTestOrder = null;
  }

  const formattedAmount = amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const isApproved = !isPending;
  const title = isApproved ? '🎉 VENDA APROVADA! - KryptaPay' : '⏳ VENDA PENDENTE! - KryptaPay';
  const subtitle = isApproved ? 'Pix Instantâneo Aprovado' : 'Venda Pendente — Aguardando Pagamento';

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

// ========================================================
// ========================================================
// MOTOR DE EXECUÇÃO EM SEGUNDO PLANO (TELA BLOQUEADA / FORA DO APP)
// Mantém as notificações ativas no Safari (iOS) e Chrome (Android) mesmo
// com a tela apagada/bloqueada através de sessão de áudio de baixa prioridade.
// ========================================================
class BackgroundNotificationEngine {
  static _audioEl = null;
  static _isActive = false;
  static _lastTickTimestamp = 0;
  static _onTickCallback = null;
  static _getIntervalMs = null;

  static start(onTickCallback, getIntervalMs) {
    this._onTickCallback = onTickCallback;
    this._getIntervalMs = getIntervalMs;
    this._isActive = true;
    this._lastTickTimestamp = Date.now();

    try {
      if (!this._audioEl) {
        // Áudio WAV silencioso real servido via HTTP/HTTPS para conformidade total de segundo plano no iOS e Android
        this._audioEl = new Audio('/audio/silence.wav');
        this._audioEl.loop = true;
        this._audioEl.volume = 0.05;
        this._audioEl.setAttribute('playsinline', 'true');
        this._audioEl.setAttribute('webkit-playsinline', 'true');
      }

      // O evento 'timeupdate' continua disparando ininterruptamente no iOS e Android
      // mesmo quando o usuário sai do app, vai para o WhatsApp ou apaga/bloqueia a tela!
      this._audioEl.ontimeupdate = () => {
        if (!this._isActive) return;
        const now = Date.now();
        const intervalMs = this._getIntervalMs ? this._getIntervalMs() : 5000;
        if (now - this._lastTickTimestamp >= intervalMs) {
          this._lastTickTimestamp = now;
          if (typeof this._onTickCallback === 'function') {
            this._onTickCallback();
          }
        }
      };

      const p = this._audioEl.play();
      if (p !== undefined) {
        p.catch(err => {
          console.log('Autoplay silencioso aguardando interação do usuário:', err);
        });
      }
    } catch (e) {
      console.warn('Erro ao inicializar áudio em segundo plano:', e);
    }

    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: 'KryptaPay — Vendas Ativas',
          artist: 'Disparando Notificações Contínuas',
          album: 'KryptaPay Gateway Oficial',
          artwork: [
            { src: '/icons/logo.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/logo.png', sizes: '512x512', type: 'image/png' }
          ]
        });
        navigator.mediaSession.playbackState = 'playing';

        navigator.mediaSession.setActionHandler('play', () => {
          if (this._audioEl) this._audioEl.play();
          navigator.mediaSession.playbackState = 'playing';
        });
        navigator.mediaSession.setActionHandler('pause', () => {
          navigator.mediaSession.playbackState = 'paused';
        });
      } catch (_) {}
    }
  }

  static stop() {
    this._isActive = false;
    this._onTickCallback = null;
    this._getIntervalMs = null;
    if (this._audioEl) {
      try {
        this._audioEl.ontimeupdate = null;
        this._audioEl.pause();
        this._audioEl.currentTime = 0;
      } catch (_) {}
    }
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.playbackState = 'none';
      } catch (_) {}
    }
  }

  static markTick() {
    this._lastTickTimestamp = Date.now();
  }
}

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

// Inicializar Web Worker para ticks precisos em segundo plano (com Blob inline ininterrupto)
function initSimulationWorker() {
  if (simTimerWorker) return;
  if (typeof window.Worker !== 'undefined') {
    try {
      const workerCode = `
        let timer = null;
        self.onmessage = function(e) {
          const d = e.data || {};
          if (d.action === 'start') {
            if (timer) clearInterval(timer);
            const ms = Math.max(parseFloat(d.intervalMs) || 1000, 200);
            timer = setInterval(() => {
              self.postMessage({ type: 'TICK', time: Date.now() });
            }, ms);
          } else if (d.action === 'stop') {
            if (timer) clearInterval(timer);
            timer = null;
          }
        };
      `;
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      simTimerWorker = new Worker(workerUrl);
      simTimerWorker.onmessage = function(e) {
        if (e.data && e.data.type === 'TICK') {
          handleSeqTick();
        }
      };
    } catch (err) {
      console.warn('Worker inline indisponível, usando fallback de timer principal:', err);
      simTimerWorker = null;
    }
  }
}

// Interpretar duração selecionada pelo usuário (sempre contínuo até o usuário desligar)
function parseNotifDurationValue(val) {
  switch (val) {
    case 'dur_8h': return { totalTicks: Infinity, durationSec: 8 * 3600, infinite: true, label: '1 Noite (8 Horas)' };
    case 'dur_24h': return { totalTicks: Infinity, durationSec: 24 * 3600, infinite: true, label: '24 Horas (1 Dia)' };
    case 'dur_2d': return { totalTicks: Infinity, durationSec: 48 * 3600, infinite: true, label: '2 Dias (48 Horas)' };
    case 'dur_3d': return { totalTicks: Infinity, durationSec: 72 * 3600, infinite: true, label: '3 Dias' };
    case 'dur_7d': return { totalTicks: Infinity, durationSec: 168 * 3600, infinite: true, label: '7 Dias (1 Semana)' };
    case 'dur_10d': return { totalTicks: Infinity, durationSec: 240 * 3600, infinite: true, label: '10 Dias' };
    case 'dur_infinite': return { totalTicks: Infinity, durationSec: Infinity, infinite: true, label: 'Contínuo / Infinito' };
    default: {
      return { totalTicks: Infinity, durationSec: Infinity, infinite: true, label: 'Disparos Contínuos' };
    }
  }
}

let lastSeqTickTime = 0;

// Função acionada pelo controle deslizante de notificações (Arraste para Direita LIGA / Esquerda DESLIGA)
function handleNotifSequenceToggle(isOn) {
  if (isOn) {
    startNotificationSequence();
  } else {
    stopNotificationSequence(false);
  }
}

// Iniciar sequência de notificações contínua
async function startNotificationSequence() {
  // Solicita permissão de push se ainda não concedida (sem travar a execução)
  if ('Notification' in window && Notification.permission !== 'granted') {
    try {
      const res = Notification.requestPermission();
      if (res && typeof res.then === 'function') {
        res.then(() => updateNotificationPermissionBadge()).catch(() => {});
      } else {
        updateNotificationPermissionBadge();
      }
    } catch (_) {}
  }

  const countSelect = document.getElementById('notifTestCount');
  const intervalSelect = document.getElementById('notifTestInterval');
  const durConfig = parseNotifDurationValue(countSelect ? countSelect.value : 'dur_2d');
  const intervalSec = Math.max(0.5, parseFloat(intervalSelect ? intervalSelect.value : '5') || 5);

  notifSeqIntervalSec = intervalSec;
  notifSeqIsInfinite = true;
  notifSeqTotal = Infinity;
  notifSeqCurrent = 0;
  notifSeqSessionStart = Date.now();
  lastSeqTickTime = 0;

  // Atualizar visual do botãozinho deslizante para LIGADO
  setNotifSequenceUIState(true, { durationLabel: durConfig.label, intervalSeconds: intervalSec });

  // Salvar sessão persistente no localStorage
  const sessionData = {
    active: true,
    startTime: notifSeqSessionStart,
    intervalSec: notifSeqIntervalSec,
    totalTicks: -1,
    currentTicks: 0,
    isInfinite: true,
    lastTickTime: Date.now(),
    durationLabel: durConfig.label
  };
  localStorage.setItem('kryptapay_sim_session', JSON.stringify(sessionData));

  // Notificar o Servidor Cloud para executar o Runner 24/7 continuamente em segundo plano
  API.post('/api/notifications/sequence/start', {
    interval_seconds: intervalSec,
    total_ticks: -1,
    duration_label: durConfig.label,
    amount_type: document.getElementById('notifTestAmount')?.value || 'random'
  }).catch(() => {});

  // Manter a tela acordada / não suspender
  requestSimulationWakeLock();

  const btnStart = document.getElementById('btnStartNotifSeq');
  const btnStop = document.getElementById('btnStopNotifSeq');
  if (btnStart) btnStart.disabled = true;
  if (btnStop) btnStop.disabled = false;

  updateNotifSeqProgressUI(`🚀 Disparos Ativos (${durConfig.label}) • Intervalo: ${intervalSec}s`);

  // Disparar o primeiro ping imediato
  handleSeqTick();

  const intervalMs = Math.round(intervalSec * 1000);

  // 1. Timer principal (setInterval) - SEMPRE ATIVO
  if (notifSeqTimer) clearInterval(notifSeqTimer);
  notifSeqTimer = setInterval(() => {
    handleSeqTick();
  }, intervalMs);

  // 2. Web Worker em segundo plano (com Blob inline) - NUNCA FALHA
  initSimulationWorker();
  if (simTimerWorker) {
    try {
      simTimerWorker.postMessage({ action: 'start', intervalMs: intervalMs });
    } catch (_) {}
  }

  // 3. Motor de Áudio em segundo plano (iOS Safari & Android PWA com tela apagada)
  BackgroundNotificationEngine.start(() => {
    handleSeqTick();
  }, () => Math.round(notifSeqIntervalSec * 1000));
}

// Cada disparo individual da sequência (alternando Venda Pendente e Venda Aprovada)
function handleSeqTick() {
  const now = Date.now();
  const minIntervalMs = Math.max((notifSeqIntervalSec * 1000) * 0.7, 300);
  if (lastSeqTickTime > 0 && (now - lastSeqTickTime) < minIntervalMs) {
    return;
  }
  lastSeqTickTime = now;

  BackgroundNotificationEngine.markTick();

  // Alterna perfeitamente: Venda Pendente -> Venda Aprovada
  const isPending = (notifSeqCurrent % 2 === 0);
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
    countLabel.textContent = `${notifSeqCurrent} / ♾️ Contínuo`;
  }

  if (pBar) {
    pBar.style.width = '100%';
  }
}

// Parar disparos
function stopNotificationSequence(completed = false) {
  API.post('/api/notifications/sequence/stop', {}).catch(() => {});
  BackgroundNotificationEngine.stop();
  if (simTimerWorker) {
    try { simTimerWorker.postMessage({ action: 'stop' }); } catch (_) {}
  }
  if (notifSeqTimer) {
    clearInterval(notifSeqTimer);
    notifSeqTimer = null;
  }
  lastSeqTickTime = 0;
  releaseSimulationWakeLock();
  localStorage.removeItem('kryptapay_sim_session');

  // Atualizar visual do botãozinho deslizante para DESLIGADO
  setNotifSequenceUIState(false);

  const statusLabel = document.getElementById('notifSeqStatusLabel');
  if (statusLabel) {
    statusLabel.textContent = completed 
      ? `✅ Disparo concluído com sucesso! ${notifSeqCurrent} vendas pingadas no celular.` 
      : 'Disparos desligados pelo botão.';
  }
}

// Recuperar sessão e sincronizar estado do botão entre computador e celular
function checkActiveSimulationSession() {
  API.get('/api/notifications/sequence/status').then(res => {
    if (res && res.state) {
      handleServerSimulationState(res.state);
    }
  }).catch(() => {});

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
          title: isPending ? 'VENDA PENDENTE — Aguardando' : 'VENDA APROVADA!',
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

    notifSeqIntervalSec = s.intervalSec || 5;
    notifSeqIsInfinite = true;
    notifSeqTotal = Infinity;
    notifSeqCurrent = s.currentTicks || 0;
    notifSeqSessionStart = s.startTime || now;
    lastSeqTickTime = 0;

    // Atualizar visual do botãozinho deslizante para LIGADO
    const toggle = document.getElementById('toggleNotifSequence');
    if (toggle) toggle.checked = true;
    const toggleBadge = document.getElementById('toggleNotifSequenceBadge');
    if (toggleBadge) {
      toggleBadge.className = 'badge-status badge-approved';
      toggleBadge.innerHTML = '🟢 LIGADO — PINGANDO NO CELULAR';
    }
    const toggleStateText = document.getElementById('toggleNotifStateText');
    if (toggleStateText) {
      toggleStateText.textContent = 'LIGADO ⚡';
      toggleStateText.style.color = '#4ade80';
    }

    const btnStart = document.getElementById('btnStartNotifSeq');
    const btnStop = document.getElementById('btnStopNotifSeq');
    if (btnStart) btnStart.disabled = true;
    if (btnStop) btnStop.disabled = false;

    updateNotifSeqProgressUI(`🚀 Continuando disparos ativos (${s.durationLabel || 'Contínuo'})...`);
    requestSimulationWakeLock();

    const resumeIntervalMs = Math.round(notifSeqIntervalSec * 1000);

    // 1. Timer principal (setInterval)
    if (notifSeqTimer) clearInterval(notifSeqTimer);
    notifSeqTimer = setInterval(() => {
      handleSeqTick();
    }, resumeIntervalMs);

    // 2. Web Worker em segundo plano
    initSimulationWorker();
    if (simTimerWorker) {
      try { simTimerWorker.postMessage({ action: 'start', intervalMs: resumeIntervalMs }); } catch (_) {}
    }

    // 3. Motor de Áudio em segundo plano
    BackgroundNotificationEngine.start(() => {
      handleSeqTick();
    }, () => Math.round(notifSeqIntervalSec * 1000));
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

let lastToggleSidebarTime = 0;

function toggleSidebarMenu(e) {
  if (e) {
    if (typeof e.preventDefault === 'function') e.preventDefault();
    if (typeof e.stopPropagation === 'function') e.stopPropagation();
  }
  const now = Date.now();
  if (now - lastToggleSidebarTime < 200) {
    return; // evita duplo disparo acidental entre onclick e eventListener
  }
  lastToggleSidebarTime = now;

  const sidebar = document.querySelector('.sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (!sidebar) return;

  const isOpen = sidebar.classList.contains('mobile-open') || sidebar.classList.contains('sidebar-drawer-open');
  if (isOpen) {
    sidebar.classList.remove('mobile-open');
    sidebar.classList.remove('sidebar-drawer-open');
    if (backdrop) backdrop.style.display = 'none';
    document.body.style.overflow = '';
  } else {
    // Abre a barrinha lateral completa com todas as opções (Dashboard 1, Dashboard 2, Criar Produto, etc.)
    sidebar.classList.remove('collapsed');
    sidebar.classList.add('mobile-open');
    sidebar.classList.add('sidebar-drawer-open');
    if (backdrop) {
      backdrop.style.display = 'block';
    }
    document.body.style.overflow = 'hidden';
  }
}
window.toggleSidebarMenu = toggleSidebarMenu;
window.toggleMobileSidebar = toggleSidebarMenu;

function closeMobileSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (sidebar) {
    sidebar.classList.remove('mobile-open');
    sidebar.classList.remove('sidebar-drawer-open');
  }
  if (backdrop) backdrop.style.display = 'none';
  document.body.style.overflow = '';
}
window.closeMobileSidebar = closeMobileSidebar;

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

  let rawVal = amountInput ? amountInput.value.trim() : '';
  rawVal = rawVal.replace(/[R$\s]/g, '');
  if (rawVal.includes(',') && rawVal.includes('.')) {
    rawVal = rawVal.replace(/\./g, '').replace(',', '.');
  } else if (rawVal.includes(',')) {
    rawVal = rawVal.replace(',', '.');
  }
  const amount = parseFloat(rawVal) || 0;
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
    if (timerBadge) timerBadge.textContent = '⏳ Notificação de Venda Pendente enviada!';

    const btnSimulate = document.getElementById('btnSimulatePixPaid');
    if (btnSimulate) {
      btnSimulate.disabled = false;
      btnSimulate.innerHTML = '⚡ Simular Pagamento do Pagador (Receber Venda Agora)';
    }

    // 1. PINGAR NOTIFICAÇÃO NATIVA DE VENDA PENDENTE NO CELULAR DO CLIENTE
    sendNativePhoneNotification({
      title: '⏳ VENDA PENDENTE! - KryptaPay',
      nativeBody: `Cobrança de R$ ${formattedAmount} enviada para ${name} • Venda Pendente.`,
      tag: 'kryptapay-pix-pending-' + Date.now()
    });

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
  loadSavedPixKey();
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

  // Se o toggle de salvar estiver ativo, persiste a chave Pix imediatamente
  if (document.getElementById('toggleSavePixKey')?.checked) {
    saveCurrentPixKeyPreference();
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

// 12. Produtos & Criação de Novos Produtos
function openCreateProductModal() {
  const modal = document.getElementById('modalCreateProduct');
  if (modal) {
    modal.style.display = 'flex';
    setTimeout(() => document.getElementById('newProdName')?.focus(), 100);
  }
}

function closeCreateProductModal() {
  const modal = document.getElementById('modalCreateProduct');
  if (modal) modal.style.display = 'none';
  const errArea = document.getElementById('createProdErrorArea');
  if (errArea) errArea.style.display = 'none';
}

async function handleCreateProductSubmit(e) {
  if (e) e.preventDefault();
  const nameInput = document.getElementById('newProdName');
  const priceInput = document.getElementById('newProdPrice');
  const typeInput = document.getElementById('newProdType');
  const descInput = document.getElementById('newProdDesc');
  const errArea = document.getElementById('createProdErrorArea');
  const btn = document.getElementById('btnSubmitCreateProd');

  const name = nameInput ? nameInput.value.trim() : '';
  let rawPrice = priceInput ? priceInput.value.trim() : '';
  rawPrice = rawPrice.replace(/[R$\s]/g, '');
  if (rawPrice.includes(',') && rawPrice.includes('.')) {
    rawPrice = rawPrice.replace(/\./g, '').replace(',', '.');
  } else if (rawPrice.includes(',')) {
    rawPrice = rawPrice.replace(',', '.');
  }
  const price = parseFloat(rawPrice);

  if (!name) {
    if (errArea) { errArea.textContent = 'Por favor, informe o nome do produto.'; errArea.style.display = 'block'; }
    return;
  }
  if (isNaN(price) || price <= 0) {
    if (errArea) { errArea.textContent = 'Informe um valor de preço válido (ex: 97,00).'; errArea.style.display = 'block'; }
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = 'Salvando...';
  }

  try {
    const prodPayload = {
      name: name,
      price: price,
      product_type: typeInput ? typeInput.value : 'digital',
      description: descInput ? descInput.value.trim() : ''
    };

    let createdId = 'prod_' + Date.now().toString(36);
    try {
      const res = await API.post('/api/products', prodPayload);
      if (res && res.product && res.product.id) createdId = res.product.id;
    } catch (_) {}

    // Persistência local garantida
    const localProds = JSON.parse(localStorage.getItem('krypta_user_products') || '[]');
    localProds.unshift({ id: createdId, ...prodPayload });
    localStorage.setItem('krypta_user_products', JSON.stringify(localProds));

    closeCreateProductModal();
    if (nameInput) nameInput.value = '';
    if (priceInput) priceInput.value = '';
    if (descInput) descInput.value = '';
    await loadProductsData();
  } catch (err) {
    if (errArea) {
      errArea.textContent = 'Erro ao salvar produto. Tente novamente.';
      errArea.style.display = 'block';
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>💾 Salvar Produto</span>';
    }
  }
}

async function loadProductsData() {
  let products = [];
  try {
    const res = await API.get('/api/products');
    if (res && Array.isArray(res.products)) {
      products = res.products;
    }
  } catch (_) {}

  // Fallback e unificação com produtos locais
  const localProducts = JSON.parse(localStorage.getItem('krypta_user_products') || '[]');
  const allProducts = [...products];
  for (const lp of localProducts) {
    if (!allProducts.some(p => p.id === lp.id)) {
      allProducts.push(lp);
    }
  }

  const list = document.getElementById('productsGrid');
  if (!list) return;

  if (allProducts.length === 0) {
    list.innerHTML = `
      <div class="glass-card" style="grid-column: 1 / -1; padding: 3rem 1.5rem; text-align:center;">
        <span style="font-size:3rem; display:block; margin-bottom:0.75rem;">📦</span>
        <h4 style="font-size:1.25rem; font-weight:800; color:#fff; margin-bottom:0.5rem;">Nenhum produto cadastrado ainda</h4>
        <p style="color:var(--text-muted); font-size:0.9rem; max-width:460px; margin:0 auto 1.5rem;">Cadastre seu primeiro produto para começar a gerar checkouts e links de pagamento.</p>
        <button onclick="openCreateProductModal()" class="btn-primary" style="padding:0.75rem 1.6rem; font-weight:700; border-radius:10px; display:inline-flex; align-items:center; gap:0.4rem;">
          + Criar Primeiro Produto
        </button>
      </div>
    `;
    return;
  }

  list.innerHTML = allProducts.map(p => `
    <div class="glass-card" style="padding: 1.5rem; display:flex; flex-direction:column; justify-content:space-between;">
      <div>
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.75rem;">
          <span class="badge-status badge-approved" style="text-transform:uppercase;">${p.product_type || 'Digital'}</span>
          <span style="font-size: 1.35rem; font-weight:800; color:#fff;">R$ ${Number(p.price).toFixed(2).replace('.', ',')}</span>
        </div>
        <h4 style="font-size:1.1rem; font-weight:700; color:#fff; margin-bottom:0.4rem;">${p.name}</h4>
        <p style="font-size:0.85rem; color:var(--text-muted); line-height:1.5;">${p.description || 'Sem descrição cadastrada.'}</p>
      </div>
      <div style="margin-top:1.5rem; display:flex; gap:0.5rem;">
        <button class="btn-primary" style="flex:1; justify-content:center; padding:0.5rem;" onclick="switchTab('checkout')">Criar Checkout</button>
        <button class="btn-secondary" style="padding:0.5rem 0.8rem;" onclick="switchTab('links')">Meus Links</button>
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
// NOTIFICAÇÕES DE TRANSAÇÃO REAL (DIRETO NO PUSH NATIVO DO CELULAR)
// ------------------------------------------------------------------
function handleChargeNotification(chargeEvent) {
  const isApproved = chargeEvent.event === 'payment.approved';

  sendNativePhoneNotification({
    title: isApproved ? '🎉 Venda aprovada! - KryptaPay' : '⏳ VENDA PENDENTE! - KryptaPay',
    nativeBody: `R$ ${chargeEvent.amount.toFixed(2).replace('.', ',')} • Pedido ${chargeEvent.order_id}\n${isApproved ? 'Pix Confirmado' : 'Aguardando Pagamento'}`,
    tag: 'kryptapay-charge-' + (chargeEvent.order_id || Date.now())
  });

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

// ------------------------------------------------------------------
// GESTÃO DE CHAVE PIX CADASTRADA, SENHA E DADOS DO TITULAR
// ------------------------------------------------------------------

function togglePasswordVisibility(inputId, btnEl) {
  const inp = document.getElementById(inputId);
  if (!inp) return;
  if (inp.type === 'password') {
    inp.type = 'text';
    btnEl.textContent = '👁️‍🗨️';
    btnEl.title = 'Ocultar Senha';
  } else {
    inp.type = 'password';
    btnEl.textContent = '👁️';
    btnEl.title = 'Visualizar Senha';
  }
}

async function changeUserPasswordAction() {
  const currentPassword = document.getElementById('currentPasswordInput')?.value;
  const newPassword = document.getElementById('newPasswordInput')?.value;
  const confirmPassword = document.getElementById('confirmPasswordInput')?.value;

  if (!newPassword || newPassword.length < 4) {
    alert('A nova senha deve conter pelo menos 4 caracteres.');
    return;
  }
  if (newPassword !== confirmPassword) {
    alert('A nova senha e a confirmação não coincidem.');
    return;
  }

  try {
    const res = await API.post('/api/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword
    });
    if (res && res.error) {
      alert(res.error);
      return;
    }
  } catch (_) {}

  localStorage.setItem('krypta_user_password', newPassword);
  showToastAlert('✅ Senha de acesso atualizada com sucesso!');
  if (document.getElementById('newPasswordInput')) document.getElementById('newPasswordInput').value = '';
  if (document.getElementById('confirmPasswordInput')) document.getElementById('confirmPasswordInput').value = '';
}

function loadSavedPixKey() {
  const savedKey = localStorage.getItem('krypta_saved_pix_key') || 'financeiro@kryptapay.com';
  const savedType = localStorage.getItem('krypta_saved_pix_type') || 'email';
  const isSaved = localStorage.getItem('krypta_saved_pix_enabled') !== 'false';

  const withdrawPixKey = document.getElementById('withdrawPixKey');
  const withdrawPixType = document.getElementById('withdrawPixType');
  const toggleSavePixKey = document.getElementById('toggleSavePixKey');
  const savedBadge = document.getElementById('savedPixKeyBadge');

  if (withdrawPixKey && savedKey) {
    if (!withdrawPixKey.value || withdrawPixKey.value === '') {
      withdrawPixKey.value = savedKey;
    }
  }
  if (withdrawPixType && savedType) {
    withdrawPixType.value = savedType;
  }
  if (toggleSavePixKey) {
    toggleSavePixKey.checked = isSaved;
  }
  if (savedBadge) {
    savedBadge.style.display = (isSaved && savedKey) ? 'inline-block' : 'none';
  }

  // Preencher também os campos do Perfil / Configurações
  const settingPixKey = document.getElementById('settingPixKey');
  const settingPixType = document.getElementById('settingPixType');
  const settingPixBank = document.getElementById('settingPixBank');
  const settingName = document.getElementById('settingName');
  const settingPhone = document.getElementById('settingPhone');
  const settingDoc = document.getElementById('settingDoc');

  if (settingPixKey && savedKey) settingPixKey.value = savedKey;
  if (settingPixType && savedType) settingPixType.value = savedType;
  
  const savedBank = localStorage.getItem('krypta_user_bank');
  if (settingPixBank && savedBank) settingPixBank.value = savedBank;

  const savedName = localStorage.getItem('krypta_user_name');
  if (settingName && savedName) settingName.value = savedName;

  const savedPhone = localStorage.getItem('krypta_user_phone');
  if (settingPhone && savedPhone) settingPhone.value = savedPhone;

  const savedDoc = localStorage.getItem('krypta_user_doc');
  if (settingDoc && savedDoc) settingDoc.value = savedDoc;
}

function saveCurrentPixKeyPreference() {
  const withdrawPixKey = document.getElementById('withdrawPixKey')?.value?.trim();
  const withdrawPixType = document.getElementById('withdrawPixType')?.value || 'cpf';
  const toggleSavePixKey = document.getElementById('toggleSavePixKey');
  const savedBadge = document.getElementById('savedPixKeyBadge');
  const isEnabled = toggleSavePixKey ? toggleSavePixKey.checked : true;

  localStorage.setItem('krypta_saved_pix_enabled', isEnabled ? 'true' : 'false');
  if (isEnabled && withdrawPixKey) {
    localStorage.setItem('krypta_saved_pix_key', withdrawPixKey);
    localStorage.setItem('krypta_saved_pix_type', withdrawPixType);
    if (savedBadge) savedBadge.style.display = 'inline-block';
    showToastAlert(`✅ Chave Pix ${withdrawPixKey} cadastrada e salva com sucesso!`);
    
    // Sincronizar com o perfil de configurações
    const settingPixKey = document.getElementById('settingPixKey');
    const settingPixType = document.getElementById('settingPixType');
    if (settingPixKey) settingPixKey.value = withdrawPixKey;
    if (settingPixType) settingPixType.value = withdrawPixType;

    API.post('/api/financial/pix-key', { pix_key: withdrawPixKey, pix_key_type: withdrawPixType }).catch(() => {});
  } else if (!isEnabled) {
    if (savedBadge) savedBadge.style.display = 'none';
  }
}

function onPixKeyInputChange() {
  const toggleSavePixKey = document.getElementById('toggleSavePixKey');
  if (toggleSavePixKey && toggleSavePixKey.checked) {
    const val = document.getElementById('withdrawPixKey')?.value?.trim();
    if (val) {
      localStorage.setItem('krypta_saved_pix_key', val);
      const savedBadge = document.getElementById('savedPixKeyBadge');
      if (savedBadge) savedBadge.style.display = 'inline-block';
      const settingPixKey = document.getElementById('settingPixKey');
      if (settingPixKey) settingPixKey.value = val;
    }
  }
}

function saveUserSettings() {
  const name = document.getElementById('settingName')?.value || 'KryptaPay Operador';
  const phone = document.getElementById('settingPhone')?.value || '';
  const doc = document.getElementById('settingDoc')?.value || '';
  const pixKey = document.getElementById('settingPixKey')?.value || '';
  const pixType = document.getElementById('settingPixType')?.value || 'cpf';
  const pixBank = document.getElementById('settingPixBank')?.value || '';

  if (pixKey) {
    localStorage.setItem('krypta_saved_pix_key', pixKey);
    localStorage.setItem('krypta_saved_pix_type', pixType);
    localStorage.setItem('krypta_saved_pix_enabled', 'true');
    const withdrawPixKey = document.getElementById('withdrawPixKey');
    if (withdrawPixKey) withdrawPixKey.value = pixKey;
    const withdrawPixType = document.getElementById('withdrawPixType');
    if (withdrawPixType) withdrawPixType.value = pixType;
    const savedBadge = document.getElementById('savedPixKeyBadge');
    if (savedBadge) savedBadge.style.display = 'inline-block';

    API.post('/api/financial/pix-key', { pix_key: pixKey, pix_key_type: pixType, pix_bank: pixBank }).catch(() => {});
  }

  localStorage.setItem('krypta_user_name', name);
  localStorage.setItem('krypta_user_phone', phone);
  localStorage.setItem('krypta_user_doc', doc);
  localStorage.setItem('krypta_user_bank', pixBank);

  showToastAlert(`✅ Dados e Chave Pix salvos com sucesso! Chave: ${pixKey} (${pixBank || 'Banco'})`);
}

// ------------------------------------------------------------------
// ESTADO E FUNÇÕES DA DASHBOARD 2 (SINCRONIZAÇÃO CELULAR <-> COMPUTADOR)
// ------------------------------------------------------------------
const TestDashboardState = {
  faturamentoTotal: parseFloat(localStorage.getItem('krypta_test_faturamento')) || 0,
  saldoDisponivel: parseFloat(localStorage.getItem('krypta_test_disponivel')) || 0,
  saldoPendente: 0, // Sempre R$ 0,00 no teste (não acumula pendência não paga)
  saldoRetencao: parseFloat(localStorage.getItem('krypta_test_retencao')) || 0,
  vendasAprovadas: parseInt(localStorage.getItem('krypta_test_aprovadas'), 10) || 0,
  vendasPendentes: 0,
  recentSales: JSON.parse(localStorage.getItem('krypta_test_recent_sales') || '[]')
};

// Manter saldo pendente zerado na dashboard 2
localStorage.setItem('krypta_test_pendente', '0');
localStorage.setItem('krypta_test_pendentes', '0');

function saveTestDashboardStateLocally() {
  localStorage.setItem('krypta_test_faturamento', TestDashboardState.faturamentoTotal);
  localStorage.setItem('krypta_test_disponivel', TestDashboardState.saldoDisponivel);
  localStorage.setItem('krypta_test_pendente', '0');
  localStorage.setItem('krypta_test_retencao', TestDashboardState.saldoRetencao);
  localStorage.setItem('krypta_test_aprovadas', TestDashboardState.vendasAprovadas);
  localStorage.setItem('krypta_test_pendentes', '0');
  localStorage.setItem('krypta_test_recent_sales', JSON.stringify(TestDashboardState.recentSales.slice(0, 50)));
}

function saveTestDashboardState() {
  saveTestDashboardStateLocally();
}

function applyServerTestDashboardState(serverState) {
  if (!serverState) return;
  const serverAmt = parseFloat(serverState.faturamentoTotal) || 0;
  const localAmt = TestDashboardState.faturamentoTotal || 0;
  const serverAprov = parseInt(serverState.vendasAprovadas, 10) || 0;
  const localAprov = TestDashboardState.vendasAprovadas || 0;

  // Se o servidor foi zerado pelo botão "Zerar"
  const isReset = (serverAmt === 0 && serverAprov === 0 && serverState.updatedAt && (Date.now() - serverState.updatedAt < 120000));
  if (isReset && (localAmt > 0 || localAprov > 0)) {
    TestDashboardState.faturamentoTotal = 0;
    TestDashboardState.saldoDisponivel = 0;
    TestDashboardState.saldoPendente = 0;
    TestDashboardState.saldoRetencao = 0;
    TestDashboardState.vendasAprovadas = 0;
    TestDashboardState.vendasPendentes = 0;
    TestDashboardState.recentSales = [];
    saveTestDashboardStateLocally();
    updateTestDashboardUI();
    return;
  }

  // Se o servidor tem valores mais novos, maiores ou iguais (ex: notebook recebendo dados do celular):
  if (serverAmt >= localAmt) {
    const changed = (TestDashboardState.faturamentoTotal !== serverAmt || TestDashboardState.vendasAprovadas !== serverAprov);
    TestDashboardState.faturamentoTotal = serverAmt;
    TestDashboardState.saldoDisponivel = parseFloat(serverState.saldoDisponivel) || (serverAmt * 0.95);
    TestDashboardState.saldoPendente = 0;
    TestDashboardState.saldoRetencao = parseFloat(serverState.saldoRetencao) || (serverAmt * 0.05);
    TestDashboardState.vendasAprovadas = serverAprov;
    TestDashboardState.vendasPendentes = 0;
    if (Array.isArray(serverState.recentSales) && serverState.recentSales.length > 0) {
      TestDashboardState.recentSales = serverState.recentSales;
    }
    saveTestDashboardStateLocally();
    if (changed) updateTestDashboardUI();
  } else if (localAmt > serverAmt) {
    // Caso especial: o celular já acumulou valor mais alto localmente (ex: R$ 641.506)!
    // O celular envia e sincroniza seus valores imediatamente com o servidor para que o computador receba!
    syncTestDashboardToServer(true);
  }
}

let isSyncingDashboardToServer = false;
async function syncTestDashboardToServer(force = false) {
  if (isSyncingDashboardToServer) return;
  isSyncingDashboardToServer = true;
  try {
    const res = await API.post('/api/test-dashboard/sync', {
      faturamentoTotal: TestDashboardState.faturamentoTotal,
      saldoDisponivel: TestDashboardState.saldoDisponivel,
      saldoPendente: 0,
      saldoRetencao: TestDashboardState.saldoRetencao,
      vendasAprovadas: TestDashboardState.vendasAprovadas,
      vendasPendentes: 0,
      recentSales: TestDashboardState.recentSales.slice(0, 50),
      deviceId: myDeviceId,
      force: force
    });
    if (res && res.state) {
      if (res.state.faturamentoTotal > TestDashboardState.faturamentoTotal) {
        applyServerTestDashboardState(res.state);
      }
    }
  } catch (_) {
  } finally {
    isSyncingDashboardToServer = false;
  }
}

let isFetchingDashboardServerState = false;
let lastDashboardFetchTime = 0;
async function fetchTestDashboardState(force = false) {
  const now = Date.now();
  if (!force && (now - lastDashboardFetchTime < 1000)) return;
  if (isFetchingDashboardServerState) return;
  isFetchingDashboardServerState = true;
  lastDashboardFetchTime = now;
  try {
    const res = await API.get('/api/test-dashboard/state');
    if (res && res.state) {
      applyServerTestDashboardState(res.state);
    }
  } catch (_) {
  } finally {
    isFetchingDashboardServerState = false;
  }
}

async function resetTestDashboard() {
  TestDashboardState.faturamentoTotal = 0;
  TestDashboardState.saldoDisponivel = 0;
  TestDashboardState.saldoPendente = 0;
  TestDashboardState.saldoRetencao = 0;
  TestDashboardState.vendasAprovadas = 0;
  TestDashboardState.vendasPendentes = 0;
  TestDashboardState.recentSales = [];
  saveTestDashboardStateLocally();
  updateTestDashboardUI();
  try {
    await API.post('/api/test-dashboard/reset', {});
  } catch (_) {}
}

function addTestSale(notif) {
  const rawAmt = typeof notif.rawAmount === 'number' ? notif.rawAmount : (parseFloat(String(notif.amount || '').replace(/[^0-9,.-]/g, '').replace(',', '.')) || 97.00);
  const isApproved = notif.status !== 'pending';

  if (isApproved) {
    TestDashboardState.vendasAprovadas++;
    TestDashboardState.faturamentoTotal += rawAmt;
    TestDashboardState.saldoDisponivel += (rawAmt * 0.95);
    TestDashboardState.saldoRetencao += (rawAmt * 0.05);
  }
  TestDashboardState.saldoPendente = 0;
  TestDashboardState.vendasPendentes = 0;

  TestDashboardState.recentSales.unshift({
    orderId: notif.orderId || ('#' + (10000 + Math.floor(Math.random() * 90000))),
    amount: rawAmt,
    isApproved: isApproved,
    status: isApproved ? 'Venda Aprovada' : 'Venda Pendente',
    device: /iphone|ipad/i.test(navigator.userAgent) ? 'iPhone Push' : (/android/i.test(navigator.userAgent) ? 'Android Push' : 'Celular Push'),
    time: notif.timestamp || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  });
  if (TestDashboardState.recentSales.length > 50) TestDashboardState.recentSales.length = 50;

  saveTestDashboardStateLocally();
  updateTestDashboardUI();
  syncTestDashboardToServer();
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

// Exposição global de funções essenciais para os botões do HTML
window.switchTab = switchTab;
window.toggleSidebarMenu = toggleSidebarMenu;
window.toggleMobileSidebar = toggleSidebarMenu;
window.closeMobileSidebar = closeMobileSidebar;
if (typeof startNotificationSequence !== 'undefined') window.startNotificationSequence = startNotificationSequence;
if (typeof stopNotificationSequence !== 'undefined') window.stopNotificationSequence = stopNotificationSequence;
if (typeof handleNotifSequenceToggle !== 'undefined') window.handleNotifSequenceToggle = handleNotifSequenceToggle;
if (typeof triggerSingleTestNotification !== 'undefined') window.triggerSingleTestNotification = triggerSingleTestNotification;
if (typeof loadTransactionsData !== 'undefined') window.loadTransactionsData = loadTransactionsData;
if (typeof loadFinancialData !== 'undefined') window.loadFinancialData = loadFinancialData;
if (typeof loadNotificationsData !== 'undefined') window.loadNotificationsData = loadNotificationsData;
if (typeof loadDashboardData !== 'undefined') window.loadDashboardData = loadDashboardData;
if (typeof updateTestDashboardUI !== 'undefined') window.updateTestDashboardUI = updateTestDashboardUI;
if (typeof fetchTestDashboardState !== 'undefined') window.fetchTestDashboardState = fetchTestDashboardState;
if (typeof syncTestDashboardToServer !== 'undefined') window.syncTestDashboardToServer = syncTestDashboardToServer;
if (typeof resetTestDashboard !== 'undefined') window.resetTestDashboard = resetTestDashboard;
if (typeof resetTestDashboardState !== 'undefined') window.resetTestDashboardState = resetTestDashboard;
if (typeof loadSavedPixKey !== 'undefined') window.loadSavedPixKey = loadSavedPixKey;
if (typeof savePixKeyAction !== 'undefined') window.savePixKeyAction = savePixKeyAction;
if (typeof copyPixKeyAction !== 'undefined') window.copyPixKeyAction = copyPixKeyAction;
if (typeof handleQuickPixGeneration !== 'undefined') window.handleQuickPixGeneration = handleQuickPixGeneration;
if (typeof requestWithdrawAction !== 'undefined') window.requestWithdrawAction = requestWithdrawAction;
if (typeof openModalCreateProduct !== 'undefined') window.openModalCreateProduct = openModalCreateProduct;
if (typeof closeModalCreateProduct !== 'undefined') window.closeModalCreateProduct = closeModalCreateProduct;
if (typeof submitCreateProduct !== 'undefined') window.submitCreateProduct = submitCreateProduct;
if (typeof changeUserPasswordAction !== 'undefined') window.changeUserPasswordAction = changeUserPasswordAction;
if (typeof toggleLangMenu !== 'undefined') window.toggleLangMenu = toggleLangMenu;
if (typeof changeAppLang !== 'undefined') window.changeAppLang = changeAppLang;

// Inicialização segura após o carregamento completo de todos os scripts e funções
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}
