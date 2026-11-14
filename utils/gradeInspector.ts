import {
  CanvasAssignment,
  CanvasAssignmentGroup,
  CanvasEnrollment,
  CourseData,
  CourseGradeDiagnosticsResult,
} from '../types';

export type GradeResolutionSource =
  | 'canvas_enrollment'
  | 'calculated_unweighted'
  | 'suppressed_zero_ungraded'
  | 'suppressed_zero_unreliable'
  | 'unavailable';

export interface EffectiveCourseGrade {
  score: number;
  letter?: string;
  isEstimated: boolean;
  hasData: boolean;
  source: 'canvas_enrollment' | 'calculated_unweighted';
  gradedCount: number;
}

export interface UnweightedCourseAverage {
  score: number;
  earnedPoints: number;
  possiblePoints: number;
  gradedCount: number;
  zeroScoreCount: number;
  isEstimated: true;
}

export interface CourseGradingCoverage {
  gradableAssignmentsCount: number;
  gradedAssignmentsCount: number;
  ungradedAssignmentsCount: number;
  gradedAssignmentFraction: number;
  gradedAssignmentPercent: number;
  totalPossiblePoints: number;
  gradedPossiblePoints: number;
  gradedPointsFraction: number;
  gradedPointsPercent: number;
  recentGradableCount: number;
  recentGradedCount: number;
  latestGradedAt: string | null;
  latestGradedAssignmentName: string | null;
  daysSinceLastGraded: number | null;
  isLowGradedFraction: boolean;
  hasNoRecentGradedWork: boolean;
  isPerfectZeroCourse: boolean;
  suppressionReasons: string[];
}

export interface GradeAssignmentAuditRow {
  id: number;
  name: string;
  assignmentGroupId?: number;
  assignmentGroupName?: string;
  pointsPossible: number;
  pointsSharePercent: number | null;
  score: number | null;
  grade: string | null;
  enteredScore: number | null;
  enteredGrade: string | null;
  percentage: number | null;
  dueAt: string | null;
  submittedAt: string | null;
  gradedAt: string | null;
  postedAt: string | null;
  workflowState?: string;
  submissionTypes: string[];
  late: boolean;
  missing: boolean;
  excused: boolean;
  omitFromFinalGrade: boolean;
  isCalendarEvent: boolean;
  includedInCalculation: boolean;
  exclusionReason?: string;
  htmlUrl?: string;
  rawAssignment: CanvasAssignment;
}

export interface AssignmentGroupBreakdown {
  id: number;
  name: string;
  groupWeight: number;
  earnedPoints: number;
  possiblePoints: number;
  groupPercent: number | null;
  gradedCount: number;
  weightedContribution: number | null;
}

export interface GradeResolutionStep {
  title: string;
  detail: string;
  status: 'used' | 'skipped' | 'warning' | 'info';
}

export interface GradeDiagnosticAnomaly {
  severity: 'warning' | 'info';
  title: string;
  detail: string;
}

export interface CourseGradeInspection {
  courseId: number;
  courseName: string;
  courseCode: string;
  displayed: {
    score: number | null;
    letter?: string;
    isEstimated: boolean;
    hasData: boolean;
    source: GradeResolutionSource;
    sourceLabel: string;
    suppressionReason?: string;
  };
  fetched: {
    endpoint: string;
    fetchedAt?: string;
    hasEnrollment: boolean;
    enrollmentId?: number;
    enrollmentType?: string;
    enrollmentState?: string;
    role?: string;
    userId?: number;
    associatedUserId?: number;
    gradingPeriodId?: number | null;
    gradingPeriodTitle?: string | null;
    currentScore: number | null;
    currentGrade: string | null;
    finalScore: number | null;
    finalGrade: string | null;
    unpostedCurrentScore: number | null;
    unpostedCurrentGrade: string | null;
    unpostedFinalScore: number | null;
    unpostedFinalGrade: string | null;
    overrideScore: number | null;
    overrideGrade: string | null;
    currentPeriodScore: number | null;
    currentPeriodGrade: string | null;
    computedCurrentScore: number | null;
    enrollmentsCount: number;
    allEnrollments: CanvasEnrollment[];
  };
  calculated: {
    earnedPoints: number;
    possiblePoints: number;
    percentage: number | null;
    gradedCount: number;
    zeroScoreCount: number;
    excludedCount: number;
    totalAssignmentsCount: number;
    applyAssignmentGroupWeights: boolean;
    weightedPercentage: number | null;
    groups: AssignmentGroupBreakdown[];
  };
  coverage: CourseGradingCoverage;
  gradedAssignments: GradeAssignmentAuditRow[];
  assignments: GradeAssignmentAuditRow[];
  steps: GradeResolutionStep[];
  anomalies: GradeDiagnosticAnomaly[];
  rawPayloads: {
    enrollment: CanvasEnrollment | null;
    allEnrollments: CanvasEnrollment[];
    courseMeta: any;
    assignmentGroups: CanvasAssignmentGroup[];
    gradedAssignments: CanvasAssignment[];
    ungradedOrExcludedAssignments: CanvasAssignment[];
  };
}

