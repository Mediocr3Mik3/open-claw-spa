# OpenClaw SPA — Signed Prompt Architecture

Cryptographic authorization layer for [OpenClaw](https://github.com/openclaw) AI agents.

SPA prevents prompt injection attacks by requiring **signed envelopes** for sensitive tool calls. Every gated action (file writes, shell commands, API calls, etc.) requires a cryptographically verified prompt signed by a registered key.

## Why SPA?

AI agents that can execute tools are powerful — and dangerous. Without authorization:
- Injected prompts can trick agents into running shell commands
- Untrusted content can escalate privileges
- There's no audit trail of who authorized what

SPA solves this by treating **prompts like API requests**: each one can be signed, verified, and gated.

## Architecture

```
User → [Sign prompt with private key] → SPA1: token
                                            ↓
OpenClaw Gateway → [SPAProcessor verifies signature]
                        ↓                    ↓
                   Valid + Authorized    Invalid/Unauthorized
                        ↓                    ↓
                   Execute tools          Block & log
```

## Quick Start

```bash
# Install
npm install

# Generate a signing key
npx tsx src/cli/main.ts keygen --label "My Key" --level elevated --algorithm ecdsa-p384

# Sign a prompt
npx tsx src/cli/main.ts sign --text "deploy to production" --key-id <YOUR_KEY_ID> --level elevated

# Verify a token
npx tsx src/cli/main.ts verify --token "SPA1:..."

# List keys
npx tsx src/cli/main.ts list

# List gated actions
npx tsx src/cli/main.ts gates
```

## Monorepo Structure

```
openclaw-spa/
├── package.json
├── tsconfig.json
├── README.md
├── skill/SKILL.md              # Agent behavior rules
├── src/
│   ├── types.ts                # Core type definitions
│   ├── index.ts                # Barrel export
│   ├── crypto/
│   │   ├── key-manager.ts      # Key generation, registry CRUD
│   │   └── envelope.ts         # Sign, verify, serialize envelopes
│   ├── gates/
│   │   └── registry.ts         # Action → auth level mapping
│   ├── middleware/
│   │   └── gateway-plugin.ts   # SPAProcessor + Express middleware
│   ├── cli/
│   │   └── main.ts             # CLI commands
│   ├── messaging/
│   │   ├── types.ts            # Channel message types
│   │   ├── identity.ts         # Channel → SPA key bindings
│   │   ├── bridge.ts           # Message processing bridge
│   │   ├── server.ts           # Unified HTTP server
│   │   └── adapters/
│   │       ├── whatsapp.ts     # WhatsApp Business API
│   │       ├── signal.ts       # Signal (via signal-cli)
│   │       ├── telegram.ts     # Telegram Bot API
│   │       └── discord.ts      # Discord Gateway + REST
│   ├── desktop/                # ⚠️ UNTESTED
│   │   ├── main/
│   │   │   ├── index.ts        # Electron main process
│   │   │   └── preload.ts      # Secure IPC bridge
│   │   └── renderer/
│   │       ├── index.html
│   │       ├── main.tsx        # Entry point
│   │       └── App.tsx         # React chat UI
│   └── mobile/                 # ⚠️ UNTESTED
│       ├── crypto/
│       │   └── spa.ts          # On-device crypto + biometrics
│       ├── hooks/
│       │   └── useGateway.ts   # WebSocket gateway hook
│       └── screens/
│           └── ChatScreen.tsx  # React Native chat UI
```

## Security Features

| Feature | Description |
|---|---|
| **ECDSA P-384** | Default signing algorithm (fast, strong) |
| **RSA-4096** | Supported for wider compatibility |
| **Bounded nonce cache** | LRU cache prevents memory exhaustion DoS |
| **Replay protection** | Nonce + timestamp freshness checks |
| **Rate limiting** | Per-key rate limits prevent abuse |
| **Admin API key** | `/admin/register-identity` requires Bearer token |
| **CSP headers** | All responses include security headers |
| **Schema validation** | Envelope payloads validated before crypto ops |
| **Key fingerprints** | SHA-256 fingerprints logged, never raw PEMs |
| **Secure key storage** | Private keys stored with 0o600 permissions |

## Messaging Bridge

The messaging bridge connects WhatsApp, Signal, Telegram, and Discord to your OpenClaw instance with SPA verification.

```bash
# Set environment variables (see src/messaging/server.ts for full list)
export SPA_ADMIN_API_KEY="your-secret-api-key"
export TELEGRAM_BOT_TOKEN="your-bot-token"

# Start the bridge
npx tsx src/messaging/server.ts
```

**Two signing modes:**
- **Mode A (Server-signed):** Bridge holds private keys, signs on behalf of registered senders. Simpler but less secure.
- **Mode B (Client-signed):** User's app signs messages before sending. Bridge only verifies. Recommended.

## Gate Registry

Tools are gated by authorization level:

- **admin** — `shell_exec`, `system_command`, `sudo`, `process_kill`, `env_set`, `key_revoke`, ...
- **elevated** — `file_write`, `file_delete`, `email_send`, `api_call`, `git_push`, `deploy`, ...
- **standard** — `search`, `read`, `summarize`, `ask_user` (ungated, no signature needed)

Customize gates via `~/.openclaw-spa/gates.json` or programmatically.

## Desktop & Mobile Apps

> ⚠️ **UNTESTED** — The desktop (Electron) and mobile (React Native/Expo) apps are included for ease of use. I built this project in about an hour, so these haven't been tested yet. They should work in theory but may need adjustments. PRs welcome!

**Desktop features:** Electron app with OS keychain storage, WebSocket gateway, dark-theme chat UI.

**Mobile features:** On-device RSA key generation, biometric auth for elevated/admin prompts, WebSocket connection, React Native chat UI.

## Environment Variables

| Variable | Description |
|---|---|
| `SPA_KEY_REGISTRY` | Path to key registry JSON (default: `~/.openclaw-spa/keys.json`) |
| `SPA_GATE_REGISTRY` | Path to gate registry JSON (default: `~/.openclaw-spa/gates.json`) |
| `SPA_ADMIN_API_KEY` | **Required** for admin endpoints |
| `WHATSAPP_API_TOKEN` | WhatsApp Business API token |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp phone number ID |
| `WHATSAPP_VERIFY_TOKEN` | WhatsApp webhook verify token |
| `SIGNAL_API_URL` | signal-cli REST API URL |
| `SIGNAL_PHONE_NUMBER` | Your Signal phone number |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token |
| `TELEGRAM_ALLOWED_CHATS` | Comma-separated allowed chat IDs |
| `DISCORD_BOT_TOKEN` | Discord bot token |
| `DISCORD_ALLOWED_GUILDS` | Comma-separated allowed guild IDs |
| `PORT` | Server port (default: 3210) |

## Integration

```typescript
import { createSPAMiddleware } from "openclaw-spa";
import express from "express";

const app = express();
app.use(express.json());

// Add SPA verification to your message endpoint
app.use("/message", createSPAMiddleware({
  key_registry_path: ".spa/keys.json",
  verbose: true,
}));

app.post("/message", (req, res) => {
  const spa = req.spa; // ProcessedMessage
  // ... handle verified message
});
```

## License

MIT
