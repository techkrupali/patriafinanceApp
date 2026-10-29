<?php

namespace App\Support;

/**
 * A small, dependency-free PDF writer for statements: A4 pages of Helvetica
 * text, rows of columns and hairlines, with page breaks. Text is WinAnsi; the
 * naira sign is written as "NGN" (the base fonts have no ₦).
 */
class SimplePdf
{
    private const WIDTH = 595.28;

    private const HEIGHT = 841.89;

    private const MARGIN = 40;

    /** @var string[] content stream of each page */
    private array $pages = [];

    private float $y = 0;

    public function __construct()
    {
        $this->page();
    }

    private function page(): void
    {
        $this->pages[] = '';
        $this->y = self::HEIGHT - self::MARGIN;
    }

    private function room(float $height): void
    {
        if ($this->y - $height < self::MARGIN) {
            $this->page();
        }
    }

    private function encode(string $text): string
    {
        $text = str_replace('₦', 'NGN ', $text);
        $text = @iconv('UTF-8', 'Windows-1252//TRANSLIT//IGNORE', $text) ?: preg_replace('/[^\x20-\x7E]/', '?', $text);

        return str_replace(['\\', '(', ')', "\r", "\n"], ['\\\\', '\\(', '\\)', ' ', ' '], $text);
    }

    /** Cut a cell to its column, by Helvetica's average width. */
    private function fit(string $text, float $width, float $size): string
    {
        $max = (int) floor($width / ($size * 0.5));
        if (mb_strlen($text) <= $max) {
            return $text;
        }

        return rtrim(mb_substr($text, 0, max(1, $max - 1))) . '…';
    }

    private function draw(string $text, float $x, float $size, bool $bold): void
    {
        $font = $bold ? 'F2' : 'F1';
        $this->pages[count($this->pages) - 1] .= sprintf("BT /%s %.1F Tf %.2F %.2F Td (%s) Tj ET\n", $font, $size, $x, $this->y, $this->encode($text));
    }

    public function text(string $text, float $size = 10, bool $bold = false): void
    {
        $line = $size * 1.45;
        $this->room($line);
        $this->y -= $line;
        $this->draw($this->fit($text, self::WIDTH - 2 * self::MARGIN, $size), self::MARGIN, $size, $bold);
    }

    /** @param string[] $cells @param float[] $widths */
    public function columns(array $cells, array $widths, float $size = 9, bool $bold = false): void
    {
        $line = $size * 1.6;
        $this->room($line);
        $this->y -= $line;
        $x = self::MARGIN;
        foreach (array_values($cells) as $i => $cell) {
            $width = $widths[$i] ?? 80;
            $this->draw($this->fit((string) $cell, $width - 4, $size), $x, $size, $bold);
            $x += $width;
        }
    }

    public function rule(): void
    {
        $this->room(6);
        $this->y -= 4;
        $this->pages[count($this->pages) - 1] .= sprintf("0.85 G 0.5 w %.2F %.2F m %.2F %.2F l S 0 G\n", self::MARGIN, $this->y, self::WIDTH - self::MARGIN, $this->y);
    }

    public function gap(float $points): void
    {
        $this->y -= $points;
    }

    public function output(): string
    {
        $objects = [];
        $objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
        $objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
        $objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
        $kids = [];
        $n = 5;
        $total = count($this->pages);
        foreach ($this->pages as $i => $stream) {
            $stream .= sprintf("BT /F1 8 Tf %.2F %.2F Td (Page %d of %d) Tj ET\n", self::WIDTH - self::MARGIN - 50, self::MARGIN / 2, $i + 1, $total);
            $pageId = $n++;
            $contentId = $n++;
            $kids[] = "{$pageId} 0 R";
            $objects[$pageId] = sprintf('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %.2F %.2F] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents %d 0 R >>', self::WIDTH, self::HEIGHT, $contentId);
            $objects[$contentId] = '<< /Length ' . strlen($stream) . " >>\nstream\n{$stream}endstream";
        }
        $objects[2] = '<< /Type /Pages /Kids [' . implode(' ', $kids) . '] /Count ' . $total . ' >>';
        ksort($objects);

        $pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
        $offsets = [];
        foreach ($objects as $id => $body) {
            $offsets[$id] = strlen($pdf);
            $pdf .= "{$id} 0 obj\n{$body}\nendobj\n";
        }
        $xref = strlen($pdf);
        $pdf .= 'xref' . "\n0 " . (count($objects) + 1) . "\n0000000000 65535 f \n";
        foreach ($objects as $id => $body) {
            $pdf .= sprintf("%010d 00000 n \n", $offsets[$id]);
        }
        $pdf .= 'trailer' . "\n<< /Size " . (count($objects) + 1) . " /Root 1 0 R >>\nstartxref\n{$xref}\n%%EOF";

        return $pdf;
    }
}
