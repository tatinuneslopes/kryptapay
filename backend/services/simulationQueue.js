// CryptaPay Simulation Engine & Persistent Queue
const crypto = require('node:crypto');
const db = require('../db');

// Lista de valores realistas para simulação conforme especificado
const SIMULATED_AMOUNTS = [24.90, 39.90, 49.50, 49.90, 67.00, 97.00, 147.00, 197.00, 297.00, 497.00];

// Fila em memória para rodadas ativas
const activeTimers = new Map();
// SSE (Server-Sent Events) clients conectados para receber notificações instantâneas
const sseClients = new Set();

function broadcastToClients(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch (e) {
      sseClients.delete(res);
    }
  }
}

// Iniciar uma rodada de simulação
function startSimulation({ userId, count, speed, intervalSeconds = 5, adSpend = 0 }) {
  const safeCount = Math.min(Math.max(parseInt(count, 10) || 10, 1), 100);
  
  // Mapear velocidade para intervalo em milissegundos
  let ms = intervalSeconds * 1000;
  if (speed === 'muito_rapida') ms = 2000;
  else if (speed === 'rapida') ms = 4000;
  else if (speed === 'normal') ms = 8000;
  else if (speed === 'lenta') ms = 15000;
  else if (speed === 'custom') ms = Math.max(intervalSeconds * 1000, 1000);

  // Parar qualquer rodada anterior ativa do mesmo usuário
  if (activeTimers.has(userId)) {
    clearInterval(activeTimers.get(userId));
    activeTimers.delete(userId);
  }

  const runId = crypto.randomUUID();
  db.prepare(`
    INSERT INTO simulation_runs (id, user_id, total_count, sent_count, speed, interval_seconds, status, ad_spend)
    VALUES (?, ?, ?, 0, ?, ?, 'running', ?)
  `).run(runId, userId, safeCount, speed, Math.round(ms / 1000), parseFloat(adSpend) || 0);

  let sent = 0;

  const timer = setInterval(() => {
    // Verificar se a rodada ainda está ativa no banco
    const run = db.prepare(`SELECT * FROM simulation_runs WHERE id = ?`).get(runId);
    if (!run || run.status !== 'running') {
      clearInterval(timer);
      activeTimers.delete(userId);
      return;
    }

    if (sent >= safeCount) {
      db.prepare(`UPDATE simulation_runs SET status = 'completed' WHERE id = ?`).run(runId);
      clearInterval(timer);
      activeTimers.delete(userId);
      broadcastToClients({ type: 'simulation_completed', runId, userId });
      return;
    }

    // Todas as vendas de teste da simulação são aprovadas (100% de conversão e saldo liberado)
    const isApproved = true;
    const category = 'venda_aprovada';
    const title = '🎉 VENDA APROVADA! - KryptaPay';
    const status = 'approved';

    // Escolher valor realista aleatório
    const randomAmount = SIMULATED_AMOUNTS[Math.floor(Math.random() * SIMULATED_AMOUNTS.length)];
    const orderNumber = 10000 + Math.floor(Math.random() * 90000);
    const orderId = `#${orderNumber}`;
    const formattedAmount = randomAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const body = `${title}\nValor: R$ ${formattedAmount}\nPedido: ${orderId}`;

    const notifId = crypto.randomUUID();

    // 1. Gravar notificação de simulação (is_simulation = 1)
    db.prepare(`
      INSERT INTO notifications (id, user_id, title, body, category, order_id, amount, is_simulation)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).run(notifId, userId, title, body, category, orderId, randomAmount);

    // 2. Gravar transação simulada (is_simulation = 1) para a Dashboard de Testes
    const txId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO transactions (id, order_id, user_id, amount, net_amount, fee, payment_method, status, customer_name, is_simulation)
      VALUES (?, ?, ?, ?, ?, ?, 'pix', ?, 'Simulação Automática', 1)
    `).run(txId, orderId, userId, randomAmount, randomAmount * 0.97, randomAmount * 0.03, status);

    sent++;
    db.prepare(`UPDATE simulation_runs SET sent_count = ? WHERE id = ?`).run(sent, runId);

    // Transmitir evento para clientes conectados
    broadcastToClients({
      type: 'notification',
      runId,
      sentCount: sent,
      totalCount: safeCount,
      notification: {
        id: notifId,
        brand: 'KRYPTAPAY',
        icon: '/icons/logo.png',
        title,
        body,
        amount: `R$ ${formattedAmount}`,
        rawAmount: randomAmount,
        orderId,
        category,
        status,
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      }
    });

  }, ms);

  activeTimers.set(userId, timer);

  return { runId, totalCount: safeCount, speed, intervalMs: ms };
}

