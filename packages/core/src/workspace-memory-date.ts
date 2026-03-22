const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function padDatePart(value: number): string {
    return value.toString().padStart(2, '0');
}

function parseDateKeyParts(dateKey: string): {
    year: number;
    month: number;
    day: number;
} {
    const normalized = dateKey.trim();
    const match = DATE_KEY_PATTERN.exec(normalized);
    if (!match) {
        throw new Error('Daily note date must use YYYY-MM-DD format.');
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const parsed = new Date(year, month - 1, day);

    if (
        Number.isNaN(parsed.getTime()) ||
        parsed.getFullYear() !== year ||
        parsed.getMonth() !== month - 1 ||
        parsed.getDate() !== day
    ) {
        throw new Error(`Invalid daily note date: ${normalized}`);
    }

    return {
        year,
        month,
        day,
    };
}

export function isValidDateKey(value: string): boolean {
    try {
        parseDateKeyParts(value);
        return true;
    } catch {
        return false;
    }
}

export function formatLocalDateKey(date: Date): string {
    if (Number.isNaN(date.getTime())) {
        throw new Error('Invalid daily note date input.');
    }

    return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

export function resolveDateKey(input?: Date | string): string {
    if (!input) {
        return formatLocalDateKey(new Date());
    }

    if (typeof input === 'string') {
        const { year, month, day } = parseDateKeyParts(input);
        return `${year}-${padDatePart(month)}-${padDatePart(day)}`;
    }

    return formatLocalDateKey(input);
}

export function buildLocalDayRange(dateKey: string): { from: string; to: string } {
    const { year, month, day } = parseDateKeyParts(dateKey);
    const from = new Date(year, month - 1, day);
    const to = new Date(year, month - 1, day + 1);

    return {
        from: from.toISOString(),
        to: to.toISOString(),
    };
}
