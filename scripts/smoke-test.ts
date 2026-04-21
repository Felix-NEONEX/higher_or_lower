import assert from "node:assert/strict";

import { io as createClient, type Socket } from "socket.io-client";

import { createGameServer } from "../server/app.js";
import { GameSession } from "../server/game-session.js";
import type {
  ClientToServerEvents,
  ErrorEventPayload,
  GuessDirection,
  PublicGameState,
  QuestionEntry,
  ServerToClientEvents
} from "../shared/contracts.js";

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

function once<T>(socket: ClientSocket, event: keyof ServerToClientEvents): Promise<T> {
  return new Promise((resolve) => {
    socket.once(event, ((payload: T) => resolve(payload)) as never);
  });
}

async function connectClient(port: number, clientId: string): Promise<ClientSocket> {
  const socket = createClient(`http://127.0.0.1:${port}`, {
    auth: { clientId },
    transports: ["websocket"]
  });

  await once(socket, "state_synced");
  return socket;
}

function stateOf(socket: ClientSocket): Promise<PublicGameState> {
  return new Promise((resolve) => {
    socket.once("state_synced", ({ state }) => resolve(state));
    socket.emit("request_state_sync");
  });
}

function nextError(socket: ClientSocket): Promise<ErrorEventPayload> {
  return new Promise((resolve) => {
    socket.once("error_event", resolve);
  });
}

function currentCorrectGuess(session: GameSession): GuessDirection {
  const internalState = (session as any).state as {
    activeLeftCard: { value: number };
    activeRightCard: { value: number };
  };

  return internalState.activeRightCard.value >= internalState.activeLeftCard.value ? "higher" : "lower";
}

async function closeServer(server: ReturnType<typeof createGameServer>["server"]): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

async function verifyNetworkFlow(): Promise<void> {
  const runtime = createGameServer({ roundTimeLimitMs: 250, revealDelayMs: 40 });
  await new Promise<void>((resolve) => runtime.server.listen(0, "127.0.0.1", resolve));
  const address = runtime.server.address();
  if (!address || typeof address === "string") {
    throw new Error("Unable to acquire test port.");
  }

  const alice = await connectClient(address.port, "client-alice");
  const bob = await connectClient(address.port, "client-bob");
  const charlie = await connectClient(address.port, "client-charlie");
  const duplicateBob = await connectClient(address.port, "client-bob-duplicate");

  alice.emit("join_game", { firstName: "Alice" });
  bob.emit("join_game", { firstName: "Bob" });
  await once(alice, "player_joined");
  await once(bob, "player_joined");

  duplicateBob.emit("join_game", { firstName: "Bob" });
  const duplicateNameError = await nextError(duplicateBob);
  assert.equal(duplicateNameError.code, "DUPLICATE_NAME");

  alice.emit("start_game");
  const started = await once<{ state: PublicGameState }>(alice, "game_started");
  assert.equal(started.state.phase, "round_active");
  assert.equal(started.state.roundNumber, 1);
  assert.equal(started.state.roundTurnNumber, 1);
  assert.equal(started.state.roundPlayerCount, 2);
  assert.equal(started.state.activePlayerName, "Alice");

  bob.emit("submit_guess", { guess: "higher" });
  const notActiveError = await nextError(bob);
  assert.equal(notActiveError.code, "NOT_ACTIVE_PLAYER");

  charlie.emit("add_late_player", { firstName: "Charlie" });
  await once(alice, "player_added_late");

  const beforeCorrect = await stateOf(alice);
  const previousRightLabel = beforeCorrect.activeQuestion?.rightLabel;
  alice.emit("submit_guess", { guess: currentCorrectGuess(runtime.session) });
  const correctReveal = await once<{ state: PublicGameState }>(alice, "answer_revealed");
  assert.equal(correctReveal.state.phase, "reveal");
  assert.equal(correctReveal.state.revealResult?.reason, "correct");
  assert.equal(correctReveal.state.revealResult?.roundEnded, false);

  const chained = await once<{ state: PublicGameState }>(alice, "round_started");
  assert.equal(chained.state.phase, "round_active");
  assert.equal(chained.state.roundNumber, 1);
  assert.equal(chained.state.roundTurnNumber, 1);
  assert.equal(chained.state.activePlayerName, "Alice");
  assert.equal(chained.state.currentTurnStreak, 1);
  assert.equal(chained.state.activeQuestion?.leftLabel, previousRightLabel);
  assert.equal(chained.state.pendingLateJoiners[0]?.name, "Charlie");

  const wrongGuess = currentCorrectGuess(runtime.session) === "higher" ? "lower" : "higher";
  alice.emit("submit_guess", { guess: wrongGuess });
  const wrongReveal = await once<{ state: PublicGameState }>(alice, "answer_revealed");
  assert.equal(wrongReveal.state.revealResult?.reason, "wrong");
  assert.equal(wrongReveal.state.revealResult?.roundEnded, true);

  const nextTurn = await once<{ state: PublicGameState }>(alice, "round_started");
  assert.equal(nextTurn.state.phase, "round_active");
  assert.equal(nextTurn.state.roundNumber, 1);
  assert.equal(nextTurn.state.roundTurnNumber, 2);
  assert.equal(nextTurn.state.roundPlayerCount, 2);
  assert.equal(nextTurn.state.activePlayerName, "Bob");
  assert.equal(nextTurn.state.pendingLateJoiners[0]?.name, "Charlie");

  bob.emit("submit_guess", { guess: currentCorrectGuess(runtime.session) === "higher" ? "lower" : "higher" });
  const bobWrongReveal = await once<{ state: PublicGameState }>(alice, "answer_revealed");
  assert.equal(bobWrongReveal.state.revealResult?.reason, "wrong");
  assert.equal(bobWrongReveal.state.revealResult?.roundEnded, true);

  const leaderboard = await once<{ state: PublicGameState }>(alice, "leaderboard_shown");
  assert.equal(leaderboard.state.phase, "leaderboard");
  assert.equal(leaderboard.state.roundNumber, 1);

  alice.emit("continue_to_next_round");
  const nextRound = await once<{ state: PublicGameState }>(alice, "round_started");
  assert.equal(nextRound.state.roundNumber, 2);
  assert.equal(nextRound.state.roundTurnNumber, 1);
  assert.equal(nextRound.state.roundPlayerCount, 3);
  assert.equal(nextRound.state.activePlayerName, "Charlie");
  assert(nextRound.state.players.some((player) => player.name === "Charlie"));
  assert.equal(nextRound.state.pendingLateJoiners.length, 0);

  alice.disconnect();
  bob.disconnect();
  charlie.disconnect();
  duplicateBob.disconnect();
  await closeServer(runtime.server);
}

