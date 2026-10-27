<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Text messages over SMS or WhatsApp via Termii (Nigeria). Used for phone
 * sign-up and log-in codes. With no API key configured the message is only
 * logged, so local development works without a provider.
 */
class SmsService
{
    public static function make(): self
    {
        return app(self::class);
    }

    /** Send $message to an E.164 number. Returns false when it could not be sent. */
    public function send(string $phone, string $message, string $channel = 'sms'): bool
    {
        $key = config('services.termii.api_key');
        if (!$key) {
            Log::info("SMS ({$channel}) to {$phone} not sent, no Termii key configured: {$message}");

            return false;
        }

        try {
            $res = Http::timeout(10)->acceptJson()->post(rtrim(config('services.termii.base_url'), '/') . '/api/sms/send', [
                'api_key' => $key,
                'to' => ltrim($phone, '+'),
                'from' => config('services.termii.sender_id'),
                'sms' => $message,
                'type' => 'plain',
                'channel' => $channel === 'whatsapp' ? 'whatsapp' : config('services.termii.sms_channel'),
            ]);
        } catch (\Throwable $e) {
            Log::warning("Termii {$channel} to {$phone} failed: {$e->getMessage()}");

            return false;
        }

        if (!$res->successful()) {
            Log::warning("Termii {$channel} to {$phone} rejected ({$res->status()}): " . $res->body());

            return false;
        }

        return true;
    }
}
