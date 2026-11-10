

import { CanvasCourse, CanvasAssignment, CanvasAssignmentDetail, CanvasModule, CanvasEnrollment, CourseData, CanvasTodoItem, CanvasCalendarEvent } from '../types';
import { logger } from './logger';

const MOCK_DELAY = 1500;
const NOTES_FILENAME = 'canvas_app_notes.txt';
const ROOT_FOLDER_NAME = 'CanvasOverlayApp_998734981294536';
export const SAVES_FOLDER = 'saves';
const APP_SEED = "CANVAS_OVERLAY_SECURE_SEED_V1";

// Mock Data for Demo Mode
const MOCK_COURSES: CourseData[] = [
  {
    course: { 
      id: 101, 
      name: "Introduction to Computer Science", 
      course_code: "CS101", 
      sis_course_id: "CS101_FALL24",
      is_favorite: true,
      term: { id: 1, name: "Fall 2024" }
    },
    assignments: [
      { 
        id: 1, 
        name: "Algorithm Analysis Paper", 
        description: "Write about Big O", 
        due_at: "2024-11-15T23:59:59Z", 
        points_possible: 100, 
        course_id: 101, 
        html_url: "#",
        submission: { submitted_at: "2024-11-14T10:00:00Z", grade: "95", score: 95 },
        locked_for_user: false,
        submission_types: ['online_upload'],
        score_statistics: { min: 65, max: 99, mean: 86.4 }
      },
      { 
        id: 2, 
        name: "Sorting Visualizer", 
        description: "Build a React app", 
        due_at: "2024-12-01T23:59:59Z", 
        points_possible: 150, 
        course_id: 101, 
        html_url: "#",
        submission: undefined, // Not submitted
        locked_for_user: false,
        submission_types: ['online_url'],
        score_statistics: { min: 90, max: 150, mean: 128.5 }
      },
    ],
    modules: [
      { id: 1, name: "Week 1: Basics", course_id: 101, items: [{ id: 1, title: "Syllabus", type: "Page", module_id: 1 }, { id: 2, title: "Setup Env", type: "Assignment", module_id: 1 }] },
      { id: 2, name: "Week 2: Arrays", course_id: 101, items: [{ id: 3, title: "Array Methods", type: "Page", module_id: 2 }] }
    ],
    enrollment: {
      id: 1, course_id: 101, type: "StudentEnrollment",
      grades: { current_score: 92.5, current_grade: "A-", final_score: 92.5, final_grade: "A-" }
    }
  },
  {
    course: { 
      id: 102, 
      name: "Calculus II", 
      course_code: "MATH201",
      sis_course_id: "MATH201_FALL24",
      is_favorite: true,
      term: { id: 1, name: "Fall 2024" }
    },
    assignments: [
      { 
        id: 3, 
        name: "Problem Set 1", 
        description: "Integrals", 
        due_at: "2024-10-20T23:59:59Z", 
        points_possible: 50, 
        course_id: 102, 
        html_url: "#",
        submission: { submitted_at: "2024-10-19T20:00:00Z", grade: "48", score: 48 },
        locked_for_user: false,
        submission_types: ['on_paper'],
        score_statistics: { min: 32, max: 50, mean: 43.8 }
      },
      { 
        id: 4, 
        name: "Midterm Exam", 
        description: "Covers Ch 1-5", 
        due_at: "2024-11-10T10:00:00Z", 
        points_possible: 100, 
        course_id: 102, 
        html_url: "#",
        submission: { submitted_at: null, grade: "88", score: 88 }, // No submitted_at but has score + on_paper
        locked_for_user: true,
        submission_types: ['on_paper'],
        score_statistics: { min: 55, max: 98, mean: 81.2 }
      },
    ],
    modules: [],
    enrollment: {
      id: 2, course_id: 102, type: "StudentEnrollment",
      grades: { current_score: 84.0, current_grade: "B", final_score: 84.0, final_grade: "B" }
    }
  },
  {
    course: { 
      id: 103, 
      name: "Modern Art History", 
      course_code: "ART150",
      sis_course_id: null,
      is_favorite: false,
      term: { id: 1, name: "Fall 2024" }
    },
    assignments: [
      { 
        id: 5, 
        name: "Gallery Reflection", 
        description: "Visit local gallery", 
        due_at: "2024-11-05T23:59:59Z", 
        points_possible: 20, 
        course_id: 103, 
        html_url: "#",
        submission: undefined, 
        locked_for_user: false,
        submission_types: ['online_text_entry']
      },
    ],
    modules: [
      { id: 3, name: "Impressionism", course_id: 103, items: [{ id: 4, title: "Monet Reading", type: "File", module_id: 3 }] }
    ],
    enrollment: {
      id: 3, course_id: 103, type: "StudentEnrollment",
      grades: { current_score: 98.0, current_grade: "A+", final_score: 98.0, final_grade: "A+" }
    }
  },
  {
    course: {
      id: 104,
      name: "AP Spanish Language & Culture (Español)",
      course_code: "SPAN301",
      sis_course_id: "SPAN301_FALL24",
      is_favorite: true,
      term: { id: 1, name: "Fall 2024" }
    },
    assignments: [
      {
        id: 7,
        name: "Ensayo: Tradiciones familiares y su impacto cultural",
        description: "Escriba un ensayo de 500 palabras analizando el impacto de las tradiciones familiares en la identidad contemporánea en los países hispanohablantes. Use ejemplos de las lecturas asignadas.",
        due_at: new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString(),
        points_possible: 50,
        course_id: 104,
        html_url: "#",
        submission: undefined,
        locked_for_user: false,
        submission_types: ['online_upload'],
        score_statistics: { min: 35, max: 50, mean: 44.5 }
      },
      {
        id: 8,
        name: "Grabación oral: La influencia de la música latina",
        description: "Grabe una respuesta oral de 2 minutos explicando cómo la música folclórica y contemporánea refleja la historia social de Latinoamérica.",
        due_at: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
        points_possible: 30,
        course_id: 104,
        html_url: "#",
        submission: undefined,
        locked_for_user: false,
        submission_types: ['media_recording']
      }
    ],
    modules: [
      {
        id: 4,
        name: "Unidad 1: Familias y Comunidades",
        course_id: 104,
        items: [
          { id: 10, title: "Vocabulario: Relaciones familiares", type: "Page", module_id: 4 },
          { id: 7, title: "Ensayo: Tradiciones familiares y su impacto cultural", type: "Assignment", module_id: 4 }
        ]
      }
    ],
    enrollment: {
      id: 4,
      course_id: 104,
      type: "StudentEnrollment",
      grades: { current_score: 91.0, current_grade: "A-", final_score: 91.0, final_grade: "A-" }
    }
  }
];

export const fetchMockData = async (): Promise<CourseData[]> => {
  logger.info("Using Mock Data Source");
  return new Promise((resolve) => {
    setTimeout(() => {
      logger.info("Mock Data successfully loaded");
      resolve(MOCK_COURSES);
    }, MOCK_DELAY);
  });
};

// Proxy URL builders (Keys and external proxies handled server-side to prevent leaking secrets to GitHub/browser)
export const toInternalProxyUrl = (targetUrl: string): string => {
  if (targetUrl.startsWith('/api/proxy')) return targetUrl;
  return `/api/proxy?url=${encodeURIComponent(targetUrl)}`;
};

export const toExternalCorsProxyUrl = (targetUrl: string, key?: string): string => {
  if (targetUrl.startsWith('https://corsproxy.io/')) return targetUrl;
  return key 
    ? `https://corsproxy.io/?key=${encodeURIComponent(key)}&url=${encodeURIComponent(targetUrl)}`
    : `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`;
};

// Default proxy URL uses internal server proxy to prevent 401s from inactive keys and eliminate CORS preflight issues
export const toCorsProxyUrl = (targetUrl: string, _optionalKey?: string): string => {
  if (targetUrl.startsWith('/api/proxy') || targetUrl.startsWith('https://corsproxy.io/')) {
    return targetUrl;
  }
  return toInternalProxyUrl(targetUrl);
};