// Pausar simulação
function pauseSimulation(userId) {
  if (activeTimers.has(userId)) {
    clearInterval(activeTimers.get(userId));
    activeTimers.delete(userId);
  }
  db.prepare(`UPDATE simulation_runs SET status = 'paused' WHERE user_id = ? AND status = 'running'`).run(userId);
  broadcastToClients({ type: 'simulation_paused', userId });
  return { success: true };
}

// Cancelar simulação
function cancelSimulation(userId) {
  if (activeTimers.has(userId)) {
    clearInterval(activeTimers.get(userId));
    activeTimers.delete(userId);
  }
  db.prepare(`UPDATE simulation_runs SET status = 'cancelled' WHERE user_id = ? AND (status = 'running' OR status = 'paused')`).run(userId);
  broadcastToClients({ type: 'simulation_cancelled', userId });
  return { success: true };
}

// Obter métricas da Dashboard de Testes (Exclusivamente Simuladas)
function getTestDashboardMetrics(userId) {
  const totals = db.prepare(`
    SELECT 
      COUNT(*) as total_notifications,
      SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_count,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
      COALESCE(SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END), 0) as approved_amount,
      COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) as pending_amount,
      COALESCE(AVG(CASE WHEN status = 'approved' THEN amount ELSE NULL END), 0) as avg_ticket
    FROM transactions
    WHERE user_id = ? AND is_simulation = 1
  `).get(userId);

  // Obter investimento fictício em anúncios da última rodada
  const lastRun = db.prepare(`
    SELECT * FROM simulation_runs WHERE user_id = ? ORDER BY created_at DESC LIMIT 1
  `).get(userId);

  const adSpend = lastRun ? lastRun.ad_spend : 0;
  const approvedRevenue = totals.approved_amount;
  const simulatedResult = approvedRevenue - adSpend;
  const simulatedROI = adSpend > 0 ? ((simulatedResult / adSpend) * 100).toFixed(1) : 0;

  return {
    totals,
    adSpend,
    approvedRevenue,
    simulatedResult,
    simulatedROI: `${simulatedROI}%`,
    lastRun
  };
}

function triggerSingleTestNotification({ userId, amount, status = 'approved' }) {
  const chosenAmount = amount || SIMULATED_AMOUNTS[Math.floor(Math.random() * SIMULATED_AMOUNTS.length)];
  const orderNumber = 10000 + Math.floor(Math.random() * 90000);
  const orderId = `#${orderNumber}`;
  const formattedAmount = chosenAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const isApproved = status === 'approved';
  const title = isApproved ? '🎉 VENDA APROVADA! - KryptaPay' : '⏳ VENDA PENDENTE! - KryptaPay';
  const category = isApproved ? 'venda_aprovada' : 'venda_pendente';
  const body = isApproved
    ? `VENDA APROVADA!\nValor: R$ ${formattedAmount}\nPedido: ${orderId} • Pix Instantâneo`
    : `VENDA PENDENTE!\nValor: R$ ${formattedAmount}\nPedido: ${orderId} • Aguardando Pagamento`;
  const notifId = crypto.randomUUID();

  try {
    db.prepare(`
      INSERT INTO notifications (id, user_id, title, body, category, order_id, amount, is_simulation)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).run(notifId, userId, title, body, category, orderId, chosenAmount);
  } catch (e) {
    console.warn('Erro ao salvar notificação única:', e);
  }

  const notificationData = {
    id: notifId,
    brand: 'KRYPTAPAY',
    icon: '/icons/logo.png',
    title,
    body,
    amount: `R$ ${formattedAmount}`,
    rawAmount: chosenAmount,
    orderId,
    category,
    status,
    timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  };

  broadcastToClients({
    type: 'notification',
    sentCount: 1,
    totalCount: 1,
    notification: notificationData
  });

  return notificationData;
}

module.exports = {
  startSimulation,
  pauseSimulation,
  cancelSimulation,
  getTestDashboardMetrics,
  triggerSingleTestNotification,
  broadcastToClients,
  sseClients
};
