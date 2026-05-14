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

function removerDuplicados(lista) {
  const vistos = new Set();
  const saida = [];

  for (const item of lista) {
    const chave = item.imagem || item.nome;
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

  browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
  );

  await page.setViewport({ width: 1366, height: 1600 });

  await page.goto(FONTE_RTP, {
    waitUntil: 'networkidle2',
    timeout: 70000
  });

  await page.evaluate(async () => {
    await new Promise(resolve => {
      let total = 0;
      const timer = setInterval(() => {
        window.scrollBy(0, 900);
        total += 900;

        if (total >= document.body.scrollHeight + 2000) {
          clearInterval(timer);
          resolve();
        }
      }, 120);
    });

    window.scrollTo(0, 0);
  });

  await page.waitForFunction(() => {
    const texto = document.body?.innerText || '';
    const imgs = [...document.querySelectorAll('img')]
      .filter(img => {
        const src = img.currentSrc || img.src || img.getAttribute('data-src') || '';
        return /pgsoft|POPBRA-PGSOFT|assets\/rtp/i.test(src);
      });

    return texto.includes('%') && imgs.length >= 20;
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

    function pegarRtpPeloAncestral(img) {
      let atual = img;

      for (let i = 0; i < 9 && atual; i++) {
        const texto = atual.innerText || '';
        const rtp = normalizarRtp(texto);

        if (rtp) return rtp;

        atual = atual.parentElement;
      }

      return '';
    }

    function pegarRtpPorOrdem(index) {
      const candidatos = [...document.querySelectorAll(
        '[id^="percent-txt"], .percent p, .percent, p, span, div'
      )]
        .map(el => normalizarRtp(el.innerText || el.textContent || ''))
        .filter(Boolean);

      return candidatos[index] || '';
    }

    const imagens = [...document.querySelectorAll('img')]
      .map((img, index) => {
        const src =
          img.currentSrc ||
          img.src ||
          img.getAttribute('data-src') ||
          img.getAttribute('data-lazy-src') ||
          '';

        return {
          index,
          src,
          alt: limparTexto(img.alt || img.title || '')
        };
      })
      .filter(item => /pgsoft|POPBRA-PGSOFT|assets\/rtp/i.test(item.src));

    return imagens.map((item, index) => {
      const img = [...document.querySelectorAll('img')]
        .filter(el => {
          const src =
            el.currentSrc ||
            el.src ||
            el.getAttribute('data-src') ||
            el.getAttribute('data-lazy-src') ||
            '';
          return src === item.src;
        })[0];

      const rtp = img ? (pegarRtpPeloAncestral(img) || pegarRtpPorOrdem(index)) : pegarRtpPorOrdem(index);

      return {
        nome: item.alt || `Jogo PGSoft ${index + 1}`,
        imagem: item.src,
        rtp
      };
    }).filter(item => item.imagem && item.rtp);
  });

  const resultado = removerDuplicados(
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
  console.log(`Amostra: ${resultado.slice(0, 5).map(x => `${x.nome} ${x.rtp}`).join(' | ')}`);

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
