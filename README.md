# RTP Site Limpo Sem Erro

Suba todos os arquivos deste ZIP em um repositório vazio.

Arquivos importantes:
- .github/workflows/main.yml
- scripts/scrape-rtp.js
- data/rtp-pgsoft.json
- data/platforms.json
- server.js
- public/index.html

Depois de subir:
1. Render faz o deploy do site.
2. GitHub Actions atualiza data/rtp-pgsoft.json.
3. O Render lê o JSON pelo raw.githubusercontent.com.
