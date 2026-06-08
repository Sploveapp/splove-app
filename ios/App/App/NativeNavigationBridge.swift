import WebKit

enum NativeNavigationBridge {
    static func setBottomNavigationBarVisible(_ visible: Bool) {
        DispatchQueue.main.async {
            NativeShellState.shared.setBottomNavigationBarVisible(visible)
        }
    }

    static func navigate(hash: String) {
        guard let webView = SPLoveBridgeViewController.shared?.webView else { return }
        let escaped = hash.replacingOccurrences(of: "'", with: "\\'")
        webView.evaluateJavaScript("window.location.hash='\(escaped)'", completionHandler: nil)
    }

    static func triggerUndo() {
        guard let webView = SPLoveBridgeViewController.shared?.webView else { return }
        webView.evaluateJavaScript(
            "window.dispatchEvent(new CustomEvent('splove-native-nav-undo'))",
            completionHandler: nil
        )
    }
}
