# Estado do Projeto — Painel Regional 19ª RISP

Documento de handoff. Se você (pessoa ou IA) está pegando este projeto agora,
leia este arquivo inteiro antes de tocar em qualquer coisa.

Última revisão: 2026-07-29. Commit de referência: `6086eca`.

---

## 1. O que é isto

Painel de indicadores criminais das 15 naturezas controladas pela SSP na
19ª RISP (Caldas Novas). Documento **restrito** — não pode ficar em web aberta.

- Site estático, sem banco e sem backend. Todos os dados vivem em
  `data/dashboard.json`, gerado por script a partir de dois Excel da SSP.
- Volume atual: ~696 registros. Isto é pequeno de propósito. **Não aplique
  padrões de sistema de grande porte aqui** — cache, fila, banco, paginação,
  observabilidade: nada disso se justifica.
- Mantido por uma pessoa só (Weliton), sem orçamento. Tudo roda no gratuito.

## 2. Mapa dos arquivos que importam

| Caminho | Papel |
|---|---|
| `app/regional-dashboard.tsx` | A tela inteira. Componente único, client-side. |
| `app/analytics.ts` | `rankNeighborhoods`/CR5, `weekHourMatrix`, `ratePer100k`. |
| `app/statistics.ts` | Poisson exato + correção de Bonferroni. |
| `app/page.tsx`, `app/layout.tsx`, `app/globals.css` | Casca Next + estilos (inclui `@media print`). |
| `scripts/import-reports.mjs` | Importador dos 2 Excel -> `data/dashboard.json`. |
| `config/dominio.json` | Naturezas controladas, municípios, unidades. |
| `config/populacao.json` | População IBGE 2025, base do "por 100 mil". |
| `data/dashboard.json` | A verdade publicada. `schemaVersion: 1`. |
| `tests/analytics.test.mjs` | Testa `analytics.ts` e `statistics.ts`. |
| `tests/rendered-html.test.mjs` | Testa o HTML gerado pelo build. |
| `tests/fixtures/numeric-baseline.json` | Congela todos os tokens numéricos do HTML renderizado. Caminho protegido. |
| `CLAUDE.md`, `.claude/agents/` | Contrato de trabalho e roteamento de tarefas entre agentes. Versionados; não há gerador (ver A15). |
| `github-pages/`, `vite.pages.config.ts` | Build alternativo (SPA) para GitHub Pages. |
| `.github/workflows/ci.yml` | Portão de verificação no push em `main`: roda lint + testes + build de checagem. Não publica nada. |

## 3. Decisões já tomadas — NÃO reabrir sem motivo forte

1. **Sem banco de dados.** JSON estático versionado em Git. Motivo: volume
   minúsculo, custo zero, histórico grátis via commits.
2. **Sem arquivamento histórico interno.** A fonte sempre exporta de 01/01 até
   a data de geração, então cada arquivo novo já contém tudo. O histórico dos
   commits de `data/dashboard.json` é o arquivo morto.
3. **Hospedagem alvo: Cloudflare Pages + Cloudflare Access** (projeto
   `painel-risp`, domínio `.pages.dev`). Motivo: é o único jeito gratuito de
   ter autenticação de verdade na frente de um site estático. Cloudflare Access
   **não funciona** em `*.workers.dev`, só em `*.pages.dev` ou domínio próprio.
4. **GitHub Pages já saiu de cena.** O repositório foi tornado privado em
   2026-07-28, e GitHub Pages **não funciona em repositório privado no plano
   gratuito** — o painel parou de ser servido naquele endereço. O workflow de
   deploy (`pages.yml`) foi removido no mesmo dia (commit `d7b363e`) e
   substituído por `.github/workflows/ci.yml`, que só verifica (lint + testes
   + build), sem publicar. O motivo original continua valendo como registro:
   GitHub Pages **não tem controle de acesso** no plano gratuito, por isso
   nunca foi o destino final — o destino é o Cloudflare Pages com Access.
5. **`package-lock.json` não é versionado** (commit `7a199d1`). Motivo:
   dependências nativas do rolldown quebravam entre Windows e Linux, fazendo
   `npm ci` falhar no build do Cloudflare. Todo ambiente usa `npm install`.
   *Consequência aceita:* o build não é 100% reproduzível. Ver armadilha A1.
