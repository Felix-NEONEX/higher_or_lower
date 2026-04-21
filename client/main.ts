import type {
  ErrorEventPayload,
  PlayerView,
  PublicGameState,
  RevealResult,
  ServerToClientEvents,
  StateEnvelope
} from "../shared/contracts.js";

declare global {
  interface Window {
    io: (options?: { auth?: Record<string, string> }) => SocketClient;
  }
}

interface SocketClient {
  on(event: string, handler: (...payload: any[]) => void): void;
  emit(event: string, payload?: unknown): void;
}

const connectionPill = document.querySelector<HTMLElement>("#connection-pill")!;
const phaseValue = document.querySelector<HTMLElement>("#phase-value")!;
const roundValue = document.querySelector<HTMLElement>("#round-value")!;
const activePlayerValue = document.querySelector<HTMLElement>("#active-player-value")!;
const streakValue = document.querySelector<HTMLElement>("#streak-value")!;
const timerValue = document.querySelector<HTMLElement>("#timer-value")!;
const timerProgress = document.querySelector<SVGCircleElement>("#timer-progress")!;
const statusBanner = document.querySelector<HTMLElement>("#status-banner")!;
const ownershipBanner = document.querySelector<HTMLElement>("#ownership-banner")!;
const revealBanner = document.querySelector<HTMLElement>("#reveal-banner")!;
const leftLabel = document.querySelector<HTMLElement>("#left-label")!;
const leftValue = document.querySelector<HTMLElement>("#left-value")!;
const rightLabel = document.querySelector<HTMLElement>("#right-label")!;
const rightValue = document.querySelector<HTMLElement>("#right-value")!;
const playersList = document.querySelector<HTMLElement>("#players-list")!;
const pendingList = document.querySelector<HTMLElement>("#pending-list")!;
const leaderboardList = document.querySelector<HTMLElement>("#leaderboard-list")!;
const messageBox = document.querySelector<HTMLElement>("#message-box")!;
const joinForm = document.querySelector<HTMLFormElement>("#join-form")!;
const firstNameInput = document.querySelector<HTMLInputElement>("#first-name-input")!;
const joinButton = document.querySelector<HTMLButtonElement>("#join-button")!;
const lateJoinButton = document.querySelector<HTMLButtonElement>("#late-join-button")!;
const startButton = document.querySelector<HTMLButtonElement>("#start-button")!;
const guessHigherButton = document.querySelector<HTMLButtonElement>("#guess-higher-button")!;
const guessLowerButton = document.querySelector<HTMLButtonElement>("#guess-lower-button")!;
const continueButton = document.querySelector<HTMLButtonElement>("#continue-button")!;
const restartButton = document.querySelector<HTMLButtonElement>("#restart-button")!;

const clientIdKey = "higher-lower-client-id";
const playerNameKey = "higher-lower-player-name";
const timerCircumference = 2 * Math.PI * 52;

