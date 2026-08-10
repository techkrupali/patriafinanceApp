<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Allow 'wallet' and 'withdrawal' as dispute categories (Dispute Center now lets
 * users dispute a wallet or a withdrawal directly). The original column was a
 * Laravel enum() -> a CHECK constraint on Postgres; widen that constraint.
 * Guarded to pgsql — SQLite (used only by the test suite) can't ALTER a CHECK,
 * and no test inserts the new categories.
 */
return new class extends Migration
{
    private const OLD = ['transaction', 'project', 'vendor', 'account', 'other'];
    private const NEW = ['transaction', 'project', 'vendor', 'account', 'other', 'wallet', 'withdrawal'];

    public function up(): void
    {
        $this->setCheck(self::NEW);
    }

    public function down(): void
    {
        $this->setCheck(self::OLD);
    }

    private function setCheck(array $values): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }
        $list = "'" . implode("','", $values) . "'";
        DB::statement('ALTER TABLE disputes DROP CONSTRAINT IF EXISTS disputes_category_check');
        DB::statement("ALTER TABLE disputes ADD CONSTRAINT disputes_category_check CHECK (category::text IN ($list))");
    }
};
