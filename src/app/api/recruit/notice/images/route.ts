import { NextResponse } from 'next/server';
import { getCurrentActor } from '@/auth/current-user';
import { canEditRecruitNotice } from '@/auth/permissions';
import { getCohortById } from '@/recruit/cohorts';
import { internalError } from '@/http/errors';
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  deleteNoticeImageByUrl,
  uploadNoticeImage,
} from '@/storage/notice-images';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 포스터는 공고 본문과 같은 화면에서 같은 사람이 만든다 → 게이트도 공고 편집과 똑같이 둔다
// (회장단 + 공고 편집 권한이 켜진 팀). 여기만 회장단으로 남기면 홍보팀이 글은 쓰는데
// 포스터를 못 올려 결국 아무것도 못 하는 화면이 된다.
async function requireNoticeEditor() {
  const actor = await getCurrentActor();
  if (!actor || !actor.membershipActive) {
    return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  }
  if (!canEditRecruitNotice(actor)) {
    return {
      error: NextResponse.json(
        { error: 'forbidden', message: '공고 이미지는 회장단과 공고 편집 권한이 있는 팀만 관리할 수 있습니다.' },
        { status: 403 }
      ),
    };
  }
  return { actor };
}

export async function POST(req: Request): Promise<Response> {
  const gate = await requireNoticeEditor();
  if (gate.error) return gate.error;

  try {
    const form = await req.formData();
    const cohortId = String(form.get('cohortId') ?? '').trim();
    const file = form.get('file');

    if (!cohortId) return NextResponse.json({ error: 'missing_cohortId' }, { status: 400 });
    if (!(file instanceof File)) return NextResponse.json({ error: 'missing_file' }, { status: 400 });

    // 존재하지 않는 기수 아래에 파일이 쌓이지 않게 한다.
    const cohort = await getCohortById(cohortId);
    if (!cohort) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
      return NextResponse.json(
        { error: 'unsupported_type', message: 'JPG, PNG, WebP 이미지만 올릴 수 있습니다.' },
        { status: 400 }
      );
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: 'too_large', message: '이미지 한 장은 5MB 이하여야 합니다.' },
        { status: 400 }
      );
    }

    const uploaded = await uploadNoticeImage(cohortId, await file.arrayBuffer(), file.type);
    return NextResponse.json(uploaded);
  } catch (e) {
    return internalError('recruit/notice/images POST', e);
  }
}

// 공고에서 뺀 이미지를 스토리지에서도 지운다(안 지우면 용량만 계속 늘어난다).
export async function DELETE(req: Request): Promise<Response> {
  const gate = await requireNoticeEditor();
  if (gate.error) return gate.error;

  const url = new URL(req.url).searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'missing_url' }, { status: 400 });

  // 우리 버킷 URL 이 아니면 무시한다 — 임의 주소로 삭제 요청이 나가지 않게.
  const deleted = await deleteNoticeImageByUrl(url);
  return NextResponse.json({ ok: true, deleted });
}
