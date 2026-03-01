/**
 * openclaw-spa — Window.spa global type declaration for renderer components
 */

import type { SetupDetection, KeyInfo, AuditEntry } from "./shared";

export {};

declare global {
  interface Window {
    spa: {
      setup: {
        isComplete: () => Promise<boolean>;
        complete: () => Promise<boolean>;
        checkNode: () => Promise<{ installed: boolean; version: string | null }>;
        getPlatform: () => Promise<{
          platform: string; arch: string; electron_version: string;
          node_version: string; safe_storage: boolean; spa_dir: string;
        }>;
      };
      config: {
        get: (key: string) => Promise<string | null>;
        set: (key: string, value: string) => Promise<boolean>;
        delete: (key: string) => Promise<boolean>;
        keys: () => Promise<string[]>;
        has: (key: string) => Promise<boolean>;
      };
      generateKey: (opts: { label: string; max_auth_level: string; algorithm?: string }) => Promise<{
        key_id: string; fingerprint: string; algorithm: string;
      }>;
      listKeys: () => Promise<KeyInfo[]>;
      revokeKey: (key_id: string) => Promise<boolean>;
      signMessage: (opts: { text: string; key_id: string; auth_level: string; requested_tools?: string[] }) => Promise<string>;
      sendMessage: (opts: { text: string; token?: string }) => Promise<{ sent: boolean; error?: string }>;
      gatewayStatus: () => Promise<{ connected: boolean }>;
      connectGateway: (url: string) => Promise<{ connecting: boolean }>;
      onGatewayStatus: (callback: (status: { connected: boolean }) => void) => void;
      onGatewayMessage: (callback: (data: unknown) => void) => void;
      bridge: {
        start: () => Promise<{ started: boolean }>;
        stop: () => Promise<{ stopped: boolean }>;
        status: () => Promise<{ running: boolean }>;
        onStatus: (callback: (status: { running: boolean; error?: string }) => void) => void;
        onLog: (callback: (log: { level: string; message: string }) => void) => void;
      };
      audit: {
        query: (opts: Record<string, unknown>) => Promise<AuditEntry[]>;
        stats: (since?: string) => Promise<Record<string, number>>;
        verifyChain: () => Promise<{ broken_at_id: number } | null>;
        count: () => Promise<number>;
        exportNDJSON: (opts?: Record<string, unknown>) => Promise<string>;
      };
      getVersion: () => Promise<string>;
      openExternal: (url: string) => Promise<void>;
      getPaths: () => Promise<Record<string, string>>;
      hardware: { profile: () => Promise<unknown>; quickProfile: () => Promise<unknown>; recommendations: () => Promise<unknown>; };
      llm: {
        switch: (opts: { provider_id: string; model_id: string }) => Promise<unknown>;
        status: () => Promise<unknown>;
        listProviders: () => Promise<unknown[]>;
        listModels: (providerId: string) => Promise<string[]>;
        allStatuses: () => Promise<unknown[]>;
        complete: (opts: { messages: { role: string; content: string }[]; options?: Record<string, unknown> }) => Promise<unknown>;
        onProviderEvent: (callback: (event: unknown) => void) => void;
      };
      vault: {
        list: () => Promise<unknown[]>;
        setKey: (keyName: string, value: string) => Promise<{ saved: boolean; warning?: string }>;
        removeKey: (keyName: string) => Promise<boolean>;
        hasKey: (keyName: string) => Promise<boolean>;
        configuredProviders: () => Promise<string[]>;
      };
      spend: {
        summary: (since?: string, until?: string) => Promise<unknown>;
        daily: (days?: number) => Promise<unknown[]>;
        budget: () => Promise<unknown>;
        setBudget: (config: Record<string, unknown>) => Promise<unknown>;
        recent: (limit?: number) => Promise<unknown[]>;
        onUpdate: (callback: (data: { total_usd: number; budget_percent: number }) => void) => void;
      };
      gates: {
        list: (filterLevel?: string) => Promise<unknown[]>;
        check: (tool: string, grantedLevel: string) => Promise<boolean>;
        requiredLevel: (tool: string) => Promise<string>;
        partition: (tools: string[], grantedLevel: string) => Promise<{ approved: string[]; blocked: string[] }>;
        set: (tool: string, requiredLevel: string, description: string) => Promise<boolean>;
        remove: (tool: string) => Promise<boolean>;
      };
      keyRotation: {
        rotate: (oldKeyId: string, opts?: { grace_period_hours?: number; label?: string; algorithm?: string }) => Promise<unknown>;
        chain: (keyId: string) => Promise<unknown[]>;
        pending: () => Promise<unknown[]>;
        finalize: () => Promise<string[]>;
      };
      rateLimiter: { check: (sourceId: string) => Promise<boolean>; recordFailure: (sourceId: string) => Promise<boolean>; };
      org: {
        create: (name: string) => Promise<unknown>;
        get: (orgId: string) => Promise<unknown>;
        list: () => Promise<unknown[]>;
        addMember: (opts: { org_id: string; user_id: string; display_name: string; role: string; spa_key_id?: string }) => Promise<unknown>;
        listMembers: (orgId: string) => Promise<unknown[]>;
        updateRole: (memberId: string, newRole: string) => Promise<boolean>;
        removeMember: (memberId: string) => Promise<boolean>;
        bindKey: (memberId: string, spaKeyId: string) => Promise<boolean>;
      };
      models: {
        all: () => Promise<unknown[]>;
        local: () => Promise<unknown[]>;
        api: () => Promise<unknown[]>;
        find: (modelId: string) => Promise<unknown>;
        byProvider: (providerId: string) => Promise<unknown[]>;
        byStrength: (strength: string) => Promise<unknown[]>;
        estimateCost: (modelId: string, inputTokens: number, outputTokens: number) => Promise<number | null>;
      };
      runtime: {
        detect: () => Promise<unknown[]>;
        downloadUrl: (runtimeName: string) => Promise<string | null>;
        openDownload: (runtimeName: string) => Promise<{ opened: boolean; url?: string; error?: string }>;
        start: (runtimeName: string) => Promise<{ started: boolean; error?: string }>;
        stop: (runtimeName: string) => Promise<{ stopped: boolean; error?: string }>;
        health: (endpoint: string) => Promise<{ available: boolean; status?: number }>;
      };
      autoSetup: {
        detect: () => Promise<SetupDetection>;
        installRuntime: (runtimeName: string) => Promise<{ success: boolean; method?: string; url?: string; error?: string }>;
      };
      onIntrusionAlert: (callback: (alert: unknown) => void) => void;
    };
  }
}
