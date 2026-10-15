"""Função da Vercel: recebe todo /api/... e entrega ao mesmo código do servidor.py (pelo wsgi.py).

O vercel.json manda /api/cadastro para /api/index?rota=cadastro; aqui o caminho original é refeito.
"""

import sys
from pathlib import Path
from urllib.parse import parse_qs

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from wsgi import application  # noqa: E402


def app(environ, start_response):
    rota = parse_qs(environ.get('QUERY_STRING', '')).get('rota')
    if environ.get('PATH_INFO', '').startswith('/api/index') and rota:
        environ['PATH_INFO'] = '/api/' + rota[0]
        environ['QUERY_STRING'] = ''
        environ.pop('REQUEST_URI', None)
    return application(environ, start_response)
