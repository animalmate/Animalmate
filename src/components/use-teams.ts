'use client';

import { useEffect, useState } from 'react';

/**
 * 신입 모집 화면들이 공유하는 **지망 팀** 목록 로더.
 *
 * 출처는 기수 설정(apply_form.wishTeamOptions)이고 "0. 공고·마감 설정"에서 회장단이 편집한다.
 * 회원 관리의 teams 테이블(기획팀·홍보팀 등 운영진 조직)과는 다른 목록이다.
 *
 * cohortId 가 정해지기 전에는 최신 기수 설정을 쓰고, 정해지면 그 기수 것으로 다시 불러온다.
 *
 * loading 을 함께 돌려주는 이유: 목록이 비어 있는 셀렉트를 먼저 보여 주면 사용자는
 * "팀이 하나도 없다"고 오해한다. 불러오는 중에는 그렇게 말해 줘야 한다.
 */
export function useTeams(cohortId?: string): { teams: string[]; loading: boolean } {
  const [teams, setTeams] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const qs = cohortId ? `?cohortId=${encodeURIComponent(cohortId)}` : '';
    fetch(`/api/recruit/teams${qs}`)
      .then((res) => (res.ok ? res.json() : { teams: [] }))
      .then((data) => {
        if (!alive) return;
        setTeams((data.teams ?? []).map((t: { name: string }) => t.name));
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [cohortId]);

  return { teams, loading };
}
