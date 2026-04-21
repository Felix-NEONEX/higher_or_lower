import type { ErrorEventPayload, PlayerView, PublicGameState, RevealResult, StateEnvelope } from "../shared/contracts.js";

declare global {
  interface Window {
    io: (options?: { auth?: Record<string, string> }) => SocketClient;
  }
}

interface SocketClient {
  on(event: string, handler: (...payload: any[]) => void): void;
  emit(event: string, payload?: unknown): void;
}

type ScreenName = "lobby" | "play" | "interim" | "finale";

const connectionPill = document.querySelector<HTMLElement>("#connection-pill")!;
const phaseChip = document.querySelector<HTMLElement>("#phase-chip")!;
const roundIndicator = document.querySelector<HTMLElement>("#round-indicator")!;
const firstNameInput = document.querySelector<HTMLInputElement>("#first-name-input")!;
const joinForm = document.querySelector<HTMLFormElement>("#join-form")!;
const joinButton = document.querySelector<HTMLButtonElement>("#join-button")!;
const startButton = document.querySelector<HTMLButtonElement>("#start-button")!;
const hardResetButton = document.querySelector<HTMLButtonElement>("#hard-reset-button")!;
const lobbyHelper = document.querySelector<HTMLElement>("#lobby-helper")!;
const playerCountPill = document.querySelector<HTMLElement>("#player-count-pill")!;
const playersGrid = document.querySelector<HTMLElement>("#players-grid")!;
const playersEmpty = document.querySelector<HTMLElement>("#players-empty")!;
const lobbyAvatars = document.querySelector<HTMLElement>("#lobby-avatars")!;
const lobbyVisualCount = document.querySelector<HTMLElement>("#lobby-visual-count")!;

const playRoundText = document.querySelector<HTMLElement>("#play-round-text")!;
const turnProgressText = document.querySelector<HTMLElement>("#turn-progress-text")!;
const streakValue = document.querySelector<HTMLElement>("#streak-value")!;
const turnBanner = document.querySelector<HTMLElement>("#turn-banner")!;
const timerValue = document.querySelector<HTMLElement>("#timer-value")!;
const timerProgress = document.querySelector<SVGCircleElement>("#timer-progress")!;
const statusBanner = document.querySelector<HTMLElement>("#status-banner")!;
const ownershipBanner = document.querySelector<HTMLElement>("#ownership-banner")!;
const leftCard = document.querySelector<HTMLElement>("#left-card")!;
const rightCard = document.querySelector<HTMLElement>("#right-card")!;
const leftLabel = document.querySelector<HTMLElement>("#left-label")!;
const leftValue = document.querySelector<HTMLElement>("#left-value")!;
const rightLabel = document.querySelector<HTMLElement>("#right-label")!;
const rightValue = document.querySelector<HTMLElement>("#right-value")!;
const revealTag = document.querySelector<HTMLElement>("#reveal-tag")!;
const guessHigherButton = document.querySelector<HTMLButtonElement>("#guess-higher-button")!;
const guessLowerButton = document.querySelector<HTMLButtonElement>("#guess-lower-button")!;
const playMessage = document.querySelector<HTMLElement>("#play-message")!;
const roundDots = document.querySelector<HTMLElement>("#round-dots")!;

const interimRound = document.querySelector<HTMLElement>("#interim-round")!;
const interimCopy = document.querySelector<HTMLElement>("#interim-copy")!;
const interimList = document.querySelector<HTMLElement>("#interim-list")!;
const continueButton = document.querySelector<HTMLButtonElement>("#continue-button")!;

const winnerAvatar = document.querySelector<HTMLElement>("#winner-avatar")!;
const winnerName = document.querySelector<HTMLElement>("#winner-name")!;
const winnerScore = document.querySelector<HTMLElement>("#winner-score")!;
const playedRounds = document.querySelector<HTMLElement>("#played-rounds")!;
const statPlayers = document.querySelector<HTMLElement>("#stat-players")!;
const statTotal = document.querySelector<HTMLElement>("#stat-total")!;
const statUsed = document.querySelector<HTMLElement>("#stat-used")!;
const finalList = document.querySelector<HTMLElement>("#final-list")!;
const newGameButton = document.querySelector<HTMLButtonElement>("#new-game-button")!;

