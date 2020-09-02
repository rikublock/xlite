/** Main process constants */
import {DEFAULT_LOCALE} from '../../app/constants';

import {app} from 'electron';
import path from 'path';
import fs from 'fs-extra';

export const DATA_DIR = app ? app.getPath('userData') : '';
export const ICON_DIR = app ? path.join(app.getPath('userData'), 'icons') : '';
export const IMAGE_DIR = path.resolve(__dirname, '../../images');

export const getLocaleData = locale => {
  const localesPath = path.resolve(__dirname, '../../../locales');
  const files = fs.readdirSync(localesPath);
  const localeFileName = `${locale}.json`;
  let data;
  if(files.includes(localeFileName)) {
    data = fs.readJsonSync(path.join(localesPath, localeFileName));
  } else {
    data = fs.readJsonSync(path.join(localesPath, `${DEFAULT_LOCALE}.json`));
  }
  return data;
};

// differentiate in code between the main and renderer processes
export const isRenderer = () => process.type === 'renderer';

export const storageKeys = {
  APP_VERSION: 'APP_VERSION',
  LOCALE: 'LOCALE',
  ZOOM_FACTOR: 'ZOOM_FACTOR',
  SCREEN_SIZE: 'SCREEN_SIZE',
  PASSWORD: 'PASSWORD',
  SALT: 'SALT',
  MNEMONIC: 'MNEMONIC',
  MANIFEST: 'MANIFEST',
  MANIFEST_SHA: 'MANIFEST_SHA',
  XBRIDGE_INFO: 'XBRIDGE_INFO',
  BALANCES: 'BALANCES',
  TRANSACTIONS: 'TRANSACTIONS',
  ALT_CURRENCY_MULTIPLIERS: 'ALT_CURRENCY_MULTIPLIERS',
  TX_LAST_FETCH_TIME: 'TX_LAST_FETCH_TIME',
};
