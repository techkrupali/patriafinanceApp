<?php

namespace Tests\Feature;

use App\Models\Milestone;
use App\Models\Project;
use App\Models\User;
use App\Models\VendorProfile;
use App\Models\VendorReview;
use App\Models\Wallet;
use App\Services\Assistant\ToolRegistry;
use App\Services\Assistant\Tools\FindVendorsTool;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Tests\TestCase;

/** VND-03 "Find a tiler near Nsukka": Steward searches the vendor directory, best rated first, with no made-up prices. */
class AssistantFindVendorsTest extends TestCase
{
    use RefreshDatabase;

    private function vendor(string $name, string $category, string $location, bool $verified, array $ratings = []): VendorProfile
    {
        $owner = User::factory()->create();
        $profile = VendorProfile::create(['user_id' => $owner->id, 'business_name' => $name, 'category' => $category, 'location' => $location, 'verified' => $verified, 'status' => $verified ? 'verified' : 'submitted']);
        foreach ($ratings as $i => $rating) {
            $family = User::factory()->create();
            $wallet = Wallet::create(['user_id' => $family->id, 'type' => 'project', 'name' => 'P', 'balance' => 0]);
            $project = Project::create(['owner_id' => $family->id, 'vendor_id' => $owner->id, 'wallet_id' => $wallet->id, 'title' => "Job {$i}", 'budget' => 1, 'status' => 'completed']);
            $m = Milestone::create(['project_id' => $project->id, 'sequence' => 1, 'title' => 'Floor', 'amount' => 1, 'status' => 'released']);
            VendorReview::create(['vendor_profile_id' => $profile->id, 'user_id' => $family->id, 'project_id' => $project->id, 'milestone_id' => $m->id, 'rating' => $rating, 'first_name_only' => true]);
        }

        return $profile;
    }

    public function test_it_finds_verified_tilers_near_a_town_best_rated_first(): void
    {
        $this->vendor('Nnaji Floors', 'tiling', 'Nsukka', true, [4, 5]);
        $this->vendor('Okonkwo Tiles', 'tiling', 'Nsukka', true, [5, 5]);
        $this->vendor('Unchecked Tiling', 'tiling', 'Nsukka', false, [5]);
        $this->vendor('Lagos Tiles', 'tiling', 'Lagos', true, [5]);
        $this->vendor('Adeyemi Builders', 'building', 'Nsukka', true);

        $request = Request::create('/api/v1/assistant/chat', 'POST');
        $user = User::factory()->create();
        $request->setUserResolver(fn () => $user);

        $out = (new FindVendorsTool())->handle($request, ['category' => 'tiling', 'near' => 'Nsukka']);

        $this->assertSame(2, $out['count']);
        $this->assertSame(['Okonkwo Tiles', 'Nnaji Floors'], array_column($out['vendors'], 'name'));
        $this->assertSame(5.0, (float) $out['vendors'][0]['rating']);
        $this->assertTrue($out['vendors'][0]['verified']);
        // No prices or distances are invented.
        $this->assertArrayNotHasKey('price', $out['vendors'][0]);
        $this->assertStringContainsString('written quote', $out['note']);

        // Anyone, verified or not, when asked.
        $all = (new FindVendorsTool())->handle($request, ['category' => 'tiling', 'near' => 'nsukka', 'verified_only' => false]);
        $this->assertSame(3, $all['count']);

        // Steward can call it.
        $this->assertNotNull((new ToolRegistry())->get('find_vendors'));
    }
}
