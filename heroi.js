// Fios de luz do herói (como no hero-49 do originkit), nas cores da LUX.
// Os fios são as linhas de um campo de fluxo: um arco que se abre para a direita, mais um "ímã"
// (dipolo) que segue o mouse. Perto do ímã as linhas se fecham em dois laços, formando um "8".
// Tudo é calculado por pixel na placa de vídeo (WebGL), na resolução real da tela.
// Sem WebGL, o herói fica só com o texto.

const canvas = document.querySelector('.heroi-fios');
const heroi = canvas && canvas.closest('.heroi');
const html = document.documentElement;

const VERTICE = `
attribute vec2 posicao;
void main() { gl_Position = vec4(posicao, 0.0, 1.0); }`;

// o mesmo código de fragmento serve ao WebGL 1 e 2 (o cabeçalho muda)
const FRAGMENTO = `
uniform vec2 u_tela;      // tamanho em pixels
uniform float u_tempo;
uniform vec2 u_ima;       // posição do ímã: x de 0 a 1 na largura, y em alturas
uniform float u_forca;
uniform vec4 u_arco;      // início, topo, curvatura, pico (x do topo)
uniform float u_largura;  // meia largura do feixe na borda direita, em alturas
uniform float u_densidade;
uniform vec3 u_cor;
uniform float u_pixel;    // pixels físicos por pixel CSS

float sorteio(float n) { return fract(sin(n * 91.345) * 47453.5453); }

void main() {
    vec2 ponto = vec2(gl_FragCoord.x, u_tela.y - gl_FragCoord.y);
    float altura = u_tela.y;
    float xn = ponto.x / u_tela.x;
    vec2 p = ponto / altura;

    // centro do feixe: um arco suave que ondula devagar
    float d = xn - u_arco.w;
    float centro = u_arco.y + u_arco.z * d * d + 0.006 * sin(xn * 7.0 - u_tempo * 0.7);
    float abre = smoothstep(u_arco.x, 1.0, xn);
    float meia = mix(0.002, u_largura, pow(abre, 0.85));

    // função de fluxo: -1 a 1 dentro do feixe
    float fluxo = (p.y - centro) / meia;

    // ímã (dipolo): as linhas viram círculos que se tocam no ponto do mouse
    vec2 ima = vec2(u_ima.x * u_tela.x / altura, u_ima.y);
    vec2 r = p - ima;
    float r2 = dot(r, r) + 0.00035;
    // sinal negativo: o feixe é empurrado para longe do mouse, como no original
    fluxo -= u_forca * r.y / r2 * 0.03 / max(meia, 0.025);

    // cada fio é um valor inteiro do fluxo; a distância vira pixels pela derivada (borda nítida)
    float f = fluxo * u_densidade;
    float passo = max(fwidth(f), 1e-4);
    float fio = floor(f + 0.5);
    float distancia = abs(f - fio) / passo / u_pixel;
    float acaso = sorteio(fio);

    float espessura = 0.55 + 1.25 * acaso;
    float nucleo = exp(-pow(distancia / espessura, 2.0));
    float brilho = exp(-distancia / 7.0) * 0.32;
    // onde os fios se espremem (perto do ímã) viram uma luz contínua, sem serrilhado
    float denso = smoothstep(0.35, 0.9, passo / u_pixel);
    float luz = mix(nucleo * (0.5 + 0.5 * acaso) + brilho, 0.75, denso);

    float dentro = 1.0 - smoothstep(0.9, 1.12, abs(fluxo));
    float entrada = smoothstep(u_arco.x - 0.03, u_arco.x + 0.14, xn);
    float alfa = luz * dentro * entrada;

    // fios âmbar; os mais fortes esquentam até um amarelo quase branco
    vec3 claro = vec3(1.0, 0.96, 0.82);
    vec3 cor = mix(u_cor, claro, clamp(nucleo * acaso * 0.85 + denso * 0.55, 0.0, 1.0));
    float halo = exp(-abs(fluxo) * 1.1) * 0.07 * entrada;

    gl_FragColor = vec4(cor * alfa + u_cor * halo, clamp(alfa + halo, 0.0, 1.0));
}`;

const criarContexto = () => {
    const opcoes = { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: 'low-power' };
    const gl2 = canvas.getContext('webgl2', opcoes);
    if (gl2) {
        return {
            gl: gl2,
            vertice: '#version 300 es\n' + VERTICE.replace('attribute', 'in'),
            fragmento: '#version 300 es\nprecision highp float;\nout vec4 saida;\n'
                + FRAGMENTO.replace('gl_FragColor', 'saida'),
        };
    }
    const gl1 = canvas.getContext('webgl', opcoes);
    if (!gl1 || !gl1.getExtension('OES_standard_derivatives')) return null;
    return {
        gl: gl1,
        vertice: VERTICE,
        fragmento: '#extension GL_OES_standard_derivatives : enable\nprecision highp float;\n' + FRAGMENTO,
    };
};

