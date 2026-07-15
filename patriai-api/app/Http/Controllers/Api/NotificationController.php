<?php

namespace App\Http\Controllers\Api;

use App\Models\AppNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends ApiController
{
    // GET /notifications
    public function index(Request $request): JsonResponse
    {
        $notifications = $request->user()->notificationsFeed()
            ->latest()
            ->paginate(20);

        return $this->ok('Notifications fetched', [
            'notifications' => collect($notifications->items())->map(fn ($n) => $this->serializeNotification($n)),
            'pagination' => [
                'page' => $notifications->currentPage(),
                'per_page' => $notifications->perPage(),
                'total' => $notifications->total(),
                'last_page' => $notifications->lastPage(),
            ],
        ]);
    }

    // GET /notifications/unread-count
    public function unreadCount(Request $request): JsonResponse
    {
        $count = $request->user()->notificationsFeed()->whereNull('read_at')->count();

        return $this->ok('Unread count fetched', ['count' => $count]);
    }

    // POST /notifications/{notification}/read
    public function read(Request $request, AppNotification $notification): JsonResponse
    {
        if ($notification->user_id !== $request->user()->id) {
            return $this->fail('Notification not found', 404);
        }

        if ($notification->read_at === null) {
            $notification->update(['read_at' => now()]);
        }

        return $this->ok('Notification marked read', ['notification' => $this->serializeNotification($notification->refresh())]);
    }

    // POST /notifications/read-all
    public function readAll(Request $request): JsonResponse
    {
        $request->user()->notificationsFeed()->whereNull('read_at')->update(['read_at' => now()]);

        return $this->ok('All notifications marked read');
    }
}
