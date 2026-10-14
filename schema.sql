-- Banco de dados da LUX (SQLite)
-- Criado automaticamente pelo servidor.py na primeira execução.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS usuarios (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nome        TEXT    NOT NULL,
    email       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    telefone    TEXT,
    senha_hash  TEXT    NOT NULL,
    admin       INTEGER NOT NULL DEFAULT 0,  -- 1 = pode abrir o painel admin.html
    criado_em   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessoes (
    token_hash  TEXT    PRIMARY KEY,
    usuario_id  INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
    expira_em   TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS pedidos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id  INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
    servico     TEXT    NOT NULL CHECK (servico IN ('Criação de sites', 'Correção de erros', 'Programação em geral')),
    titulo      TEXT    NOT NULL,
    descricao   TEXT    NOT NULL,
    status      TEXT    NOT NULL DEFAULT 'Recebido'
                CHECK (status IN ('Recebido', 'Em andamento', 'Concluído', 'Cancelado')),
    criado_em   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pedidos_usuario ON pedidos (usuario_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_usuario ON sessoes (usuario_id);
