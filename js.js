// ===== Menu do celular =====
const menuBotao = document.querySelector('.menu-botao');
const menu = document.getElementById('menu');

if (menuBotao && menu) {
    const fecharMenu = () => {
        menu.classList.remove('aberto');
        menuBotao.setAttribute('aria-expanded', 'false');
    };

    menuBotao.addEventListener('click', () => {
        const aberto = menu.classList.toggle('aberto');
        menuBotao.setAttribute('aria-expanded', String(aberto));
    });

    document.addEventListener('keydown', (evento) => {
        if (evento.key === 'Escape' && menu.classList.contains('aberto')) {
            fecharMenu();
            menuBotao.focus();
        }
    });
}

// ===== Abas (serviços e cadastro) =====
document.querySelectorAll('[data-abas]').forEach((grupo) => {
    const abas = Array.from(grupo.querySelectorAll('[role="tab"]'));

    const selecionar = (aba, focar) => {
        abas.forEach((outra) => {
            const ativa = outra === aba;
            outra.setAttribute('aria-selected', String(ativa));
            outra.tabIndex = ativa ? 0 : -1;
            document.getElementById(outra.getAttribute('aria-controls')).hidden = !ativa;
        });
        if (focar) aba.focus();
    };

    abas.forEach((aba, indice) => {
        aba.addEventListener('click', () => selecionar(aba, false));

        // setas do teclado trocam de aba
        aba.addEventListener('keydown', (evento) => {
            let destino = null;
            if (evento.key === 'ArrowRight') destino = abas[(indice + 1) % abas.length];
            if (evento.key === 'ArrowLeft') destino = abas[(indice - 1 + abas.length) % abas.length];
            if (evento.key === 'Home') destino = abas[0];
            if (evento.key === 'End') destino = abas[abas.length - 1];
            if (destino) {
                evento.preventDefault();
                selecionar(destino, true);
            }
        });
    });

    // abre direto na aba indicada no endereço (ex.: servicos.html#aba-erros)
    const inicial = abas.find((aba) => '#' + aba.id === location.hash) || abas[0];
    selecionar(inicial, false);
});

// ===== Validação de formulários =====
const validarCampo = (campo) => {
    const valido = campo.value.trim() !== '' && campo.checkValidity();
    campo.setAttribute('aria-invalid', String(!valido));
    const erro = document.getElementById('erro-' + campo.id);
    if (erro) erro.hidden = valido;
    return valido;
};

const prepararValidacao = (formulario) => {
    const obrigatorios = Array.from(formulario.querySelectorAll('[required]'));
    obrigatorios.forEach((campo) => {
        campo.addEventListener('input', () => {
            if (campo.getAttribute('aria-invalid') === 'true') validarCampo(campo);
        });
    });

    // devolve true se tudo estiver certo; senão leva o foco ao primeiro erro
    return () => {
        const invalidos = obrigatorios.filter((campo) => !validarCampo(campo));
        if (invalidos.length) invalidos[0].focus();
        return invalidos.length === 0;
    };
};

const mostrarAviso = (formulario, mensagem, erro = false) => {
    const status = formulario.querySelector('[data-status]');
    status.textContent = mensagem ? (erro ? '⚠ ' : '✓ ') + mensagem : '';
    status.classList.toggle('aviso-erro', erro);
};

// serviço pré-selecionado quando a pessoa vem da página de serviços
const campoServico = document.getElementById('servico');
const servicoNaUrl = new URLSearchParams(location.search).get('servico');
if (campoServico && servicoNaUrl && Array.from(campoServico.options).some((opcao) => opcao.value === servicoNaUrl)) {
    campoServico.value = servicoNaUrl;
}

// ===== Conversa com o servidor (servidor.py) =====
const ENDERECO_SERVIDOR = 'http://localhost:8000';
const MSG_SEM_SERVIDOR = 'O servidor da LUX não está ligado. Dê dois cliques em "iniciar.bat" (ou rode "python servidor.py") e abra ' + ENDERECO_SERVIDOR;

