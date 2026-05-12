import fs from 'fs';
import puppeteer from 'puppeteer';

const FONTE_RTP = 'https://pop555.net/rtp-pgsoft/';
const OUTPUT = './data/rtp-pgsoft.json';

function normalizarRtp(texto) {
  const encontrado = String(texto || '').match(/[0-9]{1,3}%/);
  return encontrado ? encontrado[0] : '';
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

  await page.goto(FONTE_RTP, {
    waitUntil: 'networkidle2',
    timeout: 60000
  });

  await page.waitForSelector('.card', { timeout: 30000 });

  const dados = await page.evaluate(() => {
    return [...document.querySelectorAll('.card')]
      .map((card, index) => {
        const img = card.querySelector('img');
        const texto = card.innerText || '';
        const rtp = texto.match(/[0-9]{1,3}%/)?.[0] || '';

        return {
          nome: img?.alt?.trim() || img?.title?.trim() || `Jogo PGSoft ${index + 1}`,
          imagem: img?.src || img?.getAttribute('data-src') || '',
          rtp
        };
      })
      .filter(item => item.imagem && item.rtp);
  });

  const limpos = dados
    .map((item, index) => ({
      nome: item.nome || `Jogo PGSoft ${index + 1}`,
      imagem: item.imagem,
      rtp: normalizarRtp(item.rtp),
      atualizado_em: new Date().toISOString()
    }))
    .filter(item => item.imagem && item.rtp);

  if (!limpos.length) throw new Error('Nenhum card RTP encontrado.');

  fs.mkdirSync('./data', { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(limpos, null, 2), 'utf-8');

  console.log(`Arquivo atualizado com ${limpos.length} jogos.`);
} catch (erro) {
  console.error('Falha ao atualizar RTP:', erro.message);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
}
