const BOARD_SIZE = 8;
const DIRECTIONS = [
  [-1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, -1],
];

const POSITIONAL_WEIGHTS = [
  [120, -20, 20, 5, 5, 20, -20, 120],
  [-20, -55, -8, -6, -6, -8, -55, -20],
  [20, -8, 18, 3, 3, 18, -8, 20],
  [5, -6, 3, 3, 3, 3, -6, 5],
  [5, -6, 3, 3, 3, 3, -6, 5],
  [20, -8, 18, 3, 3, 18, -8, 20],
  [-20, -55, -8, -6, -6, -8, -55, -20],
  [120, -20, 20, 5, 5, 20, -20, 120],
];

const CORNERS = [
  { row: 0, column: 0 },
  { row: 0, column: 7 },
  { row: 7, column: 0 },
  { row: 7, column: 7 },
];

const CORNER_NEIGHBORS = [
  [
    { row: 0, column: 1 },
    { row: 1, column: 0 },
    { row: 1, column: 1 },
  ],
  [
    { row: 0, column: 6 },
    { row: 1, column: 7 },
    { row: 1, column: 6 },
  ],
  [
    { row: 6, column: 0 },
    { row: 7, column: 1 },
    { row: 6, column: 1 },
  ],
  [
    { row: 6, column: 7 },
    { row: 7, column: 6 },
    { row: 6, column: 6 },
  ],
];

const AI_LEVELS = {
  strong: {
    id: "strong",
    label: "強い",
  },
  strongest: {
    id: "strongest",
    label: "最強",
  },
};

const AI_PROGRESS_YIELD_MS = 16;
const AI_TIME_LIMITS_MS = {
  strongest: 10000,
};
const TT_EXACT = "exact";
const TT_LOWER = "lower";
const TT_UPPER = "upper";
const ENDGAME_EXACT_EMPTY_LIMIT = 12;
const OPENING_BOOK = new Map([
  ["...................b.......bb......bw...........................", { row: 2, column: 2 }],
  ["..........................bbb......bw...........................", { row: 2, column: 2 }],
  ["...........................wb......bbb..........................", { row: 5, column: 5 }],
  ["...........................wb......bb.......b...................", { row: 5, column: 5 }],
]);
const FULL_BOARD_MASK = (1n << 64n) - 1n;
const NOT_A_FILE = 0xfefefefefefefefen;
const NOT_H_FILE = 0x7f7f7f7f7f7f7f7fn;
const BITBOARD_DIRECTIONS = [
  { shift: 8n, mask: FULL_BOARD_MASK },
  { shift: -8n, mask: FULL_BOARD_MASK },
  { shift: 1n, mask: NOT_H_FILE },
  { shift: -1n, mask: NOT_A_FILE },
  { shift: 9n, mask: NOT_H_FILE },
  { shift: 7n, mask: NOT_A_FILE },
  { shift: -7n, mask: NOT_H_FILE },
  { shift: -9n, mask: NOT_A_FILE },
];

const ELEMENTS = {
  blackCount: document.querySelector("#black-count"),
  blackRole: document.querySelector("#black-role"),
  board: document.querySelector("#board"),
  difficultyButtons: [...document.querySelectorAll(".difficulty-button")],
  difficultyPanel: document.querySelector("#difficulty-panel"),
  modeButtons: [...document.querySelectorAll(".mode-button")],
  resetButton: document.querySelector("#reset-button"),
  statusText: document.querySelector("#status-text"),
  whiteCount: document.querySelector("#white-count"),
  whiteRole: document.querySelector("#white-role"),
};

const state = {
  aiThinking: false,
  currentPlayer: "black",
  displayedBoard: [],
  game: null,
  isAnimating: false,
  lastMove: null,
  aiLevel: "strong",
  aiSearchId: 0,
  mode: "solo",
};

const boardCells = new Map();

class ReversiGame {
  constructor(board = null, lastMove = null) {
    this.board = board ? cloneBoard(board) : createInitialBoard();
    this.lastMove = lastMove ? { ...lastMove } : null;
    this.countCache = new Map();
    this.moveCache = new Map();
    this.bitboardCache = null;
    this.serializedBoard = null;
  }

  clone() {
    return new ReversiGame(this.board, this.lastMove);
  }

  discAt(position) {
    if (isOnBoard(position) === false) {
      return null;
    }
    return this.board[position.row][position.column];
  }

  captures(move, player) {
    if (isOnBoard(move) === false || this.discAt(move) !== null) {
      return [];
    }

    const captured = [];
    for (const [deltaRow, deltaColumn] of DIRECTIONS) {
      const line = [];
      let row = move.row + deltaRow;
      let column = move.column + deltaColumn;

      while (isOnBoard({ row, column }) && this.board[row][column] === opponentOf(player)) {
        line.push({ row, column });
        row += deltaRow;
        column += deltaColumn;
      }

      if (line.length > 0 && isOnBoard({ row, column }) && this.board[row][column] === player) {
        captured.push(...line);
      }
    }

    return captured;
  }

