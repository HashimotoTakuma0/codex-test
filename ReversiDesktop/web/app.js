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
    const moves = [];
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let column = 0; column < BOARD_SIZE; column += 1) {
        const move = { row, column };
        if (this.captures(move, player).length > 0) {
          moves.push(move);
        }
      }
    }
    return moves;
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
    return captured;
  }

  count(disc) {
    let total = 0;
    for (const row of this.board) {
      for (const cell of row) {
        if (cell === disc) {
          total += 1;
        }
      }
    }
    return total;
  }

  get emptyCount() {
    let total = 0;
    for (const row of this.board) {
      for (const cell of row) {
        if (cell === null) {
          total += 1;
        }
      }
    }
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

    const depth = this.searchDepth(profile);
    const table = new Map();
    const beta = Number.POSITIVE_INFINITY;
    const startedAt = performance.now();
    const searchContext = {
      cancelled: false,
      lastYieldAt: startedAt,
      nodes: 0,
      onPulse: () => {
        options.onProgress?.({
          completed: 0,
          total: moves.length,
          elapsedMs: performance.now() - startedAt,
        });
      },
      shouldCancel: options.shouldCancel,
    };
    let alpha = Number.NEGATIVE_INFINITY;
    let bestMove = moves[0];
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < moves.length; index += 1) {
      if (options.shouldCancel?.() === true || searchContext.cancelled) {
        return null;
      }

      const move = moves[index];
      const simulated = this.clone();
      simulated.performMove(move, player);
      const childScore = await simulated.negamaxAsync(opponentOf(player), depth - 1, -beta, -alpha, false, table, profile, searchContext);
      if (searchContext.cancelled) {
        return null;
      }
      const score = -childScore;

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
      alpha = Math.max(alpha, score);

      const completed = index + 1;
      options.onProgress?.({
        completed,
        total: moves.length,
        elapsedMs: performance.now() - startedAt,
      });

      if (completed < moves.length) {
        await wait(AI_PROGRESS_YIELD_MS);
      }
    }

    return {
      move: bestMove,
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
      return 13;
    }
    if (this.emptyCount <= 24) {
      return 12;
    }
    if (this.emptyCount <= 32) {
      return 10;
    }
    if (this.emptyCount <= 44) {
      return 9;
    }
    if (this.emptyCount <= 52) {
      return 7;
    }
    return 6;
  }

  orderedMoves(player, profile) {
    return this.validMoves(player).sort((lhs, rhs) => this.moveOrderingScore(rhs, player, profile) - this.moveOrderingScore(lhs, player, profile));
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
      ? `${serializeBoard(this.board)}|${player}|${depth}|${previousTurnWasPass ? 1 : 0}|${profile.id}`
      : `${serializeBoard(this.board)}|${player}|${previousTurnWasPass ? 1 : 0}|${profile.id}`;
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
      }
    }

    const key = profile.id === "strong"
      ? `${serializeBoard(this.board)}|${player}|${depth}|${previousTurnWasPass ? 1 : 0}|${profile.id}`
      : `${serializeBoard(this.board)}|${player}|${previousTurnWasPass ? 1 : 0}|${profile.id}`;
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
      const score = -await this.negamaxAsync(opponentOf(player), depth, -beta, -alpha, true, table, profile, context);
      table.set(key, { depth, score });
      return score;
    }

    let localAlpha = alpha;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const move of moves) {
      if (context.cancelled) {
        return 0;
      }

      const simulated = this.clone();
      simulated.performMove(move, player);
      const score = -await simulated.negamaxAsync(opponentOf(player), depth - 1, -beta, -localAlpha, false, table, profile, context);
      bestScore = Math.max(bestScore, score);
      localAlpha = Math.max(localAlpha, score);
      if (localAlpha >= beta) {
        break;
      }
    }

    table.set(key, { depth, score: bestScore });
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
  if (milliseconds <= 0 || Number.isFinite(milliseconds) === false) {
    return "推定中";
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
  if (progress.completed === 0) {
    updateStatus(`CPU（${profile.label}）思考中 0/${progress.total}・予測残り思考時間 推定中`);
    return;
  }

  const remainingMoves = progress.total - progress.completed;
  const averageMs = progress.elapsedMs / progress.completed;
  const remainingMs = remainingMoves * averageMs;
  updateStatus(`CPU（${profile.label}）思考中 ${progress.completed}/${progress.total}・予測残り思考時間 ${formatDuration(remainingMs)}`);
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
  updateStatus(`CPU（${profile.label}）思考中・予測残り思考時間 推定中`);
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
