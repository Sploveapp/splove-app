import UIKit
import WebKit
import Capacitor

private final class SploveNativeShellMessageHandler: NSObject, WKScriptMessageHandler {
    static let shared = SploveNativeShellMessageHandler()

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard message.name == "sploveNativeShell",
              let body = message.body as? [String: Any]
        else { return }

        if let visible = body["bottomNavVisible"] as? Bool {
            NativeNavigationBridge.setBottomNavigationBarVisible(visible)
        }
        if let badge = body["iconBadgeCount"] as? Int {
            DispatchQueue.main.async {
                UIApplication.shared.applicationIconBadgeNumber = max(0, badge)
            }
        }
        // Toujours resynchroniser l’onglet actif depuis le pathname React (post-login → /move).
        if let activePath = body["activePath"] as? String {
            DispatchQueue.main.async {
                NativeShellState.shared.setSelectedTabFromPath(activePath)
            }
        }
    }
}

/// Point d’entrée Capacitor — une seule instance WebView pour toute l’app.
final class SPLoveBridgeViewController: CAPBridgeViewController {
    static weak var shared: SPLoveBridgeViewController?

    private var registeredShellHandler = false
    private var oauthDeepLinkObserver: NSObjectProtocol?

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(SploveIosGoogleOAuthPlugin())
        NSLog("[OAUTH_IOS_NATIVE] SploveIosGoogleOAuth registered (registerPluginInstance)")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        SPLoveBridgeViewController.shared = self
        let splashBg = UIColor(red: 0.043, green: 0.043, blue: 0.059, alpha: 1)
        view.backgroundColor = splashBg
        webView?.isOpaque = true
        webView?.backgroundColor = splashBg
        webView?.scrollView.backgroundColor = splashBg
        registerOAuthDeepLinkObserverIfNeeded()
    }

    deinit {
        if let oauthDeepLinkObserver {
            NotificationCenter.default.removeObserver(oauthDeepLinkObserver)
        }
    }

    private func registerOAuthDeepLinkObserverIfNeeded() {
        guard oauthDeepLinkObserver == nil else { return }
        oauthDeepLinkObserver = NotificationCenter.default.addObserver(
            forName: Notification.Name.capacitorDecidePolicyForNavigationAction,
            object: nil,
            queue: .main
        ) { notification in
            guard let action = notification.object as? WKNavigationAction,
                  let url = action.request.url,
                  let scheme = url.scheme?.lowercased(),
                  scheme == "splove"
            else { return }

            NSLog("NATIVE_OPEN_URL_RECEIVED WebView")
            NSLog("NATIVE_OPEN_URL_VALUE WebView = %@", url.absoluteString)
            _ = ApplicationDelegateProxy.shared.application(
                UIApplication.shared,
                open: url,
                options: [UIApplication.OpenURLOptionsKey.sourceApplication: "CapacitorWebView"]
            )
        }
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        SPLoveBridgeViewController.shared = self
        registerShellMessageHandlerIfNeeded()
        syncBottomNavWebMetrics()
    }

    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        syncBottomNavWebMetrics()
    }

    private func registerShellMessageHandlerIfNeeded() {
        guard !registeredShellHandler, let webView else { return }
        registeredShellHandler = true
        webView.configuration.userContentController.add(
            SploveNativeShellMessageHandler.shared,
            name: "sploveNativeShell"
        )
    }

    /// Expose la hauteur contenu barre native à la WebView (0 si non authentifié).
    /// Contenu = pilule seule ; safe area ajoutée une seule fois (layoutHeight / CSS).
    func syncBottomNavWebMetrics() {
        let visible = NativeShellState.shared.showBottomNavigationBar
        let contentHeight: CGFloat = visible ? BottomNavigationBar.barContentHeight : 0
        webView?.evaluateJavaScript(
            """
            window.__SPLOVE_NATIVE_BOTTOM_NAV__=\(visible);
            document.documentElement.style.setProperty('--splove-native-bottom-nav-content-height', '\(contentHeight)px');
            """,
            completionHandler: nil
        )
    }
}
