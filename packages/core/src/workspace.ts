import { access, mkdir, writeFile } from 'node:fs/promises';

import { displayPath, getWillClawPaths, type WillClawPaths } from './paths.js';
import { syncWillClawWorkspaceSkills } from './workspace-skills.js';

const REQUIRED_DIRECTORIES = [
    (paths: WillClawPaths) => paths.homeDir,
    (paths: WillClawPaths) => paths.workspaceDir,
    (paths: WillClawPaths) => paths.workspaceMemoryDir,
    (paths: WillClawPaths) => paths.workspaceSkillsDir,
    (paths: WillClawPaths) => paths.historyDir,
    (paths: WillClawPaths) => `${paths.historyDir}/telegram`,
    (paths: WillClawPaths) => `${paths.historyDir}/discord`,
    (paths: WillClawPaths) => `${paths.historyDir}/feishu`,
    (paths: WillClawPaths) => `${paths.historyDir}/web`,
    (paths: WillClawPaths) => `${paths.historyDir}/cron`,
    (paths: WillClawPaths) => paths.logsDir,
    (paths: WillClawPaths) => paths.dataDir,
];

export interface InitWorkspaceResult {
    paths: WillClawPaths;
    createdConfig: boolean;
}

async function pathExists(targetPath: string): Promise<boolean> {
    try {
        await access(targetPath);
        return true;
    } catch {
        return false;
    }
}

function renderDefaultConfig(paths: WillClawPaths): string {
    const historyDir = displayPath(paths.historyDir);
    const appLogPath = displayPath(paths.appLogPath);
    const toolLogDbPath = displayPath(paths.toolLogDbPath);
    const envFilePath = displayPath(paths.envFilePath);
    const archiveDir = displayPath(`${paths.homeDir}/archive`);

    return `server:
  host: "127.0.0.1"
  port: 8420
  auth_token: "\${WILLCLAW_AUTH_TOKEN}"
  auth:
    tokens: []
    session:
      cookie_name: willclaw_session
      ttl_hours: 24
    rate_limit:
      enabled: true
      window_seconds: 60
      max_requests: 240

workspace:
  bootstrapMaxChars: 20000
  bootstrapTotalMaxChars: 100000

agents:
  default: claude-code
  routing:
    simple_qa: direct-api
    coding: claude-code
    long_context: gemini
    system: claude-code
  safety:
    prompt_transport: stdin
    mutating_fallback: false
  pool:
    claude-code:
      enabled: true
      type: cli
      command: claude
      args: ["-p", "--dangerously-skip-permissions"]
      timeout: 300
      completion_notify: background_only
      output_format: text
      tool_policy:
        shell: native
        filesystem: native
        browser: disabled
        screen: disabled
    codex:
      enabled: true
      type: cli
      command: codex
      args: ["--full-auto"]
      timeout: 300
      completion_notify: background_only
      output_format: text
      tool_policy:
        shell: native
        filesystem: native
        browser: disabled
        screen: disabled
    opencode:
      enabled: true
      type: cli
      command: opencode
      args: ["run", "--format", "json"]
      timeout: 300
      completion_notify: background_only
      output_format: json
      tool_policy:
        shell: native
        filesystem: native
        browser: disabled
        screen: disabled
    gemini:
      enabled: true
      type: cli
      command: gemini
      args: ["-p", "--output-format", "json"]
      timeout: 300
      completion_notify: background_only
      output_format: json
      tool_policy:
        shell: native
        filesystem: native
        browser: disabled
        screen: disabled
    direct-api:
      enabled: true
      type: api
      provider: anthropic
      model: claude-sonnet-4-20250514
      api_key_env: ANTHROPIC_API_KEY
      max_tokens: 8192
      endpoint: https://api.anthropic.com/v1/messages
      completion_notify: false
      tool_policy:
        shell: hosted
        filesystem: hosted
        browser: hosted
        screen: hosted

acp:
  agents: {}
  server:
    enabled: false
    port: 8421

channels:
  telegram:
    enabled: false
    token_env: TELEGRAM_BOT_TOKEN
    owner_id: 0
    allowed_users: []
    require_mention_in_groups: true
    poll_timeout_seconds: 20
  discord:
    enabled: false
    token_env: DISCORD_BOT_TOKEN
    owner_id: ""
    allowed_users: []
    require_mention_in_guilds: true
  feishu:
    enabled: false
    app_id_env: FEISHU_APP_ID
    app_secret_env: FEISHU_APP_SECRET
    verification_token_env: FEISHU_VERIFICATION_TOKEN
    encrypt_key_env: FEISHU_ENCRYPT_KEY
    owner_open_id: ""
    allowed_open_ids: []
    require_mention_in_groups: true
  web:
    enabled: true

heartbeat:
  enabled: true
  interval: "0 * * * *"
  agent: direct-api
  notify: telegram
  silent_ok: true
  inject_files:
    - HEARTBEAT.md
    - PROJECT_HEARTBEAT.md

cron:
  daily_briefing:
    schedule: "0 8 * * *"
    agent: direct-api
    prompt: 生成今日简报
    notify: telegram

tools:
  shell:
    confirm_destructive: true
    blocked_commands: ["rm", "rmdir"]
  filesystem:
    delete_mode: trash
    archive_dir: "${archiveDir}"
  browser:
    headless: true
    providers: ["agent-browser", "system-open"]
  screen:
    enabled: true
    providers: ["peekaboo", "screencapture"]

memory:
  context_window_days: 3
  max_history_messages: 20
  search_reindex_on_start: true
  exclude_revoked: true
  daily_note:
    enabled: true
    schedule: "55 23 * * *"
    agent: direct-api
  compact:
    enabled: true
    schedule: "10 2 * * *"
    agent: direct-api
    limit: 200

history:
  enabled: true
  dir: "${historyDir}"
  include_system: true
  git_auto_commit: false
  index_exports: false

logging:
  tool_log_db: "${toolLogDbPath}"
  app_log: "${appLogPath}"
  max_output_chars: 2000
  retain_days: 90

daemon:
  plist_label: com.willclaw.agent
  env_file: "${envFilePath}"
`;
}

export async function initializeWillClawHome(options?: {
    homeDir?: string;
    forceConfig?: boolean;
}): Promise<InitWorkspaceResult> {
    const paths = getWillClawPaths(options?.homeDir);

    for (const toDirectory of REQUIRED_DIRECTORIES) {
        await mkdir(toDirectory(paths), { recursive: true });
    }

    const configExists = await pathExists(paths.configPath);
    if (!configExists || options?.forceConfig) {
        await writeFile(paths.configPath, renderDefaultConfig(paths), 'utf8');
    }

    await syncWillClawWorkspaceSkills({
        workspaceDir: paths.workspaceDir,
        overwrite: false,
    });

    return {
        paths,
        createdConfig: !configExists || Boolean(options?.forceConfig),
    };
}