6. **`xlsx` é vendorizado** em `vendor/xlsx-0.20.3.tgz` (commit `473607b`).
   Motivo: a versão publicada no registro npm oficial está congelada em 0.18.5
   (4 anos) com vulnerabilidades já corrigidas nas versões novas, que só
   existem no CDN da SheetJS. Vendorizar elimina a dependência de rede sem
   trocar de biblioteca nem mexer no parser.
7. **Identificadores sensíveis não são publicados.** O importador substitui o
   número real do RAI por um identificador técnico sem vínculo com a base.
   Pessoa e veículo não saem. **Qualquer mudança no importador precisa
   preservar isto.** Há teste que trava esse comportamento.
8. **A coluna `AISP` do relatório detalhado é inútil** (valor único fixo:
   "22ª AISP - ÁREA DE CALDAS NOVAS" em todas as linhas). Não tente derivar
   unidade a partir dela. BPTUR, 36º BPM e 6ª CIPM são atribuídos
   territorialmente pelo município; 10ª CIPM/CPE não é separável até a fonte
   passar a informar a unidade de atendimento.
9. **Estatística roda no cliente, não no importador.** O usuário pode desmarcar
   naturezas, o que muda os totais comparados; valor pré-calculado no build
   ficaria errado.
10. **Taxa por 100 mil nunca é anualizada.** O período é ~7 meses, não um ano.
    Extrapolar em município de 3 mil habitantes produz número irresponsável.

## 4. Rotina mensal (para o Weliton)

Feita **uma vez por mês, no primeiro dia útil**. Responsável: Weliton.

1. Na fonte da SSP, exporte **dois** arquivos, sempre de 01/01 até hoje:
   - o relatório **detalhado**;
   - o **comparativo regional**.
   Os nomes podem ser quaisquer — o importador identifica cada um pelos
   cabeçalhos.
   **São dois arquivos, não três.** Em 2026-07-29 chegaram três (`data (14)`,
   `data (15)`, `data (16)`) e os dois primeiros eram **byte a byte idênticos**
   — mesmo SHA-256, o detalhado baixado duas vezes. Passar três faz o importador
   parar com a mensagem de uso, e isso está correto. Se estiver na dúvida sobre
   qual é qual, o detalhado tem a coluna `ID_RAI` e o comparativo tem
   `ANTERIOR`/`ATUAL`.
2. Abra o terminal na pasta do projeto e rode:
   ```bash
   npm run atualizar -- "caminho\arquivo-1.xlsx" "caminho\arquivo-2.xlsx"
   ```
3. Se aparecer erro, **pare**. O importador só falha quando algo está errado no
   arquivo (cabeçalho faltando, natureza desconhecida, município fora da RISP,
   total do detalhado batendo diferente do comparativo). Não force.
4. Confira o painel localmente:
   ```bash
   npm run dev
   ```
5. Rode a verificação:
   ```bash
   npm test
   ```
6. Só então faça commit de `data/dashboard.json` e envie. A publicação é
   automática.

Se der errado e você não souber o motivo: **não apague nada**. O estado
anterior está preservado no Git.

## 5. Armadilhas conhecidas

Nenhuma destas é bloqueante hoje, mas todas já custaram tempo a alguém.

- ~~**A1 — build não reproduzível.**~~ **RESOLVIDO** (commit `d7b363e`).
  `esbuild` era usado em `tests/rendered-html.test.mjs` e
  `tests/analytics.test.mjs`, mas **não estava em `package.json`** — só
  funcionava por hoisting transitivo (tsx / drizzle-kit / wrangler). Foi
  declarado em devDependencies, fixado em `0.28.0` (a mesma versão que já
  vinha sendo resolvida por hoisting, para não mudar comportamento).
- ~~**A2 — arquivo temporário dentro de `app/`.**~~ **RESOLVIDO** (commit
  `d7b363e`). `tests/rendered-html.test.mjs` escrevia
  `app/.tmp-titlecase-<pid>.mjs`, dentro do diretório de rotas, e não estava
  no `.gitignore`. O temporário passou a ser escrito em `tests/` (mesmo
  padrão que `analytics.test.mjs` já usava), e `.tmp-*.mjs` entrou no
  `.gitignore`.
- **A3 — `titleCase` capitaliza preposições:** "Roubo A Instituição
  Financeira", "Lesão Seguida De Morte". Cosmético, pré-existente.
