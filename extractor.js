import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { EventEmitter } from 'events';

class TokenInfo {
  constructor(updated, potoken, visitorData) {
    this.updated = updated;
    this.potoken = potoken;
    this.visitorData = visitorData;
  }

  toJSON() {
    return JSON.stringify({
      updated: this.updated,
      potoken: this.potoken,
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
        console.log('Initiating forced update');
      } else {
        console.log('Initiating scheduled update');
      }
      await this._update();
      this.updateRequested = false;
    }, this.updateInterval);
  }

  requestUpdate() {
    if (this.isUpdating) {
      console.log('Update process is already running');
      return false;
    }
    if (this.updateRequested) {
      console.log('Forced update has already been requested');
      return false;
    }
    this.updateRequested = true;
    console.log('Forced update requested');
    return true;
  }

  async _update() {
    if (this.isUpdating) {
      console.log('Update is already in progress');
      return;
    }

    this.isUpdating = true;
    try {
      console.log('Update started');
      await this._performUpdate();
    } catch (error) {
      console.error('Update failed:', error);
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
            const potoken = postData.serviceIntegrityDimensions.poToken;

            if (potoken && visitorData) {
              this.tokenInfo = new TokenInfo(Date.now(), potoken, visitorData);
              console.log(`New token: ${this.tokenInfo.toJSON()}`);
              tokenExtracted = true;
              this.eventEmitter.emit('extractionDone', true);
            }
          } catch (error) {
            console.warn(`Failed to extract token: ${error}`);
          }
        }
        request.continue();
      });

      // Navigate to YouTube video
      await page.goto('https://www.youtube.com/embed/jNQXAC9IVRw', {
        waitUntil: 'domcontentloaded',
      });

      // Click on the video player
      const playerClicked = await this._clickOnPlayer(page);
      if (playerClicked) {
        await this._waitForHandler();
      }
    } catch (error) {
      console.error('Error in _performUpdate:', error);
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
      console.warn('Failed to locate or click video player:', error);
      return false;
    }
  }

  async _waitForHandler() {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.warn('Timeout waiting for outgoing API request');
        resolve(false);
      }, 30000);

      this.eventEmitter.once('extractionDone', () => {
        clearTimeout(timeout);
        console.log('Extraction successful');
        resolve(true);
      });
    });
  }
}

export default PotokenExtractor;
