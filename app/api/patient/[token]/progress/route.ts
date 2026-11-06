import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { patientForToken } from '@/lib/links';
import { assignments, progressEvents } from '@/lib/schema';

/**
 * How far the patient actually got.
 *
 * The token in the URL is the only identity — the assignment must belong to the
 * patient it resolves to, checked here rather than trusted, so one patient's
 * link cannot write progress onto another's record.
 *
 * Events are appended, never updated. Percentage is derived from the furthest
 * one, so a re-watch cannot make progress go backwards.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const resolved = await patientForToken(token);
  // Same answer for a revoked, expired or invented token.
  if (!resolved) return NextResponse.json({ ok: false }, { status: 404 });

  const body = await request.json().catch(() => null);
  const assignmentId = typeof body?.assignmentId === 'string' ? body.assignmentId : null;
  const type = body?.type;
  if (!assignmentId || !['opened', 'progress', 'completed'].includes(type)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const [assignment] = await db.select().from(assignments)
    .where(and(
      eq(assignments.id, assignmentId),
      eq(assignments.patientId, resolved.patient.id),
    )).limit(1);
  if (!assignment) return NextResponse.json({ ok: false }, { status: 404 });

  const rawPercent = Number(body?.percent);
  const percent = Number.isFinite(rawPercent)
    ? Math.max(0, Math.min(100, Math.round(rawPercent)))
    : null;
  const rawPosition = Number(body?.positionSeconds);

  await db.insert(progressEvents).values({
    assignmentId,
    type,
    percent: type === 'completed' ? 100 : percent,
    positionSeconds: Number.isFinite(rawPosition) ? rawPosition : null,
  });

  return NextResponse.json({ ok: true });
}
