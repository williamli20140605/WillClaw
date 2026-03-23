import type { RunHostAction } from '../../inspector-types.js';
import type { ProviderHealthEntry } from '../../ui-types.js';
import { healthyConfiguredProviderActions } from '../../ui-helpers.js';

interface ScreenHostCardProps {
  hostActionBusy: boolean;
  providerHealth: ProviderHealthEntry[];
  runHostAction: RunHostAction;
  screenApp: string;
  screenInputText: string;
  screenSendClear: boolean;
  screenSendInspectAfter: boolean;
  screenSendLaunchIfNeeded: boolean;
  screenSendPressReturn: boolean;
  screenSendRequireFrontmost: boolean;
  selectedChatId: string;
  setScreenApp(value: string): void;
  setScreenInputText(value: string): void;
  setScreenSendClear(value: boolean): void;
  setScreenSendInspectAfter(value: boolean): void;
  setScreenSendLaunchIfNeeded(value: boolean): void;
  setScreenSendPressReturn(value: boolean): void;
  setScreenSendRequireFrontmost(value: boolean): void;
}

export function ScreenHostCard({
  hostActionBusy,
  providerHealth,
  runHostAction,
  screenApp,
  screenInputText,
  screenSendClear,
  screenSendInspectAfter,
  screenSendLaunchIfNeeded,
  screenSendPressReturn,
  screenSendRequireFrontmost,
  selectedChatId,
  setScreenApp,
  setScreenInputText,
  setScreenSendClear,
  setScreenSendInspectAfter,
  setScreenSendLaunchIfNeeded,
  setScreenSendPressReturn,
  setScreenSendRequireFrontmost,
}: ScreenHostCardProps) {
  const availableActions = healthyConfiguredProviderActions(
    providerHealth,
    'screen',
  );
  const canInspectApp = availableActions.includes('inspect_app');
  const canFrontmost = availableActions.includes('frontmost_app');
  const canOpenApp = availableActions.includes('open_app');
  const canActivateApp = availableActions.includes('activate_app');
  const canSendText = availableActions.includes('send_text');
  const canSee = availableActions.includes('see');
  const canCapture = availableActions.includes('capture');
  const canOcr = availableActions.includes('ocr');
  const trimmedApp = screenApp.trim();
  const trimmedInput = screenInputText.trim();

  return (
    <article className="host-action-card">
      <label className="field-label" htmlFor="screen-app">
        Desktop app (optional)
      </label>
      <input
        className="field-input"
        id="screen-app"
        onChange={(event) => setScreenApp(event.target.value)}
        placeholder="Terminal"
        type="text"
        value={screenApp}
      />
      <label className="field-label" htmlFor="screen-input-text">
        Text to send
      </label>
      <textarea
        className="field-input code-input"
        id="screen-input-text"
        onChange={(event) => setScreenInputText(event.target.value)}
        placeholder="hello from WillClaw"
        rows={4}
        value={screenInputText}
      />
      <div className="field-option-grid">
        <label className="field-option" htmlFor="screen-send-launch">
          <input
            checked={screenSendLaunchIfNeeded}
            disabled={screenSendRequireFrontmost}
            id="screen-send-launch"
            onChange={(event) => setScreenSendLaunchIfNeeded(event.target.checked)}
            type="checkbox"
          />
          <span>Launch app if needed</span>
        </label>
        <label className="field-option" htmlFor="screen-send-clear">
          <input
            checked={screenSendClear}
            id="screen-send-clear"
            onChange={(event) => setScreenSendClear(event.target.checked)}
            type="checkbox"
          />
          <span>Clear before typing</span>
        </label>
        <label className="field-option" htmlFor="screen-send-return">
          <input
            checked={screenSendPressReturn}
            id="screen-send-return"
            onChange={(event) => setScreenSendPressReturn(event.target.checked)}
            type="checkbox"
          />
          <span>Press Return after typing</span>
        </label>
        <label className="field-option" htmlFor="screen-send-inspect">
          <input
            checked={screenSendInspectAfter}
            id="screen-send-inspect"
            onChange={(event) => setScreenSendInspectAfter(event.target.checked)}
            type="checkbox"
          />
          <span>Inspect after send</span>
        </label>
        <label className="field-option" htmlFor="screen-send-frontmost">
          <input
            checked={screenSendRequireFrontmost}
            id="screen-send-frontmost"
            onChange={(event) =>
              setScreenSendRequireFrontmost(event.target.checked)
            }
            type="checkbox"
          />
          <span>Only send if already frontmost</span>
        </label>
      </div>
      <div className="toolbar">
        <button
          className="ghost-btn"
          disabled={hostActionBusy || !trimmedApp || !canInspectApp}
          onClick={() =>
            runHostAction('/api/tools/screen/inspect-app', {
              app: trimmedApp,
              chatId: selectedChatId,
              languages: ['en-US', 'zh-Hans'],
            })
          }
          title={
            !trimmedApp
              ? 'Enter an app name first.'
              : !canInspectApp
                ? 'No configured healthy screen provider can inspect apps right now.'
                : undefined
          }
          type="button"
        >
          Inspect App
        </button>
        <button
          className="ghost-btn"
          disabled={hostActionBusy || !canFrontmost}
          onClick={() =>
            runHostAction('/api/tools/screen/frontmost-app', {
              chatId: selectedChatId,
            })
          }
          title={
            !canFrontmost
              ? 'No configured healthy provider can inspect the frontmost app right now.'
              : undefined
          }
          type="button"
        >
          Frontmost App
        </button>
        <button
          className="ghost-btn"
          disabled={hostActionBusy || !trimmedApp || !canOpenApp}
          onClick={() =>
            runHostAction('/api/tools/screen/open-app', {
              app: trimmedApp,
              chatId: selectedChatId,
            })
          }
          title={
            !trimmedApp
              ? 'Enter an app name first.'
              : !canOpenApp
                ? 'No configured healthy provider can open apps right now.'
                : undefined
          }
          type="button"
        >
          Open App
        </button>
        <button
          className="ghost-btn"
          disabled={hostActionBusy || !trimmedApp || !canActivateApp}
          onClick={() =>
            runHostAction('/api/tools/screen/activate-app', {
              app: trimmedApp,
              chatId: selectedChatId,
            })
          }
          title={
            !trimmedApp
              ? 'Enter an app name first.'
              : !canActivateApp
                ? 'No configured healthy provider can activate apps right now.'
                : undefined
          }
          type="button"
        >
          Activate App
        </button>
        <button
          className="ghost-btn"
          disabled={hostActionBusy || !trimmedApp || !trimmedInput || !canSendText}
          onClick={() =>
            runHostAction('/api/tools/screen/send-text', {
              app: trimmedApp,
              chatId: selectedChatId,
              clear: screenSendClear,
              inspectAfter: screenSendInspectAfter,
              languages: ['en-US', 'zh-Hans'],
              launchIfNeeded: screenSendRequireFrontmost
                ? false
                : screenSendLaunchIfNeeded,
              pressReturn: screenSendPressReturn,
              requireFrontmost: screenSendRequireFrontmost,
              text: screenInputText,
            })
          }
          title={
            !trimmedApp
              ? 'Enter an app name first.'
              : !trimmedInput
                ? 'Enter text to send first.'
                : !canSendText
                  ? 'No configured healthy provider can send desktop text right now.'
                  : undefined
          }
          type="button"
        >
          Send Text
        </button>
        <button
          className="ghost-btn"
          disabled={hostActionBusy || !canSee}
          onClick={() =>
            runHostAction('/api/tools/screen/see', {
              ...(trimmedApp
                ? { app: trimmedApp }
                : { mode: 'frontmost' }),
              annotate: true,
              chatId: selectedChatId,
              path: `/tmp/willclaw-see-${Date.now().toString(36)}.png`,
            })
          }
          title={
            !canSee
              ? 'No configured healthy provider can inspect desktop UI right now.'
              : undefined
          }
          type="button"
        >
          Inspect UI
        </button>
        <button
          className="ghost-btn"
          disabled={hostActionBusy || !canCapture}
          onClick={() =>
            runHostAction('/api/tools/screen/capture', {
              ...(trimmedApp
                ? { app: trimmedApp }
                : { mode: 'screen' }),
              chatId: selectedChatId,
              filePath: `/tmp/willclaw-screen-${Date.now().toString(36)}.png`,
            })
          }
          title={
            !canCapture
              ? 'No configured healthy provider can capture the screen right now.'
              : undefined
          }
          type="button"
        >
          Capture
        </button>
        <button
          className="ghost-btn"
          disabled={hostActionBusy || !canOcr}
          onClick={() =>
            runHostAction('/api/tools/screen/ocr', {
              ...(trimmedApp
                ? { app: trimmedApp }
                : { mode: 'screen' }),
              chatId: selectedChatId,
            })
          }
          title={
            !canOcr
              ? 'No configured healthy provider can OCR the screen right now.'
              : undefined
          }
          type="button"
        >
          OCR
        </button>
      </div>
      <p className="muted">
        Healthy configured screen actions:{' '}
        {availableActions.length > 0 ? availableActions.join(', ') : 'none'}.
      </p>
      <p className="muted">
        Uses macOS app control plus Peekaboo-first desktop actions. OCR uses
        Apple Vision after capture.
      </p>
      <div className="hint-text">
        Send Text normally brings the target app to the front, so your mouse
        and keyboard focus may jump briefly while it runs. Enable "Only send if
        already frontmost" to fail fast instead of switching apps.
      </div>
    </article>
  );
}
