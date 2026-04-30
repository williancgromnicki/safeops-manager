# SafeOps Manager

Documentação operacional mínima para ambientes de desenvolvimento e produção.

## 1) Pré-requisitos e setup local

### Pré-requisitos
- Node.js 20+
- npm 10+
- Projeto Supabase configurado
- Conta na Vercel (para deploy em produção)

### Setup local
1. Instale dependências:
   ```bash
   npm install
   ```
2. Crie o arquivo de ambiente local:
   ```bash
   cp .env.example .env.local
   ```
3. Preencha as variáveis obrigatórias (ver seção 2).
4. Rode a aplicação:
   ```bash
   npm run dev
   ```
5. Acesse `http://localhost:3000`.

> Se não existir `.env.example`, crie `.env.local` manualmente com as chaves listadas abaixo.

## 2) Variáveis de ambiente

Variáveis mínimas:

- `NEXT_PUBLIC_SUPABASE_URL`
  - URL do projeto Supabase
  - Pode estar disponível no client (prefixo `NEXT_PUBLIC_`)

- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - Chave pública anônima do Supabase
  - Pode estar disponível no client (prefixo `NEXT_PUBLIC_`)

- `SUPABASE_SERVICE_ROLE_KEY`
  - **Uso somente server-side**, quando estritamente necessário
  - **Nunca** expor em código client-side
  - **Nunca** versionar em repositório

Exemplo de `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

## 3) Execução manual de migrations no Supabase

As migrations SQL ficam em `supabase/migrations/`.

### Fluxo recomendado
1. Revise os arquivos SQL no diretório de migrations.
2. Faça backup lógico ou snapshot do ambiente alvo (staging/produção).
3. Execute manualmente no Supabase SQL Editor:
   - Abra o painel do projeto Supabase.
   - Vá em **SQL Editor**.
   - Cole o conteúdo da migration (ex.: `supabase/migrations/20260429120000_initial_schema.sql`).
   - Execute e valide o resultado.
4. Valide tabelas, índices, policies e permissões após a execução.
5. Registre no changelog interno qual migration foi aplicada, por quem e em qual ambiente.

### Boas práticas
- Aplicar primeiro em desenvolvimento/staging, depois em produção.
- Evitar mudanças destrutivas sem plano de rollback.
- Executar em janela de manutenção quando houver risco de lock/indisponibilidade.

## 4) Deploy na Vercel

1. Conecte o repositório no painel da Vercel.
2. Configure as variáveis de ambiente por ambiente (Preview/Production):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (somente se algum fluxo server-side realmente usar)
3. Defina branch de produção (ex.: `main`).
4. Execute um deploy inicial.
5. Valide saúde básica da aplicação pós-deploy:
   - carregamento de páginas
   - autenticação
   - leitura/escrita esperada no Supabase

## 5) Segurança

- **Não expor `SUPABASE_SERVICE_ROLE_KEY` no client**.
- **Não criar endpoints proxy genéricos** que repassem payloads arbitrários para serviços externos.
- **Não aceitar URL externa arbitrária** em rotas server-side para evitar SSRF.
- Validar e sanitizar toda entrada externa em APIs server-side.
- Aplicar princípio do menor privilégio para credenciais e roles.

## 6) Plano futuro: integração com engine interna

Diretriz para evolução:

- Integrar com a engine interna **somente via conector server-side dedicado**.
- O client não deve chamar diretamente a engine interna.
- O conector deve:
  - autenticar chamadas internas
  - validar contratos de entrada/saída
  - aplicar allowlist de operações
  - registrar auditoria mínima (request id, operação, status)

Esse modelo reduz superfície de ataque e centraliza governança técnica e de segurança.

## 7) Teste do webhook de alertas (server-side)

Exemplo de chamada para o endpoint `POST /api/integrations/tactical/alerts`:

```bash
curl -X POST "http://localhost:3000/api/integrations/tactical/alerts" \
  -H "Content-Type: application/json" \
  -H "x-safeops-webhook-token: $SAFEOPS_WEBHOOK_TOKEN" \
  -d '{
    "occurred_at": "2026-04-28T16:51:48",
    "site": "lamchicotes.com.br",
    "severity": "WARN",
    "hostname": "LAM-ENG-001",
    "check_type": "disk",
    "client": "LAM Chicotes",
    "details": "Disk Space Check...",
    "check_name": "SAFESYS Windows Disk check",
    "status": "Alerta"
  }'
```

Variáveis adicionais obrigatórias para este fluxo:

- `SAFEOPS_WEBHOOK_TOKEN`
- `SUPABASE_SERVICE_ROLE_KEY` (somente server-side)