const messageBox = document.querySelector<HTMLElement>("#message-box")!;
const lateTrigger = document.querySelector<HTMLButtonElement>("#late-trigger")!;
const backdrop = document.querySelector<HTMLElement>("#backdrop")!;
const lateDrawer = document.querySelector<HTMLElement>("#late-drawer")!;
const drawerClose = document.querySelector<HTMLButtonElement>("#drawer-close")!;
const lateNameInput = document.querySelector<HTMLInputElement>("#late-name-input")!;
const lateJoinButton = document.querySelector<HTMLButtonElement>("#late-join-button")!;
const confettiCanvas = document.querySelector<HTMLCanvasElement>("#confetti")!;
const turnSpotlight = document.querySelector<HTMLElement>("#turn-spotlight")!;
const turnSpotlightName = document.querySelector<HTMLElement>("#turn-spotlight-name")!;
const turnSpotlightCopy = document.querySelector<HTMLElement>("#turn-spotlight-copy")!;

const timerCircumference = 2 * Math.PI * 52;
const clientIdKey = "higher-lower-client-id";
const playerNameKey = "higher-lower-player-name";

const clientId =
  window.localStorage.getItem(clientIdKey) ??
  window.crypto?.randomUUID?.() ??
  `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

window.localStorage.setItem(clientIdKey, clientId);
firstNameInput.value = window.localStorage.getItem(playerNameKey) ?? "";

const socket = window.io({ auth: { clientId } });
const screens = new Map<ScreenName, HTMLElement>(
  (["lobby", "play", "interim", "finale"] as const).map((name) => [name, document.querySelector<HTMLElement>(`#screen-${name}`)!])
);

let latestName = firstNameInput.value.trim();
let currentState: PublicGameState | null = null;
let countdownHandle: number | null = null;
let toastHandle: number | null = null;
let lastRevealAnimationKey = "";
let lastFinalCelebrationKey = "";
let lastRevealCelebrationKey = "";
let lastTurnSpotlightKey = "";
let pendingAutoStart = false;
let spotlightHandle: number | null = null;

const confettiContext = confettiCanvas.getContext("2d")!;
let confettiPieces: Array<{
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  size: number;
  rot: number;
  vr: number;
  color: string;
  life: number;
}> = [];
let confettiFrame: number | null = null;

const lobbyAvatarSlots = [
  { x: 50, scale: 1, z: 10 },
  { x: 42, scale: 0.94, z: 9 },
  { x: 58, scale: 0.94, z: 9 },
  { x: 32, scale: 0.87, z: 8 },
  { x: 68, scale: 0.87, z: 8 },
  { x: 22, scale: 0.8, z: 7 },
  { x: 78, scale: 0.8, z: 7 },
  { x: 12, scale: 0.74, z: 6 },
  { x: 88, scale: 0.74, z: 6 },
  { x: 38, scale: 0.84, z: 8 },
  { x: 62, scale: 0.84, z: 8 }
] as const;

