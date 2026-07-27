# RISP - Painel Regional de Indicadores Criminais

Painel institucional responsivo para análise das naturezas controladas pela
Secretaria de Segurança Pública na 19ª RISP - Caldas Novas.

## Conteúdo

- visão regional consolidada;
- filtros por período, unidade territorial, município, grupo e natureza;
- comparação regional entre o período atual e o anterior;
- distinção entre registros por natureza e fatos únicos;
- atualização automatizada a partir dos dois arquivos Excel da SSP;
- publicação com acesso privado por se tratar de documento restrito.

## Atualizar os dados

Os dois arquivos podem ter nomes diferentes. O importador identifica
automaticamente qual é o relatório detalhado e qual é o comparativo pelos
cabeçalhos.

```bash
npm run atualizar -- "caminho/relatorio-1.xlsx" "caminho/relatorio-2.xlsx"
```

Antes de gerar o painel, a atualização verifica:

- presença dos cabeçalhos obrigatórios;
- lista das 15 naturezas controladas;
- municípios pertencentes à 19ª RISP;
- total do arquivo detalhado contra o total atual do comparativo;
- datas e registros mínimos necessários.

Os identificadores de pessoa, veículo e o número real do RAI não são
publicados. O painel recebe apenas um identificador técnico sem vínculo com a
base original.

## Executar localmente

```bash
npm install
npm run dev
```

## Validação

```bash
npm run build
```

## Limitação da fonte

O relatório detalhado informa município, AISP e RISP, mas não informa a unidade
que realizou o atendimento. Por isso, BPTUR, 36º BPM e 6ª CIPM são calculados
territorialmente pelo município. A atuação da 10ª CIPM/CPE não pode ser separada
até que a fonte passe a incluir a unidade de atendimento.
