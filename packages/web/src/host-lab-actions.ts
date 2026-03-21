import type { BrowserFormFieldInput } from './inspector-types.js';
import { formatStructuredResult, readJson } from './ui-helpers.js';

interface HostLabActionsOptions {
  browserFormFieldsText: string;
  loadChatList(): Promise<void>;
  loadSchedulerPanel(): Promise<void>;
  loadToolLogsPanel(chatId: string): Promise<void>;
  selectedChatId: string;
  setActionError(message: string): void;
  setHostActionBusy(value: boolean): void;
  setHostActionResult(value: string): void;
}

export function createHostLabActions({
  browserFormFieldsText,
  loadChatList,
  loadSchedulerPanel,
  loadToolLogsPanel,
  selectedChatId,
  setActionError,
  setHostActionBusy,
  setHostActionResult,
}: HostLabActionsOptions) {
  async function handleTaskRun(endpoint: string): Promise<void> {
    setActionError('');

    try {
      await readJson(endpoint, {
        method: 'POST',
      });
      await Promise.all([loadSchedulerPanel(), loadChatList()]);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Task trigger failed.',
      );
    }
  }

  async function runHostAction(
    endpoint: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    setHostActionBusy(true);
    setActionError('');

    try {
      const result = await readJson<unknown>(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      setHostActionResult(formatStructuredResult(result));
      await loadToolLogsPanel(selectedChatId);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Host action failed.',
      );
    } finally {
      setHostActionBusy(false);
    }
  }

  function parseBrowserFormFields(): BrowserFormFieldInput[] {
    const parsed = JSON.parse(browserFormFieldsText) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error('Form fields JSON must be an array.');
    }

    const fields = parsed
      .map((entry) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          return null;
        }

        const record = entry as Record<string, unknown>;
        const selector =
          typeof record.selector === 'string' ? record.selector.trim() : '';
        const text = typeof record.text === 'string' ? record.text : '';
        const clear =
          typeof record.clear === 'boolean' ? record.clear : undefined;

        if (!selector || !text) {
          return null;
        }

        return {
          selector,
          text,
          ...(clear !== undefined ? { clear } : {}),
        };
      })
      .filter((entry): entry is BrowserFormFieldInput => entry !== null);

    if (fields.length === 0) {
      throw new Error('Form fields JSON must include at least one field.');
    }

    return fields;
  }

  return {
    handleTaskRun,
    parseBrowserFormFields,
    runHostAction,
  };
}
