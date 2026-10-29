<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Dispute extends Model
{
    /** Selectable dispute categories (Dispute Center). */
    public const CATEGORIES = [
        'transaction',
        'project',
        'vendor',
        'account',
        'other',
        'wallet',
        'withdrawal',
    ];

    /** DSP-02 what a dispute is about. */
    public const KINDS = ['milestone', 'payment_made', 'payment_received'];

    /** DSP-03 "What's wrong?" */
    public const REASONS = ['not_as_agreed', 'not_finished', 'poor_quality', 'overcharged', 'not_delivered', 'other'];

    /** DSP-03 "What would make it right?" */
    public const REMEDIES = ['fix', 'partial_refund', 'full_refund'];

    /**
     * open: waiting for the other side · responded: they replied or offered ·
     * fixing: the family accepted a fix, the work is being redone · escalated:
     * Patriai is deciding · resolved: closed with an outcome. (under_review and
     * rejected are kept for disputes that Patriai handles alone.)
     */
    public const STATUSES = ['open', 'responded', 'fixing', 'escalated', 'resolved', 'under_review', 'rejected'];

    /** DSP-08 "Decision within 5 working days"; VDM-08 "Answer within 3 days". */
    public const REPLY_DAYS = 3;

    public const DECISION_WORKING_DAYS = 5;

    /** Deadlines are days in Nigeria: "reply by 27 Oct" means the end of 27 Oct in Lagos. */
    public const TZ = 'Africa/Lagos';

    /** The end of that Lagos day, stored in UTC like every other time. */
    public static function deadline(\Illuminate\Support\Carbon $lagosDay): \Illuminate\Support\Carbon
    {
        return $lagosDay->copy()->endOfDay()->utc();
    }

    /** "27 Oct", as the day is in Lagos. */
    public static function day(\DateTimeInterface $at): string
    {
        return \Illuminate\Support\Carbon::instance($at)->timezone(self::TZ)->format('j M');
    }

    protected $fillable = [
        'number',
        'user_id',
        'subject',
        'category',
        'kind',
        'project_id',
        'milestone_id',
        'against_user_id',
        'reference',
        'description',
        'reason',
        'remedy',
        'amount_on_hold',
        'status',
        'resolution',
        'resolved_at',
        'reply_by',
        'escalated_at',
        'escalation_note',
        'decision_due',
        'evidence_until',
        'outcome',
        'released_amount',
        'refund_amount',
        'decided_by',
    ];

    protected function casts(): array
    {
        return [
            'resolved_at' => 'datetime',
            'reply_by' => 'datetime',
            'escalated_at' => 'datetime',
            'decision_due' => 'datetime',
            'evidence_until' => 'datetime',
            'amount_on_hold' => 'integer',
            'released_amount' => 'integer',
            'refund_amount' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function against(): BelongsTo
    {
        return $this->belongsTo(User::class, 'against_user_id');
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function milestone(): BelongsTo
    {
        return $this->belongsTo(Milestone::class);
    }

    public function messages(): HasMany
    {
        return $this->hasMany(DisputeMessage::class)->orderBy('id');
    }

    public function files(): HasMany
    {
        return $this->hasMany(DisputeFile::class)->orderBy('id');
    }

    /** Still being sorted out: the milestone payment stays on hold. */
    public function isActive(): bool
    {
        return in_array($this->status, ['open', 'responded', 'fixing', 'escalated', 'under_review'], true);
    }
}
