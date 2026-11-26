const A4 = { largura: 595.28, altura: 841.89 };
const MARGEM = 14;
const FOLGA = 12;
const LIMIAR_BRANCO = 245;
const MM = 72 / 25.4;
const TERMICA = { largura: 100 * MM, altura: 150 * MM };
const MARGEM_TERMICA = 2 * MM;
const ESCALA_ATENCAO = 0.85;

const { PDFDocument, rgb, degrees } = PDFLib;

pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(
  new Blob([document.getElementById('pdf-worker').textContent], { type: 'text/javascript' })
);

async function caixaDoConteudo(pagina, viewport) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  await pagina.render({ canvasContext: ctx, viewport }).promise;
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);

  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i] < LIMIAR_BRANCO || data[i + 1] < LIMIAR_BRANCO || data[i + 2] < LIMIAR_BRANCO) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return { x0: 0, y0: 0, x1: viewport.width, y1: viewport.height, vazia: true };
  return { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

async function lerPaginas(bytes) {
  const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
  const paginas = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const pagina = await doc.getPage(n);
    const viewport = pagina.getViewport({ scale: 1 });
    const conteudo = await pagina.getTextContent();
    const textoBruto = conteudo.items.map((item) => item.str).join(' ');
    const texto = textoBruto.replace(/\s+/g, ' ');
    paginas.push({
      indice: n - 1,
      texto,
      textoBruto,
      textoColado: texto.replace(/\s/g, ''),
      largura: viewport.width,
      altura: viewport.height,
      caixa: await caixaDoConteudo(pagina, viewport),
      viewport,
      giro: pagina.rotate,
    });
  }
  return paginas;
}

function tipoDaPagina(pagina) {
  if (/Packing List/i.test(pagina.texto)) return 'packing';
  if (/VALOR NOTA/.test(pagina.texto) && /Protocolo de autoriza/i.test(pagina.texto)) return 'danfe';
  if (pagina.texto.trim()) return 'etiqueta';
  return 'vazia';
}

function chaveDeAcesso(pagina) {
  const achado = pagina.texto.match(/(?:\d{4}\s){10}\d{4}/);
  return achado ? achado[0].replace(/\s/g, '') : null;
}

function numeroDaNota(pagina) {
  const achado = pagina.texto.match(/N.{0,3}NFe:\s*0*(\d+)/);
  return achado ? achado[1] : null;
}

function numeroNaEtiqueta(pagina) {
  const achado = pagina.texto.match(/Nota Fiscal:\s*0*(\d+)/i) || pagina.texto.match(/\bNF:\s*0*(\d+)/);
  return achado ? achado[1] : null;
}

function consumidorDaNota(pagina) {
  const achado = pagina.textoBruto.match(/CNPJ\/CPF\/ID Estrangeiro:\s*[\d.\-/]+\s+(.+?)\s{2,}([^,]+),/);
  if (!achado) return { nome: null, rua: null };
  const nome = achado[1].replace(/^(?:IE:\s*\S+\s+)?(?:[\d./-]+\s+)*/, '').trim();
  return { nome, rua: achado[2].trim() };
}

function letrasMinusculas(texto) {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ');
}

function palavrasDe(texto) {
  return letrasMinusculas(texto).split(/\s+/).filter((palavra) => palavra.length >= 3);
}

function proporcaoNoTexto(texto, textoEtiqueta) {
  const palavras = palavrasDe(texto);
  if (!palavras.length) return 0;
  return palavras.filter((palavra) => textoEtiqueta.includes(` ${palavra} `)).length / palavras.length;
}

function conferirDestinatario(consumidor, etiqueta) {
  const { nome, rua } = consumidor;
  if (!nome && !rua) return null;
  const textoEtiqueta = ` ${letrasMinusculas(etiqueta.texto).replace(/\s+/g, ' ')} `;
  const textoColado = textoEtiqueta.replace(/\s/g, '');

  const apelido = (nome || '').match(/\(([^)]+)\)/);
  const apelidoLetras = apelido ? letrasMinusculas(apelido[1]).replace(/\s/g, '') : '';
  const apelidoConfere = apelidoLetras.length >= 6 && textoColado.includes(apelidoLetras.slice(0, 8));

  const nomeConfere = nome ? proporcaoNoTexto(nome.replace(/\(.*?\)/g, ''), textoEtiqueta) >= 0.6 : false;
  const ruaConfere = rua ? proporcaoNoTexto(rua, textoEtiqueta) >= 0.6 : false;
  return nomeConfere || apelidoConfere || ruaConfere ? 'confere' : 'diverge';
}

