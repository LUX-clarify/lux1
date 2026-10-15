"""Ponte WSGI: roda o servidor.py em hospedagens como o PythonAnywhere.

Cada requisição é entregue ao mesmo código do servidor.py (classe Lux),
então páginas, cadastro, pedidos, contato e painel funcionam igual ao computador.
"""

import io
from urllib.parse import quote

import servidor

servidor.criar_banco()

# cabeçalhos de conexão são do servidor da hospedagem, não da aplicação (regra do WSGI)
CABECALHOS_DE_CONEXAO = {'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
                         'te', 'trailers', 'transfer-encoding', 'upgrade'}


class LuxWsgi(servidor.Lux):
    """A Lux lendo a requisição de um buffer em vez de um socket."""

    def __init__(self, requisicao, endereco):
        self.requisicao = requisicao
        super().__init__(None, endereco, None)

    def setup(self):
        self.rfile = io.BytesIO(self.requisicao)
        self.wfile = io.BytesIO()

    def finish(self):
        pass


def application(environ, start_response):
    caminho = environ.get('REQUEST_URI') or (
        quote(environ.get('PATH_INFO', '/').encode('latin-1'))
        + ('?' + environ['QUERY_STRING'] if environ.get('QUERY_STRING') else '')
    )
    cabecalhos = [f"{chave[5:].replace('_', '-').title()}: {valor}"
                  for chave, valor in environ.items() if chave.startswith('HTTP_')]
    if environ.get('CONTENT_TYPE'):
        cabecalhos.append(f"Content-Type: {environ['CONTENT_TYPE']}")
    tamanho = int(environ.get('CONTENT_LENGTH') or 0)
    corpo = environ['wsgi.input'].read(tamanho) if tamanho else b''
    if tamanho:
        cabecalhos.append(f'Content-Length: {len(corpo)}')

    linhas = [f"{environ['REQUEST_METHOD']} {caminho} HTTP/1.0", *cabecalhos, '', '']
    requisicao = '\r\n'.join(linhas).encode('latin-1') + corpo
    resposta = LuxWsgi(requisicao, (environ.get('REMOTE_ADDR', ''), 0)).wfile.getvalue()

    topo, _, conteudo = resposta.partition(b'\r\n\r\n')
    linha_status, *linhas_cabecalho = topo.decode('latin-1').split('\r\n')
    status = linha_status.split(' ', 1)[1]
    # na Vercel o HTTPS termina antes da função, que fica sabendo pelo X-Forwarded-Proto
    https = 'https' in (environ.get('wsgi.url_scheme'), environ.get('HTTP_X_FORWARDED_PROTO'))
    saida = []
    for linha in linhas_cabecalho:
        nome, _, valor = linha.partition(': ')
        if nome.lower() in CABECALHOS_DE_CONEXAO:
            continue
        # em HTTPS o cookie de sessão só viaja criptografado
        if https and nome.lower() == 'set-cookie':
            valor += '; Secure'
        saida.append((nome, valor))
    start_response(status, saida)
    return [conteudo]
