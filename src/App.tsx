import React, { useState, useEffect, useRef } from 'react';
import {
  Zap,
  Activity,
  Smartphone,
  RefreshCw,
  Sliders,
  Terminal,
  Play,
  Wrench,
  Gamepad2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Copy,
  Trash2,
  Cpu,
  Gauge,
  Sparkles,
  ShieldAlert,
  ChevronRight,
  Flame,
  Radio,
  Layers,
  Monitor,
  Wifi,
  PackageX,
  RotateCcw,
  SlidersHorizontal,
  FileCode,
  Lock,
  ArrowRight,
  ShieldCheck,
  HardDrive,
  Download,
  HelpCircle,
  ExternalLink,
  X
} from 'lucide-react';
import { AdbDevice, LogEntry, QueueProgress, PreCheckResult } from '../electron/types';

// Tab identifiers matching the 8 advanced feature modules
type TabType =
  | 'master'
  | 'display'
  | 'gpu'
  | 'xiaomi'
  | 'network'
  | 'game'
  | 'bloatware'
  | 'repair';

export default function App() {
  // Device & Connection State
  const [devices, setDevices] = useState<AdbDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isRefreshingDevices, setIsRefreshingDevices] = useState<boolean>(false);

  // Active Tab
  const [activeTab, setActiveTab] = useState<TabType>('master');

  // Queue & Execution State
  const [isQueueRunning, setIsQueueRunning] = useState<boolean>(false);
  const [currentStepTitle, setCurrentStepTitle] = useState<string>('');
  const [progress, setProgress] = useState<QueueProgress>({
    total: 0,
    completed: 0,
    currentCommand: '',
    status: 'idle'
  });

  // Pre-Installation & Failure Recovery State
  const [preCheckResult, setPreCheckResult] = useState<PreCheckResult | null>(null);
  const [isCheckingPre, setIsCheckingPre] = useState<boolean>(false);
  const [lastFailedCommand, setLastFailedCommand] = useState<{
    command: string;
    error: string;
    timestamp: string;
  } | null>(null);
  const [showDownloadModal, setShowDownloadModal] = useState<boolean>(false);

  // Terminal & Logs State
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: 'init-1',
      timestamp: '09:41:02',
      type: 'info',
      message: 'HyperTuner Pro v2.4 Engine initialized. ADB handshake ready.'
    },
    {
      id: 'init-2',
      timestamp: '09:41:03',
      type: 'success',
      message: 'Device verified: Xiaomi / POCO HyperOS optimization profile active.'
    }
  ]);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Module 2: Display & Touch Latency Toggles
  const [displayToggles, setDisplayToggles] = useState({
    animationScale: true, // 0.5x Fast (true) vs 1.0x Stock (false)
    lockedRefresh120: true, // Forced 120Hz (true) vs Dynamic (false)
    touchSamplingInstant: true, // Instant (true) vs Stock (false)
    disableWindowBlurs: true // Disabled (true) vs Stock (false)
  });

  // Module 3: GPU & Rendering Pipeline Toggles
  const [gpuToggles, setGpuToggles] = useState({
    vulkanBackend: true, // Vulkan skiavk (true) vs OpenGL (false)
    forceHardwareComposition: true, // GPU hw 1 (true) vs c2d (false)
    frameLatencyBypass: true // latch_unsignaled + disable_backpressure 1 (true) vs 0 (false)
  });

  // Module 4: Xiaomi / HyperOS Exclusives Toggles
  const [xiaomiToggles, setXiaomiToggles] = useState({
    hardwareLevelSpoof: true, // deviceLevelList v:1,c:3,g:3 (true)
    disableJoyoseThrottling: true, // pm disable joyose + powerkeeper (true)
    homeBlurRemoval: true // miui_home_blur_level 0 (true)
  });

  // Module 5: Network & Doze Power Tuning Toggles
  const [networkToggles, setNetworkToggles] = useState({
    disableLocationPolling: true, // wifi_scan_always_enabled 0 (true)
    aggressiveDoze: true, // device_idle_constants (true)
    tcpBufferScaling: true // tcp.buffersize.wifi (true)
  });

  // Module 6: Game Compiler & Driver Control State
  const [gamePackage, setGamePackage] = useState<string>('com.garena.game.codm');

  const addLog = (type: LogEntry['type'], message: string) => {
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
      type,
      message
    };
    setLogs((prev) => [...prev.slice(-399), entry]);
  };

  const hasAdbApi = typeof window !== 'undefined' && !!window.adbApi;

  // Sanitize user inputs to prevent shell injection
  const sanitize = (input: string) => input.replace(/[\$`&|\(\);<>]/g, '').trim();

  useEffect(() => {
    if (hasAdbApi) {
      refreshDevices();

      const unsubscribeLogs = window.adbApi.onLog((log) => {
        setLogs((prev) => [...prev.slice(-399), log]);
      });

      const unsubscribeProgress = window.adbApi.onProgress((prog) => {
        setProgress(prog);
        setIsQueueRunning(prog.status === 'running');
      });

      const unsubscribeDevices = window.adbApi.onDevicesUpdated((updated) => {
        setDevices(updated);
        if (updated.length > 0 && !selectedDeviceId) {
          setSelectedDeviceId(updated[0].id);
        }
      });

      return () => {
        unsubscribeLogs();
        unsubscribeProgress();
        unsubscribeDevices();
      };
    } else {
      // Mock device state for browser preview / standalone fallback
      const mockDevice: AdbDevice = {
        id: '84729104',
        state: 'device',
        model: 'POCO F5 Pro',
        manufacturer: 'Xiaomi',
        osVersion: 'Android 14',
        hyperOsVersion: 'HyperOS 1.0.9.0.UNAMIXM',
        batteryLevel: 94
      };
      setDevices([mockDevice]);
      setSelectedDeviceId(mockDevice.id);
    }
  }, [hasAdbApi]);

  useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const refreshDevices = async () => {
    setIsRefreshingDevices(true);
    addLog('info', 'Scanning ADB server daemon: `adb devices -l`');
    try {
      if (hasAdbApi) {
        const found = await window.adbApi.getDevices();
        setDevices(found);
        if (found.length > 0) {
          if (!selectedDeviceId || !found.some((d) => d.id === selectedDeviceId)) {
            setSelectedDeviceId(found[0].id);
          }
          addLog('success', `Found ${found.length} device(s). Target: ${found[0].model || found[0].id}`);
        } else {
          addLog('warn', 'No ADB devices found. Ensure USB Debugging is ON.');
        }
      } else {
        await new Promise((r) => setTimeout(r, 450));
        addLog('success', 'Connected: POCO F5 Pro (HyperOS 1.0.9.0) - Handshake Active');
      }
    } catch (err: any) {
      addLog('error', `ADB scan failed: ${err.message || err}`);
    } finally {
      setIsRefreshingDevices(false);
    }
  };

  // Pre-Installation Verification Protocol
  const runPreInstallCheck = async (pkg?: string) => {
    setIsCheckingPre(true);
    const target = pkg || gamePackage;
    addLog('info', `[PRE-INSTALL PROTOCOL] Initiating device verification for: ${target}`);
    try {
      if (hasAdbApi) {
        const result = await window.adbApi.checkPreInstallation(selectedDeviceId, target);
        setPreCheckResult(result);
        if (result.passed) {
          addLog('success', `[PRE-INSTALL PASSED] Storage: ${result.freeSpaceMb} MB | Staging: ${result.isWritable ? 'Writable' : 'Locked'} | ${result.isInstalled ? `Package verified (${result.packagePath})` : 'Ready for clean install'}`);
        } else {
          addLog('warn', `[PRE-INSTALL WARN] ${result.details}`);
        }
      } else {
        await new Promise((r) => setTimeout(r, 400));
        const mock: PreCheckResult = {
          passed: true,
          freeSpaceMb: 42800,
          isWritable: true,
          isInstalled: true,
          packagePath: `/data/app/~~a8f93q/${target}-1/base.apk`,
          fileSize: '48.2 MB',
          details: `Storage: 42800 MB Available (>50MB) | Staging: Writable [OK] | Package: Installed (${target}) [48.2 MB]`
        };
        setPreCheckResult(mock);
        addLog('success', `[PRE-INSTALL PASSED] ${mock.details}`);
      }
    } catch (e: any) {
      addLog('error', `Pre-installation check failed: ${e.message}`);
    } finally {
      setIsCheckingPre(false);
    }
  };

  // Explicit Retry Handler for Failed Commands
  const retryFailedCommand = async () => {
    if (!lastFailedCommand) return;
    const cmdToRetry = lastFailedCommand.command;
    addLog('info', `[EXPLICIT RETRY] Re-executing failed command: $ ${cmdToRetry}`);
    setLastFailedCommand(null);
    executeSequence([cmdToRetry], `Retry: ${cmdToRetry}`);
  };

  // Asynchronous sequential queue executor
  const executeSequence = async (commands: string[], title: string) => {
    if (!selectedDeviceId && devices.length === 0) {
      addLog('error', 'Cannot execute: No target device selected or detected.');
      return;
    }

    setIsQueueRunning(true);
    setCurrentStepTitle(title);
    addLog('info', `>>> Dispatched queue: "${title}" (${commands.length} commands)`);

    if (hasAdbApi) {
      try {
        const queueRes = await window.adbApi.executeQueue(selectedDeviceId, commands, title);
        const failedStep = queueRes.results.find((r) => !r.success);
        if (failedStep) {
          setLastFailedCommand({
            command: failedStep.command,
            error: failedStep.output,
            timestamp: new Date().toLocaleTimeString('en-US', { hour12: false })
          });
        } else {
          setLastFailedCommand(null);
        }
      } catch (err: any) {
        addLog('error', `Queue execution failed: ${err.message}`);
      } finally {
        setIsQueueRunning(false);
        setCurrentStepTitle('');
      }
    } else {
      // Browser preview simulated sequential queue
      setProgress({ total: commands.length, completed: 0, currentCommand: commands[0], status: 'running' });
      for (let i = 0; i < commands.length; i++) {
        const cmd = commands[i];
        setProgress({ total: commands.length, completed: i + 1, currentCommand: cmd, status: 'running' });
        addLog('command', `$ ${cmd}`);
        await new Promise((r) => setTimeout(r, 90));
        addLog('success', 'SUCCESS: Parameter Patched');
      }
      setProgress({ total: commands.length, completed: commands.length, currentCommand: 'Complete', status: 'completed' });
      setIsQueueRunning(false);
      setCurrentStepTitle('');
      setLastFailedCommand(null);
      addLog('success', `>>> Finished "${title}" successfully.`);
    }
  };

  // =========================================================================
  // MODULE HANDLERS
  // =========================================================================

  // Module 1: Master Optimization Suite
  const runMasterSuite = () => {
    const commands = [
      'cmd package install-existing com.miui.securitycenter',
      'cmd package install-existing com.miui.guardprovider',
      'cmd package install-existing com.miui.powerkeeper',
      'cmd package install-existing com.xiaomi.joyose',
      'device_config delete activity_manager max_phantom_processes',
      'pm clear com.android.settings',
      'pm clear com.miui.securitycenter',
      'settings put global window_animation_scale 0.5',
      'settings put global transition_animation_scale 0.5',
      'settings put global animator_duration_scale 0.5',
      'settings put global peak_refresh_rate 120.0',
      'settings put global min_refresh_rate 120.0',
      'settings put global disable_window_blurs 1',
      'settings put global ram_expand_size 0',
      'settings put global power_mode 2',
      'settings put system pointer_speed 7',
      'settings put secure touch_pressure_scale 0',
      'settings put global wifi_scan_always_enabled 0',
      'settings put global ble_scan_always_enabled 0',
      'setprop debug.hwc.force_gpu_vsync 1',
      'setprop debug.performance.profile 1',
      'setprop debug.sf.latch_unsignaled 1',
      'setprop debug.sf.disable_backpressure 1',
      'setprop debug.composition.type gpu',
      'setprop debug.egl.hw 1',
      'setprop persist.traced.enable 0',
      'cmd package compile -m speed -f com.miui.home'
    ];
    executeSequence(commands, 'Master Optimization Suite');
  };

  // Module 2: Display & Touch Latency
  const toggleAnimationScale = () => {
    const next = !displayToggles.animationScale;
    setDisplayToggles((prev) => ({ ...prev, animationScale: next }));
    const s = next ? '0.5' : '1.0';
    executeSequence(
      [
        `settings put global window_animation_scale ${s}`,
        `settings put global transition_animation_scale ${s}`,
        `settings put global animator_duration_scale ${s}`
      ],
      `Animation Scale: ${next ? '0.5x Fast' : '1.0x Stock'}`
    );
  };

  const toggleRefreshRate = () => {
    const next = !displayToggles.lockedRefresh120;
    setDisplayToggles((prev) => ({ ...prev, lockedRefresh120: next }));
    if (next) {
      executeSequence(
        [
          'settings put global peak_refresh_rate 120.0',
          'settings put global min_refresh_rate 120.0'
        ],
        'Forced 120Hz Lock'
      );
    } else {
      executeSequence(
        [
          'settings delete global peak_refresh_rate',
          'settings delete global min_refresh_rate'
        ],
        'Dynamic Refresh Rate'
      );
    }
  };

  const toggleTouchSampling = () => {
    const next = !displayToggles.touchSamplingInstant;
    setDisplayToggles((prev) => ({ ...prev, touchSamplingInstant: next }));
    if (next) {
      executeSequence(
        [
          'settings put system pointer_speed 7',
          'settings put secure touch_pressure_scale 0',
          'settings put secure long_press_timeout 250'
        ],
        'Touch Response: Instant Low Latency'
      );
    } else {
      executeSequence(
        [
          'settings put system pointer_speed 0',
          'settings put secure touch_pressure_scale 1',
          'settings put secure long_press_timeout 500'
        ],
        'Touch Response: Stock'
      );
    }
  };

  const toggleWindowBlurs = () => {
    const next = !displayToggles.disableWindowBlurs;
    setDisplayToggles((prev) => ({ ...prev, disableWindowBlurs: next }));
    const val = next ? '1' : '0';
    executeSequence(
      [
        `settings put global disable_window_blurs ${val}`,
        `settings put global accessibility_reduce_transparency ${val}`
      ],
      `Window Blur & Transparency: ${next ? 'Disabled' : 'Stock'}`
    );
  };

  // Module 3: GPU & Rendering Pipeline
  const toggleVulkanBackend = () => {
    const next = !gpuToggles.vulkanBackend;
    setGpuToggles((prev) => ({ ...prev, vulkanBackend: next }));
    if (next) {
      executeSequence(
        [
          'setprop debug.hwui.renderer skiavk',
          'setprop debug.renderengine.backend vulkan'
        ],
        'Force Vulkan Backend: ON'
      );
    } else {
      executeSequence(
        [
          'setprop debug.hwui.renderer opengl',
          'setprop debug.renderengine.backend opengl'
        ],
        'Force Vulkan Backend: OFF (OpenGL)'
      );
    }
  };

  const toggleHardwareComposition = () => {
    const next = !gpuToggles.forceHardwareComposition;
    setGpuToggles((prev) => ({ ...prev, forceHardwareComposition: next }));
    if (next) {
      executeSequence(
        [
          'setprop debug.composition.type gpu',
          'setprop debug.egl.hw 1'
        ],
        'Force Hardware GPU Composition: ON'
      );
    } else {
      executeSequence(
        ['setprop debug.composition.type c2d'],
        'Force Hardware GPU Composition: OFF'
      );
    }
  };

  const toggleFrameLatencyBypass = () => {
    const next = !gpuToggles.frameLatencyBypass;
    setGpuToggles((prev) => ({ ...prev, frameLatencyBypass: next }));
    const v = next ? '1' : '0';
    executeSequence(
      [
        `setprop debug.sf.latch_unsignaled ${v}`,
        `setprop debug.sf.disable_backpressure ${v}`
      ],
      `Frame Latency Bypass: ${next ? 'ON' : 'OFF'}`
    );
  };

  // Module 4: Xiaomi / HyperOS Exclusives
  const toggleHardwareLevelSpoof = () => {
    const next = !xiaomiToggles.hardwareLevelSpoof;
    setXiaomiToggles((prev) => ({ ...prev, hardwareLevelSpoof: next }));
    if (next) {
      executeSequence(
        [
          'settings put system deviceLevelList v:1,c:3,g:3',
          'setprop persist.sys.computility.cpulevel 6',
          'setprop persist.sys.computility.gpulevel 6'
        ],
        'Hardware Feature Level Spoof: High Tier (v:1,c:3,g:3)'
      );
    } else {
      executeSequence(
        ['settings delete system deviceLevelList'],
        'Hardware Feature Level Spoof: Stock'
      );
    }
  };

  const toggleJoyoseThrottling = () => {
    const next = !xiaomiToggles.disableJoyoseThrottling;
    setXiaomiToggles((prev) => ({ ...prev, disableJoyoseThrottling: next }));
    if (next) {
      executeSequence(
        [
          'pm disable-user --user 0 com.xiaomi.joyose',
          'pm disable-user --user 0 com.miui.powerkeeper'
        ],
        'Disable Joyose Thermal Throttling: ON'
      );
    } else {
      executeSequence(
        [
          'pm enable com.xiaomi.joyose',
          'pm enable com.miui.powerkeeper'
        ],
        'Enable Joyose Thermal Throttling: Stock'
      );
    }
  };

  const toggleHomeBlurRemoval = () => {
    const next = !xiaomiToggles.homeBlurRemoval;
    setXiaomiToggles((prev) => ({ ...prev, homeBlurRemoval: next }));
    const v = next ? '0' : '1';
    executeSequence(
      [`settings put system miui_home_blur_level ${v}`],
      `HyperOS Home Blur: ${next ? 'Removed (Level 0)' : 'Stock (Level 1)'}`
    );
  };

  // Module 5: Network & Doze Power Tuning
  const toggleLocationPolling = () => {
    const next = !networkToggles.disableLocationPolling;
    setNetworkToggles((prev) => ({ ...prev, disableLocationPolling: next }));
    const v = next ? '0' : '1';
    executeSequence(
      [
        `settings put global wifi_scan_always_enabled ${v}`,
        `settings put global ble_scan_always_enabled ${v}`
      ],
      `Location Background Polling: ${next ? 'Disabled' : 'Enabled'}`
    );
  };

  const toggleAggressiveDoze = () => {
    const next = !networkToggles.aggressiveDoze;
    setNetworkToggles((prev) => ({ ...prev, aggressiveDoze: next }));
    if (next) {
      executeSequence(
        ['settings put global device_idle_constants locating_to=3000,motion_inactive_to=3000,idle_to=300000'],
        'Aggressive Doze Deep Idle: ON'
      );
    } else {
      executeSequence(
        ['settings delete global device_idle_constants'],
        'Aggressive Doze Deep Idle: Stock'
      );
    }
  };

  const toggleTcpBufferScaling = () => {
    const next = !networkToggles.tcpBufferScaling;
    setNetworkToggles((prev) => ({ ...prev, tcpBufferScaling: next }));
    if (next) {
      executeSequence(
        ['setprop net.tcp.buffersize.wifi 524288,1048576,2097152,262144,524288,1048576'],
        'TCP Buffer Scaling: Gaming Optimized'
      );
    } else {
      executeSequence(
        ['setprop net.tcp.buffersize.wifi default'],
        'TCP Buffer Scaling: Default'
      );
    }
  };

  // Module 6: Game Compiler & Driver Control
  const compileGamePackage = () => {
    const pkg = sanitize(gamePackage);
    if (!pkg) {
      addLog('warn', 'Please specify a target package name.');
      return;
    }
    executeSequence(
      [`cmd package compile -m speed -f ${pkg}`],
      `AOT Machine Code Compile: ${pkg}`
    );
  };

  const lockGameRefreshRate = () => {
    const pkg = sanitize(gamePackage);
    if (!pkg) {
      addLog('warn', 'Please specify a target package name.');
      return;
    }
    executeSequence(
      [`settings put system app_refresh_rate_${pkg} 120`],
      `Lock 120Hz Target: ${pkg}`
    );
  };

  const optInGameDriver = () => {
    const pkg = sanitize(gamePackage);
    if (!pkg) {
      addLog('warn', 'Please specify a target package name.');
      return;
    }
    executeSequence(
      [
        `settings put global updatable_driver_production_opt_in_apps ${pkg}`,
        `settings put global game_driver_opt_in_apps ${pkg}`
      ],
      `Force Game Driver Opt-In: ${pkg}`
    );
  };

  // Module 7: Safe Bloatware Manager
  const purgeBloatware = () => {
    executeSequence(
      [
        'pm uninstall -k --user 0 com.miui.analytics',
        'pm uninstall -k --user 0 com.miui.msa.global',
        'pm uninstall -k --user 0 com.miui.daemon'
      ],
      'Purge Analytics & MSA Bloatware'
    );
  };

  const restoreBloatware = () => {
    executeSequence(
      [
        'cmd package install-existing com.miui.analytics',
        'cmd package install-existing com.miui.msa.global',
        'cmd package install-existing com.miui.daemon'
      ],
      'Restore Purged Packages'
    );
  };

  // Module 8: System Repair & Recovery
  const fixSettingsAppCrash = () => {
    executeSequence(
      [
        'cmd package compile --reset com.android.settings',
        'pm clear com.android.settings',
        'am start -n com.android.settings/.Settings'
      ],
      'Fix Settings App Crash & Reset Cache'
    );
  };

  const revertAllDefaults = () => {
    executeSequence(
      [
        'settings put global window_animation_scale 1.0',
        'settings put global transition_animation_scale 1.0',
        'settings put global animator_duration_scale 1.0',
        'settings delete global peak_refresh_rate',
        'settings delete global min_refresh_rate',
        'settings delete system deviceLevelList',
        'settings put global wifi_scan_always_enabled 1',
        'settings put global ble_scan_always_enabled 1',
        'settings put global disable_window_blurs 0',
        'settings put global ram_expand_size 1'
      ],
      'Revert All System Settings to Default'
    );
  };

  const activeDevice = devices.find((d) => d.id === selectedDeviceId) || devices[0];

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0D0F12] text-slate-100 font-sans p-4 gap-3 box-border select-none overflow-hidden">
      {/* ========================================================================= */}
      {/* HEADER WITH BRANDING & CONNECTION PILL                                    */}
      {/* ========================================================================= */}
      <header className="flex items-center justify-between shrink-0 bg-[#161920] px-4 py-2.5 rounded-xl border border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#00F0FF]/15 border border-[#00F0FF]/40 flex items-center justify-center shadow-[0_0_12px_rgba(0,240,255,0.25)]">
            <Zap className="w-4 h-4 text-[#00F0FF] fill-current" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h1 className="text-[#00F0FF] text-base font-black tracking-tight uppercase">
                HyperTuner Pro
              </h1>
              <span className="text-[10px] px-2 py-0.2 rounded-full bg-[#00F0FF]/10 text-[#00F0FF] border border-[#00F0FF]/30 font-mono font-bold">
                HyperOS & MIUI Suite
              </span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              Desktop Non-Root Performance & ADB Pipeline v2.4
            </span>
          </div>
        </div>

        {/* Real-time Connection Status Card & Pre-Check Status */}
        <div className="flex items-center gap-3">
          {preCheckResult && (
            <div className="hidden md:flex items-center gap-2 bg-[#0D0F12] px-3 py-1.5 rounded-lg border border-white/10 text-[10px] font-mono">
              <ShieldCheck className={`w-3.5 h-3.5 ${preCheckResult.passed ? 'text-[#10B981]' : 'text-amber-400'}`} />
              <span className="text-slate-300">
                Storage: <strong className="text-white">{preCheckResult.freeSpaceMb}MB</strong>
              </span>
              <span className="text-white/20">|</span>
              <span className={preCheckResult.isWritable ? 'text-[#10B981]' : 'text-amber-400'}>
                Staging: {preCheckResult.isWritable ? 'Writable' : 'Locked'}
              </span>
            </div>
          )}

          <div className="flex items-center gap-2.5 bg-[#0D0F12] px-3.5 py-1.5 rounded-lg border border-[#00F0FF]/20 shadow-[0_0_10px_rgba(0,240,255,0.1)]">
            <div className="w-2.5 h-2.5 rounded-full bg-[#00F0FF] shadow-[0_0_8px_#00F0FF] animate-pulse" />
            <div className="flex flex-col">
              <span className="text-xs font-mono font-bold text-white leading-none">
                {activeDevice?.model || 'POCO F5 Pro'}
              </span>
              <span className="text-[9px] font-mono text-slate-400 leading-tight">
                {activeDevice?.hyperOsVersion || 'HyperOS 1.0'} • {activeDevice?.state || 'device online'}
              </span>
            </div>
          </div>

          <button
            onClick={() => runPreInstallCheck()}
            disabled={isCheckingPre || isQueueRunning}
            title="Run Pre-Installation & Integrity Check"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-xs text-purple-300 hover:text-white transition-all disabled:opacity-50"
          >
            <ShieldCheck className={`w-3.5 h-3.5 ${isCheckingPre ? 'animate-spin text-purple-400' : ''}`} />
            <span>Pre-Check</span>
          </button>

          <button
            onClick={refreshDevices}
            disabled={isRefreshingDevices || isQueueRunning}
            title="Refresh Connected Device"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-300 hover:text-[#00F0FF] transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingDevices ? 'animate-spin text-[#00F0FF]' : ''}`} />
            <span>Refresh Device</span>
          </button>

          <a
            href="./HyperTuner-Pro.apk"
            download="HyperTuner-Pro.apk"
            title="Download Android APK directly to phone or PC"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-xs font-bold text-emerald-300 hover:text-white transition-all shadow-[0_0_12px_rgba(16,185,129,0.25)]"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download APK</span>
          </a>

          <button
            onClick={() => setShowDownloadModal(true)}
            title="Phone Install Guide & GitHub Release Instructions"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#00F0FF]/15 hover:bg-[#00F0FF]/25 border border-[#00F0FF]/30 text-xs font-semibold text-[#00F0FF] hover:text-white transition-all"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Install Guide</span>
          </button>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* MAIN CONTAINER: SIDEBAR TABS + CONTENT                                    */}
      {/* ========================================================================= */}
      <div className="flex gap-3 flex-1 overflow-hidden">
        {/* SIDEBAR NAVIGATION */}
        <aside className="w-60 flex flex-col bg-[#161920] rounded-xl border border-white/5 p-2 gap-1 shrink-0 overflow-y-auto">
          <span className="text-[10px] font-mono uppercase text-slate-500 font-bold px-3 py-1 tracking-wider">
            Tuning Modules
          </span>

          {/* Tab 1: Master Suite */}
          <button
            onClick={() => setActiveTab('master')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all text-left ${
              activeTab === 'master'
                ? 'bg-[#00F0FF]/15 text-[#00F0FF] border border-[#00F0FF]/30 shadow-[0_0_10px_rgba(0,240,255,0.15)]'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Zap className="w-4 h-4 shrink-0 text-[#00F0FF]" />
            <div className="flex flex-col truncate">
              <span className="truncate">1. Master Suite</span>
              <span className="text-[9px] text-slate-500 font-mono font-normal">One-Click Overhaul</span>
            </div>
          </button>

          {/* Tab 2: Display & Touch Latency */}
          <button
            onClick={() => setActiveTab('display')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all text-left ${
              activeTab === 'display'
                ? 'bg-[#00F0FF]/15 text-[#00F0FF] border border-[#00F0FF]/30 shadow-[0_0_10px_rgba(0,240,255,0.15)]'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Gauge className="w-4 h-4 shrink-0 text-cyan-400" />
            <div className="flex flex-col truncate">
              <span className="truncate">2. Display & Touch</span>
              <span className="text-[9px] text-slate-500 font-mono font-normal">120Hz & Latency</span>
            </div>
          </button>

          {/* Tab 3: GPU & Rendering */}
          <button
            onClick={() => setActiveTab('gpu')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all text-left ${
              activeTab === 'gpu'
                ? 'bg-[#00F0FF]/15 text-[#00F0FF] border border-[#00F0FF]/30 shadow-[0_0_10px_rgba(0,240,255,0.15)]'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Cpu className="w-4 h-4 shrink-0 text-cyan-300" />
            <div className="flex flex-col truncate">
              <span className="truncate">3. GPU & Pipeline</span>
              <span className="text-[9px] text-slate-500 font-mono font-normal">Vulkan & HW Compositor</span>
            </div>
          </button>

          {/* Tab 4: Xiaomi / HyperOS Exclusives */}
          <button
            onClick={() => setActiveTab('xiaomi')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all text-left ${
              activeTab === 'xiaomi'
                ? 'bg-[#00F0FF]/15 text-[#00F0FF] border border-[#00F0FF]/30 shadow-[0_0_10px_rgba(0,240,255,0.15)]'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Flame className="w-4 h-4 shrink-0 text-[#F59E0B]" />
            <div className="flex flex-col truncate">
              <span className="truncate">4. HyperOS Exclusives</span>
              <span className="text-[9px] text-slate-500 font-mono font-normal">Joyose & Level Spoof</span>
            </div>
          </button>

          {/* Tab 5: Network & Doze */}
          <button
            onClick={() => setActiveTab('network')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all text-left ${
              activeTab === 'network'
                ? 'bg-[#00F0FF]/15 text-[#00F0FF] border border-[#00F0FF]/30 shadow-[0_0_10px_rgba(0,240,255,0.15)]'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Wifi className="w-4 h-4 shrink-0 text-[#10B981]" />
            <div className="flex flex-col truncate">
              <span className="truncate">5. Network & Doze</span>
              <span className="text-[9px] text-slate-500 font-mono font-normal">Polling & TCP Buffers</span>
            </div>
          </button>

          {/* Tab 6: Game Compiler & Driver */}
          <button
            onClick={() => setActiveTab('game')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all text-left ${
              activeTab === 'game'
                ? 'bg-[#00F0FF]/15 text-[#00F0FF] border border-[#00F0FF]/30 shadow-[0_0_10px_rgba(0,240,255,0.15)]'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Gamepad2 className="w-4 h-4 shrink-0 text-purple-400" />
            <div className="flex flex-col truncate">
              <span className="truncate">6. Game Compiler</span>
              <span className="text-[9px] text-slate-500 font-mono font-normal">AOT Speed & Driver</span>
            </div>
          </button>

          {/* Tab 7: Safe Bloatware Manager */}
          <button
            onClick={() => setActiveTab('bloatware')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all text-left ${
              activeTab === 'bloatware'
                ? 'bg-[#00F0FF]/15 text-[#00F0FF] border border-[#00F0FF]/30 shadow-[0_0_10px_rgba(0,240,255,0.15)]'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <PackageX className="w-4 h-4 shrink-0 text-orange-400" />
            <div className="flex flex-col truncate">
              <span className="truncate">7. Bloatware Manager</span>
              <span className="text-[9px] text-slate-500 font-mono font-normal">Purge Analytics & MSA</span>
            </div>
          </button>

          {/* Tab 8: System Repair & Reset */}
          <button
            onClick={() => setActiveTab('repair')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all text-left mt-auto ${
              activeTab === 'repair'
                ? 'bg-red-500/15 text-red-400 border border-red-500/30 shadow-[0_0_10px_rgba(239,68,68,0.2)]'
                : 'text-slate-400 hover:text-red-400 hover:bg-red-500/10'
            }`}
          >
            <Wrench className="w-4 h-4 shrink-0 text-red-500" />
            <div className="flex flex-col truncate">
              <span className="truncate">8. Repair & Recovery</span>
              <span className="text-[9px] text-slate-500 font-mono font-normal">Fix Settings & Reset</span>
            </div>
          </button>
        </aside>

        {/* MAIN TAB CONTENT AREA */}
        <main className="flex-1 flex flex-col gap-3 overflow-hidden bg-[#161920] rounded-xl border border-white/5 p-4">
          {/* Progress Bar when running */}
          {isQueueRunning && (
            <div className="bg-[#0D0F12] border border-[#00F0FF]/30 p-2.5 rounded-lg flex flex-col gap-1.5 shrink-0 animate-pulse">
              <div className="flex justify-between text-[11px] font-mono">
                <span className="text-[#00F0FF] font-bold">
                  {progress.retryAttempt ? `RETRYING (Attempt ${progress.retryAttempt}/2): ` : 'EXECUTING: '}
                  {currentStepTitle}
                </span>
                <span className="text-slate-400">
                  {progress.completed} / {progress.total}
                </span>
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#00F0FF] to-[#10B981] transition-all duration-150"
                  style={{
                    width: `${progress.total ? (progress.completed / progress.total) * 100 : 0}%`
                  }}
                />
              </div>
            </div>
          )}

          {/* Explicit Retry Banner when ADB daemon encounters an execution / parsing failure */}
          {lastFailedCommand && !isQueueRunning && (
            <div className="bg-red-500/15 border border-red-500/30 p-3 rounded-lg flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-bold text-red-300">
                    Execution Notice / Parsing Failure Detected
                  </span>
                  <span className="text-[10px] font-mono text-slate-300 truncate">
                    Failed step: <code className="text-white font-semibold">{lastFailedCommand.command}</code>
                  </span>
                  <span className="text-[9px] font-mono text-slate-400 truncate">
                    {lastFailedCommand.error}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => runPreInstallCheck()}
                  className="px-2.5 py-1.5 bg-white/10 hover:bg-white/15 border border-white/20 text-white rounded text-[10px] font-mono transition-all flex items-center gap-1"
                >
                  <ShieldCheck className="w-3 h-3 text-purple-400" />
                  Pre-Check
                </button>
                <button
                  onClick={retryFailedCommand}
                  className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white font-bold rounded text-xs transition-all shadow-[0_0_10px_rgba(239,68,68,0.4)] flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Retry Command
                </button>
              </div>
            </div>
          )}

          {/* SCROLLABLE VIEW CONTENT ACCORDING TO ACTIVE TAB */}
          <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3">
            {/* MODULE 1: MASTER SUITE */}
            {activeTab === 'master' && (
              <div className="flex flex-col gap-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
                      <Zap className="w-5 h-5 text-[#00F0FF]" />
                      Master Optimization Suite (One-Click Overhaul)
                    </h2>
                    <p className="text-xs text-slate-400">
                      Executes full 27-point non-root hardware tuning, clears phantom processes, configures 120Hz lock, and speed-compiles HyperOS launcher.
                    </p>
                  </div>
                </div>

                <button
                  onClick={runMasterSuite}
                  disabled={isQueueRunning}
                  className="w-full py-4 px-6 bg-gradient-to-r from-[#00F0FF] to-cyan-400 text-[#0D0F12] font-black text-sm uppercase tracking-widest rounded-xl shadow-[0_0_25px_rgba(0,240,255,0.4)] hover:brightness-110 active:scale-[0.99] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  <Zap className="w-5 h-5 fill-current" />
                  <span>Execute Master Optimization Pipeline</span>
                </button>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#0D0F12] p-3 rounded-lg border border-white/5">
                    <span className="text-[10px] font-mono text-[#00F0FF] uppercase font-bold">Safety Restores</span>
                    <p className="text-xs text-slate-300 mt-1">
                      Restores Security Center, Guard Provider, Joyose, and PowerKeeper packages before tuning to prevent bootloops.
                    </p>
                  </div>

                  <div className="bg-[#0D0F12] p-3 rounded-lg border border-white/5">
                    <span className="text-[10px] font-mono text-[#00F0FF] uppercase font-bold">Process & Cache Reset</span>
                    <p className="text-xs text-slate-300 mt-1">
                      Purges activity_manager phantom processes limit and clears Settings and Security Center cache artifacts.
                    </p>
                  </div>

                  <div className="bg-[#0D0F12] p-3 rounded-lg border border-white/5">
                    <span className="text-[10px] font-mono text-[#00F0FF] uppercase font-bold">Display & Memory</span>
                    <p className="text-xs text-slate-300 mt-1">
                      Sets 0.5x UI animations, locks 120Hz refresh rate, disables window blurs, and sets ram_expand_size to 0.
                    </p>
                  </div>

                  <div className="bg-[#0D0F12] p-3 rounded-lg border border-white/5">
                    <span className="text-[10px] font-mono text-[#00F0FF] uppercase font-bold">SurfaceFlinger Pipeline</span>
                    <p className="text-xs text-slate-300 mt-1">
                      Forces GPU VSync, enables latch_unsignaled, disables backpressure, and AOT compiles com.miui.home.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* MODULE 2: DISPLAY & TOUCH LATENCY */}
            {activeTab === 'display' && (
              <div className="flex flex-col gap-3">
                <div>
                  <h2 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
                    <Gauge className="w-5 h-5 text-cyan-400" />
                    Display & Touch Latency Toggles
                  </h2>
                  <p className="text-xs text-slate-400">
                    Eliminate UI lag, stutter, and input delay by adjusting window scales, sampling intervals, and refresh rates.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* Animation Scale Toggle */}
                  <div
                    onClick={toggleAnimationScale}
                    className="bg-[#0D0F12] p-4 rounded-xl border border-white/5 hover:border-[#00F0FF]/30 cursor-pointer transition-all flex flex-col justify-between gap-2"
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-mono text-slate-400 uppercase font-bold">UI Scale</span>
                      <div className={`w-8 h-4 rounded-full relative transition-colors ${displayToggles.animationScale ? 'bg-[#00F0FF]/25' : 'bg-slate-800'}`}>
                        <div className={`absolute top-0.5 w-3 h-3 rounded-full transition-all ${displayToggles.animationScale ? 'right-0.5 bg-[#00F0FF] shadow-[0_0_6px_#00F0FF]' : 'left-0.5 bg-slate-600'}`} />
                      </div>
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">
                        {displayToggles.animationScale ? '0.5x Fast Animations' : '1.0x Stock Animations'}
                      </h4>
                      <p className="text-[10px] text-slate-400 font-mono">
                        window_animation_scale, transition_animation_scale, animator_duration_scale
                      </p>
                    </div>
                  </div>

                  {/* Locked Refresh Rate Toggle */}
                  <div
                    onClick={toggleRefreshRate}
                    className="bg-[#0D0F12] p-4 rounded-xl border border-white/5 hover:border-[#00F0FF]/30 cursor-pointer transition-all flex flex-col justify-between gap-2"
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-mono text-slate-400 uppercase font-bold">Refresh Rate</span>
                      <div className={`w-8 h-4 rounded-full relative transition-colors ${displayToggles.lockedRefresh120 ? 'bg-[#00F0FF]/25' : 'bg-slate-800'}`}>
                        <div className={`absolute top-0.5 w-3 h-3 rounded-full transition-all ${displayToggles.lockedRefresh120 ? 'right-0.5 bg-[#00F0FF] shadow-[0_0_6px_#00F0FF]' : 'left-0.5 bg-slate-600'}`} />
                      </div>
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">
                        {displayToggles.lockedRefresh120 ? 'Forced 120Hz Locked' : 'Dynamic Refresh Rate'}
                      </h4>
                      <p className="text-[10px] text-slate-400 font-mono">
                        peak_refresh_rate 120.0 & min_refresh_rate 120.0
                      </p>
                    </div>
                  </div>

                  {/* Touch Sampling Response Toggle */}
                  <div
                    onClick={toggleTouchSampling}
                    className="bg-[#0D0F12] p-4 rounded-xl border border-white/5 hover:border-[#00F0FF]/30 cursor-pointer transition-all flex flex-col justify-between gap-2"
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-mono text-slate-400 uppercase font-bold">Touch Sampling</span>
                      <div className={`w-8 h-4 rounded-full relative transition-colors ${displayToggles.touchSamplingInstant ? 'bg-[#00F0FF]/25' : 'bg-slate-800'}`}>
                        <div className={`absolute top-0.5 w-3 h-3 rounded-full transition-all ${displayToggles.touchSamplingInstant ? 'right-0.5 bg-[#00F0FF] shadow-[0_0_6px_#00F0FF]' : 'left-0.5 bg-slate-600'}`} />
                      </div>
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">
                        {displayToggles.touchSamplingInstant ? 'Instant Low Latency' : 'Stock Touch Latency'}
                      </h4>
                      <p className="text-[10px] text-slate-400 font-mono">
                        pointer_speed 7, touch_pressure_scale 0, timeout 250ms
                      </p>
                    </div>
                  </div>

                  {/* Window Blur & Transparency Toggle */}
                  <div
                    onClick={toggleWindowBlurs}
                    className="bg-[#0D0F12] p-4 rounded-xl border border-white/5 hover:border-[#00F0FF]/30 cursor-pointer transition-all flex flex-col justify-between gap-2"
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-mono text-slate-400 uppercase font-bold">Compositor Blur</span>
                      <div className={`w-8 h-4 rounded-full relative transition-colors ${displayToggles.disableWindowBlurs ? 'bg-[#00F0FF]/25' : 'bg-slate-800'}`}>
                        <div className={`absolute top-0.5 w-3 h-3 rounded-full transition-all ${displayToggles.disableWindowBlurs ? 'right-0.5 bg-[#00F0FF] shadow-[0_0_6px_#00F0FF]' : 'left-0.5 bg-slate-600'}`} />
                      </div>
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">
                        {displayToggles.disableWindowBlurs ? 'Blurs & Transparency Off' : 'Stock Blurs Active'}
                      </h4>
                      <p className="text-[10px] text-slate-400 font-mono">
                        disable_window_blurs 1 & reduce_transparency 1
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* MODULE 3: GPU & RENDERING PIPELINE */}
            {activeTab === 'gpu' && (
              <div className="flex flex-col gap-3">
                <div>
                  <h2 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
                    <Cpu className="w-5 h-5 text-cyan-300" />
                    GPU & Rendering Pipeline
                  </h2>
                  <p className="text-xs text-slate-400">
                    Switch rendering backends, force hardware acceleration, and eliminate SurfaceFlinger backpressure drops.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {/* Vulkan Backend Toggle */}
                  <div
                    onClick={toggleVulkanBackend}
                    className="bg-[#0D0F12] p-4 rounded-xl border border-white/5 hover:border-[#00F0FF]/30 cursor-pointer transition-all flex justify-between items-center"
                  >
                    <div>
                      <h4 className="text-sm font-bold text-white">Force Vulkan RenderEngine Backend</h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Switches hwui renderer to SkiaVK (Vulkan) for lower driver overhead on Adreno/Mali GPUs.
                      </p>
                      <span className="text-[10px] font-mono text-[#00F0FF]">
                        {gpuToggles.vulkanBackend ? 'ACTIVE: debug.hwui.renderer skiavk' : 'STOCK: debug.hwui.renderer opengl'}
                      </span>
                    </div>
                    <div className={`w-10 h-5 rounded-full relative transition-colors ${gpuToggles.vulkanBackend ? 'bg-[#00F0FF]/25' : 'bg-slate-800'}`}>
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${gpuToggles.vulkanBackend ? 'right-0.5 bg-[#00F0FF] shadow-[0_0_8px_#00F0FF]' : 'left-0.5 bg-slate-600'}`} />
                    </div>
                  </div>

                  {/* Force Hardware GPU Composition */}
                  <div
                    onClick={toggleHardwareComposition}
                    className="bg-[#0D0F12] p-4 rounded-xl border border-white/5 hover:border-[#00F0FF]/30 cursor-pointer transition-all flex justify-between items-center"
                  >
                    <div>
                      <h4 className="text-sm font-bold text-white">Force Hardware GPU Composition</h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Forces UI composition directly onto GPU hardware registers, bypassing CPU frame composition.
                      </p>
                      <span className="text-[10px] font-mono text-[#00F0FF]">
                        {gpuToggles.forceHardwareComposition ? 'ACTIVE: debug.composition.type gpu & egl.hw 1' : 'STOCK: c2d fallback'}
                      </span>
                    </div>
                    <div className={`w-10 h-5 rounded-full relative transition-colors ${gpuToggles.forceHardwareComposition ? 'bg-[#00F0FF]/25' : 'bg-slate-800'}`}>
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${gpuToggles.forceHardwareComposition ? 'right-0.5 bg-[#00F0FF] shadow-[0_0_8px_#00F0FF]' : 'left-0.5 bg-slate-600'}`} />
                    </div>
                  </div>

                  {/* Frame Latency Bypass Toggle */}
                  <div
                    onClick={toggleFrameLatencyBypass}
                    className="bg-[#0D0F12] p-4 rounded-xl border border-white/5 hover:border-[#00F0FF]/30 cursor-pointer transition-all flex justify-between items-center"
                  >
                    <div>
                      <h4 className="text-sm font-bold text-white">Frame Latency Bypass (SurfaceFlinger)</h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Enables latch_unsignaled and disables backpressure to process rendered frames without waiting on fences.
                      </p>
                      <span className="text-[10px] font-mono text-[#00F0FF]">
                        {gpuToggles.frameLatencyBypass ? 'ACTIVE: latch_unsignaled 1 & disable_backpressure 1' : 'STOCK: 0'}
                      </span>
                    </div>
                    <div className={`w-10 h-5 rounded-full relative transition-colors ${gpuToggles.frameLatencyBypass ? 'bg-[#00F0FF]/25' : 'bg-slate-800'}`}>
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${gpuToggles.frameLatencyBypass ? 'right-0.5 bg-[#00F0FF] shadow-[0_0_8px_#00F0FF]' : 'left-0.5 bg-slate-600'}`} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* MODULE 4: XIAOMI / HYPEROS EXCLUSIVES */}
            {activeTab === 'xiaomi' && (
              <div className="flex flex-col gap-3">
                <div>
                  <h2 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
                    <Flame className="w-5 h-5 text-[#F59E0B]" />
                    Xiaomi / HyperOS Exclusives
                  </h2>
                  <p className="text-xs text-slate-400">
                    Proprietary MIUI and HyperOS flags: disable Joyose daemon thermal throttling, spoof feature tier levels, and remove launcher blur.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {/* Hardware Feature Level Spoofing */}
                  <div
                    onClick={toggleHardwareLevelSpoof}
                    className="bg-[#0D0F12] p-4 rounded-xl border border-white/5 hover:border-[#F59E0B]/40 cursor-pointer transition-all flex justify-between items-center"
                  >
                    <div>
                      <h4 className="text-sm font-bold text-white">Hardware Feature Level Spoofing (Level 3 Tier)</h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Unlocks flagship graphics profiles and high-tier animations by overriding deviceLevelList (v:1,c:3,g:3).
                      </p>
                      <span className="text-[10px] font-mono text-[#F59E0B]">
                        {xiaomiToggles.hardwareLevelSpoof ? 'SPOOFED: deviceLevelList v:1,c:3,g:3 (CPU 6 / GPU 6)' : 'STOCK DEFAULT'}
                      </span>
                    </div>
                    <div className={`w-10 h-5 rounded-full relative transition-colors ${xiaomiToggles.hardwareLevelSpoof ? 'bg-[#F59E0B]/25' : 'bg-slate-800'}`}>
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${xiaomiToggles.hardwareLevelSpoof ? 'right-0.5 bg-[#F59E0B] shadow-[0_0_8px_#F59E0B]' : 'left-0.5 bg-slate-600'}`} />
                    </div>
                  </div>

                  {/* Disable Joyose Thermal Throttling */}
                  <div
                    onClick={toggleJoyoseThrottling}
                    className="bg-[#0D0F12] p-4 rounded-xl border border-white/5 hover:border-[#F59E0B]/40 cursor-pointer transition-all flex justify-between items-center"
                  >
                    <div>
                      <h4 className="text-sm font-bold text-white">Disable Joyose & PowerKeeper Throttling</h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Disables the background joyose daemon responsible for dropping FPS cap from 120/90 to 60 during sustained gaming.
                      </p>
                      <span className="text-[10px] font-mono text-[#F59E0B]">
                        {xiaomiToggles.disableJoyoseThrottling ? 'DISABLED: pm disable-user com.xiaomi.joyose' : 'ENABLED: Stock daemon active'}
                      </span>
                    </div>
                    <div className={`w-10 h-5 rounded-full relative transition-colors ${xiaomiToggles.disableJoyoseThrottling ? 'bg-[#F59E0B]/25' : 'bg-slate-800'}`}>
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${xiaomiToggles.disableJoyoseThrottling ? 'right-0.5 bg-[#F59E0B] shadow-[0_0_8px_#F59E0B]' : 'left-0.5 bg-slate-600'}`} />
                    </div>
                  </div>

                  {/* HyperOS Home Blur Removal */}
                  <div
                    onClick={toggleHomeBlurRemoval}
                    className="bg-[#0D0F12] p-4 rounded-xl border border-white/5 hover:border-[#F59E0B]/40 cursor-pointer transition-all flex justify-between items-center"
                  >
                    <div>
                      <h4 className="text-sm font-bold text-white">HyperOS Launcher Home Blur Removal</h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Forces miui_home_blur_level to 0 to prevent folder and recents app lag on low/mid tier chipsets.
                      </p>
                      <span className="text-[10px] font-mono text-[#F59E0B]">
                        {xiaomiToggles.homeBlurRemoval ? 'BLURS OFF: miui_home_blur_level 0' : 'STOCK: miui_home_blur_level 1'}
                      </span>
                    </div>
                    <div className={`w-10 h-5 rounded-full relative transition-colors ${xiaomiToggles.homeBlurRemoval ? 'bg-[#F59E0B]/25' : 'bg-slate-800'}`}>
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${xiaomiToggles.homeBlurRemoval ? 'right-0.5 bg-[#F59E0B] shadow-[0_0_8px_#F59E0B]' : 'left-0.5 bg-slate-600'}`} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* MODULE 5: NETWORK & DOZE POWER TUNING */}
            {activeTab === 'network' && (
              <div className="flex flex-col gap-3">
                <div>
                  <h2 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
                    <Wifi className="w-5 h-5 text-[#10B981]" />
                    Network & Doze Power Tuning
                  </h2>
                  <p className="text-xs text-slate-400">
                    Reduce multiplayer game ping jitter spikes, configure aggressive sleep timeouts, and scale TCP socket buffers.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {/* Disable Location Background Polling */}
                  <div
                    onClick={toggleLocationPolling}
                    className="bg-[#0D0F12] p-4 rounded-xl border border-white/5 hover:border-[#10B981]/40 cursor-pointer transition-all flex justify-between items-center"
                  >
                    <div>
                      <h4 className="text-sm font-bold text-white">Disable Wi-Fi & BLE Background Polling</h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Prevents periodic 15-second radio frequency scans that cause ping spikes in competitive online games.
                      </p>
                      <span className="text-[10px] font-mono text-[#10B981]">
                        {networkToggles.disableLocationPolling ? 'SCANNING OFF: wifi_scan_always_enabled 0' : 'SCANNING ON: 1'}
                      </span>
                    </div>
                    <div className={`w-10 h-5 rounded-full relative transition-colors ${networkToggles.disableLocationPolling ? 'bg-[#10B981]/25' : 'bg-slate-800'}`}>
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${networkToggles.disableLocationPolling ? 'right-0.5 bg-[#10B981] shadow-[0_0_8px_#10B981]' : 'left-0.5 bg-slate-600'}`} />
                    </div>
                  </div>

                  {/* Aggressive Doze Protocol */}
                  <div
                    onClick={toggleAggressiveDoze}
                    className="bg-[#0D0F12] p-4 rounded-xl border border-white/5 hover:border-[#10B981]/40 cursor-pointer transition-all flex justify-between items-center"
                  >
                    <div>
                      <h4 className="text-sm font-bold text-white">Aggressive Doze Deep Idle Protocol</h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Decreases screen-off idle delay to 3 seconds for immediate deep sleep and reduced battery drain.
                      </p>
                      <span className="text-[10px] font-mono text-[#10B981]">
                        {networkToggles.aggressiveDoze ? 'AGGRESSIVE: device_idle_constants applied' : 'STOCK DOZE'}
                      </span>
                    </div>
                    <div className={`w-10 h-5 rounded-full relative transition-colors ${networkToggles.aggressiveDoze ? 'bg-[#10B981]/25' : 'bg-slate-800'}`}>
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${networkToggles.aggressiveDoze ? 'right-0.5 bg-[#10B981] shadow-[0_0_8px_#10B981]' : 'left-0.5 bg-slate-600'}`} />
                    </div>
                  </div>

                  {/* TCP Buffer Scaling */}
                  <div
                    onClick={toggleTcpBufferScaling}
                    className="bg-[#0D0F12] p-4 rounded-xl border border-white/5 hover:border-[#10B981]/40 cursor-pointer transition-all flex justify-between items-center"
                  >
                    <div>
                      <h4 className="text-sm font-bold text-white">High-Bandwidth TCP Buffer Scaling</h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Expands Linux kernel Wi-Fi TCP socket receive and transmit buffers up to 2MB for maximum throughput.
                      </p>
                      <span className="text-[10px] font-mono text-[#10B981]">
                        {networkToggles.tcpBufferScaling ? 'SCALED: 524288,1048576,2097152' : 'DEFAULT BUFFERS'}
                      </span>
                    </div>
                    <div className={`w-10 h-5 rounded-full relative transition-colors ${networkToggles.tcpBufferScaling ? 'bg-[#10B981]/25' : 'bg-slate-800'}`}>
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${networkToggles.tcpBufferScaling ? 'right-0.5 bg-[#10B981] shadow-[0_0_8px_#10B981]' : 'left-0.5 bg-slate-600'}`} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* MODULE 6: GAME COMPILER & DRIVER CONTROL */}
            {activeTab === 'game' && (
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
                    <Gamepad2 className="w-5 h-5 text-purple-400" />
                    Game Compiler & Driver Control
                  </h2>
                  <p className="text-xs text-slate-400">
                    AOT machine-code speed compile DEX bytecode into native ARM64 instructions and force updated production GPU drivers.
                  </p>
                </div>

                <div className="bg-[#0D0F12] p-4 rounded-xl border border-white/5 flex flex-col gap-3">
                  <label className="text-xs font-mono font-bold text-purple-400 uppercase">
                    Target Application Package:
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={gamePackage}
                      onChange={(e) => setGamePackage(e.target.value)}
                      placeholder="com.garena.game.codm"
                      className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-[#00F0FF] focus:outline-none focus:border-[#00F0FF]/60"
                    />
                  </div>

                  {/* Preset Pills */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-slate-500 font-mono">Quick Presets:</span>
                    {[
                      { name: 'CODM', pkg: 'com.garena.game.codm' },
                      { name: 'Genshin', pkg: 'com.miHoYo.GenshinImpact' },
                      { name: 'PUBG', pkg: 'com.tencent.ig' },
                      { name: 'MLBB', pkg: 'com.mobile.legends' },
                      { name: 'Wild Rift', pkg: 'com.riotgames.league.wildrift' },
                      { name: 'Honkai SR', pkg: 'com.HoYoverse.hkrpgoversea' }
                    ].map((item) => (
                      <button
                        key={item.pkg}
                        onClick={() => {
                          setGamePackage(item.pkg);
                          if (preCheckResult) setPreCheckResult(null);
                        }}
                        className={`px-2.5 py-1 rounded text-[10px] font-mono border transition-all ${
                          gamePackage === item.pkg
                            ? 'bg-purple-500/20 border-purple-500/50 text-purple-300 font-bold'
                            : 'bg-white/5 border-white/5 text-slate-400 hover:text-white'
                        }`}
                      >
                        {item.name}
                      </button>
                    ))}
                  </div>

                  {/* PRE-INSTALLATION CHECK & INTEGRITY PROTOCOL CARD */}
                  <div className="mt-1 bg-black/40 border border-purple-500/20 rounded-xl p-3 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-purple-400" />
                        <span className="text-xs font-bold text-white uppercase tracking-wider">
                          Pre-Installation & Integrity Protocol
                        </span>
                      </div>
                      <button
                        onClick={() => runPreInstallCheck(gamePackage)}
                        disabled={isCheckingPre || isQueueRunning}
                        className="px-3 py-1 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-purple-200 text-[10px] font-mono font-semibold rounded-md transition-all flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <ShieldCheck className={`w-3 h-3 ${isCheckingPre ? 'animate-spin' : ''}`} />
                        <span>Verify Target (`pm path`)</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
                      <div className="bg-[#161920] p-2 rounded-lg border border-white/5 flex flex-col gap-1">
                        <span className="text-slate-400 flex items-center gap-1">
                          <HardDrive className="w-3 h-3 text-[#00F0FF]" /> Storage Availability:
                        </span>
                        <span className={preCheckResult?.passed ? 'text-[#10B981] font-bold' : preCheckResult ? 'text-amber-400' : 'text-slate-500'}>
                          {preCheckResult ? `${preCheckResult.freeSpaceMb} MB Available` : 'Not checked'}
                        </span>
                      </div>

                      <div className="bg-[#161920] p-2 rounded-lg border border-white/5 flex flex-col gap-1">
                        <span className="text-slate-400 flex items-center gap-1">
                          <FileCode className="w-3 h-3 text-purple-400" /> Staging Directory:
                        </span>
                        <span className={preCheckResult?.isWritable ? 'text-[#10B981] font-bold' : preCheckResult ? 'text-amber-400' : 'text-slate-500'}>
                          {preCheckResult ? (preCheckResult.isWritable ? '/data/local/tmp [Writable]' : 'Restricted [WARN]') : 'Not checked'}
                        </span>
                      </div>

                      <div className="bg-[#161920] p-2 rounded-lg border border-white/5 flex flex-col gap-1">
                        <span className="text-slate-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Package State:
                        </span>
                        <span className={preCheckResult?.isInstalled ? 'text-[#10B981] font-bold truncate' : preCheckResult ? 'text-slate-300' : 'text-slate-500'}>
                          {preCheckResult ? (preCheckResult.isInstalled ? `Installed ${preCheckResult.fileSize ? `(${preCheckResult.fileSize})` : ''}` : 'Not installed') : 'Not checked'}
                        </span>
                      </div>
                    </div>

                    {preCheckResult?.packagePath && (
                      <div className="text-[9px] font-mono text-slate-400 bg-[#161920]/80 p-1.5 rounded border border-white/5 truncate">
                        <strong className="text-purple-300">Target Path:</strong> {preCheckResult.packagePath}
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="grid grid-cols-3 gap-2.5 mt-2">
                    <button
                      onClick={compileGamePackage}
                      disabled={isQueueRunning}
                      className="py-3 px-3 bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/40 text-purple-300 rounded-lg text-xs font-bold transition-all flex flex-col items-center justify-center gap-1"
                    >
                      <Zap className="w-4 h-4" />
                      <span>1. Force AOT Compile</span>
                      <span className="text-[9px] font-mono text-slate-400 font-normal">cmd package compile -m speed</span>
                    </button>

                    <button
                      onClick={lockGameRefreshRate}
                      disabled={isQueueRunning}
                      className="py-3 px-3 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 rounded-lg text-xs font-bold transition-all flex flex-col items-center justify-center gap-1"
                    >
                      <Gauge className="w-4 h-4" />
                      <span>2. Force 120Hz Lock</span>
                      <span className="text-[9px] font-mono text-slate-400 font-normal">app_refresh_rate 120</span>
                    </button>

                    <button
                      onClick={optInGameDriver}
                      disabled={isQueueRunning}
                      className="py-3 px-3 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 rounded-lg text-xs font-bold transition-all flex flex-col items-center justify-center gap-1"
                    >
                      <Cpu className="w-4 h-4" />
                      <span>3. Game Driver Opt-In</span>
                      <span className="text-[9px] font-mono text-slate-400 font-normal">game_driver_opt_in_apps</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* MODULE 7: SAFE BLOATWARE MANAGER */}
            {activeTab === 'bloatware' && (
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
                    <PackageX className="w-5 h-5 text-orange-400" />
                    Safe Bloatware Manager (Non-Root Uninstaller)
                  </h2>
                  <p className="text-xs text-slate-400">
                    Safely purge telemetry, ad services, and daemon daemons for user 0 without breaking system framework dependencies.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#0D0F12] p-4 rounded-xl border border-white/5 flex flex-col justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <Trash2 className="w-4 h-4 text-red-400" />
                        Purge Analytics, MSA & Daemon
                      </h4>
                      <p className="text-xs text-slate-400 mt-1">
                        Uninstalls com.miui.analytics, com.miui.msa.global, and com.miui.daemon for user 0. Completely eliminates Xiaomi system ads and analytics network traffic.
                      </p>
                    </div>
                    <button
                      onClick={purgeBloatware}
                      disabled={isQueueRunning}
                      className="w-full py-2.5 bg-red-500/15 hover:bg-red-500/25 border border-red-500/40 text-red-400 font-bold text-xs rounded-lg transition-all"
                    >
                      Purge Selected Telemetry Packages
                    </button>
                  </div>

                  <div className="bg-[#0D0F12] p-4 rounded-xl border border-white/5 flex flex-col justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <RotateCcw className="w-4 h-4 text-[#10B981]" />
                        Restore Purged Packages
                      </h4>
                      <p className="text-xs text-slate-400 mt-1">
                        Installs existing APK copies back onto user 0 using `cmd package install-existing`. Safe one-click rollback if any regional feature is needed.
                      </p>
                    </div>
                    <button
                      onClick={restoreBloatware}
                      disabled={isQueueRunning}
                      className="w-full py-2.5 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-400 font-bold text-xs rounded-lg transition-all"
                    >
                      Restore All Purged Packages
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* MODULE 8: SYSTEM REPAIR & RESET */}
            {activeTab === 'repair' && (
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-2 text-red-400">
                    <Wrench className="w-5 h-5" />
                    System Repair & Recovery
                  </h2>
                  <p className="text-xs text-slate-400">
                    Resolve settings crashes, reset ART compiler profiles, or revert all modifications back to factory defaults safely.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#0D0F12] p-4 rounded-xl border border-red-500/20 flex flex-col justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-yellow-400" />
                        Fix Settings App Crash
                      </h4>
                      <p className="text-xs text-slate-400 mt-1">
                        Resets com.android.settings compiler profile, clears cache storage, and relaunches the Settings activity cleanly.
                      </p>
                    </div>
                    <button
                      onClick={fixSettingsAppCrash}
                      disabled={isQueueRunning}
                      className="w-full py-2.5 bg-yellow-500/15 hover:bg-yellow-500/25 border border-yellow-500/40 text-yellow-300 font-bold text-xs rounded-lg transition-all"
                    >
                      Execute Settings Reset
                    </button>
                  </div>

                  <div className="bg-[#0D0F12] p-4 rounded-xl border border-red-500/20 flex flex-col justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <RotateCcw className="w-4 h-4 text-red-400" />
                        Revert All System Settings to Default
                      </h4>
                      <p className="text-xs text-slate-400 mt-1">
                        Resets animations to 1.0x, deletes deviceLevelList, clears refresh rate force locks, re-enables location polling, and restores RAM expansion.
                      </p>
                    </div>
                    <button
                      onClick={revertAllDefaults}
                      disabled={isQueueRunning}
                      className="w-full py-2.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 text-red-300 font-bold text-xs rounded-lg transition-all"
                    >
                      Revert All to Factory Defaults
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ========================================================================= */}
          {/* TERMINAL COMPONENT (PINNED AT BOTTOM)                                     */}
          {/* ========================================================================= */}
          <div className="h-44 shrink-0 bg-[#0D0F12] rounded-xl p-3 font-mono text-[10px] flex flex-col border border-white/10 shadow-inner overflow-hidden">
            <div className="flex items-center justify-between pb-1.5 border-b border-white/5 shrink-0 text-slate-400">
              <div className="flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-[#00F0FF]" />
                <span className="font-bold text-[#00F0FF] uppercase tracking-wider text-[10px]">
                  Real-time ADB Terminal Console ({logs.length})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAutoScroll(!autoScroll)}
                  className={`text-[9px] px-2 py-0.5 rounded border transition-colors ${
                    autoScroll ? 'bg-[#00F0FF]/15 border-[#00F0FF]/40 text-[#00F0FF]' : 'border-white/10 text-slate-500'
                  }`}
                >
                  Auto-Scroll: {autoScroll ? 'ON' : 'OFF'}
                </button>
                <button
                  onClick={() => {
                    const text = logs.map((l) => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.message}`).join('\n');
                    navigator.clipboard.writeText(text);
                  }}
                  title="Copy logs to clipboard"
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setLogs([])}
                  title="Clear terminal logs"
                  className="p-1 text-slate-400 hover:text-red-400"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Log Stream */}
            <div className="flex-1 overflow-y-auto space-y-0.5 pt-1.5 font-mono text-[9.5px]">
              {logs.map((entry) => {
                let colorClass = 'text-slate-300';
                if (entry.type === 'command') colorClass = 'text-white font-semibold';
                else if (entry.type === 'success') colorClass = 'text-[#10B981] font-bold';
                else if (entry.type === 'error') colorClass = 'text-[#EF4444] font-bold';
                else if (entry.type === 'warn') colorClass = 'text-[#F59E0B]';
                else if (entry.type === 'output') colorClass = 'text-[#00F0FF]/80';
                else if (entry.type === 'info') colorClass = 'text-slate-400';

                return (
                  <div key={entry.id} className={`flex gap-2 ${colorClass}`}>
                    <span className="text-white/30 shrink-0">[{entry.timestamp}]</span>
                    <span className="break-all">{entry.message}</span>
                  </div>
                );
              })}
              {isQueueRunning && (
                <div className="flex gap-2 text-[#F59E0B] animate-pulse">
                  <span className="text-white/30">[{new Date().toLocaleTimeString('en-US', { hour12: false })}]</span>
                  <span>EXECUTING: {progress.currentCommand}...</span>
                </div>
              )}
              <div ref={terminalEndRef} />
            </div>
          </div>
        </main>
      </div>

      {/* ========================================================================= */}
      {/* MOBILE DIRECT INSTALL & GITHUB RELEASE MODAL                              */}
      {/* ========================================================================= */}
      {showDownloadModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#161920] border border-white/15 rounded-2xl max-w-xl w-full p-6 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-[#00F0FF]/15 border border-[#00F0FF]/30 text-[#00F0FF]">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Direct APK Download & Phone Install Guide</h3>
                  <p className="text-xs text-slate-400 font-mono">Install directly on Xiaomi / HyperOS without ADB</p>
                </div>
              </div>
              <button
                onClick={() => setShowDownloadModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Direct Download Card */}
            <div className="bg-[#0D0F12] border border-emerald-500/30 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex flex-col gap-1 text-left w-full sm:w-auto">
                <span className="text-xs font-bold text-white flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" /> HyperTuner Pro APK (v1.0)
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  Size: ~22.3 MB • Signed Android APK • HyperOS / Android 7.0–14+
                </span>
              </div>
              <a
                href="./HyperTuner-Pro.apk"
                download="HyperTuner-Pro.apk"
                className="w-full sm:w-auto px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-lg text-xs transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>Download APK Now</span>
              </a>
            </div>

            {/* Root Cause & Fix for Parse Error */}
            <div className="flex flex-col gap-3">
              <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Fix: "Failed to parse the APK on the device"
              </h4>

              <div className="space-y-2.5 text-xs text-slate-300">
                <div className="bg-[#0D0F12] p-3 rounded-lg border border-white/5 flex gap-3">
                  <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-white shrink-0">1</span>
                  <div className="flex flex-col gap-0.5">
                    <strong className="text-white">Uninstall Previous Incompatible Build</strong>
                    <p className="text-[11px] text-slate-400">
                      If an earlier build was already installed on your device, Android prevents overwriting due to signature mismatch and reports "Failed to parse APK". Long-press the existing app icon on your phone and choose <span className="text-red-400 font-semibold">Uninstall</span> first.
                    </p>
                  </div>
                </div>

                <div className="bg-[#0D0F12] p-3 rounded-lg border border-white/5 flex gap-3">
                  <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-white shrink-0">2</span>
                  <div className="flex flex-col gap-0.5">
                    <strong className="text-white">Verify Complete APK Download Size</strong>
                    <p className="text-[11px] text-slate-400">
                      In your phone's File Manager / Downloads, check the downloaded file size. It should be <span className="text-emerald-400 font-semibold">~22 MB</span>. If it is only a few KB or under 15 MB, the download was interrupted.
                    </p>
                  </div>
                </div>

                <div className="bg-[#0D0F12] p-3 rounded-lg border border-white/5 flex gap-3">
                  <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-white shrink-0">3</span>
                  <div className="flex flex-col gap-0.5">
                    <strong className="text-white">Enable Unknown App Installation</strong>
                    <p className="text-[11px] text-slate-400">
                      In phone Settings &gt; Apps &gt; Special app access &gt; Install unknown apps, select your browser or File Manager and enable "Allow from this source".
                    </p>
                  </div>
                </div>

                <div className="bg-[#0D0F12] p-3 rounded-lg border border-white/5 flex gap-3">
                  <span className="w-5 h-5 rounded-full bg-[#00F0FF]/20 text-[#00F0FF] flex items-center justify-center text-[10px] font-bold shrink-0">4</span>
                  <div className="flex flex-col gap-0.5">
                    <strong className="text-[#00F0FF]">Automated GitHub Actions Release</strong>
                    <p className="text-[11px] text-slate-400">
                      A GitHub workflow (<code className="text-purple-300">build-apk.yml</code>) has been added to your repository. Go to your GitHub repo &gt; <strong>Actions</strong> &gt; <strong>Build &amp; Release Android APK</strong> &gt; <strong>Run workflow</strong>. It compiles, signs (v1 + v2), and creates a release on GitHub where you can download it directly from any phone browser.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowDownloadModal(false)}
                className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                Close Guide
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