function rastreioDaEtiqueta(pagina) {
  const achado = pagina.texto.match(/Pedido:\s*(\d+)/);
  return achado ? achado[1] : null;
}

function rastreioDoPacking(pagina) {
  const achado = pagina.texto.match(/Tracking number:\s*(\d+)/);
  return achado ? achado[1] : null;
}

function parear(paginas) {
  const tipos = paginas.map(tipoDaPagina);
  const usadas = new Set();
  const pares = [];

  const livre = (i) => i >= 0 && i < paginas.length && !usadas.has(i);

  paginas.forEach((pagina, i) => {
    if (tipos[i] !== 'danfe') return;
    usadas.add(i);
    const chave = chaveDeAcesso(pagina);
    const rotulo = numeroDaNota(pagina) ? `NF ${numeroDaNota(pagina)}` : `Página ${i + 1}`;

    const numero = numeroDaNota(pagina);
    let parceira = paginas.findIndex(
      (outra, j) => tipos[j] === 'etiqueta' && livre(j) && chave && outra.textoColado.includes(chave)
    );
    let metodo = 'chave de acesso';
    if (parceira < 0 && numero) {
      parceira = paginas.findIndex(
        (outra, j) => tipos[j] === 'etiqueta' && livre(j) && numeroNaEtiqueta(outra) === numero
      );
      metodo = 'número da nota';
    }
    if (parceira < 0 && tipos[i + 1] === 'etiqueta' && livre(i + 1)) {
      parceira = i + 1;
      metodo = 'ordem das páginas';
    }
    if (parceira >= 0) usadas.add(parceira);
    const consumidor = consumidorDaNota(pagina);
    pares.push({
      modelo: 'nota',
      rotulo,
      principal: i,
      secundaria: parceira >= 0 ? parceira : null,
      metodo: parceira >= 0 ? metodo : null,
      destinatario: consumidor.nome,
      conferencia: parceira >= 0 ? conferirDestinatario(consumidor, paginas[parceira]) : null,
    });
  });

  paginas.forEach((pagina, i) => {
    if (tipos[i] !== 'etiqueta' || !livre(i)) return;
    const rastreio = rastreioDaEtiqueta(pagina);
    let parceira = paginas.findIndex(
      (outra, j) => tipos[j] === 'packing' && livre(j) && rastreio && rastreioDoPacking(outra) === rastreio
    );
    let metodo = 'número de rastreio';
    if (parceira < 0 && tipos[i + 1] === 'packing' && livre(i + 1)) {
      parceira = i + 1;
      metodo = 'ordem das páginas';
    }
    usadas.add(i);
    if (parceira >= 0) usadas.add(parceira);
    pares.push({
      modelo: parceira >= 0 ? 'packing' : 'solta',
      rotulo: rastreio ? `Pedido ${rastreio}` : `Página ${i + 1}`,
      principal: i,
      secundaria: parceira >= 0 ? parceira : null,
      metodo: parceira >= 0 ? metodo : null,
    });
  });

  paginas.forEach((_, i) => {
    if (livre(i) && tipos[i] !== 'vazia') {
      usadas.add(i);
      pares.push({ modelo: 'solta', rotulo: `Página ${i + 1}`, principal: i, secundaria: null, metodo: null });
    }
  });

  return pares.sort((a, b) => a.principal - b.principal);
}

function limitesDe(pagina, completa) {
  if (completa) return { x0: 0, y0: 0, x1: pagina.largura, y1: pagina.altura };
  const { x0, y0, x1, y1 } = pagina.caixa;
  const folga = 3;
  return {
    x0: Math.max(0, x0 - folga),
    y0: Math.max(0, y0 - folga),
    x1: Math.min(pagina.largura, x1 + folga),
    y1: Math.min(pagina.altura, y1 + folga),
  };
}

