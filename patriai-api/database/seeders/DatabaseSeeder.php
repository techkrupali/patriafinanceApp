<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        if (!User::where('email', 'admin@patriai.app')->exists()) {
            $admin = new User([
                'first_name' => 'Patriai',
                'last_name' => 'Admin',
                'name' => 'Patriai Admin',
                'phone' => '08000000001',
                'password' => 'Admin@2026!',
                'pin' => Hash::make('0000'),
            ]);

            // role/status are privilege fields and deliberately not mass-assignable.
            $admin->forceFill([
                'role' => 'admin',
                'status' => 'active',
                'email' => 'admin@patriai.app',
                'email_verified_at' => now(),
                'phone_verified_at' => now(),
            ])->save();
        }

        $this->command?->info('Admin seeded: admin@patriai.app / Admin@2026!');
    }
}
