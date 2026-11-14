// KryptaPay Webhook & Event Dispatcher Engine
const crypto = require('node:crypto');
const http = require('node:http');
const https = require('node:https');
const url = require('node:url');
const db = require('../db');

/**
 * Assina o payload do webhook com HMAC-SHA256
 */
function signPayload(payloadString, secretKey) {
  const hmac = crypto.createHmac('sha256', secretKey);
  hmac.update(payloadString, 'utf8');
  return `sha256=${hmac.digest('hex')}`;
}

/**
 * Envia uma requisição HTTP/HTTPS para o endpoint do cliente com assinatura HMAC
 */
function sendHttpRequest(targetUrl, payloadString, signature) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    try {
      const parsed = url.parse(targetUrl);
      const isHttps = parsed.protocol === 'https:';
      const client = isHttps ? https : http;

      const postData = payloadString;
      const options = {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.path || '/',
        method: 'POST',
        timeout: 8000,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'User-Agent': 'KryptaPay-Webhook-Engine/2.0',
          'X-Krypta-Signature': signature,
          'X-Krypta-Delivery': crypto.randomUUID()
        }
      };

      const req = client.request(options, (res) => {
        let respData = '';
        res.on('data', chunk => { respData += chunk; });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            responseBody: respData.substring(0, 500),
            responseTimeMs: Date.now() - startTime,
            success: res.statusCode >= 200 && res.statusCode < 300
          });
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          statusCode: 408,
          responseBody: 'Webhook Timeout (> 8000ms)',
          responseTimeMs: Date.now() - startTime,
          success: false
        });
      });

      req.on('error', (err) => {
        resolve({
          statusCode: 0,
          responseBody: `Erro de rede: ${err.message}`,
          responseTimeMs: Date.now() - startTime,
          success: false
        });
      });

      req.write(postData);
      req.end();
    } catch (err) {
      resolve({
        statusCode: 0,
        responseBody: `URL Inválida: ${err.message}`,
        responseTimeMs: Date.now() - startTime,
        success: false
      });
    }
  });
}

/**
 * Dispara webhooks configurados para um usuário e evento específico
 */
async function dispatchWebhook({ userId, event, data }) {
  try {
    const hooks = db.prepare(`
      SELECT * FROM webhooks 
      WHERE user_id = ? AND status = 'active'
    `).all(userId);

    for (const hook of hooks) {
      // Checar se o webhook escuta este evento ou 'all'
      if (hook.events !== 'all') {
        const allowed = hook.events.split(',').map(e => e.trim());
        if (!allowed.includes(event)) continue;
      }

      const payload = {
        event,
        timestamp: new Date().toISOString(),
        delivery_id: crypto.randomUUID(),
        data
      };

      const payloadString = JSON.stringify(payload);
      const signature = signPayload(payloadString, hook.secret_key || 'krypta_secret_default');

      // Executa o envio
      const result = await sendHttpRequest(hook.url, payloadString, signature);

      // Registra o log no banco de dados
      db.prepare(`
        INSERT INTO webhook_deliveries (
          id, webhook_id, user_id, event, url, signature, payload, status_code, response_body, response_time_ms, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        crypto.randomUUID(),
        hook.id,
        userId,
        event,
        hook.url,
        signature,
        payloadString,
        result.statusCode,
        result.responseBody,
        result.responseTimeMs,
        result.success ? 'success' : 'failed'
      );
    }
  } catch (err) {
    console.error('Erro ao despachar webhook:', err);
  }
}

/**
 * Disparo pontual de teste interativo para validar endpoint
 */
async function sendTestWebhook({ userId, targetUrl, secretKey, event = 'payment.approved' }) {
  const payload = {
    event,
    test: true,
    timestamp: new Date().toISOString(),
    delivery_id: 'test_' + crypto.randomUUID(),
    data: {
      id: 'tx_test_' + crypto.randomBytes(6).toString('hex'),
      order_id: '#KRYPTA-TEST-999',
      amount: 149.90,
      net_amount: 147.27,
      currency: 'BRL',
      payment_method: 'pix',
      status: 'approved',
      customer: {
        name: 'Cliente Teste KryptaPay',
        email: 'cliente.teste@kryptapay.com',
        phone: '+55 11 98888-7777'
      },
      metadata: {
        gateway: 'KryptaPay Core Engine v2.0',
        environment: 'sandbox'
      }
    }
  };

  const payloadString = JSON.stringify(payload);
  const signature = signPayload(payloadString, secretKey);
  const result = await sendHttpRequest(targetUrl, payloadString, signature);

  const deliveryId = crypto.randomUUID();
  try {
    db.prepare(`
      INSERT INTO webhook_deliveries (
        id, webhook_id, user_id, event, url, signature, payload, status_code, response_body, response_time_ms, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      deliveryId,
      'test_hook',
      userId,
      event,
      targetUrl,
      signature,
      payloadString,
      result.statusCode,
      result.responseBody,
      result.responseTimeMs,
      result.success ? 'success' : 'failed'
    );
  } catch (_) {}

  return {
    deliveryId,
    event,
    targetUrl,
    signature,
    payload,
    ...result
  };
}

module.exports = {
  signPayload,
  dispatchWebhook,
  sendTestWebhook
};
