import SwiftUI

struct ContentView: View {
    @StateObject private var viewModel = GameViewModel()
    private let boardPositions = (0..<OthelloGame.boardSize).flatMap { row in
        (0..<OthelloGame.boardSize).map { column in
            BoardPosition(row: row, column: column)
        }
    }
    
    private var flipSteps: [BoardPosition: Int] {
        Dictionary(
            uniqueKeysWithValues: viewModel.flipSequence.enumerated().map { index, position in
                (position, index)
            }
        )
    }

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 0.05, green: 0.16, blue: 0.11),
                    Color(red: 0.10, green: 0.31, blue: 0.19),
                    Color(red: 0.77, green: 0.72, blue: 0.50),
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            ScrollView {
                VStack(spacing: 20) {
                    header
                    modePicker
                    scoreBoard
                    board
                    footer
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 24)
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("REVERSI")
                .font(.system(size: 34, weight: .black, design: .rounded))
                .foregroundStyle(.white)
            Text("iPhoneでもiPadでも遊べるシンプルなオセロ")
                .font(.system(size: 16, weight: .medium, design: .rounded))
                .foregroundStyle(Color.white.opacity(0.88))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var modePicker: some View {
        Picker("モード", selection: Binding(
            get: { viewModel.mode },
            set: { viewModel.setMode($0) }
        )) {
            ForEach(GameViewModel.GameMode.allCases) { mode in
                Text(mode.title).tag(mode)
            }
        }
        .pickerStyle(.segmented)
        .padding(8)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Color.white.opacity(0.16))
        )
    }

    private var scoreBoard: some View {
        HStack(spacing: 12) {
            scoreCard(
                title: "黒",
                subtitle: viewModel.mode == .solo ? "あなた" : "先手",
                count: viewModel.blackCount,
                fill: Color.black.opacity(0.92),
                ring: Color.white.opacity(0.5)
            )
            scoreCard(
                title: "白",
                subtitle: viewModel.mode == .solo ? "CPU" : "後手",
                count: viewModel.whiteCount,
                fill: Color.white,
                ring: Color.black.opacity(0.15)
            )
        }
    }

    private func scoreCard(
        title: String,
        subtitle: String,
        count: Int,
        fill: Color,
        ring: Color
    ) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Circle()
                    .fill(fill)
                    .overlay(Circle().stroke(ring, lineWidth: 2))
                    .frame(width: 24, height: 24)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(size: 15, weight: .bold, design: .rounded))
                    Text(subtitle)
                        .font(.system(size: 12, weight: .medium, design: .rounded))
                        .foregroundStyle(Color.primary.opacity(0.65))
                }
            }

            Text("\(count)")
                .font(.system(size: 28, weight: .heavy, design: .rounded))
        }
        .foregroundStyle(Color.black.opacity(0.85))
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(Color(red: 0.97, green: 0.94, blue: 0.84))
                .shadow(color: Color.black.opacity(0.12), radius: 20, x: 0, y: 12)
        )
    }

    private var board: some View {
        GeometryReader { proxy in
            let spacing: CGFloat = 6
            let cellWidth = (proxy.size.width - (CGFloat(OthelloGame.boardSize - 1) * spacing)) / CGFloat(OthelloGame.boardSize)
            let columns = Array(
                repeating: GridItem(.fixed(cellWidth), spacing: spacing),
                count: OthelloGame.boardSize
            )

            LazyVGrid(columns: columns, spacing: spacing) {
                ForEach(boardPositions, id: \.self) { position in
                    BoardCellView(
                        disc: viewModel.disc(at: position),
                        isValidMove: viewModel.isValidMove(position),
                        isLastMove: viewModel.game.lastMove == position,
                        flipStep: flipSteps[position]
                    ) {
                        viewModel.handleTap(on: position)
                    }
                    .frame(width: cellWidth, height: cellWidth)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        }
        .aspectRatio(1, contentMode: .fit)
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .fill(Color(red: 0.93, green: 0.86, blue: 0.66).opacity(0.18))
        )
    }

    private var footer: some View {
        VStack(spacing: 14) {
            VStack(spacing: 8) {
                Text(viewModel.statusMessage)
                    .font(.system(size: 17, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)

                if let result = viewModel.gameOverMessage {
                    Text(result)
                        .font(.system(size: 24, weight: .heavy, design: .rounded))
                        .foregroundStyle(Color(red: 0.99, green: 0.88, blue: 0.43))
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 18)
            .padding(.horizontal, 16)
            .background(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(Color.white.opacity(0.14))
            )

            Button {
                viewModel.resetGame()
            } label: {
                Text("新しい対局")
                    .font(.system(size: 17, weight: .bold, design: .rounded))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .foregroundStyle(Color.black.opacity(0.86))
                    .background(
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .fill(Color(red: 0.97, green: 0.94, blue: 0.84))
                    )
            }
            .buttonStyle(.plain)
        }
    }
}

private struct BoardCellView: View {
    let disc: Disc?
    let isValidMove: Bool
    let isLastMove: Bool
    let flipStep: Int?
    let action: () -> Void

    @State private var displayedDisc: Disc?
    @State private var discRotation: Double = 0
    @State private var discScale: CGFloat = 1

    var body: some View {
        Button(action: action) {
            ZStack {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [
                                Color(red: 0.20, green: 0.56, blue: 0.34),
                                Color(red: 0.10, green: 0.39, blue: 0.22),
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )

                if isValidMove && disc == nil {
                    Circle()
                        .fill(Color.white.opacity(0.25))
                        .frame(width: 10, height: 10)
                }

                if let displayedDisc {
                    Circle()
                        .fill(displayedDisc == .black ? Color.black.opacity(0.92) : Color.white)
                        .overlay(
                            Circle()
                                .stroke(
                                    displayedDisc == .black ? Color.white.opacity(0.15) : Color.black.opacity(0.15),
                                    lineWidth: 1.5
                                )
                        )
                        .shadow(
                            color: Color.black.opacity(displayedDisc == .black ? 0.35 : 0.14),
                            radius: 6,
                            x: 0,
                            y: 3
                        )
                        .rotation3DEffect(
                            .degrees(discRotation),
                            axis: (x: 0, y: 1, z: 0),
                            perspective: 0.7
                        )
                        .scaleEffect(discScale)
                        .padding(5)
                }

                if isLastMove {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(Color(red: 0.98, green: 0.84, blue: 0.33), lineWidth: 3)
                }
            }
        }
        .buttonStyle(.plain)
        .onAppear {
            displayedDisc = disc
        }
        .onChange(of: disc) { oldValue, newValue in
            if oldValue == nil, let newValue {
                displayedDisc = newValue
                discScale = 0.7
                withAnimation(.spring(response: 0.28, dampingFraction: 0.72)) {
                    discScale = 1
                }
            } else if let oldValue, let newValue, oldValue != newValue {
                animateFlip(to: newValue, delay: Double(flipStep ?? 0) * 0.09)
            } else if newValue == nil {
                displayedDisc = nil
                discRotation = 0
                discScale = 1
            }
        }
    }

    private func animateFlip(to newDisc: Disc, delay: Double) {
        let nextQuarterTurn = discRotation + 90

        DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
            withAnimation(.easeIn(duration: 0.12)) {
                discRotation = nextQuarterTurn
            }

            DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) {
                displayedDisc = newDisc

                withAnimation(.easeOut(duration: 0.12)) {
                    discRotation = nextQuarterTurn + 90
                }

                DispatchQueue.main.asyncAfter(deadline: .now() + 0.14) {
                    discRotation.formTruncatingRemainder(dividingBy: 360)
                }
            }
        }
    }
}

struct ContentView_Previews: PreviewProvider {
    static var previews: some View {
        ContentView()
    }
}
