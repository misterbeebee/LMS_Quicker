import { isOk } from '@velm/shared';
import { CanvasHttpClient } from '../canvas/client.js';
import type { HttpTransport, Logger } from '../ports.js';
import { noopLogger } from '../ports.js';
import { SynergyService } from '../synergy/service.js';
import { sanitizeMockDatastore, type SanitizeMockOptions } from './sanitize.js';
import type { VelmMockCanvasStore, VelmMockDatastoreV1, VelmMockSynergyStore } from './schema.js';

export interface DownloadAccountDatastoreOptions {
  readonly transport: HttpTransport;
  readonly canvas?: {
    readonly domain: string;
    readonly token: string;
  };
  readonly synergy?: {
    readonly domain: string;
    readonly username: string;
    readonly password: string;
    readonly isParent?: boolean;
  };
  /**
   * Automatically scrub student names, emails, IDs, and school domains. Defaults to true.
   */
  readonly sanitize?: boolean;
  readonly sanitizeOptions?: SanitizeMockOptions;
  readonly logger?: Logger;
}

/**
 * One-time account data downloader derived from every Canvas REST and StudentVUE/ParentVUE
 * endpoint supported by Velm. Produces a self-contained VelmMockDatastoreV1 JSON snapshot.
 */
export async function downloadAccountDatastore(
  options: DownloadAccountDatastoreOptions
): Promise<VelmMockDatastoreV1> {
  const logger = options.logger ?? noopLogger;
  const scrapeErrors: Record<string, string> = {};
  let canvasStore: VelmMockCanvasStore | undefined;
  let synergyStore: VelmMockSynergyStore | undefined;

  if (options.canvas) {
    const cleanDomain = options.canvas.domain
      .trim()
      .replace(/^https?:\/\//i, '')
      .replace(/\/+$/, '');
    const client = new CanvasHttpClient({
      domain: cleanDomain,
      token: options.canvas.token.trim(),
      transport: options.transport,
    });

    logger.info(`[MockDownloader] Scraping Canvas REST endpoints from ${cleanDomain}...`);

    const selfRes = await client.requestJson<Record<string, unknown>>('/api/v1/users/self');
    const self = isOk(selfRes) ? selfRes.data.data : null;
    if (!isOk(selfRes)) scrapeErrors['canvas.self'] = selfRes.error.message;

    const profileRes = await client.requestJson<Record<string, unknown>>('/api/v1/users/self/profile');
    const profile = isOk(profileRes) ? profileRes.data.data : null;
    if (!isOk(profileRes)) scrapeErrors['canvas.profile'] = profileRes.error.message;

    const coursesRes = await client.requestPaginated<Record<string, unknown>>(
      '/api/v1/courses?enrollment_state=active&include[]=term&include[]=favorites&per_page=100'
    );
    const courses = isOk(coursesRes) ? coursesRes.data : [];
    if (!isOk(coursesRes)) scrapeErrors['canvas.courses'] = coursesRes.error.message;

    const nicknamesRes = await client.requestPaginated<Record<string, unknown>>(
      '/api/v1/users/self/course_nicknames?per_page=100'
    );
    const courseNicknames = isOk(nicknamesRes) ? nicknamesRes.data : [];
    if (!isOk(nicknamesRes)) scrapeErrors['canvas.courseNicknames'] = nicknamesRes.error.message;

    const todoRes = await client.requestJson<Array<Record<string, unknown>>>('/api/v1/users/self/todo');
    const todo = isOk(todoRes) && Array.isArray(todoRes.data.data) ? todoRes.data.data : [];
    if (!isOk(todoRes)) scrapeErrors['canvas.todo'] = todoRes.error.message;

    const upcomingRes = await client.requestJson<Array<Record<string, unknown>>>(
      '/api/v1/users/self/upcoming_events?per_page=100'
    );
    const upcomingEvents =
      isOk(upcomingRes) && Array.isArray(upcomingRes.data.data) ? upcomingRes.data.data : [];
    if (!isOk(upcomingRes)) scrapeErrors['canvas.upcomingEvents'] = upcomingRes.error.message;

    const courseDetailsById: Record<string, Record<string, unknown>> = {};
    const enrollmentsByCourseId: Record<string, Array<Record<string, unknown>>> = {};
    const assignmentsByCourseId: Record<string, Array<Record<string, unknown>>> = {};
    const assignmentGroupsByCourseId: Record<string, Array<Record<string, unknown>>> = {};
    const modulesByCourseId: Record<string, Array<Record<string, unknown>>> = {};

    const courseIds: string[] = [];
    for (const course of courses) {
      const rawId = course['id'];
      if (rawId === undefined || rawId === null) continue;
      const cid = String(rawId);
      courseIds.push(cid);

      const [detailRes, enrollRes, assignRes, groupRes, modRes] = await Promise.all([
        client.requestJson<Record<string, unknown>>(
          `/api/v1/courses/${cid}?include[]=total_scores&include[]=current_grading_period_scores&include[]=term`
        ),
        client.requestPaginated<Record<string, unknown>>(
          `/api/v1/courses/${cid}/enrollments?user_id=self&include[]=total_scores&include[]=current_grading_period_scores&per_page=100`
        ),
        client.requestPaginated<Record<string, unknown>>(
          `/api/v1/courses/${cid}/assignments?include[]=submission&include[]=submission_comments&include[]=score_statistics&per_page=100`
        ),
        client.requestPaginated<Record<string, unknown>>(
          `/api/v1/courses/${cid}/assignment_groups?include[]=assignments&include[]=submission&per_page=100`
        ),
        client.requestPaginated<Record<string, unknown>>(
          `/api/v1/courses/${cid}/modules?include[]=items&per_page=100`
        ),
      ]);

      if (isOk(detailRes)) courseDetailsById[cid] = detailRes.data.data;
      else scrapeErrors[`canvas.course.${cid}.detail`] = detailRes.error.message;

      if (isOk(enrollRes)) enrollmentsByCourseId[cid] = enrollRes.data;
      else scrapeErrors[`canvas.course.${cid}.enrollments`] = enrollRes.error.message;

      if (isOk(assignRes)) assignmentsByCourseId[cid] = assignRes.data;
      else scrapeErrors[`canvas.course.${cid}.assignments`] = assignRes.error.message;

      if (isOk(groupRes)) assignmentGroupsByCourseId[cid] = groupRes.data;
      else scrapeErrors[`canvas.course.${cid}.assignment_groups`] = groupRes.error.message;

      if (isOk(modRes)) modulesByCourseId[cid] = modRes.data;
      else scrapeErrors[`canvas.course.${cid}.modules`] = modRes.error.message;
    }

    // Fetch course announcements (last 90 days) in batches of 10 context codes
    const announcements: Array<Record<string, unknown>> = [];
    const now = new Date();
    const start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const startStr = start.toISOString().slice(0, 10);
    const endStr = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    for (let i = 0; i < courseIds.length; i += 10) {
      const batch = courseIds.slice(i, i + 10);
      const ctxQuery = batch.map((id) => `context_codes[]=course_${id}`).join('&');
      const annRes = await client.requestPaginated<Record<string, unknown>>(
        `/api/v1/announcements?start_date=${startStr}&end_date=${endStr}&active_only=true&latest_only=false&per_page=100&${ctxQuery}`
      );
      if (isOk(annRes)) {
        announcements.push(...annRes.data);
      } else {
        scrapeErrors[`canvas.announcements.${i}`] = annRes.error.message;
      }
    }

    canvasStore = {
      domain: cleanDomain,
      self,
      profile,
      courses,
      courseNicknames,
      todo,
      upcomingEvents,
      announcements,
      courseDetailsById,
      enrollmentsByCourseId,
      assignmentsByCourseId,
      assignmentGroupsByCourseId,
      modulesByCourseId,
    };
  }

  if (options.synergy) {
    const cleanSynergyDomain = options.synergy.domain
      .trim()
      .replace(/^https?:\/\//i, '')
      .replace(/\/.*$/, '');
    logger.info(`[MockDownloader] Scraping Synergy endpoints from ${cleanSynergyDomain}...`);

    const svc = new SynergyService({
      username: options.synergy.username.trim(),
      password: options.synergy.password,
      districtDomain: cleanSynergyDomain,
      isParent: Boolean(options.synergy.isParent),
      transport: options.transport,
    });

    const expRes = await svc.exportAll();
    if (isOk(expRes)) {
      synergyStore = {
        domain: cleanSynergyDomain,
        isParent: Boolean(options.synergy.isParent),
        data: expRes.data.data,
        errors: expRes.data.errors,
      };
    } else {
      scrapeErrors['synergy.exportAll'] = expRes.error.message;
    }
  }

  const rawStore: VelmMockDatastoreV1 = {
    version: 1,
    recordedAt: new Date().toISOString(),
    sanitized: false,
    ...(canvasStore ? { canvas: canvasStore } : {}),
    ...(synergyStore ? { synergy: synergyStore } : {}),
    scrapeErrors,
  };

  if (options.sanitize === false) {
    return rawStore;
  }
  return sanitizeMockDatastore(rawStore, options.sanitizeOptions);
}
