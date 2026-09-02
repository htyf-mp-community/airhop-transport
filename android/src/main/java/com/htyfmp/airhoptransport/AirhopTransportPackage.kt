// Single autolink entry point for all transport modules.
package com.htyfmp.airhoptransport

import android.os.Build
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import com.htyfmp.airhoptransport.ble.AirhopBLEModule
import com.htyfmp.airhoptransport.lan.AirhopLANModule
import com.htyfmp.airhoptransport.wifi.AirhopWiFiModule

class AirhopTransportPackage : ReactPackage {
    @Suppress("OVERRIDE_DEPRECATION")
    override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = buildList {
        add(AirhopBLEModule(context))
        add(AirhopLANModule(context))
        // Wi-Fi Aware was introduced in API 26. Older devices retain BLE and LAN.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) add(AirhopWiFiModule(context))
    }

    @Suppress("OVERRIDE_DEPRECATION")
    override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
