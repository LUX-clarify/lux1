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
const MSG_SEM_SERVIDOR = 'Não foi possível enviar agora. Tente de novo em alguns minutos.';

const api = async (caminho, dados) => {
    if (location.protocol === 'file:') {
        throw new Error(MSG_SEM_SERVIDOR);
    }
    const opcoes = dados
        ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) }
        : {};
    let resposta;
    try {
        resposta = await fetch(caminho, opcoes);
    } catch {
        throw new Error(MSG_SEM_SERVIDOR);
    }
    // resposta que não é JSON = não foi o servidor.py que respondeu (ex.: Live Server)
    if (!(resposta.headers.get('Content-Type') || '').includes('application/json')) {
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

    const listaMensagens = painelAdmin.querySelector('[data-admin-mensagens]');

    const criarMensagem = (mensagem) => {
        const item = criarElemento('li', 'pedido');
        const topo = criarElemento('div', 'pedido-topo');
        topo.append(
            criarElemento('h3', '', mensagem.nome),
            criarElemento('span', mensagem.enviado ? 'selo selo-concluido' : 'selo selo-recebido',
                mensagem.enviado ? '✓ E-mail enviado' : '◷ Só no painel')
        );
        const email = criarElemento('a', '', mensagem.email);
        email.href = 'mailto:' + mensagem.email;
        const linhaEmail = criarElemento('p');
        linhaEmail.append('Responder para: ', email);
        item.append(
            topo,
            criarElemento('p', 'pedido-meta', `#${mensagem.id} · ${mensagem.servico} · ${formatarData(mensagem.criado_em)}`),
            linhaEmail,
            criarElemento('p', '', mensagem.mensagem)
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
            listaMensagens.replaceChildren(...dados.mensagens.map(criarMensagem));
            painelAdmin.querySelector('[data-vazio-mensagens]').hidden = dados.mensagens.length > 0;
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

    const botao = formularioContato.querySelector('[type="submit"]');

    formularioContato.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        mostrarAviso(formularioContato, '');
        if (!tudoValido()) return;

        // o servidor.py envia a mensagem para o e-mail da LUX e guarda uma cópia no painel
        botao.disabled = true;
        try {
            await api('/api/contato', Object.fromEntries(new FormData(formularioContato)));
            formularioContato.reset();
            mostrarAviso(formularioContato, 'Mensagem enviada! Vamos responder no seu e-mail em breve.');
        } catch (erro) {
            mostrarAviso(formularioContato, erro.message, true);
        } finally {
            botao.disabled = false;
        }
    });
}

// ===== Acessibilidade (painel para PcD, em todas as páginas) =====
const raiz = document.documentElement;
const CHAVE_ACESSIBILIDADE = 'lux-acessibilidade';
const ESCALAS = [100, 115, 130, 150, 175];

// cada opção liga/desliga uma classe no <html>; o visual está no oi.css
const OPCOES = [
    { id: 'contraste', icone: '◐', titulo: 'Alto contraste', dica: 'Preto, branco e amarelo' },
    { id: 'fonte', icone: 'Aa', titulo: 'Fonte legível', dica: 'Para dislexia e baixa visão' },
    { id: 'espacamento', icone: '↕', titulo: 'Espaçar texto', dica: 'Mais espaço entre letras e linhas' },
    { id: 'links', icone: '🔗', titulo: 'Destacar links', dica: 'Sublinha e contorna os links' },
    { id: 'animacao', icone: '⏸', titulo: 'Parar animações', dica: 'Tira movimentos da tela' },
    { id: 'cursor', icone: '➤', titulo: 'Cursor grande', dica: 'Ponteiro do mouse maior' },
    { id: 'guia', icone: '▭', titulo: 'Guia de leitura', dica: 'Escurece tudo menos a linha do mouse' },
    { id: 'libras', icone: '🤟', titulo: 'Libras', dica: 'Tradutor VLibras do governo' },
];

