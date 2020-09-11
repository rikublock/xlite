import {apiConstants} from '../../app/api';
import {getLocaleData, IMAGE_DIR, storageKeys} from '../constants';
import {logger} from './logger';
import Recipient from '../../app/types/recipient';
import WalletController from './wallet-controller';

import _ from 'lodash';
import electron from 'electron';
import isDev from 'electron-is-dev';
import {Map as IMap} from 'immutable';
import path from 'path';
import QRCode from 'qrcode';

/**
 * Manages the api link to the renderer process.
 * When updating the api here be sure to update:
 * app/api.js
 */
class Api {
  /**
   * @type {SimpleStorage}
   * @private
   */
  _storage = null;

  /**
   * @type {Electron.App}
   * @private
   */
  _app = null;

  /**
   * @type {Electron.IpcMain}
   * @private
   */
  _proc = null;

  /**
   * Error object from main proc.
   * @type {Object} {title, msg}
   * @private
   */
  _err = null;

  /**
   * @type {CloudChains}
   * @private
   */
  _cloudChains = null;

  /**
   * @type {ConfController}
   * @private
   */
  _confController = null;

  /**
   * @type {WalletController}
   * @private
   */
  _walletController = null;

  /**
   * @type {ZoomController}
   * @private
   */
  _zoomController = null;

  /**
   * @type {Pricing}
   * @private
   */
  _pricing = null;

  /**
   * Default list of whitelisted fields (included in api results)
   * @type {[string]}
   * @private
   */
  _whitelist = ['_token'];

  /**
   * Default list of blacklisted fields (omitted from api results)
   * @type {[string]}
   * @private
   */
  _blacklist = ['rpc', 'rpcPassword', 'rpcUsername', 'rpcPort', 'rpcport'];

  /**
   * Constructor
   * @param storage {SimpleStorage}
   * @param app {Electron.App}
   * @param proc {Electron.IpcMain}
   * @param err {Object} Must be null if not an error
   * @param cloudChains {CloudChains}
   * @param confController {ConfController}
   * @param walletController {WalletController}
   * @param zoomController {ZoomController}
   * @param pricing {Pricing}
   */
  constructor(storage, app, proc, err,
              cloudChains = null, confController = null,
              walletController = null, zoomController = null,
              pricing = null) {
    this._storage = storage;
    this._app = app;
    this._proc = proc;
    this._err = err;
    this._cloudChains = cloudChains;
    this._confController = confController;
    this._walletController = walletController;
    this._zoomController = zoomController;
    this._pricing = pricing;
    this._init();
  }

  /**
   * Create api handlers.
   * @private
   */
  _init() {
    this._initEnv();
    this._initGeneral();
    if (this._err)
      return; // do not expose rest of api on error

    if (this._cloudChains)
      this._initCloudChains();
    if (this._confController)
      this._initConfController();
    if (this._walletController) {
      this._initWalletController();
      this._initWallet();
    }
    if (this._pricing)
      this._initPricing();
  }

  /**
   * ENV var api handlers.
   * @private
   */
  _initEnv() {
    this._proc.handle(apiConstants.env_CC_WALLET_PASS, (evt, arg) => {
      return process.env.CC_WALLET_PASS;
    });
    this._proc.handle(apiConstants.env_CC_WALLET_AUTOLOGIN, (evt, arg) => {
      return process.env.CC_WALLET_AUTOLOGIN;
    });
    this._proc.on(apiConstants.env_reset_CC_WALLET_PASS, (evt, arg) => {
      process.env.CC_WALLET_AUTOLOGIN = '';
    });
  }

