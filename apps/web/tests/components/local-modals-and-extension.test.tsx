import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  createLocalBackend,
  createMemorySecretStore,
  type HttpHeaders,
  type HttpRequest,
  type HttpResponse,
  type HttpTransport,
} from '@velm/core';
import {
  getBackendMeta,
  getSavedLlmConfig,
  installLocalBackendFetchBridge,
  saveLlmConfig,
  setLocalBackend,
} from '../../services/backend';
import { LocalFirstRunModal } from '../../components/LocalFirstRunModal';
import { AiProviderSettingsModal } from '../../components/dashboard/AiProviderSettingsModal';
import { StudentSwitcher } from '../../components/dashboard/StudentSwitcher';
import { StudentVueVerifyModal } from '../../components/dashboard/StudentVueVerifyModal';
import { StudentVueGradeSyncModal } from '../../components/dashboard/StudentVueGradeSyncModal';
import { saveStudent } from '../../services/students';
import { saveLinkedStudentVueProfile } from '../../services/studentvue';

function makeHeaders(map: Record<string, string>): HttpHeaders {
  const lower = new Map<string, string>();
  for (const [k, v] of Object.entries(map)) {
    lower.set(k.toLowerCase(), v);
  }
  return {
    get: (name: string) => lower.get(name.toLowerCase()) ?? null,
    forEach: (cb) => {
      lower.forEach((v, k) => cb(v, k));
    },
  };
}

function makeMockTransport(
  handler: (req: HttpRequest) => HttpResponse | Promise<HttpResponse>
): HttpTransport {
  return {
    request: async (req) => handler(req),
  };
}

function jsonResponse(url: string, body: unknown, status = 200): HttpResponse {
  const text = JSON.stringify(body);
  return {
    status,
    ok: status >= 200 && status < 300,
    url,
    headers: makeHeaders({ 'content-type': 'application/json' }),
    text: async () => text,
    bytes: async () => new TextEncoder().encode(text),
  };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  setLocalBackend(null);
  saveLlmConfig(null);
  vi.restoreAllMocks();
});

