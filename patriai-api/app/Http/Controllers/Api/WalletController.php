<?php

namespace App\Http\Controllers\Api;

use App\Models\EmergencyBeneficiary;
use App\Models\EmergencySetting;
use App\Models\SavingsPlan;
use App\Models\User;
use App\Models\Wallet;
use App\Services\ApprovalService;
use App\Services\EmergencyService;
use App\Services\BudgetService;
use App\Services\ChildService;
use App\Services\GivingService;
use App\Services\GoalService;
use App\Services\JointService;
use App\Services\KycService;
use App\Services\SavingsService;
use App\Services\WalletService;
use App\Services\WalletSetupService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Validation\ValidationException;

class WalletController extends ApiController
{
    /** Wallet types a user may create directly (main is auto-provisioned). */
    private const CREATABLE_TYPES = ['shared', 'project', 'savings', 'goal', 'emergency', 'giving', 'joint', 'child', 'spending'];

    // GET /wallets
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        // is_shared: someone besides you is in it (Treasury groups Mine / Shared / Children).
        $own = $user->wallets()
            ->withCount(['members as others_count' => fn ($q) => $q->where('status', 'active')->where('user_id', '!=', $user->id)])
            ->latest()
            ->get()
            ->map(fn ($w) => $this->serializeWallet($w) + ['my_role' => 'owner', 'is_shared' => $w->others_count > 0]);
        $member = $user->memberWallets()
            ->where('wallets.user_id', '!=', $user->id)
            ->get()
            ->map(fn ($w) => $this->serializeWallet($w, withOwner: true) + ['my_role' => $w->pivot->role, 'is_shared' => true]);

