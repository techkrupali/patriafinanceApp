<?php

namespace App\Support;

/**
 * A small, dependency-free Excel (.xlsx) writer for statements: one sheet per
 * wallet, text and numbers, a bold style for headings and #,##0.00 for money.
 * Cells are inline strings, so there's no shared-strings table to keep.
 */
class SimpleXlsx
{
    /** @var array<int, array{name: string, rows: array<int, array{cells: array, bold: bool}>}> */
    private array $sheets = [];

    private int $current = -1;

    public function sheet(string $name): void
    {
        // Excel: up to 31 characters, none of []:*?/\ and each name once.
        $name = trim(preg_replace('/[\[\]:*?\/\\\\]/', ' ', $name)) ?: 'Sheet';
        $name = mb_substr($name, 0, 31);
        $taken = array_column($this->sheets, 'name');
        for ($i = 2, $base = mb_substr($name, 0, 27); in_array(mb_strtolower($name), array_map('mb_strtolower', $taken), true); $i++) {
            $name = "{$base} ({$i})";
        }
        $this->sheets[] = ['name' => $name, 'rows' => []];
        $this->current = count($this->sheets) - 1;
    }

    /** A row of cells: strings stay text, ints and floats are numbers (money gets 2 decimals). */
    public function row(array $cells, bool $bold = false): void
    {
        if ($this->current < 0) {
            $this->sheet('Sheet');
        }
        $this->sheets[$this->current]['rows'][] = ['cells' => array_values($cells), 'bold' => $bold];
    }

    public function output(): string
    {
        if (!$this->sheets) {
            $this->sheet('Sheet');
        }
        $zip = new SimpleZip;
        $count = count($this->sheets);
        $overrides = '';
        $sheetsXml = '';
        $rels = '';
        for ($i = 1; $i <= $count; $i++) {
            $overrides .= '<Override PartName="/xl/worksheets/sheet' . $i . '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
            $sheetsXml .= '<sheet name="' . $this->esc($this->sheets[$i - 1]['name']) . '" sheetId="' . $i . '" r:id="rId' . $i . '"/>';
            $rels .= '<Relationship Id="rId' . $i . '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' . $i . '.xml"/>';
        }
        $rels .= '<Relationship Id="rId' . ($count + 1) . '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>';

        $zip->add('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            . '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            . '<Default Extension="xml" ContentType="application/xml"/>'
            . '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            . '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
            . $overrides . '</Types>');
        $zip->add('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            . '</Relationships>');
        $zip->add('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            . '<sheets>' . $sheetsXml . '</sheets></workbook>');
        $zip->add('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' . $rels . '</Relationships>');
        // Styles: 0 plain, 1 bold, 2 money, 3 bold money.
        $zip->add('xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            . '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>'
            . '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
            . '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
            . '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
            . '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
            . '<cellXfs count="4">'
            . '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
            . '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
            . '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
            . '<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>'
            . '</cellXfs></styleSheet>');
        foreach ($this->sheets as $i => $sheet) {
            $zip->add('xl/worksheets/sheet' . ($i + 1) . '.xml', $this->sheetXml($sheet['rows']));
        }

        return $zip->output();
    }

    private function sheetXml(array $rows): string
    {
        $xml = '';
        foreach ($rows as $r => $row) {
            $n = $r + 1;
            $xml .= '<row r="' . $n . '">';
            foreach ($row['cells'] as $c => $value) {
                if ($value === null || $value === '') {
                    continue;
                }
                $ref = $this->column($c) . $n;
                if (is_int($value) || is_float($value)) {
                    $style = is_float($value) ? ($row['bold'] ? 3 : 2) : ($row['bold'] ? 1 : 0);
                    $xml .= '<c r="' . $ref . '" s="' . $style . '"><v>' . $value . '</v></c>';
                } else {
                    $xml .= '<c r="' . $ref . '" t="inlineStr"' . ($row['bold'] ? ' s="1"' : '') . '><is><t xml:space="preserve">' . $this->esc((string) $value) . '</t></is></c>';
                }
            }
            $xml .= '</row>';
        }

        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            . '<cols><col min="1" max="1" width="22" customWidth="1"/><col min="2" max="2" width="44" customWidth="1"/><col min="3" max="8" width="16" customWidth="1"/></cols>'
            . '<sheetData>' . $xml . '</sheetData></worksheet>';
    }

    /** 0 → A, 25 → Z, 26 → AA. */
    private function column(int $i): string
    {
        $s = '';
        for ($i++; $i > 0; $i = intdiv($i - 1, 26)) {
            $s = chr(65 + ($i - 1) % 26) . $s;
        }

        return $s;
    }

    private function esc(string $s): string
    {
        // XML 1.0 has no room for control characters.
        return htmlspecialchars(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', '', $s), ENT_XML1 | ENT_QUOTES, 'UTF-8');
    }
}
