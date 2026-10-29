<?php

namespace App\Services;

use App\Models\Project;
use App\Models\User;
use App\Models\VendorDirector;
use App\Models\VendorDocument;
use App\Models\VendorProfile;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * A business account (VDM-01, VON-01…10): business details, the owner's own
 * identity, an ID document, CAC papers, directors, where they work from, the
 * business bank account and what families will see. Each item is checked by
 * Patriai (there's no CAC or BVN provider yet, so an admin reviews them) and
 * approved or sent back with a note; when everything is approved the business
 * is verified and families can pay it through milestones.
 */
class VendorAccountService
{
    /** Documents that stay private (served only to the owner and admins). */
    private const PRIVATE_ITEMS = ['selfie', 'id_front', 'id_back', 'cac_certificate', 'cac_status_report', 'memorandum', 'address_proof', 'office_photo', 'tin_certificate'];

    public function __construct(
        private readonly NotificationService $notifications,
    ) {}

    public static function make(): self
    {
        return new self(NotificationService::make());
    }

    // ----------------------------------------------------------------- the steps

    /**
     * VDM-01 / VON-08 / VDM-07: business details and what families see. Fields
     * not sent are left as they are.
     */
    public function saveDetails(User $user, array $data): VendorProfile
    {
        $profile = VendorProfile::firstOrNew(['user_id' => $user->id]);
        if (!$profile->exists && empty($data['business_name'])) {
            throw ValidationException::withMessages(['business_name' => 'Enter the business name.']);
        }
        $fields = array_intersect_key($data, array_flip(['business_name', 'rc_number', 'since_year', 'category', 'services', 'bio', 'location', 'areas', 'team_size']));
        if (isset($fields['rc_number'])) {
            $fields['rc_number'] = strtoupper(preg_replace('/\s+/', '', $fields['rc_number']));
        }
        $profile->fill($fields + ($profile->exists ? [] : ['category' => 'other', 'status' => 'draft', 'checks' => $this->emptyChecks()]));
        $profile->save();

        // The owner is the first director (VON-05 "Tunde Adeyemi · Director · you").
        if (!$profile->directors()->where('user_id', $user->id)->exists()) {
            $profile->directors()->create(['user_id' => $user->id, 'name' => $user->fullName(), 'phone' => $user->phone, 'status' => 'waiting']);
        }
        $this->refreshChecks($profile);

        return $profile->refresh();
    }

    /** VON-02/03: the person running the business, verified like any Patriai user. */
    public function saveOwner(VendorProfile $profile, array $data): VendorProfile
    {
        $profile->fill(array_filter([
            'owner_bvn' => $data['bvn'] ?? null,
            'owner_nin' => $data['nin'] ?? null,
            'id_type' => $data['id_type'] ?? null,
        ], fn ($v) => $v !== null))->save();
        $this->refreshChecks($profile);

        return $profile->refresh();
    }

    /** A verification file: an ID, a CAC paper, proof of address, a selfie, a TIN certificate. */
    public function addDocument(VendorProfile $profile, string $item, UploadedFile $file): VendorDocument
    {
        if (!in_array($item, VendorProfile::DOCUMENT_ITEMS, true)) {
            throw ValidationException::withMessages(['item' => 'That document type isn\'t used here.']);
        }
        // One of each (a new upload replaces the old one), except office photos.
        if ($item !== 'office_photo') {
            $profile->documents()->where('item', $item)->get()->each(fn (VendorDocument $d) => $this->deleteDocument($d));
        }
        $path = $file->store("vendor-documents/{$profile->id}", 'local');
        $doc = $profile->documents()->create(['item' => $item, 'url' => $path, 'name' => Str::limit($file->getClientOriginalName() ?: $item, 120, '')]);

        // A redo becomes "being checked" again once the new file is in.
        $check = $this->checkFor($item);
        if ($check && ($profile->checks[$check]['status'] ?? null) === 'redo') {
            $this->setCheck($profile, $check, 'todo');
        }
        $this->refreshChecks($profile);

        return $doc;
    }

    public function deleteDocument(VendorDocument $doc): void
    {
        Storage::disk('local')->delete($doc->url);
        $doc->delete();
    }

    /** VON-05: another director or owner with 25% or more gets an SMS link to verify. */
    public function addDirector(VendorProfile $profile, User $owner, array $data): VendorDirector
    {
        $phone = $data['phone'];
        if ($profile->directors()->where('phone', $phone)->exists()) {
            throw ValidationException::withMessages(['phone' => 'That person is already listed.']);
        }
        $director = $profile->directors()->create([
            'name' => trim($data['name']),
            'phone' => $phone,
            'share_percent' => $data['share_percent'] ?? null,
            'status' => 'waiting',
            'token' => Str::random(40),
        ]);
        $link = rtrim((string) config('app.url'), '/') . "/d/{$director->token}";
        SmsService::make()->send($phone, "{$owner->first_name} added you as a director of {$profile->business_name} on Patriai. Verify with your BVN and a selfie: {$link}");
        $this->refreshChecks($profile);

        return $director;
    }

    /** The owner's own share (VON-05 "Director · 70% · you"). */
    public function setOwnerShare(VendorProfile $profile, User $owner, ?int $share): void
    {
        $profile->directors()->where('user_id', $owner->id)->update(['share_percent' => $share]);
    }

    /** /d/{token}: a director verifies with their BVN and a selfie. */
    public function directorVerified(VendorDirector $director, string $bvn, UploadedFile $selfie): void
    {
        $path = $selfie->store("vendor-documents/{$director->vendor_profile_id}/directors", 'local');
        $director->update(['bvn' => $bvn, 'selfie_url' => $path, 'status' => 'submitted', 'token' => null]);
        $profile = $director->vendorProfile;
        $this->refreshChecks($profile);
        $this->notifications->push($profile->user, 'vendor_director_verified', "{$director->name} sent their details", "We're checking {$director->name}'s BVN and selfie for {$profile->business_name}.", ['vendor_profile_id' => $profile->id]);
    }

    /** VON-07: the business bank account, checked with the bank; the name should match the business. */
    public function saveBank(VendorProfile $profile, string $accountNumber, string $bankCode): VendorProfile
    {
        try {
            $result = MatrixBankingService::make()->verifyBankAccount($accountNumber, $bankCode);
        } catch (\RuntimeException $e) {
            throw ValidationException::withMessages(['account_number' => $e->getMessage()]);
        }
        $name = trim(($result['first_name'] ?? '') . ' ' . ($result['last_name'] ?? ''));
        $profile->update([
            'account_number' => $accountNumber,
            'bank_code' => $bankCode,
            'bank_name' => $result['bank_name'] ?? null,
            'account_name' => $name,
        ]);
        // "ADEYEMI BUILDERS LTD · name matches CAC": a match is approved straight away.
        $this->setCheck($profile, 'bank', $this->namesMatch($profile->business_name, $name) ? 'approved' : 'todo');
        $this->refreshChecks($profile);

        return $profile->refresh();
    }

    /** VON-09 "Submit for review": everything needed is in, so Patriai checks it. */
    public function submit(VendorProfile $profile): VendorProfile
    {
        $missing = array_keys(array_filter($this->readiness($profile), fn ($ready) => !$ready));
        if ($missing) {
            $labels = array_map(fn ($c) => $this->labels()[$c][0], $missing);
            throw ValidationException::withMessages(['submit' => 'Still needed: ' . implode(', ', $labels) . '.']);
        }
        $checks = $profile->checks ?? $this->emptyChecks();
        foreach (VendorProfile::CHECKS as $check) {
            if (($checks[$check]['status'] ?? 'todo') !== 'approved') {
                $checks[$check] = ['status' => 'pending', 'note' => null];
            }
        }
        $profile->update(['checks' => $checks, 'status' => 'submitted', 'submitted_at' => now()]);
        $this->notifications->push($profile->user, 'vendor_submitted', "We're checking {$profile->business_name}", 'Usually done in 1 working day. You can accept invites and chat meanwhile.', ['vendor_profile_id' => $profile->id]);
        $this->maybeVerify($profile->refresh());

        return $profile->refresh();
    }

    // ----------------------------------------------------------------- admin

    /** Admin: approve one item, or send it back with a note ("NEPA bill is over 3 months old"). */
    public function review(VendorProfile $profile, string $check, bool $approve, ?string $note): VendorProfile
    {
        if (!in_array($check, VendorProfile::CHECKS, true)) {
            throw ValidationException::withMessages(['item' => 'Unknown item.']);
        }
        $this->setCheck($profile, $check, $approve ? 'approved' : 'redo', $approve ? null : $note);
        if ($check === 'directors' && $approve) {
            $profile->directors()->where('status', 'submitted')->update(['status' => 'verified']);
        }
        if ($check === 'owner' && $approve) {
            $profile->directors()->where('user_id', $profile->user_id)->update(['status' => 'verified']);
        }
        if (!$approve) {
            $profile->update(['status' => 'needs_changes']);
            $label = $this->labels()[$check][0];
            $this->notifications->push($profile->user, 'vendor_needs_changes', "{$label} needs another look", $note ?: 'Open your verification to see what to change.', ['vendor_profile_id' => $profile->id]);
        } elseif ($profile->status === 'needs_changes' && !collect($profile->refresh()->checks)->contains(fn ($c) => ($c['status'] ?? null) === 'redo')) {
            $profile->update(['status' => 'submitted']);
        }
        $this->maybeVerify($profile->refresh());

        return $profile->refresh();
    }

    /** VON-10: every item approved, so the business is verified and can be paid. */
    private function maybeVerify(VendorProfile $profile): void
    {
        if ($profile->status === 'verified') {
            return;
        }
        $allApproved = collect(VendorProfile::CHECKS)->every(fn ($c) => ($profile->checks[$c]['status'] ?? null) === 'approved');
        if (!$allApproved) {
            return;
        }
        $profile->update(['status' => 'verified', 'verified' => true, 'verified_at' => now()]);
        $this->notifications->push($profile->user, 'vendor_verified', "{$profile->business_name} is verified", 'Families can now pay you through milestones, and you appear in the vendor directory.', ['vendor_profile_id' => $profile->id]);
    }

    // ----------------------------------------------------------------- reads

    /** VON-09 "Verification": each item, what it covers, and where it stands. */
    public function verification(VendorProfile $profile): array
    {
        $profile->loadMissing('documents', 'directors');
        $docs = $profile->documents->groupBy('item');
        $waitingDirectors = $profile->directors->where('user_id', '!=', $profile->user_id)->where('status', 'waiting')->pluck('name')->values();
        $items = [];
        foreach (VendorProfile::CHECKS as $check) {
            [$label, $sub] = $this->labels()[$check];
            $state = $profile->checks[$check] ?? ['status' => 'todo', 'note' => null];
            if ($check === 'id_document' && $profile->id_type) {
                $label = ucfirst(str_replace(['_', 'drivers'], [' ', "driver's"], $profile->id_type));
            }
            if ($check === 'directors' && $waitingDirectors->isNotEmpty() && $state['status'] !== 'approved') {
                $state = ['status' => 'waiting', 'note' => $waitingDirectors->join(', ', ' and ') . ' still to verify'];
            }
            $items[] = ['item' => $check, 'label' => $label, 'sub' => $sub, 'status' => $state['status'], 'note' => $state['note'] ?? null];
        }
        $needs = collect($items)->whereIn('status', ['redo', 'todo'])->count() + collect($items)->where('status', 'waiting')->count();

        return [
            'status' => $profile->status,
            'items' => $items,
            'needs_you' => $needs,
            'ready' => collect($this->readiness($profile))->every(fn ($r) => $r),
            'documents' => $profile->documents->map(fn (VendorDocument $d) => ['id' => $d->id, 'item' => $d->item, 'name' => $d->name])->values(),
            'directors' => $profile->directors->map(fn (VendorDirector $d) => [
                'id' => $d->id,
                'name' => $d->name,
                'share_percent' => $d->share_percent,
                'is_owner' => $d->user_id === $profile->user_id,
                'status' => $d->status,
            ])->values(),
            'has' => [
                'bvn' => (bool) $profile->owner_bvn,
                'nin' => (bool) $profile->owner_nin,
                'selfie' => $docs->has('selfie'),
                'id_front' => $docs->has('id_front'),
                'id_back' => $docs->has('id_back'),
                'cac_certificate' => $docs->has('cac_certificate'),
                'cac_status_report' => $docs->has('cac_status_report'),
                'address_proof' => $docs->has('address_proof'),
            ],
        ];
    }

    /** What's needed before "Submit for review". */
    private function readiness(VendorProfile $profile): array
    {
        $profile->loadMissing('documents');
        $has = fn (string $item) => $profile->documents->contains('item', $item);
        $idBack = !in_array($profile->id_type, ['drivers_licence', 'national_id', 'voters_card'], true) || $has('id_back');

        return [
            'owner' => (bool) $profile->owner_bvn && (bool) $profile->owner_nin && $has('selfie'),
            'id_document' => (bool) $profile->id_type && $has('id_front') && $idBack,
            'cac' => (bool) $profile->rc_number && $has('cac_certificate') && $has('cac_status_report'),
            'directors' => true,
            'address' => (bool) $profile->address && $has('address_proof'),
            'bank' => (bool) $profile->account_number,
        ];
    }

    /** Families only see the city, never the full address (VON-06). */
    public function labels(): array
    {
        return [
            'owner' => ['Owner identity', 'BVN, NIN and selfie'],
            'id_document' => ['ID document', 'Front and back'],
            'cac' => ['CAC documents', 'Certificate and status report'],
            'directors' => ['Directors', 'Everyone with 25% or more'],
            'address' => ['Proof of address', 'Under 3 months old'],
            'bank' => ['Bank account', 'In the business name'],
        ];
    }

    /** Projects a family invited this phone number to before the business signed up (INV-V1). */
    public function linkInvites(User $user): int
    {
        if (!$user->phone) {
            return 0;
        }
        $linked = 0;
        Project::whereNull('vendor_id')->where('meta->vendor_invite', $user->phone)->get()->each(function (Project $project) use ($user, &$linked) {
            $meta = $project->meta;
            unset($meta['vendor_invite']);
            $project->update(['vendor_id' => $user->id, 'vendor_status' => 'invited', 'meta' => $meta]);
            $linked++;
        });

        return $linked;
    }

    // ----------------------------------------------------------------- helpers

    private function emptyChecks(): array
    {
        return collect(VendorProfile::CHECKS)->mapWithKeys(fn ($c) => [$c => ['status' => 'todo', 'note' => null]])->all();
    }

    private function setCheck(VendorProfile $profile, string $check, string $status, ?string $note = null): void
    {
        $checks = $profile->checks ?? $this->emptyChecks();
        $checks[$check] = ['status' => $status, 'note' => $note];
        $profile->update(['checks' => $checks]);
    }

    /** Before submission an item is only "todo"; afterwards a fresh upload goes back to "pending". */
    private function refreshChecks(VendorProfile $profile): void
    {
        $profile->refresh();
        if (!in_array($profile->status, ['submitted', 'needs_changes'], true)) {
            return;
        }
        $checks = $profile->checks ?? $this->emptyChecks();
        foreach ($this->readiness($profile) as $check => $ready) {
            if ($ready && ($checks[$check]['status'] ?? 'todo') === 'todo') {
                $checks[$check] = ['status' => 'pending', 'note' => null];
            }
        }
        $profile->update(['checks' => $checks]);
    }

    private function checkFor(string $item): ?string
    {
        return match ($item) {
            'selfie' => 'owner',
            'id_front', 'id_back' => 'id_document',
            'cac_certificate', 'cac_status_report', 'memorandum' => 'cac',
            'address_proof', 'office_photo' => 'address',
            default => null,
        };
    }

    /** "ADEYEMI BUILDERS LTD" matches "Adeyemi Builders Limited". */
    private function namesMatch(string $business, string $account): bool
    {
        $norm = fn (string $s) => collect(preg_split('/\s+/', strtolower(preg_replace('/[^a-z0-9 ]/i', ' ', $s))))
            ->map(fn ($w) => in_array($w, ['limited', 'ltd', 'plc', 'nigeria', 'nig', 'enterprises', 'enterprise', 'ventures', 'and', 'co'], true) ? '' : $w)
            ->filter()->values();
        $a = $norm($business);
        $b = $norm($account);

        return $a->isNotEmpty() && $a->diff($b)->isEmpty();
    }
}
