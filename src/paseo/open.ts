import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Brings the running Paseo desktop app to the foreground, or launches it when
 * it is not running. Launching the executable while an instance is already
 * running opens a second window, so focusing is always attempted first.
 */
export function focusOrLaunchPaseo(configuredPath?: string): void {
	const custom = configuredPath?.trim();

	if (process.platform === "win32") {
		const executable = custom || defaultWindowsExecutable();
		const script = Buffer.from(WINDOWS_FOCUS_SCRIPT, "utf16le").toString("base64");
		spawnDetached(
			"powershell.exe",
			["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-EncodedCommand", script],
			{ PASEO_EXE: executable },
		);
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

function spawnDetached(command: string, args: string[], extraEnv?: Record<string, string>): void {
	try {
		const child = spawn(command, args, {
			detached: true,
			stdio: "ignore",
			windowsHide: true,
			env: extraEnv ? { ...process.env, ...extraEnv } : process.env,
		});
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
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] static extern IntPtr SetFocus(IntPtr hWnd);
  [DllImport("user32.dll")] static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

  public static void Focus(IntPtr hWnd) {
    if (IsIconic(hWnd)) ShowWindowAsync(hWnd, 9);
    IntPtr fg = GetForegroundWindow();
    uint fgThread = GetWindowThreadProcessId(fg, IntPtr.Zero);
    uint targetThread = GetWindowThreadProcessId(hWnd, IntPtr.Zero);
    bool attached = false;
    if (fgThread != 0 && targetThread != 0 && fgThread != targetThread) {
      attached = AttachThreadInput(fgThread, targetThread, true);
    }
    keybd_event(0x12, 0, 0, UIntPtr.Zero);
    keybd_event(0x12, 0, 2, UIntPtr.Zero);
    BringWindowToTop(hWnd);
    SetForegroundWindow(hWnd);
    SetFocus(hWnd);
    if (attached) AttachThreadInput(fgThread, targetThread, false);
  }
}
'@
$p = Get-Process Paseo | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if ($p) {
  [PaseoFocus]::Focus($p.MainWindowHandle) | Out-Null
} elseif ($env:PASEO_EXE -and (Test-Path $env:PASEO_EXE)) {
  Start-Process -FilePath $env:PASEO_EXE
} else {
  Start-Process -FilePath 'Paseo'
}
`;
