import AuthenticationServices
import Capacitor
import UIKit

private func isGoogleOAuthURL(_ url: URL) -> Bool {
    let host = (url.host ?? "").lowercased()
    return host.contains("accounts.google.com") || host.contains("google.com")
}

/// Google OAuth iOS — ASWebAuthenticationSession uniquement (callback `splove://`).
@objc(SploveIosGoogleOAuthPlugin)
public class SploveIosGoogleOAuthPlugin: CAPPlugin, ASWebAuthenticationPresentationContextProviding {
    private var authSession: ASWebAuthenticationSession?

    @objc func isAvailable(_ call: CAPPluginCall) {
        if #available(iOS 12.0, *) {
            call.resolve(["available": true])
        } else {
            call.resolve(["available": false])
        }
    }

    @objc func showConnectingMask(_ call: CAPPluginCall) {
        SploveOAuthMaskWindow.shared.showConnecting()
        call.resolve()
    }

    @objc func showFinalizingMask(_ call: CAPPluginCall) {
        SploveOAuthMaskWindow.shared.showFinalizing()
        call.resolve()
    }

    @objc func hideOAuthMask(_ call: CAPPluginCall) {
        SploveOAuthMaskWindow.shared.hide()
        call.resolve()
    }

    @objc func openGoogleOAuth(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url")?.trimmingCharacters(in: .whitespacesAndNewlines),
              !urlString.isEmpty,
              let url = URL(string: urlString),
              isGoogleOAuthURL(url)
        else {
            call.reject("invalid_url")
            return
        }

        guard #available(iOS 12.0, *) else {
            call.reject("ios_version_unsupported")
            return
        }

        authSession?.cancel()
        authSession = nil

        NSLog("[OAUTH_IOS_NATIVE] using_as_web_auth_session host=%@", url.host ?? "(none)")

        let session = ASWebAuthenticationSession(url: url, callbackURLScheme: "splove") { [weak self] callbackURL, error in
            DispatchQueue.main.async {
                self?.authSession = nil

                if let authError = error as? ASWebAuthenticationSessionError, authError.code == .canceledLogin {
                    NSLog("[OAUTH_IOS_NATIVE] auth_session_canceled")
                    call.resolve(["outcome": "canceled"])
                    return
                }

                if let error = error {
                    NSLog("[OAUTH_IOS_NATIVE] auth_session_failed message=%@", error.localizedDescription)
                    call.reject("auth_session_failed", error.localizedDescription, error)
                    return
                }

                guard let callbackURL = callbackURL else {
                    call.reject("no_callback_url")
                    return
                }

                let absolute = callbackURL.absoluteString
                NSLog("[OAUTH_IOS_NATIVE] callback_received url_length=%d", absolute.count)

                SploveOAuthMaskWindow.shared.showFinalizing()

                call.resolve([
                    "outcome": "callback",
                    "url": absolute,
                ])
            }
        }

        session.presentationContextProvider = self
        session.prefersEphemeralWebBrowserSession = false
        authSession = session

        if !session.start() {
            authSession = nil
            NSLog("[OAUTH_IOS_NATIVE] auth_session_start_failed")
            call.reject("auth_session_start_failed")
        }
    }

    @available(iOS 12.0, *)
    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        if let window = scenes.flatMap(\.windows).first(where: { $0.isKeyWindow }) {
            return window
        }
        if let window = self.bridge?.viewController?.view.window {
            return window
        }
        return ASPresentationAnchor()
    }
}