  validMoves(player) {
    const cached = this.moveCache.get(player);
    if (cached !== undefined) {
      return cached.map((move) => ({ ...move }));
    }

    const moves = bitboardToMoves(this.legalMoveBits(player));
    this.moveCache.set(player, moves);
    return moves.map((move) => ({ ...move }));
  }

  bitboards() {
    if (this.bitboardCache !== null) {
      return this.bitboardCache;
    }

    let black = 0n;
    let white = 0n;
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let column = 0; column < BOARD_SIZE; column += 1) {
        const bit = positionBit({ row, column });
        if (this.board[row][column] === "black") {
          black |= bit;
        } else if (this.board[row][column] === "white") {
          white |= bit;
        }
      }
    }

    this.bitboardCache = { black, white };
    return this.bitboardCache;
  }

  legalMoveBits(player) {
    const boards = this.bitboards();
    const own = boards[player];
    const opponent = boards[opponentOf(player)];
    const empty = ~(own | opponent) & FULL_BOARD_MASK;
    let legal = 0n;

    for (const direction of BITBOARD_DIRECTIONS) {
      let captured = shiftBits(own, direction) & opponent;
      for (let step = 0; step < 5; step += 1) {
        captured |= shiftBits(captured, direction) & opponent;
      }
      legal |= shiftBits(captured, direction) & empty;
    }

    return legal;
  }

  performMove(move, player) {
    const captured = this.captures(move, player);
    if (captured.length === 0) {
      return [];
    }

    this.board[move.row][move.column] = player;
    for (const position of captured) {
      this.board[position.row][position.column] = player;
    }
    this.lastMove = { ...move };
    this.clearCaches();
    return captured;
  }

  clearCaches() {
    this.countCache.clear();
    this.moveCache.clear();
    this.bitboardCache = null;
    this.serializedBoard = null;
  }

  count(disc) {
    const cached = this.countCache.get(disc);
    if (cached !== undefined) {
      return cached;
    }

    let total = 0;
    for (const row of this.board) {
      for (const cell of row) {
        if (cell === disc) {
          total += 1;
        }
      }
    }
    this.countCache.set(disc, total);
    return total;
  }

  get emptyCount() {
    const cached = this.countCache.get("empty");
    if (cached !== undefined) {
      return cached;
    }

    let total = 0;
    for (const row of this.board) {
      for (const cell of row) {
        if (cell === null) {
          total += 1;
        }
      }
    }
    this.countCache.set("empty", total);
    return total;
  }

  get isBoardFull() {
    return this.emptyCount === 0;
  }

  get isGameOver() {
    return this.isBoardFull || (this.validMoves("black").length === 0 && this.validMoves("white").length === 0);
  }

  winner() {
    const black = this.count("black");
    const white = this.count("white");
    if (black === white) {
      return null;
    }
    return black > white ? "black" : "white";
  }

  boardKey() {
    if (this.serializedBoard === null) {
      this.serializedBoard = serializeBoard(this.board);
    }
    return this.serializedBoard;
  }

  bestMoveDetails(player, profile) {
    const moves = this.orderedMoves(player, profile);
    if (moves.length === 0) {
      return null;
    }

    const depth = this.searchDepth(profile);
    const table = new Map();
    const beta = Number.POSITIVE_INFINITY;
    let alpha = Number.NEGATIVE_INFINITY;
    let bestMove = moves[0];
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const move of moves) {
      const simulated = this.clone();
      simulated.performMove(move, player);
      const score = -simulated.negamax(opponentOf(player), depth - 1, -beta, -alpha, false, table, profile);

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
      alpha = Math.max(alpha, score);
    }

    return {
      move: bestMove,
    };
  }

  async bestMoveDetailsAsync(player, profile, options = {}) {
    const moves = this.orderedMoves(player, profile);
    if (moves.length === 0) {
      return null;
    }

    const bookMove = this.bookMove(player, moves);
    if (bookMove !== null) {
      return {
        move: bookMove,
      };
    }

    const maxDepth = this.searchDepth(profile);
    const exactEndgame = this.emptyCount <= ENDGAME_EXACT_EMPTY_LIMIT;
    const table = new Map();
    const startedAt = performance.now();
    const timeLimitMs = AI_TIME_LIMITS_MS[profile.id] ?? null;
    const deadlineAt = timeLimitMs === null ? Number.POSITIVE_INFINITY : startedAt + timeLimitMs;
    const searchContext = {
      cancelled: false,
      deadlineAt,
      lastYieldAt: startedAt,
      nodes: 0,
      onPulse: () => {
        options.onProgress?.({
          completed: 0,
          total: moves.length,
          elapsedMs: performance.now() - startedAt,
          searchedNodes: searchContext.nodes,
          timeLimitMs,
          timedOut: searchContext.timedOut,
        });
      },
      shouldCancel: options.shouldCancel,
      timedOut: false,
    };
    let bestMove = moves[0];
    let bestScore = Number.NEGATIVE_INFINITY;
    let completed = 0;

    for (let depth = 1; depth <= maxDepth; depth += 1) {
      if (options.shouldCancel?.() === true || searchContext.cancelled) {
        return null;
      }
      if (timeLimitMs !== null && performance.now() >= deadlineAt) {
        searchContext.timedOut = true;
        break;
      }

      const result = await this.searchRootAsync(player, depth, table, profile, searchContext, bestMove);
      if (searchContext.cancelled) {
        return null;
      }
      if (searchContext.timedOut) {
        break;
      }
      bestMove = result.move;
      bestScore = result.score;
      completed = depth;
      options.onProgress?.({
        completed,
        total: maxDepth,
        elapsedMs: performance.now() - startedAt,
        searchedNodes: searchContext.nodes,
        timeLimitMs,
        timedOut: searchContext.timedOut,
        unit: "depth",
      });

      if (exactEndgame && depth === maxDepth) {
        break;
      }
      if (completed < maxDepth) {
        await wait(AI_PROGRESS_YIELD_MS);
      }
    }

    return {
      move: bestMove,
      score: bestScore,
      depth: completed,
      timedOut: searchContext.timedOut,
    };
  }

  async searchRootAsync(player, depth, table, profile, context, preferredMove) {
    const beta = Number.POSITIVE_INFINITY;
    let alpha = Number.NEGATIVE_INFINITY;
    let bestMove = preferredMove;
    let bestScore = Number.NEGATIVE_INFINITY;
    const moves = this.orderedMoves(player, profile, preferredMove);
    let isFirstMove = true;

    for (const move of moves) {
      if (context.cancelled || context.timedOut) {
        break;
      }

      const simulated = this.clone();
      simulated.performMove(move, player);
      let score;
      if (isFirstMove) {
        score = -await simulated.negamaxAsync(opponentOf(player), depth - 1, -beta, -alpha, false, table, profile, context);
        isFirstMove = false;
      } else {
        score = -await simulated.negamaxAsync(opponentOf(player), depth - 1, -alpha - 1, -alpha, false, table, profile, context);
        if (score > alpha && score < beta && context.cancelled === false && context.timedOut === false) {
          score = -await simulated.negamaxAsync(opponentOf(player), depth - 1, -beta, -score, false, table, profile, context);
        }
      }
      if (context.cancelled || context.timedOut) {
        break;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
      alpha = Math.max(alpha, score);
    }

    return {
      move: bestMove,
      score: bestScore,
    };
  }

  searchDepth(profile) {
    if (profile.id === "strong") {
      if (this.emptyCount <= 10) {
        return this.emptyCount;
      }
      if (this.emptyCount <= 16) {
        return 8;
      }
      if (this.emptyCount <= 28) {
        return 6;
      }
      return 5;
    }

    if (this.emptyCount <= 14) {
      return this.emptyCount;
    }
    if (this.emptyCount <= 18) {
      return 11;
    }
    if (this.emptyCount <= 24) {
      return 10;
    }
    if (this.emptyCount <= 32) {
      return 8;
    }
    if (this.emptyCount <= 44) {
      return 7;
    }
    if (this.emptyCount <= 52) {
      return 6;
    }
    return 5;
  }

  bookMove(player, moves) {
    if (player !== "white") {
      return null;
    }

    const candidate = OPENING_BOOK.get(this.boardKey());
    if (candidate === undefined) {
      return null;
    }
    return moves.some((move) => samePosition(move, candidate)) ? candidate : null;
  }

  orderedMoves(player, profile, preferredMove = null) {
    return this.validMoves(player).sort((lhs, rhs) => {
      if (preferredMove !== null) {
        if (samePosition(lhs, preferredMove)) {
          return -1;
        }
        if (samePosition(rhs, preferredMove)) {
          return 1;
        }
      }
      return this.moveOrderingScore(rhs, player, profile) - this.moveOrderingScore(lhs, player, profile);
    });
  }

  moveOrderingScore(move, player, profile) {
    if (profile.id === "strong") {
      const captured = this.captures(move, player).length;
      return (POSITIONAL_WEIGHTS[move.row][move.column] * 10) + (captured * 5) + this.cornerDangerAdjustment(move);
    }

    if (CORNERS.some((corner) => samePosition(corner, move))) {
      return 100000;
    }

    const simulated = this.clone();
    const captured = simulated.performMove(move, player).length;
    const opponent = opponentOf(player);
    const opponentMoves = simulated.validMoves(opponent).length;
    const selfMoves = simulated.validMoves(player).length;
    const opponentCornerMoves = simulated.validCornerMoves(opponent);
    const stableEdges = simulated.stableEdgeDiscs(player) - simulated.stableEdgeDiscs(opponent);

    return (POSITIONAL_WEIGHTS[move.row][move.column] * 14)
      + (selfMoves * 22)
      - (opponentMoves * 30)
      - (opponentCornerMoves * 700)
      + (stableEdges * 80)
      + this.cornerDangerAdjustment(move)
      + captured;
  }

  cornerDangerAdjustment(move) {
    for (let index = 0; index < CORNERS.length; index += 1) {
      const corner = CORNERS[index];
      const neighbors = CORNER_NEIGHBORS[index];
      if (neighbors.some((position) => samePosition(position, move)) && this.discAt(corner) === null) {
        return -260;
      }
    }
    return 0;
  }

  negamax(player, depth, alpha, beta, previousTurnWasPass, table, profile) {
    const key = profile.id === "strong"
      ? `${this.boardKey()}|${player}|${depth}|${previousTurnWasPass ? 1 : 0}|${profile.id}`
      : `${this.boardKey()}|${player}|${previousTurnWasPass ? 1 : 0}|${profile.id}`;
    const cached = table.get(key);
    if (cached !== undefined && (profile.id === "strong" || cached.depth >= depth)) {
      return cached.score;
    }

    if (this.isGameOver || (previousTurnWasPass && this.validMoves(player).length === 0)) {
      const score = this.terminalScore(player);
      table.set(key, { depth, score });
      return score;
    }

    if (depth === 0) {
      const score = this.evaluate(player, profile);
      table.set(key, { depth, score });
      return score;
    }

    const moves = this.orderedMoves(player, profile);
    if (moves.length === 0) {
      const score = -this.negamax(opponentOf(player), depth, -beta, -alpha, true, table, profile);
      table.set(key, { depth, score });
      return score;
    }

    let localAlpha = alpha;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const move of moves) {
      const simulated = this.clone();
      simulated.performMove(move, player);
      const score = -simulated.negamax(opponentOf(player), depth - 1, -beta, -localAlpha, false, table, profile);
      bestScore = Math.max(bestScore, score);
      localAlpha = Math.max(localAlpha, score);
      if (localAlpha >= beta) {
        break;
      }
    }

    table.set(key, { depth, score: bestScore });
    return bestScore;
  }

  async negamaxAsync(player, depth, alpha, beta, previousTurnWasPass, table, profile, context) {
    const alphaOriginal = alpha;
    context.nodes += 1;
    if (context.nodes % 2048 === 0) {
      const now = performance.now();
      if (now - context.lastYieldAt >= 80) {
        context.lastYieldAt = now;
        context.onPulse?.();
        await wait(0);
        if (context.shouldCancel?.() === true) {
          context.cancelled = true;
          return 0;
        }
        if (context.deadlineAt !== Number.POSITIVE_INFINITY && now >= context.deadlineAt) {
          context.timedOut = true;
          return this.evaluate(player, profile);
        }
      }
    }

    const key = profile.id === "strong"
      ? `${this.boardKey()}|${player}|${depth}|${previousTurnWasPass ? 1 : 0}|${profile.id}`
      : `${this.boardKey()}|${player}|${previousTurnWasPass ? 1 : 0}|${profile.id}`;
    const cached = table.get(key);
    if (cached !== undefined && cached.depth >= depth) {
      if (cached.flag === TT_EXACT) {
        return cached.score;
      }
      if (cached.flag === TT_LOWER) {
        alpha = Math.max(alpha, cached.score);
      } else if (cached.flag === TT_UPPER) {
        beta = Math.min(beta, cached.score);
      }
      if (alpha >= beta) {
        return cached.score;
      }
    }

    if (this.isGameOver || (previousTurnWasPass && this.validMoves(player).length === 0)) {
      const score = this.terminalScore(player);
      table.set(key, { depth, flag: TT_EXACT, move: null, score });
      return score;
    }

    if (depth === 0) {
      const score = this.evaluate(player, profile);
      table.set(key, { depth, flag: TT_EXACT, move: null, score });
      return score;
    }

    const moves = this.orderedMoves(player, profile, cached?.move ?? null);
    if (moves.length === 0) {
      const score = -await this.negamaxAsync(opponentOf(player), depth, -beta, -alpha, true, table, profile, context);
      table.set(key, { depth, flag: TT_EXACT, move: null, score });
      return score;
    }

    let localAlpha = alpha;
    let bestMove = moves[0];
    let bestScore = Number.NEGATIVE_INFINITY;
    let isFirstMove = true;

    for (const move of moves) {
      if (context.cancelled || context.timedOut) {
        return this.evaluate(player, profile);
      }

      const simulated = this.clone();
      simulated.performMove(move, player);
      let score;
      if (isFirstMove) {
        score = -await simulated.negamaxAsync(opponentOf(player), depth - 1, -beta, -localAlpha, false, table, profile, context);
        isFirstMove = false;
      } else {
        score = -await simulated.negamaxAsync(opponentOf(player), depth - 1, -localAlpha - 1, -localAlpha, false, table, profile, context);
        if (score > localAlpha && score < beta && context.cancelled === false && context.timedOut === false) {
          score = -await simulated.negamaxAsync(opponentOf(player), depth - 1, -beta, -score, false, table, profile, context);
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
      localAlpha = Math.max(localAlpha, score);
      if (localAlpha >= beta) {
        break;
      }
    }

    let flag = TT_EXACT;
    if (bestScore <= alphaOriginal) {
      flag = TT_UPPER;
    } else if (bestScore >= beta) {
      flag = TT_LOWER;
    }
    table.set(key, { depth, flag, move: bestMove, score: bestScore });
    return bestScore;
  }

  terminalScore(player) {
    const difference = this.count(player) - this.count(opponentOf(player));
    if (difference === 0) {
      return 0;
    }
    return (difference * 10000) + (difference > 0 ? this.emptyCount : -this.emptyCount);
  }

  evaluate(player, profile) {
    const opponent = opponentOf(player);
    const myMobility = this.validMoves(player).length;
    const opponentMobility = this.validMoves(opponent).length;
    const mobilityScore = (myMobility - opponentMobility) * 110;

    const myCorners = this.cornerCount(player);
    const opponentCorners = this.cornerCount(opponent);
    const cornerScore = (myCorners - opponentCorners) * 2600;

    const myPositional = this.weightedBoardScore(player);
    const opponentPositional = this.weightedBoardScore(opponent);
    const positionalScore = (myPositional - opponentPositional) * 12;

    const myFrontier = this.frontierCount(player);
    const opponentFrontier = this.frontierCount(opponent);
    const frontierScore = (opponentFrontier - myFrontier) * 70;

    const myEdges = this.edgeCount(player);
    const opponentEdges = this.edgeCount(opponent);
    const edgeScore = (myEdges - opponentEdges) * 45;

    const myPotentialMobility = this.potentialMobility(player);
    const opponentPotentialMobility = this.potentialMobility(opponent);
    const potentialMobilityScore = (myPotentialMobility - opponentPotentialMobility) * 35;

    const myCornerPressure = this.cornerPressure(player);
    const opponentCornerPressure = this.cornerPressure(opponent);
    const cornerPressureScore = (myCornerPressure - opponentCornerPressure) * 120;

    const discDifference = this.count(player) - this.count(opponent);
    const parityScore = this.parityScore(player) * (this.emptyCount <= 18 ? 180 : 35);
    const discWeight = profile.id === "strong"
      ? (this.emptyCount <= 12 ? 140 : this.emptyCount <= 22 ? 35 : 8)
      : (this.emptyCount <= 12 ? 200 : this.emptyCount <= 24 ? 24 : 2);

    let score = cornerScore
      + mobilityScore
      + positionalScore
      + frontierScore
      + edgeScore
      + potentialMobilityScore
      + cornerPressureScore
      + parityScore
      + (discDifference * discWeight);

    if (profile.id === "strongest") {
      const myStableEdges = this.stableEdgeDiscs(player);
      const opponentStableEdges = this.stableEdgeDiscs(opponent);
      const stableEdgeScore = (myStableEdges - opponentStableEdges) * 180;

      const myFullEdges = this.fullEdgeCount(player);
      const opponentFullEdges = this.fullEdgeCount(opponent);
      const fullEdgeScore = (myFullEdges - opponentFullEdges) * 260;

      const myCornerAccess = this.validCornerMoves(player);
      const opponentCornerAccess = this.validCornerMoves(opponent);
      const cornerAccessScore = (myCornerAccess - opponentCornerAccess) * 420;

      score += stableEdgeScore + fullEdgeScore + cornerAccessScore;
    }

    return score;
  }

  cornerCount(player) {
    return CORNERS.reduce((total, corner) => total + (this.discAt(corner) === player ? 1 : 0), 0);
  }

  parityScore(player) {
    if (this.emptyCount > 28) {
      return 0;
    }

    const opponent = opponentOf(player);
    const myMoves = this.validMoves(player).length;
    const opponentMoves = this.validMoves(opponent).length;
    const moveParity = (this.emptyCount % 2 === 0 ? -1 : 1) * (myMoves - opponentMoves);
    return moveParity;
  }

  weightedBoardScore(player) {
    let total = 0;
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let column = 0; column < BOARD_SIZE; column += 1) {
        if (this.board[row][column] === player) {
          total += POSITIONAL_WEIGHTS[row][column];
        }
      }
    }
    return total;
  }

  edgeCount(player) {
    let total = 0;
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let column = 0; column < BOARD_SIZE; column += 1) {
        if ((row === 0 || row === 7 || column === 0 || column === 7) && this.board[row][column] === player) {
          total += 1;
        }
      }
    }
    return total;
  }

  validCornerMoves(player) {
    return this.validMoves(player).filter((move) => CORNERS.some((corner) => samePosition(corner, move))).length;
  }

  stableEdgeDiscs(player) {
    const stable = new Set();
    const scanEdge = (start, deltaRow, deltaColumn) => {
      let row = start.row;
      let column = start.column;
      while (isOnBoard({ row, column }) && this.board[row][column] === player) {
        stable.add(`${row}:${column}`);
        row += deltaRow;
        column += deltaColumn;
      }
    };

    if (this.board[0][0] === player) {
      scanEdge({ row: 0, column: 0 }, 0, 1);
      scanEdge({ row: 0, column: 0 }, 1, 0);
    }
    if (this.board[0][7] === player) {
      scanEdge({ row: 0, column: 7 }, 0, -1);
      scanEdge({ row: 0, column: 7 }, 1, 0);
    }
    if (this.board[7][0] === player) {
      scanEdge({ row: 7, column: 0 }, 0, 1);
      scanEdge({ row: 7, column: 0 }, -1, 0);
    }
    if (this.board[7][7] === player) {
      scanEdge({ row: 7, column: 7 }, 0, -1);
      scanEdge({ row: 7, column: 7 }, -1, 0);
    }

    return stable.size;
  }

  fullEdgeCount(player) {
    const edges = [
      Array.from({ length: BOARD_SIZE }, (_, index) => ({ row: 0, column: index })),
      Array.from({ length: BOARD_SIZE }, (_, index) => ({ row: 7, column: index })),
      Array.from({ length: BOARD_SIZE }, (_, index) => ({ row: index, column: 0 })),
      Array.from({ length: BOARD_SIZE }, (_, index) => ({ row: index, column: 7 })),
    ];

    return edges.reduce((total, edge) => total + (edge.every((position) => this.discAt(position) === player) ? 1 : 0), 0);
  }

  frontierCount(player) {
    let total = 0;
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let column = 0; column < BOARD_SIZE; column += 1) {
        if (this.board[row][column] !== player) {
          continue;
        }
        const touchesEmpty = DIRECTIONS.some(([deltaRow, deltaColumn]) => {
          const adjacent = { row: row + deltaRow, column: column + deltaColumn };
          return isOnBoard(adjacent) && this.discAt(adjacent) === null;
        });
        if (touchesEmpty) {
          total += 1;
        }
      }
    }
    return total;
  }

  potentialMobility(player) {
    const opponent = opponentOf(player);
    let total = 0;
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let column = 0; column < BOARD_SIZE; column += 1) {
        if (this.board[row][column] !== null) {
          continue;
        }
        const touchesOpponent = DIRECTIONS.some(([deltaRow, deltaColumn]) => {
          const adjacent = { row: row + deltaRow, column: column + deltaColumn };
          return isOnBoard(adjacent) && this.discAt(adjacent) === opponent;
        });
        if (touchesOpponent) {
          total += 1;
        }
      }
    }
    return total;
  }

  cornerPressure(player) {
    let score = 0;
    for (let index = 0; index < CORNERS.length; index += 1) {
      const corner = CORNERS[index];
      if (this.discAt(corner) !== null) {
        continue;
      }
      for (const neighbor of CORNER_NEIGHBORS[index]) {
        const disc = this.discAt(neighbor);
        if (disc === player) {
          score -= 1;
        } else if (disc === opponentOf(player)) {
          score += 1;
        }
      }
    }
    return score;
  }

}

