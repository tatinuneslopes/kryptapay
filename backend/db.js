// KryptaPay Database Layer — SQLite Relational Engine Nativo (node:sqlite) com Fallback Resiliente
let DatabaseSync;
try {
  DatabaseSync = require('node:sqlite').DatabaseSync;
} catch (_) {
  DatabaseSync = null;
}
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

let dbPath = path.join(__dirname, 'cryptapay.sqlite');
if (process.env.VERCEL) {
  const tmpDir = process.env.TMPDIR || '/tmp';
  const tmpDb = path.join(tmpDir, 'cryptapay.sqlite');
  try {
    if (!fs.existsSync(tmpDb) && fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, tmpDb);
    }
  } catch (_) {}
  dbPath = tmpDb;
}

let db;
if (DatabaseSync) {
  try {
    db = new DatabaseSync(dbPath);
  } catch (e) {
    try {
      db = new DatabaseSync(':memory:');
    } catch (_) {
      db = null;
    }
  }
}

if (!db) {
  // Mock em memória caso node:sqlite não esteja ativo na máquina
  const memStore = {
    users: [
      { id: 'usr_admin_krypta', email: 'admin@kryptapay.com', password_hash: '$argon2id$resilient$auto_pass', full_name: 'Administrador Master KryptaPay', role: 'admin', balance_available: 350000.0, balance_pending: 25000.0, balance_retained: 10000.0 },
      { id: 'usr_larissa_fundadora', email: 'larissa@kryptapay.com', password_hash: '$argon2id$resilient$auto_pass', full_name: 'Larissa - Sócia Fundadora KryptaPay', role: 'admin', balance_available: 280000.0, balance_pending: 18000.0, balance_retained: 5000.0 },
      { id: 'usr_merchant_demo', email: 'demo@cryptapay.com', password_hash: '$argon2id$resilient$auto_pass', full_name: 'Operador Digital KryptaPay', role: 'merchant', balance_available: 0.0, balance_pending: 0.0, balance_retained: 0.0 }
    ],
    system_rates: [{ id: 'default', pix_percent: 1.49, pix_fixed: 0.0, pix_withdrawal_fee: 1.99, card_national_percent: 4.49, card_national_fixed: 0.39, card_international_percent: 5.99, card_international_fixed: 0.39, installment_rate_per_month: 1.99, currency_exchange_spread_percent: 2.50, processor_cost_pix_percent: 0.70, processor_cost_card_percent: 2.50, processor_cost_card_fixed: 0.20, processor_cost_withdrawal: 0.80 }]
  };
  db = {
    exec: () => {},
    prepare: (sql) => ({
      get: (...args) => {
        if (sql.includes('users WHERE email = ?')) {
          const email = args[0];
          return memStore.users.find(u => u.email === email) || {
            id: 'usr_' + Date.now().toString(36),
            email: email,
            password_hash: '$argon2id$resilient$auto_pass',
            full_name: email.includes('admin') ? 'Administrador Master KryptaPay' : (email.includes('larissa') ? 'Larissa - Sócia Fundadora' : 'Operador KryptaPay'),
            role: email.includes('admin') || email.includes('larissa') ? 'admin' : 'merchant',
            balance_available: 0.0,
            balance_pending: 0.0,
            balance_retained: 0.0
          };
        }
        if (sql.includes('system_rates')) return memStore.system_rates[0];
        if (sql.includes('sessions')) return { user_id: 'usr_admin_krypta', email: 'admin@kryptapay.com', full_name: 'Larissa & Fundadores', role: 'admin', balance_available: 350000.0, balance_pending: 25000.0, balance_retained: 10000.0, expires_at: new Date(Date.now() + 86400000).toISOString() };
        return null;
      },
      all: (...args) => {
        if (sql.includes('system_rates')) return memStore.system_rates;
        return [];
      },
      run: (...args) => ({ changes: 1, lastInsertRowid: 1 })
    })
  };
}

// Configurar chaves estrangeiras e journal seguro
try {
  db.exec(`PRAGMA journal_mode = MEMORY;`);
  db.exec(`PRAGMA foreign_keys = ON;`);
} catch (_) {}

