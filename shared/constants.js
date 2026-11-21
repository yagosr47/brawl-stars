export const VERSION = '2.0';
export const MAX_PLAYERS = 10;
export const MIN_PLAYERS = 3;
export const TICK_RATE = 30;
export const SNAPSHOT_RATE = 15;
export const INPUT_TIMEOUT = 500;
export const DISCONNECT_GRACE = 20_000;
export const MEETING_DURATION = 45_000;
export const COUNTDOWN_DURATION = 5_200;
export const EJECTION_DURATION = 6_000;
export const KILL_COOLDOWN = 18_000;
export const KILL_DISTANCE = 43;
export const USE_DISTANCE = 38;

export const COLORS = [
  { id: 'coral', name: 'Coral', hex: '#ef625d', dark: '#a83744' },
  { id: 'blue', name: 'Azul', hex: '#6487f3', dark: '#36478f' },
  { id: 'cyan', name: 'Ciano', hex: '#65d9dc', dark: '#318f9a' },
  { id: 'lime', name: 'Lima', hex: '#c4ef76', dark: '#7b9e43' },
  { id: 'yellow', name: 'Amarelo', hex: '#f5d56e', dark: '#ba8b43' },
  { id: 'purple', name: 'Violeta', hex: '#a38be2', dark: '#5e4f99' },
  { id: 'pink', name: 'Rosa', hex: '#ed9fbd', dark: '#ae597d' },
  { id: 'orange', name: 'Laranja', hex: '#ee9c59', dark: '#ab5c39' },
  { id: 'green', name: 'Menta', hex: '#61b998', dark: '#387663' },
  { id: 'white', name: 'Branco', hex: '#e0e8f0', dark: '#8c9aac' },
  { id: 'brown', name: 'Cacau', hex: '#aa806b', dark: '#644d4d' },
  { id: 'black', name: 'Grafite', hex: '#596078', dark: '#31384e' },
];
export const colorFor = id => COLORS.find(color => color.id === id) || COLORS[0];

export const SHIP_SPAWNS = [
  { x: 556, y: 149 }, { x: 528, y: 148 }, { x: 584, y: 149 },
  { x: 556, y: 181 }, { x: 612, y: 157 }, { x: 500, y: 158 },
  { x: 527, y: 187 }, { x: 583, y: 187 }, { x: 612, y: 119 }, { x: 500, y: 119 },
];
export const LOBBY_SPAWNS = [
  { x: 605, y: 545 }, { x: 525, y: 545 }, { x: 685, y: 545 },
  { x: 605, y: 605 }, { x: 445, y: 545 }, { x: 765, y: 545 },
  { x: 525, y: 605 }, { x: 685, y: 605 }, { x: 445, y: 605 }, { x: 765, y: 605 },
];
export const TASKS = [
  { id: 'data', title: 'Enviar dados', room: 'Cafeteria', type: 'download', x: 650, y: 184, duration: 2800 },
  { id: 'wires', title: 'Conectar circuitos', room: 'Administração', type: 'wires', x: 674, y: 338, duration: 1000 },
  { id: 'power', title: 'Calibrar energia', room: 'Elétrica', type: 'signal', x: 412, y: 335, duration: 1200 },
];
export const ROOM_LABELS = [
  { label: 'CAFETERIA', x: 564, y: 239 }, { label: 'ARMAS', x: 772, y: 151 },
  { label: 'NAVEGAÇÃO', x: 936, y: 276 }, { label: 'ADMINISTRAÇÃO', x: 668, y: 355 },
  { label: 'ESCUDOS', x: 788, y: 424 }, { label: 'COMUNICAÇÕES', x: 659, y: 500 },
  { label: 'ARMAZÉM', x: 544, y: 416 }, { label: 'ELÉTRICA', x: 412, y: 405 },
  { label: 'ALA MÉDICA', x: 391, y: 272 }, { label: 'MOTOR SUPERIOR', x: 221, y: 145 },
  { label: 'MOTOR INFERIOR', x: 221, y: 395 }, { label: 'REATOR', x: 115, y: 288 },
  { label: 'SEGURANÇA', x: 302, y: 288 }, { label: 'O₂', x: 723, y: 259 },
];
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
