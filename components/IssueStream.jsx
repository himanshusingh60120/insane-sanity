'use client';

import { useState } from 'react';

/**
 * Renders a string with its invisible characters made visible. A double space
 * is the single most common miss and the one a CMS field will never show you,
 * so it gets rendered as middots rather than described in words.
 */
function Revealed({ value }) {
  if (value == null || value === '') return <>—</>;
  const parts = String(value).split(/(\u00a0|\t| {2,})/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part === '\u00a0') return <span className="invisible" key={i}>⍽</span>;
        if (part === '\t') return <span className="invisible" key={i}>→</span>;
        if (/^ {2,}$/.test(part)) {
          return (
            <span className="invisible" key={i}>
              {'·'.repeat(part.length)}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

export default function IssueStream({ issues, filterKey, onClearFilter }) {
  const [severity, setSeverity] = useState('all');

  let list = issues || [];
  if (filterKey) list = list.filter((i) => (i.items || []).includes(filterKey));
  if (severity !== 'all') list = list.filter((i) => i.severity === severity);

  const fails = (issues || []).filter((i) => i.severity === 'fail').length;
  const warns = (issues || []).filter((i) => i.severity === 'warn').length;

  return (
    <section className="panel">
      <header>
        <h2>What to change</h2>
        <span className="meta">
          {list.length} shown · {fails} blocking · {warns} to review
        </span>
      </header>

      <div className="filters">
        {[
          ['all', `Everything (${(issues || []).length})`],
          ['fail', `Blocking (${fails})`],
          ['warn', `Review (${warns})`],
        ].map(([value, label]) => (
          <button
            type="button"
            className="chip"
            key={value}
            aria-pressed={severity === value}
            onClick={() => setSeverity(value)}
          >
            {label}
          </button>
        ))}
        {filterKey && (
          <button type="button" className="chip" aria-pressed onClick={onClearFilter}>
            {filterKey} ✕
          </button>
        )}
      </div>

      {list.length === 0 ? (
        <div className="empty">
          <strong>Nothing to change here.</strong>
          {filterKey
            ? 'This checklist row passed with no findings.'
            : 'Every rule that ran came back clean.'}
        </div>
      ) : (
        list.map((issue, index) => (
          <article className={`issue sev-${issue.severity}`} key={`${issue.ruleId}-${index}`}>
            <div className="issue-head">
              <span className="rule">{issue.ruleId}</span>
              <h4>{issue.title}</h4>
              <span className="where">{issue.where}</span>
            </div>

            <dl className="evidence">
              <div className="evidence-line found">
                <dt>On page</dt>
                <dd>
                  <Revealed value={issue.found} />
                </dd>
              </div>
              {issue.expected ? (
                <div className="evidence-line want">
                  <dt>Should be</dt>
                  <dd>
                    <Revealed value={issue.expected} />
                  </dd>
                </div>
              ) : null}
            </dl>

            {issue.fix ? (
              <p className="fix">
                <span className="marker" aria-hidden="true">✎</span>
                <span>{issue.fix}</span>
              </p>
            ) : null}

            <p className="note" style={{ marginTop: 8 }}>
              {(issue.items || []).join(', ')} · {issue.verifiedBy}
            </p>
          </article>
        ))
      )}
    </section>
  );
}
