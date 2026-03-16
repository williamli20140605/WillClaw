import os from 'node:os';
import path from 'node:path';

const DEFAULT_HOME_BASENAME = '.willclaw';

export interface WillClawPaths {
  homeDir: string;
  configPath: string;
  workspaceDir: string;
  workspaceMemoryDir: string;
  workspaceSkillsDir: string;
  historyDir: string;
  logsDir: string;
  dataDir: string;
  databasePath: string;
  appLogPath: string;
  toolLogDbPath: string;
  envFilePath: string;
}

export function getDefaultHomeDir(): string {
  return path.join(os.homedir(), DEFAULT_HOME_BASENAME);
}

export function expandHomeDir(inputPath: string): string {
  if (inputPath === '~') {
    return os.homedir();
  }

  if (inputPath.startsWith('~/')) {
    return path.join(os.homedir(), inputPath.slice(2));
  }

  return inputPath;
}

export function resolveWillClawHomeDir(homeDir?: string): string {
  return path.resolve(homeDir ? expandHomeDir(homeDir) : getDefaultHomeDir());
}

export function getWillClawPaths(homeDir?: string): WillClawPaths {
  const resolvedHomeDir = resolveWillClawHomeDir(homeDir);
  const workspaceDir = path.join(resolvedHomeDir, 'workspace');
  const logsDir = path.join(resolvedHomeDir, 'logs');

  return {
    homeDir: resolvedHomeDir,
    configPath: path.join(resolvedHomeDir, 'config.yaml'),
    workspaceDir,
    workspaceMemoryDir: path.join(workspaceDir, 'memory'),
    workspaceSkillsDir: path.join(workspaceDir, 'skills'),
    historyDir: path.join(resolvedHomeDir, 'historyMessages'),
    logsDir,
    dataDir: path.join(resolvedHomeDir, 'data'),
    databasePath: path.join(resolvedHomeDir, 'data', 'willclaw.db'),
    appLogPath: path.join(logsDir, 'willclaw.log'),
    toolLogDbPath: path.join(logsDir, 'tool-executions.db'),
    envFilePath: path.join(resolvedHomeDir, '.env'),
  };
}

export function displayPath(targetPath: string): string {
  const defaultHomeDir = getDefaultHomeDir();
  const relativeToDefault = path.relative(defaultHomeDir, targetPath);

  if (
    !relativeToDefault.startsWith('..') &&
    !path.isAbsolute(relativeToDefault)
  ) {
    return path.posix.join(
      '~/.willclaw',
      relativeToDefault.split(path.sep).join('/'),
    );
  }

  return targetPath;
}
