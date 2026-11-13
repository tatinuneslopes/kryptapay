// CryptaPay Automated Test Suite (node:test nativo)
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');

const db = require('../db');
const { hashPassword, verifyPassword, createSession, validateSession } = require('../auth');
const { generatePixCopiaECola, generateQRCodeSVG } = require('../services/pixService');
const { startSimulation, getTestDashboardMetrics, cancelSimulation } = require('../services/simulationQueue');

test('1. Autenticação e Segurança (Scrypt + Sessões)', async (t) => {
  const password = 'MinhaSenhaSegura@2026';
  const hashed = hashPassword(password);
  
  assert.ok(hashed.includes(':'), 'Hash deve conter salt e chave');
  assert.strictEqual(verifyPassword(password, hashed), true, 'Senha correta deve ser validada');
  assert.strictEqual(verifyPassword('SenhaIncorreta', hashed), false, 'Senha incorreta deve ser rejeitada');

  const user = db.prepare(`SELECT * FROM users WHERE email = ?`).get('demo@cryptapay.com');
  assert.ok(user, 'Usuário de demonstração deve existir');

  const token = createSession(user.id);
  assert.ok(token, 'Token de sessão deve ser gerado');

  const session = validateSession(token);
  assert.ok(session, 'Sessão ativa deve ser validada');
  assert.strictEqual(session.user_id, user.id, 'ID da sessão deve coincidir');
});

test('2. Isolamento Rígido: Transações Reais vs Simuladas', async (t) => {
  const userId = 'usr_test_isolation_' + crypto.randomBytes(4).toString('hex');
  
  // Criar usuário de teste
  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, balance_available)
    VALUES (?, ?, 'hash', 'Test User', 5000)
  `).run(userId, `${userId}@crypta.test`);

  // Inserir 1 transação real e 1 transação simulada
  db.prepare(`
    INSERT INTO transactions (id, order_id, user_id, amount, net_amount, fee, payment_method, status, is_simulation)
    VALUES (?, '#REAL01', ?, 100.00, 97.00, 3.00, 'pix', 'approved', 0)
  `).run(crypto.randomUUID(), userId);

  db.prepare(`
    INSERT INTO transactions (id, order_id, user_id, amount, net_amount, fee, payment_method, status, is_simulation)
    VALUES (?, '#SIM01', ?, 500.00, 485.00, 15.00, 'pix', 'approved', 1)
  `).run(crypto.randomUUID(), userId);

  // Consulta do saldo e faturamento real
  const realStats = db.prepare(`
    SELECT SUM(amount) as total FROM transactions WHERE user_id = ? AND is_simulation = 0
  `).get(userId);

  assert.strictEqual(realStats.total, 100.00, 'Faturamento real DEVE conter apenas transações reais');

  // Consulta do faturamento simulado
  const simStats = db.prepare(`
    SELECT SUM(amount) as total FROM transactions WHERE user_id = ? AND is_simulation = 1
  `).get(userId);

  assert.strictEqual(simStats.total, 500.00, 'Faturamento simulado DEVE estar 100% isolado');
});

test('3. Gerador Pix BR Code e SVG', async (t) => {
  const pixCode = generatePixCopiaECola({
    amount: 49.90,
    txId: 'TEST123456789'
  });

  assert.ok(pixCode.startsWith('000201'), 'Payload Pix deve iniciar com 000201');
  assert.ok(pixCode.includes('br.gov.bcb.pix'), 'Payload deve conter o GUI do Pix');
  assert.ok(pixCode.includes('49.90'), 'Payload deve conter o valor exato');

  const svg = generateQRCodeSVG(pixCode);
  assert.ok(svg.includes('<svg'), 'Deve retornar código SVG válido');
  assert.ok(svg.includes('</svg>'), 'Deve fechar tag SVG');
});

test('4. Motor de Simulação: Sequência Alternada e Limite (1 a 100)', async (t) => {
  const userId = 'usr_sim_test_' + crypto.randomBytes(4).toString('hex');
  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name)
    VALUES (?, ?, 'hash', 'Sim User')
  `).run(userId, `${userId}@crypta.test`);

  // Disparar simulação de 10 notificações com velocidade ultra-rápida para o teste
  const run = startSimulation({
    userId,
    count: 10,
    speed: 'custom',
    intervalSeconds: 1,
    adSpend: 150
  });

  assert.strictEqual(run.totalCount, 10, 'Total deve ser exatamente 10');
  cancelSimulation(userId);
});
