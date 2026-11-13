// KryptaPay Application Controller (All 27 Modules + 3D Live Globe + Notifications)

const AppState = {
  currentTab: 'dashboard',
  user: null,
  theme: localStorage.getItem('kryptapay_theme') || 'dark',
  simulationRunning: false,
  notificationsHistory: []
};

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  setupNavigation();
  setupSSE();
  loadDashboardData();
  setupModalListeners();

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

  const titleEl = document.getElementById('headerPageTitle');
  if (titleEl && activeLink) {
    const label = activeLink.querySelector('.nav-label');
    if (label) titleEl.textContent = label.textContent.trim();
  }

  document.querySelectorAll('.view-pane').forEach(pane => pane.style.display = 'none');
  const targetPane = document.getElementById(`pane-${tabId}`);
  if (targetPane) {
    targetPane.style.display = 'block';
  }

  if (tabId === 'dashboard') loadDashboardData();
  else if (tabId === 'sales' || tabId === 'transactions') loadTransactionsData();
  else if (tabId === 'financial') loadFinancialData();
  else if (tabId === 'acquirers') loadAcquirersData();
  else if (tabId === 'products') loadProductsData();
  else if (tabId === 'rewards') loadRewardsData();
  else if (tabId === 'test-dashboard') loadTestDashboardData();

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
      } else if (data.type === 'simulation_completed') {
        showToastAlert('Simulação de notificações KryptaPay concluída com sucesso!');
        updateSimProgress(100, 'Concluída');
      }
    } catch (e) {
      console.error('Erro SSE:', e);
    }
  };
}

// Manipular Notificação Recebida com Foto da Logomarca Oficial
function handleIncomingNotification(data) {
  const notif = data.notification;
  AppState.notificationsHistory.unshift(notif);

  // Som de venda
  NotificationAudio.playCashSound();

  // Sino
  const bellBadge = document.getElementById('notifBellBadge');
  if (bellBadge) bellBadge.style.display = 'block';

  // Exibir Toast com a Logomarca Oficial da KryptaPay
  showFloatingToast(notif);

  // Barra de progresso da simulação
  if (data.sentCount && data.totalCount) {
    const percent = Math.round((data.sentCount / data.totalCount) * 100);
    updateSimProgress(percent, `Disparando ${data.sentCount} de ${data.totalCount}`);
  }

  if (AppState.currentTab === 'test-dashboard') {
    loadTestDashboardData();
  }
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

  const points = chartData.data || [12000, 18000, 24000, 31000, 28000, 42000, 39000];
  const max = Math.max(...points) * 1.15;
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
  const tbody = document.getElementById('salesTableBody');
  if (!tbody || !res.transactions) return;

  tbody.innerHTML = res.transactions.map(t => {
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
        <td>${t.payment_method.toUpperCase()}</td>
        <td style="font-size:0.8rem; color:var(--text-dim);">${new Date(t.created_at).toLocaleDateString('pt-BR')}</td>
      </tr>
    `;
  }).join('');
}

// 6. Pagamento Rápido Pix Dinâmico
async function generateQuickPix() {
  const amount = document.getElementById('quickPixAmount').value;
  const name = document.getElementById('quickPixName').value;
  const phone = document.getElementById('quickPixPhone').value;

  if (!amount || parseFloat(amount) <= 0) {
    alert('Informe um valor válido para a cobrança Pix.');
    return;
  }

  const res = await API.post('/api/payments/quick-pix', {
    amount: parseFloat(amount),
    customer_name: name,
    customer_phone: phone
  });

  if (res.success) {
    document.getElementById('pixResultArea').style.display = 'block';
    document.getElementById('pixQrContainer').innerHTML = res.qr_code_svg;
    document.getElementById('pixCopyCode').value = res.copy_paste;
    document.getElementById('pixAmountLabel').textContent = `R$ ${parseFloat(amount).toFixed(2).replace('.', ',')}`;
    showToastAlert('Cobrança Pix gerada com sucesso!');
  }
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
          <p style="font-size: 0.85rem; color: var(--purple-400); margin-bottom:0.5rem; font-weight:600;">Meta: R$ ${p.target.toLocaleString('pt-BR')}</p>
          <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom:1rem;">${p.description || ''}</p>
          <span class="badge-status ${p.unlocked ? 'badge-approved' : 'badge-pending'}">
            ${p.unlocked ? '✨ Conquistada!' : '🔒 Em Progresso'}
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
      if (e.target === modal) modal.classList.remove('active');
    });
  });
}
