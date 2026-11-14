import { describe, it, expect, vi } from 'vitest';
import {
  escapeCsvCell,
  escapeXml,
  generateExportContent,
  downloadData,
} from '../../services/exporter';
import { CourseData, ExportFormat } from '../../types';

const makeExportFixtures = (): CourseData[] => [
  {
    course: {
      id: 101,
      name: 'AP "Biology" & Genetics <Honors>',
      course_code: '=CMD|calc',
      is_favorite: true,
    },
    assignments: [
      {
        id: 10,
        name: '+Sum Lab, "Phase 1" & <Cells>',
        description: 'Details',
        due_at: '2026-11-15T23:59:00Z',
        points_possible: 50,
        course_id: 101,
        html_url: 'https://school.instructure.com/courses/101/assignments/10',
        submission: { submitted_at: '2026-11-14T10:00:00Z', grade: '49', score: 49 },
        locked_for_user: false,
        submission_types: ['online_upload'],
      },
      {
        id: 11,
        name: '-Diff\nLine\r\nBreak',
        description: '',
        due_at: null,
        points_possible: 10,
        course_id: 101,
        html_url: '',
        submission: { submitted_at: null, grade: null, score: 0 },
        locked_for_user: true,
        submission_types: ['online_text_entry'],
      },
    ],
    modules: [
      {
        id: 501,
        name: 'Unit 1: DNA & "RNA"',
        course_id: 101,
        items: [
          {
            id: 7001,
            title: "Teacher's Guide <PDF> & Notes",
            type: 'File',
            module_id: 501,
          },
        ],
      },
    ],
    enrollment: {
      id: 1,
      course_id: 101,
      type: 'StudentEnrollment',
      grades: { current_score: 96.5, current_grade: 'A', final_score: 96.5, final_grade: 'A' },
    },
  },
  {
    course: {
      id: 102,
      name: '@Homeroom Advisory',
      course_code: 'ADV-1',
      is_favorite: false,
    },
    assignments: [],
    modules: [],
    enrollment: {
      id: 2,
      course_id: 102,
      type: 'StudentEnrollment',
      grades: { current_score: null, current_grade: null, final_score: null, final_grade: null },
    },
  },
];

function parseCsvRow(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      let val = '';
      i++;
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') {
          val += '"';
          i += 2;
        } else if (line[i] === '"') {
          i++;
          break;
        } else {
          val += line[i++];
        }
      }
      fields.push(val);
      if (line[i] === ',') i++;
    } else {
      const next = line.indexOf(',', i);
      if (next === -1) {
        fields.push(line.slice(i));
        break;
      }
      fields.push(line.slice(i, next));
      i = next + 1;
    }
  }
  return fields;
}

describe('exporter service', () => {
  it('escapes CSV cells per RFC 4180, normalizes newlines, and neutralizes formula prefixes', () => {
    expect(escapeCsvCell('Hello "World"')).toBe('"Hello ""World"""');
    expect(escapeCsvCell('=1+1')).toBe('"\'=1+1"');
    expect(escapeCsvCell('+SUM(A1)')).toBe('"\'+SUM(A1)"');
    expect(escapeCsvCell('-10')).toBe('"\'-10"');
    expect(escapeCsvCell('@evil')).toBe('"\'@evil"');
    expect(escapeCsvCell('Line 1\r\nLine 2')).toBe('"Line 1 Line 2"');
    expect(escapeCsvCell(null)).toBe('""');
  });

  it('produces uniform 10-column CSV rows even for courses without assignments', () => {
    const { content, mimeType, extension } = generateExportContent(makeExportFixtures(), ExportFormat.CSV);
    expect(mimeType).toBe('text/csv');
    expect(extension).toBe('csv');

    const lines = content.split('\n');
    expect(lines).toHaveLength(4); // header + 2 assignments (course 101) + 1 empty placeholder (course 102)

    const parsedRows = lines.map(parseCsvRow);
    parsedRows.forEach(cols => {
      expect(cols).toHaveLength(10);
    });

    // Verify formula neutralization and quote escaping survived round-trip CSV parsing
    expect(parsedRows[1][1]).toBe('AP "Biology" & Genetics <Honors>');
    expect(parsedRows[1][2]).toBe("'=CMD|calc");
    expect(parsedRows[1][3]).toBe('\'+Sum Lab, "Phase 1" & <Cells>');
    // Zero score should export as 0 rather than Not Graded
    expect(parsedRows[2][5]).toBe('0');
    // Course with 0 assignments aligns cleanly to 10 columns
    expect(parsedRows[3][0]).toBe('N/A');
    expect(parsedRows[3][1]).toBe("'@Homeroom Advisory");
    expect(parsedRows[3][9]).toBe('N/A');
  });

  it('escapes XML special entities completely so output parses with zero XML errors', () => {
    expect(escapeXml(`a & b <c> "d" 'e'`)).toBe('a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;');

    const { content, mimeType, extension } = generateExportContent(makeExportFixtures(), ExportFormat.XML);
    expect(mimeType).toBe('application/xml');
    expect(extension).toBe('xml');

    const doc = new DOMParser().parseFromString(content, 'text/xml');
    expect(doc.querySelector('parsererror')).toBeNull();

    const courseNames = Array.from(doc.querySelectorAll('course > name')).map(el => el.textContent);
    expect(courseNames[0]).toBe('AP "Biology" & Genetics <Honors>');
    expect(doc.querySelector('assignment > name')?.textContent).toBe('+Sum Lab, "Phase 1" & <Cells>');
    expect(doc.querySelector('module item')?.textContent).toBe("Teacher's Guide <PDF> & Notes");
  });

  it('generates valid JSON export and triggers blob download + URL cleanup', () => {
    const fixtures = makeExportFixtures();
    const jsonExport = generateExportContent(fixtures, ExportFormat.JSON);
    expect(jsonExport.extension).toBe('json');
    expect(JSON.parse(jsonExport.content)).toHaveLength(2);

    const createObjectUrl = vi.fn(() => 'blob:mock-url');
    const revokeObjectUrl = vi.fn();
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: createObjectUrl,
      revokeObjectURL: revokeObjectUrl,
    });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadData(fixtures, ExportFormat.CSV);
    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:mock-url');
    clickSpy.mockRestore();
  });
});