function horizonOffsetForPercent(x: number): number {
  const normalizedDistance = Math.min(1, Math.abs(x - 50) / 38);
  return Math.round(4 + normalizedDistance ** 2 * 24);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function initials(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

function setToast(message: string): void {
  messageBox.textContent = message;
  if (toastHandle !== null) {
    window.clearTimeout(toastHandle);
  }
  toastHandle = window.setTimeout(() => {
    if (messageBox.textContent === message) {
      messageBox.textContent = "";
    }
  }, 2800);
}

function currentScreenForState(state: PublicGameState): ScreenName {
  if (state.phase === "lobby") {
    return "lobby";
  }
  if (state.phase === "leaderboard") {
    return "interim";
  }
  if (state.phase === "final") {
    return "finale";
  }
  return "play";
}

function switchScreen(nextScreen: ScreenName): void {
  for (const [name, element] of screens.entries()) {
    element.classList.toggle("is-active", name === nextScreen);
  }
  lateTrigger.style.display = nextScreen === "play" || nextScreen === "interim" ? "inline-flex" : "none";
}

function setConnectionState(connected: boolean): void {
  connectionPill.innerHTML = connected
    ? '<span class="live-dot"></span> Live verbunden'
    : '<span class="live-dot"></span> Offline';
}

function phaseLabel(phase: PublicGameState["phase"]): string {
  switch (phase) {
    case "lobby":
      return "Lobby";
    case "round_active":
      return "Challenge";
    case "reveal":
      return "Auflösung";
    case "leaderboard":
      return "Zwischenstand";
    case "final":
      return "Finale";
    default:
      return phase;
  }
}

function isLocalActivePlayer(state: PublicGameState): boolean {
  return latestName.length > 0 && state.activePlayerName === latestName;
}

function activePlayerLabel(state: PublicGameState): string {
  return state.activePlayerName ?? "Niemand";
}

function updateRoundDots(state: PublicGameState): void {
  roundDots.innerHTML = "";
  for (let index = 1; index <= state.maxRounds; index += 1) {
    const dot = document.createElement("span");
    dot.className = "dot";
    if (index < state.roundNumber) {
      dot.classList.add("is-done");
    } else if (index === state.roundNumber) {
      dot.classList.add("is-active");
    }
    roundDots.appendChild(dot);
  }
}

function stopCountdown(): void {
  if (countdownHandle !== null) {
    window.clearInterval(countdownHandle);
    countdownHandle = null;
  }
}

function renderTimer(state: PublicGameState): void {
  if (state.phase !== "round_active" || !state.roundDeadlineAt) {
    timerValue.textContent = `${state.roundTimeLimitSeconds.toFixed(1)}`;
    timerProgress.style.strokeDasharray = `${timerCircumference}`;
    timerProgress.style.strokeDashoffset = `${timerCircumference}`;
    timerProgress.style.stroke = "var(--accent)";
    return;
  }

  const totalMs = state.roundTimeLimitSeconds * 1000;
  const remainingMs = Math.max(new Date(state.roundDeadlineAt).getTime() - Date.now(), 0);
  const remainingSeconds = remainingMs / 1000;
  const ratio = totalMs === 0 ? 0 : remainingMs / totalMs;

  timerValue.textContent = remainingSeconds.toFixed(1);
  timerProgress.style.strokeDasharray = `${timerCircumference}`;
  timerProgress.style.strokeDashoffset = `${timerCircumference * (1 - ratio)}`;
  timerProgress.style.stroke = remainingSeconds <= 3 ? "var(--bad)" : "var(--accent)";
}

function restartCountdown(state: PublicGameState): void {
  stopCountdown();
  renderTimer(state);

  if (state.phase !== "round_active" || !state.roundDeadlineAt) {
    return;
  }

  countdownHandle = window.setInterval(() => {
    if (currentState) {
      renderTimer(currentState);
    }
  }, 100);
}

function countUp(el: HTMLElement, target: number, duration = 800): void {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) {
    el.textContent = `${target}`;
    return;
  }

  const startValue = 0;
  const startTime = performance.now();

  function frame(now: number): void {
    const t = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    const current = startValue + (target - startValue) * eased;
    const rounded = Number.isInteger(target) ? Math.round(current) : Math.round(current * 10) / 10;
    el.textContent = `${rounded}`;
    if (t < 1) {
      requestAnimationFrame(frame);
    }
  }

  requestAnimationFrame(frame);
}

function renderLobbyPlayers(players: PlayerView[]): void {
  playerCountPill.textContent = `${players.length}`;
  playersGrid.innerHTML = "";
  playersEmpty.style.display = players.length === 0 ? "" : "none";

  players.forEach((player, index) => {
    const chip = document.createElement("div");
    chip.className = "player-chip";
    chip.style.animationDelay = `${index * 30}ms`;
    chip.innerHTML = `<span class="avatar">${escapeHtml(initials(player.name))}</span><span>${escapeHtml(player.name)}</span>`;
    playersGrid.appendChild(chip);
  });
}

function renderLobbyScene(players: PlayerView[]): void {
  lobbyAvatars.innerHTML = "";
  lobbyVisualCount.textContent = `${players.length} Avatar${players.length === 1 ? "" : "e"}`;

  players.forEach((player, index) => {
    const slot = lobbyAvatarSlots[index % lobbyAvatarSlots.length]!;
    const avatar = document.createElement("div");
    avatar.className = "lobby-avatar";
    avatar.style.left = `${slot.x}%`;
    avatar.style.top = `${horizonOffsetForPercent(slot.x)}px`;
    avatar.style.zIndex = `${slot.z}`;
    avatar.style.setProperty("--avatar-scale", `${slot.scale}`);
    avatar.style.setProperty("--avatar-delay", `${index * 90}ms`);
    avatar.style.setProperty("--avatar-hue", `${(index * 39) % 360}deg`);
    avatar.style.setProperty("--avatar-tilt", `${(slot.x - 50) / 8}deg`);
    avatar.innerHTML = `
      <span class="lobby-avatar__shadow"></span>
      <span class="lobby-avatar__figure">
        <span class="lobby-avatar__head"></span>
        <span class="lobby-avatar__torso"></span>
        <span class="lobby-avatar__arm lobby-avatar__arm--left"></span>
        <span class="lobby-avatar__arm lobby-avatar__arm--right"></span>
        <span class="lobby-avatar__leg lobby-avatar__leg--left"></span>
        <span class="lobby-avatar__leg lobby-avatar__leg--right"></span>
      </span>
      <span class="sr-only">${escapeHtml(player.name)} in der Lobby-Visualisierung</span>`;
    lobbyAvatars.appendChild(avatar);
  });
}

function renderFullRanking(root: HTMLElement, players: PlayerView[]): void {
  root.innerHTML = players
    .map((player, index) => {
      const tierClass = index === 0 ? " gold" : "";
      return `
        <li class="rank-row${tierClass}">
          <span class="pos">${index + 1}</span>
          <div class="who">
            <span class="avatar">${escapeHtml(initials(player.name))}</span>
            <span>${escapeHtml(player.name)}</span>
          </div>
          <div class="score">${player.score}</div>
        </li>`;
    })
    .join("");
}

function renderReveal(result: RevealResult | null): void {
  revealTag.className = "reveal-tag";
  rightCard.classList.remove("is-hit", "is-miss");

  if (!result) {
    revealTag.textContent = "";
    playMessage.textContent = "";
    return;
  }

  const icon = result.wasCorrect
    ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12l5 5 9-9"></path></svg>'
    : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M6 6l12 12M18 6L6 18"></path></svg>';

  revealTag.classList.add(result.wasCorrect ? "is-hit" : "is-miss");
  revealTag.innerHTML = `${icon}${result.wasCorrect ? "Richtig" : "Daneben"}`;
  rightCard.classList.add(result.wasCorrect ? "is-hit" : "is-miss");
  playMessage.textContent = result.message;
}

function renderQuestion(state: PublicGameState): void {
  const question = state.activeQuestion;
  if (!question) {
    leftLabel.textContent = "Noch keine Karte";
    leftValue.textContent = "-";
    rightLabel.textContent = "Die nächste Karte kommt gleich";
    rightValue.textContent = "???";
    lastRevealAnimationKey = "";
    return;
  }

  leftLabel.textContent = question.leftLabel;
  leftValue.textContent = `${question.leftValue}`;
  rightLabel.textContent = question.rightLabel;

  if (question.rightValue === null) {
    rightValue.textContent = "???";
    rightValue.classList.remove("pop");
    lastRevealAnimationKey = "";
    return;
  }

  const nextRevealKey = `${state.roundNumber}:${question.leftLabel}:${question.rightLabel}:${question.rightValue}:${state.revealResult?.reason ?? ""}`;
  if (lastRevealAnimationKey !== nextRevealKey) {
    rightValue.classList.add("pop");
    countUp(rightValue, question.rightValue);
    lastRevealAnimationKey = nextRevealKey;
  } else {
    rightValue.textContent = `${question.rightValue}`;
  }
}

function renderTurnBanner(state: PublicGameState): void {
  const isActivePlayer = isLocalActivePlayer(state);
  turnBanner.classList.toggle("spectator", !isActivePlayer);

  if (state.phase === "reveal" && state.revealResult?.reason === "highperformer_cap") {
    turnBanner.innerHTML = `
      <span class="turn-banner__eyebrow">Zug beendet</span>
      <strong class="turn-banner__name">Du Highperformer – lass auch mal andere ran!</strong>
      <span class="turn-banner__copy">Sieben richtige Antworten in Folge reichen für diesen Zug.</span>`;
    return;
  }

  if (!state.activePlayerName) {
    turnBanner.innerHTML = `
      <span class="turn-banner__eyebrow">Aktive Person</span>
      <strong class="turn-banner__name">Die Runde startet.</strong>
      <span class="turn-banner__copy">Gleich ist klar, wer als Nächstes dran ist.</span>`;
    return;
  }

  if (state.phase === "round_active") {
    turnBanner.innerHTML = isActivePlayer
      ? `
        <span class="turn-banner__eyebrow">Jetzt bist du dran</span>
        <strong class="turn-banner__name">${escapeHtml(state.activePlayerName)}</strong>
        <span class="turn-banner__copy">Nur du kannst jetzt klicken und diese Challenge beantworten.</span>`
      : `
        <span class="turn-banner__eyebrow">Jetzt dran</span>
        <strong class="turn-banner__name">${escapeHtml(state.activePlayerName)}</strong>
        <span class="turn-banner__copy">Nur ${escapeHtml(state.activePlayerName)} kann jetzt antworten. Alle anderen sehen zu.</span>`;
    return;
  }

  turnBanner.innerHTML = state.revealResult?.roundEnded
    ? `
      <span class="turn-banner__eyebrow">Zug beendet</span>
      <strong class="turn-banner__name">${escapeHtml(state.activePlayerName)}</strong>
      <span class="turn-banner__copy">Diese Person ist für diesen Zug fertig.</span>`
    : `
      <span class="turn-banner__eyebrow">Zug läuft weiter</span>
      <strong class="turn-banner__name">${escapeHtml(state.activePlayerName)}</strong>
      <span class="turn-banner__copy">Bei richtiger Antwort bleibt dieselbe Person direkt dran.</span>`;
}

function hideTurnSpotlight(): void {
  turnSpotlight.classList.remove("is-visible");
  lastTurnSpotlightKey = "";
  if (spotlightHandle !== null) {
    window.clearTimeout(spotlightHandle);
    spotlightHandle = null;
  }
}

function renderTurnSpotlight(state: PublicGameState): void {
  if (state.phase !== "round_active" || !state.activePlayerName) {
    hideTurnSpotlight();
    return;
  }

  const spotlightKey = `${state.roundNumber}:${state.roundTurnNumber}:${state.activePlayerName}`;
  if (spotlightKey === lastTurnSpotlightKey) {
    return;
  }

  lastTurnSpotlightKey = spotlightKey;
  turnSpotlightName.textContent = isLocalActivePlayer(state) ? "Du bist dran" : state.activePlayerName;
  turnSpotlightCopy.textContent = isLocalActivePlayer(state)
    ? `Zug ${state.roundTurnNumber} von ${state.roundPlayerCount} in Runde ${state.roundNumber}. Nur du kannst jetzt antworten.`
    : `${state.activePlayerName} ist jetzt dran. Zug ${state.roundTurnNumber} von ${state.roundPlayerCount} in Runde ${state.roundNumber}.`;
  turnSpotlight.classList.add("is-visible");

  if (spotlightHandle !== null) {
    window.clearTimeout(spotlightHandle);
  }

  spotlightHandle = window.setTimeout(() => {
    turnSpotlight.classList.remove("is-visible");
    spotlightHandle = null;
  }, 2200);
}

function renderStatusCopy(state: PublicGameState): void {
  if (state.phase === "lobby") {
    statusBanner.textContent = "Eine Runde ist erst fertig, wenn jede aktive Person einmal dran war.";
    ownershipBanner.textContent = "Noch niemand ist am Zug.";
    return;
  }

  if (state.phase === "round_active") {
    statusBanner.textContent = "Ist rechts höher oder niedriger als links?";
    ownershipBanner.textContent =
      isLocalActivePlayer(state)
        ? `Du spielst gerade Zug ${state.roundTurnNumber} von ${state.roundPlayerCount} in Runde ${state.roundNumber}.`
        : `Gerade läuft Zug ${state.roundTurnNumber} von ${state.roundPlayerCount}. Nur ${activePlayerLabel(state)} kann antworten.`;
    return;
  }

  if (state.phase === "reveal") {
    statusBanner.textContent = state.revealResult?.roundEnded
      ? state.roundTurnNumber < state.roundPlayerCount
        ? "Der nächste Zug dieser Runde startet gleich automatisch."
        : "Diese Runde ist abgeschlossen."
      : "Richtig geraten. Die nächste Karte wird direkt geladen.";
    ownershipBanner.textContent = state.revealResult?.roundEnded
      ? state.roundTurnNumber < state.roundPlayerCount
        ? `Als Nächstes ist Zug ${state.roundTurnNumber + 1} von ${state.roundPlayerCount} dran.`
        : "Danach geht es in den Zwischenstand."
      : "Die gleiche Person bleibt an der Reihe.";
    return;
  }

  if (state.phase === "leaderboard") {
    interimCopy.textContent = `Runde ${state.roundNumber} ist abgeschlossen. Alle ${state.roundPlayerCount} aktiven Personen waren einmal dran. Die Gesamtwertung summiert alle Punkte über alle Runden.`;
    return;
  }
}

function renderControls(state: PublicGameState): void {
  const isActivePlayer = latestName.length > 0 && state.activePlayerName === latestName;
  joinButton.disabled = state.phase !== "lobby";
  startButton.disabled = !state.canStart && !(state.phase === "lobby" && firstNameInput.value.trim().length > 0);
  guessHigherButton.disabled = !(state.phase === "round_active" && isActivePlayer);
  guessLowerButton.disabled = !(state.phase === "round_active" && isActivePlayer);
  continueButton.disabled = state.phase !== "leaderboard";
  lateTrigger.disabled = !(state.phase === "round_active" || state.phase === "reveal" || state.phase === "leaderboard");
}

function resizeConfettiCanvas(): void {
  const ratio = window.devicePixelRatio || 1;
  confettiCanvas.width = window.innerWidth * ratio;
  confettiCanvas.height = window.innerHeight * ratio;
  confettiCanvas.style.width = `${window.innerWidth}px`;
  confettiCanvas.style.height = `${window.innerHeight}px`;
  confettiContext.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function burstConfetti(count: number, x: number, y: number, spread = 1): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  const colors = ["#ff5f50", "#ffb199", "#ffffff", "#ffd166", "#a8d7f7"];
  for (let index = 0; index < count; index += 1) {
    confettiPieces.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 12 * spread,
      vy: (Math.random() * -1 - 4) * spread,
      g: 0.25,
      size: 4 + Math.random() * 6,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.3,
      color: colors[Math.floor(Math.random() * colors.length)]!,
      life: 120 + Math.random() * 80
    });
  }

  if (confettiFrame === null) {
    tickConfetti();
  }
}

