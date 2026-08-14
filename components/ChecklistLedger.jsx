'use client';

const MODE_LABEL = {
  auto: 'rule',
  proxy: 'proxy signal',
  'ai-verify': 'AI, verified against source',
};

export default function ChecklistLedger({ verdicts, activeKey, onSelect }) {
  const rows = Object.values(verdicts || {});
  if (!rows.length) return null;

  const groups = rows.reduce((acc, row) => {
    (acc[row.category] ||= []).push(row);
    return acc;
  }, {});

  const failed = rows.filter((r) => r.value === 'No').length;

  return (
    <section className="panel">
      <header>
        <h2>Checklist</h2>
        <span className="meta">
          {failed} of {rows.length} not met
        </span>
      </header>

      {Object.entries(groups).map(([category, items]) => (
        <div className="ledger-group" key={category}>
          <h3>{category}</h3>
          {items.map((row) => {
            const isActive = activeKey === row.key;
            return (
              <button
                type="button"
                className="ledger-row"
                key={row.key}
                aria-pressed={isActive}
                onClick={() => onSelect(isActive ? null : row.key)}
              >
                <span className="key">{row.key}</span>
                <span className="name">
                  {row.item}
                  {row.value === 'No' && (
                    <em>
                      {row.failCount} finding{row.failCount === 1 ? '' : 's'} · {MODE_LABEL[row.mode]}
                    </em>
                  )}
                  {row.value === 'Yes' && row.warnCount > 0 && (
                    <em>
                      passes, {row.warnCount} query{row.warnCount === 1 ? '' : 'ies'} to review
                    </em>
                  )}
                  {row.value === 'Not run' && <em>needs OPENAI_API_KEY</em>}
                </span>
                <span
                  className={`verdict ${row.value === 'Yes' ? 'yes' : row.value === 'No' ? 'no' : 'idle'}`}
                >
                  {row.value}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </section>
  );
}
