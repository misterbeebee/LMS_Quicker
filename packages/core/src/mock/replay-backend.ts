import { err, ok } from '@velm/shared';
import type { RawHttpProxyRequest, RawHttpProxyResponse, VelmBackend } from '../backend.js';
import { LLM_PROVIDER_PRESETS } from '../llm/presets.js';
import type { PlatformTarget } from '../llm/types.js';
import { createMemorySecretStore } from '../ports.js';
import type { VelmMockDatastoreV1 } from './schema.js';

export interface MockDatastoreBackendOptions {
  readonly version?: string;
  readonly platform?: PlatformTarget;
}

function jsonProxyResponse(url: string, body: unknown, status = 200): RawHttpProxyResponse {
  return {
    status,
    ok: status >= 200 && status < 300,
    url,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    text: JSON.stringify(body),
  };
}

/**
 * Create a 100% offline VelmBackend backed by a VelmMockDatastoreV1 JSON snapshot.
 * Replays every Canvas REST route, StudentVUE/ParentVUE method, and mock AI response
 * with zero network calls and zero live credentials.
 */
export function createMockDatastoreBackend(
  store: VelmMockDatastoreV1,
  options: MockDatastoreBackendOptions = {}
): VelmBackend {
  const version = options.version ?? '1.8.0-mock';
  const platform: PlatformTarget = options.platform ?? 'desktop';
  const secrets = createMemorySecretStore();
  const readAnnouncementIds = new Set<string>();

  async function handleCanvasHttp(req: RawHttpProxyRequest): Promise<RawHttpProxyResponse> {
    const canvas = store.canvas;
    if (!canvas) {
      return jsonProxyResponse(req.url, { error: 'Mock datastore does not contain Canvas data.' }, 404);
    }

    const parsed = new URL(req.url);
    const pathname = parsed.pathname.replace(/\/+$/, '');

    // 1. User identity endpoints
    if (pathname === '/api/v1/users/self') {
      return canvas.self
        ? jsonProxyResponse(req.url, canvas.self)
        : jsonProxyResponse(req.url, { error: 'Not found' }, 404);
    }
    if (pathname === '/api/v1/users/self/profile') {
      return canvas.profile
        ? jsonProxyResponse(req.url, canvas.profile)
        : canvas.self
          ? jsonProxyResponse(req.url, canvas.self)
          : jsonProxyResponse(req.url, { error: 'Not found' }, 404);
    }
    if (pathname === '/api/v1/users/self/course_nicknames') {
      return jsonProxyResponse(req.url, canvas.courseNicknames);
    }
    if (pathname === '/api/v1/users/self/todo') {
      return jsonProxyResponse(req.url, canvas.todo);
    }
    if (pathname === '/api/v1/users/self/upcoming_events') {
      return jsonProxyResponse(req.url, canvas.upcomingEvents);
    }

    // 2. Courses list
    if (pathname === '/api/v1/courses') {
      return jsonProxyResponse(req.url, canvas.courses);
    }

    // 3. Announcements (supports context_codes[] filtering + read state tracking)
    if (pathname === '/api/v1/announcements') {
      const requestedCodes = parsed.searchParams.getAll('context_codes[]');
      const filtered = canvas.announcements
        .filter((ann) => {
          if (requestedCodes.length === 0) return true;
          const ctx = typeof ann['context_code'] === 'string' ? ann['context_code'] : '';
          return !ctx || requestedCodes.includes(ctx);
        })
        .map((ann) => {
          const idStr = ann['id'] !== undefined ? String(ann['id']) : '';
          if (idStr && readAnnouncementIds.has(idStr)) {
            return { ...ann, read_state: 'read' };
          }
          return ann;
        });
      return jsonProxyResponse(req.url, filtered);
    }

    // 4. Mark announcement read: PUT /api/v1/courses/:cid/discussion_topics/:tid/read
    const readMatch = pathname.match(/^\/api\/v1\/courses\/([^/]+)\/discussion_topics\/([^/]+)\/read$/);
    if (readMatch && req.method === 'PUT') {
      if (readMatch[2]) readAnnouncementIds.add(readMatch[2]);
      return { status: 204, ok: true, url: req.url, headers: {}, text: '' };
    }

    // 5. Course-scoped endpoints
    const courseMatch = pathname.match(/^\/api\/v1\/courses\/([^/]+)(?:\/(.*))?$/);
    if (courseMatch) {
      const courseId = courseMatch[1] ?? '';
      const sub = courseMatch[2] ?? '';

      if (!sub) {
        const detail =
          canvas.courseDetailsById[courseId] ??
          canvas.courses.find((c) => String(c['id']) === courseId);
        return detail
          ? jsonProxyResponse(req.url, detail)
          : jsonProxyResponse(req.url, { error: 'Course not found' }, 404);
      }

      if (sub === 'enrollments') {
        return jsonProxyResponse(req.url, canvas.enrollmentsByCourseId[courseId] ?? []);
      }

      if (sub === 'assignments') {
        return jsonProxyResponse(req.url, canvas.assignmentsByCourseId[courseId] ?? []);
      }

      const singleAssignMatch = sub.match(/^assignments\/([^/]+)$/);
      if (singleAssignMatch) {
        const assignId = singleAssignMatch[1] ?? '';
        const found = (canvas.assignmentsByCourseId[courseId] ?? []).find(
          (a) => String(a['id']) === assignId
        );
        return found
          ? jsonProxyResponse(req.url, found)
          : jsonProxyResponse(req.url, { error: 'Assignment not found' }, 404);
      }

      if (sub === 'assignment_groups') {
        return jsonProxyResponse(req.url, canvas.assignmentGroupsByCourseId[courseId] ?? []);
      }

      if (sub === 'modules') {
        return jsonProxyResponse(req.url, canvas.modulesByCourseId[courseId] ?? []);
      }
    }

    return jsonProxyResponse(req.url, { error: `Mock route not implemented: ${req.method} ${pathname}` }, 404);
  }

  return {
    async getMeta() {
      return {
        platform,
        version,
        multiStudentSupported: platform !== 'extension',
      };
    },

    httpRequest: handleCanvasHttp,

    synergy: {
      async verify() {
        const info = store.synergy?.data['student_info'];
        if (!info) {
          return err({
            code: 'SYNERGY_ERROR',
            message: 'Mock datastore does not contain Synergy student_info.',
            retryable: false,
          });
        }
        return ok(info);
      },

      async getStudentInfo() {
        const info = store.synergy?.data['student_info'];
        if (!info) {
          return err({
            code: 'SYNERGY_ERROR',
            message: 'Mock datastore does not contain Synergy student_info.',
            retryable: false,
          });
        }
        return ok(info);
      },

      async getGradebook() {
        const gb = store.synergy?.data['gradebook'];
        if (!gb) {
          return err({
            code: 'SYNERGY_ERROR',
            message: 'Mock datastore does not contain Synergy gradebook.',
            retryable: false,
          });
        }
        return ok(gb);
      },

      async exportAll() {
        if (!store.synergy) {
          return err({
            code: 'SYNERGY_ERROR',
            message: 'Mock datastore does not contain Synergy data.',
            retryable: false,
          });
        }
        return ok({
          data: store.synergy.data,
          errors: store.synergy.errors,
        });
      },
    },

    llm: {
      async listPresets() {
        return LLM_PROVIDER_PRESETS.filter(
          (p) => !p.disabledByDefault && p.platforms.includes(platform)
        );
      },
      async discoverLocal() {
        return [
          {
            presetId: 'ollama',
            label: 'Ollama (Mock Local)',
            baseUrl: 'http://127.0.0.1:11434/v1',
            models: ['llama3.2', 'qwen2.5:7b'],
          },
        ];
      },
      async test(config) {
        return ok({ models: [config.model || 'mock-model'] });
      },
      async generate(config) {
        const courseCount = store.canvas?.courses.length ?? 0;
        return ok({
          text: `<div><h3>Mock AI Academic Brief (${config.label})</h3><p>Analyzed <strong>${courseCount}</strong> courses from your offline mock datastore. Everything is running locally with zero live API calls.</p></div>`,
          modelUsed: config.model,
          providerId: config.id,
          privacy: config.privacy,
          redactedCount: 0,
        });
      },
    },

    secrets: {
      async set(key, value) {
        await secrets.set(key, value);
      },
      async has(key) {
        return (await secrets.get(key)) !== null;
      },
      async del(key) {
        await secrets.del(key);
      },
    },
  };
}