// cadastro e pedidos só funcionam pelo servidor.py; aberto pelo arquivo ou pelo Live Server, avisa na hora
const avisarSemServidor = () => {
    if (document.querySelector('.faixa-aviso')) return;
    const aviso = document.createElement('div');
    aviso.className = 'faixa-aviso';
    aviso.setAttribute('role', 'alert');
    const link = document.createElement('a');
    link.href = ENDERECO_SERVIDOR + '/' + location.pathname.split('/').pop() + location.hash;
    link.textContent = ENDERECO_SERVIDOR;
    aviso.append('⚠ Esta página precisa do servidor da LUX para salvar no banco de dados. Dê dois cliques em "iniciar.bat" na pasta do site e depois abra ', link, '.');
    document.querySelector('main').prepend(aviso);
};

const api = async (caminho, dados) => {
    if (location.protocol === 'file:') {
        avisarSemServidor();
        throw new Error(MSG_SEM_SERVIDOR);
    }
    const opcoes = dados
        ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) }
        : {};
    let resposta;
    try {
        resposta = await fetch(caminho, opcoes);
    } catch {
        avisarSemServidor();
        throw new Error(MSG_SEM_SERVIDOR);
    }
    // resposta que não é JSON = não foi o servidor.py que respondeu (ex.: Live Server)
    if (!(resposta.headers.get('Content-Type') || '').includes('application/json')) {
        avisarSemServidor();
        throw new Error(MSG_SEM_SERVIDOR);
    }
    const corpo = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
        const erro = new Error(corpo.erro || 'Algo deu errado. Tente de novo.');
        erro.status = resposta.status;
        throw erro;
    }
    return corpo;
};

// formulários com data-form="/api/..." enviam os dados para o banco
const ligarFormulario = (formulario, aoConcluir) => {
    if (!formulario) return;
    const tudoValido = prepararValidacao(formulario);
    const botao = formulario.querySelector('[type="submit"]');

    formulario.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        mostrarAviso(formulario, '');
        if (!tudoValido()) return;

        botao.disabled = true;
        try {
            const resposta = await api(formulario.dataset.form, Object.fromEntries(new FormData(formulario)));
            aoConcluir(resposta, formulario);
        } catch (erro) {
            mostrarAviso(formulario, erro.message, true);
        } finally {
            botao.disabled = false;
        }
    });
};

document.querySelectorAll('[data-sair]').forEach((botao) => {
    botao.addEventListener('click', async () => {
        await api('/api/sair', {}).catch(() => {});
        // na própria página de cadastro só o # mudaria, então é preciso recarregar
        if (location.pathname.endsWith('/cadastro.html')) {
            location.hash = 'aba-entrar';
            location.reload();
        } else {
            location.href = 'cadastro.html#aba-entrar';
        }
    });
});

const preencherNome = (usuario) => {
    document.querySelectorAll('[data-nome]').forEach((elemento) => {
        elemento.textContent = usuario.nome.split(' ')[0];
    });
};

// ===== Página de cadastro =====
const acesso = document.querySelector('[data-acesso]');

if (acesso) {
    const conectado = document.querySelector('[data-conectado]');

    api('/api/eu')
        .then(({ usuario }) => {
            if (!usuario) return;
            preencherNome(usuario);
            conectado.hidden = false;
            acesso.hidden = true;
        })
        .catch(() => {});

    acesso.querySelectorAll('[data-form]').forEach((formulario) => {
        ligarFormulario(formulario, () => {
            location.href = 'pedidos.html';
        });
    });
}

// ===== Cartões de pedido (usados em Pedidos e no painel) =====
const ICONES_STATUS = { 'Recebido': '◷', 'Em andamento': '↻', 'Concluído': '✓', 'Cancelado': '✕' };

const formatarData = (texto) =>
    new Date(texto.replace(' ', 'T') + 'Z').toLocaleDateString('pt-BR');

const criarElemento = (tag, classe, texto) => {
    const elemento = document.createElement(tag);
    if (classe) elemento.className = classe;
    if (texto !== undefined) elemento.textContent = texto;
    return elemento;
};

