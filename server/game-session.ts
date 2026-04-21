import type {
  ErrorEventPayload,
  GuessDirection,
  PlayerView,
  PublicGameState,
  PublicQuestion,
  QuestionCard,
  QuestionEntry,
  RevealResult
} from "../shared/contracts.js";

interface PlayerRecord {
  name: string;
  score: number;
  joinedAt: string;
  status: "active" | "pending";
  connected: boolean;
  clientId: string;
  socketId: string | null;
}

interface GameSessionOptions {
  maxRounds?: number;
  roundTimeLimitMs?: number;
  streakCap?: number;
}

interface SessionState {
  sessionId: string;
  phase: PublicGameState["phase"];
  roundNumber: number;
  maxRounds: number;
  players: PlayerRecord[];
  pendingLateJoiners: PlayerRecord[];
  activePlayerIndex: number;
  questionDeck: QuestionCard[];
  questionCursor: number;
  activeLeftCard: QuestionCard | null;
  activeRightCard: QuestionCard | null;
  usedQuestionIds: string[];
  revealResult: RevealResult | null;
  revealNextAction: "next_challenge" | "leaderboard" | "final" | null;
  startedAt: string | null;
  updatedAt: string;
  roundDeadlineAt: string | null;
  roundTimeLimitMs: number;
  currentTurnStreak: number;
  streakCap: number;
}

