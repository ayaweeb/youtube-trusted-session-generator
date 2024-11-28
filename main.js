import { program } from 'commander';
import winston from 'winston';
import { exit } from 'process';
import PotokenExtractor from './extractor.js'; // Import from previous translation
import PotokenServer from './server.js'; // Import from previous translation

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level}]: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
  ]
});

// Print token and exit
function printTokenAndExit(tokenInfo) {
  if (!tokenInfo) {
    winston.warn('Failed to extract token');
    exit(1);
  }

  const { visitor_data, potoken } = tokenInfo;
  logger.info(`visitor_data: ${visitor_data}`);
  logger.info(`po_token: ${potoken}`);

  if (potoken.length < 160) {
    winston.warn(
      "There is a high chance that the potoken generated won't work. Please try again on another internet connection."
    );
    exit(1);
  }
  exit(0);
}

// Main asynchronous runner
async function run({
  oneshot,
  updateInterval,
  bindAddress,
  port,
  browserPath,
}) {
  const potokenExtractor = new PotokenExtractor(updateInterval, browserPath);

  // Generate token once if `oneshot` mode is active
  const token = await potokenExtractor.runOnce();
  if (oneshot) {
    printTokenAndExit(token);
  }

  // Start token extraction and server
  const extractorTask = potokenExtractor.run();
  const potokenServer = new PotokenServer(potokenExtractor, port, bindAddress);

  try {
    await Promise.all([extractorTask, potokenServer.run()]);
  } catch (err) {
    winston.error('Error occurred:', err);
    throw err;
  } finally {
    potokenServer.stop();
  }
}

// Command-line argument parsing
function parseArguments() {
  program
    .description(
      `Retrieve potoken using Chromium run by nodriver and serve it on a JSON endpoint.

      A token is generated on startup and then every UPDATE_INTERVAL seconds.
      With the web server running on the default port, the token is available at
      http://127.0.0.1:8080/token. Immediate token regeneration can be requested at
      http://127.0.0.1:8080/update.`
    )
    .option('-o, --oneshot', 'Generate token once, print it and exit', false)
    .option(
      '-u, --update-interval <seconds>',
      'Interval for new token generation (default: 300)',
      300
    )
    .option(
      '-p, --port <port>',
      'Port for the web server to listen on (default: 8080)',
      8080
    )
    .option(
      '-b, --bind <address>',
      'Address the web server binds to (default: 127.0.0.1)',
      '127.0.0.1'
    )
    .option(
      '-c, --chrome-path <path>',
      'Path to the Chromium executable (optional)',
      null
    )
    .parse();

  return program.opts();
}

// Main entry point
(async function main() {
  const args = parseArguments();

  try {
    await run({
      oneshot: args.oneshot,
      updateInterval: args.updateInterval,
      bindAddress: args.bind,
      port: args.port,
      browserPath: args.chromePath,
    });
  } catch (err) {
    winston.error('Unexpected error:', err);
    exit(1);
  }
})();
