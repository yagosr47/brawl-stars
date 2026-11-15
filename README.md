# ⭐ Arena Brawler

Jogo de ação 2D top-down estilo *Brawl Stars*, feito com **Vite + TypeScript estrito + HTML5 Canvas** (60 FPS) e CSS puro. Pronto para deploy na Vercel.

## 🎮 Modos de jogo

- **Pique-Gema (3v3):** colete 10 gemas e segure por 15s para vencer. Morrer derruba suas gemas!
- **Combate Solo (Showdown):** 6 jogadores, caixas com Cubos de Poder (+400 HP / +10% dano) e nuvens tóxicas fechando a arena. Último de pé vence.

## 🕹️ Controles

| Plataforma | Movimento | Ataque | Super |
|---|---|---|---|
| **PC** | WASD / Setas | Mouse + Clique Esquerdo | Clique Direito ou `Espaço` |
| **Mobile** | Joystick esquerdo fixo | Joystick direito flutuante (toque rápido = auto-aim) | Botão SUPER (toque = auto-aim, arraste = mirar) |

`F` alterna tela cheia.

## 🚀 Rodar localmente

```bash
npm install
npm run dev      # servidor de desenvolvimento
npm run build    # build de produção (tsc + vite)
npm run preview  # visualizar build
```

## 📦 Deploy na Vercel

```bash
npm run deploy
```

Ou conecte o repositório na Vercel (framework: Vite, output: `dist`).

## 🧩 Arquitetura

| Arquivo | Responsabilidade |
|---|---|
| `src/types.ts` | Tipagem estrita de entidades, ataques, tiles, IA e partículas |
| `src/constants.ts` | Balanceamento, dimensões, cores e constantes físicas |
| `src/brawlers.ts` | Definição dos 4 Brawlers |
| `src/input.ts` | Input híbrido PC + Mobile (Pointer Events + auto-aim) |
| `src/map.ts` | Gerador de arenas simétricas 40×28 |
| `src/physics.ts` | Colisão Círculo×AABB com deslizamento, LOS, knockback |
| `src/ai.ts` | FSM tática dos bots (steering, strafe, cobertura, super) |
| `src/audio.ts` | SFX procedurais via Web Audio API |
| `src/renderer.ts` | Câmera com lerp + screen shake, sombras, retículos, HUD canvas |
| `src/main.ts` | Game loop (dt limitado), telas e HUD |
