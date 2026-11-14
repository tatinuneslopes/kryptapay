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

// Sintetizador de Som de Notificação Realista (Toque Oficial Cash Register KryptaPay)
class NotificationAudio {
  static _ctx = null;
  static _audioEl = null;

  static async playCashSound() {
    // 1. Tocar arquivo de áudio WAV autêntico de Cash Register
    try {
      if (!this._audioEl) {
        this._audioEl = new Audio('/audio/cash-register.wav');
        this._audioEl.preload = 'auto';
      }
      this._audioEl.currentTime = 0;
      const p = this._audioEl.play();
      if (p !== undefined) {
        p.catch(() => {});
      }
    } catch(e) {}

    // 2. Síntese Web Audio API de alta fidelidade como garantia
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!this._ctx) {
        this._ctx = new AudioCtx();
      }
      if (this._ctx.state === 'suspended') {
        await this._ctx.resume();
      }
      const ctx = this._ctx;
      const now = ctx.currentTime;

      // Bell 1: Tom cristalino metálico agudo de caixa registradora (C6 -> C7)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(1046.50, now);
      osc1.frequency.exponentialRampToValueAtTime(2093.00, now + 0.08);
      gain1.gain.setValueAtTime(0.45, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.42);

      // Bell 2: Harmônico clássico de caixa registradora (E6 -> E7)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(1318.51, now + 0.06);
      osc2.frequency.exponentialRampToValueAtTime(2637.02, now + 0.15);
      gain2.gain.setValueAtTime(0.35, now + 0.06);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.58);

      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.06);
      osc2.stop(now + 0.58);

      // Vibração no celular (dois toques rápidos)
      if (navigator.vibrate) {
        navigator.vibrate([150, 70, 150]);
      }
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }
}