const lerPreferencias = () => {
    try {
        return JSON.parse(localStorage.getItem(CHAVE_ACESSIBILIDADE)) || {};
    } catch {
        return {};
    }
};

const preferencias = Object.assign({ escala: 0 }, lerPreferencias());

const salvarPreferencias = () => {
    try {
        localStorage.setItem(CHAVE_ACESSIBILIDADE, JSON.stringify(preferencias));
    } catch {
        // navegação anônima ou dados bloqueados: vale só nesta página
    }
};

// --- recursos que precisam de mais do que uma classe ---
const carregarFonteLegivel = () => {
    if (document.getElementById('fonte-legivel')) return;
    const link = document.createElement('link');
    link.id = 'fonte-legivel';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap';
    document.head.append(link);
};

const guiaCima = criarElemento('div', 'guia-leitura guia-cima');
const guiaBaixo = criarElemento('div', 'guia-leitura guia-baixo');
const moverGuia = (y) => {
    guiaCima.style.height = Math.max(0, y - 36) + 'px';
    guiaBaixo.style.top = (y + 36) + 'px';
};
const guiaPeloMouse = (evento) => moverGuia(evento.clientY);
const guiaPeloToque = (evento) => moverGuia(evento.touches[0].clientY);

const ligarGuia = (ligar) => {
    guiaCima.hidden = guiaBaixo.hidden = !ligar;
    if (ligar) {
        if (!guiaCima.isConnected) document.body.append(guiaCima, guiaBaixo);
        moverGuia(window.innerHeight / 2);
        window.addEventListener('pointermove', guiaPeloMouse);
        window.addEventListener('touchmove', guiaPeloToque, { passive: true });
    } else {
        window.removeEventListener('pointermove', guiaPeloMouse);
        window.removeEventListener('touchmove', guiaPeloToque);
    }
};

// VLibras: tradutor oficial de português para Libras (gov.br), carregado só quando pedido
const ligarLibras = (ligar) => {
    let caixa = document.querySelector('[vw]');
    if (!ligar) {
        if (caixa) caixa.hidden = true;
        return;
    }
    if (caixa) {
        caixa.hidden = false;
        return;
    }
    caixa = document.createElement('div');
    caixa.setAttribute('vw', '');
    caixa.className = 'enabled';
    const botaoLibras = document.createElement('div');
    botaoLibras.setAttribute('vw-access-button', '');
    botaoLibras.className = 'active';
    const embrulho = document.createElement('div');
    embrulho.setAttribute('vw-plugin-wrapper', '');
    embrulho.append(criarElemento('div', 'vw-plugin-top-wrapper'));
    caixa.append(botaoLibras, embrulho);
    document.body.append(caixa);

    const script = document.createElement('script');
    script.src = 'https://vlibras.gov.br/app/vlibras-plugin.js';
    script.onload = () => {
        new window.VLibras.Widget('https://vlibras.gov.br/app');
        // o VLibras espera o evento "load" da página, que já passou
        if (document.readyState === 'complete') window.dispatchEvent(new Event('load'));
    };
    document.body.append(script);
};

const aplicarPreferencias = () => {
    raiz.style.fontSize = ESCALAS[preferencias.escala] + '%';
    OPCOES.forEach(({ id }) => raiz.classList.toggle('a11y-' + id, Boolean(preferencias[id])));
    if (preferencias.fonte) carregarFonteLegivel();
    if (document.body) {
        ligarGuia(Boolean(preferencias.guia));
        if (preferencias.libras || document.querySelector('[vw]')) ligarLibras(Boolean(preferencias.libras));
    }
};

aplicarPreferencias();

// --- leitura em voz alta (voz do próprio navegador) ---
const vozDisponivel = 'speechSynthesis' in window;

// textos longos são falados em pedaços: alguns navegadores param no meio de falas grandes
const pedacosParaLer = (texto) =>
    texto.split(/\n+/)
        .flatMap((linha) => linha.match(/[^.!?]{1,220}[.!?]*/g) || [])
        .map((pedaco) => pedaco.trim())
        .filter(Boolean);

