<?php

namespace App\Support;

/**
 * A small, dependency-free ZIP writer (entries stored, not compressed): the
 * "Download all (zip)" of statements, and the package an .xlsx file is.
 */
class SimpleZip
{
    /** @var array<int, array{name: string, crc: int, size: int, offset: int}> */
    private array $entries = [];

    private string $data = '';

    public function add(string $name, string $bytes): void
    {
        $name = str_replace('\\', '/', $name);
        $crc = crc32($bytes);
        $size = strlen($bytes);
        [$time, $date] = $this->dosTime();
        $this->entries[] = ['name' => $name, 'crc' => $crc, 'size' => $size, 'offset' => strlen($this->data), 'time' => $time, 'date' => $date];
        // Local file header; bit 11 = names are UTF-8.
        $this->data .= pack('VvvvvvVVVvv', 0x04034b50, 20, 0x0800, 0, $time, $date, $crc, $size, $size, strlen($name), 0) . $name . $bytes;
    }

    public function output(): string
    {
        $central = '';
        foreach ($this->entries as $e) {
            $central .= pack('VvvvvvvVVVvvvvvVV', 0x02014b50, 20, 20, 0x0800, 0, $e['time'], $e['date'], $e['crc'], $e['size'], $e['size'], strlen($e['name']), 0, 0, 0, 0, 0, $e['offset']) . $e['name'];
        }
        $end = pack('VvvvvVVv', 0x06054b50, 0, 0, count($this->entries), count($this->entries), strlen($central), strlen($this->data), 0);

        return $this->data . $central . $end;
    }

    /** @return array{0: int, 1: int} MS-DOS time and date, Lagos time */
    private function dosTime(): array
    {
        $now = now('Africa/Lagos');

        return [
            ($now->hour << 11) | ($now->minute << 5) | intdiv($now->second, 2),
            (($now->year - 1980) << 9) | ($now->month << 5) | $now->day,
        ];
    }
}
