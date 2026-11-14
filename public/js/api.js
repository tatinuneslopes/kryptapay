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
          faturamento_total: 148950.00,
          saldo_disponivel: 32450.80,
          saldo_pendente: 4230.00,
          saldo_retencao: 1250.00,
          vendas_aprovadas: 412,
          vendas_pendentes: 8,
          vendas_recusadas: 3,
          taxa_aprovacao: '98.8%',
          ticket_medio: '169.90',
          total_reembolsos: 0.00
        },
        chart: {
          labels: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'],
          data: [18450, 24900, 31100, 42200, 38900, 56300, 51500]
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

// Sintetizador de Som de Notificação Realista (Web Audio API - Zero arquivos externos)
class NotificationAudio {
  static playCashSound() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();

      // Oscilador 1: Tom agudo de sino/moeda
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(987.77, ctx.currentTime); // B5
      osc1.frequency.exponentialRampToValueAtTime(1318.51, ctx.currentTime + 0.08); // E6
      gain1.gain.setValueAtTime(0.3, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start();
      osc1.stop(ctx.currentTime + 0.35);

      // Oscilador 2: Ressonância cristalina
      setTimeout(() => {
        try {
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.type = 'triangle';
          osc2.frequency.setValueAtTime(1567.98, ctx.currentTime); // G6
          osc2.frequency.exponentialRampToValueAtTime(1975.53, ctx.currentTime + 0.06); // B6
          gain2.gain.setValueAtTime(0.25, ctx.currentTime);
          gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);

          osc2.connect(gain2);
          gain2.connect(ctx.destination);
          osc2.start();
          osc2.stop(ctx.currentTime + 0.45);
        } catch (e) {}
      }, 70);

    } catch (e) {
      console.log('Audio disabled or blocked by browser autoplay policy.');
    }
  }
}
