'use client';

import { useState } from 'react';
import ChecklistLedger from '../components/ChecklistLedger.jsx';
import IssueStream from '../components/IssueStream.jsx';

const SAMPLE = 'https://www.kingsresearch.com/report/us-spatial-biology-market-3124';

export default function Page() {
  const [url, setUrl] = useState(SAMPLE);
  const [checkedBy, setCheckedBy] = useState('');
  const [writeToSheet, setWriteToSheet] = useState(true);
  const [useAi, setUseAi] = useState(true);
  const [useBaseline, setUseBaseline] = useState(true);

  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [activeKey, setActiveKey] = useState(null);

  async function run(event) {
    event.preventDefault();
    setRunning(true);
    setError('');
    setResult(null);
    setActiveKey(null);
    try {
      const res = await fetch('/api/check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), checkedBy, writeToSheet, useAi, useBaseline }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `The check failed with status ${res.status}.`);
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(`Could not reach the checker: ${err.message}`);
    } finally {
      setRunning(false);
    }
  }

  const s = result?.summary;

  return (
    <main className="shell">
      <div className="masthead">
        <div>
          <h1>Editorial sanity check</h1>
          <p>
            Paste a live report URL. Every verdict below comes from a rule that can point at the
            exact text on the page.
          </p>
        </div>
        <span className="stamp">Kings Research · proof desk</span>
      </div>

      <form className="runner" onSubmit={run}>
        <div className="field-row">
          <label>
            <span>Report URL</span>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.kingsresearch.com/report/…"
              spellCheck="false"
              required
            />
          </label>
          <label className="narrow">
            <span>Checked by</span>
            <input
              type="text"
              value={checkedBy}
              onChange={(e) => setCheckedBy(e.target.value)}
              placeholder="your name"
            />
          </label>
        </div>

        <div className="toggles">
          <label className="toggle">
            <input type="checkbox" checked={writeToSheet} onChange={(e) => setWriteToSheet(e.target.checked)} />
            Write the run to the master sheet
          </label>
          <label className="toggle">
            <input type="checkbox" checked={useBaseline} onChange={(e) => setUseBaseline(e.target.checked)} />
            Compare against the last 4 published reports
          </label>
          <label className="toggle">
            <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
            Run the spelling and grammar pass
          </label>
        </div>

        <div className="actions">
          <button type="submit" disabled={running}>
            {running ? 'Checking…' : 'Run the check'}
          </button>
          {running && <span className="note">Fetching the page, its stylesheets, every link and image, and four peer reports. Around 20–40 seconds.</span>}
          {error && <span className="note bad">{error}</span>}
        </div>
      </form>

      {result && (
        <>
          <dl className="scoreboard">
            <div className={`score ${s.failed ? 'is-bad' : 'is-good'}`}>
              <dt>Checklist met</dt>
              <dd>
                {s.passed}<small>of {s.total - s.notRun}</small>
              </dd>
            </div>
            <div className={`score ${s.blocking ? 'is-bad' : 'is-good'}`}>
              <dt>Blocking</dt>
              <dd>{s.blocking}</dd>
            </div>
            <div className="score">
              <dt>To review</dt>
              <dd>{s.warnings}</dd>
            </div>
            <div className="score">
              <dt>Template</dt>
              <dd style={{ fontSize: 25 }}>{result.page.template}</dd>
            </div>
            <div className="score">
              <dt>Run time</dt>
              <dd>
                {(result.elapsedMs / 1000).toFixed(1)}<small>s</small>
              </dd>
            </div>
          </dl>

          <div className="pageinfo">
            <span><b>H1</b> {result.page.h1 || '—'}</span>
            <span><b>Type</b> {result.page.pageType}</span>
            <span><b>Scope</b> {result.page.scope}</span>
            <span><b>Base year</b> {result.page.metaBar.baseYear || '—'}</span>
            <span><b>Words</b> {result.page.wordCount}</span>
            <span><b>Links checked</b> {result.probes.links}</span>
            <span><b>Images checked</b> {result.probes.images}</span>
          </div>

          <div className={`strip ${result.sheet.written ? '' : 'bad'}`}>
            {result.sheet.written ? (
              <>
                <span>
                  Written to <b>{result.sheet.runTab}</b> and <b>{result.sheet.issueTab}</b> —{' '}
                  {result.sheet.issueRows} issue row{result.sheet.issueRows === 1 ? '' : 's'}.
                </span>
                <a href={result.sheet.sheetUrl} target="_blank" rel="noopener noreferrer">
                  Open the sheet
                </a>
              </>
            ) : (
              <span>Sheet not updated — {result.sheet.reason}</span>
            )}
            <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 12 }}>
              run {result.runId}
            </span>
          </div>

          {result.ai && (
            <div className="strip">
              {result.ai.available ? (
                <span>
                  Copy-edit pass: {result.ai.verified} finding{result.ai.verified === 1 ? '' : 's'} kept,{' '}
                  {result.ai.discarded} discarded for not matching the page text verbatim
                  {result.ai.model ? ` · ${result.ai.model}` : ''}.
                </span>
              ) : (
                <span>Copy-edit pass did not run — {result.ai.reason}. Spelling, grammar and tone show as “Not run”.</span>
              )}
              {result.baseline && (
                <span style={{ marginLeft: 'auto' }}>
                  Compared against {result.baseline.compared} recent report
                  {result.baseline.compared === 1 ? '' : 's'}
                  {result.baseline.reports?.length
                    ? `: ${result.baseline.reports.map((r) => r.id).join(', ')}`
                    : ''}
                </span>
              )}
            </div>
          )}

          <div className="columns">
            <ChecklistLedger verdicts={result.verdicts} activeKey={activeKey} onSelect={setActiveKey} />
            <IssueStream
              issues={result.issues}
              filterKey={activeKey}
              onClearFilter={() => setActiveKey(null)}
            />
          </div>

          <details className="headers">
            <summary>Raw JSON for this run</summary>
            <pre>{JSON.stringify(result, null, 2)}</pre>
          </details>
        </>
      )}
    </main>
  );
}