function tickConfetti(): void {
  confettiContext.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);

  confettiPieces.forEach((piece) => {
    piece.vy += piece.g;
    piece.x += piece.vx;
    piece.y += piece.vy;
    piece.rot += piece.vr;
    piece.life -= 1;

    confettiContext.save();
    confettiContext.translate(piece.x, piece.y);
    confettiContext.rotate(piece.rot);
    confettiContext.fillStyle = piece.color;
    confettiContext.globalAlpha = Math.max(0, Math.min(1, piece.life / 40));
    confettiContext.fillRect(-piece.size / 2, -piece.size / 2, piece.size, piece.size * 0.4);
    confettiContext.restore();
  });

  confettiPieces = confettiPieces.filter((piece) => piece.life > 0 && piece.y < window.innerHeight + 40);
  if (confettiPieces.length > 0) {
    confettiFrame = window.requestAnimationFrame(tickConfetti);
  } else {
    confettiFrame = null;
    confettiContext.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
  }
}

function maybeCelebrate(state: PublicGameState): void {
  if (state.revealResult?.wasCorrect) {
    const revealKey = `${state.roundNumber}:${state.revealResult.reason}:${state.updatedAt}`;
    if (lastRevealCelebrationKey !== revealKey) {
      lastRevealCelebrationKey = revealKey;
      const rect = rightCard.getBoundingClientRect();
      if (rect.width > 0) {
        burstConfetti(34, rect.left + rect.width / 2, rect.top + 80, 0.75);
      }
    }
  }

  const finalKey = `${state.phase}:${state.updatedAt}`;
  if (state.phase === "final" && lastFinalCelebrationKey !== finalKey) {
    lastFinalCelebrationKey = finalKey;
    burstConfetti(120, window.innerWidth * 0.3, window.innerHeight * 0.3, 1.2);
    window.setTimeout(() => burstConfetti(120, window.innerWidth * 0.7, window.innerHeight * 0.3, 1.2), 160);
    window.setTimeout(() => burstConfetti(120, window.innerWidth * 0.5, window.innerHeight * 0.25, 1.4), 340);
  }
}

