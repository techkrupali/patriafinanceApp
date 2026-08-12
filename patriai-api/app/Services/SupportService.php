<?php

namespace App\Services;

use App\Models\SupportRequest;
use App\Models\User;
use Illuminate\Support\Facades\Log;

/**
 * Creates backend-team support escalations and notifies the team.
 *
 * Reuses the existing NotificationService (in-app + email) to notify admin users —
 * the app's backend/support team (User::isAdmin()) — rather than hardcoding any
 * employee email. Sensitive values are redacted before anything is persisted or
 * sent, and a short-window guard stops accidental duplicate escalations.
 */
class SupportService
{
    /** Window in which an identical request from the same user is treated as a duplicate. */
    private const DEDUPE_MINUTES = 10;

    public function __construct(private readonly NotificationService $notifications) {}

    public static function make(): self
    {
        return new self(NotificationService::make());
    }

    /**
     * Create (or return an existing recent identical) support request for $user.
     *
     * @param  array{subject:string,description:string,category?:?string,reference?:?string}  $data
     * @return array{request:SupportRequest,duplicate:bool}
     */
    public function create(User $user, array $data): array
    {
        $subject = $this->redact($this->clip((string) ($data['subject'] ?? ''), 150));
        $description = $this->redact($this->clip((string) ($data['description'] ?? ''), 2000));
        $reference = ($data['reference'] ?? null) !== null
            ? $this->redact($this->clip((string) $data['reference'], 100))
            : null;
        $category = $this->normalizeCategory($data['category'] ?? null);

        // Short-window duplicate guard: an identical still-open request from the same
        // user within the window is returned as-is (assistant retries don't dupe),
        // while a genuinely different problem still creates a new request.
        $existing = SupportRequest::where('user_id', $user->id)
            ->where('status', 'pending')
            ->where('subject', $subject)
            ->where('description', $description)
            ->where(fn ($q) => $reference === null ? $q->whereNull('reference') : $q->where('reference', $reference))
            ->where('created_at', '>=', now()->subMinutes(self::DEDUPE_MINUTES))
            ->latest()
            ->first();

        if ($existing) {
            return ['request' => $existing, 'duplicate' => true];
        }

        $request = SupportRequest::create([
            'user_id' => $user->id,
            'subject' => $subject,
            'category' => $category,
            'description' => $description,
            'reference' => $reference,
            'status' => 'pending',
            'priority' => 'medium',
        ]);

        $this->notifyTeam($user, $request);

        return ['request' => $request, 'duplicate' => false];
    }

    /** Notify the backend/support team (admin users) via the existing notifier. */
    private function notifyTeam(User $user, SupportRequest $request): void
    {
        $admins = User::where('role', 'admin')->get();

        if ($admins->isEmpty()) {
            Log::info("Support request #{$request->id} created but no admin users to notify.");

            return;
        }

        foreach ($admins as $admin) {
            $this->notifications->push(
                $admin,
                'support_request',
                'New support request: '.$request->subject,
                "{$user->fullName()} raised a {$request->category} issue.",
                [
                    'support_request_id' => $request->id,
                    'category' => $request->category,
                    'reference' => $request->reference,
                    'from_user_id' => $user->id,
                ],
            );
        }
    }

    private function normalizeCategory(?string $category): string
    {
        $c = strtolower(trim((string) $category));

        return in_array($c, SupportRequest::CATEGORIES, true) ? $c : 'other';
    }

    private function clip(string $value, int $max): string
    {
        $value = trim($value);

        return mb_strlen($value) > $max ? mb_substr($value, 0, $max) : $value;
    }

    /**
     * Redact anything secret-looking and mask bank account numbers before we store
     * or send it, in case the user pasted a secret. Never persist PIN/OTP/password/
     * token values.
     */
    public function redact(string $text): string
    {
        // 1. Value after a secret keyword → [redacted] (e.g. "my pin is 1234").
        $text = preg_replace(
            '/\b(pin|otp|password|passcode|token|secret|cvv|one[\s-]?time\s*code|code)\b\s*(is|:|=|->)?\s*\S+/i',
            '$1 [redacted]',
            $text
        );

        // 2. Long token-like blobs (20+ chars of base64/hex) → [redacted].
        $text = preg_replace('/\b[A-Za-z0-9_\-]{20,}\b/', '[redacted]', $text);

        // 3. Mask 10-digit (Nigerian bank) account numbers → ••••••7890.
        $text = preg_replace_callback('/\b\d{10}\b/', function ($m) {
            $n = $m[0];

            return str_repeat('•', strlen($n) - 4).substr($n, -4);
        }, $text);

        return $text;
    }
}
