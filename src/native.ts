// Resolves the optional native transports registered by React Native autolinking.
import { NativeModules } from "react-native";
import type { AirhopBLESpec, AirhopLANSpec, AirhopWiFiPairingSpec, AirhopWiFiSpec } from "./types";

interface Modules {
  AirhopBLE?: AirhopBLESpec;
  AirhopLAN?: AirhopLANSpec;
  AirhopWiFi?: AirhopWiFiSpec;
  AirhopWiFiPairing?: AirhopWiFiPairingSpec;
}
const modules = NativeModules as Modules;
export const getBleModule = (): AirhopBLESpec | undefined => modules.AirhopBLE;
export const getLanModule = (): AirhopLANSpec | undefined => modules.AirhopLAN;
export const getWifiModule = (): AirhopWiFiSpec | undefined => modules.AirhopWiFi;
export const getWifiPairingModule = (): AirhopWiFiPairingSpec | undefined => modules.AirhopWiFiPairing;