// Helper for building proxied URLs
const buildUrl = (domain: string, path: string, useProxy: boolean, params: Record<string, any> = {}) => {
  const baseUrl = domain.startsWith('http') ? domain : `https://${domain}`;
  const cleanUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  let targetUrl = `${cleanUrl}${path}`;
  
  const queryString = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
    
  if (queryString) {
    targetUrl += (targetUrl.includes('?') ? '&' : '?') + queryString;
  }

  return useProxy 
    ? toCorsProxyUrl(targetUrl) 
    : targetUrl;
};

// Generic Fetch for Debugger
export const genericCanvasFetch = async (
  domain: string, 
  token: string, 
  endpoint: string, 
  useProxy: boolean = false,
  method: string = 'GET',
  body?: any
): Promise<any> => {
  const baseUrl = domain.startsWith('http') ? domain : `https://${domain}`;
  const cleanUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  
  // Determine if endpoint is absolute or relative
  let targetUrl = endpoint;
  if (!endpoint.startsWith('http')) {
     // Ensure it starts with /
     const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
     // Auto-prepend /api/v1 if missing and not just /
     if (!path.includes('/api/v1') && path !== '/') {
         targetUrl = `${cleanUrl}/api/v1${path}`;
     } else if (path.includes('/api/v1')) {
         targetUrl = `${cleanUrl}${path}`;
     } else {
         targetUrl = `${cleanUrl}${path}`;
     }
  }

  const url = useProxy 
    ? toCorsProxyUrl(targetUrl) 
    : targetUrl;

  const options: RequestInit = {
    method: method,
    headers: {
      'Authorization': `Bearer ${token.trim()}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
  };

  if (body && (method === 'POST' || method === 'PUT')) {
      options.body = typeof body === 'string' ? body : JSON.stringify(body);
  }

  try {
    let response: Response;
    try {
      response = await fetch(url, options);
    } catch (netErr: any) {
      if (!url.startsWith('/api/proxy')) {
        const fallbackUrl = toInternalProxyUrl(targetUrl);
        logger.warn(`Fetch to ${url} failed, retrying via internal proxy: ${fallbackUrl}`);
        response = await fetch(fallbackUrl, options);
      } else {
        throw netErr;
      }
    }

    let data;
    const text = await response.text();
    try {
        data = JSON.parse(text);
    } catch {
        data = text;
    }
    
    return {
      status: response.status,
      statusText: response.statusText,
      headers: Array.from(response.headers.entries()),
      data: data
    };
  } catch (e: any) {
     throw new Error(e.message || "Network Error");
  }
};

// Safe JSON parser to avoid "Unexpected token '<', '<!DOCTYPE '... is not valid JSON"
const parseSafeJson = async (res: Response, endpointDescription: string = 'API response'): Promise<any> => {
  const text = await res.text();
  const trimmed = text.trim();
  if (trimmed.startsWith('<')) {
    logger.error(`Received HTML instead of JSON for ${endpointDescription}`, trimmed.slice(0, 150));
    throw new Error(`Received an HTML response instead of JSON. Please verify that your Canvas domain is correct.`);
  }
  try {
    return JSON.parse(text);
  } catch (err: any) {
    throw new Error(`Failed to parse ${endpointDescription} as JSON: ${err.message}`);
  }
};

// Get User ID for storage separation
const getUserId = async (domain: string, token: string, useProxy: boolean): Promise<string> => {
    const url = buildUrl(domain, '/api/v1/users/self/profile', useProxy);
    try {
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token.trim()}` }});
        if (res.ok) {
            const data = await parseSafeJson(res, 'User Profile');
            return String(data.id);
        }
    } catch (e) {
        logger.warn("Failed to fetch user profile for ID generation");
    }
    throw new Error("Unable to identify user. Cannot access secure storage.");
};

/**
 * Fetch the logged-in student's real display name from Canvas (/api/v1/users/self)
 */
export const fetchStudentName = async (domain: string, token: string, useProxy: boolean): Promise<string | null> => {
    try {
        const url = buildUrl(domain, '/api/v1/users/self/profile', useProxy);
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token.trim()}` }});
        if (res.ok) {
            const data = await parseSafeJson(res, 'User Profile');
            if (data?.name && typeof data.name === 'string' && data.name.trim()) {
                return data.name.trim();
            }
            if (data?.short_name && typeof data.short_name === 'string' && data.short_name.trim()) {
                return data.short_name.trim();
            }
        }
        // Fallback to /api/v1/users/self
        const selfUrl = buildUrl(domain, '/api/v1/users/self', useProxy);
        const selfRes = await fetch(selfUrl, { headers: { 'Authorization': `Bearer ${token.trim()}` }});
        if (selfRes.ok) {
            const selfData = await parseSafeJson(selfRes, 'User Self');
            if (selfData?.name && typeof selfData.name === 'string' && selfData.name.trim()) {
                return selfData.name.trim();
            }
            if (selfData?.short_name && typeof selfData.short_name === 'string' && selfData.short_name.trim()) {
                return selfData.short_name.trim();
            }
        }
    } catch (e: any) {
        logger.warn("Failed to fetch student name from Canvas:", e.message);
    }
    return null;
};

// Generate deterministic hash for folder name
const generateHashCode = async (seed: string, input: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(`${seed}:${input}`);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
};

// Ensure a specific folder exists
const ensureFolderExists = async (domain: string, token: string, folderName: string, parentPath: string, useProxy: boolean): Promise<boolean> => {
    // 1. Try to find the folder by path
    const fullPath = parentPath === '/' ? `/${folderName}` : `${parentPath}/${folderName}`;
    const findUrl = buildUrl(domain, `/api/v1/users/self/folders/by_path${fullPath}`, useProxy, { _t: Date.now() });
    
    try {
        const res = await fetch(findUrl, {
            headers: { 'Authorization': `Bearer ${token.trim()}` }
        });
        if (res.ok) {
             const data = await parseSafeJson(res, 'folder search');
             // Canvas sometimes returns an array of results for by_path queries
             if (Array.isArray(data)) {
                 if (data.length > 0) {
                     // Verify if one of the results matches our folder name
                     const match = data.find((f: any) => f.name === folderName);
                     if (match) return true;
                     return true; // Loose match fallback
                 }
             } else {
                 return true;
             }
        }
    } catch (e) {
        logger.warn(`Could not verify folder ${fullPath}, attempting creation.`);
    }

    // 2. Create if not found
    const createUrl = buildUrl(domain, `/api/v1/users/self/folders`, useProxy);
    const params = new URLSearchParams();
    params.append('name', folderName);
    params.append('parent_folder_path', parentPath);

    try {
        const createRes = await fetch(createUrl, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token.trim()}` },
            body: params
        });
        
        if (createRes.ok) return true;
        
        logger.error(`Failed to create folder ${folderName} in ${parentPath}`, createRes.status);
        return false;
    } catch (e) {
        logger.error("Error creating folder", e);
        return false;
    }
};

