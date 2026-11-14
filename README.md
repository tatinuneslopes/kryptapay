# KRYPTAPAY — Pagamentos Sem Limites

> **“2027 é nosso. Vamos para cima. Quem não roda black não vive da white.”**

Bem-vindo à **KryptaPay**, a plataforma e gateway de pagamentos de padrão internacional construída para grandes operações digitais, com inteligência de roteamento (**AI Smart Routing**), design **Deep Black & Electric Purple**, Globo 3D interativo em tempo real, Central de Notificações com simulação em fila persistente (1 a 100 eventos) com a fotinha da logomarca oficial nas notificações, e compatibilidade nativa **PWA** para iPhone (Safari) e Android (Chrome).

---

## ⚡ Como Iniciar a Plataforma no seu Computador

1. Dê um duplo-clique no arquivo **`iniciar.bat`** (ou execute `.\start.ps1` no PowerShell);
2. Abra o navegador e acesse:
   - **Landing Page Cinematográfica com Globo 3D**: [http://localhost:3000](http://localhost:3000)
   - **Dashboard Operacional Completa**: [http://localhost:3000/app.html](http://localhost:3000/app.html)

---

## 📱 Como Colocar na Tela Inicial do Celular (PWA)

### 🍏 No iPhone e iPad (Navegador Safari):
1. Acesse o endereço da KryptaPay no **Safari**;
2. Toque no ícone de **Compartilhar** (quadradinho com uma seta apontando para cima na barra inferior);
3. Role as opções para baixo e selecione **"Adicionar à Tela de Início"** (ícone com `+`);
4. Confirme o nome **KryptaPay** e toque em **"Adicionar"** no canto superior direito;
5. **Pronto!** O ícone da KryptaPay aparecerá na tela do seu iPhone e abrirá em **tela cheia** como um aplicativo nativo da App Store, sem barra de navegação!

### 🤖 No Celular Android (Navegador Google Chrome):
1. Acesse o site no **Google Chrome** no celular;
2. Toque nos **três pontinhos** no canto superior direito;
3. Toque em **"Instalar aplicativo"** (ou *"Adicionar à tela inicial"*);
4. Confirme tocando em **"Instalar"**;
5. **Pronto!** O aplicativo será adicionado à sua tela inicial e gaveta de apps.

---

## 🚀 Como Enviar para o GitHub e Vercel (Online na Nuvem)

O projeto já está com o repositório Git e o arquivo `vercel.json` 100% configurados.

Para subir para o seu GitHub:
1. Crie um novo repositório vazio no seu GitHub (ex: `kryptapay-gateway`);
2. No terminal dentro da pasta do projeto, execute:
   ```bash
   git remote add origin https://github.com/SEU_USUARIO/kryptapay-gateway.git
   git branch -M main
   git push -u origin main
   ```
3. Na **Vercel** ([vercel.com](https://vercel.com)):
   - Clique em **"Add New Project"**;
   - Importe o repositório `kryptapay-gateway`;
   - Clique em **Deploy**;
   - Em menos de 1 minuto seu site estará online na internet com HTTPS grátis para você e seus clientes acessarem pelo iPhone ou Android em qualquer lugar do mundo!

---

## 🌐 Recursos Especiais Exclusivos da KryptaPay

1. **Tabela Oficial de Taxas Comerciais do Sistema**:
   - **Pix Aprovado**: **1.49%** (sem taxas ocultas);
   - **Saque Pix Imediato**: **R$ 1,99** (sem trava de valor mínimo, transferência rápida para CPF, telefone, e-mail ou EVP);
   - **Cartão de Crédito Nacional**: **4.49% + R$ 0,39** fixo;
   - **Cartão de Crédito Internacional**: **5.99% + R$ 0,39** fixo;
   - **Parcelamento Inteligente**: De 1x até 12x com taxa configurável dinamicamente no Painel Admin;
   - **Painel Master Admin**: Edição de taxas dinâmicas em tempo real com persistência no banco SQLite e DRE completa com Receita Bruta da Gateway vs Custo do Adquirente vs Lucro Líquido Real retido.

2. **API Oficial de Gateway REST & Credenciais de Integração**:
   - Chaves Públicas (`krypta_pub_live_...` / `krypta_pub_test_...`) e Chaves Secretas (`krypta_sec_live_...` / `krypta_sec_test_...`) com separação rigorosa entre **Produção** e **Sandbox**;
   - Endpoint universal: `POST /api/v1/charges` com suporte a `Idempotency-Key`, geração instantânea de Pix dinâmico EMV e aprovação de cartão;
   - Exemplos interativos em cURL, Node.js e Python no próprio dashboard.

3. **Webhooks Assinados com HMAC-SHA256**:
   - Header de segurança `X-Krypta-Signature: sha256=...`;
   - Disparo automático nos eventos: `payment.pending`, `payment.approved`, `payment.rejected`, `withdrawal.approved`;
   - Botão **"Disparar Webhook de Teste Agora"** no painel com visualização em tempo real do status HTTP, tempo de resposta em milissegundos e histórico de entregas.

4. **Módulo GLOBAL FX & 4 Rotas de Processamento**:
   - Câmbio multi-moeda em tempo real para **BRL, USD, EUR, GBP, CAD, MXN, ARS** com spread cambial transparente;
   - 4 Rotas inteligentes: Brasil → Brasil, Brasil → Global, Estrangeiro → Brasil e Estrangeiro → Global.

5. **Suporte Multi-Idioma Completo (i18n)**:
   - Alternância instantânea no topo do app entre 6 idiomas: **Português (BR), English (US), Español (ES), Français (FR), Deutsch (DE) e Italiano (IT)**.

6. **Logomarca Oficial em Alta Definição**:
   - Ícone oficial aplicado no app, favicon, topo da plataforma e **em todas as notificações** flutuantes e push no celular com som de caixa registradora.
7. **Globo 3D Interativo em Tempo Real**:
   - Baseado na imagem oficial do mapa-múndi roxo com nós e órbitas neon luminosas.
8. **Premiações e Placas 3D**:
   - Placas de 10K, 50K, 100K, 1M (+ iPhone 18 Pro Max Bordô Red) e 10 Milhões Titan;
   - Pulseiras Oficiais: Roxa (10K / 50K), Preta VIP (100K / 1M) e Titan 10 Milhões com a medalha do 01.
   - Rodando em 3D fluido tanto na Landing Page quanto dentro da Dashboard;
   - Exibe o anel orbital neon da logomarca e uma constelação de **bolinhas roxas pulsantes** representando os clientes comprando na sua loja/site em tempo real;
   - Cards flutuantes de compras recentes orbitando o mapa em tempo real.
3. **Simulador de Notificações de Alta Fidelidade (1 a 100)**:
   - Volume configurável (10, 20, 30, 50, 100 notificações);
   - Sequência alternada perfeita (`Pendente` ➔ `Aprovada`);
   - Valores realistas (R$ 24,90 a R$ 497,00) e velocidade ajustável;
   - Efeito sonoro realista de venda aprovada (*Web Audio API* sem necessidade de arquivos externos).
4. **Dashboard de Testes 100% Isolada com ROI**:
   - Faturamento Simulado isolado do financeiro real;
   - Cálculo automático de ROI simulado com base no valor investido em anúncios.
5. **Premiações 3D de Elite**:
   - Placas tridimensionais (10K, 30K, 50K, 100K Black, 500K Elite, 1M, 10M Titan);
   - Pulseiras de reconhecimento oficiais;
   - Premiação especial do **iPhone Pro Max Bordô** na meta de R$ 200 mil.
6. **AI Smart Routing**:
   - Integração com múltiplos adquirentes (Asaas, Pagar.me, Mercado Pago e Cielo) com fallback inteligente e prevenção de cobrança duplicada.
7. **Saques Pix Imediatos**:
   - Saque direto via chave Pix com extrato de taxas transparente.
8. **Painel Master Admin**:
   - Acesso exclusivo para os 2 administradores principais.

---

## 🔑 Acessos Padrão do Sistema

| Usuário | E-mail | Senha Padrão | Perfil |
|---|---|---|---|
| **Administrador Master 1** | `admin@kryptapay.com` | `CryptaAdmin@2026` | Acesso Total Master |
| **Administrador Master 2** | `diretoria@kryptapay.com` | `CryptaAdmin@2026` | Diretoria / Co-fundadora |
| **Operador Digital Demo** | `demo@kryptapay.com` | `12345678` | Vendedor / Operações |
