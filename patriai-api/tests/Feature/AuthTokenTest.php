<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Sanctum token lifetime: with config('sanctum.expiration') set, login still
 * works and issued tokens stop authenticating after 30 days (Sanctum's guard
 * rejects tokens whose created_at is older than the configured minutes).
 */
class AuthTokenTest extends TestCase
{
    use RefreshDatabase;

    public function test_login_succeeds_and_token_stops_working_after_30_days(): void
    {
        $this->assertSame(60 * 24 * 30, (int) config('sanctum.expiration'));

        $user = User::factory()->create(['password' => 'password123']);

        $res = $this->postJson('/api/v1/auth/login', [
            'identifier' => $user->email,
            'password' => 'password123',
        ]);

        $res->assertOk()->assertJsonPath('status', true);
        $token = $res->json('data.token');
        $this->assertNotEmpty($token);

        // The bearer token authenticates today…
        $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/auth/me')
            ->assertOk()
            ->assertJsonPath('data.user.id', $user->id);

        // …still authenticates just inside the window…
        $this->app['auth']->forgetGuards(); // guards cache the resolved user between in-test requests
        $this->travel(29)->days();
        $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/auth/me')
            ->assertOk();

        // …and is rejected once the 30-day lifetime has passed.
        $this->travelBack();
        $this->app['auth']->forgetGuards();
        $this->travel(31)->days();
        $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/auth/me')
            ->assertUnauthorized();
    }
}
