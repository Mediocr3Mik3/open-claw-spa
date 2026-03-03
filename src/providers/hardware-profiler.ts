/**
 * openclaw-spa — Hardware Profiler
 *
 * Interrogates the system to build a hardware profile used for
 * LLM model recommendations. Cross-platform: macOS, Linux, Windows.
 */

import { execSync } from "child_process";
import * as os from "os";
import * as fs from "fs";
import type {
  HardwareProfile,
  CPUInfo,
  RAMInfo,
  GPUInfo,
  GPUVendor,
  DiskInfo,
  RuntimeInfo,
} from "./types.js";

// ─── CPU Detection ──────────────────────────────────────────────────────

function detectCPU(): CPUInfo {
  const cpus = os.cpus();
  const first = cpus[0];
  const arch = os.arch() as CPUInfo["architecture"];
  const features: string[] = [];

  try {
    if (os.platform() === "linux") {
      const flags = execSync("grep -m1 flags /proc/cpuinfo", { encoding: "utf-8" });
      if (flags.includes("avx2")) features.push("avx2");
      if (flags.includes("avx512")) features.push("avx512");
      if (flags.includes("f16c")) features.push("f16c");
    } else if (os.platform() === "darwin") {
      try {
        execSync("sysctl -n hw.optional.avx2_0", { encoding: "utf-8" }).trim() === "1" && features.push("avx2");
      } catch { /* not available on Apple Silicon */ }
      if (arch === "arm64") features.push("neon", "metal");
    } else if (os.platform() === "win32") {
      // Windows: check via WMIC or systeminfo
      try {
        const info = execSync("wmic cpu get Name,Description /FORMAT:LIST", { encoding: "utf-8" });
        if (info.toLowerCase().includes("avx2")) features.push("avx2");
      } catch { /* ignore */ }
    }
  } catch { /* ignore detection failures */ }

  return {
    model: first?.model ?? "Unknown",
    cores: os.cpus().length,
    threads: os.cpus().length,
    architecture: ["x64", "arm64", "arm"].includes(arch) ? arch as CPUInfo["architecture"] : "unknown",
    features,
    speed_mhz: first?.speed ?? 0,
  };
}

// ─── RAM Detection ──────────────────────────────────────────────────────

function detectRAM(): RAMInfo {
  const total_gb = Math.round((os.totalmem() / (1024 ** 3)) * 10) / 10;
  const available_gb = Math.round((os.freemem() / (1024 ** 3)) * 10) / 10;
  let speed_mhz: number | null = null;

  try {
    if (os.platform() === "darwin") {
      const raw = execSync("system_profiler SPMemoryDataType 2>/dev/null | grep Speed", { encoding: "utf-8" });
      const match = raw.match(/(\d+)\s*MHz/);
      if (match) speed_mhz = parseInt(match[1], 10);
    } else if (os.platform() === "linux") {
      const raw = execSync("sudo dmidecode -t memory 2>/dev/null | grep Speed | head -1", { encoding: "utf-8" });
      const match = raw.match(/(\d+)\s*MT/);
      if (match) speed_mhz = parseInt(match[1], 10);
    }
  } catch { /* ignore */ }

  return { total_gb, available_gb, speed_mhz };
}

// ─── GPU Detection ──────────────────────────────────────────────────────