- **A4 — `titleCase` quebra siglas com barra** (`10ª CIPM/CPE`, `19ª RISP`,
  `CRPM`) porque só divide por espaço em branco. **Inerte hoje**, porque nomes
  de unidade não passam por `titleCase`. Vira bug no dia em que passarem.
- **A5 — `aria-pressed` inconsistente:** o card de unidade não desmarca ao
  clicar no item já ativo; a linha de município desmarca.
- **A6 — `display: contents` no `.rank-row-button`:** suporte irregular em
  engines antigas e nunca verificado em navegador real.
- **A7 — HTML inválido tolerado:** `<h3>`/`<div>`/`<p>` dentro de `<button>`.
  O `<h3>` deixa de ser exposto como heading na árvore de acessibilidade.
- ~~**A8 — `bonferroniN` está INERTE na base atual.**~~ **MITIGADO** (commit
  `e44bfb2`). O fato continua verdadeiro: com este volume, nenhuma natureza
  chega a p<0.05 nem sem correção, então **nenhum teste de HTML detectaria uma
  regressão em `bonferroniN`**. A rede agora existe em `tests/analytics.test.mjs`:
  há teste unitário direto de `classifyVariation` com um par cujo p-valor cai
  entre `0.05/15` e `0.05`, provando `observar` com N=15 e `significativo` com
  N=1. **Não remova esse teste** achando que é redundante — ele é a única coisa
  que protege esse caminho.
- ~~**A9 — `npx tsc --noEmit` retorna 3 erros**~~ **RESOLVIDO** (commit
  `95c9178`). Hoje `tsc --noEmit` retorna zero erros. Mantenha assim.
- **A10 — `npm audit` reporta 18 vulnerabilidades** (1 low, 4 moderate, 13
  high), todas em devDependencies de um site estático sem backend. **Decisão:
  não tratar.** `npm audit fix --force` tem risco real de quebrar o build e o
  ganho de segurança é nulo neste modelo de ameaça.
- ~~**A11 — sem `.gitattributes` e `core.autocrlf=true`.**~~ **RESOLVIDO**
  (commit `52eb5da`). Diffs eram poluídos por CRLF/LF. `.gitattributes`
  criado com `* text=auto eol=lf`; a renormalização (`git add --renormalize .`)
  não alterou nenhum arquivo, porque os objetos já estavam armazenados em LF.
- **A12 — 33 registros com hora "00:00" ambígua. NÃO tem conserto no
  importador.** *Diagnóstico corrigido em 2026-07-29, verificado no Excel de
  origem:* a coluna `HORA_FATO` traz o **texto literal `"00:00"`** e **nunca vem
  em branco** — contagem no arquivo de julho: 33 células `"00:00"`, **zero**
  células vazias, 663 com outros horários. Meia-noite real e hora não informada
  saem com bytes idênticos. **A hipótese anterior (`time: null` no importador +
  `schemaVersion: 2`) não funciona:** `"00:00"` é perfeitamente parseável, então
  a mudança pegaria zero das 33 linhas. Não é bug de código, é limitação da
  fonte.
  **Único conserto real:** pedir à SSP que exporte `HORA_FATO` em branco quando
  não informado. **Mitigação já aplicada** (ver P2): o painel declara quantos
  registros são ambíguos e que fatia da faixa 00–04h eles representam — 34,7% na
  base de julho: 33 de 95 registros —, e diz que a faixa deve ser lida como limite superior.
  **A afirmação "a fonte nunca exporta em branco" é verificada por código, não por
  conferência manual:** `parseTime` devolve `null` para célula sem hora (antes
  devolvia `"00:00"`, fundindo os dois casos), o importador conta esses casos em
  `metadata.blankTime`, e há teste exigindo que seja **0**. No dia em que a SSP
  atender ao pedido, esse teste falha de propósito — é o gatilho para reavaliar a
  A12, **não** para ajustar o número esperado. `weekHourMatrix` já exclui
  `time: null` do mapa de calor.
  **Não converta `"00:00"` em `null` nem descarte esses registros:** jogaria fora
  meia-noite verdadeira sem o usuário saber. Há teste travando esse comportamento.
  A ressalva também é anexada à frase do sumário executivo quando a faixa apontada
  como crítica é justamente a 00–04h, porque quem lê só o sumário — ou o PDF
  impresso — não chega à seção do mapa de calor.
