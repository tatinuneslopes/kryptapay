// CryptaPay Frontend API Client & Realtime Audio Synthesizer
const API = {
  get token() {
    return localStorage.getItem('kryptapay_token') || localStorage.getItem('cryptapay_token') || '';
  },

  async request(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(this.token ? { 'Authorization': `Bearer ${this.token}` } : {})
    };

    try {
      const res = await fetch(endpoint, { ...options, headers });
      if (res.status === 401 && !endpoint.includes('/api/auth/login')) {
        // Sessão expirada
      }
      return await res.json();
    } catch (err) {
      console.warn('API Error (Fallback Ativo):', err);
      return this.getFallbackData(endpoint);
    }
  },

  getFallbackData(endpoint) {
    if (endpoint.includes('/metrics')) {
      return {
        indicators: {
          faturamento_total: 0.00,
          saldo_disponivel: 0.00,
          saldo_pendente: 0.00,
          saldo_retencao: 0.00,
          vendas_aprovadas: 0,
          vendas_pendentes: 0,
          vendas_recusadas: 0,
          taxa_aprovacao: '100%',
          ticket_medio: '0.00',
          total_reembolsos: 0.00
        },
        chart: {
          labels: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'],
          data: [0, 0, 0, 0, 0, 0, 0]
        }
      };
    }
    if (endpoint.includes('/countries')) {
      return {
        countries: [
          { code: 'BR', name: 'Brasil', flag_emoji: '🇧🇷', currency: 'BRL', exchange_rate_to_brl: 1.00 },
          { code: 'US', name: 'Estados Unidos', flag_emoji: '🇺🇸', currency: 'USD', exchange_rate_to_brl: 5.45 },
          { code: 'EU', name: 'União Europeia', flag_emoji: '🇪🇺', currency: 'EUR', exchange_rate_to_brl: 5.92 },
          { code: 'GB', name: 'Reino Unido', flag_emoji: '🇬🇧', currency: 'GBP', exchange_rate_to_brl: 6.95 },
          { code: 'PT', name: 'Portugal', flag_emoji: '🇵🇹', currency: 'EUR', exchange_rate_to_brl: 5.92 }
        ]
      };
    }
    if (endpoint.includes('/rates')) {
      return {
        rates: {
          pix_percent: 1.49,
          pix_fixed: 0.00,
          pix_withdrawal_fee: 1.99,
          card_national_percent: 4.49,
          card_national_fixed: 0.39,
          card_international_percent: 5.99,
          card_international_fixed: 0.39,
          installment_rate_per_month: 1.99,
          currency_exchange_spread_percent: 2.50
        }
      };
    }
    return { success: true };
  },

  get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  },

  post(endpoint, data) {
    return this.request(endpoint, { method: 'POST', body: JSON.stringify(data) });
  }
};

// Sintetizador de Som de Notificação Realista (Silenciado na web: som nativo é tocado pelo celular do operador)
class NotificationAudio {
  static _ctx = null;
  static _audioEl = null;

  static async playCashSound() {
    // Silenciado dentro da aplicação web conforme solicitação:
    // O celular nativo já possui seu toque oficial configurado pelo usuário.
    return;
  }
}