function createInitialBoard() {
  const board = Array.from({ length: BOARD_SIZE }, () => Array.from({ length: BOARD_SIZE }, () => null));
  board[3][3] = "white";
  board[3][4] = "black";
  board[4][3] = "black";
  board[4][4] = "white";
  return board;
}

function cloneBoard(board) {
  return board.map((row) => [...row]);
}

function isOnBoard(position) {
  return position.row >= 0 && position.row < BOARD_SIZE && position.column >= 0 && position.column < BOARD_SIZE;
}

function positionBit(position) {
  return 1n << BigInt((position.row * BOARD_SIZE) + position.column);
}

function shiftBits(bits, direction) {
  const masked = bits & direction.mask;
  if (direction.shift > 0n) {
    return (masked << direction.shift) & FULL_BOARD_MASK;
  }
  return masked >> -direction.shift;
}

function bitboardToMoves(bits) {
  const moves = [];
  for (let index = 0; index < 64; index += 1) {
    if ((bits & (1n << BigInt(index))) !== 0n) {
      moves.push({
        row: Math.floor(index / BOARD_SIZE),
        column: index % BOARD_SIZE,
      });
    }
  }
  return moves;
}

function opponentOf(player) {
  return player === "black" ? "white" : "black";
}

function samePosition(lhs, rhs) {
  return lhs.row === rhs.row && lhs.column === rhs.column;
}

