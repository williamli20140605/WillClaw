import type {
  ActivityInspectorModel,
  RuntimeInspectorModel,
  SearchInspectorModel,
} from '../inspector-types.js';
import type { InspectorTab } from '../ui-types.js';
import { ActivityInspectorTab } from './inspector/ActivityInspectorTab.js';
import { OverviewInspectorTab } from './inspector/OverviewInspectorTab.js';
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
        <div className="inspector-header__copy">
          <div className="section-kicker">Runtime</div>
          <h2>Control panels</h2>
          <p>
            Search, activity, auth, provider health, and host tools stay within reach.
          </p>
        </div>
        <div className="inspector-tabs">
          {(['overview', 'search', 'activity', 'runtime'] as InspectorTab[]).map((tab) => (
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
      </div>

      <div className="inspector-body">
        {inspectorTab === 'overview' ? (
          <OverviewInspectorTab
            activity={activity}
            runtime={runtime}
            search={search}
          />
        ) : null}
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
