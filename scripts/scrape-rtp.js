import fs from 'fs';
import puppeteer from 'puppeteer';

const OUTPUT = './data/rtp-pgsoft.json';

const FONTES = [
  {
    nome: 'Porcentagem Slots PGSoft',
    url: 'https://porcentagem-slots.com/pgsoft',
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

function limparNome(nome) {
  return String(nome || '').replace(/\s+/g, ' ').trim();
}

function chave(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
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

    await new Promise(resolve => setTimeout(resolve, 1000));
  } catch {}
}

async function buscarPorcentagemSlots(page, fonte) {
  await page.goto(fonte.url, {
    waitUntil: 'domcontentloaded',
    timeout: 70000
  });

  await aceitarIdadeSeAparecer(page);

  await page.waitForFunction(() => {
    const texto = document.body?.innerText || '';
    return texto.includes('%') && document.querySelectorAll('img').length > 20;
  }, { timeout: 30000 });

  const dados = await page.evaluate(() => {
    const limpar = texto => String(texto || '').replace(/\s+/g, ' ').trim();

    const isNomeRuim = (nome) => {
      const n = limpar(nome).toLowerCase();
      if (!n || n.length < 3) return true;
      if (/^\d{1,3}%$/.test(n)) return true;
      if (n === 'moeda') return true;
      if (n.includes('maiores de 18')) return true;
      if (n.includes('jogue com responsabilidade')) return true;
      if (n.includes('apostar')) return true;
      if (n.includes('link copiado')) return true;
      if (n.includes('instagram')) return true;
      return false;
    };

    const itens = [];

    for (const img of [...document.querySelectorAll('img')]) {
      const nome = limpar(img.alt || img.title || img.getAttribute('aria-label') || '');
      const imagem = img.currentSrc || img.src || img.getAttribute('data-src') || '';

      if (isNomeRuim(nome) || !imagem) continue;

      let atual = img;
      let rtp = '';

      for (let subida = 0; subida < 6 && atual && !rtp; subida++) {
        const txt = atual.innerText || atual.parentElement?.innerText || '';
        const achou = txt.match(/\b([0-9]{1,3})%\b/);
        if (achou) {
          const n = Number(achou[1]);
          if (n >= 1 && n <= 100) rtp = `${n}%`;
        }

        atual = atual.parentElement;
      }

      if (!rtp) {
        const todos = (document.body.innerText || '').split('\n').map(limpar).filter(Boolean);
        const idx = todos.findIndex(l => l === nome);
        if (idx >= 0) {
          for (let i = idx + 1; i <= idx + 5 && i < todos.length; i++) {
            const achou = todos[i].match(/\b([0-9]{1,3})%\b/);
            if (achou) {
              const n = Number(achou[1]);
              if (n >= 1 && n <= 100) rtp = `${n}%`;
              break;
            }
          }
        }
      }

      if (rtp) itens.push({ nome, imagem, rtp });
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

      if (fonte.tipo === 'porcentagem-slots') {
        resultado = await buscarPorcentagemSlots(page, fonte);
      } else if (fonte.tipo === 'pop555') {
        resultado = await buscarPop555(page, fonte);
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
