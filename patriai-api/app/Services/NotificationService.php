<?php

namespace App\Services;

use App\Models\AppNotification;
use App\Models\User;

/**
 * In-app notification writer. No email/push — a simple insert into
 * app_notifications that the client polls / lists.
 */
class NotificationService
{
    public static function make(): self
    {
        return new self;
    }

    public function push(User $user, string $type, string $title, ?string $body = null, array $data = []): AppNotification
    {
        return AppNotification::create([
            'user_id' => $user->id,
            'type' => $type,
            'title' => $title,
            'body' => $body,
            'data' => $data ?: null,
        ]);
    }
}