// o status aparece com ícone e texto, não só com cor
const criarSelo = (status) => criarElemento(
    'span',
    'selo selo-' + status.normalize('NFD').replace(/[^a-zA-Z]/g, '').toLowerCase(),
    `${ICONES_STATUS[status] || '•'} ${status}`
);

const criarItem = (pedido) => {
    const item = criarElemento('li', 'pedido');
    const topo = criarElemento('div', 'pedido-topo');
    topo.append(criarElemento('h3', '', pedido.titulo), criarSelo(pedido.status));
    item.append(
        topo,
        criarElemento('p', 'pedido-meta', `#${pedido.id} · ${pedido.servico} · ${formatarData(pedido.criado_em)}`),
        criarElemento('p', '', pedido.descricao)
    );
    return item;
};

// ===== Página de pedidos =====
const lista = document.querySelector('[data-lista]');

if (lista) {
    const vazio = document.querySelector('[data-vazio]');
    const formularioPedido = document.querySelector('[data-pedidos] [data-form]');
    let pedidos = [];

    const desenhar = () => {
        lista.replaceChildren(...pedidos.map(criarItem));
        vazio.textContent = 'Você ainda não fez nenhum pedido.';
        vazio.hidden = pedidos.length > 0;
    };

    api('/api/eu')
        .then(({ usuario }) => {
            if (!usuario) {
                location.replace('cadastro.html#aba-entrar');
                return null;
            }
            preencherNome(usuario);
            document.querySelector('[data-link-admin]').hidden = !usuario.admin;
            return api('/api/pedidos');
        })
        .then((resposta) => {
            if (!resposta) return;
            pedidos = resposta.pedidos;
            desenhar();
        })
        .catch((erro) => {
            if (erro.status === 401) {
                location.replace('cadastro.html#aba-entrar');
                return;
            }
            vazio.textContent = '⚠ ' + erro.message;
        });

    ligarFormulario(formularioPedido, (resposta, formulario) => {
        pedidos.unshift(resposta.pedido);
        desenhar();
        formulario.reset();
        mostrarAviso(formulario, `Pedido #${resposta.pedido.id} enviado! Vamos responder em breve.`);
    });
}

// ===== Painel do administrador =====
const painelAdmin = document.querySelector('[data-admin]');

