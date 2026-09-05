export interface AdbDevice {
  id: string;
  state: 'device' | 'unauthorized' | 'offline' | 'no_permissions';
  model?: string;
  manufacturer?: string;
  osVersion?: string;
  hyperOsVersion?: string;
  batteryLevel?: number;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'warn' | 'error' | 'command' | 'output';
  message: string;
}

export interface QueueProgress {
  total: number;
  completed: number;
  currentCommand: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  retryAttempt?: number;
}

export interface PreCheckResult {
  passed: boolean;
  freeSpaceMb: number;
  isWritable: boolean;
  packagePath?: string;
  isInstalled: boolean;
  fileSize?: string;
  details: string;
}

export interface AdbApi {
  getDevices: () => Promise<AdbDevice[]>;
  executeCommand: (deviceId: string, command: string) => Promise<{ success: boolean; output: string; isWarning?: boolean }>;
  executeQueue: (deviceId: string, commands: string[], stepName?: string) => Promise<{ success: boolean; results: Array<{ command: string; success: boolean; output: string }> }>;
  checkPreInstallation: (deviceId: string, packageName?: string) => Promise<PreCheckResult>;
  onLog: (callback: (log: LogEntry) => void) => () => void;
  onProgress: (callback: (progress: QueueProgress) => void) => () => void;
  onDevicesUpdated: (callback: (devices: AdbDevice[]) => void) => () => void;
}

declare global {
  interface Window {
    adbApi: AdbApi;
  }
}
