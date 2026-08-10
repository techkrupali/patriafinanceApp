<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * One-time cleanup: convert any legacy raw-digit phone numbers (e.g. the local
 * "08035591258") to canonical E.164 ("+2348035591258") so phone login keeps
 * matching now that the apps register/sign-in with E.164. Numbers with no
 * country code are assumed to be from the primary market, Nigeria (+234).
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (DB::table('users')->select('id', 'phone')->get() as $row) {
            $normalized = $this->normalize($row->phone);
            if ($normalized === null || $normalized === $row->phone) {
                continue;
            }
            // Never create a duplicate: skip if another row already holds the target value.
            $clash = DB::table('users')
                ->where('phone', $normalized)
                ->where('id', '!=', $row->id)
                ->exists();
            if (!$clash) {
                DB::table('users')->where('id', $row->id)->update(['phone' => $normalized]);
            }
        }
    }

    public function down(): void
    {
        // Irreversible data normalization — the original loose formats are not retained.
    }

    private function normalize(?string $raw): ?string
    {
        if ($raw === null) {
            return null;
        }
        $trimmed = trim($raw);
        $hasPlus = str_starts_with($trimmed, '+');
        $digits = preg_replace('/\D/', '', $trimmed);

        if ($digits === '') {
            return null;
        }
        if ($hasPlus) {
            return '+' . $digits;
        }
        if (str_starts_with($digits, '00')) {
            return '+' . substr($digits, 2);
        }
        if (str_starts_with($digits, '0')) {
            return '+234' . ltrim($digits, '0');
        }

        return '+' . $digits;
    }
};