if (painelAdmin) {
    const aviso = painelAdmin.querySelector('[data-admin-aviso]');
    const conteudo = painelAdmin.querySelector('[data-admin-conteudo]');
    const statusAdmin = painelAdmin.querySelector('[data-admin-status]');
    const listaPedidos = painelAdmin.querySelector('[data-admin-pedidos]');
    const listaClientes = painelAdmin.querySelector('[data-admin-clientes]');
    let dados = null;

    const contar = () => {
        painelAdmin.querySelector('[data-total="clientes"]').textContent = dados.clientes.length;
        painelAdmin.querySelector('[data-total="pedidos"]').textContent = dados.pedidos.length;
        painelAdmin.querySelector('[data-total="abertos"]').textContent =
            dados.pedidos.filter((p) => p.status === 'Recebido' || p.status === 'Em andamento').length;
    };

    const criarPedidoAdmin = (pedido) => {
        const item = criarItem(pedido);
        const contato = [pedido.cliente, pedido.cliente_email, pedido.cliente_telefone].filter(Boolean).join(' · ');
        item.insertBefore(criarElemento('p', 'pedido-meta', 'Cliente: ' + contato), item.children[2]);

        // troca de status
        const campo = criarElemento('div', 'campo campo-status');
        const rotulo = criarElemento('label', '', 'Mudar status');
        const seletor = document.createElement('select');
        seletor.id = rotulo.htmlFor = 'status-' + pedido.id;
        dados.status.forEach((status) => {
            const opcao = criarElemento('option', '', status);
            opcao.selected = status === pedido.status;
            seletor.append(opcao);
        });
        seletor.addEventListener('change', async () => {
            const anterior = pedido.status;
            seletor.disabled = true;
            try {
                await api('/api/admin/status', { id: pedido.id, status: seletor.value });
                pedido.status = seletor.value;
                item.querySelector('.selo').replaceWith(criarSelo(pedido.status));
                contar();
                statusAdmin.classList.remove('aviso-erro');
                statusAdmin.textContent = `✓ Pedido #${pedido.id} agora está "${pedido.status}".`;
            } catch (erro) {
                seletor.value = anterior;
                statusAdmin.classList.add('aviso-erro');
                statusAdmin.textContent = '⚠ ' + erro.message;
            } finally {
                seletor.disabled = false;
            }
        });
        campo.append(rotulo, seletor);
        item.append(campo);
        return item;
    };

    const criarCliente = (cliente) => {
        const item = criarElemento('li', 'pedido');
        const topo = criarElemento('div', 'pedido-topo');
        topo.append(criarElemento('h3', '', cliente.nome));
        if (cliente.admin) topo.append(criarElemento('span', 'selo selo-recebido', '★ Admin'));
        const email = criarElemento('a', '', cliente.email);
        email.href = 'mailto:' + cliente.email;
        const linhaEmail = criarElemento('p');
        linhaEmail.append('E-mail: ', email);
        item.append(
            topo,
            criarElemento('p', 'pedido-meta', `#${cliente.id} · desde ${formatarData(cliente.criado_em)} · ${cliente.total_pedidos} pedido(s)`),
            linhaEmail,
            criarElemento('p', '', 'Telefone: ' + (cliente.telefone || '—'))
        );
        return item;
    };

    api('/api/eu')
        .then(({ usuario }) => {
            if (!usuario) {
                location.replace('cadastro.html#aba-entrar');
                return null;
            }
            return api('/api/admin');
        })
        .then((resposta) => {
            if (!resposta) return;
            dados = resposta;
            listaPedidos.replaceChildren(...dados.pedidos.map(criarPedidoAdmin));
            listaClientes.replaceChildren(...dados.clientes.map(criarCliente));
            painelAdmin.querySelector('[data-vazio-pedidos]').hidden = dados.pedidos.length > 0;
            painelAdmin.querySelector('[data-vazio-clientes]').hidden = dados.clientes.length > 0;
            contar();
            aviso.textContent = 'Clientes cadastrados e pedidos recebidos pelo site.';
            conteudo.hidden = false;
        })
        .catch((erro) => {
            aviso.textContent = '⚠ ' + erro.message;
        });
}

// ===== Formulário de contato =====
const formularioContato = document.querySelector('[data-contato]');

if (formularioContato) {
    const tudoValido = prepararValidacao(formularioContato);

    formularioContato.addEventListener('submit', (evento) => {
        evento.preventDefault();
        mostrarAviso(formularioContato, '');
        if (!tudoValido()) return;

        // sem servidor: abre o aplicativo de e-mail com a mensagem pronta
        const dados = new FormData(formularioContato);
        const assunto = `[LUX] ${dados.get('servico')} — ${dados.get('nome')}`;
        const corpo = `${dados.get('mensagem')}\n\n${dados.get('nome')}\n${dados.get('email')}`;
        location.href = `mailto:${formularioContato.dataset.email}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
        mostrarAviso(formularioContato, 'Abrimos o seu aplicativo de e-mail com a mensagem pronta. É só enviar!');
    });
}

// ===== Entrada suave ao rolar =====
const semMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (!semMovimento && 'IntersectionObserver' in window) {
    const observador = new IntersectionObserver((entradas) => {
        entradas.forEach((entrada) => {
            if (entrada.isIntersecting) {
                const alvo = entrada.target;
                alvo.classList.add('visivel');
                observador.unobserve(alvo);
                // devolve o elemento ao estilo normal para o efeito de hover funcionar
                alvo.addEventListener('transitionend', () => alvo.classList.remove('revelar', 'visivel'), { once: true });
            }
        });
    }, { threshold: 0.12 });

    document.querySelectorAll('.cartao, .chamada').forEach((elemento) => {
        elemento.classList.add('revelar');
        observador.observe(elemento);
    });
}

// ===== Ano do rodapé =====
document.querySelectorAll('[data-ano]').forEach((elemento) => {
    elemento.textContent = new Date().getFullYear();
});
