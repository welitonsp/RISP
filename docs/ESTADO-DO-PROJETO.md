# Estado do Projeto — Painel Regional 19ª RISP

Documento de handoff. Se você (pessoa ou IA) está pegando este projeto agora,
leia este arquivo inteiro antes de tocar em qualquer coisa.

Última revisão: 2026-07-28. Commit de referência: `98b2f60`.

---

## 1. O que é isto

Painel de indicadores criminais das 15 naturezas controladas pela SSP na
19ª RISP (Caldas Novas). Documento **restrito** — não pode ficar em web aberta.

- Site estático, sem banco e sem backend. Todos os dados vivem em
  `data/dashboard.json`, gerado por script a partir de dois Excel da SSP.
- Volume atual: ~686 registros. Isto é pequeno de propósito. **Não aplique
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
- **A8 — `bonferroniN` está INERTE na base atual.** Nenhuma natureza chega a
  p<0.05 nem sem correção. Consequência: nenhum teste de HTML detecta regressão
  ali. Só teste unitário direto de `statistics.ts` protege esse código.
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
- **A12 — 32 registros com hora "00:00" ambígua.** O importador devolve
  "00:00" tanto para meia-noite real quanto para hora não informada. Hoje esses
  registros entram no mapa de calor como se fossem madrugada. Corrigir exige
  `time: null` no importador e bump de `schemaVersion` para 2.
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
- [ ] Importador: gravar `time: null` quando a hora não for informada e subir
      `schemaVersion` para 2. Exige ajuste correspondente no mapa de calor para
      excluir esses registros (A12). **Depende de:** o Weliton rodar
      `npm run atualizar` de novo com os Excel originais para regenerar a base.
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
  deletado no P0; depois disso não há o que otimizar com 686 registros.
- SEO / meta tags. O alvo é acesso restrito; investir aqui é contraproducente.
- Fragmentar `data/dashboard.json` ou pré-agregar dados. Com 686 registros o
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
  `app/statistics.ts` ou `data/dashboard.json` vai a merge sem revisão** — são
  o caminho que produz os números oficiais publicados.
- **Teste de paridade obrigatório** em qualquer mudança que toque a apuração:
  os números exibidos (686 registros, 658 fatos, 717 no anterior, -4,3%) devem
  permanecer idênticos, salvo quando a mudança for justamente atualizar a base.
- Ver `CLAUDE.md` para o roteamento de tarefas entre agentes.
