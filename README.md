# Projeto Senac JOCA - Demandas de notebooks aos Professores

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