function openDrawer(): void {
  lateDrawer.classList.add("is-open");
  backdrop.classList.add("is-open");
  lateDrawer.setAttribute("aria-hidden", "false");
  lateTrigger.setAttribute("aria-expanded", "true");
  window.setTimeout(() => lateNameInput.focus(), 120);
}

function closeDrawer(): void {
  lateDrawer.classList.remove("is-open");
  backdrop.classList.remove("is-open");
  lateDrawer.setAttribute("aria-hidden", "true");
  lateTrigger.setAttribute("aria-expanded", "false");
}

function applyTiltEffects(): void {
  document.querySelectorAll<HTMLElement>(".q-card").forEach((card) => {
    card.addEventListener("mousemove", (event) => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
      }
      const bounds = card.getBoundingClientRect();
      const px = (event.clientX - bounds.left) / bounds.width - 0.5;
      const py = (event.clientY - bounds.top) / bounds.height - 0.5;
      card.style.transform = `translateY(-2px) rotateX(${-py * 3}deg) rotateY(${px * 3}deg)`;
    });
    card.addEventListener("mouseleave", () => {
      card.style.transform = "";
    });
  });
}

function renderState(state: PublicGameState): void {
  currentState = state;
  const nextScreen = currentScreenForState(state);
  switchScreen(nextScreen);

  phaseChip.textContent = phaseLabel(state.phase);
  roundIndicator.textContent = `Runde ${state.roundNumber} von ${state.maxRounds}, Zug ${state.roundTurnNumber} von ${state.roundPlayerCount}`;
  playRoundText.textContent = `${state.roundNumber} / ${state.maxRounds}`;
  turnProgressText.textContent = state.roundPlayerCount > 0 ? `${state.roundTurnNumber} / ${state.roundPlayerCount}` : "-";
  streakValue.textContent = `${state.currentTurnStreak} / ${state.streakCap}`;

  renderLobbyPlayers(state.players);
  renderLobbyScene(state.players);
  renderQuestion(state);
  renderReveal(state.revealResult);
  renderTurnBanner(state);
  renderTurnSpotlight(state);
  renderStatusCopy(state);
  renderControls(state);
  updateRoundDots(state);
  restartCountdown(state);

  lobbyHelper.textContent = state.canStart
    ? `${state.players.length} Person${state.players.length === 1 ? "" : "en"} bereit. Eine Runde endet erst, wenn alle einmal dran waren.`
    : "Beim Start trittst du mit dem eingetragenen Namen automatisch selbst bei.";

  interimRound.textContent = `${state.roundNumber}`;
  renderFullRanking(interimList, state.leaderboard);
  renderFullRanking(finalList, state.finalRanking.length > 0 ? state.finalRanking : state.leaderboard);

  const winner = (state.finalRanking.length > 0 ? state.finalRanking : state.leaderboard)[0];
  if (winner) {
    winnerAvatar.textContent = initials(winner.name);
    winnerName.textContent = winner.name;
    winnerScore.textContent = `${winner.score}`;
  } else {
    winnerAvatar.textContent = "-";
    winnerName.textContent = "Niemand";
    winnerScore.textContent = "0";
  }
  playedRounds.textContent = `${Math.max(state.roundNumber, 0)}`;

  statPlayers.textContent = `${state.players.length}`;
  statTotal.textContent = `${state.players.reduce((sum, player) => sum + player.score, 0)}`;
  statUsed.textContent = `${new Set(state.usedQuestionIds).size}`;

  if (pendingAutoStart && state.phase === "lobby" && state.canStart) {
    const joined = state.players.some((player) => player.name === latestName);
    if (joined) {
      pendingAutoStart = false;
      socket.emit("start_game");
    }
  }

  maybeCelebrate(state);
}

