# Missher CLI Reference

Live sources when anything looks stale: `missher --help`, `missher <command> --help`,
https://missher-agent.nousresearch.com/docs/reference/cli-commands

### Global Flags

```
missher [flags] [command]        (no subcommand = interactive chat)

  --version, -V             Show version
  -z, --oneshot PROMPT      One-shot: print ONLY the final response (for scripts/pipes)
  -m MODEL  --provider P    Model/provider override for this invocation
  -t, --toolsets LIST       Comma-separated toolsets for this invocation
  --resume, -r SESSION      Resume session by ID or title
  --continue, -c [NAME]     Resume by name, or most recent session
  --worktree, -w            Isolated git worktree mode (parallel agents)
  --skills, -s SKILL        Preload skills (comma-separate or repeat)
  --profile, -p NAME        Use a named profile
  --yolo                    Skip dangerous command approval
  --tui / --cli             Force the Ink TUI / classic REPL
  --ignore-rules            Skip AGENTS.md/SOUL.md/memory/skill injection
  --safe-mode               Disable ALL customizations (troubleshooting)
  --pass-session-id         Include session ID in system prompt
```

### Chat

```
missher chat [flags]
  -q, --query TEXT          Single query, non-interactive
  --image PATH              Attach a local image to a single query
  -Q, --quiet               Suppress banner, spinner, tool previews
  --checkpoints             Enable filesystem checkpoints (/rollback)
  --max-turns N             Cap tool-calling iterations
  --source TAG              Session source tag (default: cli)
```
(plus the global flags above)

### Configuration

```
missher setup [section]      Wizard (model|tts|terminal|gateway|tools|agent)
missher model                Interactive model/provider picker
missher fallback [add|remove|list]  Fallback provider chain
missher config [show|edit|get|set|unset|path|env-path|check|migrate]
missher login / logout       OAuth sign-in / clear stored auth
missher doctor [--fix]       Check dependencies and config
missher status [--all]       Component status
```

### Tools & Skills

```
missher tools [list|enable NAME|disable NAME]   Per-platform toolsets (curses UI with no args)

missher skills list|browse|search QUERY|inspect ID
missher skills install ID    Hub identifier OR a direct https://…/SKILL.md URL
missher skills config        Enable/disable skills per platform
missher skills check|update|uninstall|publish PATH
missher skills tap add REPO  Add a GitHub repo as a skill source
missher bundles              Skill bundles (one /<name> alias loads several skills)
```

### MCP Servers

```
missher mcp add NAME (--url or --command) | remove | list | test NAME
missher mcp catalog | install NAME     Curated catalog install
missher mcp configure NAME             Toggle tool selection
missher mcp serve                      Run Missher as an MCP server
```
Details (transport, tool discovery, catalog): `references/native-mcp.md`.

### Gateway (Messaging Platforms)

```
missher gateway run|install|start|stop|restart|status|setup
```

20+ platforms: Telegram, Discord, Slack, WhatsApp (Baileys + Business Cloud API), iMessage (Photon — `missher photon setup`), Signal, Email, SMS, Matrix, Mattermost, Teams, LINE, SimpleX, ntfy, Google Chat, Home Assistant, DingTalk, Feishu, WeCom, Weixin, API Server, Webhooks. Open WebUI connects via the API Server adapter. Most adapters ship under `plugins/platforms/`.
Docs: https://missher-agent.nousresearch.com/docs/user-guide/messaging/

### Sessions

```
missher sessions list|browse|rename ID TITLE|delete ID|export OUT|prune|stats
```

### Cron / Webhooks

```
missher cron list|create SCHED|edit ID|pause|resume|run ID|remove|status
    Schedules: '30m', 'every 2h', '0 9 * * *', ISO timestamp
missher webhook subscribe NAME|list|remove NAME|test NAME
```
Webhook payloads/routes: `references/webhooks.md`.

### Profiles

```
missher profile list|create NAME (--clone|--clone-all|--clone-from)|use|show|delete
missher profile rename A B | alias NAME | export NAME | import FILE
```

### Credentials & Pools

```
missher auth                 Interactive credential manager
missher auth add [PROVIDER]  Add OAuth or API-key credential (nous, openai-codex, qwen-oauth, …)
missher auth list|remove P IDX|reset PROVIDER|status
```
Multiple credentials per provider form a pool that rotates automatically and skips exhausted keys.

### Other

```
missher desktop / gui        Native desktop app
missher dashboard            Web admin panel + embedded chat (--stop / --status)
missher proxy                OpenAI-compatible local proxy backed by an OAuth provider
missher portal               Quick setup / sign in via Nous Portal
missher kanban <verb>        Multi-agent work-queue board
missher project              Named multi-folder workspaces
missher skin list|use|set    Switch/tweak skins (see references/themes.md)
missher pets <verb>          Pet mascots (see references/petdex.md)
missher memory setup|status|off|reset   Memory provider
missher secrets bitwarden|onepassword   External secret stores
missher moa                  Mixture-of-Agents slots
missher hooks / security / backup / import / checkpoints / console
missher logs [-f] [errors]   View agent/error logs
missher send                 One-off message through a gateway platform
missher pairing / plugins / insights / journey / computer-use
missher acp                  ACP server (IDE integration)
missher completion bash|zsh|fish
missher update / uninstall / claw migrate
```

Plugin- and provider-supplied subcommands (e.g. `missher photon setup`) only appear once their plugin is installed/active.

### Where to Find Things

| Looking for... | Location |
|---|---|
| Config options | `missher config edit` · [Configuration docs](https://missher-agent.nousresearch.com/docs/user-guide/configuration) |
| Tools / toolsets | `missher tools list` · [Tools reference](https://missher-agent.nousresearch.com/docs/reference/tools-reference) |
| Skills catalog | `missher skills browse` · [Skills catalog](https://missher-agent.nousresearch.com/docs/reference/skills-catalog) |
| Provider setup | `missher model` · [Providers guide](https://missher-agent.nousresearch.com/docs/integrations/providers) |
| Env variables | `missher config env-path` · [Env vars reference](https://missher-agent.nousresearch.com/docs/reference/environment-variables) |
| Gateway logs | `~/.missher/logs/gateway.log` (or `missher logs`) |
| Sessions | `missher sessions browse` (reads state.db) |
