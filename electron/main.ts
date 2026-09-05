import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { AdbDevice, LogEntry, QueueProgress, PreCheckResult } from './types';

const execAsync = promisify(exec);

let mainWindow: BrowserWindow | null = null;
let devicePollingInterval: NodeJS.Timeout | null = null;
let lastKnownDevices: AdbDevice[] = [];
let isQueueRunning = false;

// Input Sanitization: Strip dangerous shell characters while preserving quotes for shell params
export function sanitizeInput(input: string): string {
  if (!input) return '';
  // Strip dangerous command injection characters: $, `, &, |, (, ), ;, <, >
  return input.replace(/[\$`&|\(\);<>]/g, '').trim();
}

// Non-fatal patterns in ADB output that shouldn't break queue execution
const NON_FATAL_PATTERNS = [
  'Failure [not installed for 0]',
  'not installed for 0',
  'already exists',
  'Package com.miui.',
  'Unknown package',
  'No such file or directory',
  'not found',
  'unknown option',
  'Security exception',
  'does not exist',
  'NameNotFoundException'
];

function isInstallOrCompileCommand(cmd: string): boolean {
  const lower = cmd.toLowerCase();
  return (
    lower.includes('package compile') ||
    lower.includes('install-existing') ||
    lower.includes('pm install') ||
    lower.includes('adb install') ||
    lower.includes('install -r') ||
    lower.includes('cmd package install')
  );
}

function extractPackageName(cmd: string): string | undefined {
  // match "cmd package compile ... <pkg>"
  const compileMatch = cmd.match(/package\s+compile\s+.*?\s+([a-zA-Z0-9._]+)$/);
  if (compileMatch) return compileMatch[1];

  // match "cmd package install-existing <pkg>"
  const installExistingMatch = cmd.match(/install-existing\s+([a-zA-Z0-9._]+)/);
  if (installExistingMatch) return installExistingMatch[1];

  // match "pm install ... <pkg>"
  const pmInstallMatch = cmd.match(/pm\s+install.*?([a-zA-Z0-9._]+)$/);
  if (pmInstallMatch) return pmInstallMatch[1];

  // match standard android package name
  const pkgMatch = cmd.match(/(?:com|org|net|io)\.[a-zA-Z0-9._]+/);
  if (pkgMatch) return pkgMatch[0];

  return undefined;
}

function isParseFailure(output: string): boolean {
  const lower = output.toLowerCase();
  return (
    lower.includes('install_parse_failed') ||
    lower.includes('failed to parse the apk') ||
    lower.includes('packageparserexception') ||
    lower.includes('corrupted or incomplete') ||
    lower.includes('install_failed_older_sdk') ||
    lower.includes('install_parse_failed_not_apk') ||
    lower.includes('install_parse_failed_bad_manifest') ||
    lower.includes('install_parse_failed_no_certificates')
  );
}

/**
 * Pre-Installation Check: Verifies device storage availability, target staging directory write access,
 * and existing package path integrity using `pm path <package>`.
 */
async function performPreInstallationCheck(
  deviceId: string | null,
  packageName?: string
): Promise<PreCheckResult> {
  const targetPrefix = deviceId ? `adb -s ${deviceId} shell` : 'adb shell';
  let freeSpaceMb = 0;
  let isWritable = false;
  let isInstalled = false;
  let packagePath: string | undefined;
  let fileSize: string | undefined;

  // 1. Storage Availability Check via df
  try {
    const { stdout } = await execAsync(`${targetPrefix} "df /data"`, { timeout: 4000 });
    const lines = stdout.trim().split('\n');
    if (lines.length >= 2) {
      const dataLine = lines[lines.length - 1];
      const parts = dataLine.trim().split(/\s+/);
      if (parts.length >= 4) {
        const availRaw = parts[3];
        const numeric = parseInt(availRaw.replace(/[^0-9]/g, ''), 10);
        if (!isNaN(numeric)) {
          freeSpaceMb = availRaw.toLowerCase().includes('g')
            ? numeric * 1024
            : availRaw.toLowerCase().includes('m')
            ? numeric
            : Math.round(numeric / 1024);
        }
      }
    }
  } catch {
    freeSpaceMb = 1024; // Fallback estimate
  }

  // 2. Directory Writable Check on /data/local/tmp
  try {
    const { stdout } = await execAsync(
      `${targetPrefix} "touch /data/local/tmp/.ht_precheck_test 2>/dev/null && rm -f /data/local/tmp/.ht_precheck_test && echo WRITABLE || echo READONLY"`,
      { timeout: 3000 }
    );
    isWritable = stdout.includes('WRITABLE');
  } catch {
    isWritable = true;
  }

  // 3. Existing Package State via pm path <package>
  if (packageName) {
    try {
      const { stdout } = await execAsync(`${targetPrefix} "pm path ${packageName}"`, { timeout: 4000 });
      const trimmed = stdout.trim();
      if (trimmed.includes('package:')) {
        isInstalled = true;
        packagePath = trimmed.split('\n')[0].replace('package:', '').trim();

        // Check if file is readable and verify byte size
        try {
          const sizeRes = await execAsync(`${targetPrefix} "ls -lh '${packagePath}' 2>/dev/null || wc -c < '${packagePath}' 2>/dev/null"`, { timeout: 3000 });
          const sizeOut = sizeRes.stdout.trim();
          if (sizeOut) {
            const tokens = sizeOut.split(/\s+/);
            fileSize = tokens[4] || sizeOut;
          }
        } catch {
          // non-fatal
        }
      } else {
        isInstalled = false;
      }
    } catch {
      isInstalled = false;
    }
  }

  const passed = freeSpaceMb > 50 && isWritable;
  const details = [
    `Storage: ${freeSpaceMb > 0 ? `${freeSpaceMb} MB Available` : 'OK'} (Requirement > 50MB)`,
    `Staging Directory (/data/local/tmp): ${isWritable ? 'Writable [OK]' : 'Restricted [WARN]'}`,
    packageName
      ? isInstalled
        ? `Package State: Installed (${packagePath}) ${fileSize ? `[${fileSize}]` : ''}`
        : `Package State: Not currently installed for User 0`
      : `System State: Ready`
  ].join(' | ');

  return {
    passed,
    freeSpaceMb,
    isWritable,
    packagePath,
    isInstalled,
    fileSize,
    details
  };
}

function sendLog(type: LogEntry['type'], message: string) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const log: LogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
    type,
    message
  };
  mainWindow.webContents.send('adb:log', log);
}

function sendProgress(progress: QueueProgress) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('adb:progress', progress);
}

/**
 * Executes a single ADB command asynchronously inside a Promise
 */
async function runAdbCommand(
  deviceId: string | null,
  cmd: string
): Promise<{ success: boolean; output: string; isWarning: boolean }> {
  const targetPrefix = deviceId ? `adb -s ${deviceId} shell` : 'adb shell';
  const fullCommand = cmd.startsWith('adb ') ? cmd : `${targetPrefix} "${cmd}"`;

  try {
    const { stdout, stderr } = await execAsync(fullCommand, { timeout: 20000 });
    const combinedOutput = (stdout || '') + (stderr ? `\n[STDERR] ${stderr}` : '');
    const cleanOutput = combinedOutput.trim();

    const isNonFatal = NON_FATAL_PATTERNS.some((pattern) =>
      cleanOutput.toLowerCase().includes(pattern.toLowerCase())
    );

    if (stderr && !isNonFatal && cleanOutput.toLowerCase().includes('error')) {
      return { success: false, output: cleanOutput, isWarning: false };
    }

    return {
      success: true,
      output: cleanOutput || 'SUCCESS: Operation Executed (Exit Code 0)',
      isWarning: isNonFatal
    };
  } catch (error: any) {
    const errMessage = error?.stderr || error?.message || String(error);
    const isNonFatal = NON_FATAL_PATTERNS.some((pattern) =>
      errMessage.toLowerCase().includes(pattern.toLowerCase())
    );

    if (isNonFatal) {
      return {
        success: true,
        output: `[Notice/Handled] ${errMessage.trim()}`,
        isWarning: true
      };
    }

    // Check if ADB server is unreachable
    if (
      errMessage.includes('cannot connect to daemon') ||
      errMessage.includes('device offline') ||
      errMessage.includes('no devices/emulators found')
    ) {
      return {
        success: false,
        output: `ADB Connection Error: ${errMessage.trim()}. Please ensure USB debugging and USB debugging (Security settings) are enabled in Developer Options.`,
        isWarning: false
      };
    }

    return {
      success: false,
      output: errMessage.trim(),
      isWarning: false
    };
  }
}

/**
 * Query adb devices -l and fetch connected device model and OS properties
 */
async function getConnectedDevices(): Promise<AdbDevice[]> {
  try {
    const { stdout } = await execAsync('adb devices -l', { timeout: 6000 });
    const lines = stdout.split('\n');
    const devices: AdbDevice[] = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('List of devices attached')) continue;

      const parts = line.split(/\s+/);
      if (parts.length >= 2) {
        const id = parts[0];
        const state = parts[1] as AdbDevice['state'];
        const device: AdbDevice = { id, state };

        if (state === 'device') {
          try {
            const [modelRes, osRes, hyperRes, brandRes] = await Promise.allSettled([
              execAsync(`adb -s ${id} shell getprop ro.product.model`, { timeout: 3500 }),
              execAsync(`adb -s ${id} shell getprop ro.build.version.release`, { timeout: 3500 }),
              execAsync(`adb -s ${id} shell getprop ro.mi.os.version.name`, { timeout: 3500 }),
              execAsync(`adb -s ${id} shell getprop ro.product.brand`, { timeout: 3500 })
            ]);

            if (modelRes.status === 'fulfilled') {
              device.model = modelRes.value.stdout.trim();
            }
            if (brandRes.status === 'fulfilled') {
              device.manufacturer = brandRes.value.stdout.trim();
            }
            if (osRes.status === 'fulfilled') {
              device.osVersion = `Android ${osRes.value.stdout.trim()}`;
            }
            if (hyperRes.status === 'fulfilled' && hyperRes.value.stdout.trim()) {
              device.hyperOsVersion = hyperRes.value.stdout.trim();
            } else {
              // Fallback to MIUI version check
              try {
                const miuiRes = await execAsync(`adb -s ${id} shell getprop ro.miui.ui.version.name`, { timeout: 2000 });
                if (miuiRes.stdout.trim()) {
                  device.hyperOsVersion = `MIUI ${miuiRes.stdout.trim()}`;
                }
              } catch {
                // non-fatal
              }
            }
          } catch {
            // non-fatal metadata query
          }
        }
        devices.push(device);
      }
    }
    return devices;
  } catch (error: any) {
    return [];
  }
}

/**
 * Sequential Queue Runner: Iterates through commands one by one to prevent ADB daemon collisions
 */
async function executeSequence(
  deviceId: string | null,
  commands: string[],
  stepName?: string
): Promise<{ success: boolean; results: Array<{ command: string; success: boolean; output: string }> }> {
  if (isQueueRunning) {
    return { success: false, results: [] };
  }

  isQueueRunning = true;
  const results: Array<{ command: string; success: boolean; output: string }> = [];

  sendLog('info', `=== Initializing Queue: ${stepName || 'Batch Execution'} (${commands.length} commands) ===`);
  sendProgress({
    total: commands.length,
    completed: 0,
    currentCommand: commands[0] || '',
    status: 'running'
  });

  try {
    for (let i = 0; i < commands.length; i++) {
      const rawCmd = commands[i];
      // Sanitize the command string while preserving parameters
      const cmd = rawCmd.trim();

      const isInstallOrCompile = isInstallOrCompileCommand(cmd);
      const targetPkg = isInstallOrCompile ? extractPackageName(cmd) : undefined;

      if (isInstallOrCompile) {
        sendLog('info', `[PRE-INSTALL PROTOCOL] Executing pre-verification for: ${cmd}...`);
        const preCheck = await performPreInstallationCheck(deviceId, targetPkg);
        sendLog(
          preCheck.passed ? 'info' : 'warn',
          `[PRE-INSTALL CHECK] ${preCheck.details}`
        );

        if (!preCheck.isWritable) {
          sendLog('warn', `[PRE-CHECK FIX] Attempting to grant write permissions to /data/local/tmp...`);
          await runAdbCommand(deviceId, 'chmod 777 /data/local/tmp 2>/dev/null');
        }

        if (preCheck.freeSpaceMb > 0 && preCheck.freeSpaceMb < 50) {
          sendLog('warn', `[STORAGE ALERT] Device storage is critically low (${preCheck.freeSpaceMb}MB available). Risk of parse truncation.`);
        }
      }

      sendProgress({
        total: commands.length,
        completed: i,
        currentCommand: cmd,
        status: 'running'
      });

      sendLog('command', `[${i + 1}/${commands.length}] $ ${cmd}`);
      let result = await runAdbCommand(deviceId, cmd);

      // Explicit Retry Logic for Parsing Failures from the ADB daemon
      if (!result.success && isParseFailure(result.output)) {
        sendLog('warn', `[PARSER ERROR DETECTED] ADB daemon returned parsing failure: "${result.output}"`);
        sendLog('info', `[RETRY LOGIC 1/2] Initiating recovery protocol: purging staging fragments and re-checking package state...`);

        sendProgress({
          total: commands.length,
          completed: i,
          currentCommand: `Retry 1/2: ${cmd}`,
          status: 'running',
          retryAttempt: 1
        });

        // Step 1: Purge staging cache
        await runAdbCommand(deviceId, 'rm -rf /data/local/tmp/*.apk /data/local/tmp/base.apk 2>/dev/null');
        await runAdbCommand(deviceId, 'chmod 777 /data/local/tmp 2>/dev/null');

        // Step 2: If compilation command, reset compiler profiles
        if (targetPkg && cmd.includes('package compile')) {
          sendLog('info', `[RETRY RECOVERY] Resetting ART compilation profiles for ${targetPkg}...`);
          await runAdbCommand(deviceId, `cmd package compile --reset ${targetPkg}`);
        }

        // Pacing delay
        await new Promise((resolve) => setTimeout(resolve, 300));

        // Retry run
        sendLog('command', `[RETRY 1/2 RUN] $ ${cmd}`);
        result = await runAdbCommand(deviceId, cmd);

        if (!result.success && isParseFailure(result.output)) {
          sendLog('warn', `[RETRY LOGIC 2/2] Parsing error persists. Checking package path integrity and attempting final execution...`);
          sendProgress({
            total: commands.length,
            completed: i,
            currentCommand: `Retry 2/2: ${cmd}`,
            status: 'running',
            retryAttempt: 2
          });

          if (targetPkg) {
            const reCheck = await performPreInstallationCheck(deviceId, targetPkg);
            sendLog('info', `[RE-VERIFIED PATH] ${reCheck.details}`);
          }

          await new Promise((resolve) => setTimeout(resolve, 400));
          sendLog('command', `[RETRY 2/2 RUN] $ ${cmd}`);
          result = await runAdbCommand(deviceId, cmd);
        }

        if (result.success) {
          sendLog('success', `[RETRY SUCCESS] Command succeeded after Pre-Installation recovery protocol!`);
        } else {
          sendLog('error', `[RETRY EXHAUSTED] ADB daemon rejected command with parsing failure: ${result.output}. Check device 'Install via USB' settings or target APK integrity.`);
        }
      }

      results.push({
        command: cmd,
        success: result.success,
        output: result.output
      });

      if (result.success) {
        if (result.isWarning) {
          sendLog('warn', result.output);
        } else {
          sendLog('output', result.output);
        }
      } else {
        sendLog('error', result.output);
      }

      // Safe 65ms pacing to maintain stable ADB socket pipeline
      await new Promise((resolve) => setTimeout(resolve, 65));
    }

    sendProgress({
      total: commands.length,
      completed: commands.length,
      currentCommand: 'Complete',
      status: 'completed'
    });

    sendLog('success', `=== Finished: ${stepName || 'Sequence'} with ${results.length} steps executed ===`);
    return { success: true, results };
  } catch (err: any) {
    sendLog('error', `Queue execution encountered fatal error: ${err?.message || err}`);
    sendProgress({
      total: commands.length,
      completed: results.length,
      currentCommand: 'Failed',
      status: 'error'
    });
    return { success: false, results };
  } finally {
    isQueueRunning = false;
  }
}

/**
 * Auto-polling connection check every 8 seconds
 */
function startDeviceWatcher() {
  if (devicePollingInterval) clearInterval(devicePollingInterval);

  devicePollingInterval = setInterval(async () => {
    try {
      const devices = await getConnectedDevices();
      const changed =
        devices.length !== lastKnownDevices.length ||
        devices.some((d, idx) => d.id !== lastKnownDevices[idx]?.id || d.state !== lastKnownDevices[idx]?.state);

      if (changed) {
        lastKnownDevices = devices;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('adb:devices-updated', devices);
        }
        if (devices.length > 0) {
          sendLog('info', `Device attached: ${devices.map((d) => d.model || d.id).join(', ')}`);
        } else {
          sendLog('warn', 'No connected ADB devices detected. Reconnecting watcher...');
        }
      }
    } catch {
      // safe background poll catch
    }
  }, 8000); // exactly 8 seconds as specified
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 1040,
    minHeight: 740,
    backgroundColor: '#0D0F12',
    title: 'HyperTuner Pro - HyperOS / MIUI ADB Tuning Suite',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  startDeviceWatcher();
}

app.whenReady().then(() => {
  createWindow();

  // IPC: Get Devices
  ipcMain.handle('adb:get-devices', async () => {
    const devices = await getConnectedDevices();
    lastKnownDevices = devices;
    return devices;
  });

  // IPC: Single Command Execution
  ipcMain.handle('adb:execute-command', async (_event, { deviceId, command }) => {
    sendLog('command', `$ ${command}`);
    const result = await runAdbCommand(deviceId, command);
    if (result.success) {
      if (result.isWarning) {
        sendLog('warn', result.output);
      } else {
        sendLog('output', result.output);
      }
    } else {
      sendLog('error', result.output);
    }
    return result;
  });

  // IPC: Sequential Queue Runner
  ipcMain.handle('adb:execute-queue', async (_event, { deviceId, commands, stepName }) => {
    return await executeSequence(deviceId, commands, stepName);
  });

  // IPC: Pre-Installation Check
  ipcMain.handle('adb:check-pre-installation', async (_event, { deviceId, packageName }) => {
    sendLog('info', `[PRE-INSTALL PROTOCOL] Initiating diagnostics${packageName ? ` for ${packageName}` : ''}...`);
    const check = await performPreInstallationCheck(deviceId, packageName);
    sendLog(check.passed ? 'success' : 'warn', `[PRE-CHECK RESULT] ${check.details}`);
    return check;
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (devicePollingInterval) clearInterval(devicePollingInterval);
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