function limitesDaNota(pagina) {
  const { y0, y1 } = limitesDe(pagina);
  return { x0: 0, y0, x1: pagina.largura, y1 };
}

async function incorporar(saida, origem, pagina, limites) {
  const [incorporada] = await saida.embedPages(
    [origem.getPage(pagina.indice)],
    [{ left: limites.x0, right: limites.x1, bottom: pagina.altura - limites.y1, top: pagina.altura - limites.y0 }]
  );
  return { incorporada, largura: limites.x1 - limites.x0, altura: limites.y1 - limites.y0 };
}

function desenhar(folha, peca, x, yTopo, larguraMax, alturaMax) {
  const escala = Math.min(1, larguraMax / peca.largura, alturaMax / peca.altura);
  const largura = peca.largura * escala;
  const altura = peca.altura * escala;
  folha.drawPage(peca.incorporada, { x, y: folha.getHeight() - yTopo - altura, width: largura, height: altura });
  return { largura, altura, escala };
}

function linhaDeCorte(folha, x0, y0, x1, y1) {
  const altura = folha.getHeight();
  folha.drawLine({
    start: { x: x0, y: altura - y0 },
    end: { x: x1, y: altura - y1 },
    thickness: 0.4,
    color: rgb(0.7, 0.7, 0.7),
    dashArray: [3, 3],
  });
}

function abrirFolha(saida, modelo, porFolha) {
  const paisagem = modelo === 'nota' && porFolha === 2;
  const folha = saida.addPage(paisagem ? [A4.altura, A4.largura] : [A4.largura, A4.altura]);
  const capacidade = modelo === 'solta' ? 1 : porFolha;
  if (modelo === 'packing') linhaDeCorte(folha, A4.largura / 2, 0, A4.largura / 2, A4.altura);
  return { folha, modelo, capacidade, usados: 0, paisagem };
}

function fecharFolha(aberta) {
  if (!aberta || aberta.usados < 2) return;
  const { folha, modelo } = aberta;
  if (modelo === 'nota') linhaDeCorte(folha, folha.getWidth() / 2, 0, folha.getWidth() / 2, folha.getHeight());
  if (modelo === 'packing') linhaDeCorte(folha, 0, folha.getHeight() / 2, folha.getWidth(), folha.getHeight() / 2);
}

async function desenharNota(saida, origem, aberta, par, principal, secundaria, avisos) {
  const { folha, paisagem, usados } = aberta;
  const largura = paisagem ? folha.getWidth() / 2 : folha.getWidth();
  const x = paisagem ? usados * largura + MARGEM : MARGEM;
  const larguraUtil = largura - 2 * MARGEM;

  const nota = await incorporar(saida, origem, principal, limitesDaNota(principal));
  const desenhada = desenhar(folha, nota, x, MARGEM, larguraUtil, folha.getHeight() - 2 * MARGEM);
  if (!secundaria) return;

  const etiqueta = await incorporar(saida, origem, secundaria, limitesDe(secundaria));
  const yTopo = MARGEM + desenhada.altura + FOLGA;
  const resultado = desenhar(folha, etiqueta, x, yTopo, larguraUtil, folha.getHeight() - yTopo - MARGEM);
  if (resultado.escala < 0.9) {
    avisos.push(`${par.rotulo}: a etiqueta foi reduzida para ${Math.round(resultado.escala * 100)}% para caber na folha.`);
  }
}

async function desenharPacking(saida, origem, aberta, principal, secundaria) {
  const { folha, usados } = aberta;
  const largura = folha.getWidth() / 2;
  const altura = folha.getHeight() / 2;
  const yTopo = usados * altura;
  const etiqueta = await incorporar(saida, origem, principal, limitesDe(principal, true));
  const packing = await incorporar(saida, origem, secundaria, limitesDe(secundaria, true));
  desenhar(folha, etiqueta, 0, yTopo, largura, altura);
  desenhar(folha, packing, largura, yTopo, largura, altura);
}

async function desenharSolta(saida, origem, aberta, principal) {
  const peca = await incorporar(saida, origem, principal, limitesDe(principal));
  const { folha } = aberta;
  desenhar(folha, peca, MARGEM, MARGEM, folha.getWidth() - 2 * MARGEM, folha.getHeight() - 2 * MARGEM);
}

