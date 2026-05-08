import Foundation

enum Disc: String, CaseIterable, Sendable {
    case black
    case white

    var opponent: Disc {
        self == .black ? .white : .black
    }

    var displayName: String {
        self == .black ? "黒" : "白"
    }
}

struct BoardPosition: Hashable, Sendable {
    let row: Int
    let column: Int
}

struct OthelloGame: Sendable {
    private enum Direction: CaseIterable {
        case north
        case northEast
        case east
        case southEast
        case south
        case southWest
        case west
        case northWest

        var delta: (row: Int, column: Int) {
            switch self {
            case .north: (-1, 0)
            case .northEast: (-1, 1)
            case .east: (0, 1)
            case .southEast: (1, 1)
            case .south: (1, 0)
            case .southWest: (1, -1)
            case .west: (0, -1)
            case .northWest: (-1, -1)
            }
        }
    }

    static let boardSize = 8
    private static let corners = [
        BoardPosition(row: 0, column: 0),
        BoardPosition(row: 0, column: boardSize - 1),
        BoardPosition(row: boardSize - 1, column: 0),
        BoardPosition(row: boardSize - 1, column: boardSize - 1),
    ]
    private static let positionalWeights = [
        [120, -20, 20, 5, 5, 20, -20, 120],
        [-20, -40, -5, -5, -5, -5, -40, -20],
        [20, -5, 15, 3, 3, 15, -5, 20],
        [5, -5, 3, 3, 3, 3, -5, 5],
        [5, -5, 3, 3, 3, 3, -5, 5],
        [20, -5, 15, 3, 3, 15, -5, 20],
        [-20, -40, -5, -5, -5, -5, -40, -20],
        [120, -20, 20, 5, 5, 20, -20, 120],
    ]

    private(set) var board: [[Disc?]]
    private(set) var lastMove: BoardPosition?

    init() {
        board = Array(
            repeating: Array(repeating: nil, count: Self.boardSize),
            count: Self.boardSize
        )
        board[3][3] = .white
        board[3][4] = .black
        board[4][3] = .black
        board[4][4] = .white
        lastMove = nil
    }

    func disc(at position: BoardPosition) -> Disc? {
        guard Self.isOnBoard(position) else { return nil }
        return board[position.row][position.column]
    }

    func validMoves(for player: Disc) -> Set<BoardPosition> {
        var moves: Set<BoardPosition> = []

        for row in 0..<Self.boardSize {
            for column in 0..<Self.boardSize {
                let position = BoardPosition(row: row, column: column)
                if captures(for: position, player: player).isEmpty == false {
                    moves.insert(position)
                }
            }
        }

        return moves
    }

    func captures(for move: BoardPosition, player: Disc) -> [BoardPosition] {
        guard Self.isOnBoard(move), board[move.row][move.column] == nil else {
            return []
        }

        var captured: [BoardPosition] = []

        for direction in Direction.allCases {
            let delta = direction.delta
            var current = BoardPosition(
                row: move.row + delta.row,
                column: move.column + delta.column
            )
            var line: [BoardPosition] = []

            while Self.isOnBoard(current), disc(at: current) == player.opponent {
                line.append(current)
                current = BoardPosition(
                    row: current.row + delta.row,
                    column: current.column + delta.column
                )
            }

            if line.isEmpty == false, Self.isOnBoard(current), disc(at: current) == player {
                captured.append(contentsOf: line)
            }
        }

        return captured
    }

    mutating func performMove(_ move: BoardPosition, for player: Disc) -> [BoardPosition] {
        let captured = captures(for: move, player: player)
        guard captured.isEmpty == false else { return [] }

        board[move.row][move.column] = player
        for position in captured {
            board[position.row][position.column] = player
        }
        lastMove = move
        return captured
    }

    mutating func place(_ move: BoardPosition, for player: Disc) -> Bool {
        performMove(move, for: player).isEmpty == false
    }

    func bestMove(for player: Disc) -> BoardPosition? {
        let moves = orderedMoves(for: player)
        guard moves.isEmpty == false else { return nil }

        let depth = searchDepth
        let beta = Int.max / 4
        var alpha = -beta
        var bestMove = moves[0]
        var bestScore = Int.min

        for move in moves {
            var simulated = self
            _ = simulated.performMove(move, for: player)
            let score = -simulated.negamax(
                for: player.opponent,
                depth: depth - 1,
                alpha: -beta,
                beta: -alpha,
                previousTurnWasPass: false
            )

            if score > bestScore {
                bestScore = score
                bestMove = move
            }

            alpha = max(alpha, score)
        }

        return bestMove
    }

    func stoneCount(for disc: Disc) -> Int {
        board
            .flatMap { $0 }
            .reduce(into: 0) { partialResult, value in
                if value == disc {
                    partialResult += 1
                }
            }
    }

    var isBoardFull: Bool {
        board.flatMap(\.self).allSatisfy { $0 != nil }
    }

    var isGameOver: Bool {
        isBoardFull || (validMoves(for: .black).isEmpty && validMoves(for: .white).isEmpty)
    }

    var winner: Disc? {
        let black = stoneCount(for: .black)
        let white = stoneCount(for: .white)

        if black == white {
            return nil
        }

        return black > white ? .black : .white
    }