  /**
   * General api handlers.
   * @private
   */
  _initGeneral() {
    this._proc.handle(apiConstants.general_getError, (evt, arg) => {
      return this._err;
    });
    this._proc.on(apiConstants.general_storeScreenSize, (evt, screenSize) => {
      if (_.has(screenSize, 'width') && _.has(screenSize, 'height'))
        this._storage.setItem(storageKeys.SCREEN_SIZE, screenSize);
    });
    this._proc.on(apiConstants.general_requestClose, (evt, reason) => {
      logger.error(reason);
      this._app.quit();
    });
    this._proc.handle(apiConstants.general_userLocale, (evt, arg) => {
      return this._storage.getItem(storageKeys.LOCALE);
    });
    this._proc.handle(apiConstants.general_getLocaleData, (evt, locale) => {
      return getLocaleData(locale);
    });
    this._proc.handle(apiConstants.general_getAppVersion, (evt, arg) => {
      return this._storage.getItem(storageKeys.APP_VERSION);
    });
    this._proc.handle(apiConstants.general_getImageDir, (evt, image) => {
      return path.join(IMAGE_DIR, image);
    });
    this._proc.on(apiConstants.general_openUrl, (evt, url) => {
      if (/^https:\/\/(?!file)[a-zA-Z0-9_]+\.(?:(?!\/\/)[a-zA-Z0-9_%$?/.])+$/i.test(url))
        electron.shell.openExternal(url); // TODO Security whitelist
    });
    this._proc.handle(apiConstants.general_qrCode, (evt, data) => {
      return new Promise((resolve, reject) => {
        QRCode.toDataURL(data, (err, url) => {
          if (err)
            reject(err);
          else
            resolve(url);
        });
      });
    });
    this._proc.handle(apiConstants.general_setClipboard, (evt, text) => {
      return electron.clipboard.writeText(text.trim());
    });
    this._proc.handle(apiConstants.general_getClipboard, (evt, arg) => {
      return electron.clipboard.readText('selection'); // TODO Security issue?
    });
    this._proc.on(apiConstants.general_isDev, (evt, arg) => evt.returnValue = isDev);

    if (this._zoomController) {
    this._proc.on(apiConstants.general_setZoomFactor, (evt, zoomFactor) => {
      this._storage.setItem(storageKeys.ZOOM_FACTOR, zoomFactor);
    });
    this._proc.on(apiConstants.general_zoomIn, () => {
      this._zoomController.zoomIn();
    });
    this._proc.on(apiConstants.general_zoomOut, () => {
      this._zoomController.zoomOut();
    });
    this._proc.on(apiConstants.general_zoomReset, () => {
      this._zoomController.zoomReset();
    });
    this._proc.on(apiConstants.general_getPlatform, (evt) => {
      evt.returnValue = process.platform;
    });
    } // end zoomController
  }

