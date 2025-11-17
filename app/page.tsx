'use client';

import { useMemo, useState } from 'react';

type AgentRunRequest = {
  imap: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
    mailbox?: string;
  };
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
  };
  agentProfile: {
    displayName: string;
    jobTitle?: string;
    company?: string;
    signature?: string;
    replyTone?: 'formal' | 'neutral';
  };
  settings: {
    autoReplyImportant: boolean;
    autoUnsubscribeMarketing: boolean;
    includeSummaries: boolean;
    replyDelayMinutes: number;
    importanceThreshold: number;
  };
};

type AgentRunResponse = {
  syncedAt: string;
  summary: {
    fetched: number;
    importantReplies: number;
    marketingUnsubscribes: number;
    skipped: number;
  };
  importantReplies: Array<{
    messageId: string;
    subject: string;
    to: string;
    status: 'queued' | 'sent' | 'failed';
    preview: string;
    replyPreview: string;
  }>;
  marketingUnsubscribes: Array<{
    messageId: string;
    subject: string;
    channel: 'http' | 'email';
    endpoint: string;
    status: 'requested' | 'skipped' | 'failed';
    detail?: string;
  }>;
  skipped: Array<{
    messageId: string;
    subject: string;
    reason: string;
  }>;
  errors: string[];
};

const DEFAULT_AGENT: AgentRunRequest['agentProfile'] = {
  displayName: 'Alex Morgan',
  jobTitle: 'Operations Manager',
  company: 'Acme Corp',
  signature: 'Alex Morgan\nOperations Manager\nAcme Corp\n+1 (555) 010-0000',
  replyTone: 'formal'
};

function FieldGroup({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section style={{
      background: '#ffffff',
      borderRadius: '18px',
      padding: '24px',
      boxShadow: '0 20px 40px -24px rgba(15, 23, 42, 0.35)',
      border: '1px solid rgba(148, 163, 184, 0.2)'
    }}>
      <header style={{ marginBottom: '18px' }}>
        <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a', fontWeight: 600 }}>{title}</h2>
        {description ? (
          <p style={{ margin: '6px 0 0', color: '#475569', lineHeight: 1.4 }}>{description}</p>
        ) : null}
      </header>
      <div style={{ display: 'grid', gap: '16px' }}>{children}</div>
    </section>
  );
}

function InputField({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  required = false
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label style={{ display: 'grid', gap: '6px', fontSize: '0.95rem', fontWeight: 500, color: '#1f2937' }}>
      <span>{label}</span>
      <input
        required={required}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        style={{
          padding: '12px 14px',
          borderRadius: '10px',
          border: '1px solid rgba(148, 163, 184, 0.55)',
          background: '#f8fafc',
          outline: 'none'
        }}
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label style={{ display: 'grid', gap: '6px', fontSize: '0.95rem', fontWeight: 500, color: '#1f2937' }}>
      <span>{label}</span>
      <input
        type="number"
        value={Number.isNaN(value) ? '' : value}
        min={min}
        max={max}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{
          padding: '12px 14px',
          borderRadius: '10px',
          border: '1px solid rgba(148, 163, 184, 0.55)',
          background: '#f8fafc',
          outline: 'none'
        }}
      />
    </label>
  );
}

function SwitchField({
  label,
  value,
  onChange,
  description
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  description?: string;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '18px' }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#111827' }}>{label}</div>
        {description ? <div style={{ color: '#64748b', fontSize: '0.85rem', marginTop: 4 }}>{description}</div> : null}
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        style={{
          width: '52px',
          borderRadius: '999px',
          border: '1px solid rgba(148, 163, 184, 0.45)',
          padding: '6px',
          background: value ? '#2563eb' : '#cbd5f5',
          display: 'flex',
          justifyContent: value ? 'flex-end' : 'flex-start'
        }}
      >
        <span
          style={{
            width: '18px',
            height: '18px',
            borderRadius: '50%',
            background: '#ffffff'
          }}
        />
      </button>
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  rows = 5
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  return (
    <label style={{ display: 'grid', gap: '6px', fontSize: '0.95rem', fontWeight: 500, color: '#1f2937' }}>
      <span>{label}</span>
      <textarea
        value={value}
        rows={rows}
        onChange={(event) => onChange(event.target.value)}
        style={{
          padding: '12px 14px',
          borderRadius: '10px',
          border: '1px solid rgba(148, 163, 184, 0.55)',
          background: '#f8fafc',
          resize: 'vertical',
          outline: 'none'
        }}
      />
    </label>
  );
}

