import type { Logger } from 'pino';

import { createAgentBackends } from './agents/factory.js';
import type { AgentBackend } from './agents/types.js';
import { ChatService } from './chat-service.js';
import { CommandCompletionMonitor } from './completion-monitor.js';
import { loadWillClawConfig, type WillClawConfig } from './config.js';
import { HistoryExporter } from './history-exporter.js';
import { BackgroundTaskEngine } from './heartbeat.js';
import { createAppLogger } from './logger.js';
import { MemoryStore } from './memory.js';
import { Orchestrator } from './orchestrator.js';
import type { WillClawPaths } from './paths.js';
import { PromptAssembler } from './prompt.js';
import { WillClawScheduler } from './scheduler.js';
import {
    createWillClawApp,
    startWillClawHttpServer,
    type WillClawHttpServer,
} from './server.js';
import { ToolExecutionLogger } from './tool-logger.js';
import { BrowserTool } from './tools/browser.js';
import { FileSystemTool } from './tools/filesystem.js';
import { ScreenTool } from './tools/screen.js';
import { ShellTool } from './tools/shell.js';
import { WorkspaceMemoryManager } from './workspace-memory.js';

export interface WillClawRuntime {
    config: WillClawConfig;
    paths: WillClawPaths;
    logger: Logger;
    promptAssembler: PromptAssembler;
    agents: Map<string, AgentBackend>;
    memoryStore: MemoryStore;
    toolLogger: ToolExecutionLogger;
    shellTool: ShellTool;
    fileSystemTool: FileSystemTool;
    browserTool: BrowserTool;
    screenTool: ScreenTool;
    historyExporter: HistoryExporter | null;
    completionMonitor: CommandCompletionMonitor;
    orchestrator: Orchestrator;
    chatService: ChatService;
    backgroundTaskEngine: BackgroundTaskEngine;
    scheduler: WillClawScheduler;
    workspaceMemoryManager: WorkspaceMemoryManager;
}

export async function createWillClawRuntime(options?: {
    homeDir?: string;
}): Promise<WillClawRuntime> {
    const { config, paths } = await loadWillClawConfig(options);
    const logger = await createAppLogger(config.logging.app_log);
    const promptAssembler = new PromptAssembler(config, paths);
    const agents = createAgentBackends(config);
    const memoryStore = new MemoryStore(paths.databasePath);
    const toolLogger = new ToolExecutionLogger(
        config.logging.tool_log_db,
        logger,
        config.logging.max_output_chars,
    );
    const fileSystemTool = new FileSystemTool(toolLogger);
    const shellTool = new ShellTool(config, toolLogger);
    const browserTool = new BrowserTool(config, toolLogger);
    const screenTool = new ScreenTool(config, toolLogger);
    const historyExporter = config.history.enabled
        ? new HistoryExporter(config.history.dir, fileSystemTool)
        : null;
    const completionMonitor = new CommandCompletionMonitor(config);
    const orchestrator = new Orchestrator(
        config,
        paths,
        promptAssembler,
        agents,
        logger,
    );
    const chatService = new ChatService(
        config,
        orchestrator,
        memoryStore,
        historyExporter,
        completionMonitor,
        logger,
    );
    const backgroundTaskEngine = new BackgroundTaskEngine(
        config,
        promptAssembler,
        agents,
        memoryStore,
        historyExporter,
        logger,
    );
    const scheduler = new WillClawScheduler(
        config,
        backgroundTaskEngine,
        logger,
    );
  const workspaceMemoryManager = new WorkspaceMemoryManager(
    config,
    paths,
        promptAssembler,
        agents,
        memoryStore,
    fileSystemTool,
    logger,
  );

  if (config.memory.search_reindex_on_start) {
    await workspaceMemoryManager.reindexWorkspaceMemory();
  }

  return {
        config,
        paths,
        logger,
        promptAssembler,
        agents,
        memoryStore,
        toolLogger,
        shellTool,
        fileSystemTool,
        browserTool,
        screenTool,
        historyExporter,
        completionMonitor,
        orchestrator,
        chatService,
        backgroundTaskEngine,
        scheduler,
        workspaceMemoryManager,
    };
}

export async function listenWithRuntime(runtime: WillClawRuntime): Promise<{
    app: ReturnType<typeof createWillClawApp>;
    server: WillClawHttpServer;
}> {
    const app = createWillClawApp(runtime);
    const server = await startWillClawHttpServer(runtime, app);

    return {
        app,
        server,
    };
}
