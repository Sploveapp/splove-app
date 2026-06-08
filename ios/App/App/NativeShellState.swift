import Combine
import Foundation

/// État shell natif (barre d’onglets) synchronisé avec la session Web.
final class NativeShellState: ObservableObject {
    static let shared = NativeShellState()

    @Published private(set) var showBottomNavigationBar = false

    private init() {}

    func setBottomNavigationBarVisible(_ visible: Bool) {
        guard showBottomNavigationBar != visible else { return }
        showBottomNavigationBar = visible
        SPLoveBridgeViewController.shared?.syncBottomNavWebMetrics()
    }
}
