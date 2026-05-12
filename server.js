import express from 'express';
import cors from 'cors';
import fs from 'fs';

const app = express();
const PORT = process.env.PORT || 3000;

const GITHUB_JSON_URL = process.env.GITHUB_JSON_URL || 'https://raw.githubusercontent.com/wericky15/rtp-site-render/main/data/rtp-pgsoft.json';

app.use(cors());
app.use(express.static('public'));

let cache = [];
let cacheTime = 0;
const CACHE_MS = 30000;

function normalizarLista(dados) {
  if (!Array.isArray(dados)) return [];

  return dados
    .map((item, index) => ({
      nome: item.nome || `Jogo PGSoft ${index + 1}`,
      imagem: item.imagem || '',
      rtp: item.rtp || '',
      atualizado_em: item.atualizado_em || null
    }))
    .filter(item => item.imagem && item.rtp);
}

function lerLocal(caminho) {
  return JSON.parse(fs.readFileSync(caminho, 'utf-8'));
}

app.get('/api/rtp-pgsoft', async (req, res) => {
  try {
    const agora = Date.now();

    if (cache.length && agora - cacheTime < CACHE_MS) {
      return res.json(cache);
    }

    const resposta = await fetch(`${GITHUB_JSON_URL}?v=${agora}`, {
      headers: { 'Cache-Control': 'no-cache' }
    });

    if (!resposta.ok) throw new Error(`GitHub JSON respondeu ${resposta.status}`);

    const dados = await resposta.json();
    cache = normalizarLista(dados);
    cacheTime = Date.now();

    if (!cache.length) throw new Error('JSON online vazio');

    res.json(cache);
  } catch (erro) {
    try {
      const local = normalizarLista(lerLocal('./data/rtp-pgsoft.json'));
      res.json(local);
    } catch (erroLocal) {
      res.status(500).json({
        erro: true,
        mensagem: 'Nao foi possivel carregar os RTPs.',
        detalhe: erro.message
      });
    }
  }
});

app.get('/api/platforms', (req, res) => {
  try {
    const plataformas = lerLocal('./data/platforms.json');
    const principal = plataformas.find(p => p.principal) || plataformas[0] || null;
    res.json({ principal, plataformas });
  } catch (erro) {
    res.status(500).json({
      erro: true,
      mensagem: 'Nao foi possivel carregar as plataformas.',
      detalhe: erro.message
    });
  }
});

app.get('/health', (req, res) => {
  res.json({ ok: true, mode: 'limpo-sem-erro' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor online na porta ${PORT}`);
});