function rememberName(input: HTMLInputElement): string | null {
  const value = input.value.trim();
  if (!value) {
    setToast("Bitte zuerst einen Vornamen eintragen.");
    return null;
  }
  latestName = value;
  window.localStorage.setItem(playerNameKey, value);
  return value;
}

function localPlayerJoined(state: PublicGameState | null, candidateName: string): boolean {
  return Boolean(candidateName) && Boolean(state?.players.some((player) => player.name === candidateName));
}

function requestHardReset(): void {
  const confirmed = window.confirm("Wirklich alles zurücksetzen und zur leeren Lobby zurückkehren?");
  if (!confirmed) {
    return;
  }
  pendingAutoStart = false;
  socket.emit("restart_game");
}

joinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = rememberName(firstNameInput);
  if (name) {
    socket.emit("join_game", { firstName: name });
  }
});

startButton.addEventListener("click", () => {
  const candidateName = firstNameInput.value.trim() || latestName;
  if (!currentState || currentState.phase !== "lobby") {
    socket.emit("start_game");
    return;
  }

  if (candidateName && !localPlayerJoined(currentState, candidateName)) {
    latestName = candidateName;
    window.localStorage.setItem(playerNameKey, candidateName);
    pendingAutoStart = true;
    socket.emit("join_game", { firstName: candidateName });
    return;
  }

  pendingAutoStart = false;
  socket.emit("start_game");
});

