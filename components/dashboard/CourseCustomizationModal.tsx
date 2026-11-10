import React, { useState } from 'react';
import { CourseData } from '../../types';
import { pruneCourseTitle } from '../../utils/courseAbbreviations';
import { 
  X, 
  Sparkles, 
  Smile, 
  ArrowUp, 
  ArrowDown, 
  Check, 
  RotateCcw,
  Palette,
  Edit3
} from 'lucide-react';
import { 
  CourseCustomization, 
  THEMATIC_EMOJIS, 
  suggestCourseCustomization 
} from '../../services/courseCustomization';

interface CourseCustomizationModalProps {
  courses: CourseData[];
  customizations: Record<number, CourseCustomization>;
  courseOrder: number[];
  onSaveCustomization: (courseId: number, custom: CourseCustomization) => void;
  onUpdateCourseOrder: (newOrder: number[]) => void;
  onClose: () => void;
  defaultAbbreviations: Record<number, string>;
}

export const CourseCustomizationModal: React.FC<CourseCustomizationModalProps> = ({
  courses,
  customizations,
  courseOrder,
  onSaveCustomization,
  onUpdateCourseOrder,
  onClose,
  defaultAbbreviations,
}) => {
  const [selectedCourseId, setSelectedCourseId] = useState<number>(
    courses[0]?.course.id || 0
  );
  const [activeCategory, setActiveCategory] = useState<string>('All');

  // Order courses based on courseOrder
  const orderedCourses = [...courses].sort((a, b) => {
    const indexA = courseOrder.indexOf(a.course.id);
    const indexB = courseOrder.indexOf(b.course.id);
    if (indexA === -1 && indexB === -1) return 0;
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });

  const selectedCourse = courses.find(c => c.course.id === selectedCourseId) || courses[0];
  const currentCustom = selectedCourse ? customizations[selectedCourse.course.id] || {} : {};
  const currentAbbr = currentCustom.abbreviation ?? defaultAbbreviations[selectedCourseId] ?? '';
  const currentEmoji = currentCustom.emoji ?? '';

  const handleAbbrChange = (val: string) => {
    if (!selectedCourse) return;
    onSaveCustomization(selectedCourse.course.id, {
      ...currentCustom,
      abbreviation: val.toUpperCase().trim()
    });
  };

  const handleEmojiSelect = (emoji: string) => {
    if (!selectedCourse) return;
    onSaveCustomization(selectedCourse.course.id, {
      ...currentCustom,
      emoji: currentEmoji === emoji ? '' : emoji
    });
  };

  const handleApplySmartRecommendation = () => {
    if (!selectedCourse) return;
    const rec = suggestCourseCustomization(selectedCourse.course.name);
    onSaveCustomization(selectedCourse.course.id, {
      abbreviation: rec.abbreviation,
      emoji: rec.emoji
    });
  };

  const handleResetToDefault = () => {
    if (!selectedCourse) return;
    onSaveCustomization(selectedCourse.course.id, {
      abbreviation: undefined,
      emoji: undefined
    });
  };

  const handleMove = (courseId: number, direction: 'up' | 'down') => {
    const currentList = orderedCourses.map(c => c.course.id);
    const currentIndex = currentList.indexOf(courseId);
    if (currentIndex === -1) return;
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= currentList.length) return;

    const nextList = [...currentList];
    const [moved] = nextList.splice(currentIndex, 1);
    nextList.splice(targetIndex, 0, moved);
    onUpdateCourseOrder(nextList);
  };

  const categories = ['All', 'STEM & Math', 'Humanities & Languages', 'Arts & Music', 'Sports & Health', 'General'];

  const filteredEmojis = activeCategory === 'All'
    ? THEMATIC_EMOJIS
    : THEMATIC_EMOJIS.filter(e => e.category === activeCategory);

  return (
    <div 
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200/90 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden text-left"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Palette className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">Course Icons, Abbreviations & Ordering</h3>
              <p className="text-xs text-slate-500">Pick custom thematic emojis, short labels, and arrange your class order</p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-lg transition cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body 2-column layout */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-slate-100">
          
          {/* Left Column: Course List & Order */}
          <div className="md:col-span-5 flex flex-col overflow-hidden p-4 bg-slate-50/40">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Your Courses ({orderedCourses.length})</span>
              <span className="text-[10px] text-slate-400">Select to customize or reorder</span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
              {orderedCourses.map((item, idx) => {
                const cId = item.course.id;
                const isSelected = cId === selectedCourseId;
                const custom = customizations[cId] || {};
                const abbr = custom.abbreviation || defaultAbbreviations[cId] || '...';
                const emoji = custom.emoji || '';
                const cleanName = pruneCourseTitle(item.course.name);

                return (
                  <div
                    key={cId}
                    onClick={() => setSelectedCourseId(cId)}
                    className={`flex items-center justify-between p-2.5 rounded-xl border transition cursor-pointer group ${
                      isSelected 
                        ? 'bg-blue-50 border-blue-300 shadow-xs' 
                        : 'bg-white border-slate-200/80 hover:bg-slate-50 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 font-bold text-xs text-slate-700">
                        {emoji || abbr.slice(0, 3)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-slate-800 truncate" title={cleanName}>
                          {emoji && <span className="mr-1">{emoji}</span>}
                          {cleanName}
                        </div>
                        <div className="text-[11px] font-mono text-slate-400">
                          Abbr: <span className="font-bold text-slate-600">{abbr}</span>
                        </div>
                      </div>
                    </div>

                    {/* Move Up/Down buttons */}
                    <div className="flex items-center gap-1 shrink-0 ml-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => handleMove(cId, 'up')}
                        className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-slate-200/60 disabled:opacity-20 transition cursor-pointer"
                        title="Move course up in sidebar"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === orderedCourses.length - 1}
                        onClick={() => handleMove(cId, 'down')}
                        className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-slate-200/60 disabled:opacity-20 transition cursor-pointer"
                        title="Move course down in sidebar"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Customization Details for Selected Course */}
          <div className="md:col-span-7 flex flex-col overflow-hidden p-5 bg-white">
            {selectedCourse ? (
              <div className="flex-1 overflow-y-auto space-y-5 custom-scrollbar pr-1">
                {/* Active Course Banner */}
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Editing Course</span>
                    <h4 className="text-sm font-bold text-slate-900 truncate" title={selectedCourse.course.name}>
                      {currentEmoji && <span className="mr-1.5 text-base">{currentEmoji}</span>}
                      {pruneCourseTitle(selectedCourse.course.name)}
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={handleApplySmartRecommendation}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 rounded-lg transition cursor-pointer shrink-0 shadow-2xs"
                    title="Automatically recommend smart emoji and abbreviation based on course name"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    Auto-Suggest
                  </button>
                </div>

                {/* Abbreviation Input */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Edit3 className="w-3.5 h-3.5 text-slate-400" />
                      Custom Abbreviation
                    </label>
                    <button
                      type="button"
                      onClick={handleResetToDefault}
                      className="text-[11px] text-slate-400 hover:text-slate-600 flex items-center gap-1 cursor-pointer"
                      title="Reset to system default abbreviation"
                    >
                      <RotateCcw className="w-3 h-3" /> Reset default
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      maxLength={8}
                      value={currentAbbr}
                      onChange={(e) => handleAbbrChange(e.target.value)}
                      placeholder="e.g. CHEM, AP BIO, CALC"
                      className="w-40 px-3 py-1.5 text-sm font-mono font-bold uppercase rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-xs text-slate-500">
                      Shows on sidebar badges & module tags
                    </span>
                  </div>
                </div>

                {/* Emoji Selection */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Smile className="w-3.5 h-3.5 text-slate-400" />
                      Thematic Course Emoji
                      {currentEmoji && (
                        <span className="text-xs font-normal text-slate-500">
                          (Current: <span className="text-base">{currentEmoji}</span>)
                        </span>
                      )}
                    </label>
                    {currentEmoji && (
                      <button
                        type="button"
                        onClick={() => handleEmojiSelect(currentEmoji)}
                        className="text-[11px] text-red-500 hover:text-red-700 cursor-pointer"
                      >
                        Remove emoji
                      </button>
                    )}
                  </div>

                  {/* Category Pills */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-2 custom-scrollbar">
                    {categories.map(cat => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setActiveCategory(cat)}
                        className={`px-2.5 py-1 text-[11px] rounded-lg font-medium whitespace-nowrap transition cursor-pointer ${
                          activeCategory === cat 
                            ? 'bg-slate-800 text-white shadow-2xs' 
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  {/* Emoji Grid */}
                  <div className="grid grid-cols-6 sm:grid-cols-8 gap-2 p-2 bg-slate-50 rounded-xl border border-slate-200 max-h-48 overflow-y-auto custom-scrollbar">
                    {filteredEmojis.map(item => {
                      const isSelected = currentEmoji === item.emoji;
                      return (
                        <button
                          key={item.emoji}
                          type="button"
                          onClick={() => handleEmojiSelect(item.emoji)}
                          className={`h-11 rounded-lg flex flex-col items-center justify-center text-xl transition cursor-pointer relative group ${
                            isSelected 
                              ? 'bg-blue-100 border-2 border-blue-600 shadow-2xs' 
                              : 'bg-white hover:bg-blue-50/70 border border-slate-200/80 hover:border-blue-300'
                          }`}
                          title={item.label}
                        >
                          <span>{item.emoji}</span>
                          {isSelected && (
                            <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-blue-600" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Sidebar Preview */}
                <div className="pt-3 border-t border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                    Sidebar Preview
                  </span>
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-indigo-50 border border-indigo-200 max-w-xs">
                    <span className="text-xs font-bold text-indigo-700 bg-white border border-indigo-200 px-2 py-0.5 rounded shadow-2xs">
                      {currentEmoji ? `${currentEmoji} ` : ''}{currentAbbr || 'ABBR'}
                    </span>
                    <span className="text-xs font-medium text-slate-700 truncate">
                      {pruneCourseTitle(selectedCourse.course.name)}
                    </span>
                  </div>
                </div>

              </div>
            ) : null}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/70 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition cursor-pointer"
          >
            Done Customizing
          </button>
        </div>
      </div>
    </div>
  );
};
