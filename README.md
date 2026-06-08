# LMAerofit

Plataforma cockpit para triatletas — análise de performance, pacing, fueling e gear lab.

## Estrutura

```
/
├── index.html              ← página principal (cockpit)
├── aero-bike.html          ← módulo Aero Bike
├── race-briefing.html      ← briefing de prova com predição de desempenho
├── race-fueling.html       ← plano de hidratação/nutrição da prova
├── fuel-lab.html           ← laboratório de fueling
├── gear-lab.html           ← laboratório de equipamentos
├── session-debrief.html    ← análise pós-treino
│
├── assets/
│   ├── cockpit.css         ← estilos globais
│   ├── profile.js          ← perfil do atleta + engine de predição
│   └── lmaerofit-logo*.png
│
└── icons/                  ← favicons + ícones PWA
```

## Deploy

100% estático — basta servir os arquivos. Compatível com GitHub Pages, Netlify, Vercel, Cloudflare Pages.

### GitHub Pages
1. Suba os arquivos na raiz do repositório
2. Settings → Pages → Source: `main` / `(root)`
3. Acesse `https://<usuario>.github.io/<repo>/`
