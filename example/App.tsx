import "react-native-get-random-values";

import {
  AirhopTransport,
  type TransportKind,
  type TransportSubscription,
} from "@htyf-mp/airhop-transport";
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

interface LinkRow { linkID: string; kind: TransportKind }
interface EventRow { id: number; text: string }

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
  const subscriptions = useRef<TransportSubscription[]>([]);
  const eventID = useRef(0);
  const [status, setStatus] = useState<string>(copy.stopped);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);

  const addEvent = (text: string) => {
    eventID.current += 1;
    setEvents((current) => [{ id: eventID.current, text }, ...current].slice(0, 30));
  };
  const refreshLinks = () => setLinks([...transport.getLinks()]);

  useEffect(() => {
    subscriptions.current = [
      transport.on("linkConnected", ({ linkID, kind }) => {
        addEvent(`${copy.connected}: ${kind} ${linkID}`);
        refreshLinks();
      }),
      transport.on("linkDisconnected", ({ linkID, kind }) => {
        addEvent(`${copy.disconnected}: ${kind} ${linkID}`);
        refreshLinks();
      }),
      transport.on("packetReceived", ({ linkID, kind, data }) => {
        addEvent(`${copy.received}: ${kind} ${linkID} · ${new TextDecoder().decode(data)}`);
      }),
      transport.onLanPeerDiscovered(({ serviceName }) => {
        addEvent(`${copy.lanFound}: ${serviceName}`);
        void transport.connectLanPeer(serviceName).catch(() => undefined);
      }),
    ];
    return () => {
      for (const subscription of subscriptions.current) subscription.remove();
      void transport.dispose();
    };
  }, [transport]);

  const toggle = async () => {
    try {
      if (running) {
        setStatus(copy.stopping);
        await transport.stopAll();
        setRunning(false);
        setStatus(copy.stopped);
        refreshLinks();
        return;
      }
      if (!(await requestAndroidPermissions())) {
        Alert.alert(copy.error, copy.permissionDenied);
        return;
      }
      setStatus(copy.starting);
      await transport.startAll();
      setRunning(true);
      setStatus(copy.running);
    } catch (error) {
      setStatus(copy.error);
      addEvent(error instanceof Error ? error.message : String(error));
    }
  };

  const send = async () => {
    const link = links[0];
    if (!link) {
      Alert.alert(copy.error, copy.noLink);
      return;
    }
    const result = await transport.write(link.linkID, new TextEncoder().encode(message));
    if (result.ok) {
      addEvent(`${copy.sent}: ${link.kind} ${link.linkID} · ${message}`);
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
        <View style={styles.statusRow}>
          <Text style={styles.status}>{status}</Text>
          <Pressable accessibilityRole="button" onPress={() => void toggle()} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>{running ? copy.stop : copy.start}</Text>
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

        <Text style={styles.sectionTitle}>{copy.links}</Text>
        <Text style={styles.body}>{links.length ? links.map((link) => `${link.kind}: ${link.linkID}`).join("\n") : copy.noLinks}</Text>
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
  composer: { flexDirection: "row", gap: theme.space.sm },
  input: { backgroundColor: theme.color.surface, borderColor: theme.color.border, borderRadius: theme.radius.sm, borderWidth: 1, color: theme.color.text, flex: 1, minHeight: theme.touch, paddingHorizontal: theme.space.md },
  sendButton: { alignItems: "center", backgroundColor: theme.color.accent, borderRadius: theme.radius.sm, justifyContent: "center", minHeight: theme.touch, paddingHorizontal: theme.space.md },
  sendText: { color: theme.color.background, fontWeight: "700" },
  disabled: { opacity: 0.45 },
  body: { backgroundColor: theme.color.surface, borderRadius: theme.radius.md, color: theme.color.muted, fontSize: theme.font.sm, padding: theme.space.md },
  event: { borderBottomColor: theme.color.border, borderBottomWidth: 1, color: theme.color.muted, fontSize: theme.font.sm, paddingVertical: theme.space.sm },
});
