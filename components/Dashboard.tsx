

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { CourseData, ALL_COURSES_ID, SortConfig, UserSettings, FilterMode, CanvasTodoItem, CanvasAssignment, CanvasCalendarEvent, StudentProfile } from '../types';
import { analyzeWorkload } from '../services/gemini';
import { saveFileToCanvas, listSaveStates, downloadRawFile, fetchTodoItems, dismissTodoItem, deleteFileFromCanvas, fetchCalendarEvents, getCourseIdFromEvent, SAVES_FOLDER } from '../services/canvas';
import { getAcknowledgedFeedback, toggleAcknowledgeFeedback, acknowledgeAllComments } from '../services/students';
import { pruneCourseTitle } from '../utils/courseAbbreviations';
import { Sidebar } from './dashboard/Sidebar';
import { Header } from './dashboard/Header';
import { AnalysisPanel } from './dashboard/AnalysisPanel';
import { Overview } from './dashboard/Overview';
import { AssignmentsTable } from './dashboard/AssignmentsTable';
import { AssignmentsBoard } from './dashboard/AssignmentsBoard';
import { CanvasToDo } from './dashboard/CanvasToDo';
import { ModulesList } from './dashboard/ModulesList';
import { NotesPanel } from './dashboard/NotesPanel';
import { SaveLoadModal } from './dashboard/SaveLoadModal';
import { SaveDialog } from './dashboard/SaveDialog';
import { logger } from '../services/logger';
import { Loader2, Check, AlertCircle } from 'lucide-react';
import { 
  getCourseCustomizations, 
  saveCourseCustomization, 
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
  onSwitchStudent
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
  
  // Experimental: Merge Calendar Events
  const [showCalendarEvents, setShowCalendarEvents] = useState(true);
  const [hidePastEvents, setHidePastEvents] = useState(false);
  const [calendarEvents, setCalendarEvents] = useState<CanvasCalendarEvent[]>([]);
  
  // Renamed from showManuallyHidden
  const [showArchived, setShowArchived] = useState(false); 
  // Renamed from hiddenAssignmentIds
  const [archivedAssignmentIds, setArchivedAssignmentIds] = useState<Set<number>>(new Set()); 
  
  // New: Manually Marked as Submitted
  const [markedAsSubmittedIds, setMarkedAsSubmittedIds] = useState<Set<number>>(new Set());

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
  
  // Multi-class view visibility state
  const [visibleCourseIds, setVisibleCourseIds] = useState<Set<number>>(() => {
    return new Set(data.map(c => c.course.id));
  });
  const hasInitializedVisibleCourses = useRef(false);

  useEffect(() => {
    if (data.length > 0 && !hasInitializedVisibleCourses.current) {
      hasInitializedVisibleCourses.current = true;
      setVisibleCourseIds(prev => {
        if (prev.size > 0) return prev;
        return new Set(data.map(c => c.course.id));
      });
    }
  }, [data]);

  const [expandedModules, setExpandedModules] = useState<Set<number>>(new Set());
  
  // Navigation State
  const [activeTab, setActiveTab] = useState<'overview' | 'assignments' | 'modules' | 'canvas_todo'>('overview');
  const [assignmentsViewMode, setAssignmentsViewMode] = useState<'list' | 'board'>('list');

  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [isLoadModalOpen, setIsLoadModalOpen] = useState(false);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  
  // Table State
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [columnFilters, setColumnFilters] = useState<Record<string, Set<string>>>({});
  const [filterModes, setFilterModes] = useState<Record<string, FilterMode>>({});
  
  // AI Analysis State
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  // Todo State
  const [todoItems, setTodoItems] = useState<CanvasTodoItem[]>([]);

  // Persistence State
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [isRestoring, setIsRestoring] = useState(true); // New state to block render during initial load
  const saveTimerRef = useRef<any>(null);
  const settingsRef = useRef<UserSettings | null>(null); // For unload hook

  // Conflict Detection State
  const [lastSyncedTime, setLastSyncedTime] = useState<number>(0);

  // Helper to apply settings object to state
  const applySettings = (settings: UserSettings) => {
      if (settings.viewPreferences) {
          setShowHiddenCourses(settings.viewPreferences.showHiddenCourses);
          setShowIds(settings.viewPreferences.showIds);
          
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

          if (settings.viewPreferences.showCalendarEvents !== undefined) {
              setShowCalendarEvents(settings.viewPreferences.showCalendarEvents);
          } else {
              setShowCalendarEvents(true);
          }

          if (settings.viewPreferences.hidePastEvents !== undefined) {
              setHidePastEvents(settings.viewPreferences.hidePastEvents);
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

          setActiveTab(settings.viewPreferences.activeTab as any);
          if (settings.viewPreferences.assignmentsViewMode) {
              setAssignmentsViewMode(settings.viewPreferences.assignmentsViewMode);
          }
          setIsSidebarCollapsed(settings.viewPreferences.isSidebarCollapsed);
      }

      if (settings.context) {
        if (settings.context.selectedCourseId !== null) {
          if (settings.context.selectedCourseId === ALL_COURSES_ID || data.some(c => c.course.id === settings.context.selectedCourseId)) {
              setSelectedCourseId(settings.context.selectedCourseId);
          }
        }
        if (settings.context.visibleCourseIds && Array.isArray(settings.context.visibleCourseIds)) {
          setVisibleCourseIds(new Set(settings.context.visibleCourseIds));
        }
      }

      if (settings.tableState) {
          setSortConfig(settings.tableState.sortConfig);
          
          const filters: Record<string, Set<string>> = {};
          Object.entries(settings.tableState.columnFilters).forEach(([k, v]) => {
              filters[k] = new Set(v);
          });
          setColumnFilters(filters);

          if (settings.tableState.filterModes) {
              setFilterModes(settings.tableState.filterModes);
          }
      }
  };

  // Fetch Todo Items
  useEffect(() => {
     const loadTodos = async () => {
         const items = await fetchTodoItems(canvasUrl, apiKey, useProxy);
         setTodoItems(items);
     };
     loadTodos();
  }, [canvasUrl, apiKey, useProxy]);

  // Fetch Calendar Events (Future & Recent Past)
  const [loadingCalendarEvents, setLoadingCalendarEvents] = useState(false);

  const refreshCalendarEvents = useCallback(async () => {
    if (!canvasUrl || !apiKey) return;
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
          alert("Could not mark item as done. It may not support this action via API.");
      }
  };

  // Smart Load on Mount
  useEffect(() => {
    const smartLoad = async () => {
      try {
        logger.info("Checking for saved state...");
        // Look in 'saves' subfolder
        const files = await listSaveStates(canvasUrl, apiKey, useProxy, SAVES_FOLDER);
        
        // Sort files by date
        files.sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime());
        
        let fileToLoad = null;
        if (files.length > 0) {
             fileToLoad = files[0];
             logger.info(`Found save file: ${fileToLoad.filename} (${new Date(fileToLoad.updated_at || fileToLoad.created_at).toLocaleString()})`);
             setLastSyncedTime(new Date(fileToLoad.updated_at || fileToLoad.created_at).getTime());
        } else {
             // If no files exist, we start at 0 (so any future file created by another session will be 'newer')
             setLastSyncedTime(0);
        }

        if (fileToLoad) {
             const content = await downloadRawFile(fileToLoad.url, apiKey, useProxy);
             if (content) {
                 const settings = JSON.parse(content) as UserSettings;
                 applySettings(settings);
                 logger.info("Settings applied successfully.");
             }
        } else {
            logger.info("No save states found in 'saves' folder.");
        }

      } catch (e) {
        logger.warn("Failed to load initial settings", e);
      } finally {
        setIsRestoring(false);
      }
    };

    smartLoad();
  }, []); 

  // Handle loading a specific file from Modal
  const handleLoadFileUrl = async (url: string, date: number) => {
      try {
          logger.info("Loading settings from file...");
          const content = await downloadRawFile(url, apiKey, useProxy);
          if (content) {
              const settings = JSON.parse(content) as UserSettings;
              applySettings(settings);
              setLastSyncedTime(date);
              logger.info("Settings loaded and applied.");
          }
      } catch (e: any) {
          logger.error("Failed to load selected file", e.message);
      }
  };

  // Ensure valid selection on load
  useEffect(() => {
    if (selectedCourseId === ALL_COURSES_ID) return;
    const exists = data.find(c => c.course.id === selectedCourseId);
    if (!exists && data.length > 0) {
       const favorite = data.find(c => c.course.is_favorite);
       setSelectedCourseId(favorite ? favorite.course.id : data[0].course.id);
    }
  }, [data, selectedCourseId]);

  // Derived State: Selected Course Object with Injected Properties
  const selectedCourse = useMemo(() => {
    const injectProperties = (assignments: CanvasAssignment[]) => {
        return assignments.map(a => ({
            ...a,
            manual_marked_submitted: markedAsSubmittedIds.has(a.id)
        }));
    };

    const isPastCalendarEvent = (ev: CanvasCalendarEvent): boolean => {
      const dateStr = ev.end_at || ev.start_at || (ev.all_day_date ? `${ev.all_day_date}T23:59:59` : null);
      if (!dateStr) return false;
      const t = new Date(dateStr).getTime();
      return !isNaN(t) && t < Date.now();
    };

    const convertEventToAssignment = (ev: CanvasCalendarEvent): CanvasAssignment => {
      const extractedCourseId = getCourseIdFromEvent(ev);
      const courseId = extractedCourseId ?? ALL_COURSES_ID;

      const dueAt = ev.start_at || ev.end_at || (ev.all_day_date ? `${ev.all_day_date}T23:59:59Z` : null);

      return {
        id: -Math.abs(ev.id || 99999),
        name: ev.title || 'Untitled Event',
        description: ev.description || (ev.location_name ? `Location: ${ev.location_name}` : ''),
        due_at: dueAt,
        points_possible: 0,
        course_id: courseId,
        html_url: ev.html_url || '#',
        submission_types: ['calendar_event'],
        locked_for_user: false,
        is_calendar_event: true,
        location_name: ev.location_name
      };
    };

    if (selectedCourseId === ALL_COURSES_ID) {
         let relevantCourses = data;
         if (!showHiddenCourses) {
             relevantCourses = relevantCourses.filter(c => c.course.is_favorite);
         }
         const totalActive = relevantCourses.length;
         relevantCourses = relevantCourses.filter(c => visibleCourseIds.has(c.course.id));

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

         let allAssignments = relevantCourses.flatMap(c => c.assignments);
         const allModules = relevantCourses.flatMap(c => (c.modules || []).map(m => ({
           ...m,
           course_id: m.course_id || c.course.id
         })));

         // Merge calendar events if toggle is enabled
         if (showCalendarEvents && calendarEvents.length > 0) {
           const visibleIds = new Set(relevantCourses.map(c => c.course.id));
           const relevantEvents = calendarEvents.filter(ev => {
             if (hidePastEvents && isPastCalendarEvent(ev)) return false;
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

    let courseAssignments = [...found.assignments];
    if (showCalendarEvents && calendarEvents.length > 0) {
      const courseEvents = calendarEvents.filter(ev => {
        if (hidePastEvents && isPastCalendarEvent(ev)) return false;
        const cId = getCourseIdFromEvent(ev);
        return cId === selectedCourseId || ev.context_code === `course_${selectedCourseId}` || ev.effective_context_code === `course_${selectedCourseId}`;
      });
      courseAssignments = [...courseAssignments, ...courseEvents.map(convertEventToAssignment)];
    }

    return {
        ...found,
        modules: (found.modules || []).map(m => ({ ...m, course_id: m.course_id || found.course.id })),
        assignments: injectProperties(courseAssignments)
    };
  }, [data, selectedCourseId, showHiddenCourses, visibleCourseIds, markedAsSubmittedIds, showCalendarEvents, calendarEvents, hidePastEvents]);

  // Reset view state when course changes
  useEffect(() => {
    setAiAnalysis(null);
    setExpandedModules(new Set());
  }, [selectedCourseId]);

  const visibleCalendarEventsCount = useMemo(() => {
    if (!calendarEvents || calendarEvents.length === 0) return 0;
    if (hidePastEvents) {
      return calendarEvents.filter(ev => {
        const dateStr = ev.end_at || ev.start_at || (ev.all_day_date ? `${ev.all_day_date}T23:59:59` : null);
        if (!dateStr) return true;
        const t = new Date(dateStr).getTime();
        return isNaN(t) || t >= Date.now();
      }).length;
    }
    return calendarEvents.length;
  }, [calendarEvents, hidePastEvents]);

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
        showIds,
        showCalendarEvents,
        hidePastEvents,
        showArchived,
        archivedAssignmentIds: Array.from(archivedAssignmentIds),
        markedAsSubmittedIds: Array.from(markedAsSubmittedIds),
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
      }
    };
  };

  // Update ref whenever state changes AND trigger debounced autosave
  useEffect(() => {
      // Don't autosave while we are still restoring state
      if (isRestoring) return;

      const settings = compileSettings();
      settingsRef.current = settings;

      // Debounced Autosave Logic
      // 1. Clear any existing pending save
      if (saveTimerRef.current) {
          clearTimeout(saveTimerRef.current);
      }

      // 2. Schedule new save in 10 seconds (10000ms)
      saveTimerRef.current = setTimeout(() => {
          logger.info("Autosaving settings due to change...");
          const now = new Date();
          const timestamp = now.toISOString().replace(/[:.]/g, '-');
          // Pass 'false' to performSave to suppress the UI loading spinner if desired for background saves
          performSave(`auto_save_${timestamp}.json`, false, JSON.stringify(settings, null, 2));
      }, 10000);

      // 3. Cleanup on unmount or dependency change
      return () => {
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      };
  }, [showHiddenCourses, showSubmitted, showObsolete, showPastTerms, showScores, showIds, showCalendarEvents, hidePastEvents, showArchived, archivedAssignmentIds, markedAsSubmittedIds, activeTab, assignmentsViewMode, isSidebarCollapsed, selectedCourseId, visibleCourseIds, sortConfig, columnFilters, filterModes, isRestoring]);

  // Unload Hook
  useEffect(() => {
      const handleBeforeUnload = () => {
          if (settingsRef.current) {
              const content = JSON.stringify(settingsRef.current, null, 2);
              const now = new Date();
              const timestamp = now.toISOString().replace(/[:.]/g, '-');
              // Use background save (keepalive: true) to ensure this completes after unload
              // Explicitly save to 'saves' subfolder
              saveFileToCanvas(canvasUrl, apiKey, `auto_save_${timestamp}.json`, content, useProxy, SAVES_FOLDER, true).catch(err => console.error("Auto save failed", err));
          }
      };
      
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [canvasUrl, apiKey, useProxy]);

  const performSave = async (filename: string, showLoadingIndicator: boolean = true, contentToSave?: string) => {
    if (showLoadingIndicator) setIsSaving(true);
    setSaveStatus('saving');
    
    try {
      // 1. Check for conflict by listing files from server
      // Note: This adds a network call before saving, but ensures data integrity.
      const currentFiles = await listSaveStates(canvasUrl, apiKey, useProxy, SAVES_FOLDER);
      if (currentFiles.length > 0) {
          // Sort by date descending
          currentFiles.sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime());
          const latestFile = currentFiles[0];
          const latestTime = new Date(latestFile.updated_at || latestFile.created_at).getTime();
          
          // Conflict Check: If server has a file strictly newer than what we last loaded/saved
          if (latestTime > lastSyncedTime) {
             const proceed = window.confirm(
                 "CONFLICT DETECTED\n\n" +
                 "A newer save file was found on the server. This usually happens if you have the app open in another window or tab.\n\n" +
                 "Click OK to OVERWRITE the server version with your current changes.\n" +
                 "Click Cancel to DISCARD your save attempt (your local changes will remain in memory but won't be saved)."
             );
             
             if (!proceed) {
                 logger.info("Save cancelled by user due to conflict.");
                 setSaveStatus('idle');
                 return; 
             }
          }
      }

      const content = contentToSave || JSON.stringify(compileSettings(), null, 2);
      // Save to 'saves' subfolder
      await saveFileToCanvas(canvasUrl, apiKey, filename, content, useProxy, SAVES_FOLDER);

      // 2. Trigger Cleanup if this was an autosave
      if (filename.startsWith('auto_save')) {
          await cleanupOldSaves();
      }

      // Small delay to ensure Canvas consistency before listing
      await new Promise(r => setTimeout(r, 500));

      // 3. Update lastSyncedTime to the new file's time
      // We list again to get the authoritative server time of the file we just saved
      const postSaveFiles = await listSaveStates(canvasUrl, apiKey, useProxy, SAVES_FOLDER);
      if (postSaveFiles.length > 0) {
          postSaveFiles.sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime());
          const newLatest = postSaveFiles[0];
          setLastSyncedTime(new Date(newLatest.updated_at || newLatest.created_at).getTime());
      }
      
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 5000);

    } catch (err) {
      logger.error(`Failed to save settings to ${filename}`, err);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 6000);
    } finally {
      if (showLoadingIndicator) setIsSaving(false);
    }
  };

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
      const custom = courseCustomizations[id];
      const c = data.find(x => x.course.id === id);
      if (!c) {
          if (custom?.abbreviation) return custom.abbreviation;
          return 'Course';
      }
      if (custom?.abbreviation) {
          return custom.abbreviation;
      }
      const name = c.course.name || c.course.course_code || 'Course';
      return pruneCourseTitle(name);
  };

  const handleToggleCourseVisibility = (courseId: number) => {
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
    const allIds = data
      .filter(c => showHiddenCourses ? true : c.course.is_favorite)
      .map(c => c.course.id);
    setVisibleCourseIds(new Set(allIds));
  };

  const handleSelectNoneCourses = () => {
    setVisibleCourseIds(new Set());
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

  if (isRestoring) {
     return (
        <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50 gap-4">
            <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
            <p className="text-slate-500 font-medium">Restoring your workspace...</p>
        </div>
     );
  }

  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden relative">
      <Sidebar 
        data={data}
        selectedCourseId={selectedCourseId}
        onSelectCourse={setSelectedCourseId}
        visibleCourseIds={visibleCourseIds}
        onToggleCourseVisibility={handleToggleCourseVisibility}
        onSelectAllCourses={handleSelectAllCourses}
        onSelectNoneCourses={handleSelectNoneCourses}
        showHiddenCourses={showHiddenCourses}
        onToggleHidden={setShowHiddenCourses}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={setIsSidebarCollapsed}
        onLogout={onLogout}
        onDebug={onDebug}
        showScores={showScores}
        currentStudentId={currentStudentId}
        currentStudentName={currentStudentName}
        currentDomain={canvasUrl}
        onSwitchStudent={onSwitchStudent}
        courseCustomizations={courseCustomizations}
        onSaveCustomization={handleSaveCustomization}
        courseOrder={courseOrder}
        onUpdateCourseOrder={handleUpdateCourseOrder}
      />

      <div className="flex-1 flex flex-col min-w-0 h-full relative">
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
            hidePastEvents={hidePastEvents}
            onToggleHidePastEvents={setHidePastEvents}
            loadingCalendarEvents={loadingCalendarEvents}
            onRefreshCalendarEvents={refreshCalendarEvents}
            showArchived={showArchived}
            onToggleShowArchived={setShowArchived}
            data={data}
            onToggleNotes={() => setIsNotesOpen(!isNotesOpen)}
            onSaveSettings={() => setIsSaveDialogOpen(true)}
            isSaving={isSaving}
            onOpenLoadModal={() => setIsLoadModalOpen(true)}
            onDebugAutosave={handleDebugAutosave}
            currentStudentId={currentStudentId}
            currentStudentName={currentStudentName}
            currentDomain={canvasUrl}
            onSwitchStudent={onSwitchStudent}
         />

         <main className="flex-1 overflow-y-auto p-8 custom-scrollbar relative">
             {selectedCourse && (
                 <div className="max-w-7xl mx-auto">
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

                    {/* AI Analysis Panel */}
                    <AnalysisPanel 
                        analysis={aiAnalysis}
                        analyzing={analyzing}
                        onAnalyze={handleAnalyze}
                    />

                    {/* Main Content Area */}
                    <div className="animate-fadeIn">
                        {activeTab === 'overview' && (
                           <div className="space-y-8">
                                <Overview 
                                    course={selectedCourse} 
                                    onNavigate={setActiveTab}
                                    showScores={showScores}
                                />
                                {/* Render recent completed assignments in Overview as requested */}
                                <div>
                                     <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                                         Assignments Snapshot
                                     </h3>
                                     <AssignmentsBoard 
                                        assignments={selectedCourse.assignments}
                                        getCourseName={getCourseName}
                                        courseCustomizations={courseCustomizations}
                                        archivedAssignmentIds={archivedAssignmentIds}
                                        onToggleArchived={toggleArchived}
                                        onToggleMarkedSubmitted={toggleMarkedSubmitted}
                                        showScores={showScores}
                                        showClassAverages={showClassAverages}
                                        limitCompletedToRecent={true}
                                        showArchived={showArchived}
                                        showSubmitted={showSubmitted}
                                        showObsolete={showObsolete}
                                        showIds={showIds}
                                        canvasUrl={canvasUrl}
                                        apiKey={apiKey}
                                        useProxy={useProxy}
                                        acknowledgedFeedbackIds={acknowledgedFeedbackIds}
                                        onToggleAcknowledgeComment={handleToggleAcknowledgeComment}
                                        onAcknowledgeAllComments={handleAcknowledgeAllComments}
                                        filterFeedbackOnly={filterFeedbackOnly}
                                        onToggleFilterFeedback={setFilterFeedbackOnly}
                                     />
                                </div>
                           </div>
                        )}

                        {activeTab === 'assignments' && (
                             assignmentsViewMode === 'board' ? (
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
                                    showIds={showIds}
                                    canvasUrl={canvasUrl}
                                    apiKey={apiKey}
                                    useProxy={useProxy}
                                    acknowledgedFeedbackIds={acknowledgedFeedbackIds}
                                    onToggleAcknowledgeComment={handleToggleAcknowledgeComment}
                                    onAcknowledgeAllComments={handleAcknowledgeAllComments}
                                    filterFeedbackOnly={filterFeedbackOnly}
                                    onToggleFilterFeedback={setFilterFeedbackOnly}
                                />
                             ) : (
                                <AssignmentsTable 
                                    assignments={selectedCourse.assignments}
                                    showIds={showIds}
                                    showCourseColumn={selectedCourseId === ALL_COURSES_ID}
                                    getCourseName={getCourseName}
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
                                    canvasUrl={canvasUrl}
                                    apiKey={apiKey}
                                    useProxy={useProxy}
                                    acknowledgedFeedbackIds={acknowledgedFeedbackIds}
                                    onToggleAcknowledgeComment={handleToggleAcknowledgeComment}
                                    onAcknowledgeAllComments={handleAcknowledgeAllComments}
                                    filterFeedbackOnly={filterFeedbackOnly}
                                    onToggleFilterFeedback={setFilterFeedbackOnly}
                                />
                             )
                        )}

                        {activeTab === 'modules' && (
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
                        )}

                        {activeTab === 'canvas_todo' && (
                            <CanvasToDo 
                                items={todoItems}
                                onMarkDone={handleMarkTodoDone}
                                showIds={showIds}
                            />
                        )}
                    </div>
                 </div>
             )}
         </main>

         {/* Toasts / Notifications */}
         {saveStatus !== 'idle' && (
             <div className={`fixed bottom-4 left-4 px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 transition-all duration-300 z-50 ${
                 saveStatus === 'error' ? 'bg-red-600 text-white' : 
                 saveStatus === 'saved' ? 'bg-green-600 text-white' : 
                 'bg-slate-800 text-white'
             }`}>
                 {saveStatus === 'saving' && <Loader2 className="w-5 h-5 animate-spin" />}
                 {saveStatus === 'saved' && <Check className="w-5 h-5" />}
                 {saveStatus === 'error' && <AlertCircle className="w-5 h-5" />}
                 
                 <span className="font-medium text-sm">
                     {saveStatus === 'saving' ? 'Saving changes...' : 
                      saveStatus === 'saved' ? 'Changes saved successfully.' : 
                      'Failed to save changes.'}
                 </span>
             </div>
         )}
      </div>

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
      />

      <SaveDialog
        isOpen={isSaveDialogOpen}
        onClose={() => setIsSaveDialogOpen(false)}
        onConfirm={(name) => {
             performSave(name);
             setIsSaveDialogOpen(false);
        }}
      />
    </div>
  );
};