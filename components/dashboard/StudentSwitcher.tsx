import React, { useState, useRef, useEffect } from 'react';
import { StudentProfile } from '../../types';
import { 
  Users, 
  ChevronDown, 
  UserPlus, 
  Check, 
  Trash2, 
  X, 
  Sparkles,
  School,
  Key,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { 
  getSavedStudents, 
  saveStudent, 
  removeStudent, 
  setActiveStudentId,
  getActiveStudent
} from '../../services/students';

interface StudentSwitcherProps {
  currentStudentId?: string;
  currentStudentName?: string;
  currentDomain?: string;
  onSwitchStudent: (student: StudentProfile) => void;
  compact?: boolean;
}

const COLOR_CLASSES: Record<string, { bg: string; text: string; ring: string }> = {
  blue: { bg: 'bg-blue-600', text: 'text-white', ring: 'ring-blue-500' },
  emerald: { bg: 'bg-emerald-600', text: 'text-white', ring: 'ring-emerald-500' },
  purple: { bg: 'bg-purple-600', text: 'text-white', ring: 'ring-purple-500' },
  amber: { bg: 'bg-amber-600', text: 'text-white', ring: 'ring-amber-500' },
  rose: { bg: 'bg-rose-600', text: 'text-white', ring: 'ring-rose-500' },
  indigo: { bg: 'bg-indigo-600', text: 'text-white', ring: 'ring-indigo-500' },
};

export const StudentSwitcher: React.FC<StudentSwitcherProps> = ({
  currentStudentId,
  currentStudentName,
  currentDomain,
  onSwitchStudent,
  compact = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [students, setStudents] = useState<StudentProfile[]>(() => getSavedStudents());
  
  // Add modal form state
  const [name, setName] = useState('');
  const [domain, setDomain] = useState(currentDomain || 'mcpsmd.instructure.com');
  const [token, setToken] = useState('');
  const [color, setColor] = useState('blue');
  const [formError, setFormError] = useState<string | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);

  const refreshList = () => {
    setStudents(getSavedStudents());
  };

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeStudent = students.find(s => s.id === currentStudentId) || getActiveStudent();
  const displayName = currentStudentName || activeStudent?.name || 'Student Account';
  const initial = displayName.charAt(0).toUpperCase() || 'S';
  const activeColor = activeStudent?.color && COLOR_CLASSES[activeStudent.color] 
    ? COLOR_CLASSES[activeStudent.color] 
    : COLOR_CLASSES.blue;

  const handleSelectStudent = (student: StudentProfile) => {
    setActiveStudentId(student.id);
    onSwitchStudent(student);
    setIsOpen(false);
  };

  const handleOpenAddModal = () => {
    setIsOpen(false);
    setName('');
    setDomain(currentDomain || 'mcpsmd.instructure.com');
    setToken('');
    setColor(['blue', 'emerald', 'purple', 'amber', 'rose'][students.length % 5]);
    setFormError(null);
    setIsAddModalOpen(true);
  };

  const handleSaveNewStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('Please enter the student\'s name or nickname.');
      return;
    }
    if (!domain.trim()) {
      setFormError('Please enter the Canvas domain (e.g. school.instructure.com).');
      return;
    }
    if (!token.trim()) {
      setFormError('Please provide the student\'s Canvas API Access Token.');
      return;
    }

    const cleanDomain = domain.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    const cleanToken = token.trim();

    try {
      const created = saveStudent({
        name: name.trim(),
        domain: cleanDomain,
        apiKey: cleanToken,
        color,
        useProxy: true,
        batchSize: 2,
      });

      refreshList();
      setIsAddModalOpen(false);
      onSwitchStudent(created);
    } catch (err: any) {
      setFormError(err.message || 'Failed to save student profile.');
    }
  };

  const handleDeleteStudent = (e: React.MouseEvent, id: string, studentName: string) => {
    e.stopPropagation();
    if (confirm(`Remove profile for "${studentName}"? You can add it back later.`)) {
      removeStudent(id);
      refreshList();
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 rounded-xl border transition-all cursor-pointer select-none ${
          compact 
            ? 'p-1.5 bg-white border-slate-200 hover:bg-slate-100 text-slate-700 shadow-2xs' 
            : 'px-2.5 py-1.5 bg-white border-slate-200/90 shadow-2xs hover:border-blue-300 hover:shadow-xs text-slate-800 max-w-[170px]'
        }`}
        title={`Current Student: ${displayName} - Click to switch student`}
      >
        <div className={`w-6 h-6 rounded-lg ${activeColor.bg} ${activeColor.text} font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs`}>
          {initial}
        </div>
        {!compact && (
          <div className="text-left min-w-0 pr-0.5 flex-1">
            <div className="text-xs font-bold leading-tight truncate text-slate-800">
              {displayName}
            </div>
          </div>
        )}
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className={`absolute ${compact ? 'left-full top-0 ml-2' : 'left-0 top-full mt-1.5'} w-72 bg-white rounded-2xl shadow-xl border border-slate-200/80 py-2 z-50 animate-fadeIn`}>
          <div className="px-3.5 py-2 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider">
              <Users className="w-3.5 h-3.5 text-blue-600" />
              Student Profiles
            </div>
            <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
              {students.length} {students.length === 1 ? 'student' : 'students'}
            </span>
          </div>

          {/* Student List */}
          <div className="max-h-60 overflow-y-auto py-1">
            {students.length === 0 ? (
              <div className="px-4 py-3 text-xs text-slate-400 italic text-center">
                Current session is not yet saved to a profile.
              </div>
            ) : (
              students.map(student => {
                const isSelected = student.id === activeStudent?.id;
                const c = COLOR_CLASSES[student.color || 'blue'] || COLOR_CLASSES.blue;
                return (
                  <div
                    key={student.id}
                    onClick={() => handleSelectStudent(student)}
                    className={`flex items-center justify-between px-3.5 py-2.5 transition cursor-pointer group ${
                      isSelected ? 'bg-blue-50/70 text-blue-900' : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-7 h-7 rounded-lg ${c.bg} ${c.text} font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs`}>
                        {student.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 text-left">
                        <div className="text-xs font-bold truncate leading-tight flex items-center gap-1.5">
                          {student.name}
                          {isSelected && (
                            <span className="text-[10px] text-blue-600 font-semibold bg-blue-100/80 px-1.5 py-0.2 rounded-full">Active</span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate leading-tight mt-0.5">
                          {student.domain}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      {isSelected ? (
                        <Check className="w-4 h-4 text-blue-600" />
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => handleDeleteStudent(e, student.id, student.name)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded transition cursor-pointer"
                          title="Remove student profile"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Add Student Button */}
          <div className="pt-1.5 border-t border-slate-100 px-2">
            <button
              type="button"
              onClick={handleOpenAddModal}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50/70 hover:bg-blue-100/70 rounded-xl transition cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              Add Another Student
            </button>
          </div>
        </div>
      )}

      {/* Add Student Modal */}
      {isAddModalOpen && (
        <div 
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setIsAddModalOpen(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/80">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Add Student Profile</h3>
                  <p className="text-[11px] text-slate-500">Easily switch between children without logging out</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200/60 rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveNewStudent} className="p-5 space-y-4">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Student Name or Nickname
                </label>
                <input
                  type="text"
                  placeholder="e.g. Emma, Alex, or Child 1"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-300 focus:outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Canvas Domain
                </label>
                <div className="relative">
                  <School className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="e.g. mcpsmd.instructure.com"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    className="w-full text-xs pl-8 pr-3 py-2 rounded-xl border border-slate-300 focus:outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Canvas API Access Token
                </label>
                <div className="relative">
                  <Key className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="password"
                    placeholder="Paste student's Canvas token..."
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    className="w-full text-xs pl-8 pr-3 py-2 rounded-xl border border-slate-300 focus:outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100 font-mono"
                    required
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1 leading-tight">
                  In Canvas: Account &gt; Settings &gt; Approved Integrations &gt; + New Access Token.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Avatar Color Accent
                </label>
                <div className="flex items-center gap-2">
                  {Object.keys(COLOR_CLASSES).map(colorKey => (
                    <button
                      key={colorKey}
                      type="button"
                      onClick={() => setColor(colorKey)}
                      className={`w-7 h-7 rounded-lg ${COLOR_CLASSES[colorKey].bg} transition-all cursor-pointer ${
                        color === colorKey ? 'ring-2 ring-offset-2 ring-blue-500 scale-110' : 'opacity-80 hover:opacity-100'
                      }`}
                    />
                  ))}
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition cursor-pointer flex items-center gap-1.5"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Save &amp; Switch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
