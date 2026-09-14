---
sidebar_position: 12
title: "Pipe Script Output to Messaging Platforms"
description: "Send text from any shell script, cron job, CI hook, or monitoring daemon to Telegram, Discord, Slack, Signal, and other platforms using `missher send`."
---

# Pipe Script Output to Messaging Platforms

`missher send` is a small, scriptable CLI that pushes a message to any
messaging platform Missher is already configured for. Think of it as a
cross-platform `curl` for notifications — you don't need a running
gateway, you don't need an LLM, and you don't need to re-paste bot tokens
into each of your scripts.

Use it for:

- System monitoring (memory, disk, GPU temp, long-running job finished)
- CI/CD notifications (deploy done, test failure)
- Cron scripts that need to ping you with results
- Quick one-shot messages from a terminal
- Piping any tool's output anywhere (`make | missher send --to slack:#builds`)

The command reuses the same credentials and platform adapters that `missher
gateway` already uses, so there's no second configuration surface to
maintain.

---

## Quick Start

```bash
# Plain text to the home channel for a platform
missher send --to telegram "deploy finished"

# Pipe in stdout from anything
echo "RAM 92%" | missher send --to telegram:-1001234567890

# Send a file
missher send --to discord:#ops --file /tmp/report.md

# Attach a subject/header line
missher send --to slack:#eng --subject "[CI] build.log" --file build.log

# Thread target (Telegram topic, Discord thread)
missher send --to telegram:-1001234567890:17585 "threaded reply"

# List every configured target
missher send --list

# Filter by platform
missher send --list telegram
```

---

## Argument Reference

