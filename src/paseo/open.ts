import { execFile, spawn } from "node:child_process";
import path from "node:path";

export interface FocusLogger {
	debug(message: string): void;
	warn(message: string): void;
}

/**
 * Brings the running Paseo desktop app to the foreground, or launches it when
 * it is not running. Launching the executable while an instance is already
 * running opens a second window, so focusing is always attempted first.
 */
export function focusOrLaunchPaseo(configuredPath?: string, logger?: FocusLogger): void {
	const custom = configuredPath?.trim();

	if (process.platform === "win32") {
		const executable = custom || defaultWindowsExecutable();
		const script = Buffer.from(WINDOWS_FOCUS_SCRIPT, "utf16le").toString("base64");

		try {
			execFile(
				"powershell.exe",
				["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-EncodedCommand", script],
				{ windowsHide: true, timeout: 15_000, env: { ...process.env, PASEO_EXE: executable } },
				(error, stdout) => {
					const result = String(stdout).trim();
					if (result) {
						logger?.debug(`paseo focus: ${result}`);
					} else if (error) {
						logger?.warn(`paseo focus failed: ${error.message}`);
					}
				},
			);
		} catch (error) {
			logger?.warn(`paseo focus could not start: ${String(error)}`);
		}
		return;
	}

	if (process.platform === "darwin") {
		if (custom) {
			spawnDetached("open", [custom]);
			return;
		}
		spawnDetached("open", ["-a", "Paseo"]);
		return;
	}

	spawnDetached(custom || "paseo", []);
}

function defaultWindowsExecutable(): string {
	return path.join(process.env.LOCALAPPDATA ?? "", "Programs", "Paseo", "Paseo.exe");
}

function spawnDetached(command: string, args: string[]): void {
	try {
		const child = spawn(command, args, { detached: true, stdio: "ignore" });
		child.on("error", () => {});
		child.unref();
	} catch {
		// Paseo is not installed or cannot be launched; the key still acknowledges.
	}
}

const WINDOWS_FOCUS_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class PaseoFocus {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr processId);
  [DllImport("user32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

  static void Alt() {
    keybd_event(0x12, 0, 0, UIntPtr.Zero);
    keybd_event(0x12, 0, 2, UIntPtr.Zero);
  }

  public static bool Focus(IntPtr hWnd) {
    if (IsIconic(hWnd)) ShowWindowAsync(hWnd, 9);

    // A synthetic Alt press clears the foreground-lock so SetForegroundWindow is allowed.
    Alt();
    SetForegroundWindow(hWnd);
    if (GetForegroundWindow() == hWnd) return true;

    // Fallback: attach this thread to the current foreground thread, then retry.
    IntPtr foreground = GetForegroundWindow();
    uint foregroundThread = GetWindowThreadProcessId(foreground, IntPtr.Zero);
    uint currentThread = GetCurrentThreadId();
    bool attached = false;
    if (foregroundThread != 0 && foregroundThread != currentThread) {
      attached = AttachThreadInput(currentThread, foregroundThread, true);
    }
    BringWindowToTop(hWnd);
    Alt();
    SetForegroundWindow(hWnd);
    if (attached) AttachThreadInput(currentThread, foregroundThread, false);
    return GetForegroundWindow() == hWnd;
  }
}
'@
$activated = $false
$windows = @(Get-Process Paseo | Where-Object { $_.MainWindowHandle -ne 0 })
foreach ($p in $windows) {
  if ([PaseoFocus]::Focus($p.MainWindowHandle)) { $activated = $true; break }
}
if ($activated) {
  Write-Output 'activated'
} elseif ($windows.Count -eq 0) {
  if ($env:PASEO_EXE -and (Test-Path $env:PASEO_EXE)) {
    Start-Process -FilePath $env:PASEO_EXE
    Write-Output 'launched'
  } else {
    Start-Process -FilePath 'Paseo'
    Write-Output 'launched-default'
  }
} else {
  Write-Output 'focus-failed'
}
`;
