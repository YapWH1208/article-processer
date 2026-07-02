const { spawnSync } = require("node:child_process");
const path = require("node:path");

function resolvePowerShellCommand(platform = process.platform) {
  return platform === "win32" ? "powershell.exe" : "pwsh";
}

function buildPowerShellArgs(scriptPath, args, platform = process.platform) {
  const baseArgs = ["-NoProfile"];
  if (platform === "win32") {
    baseArgs.push("-ExecutionPolicy", "Bypass");
  }
  return [...baseArgs, "-File", scriptPath, ...args];
}

function main(args = process.argv.slice(2), options = {}) {
  const platform = options.platform || process.platform;
  const command = resolvePowerShellCommand(platform);
  const scriptPath = path.join(__dirname, "build-desktop.ps1");
  const result = spawnSync(command, buildPowerShellArgs(scriptPath, args, platform), {
    cwd: path.resolve(__dirname, ".."),
    stdio: "inherit",
  });

  if (result.error) {
    console.error(`Failed to start ${command}: ${result.error.message}`);
    return 1;
  }
  return result.status ?? 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { buildPowerShellArgs, main, resolvePowerShellCommand };
