import { StudentProfile, UserSettings } from '../types';
export type { StudentProfile };
import { logger } from './logger';
import { sanitizeCanvasDomain, sanitizeCanvasToken } from '../utils/canvasUrls';
import { sealProfileToken, unsealProfileToken } from './crypto';

const STUDENTS_STORAGE_KEY = 'canvas_student_profiles_v2';
const ACTIVE_STUDENT_KEY = 'canvas_active_student_id_v2';
const FEEDBACK_ACK_PREFIX = 'canvas_ack_feedback_v2_';
const DISMISSED_ANNOUNCEMENTS_PREFIX = 'velm_dismissed_announcements_v1_';
const WORKSPACE_SETTINGS_PREFIX = 'velm_workspace_settings_v1_';

const PALETTE = ['blue', 'emerald', 'purple', 'amber', 'rose', 'indigo'];

/**
 * Get all saved student profiles from localStorage
 */
export const getSavedStudents = (): StudentProfile[] => {
  try {
    const raw = localStorage.getItem(STUDENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((s: StudentProfile) => ({
      ...s,
      apiKey: unsealProfileToken(s.apiKey || ''),
    }));
  } catch (err: any) {
    logger.warn('Failed to parse student profiles from storage:', err.message);
    return [];
  }
};

/**
 * Persist student profiles list with sealed API tokens
 */
const persistStudents = (students: StudentProfile[]): void => {
  try {
    const sealed = students.map(s => ({
      ...s,
      apiKey: sealProfileToken(s.apiKey || ''),
    }));
    localStorage.setItem(STUDENTS_STORAGE_KEY, JSON.stringify(sealed));
  } catch (err: any) {
    logger.error('Failed to save student profiles to storage:', err.message);
  }
};

/**
 * Get the currently active student ID
 */
export const getActiveStudentId = (): string | null => {
  return localStorage.getItem(ACTIVE_STUDENT_KEY);
};

/**
 * Set the currently active student ID
 */
export const setActiveStudentId = (id: string): void => {
  localStorage.setItem(ACTIVE_STUDENT_KEY, id);
};

/**
 * Get the currently active StudentProfile, or null if none
 */
export const getActiveStudent = (): StudentProfile | null => {
  const students = getSavedStudents();
  if (students.length === 0) return null;
  const activeId = getActiveStudentId();
  if (!activeId) return students[0];
  return students.find(s => s.id === activeId) || students[0];
};

/**
 * Create and save a new student profile
 */
export const saveStudent = (
  student: Omit<StudentProfile, 'id' | 'createdAt'> & { id?: string }
): StudentProfile => {
  const students = getSavedStudents();
  const id = student.id || `student_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const color = student.color || PALETTE[students.length % PALETTE.length];
  
  const newProfile: StudentProfile = {
    ...student,
    domain: sanitizeCanvasDomain(student.domain) || student.domain.trim(),
    apiKey: sanitizeCanvasToken(student.apiKey),
    id,
    color,
    createdAt: new Date().toISOString(),
  };

  const updated = [...students, newProfile];
  persistStudents(updated);
  setActiveStudentId(id);
  logger.info(`Saved new student profile: ${newProfile.name} (${newProfile.domain})`);
  return newProfile;
};

/**
 * Update an existing student profile
 */
export const updateStudent = (profile: StudentProfile): void => {
  const students = getSavedStudents();
  const index = students.findIndex(s => s.id === profile.id);
  if (index >= 0) {
    students[index] = {
      ...profile,
      domain: sanitizeCanvasDomain(profile.domain) || profile.domain.trim(),
      apiKey: sanitizeCanvasToken(profile.apiKey),
    };
    persistStudents(students);
    logger.info(`Updated student profile: ${profile.name}`);
  }
};

/**
 * Update the display name of a student
 */
export const updateStudentName = (id: string, newName: string): StudentProfile | null => {
  const students = getSavedStudents();
  const index = students.findIndex(s => s.id === id);
  if (index >= 0 && newName.trim()) {
    students[index] = { ...students[index], name: newName.trim() };
    persistStudents(students);
    logger.info(`Renamed student profile ${id} to: ${newName}`);
    return students[index];
  }
  return null;
};

/**
 * Remove a student profile
 */
export const removeStudent = (id: string): void => {
  const students = getSavedStudents();
  const filtered = students.filter(s => s.id !== id);
  persistStudents(filtered);
  
  // Clean up feedback ack, dismissed announcement & workspace settings storage for that student
  try {
    localStorage.removeItem(`${FEEDBACK_ACK_PREFIX}${id}`);
    localStorage.removeItem(`${DISMISSED_ANNOUNCEMENTS_PREFIX}${id}`);
    localStorage.removeItem(`${WORKSPACE_SETTINGS_PREFIX}${id}`);
  } catch {
    // ignore
  }

  // If deleted student was active, point to first available
  const activeId = getActiveStudentId();
  if (activeId === id) {
    if (filtered.length > 0) {
      setActiveStudentId(filtered[0].id);
    } else {
      localStorage.removeItem(ACTIVE_STUDENT_KEY);
    }
  }
  logger.info(`Removed student profile ${id}`);
};

/**
 * Ensure at least one profile exists from current login credentials
 */
export const ensureProfileForLogin = (
  domain: string,
  apiKey: string,
  useProxy: boolean = true,
  batchSize: number = 2,
  suggestedName?: string
): StudentProfile => {
  const cleanDomain = sanitizeCanvasDomain(domain) || domain.trim();
  const cleanKey = sanitizeCanvasToken(apiKey);
  const students = getSavedStudents();
  const existing = students.find(
    s => sanitizeCanvasDomain(s.domain) === cleanDomain && sanitizeCanvasToken(s.apiKey) === cleanKey
  );
  if (existing) {
    setActiveStudentId(existing.id);
    return existing;
  }

  const name = suggestedName || `Student ${students.length + 1}`;
  return saveStudent({
    name,
    domain: cleanDomain,
    apiKey: cleanKey,
    useProxy,
    batchSize,
  });
};

/**
 * Get acknowledged feedback comment IDs for a student
 */
export const getAcknowledgedFeedback = (studentId?: string): Set<string | number> => {
  const key = `${FEEDBACK_ACK_PREFIX}${studentId || 'default'}`;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch (err: any) {
    logger.warn('Failed to parse acknowledged feedback:', err.message);
    return new Set();
  }
};

/**
 * Save acknowledged feedback comment IDs for a student
 */
export const saveAcknowledgedFeedback = (
  studentId: string | undefined,
  ids: Set<string | number>
): void => {
  const key = `${FEEDBACK_ACK_PREFIX}${studentId || 'default'}`;
  try {
    localStorage.setItem(key, JSON.stringify(Array.from(ids)));
  } catch (err: any) {
    logger.error('Failed to save acknowledged feedback:', err.message);
  }
};

/**
 * Toggle acknowledgment for a single comment ID
 */
export const toggleAcknowledgeFeedback = (
  studentId: string | undefined,
  commentId: string | number
): Set<string | number> => {
  const current = getAcknowledgedFeedback(studentId);
  if (current.has(commentId) || current.has(String(commentId))) {
    current.delete(commentId);
    current.delete(String(commentId));
  } else {
    current.add(commentId);
    current.add(String(commentId));
  }
  saveAcknowledgedFeedback(studentId, current);
  return new Set(current);
};

/**
 * Acknowledge all comments in an assignment
 */
export const acknowledgeAllComments = (
  studentId: string | undefined,
  commentIds: (string | number)[]
): Set<string | number> => {
  const current = getAcknowledgedFeedback(studentId);
  commentIds.forEach(id => {
    current.add(id);
    current.add(String(id));
  });
  saveAcknowledgedFeedback(studentId, current);
  return new Set(current);
};

/**
 * Get dismissed Canvas announcement IDs for a student
 */
export const getDismissedAnnouncements = (studentId?: string): Set<string | number> => {
  const key = `${DISMISSED_ANNOUNCEMENTS_PREFIX}${studentId || 'default'}`;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch (err: any) {
    logger.warn('Failed to parse dismissed announcements:', err.message);
    return new Set();
  }
};

/**
 * Save dismissed Canvas announcement IDs for a student
 */
export const saveDismissedAnnouncements = (
  studentId: string | undefined,
  ids: Set<string | number>
): void => {
  const key = `${DISMISSED_ANNOUNCEMENTS_PREFIX}${studentId || 'default'}`;
  try {
    localStorage.setItem(key, JSON.stringify(Array.from(ids)));
  } catch (err: any) {
    logger.error('Failed to save dismissed announcements:', err.message);
  }
};

/**
 * Persist dismissal of a single announcement ID for a student
 */
export const dismissAnnouncementLocal = (
  studentId: string | undefined,
  announcementId: string | number
): Set<string | number> => {
  const current = getDismissedAnnouncements(studentId);
  current.add(announcementId);
  current.add(String(announcementId));
  saveDismissedAnnouncements(studentId, current);
  return new Set(current);
};

/**
 * Get locally persisted workspace filter/view settings for a student
 */
export const getLocalWorkspaceSettings = (studentId?: string): UserSettings | null => {
  const key = `${WORKSPACE_SETTINGS_PREFIX}${studentId || 'default'}`;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as UserSettings) : null;
  } catch (err: any) {
    logger.warn('Failed to parse local workspace settings:', err.message);
    return null;
  }
};

/**
 * Persist workspace filter/view settings locally per student for immediate reload resilience
 */
export const saveLocalWorkspaceSettings = (
  studentId: string | undefined,
  settings: UserSettings
): void => {
  const key = `${WORKSPACE_SETTINGS_PREFIX}${studentId || 'default'}`;
  try {
    localStorage.setItem(key, JSON.stringify(settings));
  } catch (err: any) {
    logger.warn('Failed to save local workspace settings:', err.message);
  }
};
