import http from 'http';
import url from 'url';
import EventEmitter from 'events';
import winston from 'winston';

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

class PotokenServer {
  constructor(potokenExtractor, port = 8080, bindAddress = '0.0.0.0') {
    this.port = port;
    this.bindAddress = bindAddress;
    this.potokenExtractor = potokenExtractor;
    this.server = null;
  }

  // Get the current PoToken
  getPotoken() {
    const token = this.potokenExtractor.get();
    if (!token) {
      return {
        status: 503,
        headers: { 'Content-Type': 'text/plain' },
        body: 'Token has not yet been generated, try again later.',
      };
    } else {
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: token.toJSON(),
      };
    }
  }

  // Handle token update requests
  requestUpdate() {
    const accepted = this.potokenExtractor.requestUpdate();
    if (accepted) {
      return {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
        body: 'Update request accepted, new token will be generated soon.',
      };
    } else {
      return {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
        body: 'Update has already been requested, new token will be generated soon.',
      };
    }
  }

  // Get handler based on route
  getRouteHandler(route) {
    const handlers = {
      '/': () => ({
        status: 302,
        headers: { Location: '/token' },
        body: '',
      }),
      '/token': this.getPotoken.bind(this),
      '/update': this.requestUpdate.bind(this),
      default: () => ({
        status: 404,
        headers: { 'Content-Type': 'text/plain' },
        body: 'Not Found',
      }),
    };

    return handlers[route] || handlers.default;
  }

  // Main HTTP request handler
  app(req, res) {
    const parsedUrl = url.parse(req.url, true);
    const route = parsedUrl.pathname;

    const handler = this.getRouteHandler(route);
    const { status, headers, body } = handler();

    res.writeHead(status, headers);
    res.end(body);
  }

  // Start the HTTP server
  run() {
    logger.info(`Starting web-server at ${this.bindAddress}:${this.port}`);
    this.server = http.createServer(this.app.bind(this));
    this.server.listen(this.port, this.bindAddress, () => {
      logger.info(`Server is running at http://${this.bindAddress}:${this.port}/`);
    });
  }

  // Stop the HTTP server
  stop() {
    if (this.server) {
      this.server.close(() => {
        logger.info('Server stopped.');
      });
    }
  }
}

export default PotokenServer;