- ~~**A14 — mojibake em `CLAUDE.md` e `.claude/agents/*.md`.**~~ **RESOLVIDO**
  (commit `0c3b897`). Os cinco arquivos estavam com acentuação dupla-codificada
  ("DivisÃ£o" em vez de "Divisão"): bytes UTF-8 lidos como Latin-1 e regravados
  como UTF-8. **A causa não é o `setup-agents.ps1`** — o fonte dele está em
  UTF-8 limpo e ele grava com `UTF8Encoding($false)`. A corrupção acontece
  quando o script é **executado pelo Windows PowerShell 5.1**, que lê arquivo
  `.ps1` sem BOM como ANSI/cp1252; as strings já nascem corrompidas em memória e
  são gravadas assim. **Rode-o com `pwsh` (PowerShell 7+), nunca com
  `powershell.exe`.** O mesmo vale para qualquer script futuro com acento.
- ~~**A15 — `setup-agents.ps1` regenera a versão contaminada.**~~ **RESOLVIDO
  pela remoção do script.** Ele embutia nos heredocs a versão **antiga** de
  `CLAUDE.md` e dos 4 agentes, copiada de outros projetos, e rodá-lo desfazia o
  commit `0c3b897` em silêncio. **Decisão:** apagar em vez de manter em sincronia.
  Os 5 arquivos já estão versionados no Git — um gerador duplicado significaria
  manter duas cópias da mesma verdade para sempre, e a do script já tinha
  divergido uma vez. *Registro para quem vier depois:* se algum dia quiser
  provisionar esses agentes em outro repositório, **não ressuscite este script** —
  o conteúdo dele é específico do RISP (naturezas, municípios, caminhos
  protegidos) e não serve para outro projeto. O histórico está no Git.
- ~~**A13 — código morto do scaffolding**~~ **RESOLVIDO** (commit `95c9178`).
  Ficava assim: `db/schema.ts` e `db/index.ts`
  (placeholders vazios), `worker/index.ts`, `drizzle.config.ts`, `drizzle/`,
  `examples/d1/`, `.openai/hosting.json`, `app/chatgpt-auth.ts` (não é
  importado por ninguém), `public/file.svg`, `public/globe.svg`,
  `public/window.svg`. Nada disso é usado pelo painel.

## 6. Pendências — em ordem

### P0 — Crítico. Fazer antes de qualquer outra coisa.

- [x] ~~**O repositório `welitonsp/RISP` está PÚBLICO.**~~ **RESOLVIDO em
      2026-07-28** (commit `71bc6f7`). Foi confirmado via
      `gh repo view --json visibility` que o repositório estava `PUBLIC`, com o
      painel marcado como "acesso restrito" acessível a qualquer pessoa na
      internet. O repositório foi tornado **PRIVATE**.
      *Registro para quem vier depois:* `noindex`/`nofollow` **não é** controle
      de acesso — só pede para buscadores não indexarem. Nunca trate isso como
      proteção.
      **Consequência esperada:** GitHub Pages não funciona em repositório
      privado no plano gratuito, então o painel provavelmente saiu do ar
      naquele endereço. Isso é aceito — o destino final é o Cloudflare Pages
      com Access (ver os dois itens abaixo).
- [x] ~~**Remover `public/relatorio.html`**~~ **RESOLVIDO em 2026-07-28**
      (commit `71bc6f7`). Era um relatório de auditoria antigo de 416 KB,
      copiado por `publicDir` para `github-pages-dist/` e `dist/client/`, que
      ficava servido em `/relatorio.html` **fora de qualquer autenticação** e
      era uma cópia **desatualizada** da verdade. Nenhum código o referenciava.
      Antes de remover foi verificado que continha **apenas dados agregados**
      por bairro e natureza — zero CPF, zero RAI real, zero nome de pessoa,
      zero placa —, por isso **não foi necessário reescrever o histórico do
      Git**. Removidos junto: o HTML de auditoria da raiz e os SVGs órfãos do
      scaffolding (`file.svg`, `globe.svg`, `window.svg`).
      `public/favicon.svg` foi mantido: está em uso.
- [ ] **Validar o Cloudflare Access de ponta a ponta:** abrir a URL do
      `painel-risp` numa janela anônima e confirmar que exige login; confirmar
      que a lista de e-mails autorizados está correta. Ao ativar o Access num
      projeto Pages, o procedimento oficial manda apagar o `*` do campo
      Subdomain — isso **destrava os endereços de pré-visualização**
      (`abc123.painel-risp.pages.dev`), que servem os mesmos dados. É
      obrigatório criar uma **segunda** aplicação de Access cobrindo
      `*.painel-risp.pages.dev`, ou desativar as pré-visualizações.
