# Projeto I9 - Demandas de Professores

Aplicacao web para registrar demandas dos professores (ex.: notebooks solicitados por dia) e acompanhar o total consolidado por mes.

## Funcionalidades

- Login simples por usuario.
- Aba **Lancar Demanda** para registrar professor, quantidade e data.
- Aba **Total do Mes** para visualizar:
  - total geral do mes;
  - total por professor;
  - lista de lancamentos do mes.
- Edicao e exclusao de lancamentos existentes.
- Exportacao do consolidado mensal em **Excel** e **PDF**.
- Persistencia em **PostgreSQL**.
- Uso compartilhado: varias pessoas acessando o mesmo servidor.

## Como executar localmente

1. Crie um banco PostgreSQL local.

2. Copie o arquivo `.env.example` para `.env` e ajuste os valores.

3. Instale dependencias:

```bash
npm install
```

4. Inicie o servidor:

```bash
npm start
```

5. Abra no navegador:

- No computador servidor: `http://localhost:3000`
- Na rede local: `http://SEU-IP-LOCAL:3000`

## Usuarios padrao

- Usuario: `admin` | Senha: `i9@2026`
- Usuario: `professor` | Senha: `senac123`

Voce pode editar ou adicionar usuarios no arquivo `data/users.json`.
Na primeira inicializacao, esses usuarios sao inseridos no banco automaticamente.

## Migracao dos dados antigos

- Se existir o arquivo `data/demandas.json`, os registros sao importados automaticamente para o PostgreSQL na primeira inicializacao (apenas se a tabela `demandas` estiver vazia).

## Compartilhamento com outras pessoas

Para voce e seu amigo usarem junto:

1. Um computador fica com o servidor ligado (`npm start`).
2. Os outros acessam pelo IP local desse computador.
3. Todos gravam no mesmo banco PostgreSQL, entao os dados ficam sincronizados.

## Deploy 24h (Render)

1. Suba este projeto no GitHub.
2. No Render, crie um banco PostgreSQL.
3. Crie um Web Service apontando para o repositório.
4. Configure:
  - Build Command: `npm install`
  - Start Command: `npm start`
5. Adicione as variaveis de ambiente no serviço:
  - `DATABASE_URL` (fornecida pelo PostgreSQL do Render)
  - `SESSION_SECRET` (uma string forte)
  - `PORT` (opcional, o Render injeta automaticamente)
6. Deploy e compartilhe a URL publica.

## Observacoes

- Em producao, troque as senhas padrao dos usuarios.
- O arquivo `data/users.json` e usado como seed inicial de usuarios.
