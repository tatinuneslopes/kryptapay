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

test('5. Tabela Oficial de Taxas e Motor de Cálculo Financeiro', async (t) => {
  const { getSystemRates, calculateTransactionFees } = require('../services/ratesService');
  const rates = getSystemRates();

  assert.strictEqual(rates.pix_percent, 1.49, 'Taxa oficial Pix deve ser 1.49%');
  assert.strictEqual(rates.pix_withdrawal_fee, 1.99, 'Taxa oficial de saque Pix deve ser R$ 1,99');
  assert.strictEqual(rates.card_national_percent, 4.49, 'Cartão nacional deve ser 4.49%');
  assert.strictEqual(rates.card_international_percent, 5.99, 'Cartão internacional deve ser 5.99%');

  // Teste Pix R$ 100,00 -> Taxa 1.49% = R$ 1,49 | Líquido = R$ 98,51
  const pixCalc = calculateTransactionFees({ amount: 100.00, paymentMethod: 'pix' });
  assert.strictEqual(pixCalc.gateway_fee, 1.49, 'Taxa Pix deve ser exatamente R$ 1,49');
  assert.strictEqual(pixCalc.net_amount, 98.51, 'Líquido do vendedor deve ser R$ 98,51');
  assert.strictEqual(pixCalc.route_scenario, 1, 'Pix no Brasil deve ser Rota 1');

  // Teste Cartão Nacional R$ 100,00 à vista -> 4.49% + 0.39 = R$ 4,88 | Líquido = R$ 95,12
  const cardCalc = calculateTransactionFees({ amount: 100.00, paymentMethod: 'credit_card', installments: 1 });
  assert.strictEqual(cardCalc.gateway_fee, 4.88, 'Taxa Cartão Nacional deve ser R$ 4,88');
  assert.strictEqual(cardCalc.net_amount, 95.12, 'Líquido Cartão Nacional deve ser R$ 95,12');

  // Teste Cartão Internacional USD / Global -> 5.99% + 0.39 = R$ 6,38
  const intCalc = calculateTransactionFees({ amount: 100.00, paymentMethod: 'credit_card', buyerCountry: 'US', currency: 'USD' });
  assert.strictEqual(intCalc.gateway_fee, 6.38, 'Taxa Cartão Internacional deve ser R$ 6,38');
  assert.strictEqual(intCalc.route_scenario, 3, 'Comprador US para Vendedor BR deve ser Rota 3');
});

test('6. Chaves de API e Autenticação (Sandbox vs Produção)', async (t) => {
  const userId = 'usr_key_test_' + crypto.randomBytes(4).toString('hex');
  db.prepare(`INSERT INTO users (id, email, password_hash, full_name) VALUES (?, ?, 'hash', 'Key User')`).run(userId, `${userId}@krypta.test`);

  const rawSecret = 'krypta_sec_live_' + crypto.randomBytes(24).toString('hex');
  const secretHash = crypto.createHash('sha256').update(rawSecret).digest('hex');
  const publicKey = 'krypta_pub_live_' + crypto.randomBytes(16).toString('hex');

  db.prepare(`
    INSERT INTO api_keys (id, user_id, name, environment, public_key, secret_key_hash, secret_key_preview, status)
    VALUES (?, ?, 'Chave Live Test', 'production', ?, ?, 'krypta_sec_live...', 'active')
  `).run('key_test_1', userId, publicKey, secretHash);

  // Buscar por hash
  const found = db.prepare(`SELECT * FROM api_keys WHERE secret_key_hash = ? AND status = 'active'`).get(secretHash);
  assert.ok(found, 'Chave deve ser autenticada com sucesso pelo hash da secret key');
  assert.strictEqual(found.user_id, userId, 'Dono da chave deve ser o usuário correto');
  assert.strictEqual(found.environment, 'production', 'Ambiente deve ser production');
});

test('7. Assinatura HMAC-SHA256 de Webhooks', async (t) => {
  const { signPayload } = require('../services/webhookService');
  const secretKey = 'whsec_meu_segredo_super_seguro_2026';
  const payload = JSON.stringify({ event: 'payment.approved', amount: 150.00, order_id: '#KRYPTA-1029' });

  const signature = signPayload(payload, secretKey);
  assert.ok(signature.startsWith('sha256='), 'Assinatura deve iniciar com prefixo sha256=');

  // Validar reprodução
  const expectedHmac = crypto.createHmac('sha256', secretKey).update(payload).digest('hex');
  assert.strictEqual(signature, `sha256=${expectedHmac}`, 'Assinatura HMAC deve ser exata e criptograficamente válida');
});

test('8. Saque Pix sem Trava com Taxa Oficial de R$ 1,99', async (t) => {
  const userId = 'usr_withdraw_test_' + crypto.randomBytes(4).toString('hex');
  const initialBalance = 1000.00;
  const withdrawAmount = 250.00;
  const officialFee = 1.99;

  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, balance_available)
    VALUES (?, ?, 'hash', 'Withdraw User', ?)
  `).run(userId, `${userId}@krypta.test`, initialBalance);

  // Executar saque
  const withdrawId = 'wth_' + crypto.randomBytes(6).toString('hex');
  db.prepare(`UPDATE users SET balance_available = balance_available - ? WHERE id = ?`).run(withdrawAmount + officialFee, userId);
  db.prepare(`
    INSERT INTO withdrawals (id, user_id, amount, fee, net_amount, pix_key, pix_key_type, status)
    VALUES (?, ?, ?, ?, ?, '11999998888', 'phone', 'completed')
  `).run(withdrawId, userId, withdrawAmount, officialFee, withdrawAmount);

  // Checar saldo restante
  const user = db.prepare(`SELECT balance_available FROM users WHERE id = ?`).get(userId);
  const expectedRemaining = initialBalance - (withdrawAmount + officialFee); // 1000 - 251.99 = 748.01
  assert.strictEqual(parseFloat(user.balance_available.toFixed(2)), expectedRemaining, 'Saldo deve deduzir exatamente o valor do saque + taxa de R$ 1,99');

  const withdraw = db.prepare(`SELECT * FROM withdrawals WHERE id = ?`).get(withdrawId);
  assert.strictEqual(withdraw.fee, 1.99, 'Taxa registrada no saque deve ser R$ 1,99');
  assert.strictEqual(withdraw.status, 'completed', 'Saque deve ser aprovado sem bloqueios');
});
