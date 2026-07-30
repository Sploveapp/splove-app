import Combine
import Foundation

/// État shell natif (barre d’onglets) synchronisé avec la session / route Web.
final class NativeShellState: ObservableObject {
    static let shared = NativeShellState()

    @Published private(set) var showBottomNavigationBar = false
    /// Onglet visuellement actif — toujours dérivé de la route Web quand elle est connue.
    @Published private(set) var selectedTab: SploveTab = .move

    private init() {}

    func setBottomNavigationBarVisible(_ visible: Bool) {
        guard showBottomNavigationBar != visible else { return }
        showBottomNavigationBar = visible
        SPLoveBridgeViewController.shared?.syncBottomNavWebMetrics()
    }

    func setSelectedTab(_ tab: SploveTab) {
        guard selectedTab != tab else { return }
        selectedTab = tab
        SPLoveBridgeViewController.shared?.syncBottomNavWebMetrics()
    }

    /// Recalcule l’onglet actif depuis le pathname React (`/move`, `/profile`, …).
    func setSelectedTabFromPath(_ path: String) {
        guard let tab = SploveTab.from(pathname: path) else { return }
        setSelectedTab(tab)
    }
}
