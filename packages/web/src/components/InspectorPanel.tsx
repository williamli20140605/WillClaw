import type {
  ActivityInspectorModel,
  RuntimeInspectorModel,
  SearchInspectorModel,
} from '../inspector-types.js';
import type { InspectorTab } from '../ui-types.js';
import { ActivityInspectorTab } from './inspector/ActivityInspectorTab.js';
import { RuntimeInspectorTab } from './inspector/RuntimeInspectorTab.js';
import { SearchInspectorTab } from './inspector/SearchInspectorTab.js';

interface InspectorPanelProps {
  activity: ActivityInspectorModel;
  inspectorTab: InspectorTab;
  onInspectorTabChange(tab: InspectorTab): void;
  runtime: RuntimeInspectorModel;
  search: SearchInspectorModel;
}

export function InspectorPanel({
  activity,
  inspectorTab,
  onInspectorTabChange,
  runtime,
  search,
}: InspectorPanelProps) {
  return (
    <aside className="panel inspector">
      <div className="inspector-header">
        <div>
          <h2>Inspector</h2>
          <p>
            Debug and shell metadata stay nearby, not in the main reading lane.
          </p>
        </div>
      </div>

      <div className="inspector-tabs">
        {(['search', 'activity', 'runtime'] as InspectorTab[]).map((tab) => (
          <button
            className="inspector-tab"
            data-active={inspectorTab === tab}
            key={tab}
            onClick={() => onInspectorTabChange(tab)}
            type="button"
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="inspector-body">
        {inspectorTab === 'search' ? <SearchInspectorTab search={search} /> : null}
        {inspectorTab === 'activity' ? (
          <ActivityInspectorTab activity={activity} />
        ) : null}
        {inspectorTab === 'runtime' ? (
          <RuntimeInspectorTab runtime={runtime} />
        ) : null}
      </div>
    </aside>
  );
}
