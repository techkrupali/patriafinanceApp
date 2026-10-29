<?php

namespace App\Http\Controllers\Api;

use App\Models\SystemSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Before sign-in, the app asks (SYS-02 Update required, SYS-03 Maintenance)
 * and, for ME-19 Legal, which documents there are.
 */
class AppStatusController extends ApiController
{
    // GET /app/status?version=1.2.0
    public function show(Request $request): JsonResponse
    {
        $min = (string) SystemSetting::get('min_app_version');
        $version = (string) $request->query('version', '');
        $maintenance = SystemSetting::get('maintenance') ?: ['on' => false];

        return $this->ok('Status', [
            'min_version' => $min,
            'latest_version' => SystemSetting::get('latest_app_version'),
            'update_required' => $version !== '' && version_compare($version, $min, '<'),
            'maintenance' => [
                'on' => (bool) ($maintenance['on'] ?? false),
                'until' => $maintenance['until'] ?? null,
                'message' => $maintenance['message'] ?? null,
            ],
            'support_phone' => SystemSetting::get('support_phone'),
            'server_time' => now()->toIso8601String(),
        ]);
    }

    // GET /legal — ME-19
    public function legal(): JsonResponse
    {
        return $this->ok('Legal', [
            'documents' => collect(config('legal.documents'))->map(fn ($d, $key) => ['key' => $key, 'title' => $d['title'], 'sub' => $d['sub'], 'updated' => $d['updated'] ?? null])->values(),
            'company' => config('legal.company'),
        ]);
    }

    // GET /legal/{key}
    public function document(string $key): JsonResponse
    {
        $doc = config("legal.documents.{$key}");
        if (!$doc) {
            return $this->fail('Not found', 404);
        }

        return $this->ok($doc['title'], ['key' => $key] + $doc);
    }
}
