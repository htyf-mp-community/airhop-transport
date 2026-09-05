const assert = require("node:assert/strict");
const {
  decodeWebRTCFrame,
  frameWebRTCMessage,
} = require("../lib/commonjs/webrtc/message-framing.js");
const {
  AirhopSignalingAdapter,
} = require("../lib/commonjs/webrtc/signaling-adapter.js");
const {
  AirhopWebRTCTransport,
} = require("../lib/commonjs/webrtc/webrtc-transport.js");

class TestDataChannel {
  readyState = "connecting";
  bufferedAmount = 0;
  binaryType = "";
  bufferedAmountLowThreshold = 0;
  onopen = null;
  onclose = null;
  onerror = null;
  onmessage = null;
  onbufferedamountlow = null;
  sent = [];
  send(data) { this.sent.push(data); }
  close() { this.readyState = "closed"; }
}

class TestPeerConnection {
  connectionState = "new";
  localDescription = null;
  onicecandidate = null;
  onconnectionstatechange = null;
  ondatachannel = null;
  channel = new TestDataChannel();
  candidates = [];
  createDataChannel() { return this.channel; }
  async createOffer() { return { type: "offer", sdp: "offer-sdp" }; }
  async createAnswer() { return { type: "answer", sdp: "answer-sdp" }; }
  async setLocalDescription(value) { this.localDescription = value; }
  async setRemoteDescription(value) { this.remoteDescription = value; }
  async addIceCandidate(value) { this.candidates.push(value); }
  close() { this.connectionState = "closed"; }
}

async function main() {
  const source = Uint8Array.from({ length: 70_000 }, (_, index) => index % 251);
  const frames = frameWebRTCMessage(source, 42, 16 * 1024);
  assert.ok(frames.length > 1);
  const decoded = frames.map(decodeWebRTCFrame);
  assert.ok(decoded.every(Boolean));
  const rebuilt = new Uint8Array(source.length);
  let offset = 0;
  for (const frame of decoded) {
    rebuilt.set(frame.payload, offset);
    offset += frame.payload.length;
  }
  assert.deepEqual(rebuilt, source);

  let receiver;
  const channel = {
    async send(peerID, bytes) { receiver(peerID, bytes); },
    subscribe(listener) { receiver = listener; return { remove() {} }; },
  };
  const adapter = new AirhopSignalingAdapter(channel, { maxFrameBytes: 480 });
  let event;
  adapter.subscribe((value) => { event = value; });
  const longSdp = `v=0\n${"a=candidate:test\n".repeat(400)}`;
  await adapter.send("peer-b", {
    type: "description",
    description: { type: "offer", sdp: longSdp },
  });
  assert.deepEqual(event, {
    fromPeerID: "peer-b",
    signal: { type: "description", description: { type: "offer", sdp: longSdp } },
  });
  adapter.dispose();

  let signalListener;
  const sentSignals = [];
  const signaling = {
    async send(targetPeerID, signal) { sentSignals.push({ targetPeerID, signal }); },
    subscribe(listener) { signalListener = listener; return { remove() {} }; },
  };
  const connections = [];
  const transport = new AirhopWebRTCTransport({
    localPeerID: "peer-a",
    signaling,
    factory: {
      createPeerConnection() {
        const connection = new TestPeerConnection();
        connections.push(connection);
        return connection;
      },
    },
  });
  const linkID = await transport.connect("peer-b");
  assert.equal(linkID, "webrtc:peer-b");
  assert.equal(sentSignals[0].signal.description.type, "offer");
  await signalListener({
    fromPeerID: "peer-b",
    signal: { type: "description", description: { type: "answer", sdp: "answer-sdp" } },
  });
  connections[0].channel.readyState = "open";
  let connected = false;
  transport.on("linkConnected", () => { connected = true; });
  connections[0].channel.onopen();
  assert.equal(connected, true);

  const received = [];
  transport.on("packetReceived", ({ data }) => received.push(data));
  await transport.write(linkID, source);
  assert.ok(connections[0].channel.sent.length > 1);
  for (const frame of connections[0].channel.sent) {
    connections[0].channel.onmessage({ data: frame });
  }
  assert.deepEqual(received[0], source);
  transport.dispose();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
