"""Servidor da LUX: entrega as páginas do site e a API de cadastro e pedidos.

Usa só a biblioteca padrão do Python (sem instalar nada) e um banco SQLite.
Para rodar:  python servidor.py   e abra  http://localhost:8000
"""

import hashlib
import hmac
import json
import os
import re
import secrets
import smtplib
import sqlite3
import sys
import traceback
from contextlib import contextmanager
from email.message import EmailMessage
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

PASTA = Path(__file__).resolve().parent
# avisos aparecem na hora também quando a saída vai para um log (hospedagens)
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(line_buffering=True)

# o arquivo .env (fora do git) guarda a senha de app do Gmail: LUX_EMAIL_SENHA=xxxx xxxx xxxx xxxx
if (PASTA / '.env').exists():
    # utf-8-sig: o Bloco de Notas às vezes grava um BOM invisível no começo do arquivo
    for linha in (PASTA / '.env').read_text(encoding='utf-8-sig').splitlines():
        chave, igual, valor = linha.partition('=')
        if igual and not linha.lstrip().startswith('#'):
            os.environ.setdefault(chave.strip().upper(), valor.strip().strip('"\''))

# LUX_BANCO e LUX_PORTA permitem rodar testes sem tocar no banco de verdade
BANCO = Path(os.environ.get('LUX_BANCO', PASTA / 'lux.db'))
# hospedagens (Render, Railway...) informam a porta em PORT e precisam ouvir em todas as interfaces
PORTA = int(os.environ.get('PORT') or os.environ.get('LUX_PORTA') or 8000)
HOST = os.environ.get('LUX_HOST', '0.0.0.0' if os.environ.get('PORT') else '127.0.0.1')
EMAIL_DESTINO = os.environ.get('LUX_EMAIL_DESTINO', 'lux.provisionofservices@gmail.com')
EMAIL_USUARIO = (os.environ.get('LUX_EMAIL_USUARIO') or os.environ.get('EMAIL') or EMAIL_DESTINO).strip()
EMAIL_SENHA = (os.environ.get('LUX_EMAIL_SENHA') or os.environ.get('SENHA') or '').replace(' ', '')
COOKIE = 'lux_sessao'
DIAS_SESSAO = 7
SERVICOS = ('Criação de sites', 'Correção de erros', 'Programação em geral')
STATUS = ('Recebido', 'Em andamento', 'Concluído', 'Cancelado')
EMAIL_VALIDO = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')


# ===== Banco de dados =====
@contextmanager
def banco():
    con = sqlite3.connect(BANCO)
    con.row_factory = sqlite3.Row
    con.execute('PRAGMA foreign_keys = ON')
    try:
        yield con
        con.commit()
    finally:
        con.close()


def criar_banco():
    with banco() as con:
        con.executescript((PASTA / 'schema.sql').read_text(encoding='utf-8'))
        # bancos criados antes do painel de administrador não têm a coluna "admin"
        colunas = [linha['name'] for linha in con.execute('PRAGMA table_info(usuarios)')]
        if 'admin' not in colunas:
            con.execute('ALTER TABLE usuarios ADD COLUMN admin INTEGER NOT NULL DEFAULT 0')


def tornar_admin(email):
    with banco() as con:
        alterados = con.execute('UPDATE usuarios SET admin = 1 WHERE email = ?', (email.strip().lower(),)).rowcount
    if alterados:
        print(f'Pronto! {email} agora é administrador. Entre no site e abra /admin.html')
    else:
        print(f'Nenhuma conta com o e-mail {email}. Crie a conta no site primeiro.')


# ===== E-mail =====
COMO_CRIAR_SENHA = ('Crie uma SENHA DE APP (16 letras) em https://myaccount.google.com/apppasswords '
                    '(precisa da verificação em duas etapas ligada) e coloque no .env: LUX_EMAIL_SENHA=abcd efgh ijkl mnop')


def problema_na_senha():
    """Explica o que há de errado com a senha do .env, ou devolve None se parece certa."""
    if not EMAIL_SENHA:
        return 'Falta a senha do Gmail no arquivo .env.'
    # o Google só aceita senha de app: sempre 16 letras minúsculas, nunca a senha normal da conta
    if not re.fullmatch(r'[a-zA-Z]{16}', EMAIL_SENHA):
        return ('A senha no .env não é uma senha de app do Google (ela tem sempre 16 letras). '
                'A senha normal da conta não funciona.')
    return None