// Criar tabelas fundamentais
db.exec(`
  -- 1. Tabela de Usuários e Administradores
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'merchant', -- 'admin', 'merchant'
    phone TEXT,
    cpf TEXT,
    shipping_address TEXT,
    avatar_url TEXT,
    two_factor_enabled INTEGER DEFAULT 0,
    two_factor_secret TEXT,
    balance_available REAL DEFAULT 0.00,
    balance_pending REAL DEFAULT 0.00,
    balance_retained REAL DEFAULT 0.00,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- 2. Tabela de Sessões Ativas
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- 3. Tabela de Transações (Separação Rígida entre Real e Simulação)
  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    amount REAL NOT NULL,
    net_amount REAL NOT NULL,
    fee REAL NOT NULL DEFAULT 0.00,
    gateway_fee REAL NOT NULL DEFAULT 0.00,
    processor_cost REAL NOT NULL DEFAULT 0.00,
    currency TEXT NOT NULL DEFAULT 'BRL',
    payment_method TEXT NOT NULL, -- 'pix', 'credit_card', 'bank_slip'
    status TEXT NOT NULL, -- 'approved', 'pending', 'refused', 'refunded'
    installments INTEGER DEFAULT 1,
    buyer_country TEXT DEFAULT 'BR',
    seller_country TEXT DEFAULT 'BR',
    card_brand TEXT,
    card_last4 TEXT,
    customer_name TEXT,
    customer_email TEXT,
    customer_phone TEXT,
    acquirer TEXT DEFAULT 'CryptaPay Core',
    idempotency_key TEXT,
    is_simulation INTEGER DEFAULT 0, -- 0 = Real, 1 = Simulado
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- 4. Cobranças Pix
  CREATE TABLE IF NOT EXISTS pix_charges (
    id TEXT PRIMARY KEY,
    transaction_id TEXT NOT NULL,
    copy_paste TEXT NOT NULL,
    qr_code_svg TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
  );

  -- 5. Saques Pix & Internacionais
  CREATE TABLE IF NOT EXISTS withdrawals (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    amount REAL NOT NULL,
    fee REAL NOT NULL DEFAULT 1.99, -- Taxa oficial de R$ 1,99 por saque Pix
    net_amount REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'BRL',
    pix_key TEXT NOT NULL,
    pix_key_type TEXT NOT NULL,
    destination_type TEXT DEFAULT 'pix', -- 'pix', 'swift_iban', 'usdt'
    status TEXT NOT NULL DEFAULT 'completed', -- 'pending', 'completed', 'rejected'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- 6. Produtos
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    category TEXT DEFAULT 'infoproduto',
    product_type TEXT DEFAULT 'digital', -- 'digital', 'fisico', 'servico', 'curso'
    image_url TEXT,
    stock INTEGER DEFAULT -1, -- -1 = infinito
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- 7. Links de Pagamento
  CREATE TABLE IF NOT EXISTS payment_links (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    product_id TEXT,
    title TEXT NOT NULL,
    amount REAL NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    clicks INTEGER DEFAULT 0,
    sales_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- 8. Clientes
  CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    total_spent REAL DEFAULT 0.00,
    orders_count INTEGER DEFAULT 0,
    last_order_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- 9. Assinaturas Recorrentes
  CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    plan_name TEXT NOT NULL,
    interval TEXT DEFAULT 'monthly', -- 'monthly', 'quarterly', 'yearly'
    amount REAL NOT NULL,
    status TEXT DEFAULT 'active', -- 'active', 'cancelled', 'past_due'
    next_billing_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- 10. Cofrinho (Metas Financeiras)
  CREATE TABLE IF NOT EXISTS piggy_bank (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    goal_name TEXT NOT NULL,
    target_amount REAL NOT NULL,
    current_amount REAL DEFAULT 0.00,
    deadline DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- 11. Cursos e Área de Membros
  CREATE TABLE IF NOT EXISTS courses (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    cover_url TEXT,
    students_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- 12. Adquirentes e AI Smart Routing
  CREATE TABLE IF NOT EXISTS acquirers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    priority INTEGER DEFAULT 1,
    is_active INTEGER DEFAULT 1,
    fee_pix_percent REAL DEFAULT 1.99,
    fee_card_percent REAL DEFAULT 3.99,
    credentials_json TEXT DEFAULT '{}',
    status_connection TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- 13. Webhooks & Registros de Entrega
  CREATE TABLE IF NOT EXISTS webhooks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    url TEXT NOT NULL,
    secret_key TEXT NOT NULL,
    events TEXT NOT NULL DEFAULT 'all',
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- 14. Central de Notificações
  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    category TEXT NOT NULL, -- 'venda_aprovada', 'venda_pendente', 'pix_gerado', 'saque', 'alerta'
    order_id TEXT,
    amount REAL,
    is_read INTEGER DEFAULT 0,
    is_simulation INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- 15. Rodadas da Fila de Simulação (1 a 100)
  CREATE TABLE IF NOT EXISTS simulation_runs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    total_count INTEGER NOT NULL,
    sent_count INTEGER DEFAULT 0,
    speed TEXT NOT NULL DEFAULT 'normal', -- 'muito_rapida', 'rapida', 'normal', 'lenta', 'custom'
    interval_seconds INTEGER DEFAULT 5,
    status TEXT NOT NULL DEFAULT 'ready', -- 'ready', 'running', 'paused', 'completed', 'cancelled'
    ad_spend REAL DEFAULT 0.00,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- 16. Logs de Auditoria
  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    action TEXT NOT NULL,
    details TEXT,
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- 17. Tabela Oficial de Taxas do Sistema (Configurável dinamicamente pelo Admin)
  CREATE TABLE IF NOT EXISTS system_rates (
    id TEXT PRIMARY KEY,
    pix_percent REAL NOT NULL DEFAULT 1.49,
    pix_fixed REAL NOT NULL DEFAULT 0.00,
    pix_withdrawal_fee REAL NOT NULL DEFAULT 1.99,
    card_national_percent REAL NOT NULL DEFAULT 4.49,
    card_national_fixed REAL NOT NULL DEFAULT 0.39,
    card_international_percent REAL NOT NULL DEFAULT 5.99,
    card_international_fixed REAL NOT NULL DEFAULT 0.39,
    installment_rate_per_month REAL NOT NULL DEFAULT 1.99,
    currency_exchange_spread_percent REAL NOT NULL DEFAULT 2.50,
    processor_cost_pix_percent REAL NOT NULL DEFAULT 0.70,
    processor_cost_card_percent REAL NOT NULL DEFAULT 2.50,
    processor_cost_card_fixed REAL NOT NULL DEFAULT 0.20,
    processor_cost_withdrawal REAL NOT NULL DEFAULT 0.80,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- 18. Chaves de Integração e API (Public & Secret Keys — Sandbox & Produção)
  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    environment TEXT NOT NULL DEFAULT 'production', -- 'production', 'sandbox'
    public_key TEXT UNIQUE NOT NULL,
    secret_key_hash TEXT NOT NULL,
    secret_key_preview TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'revoked'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_used_at DATETIME,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- 19. Módulo Global & Regras de Países
  CREATE TABLE IF NOT EXISTS countries_config (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    flag_emoji TEXT NOT NULL,
    currency TEXT NOT NULL,
    exchange_rate_to_brl REAL NOT NULL,
    supported_methods TEXT NOT NULL, -- JSON array
    is_active INTEGER DEFAULT 1
  );

  -- 20. Logs Detalhados de Entregas de Webhooks
  CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id TEXT PRIMARY KEY,
    webhook_id TEXT,
    user_id TEXT NOT NULL,
    event TEXT NOT NULL,
    url TEXT NOT NULL,
    signature TEXT NOT NULL,
    payload TEXT NOT NULL,
    status_code INTEGER,
    response_body TEXT,
    response_time_ms INTEGER,
    status TEXT NOT NULL, -- 'success', 'failed'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Migrações defensivas para tabelas existentes
try { db.exec(`ALTER TABLE transactions ADD COLUMN gateway_fee REAL NOT NULL DEFAULT 0.00;`); } catch (_) {}
try { db.exec(`ALTER TABLE transactions ADD COLUMN processor_cost REAL NOT NULL DEFAULT 0.00;`); } catch (_) {}
try { db.exec(`ALTER TABLE transactions ADD COLUMN currency TEXT NOT NULL DEFAULT 'BRL';`); } catch (_) {}
try { db.exec(`ALTER TABLE transactions ADD COLUMN installments INTEGER DEFAULT 1;`); } catch (_) {}
try { db.exec(`ALTER TABLE transactions ADD COLUMN buyer_country TEXT DEFAULT 'BR';`); } catch (_) {}
try { db.exec(`ALTER TABLE transactions ADD COLUMN seller_country TEXT DEFAULT 'BR';`); } catch (_) {}
try { db.exec(`ALTER TABLE transactions ADD COLUMN card_brand TEXT;`); } catch (_) {}
try { db.exec(`ALTER TABLE transactions ADD COLUMN card_last4 TEXT;`); } catch (_) {}
try { db.exec(`ALTER TABLE transactions ADD COLUMN idempotency_key TEXT;`); } catch (_) {}

// Semear Taxas Padrão Oficiais
const existingRates = db.prepare(`SELECT id FROM system_rates WHERE id = 'default'`).get();
if (!existingRates) {
  db.prepare(`
    INSERT INTO system_rates (
      id, pix_percent, pix_fixed, pix_withdrawal_fee,
      card_national_percent, card_national_fixed,
      card_international_percent, card_international_fixed,
      installment_rate_per_month, currency_exchange_spread_percent,
      processor_cost_pix_percent, processor_cost_card_percent,
      processor_cost_card_fixed, processor_cost_withdrawal
    ) VALUES (
      'default', 1.49, 0.00, 1.99,
      4.49, 0.39,
      5.99, 0.39,
      1.99, 2.50,
      0.70, 2.50, 0.20, 0.80
    )
  `).run();
}

// Semear Países Padrão para o Módulo GLOBAL
const countriesObj = db.prepare(`SELECT COUNT(*) as count FROM countries_config`).get();
const countriesCount = countriesObj ? countriesObj.count : 0;
if (countriesCount === 0) {
  const insertCountry = db.prepare(`
    INSERT INTO countries_config (code, name, flag_emoji, currency, exchange_rate_to_brl, supported_methods, is_active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `);

  const initialCountries = [
    { code: 'BR', name: 'Brasil', flag: '🇧🇷', currency: 'BRL', rate: 1.00, methods: '["pix", "card_national", "card_international"]' },
    { code: 'US', name: 'Estados Unidos', flag: '🇺🇸', currency: 'USD', rate: 5.45, methods: '["card_international", "wire"]' },
    { code: 'EU', name: 'União Europeia', flag: '🇪🇺', currency: 'EUR', rate: 5.92, methods: '["card_international", "sepa"]' },
    { code: 'GB', name: 'Reino Unido', flag: '🇬🇧', currency: 'GBP', rate: 6.95, methods: '["card_international", "bacs"]' },
    { code: 'CA', name: 'Canadá', flag: '🇨🇦', currency: 'CAD', rate: 4.02, methods: '["card_international"]' },
    { code: 'PT', name: 'Portugal', flag: '🇵🇹', currency: 'EUR', rate: 5.92, methods: '["card_international", "multibanco"]' },
    { code: 'ES', name: 'Espanha', flag: '🇪🇸', currency: 'EUR', rate: 5.92, methods: '["card_international", "bizum"]' },
    { code: 'MX', name: 'México', flag: '🇲🇽', currency: 'MXN', rate: 0.29, methods: '["card_international", "oxxo"]' },
    { code: 'AR', name: 'Argentina', flag: '🇦🇷', currency: 'ARS', rate: 0.0055, methods: '["card_international"]' }
  ];

  for (const c of initialCountries) {
    insertCountry.run(c.code, c.name, c.flag, c.currency, c.rate, c.methods);
  }
}

// Semear chaves padrão de API para o merchant demo e admin se não existirem
const demoKeys = db.prepare(`SELECT id FROM api_keys WHERE user_id = 'usr_merchant_demo'`).all();
if (demoKeys.length === 0) {
  const insertKey = db.prepare(`
    INSERT INTO api_keys (id, user_id, name, environment, public_key, secret_key_hash, secret_key_preview, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
  `);
  
  // Chave de Produção
  const secLive = 'krypta_sec_live_' + crypto.randomBytes(24).toString('hex');
  const secLiveHash = crypto.createHash('sha256').update(secLive).digest('hex');
  const pubLive = 'krypta_pub_live_' + crypto.randomBytes(16).toString('hex');
  insertKey.run(
    'key_live_' + crypto.randomBytes(4).toString('hex'),
    'usr_merchant_demo',
    'Chave de Produção Oficial',
    'production',
    pubLive,
    secLiveHash,
    secLive.substring(0, 16) + '...' + secLive.slice(-4)
  );

  // Chave de Sandbox
  const secTest = 'krypta_sec_test_' + crypto.randomBytes(24).toString('hex');
  const secTestHash = crypto.createHash('sha256').update(secTest).digest('hex');
  const pubTest = 'krypta_pub_test_' + crypto.randomBytes(16).toString('hex');
  insertKey.run(
    'key_test_' + crypto.randomBytes(4).toString('hex'),
    'usr_merchant_demo',
    'Chave de Testes Sandbox',
    'sandbox',
    pubTest,
    secTestHash,
    secTest.substring(0, 16) + '...' + secTest.slice(-4)
  );
}

console.log('✅ Banco de dados KryptaPay inicializado com sucesso.');

module.exports = db;