guessHigherButton.addEventListener("click", () => {
  guessHigherButton.classList.add("is-pressed");
  window.setTimeout(() => guessHigherButton.classList.remove("is-pressed"), 220);
  socket.emit("submit_guess", { guess: "higher" });
});

guessLowerButton.addEventListener("click", () => {
  guessLowerButton.classList.add("is-pressed");
  window.setTimeout(() => guessLowerButton.classList.remove("is-pressed"), 220);
  socket.emit("submit_guess", { guess: "lower" });
});

continueButton.addEventListener("click", () => socket.emit("continue_to_next_round"));
newGameButton.addEventListener("click", requestHardReset);
hardResetButton.addEventListener("click", requestHardReset);

lateTrigger.addEventListener("click", openDrawer);
drawerClose.addEventListener("click", closeDrawer);
backdrop.addEventListener("click", closeDrawer);

lateJoinButton.addEventListener("click", () => {
  const name = rememberName(lateNameInput);
  if (name) {
    socket.emit("add_late_player", { firstName: name });
    lateNameInput.value = "";
    closeDrawer();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && lateDrawer.classList.contains("is-open")) {
    closeDrawer();
  }

  if (!currentState || currentScreenForState(currentState) !== "play") {
    return;
  }
  if (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
    return;
  }
  if (event.key === "ArrowUp" || event.key.toLowerCase() === "h") {
    event.preventDefault();
    guessHigherButton.click();
  }
  if (event.key === "ArrowDown" || event.key.toLowerCase() === "n") {
    event.preventDefault();
    guessLowerButton.click();
  }
});

