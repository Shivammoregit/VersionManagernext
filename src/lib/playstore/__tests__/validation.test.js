/**
 * Tests for validation.js
 * 
 * @module playstore/__tests__/validation.test
 */

import {
    validatePackageId,
    assertValidPackageId,
    sanitizeForLogging,
    timingSafeEqual,
} from '../validation.js';
import { ValidationError } from '../errors.js';

describe('validatePackageId', () => {
    describe('valid package IDs', () => {
        test('accepts standard package ID format', () => {
            const result = validatePackageId('com.example.app');
            expect(result.valid).toBe(true);
            expect(result.sanitized).toBe('com.example.app');
        });

        test('accepts package ID with numbers', () => {
            const result = validatePackageId('com.example.app123');
            expect(result.valid).toBe(true);
        });

        test('accepts package ID with underscores', () => {
            const result = validatePackageId('com.example.my_app');
            expect(result.valid).toBe(true);
        });

        test('accepts long package ID', () => {
            const result = validatePackageId('com.verylongcompanyname.verylongappname.subpackage');
            expect(result.valid).toBe(true);
        });

        test('normalizes to lowercase', () => {
            const result = validatePackageId('COM.Example.APP');
            expect(result.valid).toBe(true);
            expect(result.sanitized).toBe('com.example.app');
        });

        test('trims whitespace', () => {
            const result = validatePackageId('  com.example.app  ');
            expect(result.valid).toBe(true);
            expect(result.sanitized).toBe('com.example.app');
        });
    });

    describe('invalid package IDs', () => {
        test('rejects null', () => {
            const result = validatePackageId(null);
            expect(result.valid).toBe(false);
            expect(result.error).toContain('required');
        });

        test('rejects undefined', () => {
            const result = validatePackageId(undefined);
            expect(result.valid).toBe(false);
        });

        test('rejects empty string', () => {
            const result = validatePackageId('');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('empty');
        });

        test('rejects non-string input', () => {
            const result = validatePackageId(123);
            expect(result.valid).toBe(false);
            expect(result.error).toContain('string');
        });

        test('rejects single segment', () => {
            const result = validatePackageId('singleword');
            expect(result.valid).toBe(false);
        });

        test('rejects double dots', () => {
            const result = validatePackageId('com..example');
            expect(result.valid).toBe(false);
            // Fails on regex pattern first (segment must start with letter)
            expect(result.error).toBeDefined();
        });

        test('rejects starting with number', () => {
            const result = validatePackageId('123.example.app');
            expect(result.valid).toBe(false);
        });

        test('rejects segment starting with number', () => {
            const result = validatePackageId('com.123example.app');
            expect(result.valid).toBe(false);
        });

        test('rejects too short', () => {
            const result = validatePackageId('ab');
            expect(result.valid).toBe(false);
        });

        test('rejects too long', () => {
            const longId = 'com.' + 'a'.repeat(200) + '.app';
            const result = validatePackageId(longId);
            expect(result.valid).toBe(false);
            expect(result.error).toContain('150');
        });
    });

    describe('security - injection prevention', () => {
        test('rejects script tags', () => {
            const result = validatePackageId('<script>alert(1)</script>');
            expect(result.valid).toBe(false);
        });

        test('rejects javascript protocol', () => {
            const result = validatePackageId('javascript:alert(1)');
            expect(result.valid).toBe(false);
        });

        test('rejects path traversal', () => {
            const result = validatePackageId('../../../etc/passwd');
            expect(result.valid).toBe(false);
        });

        test('rejects null bytes', () => {
            const result = validatePackageId('com.example%00.app');
            expect(result.valid).toBe(false);
        });

        test('rejects HTML characters', () => {
            const result = validatePackageId('com.example<>app');
            expect(result.valid).toBe(false);
        });

        test('rejects SQL injection attempts', () => {
            const result = validatePackageId("com.example'; DROP TABLE--");
            expect(result.valid).toBe(false);
        });
    });
});

describe('assertValidPackageId', () => {
    test('returns sanitized ID for valid input', () => {
        const result = assertValidPackageId('com.example.app');
        expect(result).toBe('com.example.app');
    });

    test('throws ValidationError for invalid input', () => {
        expect(() => {
            assertValidPackageId('invalid');
        }).toThrow(ValidationError);
    });

    test('ValidationError has correct properties', () => {
        try {
            assertValidPackageId('');
        } catch (error) {
            expect(error).toBeInstanceOf(ValidationError);
            expect(error.code).toBe('VALIDATION_ERROR');
            expect(error.statusCode).toBe(400);
        }
    });
});

describe('sanitizeForLogging', () => {
    test('returns empty string for null', () => {
        expect(sanitizeForLogging(null)).toBe('');
    });

    test('returns empty string for undefined', () => {
        expect(sanitizeForLogging(undefined)).toBe('');
    });

    test('truncates long strings', () => {
        const long = 'a'.repeat(200);
        const result = sanitizeForLogging(long, 50);
        expect(result.length).toBe(50);
    });

    test('removes control characters', () => {
        const result = sanitizeForLogging('hello\x00world\x1f');
        expect(result).toBe('helloworld');
    });

    test('converts non-strings to strings', () => {
        const result = sanitizeForLogging(123);
        expect(result).toBe('123');
    });
});

describe('timingSafeEqual', () => {
    test('returns true for equal strings', () => {
        expect(timingSafeEqual('secret', 'secret')).toBe(true);
    });

    test('returns false for different strings', () => {
        expect(timingSafeEqual('secret', 'different')).toBe(false);
    });

    test('returns false for different lengths', () => {
        expect(timingSafeEqual('short', 'longer')).toBe(false);
    });

    test('returns false for non-string first arg', () => {
        expect(timingSafeEqual(123, 'secret')).toBe(false);
    });

    test('returns false for non-string second arg', () => {
        expect(timingSafeEqual('secret', null)).toBe(false);
    });

    test('handles empty strings', () => {
        expect(timingSafeEqual('', '')).toBe(true);
    });
});
