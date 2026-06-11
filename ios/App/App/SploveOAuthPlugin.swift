import Foundation
import UIKit
import Capacitor
import AuthenticationServices

@objc(SploveOAuthPlugin)
public class SploveOAuthPlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "SploveOAuthPlugin"
    public let jsName = "SploveOAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startWebAuthSession", returnType: CAPPluginReturnPromise),
    ]

    private var session: ASWebAuthenticationSession?

    @objc func startWebAuthSession(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"),
              let url = URL(string: urlString),
              let scheme = call.getString("callbackScheme"),
              !scheme.isEmpty else {
            call.reject("url and callbackScheme are required")
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }

            self.session?.cancel()
            self.session = ASWebAuthenticationSession(
                url: url,
                callbackURLScheme: scheme
            ) { [weak self] callbackURL, error in
                self?.session = nil

                if let authError = error as? ASWebAuthenticationSessionError,
                   authError.code == .canceledLogin {
                    call.reject("User canceled login", "USER_CANCELED")
                    return
                }

                if let error = error {
                    call.reject(error.localizedDescription)
                    return
                }

                guard let callbackURL = callbackURL else {
                    call.reject("No callback URL returned")
                    return
                }

                call.resolve(["callbackUrl": callbackURL.absoluteString])
            }

            self.session?.presentationContextProvider = self
            self.session?.prefersEphemeralWebBrowserSession = false

            if self.session?.start() != true {
                self.session = nil
                call.reject("Failed to start web authentication session")
            }
        }
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        if let window = self.bridge?.viewController?.view.window {
            return window
        }
        for scene in UIApplication.shared.connectedScenes {
            if let windowScene = scene as? UIWindowScene,
               let window = windowScene.windows.first(where: { $0.isKeyWindow }) {
                return window
            }
        }
        return ASPresentationAnchor()
    }
}
