import SwiftUI

enum SploveTab: Int, CaseIterable, Identifiable {
    case move
    case undo
    case likes
    case messages
    case profile

    var id: Int { rawValue }

    /// Dérive l’onglet actif du pathname React — jamais d’un state figé post-login.
    static func from(pathname: String) -> SploveTab? {
        var path = pathname.split(separator: "?").first.map(String.init) ?? pathname
        path = path.split(separator: "#").first.map(String.init) ?? path
        if path.count > 1, path.hasSuffix("/") {
            path = String(path.dropLast())
        }
        if path.isEmpty { path = "/" }

        if path == "/" || path == "/move" || path.hasPrefix("/move/")
            || path == "/discover" || path.hasPrefix("/discover/")
        {
            return .move
        }
        if path == "/likes-you" || path == "/likes"
            || path.hasPrefix("/likes-you/") || path.hasPrefix("/likes/")
        {
            return .likes
        }
        if path == "/messages" || path.hasPrefix("/messages/") || path.hasPrefix("/chat/") {
            return .messages
        }
        if path == "/profile" || path == "/profil"
            || path.hasPrefix("/profile/") || path.hasPrefix("/profil/")
        {
            return .profile
        }
        return nil
    }
}

/// Barre d’onglets flottante (glass sombre SPLove) — navigation via hash Capacitor.
struct BottomNavigationBar: View {
    @Binding var selectedTab: SploveTab

    private let activeColor = Color(red: 1, green: 0.23, blue: 0.23)
    private let inactiveColor = Color(red: 0.42, green: 0.42, blue: 0.46)

    /// Hauteur de la pilule — icônes/libellés inchangés (24 / 10).
    static let pillContentHeight: CGFloat = 44
    /// Espace minimal entre le bas des libellés et la safe area (Home Indicator intacte).
    static let labelToSafeAreaGap: CGFloat = 4
    /// Move : rapprocher la pilule du Home Indicator (espace perdu sous la barre).
    static let moveLabelToSafeAreaGap: CGFloat = 0
    static let horizontalInset: CGFloat = 12
    static let cornerRadius: CGFloat = 22

    /// Pictogrammes / labels — tailles fixes (hauteur réduite = paddings uniquement).
    private let iconPointSize: CGFloat = 24
    private let labelPointSize: CGFloat = 10

    /// Padding bas : gap libellés → safe area + safe area réelle (jamais doublée par SwiftUI).
    static func bottomPadding(safeAreaBottom: CGFloat, selectedTab: SploveTab = .move) -> CGFloat {
        let gap = selectedTab == .move ? moveLabelToSafeAreaGap : labelToSafeAreaGap
        return gap + max(safeAreaBottom, 0)
    }

    /// Clearance WebView : pilule + gap + safe area (formule unique).
    static func layoutHeight(safeAreaBottom: CGFloat, selectedTab: SploveTab = .move) -> CGFloat {
        pillContentHeight + bottomPadding(safeAreaBottom: safeAreaBottom, selectedTab: selectedTab)
    }

    /// Alias métriques bridge — hauteur contenu hors safe area (pilule seule).
    static var barContentHeight: CGFloat { pillContentHeight }
    static var barContentHeightMoveCompact: CGFloat { barContentHeight }

    var body: some View {
        HStack(spacing: 0) {
            tabButton(.move, label: "Move", systemImage: "heart.circle")
            undoButton()
            tabButton(.likes, label: "Likes", systemImage: "heart.fill")
            tabButton(.messages, label: "Messages", systemImage: "message.fill")
            tabButton(.profile, label: "Profil", systemImage: "person.crop.circle")
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 0)
        .frame(height: Self.pillContentHeight)
        .background(floatingPillBackground)
        .padding(.horizontal, Self.horizontalInset)
        .padding(.bottom, Self.bottomPadding(safeAreaBottom: safeAreaBottom, selectedTab: selectedTab))
        .frame(maxWidth: .infinity, alignment: .bottom)
        .background(Color.clear)
        // Safe area une seule fois via padding-bottom — pas d’inset SwiftUI supplémentaire.
        .ignoresSafeArea(edges: .bottom)
    }

    /// Fond discret : quasi opaque SPLove, transparence très légère, sans material type Instagram.
    private var floatingPillBackground: some View {
        RoundedRectangle(cornerRadius: Self.cornerRadius, style: .continuous)
            .fill(Color(red: 12 / 255, green: 12 / 255, blue: 16 / 255).opacity(0.86))
            .overlay {
                RoundedRectangle(cornerRadius: Self.cornerRadius, style: .continuous)
                    .strokeBorder(Color.white.opacity(0.06), lineWidth: 1)
            }
            .shadow(color: Color.black.opacity(0.22), radius: 10, x: 0, y: 2)
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
            // Actif dérivé du pathname via setSelectedTabFromPath — pas d’état optimiste.
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
        .frame(maxWidth: .infinity)
        .frame(minHeight: 44)
        .contentShape(Rectangle())
    }

    private func undoButton() -> some View {
        Button {
            NativeNavigationBridge.triggerUndo()
        } label: {
            tabItemLabel(systemImage: "arrow.uturn.backward", label: "Retour", isActive: false)
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity)
        .frame(minHeight: 44)
        .contentShape(Rectangle())
    }

    private func tabItemLabel(systemImage: String, label: String, isActive: Bool) -> some View {
        VStack(spacing: 0) {
            Image(systemName: systemImage)
                .font(.system(size: iconPointSize, weight: .regular))
                .frame(height: iconPointSize)
            Text(label)
                .font(.system(size: labelPointSize, weight: .medium))
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity)
        .foregroundStyle(isActive ? activeColor : inactiveColor)
    }
}
