import UIKit

/// Fenêtre native plein écran — masque visuellement Supabase / navigateur OAuth.
final class SploveOAuthMaskWindow {
    static let shared = SploveOAuthMaskWindow()

    private var window: UIWindow?
    private var titleLabel: UILabel?
    private var subtitleLabel: UILabel?

    private let splashBg = UIColor(red: 0.043, green: 0.043, blue: 0.059, alpha: 1)

    private init() {}

    func showConnecting() {
        show(title: "Connexion sécurisée…", subtitle: "Retour automatique dans l'application.")
    }

    func showFinalizing() {
        NSLog("[OAUTH_IOS] native_mask finalizing")
        show(title: "Finalisation de la connexion…", subtitle: "Préparation de ton espace SPLove.")
    }

    func hide() {
        DispatchQueue.main.async {
            self.window?.isHidden = true
            self.window = nil
            self.titleLabel = nil
            self.subtitleLabel = nil
            NSLog("[OAUTH_IOS] native_mask hidden")
        }
    }

    private func show(title: String, subtitle: String) {
        DispatchQueue.main.async {
            let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            guard let scene = scenes.first(where: { $0.activationState == .foregroundActive }) ?? scenes.first else {
                return
            }

            let maskWindow: UIWindow
            if let existing = self.window {
                maskWindow = existing
            } else {
                let w = UIWindow(windowScene: scene)
                w.windowLevel = .alert + 100
                w.backgroundColor = self.splashBg
                self.window = w
                maskWindow = w

                let root = UIViewController()
                root.view.backgroundColor = self.splashBg
                maskWindow.rootViewController = root

                let stack = UIStackView()
                stack.axis = .vertical
                stack.alignment = .center
                stack.spacing = 10
                stack.translatesAutoresizingMaskIntoConstraints = false
                root.view.addSubview(stack)

                let titleLabel = UILabel()
                titleLabel.font = .systemFont(ofSize: 17, weight: .semibold)
                titleLabel.textColor = UIColor(white: 1, alpha: 0.94)
                titleLabel.textAlignment = .center
                titleLabel.numberOfLines = 0
                self.titleLabel = titleLabel

                let subtitleLabel = UILabel()
                subtitleLabel.font = .systemFont(ofSize: 13, weight: .medium)
                subtitleLabel.textColor = UIColor(white: 1, alpha: 0.52)
                subtitleLabel.textAlignment = .center
                subtitleLabel.numberOfLines = 0
                self.subtitleLabel = subtitleLabel

                stack.addArrangedSubview(titleLabel)
                stack.addArrangedSubview(subtitleLabel)

                NSLayoutConstraint.activate([
                    stack.centerXAnchor.constraint(equalTo: root.view.centerXAnchor),
                    stack.centerYAnchor.constraint(equalTo: root.view.centerYAnchor),
                    stack.leadingAnchor.constraint(greaterThanOrEqualTo: root.view.leadingAnchor, constant: 32),
                    stack.trailingAnchor.constraint(lessThanOrEqualTo: root.view.trailingAnchor, constant: -32),
                    stack.widthAnchor.constraint(lessThanOrEqualToConstant: 300),
                ])
            }

            self.titleLabel?.text = title
            self.subtitleLabel?.text = subtitle
            maskWindow.isHidden = false
            maskWindow.makeKeyAndVisible()
        }
    }
}
