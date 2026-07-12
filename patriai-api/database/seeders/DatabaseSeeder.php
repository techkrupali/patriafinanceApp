<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        User::firstOrCreate(
            ['email' => 'admin@patriai.app'],
            [
                'first_name' => 'Patriai',
                'last_name' => 'Admin',
                'name' => 'Patriai Admin',
                'phone' => '08000000001',
                'password' => 'Admin@2026!',
                'pin' => Hash::make('0000'),
                'role' => 'admin',
                'status' => 'active',
                'email_verified_at' => now(),
                'phone_verified_at' => now(),
            ],
        );

        $this->command?->info('Admin seeded: admin@patriai.app / Admin@2026!');
    }
}
