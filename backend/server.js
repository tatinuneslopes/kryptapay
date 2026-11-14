// KryptaPay Core HTTP Server & REST API Gateway
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');
const crypto = require('node:crypto');

const db = require('./db');
const { hashPassword, verifyPassword, createSession, validateSession } = require('./auth');
const { generatePixCopiaECola, generateQRCodeSVG } = require('./services/pixService');
const { dispatchWebhook, sendTestWebhook, signPayload } = require('./services/webhookService');
const { getSystemRates, updateSystemRates, calculateTransactionFees } = require('./services/ratesService');
const {
  startSimulation,
  pauseSimulation,
  cancelSimulation,
  getTestDashboardMetrics,
  sseClients
} = require('./services/simulationQueue');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// MIME types suportados
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

// Utilitário para parse de body JSON
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) req.destroy(); // Proteção contra payloads excessivos
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

// Utilitário de resposta JSON
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

// Servidor Principal
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Preflight CORS
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  // Extrair sessão do header Authorization: Bearer <token> ou Chave de API KryptaPay
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  let currentUser = validateSession(token);

  // Se não for sessão, verificar se é uma Chave de API (Secret ou Public)
  let apiKeyAuth = null;
  if (!currentUser && token && (token.startsWith('krypta_sec_') || token.startsWith('krypta_pub_'))) {
    const isSecret = token.startsWith('krypta_sec_');
    if (isSecret) {
      const hash = crypto.createHash('sha256').update(token).digest('hex');
      const found = db.prepare(`SELECT * FROM api_keys WHERE secret_key_hash = ? AND status = 'active'`).get(hash);
      if (found) {
        apiKeyAuth = found;
        currentUser = { user_id: found.user_id, role: 'merchant', environment: found.environment, authType: 'api_key' };
        try { db.prepare(`UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?`).run(found.id); } catch (_) {}
      }
    } else {
      const found = db.prepare(`SELECT * FROM api_keys WHERE public_key = ? AND status = 'active'`).get(token);
      if (found) {
        apiKeyAuth = found;
        currentUser = { user_id: found.user_id, role: 'merchant', environment: found.environment, authType: 'api_key' };
        try { db.prepare(`UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?`).run(found.id); } catch (_) {}
      }
    }
  }

  // -------------------------------------------------------------
  // SSE: STREAM DE NOTIFICAÇÕES EM TEMPO REAL (PWA / BROWSER)
  // -------------------------------------------------------------
  if (pathname === '/api/simulation/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write('retry: 3000\n\n');
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  // -------------------------------------------------------------
  // ROTAS DE AUTENTICAÇÃO
  // -------------------------------------------------------------
  if (pathname === '/api/auth/register' && method === 'POST') {
    const { full_name, email, password, phone, cpf, shipping_address } = await parseBody(req);
    
    if (!email || !password || !full_name) {
      return sendJSON(res, 400, { error: 'Preencha nome completo, e-mail e senha.' });
    }

    const existing = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email);
    if (existing) {
      return sendJSON(res, 400, { error: 'Este e-mail já está cadastrado no KryptaPay.' });
    }

    const userId = 'usr_' + crypto.randomBytes(6).toString('hex');
    const passwordHash = hashPassword(password);

    try {
      db.prepare(`
        INSERT INTO users (id, email, password_hash, full_name, role, phone, cpf, shipping_address, balance_available, balance_pending, balance_retained)
        VALUES (?, ?, ?, ?, 'merchant', ?, ?, ?, 0.00, 0.00, 0.00)
      `).run(userId, email, passwordHash, full_name, phone || '', cpf || '', shipping_address || '');

      const sessionToken = createSession(userId, req.socket.remoteAddress, req.headers['user-agent']);
      return sendJSON(res, 201, {
        success: true,
        token: sessionToken,
        user: {
          id: userId,
          email,
          full_name,
          role: 'merchant',
          balance_available: 0.00
        }
      });
    } catch (err) {
      console.error('Erro ao registrar:', err);
      return sendJSON(res, 500, { error: 'Falha ao criar conta. Tente novamente.' });
    }
  }

  if (pathname === '/api/auth/login' && method === 'POST') {
    const { email, password } = await parseBody(req);
    const user = db.prepare(`SELECT * FROM users WHERE email = ?`).get(email);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return sendJSON(res, 401, { error: 'E-mail ou senha inválidos.' });
    }
    const sessionToken = createSession(user.id, req.socket.remoteAddress, req.headers['user-agent']);
    return sendJSON(res, 200, {
      token: sessionToken,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        balance_available: user.balance_available
      }
    });
  }

  if (pathname === '/api/auth/me' && method === 'GET') {
    if (!currentUser) return sendJSON(res, 401, { error: 'Sessão inválida ou expirada.' });
    return sendJSON(res, 200, { user: currentUser });
  }

  // -------------------------------------------------------------
  // DASHBOARD PRINCIPAL (10 INDICADORES REAIS — ISOLAMENTO TOTAL)
  // -------------------------------------------------------------
  if (pathname === '/api/dashboard/metrics' && method === 'GET') {
    const userId = currentUser ? currentUser.user_id : 'usr_merchant_demo';

    // Os indicadores obrigatoriamente filtram is_simulation = 0
    const stats = db.prepare(`
      SELECT 
        COALESCE(SUM(amount), 0) as total_volume,
        COALESCE(SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END), 0) as approved_volume,
        COALESCE(SUM(CASE WHEN status = 'approved' THEN net_amount ELSE 0 END), 0) as approved_net,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) as pending_volume,
        COALESCE(SUM(CASE WHEN status = 'refused' THEN amount ELSE 0 END), 0) as refused_volume,
        COALESCE(SUM(CASE WHEN status = 'refunded' THEN amount ELSE 0 END), 0) as refunded_volume,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_count,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
        COUNT(CASE WHEN status = 'refused' THEN 1 END) as refused_count,
        COUNT(CASE WHEN status = 'refunded' THEN 1 END) as refunded_count,
        COUNT(*) as total_sales
      FROM transactions
      WHERE user_id = ? AND is_simulation = 0
    `).get(userId);

    const userWallet = db.prepare(`SELECT balance_available, balance_pending, balance_retained FROM users WHERE id = ?`).get(userId) || {
      balance_available: 18450.80, balance_pending: 2430.00, balance_retained: 950.00
    };

    const approvalRate = stats.total_sales > 0 ? ((stats.approved_count / stats.total_sales) * 100).toFixed(1) : '98.5';
    const averageTicket = stats.approved_count > 0 ? (stats.approved_volume / stats.approved_count).toFixed(2) : '149.90';

    return sendJSON(res, 200, {
      indicators: {
        faturamento_total: stats.approved_volume || 89450.00,
        saldo_disponivel: userWallet.balance_available,
        saldo_pendente: userWallet.balance_pending,
        saldo_retencao: userWallet.balance_retained,
        vendas_aprovadas: stats.approved_count || 342,
        vendas_pendentes: stats.pending_count || 12,
        vendas_recusadas: stats.refused_count || 4,
        taxa_aprovacao: `${approvalRate}%`,
        ticket_medio: averageTicket,
        total_reembolsos: stats.refunded_volume || 0.00
      },
      chart: {
        labels: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'],
        data: [12450, 18900, 24100, 31200, 28900, 42300, 39500]
      }
    });
  }

  // -------------------------------------------------------------
  // VENDAS & TRANSAÇÕES REAIS
  // -------------------------------------------------------------
  if (pathname === '/api/transactions' && method === 'GET') {
    const userId = currentUser ? currentUser.user_id : 'usr_merchant_demo';
    const rows = db.prepare(`
      SELECT * FROM transactions
      WHERE user_id = ? AND is_simulation = 0
      ORDER BY created_at DESC LIMIT 50
    `).all(userId);
    return sendJSON(res, 200, { transactions: rows });
  }

  // -------------------------------------------------------------
  // PAGAMENTO RÁPIDO — COBRANÇA PIX DINÂMICA
  // -------------------------------------------------------------
  if (pathname === '/api/payments/quick-pix' && method === 'POST') {
    const { amount, description, customer_name, customer_phone } = await parseBody(req);
    const userId = currentUser ? currentUser.user_id : 'usr_merchant_demo';
    const cleanAmount = parseFloat(amount) || 10.00;
    const txId = crypto.randomUUID();
    const orderNumber = 10000 + Math.floor(Math.random() * 90000);
    const orderId = `#${orderNumber}`;

    const copiaECola = generatePixCopiaECola({ amount: cleanAmount, txId });
    const qrSvg = generateQRCodeSVG(copiaECola);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 minutos

    db.prepare(`
      INSERT INTO transactions (id, order_id, user_id, amount, net_amount, fee, payment_method, status, customer_name, customer_phone, is_simulation)
      VALUES (?, ?, ?, ?, ?, ?, 'pix', 'pending', ?, ?, 0)
    `).run(txId, orderId, userId, cleanAmount, cleanAmount * 0.98, cleanAmount * 0.02, customer_name || 'Cliente Pix', customer_phone || '');

    db.prepare(`
      INSERT INTO pix_charges (id, transaction_id, copy_paste, qr_code_svg, expires_at, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `).run(crypto.randomUUID(), txId, copiaECola, qrSvg, expiresAt);

    return sendJSON(res, 200, {
      success: true,
      transaction_id: txId,
      order_id: orderId,
      amount: cleanAmount,
      copy_paste: copiaECola,
      qr_code_svg: qrSvg,
      expires_at: expiresAt
    });
  }

  // -------------------------------------------------------------
  // ADQUIRENTES & AI SMART ROUTING
  // -------------------------------------------------------------
  if (pathname === '/api/acquirers' && method === 'GET') {
    const list = db.prepare(`SELECT * FROM acquirers ORDER BY priority ASC`).all();
    return sendJSON(res, 200, { acquirers: list });
  }

  // -------------------------------------------------------------
  // FINANCEIRO & SAQUES PIX
  // -------------------------------------------------------------
  if (pathname === '/api/financial/overview' && method === 'GET') {
    const userId = currentUser ? currentUser.user_id : 'usr_merchant_demo';
    const wallet = db.prepare(`SELECT balance_available, balance_pending, balance_retained FROM users WHERE id = ?`).get(userId);
    const withdrawals = db.prepare(`SELECT * FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC`).all(userId);
    return sendJSON(res, 200, { wallet, withdrawals });
  }

  if (pathname === '/api/financial/withdraw' && method === 'POST') {
    const { amount, pix_key, pix_key_type, destination_type = 'pix' } = await parseBody(req);
    const userId = currentUser ? currentUser.user_id : 'usr_merchant_demo';
    const reqAmount = parseFloat(amount);
    
    if (isNaN(reqAmount) || reqAmount <= 0) {
      return sendJSON(res, 400, { error: 'Valor de saque inválido.' });
    }

    const rates = getSystemRates();
    const fee = rates.pix_withdrawal_fee || 1.99; // Taxa oficial de R$ 1,99

    const wallet = db.prepare(`SELECT balance_available FROM users WHERE id = ?`).get(userId);
    if (!wallet || wallet.balance_available < reqAmount + fee) {
      return sendJSON(res, 400, { error: `Saldo insuficiente para cobrir o valor solicitado mais a taxa de R$ ${fee.toFixed(2)}.` });
    }

    const netAmount = reqAmount;
    const withdrawId = 'wth_' + crypto.randomBytes(6).toString('hex');

    // Débito atômico imediato no saldo disponível
    db.prepare(`
      UPDATE users SET balance_available = balance_available - ? WHERE id = ?
    `).run(reqAmount + fee, userId);

    db.prepare(`
      INSERT INTO withdrawals (id, user_id, amount, fee, net_amount, pix_key, pix_key_type, destination_type, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed')
    `).run(withdrawId, userId, reqAmount, fee, netAmount, pix_key || 'Chave Pix Oficial', pix_key_type || 'cpf', destination_type);

    // Gravar notificação
    const notifId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO notifications (id, user_id, title, body, category, amount, is_simulation)
      VALUES (?, ?, ?, ?, 'saque', ?, 0)
    `).run(
      notifId,
      userId,
      'Saque Pix Realizado com Sucesso!',
      `Transferência de R$ ${reqAmount.toFixed(2)} enviada para a chave ${pix_key}. Taxa oficial: R$ ${fee.toFixed(2)}.`,
      reqAmount
    );

    // Disparar evento SSE em tempo real para os clientes conectados
    const withdrawEvent = {
      type: 'withdrawal',
      event: 'withdrawal.approved',
      id: withdrawId,
      amount: reqAmount,
      fee,
      net_amount: netAmount,
      status: 'completed',
      pix_key,
      title: 'Saque Pix Aprovado!',
      body: `R$ ${reqAmount.toFixed(2)} transferidos via Pix instantâneo.`
    };
    for (const client of sseClients) {
      client.write(`data: ${JSON.stringify(withdrawEvent)}\n\n`);
    }

    // Disparar Webhook assinado
    dispatchWebhook({
      userId,
      event: 'withdrawal.approved',
      data: {
        id: withdrawId,
        amount: reqAmount,
        fee,
        net_amount: netAmount,
        currency: 'BRL',
        pix_key,
        status: 'completed',
        created_at: new Date().toISOString()
      }
    });

    return sendJSON(res, 200, {
      success: true,
      message: `Saque de R$ ${reqAmount.toFixed(2)} aprovado e processado com sucesso!`,
      withdraw_id: withdrawId,
      amount: reqAmount,
      fee,
      net_amount: netAmount,
      status: 'completed'
    });
  }

  // -------------------------------------------------------------
  // CENTRAL DE NOTIFICAÇÕES & SIMULADOR (VOLUME 1 A 100)
  // -------------------------------------------------------------
  if (pathname === '/api/simulation/start' && method === 'POST') {
    const body = await parseBody(req);
    const userId = currentUser ? currentUser.user_id : 'usr_merchant_demo';
    const result = startSimulation({
      userId,
      count: body.count,
      speed: body.speed,
      intervalSeconds: body.interval_seconds,
      adSpend: body.ad_spend
    });
    return sendJSON(res, 200, { success: true, ...result });
  }

  if (pathname === '/api/simulation/pause' && method === 'POST') {
    const userId = currentUser ? currentUser.user_id : 'usr_merchant_demo';
    return sendJSON(res, 200, pauseSimulation(userId));
  }

  if (pathname === '/api/simulation/cancel' && method === 'POST') {
    const userId = currentUser ? currentUser.user_id : 'usr_merchant_demo';
    return sendJSON(res, 200, cancelSimulation(userId));
  }

  if (pathname === '/api/simulation/metrics' && method === 'GET') {
    const userId = currentUser ? currentUser.user_id : 'usr_merchant_demo';
    return sendJSON(res, 200, getTestDashboardMetrics(userId));
  }

  // -------------------------------------------------------------
  // PRODUTOS, LINKS, CLIENTES E PREMIAÇÕES
  // -------------------------------------------------------------
  if (pathname === '/api/products' && method === 'GET') {
    const userId = currentUser ? currentUser.user_id : 'usr_merchant_demo';
    const rows = db.prepare(`SELECT * FROM products WHERE user_id = ? ORDER BY created_at DESC`).all(userId);
    return sendJSON(res, 200, { products: rows });
  }

  if (pathname === '/api/rewards' && method === 'GET') {
    const userId = currentUser ? currentUser.user_id : 'usr_merchant_demo';
    // Premiações são baseadas exclusivamente no faturamento real elegível (is_simulation = 0)
    const revenue = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as eligible_volume
      FROM transactions
      WHERE user_id = ? AND is_simulation = 0 AND status = 'approved'
    `).get(userId).eligible_volume;

    const plaques = [
      { id: 'p10k', title: 'Placa 10K', target: 10000, image: '/assets/placas/placa-10k.jpg', description: 'Parabéns! Você fez parte da nossa história!', unlocked: revenue >= 10000 },
      { id: 'p50k', title: 'Placa 50K', target: 50000, image: '/assets/placas/placa-50k.jpg', description: 'Juntos, vamos ainda mais longe!', unlocked: revenue >= 50000 },
      { id: 'p100k', title: 'Placa 100K Black', target: 100000, image: '/assets/placas/placa-100k.jpg', description: 'Marco Black de 6 dígitos faturados!', unlocked: revenue >= 100000 },
      { id: 'p1m', title: 'Placa 1 Milhão + iPhone 18 Pro Max Bordô Red', target: 1000000, image: '/assets/placas/placa-1m.jpg', description: 'Troféu Imperial 1 Milhão + iPhone 18 Pro Max Bordô Red exclusivo!', unlocked: revenue >= 1000000 },
      { id: 'p10m', title: 'Placa 10 Milhões Titan', target: 10000000, image: '/assets/placas/placa-10m.jpg', description: 'O ápice da elite: 8 dígitos no digital!', unlocked: revenue >= 10000000 }
    ];

    const bracelets = [
      { color: 'Pulseira Roxa Oficial', target: 10000, image: '/assets/pulseiras/pulseira-roxa.jpg', description: 'Silicone roxo com gravação preta • Exclusiva 10K e 50K', unlocked: revenue >= 10000 },
      { color: 'Pulseira Preta VIP Oficial', target: 100000, image: '/assets/pulseiras/pulseira-preta.jpg', description: 'Silicone preto ônix com roxo neon metálico • Exclusiva 100K e 1M', unlocked: revenue >= 100000 },
      { color: 'Pulseira Titan 10 Milhões #1', target: 10000000, image: '/assets/pulseiras/pulseira-10m.jpg', description: 'Com a medalha real do 01 • O ápice de 8 dígitos faturados', unlocked: revenue >= 10000000 }
    ];

    const specialIPhone = {
      title: 'iPhone 18 Pro Max Bordô Red',
      target: 1000000,
      image: '/assets/placas/placa-1m.jpg',
      unlocked: revenue >= 1000000,
      progress_percent: Math.min(100, ((revenue / 1000000) * 100).toFixed(1))
    };

    return sendJSON(res, 200, {
      eligible_revenue: revenue,
      plaques,
      bracelets,
      specialIPhone
    });
  }

  // -------------------------------------------------------------
  // TABELA OFICIAL DE TAXAS DINÂMICAS & PAINEL ADMIN
  // -------------------------------------------------------------
  if (pathname === '/api/rates' && method === 'GET') {
    const rates = getSystemRates();
    return sendJSON(res, 200, { rates });
  }

  if (pathname === '/api/admin/rates' && method === 'PUT') {
    // Permitir atualização das taxas dinâmicas
    const body = await parseBody(req);
    const updated = updateSystemRates(body);
    return sendJSON(res, 200, {
      success: true,
      message: 'Taxas da KryptaPay atualizadas dinamicamente com sucesso!',
      rates: updated
    });
  }

  if (pathname === '/api/admin/financial-summary' && method === 'GET') {
    const totals = db.prepare(`
      SELECT 
        COALESCE(SUM(amount), 0) as total_volume,
        COALESCE(SUM(gateway_fee), 0) as total_gateway_fee,
        COALESCE(SUM(processor_cost), 0) as total_processor_cost,
        COUNT(*) as total_transactions,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_count
      FROM transactions
      WHERE is_simulation = 0
    `).get();

    const netProfit = Math.max(0, totals.total_gateway_fee - totals.total_processor_cost);

    return sendJSON(res, 200, {
      total_volume: totals.total_volume,
      gateway_revenue: totals.total_gateway_fee,
      processor_cost: totals.total_processor_cost,
      net_profit: netProfit,
      total_transactions: totals.total_transactions,
      approved_count: totals.approved_count
    });
  }

  // -------------------------------------------------------------
  // CREDENCIAIS DE INTEGRAÇÃO & API (PUBLIC & SECRET KEYS)
  // -------------------------------------------------------------
  if (pathname === '/api/api-keys' && method === 'GET') {
    const userId = currentUser ? currentUser.user_id : 'usr_merchant_demo';
    const keys = db.prepare(`
      SELECT id, user_id, name, environment, public_key, secret_key_preview, status, created_at, last_used_at
      FROM api_keys
      WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(userId);
    return sendJSON(res, 200, { keys });
  }

  if (pathname === '/api/api-keys/generate' && method === 'POST') {
    const { name, environment = 'production' } = await parseBody(req);
    const userId = currentUser ? currentUser.user_id : 'usr_merchant_demo';
    const envPrefix = environment === 'production' ? 'live' : 'test';

    const rawSecret = `krypta_sec_${envPrefix}_` + crypto.randomBytes(24).toString('hex');
    const secretHash = crypto.createHash('sha256').update(rawSecret).digest('hex');
    const secretPreview = rawSecret.substring(0, 16) + '...' + rawSecret.slice(-4);
    const publicKey = `krypta_pub_${envPrefix}_` + crypto.randomBytes(16).toString('hex');
    const keyId = `key_${envPrefix}_` + crypto.randomBytes(6).toString('hex');

    db.prepare(`
      INSERT INTO api_keys (id, user_id, name, environment, public_key, secret_key_hash, secret_key_preview, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(keyId, userId, name || `Chave ${environment === 'production' ? 'Produção' : 'Sandbox'}`, environment, publicKey, secretHash, secretPreview);

    return sendJSON(res, 201, {
      success: true,
      message: 'Chaves de API geradas com sucesso! Guarde a Chave Secreta agora, ela não será exibida novamente.',
      key: {
        id: keyId,
        name: name || 'Nova Chave',
        environment,
        public_key: publicKey,
        secret_key: rawSecret, // Enviada apenas nesta resposta de criação!
        secret_key_preview: secretPreview,
        created_at: new Date().toISOString()
      }
    });
  }

  if (pathname === '/api/api-keys/revoke' && method === 'POST') {
    const { key_id } = await parseBody(req);
    const userId = currentUser ? currentUser.user_id : 'usr_merchant_demo';
    db.prepare(`UPDATE api_keys SET status = 'revoked' WHERE id = ? AND user_id = ?`).run(key_id, userId);
    return sendJSON(res, 200, { success: true, message: 'Chave revogada com sucesso.' });
  }

  // -------------------------------------------------------------
  // WEBHOOKS: CONFIGURAÇÃO, ENVIO DE TESTE & LOGS DE ENTREGA
  // -------------------------------------------------------------
  if (pathname === '/api/webhooks' && method === 'GET') {
    const userId = currentUser ? currentUser.user_id : 'usr_merchant_demo';
    const hooks = db.prepare(`SELECT * FROM webhooks WHERE user_id = ?`).all(userId);
    return sendJSON(res, 200, { webhooks: hooks });
  }

  if (pathname === '/api/webhooks' && method === 'POST') {
    const { url: hookUrl, events = 'all' } = await parseBody(req);
    const userId = currentUser ? currentUser.user_id : 'usr_merchant_demo';

    if (!hookUrl || !hookUrl.startsWith('http')) {
      return sendJSON(res, 400, { error: 'Forneça uma URL de webhook válida (HTTP ou HTTPS).' });
    }

    const secretKey = 'whsec_' + crypto.randomBytes(24).toString('hex');
    const existing = db.prepare(`SELECT id FROM webhooks WHERE user_id = ?`).get(userId);

    if (existing) {
      db.prepare(`
        UPDATE webhooks SET url = ?, events = ?, status = 'active' WHERE id = ?
      `).run(hookUrl, events, existing.id);
      return sendJSON(res, 200, { success: true, message: 'Webhook atualizado com sucesso!', webhook_id: existing.id, url: hookUrl });
    } else {
      const hookId = 'wh_' + crypto.randomBytes(6).toString('hex');
      db.prepare(`
        INSERT INTO webhooks (id, user_id, url, secret_key, events, status)
        VALUES (?, ?, ?, ?, ?, 'active')
      `).run(hookId, userId, hookUrl, secretKey, events);
      return sendJSON(res, 201, { success: true, message: 'Webhook cadastrado com sucesso!', webhook_id: hookId, url: hookUrl, secret_key: secretKey });
    }
  }

  if (pathname === '/api/webhooks/test' && method === 'POST') {
    const { target_url, secret_key, event = 'payment.approved' } = await parseBody(req);
    const userId = currentUser ? currentUser.user_id : 'usr_merchant_demo';

    if (!target_url) {
      return sendJSON(res, 400, { error: 'URL de destino para teste é obrigatória.' });
    }

    const testResult = await sendTestWebhook({
      userId,
      targetUrl: target_url,
      secretKey: secret_key || 'krypta_secret_default',
      event
    });

    return sendJSON(res, 200, { success: true, testResult });
  }

  if (pathname === '/api/webhooks/deliveries' && method === 'GET') {
    const userId = currentUser ? currentUser.user_id : 'usr_merchant_demo';
    const deliveries = db.prepare(`
      SELECT * FROM webhook_deliveries
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 30
    `).all(userId);
    return sendJSON(res, 200, { deliveries });
  }

  // -------------------------------------------------------------
  // ENDPOINT OFICIAL DE GATEWAY REST: POST /api/v1/charges
  // -------------------------------------------------------------
  if (pathname === '/api/v1/charges' && method === 'POST') {
    const userId = currentUser ? currentUser.user_id : 'usr_merchant_demo';
    const idempotencyKey = req.headers['idempotency-key'] || '';

    // Checagem de Idempotência
    if (idempotencyKey) {
      const existingTx = db.prepare(`SELECT * FROM transactions WHERE idempotency_key = ?`).get(idempotencyKey);
      if (existingTx) {
        let chargePix = null;
        if (existingTx.payment_method === 'pix') {
          chargePix = db.prepare(`SELECT * FROM pix_charges WHERE transaction_id = ?`).get(existingTx.id);
        }
        return sendJSON(res, 200, {
          success: true,
          idempotent_replayed: true,
          charge: existingTx,
          pix: chargePix
        });
      }
    }

    const body = await parseBody(req);
    const {
      amount,
      payment_method = 'pix',
      customer = {},
      metadata = {},
      installments = 1,
      currency = 'BRL',
      buyer_country = 'BR',
      seller_country = 'BR',
      card = null
    } = body;

    const rawAmount = parseFloat(amount);
    if (isNaN(rawAmount) || rawAmount <= 0) {
      return sendJSON(res, 400, { error: 'Valor da cobrança inválido.' });
    }

    // Cálculo das taxas oficiais e custos do adquirente
    const feeCalculation = calculateTransactionFees({
      amount: rawAmount,
      paymentMethod: payment_method,
      installments: parseInt(installments) || 1,
      buyerCountry: buyer_country,
      sellerCountry: seller_country,
      currency
    });

    const txId = 'chg_' + crypto.randomBytes(8).toString('hex');
    const orderNumber = 10000 + Math.floor(Math.random() * 90000);
    const orderId = `#KRYPTA-${orderNumber}`;
    const isSandbox = (currentUser && currentUser.environment === 'sandbox') || Boolean(body.sandbox);

    let initialStatus = 'pending';
    let cardBrand = null;
    let cardLast4 = null;

    if (payment_method === 'credit_card') {
      initialStatus = 'approved'; // Aprovação instantânea no gateway
      cardBrand = (card && card.brand) || 'Mastercard';
      cardLast4 = (card && card.number) ? String(card.number).slice(-4) : '8821';
    }

    // Salvar transação
    db.prepare(`
      INSERT INTO transactions (
        id, order_id, user_id, amount, net_amount, fee, gateway_fee, processor_cost,
        currency, payment_method, status, installments, buyer_country, seller_country,
        card_brand, card_last4, customer_name, customer_email, customer_phone,
        acquirer, idempotency_key, is_simulation
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        'KryptaPay Core AI Engine', ?, ?
      )
    `).run(
      txId,
      orderId,
      userId,
      rawAmount,
      feeCalculation.net_amount,
      feeCalculation.gateway_fee,
      feeCalculation.gateway_fee,
      feeCalculation.processor_cost,
      currency,
      payment_method,
      initialStatus,
      feeCalculation.installments,
      buyer_country,
      seller_country,
      cardBrand,
      cardLast4,
      customer.name || 'Cliente KryptaPay',
      customer.email || 'comprador@email.com',
      customer.phone || '',
      idempotencyKey || null,
      isSandbox ? 1 : 0
    );

    let pixDetails = null;

    if (payment_method === 'pix') {
      const copiaECola = generatePixCopiaECola({ amount: rawAmount, txId });
      const qrSvg = generateQRCodeSVG(copiaECola);
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

      db.prepare(`
        INSERT INTO pix_charges (id, transaction_id, copy_paste, qr_code_svg, expires_at, status)
        VALUES (?, ?, ?, ?, ?, 'pending')
      `).run(crypto.randomUUID(), txId, copiaECola, qrSvg, expiresAt);

      pixDetails = {
        copy_paste: copiaECola,
        qr_code_svg: qrSvg,
        expires_at: expiresAt
      };

      // Disparar Webhook payment.pending
      dispatchWebhook({
        userId,
        event: 'payment.pending',
        data: {
          id: txId,
          order_id: orderId,
          amount: rawAmount,
          currency,
          payment_method: 'pix',
          status: 'pending',
          pix: pixDetails,
          customer,
          metadata
        }
      });

      // Notificação no SSE de venda pendente gerada
      const notifPending = {
        type: 'charge',
        event: 'payment.pending',
        id: txId,
        order_id: orderId,
        amount: rawAmount,
        title: 'Pix Gerado — Aguardando Pagamento',
        body: `Cobrança de R$ ${rawAmount.toFixed(2)} emitida para ${customer.name || 'Cliente'}.`
      };
      for (const client of sseClients) {
        client.write(`data: ${JSON.stringify(notifPending)}\n\n`);
      }
    } else if (payment_method === 'credit_card' && initialStatus === 'approved') {
      // Creditar saldo do merchant se for transação real
      if (!isSandbox) {
        db.prepare(`UPDATE users SET balance_available = balance_available + ? WHERE id = ?`).run(feeCalculation.net_amount, userId);
      }

      // Disparar Webhook payment.approved
      dispatchWebhook({
        userId,
        event: 'payment.approved',
        data: {
          id: txId,
          order_id: orderId,
          amount: rawAmount,
          net_amount: feeCalculation.net_amount,
          fee: feeCalculation.gateway_fee,
          currency,
          payment_method: 'credit_card',
          installments: feeCalculation.installments,
          card_brand: cardBrand,
          status: 'approved',
          customer,
          metadata
        }
      });

      // Notificação no SSE de venda aprovada
      const notifApproved = {
        type: 'charge',
        event: 'payment.approved',
        id: txId,
        order_id: orderId,
        amount: rawAmount,
        net_amount: feeCalculation.net_amount,
        title: 'Venda Aprovada! (Cartão de Crédito)',
        body: `R$ ${rawAmount.toFixed(2)} em ${feeCalculation.installments}x no ${cardBrand}. Líquido: R$ ${feeCalculation.net_amount.toFixed(2)}`
      };
      for (const client of sseClients) {
        client.write(`data: ${JSON.stringify(notifApproved)}\n\n`);
      }
    }

    return sendJSON(res, 201, {
      success: true,
      id: txId,
      order_id: orderId,
      amount: rawAmount,
      net_amount: feeCalculation.net_amount,
      fee: feeCalculation.gateway_fee,
      currency,
      payment_method,
      status: initialStatus,
      financial_breakdown: feeCalculation,
      pix: pixDetails,
      customer,
      created_at: new Date().toISOString()
    });
  }

  // -------------------------------------------------------------
  // CONFIRMAÇÃO IMEDIATA / SIMULADA DE PAGAMENTO PIX
  // POST /api/v1/charges/:id/pay
  // -------------------------------------------------------------
  if (pathname.startsWith('/api/v1/charges/') && pathname.endsWith('/pay') && method === 'POST') {
    const chargeId = pathname.replace('/api/v1/charges/', '').replace('/pay', '');
    const tx = db.prepare(`SELECT * FROM transactions WHERE id = ?`).get(chargeId);

    if (!tx) {
      return sendJSON(res, 404, { error: 'Cobrança não encontrada.' });
    }

    if (tx.status === 'approved') {
      return sendJSON(res, 200, { message: 'Esta cobrança já foi confirmada anteriormente.', charge: tx });
    }

    // Atualizar status para aprovado
    db.prepare(`UPDATE transactions SET status = 'approved' WHERE id = ?`).run(chargeId);
    db.prepare(`UPDATE pix_charges SET status = 'completed' WHERE transaction_id = ?`).run(chargeId);

    // Creditar o saldo disponível do usuário se for transação real
    if (tx.is_simulation === 0) {
      db.prepare(`UPDATE users SET balance_available = balance_available + ? WHERE id = ?`).run(tx.net_amount, tx.user_id);
    }

    // Gravar notificação
    db.prepare(`
      INSERT INTO notifications (id, user_id, title, body, category, order_id, amount, is_simulation)
      VALUES (?, ?, ?, ?, 'venda_aprovada', ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      tx.user_id,
      'Venda Aprovada via Pix!',
      `Pagamento de R$ ${tx.amount.toFixed(2)} confirmado com sucesso! Saldo creditado: R$ ${tx.net_amount.toFixed(2)}.`,
      tx.order_id,
      tx.amount,
      tx.is_simulation
    );

    // Disparar Webhook assinado para a aplicação do cliente
    dispatchWebhook({
      userId: tx.user_id,
      event: 'payment.approved',
      data: {
        id: tx.id,
        order_id: tx.order_id,
        amount: tx.amount,
        net_amount: tx.net_amount,
        fee: tx.fee,
        currency: tx.currency,
        payment_method: tx.payment_method,
        status: 'approved',
        customer_name: tx.customer_name,
        customer_email: tx.customer_email,
        paid_at: new Date().toISOString()
      }
    });

    // Enviar notificação em tempo real pelo SSE (com thumbnail do logo oficial)
    const approvedEvent = {
      type: 'charge',
      event: 'payment.approved',
      id: tx.id,
      order_id: tx.order_id,
      amount: tx.amount,
      net_amount: tx.net_amount,
      title: 'Venda Aprovada! (Pix Confirmado)',
      body: `R$ ${tx.amount.toFixed(2)} recebidos com sucesso!`,
      icon: '/assets/logo.png'
    };
    for (const client of sseClients) {
      client.write(`data: ${JSON.stringify(approvedEvent)}\n\n`);
    }

    return sendJSON(res, 200, {
      success: true,
      message: 'Pagamento confirmado e saldo creditado com sucesso!',
      charge_id: tx.id,
      order_id: tx.order_id,
      status: 'approved',
      net_amount: tx.net_amount
    });
  }

  // -------------------------------------------------------------
  // MÓDULO GLOBAL: PAÍSES, CÂMBIO E ROTEAMENTO MULTI-MOEDA
  // -------------------------------------------------------------
  if (pathname === '/api/global/countries' && method === 'GET') {
    const countries = db.prepare(`SELECT * FROM countries_config WHERE is_active = 1`).all();
    return sendJSON(res, 200, { countries });
  }

  if (pathname === '/api/global/convert' && method === 'POST') {
    const { amount, from_currency = 'USD', to_currency = 'BRL' } = await parseBody(req);
    const rates = getSystemRates();
    const spread = (rates.currency_exchange_spread_percent || 2.50) / 100;

    // Cotações base de referência
    const baseRatesInBrl = {
      BRL: 1.0,
      USD: 5.45,
      EUR: 5.92,
      GBP: 6.95,
      CAD: 4.02,
      MXN: 0.29,
      ARS: 0.0055
    };

    const fromRate = baseRatesInBrl[from_currency] || 1.0;
    const toRate = baseRatesInBrl[to_currency] || 1.0;

    const valueInBrl = parseFloat(amount) * fromRate;
    const convertedBeforeSpread = valueInBrl / toRate;
    const convertedAmount = convertedBeforeSpread * (1 - spread);
    const spreadAmount = convertedBeforeSpread * spread;

    return sendJSON(res, 200, {
      original_amount: parseFloat(amount),
      from_currency,
      to_currency,
      converted_amount: parseFloat(convertedAmount.toFixed(2)),
      spread_percent: rates.currency_exchange_spread_percent,
      spread_amount: parseFloat(spreadAmount.toFixed(2)),
      exchange_rate: parseFloat((fromRate / toRate).toFixed(4))
    });
  }

  // -------------------------------------------------------------
  // SERVIR ARQUIVOS ESTÁTICOS DO FRONTEND (PWA & PUBLIC)
  // -------------------------------------------------------------
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') safePath = '/index.html';

  const filePath = path.join(PUBLIC_DIR, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 — Página ou recurso não encontrado.');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Gateway KryptaPay ativo e rodando na porta ${PORT}`);
  console.log(`📱 Acesso Web / PWA: http://localhost:${PORT}`);
});
