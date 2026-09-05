import "react-native-get-random-values";

import {
  AirhopTransport,
  WiFiAwarePairing,
  type WiFiPairingMode,
  type TransportKind,
  type TransportSubscription,
} from "@htyf-mp/airhop-transport";
import {
  AirhopSignalingAdapter,
  AirhopWebRTCTransport,
} from "@htyf-mp/airhop-transport/webrtc";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  PermissionsAndroid,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { copy } from "./src/copy";
import { theme } from "./src/theme";

interface LinkRow {
  linkID: string;
  kind: TransportKind;
  role?: string;
  rssi?: number;
}
interface EventRow { id: number; text: string }

const SIGNAL_PREFIX = new Uint8Array([0x41, 0x48, 0x53, 0x31]);

function isSignalBytes(bytes: Uint8Array): boolean {
  return SIGNAL_PREFIX.every((value, index) => bytes[index] === value);
}

async function requestAndroidPermissions(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  const permissions = Platform.Version >= 31
    ? [
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
      ]
    : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  const result = await PermissionsAndroid.requestMultiple(permissions);
  return permissions.every((permission) => result[permission] === PermissionsAndroid.RESULTS.GRANTED);
}

export default function App() {
  const transport = useMemo(() => new AirhopTransport({
    preferredKinds: ["wifi", "lan", "ble"],
    lanInstanceName: `airhop-example-${Date.now().toString(36)}`,
    bleLocalName: "airhop-example",
  }), []);
  const pairing = useMemo(() => new WiFiAwarePairing(), []);
  const signaling = useMemo(() => new AirhopSignalingAdapter({
    async send(linkID, bytes) {
      const framed = new Uint8Array(SIGNAL_PREFIX.byteLength + bytes.byteLength);
      framed.set(SIGNAL_PREFIX);
      framed.set(bytes, SIGNAL_PREFIX.byteLength);
      const result = await transport.write(linkID, framed);
      if (!result.ok) throw new Error(result.error ?? copy.error);
    },
    subscribe(listener) {
      return transport.on("packetReceived", ({ linkID, data }) => {
        if (isSignalBytes(data)) listener(linkID, data.subarray(SIGNAL_PREFIX.byteLength));
      });
    },
  }, { maxFrameBytes: 480 }), [transport]);
  const webrtc = useMemo(() => new AirhopWebRTCTransport({
    localPeerID: `example-${Date.now().toString(36)}`,
    signaling,
  }), [signaling]);
  const subscriptions = useRef<TransportSubscription[]>([]);
  const eventID = useRef(0);
  const [status, setStatus] = useState<string>(copy.stopped);
  const [running, setRunning] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(Platform.OS === "ios");
  const [message, setMessage] = useState("");
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [selectedLinkID, setSelectedLinkID] = useState<string>();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [pairingSupported, setPairingSupported] = useState(false);
  const [pairedDeviceCount, setPairedDeviceCount] = useState(0);
  const [webrtcLinkID, setWebrtcLinkID] = useState<string>();

  const addEvent = (text: string) => {
    eventID.current += 1;
    setEvents((current) => [{ id: eventID.current, text }, ...current].slice(0, 30));
  };
  const refreshLinks = () => {
    const current = transport.getLinks();
    setLinks((previous) => current.map((link) => ({
      ...link,
      ...previous.find((item) => item.linkID === link.linkID),
    })));
  };

  useEffect(() => {
    subscriptions.current = [
      transport.on("linkConnected", ({ linkID, kind, meta }) => {
        addEvent(`${copy.connected}: ${kind} ${linkID}`);
        setLinks((current) => [
          ...current.filter((item) => item.linkID !== linkID),
          {
            linkID,
            kind,
            role: typeof meta?.role === "string" ? meta.role : undefined,
            rssi: typeof meta?.rssi === "number" ? meta.rssi : undefined,
          },
        ]);
        // Selecting the first BLE link makes the two-phone happy path require
        // no knowledge of native link IDs. Users can still tap another link.
        if (kind === "ble") setSelectedLinkID((current) => current ?? linkID);
      }),
      transport.on("linkDisconnected", ({ linkID, kind }) => {
        addEvent(`${copy.disconnected}: ${kind} ${linkID}`);
        setSelectedLinkID((current) => current === linkID ? undefined : current);
        refreshLinks();
      }),
      transport.on("packetReceived", ({ linkID, kind, data }) => {
        if (isSignalBytes(data)) return;
        addEvent(`${copy.received}: ${kind} ${linkID} · ${data.byteLength} ${copy.bytes} · ${new TextDecoder().decode(data)}`);
      }),
      transport.on("availabilityChanged", ({ kind, available }) => {
        addEvent(`${kind}: ${available ? copy.active : copy.bleUnavailable}`);
      }),
      transport.onLanPeerDiscovered(({ serviceName }) => {
        addEvent(`${copy.lanFound}: ${serviceName}`);
        void transport.connectLanPeer(serviceName).catch(() => undefined);
      }),
      pairing.onDevicesChanged((count) => setPairedDeviceCount(count)),
      webrtc.on("linkConnected", ({ linkID }) => {
        setWebrtcLinkID(linkID);
        addEvent(`${copy.webrtcConnected}: ${linkID}`);
      }),
      webrtc.on("linkDisconnected", ({ linkID }) => {
        setWebrtcLinkID(undefined);
        addEvent(`${copy.webrtcDisconnected}: ${linkID}`);
      }),
      webrtc.on("packetReceived", ({ linkID, data }) => {
        addEvent(`${copy.received}: webrtc ${linkID} · ${data.byteLength} ${copy.bytes} · ${new TextDecoder().decode(data)}`);
      }),
      webrtc.on("error", ({ error }) => addEvent(error.message)),
    ];
    if (Platform.OS === "ios") {
      void pairing.getState().then((state) => {
        setPairingSupported(state.supported);
        setPairedDeviceCount(state.count);
      });
    }
    return () => {
      for (const subscription of subscriptions.current) subscription.remove();
      webrtc.dispose();
      signaling.dispose();
      void transport.dispose();
    };
  }, [pairing, signaling, transport, webrtc]);

  const presentPairing = async (mode: WiFiPairingMode) => {
    if (!pairingSupported) {
      Alert.alert(copy.error, copy.pairingUnsupported);
      return;
    }
    try {
      await pairing.present(
        mode,
        {
          action: mode === "find" ? copy.pairingActionFind : copy.pairingActionDiscoverable,
          cancel: copy.pairingCancel,
          unavailable: copy.pairingUnavailable,
        },
        {
          bg: theme.color.background,
          surface: theme.color.surface,
          border: theme.color.border,
          textPrimary: theme.color.text,
          textMuted: theme.color.muted,
        },
      );
      const state = await pairing.getState();
      setPairedDeviceCount(state.count);
      if (state.count > 0 && running) await transport.startWifi();
    } catch (error) {
      addEvent(error instanceof Error ? error.message : String(error));
    }
  };

  const toggleBle = async () => {
    try {
      if (running) {
        setStatus(copy.stopping);
        await transport.stopBle();
        setRunning(false);
        setStatus(copy.bleStopped);
        refreshLinks();
        return;
      }
      const granted = await requestAndroidPermissions();
      setPermissionGranted(granted);
      if (!granted) {
        Alert.alert(copy.error, copy.permissionDenied);
        return;
      }
      setStatus(copy.bleStarting);
      // startBle performs both halves of discovery: GATT peripheral advertising
      // and GATT central scanning. Run this on both physical devices.
      await transport.startBle();
      setRunning(true);
      setStatus(copy.bleRunning);
    } catch (error) {
      setStatus(copy.error);
      addEvent(error instanceof Error ? error.message : String(error));
    }
  };

  const startAccelerators = async () => {
    await Promise.allSettled([transport.startLan(), transport.startWifi()]);
    addEvent(copy.acceleratorsStarted);
  };

  const connectWebRTC = async () => {
    const ble = links.find(({ linkID, kind }) => linkID === selectedLinkID && kind === "ble");
    if (!ble) {
      Alert.alert(copy.error, copy.noBleForWebRTC);
      return;
    }
    await webrtc.connect(ble.linkID);
    addEvent(copy.webrtcConnecting);
  };

  const sendWebRTC = async () => {
    if (!webrtcLinkID) {
      Alert.alert(copy.error, copy.noLink);
      return;
    }
    const bytes = new TextEncoder().encode(message);
    await webrtc.write(webrtcLinkID, bytes);
    addEvent(`${copy.sent}: webrtc ${webrtcLinkID} · ${bytes.byteLength} ${copy.bytes} · ${message}`);
    setMessage("");
  };

  const send = async () => {
    const link = links.find(({ linkID }) => linkID === selectedLinkID);
    if (!link) {
      Alert.alert(copy.error, copy.noLink);
      return;
    }
    const result = await transport.write(link.linkID, new TextEncoder().encode(message));
    if (result.ok) {
      addEvent(`${copy.sent}: ${link.kind} ${link.linkID} · ${new TextEncoder().encode(message).byteLength} ${copy.bytes} · ${message}`);
      setMessage("");
    } else {
      addEvent(result.error ?? copy.error);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.container}>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.subtitle}>{copy.subtitle}</Text>
        <Text style={styles.sectionTitle}>{copy.bleDemo}</Text>
        <View style={styles.flowCard}>
          <FlowStep label={copy.stepPermissions} state={permissionGranted ? copy.complete : copy.pending} complete={permissionGranted} />
          <FlowStep label={copy.stepRadio} state={running ? copy.active : copy.pending} complete={running} />
          <FlowStep label={copy.stepConnection} state={links.some(({ kind }) => kind === "ble") ? copy.complete : copy.pending} complete={links.some(({ kind }) => kind === "ble")} />
          <FlowStep label={copy.stepTransfer} state={selectedLinkID ? copy.active : copy.pending} complete={Boolean(selectedLinkID)} />
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.status}>{status}</Text>
          <Pressable accessibilityRole="button" onPress={() => void toggleBle()} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>{running ? copy.stopBle : copy.startBle}</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>{copy.messageLabel}</Text>
        <View style={styles.composer}>
          <TextInput
            placeholder={copy.messagePlaceholder}
            placeholderTextColor={theme.color.muted}
            value={message}
            onChangeText={setMessage}
            style={styles.input}
          />
          <Pressable accessibilityRole="button" disabled={!message} onPress={() => void send()} style={[styles.sendButton, !message && styles.disabled]}>
            <Text style={styles.sendText}>{copy.send}</Text>
          </Pressable>
        </View>

        {Platform.OS === "ios" ? (
          <View style={styles.pairingCard}>
            <Text style={styles.sectionTitle}>{copy.wifiAwarePairing}</Text>
            <Text style={styles.body}>{`${copy.pairedDevices}: ${pairedDeviceCount}`}</Text>
            <View style={styles.pairingActions}>
              <Pressable accessibilityRole="button" onPress={() => void presentPairing("discoverable")} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>{copy.becomeDiscoverable}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => void presentPairing("find")} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>{copy.findDevice}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>{copy.links}</Text>
        <Text style={styles.hint}>{copy.tapToSelect}</Text>
        {links.length ? links.map((link) => (
          <Pressable
            accessibilityRole="button"
            key={link.linkID}
            onPress={() => setSelectedLinkID(link.linkID)}
            style={[styles.linkCard, selectedLinkID === link.linkID && styles.linkCardSelected]}
          >
            <Text style={styles.linkTitle}>{`${link.kind.toUpperCase()}${selectedLinkID === link.linkID ? ` · ${copy.selected}` : ""}`}</Text>
            <Text style={styles.linkDetail}>{link.linkID}</Text>
            {link.role ? <Text style={styles.linkDetail}>{`${copy.role}: ${link.role}${link.rssi === undefined ? "" : ` · ${copy.rssi}: ${link.rssi}`}`}</Text> : null}
          </Pressable>
        )) : <Text style={styles.body}>{copy.noLinks}</Text>}

        <Text style={styles.sectionTitle}>{copy.accelerators}</Text>
        <Pressable accessibilityRole="button" onPress={() => void startAccelerators()} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>{copy.startAccelerators}</Text>
        </Pressable>

        <Text style={styles.sectionTitle}>{copy.webrtc}</Text>
        <Text style={styles.hint}>{copy.webrtcHint}</Text>
        <View style={styles.pairingActions}>
          <Pressable accessibilityRole="button" onPress={() => void connectWebRTC()} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>{copy.connectWebRTC}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={!message || !webrtcLinkID} onPress={() => void sendWebRTC()} style={[styles.secondaryButton, (!message || !webrtcLinkID) && styles.disabled]}>
            <Text style={styles.secondaryButtonText}>{copy.sendWebRTC}</Text>
          </Pressable>
        </View>
        <Text style={styles.sectionTitle}>{copy.events}</Text>
        <FlatList
          data={events}
          keyExtractor={(item) => String(item.id)}
          ListEmptyComponent={<Text style={styles.body}>{copy.noEvents}</Text>}
          renderItem={({ item }) => <Text style={styles.event}>{item.text}</Text>}
        />
      </View>
    </SafeAreaView>
  );
}