export default function HomePage() {
  const [imapHost, setImapHost] = useState('imap.gmail.com');
  const [imapPort, setImapPort] = useState(993);
  const [imapSecure, setImapSecure] = useState(true);
  const [imapUser, setImapUser] = useState('');
  const [imapPassword, setImapPassword] = useState('');
  const [imapMailbox, setImapMailbox] = useState('INBOX');

  const [smtpHost, setSmtpHost] = useState('smtp.gmail.com');
  const [smtpPort, setSmtpPort] = useState(465);
  const [smtpSecure, setSmtpSecure] = useState(true);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');

  const [displayName, setDisplayName] = useState(DEFAULT_AGENT.displayName);
  const [jobTitle, setJobTitle] = useState(DEFAULT_AGENT.jobTitle ?? '');
  const [company, setCompany] = useState(DEFAULT_AGENT.company ?? '');
  const [signature, setSignature] = useState(DEFAULT_AGENT.signature ?? '');
  const [replyTone, setReplyTone] = useState<'formal' | 'neutral'>(DEFAULT_AGENT.replyTone ?? 'formal');

  const [autoReplyImportant, setAutoReplyImportant] = useState(true);
  const [autoUnsubscribeMarketing, setAutoUnsubscribeMarketing] = useState(true);
  const [includeSummaries, setIncludeSummaries] = useState(true);
  const [replyDelayMinutes, setReplyDelayMinutes] = useState(3);
  const [importanceThreshold, setImportanceThreshold] = useState(65);

  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<AgentRunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requestPayload: AgentRunRequest = useMemo(
    () => ({
      imap: {
        host: imapHost,
        port: imapPort,
        secure: imapSecure,
        user: imapUser,
        password: imapPassword,
        mailbox: imapMailbox
      },
      smtp: {
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        user: smtpUser || imapUser,
        password: smtpPassword || imapPassword
      },
      agentProfile: {
        displayName,
        jobTitle: jobTitle || undefined,
        company: company || undefined,
        signature: signature || undefined,
        replyTone
      },
      settings: {
        autoReplyImportant,
        autoUnsubscribeMarketing,
        includeSummaries,
        replyDelayMinutes,
        importanceThreshold
      }
    }),
    [
      autoReplyImportant,
      autoUnsubscribeMarketing,
      company,
      displayName,
      imapHost,
      imapMailbox,
      imapPassword,
      imapPort,
      imapSecure,
      imapUser,
      includeSummaries,
      importanceThreshold,
      jobTitle,
      replyDelayMinutes,
      replyTone,
      signature,
      smtpHost,
      smtpPassword,
      smtpPort,
      smtpSecure,
      smtpUser
    ]
  );

  async function runAgent() {
    setIsRunning(true);
    setResult(null);
    setError(null);

    try {
      const response = await fetch('/api/agent/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestPayload)
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.message ?? 'Agent run failed');
      }

      const payload = (await response.json()) as AgentRunResponse;
      setResult(payload);
    } catch (agentError: unknown) {
      const message = agentError instanceof Error ? agentError.message : 'Unexpected error';
      setError(message);
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <main style={{ padding: '48px 20px 72px', maxWidth: '1180px', margin: '0 auto' }}>
      <header style={{ marginBottom: '32px' }}>
        <div style={{ color: '#2563eb', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', fontSize: '0.72rem' }}>
          Autonomous Email Agent
        </div>
        <h1 style={{ margin: '14px 0 8px', fontSize: '2.2rem', color: '#0f172a' }}>
          Automate your formal replies & vanquish marketing noise.
        </h1>
        <p style={{ margin: 0, color: '#475569', maxWidth: '640px', lineHeight: 1.5 }}>
          Connect your inbox once, the agent takes it from there: triages inbound threads, sends crafted formal replies to priority messages, and automatically
          unsubscribes from recurring marketing blasts using List-Unsubscribe intelligence.
        </p>
      </header>

      <div style={{ display: 'grid', gap: '24px', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <FieldGroup
          title="Inbox (IMAP)"
          description="Provide read access so the agent can triage new messages. App-specific passwords are recommended."
        >
          <InputField label="Host" value={imapHost} onChange={setImapHost} required />
          <InputField label="Port" value={String(imapPort)} onChange={(value) => setImapPort(Number(value) || 0)} required />
          <SwitchField label="Use secure connection" value={imapSecure} onChange={setImapSecure} />
          <InputField label="User" value={imapUser} onChange={setImapUser} required />
          <InputField label="Password" type="password" value={imapPassword} onChange={setImapPassword} required />
          <InputField label="Mailbox" value={imapMailbox} onChange={setImapMailbox} placeholder="INBOX" required />
        </FieldGroup>

        <FieldGroup
          title="Outgoing (SMTP)"
          description="Used for formal reply dispatches and List-Unsubscribe mailto workflows."
        >
          <InputField label="Host" value={smtpHost} onChange={setSmtpHost} required />
          <InputField label="Port" value={String(smtpPort)} onChange={(value) => setSmtpPort(Number(value) || 0)} required />
          <SwitchField label="Use secure connection" value={smtpSecure} onChange={setSmtpSecure} />
          <InputField
            label="User"
            value={smtpUser}
            onChange={setSmtpUser}
            placeholder="Defaults to IMAP user"
          />
          <InputField
            label="Password"
            type="password"
            value={smtpPassword}
            onChange={setSmtpPassword}
            placeholder="Defaults to IMAP password"
          />
        </FieldGroup>

        <FieldGroup
          title="Agent identity"
          description="Customize how the agent signs and frames its responses."
        >
          <InputField label="Display name" value={displayName} onChange={setDisplayName} required />
          <InputField label="Job title" value={jobTitle} onChange={setJobTitle} />
          <InputField label="Company" value={company} onChange={setCompany} />
          <TextAreaField label="Signature" value={signature} onChange={setSignature} rows={4} />
          <label style={{ display: 'grid', gap: '6px', fontSize: '0.95rem', fontWeight: 500, color: '#1f2937' }}>
            <span>Reply tone</span>
            <select
              value={replyTone}
              onChange={(event) => setReplyTone(event.target.value as 'formal' | 'neutral')}
              style={{
                padding: '12px 14px',
                borderRadius: '10px',
                border: '1px solid rgba(148, 163, 184, 0.55)',
                background: '#f8fafc'
              }}
            >
              <option value="formal">Formal</option>
              <option value="neutral">Neutral professional</option>
            </select>
          </label>
        </FieldGroup>

        <FieldGroup
          title="Automation rules"
          description="Define what the agent should take care of on every heartbeat."
        >
          <SwitchField
            label="Auto reply to important threads"
            description="Crafts a formal acknowledgment with next steps for impactful messages."
            value={autoReplyImportant}
            onChange={setAutoReplyImportant}
          />
          <SwitchField
            label="Unsubscribe from marketing"
            description="Automatically follows List-Unsubscribe instructions when safe to do so."
            value={autoUnsubscribeMarketing}
            onChange={setAutoUnsubscribeMarketing}
          />
          <SwitchField
            label="Include AI summaries"
            description="Adds concise bullet summaries of the inbound email to the agent log."
            value={includeSummaries}
            onChange={setIncludeSummaries}
          />
          <NumberField
            label="Reply delay (minutes)"
            value={replyDelayMinutes}
            min={0}
            max={60}
            onChange={setReplyDelayMinutes}
          />
          <NumberField
            label="Importance threshold"
            value={importanceThreshold}
            min={1}
            max={100}
            onChange={setImportanceThreshold}
          />
        </FieldGroup>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginTop: '40px' }}>
        <button
          onClick={runAgent}
          disabled={isRunning}
          style={{
            background: isRunning ? '#94a3b8' : '#2563eb',
            color: '#ffffff',
            border: 'none',
            borderRadius: '999px',
            padding: '14px 28px',
            fontWeight: 600,
            fontSize: '1rem',
            cursor: isRunning ? 'not-allowed' : 'pointer',
            boxShadow: isRunning ? 'none' : '0 18px 30px -18px rgba(37, 99, 235, 0.65)'
          }}
        >
          {isRunning ? 'Running agent…' : 'Run agent now'}
        </button>
        <div style={{ color: '#64748b', fontSize: '0.9rem', lineHeight: 1.4 }}>
          Credentials never persist on the server. Sessions run transiently inside the API route and are wiped after completion.
        </div>
      </div>

      {error ? (
        <div
          style={{
            marginTop: '32px',
            background: '#fee2e2',
            border: '1px solid #fca5a5',
            padding: '18px 22px',
            borderRadius: '12px',
            color: '#991b1b'
          }}
        >
          {error}
        </div>
      ) : null}

      {result ? (
        <section
          style={{
            marginTop: '40px',
            background: '#ffffff',
            borderRadius: '18px',
            padding: '30px',
            boxShadow: '0 22px 38px -28px rgba(15, 23, 42, 0.35)',
            border: '1px solid rgba(148, 163, 184, 0.2)'
          }}
        >
          <header style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#0f172a', fontWeight: 600 }}>Latest agent run</h2>
              <p style={{ margin: '6px 0 0', color: '#475569' }}>Completed at {new Date(result.syncedAt).toLocaleString()}</p>
            </div>
            <div style={{
              background: '#eef2ff',
              color: '#312e81',
              borderRadius: '999px',
              padding: '10px 18px',
              fontWeight: 600
            }}>
              {result.summary.importantReplies} replies · {result.summary.marketingUnsubscribes} unsubscribes
            </div>
          </header>

          {result.importantReplies.length > 0 ? (
            <div style={{ marginBottom: '28px' }}>
              <h3 style={{ margin: '0 0 12px', color: '#0f172a', fontSize: '1.05rem' }}>Formal replies</h3>
              <div style={{ display: 'grid', gap: '16px' }}>
                {result.importantReplies.map((item) => (
                  <article
                    key={item.messageId}
                    style={{
                      border: '1px solid rgba(148, 163, 184, 0.35)',
                      borderRadius: '14px',
                      padding: '18px 20px',
                      background: '#f8fafc'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div style={{ fontWeight: 600 }}>{item.subject}</div>
                      <div style={{
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        color: item.status === 'failed' ? '#b91c1c' : '#0f172a'
                      }}>
                        {item.status.toUpperCase()}
                      </div>
                    </div>
                    <div style={{ color: '#475569', fontSize: '0.9rem', marginBottom: '10px' }}>{item.preview}</div>
                    <pre
                      style={{
                        background: '#0f172a',
                        color: '#e2e8f0',
                        padding: '14px',
                        borderRadius: '12px',
                        fontSize: '0.85rem',
                        overflowX: 'auto'
                      }}
                    >
                      {item.replyPreview}
                    </pre>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          {result.marketingUnsubscribes.length > 0 ? (
            <div style={{ marginBottom: '28px' }}>
              <h3 style={{ margin: '0 0 12px', color: '#0f172a', fontSize: '1.05rem' }}>Marketing unsubscribes</h3>
              <div style={{ display: 'grid', gap: '16px' }}>
                {result.marketingUnsubscribes.map((item) => (
                  <article
                    key={item.messageId}
                    style={{
                      border: '1px solid rgba(148, 163, 184, 0.35)',
                      borderRadius: '14px',
                      padding: '18px 20px',
                      background: '#f8fafc'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div style={{ fontWeight: 600 }}>{item.subject}</div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0f172a' }}>{item.status.toUpperCase()}</div>
                    </div>
                    <div style={{ color: '#475569', fontSize: '0.9rem' }}>
                      via {item.channel.toUpperCase()} · {item.endpoint}
                    </div>
                    {item.detail ? (
                      <div style={{ color: '#475569', fontSize: '0.85rem', marginTop: '8px' }}>{item.detail}</div>
                    ) : null}
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          {result.skipped.length > 0 ? (
            <div>
              <h3 style={{ margin: '0 0 12px', color: '#0f172a', fontSize: '1.05rem' }}>Skipped threads</h3>
              <div style={{ display: 'grid', gap: '10px' }}>
                {result.skipped.map((item) => (
                  <div
                    key={item.messageId}
                    style={{
                      padding: '16px',
                      borderRadius: '12px',
                      background: '#fff7ed',
                      border: '1px solid #fed7aa'
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: '6px' }}>{item.subject}</div>
                    <div style={{ color: '#9a3412', fontSize: '0.9rem' }}>{item.reason}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {result.errors.length > 0 ? (
            <div
              style={{
                marginTop: '24px',
                background: '#fee2e2',
                border: '1px solid #fca5a5',
                padding: '18px 22px',
                borderRadius: '12px',
                color: '#991b1b'
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: '8px' }}>Agent warnings</div>
              <ul style={{ margin: 0, paddingLeft: '18px' }}>
                {result.errors.map((message, index) => (
                  <li key={index}>{message}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