function positionKey(position) {
  return `${position.row}-${position.column}`;
}

function serializeBoard(board) {
  return board.flat().map((cell) => (cell === null ? "." : cell === "black" ? "b" : "w")).join("");
}

function wait(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function formatDuration(milliseconds) {
  if (Number.isFinite(milliseconds) === false) {
    return "推定中";
  }
  if (milliseconds <= 0) {
    return "約0秒";
  }

  const seconds = Math.ceil(milliseconds / 1000);
  if (seconds < 60) {
    return `約${seconds}秒`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (remainingSeconds === 0) {
    return `約${minutes}分`;
  }
  return `約${minutes}分${remainingSeconds}秒`;
}

function updateAIProgress(profile, progress) {
  const elapsedMs = progress.elapsedMs ?? 0;
  const timeLimitMs = progress.timeLimitMs ?? AI_TIME_LIMITS_MS[profile.id] ?? null;
  const remainingBudgetMs = Math.max(0, timeLimitMs - elapsedMs);

  if (progress.timedOut === true) {
    updateStatus(`CPU（${profile.label}）思考を切り上げ中`);
    return;
  }

  if (progress.completed === 0) {
    updateStatus(timeLimitMs === null
      ? `CPU（${profile.label}）思考中`
      : `CPU（${profile.label}）思考中・残り最大 ${formatDuration(remainingBudgetMs)}`);
    return;
  }

  if (progress.completed >= progress.total) {
    updateStatus(`CPU（${profile.label}）思考完了`);
    return;
  }

  updateStatus(timeLimitMs === null
    ? `CPU（${profile.label}）思考中 ${progress.completed}/${progress.total}`
    : `CPU（${profile.label}）思考中 ${progress.completed}/${progress.total}・残り最大 ${formatDuration(remainingBudgetMs)}`);
}

function createBoard() {
  ELEMENTS.board.innerHTML = "";
  boardCells.clear();

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let column = 0; column < BOARD_SIZE; column += 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cell";
      button.dataset.row = String(row);
      button.dataset.column = String(column);
      button.innerHTML = '<span class="hint" aria-hidden="true"></span>';
      button.addEventListener("click", () => handleCellClick({ row, column }));
      ELEMENTS.board.appendChild(button);
      boardCells.set(positionKey({ row, column }), button);
    }
  }
}

