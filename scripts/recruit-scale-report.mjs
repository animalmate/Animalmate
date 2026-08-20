#!/usr/bin/env node
// 모집 기수의 **규모**를 재서 화면이 감당할 만한지 판단할 재료를 준다.
//
//   node scripts/recruit-scale-report.mjs            # 지원자가 가장 많은 기수
//   node scripts/recruit-scale-report.mjs 33기       # 기수 이름(label)으로 지정
//
// 왜 있는가: 이 시스템이 실측해 본 최대 규모는 연습용 `테스트` 기수 50명이었는데, 33기는 203명이다.
// "느린 것 같다"는 느낌으로 코드를 고치기 전에 **어디에 무게가 실려 있는지** 숫자로 본다.
//
// **읽기 전용이다.** 아무것도 쓰지 않는다. 그리고 **개인정보를 출력하지 않는다** — 이름·전화·자기소개
// 본문은 화면에 찍지 않고 길이와 개수만 센다(터미널 기록·캡처에 실명이 남으면 안 된다).
import './load-env.mjs';
import postgres from 'postgres';

const label = process.argv[2] ?? null;
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL 이 없다. .env 를 확인한다.');
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 2 });
const kb = (bytes) => `${(Number(bytes ?? 0) / 1024).toFixed(0)}KB`;

try {
  // 왕복 기준선 — 아래 숫자들을 읽을 때 "이 정도가 한 번 다녀오는 값"이라는 기준이 된다.
  const pings = [];
  for (let i = 0; i < 3; i++) {
    const s = Date.now();
    await sql`select 1`;
    pings.push(Date.now() - s);
  }
  console.log(`DB 왕복 ${pings.join('ms / ')}ms\n`);

  const cohorts = await sql`
    select c.id, c.label, c.is_closed, c.result_public, count(a.id)::int as n
    from recruit_cohorts c left join recruit_applicants a on a.cohort_id = c.id
    group by c.id, c.label, c.is_closed, c.result_public
    order by n desc`;
  if (cohorts.length === 0) {
    console.log('기수가 없다.');
    process.exit(0);
  }

  console.log('=== 기수 ===');
  for (const c of cohorts) {
    console.log(
      `${c.label}: ${c.n}명${c.is_closed ? ' (마감)' : ''}${c.result_public ? ' (결과 공개)' : ''}`
    );
  }

  const target = label ? cohorts.find((c) => c.label === label) : cohorts[0];
  if (!target) {
    console.error(`\n'${label}' 기수를 찾지 못했다.`);
    process.exit(1);
  }
  console.log(`\n=== ${target.label} (${target.n}명) ===`);

  // 화면이 실제로 내려받는 무게. 서류 심사·면접 콘솔은 자기소개서 전문을 포함한 **전체 행**을 받고,
  // 집계·배정 화면은 전문을 뺀 slim 을 받는다. 점수 API 는 id 만 읽는다.
  const [size] = await sql`
    select
      sum(octet_length(a::text))                                        as full_bytes,
      sum(octet_length(coalesce(a.essay_intro,'') || coalesce(a.essay_values,''))) as essay_bytes,
      avg(char_length(coalesce(a.essay_intro,'') || coalesce(a.essay_values,'')))::int as essay_avg_chars,
      max(char_length(coalesce(a.essay_intro,'') || coalesce(a.essay_values,'')))      as essay_max_chars,
      count(*)::int as n
    from recruit_applicants a where a.cohort_id = ${target.id}`;
  const slimBytes = Number(size.full_bytes) - Number(size.essay_bytes);
  console.log(`지원서 전문 포함 : ${kb(size.full_bytes)}  ← 서류 심사·면접 콘솔이 한 번에 받는 양`);
  console.log(`전문 제외(slim)  : ${kb(slimBytes)}  ← 집계·배정 화면`);
  console.log(`자기소개+가치관  : 평균 ${size.essay_avg_chars}자, 최대 ${size.essay_max_chars}자`);

  const statuses = await sql`
    select status, count(*)::int as n from recruit_applicants
    where cohort_id = ${target.id} group by status order by n desc`;
  console.log(`\n상태 분포: ${statuses.map((s) => `${s.status}=${s.n}`).join(', ')}`);

  // 채점 진척 — 몇 명이 몇 명을 봤는가.
  const scores = await sql`
    select s.stage, count(*)::int as n, count(distinct s.applicant_id)::int as applicants,
           count(distinct s.scorer_user_id)::int as scorers
    from recruit_scores s join recruit_applicants a on a.id = s.applicant_id
    where a.cohort_id = ${target.id} group by s.stage`;
  console.log('\n=== 채점 ===');
  if (scores.length === 0) console.log('아직 없다.');
  for (const s of scores) {
    console.log(
      `${s.stage === 'document' ? '서류' : '면접'}: ${s.n}건, 지원자 ${s.applicants}/${target.n}명, 채점자 ${s.scorers}명`
    );
  }

  // 면접 슬롯이 인원을 감당하는가.
  // **슬롯에는 정원 컬럼이 없다** — 한 슬롯에 몇 명을 넣을지는 운영이 정하고, 시스템은 배정된 수만 센다.
  // 그래서 "정원 대비 부족"을 시스템이 단정할 수 없고, 대신 판단 재료(조·시간대·슬롯당 배정 인원)를 준다.
  const [slots] = await sql`
    select count(*)::int as slots, count(distinct panel)::int as panels,
           min(starts_at) as first_at, max(starts_at) as last_at
    from recruit_slots where cohort_id = ${target.id}`;
  const perSlot = await sql`
    select count(*)::int as n from recruit_applicants
    where cohort_id = ${target.id} and slot_id is not null
    group by slot_id order by n desc`;
  const assignedTotal = perSlot.reduce((s, r) => s + r.n, 0);
  const docPass = statuses.find((s) => s.status === 'doc_pass')?.n ?? 0;

  console.log('\n=== 면접 슬롯 ===');
  if (slots.slots === 0) {
    console.log('아직 슬롯을 만들지 않았다.');
  } else {
    const fmt = (d) => (d ? new Date(d).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '-');
    console.log(`슬롯 ${slots.slots}개 · 조 ${slots.panels}개 · ${fmt(slots.first_at)} ~ ${fmt(slots.last_at)}`);
    console.log(
      `배정 완료 ${assignedTotal}명 (배정된 슬롯 ${perSlot.length}개, 슬롯당 최대 ${perSlot[0]?.n ?? 0}명)`
    );
  }
  if (docPass > 0) {
    console.log(`→ 면접 대상(서류 합격) ${docPass}명 중 ${assignedTotal}명 배정, ${docPass - assignedTotal}명 남음`);
  } else {
    console.log(`→ 서류 합격이 아직 없다. 전체 ${target.n}명 중 몇 명을 부를지 정하고 다시 센다.`);
  }
} finally {
  await sql.end();
}
