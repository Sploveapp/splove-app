import AuthenticationServices
import Capacitor
import CryptoKit
import UIKit

private func isGoogleOAuthURL(_ url: URL) -> Bool {
    let host = (url.host ?? "").lowercased()
    return host.contains("accounts.google.com") || host.contains("google.com")
}

private func randomNonce(length: Int = 32) -> String {
    precondition(length > 0)
    let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
    var result = ""
    var remaining = length
    while remaining > 0 {
        var randoms = [UInt8](repeating: 0, count: 16)
        let status = SecRandomCopyBytes(kSecRandomDefault, randoms.count, &randoms)
        if status != errSecSuccess {
            fatalError("Unable to generate nonce")
        }
        for random in randoms {
            if remaining == 0 { break }
            if random < charset.count {
                result.append(charset[Int(random)])
                remaining -= 1
            }
        }
    }
    return result
}

private func sha256Nonce(_ input: String) -> String {
    let data = Data(input.utf8)
    let hash = SHA256.hash(data: data)
    return hash.map { String(format: "%02x", $0) }.joined()
}

/// Google OAuth iOS — ASWebAuthenticationSession (callback `splove://`).
/// Apple iOS — ASAuthorizationAppleIDProvider natif + identityToken pour Supabase.
@objc(SploveIosGoogleOAuthPlugin)
public class SploveIosGoogleOAuthPlugin: CAPPlugin, CAPBridgedPlugin,
    ASWebAuthenticationPresentationContextProviding,
    ASAuthorizationControllerDelegate,
    ASAuthorizationControllerPresentationContextProviding
{
    public let identifier = "SploveIosGoogleOAuthPlugin"
    public let jsName = "SploveIosGoogleOAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openGoogleOAuth", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signInWithApple", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showConnectingMask", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showFinalizingMask", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hideOAuthMask", returnType: CAPPluginReturnPromise),
    ]

    private var authSession: ASWebAuthenticationSession?
    private var appleAuthCall: CAPPluginCall?
    private var appleRawNonce: String?
    private var appleAuthController: ASAuthorizationController?

    @objc public func isAvailable(_ call: CAPPluginCall) {
        if #available(iOS 13.0, *) {
            call.resolve(["available": true])
        } else {
            call.resolve(["available": false])
        }
    }

    @objc public func showConnectingMask(_ call: CAPPluginCall) {
        SploveOAuthMaskWindow.shared.showConnecting()
        call.resolve()
    }

    @objc public func showFinalizingMask(_ call: CAPPluginCall) {
        SploveOAuthMaskWindow.shared.showFinalizing()
        call.resolve()
    }

    @objc public func hideOAuthMask(_ call: CAPPluginCall) {
        SploveOAuthMaskWindow.shared.hide()
        call.resolve()
    }

    @objc public func openGoogleOAuth(_ call: CAPPluginCall) {
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

    /// Sign in with Apple natif — pas d’ASWebAuthenticationSession, pas de deep link.
    @objc public func signInWithApple(_ call: CAPPluginCall) {
        guard #available(iOS 13.0, *) else {
            NSLog("[APPLE_NATIVE] error stage=start code=ios_version_unsupported")
            call.reject("ios_version_unsupported")
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }

            NSLog("[APPLE_NATIVE] authorization_start")

            let rawNonce = randomNonce()
            let hashedNonce = sha256Nonce(rawNonce)

            self.appleAuthCall = call
            self.appleRawNonce = rawNonce

            let provider = ASAuthorizationAppleIDProvider()
            let request = provider.createRequest()
            request.requestedScopes = [.fullName, .email]
            request.nonce = hashedNonce

            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            self.appleAuthController = controller
            controller.performRequests()
        }
    }

    // MARK: - ASAuthorizationControllerDelegate

    public func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithAuthorization authorization: ASAuthorization
    ) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            defer {
                self.appleAuthController = nil
            }

            guard let call = self.appleAuthCall else { return }
            self.appleAuthCall = nil

            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential else {
                NSLog("[APPLE_NATIVE] error stage=credential code=invalid_credential")
                self.appleRawNonce = nil
                call.reject("invalid_credential")
                return
            }

            NSLog("[APPLE_NATIVE] credential_received")

            guard let tokenData = credential.identityToken,
                  let identityToken = String(data: tokenData, encoding: .utf8),
                  !identityToken.isEmpty
            else {
                NSLog("[APPLE_NATIVE] error stage=identity_token code=missing_identity_token")
                self.appleRawNonce = nil
                call.reject("missing_identity_token")
                return
            }

            guard let rawNonce = self.appleRawNonce, !rawNonce.isEmpty else {
                NSLog("[APPLE_NATIVE] error stage=nonce code=missing_raw_nonce")
                call.reject("missing_raw_nonce")
                return
            }

            self.appleRawNonce = nil
            NSLog("[APPLE_NATIVE] identity_token_ready")

            var payload: [String: Any] = [
                "identityToken": identityToken,
                "rawNonce": rawNonce,
            ]
            if let email = credential.email {
                payload["email"] = email
            }
            if let givenName = credential.fullName?.givenName {
                payload["givenName"] = givenName
            }
            if let familyName = credential.fullName?.familyName {
                payload["familyName"] = familyName
            }

            call.resolve(payload)
        }
    }

    public func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithError error: Error
    ) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            defer {
                self.appleAuthController = nil
                self.appleRawNonce = nil
            }

            guard let call = self.appleAuthCall else { return }
            self.appleAuthCall = nil

            let nsError = error as NSError
            if nsError.domain == ASAuthorizationError.errorDomain,
               nsError.code == ASAuthorizationError.canceled.rawValue
            {
                NSLog("[APPLE_NATIVE] error stage=authorization code=cancelled")
                call.reject("cancelled")
                return
            }

            NSLog(
                "[APPLE_NATIVE] error stage=authorization code=%d",
                nsError.code
            )
            call.reject("apple_auth_error", "\(nsError.domain)|\(nsError.code)", error)
        }
    }

    // MARK: - Presentation anchors

    @available(iOS 12.0, *)
    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        if Thread.isMainThread {
            return resolvePresentationAnchor()
        }
        return DispatchQueue.main.sync {
            resolvePresentationAnchor()
        }
    }

    @available(iOS 13.0, *)
    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        if Thread.isMainThread {
            return resolvePresentationAnchor()
        }
        return DispatchQueue.main.sync {
            resolvePresentationAnchor()
        }
    }

    private func resolvePresentationAnchor() -> ASPresentationAnchor {
        let foregroundScenes = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .filter { $0.activationState == .foregroundActive }

        for scene in foregroundScenes {
            if let window = scene.windows.first(where: { $0.isKeyWindow }) {
                return window
            }
        }

        let allScenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        if let window = allScenes.flatMap(\.windows).first(where: { $0.isKeyWindow }) {
            return window
        }
        if let window = allScenes.flatMap(\.windows).first {
            return window
        }
        if let window = self.bridge?.viewController?.view.window {
            return window
        }
        return ASPresentationAnchor()
    }
}
