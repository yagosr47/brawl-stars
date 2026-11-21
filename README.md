# Among Us · Orbital Edition

Um jogo de fãs multiplayer para o navegador, recriado a partir de [arizkhalid/among-us-clone](https://github.com/arizkhalid/among-us-clone), com nova interface em português, efeitos, animações e regras validadas pelo servidor.

> Projeto independente. Não é oficial nem afiliado à Innersloth. Origem dos assets, licença e créditos em [NOTICE.md](NOTICE.md) e [LICENSE](LICENSE).

## Rodar localmente

Requer **Node.js 22.12 ou superior** e npm.

```bash
npm install
npm run dev
```

- Interface: **http://localhost:8080**
- Servidor multiplayer: porta **3000**
- O Vite encaminha `/api` e `/socket.io` para o backend. O navegador usa URLs relativas, inclusive na prévia remota; não há `localhost` hardcoded no cliente.
- Os dois processos escutam em `0.0.0.0`. A prévia aceita hosts `*.e2b.app`.

### Experimentar sozinho

Clique em **Jogar treino**, escolha Tripulante ou Impostor e entre em uma simulação privada com **quatro bots identificados como bots**. Não são pessoas ou salas falsas. Os bots exploram a nave, progridem nas tarefas e pulam as votações. O bot impostor só pode eliminar depois de 45 segundos.

### Jogar com amigos

1. Escolha nome e cor, então crie uma sala.
2. Copie o convite no painel lateral ou compartilhe o código de seis caracteres.
3. Os demais jogadores entram pelo mesmo endereço público e informam o código.
4. O capitão pode iniciar com **3 a 10 jogadores**, conforme a capacidade escolhida.
5. Depois da partida, o capitão pode preparar uma nova rodada no mesmo lobby.

Todos precisam se conectar ao **mesmo backend**. Em uma rede local, abra o IP da máquina que executa o projeto na porta 8080; no ambiente Arena, use o endereço público da prévia.

## O que foi melhorado

### Atmosfera e animação

- Campo estelar animado com paralaxe e pausa quando a aba está oculta.
- Avatares vetoriais, flutuação em gravidade zero, seleção de traje e microinterações.
- Sprites originais normalizados em um atlas, com cores e visores retrabalhados.
- Interpolação dos jogadores remotos, previsão local e reconciliação de movimento.
- Animação de caminhada, respiração em repouso, poeira dos passos e iluminação suave.
- Revelação do papel com contagem regressiva sincronizada.
- Eliminações com animação original, partículas, impacto opcional e visual de fantasma.
- Transições de reunião, expulsão no espaço e celebração de vitória.
- Efeitos sonoros sintetizados localmente via Web Audio. **Som desativado por padrão**.

### Jogabilidade

- Mapa The Skeld e lobby do projeto original.
- Três tarefas interativas: transferência de dados, conexão de fios e calibração de sinal.
- Reunião de emergência na mesa central da Cafeteria e reporte de corpos por proximidade.
- Chat de lobby/reunião; mensagens de fantasmas não aparecem para jogadores vivos.
- Votação única por jogador vivo; empate e opção de pular voto.
- Vitória por tarefas, expulsão do impostor ou maioria do impostor.
- Continuidade das tarefas como fantasma.
- Controles de teclado e joystick virtual em telas de toque.
- Preferências de áudio, partículas, câmera e movimento reduzido, salvas no navegador.

### Multiplayer e correções

- Identidade gerada no servidor, com token de sessão opaco para reconexão.
- O servidor obtém a identidade da conexão, nunca de `playerId` enviado no payload.
- Movimentação calculada a **30 ticks/s**, com colisões compartilhadas e snapshots a 15 Hz.
- Eliminações validam papel, vida, alvo, distância, linha de visão e cooldown.
- Papéis secretos não aparecem em listas públicas nem nos estados de outros jogadores.
- Votação, timers, expulsões e vitória controlados por sala no servidor.
- Validação de payloads, limites por evento e tratamento de erros sem derrubar o processo.
- Reconexão com reserva da vaga por 20 segundos; limpeza de salas vazias e transferência de capitão.
- Sem telemetria do template original, serviços de terceiros ou chaves de API.

## Controles

| Tecla | Ação |
| --- | --- |
| WASD ou setas | Mover |
| E | Usar um terminal próximo |
| Q | Eliminar (impostor, com alvo próximo e cooldown pronto) |
| R | Reportar corpo próximo |
| B | Reunião de emergência, perto da mesa central |
| M | Abrir/fechar o mapa |
| Esc | Fechar janelas auxiliares |

Reuniões não podem ser encerradas pelo cliente. Elas terminam após os votos dos participantes vivos ou após 45 segundos.

## Scripts

```bash
npm run dev    # Frontend + backend com recarga
npm run build  # Compila frontend/dist
npm start      # Backend + frontend compilado, mesma origem
npm test       # Testes de regras e integração HTTP/Socket.IO
npm run lint   # ESLint flat config
npm run check  # Lint + testes + build
```

## Produção

```bash
npm ci
npm run build
NODE_ENV=production PORT=3000 npm start
```

O servidor Express entrega o frontend compilado e o Socket.IO na **mesma porta**, sem exigir configuração de CORS. Publique atrás de HTTPS e de um proxy com suporte a WebSocket.

Se publicar o frontend separadamente, defina **na compilação**:

```env
# frontend/.env
VITE_SERVER_URL=https://seu-backend.example.com
```

E no processo do servidor:

```env
PORT=3000
ALLOWED_ORIGINS=https://seu-frontend.example.com
```

`ALLOWED_ORIGINS` aceita uma lista de origens completas separadas por vírgula. Em produção, a origem do WebSocket precisa ser a própria origem do servidor ou estar nessa lista. O servidor não confia em cabeçalhos de IP de proxies por padrão.

Para mudar o destino do proxy de desenvolvimento:

```bash
PROXY_TARGET=http://127.0.0.1:4000 npm run dev --workspace frontend
```

**O multiplayer precisa de um processo Node.js persistente.** Hospedar apenas `frontend/dist` não fornece as salas ou os sockets.

## Estrutura

```text
backend/src/game.js         Estado autoritativo, ações, bots, tarefas e votação
backend/src/server.js       HTTP, Socket.IO, sessões, limites e entrega do build
backend/test/               Testes unitários e de integração
frontend/src/components/    Interface, reuniões, tarefas e efeitos de tela
frontend/src/game/          Cena Phaser, interpolação, partículas e joystick
frontend/src/lib/           Conexão, áudio local e preferências
frontend/public/assets/     Mapas e atlas de sprites do projeto original
shared/                     Constantes, colisões, movimento e pathfinding
scripts/dev.mjs             Inicialização conjunta dos processos
```

O atlas pronto está versionado. Para regenerá-lo a partir das máscaras originais incluídas, instale Pillow e execute `python tools/prepare-assets.py`. Python **não é necessário** para instalar, compilar ou jogar.

## Limites desta versão

- Estado e sessões ficam em memória: reiniciar o servidor encerra as partidas.
- Projetado para uma instância de servidor. Escalabilidade horizontal exigiria estado compartilhado, coordenação de ticks e adaptador de sockets.
- Bots são uma ajuda de treino, não uma IA competitiva; eles não discutem ou acusam jogadores.
- Sabotagens, dutos, múltiplos impostores e outros mapas não estão implementados.
- Não há contas, ranking, moderação persistente ou autenticação de longo prazo.
- O servidor protege as ações e os papéis, mas não pretende ser uma plataforma antitrapaça completa: posições são sincronizadas para os clientes da sala.
- Verifique os direitos das artes e da marca antes de distribuir comercialmente.