// Generic Save File to Canvas
export const saveFileToCanvas = async (
  domain: string, 
  token: string, 
  filename: string, 
  content: string, 
  useProxy: boolean,
  subfolder: string = '',
  isBackground: boolean = false
) => {
  logger.info(`Saving file '${filename}' to Canvas (subfolder: ${subfolder || 'root'})...`);
  
  // Step 1: Resolve Storage Path
  const userId = await getUserId(domain, token, useProxy);
  const code = await generateHashCode(APP_SEED, userId);
  let storagePath = `/${ROOT_FOLDER_NAME}/${code}`;
  if (subfolder) {
      storagePath += `/${subfolder}`;
  }
  
  logger.info(`Resolved storage path: ${storagePath}`);

  // Step 2: Ensure Directory Structure
  // Note: We cannot skip this safely even for background tasks as folder must exist
  await ensureFolderExists(domain, token, ROOT_FOLDER_NAME, '/', useProxy);
  await ensureFolderExists(domain, token, code, `/${ROOT_FOLDER_NAME}`, useProxy);
  if (subfolder) {
      const created = await ensureFolderExists(domain, token, subfolder, `/${ROOT_FOLDER_NAME}/${code}`, useProxy);
      if (!created && !isBackground) {
          logger.warn("Subfolder creation may have failed, attempting upload anyway...");
      }
  }

  // Step 3: Notify Canvas of upload intent
  const initUrl = buildUrl(domain, '/api/v1/users/self/files', useProxy);
  
  const formData = new FormData();
  formData.append('name', filename);
  formData.append('content_type', filename.endsWith('.json') ? 'application/json' : 'text/plain');
  formData.append('parent_folder_path', storagePath);
  formData.append('on_duplicate', 'overwrite');
  
  try {
      const initResponse = await fetch(initUrl, {
          method: 'POST',
          headers: {
              'Authorization': `Bearer ${token.trim()}`,
          },
          body: formData,
          keepalive: isBackground
      });

      if (!initResponse.ok) {
          const txt = await initResponse.text();
          throw new Error(`Upload init failed: ${initResponse.status} ${txt}`);
      }

      const initData = await parseSafeJson(initResponse, 'upload init');
      const uploadUrl = initData.upload_url;
      
      if (!uploadUrl) {
           throw new Error("Canvas did not return an upload_url");
      }

      const uploadParams = initData.upload_params;

      logger.info(`Upload initialized. Sending file to: ${uploadUrl}`);

      // Step 4: Upload the file content
      const uploadFormData = new FormData();
      Object.entries(uploadParams).forEach(([key, value]) => {
          uploadFormData.append(key, value as string);
      });
      
      const blob = new Blob([content], { type: filename.endsWith('.json') ? 'application/json' : 'text/plain' });
      uploadFormData.append('file', blob, filename);

      const finalUploadUrl = useProxy 
          ? toCorsProxyUrl(uploadUrl) 
          : uploadUrl;

      const uploadResponse = await fetch(finalUploadUrl, {
          method: 'POST',
          body: uploadFormData,
          keepalive: isBackground
      });

      if (!uploadResponse.ok) {
         throw new Error(`File upload failed: ${uploadResponse.status}`);
      }
      
      logger.info(`File '${filename}' saved successfully!`);
      return true;

  } catch (e: any) {
      logger.error(`Save file '${filename}' failed`, e);
      throw e;
  }
};

// Generic Get File from Canvas
export const getFileFromCanvas = async (
  domain: string, 
  token: string, 
  filename: string, 
  useProxy: boolean,
  subfolder: string = ''
): Promise<string> => {
    logger.info(`Searching for existing file: ${filename} in ${subfolder || 'root'}...`);

    // Step 1: Resolve Storage Path
    try {
        const userId = await getUserId(domain, token, useProxy);
        const code = await generateHashCode(APP_SEED, userId);
        let storagePath = `/${ROOT_FOLDER_NAME}/${code}`;
        if (subfolder) storagePath += `/${subfolder}`;
        
        logger.info(`Looking for file in: ${storagePath}`);

        // Step 2: Get Folder Details (to find the files list URL)
        // Add cache-busting timestamp
        const folderUrl = buildUrl(domain, `/api/v1/users/self/folders/by_path${storagePath}`, useProxy, { _t: Date.now() });
        const folderRes = await fetch(folderUrl, { headers: { 'Authorization': `Bearer ${token.trim()}` }});
        
        if (!folderRes.ok) {
            logger.info("No storage folder found.");
            return ""; 
        }
        
        const folderResponse = await parseSafeJson(folderRes, 'storage folder');
        let folderData = folderResponse;

        // Handle array response (search results)
        if (Array.isArray(folderResponse)) {
             // Find the exact match for our folder
             const targetName = subfolder ? subfolder : code;
             const match = folderResponse.find((f: any) => f.name === targetName);
             if (match) {
                 folderData = match;
             } else if (folderResponse.length > 0) {
                 folderData = folderResponse[folderResponse.length - 1];
             } else {
                 logger.warn("Folder search returned empty list");
                 return "";
             }
        }
        
        // Safeguard against unexpected API response structure
        if (!folderData || !folderData.files_url) {
             logger.warn("Folder data missing files_url", folderData);
             return "";
        }
        
        const filesUrl = folderData.files_url;

        // Step 3: List files in the folder
        const listUrl = useProxy ? toCorsProxyUrl(filesUrl) : filesUrl;
        const listRes = await fetch(listUrl, { headers: { 'Authorization': `Bearer ${token.trim()}` }});
        
        if (!listRes.ok) throw new Error("Failed to list files in storage folder");
        
        const files = await parseSafeJson(listRes, 'files list');
        // Sort by created_at desc to get latest if duplicates exist (though we overwrite)
        files.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        
        const targetFile = files.find((f: any) => f.display_name === filename || f.filename === filename);

        if (!targetFile) {
            logger.info(`File '${filename}' not found in storage.`);
            return "";
        }

        // Step 4: Download content
        logger.info(`Found file (ID: ${targetFile.id}). Downloading...`);
        return await downloadRawFile(targetFile.url, token, useProxy);

    } catch (e: any) {
        logger.error(`Failed to load file ${filename}`, e);
        throw e;
    }
};

// New Helper: Download content from a direct file URL
export const downloadRawFile = async (downloadUrl: string, token: string, useProxy: boolean): Promise<string> => {
    if (!downloadUrl) return "";

    // Check if the URL is pre-verified (standard for Canvas API file objects OR S3 signed URLs)
    // If it is, we MUST NOT send the Authorization header, as S3 will reject it.
    const isVerified = downloadUrl.includes('verifier=') || downloadUrl.includes('X-Amz-Algorithm');
    const shouldSendAuth = !isVerified;
    
    let headers: Record<string, string> = {};
    if (shouldSendAuth) {
            headers['Authorization'] = `Bearer ${token.trim()}`;
    }
    
    // Attempt 1: Direct Download (regardless of useProxy)
    try {
        const contentRes = await fetch(downloadUrl, { headers });
        if (!contentRes.ok) throw new Error(`Direct status ${contentRes.status}`);
        return await contentRes.text();
    } catch (directErr: any) {
        logger.warn(`Direct download failed: ${directErr.message}`);

        // Fallback to Proxy if enabled
        if (useProxy) {
                const proxyUrl = toCorsProxyUrl(downloadUrl);
                logger.info(`Falling back to proxy download...`);
                
                try {
                const proxyRes = await fetch(proxyUrl, { headers });
                if (!proxyRes.ok) throw new Error(`Proxy status ${proxyRes.status}`);
                return await proxyRes.text();
                } catch (proxyErr: any) {
                // Attempt 3: Proxy WITHOUT Auth
                if (shouldSendAuth) {
                    logger.warn("Proxy with auth failed, retrying without auth headers...");
                    const retryRes = await fetch(proxyUrl, { headers: {} });
                    if (!retryRes.ok) throw new Error(`Retry failed: ${retryRes.status}`);
                    return await retryRes.text();
                }
                throw proxyErr;
                }
        }
        
        // If no proxy, and we used auth, try without auth as last ditch effort
        if (shouldSendAuth) {
                logger.warn("Retrying direct download without auth headers...");
                const retryRes = await fetch(downloadUrl, { headers: {} });
                if (!retryRes.ok) throw new Error(`Retry failed: ${retryRes.status}`);
                return await retryRes.text();
        }

        throw directErr;
    }
};

// New Helper: List all files in the app storage folder
export const listSaveStates = async (
  domain: string, 
  token: string, 
  useProxy: boolean,
  subfolder: string = SAVES_FOLDER
): Promise<any[]> => {
    logger.info(`Listing available save states in ${subfolder || 'root'}...`);
    try {
        // 1. Resolve Path
        const userId = await getUserId(domain, token, useProxy);
        const code = await generateHashCode(APP_SEED, userId);
        let storagePath = `/${ROOT_FOLDER_NAME}/${code}`;
        if (subfolder) storagePath += `/${subfolder}`;

        // 2. Get Folder
        // Add cache busting timestamp
        const folderUrl = buildUrl(domain, `/api/v1/users/self/folders/by_path${storagePath}`, useProxy, { _t: Date.now() });
        const folderRes = await fetch(folderUrl, { headers: { 'Authorization': `Bearer ${token.trim()}` }});
        
        if (!folderRes.ok) return [];
        
        let folderData = await parseSafeJson(folderRes, 'folders list');

        // Handle array response
        if (Array.isArray(folderData)) {
             const targetName = subfolder ? subfolder : code;
             const match = folderData.find((f: any) => f.name === targetName);
             folderData = match || folderData[folderData.length - 1];
        }

        if (!folderData || !folderData.files_url) return [];

        // 3. List Files
        // Add cache busting to files list url as well
        // Add pagination and sorting to ensure we see the newest files despite default pagination limits
        const params = [
            `_t=${Date.now()}`,
            'sort=created_at',
            'order=desc',
            'per_page=100'
        ].join('&');
        
        const sep = folderData.files_url.includes('?') ? '&' : '?';
        const targetListUrl = folderData.files_url + sep + params;

        const listUrl = useProxy 
           ? toCorsProxyUrl(targetListUrl) 
           : targetListUrl;
           
        const listRes = await fetch(listUrl, { headers: { 'Authorization': `Bearer ${token.trim()}` }});

        if (!listRes.ok) return [];
        
        const files = await parseSafeJson(listRes, 'files in folder');
        return Array.isArray(files) ? files.filter((f: any) => f.filename.endsWith('.json')) : [];

    } catch (e: any) {
        logger.warn("Failed to list save states", e.message);
        return [];
    }
};

