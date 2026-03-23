import type {
  BrowserFormFieldInput,
  RunHostAction,
} from '../../inspector-types.js';
import type { ProviderHealthEntry } from '../../ui-types.js';
import { healthyConfiguredProviderActions } from '../../ui-helpers.js';

interface BrowserHostCardProps {
  browserFormFieldsText: string;
  browserSubmitSelector: string;
  browserTarget: string;
  hostActionBusy: boolean;
  parseBrowserFormFields(): BrowserFormFieldInput[];
  providerHealth: ProviderHealthEntry[];
  runHostAction: RunHostAction;
  selectedChatId: string;
  setActionError(message: string): void;
  setBrowserFormFieldsText(value: string): void;
  setBrowserSubmitSelector(value: string): void;
  setBrowserTarget(value: string): void;
}

export function BrowserHostCard({
  browserFormFieldsText,
  browserSubmitSelector,
  browserTarget,
  hostActionBusy,
  parseBrowserFormFields,
  providerHealth,
  runHostAction,
  selectedChatId,
  setActionError,
  setBrowserFormFieldsText,
  setBrowserSubmitSelector,
  setBrowserTarget,
}: BrowserHostCardProps) {
  const availableActions = healthyConfiguredProviderActions(
    providerHealth,
    'browser',
  );
  const canOpen = availableActions.includes('open');
  const canInspect = availableActions.includes('inspect_page');
  const canFill = availableActions.includes('fill_form');
  const canSnapshot = availableActions.includes('snapshot');
  const canScreenshot = availableActions.includes('screenshot');
  const trimmedTarget = browserTarget.trim();

  return (
    <article className="host-action-card">
      <label className="field-label" htmlFor="browser-target">
        Browser target
      </label>
      <input
        className="field-input"
        id="browser-target"
        onChange={(event) => setBrowserTarget(event.target.value)}
        placeholder="https://example.com"
        type="url"
        value={browserTarget}
      />
      <label className="field-label" htmlFor="browser-form-fields">
        Browser form fields (JSON)
      </label>
      <textarea
        className="field-input"
        id="browser-form-fields"
        onChange={(event) => setBrowserFormFieldsText(event.target.value)}
        rows={6}
        spellCheck={false}
        value={browserFormFieldsText}
      />
      <label className="field-label" htmlFor="browser-submit-selector">
        Submit selector (optional)
      </label>
      <input
        className="field-input"
        id="browser-submit-selector"
        onChange={(event) => setBrowserSubmitSelector(event.target.value)}
        placeholder="button[type=submit]"
        type="text"
        value={browserSubmitSelector}
      />
      <div className="toolbar">
        <button
          className="ghost-btn"
          disabled={hostActionBusy || !trimmedTarget || !canOpen}
          onClick={() =>
            runHostAction('/api/tools/browser/open', {
              chatId: selectedChatId,
              target: trimmedTarget,
            })
          }
          title={
            !trimmedTarget
              ? 'Enter a browser target URL first.'
              : !canOpen
                ? 'No configured healthy browser provider can open URLs right now.'
                : undefined
          }
          type="button"
        >
          Open URL
        </button>
        <button
          className="ghost-btn"
          disabled={hostActionBusy || !trimmedTarget || !canInspect}
          onClick={() =>
            runHostAction('/api/tools/browser/inspect-page', {
              chatId: selectedChatId,
              compact: true,
              interactive: true,
              target: trimmedTarget,
            })
          }
          title={
            !trimmedTarget
              ? 'Enter a browser target URL first.'
              : !canInspect
                ? 'No configured healthy browser provider can inspect pages right now.'
                : undefined
          }
          type="button"
        >
          Inspect Page
        </button>
        <button
          className="ghost-btn"
          disabled={hostActionBusy || !canFill}
          onClick={() => {
            try {
              const fields = parseBrowserFormFields();
              runHostAction('/api/tools/browser/fill-form', {
                ...(browserSubmitSelector.trim()
                  ? {
                      submitSelector: browserSubmitSelector.trim(),
                    }
                  : {}),
                chatId: selectedChatId,
                compact: true,
                fields,
                interactive: true,
                target: browserTarget.trim(),
              });
            } catch (error) {
              setActionError(
                error instanceof Error
                  ? error.message
                  : 'Invalid form field JSON.',
              );
            }
          }}
          title={
            !canFill
              ? 'No configured healthy browser provider can fill forms right now.'
              : undefined
          }
          type="button"
        >
          Fill Form
        </button>
        <button
          className="ghost-btn"
          disabled={hostActionBusy || !canSnapshot}
          onClick={() =>
            runHostAction('/api/tools/browser/snapshot', {
              chatId: selectedChatId,
              compact: true,
              interactive: true,
            })
          }
          title={
            !canSnapshot
              ? 'No configured healthy browser provider can snapshot the current session right now.'
              : undefined
          }
          type="button"
        >
          Snapshot
        </button>
        <button
          className="ghost-btn"
          disabled={hostActionBusy || !canScreenshot}
          onClick={() =>
            runHostAction('/api/tools/browser/screenshot', {
              chatId: selectedChatId,
              filePath: `/tmp/willclaw-browser-${Date.now().toString(36)}.png`,
              fullPage: true,
            })
          }
          title={
            !canScreenshot
              ? 'No configured healthy browser provider can capture browser screenshots right now.'
              : undefined
          }
          type="button"
        >
          Screenshot
        </button>
      </div>
      <p className="muted">
        Healthy configured browser actions:{' '}
        {availableActions.length > 0 ? availableActions.join(', ') : 'none'}.
      </p>
      <p className="muted">Reuses the current web chat as the hosted browser session.</p>
    </article>
  );
}
