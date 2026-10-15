-- Banco de dados da LUX no Postgres (Neon, usado pela Vercel)
-- Mesmas tabelas do schema.sql; criado automaticamente pelo servidor.py quando DATABASE_URL existe.
-- Datas ficam em texto UTC 'AAAA-MM-DD HH:MM:SS', igual ao SQLite.

CREATE TABLE IF NOT EXISTS usuarios (
    id          SERIAL  PRIMARY KEY,
    nome        TEXT    NOT NULL,
    email       TEXT    NOT NULL UNIQUE,
    telefone    TEXT,
    senha_hash  TEXT    NOT NULL,
    admin       INTEGER NOT NULL DEFAULT 0,  -- 1 = pode abrir o painel admin.html
    criado_em   TEXT    NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS sessoes (
    token_hash  TEXT    PRIMARY KEY,
    usuario_id  INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
    expira_em   TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS pedidos (
    id          SERIAL  PRIMARY KEY,
    usuario_id  INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
    servico     TEXT    NOT NULL CHECK (servico IN ('Criação de sites', 'Correção de erros', 'Programação em geral')),
    titulo      TEXT    NOT NULL,
    descricao   TEXT    NOT NULL,
    status      TEXT    NOT NULL DEFAULT 'Recebido'
                CHECK (status IN ('Recebido', 'Em andamento', 'Concluído', 'Cancelado')),
    criado_em   TEXT    NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS mensagens (
    id          SERIAL  PRIMARY KEY,
    nome        TEXT    NOT NULL,
    email       TEXT    NOT NULL,
    servico     TEXT    NOT NULL,
    mensagem    TEXT    NOT NULL,
    enviado     INTEGER NOT NULL DEFAULT 0,  -- 1 = o e-mail chegou ao Gmail da LUX
    criado_em   TEXT    NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
);

CREATE INDEX IF NOT EXISTS idx_pedidos_usuario ON pedidos (usuario_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_usuario ON sessoes (usuario_id);
