

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { CourseData, ALL_COURSES_ID, SortConfig, UserSettings, FilterMode, CanvasTodoItem, CanvasAssignment, CanvasCalendarEvent, CanvasAnnouncement, StudentProfile } from '../types';
import { analyzeWorkload } from '../services/gemini';
import { saveFileToCanvas, listSaveStates, downloadRawFile, fetchTodoItems, dismissTodoItem, deleteFileFromCanvas, fetchCalendarEvents, getCourseIdFromEvent, SAVES_FOLDER, getMockCalendarEvents, fetchAnnouncements, dismissAnnouncement, getMockAnnouncements, getCourseIdFromAnnouncement } from '../services/canvas';
import { getAcknowledgedFeedback, toggleAcknowledgeFeedback, acknowledgeAllComments, getDismissedAnnouncements, saveDismissedAnnouncements, dismissAnnouncementLocal, getLocalWorkspaceSettings, saveLocalWorkspaceSettings } from '../services/students';
import { pruneCourseTitle } from '../utils/courseAbbreviations';
import { isAnnouncementObsolete, isAssignmentObsolete, isAssignmentSubmitted, isPastCalendarEvent, isCourseInPastTerm } from '../utils/dashboard-helpers';
import { getCalendarEventWebUrl } from '../utils/canvasUrls';
import { Sidebar } from './dashboard/Sidebar';
import { Header } from './dashboard/Header';
import { AnalysisPanel } from './dashboard/AnalysisPanel';
import { Overview } from './dashboard/Overview';
import { CalendarEventsPanel, CalendarViewMode } from './dashboard/CalendarEventsPanel';
import { AssignmentsTable } from './dashboard/AssignmentsTable';
import { AssignmentsBoard } from './dashboard/AssignmentsBoard';
import { ModulesList } from './dashboard/ModulesList';
import { NotesPanel } from './dashboard/NotesPanel';
import { SaveLoadModal } from './dashboard/SaveLoadModal';
import { SaveDialog } from './dashboard/SaveDialog';
import { GradeThresholdModal } from './dashboard/GradeThresholdModal';
import { CourseGradeInspectorModal } from './dashboard/CourseGradeInspectorModal';
import { MobileControlsDrawer } from './dashboard/MobileControlsDrawer';
import { InteractiveTutorialModal, TutorialId } from './dashboard/InteractiveTutorialModal';
import { GradeScaleConfig, DEFAULT_GRADE_CONFIG, getSavedGradeConfig, saveGradeConfig, getGradeStyle } from '../services/gradeScale';
import { getEffectiveCourseGrade } from '../utils/gradeInspector';
import { logger } from '../services/logger';
import { Loader2, Check, AlertCircle, AlertTriangle, BookOpen, Layers, X, Database } from 'lucide-react';
import { ErrorBoundary } from './ErrorBoundary';
import { 
  getCourseCustomizations, 
  saveCourseCustomization, 
  saveCourseCustomizationsBulk,
  getSavedCourseOrder, 
  saveCourseOrder, 
  CourseCustomization 
} from '../services/courseCustomization';

