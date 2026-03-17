import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import pino from 'pino';

export async function createAppLogger(
    appLogPath: string,
): Promise<pino.Logger> {
    await mkdir(path.dirname(appLogPath), { recursive: true });

    return pino(
        {
            name: 'willclaw',
            level: process.env.LOG_LEVEL ?? 'info',
            base: null,
            timestamp: pino.stdTimeFunctions.isoTime,
        },
        pino.destination({
            dest: appLogPath,
            mkdir: true,
            sync: true,
        }),
    );
}