const compilar = (gl, tipo, codigo) => {
    const shader = gl.createShader(tipo);
    gl.shaderSource(shader, codigo);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
};

const corAmbar = () => {
    const hex = getComputedStyle(html).getPropertyValue('--ambar').trim().replace('#', '') || 'ffbf00';
    const n = parseInt(hex.length === 3 ? hex.replace(/./g, '$&$&') : hex, 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
};

const iniciar = () => {
    const contexto = criarContexto();
    if (!contexto) return;
    const { gl } = contexto;

    let programa;
    try {
        programa = gl.createProgram();
        gl.attachShader(programa, compilar(gl, gl.VERTEX_SHADER, contexto.vertice));
        gl.attachShader(programa, compilar(gl, gl.FRAGMENT_SHADER, contexto.fragmento));
        gl.linkProgram(programa);
        if (!gl.getProgramParameter(programa, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(programa));
    } catch (erro) {
        console.warn('Fios do herói desligados:', erro);
        return;
    }
    gl.useProgram(programa);

    // um triângulo que cobre a tela toda
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const posicao = gl.getAttribLocation(programa, 'posicao');
    gl.enableVertexAttribArray(posicao);
    gl.vertexAttribPointer(posicao, 2, gl.FLOAT, false, 0, 0);

    const u = {};
    ['u_tela', 'u_tempo', 'u_ima', 'u_forca', 'u_arco', 'u_largura', 'u_densidade', 'u_cor', 'u_pixel']
        .forEach((nome) => { u[nome] = gl.getUniformLocation(programa, nome); });

    // forma do feixe: no computador nasce no fim do título; no celular atravessa a faixa do alto
    // (720px é o mesmo ponto em que o oi.css põe os fios numa faixa no alto)
    const celular = window.matchMedia('(max-width: 720px)');
    let forma;
    const escolherForma = () => {
        forma = celular.matches
            ? { arco: [-0.15, 0.45, 0.5, 0.6], largura: 0.26, densidade: 6 }
            : { arco: [0.4, 0.25, 1.1, 0.74], largura: 0.095, densidade: 7 };
    };
    const centroDoArco = (x) => forma.arco[1] + forma.arco[2] * (x - forma.arco[3]) ** 2;

    // estado animado: o ímã segue o mouse com atraso; parado, passeia sozinho pelo feixe
    let tempo = 0;
    let escala = 1;
    const ima = { x: 0.7, y: 0.3, forca: 0 };
    const mouse = { x: 0, y: 0, dentro: false, ultimo: -10 };
    let cor = corAmbar();

    const desenhar = () => {
        if (!forma) return;
        gl.uniform2f(u.u_tela, canvas.width, canvas.height);
        gl.uniform1f(u.u_tempo, tempo);
        gl.uniform2f(u.u_ima, ima.x, ima.y);
        gl.uniform1f(u.u_forca, ima.forca);
        gl.uniform4f(u.u_arco, ...forma.arco);
        gl.uniform1f(u.u_largura, forma.largura);
        gl.uniform1f(u.u_densidade, forma.densidade);
        gl.uniform3f(u.u_cor, ...cor);
        gl.uniform1f(u.u_pixel, escala);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const ajustar = () => {
        // tamanho de layout (sem a perspectiva do palco 3D, que encolhe e estica o retângulo na tela)
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        if (!width || !height) return;
        escala = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(width * escala);
        canvas.height = Math.round(height * escala);
        gl.viewport(0, 0, canvas.width, canvas.height);
        escolherForma();
        desenhar();
    };

    heroi.addEventListener('pointermove', (evento) => {
        const caixa = canvas.getBoundingClientRect();
        mouse.x = (evento.clientX - caixa.left) / caixa.width;
        mouse.y = (evento.clientY - caixa.top) / caixa.height;
        mouse.dentro = mouse.y >= 0 && mouse.y <= 1;
        mouse.ultimo = tempo;
    }, { passive: true });
    heroi.addEventListener('pointerleave', () => { mouse.dentro = false; });

    const atualizar = (dt) => {
        tempo += dt;
        // mouse parado por 4 s ou fora do herói: o ímã volta a passear sozinho, mais fraco
        const seguindo = mouse.dentro && tempo - mouse.ultimo < 4;
        let alvoX;
        let alvoY;
        let alvoForca;
        if (seguindo) {
            alvoX = mouse.x;
            alvoY = mouse.y;
            alvoForca = 1;
        } else {
            alvoX = (forma.arco[0] + 1) / 2 + 0.2 * Math.sin(tempo * 0.19);
            alvoY = centroDoArco(alvoX) + 0.035 * Math.sin(tempo * 0.31 + 1);
            alvoForca = 0.55 + 0.25 * Math.sin(tempo * 0.27);
        }
        const suave = 1 - Math.exp(-dt * (seguindo ? 5 : 1.2));
        ima.x += (alvoX - ima.x) * suave;
        ima.y += (alvoY - ima.y) * suave;
        ima.forca += (alvoForca - ima.forca) * (1 - Math.exp(-dt * 2));
    };

    // parado quando: fora da tela, "Parar animações" ligado ou o sistema pede menos movimento
    const menosMovimento = window.matchMedia('(prefers-reduced-motion: reduce)');
    const parado = () => menosMovimento.matches || html.classList.contains('a11y-animacao');
    let visivel = true;
    let rodando = false;
    let ultimo = 0;
    const quadro = (agora) => {
        if (!visivel || parado()) {
            rodando = false;
            if (parado()) {
                // um quadro calmo, sem ímã
                ima.forca = 0;
                desenhar();
            }
            return;
        }
        atualizar(Math.min((agora - ultimo) / 1000, 0.1));
        ultimo = agora;
        desenhar();
        requestAnimationFrame(quadro);
    };
    const continuar = () => {
        if (rodando) return;
        rodando = true;
        ultimo = performance.now();
        requestAnimationFrame(quadro);
    };

    new ResizeObserver(ajustar).observe(canvas);
    new IntersectionObserver(([entrada]) => {
        visivel = entrada.isIntersecting;
        if (visivel) continuar();
    }).observe(canvas);
    menosMovimento.addEventListener('change', continuar);
    // alto contraste troca o âmbar; "Parar animações" para e volta a animação
    new MutationObserver(() => {
        cor = corAmbar();
        desenhar();
        continuar();
    }).observe(html, { attributes: true, attributeFilter: ['class'] });

    ajustar();
    continuar();
};

if (canvas && heroi) iniciar();

// ===== Palco 3D: a cena inclina com o mouse e, ao rolar, as letras vêm para a frente =====
// O texto está 70px à frente e o fundo 280px atrás (oi.css), então ao inclinar o texto anda mais
// que o fundo: é isso que dá a sensação de profundidade. Funciona mesmo sem WebGL.
const ligarPalco = () => {
    const secao = document.querySelector('.heroi');
    const cena = secao && secao.querySelector('.heroi-cena');
    if (!cena) return;

    const menosMovimento = window.matchMedia('(prefers-reduced-motion: reduce)');
    const celular = window.matchMedia('(max-width: 720px)');
    const parado = () => menosMovimento.matches || html.classList.contains('a11y-animacao');
    const alvo = { x: 0, y: 0 };
    const atual = { x: 0, y: 0, rolagem: 0 };
    let rodando = false;
    let ultimo = 0;

    const aplicar = () => {
        cena.style.setProperty('--inclina-x', `${(-atual.y * 7).toFixed(3)}deg`);
        cena.style.setProperty('--inclina-y', `${(atual.x * 9).toFixed(3)}deg`);
        cena.style.setProperty('--rolagem', atual.rolagem.toFixed(4));
    };

    const quadro = (agora) => {
        if (parado() || celular.matches) {
            atual.x = 0;
            atual.y = 0;
            atual.rolagem = 0;
            aplicar();
            rodando = false;
            return;
        }
        const dt = Math.min((agora - ultimo) / 1000, 0.1);
        ultimo = agora;
        const caixa = secao.getBoundingClientRect();
        const rolagem = Math.min(Math.max(-caixa.top / caixa.height, 0), 1);
        const suave = 1 - Math.exp(-dt * 4);
        atual.x += (alvo.x - atual.x) * suave;
        atual.y += (alvo.y - atual.y) * suave;
        atual.rolagem += (rolagem - atual.rolagem) * (1 - Math.exp(-dt * 10));
        aplicar();
        const assentou = Math.abs(alvo.x - atual.x) < 0.001 && Math.abs(alvo.y - atual.y) < 0.001
            && Math.abs(rolagem - atual.rolagem) < 0.001;
        if (assentou) {
            rodando = false;
            return;
        }
        requestAnimationFrame(quadro);
    };
    const mexer = () => {
        if (rodando) return;
        rodando = true;
        ultimo = performance.now();
        requestAnimationFrame(quadro);
    };

    secao.addEventListener('pointermove', (evento) => {
        if (evento.pointerType !== 'mouse') return; // no toque, a cena fica reta
        const caixa = secao.getBoundingClientRect();
        alvo.x = (evento.clientX - caixa.left) / caixa.width - 0.5;
        alvo.y = (evento.clientY - caixa.top) / caixa.height - 0.5;
        mexer();
    }, { passive: true });
    secao.addEventListener('pointerleave', () => {
        alvo.x = 0;
        alvo.y = 0;
        mexer();
    });
    window.addEventListener('scroll', mexer, { passive: true });
    menosMovimento.addEventListener('change', mexer);
    celular.addEventListener('change', mexer);
    new MutationObserver(mexer).observe(html, { attributes: true, attributeFilter: ['class'] });
    mexer();
};
ligarPalco();