    private var searchDepth: Int {
        switch emptyCount {
        case ...10:
            return emptyCount
        case ...16:
            return 8
        case ...28:
            return 6
        default:
            return 5
        }
    }

    private var emptyCount: Int {
        board.flatMap(\.self).reduce(into: 0) { partialResult, value in
            if value == nil {
                partialResult += 1
            }
        }
    }

    private func orderedMoves(for player: Disc) -> [BoardPosition] {
        validMoves(for: player).sorted { lhs, rhs in
            moveOrderingScore(for: lhs, player: player) > moveOrderingScore(for: rhs, player: player)
        }
    }

    private func moveOrderingScore(for move: BoardPosition, player: Disc) -> Int {
        let capturedCount = captures(for: move, player: player).count
        return (Self.positionalWeights[move.row][move.column] * 10) + (capturedCount * 4)
    }

    private func negamax(
        for player: Disc,
        depth: Int,
        alpha: Int,
        beta: Int,
        previousTurnWasPass: Bool
    ) -> Int {
        if isGameOver || previousTurnWasPass && validMoves(for: player).isEmpty {
            return terminalScore(for: player)
        }

        if depth == 0 {
            return evaluate(for: player)
        }

        let moves = orderedMoves(for: player)
        if moves.isEmpty {
            return -negamax(
                for: player.opponent,
                depth: depth,
                alpha: -beta,
                beta: -alpha,
                previousTurnWasPass: true
            )
        }

        var bestScore = Int.min
        var localAlpha = alpha

        for move in moves {
            var simulated = self
            _ = simulated.performMove(move, for: player)
            let score = -simulated.negamax(
                for: player.opponent,
                depth: depth - 1,
                alpha: -beta,
                beta: -localAlpha,
                previousTurnWasPass: false
            )

            bestScore = max(bestScore, score)
            localAlpha = max(localAlpha, score)

            if localAlpha >= beta {
                break
            }
        }

        return bestScore
    }

    private func terminalScore(for player: Disc) -> Int {
        let scoreDifference = stoneCount(for: player) - stoneCount(for: player.opponent)
        if scoreDifference == 0 {
            return 0
        }

        return (scoreDifference * 10_000) + (scoreDifference > 0 ? emptyCount : -emptyCount)
    }

    private func evaluate(for player: Disc) -> Int {
        let opponent = player.opponent
        let myMobility = validMoves(for: player).count
        let opponentMobility = validMoves(for: opponent).count
        let mobilityScore = (myMobility - opponentMobility) * 110

        let myCorners = cornerCount(for: player)
        let opponentCorners = cornerCount(for: opponent)
        let cornerScore = (myCorners - opponentCorners) * 2_400

        let positionalScore = weightedBoardScore(for: player) - weightedBoardScore(for: opponent)

        let myFrontier = frontierDiscCount(for: player)
        let opponentFrontier = frontierDiscCount(for: opponent)
        let frontierScore = (opponentFrontier - myFrontier) * 70

        let myEdges = edgeDiscCount(for: player)
        let opponentEdges = edgeDiscCount(for: opponent)
        let edgeScore = (myEdges - opponentEdges) * 45

        let discDifference = stoneCount(for: player) - stoneCount(for: opponent)
        let discWeight: Int
        switch emptyCount {
        case ...12:
            discWeight = 140
        case ...22:
            discWeight = 35
        default:
            discWeight = 8
        }

        return cornerScore
            + mobilityScore
            + (positionalScore * 12)
            + frontierScore
            + edgeScore
            + (discDifference * discWeight)
    }

    private func cornerCount(for disc: Disc) -> Int {
        Self.corners.reduce(into: 0) { partialResult, position in
            if self.disc(at: position) == disc {
                partialResult += 1
            }
        }
    }

    private func weightedBoardScore(for disc: Disc) -> Int {
        var score = 0

        for row in 0..<Self.boardSize {
            for column in 0..<Self.boardSize {
                if board[row][column] == disc {
                    score += Self.positionalWeights[row][column]
                }
            }
        }

        return score
    }

    private func edgeDiscCount(for disc: Disc) -> Int {
        var total = 0

        for row in 0..<Self.boardSize {
            for column in 0..<Self.boardSize where row == 0 || row == Self.boardSize - 1 || column == 0 || column == Self.boardSize - 1 {
                if board[row][column] == disc {
                    total += 1
                }
            }
        }

        return total
    }

    private func frontierDiscCount(for targetDisc: Disc) -> Int {
        var total = 0

        for row in 0..<Self.boardSize {
            for column in 0..<Self.boardSize {
                guard board[row][column] == targetDisc else { continue }

                let position = BoardPosition(row: row, column: column)
                let touchesEmpty = Direction.allCases.contains { direction in
                    let delta = direction.delta
                    let adjacent = BoardPosition(row: position.row + delta.row, column: position.column + delta.column)
                    return Self.isOnBoard(adjacent) && self.disc(at: adjacent) == nil
                }

                if touchesEmpty {
                    total += 1
                }
            }
        }

        return total
    }

    private static func isOnBoard(_ position: BoardPosition) -> Bool {
        (0..<boardSize).contains(position.row) && (0..<boardSize).contains(position.column)
    }
}