// Delete a file from Canvas
export const deleteFileFromCanvas = async (
  domain: string, 
  token: string, 
  fileId: number, 
  useProxy: boolean
): Promise<boolean> => {
    logger.info(`Deleting file ID ${fileId}...`);
    try {
        // API: DELETE /api/v1/files/:id
        const result = await genericCanvasFetch(domain, token, `/files/${fileId}`, useProxy, 'DELETE');
        if (result.status >= 200 && result.status < 300) {
            return true;
        }
        return false;
    } catch (e: any) {
        logger.error(`Failed to delete file ${fileId}`, e.message);
        return false;
    }
};

// Wrapper for saving notes (backward compatibility)
export const saveNoteToCanvas = async (domain: string, token: string, content: string, useProxy: boolean) => {
    return saveFileToCanvas(domain, token, NOTES_FILENAME, content, useProxy, '');
};

// Wrapper for getting notes
export const getNoteFromCanvas = async (domain: string, token: string, useProxy: boolean): Promise<string> => {
    return getFileFromCanvas(domain, token, NOTES_FILENAME, useProxy, '');
};

export const fetchCanvasData = async (domain: string, token: string, useProxy: boolean = false, batchSize: number = 2): Promise<CourseData[]> => {
  logger.info(`Starting Canvas API connection to ${domain} (Proxy: ${useProxy}, Batch: ${batchSize})`);

  // Helper to handle fetch with auth headers and pagination
  const fetchPage = async (endpoint: string, page: number = 1) => {
    const targetUrl = buildUrl(domain, `/api/v1${endpoint}`, useProxy, {
        per_page: 100,
        page: page
    });

    let response: Response;
    try {
      response = await fetch(targetUrl, {
        headers: {
          // Trim token to ensure no whitespace issues cause 401
          'Authorization': `Bearer ${token.trim()}`,
          'Accept': 'application/json',
        },
      });
    } catch (fetchErr: any) {
      // Auto-fallback: If request failed and not yet using internal proxy, retry via internal proxy
      if (!targetUrl.startsWith('/api/proxy')) {
        const rawTargetUrl = buildUrl(domain, `/api/v1${endpoint}`, false, {
          per_page: 100,
          page: page
        });
        const internalUrl = toInternalProxyUrl(rawTargetUrl);
        logger.warn(`Fetch failed (${fetchErr.message}). Retrying via internal proxy: ${internalUrl}`);
        response = await fetch(internalUrl, {
          headers: {
            'Authorization': `Bearer ${token.trim()}`,
            'Accept': 'application/json',
          },
        });
      } else {
        throw fetchErr;
      }
    }

    if (!response.ok) {
      if (response.status === 401) {
         throw new Error("Unauthorized (401): Invalid API Key. Please check your token and domain.");
      }
      if (response.status === 403) {
         throw new Error("Forbidden (403): You may not have permission to access this resource.");
      }
      throw new Error(`Canvas API Error: ${response.status} ${response.statusText}`);
    }
    return parseSafeJson(response, `Canvas API ${endpoint}`);
  };

  // Helper to fetch ALL pages of data
  const fetchAll = async (endpoint: string) => {
    let page = 1;
    let allResults: any[] = [];
    let hasMore = true;
    const MAX_PAGES = 20; // Safety limit

    while (hasMore && page <= MAX_PAGES) {
        const results = await fetchPage(endpoint, page);
        if (Array.isArray(results) && results.length > 0) {
            allResults = [...allResults, ...results];
            if (results.length < 100) {
                hasMore = false;
            } else {
                page++;
            }
        } else {
            hasMore = false;
        }
    }
    return allResults;
  };

  try {
    // 1. Fetch Courses 
    logger.info("Fetching courses list...");
    const courses: CanvasCourse[] = await fetchPage('/courses?enrollment_state=active&include[]=term&include[]=favorites', 1);
    logger.info(`Successfully fetched ${courses.length} courses.`);
    
    // 2. Batched Fetch Details
    const results: CourseData[] = [];

    for (let i = 0; i < courses.length; i += batchSize) {
        const chunk = courses.slice(i, i + batchSize);
        const courseIds = chunk.map(c => `${c.course_code}[id:${c.id}]`).join(', ');
        logger.info(`Processing details batch ${Math.floor(i/batchSize) + 1} of ${Math.ceil(courses.length/batchSize)} (Courses: ${courseIds})`);
        
        const chunkPromises = chunk.map(async (course) => {
            try {
                const [assignmentsRaw, modules, enrollments] = await Promise.all([
                // Added include[]=submission_comments and include[]=score_statistics
                fetchAll(`/courses/${course.id}/assignments?include[]=submission&include[]=submission_comments&include[]=score_statistics`).catch((e) => {
                   logger.warn(`Failed to fetch assignments for course ${course.id}`, e.message);
                   return [];
                }),
                fetchAll(`/courses/${course.id}/modules?include[]=items`).catch((e) => {
                   logger.warn(`Failed to fetch modules for course ${course.id}`, e.message);
                   return [];
                }),
                fetchPage(`/courses/${course.id}/enrollments?user_id=self&include[]=total_scores`, 1).catch((e) => {
                   logger.warn(`Failed to fetch enrollments for course ${course.id}`, e.message);
                   return [];
                }),
                ]);

                const enrollment = enrollments.find((e: CanvasEnrollment) => e.course_id === course.id);
                
                const assignmentsMap = new Map();
                if (Array.isArray(assignmentsRaw)) {
                    assignmentsRaw.forEach((a: CanvasAssignment) => assignmentsMap.set(a.id, a));
                }
                const assignments = Array.from(assignmentsMap.values());

                logger.info(`Data loaded for course: ${course.course_code} (${assignments.length} assignments)`);
                
                return {
                course,
                assignments,
                modules: Array.isArray(modules) ? modules : [],
                enrollment,
                };
            } catch (err: any) {
                logger.error(`Critical failure for course ${course.id} [${course.name}]`, err.message);
                return { course, assignments: [], modules: [] };
            }
        });

        const chunkResults = await Promise.all(chunkPromises);
        results.push(...chunkResults);
    }
    
    logger.info("All course data fetched successfully.");
    return results;

  } catch (error: any) {
    logger.error("Main Fetch Error", error.message);
    let msg = error.message || "Failed to connect to Canvas.";
    if (msg.includes("Failed to fetch")) {
      msg = "Network Error: Could not connect to Canvas. Please verify the domain and ensure your network allows connection.";
    }
    throw new Error(msg);
  }
};

// Fetch the Canvas ToDo List (from /users/self/todo)
export const fetchTodoItems = async (domain: string, token: string, useProxy: boolean): Promise<CanvasTodoItem[]> => {
    logger.info("Fetching global todo items...");
    try {
        const result = await genericCanvasFetch(domain, token, '/users/self/todo', useProxy);
        if (result.status === 200 && Array.isArray(result.data)) {
            return result.data;
        }
        return [];
    } catch (e: any) {
        logger.error("Failed to fetch todo items", e.message);
        return [];
    }
};

