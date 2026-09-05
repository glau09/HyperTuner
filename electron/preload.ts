import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { AdbDevice, LogEntry, QueueProgress, PreCheckResult, AdbApi } from './types';

const api: AdbApi = {
  getDevices: (): Promise<AdbDevice[]> => {
    return ipcRenderer.invoke('adb:get-devices');
  },

  executeCommand: (
    deviceId: string,
    command: string
  ): Promise<{ success: boolean; output: string; isWarning?: boolean }> => {
    return ipcRenderer.invoke('adb:execute-command', { deviceId, command });
  },

  executeQueue: (
    deviceId: string,
    commands: string[],
    stepName?: string
  ): Promise<{ success: boolean; results: Array<{ command: string; success: boolean; output: string }> }> => {
    return ipcRenderer.invoke('adb:execute-queue', { deviceId, commands, stepName });
  },

  checkPreInstallation: (
    deviceId: string,
    packageName?: string
  ): Promise<PreCheckResult> => {
    return ipcRenderer.invoke('adb:check-pre-installation', { deviceId, packageName });
  },

  onLog: (callback: (log: LogEntry) => void) => {
    const handler = (_event: IpcRendererEvent, log: LogEntry) => callback(log);
    ipcRenderer.on('adb:log', handler);
    return () => {
      ipcRenderer.removeListener('adb:log', handler);
    };
  },

  onProgress: (callback: (progress: QueueProgress) => void) => {
    const handler = (_event: IpcRendererEvent, progress: QueueProgress) => callback(progress);
    ipcRenderer.on('adb:progress', handler);
    return () => {
      ipcRenderer.removeListener('adb:progress', handler);
    };
  },

  onDevicesUpdated: (callback: (devices: AdbDevice[]) => void) => {
    const handler = (_event: IpcRendererEvent, devices: AdbDevice[]) => callback(devices);
    ipcRenderer.on('adb:devices-updated', handler);
    return () => {
      ipcRenderer.removeListener('adb:devices-updated', handler);
    };
  }
};

contextBridge.exposeInMainWorld('adbApi', api);
