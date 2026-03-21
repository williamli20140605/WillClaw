import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import pino from 'pino';

export interface AppLoggerHandle {
    destination: ReturnType<typeof pino.destination>;
    logger: pino.Logger;
}

export async function createAppLogger(
    appLogPath: string,
): Promise<AppLoggerHandle> {
    await mkdir(path.dirname(appLogPath), { recursive: true });

    const destination = pino.destination({
        dest: appLogPath,
        mkdir: true,
        sync: true,
    });
    const logger = pino(
        {
            name: 'willclaw',
            level: process.env.LOG_LEVEL ?? 'info',
            base: null,
            timestamp: pino.stdTimeFunctions.isoTime,
        },
        destination,
    );

    return {
        destination,
        logger,
    };
}
