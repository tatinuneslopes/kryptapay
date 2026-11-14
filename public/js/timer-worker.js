// KryptaPay Background Simulation Timer Worker
// Permite que o timer de disparos de notificações continue rodando com precisão
// mesmo em abas em segundo plano no celular e computador.

let intervalId = null;

self.onmessage = function(e) {
  const data = e.data || {};
  if (data.action === 'start') {
    if (intervalId) clearInterval(intervalId);
    const intervalMs = Math.max(parseInt(data.intervalMs, 10) || 5000, 1000);
    
    intervalId = setInterval(() => {
      self.postMessage({ type: 'TICK', timestamp: Date.now() });
    }, intervalMs);

    self.postMessage({ type: 'STARTED', intervalMs });
  } else if (data.action === 'stop') {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    self.postMessage({ type: 'STOPPED' });
  }
};