async function montar(bytes, paginas, pares, porFolha) {
  const origem = await PDFDocument.load(bytes);
  const saida = await PDFDocument.create();
  const avisos = [];
  let aberta = null;

  for (const par of pares) {
    const principal = paginas[par.principal];
    const secundaria = par.secundaria === null ? null : paginas[par.secundaria];

    if (!aberta || aberta.modelo !== par.modelo || aberta.usados >= aberta.capacidade) {
      fecharFolha(aberta);
      aberta = abrirFolha(saida, par.modelo, porFolha);
    }

    if (par.modelo === 'nota') await desenharNota(saida, origem, aberta, par, principal, secundaria, avisos);
    else if (par.modelo === 'packing') await desenharPacking(saida, origem, aberta, principal, secundaria);
    else await desenharSolta(saida, origem, aberta, principal);
    aberta.usados++;
  }
  fecharFolha(aberta);

  return { bytes: await saida.save(), folhas: saida.getPageCount(), avisos };
}

function limitesNoPdf(pagina) {
  const { x0, y0, x1, y1 } = limitesDe(pagina);
  const [ax, ay] = pagina.viewport.convertToPdfPoint(x0, y0);
  const [bx, by] = pagina.viewport.convertToPdfPoint(x1, y1);
  return { left: Math.min(ax, bx), right: Math.max(ax, bx), bottom: Math.min(ay, by), top: Math.max(ay, by) };
}

async function desenharTermica(saida, origem, pagina) {
  const limites = limitesNoPdf(pagina);
  const [peca] = await saida.embedPages([origem.getPage(pagina.indice)], [limites]);
  const larguraPeca = limites.right - limites.left;
  const alturaPeca = limites.top - limites.bottom;
  const deLado = pagina.giro % 180 !== 0;
  const largura = deLado ? alturaPeca : larguraPeca;
  const altura = deLado ? larguraPeca : alturaPeca;

  const larguraUtil = TERMICA.largura - 2 * MARGEM_TERMICA;
  const alturaUtil = TERMICA.altura - 2 * MARGEM_TERMICA;
  const escalaEmPe = Math.min(larguraUtil / largura, alturaUtil / altura);
  const escalaDeitada = Math.min(larguraUtil / altura, alturaUtil / largura);
  const deitar = escalaDeitada > escalaEmPe * 1.05;
  const escala = deitar ? escalaDeitada : escalaEmPe;

  const angulo = (((deitar ? 90 : 0) - pagina.giro) % 360 + 360) % 360;
  const w = larguraPeca * escala;
  const h = alturaPeca * escala;
  const [caixaL, caixaA] = angulo % 180 === 0 ? [w, h] : [h, w];
  const esquerda = (TERMICA.largura - caixaL) / 2;
  const base = (TERMICA.altura - caixaA) / 2;
  const [dx, dy] = { 0: [0, 0], 90: [h, 0], 180: [w, h], 270: [0, w] }[angulo];

  saida.addPage([TERMICA.largura, TERMICA.altura]).drawPage(peca, {
    x: esquerda + dx,
    y: base + dy,
    width: w,
    height: h,
    rotate: degrees(angulo),
  });
  return { escala, deitar };
}

async function montarTermica(bytes, paginas) {
  const origem = await PDFDocument.load(bytes);
  const saida = await PDFDocument.create();
  const etiquetas = [];
  for (const pagina of paginas) {
    if (pagina.caixa.vazia) continue;
    const { escala, deitar } = await desenharTermica(saida, origem, pagina);
    etiquetas.push({ pagina: pagina.indice + 1, tipo: tipoDaPagina(pagina), escala, deitar });
  }
  if (!etiquetas.length) throw new Error('o arquivo só tem páginas em branco.');
  return { bytes: await saida.save(), folhas: saida.getPageCount(), etiquetas };
}

async function processar(bytes, porFolha = 1) {
  const paginas = await lerPaginas(bytes);
  if (porFolha === 'termica') {
    return { paginas: paginas.length, ...(await montarTermica(bytes, paginas)) };
  }
  const pares = parear(paginas);
  const resultado = await montar(bytes, paginas, pares, porFolha);
  return { paginas: paginas.length, pares, ...resultado };
}

