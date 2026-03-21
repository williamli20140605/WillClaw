import type {
  HostLabModel,
} from '../../inspector-types.js';
import { BrowserHostCard } from './BrowserHostCard.js';
import { HostActionResultCard } from './HostActionResultCard.js';
import { ScreenHostCard } from './ScreenHostCard.js';

export function HostLabSection({
  browserFormFieldsText,
  browserSubmitSelector,
  browserTarget,
  hostActionBusy,
  hostActionResult,
  parseBrowserFormFields,
  runHostAction,
  screenApp,
  screenInputText,
  screenSendClear,
  screenSendInspectAfter,
  screenSendLaunchIfNeeded,
  screenSendPressReturn,
  screenSendRequireFrontmost,
  selectedChatId,
  setActionError,
  setBrowserFormFieldsText,
  setBrowserSubmitSelector,
  setBrowserTarget,
  setScreenApp,
  setScreenInputText,
  setScreenSendClear,
  setScreenSendInspectAfter,
  setScreenSendLaunchIfNeeded,
  setScreenSendPressReturn,
  setScreenSendRequireFrontmost,
}: HostLabModel) {
  return (
    <section className="inspector-panel">
      <div className="section-header">
        <h3>Host Lab</h3>
        <span>agent-browser / peekaboo / macOS</span>
      </div>
      <div className="stack-list">
        <BrowserHostCard
          browserFormFieldsText={browserFormFieldsText}
          browserSubmitSelector={browserSubmitSelector}
          browserTarget={browserTarget}
          hostActionBusy={hostActionBusy}
          parseBrowserFormFields={parseBrowserFormFields}
          runHostAction={runHostAction}
          selectedChatId={selectedChatId}
          setActionError={setActionError}
          setBrowserFormFieldsText={setBrowserFormFieldsText}
          setBrowserSubmitSelector={setBrowserSubmitSelector}
          setBrowserTarget={setBrowserTarget}
        />
        <ScreenHostCard
          hostActionBusy={hostActionBusy}
          runHostAction={runHostAction}
          screenApp={screenApp}
          screenInputText={screenInputText}
          screenSendClear={screenSendClear}
          screenSendInspectAfter={screenSendInspectAfter}
          screenSendLaunchIfNeeded={screenSendLaunchIfNeeded}
          screenSendPressReturn={screenSendPressReturn}
          screenSendRequireFrontmost={screenSendRequireFrontmost}
          selectedChatId={selectedChatId}
          setScreenApp={setScreenApp}
          setScreenInputText={setScreenInputText}
          setScreenSendClear={setScreenSendClear}
          setScreenSendInspectAfter={setScreenSendInspectAfter}
          setScreenSendLaunchIfNeeded={setScreenSendLaunchIfNeeded}
          setScreenSendPressReturn={setScreenSendPressReturn}
          setScreenSendRequireFrontmost={setScreenSendRequireFrontmost}
        />
        <HostActionResultCard hostActionResult={hostActionResult} />
      </div>
    </section>
  );
}