function syncRoles() {
  ELEMENTS.blackRole.textContent = state.mode === "solo" ? "あなた" : "先手";
  ELEMENTS.whiteRole.textContent = state.mode === "solo" ? `CPU・${currentAIProfile().label}` : "後手";
  ELEMENTS.difficultyPanel.classList.toggle("is-hidden", state.mode !== "solo");
}

function updateCounts() {
  ELEMENTS.blackCount.textContent = String(state.game.count("black"));
  ELEMENTS.whiteCount.textContent = String(state.game.count("white"));
}

function updateStatus(text) {
  ELEMENTS.statusText.textContent = text;
}

function renderBoard() {
  const validMoveKeys = new Set(state.game.validMoves(state.currentPlayer).map((position) => positionKey(position)));

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let column = 0; column < BOARD_SIZE; column += 1) {
      const position = { row, column };
      const button = boardCells.get(positionKey(position));
      if (button === undefined) {
        continue;
      }

      const displayedDisc = state.displayedBoard[row][column];
      button.classList.toggle("is-valid", displayedDisc === null && validMoveKeys.has(positionKey(position)) && canHumanInteract());
      button.classList.toggle("is-last", state.lastMove !== null && samePosition(state.lastMove, position));
      button.disabled = canHumanInteract() === false || state.displayedBoard[row][column] !== null;

      const previousDisc = button.querySelector(".disc");
      if (previousDisc) {
        previousDisc.remove();
      }

      if (displayedDisc !== null) {
        const disc = document.createElement("span");
        disc.className = `disc ${displayedDisc}`;
        button.appendChild(disc);
      }
    }
  }
}