// --- painel ---
const botaoAcessibilidade = criarElemento('button', 'a11y-botao');
botaoAcessibilidade.type = 'button';
botaoAcessibilidade.setAttribute('aria-expanded', 'false');
botaoAcessibilidade.setAttribute('aria-controls', 'painel-acessibilidade');
botaoAcessibilidade.setAttribute('aria-label', 'Acessibilidade');
botaoAcessibilidade.title = 'Acessibilidade';
botaoAcessibilidade.innerHTML =
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="4" r="2.2"/>' +
    '<path d="M21 9h-6v13h-2.2v-6h-1.6v6H9V9H3V6.8h18V9z"/></svg>';

const painelAcessibilidade = criarElemento('div', 'a11y-painel');
painelAcessibilidade.id = 'painel-acessibilidade';
painelAcessibilidade.setAttribute('role', 'dialog');
painelAcessibilidade.setAttribute('aria-labelledby', 'titulo-acessibilidade');
painelAcessibilidade.hidden = true;

const tituloAcessibilidade = criarElemento('h2', '', 'Acessibilidade');
tituloAcessibilidade.id = 'titulo-acessibilidade';
tituloAcessibilidade.tabIndex = -1;
const fecharAcessibilidade = criarElemento('button', 'a11y-fechar', '✕');
fecharAcessibilidade.type = 'button';
fecharAcessibilidade.setAttribute('aria-label', 'Fechar acessibilidade');
const topoAcessibilidade = criarElemento('div', 'a11y-topo');
topoAcessibilidade.append(tituloAcessibilidade, fecharAcessibilidade);

// tamanho do texto
const linhaTamanho = criarElemento('div', 'a11y-tamanho');
const rotuloTamanho = criarElemento('p', '', 'Tamanho do texto');
rotuloTamanho.id = 'rotulo-tamanho';
const grupoTamanho = criarElemento('div', 'a11y-tamanho-botoes');
grupoTamanho.setAttribute('role', 'group');
grupoTamanho.setAttribute('aria-labelledby', 'rotulo-tamanho');
const diminuir = criarElemento('button', 'a11y-mini', 'A−');
diminuir.setAttribute('aria-label', 'Diminuir texto');
const valorTamanho = criarElemento('output', 'a11y-valor');
valorTamanho.setAttribute('aria-live', 'polite');
const aumentar = criarElemento('button', 'a11y-mini', 'A+');
aumentar.setAttribute('aria-label', 'Aumentar texto');
[diminuir, aumentar].forEach((botao) => { botao.type = 'button'; });
grupoTamanho.append(diminuir, valorTamanho, aumentar);
linhaTamanho.append(rotuloTamanho, grupoTamanho);

const atualizarTamanho = () => {
    valorTamanho.textContent = ESCALAS[preferencias.escala] + '%';
    diminuir.disabled = preferencias.escala === 0;
    aumentar.disabled = preferencias.escala === ESCALAS.length - 1;
};
const mudarTamanho = (passo) => {
    preferencias.escala = Math.min(ESCALAS.length - 1, Math.max(0, preferencias.escala + passo));
    salvarPreferencias();
    aplicarPreferencias();
    atualizarTamanho();
};
diminuir.addEventListener('click', () => mudarTamanho(-1));
aumentar.addEventListener('click', () => mudarTamanho(1));