function detectGPUs(): GPUInfo[] {
  const gpus: GPUInfo[] = [];

  // NVIDIA via nvidia-smi
  try {
    const raw = execSync(
      "nvidia-smi --query-gpu=name,memory.total,compute_cap --format=csv,noheader,nounits 2>/dev/null",
      { encoding: "utf-8" },
    );
    for (const line of raw.trim().split("\n")) {
      const [name, vram_mb, compute] = line.split(",").map(s => s.trim());
      if (name) {
        let cuda_version: string | undefined;
        try {
          const cv = execSync("nvidia-smi --query-gpu=driver_version --format=csv,noheader 2>/dev/null", { encoding: "utf-8" }).trim();
          cuda_version = cv;
        } catch { /* ignore */ }

        gpus.push({
          name,
          vendor: "nvidia",
          vram_gb: Math.round((parseInt(vram_mb ?? "0", 10) / 1024) * 10) / 10,
          compute_capability: compute ? `sm_${compute.replace(".", "")}` : undefined,
          cuda_version,
        });
      }
    }
  } catch { /* no nvidia-smi */ }

  // AMD via rocm-smi
  if (gpus.length === 0) {
    try {
      const raw = execSync("rocm-smi --showproductname --showmeminfo vram --csv 2>/dev/null", { encoding: "utf-8" });
      if (raw.includes("GPU")) {
        gpus.push({
          name: "AMD GPU (ROCm)",
          vendor: "amd",
          vram_gb: 0, // Parse from output if available
          rocm_version: execSync("rocm-smi --version 2>/dev/null", { encoding: "utf-8" }).trim() || undefined,
        });
      }
    } catch { /* no rocm-smi */ }
  }

  // Windows WMI fallback (catches AMD, NVIDIA, Intel consumer GPUs without vendor CLIs)
  if (gpus.length === 0 && os.platform() === "win32") {
    try {
      const wmic = execSync(
        "wmic path win32_VideoController get name,AdapterRAM,DriverVersion /FORMAT:LIST",
        { encoding: "utf-8" },
      );
      // WMI may return multiple GPU blocks separated by blank lines
      const blocks = wmic.split(/\n\s*\n/).filter(b => b.includes("Name="));
      for (const block of blocks) {
        const nameMatch = block.match(/Name=([^\r\n]+)/);
        const ramMatch = block.match(/AdapterRAM=(\d+)/);
        const driverMatch = block.match(/DriverVersion=([^\r\n]+)/);
        if (nameMatch) {
          const gpuName = nameMatch[1].trim();
          const nameLower = gpuName.toLowerCase();
          const vram_bytes = ramMatch ? parseInt(ramMatch[1], 10) : 0;
          const vram_gb = Math.round((vram_bytes / (1024 ** 3)) * 10) / 10;
          const driver = driverMatch ? driverMatch[1].trim() : undefined;

          let vendor: GPUVendor = "unknown";
          if (nameLower.includes("amd") || nameLower.includes("radeon")) vendor = "amd";
          else if (nameLower.includes("nvidia") || nameLower.includes("geforce") || nameLower.includes("quadro")) vendor = "nvidia";
          else if (nameLower.includes("intel")) vendor = "intel";

          // Skip virtual/basic display adapters
          if (nameLower.includes("basic display") || nameLower.includes("virtual")) continue;

          gpus.push({
            name: gpuName,
            vendor,
            vram_gb,
            ...(vendor === "amd" && driver ? { rocm_version: driver } : {}),
            ...(vendor === "nvidia" && driver ? { cuda_version: driver } : {}),
          });
        }
      }
    } catch { /* WMI not available */ }
  }

  // Apple Silicon
  if (gpus.length === 0 && os.platform() === "darwin" && os.arch() === "arm64") {
    try {
      const hw = execSync("system_profiler SPHardwareDataType 2>/dev/null", { encoding: "utf-8" });
      const chipMatch = hw.match(/Chip:\s*(.+)/);
      const memMatch = hw.match(/Memory:\s*(\d+)\s*GB/);
      const total_gb = memMatch ? parseInt(memMatch[1], 10) : os.totalmem() / (1024 ** 3);

      gpus.push({
        name: chipMatch ? chipMatch[1].trim() : "Apple Silicon",
        vendor: "apple",
        vram_gb: Math.round(total_gb * 0.75 * 10) / 10, // ~75% available to GPU
        metal_support: true,
        unified_memory: true,
      });
    } catch { /* ignore */ }
  }

  // Intel integrated (fallback)
  if (gpus.length === 0) {
    try {
      if (os.platform() === "linux") {
        const lspci = execSync("lspci 2>/dev/null | grep -i vga", { encoding: "utf-8" });
        if (lspci.toLowerCase().includes("intel")) {
          gpus.push({ name: "Intel Integrated Graphics", vendor: "intel", vram_gb: 0 });
        }
      }
    } catch { /* ignore */ }
  }

  return gpus;
}

// ─── Disk Detection ─────────────────────────────────────────────────────

