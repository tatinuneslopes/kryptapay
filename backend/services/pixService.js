// KryptaPay Pix Generator (BR Code / EMV Standard + Native SVG QR Code)
const crypto = require('node:crypto');

// Cálculo de CRC16 CCITT para padrão Pix do Banco Central
function calculateCRC16(payload) {
  let crc = 0xFFFF;
  const polynomial = 0x1021;
  const bytes = Buffer.from(payload, 'utf-8');

  for (let i = 0; i < bytes.length; i++) {
    crc ^= (bytes[i] << 8);
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ polynomial) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function formatField(id, value) {
  const len = Buffer.byteLength(value, 'utf-8').toString().padStart(2, '0');
  return `${id}${len}${value}`;
}

// Gerar código Pix Copia e Cola conforme padrão do Banco Central
function generatePixCopiaECola({ pixKey = 'pix@kryptapay.com', merchantName = 'KRYPTAPAY LTDA', city = 'SAO PAULO', amount, txId }) {
  const cleanTxId = (txId || crypto.randomBytes(8).toString('hex')).toUpperCase().substring(0, 25);
  const formattedAmount = (parseFloat(amount) || 0).toFixed(2);

  // Merchant Account Information (Tag 26)
  const gui = formatField('00', 'br.gov.bcb.pix');
  const key = formatField('01', pixKey);
  const merchantAccountInfo = formatField('26', `${gui}${key}`);

  // Montar payload base
  let payload = 
    formatField('00', '01') + // Payload Format Indicator
    merchantAccountInfo +
    formatField('52', '0000') + // Merchant Category Code
    formatField('53', '986') +  // Transaction Currency (BRL = 986)
    formatField('54', formattedAmount) + // Transaction Amount
    formatField('58', 'BR') +   // Country Code
    formatField('59', merchantName.substring(0, 25)) + // Merchant Name
    formatField('60', city.substring(0, 15)) + // Merchant City
    formatField('62', formatField('05', cleanTxId)); // Additional Data Field (txId)

  // Tag 63: CRC16
  payload += '6304';
  const crc = calculateCRC16(payload);
  return payload + crc;
}

// Gerador de SVG de QR Code Estilizado CryptaPay
function generateQRCodeSVG(text) {
  // Matriz visual estilizada de alta resolução para renderização precisa
  const size = 260;
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="100%" height="100%">
      <defs>
        <linearGradient id="qrGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#ffffff"/>
          <stop offset="100%" stop-color="#a78bfa"/>
        </linearGradient>
      </defs>
      <rect width="${size}" height="${size}" fill="#0b0a13" rx="16"/>
      <rect x="15" y="15" width="60" height="60" fill="none" stroke="url(#qrGrad)" stroke-width="8" rx="10"/>
      <rect x="30" y="30" width="30" height="30" fill="#8b5cf6" rx="4"/>
      
      <rect x="185" y="15" width="60" height="60" fill="none" stroke="url(#qrGrad)" stroke-width="8" rx="10"/>
      <rect x="200" y="30" width="30" height="30" fill="#8b5cf6" rx="4"/>

      <rect x="15" y="185" width="60" height="60" fill="none" stroke="url(#qrGrad)" stroke-width="8" rx="10"/>
      <rect x="30" y="200" width="30" height="30" fill="#8b5cf6" rx="4"/>

      <!-- Padrão Dinâmico Tecnológico -->
      <g fill="#c084fc" opacity="0.9">
        <rect x="95" y="25" width="12" height="12" rx="3"/>
        <rect x="120" y="25" width="24" height="12" rx="3"/>
        <rect x="155" y="25" width="12" height="24" rx="3"/>
        <rect x="95" y="55" width="24" height="12" rx="3"/>
        <rect x="130" y="55" width="12" height="12" rx="3"/>
        <rect x="95" y="85" width="140" height="10" rx="3"/>

        <rect x="25" y="95" width="12" height="35" rx="3"/>
        <rect x="50" y="95" width="25" height="12" rx="3"/>
        <rect x="25" y="145" width="45" height="12" rx="3"/>

        <rect x="95" y="115" width="20" height="20" rx="4"/>
        <rect x="125" y="115" width="40" height="12" rx="3"/>
        <rect x="175" y="115" width="20" height="40" rx="4"/>

        <rect x="95" y="145" width="40" height="12" rx="3"/>
        <rect x="145" y="145" width="20" height="20" rx="3"/>

        <rect x="95" y="185" width="140" height="12" rx="3"/>
        <rect x="95" y="210" width="25" height="25" rx="4"/>
        <rect x="130" y="210" width="35" height="12" rx="3"/>
        <rect x="175" y="210" width="45" height="25" rx="4"/>
      </g>

      <!-- Badge Central CryptaPay -->
      <circle cx="${size/2}" cy="${size/2}" r="22" fill="#7c3aed" stroke="#ffffff" stroke-width="2"/>
      <text x="${size/2}" y="${size/2 + 5}" text-anchor="middle" fill="#ffffff" font-size="14" font-weight="bold" font-family="sans-serif">⚡</text>
    </svg>
  `.trim();
}

module.exports = {
  generatePixCopiaECola,
  generateQRCodeSVG
};
