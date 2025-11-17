import { NextResponse } from 'next/server';
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { AgentRunRequestSchema, type AgentRunResponse } from '@/lib/schemas';
import { classifyEmail, parseRawEmail } from '@/lib/emailClassifier';
import { craftFormalReply } from '@/lib/formalReply';
import { executeHttpUnsubscribe, executeMailtoUnsubscribe, parseListUnsubscribe } from '@/lib/unsubscribe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const incoming = await request.json();
    const parsedBody = AgentRunRequestSchema.parse(incoming);

    const importantReplies: AgentRunResponse['importantReplies'] = [];
    const marketingUnsubscribes: AgentRunResponse['marketingUnsubscribes'] = [];
    const skipped: AgentRunResponse['skipped'] = [];
    const errors: string[] = [];

    const imapClient = new ImapFlow({
      host: parsedBody.imap.host,
      port: parsedBody.imap.port,
      secure: parsedBody.imap.secure,
      auth: {
        user: parsedBody.imap.user,
        pass: parsedBody.imap.password
      }
    });

    let transporter: nodemailer.Transporter | null = null;

    const ensureTransporter = () => {
      if (transporter) return transporter;
      transporter = nodemailer.createTransport({
        host: parsedBody.smtp.host,
        port: parsedBody.smtp.port,
        secure: parsedBody.smtp.secure,
        auth: {
          user: parsedBody.smtp.user,
          pass: parsedBody.smtp.password
        }
      });
      return transporter;
    };

    let fetched = 0;
    let isConnected = false;
    try {
      await imapClient.connect();
      isConnected = true;
      await imapClient.mailboxOpen(parsedBody.imap.mailbox);

      const uids = await imapClient.search({ seen: false });
      const uidList = Array.isArray(uids) ? uids : [];
      const workload = uidList.slice(-25);
      if (workload.length === 0) {
        return NextResponse.json(
          {
            syncedAt: new Date().toISOString(),
            summary: {
              fetched: 0,
              importantReplies: 0,
              marketingUnsubscribes: 0,
              skipped: 0
            },
            importantReplies,
            marketingUnsubscribes,
            skipped,
            errors
          } satisfies AgentRunResponse
        );
      }

      for (const uid of workload) {
        fetched += 1;
        try {
          const message = await imapClient.fetchOne(uid, {
            uid: true,
            envelope: true,
            source: true,
            flags: true,
            headers: true
          });

          if (!message || !message.source || !message.envelope?.from?.length) {
            skipped.push({
              messageId: String(uid),
              subject: '(no subject)',
              reason: 'Missing source or sender information'
            });
            continue;
          }

          const parsedEmail = await parseRawEmail(message.source as Buffer);
          const classification = classifyEmail(parsedEmail);
          const fromAddress = message.envelope.from[0].address ?? parsedEmail.fromAddress;
          const inReplyTo = message.envelope.messageId ?? parsedEmail.messageId;
          const references = message.envelope.messageId ? [message.envelope.messageId] : undefined;

          if (classification.isMarketing) {
            if (!parsedBody.settings.autoUnsubscribeMarketing) {
              skipped.push({
                messageId: parsedEmail.messageId,
                subject: parsedEmail.subject,
                reason: 'Marketing detected but automation disabled'
              });
              continue;
            }

            const channels = parseListUnsubscribe(parsedEmail.listUnsubscribe);
            if (!channels) {
              skipped.push({
                messageId: parsedEmail.messageId,
                subject: parsedEmail.subject,
                reason: 'Marketing detected but no unsubscribe instructions found'
              });
              continue;
            }

            let unsubscribed = false;
            if (channels.http.length > 0) {
              const url = channels.http[0];
              const result = await executeHttpUnsubscribe(url);
              marketingUnsubscribes.push({
                messageId: parsedEmail.messageId,
                subject: parsedEmail.subject,
                channel: 'http',
                endpoint: url,
                status: result.success ? 'requested' : 'failed',
                detail: result.detail
              });
              if (!result.success) {
                errors.push(`HTTP unsubscribe failed for ${parsedEmail.subject}: ${result.detail ?? 'unknown error'}`);
              } else {
                unsubscribed = true;
              }
            }

            if (!unsubscribed && channels.mailto.length > 0) {
              try {
                const transport = ensureTransporter();
                const mailtoAddress = channels.mailto[0];
                const outcome = await executeMailtoUnsubscribe(mailtoAddress, transport);
                marketingUnsubscribes.push({
                  messageId: parsedEmail.messageId,
                  subject: parsedEmail.subject,
                  channel: 'email',
                  endpoint: mailtoAddress,
                  status: outcome.success ? 'requested' : 'failed',
                  detail: outcome.detail
                });
                if (!outcome.success) {
                  errors.push(`Mailto unsubscribe failed for ${parsedEmail.subject}: ${outcome.detail ?? 'unknown error'}`);
                }
              } catch (unsubscribeError) {
                const detail = unsubscribeError instanceof Error ? unsubscribeError.message : 'Unknown error';
                marketingUnsubscribes.push({
                  messageId: parsedEmail.messageId,
                  subject: parsedEmail.subject,
                  channel: 'email',
                  endpoint: channels.mailto[0],
                  status: 'failed',
                  detail
                });
                errors.push(`Failed to trigger unsubscribe email for ${parsedEmail.subject}: ${detail}`);
              }
            }

            await imapClient.messageFlagsAdd([uid], ['\\Seen']);
            continue;
          }

          const isImportant = classification.importanceScore >= parsedBody.settings.importanceThreshold;
          if (!isImportant) {
            skipped.push({
              messageId: parsedEmail.messageId,
              subject: parsedEmail.subject,
              reason: 'Below importance threshold'
            });
            continue;
          }

          if (!parsedBody.settings.autoReplyImportant) {
            skipped.push({
              messageId: parsedEmail.messageId,
              subject: parsedEmail.subject,
              reason: 'Important but auto-reply disabled'
            });
            continue;
          }

          try {
            const agentSummary = parsedBody.settings.includeSummaries ? classification.summary : [];
            const reply = craftFormalReply(parsedEmail, parsedBody.agentProfile, agentSummary);
            const transport = ensureTransporter();
            const response = await transport.sendMail({
              from: `${parsedBody.agentProfile.displayName} <${parsedBody.smtp.user}>`,
              to: fromAddress,
              subject: reply.subject,
              text: reply.body,
              inReplyTo,
              references
            });

            importantReplies.push({
              messageId: parsedEmail.messageId,
              subject: parsedEmail.subject,
              to: fromAddress,
              status: response.rejected.length ? 'failed' : 'sent',
              preview: classification.reason,
              replyPreview: reply.body
            });
          } catch (replyError) {
            const detail = replyError instanceof Error ? replyError.message : 'Unknown error';
            importantReplies.push({
              messageId: parsedEmail.messageId,
              subject: parsedEmail.subject,
              to: fromAddress,
              status: 'failed',
              preview: classification.reason,
              replyPreview: 'Reply dispatch failed. Check logs for details.'
            });
            errors.push(`Failed to send reply for ${parsedEmail.subject}: ${detail}`);
          }

          await imapClient.messageFlagsAdd([uid], ['\\Seen']);
        } catch (messageError) {
          const detail = messageError instanceof Error ? messageError.message : 'Unknown error';
          errors.push(`Failed to process uid ${String(uid)}: ${detail}`);
        }
      }
    } finally {
      if (isConnected) {
        try {
          await imapClient.logout();
        } catch {
          imapClient.close();
        }
      }
    }

    const responsePayload: AgentRunResponse = {
      syncedAt: new Date().toISOString(),
      summary: {
        fetched,
        importantReplies: importantReplies.length,
        marketingUnsubscribes: marketingUnsubscribes.length,
        skipped: skipped.length
      },
      importantReplies,
      marketingUnsubscribes,
      skipped,
      errors
    };

    return NextResponse.json(responsePayload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return NextResponse.json({ message }, { status: 400 });
  }
}
