import SwiftUI

/// ZStack : WebView Capacitor (écrans React inchangés) + barre d’onglets native fixe.
struct MainTabView: View {
    @ObservedObject private var shellState = NativeShellState.shared
    @State private var selectedTab: SploveTab = .move

    private var bottomInset: CGFloat {
        guard shellState.showBottomNavigationBar else { return 0 }
        return BottomNavigationBar.layoutHeight(safeAreaBottom: bottomSafeArea())
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            Color(red: 0.043, green: 0.043, blue: 0.059)
                .ignoresSafeArea()

            CapacitorHostView()
                .ignoresSafeArea()
                .safeAreaInset(edge: .bottom, spacing: 0) {
                    Color.clear.frame(height: bottomInset)
                }

            if shellState.showBottomNavigationBar {
                BottomNavigationBar(selectedTab: $selectedTab)
            }
        }
    }

    private func bottomSafeArea() -> CGFloat {
        guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let inset = scene.windows.first?.safeAreaInsets.bottom
        else { return 0 }
        return max(inset, 0)
    }
}

#if DEBUG
struct MainTabView_Previews: PreviewProvider {
    static var previews: some View {
        MainTabView()
    }
}
#endif
