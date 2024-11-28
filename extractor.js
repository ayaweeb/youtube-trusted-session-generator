import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { EventEmitter } from 'events';
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

class TokenInfo {
  constructor(updated, poToken, visitorData) {
    this.updated = updated;
    this.poToken = poToken;
    this.visitorData = visitorData;
  }

  toJSON() {
    return JSON.stringify({
      updated: this.updated,
      poToken: this.poToken,
      visitorData: this.visitorData,
    });
  }
}

class PotokenExtractor {
  constructor(updateInterval = 3600, browserPath = null) {
    this.updateInterval = updateInterval * 1000; // Convert seconds to milliseconds
    this.browserPath = browserPath;
    this.profilePath = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-'));
    this.tokenInfo = null;
    this.isUpdating = false;
    this.updateRequested = false;
    this.eventEmitter = new EventEmitter();
  }

  get() {
    return this.tokenInfo;
  }

  async runOnce() {
    await this._update();
    return this.get();
  }

  async run() {
    await this._update();
    setInterval(async () => {
      if (this.updateRequested) {
        logger.info('Initiating forced update');
      } else {
        logger.info('Initiating scheduled update');
      }
      await this._update();
      this.updateRequested = false;
    }, this.updateInterval);
  }

  requestUpdate() {
    if (this.isUpdating) {
      logger.warn('Update process is already running');
      return false;
    }
    if (this.updateRequested) {
      logger.info('Forced update has already been requested');
      return false;
    }
    this.updateRequested = true;
    logger.info('Forced update requested');
    return true;
  }

  async _update() {
    if (this.isUpdating) {
      logger.info('Update is already in progress');
      return;
    }

    this.isUpdating = true;
    try {
      logger.info('Update started');
      await this._performUpdate();
    } catch (error) {
      logger.error('Update failed:', error);
    } finally {
      this.isUpdating = false;
    }
  }

  async _performUpdate() {
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: true,
        executablePath: this.browserPath,
        userDataDir: this.profilePath,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      const page = await browser.newPage();

      // Intercept requests to extract token
      await page.setRequestInterception(true);
      let tokenExtracted = false;

      page.on('request', async (request) => {
        if (request.method() === 'POST' && request.url().includes('/youtubei/v1/player') && !tokenExtracted) {
          try {
            const postData = JSON.parse(request.postData());
            const visitorData = postData.context.client.visitorData;
            const poToken = postData.serviceIntegrityDimensions.poToken;

            if (poToken && visitorData) {
              this.tokenInfo = new TokenInfo(Date.now(), poToken, visitorData);
              if(poToken.length < 160) {
                winston.warn("There is a high chance that the potoken generated won't work. Please try again on another internet connection.");
                exit(1);
              }
              
              logger.info(`poToken: ${potoken}`);
              logger.info(`visitorData: ${visitorData}`)
              tokenExtracted = true;
              this.eventEmitter.emit('extractionDone', true);
            }
          } catch (error) {
            logger.error(`Failed to extract token: ${error}`);
          }
        }
        request.continue();
      });

      // Navigate to YouTube video
      await page.goto('https://www.youtube.com/embed/jNQXAC9IVRw');

      // Click on the video player
      const playerClicked = await this._clickOnPlayer(page);
      if (playerClicked) {
        await this._waitForHandler();
      }
    } catch (error) {
      logger.error('Error in _performUpdate:', error);
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  async _clickOnPlayer(page) {
    try {
      await page.waitForSelector('#movie_player', { timeout: 10000 });
      await page.click('#movie_player');
      return true;
    } catch (error) {
      logger.error('Failed to locate or click video player:', error);
      return false;
    }
  }

  async _waitForHandler() {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        logger.warn('Timeout waiting for outgoing API request');
        resolve(false);
      }, 30000);

      this.eventEmitter.once('extractionDone', () => {
        clearTimeout(timeout);
        logger.info('Extraction successful');
        resolve(true);
      });
    });
  }
}

export default PotokenExtractor;