  /**
   * CloudChains api handlers.
   * @private
   */
  _initCloudChains() {
    this._proc.handle(apiConstants.cloudChains_isInstalled, (evt, arg) => {
      return this._cloudChains.isInstalled();
    });
    this._proc.handle(apiConstants.cloudChains_hasSettings, (evt, arg) => {
      return this._cloudChains.hasSettings();
    });
    this._proc.handle(apiConstants.cloudChains_getWalletConf, async (evt, ticker) => {
      return this.sanitize(await this._cloudChains.getWalletConf(ticker), this._blacklist, this._whitelist);
    });
    this._proc.handle(apiConstants.cloudChains_getWalletConfs, async (evt, arg) => {
      return this.sanitize(await this._cloudChains.getWalletConfs(), this._blacklist, this._whitelist);
    });
    this._proc.handle(apiConstants.cloudChains_getMasterConf, async (evt, arg) => {
      return this.sanitize(await this._cloudChains.getMasterConf(), this._blacklist, this._whitelist);
    });
    this._proc.handle(apiConstants.cloudChains_isWalletCreated, (evt, arg) => {
      return this._cloudChains.isWalletCreated();
    });
    this._proc.handle(apiConstants.cloudChains_saveWalletCredentials, (evt, password, salt, mnemonic) => {
      return this._cloudChains.saveWalletCredentials(password, salt, mnemonic);
    });
    this._proc.handle(apiConstants.cloudChains_getStoredPassword, (evt, arg) => {
      return this._cloudChains.getStoredPassword();
    });
    this._proc.handle(apiConstants.cloudChains_getStoredSalt, (evt, arg) => {
      return this._cloudChains.getStoredSalt();
    });
    this._proc.handle(apiConstants.cloudChains_getStoredMnemonic, (evt, arg) => {
      return this._cloudChains.getStoredMnemonic();
    });
    this._proc.handle(apiConstants.cloudChains_getDecryptedMnemonic, (evt, password) => {
      return this._cloudChains.getDecryptedMnemonic(password);
    });
    this._proc.handle(apiConstants.cloudChains_loadConfs, (evt, arg) => {
      return this._cloudChains.loadConfs();
    });
    this._proc.handle(apiConstants.cloudChains_getCCSPVVersion, (evt, arg) => {
      return this._cloudChains.getCCSPVVersion();
    });
    this._proc.handle(apiConstants.cloudChains_isWalletRPCRunning, (evt, arg) => {
      return this._cloudChains.isWalletRPCRunning();
    });
    this._proc.handle(apiConstants.cloudChains_spvIsRunning, (evt, arg) => {
      return this._cloudChains.spvIsRunning();
    });
    this._proc.handle(apiConstants.cloudChains_startSPV, (evt, password) => {
      return this._cloudChains.startSPV(password);
    });
    this._proc.handle(apiConstants.cloudChains_stopSPV, (evt, arg) => {
      return this._cloudChains.stopSPV();
    });
    this._proc.handle(apiConstants.cloudChains_createSPVWallet, (evt, password) => {
      return this._cloudChains.createSPVWallet(password);
    });
    this._proc.handle(apiConstants.cloudChains_enableAllWallets, (evt, arg) => {
      return this._cloudChains.enableAllWallets();
    });
    this._proc.handle(apiConstants.cloudChains_changePassword, (evt, oldPassword, newPassword) => {
      return this._cloudChains.changePassword(oldPassword, newPassword);
    });
    this._proc.handle(apiConstants.cloudChains_matchesStoredPassword, (evt, password) => {
      return this._cloudChains.matchesStoredPassword(password);
    });
  }

  /**
   * ConfController api handlers.
   * @private
   */
  _initConfController() {
    this._proc.handle(apiConstants.confController_getManifest, (evt, arg) => {
      return this._confController.getManifest();
    });
    this._proc.handle(apiConstants.confController_getManifestHash, (evt, arg) => {
      return this._confController.getManifestHash();
    });
    this._proc.handle(apiConstants.confController_getXBridgeInfo, async (evt, arg) => {
      return this.sanitize(await this._confController.getXBridgeInfo(), this._blacklist, this._whitelist);
    });
  }

  /**
   * WalletController api handlers.
   * @private
   */
  _initWalletController() {
    this._proc.handle(apiConstants.walletController_getWallets, async (evt, arg) => {
      return this.sanitize(_.cloneDeep(await this._walletController.getWallets()), this._blacklist, this._whitelist);
    });
    this._proc.handle(apiConstants.walletController_getWallet, async (evt, ticker) => {
      return this.sanitize(_.cloneDeep(await this._walletController.getWallet(ticker)), this._blacklist, this._whitelist);
    });
    this._proc.handle(apiConstants.walletController_getEnabledWallets, async (evt, arg) => {
      return this.sanitize(_.cloneDeep(await this._walletController.getEnabledWallets()), this._blacklist, this._whitelist);
    });
    this._proc.handle(apiConstants.walletController_getBalances, (evt, arg) => {
      return this._walletController.getBalances();
    });
    this._proc.handle(apiConstants.walletController_getCurrencyMultipliers, (evt, arg) => {
      return this._walletController.getCurrencyMultipliers();
    });
    this._proc.handle(apiConstants.walletController_loadWallets, (evt, arg) => {
      return this._walletController.loadWallets();
    });
    this._proc.handle(apiConstants.walletController_updatePriceMultipliers, (evt, arg) => {
      return this._walletController.updatePriceMultipliers(WalletController.defaultRequest);
    });
    this._proc.handle(apiConstants.walletController_updateBalanceInfo, (evt, ticker) => {
      return this._walletController.updateBalanceInfo(ticker);
    });
    this._proc.handle(apiConstants.walletController_updateAllBalances, (evt, arg) => {
      return this._walletController.updateAllBalances();
    });
  }