// Mark a ToDo item as Done (using the ignore URL provided by Canvas)
export const dismissTodoItem = async (domain: string, token: string, useProxy: boolean, item: CanvasTodoItem) => {
    if (!item.ignore) {
        logger.warn("Cannot dismiss todo item, no ignore URL found.", item);
        return false;
    }
    
    logger.info(`Dismissing todo item via ${item.ignore}`);
    try {
        // The 'ignore' URL is usually absolute. genericCanvasFetch handles absolute URLs.
        // Canvas API typically expects a DELETE request to the ignore URL, or sometimes a POST. 
        // We'll try DELETE first as it matches REST semantics for removing from a list.
        const res = await genericCanvasFetch(domain, token, item.ignore, useProxy, 'DELETE');
        
        if (res.status >= 200 && res.status < 300) {
            return true;
        }
        
        // If DELETE fails, try POST?
        logger.warn(`DELETE failed (${res.status}), trying POST to ignore...`);
        const resPost = await genericCanvasFetch(domain, token, item.ignore, useProxy, 'POST');
        return resPost.status >= 200 && resPost.status < 300;

    } catch (e: any) {
        logger.error("Failed to dismiss todo item", e.message);
        return false;
    }
};

// Helper to extract course ID from a calendar event
export const getCourseIdFromEvent = (ev: CanvasCalendarEvent): number | null => {
    if (ev.context_code && ev.context_code.startsWith('course_')) {
        const parsed = parseInt(ev.context_code.replace('course_', ''), 10);
        if (!isNaN(parsed)) return parsed;
    }
    if (ev.effective_context_code && ev.effective_context_code.startsWith('course_')) {
        const parsed = parseInt(ev.effective_context_code.replace('course_', ''), 10);
        if (!isNaN(parsed)) return parsed;
    }
    if (ev.context_type?.toLowerCase() === 'course' && ev.context_id) {
        return ev.context_id;
    }
    if ((ev as any).course_id) {
        return (ev as any).course_id;
    }
    return null;
};

const formatDateYMD = (d: Date): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// Helper to fetch calendar events with pagination support
export const fetchCalendarEventsPaginated = async (
    domain: string,
    token: string,
    endpointBase: string,
    useProxy: boolean,
    maxPages: number = 5
): Promise<{ events: CanvasCalendarEvent[]; pagesFetched: number; lastStatus?: number; error?: string }> => {
    const events: CanvasCalendarEvent[] = [];
    let page = 1;
    let hasMore = true;
    let lastStatus: number | undefined;
    let lastError: string | undefined;

    while (hasMore && page <= maxPages) {
        const sep = endpointBase.includes('?') ? '&' : '?';
        const url = `${endpointBase}${sep}per_page=100&page=${page}`;
        try {
            const res = await genericCanvasFetch(domain, token, url, useProxy);
            lastStatus = res.status;
            if (res.status === 200 && Array.isArray(res.data)) {
                events.push(...res.data);
                if (res.data.length < 100) {
                    hasMore = false;
                } else {
                    page++;
                }
            } else {
                lastError = `HTTP ${res.status}: ${res.statusText || 'Non-200 response'}`;
                hasMore = false;
            }
        } catch (err: any) {
            lastError = err.message;
            hasMore = false;
        }
    }
    return { events, pagesFetched: page, lastStatus, error: lastError };
};

// Comprehensive diagnostics for calendar events fetching (used by Debug panel)
export interface CalendarDiagnosticsReport {
    summary: string;
    totalEventsFound: number;
    futureEventsFound: number;
    pastEventsFound: number;
    courseIdsQueried: number[];
    sources: {
        upcomingEvents: {
            endpoint: string;
            status?: number;
            count: number;
            sample?: any[];
            error?: string;
        };
        personalEvents: {
            endpoint: string;
            status?: number;
            count: number;
            sample?: any[];
            error?: string;
        };
        courseBatches: Array<{
            batch: number[];
            futureEndpoint: string;
            futureCount: number;
            pastEndpoint: string;
            pastCount: number;
            status?: number;
            sample?: any[];
            error?: string;
        }>;
    };
    allEvents: CanvasCalendarEvent[];
}

export const diagnoseCalendarEventsFetch = async (
    domain: string, 
    token: string, 
    useProxy: boolean,
    courseIds: number[] = []
): Promise<CalendarDiagnosticsReport> => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);
    const pastLimit = new Date(now.getTime() - 90 * 24 * 3600 * 1000);
    const futureLimit = new Date(now.getTime() + 365 * 24 * 3600 * 1000);

    const todayStr = formatDateYMD(yesterday);
    const futureEndStr = formatDateYMD(futureLimit);
    const pastStartStr = formatDateYMD(pastLimit);

    const report: CalendarDiagnosticsReport = {
        summary: '',
        totalEventsFound: 0,
        futureEventsFound: 0,
        pastEventsFound: 0,
        courseIdsQueried: courseIds,
        sources: {
            upcomingEvents: { endpoint: '/users/self/upcoming_events?per_page=100', count: 0 },
            personalEvents: { endpoint: `/calendar_events?type=event&start_date=${todayStr}&end_date=${futureEndStr}`, count: 0 },
            courseBatches: []
        },
        allEvents: []
    };

    const eventsMap = new Map<number, CanvasCalendarEvent>();

    // 1. Check /users/self/upcoming_events
    try {
        const res = await genericCanvasFetch(domain, token, '/users/self/upcoming_events?per_page=100', useProxy);
        report.sources.upcomingEvents.status = res.status;
        if (res.status === 200 && Array.isArray(res.data)) {
            const nonAssignmentEvents = res.data.filter((item: any) => !item.assignment && item.type !== 'assignment');
            report.sources.upcomingEvents.count = nonAssignmentEvents.length;
            report.sources.upcomingEvents.sample = nonAssignmentEvents.slice(0, 5);
            nonAssignmentEvents.forEach((ev: CanvasCalendarEvent) => {
                if (ev.id) eventsMap.set(ev.id, ev);
            });
        } else {
            report.sources.upcomingEvents.error = `HTTP ${res.status}: ${res.statusText || 'Unexpected response'}`;
        }
    } catch (e: any) {
        report.sources.upcomingEvents.error = e.message;
    }

    // 2. Check Personal Calendar (Future + Past)
    try {
        const personalRes = await fetchCalendarEventsPaginated(
            domain,
            token,
            `/calendar_events?type=event&start_date=${todayStr}&end_date=${futureEndStr}`,
            useProxy,
            3
        );
        report.sources.personalEvents.status = personalRes.lastStatus;
        report.sources.personalEvents.count = personalRes.events.length;
        report.sources.personalEvents.sample = personalRes.events.slice(0, 5);
        if (personalRes.error) report.sources.personalEvents.error = personalRes.error;
        personalRes.events.forEach((ev: CanvasCalendarEvent) => {
            if (ev.id) eventsMap.set(ev.id, ev);
        });

        // Also check past personal
        const personalPastRes = await fetchCalendarEventsPaginated(
            domain,
            token,
            `/calendar_events?type=event&start_date=${pastStartStr}&end_date=${todayStr}`,
            useProxy,
            2
        );
        personalPastRes.events.forEach((ev: CanvasCalendarEvent) => {
            if (ev.id) eventsMap.set(ev.id, ev);
        });
    } catch (e: any) {
        report.sources.personalEvents.error = e.message;
    }

    // 3. Check course batches (up to 10 context codes each)
    const validCourseIds = courseIds.filter(id => id > 0);
    const chunks: number[][] = [];
    for (let i = 0; i < validCourseIds.length; i += 10) {
        chunks.push(validCourseIds.slice(i, i + 10));
    }

    for (const chunk of chunks) {
        const queryPart = chunk.map(id => `context_codes[]=${encodeURIComponent(`course_${id}`)}`).join('&');
        const futureEndpoint = `/calendar_events?type=event&start_date=${todayStr}&end_date=${futureEndStr}&${queryPart}`;
        const pastEndpoint = `/calendar_events?type=event&start_date=${pastStartStr}&end_date=${todayStr}&${queryPart}`;
        
        const batchInfo: any = {
            batch: chunk,
            futureEndpoint,
            futureCount: 0,
            pastEndpoint,
            pastCount: 0
        };

        try {
            // Future course events
            const futureRes = await fetchCalendarEventsPaginated(domain, token, futureEndpoint, useProxy, 5);
            batchInfo.status = futureRes.lastStatus;
            batchInfo.futureCount = futureRes.events.length;
            batchInfo.sample = futureRes.events.slice(0, 5);
            if (futureRes.error) batchInfo.error = futureRes.error;
            futureRes.events.forEach((ev: CanvasCalendarEvent) => {
                if (ev.id) eventsMap.set(ev.id, ev);
            });

            // Past course events
            const pastRes = await fetchCalendarEventsPaginated(domain, token, pastEndpoint, useProxy, 3);
            batchInfo.pastCount = pastRes.events.length;
            pastRes.events.forEach((ev: CanvasCalendarEvent) => {
                if (ev.id) eventsMap.set(ev.id, ev);
            });
        } catch (e: any) {
            batchInfo.error = e.message;
        }
        report.sources.courseBatches.push(batchInfo);
    }

    report.allEvents = Array.from(eventsMap.values());
    report.totalEventsFound = report.allEvents.length;

    const nowTime = now.getTime();
    report.futureEventsFound = report.allEvents.filter(e => {
        const t = new Date(e.end_at || e.start_at || (e.all_day_date ? `${e.all_day_date}T23:59:59` : '')).getTime();
        return !isNaN(t) && t >= nowTime;
    }).length;
    report.pastEventsFound = report.totalEventsFound - report.futureEventsFound;

    report.summary = `Fetched ${report.totalEventsFound} unique calendar events (${report.futureEventsFound} future, ${report.pastEventsFound} past) across ${chunks.length + 2} queries.`;
    return report;
};

