import fs from 'fs';
import puppeteer from 'puppeteer';

const OUTPUT = './data/rtp-pgsoft.json';

const FONTES = [
  {
    nome: 'Porcentagem Slots PGSoft',
    url: 'https://porcentagem-slots.com/pgsoft',
    tipo: 'porcentagem-slots-texto'
  },
  {
    nome: 'POP555 PGSoft',
    url: 'https://pop555.net/rtp-pgsoft/',
    tipo: 'pop555-texto'
  }
];

function limparTexto(texto) {
  return String(texto || '').replace(/\s+/g, ' ').trim();
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

async function aceitarIdadeSeAparecer(page) {
  try {
    await page.evaluate(() => {
      const possiveis = [...document.querySelectorAll('button, a, div, span')]
        .filter(el => {
          const txt = (el.innerText || '').trim().toLowerCase();
          return txt === 'sim' || txt === 'tenho mais de 18 anos' || txt.includes('maior de 18');
        });

      if (possiveis[0]) possiveis[0].click();
    });

    await new Promise(resolve => setTimeout(resolve, 1000));
  } catch {}
}

function nomeBloqueado(nome) {
  const n = normalizarChave(nome);

  if (!n || n.length < 3) return true;
  if (/^[0-9]{1,3}%$/.test(n)) return true;
  if (/^[0-9]{1,2} [0-9]{1,2} [0-9]{4}/.test(n)) return true;

  const bloqueios = [
    'rtp pg soft',
    'slots patrocinados',
    'pg soft',
    'pragmatic play',
    'reel kingdom',
    'playtech',
    'fa chai',
    'jili',
    'jdb',
    'cq9 gaming',
    'microgaming',
    'rtg slots',
    'onetouch',
    'play n go',
    'yggdrasil',
    'flow gaming',
    'betsoft',
    'astrotech',
    'funky games',
    'ttg slot',
    'habanero',
    'spadegaming',
    'playstar',
    'live22',
    'joker',
    'ion slot',
    'slot88',
    'crowd play',
    'avantplay',
    'mostrar mais',
    'mostrar menos',
    'jogue com responsabilidade',
    'verificacao de idade',
    'verificacao',
    'este site so pode',
    'voce tem mais de 18 anos',
    'sim nao',
    'nao compartilhe',
    'link copiado',
    'publi',
    'moeda',
    'inicio',
    'ajuda',
    'instagram',
    'copyright'
  ];

  return bloqueios.some(b => n.includes(b));
}

function extrairPorLinhas(linhas, fonteNome) {
  const itens = [];

  for (let i = 0; i < linhas.length; i++) {
    let nome = limparTexto(linhas[i]);

    if (nome.startsWith('######')) {
      nome = limparTexto(nome.replace(/^#+/, ''));
    }

    if (nomeBloqueado(nome)) continue;

    let rtp = '';

    for (let j = i + 1; j <= i + 8 && j < linhas.length; j++) {
      const linha = limparTexto(linhas[j]);

      if (!linha) continue;
      if (nomeBloqueado(linha) && !/\b[0-9]{1,3}%\b/.test(linha)) continue;

      const achou = normalizarRtp(linha);
      if (achou) {
        rtp = achou;
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

async function buscarPorcentagemSlotsTexto(page, fonte) {
  await page.goto(fonte.url, {
    waitUntil: 'domcontentloaded',
    timeout: 70000
  });

  await aceitarIdadeSeAparecer(page);

  await page.waitForFunction(() => {
    const texto = document.body?.innerText || '';
    return texto.includes('%') && texto.toLowerCase().includes('pg soft');
  }, { timeout: 30000 });

  const linhas = await page.evaluate(() => {
    return (document.body.innerText || '')
      .split('\n')
      .map(l => l.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
  });

  return extrairPorLinhas(linhas, fonte.nome);
}

async function buscarPop555Texto(page, fonte) {
  await page.goto(fonte.url, {
    waitUntil: 'domcontentloaded',
    timeout: 70000
  });

  await page.waitForFunction(() => {
    const texto = document.body?.innerText || '';
    return texto.includes('%');
  }, { timeout: 30000 });

  const itensDOM = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.card, .card-content, .content, article, div')];

    return cards
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

  if (itensDOM.length >= 20) {
    return removerDuplicados(
      itensDOM.map((item, index) => ({
        nome: item.nome || `Jogo PGSoft ${index + 1}`,
        imagem: item.imagem || imagemPadrao(index + 1),
        rtp: normalizarRtp(item.rtp),
        atualizado_em: new Date().toISOString(),
        fonte: fonte.nome
      })).filter(item => item.rtp)
    );
  }

  const linhas = await page.evaluate(() => {
    return (document.body.innerText || '')
      .split('\n')
      .map(l => l.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
  });

  return extrairPorLinhas(linhas, fonte.nome);
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

  await page.setViewport({ width: 1366, height: 900 });

  let resultado = [];
  let fonteUsada = '';

  for (const fonte of FONTES) {
    try {
      console.log(`Tentando fonte: ${fonte.nome} - ${fonte.url}`);

      if (fonte.tipo === 'porcentagem-slots-texto') {
        resultado = await buscarPorcentagemSlotsTexto(page, fonte);
      } else if (fonte.tipo === 'pop555-texto') {
        resultado = await buscarPop555Texto(page, fonte);
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
} finally {
  if (browser) await browser.close();
}
