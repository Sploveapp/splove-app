import SwiftUI
import Capacitor

/// Intègre la WebView Capacitor dans SwiftUI (équivalent du CAPBridgeViewController du storyboard).
struct CapacitorHostView: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> SPLoveBridgeViewController {
        SPLoveBridgeViewController()
    }

    func updateUIViewController(_ uiViewController: SPLoveBridgeViewController, context: Context) {}
}
