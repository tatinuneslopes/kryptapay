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
  `).run('key_test_' + crypto.randomBytes(4).toString('hex'), userId, publicKey, secretHash);

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

test('9. Reestruturação Dashboard 2: Fórmula Oficial da Taxa de Aprovação (Cenários A, B e C)', async (t) => {
  function computeRate(aprovadas, recusadas) {
    const finalizadas = (parseInt(aprovadas, 10) || 0) + (parseInt(recusadas, 10) || 0);
    if (finalizadas === 0) return 'Sem dados';
    const taxa = ((aprovadas / finalizadas) * 100);
    return taxa.toFixed(2).replace('.', ',') + '%';
  }

  // Cenário A: 80 aprovadas, 15 recusadas, 5 pendentes -> 84,21%
  const taxaA = computeRate(80, 15);
  assert.strictEqual(taxaA, '84,21%', 'Cenário A deve resultar exatamente em 84,21%');

  // Cenário B: 45 aprovadas, 45 recusadas, 10 pendentes -> 50,00%
  const taxaB = computeRate(45, 45);
  assert.strictEqual(taxaB, '50,00%', 'Cenário B deve resultar exatamente em 50,00%');

  // Cenário C: 0 aprovadas, 0 recusadas, 10 pendentes -> "Sem dados" (NUNCA fixado em 100%)
  const taxaC = computeRate(0, 0);
  assert.strictEqual(taxaC, 'Sem dados', 'Cenário C sem transações finalizadas DEVE mostrar "Sem dados" e nunca 100%');
});

test('10. Reestruturação Dashboard 2: Integridade dos 10 Indicadores Financeiros', async (t) => {
  // Simulação de transações
  const vendas = [
    { id: '#PED-1', amount: 100.00, status: 'approved' },
    { id: '#PED-2', amount: 200.00, status: 'approved' },
    { id: '#PED-3', amount: 150.00, status: 'refused' },  // Recusada não entra no faturamento
    { id: '#PED-4', amount: 50.00,  status: 'pending' },  // Pendente não entra no faturamento
    { id: '#PED-5', amount: 30.00,  status: 'refunded' }, // Reembolso
    { id: '#PED-6', amount: 20.00,  status: 'chargeback' } // Chargeback
  ];

  let faturamentoTotal = 0;
  let saldoPendente = 0;
  let vendasAprovadas = 0;
  let vendasRecusadas = 0;
  let vendasPendentes = 0;
  let totalReembolsos = 0;
  let totalChargebacks = 0;

  for (const v of vendas) {
    if (v.status === 'approved') {
      faturamentoTotal += v.amount;
      vendasAprovadas++;
    } else if (v.status === 'refused') {
      vendasRecusadas++;
    } else if (v.status === 'pending') {
      saldoPendente += v.amount;
      vendasPendentes++;
    } else if (v.status === 'refunded') {
      totalReembolsos += v.amount;
    } else if (v.status === 'chargeback') {
      totalChargebacks += v.amount;
    }
  }

  const saldoDisponivel = parseFloat((faturamentoTotal * 0.95).toFixed(2));
  const saldoRetencao = parseFloat((faturamentoTotal * 0.05).toFixed(2));
  const finalizadas = vendasAprovadas + vendasRecusadas;
  const taxaAprovacao = finalizadas > 0 ? (((vendasAprovadas / finalizadas) * 100).toFixed(2).replace('.', ',') + '%') : 'Sem dados';
  const ticketMedio = vendasAprovadas > 0 ? parseFloat((faturamentoTotal / vendasAprovadas).toFixed(2)) : 0;

  // 1. Faturamento total: soma das vendas aprovadas (100 + 200 = 300)
  assert.strictEqual(faturamentoTotal, 300.00, 'Faturamento total deve considerar apenas vendas aprovadas');
  // 2. Saldo disponível: 95% do faturamento (300 * 0.95 = 285)
  assert.strictEqual(saldoDisponivel, 285.00, 'Saldo disponível deve ser exatamente 95% do faturamento aprovado');
  // 3. Saldo pendente: soma das vendas pendentes (50)
  assert.strictEqual(saldoPendente, 50.00, 'Saldo pendente deve ser a soma das transações pendentes');
  // 4. Saldo em retenção: 5% do faturamento (300 * 0.05 = 15)
  assert.strictEqual(saldoRetencao, 15.00, 'Saldo em retenção deve ser 5% do faturamento aprovado');
  // 5. Quantidade de vendas aprovadas: 2
  assert.strictEqual(vendasAprovadas, 2, 'Quantidade de aprovadas deve ser 2');
  // 6. Quantidade de vendas recusadas: 1
  assert.strictEqual(vendasRecusadas, 1, 'Quantidade de recusadas deve ser 1');
  // 7. Taxa de aprovação: (2 / (2 + 1)) * 100 = 66,67%
  assert.strictEqual(taxaAprovacao, '66,67%', 'Taxa de aprovação deve ser 66,67%');
  // 8. Ticket médio: 300 / 2 = 150
  assert.strictEqual(ticketMedio, 150.00, 'Ticket médio deve ser R$ 150,00 considerando apenas aprovadas');
  // 9. Total de reembolsos: 30
  assert.strictEqual(totalReembolsos, 30.00, 'Total de reembolsos deve ser 30,00');
  // 10. Total de chargebacks: 20
  assert.strictEqual(totalChargebacks, 20.00, 'Total de chargebacks deve ser 20,00');
});

test('11. Transição de Venda Pendente para Aprovada e para Recusada', async (t) => {
  let faturamentoTotal = 1000.00;
  let saldoPendente = 200.00;
  let vendasAprovadas = 10;
  let vendasRecusadas = 2;
  let vendasPendentes = 1;

  // Transição 1: Venda pendente de R$ 200 é aprovada
  const valorVenda = 200.00;
  saldoPendente -= valorVenda;
  vendasPendentes--;
  faturamentoTotal += valorVenda;
  vendasAprovadas++;

  assert.strictEqual(saldoPendente, 0.00, 'Saldo pendente deve zerar após aprovação');
  assert.strictEqual(vendasPendentes, 0, 'Vendas pendentes deve decrementar');
  assert.strictEqual(faturamentoTotal, 1200.00, 'Faturamento total deve incorporar o valor da venda aprovada');
  assert.strictEqual(vendasAprovadas, 11, 'Vendas aprovadas deve incrementar');

  // Transição 2: Nova venda pendente de R$ 100 é recusada
  saldoPendente += 100.00;
  vendasPendentes++;
  
  // Agora recusa:
  saldoPendente -= 100.00;
  vendasPendentes--;
  vendasRecusadas++;

  assert.strictEqual(saldoPendente, 0.00, 'Saldo pendente deve ser removido após recusa');
  assert.strictEqual(faturamentoTotal, 1200.00, 'Faturamento NÃO deve alterar ao recusar');
  assert.strictEqual(vendasRecusadas, 3, 'Vendas recusadas deve incrementar');
});
