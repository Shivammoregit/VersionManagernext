/**
 * Tests for errors.js
 * 
 * @module playstore/__tests__/errors.test
 */

import {
    PlayStoreError,
    NotFoundError,
    RateLimitError,
    NetworkError,
    ValidationError,
    TimeoutError,
    ServiceUnavailableError,
    AuthenticationError,
    wrapError,
} from '../errors.js';

describe('PlayStoreError', () => {
    test('creates error with all properties', () => {
        const error = new PlayStoreError(
            'Internal message',
            'TEST_ERROR',
            'User-friendly message',
            500,
            { extra: 'data' }
        );

        expect(error.message).toBe('Internal message');
        expect(error.code).toBe('TEST_ERROR');
        expect(error.userMessage).toBe('User-friendly message');
        expect(error.statusCode).toBe(500);
        expect(error.details).toEqual({ extra: 'data' });
        expect(error.timestamp).toBeDefined();
    });

    test('toSafeResponse never exposes internal details', () => {
        const error = new PlayStoreError(
            'Sensitive internal error with stack trace',
            'INTERNAL',
            'Something went wrong',
            500,
            { sensitiveData: 'password123' }
        );

        const safeResponse = error.toSafeResponse();

        expect(safeResponse.success).toBe(false);
        expect(safeResponse.error.code).toBe('INTERNAL');
        expect(safeResponse.error.message).toBe('Something went wrong');
        expect(safeResponse).not.toHaveProperty('details');
        expect(JSON.stringify(safeResponse)).not.toContain('Sensitive');
        expect(JSON.stringify(safeResponse)).not.toContain('password');
    });

    test('toLogObject includes internal details', () => {
        const error = new PlayStoreError(
            'Internal message',
            'TEST',
            'User message',
            500,
            { debug: 'info' }
        );

        const logObject = error.toLogObject();

        expect(logObject.message).toBe('Internal message');
        expect(logObject.details).toEqual({ debug: 'info' });
        expect(logObject.timestamp).toBeDefined();
    });

    test('is instanceof Error', () => {
        const error = new PlayStoreError('msg', 'CODE', 'user msg', 500);
        expect(error).toBeInstanceOf(Error);
    });
});

describe('NotFoundError', () => {
    test('has correct status code 404', () => {
        const error = new NotFoundError('com.example.app');
        expect(error.statusCode).toBe(404);
        expect(error.code).toBe('NOT_FOUND');
    });

    test('sanitizes package ID in message', () => {
        const error = new NotFoundError('<script>alert(1)</script>');
        expect(error.message).not.toContain('<script>');
    });

    test('user message is safe', () => {
        const error = new NotFoundError('com.example.app');
        expect(error.userMessage).toBe('The requested app was not found on the Play Store.');
    });
});

describe('RateLimitError', () => {
    test('has correct status code 429', () => {
        const error = new RateLimitError(60000);
        expect(error.statusCode).toBe(429);
        expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    test('includes retry-after information', () => {
        const error = new RateLimitError(60000);
        expect(error.retryAfterMs).toBe(60000);
        expect(error.retryAfterSeconds).toBe(60);
    });

    test('safe response includes retryAfter', () => {
        const error = new RateLimitError(30000);
        const response = error.toSafeResponse();
        expect(response.retryAfter).toBe(30);
    });
});

describe('NetworkError', () => {
    test('has correct status code 503', () => {
        const error = new NetworkError('Connection failed');
        expect(error.statusCode).toBe(503);
        expect(error.code).toBe('NETWORK_ERROR');
    });

    test('is marked as retryable', () => {
        const error = new NetworkError();
        expect(error.isRetryable).toBe(true);
    });

    test('stores original error', () => {
        const originalError = new Error('ECONNREFUSED');
        const error = new NetworkError('Failed', originalError);
        expect(error.originalError).toBe(originalError);
    });
});

describe('ValidationError', () => {
    test('has correct status code 400', () => {
        const error = new ValidationError('packageId', 'Invalid format');
        expect(error.statusCode).toBe(400);
        expect(error.code).toBe('VALIDATION_ERROR');
    });

    test('includes field name', () => {
        const error = new ValidationError('packageId', 'Too long');
        expect(error.field).toBe('packageId');
    });

    test('sanitizes long field names', () => {
        const longField = 'a'.repeat(100);
        const error = new ValidationError(longField, 'Invalid');
        expect(error.field.length).toBeLessThanOrEqual(50);
    });
});

describe('TimeoutError', () => {
    test('has correct status code 504', () => {
        const error = new TimeoutError(30000);
        expect(error.statusCode).toBe(504);
        expect(error.code).toBe('TIMEOUT');
    });

    test('is marked as retryable', () => {
        const error = new TimeoutError();
        expect(error.isRetryable).toBe(true);
    });
});

describe('ServiceUnavailableError', () => {
    test('has correct status code 503', () => {
        const error = new ServiceUnavailableError();
        expect(error.statusCode).toBe(503);
        expect(error.code).toBe('SERVICE_UNAVAILABLE');
    });

    test('is marked as retryable', () => {
        const error = new ServiceUnavailableError();
        expect(error.isRetryable).toBe(true);
    });
});

describe('AuthenticationError', () => {
    test('has correct status code 401', () => {
        const error = new AuthenticationError();
        expect(error.statusCode).toBe(401);
        expect(error.code).toBe('UNAUTHORIZED');
    });
});

describe('wrapError', () => {
    test('returns PlayStoreError as-is', () => {
        const original = new NotFoundError('com.test');
        const wrapped = wrapError(original);
        expect(wrapped).toBe(original);
    });

    test('wraps network errors', () => {
        const original = new Error('fetch failed');
        const wrapped = wrapError(original);
        expect(wrapped).toBeInstanceOf(NetworkError);
    });

    test('wraps ECONNREFUSED as NetworkError', () => {
        const original = new Error('ECONNREFUSED');
        const wrapped = wrapError(original);
        expect(wrapped).toBeInstanceOf(NetworkError);
    });

    test('wraps "not found" as NotFoundError', () => {
        const original = new Error('App not found');
        const wrapped = wrapError(original);
        expect(wrapped).toBeInstanceOf(NotFoundError);
    });

    test('wraps 429 as RateLimitError', () => {
        const original = new Error('HTTP 429 Too Many Requests');
        const wrapped = wrapError(original);
        expect(wrapped).toBeInstanceOf(RateLimitError);
    });

    test('wraps timeout errors', () => {
        const original = new Error('Request timeout');
        const wrapped = wrapError(original);
        expect(wrapped).toBeInstanceOf(TimeoutError);
    });

    test('wraps unknown errors as generic PlayStoreError', () => {
        const original = new Error('Something weird happened');
        const wrapped = wrapError(original);
        expect(wrapped).toBeInstanceOf(PlayStoreError);
        expect(wrapped.code).toBe('INTERNAL_ERROR');
    });

    test('handles null', () => {
        const wrapped = wrapError(null);
        expect(wrapped).toBeInstanceOf(PlayStoreError);
    });

    test('handles undefined', () => {
        const wrapped = wrapError(undefined);
        expect(wrapped).toBeInstanceOf(PlayStoreError);
    });
});
