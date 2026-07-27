'use client';

import { useEffect, useState } from 'react';

/**
 * 신입 모집 화면들이 공유하는 팀 목록 로더.
 * 팀 이름을 화면마다 하드코딩하지 않는다 — 출처는 teams 테이블이고 회장단이 회원 관리에서 바꾼다.
 *
 * loading 을 함께 돌려주는 이유: 목록이 비어 있는 셀렉트를 먼저 보여 주면 사용자는
 * "팀이 하나도 없다"고 오해한다. 불러오는 중에는 그렇게 말해 줘야 한다.
 */
export function useTeams(): { teams: string[]; loading: boolean } {
  const [teams, setTeams] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch('/api/recruit/teams')
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
  }, []);

  return { teams, loading };
}
