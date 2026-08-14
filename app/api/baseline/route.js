import { NextResponse } from 'next/server';
import { buildBaseline, summariseDrift } from '../../../lib/baseline.js';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

/**
 * GET /api/baseline?limit=4
 *
 * Fetches the most recent reports from the sitemap and reports where they
 * disagree with each other. Run this on its own when you want to answer
 * "what is our house style right now", rather than "is this one page correct".
 */
export async function GET(request) {
  const token = process.env.KR_ACCESS_TOKEN;
  if (token && request.headers.get('x-kr-token') !== token) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get('limit')) || 4, 10);

  const baseline = await buildBaseline({ limit });
  if (!baseline.available) {
    return NextResponse.json(baseline, { status: 502 });
  }

  return NextResponse.json({
    ...baseline,
    drift: summariseDrift(baseline.reports),
  });
}
