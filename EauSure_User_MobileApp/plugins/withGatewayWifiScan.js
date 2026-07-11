const fs = require('fs');
const path = require('path');
const {
  withDangerousMod,
  withMainApplication,
} = require('@expo/config-plugins');

const MODULE_IMPORT = 'import com.farjeouiadam.eausure_app.wifi.GatewayWifiScanPackage';
const PACKAGE_REGISTRATION = '              add(GatewayWifiScanPackage())\n';

const MODULE_SOURCE = `package com.farjeouiadam.eausure_app.wifi

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.wifi.WifiManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class GatewayWifiScanModule(
  reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "GatewayWifiScan"

  @ReactMethod
  fun scanAvailableSsids(promise: Promise) {
    try {
      if (!hasRequiredPermissions()) {
        promise.reject(
          "E_WIFI_PERMISSIONS",
          "Les permissions Wi-Fi/localisation requises ne sont pas accordées."
        )
        return
      }

      val wifiManager = reactApplicationContext.applicationContext
        .getSystemService(Context.WIFI_SERVICE) as? WifiManager

      if (wifiManager == null) {
        promise.reject("E_WIFI_MANAGER", "WifiManager indisponible sur cet appareil.")
        return
      }

      if (!wifiManager.isWifiEnabled) {
        promise.reject("E_WIFI_DISABLED", "Le Wi-Fi du téléphone est désactivé.")
        return
      }

      @Suppress("DEPRECATION")
      wifiManager.startScan()

      val results = wifiManager.scanResults
        ?.filter { !it.SSID.isNullOrBlank() }
        ?.distinctBy { it.SSID.trim() }
        ?.sortedByDescending { it.level }
        ?: emptyList()

      val payload = Arguments.createArray()
      for (result in results) {
        val item = Arguments.createMap().apply {
          putString("ssid", result.SSID)
          putInt("rssi", result.level)
          putString("capabilities", result.capabilities ?: "")
          putInt("frequency", result.frequency)
        }
        payload.pushMap(item)
      }

      promise.resolve(payload)
    } catch (error: Exception) {
      promise.reject("E_WIFI_SCAN", error.message, error)
    }
  }

  private fun hasRequiredPermissions(): Boolean {
    val fineLocationGranted = ContextCompat.checkSelfPermission(
      reactApplicationContext,
      Manifest.permission.ACCESS_FINE_LOCATION
    ) == PackageManager.PERMISSION_GRANTED

    if (!fineLocationGranted) {
      return false
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      val nearbyWifiGranted = ContextCompat.checkSelfPermission(
        reactApplicationContext,
        Manifest.permission.NEARBY_WIFI_DEVICES
      ) == PackageManager.PERMISSION_GRANTED

      if (!nearbyWifiGranted) {
        return false
      }
    }

    return true
  }
}
`;

const PACKAGE_SOURCE = `package com.farjeouiadam.eausure_app.wifi

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class GatewayWifiScanPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(GatewayWifiScanModule(reactContext))
  }

  override fun createViewManagers(
    reactContext: ReactApplicationContext
  ): List<ViewManager<*, *>> {
    return emptyList()
  }
}
`;

function withGatewayWifiScanFiles(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const pkg = cfg.android?.package;
      if (!pkg) {
        throw new Error('android.package is required to configure GatewayWifiScan.');
      }

      const pkgPath = pkg.split('.').join(path.sep);
      const wifiDir = path.join(
        cfg.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'java',
        pkgPath,
        'wifi'
      );

      await fs.promises.mkdir(wifiDir, { recursive: true });
      await fs.promises.writeFile(path.join(wifiDir, 'GatewayWifiScanModule.kt'), MODULE_SOURCE, 'utf8');
      await fs.promises.writeFile(path.join(wifiDir, 'GatewayWifiScanPackage.kt'), PACKAGE_SOURCE, 'utf8');

      return cfg;
    },
  ]);
}

function withGatewayWifiScanMainApplication(config) {
  return withMainApplication(config, (cfg) => {
    let contents = cfg.modResults.contents;

    if (!contents.includes(MODULE_IMPORT)) {
      if (contents.includes('import expo.modules.ReactNativeHostWrapper')) {
        contents = contents.replace(
          'import expo.modules.ReactNativeHostWrapper',
          `import expo.modules.ReactNativeHostWrapper\n${MODULE_IMPORT}`
        );
      } else {
        contents = `${MODULE_IMPORT}\n${contents}`;
      }
    }

    if (!contents.includes('add(GatewayWifiScanPackage())')) {
      contents = contents.replace(
        /PackageList\(this\)\.packages\.apply \{\n/,
        (match) => `${match}${PACKAGE_REGISTRATION}`
      );
    }

    cfg.modResults.contents = contents;
    return cfg;
  });
}

module.exports = function withGatewayWifiScan(config) {
  config = withGatewayWifiScanFiles(config);
  config = withGatewayWifiScanMainApplication(config);
  return config;
};