function detectDisk(): DiskInfo {
  let available_gb = 50; // fallback
  let diskType: DiskInfo["type"] = "unknown";

  try {
    if (os.platform() === "darwin" || os.platform() === "linux") {
      const df = execSync("df -g / 2>/dev/null || df -BG / 2>/dev/null", { encoding: "utf-8" });
      const lines = df.trim().split("\n");
      if (lines.length >= 2) {
        const parts = lines[1].split(/\s+/);
        available_gb = parseInt(parts[3] ?? "50", 10);
      }
    }
  } catch { /* ignore */ }

  try {
    if (os.platform() === "darwin") {
      const diskutil = execSync("diskutil info disk0 2>/dev/null | grep 'Solid State'", { encoding: "utf-8" });
      diskType = diskutil.toLowerCase().includes("yes") ? "nvme" : "hdd";
    } else if (os.platform() === "linux") {
      const rotational = execSync("cat /sys/block/sda/queue/rotational 2>/dev/null || echo 0", { encoding: "utf-8" }).trim();
      diskType = rotational === "0" ? "ssd" : "hdd";
      // Check for NVMe
      try {
        if (fs.existsSync("/dev/nvme0")) diskType = "nvme";
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }

  return { available_gb, type: diskType };
}

// ─── Runtime Detection ──────────────────────────────────────────────────

function detectRuntimes(): RuntimeInfo[] {
  const runtimes: RuntimeInfo[] = [];

  // Ollama
  try {
    const version = execSync("ollama --version 2>/dev/null", { encoding: "utf-8" }).trim();
    const vMatch = version.match(/(\d+\.\d+\.\d+)/);
    let running = false;
    try {
      execSync("curl -sf http://localhost:11434/api/tags 2>/dev/null", { encoding: "utf-8" });
      running = true;
    } catch { /* not running */ }

    runtimes.push({
      name: "ollama",
      version: vMatch ? vMatch[1] : version,
      path: execSafe("which ollama"),
      running,
      endpoint: "http://localhost:11434",
    });
  } catch { /* not installed */ }

  // llama.cpp / llama-server
  for (const bin of ["llama-server", "llama-cli", "llama.cpp"]) {
    try {
      const p = execSync(`which ${bin} 2>/dev/null`, { encoding: "utf-8" }).trim();
      if (p) {
        let running = false;
        try {
          execSync("curl -sf http://localhost:8080/health 2>/dev/null", { encoding: "utf-8" });
          running = true;
        } catch { /* not running */ }

        runtimes.push({
          name: "llama.cpp",
          version: null,
          path: p,
          running,
          endpoint: "http://localhost:8080",
        });
        break;
      }
    } catch { /* not found */ }
  }

  // LM Studio
  try {
    let lmsPath: string | null = null;
    if (os.platform() === "darwin") {
      lmsPath = fs.existsSync("/Applications/LM Studio.app") ? "/Applications/LM Studio.app" : null;
    } else if (os.platform() === "win32") {
      const appData = process.env["LOCALAPPDATA"] ?? "";
      lmsPath = fs.existsSync(`${appData}\\LM Studio\\LM Studio.exe`) ? `${appData}\\LM Studio\\LM Studio.exe` : null;
    }
    if (lmsPath) {
      let running = false;
      try {
        execSync("curl -sf http://localhost:1234/v1/models 2>/dev/null", { encoding: "utf-8" });
        running = true;
      } catch { /* not running */ }

      runtimes.push({
        name: "lm-studio",
        version: null,
        path: lmsPath,
        running,
        endpoint: "http://localhost:1234",
      });
    }
  } catch { /* not found */ }

  // LocalAI (Docker)
  try {
    const docker = execSync("docker ps --filter name=localai --format '{{.Names}}' 2>/dev/null", { encoding: "utf-8" }).trim();
    if (docker) {
      runtimes.push({
        name: "localai",
        version: null,
        path: null,
        running: true,
        endpoint: "http://localhost:8080",
      });
    }
  } catch { /* no docker or localai */ }

  return runtimes;
}

// ─── Battery Detection ──────────────────────────────────────────────────

function detectBattery(): HardwareProfile["battery"] | undefined {
  try {
    if (os.platform() === "darwin") {
      const raw = execSync("pmset -g batt 2>/dev/null", { encoding: "utf-8" });
      const percentMatch = raw.match(/(\d+)%/);
      const charging = raw.includes("AC Power") || raw.includes("charging");
      if (percentMatch) {
        return { percent: parseInt(percentMatch[1], 10), charging };
      }
    } else if (os.platform() === "linux") {
      if (fs.existsSync("/sys/class/power_supply/BAT0")) {
        const cap = fs.readFileSync("/sys/class/power_supply/BAT0/capacity", "utf-8").trim();
        const status = fs.readFileSync("/sys/class/power_supply/BAT0/status", "utf-8").trim();
        return { percent: parseInt(cap, 10), charging: status === "Charging" || status === "Full" };
      }
    }
  } catch { /* ignore */ }
  return undefined;
}

// ─── Helpers ────────────────────────────────────────────────────────────

function execSafe(cmd: string): string | null {
  try {
    return execSync(cmd, { encoding: "utf-8" }).trim() || null;
  } catch {
    return null;
  }
}

// ─── Main Profiler ──────────────────────────────────────────────────────

export function profileHardware(): HardwareProfile {
  return {
    cpu: detectCPU(),
    ram: detectRAM(),
    gpus: detectGPUs(),
    disk: detectDisk(),
    os: {
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
    },
    runtimes: detectRuntimes(),
    battery: detectBattery(),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Quick profile — skips slow operations (disk speed, battery, some GPU details).
 * Suitable for health check polling.
 */
export function quickProfile(): Pick<HardwareProfile, "ram" | "runtimes" | "timestamp"> {
  return {
    ram: detectRAM(),
    runtimes: detectRuntimes(),
    timestamp: new Date().toISOString(),
  };
}