const RECENT_GRADING_WINDOW_DAYS = 42;
const RECENT_GRADING_WINDOW_MS = RECENT_GRADING_WINDOW_DAYS * 86400_000;

const isFiniteNumber = (val: unknown): val is number =>
  typeof val === 'number' && Number.isFinite(val);

const roundTenth = (val: number): number => Math.round(val * 10) / 10;

const parseTimestampMs = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
};

export const selectPrimaryEnrollment = (
  enrollments: CanvasEnrollment[] | undefined,
  courseId: number
): CanvasEnrollment | undefined => {
  if (!Array.isArray(enrollments) || enrollments.length === 0) return undefined;
  const matching = enrollments.filter((e) => e && e.course_id === courseId);
  if (matching.length === 0) return undefined;
  if (matching.length === 1) return matching[0];

  const rankEnrollment = (e: CanvasEnrollment): number => {
    let score = 0;
    const state = (e.enrollment_state || '').toLowerCase();
    if (state === 'active' || state === '') score += 100;
    if (state === 'completed' || state === 'concluded') score += 20;
    if (state === 'inactive' || state === 'deleted') score -= 100;

    if (isFiniteNumber(e.grades?.current_score)) score += 30;
    if (isFiniteNumber(e.grades?.final_score)) score += 10;
    if (isFiniteNumber(e.grades?.current_score) && e.grades.current_score > 0) score += 15;

    const type = (e.type || '').toLowerCase();
    if (type.includes('student')) score += 5;
    if (type.includes('observer')) score += 3;
    return score;
  };

  return [...matching].sort((a, b) => rankEnrollment(b) - rankEnrollment(a))[0];
};

const evaluateAssignmentInclusion = (
  a: CanvasAssignment
): { included: boolean; reason?: string; score: number | null; isZeroScore: boolean } => {
  if (a.is_calendar_event) {
    return { included: false, reason: 'Calendar event', score: null, isZeroScore: false };
  }
  if (a.submission?.excused) {
    return {
      included: false,
      reason: 'Excused (excluded from grade)',
      score: a.submission?.score ?? null,
      isZeroScore: false,
    };
  }
  if (a.omit_from_final_grade) {
    return {
      included: false,
      reason: 'Omitted from final grade',
      score: a.submission?.score ?? null,
      isZeroScore: false,
    };
  }
  if (!isFiniteNumber(a.points_possible) || a.points_possible <= 0) {
    return {
      included: false,
      reason: '0 points possible / ungraded item',
      score: isFiniteNumber(a.submission?.score) ? a.submission!.score : null,
      isZeroScore: false,
    };
  }
  const rawScore = a.submission?.score;
  if (!isFiniteNumber(rawScore)) {
    return {
      included: false,
      reason: a.submission?.missing ? 'Missing (unscored)' : 'No numeric score yet',
      score: null,
      isZeroScore: false,
    };
  }
  return {
    included: true,
    score: rawScore,
    isZeroScore: rawScore === 0,
  };
};

export const computeUnweightedCourseAverage = (
  assignments: CanvasAssignment[] | undefined
): UnweightedCourseAverage | null => {
  let earnedPoints = 0;
  let possiblePoints = 0;
  let gradedCount = 0;
  let zeroScoreCount = 0;

  (assignments || []).forEach((a) => {
    const check = evaluateAssignmentInclusion(a);
    if (!check.included || check.score === null) return;
    earnedPoints += check.score;
    possiblePoints += Number(a.points_possible);
    gradedCount++;
    if (check.isZeroScore) zeroScoreCount++;
  });

  if (possiblePoints > 0 && gradedCount > 0) {
    return {
      score: roundTenth((earnedPoints / possiblePoints) * 100),
      earnedPoints: roundTenth(earnedPoints),
      possiblePoints: roundTenth(possiblePoints),
      gradedCount,
      zeroScoreCount,
      isEstimated: true,
    };
  }

  return null;
};

