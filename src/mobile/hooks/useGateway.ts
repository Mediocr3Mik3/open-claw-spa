/**
 * openclaw-spa — Mobile Gateway Hook
 *
 * ⚠️  UNTESTED — included for ease of use. See README for details.
 *
 * React hook for managing WebSocket connection to the OpenClaw gateway.
 * Handles connection state, reconnection with exponential backoff,
 * message parsing, and sending messages.
 */

import { useState, useEffect, useRef, useCallback } from "react";

export type ConnectionStatus = "connected" | "connecting" | "disconnected" | "error";

export interface GatewayMessage {
  type: string;
  text?: string;
  data?: unknown;
}

export interface UseGatewayResult {
  status: ConnectionStatus;
  send: (message: string | object) => void;
  lastMessage: GatewayMessage | null;
  reconnect: () => void;
}

export function useGateway(url: string): UseGatewayResult {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [lastMessage, setLastMessage] = useState<GatewayMessage | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const retryCount = useRef(0);
  const maxRetries = 10;

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus("connecting");

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus("connected");
        retryCount.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data)) as GatewayMessage;
          setLastMessage(data);
        } catch {
          setLastMessage({ type: "raw", text: String(event.data) });
        }
      };

      ws.onclose = () => {
        setStatus("disconnected");
        wsRef.current = null;

        // Exponential backoff reconnect
        if (retryCount.current < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, retryCount.current), 30000);
          retryCount.current++;
          setTimeout(() => connect(), delay);
        }
      };

      ws.onerror = () => {
        setStatus("error");
      };
    } catch {
      setStatus("error");
    }
  }, [url]);

  const send = useCallback((message: string | object) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    const payload = typeof message === "string" ? message : JSON.stringify(message);
    wsRef.current.send(payload);
  }, []);

  const reconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    retryCount.current = 0;
    connect();
  }, [connect]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  return { status, send, lastMessage, reconnect };
}