function animateDisc(position, disc, animationClass) {
  const button = boardCells.get(positionKey(position));
  if (button === undefined) {
    return;
  }

  state.displayedBoard[position.row][position.column] = disc;
  renderBoard();

  const discElement = button.querySelector(".disc");
  if (discElement) {
    discElement.classList.remove("flip", "place");
    void discElement.offsetWidth;
    discElement.classList.add(animationClass);
  }
}

function orderFlipSequence(move, captured) {
  return [...captured].sort((lhs, rhs) => {
    const lhsDistance = Math.max(Math.abs(lhs.row - move.row), Math.abs(lhs.column - move.column));
    const rhsDistance = Math.max(Math.abs(rhs.row - move.row), Math.abs(rhs.column - move.column));
    if (lhsDistance !== rhsDistance) {
      return lhsDistance - rhsDistance;
    }
    if (lhs.row !== rhs.row) {
      return lhs.row - rhs.row;
    }
    return lhs.column - rhs.column;
  });
}

function canHumanInteract() {
  if (state.isAnimating) {
    return false;
  }
  if (state.aiThinking) {
    return false;
  }
  if (state.game.isGameOver) {
    return false;
  }
  if (state.mode === "solo" && state.currentPlayer === "white") {
    return false;
  }
  return true;
}

