// iOS Wi-Fi Aware pairing adapter. Android Wi-Fi Aware has no pairing sheet.

import { NativeEventEmitter, Platform } from "react-native";
import { getWifiPairingModule } from "./native";
import type { AirhopWiFiPairingSpec, WiFiPairingColors, WiFiPairingLabels, WiFiPairingMode, WiFiPairingState } from "./types";

export interface WiFiPairingSubscription { remove(): void }

export class WiFiAwarePairing {
  private readonly nativeModule: AirhopWiFiPairingSpec | undefined;

  constructor(nativeModule: AirhopWiFiPairingSpec | undefined = getWifiPairingModule()) {
    this.nativeModule = nativeModule;
  }

  async getState(): Promise<WiFiPairingState> {
    if (Platform.OS !== "ios" || !this.nativeModule) return { supported: false, count: 0 };
    return this.nativeModule.getPairingState();
  }

  async present(mode: WiFiPairingMode, labels: WiFiPairingLabels, colors: WiFiPairingColors): Promise<void> {
    if (!this.nativeModule) throw new Error("Wi-Fi Aware pairing is unavailable");
    await this.nativeModule.presentPairing(mode, labels, colors);
  }

  onDevicesChanged(listener: (count: number) => void): WiFiPairingSubscription {
    if (!this.nativeModule) return { remove: () => undefined };
    const emitter = new NativeEventEmitter(this.nativeModule);
    return emitter.addListener("AirhopWiFiPairing.devicesChanged", (event: object) => {
      const count = (event as { count?: unknown }).count;
      if (typeof count === "number") listener(count);
    });
  }
}
