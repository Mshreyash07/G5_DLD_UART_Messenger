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
import { bytesBinary, bytesHex, runSimulation, type ErrorMode, type Simulation } from '@/lib/simulator';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();
const dataCodewordPositions = [2, 4, 5, 6, 8, 9, 10, 11];
const moduleWalkthroughs: Record<string, string[]> = {
  secure_uart_top: [
    'This is the system coordinator. Its transmit state machine accepts a message, builds the packet header, and tracks how many payload bytes remain.',
    'Payload bytes pass through the ChaCha20 encryptor and Hamming encoder/packetizer before entering the transmit FIFO and UART transmitter.',
    'On receive, UART bytes are assembled into a packet, the Hamming codeword is rebuilt and decoded, and valid ciphertext is passed to the decryptor.',
    'Ready/valid signals coordinate transfers between blocks; status outputs report completion, packet errors, and corrected single-bit errors.',
  ],
  chacha20_encrypt: [
    'The wrapper starts the keystream core with the supplied key, nonce, and initial counter.',
    'When input data and a keystream byte are both ready, it XORs the two bytes. XOR with the same stream reverses the operation during decryption.',
    'The ready/valid handshake holds output steady until the next block accepts it, and the last-byte marker follows the payload.',
    'The core reports busy and counter exhaustion so a caller can avoid starting or consuming an invalid stream.',
  ],
  chacha20_keystream: [
    'The module stores the key, nonce, and block counter, then forms the 16-word ChaCha20 initial state.',
    'Quarter-round operations mix four 32-bit words using addition, XOR, and rotation. Ten column/diagonal double rounds produce the 20-round block.',
    'The transformed state is added to the initial state and exposed as a 64-byte keystream block.',
    'A byte index advances only when the consumer takes a byte; the block counter advances when another block is needed.',
  ],
  hamming_encoder: [
    'The input byte is placed into the eight data positions of a 13-bit codeword; positions 1, 2, 4, and 8 (one-based) are reserved for Hamming parity.',
    'Each parity bit is the XOR of the codeword positions covered by that parity check.',
    'The final bit is overall parity across the first twelve bits. Together, the syndrome and overall parity support single-error correction and double-error detection.',
    'The output is combinational: it represents the encoded input byte without a clocked transfer state.',
  ],
  hamming_packetizer: [
    'When start is accepted, the 13-bit codeword is saved so it remains stable while the receiver is busy.',
    'A small state machine sends the lower eight bits first, then the remaining five bits in a second byte.',
    'Each byte stays valid until byte_ready acknowledges it; done pulses after the pair is accepted.',
    'This framing makes a 13-bit protection word transportable over an 8-bit UART.',
  ],
  fifo: [
    'The parameterized memory stores DATA_WIDTH-bit entries up to DEPTH and uses separate circular read and write pointers.',
    'The occupancy counter determines the full and empty flags, preventing reads from an empty queue and writes to a full queue.',
    'A valid read/write pair updates both pointers in one clock and leaves the count unchanged; single operations increment or decrement it.',
    'Reset clears the pointers, count, and output register so the queue starts empty.',
  ],
  baud_gen: [
    'The parameters determine how many system-clock cycles make up one UART bit period.',
    'A counter increments on each rising clock edge and resets when it reaches the period limit.',
    'At that boundary, baud_tick pulses for one clock cycle to time UART transmit and receive operations.',
    'Reset clears the counter and tick, giving the serial logic a known timing phase.',
  ],
  uart_tx: [
    'The transmitter latches a byte when a start request is accepted and waits for baud ticks to control bit timing.',
    'It drives a low start bit, then shifts out eight data bits least-significant bit first.',
    'A high stop bit follows the data; the state machine then returns the line to idle and reports completion.',
    'The busy and done signals let upstream logic know when it can submit the next byte.',
  ],
  uart_rx: [
    'Two synchronizer registers reduce the chance that an asynchronous serial input creates metastability in the system-clock logic.',
    'The receiver waits for a low start edge, checks near the middle of the start bit, and then samples each data bit at baud intervals.',
    'Eight sampled bits are assembled least-significant bit first; the stop-bit interval ends the frame and produces rx_done.',
    'The state and counters track idle, start, data, and stop phases while rx_busy marks an active frame.',
  ],
  hamming_depacketizer: [
    'The first incoming byte is saved while the module waits for the second byte of the protected word.',
    'When the next valid byte arrives, the two pieces are joined back into a 13-bit codeword.',
    'The upper unused bits of the second byte are checked; nonzero padding raises format_error.',
    'codeword_valid indicates that the assembled word is ready for the Hamming decoder.',
  ],
  hamming_decoder: [
    'Four parity checks are recomputed from the received codeword. Their results form a syndrome that points to a wrong Hamming position.',
    'Overall parity distinguishes an odd number of flipped bits from an even number: a nonzero syndrome with odd overall parity identifies a single bit to invert.',
    'An even-parity mismatch with a nonzero syndrome is reported as a double-bit error. The decoder flags it but does not correct the received bits.',
    'In the uploaded RTL, data_out is only assigned from the codeword when no double-bit error is flagged; otherwise it stays at 0. The teaching simulator instead passes the uncorrected data through decryption to visibly demonstrate how corruption would look.',
  ],
  chacha20_decrypt: [
    'Decryption uses the same ChaCha20 keystream inputs as encryption: key, nonce, and counter.',
    'Each received ciphertext byte is XORed with its matching keystream byte to recover the plaintext byte.',
    'Ready/valid flow control prevents consuming data when the keystream or output path is not ready.',
    'The last-byte marker and busy/counter status are propagated to the surrounding receive pipeline.',
  ],
};

