import { spawn } from "node:child_process";
import process from "node:process";

const isWindows = process.platform === "win32";
const baseEnv = normalizeEnv(process.env);

const commands = [
  {
    name: "api",
    command: process.execPath,
    args: ["server/index.js"],
    env: { PORT: "3001", NODE_ENV: "development" }
  },
  {
    name: "web",
    command: isWindows ? "npm.cmd" : "npm",
    args: ["run", "dev:web"],
    env: {}
  }
];

const children = commands.map(({ name, command, args, env }) => {
  const child = spawn(command, args, {
    env: normalizeEnv({ ...baseEnv, ...env }),
    stdio: ["ignore", "pipe", "pipe"],
    shell: false
  });

  child.stdout.on("data", (chunk) => {
    process.stdout.write(`[${name}] ${chunk}`);
  });

  child.stderr.on("data", (chunk) => {
    process.stderr.write(`[${name}] ${chunk}`);
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      console.log(`${name} stopped with ${signal}`);
    } else if (code !== 0) {
      console.log(`${name} exited with code ${code}`);
    }
    stopAll(child);
  });

  return child;
});

function stopAll(source) {
  for (const child of children) {
    if (child !== source && !child.killed) {
      child.kill();
    }
  }
}

process.on("SIGINT", () => {
  stopAll();
  process.exit(0);
});

function normalizeEnv(env) {
  if (!isWindows) {
    return { ...env };
  }

  const normalized = {};

  for (const [key, value] of Object.entries(env)) {
    if (!key || key.includes("=") || value === undefined || value === null) {
      continue;
    }

    const canonicalKey = key.toLowerCase() === "path" ? "Path" : key;
    const duplicateKey = Object.keys(normalized).find(
      (existingKey) => existingKey.toLowerCase() === canonicalKey.toLowerCase()
    );

    if (duplicateKey) {
      delete normalized[duplicateKey];
    }

    normalized[canonicalKey] = value;
  }

  return normalized;
}
