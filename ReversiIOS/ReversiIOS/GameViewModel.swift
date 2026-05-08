import Foundation

@MainActor
final class GameViewModel: ObservableObject {
    enum GameMode: String, CaseIterable, Identifiable {
        case solo
        case versus

        var id: String { rawValue }

        var title: String {
            switch self {
            case .solo: "ひとり"
            case .versus: "ふたり"
            }
        }
    }

    @Published private(set) var game = OthelloGame()
    @Published private(set) var currentPlayer: Disc = .black
    @Published private(set) var statusMessage = "黒の番です"
    @Published private(set) var gameOverMessage: String?
    @Published private(set) var mode: GameMode = .solo
    @Published private(set) var flipSequence: [BoardPosition] = []

    private var cpuTask: Task<Void, Never>?

    var validMoves: Set<BoardPosition> {
        game.validMoves(for: currentPlayer)
    }

    var blackCount: Int {
        game.stoneCount(for: .black)
    }

    var whiteCount: Int {
        game.stoneCount(for: .white)
    }

    var isCurrentTurnCPU: Bool {
        mode == .solo && currentPlayer == .white && gameOverMessage == nil
    }

    func disc(at position: BoardPosition) -> Disc? {
        game.disc(at: position)
    }

    func isValidMove(_ position: BoardPosition) -> Bool {
        validMoves.contains(position)
    }

    func setMode(_ newMode: GameMode) {
        guard newMode != mode else { return }
        mode = newMode
        resetGame()
    }

    func resetGame() {
        cpuTask?.cancel()
        game = OthelloGame()
        currentPlayer = .black
        gameOverMessage = nil
        flipSequence = []
        statusMessage = mode == .solo ? "あなたは黒。先手です" : "黒の番です"
    }

    func handleTap(on position: BoardPosition) {
        guard gameOverMessage == nil, isCurrentTurnCPU == false else { return }
        guard validMoves.contains(position) else { return }
        applyMove(position)
    }

    private func applyMove(_ position: BoardPosition) {
        cpuTask?.cancel()

        let captured = game.performMove(position, for: currentPlayer)
        guard captured.isEmpty == false else { return }
        flipSequence = orderedFlipSequence(for: position, captured: captured)

        currentPlayer = currentPlayer.opponent
        advanceTurn()
    }

    private func advanceTurn() {
        if game.isGameOver {
            finishGame()
            return
        }

        var skippedPlayers: [Disc] = []
        while game.validMoves(for: currentPlayer).isEmpty {
            skippedPlayers.append(currentPlayer)
            currentPlayer = currentPlayer.opponent

            if skippedPlayers.count == 2 {
                finishGame()
                return
            }
        }

        if let skipped = skippedPlayers.last {
            statusMessage = "\(skipped.displayName)は置ける場所がないためパスです"
        } else if mode == .solo {
            statusMessage = currentPlayer == .black ? "あなたの番です" : "CPUが考えています"
        } else {
            statusMessage = "\(currentPlayer.displayName)の番です"
        }

        if isCurrentTurnCPU {
            scheduleCPUMove()
        }
    }

    private func scheduleCPUMove() {
        cpuTask?.cancel()
        let snapshot = game
        let player = currentPlayer

        cpuTask = Task { [weak self, snapshot, player] in
            try? await Task.sleep(for: .milliseconds(550))
            guard Task.isCancelled == false else { return }

            let move = await Task.detached(priority: .userInitiated) {
                snapshot.bestMove(for: player)
            }.value

            guard Task.isCancelled == false else { return }

            await MainActor.run {
                guard let self, self.currentPlayer == player, self.gameOverMessage == nil else { return }
                guard let move else {
                    self.advanceTurn()
                    return
                }

                let captured = self.game.performMove(move, for: self.currentPlayer)
                self.flipSequence = self.orderedFlipSequence(for: move, captured: captured)
                self.currentPlayer = self.currentPlayer.opponent
                self.advanceTurn()
            }
        }
    }

    private func finishGame() {
        cpuTask?.cancel()

        let black = blackCount
        let white = whiteCount

        if let winner = game.winner {
            gameOverMessage = "\(winner.displayName)の勝ち"
        } else {
            gameOverMessage = "引き分け"
        }

        statusMessage = "対局終了  黒 \(black) : 白 \(white)"
    }

    private func orderedFlipSequence(for move: BoardPosition, captured: [BoardPosition]) -> [BoardPosition] {
        captured.sorted { lhs, rhs in
            let lhsDistance = max(abs(lhs.row - move.row), abs(lhs.column - move.column))
            let rhsDistance = max(abs(rhs.row - move.row), abs(rhs.column - move.column))

            if lhsDistance != rhsDistance {
                return lhsDistance < rhsDistance
            }

            if lhs.row != rhs.row {
                return lhs.row < rhs.row
            }

            return lhs.column < rhs.column
        }
    }
}