def enviar_email(assunto, corpo, responder_para=None):
    """Envia para EMAIL_DESTINO pelo Gmail. Devolve True se o e-mail saiu."""
    problema = problema_na_senha()
    if problema:
        print(f'E-MAIL NÃO ENVIADO: {problema} {COMO_CRIAR_SENHA}')
        return False
    mensagem = EmailMessage()
    mensagem['Subject'] = assunto
    mensagem['From'] = f'Site LUX <{EMAIL_USUARIO}>'
    mensagem['To'] = EMAIL_DESTINO
    if responder_para:
        mensagem['Reply-To'] = responder_para
    mensagem.set_content(corpo)
    try:
        with smtplib.SMTP_SSL('smtp.gmail.com', 465, timeout=20) as smtp:
            smtp.login(EMAIL_USUARIO, EMAIL_SENHA)
            smtp.send_message(mensagem)
        return True
    except smtplib.SMTPAuthenticationError:
        print(f'E-MAIL NÃO ENVIADO: o Gmail recusou o e-mail/senha de {EMAIL_USUARIO}. {COMO_CRIAR_SENHA}')
    except smtplib.SMTPServerDisconnected:
        print('E-MAIL NÃO ENVIADO: o Gmail fechou a conexão no login. Isso acontece com senha que não é '
              'senha de app ou depois de muitas tentativas erradas (espere alguns minutos). ' + COMO_CRIAR_SENHA)
    except OSError as erro:
        print(f'E-MAIL NÃO ENVIADO: sem conexão com o Gmail ({erro}). Verifique a internet.')
    except Exception:
        traceback.print_exc()
    return False


# ===== Senhas e sessões =====
def gerar_hash_senha(senha):
    sal = secrets.token_bytes(16)
    resumo = hashlib.pbkdf2_hmac('sha256', senha.encode(), sal, 200_000)
    return f'{sal.hex()}${resumo.hex()}'


def senha_confere(senha, guardado):
    sal, resumo = guardado.split('$')
    tentativa = hashlib.pbkdf2_hmac('sha256', senha.encode(), bytes.fromhex(sal), 200_000)
    return hmac.compare_digest(tentativa.hex(), resumo)


def hash_token(token):
    return hashlib.sha256(token.encode()).hexdigest()


def criar_sessao(con, usuario_id):
    token = secrets.token_urlsafe(32)
    con.execute(
        "INSERT INTO sessoes (token_hash, usuario_id, expira_em) VALUES (?, ?, datetime('now', ?))",
        (hash_token(token), usuario_id, f'+{DIAS_SESSAO} days'),
    )
    return f'{COOKIE}={token}; HttpOnly; SameSite=Lax; Path=/; Max-Age={DIAS_SESSAO * 86400}'


def usuario_publico(linha):
    return {'id': linha['id'], 'nome': linha['nome'], 'email': linha['email'],
            'telefone': linha['telefone'], 'admin': bool(linha['admin'])}


def texto(dados, campo):
    valor = dados.get(campo, '')
    return valor.strip() if isinstance(valor, str) else ''


class ErroApi(Exception):
    def __init__(self, status, mensagem):
        super().__init__(mensagem)
        self.status = status
        self.mensagem = mensagem


