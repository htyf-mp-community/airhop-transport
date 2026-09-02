// Resolves the optional native transports registered by React Native autolinking.
import { NativeModules } from "react-native";
import type { AirhopBLESpec, AirhopLANSpec, AirhopWiFiSpec } from "./types";

interface Modules { AirhopBLE?: AirhopBLESpec; AirhopLAN?: AirhopLANSpec; AirhopWiFi?: AirhopWiFiSpec }
const modules = NativeModules as Modules;
export const getBleModule = (): AirhopBLESpec | undefined => modules.AirhopBLE;
export const getLanModule = (): AirhopLANSpec | undefined => modules.AirhopLAN;
export const getWifiModule = (): AirhopWiFiSpec | undefined => modules.AirhopWiFi;