function scheduleAIMove() {
  if (state.mode !== "solo" || state.currentPlayer !== "white" || state.game.isGameOver) {
    return;
  }

  const searchId = state.aiSearchId + 1;
  const profile = currentAIProfile();
  state.aiSearchId = searchId;
  state.aiThinking = true;
  updateStatus(AI_TIME_LIMITS_MS[profile.id] === undefined
    ? `CPU（${profile.label}）思考中`
    : `CPU（${profile.label}）思考中・残り最大 ${formatDuration(AI_TIME_LIMITS_MS[profile.id])}`);
  renderBoard();

  window.setTimeout(async () => {
    const details = await state.game.bestMoveDetailsAsync("white", profile, {
      shouldCancel: () => searchId !== state.aiSearchId,
      onProgress: (progress) => {
        if (searchId === state.aiSearchId) {
          updateAIProgress(profile, progress);
        }
      },
    });

    if (searchId !== state.aiSearchId) {
      return;
    }

    if (details === null) {
      state.aiThinking = false;
      advanceTurn();
      return;
    }

    executeMove(details.move, "white");
  }, 120);
}

function executeMove(move, player) {
  const captured = state.game.performMove(move, player);
  if (captured.length === 0) {
    return;
  }

  state.isAnimating = true;
  state.lastMove = { ...move };
  animateDisc(move, player, "place");
  updateCounts();

  const sequence = orderFlipSequence(move, captured);
  const finalDelay = sequence.length === 0 ? 180 : 180 + ((sequence.length - 1) * 90) + 200;

  sequence.forEach((position, index) => {
    window.setTimeout(() => {
      animateDisc(position, player, "flip");
      updateCounts();
    }, 180 + (index * 90));
  });

  window.setTimeout(() => {
    state.currentPlayer = opponentOf(player);
    state.aiThinking = false;
    state.isAnimating = false;
    advanceTurn();
  }, finalDelay);
}

