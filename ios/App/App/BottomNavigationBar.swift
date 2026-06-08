import SwiftUI

enum SploveTab: Int, CaseIterable, Identifiable {
    case move
    case undo
    case likes
    case messages
    case profile

    var id: Int { rawValue }
}

/// Barre d’onglets fixe (style Instagram) — navigation via hash Capacitor.
struct BottomNavigationBar: View {
    @Binding var selectedTab: SploveTab

    private let activeColor = Color(red: 1, green: 0.23, blue: 0.23)
    private let inactiveColor = Color(red: 0.42, green: 0.42, blue: 0.46)
    private let barBackground = Color(red: 11 / 255, green: 11 / 255, blue: 15 / 255)

    /// Hauteur visuelle au-dessus du home indicator (bordure + rangée icônes + marge basse).
    static let barContentHeight: CGFloat = 41
    private static let borderHeight: CGFloat = 0.33
    private static let contentTopPadding: CGFloat = 4
    /// Petit espace entre le label et la zone home indicator.
    private static let contentBottomPadding: CGFloat = 2

    /// Hauteur totale occupée par la barre (contenu + safe area bas).
    static func layoutHeight(safeAreaBottom: CGFloat) -> CGFloat {
        barContentHeight + max(safeAreaBottom, 0)
    }

    var body: some View {
        VStack(spacing: 0) {
            Rectangle()
                .fill(Color.white.opacity(0.08))
                .frame(height: Self.borderHeight)

            HStack(spacing: 0) {
                tabButton(.move, label: "Move", systemImage: "heart.circle")
                undoButton()
                tabButton(.likes, label: "Likes", systemImage: "heart.fill")
                tabButton(.messages, label: "Messages", systemImage: "message.fill")
                tabButton(.profile, label: "Profil", systemImage: "person.crop.circle")
            }
            .padding(.horizontal, 2)
            .padding(.top, Self.contentTopPadding)
            .padding(.bottom, Self.contentBottomPadding + safeAreaBottom)
        }
        .background(barBackground.ignoresSafeArea(edges: .bottom))
    }

    private var safeAreaBottom: CGFloat {
        guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let inset = scene.windows.first?.safeAreaInsets.bottom
        else { return 0 }
        return max(inset, 0)
    }

    private func tabButton(_ tab: SploveTab, label: String, systemImage: String) -> some View {
        let isActive = selectedTab == tab
        return Button {
            selectedTab = tab
            switch tab {
            case .move:
                NativeNavigationBridge.navigate(hash: "#/move")
            case .likes:
                NativeNavigationBridge.navigate(hash: "#/likes-you")
            case .messages:
                NativeNavigationBridge.navigate(hash: "#/messages")
            case .profile:
                NativeNavigationBridge.navigate(hash: "#/profile")
            case .undo:
                break
            }
        } label: {
            tabItemLabel(systemImage: systemImage, label: label, isActive: isActive)
        }
        .buttonStyle(.plain)
    }

    private func undoButton() -> some View {
        Button {
            selectedTab = .undo
            NativeNavigationBridge.triggerUndo()
        } label: {
            tabItemLabel(systemImage: "arrow.uturn.backward", label: "Retour", isActive: false)
        }
        .buttonStyle(.plain)
    }

    private func tabItemLabel(systemImage: String, label: String, isActive: Bool) -> some View {
        VStack(spacing: 1) {
            Image(systemName: systemImage)
                .font(.system(size: 24, weight: .regular))
                .frame(height: 24)
            Text(label)
                .font(.system(size: 10, weight: .medium))
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity)
        .foregroundStyle(isActive ? activeColor : inactiveColor)
    }
}
