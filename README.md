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
│   │       ├── discord.ts      # Discord Gateway + REST
│   │       ├── imessage.ts     # iMessage (macOS AppleScript)
│   │       ├── slack.ts        # Slack Socket Mode + Web API
│   │       ├── sms.ts          # SMS/MMS via Twilio
│   │       ├── email.ts        # Email via IMAP/SMTP
│   │       ├── teams.ts        # Microsoft Teams Bot Framework
│   │       ├── matrix.ts       # Matrix Client-Server API
│   │       ├── irc.ts          # IRC raw socket
│   │       ├── messenger.ts    # Facebook Messenger Graph API
│   │       ├── googlechat.ts   # Google Chat Workspace API
│   │       ├── x.ts            # X (Twitter) DM API v2
│   │       ├── line.ts         # LINE Messaging API
│   │       ├── wechat.ts       # WeChat Official Account API
│   │       └── webhook.ts      # Generic webhook (catch-all)
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

The messaging bridge connects **17 platforms** to your OpenClaw instance with SPA verification.

| Adapter | Platform | Method |
|---|---|---|
| `whatsapp.ts` | WhatsApp | Business Cloud API webhooks |
| `signal.ts` | Signal | signal-cli REST API polling |
| `telegram.ts` | Telegram | Bot API webhooks + long-poll |
| `discord.ts` | Discord | Gateway WebSocket + REST |
| `imessage.ts` | iMessage | macOS AppleScript + chat.db *(macOS-only)* |
| `slack.ts` | Slack | Socket Mode + Web API |
| `sms.ts` | SMS/MMS | Twilio REST API |
| `email.ts` | Email | IMAP polling + SMTP sending |
| `teams.ts` | Microsoft Teams | Bot Framework REST |
| `matrix.ts` | Matrix | Client-Server API long-poll |
| `irc.ts` | IRC | Raw TCP/TLS socket |
| `messenger.ts` | Facebook Messenger | Meta Graph API webhooks |
| `googlechat.ts` | Google Chat | Workspace API + service account JWT |
| `x.ts` | X (Twitter) DMs | API v2 + OAuth 1.0a polling |
| `line.ts` | LINE | Messaging API webhooks |
| `wechat.ts` | WeChat | Official Account API *(China region)* |
| `webhook.ts` | **Any platform** | Generic HTTP webhook (catch-all) |

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
| `IMESSAGE_POLL_INTERVAL` | iMessage poll interval ms (default: 3000, macOS-only) |
| `IMESSAGE_ALLOWED_SENDERS` | Comma-separated allowed phone/email senders |
| `SLACK_BOT_TOKEN` | Slack bot OAuth token (xoxb-...) |
| `SLACK_APP_TOKEN` | Slack app-level token for Socket Mode (xapp-...) |
| `TWILIO_ACCOUNT_SID` | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token |
| `TWILIO_FROM_NUMBER` | Twilio phone number (E.164) |
| `EMAIL_IMAP_HOST` | IMAP server hostname |
| `EMAIL_SMTP_HOST` | SMTP server hostname |
| `EMAIL_USERNAME` | Email account username |
| `EMAIL_PASSWORD` | Email account password |
| `TEAMS_APP_ID` | Microsoft Teams App ID |
| `TEAMS_APP_PASSWORD` | Microsoft Teams App Password |
| `MATRIX_HOMESERVER_URL` | Matrix homeserver URL |
| `MATRIX_ACCESS_TOKEN` | Matrix bot access token |
| `MATRIX_USER_ID` | Matrix bot user ID |
| `IRC_SERVER` | IRC server hostname |
| `IRC_NICKNAME` | IRC bot nickname |
| `IRC_CHANNELS` | Comma-separated IRC channels |
| `MESSENGER_PAGE_ACCESS_TOKEN` | Facebook Messenger Page Access Token |
| `MESSENGER_APP_SECRET` | Facebook App Secret |
| `MESSENGER_VERIFY_TOKEN` | Facebook webhook verify token |
| `GOOGLE_CHAT_SA_PATH` | Google Chat service account JSON path |
| `X_BEARER_TOKEN` | X API v2 Bearer Token |
| `X_API_KEY` | X API Consumer Key |
| `X_API_SECRET` | X API Consumer Secret |
| `X_ACCESS_TOKEN` | X API Access Token |
| `X_ACCESS_TOKEN_SECRET` | X API Access Token Secret |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Channel Access Token |
| `LINE_CHANNEL_SECRET` | LINE Channel Secret |
| `WECHAT_APP_ID` | WeChat Official Account App ID |
| `WECHAT_APP_SECRET` | WeChat App Secret |
| `WECHAT_TOKEN` | WeChat verification token |
| `WEBHOOK_SHARED_SECRET` | Generic webhook HMAC shared secret |
| `WEBHOOK_REPLY_URL` | Generic webhook outbound reply URL |
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
