# Diário de Bordo — Controle de Escalas e Previsão de Ciclos

Aplicação web (PWA) desenvolvida para o gerenciamento de escalas de trabalho embarcadas e portuárias, cálculo automático de saldo de folgas e projeção dinâmica de ciclos futuros.

O projeto foi concebido para resolver um problema real de logística operacional na navegação fluvial e marítima: acompanhar turnos alternados (como regimes `10x5`, `14x7`, `30x15` ou personalizados), contabilizar extensões de embarque não previstas e projetar automaticamente os próximos períodos de descanso e retorno ao trabalho.

---

## Funcionalidades Principais

- **Autenticação e Isolamento de Dados:** Cadastro, login e recuperação de senha via e-mail utilizando Supabase Auth, com políticas de segurança em nível de linha (Row Level Security — RLS) que garantem que cada usuário acesse apenas os próprios registros.
- **Perfil e Configuração de Regime:** Gerenciamento de dados cadastrais (nome de exibição, patente/função fluvial, embarcação, empresa, data de admissão e foto de perfil redimensionada automaticamente no navegador até 2 MB e armazenada via Supabase Storage) e definição flexível da escala de trabalho por dias de trabalho e dias de folga (padrão `10x5`).
- **Cálculo de Saldo de Folgas:** Contabilização automática dos dias trabalhados (`Porto` e `Embarque`), folgas geradas proporcionalmente ao regime ativo, folgas usufruídas e saldo líquido atualizado em tempo real (`Atestado` é registrado sem descontar folgas nem contar como dia embarcado).
- **Calendário Mensal e Previsão Adaptativa:** Visualização mensal diferenciando períodos realizados (`Porto`, `Embarque`, `Folga` e `Atestado`) de períodos projetados (`Prev. Trabalho` e `Prev. Folga`). Inclui alerta de desembarque/folga pendente e confirmação rápida para estender o turno atual quando o embarque continua.
- **Histórico Operacional (CRUD):** Registro, edição e exclusão de períodos com cálculo automático de duração entre datas e interface responsiva adaptada para dispositivos móveis.
- **Resiliência, Modo Offline e Feedback de Falhas:** Operações de leitura, criação, edição e exclusão contam com tratamento de erros com aviso visual (*toast*), opção de nova tentativa (*retry*), preservação dos dados do formulário em caso de falha, cache local por usuário (`localStorage`) e Service Worker para funcionamento offline em modo de leitura.

---

## Arquitetura e Estrutura do Projeto

O front-end segue uma arquitetura modular em JavaScript puro (ES Modules), separando regras de negócio, persistência, cache e interface:

```text
diario-de-bordo/
├── .github/workflows/deploy.yml   # Pipeline CI/CD (executa testes e publica no GitHub Pages)
├── css/
│   └── styles.css                 # Estilos responsivos, variáveis CSS, modal e grid do calendário
├── js/
│   ├── app.js                     # Orquestração de estado, eventos e fluxos da aplicação
│   ├── config.js                  # Configurações do app, chaves do Supabase e tabela de patentes
│   ├── escalaEngine.js            # Motor puro de cálculo de dias, saldo e projeção de ciclos
│   ├── storageCache.js            # Persistência local isolada por usuário para fallback offline
│   ├── supabaseClient.js          # Integração com Supabase Auth, Database, Storage e tratamento de erros
│   └── ui.js                      # Renderização de componentes, calendário, modais e toasts
├── tests/
│   └── escalaEngine.test.js       # Testes unitários nativos com node:test
├── index.html                     # Estrutura principal e registro do Service Worker
├── manifest.json                  # Manifesto PWA
├── service-worker.js              # Cache de ativos estáticos e estratégia de rede
└── package.json                   # Script de execução dos testes (npm test)
```

### Tecnologias Utilizadas

- **Front-end:** HTML5, CSS3 (Grid Layout, Flexbox, variáveis CSS e design responsivo) e JavaScript ES6+ modular (ES Modules).
- **Back-end as a Service (BaaS) — Supabase:**
  - **PostgreSQL:** Persistência relacional com *triggers* de cálculo de dias/timestamps, validação de intervalos, bloqueio de sobreposição operacional (`btree_gist`) e auditoria de exclusões.
  - **Supabase Auth:** Gerenciamento de sessões, login e redefinição de senha.
  - **Supabase Storage:** Armazenamento de avatares isolados por UUID com limite de 2 MB e validação de formato (`JPEG`, `PNG`, `WebP`).
  - **Row Level Security (RLS):** Políticas granulares de acesso baseadas em `auth.uid()`.
- **Testes & CI/CD:** Testes unitários nativos com `node:test` / `node:assert/strict` e automação via GitHub Actions para publicação no GitHub Pages (HTTPS).

---

## Estrutura do Banco de Dados

O esquema PostgreSQL utiliza três tabelas principais no schema `public`:

1. **`perfis`**: Armazena preferências e parâmetros de cálculo de cada usuário (`id`, `nome_exibicao`, `posto`, `embarcacao`, `empresa`, `data_admissao`, `dias_trabalho`, `dias_folga`, `avatar_url`, `updated_at`).
2. **`escalas`**: Armazena o histórico cronológico de movimentações (`id`, `user_id`, `tipo`, `data_inicio`, `data_fim`, `dias_totais`, `observacao`, `created_at`, `updated_at`), com restrição de exclusão (`EXCLUDE USING gist`) que impede sobreposição de datas entre `Porto`, `Embarque` e `Folga`.
3. **`escalas_auditoria_exclusao`**: Registra automaticamente via *trigger* (`AFTER DELETE`) os dados de períodos excluídos para rastreabilidade do próprio usuário.

---

## Como Executar Localmente

1. **Clone o repositório:**
   ```bash
   git clone https://github.com/camilemanuelly/diario-de-bordo.git
   cd diario-de-bordo
   ```

2. **Configure o Supabase:**
   - Crie um projeto no Supabase e aplique o script SQL de estrutura, *triggers*, RLS e bucket `avatars`.
   - No arquivo **`js/config.js`**, informe a `supabaseUrl` e a `supabaseKey` (Publishable / Anon Key) do seu projeto em `APP_CONFIG`.

3. **Execute os testes unitários (requer Node.js 20+):**
   ```bash
   npm test
   ```

4. **Inicie um servidor local:**
   - Abra o projeto com um servidor HTTP local (como `npx serve .` ou a extensão *Live Server* no VS Code) para que os ES Modules e o Service Worker funcionem corretamente.