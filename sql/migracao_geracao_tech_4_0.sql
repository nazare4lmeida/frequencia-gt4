BEGIN;

CREATE TABLE IF NOT EXISTS public.alunos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            text,
  email           text NOT NULL UNIQUE,
  data_nascimento date,
  formacao        text,
  avatar          text,
  criado_em       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.presencas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_email    text NOT NULL,
  data           date NOT NULL,
  check_in       timestamp,
  check_out      timestamp,
  feedback_nota  smallint,
  feedback_texto text,
  criado_em      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.alunos ADD COLUMN IF NOT EXISTS avatar   text;
ALTER TABLE public.alunos ADD COLUMN IF NOT EXISTS formacao text;

ALTER TABLE public.presencas ADD COLUMN IF NOT EXISTS checkin_local_valido boolean DEFAULT true;
ALTER TABLE public.presencas ADD COLUMN IF NOT EXISTS feedback_nota        smallint;
ALTER TABLE public.presencas ADD COLUMN IF NOT EXISTS feedback_texto       text;

ALTER TABLE public.presencas ALTER COLUMN checkin_local_valido SET DEFAULT true;

CREATE INDEX IF NOT EXISTS presencas_data_idx     ON public.presencas (data);
CREATE INDEX IF NOT EXISTS presencas_aluno_idx    ON public.presencas (aluno_email);
CREATE INDEX IF NOT EXISTS alunos_formacao_idx    ON public.alunos (formacao);
CREATE INDEX IF NOT EXISTS alunos_email_lower_idx ON public.alunos (lower(email));

DO $BLOCO$
BEGIN
  BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS presencas_aluno_data_unica
      ON public.presencas (aluno_email, data);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Indice unico nao criado: ha presencas duplicadas em (aluno_email, data). O resto do script seguiu normalmente.';
  END;
END
$BLOCO$;