socket.on("connect", () => {
  setConnectionState(true);
});

socket.on("disconnect", () => {
  setConnectionState(false);
});

socket.on("state_synced", ({ state }: StateEnvelope) => {
  setConnectionState(true);
  renderState(state);
});

socket.on("player_joined", ({ player }: { player: PlayerView }) => {
  setToast(`${player.name} ist der Lobby beigetreten.`);
});

socket.on("player_added_late", ({ player }: { player: PlayerView }) => {
  setToast(`${player.name} steigt ab der nächsten Runde ein.`);
});

socket.on("game_started", ({ state }: StateEnvelope) => {
  renderState(state);
  setToast(`Runde ${state.roundNumber} gestartet. ${state.activePlayerName} eröffnet die Runde.`);
});

socket.on("round_started", ({ state }: StateEnvelope) => {
  renderState(state);
  if (state.currentTurnStreak > 0) {
    setToast(`${state.activePlayerName} bleibt dran.`);
  } else if (state.roundTurnNumber > 1) {
    setToast(`Nächster Zug: ${state.activePlayerName}.`);
  } else {
    setToast(`Runde ${state.roundNumber} gestartet.`);
  }
});

socket.on("guess_accepted", ({ playerName }: { playerName: string }) => {
  setToast(`${playerName} hat eine Antwort abgegeben.`);
});

socket.on("answer_revealed", ({ state }: StateEnvelope) => {
  renderState(state);
});

socket.on("leaderboard_shown", ({ state }: StateEnvelope) => {
  renderState(state);
  setToast("Zwischenstand aktualisiert.");
});

socket.on("game_finished", ({ state }: StateEnvelope) => {
  renderState(state);
  setToast("Spiel beendet.");
});

socket.on("error_event", ({ message }: ErrorEventPayload) => {
  pendingAutoStart = false;
  setToast(message);
});

resizeConfettiCanvas();
window.addEventListener("resize", resizeConfettiCanvas);
applyTiltEffects();
setConnectionState(false);
