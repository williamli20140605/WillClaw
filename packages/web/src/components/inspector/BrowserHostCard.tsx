import type {
  BrowserFormFieldInput,
  RunHostAction,
} from '../../inspector-types.js';

interface BrowserHostCardProps {
  browserFormFieldsText: string;
  browserSubmitSelector: string;
  browserTarget: string;
  hostActionBusy: boolean;
  parseBrowserFormFields(): BrowserFormFieldInput[];
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
  runHostAction,
  selectedChatId,
  setActionError,
  setBrowserFormFieldsText,
  setBrowserSubmitSelector,
  setBrowserTarget,
}: BrowserHostCardProps) {
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
          disabled={hostActionBusy}
          onClick={() =>
            runHostAction('/api/tools/browser/open', {
              chatId: selectedChatId,
              target: browserTarget.trim(),
            })
          }
          type="button"
        >
          Open URL
        </button>
        <button
          className="ghost-btn"
          disabled={hostActionBusy}
          onClick={() =>
            runHostAction('/api/tools/browser/inspect-page', {
              chatId: selectedChatId,
              compact: true,
              interactive: true,
              target: browserTarget.trim(),
            })
          }
          type="button"
        >
          Inspect Page
        </button>
        <button
          className="ghost-btn"
          disabled={hostActionBusy}
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
          type="button"
        >
          Fill Form
        </button>
        <button
          className="ghost-btn"
          disabled={hostActionBusy}
          onClick={() =>
            runHostAction('/api/tools/browser/snapshot', {
              chatId: selectedChatId,
              compact: true,
              interactive: true,
            })
          }
          type="button"
        >
          Snapshot
        </button>
        <button
          className="ghost-btn"
          disabled={hostActionBusy}
          onClick={() =>
            runHostAction('/api/tools/browser/screenshot', {
              chatId: selectedChatId,
              filePath: `/tmp/willclaw-browser-${Date.now().toString(36)}.png`,
              fullPage: true,
            })
          }
          type="button"
        >
          Screenshot
        </button>
      </div>
      <p className="muted">
        Reuses the current web chat as the hosted browser session.
      </p>
    </article>
  );
}
