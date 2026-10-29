<?php

namespace App\Services\Assistant\Tools;

use App\Http\Controllers\Api\VendorController;
use App\Models\VendorProfile;
use App\Services\Assistant\Contracts\AssistantTool;
use Illuminate\Http\Request;

/**
 * Read-only: VND-03 "Find a tiler near Nsukka" — search the vendor directory.
 *
 * Reuses GET /api/v1/vendors (VendorController::index) under the same
 * authenticated request, so the results are exactly what the directory shows.
 * Patriai has no price list or map distances for vendors, so the tool returns
 * none; the assistant tells the user to ask each vendor for a written quote.
 */
class FindVendorsTool implements AssistantTool
{
    public function name(): string
    {
        return 'find_vendors';
    }

    public function description(): string
    {
        return 'Search Patriai\'s vendor directory (builders, tilers, electricians, '
            .'plumbers, event planners, schools, caterers) by trade, town and '
            .'keywords. Returns each vendor\'s business name, rating, number of '
            .'reviews, location, the areas they cover, services and whether '
            .'Patriai has verified them. Use it for requests like "find a tiler '
            .'near Nsukka". There are no prices or distances: never invent '
            .'them — tell the user to ask each vendor for a written quote before '
            .'adding them to a project. Read-only.';
    }

    public function inputSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'category' => [
                    'type' => 'string',
                    'enum' => ['building', 'tiling', 'electrical', 'plumbing', 'events', 'school', 'catering', 'other'],
                    'description' => 'The trade, if one fits ("tiler" → tiling, "builder" → building).',
                ],
                'near' => [
                    'type' => 'string',
                    'description' => 'A town or area, e.g. "Nsukka".',
                ],
                'query' => [
                    'type' => 'string',
                    'description' => 'Other words to match in the name or description, e.g. "roofing".',
                ],
                'verified_only' => [
                    'type' => 'boolean',
                    'description' => 'Only businesses Patriai has verified (default true; families can only pay verified businesses).',
                ],
            ],
            'additionalProperties' => false,
        ];
    }

    public function handle(Request $request, array $input): array
    {
        $category = in_array($input['category'] ?? null, VendorProfile::CATEGORIES, true) ? $input['category'] : null;
        $sub = Request::create('/api/v1/vendors', 'GET', array_filter([
            'category' => $category,
            'near' => trim((string) ($input['near'] ?? '')) ?: null,
            'q' => trim((string) ($input['query'] ?? '')) ?: null,
            'verified' => ($input['verified_only'] ?? true) ? 1 : null,
            'per_page' => 10,
        ], fn ($v) => $v !== null));
        $sub->setUserResolver($request->getUserResolver());

        $vendors = app(VendorController::class)->index($sub)->getData(true)['data']['vendors'] ?? [];
        // Best rated first, as the directory's "near you" list reads.
        usort($vendors, fn ($a, $b) => [($b['rating'] ?? 0), ($b['reviews'] ?? 0)] <=> [($a['rating'] ?? 0), ($a['reviews'] ?? 0)]);

        return [
            'count' => count($vendors),
            'vendors' => array_map(fn ($v) => [
                'vendor_profile_id' => $v['id'],
                'name' => $v['business_name'],
                'category' => $v['category'],
                'rating' => $v['rating'],
                'reviews' => $v['reviews'],
                'location' => $v['location'],
                'areas' => $v['areas'],
                'services' => $v['services'],
                'verified' => $v['verified'],
                'projects_completed' => $v['projects_completed'],
            ], $vendors),
            'note' => 'No prices or distances are known. Suggest asking each vendor for a written quote.',
        ];
    }
}