describe('Local modals & Extension UI behavior (M2.2 / M3 / M4)', () => {
  it('renders LocalFirstRunModal only in local runtime and persists acknowledgement in localStorage', () => {
    // Hosted mode (no local backend) -> renders nothing
    const { unmount } = render(<LocalFirstRunModal />);
    expect(screen.queryByText(/Welcome to Velm \(Local Edition\)/i)).toBeNull();
    unmount();

    const backend = createLocalBackend({
      platform: 'desktop',
      version: '1.8.0-test',
      transport: makeMockTransport((req) => jsonResponse(req.url, {})),
      secretStore: createMemorySecretStore(),
    });
    setLocalBackend(backend);

    render(<LocalFirstRunModal />);
    expect(screen.getByText(/Welcome to Velm \(Local Edition\)/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /I Understand — Continue to Velm/i }));
    expect(localStorage.getItem('velm_local_first_run_ack_v1')).toBe('true');
    expect(screen.queryByText(/Welcome to Velm \(Local Edition\)/i)).toBeNull();
  });

  it('loads presets, discovers local servers, tests connection, and saves secret in AiProviderSettingsModal', async () => {
    const secretStore = createMemorySecretStore();
    const backend = createLocalBackend({
      platform: 'desktop',
      version: '1.8.0-test',
      transport: makeMockTransport((req) => {
        if (req.url.includes('/v1/models') || req.url.includes('/models')) {
          return jsonResponse(req.url, {
            data: [{ id: 'gpt-4o-mini' }],
            models: [{ name: 'models/gemini-2.5-flash' }],
          });
        }
        return jsonResponse(req.url, {}, 404);
      }),
      secretStore,
    });
    setLocalBackend(backend);

    const onClose = vi.fn();
    const onConfigSaved = vi.fn();
    render(
      <AiProviderSettingsModal isOpen={true} onClose={onClose} onConfigSaved={onConfigSaved} />
    );

    await waitFor(() => {
      expect(screen.getByText(/Ollama \(Local\)/i)).toBeTruthy();
    });

    // Switch to OpenAI (BYO Key) preset
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'openai' } });

    const apiKeyInput = screen.getByPlaceholderText(
      /Paste your API key/i
    ) as HTMLInputElement;
    fireEvent.change(apiKeyInput, { target: { value: 'sk-test-openai-999' } });

    // Click Test Connection
    fireEvent.click(screen.getByRole('button', { name: /Test Connection/i }));
    await waitFor(() => {
      expect(screen.getByText(/Connection successful!/i)).toBeTruthy();
    });

    // Click Save Provider
    fireEvent.click(screen.getByRole('button', { name: /Save Provider/i }));
    await waitFor(() => {
      expect(onConfigSaved).toHaveBeenCalled();
    });

    expect(await secretStore.get('llm:openai')).toBe('sk-test-openai-999');
    expect(getSavedLlmConfig()?.id).toBe('openai');
  });

  it('hides Add Another Student and shows single-student profile hint in extension runtime (D4)', async () => {
    saveStudent({
      name: 'Maya Lin',
      domain: 'canvas.example.edu',
      apiKey: 'tok_123',
    });

    const extBackend = createLocalBackend({
      platform: 'extension',
      version: '1.8.0-ext',
      transport: makeMockTransport((req) => jsonResponse(req.url, {})),
      secretStore: createMemorySecretStore(),
    });
    setLocalBackend(extBackend);
    await getBackendMeta();

    render(
      <StudentSwitcher
        currentDomain="canvas.example.edu"
        currentToken="tok_123"
        useProxy={true}
        onSelectStudent={() => {}}
      />
    );

    // Open StudentSwitcher dropdown
    fireEvent.click(screen.getByText('Maya Lin'));

    expect(screen.getByTestId('extension-single-student-hint')).toBeTruthy();
    expect(screen.queryByText(/Add Another Student/i)).toBeNull();
  });

  it('renders open-tab SSO reuse toggle in StudentVueVerifyModal & StudentVueGradeSyncModal and submits without password', async () => {
    const student = saveStudent({
      name: 'Maya Lin',
      domain: 'canvas.example.edu',
      apiKey: 'tok_123',
    });

    const extBackend = createLocalBackend({
      platform: 'extension',
      version: '1.8.0-ext',
      transport: makeMockTransport((req) => {
        if (req.url.includes('/api/v1/users/self/profile')) {
          return jsonResponse(req.url, {
            id: 42,
            name: 'Maya Lin',
            primary_email: 'maya@school.edu',
            sis_user_id: '55501',
          });
        }
        return jsonResponse(req.url, {}, 404);
      }),
      secretStore: createMemorySecretStore(),
    });

    const getStudentInfoSpy = vi.spyOn(extBackend.synergy, 'getStudentInfo').mockResolvedValue({
      ok: true,
      data: {
        StudentInfo: {
          FormattedName: 'Maya Lin',
          PermID: '55501',
          EMail: 'maya@school.edu',
        },
      },
    });
    const getGradebookSpy = vi.spyOn(extBackend.synergy, 'getGradebook').mockResolvedValue({
      ok: true,
      data: {
        Gradebook: {
          ReportingPeriod: { '@GradePeriod': 'Quarter 2' },
          Courses: {
            Course: {
              '@Period': '1',
              '@Title': 'AP Calculus',
              Marks: {
                Mark: {
                  '@MarkName': 'Quarter 2',
                  '@CalculatedScoreString': 'A',
                  '@CalculatedScoreRaw': '96.0',
                },
              },
            },
          },
        },
      },
    });

    installLocalBackendFetchBridge(extBackend);
    await getBackendMeta();

    const onVerified = vi.fn();
    const { unmount } = render(
      <StudentVueVerifyModal
        isOpen={true}
        onClose={() => {}}
        studentId={student.id}
        studentName={student.name}
        canvasDomain="canvas.example.edu"
        canvasToken="tok_123"
        useProxy={true}
        onVerified={onVerified}
      />
    );

    const verifyReuseLabel = screen.getByTestId('verify-reuse-session-toggle');
    const verifyCheckbox = verifyReuseLabel.querySelector('input[type="checkbox"]') as HTMLInputElement;
    fireEvent.click(verifyCheckbox);
    expect(verifyCheckbox.checked).toBe(true);

    const districtInput = document.getElementById('synergy-endpoint-input') as HTMLInputElement;
    fireEvent.change(districtInput, { target: { value: 'sis.example.edu' } });

    fireEvent.click(screen.getByRole('button', { name: /Verify Account Match/i }));

    await waitFor(() => {
      expect(getStudentInfoSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          districtDomain: 'sis.example.edu',
          accountId: student.id,
          reuseExistingSession: true,
        })
      );
    });
    unmount();

    // Now test StudentVueGradeSyncModal with linked profile
    const linkedProfile = saveLinkedStudentVueProfile(student.id, {
      confirmedAt: '2026-01-15T12:00:00.000Z',
      apiServerUrl: 'local://synergy',
      districtDomain: 'sis.example.edu',
      isParent: false,
      studentName: 'Maya Lin',
      permId: '55501',
      confidence: 'high',
      matched: true,
    });

    const onSynced = vi.fn();
    render(
      <StudentVueGradeSyncModal
        isOpen={true}
        onClose={() => {}}
        studentId={student.id}
        linkedProfile={linkedProfile}
        currentSnapshot={null}
        onGradesSynced={onSynced}
      />
    );

    const syncReuseLabel = screen.getByTestId('gradesync-reuse-session-toggle');
    const syncCheckbox = syncReuseLabel.querySelector('input[type="checkbox"]') as HTMLInputElement;
    fireEvent.click(syncCheckbox);
    expect(syncCheckbox.checked).toBe(true);

    fireEvent.click(screen.getByTestId('submit-sync-official-grades'));

    await waitFor(() => {
      expect(getGradebookSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          districtDomain: 'sis.example.edu',
          accountId: student.id,
          reuseExistingSession: true,
        })
      );
    });
  });
});
