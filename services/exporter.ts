
import { CourseData, ExportFormat } from "../types";
import { isAssignmentSubmitted } from "../utils/dashboard-helpers";

export const downloadData = (data: CourseData[], format: ExportFormat) => {
  let content = "";
  let mimeType = "";
  let extension = "";

  switch (format) {
    case ExportFormat.JSON:
      content = JSON.stringify(data, null, 2);
      mimeType = "application/json";
      extension = "json";
      break;

    case ExportFormat.CSV:
      // Flatten data for CSV - Focusing on Assignments as the primary row item
      // Added ID column
      const headers = ["ID", "Course Name", "Course Code", "Assignment Name", "Due Date", "Score", "Points", "Submitted", "Locked", "Current Grade"];
      const rows: string[] = [headers.join(",")];

      data.forEach(c => {
        // If no assignments, still add a row for the course
        if (c.assignments.length === 0) {
           rows.push(`"N/A","${c.course.name}","${c.course.course_code}","N/A","N/A","N/A","0","N/A","${c.enrollment?.grades.current_grade ?? 'N/A'}"`);
        } else {
          c.assignments.forEach(a => {
             const isSubmitted = isAssignmentSubmitted(a) ? "Yes" : "No";
             const score = (a.submission?.score !== null && a.submission?.score !== undefined) ? a.submission.score : "Not Graded";
             const isLocked = a.locked_for_user ? "Yes" : "No";
             rows.push(`"${a.id}","${c.course.name}","${c.course.course_code}","${a.name}","${a.due_at || 'None'}","${score}","${a.points_possible}","${isSubmitted}","${isLocked}","${c.enrollment?.grades.current_grade ?? 'N/A'}"`);
          });
        }
      });
      content = rows.join("\n");
      mimeType = "text/csv";
      extension = "csv";
      break;

    case ExportFormat.XML:
      content = `<?xml version="1.0" encoding="UTF-8"?>
<canvasData>
  ${data.map(c => `
  <course id="${c.course.id}">
    <name>${c.course.name}</name>
    <code>${c.course.course_code}</code>
    <grade>${c.enrollment?.grades.current_grade || 'N/A'}</grade>
    <score>${c.enrollment?.grades.current_score || 0}</score>
    <assignments>
      ${c.assignments.map(a => {
        const isSubmitted = isAssignmentSubmitted(a) ? 'true' : 'false';
        
        return `<assignment id="${a.id}">
        <name>${a.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</name>
        <due>${a.due_at || 'N/A'}</due>
        <points>${a.points_possible}</points>
        <score>${(a.submission?.score !== null && a.submission?.score !== undefined) ? a.submission.score : 'Not Graded'}</score>
        <submitted>${isSubmitted}</submitted>
        <locked>${a.locked_for_user ? 'true' : 'false'}</locked>
      </assignment>`;
      }).join('')}
    </assignments>
    <modules>
      ${c.modules.map(m => `
      <module id="${m.id}">
        <name>${m.name.replace(/&/g, '&amp;')}</name>
        <items>
          ${m.items.map(i => `<item id="${i.id}" type="${i.type}">${i.title.replace(/&/g, '&amp;')}</item>`).join('')}
        </items>
      </module>`).join('')}
    </modules>
  </course>`).join('')}
</canvasData>`;
      mimeType = "application/xml";
      extension = "xml";
      break;
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `canvas_export_${new Date().toISOString().split('T')[0]}.${extension}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
