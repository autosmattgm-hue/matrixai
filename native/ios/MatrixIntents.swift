import AppIntents
import Foundation

enum MatrixLaunchRoute: String {
    case home
    case listen
    case settings
}

final class MatrixLaunchState {
    static let shared = MatrixLaunchState()

    private init() {}

    var route: MatrixLaunchRoute = .home

    var launchURL: URL {
        switch route {
        case .home:
            return URL(string: "https://your-domain.vercel.app/?matrix_source=native")!
        case .listen:
            return URL(string: "https://your-domain.vercel.app/?matrix_source=native&matrix_intent=listen&matrix_listen=1")!
        case .settings:
            return URL(string: "https://your-domain.vercel.app/?matrix_source=native&matrix_route=settings")!
        }
    }
}

struct OpenMatrixIntent: AppIntent {
    static var title: LocalizedStringResource = "Open Matrix"
    static var openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult {
        MatrixLaunchState.shared.route = .home
        return .result()
    }
}

struct StartMatrixListeningIntent: AppIntent {
    static var title: LocalizedStringResource = "Start Matrix Listening"
    static var openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult & ProvidesDialog {
        MatrixLaunchState.shared.route = .listen
        return .result(dialog: "Launching Matrix and opening voice intake.")
    }
}

struct OpenMatrixSettingsIntent: AppIntent {
    static var title: LocalizedStringResource = "Open Matrix Settings"
    static var openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult {
        MatrixLaunchState.shared.route = .settings
        return .result()
    }
}

struct MatrixShortcutsProvider: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        [
            AppShortcut(
                intent: OpenMatrixIntent(),
                phrases: [
                    "Open Matrix in \(.applicationName)",
                    "Launch Matrix in \(.applicationName)"
                ],
                shortTitle: "Open Matrix",
                systemImageName: "waveform.circle"
            ),
            AppShortcut(
                intent: StartMatrixListeningIntent(),
                phrases: [
                    "Start Matrix listening in \(.applicationName)",
                    "Ask Matrix in \(.applicationName)"
                ],
                shortTitle: "Ask Matrix",
                systemImageName: "mic.circle"
            ),
            AppShortcut(
                intent: OpenMatrixSettingsIntent(),
                phrases: [
                    "Open Matrix settings in \(.applicationName)"
                ],
                shortTitle: "Matrix Settings",
                systemImageName: "gearshape.circle"
            )
        ]
    }
}
