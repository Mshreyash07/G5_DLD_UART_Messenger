import { useMemo, useState, type ReactNode, type FormEvent } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Check,
  Code2,
  LockKeyhole,
  Radio,
  RotateCcw,
  ShieldCheck,
  Wifi,
} from 'lucide-react';
import {
  getGetHdlModuleQueryKey,
  getHealthCheckQueryKey,
  getListHdlModulesQueryKey,
  useGetHdlModule,
  useHealthCheck,
  useListHdlModules,
} from '@workspace/api-client-react';
import { bytesBinary, bytesHex, runSimulation, type Simulation } from '@/lib/simulator';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

function Home() {
  const [message, setMessage] = useState('Meet me at the lab at 09:30.');
  const [injectError, setInjectError] = useState(false);
  const [bitIndex, setBitIndex] = useState(5);
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey() } });
  const modulesQuery = useListHdlModules({ query: { queryKey: getListHdlModulesQueryKey() } });
  const modules = useMemo(() => modulesQuery.data ?? [], [modulesQuery.data]);
  const selectedModule = modules.find((module) => module.id === selectedId);
  const detailQuery = useGetHdlModule(selectedId, {
    query: { enabled: Boolean(selectedId), queryKey: getGetHdlModuleQueryKey(selectedId) },
  });
  const detail = detailQuery.data;
  const stages = [
    { name: 'Plaintext', caption: 'UTF-8 message', stage: 'plaintext', icon: '01' },
    { name: 'ChaCha20', caption: 'XOR keystream', stage: 'encrypt', icon: '02' },
    { name: 'Hamming (12,8)', caption: 'SECDED encoder', stage: 'encode', icon: '03' },
    { name: 'UART channel', caption: '13-bit codewords', stage: 'transmit', icon: '04' },
    { name: 'Recover', caption: 'Correct + decrypt', stage: 'decode', icon: '05' },
  ];

  function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!message.trim()) return;
    setSimulation(runSimulation(message, injectError, bitIndex));
  }

  function selectModule(id: string) {
    setSelectedId(id);
  }

  function selectStage(stage: string) {
    const found = modules.find((module) => {
      const text = `${module.stage} ${module.title} ${module.fileName}`.toLowerCase();
      const lookup: Record<string, string[]> = {
        plaintext: ['plain', 'top', 'transmit'],
        encrypt: ['chacha', 'encrypt', 'crypto'],
        encode: ['hamming', 'encoder', 'ecc'],
        transmit: ['uart', 'serial', 'top', 'transmit'],
        decode: ['decoder', 'decrypt', 'hamming', 'chacha'],
      };
      return lookup[stage].some((term) => text.includes(term));
    });
    if (found) selectModule(found.id);
  }

  const activeHealth = health.data?.status?.toLowerCase() === 'ok' || health.data?.status?.toLowerCase() === 'healthy';
  const hasCorrection = simulation?.steps.some((step) => step.correction !== null) ?? false;

  return (
    <div className="bench-shell">
      <header className="topbar">
        <div className="brand" data-testid="text-brand">
          <span className="brand-mark">ST</span>
          <span>Secure Transmission <span style={{ color: '#8b938d', fontWeight: 500 }}>/ lab</span></span>
        </div>
        <div className="top-meta" data-testid="status-api">
          <span><i className="health-dot" />{health.isLoading ? 'Checking service' : health.isError ? 'Service unavailable' : activeHealth ? 'API online' : `API · ${health.data?.status ?? 'connected'}`}</span>
          {health.isError && <button className="btn-quiet" type="button" onClick={() => health.refetch()} data-testid="button-retry-health"><RotateCcw size={11} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} />Retry</button>}
          <span className="meta-label">Educational model · v1.0</span>
        </div>
      </header>
      <main className="page-wrap">
        <div className="hero-row">
          <div>
            <div className="eyebrow">UART security bench <span style={{ color: '#b0aa9e' }}>— 01 / walkthrough</span></div>
            <h1 className="hero-title">See what travels.<br /><span style={{ color: '#277261' }}>See what survives.</span></h1>
            <p className="hero-copy">Send a message through the uploaded secure UART pipeline. Follow encryption, error-correction coding, a noisy wire, and recovery—one byte at a time.</p>
          </div>
          <div className="bench-tag" data-testid="text-model-label"><Activity size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 8 }} />LOCAL SOFTWARE MODEL · NOT CYCLE-ACCURATE</div>
        </div>

        <form className="panel send-panel" onSubmit={submitMessage} data-testid="form-message">
          <label className="field-label" htmlFor="message">Message to transmit <span style={{ color: '#afb4aa' }}>· UTF-8</span></label>
          <textarea
            id="message"
            className="message-input"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={220}
            placeholder="Type a short message…"
            data-testid="input-message"
          />
          <div className="send-controls">
            <div style={{ display: 'flex', alignItems: 'center', gap: 17, flexWrap: 'wrap' }}>
              <label className="toggle-row" data-testid="control-bitflip">
                <input type="checkbox" checked={injectError} onChange={(event) => setInjectError(event.target.checked)} data-testid="input-bitflip-toggle" />
                Inject one bit flip
              </label>
              <label className="toggle-row" htmlFor="bit-choice">Codeword bit
                <select id="bit-choice" className="select-input" value={bitIndex} onChange={(event) => setBitIndex(Number(event.target.value))} disabled={!injectError} data-testid="select-bit-index">
                  {Array.from({ length: 13 }, (_, index) => <option value={index} key={index}>bit {index}{index === 12 ? ' · overall parity' : ''}</option>)}
                </select>
              </label>
            </div>
            <button className="btn-primary" type="submit" disabled={!message.trim()} data-testid="button-send">
              Transmit message <ArrowRight size={14} />
            </button>
          </div>
        </form>

        <section className="panel pipeline" aria-label="Transmission pipeline" data-testid="section-pipeline">
          <div className="panel-head">
            <h2 className="panel-title">Transmission path</h2>
            <span className="panel-kicker">Click a stage to inspect matching HDL</span>
          </div>
          <div className="pipeline-track">
            {stages.map((stage) => (
              <button className={`stage-card ${selectedModule && (`${selectedModule.stage} ${selectedModule.title} ${selectedModule.fileName}`.toLowerCase().includes(stage.stage === 'encrypt' ? 'chacha' : stage.stage) || (stage.stage === 'encode' && /hamming/i.test(selectedModule.title)) || (stage.stage === 'transmit' && /uart|serial/i.test(selectedModule.title)) || (stage.stage === 'decode' && /decoder|decrypt/i.test(selectedModule.title))) ? 'active' : ''}`} key={stage.stage} onClick={() => selectStage(stage.stage)} type="button" data-testid={`button-stage-${stage.stage}`}>
                <span className="stage-number">{stage.icon}</span>
                <span className="stage-name">{stage.name}</span>
                <span className="stage-caption">{stage.caption}</span>
              </button>
            ))}
          </div>
          <div className="pipeline-note" data-testid="text-pipeline-note">
            A fixed demo key, 96-bit nonce, and counter 1 drive browser-side ChaCha20. The simulator models bytes and codewords; it does not model UART timing, clocks, or FPGA behavior.
          </div>
        </section>

        <div className="results-grid">
          <section className="panel result-card" data-testid="section-receiver">
            <div className="panel-head">
              <h2 className="panel-title">Receiver · decode & recover</h2>
              <span className="panel-kicker">{simulation ? (hasCorrection ? 'single-bit error corrected' : 'message recovered') : 'awaiting transmission'}</span>
            </div>
            <div className="result-content">
              {!simulation ? (
                <div className="empty-result" data-testid="empty-simulation">
                  <span className="empty-mark"><Radio size={16} /></span>
                  <strong>Ready at the receiver</strong>
                  <p>Send a message to reveal the encrypted bytes, 13-bit codewords, and recovered text.</p>
                </div>
              ) : (
                <>
                  <div className="result-row">
                    <div className="result-label"><span>Transmitted codewords · 13 bits / byte</span><span>{simulation.steps.length} bytes</span></div>
                    {simulation.steps.length ? simulation.steps.map((step) => (
                      <div key={step.index} style={{ marginBottom: 10 }}>
                        <div className="result-label"><span>byte {step.index.toString().padStart(2, '0')} · 0x{step.cipherByte.toString(16).padStart(2, '0')}</span><span>{step.correction ? `syndrome ${step.syndrome} · corrected bit ${step.correctedBit}` : 'syndrome 0 · clean'}</span></div>
                        <div className="bit-strip" data-testid={`bits-codeword-${step.index}`}>
                          {step.encoded.map((bit, index) => <span key={index} className={`bit-cell ${simulation.injected?.byteIndex === step.index && simulation.injected.bitIndex === index ? 'flip' : ''}`} title={`codeword bit ${index}`} data-testid={`bit-sent-${step.index}-${index}`}>{bit}</span>)}
                        </div>
                        {simulation.injected?.byteIndex === step.index && (
                          <>
                            <div className="result-label" style={{ marginTop: 7 }}><span>Received after injected flip · bit {simulation.injected.bitIndex} inverted</span><span>corrected codeword below</span></div>
                            <div className="bit-strip" data-testid={`bits-received-${step.index}`}>
                              {step.received.map((bit, index) => <span key={index} className={`bit-cell ${index === simulation.injected?.bitIndex ? (step.correctedBit === index ? 'corrected' : 'flip') : ''}`} title={`received bit ${index}`} data-testid={`bit-received-${step.index}-${index}`}>{bit}</span>)}
                            </div>
                            <div style={{ fontSize: 10, color: '#24725c', marginTop: 6 }} data-testid={`text-correction-${step.index}`}>
                              {step.correction ? <><Check size={12} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />Syndrome {step.syndrome} points to codeword position {step.correction}; corrected before decryption.</> : 'No correction was needed.'}
                            </div>
                          </>
                        )}
                      </div>
                    )) : <div className="value-box">Empty payload — no codewords to transmit.</div>}
                  </div>
                  <div className="result-row">
                    <div className="result-label"><span>Recovered message</span><span>ChaCha20 decrypt</span></div>
                    <div className="value-box" data-testid="text-recovered">{simulation.recovered || '(empty message)'}</div>
                  </div>
                  <div className="result-row">
                    <div className="result-label"><span>Plaintext bytes at sender</span><span>{simulation.plainBytes.length} bytes</span></div>
                    <div className="value-box" data-testid="text-plaintext-bytes">{bytesBinary(simulation.plainBytes)}</div>
                  </div>
                </>
              )}
            </div>
          </section>
          <section className="panel result-card interceptor-card" data-testid="section-interceptor">
            <div className="panel-head">
              <h2 className="panel-title"><Wifi size={14} style={{ display: 'inline', verticalAlign: '-3px', marginRight: 7 }} />Passive interceptor</h2>
              <span className="panel-kicker">wire-visible</span>
            </div>
            <div className="result-content">
              {!simulation ? (
                <div className="empty-result" data-testid="empty-interceptor">
                  <span className="empty-mark"><LockKeyhole size={15} /></span>
                  <strong>Payload not yet observed</strong>
                  <p>After transmission, this view shows only encrypted payload bytes available to a passive listener.</p>
                </div>
              ) : (
                <>
                  <div className="result-row">
                    <div className="result-label"><span>Encrypted payload · hex</span><span>{simulation.cipherBytes.length} bytes</span></div>
                    <div className="value-box" data-testid="text-intercepted-hex">{bytesHex(simulation.cipherBytes)}</div>
                  </div>
                  <div className="result-row">
                    <div className="result-label"><span>Encrypted payload · bits</span><span>ciphertext only</span></div>
                    <div className="value-box" data-testid="text-intercepted-bits">{bytesBinary(simulation.cipherBytes)}</div>
                  </div>
                  <div className="privacy-note" data-testid="text-interceptor-privacy"><ShieldCheck size={13} style={{ display: 'inline', verticalAlign: '-3px', marginRight: 6 }} />This simulated wire view shows ciphertext only. The fixed demo key is bundled with the browser model for repeatable results; this is not a production secure-messaging app.</div>
                </>
              )}
            </div>
          </section>
        </div>

        <div className="security-alert" role="note" data-testid="notice-protocol-header">
          <span className="alert-mark"><AlertTriangle size={12} /></span>
          <span><strong>Protocol boundary:</strong> the uploaded top module also sends framing, nonce, and length header information in the clear. This model protects the payload bytes only; it does not claim the complete protocol is confidential. Hamming coding can correct a single bit error, not provide secrecy or integrity.</span>
        </div>

        <section aria-labelledby="explorer-heading" data-testid="section-source-explorer">
          <div className="section-heading">
            <div><div className="eyebrow">Project internals · API source</div><h2 id="explorer-heading">Inspect the actual modules.</h2></div>
            <p>Module explanations and source are served from the uploaded project. Select any module to open its exact HDL.</p>
          </div>
          <div className="explorer-grid">
            <aside className="panel module-list" data-testid="list-hdl-modules">
              <div className="module-list-head">
                <span className="panel-kicker">Uploaded modules</span>
                <span className="panel-kicker">{modulesQuery.isLoading ? '…' : `${modules.length} files`}</span>
              </div>
              {modulesQuery.isLoading ? (
                <div className="source-loading" data-testid="loading-module-list"><div><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div></div>
              ) : modulesQuery.isError ? (
                <div style={{ padding: 15 }} data-testid="error-module-list"><div className="error-box">Module list could not be loaded. Check the API connection and try again.</div><button className="btn-quiet" style={{ marginTop: 11 }} onClick={() => modulesQuery.refetch()} type="button" data-testid="button-retry-modules"><RotateCcw size={12} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />Retry module list</button></div>
              ) : modules.length === 0 ? (
                <div className="source-empty" data-testid="empty-module-list">No uploaded HDL modules are available.</div>
              ) : modules.map((module) => (
                <button key={module.id} className={`module-row ${selectedId === module.id ? 'selected' : ''}`} type="button" onClick={() => selectModule(module.id)} data-testid={`button-module-${module.id}`}>
                  <span className="module-file">{module.fileName}</span>
                  <span className="module-title">{module.title}</span>
                  <span className="module-stage">{module.stage}</span>
                </button>
              ))}
            </aside>
            <article className="panel source-card" data-testid="panel-module-source">
              <div className="panel-head">
                <div className="source-meta">
                  <Code2 size={15} color="#267460" />
                  <h3 className="panel-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedModule?.title ?? 'Choose a module'}</h3>
                </div>
                {selectedModule && <span className="file-pill" data-testid="text-selected-filename">{selectedModule.fileName}</span>}
              </div>
              {!selectedId ? (
                <div className="source-empty" data-testid="empty-module-source"><div><Code2 size={20} style={{ marginBottom: 9, color: '#8a9b8f' }} /><div>Select a module from the uploaded source list to inspect its explanation and exact code.</div></div></div>
              ) : detailQuery.isLoading ? (
                <div className="source-loading" data-testid="loading-module-detail"><div><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div></div>
              ) : detailQuery.isError ? (
                <div className="source-empty" data-testid="error-module-detail"><div className="error-box">Could not load this module's source. Retry the request.</div><button className="btn-quiet" style={{ marginTop: 12 }} type="button" onClick={() => detailQuery.refetch()} data-testid="button-retry-detail"><RotateCcw size={12} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />Retry source</button></div>
              ) : detail ? (
                <>
                  <div className="source-description" data-testid="text-module-description">{detail.description}</div>
                  <div className="code-wrap" data-testid="code-module-source" aria-label={`Source code for ${detail.fileName}`}>
                    {detail.code.split('\n').map((line, index) => <div className="code-line" key={index}><span className="line-num">{index + 1}</span><span className="code-text">{line || ' '}</span></div>)}
                  </div>
                </>
              ) : <div className="source-empty" data-testid="empty-detail">No module details returned.</div>}
            </article>
          </div>
        </section>
        <footer className="footer-note"><span>Secure transmission demo · browser-side deterministic model</span><span>ChaCha20 · Hamming (12,8) + overall parity · UART</span></footer>
      </main>
    </div>
  );
}

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
