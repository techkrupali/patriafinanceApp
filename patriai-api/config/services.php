<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'token' => env('POSTMARK_TOKEN'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'resend' => [
        'key' => env('RESEND_KEY'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    // AI Assistant — Anthropic Claude (Messages API). The key lives ONLY in
    // .env (gitignored), never in source. Model is env-overridable.
    'anthropic' => [
        'api_key' => env('ANTHROPIC_API_KEY'),
        'model' => env('ANTHROPIC_MODEL', 'claude-opus-5'),
        'base_url' => env('ANTHROPIC_BASE_URL', 'https://api.anthropic.com/v1'),
        'version' => env('ANTHROPIC_VERSION', '2023-06-01'),
        'max_tokens' => (int) env('ANTHROPIC_MAX_TOKENS', 1024),
    ],

    // Client-provided banking rails (Matrix Banking API).
    // Local dev points at the sandbox in backend/; production points at the live host.
    'matrix' => [
        'base_url' => env('MATRIX_BASE_URL', 'http://localhost:8000/api/v1'),
        'api_key' => env('MATRIX_API_KEY'),
        'username' => env('MATRIX_USERNAME', 'demo'),
        'password' => env('MATRIX_PASSWORD', 'password123'),
        'settlement_account' => env('MATRIX_SETTLEMENT_ACCOUNT'),
        'transfer_fee_kobo' => (int) env('MATRIX_TRANSFER_FEE_KOBO', 2000),
        'webhook_secret' => env('MATRIX_WEBHOOK_SECRET'),
    ],

    // SMS + WhatsApp delivery for phone sign-up codes (Termii). Without a key,
    // codes are only written to the log (fine for local dev, not for launch).
    'termii' => [
        'api_key' => env('TERMII_API_KEY'),
        'base_url' => env('TERMII_BASE_URL', 'https://api.ng.termii.com'),
        'sender_id' => env('TERMII_SENDER_ID', 'Patriai'),
        // Termii route for SMS: "dnd" reaches DND-listed Nigerian numbers.
        'sms_channel' => env('TERMII_SMS_CHANNEL', 'dnd'),
    ],

];
