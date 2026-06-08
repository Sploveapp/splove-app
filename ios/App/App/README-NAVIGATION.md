# Navigation iOS (SwiftUI + Capacitor)

SPLove iOS n’était pas une app SwiftUI pure : c’est **Capacitor** (WebView React). La refonte ajoute une coque SwiftUI sans réécrire les écrans métier.

## Architecture

```
SPLoveApp (@main)
  └── MainTabView (ZStack)
        ├── CapacitorHostView → SPLoveBridgeViewController (React / dist)
        └── BottomNavigationBar (fixe, hors scroll)
```

- **Écrans** : inchangés (`Discover`, `Messages`, `Profile`, etc.) dans `src/pages/`.
- **Barre web** : masquée sur iOS natif (`usesNativeBottomNavigation()` dans `AppLayout.tsx`).
- **Barre iOS** : `BottomNavigationBar.swift` — hash routes `#/move`, `#/likes-you`, etc.
- **Undo** : bouton natif → événement `splove-native-nav-undo` → logique Discover existante.

## Build

1. `npm run build && npx cap sync ios`
2. Ouvrir `ios/App/App.xcworkspace` dans Xcode
3. Point d’entrée : `SPLoveApp.swift` (plus `Main.storyboard` comme racine)

## Web / Android

La barre React fixe (`SPLoveBottomNav` + `splove-app-shell`) reste utilisée hors iOS natif.
