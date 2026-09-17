# Portal de Frequência — Geração Tech 4.0

Registro de presença das aulas ao vivo do Projeto Geração Tech 4.0
(Edital nº 01/2026 – IEL-CE / ADECE / Governo do Estado do Ceará).

---

## Guia do aluno

### Acesso

Você entra com **e-mail cadastrado**, **data de nascimento (DD/MM/AAAA)** e
**sua turma**. A partir daí o portal já abre na página de frequência da sua
turma, com os dias e horários certos. A sessão dura 12 horas.

### Turmas

| Formação                     | Modalidade       | Quando                |
| ---------------------------- | ---------------- | --------------------- |
| Desenvolvedor Full Stack     | Online           | Segundas, 18h às 22h  |
| Desenvolvedor Full Stack     | Presencial manhã | Seg a sex, 8h às 12h  |
| Desenvolvedor Full Stack     | Presencial tarde | Seg a sex, 13h às 17h |
| IA Generativa                | Online           | Segundas, 18h às 22h  |
| IA Generativa                | Presencial manhã | 3x/semana, 8h às 12h  |
| IA Generativa                | Presencial tarde | 3x/semana, 13h às 17h |
| FullCycle – Eng. de Software | Online           | Segundas, 18h às 22h  |
| FullCycle – Eng. de Software | Presencial noite | 3x/semana, 18h às 22h |

Aula inaugural: **08/09/2026** (presencial e online, todas as turmas).
Aulas: **09/09/2026 a 19/11/2026**. Formatura: 25/11/2026.

### Marcação de presença

**É um clique só.** No botão **MARCAR PRESENÇA** sua presença já fica
completa: a saída é lançada automaticamente no horário de fim da aula da sua
turma. Você **não precisa voltar** para bater check-out.

A janela de marcação segue o turno da sua turma (a coordenação pode
ajustá-la):

| Turno | Marcar presença | Aula          |
| ----- | --------------- | ------------- |
| Manhã | 08:00 – 10:30   | 08:00 – 12:00 |
| Tarde | 13:00 – 15:30   | 13:00 – 17:00 |
| Noite | 18:30 – 20:30   | 18:00 – 22:00 |

Nas turmas presenciais a marcação confere sua localização; nas online, não.

---

## Guia da coordenação

### Aba Cronograma

Toda a gestão de dias, horários e datas de aula acontece no painel admin,
aba **Cronograma** — sem SQL e sem deploy.

| Ação                                        | Onde na tela              |
| ------------------------------------------- | ------------------------- |
| Trocar os dias da semana da turma           | Dias e horários           |
| Mudar horário de aula e da marcação         | Dias e horários           |
| Adicionar uma data de aula avulsa           | Adicionar uma aula        |
| Editar a data ou o tema de uma aula         | Lista de datas → Editar   |
| Cancelar uma aula mantendo o histórico      | Lista de datas → Cancelar |
| Apagar a data de vez                        | Lista de datas → Remover  |
| Criar todas as datas de um período          | Gerar várias datas        |

**Cancelar x Remover:** cancelar tira a data do cálculo de frequência e
mantém o registro; remover apaga de vez. Prefira cancelar.

Mudou alguma coisa? A marcação dos alunos passa a seguir a regra nova em até
1 minuto, sem reiniciar nada.

Trocar os dias da semana **não** mexe nas datas já cadastradas — ele passa a
valer para as datas que você gerar em lote depois.

### Presença em um clique: o que muda no painel

O aluno faz **uma única marcação** e o servidor preenche a saída com o fim
da aula da turma. Por isso:

- Não existe mais "aluno aguardando check-out" — quem marcou presença já está
  com o registro fechado.
- O filtro **Registros antigos sem saída**, no painel de busca, serve apenas
  para conferir dados anteriores a essa mudança.
- O **ponto manual** do painel lança entrada e saída de uma vez, já com o
  horário da aula da turma.

### Home do admin

A home abre com o retrato do dia: presenças de hoje sobre os alunos das
turmas que têm aula hoje, taxa de presença, quantas dessas turmas já têm
ponto do professor e quantas justificativas aguardam resposta. A barra de
presença por turma leva direto ao painel de busca já filtrado, e os dados de
presença são recarregados a cada minuto.

### Aba Professores (folha de ponto)

Acompanhamento dos registros dos professores, por período, turma e professor:

| Ação                                     | Onde na tela             |
| ---------------------------------------- | ------------------------ |
| Ver dias, horários e tempo em aula       | Registros                |
| Somar dias e horas por professor         | Resumo do período        |
| Corrigir data, turma, horários e avaliação | Registros → Editar     |
| Excluir um registro errado               | Registros → Excluir      |
| Lançar um dia que o professor não marcou | Lançar ponto manualmente |
| Baixar a folha em planilha               | Exportar Excel           |

O professor continua marcando presença em um clique: o ponto entra com o
horário da aula da turma. Registro corrigido pela coordenação aparece
marcado como *corrigido*.

---

## Documentação técnica

### Onde ficam dias e horários

**No banco**, nas tabelas `turmas` e `calendario_aulas`. São a fonte de
verdade do sistema.

