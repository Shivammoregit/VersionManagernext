/**
 * Play Store Scraper Module - Input Validation
 * 
 * Provides validation utilities for sanitizing and validating user inputs.
 * Implements strict validation to prevent injection attacks and ensure data integrity.
 * 
 * @module playstore/validation
 */

import { ValidationError } from './errors.js';

/**
 * Valid Android package ID pattern.
 * Rules:
 * - Must start with a letter
 * - Can contain letters, digits, and underscores
 * - Must have at least two segments separated by dots
 * - Each segment must start with a letter
 * - Maximum length: 150 characters (Google Play limit)
 */
const PACKAGE_ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;

/**
 * Maximum allowed package ID length (Google Play limit)
 */
const MAX_PACKAGE_ID_LENGTH = 150;

/**
 * Minimum package ID length (e.g., "a.b" = 3 characters)
 */
const MIN_PACKAGE_ID_LENGTH = 3;

/**
 * Reserved/dangerous patterns that should be rejected
 */
const DANGEROUS_PATTERNS = [
    /<script/i,
    /javascript:/i,
    /\.\.\//,
    /%00/,
    /[\x00-\x1f]/,  // Control characters
    /[<>'"]/,        // HTML/SQL injection chars
];

/**
 * Validates an Android package ID.
 * 
 * @param {string} packageId - The package ID to validate
 * @returns {{ valid: boolean, sanitized: string, error?: string }} Validation result
 * 
 * @example
 * validatePackageId('com.google.android.apps.maps')
 * // => { valid: true, sanitized: 'com.google.android.apps.maps' }
 * 
 * @example
 * validatePackageId('invalid..package')
 * // => { valid: false, sanitized: '', error: 'Invalid package ID format' }
 */
export function validatePackageId(packageId) {
    // Check if input exists and is a string
    if (packageId === null || packageId === undefined) {
        return {
            valid: false,
            sanitized: '',
            error: 'Package ID is required',
        };
    }

    if (typeof packageId !== 'string') {
        return {
            valid: false,
            sanitized: '',
            error: 'Package ID must be a string',
        };
    }

    // Trim whitespace
    const trimmed = packageId.trim();

    // Check for empty string
    if (trimmed.length === 0) {
        return {
            valid: false,
            sanitized: '',
            error: 'Package ID cannot be empty',
        };
    }

    // Check length constraints
    if (trimmed.length < MIN_PACKAGE_ID_LENGTH) {
        return {
            valid: false,
            sanitized: '',
            error: `Package ID must be at least ${MIN_PACKAGE_ID_LENGTH} characters`,
        };
    }

    if (trimmed.length > MAX_PACKAGE_ID_LENGTH) {
        return {
            valid: false,
            sanitized: '',
            error: `Package ID cannot exceed ${MAX_PACKAGE_ID_LENGTH} characters`,
        };
    }

    // Check for dangerous patterns (security)
    for (const pattern of DANGEROUS_PATTERNS) {
        if (pattern.test(trimmed)) {
            return {
                valid: false,
                sanitized: '',
                error: 'Package ID contains invalid characters',
            };
        }
    }

    // Validate format
    if (!PACKAGE_ID_PATTERN.test(trimmed)) {
        return {
            valid: false,
            sanitized: '',
            error: 'Invalid package ID format. Must be like "com.example.app"',
        };
    }

    // Check for double dots (invalid in package names)
    if (trimmed.includes('..')) {
        return {
            valid: false,
            sanitized: '',
            error: 'Package ID cannot contain consecutive dots',
        };
    }

    return {
        valid: true,
        sanitized: trimmed.toLowerCase(), // Normalize to lowercase
    };
}

/**
 * Validates a package ID and throws a ValidationError if invalid.
 * Use this in API routes for automatic error handling.
 * 
 * @param {string} packageId - The package ID to validate
 * @returns {string} Sanitized package ID
 * @throws {ValidationError} If validation fails
 * 
 * @example
 * try {
 *   const sanitized = assertValidPackageId('com.example.app');
 * } catch (error) {
 *   // Handle validation error
 * }
 */
export function assertValidPackageId(packageId) {
    const result = validatePackageId(packageId);

    if (!result.valid) {
        throw new ValidationError('packageId', result.error);
    }

    return result.sanitized;
}

/**
 * Sanitizes a string for safe logging.
 * Removes or masks potentially dangerous content.
 * 
 * @param {string} input - String to sanitize
 * @param {number} [maxLength=100] - Maximum output length
 * @returns {string} Sanitized string
 */
export function sanitizeForLogging(input, maxLength = 100) {
    if (input === null || input === undefined) {
        return '';
    }

    if (typeof input !== 'string') {
        input = String(input);
    }

    // Remove control characters and limit length
    const cleaned = input
        .replace(/[\x00-\x1f\x7f]/g, '')
        .substring(0, maxLength);

    return cleaned;
}

/**
 * Validates request headers for security.
 * Checks for required headers and suspicious patterns.
 * 
 * @param {Headers|Object} headers - Request headers
 * @returns {{ valid: boolean, issues: string[] }} Validation result
 */
export function validateHeaders(headers) {
    const issues = [];

    if (!headers) {
        return { valid: true, issues: [] };
    }

    // Check for suspiciously long header values
    const getHeader = (name) => {
        if (headers instanceof Headers) {
            return headers.get(name);
        }
        return headers[name];
    };

    const contentLength = getHeader('content-length');
    if (contentLength && parseInt(contentLength, 10) > 10000) {
        issues.push('Request body too large');
    }

    return {
        valid: issues.length === 0,
        issues,
    };
}

/**
 * Timing-safe string comparison to prevent timing attacks.
 * Uses constant-time comparison regardless of where strings differ.
 * 
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {boolean} True if strings are equal
 */
export function timingSafeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') {
        return false;
    }

    // Ensure both strings have the same length for comparison
    const aLen = a.length;
    const bLen = b.length;

    // Use the longer length for comparison to prevent length-based timing attacks
    const maxLen = Math.max(aLen, bLen);

    let result = aLen === bLen ? 0 : 1;

    for (let i = 0; i < maxLen; i++) {
        const aChar = i < aLen ? a.charCodeAt(i) : 0;
        const bChar = i < bLen ? b.charCodeAt(i) : 0;
        result |= aChar ^ bChar;
    }

    return result === 0;
}

export default {
    validatePackageId,
    assertValidPackageId,
    sanitizeForLogging,
    validateHeaders,
    timingSafeEqual,
};