export const computeCourseGradingCoverage = (
  assignments: CanvasAssignment[] | undefined,
  officialScore: number | null | undefined,
  officialGrade: string | null | undefined,
  calculatedScore: number | null,
  nowMs: number = Date.now()
): CourseGradingCoverage => {
  const nonEventAssignments = (assignments || []).filter((a) => !a.is_calendar_event);

  const gradableAssignments = nonEventAssignments.filter(
    (a) =>
      isFiniteNumber(a.points_possible) &&
      a.points_possible > 0 &&
      !a.omit_from_final_grade &&
      !a.submission?.excused
  );

  const gradedAssignments = gradableAssignments.filter((a) =>
    isFiniteNumber(a.submission?.score)
  );

  const gradableAssignmentsCount = gradableAssignments.length;
  const gradedAssignmentsCount = gradedAssignments.length;
  const ungradedAssignmentsCount = Math.max(0, gradableAssignmentsCount - gradedAssignmentsCount);

  const gradedAssignmentFraction =
    gradableAssignmentsCount > 0 ? gradedAssignmentsCount / gradableAssignmentsCount : 0;
  const gradedAssignmentPercent = roundTenth(gradedAssignmentFraction * 100);

  const totalPossiblePoints = roundTenth(
    gradableAssignments.reduce((sum, a) => sum + Number(a.points_possible), 0)
  );
  const gradedPossiblePoints = roundTenth(
    gradedAssignments.reduce((sum, a) => sum + Number(a.points_possible), 0)
  );
  const gradedPointsFraction =
    totalPossiblePoints > 0 ? gradedPossiblePoints / totalPossiblePoints : 0;
  const gradedPointsPercent = roundTenth(gradedPointsFraction * 100);

  const recentCutoffMs = nowMs - RECENT_GRADING_WINDOW_MS;
  const recentGradable = gradableAssignments.filter((a) => {
    const dueMs = parseTimestampMs(a.due_at);
    return dueMs !== null && dueMs >= recentCutoffMs && dueMs <= nowMs;
  });

  const recentGraded = gradedAssignments.filter((a) => {
    const gradedMs = parseTimestampMs(a.submission?.graded_at);
    const dueMs = parseTimestampMs(a.due_at);
    const refMs = gradedMs ?? dueMs;
    return refMs !== null && refMs >= recentCutoffMs && refMs <= nowMs + 86400_000;
  });

  let latestGradedMs: number | null = null;
  let latestGradedAt: string | null = null;
  let latestGradedAssignmentName: string | null = null;

  gradedAssignments.forEach((a) => {
    const candidateIso =
      a.submission?.graded_at || a.due_at || a.submission?.submitted_at || null;
    const candidateMs = parseTimestampMs(candidateIso);
    if (candidateMs !== null && (latestGradedMs === null || candidateMs > latestGradedMs)) {
      latestGradedMs = candidateMs;
      latestGradedAt = candidateIso;
      latestGradedAssignmentName = a.name;
    }
  });

  const daysSinceLastGraded =
    latestGradedMs !== null ? Math.max(0, Math.round((nowMs - latestGradedMs) / 86400_000)) : null;

  const isLowGradedFraction =
    gradableAssignmentsCount > 0 &&
    gradedAssignmentsCount > 0 &&
    (gradedAssignmentFraction < 0.2 ||
      gradedPointsFraction < 0.15 ||
      (gradableAssignmentsCount >= 3 && gradedAssignmentsCount <= 2));

  const hasNoRecentGradedWork =
    gradedAssignmentsCount > 0 &&
    ((recentGradable.length > 0 && recentGraded.length === 0) ||
      (daysSinceLastGraded !== null && daysSinceLastGraded > RECENT_GRADING_WINDOW_DAYS));

  const isPerfectZeroCourse =
    (officialScore === 0 && (calculatedScore === 0 || calculatedScore === null)) ||
    (officialScore === null && calculatedScore === 0);

  const suppressionReasons: string[] = [];
  if (
    (officialScore === 0 || officialGrade?.toUpperCase() === 'F') &&
    gradedAssignmentsCount === 0
  ) {
    suppressionReasons.push('0 graded assignments exist in Canvas');
  } else if (isPerfectZeroCourse || (officialScore === 0 && (isLowGradedFraction || hasNoRecentGradedWork))) {
    if (isLowGradedFraction) {
      suppressionReasons.push(
        `Low fraction of work graded (${gradedAssignmentsCount}/${gradableAssignmentsCount} items, ${gradedPossiblePoints}/${totalPossiblePoints} pts)`
      );
    }
    if (hasNoRecentGradedWork) {
      suppressionReasons.push(
        recentGradable.length > 0 && recentGraded.length === 0
          ? `No recent work graded (${recentGradable.length} recent past-due item${
              recentGradable.length === 1 ? '' : 's'
            }, 0 graded)`
          : `Most recent graded item is ${daysSinceLastGraded} days old (>6 wks)`
      );
    }
    if (isPerfectZeroCourse) {
      suppressionReasons.push(
        'Perfect 0% course score treated as an ungraded/placeholder artifact'
      );
    }
  }

  return {
    gradableAssignmentsCount,
    gradedAssignmentsCount,
    ungradedAssignmentsCount,
    gradedAssignmentFraction,
    gradedAssignmentPercent,
    totalPossiblePoints,
    gradedPossiblePoints,
    gradedPointsFraction,
    gradedPointsPercent,
    recentGradableCount: recentGradable.length,
    recentGradedCount: recentGraded.length,
    latestGradedAt,
    latestGradedAssignmentName,
    daysSinceLastGraded,
    isLowGradedFraction,
    hasNoRecentGradedWork,
    isPerfectZeroCourse,
    suppressionReasons,
  };
};

