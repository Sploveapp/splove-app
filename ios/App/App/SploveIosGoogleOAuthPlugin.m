#import <Capacitor/Capacitor.h>

CAP_PLUGIN(SploveIosGoogleOAuthPlugin, "SploveIosGoogleOAuth",
    CAP_PLUGIN_METHOD(isAvailable, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(openGoogleOAuth, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(showConnectingMask, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(showFinalizingMask, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(hideOAuthMask, CAPPluginReturnPromise);
)
