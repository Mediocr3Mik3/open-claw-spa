# ─── Stage 1: Build ──────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Copy dependency files first for layer caching
COPY package.json package-lock.json* ./

# Install all dependencies (including dev for tsc)
RUN npm ci --ignore-scripts

# Copy source
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npx tsc

# ─── Stage 2: Runtime ────────────────────────────────────────────────────
FROM node:20-slim

WORKDIR /app

# Install production dependencies only
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy built output from builder
COPY --from=builder /app/dist/ ./dist/

# Environment variables (all optional — configure via .env or docker-compose)
ENV PORT=3210
ENV SPA_ADMIN_API_KEY=""
ENV SPA_KEY_REGISTRY=""
ENV SPA_GATE_REGISTRY=""
ENV WHATSAPP_API_TOKEN=""
ENV WHATSAPP_PHONE_NUMBER_ID=""
ENV WHATSAPP_VERIFY_TOKEN=""
ENV SIGNAL_API_URL=""
ENV SIGNAL_PHONE_NUMBER=""
ENV TELEGRAM_BOT_TOKEN=""
ENV TELEGRAM_ALLOWED_CHATS=""
ENV DISCORD_BOT_TOKEN=""
ENV DISCORD_ALLOWED_GUILDS=""
ENV SLACK_BOT_TOKEN=""
ENV SLACK_APP_TOKEN=""
ENV TWILIO_ACCOUNT_SID=""
ENV TWILIO_AUTH_TOKEN=""
ENV TWILIO_FROM_NUMBER=""
ENV EMAIL_IMAP_HOST=""
ENV EMAIL_SMTP_HOST=""
ENV EMAIL_USERNAME=""
ENV EMAIL_PASSWORD=""
ENV TEAMS_APP_ID=""
ENV TEAMS_APP_PASSWORD=""
ENV MATRIX_HOMESERVER_URL=""
ENV MATRIX_ACCESS_TOKEN=""
ENV MATRIX_USER_ID=""
ENV IRC_SERVER=""
ENV IRC_NICKNAME=""
ENV IRC_CHANNELS=""
ENV MESSENGER_PAGE_ACCESS_TOKEN=""
ENV MESSENGER_APP_SECRET=""
ENV MESSENGER_VERIFY_TOKEN=""
ENV GOOGLE_CHAT_SA_PATH=""
ENV X_BEARER_TOKEN=""
ENV X_API_KEY=""
ENV X_API_SECRET=""
ENV X_ACCESS_TOKEN=""
ENV X_ACCESS_TOKEN_SECRET=""
ENV LINE_CHANNEL_ACCESS_TOKEN=""
ENV LINE_CHANNEL_SECRET=""
ENV WECHAT_APP_ID=""
ENV WECHAT_APP_SECRET=""
ENV WECHAT_TOKEN=""
ENV WEBHOOK_SHARED_SECRET=""
ENV WEBHOOK_REPLY_URL=""
ENV OPENAI_API_KEY=""
ENV ANTHROPIC_API_KEY=""
ENV GOOGLE_AI_API_KEY=""

EXPOSE 3210

# Start the messaging bridge
ENTRYPOINT ["node", "dist/messaging/server.js"]
