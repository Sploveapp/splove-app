import SwiftUI

/// ZStack : WebView Capacitor (écrans React inchangés) + barre d’onglets native fixe.
struct MainTabView: View {
    @ObservedObject private var shellState = NativeShellState.shared

    private var bottomInset: CGFloat {
        guard shellState.showBottomNavigationBar else { return 0 }
        // Même formule que la barre : pilule + gap (0 sur Move, 4 px ailleurs) + safe area.
        // Slack CSS (--splove-bottom-nav-height ≈ 12px) = léger underlap glass type Android.
        return BottomNavigationBar.layoutHeight(
            safeAreaBottom: bottomSafeArea(),
            selectedTab: shellState.selectedTab
        )
    }

    private var selectedTabBinding: Binding<SploveTab> {
        Binding(
            get: { shellState.selectedTab },
            set: { shellState.setSelectedTab($0) }
        )
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            // Fond app sombre ; la zone sous la pilule reste transparente (pas de bandeau noir).
            Color(red: 0.043, green: 0.043, blue: 0.059)
                .ignoresSafeArea()

            CapacitorHostView()
                .ignoresSafeArea()
                .safeAreaInset(edge: .bottom, spacing: 0) {
                    Color.clear.frame(height: bottomInset)
                }

            if shellState.showBottomNavigationBar {
                BottomNavigationBar(selectedTab: selectedTabBinding)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .allowsHitTesting(true)
            }
        }
        .animation(.easeOut(duration: 0.2), value: shellState.showBottomNavigationBar)
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
