import { CourseData, ExportFormat } from "../types";
import { isAssignmentSubmitted } from "../utils/dashboard-helpers";

const FORMULA_PREFIX_RE = /^[=+\-@\t\r]/;

/**
 * Escapes a single CSV cell per RFC 4180 and neutralizes spreadsheet formula injection.
 */
export function escapeCsvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const normalized = raw.replace(/\r\n/g, ' ').replace(/[\r\n]/g, ' ');
  const safe = FORMULA_PREFIX_RE.test(normalized) ? `'${normalized}` : normalized;
  return `"${safe.replace(/"/g, '""')}"`;
}

/**
 * Escapes XML special characters across text nodes and attribute values.
 */
export function escapeXml(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface GeneratedExport {
  content: string;
  mimeType: string;
  extension: string;
}

export function generateExportContent(data: CourseData[], format: ExportFormat): GeneratedExport {
  switch (format) {
    case ExportFormat.JSON:
      return {
        content: JSON.stringify(data, null, 2),
        mimeType: "application/json",
        extension: "json",
      };

    case ExportFormat.CSV: {
      const headers = [
        "ID",
        "Course Name",
        "Course Code",
        "Assignment Name",
        "Due Date",
        "Score",
        "Points",
        "Submitted",
        "Locked",
        "Current Grade",
      ];
      const rows: string[] = [headers.map(escapeCsvCell).join(",")];

      data.forEach(c => {
        const currentGrade = c.enrollment?.grades?.current_grade ?? "N/A";
        if (c.assignments.length === 0) {
          rows.push(
            [
              "N/A",
              c.course.name,
              c.course.course_code,
              "N/A",
              "N/A",
              "N/A",
              0,
              "N/A",
              "N/A",
              currentGrade,
            ]
              .map(escapeCsvCell)
              .join(",")
          );
        } else {
          c.assignments.forEach(a => {
            const isSubmitted = isAssignmentSubmitted(a) ? "Yes" : "No";
            const score =
              a.submission?.score !== null && a.submission?.score !== undefined
                ? a.submission.score
                : "Not Graded";
            const isLocked = a.locked_for_user ? "Yes" : "No";
            rows.push(
              [
                a.id,
                c.course.name,
                c.course.course_code,
                a.name,
                a.due_at || "None",
                score,
                a.points_possible,
                isSubmitted,
                isLocked,
                currentGrade,
              ]
                .map(escapeCsvCell)
                .join(",")
            );
          });
        }
      });

      return {
        content: rows.join("\n"),
        mimeType: "text/csv",
        extension: "csv",
      };
    }

    case ExportFormat.XML: {
      const content = `<?xml version="1.0" encoding="UTF-8"?>
<canvasData>
  ${data
    .map(
      c => `
  <course id="${escapeXml(c.course.id)}">
    <name>${escapeXml(c.course.name)}</name>
    <code>${escapeXml(c.course.course_code)}</code>
    <grade>${escapeXml(c.enrollment?.grades?.current_grade || "N/A")}</grade>
    <score>${escapeXml(c.enrollment?.grades?.current_score ?? 0)}</score>
    <assignments>
      ${c.assignments
        .map(a => {
          const isSubmitted = isAssignmentSubmitted(a) ? "true" : "false";
          const score =
            a.submission?.score !== null && a.submission?.score !== undefined
              ? a.submission.score
              : "Not Graded";
          return `<assignment id="${escapeXml(a.id)}">
        <name>${escapeXml(a.name)}</name>
        <due>${escapeXml(a.due_at || "N/A")}</due>
        <points>${escapeXml(a.points_possible)}</points>
        <score>${escapeXml(score)}</score>
        <submitted>${isSubmitted}</submitted>
        <locked>${a.locked_for_user ? "true" : "false"}</locked>
      </assignment>`;
        })
        .join("")}
    </assignments>
    <modules>
      ${c.modules
        .map(
          m => `
      <module id="${escapeXml(m.id)}">
        <name>${escapeXml(m.name)}</name>
        <items>
          ${m.items
            .map(
              i =>
                `<item id="${escapeXml(i.id)}" type="${escapeXml(i.type)}">${escapeXml(i.title)}</item>`
            )
            .join("")}
        </items>
      </module>`
        )
        .join("")}
    </modules>
  </course>`
    )
    .join("")}
</canvasData>`;

      return {
        content,
        mimeType: "application/xml",
        extension: "xml",
      };
    }
  }
}

export const downloadData = (data: CourseData[], format: ExportFormat) => {
  const { content, mimeType, extension } = generateExportContent(data, format);

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `canvas_export_${new Date().toISOString().split("T")[0]}.${extension}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