- [x] ~~**Desligar o GitHub Pages**~~ **RESOLVIDO/OBSOLETO em 2026-07-28.** O
      Pages saiu do ar sozinho ao tornar o repositório privado (plano
      gratuito não serve Pages em repo privado), e `.github/workflows/pages.yml`
      foi removido no commit `d7b363e`, substituído por
      `.github/workflows/ci.yml` (só verificação, sem deploy). Não havia mais
      nada a desligar manualmente.

### P1 — Alto. Confiabilidade do que já existe. ✅ CONCLUÍDO em 2026-07-28

- [x] ~~Adicionar `esbuild` a `devDependencies`~~ (armadilha A1) — commit
      `d7b363e`. Fixado em `0.28.0`, a mesma versão que já vinha sendo
      resolvida por hoisting, para não mudar comportamento.
- [x] ~~Adicionar `npm run lint` e `npm test` ao workflow~~ — commit `d7b363e`.
      **Contexto:** ao tornar o repositório privado, o GitHub Pages parou de
      funcionar (plano gratuito não suporta Pages em repo privado) e
      `pages.yml` passou a falhar em todo push. Como a publicação real agora é
      feita pela integração própria do Cloudflare Pages (que não depende deste
      workflow), `pages.yml` foi **substituído** por
      `.github/workflows/ci.yml`, que roda `lint` + `test` + `build:pages` sem
      publicar nada. Isso entregou o portão de verificação que faltava: antes,
      qualquer push publicava sem rodar teste algum.
- [x] ~~Criar `.gitattributes`~~ (armadilha A11) — commit `52eb5da`, isolado.
      `git add --renormalize .` não alterou **nenhum** arquivo: os objetos já
      estavam armazenados em LF, o ruído era só no working tree durante edição.
      Commit neutro em conteúdo. `vendor/*.tgz` marcado como `binary`.
- [x] ~~Mover o arquivo temporário de `app/` para `tests/`~~ (armadilha A2) —
      commit `d7b363e`. `.tmp-*.mjs` acrescentado ao `.gitignore`.

### P2 — Importante. Qualidade e sustentabilidade.

- [x] ~~Remover o código morto do item A13~~ — commit `95c9178`. Removidos:
      `db/`, `drizzle.config.ts`, `drizzle/`, `examples/d1/`,
      `app/chatgpt-auth.ts`, e as dependências `drizzle-orm`/`drizzle-kit`
      com o script `db:generate`. **`npx tsc --noEmit` saiu de 3 erros para
      zero** (fecha A9).
      **Achado importante:** `worker/index.ts`, `build/sites-vite-plugin.ts` e
      `.openai/hosting.json` **NÃO são código morto** — são referenciados por
      `vite.config.ts`, que roda no `npm run build`, que os testes usam para
      renderizar o HTML. Foram mantidos. Do worker saiu apenas o binding
      `DB: D1Database`, órfão após a remoção da camada de banco. Os tipos
      mínimos do runtime Cloudflare ficam em `worker/cloudflare-types.d.ts`
      (o pacote `@cloudflare/workers-types` não está instalado).
      *Nota:* `vite.config.ts` mantém um binding `d1_databases` condicionado a
      `hostingConfig.d1` — é infraestrutura genérica do template, dormente e
      inofensiva, não resquício do que foi removido.
- [x] ~~Importador: gravar `time: null` quando a hora não for informada~~
      **CANCELADO — a premissa estava errada** (ver A12). A fonte nunca exporta
      `HORA_FATO` em branco, então não há o que detectar. Em vez disso o painel
      passou a **declarar** a ambiguidade: quantos registros têm `"00:00"` e que
      fatia da faixa 00–04h eles representam, reagindo aos filtros.
      `schemaVersion` **continua 1** — a mudança foi aditiva em `metadata`.
- [ ] **Pedir à SSP que exporte `HORA_FATO` em branco quando não informado.**
      É o único conserto de verdade da A12. Sem isso, 34,7% da faixa 00–04h
      permanece indistinguível entre madrugada real e ausência de dado.
