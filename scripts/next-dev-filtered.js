const { spawn } = require("node:child_process");

const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "-H", "0.0.0.0"], {
  stdio: ["inherit", "pipe", "pipe"],
});

const successfulCampaignRequestPattern = /^\s*(?:GET|HEAD) \/api\/campaigns\/[^\s]+ (?:200|304) in \d+ms\s*$/;

function forwardFiltered(stream, output) {
  let buffered = "";

  stream.on("data", (chunk) => {
    buffered += chunk.toString();
    const lines = buffered.split(/(\r?\n)/);
    buffered = lines.pop() || "";

    for (let i = 0; i < lines.length; i += 2) {
      const line = lines[i];
      const newline = lines[i + 1] || "";
      if (!successfulCampaignRequestPattern.test(line)) {
        output.write(line + newline);
      }
    }
  });

  stream.on("end", () => {
    if (buffered && !successfulCampaignRequestPattern.test(buffered)) {
      output.write(buffered);
    }
  });
}

forwardFiltered(child.stdout, process.stdout);
forwardFiltered(child.stderr, process.stderr);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code || 0);
});