#### Plano B: o calendário do código

`frontend/src/Constants.js` e `backend/calendario.js` guardam o calendário
padrão do edital. Ele entra em ação quando as tabelas ainda não existem (SQL
não rodado) ou o banco não responde — o sistema continua funcionando, e a aba
Cronograma avisa que está em modo somente leitura.

### Pontos de atenção do calendário

1. **12/10/2026 e 02/11/2026 caem em segunda-feira** e são feriados. Como as
   turmas online só têm aula ao vivo às segundas, elas ficam com **9
   encontros** (inaugural + 8) em vez de 11. Havendo reposição, adicione a
   data pela aba Cronograma.
2. **Os 3 dias das turmas "3x/semana"** não estão no edital. O padrão adotado
   é **segunda, quarta e sexta** — ajuste pela aba Cronograma.
3. **Full Stack presencial dá 51 dias de aula** (seg a sex × 4h = 204h), acima
   das 192h do Anexo I. Se a organização fechar um calendário menor, remova
   ou cancele as datas excedentes pelo painel.

### Banco de dados

Rode `sql/migracao_geracao_tech_4_0.sql` no SQL Editor do Supabase. É
idempotente e não apaga dados do Geração Tech 3.0. **Sem rodar esse arquivo a
aba Cronograma não consegue salvar** — é ele que cria as tabelas.

Rodar de novo não desfaz ajustes feitos pelo painel: o seed das turmas usa
`ON CONFLICT DO NOTHING`.

A **PARTE 6** (migração dos alunos das turmas antigas) está comentada de
propósito: `data_analytics` não existe no 4.0 e `fullstack` virou três turmas
diferentes, então a decisão é da organização.

### Variáveis de ambiente (`backend/.env`)

| Variável                         | Para quê                                 |
| -------------------------------- | ---------------------------------------- |
| `SUPABASE_URL`, `SUPABASE_KEY`   | Conexão com o banco                      |
| `JWT_SECRET`                     | Assinatura dos tokens                    |
| `ADMIN_EMAIL`, `ADMIN_PASS`      | Acesso administrativo                    |
| `EXIGIR_LOCALIZACAO`             | `false` desliga a conferência de GPS     |
| `CLASSROOM_LAT`, `CLASSROOM_LNG` | Endereço da aula presencial              |
| `CHECKIN_RADIUS_METERS`          | Raio aceito na marcação (padrão 120)     |
| `TEST_LOCATION_LAT/LNG`          | Segundo local aceito, para teste         |
| `MODO_TESTE`                     | `true` libera ponto em qualquer dia/hora |

### Desligando a conferência de localização

Já vem desligada — as aulas presenciais acontecem em 3 sedes, então não há um
endereço único para validar. O navegador nem pede permissão de GPS.

Para religar um dia: `EXIGIR_LOCALIZACAO=true` no `.env` **e** preencher
`CLASSROOM_LAT` / `CLASSROOM_LNG`. Sem as coordenadas, a marcação presencial
falha — o servidor avisa no console quando sobe nessa configuração.

### Liberando o ponto para teste (WINDOW_OPEN)

Na tabela `configuracoes` do Supabase, a linha `janela_ponto`:

| Valor          | Efeito                                                 |
| -------------- | ------------------------------------------------------ |
| `WINDOW_CLOSE` | Normal: só bate ponto no dia e horário da aula         |
| `WINDOW_OPEN`  | Teste: qualquer aluno bate ponto a qualquer dia e hora |

Troque o valor direto no editor de tabelas — sem deploy, sem reiniciar. O
efeito aparece em até 5 segundos.

Com `WINDOW_OPEN` ligado, um aviso laranja aparece na tela do aluno e na aba
Cronograma, para ninguém esquecer isso ligado em produção.

`MODO_TESTE` existe para gravação de vídeo e homologação. **Nunca deixe
ligado em produção.** No frontend há a constante equivalente no topo de
`App.jsx`.

### Rodando local

```bash
cd backend  && npm install && node index.js   # porta 3001
cd frontend && npm install && npm run dev
```

### Validação de horário

A janela é conferida **no navegador e no servidor**. Antes, só o navegador
validava — dava para registrar ponto fora de hora chamando a API direto.

### Endpoints de cronograma

Públicos:

- `GET /api/cronograma` — turmas ativas (alimenta o seletor do login)
- `GET /api/cronograma/:turma` — calendário, janelas e próximas aulas

Admin (exigem token de administrador):

- `GET /api/admin/turmas`
- `PUT /api/admin/turmas/:id` — dias da semana, horários, ativa/inativa
- `GET /api/admin/calendario/:turmaId`
- `POST /api/admin/calendario` — adicionar data
- `PATCH /api/admin/calendario/:id` — editar data, tema ou cancelar
- `DELETE /api/admin/calendario/:id` — remover data
- `POST /api/admin/calendario/gerar` — gerar um período em lote

### Testes

```bash
cd backend && node teste-cronograma.cjs
```

Sobe o servidor com um Supabase falso em memória e roda 33 verificações das
rotas de cronograma e do check-in. Não toca no banco real.