function Home() {
  const [message, setMessage] = useState('Meet me at the lab at 09:30.');
  const [errorMode, setErrorMode] = useState<ErrorMode>('none');
  const [errorByteIndex, setErrorByteIndex] = useState(0);
  const [bitIndex, setBitIndex] = useState(5);
  const [secondBitIndex, setSecondBitIndex] = useState(6);
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey() } });
  const modulesQuery = useListHdlModules({ query: { queryKey: getListHdlModulesQueryKey() } });
  const modules = useMemo(() => modulesQuery.data ?? [], [modulesQuery.data]);
  const selectedModule = modules.find((module) => module.id === selectedId);
  const messageByteCount = new TextEncoder().encode(message).length;
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
    setSimulation(runSimulation(message, errorMode, errorByteIndex, bitIndex, secondBitIndex));
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
  const hasUncorrectable = simulation?.steps.some((step) => step.doubleErrorDetected) ?? false;

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
            <h1 className="hero-title">CS203 Project Group 5<br /><span style={{ color: '#277261' }}>UART Messenger Simulator</span></h1>
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
              <div className="error-controls" data-testid="control-bitflip">
                <label className="error-control" htmlFor="error-mode">Channel noise
                  <select id="error-mode" className="select-input" value={errorMode} onChange={(event) => setErrorMode(event.target.value as ErrorMode)} data-testid="select-error-mode">
                    <option value="none">No error</option>
                    <option value="single">Single-bit error</option>
                    <option value="double">Two-bit error</option>
                  </select>
                </label>
                <label className="error-control" htmlFor="error-byte">Byte
                  <select id="error-byte" className="select-input" value={Math.min(errorByteIndex, Math.max(0, messageByteCount - 1))} onChange={(event) => setErrorByteIndex(Number(event.target.value))} disabled={errorMode === 'none' || messageByteCount === 0} data-testid="select-error-byte">
                    {Array.from({ length: messageByteCount }, (_, index) => <option value={index} key={index}>byte {index + 1}</option>)}
                  </select>
                </label>
                <label className="error-control" htmlFor="bit-choice">{errorMode === 'double' ? 'Data bit 1' : 'Codeword bit'}
                  <select id="bit-choice" className="select-input" value={errorMode === 'double' ? Math.min(bitIndex, dataCodewordPositions.length - 1) : bitIndex} onChange={(event) => {
                    const next = Number(event.target.value);
                    setBitIndex(next);
                    if (errorMode === 'double' && next === secondBitIndex) setSecondBitIndex((next + 1) % dataCodewordPositions.length);
                  }} disabled={errorMode === 'none'} data-testid="select-bit-index">
                    {(errorMode === 'double' ? dataCodewordPositions : Array.from({ length: 13 }, (_, index) => index)).map((index) => <option value={errorMode === 'double' ? dataCodewordPositions.indexOf(index) : index} key={index}>bit {index}{errorMode === 'double' ? ' · data' : index === 12 ? ' · overall parity' : ''}</option>)}
                  </select>
                </label>
                {errorMode === 'double' && (
                  <label className="error-control" htmlFor="second-bit-choice">Data bit 2
                    <select id="second-bit-choice" className="select-input" value={secondBitIndex} onChange={(event) => {
                      const next = Number(event.target.value);
                      setSecondBitIndex(next === bitIndex ? (next + 1) % dataCodewordPositions.length : next);
                    }} data-testid="select-second-bit-index">
                      {dataCodewordPositions.map((index, dataBit) => <option value={dataBit} key={index}>bit {index} · data</option>)}
                    </select>
                  </label>
                )}
              </div>
              <div className="error-control-note">{errorMode === 'double'
                ? 'Two different data bits flip in the selected protected byte. The demo shows the uncorrected corrupted payload; the uploaded RTL instead holds decoder data_out at 0 when its double-error flag is set.'
                : 'Bit flips apply to the selected protected byte. Choose any byte and any of its 13 Hamming codeword positions.'}</div>
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
              <span className="panel-kicker">{simulation ? (hasUncorrectable ? 'double-bit error detected · not corrected' : hasCorrection ? 'single-bit error corrected' : 'message recovered') : 'awaiting transmission'}</span>
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
                          <div className="result-label"><span>byte {step.index + 1} · 0x{step.cipherByte.toString(16).padStart(2, '0')}</span><span>{step.doubleErrorDetected ? `syndrome ${step.syndrome} · detected, not corrected` : step.correction ? `syndrome ${step.syndrome} · corrected bit ${step.correctedBit}` : 'syndrome 0 · clean'}</span></div>
                        <div className="bit-strip" data-testid={`bits-codeword-${step.index}`}>
                            {step.encoded.map((bit, index) => <span key={index} className={`bit-cell ${simulation.injected?.byteIndex === step.index && simulation.injected.bitIndices.includes(index) ? 'flip' : ''}`} title={`codeword bit ${index}`} data-testid={`bit-sent-${step.index}-${index}`}>{bit}</span>)}
                        </div>
                        {simulation.injected?.byteIndex === step.index && (
                          <>
                              <div className="result-label" style={{ marginTop: 7 }}><span>Received · bit{simulation.injected.bitIndices.length > 1 ? 's' : ''} {simulation.injected.bitIndices.join(' and ')} inverted</span><span>{step.doubleErrorDetected ? 'not corrected' : 'single-error correction'}</span></div>
                            <div className="bit-strip" data-testid={`bits-received-${step.index}`}>
                                {step.received.map((bit, index) => <span key={index} className={`bit-cell ${simulation.injected?.bitIndices.includes(index) ? (step.doubleErrorDetected ? 'uncorrectable' : step.correctedBit === index ? 'corrected' : 'flip') : ''}`} title={`received bit ${index}`} data-testid={`bit-received-${step.index}-${index}`}>{bit}</span>)}
                            </div>
                              <div className={`error-status ${step.doubleErrorDetected ? 'error-status-bad' : ''}`} data-testid={`text-correction-${step.index}`}>
                                {step.doubleErrorDetected ? <>Syndrome {step.syndrome} plus even overall parity indicates a double-bit error. The decoder flags it but leaves the codeword unchanged.</> : step.correction ? <><Check size={12} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />Syndrome {step.syndrome} points to codeword position {step.correction}; corrected before decryption.</> : 'No correction was needed.'}
                            </div>
                              <div className="result-label" style={{ marginTop: 9 }}><span>Codeword delivered by decoder</span><span>{step.doubleErrorDetected ? 'uncorrected data' : 'corrected data'}</span></div>
                              <div className="bit-strip" data-testid={`bits-decoded-${step.index}`}>
                                {step.corrected.map((bit, index) => <span key={index} className={`bit-cell ${step.correctedBit === index ? 'corrected' : step.doubleErrorDetected && simulation.injected?.bitIndices.includes(index) ? 'uncorrectable' : ''}`} title={`decoder output bit ${index}`}>{bit}</span>)}
                              </div>
                          </>
                        )}
                      </div>
                    )) : <div className="value-box">Empty payload — no codewords to transmit.</div>}
                  </div>
                  <div className="result-row">
                    <div className="result-label"><span>Recovered message</span><span>ChaCha20 decrypt</span></div>
                    <div className="value-box" data-testid="text-recovered">{simulation.recovered || '(empty message)'}</div>
                    {hasUncorrectable && <div className="error-status error-status-bad" data-testid="text-uncorrectable-message">At least one two-bit error was detected but not corrected. This teaching model decrypts the altered data to show a corrupted message; the uploaded RTL instead outputs zero data for a codeword it flags as a double error.</div>}
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
                  <div className="result-row">
                    <div className="result-label"><span>ChaCha20 keystream · hex</span><span>simulator trace</span></div>
                    <div className="value-box" data-testid="text-intercepted-keystream">{bytesHex(simulation.keystreamBytes)}</div>
                  </div>
                  <div className="privacy-note" data-testid="text-interceptor-privacy"><ShieldCheck size={13} style={{ display: 'inline', verticalAlign: '-3px', marginRight: 6 }} />The ciphertext is what crosses the modeled wire. The keystream shown here is an educational simulator trace, not information a passive wire listener can derive. The fixed demo key is bundled with the browser model for repeatable results; this is not production secure messaging.</div>
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
                  <section className="module-walkthrough" data-testid="section-module-walkthrough" aria-labelledby="module-walkthrough-heading">
                    <h4 id="module-walkthrough-heading">How this file works</h4>
                    <ol>{(moduleWalkthroughs[detail.id] ?? [detail.description]).map((item, index) => <li key={index}>{item}</li>)}</ol>
                    <p>These notes explain the uploaded RTL at a functional level. The live message simulation above is a browser-side teaching model, not a cycle-accurate execution of this Verilog.</p>
                  </section>
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
