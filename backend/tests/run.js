const { run } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const logFile = path.join(__dirname, 'test_output.log');
const logs = [];

function log(msg) {
  logs.push(msg);
  fs.writeFileSync(logFile, logs.join('\n'), 'utf8');
}

log('⚡ INICIANDO SUÍTE COMPLETA DE TESTES DA KRYPTAPAY...');

run({ files: [path.join(__dirname, 'cryptapay.test.js')] })
  .on('test:pass', (t) => {
    log(`  ✔ PASSOU: [${t.name}]`);
  })
  .on('test:fail', (t) => {
    log(`  ✖ FALHOU: [${t.name}] -> ${JSON.stringify(t.details || {})}`);
  })
  .on('test:diagnostic', (d) => {
    log(`  ℹ ${d.message}`);
  })
  .on('test:summary', (s) => {
    log(`\n🎉 RESUMO DOS TESTES:`);
    log(`  Total: ${s.counts.total}`);
    log(`  Passaram: ${s.counts.passed}`);
    log(`  Falharam: ${s.counts.failed}`);
  });
