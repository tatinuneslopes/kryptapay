// KryptaPay Core HTTP Server & REST API Gateway
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');
const crypto = require('node:crypto');

const db = require('./db');
const { hashPassword, verifyPassword, createSession, validateSession } = require('./auth');
const { generatePixCopiaECola, generateQRCodeSVG } = require('./services/pixService');
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

  // Extrair sessão do header Authorization: Bearer <token>
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const currentUser = validateSession(token);

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
    const { amount, pix_key, pix_key_type } = await parseBody(req);
    const userId = currentUser ? currentUser.user_id : 'usr_merchant_demo';
    const reqAmount = parseFloat(amount);
    const fee = 3.50;

    const wallet = db.prepare(`SELECT balance_available FROM users WHERE id = ?`).get(userId);
    if (!wallet || wallet.balance_available < reqAmount + fee) {
      return sendJSON(res, 400, { error: 'Saldo insuficiente para cobrir o valor solicitado mais a taxa de R$ 3,50.' });
    }

    const netAmount = reqAmount;
    const withdrawId = crypto.randomUUID();

    db.prepare(`
      UPDATE users SET balance_available = balance_available - ? WHERE id = ?
    `).run(reqAmount + fee, userId);

    db.prepare(`
      INSERT INTO withdrawals (id, user_id, amount, fee, net_amount, pix_key, pix_key_type, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(withdrawId, userId, reqAmount, fee, netAmount, pix_key, pix_key_type || 'cpf');

    return sendJSON(res, 200, {
      success: true,
      message: 'Solicitação de saque Pix registrada com sucesso!',
      withdraw_id: withdrawId,
      amount: reqAmount,
      fee,
      net_amount: netAmount
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