export const getEffectiveCourseGrade = (
  courseData: CourseData | null | undefined,
  nowMs: number = Date.now()
): EffectiveCourseGrade | null => {
  if (!courseData) return null;

  const officialScore = isFiniteNumber(courseData.enrollment?.grades?.current_score)
    ? courseData.enrollment!.grades.current_score!
    : null;
  const officialGrade = courseData.enrollment?.grades?.current_grade ?? null;

  const estimated = computeUnweightedCourseAverage(courseData.assignments);
  const coverage = computeCourseGradingCoverage(
    courseData.assignments,
    officialScore,
    officialGrade,
    estimated?.score ?? null,
    nowMs
  );

  // Suppress 0% / F placeholders or unreliable 0% scores (sparse coverage, stale grading, or literal 0% course average)
  if (coverage.suppressionReasons.length > 0) {
    return null;
  }

  if (officialScore !== null) {
    return {
      score: officialScore,
      letter: officialGrade || undefined,
      isEstimated: false,
      hasData: true,
      source: 'canvas_enrollment',
      gradedCount: coverage.gradedAssignmentsCount,
    };
  }

  if (estimated) {
    return {
      score: estimated.score,
      letter: undefined,
      isEstimated: true,
      hasData: true,
      source: 'calculated_unweighted',
      gradedCount: estimated.gradedCount,
    };
  }

  return null;
};

