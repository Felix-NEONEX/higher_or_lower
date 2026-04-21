export type GamePhase = "lobby" | "round_active" | "reveal" | "leaderboard" | "final";

export type GuessDirection = "higher" | "lower";

export type RevealReason = "correct" | "wrong" | "timeout" | "highperformer_cap" | "deck_exhausted";

export interface QuestionEntry {
  id: string;
  leftLabel: string;
  leftValue: number;
  rightLabel: string;
  rightValue: number;
}

export interface QuestionCard {
  id: string;
  sourceId: string;
  side: "left" | "right";
  label: string;
  value: number;
}

export interface PublicQuestion {
  leftLabel: string;
  leftValue: number;
  rightLabel: string;
  rightValue: number | null;
}

export interface PlayerView {
  name: string;
  score: number;
  joinedAt: string;
  status: "active" | "pending";
  connected: boolean;
}

export interface RevealResult {
  playerName: string;
  guess: GuessDirection | null;
  correctDirection: GuessDirection;
  wasCorrect: boolean;
  awardedPoint: boolean;
  updatedScore: number;
  currentTurnStreak: number;
  roundEnded: boolean;
  reason: RevealReason;
  message: string;
}

export interface PublicGameState {
  sessionId: string;
  phase: GamePhase;
  roundNumber: number;
  maxRounds: number;
  roundTurnNumber: number;
  roundPlayerCount: number;
  players: PlayerView[];
  pendingLateJoiners: PlayerView[];
  activePlayerName: string | null;
  activeQuestion: PublicQuestion | null;
  usedQuestionIds: string[];
  questionOrder: string[];
  revealResult: RevealResult | null;
  leaderboard: PlayerView[];
  finalRanking: PlayerView[];
  canStart: boolean;
  startedAt: string | null;
  updatedAt: string;
  roundDeadlineAt: string | null;
  roundTimeLimitSeconds: number;
  currentTurnStreak: number;
  streakCap: number;
}

export interface JoinPayload {
  firstName: string;
}

export interface SubmitGuessPayload {
  guess: GuessDirection;
}

export interface ErrorEventPayload {
  code:
    | "INVALID_NAME"
    | "DUPLICATE_NAME"
    | "ALREADY_STARTED"
    | "NOT_STARTED"
    | "INVALID_PHASE"
    | "NOT_ACTIVE_PLAYER"
    | "ALREADY_ANSWERED"
    | "INSUFFICIENT_PLAYERS"
    | "UNKNOWN_PLAYER"
    | "DATASET_EXHAUSTED";
  message: string;
}

export interface StateEnvelope {
  state: PublicGameState;
}

export interface PlayerJoinedEnvelope extends StateEnvelope {
  player: PlayerView;
}

export interface GuessAcceptedEnvelope extends StateEnvelope {
  playerName: string;
}

export interface RoundStartedEnvelope extends StateEnvelope {
  questionId: string;
}

export interface RevealedEnvelope extends StateEnvelope {
  revealResult: RevealResult;
}

export interface LeaderboardEnvelope extends StateEnvelope {}

export interface GameFinishedEnvelope extends StateEnvelope {}

export interface ClientToServerEvents {
  join_game: (payload: JoinPayload) => void;
  add_late_player: (payload: JoinPayload) => void;
  start_game: () => void;
  submit_guess: (payload: SubmitGuessPayload) => void;
  continue_to_next_round: () => void;
  restart_game: () => void;
  request_state_sync: () => void;
}

export interface ServerToClientEvents {
  state_synced: (payload: StateEnvelope) => void;
  player_joined: (payload: PlayerJoinedEnvelope) => void;
  player_added_late: (payload: PlayerJoinedEnvelope) => void;
  game_started: (payload: RoundStartedEnvelope) => void;
  round_started: (payload: RoundStartedEnvelope) => void;
  guess_accepted: (payload: GuessAcceptedEnvelope) => void;
  answer_revealed: (payload: RevealedEnvelope) => void;
  leaderboard_shown: (payload: LeaderboardEnvelope) => void;
  game_finished: (payload: GameFinishedEnvelope) => void;
  error_event: (payload: ErrorEventPayload) => void;
}
