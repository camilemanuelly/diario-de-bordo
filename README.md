# Diário de Bordo — Controle de Escalas e Previsão de Ciclos

Aplicação web desenvolvida para o gerenciamento de escalas de trabalho embarcadas e portuárias, cálculo automático de saldo de folgas e projeção dinâmica de ciclos futuros.

O projeto foi concebido para resolver um problema real de logística operacional: acompanhar turnos alternados (como regimes 10x5, 30x15 ou personalizados), contabilizar extensões de embarque não previstas e projetar automaticamente os próximos períodos de descanso e retorno ao trabalho.

---

## Funcionalidades Principais

* **Autenticação e Isolamento de Dados:** Cadastro, login e recuperação de senha via e-mail utilizando Supabase Auth, com políticas de segurança em nível de linha (Row Level Security - RLS) que garantem que cada usuário acesse apenas os próprios registros.
* **Perfil e Configuração de Regime:** Gerenciamento de dados cadastrais (nome de exibição, patente/função, embarcação, empresa, data de admissão e foto de perfil armazenada via Supabase Storage) e definição flexível da escala de trabalho por dias de trabalho e dias de folga (padrão 10x5).
* **Cálculo de Saldo de Folgas:** Contabilização automática dos dias trabalhados (Porto e Embarque), folgas geradas proporcionalmente ao regime ativo, folgas gozadas e saldo líquido atualizado em tempo real.
* **Calendário Mensal e Previsão Adaptativa:** Visualização mensal diferenciando períodos realizados (Porto, Embarque, Folga e Atestado) de períodos projetados. O algoritmo analisa o histórico contínuo mais recente e recalcula automaticamente as datas futuras caso o turno atual seja estendido ou alterado.
* **Histórico Operacional (CRUD):** Registro, edição e exclusão de períodos com cálculo automático de duração entre datas e interface responsiva adaptada para dispositivos móveis.
* **Resiliência e Feedback de Falhas:** Operações de leitura, criação, edição e exclusão de escalas contam com tratamento de erros com aviso visual (toast), registro de log no console, opção de tentativa manual (retry) e preservação dos dados do formulário em caso de falha.

---

## Arquitetura e Tecnologias Utilizadas

* **Front-end:** HTML5, CSS3 (Grid Layout, Flexbox, variáveis CSS e design responsivo) e JavaScript (ES6+ assíncrono).
* **Back-end as a Service (BaaS):** Supabase
  * **PostgreSQL:** Persistência relacional nas tabelas `perfis` e `escalas`.
  * **Supabase Auth:** Gerenciamento de sessões e autenticação de usuários.
  * **Supabase Storage:** Armazenamento público de avatares isolados por identificador de usuário (`UUID`).
  * **Row Level Security (RLS):** Regras de acesso baseadas em `auth.uid()`.
* **Hospedagem:** GitHub Pages (entrega estática via HTTPS).

---

## Estrutura do Banco de Dados

O sistema utiliza duas tabelas principais no PostgreSQL:

1. **`perfis`**: Armazena as preferências e parâmetros de cálculo de cada usuário (`id`, `nome_exibicao`, `empresa`, `data_admissao`, `dias_trabalho`, `dias_folga`, `avatar_url`).
2. **`escalas`**: Armazena o histórico cronológico de movimentações (`id`, `user_id`, `tipo`, `data_inicio`, `data_fim`, `dias_totais`, `observacao`).

---
## Como Executar Localmente

1. Clone este repositório: `git clone https://github.com/camilemanuelly/diario-de-bordo.git`
2. Crie um projeto no Supabase e configure as tabelas `perfis`, `escalas` e o bucket `avatars` com as respectivas políticas de RLS.
3. No arquivo `index.html`, insira a Project URL e a Anon Key do seu projeto Supabase nas constantes `SUPABASE_URL` e `SUPABASE_KEY`.
4. Abra o arquivo `index.html` utilizando um servidor local (como a extensão Live Server no VS Code) ou publique diretamente via GitHub Pages.
