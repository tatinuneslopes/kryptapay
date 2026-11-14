// KryptaPay Rates & Intelligent Routing Financial Engine
const db = require('../db');

/**
 * Retorna as taxas atuais configuradas no sistema
 */
function getSystemRates() {
  const rates = db.prepare(`SELECT * FROM system_rates WHERE id = 'default'`).get();
  if (rates) return rates;

  return {
    pix_percent: 1.49,
    pix_fixed: 0.00,
    pix_withdrawal_fee: 1.99,
    card_national_percent: 4.49,
    card_national_fixed: 0.39,
    card_international_percent: 5.99,
    card_international_fixed: 0.39,
    installment_rate_per_month: 1.99,
    currency_exchange_spread_percent: 2.50,
    processor_cost_pix_percent: 0.70,
    processor_cost_card_percent: 2.50,
    processor_cost_card_fixed: 0.20,
    processor_cost_withdrawal: 0.80
  };
}

/**
 * Atualiza as taxas oficiais do sistema (Acesso restrito ao Admin)
 */
function updateSystemRates(newRates) {
  const current = getSystemRates();
  const updated = { ...current, ...newRates, updated_at: new Date().toISOString() };

  db.prepare(`
    UPDATE system_rates SET
      pix_percent = ?,
      pix_fixed = ?,
      pix_withdrawal_fee = ?,
      card_national_percent = ?,
      card_national_fixed = ?,
      card_international_percent = ?,
      card_international_fixed = ?,
      installment_rate_per_month = ?,
      currency_exchange_spread_percent = ?,
      processor_cost_pix_percent = ?,
      processor_cost_card_percent = ?,
      processor_cost_card_fixed = ?,
      processor_cost_withdrawal = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = 'default'
  `).run(
    parseFloat(updated.pix_percent),
    parseFloat(updated.pix_fixed),
    parseFloat(updated.pix_withdrawal_fee),
    parseFloat(updated.card_national_percent),
    parseFloat(updated.card_national_fixed),
    parseFloat(updated.card_international_percent),
    parseFloat(updated.card_international_fixed),
    parseFloat(updated.installment_rate_per_month),
    parseFloat(updated.currency_exchange_spread_percent),
    parseFloat(updated.processor_cost_pix_percent),
    parseFloat(updated.processor_cost_card_percent),
    parseFloat(updated.processor_cost_card_fixed),
    parseFloat(updated.processor_cost_withdrawal)
  );

  return getSystemRates();
}

/**
 * Calcula taxas, custos do processador e lucro líquido
 * @param {Object} params
 * @param {number} params.amount - Valor bruto da transação
 * @param {string} params.paymentMethod - 'pix', 'credit_card', 'bank_slip'
 * @param {number} [params.installments=1] - Quantidade de parcelas
 * @param {string} [params.buyerCountry='BR'] - País de origem do comprador
 * @param {string} [params.sellerCountry='BR'] - País do vendedor
 * @param {string} [params.currency='BRL'] - Moeda da transação
 */
function calculateTransactionFees({
  amount,
  paymentMethod,
  installments = 1,
  buyerCountry = 'BR',
  sellerCountry = 'BR',
  currency = 'BRL'
}) {
  const rates = getSystemRates();
  const amt = parseFloat(amount) || 0;
  const isInternational = buyerCountry !== 'BR' || sellerCountry !== 'BR' || currency !== 'BRL';

  let gatewayFee = 0;
  let processorCost = 0;
  let rateDescription = '';

  if (paymentMethod === 'pix') {
    // Pix oficial: 1.49% + R$ 0.00
    gatewayFee = (amt * (rates.pix_percent / 100)) + rates.pix_fixed;
    processorCost = (amt * (rates.processor_cost_pix_percent / 100));
    rateDescription = `Pix Aprovado (${rates.pix_percent}%)`;
  } else if (paymentMethod === 'credit_card') {
    if (isInternational) {
      // Cartão Internacional: 5.99% + R$ 0.39 fixo
      let percent = rates.card_international_percent;
      if (installments > 1) {
        percent += (installments - 1) * rates.installment_rate_per_month;
      }
      gatewayFee = (amt * (percent / 100)) + rates.card_international_fixed;
      processorCost = (amt * (rates.processor_cost_card_percent / 100)) + rates.processor_cost_card_fixed;
      rateDescription = `Cartão Internacional ${installments}x (${percent.toFixed(2)}% + R$ ${rates.card_international_fixed.toFixed(2)})`;
    } else {
      // Cartão Nacional: 4.49% + R$ 0.39 fixo + acréscimo de parcelas
      let percent = rates.card_national_percent;
      if (installments > 1) {
        percent += (installments - 1) * rates.installment_rate_per_month;
      }
      gatewayFee = (amt * (percent / 100)) + rates.card_national_fixed;
      processorCost = (amt * (rates.processor_cost_card_percent / 100)) + rates.processor_cost_card_fixed;
      rateDescription = `Cartão Nacional ${installments}x (${percent.toFixed(2)}% + R$ ${rates.card_national_fixed.toFixed(2)})`;
    }
  } else {
    // Boleto ou outros métodos
    gatewayFee = (amt * 0.0299) + 1.00;
    processorCost = 1.00;
    rateDescription = 'Boleto Bancário (2.99% + R$ 1,00)';
  }

  // Garantir limites numéricos
  gatewayFee = Math.max(0, parseFloat(gatewayFee.toFixed(2)));
  processorCost = Math.max(0, parseFloat(processorCost.toFixed(2)));
  const netAmount = Math.max(0, parseFloat((amt - gatewayFee).toFixed(2)));
  const gatewayNetProfit = Math.max(0, parseFloat((gatewayFee - processorCost).toFixed(2)));

  // Determinar Rota Inteligente (Cenários 1 a 4)
  let routeScenario = 1;
  let scenarioLabel = 'Brasil -> Brasil (Pix / Cartão Nacional)';
  if (buyerCountry === 'BR' && sellerCountry === 'BR') {
    routeScenario = 1;
    scenarioLabel = 'Brasil -> Brasil (Pix Instantâneo / Cartão Nacional)';
  } else if (buyerCountry === 'BR' && sellerCountry !== 'BR') {
    routeScenario = 2;
    scenarioLabel = 'Brasil -> Global (Cartão Internacional + Câmbio FX)';
  } else if (buyerCountry !== 'BR' && sellerCountry === 'BR') {
    routeScenario = 3;
    scenarioLabel = 'Estrangeiro -> Brasil (Cartão Global processado com liquidação em BRL)';
  } else {
    routeScenario = 4;
    scenarioLabel = 'Estrangeiro -> Global (Cross-Border Multi-Moeda USD/EUR direto)';
  }

  return {
    gross_amount: amt,
    gateway_fee: gatewayFee,
    processor_cost: processorCost,
    gateway_net_profit: gatewayNetProfit,
    net_amount: netAmount,
    rate_description: rateDescription,
    route_scenario: routeScenario,
    scenario_label: scenarioLabel,
    currency,
    installments
  };
}

module.exports = {
  getSystemRates,
  updateSystemRates,
  calculateTransactionFees
};