  /**
   * Wallet api handlers.
   * @private
   */
  _initWallet() {
    this._proc.handle(apiConstants.wallet_rpcEnabled, (evt, ticker) => {
      return this._walletController.getWallet(ticker).rpcEnabled();
    });
    this._proc.handle(apiConstants.wallet_getBalance, (evt, ticker) => {
      return this._walletController.getWallet(ticker).getBalance();
    });
    this._proc.handle(apiConstants.wallet_getTransactions, async (evt, ticker, startTime, endTime) => {
      return this.sanitize(await this._walletController.getWallet(ticker).getTransactions(startTime, endTime), this._blacklist, this._whitelist);
    });
    this._proc.handle(apiConstants.wallet_getAddresses, (evt, ticker) => {
      return this._walletController.getWallet(ticker).getAddresses();
    });
    this._proc.handle(apiConstants.wallet_generateNewAddress, (evt, ticker) => {
      return this._walletController.getWallet(ticker).generateNewAddress();
    });
    this._proc.handle(apiConstants.wallet_getCachedUnspent, async (evt, ticker, cacheExpirySeconds) => {
      return this.sanitize(await this._walletController.getWallet(ticker).getCachedUnspent(cacheExpirySeconds), this._blacklist, this._whitelist);
    });
    this._proc.handle(apiConstants.wallet_send, (evt, ticker, recipients) => {
      recipients = recipients.map(r => new Recipient(r));
      return this._walletController.getWallet(ticker).send(recipients);
    });
  }

  /**
   * Pricing api handlers.
   * @private
   */
  _initPricing() {
    this._proc.handle(apiConstants.pricing_getPrice, (evt, ticker, currency) => {
      return this._pricing.getPrice(ticker, currency);
    });
  }

  /**
   * Removes all private fields (those starting with _) and supports
   * whitelisting any fields. Blacklisted fields take precedence over
   * whitelisted fields.
   * @param o {Object}
   * @param blacklist {Array<string>} Remove all these fields
   * @param whitelist {Array<string>} Do not remove any of these fields
   * @return {*}
   */
  sanitize(o, blacklist=[], whitelist=[]) {
    if (_.isNil(o))
      return o;
    const b = new Set(blacklist);
    const w = new Set(whitelist);
    this.sanitizeObj(o, b, w);
    return o;
  }

  /**
   * Sanitizes a non-array object by removing private fields beginning
   * with an underscore _ and optionally blacklisting and whitelisting
   * the specified fields. Blacklisting takes precedence over
   * whitelisting.
   * @param o {*}
   * @param blacklist {Set}
   * @param whitelist {Set}
   */
  sanitizeObj(o, blacklist, whitelist) {
    if (_.isNull(o) || _.isString(o) || _.isNumber(o) || _.isFunction(o) || _.isBoolean(o))
      return;

    if (_.isArray(o) || typeof o[Symbol.iterator] === 'function' || o instanceof Set) {
      for (const item of o)
        this.sanitizeObj(item, blacklist, whitelist);
    } else if (o instanceof Map || o instanceof IMap) {
      for (const [key, value] of o)
        this.sanitizeObj(value, blacklist, whitelist);
    } else {
      for (const key in o) {
        if ({}.hasOwnProperty.call(o, key)) {
          if (blacklist.has(key) || (key.startsWith('_') && !whitelist.has(key)))
            delete o[key];
          else
            this.sanitizeObj(o[key], blacklist, whitelist);
        }
      }
    }
  }
}

export default Api;