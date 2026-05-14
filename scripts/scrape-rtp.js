import fs from 'fs';
import puppeteer from 'puppeteer';

const OUTPUT = './data/rtp-pgsoft.json';
const FONTE_RTP = 'https://pop555.net/rtp-pgsoft/';

function limparTexto(texto) {
  return String(texto || '').replace(/\s+/g, ' ').trim();
}

function normalizarRtp(texto) {
  const match = String(texto || '').match(/\b([0-9]{1,3})%\b/);
  if (!match) return '';
  const numero = Number(match[1]);
  if (Number.isNaN(numero) || numero < 1 || numero > 100) return '';
  return `${numero}%`;
}

function removerDuplicadosPorImagem(lista) {
  const vistos = new Set();
  const saida = [];

  for (const item of lista) {
    const chave = item.imagem;
    if (!chave || vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push(item);
  }

  return saida;
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
  console.log('Fonte ativa: POP555 PGSoft');
  console.log(`Abrindo: ${FONTE_RTP}`);
  console.log('SCRIPT POP555 ORDEM V2 ATIVO');

  browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  });

  const page = await browser.newPage();

  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
  );

  await page.setViewport({ width: 1366, height: 2200 });

  await page.goto(FONTE_RTP, {
    waitUntil: 'networkidle2',
    timeout: 70000
  });

  await page.evaluate(async () => {
    await new Promise(resolve => {
      let total = 0;
      const timer = setInterval(() => {
        window.scrollBy(0, 1000);
        total += 1000;

        if (total >= document.body.scrollHeight + 3000) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });

    window.scrollTo(0, 0);
  });

  await page.waitForFunction(() => {
    const texto = document.body?.innerText || '';
    return (texto.match(/\b[0-9]{1,3}%\b/g) || []).length >= 20;
  }, { timeout: 45000 });

  const dados = await page.evaluate(() => {
    function limparTexto(texto) {
      return String(texto || '').replace(/\s+/g, ' ').trim();
    }

    function normalizarRtp(texto) {
      const match = String(texto || '').match(/\b([0-9]{1,3})%\b/);
      if (!match) return '';
      const numero = Number(match[1]);
      if (Number.isNaN(numero) || numero < 1 || numero > 100) return '';
      return `${numero}%`;
    }

    function normalizarSrc(src) {
      if (!src) return '';

      try {
        return new URL(src, location.href).href;
      } catch {
        return src;
      }
    }

    const imagens = [...document.querySelectorAll('img')]
      .map((img, index) => {
        const src = normalizarSrc(
          img.currentSrc ||
          img.src ||
          img.getAttribute('data-src') ||
          img.getAttribute('data-lazy-src') ||
          ''
        );

        const alt = limparTexto(
          img.alt ||
          img.title ||
          img.getAttribute('aria-label') ||
          ''
        );

        return { index, src, alt };
      })
      .filter(item => {
        return item.src &&
          /pgsoft|POPBRA-PGSOFT|assets\/rtp/i.test(item.src) &&
          !/logo|favicon|icon/i.test(item.src);
      });

    const rtpPeloTexto = (document.body.innerText || '')
      .match(/\b([0-9]{1,3})%\b/g) || [];

    const rtps = rtpPeloTexto
      .map(normalizarRtp)
      .filter(Boolean);

    console.log('DEBUG_BROWSER imagens=' + imagens.length + ' rtps=' + rtps.length);

    return imagens.map((item, index) => ({
      nome: item.alt || `Jogo PGSoft ${index + 1}`,
      imagem: item.src,
      rtp: rtps[index] || ''
    })).filter(item => item.imagem && item.rtp);
  });

  const resultado = removerDuplicadosPorImagem(
    dados
      .map((item, index) => ({
        nome: limparTexto(item.nome) || `Jogo PGSoft ${index + 1}`,
        imagem: item.imagem,
        rtp: normalizarRtp(item.rtp),
        atualizado_em: new Date().toISOString(),
        fonte: 'POP555 PGSoft'
      }))
      .filter(item => item.nome && item.imagem && item.rtp)
  );

  console.log(`Jogos encontrados: ${resultado.length}`);
  console.log(`Amostra: ${resultado.slice(0, 8).map(x => `${x.nome} ${x.rtp}`).join(' | ')}`);

  if (resultado.length < 20) {
    const atual = carregarJsonAtual();

    if (atual.length) {
      console.log('Poucos jogos encontrados. Mantendo JSON atual para nao quebrar o site.');
      process.exit(0);
    }

    throw new Error(`Poucos jogos encontrados: ${resultado.length}`);
  }

  fs.mkdirSync('./data', { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(resultado, null, 2), 'utf-8');

  console.log(`Atualizado com ${resultado.length} jogos.`);
  console.log('Fonte usada: POP555 PGSoft');
} catch (erro) {
  console.error('Falha ao atualizar RTP:', erro.message);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
}