// Fetch Calendar Events from Canvas LMS (or return mock events in demo mode)
export const fetchCalendarEvents = async (
    domain: string, 
    token: string, 
    useProxy: boolean,
    courseIds: number[] = []
): Promise<CanvasCalendarEvent[]> => {
    const isDemo = !domain || domain === 'DEMO' || !token || token === 'DEMO' || token.toLowerCase().startsWith('demo');
    if (isDemo) {
        const now = Date.now();
        const tomorrow = new Date(now + 24 * 3600 * 1000).toISOString();
        const inThreeDays = new Date(now + 3 * 24 * 3600 * 1000).toISOString();
        const nextWeek = new Date(now + 7 * 24 * 3600 * 1000).toISOString();
        const inTwoWeeks = new Date(now + 14 * 24 * 3600 * 1000).toISOString();

        return [
            {
                id: 9001,
                title: "CS Colloquium: Modern Distributed Systems",
                start_at: tomorrow,
                end_at: new Date(now + (24 + 2) * 3600 * 1000).toISOString(),
                description: "Guest lecture in Turing Hall Room 101.",
                context_code: "course_101",
                effective_context_code: "course_101",
                location_name: "Turing Hall 101",
                html_url: "#",
                workflow_state: "active"
            },
            {
                id: 9002,
                title: "Calculus Midterm Review Session",
                start_at: inThreeDays,
                end_at: new Date(now + (3 * 24 + 2) * 3600 * 1000).toISOString(),
                description: "TA-led problem review on series and differential equations.",
                context_code: "course_102",
                effective_context_code: "course_102",
                location_name: "Euler Hall 204",
                html_url: "#",
                workflow_state: "active"
            },
            {
                id: 9003,
                title: "Campus Academic Advising Fair",
                start_at: nextWeek,
                end_at: new Date(now + (7 * 24 + 4) * 3600 * 1000).toISOString(),
                description: "Spring advising and course selection expo.",
                context_code: "user_self",
                location_name: "Student Union Grand Ballroom",
                html_url: "#",
                workflow_state: "active"
            },
            {
                id: 9004,
                title: "CS Hackathon & Project Showcase",
                start_at: inTwoWeeks,
                end_at: new Date(now + (14 * 24 + 6) * 3600 * 1000).toISOString(),
                description: "Annual project showcase and awards ceremony.",
                context_code: "course_101",
                effective_context_code: "course_101",
                location_name: "Innovation Lab",
                html_url: "#",
                workflow_state: "active"
            }
        ];
    }

    logger.info("Fetching Canvas calendar events...");
    const eventsMap = new Map<number, CanvasCalendarEvent>();

    // Calculate robust date windows:
    // Future: from yesterday through +365 days (ensures today is fully covered across timezones)
    // Past: from -90 days through yesterday
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);
    const pastLimit = new Date(now.getTime() - 90 * 24 * 3600 * 1000);
    const futureLimit = new Date(now.getTime() + 365 * 24 * 3600 * 1000);

    const todayStr = formatDateYMD(yesterday);
    const futureEndStr = formatDateYMD(futureLimit);
    const pastStartStr = formatDateYMD(pastLimit);

    try {
        // Strategy 1: Upcoming Events feed (/users/self/upcoming_events)
        try {
            const upcomingRes = await genericCanvasFetch(domain, token, '/users/self/upcoming_events?per_page=100', useProxy);
            if (upcomingRes.status === 200 && Array.isArray(upcomingRes.data)) {
                const nonAssignmentItems = upcomingRes.data.filter((item: any) => !item.assignment && item.type !== 'assignment');
                nonAssignmentItems.forEach((ev: CanvasCalendarEvent) => {
                    if (ev.id) eventsMap.set(ev.id, ev);
                });
                logger.info(`[Calendar] Retrieved ${nonAssignmentItems.length} calendar events from /users/self/upcoming_events.`);
            }
        } catch (err: any) {
            logger.warn("[Calendar] Upcoming events endpoint note:", err.message);
        }

        // Strategy 2: Personal user calendar events (both Future & Past)
        try {
            // Future personal events (primary)
            const personalFutureRes = await fetchCalendarEventsPaginated(
                domain, 
                token, 
                `/calendar_events?type=event&start_date=${todayStr}&end_date=${futureEndStr}`, 
                useProxy, 
                3
            );
            personalFutureRes.events.forEach(ev => {
                if (ev.id) eventsMap.set(ev.id, ev);
            });

            // Recent past personal events (secondary)
            const personalPastRes = await fetchCalendarEventsPaginated(
                domain, 
                token, 
                `/calendar_events?type=event&start_date=${pastStartStr}&end_date=${todayStr}`, 
                useProxy, 
                2
            );
            personalPastRes.events.forEach(ev => {
                if (ev.id) eventsMap.set(ev.id, ev);
            });
            logger.info(`[Calendar] Retrieved ${personalFutureRes.events.length} future and ${personalPastRes.events.length} past personal events.`);
        } catch (err: any) {
            logger.warn("[Calendar] Personal calendar fetch note:", err.message);
        }

        // Strategy 3: Course calendar events in batches of up to 10 context codes
        const validCourseIds = courseIds.filter(id => id > 0);
        if (validCourseIds.length > 0) {
            const chunks: number[][] = [];
            for (let i = 0; i < validCourseIds.length; i += 10) {
                chunks.push(validCourseIds.slice(i, i + 10));
            }

            const fetchBatch = async (chunk: number[]) => {
                const queryPart = chunk.map(id => `context_codes[]=${encodeURIComponent(`course_${id}`)}`).join('&');
                
                // 3a. CRITICAL: Fetch FUTURE course events first (today through +365 days) with pagination!
                try {
                    const futureEndpoint = `/calendar_events?type=event&start_date=${todayStr}&end_date=${futureEndStr}&${queryPart}`;
                    const futureBatch = await fetchCalendarEventsPaginated(domain, token, futureEndpoint, useProxy, 5);
                    futureBatch.events.forEach(ev => {
                        if (ev.id) eventsMap.set(ev.id, ev);
                    });
                    logger.info(`[Calendar] Batch courses [${chunk.join(', ')}]: found ${futureBatch.events.length} future events.`);
                } catch (e: any) {
                    logger.warn("[Calendar] Batch future events fetch error:", e.message);
                }

                // 3b. Fetch PAST course events (past 90 days up to today) with pagination
                try {
                    const pastEndpoint = `/calendar_events?type=event&start_date=${pastStartStr}&end_date=${todayStr}&${queryPart}`;
                    const pastBatch = await fetchCalendarEventsPaginated(domain, token, pastEndpoint, useProxy, 3);
                    pastBatch.events.forEach(ev => {
                        if (ev.id) eventsMap.set(ev.id, ev);
                    });
                } catch (e: any) {
                    logger.warn("[Calendar] Batch past events fetch note:", e.message);
                }
            };

            await Promise.all(chunks.map(chunk => fetchBatch(chunk)));
        }

        const allEvents = Array.from(eventsMap.values());
        logger.info(`[Calendar] Total combined calendar events: ${allEvents.length}`);
        return allEvents;
    } catch (e: any) {
        logger.warn("Failed to fetch calendar events", e.message);
        return Array.from(eventsMap.values());
    }
};

