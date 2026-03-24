const { spawnSync } = require('child_process');

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const forwardedArgs = process.argv.slice(2);
const result = spawnSync(
  command,
  ['tsx', '--env-file=.env.local', 'scripts/agent-api-brief-prototype.ts'],
  {
    stdio: 'inherit',
    shell: false,
    env: {
      ...process.env,
      AGENT_API_SCRIPT_ARGS: JSON.stringify(forwardedArgs),
    },
  },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 0);