| Flag | Description |
|------|-------------|
| `-t, --to TARGET` | Destination. See [target formats](#target-formats). |
| `message` (positional) | Message text. Omit to read from `--file` or stdin. |
| `-f, --file PATH` | Read the body from a file. `--file -` forces stdin. |
| `-s, --subject LINE` | Prepend a header/subject line before the body. |
| `-l, --list` | List available targets. Optional positional platform filter. |
| `-q, --quiet` | No stdout on success (exit code only — ideal for scripts). |
| `--json` | Emit the raw JSON result of the send. |
| `-h, --help` | Show the built-in help text. |

### Target Formats

| Format | Example | Meaning |
|--------|---------|---------|
| `platform` | `telegram` | Send to the platform's configured home channel |
| `platform:chat_id` | `telegram:-1001234567890` | Specific numeric chat / group / user |
| `platform:chat_id:thread_id` | `telegram:-1001234567890:17585` | Specific thread or Telegram forum topic |
| `platform:#channel` | `discord:#ops` | Human-friendly channel name (resolved against the channel directory) |
| `platform:+E164` | `signal:+15551234567` | Phone-addressed platforms: Signal, SMS, WhatsApp |

Any platform Missher ships adapters for works as a target:
`telegram`, `discord`, `slack`, `signal`, `sms`, `whatsapp`, `matrix`,
`mattermost`, `feishu`, `dingtalk`, `wecom`, `weixin`, `email`, and
others.

### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Send (or list) succeeded |
| `1` | Delivery failed at the platform level (auth, permissions, network) |
| `2` | Usage / argument / config error |

Exit codes follow the standard Unix convention so your scripts can
branch on them the same way they would on `curl` or `grep`.

---

## Message Body Resolution

`missher send` resolves the message body in this order:

1. **Positional argument** — `missher send --to telegram "hi"`
2. **`--file PATH`** — `missher send --to telegram --file msg.txt`
3. **Piped stdin** — `echo hi | missher send --to telegram`

When stdin is a TTY (no pipe), Missher does **not** wait for input — you'll
get a clear usage error instead. This keeps scripts from hanging if they
accidentally omit the body.

---

## Real-World Examples

### Monitoring: Memory / Disk Alerts

Replace ad-hoc `curl https://api.telegram.org/...` calls in your watchdogs
with a single portable line:

```bash
#!/usr/bin/env bash
ram_pct=$(free | awk '/^Mem:/ {printf "%d", $3 * 100 / $2}')
if [ "$ram_pct" -ge 85 ]; then
  missher send --to telegram --subject "⚠ MEMORY WARNING" \
    "RAM ${ram_pct}% on $(hostname)"
fi
```

Because `missher send` reuses your Missher config, the same script works on
any host where Missher is installed — no need to export bot tokens into
each machine's environment manually.

:::tip Don't alert the gateway about itself
For watchdogs that might fire when the gateway itself is struggling (OOM
alerts, disk-full alerts), keep using a minimal `curl` call instead of
`missher send`. If the Python interpreter can't load because the box is
thrashing, you still want that alert to go out.
:::

### CI / CD: Build and Test Results

```bash
# In .github/workflows/deploy.yml or any CI script
if ./scripts/deploy.sh; then
  missher send --to slack:#deploys "✅ ${CI_COMMIT_SHA:0:7} deployed"
else
  tail -n 100 deploy.log | missher send \
    --to slack:#deploys --subject "❌ deploy failed"
  exit 1
fi
```

### Cron: Daily Report

```bash
# Crontab entry
0 9 * * * /usr/local/bin/generate-metrics.sh \
  | /home/me/.missher/bin/missher send \
      --to telegram --subject "Daily metrics $(date +%Y-%m-%d)"
```

### Long-Running Tasks: Ping When Done

```bash
./train.py --epochs 200 && \
  missher send --to telegram "training done" || \
  missher send --to telegram "training failed (exit $?)"
```

### Scripting with `--json` and `--quiet`

```bash
# Hard-fail a script if delivery fails; don't clutter logs on success
missher send --to telegram --quiet "keepalive" || {
  echo "Telegram delivery failed" >&2
  exit 1
}

# Capture the message ID for later editing / threading
msg_id=$(missher send --to discord:#ops --json "build started" \
  | jq -r .message_id)
```

---

## Does `missher send` Need the Gateway Running?

**Usually no.** For any bot-token platform — Telegram, Discord, Slack,
Signal, SMS, WhatsApp Cloud API, and most others — `missher send` calls
the platform's REST endpoint directly using credentials from
`~/.missher/.env` and `~/.missher/config.yaml`. It's a standalone subprocess
that exits as soon as the message is delivered.

A live gateway is only required for **plugin platforms** that rely on a
persistent adapter connection (for example, a custom plugin that keeps
a long-lived WebSocket open). In that case you'll get a clear error
pointing at the gateway; start it with `missher gateway start` and retry.

---

## Listing and Discovering Targets

Before sending to a specific channel, you can inspect what's available:

```bash
# Every target across every configured platform
missher send --list

# Just Telegram targets
missher send --list telegram

# Machine-readable
missher send --list --json
```

The listing is built from `~/.missher/channel_directory.json`, which the
gateway refreshes every few minutes while it's running. If you see
"no channels discovered yet", start the gateway once (`missher gateway
start`) so it can populate the cache.

Human-friendly names (`discord:#ops`, `slack:#engineering`) are resolved
against this cache at send time, so you don't need to memorize numeric
IDs.

---

## Comparison with Other Approaches

| Approach | Multi-platform | Reuses Missher creds | Needs gateway | Best for |
|----------|----------------|---------------------|---------------|----------|
| `missher send` | ✅ | ✅ | No (bot-token) | Everything below |
| Raw `curl` to each platform | Each scripted separately | Manual | No | Critical watchdogs |
| `cron` job with `--deliver` | ✅ | ✅ | No | Scheduled agent tasks |

`missher send` is intentionally the simplest possible surface. If you need
an agent to decide what to say, schedule a cron job — the agent's final
response is auto-delivered to the configured `deliver:` target (the agent
no longer fires messages itself). If you need a scheduled run with LLM-generated content,
use `cronjob(action='create', prompt=...)` with `deliver='telegram:...'`.
If you just need to pipe a raw string, reach for `missher send`.

---

## Related

- [Automate Anything with Cron](/guides/automate-with-cron) —
  scheduled jobs whose output auto-delivers to any platform.
- [Gateway Internals](/developer-guide/gateway-internals) —
  the delivery router that `missher send` shares with cron delivery.
- [Messaging Platform Setup](/user-guide/messaging/) —
  one-time configuration for each platform.