function advanceTurn() {
  if (state.game.isGameOver) {
    const black = state.game.count("black");
    const white = state.game.count("white");
    const winner = state.game.winner();
    updateStatus(winner === null ? `対局終了 引き分け ${black} - ${white}` : `対局終了 ${winner === "black" ? "黒" : "白"}の勝ち ${black} - ${white}`);
    renderBoard();
    return;
  }

  let skipped = null;
  while (state.game.validMoves(state.currentPlayer).length === 0) {
    skipped = state.currentPlayer;
    state.currentPlayer = opponentOf(state.currentPlayer);
    if (state.game.validMoves(state.currentPlayer).length === 0) {
      break;
    }
  }

  if (state.game.isGameOver || (state.game.validMoves("black").length === 0 && state.game.validMoves("white").length === 0)) {
    const black = state.game.count("black");
    const white = state.game.count("white");
    const winner = state.game.winner();
    updateStatus(winner === null ? `対局終了 引き分け ${black} - ${white}` : `対局終了 ${winner === "black" ? "黒" : "白"}の勝ち ${black} - ${white}`);
    renderBoard();
    return;
  }

  if (skipped !== null) {
    updateStatus(`${skipped === "black" ? "黒" : "白"} は置ける場所がないためパスです`);
  } else if (state.mode === "solo") {
    updateStatus(state.currentPlayer === "black" ? "あなたの番です" : "CPU が最善手を検討中");
  } else {
    updateStatus(`${state.currentPlayer === "black" ? "黒" : "白"} の番です`);
  }

  updateCounts();
  renderBoard();

  if (state.mode === "solo" && state.currentPlayer === "white") {
    scheduleAIMove();
  }
}

function handleCellClick(position) {
  if (canHumanInteract() === false) {
    return;
  }

  const validMoves = state.game.validMoves(state.currentPlayer);
  if (validMoves.some((move) => samePosition(move, position)) === false) {
    return;
  }

  executeMove(position, state.currentPlayer);
}

function resetGame() {
  state.aiSearchId += 1;
  state.game = new ReversiGame();
  state.displayedBoard = cloneBoard(state.game.board);
  state.currentPlayer = "black";
  state.lastMove = null;
  state.aiThinking = false;
  state.isAnimating = false;
  syncRoles();
  updateCounts();
  updateStatus(state.mode === "solo" ? "あなたの番です" : "黒の番です");
  renderBoard();
}

function currentAIProfile() {
  return AI_LEVELS[state.aiLevel];
}

function attachEvents() {
  ELEMENTS.resetButton.addEventListener("click", () => resetGame());

  for (const button of ELEMENTS.modeButtons) {
    button.addEventListener("click", () => {
      const nextMode = button.dataset.mode;
      if (nextMode === undefined || nextMode === state.mode) {
        return;
      }

      state.mode = nextMode;
      for (const candidate of ELEMENTS.modeButtons) {
        candidate.classList.toggle("is-active", candidate === button);
      }
      resetGame();
    });
  }

  for (const button of ELEMENTS.difficultyButtons) {
    button.addEventListener("click", () => {
      const nextLevel = button.dataset.difficulty;
      if (nextLevel === undefined || nextLevel === state.aiLevel) {
        return;
      }

      state.aiLevel = nextLevel;
      for (const candidate of ELEMENTS.difficultyButtons) {
        candidate.classList.toggle("is-active", candidate === button);
      }
      resetGame();
    });
  }
}

function bootstrap() {
  createBoard();
  attachEvents();
  resetGame();
}

bootstrap();