interface DashboardProps {
  data: CourseData[];
  apiKey: string;
  canvasUrl: string;
  useProxy: boolean;
  onLogout: () => void;
  onDebug: () => void;
  currentStudentId?: string;
  currentStudentName?: string;
  onSwitchStudent?: (student: StudentProfile) => void;
  onRenameStudent?: (newName: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ 
  data, 
  apiKey, 
  canvasUrl, 
  useProxy, 
  onLogout, 
  onDebug,
  currentStudentId,
  currentStudentName,
  onSwitchStudent,
  onRenameStudent
}) => {
  // Course Customization & Drag Ordering State
  const [courseCustomizations, setCourseCustomizations] = useState<Record<number, CourseCustomization>>(() => 
    getCourseCustomizations(currentStudentId)
  );
  const [courseOrder, setCourseOrder] = useState<number[]>(() => 
    getSavedCourseOrder(currentStudentId)
  );

  useEffect(() => {
    setCourseCustomizations(getCourseCustomizations(currentStudentId));
    setCourseOrder(getSavedCourseOrder(currentStudentId));
  }, [currentStudentId]);

  const handleSaveCustomization = (courseId: number, custom: CourseCustomization) => {
    const updated = saveCourseCustomization(courseId, custom, currentStudentId);
    setCourseCustomizations(updated);
  };

  const handleUpdateCourseOrder = (newOrder: number[]) => {
    setCourseOrder(newOrder);
    saveCourseOrder(newOrder, currentStudentId);
  };

  // State
  const [showHiddenCourses, setShowHiddenCourses] = useState(false);
  const [showIds, setShowIds] = useState(false);
  
  // Refactored to "Show" Logic (Defaults to false = Hidden)
  const [showSubmitted, setShowSubmitted] = useState(false); // Renamed from showCompleted
  const [showObsolete, setShowObsolete] = useState(false);
  const [showPastTerms, setShowPastTerms] = useState(false);
  
  // New: Show Scores & Class Averages
  const [showScores, setShowScores] = useState(true);
  const [showClassAverages, setShowClassAverages] = useState(false);
  
  // Calendar Events & Positive Filter State (All optional filters default false = Hidden)
  const [showCalendarEvents, setShowCalendarEvents] = useState(true);
  const [showPastEvents, setShowPastEvents] = useState(false);
  const [calendarViewMode, setCalendarViewMode] = useState<CalendarViewMode>('agenda');
  const [calendarEvents, setCalendarEvents] = useState<CanvasCalendarEvent[]>(() => {
    const isDemo = !canvasUrl || canvasUrl === 'DEMO' || !apiKey || apiKey === 'DEMO' || apiKey.toLowerCase().startsWith('demo');
    return isDemo ? getMockCalendarEvents() : [];
  });
  
  // Renamed from showManuallyHidden
  const [showArchived, setShowArchived] = useState(false); 
  // Renamed from hiddenAssignmentIds
  const [archivedAssignmentIds, setArchivedAssignmentIds] = useState<Set<number>>(new Set()); 
  
  // New: Manually Marked as Submitted
  const [markedAsSubmittedIds, setMarkedAsSubmittedIds] = useState<Set<number>>(new Set());

  // Snapshot of visibleCourseIds before entering single-course focus via "Only",
  // so tapping "Only" again cleanly restores multi-class visibility.
  const preOnlyVisibleCourseIdsRef = useRef<Set<number> | null>(null);

  // Feedback Tracking & Acknowledgment State
  const [acknowledgedFeedbackIds, setAcknowledgedFeedbackIds] = useState<Set<string | number>>(() => {
    return getAcknowledgedFeedback(currentStudentId);
  });
  const [filterFeedbackOnly, setFilterFeedbackOnly] = useState(false);

  useEffect(() => {
    setAcknowledgedFeedbackIds(getAcknowledgedFeedback(currentStudentId));
  }, [currentStudentId]);

  const handleToggleAcknowledgeComment = useCallback((commentId: string | number) => {
    const next = toggleAcknowledgeFeedback(currentStudentId, commentId);
    setAcknowledgedFeedbackIds(next);
  }, [currentStudentId]);

  const handleAcknowledgeAllComments = useCallback((commentIds: (string | number)[]) => {
    const next = acknowledgeAllComments(currentStudentId, commentIds);
    setAcknowledgedFeedbackIds(next);
  }, [currentStudentId]);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(ALL_COURSES_ID);
  
  // Multi-class view visibility state (check active terms first so past-only favorites don't hide active classes)
  const [visibleCourseIds, setVisibleCourseIds] = useState<Set<number>>(() => {
    const activePool = data.filter(c => !isCourseInPastTerm(c.course));
    const pool = activePool.length > 0 ? activePool : data;
    const hasFavorites = pool.some(c => c.course.is_favorite);
    const initial = data.filter(c => (hasFavorites ? c.course.is_favorite : true));
    return new Set(initial.map(c => c.course.id));
  });
  const hasInitializedVisibleCourses = useRef(false);

  useEffect(() => {
    if (data.length > 0 && !hasInitializedVisibleCourses.current) {
      hasInitializedVisibleCourses.current = true;
      setVisibleCourseIds(prev => {
        if (prev.size > 0) return prev;
        const activePool = data.filter(c => showPastTerms || !isCourseInPastTerm(c.course));
        const pool = activePool.length > 0 ? activePool : data;
        const hasFavorites = pool.some(c => c.course.is_favorite);
        const initial = data.filter(c => (showHiddenCourses ? true : (hasFavorites ? c.course.is_favorite : true)));
        return new Set(initial.map(c => c.course.id));
      });
    }
  }, [data, showHiddenCourses, showPastTerms]);

  const [expandedModules, setExpandedModules] = useState<Set<number>>(new Set());
  
  // Navigation State
  const [activeTab, setActiveTab] = useState<'overview' | 'assignments' | 'calendar' | 'modules'>('overview');
  const [assignmentsViewMode, setAssignmentsViewMode] = useState<'list' | 'board'>('list');

  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [isLoadModalOpen, setIsLoadModalOpen] = useState(false);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [isGradeModalOpen, setIsGradeModalOpen] = useState(false);
  const [inspectedCourseId, setInspectedCourseId] = useState<number | null>(null);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isMobileSettingsOpen, setIsMobileSettingsOpen] = useState(false);
  const [activeTutorialId, setActiveTutorialId] = useState<TutorialId>('major_views');
  const [gradeConfig, setGradeConfig] = useState<GradeScaleConfig>(() => 
    getSavedGradeConfig(currentStudentId)
  );

  useEffect(() => {
    setGradeConfig(getSavedGradeConfig(currentStudentId));
  }, [currentStudentId]);
  
  // Table State
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [columnFilters, setColumnFilters] = useState<Record<string, Set<string>>>({});
  const [filterModes, setFilterModes] = useState<Record<string, FilterMode>>({});
  
  // AI Analysis State
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  // Todo & Announcements State
  const [todoItems, setTodoItems] = useState<CanvasTodoItem[]>([]);
  const [announcements, setAnnouncements] = useState<CanvasAnnouncement[]>(() => {
    const isDemo = !canvasUrl || canvasUrl === 'DEMO' || !apiKey || apiKey === 'DEMO' || apiKey.toLowerCase().startsWith('demo');
    return isDemo ? getMockAnnouncements() : [];
  });
  const [dismissedAnnouncementIds, setDismissedAnnouncementIds] = useState<Set<string | number>>(() =>
    getDismissedAnnouncements(currentStudentId)
  );

  useEffect(() => {
    setDismissedAnnouncementIds(getDismissedAnnouncements(currentStudentId));
  }, [currentStudentId]);

  // Persistence State
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [isRestoring, setIsRestoring] = useState(true); // Block background sync until initial hydration completes
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [conflictPrompt, setConflictPrompt] = useState<{ filename: string; content: string; showLoadingIndicator: boolean; serverTimestamp: string } | null>(null);
  const saveTimerRef = useRef<any>(null);
  const performSaveRef = useRef<((filename: string, showLoadingIndicator?: boolean, contentToSave?: string, forceOverwrite?: boolean) => Promise<void>) | null>(null);
  const settingsRef = useRef<UserSettings | null>(null); // For unload hook
  const dirtySettingsRef = useRef<boolean>(false);
  const skipNextAutosaveRef = useRef<boolean>(false);
  const REMOTE_AUTOSAVE_DEBOUNCE_MS = 2500;
  const REMOTE_AUTOSAVE_MIN_INTERVAL_MS = 60_000;
  const lastRemoteSaveTimeRef = useRef<number>(0);
  const lastSyncedSignatureRef = useRef<string | null>(null);
  const hasSettledBaselineRef = useRef<boolean>(false);
  const pendingCloudSyncAfterRestoreRef = useRef<boolean>(false);
  const remoteSaveInFlightRef = useRef<boolean>(false);

  const getSettingsSignature = (settings: UserSettings): string => {
    const { timestamp: _ignored, ...rest } = settings;
    return JSON.stringify(rest);
  };

  // Conflict Detection State
  const [lastSyncedTime, setLastSyncedTime] = useState<number>(0);
  const lastSyncedTimeRef = useRef<number>(0);

  // Helper to apply settings object to state
  const applySettings = (settings: UserSettings) => {
      if (settings.viewPreferences) {
          setShowHiddenCourses(Boolean(settings.viewPreferences.showHiddenCourses));
          setShowIds(Boolean(settings.viewPreferences.showIds));
          
          // Migration Logic for Show/Hide Preferences
          if (settings.viewPreferences.showSubmitted !== undefined) {
              setShowSubmitted(settings.viewPreferences.showSubmitted);
          } else if (settings.viewPreferences.showCompleted !== undefined) {
              setShowSubmitted(settings.viewPreferences.showCompleted);
          } else if (settings.viewPreferences.hideSubmittedGraded !== undefined) {
              setShowSubmitted(!settings.viewPreferences.hideSubmittedGraded);
          } else {
              setShowSubmitted(false);
          }

          if (settings.viewPreferences.showObsolete !== undefined) {
              setShowObsolete(settings.viewPreferences.showObsolete);
          } else if (settings.viewPreferences.hideObsolete !== undefined) {
              setShowObsolete(!settings.viewPreferences.hideObsolete);
          } else {
              setShowObsolete(false);
          }

          if (settings.viewPreferences.showPastTerms !== undefined) {
              setShowPastTerms(settings.viewPreferences.showPastTerms);
          } else if (settings.viewPreferences.hidePreviousQuarters !== undefined) {
              setShowPastTerms(!settings.viewPreferences.hidePreviousQuarters);
          } else {
              setShowPastTerms(false);
          }
          
          if (settings.viewPreferences.showScores !== undefined) {
              setShowScores(settings.viewPreferences.showScores);
          }
          if (settings.viewPreferences.showClassAverages !== undefined) {
              setShowClassAverages(settings.viewPreferences.showClassAverages);
          }

          if (settings.viewPreferences.calendarEventsV2 !== undefined) {
              setShowCalendarEvents(settings.viewPreferences.calendarEventsV2);
          } else {
              // Default to true for all existing users migrating from older save schemas
              setShowCalendarEvents(true);
          }

          if (settings.viewPreferences.showPastEvents !== undefined) {
              setShowPastEvents(settings.viewPreferences.showPastEvents);
          } else if (settings.viewPreferences.hidePastEvents !== undefined) {
              setShowPastEvents(!settings.viewPreferences.hidePastEvents);
          } else {
              setShowPastEvents(false);
          }

          if (settings.viewPreferences.calendarViewMode) {
              setCalendarViewMode(settings.viewPreferences.calendarViewMode);
          }

          if (settings.viewPreferences.filterFeedbackOnly !== undefined) {
              setFilterFeedbackOnly(settings.viewPreferences.filterFeedbackOnly);
          }
          
          // Legacy support: Check for new field name, fallback to old 'showManuallyHidden'
          setShowArchived(settings.viewPreferences.showArchived ?? settings.viewPreferences.showManuallyHidden ?? false);
          
          // Legacy support: Check for new field, fallback to old 'hiddenAssignmentIds'
          if (settings.viewPreferences.archivedAssignmentIds) {
             setArchivedAssignmentIds(new Set(settings.viewPreferences.archivedAssignmentIds));
          } else if (settings.viewPreferences.hiddenAssignmentIds) {
             setArchivedAssignmentIds(new Set(settings.viewPreferences.hiddenAssignmentIds));
          } else {
             setArchivedAssignmentIds(new Set());
          }

          if (settings.viewPreferences.markedAsSubmittedIds) {
             setMarkedAsSubmittedIds(new Set(settings.viewPreferences.markedAsSubmittedIds));
          } else {
             setMarkedAsSubmittedIds(new Set());
          }

          if (Array.isArray(settings.viewPreferences.dismissedAnnouncementIds)) {
             const restoredDismissed = new Set(settings.viewPreferences.dismissedAnnouncementIds);
             setDismissedAnnouncementIds(restoredDismissed);
             saveDismissedAnnouncements(currentStudentId, restoredDismissed);
          }

          const rawTab = settings.viewPreferences.activeTab as string;
          const targetTab = rawTab === 'canvas_todo' ? 'assignments' : rawTab;
          if (targetTab === 'overview' || targetTab === 'assignments' || targetTab === 'calendar' || targetTab === 'modules') {
            setActiveTab(targetTab);
          }
          if (settings.viewPreferences.assignmentsViewMode) {
              setAssignmentsViewMode(settings.viewPreferences.assignmentsViewMode);
          }
          if (settings.viewPreferences.isSidebarCollapsed !== undefined) {
              setIsSidebarCollapsed(settings.viewPreferences.isSidebarCollapsed);
          }
      }

      if (settings.context) {
        if (settings.context.selectedCourseId !== null) {
          if (settings.context.selectedCourseId === ALL_COURSES_ID || data.some(c => c.course.id === settings.context.selectedCourseId)) {
              setSelectedCourseId(settings.context.selectedCourseId);
          }
        }
        if (settings.context.visibleCourseIds && Array.isArray(settings.context.visibleCourseIds)) {
          hasInitializedVisibleCourses.current = true;
          setVisibleCourseIds(new Set(settings.context.visibleCourseIds));
        }
      }

      if (settings.tableState) {
          setSortConfig(settings.tableState.sortConfig);
          
          const filters: Record<string, Set<string>> = {};
          Object.entries(settings.tableState.columnFilters || {}).forEach(([k, v]) => {
              filters[k] = new Set(v);
          });
          setColumnFilters(filters);

          if (settings.tableState.filterModes) {
              setFilterModes(settings.tableState.filterModes);
          }
      }

      // Restore and synchronize course customizations across devices
      if (settings.courseCustomizations && typeof settings.courseCustomizations === 'object') {
        const mergedCustomizations = saveCourseCustomizationsBulk(settings.courseCustomizations, currentStudentId);
        setCourseCustomizations(mergedCustomizations);
      }

      // Restore and synchronize course drag ordering across devices
      if (settings.courseOrder && Array.isArray(settings.courseOrder)) {
        saveCourseOrder(settings.courseOrder, currentStudentId);
        setCourseOrder(settings.courseOrder);
      }

      // Restore and synchronize custom grade threshold scale across devices
      if (settings.gradeScaleConfig && typeof settings.gradeScaleConfig === 'object') {
        const mergedGradeConfig = saveGradeConfig(settings.gradeScaleConfig, currentStudentId);
        setGradeConfig(mergedGradeConfig);
      }
  };

  // Fetch Todo Items
  useEffect(() => {
     const isDemo = !canvasUrl || canvasUrl === 'DEMO' || !apiKey || apiKey === 'DEMO' || apiKey.toLowerCase().startsWith('demo');
     if (isDemo) {
       setTodoItems([]);
       return;
     }
     const loadTodos = async () => {
         const items = await fetchTodoItems(canvasUrl, apiKey, useProxy);
         setTodoItems(items);
     };
     loadTodos();
  }, [canvasUrl, apiKey, useProxy]);

  // Fetch Calendar Events (Future & Recent Past)
  const [loadingCalendarEvents, setLoadingCalendarEvents] = useState(false);

  const refreshCalendarEvents = useCallback(async () => {
    const isDemo = !canvasUrl || canvasUrl === 'DEMO' || !apiKey || apiKey === 'DEMO' || apiKey.toLowerCase().startsWith('demo');
    if (!isDemo && (!canvasUrl || !apiKey)) return;
    setLoadingCalendarEvents(true);
    try {
      const courseIds = data.map(d => d.course.id).filter(id => id > 0);
      const events = await fetchCalendarEvents(canvasUrl, apiKey, useProxy, courseIds);
      setCalendarEvents(events);
    } catch (err: any) {
      logger.warn("Failed to load calendar events", err);
    } finally {
      setLoadingCalendarEvents(false);
    }
  }, [canvasUrl, apiKey, useProxy, data]);

  useEffect(() => {
    refreshCalendarEvents();
  }, [refreshCalendarEvents]);

  const handleMarkTodoDone = async (item: CanvasTodoItem) => {
      const success = await dismissTodoItem(canvasUrl, apiKey, useProxy, item);
      if (success) {
          // Optimistically remove from list
          setTodoItems(prev => prev.filter(i => i !== item));
          logger.info("Item removed from todo list locally.");
      } else {
          setActionNotice("Could not dismiss this To-Do item via Canvas API.");
          setTimeout(() => setActionNotice(null), 4000);
      }
  };

  // Fetch Canvas Announcements for loaded courses (or serve mock announcements in Demo mode)
  const courseIdsKey = useMemo(
    () => data.map(d => d.course.id).filter(id => id > 0).join(','),
    [data]
  );

  useEffect(() => {
    const isDemo = !canvasUrl || canvasUrl === 'DEMO' || !apiKey || apiKey === 'DEMO' || apiKey.toLowerCase().startsWith('demo');
    if (isDemo) {
      setAnnouncements(getMockAnnouncements());
      return;
    }
    if (!courseIdsKey) {
      setAnnouncements([]);
      return;
    }
    let cancelled = false;
    const courseIds = courseIdsKey.split(',').map(Number).filter(id => id > 0);
    fetchAnnouncements(canvasUrl, apiKey, useProxy, courseIds)
      .then(items => {
        if (!cancelled) setAnnouncements(items);
      })
      .catch(err => {
        logger.warn("Failed to load announcements", err?.message || err);
      });
    return () => {
      cancelled = true;
    };
  }, [canvasUrl, apiKey, useProxy, courseIdsKey]);

  const handleDismissAnnouncement = useCallback(async (announcement: CanvasAnnouncement) => {
    const nextDismissed = dismissAnnouncementLocal(currentStudentId, announcement.id);
    setDismissedAnnouncementIds(nextDismissed);
    await dismissAnnouncement(canvasUrl, apiKey, useProxy, announcement);
  }, [currentStudentId, canvasUrl, apiKey, useProxy]);

  const visibleAnnouncements = useMemo(() => {
    if (!announcements || announcements.length === 0) return [];

    let allowedCourseIds: Set<number>;
    if (selectedCourseId === ALL_COURSES_ID) {
      let relevantCourses = data.filter(c => showPastTerms || !isCourseInPastTerm(c.course));
      const hasFav = relevantCourses.some(c => c.course.is_favorite);
      relevantCourses = relevantCourses
        .filter(c => showHiddenCourses || !hasFav || c.course.is_favorite)
        .filter(c => visibleCourseIds.has(c.course.id));
      allowedCourseIds = new Set(relevantCourses.map(c => c.course.id));
    } else if (selectedCourseId && selectedCourseId > 0) {
      allowedCourseIds = new Set([selectedCourseId]);
    } else {
      allowedCourseIds = new Set();
    }

    const nowMs = Date.now();
    return announcements.filter(ann => {
      if (dismissedAnnouncementIds.has(ann.id) || dismissedAnnouncementIds.has(String(ann.id))) {
        return false;
      }
      if (!showObsolete && isAnnouncementObsolete(ann, nowMs)) {
        return false;
      }
      const cId = getCourseIdFromAnnouncement(ann);
      if (cId !== null) {
        return allowedCourseIds.has(cId);
      }
      return allowedCourseIds.size > 0;
    });
  }, [announcements, dismissedAnnouncementIds, selectedCourseId, data, showHiddenCourses, showPastTerms, visibleCourseIds, showObsolete]);

  // Smart Load on Mount (hydrates from newer of local student cache vs Canvas 'saves' folder)
  useEffect(() => {
    const isDemo = !canvasUrl || canvasUrl === 'DEMO' || !apiKey || apiKey === 'DEMO' || apiKey.toLowerCase().startsWith('demo');
    const localSettings = getLocalWorkspaceSettings(currentStudentId);

    if (isDemo) {
      if (localSettings) {
        skipNextAutosaveRef.current = true;
        applySettings(localSettings);
      }
      setIsRestoring(false);
      return;
    }

    let cancelled = false;
    const smartLoad = async () => {
      try {
        logger.info("Checking for saved state...");
        let files = await listSaveStates(canvasUrl, apiKey, useProxy, SAVES_FOLDER);
        if (!files || files.length === 0) {
          files = await listSaveStates(canvasUrl, apiKey, useProxy, '');
        }

        files.sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime());

        const fileToLoad = files.length > 0 ? files[0] : null;
        const fileTime = fileToLoad ? new Date(fileToLoad.updated_at || fileToLoad.created_at).getTime() : 0;
        if (fileToLoad) {
          logger.info(`Found save file: ${fileToLoad.filename} (${new Date(fileTime).toLocaleString()})`);
        }

        let cloudSettings: UserSettings | null = null;
        if (fileToLoad) {
          const content = await downloadRawFile(fileToLoad.url, apiKey, useProxy);
          if (content) {
            cloudSettings = JSON.parse(content) as UserSettings;
          }
        }

        if (cancelled) return;

        const cloudTs = cloudSettings ? (Date.parse(cloudSettings.timestamp || '') || fileTime) : 0;
        const localTs = localSettings ? (Date.parse(localSettings.timestamp || '') || 0) : 0;

        setLastSyncedTime(fileTime);
        lastSyncedTimeRef.current = fileTime;

        if (localSettings && (!cloudSettings || localTs > cloudTs)) {
          pendingCloudSyncAfterRestoreRef.current = true;
          dirtySettingsRef.current = true;
          applySettings(localSettings);
          logger.info("Applied newer local filter & view settings; queued single Canvas cloud sync.");
        } else if (cloudSettings) {
          pendingCloudSyncAfterRestoreRef.current = false;
          applySettings(cloudSettings);
          saveLocalWorkspaceSettings(currentStudentId, cloudSettings);
          logger.info("Cloud settings applied successfully.");
        } else {
          logger.info("No save states found in 'saves' folder.");
        }
      } catch (e) {
        logger.warn("Failed to load initial settings", e);
        if (!cancelled && localSettings) {
          pendingCloudSyncAfterRestoreRef.current = false;
          applySettings(localSettings);
        }
      } finally {
        if (!cancelled) setIsRestoring(false);
      }
    };

    smartLoad();
    return () => {
      cancelled = true;
    };
  }, []); 

  // Handle loading a specific file from Modal
  const handleLoadFileUrl = async (url: string, date: number) => {
      try {
          logger.info("Loading settings from file...");
          const content = await downloadRawFile(url, apiKey, useProxy);
          if (content) {
              const settings = JSON.parse(content) as UserSettings;
              skipNextAutosaveRef.current = true;
              applySettings(settings);
              saveLocalWorkspaceSettings(currentStudentId, settings);
              setLastSyncedTime(date);
              lastSyncedTimeRef.current = date;
              dirtySettingsRef.current = false;
              logger.info("Settings loaded and applied.");
          }
      } catch (e: any) {
          logger.error("Failed to load selected file", e.message);
      }
  };

  const handleExportSettingsJson = () => {
    try {
      const current = compileSettings();
      const blob = new Blob([JSON.stringify(current, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `canvas_dashboard_settings_${currentStudentId || 'profile'}_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      logger.error("Failed to export settings JSON", err?.message);
    }
  };

  // Reset view state when course changes; keep selected course active unless Show Past Terms is toggled off
  useEffect(() => {
    if (selectedCourseId === ALL_COURSES_ID) return;
    const exists = data.find(c => c.course.id === selectedCourseId);
    if (!exists && data.length > 0) {
       const favorite = data.find(c => c.course.is_favorite && (showPastTerms || !isCourseInPastTerm(c.course)));
       setSelectedCourseId(favorite ? favorite.course.id : ALL_COURSES_ID);
       return;
    }
    if (exists && !showPastTerms && isCourseInPastTerm(exists.course)) {
       const activePool = data.filter(c => !isCourseInPastTerm(c.course));
       if (activePool.length > 0) {
         setSelectedCourseId(ALL_COURSES_ID);
         const hasFav = activePool.some(c => c.course.is_favorite);
         const restored = activePool.filter(c => (showHiddenCourses || !hasFav || c.course.is_favorite));
         setVisibleCourseIds(new Set(restored.map(c => c.course.id)));
       }
    }
  }, [data, selectedCourseId, showPastTerms, showHiddenCourses]);

  const convertEventToAssignment = useCallback((ev: CanvasCalendarEvent): CanvasAssignment => {
    const extractedCourseId = getCourseIdFromEvent(ev);
    const courseId = extractedCourseId ?? ALL_COURSES_ID;

    const dueAt = ev.start_at || ev.end_at || (ev.all_day_date ? `${ev.all_day_date}T23:59:59Z` : null);
    const webUrl = getCalendarEventWebUrl(ev, canvasUrl) || '';

    return {
      id: -Math.abs(ev.id || 99999),
      name: ev.title || 'Untitled Event',
      description: ev.description || (ev.location_name ? `Location: ${ev.location_name}` : ''),
      due_at: dueAt,
      start_at: ev.start_at,
      end_at: ev.end_at,
      all_day_date: ev.all_day_date,
      context_code: ev.effective_context_code || ev.context_code,
      points_possible: 0,
      course_id: courseId,
      html_url: webUrl,
      submission_types: ['calendar_event'],
      locked_for_user: false,
      is_calendar_event: true,
      location_name: ev.location_name
    };
  }, [canvasUrl]);

  // Derived active courses (enforces showPastTerms and showHiddenCourses)
  const activeOverviewCourses = useMemo(() => {
    let courses = data;
    if (!showPastTerms) {
      courses = courses.filter(c => !isCourseInPastTerm(c.course));
    }
    const hasFavorites = courses.some(c => c.course.is_favorite);
    if (!showHiddenCourses && hasFavorites) {
      courses = courses.filter(c => c.course.is_favorite);
    }
    return courses;
  }, [data, showPastTerms, showHiddenCourses]);

  // Derived State: Selected Course Object with Injected Properties
  const selectedCourse = useMemo(() => {
    const injectProperties = (assignments: CanvasAssignment[]) => {
        return assignments.map(a => ({
            ...a,
            manual_marked_submitted: markedAsSubmittedIds.has(a.id)
        }));
    };

    if (selectedCourseId === ALL_COURSES_ID) {
         const totalActive = activeOverviewCourses.length;
         const relevantCourses = activeOverviewCourses.filter(c => visibleCourseIds.has(c.course.id));

         if (relevantCourses.length === 0) {
             return {
                 course: {
                     id: ALL_COURSES_ID,
                     name: "Multi-Class View (0 selected)",
                     course_code: "NONE",
                     is_favorite: true,
                     term: { id: 0, name: "Combined View" }
                 },
                 assignments: [],
                 modules: [],
                 enrollment: {
                    id: 0,
                    course_id: ALL_COURSES_ID,
                    type: 'Observer',
                    grades: { current_score: null, current_grade: null, final_score: null, final_grade: null }
                 }
             } as CourseData;
         }

         let allAssignments = relevantCourses.flatMap(c => c.assignments || []);
         const allModules = relevantCourses.flatMap(c => (c.modules || []).map(m => ({
           ...m,
           course_id: m.course_id || c.course.id
         })));

         // Merge calendar events if toggle is enabled
         if (showCalendarEvents && calendarEvents.length > 0) {
           const visibleIds = new Set(relevantCourses.map(c => c.course.id));
           const relevantEvents = calendarEvents.filter(ev => {
             if (!showPastEvents && isPastCalendarEvent(ev)) return false;
             const cId = getCourseIdFromEvent(ev);
             if (cId === null) return true; // Personal / User events show in Multi-Class view
             return visibleIds.has(cId);
           });
           allAssignments = [...allAssignments, ...relevantEvents.map(convertEventToAssignment)];
         }

         const displayName = relevantCourses.length === totalActive
           ? "All Courses"
           : `Multi-Class View (${relevantCourses.length} of ${totalActive} visible)`;
         
         return {
             course: {
                 id: ALL_COURSES_ID,
                 name: displayName,
                 course_code: `${relevantCourses.length} COURSES`,
                 is_favorite: true,
                 term: { id: 0, name: "Combined View" }
             },
             assignments: injectProperties(allAssignments),
             modules: allModules,
             enrollment: {
                id: 0,
                course_id: ALL_COURSES_ID,
                type: 'Observer',
                grades: { current_score: null, current_grade: null, final_score: null, final_grade: null }
             }
         } as CourseData;
    }
    
    const found = data.find(c => c.course.id === selectedCourseId);
    if (!found) return null;

    let courseAssignments = [...(found.assignments || [])];
    if (showCalendarEvents && calendarEvents.length > 0) {
      const courseEvents = calendarEvents.filter(ev => {
        if (!showPastEvents && isPastCalendarEvent(ev)) return false;
        const cId = getCourseIdFromEvent(ev);
        const isThisCourse = cId === selectedCourseId || ev.context_code === `course_${selectedCourseId}` || ev.effective_context_code === `course_${selectedCourseId}`;
        const isPersonalOrCampus = cId === null || ev.context_code === 'user_self';
        return isThisCourse || isPersonalOrCampus;
      });
      courseAssignments = [...courseAssignments, ...courseEvents.map(convertEventToAssignment)];
    }

    return {
        ...found,
        modules: (found.modules || []).map(m => ({ ...m, course_id: m.course_id || found.course.id })),
        assignments: injectProperties(courseAssignments)
    };
  }, [data, activeOverviewCourses, selectedCourseId, visibleCourseIds, markedAsSubmittedIds, showCalendarEvents, calendarEvents, showPastEvents, convertEventToAssignment]);

  // Reset view state when course changes
  useEffect(() => {
    setAiAnalysis(null);
    setExpandedModules(new Set());
  }, [selectedCourseId]);

  const calendarTabEvents = useMemo(() => {
    if (!calendarEvents || calendarEvents.length === 0) return [];
    const allowedIds =
      selectedCourseId === ALL_COURSES_ID
        ? new Set(activeOverviewCourses.filter(c => visibleCourseIds.has(c.course.id)).map(c => c.course.id))
        : new Set(selectedCourseId ? [selectedCourseId] : []);

    return calendarEvents
      .filter(ev => {
        if (!showPastEvents && isPastCalendarEvent(ev)) return false;
        const cId = getCourseIdFromEvent(ev);
        const isPersonalOrCampus = cId === null || ev.context_code === 'user_self';
        if (isPersonalOrCampus) return true;
        return allowedIds.has(cId);
      })
      .map(convertEventToAssignment);
  }, [calendarEvents, showPastEvents, selectedCourseId, activeOverviewCourses, visibleCourseIds, convertEventToAssignment]);

  const visibleCalendarEventsCount = useMemo(() => {
    if (selectedCourseId === ALL_COURSES_ID && visibleCourseIds.size === 0) return 0;
    return calendarTabEvents.length;
  }, [selectedCourseId, visibleCourseIds, calendarTabEvents]);

  const courseHeaderAssignmentCount = useMemo(() => {
    if (!selectedCourse) return 0;
    return selectedCourse.assignments.filter(a => {
      if (a.is_calendar_event) return false;
      if (!showArchived && archivedAssignmentIds.has(a.id)) return false;
      if (!showSubmitted && isAssignmentSubmitted(a)) return false;
      if (!showObsolete && isAssignmentObsolete(a)) return false;
      return true;
    }).length;
  }, [selectedCourse, showArchived, archivedAssignmentIds, showSubmitted, showObsolete]);

  // --- Persistence Logic ---

  const compileSettings = (): UserSettings => {
    const serializedFilters: Record<string, string[]> = {};
    Object.entries(columnFilters).forEach(([key, val]) => {
      // Fix: Cast val to Set<string> to ensure type compatibility with Array.from
      serializedFilters[key] = Array.from(val as Set<string>);
    });

    return {
      timestamp: new Date().toISOString(),
      viewPreferences: {
        showHiddenCourses,
        showSubmitted,
        showObsolete,
        showPastTerms,
        showScores,
        showClassAverages,
        showIds,
        showCalendarEvents,
        calendarEventsV2: showCalendarEvents,
        showPastEvents,
        calendarViewMode,
        filterFeedbackOnly,
        showArchived,
        archivedAssignmentIds: Array.from(archivedAssignmentIds),
        markedAsSubmittedIds: Array.from(markedAsSubmittedIds),
        dismissedAnnouncementIds: Array.from(dismissedAnnouncementIds),
        activeTab,
        assignmentsViewMode,
        isSidebarCollapsed
      },
      context: {
        selectedCourseId,
        visibleCourseIds: Array.from(visibleCourseIds)
      },
      tableState: {
        sortConfig,
        columnFilters: serializedFilters,
        filterModes
      },
      courseCustomizations,
      courseOrder,
      gradeScaleConfig: gradeConfig
    };
  };

  // Immediately cache per-student workspace settings locally AND batch/throttle remote Canvas syncs
  useEffect(() => {
      if (isRestoring) return;

      const settings = compileSettings();
      settingsRef.current = settings;
      const currentSig = getSettingsSignature(settings);

      // Establish baseline signature after initial hydration without triggering an unrequested cloud write
      if (!hasSettledBaselineRef.current) {
        hasSettledBaselineRef.current = true;
        if (!pendingCloudSyncAfterRestoreRef.current) {
          lastSyncedSignatureRef.current = currentSig;
          dirtySettingsRef.current = false;
          return;
        }
        pendingCloudSyncAfterRestoreRef.current = false;
        lastSyncedSignatureRef.current = null;
      }

      // Skip remote upload right after explicitly loading a cloud save snapshot
      if (skipNextAutosaveRef.current) {
        skipNextAutosaveRef.current = false;
        lastSyncedSignatureRef.current = currentSig;
        dirtySettingsRef.current = false;
        if (saveTimerRef.current) {
          clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;
        }
        return;
      }

      // 1. Always persist immediately in per-student localStorage (Demo & Live)
      saveLocalWorkspaceSettings(currentStudentId, settings);

      const isDemo = !canvasUrl || canvasUrl === 'DEMO' || !apiKey || apiKey === 'DEMO' || apiKey.toLowerCase().startsWith('demo');
      if (isDemo) {
        lastSyncedSignatureRef.current = currentSig;
        dirtySettingsRef.current = false;
        return;
      }

      // 2. Skip remote scheduling when workspace state matches the last synced cloud signature
      if (lastSyncedSignatureRef.current === currentSig) {
        dirtySettingsRef.current = false;
        if (saveTimerRef.current) {
          clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;
        }
        return;
      }

      dirtySettingsRef.current = true;

      // 3. Clear any existing pending remote push timer to coalesce bursts
      if (saveTimerRef.current) {
          clearTimeout(saveTimerRef.current);
      }

      // 4. Coalesce edits (2.5s idle) and enforce 60s minimum cooldown between background server pushes
      const now = Date.now();
      const elapsedSincePush = now - lastRemoteSaveTimeRef.current;
      const delayMs =
        lastRemoteSaveTimeRef.current === 0 || elapsedSincePush >= REMOTE_AUTOSAVE_MIN_INTERVAL_MS
          ? REMOTE_AUTOSAVE_DEBOUNCE_MS
          : Math.max(REMOTE_AUTOSAVE_DEBOUNCE_MS, REMOTE_AUTOSAVE_MIN_INTERVAL_MS - elapsedSincePush);

      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        const latestSettings = settingsRef.current || compileSettings();
        const latestSig = getSettingsSignature(latestSettings);
        if (lastSyncedSignatureRef.current === latestSig) {
          dirtySettingsRef.current = false;
          return;
        }
        logger.info("Syncing filter & workspace settings to Canvas saves folder...");
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        performSave(`auto_save_${timestamp}.json`, false, JSON.stringify(latestSettings, null, 2));
      }, delayMs);

      return () => {
          if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
          }
      };
  }, [
      showHiddenCourses,
      showSubmitted,
      showObsolete,
      showPastTerms,
      showScores,
      showClassAverages,
      showIds,
      showCalendarEvents,
      showPastEvents,
      calendarViewMode,
      filterFeedbackOnly,
      showArchived,
      archivedAssignmentIds,
      markedAsSubmittedIds,
      dismissedAnnouncementIds,
      activeTab,
      assignmentsViewMode,
      isSidebarCollapsed,
      selectedCourseId,
      visibleCourseIds,
      sortConfig,
      columnFilters,
      filterModes,
      isRestoring,
      courseCustomizations,
      courseOrder,
      gradeConfig,
      currentStudentId,
      canvasUrl,
      apiKey
  ]);

  // Unload Hook (only fires when live settings differ from last synced cloud state and payload fits keepalive 64KB limit)
  useEffect(() => {
      const handleBeforeUnload = () => {
          const isDemo = !canvasUrl || canvasUrl === 'DEMO' || !apiKey || apiKey === 'DEMO' || apiKey.toLowerCase().startsWith('demo');
          if (!isDemo && settingsRef.current && dirtySettingsRef.current) {
              saveLocalWorkspaceSettings(currentStudentId, settingsRef.current);
              const latestSig = getSettingsSignature(settingsRef.current);
              if (lastSyncedSignatureRef.current === latestSig) {
                return;
              }
              const content = JSON.stringify(settingsRef.current, null, 2);
              if (content.length < 60000) {
                const now = new Date();
                const timestamp = now.toISOString().replace(/[:.]/g, '-');
                saveFileToCanvas(canvasUrl, apiKey, `auto_save_${timestamp}.json`, content, useProxy, SAVES_FOLDER, true).catch(err => logger.warn("Auto save warning:", err?.message || err));
              }
          }
      };
      
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [canvasUrl, apiKey, useProxy, currentStudentId]);

  const performSave = async (
    filename: string,
    showLoadingIndicator: boolean = true,
    contentToSave?: string,
    forceOverwrite: boolean = false
  ) => {
    performSaveRef.current = performSave;
    const isDemo = !canvasUrl || canvasUrl === 'DEMO' || !apiKey || apiKey === 'DEMO' || apiKey.toLowerCase().startsWith('demo');
    const content = contentToSave || JSON.stringify(compileSettings(), null, 2);

    let saveSig: string | null = null;
    try {
      const parsedToCache = JSON.parse(content) as UserSettings;
      saveLocalWorkspaceSettings(currentStudentId, parsedToCache);
      saveSig = getSettingsSignature(parsedToCache);
    } catch {
      // ignore invalid JSON cache write
    }

    if (isDemo) {
      if (saveSig) lastSyncedSignatureRef.current = saveSig;
      dirtySettingsRef.current = false;
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 1500);
      return;
    }

    // Deduplicate background autosaves when nothing changed since the last synced snapshot
    if (!showLoadingIndicator && !forceOverwrite && saveSig && lastSyncedSignatureRef.current === saveSig) {
      dirtySettingsRef.current = false;
      return;
    }

    // Prevent overlapping background uploads from creating rapid sequential requests
    if (remoteSaveInFlightRef.current && !showLoadingIndicator) {
      return;
    }

    remoteSaveInFlightRef.current = true;
    lastRemoteSaveTimeRef.current = Date.now();
    if (showLoadingIndicator) setIsSaving(true);
    setSaveStatus('saving');
    
    try {
      // 1. Check for conflict with another session/device (tolerance avoids false self-conflicts on autosave)
      if (!forceOverwrite) {
        const currentFiles = await listSaveStates(canvasUrl, apiKey, useProxy, SAVES_FOLDER);
        if (currentFiles.length > 0) {
            currentFiles.sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime());
            const latestFile = currentFiles[0];
            const latestTime = new Date(latestFile.updated_at || latestFile.created_at).getTime();
            const syncedRefTime = lastSyncedTimeRef.current || lastSyncedTime;
            const conflictThresholdMs = showLoadingIndicator ? 5000 : 60000;

            if (syncedRefTime > 0 && latestTime > syncedRefTime + conflictThresholdMs) {
               setSaveStatus('idle');
               if (showLoadingIndicator) setIsSaving(false);
               setConflictPrompt({
                 filename,
                 content,
                 showLoadingIndicator,
                 serverTimestamp: new Date(latestTime).toLocaleString(),
               });
               return;
            }
        }
      }

      // Save to 'saves' subfolder
      await saveFileToCanvas(canvasUrl, apiKey, filename, content, useProxy, SAVES_FOLDER);

      // Update local sync watermark & synced signature immediately
      const immediateTime = Date.now();
      lastSyncedTimeRef.current = immediateTime;
      setLastSyncedTime(immediateTime);
      if (saveSig) {
        lastSyncedSignatureRef.current = saveSig;
      }

      // 2. Trigger Cleanup if this was an autosave
      if (filename.startsWith('auto_save')) {
          await cleanupOldSaves();
      }

      // Small delay to ensure Canvas consistency before listing
      await new Promise(r => setTimeout(r, 400));

      // 3. Update lastSyncedTime to the new file's server timestamp
      const postSaveFiles = await listSaveStates(canvasUrl, apiKey, useProxy, SAVES_FOLDER);
      if (postSaveFiles.length > 0) {
          postSaveFiles.sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime());
          const newLatest = postSaveFiles[0];
          const serverTime = new Date(newLatest.updated_at || newLatest.created_at).getTime();
          const finalSynced = Math.max(serverTime, immediateTime);
          lastSyncedTimeRef.current = finalSynced;
          setLastSyncedTime(finalSynced);
      }

      const latestCurrentSig = settingsRef.current ? getSettingsSignature(settingsRef.current) : null;
      const stillDirty = Boolean(saveSig && latestCurrentSig && latestCurrentSig !== saveSig);
      dirtySettingsRef.current = stillDirty;
      setSaveStatus('saved');
      lastRemoteSaveTimeRef.current = Date.now();
      setTimeout(() => setSaveStatus('idle'), 2200);

      // If more edits happened while uploading, schedule one follow-up sync respecting the 60s cooldown
      if (stillDirty && !saveTimerRef.current) {
        saveTimerRef.current = setTimeout(() => {
          saveTimerRef.current = null;
          const nextSettings = settingsRef.current || compileSettings();
          const nextSig = getSettingsSignature(nextSettings);
          if (lastSyncedSignatureRef.current === nextSig) {
            dirtySettingsRef.current = false;
            return;
          }
          const ts = new Date().toISOString().replace(/[:.]/g, '-');
          performSave(`auto_save_${ts}.json`, false, JSON.stringify(nextSettings, null, 2));
        }, REMOTE_AUTOSAVE_MIN_INTERVAL_MS);
      }

    } catch (err) {
      logger.error(`Failed to save settings to ${filename}`, err);
      lastRemoteSaveTimeRef.current = Date.now();
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3500);
    } finally {
      remoteSaveInFlightRef.current = false;
      if (showLoadingIndicator) setIsSaving(false);
    }
  };

  // Eagerly keep latest performSave bound
  performSaveRef.current = performSave;

  const cleanupOldSaves = async () => {
    try {
        const files = await listSaveStates(canvasUrl, apiKey, useProxy, SAVES_FOLDER);
        const autoSaveFiles = files.filter(f => f.filename.startsWith('auto_save'));
        
        if (autoSaveFiles.length === 0) return;

        const now = new Date();
        const filesToDelete: number[] = [];
        const keptSlots = new Set<string>();

        // Sort descending (newest first)
        autoSaveFiles.sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime());

        autoSaveFiles.forEach(f => {
            const date = new Date(f.updated_at || f.created_at);
            const diffMs = now.getTime() - date.getTime();
            const diffHours = diffMs / (1000 * 60 * 60);
            
            // Use local date string to determine "Day"
            const dayKey = date.toDateString();
            const currentDayKey = now.toDateString();
            
            if (dayKey === currentDayKey) {
                // Current Day
                if (diffHours < 2) {
                    // Rule: Keep all (Recent)
                    return;
                } else {
                    // Older hours of current day
                    // Rule: Keep 1 per hour (the latest one, since we iterate desc)
                    const hourKey = `${dayKey}_${date.getHours()}`;
                    if (!keptSlots.has(hourKey)) {
                        keptSlots.add(hourKey);
                    } else {
                        filesToDelete.push(f.id);
                    }
                }
            } else {
                // Previous Days
                // Rule: Keep 1 per day (the latest one)
                if (!keptSlots.has(dayKey)) {
                    keptSlots.add(dayKey);
                } else {
                    filesToDelete.push(f.id);
                }
            }
        });

        // Processing deletions
        for (const id of filesToDelete) {
             await deleteFileFromCanvas(canvasUrl, apiKey, id, useProxy);
        }
    } catch (e) {
        logger.warn("Cleanup failed", e);
    }
  };

  // --- Handlers & Helpers ---

  const handleAnalyze = async (customInstructions?: string, model?: string) => {
    if (!selectedCourse) return;
    setAnalyzing(true);
    try {
        const result = await analyzeWorkload(selectedCourse.assignments, data, customInstructions, model);
        setAiAnalysis(result);
    } catch (e: any) {
        logger.error("Analysis failed", e);
        setAiAnalysis(`<div class="p-3 bg-red-50 border border-red-200 text-red-800 rounded-md text-sm">Failed to generate analysis: ${e.message || 'Unknown error'}</div>`);
    } finally {
        setAnalyzing(false);
    }
  };

  const handleDebugAutosave = () => {
      const settings = compileSettings();
      const now = new Date();
      const timestamp = now.toISOString().replace(/[:.]/g, '-');
      performSave(`auto_save_${timestamp}.json`, true, JSON.stringify(settings, null, 2));
  };

  const getCourseName = (id: number) => {
      if (id === ALL_COURSES_ID) return 'All Courses';
      if (!id || id <= 0) return 'Course';
      const c = data.find(x => x.course.id === id);
      if (!c) {
          return 'Course';
      }
      const rawName = c.course.nickname || c.course.name || c.course.course_code || 'Course';
      return pruneCourseTitle(rawName);
  };

  const handleToggleCourseVisibility = (courseId: number) => {
    preOnlyVisibleCourseIdsRef.current = null;
    setVisibleCourseIds(prev => {
      const next = new Set(prev);
      if (next.has(courseId)) {
        next.delete(courseId);
      } else {
        next.add(courseId);
      }
      return next;
    });
  };

  const handleSelectAllCourses = () => {
    preOnlyVisibleCourseIdsRef.current = null;
    const activePool = data.filter(c => showPastTerms || !isCourseInPastTerm(c.course));
    const hasFavorites = activePool.some(c => c.course.is_favorite);
    const targetCourses = activePool.filter(c => showHiddenCourses ? true : (hasFavorites ? c.course.is_favorite : true));
    const allIds = targetCourses.map(c => c.course.id);
    setVisibleCourseIds(new Set(allIds));
    setSelectedCourseId(ALL_COURSES_ID);
  };

  const handleSelectNoneCourses = () => {
    preOnlyVisibleCourseIdsRef.current = null;
    setVisibleCourseIds(new Set());
    setSelectedCourseId(ALL_COURSES_ID);
  };

  const handleSelectOnlyCourse = (courseId: number) => {
    if (selectedCourseId === courseId) {
      // Tapping "Only" again on the currently focused course deactivates single-course mode
      const savedVisible = preOnlyVisibleCourseIdsRef.current;
      preOnlyVisibleCourseIdsRef.current = null;
      if (savedVisible) {
        setVisibleCourseIds(new Set(savedVisible));
        setSelectedCourseId(ALL_COURSES_ID);
      } else {
        handleSelectAllCourses();
      }
      return;
    }

    if (selectedCourseId === ALL_COURSES_ID) {
      preOnlyVisibleCourseIdsRef.current = new Set(visibleCourseIds);
    }
    setSelectedCourseId(courseId);
    setVisibleCourseIds(new Set([courseId]));
  };

  const toggleArchived = (id: number) => {
      const next = new Set(archivedAssignmentIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setArchivedAssignmentIds(next);
  };

  const toggleMarkedSubmitted = (id: number) => {
      const next = new Set(markedAsSubmittedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setMarkedAsSubmittedIds(next);
  };

  const handleResetFilters = useCallback(() => {
      setShowSubmitted(false);
      setShowArchived(false);
      setShowObsolete(false);
      setShowPastTerms(false);
      setShowPastEvents(false);
      setFilterFeedbackOnly(false);
  }, []);

  if (isRestoring) {
     return (
        <div className="h-dvh w-full flex flex-col items-center justify-center bg-slate-50 gap-4">
            <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
            <p className="text-slate-500 font-medium">Restoring your workspace...</p>
        </div>
     );
  }

  return (
    <div className="flex h-dvh w-full bg-slate-50 overflow-hidden relative">
      <Sidebar 
        data={data}
        selectedCourseId={selectedCourseId}
        onSelectCourse={setSelectedCourseId}
        visibleCourseIds={visibleCourseIds}
        onToggleCourseVisibility={handleToggleCourseVisibility}
        onSelectAllCourses={handleSelectAllCourses}
        onSelectNoneCourses={handleSelectNoneCourses}
        onSelectOnlyCourse={handleSelectOnlyCourse}
        showHiddenCourses={showHiddenCourses}
        onToggleHidden={setShowHiddenCourses}
        showPastTerms={showPastTerms}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={setIsSidebarCollapsed}
        onLogout={onLogout}
        onDebug={onDebug}
        showScores={showScores}
        currentStudentId={currentStudentId}
        currentStudentName={currentStudentName}
        currentDomain={canvasUrl}
        canvasToken={apiKey}
        useProxy={useProxy}
        onSwitchStudent={onSwitchStudent}
        onRenameStudent={onRenameStudent}
        courseCustomizations={courseCustomizations}
        onSaveCustomization={handleSaveCustomization}
        courseOrder={courseOrder}
        onUpdateCourseOrder={handleUpdateCourseOrder}
        onInspectCourseGrade={setInspectedCourseId}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 min-h-0 h-full overflow-hidden relative">
         <Header 
            selectedCourseName={selectedCourse?.course.name ? (selectedCourseId === ALL_COURSES_ID ? selectedCourse.course.name : pruneCourseTitle(selectedCourse.course.name)) : "Loading..."}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            assignmentsViewMode={assignmentsViewMode}
            onAssignmentsViewModeChange={setAssignmentsViewMode}
            showSubmitted={showSubmitted}
            onToggleShowSubmitted={setShowSubmitted}
            showObsolete={showObsolete}
            onToggleShowObsolete={setShowObsolete}
            showPastTerms={showPastTerms}
            onToggleShowPastTerms={setShowPastTerms}
            showScores={showScores}
            onToggleShowScores={setShowScores}
            showClassAverages={showClassAverages}
            onToggleShowClassAverages={setShowClassAverages}
            showIds={showIds}
            onToggleShowIds={setShowIds}
            showCalendarEvents={showCalendarEvents}
            onToggleShowCalendarEvents={setShowCalendarEvents}
            calendarEventsCount={visibleCalendarEventsCount}
            calendarEvents={calendarEvents}
            showPastEvents={showPastEvents}
            onToggleShowPastEvents={setShowPastEvents}
            loadingCalendarEvents={loadingCalendarEvents}
            onRefreshCalendarEvents={refreshCalendarEvents}
            showArchived={showArchived}
            onToggleShowArchived={setShowArchived}
            onResetFilters={handleResetFilters}
            data={data}
            onToggleNotes={() => setIsNotesOpen(!isNotesOpen)}
            onSaveSettings={() => setIsSaveDialogOpen(true)}
            isSaving={isSaving}
            onOpenLoadModal={() => setIsLoadModalOpen(true)}
            onDebugAutosave={handleDebugAutosave}
            onOpenGradeSettings={() => setIsGradeModalOpen(true)}
            currentStudentId={currentStudentId}
            currentStudentName={currentStudentName}
            currentDomain={canvasUrl}
            onSwitchStudent={onSwitchStudent}
            onRenameStudent={onRenameStudent}
            onOpenMobileMenu={() => setIsMobileSidebarOpen(true)}
            onOpenMobileSettings={() => setIsMobileSettingsOpen(true)}
            onLogout={onLogout}
         />

         <main className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain p-3 sm:p-5 md:p-8 custom-scrollbar relative">
             {selectedCourse && (
                 <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
                    {/* Notice when all courses are hidden in multi-class view */}
                    {selectedCourseId === ALL_COURSES_ID && selectedCourse.course.course_code === "NONE" && (
                      <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-sm">No courses currently selected in Multi-Class view</p>
                          <p className="text-xs text-amber-700 mt-0.5">Toggle classes on in the sidebar, or click below to view all active courses.</p>
                        </div>
                        <button
                          type="button"
                          onClick={handleSelectAllCourses}
                          className="px-3 py-1.5 text-xs font-bold rounded-lg bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition cursor-pointer"
                        >
                          Show All Classes
                        </button>
                      </div>
                    )}

                    {/* Course Heading in Main Content Area (Below Header Controls) */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80 bg-white/70 p-3 sm:p-4 rounded-xl border border-slate-200/90 shadow-2xs">
                      <div className="flex items-center gap-3 min-w-0">
                        {selectedCourseId !== ALL_COURSES_ID && courseCustomizations[selectedCourseId]?.emoji ? (
                          <span className="text-2xl sm:text-3xl shrink-0 select-none">
                            {courseCustomizations[selectedCourseId].emoji}
                          </span>
                        ) : (
                          <div className="p-2 sm:p-2.5 rounded-xl bg-blue-600 text-white shrink-0 shadow-2xs">
                            {selectedCourseId === ALL_COURSES_ID ? <Layers className="w-5 h-5" /> : <BookOpen className="w-5 h-5" />}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h1 className="text-base sm:text-xl font-bold text-slate-900 truncate">
                              {selectedCourseId === ALL_COURSES_ID ? selectedCourse.course.name : pruneCourseTitle(selectedCourse.course.name)}
                            </h1>
                            {selectedCourseId !== ALL_COURSES_ID && (
                              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                                {selectedCourse.course.course_code}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5 flex-wrap">
                            {selectedCourseId === ALL_COURSES_ID ? (
                              <span>Aggregated workspace ({courseHeaderAssignmentCount} assignments, {selectedCourse.modules.length} modules)</span>
                            ) : (
                              <>
                                {selectedCourse.course.term && <span>{selectedCourse.course.term.name}</span>}
                                <span>•</span>
                                <span>{courseHeaderAssignmentCount} assignments</span>
                                <span>•</span>
                                <span>{selectedCourse.modules.length} modules</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Course Standing / Grade Badge + Data Inspector Trigger */}
                      {selectedCourseId !== ALL_COURSES_ID && (
                        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0 flex-wrap">
                          {showScores && (() => {
                            const effective = getEffectiveCourseGrade(selectedCourse);
                            if (!effective || !effective.hasData) {
                              return (
                                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-500 italic">
                                  <span>Grade: No Data</span>
                                </div>
                              );
                            }
                            const style = getGradeStyle(effective.score, 100, gradeConfig, { isCourseGrade: true });
                            return (
                              <div 
                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border shadow-2xs cursor-pointer hover:opacity-90 transition"
                                style={style.style}
                                onClick={() => setIsGradeModalOpen(true)}
                                title="Course grade standing — click to configure thresholds"
                              >
                                <span className="text-xs font-semibold text-slate-600">Grade:</span>
                                <span className="text-sm font-bold">{effective.letter || `${effective.score}%`}</span>
                                {effective.letter && <span className="text-xs opacity-80">({effective.score}%)</span>}
                                {effective.isEstimated && (
                                  <span className="text-[10px] font-bold px-1 rounded bg-amber-100 text-amber-800 border border-amber-200">
                                    Est
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                          <button
                            type="button"
                            data-testid="course-header-inspect-grade"
                            onClick={() => setInspectedCourseId(selectedCourse.course.id)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-blue-200 bg-blue-50/80 hover:bg-blue-100 text-blue-700 text-xs font-semibold shadow-2xs transition cursor-pointer"
                            title="Inspect how this course grade is fetched from Canvas or calculated"
                          >
                            <Database className="w-3.5 h-3.5" />
                            <span>Inspect</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* AI Analysis Panel */}
                    <AnalysisPanel 
                        analysis={aiAnalysis}
                        analyzing={analyzing}
                        onAnalyze={handleAnalyze}
                    />

                    {/* Main Content Area */}
                    <div className="animate-fadeIn">
                        {activeTab === 'overview' && (
                           <ErrorBoundary fallbackTitle="Unable to display Overview">
                             <div className="space-y-6">
                                  <Overview 
                                      course={selectedCourse}
                                      allCoursesData={activeOverviewCourses}
                                      onNavigate={setActiveTab}
                                      showScores={showScores}
                                      showObsolete={showObsolete}
                                      showArchived={showArchived}
                                      archivedAssignmentIds={archivedAssignmentIds}
                                      showCalendarEvents={showCalendarEvents}
                                      showPastEvents={showPastEvents}
                                      calendarEvents={calendarEvents}
                                      announcements={visibleAnnouncements}
                                      getCourseName={getCourseName}
                                      canvasUrl={canvasUrl}
                                      gradeConfig={gradeConfig}
                                      onOpenGradeSettings={() => setIsGradeModalOpen(true)}
                                      onInspectCourseGrade={setInspectedCourseId}
                                      courseCustomizations={courseCustomizations}
                                      onSelectCourse={(courseId) => setSelectedCourseId(courseId)}
                                      onStartTutorial={(tid) => {
                                        if (tid) setActiveTutorialId(tid);
                                        setIsTutorialOpen(true);
                                      }}
                                  />
                             </div>
                           </ErrorBoundary>
                        )}

                        {activeTab === 'assignments' && (
                             assignmentsViewMode === 'board' ? (
                                <ErrorBoundary key={`board-${selectedCourseId}`} fallbackTitle="Unable to display Assignments Board">
                                  <AssignmentsBoard 
                                      assignments={selectedCourse.assignments}
                                      getCourseName={getCourseName}
                                      courseCustomizations={courseCustomizations}
                                      archivedAssignmentIds={archivedAssignmentIds}
                                      onToggleArchived={toggleArchived}
                                      onToggleMarkedSubmitted={toggleMarkedSubmitted}
                                      showScores={showScores}
                                      showClassAverages={showClassAverages}
                                      showArchived={showArchived}
                                      showSubmitted={showSubmitted}
                                      showObsolete={showObsolete}
                                      showPastEvents={showPastEvents}
                                      showIds={showIds}
                                      canvasUrl={canvasUrl}
                                      apiKey={apiKey}
                                      useProxy={useProxy}
                                      acknowledgedFeedbackIds={acknowledgedFeedbackIds}
                                      onToggleAcknowledgeComment={handleToggleAcknowledgeComment}
                                      onAcknowledgeAllComments={handleAcknowledgeAllComments}
                                      filterFeedbackOnly={filterFeedbackOnly}
                                      onToggleFilterFeedback={setFilterFeedbackOnly}
                                      gradeConfig={gradeConfig}
                                      onOpenGradeSettings={() => setIsGradeModalOpen(true)}
                                      todoItems={todoItems}
                                      onMarkTodoDone={handleMarkTodoDone}
                                      announcements={visibleAnnouncements}
                                      onDismissAnnouncement={handleDismissAnnouncement}
                                      courses={data}
                                  />
                                </ErrorBoundary>
                              ) : (
                                <ErrorBoundary key={`table-${selectedCourseId}`} fallbackTitle="Unable to display list view" onReset={() => setSortConfig(null)}>
                                  <AssignmentsTable 
                                    assignments={selectedCourse.assignments}
                                    showIds={showIds}
                                    showCourseColumn={selectedCourseId === ALL_COURSES_ID}
                                    getCourseName={getCourseName}
                                    courseCustomizations={courseCustomizations}
                                    archivedAssignmentIds={archivedAssignmentIds}
                                    onToggleArchived={toggleArchived}
                                    onToggleMarkedSubmitted={toggleMarkedSubmitted}
                                    sortConfig={sortConfig}
                                    onSortChange={setSortConfig}
                                    columnFilters={columnFilters}
                                    onFilterChange={setColumnFilters}
                                    filterModes={filterModes}
                                    onFilterModeChange={setFilterModes}
                                    showScores={showScores}
                                    showClassAverages={showClassAverages}
                                    showArchived={showArchived}
                                    showSubmitted={showSubmitted}
                                    showObsolete={showObsolete}
                                    showPastEvents={showPastEvents}
                                    canvasUrl={canvasUrl}
                                    apiKey={apiKey}
                                    useProxy={useProxy}
                                    acknowledgedFeedbackIds={acknowledgedFeedbackIds}
                                    onToggleAcknowledgeComment={handleToggleAcknowledgeComment}
                                    onAcknowledgeAllComments={handleAcknowledgeAllComments}
                                    filterFeedbackOnly={filterFeedbackOnly}
                                    onToggleFilterFeedback={setFilterFeedbackOnly}
                                    gradeConfig={gradeConfig}
                                    onOpenGradeSettings={() => setIsGradeModalOpen(true)}
                                    todoItems={todoItems}
                                    onMarkTodoDone={handleMarkTodoDone}
                                    announcements={visibleAnnouncements}
                                    onDismissAnnouncement={handleDismissAnnouncement}
                                    courses={data}
                                  />
                                </ErrorBoundary>
                             )
                        )}

                        {activeTab === 'calendar' && (
                            <ErrorBoundary fallbackTitle="Unable to display Calendar">
                              <CalendarEventsPanel
                                events={calendarTabEvents}
                                canvasUrl={canvasUrl}
                                showPastEvents={showPastEvents}
                                viewMode={calendarViewMode}
                                onViewModeChange={setCalendarViewMode}
                                onViewBoard={() => setActiveTab('assignments')}
                              />
                            </ErrorBoundary>
                        )}

                        {activeTab === 'modules' && (
                            <ErrorBoundary fallbackTitle="Unable to display Modules">
                              <ModulesList 
                                  modules={selectedCourse.modules}
                                  expandedModules={expandedModules}
                                  toggleModule={(id) => {
                                      setExpandedModules(prev => {
                                          const next = new Set(prev);
                                          if (next.has(id)) next.delete(id);
                                          else next.add(id);
                                          return next;
                                      });
                                  }}
                                  onExpandAllModules={(expand) => {
                                      if (expand) {
                                          setExpandedModules(new Set(selectedCourse.modules.map(m => m.id)));
                                      } else {
                                          setExpandedModules(new Set());
                                      }
                                  }}
                                  showCourseCode={selectedCourseId === ALL_COURSES_ID}
                                  getCourseName={getCourseName}
                                  showIds={showIds}
                                  courses={data}
                                  courseOrder={courseOrder}
                                  customizations={courseCustomizations}
                              />
                            </ErrorBoundary>
                        )}
                    </div>
                 </div>
             )}
         </main>

         {/* Unobtrusive Autosave / Status Pill (packed in corner) */}
         {saveStatus !== 'idle' && (
             <div className={`fixed bottom-3 right-3 px-2.5 py-1.5 rounded-lg shadow-sm border flex items-center gap-2 transition-all duration-300 z-50 text-xs backdrop-blur-xs select-none ${
                 saveStatus === 'error' ? 'bg-white/95 border-red-200 text-red-700' : 
                 saveStatus === 'saved' ? 'bg-white/95 border-emerald-200 text-emerald-800' : 
                 'bg-white/95 border-slate-200 text-slate-600'
             }`}>
                 {saveStatus === 'saving' && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600 shrink-0" />}
                 {saveStatus === 'saved' && <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                 {saveStatus === 'error' && <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />}
                 
                 <span className="font-medium">
                     {saveStatus === 'saving' ? 'Saving...' : 
                      saveStatus === 'saved' ? 'Settings saved' : 
                      'Save failed'}
                 </span>
             </div>
         )}

         {actionNotice && (
           <div className="fixed bottom-12 right-3 max-w-xs bg-white/95 border border-amber-200 text-amber-800 px-3 py-2 rounded-lg shadow-md flex items-center gap-2 z-50 text-xs">
             <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
             <span className="flex-1">{actionNotice}</span>
             <button
               type="button"
               onClick={() => setActionNotice(null)}
               className="p-0.5 text-amber-500 hover:text-amber-700 cursor-pointer"
               title="Dismiss"
             >
               <X className="w-3.5 h-3.5" />
             </button>
           </div>
         )}
      </div>

      {/* Save Conflict Modal */}
      {conflictPrompt && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
        >
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden text-left">
            <div className="px-5 py-4 bg-amber-50 border-b border-amber-100 flex items-center gap-3">
              <div className="p-2 rounded-xl bg-amber-600 text-white shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Newer Cloud Save Found</h3>
                <p className="text-[11px] text-amber-800">Saved on server at {conflictPrompt.serverTimestamp}</p>
              </div>
            </div>
            <div className="p-5 text-xs text-slate-600 space-y-2">
              <p>A newer settings snapshot already exists in your Canvas folder (likely from another tab or device).</p>
              <p>Choose whether to overwrite the cloud snapshot with your current workspace settings or keep your local changes without overwriting.</p>
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  logger.info("Save cancelled by user due to conflict.");
                  setConflictPrompt(null);
                  setSaveStatus('idle');
                }}
                className="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 transition cursor-pointer"
              >
                Discard Save
              </button>
              <button
                type="button"
                onClick={() => {
                  const pending = conflictPrompt;
                  setConflictPrompt(null);
                  performSave(pending.filename, pending.showLoadingIndicator, pending.content, true);
                }}
                className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition cursor-pointer"
              >
                Overwrite Cloud Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <NotesPanel 
        isOpen={isNotesOpen} 
        onClose={() => setIsNotesOpen(false)} 
        domain={canvasUrl}
        token={apiKey}
        useProxy={useProxy}
      />
      
      <SaveLoadModal 
        isOpen={isLoadModalOpen}
        onClose={() => setIsLoadModalOpen(false)}
        onLoadFile={handleLoadFileUrl}
        domain={canvasUrl}
        token={apiKey}
        useProxy={useProxy}
        onExportSettings={handleExportSettingsJson}
        onImportSettings={(importedSettings) => {
          applySettings(importedSettings);
          saveLocalWorkspaceSettings(currentStudentId, importedSettings);
        }}
      />

      <SaveDialog
        isOpen={isSaveDialogOpen}
        onClose={() => setIsSaveDialogOpen(false)}
        onConfirm={(name) => {
             performSave(name);
             setIsSaveDialogOpen(false);
        }}
      />

      {isGradeModalOpen && (
        <GradeThresholdModal 
          isOpen={isGradeModalOpen}
          onClose={() => setIsGradeModalOpen(false)}
          config={gradeConfig}
          onSave={(newCfg) => setGradeConfig(newCfg)}
          studentId={currentStudentId}
        />
      )}

      {inspectedCourseId !== null && (() => {
        const targetCourse = data.find(c => c.course.id === inspectedCourseId);
        if (!targetCourse) return null;
        return (
          <CourseGradeInspectorModal
            isOpen={true}
            onClose={() => setInspectedCourseId(null)}
            courseData={targetCourse}
            canvasUrl={canvasUrl}
            apiKey={apiKey}
            useProxy={useProxy}
            gradeConfig={gradeConfig}
            showScores={showScores}
          />
        );
      })()}

      <MobileControlsDrawer
        isOpen={isMobileSettingsOpen}
        onClose={() => setIsMobileSettingsOpen(false)}
        showScores={showScores}
        onToggleShowScores={setShowScores}
        showClassAverages={showClassAverages}
        onToggleShowClassAverages={setShowClassAverages}
        showIds={showIds}
        onToggleShowIds={setShowIds}
        showCalendarEvents={showCalendarEvents}
        onToggleShowCalendarEvents={setShowCalendarEvents}
        calendarEventsCount={visibleCalendarEventsCount}
        showPastEvents={showPastEvents}
        onToggleShowPastEvents={setShowPastEvents}
        loadingCalendarEvents={loadingCalendarEvents}
        onRefreshCalendarEvents={refreshCalendarEvents}
        showSubmitted={showSubmitted}
        onToggleShowSubmitted={setShowSubmitted}
        showArchived={showArchived}
        onToggleShowArchived={setShowArchived}
        showObsolete={showObsolete}
        onToggleShowObsolete={setShowObsolete}
        showPastTerms={showPastTerms}
        onToggleShowPastTerms={setShowPastTerms}
        onResetFilters={handleResetFilters}
        onOpenGradeSettings={() => setIsGradeModalOpen(true)}
        onSaveSettings={() => setIsSaveDialogOpen(true)}
        isSaving={isSaving}
        onOpenLoadModal={() => setIsLoadModalOpen(true)}
        onToggleNotes={() => setIsNotesOpen(!isNotesOpen)}
        onDebugAutosave={handleDebugAutosave}
        data={data}
        onLogout={onLogout}
      />

      {isTutorialOpen && (
        <InteractiveTutorialModal
          isOpen={isTutorialOpen}
          onClose={() => setIsTutorialOpen(false)}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          assignmentsViewMode={assignmentsViewMode}
          onAssignmentsViewModeChange={setAssignmentsViewMode}
          onOpenGradeSettings={() => setIsGradeModalOpen(true)}
          onOpenNotes={() => setIsNotesOpen(true)}
          initialTutorialId={activeTutorialId}
        />
      )}
    </div>
  );
};