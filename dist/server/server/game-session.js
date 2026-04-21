function cleanName(value) {
    return value.replace(/\s+/g, " ").trim();
}
function nowIso() {
    return new Date().toISOString();
}
function hashSeed(seed) {
    let hash = 1779033703 ^ seed.length;
    for (let index = 0; index < seed.length; index += 1) {
        hash = Math.imul(hash ^ seed.charCodeAt(index), 3432918353);
        hash = (hash << 13) | (hash >>> 19);
    }
    return hash >>> 0;
}
function mulberry32(seed) {
    let value = seed >>> 0;
    return () => {
        value += 0x6d2b79f5;
        let result = Math.imul(value ^ (value >>> 15), value | 1);
        result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
        return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    };
}
function shuffleDeterministically(items, seed) {
    const shuffled = [...items];
    const random = mulberry32(hashSeed(seed));
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const nextIndex = Math.floor(random() * (index + 1));
        [shuffled[index], shuffled[nextIndex]] = [shuffled[nextIndex], shuffled[index]];
    }
    return shuffled;
}
function toPlayerView(player) {
    return {
        name: player.name,
        score: player.score,
        joinedAt: player.joinedAt,
        status: player.status,
        connected: player.connected
    };
}
export class GameSession {
    questions;
    options;
    state;
    constructor(questions, sessionId = "default-session", options = {}) {
        this.questions = questions;
        this.options = {
            maxRounds: options.maxRounds ?? 5,
            roundTimeLimitMs: options.roundTimeLimitMs ?? 7000,
            streakCap: options.streakCap ?? 7
        };
        this.state = this.createInitialState(sessionId);
    }
    createInitialState(sessionId) {
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
    touch() {
        this.state.updatedAt = nowIso();
    }
    ensureValidName(firstName) {
        const cleaned = cleanName(firstName);
        if (cleaned.length < 2 || cleaned.length > 32) {
            throw this.error("INVALID_NAME", "Bitte nutze einen Vornamen mit 2 bis 32 Zeichen.");
        }
        if (!/^[\p{L}\p{N} .'-]+$/u.test(cleaned)) {
            throw this.error("INVALID_NAME", "Bitte nutze nur Buchstaben, Zahlen, Leerzeichen, Punkte, Apostrophe oder Bindestriche.");
        }
        return cleaned;
    }
    error(code, message) {
        return new GameError(code, message);
    }
    buildDeck(seed) {
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
    drawNextCard() {
        const nextCard = this.state.questionDeck[this.state.questionCursor] ?? null;
        if (!nextCard) {
            return null;
        }
        this.state.questionCursor += 1;
        this.state.usedQuestionIds.push(nextCard.sourceId);
        return nextCard;
    }
    setRoundDeadline() {
        this.state.roundDeadlineAt = new Date(Date.now() + this.state.roundTimeLimitMs).toISOString();
    }
    clearRoundDeadline() {
        this.state.roundDeadlineAt = null;
    }
    getActivePlayer() {
        if (this.state.activePlayerIndex < 0) {
            return null;
        }
        return this.state.players[this.state.activePlayerIndex] ?? null;
    }
    getOrderedPlayers() {
        return [...this.state.players].sort((left, right) => {
            if (right.score !== left.score) {
                return right.score - left.score;
            }
            return left.joinedAt.localeCompare(right.joinedAt);
        });
    }
    findAnyPlayerByName(name) {
        return [...this.state.players, ...this.state.pendingLateJoiners].find((player) => player.name === name);
    }
    findPlayerByClientId(clientId) {
        return [...this.state.players, ...this.state.pendingLateJoiners].find((player) => player.clientId === clientId);
    }
    upsertPlayerRecord(existing, name, clientId, socketId) {
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
    promoteLateJoiners() {
        if (this.state.pendingLateJoiners.length === 0) {
            return;
        }
        for (const player of this.state.pendingLateJoiners) {
            player.status = "active";
            this.state.players.push(player);
        }
        this.state.pendingLateJoiners = [];
    }
    ensureQuestionDeck() {
        if (this.state.questionDeck.length > 0) {
            return;
        }
        const seed = `${this.state.sessionId}-${Date.now()}`;
        this.state.questionDeck = this.buildDeck(seed);
        this.state.questionCursor = 0;
        this.state.usedQuestionIds = [];
    }
    resolveCorrectDirection() {
        const leftValue = this.state.activeLeftCard?.value;
        const rightValue = this.state.activeRightCard?.value;
        if (leftValue === undefined || rightValue === undefined) {
            throw this.error("INVALID_PHASE", "Es gibt gerade keinen aktiven Vergleich.");
        }
        return rightValue >= leftValue ? "higher" : "lower";
    }
    startNewRound() {
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
    advanceWithinRound() {
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
    endTurnReveal(guess, wasCorrect, reason, message) {
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
    getPublicState() {
        const publicQuestion = this.state.activeLeftCard && this.state.activeRightCard
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
    joinLobby(firstName, clientId, socketId) {
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
    addLatePlayer(firstName, clientId, socketId) {
        if (this.state.phase === "lobby" || this.state.phase === "final") {
            throw this.error("INVALID_PHASE", "Late-Join geht nur waehrend eines laufenden Spiels.");
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
        }
        else if (this.state.pendingLateJoiners.includes(player)) {
            player.status = "pending";
        }
        this.touch();
        return toPlayerView(player);
    }
    startGame() {
        if (this.state.phase !== "lobby") {
            throw this.error("ALREADY_STARTED", "Das Spiel laeuft bereits.");
        }
        if (this.state.players.length === 0) {
            throw this.error("INSUFFICIENT_PLAYERS", "Mindestens eine Person muss vorher beitreten.");
        }
        this.ensureQuestionDeck();
        this.state.startedAt = nowIso();
        this.touch();
        return this.startNewRound();
    }
    submitGuess(guess, clientId) {
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
            return this.endTurnReveal(guess, true, "correct", "Richtig. Die naechste Karte wird direkt geladen.");
        }
        return this.endTurnReveal(guess, false, "wrong", "Leider falsch. Die Runde ist damit vorbei.");
    }
    expireActiveTurn() {
        if (this.state.phase !== "round_active") {
            return null;
        }
        return this.endTurnReveal(null, false, "timeout", "Zeit abgelaufen. Die Runde ist damit vorbei.");
    }
    continueAfterReveal() {
        if (this.state.phase !== "reveal") {
            throw this.error("INVALID_PHASE", "Nach dem Reveal gibt es gerade nichts fortzusetzen.");
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
        throw this.error("INVALID_PHASE", "Es gibt keinen gueltigen Folge-Schritt.");
    }
    continueToNextRound() {
        if (this.state.phase !== "leaderboard") {
            throw this.error("INVALID_PHASE", "Die naechste Runde kann nur vom Leaderboard aus gestartet werden.");
        }
        return this.startNewRound();
    }
    restart() {
        const retainedPlayers = this.state.players.map((player) => ({
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
    reconnect(clientId, socketId) {
        const player = this.findPlayerByClientId(clientId);
        if (!player) {
            return;
        }
        player.connected = true;
        player.socketId = socketId;
        this.touch();
    }
    disconnect(socketId) {
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
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