CREATE TABLE IF NOT EXISTS public.turmas (
  id              text PRIMARY KEY,
  nome            text NOT NULL,
  curso           text NOT NULL,
  modalidade      text NOT NULL CHECK (modalidade IN ('online','presencial')),
  turno           text NOT NULL CHECK (turno IN ('manha','tarde','noite')),
  dias_semana     smallint[] NOT NULL,
  checkin_inicio  time NOT NULL,
  checkin_fim     time NOT NULL,
  checkout_inicio time NOT NULL,
  checkout_fim    time NOT NULL,
  aula_inicio     time NOT NULL,
  aula_fim        time NOT NULL,
  ativa           boolean NOT NULL DEFAULT true,
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.turmas ADD COLUMN IF NOT EXISTS ativa         boolean NOT NULL DEFAULT true;
ALTER TABLE public.turmas ADD COLUMN IF NOT EXISTS atualizado_em timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.turmas DROP CONSTRAINT IF EXISTS turmas_janelas_coerentes;
ALTER TABLE public.turmas
  ADD CONSTRAINT turmas_janelas_coerentes CHECK (
    checkin_inicio  <= checkin_fim  AND
    checkout_inicio <= checkout_fim AND
    aula_inicio     <= aula_fim
  );

ALTER TABLE public.turmas DROP CONSTRAINT IF EXISTS turmas_dias_validos;
ALTER TABLE public.turmas
  ADD CONSTRAINT turmas_dias_validos CHECK (
    array_length(dias_semana, 1) >= 1
    AND dias_semana <@ ARRAY[0,1,2,3,4,5,6]::smallint[]
  );

INSERT INTO public.turmas
  (id, nome, curso, modalidade, turno, dias_semana,
   checkin_inicio, checkin_fim, checkout_inicio, checkout_fim, aula_inicio, aula_fim)
VALUES
  ('fullstack_online','Full Stack — Online (seg, 18h às 22h)','fullstack','online','noite',ARRAY[1]::smallint[],'18:00','20:30','21:30','22:30','18:00','22:00'),
  ('fullstack_pres_manha','Full Stack — Presencial manhã (seg a sex, 8h às 12h)','fullstack','presencial','manha',ARRAY[1,2,3,4,5]::smallint[],'08:00','10:30','11:30','12:30','08:00','12:00'),
  ('fullstack_pres_tarde','Full Stack — Presencial tarde (seg a sex, 13h às 17h)','fullstack','presencial','tarde',ARRAY[1,2,3,4,5]::smallint[],'13:00','15:30','16:30','17:30','13:00','17:00'),
  ('ia_online','IA Generativa — Online (seg, 18h às 22h)','ia','online','noite',ARRAY[1]::smallint[],'18:00','20:30','21:30','22:30','18:00','22:00'),
  ('ia_pres_manha','IA Generativa — Presencial manhã (3x/semana, 8h às 12h)','ia','presencial','manha',ARRAY[1,3,5]::smallint[],'08:00','10:30','11:30','12:30','08:00','12:00'),
  ('ia_pres_tarde','IA Generativa — Presencial tarde (3x/semana, 13h às 17h)','ia','presencial','tarde',ARRAY[1,3,5]::smallint[],'13:00','15:30','16:30','17:30','13:00','17:00'),
  ('fullcycle_online','FullCycle — Online (seg, 18h às 22h)','fullcycle','online','noite',ARRAY[1]::smallint[],'18:00','20:30','21:30','22:30','18:00','22:00'),
  ('fullcycle_pres_noite','FullCycle — Presencial noite (3x/semana, 18h às 22h)','fullcycle','presencial','noite',ARRAY[1,3,5]::smallint[],'18:00','20:30','21:30','22:30','18:00','22:00')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.calendario_aulas (
  id        bigserial PRIMARY KEY,
  turma_id  text NOT NULL REFERENCES public.turmas(id) ON DELETE CASCADE,
  data      date NOT NULL,
  tema      text,
  cancelada boolean NOT NULL DEFAULT false,
  UNIQUE (turma_id, data)
);

ALTER TABLE public.calendario_aulas ADD COLUMN IF NOT EXISTS tema      text;
ALTER TABLE public.calendario_aulas ADD COLUMN IF NOT EXISTS cancelada boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS calendario_aulas_data_idx  ON public.calendario_aulas (data);
CREATE INDEX IF NOT EXISTS calendario_aulas_turma_idx ON public.calendario_aulas (turma_id);

INSERT INTO public.calendario_aulas (turma_id, data)
VALUES
  ('fullstack_online',DATE '2026-09-08'),
  ('fullstack_online',DATE '2026-09-14'),
  ('fullstack_online',DATE '2026-09-21'),
  ('fullstack_online',DATE '2026-09-28'),
  ('fullstack_online',DATE '2026-10-05'),
  ('fullstack_online',DATE '2026-10-19'),
  ('fullstack_online',DATE '2026-10-26'),
  ('fullstack_online',DATE '2026-11-09'),
  ('fullstack_online',DATE '2026-11-16'),
  ('fullstack_pres_manha',DATE '2026-09-08'),
  ('fullstack_pres_manha',DATE '2026-09-09'),
  ('fullstack_pres_manha',DATE '2026-09-10'),
  ('fullstack_pres_manha',DATE '2026-09-11'),
  ('fullstack_pres_manha',DATE '2026-09-14'),
  ('fullstack_pres_manha',DATE '2026-09-15'),
  ('fullstack_pres_manha',DATE '2026-09-16'),
  ('fullstack_pres_manha',DATE '2026-09-17'),
  ('fullstack_pres_manha',DATE '2026-09-18'),
  ('fullstack_pres_manha',DATE '2026-09-21'),
  ('fullstack_pres_manha',DATE '2026-09-22'),
  ('fullstack_pres_manha',DATE '2026-09-23'),
  ('fullstack_pres_manha',DATE '2026-09-24'),
  ('fullstack_pres_manha',DATE '2026-09-25'),
  ('fullstack_pres_manha',DATE '2026-09-28'),
  ('fullstack_pres_manha',DATE '2026-09-29'),
  ('fullstack_pres_manha',DATE '2026-09-30'),
  ('fullstack_pres_manha',DATE '2026-10-01'),
  ('fullstack_pres_manha',DATE '2026-10-02'),
  ('fullstack_pres_manha',DATE '2026-10-05'),
  ('fullstack_pres_manha',DATE '2026-10-06'),
  ('fullstack_pres_manha',DATE '2026-10-07'),
  ('fullstack_pres_manha',DATE '2026-10-08'),
  ('fullstack_pres_manha',DATE '2026-10-09'),
  ('fullstack_pres_manha',DATE '2026-10-13'),
  ('fullstack_pres_manha',DATE '2026-10-14'),
  ('fullstack_pres_manha',DATE '2026-10-15'),
  ('fullstack_pres_manha',DATE '2026-10-16'),
  ('fullstack_pres_manha',DATE '2026-10-19'),
  ('fullstack_pres_manha',DATE '2026-10-20'),
  ('fullstack_pres_manha',DATE '2026-10-21'),
  ('fullstack_pres_manha',DATE '2026-10-22'),
  ('fullstack_pres_manha',DATE '2026-10-23'),
  ('fullstack_pres_manha',DATE '2026-10-26'),
  ('fullstack_pres_manha',DATE '2026-10-27'),
  ('fullstack_pres_manha',DATE '2026-10-28'),
  ('fullstack_pres_manha',DATE '2026-10-29'),
  ('fullstack_pres_manha',DATE '2026-10-30'),
  ('fullstack_pres_manha',DATE '2026-11-03'),
  ('fullstack_pres_manha',DATE '2026-11-04'),
  ('fullstack_pres_manha',DATE '2026-11-05'),
  ('fullstack_pres_manha',DATE '2026-11-06'),
  ('fullstack_pres_manha',DATE '2026-11-09'),
  ('fullstack_pres_manha',DATE '2026-11-10'),
  ('fullstack_pres_manha',DATE '2026-11-11'),
  ('fullstack_pres_manha',DATE '2026-11-12'),
  ('fullstack_pres_manha',DATE '2026-11-13'),
  ('fullstack_pres_manha',DATE '2026-11-16'),
  ('fullstack_pres_manha',DATE '2026-11-17'),
  ('fullstack_pres_manha',DATE '2026-11-18'),
  ('fullstack_pres_manha',DATE '2026-11-19'),
  ('fullstack_pres_tarde',DATE '2026-09-08'),
  ('fullstack_pres_tarde',DATE '2026-09-09'),
  ('fullstack_pres_tarde',DATE '2026-09-10'),
  ('fullstack_pres_tarde',DATE '2026-09-11'),
  ('fullstack_pres_tarde',DATE '2026-09-14'),
  ('fullstack_pres_tarde',DATE '2026-09-15'),
  ('fullstack_pres_tarde',DATE '2026-09-16'),
  ('fullstack_pres_tarde',DATE '2026-09-17'),
  ('fullstack_pres_tarde',DATE '2026-09-18'),
  ('fullstack_pres_tarde',DATE '2026-09-21'),
  ('fullstack_pres_tarde',DATE '2026-09-22'),
  ('fullstack_pres_tarde',DATE '2026-09-23'),
  ('fullstack_pres_tarde',DATE '2026-09-24'),
  ('fullstack_pres_tarde',DATE '2026-09-25'),
  ('fullstack_pres_tarde',DATE '2026-09-28'),
  ('fullstack_pres_tarde',DATE '2026-09-29'),
  ('fullstack_pres_tarde',DATE '2026-09-30'),
  ('fullstack_pres_tarde',DATE '2026-10-01'),
  ('fullstack_pres_tarde',DATE '2026-10-02'),
  ('fullstack_pres_tarde',DATE '2026-10-05'),
  ('fullstack_pres_tarde',DATE '2026-10-06'),
  ('fullstack_pres_tarde',DATE '2026-10-07'),
  ('fullstack_pres_tarde',DATE '2026-10-08'),
  ('fullstack_pres_tarde',DATE '2026-10-09'),
  ('fullstack_pres_tarde',DATE '2026-10-13'),
  ('fullstack_pres_tarde',DATE '2026-10-14'),
  ('fullstack_pres_tarde',DATE '2026-10-15'),
  ('fullstack_pres_tarde',DATE '2026-10-16'),
  ('fullstack_pres_tarde',DATE '2026-10-19'),
  ('fullstack_pres_tarde',DATE '2026-10-20'),
  ('fullstack_pres_tarde',DATE '2026-10-21'),
  ('fullstack_pres_tarde',DATE '2026-10-22'),
  ('fullstack_pres_tarde',DATE '2026-10-23'),
  ('fullstack_pres_tarde',DATE '2026-10-26'),
  ('fullstack_pres_tarde',DATE '2026-10-27'),
  ('fullstack_pres_tarde',DATE '2026-10-28'),
  ('fullstack_pres_tarde',DATE '2026-10-29'),
  ('fullstack_pres_tarde',DATE '2026-10-30'),
  ('fullstack_pres_tarde',DATE '2026-11-03'),
  ('fullstack_pres_tarde',DATE '2026-11-04'),
  ('fullstack_pres_tarde',DATE '2026-11-05'),
  ('fullstack_pres_tarde',DATE '2026-11-06'),
  ('fullstack_pres_tarde',DATE '2026-11-09'),
  ('fullstack_pres_tarde',DATE '2026-11-10'),
  ('fullstack_pres_tarde',DATE '2026-11-11'),
  ('fullstack_pres_tarde',DATE '2026-11-12'),
  ('fullstack_pres_tarde',DATE '2026-11-13'),
  ('fullstack_pres_tarde',DATE '2026-11-16'),
  ('fullstack_pres_tarde',DATE '2026-11-17'),
  ('fullstack_pres_tarde',DATE '2026-11-18'),
  ('fullstack_pres_tarde',DATE '2026-11-19'),
  ('ia_online',DATE '2026-09-08'),
  ('ia_online',DATE '2026-09-14'),
  ('ia_online',DATE '2026-09-21'),
  ('ia_online',DATE '2026-09-28'),
  ('ia_online',DATE '2026-10-05'),
  ('ia_online',DATE '2026-10-19'),
  ('ia_online',DATE '2026-10-26'),
  ('ia_online',DATE '2026-11-09'),
  ('ia_online',DATE '2026-11-16'),
  ('ia_pres_manha',DATE '2026-09-08'),
  ('ia_pres_manha',DATE '2026-09-09'),
  ('ia_pres_manha',DATE '2026-09-11'),
  ('ia_pres_manha',DATE '2026-09-14'),
  ('ia_pres_manha',DATE '2026-09-16'),
  ('ia_pres_manha',DATE '2026-09-18'),
  ('ia_pres_manha',DATE '2026-09-21'),
  ('ia_pres_manha',DATE '2026-09-23'),
  ('ia_pres_manha',DATE '2026-09-25'),
  ('ia_pres_manha',DATE '2026-09-28'),
  ('ia_pres_manha',DATE '2026-09-30'),
  ('ia_pres_manha',DATE '2026-10-02'),
  ('ia_pres_manha',DATE '2026-10-05'),
  ('ia_pres_manha',DATE '2026-10-07'),
  ('ia_pres_manha',DATE '2026-10-09'),
  ('ia_pres_manha',DATE '2026-10-14'),
  ('ia_pres_manha',DATE '2026-10-16'),
  ('ia_pres_manha',DATE '2026-10-19'),
  ('ia_pres_manha',DATE '2026-10-21'),
  ('ia_pres_manha',DATE '2026-10-23'),
  ('ia_pres_manha',DATE '2026-10-26'),
  ('ia_pres_manha',DATE '2026-10-28'),
  ('ia_pres_manha',DATE '2026-10-30'),
  ('ia_pres_manha',DATE '2026-11-04'),
  ('ia_pres_manha',DATE '2026-11-06'),
  ('ia_pres_manha',DATE '2026-11-09'),
  ('ia_pres_manha',DATE '2026-11-11'),
  ('ia_pres_manha',DATE '2026-11-13'),
  ('ia_pres_manha',DATE '2026-11-16'),
  ('ia_pres_manha',DATE '2026-11-18'),
  ('ia_pres_tarde',DATE '2026-09-08'),
  ('ia_pres_tarde',DATE '2026-09-09'),
  ('ia_pres_tarde',DATE '2026-09-11'),
  ('ia_pres_tarde',DATE '2026-09-14'),
  ('ia_pres_tarde',DATE '2026-09-16'),
  ('ia_pres_tarde',DATE '2026-09-18'),
  ('ia_pres_tarde',DATE '2026-09-21'),
  ('ia_pres_tarde',DATE '2026-09-23'),
  ('ia_pres_tarde',DATE '2026-09-25'),
  ('ia_pres_tarde',DATE '2026-09-28'),
  ('ia_pres_tarde',DATE '2026-09-30'),
  ('ia_pres_tarde',DATE '2026-10-02'),
  ('ia_pres_tarde',DATE '2026-10-05'),
  ('ia_pres_tarde',DATE '2026-10-07'),
  ('ia_pres_tarde',DATE '2026-10-09'),
  ('ia_pres_tarde',DATE '2026-10-14'),
  ('ia_pres_tarde',DATE '2026-10-16'),
  ('ia_pres_tarde',DATE '2026-10-19'),
  ('ia_pres_tarde',DATE '2026-10-21'),
  ('ia_pres_tarde',DATE '2026-10-23'),
  ('ia_pres_tarde',DATE '2026-10-26'),
  ('ia_pres_tarde',DATE '2026-10-28'),
  ('ia_pres_tarde',DATE '2026-10-30'),
  ('ia_pres_tarde',DATE '2026-11-04'),
  ('ia_pres_tarde',DATE '2026-11-06'),
  ('ia_pres_tarde',DATE '2026-11-09'),
  ('ia_pres_tarde',DATE '2026-11-11'),
  ('ia_pres_tarde',DATE '2026-11-13'),
  ('ia_pres_tarde',DATE '2026-11-16'),
  ('ia_pres_tarde',DATE '2026-11-18'),
  ('fullcycle_online',DATE '2026-09-08'),
  ('fullcycle_online',DATE '2026-09-14'),
  ('fullcycle_online',DATE '2026-09-21'),
  ('fullcycle_online',DATE '2026-09-28'),
  ('fullcycle_online',DATE '2026-10-05'),
  ('fullcycle_online',DATE '2026-10-19'),
  ('fullcycle_online',DATE '2026-10-26'),
  ('fullcycle_online',DATE '2026-11-09'),
  ('fullcycle_online',DATE '2026-11-16'),
  ('fullcycle_pres_noite',DATE '2026-09-08'),
  ('fullcycle_pres_noite',DATE '2026-09-09'),
  ('fullcycle_pres_noite',DATE '2026-09-11'),
  ('fullcycle_pres_noite',DATE '2026-09-14'),
  ('fullcycle_pres_noite',DATE '2026-09-16'),
  ('fullcycle_pres_noite',DATE '2026-09-18'),
  ('fullcycle_pres_noite',DATE '2026-09-21'),
  ('fullcycle_pres_noite',DATE '2026-09-23'),
  ('fullcycle_pres_noite',DATE '2026-09-25'),
  ('fullcycle_pres_noite',DATE '2026-09-28'),
  ('fullcycle_pres_noite',DATE '2026-09-30'),
  ('fullcycle_pres_noite',DATE '2026-10-02'),
  ('fullcycle_pres_noite',DATE '2026-10-05'),
  ('fullcycle_pres_noite',DATE '2026-10-07'),
  ('fullcycle_pres_noite',DATE '2026-10-09'),
  ('fullcycle_pres_noite',DATE '2026-10-14'),
  ('fullcycle_pres_noite',DATE '2026-10-16'),
  ('fullcycle_pres_noite',DATE '2026-10-19'),
  ('fullcycle_pres_noite',DATE '2026-10-21'),
  ('fullcycle_pres_noite',DATE '2026-10-23'),
  ('fullcycle_pres_noite',DATE '2026-10-26'),
  ('fullcycle_pres_noite',DATE '2026-10-28'),
  ('fullcycle_pres_noite',DATE '2026-10-30'),
  ('fullcycle_pres_noite',DATE '2026-11-04'),
  ('fullcycle_pres_noite',DATE '2026-11-06'),
  ('fullcycle_pres_noite',DATE '2026-11-09'),
  ('fullcycle_pres_noite',DATE '2026-11-11'),
  ('fullcycle_pres_noite',DATE '2026-11-13'),
  ('fullcycle_pres_noite',DATE '2026-11-16'),
  ('fullcycle_pres_noite',DATE '2026-11-18')
ON CONFLICT (turma_id, data) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.configuracoes (
  chave         text PRIMARY KEY,
  valor         text NOT NULL,
  descricao     text,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.configuracoes (chave, valor, descricao) VALUES
  ('janela_ponto', 'WINDOW_CLOSE', 'WINDOW_CLOSE exige dia e horario da aula. WINDOW_OPEN libera o ponto a qualquer dia e hora, para teste.'),
  ('exigir_localizacao', 'false', 'true exige GPS no check-in presencial. false desliga, pois as aulas acontecem em 3 sedes.')
ON CONFLICT (chave) DO NOTHING;

CREATE OR REPLACE FUNCTION public.turma_existe(p_formacao text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $FUNC$
  SELECT p_formacao IS NULL
      OR EXISTS (SELECT 1 FROM public.turmas WHERE id = p_formacao);
$FUNC$;

UPDATE public.alunos
   SET formacao = NULL
 WHERE formacao IS NOT NULL
   AND NOT public.turma_existe(formacao);

ALTER TABLE public.alunos DROP CONSTRAINT IF EXISTS alunos_formacao_valida;
ALTER TABLE public.alunos
  ADD CONSTRAINT alunos_formacao_valida
  CHECK (public.turma_existe(formacao));

UPDATE public.presencas
   SET checkin_local_valido = true
 WHERE checkin_local_valido IS DISTINCT FROM true;

DO $BLOCO$
DECLARE
  nome_coluna text;
BEGIN
  FOREACH nome_coluna IN ARRAY ARRAY['checkin_latitude','checkin_longitude','checkin_distancia_metros']
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name   = 'presencas'
         AND column_name  = nome_coluna
    ) THEN
      EXECUTE 'ALTER TABLE public.presencas DROP COLUMN ' || quote_ident(nome_coluna);
    END IF;
  END LOOP;
END
$BLOCO$;

COMMIT;