        return $this->ok('Wallets fetched', ['wallets' => $own->concat($member)->values()]);
    }

    /**
     * POST /wallets — guided creation.
     * { type, name, description?, target_amount?, target_date?, purpose?,
     *   initial_deposit?, source_wallet_id?, monthly_amount?, monthly_day?,
     *   emergency?, milestones?, contributors?, savings_plan?, draft_id? }
     * `emergency` (emergency wallets only) carries the Step 2 access rules; see
     * EmergencyService::configure. milestones/contributors/savings_plan are the
     * savings-goal setup (savings + goal wallets); see SavingsService::configure.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'type' => ['required', 'in:' . implode(',', self::CREATABLE_TYPES)],
            'name' => ['required', 'string', 'max:100'],
            'description' => ['nullable', 'string', 'max:200'],
            'target_amount' => ['nullable', 'numeric', 'min:0'],
            'purpose' => ['nullable', 'string', 'max:40'],
            'initial_deposit' => ['nullable', 'numeric', 'min:0'],
            'source_wallet_id' => ['nullable', 'integer'],
            'monthly_amount' => ['nullable', 'numeric', 'min:0'],
            'monthly_day' => ['nullable', 'integer', 'between:1,28'],
            'emergency' => ['nullable', 'array'],
            'emergency.purpose' => ['required_with:emergency', 'in:' . implode(',', EmergencySetting::PURPOSES)],
            'emergency.dual_approval' => ['sometimes', 'boolean'],
            'emergency.approver_user_id' => ['nullable', 'integer'],
            'emergency.unlock_on_document' => ['sometimes', 'boolean'],
            'emergency.manual_unlock' => ['sometimes', 'boolean'],
            'emergency.unlock_reason' => ['nullable', 'string', 'max:150'],
            'emergency.emergency_pin' => ['nullable', 'digits:4'],
            'emergency.override_national_crisis' => ['sometimes', 'boolean'],
            'emergency.override_high_balance' => ['sometimes', 'boolean'],
            'emergency.beneficiary_note' => ['nullable', 'string', 'max:1000'],
            'emergency.purposes' => ['sometimes', 'array', 'max:4'],
            'emergency.purposes.*' => ['in:' . implode(',', EmergencySetting::PURPOSES)],
            'emergency.keyholders' => ['sometimes', 'array', 'max:6'],
            'emergency.keyholders.*' => ['integer'],
            'emergency.required_keyholders' => ['nullable', 'integer', 'between:1,7'],
            'emergency.request_expiry_hours' => ['nullable', 'in:' . implode(',', EmergencySetting::EXPIRY_HOURS)],
            'emergency.fast_release_limit' => ['nullable', 'numeric', 'min:0'],
            'emergency.fast_release_every_days' => ['nullable', 'in:' . implode(',', EmergencySetting::FAST_RELEASE_DAYS)],
            // EMG-03 pay the bill directly; EMG-05 trusted contacts (no app) and what they may do.
            'emergency.pay_directly' => ['sometimes', 'boolean'],
            'emergency.trusted_can_request' => ['sometimes', 'boolean'],
            'emergency.trusted_can_upload' => ['sometimes', 'boolean'],
            'emergency.trusted_can_see_balance' => ['sometimes', 'boolean'],
            'emergency.trusted_contacts' => ['sometimes', 'array', 'max:5'],
            'emergency.trusted_contacts.*.name' => ['required', 'string', 'max:80'],
            'emergency.trusted_contacts.*.phone' => ['required', 'string', 'max:20'],
            'emergency.trusted_contacts.*.relation' => ['nullable', 'string', 'max:80'],
            'emergency.beneficiaries' => ['sometimes', 'array', 'max:3'],
            'emergency.beneficiaries.*.user_id' => ['required', 'integer'],
            'emergency.beneficiaries.*.relationship' => ['nullable', 'string', 'max:40'],
            'emergency.beneficiaries.*.role' => ['sometimes', 'in:' . implode(',', EmergencyBeneficiary::ROLES)],
            'emergency.beneficiaries.*.withdrawal_limit' => ['nullable', 'numeric', 'min:0'],
            'emergency.beneficiaries.*.access_type' => ['sometimes', 'in:' . implode(',', EmergencyBeneficiary::ACCESS_TYPES)],
            // Savings goals.
            'target_date' => ['nullable', 'date', 'after:today'],
            'milestones' => ['sometimes', 'array', 'max:' . SavingsService::MAX_MILESTONES],
            'milestones.*.title' => ['required', 'string', 'max:100'],
            'milestones.*.amount' => ['required', 'numeric', 'min:1'],
            'milestones.*.due_date' => ['nullable', 'date'],
            'contributors' => ['sometimes', 'array', 'max:' . SavingsService::MAX_CONTRIBUTORS],
            'contributors.*.user_id' => ['required', 'integer'],
            'contributors.*.can_approve' => ['sometimes', 'boolean'],
            'contributors.*.permissions' => ['sometimes', 'array'],
            'contributors.*.permissions.view' => ['sometimes', 'boolean'],
            'contributors.*.permissions.fund' => ['sometimes', 'boolean'],
            'contributors.*.permissions.request' => ['sometimes', 'boolean'],
            'contributors.*.permissions.withdraw' => ['sometimes', 'boolean'],
            'savings_plan' => ['nullable', 'array'],
            // SAV-02/03: a fixed amount on a schedule, a share of salary, round-ups.
            'savings_plan.schedule' => ['sometimes', 'boolean'],
            'savings_plan.amount' => ['nullable', 'numeric', 'min:0'],
            'savings_plan.frequency' => ['sometimes', 'in:' . implode(',', SavingsPlan::FREQUENCIES)],
            'savings_plan.salary_percent' => ['nullable', 'integer', 'between:1,50'],
            'savings_plan.roundup_to' => ['nullable', 'in:100,500,1000'],
            'savings_plan.missed_policy' => ['sometimes', 'in:' . implode(',', SavingsPlan::MISSED_POLICIES)],
            'savings_plan.notify_others_on_miss' => ['sometimes', 'boolean'],
            'savings_plan.notify_sms' => ['sometimes', 'boolean'],
            'savings_plan.day_of_week' => ['nullable', 'integer', 'between:1,7'],
            'savings_plan.day_of_month' => ['nullable', 'integer', 'between:1,28'],
            'savings_plan.auto_save' => ['sometimes', 'boolean'],
            'savings_plan.allow_contributor_edit' => ['sometimes', 'boolean'],
            // Guided creation (WCR-02/08/09/11): who it's for, who's in it, when
            // money needs a yes, and a monthly reminder to save.
            'mode' => ['nullable', 'in:private,shared'],
            'members' => ['sometimes', 'array', 'max:' . SavingsService::MAX_CONTRIBUTORS],
            'members.*.user_id' => ['nullable', 'integer', 'required_without:members.*.identifier'],
            'members.*.identifier' => ['nullable', 'string', 'max:150'],
            'members.*.role' => ['required', 'in:co_owner,contributor,viewer'],
            'members.*.can_approve' => ['sometimes', 'boolean'],
            'members.*.permissions' => ['sometimes', 'array'],
            'members.*.permissions.view' => ['sometimes', 'boolean'],
            'members.*.permissions.fund' => ['sometimes', 'boolean'],
            'members.*.permissions.request' => ['sometimes', 'boolean'],
            'members.*.permissions.withdraw' => ['sometimes', 'boolean'],
            // EMG-02: what an emergency contributor puts in each month.
            'members.*.pledge' => ['nullable', 'numeric', 'min:0'],
            'members.*.pledge_kind' => ['nullable', 'in:period,gift'],
            // EMG-03: someone invited by phone becomes a keyholder once they join.
            'members.*.keyholder' => ['sometimes', 'boolean'],
            // SPD-05: a spender's categories (by name; absent = all) and daily limit.
            'members.*.spend' => ['sometimes', 'nullable', 'array'],
            'members.*.spend.categories' => ['nullable', 'array'],
            'members.*.spend.categories.*' => ['string', 'max:60'],
            'members.*.spend.daily_limit' => ['nullable', 'numeric', 'min:1'],
            // SAV-01 colour, SAV-05 lock.
            'colour' => ['nullable', 'in:' . implode(',', Wallet::COLOURS)],
            'lock' => ['nullable', 'array'],
            'lock.mode' => ['required_with:lock', 'in:none,date,target'],
            'lock.until' => ['nullable', 'required_if:lock.mode,date', 'date', 'after:today'],
            'lock.early_break' => ['sometimes', 'boolean'],
            'lock.approval' => ['sometimes', 'boolean'],
            'lock.charity_id' => ['nullable', 'integer'],
            // SPD-02…06: the spending budget.
            'budget' => ['nullable', 'array'],
            'budget.amount' => ['required_with:budget', 'numeric', 'min:1'],
            'budget.period' => ['required_with:budget', 'in:' . implode(',', BudgetService::PERIODS)],
            'budget.start_day' => ['nullable', 'integer', 'between:1,28'],
            'budget.leftover' => ['nullable', 'array'],
            'budget.leftover.mode' => ['nullable', 'in:keep,main,wallet'],
            'budget.leftover.wallet_id' => ['nullable', 'integer'],
            'budget.funding' => ['nullable', 'in:' . implode(',', BudgetService::FUNDING)],
            'budget.my_share' => ['nullable', 'numeric', 'min:0'],
            'budget.alerts' => ['nullable', 'array'],
            'budget.alerts.half' => ['sometimes', 'boolean'],
            'budget.alerts.eighty' => ['sometimes', 'boolean'],
            'budget.alerts.category_out' => ['sometimes', 'boolean'],
            'budget.alerts.weekly' => ['sometimes', 'boolean'],
            'budget.over_limit' => ['nullable', 'in:' . implode(',', BudgetService::OVER_LIMIT)],
            'budget.categories' => ['nullable', 'array', 'max:' . BudgetService::MAX_CATEGORIES],
            'budget.categories.*.name' => ['required', 'string', 'max:60'],
            'budget.categories.*.limit' => ['required', 'numeric', 'min:1'],
            // GLW-01…05: goal.
            'goal' => ['nullable', 'array'],
            'goal.kind' => ['nullable', 'in:' . implode(',', GoalService::KINDS)],
            'goal.for' => ['nullable', 'string', 'max:120'],
            'goal.lines' => ['nullable', 'array', 'max:12'],
            'goal.lines.*.name' => ['required', 'string', 'max:60'],
            'goal.lines.*.amount' => ['required', 'numeric', 'min:1'],
            'goal.link' => ['sometimes', 'boolean'],
            'goal.reminders' => ['nullable', 'array'],
            'goal.reminders.before_save' => ['sometimes', 'boolean'],
            'goal.reminders.nudge' => ['sometimes', 'boolean'],
            'goal.payout' => ['nullable', 'array'],
            'goal.payout.saved_account_id' => ['nullable', 'integer'],
            'goal.payout.organisation_id' => ['nullable', 'integer'],
            'goal.payout.run_on' => ['required_with:goal.payout', 'date'],
            // CHW-01…07: a child's wallet.
            'child' => ['nullable', 'array'],
            'child.first_name' => ['required_with:child', 'string', 'max:60'],
            'child.last_name' => ['nullable', 'string', 'max:60'],
            'child.age_band' => ['required_with:child', 'in:' . implode(',', ChildService::AGE_BANDS)],
            'child.allowance' => ['nullable', 'array'],
            'child.allowance.amount' => ['nullable', 'numeric', 'min:0'],
            'child.allowance.frequency' => ['sometimes', 'in:' . implode(',', ChildService::FREQUENCIES)],
            'child.allowance.starts_on' => ['nullable', 'date'],
            'child.allowance.from_wallet_id' => ['nullable', 'integer'],
            'child.allowance.category_id' => ['nullable', 'integer'],
            'child.allowance.pause_holidays' => ['sometimes', 'boolean'],
            'child.allowance.notify' => ['sometimes', 'boolean'],
            'child.controls' => ['nullable', 'array'],
            'child.controls.daily_limit' => ['nullable', 'numeric', 'min:0'],
            'child.controls.shops' => ['sometimes', 'boolean'],
            'child.controls.friends' => ['sometimes', 'boolean'],
            'child.controls.online' => ['sometimes', 'boolean'],
            'child.controls.cash' => ['sometimes', 'boolean'],
            'child.requests' => ['nullable', 'array'],
            'child.requests.auto_limit' => ['nullable', 'numeric', 'min:0'],
            'child.requests.auto_per_week' => ['sometimes', 'integer', 'between:1,7'],
            'child.requests.expiry_hours' => ['sometimes', 'integer', 'in:' . implode(',', Wallet::APPROVAL_EXPIRY_HOURS)],
            'child.requests.reason_required' => ['sometimes', 'boolean'],
            'child.requests.approvers' => ['sometimes', 'in:any,all'],
            'child.goal' => ['nullable', 'array'],
            'child.goal.name' => ['required_with:child.goal', 'string', 'max:60'],
            'child.goal.amount' => ['required_with:child.goal', 'numeric', 'min:1'],
            'child.goal.save_percent' => ['sometimes', 'integer', 'between:0,100'],
            'child.goal.match_percent' => ['sometimes', 'integer', 'in:0,25,50,100'],
            'child.goal.match_wallet_id' => ['nullable', 'integer'],
            'child.phone' => ['nullable', 'array'],
            'child.phone.mode' => ['sometimes', 'in:own,managed'],
            'child.phone.code' => ['nullable', 'string', 'max:12'],
            'child.coparent' => ['nullable', 'array'],
            'child.coparent.approve' => ['sometimes', 'boolean'],
            'child.coparent.change' => ['sometimes', 'boolean'],
            'child.coparent.see' => ['sometimes', 'boolean'],
            'child.gifts' => ['sometimes', 'boolean'],
            // JNT-01…05: a joint wallet.
            'joint' => ['nullable', 'array'],
            'joint.contribution' => ['required_with:joint', 'array'],
            'joint.contribution.mode' => ['required_with:joint', 'in:' . implode(',', JointService::MODES)],
            'joint.contribution.day' => ['required_with:joint', 'integer', 'between:1,28'],
            'joint.contribution.mine' => ['nullable', 'numeric', 'min:0'],
            'joint.contribution.partner' => ['nullable', 'numeric', 'min:0'],
            'joint.short' => ['sometimes', 'in:' . implode(',', JointService::SHORT)],
            'joint.limits' => ['required_with:joint', 'array'],
            'joint.limits.per_payment' => ['required_with:joint', 'numeric', 'min:1'],
            'joint.limits.per_day' => ['required_with:joint', 'numeric', 'min:1'],
            'joint.expiry_hours' => ['sometimes', 'integer', 'in:' . implode(',', Wallet::APPROVAL_EXPIRY_HOURS)],
            'joint.always' => ['nullable', 'array'],
            'joint.always.new_account' => ['sometimes', 'boolean'],
            'joint.always.personal' => ['sometimes', 'boolean'],
            'joint.always.rules' => ['sometimes', 'boolean'],
            'joint.notify' => ['nullable', 'array'],
            'joint.notify.weekly' => ['sometimes', 'boolean'],
            'joint.notify.statement' => ['sometimes', 'boolean'],
            'joint.notify.big_payment' => ['sometimes', 'boolean'],
            'joint.notify.big_amount' => ['nullable', 'numeric', 'min:1'],
            'joint.leave' => ['nullable', 'array'],
            'joint.leave.split' => ['sometimes', 'in:' . implode(',', JointService::SPLITS)],
            'joint.leave.notice_days' => ['sometimes', 'integer', 'in:' . implode(',', JointService::NOTICE_DAYS)],
            // GIV-01…06: giving.
            'giving' => ['nullable', 'array'],
            'giving.kind' => ['nullable', 'in:' . implode(',', GivingService::KINDS)],
            'giving.source_wallet_id' => ['nullable', 'integer'],
            'giving.recipients' => ['nullable', 'array', 'max:20'],
            'giving.recipients.*.saved_account_id' => ['nullable', 'integer'],
            'giving.recipients.*.group_id' => ['nullable', 'integer'],
            'giving.set_aside' => ['nullable', 'array', 'max:6'],
            'giving.set_aside.*.kind' => ['required', 'in:percent,fixed,roundup'],
            'giving.set_aside.*.source_wallet_id' => ['required', 'integer'],
            'giving.set_aside.*.percent' => ['nullable', 'integer', 'between:1,50'],
            'giving.set_aside.*.amount' => ['nullable', 'numeric', 'min:1'],
            'giving.set_aside.*.day_of_month' => ['nullable', 'integer', 'between:1,28'],
            'giving.set_aside.*.roundup_to' => ['nullable', 'numeric', 'in:100,500,1000'],
            'giving.schedules' => ['nullable', 'array', 'max:' . GivingService::MAX_SCHEDULES],
            'giving.schedules.*.label' => ['required', 'string', 'max:60'],
            'giving.schedules.*.amount' => ['required', 'numeric', 'min:1'],
            'giving.schedules.*.saved_account_id' => ['nullable', 'integer'],
            'giving.schedules.*.group_id' => ['nullable', 'integer'],
            'giving.schedules.*.frequency' => ['required', 'in:weekly,monthly,monthly_weekday,once'],
            'giving.schedules.*.day_of_week' => ['nullable', 'integer', 'between:1,7'],
            'giving.schedules.*.day_of_month' => ['nullable', 'integer', 'between:1,28'],
            'giving.schedules.*.week_of_month' => ['nullable', 'integer', 'between:1,4'],
            'giving.schedules.*.run_on' => ['nullable', 'date'],
            'giving.ask_first' => ['sometimes', 'boolean'],
            'giving.thanksgiving_reminder' => ['sometimes', 'boolean'],
            'giving.receipts' => ['sometimes', 'boolean'],
            'giving.yearly_statement' => ['sometimes', 'boolean'],
            'giving.anonymous' => ['sometimes', 'boolean'],
            'giving.pledge' => ['nullable', 'array'],
            'giving.pledge.name' => ['required_with:giving.pledge', 'string', 'max:80'],
            'giving.pledge.total' => ['required_with:giving.pledge', 'numeric', 'min:1'],
            'giving.pledge.paid_before' => ['nullable', 'numeric', 'min:0'],
            'giving.pledge.due_date' => ['required_with:giving.pledge', 'date'],
            'giving.pledge.saved_account_id' => ['nullable', 'integer'],
            'giving.pledge.group_id' => ['nullable', 'integer'],
            'giving.pledge.parts' => ['nullable', 'array', 'max:12'],
            'giving.pledge.parts.*.date' => ['required', 'date'],
            'giving.pledge.parts.*.amount' => ['required', 'numeric', 'min:1'],
            'approval' => ['nullable', 'array'],
            'approval.threshold' => ['nullable', 'numeric', 'min:0'],
            'approval.mode' => ['sometimes', 'in:' . implode(',', Wallet::APPROVAL_MODES)],
            'approval.lock_until_goal' => ['sometimes', 'boolean'],
            'approval.expiry_hours' => ['sometimes', 'integer', 'in:' . implode(',', Wallet::APPROVAL_EXPIRY_HOURS)],
            'reminder_day' => ['nullable', 'integer', 'between:1,28'],
            'draft_id' => ['nullable', 'integer'],
        ]);

        // Validated lists come back in rule order, so an item whose first field is
        // a later rule can come first; put every list back in the order sent.
        foreach (['members', 'goal.lines', 'budget.categories', 'giving.recipients', 'giving.set_aside', 'giving.schedules', 'giving.pledge.parts'] as $path) {
            if (is_array($list = data_get($data, $path))) {
                ksort($list);
                data_set($data, $path, $list);
            }
        }

        $user = $request->user();

        // KYC tier wallet-count guard. Caps are generous (5/10/25) so existing
        // users are unaffected — verifying a higher tier unlocks more wallets.
        $maxWallets = KycService::make()->limits((int) $user->kyc_tier)['max_wallets'];
        if ($user->wallets()->count() >= $maxWallets) {
            return $this->fail('Wallet limit reached for your verification tier. Verify a higher KYC tier to create more wallets.', 422);
        }

        if (!empty($data['emergency']) && $data['type'] !== 'emergency') {
            return $this->fail('Emergency access rules only apply to emergency wallets', 422);
        }
        if (!empty($data['budget']) && $data['type'] !== 'spending') {
            return $this->fail('A budget is for spending wallets', 422);
        }
        if (!empty($data['giving']) && $data['type'] !== 'giving') {
            return $this->fail('Giving dates and recipients are for giving wallets', 422);
        }
        if (!empty($data['goal']) && $data['type'] !== 'goal') {
            return $this->fail('Goal details are for goal wallets', 422);
        }
        if (!empty($data['joint']) && $data['type'] !== 'joint') {
            return $this->fail('Joint rules are for joint wallets', 422);
        }
        if (!empty($data['child']) && $data['type'] !== 'child') {
            return $this->fail("A child's details are for child wallets", 422);
        }
        // "A joint wallet is shared equally between two people."
        if ($data['type'] === 'joint' && !empty($data['joint'])
            && (count($data['members'] ?? []) !== 1 || ($data['members'][array_key_first($data['members'])]['role'] ?? null) !== 'co_owner')) {
            return $this->fail('Choose the one person you run this joint wallet with.', 422);
        }
        if (($data['mode'] ?? null) === 'private' && !empty($data['members'])) {
            return $this->fail("A private wallet is just you. Choose Shared to invite people.", 422);
        }
        if ($data['type'] === 'project' && (!empty($data['members']) || !empty($data['approval']))) {
            return $this->fail('Project wallets set up their people and approvals in their own steps', 422);
        }
        if ($data['type'] === 'emergency' && !empty($data['approval'])) {
            return $this->fail('Emergency wallets are released by their keyholders', 422);
        }
        if (($data['lock']['mode'] ?? 'none') === 'target' && !((float) ($data['target_amount'] ?? 0) > 0)) {
            return $this->fail('Set a target to lock the wallet until the target is reached', 422);
        }
        if (!empty($data['approval']['lock_until_goal']) && !((float) ($data['target_amount'] ?? 0) > 0)) {
            return $this->fail('Set a target to lock the wallet until the goal is reached', 422);
        }
        // Phone numbers in any local format → E.164, so they match accounts.
        foreach ($data['members'] ?? [] as $i => $m) {
            $id = trim((string) ($m['identifier'] ?? ''));
            if ($id !== '' && !str_contains($id, '@')) {
                $data['members'][$i]['identifier'] = $this->normalizePhone($id);
            }
        }

        $savingsFields = ['milestones', 'contributors', 'savings_plan'];
        if (!in_array($data['type'], SavingsService::TYPES, true) && array_filter(array_intersect_key($data, array_flip($savingsFields)))) {
            return $this->fail('Milestones, contributors and savings plans are for savings and goal wallets', 422);
        }

        // Naira over the wire, kobo from here on. Zero means "not set".
        $kobo = fn ($naira) => ($naira === null || (float) $naira <= 0) ? null : $this->toKobo((string) $naira);

        $data['target_amount'] = $kobo($data['target_amount'] ?? null);
        $data['initial_deposit'] = $kobo($data['initial_deposit'] ?? null);
        $data['monthly_amount'] = $kobo($data['monthly_amount'] ?? null);
        foreach ($data['milestones'] ?? [] as $i => $m) {
            $data['milestones'][$i]['amount'] = $kobo($m['amount']);
        }
        if (!empty($data['savings_plan'])) {
            $data['savings_plan']['amount'] = $kobo($data['savings_plan']['amount'] ?? null);
            $data['savings_plan']['roundup_to'] = $kobo($data['savings_plan']['roundup_to'] ?? null);
        }
        foreach ($data['members'] ?? [] as $i => $m) {
            $data['members'][$i]['pledge'] = $kobo($m['pledge'] ?? null);
            if (isset($m['spend']['daily_limit'])) {
                $data['members'][$i]['spend']['daily_limit'] = $kobo($m['spend']['daily_limit']);
            }
        }
        foreach ($data['goal']['lines'] ?? [] as $i => $line) {
            $data['goal']['lines'][$i]['amount'] = $kobo($line['amount']);
        }
        if (!empty($data['child'])) {
            foreach (['allowance.amount', 'controls.daily_limit', 'requests.auto_limit', 'goal.amount'] as $path) {
                if (data_get($data['child'], $path) !== null) {
                    data_set($data['child'], $path, $kobo(data_get($data['child'], $path)) ?? 0);
                }
            }
        }
        if (!empty($data['joint'])) {
            foreach (['contribution.mine', 'contribution.partner', 'limits.per_payment', 'limits.per_day', 'notify.big_amount'] as $path) {
                if (data_get($data['joint'], $path) !== null) {
                    data_set($data['joint'], $path, $kobo(data_get($data['joint'], $path)) ?? 0);
                }
            }
        }
        if (!empty($data['budget'])) {
            $data['budget']['amount'] = $kobo($data['budget']['amount']);
            $data['budget']['my_share'] = $kobo($data['budget']['my_share'] ?? null);
            foreach ($data['budget']['categories'] ?? [] as $i => $c) {
                $data['budget']['categories'][$i]['limit'] = $kobo($c['limit']);
            }
        }
        if (!empty($data['giving'])) {
            foreach ($data['giving']['set_aside'] ?? [] as $i => $line) {
                $data['giving']['set_aside'][$i]['amount'] = $kobo($line['amount'] ?? null);
                $data['giving']['set_aside'][$i]['roundup_to'] = $kobo($line['roundup_to'] ?? null);
            }
            foreach ($data['giving']['schedules'] ?? [] as $i => $sch) {
                $data['giving']['schedules'][$i]['amount'] = $kobo($sch['amount']);
            }
            if (!empty($data['giving']['pledge'])) {
                $data['giving']['pledge']['total'] = $kobo($data['giving']['pledge']['total']);
                $data['giving']['pledge']['paid_before'] = $kobo($data['giving']['pledge']['paid_before'] ?? null) ?? 0;
                foreach ($data['giving']['pledge']['parts'] ?? [] as $i => $part) {
                    $data['giving']['pledge']['parts'][$i]['amount'] = $kobo($part['amount']);
                }
            }
        }
        if (!empty($data['approval'])) {
            $data['approval']['threshold'] = $kobo($data['approval']['threshold'] ?? null);
        }
        foreach ($data['emergency']['trusted_contacts'] ?? [] as $i => $c) {
            $data['emergency']['trusted_contacts'][$i]['phone'] = $this->normalizePhone($c['phone']);
        }
        if (!empty($data['emergency']['fast_release_limit'])) {
            $data['emergency']['fast_release_limit'] = $kobo($data['emergency']['fast_release_limit']);
        }
        if (!empty($data['emergency']['beneficiaries'])) {
            foreach ($data['emergency']['beneficiaries'] as $i => $b) {
                $data['emergency']['beneficiaries'][$i]['withdrawal_limit'] = $kobo($b['withdrawal_limit'] ?? null);
            }
        }

        $wallet = WalletSetupService::make()->create($user, $data);

        return $this->ok('Wallet created', ['wallet' => $this->serializeWallet($wallet)], 201);
    }

    // GET /wallets/{wallet}
    public function show(Request $request, Wallet $wallet): JsonResponse
    {
        // WalletPolicy::view === Wallet::isAccessibleBy — same rule, one source of truth.
        if ($request->user()->cannot('view', $wallet)) {
            return $this->fail('Wallet not found', 404);
        }

        $user = $request->user();

        $members = $wallet->members()->with('user')->where('status', 'active')->get()->map(fn ($m) => [
            'user_id' => $m->user_id,
            'name' => $m->user?->fullName(),
            'email' => $m->user?->email,
            'role' => $m->role,
            'can_approve' => (bool) $m->can_approve,
        ]);

        return $this->ok('Wallet fetched', [
            'wallet' => $this->serializeWallet($wallet, withOwner: true),
            'members' => $members,
            'my_role' => $wallet->roleOf($user),
            'my_can_spend' => $wallet->canSpend($user),
            'my_can_request' => $wallet->canRequest($user),
            'approval' => [
                'enabled' => (bool) $wallet->approval_enabled,
                'threshold' => $wallet->approval_threshold !== null ? number_format($wallet->approval_threshold / 100, 2, '.', '') : null,
                'required_approvals' => (int) $wallet->required_approvals,
            ],
            'held_amount' => number_format($wallet->heldAmount() / 100, 2, '.', ''),
            'pending_approvals' => $wallet->approvalRequests()->where('status', 'pending')->count(),
            // Emergency wallets only: lock state + the viewer's emergency role.
            'emergency' => EmergencyService::make()->summary($wallet, $user),
            // Savings/goal wallets with a plan: the rule every saver follows.
            'savings' => SavingsService::make()->invitationSummary($wallet),
            'recent_transactions' => $wallet->transactions()->latest()->limit(10)->get()
                ->map(fn ($t) => $this->serializeTransaction($t)),
        ]);
    }

    // GET /wallets/{wallet}/transactions
    public function transactions(Request $request, Wallet $wallet): JsonResponse
    {
        // WalletPolicy::view === Wallet::isAccessibleBy — same rule, one source of truth.
        if ($request->user()->cannot('view', $wallet)) {
            return $this->fail('Wallet not found', 404);
        }

        $txns = $wallet->transactions()
            ->with('user:id,first_name,last_name,name')
            ->when($request->query('type'), fn ($q, $t) => $q->where('type', $t))
            ->when($request->query('direction'), fn ($q, $d) => $q->where('direction', $d))
            ->latest()
            ->paginate(min((int) $request->query('per_page', 20), 100));

        return $this->ok('Transactions fetched', [
            // "by": who moved the money, so a shared wallet reads "Emeka added money".
            'transactions' => collect($txns->items())->map(fn ($t) => $this->serializeTransaction($t) + [
                'by' => $t->user ? ['id' => $t->user->id, 'first_name' => $t->user->first_name ?: $t->user->fullName()] : null,
            ]),
            'pagination' => [
                'page' => $txns->currentPage(),
                'per_page' => $txns->perPage(),
                'total' => $txns->total(),
                'last_page' => $txns->lastPage(),
            ],
        ]);
    }

    // GET /wallets/{wallet}/funding-details
    public function fundingDetails(Request $request, Wallet $wallet): JsonResponse
    {
        if (!$wallet->isAccessibleBy($request->user())) {
            return $this->fail('Wallet not found', 404);
        }

        if (JointService::make()->isWaiting($wallet)) {
            return $this->fail('The account number is ready once your partner accepts.', 422);
        }
        if (!$wallet->virtual_account) {
            WalletService::make()->ensureVirtualAccount($wallet);
            $wallet->refresh();
        }

        if (!$wallet->virtual_account) {
            return $this->fail('Funding account is being provisioned. Try again shortly.', 503);
        }

        return $this->ok('Funding details fetched', [
            'account_number' => $wallet->virtual_account,
            'bank_name' => $wallet->virtual_account_bank,
            'account_name' => 'PATRIAI/' . strtoupper($wallet->owner->fullName()),
            'note' => 'Transfer any amount to this account from any Nigerian bank to fund this wallet instantly.',
        ]);
    }

    // POST /wallets/{wallet}/withdraw  { amount, bank_code, account_number, account_name, pin, description?, idempotency_key? }
    public function withdraw(Request $request, Wallet $wallet): JsonResponse
    {
        if (!$wallet->isAccessibleBy($request->user())) {
            return $this->fail('Wallet not found', 404);
        }
        if (!$wallet->canSpend($request->user())) {
            return $this->fail('You do not have permission to move money out of this wallet', 403);
        }
        // Additive granular gate: an explicit permissions[withdraw]=false blocks a
        // member who otherwise holds a spend grant. Never loosens canSpend, so
        // owner/co_owner behaviour is unchanged.
        if (!$wallet->canWithdraw($request->user())) {
            return $this->fail('You do not have permission to withdraw from this wallet', 403);
        }

        $data = $request->validate([
            'amount' => ['required', 'numeric', 'min:1'],
            'bank_code' => ['required', 'string'],
            'account_number' => ['required', 'digits:10'],
            'account_name' => ['required', 'string', 'max:150'],
            'bank_name' => ['required', 'string', 'max:150'],
            'pin' => ['required', self::TXN_PIN],
            'description' => ['nullable', 'string', 'max:200'],
            'idempotency_key' => ['nullable', 'string', 'max:100'],
            'budget_category_id' => ['nullable', 'integer'],
        ]);

        $user = $request->user();

        // --- Idempotency / double-submit protection -------------------------------
        // 1. Explicit client key: replay the original response for ~5 minutes and
        //    lock out concurrent duplicates carrying the same (user, key).
        $idempotencyKey = $data['idempotency_key'] ?? null;
        $cacheKey = $idempotencyKey !== null
            ? 'withdraw:idem:' . $user->id . ':' . sha1($idempotencyKey)
            : null;

        if ($cacheKey !== null) {
            if ($cached = Cache::get($cacheKey)) {
                return response()->json($cached['body'], $cached['code']);
            }
            if (!Cache::add($cacheKey . ':lock', 1, now()->addSeconds(30))) {
                return $this->fail('A withdrawal with this idempotency key is already being processed.', 409);
            }
        }

        // 2. Even without a key: reject a byte-identical withdrawal intent from the
        //    same user within ~5 seconds (accidental double tap / slow-network
        //    retry). Short enough to still allow an intentional identical repeat
        //    withdrawal moments later. Cache::add is atomic, so of two concurrent
        //    taps exactly one proceeds.
        $fingerprint = 'withdraw:dedupe:' . $user->id . ':' . sha1(json_encode([
            'wallet' => $wallet->id,
            'amount' => $data['amount'],
            'bank_code' => $data['bank_code'],
            'account_number' => $data['account_number'],
        ]));
        if (!Cache::add($fingerprint, 1, now()->addSeconds(5))) {
            if ($cacheKey !== null) {
                Cache::forget($cacheKey . ':lock');
            }
            return $this->fail('Duplicate withdrawal ignored — this looks like a double submission. Please wait a moment before retrying.', 409);
        }

        try {
            $response = $this->performWithdrawal($user, $wallet, $data);
        } catch (\Throwable $e) {
            if ($this->isUnknownBankingOutcome($e)) {
                // Banking timeout/network failure: the payout outcome is UNKNOWN (the
                // bank may have executed it), so a retry could fire a second real
                // payout. KEEP the dedupe marker and cache a do-not-retry response
                // under the key so replays are answered without touching the rails.
                if ($cacheKey !== null) {
                    Cache::put($cacheKey, [
                        'body' => ['status' => false, 'message' => 'Your withdrawal is processing — do not retry. It will complete shortly or be reversed automatically.'],
                        'code' => 409,
                    ], now()->addMinutes(5));
                    Cache::forget($cacheKey . ':lock');
                }
                throw $e;
            }
            // Any other failed attempt must be retryable immediately: drop the
            // short-window dedupe marker (and any idempotency lock) so a corrected
            // retry is allowed.
            Cache::forget($fingerprint);
            if ($cacheKey !== null) {
                Cache::forget($cacheKey . ':lock');
            }
            throw $e;
        }

        if ($cacheKey !== null) {
            Cache::forget($cacheKey . ':lock');
        }

        if ($response->getStatusCode() >= 300) {
            // Non-success (e.g. 422): allow an immediate corrected retry.
            Cache::forget($fingerprint);
        } elseif ($cacheKey !== null) {
            // Store the successful outcome for idempotent replay within the window.
            Cache::put($cacheKey, [
                'body' => $response->getData(true),
                'code' => $response->getStatusCode(),
            ], now()->addMinutes(5));
        }

        return $response;
    }

    /**
     * Execute a validated withdrawal. Split out of withdraw() so the surrounding
     * idempotency/double-submit guard never runs a second payout for a replay.
     */
    private function performWithdrawal(User $user, Wallet $wallet, array $data): JsonResponse
    {
        app(\App\Services\PinService::class)->verify($user, $data['pin']);

        $amountKobo = $this->toKobo($data['amount']);
        $feeKobo = (int) config('services.matrix.transfer_fee_kobo', 2000);

        // Per-tier daily withdrawal/transfer limit. Fee-inclusive, because
        // todaysOutgoingKobo() accumulates amount + fee for withdrawals — checking
        // the bare amount here would let the fee leak past the daily cap.
        if ($err = $this->dailyTransferLimitError($user, $amountKobo + $feeKobo)) {
            return $err;
        }

        // Cannot commit more than is genuinely available: pending approvals and
        // (for project wallets) milestone reservations are subtracted here.
        if ($amountKobo + $feeKobo > $wallet->availableToSpend()) {
            return $this->fail('Amount exceeds available balance (funds are reserved for pending approvals/milestones).', 422);
        }

        // The wallet's own rules: spending budget limits and the early-break fee.
        $rules = \App\Services\SpendRules::make();
        $plan = $rules->plan($wallet, $user, $amountKobo, isset($data['budget_category_id']) ? (int) $data['budget_category_id'] : null, to: ['kind' => 'bank', 'account_number' => $data['account_number']]);

        // Only route to approval when at least one eligible approver exists; otherwise
        // the initiator is the sole controller, so the spend executes directly.
        if (($wallet->approvalRequiredFor($amountKobo) || $plan['over'] !== null) && $wallet->eligibleApprovers($user->id)->isNotEmpty()) {
            $req = ApprovalService::make()->create(
                $wallet,
                $user,
                'withdrawal',
                $amountKobo,
                $feeKobo,
                $data['description'] ?? null,
                [
                    'bank_code' => $data['bank_code'],
                    'account_number' => $data['account_number'],
                    'account_name' => $data['account_name'],
                    'bank_name' => $data['bank_name'],
                    'description' => $data['description'] ?? null,
                ] + array_filter(['budget_category_id' => $plan['category_id'], 'over_limit' => $plan['over']]),
            );

            return $this->ok('Withdrawal submitted for approval', [
                'pending_approval' => true,
                'approval' => $this->serializeApprovalRequest($req->load(['wallet', 'initiator']), $user),
            ]);
        }

        $txn = WalletService::make()->withdrawToBank(
            $wallet,
            $user,
            $plan['net'],
            $data['bank_code'],
            $data['account_number'],
            $data['account_name'],
            $data['bank_name'],
            $data['description'] ?? null,
        );
        $rules->settle($wallet, $user, $txn->reference, $plan);

        return $this->ok('Withdrawal successful', ['transaction' => $this->serializeTransaction($txn->refresh())]);
    }

    /**
     * True for the unknown-outcome banking failure: WalletService caught a
     * ConnectionException mid-payout (the bank may have executed it) and surfaced
     * it as a ValidationException whose 'banking' message says the withdrawal is
     * processing. Message-prefix match is deliberate — the definitive-rejection
     * path uses the same 'banking' key with a "Bank transfer failed" message.
     */
    private function isUnknownBankingOutcome(\Throwable $e): bool
    {
        return $e instanceof ValidationException
            && str_starts_with($e->errors()['banking'][0] ?? '', 'Your withdrawal is processing');
    }

    // PATCH /wallets/{wallet}  { name?, description?, approval_enabled?, approval_threshold?, required_approvals?,
    //                          approval_mode?, lock_until_goal?, approval_expiry_hours?, reminder_day? }
    public function updateSettings(Request $request, Wallet $wallet): JsonResponse
    {
        if (!$wallet->isAccessibleBy($request->user())) {
            return $this->fail('Wallet not found', 404);
        }

        $role = $wallet->roleOf($request->user());
        if (!in_array($role, ['owner', 'co_owner'], true)) {
            return $this->fail('Only the owner or a co-owner can change wallet settings', 403);
        }

        $data = $request->validate([
            'name' => ['nullable', 'string', 'max:100'],
            'description' => ['nullable', 'string', 'max:200'],
            'approval_enabled' => ['sometimes', 'boolean'],
            'approval_threshold' => ['nullable', 'numeric', 'min:0'],
            'required_approvals' => ['sometimes', 'integer', 'min:1'],
            'approval_mode' => ['sometimes', 'nullable', 'in:' . implode(',', Wallet::APPROVAL_MODES)],
            'lock_until_goal' => ['sometimes', 'boolean'],
            'approval_expiry_hours' => ['sometimes', 'integer', 'in:' . implode(',', Wallet::APPROVAL_EXPIRY_HOURS)],
            'reminder_day' => ['sometimes', 'nullable', 'integer', 'between:1,28'],
        ]);

        // Approval-governance fields are owner-only. Co-owners may edit
        // name/description but must not be able to change who can spend how much.
        $governanceFields = ['approval_enabled', 'approval_threshold', 'required_approvals', 'approval_mode', 'lock_until_goal', 'approval_expiry_hours'];
        $touchesGovernance = false;
        foreach ($governanceFields as $field) {
            if ($request->exists($field)) {
                $touchesGovernance = true;
                break;
            }
        }
        if ($touchesGovernance && $role !== 'owner') {
            return $this->fail('Only the owner can change approval governance settings', 403);
        }
        // JNT-03 "Changing these rules" needs both partners: they change together.
        if ($touchesGovernance && JointService::make()->settings($wallet)) {
            return $this->fail('Joint rules change together. Suggest the change and your partner confirms it.', 422);
        }

        // Main wallets cannot use spend-approval governance.
        if ($wallet->type === 'main' && $request->boolean('approval_enabled')) {
            return $this->fail('Approval controls are not available on your main wallet', 422);
        }

        // A required-approvals count higher than the number of people who could ever
        // approve would make every gated spend unreachable (stuck state). Reject it.
        $effectiveApprovalEnabled = $request->exists('approval_enabled')
            ? $request->boolean('approval_enabled')
            : (bool) $wallet->approval_enabled;
        if ($request->exists('required_approvals') && $effectiveApprovalEnabled) {
            // The initiator is always excluded from approving their own request, and
            // the owner (a guaranteed approver) is a possible initiator, so at most
            // (approvers - 1) sign-offs are ever collectable. Cap the requirement
            // there so a gated spend can never become permanently unreachable.
            $maxApprovers = $wallet->eligibleApprovers()->count();
            $maxRequired = max(1, $maxApprovers - 1);
            if ((int) $data['required_approvals'] > $maxRequired) {
                return $this->fail("With {$maxApprovers} eligible approver(s), a spend can require at most {$maxRequired} approval(s) — the initiator can't approve their own request.", 422);
            }
        }

        $update = [];
        if ($request->exists('name') && $data['name'] !== null) {
            $update['name'] = $data['name'];
        }
        if ($request->exists('description')) {
            $update['description'] = $data['description'];
        }
        if ($request->exists('approval_enabled')) {
            $update['approval_enabled'] = $request->boolean('approval_enabled');
        }
        if ($request->exists('approval_threshold')) {
            $update['approval_threshold'] = $data['approval_threshold'] !== null ? $this->toKobo($data['approval_threshold']) : null;
        }
        if ($request->exists('required_approvals')) {
            $update['required_approvals'] = (int) $data['required_approvals'];
        }

        $meta = $wallet->meta ?? [];
        if ($request->exists('approval_mode')) {
            $meta['approval_mode'] = $data['approval_mode'];
        } elseif ($request->exists('required_approvals')) {
            // A fixed count replaces the "who decides" rule.
            $meta['approval_mode'] = null;
        }
        if ($request->exists('lock_until_goal')) {
            if ($request->boolean('lock_until_goal') && !($wallet->target_amount > 0)) {
                return $this->fail('Set a target to lock the wallet until the goal is reached', 422);
            }
            $meta['lock_until_goal'] = $request->boolean('lock_until_goal') ?: null;
        }
        if ($request->exists('approval_expiry_hours')) {
            $meta['approval_expiry_hours'] = (int) $data['approval_expiry_hours'];
        }
        if ($request->exists('reminder_day')) {
            $meta['reminder_day'] = $data['reminder_day'] !== null ? (int) $data['reminder_day'] : null;
        }
        $meta = array_filter($meta, fn ($v) => $v !== null);
        if ($meta !== ($wallet->meta ?? [])) {
            $update['meta'] = $meta ?: null;
        }

        $wallet->update($update);

        return $this->ok('Wallet settings updated', ['wallet' => $this->serializeWallet($wallet->refresh(), withOwner: true)]);
    }

    // POST /wallets/{wallet}/archive — reversible soft delete (status=closed), owner only
    public function archive(Request $request, Wallet $wallet): JsonResponse
    {
        if ($err = $this->guardDeletable($request, $wallet)) {
            return $err;
        }
        if ($wallet->status === 'closed') {
            return $this->fail('This wallet is already archived', 422);
        }
        $wallet->update(['status' => 'closed']);

        return $this->ok('Wallet archived', ['wallet' => $this->serializeWallet($wallet->refresh())]);
    }

    // POST /wallets/{wallet}/unarchive — restore an archived wallet, owner only
    public function unarchive(Request $request, Wallet $wallet): JsonResponse
    {
        if ($wallet->user_id !== $request->user()->id) {
            return $this->fail('Wallet not found', 404);
        }
        if ($wallet->status !== 'closed') {
            return $this->fail('This wallet is not archived', 422);
        }
        $wallet->update(['status' => 'active']);

        return $this->ok('Wallet restored', ['wallet' => $this->serializeWallet($wallet->refresh())]);
    }

    // DELETE /wallets/{wallet} — permanent delete (archived + empty only), owner only
    public function destroy(Request $request, Wallet $wallet): JsonResponse
    {
        if ($err = $this->guardDeletable($request, $wallet)) {
            return $err;
        }
        if ($wallet->status !== 'closed') {
            return $this->fail('Archive the wallet first, then delete it permanently', 422);
        }
        $wallet->delete(); // cascades members, transactions and invitations

        return $this->ok('Wallet deleted permanently');
    }

    /**
     * Shared safety guards for archive / permanent-delete. Returns a fail
     * response, or null when the wallet may be removed. Money-safety first: the
     * main wallet is protected, the wallet must be empty, and it must have no
     * other members or an attached project.
     */
    private function guardDeletable(Request $request, Wallet $wallet): ?JsonResponse
    {
        if ($wallet->user_id !== $request->user()->id) {
            return $this->fail('Wallet not found', 404);
        }
        if ($wallet->type === 'main') {
            return $this->fail('Your main wallet cannot be deleted', 422);
        }
        if ((int) $wallet->balance !== 0) {
            return $this->fail('Move the balance out first — the wallet must be empty to delete it', 422);
        }
        $otherMembers = $wallet->members()
            ->where('status', 'active')
            ->where('user_id', '!=', $wallet->user_id)
            ->exists();
        if ($otherMembers) {
            return $this->fail('Remove the other members before deleting this wallet', 422);
        }
        if (\App\Models\Project::where('wallet_id', $wallet->id)->exists()) {
            return $this->fail("This wallet belongs to a project and can't be deleted here", 422);
        }

        return null;
    }
}