const ROTULO_MODELO = {
  nota: 'DANFE + etiqueta',
  packing: 'Etiqueta + packing list',
  solta: 'Peça sem par',
};

function plural(quantidade, singular, pluralTexto) {
  return quantidade === 1 ? singular : pluralTexto;
}

function criarElemento(tag, atributos = {}, filhos = []) {
  const el = document.createElement(tag);
  Object.entries(atributos).forEach(([chave, valor]) => {
    if (chave === 'texto') el.textContent = valor;
    else el.setAttribute(chave, valor);
  });
  filhos.forEach((filho) => el.append(filho));
  return el;
}

function textoDoDestinatario(par) {
  if (!par.destinatario) return '';
  if (par.conferencia === 'confere') return `✓ ${par.destinatario}`;
  if (par.conferencia === 'diverge') return `⚠ ${par.destinatario}`;
  return par.destinatario;
}

function botoesDoPdf(bytes, nomeSaida) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  return criarElemento('div', { class: 'acoes' }, [
    criarElemento('a', { class: 'botao', href: url, download: nomeSaida, texto: 'Baixar PDF' }),
    criarElemento('a', { class: 'botao secundario', href: url, target: '_blank', rel: 'noopener', texto: 'Abrir para imprimir' }),
  ]);
}

function tabela(titulo, colunas, linhas) {
  return criarElemento('details', {}, [
    criarElemento('summary', { texto: titulo }),
    criarElemento('table', {}, [
      criarElemento('thead', {}, [criarElemento('tr', {}, colunas.map((t) => criarElemento('th', { texto: t })))]),
      criarElemento('tbody', {}, linhas.map((celulas) =>
        criarElemento('tr', {}, celulas.map((t) => criarElemento('td', { texto: t })))
      )),
    ]),
  ]);
}

const ROTULO_PAGINA = { danfe: 'DANFE', etiqueta: 'Etiqueta', packing: 'Packing list', vazia: 'Etiqueta (imagem)' };

function cartaoTermico(nome, resultado) {
  const { etiquetas, paginas, folhas } = resultado;
  const avisos = etiquetas
    .filter((e) => e.escala < ESCALA_ATENCAO)
    .map((e) => `Página ${e.pagina}: reduzida para ${Math.round(e.escala * 100)}% para caber. Teste a leitura do código de barras.`);
  const ignoradas = paginas - folhas;
  if (ignoradas) avisos.push(`${ignoradas} ${plural(ignoradas, 'página em branco foi ignorada', 'páginas em branco foram ignoradas')}.`);

  return criarElemento('section', { class: 'cartao' }, [
    criarElemento('h2', { texto: nome }),
    criarElemento('p', {
      class: 'resumo',
      texto: `${folhas} ${plural(folhas, 'etiqueta', 'etiquetas')} 10×15 cm. Imprima com papel 100×150 mm em tamanho real (100%).`,
    }),
    botoesDoPdf(resultado.bytes, `10x15-${nome}`),
    ...avisos.map((aviso) => criarElemento('p', { class: 'aviso', texto: aviso })),
    tabela('Ver etiquetas', ['Página', 'Tipo', 'Tamanho'], etiquetas.map((e) => [
      String(e.pagina),
      ROTULO_PAGINA[e.tipo],
      `${Math.round(e.escala * 100)}%${e.deitar ? ' (girada)' : ''}`,
    ])),
  ]);
}

