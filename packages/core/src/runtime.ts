import type { Logger } from 'pino';

import {
    createWillClawAcpApp,
    startWillClawAcpServer,
    type AcpHttpServer,
} from './acp/server.js';
import { createAgentBackends } from './agents/factory.js';
import type { AgentBackend } from './agents/types.js';
import { ChatService } from './chat-service.js';
import { ChannelManager } from './channels/manager.js';
import { CommandCompletionMonitor } from './completion-monitor.js';
import { loadWillClawConfig, type WillClawConfig } from './config.js';
import { WillClawEventHub } from './events.js';
import { HistoryExporter } from './history-exporter.js';
import { BackgroundTaskEngine } from './heartbeat.js';
import { HostedActionService } from './hosted-actions.js';
import { createAppLogger } from './logger.js';
import { MemorySearchService } from './memory-search.js';
import { MemoryStore } from './memory.js';
import { Orchestrator } from './orchestrator.js';
import { PairingManager } from './pairing.js';
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
    eventHub: WillClawEventHub;
    promptAssembler: PromptAssembler;
    agents: Map<string, AgentBackend>;
    memoryStore: MemoryStore;
    toolLogger: ToolExecutionLogger;
    shellTool: ShellTool;
    fileSystemTool: FileSystemTool;
    browserTool: BrowserTool;
    screenTool: ScreenTool;
    pairingManager: PairingManager;
    historyExporter: HistoryExporter | null;
    completionMonitor: CommandCompletionMonitor;
    orchestrator: Orchestrator;
    chatService: ChatService;
    channelManager: ChannelManager;
    backgroundTaskEngine: BackgroundTaskEngine;
    scheduler: WillClawScheduler;
    workspaceMemoryManager: WorkspaceMemoryManager;
}

export async function createWillClawRuntime(options?: {
    homeDir?: string;
}): Promise<WillClawRuntime> {
    const { config, paths } = await loadWillClawConfig(options);
    const logger = await createAppLogger(config.logging.app_log);
    const eventHub = new WillClawEventHub();
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
    const pairingManager = new PairingManager(config, logger);
    await pairingManager.initialize();
    const hostedActionService = new HostedActionService(
        browserTool,
        screenTool,
        logger,
    );
    const historyExporter = config.history.enabled
        ? new HistoryExporter(config.history.dir, fileSystemTool)
        : null;
    const completionMonitor = new CommandCompletionMonitor(config);
    const workspaceMemoryManager = new WorkspaceMemoryManager(
        config,
        paths,
        promptAssembler,
        agents,
        memoryStore,
        fileSystemTool,
        logger,
    );
    const memorySearchService = new MemorySearchService(workspaceMemoryManager);
    const orchestrator = new Orchestrator(
        config,
        paths,
        promptAssembler,
        agents,
        memorySearchService,
        hostedActionService,
        logger,
        eventHub,
    );
    const chatService = new ChatService(
        config,
        orchestrator,
        memoryStore,
        memorySearchService,
        historyExporter,
        completionMonitor,
        logger,
        eventHub,
    );
    const backgroundTaskEngine = new BackgroundTaskEngine(
        config,
        promptAssembler,
        agents,
        memoryStore,
        historyExporter,
        logger,
        eventHub,
    );
    const scheduler = new WillClawScheduler(
        config,
        backgroundTaskEngine,
        workspaceMemoryManager,
        logger,
        eventHub,
    );
    const channelManager = new ChannelManager(
        config,
        chatService,
        orchestrator,
        scheduler,
        memoryStore,
        pairingManager,
        logger,
        paths.homeDir,
    );

    if (config.memory.search_reindex_on_start) {
        await workspaceMemoryManager.reindexWorkspaceMemory();
    }

    return {
        config,
        paths,
        logger,
        eventHub,
        promptAssembler,
        agents,
        memoryStore,
        toolLogger,
        shellTool,
        fileSystemTool,
        browserTool,
        screenTool,
        pairingManager,
        historyExporter,
        completionMonitor,
        orchestrator,
        chatService,
        channelManager,
        backgroundTaskEngine,
        scheduler,
        workspaceMemoryManager,
    };
}

export async function listenWithRuntime(runtime: WillClawRuntime): Promise<{
    app: ReturnType<typeof createWillClawApp>;
    server: WillClawHttpServer;
    acpApp?: ReturnType<typeof createWillClawAcpApp>;
    acpServer?: AcpHttpServer;
}> {
    const app = createWillClawApp(runtime);
    const server = await startWillClawHttpServer(runtime, app);
    const acpEnabled = runtime.config.acp.server.enabled;
    const acpApp = acpEnabled ? createWillClawAcpApp(runtime) : undefined;
    const acpServer =
        acpEnabled && acpApp
            ? await startWillClawAcpServer(runtime, acpApp)
            : undefined;

    return {
        app,
        server,
        ...(acpApp ? { acpApp } : {}),
        ...(acpServer ? { acpServer } : {}),
    };
}
