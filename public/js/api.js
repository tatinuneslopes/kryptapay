// CryptaPay Frontend API Client & Realtime Audio Synthesizer
const API = {
  token: localStorage.getItem('cryptapay_token') || '',

  async request(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(this.token ? { 'Authorization': `Bearer ${this.token}` } : {})
    };

    try {
      const res = await fetch(endpoint, { ...options, headers });
      if (res.status === 401 && !endpoint.includes('/api/auth/login')) {
        // Redirecionar para login caso necessário
      }
      return await res.json();
    } catch (err) {
      console.error('API Error:', err);
      return { error: 'Falha na comunicação com o servidor CryptaPay.' };
    }
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
