import fs from 'fs';
import puppeteer from 'puppeteer';

const OUTPUT = './data/rtp-pgsoft.json';

const FONTES = [
  {
    nome: 'Porcentagem Slots PGSoft',
    url: 'https://porcentagem-slots.com/pgsoft',
    tipo: 'porcentagem-headings'
  },
  {
    nome: 'POP555 PGSoft',
    url: 'https://pop555.net/rtp-pgsoft/',
    tipo: 'pop555-puppeteer'
  }
];

function limparTexto(texto) {
  return String(texto || '')
    .replace(/\\n/g, ' ')
    .replace(/\\t/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtml(texto) {
  return String(texto || '')
    .replace(/\\u003C/g, '<')
    .replace(/\\u003E/g, '>')
    .replace(/\\u0026/g, '&')
    .replace(/\\u0022/g, '"')
    .replace(/\\\//g, '/')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ');
}

function stripTags(trecho) {
  return limparTexto(
    decodeHtml(
      String(trecho || '')
        .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
    )
  );
}

function normalizarChave(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizarRtp(texto) {
  const encontrado = String(texto || '').match(/\b([0-9]{1,3})%\b/);
  if (!encontrado) return '';
  const numero = Number(encontrado[1]);
  if (Number.isNaN(numero) || numero < 1 || numero > 100) return '';
  return `${numero}%`;
}

function imagemPadrao(index) {
  return `https://cadastro.popboaa.com/assets/rtp/pgsoft/POPBRA-PGSOFT${index}.webp`;
}

function removerDuplicados(lista) {
  const vistos = new Set();
  const saida = [];

  for (const item of lista) {
    const chave = normalizarChave(item.nome);
    if (!chave || vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push(item);
  }

  return saida;
}

function nomeBloqueado(nome) {
  const n = normalizarChave(nome);

  if (!n || n.length < 3) return true;
  if (/^[0-9]{1,3}$/.test(n)) return true;
  if (/^[0-9]{1,2} [0-9]{1,2} [0-9]{4}/.test(n)) return true;

  const bloqueios = [
    'rtp pg soft', 'slots patrocinados', 'pg soft', 'pragmatic play',
    'reel kingdom', 'playtech', 'fa chai', 'jili', 'jdb', 'cq9 gaming',
    'microgaming', 'rtg slots', 'onetouch', 'play n go', 'yggdrasil',
    'flow gaming', 'betsoft', 'astrotech', 'funky games', 'ttg slot',
    'habanero', 'spadegaming', 'playstar', 'live22', 'joker', 'ion slot',
    'slot88', 'crowd play', 'avantplay', 'mostrar mais', 'mostrar menos',
    'jogue com responsabilidade', 'verificacao de idade', 'verificação de idade',
    'este site so pode', 'este site só pode', 'voce tem mais de 18 anos',
    'você tem mais de 18 anos', 'nao compartilhe', 'não compartilhe',
    'link copiado', 'publi', 'moeda', 'inicio', 'início', 'ajuda',
    'instagram', 'copyright', 'somente para maiores', 'porcentagem de slots',
    'play'
  ];

  return bloqueios.some(b => n.includes(normalizarChave(b)));
}

function extrairAtributo(tag, attr) {
  const re = new RegExp(`${attr}\\s*=\\s*["']([^"']+)["']`, 'i');
  const match = tag.match(re);
  return match ? decodeHtml(match[1]) : '';
}

function ultimaImagemAntes(html, posicao) {
  const trechoAntes = html.slice(Math.max(0, posicao - 5000), posicao);
  const tags = trechoAntes.match(/<img\b[^>]*>/gi) || [];

  for (let i = tags.length - 1; i >= 0; i--) {
    const tag = tags[i];

    const alt = limparTexto(decodeHtml(
      extrairAtributo(tag, 'alt') ||
      extrairAtributo(tag, 'title') ||
      extrairAtributo(tag, 'aria-label')
    ));

    const src = decodeHtml(
      extrairAtributo(tag, 'src') ||
      extrairAtributo(tag, 'data-src') ||
      extrairAtributo(tag, 'data-lazy-src') ||
      extrairAtributo(tag, 'srcset')
    ).split(' ')[0];

    if (!src) continue;
    if (alt && nomeBloqueado(alt)) continue;

    return src;
  }

  return '';
}

function extrairPorHeadings(html, fonteNome) {
  const limpo = decodeHtml(html);

  const headingRe = /<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi;
  const headings = [];
  let m;

  while ((m = headingRe.exec(limpo)) !== null) {
    let nome = stripTags(m[1]).replace(/^#+\s*/, '');
    nome = limparTexto(nome);

    if (nomeBloqueado(nome)) continue;

    headings.push({
      nome,
      inicio: m.index,
      fim: headingRe.lastIndex
    });
  }

  console.log(`Headings candidatos: ${headings.length}`);
  console.log(`Primeiros headings: ${headings.slice(0, 10).map(h => h.nome).join(' | ')}`);

  const itens = [];

  for (let i = 0; i < headings.length; i++) {
    const atual = headings[i];
    const proximo = headings[i + 1];

    const fimBusca = proximo ? proximo.inicio : Math.min(limpo.length, atual.fim + 2500);
    const trechoDepois = limpo.slice(atual.fim, fimBusca);

    const rtp = normalizarRtp(stripTags(trechoDepois));
    if (!rtp) continue;

    const imagem = ultimaImagemAntes(limpo, atual.inicio) || imagemPadrao(itens.length + 1);

    itens.push({
      nome: atual.nome,
      imagem,
      rtp,
      atualizado_em: new Date().toISOString(),
      fonte: fonteNome
    });
  }

  return removerDuplicados(itens);
}

function htmlParaLinhasComScripts(html) {
  let texto = decodeHtml(html);

  texto = texto
    .replace(/<style\b[\s\S]*?<\/style>/gi, '\n')
    .replace(/<(br|hr)\b[^>]*>/gi, '\n')
    .replace(/<\/(div|p|li|h1|h2|h3|h4|h5|h6|section|article|header|footer|span|a|button)>/gi, '\n')
    .replace(/<[^>]+>/g, '\n');

  texto = decodeHtml(texto);

  return texto
    .split('\n')
    .map(limparTexto)
    .filter(Boolean);
}

function extrairPorLinhasFallback(html, fonteNome) {
  const linhas = htmlParaLinhasComScripts(html);
  const itens = [];

  for (let i = 0; i < linhas.length; i++) {
    let nome = linhas[i].replace(/^#+\s*/, '');
    nome = limparTexto(nome);

    if (nomeBloqueado(nome)) continue;
    if (normalizarRtp(nome)) continue;

    let rtp = '';

    for (let j = i + 1; j <= i + 12 && j < linhas.length; j++) {
      const linha = linhas[j];

      if (normalizarChave(linha).includes('jogue com responsabilidade')) continue;

      const achou = normalizarRtp(linha);
      if (achou) {
        rtp = achou;
        break;
      }

      const proximoNome = linha.replace(/^#+\s*/, '');
      if (!nomeBloqueado(proximoNome) && !normalizarRtp(proximoNome) && proximoNome.length > 3) {
        break;
      }
    }

    if (!rtp) continue;

    itens.push({
      nome,
      imagem: imagemPadrao(itens.length + 1),
      rtp,
      atualizado_em: new Date().toISOString(),
      fonte: fonteNome
    });
  }

  return removerDuplicados(itens);
}

async function buscarPorcentagemHeadings(fonte) {
  console.log('SCRIPT V6 HEADINGS ATIVO');

  const resposta = await fetch(fonte.url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      'Cache-Control': 'no-cache'
    }
  });

  if (!resposta.ok) {
    throw new Error(`HTTP ${resposta.status}`);
  }

  const html = await resposta.text();
  console.log(`HTML bytes: ${html.length}`);

  let resultado = extrairPorHeadings(html, fonte.nome);

  if (resultado.length < 20) {
    console.log('Poucos jogos por headings. Tentando fallback por linhas...');
    const fallback = extrairPorLinhasFallback(html, fonte.nome);
    if (fallback.length > resultado.length) resultado = fallback;
  }

  console.log(`Amostra: ${resultado.slice(0, 10).map(x => `${x.nome} ${x.rtp}`).join(' | ')}`);

  return resultado;
}

async function buscarPop555Puppeteer(fonte) {
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
    );

    await page.goto(fonte.url, {
      waitUntil: 'networkidle2',
      timeout: 70000
    });

    await page.waitForSelector('.card', { timeout: 30000 });

    const dados = await page.evaluate(() => {
      return [...document.querySelectorAll('.card')]
        .map((card, index) => {
          const img = card.querySelector('img');
          const texto = card.innerText || '';
          const rtp = texto.match(/\b[0-9]{1,3}%\b/)?.[0] || '';

          return {
            nome: img?.alt?.trim() || img?.title?.trim() || `Jogo PGSoft ${index + 1}`,
            imagem: img?.src || img?.getAttribute('data-src') || '',
            rtp
          };
        })
        .filter(item => item.imagem && item.rtp);
    });

    return removerDuplicados(
      dados
        .map((item, index) => ({
          nome: item.nome || `Jogo PGSoft ${index + 1}`,
          imagem: item.imagem || imagemPadrao(index + 1),
          rtp: normalizarRtp(item.rtp),
          atualizado_em: new Date().toISOString(),
          fonte: fonte.nome
        }))
        .filter(item => item.rtp)
    );
  } finally {
    if (browser) await browser.close();
  }
}

function carregarJsonAtual() {
  try {
    if (!fs.existsSync(OUTPUT)) return [];
    const atual = JSON.parse(fs.readFileSync(OUTPUT, 'utf-8'));
    return Array.isArray(atual) ? atual : [];
  } catch {
    return [];
  }
}

try {
  let resultado = [];
  let fonteUsada = '';

  for (const fonte of FONTES) {
    try {
      console.log(`Tentando fonte: ${fonte.nome} - ${fonte.url}`);

      if (fonte.tipo === 'porcentagem-headings') {
        resultado = await buscarPorcentagemHeadings(fonte);
      } else if (fonte.tipo === 'pop555-puppeteer') {
        resultado = await buscarPop555Puppeteer(fonte);
      }

      console.log(`Fonte ${fonte.nome} retornou ${resultado.length} jogos.`);

      if (resultado.length >= 20) {
        fonteUsada = fonte.nome;
        break;
      }
    } catch (erroFonte) {
      console.error(`Fonte falhou: ${fonte.nome}`, erroFonte.message);
    }
  }

  if (!resultado.length) {
    const atual = carregarJsonAtual();

    if (atual.length) {
      console.log('Nenhuma fonte atualizou. Mantendo JSON atual para nao quebrar o site.');
      process.exit(0);
    }

    throw new Error('Nenhuma fonte retornou jogos suficientes e nao existe JSON atual.');
  }

  fs.mkdirSync('./data', { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(resultado, null, 2), 'utf-8');

  console.log(`Atualizado com ${resultado.length} jogos.`);
  console.log(`Fonte usada: ${fonteUsada || 'desconhecida'}`);
} catch (erro) {
  console.error('Falha ao atualizar RTP:', erro.message);
  process.exitCode = 1;
}