# ===== Servidor =====
class Lux(SimpleHTTPRequestHandler):
    ROTAS = {
        ('POST', '/api/cadastro'): 'cadastro',
        ('POST', '/api/login'): 'login',
        ('POST', '/api/sair'): 'sair',
        ('GET', '/api/eu'): 'eu',
        ('GET', '/api/pedidos'): 'listar_pedidos',
        ('POST', '/api/pedidos'): 'criar_pedido',
        ('POST', '/api/contato'): 'contato',
        ('GET', '/api/admin'): 'admin_dados',
        ('POST', '/api/admin/status'): 'admin_status',
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PASTA), **kwargs)

    # --- arquivos do site (o banco e o código nunca são entregues) ---
    def arquivo_proibido(self):
        caminho = unquote(urlsplit(self.path).path).lower()
        return '.db' in caminho or caminho.endswith(('.py', '.sql', '.bat')) or '/.' in caminho

    def do_GET(self):
        if self.path.startswith('/api/'):
            return self.responder_api('GET')
        if self.arquivo_proibido():
            return self.send_error(404)
        super().do_GET()

    def do_HEAD(self):
        if self.path.startswith('/api/') or self.arquivo_proibido():
            return self.send_error(404)
        super().do_HEAD()

    def do_POST(self):
        self.responder_api('POST')

    # --- API ---
    def responder_api(self, metodo):
        acao = self.ROTAS.get((metodo, urlsplit(self.path).path))
        try:
            if not acao:
                raise ErroApi(404, 'Rota não encontrada.')
            dados = self.ler_json() if metodo == 'POST' else {}
            with banco() as con:
                status, corpo, cookie = getattr(self, 'api_' + acao)(con, dados)
        except ErroApi as erro:
            status, corpo, cookie = erro.status, {'erro': erro.mensagem}, None
        except Exception:
            traceback.print_exc()
            status, corpo, cookie = 500, {'erro': 'Erro interno no servidor.'}, None
        self.enviar_json(status, corpo, cookie)

    def ler_json(self):
        # exigir JSON impede formulários de outros sites de enviar pedidos com o cookie
        if 'application/json' not in self.headers.get('Content-Type', ''):
            raise ErroApi(415, 'Envie os dados em JSON.')
        tamanho = int(self.headers.get('Content-Length') or 0)
        if tamanho > 20_000:
            raise ErroApi(413, 'Dados grandes demais.')
        try:
            dados = json.loads(self.rfile.read(tamanho) or b'{}')
        except ValueError:
            raise ErroApi(400, 'Dados inválidos.')
        if not isinstance(dados, dict):
            raise ErroApi(400, 'Dados inválidos.')
        return dados

    def enviar_json(self, status, corpo, cookie=None):
        conteudo = json.dumps(corpo, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(conteudo)))
        self.send_header('Cache-Control', 'no-store')
        if cookie:
            self.send_header('Set-Cookie', cookie)
        self.end_headers()
        self.wfile.write(conteudo)

    def token(self):
        cookies = SimpleCookie(self.headers.get('Cookie', ''))
        return cookies[COOKIE].value if COOKIE in cookies else None

    def usuario_atual(self, con):
        token = self.token()
        return token and con.execute(
            """SELECT u.* FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
               WHERE s.token_hash = ? AND s.expira_em > datetime('now')""",
            (hash_token(token),),
        ).fetchone()

    def usuario(self, con):
        linha = self.usuario_atual(con)
        if not linha:
            raise ErroApi(401, 'Entre na sua conta para continuar.')
        return linha

    # --- rotas ---
    def api_cadastro(self, con, dados):
        nome, email = texto(dados, 'nome'), texto(dados, 'email').lower()
        telefone, senha = texto(dados, 'telefone'), dados.get('senha', '')
        if not 2 <= len(nome) <= 100:
            raise ErroApi(400, 'Informe o seu nome.')
        if not EMAIL_VALIDO.match(email) or len(email) > 200:
            raise ErroApi(400, 'Informe um e-mail válido.')
        if len(telefone) > 30:
            raise ErroApi(400, 'Telefone inválido.')
        if not isinstance(senha, str) or not 8 <= len(senha) <= 200:
            raise ErroApi(400, 'A senha precisa ter pelo menos 8 caracteres.')
        try:
            cursor = con.execute(
                'INSERT INTO usuarios (nome, email, telefone, senha_hash) VALUES (?, ?, ?, ?)',
                (nome, email, telefone or None, gerar_hash_senha(senha)),
            )
        except sqlite3.IntegrityError:
            raise ErroApi(409, 'Este e-mail já está cadastrado. Tente entrar.')
        linha = con.execute('SELECT * FROM usuarios WHERE id = ?', (cursor.lastrowid,)).fetchone()
        return 201, usuario_publico(linha), criar_sessao(con, linha['id'])

    def api_login(self, con, dados):
        email, senha = texto(dados, 'email').lower(), dados.get('senha', '')
        linha = con.execute('SELECT * FROM usuarios WHERE email = ?', (email,)).fetchone()
        if not linha or not isinstance(senha, str) or not senha_confere(senha, linha['senha_hash']):
            raise ErroApi(401, 'E-mail ou senha incorretos.')
        con.execute("DELETE FROM sessoes WHERE expira_em <= datetime('now')")
        return 200, usuario_publico(linha), criar_sessao(con, linha['id'])

    def api_sair(self, con, dados):
        token = self.token()
        if token:
            con.execute('DELETE FROM sessoes WHERE token_hash = ?', (hash_token(token),))
        return 200, {'ok': True}, f'{COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'

    def api_eu(self, con, dados):
        # ninguém conectado não é erro: responde {"usuario": null}
        linha = self.usuario_atual(con)
        return 200, {'usuario': usuario_publico(linha) if linha else None}, None

    def api_listar_pedidos(self, con, dados):
        usuario = self.usuario(con)
        linhas = con.execute(
            'SELECT id, servico, titulo, descricao, status, criado_em FROM pedidos '
            'WHERE usuario_id = ? ORDER BY id DESC',
            (usuario['id'],),
        ).fetchall()
        return 200, {'pedidos': [dict(linha) for linha in linhas]}, None

    def api_criar_pedido(self, con, dados):
        usuario = self.usuario(con)
        servico, titulo, descricao = texto(dados, 'servico'), texto(dados, 'titulo'), texto(dados, 'descricao')
        if servico not in SERVICOS:
            raise ErroApi(400, 'Escolha um serviço da lista.')
        if not 3 <= len(titulo) <= 120:
            raise ErroApi(400, 'Dê um título ao pedido.')
        if not 10 <= len(descricao) <= 3000:
            raise ErroApi(400, 'Descreva o pedido com pelo menos 10 caracteres.')
        cursor = con.execute(
            'INSERT INTO pedidos (usuario_id, servico, titulo, descricao) VALUES (?, ?, ?, ?)',
            (usuario['id'], servico, titulo, descricao),
        )
        linha = con.execute(
            'SELECT id, servico, titulo, descricao, status, criado_em FROM pedidos WHERE id = ?',
            (cursor.lastrowid,),
        ).fetchone()
        return 201, {'pedido': dict(linha)}, None

    def api_contato(self, con, dados):
        # campo escondido: só robôs de spam preenchem
        if texto(dados, 'site'):
            return 201, {'ok': True}, None
        nome, email = texto(dados, 'nome'), texto(dados, 'email').lower()
        servico, mensagem = texto(dados, 'servico'), texto(dados, 'mensagem')
        if not 2 <= len(nome) <= 100:
            raise ErroApi(400, 'Informe o seu nome.')
        if not EMAIL_VALIDO.match(email) or len(email) > 200:
            raise ErroApi(400, 'Informe um e-mail válido.')
        if servico not in SERVICOS:
            servico = 'Outro'
        if not 2 <= len(mensagem) <= 5000:
            raise ErroApi(400, 'Escreva uma mensagem.')
        # o e-mail sai antes de gravar no banco para não travar o SQLite durante o envio
        enviado = enviar_email(
            f'[LUX] {servico} — {nome}',
            f'Nova mensagem pelo site da LUX\n\nNome: {nome}\nE-mail: {email}\nServiço: {servico}\n\n{mensagem}\n',
            responder_para=email,
        )
        con.execute(
            'INSERT INTO mensagens (nome, email, servico, mensagem, enviado) VALUES (?, ?, ?, ?, ?)',
            (nome, email, servico, mensagem, int(enviado)),
        )
        return 201, {'ok': True}, None

    # --- administrador ---
    def administrador(self, con):
        usuario = self.usuario(con)
        if not usuario['admin']:
            raise ErroApi(403, 'Só administradores podem ver esta página.')
        return usuario

    def api_admin_dados(self, con, dados):
        self.administrador(con)
        clientes = con.execute(
            """SELECT u.id, u.nome, u.email, u.telefone, u.admin, u.criado_em, COUNT(p.id) AS total_pedidos
               FROM usuarios u LEFT JOIN pedidos p ON p.usuario_id = u.id
               GROUP BY u.id ORDER BY u.id DESC"""
        ).fetchall()
        pedidos = con.execute(
            """SELECT p.id, p.servico, p.titulo, p.descricao, p.status, p.criado_em,
                      u.nome AS cliente, u.email AS cliente_email, u.telefone AS cliente_telefone
               FROM pedidos p JOIN usuarios u ON u.id = p.usuario_id
               ORDER BY p.id DESC"""
        ).fetchall()
        mensagens = con.execute(
            'SELECT id, nome, email, servico, mensagem, enviado, criado_em FROM mensagens ORDER BY id DESC'
        ).fetchall()
        return 200, {'clientes': [dict(c) for c in clientes], 'pedidos': [dict(p) for p in pedidos],
                     'mensagens': [dict(m) for m in mensagens], 'status': list(STATUS)}, None

    def api_admin_status(self, con, dados):
        self.administrador(con)
        status = texto(dados, 'status')
        if status not in STATUS:
            raise ErroApi(400, 'Status inválido.')
        alterados = con.execute('UPDATE pedidos SET status = ? WHERE id = ?', (status, dados.get('id'))).rowcount
        if not alterados:
            raise ErroApi(404, 'Pedido não encontrado.')
        return 200, {'ok': True}, None


if __name__ == '__main__':
    criar_banco()
    # python servidor.py --admin seu@email.com  → transforma a conta em administrador
    if len(sys.argv) >= 2 and sys.argv[1] == '--admin':
        if len(sys.argv) < 3 or not sys.argv[2].strip():
            sys.exit('Informe o e-mail: python servidor.py --admin seu@email.com')
        tornar_admin(sys.argv[2])
        sys.exit()
    # python servidor.py --testar-email  → manda um e-mail de teste para a caixa da LUX
    if len(sys.argv) >= 2 and sys.argv[1] == '--testar-email':
        if enviar_email('[LUX] Teste do site', 'Se você recebeu isto, o formulário de contato está funcionando.'):
            print(f'Pronto! E-mail de teste enviado para {EMAIL_DESTINO}.')
        sys.exit()
    problema = problema_na_senha()
    if problema:
        print(f'AVISO: {problema} As mensagens de contato ficam só no painel até corrigir.\n{COMO_CRIAR_SENHA}')
    servidor = ThreadingHTTPServer((HOST, PORTA), Lux)
    print(f'LUX rodando em http://localhost:{PORTA}  (Ctrl+C para parar)')
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print('\nServidor encerrado.')