// In-memory cache for fetched assignment details
const assignmentDetailsCache = new Map<string, CanvasAssignmentDetail>();

export const getCachedAssignmentDetail = (courseId: number, assignmentId: number): CanvasAssignmentDetail | undefined => {
    return assignmentDetailsCache.get(`${courseId}_${assignmentId}`);
};

const getMockAssignmentDetail = (
    courseId: number,
    assignmentId: number,
    fallbackAssignment?: Partial<CanvasAssignment>
): CanvasAssignmentDetail => {
    const base = fallbackAssignment || {};
    
    if (assignmentId === 1) {
        return {
            id: 1,
            name: base.name || "Algorithm Analysis Paper",
            description: `<h3>Assignment Overview</h3>
<p>In this paper, you will analyze the asymptotic time and space complexity of graph traversal and shortest-path algorithms, specifically comparing <strong>Breadth-First Search (BFS)</strong>, <strong>Dijkstra's Algorithm</strong>, and <strong>A* Search</strong> across varying graph topologies (sparse, dense, and grid graphs).</p>
<h4>Key Deliverables:</h4>
<ul>
  <li><strong>Mathematical Formalism:</strong> Provide formal Big-O proofs for worst-case, best-case, and average-case scenarios using asymptotic notation definitions.</li>
  <li><strong>Empirical Profiling:</strong> Benchmark each algorithm on generated synthetic graphs ranging from 10<sup>3</sup> to 10<sup>6</sup> vertices. Include runtime comparison plots.</li>
  <li><strong>Formatting:</strong> Submit a 4 to 6 page PDF report formatted in standard IEEE two-column conference style.</li>
</ul>
<p>Ensure all code snippets are placed in the appendix or linked via GitHub repository.</p>`,
            due_at: base.due_at || "2024-11-15T23:59:59Z",
            points_possible: base.points_possible || 100,
            course_id: courseId,
            html_url: base.html_url || "https://canvas.instructure.com/courses/101/assignments/1",
            submission_types: ['online_upload'],
            allowed_extensions: ['pdf'],
            grading_type: 'points',
            submission: base.submission || {
                submitted_at: "2024-11-14T10:00:00Z",
                grade: "95",
                score: 95,
                graded_at: "2024-11-16T14:30:00Z",
                submission_comments: [
                    {
                        id: 101,
                        author_name: "Prof. Alan Turing",
                        comment: "Excellent empirical analysis! Your graphs and Big-O proofs were exceptionally well articulated.",
                        created_at: "2024-11-16T14:32:00Z"
                    }
                ]
            },
            rubric: [
                {
                    id: 'r1',
                    points: 40,
                    description: 'Asymptotic Proofs & Math Rigor',
                    long_description: 'Soundness of mathematical proofs for BFS, Dijkstra, and A*',
                    ratings: [
                        { points: 40, description: 'Exemplary: Flawless asymptotic proofs with rigorous lemmas' },
                        { points: 30, description: 'Proficient: Sound reasoning with minor non-critical gaps' },
                        { points: 15, description: 'Developing: Incorrect asymptotic bounds or missing proofs' }
                    ]
                },
                {
                    id: 'r2',
                    points: 35,
                    description: 'Empirical Benchmarking & Data Visualization',
                    long_description: 'Quality of profiling methodology and visualization of results',
                    ratings: [
                        { points: 35, description: 'Comprehensive runtime comparison graphs across graph density' },
                        { points: 25, description: 'Basic plots with limited dataset variety' }
                    ]
                },
                {
                    id: 'r3',
                    points: 25,
                    description: 'Writing Quality & IEEE Format',
                    long_description: 'Proper citations, structure, and adherence to page limit',
                    ratings: [
                        { points: 25, description: 'Publication-grade writing and formatting' }
                    ]
                }
            ],
            score_statistics: { min: 68, max: 100, mean: 89.2 }
        };
    }

    if (assignmentId === 2) {
        return {
            id: 2,
            name: base.name || "Sorting Visualizer",
            description: `<h3>Project Specification</h3>
<p>Build an interactive web application that visualizes classic comparison sorting algorithms: <strong>Quick Sort</strong>, <strong>Merge Sort</strong>, and <strong>Heap Sort</strong>.</p>
<h4>Features:</h4>
<ul>
  <li>Color-coded array bar transitions (comparing: yellow, swapping: red, sorted: green).</li>
  <li>Interactive speed slider (10ms - 1000ms delay) and array size controller (10 to 200 elements).</li>
  <li>Real-time telemetry tracking total comparisons and array writes.</li>
  <li>Pause, step-forward, and reset controls.</li>
</ul>
<p>Deploy your application live and submit the URL.</p>`,
            due_at: base.due_at || "2024-12-01T23:59:59Z",
            points_possible: base.points_possible || 150,
            course_id: courseId,
            html_url: base.html_url || "https://canvas.instructure.com/courses/101/assignments/2",
            submission_types: ['online_url'],
            grading_type: 'points',
            rubric: [
                {
                    id: 'r4',
                    points: 75,
                    description: 'Sorting Algorithm Implementation & Accuracy',
                    long_description: 'Merge Sort, Quick Sort, and Heap Sort correctness',
                    ratings: [{ points: 75, description: 'All three implemented accurately without bugs' }]
                },
                {
                    id: 'r5',
                    points: 50,
                    description: 'Interactive UI & Animation Controls',
                    long_description: 'Smooth visual animation, speed slider, step-by-step debugger',
                    ratings: [{ points: 50, description: 'Polished interactive user interface' }]
                },
                {
                    id: 'r6',
                    points: 25,
                    description: 'Live Deployment & Source Code Cleanliness',
                    long_description: 'Accessible URL with clean, documented modular code',
                    ratings: [{ points: 25, description: 'Flawless deployment' }]
                }
            ],
            score_statistics: { min: 75, max: 150, mean: 134.0 }
        };
    }

    if (assignmentId === 3) {
        return {
            id: 3,
            name: base.name || "Problem Set 1",
            description: `<h3>Calculus II: Integration Techniques</h3>
<p>Complete all assigned problems from Chapter 7 of Stewart Calculus (8th Edition):</p>
<ul>
  <li>Section 7.1: Problems 4, 12, 18, 26 (Integration by Parts)</li>
  <li>Section 7.2: Problems 8, 14, 22, 30 (Trigonometric Integrals)</li>
  <li>Section 7.3: Problems 6, 12, 18 (Trigonometric Substitution)</li>
</ul>
<p>Show all intermediate integration steps clearly. Work must be submitted on paper during Tuesday recitation or uploaded as a scanned PDF.</p>`,
            due_at: base.due_at || "2024-10-20T23:59:59Z",
            points_possible: base.points_possible || 50,
            course_id: courseId,
            html_url: base.html_url || "https://canvas.instructure.com/courses/102/assignments/3",
            submission_types: ['on_paper', 'online_upload'],
            allowed_extensions: ['pdf'],
            grading_type: 'points',
            submission: base.submission || {
                submitted_at: "2024-10-19T20:00:00Z",
                grade: "48",
                score: 48,
                graded_at: "2024-10-22T11:00:00Z",
                submission_comments: [
                    {
                        id: 102,
                        author_name: "TA Maria Rodriguez",
                        comment: "Great work on the trig substitution problems! Minus 2 on #26 for arithmetic slip on line 3.",
                        created_at: "2024-10-22T11:05:00Z"
                    }
                ]
            }
        };
    }

    if (assignmentId === 4) {
        return {
            id: 4,
            name: base.name || "Midterm Exam",
            description: `<h3>Calculus II Midterm Exam</h3>
<p>In-person examination in Science Hall B, Room 201.</p>
<h4>Exam Rules & Guidelines:</h4>
<ul>
  <li>Covers Chapters 1 through 5 (Techniques of Integration, Applications of Integration, and Differential Equations).</li>
  <li>Bring: University ID card, standard non-graphing scientific calculator, #2 pencils.</li>
  <li>A standard one-page formula reference sheet will be provided with your exam booklet.</li>
  <li>Total duration: 90 minutes.</li>
</ul>`,
            due_at: base.due_at || "2024-11-10T10:00:00Z",
            points_possible: base.points_possible || 100,
            course_id: courseId,
            html_url: base.html_url || "https://canvas.instructure.com/courses/102/assignments/4",
            submission_types: ['on_paper'],
            grading_type: 'points',
            locked_for_user: true,
            submission: base.submission || {
                submitted_at: null,
                grade: "88",
                score: 88,
                graded_at: "2024-11-14T09:00:00Z"
            }
        };
    }

    if (assignmentId === 7) {
        return {
            id: 7,
            name: base.name || "Ensayo: Tradiciones familiares y su impacto cultural",
            description: `<h3>Instrucciones del Ensayo</h3>
<p>Escriba un ensayo analítico de 500 palabras examinando cómo las tradiciones y reuniones familiares preservan los valores culturales a través de las generaciones en el mundo hispano.</p>
<h4>Puntos clave a discutir:</h4>
<ul>
  <li><strong>La estructura familiar:</strong> Compare el concepto de la familia extendida en México y España.</li>
  <li><strong>Celebraciones comunitarias:</strong> Analice el significado social de fiestas como el Día de los Muertos o las Posadas.</li>
  <li><strong>Perspectiva personal:</strong> Reflexione sobre las semejanzas y diferencias con su propia comunidad.</li>
</ul>
<p>Por favor revise la ortografía, la concordancia gramatical y el uso apropiado del tiempo subjuntivo antes de entregar su archivo PDF.</p>`,
            due_at: base.due_at || new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString(),
            points_possible: 50,
            course_id: courseId || 104,
            html_url: base.html_url || "https://canvas.instructure.com/courses/104/assignments/7",
            submission_types: ['online_upload'],
            allowed_extensions: ['pdf', 'docx'],
            grading_type: 'points',
            score_statistics: { min: 35, max: 50, mean: 44.5 }
        };
    }

    // Default mock fallback
    return {
        id: assignmentId,
        name: base.name || "Assignment Details",
        description: base.description || "",
        due_at: base.due_at || null,
        points_possible: base.points_possible || 100,
        course_id: courseId,
        html_url: base.html_url || "",
        submission_types: base.submission_types || ['online_upload'],
        submission: base.submission,
        locked_for_user: base.locked_for_user,
        is_calendar_event: base.is_calendar_event,
        location_name: base.location_name,
        grading_type: 'points'
    };
};

