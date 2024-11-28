import PotokenExtractor from './extractor.js';
import PotokenServer from './server.js';
import winston from 'winston';

// Configure logger
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
    new winston.transports.File({ filename: 'app.log' })
  ]
});

async function main() {
  try {
    const updateInterval = 300; // 5 minutes
    const port = 8080;
    const bindAddress = '0.0.0.0';
    const chromePath = null; // Optional: provide path to Chrome/Chromium executable

    // Create extractor and run
    const potokenExtractor = new PotokenExtractor(updateInterval, chromePath);
    await potokenExtractor.runOnce(); // Get initial token

    // If token generation fails, the extractor will keep trying periodically
    if (!potokenExtractor.get()) {
      logger.warn('Failed to generate initial token');
    }

    // Start periodic token refresh
    potokenExtractor.run();

    // Create and start server
    const potokenServer = new PotokenServer(potokenExtractor, port, bindAddress);
    potokenServer.run();

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Shutting down...');
      potokenExtractor.stop();
      potokenServer.stop();
      process.exit(0);
    });

  } catch (error) {
    logger.error(`Initialization error: ${error}`);
    process.exit(1);
  }
}

main();
