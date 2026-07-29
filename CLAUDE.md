# CLAUDE.md — Painel Regional 19ª RISP

## a. Leia primeiro

**Antes de tocar em qualquer arquivo, leia `docs/ESTADO-DO-PROJETO.md` inteiro.**
Ele é a fonte de verdade sobre decisões já tomadas, armadilhas conhecidas e
pendências em ordem. Este arquivo aqui é o contrato de trabalho; aquele é o
estado. Quando os dois divergirem, `docs/ESTADO-DO-PROJETO.md` vence e este
arquivo deve ser corrigido.

Nenhum commit, merge ou push sem autorização explícita do Weliton.
Uma branch por mudança. Revisão de diff antes do merge.

## b. O que este projeto é, e qual a escala

Painel de indicadores criminais das 15 naturezas controladas pela SSP-GO na
19ª RISP (Caldas Novas). Documento **restrito** — não pode ficar em web aberta.

- **Site estático. Sem banco, sem backend.** Todos os dados vivem em
  `data/dashboard.json`, gerado por script a partir de dois arquivos Excel da
  fonte.
- **~686 registros.** Isto é pequeno de propósito.
- **Mantido por uma pessoa só, sem orçamento.** Tudo roda no plano gratuito.

**Não aplique padrões de sistema de grande porte aqui.** Cache, fila, banco,
paginação, observabilidade, micro-otimização: nada disso se justifica neste
volume, e cada um deles é custo de manutenção permanente para uma pessoa só.

## c. Contrato de domínio verificado

Grafia canônica em `config/dominio.json`. Não deduza, não invente, não "melhore".

### As 15 naturezas controladas

```
HOMICÍDIO DOLOSO            ROUBO EM RESIDÊNCIA
FEMINICÍDIO                 ROUBO DE CARGA
ESTUPRO                     ROUBO A INSTITUIÇÃO FINANCEIRA
LATROCÍNIO                  FURTO DE VEÍCULOS
LESÃO SEGUIDA DE MORTE      FURTO EM COMÉRCIO
ROUBO A TRANSEUNTE          FURTO EM RESIDÊNCIA
ROUBO DE VEÍCULOS           FURTO A TRANSEUNTE
ROUBO EM COMÉRCIO
```

São **15, nem uma a mais**. `tests/rendered-html.test.mjs` trava esse número.

- **"HOMICÍDIO TENTADO" NÃO é natureza controlada.** Se aparecer em qualquer
  documento, código ou saída, está errado.
- A fonte exporta `LATROCINIO` e `LESAO` **sem acento**. O importador normaliza
  por NFD. **Não "corrija" a fonte** e não crie exceção manual para isso.

### Os 11 municípios e as unidades territoriais

| Unidade | Municípios |
|---|---|
| BPTUR | CALDAS NOVAS, RIO QUENTE, MARZAGÃO, CORUMBAÍBA |
| 36º BPM | MORRINHOS, PONTALINA, MAIRIPOTABA, CROMÍNIA |
| 6ª CIPM | PIRACANJUBA, PROFESSOR JAMIL, CRISTIANÓPOLIS |

- **PALMELO e SANTA CRUZ DE GOIÁS não pertencem à 19ª RISP.** Aparecem em
  documentos antigos de 2022 e não existem em nenhuma linha da base atual. Se
  algum documento os citar, o documento está desatualizado.
- **A 10ª CIPM/CPE atua em toda a área e NÃO é separável**, porque a fonte não
  informa qual unidade atendeu a ocorrência. A unidade exibida no painel é
  **territorial**, derivada do município — não é a unidade que atendeu.

### Dados que NUNCA são publicados

`PESSOA_ID` e `VEICULO_ID` **vêm preenchidos na fonte** (27 e 94 linhas na
última exportação) e o importador os **descarta**. O `ID_RAI` real é substituído
por um `factId` técnico sem vínculo com a base.

**Qualquer mudança em `scripts/import-reports.mjs` precisa preservar isso.**
Há teste travando (`tests/rendered-html.test.mjs`).

### A coluna AISP é inútil

Valor único fixo em todas as linhas. **Não derive unidade a partir dela.**

### Entrada mensal

**Dois** arquivos Excel, não três: o **relatório detalhado** e o **comparativo
regional**. O importador identifica cada um pelos cabeçalhos, não pelo nome.

## d. Regras de apuração

### Paridade obrigatória

O total do detalhado tem que bater com o total **atual** do comparativo,
natureza por natureza. Dois testes distintos protegem coisas distintas — não os
confunda:

