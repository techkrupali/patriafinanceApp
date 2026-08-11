<?php

namespace App\Services;

use App\Models\AppNotification;
use App\Models\User;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Notification writer: records an in-app notification AND emails the user.
 * The email is sent after the HTTP response (afterResponse) so it never slows
 * the request, holds a DB transaction open, or breaks the calling flow if the
 * mailer is down. OTP emails are handled separately in OtpService.
 */
class NotificationService
{
    public static function make(): self
    {
        return new self;
    }

    public function push(User $user, string $type, string $title, ?string $body = null, array $data = []): AppNotification
    {
        $notification = AppNotification::create([
            'user_id' => $user->id,
            'type' => $type,
            'title' => $title,
            'body' => $body,
            'data' => $data ?: null,
        ]);

        $this->email($user, $title, $body);

        return $notification;
    }

    /** Best-effort email mirror of the in-app notification. */
    private function email(User $user, string $title, ?string $body): void
    {
        $to = $user->email;
        if (!$to) {
            return;
        }
        $text = trim(($body ?? $title) . "\n\nOpen Patriai to view the details.");

        // Deferred to after the response: no request latency, no lock held, and
        // it runs without a queue worker.
        dispatch(function () use ($to, $title, $text) {
            try {
                Mail::raw($text, function ($m) use ($to, $title) {
                    $m->to($to)->subject($title);
                });
            } catch (\Throwable $e) {
                Log::warning("Notification email failed for {$to}: {$e->getMessage()}");
            }
        })->afterResponse();
    }
}
