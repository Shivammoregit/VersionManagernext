/**
 * App Store Scraper Module - Main Entry Point
 * 
 * @module appstore
 */

export {
    AppStoreScraper,
    getDefaultAppStoreScraper,
    getAppStoreVersion,
    getAppStoreVersionByAppId,
    validateBundleId,
    validateAppId,
} from './scraper.js';

export const VERSION = '1.0.0';