function FlowStep({ label, state, complete }: { label: string; state: string; complete: boolean }) {
  return (
    <View style={styles.flowRow}>
      <View style={[styles.flowDot, complete && styles.flowDotComplete]} />
      <Text style={styles.flowLabel}>{label}</Text>
      <Text style={[styles.flowState, complete && styles.flowStateComplete]}>{state}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.color.background },
  container: { flex: 1, padding: theme.space.lg, gap: theme.space.sm },
  title: { color: theme.color.text, fontSize: theme.font.lg, fontWeight: "700" },
  subtitle: { color: theme.color.muted, fontSize: theme.font.sm },
  statusRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginTop: theme.space.md },
  status: { color: theme.color.accent, flex: 1, fontSize: theme.font.sm },
  primaryButton: { alignItems: "center", backgroundColor: theme.color.accent, borderRadius: theme.radius.sm, justifyContent: "center", minHeight: theme.touch, paddingHorizontal: theme.space.lg },
  primaryButtonText: { color: theme.color.background, fontSize: theme.font.md, fontWeight: "700" },
  sectionTitle: { color: theme.color.text, fontSize: theme.font.md, fontWeight: "600", marginTop: theme.space.md },
  flowCard: { backgroundColor: theme.color.surface, borderColor: theme.color.border, borderRadius: theme.radius.md, borderWidth: 1, padding: theme.space.md },
  flowRow: { alignItems: "center", flexDirection: "row", minHeight: 34 },
  flowDot: { backgroundColor: theme.color.border, borderRadius: 5, height: 10, marginEnd: theme.space.sm, width: 10 },
  flowDotComplete: { backgroundColor: theme.color.accent },
  flowLabel: { color: theme.color.text, flex: 1, fontSize: theme.font.sm },
  flowState: { color: theme.color.muted, fontSize: theme.font.sm },
  flowStateComplete: { color: theme.color.accent },
  composer: { flexDirection: "row", gap: theme.space.sm },
  input: { backgroundColor: theme.color.surface, borderColor: theme.color.border, borderRadius: theme.radius.sm, borderWidth: 1, color: theme.color.text, flex: 1, minHeight: theme.touch, paddingHorizontal: theme.space.md },
  sendButton: { alignItems: "center", backgroundColor: theme.color.accent, borderRadius: theme.radius.sm, justifyContent: "center", minHeight: theme.touch, paddingHorizontal: theme.space.md },
  sendText: { color: theme.color.background, fontWeight: "700" },
  disabled: { opacity: 0.45 },
  body: { backgroundColor: theme.color.surface, borderRadius: theme.radius.md, color: theme.color.muted, fontSize: theme.font.sm, padding: theme.space.md },
  hint: { color: theme.color.muted, fontSize: theme.font.sm },
  linkCard: { backgroundColor: theme.color.surface, borderColor: theme.color.border, borderRadius: theme.radius.sm, borderWidth: 1, padding: theme.space.md },
  linkCardSelected: { borderColor: theme.color.accent },
  linkTitle: { color: theme.color.text, fontSize: theme.font.sm, fontWeight: "700" },
  linkDetail: { color: theme.color.muted, fontSize: theme.font.sm, marginTop: theme.space.xs },
  event: { borderBottomColor: theme.color.border, borderBottomWidth: 1, color: theme.color.muted, fontSize: theme.font.sm, paddingVertical: theme.space.sm },
  pairingCard: { gap: theme.space.sm },
  pairingActions: { flexDirection: "row", gap: theme.space.sm },
  secondaryButton: { alignItems: "center", borderColor: theme.color.accent, borderRadius: theme.radius.sm, borderWidth: 1, flex: 1, justifyContent: "center", minHeight: theme.touch, paddingHorizontal: theme.space.sm },
  secondaryButtonText: { color: theme.color.accent, fontSize: theme.font.sm, fontWeight: "600", textAlign: "center" },
});
