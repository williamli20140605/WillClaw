import { cleanSnippet } from '../../ui-helpers.js';
import type { SearchInspectorModel } from '../../inspector-types.js';
import type { SearchScope } from '../../ui-types.js';

interface SearchInspectorTabProps {
  search: SearchInspectorModel;
}

export function SearchInspectorTab({ search }: SearchInspectorTabProps) {
  const {
    deferredSearchQuery,
    searchLoading,
    searchQuery,
    searchResults,
    searchScope,
    onInjectIntoComposer,
    onSearchQueryChange,
    onSearchScopeChange,
    onSelectChat,
    onSetInspectorTab,
  } = search;

  return (
    <div className="stack-list">
      <section className="inspector-panel">
        <div className="section-header">
          <h3>Memory Search</h3>
          <span>messages + files</span>
        </div>
        <div className="search-card">
          <div className="search-grid">
            <input
              placeholder="Search memory and notes…"
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
            />
            <select
              value={searchScope}
              onChange={(event) =>
                onSearchScopeChange(event.target.value as SearchScope)
              }
            >
              <option value="all">all</option>
              <option value="messages">messages</option>
              <option value="files">files</option>
              <option value="memory">memory</option>
              <option value="daily_note">daily notes</option>
            </select>
          </div>
        </div>
      </section>

      {searchLoading ? <div className="empty">Searching…</div> : null}

      {searchResults?.messages.length ? (
        <section className="inspector-panel">
          <div className="section-header">
            <h3>Message Hits</h3>
            <span>{searchResults.messages.length}</span>
          </div>
          <div className="stack-list">
            {searchResults.messages.map((entry) => (
              <article className="result-card" key={`message-${entry.id}`}>
                <strong>
                  {entry.chatId} · {entry.role}
                </strong>
                <p className="muted">{cleanSnippet(entry.snippet)}</p>
                <div className="result-actions">
                  <button
                    className="quiet-btn"
                    onClick={() => {
                      onSelectChat(entry.chatId);
                      onSetInspectorTab('activity');
                    }}
                    type="button"
                  >
                    Open chat
                  </button>
                  <button
                    className="ghost-btn"
                    onClick={() => onInjectIntoComposer(entry.content)}
                    type="button"
                  >
                    Quote
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {searchResults?.files.length ? (
        <section className="inspector-panel">
          <div className="section-header">
            <h3>File Hits</h3>
            <span>{searchResults.files.length}</span>
          </div>
          <div className="stack-list">
            {searchResults.files.map((entry) => (
              <article className="result-card" key={`file-${entry.id}`}>
                <strong>{entry.filepath}</strong>
                <p className="muted">{cleanSnippet(entry.snippet)}</p>
                <div className="result-actions">
                  <button
                    className="ghost-btn"
                    onClick={() => onInjectIntoComposer(entry.content)}
                    type="button"
                  >
                    Insert excerpt
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {!searchLoading &&
      deferredSearchQuery.length >= 2 &&
      !searchResults?.messages.length &&
      !searchResults?.files.length ? (
        <div className="empty">No results for “{deferredSearchQuery}”.</div>
      ) : null}
    </div>
  );
}