export const inspectCourseGrade = (
  courseData: CourseData,
  liveDiagnostics?: CourseGradeDiagnosticsResult | null,
  nowMs: number = Date.now()
): CourseGradeInspection => {
  const enrollmentsList: CanvasEnrollment[] =
    liveDiagnostics?.enrollmentsRaw && liveDiagnostics.enrollmentsRaw.length > 0
      ? liveDiagnostics.enrollmentsRaw
      : courseData.enrollmentsRaw && courseData.enrollmentsRaw.length > 0
        ? courseData.enrollmentsRaw
        : courseData.enrollment
          ? [courseData.enrollment]
          : [];

  const primaryEnrollment =
    selectPrimaryEnrollment(enrollmentsList, courseData.course.id) || courseData.enrollment;

  const grades = primaryEnrollment?.grades;
  const officialScore = isFiniteNumber(grades?.current_score) ? grades!.current_score : null;
  const officialGrade = grades?.current_grade ?? null;
  const finalScore = isFiniteNumber(grades?.final_score) ? grades!.final_score : null;
  const finalGrade = grades?.final_grade ?? null;

  const unpostedCurrentScore = isFiniteNumber(grades?.unposted_current_score)
    ? grades!.unposted_current_score!
    : null;
  const unpostedCurrentGrade = grades?.unposted_current_grade ?? null;
  const unpostedFinalScore = isFiniteNumber(grades?.unposted_final_score)
    ? grades!.unposted_final_score!
    : null;
  const unpostedFinalGrade = grades?.unposted_final_grade ?? null;
  const overrideScore = isFiniteNumber(grades?.override_score) ? grades!.override_score! : null;
  const overrideGrade = grades?.override_grade ?? null;
  const currentPeriodScore = isFiniteNumber(grades?.current_period_computed_current_score)
    ? grades!.current_period_computed_current_score!
    : isFiniteNumber(primaryEnrollment?.current_period_computed_current_score)
      ? primaryEnrollment!.current_period_computed_current_score!
      : null;
  const currentPeriodGrade =
    grades?.current_period_computed_current_grade ??
    primaryEnrollment?.current_period_computed_current_grade ??
    null;
  const computedCurrentScore = isFiniteNumber(primaryEnrollment?.computed_current_score)
    ? primaryEnrollment!.computed_current_score!
    : null;

  const assignmentGroups: CanvasAssignmentGroup[] =
    (liveDiagnostics?.assignmentGroupsRaw && liveDiagnostics.assignmentGroupsRaw.length > 0
      ? liveDiagnostics.assignmentGroupsRaw
      : courseData.assignmentGroups) || [];

  const groupNameMap = new Map<number, string>();
  assignmentGroups.forEach((g) => {
    if (g && typeof g.id === 'number') {
      groupNameMap.set(g.id, g.name || `Group ${g.id}`);
    }
  });

  const groupByAssignmentId = new Map<number, number>();
  assignmentGroups.forEach((g) => {
    (g.assignments || []).forEach((ga) => {
      if (ga && typeof ga.id === 'number') {
        groupByAssignmentId.set(ga.id, g.id);
      }
    });
  });

  const nonEventAssignments = (courseData.assignments || []).filter((a) => !a.is_calendar_event);

  let earnedPoints = 0;
  let possiblePoints = 0;
  let gradedCount = 0;
  let zeroScoreCount = 0;
  let excludedCount = 0;

  const provisionalRows: GradeAssignmentAuditRow[] = nonEventAssignments.map((a) => {
    const evalResult = evaluateAssignmentInclusion(a);
    const groupId = a.assignment_group_id ?? groupByAssignmentId.get(a.id);
    const groupName = groupId !== undefined ? groupNameMap.get(groupId) : undefined;
    const pts = isFiniteNumber(a.points_possible) ? a.points_possible : 0;

    if (evalResult.included && evalResult.score !== null) {
      earnedPoints += evalResult.score;
      possiblePoints += pts;
      gradedCount++;
      if (evalResult.isZeroScore) zeroScoreCount++;
    } else {
      excludedCount++;
    }

    const pct =
      evalResult.score !== null && pts > 0 ? roundTenth((evalResult.score / pts) * 100) : null;

    return {
      id: a.id,
      name: a.name,
      assignmentGroupId: groupId,
      assignmentGroupName: groupName,
      pointsPossible: pts,
      pointsSharePercent: null,
      score: evalResult.score,
      grade: a.submission?.grade ?? null,
      enteredScore: isFiniteNumber(a.submission?.entered_score) ? a.submission!.entered_score! : null,
      enteredGrade: a.submission?.entered_grade ?? null,
      percentage: pct,
      dueAt: a.due_at ?? null,
      submittedAt: a.submission?.submitted_at ?? null,
      gradedAt: a.submission?.graded_at ?? null,
      postedAt: a.submission?.posted_at ?? null,
      workflowState: a.submission?.workflow_state,
      submissionTypes: a.submission_types || [],
      late: Boolean(a.submission?.late),
      missing: Boolean(a.submission?.missing),
      excused: Boolean(a.submission?.excused),
      omitFromFinalGrade: Boolean(a.omit_from_final_grade),
      isCalendarEvent: Boolean(a.is_calendar_event),
      includedInCalculation: evalResult.included,
      exclusionReason: evalResult.reason,
      htmlUrl: a.html_url,
      rawAssignment: a,
    };
  });

  const auditRows = provisionalRows.map((row) => ({
    ...row,
    pointsSharePercent:
      row.includedInCalculation && possiblePoints > 0 && row.pointsPossible > 0
        ? roundTenth((row.pointsPossible / possiblePoints) * 100)
        : null,
  }));

  auditRows.sort((a, b) => {
    if (a.includedInCalculation !== b.includedInCalculation) {
      return a.includedInCalculation ? -1 : 1;
    }
    if (a.includedInCalculation && b.includedInCalculation) {
      if ((a.score === 0) !== (b.score === 0)) return a.score === 0 ? -1 : 1;
      return (a.percentage ?? 999) - (b.percentage ?? 999);
    }
    return a.name.localeCompare(b.name);
  });

  const gradedAuditRows = auditRows.filter((r) => r.includedInCalculation);
  const ungradedOrExcludedAuditRows = auditRows.filter((r) => !r.includedInCalculation);

  const calculatedPercentage =
    possiblePoints > 0 && gradedCount > 0 ? roundTenth((earnedPoints / possiblePoints) * 100) : null;

  const coverage = computeCourseGradingCoverage(
    courseData.assignments,
    officialScore,
    officialGrade,
    calculatedPercentage,
    nowMs
  );

  // Assignment Groups breakdown & weighted calculation
  const applyWeightsFlag = Boolean(
    liveDiagnostics?.courseRaw?.apply_assignment_group_weights ??
      courseData.gradeSourceMeta?.applyAssignmentGroupWeights ??
      assignmentGroups.some((g) => (g.group_weight || 0) > 0)
  );

  const groupRows: AssignmentGroupBreakdown[] = assignmentGroups.map((g) => {
    const groupWeight = isFiniteNumber(g.group_weight) ? g.group_weight : 0;
    const rowsInGroup = auditRows.filter(
      (r) => r.assignmentGroupId === g.id && r.includedInCalculation && r.score !== null
    );
    const gEarned = rowsInGroup.reduce((sum, r) => sum + (r.score || 0), 0);
    const gPossible = rowsInGroup.reduce((sum, r) => sum + r.pointsPossible, 0);
    const gPct =
      gPossible > 0 && rowsInGroup.length > 0 ? roundTenth((gEarned / gPossible) * 100) : null;
    return {
      id: g.id,
      name: g.name,
      groupWeight,
      earnedPoints: roundTenth(gEarned),
      possiblePoints: roundTenth(gPossible),
      groupPercent: gPct,
      gradedCount: rowsInGroup.length,
      weightedContribution: null,
    };
  });

  let weightedPercentage: number | null = null;
  if (applyWeightsFlag && groupRows.length > 0) {
    const activeWeightedGroups = groupRows.filter(
      (g) => g.groupWeight > 0 && g.groupPercent !== null
    );
    const totalActiveWeight = activeWeightedGroups.reduce((sum, g) => sum + g.groupWeight, 0);
    if (totalActiveWeight > 0) {
      let weightedSum = 0;
      activeWeightedGroups.forEach((g) => {
        const contribution = ((g.groupPercent as number) * g.groupWeight) / totalActiveWeight;
        g.weightedContribution = roundTenth(contribution);
        weightedSum += contribution;
      });
      weightedPercentage = roundTenth(weightedSum);
    }
  }

  // Resolution state & trace steps
  const wasSuppressedUngradedZero =
    (officialScore === 0 || officialGrade?.toUpperCase() === 'F') && gradedCount === 0;
  const wasSuppressedUnreliableZero =
    !wasSuppressedUngradedZero && coverage.suppressionReasons.length > 0;

  let displayedSource: GradeResolutionSource = 'unavailable';
  let displayedSourceLabel = 'No Grade Data Available';
  let displayedScore: number | null = null;
  let displayedLetter: string | undefined = undefined;
  let suppressionReason: string | undefined = undefined;

  if (wasSuppressedUngradedZero) {
    displayedSource = 'suppressed_zero_ungraded';
    displayedSourceLabel = 'Suppressed 0% Canvas Placeholder';
    suppressionReason = `Canvas enrollment returned ${officialScore ?? 'F'}, but 0 assignments in this course have numeric grades yet.`;
  } else if (wasSuppressedUnreliableZero) {
    displayedSource = 'suppressed_zero_unreliable';
    displayedSourceLabel = 'Suppressed Unreliable 0% Grade';
    suppressionReason = coverage.suppressionReasons.join('; ');
  } else if (officialScore !== null) {
    displayedSource = 'canvas_enrollment';
    displayedSourceLabel = 'Fetched from Canvas Enrollment API';
    displayedScore = officialScore;
    displayedLetter = officialGrade || undefined;
  } else if (calculatedPercentage !== null) {
    displayedSource = 'calculated_unweighted';
    displayedSourceLabel = 'Calculated Locally (Unweighted Assignment Average)';
    displayedScore = calculatedPercentage;
  }

  const endpoint =
    liveDiagnostics?.endpoints?.[1] ||
    courseData.gradeSourceMeta?.endpoint ||
    `/courses/${courseData.course.id}/enrollments?user_id=self&include[]=total_scores&include[]=current_grading_period_scores`;

  const steps: GradeResolutionStep[] = [];
  if (!primaryEnrollment) {
    steps.push({
      title: '1. Canvas Enrollment Lookup',
      detail: `No matching enrollment record was found in ${endpoint}.`,
      status: 'warning',
    });
  } else {
    steps.push({
      title: '1. Canvas Enrollment Lookup (Primary Source)',
      detail: `Fetched enrollment #${primaryEnrollment.id} (${primaryEnrollment.type}${
        primaryEnrollment.enrollment_state ? `, ${primaryEnrollment.enrollment_state}` : ''
      }) from ${endpoint}. Reported current_score = ${
        officialScore !== null ? `${officialScore}%` : 'null'
      }, final_score = ${finalScore !== null ? `${finalScore}%` : 'null'}.`,
      status:
        officialScore !== null && !wasSuppressedUngradedZero && !wasSuppressedUnreliableZero
          ? 'used'
          : 'info',
    });
  }

  steps.push({
    title: '2. Ground-Truth Assignment Audit & Coverage',
    detail: `Scanned ${nonEventAssignments.length} assignments: ${gradedCount} of ${
      coverage.gradableAssignmentsCount
    } gradable items scored (${coverage.gradedAssignmentPercent}% by count, ${
      coverage.gradedPossiblePoints
    } / ${coverage.totalPossiblePoints} pts = ${coverage.gradedPointsPercent}% by points). Total earned: ${roundTenth(
      earnedPoints
    )} / ${roundTenth(possiblePoints)} pts${
      calculatedPercentage !== null ? ` = ${calculatedPercentage}%` : ''
    }.`,
    status:
      displayedSource === 'calculated_unweighted'
        ? 'used'
        : zeroScoreCount > 0 ||
            coverage.isLowGradedFraction ||
            coverage.hasNoRecentGradedWork ||
            (officialScore === 0 && (calculatedPercentage ?? 0) > 0)
          ? 'warning'
          : 'info',
  });

  if (wasSuppressedUngradedZero) {
    steps.push({
      title: '3. Zero-Placeholder Guard Applied',
      detail: `Canvas reported ${officialScore ?? officialGrade}, which Velm suppressed to "No Data" because 0 assignments are graded.`,
      status: 'used',
    });
  } else if (wasSuppressedUnreliableZero) {
    steps.push({
      title: '3. Unreliable 0% Heuristic Guard Applied',
      detail: `Velm suppressed this 0% course score to "No Data" based on ground-truth reliability signals: ${coverage.suppressionReasons.join(
        '; '
      )}.`,
      status: 'used',
    });
  } else if (displayedSource === 'canvas_enrollment') {
    steps.push({
      title: '3. Final Selection',
      detail: `Used Canvas enrollment grades.current_score (${officialScore}%) directly instead of the local unweighted assignment sum${
        calculatedPercentage !== null ? ` (${calculatedPercentage}%)` : ''
      }.`,
      status: 'used',
    });
  } else if (displayedSource === 'calculated_unweighted') {
    steps.push({
      title: '3. Fallback Calculation Applied',
      detail: `Canvas grades.current_score was null, so Velm calculated an estimated unweighted average (${roundTenth(
        earnedPoints
      )} / ${roundTenth(possiblePoints)} = ${calculatedPercentage}%).`,
      status: 'used',
    });
  } else {
    steps.push({
      title: '3. Final Selection',
      detail: 'Neither Canvas enrollment scores nor graded numeric assignments were available.',
      status: 'skipped',
    });
  }

  // Diagnostic anomalies / why 0% may appear
  const anomalies: GradeDiagnosticAnomaly[] = [];

  if (officialScore === 0 && calculatedPercentage !== null && calculatedPercentage > 0) {
    anomalies.push({
      severity: 'warning',
      title: `Canvas reports current_score = 0%, but graded assignments sum to ${calculatedPercentage}%`,
      detail: `Canvas's /enrollments endpoint returned current_score: 0 even though ${gradedCount} graded assignments total ${roundTenth(
        earnedPoints
      )} / ${roundTenth(possiblePoints)} pts (${calculatedPercentage}%). Common causes: weighted assignment group rules, active grading period filter returning 0, unposted/muted grades, or external SIS grade sync.`,
    });
  }

  if (coverage.isLowGradedFraction && (officialScore === 0 || calculatedPercentage === 0)) {
    anomalies.push({
      severity: 'warning',
      title: `Low fraction of coursework is graded in Canvas (${gradedCount}/${coverage.gradableAssignmentsCount} items, ${coverage.gradedPointsPercent}% of points)`,
      detail: `Only ${gradedCount} out of ${coverage.gradableAssignmentsCount} gradable assignments (${coverage.gradedPossiblePoints} / ${coverage.totalPossiblePoints} pts) have numeric Canvas scores. The course average likely reflects external/paper grading or an unpopulated Canvas gradebook.`,
    });
  }

  if (coverage.hasNoRecentGradedWork) {
    anomalies.push({
      severity: 'warning',
      title:
        coverage.recentGradableCount > 0 && coverage.recentGradedCount === 0
          ? `No recent work graded (${coverage.recentGradableCount} assignments due in the last ${RECENT_GRADING_WINDOW_DAYS} days have 0 grades)`
          : `No recent graded work (last graded item was ${coverage.daysSinceLastGraded} days ago)`,
      detail: coverage.latestGradedAssignmentName
        ? `The most recently graded item ("${coverage.latestGradedAssignmentName}") is from ${new Date(
            coverage.latestGradedAt!
          ).toLocaleDateString()}. Newer assignments in this course are still ungraded in Canvas.`
        : 'Recent coursework has not been graded in Canvas yet.',
    });
  }

  if (coverage.isPerfectZeroCourse && gradedCount > 0) {
    anomalies.push({
      severity: 'warning',
      title: 'Perfect 0% course grade suppressed (impossible genuine 0% standing)',
      detail: `Because earning an exact 0% across an entire course is treated as a Canvas/placeholder artifact (here ${roundTenth(
        earnedPoints
      )} / ${roundTenth(possiblePoints)} pts across ${gradedCount} graded item${
        gradedCount === 1 ? '' : 's'
      }), Dashboard cards hide this misleading 0% while this inspector exposes the underlying graded item(s).`,
    });
  }

  if (zeroScoreCount > 0) {
    anomalies.push({
      severity: 'warning',
      title: `${zeroScoreCount} graded assignment${zeroScoreCount === 1 ? ' has' : 's have'} score = 0`,
      detail: `Look in the Graded Work spotlight below to inspect the exact assignment${
        zeroScoreCount === 1 ? '' : 's'
      } with a numeric score of 0 (rather than null/ungraded).`,
    });
  }

  if (wasSuppressedUngradedZero) {
    anomalies.push({
      severity: 'info',
      title: 'Canvas returned 0% with 0 graded assignments',
      detail:
        'Overview, Course Header, and Sidebar suppress this 0% placeholder as "No Data" when zero assignments have numeric scores.',
    });
  }

  const altScores: string[] = [];
  if (finalScore !== null && finalScore !== officialScore) {
    altScores.push(`final_score: ${finalScore}%`);
  }
  if (unpostedCurrentScore !== null && unpostedCurrentScore !== officialScore) {
    altScores.push(`unposted_current_score: ${unpostedCurrentScore}%`);
  }
  if (currentPeriodScore !== null && currentPeriodScore !== officialScore) {
    altScores.push(`current_period_computed_current_score: ${currentPeriodScore}%`);
  }
  if (overrideScore !== null && overrideScore !== officialScore) {
    altScores.push(`override_score: ${overrideScore}%`);
  }
  if (computedCurrentScore !== null && computedCurrentScore !== officialScore) {
    altScores.push(`computed_current_score: ${computedCurrentScore}%`);
  }

  if (altScores.length > 0) {
    anomalies.push({
      severity: 'warning',
      title: 'Other Canvas score fields differ from current_score',
      detail: `Canvas returned different values on the same enrollment record: ${altScores.join(', ')}.`,
    });
  }

  if (enrollmentsList.length > 1) {
    const summaryList = enrollmentsList
      .map(
        (e) =>
          `#${e.id} (${e.type}/${e.enrollment_state || 'unknown'}: current_score=${
            e.grades?.current_score ?? 'null'
          }, final_score=${e.grades?.final_score ?? 'null'})`
      )
      .join('; ');
    anomalies.push({
      severity: 'info',
      title: `Multiple Canvas enrollment records returned (${enrollmentsList.length})`,
      detail: `Velm selected #${primaryEnrollment?.id}. All rows: ${summaryList}.`,
    });
  }

  if (applyWeightsFlag && groupRows.length > 0) {
    anomalies.push({
      severity: 'info',
      title: 'Weighted Assignment Groups are enabled for this course',
      detail: `Canvas weights categories (${groupRows
        .map((g) => `${g.name}: ${g.groupWeight}%`)
        .join(', ')})${
        weightedPercentage !== null
          ? `; weighted estimate across non-empty groups is ${weightedPercentage}%`
          : ''
      }.`,
    });
  }

  return {
    courseId: courseData.course.id,
    courseName: courseData.course.nickname || courseData.course.name,
    courseCode: courseData.course.course_code,
    displayed: {
      score: displayedScore,
      letter: displayedLetter,
      isEstimated: displayedSource === 'calculated_unweighted',
      hasData: displayedScore !== null,
      source: displayedSource,
      sourceLabel: displayedSourceLabel,
      suppressionReason,
    },
    fetched: {
      endpoint,
      fetchedAt: liveDiagnostics?.fetchedAt || courseData.gradeSourceMeta?.fetchedAt,
      hasEnrollment: Boolean(primaryEnrollment),
      enrollmentId: primaryEnrollment?.id,
      enrollmentType: primaryEnrollment?.type,
      enrollmentState: primaryEnrollment?.enrollment_state,
      role: primaryEnrollment?.role,
      userId: primaryEnrollment?.user_id,
      associatedUserId: primaryEnrollment?.associated_user_id,
      gradingPeriodId: primaryEnrollment?.current_grading_period_id ?? null,
      gradingPeriodTitle: primaryEnrollment?.current_grading_period_title ?? null,
      currentScore: officialScore,
      currentGrade: officialGrade,
      finalScore,
      finalGrade,
      unpostedCurrentScore,
      unpostedCurrentGrade,
      unpostedFinalScore,
      unpostedFinalGrade,
      overrideScore,
      overrideGrade,
      currentPeriodScore,
      currentPeriodGrade,
      computedCurrentScore,
      enrollmentsCount: enrollmentsList.length,
      allEnrollments: enrollmentsList,
    },
    calculated: {
      earnedPoints: roundTenth(earnedPoints),
      possiblePoints: roundTenth(possiblePoints),
      percentage: calculatedPercentage,
      gradedCount,
      zeroScoreCount,
      excludedCount,
      totalAssignmentsCount: nonEventAssignments.length,
      applyAssignmentGroupWeights: applyWeightsFlag,
      weightedPercentage,
      groups: groupRows,
    },
    coverage,
    gradedAssignments: gradedAuditRows,
    assignments: auditRows,
    steps,
    anomalies,
    rawPayloads: {
      enrollment: primaryEnrollment || null,
      allEnrollments: enrollmentsList,
      courseMeta: liveDiagnostics?.courseRaw || courseData.course,
      assignmentGroups: assignmentGroups,
      gradedAssignments: gradedAuditRows.map((r) => r.rawAssignment),
      ungradedOrExcludedAssignments: ungradedOrExcludedAuditRows.map((r) => r.rawAssignment),
    },
  };
};
