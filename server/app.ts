import { createServer } from "node:http";

import express from "express";
import { Server } from "socket.io";

import { GameError, GameSession } from "./game-session.js";
import { loadQuestions } from "./questions.js";
import type {
  ClientToServerEvents,
  ErrorEventPayload,
  PublicGameState,
  ServerToClientEvents,
  StateEnvelope
} from "../shared/contracts.js";

interface CreateGameServerOptions {
  roundTimeLimitMs?: number;
  revealDelayMs?: number;
  streakCap?: number;
}

function readClientId(candidate: unknown): string | null {
  if (typeof candidate !== "string") {
    return null;
  }

  const value = candidate.trim();
  return value.length >= 8 ? value : null;
}

function logEvent(message: string, details?: Record<string, unknown>): void {
  if (details) {
    console.log(message, JSON.stringify(details));
    return;
  }
  console.log(message);
}

function comparisonId(state: PublicGameState): string {
  const left = state.activeQuestion?.leftLabel ?? "left";
  const right = state.activeQuestion?.rightLabel ?? "right";
  return `${left}::${right}`;
}

export function createGameServer(options: CreateGameServerOptions = {}) {
  const questions = loadQuestions();
  logEvent("Dataset loaded", { totalQuestions: questions.length });

  const app = express();
  const server = createServer(app);
  const session = new GameSession(questions, "default-session", {
    ...(options.roundTimeLimitMs === undefined ? {} : { roundTimeLimitMs: options.roundTimeLimitMs }),
    ...(options.streakCap === undefined ? {} : { streakCap: options.streakCap })
  });
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
    cors: {
      origin: true,
      credentials: false
    }
  });

  const revealDelayMs = options.revealDelayMs ?? 1400;
  let roundTimer: NodeJS.Timeout | null = null;
  let revealTimer: NodeJS.Timeout | null = null;

  app.use(express.json());
  app.use(express.static("dist/public"));

  app.get("/health", (_request, response) => {
    response.json({
      ok: true,
      datasetQuestions: questions.length,
      phase: session.getPublicState().phase,
      roundNumber: session.getPublicState().roundNumber,
      timestamp: new Date().toISOString()
    });
  });

  app.use((_request, response) => {
    response.sendFile("index.html", { root: "dist/public" });
  });

  function emitState(socketId?: string): StateEnvelope {
    const payload = { state: session.getPublicState() };
    if (socketId) {
      io.to(socketId).emit("state_synced", payload);
    } else {
      io.emit("state_synced", payload);
    }
    return payload;
  }

  function emitError(socketId: string, error: unknown): void {
    const payload: ErrorEventPayload =
      error instanceof GameError
        ? { code: error.code, message: error.message }
        : {
            code: "INVALID_PHASE",
            message: "Ein unerwarteter Serverfehler ist aufgetreten."
          };

    io.to(socketId).emit("error_event", payload);
  }

  function clearRoundTimer(): void {
    if (!roundTimer) {
      return;
    }
    clearTimeout(roundTimer);
    roundTimer = null;
  }

  function clearRevealTimer(): void {
    if (!revealTimer) {
      return;
    }
    clearTimeout(revealTimer);
    revealTimer = null;
  }

  function syncAutomations(): void {
    clearRoundTimer();
    clearRevealTimer();

    const state = session.getPublicState();

    if (state.phase === "round_active" && state.roundDeadlineAt) {
      const delayMs = Math.max(new Date(state.roundDeadlineAt).getTime() - Date.now(), 0);
      roundTimer = setTimeout(() => {
        try {
          const expiredState = session.expireActiveTurn();
          if (!expiredState || !expiredState.revealResult) {
            return;
          }

          logEvent("Turn timed out", {
            playerName: expiredState.revealResult.playerName,
            roundNumber: expiredState.roundNumber
          });
          io.emit("answer_revealed", { revealResult: expiredState.revealResult, state: expiredState });
          emitState();
          syncAutomations();
        } catch (error) {
          logEvent("Timeout handling failed", { error: error instanceof Error ? error.message : "unknown" });
        }
      }, delayMs);
      return;
    }

    if (state.phase === "reveal" && state.revealResult) {
      revealTimer = setTimeout(() => {
        try {
          const nextState = session.continueAfterReveal();
          if (nextState.phase === "round_active") {
            logEvent("Challenge continued", {
              roundNumber: nextState.roundNumber,
              roundTurnNumber: nextState.roundTurnNumber,
              activePlayerName: nextState.activePlayerName,
              streak: nextState.currentTurnStreak
            });
            io.emit("round_started", { questionId: comparisonId(nextState), state: nextState });
          } else if (nextState.phase === "leaderboard") {
            logEvent("Leaderboard shown", { roundNumber: nextState.roundNumber });
            io.emit("leaderboard_shown", { state: nextState });
          } else if (nextState.phase === "final") {
            logEvent("Game finished", { roundNumber: nextState.roundNumber });
            io.emit("game_finished", { state: nextState });
          }
          emitState();
          syncAutomations();
        } catch (error) {
          logEvent("Reveal continuation failed", { error: error instanceof Error ? error.message : "unknown" });
        }
      }, revealDelayMs);
    }
  }

  io.use((socket, next) => {
    const clientId = readClientId(socket.handshake.auth.clientId);
    if (!clientId) {
      next(new Error("Missing client id"));
      return;
    }

    socket.data.clientId = clientId;
    next();
  });

  io.on("connection", (socket) => {
    const clientId = socket.data.clientId as string;
    session.reconnect(clientId, socket.id);
    emitState(socket.id);
    logEvent("Socket connected", { socketId: socket.id });

    socket.on("join_game", (payload) => {
      try {
        const player = session.joinLobby(payload.firstName, clientId, socket.id);
        logEvent("Player joined", { name: player.name });
        const state = emitState();
        io.emit("player_joined", { player, state: state.state });
      } catch (error) {
        emitError(socket.id, error);
      }
    });

    socket.on("add_late_player", (payload) => {
      try {
        const player = session.addLatePlayer(payload.firstName, clientId, socket.id);
        logEvent("Late player queued", { name: player.name });
        const state = emitState();
        io.emit("player_added_late", { player, state: state.state });
      } catch (error) {
        emitError(socket.id, error);
      }
    });

    socket.on("start_game", () => {
      try {
        const state = session.startGame();
        logEvent("Game started", {
          roundNumber: state.roundNumber,
          roundTurnNumber: state.roundTurnNumber,
          activePlayerName: state.activePlayerName,
          roundTimeLimitSeconds: state.roundTimeLimitSeconds
        });
        io.emit("game_started", { questionId: comparisonId(state), state });
        emitState();
        syncAutomations();
      } catch (error) {
        emitError(socket.id, error);
      }
    });

    socket.on("submit_guess", ({ guess }) => {
      try {
        const state = session.submitGuess(guess, clientId);
        if (!state.revealResult) {
          throw new Error("Reveal result missing after guess submission.");
        }

        logEvent("Guess submitted", {
          playerName: state.revealResult.playerName,
          guess,
          wasCorrect: state.revealResult.wasCorrect,
          streak: state.revealResult.currentTurnStreak,
          roundEnded: state.revealResult.roundEnded
        });
        io.emit("guess_accepted", { playerName: state.revealResult.playerName, state });
        io.emit("answer_revealed", { revealResult: state.revealResult, state });
        emitState();
        syncAutomations();
      } catch (error) {
        emitError(socket.id, error);
      }
    });

    socket.on("continue_to_next_round", () => {
      try {
        const state = session.continueToNextRound();
        if (state.phase === "round_active") {
          logEvent("Round started", {
            roundNumber: state.roundNumber,
            roundTurnNumber: state.roundTurnNumber,
            activePlayerName: state.activePlayerName
          });
          io.emit("round_started", { questionId: comparisonId(state), state });
        } else if (state.phase === "final") {
          logEvent("Game finished", { roundNumber: state.roundNumber });
          io.emit("game_finished", { state });
        }
        emitState();
        syncAutomations();
      } catch (error) {
        emitError(socket.id, error);
      }
    });

    socket.on("restart_game", () => {
      try {
        const state = session.restart();
        clearRoundTimer();
        clearRevealTimer();
        logEvent("Game restarted");
        emitState();
        io.emit("state_synced", { state });
      } catch (error) {
        emitError(socket.id, error);
      }
    });

    socket.on("request_state_sync", () => {
      emitState(socket.id);
    });

    socket.on("disconnect", () => {
      session.disconnect(socket.id);
      logEvent("Socket disconnected", { socketId: socket.id });
      emitState();
    });
  });

  server.on("close", () => {
    clearRoundTimer();
    clearRevealTimer();
  });

  return { app, server, io, session };
}
