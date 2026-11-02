<?php

namespace Tests\Feature;

use App\Models\AppNotification;
use App\Models\Project;
use App\Models\ProjectMessage;
use App\Models\User;
use App\Models\VendorProfile;
use App\Models\Wallet;
use App\Models\WalletInvitation;
use App\Models\WalletMember;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * CHT-01…05: the project chat with milestone cards and Steward, a direct chat
 * with the builder, a family group linked to a project, unread counts, mute,
 * and leaving.
 */
class ChatsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        Http::fake(fn () => Http::response(['status' => true, 'statuscode' => '00', 'data' => ['balance' => 0]]));
    }

    private function person(string $first, string $last = 'Eze', int $mainKobo = 0): User
    {
        $user = User::factory()->create(['first_name' => $first, 'last_name' => $last, 'kyc_tier' => 3, 'phone' => '+234803' . fake()->unique()->numerify('#######')]);
        $main = Wallet::create(['user_id' => $user->id, 'type' => 'main', 'name' => 'Main wallet', 'balance' => $mainKobo]);
        WalletMember::create(['wallet_id' => $main->id, 'user_id' => $user->id, 'role' => 'owner', 'status' => 'active']);

        return $user;
    }

    private function project(): array
    {
        $ngozi = $this->person('Ngozi', 'Eze', 1_000_000_00);
        $emeka = $this->person('Emeka', 'Okafor');
        $tunde = $this->person('Tunde', 'Adeyemi');
        $profile = VendorProfile::create(['user_id' => $tunde->id, 'business_name' => 'Adeyemi Builders Ltd', 'category' => 'building', 'verified' => true, 'status' => 'verified', 'account_number' => '0123454410', 'bank_code' => '058', 'bank_name' => 'GTBank', 'account_name' => 'ADEYEMI BUILDERS LTD', 'auto_withdraw' => false]);
        $savings = Wallet::create(['user_id' => $ngozi->id, 'type' => 'savings', 'name' => 'House money', 'balance' => 4_000_000_00]);
        WalletMember::create(['wallet_id' => $savings->id, 'user_id' => $ngozi->id, 'role' => 'owner', 'status' => 'active']);
        Sanctum::actingAs($ngozi);
        $id = $this->postJson('/api/v1/projects', [
            'title' => "Mama's house renovation", 'kind' => 'renovation', 'budget' => '3500000', 'buffer_percent' => 0,
            'milestones' => [['title' => 'Roof repair', 'amount' => '1600000'], ['title' => 'Tiling and plaster', 'amount' => '1900000']],
            'vendor' => ['vendor_profile_id' => $profile->id], 'move_in_wallet_id' => $savings->id,
            'funders' => [['user_id' => $emeka->id, 'role' => 'co_owner', 'amount' => '100000']],
            'release' => ['photos' => true, 'video' => false, 'receipts' => false, 'approvers' => 'all', 'retention_percent' => 10, 'retention_months' => 3],
        ])->assertCreated()->json('data.project.id');
        Sanctum::actingAs($emeka);
        $this->postJson('/api/v1/invitations/' . WalletInvitation::where('invitee_user_id', $emeka->id)->sole()->id . '/accept')->assertOk();
        Sanctum::actingAs($tunde);
        $this->postJson("/api/v1/projects/{$id}/accept")->assertOk();

        return [Project::find($id), $ngozi, $emeka, $tunde];
    }

    public function test_the_project_chat_has_milestone_cards_and_steward(): void
    {
        [$project, $ngozi, $emeka, $tunde] = $this->project();
        $roof = $project->milestones()->orderBy('sequence')->first();

        // VDM-05 submit → CHT-03 "MILESTONE SUBMITTED" card.
        Sanctum::actingAs($tunde);
        $this->post("/api/v1/milestones/{$roof->id}/evidence", ['file' => UploadedFile::fake()->image('roof.jpg'), 'caption' => 'Roof'], ['Accept' => 'application/json'])->assertOk();
        $this->postJson("/api/v1/milestones/{$roof->id}/submit", ['note' => 'Roof done. Uploaded photos for the family to check.'])->assertOk();
        $card = ProjectMessage::where('project_id', $project->id)->where('kind', 'milestone')->sole();
        $this->assertSame('Roof repair', $card->payload['title']);
        $this->assertSame('Roof', $card->payload['photos'][0]['caption']);

        // CHT-01: Emeka sees the project chat with one unread.
        Sanctum::actingAs($emeka);
        $this->getJson('/api/v1/chats')->assertOk()
            ->assertJsonPath('data.chats.0.type', 'project')
            ->assertJsonPath('data.chats.0.title', "Mama's house renovation")
            ->assertJsonPath('data.chats.0.last', 'Tunde: Roof done. Uploaded photos for the family to check.')
            ->assertJsonPath('data.chats.0.unread', 1);
        $this->getJson("/api/v1/projects/{$project->id}/messages")->assertOk()->assertJsonPath('data.messages.0.kind', 'milestone');
        $this->getJson('/api/v1/chats')->assertJsonPath('data.chats.0.unread', 0);

        // Ngozi approves (1 of 2) → a line in the chat; Emeka asks Steward.
        Sanctum::actingAs($ngozi);
        $this->postJson("/api/v1/milestones/{$roof->id}/approve", ['pin' => '1234'])->assertOk()->assertJsonPath('data.milestone.status', 'approved');
        Sanctum::actingAs($emeka);
        $this->postJson("/api/v1/projects/{$project->id}/messages", ['body' => 'Steward, what is left to approve?'])->assertCreated();
        $answer = ProjectMessage::where('project_id', $project->id)->where('kind', 'steward')->sole()->body;
        $this->assertStringContainsString('Roof repair is ₦1,600,000. Ngozi approved; it needs 1 more approver.', $answer);
        $this->assertStringContainsString('₦1,440,000 goes to Adeyemi Builders Ltd', $answer);

        // CHT-05: who's in it; Tunde mutes it and hears nothing more.
        Sanctum::actingAs($tunde);
        $this->getJson("/api/v1/projects/{$project->id}/chat-info")->assertOk()
            ->assertJsonPath('data.people.0.first_name', 'Tunde')
            ->assertJsonPath('data.people.0.label', 'Vendor');
        $this->patchJson("/api/v1/projects/{$project->id}/chat", ['muted' => true])->assertOk();
        $before = AppNotification::where('user_id', $tunde->id)->where('type', 'project_message')->count();
        Sanctum::actingAs($ngozi);
        $this->postJson("/api/v1/projects/{$project->id}/messages", ['body' => 'Thank you Tunde'])->assertCreated();
        $this->assertSame($before, AppNotification::where('user_id', $tunde->id)->where('type', 'project_message')->count());

        // The second yes pays — the chat says so.
        Sanctum::actingAs($emeka);
        $this->postJson("/api/v1/milestones/{$roof->id}/approve", ['pin' => '1234'])->assertOk()->assertJsonPath('data.milestone.status', 'released');
        $this->assertTrue(ProjectMessage::where('project_id', $project->id)->where('kind', 'system')->where('body', 'like', '₦1,440,000 paid to Tunde for Roof repair%')->exists());
    }

    public function test_direct_and_group_chats(): void
    {
        [$project, $ngozi, $emeka, $tunde] = $this->project();
        $stranger = $this->person('Stranger');

        // CHT-02: Ngozi can add family and the builder, not strangers.
        Sanctum::actingAs($ngozi);
        $people = collect($this->getJson('/api/v1/chat-contacts')->assertOk()->json('data.people'))->keyBy('first_name');
        $this->assertSame('Adeyemi Builders Ltd · vendor', $people['Tunde']['label']);
        $this->assertSame('family', $people['Emeka']['side']);
        $this->assertArrayNotHasKey('Stranger', $people->all());

        // CHT-04: a direct chat with the builder — the same one each time.
        $id = $this->postJson('/api/v1/chats/direct', ['user_id' => $tunde->id])->assertCreated()
            ->assertJsonPath('data.chat.sub', 'Adeyemi Builders Ltd · verified')->json('data.chat.id');
        $this->assertSame($id, $this->postJson('/api/v1/chats/direct', ['user_id' => $tunde->id])->json('data.chat.id'));
        $this->postJson("/api/v1/chats/{$id}/messages", ['body' => 'Can you send a quote with phases?'])->assertCreated();
        Sanctum::actingAs($tunde);
        $this->getJson('/api/v1/chats?filter=family')->assertOk()->assertJsonPath('data.chats.0.title', 'Ngozi Eze')->assertJsonPath('data.chats.0.unread', 1);
        $this->getJson("/api/v1/chats/{$id}")->assertOk()->assertJsonPath('data.messages.0.body', 'Can you send a quote with phases?');
        $this->getJson('/api/v1/chats?filter=family')->assertJsonPath('data.chats.0.unread', 0);
        Sanctum::actingAs($ngozi);
        $this->getJson('/api/v1/chats?filter=vendors')->assertJsonPath('data.chats.0.title', 'Tunde Adeyemi');

        // A family group linked to the project, with Steward.
        $this->postJson('/api/v1/chats/groups', ['title' => 'Okafor family', 'member_ids' => [$stranger->id]])->assertStatus(422);
        $group = $this->postJson('/api/v1/chats/groups', ['title' => 'Okafor family', 'member_ids' => [$emeka->id], 'project_id' => $project->id, 'steward' => true])->assertCreated()
            ->assertJsonPath('data.chat.sub', '2 people · Steward')->json('data.chat.id');
        Sanctum::actingAs($emeka);
        $this->postJson("/api/v1/chats/{$group}/messages", ['body' => "Steward, what's next?"])->assertCreated();
        $this->getJson("/api/v1/chats/{$group}")->assertOk()
            ->assertJsonPath('data.messages.2.kind', 'steward')
            ->assertJsonPath('data.messages.2.body', 'Nothing is waiting for approval. Next is Roof repair, ₦1,600,000 — funded and locked until it is approved.');
        $this->assertSame(1, AppNotification::where('user_id', $ngozi->id)->where('type', 'chat_message')->where('title', 'Emeka in Okafor family')->count());

        // Leave the group.
        $this->deleteJson("/api/v1/chats/{$group}/members/me")->assertOk();
        $this->getJson("/api/v1/chats/{$group}")->assertNotFound();
        Sanctum::actingAs($stranger);
        $this->getJson("/api/v1/chats/{$id}")->assertNotFound();
    }
}
