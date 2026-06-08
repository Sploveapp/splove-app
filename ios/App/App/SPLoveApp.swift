import SwiftUI
import UIKit
import Capacitor

@main
struct SPLoveApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            MainTabView()
                .onOpenURL { url in
                    NSLog("NATIVE_OPEN_URL_RECEIVED SwiftUI.onOpenURL")
                    NSLog("NATIVE_OPEN_URL_VALUE SwiftUI.onOpenURL = %@", url.absoluteString)
                    _ = ApplicationDelegateProxy.shared.application(
                        UIApplication.shared,
                        open: url,
                        options: [UIApplication.OpenURLOptionsKey.sourceApplication: "SwiftUI.onOpenURL"]
                    )
                }
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { userActivity in
                    NSLog("NATIVE_CONTINUE_USER_ACTIVITY SwiftUI.onContinueUserActivity")
                    if let url = userActivity.webpageURL {
                        NSLog("NATIVE_OPEN_URL_VALUE universal SwiftUI = %@", url.absoluteString)
                    }
                    _ = ApplicationDelegateProxy.shared.application(
                        UIApplication.shared,
                        continue: userActivity,
                        restorationHandler: { _ in }
                    )
                }
        }
    }
}