async function verifyTimeout(): Promise<void> {
  const runtime = createGameServer({ roundTimeLimitMs: 80, revealDelayMs: 20 });
  await new Promise<void>((resolve) => runtime.server.listen(0, "127.0.0.1", resolve));
  const address = runtime.server.address();
  if (!address || typeof address === "string") {
    throw new Error("Unable to acquire test port.");
  }

  const solo = await connectClient(address.port, "client-solo");
  solo.emit("join_game", { firstName: "Solo" });
  await once(solo, "player_joined");
  solo.emit("start_game");
  await once(solo, "game_started");

  const timedOut = await once<{ state: PublicGameState }>(solo, "answer_revealed");
  assert.equal(timedOut.state.revealResult?.reason, "timeout");
  assert.equal(timedOut.state.revealResult?.roundEnded, true);

  const leaderboard = await once<{ state: PublicGameState }>(solo, "leaderboard_shown");
  assert.equal(leaderboard.state.phase, "leaderboard");

  solo.disconnect();
  await closeServer(runtime.server);
}

function buildSyntheticQuestions(count: number): QuestionEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `q${String(index + 1).padStart(3, "0")}`,
    leftLabel: `Left ${index + 1}`,
    leftValue: index * 10 + 1,
    rightLabel: `Right ${index + 1}`,
    rightValue: index * 10 + 9
  }));
}

function verifyHighperformerCap(): void {
  const session = new GameSession(buildSyntheticQuestions(20), "test-session", {
    maxRounds: 1,
    streakCap: 7,
    roundTimeLimitMs: 7000
  });

  session.joinLobby("Alice", "client-alice", "socket-alice");
  session.startGame();

  for (let streak = 1; streak <= 7; streak += 1) {
    const state = session.submitGuess(currentCorrectGuess(session), "client-alice");
    assert.equal(state.phase, "reveal");

    if (streak < 7) {
      assert.equal(state.revealResult?.reason, "correct");
      assert.equal(state.revealResult?.roundEnded, false);
      const resumed = session.continueAfterReveal();
      assert.equal(resumed.phase, "round_active");
      assert.equal(resumed.currentTurnStreak, streak);
    } else {
      assert.equal(state.revealResult?.reason, "highperformer_cap");
      assert.equal(state.revealResult?.roundEnded, true);
      assert.equal(state.revealResult?.message, "Du Highperformer - lass auch mal andere ran!");
    }
  }
}

async function main(): Promise<void> {
  await verifyNetworkFlow();
  await verifyTimeout();
  verifyHighperformerCap();
  console.log("Smoke test passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