- **`tests/rendered-html.test.mjs`**, teste *"dados importados reconciliam os
  dois relatórios"*: trava a reconciliação em si — `records.length ==
  metadata.currentTotal`, soma de `comparison[].current == records.length`,
  `comparison.length == 15`, e ausência de `personId`/`vehicleId`.
- **`tests/fixtures/numeric-baseline.json`**, consumido pelo teste *"paridade
  numérica"*: congela **todos os tokens numéricos do HTML renderizado**, para
  provar que mudança de layout/CSS não altera nenhum número exibido.

**Se qualquer um dos dois falhar sem que a mudança seja uma atualização de base,
a mudança está errada.** Não regenere o baseline para fazer o teste passar.

### Estatística

**Variação percentual isolada NUNCA dispara alerta visual.** Quem classifica é
`poissonComparisonPValue` + `classifyVariation`, em `app/statistics.ts`.

Parâmetros — `alpha = 0.05`, `minVolume = 10`, `bonferroniN` **depende do
chamador e isso é deliberado**:

- `app/analytics.ts` e a tabela por natureza usam `Math.max(1,
  comparison.length)` — hoje **15**, porque são 15 naturezas comparadas
  simultaneamente. É uma família de testes, então leva correção de Bonferroni.
- `app/regional-dashboard.tsx` usa **`bonferroniN: 1`** no KPI de variação
  regional, porque ali é **um** teste único, não uma família. **Isto não é bug.
  Não "uniformize" para 15.**
- O default da própria função é `1` (`app/statistics.ts`).

**Exemplo real:** homicídio doloso 5 → 10 é +100%, mas p = 0,30 e a
classificação é *"sem diferença"*. **Isso está correto.** Pintar de vermelho por
causa do percentual seria mandar o comandante remanejar efetivo com base em
ruído.

Há teste unitário direto travando o efeito de `bonferroniN`
(`tests/analytics.test.mjs`, armadilha A8). **Não o remova achando que é
redundante** — é a única coisa que protege esse caminho, porque com o volume
atual nenhuma natureza chega a p < 0,05 e nenhum teste de HTML detectaria a
regressão.

### Onde a estatística roda

**No cliente, não no importador.** O usuário pode desmarcar naturezas, o que
muda os totais comparados; valor pré-calculado no build ficaria errado.

### Taxa por 100 mil

**NUNCA é anualizada.** O período é ~7 meses, não um ano. Extrapolar em
município de 3 mil habitantes produz número irresponsável. Há teste travando o
rótulo *"por 100 mil habitantes no período"* e proibindo variantes anualizadas.

## e. Caminhos protegidos

**Nenhum diff que toque estes arquivos vai a merge sem passar pelo `reviewer`:**

```
scripts/import-reports.mjs
config/dominio.json
app/statistics.ts
data/dashboard.json
tests/fixtures/numeric-baseline.json
```

São o caminho que produz os números oficiais publicados. Erro aqui não é bug de
software: é número errado num documento que vai para o comando.

## f. O que NÃO fazer

- **Não introduza banco de dados, fila, cache, paginação ou observabilidade.**
- **Não bloqueie impressão via CSS/JS.** O `@media print` em `app/globals.css`
  existe para entregar impressão limpa e deve continuar funcionando. Bloqueio de
  Ctrl+P **não é controle de acesso** — o controle real é o Cloudflare Access.
- **Não trate as vulnerabilidades do `npm audit`.** São devDependencies de um
  site estático sem backend; `npm audit fix --force` tem risco real de quebrar o
  build com ganho nulo neste modelo de ameaça.
- **Não fragmente `data/dashboard.json` nem pré-agregue dados.**
- **Não crie metas por unidade** sem meta oficial definida pelo comando. Sem
  meta, é invenção de número.
- **Não regenere `tests/fixtures/numeric-baseline.json`** para fazer teste passar.

## g. Divisão de papéis e roteamento de agentes

**Topologia ativa:** B — Sonnet orquestra, Opus é acionado sob demanda.
(Para a topologia A, inicie a sessão com `claude --model opus`.)

### Regra mestra

A sessão principal **decompõe e roteia**. Ela não executa trabalho mecânico com
as próprias mãos. Antes de qualquer edição, a sessão responde internamente:
*isto é decisão ou é execução?*

- **Decisão** → `architect` (opus)
- **Execução especificada** → `worker` (sonnet)
- **Fato/verificação** → `quick-task` (haiku)
- **Diff pronto pra merge** → `reviewer` (opus)

### Tabela de roteamento

| Tarefa | Vai para | Modelo |
|---|---|---|
| Escolher entre duas abordagens de apuração ou de tela | `architect` | opus |
| Desenhar mudança no importador ou no domínio | `architect` | opus |
| Mudança em `app/statistics.ts`: desenhar o diff | `architect` | opus |
| Revisar diff que toca caminho protegido (seção e) | `reviewer` | opus |
| Aplicar diff já decidido | `worker` | sonnet |
| Corrigir bug com causa raiz já identificada | `worker` | sonnet |
| Escrever teste a partir de caso já definido | `worker` | sonnet |
| Refatoração mecânica (renomear, extrair função) | `worker` | sonnet |
| "Onde está X?" / "quem chama Y?" | `quick-task` | haiku |
| Rodar lint/testes e reportar | `quick-task` | haiku |
| Ler log e extrair a linha do erro | `quick-task` | haiku |
| Listar arquivos que casam com padrão | `quick-task` | haiku |

### Portões inegociáveis

- **NUNCA** escreva código diretamente na sessão principal para tarefa mecânica
  — delegue ao `worker`.
- **NUNCA** delegue decisão de arquitetura ou de apuração ao `worker` ou ao
  `quick-task`.
- **Nenhum** diff que toque os caminhos protegidos da seção (e) vai a merge sem
  passar pelo `reviewer`.
- Se a sessão principal estiver em Sonnet e a tarefa exigir julgamento sobre
  apuração, domínio ou estatística, ela **deve** chamar o `architect`. Não é
  opcional.

### Higiene de contexto

- O contexto do orquestrador é o item mais caro da conta, não o dos workers.
  Mantenha-o curto.
- Todo subagente devolve **relatório resumido**, nunca diff completo nem saída
  bruta de terminal.
- Use `/clear` entre tarefas não relacionadas.
- Prefira delegar a leitura de arquivos grandes ao `quick-task` e receber só o
  trecho relevante. `data/dashboard.json` e
  `tests/fixtures/numeric-baseline.json` **nunca** devem ser lidos inteiros para
  o contexto do orquestrador.

## h. Comandos

```bash
npm install                          # dependências
npm run dev                          # painel local
npm run atualizar -- a.xlsx b.xlsx   # regenera data/dashboard.json (2 arquivos)
npm test                             # roda build + testes
npm run lint                         # eslint
npm run build                        # build Next (validação)
npm run build:pages                  # build SPA
```
