// KryptaPay Database Layer — SQLite Relational Engine Nativo (node:sqlite)
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const dbPath = path.join(__dirname, 'cryptapay.sqlite');
const db = new DatabaseSync(dbPath);

// Configurar modo WAL e chaves estrangeiras para máxima velocidade e integridade ACID
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  -- 1. Tabela de Usuários e Administradores
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'merchant', -- 'admin', 'merchant'
    phone TEXT,
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
    payment_method TEXT NOT NULL, -- 'pix', 'credit_card', 'bank_slip'
    status TEXT NOT NULL, -- 'approved', 'pending', 'refused', 'refunded'
    customer_name TEXT,
    customer_email TEXT,
    customer_phone TEXT,
    acquirer TEXT DEFAULT 'CryptaPay Core',
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

  -- 5. Saques Pix
  CREATE TABLE IF NOT EXISTS withdrawals (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    amount REAL NOT NULL,
    fee REAL NOT NULL DEFAULT 3.50,
    net_amount REAL NOT NULL,
    pix_key TEXT NOT NULL,
    pix_key_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'completed', 'rejected'
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
`);

console.log('✅ Banco de dados KryptaPay inicializado com sucesso.');

module.exports = db;
