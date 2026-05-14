import fs from 'fs';
import puppeteer from 'puppeteer';

const OUTPUT = './data/rtp-pgsoft.json';

const FONTES = [
  {
    nome: 'Porcentagem Slots PGSoft',
    url: 'https://porcentagem-slots.com/',
    tipo: 'porcentagem-slots'
  },
  {
    nome: 'POP555 PGSoft',
    url: 'https://pop555.net/rtp-pgsoft/',
    tipo: 'pop555'
  }
];

function normalizarRtp(texto) {
  const encontrado = String(texto || '').match(/\b([0-9]{1,3})%\b/);
  if (!encontrado) return '';
  const numero = Number(encontrado[1]);
  if (Number.isNaN(numero) || numero < 1 || numero > 100) return '';
  return `${numero}%`;
}

function chave(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function limparNome(nome) {
  return String(nome || '').replace(/\s+/g, ' ').trim();
}

function removerDuplicados(lista) {
  const vistos = new Set();
  const saida = [];

  for (const item of lista) {
    const k = chave(item.nome);
    if (!k || vistos.has(k)) continue;
    vistos.add(k);
    saida.push(item);
  }

  return saida;
}

async function aceitarIdadeSeAparecer(page) {
  try {
    await page.evaluate(() => {
      const botoes = [...document.querySelectorAll('button, a, div, span')]
        .filter(el => (el.innerText || '').trim().toLowerCase() === 'sim');
      if (botoes[0]) botoes[0].click();
    });

    await new Promise(resolve => setTimeout(resolve, 1200));
  } catch {}
}

async function buscarPorcentagemSlots(page, fonte) {
  await page.goto(fonte.url, {
    waitUntil: 'networkidle2',
    timeout: 70000
  });

  await aceitarIdadeSeAparecer(page);

  const dados = await page.evaluate(() => {
    const normalizar = texto => String(texto || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

    const limpar = texto => String(texto || '').replace(/\s+/g, ' ').trim();

    const bloqueados = new Set([
      'rtp pg soft', 'slots patrocinados', 'pg soft', 'pragmatic play',
      'reel kingdom', 'playtech', 'fa chai', 'jili', 'jdb', 'cq9 gaming',
      'microgaming', 'rtg slots', 'onetouch', 'play n go', 'yggdrasil',
      'flow gaming', 'betsoft', 'astrotech', 'funky games', 'ttg slot',
      'habanero', 'spadegaming', 'playstar', 'live22', 'joker', 'ion slot',
      'slot88', 'crowd play', 'avantplay', 'mostrar mais', 'mostrar menos',
      'sim', 'nao', 'não', 'link copiado', 'publi', 'inicio', 'início', 'ajuda'
    ]);

    const aviso = /jogue com responsabilidade|apostar pode|aposta nao|aposta não|maiores de 18|verificacao de idade|verificação de idade/i;

    const imagens = new Map(
      [...document.querySelectorAll('img')]
        .map(img => {
          const alt = limpar(img.alt || img.title || img.getAttribute('aria-label') || '');
          const src = img.currentSrc || img.src || img.getAttribute('data-src') || '';
          return [normalizar(alt), { alt, src }];
        })
        .filter(([k, v]) => k && v.src && !/moeda|instagram|maiores|idade|logo/i.test(v.alt))
    );

    const linhas = (document.body.innerText || '')
      .split('\n')
      .map(limpar)
      .filter(Boolean);

    const itens = [];

    for (let i = 0; i < linhas.length; i++) {
      const nome = limpar(linhas[i]);
      const nomeKey = normalizar(nome);

      if (!nome || nome.length < 3) continue;
      if (bloqueados.has(nomeKey)) continue;
      if (aviso.test(nome)) continue;
      if (/^\d{1,3}%$/.test(nome)) continue;
      if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(nome)) continue;

      let rtp = '';

      for (let j = i + 1; j <= i + 6 && j < linhas.length; j++) {
        const linha = linhas[j];
        if (aviso.test(linha)) continue;

        const achou = linha.match(/\b([0-9]{1,3})%\b/);
        if (achou) {
          const n = Number(achou[1]);
          if (n >= 1 && n <= 100) rtp = `${n}%`;
          break;
        }
      }

      if (!rtp) continue;

      const img = imagens.get(nomeKey);
      if (!img || !img.src) continue;

      itens.push({ nome, imagem: img.src, rtp });
    }

    return itens;
  });

  return removerDuplicados(
    dados
      .map((item, index) => ({
        nome: limparNome(item.nome) || `Jogo PGSoft ${index + 1}`,
        imagem: item.imagem,
        rtp: normalizarRtp(item.rtp),
        atualizado_em: new Date().toISOString(),
        fonte: fonte.nome
      }))
      .filter(item => item.nome && item.imagem && item.rtp)
  );
}

async function buscarPop555(page, fonte) {
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
        nome: limparNome(item.nome) || `Jogo PGSoft ${index + 1}`,
        imagem: item.imagem,
        rtp: normalizarRtp(item.rtp),
        atualizado_em: new Date().toISOString(),
        fonte: fonte.nome
      }))
      .filter(item => item.nome && item.imagem && item.rtp)
  );
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
      console.log(`Tentando fonte: ${fonte.nome}`);

      if (fonte.tipo === 'porcentagem-slots') {
        resultado = await buscarPorcentagemSlots(page, fonte);
      } else if (fonte.tipo === 'pop555') {
        resultado = await buscarPop555(page, fonte);
      }

      if (resultado.length >= 20) {
        fonteUsada = fonte.nome;
        break;
      }

      console.log(`Fonte ${fonte.nome} retornou poucos jogos: ${resultado.length}`);
    } catch (erroFonte) {
      console.error(`Fonte falhou: ${fonte.nome}`, erroFonte.message);
    }
  }

  if (!resultado.length) {
    throw new Error('Nenhuma fonte retornou jogos suficientes.');
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
