# CLAUDE.md
## DivisÃ£o de papÃ©is e roteamento de modelo

**Topologia ativa:** B â€” Sonnet orquestra, Opus Ã© acionado sob demanda.
(Para a topologia A, inicie a sessÃ£o com `claude --model opus`.)

### Regra mestra
A sessÃ£o principal **decompÃµe e roteia**. Ela nÃ£o executa trabalho mecÃ¢nico com as prÃ³prias mÃ£os.
Antes de qualquer ediÃ§Ã£o, a sessÃ£o responde internamente: *isto Ã© decisÃ£o ou Ã© execuÃ§Ã£o?*
- **DecisÃ£o** -> `architect` (Opus)
- **ExecuÃ§Ã£o especificada** -> `worker` (Sonnet)
- **Fato/verificaÃ§Ã£o** -> `quick-task` (Haiku)
- **Diff pronto pra merge** -> `reviewer` (Opus)

### Tabela de roteamento

| Tarefa | Vai para | Modelo |
|---|---|---|
| Escolher entre duas arquiteturas | `architect` | opus |
| Redigir/atualizar ADR | `architect` | opus |
| MudanÃ§a em lÃ³gica monetÃ¡ria: desenhar o diff | `architect` | opus |
| Revisar diff antes de merge (dinheiro, auth, migration) | `reviewer` | opus |
| Aplicar diff jÃ¡ decidido | `worker` | sonnet |
| Corrigir bug com causa raiz jÃ¡ identificada | `worker` | sonnet |
| Escrever teste a partir de caso jÃ¡ definido | `worker` | sonnet |
| RefatoraÃ§Ã£o mecÃ¢nica (renomear, extrair funÃ§Ã£o) | `worker` | sonnet |
| "Onde estÃ¡ X?" / "quem chama Y?" | `quick-task` | haiku |
| Rodar lint/format/testes e reportar | `quick-task` | haiku |
| Ler log e extrair a linha do erro | `quick-task` | haiku |
| Listar arquivos que casam com padrÃ£o | `quick-task` | haiku |

### PortÃµes inegociÃ¡veis
- **NUNCA** escreva cÃ³digo diretamente na sessÃ£o principal para tarefa mecÃ¢nica â€” delegue ao `worker`.
- **NUNCA** delegue decisÃ£o de arquitetura ao `worker` ou ao `quick-task`.
- **Nenhum** diff que toque `value_cents`, saldo por conta, ledger, `calculo.mjs`, RPC `SECURITY DEFINER`, ou `Decimal` monetÃ¡rio/energÃ©tico vai a merge sem passar pelo `reviewer`.
- Uma branch por mudanÃ§a. RevisÃ£o de diff antes do merge. Nenhum commit sem autorizaÃ§Ã£o explÃ­cita do Weliton.
- Se a sessÃ£o principal estiver em Sonnet e a tarefa exigir julgamento de arquitetura, ela **deve** chamar o `architect`. NÃ£o Ã© opcional.

### Higiene de contexto (Ã© aqui que o custo mora)
- O contexto do orquestrador Ã© o item mais caro da conta, nÃ£o o dos workers. Mantenha-o curto.
- Todo subagente devolve **relatÃ³rio resumido**, nunca diff completo nem saÃ­da bruta de terminal.
- Use `/clear` entre tarefas nÃ£o relacionadas. Contexto arrastado Ã© dinheiro queimado.
- Prefira delegar a leitura de arquivos grandes ao `quick-task` e receber sÃ³ o trecho relevante.