function cleanName(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function nowIso(): string {
  return new Date().toISOString();
}

function hashSeed(seed: string): number {
  let hash = 1779033703 ^ seed.length;
  for (let index = 0; index < seed.length; index += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = Math.imul(value ^ (value >>> 15), value | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleDeterministically<T>(items: T[], seed: string): T[] {
  const shuffled = [...items];
  const random = mulberry32(hashSeed(seed));

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const nextIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[nextIndex]] = [shuffled[nextIndex]!, shuffled[index]!];
  }

  return shuffled;
}

function toPlayerView(player: PlayerRecord): PlayerView {
  return {
    name: player.name,
    score: player.score,
    joinedAt: player.joinedAt,
    status: player.status,
    connected: player.connected
  };
}

export class GameSession {
  private readonly questions: QuestionEntry[];
  private readonly options: Required<GameSessionOptions>;
  private state: SessionState;

  constructor(questions: QuestionEntry[], sessionId = "default-session", options: GameSessionOptions = {}) {
    this.questions = questions;
    this.options = {
      maxRounds: options.maxRounds ?? 5,
      roundTimeLimitMs: options.roundTimeLimitMs ?? 15000,
      streakCap: options.streakCap ?? 7
    };
    this.state = this.createInitialState(sessionId);
  }

  private createInitialState(sessionId: string): SessionState {
    return {
      sessionId,
      phase: "lobby",
      roundNumber: 0,
      maxRounds: this.options.maxRounds,
      players: [],
      pendingLateJoiners: [],
      activePlayerIndex: -1,
      questionDeck: [],
      questionCursor: 0,
      activeLeftCard: null,
      activeRightCard: null,
      usedQuestionIds: [],
      revealResult: null,
      revealNextAction: null,
      startedAt: null,
      updatedAt: nowIso(),
      roundDeadlineAt: null,
      roundTimeLimitMs: this.options.roundTimeLimitMs,
      currentTurnStreak: 0,
      streakCap: this.options.streakCap
    };
  }

  private touch(): void {
    this.state.updatedAt = nowIso();
  }

  private ensureValidName(firstName: string): string {
    const cleaned = cleanName(firstName);
    if (cleaned.length < 2 || cleaned.length > 32) {
      throw this.error("INVALID_NAME", "Bitte nutze einen Vornamen mit 2 bis 32 Zeichen.");
    }
    if (!/^[\p{L}\p{N} .'-]+$/u.test(cleaned)) {
      throw this.error("INVALID_NAME", "Bitte nutze nur Buchstaben, Zahlen, Leerzeichen, Punkte, Apostrophe oder Bindestriche.");
    }
    return cleaned;
  }

  private error(code: ErrorEventPayload["code"], message: string): Error {
    return new GameError(code, message);
  }

  private buildDeck(seed: string): QuestionCard[] {
    const orderedQuestions = shuffleDeterministically(this.questions, seed);
    const sideRandom = mulberry32(hashSeed(`${seed}-side`));

    return orderedQuestions.map((question) => {
      const side = sideRandom() >= 0.5 ? "right" : "left";
      return side === "left"
        ? {
            id: `${question.id}:left`,
            sourceId: question.id,
            side,
            label: question.leftLabel,
            value: question.leftValue
          }
        : {
            id: `${question.id}:right`,
            sourceId: question.id,
            side,
            label: question.rightLabel,
            value: question.rightValue
          };
    });
  }

  private drawNextCard(): QuestionCard | null {
    const nextCard = this.state.questionDeck[this.state.questionCursor] ?? null;
    if (!nextCard) {
      return null;
    }

    this.state.questionCursor += 1;
    this.state.usedQuestionIds.push(nextCard.sourceId);
    return nextCard;
  }

  private setRoundDeadline(): void {
    this.state.roundDeadlineAt = new Date(Date.now() + this.state.roundTimeLimitMs).toISOString();
  }

  private clearRoundDeadline(): void {
    this.state.roundDeadlineAt = null;
  }

  private getActivePlayer(): PlayerRecord | null {
    if (this.state.activePlayerIndex < 0) {
      return null;
    }
    return this.state.players[this.state.activePlayerIndex] ?? null;
  }

  private getOrderedPlayers(): PlayerRecord[] {
    return [...this.state.players].sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.joinedAt.localeCompare(right.joinedAt);
    });
  }

  private findAnyPlayerByName(name: string): PlayerRecord | undefined {
    return [...this.state.players, ...this.state.pendingLateJoiners].find((player) => player.name === name);
  }

  private findPlayerByClientId(clientId: string): PlayerRecord | undefined {
    return [...this.state.players, ...this.state.pendingLateJoiners].find((player) => player.clientId === clientId);
  }

  private upsertPlayerRecord(
    existing: PlayerRecord | undefined,
    name: string,
    clientId: string,
    socketId: string
  ): PlayerRecord {
    if (existing) {
      existing.clientId = clientId;
      existing.socketId = socketId;
      existing.connected = true;
      return existing;
    }

    return {
      name,
      score: 0,
      joinedAt: nowIso(),
      status: "active",
      connected: true,
      clientId,
      socketId
    };
  }

  private promoteLateJoiners(): void {
    if (this.state.pendingLateJoiners.length === 0) {
      return;
    }

    for (const player of this.state.pendingLateJoiners) {
      player.status = "active";
      this.state.players.push(player);
    }

    this.state.pendingLateJoiners = [];
  }

  private ensureQuestionDeck(): void {
    if (this.state.questionDeck.length > 0) {
      return;
    }

    const seed = `${this.state.sessionId}-${Date.now()}`;
    this.state.questionDeck = this.buildDeck(seed);
    this.state.questionCursor = 0;
    this.state.usedQuestionIds = [];
  }

  private resolveCorrectDirection(): GuessDirection {
    const leftValue = this.state.activeLeftCard?.value;
    const rightValue = this.state.activeRightCard?.value;
    if (leftValue === undefined || rightValue === undefined) {
      throw this.error("INVALID_PHASE", "Es gibt gerade keinen aktiven Vergleich.");
    }
    return rightValue >= leftValue ? "higher" : "lower";
  }

  private startNewRound(): PublicGameState {
    if (this.state.roundNumber >= this.state.maxRounds) {
      throw this.error("INVALID_PHASE", "Das Spiel ist bereits beendet.");
    }

    this.promoteLateJoiners();

    if (this.state.players.length === 0) {
      throw this.error("INSUFFICIENT_PLAYERS", "Mindestens eine Person muss mitspielen.");
    }

    const leftCard = this.drawNextCard();
    const rightCard = this.drawNextCard();

    if (!leftCard || !rightCard) {
      throw this.error("DATASET_EXHAUSTED", "Nicht genug Fragen im Stapel, um eine weitere Runde zu starten.");
    }

    this.state.roundNumber += 1;
    this.state.activePlayerIndex = (this.state.activePlayerIndex + 1 + this.state.players.length) % this.state.players.length;
    this.state.activeLeftCard = leftCard;
    this.state.activeRightCard = rightCard;
    this.state.currentTurnStreak = 0;
    this.state.revealResult = null;
    this.state.revealNextAction = null;
    this.state.phase = "round_active";
    this.setRoundDeadline();
    this.touch();
    return this.getPublicState();
  }

  private advanceWithinRound(): PublicGameState {
    const nextChallenger = this.drawNextCard();
    const carryOverCard = this.state.activeRightCard;

    if (!carryOverCard || !nextChallenger) {
      throw this.error("DATASET_EXHAUSTED", "Nicht genug Fragen im Stapel, um die Runde fortzusetzen.");
    }

    this.state.activeLeftCard = carryOverCard;
    this.state.activeRightCard = nextChallenger;
    this.state.revealResult = null;
    this.state.revealNextAction = null;
    this.state.phase = "round_active";
    this.setRoundDeadline();
    this.touch();
    return this.getPublicState();
  }

  private endTurnReveal(
    guess: GuessDirection | null,
    wasCorrect: boolean,
    reason: RevealResult["reason"],
    message: string
  ): PublicGameState {
    const activePlayer = this.getActivePlayer();
    if (!activePlayer) {
      throw this.error("INVALID_PHASE", "Es gibt gerade keine aktive Person.");
    }

    const roundEnded = reason !== "correct";
    this.state.revealResult = {
      playerName: activePlayer.name,
      guess,
      correctDirection: this.resolveCorrectDirection(),
      wasCorrect,
      awardedPoint: wasCorrect,
      updatedScore: activePlayer.score,
      currentTurnStreak: this.state.currentTurnStreak,
      roundEnded,
      reason,
      message
    };
    this.state.revealNextAction = roundEnded
      ? this.state.roundNumber >= this.state.maxRounds
        ? "final"
        : "leaderboard"
      : "next_challenge";
    this.state.phase = "reveal";
    this.clearRoundDeadline();
    this.touch();
    return this.getPublicState();
  }

  public getPublicState(): PublicGameState {
    const publicQuestion: PublicQuestion | null =
      this.state.activeLeftCard && this.state.activeRightCard
        ? {
            leftLabel: this.state.activeLeftCard.label,
            leftValue: this.state.activeLeftCard.value,
            rightLabel: this.state.activeRightCard.label,
            rightValue: this.state.phase === "round_active" ? null : this.state.activeRightCard.value
          }
        : null;

    const orderedPlayers = this.getOrderedPlayers();

    return {
      sessionId: this.state.sessionId,
      phase: this.state.phase,
      roundNumber: this.state.roundNumber,
      maxRounds: this.state.maxRounds,
      players: this.state.players.map(toPlayerView),
      pendingLateJoiners: this.state.pendingLateJoiners.map(toPlayerView),
      activePlayerName: this.getActivePlayer()?.name ?? null,
      activeQuestion: publicQuestion,
      usedQuestionIds: [...this.state.usedQuestionIds],
      questionOrder: this.state.questionDeck.map((item) => item.sourceId),
      revealResult: this.state.revealResult,
      leaderboard: orderedPlayers.map(toPlayerView),
      finalRanking: this.state.phase === "final" ? orderedPlayers.map(toPlayerView) : [],
      canStart: this.state.phase === "lobby" && this.state.players.length > 0,
      startedAt: this.state.startedAt,
      updatedAt: this.state.updatedAt,
      roundDeadlineAt: this.state.roundDeadlineAt,
      roundTimeLimitSeconds: this.state.roundTimeLimitMs / 1000,
      currentTurnStreak: this.state.currentTurnStreak,
      streakCap: this.state.streakCap
    };
  }

  public joinLobby(firstName: string, clientId: string, socketId: string): PlayerView {
    if (this.state.phase !== "lobby") {
      throw this.error("ALREADY_STARTED", "Das Spiel läuft bereits. Nutze den Late-Join.");
    }

    const cleaned = this.ensureValidName(firstName);
    const existingByName = this.findAnyPlayerByName(cleaned);

    if (existingByName && existingByName.clientId !== clientId) {
      throw this.error("DUPLICATE_NAME", `${cleaned} ist bereits dabei.`);
    }

    const existingByClientId = this.findPlayerByClientId(clientId);
    const player = this.upsertPlayerRecord(existingByName ?? existingByClientId, cleaned, clientId, socketId);

    if (!this.state.players.includes(player)) {
      this.state.players.push(player);
    }

    player.status = "active";
    this.touch();
    return toPlayerView(player);
  }

  public addLatePlayer(firstName: string, clientId: string, socketId: string): PlayerView {
    if (this.state.phase === "lobby" || this.state.phase === "final") {
      throw this.error("INVALID_PHASE", "Late-Join geht nur während eines laufenden Spiels.");
    }

    const cleaned = this.ensureValidName(firstName);
    const existingByName = this.findAnyPlayerByName(cleaned);

    if (existingByName && existingByName.clientId !== clientId) {
      throw this.error("DUPLICATE_NAME", `${cleaned} ist bereits dabei.`);
    }

    const existingByClientId = this.findPlayerByClientId(clientId);
    const player = this.upsertPlayerRecord(existingByName ?? existingByClientId, cleaned, clientId, socketId);

    if (!this.state.pendingLateJoiners.includes(player) && !this.state.players.includes(player)) {
      player.status = "pending";
      this.state.pendingLateJoiners.push(player);
    } else if (this.state.pendingLateJoiners.includes(player)) {
      player.status = "pending";
    }

    this.touch();
    return toPlayerView(player);
  }

  public startGame(): PublicGameState {
    if (this.state.phase !== "lobby") {
      throw this.error("ALREADY_STARTED", "Das Spiel läuft bereits.");
    }

    if (this.state.players.length === 0) {
      throw this.error("INSUFFICIENT_PLAYERS", "Mindestens eine Person muss vorher beitreten.");
    }

    this.ensureQuestionDeck();
    this.state.startedAt = nowIso();
    this.touch();
    return this.startNewRound();
  }

  public submitGuess(guess: GuessDirection, clientId: string): PublicGameState {
    if (this.state.phase !== "round_active") {
      throw this.error("INVALID_PHASE", "Gerade kann keine Antwort abgegeben werden.");
    }

    const activePlayer = this.getActivePlayer();
    if (!activePlayer) {
      throw this.error("INVALID_PHASE", "Gerade gibt es keine aktive Person.");
    }

    if (activePlayer.clientId !== clientId) {
      throw this.error("NOT_ACTIVE_PLAYER", `Nur ${activePlayer.name} kann jetzt antworten.`);
    }

    const correctDirection = this.resolveCorrectDirection();
    const wasCorrect = correctDirection === guess;

    if (wasCorrect) {
      activePlayer.score += 1;
      this.state.currentTurnStreak += 1;

      if (this.state.currentTurnStreak >= this.state.streakCap) {
        return this.endTurnReveal(guess, true, "highperformer_cap", "Du Highperformer - lass auch mal andere ran!");
      }

      if (this.state.questionCursor >= this.state.questionDeck.length) {
        return this.endTurnReveal(guess, true, "deck_exhausted", "Richtig. Der Kartenstapel ist jetzt leer.");
      }

      return this.endTurnReveal(guess, true, "correct", "Richtig. Die nächste Karte wird direkt geladen.");
    }

    return this.endTurnReveal(guess, false, "wrong", "Leider falsch. Die Runde ist damit vorbei.");
  }

  public expireActiveTurn(): PublicGameState | null {
    if (this.state.phase !== "round_active") {
      return null;
    }

    return this.endTurnReveal(null, false, "timeout", "Zeit abgelaufen. Die Runde ist damit vorbei.");
  }

  public continueAfterReveal(): PublicGameState {
    if (this.state.phase !== "reveal") {
      throw this.error("INVALID_PHASE", "Nach der Auflösung gibt es gerade nichts fortzusetzen.");
    }

    if (this.state.revealNextAction === "next_challenge") {
      return this.advanceWithinRound();
    }

    if (this.state.revealNextAction === "leaderboard") {
      this.state.phase = "leaderboard";
      this.touch();
      return this.getPublicState();
    }

    if (this.state.revealNextAction === "final") {
      this.state.phase = "final";
      this.touch();
      return this.getPublicState();
    }

    throw this.error("INVALID_PHASE", "Es gibt keinen gültigen Folge-Schritt.");
  }

  public continueToNextRound(): PublicGameState {
    if (this.state.phase !== "leaderboard") {
      throw this.error("INVALID_PHASE", "Die nächste Runde kann nur vom Zwischenstand aus gestartet werden.");
    }

    return this.startNewRound();
  }

  public restart(): PublicGameState {
    const retainedPlayers = this.state.players.map<PlayerRecord>((player) => ({
      ...player,
      score: 0,
      status: "active",
      socketId: player.socketId,
      connected: player.connected
    }));

    this.state = {
      ...this.createInitialState(this.state.sessionId),
      players: retainedPlayers
    };
    this.touch();
    return this.getPublicState();
  }

  public reconnect(clientId: string, socketId: string): void {
    const player = this.findPlayerByClientId(clientId);
    if (!player) {
      return;
    }

    player.connected = true;
    player.socketId = socketId;
    this.touch();
  }

  public disconnect(socketId: string): void {
    const player = [...this.state.players, ...this.state.pendingLateJoiners].find((entry) => entry.socketId === socketId);
    if (!player) {
      return;
    }

    player.connected = false;
    player.socketId = null;
    this.touch();
  }
}

export class GameError extends Error {
  constructor(
    public readonly code: ErrorEventPayload["code"],
    message: string
  ) {
    super(message);
  }
}
