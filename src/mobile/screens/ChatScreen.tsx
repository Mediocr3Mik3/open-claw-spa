/**
 * openclaw-spa — Mobile Chat Screen (React Native)
 *
 * ⚠️  UNTESTED — included for ease of use. See README for details.
 *
 * Features:
 *   - Live WebSocket connection to OpenClaw gateway
 *   - Per-message auth level selector
 *   - Biometric auth before elevated/admin messages
 *   - Message signed indicators
 *   - Connection status bar
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useGateway } from "../hooks/useGateway.js";
import {
  signPromptMobile,
  listMobileKeys,
  generateMobileKeyPair,
  type MobileKeyPair,
} from "../crypto/spa.js";

// ─── Types ───────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  text: string;
  sender: "user" | "agent";
  auth_level?: string;
  signed: boolean;
  timestamp: string;
}

type AuthLevel = "standard" | "elevated" | "admin";

// ─── Component ───────────────────────────────────────────────────────────

export default function ChatScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [authLevel, setAuthLevel] = useState<AuthLevel>("standard");
  const [activeKey, setActiveKey] = useState<MobileKeyPair | null>(null);
  const msgCounter = useRef(0);
  const flatListRef = useRef<FlatList>(null);

  const gatewayUrl = "ws://localhost:3210/ws"; // TODO: make configurable
  const { status, send, lastMessage } = useGateway(gatewayUrl);

  // Load keys on mount
  useEffect(() => {
    loadKeys();
  }, []);

  // Handle incoming messages
  useEffect(() => {
    if (lastMessage?.text) {
      msgCounter.current++;
      setMessages((prev) => [
        ...prev,
        {
          id: String(msgCounter.current),
          text: lastMessage.text!,
          sender: "agent",
          signed: false,
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  }, [lastMessage]);

  const loadKeys = async () => {
    const keys = await listMobileKeys();
    if (keys.length > 0) {
      setActiveKey(keys[0]!);
    }
  };

  const handleGenerateKey = async () => {
    try {
      const key = await generateMobileKeyPair();
      setActiveKey(key);
      Alert.alert("Key Generated", `Key ID: ${key.key_id.slice(0, 8)}...`);
    } catch (err) {
      Alert.alert("Error", `Key generation failed: ${err}`);
    }
  };

  const handleSend = useCallback(async () => {
    if (!input.trim()) return;
    const text = input.trim();
    setInput("");

    let token: string | undefined;
    let signed = false;

    // Sign if elevated/admin and we have a key
    if (authLevel !== "standard" && activeKey) {
      try {
        token = await signPromptMobile({
          text,
          auth_level: authLevel,
          key_id: activeKey.key_id,
          require_biometric: true,
        });
        signed = true;
      } catch (err) {
        Alert.alert("Signing Failed", String(err));
        return;
      }
    }

    msgCounter.current++;
    const msg: ChatMessage = {
      id: String(msgCounter.current),
      text,
      sender: "user",
      auth_level: authLevel,
      signed,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, msg]);

    // Send via WebSocket
    send({
      type: "message",
      text: token ? `${token} ${text}` : text,
    });
  }, [input, authLevel, activeKey, send]);

  // ─── Auth Level Selector ─────────────────────────────────────────────

  const levelColors: Record<AuthLevel, string> = {
    standard: "#6b7280",
    elevated: "#f59e0b",
    admin: "#ef4444",
  };

  const cycleAuthLevel = () => {
    const levels: AuthLevel[] = ["standard", "elevated", "admin"];
    const idx = levels.indexOf(authLevel);
    setAuthLevel(levels[(idx + 1) % levels.length]!);
  };

  // ─── Render ──────────────────────────────────────────────────────────

  const renderMessage = ({ item }: { item: ChatMessage }) => (
    <View
      style={[
        styles.messageBubble,
        item.sender === "user" ? styles.userBubble : styles.agentBubble,
      ]}
    >
      <View style={styles.messageHeader}>
        {item.auth_level && (
          <View style={[styles.levelBadge, { backgroundColor: levelColors[item.auth_level as AuthLevel] ?? "#6b7280" }]}>
            <Text style={styles.levelBadgeText}>{item.auth_level}</Text>
          </View>
        )}
        {item.signed && (
          <View style={styles.signedBadge}>
            <Text style={styles.signedBadgeText}>signed</Text>
          </View>
        )}
      </View>
      <Text style={styles.messageText}>{item.text}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Status Bar */}
      <View style={[styles.statusBar, { backgroundColor: status === "connected" ? "#166534" : "#991b1b" }]}>
        <Text style={styles.statusText}>
          {status === "connected" ? "Connected to OpenClaw" : `Gateway: ${status}`}
        </Text>
        {!activeKey && (
          <TouchableOpacity onPress={handleGenerateKey}>
            <Text style={styles.generateKeyText}>Generate Key</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
      />

      {/* Input Bar */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.inputBar}
      >
        <TouchableOpacity
          style={[styles.levelButton, { backgroundColor: levelColors[authLevel] }]}
          onPress={cycleAuthLevel}
        >
          <Text style={styles.levelButtonText}>
            {authLevel.charAt(0).toUpperCase()}
          </Text>
        </TouchableOpacity>
        <TextInput
          style={styles.textInput}
          value={input}
          onChangeText={setInput}
          placeholder="Type a message..."
          placeholderTextColor="#666"
          returnKeyType="send"
          onSubmitEditing={handleSend}
        />
        <TouchableOpacity style={styles.sendButton} onPress={handleSend}>
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a" },
  statusBar: { paddingHorizontal: 16, paddingVertical: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statusText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  generateKeyText: { color: "#93c5fd", fontSize: 12, fontWeight: "600" },
  messageList: { padding: 16, paddingBottom: 8 },
  messageBubble: { maxWidth: "80%", padding: 10, borderRadius: 12, marginBottom: 8 },
  userBubble: { alignSelf: "flex-end", backgroundColor: "#1e3a5f" },
  agentBubble: { alignSelf: "flex-start", backgroundColor: "#1e1e2e" },
  messageHeader: { flexDirection: "row", gap: 6, marginBottom: 4 },
  levelBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  levelBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  signedBadge: { backgroundColor: "#22c55e", paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  signedBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  messageText: { color: "#e0e0e0", fontSize: 15, lineHeight: 20 },
  inputBar: { flexDirection: "row", padding: 12, borderTopWidth: 1, borderTopColor: "#2a2a3a", alignItems: "center", gap: 8 },
  levelButton: { width: 36, height: 36, borderRadius: 18, justifyContent: "center", alignItems: "center" },
  levelButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  textInput: { flex: 1, backgroundColor: "#1a1a2a", borderWidth: 1, borderColor: "#3a3a4a", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, color: "#e0e0e0", fontSize: 15 },
  sendButton: { backgroundColor: "#3b82f6", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  sendButtonText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