/**
 * Fetch rich assignment details from Canvas API
 * (includes description HTML, rubrics, submission data, allowed extensions, score statistics)
 */
export const fetchAssignmentDetails = async (
    domain: string,
    token: string,
    courseId: number,
    assignmentId: number,
    useProxy: boolean = false,
    fallbackAssignment?: Partial<CanvasAssignment>
): Promise<CanvasAssignmentDetail> => {
    const cacheKey = `${courseId}_${assignmentId}`;
    if (assignmentDetailsCache.has(cacheKey)) {
        return assignmentDetailsCache.get(cacheKey)!;
    }

    // Check if Mock or Demo Mode
    const isMock = !domain || !token || token.trim() === 'mock' || domain.includes('example.com') || courseId <= 0 || assignmentId <= 0;

    if (isMock) {
        const mockDetail = getMockAssignmentDetail(courseId, assignmentId, fallbackAssignment);
        assignmentDetailsCache.set(cacheKey, mockDetail);
        return mockDetail;
    }

    // Handle Calendar Events merged into assignments
    if (fallbackAssignment?.is_calendar_event || assignmentId < 0) {
        try {
            const eventId = Math.abs(assignmentId);
            const res = await genericCanvasFetch(domain, token, `/calendar_events/${eventId}`, useProxy);
            if (res.status === 200 && res.data) {
                const ev = res.data;
                const detail: CanvasAssignmentDetail = {
                    id: assignmentId,
                    name: ev.title || fallbackAssignment?.name || 'Calendar Event',
                    description: ev.description || fallbackAssignment?.description || '<p class="text-slate-500 italic">No additional description provided for this calendar event.</p>',
                    due_at: ev.end_at || ev.start_at || fallbackAssignment?.due_at || null,
                    points_possible: 0,
                    course_id: courseId,
                    html_url: ev.html_url || fallbackAssignment?.html_url || '',
                    is_calendar_event: true,
                    location_name: ev.location_name || fallbackAssignment?.location_name || '',
                    submission_types: ['none'],
                    lock_explanation: ev.location_address ? `Location: ${ev.location_address}` : undefined
                };
                assignmentDetailsCache.set(cacheKey, detail);
                return detail;
            }
        } catch (evErr: any) {
            logger.warn(`Failed to fetch calendar event details for ${assignmentId}:`, evErr.message);
        }
    }

    // Real Canvas Assignment Fetch
    try {
        logger.info(`Fetching detailed assignment ${assignmentId} in course ${courseId}...`);
        const endpoint = `/courses/${courseId}/assignments/${assignmentId}?include[]=submission&include[]=submission_comments&include[]=rubric&include[]=rubric_assessment&include[]=score_statistics`;
        const result = await genericCanvasFetch(domain, token, endpoint, useProxy);

        if (result.status === 200 && result.data) {
            const data = result.data;
            const detail: CanvasAssignmentDetail = {
                ...fallbackAssignment,
                ...data,
                id: data.id || assignmentId,
                course_id: data.course_id || courseId,
                name: data.name || fallbackAssignment?.name || 'Assignment',
                description: data.description || fallbackAssignment?.description || '',
                due_at: data.due_at ?? fallbackAssignment?.due_at ?? null,
                points_possible: data.points_possible ?? fallbackAssignment?.points_possible ?? 0,
                html_url: data.html_url || fallbackAssignment?.html_url || '',
                submission: data.submission ? {
                    ...fallbackAssignment?.submission,
                    ...data.submission,
                    submission_comments: (data.submission.submission_comments && data.submission.submission_comments.length > 0)
                        ? data.submission.submission_comments
                        : (fallbackAssignment?.submission?.submission_comments || [])
                } : fallbackAssignment?.submission,
                submission_types: data.submission_types || fallbackAssignment?.submission_types || [],
                locked_for_user: data.locked_for_user ?? fallbackAssignment?.locked_for_user,
                unlock_at: data.unlock_at,
                lock_at: data.lock_at,
                grading_type: data.grading_type,
                allowed_extensions: data.allowed_extensions || [],
                rubric: data.rubric,
                rubric_settings: data.rubric_settings,
                score_statistics: data.score_statistics,
                lock_explanation: data.lock_explanation,
                omit_from_final_grade: data.omit_from_final_grade,
                allowed_attempts: data.allowed_attempts
            };
            assignmentDetailsCache.set(cacheKey, detail);
            return detail;
        } else {
            throw new Error(`Canvas returned HTTP ${result.status}`);
        }
    } catch (error: any) {
        logger.warn(`Failed to fetch assignment details for ${assignmentId} in course ${courseId}: ${error.message}. Falling back to cached data.`);
        const fallbackDetail: CanvasAssignmentDetail = {
            id: assignmentId,
            name: fallbackAssignment?.name || 'Assignment Details',
            description: fallbackAssignment?.description || '<p class="text-slate-400 italic">No instructions or description could be fetched for this assignment.</p>',
            due_at: fallbackAssignment?.due_at || null,
            points_possible: fallbackAssignment?.points_possible || 0,
            course_id: courseId,
            html_url: fallbackAssignment?.html_url || '',
            submission: fallbackAssignment?.submission,
            submission_types: fallbackAssignment?.submission_types || [],
            locked_for_user: fallbackAssignment?.locked_for_user,
            is_calendar_event: fallbackAssignment?.is_calendar_event,
            location_name: fallbackAssignment?.location_name
        };
        assignmentDetailsCache.set(cacheKey, fallbackDetail);
        return fallbackDetail;
    }
};