// opções liga/desliga
const grade = criarElemento('div', 'a11y-grade');
const botoesOpcao = OPCOES.map((opcao) => {
    const botao = criarElemento('button', 'a11y-opcao');
    botao.type = 'button';
    botao.dataset.opcao = opcao.id;
    const textoOpcao = criarElemento('span', 'a11y-opcao-texto');
    textoOpcao.append(criarElemento('strong', '', opcao.titulo), criarElemento('small', '', opcao.dica));
    const icone = criarElemento('span', 'a11y-icone', opcao.icone);
    icone.setAttribute('aria-hidden', 'true');
    botao.append(icone, textoOpcao);
    botao.addEventListener('click', () => {
        preferencias[opcao.id] = !preferencias[opcao.id];
        salvarPreferencias();
        aplicarPreferencias();
        botao.setAttribute('aria-pressed', String(Boolean(preferencias[opcao.id])));
    });
    grade.append(botao);
    return botao;
});

// ouvir a página
const ouvir = criarElemento('button', 'botao a11y-ouvir');
ouvir.type = 'button';
const textoOuvir = (falando) => {
    ouvir.textContent = falando ? '■ Parar leitura' : '🔊 Ouvir a página';
    ouvir.setAttribute('aria-pressed', String(falando));
};
textoOuvir(false);
ouvir.hidden = !vozDisponivel;
const dicaOuvir = criarElemento('p', 'a11y-dica', 'Dica: selecione um trecho antes para ouvir só ele.');
dicaOuvir.hidden = !vozDisponivel;

ouvir.addEventListener('click', () => {
    if (speechSynthesis.speaking) {
        speechSynthesis.cancel();
        textoOuvir(false);
        return;
    }
    const selecionado = String(window.getSelection()).trim();
    const pedacos = pedacosParaLer(selecionado || document.querySelector('main').innerText);
    const voz = speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith('pt'));
    pedacos.forEach((pedaco, indice) => {
        const fala = new SpeechSynthesisUtterance(pedaco);
        fala.lang = 'pt-BR';
        if (voz) fala.voice = voz;
        if (indice === pedacos.length - 1) fala.onend = () => textoOuvir(false);
        speechSynthesis.speak(fala);
    });
    textoOuvir(pedacos.length > 0);
});

const redefinir = criarElemento('button', 'botao botao-contorno a11y-redefinir', 'Redefinir tudo');
redefinir.type = 'button';
redefinir.addEventListener('click', () => {
    Object.keys(preferencias).forEach((chave) => { preferencias[chave] = false; });
    preferencias.escala = 0;
    salvarPreferencias();
    aplicarPreferencias();
    sincronizarPainel();
});

const sincronizarPainel = () => {
    atualizarTamanho();
    botoesOpcao.forEach((botao) => {
        botao.setAttribute('aria-pressed', String(Boolean(preferencias[botao.dataset.opcao])));
    });
};

painelAcessibilidade.append(topoAcessibilidade, linhaTamanho, grade, ouvir, dicaOuvir, redefinir);
sincronizarPainel();

const abrirAcessibilidade = (abrir) => {
    painelAcessibilidade.hidden = !abrir;
    botaoAcessibilidade.setAttribute('aria-expanded', String(abrir));
    if (abrir) tituloAcessibilidade.focus();
};

botaoAcessibilidade.addEventListener('click', () => abrirAcessibilidade(painelAcessibilidade.hidden));
fecharAcessibilidade.addEventListener('click', () => {
    abrirAcessibilidade(false);
    botaoAcessibilidade.focus();
});
document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && !painelAcessibilidade.hidden) {
        abrirAcessibilidade(false);
        botaoAcessibilidade.focus();
    }
});
document.addEventListener('click', (evento) => {
    if (!painelAcessibilidade.hidden && !painelAcessibilidade.contains(evento.target) &&
        !botaoAcessibilidade.contains(evento.target)) {
        abrirAcessibilidade(false);
    }
});

// logo depois do "Pular para o conteúdo": quem usa teclado chega no botão logo no começo
const pularConteudo = document.querySelector('.pular');
if (pularConteudo) pularConteudo.after(botaoAcessibilidade, painelAcessibilidade);
else document.body.prepend(botaoAcessibilidade, painelAcessibilidade);

// ===== Entrada suave ao rolar =====
const semMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches || raiz.classList.contains('a11y-animacao');

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
