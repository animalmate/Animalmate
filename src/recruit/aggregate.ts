// F9 신입 모집 채점 집계 (평균, 최고/최저, 표본 부족 판정)
export interface ScoreItem {
  applicantId: string;
  scorerUserId: string;
  stage: 'document' | 'interview';
  score: string | number;
  comment?: string | null;
}

export interface ApplicantAggregate {
  applicantId: string;
  docScoreAvg: number | null;
  docScoreMin: number | null;
  docScoreMax: number | null;
  docScorerCount: number;
  isDocSampleDeficient: boolean; // 3명 미만 채점 시 true

  interviewScoreAvg: number | null;
  interviewScoreMin: number | null;
  interviewScoreMax: number | null;
  interviewScorerCount: number;
  isInterviewSampleDeficient: boolean; // 3명 미만 채점 시 true
}

export function aggregateScoresByApplicant(
  applicantIds: string[],
  scores: ScoreItem[]
): Record<string, ApplicantAggregate> {
  const result: Record<string, ApplicantAggregate> = {};

  applicantIds.forEach((id) => {
    result[id] = {
      applicantId: id,
      docScoreAvg: null,
      docScoreMin: null,
      docScoreMax: null,
      docScorerCount: 0,
      isDocSampleDeficient: true,
      interviewScoreAvg: null,
      interviewScoreMin: null,
      interviewScoreMax: null,
      interviewScorerCount: 0,
      isInterviewSampleDeficient: true,
    };
  });

  const scoresByApp: Record<
    string,
    { doc: number[]; interview: number[] }
  > = {};

  applicantIds.forEach((id) => {
    scoresByApp[id] = { doc: [], interview: [] };
  });

  scores.forEach((s) => {
    if (!scoresByApp[s.applicantId]) {
      scoresByApp[s.applicantId] = { doc: [], interview: [] };
    }
    const num = typeof s.score === 'string' ? parseFloat(s.score) : s.score;
    if (s.stage === 'document') {
      scoresByApp[s.applicantId].doc.push(num);
    } else if (s.stage === 'interview') {
      scoresByApp[s.applicantId].interview.push(num);
    }
  });

  applicantIds.forEach((id) => {
    const docArr = scoresByApp[id].doc;
    if (docArr.length > 0) {
      const sum = docArr.reduce((a, b) => a + b, 0);
      result[id].docScoreAvg = Math.round((sum / docArr.length) * 10) / 10;
      result[id].docScoreMin = Math.min(...docArr);
      result[id].docScoreMax = Math.max(...docArr);
      result[id].docScorerCount = docArr.length;
      result[id].isDocSampleDeficient = docArr.length < 3;
    }

    const intArr = scoresByApp[id].interview;
    if (intArr.length > 0) {
      const sum = intArr.reduce((a, b) => a + b, 0);
      result[id].interviewScoreAvg = Math.round((sum / intArr.length) * 10) / 10;
      result[id].interviewScoreMin = Math.min(...intArr);
      result[id].interviewScoreMax = Math.max(...intArr);
      result[id].interviewScorerCount = intArr.length;
      result[id].isInterviewSampleDeficient = intArr.length < 3;
    }
  });

  return result;
}