- [ ] **Pedir à SSP a janela coberta pela coluna `ANTERIOR`.** Nenhum dos dois
      arquivos declara: os filtros exportados descrevem só o período atual
      (`Date é igual a ou está depois de 01/01/2026`). Enquanto isso, o painel
      diz explicitamente que a duração da janela anterior não é declarada.
- [x] ~~Cobertura de teste para os pontos hoje descobertos~~ — commit
      `e44bfb2`. Fecha a armadilha **A8**: há teste unitário provando que
      `bonferroniN` muda o resultado (`observar` com N=15 x `significativo`
      com N=1). Também travados: o rótulo "por 100 mil habitantes no período"
      (proibindo variantes anualizadas), as somas de população por UPM, e o
      limiar visual `<10`.
- [x] ~~Corrigir contraste~~ — commit `e44bfb2`. `.section-kicker` foi de
      3,27:1 para **4,85:1** e `.rank-number` de 3,02:1 para **4,94:1**, ambos
      acima do mínimo AA de 4,5:1 para texto pequeno. Matiz preservada. Os
      demais textos pequenos foram conferidos e já passavam.
- [ ] Abrir o painel num celular real uma vez e confirmar os breakpoints de
      960px e 620px. Estruturalmente parecem corretos; nunca foram testados.
- [x] ~~**Reescrever `CLAUDE.md` e `.claude/agents/*.md` para o domínio do
      RISP**~~ — commit `0c3b897`. Os cinco arquivos vieram copiados de outros
      projetos: protegiam caminhos inexistentes aqui e **não protegiam nenhum
      caminho crítico deste repositório**. Passaram a cobrir o contrato real —
      15 naturezas, 11 municípios, atribuição territorial de unidade, descarte de
      `PESSOA_ID`/`VEICULO_ID`/`ID_RAI`, inutilidade da coluna `AISP`, entrada de
      dois Excel, paridade obrigatória e classificação por Poisson.
      **Registrado lá, e digno de repetição aqui:** `bonferroniN` vale **1** no
      KPI de variação regional (`app/regional-dashboard.tsx:222`, teste único) e
      **o tamanho da família** na tabela por natureza
      (`app/analytics.ts:260`, hoje 15). Os dois estão certos —
      **não uniformize.** O default da função em `app/statistics.ts` é `1`.
- [x] ~~**Resolver `setup-agents.ps1`**~~ (armadilha A15) — o script foi
      **apagado**. Rodá-lo revertia o commit `0c3b897` em silêncio, e manter um
      gerador em sincronia com 5 arquivos já versionados é custo permanente sem
      benefício. A armadilha A14 (executar `.ps1` sem BOM no PowerShell 5.1)
      continua valendo para qualquer script futuro com acento.

### P3 — Melhorias analíticas.

- [x] ~~**Sumário executivo automático**~~ — commit `a607d1e`. Cinco achados
      por regra fixa, reagindo aos filtros (na visão de uma unidade, o sumário
      fala daquela unidade).
      **Decisão do Weliton:** o sumário foca nos **dados criminais**, não em
      população. A 5ª regra, que na proposta original era "carga relativa à
      população", virou **concentração territorial** — que fatia dos registros
      está nos bairros mais frequentes e em quantos bairros se distribuem —
      com leitura operacional (concentrado = focalizável; pulverizado = exige
      cobertura distribuída). A taxa por 100 mil **continua** nas tabelas e
      cards, onde serve para comparar municípios de portes diferentes.
      Dois defeitos corrigidos na revisão, dignos de registro:
      (a) quando o comparativo não se aplica ao recorte, as frases 1 e 2
      afirmavam ausência de mudança significativa, **contradizendo o aviso que
      o próprio painel exibe** três seções abaixo — agora dizem explicitamente
      que a comparação não está disponível;
      (b) o comparador de "maior alta" era **intransitivo** quando uma natureza
      partia de zero, fazendo o vencedor depender da ordem do arquivo. Latente
      com os dados atuais, ativaria sozinho na próxima atualização. Há teste
      com permutações travando isso — **não simplifique esse comparador sem ler
      o teste primeiro.**