function cartaoDeResultado(nome, resultado, porFolha) {
  if (porFolha === 'termica') return cartaoTermico(nome, resultado);

  const semPar = resultado.pares.filter((p) => p.modelo === 'solta').length;
  const porOrdem = resultado.pares.filter((p) => p.metodo === 'ordem das páginas').length;

  const linhas = resultado.pares.map((par, i) => [
    String(i + 1),
    par.rotulo,
    ROTULO_MODELO[par.modelo],
    par.metodo ? `por ${par.metodo}` : '—',
    textoDoDestinatario(par),
  ]);

  const divergentes = resultado.pares.filter((p) => p.conferencia === 'diverge');
  const avisos = [...resultado.avisos];
  if (semPar) avisos.push(`${semPar} peça(s) ficaram sem par e saíram sozinhas em uma folha.`);
  if (porOrdem) avisos.push(`${porOrdem} ${plural(porOrdem, 'par foi juntado', 'pares foram juntados')} pela ordem das páginas (a etiqueta não traz a chave nem o número da nota). Confira o destinatário na tabela.`);
  divergentes.forEach((par) =>
    avisos.push(`${par.rotulo}: o destinatário da etiqueta não parece ser o mesmo do DANFE. Confira antes de imprimir.`)
  );

  return criarElemento('section', { class: 'cartao' }, [
    criarElemento('h2', { texto: nome }),
    criarElemento('p', {
      class: 'resumo',
      texto: `${resultado.paginas} ${plural(resultado.paginas, 'página', 'páginas')} ${resultado.paginas === 1 ? 'virou' : 'viraram'} ${resultado.folhas} ${plural(resultado.folhas, 'folha', 'folhas')} A4 (${resultado.pares.length} ${plural(resultado.pares.length, 'pedido', 'pedidos')}).`,
    }),
    botoesDoPdf(resultado.bytes, `A4-${porFolha}por-folha-${nome}`),
    ...avisos.map((aviso) => criarElemento('p', { class: 'aviso', texto: aviso })),
    tabela('Ver pedidos', ['#', 'Pedido', 'Tipo', 'Pareamento', 'Destinatário'], linhas),
  ]);
}

function cartaoDeErro(nome, erro) {
  return criarElemento('section', { class: 'cartao erro' }, [
    criarElemento('h2', { texto: nome }),
    criarElemento('p', { class: 'aviso', texto: `Não consegui ler este arquivo: ${erro.message || erro}` }),
  ]);
}

const CHAVE_PREFERENCIA = 'etiquetas-por-folha';
let arquivosAtuais = [];

function pedidosPorFolha() {
  const { value } = document.querySelector('input[name="porFolha"]:checked');
  return value === 'termica' ? value : Number(value);
}

function lembrarPreferencia() {
  try {
    const salva = localStorage.getItem(CHAVE_PREFERENCIA);
    const opcao = document.querySelector(`input[name="porFolha"][value="${salva}"]`);
    if (opcao) opcao.checked = true;
  } catch (erro) {
    return;
  }
}

function guardarPreferencia() {
  try {
    localStorage.setItem(CHAVE_PREFERENCIA, String(pedidosPorFolha()));
  } catch (erro) {
    return;
  }
}

async function tratarArquivos(arquivos) {
  const lista = [...arquivos].filter((a) => /\.pdf$/i.test(a.name) || a.type === 'application/pdf');
  const saida = document.getElementById('resultados');
  const status = document.getElementById('status');
  if (!lista.length) {
    status.textContent = 'Selecione arquivos em PDF.';
    return;
  }
  arquivosAtuais = lista;
  saida.replaceChildren();
  const porFolha = pedidosPorFolha();
  for (const arquivo of lista) {
    status.textContent = `Processando ${arquivo.name}…`;
    try {
      const bytes = new Uint8Array(await arquivo.arrayBuffer());
      saida.append(cartaoDeResultado(arquivo.name, await processar(bytes, porFolha), porFolha));
    } catch (erro) {
      console.error(erro);
      saida.append(cartaoDeErro(arquivo.name, erro));
    }
  }
  status.textContent = 'Pronto.';
}

function iniciarInterface() {
  const zona = document.getElementById('zona');
  const entrada = document.getElementById('entrada');

  lembrarPreferencia();
  entrada.addEventListener('change', () => tratarArquivos(entrada.files));
  document.querySelectorAll('input[name="porFolha"]').forEach((opcao) =>
    opcao.addEventListener('change', () => {
      guardarPreferencia();
      if (arquivosAtuais.length) tratarArquivos(arquivosAtuais);
    })
  );
  ['dragenter', 'dragover'].forEach((evento) =>
    zona.addEventListener(evento, (e) => {
      e.preventDefault();
      zona.classList.add('ativa');
    })
  );
  ['dragleave', 'drop'].forEach((evento) =>
    zona.addEventListener(evento, (e) => {
      e.preventDefault();
      zona.classList.remove('ativa');
    })
  );
  zona.addEventListener('drop', (e) => tratarArquivos(e.dataTransfer.files));
}

window.processar = processar;
iniciarInterface();
