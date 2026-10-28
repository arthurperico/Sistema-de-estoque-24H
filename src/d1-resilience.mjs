const RETRYABLE_D1_ERROR_PATTERNS = [
    /network connection lost/i,
    /reset because its code was updated/i,
    /internal error while starting up d1 db storage caused object to be reset/i,
    /d1 db storage caused object to be reset/i,
    /cannot resolve d1 db due to transient issue/i
];

const UNAVAILABLE_D1_ERROR_PATTERNS = [
    ...RETRYABLE_D1_ERROR_PATTERNS,
    /d1 db is overloaded/i,
    /d1 db storage operation exceeded timeout/i,
    /d1 db(?:'s)? isolate exceeded its memory limit/i,
    /d1 db exceeded its cpu time limit/i
];

function collectErrorMessages(error) {
    const messages = [];
    const seen = new Set();
    let current = error;

    while (current && !seen.has(current)) {
        seen.add(current);
        if (typeof current === 'string') {
            messages.push(current);
            break;
        }
        if (current?.message) messages.push(String(current.message));
        current = current?.cause;
    }

    if (!messages.length && error !== undefined && error !== null) {
        messages.push(String(error));
    }

    return messages;
}

export function getD1ErrorMessage(error) {
    return collectErrorMessages(error).join(' | ');
}

export function isRetryableD1Error(error) {
    const message = getD1ErrorMessage(error);
    return RETRYABLE_D1_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

export function isD1UnavailableError(error) {
    const message = getD1ErrorMessage(error);
    return UNAVAILABLE_D1_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

export class D1WriteOutcomeUnknownError extends Error {
    constructor(operation, cause) {
        super('O resultado da gravação no D1 não pôde ser confirmado', { cause });
        this.name = 'D1WriteOutcomeUnknownError';
        this.code = 'DATABASE_WRITE_OUTCOME_UNKNOWN';
        this.operation = operation;
    }
}

export function isD1WriteOutcomeUnknownError(error) {
    return error instanceof D1WriteOutcomeUnknownError
        || error?.code === 'DATABASE_WRITE_OUTCOME_UNKNOWN';
}

export function protectD1WriteOutcome(operation, error) {
    if (isD1UnavailableError(error)) {
        return new D1WriteOutcomeUnknownError(operation, error);
    }
    return error;
}

function secureJitter(maxExclusive) {
    if (maxExclusive <= 1) return 0;
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] % maxExclusive;
}

function wait(delayMs) {
    return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function withD1Retry(operation, options = {}) {
    const maxAttempts = Math.max(1, Number(options.maxAttempts) || 6);
    const baseDelayMs = Math.max(0, Number(options.baseDelayMs) || 50);
    const maxDelayMs = Math.max(baseDelayMs, Number(options.maxDelayMs) || 800);
    const sleep = options.sleep || wait;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            return await operation(attempt);
        } catch (error) {
            if (!isRetryableD1Error(error) || attempt >= maxAttempts) {
                throw error;
            }

            const exponentialCeiling = Math.min(maxDelayMs, baseDelayMs * (2 ** (attempt - 1)));
            const delayMs = secureJitter(exponentialCeiling + 1);
            if (typeof options.onRetry === 'function') {
                await options.onRetry({ attempt, delayMs, error });
            }
            await sleep(delayMs);
        }
    }

    throw new Error('Retentativa D1 encerrada sem resultado');
}

export function isRetrySafeSql(sql) {
    const normalized = String(sql || '')
        .replace(/^\s*(?:--[^\n]*\n\s*)*/g, '')
        .trim()
        .toUpperCase();

    return normalized.startsWith('SELECT ')
        || normalized.startsWith('EXPLAIN ')
        || /^PRAGMA\s+(?:TABLE_INFO|TABLE_XINFO|INDEX_LIST|INDEX_INFO|INDEX_XINFO|FOREIGN_KEY_LIST)\s*\(/.test(normalized)
        || /^CREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX)\s+IF\s+NOT\s+EXISTS\b/.test(normalized);
}