- [x] ~~Error boundary~~ — commit `e44bfb2`. Em `github-pages/main.tsx` e
      `app/error.tsx`. Distingue **falha da aplicação** (recarregar) de **falha
      de integridade da base**, em que o painel é interrompido de propósito
      para não exibir número errado (nasce do `throw` deliberado quando o grupo
      CVLI vem ausente ou vazio).
      **Não mexa na detecção sem ler `app/errors.ts` e `tests/errors.test.mjs`:**
      ela usa uma classe de erro com propriedade marcadora, e não comparação de
      texto da mensagem nem `instanceof` (que pode falhar entre bundles). Há
      teste provando isso — um erro genérico contendo o texto antigo do marcador
      deve cair no caminho genérico.
- [x] ~~**Redesenho do painel com grade de KPIs**~~ — commit `9196a94`.
      Acrescenta grade de KPIs (variação regional, registros por natureza, fatos
      distintos, CVLI), sumário executivo destacado e bloco de leitura rápida,
      com o CSS correspondente.
      **O que esse commit criou de mais importante não é a tela, é a rede:**
      `tests/fixtures/numeric-baseline.json` congela **todos** os tokens
      numéricos do HTML renderizado, e o teste *"paridade numérica"* prova que
      mudança de layout não altera nenhum número exibido. O teste normaliza
      nomes de asset com hash e o `deploymentVersion` do payload RSC, porque
      mudam a cada build e não são números vistos pelo usuário.
      **Não regenere o baseline para calar o teste.** Se ele falha e a mudança
      não é atualização de base, a mudança é que está errada.
- [ ] **Comparativo POR UNIDADE (Fase 1-B).** **BLOQUEADO:** depende de o
      Weliton fornecer um arquivo de exemplo real exportado pela fonte com
      quebra por unidade. Ele confirmou que a fonte consegue exportar, mas o
      arquivo ainda não foi entregue. Enquanto não houver, a variação % fica
      "—" fora da visão regional completa, e isso está correto. Não tente
      contornar com a coluna `AISP` (decisão 8).

### P4 — Não fazer. Custo alto, retorno baixo neste contexto.

- Tratar as 18 vulnerabilidades do `npm audit` (ver A10).
- Testes automatizados de acessibilidade, Lighthouse CI, Storybook, métricas de
  cobertura. Infraestrutura maior que o projeto.
- Geração programática de PDF (puppeteer/react-pdf). O `@media print` em
  `globals.css` já entrega impressão limpa via Ctrl+P.
- Corrigir `titleCase` para siglas com barra (A4) enquanto estiver inerte —
  basta um comentário no código avisando.
- Otimização de performance. O bundle é dominado por um arquivo que vai ser
  deletado no P0; depois disso não há o que otimizar com ~700 registros.
- SEO / meta tags. O alvo é acesso restrito; investir aqui é contraproducente.
- Fragmentar `data/dashboard.json` ou pré-agregar dados. Com ~700 registros o
  navegador processa tudo em fração de milissegundo.
- **Farol de metas por unidade:** só faz sentido depois que o comando definir
  metas oficiais. Sem metas, é invenção de número.

## 7. Comandos

```bash
npm install                 # dependências
npm run dev                 # painel local
npm run atualizar -- a.xlsx b.xlsx   # regenera data/dashboard.json
npm test                    # roda build + testes
npm run lint                # eslint
npm run build               # build Next (validação)
npm run build:pages         # build SPA do GitHub Pages
```

## 8. Regras de trabalho neste repositório

- Uma branch por mudança. Revisão de diff antes do merge.
- Nenhum commit sem autorização explícita do Weliton.
- **Nenhum diff que toque `scripts/import-reports.mjs`, `config/dominio.json`,
  `app/statistics.ts`, `data/dashboard.json` ou
  `tests/fixtures/numeric-baseline.json` vai a merge sem revisão** — são o
  caminho que produz os números oficiais publicados. Esta é a mesma lista de
  "caminhos protegidos" de `CLAUDE.md`; se mudar aqui, mude lá também.
- **Teste de paridade obrigatório** em qualquer mudança que toque a apuração:
  os números exibidos (696 registros, 668 fatos, 725 no anterior, -4,0%) devem
  permanecer idênticos, salvo quando a mudança for justamente atualizar a base.
  Dois testes distintos protegem coisas distintas — não os confunda:
  *"dados importados reconciliam os dois relatórios"* trava a reconciliação
  detalhado × comparativo; *"paridade numérica"* trava os números renderizados
  contra `tests/fixtures/numeric-baseline.json`.
- Ver `CLAUDE.md` para o roteamento de tarefas entre agentes.