const clientId =
  window.localStorage.getItem(clientIdKey) ??
  window.crypto?.randomUUID?.() ??
  `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

window.localStorage.setItem(clientIdKey, clientId);
timerProgress.style.strokeDasharray = `${timerCircumference}`;
timerProgress.style.strokeDashoffset = "0";

let latestName = window.localStorage.getItem(playerNameKey) ?? "";
let currentState: PublicGameState | null = null;
let countdownHandle: number | null = null;

firstNameInput.value = latestName;

const socket = window.io({ auth: { clientId } });

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setMessage(message: string): void {
  messageBox.textContent = message;
}

function titleCasePhase(phase: PublicGameState["phase"]): string {
  return phase.replace("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function stopCountdown(): void {
  if (countdownHandle === null) {
    return;
  }
  window.clearInterval(countdownHandle);
  countdownHandle = null;
}

function renderTimer(state: PublicGameState): void {
  if (state.phase !== "round_active" || !state.roundDeadlineAt) {
    timerValue.textContent = `${state.roundTimeLimitSeconds.toFixed(1)}`;
    timerProgress.style.strokeDashoffset = `${timerCircumference}`;
    timerProgress.style.stroke = "var(--accent)";
    return;
  }

  const totalMs = state.roundTimeLimitSeconds * 1000;
  const remainingMs = Math.max(new Date(state.roundDeadlineAt).getTime() - Date.now(), 0);
  const remainingSeconds = remainingMs / 1000;
  const ratio = totalMs === 0 ? 0 : remainingMs / totalMs;
  timerValue.textContent = remainingSeconds.toFixed(1);
  timerProgress.style.strokeDashoffset = `${timerCircumference * (1 - ratio)}`;
  timerProgress.style.stroke = remainingSeconds <= 2 ? "var(--bad)" : "var(--accent)";
}

function restartCountdown(state: PublicGameState): void {
  stopCountdown();
  renderTimer(state);

  if (state.phase !== "round_active" || !state.roundDeadlineAt) {
    return;
  }

  countdownHandle = window.setInterval(() => {
    if (!currentState) {
      return;
    }
    renderTimer(currentState);
  }, 100);
}

function renderPlayerList(root: HTMLElement, players: PlayerView[], emptyMessage: string): void {
  if (players.length === 0) {
    root.innerHTML = `<li class="list-row"><div>${escapeHtml(emptyMessage)}</div></li>`;
    return;
  }

  root.innerHTML = players
    .map((player) => {
      const isActive = currentState?.activePlayerName === player.name && player.status === "active";
      const rowClass = isActive ? "list-row list-row--active" : "list-row";
      const statusParts = [player.status];
      if (!player.connected) {
        statusParts.push("offline");
      }

      const badge = isActive
        ? '<span class="pill-tag pill-tag--accent">dran</span>'
        : player.status === "pending"
          ? '<span class="pill-tag pill-tag--pending">wartet</span>'
          : "";

      return `<li class="${rowClass}">
          <div>
            <div class="list-row__title">
              <span>${escapeHtml(player.name)}</span>
              ${badge}
            </div>
            <div class="list-row__meta">${escapeHtml(statusParts.join(" · "))}</div>
          </div>
          <div class="list-row__score">${player.score}</div>
        </li>`;
    })
    .join("");
}

function renderLeaderboard(players: PlayerView[]): void {
  if (players.length === 0) {
    leaderboardList.innerHTML = '<li class="leaderboard-row"><div>Scores erscheinen nach der ersten Runde.</div></li>';
    return;
  }

  leaderboardList.innerHTML = players
    .map((player, index) => {
      const rowClass = index === 0 ? "leaderboard-row leaderboard-row--first" : "leaderboard-row";
      return `<li class="${rowClass}">
          <div>
            <div class="leaderboard-row__title">${index + 1}. ${escapeHtml(player.name)}</div>
            <div class="leaderboard-row__meta">${escapeHtml(player.status)}</div>
          </div>
          <div class="leaderboard-row__score">${player.score}</div>
        </li>`;
    })
    .join("");
}

function renderQuestion(state: PublicGameState): void {
  if (!state.activeQuestion) {
    leftLabel.textContent = "Noch keine Karte";
    leftValue.textContent = "-";
    rightLabel.textContent = "Die naechste Karte kommt gleich";
    rightValue.textContent = "?";
    return;
  }

  leftLabel.textContent = state.activeQuestion.leftLabel;
  leftValue.textContent = String(state.activeQuestion.leftValue);
  rightLabel.textContent = state.activeQuestion.rightLabel;
  rightValue.textContent = state.activeQuestion.rightValue === null ? "?" : String(state.activeQuestion.rightValue);
}

function renderReveal(result: RevealResult | null): void {
  if (!result) {
    revealBanner.className = "reveal-banner reveal-banner--hidden";
    revealBanner.textContent = "";
    return;
  }

  const baseClass =
    result.reason === "highperformer_cap"
      ? "reveal-banner reveal-banner--spotlight"
      : result.wasCorrect
        ? "reveal-banner reveal-banner--positive"
        : "reveal-banner reveal-banner--negative";

  const guessLabel = result.guess ? result.guess : "keine Antwort";
  revealBanner.className = baseClass;
  revealBanner.textContent = `${result.playerName} tippte ${guessLabel}. ${result.message}`;
}

function renderStatus(state: PublicGameState): void {
  phaseValue.textContent = titleCasePhase(state.phase);
  roundValue.textContent = `${state.roundNumber} / ${state.maxRounds}`;
  activePlayerValue.textContent = state.activePlayerName ?? "Warten";
  streakValue.textContent = `${state.currentTurnStreak} / ${state.streakCap}`;

  if (state.phase === "lobby") {
    statusBanner.textContent = "Lobby offen. Namen eintragen und starten, wenn alle bereit sind.";
  } else if (state.phase === "round_active") {
    statusBanner.textContent = `Richtige Antwort? Dann bleibt die rechte Karte stehen und die naechste Karte fordert sie heraus.`;
  } else if (state.phase === "reveal") {
    statusBanner.textContent = state.revealResult?.roundEnded
      ? "Die Runde wird gleich abgeschlossen."
      : "Richtig geraten. Die naechste Karte kommt sofort.";
  } else if (state.phase === "leaderboard") {
    statusBanner.textContent = "Leaderboard sichtbar. Jede Person kann die naechste Runde starten.";
  } else {
    statusBanner.textContent = "Fuenf Runden gespielt. Das Finale ist entschieden.";
  }
}

function renderOwnership(state: PublicGameState): void {
  const isActivePlayer = Boolean(latestName) && state.activePlayerName === latestName;
  if (state.phase === "round_active" && state.activePlayerName) {
    ownershipBanner.textContent = isActivePlayer
      ? `Du bist dran. Nur du kannst in diesem Zeitfenster antworten.`
      : `Nur ${state.activePlayerName} kann jetzt antworten. Fuer alle anderen bleiben die Buttons gesperrt.`;
    return;
  }

  if (state.phase === "leaderboard") {
    ownershipBanner.textContent = "Die Runde ist vorbei. Von hier aus startet die Gruppe die naechste Runde.";
    return;
  }

  if (state.phase === "reveal") {
    ownershipBanner.textContent = state.revealResult?.roundEnded
      ? "Diese Runde endet jetzt."
      : "Die gleiche Person bleibt dran, weil die Antwort richtig war.";
    return;
  }

  ownershipBanner.textContent = "Noch niemand ist dran.";
}

function renderControls(state: PublicGameState): void {
  const isActivePlayer = Boolean(latestName) && state.activePlayerName === latestName;
  const isLobby = state.phase === "lobby";
  const canLateJoin = state.phase !== "lobby" && state.phase !== "final";
  const canGuess = state.phase === "round_active" && isActivePlayer;

  joinButton.disabled = !isLobby;
  lateJoinButton.disabled = !canLateJoin;
  startButton.disabled = !state.canStart;
  guessHigherButton.disabled = !canGuess;
  guessLowerButton.disabled = !canGuess;
  continueButton.disabled = state.phase !== "leaderboard";
  restartButton.disabled = state.phase === "lobby";
}

function renderState(state: PublicGameState): void {
  currentState = state;
  renderStatus(state);
  renderOwnership(state);
  renderQuestion(state);
  renderReveal(state.revealResult);
  renderPlayerList(playersList, state.players, "Noch keine Namen in der Lobby.");
  renderPlayerList(pendingList, state.pendingLateJoiners, "Niemand wartet auf die naechste Runde.");
  renderLeaderboard(state.phase === "final" ? state.finalRanking : state.leaderboard);
  renderControls(state);
  restartCountdown(state);
}

function rememberName(): string | null {
  const value = firstNameInput.value.trim();
  if (!value) {
    setMessage("Bitte zuerst einen Vornamen eintragen.");
    return null;
  }

  latestName = value;
  window.localStorage.setItem(playerNameKey, value);
  return value;
}

joinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = rememberName();
  if (!name) {
    return;
  }
  socket.emit("join_game", { firstName: name });
});

lateJoinButton.addEventListener("click", () => {
  const name = rememberName();
  if (!name) {
    return;
  }
  socket.emit("add_late_player", { firstName: name });
});

startButton.addEventListener("click", () => socket.emit("start_game"));
guessHigherButton.addEventListener("click", () => socket.emit("submit_guess", { guess: "higher" }));
guessLowerButton.addEventListener("click", () => socket.emit("submit_guess", { guess: "lower" }));
continueButton.addEventListener("click", () => socket.emit("continue_to_next_round"));
restartButton.addEventListener("click", () => socket.emit("restart_game"));

socket.on("connect", () => {
  connectionPill.textContent = "Live";
});

socket.on("disconnect", () => {
  connectionPill.textContent = "Offline";
});

socket.on("state_synced", ({ state }: StateEnvelope) => {
  connectionPill.textContent = "Live";
  renderState(state);
});

socket.on("player_joined", ({ player }) => {
  setMessage(`${player.name} ist der Lobby beigetreten.`);
});

socket.on("player_added_late", ({ player }) => {
  setMessage(`${player.name} wird ab der naechsten Runde mitspielen.`);
});

socket.on("game_started", ({ state }) => {
  renderState(state);
  setMessage(`Runde ${state.roundNumber} gestartet.`);
});

socket.on("round_started", ({ state }) => {
  renderState(state);
  if (state.currentTurnStreak > 0) {
    setMessage(`Richtig. ${state.activePlayerName} bleibt dran.`);
  } else {
    setMessage(`Runde ${state.roundNumber} gestartet.`);
  }
});

socket.on("guess_accepted", ({ playerName }) => {
  setMessage(`${playerName} hat eine Antwort abgegeben.`);
});

socket.on("answer_revealed", ({ state }) => {
  renderState(state);
});

socket.on("leaderboard_shown", ({ state }) => {
  renderState(state);
  setMessage("Leaderboard aktualisiert.");
});

socket.on("game_finished", ({ state }) => {
  renderState(state);
  setMessage("Spiel beendet.");
});

socket.on("error_event", ({ message }: ErrorEventPayload) => {
  setMessage(message);
});
