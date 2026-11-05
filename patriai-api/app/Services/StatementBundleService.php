<?php

namespace App\Services;

use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use App\Support\SimplePdf;
use App\Support\SimpleXlsx;
use App\Support\SimpleZip;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

/**
 * Statements for several wallets at once (client prototype INS-07, STM-01/02):
 * pick wallets and a period, then one combined file or one per wallet, as PDF,
 * Excel or CSV, or all of them in a zip. Each wallet's statement starts when
 * the wallet did, so a wallet opened in August doesn't show an empty January.
 */
class StatementBundleService
{
    public const TZ = 'Africa/Lagos';

    public const PERIODS = ['last_month', 'last_3_months', 'this_year', 'custom'];

    public const FORMATS = ['pdf', 'xlsx', 'csv'];

    private const MIME = [
        'pdf' => 'application/pdf',
        'csv' => 'text/csv',
        'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];

    public static function make(): self
    {
        return new self;
    }

    /** @return array{0: Carbon, 1: Carbon} Lagos start of the first day, end of the last */
    public function range(string $period, ?string $from, ?string $to): array
    {
        $now = now(self::TZ);
        [$start, $end] = match ($period) {
            'last_month' => [$now->copy()->startOfMonth()->subMonthNoOverflow(), $now->copy()->startOfMonth()->subMonthNoOverflow()->endOfMonth()],
            'last_3_months' => [$now->copy()->subMonthsNoOverflow(3)->startOfDay(), $now->copy()->endOfDay()],
            'custom' => [
                Carbon::parse($from ?: $now->toDateString(), self::TZ)->startOfDay(),
                Carbon::parse($to ?: $now->toDateString(), self::TZ)->endOfDay(),
            ],
            default => [$now->copy()->startOfYear(), $now->copy()->endOfDay()],
        };
        if ($end->gt($now)) {
            $end = $now->copy()->endOfDay();
        }
        if ($start->gt($end)) {
            throw ValidationException::withMessages(['from' => 'The start date is after the end date.']);
        }

        return [$start, $end];
    }

    /** When a wallet's records begin: when it opened, or its first money if that came earlier. */
    public function walletStart(Wallet $wallet): Carbon
    {
        return collect([$wallet->created_at, Transaction::where('wallet_id', $wallet->id)->min('created_at')])
            ->filter()->map(fn ($d) => Carbon::parse($d))->min()->setTimezone(self::TZ)->startOfDay();
    }

    /** STM-02 "1 Jan to 25 Oct 2026 · 312 items": each wallet's own dates and count. */
    public function parts(Collection $wallets, Carbon $from, Carbon $to): array
    {
        return $wallets->map(function (Wallet $w) use ($from, $to) {
            $start = $this->walletStart($w);
            $begin = $start->gt($from) ? $start : $from->copy();
            if ($begin->gt($to)) {
                $begin = $to->copy()->startOfDay();
            }
            $count = Transaction::where('wallet_id', $w->id)
                ->whereIn('status', ['successful', 'pending'])
                ->whereBetween('created_at', [$begin->copy()->utc(), $to->copy()->utc()])
                ->count();

            return ['wallet' => $w, 'from' => $begin, 'to' => $to->copy(), 'count' => $count];
        })->values()->all();
    }

    public function label(Carbon $from, Carbon $to): string
    {
        return ($from->year === $to->year ? $from->format('j M') : $from->format('j M Y')) . ' to ' . $to->format('j M Y');
    }

    private function slug(string $name): string
    {
        return trim(preg_replace('/[^a-z0-9]+/', '-', strtolower($name)), '-') ?: 'wallet';
    }

    private function stamp(Carbon $from, Carbon $to): string
    {
        return $from->format('Ymd') . '-' . $to->format('Ymd');
    }

    /**
     * The file to download: one wallet's statement, all of them in one file, or
     * one file per wallet packed in a zip.
     *
     * @return array{name: string, mime: string, bytes: string}
     */
    public function build(User $user, Collection $wallets, Carbon $from, Carbon $to, string $format, string $mode): array
    {
        $format = in_array($format, self::FORMATS, true) ? $format : 'pdf';
        $parts = $this->parts($wallets, $from, $to);
        if ($mode === 'zip') {
            $zip = new SimpleZip;
            $names = [];
            foreach ($parts as $p) {
                $file = $this->single($p, $format);
                $name = $file['name'];
                for ($i = 2; isset($names[$name]); $i++) {
                    $name = preg_replace('/(\.\w+)$/', "-{$i}$1", $file['name']);
                }
                $names[$name] = true;
                $zip->add($name, $file['bytes']);
            }

            return ['name' => 'patriai-statements-' . $this->stamp($from, $to) . '.zip', 'mime' => 'application/zip', 'bytes' => $zip->output()];
        }
        if ($mode === 'combined' && count($parts) > 1) {
            return $this->combined($user, $parts, $from, $to, $format);
        }

        return $this->single($parts[0], $format);
    }

    /** One wallet, as WAL-15 makes it (PDF and CSV), or as an Excel sheet. */
    private function single(array $p, string $format): array
    {
        /** @var Wallet $w */
        $w = $p['wallet'];
        if ($format !== 'xlsx') {
            return WalletManageService::make()->statementFile($w, $format, $p['from']->copy()->utc(), $p['to']->copy()->utc(), false, false);
        }
        $xlsx = new SimpleXlsx;
        $this->sheet($xlsx, $p);

        return [
            'name' => $this->slug($w->name) . '-statement-' . $this->stamp($p['from'], $p['to']) . '.xlsx',
            'mime' => self::MIME['xlsx'],
            'bytes' => $xlsx->output(),
        ];
    }

    private function statement(array $p): array
    {
        $manage = WalletManageService::make();
        $s = $manage->statement($p['wallet'], $p['from']->copy()->utc(), $p['to']->copy()->utc());

        return [$s, $manage->statementRows($s)];
    }

    private function sheet(SimpleXlsx $xlsx, array $p): void
    {
        /** @var Wallet $w */
        $w = $p['wallet'];
        [$s, $rows] = $this->statement($p);
        $n = fn (?int $kobo) => $kobo === null ? null : round($kobo / 100, 2);
        $xlsx->sheet($w->name);
        $xlsx->row(["{$w->name} statement", $this->label($p['from'], $p['to'])], true);
        $xlsx->row(['Account', (string) ($w->virtual_account ?? ''), (string) ($w->virtual_account_bank ?? '')]);
        $xlsx->row([]);
        $xlsx->row(['Opening balance', 'Money in', 'Money out', 'Closing balance'], true);
        $xlsx->row([$n($s['opening']), $n($s['in']), $n($s['out']), $n($s['closing'])]);
        $xlsx->row([]);
        $xlsx->row(['Date', 'Description', 'By', 'In (NGN)', 'Out (NGN)', 'Balance (NGN)'], true);
        foreach ($rows as $r) {
            $xlsx->row([$r[0], $r[1], $r[2], $n($r[3]), $n($r[4]), $n($r[5])]);
        }
        if (!$rows) {
            $xlsx->row(['No money moved in this period.']);
        }
    }

    /** STM-01 "One combined file": a summary of every wallet, then each one's rows. */
    private function combined(User $user, array $parts, Carbon $from, Carbon $to, string $format): array
    {
        $range = $this->label($from, $to);
        $name = 'patriai-statements-' . $this->stamp($from, $to);
        $money = fn (?int $k) => $k === null ? '' : number_format($k / 100, 2);
        $data = array_map(fn ($p) => [$p, ...$this->statement($p)], $parts);

        if ($format === 'xlsx') {
            $xlsx = new SimpleXlsx;
            $xlsx->sheet('All wallets');
            $xlsx->row(['Patriai statements', $range], true);
            $xlsx->row([$user->fullName(), count($parts) . ' wallets']);
            $xlsx->row([]);
            $xlsx->row(['Wallet', 'Dates', 'Opening balance', 'Money in', 'Money out', 'Closing balance', 'Items'], true);
            foreach ($data as [$p, $s]) {
                $xlsx->row([$p['wallet']->name, $this->label($p['from'], $p['to']), round($s['opening'] / 100, 2), round($s['in'] / 100, 2), round($s['out'] / 100, 2), round($s['closing'] / 100, 2), $s['count']]);
            }
            foreach ($parts as $p) {
                $this->sheet($xlsx, $p);
            }

            return ['name' => "{$name}.xlsx", 'mime' => self::MIME['xlsx'], 'bytes' => $xlsx->output()];
        }

        if ($format === 'csv') {
            $out = fopen('php://temp', 'r+');
            fputcsv($out, ['Patriai statements', $range, $user->fullName()]);
            fputcsv($out, []);
            fputcsv($out, ['Wallet', 'Dates', 'Opening balance', 'Money in', 'Money out', 'Closing balance', 'Items']);
            foreach ($data as [$p, $s]) {
                fputcsv($out, [$p['wallet']->name, $this->label($p['from'], $p['to']), $money($s['opening']), $money($s['in']), $money($s['out']), $money($s['closing']), $s['count']]);
            }
            foreach ($data as [$p, $s, $rows]) {
                fputcsv($out, []);
                fputcsv($out, [$p['wallet']->name, $this->label($p['from'], $p['to']), $p['wallet']->virtual_account ?? '']);
                fputcsv($out, ['Date', 'Description', 'By', 'In (NGN)', 'Out (NGN)', 'Balance (NGN)']);
                foreach ($rows as $r) {
                    fputcsv($out, [$r[0], $r[1], $r[2], $money($r[3]), $money($r[4]), $money($r[5])]);
                }
            }
            rewind($out);

            return ['name' => "{$name}.csv", 'mime' => self::MIME['csv'], 'bytes' => stream_get_contents($out)];
        }

        $pdf = new SimplePdf;
        $pdf->text('Patriai statements', 18, true);
        $pdf->text($range . ' · ' . count($parts) . ' wallets · ' . $user->fullName(), 11);
        $pdf->gap(8);
        $widths = [150, 90, 90, 90, 90];
        $pdf->columns(['Wallet', 'Opening', 'Money in', 'Money out', 'Closing'], $widths, 9, true);
        $pdf->rule();
        foreach ($data as [$p, $s]) {
            $pdf->columns([$p['wallet']->name, $money($s['opening']), $money($s['in']), $money($s['out']), $money($s['closing'])], $widths, 9);
        }
        $rowWidths = [92, 170, 70, 62, 62, 66];
        foreach ($data as [$p, $s, $rows]) {
            $pdf->gap(16);
            $pdf->text($p['wallet']->name, 13, true);
            $pdf->text($this->label($p['from'], $p['to']) . ' · Account ' . ($p['wallet']->virtual_account ?? '—') . ' · ' . ($p['wallet']->virtual_account_bank ?? 'Patriai'), 9);
            $pdf->gap(4);
            $pdf->columns(['Date', 'Description', 'By', 'In', 'Out', 'Balance'], $rowWidths, 9, true);
            $pdf->rule();
            foreach ($rows as $r) {
                $pdf->columns([$r[0], $r[1], $r[2], $money($r[3]), $money($r[4]), $money($r[5])], $rowWidths, 8.5);
            }
            if (!$rows) {
                $pdf->text('No money moved in this period.', 9);
            }
        }
        $pdf->gap(14);
        $pdf->text('Generated by Patriai on ' . now(self::TZ)->format('j M Y, g:i a') . '. Amounts in Nigerian naira.', 8);

        return ['name' => "{$name}.pdf", 'mime' => self::MIME['pdf'], 'bytes' => $pdf->output()];
    }

    /**
     * INS-07: a wallet's statements by month, newest first (this month is "in
     * progress"), and each full year before this one.
     */
    public function months(Collection $wallets): array
    {
        $now = now(self::TZ);
        $ids = $wallets->pluck('id')->all();
        $start = $wallets->map(fn (Wallet $w) => $this->walletStart($w))->min() ?? $now->copy()->startOfDay();
        $counts = Transaction::whereIn('wallet_id', $ids ?: [0])
            ->whereIn('status', ['successful', 'pending'])
            ->where('created_at', '>=', $start->copy()->startOfMonth()->utc())
            ->get(['created_at'])
            ->countBy(fn ($t) => $t->created_at->copy()->setTimezone(self::TZ)->format('Y-m'));

        $months = [];
        for ($m = $now->copy()->startOfMonth(), $i = 0; $m->gte($start->copy()->startOfMonth()) && $i < 12; $m->subMonthNoOverflow(), $i++) {
            $current = $m->isSameMonth($now);
            $months[] = [
                'key' => $m->format('Y-m'),
                'label' => $m->format('F Y'),
                'from' => ($m->lt($start) ? $start : $m)->toDateString(),
                'to' => $current ? $now->toDateString() : $m->copy()->endOfMonth()->toDateString(),
                'count' => (int) ($counts[$m->format('Y-m')] ?? 0),
                'in_progress' => $current,
                'ready_on' => $current ? $m->copy()->addMonthNoOverflow()->toDateString() : null,
            ];
        }
        $years = [];
        for ($y = $now->year - 1; $y >= $start->year && count($years) < 3; $y--) {
            $from = Carbon::create($y, 1, 1, 0, 0, 0, self::TZ);
            $years[] = [
                'key' => (string) $y,
                'label' => "{$y} full year",
                'from' => ($from->lt($start) ? $start : $from)->toDateString(),
                'to' => $from->copy()->endOfYear()->toDateString(),
                'count' => (int) collect($counts)->filter(fn ($n, $k) => str_starts_with($k, "{$y}-"))->sum(),
            ];
        }

        return ['months' => $months, 'years' => $years];
    }
}
